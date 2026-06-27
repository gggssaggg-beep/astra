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

export function fmtDayFull(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
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
