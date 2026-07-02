/**
 * Тактильная отдача (уют, просьба владелицы 2026-07-02). Основной путь —
 * НАТИВНЫЙ @capacitor/haptics (системный Vibrator): короткие 10–25 мс через
 * navigator.vibrate многие прошивки (Xiaomi и др.) молча игнорируют —
 * «вибрации нет» (жалоба 2026-07-03). Нужен APK с плагином; старый APK и веб
 * мягко падают на удлинённый navigator.vibrate.
 *
 * Дозировка — «щелчки», не жужжание. Не вешать на каждый тап — только на
 * смысловые действия (перелистнуть день, закрыть шторку, сохранить).
 */
import { Capacitor } from '@capacitor/core';

const NATIVE = Capacitor.isNativePlatform();

let mod: typeof import('@capacitor/haptics') | null | undefined; // undefined = не пробовали
async function hp() {
  if (mod !== undefined) return mod;
  try { mod = await import('@capacitor/haptics'); } catch { mod = null; }
  return mod;
}

const vibrate = (pattern: number | number[]): void => {
  try { navigator.vibrate?.(pattern); } catch { /* нет вибро */ }
};

async function impact(style: 'LIGHT' | 'MEDIUM', fallback: number | number[]): Promise<void> {
  if (NATIVE) {
    const m = await hp();
    if (m) {
      try {
        await m.Haptics.impact({ style: style === 'LIGHT' ? m.ImpactStyle.Light : m.ImpactStyle.Medium });
        return;
      } catch { /* плагина нет в этом APK — фолбэк ниже */ }
    }
  }
  vibrate(fallback);
}

/** Лёгкий «щелчок» — перелистывание дня, закрытие шторки свайпом, выбор даты. */
export const tick = (): void => { void impact('LIGHT', 20); };

/** Заметный отклик — переключатель «отслеживать», важный тумблер. */
export const tap = (): void => { void impact('MEDIUM', 35); };

/** Двойной «готово» — заметка сохранена, миф подгружен. */
export const success = (): void => {
  void (async () => {
    if (NATIVE) {
      const m = await hp();
      if (m) {
        try { await m.Haptics.notification({ type: m.NotificationType.Success }); return; }
        catch { /* фолбэк ниже */ }
      }
    }
    vibrate([20, 60, 30]);
  })();
};
