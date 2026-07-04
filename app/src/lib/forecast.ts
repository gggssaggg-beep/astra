/**
 * Прогноз транзитов к натальной карте: когда транзитные планеты сделают ТОЧНЫЙ
 * мажорный аспект к фиксированным натальным точкам (одного или двух людей).
 *
 * Отличие от aspectSearch (там обе точки движутся): здесь натал ФИКСИРОВАН —
 * ищем момент, когда долгота ОДНОЙ движущейся планеты даёт нужный угол к
 * постоянной натальной долготе. Луну в прогноз НЕ берём (аспектит всё каждые
 * ~2.5 дня — это быт, не прогноз). Асинхронно, с передышками — не вешает UI.
 */
import type { Engine, BodyPosition } from '../engine/index.ts';
import { ASPECTS, BODIES, PLANET_GLYPH } from '../engine/index.ts';

const angdiff = (a: number, b: number): number => {
  const d = ((a - b) % 360 + 360) % 360;
  return d > 180 ? d - 360 : d;
};

// Знаковая функция: ноль = точный аспект транзитной планеты к фиксированной L.
function signedFixed(E: Engine, tBody: string, L: number, target: number): (j: number) => number {
  const delta = (j: number) => angdiff(E.lon(j, tBody), L);
  if (target === 0) return delta;
  if (target === 180) return (j) => angdiff(delta(j), 180);
  return (j) => Math.abs(delta(j)) - target;
}

export interface TransitHit {
  when: Date; jd: number;
  tName: string; tGlyph: string;   // транзитная планета
  nName: string; nGlyph: string;   // натальная точка
  owner: string;                   // чей натал
  aspect: string; symbol: string;
}

/** targets — по человеку: { owner: имя, pos: натальные позиции }. Возвращает
 *  ближайшие точные транзиты в [from, from+days], отсортированные по дате. */
export async function forecastTransits(
  E: Engine,
  targets: { owner: string; pos: BodyPosition[] }[],
  from: Date, days: number, maxResults = 100,
): Promise<TransitHit[]> {
  // транзитные тела — все базовые, КРОМЕ Луны (слишком часто)
  const tBodies = [...Object.keys(BODIES), 'Кету'];
  const jd0 = E.toJD(from), jd1 = jd0 + days;
  const hits: TransitHit[] = [];
  let sinceYield = 0;

  for (const tName of tBodies) {
    const step = 0.25; // 6ч — планеты медленнее Луны, крест не проскочит
    for (const tg of targets) {
      for (const nP of tg.pos) {
        for (const [asp, { angle, symbol }] of Object.entries(ASPECTS)) {
          const f = signedFixed(E, tName, nP.lon, angle);
          let prevJ = jd0, prevV = f(jd0);
          for (let j = jd0 + step; j <= jd1; j += step) {
            const v = f(j);
            if ((prevV <= 0) !== (v <= 0) && Math.abs(prevV - v) < 30) {
              let lo = prevJ, hi = j;
              for (let i = 0; i < 44; i++) {
                const mid = (lo + hi) / 2;
                if ((f(lo) <= 0) !== (f(mid) <= 0)) hi = mid; else lo = mid;
              }
              const jd = (lo + hi) / 2;
              hits.push({
                when: E.fromJD(jd), jd, tName, tGlyph: PLANET_GLYPH[tName] ?? '•',
                nName: nP.name, nGlyph: nP.glyph, owner: tg.owner, aspect: asp, symbol,
              });
            }
            prevJ = j; prevV = v;
            if (++sinceYield >= 600) { sinceYield = 0; await new Promise((r) => setTimeout(r, 0)); }
          }
        }
      }
    }
  }
  hits.sort((a, b) => a.jd - b.jd);
  return hits.slice(0, maxResults);
}
