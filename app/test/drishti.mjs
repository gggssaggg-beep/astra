/**
 * Дришти (lib/drishti.ts) — аспекты грах по целым знакам, БЕЗ WASM: всё
 * считается от долгот.
 *
 * Эталон — та же карта 12.03.1998 18:10 (+2), что и в test/vedicmath.mjs
 * (лагна Дева). Цели каждой грахи посчитаны вручную по канону: «N-й знак от
 * себя» включительно, дом — целознаковый от лагны.
 *
 * Запуск:  node test/drishti.mjs
 */
import assert from 'node:assert/strict';
import { DRISHTI, drishtiSigns, grahaDrishti } from '../src/lib/drishti.ts';
import { buildVedicChart } from '../src/lib/vedic.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const Z = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева',
  'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];
/** «28°03′02″ Водолей» → долгота */
const at = (sign, d, m, s) => Z.indexOf(sign) * 30 + d + m / 60 + s / 3600;

const CHART = {
  'Солнце': at('Водолей', 28, 3, 2),
  'Луна': at('Лев', 22, 25, 21),
  'Марс': at('Рыбы', 12, 20, 55),
  'Меркурий': at('Рыбы', 13, 47, 59),
  'Юпитер': at('Водолей', 14, 51, 13),
  'Венера': at('Козерог', 12, 34, 46),
  'Сатурн': at('Рыбы', 25, 35, 6),
  'Раху': at('Лев', 16, 45, 21),
  'Кету': at('Водолей', 16, 45, 21),
};
const ASC = at('Дева', 0, 6, 57);

const chart = buildVedicChart(CHART, { 'Раху': true, 'Кету': true }, ASC);
const map = (includeNodes = false) => {
  const out = {};
  for (const e of grahaDrishti(chart.planets, chart.lagnaSign, includeNodes)) out[e.from] = e;
  return out;
};
const D = map();
/** «куда смотрит» в виде [знак…] и [дом…] — так их читает астролог */
const signsOf = (e) => e.targets.map((t) => Z[t.sign]);
const housesOf = (e) => e.targets.map((t) => t.house);
const hitsOf = (e, sign) => e.targets.find((t) => Z[t.sign] === sign)?.hits ?? null;
const allHits = (e) => e.targets.flatMap((t) => t.hits);

console.log('=== таблица полных дришти ===');
{
  ok('все грахи смотрят в 7-й знак от себя', () => {
    for (const p of ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн']) {
      assert.ok(DRISHTI[p].includes(7), p);
    }
  });
  ok('особые: Марс 4/7/8, Юпитер 5/7/9, Сатурн 3/7/10', () => {
    assert.deepEqual(DRISHTI['Марс'], [4, 7, 8]);
    assert.deepEqual(DRISHTI['Юпитер'], [5, 7, 9]);
    assert.deepEqual(DRISHTI['Сатурн'], [3, 7, 10]);
  });
  ok('у светил и быстрых — только 7-й', () => {
    assert.deepEqual(DRISHTI['Солнце'], [7]);
    assert.deepEqual(DRISHTI['Луна'], [7]);
    assert.deepEqual(DRISHTI['Меркурий'], [7]);
    assert.deepEqual(DRISHTI['Венера'], [7]);
  });
  ok('«N-й от себя» включительно: 7-й от Овна — Весы, от Рыб — Дева', () => {
    assert.deepEqual(drishtiSigns('Солнце', 0), [6]);
    assert.deepEqual(drishtiSigns('Солнце', 11), [5]);
  });
  ok('Сатурн из Овна смотрит в Близнецы, Весы, Козерог (3, 7, 10-й)', () =>
    assert.deepEqual(drishtiSigns('Сатурн', 0).map((s) => Z[s]),
      ['Близнецы', 'Весы', 'Козерог']));
}

