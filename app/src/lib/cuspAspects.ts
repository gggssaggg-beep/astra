/**
 * Аспекты планет к КУСПИДАМ домов (раунд 29 §4). Куспид — точка; аспект
 * планета→куспид считается той же математикой разницы долгот, что и статичный
 * аспект (см. engine/static.ts). Орбис куспида — отдельный, дефолт 1°; для пары
 * планета×куспид берём БОЛЬШИЙ из двух (как везде). Куспид N = дом N →
 * трактовка из `PLANET_CUSP_LORE` по ключу «Планета|Дом» (блок F раунда 28).
 *
 * ⚠ Куспиды движутся ~1°/4мин реального времени рождения — при неточном времени
 * дома отключены (slowOnly/unknownTime), сюда набор просто не придёт.
 */
import type { BodyPosition } from '../engine/index.ts';
import { ASPECTS, PLANET_GLYPH } from '../engine/index.ts';

export const CUSP_ORB_DEFAULT = 1;

export interface CuspAspect {
  planet: string; glyph: string;
  cusp: number;                 // 1..12 (= номер дома)
  aspect: string; symbol: string; angle: number;
  orb: number;                  // отклонение от точного, °
}

const angdiff = (a: number, b: number): number => {
  const d = ((a - b) % 360 + 360) % 360;
  return d > 180 ? d - 360 : d;
};
const orbAt = (lon1: number, lon2: number, target: number): number => {
  const delta = angdiff(lon1, lon2);
  if (target === 0) return Math.abs(delta);
  if (target === 180) return Math.abs(angdiff(delta, 180));
  return Math.abs(Math.abs(delta) - target);
};

/** Равнодомная сетка: все куспиды ровно через 30° (равнодомные системы, целые
 *  знаки). Все мажорные углы кратны 30°, поэтому аспект к одному куспиду
 *  автоматически повторяется к 8 из 12 с ТЕМ ЖЕ орбисом — список вырождается в
 *  шум (жалоба владелицы 2026-07-27: Луна × 8 куспидов, все по 1.00°). В таких
 *  системах показываем только оси (куспиды 1 и 10): если сетка задета, аспект к
 *  одному из них есть всегда — явление не теряется. */
export function isEqualGrid(cusps: number[]): boolean {
  if (cusps.length < 12) return false;
  for (let i = 0; i < 12; i++) {
    const gap = ((cusps[(i + 1) % 12] - cusps[i]) % 360 + 360) % 360;
    if (Math.abs(gap - 30) > 0.01) return false;
  }
  return true;
}

/** Аспекты каждого объекта к каждому из 12 куспидов. Сортировка: по куспиду,
 *  внутри — теснее орбис. */
export function cuspAspects(
  positions: BodyPosition[], cusps: number[],
  orbOf: (name: string) => number, cuspOrb = CUSP_ORB_DEFAULT,
): CuspAspect[] {
  if (cusps.length < 12) return [];
  const out: CuspAspect[] = [];
  for (const p of positions) {
    const pairOrb = Math.max(orbOf(p.name), cuspOrb);
    for (let c = 0; c < 12; c++) {
      for (const [asp, { angle, symbol }] of Object.entries(ASPECTS)) {
        const o = orbAt(p.lon, cusps[c], angle);
        if (o > pairOrb) continue;
        out.push({ planet: p.name, glyph: PLANET_GLYPH[p.name] ?? '•',
          cusp: c + 1, aspect: asp, symbol, angle, orb: Math.round(o * 100) / 100 });
      }
    }
  }
  return out.sort((a, b) => a.cusp - b.cusp || a.orb - b.orb);
}
