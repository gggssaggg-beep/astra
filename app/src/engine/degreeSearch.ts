/**
 * Поиск прохождения планеты через ГРАДУС (раунд 29 §5): «когда Венера была в
 * 27°56′ Льва в 2020–2030». Целевая долгота = знак×30 + градус + минуты; сканер
 * шагает по эфемеридам и уточняет корень (та же техника root-finding по ЗНАКОВОЙ
 * функции, что и точный аспект в aspectSearch.ts).
 *
 * Планета проходит точку 1 или 3 раза за цикл (директ → ретро → директ) — выдаём
 * ВСЕ прохождения с датой, временем и направлением (директ/ретро). Отдельный
 * модуль (только публичный Engine.lon/lonSpeed/toJD/fromJD), не трогает ядро.
 * Асинхронный, режется на куски (yield) — многолетний скан не подвешивает UI.
 */
import type { Engine } from './engine.ts';

// знаковая кратчайшая разница (−180,180]; ноль = планета точно на targetLon
const angdiff = (a: number, b: number): number => {
  const d = ((a - b) % 360 + 360) % 360;
  return d > 180 ? d - 360 : d;
};

export interface DegreePassage { exact: Date; jd: number; retro: boolean }

/**
 * Все моменты, когда `planet` проходит долготу `targetLon` (°, 0..360) в
 * [from, to]. Шаг сетки: Луна — 2ч, планеты — 12ч (медленные точку проходят
 * неспешно, быстрее — Луна). При смене знака f уточняем момент делением пополам.
 */
export async function findDegreePassages(
  E: Engine, planet: string, targetLon: number,
  from: Date, to: Date, maxResults = 200,
): Promise<{ list: DegreePassage[]; truncated: boolean }> {
  if (to <= from) return { list: [], truncated: false };
  const target = ((targetLon % 360) + 360) % 360;
  const f = (jd: number): number => angdiff(E.lon(jd, planet), target);
  const jdFrom = E.toJD(from), jdTo = E.toJD(to);
  const fast = planet === 'Луна';
  const step = fast ? 1 / 12 : 0.5;   // Луна — 2ч, планеты — 12ч

  const out: DegreePassage[] = [];
  let prevJ = jdFrom, prevV = f(jdFrom), sinceYield = 0;
  for (let j = jdFrom + step; j <= jdTo; j += step) {
    const v = f(j);
    // смена знака и НЕ «скачок через ±180°» (перескок дальней стороны круга)
    if ((prevV <= 0) !== (v <= 0) && Math.abs(prevV - v) < 30) {
      let lo = prevJ, hi = j;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if ((f(lo) <= 0) !== (f(mid) <= 0)) hi = mid; else lo = mid;
      }
      const jd = (lo + hi) / 2;
      out.push({ jd, exact: E.fromJD(jd), retro: E.lonSpeed(jd, planet)[1] < 0 });
      if (out.length >= maxResults) return { list: out, truncated: true };
    }
    prevJ = j; prevV = v;
    if (++sinceYield >= 500) { sinceYield = 0; await new Promise((r) => setTimeout(r, 0)); }
  }
  return { list: out, truncated: false };
}

/** Целевая долгота из знака (0..11 или имени), градуса и минут. */
export function degreeToLon(signIndex: number, deg: number, min = 0): number {
  return (((signIndex % 12) + 12) % 12) * 30 + deg + min / 60;
}
