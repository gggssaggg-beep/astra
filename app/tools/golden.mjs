/**
 * ГЕНЕРАТОР ЗОЛОТЫХ ФАЙЛОВ — эталон для порта движка на другой язык.
 *
 * Зачем: расчётную часть Astra переносим на Java отдельной библиотекой
 * (решение владелицы 09.08.2026). Доказывать совпадение «на глаз» нельзя —
 * поэтому JS-движок прогоняется по фиксированному набору дат, мест и систем
 * домов, а результат кладётся в JSON. Порт обязан выдать ТЕ ЖЕ числа на тех же
 * входах; расхождение сразу показывает, в каком разделе оно завелось.
 *
 * ВАЖНО про состав набора: сюда намеренно включены места, на которых движки
 * обычно и ломаются — южное полушарие, заполярье, экватор, получасовой пояс,
 * гринвичский меридиан, — и даты с переходом через знак, станцией, затмением
 * и високосным днём. Ровные «удобные» даты ничего не проверяют.
 *
 * ДЖЙОТИША ЗДЕСЬ НЕТ (сознательно): библиотека первой очереди — западная
 * школа. Сидерический режим, аянамши и ведические слои в набор не входят.
 *
 * Запуск:  node tools/golden.mjs        (пишет в ../java/golden/)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine, signOf, aspectsOn, eventsOn, stationsBetween, retroPhase,
  findAspectOccurrences, findDegreePassages, degreeToLon, detectFigures, BODIES, MOON }
  from '../src/engine/index.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'java', 'golden');
mkdirSync(OUT, { recursive: true });

/** Округление до 1e-9: JSON не должен зависеть от последней цифры double. */
const r9 = (x) => (typeof x === 'number' && Number.isFinite(x) ? +x.toFixed(9) : x);
/** Момент → ISO с миллисекундами либо null (у Java та же точность). */
const iso = (d) => (d instanceof Date && !Number.isNaN(+d) ? d.toISOString() : null);

