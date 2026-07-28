/**
 * Ведическая (джйотиш) математика — чистые функции от долгот, БЕЗ движка.
 * Сидерические долготы приходят снаружи (engine с zodiac:'sidereal').
 *
 * Что здесь: накшатры с падами, титхи (лунный день), классические управители
 * знаков, достоинства планет, караки (натуральные и чара-караки Джаймини),
 * периоды Вимшоттари и сборка карты D1 «дом → знак → планеты → где управитель».
 *
 * Все таблицы — канон джйотиша, не изобретение. Ключевые из них сверены с
 * программой астролога на карте 12.03.1998 (см. app/test/vedic.mjs):
 * накшатры Луны/Асцендента/Солнца, пады и их управители, набор чара-карак.
 */
import { ZODIAC } from '../engine/index.ts';

const norm = (d: number): number => ((d % 360) + 360) % 360;

// ─── накшатры ──────────────────────────────────────────────────────────────
// 27 лунных стоянок по 13°20′. Управитель — владыка периода Вимшоттари: именно
// от накшатры Луны отсчитываются даши, поэтому таблица одна на оба расчёта.
export const NAKSHATRAS: { name: string; lord: string }[] = [
  { name: 'Ашвини', lord: 'Кету' },
  { name: 'Бхарани', lord: 'Венера' },
  { name: 'Криттика', lord: 'Солнце' },
  { name: 'Рохини', lord: 'Луна' },
  { name: 'Мригашира', lord: 'Марс' },
  { name: 'Ардра', lord: 'Раху' },
  { name: 'Пунарвасу', lord: 'Юпитер' },
  { name: 'Пушья', lord: 'Сатурн' },
  { name: 'Ашлеша', lord: 'Меркурий' },
  { name: 'Магха', lord: 'Кету' },
  { name: 'Пурвапхалгуни', lord: 'Венера' },
  { name: 'Уттарапхалгуни', lord: 'Солнце' },
  { name: 'Хаста', lord: 'Луна' },
  { name: 'Читра', lord: 'Марс' },
  { name: 'Свати', lord: 'Раху' },
  { name: 'Вишакха', lord: 'Юпитер' },
  { name: 'Анурадха', lord: 'Сатурн' },
  { name: 'Джьештха', lord: 'Меркурий' },
  { name: 'Мула', lord: 'Кету' },
  { name: 'Пурвашадха', lord: 'Венера' },
  { name: 'Уттарашадха', lord: 'Солнце' },
  { name: 'Шравана', lord: 'Луна' },
  { name: 'Дхаништха', lord: 'Марс' },
  { name: 'Шатабхиша', lord: 'Раху' },
  { name: 'Пурвабхадра', lord: 'Юпитер' },
  { name: 'Уттарабхадра', lord: 'Сатурн' },
  { name: 'Ревати', lord: 'Меркурий' },
];

export const NAK_SPAN = 360 / 27;        // 13°20′
export const PADA_SPAN = NAK_SPAN / 4;   // 3°20′

export interface NakshatraInfo {
  index: number;     // 1..27
  name: string;
  lord: string;      // владыка (он же владыка даши)
  pada: number;      // 1..4
  /** доля пройденного внутри накшатры, 0..1 — из неё считается баланс даши */
  fraction: number;
}

export function nakshatraOf(lon: number): NakshatraInfo {
  const l = norm(lon);
  const i = Math.floor(l / NAK_SPAN);
  const inside = l - i * NAK_SPAN;
  return {
    index: i + 1,
    name: NAKSHATRAS[i].name,
    lord: NAKSHATRAS[i].lord,
    pada: Math.floor(inside / PADA_SPAN) + 1,
    fraction: inside / NAK_SPAN,
  };
}

