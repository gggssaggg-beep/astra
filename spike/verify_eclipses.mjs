/**
 * Спайк-сверка, ШАГ 5: ЗАТМЕНИЯ и номера Сароса (§10.1), WASM против эталона.
 *
 * Для каждой контрольной точки эталон (pysweph) нашёл следующее затмение с
 * временем максимума, типом и номером серии/члена Сароса. Здесь НЕЗАВИСИМО
 * считаем то же через WASM (engine.mjs: when->where->how для солнечных,
 * when->how для лунных) и сверяем:
 *   - время максимума ≤ 1 мин,
 *   - тип (биты retflag) совпадает,
 *   - номер серии Сароса и номер члена совпадают точно.
 *
 * Движок: swisseph-wasm. Запуск: node verify_eclipses.mjs (после dump:ref)
 */
import { createEngine, watchdog, ECL } from './engine.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ref = JSON.parse(readFileSync(fileURLToPath(new URL('./reference_dump.json', import.meta.url)), 'utf8'));
const ecl = ref.eclipses;
if (!ecl) { console.error('❌ В reference_dump.json нет раздела eclipses — перезапусти dump:ref.'); process.exit(1); }

const TOL_SEC = 60;
const TYPE_MASK = ECL.TOTAL | ECL.ANNULAR | ECL.PARTIAL | ECL.ANNULAR_TOTAL | ECL.PENUMBRAL;

function jdFromISO(iso) {
  const dt = new Date(iso);
  const h = dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600;
  return E.julday(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), h);
}

const wd = watchdog(30_000, 'сверка затмений');
const E = await createEngine();

let checked = 0, fails = 0, maxErrSec = 0;

function compare(kind, refList, compute) {
  console.log(`\n=== ${kind} ===`);
  for (const r of refList) {
    const w = compute(E.julday(...r.start.split('-').map(Number), 0));
    const errSec = Math.abs(w.tmax - jdFromISO(r.time)) * 86400;
    const typeOk = (w.retflag & TYPE_MASK) === (r.retflag & TYPE_MASK);
    const sarosOk = w.saros === r.saros && w.member === r.member;
    const timeOk = errSec <= TOL_SEC;
    const ok = typeOk && sarosOk && timeOk;
    checked++; if (!ok) fails++; maxErrSec = Math.max(maxErrSec, errSec);
    console.log(
      `  ${r.time.slice(0, 16)}  WASM Сарос ${w.saros}/${w.member}` +
      `  эталон ${r.saros}/${r.member}  Δt=${errSec.toFixed(1)}с  тип:${typeOk ? 'ok' : 'РАЗН'}  ${ok ? '✅' : '❌'}`
    );
  }
}

compare('СОЛНЕЧНЫЕ ЗАТМЕНИЯ', ecl.solar, (jd) => E.solEclipse(jd));
compare('ЛУННЫЕ ЗАТМЕНИЯ', ecl.lunar, (jd) => E.lunEclipse(jd));

clearTimeout(wd);
E.close();

console.log(`\n=== ИТОГ ЗАТМЕНИЙ ===`);
console.log(`сверено: ${checked}; провалов: ${fails}; макс. Δt: ${maxErrSec.toFixed(1)} сек`);
const pass = fails === 0;
console.log(`Сарос+время+тип (допуск t ≤ ${TOL_SEC}с): ${pass ? '✅ ПРОЙДЕНО' : '❌ ПРОВАЛ'}`);
process.exit(pass ? 0 : 1);
