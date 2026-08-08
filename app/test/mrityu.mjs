/**
 * Мритью бхага (lib/mrityu.ts) — таблица критических градусов.
 *
 * Главная страховка здесь не математика (она тривиальна), а САМА ТАБЛИЦА:
 * 12×11 чисел, одна опечатка = молчаливая ложь астрологу. Поэтому тест держит
 * контрольные значения из трёх сверенных источников («Пхаладипика» гл. 13
 * шл. 10–11 через argala.ru, сводка Sri Jagannatha Center, astrojyoti) и
 * проверяет форму таблицы целиком.
 *
 * Запуск: node test/mrityu.mjs
 */
import assert from 'node:assert/strict';
import {
  MRITYU_BHAGA, MRITYU_MOON_PARIJATA, mrityuDegree, mrityuCheck, mrityuHits,
  mrityuOrbMin, mrityuLabel, mrityuForce,
} from '../src/lib/mrityu.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const SIGN = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева', 'Весы',
  'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];
/** долгота: знак + градус в знаке (+ минуты) */
const at = (sign, deg, min = 0) => sign * 30 + deg + min / 60;

console.log('=== форма таблицы ===');
{
  ok('одиннадцать строк: лагна, семь грах, узлы, Манди', () => {
    assert.deepEqual(Object.keys(MRITYU_BHAGA).sort(), [
      'Венера', 'Кету', 'Лагна', 'Луна', 'Манди', 'Марс', 'Меркурий',
      'Раху', 'Сатурн', 'Солнце', 'Юпитер',
    ].sort());
  });
  for (const [name, row] of Object.entries(MRITYU_BHAGA)) {
    ok(`${name}: 12 градусов в пределах знака`, () => {
      assert.equal(row.length, 12);
      for (const d of row) {
        assert.ok(Number.isInteger(d), `${name}: ${d} не целое`);
        assert.ok(d >= 1 && d <= 29, `${name}: ${d} вне знака`);
      }
    });
  }
  ok('вариант Луны из «Джатака Париджата» — тоже 12 значений', () => {
    assert.equal(MRITYU_MOON_PARIJATA.length, 12);
    // трактаты действительно расходятся: строки не совпадают
    assert.notDeepEqual([...MRITYU_MOON_PARIJATA], [...MRITYU_BHAGA['Луна']]);
  });
}

console.log('=== контрольные значения источников ===');
{
  // «Пхаладипика», порядок знаков Овен→Рыбы — сверено по трём источникам
  const CANON = {
    'Солнце':   [20, 9, 12, 6, 8, 24, 16, 17, 22, 2, 3, 23],
    'Луна':     [26, 12, 13, 25, 24, 11, 26, 14, 13, 25, 5, 12],
    'Марс':     [19, 28, 25, 23, 29, 28, 14, 21, 2, 15, 11, 6],
    'Меркурий': [15, 14, 13, 12, 8, 18, 20, 10, 21, 22, 7, 5],
    'Юпитер':   [19, 29, 12, 27, 6, 4, 13, 10, 17, 11, 15, 28],
    'Венера':   [28, 15, 11, 17, 10, 13, 4, 6, 27, 12, 29, 19],
    'Сатурн':   [10, 4, 7, 9, 12, 16, 3, 18, 28, 14, 13, 15],
    'Раху':     [14, 13, 12, 11, 24, 23, 22, 21, 10, 20, 18, 8],
    'Кету':     [8, 18, 20, 10, 21, 22, 23, 24, 11, 12, 13, 14],
    'Лагна':    [1, 9, 22, 22, 25, 2, 4, 23, 18, 20, 24, 10],
    'Манди':    [23, 24, 11, 12, 13, 14, 8, 18, 20, 10, 21, 22],
  };
  for (const [name, row] of Object.entries(CANON)) {
    ok(`${name}: строка совпадает с источниками`, () => {
      assert.deepEqual([...MRITYU_BHAGA[name]], row);
    });
  }
  ok('mrityuDegree читает нужную клетку (Сатурн в Стрельце = 28°)', () => {
    assert.equal(mrityuDegree('Сатурн', 8), 28);
    assert.equal(mrityuDegree('Лагна', 0), 1);
    assert.equal(mrityuDegree('Луна', 0, 'parijata'), 8);
  });
  ok('незнакомая точка (Дхума) таблицей не покрыта', () => {
    assert.equal(mrityuDegree('Дхума', 3), null);
    assert.equal(mrityuCheck('Дхума', 100), null);
  });
}

