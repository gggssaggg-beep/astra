/**
 * Панчанга (lib/panchanga.ts): чистая математика вары, йоги и караны + два
 * момента перехода, посчитанные РЕАЛЬНЫМ сидерическим движком.
 *
 * Таблицы — канон (порядок 27 йог, 60 каран в лунном месяце), проверяются
 * границами: первая/последняя единица цикла и стык между ними. Переходы
 * сверяются «сами с собой»: в найденный момент долгота обязана стоять НА
 * границе (накшатра — кратное 13°20′, титхи — кратное 12°).
 *
 * Запуск:  node test/panchanga.mjs   (Node ≥23.6 исполняет .ts напрямую)
 */
import assert from 'node:assert/strict';
import {
  varaOf, yogaOf, karanaOf, panchangaOf, nextNakshatraEnd, nextTithiEnd,
  YOGAS, YOGA_SPAN, KARANA_MOVABLE, KARANA_COUNT,
} from '../src/lib/panchanga.ts';
import { NAK_SPAN, tithiOf } from '../src/lib/vedic.ts';
import { createEngine } from '../src/engine/engine.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const norm = (d) => ((d % 360) + 360) % 360;

console.log('=== вара (владыка дня недели) ===');
{
  ok('0 = воскресенье → Солнце (Равивара)', () => {
    const v = varaOf(0);
    assert.equal(v.lord, 'Солнце');
    assert.equal(v.name, 'Равивара');
    assert.equal(v.day, 'воскресенье');
  });
  ok('6 = суббота → Сатурн (Шанивара)', () => {
    const v = varaOf(6);
    assert.equal(v.lord, 'Сатурн');
    assert.equal(v.name, 'Шанивара');
  });
  ok('порядок владык: Солнце, Луна, Марс, Меркурий, Юпитер, Венера, Сатурн', () =>
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((i) => varaOf(i).lord),
      ['Солнце', 'Луна', 'Марс', 'Меркурий', 'Юпитер', 'Венера', 'Сатурн']));
}

console.log('=== йога (сумма долгот Солнца и Луны, 27 по 13°20′) ===');
{
  ok('сумма 0°01′ → Вишкамбха (1)', () => {
    const y = yogaOf(0, 1 / 60);
    assert.equal(y.index, 1);
    assert.equal(y.name, 'Вишкамбха');
    assert.ok(y.fraction < 0.002, `доля ${y.fraction}`);
  });
  ok('сумма 359,9° → Вайдхрити (27)', () => {
    const y = yogaOf(300, 59.9);
    assert.equal(y.index, 27);
    assert.equal(y.name, 'Вайдхрити');
  });
  ok('граница 13°20′: до неё Вишкамбха, за ней Прити (2)', () => {
    // ровно НА границе спрашивать бессмысленно: у 360/27 нет точного двоичного
    // вида, и приведение круга (±360°) шевелит последний бит. Проверяем стык:
    // на волосок раньше — первая йога, на волосок позже — вторая.
    assert.equal(yogaOf(YOGA_SPAN - 1e-6, 0).name, 'Вишкамбха');
    const y = yogaOf(YOGA_SPAN + 1e-6, 0);
    assert.equal(y.index, 2);
    assert.equal(y.name, 'Прити');
    assert.ok(y.fraction < 1e-6, `доля ${y.fraction}`);
  });
  ok('сумма больше круга сворачивается: 350° + 30° = 20° → Прити', () =>
    assert.equal(yogaOf(350, 30).name, 'Прити'));
  ok('имён ровно 27, повторов нет', () => {
    assert.equal(YOGAS.length, 27);
    assert.equal(new Set(YOGAS).size, 27);
  });
}

console.log('=== карана (половина титхи, 60 в лунном месяце) ===');
{
  // k = floor((Луна − Солнце) / 6): ставим Солнце в 0°, Луну в середину половины
  const kar = (k) => karanaOf(0, k * 6 + 3);
  ok('k=0 → Кимстугхна (неподвижная)', () => {
    assert.equal(kar(0).name, 'Кимстугхна');
    assert.equal(kar(0).movable, false);
  });
  ok('k=1 → Бава (первая подвижная)', () => {
    assert.equal(kar(1).name, 'Бава');
    assert.equal(kar(1).movable, true);
  });
  ok('k=7 → Вишти (конец цикла из семи)', () => assert.equal(kar(7).name, 'Вишти'));
  ok('k=8 → снова Бава (цикл пошёл по второму кругу)', () =>
    assert.equal(kar(8).name, 'Бава'));
  ok('k=57/58/59 → Шакуни, Чатушпада, Нага', () =>
    assert.deepEqual([57, 58, 59].map((k) => kar(k).name),
      ['Шакуни', 'Чатушпада', 'Нага']));
  ok('в месяце ровно 60 каран: 4 неподвижные + 7 подвижных × 8', () => {
    const all = Array.from({ length: KARANA_COUNT }, (_, k) => kar(k));
    assert.equal(all.length, 60);
    assert.equal(all.filter((c) => !c.movable).length, 4);
    assert.equal(all.filter((c) => c.movable).length, 56);
    KARANA_MOVABLE.forEach((name) =>
      assert.equal(all.filter((c) => c.name === name).length, 8, name));
  });
  ok('номер караны и доля: середина k=3 → index 4, доля 0,5', () => {
    const c = kar(3);
    assert.equal(c.index, 4);
    assert.ok(Math.abs(c.fraction - 0.5) < 1e-9, `доля ${c.fraction}`);
  });
  ok('карана — половина титхи: k=4 и k=5 лежат в одном титхи (3-м)', () => {
    const a = kar(4), b = kar(5);
    assert.deepEqual([a.name, b.name], ['Тайтила', 'Гара']);
    assert.equal(tithiOf(0, 4 * 6 + 3).index, 3);
    assert.equal(tithiOf(0, 5 * 6 + 3).index, 3);
  });
}

