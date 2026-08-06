/**
 * АШТАКАВАРГА — система бинду (очков), которой джйотиш меряет силу знаков и домов.
 *
 * Для каждой из семи грах строится БХИННА-аштакаварга (BAV): восемь «дарителей»
 * (семь грах + лагна) дают бинду в определённых домах ОТ СЕБЯ. Сумма семи BAV по
 * знаку — САРВА-аштакаварга (SAV), те самые числа в нижней строке таблицы
 * профессиональных программ.
 *
 * Таблицы — классический Парашара (прастара-аштакаварга). Проверка встроена в
 * тест: канонические итоги BAV равны 48/49/39/54/56/52/39, а SAV = 337.
 * Считаются от ЗНАКОВ (не градусов) — как и весь остальной слой джйотиша.
 */
import { VEDIC_BODIES } from '../engine/index.ts';

/** Дарители бинду: семь грах + лагна. Раху и Кету в аштакаварге не участвуют. */
export const DONORS = [...VEDIC_BODIES, 'Лагна'] as const;
export type Donor = typeof DONORS[number];

/**
 * BENEFIC[получатель][даритель] = дома ОТ ДАРИТЕЛЯ, где тот даёт бинду.
 * «N-й от себя» включительно: 1 = знак самого дарителя.
 */
const BENEFIC: Record<string, Record<string, number[]>> = {
  'Солнце': {
    'Солнце': [1, 2, 4, 7, 8, 9, 10, 11],
    'Луна': [3, 6, 10, 11],
    'Марс': [1, 2, 4, 7, 8, 9, 10, 11],
    'Меркурий': [3, 5, 6, 9, 10, 11, 12],
    'Юпитер': [5, 6, 9, 11],
    'Венера': [6, 7, 12],
    'Сатурн': [1, 2, 4, 7, 8, 9, 10, 11],
    'Лагна': [3, 4, 6, 10, 11, 12],
  },
  'Луна': {
    'Солнце': [3, 6, 7, 8, 10, 11],
    'Луна': [1, 3, 6, 7, 10, 11],
    'Марс': [2, 3, 5, 6, 9, 10, 11],
    'Меркурий': [1, 3, 4, 5, 7, 8, 10, 11],
    'Юпитер': [1, 4, 7, 8, 10, 11, 12],
    'Венера': [3, 4, 5, 7, 9, 10, 11],
    'Сатурн': [3, 5, 6, 11],
    'Лагна': [3, 6, 10, 11],
  },
  'Марс': {
    'Солнце': [3, 5, 6, 10, 11],
    'Луна': [3, 6, 11],
    'Марс': [1, 2, 4, 7, 8, 10, 11],
    'Меркурий': [3, 5, 6, 11],
    'Юпитер': [6, 10, 11, 12],
    'Венера': [6, 8, 11, 12],
    'Сатурн': [1, 4, 7, 8, 9, 10, 11],
    'Лагна': [1, 3, 6, 10, 11],
  },
  'Меркурий': {
    'Солнце': [5, 6, 9, 11, 12],
    'Луна': [2, 4, 6, 8, 10, 11],
    'Марс': [1, 2, 4, 7, 8, 9, 10, 11],
    'Меркурий': [1, 3, 5, 6, 9, 10, 11, 12],
    'Юпитер': [6, 8, 11, 12],
    'Венера': [1, 2, 3, 4, 5, 8, 9, 11],
    'Сатурн': [1, 2, 4, 7, 8, 9, 10, 11],
    'Лагна': [1, 2, 4, 6, 8, 10, 11],
  },
  'Юпитер': {
    'Солнце': [1, 2, 3, 4, 7, 8, 9, 10, 11],
    'Луна': [2, 5, 7, 9, 11],
    'Марс': [1, 2, 4, 7, 8, 10, 11],
    'Меркурий': [1, 2, 4, 5, 6, 9, 10, 11],
    'Юпитер': [1, 2, 3, 4, 7, 8, 10, 11],
    'Венера': [2, 5, 6, 9, 10, 11],
    'Сатурн': [3, 5, 6, 12],
    'Лагна': [1, 2, 4, 5, 6, 7, 9, 10, 11],
  },
  'Венера': {
    'Солнце': [8, 11, 12],
    'Луна': [1, 2, 3, 4, 5, 8, 9, 11, 12],
    'Марс': [3, 4, 6, 9, 11, 12],
    'Меркурий': [3, 5, 6, 9, 11],
    'Юпитер': [5, 8, 9, 10, 11],
    'Венера': [1, 2, 3, 4, 5, 8, 9, 10, 11],
    'Сатурн': [3, 4, 5, 8, 9, 10, 11],
    'Лагна': [1, 2, 3, 4, 5, 8, 9, 11],
  },
  'Сатурн': {
    'Солнце': [1, 2, 4, 7, 8, 10, 11],
    'Луна': [3, 6, 11],
    'Марс': [3, 5, 6, 10, 11, 12],
    'Меркурий': [6, 8, 9, 10, 11, 12],
    'Юпитер': [5, 6, 11, 12],
    'Венера': [6, 11, 12],
    'Сатурн': [3, 5, 6, 11],
    'Лагна': [1, 3, 4, 6, 10, 11],
  },
};

