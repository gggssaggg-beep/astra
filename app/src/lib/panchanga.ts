/**
 * Панчанга — «пять членов» дня джйотиша: вара, титхи, накшатра Луны, йога,
 * карана. Это ведический аналог западного «содержания дня»: астролог смотрит
 * панчангу вместо списка аспектов с орбисами.
 *
 * Здесь только то, чего ещё нет в `lib/vedic.ts`: вара, йога, карана и моменты
 * переходов. Накшатра (`nakshatraOf`) и титхи (`tithiOf`) переиспользуются
 * оттуда — таблицы не дублируются.
 *
 * ⚠ ЗОДИАК. Долготы на вход обязаны приходить из СИДЕРИЧЕСКОГО движка
 * (`getEngine` с `zodiac:'sidereal'`, в ведическом режиме App отдаёт именно
 * его). Титхи и карана считаются от РАЗНИЦЫ Луна−Солнце и к аянамше
 * безразличны, а накшатра и йога — нет: у йоги в формуле СУММА долгот, и сдвиг
 * аянамши сдвигает её вдвое. Пересчёт из тропических долгот здесь не делается
 * намеренно — иначе легко «потерять» аянамшу настроек.
 */
import { nakshatraOf, tithiOf, NAKSHATRAS, NAK_SPAN } from './vedic.ts';
import type { NakshatraInfo, TithiInfo } from './vedic.ts';
import type { Engine } from '../engine/index.ts';

const norm = (d: number): number => ((d % 360) + 360) % 360;

// ─── вара (день недели) ────────────────────────────────────────────────────
// Владыка дня — планета часа восхода: Вс Солнце, Пн Луна, Вт Марс, Ср Меркурий,
// Чт Юпитер, Пт Венера, Сб Сатурн.
//
// ⚠ Упрощение v1: классическая вара идёт от ВОСХОДА до восхода, поэтому до
// рассвета формально держится вара предыдущего дня. Мы берём гражданские сутки
// (полночь–полночь) — так же показывает большинство карманных панчанг, но с
// восходом это не сверено. Честный вариант потребует восхода по месту.
export interface VaraInfo {
  index: number;   // 0..6, как в JS getUTCDay (0 = воскресенье)
  name: string;    // санскритское имя вары
  lord: string;    // граха-владыка дня
  day: string;     // русское название дня недели
}

export const VARAS: { name: string; lord: string; day: string }[] = [
  { name: 'Равивара', lord: 'Солнце', day: 'воскресенье' },
  { name: 'Сомавара', lord: 'Луна', day: 'понедельник' },
  { name: 'Мангалавара', lord: 'Марс', day: 'вторник' },
  { name: 'Будхавара', lord: 'Меркурий', day: 'среда' },
  { name: 'Гурувара', lord: 'Юпитер', day: 'четверг' },
  { name: 'Шукравара', lord: 'Венера', day: 'пятница' },
  { name: 'Шанивара', lord: 'Сатурн', day: 'суббота' },
];

/** Вара по гражданскому дню недели (0 = воскресенье, как `Date.getUTCDay`). */
export function varaOf(civilWeekday: number): VaraInfo {
  const i = ((civilWeekday % 7) + 7) % 7;
  return { index: i, ...VARAS[i] };
}

// ─── йога (27) ─────────────────────────────────────────────────────────────
// Йога = СУММА сидерических долгот Солнца и Луны, поделённая на 13°20′.
// Это не «аспект» и не соединение: просто ход двух светил, сложенный вместе.
export const YOGAS: string[] = [
  'Вишкамбха', 'Прити', 'Аюшман', 'Саубхагья', 'Шобхана', 'Атиганда',
  'Сукарма', 'Дхрити', 'Шула', 'Ганда', 'Вриддхи', 'Дхрува',
  'Вьягхата', 'Харшана', 'Ваджра', 'Сиддхи', 'Вьятипата', 'Варияна',
  'Паригха', 'Шива', 'Сиддха', 'Садхья', 'Шубха', 'Шукла',
  'Брахма', 'Индра', 'Вайдхрити',
];

export const YOGA_SPAN = 360 / 27;   // 13°20′ — та же дуга, что у накшатры

export interface YogaInfo {
  index: number;      // 1..27
  name: string;
  fraction: number;   // доля пройденной йоги, 0..1
}

export function yogaOf(sunLon: number, moonLon: number): YogaInfo {
  const s = norm(sunLon + moonLon);
  const i = Math.floor(s / YOGA_SPAN);
  return { index: i + 1, name: YOGAS[i], fraction: (s - i * YOGA_SPAN) / YOGA_SPAN };
}

