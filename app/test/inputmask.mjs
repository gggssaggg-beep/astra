/**
 * Тест маски ввода даты/времени (жалоба владелицы 2026-07-25: «если курсор
 * стоит на месяце или дне, при удалении начинает удалять с конца и тупит»).
 * Проверяет ДВЕ вещи, из-за которых это происходило:
 *   1) курсор возвращается на своё место после перемаскирования;
 *   2) удаление в середине реально стирает цифру, а не «залечивается» умной
 *      парой (takePair подтягивал цифру из следующей группы — поле не менялось).
 *
 * Запуск: node test/inputmask.mjs
 */
import { maskDate, maskTime, maskWithCaret, isoFromMasked, normTime } from '../src/lib/inputmask.ts';

const F = (v, c) => ({ value: v, selectionStart: c });
let ok = 0, bad = 0;
const eq = (name, got, exp) => {
  if (got === exp) { ok++; }
  else { bad++; console.log(`  БАГ  ${name}: ${got} ≠ ${exp}`); }
};
const caret = (name, el, mask, prev, exp) => {
  const r = maskWithCaret(el, mask, prev);
  eq(name, `${r.value}|${r.caret}`, exp);
};

// --- набор подряд ---
let v = '', prev = '';
for (const d of '20061988') { const r = maskWithCaret(F(v + d, v.length + 1), maskDate, prev); prev = v = r.value; }
eq('набор даты 20061988', v, '20.06.1988');
let tv = '', tp = '';
for (const d of '012100') { const r = maskWithCaret(F(tv + d, tv.length + 1), maskTime, tp); tp = tv = r.value; }
eq('набор времени 012100', tv, '01:21:00');

// --- удаление В СЕРЕДИНЕ: цифра реально стирается, курсор остаётся на месте ---
caret('удаление в месяце', F('20.0.1988', 4), maskDate, '20.06.1988', '20.01.988|4');
caret('удаление в дне',    F('2.06.1988', 1), maskDate, '20.06.1988', '20.61.988|1');
caret('удаление в часах',  F('0:21:00', 1),  maskTime, '01:21:00',   '02:10:0|1');

// --- удаление с конца: прежнее поведение сохранено ---
caret('backspace с конца',      F('20.06.198', 9), maskDate, '20.06.1988', '20.06.198|9');
caret('backspace разделителя',  F('20.06', 5),     maskDate, '20.06.',     '20.0|4');

// --- умное достраивание при НАБОРЕ не сломано (курсор в конец) ---
caret('часы 25 → 02:5', F('25', 2), maskTime, '2', '02:5|4');
caret('день 45',        F('45', 2), maskDate, '4', '04.05.|6');

// --- парсеры ---
eq('isoFromMasked', isoFromMasked('20.06.1988'), '1988-06-20');
eq('двухзначный год', isoFromMasked('20.06.88'), '1988-06-20');
eq('31.02 отбито',   isoFromMasked('31.02.1988'), null);
eq('normTime «01:21»', normTime('01:21'), '01:21:00');

console.log(bad === 0 ? `inputmask: все ${ok} проверок прошли ✓` : `inputmask: ПРОВАЛ, ${bad} из ${ok + bad}`);
process.exit(bad === 0 ? 0 : 1);