// ─── титхи (лунный день) ───────────────────────────────────────────────────
// Титхи = 12° разницы Луна−Солнце. 1..15 — светлая половина (шукла), 16..30 —
// тёмная (кришна); 15 = полнолуние, 30 = новолуние.
const TITHI_NAMES = ['Пратипада', 'Двития', 'Тритија', 'Чатуртхи', 'Панчами',
  'Шаштхи', 'Саптами', 'Аштами', 'Навами', 'Дашами', 'Экадаши', 'Двадаши',
  'Трайодаши', 'Чатурдаши'];

export interface TithiInfo {
  index: number;              // 1..30 — «лунный день» как его показывают программы
  name: string;               // Пратипада … Пурнима/Амавасья
  paksha: 'шукла' | 'кришна'; // светлая / тёмная половина
  fraction: number;           // доля пройденного титхи, 0..1
}

export function tithiOf(sunLon: number, moonLon: number): TithiInfo {
  const d = norm(moonLon - sunLon);
  const i = Math.floor(d / 12);                 // 0..29
  const num = i + 1;
  const within = i % 15;                        // 0..14 внутри половины
  const name = within === 14 ? (i < 15 ? 'Пурнима' : 'Амавасья') : TITHI_NAMES[within];
  return {
    index: num,
    name,
    paksha: i < 15 ? 'шукла' : 'кришна',
    fraction: (d % 12) / 12,
  };
}

// ─── знаки: классические управители и достоинства ──────────────────────────
// В джйотише управители — только семь классических планет (Уран/Нептун и
// астероиды знаками не управляют). Авторская раскладка западной части проекта
// (SIGN_MYTHS) здесь НЕ применяется — это другая традиция.
export const SIGN_LORDS: string[] = [
  'Марс',      // Овен
  'Венера',    // Телец
  'Меркурий',  // Близнецы
  'Луна',      // Рак
  'Солнце',    // Лев
  'Меркурий',  // Дева
  'Венера',    // Весы
  'Марс',      // Скорпион
  'Юпитер',    // Стрелец
  'Сатурн',    // Козерог
  'Сатурн',    // Водолей
  'Юпитер',    // Рыбы
];

export const signIndexOf = (lon: number): number => Math.floor(norm(lon) / 30);
export const signLordOf = (lon: number): string => SIGN_LORDS[signIndexOf(lon)];
/** Дома, которыми управляет планета (1..12) при данной лагне — «Солнце (11)». */
export function ruledHouses(planet: string, lagnaSign: number): number[] {
  const out: number[] = [];
  SIGN_LORDS.forEach((lord, si) => {
    if (lord === planet) out.push(((si - lagnaSign + 12) % 12) + 1);
  });
  return out.sort((a, b) => a - b);
}

// Экзальтация: знак и градус высшей силы. Падение — противоположный знак, тот
// же градус. Мулатрикона — участок «своего» знака особой силы.
const EXALT: Record<string, { sign: number; deg: number }> = {
  'Солнце': { sign: 0, deg: 10 },    // Овен 10°
  'Луна': { sign: 1, deg: 3 },       // Телец 3°
  'Марс': { sign: 9, deg: 28 },      // Козерог 28°
  'Меркурий': { sign: 5, deg: 15 },  // Дева 15°
  'Юпитер': { sign: 3, deg: 5 },     // Рак 5°
  'Венера': { sign: 11, deg: 27 },   // Рыбы 27°
  'Сатурн': { sign: 6, deg: 20 },    // Весы 20°
};
const MOOLA: Record<string, { sign: number; from: number; to: number }> = {
  'Солнце': { sign: 4, from: 0, to: 20 },    // Лев 0–20°
  'Луна': { sign: 1, from: 4, to: 30 },      // Телец 4–30°
  'Марс': { sign: 0, from: 0, to: 12 },      // Овен 0–12°
  'Меркурий': { sign: 5, from: 16, to: 20 }, // Дева 16–20°
  'Юпитер': { sign: 8, from: 0, to: 10 },    // Стрелец 0–10°
  'Венера': { sign: 6, from: 0, to: 15 },    // Весы 0–15°
  'Сатурн': { sign: 10, from: 0, to: 20 },   // Водолей 0–20°
};

