/**
 * Спайк-сверка SWIEPH↔SWIEPH, ШАГ 2: swisseph-wasm в режиме SWIEPH против
 * эталона (swieph_dump.json). Чтобы сравнение было «бит-в-бит», в виртуальную ФС
 * движка записываются ТЕ ЖЕ файлы из ../ephe (ядро + astN/*), что отданы pysweph.
 * Это заодно проверяет реальный путь загрузки файлов на устройстве (incl. TNO).
 *
 * Запуск:  node verify_swieph.mjs   (после dump_swieph.py)
 */
import SwissEph from 'swisseph-wasm';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SWIEPH = 2 | 256;        // FLG_SWIEPH | FLG_SPEED
const TOL_DEG = 0.01;          // допуск ТЗ (с огромным запасом — ждём ~0)
const angDiff = (a, b) => ((a - b) % 360 + 540) % 360 - 180;

const ref = JSON.parse(readFileSync(fileURLToPath(new URL('./swieph_dump.json', import.meta.url)), 'utf8'));
const EPHE = fileURLToPath(new URL('../ephe/', import.meta.url));

// карта имя→код берётся из дампа (data-driven, совпадает с dump_swieph.py)
const CODE = ref.codes;

const swe = new SwissEph();
await swe.initSwissEph();
const m = swe.SweModule, FS = m.FS;

// записать все файлы из ../ephe в /sweph (с подпапками astN), чтобы оба движка
// читали ИДЕНТИЧНЫЕ файлы.
function mount(dir, fsDir) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const src = dir + name.name;
    if (name.isDirectory()) {
      const sub = fsDir + '/' + name.name;
      try { FS.mkdir(sub); } catch {}
      mount(src + '/', sub);
    } else if (name.name.endsWith('.se1')) {
      FS.writeFile(fsDir + '/' + name.name, new Uint8Array(readFileSync(src)));
    }
  }
}
if (existsSync(EPHE)) mount(EPHE, '/sweph');
console.log('swe', swe.version(), '— ФС /sweph:', FS.readdir('/sweph').filter(f => !f.startsWith('.')).join(', '));
try { console.log('  /sweph/ast136:', FS.readdir('/sweph/ast136').filter(f => f.endsWith('.se1')).join(', ') || '(пусто)'); } catch {}

function calc(jd, code) {
  const xx = m._malloc(6 * 8), serr = m._malloc(256);
  const rf = m.ccall('swe_calc_ut','number',['number','number','number','number','number'],[jd, code, SWIEPH, xx, serr]);
  const lon = m.HEAPF64[xx >> 3], spd = m.HEAPF64[(xx >> 3) + 3], err = m.UTF8ToString(serr);
  m._free(xx); m._free(serr);
  return { rf, lon, spd, err };
}

let maxLon = 0, maxSpd = 0, worst = null, checked = 0, fails = 0;
const seen = new Set();

for (const date of Object.keys(ref.dates)) {
  const [y, mo, d] = date.split('-').map(Number);
  const jd = swe.julday(y, mo, d, 12);
  const positions = ref.dates[date].positions;
  for (const name of Object.keys(positions)) {
    seen.add(name);
    let lonW, spdW;
    if (name === 'Кету') { const p = calc(jd, 11); lonW = (p.lon + 180) % 360; spdW = p.spd; }
    else { const p = calc(jd, CODE[name]); if (p.rf < 0) { fails++; console.log(`  ❌ ${date} ${name}: ${p.err}`); continue; } lonW = p.lon; spdW = p.spd; }
    const r = positions[name];
    const le = Math.abs(angDiff(lonW, r.lon)), se = Math.abs(spdW - r.speed);
    checked++;
    if (le > maxLon) { maxLon = le; worst = { date, name, lonW, ref: r.lon }; }
    if (se > maxSpd) maxSpd = se;
  }
}

// swe.close() здесь не зовём: на Windows эмскриптен+libuv роняет ассерт при
// teardown уже после получения результата. process.exit ниже всё освободит.
console.log(`\n=== SWIEPH↔SWIEPH (pysweph vs swisseph-wasm, идентичные файлы) ===`);
console.log(`объекты (${seen.size}): ${[...seen].join(', ')}`);
console.log(`сверено значений: ${checked};  ошибок расчёта: ${fails}`);
console.log(`макс. ошибка долготы: ${(maxLon * 3600).toFixed(5)}″  (${maxLon.toExponential(2)}°)`);
console.log(`макс. ошибка скорости: ${maxSpd.toExponential(3)} °/сут`);
if (worst) console.log(`худший: ${worst.date} ${worst.name}  WASM=${worst.lonW.toFixed(7)}  эталон=${worst.ref.toFixed(7)}`);

const pass = fails === 0 && maxLon <= TOL_DEG;
console.log(`\nДопуск ≤ ${TOL_DEG}°:  ${pass ? '✅ ПРОЙДЕНО' : '❌ ПРОВАЛ'}`);
// Примечание: после строки PASS на Windows печатается безвредный ассерт libuv
// (teardown воркера wasm в Node). Код выхода корректный (0/1), на результат не
// влияет; в Capacitor/браузере этого нет.
process.exit(pass ? 0 : 1);
