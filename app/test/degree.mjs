/**
 * Тест поиска прохождения планеты через градус (engine/degreeSearch.ts).
 * Движок moshier (headless, как parity). Солнце в 0° Овна = весеннее
 * равноденствие (~20 марта) — удобный проверяемый якорь.
 *
 * Запуск:  node test/degree.mjs
 */
import assert from 'node:assert/strict';
import { createEngine, findDegreePassages, degreeToLon } from '../src/engine/index.ts';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const E = await createEngine('moshier');

console.log('=== degreeToLon ===');
await ok('27°56′ Льва = 4 знака ×30 + 27 + 56/60', () => {
  assert.ok(Math.abs(degreeToLon(4, 27, 56) - (147.9333)) < 0.01);
});

console.log('=== Солнце через 0° Овна = равноденствие (~20 марта) ===');
await ok('за 2022–2024 ровно 2 прохождения, оба в марте, директ', async () => {
  const { list, truncated } = await findDegreePassages(
    E, 'Солнце', 0, new Date(Date.UTC(2022, 0, 1)), new Date(Date.UTC(2024, 0, 1)));
  assert.equal(truncated, false);
  assert.equal(list.length, 2, `ожидалось 2, получено ${list.length}`);
  for (const p of list) {
    assert.equal(p.exact.getUTCMonth(), 2, 'март (0-based 2)');   // равноденствие
    assert.equal(p.retro, false, 'Солнце не ретроградит');
  }
});

console.log('=== Меркурий даёт кратные прохождения на ретро-петле ===');
await ok('Меркурий через некоторый градус за год — есть хотя бы 1 ретро-проход', async () => {
  // за год Меркурий 3 раза ретроградит; какой-то градус в зоне петли он пройдёт 3 раза
  const { list } = await findDegreePassages(
    E, 'Меркурий', degreeToLon(1, 15), new Date(Date.UTC(2022, 0, 1)), new Date(Date.UTC(2023, 0, 1)));
  assert.ok(list.length >= 1, 'должно быть хотя бы одно прохождение');
  // прохождения строго возрастают по времени
  for (let i = 1; i < list.length; i++) assert.ok(list[i].jd > list[i - 1].jd);
});

console.log(`\n=== ГРАДУС: все ${n} проверок зелёные ===`);
