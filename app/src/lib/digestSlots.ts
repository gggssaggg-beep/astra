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
  managedTo: 1229,                    // конец нашего диапазона
} as const;

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

/** Что попадёт в строку сводки: сначала веские поводы (медленные грахи, смены
 *  периодов — вес 2), при равном весе — более раннее; сама строка потом читается
 *  ХРОНОЛОГИЧЕСКИ. Иначе полуночная смена накшатры вытесняла бы вход Сатурна в
 *  знак — событие месяцев. Западная сводка веса не различает (передаёт 1). */
export function pickDigest<T>(
  events: T[], weight: (e: T) => number, getMs: (e: T) => number, max = 6,
): T[] {
  return events.slice()
    .sort((a, b) => weight(b) - weight(a) || getMs(a) - getMs(b))
    .slice(0, max)
    .sort((a, b) => getMs(a) - getMs(b));
}

/** Заголовок сводки: один слот в сутки — «Сводка неба»; при twice — «Сводка
 *  дня» до полудня, иначе «Сводка на вечер и ночь». slotMinutesOfDay — минуты
 *  от МЕСТНОЙ полуночи (720 = полдень).
 *  Слова нарочно нейтральные: «сводка/небо/день/вечер» есть в обеих школах, а
 *  запрещённых в джйотише («аспект», «транзит», «натал») тут нет — один
 *  заголовок честно работает и в западных, и в ведических уведомлениях. */
export function digestTitle(twice: boolean, slotMinutesOfDay: number): string {
  if (!twice) return 'Сводка неба';
  return slotMinutesOfDay < 720 ? 'Сводка дня' : 'Сводка на вечер и ночь';
}
