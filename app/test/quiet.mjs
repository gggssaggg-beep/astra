/**
 * Тест «тихого времени» (lib/quiet.ts) — окно через полночь. Чистые функции.
 * Запуск:  node test/quiet.mjs
 */
import assert from 'node:assert/strict';
import { hmToMinutes, inQuietHours } from '../src/lib/quiet.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
// момент в UTC с заданным настенным часом в UTC-поясе → localMinutes = этот час
const atUTC = (h, m = 0) => new Date(Date.UTC(2026, 0, 15, h, m));
const TZ = 'UTC';

console.log('=== hmToMinutes ===');
ok('22:00 → 1320, 08:30 → 510, битое → дефолт', () => {
  assert.equal(hmToMinutes('22:00', '00:00'), 1320);
  assert.equal(hmToMinutes('08:30', '00:00'), 510);
  assert.equal(hmToMinutes(undefined, '09:15'), 555);
});

console.log('=== окно через полночь 22:00→08:00 (дефолт) ===');
const q = { enabled: true, from: '22:00', to: '08:00' };
ok('23:00 — тихо', () => assert.equal(inQuietHours(atUTC(23), TZ, q), true));
ok('03:00 — тихо', () => assert.equal(inQuietHours(atUTC(3), TZ, q), true));
ok('07:59 — ещё тихо', () => assert.equal(inQuietHours(atUTC(7, 59), TZ, q), true));
ok('08:00 — уже НЕ тихо (граница исключена)', () => assert.equal(inQuietHours(atUTC(8), TZ, q), false));
ok('12:00 — не тихо', () => assert.equal(inQuietHours(atUTC(12), TZ, q), false));
ok('22:00 — тихо (граница включена)', () => assert.equal(inQuietHours(atUTC(22), TZ, q), true));

console.log('=== обычное окно 13:00→14:00 (без перехода) ===');
const day = { enabled: true, from: '13:00', to: '14:00' };
ok('13:30 — тихо', () => assert.equal(inQuietHours(atUTC(13, 30), TZ, day), true));
ok('09:00 — не тихо', () => assert.equal(inQuietHours(atUTC(9), TZ, day), false));

console.log('=== выключено / пустое окно ===');
ok('enabled:false → всегда не тихо', () => assert.equal(inQuietHours(atUTC(3), TZ, { enabled: false, from: '22:00', to: '08:00' }), false));
ok('from==to → пустое окно, не тихо', () => assert.equal(inQuietHours(atUTC(3), TZ, { enabled: true, from: '08:00', to: '08:00' }), false));
ok('enabled undefined → включено по умолчанию', () => assert.equal(inQuietHours(atUTC(3), TZ, { from: '22:00', to: '08:00' }), true));

console.log('=== пояс учитывается ===');
ok('03:00 UTC в Москве (UTC+3) = 06:00 — тихо; в Нью-Йорке (UTC−5) = 22:00 пред. — тихо', () => {
  assert.equal(inQuietHours(atUTC(3), 'Europe/Moscow', q), true);   // 06:00 МСК
  assert.equal(inQuietHours(atUTC(3), 'America/New_York', q), true); // 22:00 EST
});
ok('12:00 UTC в Москве = 15:00 — не тихо', () =>
  assert.equal(inQuietHours(atUTC(12), 'Europe/Moscow', q), false));

console.log(`\n=== ТИХОЕ ВРЕМЯ: все ${n} проверок зелёные ===`);