export type DignityKind = 'exalted' | 'debilitated' | 'moolatrikona' | 'own' | null;

export interface DignityInfo { kind: DignityKind; label: string; }

/** Достоинство планеты по положению: экзальтация / падение / мулатрикона /
 *  своя обитель. Узлы обителей не имеют — у них достоинство не считаем. */
export function dignityOf(planet: string, lon: number): DignityInfo {
  const si = signIndexOf(lon), deg = norm(lon) % 30;
  const ex = EXALT[planet];
  if (ex) {
    if (ex.sign === si) return { kind: 'exalted', label: 'экзальтация' };
    if ((ex.sign + 6) % 12 === si) return { kind: 'debilitated', label: 'падение' };
  }
  const mt = MOOLA[planet];
  if (mt && mt.sign === si && deg >= mt.from && deg < mt.to) {
    return { kind: 'moolatrikona', label: 'мулатрикона' };
  }
  if (SIGN_LORDS[si] === planet) return { kind: 'own', label: 'своя обитель' };
  return { kind: null, label: '' };
}

// ─── караки ────────────────────────────────────────────────────────────────
// Натуральные (наисаргика) караки — постоянные сигнификаторы: за что «отвечает»
// планета сама по себе, независимо от карты.
export const NATURAL_KARAKAS: Record<string, string> = {
  'Солнце': 'душа, отец, власть',
  'Луна': 'ум, мать, чувства',
  'Марс': 'сила, братья, земля',
  'Меркурий': 'речь, учёба, родня',
  'Юпитер': 'знание, дети, наставник',
  'Венера': 'любовь, супруг(а), достаток',
  'Сатурн': 'срок, труд, долголетие',
};

// Чара-караки Джаймини: семь планет ранжируются по ГРАДУСУ В ЗНАКЕ (больше —
// старше). Узлы в семикаракной схеме не участвуют — так же считает программа,
// по которой сверялись.
export const CHARA_KARAKAS = [
  { code: 'АК', name: 'Атмакарака', of: 'душа, сам человек' },
  { code: 'АмК', name: 'Аматьякарака', of: 'дело, карьера' },
  { code: 'БК', name: 'Бхратрикарака', of: 'братья, наставник' },
  { code: 'МК', name: 'Матрикарака', of: 'мать, дом' },
  { code: 'ПиК', name: 'Питрикарака', of: 'отец' },
  { code: 'ГК', name: 'Гнатикарака', of: 'препятствия, родня' },
  { code: 'ДК', name: 'Даракарака', of: 'супруг(а)' },
];

const CHARA_BODIES = ['Солнце', 'Луна', 'Марс', 'Меркурий', 'Юпитер', 'Венера', 'Сатурн'];

/** Чара-караки: планета → код (АК, АмК, …). На вход — сидерические долготы. */
export function charaKarakas(lons: Record<string, number>): Record<string, string> {
  const ranked = CHARA_BODIES
    .filter((p) => lons[p] != null)
    .map((p) => ({ p, deg: norm(lons[p]) % 30 }))
    .sort((a, b) => b.deg - a.deg);
  const out: Record<string, string> = {};
  ranked.forEach((r, i) => { if (i < CHARA_KARAKAS.length) out[r.p] = CHARA_KARAKAS[i].code; });
  return out;
}

// ─── Вимшоттари даши ───────────────────────────────────────────────────────
// Цикл 120 лет, порядок владык фиксирован и начинается с накшатры Луны.
export const VIMSHOTTARI: { lord: string; years: number }[] = [
  { lord: 'Кету', years: 7 }, { lord: 'Венера', years: 20 }, { lord: 'Солнце', years: 6 },
  { lord: 'Луна', years: 10 }, { lord: 'Марс', years: 7 }, { lord: 'Раху', years: 18 },
  { lord: 'Юпитер', years: 16 }, { lord: 'Сатурн', years: 19 }, { lord: 'Меркурий', years: 17 },
];
export const VIM_TOTAL = 120;
/** Год даши = 365,25 суток (юлианский). Сверено по календарным датам периодов
 *  в программе астролога: 20 лет Венеры дают ровно день-в-день через 20 лет. */
