/**
 * Тест чистой математики совмещённых карт (engine/static.ts + lib/charts.ts).
 * БЕЗ WASM: статичные аспекты — функции от долгот, движок не нужен.
 *
 * Запуск:  node test/static.mjs   (Node ≥23.6 исполняет .ts напрямую)
 */
import assert from 'node:assert/strict';
import { circularMidpoint, staticAspects, synastryAspects, compositeChart } from '../src/engine/static.ts';
import { signOf } from '../src/engine/engine.ts';
import { zonedTimeUTC } from '../src/lib/format.ts';
import { birthInstantUTC } from '../src/lib/charts.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

// минимальная позиция для синтетических карт
const mk = (name, lon) => {
  const s = signOf(lon);
  return { name, glyph: '•', lon, sign: s.sign, signGlyph: s.glyph, degInSign: s.deg, speed: 0, retro: false };
};

console.log('=== circularMidpoint (короткая дуга) ===');
ok('(350,10) → 0 — через 0° Овна, не 180', () => assert.equal(circularMidpoint(350, 10), 0));
ok('(10,350) → 0', () => assert.equal(circularMidpoint(10, 350), 0));
ok('(100,140) → 120', () => assert.equal(circularMidpoint(100, 140), 120));
ok('(359,1) → 0', () => assert.equal(circularMidpoint(359, 1), 0));
ok('(0,180) → 270 — оппозиция детерминированно lonA−90', () => assert.equal(circularMidpoint(0, 180), 270));
ok('(180,0) → 90 — противоположно (узлы согласованы)', () => assert.equal(circularMidpoint(180, 0), 90));

console.log('=== staticAspects (внутри набора) ===');
{
  const pos = [mk('Солнце', 10.0), mk('Луна', 130.5), mk('Марс', 100.0), mk('Раху', 200.0), mk('Кету', 20.0)];
  const got = staticAspects(pos, () => 1.0);
  ok('ровно 2 аспекта (Раху×Кету пропущен, Солнце–Кету 10° не в орбисе)', () => assert.equal(got.length, 2));
  ok('[0] Луна △ Солнце орб 0.5 (Луна первой: sunRank −1)', () => {
    assert.deepEqual([got[0].p1, got[0].symbol, got[0].p2, got[0].orb], ['Луна', '△', 'Солнце', 0.5]);
  });
  ok('[1] Солнце □ Марс орб 0', () => {
    assert.deepEqual([got[1].p1, got[1].symbol, got[1].p2, got[1].orb], ['Солнце', '□', 'Марс', 0]);
  });
}
ok('оппозиция через 0°: 350° и 171° → орб 1.0', () => {
  const got = staticAspects([mk('Солнце', 350.0), mk('Марс', 171.0)], () => 1.0);
  assert.equal(got.length, 1);
  assert.deepEqual([got[0].symbol, got[0].orb], ['☍', 1.0]);
});

console.log('=== synastryAspects (A × B) ===');
{
  const A = [mk('Солнце', 10.0)];
  const B = [mk('Солнце', 10.4), mk('Луна', 190.6)];
  const orbOf = (name) => (name === 'Луна' ? 0.5 : 1.0);
  const got = synastryAspects(A, B, orbOf);
  ok('одноимённая пара есть: Солнце(A) ☌ Солнце(B) орб 0.4', () => {
    const c = got.find((x) => x.symbol === '☌');
    assert.deepEqual([c.p1, c.p2, c.orb], ['Солнце', 'Солнце', 0.4]);
  });
  ok('орбис пары = БОЛЬШИЙ из двух: Солнце ☍ Луна орб 0.6 проходит при max(1.0,0.5)', () => {
    const o = got.find((x) => x.symbol === '☍');
    assert.deepEqual([o.p1, o.p2, o.orb], ['Солнце', 'Луна', 0.6]);
  });
  ok('ровно 2 межаспекта, p1 всегда из A', () => {
    assert.equal(got.length, 2);
    for (const x of got) assert.equal(x.p1, 'Солнце');
  });
}

console.log('=== compositeChart (средние точки) ===');
{
  const A = [mk('Солнце', 350), mk('Раху', 10), mk('Кету', 190)];
  const B = [mk('Солнце', 10), mk('Раху', 30), mk('Кету', 210)];
  const got = compositeChart(A, B);
  const by = new Map(got.map((p) => [p.name, p]));
  ok('Солнце → 0° (Овен 0°) через короткую дугу', () => {
    const s = by.get('Солнце');
    assert.deepEqual([s.lon, s.sign, s.degInSign], [0, 'Овен', 0]);
  });
  ok('Раху 20°, Кету 200° — узлы остаются противоположными', () => {
    assert.equal(by.get('Раху').lon, 20);
    assert.equal(by.get('Кету').lon, 200);
  });
  ok('скорости нет: speed 0, retro false', () => {
    for (const p of got) { assert.equal(p.speed, 0); assert.equal(p.retro, false); }
  });
}

console.log('=== zonedTimeUTC / birthInstantUTC (DST-безопасный момент рождения) ===');
ok('Москва зимой (UTC+3): 2020-01-15 14:30 → 11:30Z', () =>
  assert.equal(zonedTimeUTC('2020-01-15', '14:30', 'Europe/Moscow').toISOString(), '2020-01-15T11:30:00.000Z'));
ok('Берлин летом (UTC+2): 2020-06-15 12:00 → 10:00Z', () =>
  assert.equal(zonedTimeUTC('2020-06-15', '12:00', 'Europe/Berlin').toISOString(), '2020-06-15T10:00:00.000Z'));
ok('Берлин зимой (UTC+1): 2020-01-15 12:00 → 11:00Z', () =>
  assert.equal(zonedTimeUTC('2020-01-15', '12:00', 'Europe/Berlin').toISOString(), '2020-01-15T11:00:00.000Z'));
ok('время неизвестно → полдень пояса рождения (МСК 12:00 → 09:00Z)', () => {
  const p = { id: 'x', name: 'Т', birthDate: '2020-01-15', birthTime: null, birthTz: 'Europe/Moscow', place: null, unknownTime: true, createdAt: '' };
  assert.equal(birthInstantUTC(p).toISOString(), '2020-01-15T09:00:00.000Z');
});

console.log(`\n=== СТАТИКА: все ${n} проверок зелёные ===`);
