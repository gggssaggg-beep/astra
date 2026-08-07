/**
 * ШКОЛА УВЕДОМЛЕНИЙ (правка владелицы 2026-08-07: «приходят несуществующие
 * аспекты»). Тест закрывает три вещи разом:
 *
 *  1. настройка `notifySchool` и её умолчание = режим приложения;
 *  2. ПРИЧИНУ жалобы на живом движке: зодиак набор аспектов НЕ меняет (обе
 *     долготы едут на одну аянамшу), а вот УЗЛЫ меняют — средний и истинный
 *     расходятся до ~1,7°, и при орбисе 1° аспект Раху/Кету то есть, то нет.
 *     Считать сводку на ведическом движке и подписывать её западными словами
 *     значило слать аспекты, которых в западной карте не существует;
 *  3. что уведомления уважают тумблеры объектов из настроек (раньше reminders
 *     звал aspectsOn без них — пинги про выключенные объекты), и что ведический
 *     текст написан словарём джйотиша.
 *
 * Запуск:  node test/notifyschool.mjs   (Node ≥23.6 исполняет .ts напрямую)
 */
import assert from 'node:assert/strict';
import { createEngine } from '../src/engine/engine.ts';
import { aspectsOn } from '../src/engine/aspects.ts';
import { eventsOn } from '../src/engine/events.ts';
import { notifySchoolOf, notifyZodiacOptions, NOTIFY_SCHOOLS } from '../src/lib/models.ts';
import { pickDigest } from '../src/lib/digestSlots.ts';
import { vedicDayEvents, vedicNotifyText, VEDIC_EVENT_KIND_TITLE } from '../src/lib/vedicEvents.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const day = (iso) => new Date(`${iso}T00:00:00Z`);
const OBJ = ['Луна', 'Меркурий', 'Венера', 'Солнце', 'Марс',
  'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Раху', 'Кету'];

// ─────────────────────────── 1. настройка ───────────────────────────
console.log('=== Settings.notifySchool ===');
ok('умолчание в западном режиме — западная школа', () => {
  assert.equal(notifySchoolOf({ zodiac: 'tropical' }), 'west');
  assert.equal(notifySchoolOf({}), 'west');
});
ok('умолчание в ведическом режиме — джйотиш (ничего не меняется молча)', () => {
  assert.equal(notifySchoolOf({ zodiac: 'sidereal' }), 'jyotish');
});
ok('явный выбор сильнее режима приложения — в обе стороны', () => {
  assert.equal(notifySchoolOf({ zodiac: 'sidereal', notifySchool: 'west' }), 'west');
  assert.equal(notifySchoolOf({ zodiac: 'tropical', notifySchool: 'jyotish' }), 'jyotish');
});
ok('западная школа = тропический круг и ИСТИННЫЕ узлы даже в ведическом режиме', () => {
  const o = notifyZodiacOptions({ zodiac: 'sidereal', notifySchool: 'west' });
  assert.equal(o.zodiac, 'tropical');
  assert.notEqual(o.nodes, 'mean');   // истинные узлы — правило западной части ТЗ
});
ok('джйотиш = сидерика, аянамша из настроек, СРЕДНИЕ узлы', () => {
  const o = notifyZodiacOptions({ zodiac: 'tropical', notifySchool: 'jyotish', ayanamsa: 'raman' });
  assert.equal(o.zodiac, 'sidereal');
  assert.equal(o.ayanamsa, 'raman');
  assert.equal(o.nodes, 'mean');
  assert.equal(notifyZodiacOptions({ zodiac: 'sidereal' }).ayanamsa, 'lahiri');  // без выбора — Лахири
});
ok('в списке школ ровно две и обе резолвятся', () => {
  assert.deepEqual(NOTIFY_SCHOOLS.map((s) => s.id), ['west', 'jyotish']);
});

// ─────────────── 2. причина: узлы, а не зодиак ───────────────
const trop = await createEngine('swieph', { zodiac: 'tropical' });                                  // истинные узлы
const sidTrue = await createEngine('swieph', { zodiac: 'sidereal', ayanamsa: 'lahiri', nodes: 'true' });
const sidMean = await createEngine('swieph', { zodiac: 'sidereal', ayanamsa: 'lahiri', nodes: 'mean' });
const keys = (E, d, objects = OBJ, orb = 1.0) => {
  const r = aspectsOn(E, d, orb, false, objects);
  return new Set([...r.fast, ...r.slow].map((a) => `${a.p1}|${a.aspect}|${a.p2}`));
};
const sorted = (s) => [...s].sort();

