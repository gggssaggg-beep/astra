/**
 * Тест ведических уведомлений (docs/TASK_JYOTISH_ROUND2.md §5).
 *
 * Повод: владелице приходили «несуществующие аспекты» — уведомления были
 * только западные, а в джйотише таких аспектов на экранах нет вовсе. Здесь
 * закреплено, что у ведических уведомлений СВОЙ словарь (панчанга, даши,
 * гочара) и что западных слов в них не остаётся.
 *
 * Запуск: node test/vedicnotify.mjs
 */
import assert from 'node:assert/strict';
import { panchangaBody, panchangaTitle, pickVedicEvents, vedicEventTitle, vedicEventBody,
  NOTIFY_KINDS, VEDIC_TAG } from '../src/lib/vedicNotify.ts';
import { panchangaOf } from '../src/lib/panchanga.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

// момент → «14:20» без возни с поясами: тест про тексты, не про Intl
const T = (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

console.log('=== панчанга ===');
{
  // Солнце 0° Овна, Луна 40° — титхи 4 (шукла), накшатра 3-я, среда
  const p = panchangaOf(0, 40, 3);
  const ends = {
    nakshatra: { at: new Date(Date.UTC(2026, 7, 8, 9, 5)), next: 'Рохини' },
    tithi: { at: new Date(Date.UTC(2026, 7, 8, 14, 20)) },
  };
  const body = panchangaBody(p, ends, T);
  ok('все пять членов на месте', () => {
    for (const part of [p.vara.name, p.tithi.name, p.nakshatra.name, p.yoga.name, p.karana.name]) {
      assert.ok(body.includes(part), `нет «${part}» в: ${body}`);
    }
  });
  ok('титхи и накшатра с моментом смены', () => {
    assert.ok(body.includes('до 14:20'), body);
    assert.ok(body.includes('до 09:05 → Рохини'), body);
  });
  ok('пакша названа', () => assert.match(body, /шукла|кришна/));
  ok('без моментов смены текст не ломается', () => {
    const short = panchangaBody(p, {}, T);
    assert.ok(!short.includes('до '), short);
    assert.ok(short.includes(p.nakshatra.name));
  });
  ok('заголовок помечен школой', () => assert.ok(panchangaTitle().startsWith(VEDIC_TAG)));

  // главное правило проекта: в ведическом уведомлении нет западных слов
  const WEST = ['аспект', 'орбис', 'натал', 'транзит', 'асцендент', 'соединение', 'квадратура'];
  ok('западных слов нет ни в теле, ни в заголовке', () => {
    const all = `${panchangaTitle()} ${body}`.toLowerCase();
    for (const w of WEST) assert.ok(!all.includes(w), `просочилось «${w}»: ${all}`);
  });
}

console.log('=== отбор важных дат ===');
{
  const now = new Date(Date.UTC(2026, 7, 8, 12));
  const ev = (days, kind, title = 'X') =>
    ({ at: new Date(now.getTime() + days * 86400000), kind, title, detail: 'подробности', weight: 1 });
  const events = [
    ev(-3, 'dasha'),            // прошлое — не берём
    ev(2, 'antar'),
    ev(10, 'ingress'),
    ev(30, 'saturn'),
    ev(40, 'node'),
    ev(5, 'station'),           // фон: уже есть в западной сводке ретро-строкой
    ev(100, 'dasha'),           // за горизонтом
  ];
  const picked = pickVedicEvents(events, now, 45, 70);
  ok('берутся только будущие в горизонте', () =>
    assert.deepEqual(picked.map((e) => e.kind), ['antar', 'ingress', 'saturn', 'node']));
  ok('станции в уведомления не идут', () => assert.ok(!NOTIFY_KINDS.includes('station')));
  ok('порядок — по времени', () => {
    const ms = picked.map((e) => +e.at);
    assert.deepEqual(ms, [...ms].sort((a, b) => a - b));
  });
  ok('лимит режет список', () => assert.equal(pickVedicEvents(events, now, 45, 2).length, 2));
  ok('пустой вход — пустой выход', () => assert.deepEqual(pickVedicEvents([], now, 45, 10), []));
}

console.log('=== тексты событий ===');
{
  const e = { at: new Date(), kind: 'dasha', weight: 2, title: 'Махадаша Венера',
    detail: 'Начинается большой период Венера. '.repeat(20) };
  ok('заголовок помечен школой и несёт событие', () => {
    const t = vedicEventTitle(e);
    assert.ok(t.startsWith(VEDIC_TAG));
    assert.ok(t.includes('Махадаша Венера'));
  });
  ok('длинное пояснение обрезается с многоточием', () => {
    const b = vedicEventBody(e);
    assert.ok(b.length <= 181, `длина ${b.length}`);
    assert.ok(b.endsWith('…'));
  });
  ok('короткое пояснение остаётся целым', () => {
    const short = { ...e, detail: 'Меняется тон периода.' };
    assert.equal(vedicEventBody(short), 'Меняется тон периода.');
  });
}

console.log(`\n✅ ведические уведомления: ${n} проверок пройдено`);
