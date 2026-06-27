/**
 * Аспекты на сутки — перенос 1-в-1 из engine_reference/daily_aspects_astro.py:
 * aspects_for_day / _exact_time / _orb_distance / _orb_edge (§2.2, §2.3).
 *
 * Аспект — ИНТЕРВАЛ: вход в орбис → точный момент → выход (может выходить за
 * сутки). Для соединения/оппозиции точное время ищем по ЗНАКОВОЙ функции (иначе
 * |sep|-target лишь касается 0/180 и не меняет знак).
 */
import { ASPECTS, BODIES, MOON, SLOW } from './constants.ts';
import type { Engine } from './engine.ts';
import type { AspectRecord, DayAspects } from './types.ts';

const angdiff = (a: number, b: number): number => {
  const d = ((a - b) % 360 + 360) % 360;
  return d > 180 ? d - 360 : d;
};

// Знаковая функция f, чей ноль = точный аспект (согласована с _orbDistance).
function signedFn(E: Engine, n1: string, n2: string, target: number): (j: number) => number {
  const delta = (j: number) => angdiff(E.lon(j, n1), E.lon(j, n2));
  if (target === 0) return delta;
  if (target === 180) return (j) => angdiff(delta(j), 180);
  return (j) => Math.abs(delta(j)) - target;
}

// Расстояние до точного аспекта m(jd) ≥ 0 (m≤orb ⇒ в орбисе, m==0 ⇒ точный).
function orbDistance(E: Engine, n1: string, n2: string, target: number): (j: number) => number {
  const delta = (j: number) => angdiff(E.lon(j, n1), E.lon(j, n2));
  if (target === 0) return (j) => Math.abs(delta(j));
  if (target === 180) return (j) => Math.abs(angdiff(delta(j), 180));
  return (j) => Math.abs(Math.abs(delta(j)) - target);
}

function exactTime(E: Engine, n1: string, n2: string, target: number,
  jdStart: number, jdEnd: number): number | null {
  const f = signedFn(E, n1, n2, target);
  const step = 1 / 48; // полчаса
  let prevJ = jdStart, prevV = f(jdStart), j = jdStart + step;
  while (j <= jdEnd) {
    const v = f(j);
    if ((prevV <= 0) !== (v <= 0) && Math.abs(prevV - v) < 30) {
      let lo = prevJ, hi = j;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if ((f(lo) <= 0) !== (f(mid) <= 0)) hi = mid; else lo = mid;
      }
      return (lo + hi) / 2;
    }
    prevJ = j; prevV = v; j += step;
  }
  return null;
}

// Край окна орбиса: вход (dir=-1, назад) или выход (dir=+1, вперёд) от момента
// минимума орба. Шаг адаптивен по относительной скорости, поиск ≤ maxDays.
function orbEdge(m: (j: number) => number, orb: number, jdFrom: number,
  relSpeed: number, dir: number, maxDays = 120): number | null {
  const step = Math.max(1 / 96, Math.min(0.5, (orb * 0.5) / Math.max(Math.abs(relSpeed), 1e-4))) * dir;
  const g = (j: number) => m(j) - orb;
  const jdLimit = jdFrom + dir * maxDays;
  let prevJ = jdFrom, j = jdFrom + step;
  while (dir > 0 ? j <= jdLimit : j >= jdLimit) {
    if (g(prevJ) <= 0 && g(j) > 0) {
      let lo = prevJ, hi = j;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if ((g(lo) <= 0) !== (g(mid) <= 0)) hi = mid; else lo = mid;
      }
      return (lo + hi) / 2;
    }
    prevJ = j; j += step;
  }
  return null;
}

/** Все мажорные аспекты на сутки dayUtc (00:00–24:00 UTC). */
export function aspectsOn(E: Engine, dayUtc: Date, orb = 1.0, includeMoon = true): DayAspects {
  const day0 = new Date(Date.UTC(dayUtc.getUTCFullYear(), dayUtc.getUTCMonth(), dayUtc.getUTCDate()));
  const jd0 = E.toJD(day0);
  const jd1 = jd0 + 1;
  const jdNoon = jd0 + 0.5;

  const names = [...Object.keys(BODIES), 'Кету'];
  if (includeMoon) names.unshift(MOON);

  const slow: AspectRecord[] = [], fast: AspectRecord[] = [], moon: AspectRecord[] = [];
  const sep = (jd: number, a: string, b: string) => Math.abs(angdiff(E.lon(jd, a), E.lon(jd, b)));

  for (let i = 0; i < names.length; i++) {
    for (let jx = i + 1; jx < names.length; jx++) {
      const n1 = names[i], n2 = names[jx];
      if ((n1 === 'Раху' && n2 === 'Кету') || (n1 === 'Кету' && n2 === 'Раху')) continue;
      for (const [asp, { angle, symbol }] of Object.entries(ASPECTS)) {
        // минимальный орбис за сутки (сетка — час)
        let minOrb: number | null = null, minJd = jdNoon;
        for (let jd = jd0; jd <= jd1; jd += 1 / 24) {
          const o = Math.abs(sep(jd, n1, n2) - angle);
          if (minOrb === null || o < minOrb) { minOrb = o; minJd = jd; }
        }
        if (minOrb === null || minOrb > orb) continue;

        const exactJd = exactTime(E, n1, n2, angle, jd0, jd1);
        const sepA = sep(minJd, n1, n2);
        const sepB = sep(minJd + 0.01, n1, n2);
        const applying = Math.abs(sepB - angle) < Math.abs(sepA - angle);

        const m = orbDistance(E, n1, n2, angle);
        const rel = E.lonSpeed(minJd, n1)[1] - E.lonSpeed(minJd, n2)[1];
        const beginJd = orbEdge(m, orb, minJd, rel, -1);
        const endJd = orbEdge(m, orb, minJd, rel, +1);

        const rec: AspectRecord = {
          p1: n1, p2: n2, aspect: asp, symbol,
          exactOrb: Math.round(minOrb * 100) / 100,
          exactTime: exactJd ? E.fromJD(exactJd) : null,
          beginTime: beginJd ? E.fromJD(beginJd) : null,
          endTime: endJd ? E.fromJD(endJd) : null,
          applying,
          pos1: E.lon(minJd, n1), pos2: E.lon(minJd, n2),
          bucket: (n1 === MOON || n2 === MOON) ? 'moon'
            : (SLOW.has(n1) && SLOW.has(n2)) ? 'slow' : 'fast',
        };
        (rec.bucket === 'moon' ? moon : rec.bucket === 'slow' ? slow : fast).push(rec);
      }
    }
  }

  slow.sort((a, b) => a.exactOrb - b.exactOrb);
  fast.sort((a, b) => a.exactOrb - b.exactOrb);
  moon.sort((a, b) => (a.exactTime?.getTime() ?? day0.getTime()) - (b.exactTime?.getTime() ?? day0.getTime()));

  return { date: day0, slow, fast, moon, audit: E.audit(jdNoon) };
}
