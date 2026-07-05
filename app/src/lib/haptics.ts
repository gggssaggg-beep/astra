/**
 * Тактильная отдача (уют, просьба владелицы 2026-07-02). Основной путь —
 * НАТИВНЫЙ @capacitor/haptics (системный Vibrator): короткие 10–25 мс через
 * navigator.vibrate многие прошивки (Xiaomi и др.) молча игнорируют —
 * «вибрации нет» (жалоба 2026-07-03). Нужен APK с плагином; старый APK и веб
 * мягко падают на удлинённый navigator.vibrate.
 *
 * ВАЖНО: импорт плагина — СТАТИЧЕСКИЙ. Динамический import() ленивого чанка
 * виснет в офлайн-WebView (тот же корень, что чинили в reminders.ts
 * 2026-07-04) — из-за него хаптика молча не работала.
 *
 * Дозировка — «щелчки», не жужжание. Не вешать на каждый тап — только на
 * смысловые действия (перелистнуть день, закрыть шторку, сохранить).
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const NATIVE = Capacitor.isNativePlatform();

const vibrate = (pattern: number | number[]): void => {
  try { navigator.vibrate?.(pattern); } catch { /* нет вибро */ }
};

async function impact(style: 'LIGHT' | 'MEDIUM', fallback: number | number[]): Promise<void> {
  if (NATIVE) {
    try {
      await Haptics.impact({ style: style === 'LIGHT' ? ImpactStyle.Light : ImpactStyle.Medium });
      return;
    } catch { /* плагина нет в этом APK — фолбэк ниже */ }
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
      try { await Haptics.notification({ type: NotificationType.Success }); return; }
      catch { /* фолбэк ниже */ }
    }
    vibrate([20, 60, 30]);
  })();
};