/** Канонические итоги BAV — страховка от опечатки в таблицах (см. тест). */
export const BAV_TOTALS: Record<string, number> = {
  'Солнце': 48, 'Луна': 49, 'Марс': 39, 'Меркурий': 54,
  'Юпитер': 56, 'Венера': 52, 'Сатурн': 39,
};
export const SAV_TOTAL = 337;

/** Бхинна-аштакаварга грахи: 12 чисел по ЗНАКАМ (индекс 0 = Овен). */
export function bhinna(planet: string, signs: Record<string, number>, lagnaSign: number): number[] {
  const rows = BENEFIC[planet];
  if (!rows) return Array(12).fill(0);
  const out = Array(12).fill(0);
  for (const donor of DONORS) {
    const houses = rows[donor];
    if (!houses) continue;
    const base = donor === 'Лагна' ? lagnaSign : signs[donor];
    if (base == null) continue;
    for (const h of houses) out[(base + h - 1) % 12]++;
  }
  return out;
}

export interface AshtakavargaResult {
  /** BAV каждой из семи грах: имя → 12 чисел по знакам */
  bav: Record<string, number[]>;
  /** SAV: сумма семи BAV по знакам, 12 чисел (в сумме 337) */
  sav: number[];
  /** SAV, разложенная по ДОМАМ от лагны: [0] = 1-й дом */
  savByHouse: number[];
  /** шодхья пинда каждой грахи: очищенная BAV + веса */
  pinda: Record<string, ShodhyaPinda>;
  lagnaSign: number;
}

/**
 * Полная аштакаварга по знакам планет. `signs` — имя грахи → индекс её знака
 * (0..11); нужны все семь классических, узлы игнорируются.
 */
export function ashtakavarga(signs: Record<string, number>, lagnaSign: number): AshtakavargaResult {
  const bav: Record<string, number[]> = {};
  const pinda: Record<string, ShodhyaPinda> = {};
  const sav = Array(12).fill(0);
  for (const p of VEDIC_BODIES) {
    const row = bhinna(p, signs, lagnaSign);
    bav[p] = row;
    pinda[p] = shodhyaPinda(row, signs);
    for (let i = 0; i < 12; i++) sav[i] += row[i];
  }
  const savByHouse = Array.from({ length: 12 }, (_, h) => sav[(lagnaSign + h) % 12]);
  return { bav, sav, savByHouse, pinda, lagnaSign };
}

// ─── редукции (шодхана) и шодхья пинда ────────────────────────────────────
// Второй слой аштакаварги: сырую BAV «очищают» двумя редукциями, и уже из
// очищенной считают шодхья пинду — итоговый вес грахи. Правила — Парашара;
// формулировки сверены со справочником argala.ru, множители оттуда же.

/** Четыре тригона: знаки, стоящие друг к другу в 1-5-9. */
const TRINES = [[0, 4, 8], [1, 5, 9], [2, 6, 10], [3, 7, 11]];

/**
 * Трикона-шодхана. По каждому тригону: ноль хоть в одном знаке — не трогаем;
 * все три равны — все три в ноль; иначе вычитаем из всех троих наименьшее.
 */
