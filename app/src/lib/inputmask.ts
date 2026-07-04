/**
 * Строчный ввод даты и времени «только цифрами» с авто-вставкой разделителей
 * (просьба владелицы: исключить неверный ввод, время — до секунд). Маска не
 * зависит от нативных пикеров (на Android WebView `type=date/time` капризничают).
 *
 * maskDate: цифры → «ДД.ММ.ГГГГ». maskTime: цифры → «ЧЧ:ММ:СС».
 * Парсеры возвращают нормализованное значение либо null (значит — ввод неполон/битый).
 */

/** Оставить только цифры и сгруппировать под маску даты ДД.ММ.ГГГГ. */
export function maskDate(raw: string): string {
  const g = raw.replace(/\D/g, '').slice(0, 8); // ДДММГГГГ
  let out = g.slice(0, 2);
  if (g.length > 2) out += '.' + g.slice(2, 4);
  if (g.length > 4) out += '.' + g.slice(4, 8);
  return out;
}

/** Оставить только цифры и сгруппировать под маску времени ЧЧ:ММ:СС. */
export function maskTime(raw: string): string {
  const g = raw.replace(/\D/g, '').slice(0, 6); // ЧЧММСС
  let out = g.slice(0, 2);
  if (g.length > 2) out += ':' + g.slice(2, 4);
  if (g.length > 4) out += ':' + g.slice(4, 6);
  return out;
}

/** «ДД.ММ.ГГГГ» → 'YYYY-MM-DD' (валидация реальной даты) либо null. */
export function isoFromMasked(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null; // напр. 31.02
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** 'YYYY-MM-DD' → «ДД.ММ.ГГГГ» (для показа при правке существующего). */
export function maskedFromIso(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
}

/** «ЧЧ:ММ» или «ЧЧ:ММ:СС» → нормализованное 'HH:MM:SS' либо null (секунды опц.). */
export function normTime(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2], se = m[3] ? +m[3] : 0;
  if (h > 23 || mi > 59 || se > 59) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(mi)}:${p(se)}`;
}
