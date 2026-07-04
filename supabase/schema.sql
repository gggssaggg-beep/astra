-- «Сообщество» Astra: обсуждения аспектов, комментарии, лайки.
-- Выполнить один раз в Supabase → SQL Editor (см. docs/SUPABASE_SETUP.md).

-- Профили (заводятся приложением после первого входа через Google)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles: читают вошедшие" on public.profiles
  for select to authenticated using (true);
create policy "profiles: завести свой" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "profiles: править свой" on public.profiles
  for update to authenticated using (auth.uid() = id);

-- Обсуждения (aspect_signature — сигнатура пары+аспекта из приложения; null = общая тема)
create table if not exists public.discussions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  aspect_signature text,
  exact_at timestamptz,
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists discussions_sig_idx on public.discussions (aspect_signature, created_at desc);
create index if not exists discussions_created_idx on public.discussions (created_at desc);
alter table public.discussions enable row level security;
create policy "discussions: читают вошедшие" on public.discussions
  for select to authenticated using (true);
create policy "discussions: писать своё" on public.discussions
  for insert to authenticated with check (auth.uid() = author_id);
create policy "discussions: править своё" on public.discussions
  for update to authenticated using (auth.uid() = author_id);
-- Удалять тему может АВТОР или АДМИН (владелица проекта — по email).
-- drop+create делает повторный прогон схемы идемпотентным.
drop policy if exists "discussions: удалять своё" on public.discussions;
drop policy if exists "discussions: удалять своё или админом" on public.discussions;
create policy "discussions: удалять своё или админом" on public.discussions
  for delete to authenticated
  using (auth.uid() = author_id or (auth.jwt() ->> 'email') = 'ggg.ssa.ggg@gmail.com');

-- Комментарии
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.discussions(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists comments_disc_idx on public.comments (discussion_id, created_at);
alter table public.comments enable row level security;
create policy "comments: читают вошедшие" on public.comments
  for select to authenticated using (true);
create policy "comments: писать своё" on public.comments
  for insert to authenticated with check (auth.uid() = author_id);
-- Удалять комментарий может АВТОР или АДМИН (владелица — по email).
drop policy if exists "comments: удалять своё" on public.comments;
drop policy if exists "comments: удалять своё или админом" on public.comments;
create policy "comments: удалять своё или админом" on public.comments
  for delete to authenticated
  using (auth.uid() = author_id or (auth.jwt() ->> 'email') = 'ggg.ssa.ggg@gmail.com');

-- Лайки (полиморфные: обсуждение или комментарий; один лайк на пользователя)
create table if not exists public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_kind text not null check (target_kind in ('discussion', 'comment')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_kind, target_id)
);
create index if not exists likes_target_idx on public.likes (target_kind, target_id);
alter table public.likes enable row level security;
create policy "likes: читают вошедшие" on public.likes
  for select to authenticated using (true);
create policy "likes: ставить свой" on public.likes
  for insert to authenticated with check (auth.uid() = user_id);
create policy "likes: снимать свой" on public.likes
  for delete to authenticated using (auth.uid() = user_id);

-- Подписки на ПОЛЬЗОВАТЕЛЕЙ (follow): follower видит активность followee.
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id);
alter table public.follows enable row level security;
create policy "follows: читают вошедшие" on public.follows
  for select to authenticated using (true);
create policy "follows: подписываться самому" on public.follows
  for insert to authenticated with check (auth.uid() = follower_id);
create policy "follows: отписываться самому" on public.follows
  for delete to authenticated using (auth.uid() = follower_id);

-- Подписки на ВЕТКИ (thread): уведомлять о новых комментариях в теме. Автор темы
-- и любой комментатор подписываются автоматически (триггеры ниже); можно отписаться.
create table if not exists public.thread_subs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  discussion_id uuid not null references public.discussions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, discussion_id)
);
create index if not exists thread_subs_disc_idx on public.thread_subs (discussion_id);
alter table public.thread_subs enable row level security;
create policy "thread_subs: читают вошедшие" on public.thread_subs
  for select to authenticated using (true);
create policy "thread_subs: подписываться самому" on public.thread_subs
  for insert to authenticated with check (auth.uid() = user_id);
create policy "thread_subs: отписываться самому" on public.thread_subs
  for delete to authenticated using (auth.uid() = user_id);

-- Автоподписка: создал тему или прокомментировал → подписан на ветку.
-- security definer, чтобы вставка прошла под RLS (проверяем автора вручную).
create or replace function public.auto_sub_discussion() returns trigger
  language plpgsql security definer as $$
begin
  insert into public.thread_subs (user_id, discussion_id)
  values (new.author_id, new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists trg_auto_sub_discussion on public.discussions;
create trigger trg_auto_sub_discussion after insert on public.discussions
  for each row execute function public.auto_sub_discussion();

create or replace function public.auto_sub_comment() returns trigger
  language plpgsql security definer as $$
begin
  insert into public.thread_subs (user_id, discussion_id)
  values (new.author_id, new.discussion_id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists trg_auto_sub_comment on public.comments;
create trigger trg_auto_sub_comment after insert on public.comments
  for each row execute function public.auto_sub_comment();
