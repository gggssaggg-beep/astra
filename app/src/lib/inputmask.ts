/**
 * Строчный ввод даты и времени «только цифрами» с УМНОЙ авто-вставкой
 * разделителей (просьба владелицы, раунд 17):
 *  • после полной пары цифр разделитель ставится сам: «02» → «02:»;
 *  • невозможная пара достраивается нулём: часы «25» → «02:5», день «45» →
 *    «04.5», месяц «13» → «01.3» (первая цифра уходит в следующую группу);
 *  • удаление разделителя стирает и цифру перед ним (иначе маска «залипала»:
 *    backspace убирал «:», маска тут же возвращала его);
 *  • двухзначный год разворачивается по пивоту: 00–27 → 20xx, 28–99 → 19xx
 *    («26» → 2026, «89» → 1989 — раньше 89 превращался в 2089).
 *
 * Маска не зависит от нативных пикеров (на Android WebView type=date/time
 * капризничают). Парсеры возвращают нормализованное значение либо null.
 */

// пивот двухзначного года: чуть больше текущего — «26»→2026, «89»→1989
const YY_PIVOT = (new Date().getFullYear() % 100) + 1;
export const expandYear = (y: number): number =>
  y >= 100 ? y : y <= YY_PIVOT ? 2000 + y : 1900 + y;

/** Пара цифр с пределами: первая цифра больше maxFirst ЛИБО пара больше maxPair
 *  → достроить нулём («25» часов → «02», хвост уходит дальше). */
function takePair(g: string, i: number, maxFirst: number, maxPair: number): [string, number] {
  if (i >= g.length) return ['', i];
  const d1 = g[i];
  if (+d1 > maxFirst) return ['0' + d1, i + 1];
  if (i + 1 >= g.length) return [d1, i + 1];          // ждём вторую цифру
  const two = d1 + g[i + 1];
  if (+two > maxPair) return ['0' + d1, i + 1];
  return [two, i + 2];
}

// удаление: если пользователь стёр РАЗДЕЛИТЕЛЬ, стираем и цифру перед ним
function handleDelete(raw: string, prev: string, sep: string): string {
  if (!prev || raw.length >= prev.length) return raw;
  if (prev.endsWith(sep) && prev.slice(0, -1) === raw) return raw.slice(0, -1);
  return raw;
}

/** Разложить цифры по фиксированным группам, БЕЗ умного достраивания нулём.
 *  Нужно при УДАЛЕНИИ: иначе стёртая в середине цифра «залечивалась» —
 *  takePair подтягивал цифру из следующей группы, и поле не менялось вовсе
 *  («стираю, а ничего не происходит» — жалоба владелицы 2026-07-25). */
function positional(g: string, sizes: number[], sep: string): string {
  const out: string[] = [];
  let i = 0;
  for (const n of sizes) {
    if (i >= g.length) break;
    out.push(g.slice(i, i + n));
    i += n;
  }
  return out.join(sep);
}

/** Цифры → «ДД.ММ.ГГГГ» с умными парами. prev — прошлое значение поля (для
 *  корректного backspace); можно не передавать.
 *  При удалении умные пары ОТКЛЮЧЕНЫ (см. positional). */
export function maskDate(raw: string, prev = ''): string {
  const deleting = !!prev && raw.length < prev.length;
  const g = handleDelete(raw, prev, '.').replace(/\D/g, '').slice(0, 8);
  if (deleting) return positional(g, [2, 2, 4], '.');
  const [dd, i1] = takePair(g, 0, 3, 31);
  const [mm, i2] = takePair(g, i1, 1, 12);
  if (dd.length < 2) return dd;
  if (mm.length < 2) return `${dd}.${mm}`;
  return `${dd}.${mm}.${g.slice(i2, i2 + 4)}`;
}

/** Цифры → «ЧЧ:ММ:СС» с умными парами («25» → «02:5»).
 *  При удалении умные пары ОТКЛЮЧЕНЫ (см. positional). */
export function maskTime(raw: string, prev = ''): string {
  const deleting = !!prev && raw.length < prev.length;
  const g = handleDelete(raw, prev, ':').replace(/\D/g, '').slice(0, 6);
  if (deleting) return positional(g, [2, 2, 2], ':');
  const [hh, i1] = takePair(g, 0, 2, 23);
  const [mm, i2] = takePair(g, i1, 5, 59);
  const [ss] = takePair(g, i2, 5, 59);
  if (hh.length < 2) return hh;
  if (mm.length < 2) return `${hh}:${mm}`;
  return `${hh}:${mm}:${ss}`;
}

/**
 * Маска С СОХРАНЕНИЕМ КУРСОРА. Сама маска пересобирает строку из цифр с нуля,
 * поэтому браузер ставил курсор в конец: правка в середине (стоишь на месяце,
 * жмёшь backspace) выглядела как «стирает с конца и тупит» — жалоба владелицы
 * 2026-07-25. Считаем, сколько ЦИФР стояло левее курсора, и после маскирования
 * возвращаем курсор на то же место по счёту цифр.
 *
 * el — поле ввода (значение уже изменено браузером), mask — maskDate/maskTime,
 * prev — прошлое значение (нужно самой маске для корректного backspace).
 * Возвращает готовое значение и позицию курсора.
 */
export function maskWithCaret(
  el: { value: string; selectionStart: number | null },
  mask: (raw: string, prev?: string) => string,
  prev: string,
): { value: string; caret: number } {
  const raw = el.value;
  const caret = el.selectionStart ?? raw.length;
  const digitsBefore = (raw.slice(0, caret).match(/\d/g) ?? []).length;
  const value = mask(raw, prev);
  // маска сама дописала цифру (часы «25» → «02:5»): счёт цифр сбит, курсор по
  // нему встал бы ПЕРЕД только что введённой — в таком случае уводим в конец
  const nRaw = (raw.match(/\d/g) ?? []).length;
  const nOut = (value.match(/\d/g) ?? []).length;
  if (nOut > nRaw) return { value, caret: value.length };
  // позиция ПОСЛЕ того же количества цифр в новой строке
  let pos = 0, seen = 0;
  while (pos < value.length && seen < digitsBefore) {
    if (/\d/.test(value[pos])) seen++;
    pos++;
  }
  // печатали вперёд и упёрлись в разделитель — перескочить через него,
  // чтобы следующая цифра шла в новую группу, а не «перед точкой»
  if (raw.length > prev.length) {
    while (pos < value.length && !/\d/.test(value[pos])) pos++;
  }
  return { value, caret: pos };
}

/** «ДД.ММ.ГГГГ» (или с двухзначным годом) → 'YYYY-MM-DD' либо null. */
export function isoFromMasked(s: string): string | null {
  const m = s.trim().replace(/\.$/, '').match(/^(\d{2})\.(\d{2})\.(\d{2}|\d{4})$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = expandYear(+m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null; // напр. 31.02
  return `${y}-${m[2]}-${m[1]}`;
}

/** 'YYYY-MM-DD' → «ДД.ММ.ГГГГ» (для показа при правке существующего). */
export function maskedFromIso(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
}

/** «ЧЧ:ММ[:СС]» (терпимо к неполным минутам/секундам и висячему «:») →
 *  нормализованное 'HH:MM:SS' либо null. «02:5» → «02:05». */
export function normTime(s: string): string | null {
  const m = s.trim().replace(/:$/, '').match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2], se = m[3] ? +m[3] : 0;
  if (h > 23 || mi > 59 || se > 59) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(mi)}:${p(se)}`;
}
