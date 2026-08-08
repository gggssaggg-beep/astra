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

/** Позиция с ретро-меткой ЕДИНОЙ строкой: «♓ 19°26′ ℞ Рыбы» — ℞ между градусами
 *  и знаком, не отдельным спаном (тот переносился на новую строку: «то вместе,
 *  то перенос», жалоба владелицы). */
export function fmtPosRx(lon: number, retro: boolean): string {
  const i = ((Math.floor(lon / 30) % 12) + 12) % 12;
  const deg = ((lon % 30) + 30) % 30;
  let d = Math.floor(deg);
  let m = Math.round((deg - d) * 60);
  if (m === 60) { m = 0; d += 1; }
  return `${SIGN_GLYPH[i]} ${d}°${String(m).padStart(2, '0')}′${retro ? ' ℞' : ''} ${ZODIAC[i]}`;
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

/** Компактная подпись даты для шапки: «30 июн. 2026, вт» (с годом — просьба владелицы). */
export function fmtDayMid(date: Date): string {
  const d = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(date);
  const w = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'short' }).format(date);
  return `${d} ${date.getUTCFullYear()}, ${w}`;
}

// --- пояс-зависимые сутки (требование астролога: всё в одном поясе из настроек) ---

/**
 * Пояс, заданный ЧИСЛОМ, а не городом: «+03:00», «-04:30» (правка астролога
 * 2026-07-29 — «нужен GMT+3, город не находится»). Канонический вид хранения —
 * «±ЧЧ:ММ»: его же понимает Intl на свежих движках, поэтому строка остаётся
 * годной и там, где пояс просто печатают.
 *
 * Смещение ФИКСИРОВАНО: перевода часов у такого пояса нет — астролог берёт то
 * смещение, которое было в месте рождения в тот день.
 * @returns минуты от UTC либо null, если это не числовой пояс.
 */
export function fixedTzMinutes(tz: string): number | null {
  const m = /^([+-])(\d{1,2}):(\d{2})$/.exec(tz.trim());
  if (!m) return null;
  const h = +m[2], mi = +m[3];
  if (h > 14 || mi > 59) return null;
  return (m[1] === '-' ? -1 : 1) * (h * 60 + mi);
}

/** Минуты от UTC → канонический «+03:00» (так пояс кладётся в карту человека). */
export function fixedTzId(minutes: number): string {
  const s = minutes < 0 ? '-' : '+', a = Math.abs(minutes);
  return `${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/** Подпись пояса для человека: «GMT+3», «GMT+5:30»; города остаются как есть. */
export function tzLabel(tz: string): string {
  const off = fixedTzMinutes(tz);
  if (off == null) return tz;
  const a = Math.abs(off), m = a % 60;
  return `GMT${off < 0 ? '−' : '+'}${Math.floor(a / 60)}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** Пояс годен для расчёта: либо числовое смещение, либо известный Intl город. */
export function tzValid(tz: string): boolean {
  if (fixedTzMinutes(tz) != null) return true;
  try { new Intl.DateTimeFormat('ru', { timeZone: tz }); return true; } catch { return false; }
}

/** Смещение пояса tz (мс): сколько прибавить к UTC, чтобы получить настенное
 *  время пояса на момент instant. */
function tzOffsetMs(instant: Date, tz: string): number {
  // числовой пояс считаем сами: старые движки WebView не знают «+03:00» в Intl
  const fixed = fixedTzMinutes(tz);
  if (fixed != null) return fixed * 60_000;
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(instant)) if (part.type !== 'literal') p[part.type] = +part.value;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant.getTime();
}

/** То же смещение в МИНУТАХ и без броска: null, если пояс не опознан.
 *  Нужно проверке правдоподобия координат (`lib/geo.ts`): у пояса есть свой
 *  средний меридиан, и долгота, промахнувшаяся мимо него на часы, — повод
 *  переспросить человека. */
export function tzOffsetMinutes(instant: Date, tz: string): number | null {
  try { return tzOffsetMs(instant, tz) / 60_000; } catch { return null; }
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

/** UTC-инстант гражданских «дата + время» в поясе tz (DST-безопасно: та же
 *  итерация смещения, что в zonedDayStartUTC — полночь+часы ошибалась бы на
 *  день перевода часов). Для момента рождения в совмещённых картах. */
export function zonedTimeUTC(dateStr: string, timeStr: string, tz: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi, se] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, se || 0);
  const off = tzOffsetMs(new Date(guess), tz);
  let utc = guess - off;
  const off2 = tzOffsetMs(new Date(utc), tz);
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

/** «сегодня / вчера / N дн. назад» для дат журнала (YYYY-MM-DD в выбранном
 *  поясе); старше недели — обычная дд.мм.гггг. Журнал становится «личным». */
export function fmtRelDay(s: string, tz: string): string {
  const [y, m, d] = s.split('-').map(Number);
  const diff = Math.round((todayCivil(tz).getTime() - Date.UTC(y, m - 1, d)) / 86400000);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'вчера';
  if (diff === -1) return 'завтра';
  if (diff > 1 && diff < 7) return `${diff} дн. назад`;
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}
