/**
 * Уведомления (§3.4, §10.5). На УСТРОЙСТВЕ (Android/Capacitor) — реальные
 * локальные уведомления через @capacitor/local-notifications: заранее вычисляем
 * точные времена аспектов/ежедневной сводки и планируем их (ОС поднимет сама,
 * фоновый процесс не нужен). Этот модуль — веб-вариант: проверка разрешения и
 * «тест» (демонстрация + хаптик), т.к. браузер не даёт надёжного фонового
 * расписания. Контракт сохранится — на сборке APK подменим реализацию.
 */

export const notifyAvailable = (): boolean =>
  typeof Notification !== 'undefined';

export function notifyPermission(): NotificationPermission | 'unsupported' {
  return notifyAvailable() ? Notification.permission : 'unsupported';
}

export async function requestNotify(): Promise<NotificationPermission | 'unsupported'> {
  if (!notifyAvailable()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

/** Хаптик — на устройстве Capacitor Haptics; в вебе navigator.vibrate (§10.5). */
export function buzz(ms = 60): void {
  try { navigator.vibrate?.(ms); } catch { /* нет вибро */ }
}

/** Тестовое уведомление сейчас (демо, что всё работает; §10.5 с подсказкой). */
export async function testNotify(title: string, body: string): Promise<string> {
  buzz();
  const perm = await requestNotify();
  if (perm === 'unsupported') return 'Браузер не поддерживает уведомления (на телефоне будут работать).';
  if (perm !== 'granted') return 'Разрешение на уведомления не выдано.';
  try {
    new Notification(title, { body, silent: false });
    return 'Уведомление отправлено ✓ (и вибро, если устройство поддерживает).';
  } catch {
    return 'Не удалось показать уведомление в этом окружении (на телефоне сработает).';
  }
}
