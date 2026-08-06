/**
 * УПАГРАХИ — «под-грахи», теневые точки карты. Просьба астролога от 03.08.2026,
 * п.3. Классических одиннадцать, и делятся они на две НЕСВЯЗАННЫЕ группы.
 *
 * 1. Пять от долготы Солнца (Дхума → Вьятипата → Паривеша → Индрачапа →
 *    Упакету). Тут спора между школами нет: цепочка жёсткая и замкнутая —
 *    Упакету + 30° снова даёт Солнце (проверяется тестом).
 *
 * 2. Шесть от ЧАСТЕЙ СУТОК (Кала, Мритью, Ардхапрахара, Ямагантака, Гулика,
 *    Манди). Светлое время делится на восемь равных частей, тёмное — тоже;
 *    у каждой части свой владыка, и упаграха — это ЛАГНА на границе «своей»
 *    части. Значит, нужны восход и закат по месту рождения: без места этой
 *    группы не существует (как и домов).
 *
 * Развилки школ закрыл Георгий 06.08.2026: лагна берётся на СЕРЕДИНЕ своей
 * части, и только у Манди — на НАЧАЛЕ; Гулика и Манди — две разные точки
 * (обе в части Сатурна, но на разных её мгновениях). Ночной счёт владык
 * стартует с владыки пятого дня — оставлено как было («сделай, как
 * рекомендует AI», п.6): это самый распространённый вариант классики.
 * Метод подписан в интерфейсе, чтобы его можно было сверить с Jagannatha Hora.
 */

const norm = (x: number): number => ((x % 360) + 360) % 360;

// ─── группа 1: от Солнца ───────────────────────────────────────────────────

export interface UpagrahaPoint {
  name: string;
  lon: number;          // сидерическая долгота, °
  /** откуда взялась: 'sun' — цепочка от Солнца, 'part' — часть суток */
  source: 'sun' | 'part';
}

/**
 * Пять упаграх от Солнца. Дхума = Солнце + 133°20′ (4 знака 13°20′), дальше
 * цепочка отражений: Вьятипата = 360° − Дхума, Паривеша = Вьятипата + 180°,
 * Индрачапа = 360° − Паривеша, Упакету = Индрачапа + 16°40′.
 */
export function sunUpagrahas(sunLon: number): UpagrahaPoint[] {
  const dhuma = norm(sunLon + 133 + 20 / 60);
  const vyatipata = norm(360 - dhuma);
  const parivesha = norm(vyatipata + 180);
  const indrachapa = norm(360 - parivesha);
  const upaketu = norm(indrachapa + 16 + 40 / 60);
  return [
    { name: 'Дхума', lon: dhuma, source: 'sun' },
    { name: 'Вьятипата', lon: vyatipata, source: 'sun' },
    { name: 'Паривеша', lon: parivesha, source: 'sun' },
    { name: 'Индрачапа', lon: indrachapa, source: 'sun' },
    { name: 'Упакету', lon: upaketu, source: 'sun' },
  ];
}

// ─── группа 2: от частей суток ─────────────────────────────────────────────

/** Владыки дней недели, они же владыки частей: 0 = воскресенье. */
export const WEEK_LORDS = ['Солнце', 'Луна', 'Марс', 'Меркурий', 'Юпитер', 'Венера', 'Сатурн'];
export const WEEKDAY_RU = ['воскресенье', 'понедельник', 'вторник', 'среда',
  'четверг', 'пятница', 'суббота'];

/** Момент внутри части, на который берётся лагна. */
export type PartEdge = 'start' | 'mid' | 'end';

/**
 * Какая упаграха рождается в части какой грахи и на каком её мгновении.
 * Правило Георгия (06.08.2026): у всех — СЕРЕДИНА части, у Манди — НАЧАЛО.
 * Гулика и Манди обе живут в части Сатурна и потому отличаются только этим:
 * Гулика — середина, Манди — начало. Точки разные, как он и просил.
 */
const PART_OWNER: { name: string; lord: string; edge: PartEdge }[] = [
  { name: 'Кала', lord: 'Солнце', edge: 'mid' },
  { name: 'Мритью', lord: 'Марс', edge: 'mid' },
  { name: 'Ардхапрахара', lord: 'Меркурий', edge: 'mid' },
  { name: 'Ямагантака', lord: 'Юпитер', edge: 'mid' },
  { name: 'Гулика', lord: 'Сатурн', edge: 'mid' },
  { name: 'Манди', lord: 'Сатурн', edge: 'start' },
];

