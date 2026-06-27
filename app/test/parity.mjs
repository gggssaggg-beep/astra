/**
 * Парити-тест TS-движка против питон-эталона (spike/reference_dump.json, Moshier).
 * Проверяет, что порт ядра (позиции + аспекты с точным временем/окном/applying)
 * даёт тот же результат, что engine_reference. Движок создаётся в режиме
 * 'moshier' — у эталона нет файлов эфемерид, сравнение «яблоки к яблокам».
 *
 * Запуск:  node test/parity.mjs   (Node ≥23.6 исполняет .ts напрямую)
 */
import { createEngine, aspectsOn } from '../src/engine/index.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ref = JSON.parse(readFileSync(
  fileURLToPath(new URL('../../spike/reference_dump.json', import.meta.url)), 'utf8'));

const angDiff = (a, b) => ((a - b) % 360 + 540) % 360 - 180;
const E = await createEngine('moshier');

// ---- позиции ----
let maxPosErr = 0, worstPos = null;
for (const date of Object.keys(ref.dates)) {
  const [y, m, d] = date.split('-').map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  for (const p of E.positions(noon)) {
    const r = ref.dates[date].positions[p.name];
    const err = Math.abs(angDiff(p.lon, r.lon_moseph)) * 3600;
    if (err > maxPosErr) { maxPosErr = err; worstPos = `${date} ${p.name}`; }
  }
}

// ---- аспекты ----
let aspChecked = 0, aspMissing = 0, aspExtra = 0, maxTimeErr = 0, maxOrbErr = 0, worstT = null;
for (const date of Object.keys(ref.dates)) {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const dayAsp = aspectsOn(E, day, 1.0, true);
  const got = [...dayAsp.slow, ...dayAsp.fast, ...dayAsp.moon];
  const refList = ref.dates[date].aspects;

  const key = (a) => [a.p1, a.p2].sort().join('|') + '|' + a.aspect;
  const gotMap = new Map(got.map((a) => [key(a), a]));
  const refMap = new Map(refList.map((a) => [key(a), a]));

  for (const [k, r] of refMap) {
    const g = gotMap.get(k);
    if (!g) { aspMissing++; console.log(`  ⚠ нет в движке: ${date} ${k}`); continue; }
    aspChecked++;
    maxOrbErr = Math.max(maxOrbErr, Math.abs(g.exactOrb - r.exact_orb));
    if (r.exact_time && g.exactTime) {
      const err = Math.abs(g.exactTime.getTime() - new Date(r.exact_time).getTime()) / 1000;
      if (err > maxTimeErr) { maxTimeErr = err; worstT = `${date} ${k}`; }
    }
  }
  for (const k of gotMap.keys()) if (!refMap.has(k)) { aspExtra++; console.log(`  ⚠ лишний в движке: ${date} ${k}`); }
}

console.log('\n=== ПАРИТИ TS-движок ↔ эталон (Moshier) ===');
console.log(`позиции: макс. ошибка ${maxPosErr.toExponential(2)}″  (худший ${worstPos})`);
console.log(`аспекты: сверено ${aspChecked}, нет в движке ${aspMissing}, лишних ${aspExtra}`);
console.log(`  макс. ошибка орбиса: ${maxOrbErr.toFixed(4)}°`);
console.log(`  макс. ошибка времени точного: ${maxTimeErr.toFixed(2)} сек  (худший ${worstT})`);

const pass = maxPosErr < 1 && aspMissing === 0 && aspExtra === 0 && maxTimeErr <= 60 && maxOrbErr <= 0.01;
console.log(`\nИТОГ: ${pass ? '✅ ПРОЙДЕНО' : '❌ ПРОВАЛ'}`);
process.exit(pass ? 0 : 1);
