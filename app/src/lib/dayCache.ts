/**
 * Кэш тяжёлых расчётов дня — ОБЩИЙ для экрана дня и чата. Аспекты/события
 * считаются WASM-бисекциями; движок детерминирован — пересчитывать нечего.
 * Раньше кэш жил в модуле DayScreen, а chat.ts считал те же сутки заново,
 * блокируя UI перед каждым сообщением.
 */
import type { Engine, DayAspects, DayEvent } from '../engine/index.ts';
import { aspectsOn, eventsOn } from '../engine/index.ts';

const CACHE_MAX = 48;
function cached<T>(map: Map<string, T>, key: string, make: () => T): T {
  const hit = map.get(key);
  if (hit !== undefined) return hit;
  const v = make();
  map.set(key, v);
  if (map.size > CACHE_MAX) map.delete(map.keys().next().value!); // FIFO-обрезка
  return v;
}
const aspCache = new Map<string, DayAspects>();
const evCache = new Map<string, DayEvent[]>();

// базовые объекты для ключа орбисов (настройка орбиса меняет результат)
const ORB_KEY_ORDER = ['Луна', 'Солнце', 'Меркурий', 'Венера', 'Марс', 'Раху',
  'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Кету'];

/** Аспекты суток с кэшем. `orb` — резолвер или общий орбис числом. */
export function aspectsOnCached(
  E: Engine, dayStart: Date,
  orb: number | ((name: string) => number),
  objects?: string[] | null,
): DayAspects {
  const orbOf = typeof orb === 'function' ? orb : () => orb;
  const orbKey = ORB_KEY_ORDER.map((n) => orbOf(n)).join(',');
  const objKey = objects ? objects.join(',') : 'all';
  return cached(aspCache, `${E.mode}|${dayStart.getTime()}|${orbKey}|${objKey}`,
    () => aspectsOn(E, dayStart, orb, true, objects ?? undefined));
}

/** События суток (ингрессии/станции/лунации/затмения) с кэшем. */
export function eventsOnCached(E: Engine, dayStart: Date): DayEvent[] {
  return cached(evCache, `${E.mode}|${dayStart.getTime()}`, () => eventsOn(E, dayStart));
}
