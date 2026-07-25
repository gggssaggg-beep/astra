/**
 * Восстановление НАПРАВЛЕНИЯ транзита у старых заметок (lib/notesMigrate.ts).
 *
 * Реальный случай владелицы (2026-07-25): рожд. 20.06.1988, натальное Солнце
 * 28°39′ Близнецов, натальный Марс 17°23′ Рыб.
 *   • 07.03.2026 — транзитное СОЛНЦЕ на её натальный МАРС  (раз в год);
 *   • 09.08.2026 — транзитный МАРС на её натальное СОЛНЦЕ  (раз в 2 года).
 * Обе заметки имеют ОДНУ пару «Марс|Солнце|соединение», но это разные события.
 * Миграция обязана развести их по датам и не приписать направление там, где
 * ответ неоднозначен.
 *
 * Запуск: node test/notesdir.mjs
 */
import { createEngine } from '../src/engine/index.ts';
import { recoverNoteDirections } from '../src/lib/notesMigrate.ts';
import { parseTransitSignature } from '../src/lib/signature.ts';

const E = await createEngine('moshier');
const birth = new Date(Date.UTC(1988, 5, 19, 18, 21));   // 20.06.1988 01:21 +07
const natal = E.positions(birth);
const orbOf = () => 1;

const sun = natal.find((p) => p.name === 'Солнце');
const mars = natal.find((p) => p.name === 'Марс');
let ok = 0, bad = 0;
const check = (name, cond, info = '') => {
  if (cond) { ok++; console.log(`  ok   ${name}`); }
  else { bad++; console.log(`  БАГ  ${name} ${info}`); }
};
console.log(`Натал: Солнце ${sun.degInSign.toFixed(2)}° ${sun.sign}, Марс ${mars.degInSign.toFixed(2)}° ${mars.sign}\n`);

const note = (id, date) => ({ id, createdAt: `${date}T12:00:00Z`, date, text: 'наблюдение',
  objects: ['Марс', 'Солнце'], aspectSignature: 'Марс|Солнце|соединение' });

const notes = [
  note('march', '2026-03-07'),   // транзитное Солнце → натальный Марс
  note('august', '2026-08-09'),  // транзитный Марс → натальное Солнце
  note('empty', '2026-05-15'),   // в этот день ни того, ни другого — направления нет
];

const res = recoverNoteDirections(E, notes, natal, orbOf);
const got = (id) => {
  const s = res.updates.get(id);
  return s ? parseTransitSignature(s) : null;
};

const m = got('march');
check('март: направление определено', !!m, JSON.stringify(m));
check('март: натальный Марс, транзитное Солнце',
  m && m.natal === 'Марс' && m.transit === 'Солнце', JSON.stringify(m));

const a = got('august');
check('август: направление определено', !!a, JSON.stringify(a));
check('август: натальное Солнце, транзитный Марс',
  a && a.natal === 'Солнце' && a.transit === 'Марс', JSON.stringify(a));

check('март и август разведены', m && a && m.natal !== a.natal);
check('пустой день: направление НЕ выдумано', !res.updates.has('empty'));

// заметка с уже проставленным направлением не трогается
const already = [{ ...note('done', '2026-03-07'), transitSignature: 'н:Марс|т:Солнце|соединение' }];
check('готовое направление не перезаписано',
  recoverNoteDirections(E, already, natal, orbOf).updates.size === 0);

console.log(`\nвсего: определено ${res.updates.size}, неоднозначных ${res.ambiguous}, «небо» ${res.sky}`);
console.log(bad === 0 ? `notesdir: все ${ok} проверок прошли ✓` : `notesdir: ПРОВАЛ, ${bad} из ${ok + bad}`);
process.exit(bad === 0 ? 0 : 1);
