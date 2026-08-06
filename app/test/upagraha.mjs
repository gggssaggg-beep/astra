/**
 * Упаграхи (lib/upagraha.ts) — чистая математика, небо подставляется заглушкой.
 *
 * Главные страховки:
 *  1) цепочка от Солнца ЗАМКНУТА: Упакету + 30° = Солнце. Ошибка в любом звене
 *     эту проверку ломает;
 *  2) владыки частей: днём счёт от владыки дня недели, ночью — от пятого дня;
 *     восьмая часть без владыки;
 *  3) джйотиш-сутки начинаются с ВОСХОДА: рождение под утро относится к
 *     предыдущему дню недели и к ночной половине.
 *
 * Запуск: node test/upagraha.mjs
 */
import assert from 'node:assert/strict';
import {
  sunUpagrahas, dayFrame, partLord, partUpagrahas, upagrahas, WEEK_LORDS,
} from '../src/lib/upagraha.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const norm = (x) => ((x % 360) + 360) % 360;

console.log('=== пять упаграх от Солнца ===');
{
  for (const sun of [0, 45.5, 123.75, 280, 359.9]) {
    const u = sunUpagrahas(sun);
    ok(`Солнце ${sun}°: цепочка замкнута (Упакету + 30° = Солнце)`, () => {
      const upaketu = u.find((x) => x.name === 'Упакету').lon;
      assert.ok(Math.abs(norm(upaketu + 30) - norm(sun)) < 1e-9);
    });
  }
  ok('Дхума = Солнце + 133°20′', () => {
    const u = sunUpagrahas(10);
    assert.ok(Math.abs(u[0].lon - (10 + 133 + 20 / 60)) < 1e-9);
  });
  ok('Паривеша ровно напротив Вьятипаты', () => {
    const u = sunUpagrahas(77);
    const v = u.find((x) => x.name === 'Вьятипата').lon;
    const p = u.find((x) => x.name === 'Паривеша').lon;
    assert.ok(Math.abs(norm(p - v) - 180) < 1e-9);
  });
  ok('пять штук, все в пределах круга', () => {
    const u = sunUpagrahas(200);
    assert.equal(u.length, 5);
    for (const x of u) assert.ok(x.lon >= 0 && x.lon < 360, `${x.name} = ${x.lon}`);
  });
}

// ─── заглушка неба: восход 06:00, закат 18:00 UTC каждый день ──────────────
const at = (y, mo, d, h, mi = 0) => new Date(Date.UTC(y, mo, d, h, mi));
const skyStub = (weekdayOfRise) => ({
  riseAfter: (t) => {
    const d = new Date(t);
    const r = at(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6);
    return r > t ? r : new Date(r.getTime() + 86400000);
  },
  setAfter: (t) => {
    const d = new Date(t);
    const s = at(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 18);
    return s > t ? s : new Date(s.getTime() + 86400000);
  },
  // лагна двигается 360° за сутки от 0° в полночь — легко считать ожидания
  asc: (t) => ((t.getTime() % 86400000) / 86400000) * 360,
  weekday: () => weekdayOfRise,
});

console.log('=== отрезок суток (джйотиш-сутки от восхода) ===');
{
  ok('рождение в полдень — светлая половина, восход→закат', () => {
    const f = dayFrame(at(2026, 7, 4, 12), skyStub(2));
    assert.equal(f.dayBirth, true);
    assert.equal(+f.start, +at(2026, 7, 4, 6));
    assert.equal(+f.end, +at(2026, 7, 4, 18));
  });
  ok('рождение в 22:00 — тёмная половина, закат→следующий восход', () => {
    const f = dayFrame(at(2026, 7, 4, 22), skyStub(2));
    assert.equal(f.dayBirth, false);
    assert.equal(+f.start, +at(2026, 7, 4, 18));
    assert.equal(+f.end, +at(2026, 7, 5, 6));
  });
  ok('рождение в 03:00 — ЕЩЁ ночь предыдущего дня (сутки идут от восхода)', () => {
    const f = dayFrame(at(2026, 7, 4, 3), skyStub(2));
    assert.equal(f.dayBirth, false);
    assert.equal(+f.sunrise, +at(2026, 7, 3, 6));   // восход ВЧЕРАШНИЙ
    assert.equal(+f.start, +at(2026, 7, 3, 18));
    assert.equal(+f.end, +at(2026, 7, 4, 6));
  });
  ok('нет восхода (заполярье) — отрезка нет, деградируем в null', () => {
    const polar = { ...skyStub(0), riseAfter: () => null };
    assert.equal(dayFrame(at(2026, 0, 1, 12), polar), null);
  });
}

