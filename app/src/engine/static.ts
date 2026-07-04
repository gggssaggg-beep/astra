/**
 * Статичные карты (натал/синастрия/композит) — чистая математика, БЕЗ Engine.
 * Транзитный аспект — ИНТЕРВАЛ во времени (AspectRecord); здесь аспект — СНИМОК:
 * разница углов на фиксированный момент, без времени/окна/applying. Правила пар
 * (орбис = больший из двух, пропуск оси Раху×Кету, порядок по sunRank) — те же,
 * что в aspects.ts, чтобы вывод совпадал по духу с транзитами.
 */
import { ASPECTS, sunRank } from './constants.ts';
import { signOf } from './engine.ts';
import type { BodyPosition } from './types.ts';

/** Знаковая кратчайшая разница углов (−180, 180] — как в aspects.ts. */
const angdiff = (a: number, b: number): number => {
  const d = ((a - b) % 360 + 360) % 360;
  return d > 180 ? d - 360 : d;
};

export interface StaticAspect {
  p1: string; p2: string;   // синастрия: p1 ВСЕГДА из карты A, p2 из B
  aspect: string;           // название как в ASPECTS
  symbol: string;
  angle: number;            // 0|60|90|120|180
  orb: number;              // отклонение от точного, ° (округлено до 2 знаков)
}

/** Стабильный ключ статичного аспекта — для выделения линии в колесе и в списке. */
export const staticKey = (a: StaticAspect): string => `${a.p1}|${a.p2}|${a.aspect}`;

/** Круговая средняя точка по КОРОТКОЙ дуге (арифметическое среднее уезжало бы на
 *  180° «через 0° Овна»). При точной оппозиции (d = −180) средняя точка
 *  неоднозначна — формула детерминированно даёт lonA − 90°; узлы Раху/Кету при
 *  этом остаются строго противоположными. */
export function circularMidpoint(lonA: number, lonB: number): number {
  const d = ((lonB - lonA + 540) % 360) - 180;   // кратчайшая разница, [−180, 180)
  return ((lonA + d / 2) % 360 + 360) % 360;
}

/** Отклонение от точного аспекта target (°), ≥0 — перенос orbDistance из
 *  aspects.ts без Engine. Соединение/оппозиция считаются через знаковую разницу
 *  (переход через 0°/360° и 180° не теряется). */
function orbAt(lon1: number, lon2: number, target: number): number {
  const delta = angdiff(lon1, lon2);
  if (target === 0) return Math.abs(delta);
  if (target === 180) return Math.abs(angdiff(delta, 180));
  return Math.abs(Math.abs(delta) - target);
}

/** Вертикальный порядок — как в aspects.ts: сверху пары, которые ведёт более
 *  близкий к Солнцу объект; затем по второму участнику; при равенстве — по орбису. */
const byRank = (a: StaticAspect, b: StaticAspect): number =>
  sunRank(a.p1) - sunRank(b.p1) || sunRank(a.p2) - sunRank(b.p2) || a.orb - b.orb;

/** Аспекты ВНУТРИ одного набора позиций (натал, композит): пары i<j; ось
 *  Раху×Кету пропускаем (жёсткие 180°); орбис пары = больший из двух; внутри
 *  пары первым — более близкий к Солнцу (меньший sunRank). */
export function staticAspects(pos: BodyPosition[], orbOf: (name: string) => number): StaticAspect[] {
  const out: StaticAspect[] = [];
  for (let i = 0; i < pos.length; i++) {
    for (let j = i + 1; j < pos.length; j++) {
      const b1 = pos[i], b2 = pos[j];
      const n1 = b1.name, n2 = b2.name;
      if ((n1 === 'Раху' && n2 === 'Кету') || (n1 === 'Кету' && n2 === 'Раху')) continue;
      const pairOrb = Math.max(orbOf(n1), orbOf(n2));
      for (const [asp, { angle, symbol }] of Object.entries(ASPECTS)) {
        const o = orbAt(b1.lon, b2.lon, angle);
        if (o > pairOrb) continue;
        // Внутри пары первым — меньший sunRank (как в транзитах, поля симметричны).
        const swap = sunRank(n1) > sunRank(n2);
        out.push({
          p1: swap ? n2 : n1, p2: swap ? n1 : n2, aspect: asp, symbol, angle,
          orb: Math.round(o * 100) / 100,
        });
      }
    }
  }
  return out.sort(byRank);
}

/** Межаспекты синастрии: КАЖДЫЙ объект A × КАЖДЫЙ объект B, ВКЛЮЧАЯ одноимённые
 *  (Солнце A × Солнце B) и все узловые пары (Раху A × Кету B и т.п. — это разные
 *  карты, стандарт синастрии; зеркальные узловые контакты показываем оба). p1
 *  ВСЕГДА из A (никаких свапов). Орбис пары = больший из двух. */
export function synastryAspects(posA: BodyPosition[], posB: BodyPosition[], orbOf: (name: string) => number): StaticAspect[] {
  const out: StaticAspect[] = [];
  for (const a of posA) {
    for (const b of posB) {
      const pairOrb = Math.max(orbOf(a.name), orbOf(b.name));
      for (const [asp, { angle, symbol }] of Object.entries(ASPECTS)) {
        const o = orbAt(a.lon, b.lon, angle);
        if (o > pairOrb) continue;
        out.push({
          p1: a.name, p2: b.name, aspect: asp, symbol, angle,
          orb: Math.round(o * 100) / 100,
        });
      }
    }
  }
  return out.sort(byRank);
}

/** Карта средних точек: для каждого объекта A ищем одноимённый в B (нет пары —
 *  пропускаем). Долгота — круговая средняя; знак/градус из signOf; глиф — из A;
 *  скорости нет (композит — абстрактные точки), retro false. */
export function compositeChart(posA: BodyPosition[], posB: BodyPosition[]): BodyPosition[] {
  const byName = new Map(posB.map((b) => [b.name, b]));
  const out: BodyPosition[] = [];
  for (const a of posA) {
    const b = byName.get(a.name);
    if (!b) continue;
    const lon = circularMidpoint(a.lon, b.lon);
    const s = signOf(lon);
    out.push({
      name: a.name, glyph: a.glyph, lon,
      sign: s.sign, signGlyph: s.glyph, degInSign: s.deg,
      speed: 0, retro: false,
    });
  }
  return out;
}
