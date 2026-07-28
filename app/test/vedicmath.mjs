/**
 * Ведическая математика (lib/vedic.ts) — БЕЗ WASM: всё считается от долгот.
 *
 * Эталон — карта 12.03.1998 18:10 (+2) с экрана джйотиш-программы астролога:
 * там видны накшатры с падами и владыками, чара-караки и достоинства. Долготы
 * взяты оттуда же (движок сходится с ними до 1.5″ — см. test/vedic.mjs).
 *
 * Запуск:  node test/vedicmath.mjs
 */
import assert from 'node:assert/strict';
import {
  nakshatraOf, tithiOf, dignityOf, charaKarakas, ruledHouses, wholeSignHouse,
  vimshottari, currentDasha, buildVedicChart, SIGN_LORDS,
  navamshaSign, vargaSign, naturalRelation, temporalRelation, compoundRelation,
} from '../src/lib/vedic.ts';

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

console.log('=== накшатры и пады (эталон — экран программы) ===');
{
  const cases = [
    ['Луна', CHART['Луна'], 'Пурвапхалгуни', 3, 'Венера'],
    ['Асцендент', ASC, 'Уттарапхалгуни', 2, 'Солнце'],
    ['Солнце', CHART['Солнце'], 'Пурвабхадра', 3, 'Юпитер'],
    ['Меркурий', CHART['Меркурий'], 'Уттарабхадра', 4, 'Сатурн'],
    ['Юпитер', CHART['Юпитер'], 'Шатабхиша', 3, 'Раху'],
    ['Сатурн', CHART['Сатурн'], 'Ревати', 3, 'Меркурий'],
  ];
  for (const [who, lon, name, pada, lord] of cases) {
    const g = nakshatraOf(lon);
    ok(`${who}: ${g.name} (пада ${g.pada}, упр. ${g.lord})`, () => {
      assert.equal(g.name, name);
      assert.equal(g.pada, pada);
      assert.equal(g.lord, lord);
    });
  }
  ok('границы: 0° Овна — Ашвини пада 1, 359°59′ — Ревати пада 4', () => {
    assert.deepEqual([nakshatraOf(0).name, nakshatraOf(0).pada], ['Ашвини', 1]);
    const last = nakshatraOf(359.99);
    assert.deepEqual([last.name, last.pada, last.index], ['Ревати', 4, 27]);
  });
}

console.log('=== чара-караки Джаймини (7 планет по градусу в знаке) ===');
{
  const k = charaKarakas(CHART);
  ok('АК Солнце (28°03′ — старший градус), АмК Сатурн, БК Луна', () => {
    assert.equal(k['Солнце'], 'АК');
    assert.equal(k['Сатурн'], 'АмК');
    assert.equal(k['Луна'], 'БК');
  });
  ok('МК Юпитер, ПиК Меркурий, ГК Венера, ДК Марс (младший градус)', () => {
    assert.equal(k['Юпитер'], 'МК');
    assert.equal(k['Меркурий'], 'ПиК');
    assert.equal(k['Венера'], 'ГК');
    assert.equal(k['Марс'], 'ДК');
  });
  ok('узлы в семикаракной схеме не участвуют', () => {
    assert.equal(k['Раху'], undefined);
    assert.equal(k['Кету'], undefined);
  });
}

console.log('=== достоинства ===');
{
  ok('Марс в Козероге 28° — экзальтация', () =>
    assert.equal(dignityOf('Марс', at('Козерог', 28, 0, 0)).kind, 'exalted'));
  ok('Марс в Раке — падение', () =>
    assert.equal(dignityOf('Марс', at('Рак', 5, 0, 0)).kind, 'debilitated'));
  ok('Солнце во Льве 5° — мулатрикона (0–20°)', () =>
    assert.equal(dignityOf('Солнце', at('Лев', 5, 0, 0)).kind, 'moolatrikona'));
  ok('Солнце во Льве 25° — уже просто своя обитель', () =>
    assert.equal(dignityOf('Солнце', at('Лев', 25, 0, 0)).kind, 'own'));
  ok('Сатурн в Рыбах — без достоинства', () =>
    assert.equal(dignityOf('Сатурн', CHART['Сатурн']).kind, null));
  ok('управители знаков — классические (Скорпион Марс, Водолей Сатурн)', () => {
    assert.equal(SIGN_LORDS[7], 'Марс');
    assert.equal(SIGN_LORDS[10], 'Сатурн');
    assert.equal(SIGN_LORDS[11], 'Юпитер');
  });
}