console.log('=== владыки частей ===');
{
  // воскресенье (0): днём счёт с Солнца
  const sunday = dayFrame(at(2026, 7, 2, 12), skyStub(0));
  ok('вс, день: части идут Солнце → Луна → Марс → …', () =>
    assert.deepEqual([1, 2, 3].map((k) => partLord(sunday, k)),
      ['Солнце', 'Луна', 'Марс']));
  ok('восьмая часть — без владыки', () =>
    assert.equal(partLord(sunday, 8), null));
  ok('семь частей разбирают семь грах — ровно по одной', () => {
    const lords = [1, 2, 3, 4, 5, 6, 7].map((k) => partLord(sunday, k));
    assert.deepEqual([...lords].sort(), [...WEEK_LORDS].sort());
  });
  // ночь воскресенья: счёт с владыки ПЯТОГО дня — четверга, то есть Юпитера
  const sundayNight = dayFrame(at(2026, 7, 2, 22), skyStub(0));
  ok('вс, ночь: счёт начинается с Юпитера (пятый день от воскресенья — четверг)', () =>
    assert.equal(partLord(sundayNight, 1), 'Юпитер'));
  // суббота (6): днём первая часть Сатурна → Гулика в первой части
  const saturday = dayFrame(at(2026, 7, 1, 12), skyStub(6));
  ok('сб, день: первая часть Сатурна', () =>
    assert.equal(partLord(saturday, 1), 'Сатурн'));
}

console.log('=== шесть суточных упаграх ===');
{
  const sky = skyStub(6);                       // суббота
  const frame = dayFrame(at(2026, 7, 1, 12), sky);
  const parts = partUpagrahas(frame, sky);
  ok('посчитаны все шесть', () => assert.equal(parts.length, 6));
  ok('Гулика — в части Сатурна', () => {
    const g = parts.find((p) => p.name === 'Гулика');
    assert.equal(g.lord, 'Сатурн');
    assert.equal(g.part, 1);                    // суббота, день
  });
  // правило Георгия 06.08.2026: у всех упаграх — СЕРЕДИНА своей части,
  // у Манди — НАЧАЛО. Гулика и Манди при этом остаются разными точками
  ok('Гулика и Манди — одна часть, но разные мгновения', () => {
    const g = parts.find((p) => p.name === 'Гулика');
    const md = parts.find((p) => p.name === 'Манди');
    assert.equal(g.part, md.part);
    assert.equal(+g.at, (+g.from + +g.to) / 2);   // Гулика — середина
    assert.equal(+md.at, +md.from);               // Манди — начало
    assert.notEqual(g.lon, md.lon);
  });
  ok('все прочие упаграхи берутся на середине части', () => {
    for (const p of parts.filter((x) => x.name !== 'Манди')) {
      assert.equal(p.edge, 'mid');
      assert.equal(+p.at, (+p.from + +p.to) / 2);
    }
    assert.equal(parts.find((p) => p.name === 'Манди').edge, 'start');
  });
  ok('части равны восьмой доле светлого времени (12 ч / 8 = 90 мин)', () => {
    const g = parts.find((p) => p.name === 'Кала');
    assert.equal((g.to - g.from) / 60000, 90);
  });
  ok('лагна взята именно на своём мгновении части', () => {
    for (const p of parts) assert.equal(p.lon, sky.asc(p.at));
  });
  ok('ночью части короче или длиннее — делится своя половина', () => {
    const nightFrame = dayFrame(at(2026, 7, 1, 22), sky);
    const np = partUpagrahas(nightFrame, sky);
    const one = np[0];
    assert.equal((one.to - one.from) / 60000, 90);   // у заглушки ночь тоже 12 ч
    assert.ok(one.from >= nightFrame.start && one.to <= nightFrame.end);
  });
}

console.log('=== полный набор ===');
{
  const r = upagrahas(at(2026, 7, 1, 12), 100, skyStub(6));
  ok('одиннадцать упаграх: пять от Солнца + шесть суточных', () =>
    assert.equal(r.points.length, 11));
  ok('без места (нет неба) остаются только пять солнечных', () => {
    const only = upagrahas(at(2026, 7, 1, 12), 100, null);
    assert.equal(only.points.length, 5);
    assert.equal(only.frame, null);
    assert.deepEqual(only.parts, []);
  });
  ok('в заполярье суточные тоже отпадают, солнечные остаются', () => {
    const polar = { ...skyStub(0), riseAfter: () => null };
    const r2 = upagrahas(at(2026, 0, 1, 12), 100, polar);
    assert.equal(r2.points.length, 5);
    assert.equal(r2.frame, null);
  });
}

console.log(`\n✅ упаграхи: ${n} проверок пройдено`);
