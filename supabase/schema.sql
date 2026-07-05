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
drop policy if exists "profiles: читают вошедшие" on public.profiles;
create policy "profiles: читают вошедшие" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles: завести свой" on public.profiles;
create policy "profiles: завести свой" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
drop policy if exists "profiles: править свой" on public.profiles;
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
drop policy if exists "discussions: читают вошедшие" on public.discussions;
create policy "discussions: читают вошедшие" on public.discussions
  for select to authenticated using (true);
drop policy if exists "discussions: писать своё" on public.discussions;
create policy "discussions: писать своё" on public.discussions
  for insert to authenticated with check (auth.uid() = author_id);
drop policy if exists "discussions: править своё" on public.discussions;
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
drop policy if exists "comments: читают вошедшие" on public.comments;
create policy "comments: читают вошедшие" on public.comments
  for select to authenticated using (true);
drop policy if exists "comments: писать своё" on public.comments;
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
drop policy if exists "likes: читают вошедшие" on public.likes;
create policy "likes: читают вошедшие" on public.likes
  for select to authenticated using (true);
drop policy if exists "likes: ставить свой" on public.likes;
create policy "likes: ставить свой" on public.likes
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "likes: снимать свой" on public.likes;
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
drop policy if exists "follows: читают вошедшие" on public.follows;
create policy "follows: читают вошедшие" on public.follows
  for select to authenticated using (true);
drop policy if exists "follows: подписываться самому" on public.follows;
create policy "follows: подписываться самому" on public.follows
  for insert to authenticated with check (auth.uid() = follower_id);
drop policy if exists "follows: отписываться самому" on public.follows;
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
drop policy if exists "thread_subs: читают вошедшие" on public.thread_subs;
create policy "thread_subs: читают вошедшие" on public.thread_subs
  for select to authenticated using (true);
drop policy if exists "thread_subs: подписываться самому" on public.thread_subs;
create policy "thread_subs: подписываться самому" on public.thread_subs
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "thread_subs: отписываться самому" on public.thread_subs;
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

-- Уведомления сообщества (колокольчик В ПРИЛОЖЕНИИ; пуш на закрытое приложение —
-- отдельный слой FCM, docs/TASK_COMMUNITY_PUSH.md, читает те же строки).
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null,                 -- reply_own | reply_sub | follow_activity | like
  discussion_id uuid references public.discussions(id) on delete cascade,
  aspect_signature text,
  body text not null default '',
  read boolean not null default false,
  pushed boolean not null default false,   -- для будущего FCM-слоя
  created_at timestamptz not null default now()
);
create index if not exists notif_recipient_idx on public.notifications (recipient_id, read, created_at desc);
alter table public.notifications enable row level security;
-- вставляют ТОЛЬКО триггеры (security definer) → insert-политики для юзеров нет
drop policy if exists "notifications: свои читать" on public.notifications;
create policy "notifications: свои читать" on public.notifications
  for select to authenticated using (auth.uid() = recipient_id);
drop policy if exists "notifications: свои помечать" on public.notifications;
create policy "notifications: свои помечать" on public.notifications
  for update to authenticated using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
drop policy if exists "notifications: свои удалять" on public.notifications;
create policy "notifications: свои удалять" on public.notifications
  for delete to authenticated using (auth.uid() = recipient_id);

-- Новый комментарий → подписчикам ветки (ответ в моей/подписанной) + подписчикам
-- автора коммента (активность подписки), кроме самого автора и без дублей.
create or replace function public.notify_comment() returns trigger
  language plpgsql security definer as $$
declare disc record;
begin
  select id, author_id, aspect_signature into disc from public.discussions where id = new.discussion_id;
  insert into public.notifications (recipient_id, actor_id, kind, discussion_id, aspect_signature, body)
  select s.user_id, new.author_id,
         case when s.user_id = disc.author_id then 'reply_own' else 'reply_sub' end,
         disc.id, disc.aspect_signature, left(new.body, 140)
  from public.thread_subs s
  where s.discussion_id = new.discussion_id and s.user_id <> new.author_id;
  insert into public.notifications (recipient_id, actor_id, kind, discussion_id, aspect_signature, body)
  select f.follower_id, new.author_id, 'follow_activity', disc.id, disc.aspect_signature, left(new.body, 140)
  from public.follows f
  where f.followee_id = new.author_id and f.follower_id <> new.author_id
    and f.follower_id not in (select user_id from public.thread_subs where discussion_id = new.discussion_id);
  return new;
end $$;
drop trigger if exists trg_notify_comment on public.comments;
create trigger trg_notify_comment after insert on public.comments
  for each row execute function public.notify_comment();

-- Новая тема → подписчикам автора (активность того, на кого подписана).
create or replace function public.notify_discussion() returns trigger
  language plpgsql security definer as $$
begin
  insert into public.notifications (recipient_id, actor_id, kind, discussion_id, aspect_signature, body)
  select f.follower_id, new.author_id, 'follow_activity', new.id, new.aspect_signature, left(new.title, 140)
  from public.follows f
  where f.followee_id = new.author_id and f.follower_id <> new.author_id;
  return new;
end $$;
drop trigger if exists trg_notify_discussion on public.discussions;
create trigger trg_notify_discussion after insert on public.discussions
  for each row execute function public.notify_discussion();

-- Лайк → автору темы/комментария (кроме себя).
create or replace function public.notify_like() returns trigger
  language plpgsql security definer as $$
declare owner uuid; disc uuid; sig text;
begin
  if new.target_kind = 'discussion' then
    select author_id, id, aspect_signature into owner, disc, sig
      from public.discussions where id = new.target_id;
  else
    select c.author_id, c.discussion_id, d.aspect_signature into owner, disc, sig
      from public.comments c join public.discussions d on d.id = c.discussion_id
      where c.id = new.target_id;
  end if;
  if owner is not null and owner <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, kind, discussion_id, aspect_signature, body)
    values (owner, new.user_id, 'like', disc, sig, '');
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_like on public.likes;
create trigger trg_notify_like after insert on public.likes
  for each row execute function public.notify_like();

-- ============================================================================
-- СЛОЙ 2: пуш-уведомления FCM (2026-07-06). Работает ПОВЕРХ notifications:
-- триггер зовёт Edge Function `push`, та шлёт FCM v1 на токены получателя.
-- ============================================================================

-- FCM-токены устройств (одно на устройство; у юзера может быть несколько)
create table if not exists public.device_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.device_tokens enable row level security;
drop policy if exists "device_tokens: свои" on public.device_tokens;
create policy "device_tokens: свои" on public.device_tokens
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Вызов Edge Function на каждую новую строку notifications (pg_net, асинхронно).
-- Заголовок x-push-key — простая защита от постороннего вызова; функция сама
-- читает строку по id и шлёт только pushed=false (повторная отправка невозможна).
create extension if not exists pg_net;
create or replace function public.call_push() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://vbaysgzdvdyljlwlnivq.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-push-key', 'astra-push-7c41d9ae'),
    body := jsonb_build_object('id', new.id)
  );
  return new;
exception when others then
  return new;   -- пуш не должен ломать вставку уведомления
end $$;
drop trigger if exists trg_call_push on public.notifications;
create trigger trg_call_push after insert on public.notifications
  for each row execute function public.call_push();
