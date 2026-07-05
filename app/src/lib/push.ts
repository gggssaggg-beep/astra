/**
 * Пуш-уведомления сообщества (FCM, слой 2 — docs/TASK_COMMUNITY_PUSH.md).
 * Регистрирует устройство в FCM и кладёт токен в device_tokens (Supabase);
 * серверная рассылка — Edge Function `push` по триггеру notifications.
 *
 * ВАЖНО: импорт плагина СТАТИЧЕСКИЙ (динамический import() виснет в
 * офлайн-WebView — урок reminders/haptics). Старый APK без плагина — мягкий
 * no-op через try/catch. Пуши — НАТИВНАЯ часть: нужен APK от 2026-07-06+.
 */
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { configured, initCommunityAuth, saveDeviceToken } from './community.ts';

let started = false;

export interface PushTapInfo { discussionId?: string; signature?: string }

/** Вызвать один раз при старте приложения. Регистрирует токен, когда есть
 *  сессия сообщества (и повторно при каждом входе). onTap — навигация по тапу. */
export function initPush(onTap?: (info: PushTapInfo) => void): void {
  if (started || !Capacitor.isNativePlatform() || !configured()) return;
  started = true;

  try {
    // токен выдан/обновлён системой → сохранить за текущим пользователем
    void PushNotifications.addListener('registration', ({ value }) => {
      void saveDeviceToken(value).catch(() => { /* нет сети — сохранится при следующем входе */ });
    });
    // тап по пушу: открыть тред/аспект (data-payload из Edge Function)
    void PushNotifications.addListener('pushNotificationActionPerformed', (e) => {
      const d = (e.notification.data ?? {}) as Record<string, string>;
      onTap?.({ discussionId: d.discussion_id || undefined, signature: d.signature || undefined });
    });

    // регистрируемся только при живой сессии (токен должен лечь под auth.uid)
    initCommunityAuth((session) => {
      if (!session) return;
      void (async () => {
        try {
          let perm = await PushNotifications.checkPermissions();
          if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions();
          if (perm.receive === 'granted') await PushNotifications.register();
        } catch { /* старый APK без плагина / отказ — тихо, ядро офлайн живёт */ }
      })();
    });
  } catch { /* старый APK без плагина */ }
}
