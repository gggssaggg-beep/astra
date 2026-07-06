/**
 * Дома в натальной карте (правки астролога 2026-07-07):
 *  • дом стояния планеты (в каком доме планета) — по куспидам;
 *  • символизм: дом N ↔ знак N (1 дом ↔ Овен …), управитель дома = управитель
 *    знака на КУСПИДЕ (авторская раскладка SIGN_MYTHS!); перехваченный знак
 *    (не попал ни на один куспид) → у дома ДВА управителя;
 *  • трактовка «знак на куспиде» — houseLore.
 */
import { ZODIAC } from '../engine/index.ts';
import { SIGN_MYTHS } from './signMyths.ts';
import { HOUSE_LORE } from './houseLore.ts';

const norm = (d: number): number => ((d % 360) + 360) % 360;

/** Управитель знака по авторской раскладке (Овен→Марс, Скорпион→Сатурн, …). */
export function signRuler(signName: string): string {
  return SIGN_MYTHS.find((m) => m.sign === signName)?.ruler ?? '';
}

/** Индекс знака (0..11) по долготе. */
export const signIndexOf = (lon: number): number => Math.floor(norm(lon) / 30);

/** Номер дома (1..12), в котором лежит долгота, по 12 куспидам. */
export function houseOfLon(lon: number, cusps: number[]): number {
  const L = norm(lon);
  for (let i = 0; i < 12; i++) {
    const a = norm(cusps[i]);
    const b = norm(cusps[(i + 1) % 12]);
    const span = norm(b - a);
    if (norm(L - a) < span) return i + 1;
  }
  return 1;
}

export interface HouseInfo {
  house: number;         // 1..12
  signIndex: number;     // знак на куспиде (0..11)
  sign: string;          // название знака
  rulers: string[];      // управитель(и): 2, если знак перехвачен в этом доме
  lore: string;          // трактовка «знак на куспиде дома»
}

/** Разбор 12 домов: знак на куспиде, управитель(и), трактовка. Перехват —
 *  знак, не попавший НИ на один куспид: он целиком «внутри» дома, и тогда у
 *  дома добавляется управитель этого перехваченного знака. */
export function analyzeHouses(cusps: number[]): HouseInfo[] {
  const onCusp = new Set(cusps.map(signIndexOf));
  const out: HouseInfo[] = [];
  for (let i = 0; i < 12; i++) {
    const si = signIndexOf(cusps[i]);
    const sign = ZODIAC[si];
    const rulers = [signRuler(sign)];
    // знак, следующий за знаком куспида, если он НЕ на куспиде — перехвачен здесь
    const nextSi = (si + 1) % 12;
    const nextOnCusp = onCusp.has(nextSi);
    const nextIsNextHouseCusp = signIndexOf(cusps[(i + 1) % 12]) === nextSi;
    if (!nextOnCusp && !nextIsNextHouseCusp) {
      const r2 = signRuler(ZODIAC[nextSi]);
      if (r2 && !rulers.includes(r2)) rulers.push(r2);
    }
    out.push({ house: i + 1, signIndex: si, sign, rulers, lore: HOUSE_LORE[`${i + 1}|${sign}`] ?? '' });
  }
  return out;
}