/** Светлый или тёмный отрезок суток, внутри которого случилось рождение. */
export interface DayFrame {
  /** true — рождение между восходом и закатом */
  dayBirth: boolean;
  /** границы отрезка: восход→закат либо закат→следующий восход */
  start: Date;
  end: Date;
  /** вара (день недели джйотиша) — от ВОСХОДА, а не от полуночи: 0 = вс */
  weekday: number;
  /** восход, открывший этот джйотиш-день */
  sunrise: Date;
  sunset: Date;
  nextSunrise: Date;
}

/** Что нужно от неба, чтобы построить эту группу (движок подставляет сам). */
export interface SkyForUpagraha {
  /** ближайший восход Солнца ПОСЛЕ момента (null — заполярье) */
  riseAfter(t: Date): Date | null;
  /** ближайший закат ПОСЛЕ момента */
  setAfter(t: Date): Date | null;
  /** лагна (сидерическая долгота Асцендента) на момент */
  asc(t: Date): number;
  /** день недели по МЕСТНОЙ дате момента: 0 = вс … 6 = сб */
  weekday(t: Date): number;
}

const DAY_MS = 86400000;

/**
 * Отрезок суток, в который попало рождение. Джйотиш-сутки начинаются с
 * ВОСХОДА: рождение в час ночи относится к предыдущему дню недели, и это
 * ночная половина. null — восхода/заката нет (полярный день или ночь).
 */
export function dayFrame(birth: Date, sky: SkyForUpagraha): DayFrame | null {
  // последний восход перед рождением = первый восход после «сутки назад»
  const sunrise = sky.riseAfter(new Date(birth.getTime() - DAY_MS));
  if (!sunrise || sunrise > birth) return null;
  const sunset = sky.setAfter(sunrise);
  if (!sunset) return null;
  const nextSunrise = sky.riseAfter(sunset);
  if (!nextSunrise) return null;
  const dayBirth = birth < sunset;
  return {
    dayBirth,
    start: dayBirth ? sunrise : sunset,
    end: dayBirth ? sunset : nextSunrise,
    weekday: sky.weekday(sunrise),
    sunrise, sunset, nextSunrise,
  };
}

export interface UpagrahaPart extends UpagrahaPoint {
  lord: string;         // владыка части
  part: number;         // номер части, 1..8
  from: Date;
  to: Date;
  at: Date;             // момент, на который взята лагна
  edge: PartEdge;       // какое мгновение части это было
}

/**
 * Владыка части `part` (1..8). Днём счёт начинается с владыки самого дня
 * недели, ночью — с владыки ПЯТОГО дня от него (вс → чт). Восьмая часть
 * остаётся без владыки: семь грах разбирают первые семь.
 */
export function partLord(frame: DayFrame, part: number): string | null {
  if (part < 1 || part > 7) return null;
  const shift = frame.dayBirth ? 0 : 4;   // ночь — «пятый день от текущего»
  return WEEK_LORDS[(frame.weekday + shift + part - 1) % 7];
}

/**
 * Шесть упаграх от частей суток. Лагна берётся на СЕРЕДИНЕ своей части
 * (у Манди — на начале: это и отличает её от Гулики).
 */
export function partUpagrahas(frame: DayFrame, sky: SkyForUpagraha): UpagrahaPart[] {
  const span = (frame.end.getTime() - frame.start.getTime()) / 8;
  const out: UpagrahaPart[] = [];
  for (const { name, lord, edge } of PART_OWNER) {
    const part = [1, 2, 3, 4, 5, 6, 7].find((k) => partLord(frame, k) === lord);
    if (!part) continue;
    const from = new Date(frame.start.getTime() + span * (part - 1));
    const to = new Date(from.getTime() + span);
    const at = edge === 'start' ? from
      : edge === 'end' ? to
        : new Date(from.getTime() + span / 2);
    out.push({ name, lord, part, from, to, at, edge, lon: sky.asc(at), source: 'part' });
  }
  return out;
}

export interface UpagrahaResult {
  /** все посчитанные упаграхи в порядке вывода */
  points: UpagrahaPoint[];
  /** шесть «суточных» с деталями частей (пусто, если нет восхода/заката) */
  parts: UpagrahaPart[];
  frame: DayFrame | null;
}

/** Полный набор: пять от Солнца + шесть от частей суток (если есть место). */
export function upagrahas(birth: Date, sunLon: number, sky: SkyForUpagraha | null): UpagrahaResult {
  const fromSun = sunUpagrahas(sunLon);
  const frame = sky ? dayFrame(birth, sky) : null;
  const parts = frame && sky ? partUpagrahas(frame, sky) : [];
  return { points: [...fromSun, ...parts], parts, frame };
}
