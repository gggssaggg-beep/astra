/**
 * Кэш тяжёлых расчётов дня — ОБЩИЙ для экрана дня и чата. Аспекты/события
 * считаются WASM-бисекциями; движок детерминирован — пересчитывать нечего.
 * Раньше кэш жил в модуле DayScreen, а chat.ts считал те же сутки заново,
 * блокируя UI перед каждым сообщением.
 */
import type { Engine, DayAspects, DayEvent, AspectRecord, FigureHit } from '../engine/index.ts';
import { aspectsOn, eventsOn, detectFigures, figureWindow, isNodalAxisPair } from '../engine/index.ts';

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
const figCache = new Map<string, DayFigure[]>();

// объекты для ключа орбисов (настройка орбиса меняет результат); доп. объекты
// тоже здесь — иначе смена их орбиса не сбрасывала бы кэш дня
const ORB_KEY_ORDER = ['Луна', 'Солнце', 'Меркурий', 'Венера', 'Марс', 'Раху',
  'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Кету',
  'Хирон', 'Церера', 'Паллада', 'Юнона', 'Веста', 'Лилит'];

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

/** «Фигура дня» — детектированная фигура + окно её сборки-распада (пересечение
 *  интервалов рёбер, ЗАДАНИЕ §2.2). window=null — рёбра есть за сутки, но
 *  ОДНОВРЕМЕННО не стоят (фигура «заготовка», не собирается целиком). */
export interface DayFigure {
  hit: FigureHit<AspectRecord>;
  window: { begin: Date | null; end: Date | null } | null;
}

/** Фигуры суток с кэшем: рёбра = аспекты дня (все три ведра), точки = позиции
 *  в полдень (пустые пары/сторона бриллианта различаются с запасом — классы
 *  30°/150° отстоят на 120°, суточный ход их не путает). Ключ тот же, что у
 *  aspectsOnCached. */
export function figuresOnCached(
  E: Engine, dayStart: Date,
  orb: number | ((name: string) => number),
  objects?: string[] | null,
  nodalAxis = false,   // строить ли фигуры на оси узлов (Раху☍Кету); по умолч. нет
): DayFigure[] {
  const orbOf = typeof orb === 'function' ? orb : () => orb;
  const orbKey = ORB_KEY_ORDER.map((n) => orbOf(n)).join(',');
  const objKey = objects ? objects.join(',') : 'all';
  return cached(figCache, `${E.mode}|${dayStart.getTime()}|${orbKey}|${objKey}|${nodalAxis}`, () => {
    const day = aspectsOnCached(E, dayStart, orb, objects);
    let edges: AspectRecord[] = [...day.slow, ...day.fast, ...day.moon];
    // ось узлов всегда 180° — не считаем её ребром фигуры (иначе постоянный шум)
    if (!nodalAxis) edges = edges.filter((e) => !isNodalAxisPair(e.p1, e.p2));
    const noon = new Date(dayStart.getTime() + 12 * 3_600_000);
    const pts = E.positions(noon, objects ?? undefined).map((p) => ({ name: p.name, lon: p.lon }));
    return detectFigures(pts, edges).map((hit) => ({ hit, window: figureWindow(hit.edges) }));
  });
}
