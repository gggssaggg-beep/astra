/**
 * Тест слот-логики сводок (lib/digestSlots.ts) — чистые функции, без Capacitor.
 * Раскладка событий по слотам «раз/дважды в сутки», вечерний слот забирает
 * ночные события, ID-диапазоны не пересекаются.
 * Запуск:  node test/digest.mjs
 */
import assert from 'node:assert/strict';
import { IDS, digestSlots, inSlot, digestTitle } from '../src/lib/digestSlots.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const DAY = 86_400_000, MIN = 60_000;
// три подряд идущих «местных полуночи» (UTC-ms), день = 0/1/2
const d0 = Date.UTC(2026, 0, 15), days = [d0, d0 + DAY, d0 + 2 * DAY];
const at = (dayIdx, min) => days[dayIdx] + min * MIN;   // момент: день + минуты от полуночи

console.log('=== digestSlots: раз в сутки ===');
ok('once → один слот в день (утро 09:00), отсортировано', () => {
  const s = digestSlots(days, 540, 1260, false);   // 540=09:00, eMin игнор
  assert.deepEqual(s, [at(0, 540), at(1, 540), at(2, 540)]);
});

console.log('=== digestSlots: дважды в сутки ===');
ok('twice → утро+вечер каждый день, по возрастанию', () => {
  const s = digestSlots(days, 540, 1260, true);     // 09:00 + 21:00
  assert.deepEqual(s, [
    at(0, 540), at(0, 1260), at(1, 540), at(1, 1260), at(2, 540), at(2, 1260),
  ]);
});
ok('слоты всегда отсортированы, даже если вечер задан раньше утра', () => {
  // вырожденный ввод: eMin < mMin — сортировка всё равно чинит порядок
  const s = digestSlots([d0], 600, 300, true);
  assert.deepEqual(s, [d0 + 300 * MIN, d0 + 600 * MIN]);
});
ok('пустой список дней → пусто', () => assert.deepEqual(digestSlots([], 540, 1260, true), []));

console.log('=== inSlot: окно [slotAt → nextSlotAt) ===');
const ev = (ms) => ({ at: ms });
const getMs = (e) => e.at;
ok('событие в окне попадает, вне — нет', () => {
  const events = [ev(at(0, 600)), ev(at(0, 1000)), ev(at(1, 100))];
  const w = inSlot(events, getMs, at(0, 540), at(1, 540));
  assert.equal(w.length, 3);   // все три в пределах [день0 09:00 → день1 09:00)
});
ok('нижняя граница включена (t === slotAt)', () => {
  const w = inSlot([ev(at(0, 540))], getMs, at(0, 540), at(0, 1260));
  assert.equal(w.length, 1);
});
ok('верхняя граница исключена (t === end)', () => {
  const w = inSlot([ev(at(0, 1260))], getMs, at(0, 540), at(0, 1260));
  assert.equal(w.length, 0);
});
ok('вечерний слот забирает НОЧНЫЕ события (до утра следующего дня)', () => {
  // вечер день0 21:00 → утро день1 09:00; ночное событие в 02:00 день1 — вечернее
  const night = ev(at(1, 120));       // 02:00 следующего дня
  const morning = ev(at(1, 600));     // 10:00 следующего дня — уже НЕ в этом окне
  const w = inSlot([night, morning], getMs, at(0, 1260), at(1, 540));
  assert.deepEqual(w, [night]);
});
ok('последний слот (nextSlotAt undefined) → окно +24ч', () => {
  const inside = ev(at(0, 540) + 10 * 3600_000);   // +10ч
  const outside = ev(at(0, 540) + 30 * 3600_000);  // +30ч > сутки
  const w = inSlot([inside, outside], getMs, at(0, 540), undefined);
  assert.deepEqual(w, [inside]);
});

console.log('=== digestTitle ===');
ok('once → «Сводка неба»', () => assert.equal(digestTitle(false, 540), 'Сводка неба'));
ok('twice до полудня (< 720) → «Сводка дня»', () => assert.equal(digestTitle(true, 540), 'Сводка дня'));
ok('twice полдень (720) → «на вечер и ночь» (граница)', () => assert.equal(digestTitle(true, 720), 'Сводка на вечер и ночь'));
ok('twice вечер (1260) → «на вечер и ночь»', () => assert.equal(digestTitle(true, 1260), 'Сводка на вечер и ночь'));

console.log('=== IDS: диапазоны упорядочены и НЕ пересекаются ===');
ok('daily < aspect < transit, всё внутри 1000..managedTo', () => {
  assert.ok(IDS.dailyFrom <= IDS.dailyTo);
  assert.ok(IDS.dailyTo < IDS.aspectFrom);
  assert.ok(IDS.aspectFrom <= IDS.aspectTo);
  assert.ok(IDS.aspectTo < IDS.transitFrom);
  assert.ok(IDS.transitFrom <= IDS.transitTo);
  assert.equal(IDS.transitTo, IDS.managedTo);
});

console.log(`\n=== СЛОТ-ЛОГИКА СВОДОК: все ${n} проверок зелёные ===`);