console.log('=== целознаковые дома и управление ===');
{
  const lagna = 5;   // Дева
  ok('Солнце в Водолее при лагне Дева → 6-й дом', () =>
    assert.equal(wholeSignHouse(CHART['Солнце'], lagna), 6));
  ok('Луна во Льве → 12-й дом', () =>
    assert.equal(wholeSignHouse(CHART['Луна'], lagna), 12));
  ok('при лагне Дева Меркурий управляет 1-м и 10-м домами', () =>
    assert.deepEqual(ruledHouses('Меркурий', lagna), [1, 10]));
  ok('Сатурн — 5-м и 6-м', () =>
    assert.deepEqual(ruledHouses('Сатурн', lagna), [5, 6]));
}

console.log('=== титхи ===');
{
  ok('Луна впереди Солнца на 0.5° — 1-й лунный день, шукла Пратипада', () => {
    const t = tithiOf(10, 10.5);
    assert.equal(t.index, 1);
    assert.equal(t.paksha, 'шукла');
    assert.equal(t.name, 'Пратипада');
  });
  ok('оппозиция (180°) — 16-й день, кришна Пратипада (сразу за полнолунием)', () => {
    const t = tithiOf(0, 180);
    assert.equal(t.index, 16);
    assert.equal(t.paksha, 'кришна');
  });
  ok('179° — Пурнима (15), 359° — Амавасья (30)', () => {
    assert.equal(tithiOf(0, 179).name, 'Пурнима');
    assert.equal(tithiOf(0, 359).name, 'Амавасья');
  });
}

console.log('=== Вимшоттари ===');
{
  const birth = new Date(Date.UTC(1998, 2, 12, 16, 10));
  const d = vimshottari(CHART['Луна'], birth);
  ok('первая махадаша — владыка накшатры Луны (Венера)', () =>
    assert.equal(d[0].lord, 'Венера'));
  ok('порядок дальше канонический: Солнце → Луна → Марс → Раху', () =>
    assert.deepEqual(d.slice(1, 5).map((p) => p.lord),
      ['Солнце', 'Луна', 'Марс', 'Раху']));
  ok('цикл — 9 махадаш, вместе 120 лет', () => {
    assert.equal(d.length, 9);
    const years = (d[8].to - d[0].from) / 86400000 / 365.25;
    assert.ok(Math.abs(years - 120) < 1e-6, `вышло ${years}`);
  });
  ok('первая даша НЕПОЛНАЯ: началась до рождения, остаток ≈ 6,37 года', () => {
    assert.ok(d[0].from < birth, 'старт первой махадаши должен быть в прошлом');
    const rest = (d[0].to - birth) / 86400000 / 365.25;
    assert.ok(Math.abs(rest - 6.366) < 0.01, `остаток ${rest.toFixed(3)} года`);
  });
  ok('махадаша Венеры длится ровно 20 лет', () => {
    const y = (d[0].to - d[0].from) / 86400000 / 365.25;
    assert.ok(Math.abs(y - 20) < 1e-9, `вышло ${y}`);
  });
  ok('антардаши: 9 штук, первая — того же владыки, сумма = махадаша', () => {
    assert.equal(d[0].sub.length, 9);
    assert.equal(d[0].sub[0].lord, 'Венера');
    assert.equal(+d[0].sub[8].to, +d[0].to);
  });
  ok('текущий период на 28.07.2026 определяется и лежит внутри своей махадаши', () => {
    const cur = currentDasha(d, new Date(Date.UTC(2026, 6, 28)));
    assert.ok(cur.maha && cur.antar && cur.pratyantar, 'не найден один из уровней');
    assert.ok(cur.antar.from >= cur.maha.from && cur.antar.to <= cur.maha.to);
    assert.ok(cur.pratyantar.from >= cur.antar.from && cur.pratyantar.to <= cur.antar.to);
  });
}

