/**
 * Поиск точных моментов КОНКРЕТНОГО аспекта (пара p1/p2, тип) в диапазоне дат —
 * для функции «когда ещё случался этот аспект» (тап по аспекту → диапазон лет).
 *
 * Тот же корневой поиск по ЗНАКОВОЙ функции, что и `exactTime` в aspects.ts, но
 * прогоняется по всему диапазону. Отдельный модуль (использует только публичный
 * Engine.lon/toJD/fromJD) — чтобы НЕ трогать ядро aspects.ts и его парити-тесты.
 * Асинхронный, режется на куски (yield) — многолетний скан не подвешивает UI.
 */
import type { Engine } from './engine.ts';
import { ASPECTS } from './constants.ts';

const angdiff = (a: number, b: number): number => {
  const d = ((a - b) % 360 + 360) % 360;
  return d > 180 ? d - 360 : d;
};

// Знаковая функция f, чей ноль = точный аспект (согласована с aspects.ts).
function signedFn(E: Engine, n1: string, n2: string, target: number): (j: number) => number {
  const delta = (j: number) => angdiff(E.lon(j, n1), E.lon(j, n2));
  if (target === 0) return delta;
  if (target === 180) return (j) => angdiff(delta(j), 180);
  return (j) => Math.abs(delta(j)) - target;
}

// То же, но ВТОРОЕ тело — ФИКСИРОВАННАЯ долгота (натальная точка): движущаяся
// планета `n1` против неподвижного `fixedLon`. Для «натив+транзит» — когда
// транзитная планета делает аспект к натальному градусу.
function signedFnPoint(E: Engine, n1: string, fixedLon: number, target: number): (j: number) => number {
  const delta = (j: number) => angdiff(E.lon(j, n1), fixedLon);
  if (target === 0) return delta;
  if (target === 180) return (j) => angdiff(delta(j), 180);
  return (j) => Math.abs(delta(j)) - target;
}

export interface AspectOccurrence { exact: Date; jd: number; begin: Date; end: Date; }

/** Края окна орбиса вокруг точного момента jd: где |f| = orb (аспект — ИНТЕРВАЛ,
 *  вход→точно→выход, требование астролога). |f| = отклонение от точного (°). */
function windowEdges(f: (j: number) => number, jd: number, orb: number, fast: boolean): { begin: number; end: number } {
  const g = (j: number) => Math.abs(f(j)) - orb;   // <0 внутри окна, >0 снаружи
  const step = fast ? 1 / 48 : 1 / 8;              // Луна — 30мин, планеты — 3ч
  const walk = (dir: 1 | -1): number => {
    let inside = jd, outside = jd + dir * step, guard = 0;
    // шагаем наружу, пока не выйдем из орбиса (кап — чтоб длинные окна не зациклили)
    while (g(outside) < 0 && guard < 400) { inside = outside; outside += dir * step; guard++; }
    let lo = inside, hi = outside;
    for (let i = 0; i < 32; i++) { const mid = (lo + hi) / 2; if (g(mid) < 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  return { begin: walk(-1), end: walk(1) };
}

/**
 * Все точные моменты аспекта (пара p1/p2, тип `aspect`) в [from, to] + окно
 * орбиса каждого (вход/выход). Шаг сетки адаптивен: с Луной — 1ч (быстрая), иначе
 * 6ч (планеты). При смене знака f уточняем момент делением пополам (как exactTime).
 * `orb` — орбис пары (больший из двух). Результат ограничен maxResults.
 */
export async function findAspectOccurrences(
  E: Engine, p1: string, p2: string, aspect: string,
  from: Date, to: Date, orb = 1, maxResults = 120,
): Promise<{ list: AspectOccurrence[]; truncated: boolean }> {
  const spec = (ASPECTS as Record<string, { angle: number; symbol: string }>)[aspect];
  if (!spec || to <= from) return { list: [], truncated: false };
  const f = signedFn(E, p1, p2, spec.angle);
  const jdFrom = E.toJD(from), jdTo = E.toJD(to);
  const fast = p1 === 'Луна' || p2 === 'Луна';
  const step = fast ? 1 / 24 : 0.25; // Луна — 1ч, планеты — 6ч

  const out: AspectOccurrence[] = [];
  let prevJ = jdFrom, prevV = f(jdFrom), sinceYield = 0;
  for (let j = jdFrom + step; j <= jdTo; j += step) {
    const v = f(j);
    // смена знака (и не «скачок через 180°» — как в aspects.ts) ⇒ есть корень
    if ((prevV <= 0) !== (v <= 0) && Math.abs(prevV - v) < 30) {
      let lo = prevJ, hi = j;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if ((f(lo) <= 0) !== (f(mid) <= 0)) hi = mid; else lo = mid;
      }
      const jd = (lo + hi) / 2;
      const w = windowEdges(f, jd, orb, fast);
      out.push({ jd, exact: E.fromJD(jd), begin: E.fromJD(w.begin), end: E.fromJD(w.end) });
      if (out.length >= maxResults) return { list: out, truncated: true };
    }
    prevJ = j; prevV = v;
    // передышка почаще: 4000 шагов × 2 WASM-вызова держали главный поток
    // сотни мс — кнопка «Ищу…» и анимации замирали (жалоба «нет плавности»)
    if (++sinceYield >= 500) { sinceYield = 0; await new Promise((r) => setTimeout(r, 0)); }
  }
  return { list: out, truncated: false };
}

/**
 * «Натив + транзит»: все моменты, когда ТРАНЗИТНАЯ планета `planet` делает аспект
 * `aspect` к НЕПОДВИЖНОЙ долготе `fixedLon` (натальный градус) в [from, to].
 * Именно это нужно в совмещённых картах: аспект строки — планета×натальная точка,
 * а не два транзитных тела (жалоба владелицы 2026-07-09). Возвращает те же
 * AspectOccurrence (вход→точно→выход), что и findAspectOccurrences.
 */
export async function findAspectToPoint(
  E: Engine, planet: string, fixedLon: number, aspect: string,
  from: Date, to: Date, orb = 1, maxResults = 120,
): Promise<{ list: AspectOccurrence[]; truncated: boolean }> {
  const spec = (ASPECTS as Record<string, { angle: number; symbol: string }>)[aspect];
  if (!spec || to <= from) return { list: [], truncated: false };
  const f = signedFnPoint(E, planet, fixedLon, spec.angle);
  const jdFrom = E.toJD(from), jdTo = E.toJD(to);
  const fast = planet === 'Луна';
  const step = fast ? 1 / 24 : 0.25; // Луна — 1ч, планеты — 6ч

  const out: AspectOccurrence[] = [];
  let prevJ = jdFrom, prevV = f(jdFrom), sinceYield = 0;
  for (let j = jdFrom + step; j <= jdTo; j += step) {
    const v = f(j);
    if ((prevV <= 0) !== (v <= 0) && Math.abs(prevV - v) < 30) {
      let lo = prevJ, hi = j;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if ((f(lo) <= 0) !== (f(mid) <= 0)) hi = mid; else lo = mid;
      }
      const jd = (lo + hi) / 2;
      const w = windowEdges(f, jd, orb, fast);
      out.push({ jd, exact: E.fromJD(jd), begin: E.fromJD(w.begin), end: E.fromJD(w.end) });
      if (out.length >= maxResults) return { list: out, truncated: true };
    }
    prevJ = j; prevV = v;
    if (++sinceYield >= 500) { sinceYield = 0; await new Promise((r) => setTimeout(r, 0)); }
  }
  return { list: out, truncated: false };
}
