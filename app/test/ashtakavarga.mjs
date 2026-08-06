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
import { ashtakavarga, bhinna, BAV_TOTALS, SAV_TOTAL, DONORS, savLabel,
  trikonaShodhana, ekadhipatyaShodhana, shodhyaPinda, RASHI_MANA, GRAHA_MANA,
} from '../src/lib/ashtakavarga.ts';

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

console.log('=== трикона-шодхана ===');
{
  // тригоны: 0-4-8, 1-5-9, 2-6-10, 3-7-11
  ok('разные значения — вычитается наименьшее', () => {
    const row = Array(12).fill(0);
    row[0] = 5; row[4] = 3; row[8] = 7;
    const r = trikonaShodhana(row);
    assert.deepEqual([r[0], r[4], r[8]], [2, 0, 4]);
  });
  ok('ноль в тригоне — редукции нет вовсе', () => {
    const row = Array(12).fill(0);
    row[0] = 5; row[4] = 0; row[8] = 7;
    const r = trikonaShodhana(row);
    assert.deepEqual([r[0], r[4], r[8]], [5, 0, 7]);
  });
  ok('все три равны — все три обнуляются', () => {
    const row = Array(12).fill(0);
    row[1] = 4; row[5] = 4; row[9] = 4;
    const r = trikonaShodhana(row);
    assert.deepEqual([r[1], r[5], r[9]], [0, 0, 0]);
  });
  ok('тригоны независимы друг от друга', () => {
    const row = Array(12).fill(0);
    row[0] = 5; row[4] = 3; row[8] = 7;      // первый тригон
    row[2] = 6; row[6] = 6; row[10] = 9;     // третий
    const r = trikonaShodhana(row);
    assert.deepEqual([r[2], r[6], r[10]], [0, 0, 3]);
  });
}

console.log('=== экадхипатья-шодхана ===');
{
  const empty = Array(12).fill(false);
  const withPlanets = (...ix) => { const o = empty.slice(); for (const i of ix) o[i] = true; return o; };
  ok('оба знака пары заняты — редукции нет', () => {
    const row = Array(12).fill(3); row[0] = 5; row[7] = 2;   // Овен/Скорпион (Марс)
    const r = ekadhipatyaShodhana(row, withPlanets(0, 7));
    assert.deepEqual([r[0], r[7]], [5, 2]);
  });
  ok('ноль в одном из знаков — редукции нет', () => {
    const row = Array(12).fill(3); row[0] = 0; row[7] = 6;
    const r = ekadhipatyaShodhana(row, empty);
    assert.deepEqual([r[0], r[7]], [0, 6]);
  });
  ok('один занят и не меньше — пустой обнуляется', () => {
    const row = Array(12).fill(3); row[0] = 6; row[7] = 4;
    const r = ekadhipatyaShodhana(row, withPlanets(0));
    assert.deepEqual([r[0], r[7]], [6, 0]);
  });
  ok('один занят и меньше — пустой приравнивается к занятому', () => {
    const row = Array(12).fill(3); row[0] = 2; row[7] = 5;
    const r = ekadhipatyaShodhana(row, withPlanets(0));
    assert.deepEqual([r[0], r[7]], [2, 2]);
  });
  ok('оба пусты и разные — большее уменьшается до меньшего', () => {
    const row = Array(12).fill(3); row[1] = 7; row[6] = 4;   // Телец/Весы (Венера)
    const r = ekadhipatyaShodhana(row, empty);
    assert.deepEqual([r[1], r[6]], [4, 4]);
  });
  ok('оба пусты и равны — оба обнуляются', () => {
    const row = Array(12).fill(3); row[9] = 5; row[10] = 5;  // Козерог/Водолей (Сатурн)
    const r = ekadhipatyaShodhana(row, empty);
    assert.deepEqual([r[9], r[10]], [0, 0]);
  });
  ok('Рак и Лев одиночные — их редукция не касается', () => {
    const row = Array(12).fill(0); row[3] = 8; row[4] = 8;
    const r = ekadhipatyaShodhana(row, empty);
    assert.deepEqual([r[3], r[4]], [8, 8]);
  });
}

console.log('=== шодхья пинда ===');
{
  const r = ashtakavarga(SIGNS, LAGNA);
  ok('множители на месте: раши-мана 12 знаков, граха-мана 7 планет', () => {
    assert.equal(RASHI_MANA.length, 12);
    assert.equal(RASHI_MANA[11], 12);          // Рыбы — самый тяжёлый знак
    assert.equal(Object.keys(GRAHA_MANA).length, 7);
    assert.equal(GRAHA_MANA['Юпитер'], 10);
  });
  ok('пинда считается для всех семи грах', () =>
    assert.equal(Object.keys(r.pinda).length, 7));
  ok('редукции только уменьшают: очищенная BAV ≤ сырой в каждом знаке', () => {
    for (const [p, row] of Object.entries(r.bav)) {
      for (let i = 0; i < 12; i++)
        assert.ok(r.pinda[p].reduced[i] <= row[i], `${p}, знак ${i}`);
    }
  });
  ok('итог = раши-пинда + граха-пинда', () => {
    for (const p of Object.keys(r.pinda)) {
      const { rashiPinda, grahaPinda, total } = r.pinda[p];
      assert.equal(total, rashiPinda + grahaPinda);
    }
  });
  ok('пинда пересчитывается вручную по очищенной BAV', () => {
    const p = shodhyaPinda(r.bav['Сатурн'], SIGNS);
    let rp = 0;
    for (let i = 0; i < 12; i++) rp += p.reduced[i] * RASHI_MANA[i];
    assert.equal(p.rashiPinda, rp);
    let gp = 0;
    for (const [name, mana] of Object.entries(GRAHA_MANA)) gp += p.reduced[SIGNS[name]] * mana;
    assert.equal(p.grahaPinda, gp);
  });
  ok('пустой знак после редукции не даёт вклада в граха-пинду', () => {
    const p = shodhyaPinda(Array(12).fill(0), SIGNS);
    assert.equal(p.total, 0);
  });
}

console.log(`\n✅ аштакаварга: ${n} проверок пройдено`);
