/**
 * Тест аспектов к куспидам (lib/cuspAspects.ts). БЕЗ WASM: чистая математика.
 * Запуск:  node test/cuspaspects.mjs
 */
import assert from 'node:assert/strict';
import { cuspAspects } from '../src/lib/cuspAspects.ts';
import { signOf } from '../src/engine/engine.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const mk = (name, lon) => { const s = signOf(lon); return { name, lon, sign: s.sign, signGlyph: s.glyph, degInSign: s.deg, glyph: '•', speed: 0, retro: false }; };
// равнодомные куспиды от Asc=0: 0,30,60,…330
const cusps = Array.from({ length: 12 }, (_, i) => i * 30);

console.log('=== соединение планеты с куспидом ===');
ok('планета на 0°30′ → соединение с куспидом 1 (Asc), орб 0.5', () => {
  const got = cuspAspects([mk('Марс', 0.5)], cusps, () => 1);
  const c = got.find((x) => x.cusp === 1 && x.aspect === 'соединение');
  assert.ok(c); assert.equal(c.orb, 0.5);
});

console.log('=== аспекты к нужным куспидам ===');
ok('планета в 90° даёт ☌ куспид4, □ куспид1/7, △ куспид?, ⚹ куспид3/…', () => {
  const got = cuspAspects([mk('Солнце', 90)], cusps, () => 1);
  // куспид4=90 → соединение; куспид1=0 и куспид7=180 → квадрат
  assert.ok(got.some((x) => x.cusp === 4 && x.aspect === 'соединение'));
  assert.ok(got.some((x) => x.cusp === 1 && x.aspect === 'квадрат'));
  assert.ok(got.some((x) => x.cusp === 7 && x.aspect === 'квадрат'));
});

console.log('=== орбис пары = больший из двух (планета vs куспид) ===');
ok('орб 1.4° проходит при cuspOrb=1.5, не проходит при 1.0', () => {
  const wide = cuspAspects([mk('Луна', 1.4)], cusps, () => 1, 1.5);
  assert.ok(wide.some((x) => x.cusp === 1 && x.aspect === 'соединение'));
  const narrow = cuspAspects([mk('Луна', 1.4)], cusps, () => 1, 1.0);
  assert.ok(!narrow.some((x) => x.cusp === 1 && x.aspect === 'соединение'));
});

console.log('=== мало куспидов → пусто (защита) ===');
ok('cusps короче 12 → []', () => assert.deepEqual(cuspAspects([mk('Марс', 0)], [0, 30], () => 1), []));

console.log(`\n=== КУСПИДЫ: все ${n} проверок зелёные ===`);
