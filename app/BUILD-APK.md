# Сборка APK (Astra)

Веб-часть уже обёрнута в Android-проект через Capacitor (`app/android/`).
Папка `dist` (собранный сайт) лежит внутри APK и раздаётся локально на телефоне —
**интернет не нужен, сервер не нужен.** Осталось только скомпилировать APK
Android-инструментами. Два способа:

## Способ A — облако GitHub (без установки Android Studio) ⭐
APK соберётся на серверах GitHub, скачаешь готовый файл.

1. Завести бесплатный аккаунт на github.com, создать **публичный** репозиторий
   (напр. `astra`).
2. В папке проекта `C:\purba\astro_app` выполнить (в терминале, по одной):
   ```
   git init
   git add .
   git commit -m "Astra"
   git branch -M main
   git remote add origin https://github.com/ВАШ_ЛОГИН/astra.git
   git push -u origin main
   ```
3. На странице репозитория → вкладка **Actions** → workflow «Сборка Android APK»
   запустится сам (или нажать **Run workflow**).
4. Открыть завершённый запуск → внизу раздел **Artifacts** → скачать
   **`astra-apk`** (это `app-debug.apk`). Перекинуть на телефон, установить
   (разрешить «установку из неизвестных источников»).

Workflow уже готов: `.github/workflows/build-apk.yml`.

## Способ B — локально, Android Studio
1. Установить Android Studio (бесплатно, ~1 ГБ): developer.android.com/studio
2. Открыть в нём папку **`C:\purba\astro_app\app\android`**, дождаться Gradle sync.
3. Меню **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
4. Готовый файл:
   `app\android\app\build\outputs\apk\debug\app-debug.apk`.

## Если что-то меняем в приложении
Пересобрать веб и синхронизировать перед сборкой APK:
```
cd app
npm run build
npx cap sync android
```
(в облачном способе это делается автоматически при push).

## Подпись для публикации
Debug-APK годится для тестов и установки на телефон астролога. Для Play Store
(если понадобится) — отдельная release-сборка с ключом подписи; для sideload не нужно.
