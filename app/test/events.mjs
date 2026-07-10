/**
 * Тест «событий неба» (engine/events.ts, функция eventsOn): ингрессии (смена
 * знака), лунации (ново/полнолуния), станции. Движок moshier (headless).
 *
 * ЯКОРЯ — ВНЕШНЕ ИЗВЕСТНЫЕ астрономические моменты (равноденствия/солнцестояния
 * = ингрессия Солнца в кардинальный знак; ново/полнолуния), а НЕ выхлоп самого
 * движка. Опубликованные UTC-моменты (напр. usno.navy.mil, timeanddate.com):
 *   • Мартовское равноденствие 2023 — Солнце → Овен      2023-03-20 21:24 UTC
 *   • Сентябрьское равноденствие 2023 — Солнце → Весы     2023-09-23 06:50 UTC
 *   • Июньское солнцестояние 2023 — Солнце → Рак          2023-06-21 14:58 UTC
 *   • Новолуние (Водолей)                                 2023-01-21 20:53 UTC
 *   • Полнолуние-суперлуние (Водолей)                     2023-08-01 18:31 UTC
 * Допуск ±30 мин (движок фактически попадает в секунды).
 *
 * Запуск:  node test/events.mjs
 */
import assert from 'node:assert/strict';
import { createEngine, eventsOn } from '../src/engine/index.ts';

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const E = await createEngine('moshier');

// начало суток в UTC (eventsOn сканирует 24 ч от этого инстанта)
const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
const TOL_MS = 30 * 60 * 1000; // ±30 минут

/** событие ингрессии object → sign в сутки, начинающиеся day(...). */
const findIngress = (dayStart, object, sign) =>
  eventsOn(E, dayStart).find(
    (e) => e.kind === 'ingress' && e.object === object && e.sign === sign);

/** событие лунации (new|full) в сутки. */
const findLunation = (dayStart, phase) =>
  eventsOn(E, dayStart).find((e) => e.kind === 'lunation' && e.phase === phase);

const nearUTC = (got, y, m, d, hh, mm) => {
  const want = Date.UTC(y, m - 1, d, hh, mm, 0);
  const err = Math.abs(got.getTime() - want);
  assert.ok(err <= TOL_MS,
    `${got.toISOString()} vs ${new Date(want).toISOString()} — расхождение ${(err / 60000).toFixed(1)} мин`);
};

console.log('=== ингрессии Солнца = равноденствия/солнцестояния (внешние UTC-якоря) ===');

await ok('мартовское равноденствие 2023: Солнце → Овен ~2023-03-20 21:24 UTC', () => {
  const ev = findIngress(day(2023, 3, 20), 'Солнце', 'Овен');
  assert.ok(ev, 'ингрессия Солнце → Овен должна быть найдена 20.03.2023');
  nearUTC(ev.time, 2023, 3, 20, 21, 24);
});

await ok('сентябрьское равноденствие 2023: Солнце → Весы ~2023-09-23 06:50 UTC', () => {
  const ev = findIngress(day(2023, 9, 23), 'Солнце', 'Весы');
  assert.ok(ev, 'ингрессия Солнце → Весы должна быть найдена 23.09.2023');
  nearUTC(ev.time, 2023, 9, 23, 6, 50);
});

await ok('июньское солнцестояние 2023: Солнце → Рак ~2023-06-21 14:58 UTC', () => {
  const ev = findIngress(day(2023, 6, 21), 'Солнце', 'Рак');
  assert.ok(ev, 'ингрессия Солнце → Рак должна быть найдена 21.06.2023');
  nearUTC(ev.time, 2023, 6, 21, 14, 58);
});

console.log('=== лунации (ново/полнолуния) — внешние UTC-якоря ===');

await ok('новолуние 2023-01-21 ~20:53 UTC (Водолей)', () => {
  const ev = findLunation(day(2023, 1, 21), 'new');
  assert.ok(ev, 'новолуние должно быть найдено 21.01.2023');
  assert.equal(ev.sign, 'Водолей', `знак новолуния: ${ev.sign}`);
  nearUTC(ev.time, 2023, 1, 21, 20, 53);
});

await ok('полнолуние 2023-08-01 ~18:31 UTC (Водолей)', () => {
  const ev = findLunation(day(2023, 8, 1), 'full');
  assert.ok(ev, 'полнолуние должно быть найдено 01.08.2023');
  assert.equal(ev.sign, 'Водолей', `знак полнолуния: ${ev.sign}`);
  nearUTC(ev.time, 2023, 8, 1, 18, 31);
});

console.log('=== негативные проверки: без события день пуст по этому типу ===');

await ok('обычный день без ингрессии Солнца (10.02.2023) — её нет', () => {
  const ev = findIngress(day(2023, 2, 10), 'Солнце', 'Рыбы');
  assert.ok(!ev, 'в середине знака ингрессии Солнца быть не должно');
});

await ok('день вдали от сизигии (10.01.2023) — нет ни ново-, ни полнолуния', () => {
  assert.ok(!findLunation(day(2023, 1, 10), 'new'), 'новолуния 10.01 быть не должно');
  assert.ok(!findLunation(day(2023, 1, 10), 'full'), 'полнолуния 10.01 быть не должно');
});

console.log(`\n=== СОБЫТИЯ НЕБА: все ${n} проверок зелёные ===`);