export const DASHA_YEAR_DAYS = 365.25;

export interface DashaPeriod {
  lord: string;
  from: Date;
  to: Date;
  sub?: DashaPeriod[];   // антардаши внутри махадаши
}

const addYears = (d: Date, years: number): Date =>
  new Date(d.getTime() + years * DASHA_YEAR_DAYS * 86400000);

/**
 * Периоды Вимшоттари от рождения. Первая махадаша — владыка накшатры Луны, и
 * она НЕПОЛНАЯ: к моменту рождения часть её уже прошла (доля = положение Луны
 * внутри накшатры). Возвращаем полный цикл 120 лет с антардашами.
 */
export function vimshottari(moonLon: number, birthUTC: Date): DashaPeriod[] {
  const nak = nakshatraOf(moonLon);
  const start = VIMSHOTTARI.findIndex((v) => v.lord === nak.lord);
  const out: DashaPeriod[] = [];
  // начало первой махадаши — в прошлом, до рождения: отматываем пройденную долю
  let cursor = addYears(birthUTC, -nak.fraction * VIMSHOTTARI[start].years);
  for (let k = 0; k < VIMSHOTTARI.length; k++) {
    const { lord, years } = VIMSHOTTARI[(start + k) % VIMSHOTTARI.length];
    const from = cursor, to = addYears(from, years);
    // антардаши: те же владыки в том же порядке, длительность пропорциональна
    const subStart = VIMSHOTTARI.findIndex((v) => v.lord === lord);
    const sub: DashaPeriod[] = [];
    let sc = from;
    for (let j = 0; j < VIMSHOTTARI.length; j++) {
      const s = VIMSHOTTARI[(subStart + j) % VIMSHOTTARI.length];
      const sTo = addYears(sc, years * s.years / VIM_TOTAL);
      sub.push({ lord: s.lord, from: sc, to: sTo });
      sc = sTo;
    }
    out.push({ lord, from, to, sub });
    cursor = to;
  }
  return out;
}

/** Действующие маха/антар/пратьянтар на момент. Пратьянтар считаем на лету —
 *  третий уровень нужен только «сейчас», хранить весь его незачем. */
export function currentDasha(periods: DashaPeriod[], at: Date): {
  maha?: DashaPeriod; antar?: DashaPeriod; pratyantar?: DashaPeriod;
} {
  const t = at.getTime();
  const maha = periods.find((p) => t >= p.from.getTime() && t < p.to.getTime());
  const antar = maha?.sub?.find((p) => t >= p.from.getTime() && t < p.to.getTime());
  let pratyantar: DashaPeriod | undefined;
  if (antar) {
    const len = (antar.to.getTime() - antar.from.getTime()) / 86400000 / DASHA_YEAR_DAYS;
    const i0 = VIMSHOTTARI.findIndex((v) => v.lord === antar.lord);
    let c = antar.from;
    for (let j = 0; j < VIMSHOTTARI.length; j++) {
      const s = VIMSHOTTARI[(i0 + j) % VIMSHOTTARI.length];
      const to = addYears(c, len * s.years / VIM_TOTAL);
      if (t >= c.getTime() && t < to.getTime()) { pratyantar = { lord: s.lord, from: c, to }; break; }
      c = to;
    }
  }
  return { maha, antar, pratyantar };
}

