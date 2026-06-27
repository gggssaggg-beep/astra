/**
 * Спайк-сверка, ШАГ 4: ВРЕМЕНА ТОЧНЫХ АСПЕКТОВ (WASM против эталона).
 *
 * Берём каждый аспект из reference_dump.json с найденным exact_time и НЕЗАВИСИМО
 * считаем тот же момент через WASM той же бисекцией (порт _exact_time из
 * engine_reference/daily_aspects_astro.py). Сверяем с эталоном (допуск ≤1 мин).
 *
 * Движок: swisseph-wasm (см. engine.mjs).
 * Запуск:  node verify_aspects.mjs   (из папки spike/, после dump:ref)
 */
import { createEngine, watchdog } from './engine.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ref = JSON.parse(readFileSync(fileURLToPath(new URL('./reference_dump.json', import.meta.url)), 'utf8'));

const TARGET = { 'соединение': 0, 'секстиль': 60, 'квадрат': 90, 'трин': 120, 'оппозиция': 180 };
const TOL_SEC = 60;            // допуск ТЗ: до минуты
const angDiff = (a, b) => ((a - b) % 360 + 540) % 360 - 180;

const wd = watchdog(30_000, 'сверка аспектов');
const E = await createEngine();

// порт _exact_time: знаковая функция f, чей ноль = точный аспект (см. эталон)
function exactTime(n1, n2, target, jdStart, jdEnd) {
  const delta = (j) => angDiff(E.lon(j, n1), E.lon(j, n2));
  let f;
  if (target === 0) f = delta;
  else if (target === 180) f = (j) => angDiff(delta(j), 180);
  else f = (j) => Math.abs(delta(j)) - target;

  const step = 1 / 48;
  let prevJ = jdStart, prevV = f(jdStart), j = jdStart + step, found = null;
  while (j <= jdEnd) {
    const v = f(j);
    if ((prevV <= 0) !== (v <= 0) && Math.abs(prevV - v) < 30) {
      let lo = prevJ, hi = j;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if ((f(lo) <= 0) !== (f(mid) <= 0)) hi = mid; else lo = mid;
      }
      found = (lo + hi) / 2; break;
    }
    prevJ = j; prevV = v; j += step;
  }
  return found;
}

function jdFromISO(iso) {
  const dt = new Date(iso);
  const h = dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600;
  return E.julday(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), h);
}

let checked = 0, maxErrSec = 0, worst = null, misses = 0;

for (const date of Object.keys(ref.dates)) {
  const [y, m, d] = date.split('-').map(Number);
  const jd0 = E.julday(y, m, d, 0);
  const jd1 = jd0 + 1;
  for (const a of ref.dates[date].aspects) {
    if (!a.exact_time) continue;
    const target = TARGET[a.aspect];
    const jdW = exactTime(a.p1, a.p2, target, jd0, jd1);
    if (jdW == null) { misses++; console.log(`  ⚠ WASM не нашёл: ${date} ${a.p1}–${a.p2} ${a.aspect}`); continue; }
    const errSec = Math.abs(jdW - jdFromISO(a.exact_time)) * 86400;
    checked++;
    if (errSec > maxErrSec) { maxErrSec = errSec; worst = { date, a, errSec }; }
  }
}

clearTimeout(wd);
E.close();

console.log(`\n=== СВЕРКА ВРЕМЁН ТОЧНЫХ АСПЕКТОВ ===`);
console.log(`сверено событий: ${checked}`);
console.log(`WASM не нашёл (должно быть 0): ${misses}`);
console.log(`макс. расхождение времени: ${maxErrSec.toFixed(2)} сек`);
if (worst) console.log(`худший: ${worst.date} ${worst.a.p1}–${worst.a.p2} ${worst.a.aspect}  Δ=${worst.errSec.toFixed(2)}с`);

const pass = misses === 0 && maxErrSec <= TOL_SEC;
console.log(`\nДопуск ≤ ${TOL_SEC} сек:  ${pass ? '✅ ПРОЙДЕНО' : '❌ ПРОВАЛ'}`);
process.exit(pass ? 0 : 1);