console.log('=== карта 12.03.1998, лагна Дева (ручные эталоны) ===');
{
  ok('Сатурн (Рыбы): Телец, Дева, Стрелец — дома 9, 1, 4; под аспектом никого', () => {
    assert.deepEqual(signsOf(D['Сатурн']), ['Телец', 'Дева', 'Стрелец']);
    assert.deepEqual(housesOf(D['Сатурн']), [9, 1, 4]);
    assert.deepEqual(allHits(D['Сатурн']), []);
  });
  ok('Марс (Рыбы): Близнецы, Дева, Весы — дома 10, 1, 2; под аспектом никого', () => {
    assert.deepEqual(signsOf(D['Марс']), ['Близнецы', 'Дева', 'Весы']);
    assert.deepEqual(housesOf(D['Марс']), [10, 1, 2]);
    assert.deepEqual(allHits(D['Марс']), []);
  });
  ok('Юпитер (Водолей): Близнецы, Лев, Весы — дома 10, 12, 2; во Льве Луна и Раху', () => {
    assert.deepEqual(signsOf(D['Юпитер']), ['Близнецы', 'Лев', 'Весы']);
    assert.deepEqual(housesOf(D['Юпитер']), [10, 12, 2]);
    assert.deepEqual(hitsOf(D['Юпитер'], 'Лев').sort(), ['Луна', 'Раху']);
    assert.deepEqual(hitsOf(D['Юпитер'], 'Близнецы'), []);
  });
  ok('Солнце (Водолей): 7-й — Лев, дом 12; под аспектом Луна и Раху', () => {
    assert.deepEqual(signsOf(D['Солнце']), ['Лев']);
    assert.deepEqual(housesOf(D['Солнце']), [12]);
    assert.deepEqual(allHits(D['Солнце']).sort(), ['Луна', 'Раху']);
  });
  ok('Луна (Лев): 7-й — Водолей, дом 6; под аспектом Солнце, Юпитер, Кету', () => {
    assert.deepEqual(signsOf(D['Луна']), ['Водолей']);
    assert.deepEqual(housesOf(D['Луна']), [6]);
    assert.deepEqual(allHits(D['Луна']).sort(), ['Кету', 'Солнце', 'Юпитер']);
  });
  ok('Венера (Козерог): 7-й — Рак, дом 11; там пусто', () => {
    assert.deepEqual(signsOf(D['Венера']), ['Рак']);
    assert.deepEqual(housesOf(D['Венера']), [11]);
    assert.deepEqual(allHits(D['Венера']), []);
  });
  ok('«из какого дома» — дом самой грахи (Сатурн из 7-го, Луна из 12-го)', () => {
    assert.equal(D['Сатурн'].fromHouse, 7);
    assert.equal(D['Луна'].fromHouse, 12);
    assert.equal(D['Венера'].fromHouse, 5);
  });
  ok('граха никогда не аспектирует свой знак (7-й, 4-й… — не 1-й)', () =>
    chart.planets.forEach((p) => {
      const e = D[p.name];
      if (e) assert.ok(!e.targets.some((t) => t.sign === p.signIndex), p.name);
    }));
}

console.log('=== узлы: по умолчанию не аспектируют ===');
{
  ok('без флага записей Раху и Кету нет вовсе', () => {
    assert.equal(D['Раху'], undefined);
    assert.equal(D['Кету'], undefined);
    assert.deepEqual(drishtiSigns('Раху', 4), []);
    assert.deepEqual(drishtiSigns('Кету', 10), []);
  });
  ok('но под аспектом других грах узлы стоят (Раху во Льве — под Солнцем)', () =>
    assert.ok(allHits(D['Солнце']).includes('Раху')));
  ok('без флага смотрят ровно семь грах', () =>
    assert.equal(grahaDrishti(chart.planets, chart.lagnaSign).length, 7));
}

console.log('=== узлы: школа с 5/7/9 (includeNodes) ===');
{
  const N = map(true);
  ok('Раху (Лев): Стрелец, Водолей, Овен — дома 4, 6, 8', () => {
    assert.deepEqual(signsOf(N['Раху']), ['Стрелец', 'Водолей', 'Овен']);
    assert.deepEqual(housesOf(N['Раху']), [4, 6, 8]);
  });
  ok('в Водолее под его аспектом Солнце, Юпитер и Кету', () =>
    assert.deepEqual(hitsOf(N['Раху'], 'Водолей').sort(), ['Кету', 'Солнце', 'Юпитер']));
  ok('Кету (Водолей) с флагом смотрит в Близнецы, Лев, Весы', () =>
    assert.deepEqual(signsOf(N['Кету']), ['Близнецы', 'Лев', 'Весы']));
  ok('с флагом смотрят все девять грах, у прочих цели те же', () => {
    assert.equal(grahaDrishti(chart.planets, chart.lagnaSign, true).length, 9);
    assert.deepEqual(signsOf(N['Сатурн']), signsOf(D['Сатурн']));
  });
}

console.log(`\n✅ дришти: ${n} проверок пройдено`);