// ─── карана (60 половин титхи) ─────────────────────────────────────────────
// Карана = половина титхи, 6° разницы Луна−Солнце. За лунный месяц их 60:
// четыре неподвижные (по одной за месяц) и семь подвижных, идущих по кругу
// восемь раз (7 × 8 = 56).
export const KARANA_MOVABLE: string[] = [
  'Бава', 'Балава', 'Каулава', 'Тайтила', 'Гара', 'Ваниджа', 'Вишти',
];
/** Неподвижные (стхира) караны — по номеру половины k (0..59). */
export const KARANA_FIXED: Record<number, string> = {
  0: 'Кимстугхна', 57: 'Шакуни', 58: 'Чатушпада', 59: 'Нага',
};
export const KARANA_COUNT = 60;

export interface KaranaInfo {
  index: number;      // 1..60 — номер половины титхи в лунном месяце
  name: string;
  movable: boolean;   // подвижная (одна из семи) или неподвижная
  fraction: number;   // доля пройденной караны, 0..1
}

export function karanaOf(sunLon: number, moonLon: number): KaranaInfo {
  const d = norm(moonLon - sunLon);
  const k = Math.floor(d / 6);                       // 0..59
  const fixed = KARANA_FIXED[k];
  return {
    index: k + 1,
    name: fixed ?? KARANA_MOVABLE[(k - 1) % 7],
    movable: !fixed,
    fraction: (d % 6) / 6,
  };
}

// ─── панчанга целиком ──────────────────────────────────────────────────────
export interface Panchanga {
  vara: VaraInfo;
  tithi: TithiInfo;
  nakshatra: NakshatraInfo;   // накшатра ЛУНЫ — «член» панчанги именно она
  yoga: YogaInfo;
  karana: KaranaInfo;
}

/** Пять членов дня разом. Долготы — сидерические, день недели — гражданский
 *  в поясе показа (не UTC: за полночь пояса вара уже другая). */
export function panchangaOf(sunLon: number, moonLon: number, civilWeekday: number): Panchanga {
  return {
    vara: varaOf(civilWeekday),
    tithi: tithiOf(sunLon, moonLon),
    nakshatra: nakshatraOf(moonLon),
    yoga: yogaOf(sunLon, moonLon),
    karana: karanaOf(sunLon, moonLon),
  };
}

// ─── моменты переходов (с движком) ─────────────────────────────────────────
// Луна идёт 11,7–15,4°/сут, значит границу накшатры (13°20′) она пересекает не
// позже чем через ~1,2 суток; разница Луна−Солнце растёт на 10,7–14,4°/сут,
// значит титхи (12°) сменится не позже чем через ~1,2 суток. Обе величины
// строго возрастают (у Луны нет попятного хода по долготе, а её скорость всегда
// больше солнечной) — годится обычный двоичный поиск в окне 2 суток.
const DAY_MS = 86_400_000;
const SEARCH_MS = 2 * DAY_MS;
const PRECISION_MS = 30_000;   // до половины минуты: показываем ЧЧ:ММ

/** Момент, когда возрастающая f(t) достигает target. f(t0)=0, f(t1)>target. */
function bisect(f: (t: number) => number, target: number, t0: number, t1: number): number {
  let lo = t0, hi = t1;
  while (hi - lo > PRECISION_MS) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface NakshatraEnd { at: Date; next: string; }
export interface TithiEnd { at: Date; next: number; }

/**
 * Когда Луна войдёт в СЛЕДУЮЩУЮ накшатру (и в какую именно).
 * Движок обязан быть сидерическим: границы накшатр — сидерические.
 */
export function nextNakshatraEnd(E: Engine, from: Date): NakshatraEnd {
  const t0 = from.getTime();
  const l0 = norm(E.lon(E.toJD(from), 'Луна'));
  const cur = nakshatraOf(l0);
  const need = NAK_SPAN * (1 - cur.fraction);            // сколько градусов осталось
  // пройденный путь Луны от старта: за 2 суток ≤31°, круг не замыкается
  const advance = (t: number) => norm(E.lon(E.toJD(new Date(t)), 'Луна') - l0);
  const at = bisect(advance, need, t0, t0 + SEARCH_MS);
  return { at: new Date(at), next: NAKSHATRAS[cur.index % 27].name };
}

/**
 * Когда закончится текущий титхи (разница Луна−Солнце дойдёт до кратного 12°)
 * и какой титхи (1..30) начнётся.
 */
export function nextTithiEnd(E: Engine, from: Date): TithiEnd {
  const t0 = from.getTime();
  const jd0 = E.toJD(from);
  const d0 = norm(E.lon(jd0, 'Луна') - E.lon(jd0, 'Солнце'));
  const need = 12 - (d0 % 12);
  const advance = (t: number) => {
    const jd = E.toJD(new Date(t));
    return norm(E.lon(jd, 'Луна') - E.lon(jd, 'Солнце') - d0);
  };
  const at = bisect(advance, need, t0, t0 + SEARCH_MS);
  const cur = Math.floor(d0 / 12) + 1;                   // 1..30
  return { at: new Date(at), next: (cur % 30) + 1 };
}