console.log('=== навамша D9 (эталон — таблица программы астролога) ===');
{
  // шесть планет с караками и Асцендент — те строки скрина, что читаются точно
  const cases = [
    ['Асцендент', ASC, 'Козерог'],
    ['Солнце', CHART['Солнце'], 'Близнецы'],
    ['Луна', CHART['Луна'], 'Весы'],
    ['Меркурий', CHART['Меркурий'], 'Скорпион'],
    ['Юпитер', CHART['Юпитер'], 'Водолей'],
    ['Венера', CHART['Венера'], 'Овен'],
  ];
  for (const [who, lon, sign] of cases) {
    ok(`${who}: навамша ${Z[navamshaSign(lon)]}`,
      () => assert.equal(Z[navamshaSign(lon)], sign));
  }
  ok('классическое правило: подвижный знак начинает варгу с себя (0° Овна → Овен)',
    () => assert.equal(navamshaSign(0), 0));
  ok('фиксированный — с 9-го от себя (0° Тельца → Козерог)',
    () => assert.equal(navamshaSign(30), 9));
  ok('двойственный — с 5-го от себя (0° Близнецов → Весы)',
    () => assert.equal(navamshaSign(60), 6));
  ok('шаг навамши — 3°20′: 3°19′ Овна ещё Овен, 3°21′ уже Телец', () => {
    assert.equal(vargaSign(3 + 19 / 60, 9), 0);
    assert.equal(vargaSign(3 + 21 / 60, 9), 1);
  });
  ok('D1 через ту же функцию = обычный знак', () => {
    assert.equal(vargaSign(CHART['Сатурн'], 1), 11);
  });
}

console.log('=== отношения планет ===');
{
  ok('натуральные: Солнце дружит с Луной, враждует с Сатурном, нейтрально к Меркурию', () => {
    assert.equal(naturalRelation('Солнце', 'Луна'), 'friend');
    assert.equal(naturalRelation('Солнце', 'Сатурн'), 'enemy');
    assert.equal(naturalRelation('Солнце', 'Меркурий'), 'neutral');
  });
  ok('отношения НЕ взаимны: Луна к Меркурию друг, Меркурий к Луне враг', () => {
    assert.equal(naturalRelation('Луна', 'Меркурий'), 'friend');
    assert.equal(naturalRelation('Меркурий', 'Луна'), 'enemy');
  });
  ok('у узлов натуральных отношений нет', () =>
    assert.equal(naturalRelation('Раху', 'Солнце'), null));
  ok('временные: 2,3,4,10,11,12-й знак от планеты — друзья, прочие — враги', () => {
    assert.equal(temporalRelation(0, 1), 'friend');    // 2-й
    assert.equal(temporalRelation(0, 11), 'friend');   // 12-й
    assert.equal(temporalRelation(0, 0), 'enemy');     // 1-й (сама с собой)
    assert.equal(temporalRelation(0, 6), 'enemy');     // 7-й
  });
  ok('составное: друг+друг = большой друг, враг+враг = большой враг', () => {
    assert.equal(compoundRelation('friend', 'friend'), 'greatFriend');
    assert.equal(compoundRelation('enemy', 'enemy'), 'greatEnemy');
  });
  ok('составное: друг+враг и враг+друг гасят друг друга в нейтралитет', () => {
    assert.equal(compoundRelation('friend', 'enemy'), 'neutral');
    assert.equal(compoundRelation('enemy', 'friend'), 'neutral');
  });
  // три строки колонки «Отношение» с экрана программы — сошлись все три
  {
    const c = buildVedicChart(CHART, {}, ASC);
    const rel = (n) => c.planets.find((p) => p.name === n);
    ok('Венера в Козероге — «большой друг» хозяину Сатурну (как на экране)', () => {
      assert.equal(rel('Венера').host, 'Сатурн');
      assert.equal(rel('Венера').hostRelation, 'greatFriend');
    });
    ok('Солнце в Водолее — «нейтрально» Сатурну: враг натурально, друг временно', () =>
      assert.equal(rel('Солнце').hostRelation, 'neutral'));
    ok('Луна во Льве — «нейтрально» Солнцу: друг натурально, враг временно', () =>
      assert.equal(rel('Луна').hostRelation, 'neutral'));
    ok('у узлов отношения к хозяину знака нет', () =>
      assert.equal(rel('Раху').hostRelation, null));
  }
}

