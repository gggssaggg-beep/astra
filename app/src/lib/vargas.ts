/**
 * Варги (дробные карты) — ЧЕСТНЫЕ классические правила Парашары.
 *
 * Непрерывная формула `vargaSign(lon, n)` из lib/vedic.ts («круг делится на
 * 12·n частей подряд») верна ТОЛЬКО для D1 и D9 — там она случайно совпадает с
 * классическим правилом. У остальных варг части раскладываются по знакам иначе:
 * D2 чередует Льва и Рака, D3 идёт по 1/5/9-му от знака, D30 вообще делит знак
 * НЕРАВНО и отдаёт долю планете, а не части круга. Поэтому здесь — таблицы, а
 * не арифметика по кругу.
 *
 * Все функции принимают ЗНАК (0=Овен … 11=Рыбы) и градус ВНУТРИ знака (0..30),
 * возвращают индекс знака в варге.
 *
 * ⚠ «Нечётный знак» — нечётный ПО СЧЁТУ: Овен 1-й, Близнецы 3-й, Лев 5-й…
 * В индексах это ЧЁТНЫЕ числа 0, 2, 4… Путаница здесь ломает половину варг.
 */
import { vargaSign, signIndexOf } from './vedic.ts';

const wrap = (si: number): number => ((si % 12) + 12) % 12;
/** Нечётный по счёту (мужской) знак: Овен, Близнецы, Лев, Весы, Стрелец, Водолей. */
const isOdd = (si: number): boolean => wrap(si) % 2 === 0;
/** Градус внутри знака, загнанный в 0..30 (снаружи может прийти 30.0000001). */
const inSign = (deg: number): number => Math.min(Math.max(deg, 0), 29.999999);
/** Номер равной части: круг знака делён на `parts`. */
const part = (deg: number, parts: number): number =>
  Math.min(parts - 1, Math.floor(inSign(deg) / (30 / parts)));

/**
 * D2 хора — две половины по 15°. Знак даёт светило: половина Солнца — Лев,
 * половина Луны — Рак. В нечётном знаке первая половина солнечная, в чётном —
 * лунная. Варга достатка: «в чью половину упала планета».
 */
export const d2Sign = (si: number, deg: number): number => {
  const solarFirst = isOdd(si);          // Лев в первой половине
  const first = inSign(deg) < 15;
  return first === solarFirst ? 4 : 3;   // 4 = Лев, 3 = Рак
};

/**
 * D3 дреккана — три части по 10°: 1-я остаётся в своём знаке, 2-я уходит в 5-й
 * от него, 3-я — в 9-й (тригон стихии). Варга братьев, сестёр и собственных
 * усилий.
 */
export const d3Sign = (si: number, deg: number): number =>
  wrap(si + part(deg, 3) * 4);

/**
 * D7 саптамша — семь частей по 30/7° (≈4°17′). Нечётный знак считает от себя,
 * чётный — от 7-го от себя. Варга детей и продолжения рода.
 */
export const d7Sign = (si: number, deg: number): number =>
  wrap((isOdd(si) ? si : si + 6) + part(deg, 7));

/**
 * D10 дашамша — десять частей по 3°. Нечётный знак считает от себя, чётный —
 * от 9-го от себя. Варга дела, положения и карьеры.
 */
export const d10Sign = (si: number, deg: number): number =>
  wrap((isOdd(si) ? si : si + 8) + part(deg, 10));

/**
 * D12 двадашамша — двенадцать частей по 2°30′, счёт ВСЕГДА от самого знака
 * (чётность роли не играет). Варга родителей и рода.
 */
export const d12Sign = (si: number, deg: number): number =>
  wrap(si + part(deg, 12));

/**
 * D30 тримшамша — единственная варга с НЕРАВНЫМИ долями: знак делится на пять
 * отрезков, каждый отдан планете, и знаком варги становится знак этой планеты
 * (её нечётная обитель для нечётных знаков, чётная — для чётных). Узлов и
 * светил здесь нет вовсе. Варга испытаний и уязвимых мест.
 */
const D30_ODD: [number, number][] = [   // до какого градуса → знак
  [5, 0],    // Марс     → Овен
  [10, 10],  // Сатурн   → Водолей
  [18, 8],   // Юпитер   → Стрелец
  [25, 2],   // Меркурий → Близнецы
  [30, 6],   // Венера   → Весы
];
const D30_EVEN: [number, number][] = [
  [5, 1],    // Венера   → Телец
  [12, 5],   // Меркурий → Дева
  [20, 11],  // Юпитер   → Рыбы
  [25, 9],   // Сатурн   → Козерог
  [30, 7],   // Марс     → Скорпион
];

export const d30Sign = (si: number, deg: number): number => {
  const table = isOdd(si) ? D30_ODD : D30_EVEN;
  const d = inSign(deg);
  for (const [upto, sign] of table) if (d < upto) return sign;
  return table[table.length - 1][1];
};

// ─── общий доступ по идентификатору ────────────────────────────────────────
export type VargaId = 'd1' | 'd9' | 'd2' | 'd3' | 'd7' | 'd10' | 'd12' | 'd30';

export interface VargaInfo {
  id: VargaId;
  label: string;   // «D10 · дашамша» — как подписан переключатель
  theme: string;   // о чём эта карта одним словом
}

/** Порядок для UI: сначала две главные карты, дальше — по номеру варги. */
export const VARGA_LIST: VargaInfo[] = [
  { id: 'd1', label: 'D1 · раши', theme: 'жизнь целиком' },
  { id: 'd9', label: 'D9 · навамша', theme: 'брак и суть' },
  { id: 'd2', label: 'D2 · хора', theme: 'достаток' },
  { id: 'd3', label: 'D3 · дреккана', theme: 'братья и усилия' },
  { id: 'd7', label: 'D7 · саптамша', theme: 'дети' },
  { id: 'd10', label: 'D10 · дашамша', theme: 'карьера' },
  { id: 'd12', label: 'D12 · двадашамша', theme: 'родители' },
  { id: 'd30', label: 'D30 · тримшамша', theme: 'испытания' },
];

export const vargaInfo = (id: VargaId): VargaInfo =>
  VARGA_LIST.find((v) => v.id === id) ?? VARGA_LIST[0];

/**
 * Знак в любой варге по знаку и градусу. D1 — сам знак, D9 — навамша из
 * lib/vedic.ts (она там сверена с программой астролога), прочие — таблицы выше.
 */
export function vargaSignOf(id: VargaId, si: number, deg: number): number {
  switch (id) {
    case 'd1': return wrap(si);
    case 'd9': return vargaSign(wrap(si) * 30 + inSign(deg), 9);
    case 'd2': return d2Sign(si, deg);
    case 'd3': return d3Sign(si, deg);
    case 'd7': return d7Sign(si, deg);
    case 'd10': return d10Sign(si, deg);
    case 'd12': return d12Sign(si, deg);
    case 'd30': return d30Sign(si, deg);
  }
}

/** То же от готовой долготы — так удобнее звать из сборки карты. */
export const vargaSignAt = (id: VargaId, lon: number): number =>
  vargaSignOf(id, signIndexOf(lon), ((lon % 30) + 30) % 30);