console.log('=== панчанга целиком ===');
{
  ok('пять членов собираются разом и согласованы между собой', () => {
    const sun = 128.4, moon = 55.7, p = panchangaOf(sun, moon, 3);
    assert.equal(p.vara.lord, 'Меркурий');
    assert.equal(p.karana.index, Math.floor(norm(moon - sun) / 6) + 1);
    assert.equal(p.yoga.name, YOGAS[Math.floor(norm(sun + moon) / YOGA_SPAN)]);
    // карана — половина титхи: её номер должен ложиться в текущий титхи
    assert.equal(Math.ceil(p.karana.index / 2), p.tithi.index);
    assert.ok(p.nakshatra.pada >= 1 && p.nakshatra.pada <= 4);
  });
}

console.log('=== переходы Луны и титхи (сидерический движок) ===');
{
  const eph = await createEngine('swieph', { zodiac: 'sidereal', ayanamsa: 'lahiri' });
  const from = new Date(Date.UTC(2026, 6, 28, 12));
  const hours = (d) => (d.getTime() - from.getTime()) / 3600000;

  const nak = nextNakshatraEnd(eph, from);
  ok(`Луна входит в ${nak.next} через ${hours(nak.at).toFixed(2)} ч`, () => {
    assert.ok(hours(nak.at) > 0 && hours(nak.at) < 48, `${hours(nak.at)} ч вне окна`);
    const l = norm(eph.lon(eph.toJD(nak.at), 'Луна'));
    const off = Math.abs(((l % NAK_SPAN) + NAK_SPAN) % NAK_SPAN);
    const gap = Math.min(off, NAK_SPAN - off);          // расстояние до границы
    assert.ok(gap < 0.02, `Луна в ${gap.toFixed(4)}° от границы накшатры`);
  });
  ok('имя следующей накшатры совпадает с той, куда Луна реально вошла', () => {
    // берём момент чуть ПОСЛЕ перехода (минута), чтобы не спорить о границе
    const after = new Date(nak.at.getTime() + 60000);
    const l = norm(eph.lon(eph.toJD(after), 'Луна'));
    const NAKS = ['Ашвини', 'Бхарани', 'Криттика', 'Рохини', 'Мригашира', 'Ардра',
      'Пунарвасу', 'Пушья', 'Ашлеша', 'Магха', 'Пурвапхалгуни', 'Уттарапхалгуни',
      'Хаста', 'Читра', 'Свати', 'Вишакха', 'Анурадха', 'Джьештха', 'Мула',
      'Пурвашадха', 'Уттарашадха', 'Шравана', 'Дхаништха', 'Шатабхиша',
      'Пурвабхадра', 'Уттарабхадра', 'Ревати'];
    assert.equal(NAKS[Math.floor(l / NAK_SPAN)], nak.next);
  });

  const tit = nextTithiEnd(eph, from);
  ok(`титхи сменится на ${tit.next} через ${hours(tit.at).toFixed(2)} ч`, () => {
    assert.ok(hours(tit.at) > 0 && hours(tit.at) < 48, `${hours(tit.at)} ч вне окна`);
    const jd = eph.toJD(tit.at);
    const d = norm(eph.lon(jd, 'Луна') - eph.lon(jd, 'Солнце'));
    const off = d % 12;
    const gap = Math.min(off, 12 - off);
    assert.ok(gap < 0.02, `разница Луна−Солнце в ${gap.toFixed(4)}° от кратного 12°`);
    assert.ok(tit.next >= 1 && tit.next <= 30, `титхи ${tit.next} вне 1..30`);
  });
  ok('следующий титхи идёт сразу за текущим (по кругу 30)', () => {
    const jd = eph.toJD(from);
    const d = norm(eph.lon(jd, 'Луна') - eph.lon(jd, 'Солнце'));
    const cur = Math.floor(d / 12) + 1;
    assert.equal(tit.next, (cur % 30) + 1);
  });
}

console.log(`\n✅ панчанга: ${n} проверок пройдено`);
