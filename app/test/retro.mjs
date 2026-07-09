/**
 * Тест фаз ретроградности (engine/retro.ts). Движок moshier (headless).
 * Меркурий ретроградил 14 янв – 3 фев 2022 — проверяемый якорь.
 *
 * Запуск:  node test/retro.mjs
 */
import assert from 'node:assert/strict';
import { createEngine, retroPhase } from '../src/engine/index.ts';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const E = await createEngine('moshier');
const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12));

console.log('=== Солнце/Луна не ретроградят ===');
await ok('Солнце всегда direct', () => assert.equal(retroPhase(E, 'Солнце', D(2022, 1, 25)), 'direct'));
await ok('Луна всегда direct', () => assert.equal(retroPhase(E, 'Луна', D(2022, 6, 1)), 'direct'));

console.log('=== Меркурий: середина ретро-периода янв 2022 ===');
await ok('25 янв 2022 — ретроградный ход', () => {
  assert.equal(retroPhase(E, 'Меркурий', D(2022, 1, 25)), 'retro');
});
await ok('перед 14 янв (10 янв) — не ретро (тень-до/станция/директ)', () => {
  const ph = retroPhase(E, 'Меркурий', D(2022, 1, 10));
  assert.ok(['shadowBefore', 'retroStation', 'direct'].includes(ph), `got ${ph}`);
});
await ok('после 3 фев (10 фев) — не ретро', () => {
  const ph = retroPhase(E, 'Меркурий', D(2022, 2, 10));
  assert.ok(['shadowAfter', 'directStation', 'direct'].includes(ph), `got ${ph}`);
});

console.log('=== узлы: вибрация, только retro/direct (без станций/тени) ===');
await ok('Раху — retro либо direct (не станция/тень)', () => {
  const ph = retroPhase(E, 'Раху', D(2023, 6, 1));
  assert.ok(['retro', 'direct'].includes(ph), `got ${ph}`);
});

console.log('=== не бросает на любой планете/дате ===');
await ok('прогон по всем планетам', () => {
  for (const p of ['Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'Уран', 'Нептун']) {
    const ph = retroPhase(E, p, D(2024, 3, 15));
    assert.ok(typeof ph === 'string');
  }
});

console.log(`\n=== РЕТРО: все ${n} проверок зелёные ===`);
