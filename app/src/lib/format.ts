/** Форматирование для вывода (позиции в знак+градус, время в поясе пользователя). */
import { ZODIAC, SIGN_GLYPH } from '../engine/constants.ts';

/** «♒ 0°29′ Водолея» — знак+градус, НЕ сырая долгота (требование астролога). */
export function fmtPos(lon: number): string {
  const i = ((Math.floor(lon / 30) % 12) + 12) % 12;
  const deg = ((lon % 30) + 30) % 30;
  let d = Math.floor(deg);
  let m = Math.round((deg - d) * 60);
  if (m === 60) { m = 0; d += 1; }
  return `${SIGN_GLYPH[i]} ${d}°${String(m).padStart(2, '0')}′ ${ZODIAC[i]}`;
}

export function fmtTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(date);
}

export function fmtDateShort(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: 'numeric', month: 'short' }).format(date);
}

/** `date` — якорь дня (UTC-полночь, в чьих UTC-полях лежит гражданская Y-M-D);
 *  поэтому форматируем в UTC, чтобы подпись не «съезжала» в поясах ≠ UTC. */
export function fmtDayFull(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/** Компактная подпись даты для шапки: «30 июн., вт» (разгрузка строки, #4). */
export function fmtDayMid(date: Date): string {
  const d = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(date);
  const w = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'short' }).format(date);
  return `${d}, ${w}`;
}

// --- пояс-зависимые сутки (требование астролога: всё в одном поясе из настроек) ---

/** Смещение пояса tz (мс): сколько прибавить к UTC, чтобы получить настенное
 *  время пояса на момент instant. */
function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(instant)) if (part.type !== 'literal') p[part.type] = +part.value;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant.getTime();
}

/** UTC-инстант, соответствующий 00:00 пояса tz на гражданскую дату-якорь civil. */
export function zonedDayStartUTC(civil: Date, tz: string): Date {
  const guess = Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate());
  const off = tzOffsetMs(new Date(guess), tz);
  let utc = guess - off;
  const off2 = tzOffsetMs(new Date(utc), tz); // уточнение на DST-переходе
  if (off2 !== off) utc = guess - off2;
  return new Date(utc);
}

/** Гражданская дата-якорь (UTC-полночь Y-M-D) для произвольного момента в поясе tz.
 *  Нужна, чтобы из точного времени аспекта получить «день», к которому листать. */
export function civilOf(instant: Date, tz: string): Date {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(instant)) if (part.type !== 'literal') p[part.type] = +part.value;
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

/** Гражданская «сегодняшняя» дата в поясе tz как якорь дня (UTC-полночь Y-M-D). */
export function todayCivil(tz: string): Date {
  return civilOf(new Date(), tz);
}

/** Точка в окне орбиса в пределах ли тех же суток (для подписи «через полночь»). */
export function sameDay(a: Date, b: Date, tz: string): boolean {
  const f = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return f(a) === f(b);
}

export const applyingArrow = (applying: boolean): string => (applying ? '→' : '←');

/** Характер аспекта для цвето-/хапти-кодирования (§3.9). */
export function aspectTone(aspect: string): 'harm' | 'tense' | 'neutral' {
  if (aspect === 'трин' || aspect === 'секстиль') return 'harm';
  if (aspect === 'квадрат' || aspect === 'оппозиция') return 'tense';
  return 'neutral'; // соединение
}
