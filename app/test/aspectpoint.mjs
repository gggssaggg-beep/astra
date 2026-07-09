/**
 * Тест «натив+транзит»: findAspectToPoint (движущаяся планета к фикс. долготе).
 * Движок moshier (headless). Солнце к 0° Овна — проверяемый якорь.
 *
 * Запуск:  node test/aspectpoint.mjs
 */
import assert from 'node:assert/strict';
import { createEngine, findAspectToPoint } from '../src/engine/index.ts';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const E = await createEngine('moshier');
const yr = (y0, y1) => [new Date(Date.UTC(y0, 0, 1)), new Date(Date.UTC(y1, 0, 1))];

console.log('=== соединение транзита с фикс. точкой = прохождение градуса ===');
await ok('Солнце ☌ 0° за 2022–2024 → 2 раза, март', async () => {
  const [from, to] = yr(2022, 2024);
  const { list } = await findAspectToPoint(E, 'Солнце', 0, 'соединение', from, to);
  assert.equal(list.length, 2);
  for (const o of list) assert.equal(o.exact.getUTCMonth(), 2);   // март
});

console.log('=== оппозиция транзита к фикс. 0° = Солнце в 180° (осеннее равнод.) ===');
await ok('Солнце ☍ 0° за 2023 → 1 раз, сентябрь', async () => {
  const [from, to] = yr(2023, 2024);
  const { list } = await findAspectToPoint(E, 'Солнце', 0, 'оппозиция', from, to);
  assert.equal(list.length, 1);
  assert.equal(list[0].exact.getUTCMonth(), 8);   // сентябрь (0-based 8)
});

console.log('=== трин: Солнце △ 0° = Солнце в 120° и 240° (2 раза/год) ===');
await ok('Солнце △ 0° за 2023 → 2 раза (июль и ноя)', async () => {
  const [from, to] = yr(2023, 2024);
  const { list } = await findAspectToPoint(E, 'Солнце', 0, 'трин', from, to);
  assert.equal(list.length, 2);
  const months = list.map((o) => o.exact.getUTCMonth()).sort((a, b) => a - b);
  assert.deepEqual(months, [6, 10]);   // июль(6, 120°=0°Льва), ноя(10, 240°=0°Стрельца)
});

console.log('=== окно вход→точно→выход корректно ===');
await ok('begin < exact < end у каждого прохождения', async () => {
  const [from, to] = yr(2023, 2024);
  const { list } = await findAspectToPoint(E, 'Солнце', 45, 'соединение', from, to, 1);
  assert.ok(list.length >= 1);
  for (const o of list) {
    assert.ok(o.begin.getTime() < o.exact.getTime());
    assert.ok(o.exact.getTime() < o.end.getTime());
  }
});

console.log(`\n=== НАТИВ+ТРАНЗИТ: все ${n} проверок зелёные ===`);
