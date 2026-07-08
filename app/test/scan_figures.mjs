/**
 * Сканер РЕАЛЬНОГО НЕБА: когда за годы стояли «Фигуры дня» (ТЗ §1, требование
 * владелицы 2026-07-08 — прислать даты для проверки многоугольников).
 *
 * Снимок в полдень UTC каждый день диапазона; фигуры на транзитном небе БЕЗ
 * Луны (она даёт мимолётные треугольники — стабильные фигуры интереснее для
 * сверки). Движок moshier (headless, как parity.mjs; для major-планет точность
 * с запасом под орбис). Соседние дни одной фигуры сливаются в интервал.
 *
 * Запуск:  node test/scan_figures.mjs [годОт=2020] [годДо=2030] [орбис=1.5]
 */
import { createEngine, staticAspects, detectFigures, FIGURES } from '../src/engine/index.ts';

const y0 = Number(process.argv[2] ?? 2020);
const y1 = Number(process.argv[3] ?? 2030);
const ORB = Number(process.argv[4] ?? 1.5);
const GAP_DAYS = 3;                       // разрыв ≤3 дней внутри интервала — «мерцание» у края орбиса

// небо БЕЗ Луны (медленный набор — устойчивые фигуры)
const OBJ = ['Солнце', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн',
  'Уран', 'Нептун', 'Раху', 'Кету'];
const orbOf = () => ORB;
const specOrder = new Map(FIGURES.map((f, i) => [f.id, i]));

const E = await createEngine('moshier');
const iso = (d) => d.toISOString().slice(0, 10);
const glyphMap = new Map(E.positions(new Date(Date.UTC(y0, 0, 1, 12)), OBJ).map((p) => [p.name, p.glyph]));
const glyphs = (names) => names.map((n) => glyphMap.get(n) ?? n).join('');

const start = new Date(Date.UTC(y0, 0, 1, 12));
const end = new Date(Date.UTC(y1, 11, 31, 12));
const DAY = 86_400_000;
const totalDays = Math.round((end - start) / DAY) + 1;

// key = figureId | sorted-planets → открытый интервал {id, planets, from, last}
const active = new Map();
const done = [];
const closeStale = (today) => {
  for (const [k, r] of active) {
    if ((today - r.lastMs) / DAY > GAP_DAYS) { done.push(r); active.delete(k); }
  }
};

process.stderr.write(`Скан ${y0}–${y1}, орбис ${ORB}°, ${totalDays} дней…\n`);
let dayN = 0;
for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
  const d = new Date(t);
  const pos = E.positions(d, OBJ);
  const hits = detectFigures(pos, staticAspects(pos, orbOf));
  const todays = new Set();
  for (const h of hits) {
    const planets = [...h.planets].sort();
    const k = `${h.spec.id}|${planets.join('+')}`;
    todays.add(k);
    const r = active.get(k);
    if (r) { r.lastMs = t; r.last = iso(d); r.days++; }
    else active.set(k, { id: h.spec.id, name: h.spec.name, planets, from: iso(d), last: iso(d), lastMs: t, days: 1 });
  }
  closeStale(t);
  if (++dayN % 500 === 0) process.stderr.write(`  …${iso(d)}\n`);
}
for (const r of active.values()) done.push(r);

// группировка по фигуре (порядок реестра), внутри — по дате начала
done.sort((a, b) => (specOrder.get(a.id) - specOrder.get(b.id)) || a.from.localeCompare(b.from));
const byFig = new Map();
for (const r of done) { if (!byFig.has(r.id)) byFig.set(r.id, []); byFig.get(r.id).push(r); }

console.log(`# Фигуры на реальном небе ${y0}–${y1} (орбис ${ORB}°, без Луны)\n`);
console.log('Снимок в полдень UTC каждый день; соседние дни слиты в интервал.\n');
for (const f of FIGURES) {
  const rows = byFig.get(f.id) ?? [];
  console.log(`## ${f.name} — интервалов: ${rows.length}`);
  if (!rows.length) { console.log('_за период не встретилась (при этом орбисе)._\n'); continue; }
  const show = rows.slice(0, 25);
  for (const r of show) {
    const range = r.from === r.last ? r.from : `${r.from} … ${r.last} (${r.days} дн.)`;
    console.log(`- ${range}  ${glyphs(r.planets)}  (${r.planets.join(', ')})`);
  }
  if (rows.length > show.length) console.log(`- …ещё ${rows.length - show.length} интервал(ов)`);
  console.log('');
}
