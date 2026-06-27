/** Разбор свободного ввода даты (§3.3): 12.03.2026, 2026-03-12, 12/03/2026, 12.03. */
export function parseDateInput(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  let y: number, mo: number, d: number;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); // ISO
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/))) { // dd.mm.yyyy
    d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000;
  } else if ((m = s.match(/^(\d{1,2})[.\/](\d{1,2})\.?$/))) { // dd.mm (текущий год)
    d = +m[1]; mo = +m[2]; y = new Date().getFullYear();
  } else return null;

  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null; // напр. 31.02
  return dt;
}