const save = (name, data) => {
  const file = join(OUT, `${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  const n = Array.isArray(data.cases) ? data.cases.length : '—';
  console.log(`  ${name}.json — случаев: ${n}`);
};

// ─── набор входов ──────────────────────────────────────────────────────────
/** Моменты UTC. Каждый выбран по причине, она в комментарии. */
const MOMENTS = [
  ['2000-01-01T12:00:00Z', 'опорная эпоха J2000, полдень UT'],
  ['1988-06-20T01:21:00Z', 'рождение в прошлом веке, до отмены перевода часов'],
  ['2024-02-29T00:00:00Z', 'високосный день'],
  ['2026-08-09T12:00:00Z', 'сегодняшний день сборки'],
  ['2026-04-20T00:00:00Z', 'Солнце у границы Овна и Тельца — ловит ошибку знака'],
  ['2026-11-10T00:00:00Z', 'Меркурий у станции — знак скорости меняется'],
  ['2027-08-02T00:00:00Z', 'сутки полного солнечного затмения'],
  ['1969-07-20T20:17:00Z', 'дата вне диапазона привычных тестов, проверка JD'],
];

/** Места: широта, долгота, зачем. */
const PLACES = [
  [55.7558, 37.6173, 'Москва — обычный северный город'],
  [-33.8688, 151.2093, 'Сидней — южное полушарие, дома переворачиваются'],
  [64.1466, -21.9426, 'Рейкьявик — высокая широта, Плацидус капризничает'],
  [-0.1807, -78.4678, 'Кито — экватор'],
  [27.7172, 85.3240, 'Катманду — пояс +5:45'],
  [51.4779, 0.0015, 'Гринвич — нулевой меридиан'],
  [78.2232, 15.6267, 'Лонгйир — заполярье, Солнце может не пересекать горизонт'],
];

const HOUSE_SYSTEMS = ['horizontal', 'placidus', 'koch', 'porphyry',
  'regiomontanus', 'campanus', 'equalAsc'];

const OBJECTS = [MOON, ...Object.keys(BODIES), 'Кету'];

// ─── прогон ────────────────────────────────────────────────────────────────
const E = await createEngine('swieph');
const meta = {
  generatedFrom: 'astra JS engine (swisseph-wasm, режим SWIEPH)',
  zodiac: E.zodiac,
  mode: E.mode,
  objects: OBJECTS,
  note: 'Порт обязан выдать те же значения. Допуски — в java/README.md.',
};

console.log('золотые файлы →', OUT);

// 1. Юлианские даты: основа всего остального, ошибка здесь сдвигает ВСЁ.
save('jd', { meta, cases: MOMENTS.map(([t, why]) => {
  const jd = E.toJD(new Date(t));
  return { utc: t, why, jd: r9(jd), backToUtc: iso(E.fromJD(jd)) };
}) });

// 2. Положения объектов.
save('positions', { meta, cases: MOMENTS.map(([t, why]) => ({
  utc: t, why,
  bodies: E.positions(new Date(t), OBJECTS).map((p) => ({
    name: p.name, lon: r9(p.lon), sign: p.sign, degInSign: r9(p.degInSign),
    speed: r9(p.speed), retro: p.retro,
  })),
})) });

// 3. Знак по долготе — чистая функция, но на границах ошибаются все.
save('signs', { meta, cases: [0, 0.0001, 29.9999, 30, 59.9999, 180, 359.9999, 360, 720.5, -0.5]
  .map((lon) => { const s = signOf(lon); return { lon: r9(lon), sign: s.sign, deg: r9(s.deg) }; }) });

// 4. Дома: все системы × все места на одном моменте + один момент на все места.
save('houses', { meta, cases: (() => {
  const out = [];
  const jd = E.toJD(new Date('2026-08-09T12:00:00Z'));
  for (const [lat, lon, why] of PLACES) {
    for (const sys of HOUSE_SYSTEMS) {
      const h = E.houses(jd, lat, lon, sys);
      out.push({ utc: '2026-08-09T12:00:00Z', lat, lon, why, system: sys,
        asc: h ? r9(h.asc) : null, mc: h ? r9(h.mc) : null,
        cusps: h ? h.cusps.map(r9) : null });
    }
  }
  return out;
})() });

// 5. Аспекты дня — сердце западной части: интервал вход → точно → выход.
save('aspects', { meta, cases: MOMENTS.map(([t, why]) => {
  const day = aspectsOn(E, new Date(t.slice(0, 10) + 'T00:00:00Z'), 1.0, true);
  const rec = (a) => ({ p1: a.p1, p2: a.p2, aspect: a.aspect, symbol: a.symbol,
    exactOrb: r9(a.exactOrb), exactTime: iso(a.exactTime),
    beginTime: iso(a.beginTime), endTime: iso(a.endTime),
    applying: a.applying, pos1: r9(a.pos1), pos2: r9(a.pos2), bucket: a.bucket });
  return { day: t.slice(0, 10), why, orb: 1.0,
    slow: day.slow.map(rec), fast: day.fast.map(rec), moon: day.moon.map(rec),
    audit: day.audit };
}) });

// 6. События неба: ингрессии, станции, лунации, затмения.
save('events', { meta, cases: MOMENTS.map(([t, why]) => ({
  day: t.slice(0, 10), why,
  events: eventsOn(E, new Date(t.slice(0, 10) + 'T00:00:00Z')).map((e) => ({
    kind: e.kind, time: iso(e.time), object: e.object ?? null, sign: e.sign ?? null,
    text: e.text, retro: e.retro ?? null, phase: e.phase ?? null,
    eclipseKind: e.eclipseKind ?? null, eclipseType: e.eclipseType ?? null,
    saros: e.saros ?? null, member: e.member ?? null,
  })),
})) });

// 7. Ретро-станции за год у каждой планеты, у которой они бывают.
save('stations', { meta, cases: ['Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'Уран', 'Нептун']
  .map((p) => ({ planet: p, from: '2026-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z',
    stations: stationsBetween(E, p, new Date('2026-01-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z'))
      .map((s) => ({ at: iso(s.at), toRetro: s.toRetro, lon: r9(s.lon) })) })) });

// 8. Фаза ретроградности (тень до и после станции).
save('retrophase', { meta, cases: ['Меркурий', 'Марс', 'Раху'].flatMap((p) =>
  ['2026-08-09T12:00:00Z', '2026-11-10T00:00:00Z'].map((t) => {
    const ph = retroPhase(E, p, new Date(t));
    return { planet: p, utc: t, phase: ph ? ph.phase ?? null : null,
      raw: ph ? JSON.parse(JSON.stringify(ph, (k, v) => (v instanceof Date ? iso(v) : r9(v)))) : null };
  })) });

// 9. Поиск точных аспектов на отрезке — им живёт прогноз.
save('occurrences', { meta, cases: await Promise.all([
  ['Марс', 'Сатурн', '☌'], ['Солнце', 'Юпитер', '□'], ['Венера', 'Уран', '△'],
].map(async ([a, b, asp]) => {
  const from = new Date('2026-01-01T00:00:00Z'), to = new Date('2026-12-31T00:00:00Z');
  const res = await findAspectOccurrences(E, a, b, asp, from, to, 1);
  return { p1: a, p2: b, aspect: asp, orb: 1,
    from: iso(from), to: iso(to), truncated: res.truncated,
    hits: res.list.map((o) => ({ exact: iso(o.exact), jd: r9(o.jd),
      begin: iso(o.begin), end: iso(o.end) })) };
})) });

// 10. Проход планеты через заданный градус зодиака (долгота — числом).
save('degrees', { meta, cases: await Promise.all([
  ['Солнце', degreeToLon(0, 0)], ['Юпитер', degreeToLon(3, 15)], ['Сатурн', degreeToLon(11, 29)],
].map(async ([p, targetLon]) => {
  const from = new Date('2026-01-01T00:00:00Z'), to = new Date('2027-06-01T00:00:00Z');
  const res = await findDegreePassages(E, p, targetLon, from, to);
  return { planet: p, targetLon: r9(targetLon), from: iso(from), to: iso(to),
    truncated: res.truncated,
    passages: res.list.map((x) => ({ exact: iso(x.exact), jd: r9(x.jd), retro: x.retro })) };
})) });

// 11. Фигуры дня — чистая геометрия поверх аспектов, но её легко сломать портом.
save('figures', { meta, cases: MOMENTS.map(([t, why]) => {
  const day = aspectsOn(E, new Date(t.slice(0, 10) + 'T00:00:00Z'), 1.0, true);
  const edges = [...day.slow, ...day.fast, ...day.moon];
  const pts = E.positions(new Date(t.slice(0, 10) + 'T00:00:00Z'), OBJECTS)
    .map((p) => ({ name: p.name, lon: p.lon }));
  return { day: t.slice(0, 10), why,
    figures: detectFigures(pts, edges).map((f) => ({
      figure: f.spec.id, key: f.key, planets: f.planets,
      parts: f.parts.map((q) => q.spec.id),
    })) };
}) });

console.log('готово.');