export function trikonaShodhana(row: number[]): number[] {
  const out = row.slice();
  for (const t of TRINES) {
    const v = t.map((i) => out[i]);
    if (v.some((x) => x === 0)) continue;
    const min = Math.min(...v);
    if (v[0] === v[1] && v[1] === v[2]) { for (const i of t) out[i] = 0; continue; }
    for (const i of t) out[i] -= min;
  }
  return out;
}

/** Пары знаков одного управителя. Рак и Лев одиночные — в редукции не входят. */
const DUAL_RULED: [number, number][] = [
  [0, 7],   // Марс: Овен / Скорпион
  [1, 6],   // Венера: Телец / Весы
  [2, 5],   // Меркурий: Близнецы / Дева
  [8, 11],  // Юпитер: Стрелец / Рыбы
  [9, 10],  // Сатурн: Козерог / Водолей
];

/**
 * Экадхипатья-шодхана. `occupied` — какие знаки заняты грахами (семь грах,
 * без узлов: они в системе не участвуют).
 *
 * Пара знаков одного управителя «делит» очки: если один из знаков пустой, он
 * не может распорядиться своими бинду сам, и они срезаются до значения
 * второго знака или обнуляются.
 */
export function ekadhipatyaShodhana(row: number[], occupied: boolean[]): number[] {
  const out = row.slice();
  for (const [a, b] of DUAL_RULED) {
    if (out[a] === 0 || out[b] === 0) continue;        // ноль — редукции нет
    if (occupied[a] && occupied[b]) continue;          // оба заняты — редукции нет
    if (occupied[a] !== occupied[b]) {
      // один занят, другой пуст: пустой обнуляется, если занятый не меньше;
      // иначе пустой приравнивается к занятому
      const full = occupied[a] ? a : b, empty = occupied[a] ? b : a;
      out[empty] = out[full] >= out[empty] ? 0 : out[full];
    } else {
      // оба пусты: равные — оба в ноль, разные — большее до меньшего
      if (out[a] === out[b]) { out[a] = 0; out[b] = 0; }
      else if (out[a] > out[b]) out[a] = out[b];
      else out[b] = out[a];
    }
  }
  return out;
}

/** Раши-мана: множитель знака в шодхья пинде (индекс 0 = Овен). */
export const RASHI_MANA = [7, 10, 8, 4, 10, 5, 7, 8, 9, 5, 11, 12];
/** Граха-мана: множитель планеты в шодхья пинде. */
export const GRAHA_MANA: Record<string, number> = {
  'Солнце': 5, 'Луна': 5, 'Марс': 8, 'Меркурий': 5,
  'Юпитер': 10, 'Венера': 7, 'Сатурн': 5,
};

export interface ShodhyaPinda {
  /** BAV после обеих редукций (12 чисел по знакам) */
  reduced: number[];
  rashiPinda: number;
  grahaPinda: number;
  /** раши-пинда + граха-пинда */
  total: number;
}

/**
 * Шодхья пинда грахи: сначала обе редукции, потом два веса очищенных бинду —
 * по знакам (раши-мана) и по знакам, занятым грахами (граха-мана той грахи,
 * что там стоит).
 */
export function shodhyaPinda(
  row: number[], signs: Record<string, number>,
): ShodhyaPinda {
  const occupied = Array(12).fill(false);
  for (const p of Object.keys(GRAHA_MANA)) {
    const s = signs[p];
    if (s != null) occupied[s] = true;
  }
  const reduced = ekadhipatyaShodhana(trikonaShodhana(row), occupied);
  let rashiPinda = 0;
  for (let i = 0; i < 12; i++) rashiPinda += reduced[i] * RASHI_MANA[i];
  let grahaPinda = 0;
  for (const [p, mana] of Object.entries(GRAHA_MANA)) {
    const s = signs[p];
    if (s != null) grahaPinda += reduced[s] * mana;
  }
  return { reduced, rashiPinda, grahaPinda, total: rashiPinda + grahaPinda };
}

/**
 * Как читать число SAV в знаке. Средняя бинду по знаку — 337/12 ≈ 28: выше —
 * знак «поддержан», сильно ниже — территория, где дела идут туго.
 */
export function savLabel(v: number): string {
  if (v >= 34) return 'очень сильный';
  if (v >= 30) return 'сильный';
  if (v >= 25) return 'средний';
  if (v >= 20) return 'слабый';
  return 'очень слабый';
}
