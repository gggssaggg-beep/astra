# ЗАДАНИЕ: пуш-уведомления сообщества (слой 2, поверх подписок)

Владелица выбрала **живой пуш даже когда приложение закрыто** и события:
ответ в моей ветке · ответ в подписанной ветке · активность того, на кого
подписана · лайки моих записей (AskUserQuestion, 2026-07-04).

Слой 1 УЖЕ сделан и приезжает по OTA: таблицы `follows` / `thread_subs`
(+ автоподписка триггерами), функции в `lib/community.ts` (follow / getProfileCard
/ subscribeThread / isSubscribed), UI карточки пользователя и подписки. Пуш
строится ПОВЕРХ этого.

## Почему это отдельный слой (нужны действия владелицы)

Настоящий пуш при закрытом приложении = FCM (Firebase Cloud Messaging) +
серверная отправка. Это НЕ OTA: нужен НОВЫЙ APK (нативный плагин
`@capacitor/push-notifications` + `google-services.json`) и настройка в консолях.

## Шаги владелицы (без них слой 2 не заработает)

1. **Firebase**: создать проект (бесплатный Spark), добавить Android-приложение
   с package `app.astra.sky`. Скачать `google-services.json`.
2. Положить `google-services.json` в `app/android/app/` (в репо; это не секрет).
3. **FCM v1**: в Firebase → Project Settings → Service accounts → сгенерировать
   приватный ключ (JSON). Это СЕКРЕТ.
4. **Supabase**: положить ключ сервис-аккаунта в секреты проекта
   (`supabase secrets set FCM_SERVICE_ACCOUNT=@ключ.json`), развернуть Edge
   Function (ниже), прогнать SQL слоя 2.

## Фаза A — схема (SQL, `supabase/schema.sql`)

```sql
-- FCM-токены устройств (одно на устройство; у юзера может быть несколько)
create table if not exists public.device_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.device_tokens enable row level security;
create policy "device_tokens: свои" on public.device_tokens
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Очередь уведомлений (для «колокольчика» в приложении + отправки пушем)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null,          -- reply_own | reply_sub | follow_activity | like
  discussion_id uuid references public.discussions(id) on delete cascade,
  aspect_signature text,
  body text not null default '',
  read boolean not null default false,
  pushed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notif_recipient_idx on public.notifications (recipient_id, created_at desc);
alter table public.notifications enable row level security;
create policy "notifications: свои читать" on public.notifications
  for select to authenticated using (auth.uid() = recipient_id);
create policy "notifications: свои помечать" on public.notifications
  for update to authenticated using (auth.uid() = recipient_id);
```

Плюс триггеры-«разводящие» (security definer), раскладывающие события по
получателям, НЕ уведомляя автора действия о самом себе:

- **на новый `comment`**: получатели = все `thread_subs` этой ветки (kind
  `reply_own`, если получатель — автор темы; иначе `reply_sub`) + подписчики
  автора комментария из `follows` (kind `follow_activity`), минус сам автор.
- **на новую `discussion`**: подписчики автора (`follow_activity`).
- **на новый `like`**: автор целевой темы/коммента (`like`), кроме себя.

(Тела триггеров — по образцу `auto_sub_comment`; вставляют строки в
`notifications`. Каждая вставка помечает `pushed=false` — Edge Function их
разошлёт и проставит `pushed=true`.)

## Фаза B — Edge Function `push` (Supabase, Deno)

- Триггер `after insert on notifications` вызывает `pg_net`/`http` → Edge
  Function ЛИБО функция крутится по расписанию и добирает `pushed=false`.
- Функция: берёт `device_tokens` получателя, шлёт FCM v1 (`https://fcm.googleapis.
  com/v1/projects/<id>/messages:send`) с OAuth от сервис-аккаунта; заголовок/тело
  из `notifications`; data-payload = `{ dayAnchor?, signature?, discussion_id }`
  для навигации по тапу. Ставит `pushed=true`.

## Фаза C — клиент (новый APK)

- `npm i @capacitor/push-notifications`; `npx cap sync`.
- `lib/push.ts`: запросить разрешение (переиспользовать логику reminders),
  `PushNotifications.register()`, по `registration` — upsert токена в
  `device_tokens`; `pushNotificationActionPerformed` → та же навигация, что и у
  локальных (`openFromNotification` в App.svelte: `dayAnchor`+`signature`).
- Внутри приложения — «колокольчик» со списком из `notifications` (бейдж
  непрочитанных, тап → тред/аспект, пометка read).

## Проверка

- Токен появляется в `device_tokens` после входа.
- Коммент в подписанной ветке с другого аккаунта → строка в `notifications`,
  затем пуш на телефон (даже при закрытом приложении).
- Тап по пушу открывает нужный день+аспект / нужный тред.

## Осторожно

- Не слать пуш автору собственного действия.
- FCM v1 (не legacy) — legacy отключён Google в 2024.
- Разрешение POST_NOTIFICATIONS уже просится тумблерами напоминаний — переиспользовать.
