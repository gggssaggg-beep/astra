/**
 * Арудхи (lib/arudha.ts) — чистая математика, без WASM.
 *
 * Ключевые страховки:
 *  1) пада НИКОГДА не остаётся на самом доме и на седьмом от него — иначе
 *     отражение бессмысленно (это и есть правило исключения);
 *  2) расстояние считается ВКЛЮЧИТЕЛЬНО (свой знак = 1) — самая частая
 *     ошибка на единицу в этой формуле;
 *  3) управитель в своём доме (d=1) даёт паду в десятом знаке.
 *
 * Запуск: node test/arudha.mjs
 */
import assert from 'node:assert/strict';
import { arudhaPadas, signDistance, arudhaLagna, upapada, padaHouse } from '../src/lib/arudha.ts';
import { SIGN_LORDS } from '../src/lib/vedic.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

// эталон А: лагна Дева (5), знаки грах
const SIGNS = {
  'Солнце': 10, 'Луна': 4, 'Марс': 11, 'Меркурий': 11,
  'Юпитер': 10, 'Венера': 9, 'Сатурн': 11,
};
const LAGNA = 5;

console.log('=== расстояние по знакам ===');
{
  ok('свой знак = 1 (счёт включительный)', () => assert.equal(signDistance(3, 3), 1));
  ok('следующий = 2', () => assert.equal(signDistance(3, 4), 2));
  ok('через круг: Рыбы → Овен = 2', () => assert.equal(signDistance(11, 0), 2));
  ok('противоположный = 7', () => assert.equal(signDistance(0, 6), 7));
}

console.log('=== пады по эталонной карте ===');
{
  const p = arudhaPadas(LAGNA, SIGNS);
  ok('двенадцать пад, по одной на дом', () => {
    assert.equal(p.length, 12);
    assert.deepEqual(p.map((x) => x.house), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  ok('коды A1…A12, А1 помечена как АЛ, А12 — как УЛ', () => {
    assert.equal(p[0].code, 'A1');
    assert.equal(p[0].special, 'АЛ');
    assert.equal(p[11].special, 'УЛ');
    assert.equal(p[5].special, '');
  });
  ok('знак дома идёт от лагны подряд (целознаковые дома)', () => {
    for (const x of p) assert.equal(x.houseSign, (LAGNA + x.house - 1) % 12);
  });
  ok('управитель дома взят классический', () => {
    for (const x of p) assert.equal(x.lord, SIGN_LORDS[x.houseSign]);
  });
  ok('НИ ОДНА пада не осталась на своём доме или на седьмом от него', () => {
    for (const x of p) {
      assert.notEqual(x.sign, x.houseSign, `${x.code} схлопнулась на дом`);
      assert.notEqual(x.sign, (x.houseSign + 6) % 12, `${x.code} на седьмом от дома`);
    }
  });
  ok('АЛ и УЛ достаются отдельными хелперами', () => {
    assert.equal(arudhaLagna(p).house, 1);
    assert.equal(upapada(p).house, 12);
  });
  ok('дом пады от лагны считается в 1..12', () => {
    for (const x of p) {
      const h = padaHouse(x, LAGNA);
      assert.ok(h >= 1 && h <= 12, `${x.code} → ${h}`);
    }
  });
}

console.log('=== правило и его исключение (искусственные карты) ===');
{
  // лагна Овен (0), Марс (управитель Овна) в самом Овне → d = 1, пада схлопнулась
  const p = arudhaPadas(0, { ...SIGNS, 'Марс': 0 });
  ok('управитель в своём доме: пада уходит в десятый знак', () => {
    const a1 = p[0];
    assert.equal(a1.distance, 1);
    assert.equal(a1.shifted, true);
    assert.equal(a1.sign, 9);            // десятый от Овна = Козерог
  });
  // Марс в 4-м от Овна (Рак, 3): d = 4, пада = Рак + 3 = Весы = 7-й от Овна → сдвиг
  const p2 = arudhaPadas(0, { ...SIGNS, 'Марс': 3 });
  ok('пада попала на седьмой от дома — тоже сдвигается', () => {
    const a1 = p2[0];
    assert.equal(a1.distance, 4);
    assert.equal(a1.shifted, true);
    assert.equal(a1.sign, (6 + 9) % 12);  // десятый от Весов = Рак
  });
  // Марс во 2-м от Овна (Телец, 1): d = 2, пада = Телец + 1 = Близнецы, сдвига нет
  const p3 = arudhaPadas(0, { ...SIGNS, 'Марс': 1 });
  ok('обычный случай: пада = управитель + (d − 1), без сдвига', () => {
    const a1 = p3[0];
    assert.equal(a1.distance, 2);
    assert.equal(a1.shifted, false);
    assert.equal(a1.sign, 2);
  });
  ok('пада всегда отстоит от дома на ЧЁТНОЕ число знаков (кроме сдвинутых)', () => {
    // геометрия правила: пада = дом + 2·(d−1), поэтому шаг всегда чётный
    for (const x of arudhaPadas(0, SIGNS)) {
      if (x.shifted) continue;
      assert.equal(((x.sign - x.houseSign + 12) % 12) % 2, 0, `${x.code}`);
    }
  });
}

console.log('=== неполные данные ===');
{
  ok('нет грахи-управителя в наборе — строка остаётся, пада не выдумывается', () => {
    const p = arudhaPadas(0, { 'Марс': 5 });
    const withLord = p.filter((x) => x.lordSign !== null);
    assert.ok(withLord.length >= 1);
    const without = p.find((x) => x.lordSign === null);
    assert.ok(without);
    assert.equal(without.distance, 0);
    assert.equal(without.shifted, false);
  });
}

console.log(`\n✅ арудхи: ${n} проверок пройдено`);
