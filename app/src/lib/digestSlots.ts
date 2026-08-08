/**
 * Слот-логика сводок уведомлений (раскладка событий по слотам «раз/дважды в
 * сутки», ID-диапазоны). Чистые функции без Capacitor/движка — тестируются в
 * Node по образцу quiet.ts (reminders.ts тянет нативный плагин и в Node не
 * грузится). Самая жалобная подсистема — здесь она под тестом.
 */

/** ID-диапазоны управляемых уведомлений — единый источник правды. Управляемый
 *  диапазон 1000..1229 reminders.ts отменяет и пере-ставит целиком. */
export const IDS = {
  dailyFrom: 1000, dailyTo: 1029,     // сводки-слоты (раз/дважды в сутки × дней)
  aspectFrom: 1030, aspectTo: 1129,   // моменты точных аспектов
  transitFrom: 1130, transitTo: 1229, // транзиты к натальной карте
  managedTo: 1229,                    // конец ПЕРВОГО управляемого диапазона
  // Джйотиш (раунд 2, §5) — своя полоса, ЗА «доступна новая версия» (1250),
  // чтобы отмена управляемых не сносила его заодно.
  panchangaFrom: 1300, panchangaTo: 1329,   // сводки панчанги дня
  vedicFrom: 1330, vedicTo: 1399,           // важные даты карты (даши, гочара)
} as const;

/** Наше ли это уведомление (его можно снести и переставить). Две полосы:
 *  западная 1000..1229 и ведическая 1300..1399; между ними 1250 —
 *  «доступна новая версия», его трогать нельзя. */
export const isManagedId = (id: number): boolean =>
  (id >= IDS.dailyFrom && id <= IDS.managedTo)
  || (id >= IDS.panchangaFrom && id <= IDS.vedicTo);

/** Времена слотов сводок (UTC-ms), отсортированы по возрастанию. Для каждого
 *  дня: утренний слот (morningMin от местной полуночи) + при twice — вечерний
 *  (eveningMin). Вызывающий передаёт dayStartsMs = местные полуночи в UTC-ms
 *  (перевод пояса/DST — на стороне reminders через zonedDayStartUTC). */
export function digestSlots(
  dayStartsMs: number[], morningMin: number, eveningMin: number, twice: boolean,
): number[] {
  const slots: number[] = [];
  for (const ds of dayStartsMs) {
    slots.push(ds + morningMin * 60_000);
    if (twice) slots.push(ds + eveningMin * 60_000);
  }
  return slots.sort((a, b) => a - b);
}

/** События слота — окно [slotAt → nextSlotAt); у последнего слота конец = +24 ч.
 *  Событие принадлежит слоту, если slotAt ≤ время < конец. Так вечерний слот
 *  забирает НОЧНЫЕ события — до утреннего слота следующего дня (просьба
 *  владелицы). getMs достаёт момент события в UTC-ms (аспект/станция). */
export function inSlot<T>(
  events: T[], getMs: (e: T) => number, slotAt: number, nextSlotAt: number | undefined,
): T[] {
  const end = nextSlotAt ?? slotAt + 86_400_000;
  return events.filter((e) => { const t = getMs(e); return t >= slotAt && t < end; });
}

/** Заголовок сводки: один слот в сутки — «Сводка неба»; при twice — «Сводка
 *  дня» до полудня, иначе «Сводка на вечер и ночь». slotMinutesOfDay — минуты
 *  от МЕСТНОЙ полуночи (720 = полдень). */
export function digestTitle(twice: boolean, slotMinutesOfDay: number): string {
  if (!twice) return 'Сводка неба';
  return slotMinutesOfDay < 720 ? 'Сводка дня' : 'Сводка на вечер и ночь';
}
