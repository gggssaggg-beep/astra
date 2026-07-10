# Supabase — шаг 0: что нужно сделать владелице (один раз, ~20 минут)

Это подготовка к «Сообществу» (обсуждения аспектов, лайки, комменты) по плану
`docs/SUPABASE_PLAN.md`. Дальше всё кодит Claude — от вас нужны только эти клики.

## 1. Проект Supabase (~5 мин)

1. Зайти на **supabase.com** → Sign in → войти через GitHub (аккаунт gggssaggg-beep).
2. **New project**: организация — своя, имя проекта `astra`, пароль БД —
   сгенерировать и СОХРАНИТЬ (пригодится редко, но терять нельзя), регион —
   `Central EU (Frankfurt)` (ближайший). Тариф Free.
3. Когда проект создастся: **Project Settings → API**. Скопировать и прислать мне
   в чат два значения (они НЕ секретные, их можно в код):
   - `Project URL` (вида `https://xxxx.supabase.co`)
   - `anon public` ключ (длинная строка)

## 2. Google-вход (~10 мин)

1. Зайти на **console.cloud.google.com** (любой Google-аккаунт) →
   создать проект `astra` (верхняя панель → New Project).
2. Меню ☰ → **APIs & Services → OAuth consent screen**:
   - тип **External**, имя приложения `Astra`, свой e-mail; остальное по умолчанию,
     Save.
   - **Чтобы вход работал ДЛЯ ВСЕХ, а не только для добавленных подруг:**
     на этом же экране **Publishing status: Testing** → кнопка **PUBLISH APP** →
     подтвердить (**In production**). В режиме Testing входят ТОЛЬКО e-mail'ы из
     списка Test users (лимит 100) — все остальные видят «Доступ заблокирован».
   - Приложение просит только базовые данные (e-mail/профиль для входа), поэтому
     публикация в Production **НЕ требует проверки Google**. Единственный след:
     новый пользователь один раз увидит экран «Google не проверил это приложение»
     → **Дополнительно → Перейти на Astra** → войти (это нормально, приложение
     твоё). Чтобы убрать и это предупреждение — подать на верификацию Google
     (нужны политика конфиденциальности + подтверждение домена + ревью, дни);
     для небольшого сообщества это НЕ обязательно.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - тип **Web application**, имя `Astra Supabase`;
   - в **Authorized redirect URIs** добавить строку из Supabase:
     открыть в Supabase **Authentication → Sign In / Up → Google** — там написан
     Callback URL (вида `https://xxxx.supabase.co/auth/v1/callback`) — вставить его.
   - Create → показать **Client ID** и **Client secret**.
4. Вернуться в Supabase **Authentication → Sign In / Up → Google**: включить
   тумблер, вставить Client ID и Client secret, Save.

## 2b. URL приложения в Supabase (ОБЯЗАТЕЛЬНО для веб-входа)

Без этого веб-вход через Google кидает на `http://localhost:3000/?error=…
flow_state_already_used` — это дефолтный **Site URL** Supabase срабатывает как
фолбэк, потому что реальный адрес приложения не в списке разрешённых.

**Supabase → Authentication → URL Configuration:**
- **Site URL** → заменить дефолт `http://localhost:3000` на
  `https://gggssaggg-beep.github.io/astra/` (приложение на GitHub Pages живёт в
  подпапке `/astra/`, НЕ в корне домена).
- **Redirect URLs** → добавить (Add URL) три строки:
  - `https://gggssaggg-beep.github.io/astra/`
  - `https://gggssaggg-beep.github.io/astra/**`
  - `astra://auth` (deep link приложения-APK)
- Save. Код входа возвращает на `origin + pathname` (`webRedirect()` в
  `lib/community.ts`), поэтому адрес совпадёт с этим списком.

## 3. Прислать мне

- Project URL + anon key (из шага 1.3);
- «Google включила» (из шага 2.4);
- Ответы на 3 вопроса из конца `SUPABASE_PLAN.md` (чтение публично или только
  для вошедших; ник из Google или свой; ок ли публичная веб-версия).

После этого я делаю: SQL-схему, вход в приложении, блок «Обсуждения» в шторке
аспекта, ленту сообщества, лайки/комменты, деплой веб-версии на GitHub Pages.
