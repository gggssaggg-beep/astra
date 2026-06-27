/**
 * Спайк-сверка, ШАГ 2+3: WASM Swiss Ephemeris (Moshier) против эталона pysweph.
 * Сверяем долготы (допуск 0.01°) и скорости всех объектов на контрольных датах.
 *
 * Движок: swisseph-wasm (см. engine.mjs).
 * Запуск:  node verify_wasm.mjs   (из папки spike/)
 */
import { createEngine, NAMES, BODY, watchdog } from './engine.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ref = JSON.parse(readFileSync(fileURLToPath(new URL('./reference_dump.json', import.meta.url)), 'utf8'));
const TOL_DEG = 0.01;
const angDiff = (a, b) => ((a - b) % 360 + 540) % 360 - 180;

const wd = watchdog(30_000, 'сверка позиций');
const E = await createEngine();

console.log('WASM swe.version =', E.version());
console.log('эталон swe.version =', ref.swe_version, '\n');

let maxLonErr = 0, maxSpdErr = 0, maxJdErr = 0, worst = null;
const perDate = [];

for (const date of Object.keys(ref.dates)) {
  const [y, m, d] = date.split('-').map(Number);
  const jd = E.julday(y, m, d, 12);
  maxJdErr = Math.max(maxJdErr, Math.abs(jd - ref.dates[date].jd_noon));
  let dateMax = 0;
  for (const name of NAMES) {
    const p = name === 'Кету'
      ? { longitude: E.lon(jd, 'Кету'), longitudeSpeed: E.pos(jd, BODY['Раху']).longitudeSpeed }
      : E.pos(jd, BODY[name]);
    const lonW = p.longitude, spdW = p.longitudeSpeed;
    const r = ref.dates[date].positions[name];
    const lonErr = Math.abs(angDiff(lonW, r.lon_moseph));
    const spdErr = Math.abs(spdW - r.speed);
    dateMax = Math.max(dateMax, lonErr);
    if (lonErr > maxLonErr) { maxLonErr = lonErr; worst = { date, name, lonW, ref: r.lon_moseph }; }
    maxSpdErr = Math.max(maxSpdErr, spdErr);
  }
  perDate.push({ date, dateMaxArcsec: dateMax * 3600 });
}

console.log('Макс. ошибка долготы по датам (″):');
for (const p of perDate) console.log(`  ${p.date}:  ${p.dateMaxArcsec.toFixed(4)}″`);

console.log('\n=== ИТОГ СВЕРКИ ПОЗИЦИЙ ===');
console.log(`JD расхождение (макс):       ${(maxJdErr * 86400).toExponential(2)} сек`);
console.log(`Долгота — макс. ошибка:      ${maxLonErr.toFixed(8)}°  = ${(maxLonErr * 3600).toFixed(4)}″`);
console.log(`Скорость — макс. ошибка:     ${maxSpdErr.toExponential(3)} °/сут`);
if (worst) console.log(`Худший случай: ${worst.date} ${worst.name}  WASM=${worst.lonW.toFixed(6)}°  эталон=${worst.ref.toFixed(6)}°`);

const pass = maxLonErr <= TOL_DEG;
console.log(`\nДопуск долгот ≤ ${TOL_DEG}° (=36″):  ${pass ? '✅ ПРОЙДЕНО' : '❌ ПРОВАЛ'}`);
clearTimeout(wd);
E.close();
process.exit(pass ? 0 : 1);