console.log('=== попадание и орбис ===');
{
  // Правка астролога 2026-08-07 (раунд 2, §3, источник sudarshana.ru): орбис
  // ОДИН ГРАДУС до и после точки — одинаково для всех, включая лагну и Манди.
  // Узкие орбисы Чарака (40′/30′) больше не действуют.
  ok('орбис — один градус у всех точек', () => {
    for (const p of ['Лагна', 'Солнце', 'Луна', 'Меркурий', 'Марс', 'Юпитер',
      'Венера', 'Сатурн', 'Раху', 'Кету', 'Манди']) {
      assert.equal(mrityuOrbMin(p), 60);
    }
  });
  ok('сила растёт к точке: 1 в градусе, 0 на краю, половина на 30′', () => {
    assert.equal(mrityuCheck('Марс', at(0, 19)).strength, 1);
    assert.equal(Math.round(mrityuCheck('Марс', at(0, 19, 30)).strength * 100), 50);
    assert.ok(mrityuCheck('Марс', at(0, 19, 59)).strength < 0.02);
  });
  ok('жирным — ближе половины орбиса', () => {
    assert.equal(mrityuCheck('Марс', at(0, 19, 20)).strong, true);
    assert.equal(mrityuCheck('Марс', at(0, 19, 45)).strong, false);
  });
  ok('сила словами — от точки к краю', () => {
    assert.match(mrityuForce(mrityuCheck('Марс', at(0, 19))), /предельно/);
    assert.match(mrityuForce(mrityuCheck('Марс', at(0, 19, 20))), /сильно/);
    assert.match(mrityuForce(mrityuCheck('Марс', at(0, 19, 50))), /слабее/);
  });
  ok('Марс 19°00′ Овна — точное попадание', () => {
    const h = mrityuCheck('Марс', at(0, 19));
    assert.ok(h);
    assert.equal(h.degree, 19);
    assert.equal(Math.round(h.offMin), 0);
    assert.equal(h.variant, 'phaladeepika');
  });
  ok('Марс 19°59′ Овна — ещё в орбисе, 20°01′ — уже нет', () => {
    assert.ok(mrityuCheck('Марс', at(0, 19, 59)));
    assert.equal(mrityuCheck('Марс', at(0, 20, 1)), null);
  });
  ok('орбис двусторонний: Марс 18°01′ — попадание, 17°59′ — нет', () => {
    assert.ok(mrityuCheck('Марс', at(0, 18, 1)));
    assert.equal(mrityuCheck('Марс', at(0, 17, 59)), null);
    assert.ok(mrityuCheck('Марс', at(0, 18, 1)).offMin < 0);   // не дошла
  });
  ok('Солнце в другом знаке смотрит СВОЮ клетку (Дева 24°, не 20°)', () => {
    assert.equal(mrityuCheck('Солнце', at(5, 20)), null);
    assert.ok(mrityuCheck('Солнце', at(5, 24)));
  });
  ok('лагна с широким орбисом: 1°50′ Овна ещё попадает', () => {
    assert.ok(mrityuCheck('Лагна', at(0, 1, 50)));
    assert.equal(mrityuCheck('Лагна', at(0, 2, 10)), null);
  });
  ok('долгота нормализуется (Рыбы через 360°)', () => {
    const h = mrityuCheck('Кету', at(11, 14) - 360);
    assert.ok(h);
    assert.equal(h.signIndex, 11);
    assert.equal(h.degree, 14);
  });
}

console.log('=== два трактата про Луну ===');
{
  ok('Луна 26° Овна — попадание по «Пхаладипике»', () => {
    const h = mrityuCheck('Луна', at(0, 26));
    assert.ok(h);
    assert.equal(h.variant, 'phaladeepika');
  });
  ok('Луна 8° Овна — попадание только по «Джатака Париджата»', () => {
    const h = mrityuCheck('Луна', at(0, 8));
    assert.ok(h);
    assert.equal(h.variant, 'parijata');
    assert.equal(h.degree, 8);
  });
  ok('Луна 15° Овна — мимо обоих трактатов', () => {
    assert.equal(mrityuCheck('Луна', at(0, 15)), null);
  });
}

console.log('=== список попаданий по карте ===');
{
  ok('из карты выбираются только попавшие точки', () => {
    const hits = mrityuHits([
      { name: 'Солнце', lon: at(0, 20, 10) },    // попал
      { name: 'Марс', lon: at(0, 5) },           // мимо
      { name: 'Сатурн', lon: at(8, 28, 20) },    // попал
      { name: 'Дхума', lon: at(2, 12) },         // не в таблице
    ]);
    assert.deepEqual(hits.map((h) => h.name), ['Солнце', 'Сатурн']);
  });
  ok('подпись читается по-человечески', () => {
    assert.match(mrityuLabel(mrityuCheck('Марс', at(0, 19))), /^19° — точно/);
    assert.match(mrityuLabel(mrityuCheck('Марс', at(0, 18, 45))), /не дошла 15′/);
    assert.match(mrityuLabel(mrityuCheck('Марс', at(0, 19, 15))), /прошла 15′/);
  });
}

console.log(`\nВсего проверок: ${n} — все прошли.`);