// ─── варги (дробные карты) ─────────────────────────────────────────────────
/**
 * Знак планеты в варге D-n: круг делится на 12·n частей, части нумеруются
 * подряд от 0° Овна и раскладываются по знакам по кругу. Для D9 эта формула
 * тождественна классическому правилу «подвижный знак начинает с себя,
 * фиксированный — с 9-го, двойственный — с 5-го».
 *
 * Сверено с таблицей джйотиш-программы астролога (карта 12.03.1998): навамша
 * всех шести планет с караками и Асцендента совпала.
 */
export const vargaSign = (lon: number, n: number): number =>
  Math.floor(norm(lon) / (30 / n)) % 12;

/** Навамша (D9) — вторая по важности карта после раши: её астролог смотрит
 *  рядом со знаком, чтобы понять, «дотягивает» ли планета обещанное. */
export const navamshaSign = (lon: number): number => vargaSign(lon, 9);

// ─── отношения планет ──────────────────────────────────────────────────────
// Натуральные (наисаргика) отношения — постоянные, из классики. Кто не назван
// другом или врагом, тот нейтрален. Узлы в схему не входят.
const NAT_FRIENDS: Record<string, string[]> = {
  'Солнце': ['Луна', 'Марс', 'Юпитер'],
  'Луна': ['Солнце', 'Меркурий'],
  'Марс': ['Солнце', 'Луна', 'Юпитер'],
  'Меркурий': ['Солнце', 'Венера'],
  'Юпитер': ['Солнце', 'Луна', 'Марс'],
  'Венера': ['Меркурий', 'Сатурн'],
  'Сатурн': ['Меркурий', 'Венера'],
};
const NAT_ENEMIES: Record<string, string[]> = {
  'Солнце': ['Венера', 'Сатурн'],
  'Луна': [],
  'Марс': ['Меркурий'],
  'Меркурий': ['Луна'],
  'Юпитер': ['Меркурий', 'Венера'],
  'Венера': ['Солнце', 'Луна'],
  'Сатурн': ['Солнце', 'Луна', 'Марс'],
};

export type Relation = 'greatFriend' | 'friend' | 'neutral' | 'enemy' | 'greatEnemy';
export const RELATION_LABEL: Record<Relation, string> = {
  greatFriend: 'большой друг', friend: 'друг', neutral: 'нейтрально',
  enemy: 'враг', greatEnemy: 'большой враг',
};

/** Натуральное отношение A к B (постоянное). */
export function naturalRelation(a: string, b: string): 'friend' | 'neutral' | 'enemy' | null {
  if (!NAT_FRIENDS[a] || !NAT_FRIENDS[b]) return null;   // узлы отношений не имеют
  if (NAT_FRIENDS[a].includes(b)) return 'friend';
  if (NAT_ENEMIES[a].includes(b)) return 'enemy';
  return 'neutral';
}

/**
 * Временное (таткалика) отношение — зависит от конкретной карты: планеты во
 * 2, 3, 4, 10, 11 и 12-м знаке ОТ данной ей временно дружественны, в 1, 5, 6,
 * 7, 8 и 9-м — временно враждебны.
 */
export function temporalRelation(fromSign: number, toSign: number): 'friend' | 'enemy' {
  const d = ((toSign - fromSign) % 12 + 12) % 12 + 1;   // 1..12
  return [2, 3, 4, 10, 11, 12].includes(d) ? 'friend' : 'enemy';
}

/** Составное (панчадха) отношение: натуральное + временное. */
export function compoundRelation(
  nat: 'friend' | 'neutral' | 'enemy', tmp: 'friend' | 'enemy',
): Relation {
  if (nat === 'friend') return tmp === 'friend' ? 'greatFriend' : 'neutral';
  if (nat === 'enemy') return tmp === 'friend' ? 'neutral' : 'greatEnemy';
  return tmp === 'friend' ? 'friend' : 'enemy';
}

