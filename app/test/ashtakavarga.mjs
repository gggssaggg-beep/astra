/**
 * Аштакаварга — бинду по знакам. Чистая математика без WASM.
 *
 * Главная страховка от опечатки в таблицах: КАНОНИЧЕСКИЕ ИТОГИ. Сумма бинду
 * каждой бхинна-аштакаварги — жёстко заданное классикой число (48/49/39/54/56/
 * 52/39), а сарва — 337. Эти суммы не зависят от карты: если хоть одна строка
 * таблиц набрана неверно, итог разъедется.
 *
 * Запуск: node test/ashtakavarga.mjs
 */
import assert from 'node:assert/strict';
import { ashtakavarga, bhinna, BAV_TOTALS, SAV_TOTAL, DONORS, savLabel } from '../src/lib/ashtakavarga.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const sum = (a) => a.reduce((x, y) => x + y, 0);

// эталон А: знаки грах (0=Овен … 11=Рыбы), лагна Дева (5)
const SIGNS = {
  'Солнце': 10, 'Луна': 4, 'Марс': 11, 'Меркурий': 11,
  'Юпитер': 10, 'Венера': 9, 'Сатурн': 11,
};
const LAGNA = 5;

console.log('=== канонические итоги BAV (не зависят от карты) ===');
for (const [p, total] of Object.entries(BAV_TOTALS)) {
  ok(`${p}: сумма бинду = ${total}`, () =>
    assert.equal(sum(bhinna(p, SIGNS, LAGNA)), total));
}

console.log('=== сарва-аштакаварга ===');
{
  const r = ashtakavarga(SIGNS, LAGNA);
  ok(`сумма SAV по двенадцати знакам = ${SAV_TOTAL}`, () =>
    assert.equal(sum(r.sav), SAV_TOTAL));
  ok('SAV = сумма семи BAV в каждом знаке', () => {
    for (let i = 0; i < 12; i++) {
      const s = Object.values(r.bav).reduce((acc, row) => acc + row[i], 0);
      assert.equal(r.sav[i], s, `знак ${i}`);
    }
  });
  ok('savByHouse — та же SAV, развёрнутая от лагны', () => {
    assert.equal(r.savByHouse[0], r.sav[LAGNA]);
    assert.equal(r.savByHouse[11], r.sav[(LAGNA + 11) % 12]);
    assert.equal(sum(r.savByHouse), SAV_TOTAL);
  });
  ok('в каждом знаке бинду в разумных пределах (0..56)', () =>
    r.sav.forEach((v, i) => assert.ok(v >= 0 && v <= 56, `знак ${i}: ${v}`)));
  ok('семь BAV, узлов среди них нет', () => {
    assert.equal(Object.keys(r.bav).length, 7);
    assert.ok(!('Раху' in r.bav) && !('Кету' in r.bav));
  });
}

console.log('=== устройство таблиц ===');
{
  ok('дарителей восемь: семь грах и лагна', () => {
    assert.equal(DONORS.length, 8);
    assert.equal(DONORS[7], 'Лагна');
  });
  ok('сдвиг «N-й от дарителя» включительный: 1-й = знак самого дарителя', () => {
    // Солнце даёт себе бинду в 1-м доме от себя → в своём знаке минимум 1
    const only = bhinna('Солнце', { 'Солнце': 0 }, 6);
    assert.ok(only[0] >= 1);
  });
  ok('лагна участвует: смена лагны меняет картину', () => {
    const a = bhinna('Юпитер', SIGNS, 0), b = bhinna('Юпитер', SIGNS, 6);
    assert.notDeepEqual(a, b);
    assert.equal(sum(a), sum(b));   // итог при этом канонический
  });
  ok('нет грахи в наборе — её вклад просто отсутствует, итог падает', () => {
    const partial = bhinna('Солнце', { 'Солнце': 0 }, 0);
    assert.ok(sum(partial) < BAV_TOTALS['Солнце']);
  });
}

console.log('=== чтение чисел ===');
{
  ok('средняя бинду знака ≈ 28 (337/12)', () =>
    assert.ok(Math.abs(SAV_TOTAL / 12 - 28.08) < 0.02));
  ok('подписи по порогам: 36 сильный, 28 средний, 18 слабый', () => {
    assert.equal(savLabel(36), 'очень сильный');
    assert.equal(savLabel(28), 'средний');
    assert.equal(savLabel(18), 'очень слабый');
  });
}

console.log(`\n✅ аштакаварга: ${n} проверок пройдено`);