console.log('=== Саде Сати ===');
{
  const { sadeSati } = await import('../src/lib/vedic.ts');
  // Луна во Льве (4): фазы — Сатурн в Раке (12-й от Луны), Льве (1-й), Деве (2-й)
  ok('Сатурн в 12-м от Луны — первая фаза', () =>
    assert.equal(sadeSati(4, 3)?.phase, 1));
  ok('Сатурн над Луной — вторая фаза (пик)', () =>
    assert.equal(sadeSati(4, 4)?.phase, 2));
  ok('Сатурн во 2-м от Луны — третья фаза', () =>
    assert.equal(sadeSati(4, 5)?.phase, 3));
  ok('4-й от Луны — кантака, 8-й — аштама', () => {
    assert.equal(sadeSati(4, 7)?.kind, 'kantaka');
    assert.equal(sadeSati(4, 11)?.kind, 'ashtama');
  });
  ok('в прочих знаках — неактивна (null)', () => {
    assert.equal(sadeSati(4, 6), null);
    assert.equal(sadeSati(4, 0), null);
  });
  ok('карта 12.03.1998 (Луна Лев), Сатурн в Рыбах (2026) — аштама-Шани (8-й)', () =>
    assert.equal(sadeSati(4, 11)?.kind, 'ashtama'));
}

console.log('=== сборка карты D1 ===');
{
  const retro = { 'Раху': true, 'Кету': true };
  const c = buildVedicChart(CHART, retro, ASC);
  ok('лагна — Дева, её накшатра Уттарапхалгуни', () => {
    assert.equal(c.lagnaSign, 5);
    assert.equal(c.lagnaNakshatra.name, 'Уттарапхалгуни');
  });
  ok('12 домов, дом 1 = знак лагны, дальше знаки подряд', () => {
    assert.equal(c.houses.length, 12);
    assert.equal(c.houses[0].sign, 'Дева');
    assert.equal(c.houses[3].sign, 'Стрелец');
  });
  ok('дом 7 (Рыбы) собрал Марс, Меркурий и Сатурн', () => {
    const h7 = c.houses[6];
    assert.equal(h7.sign, 'Рыбы');
    assert.deepEqual(h7.planets.map((p) => p.name).sort(),
      ['Марс', 'Меркурий', 'Сатурн']);
  });
  ok('у дома 1 (Дева) управитель Меркурий — и он стоит в 7-м доме', () => {
    assert.equal(c.houses[0].lord, 'Меркурий');
    assert.equal(c.houses[0].lordHouse, 7);
  });
  ok('лунный знак — Лев; титхи считается от Солнца и Луны', () => {
    assert.equal(c.moonSign, 4);
    assert.ok(c.tithi.index >= 1 && c.tithi.index <= 30);
  });
  ok('у каждой планеты есть дом, накшатра и достоинство', () =>
    c.planets.forEach((p) => {
      assert.ok(p.house >= 1 && p.house <= 12, p.name);
      assert.ok(p.nakshatra.name, p.name);
      assert.ok(p.dignity, p.name);
    }));
}

console.log(`\n✅ ведическая математика: ${n} проверок пройдено`);