// ─── карта D1 (раши) ───────────────────────────────────────────────────────
export interface VedicPlanet {
  name: string;
  lon: number;          // сидерическая долгота
  signIndex: number;    // 0..11
  sign: string;
  degInSign: number;
  retro: boolean;
  house: number;        // 1..12 (whole sign от лагны)
  nakshatra: NakshatraInfo;
  dignity: DignityInfo;
  rules: number[];      // дома, которыми управляет (для узлов — пусто)
  karaka?: string;      // код чара-караки
  navamsha: number;     // знак в навамше (D9), 0..11
  /** Как планета относится к хозяину знака, в котором стоит: гостит у друга
   *  или у врага. Null у узлов и у планеты в своём знаке (хозяин — она сама). */
  hostRelation: Relation | null;
  host: string;         // хозяин знака (диспозитор)
}

export interface VedicHouse {
  house: number;        // 1..12
  signIndex: number;    // знак этого дома
  sign: string;
  lord: string;         // управитель знака
  lordHouse: number;    // в каком доме стоит управитель (0 — его нет в наборе)
  planets: VedicPlanet[];
}

export interface VedicChart {
  lagnaSign: number;    // знак лагны, 0..11
  lagnaLon: number;     // точная долгота Асцендента
  lagnaNakshatra: NakshatraInfo;
  planets: VedicPlanet[];
  houses: VedicHouse[];
  moonSign: number;     // раши Луны — «лунный знак», основа джйотиш-чтения
  moonNakshatra: NakshatraInfo;
  tithi: TithiInfo;
}

/** Дом планеты при целознаковых домах: считаем ЗНАКИ от лагны, а не градусы. */
export const wholeSignHouse = (lon: number, lagnaSign: number): number =>
  ((signIndexOf(lon) - lagnaSign + 12) % 12) + 1;

/**
 * Сборка карты D1. На вход — сидерические долготы объектов (имя → долгота),
 * флаги ретроградности и долгота Асцендента.
 */
export function buildVedicChart(
  lons: Record<string, number>,
  retro: Record<string, boolean>,
  ascLon: number,
): VedicChart {
  const lagnaSign = signIndexOf(ascLon);
  const karakas = charaKarakas(lons);
  const names = Object.keys(lons);

  const planets: VedicPlanet[] = names.map((name) => {
    const lon = norm(lons[name]);
    const si = signIndexOf(lon);
    const host = SIGN_LORDS[si];
    // отношение к хозяину знака: натуральное + временное (по расположению
    // хозяина относительно самой планеты в этой карте)
    let hostRelation: Relation | null = null;
    const nat = host === name ? null : naturalRelation(name, host);
    if (nat && lons[host] != null) {
      hostRelation = compoundRelation(nat, temporalRelation(si, signIndexOf(lons[host])));
    }
    return {
      name, lon, signIndex: si, sign: ZODIAC[si], degInSign: lon % 30,
      retro: !!retro[name],
      house: wholeSignHouse(lon, lagnaSign),
      nakshatra: nakshatraOf(lon),
      dignity: dignityOf(name, lon),
      rules: ruledHouses(name, lagnaSign),
      karaka: karakas[name],
      navamsha: navamshaSign(lon),
      hostRelation, host,
    };
  });

  const houses: VedicHouse[] = Array.from({ length: 12 }, (_, i) => {
    const si = (lagnaSign + i) % 12;
    const lord = SIGN_LORDS[si];
    const lordPos = planets.find((p) => p.name === lord);
    return {
      house: i + 1, signIndex: si, sign: ZODIAC[si], lord,
      lordHouse: lordPos ? lordPos.house : 0,
      planets: planets.filter((p) => p.house === i + 1),
    };
  });

  const moonLon = norm(lons['Луна'] ?? 0);
  return {
    lagnaSign, lagnaLon: norm(ascLon), lagnaNakshatra: nakshatraOf(ascLon),
    planets, houses,
    moonSign: signIndexOf(moonLon), moonNakshatra: nakshatraOf(moonLon),
    tithi: tithiOf(norm(lons['Солнце'] ?? 0), moonLon),
  };
}
