/**
 * Константы ядра расчётов — перенос 1-в-1 из engine_reference/daily_aspects_astro.py
 * (§2.1, §2.2). Тропический зодиак, мажорные аспекты, истинные узлы.
 */

export const ZODIAC = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева',
  'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'] as const;

export const SIGN_GLYPH = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'] as const;

export const PLANET_GLYPH: Record<string, string> = {
  'Солнце': '☉', 'Луна': '☽', 'Меркурий': '☿', 'Венера': '♀',
  'Марс': '♂', 'Юпитер': '♃', 'Сатурн': '♄', 'Уран': '♅',
  'Нептун': '♆', 'Раху': '☊', 'Кету': '☋',
};

// Коды Swiss Ephemeris.
export const SWE_CODE = {
  SUN: 0, MOON: 1, MERCURY: 2, VENUS: 3, MARS: 4, JUPITER: 5,
  SATURN: 6, URANUS: 7, NEPTUNE: 8, TRUE_NODE: 11,
} as const;

export const MOON = 'Луна';

// Базовые объекты. Порядок — от медленных к быстрым (для сортировки сводки).
// Луна и Кету обрабатываются особо (Кету = узел + 180).
export const BODIES: Record<string, number> = {
  'Нептун': SWE_CODE.NEPTUNE,
  'Уран': SWE_CODE.URANUS,
  'Сатурн': SWE_CODE.SATURN,
  'Юпитер': SWE_CODE.JUPITER,
  'Раху': SWE_CODE.TRUE_NODE,
  'Марс': SWE_CODE.MARS,
  'Солнце': SWE_CODE.SUN,
  'Венера': SWE_CODE.VENUS,
  'Меркурий': SWE_CODE.MERCURY,
};

// Имя → код для любого базового объекта (вкл. Луну/Кету).
export function bodyCode(name: string): number {
  if (name === MOON) return SWE_CODE.MOON;
  if (name === 'Кету') return SWE_CODE.TRUE_NODE;
  return BODIES[name];
}

export const ASPECTS: Record<string, { angle: number; symbol: string }> = {
  'соединение': { angle: 0, symbol: '☌' },
  'секстиль': { angle: 60, symbol: '⚹' },
  'квадрат': { angle: 90, symbol: '□' },
  'трин': { angle: 120, symbol: '△' },
  'оппозиция': { angle: 180, symbol: '☍' },
};

// «Медленные» — для деления аспектов на slow/fast и пометки applying/separating.
export const SLOW = new Set(['Нептун', 'Уран', 'Сатурн', 'Юпитер', 'Раху']);

// Порядок объектов в блоках аспектов (требование астролога 2026-06-30):
// по астрономической удалённости от Солнца — Солнце = центр, идёт ПЕРВЫМ (перед
// Меркурием и Венерой); далее планеты по средней дистанции. Внутри пары первой
// стоит более близкая к Солнцу (= более быстрая), и по вертикали сверху — пары,
// которые ведёт более быстрый объект. Луна (-1) всегда ведёт свой (отдельный) блок.
export const SUN_RANK: Record<string, number> = {
  'Луна': -1, 'Солнце': 0, 'Меркурий': 1, 'Венера': 2, 'Марс': 3,
  'Юпитер': 4, 'Сатурн': 5, 'Уран': 6, 'Нептун': 7, 'Раху': 8, 'Кету': 9,
};
export const sunRank = (name: string): number => SUN_RANK[name] ?? 99;

// Флаги расчёта: SWIEPH (полные файлы — на устройстве) либо MOSEPH (для сверки
// с питон-эталоном, у которого нет файлов). +FLG_SPEED.
export const FLAG_SWIEPH = 2 | 256;
export const FLAG_MOSEPH = 4 | 256;
