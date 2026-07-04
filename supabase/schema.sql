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