console.log('=== причина «несуществующих аспектов» ===');
ok('аянамша набор аспектов НЕ меняет (сдвиг одинаков у обеих долгот)', () => {
  for (const d of ['2026-08-09', '2026-09-28', '2026-10-19', '2026-02-14']) {
    assert.deepEqual(sorted(keys(sidTrue, day(d))), sorted(keys(trop, day(d))),
      `зодиак изменил набор аспектов ${d} — этого быть не должно`);
  }
});
ok('СРЕДНИЕ узлы дают аспект, которого нет у истинных (28.09.2026)', () => {
  const mean = keys(sidMean, day('2026-09-28')), tru = keys(trop, day('2026-09-28'));
  assert.ok(mean.has('Меркурий|трин|Раху'), 'у средних узлов трин Меркурий–Раху есть');
  assert.ok(!tru.has('Меркурий|трин|Раху'), 'у истинных узлов его нет — вот «несуществующий аспект»');
});
ok('и наоборот: у истинных есть аспект, которого нет у средних (09.08.2026)', () => {
  const mean = keys(sidMean, day('2026-08-09')), tru = keys(trop, day('2026-08-09'));
  assert.ok(tru.has('Марс|трин|Раху'));
  assert.ok(!mean.has('Марс|трин|Раху'));
});
ok('расхождение затрагивает ТОЛЬКО узлы — прочие пары совпадают', () => {
  const noNodes = (s) => sorted(s).filter((k) => !k.includes('Раху') && !k.includes('Кету'));
  for (const d of ['2026-08-09', '2026-09-28', '2026-10-19']) {
    assert.deepEqual(noNodes(keys(sidMean, day(d))), noNodes(keys(trop, day(d))), d);
  }
});

// ─────────────── 3. тумблеры объектов из настроек ───────────────
console.log('=== уведомления уважают тумблеры объектов ===');
ok('выключенный объект исчезает из набора аспектов', () => {
  const off = OBJ.filter((o) => o !== 'Уран');
  let sawUranus = false;
  for (const d of ['2026-08-09', '2026-09-28', '2026-10-19', '2026-02-14', '2026-05-05']) {
    const full = keys(trop, day(d), OBJ, 3.0), cut = keys(trop, day(d), off, 3.0);
    if (sorted(full).some((k) => k.includes('Уран'))) sawUranus = true;
    for (const k of cut) {
      assert.ok(full.has(k), 'урезанный набор — подмножество полного');
      assert.ok(!k.includes('Уран'), `выключенный Уран остался в наборе ${d}: ${k}`);
    }
  }
  assert.ok(sawUranus, 'проверка вырождена: Уран не встретился ни в одном из дней');
});

// ─────────────── 4. отбор в строку сводки ───────────────
console.log('=== pickDigest: веский повод не вытесняется мелочью ===');
ok('веса вперёд, а в готовой строке — хронология', () => {
  const ev = (ms, w, id) => ({ ms, w, id });
  const src = [ev(10, 0, 'a'), ev(20, 2, 'b'), ev(30, 0, 'c'), ev(40, 1, 'd')];
  const got = pickDigest(src, (e) => e.w, (e) => e.ms, 2);
  assert.deepEqual(got.map((e) => e.id), ['b', 'd']);   // веса 2 и 1, по времени b→d
});
ok('при равном весе берётся более раннее', () => {
  const src = [{ ms: 50, w: 1 }, { ms: 5, w: 1 }, { ms: 30, w: 1 }];
  assert.deepEqual(pickDigest(src, (e) => e.w, (e) => e.ms, 2).map((e) => e.ms), [5, 30]);
});
ok('коротких списков не режет и порядок держит', () => {
  const src = [{ ms: 9, w: 0 }, { ms: 1, w: 0 }];
  assert.deepEqual(pickDigest(src, (e) => e.w, (e) => e.ms).map((e) => e.ms), [1, 9]);
});

// ─────────────── 5. словарь джйотиша в тексте уведомления ───────────────
console.log('=== ведическое уведомление говорит на языке джйотиша ===');
// правило владелицы «два интерфейса, не путать»: этих слов в ведическом пути нет
const BANNED = ['аспект', 'орбис', 'транзит', 'натал', 'синастри', 'асцендент', 'планет', 'композит'];
ok('в названиях видов событий нет западных слов', () => {
  for (const [kind, title] of Object.entries(VEDIC_EVENT_KIND_TITLE)) {
    const low = title.toLowerCase();
    for (const w of BANNED) assert.ok(!low.includes(w), `«${title}» (${kind}) содержит «${w}»`);
  }
});
ok('готовые строки уведомлений за неделю — тоже без западных слов', () => {
  let seen = 0;
  for (let d = 0; d < 7; d++) {
    const start = new Date(day('2026-08-09').getTime() + d * 86_400_000);
    for (const ev of vedicDayEvents(sidMean, start, { lagnaSign: 5, base: eventsOn(sidMean, start) })) {
      const t = vedicNotifyText(ev);
      assert.ok(t.title.length && t.body.length);
      const low = `${t.title} ${t.body}`.toLowerCase();
      for (const w of BANNED) assert.ok(!low.includes(w), `«${t.title} · ${t.body}» содержит «${w}»`);
      seen++;
    }
  }
  assert.ok(seen >= 7, `за неделю нашлось всего ${seen} поводов — проверка вырождена`);
});
ok('вес 0 (накшатра/титхи/йога) есть — их и не пускаем в точечные пинги', () => {
  const list = vedicDayEvents(sidMean, day('2026-08-09'), {});
  assert.ok(list.some((e) => e.weight === 0), 'лунная мелочь в списке дня есть');
});

console.log(`\n=== ШКОЛА УВЕДОМЛЕНИЙ: все ${n} проверок зелёные ===`);
