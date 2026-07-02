/**
 * Лёгкая тактильная отдача (уют, просьба владелицы 2026-07-02). Работает через
 * navigator.vibrate — Android WebView его понимает, отдельный плагин не нужен
 * (значит, edет через OTA без нового APK). В браузере без вибро — тихий no-op.
 *
 * Дозировка — «щелчки», не жужжание: короткие 10–25 мс. Не вешать на каждый тап —
 * только на смысловые действия (перелистнуть день, закрыть шторку, сохранить).
 */
const canBuzz = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** Лёгкий «щелчок» — перелистывание дня, закрытие шторки свайпом, выбор даты. */
export const tick = (): void => { try { if (canBuzz()) navigator.vibrate(12); } catch { /* нет вибро */ } };

/** Заметный отклик — переключатель «отслеживать», важный тумблер. */
export const tap = (): void => { try { if (canBuzz()) navigator.vibrate(24); } catch { /* нет вибро */ } };

/** Двойной «готово» — заметка сохранена, миф подгружен. */
export const success = (): void => { try { if (canBuzz()) navigator.vibrate([14, 60, 20]); } catch { /* нет вибро */ } };
