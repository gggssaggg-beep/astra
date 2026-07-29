/**
 * Проверка «Событий дня» джйотиша (lib/vedicEvents.ts): один список всего, что
 * сегодня меняется — смены знака ВСЕМИ грахами (включая медленные), станции,
 * границы накшатры/титхи/йоги и смены даш.
 *
 * Запуск:  node test/vedicevents.mjs   (Node ≥23.6 исполняет .ts напрямую)
 */
import assert from 'node:assert/strict';
import { createEngine } from '../src/engine/engine.ts';
import { eventsOn } from '../src/engine/events.ts';
import { vedicDayEvents } from '../src/lib/vedicEvents.ts';
import { signIndexOf } from '../src/lib/vedic.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const E = await createEngine('swieph', { zodiac: 'sidereal', ayanamsa: 'lahiri' });
const day = (iso) => new Date(`${iso}T00:00:00Z`);

console.log('События дня (джйотиш)');

// ── 1. каждый день есть хоть одна граница: Луна идёт ~13°/сут, значит накшатра
//      или титхи меняются почти каждые сутки ────────────────────────────────
ok('за сутки находится хотя бы одно событие Луны', () => {
  for (const d of ['2026-07-29', '2026-01-15', '2025-11-03']) {
    const list = vedicDayEvents(E, day(d), {});
    const lunar = list.filter((e) => e.kind === 'nakshatra' || e.kind === 'tithi');
    assert.ok(lunar.length >= 1, `${d}: лунных границ нет`);
  }
});

// ── 2. список отсортирован по времени и лежит ВНУТРИ суток ─────────────────
ok('события идут по времени и не выходят за сутки', () => {
  const d0 = day('2026-07-29');
  const list = vedicDayEvents(E, d0, {});
  for (let i = 1; i < list.length; i++) {
    assert.ok(+list[i].at >= +list[i - 1].at, 'порядок сбит');
  }
  for (const e of list) {
    assert.ok(+e.at >= +d0 && +e.at <= +d0 + 86_400_000, `${e.title} вне суток`);
  }
});

// ── 3. смена знака грахой попадает в список, и это МОМЕНТ смены ────────────
//      Ищем ближайший заход любой грахи в новый знак и проверяем сам день.
ok('ингресс грахи попадает в события, знак до/после сходится', () => {
  const names = ['Солнце', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'Раху'];
  let found = 0;
  for (let k = 0; k < 60 && found < 2; k++) {
    const d0 = new Date(+day('2026-07-01') + k * 86_400_000);
    const list = vedicDayEvents(E, d0, { lagnaSign: 0 });
    for (const e of list.filter((x) => x.kind === 'ingress')) {
      const name = e.title.split(':')[0];
      if (!names.includes(name)) continue;      // Луну пропускаем: она меняет знак часто
      const jd = E.toJD(e.at);
      const before = signIndexOf(E.lon(jd - 0.02, name));
      const after = signIndexOf(E.lon(jd + 0.02, name));
      assert.notEqual(before, after, `${e.title}: знак не сменился`);
      assert.ok(e.note && /\d+-й дом/.test(e.note), 'нет дома в примечании');
      found++;
    }
  }
  assert.ok(found >= 1, 'за два месяца не нашлось ни одного ингресса грахи');
});

// ── 4. медленные грахи весомее: у Сатурна/Юпитера/узлов weight = 2 ─────────
ok('вес события: медленная граха — 2, Луна — 0', () => {
  const list = vedicDayEvents(E, day('2026-07-29'), {});
  for (const e of list) {
    if (/^(Юпитер|Сатурн|Раху|Кету):/.test(e.title)) assert.equal(e.weight, 2, e.title);
    if (e.kind === 'nakshatra') assert.equal(e.weight, 0, e.title);
  }
});

// ── 5. смены даш попадают в список ────────────────────────────────────────
ok('начало антардаши в этот день становится событием', () => {
  const d0 = day('2026-07-29');
  const at = new Date(+d0 + 5 * 3600_000);
  const dashas = [{
    lord: 'Сатурн', from: new Date(+d0 - 1e10), to: new Date(+d0 + 1e10),
    sub: [{ lord: 'Меркурий', from: at, to: new Date(+at + 1e9) }],
  }];
  const list = vedicDayEvents(E, d0, { dashas });
  const hit = list.find((e) => e.kind === 'dasha');
  assert.ok(hit, 'смена антардаши не попала в события');
  assert.match(hit.title, /Сатурн — Меркурий/);
  assert.equal(hit.weight, 2);
});

// ── 6. станции и затмения берутся из списка движка, но только ведические ──
ok('станция Урана в события джйотиша не идёт', () => {
  const d0 = day('2026-07-29');
  const base = [
    { kind: 'station', time: new Date(+d0 + 3600_000), object: 'Уран', glyph: '♅', retro: true, text: '' },
    { kind: 'station', time: new Date(+d0 + 7200_000), object: 'Сатурн', glyph: '♄', retro: false, text: '' },
  ];
  const list = vedicDayEvents(E, d0, { base });
  const st = list.filter((e) => e.kind === 'station');
  assert.equal(st.length, 1, 'ведических станций должно остаться одна');
  assert.match(st[0].title, /Сатурн/);
});

// ── 7. полнолуние помечается на границе титхи 15 → 16 ─────────────────────
ok('граница Пурнима → Пратипада помечена полнолунием', () => {
  const list = vedicDayEvents(E, day('2026-07-29'), {});
  const t = list.find((e) => e.kind === 'tithi' && e.note === 'полнолуние');
  assert.ok(t, 'полнолуние 29.07.2026 не помечено');
  // в этот момент элонгация Луна−Солнце ровно 180°
  const jd = E.toJD(t.at);
  const d = ((E.lon(jd, 'Луна') - E.lon(jd, 'Солнце')) % 360 + 360) % 360;
  assert.ok(Math.abs(d - 180) < 0.01, `элонгация ${d.toFixed(3)}°, ожидали 180°`);
});

console.log(`\n${n} проверок пройдено ✓`);
