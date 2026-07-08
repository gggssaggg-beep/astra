/**
 * Тест детекции «Фигур дня» (engine/figures.ts). БЕЗ WASM: фигуры — функции от
 * долгот + список рёбер (staticAspects). Реестр владелицы подтверждён 2026-07-08.
 *
 * Запуск:  node test/figures.mjs   (Node ≥23.6 исполняет .ts напрямую)
 */
import assert from 'node:assert/strict';
import { FIGURES, detectFigures, figureWindow, figureKey } from '../src/engine/figures.ts';
import { staticAspects } from '../src/engine/static.ts';
import { signOf } from '../src/engine/engine.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const spec = (id) => FIGURES.find((f) => f.id === id);

const ORB = 2.0;                   // орбис теста (запас под джиттер ±0.8 = пара ≤1.6)
const NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const mk = (name, lon) => {
  const l = ((lon % 360) + 360) % 360;
  const s = signOf(l);
  return { name, lon: l, sign: s.sign, signGlyph: s.glyph, degInSign: s.deg, glyph: '•', speed: 0, retro: false };
};
// расставить канон: поворот rot, зеркало, джиттер ±jit — фигура НЕ зависит от них
const put = (offsets, { rot = 0, mirror = false, jit = 0 } = {}) =>
  offsets.map((o, i) => {
    const base = mirror ? rot - o : rot + o;
    const j = jit ? ((Math.sin(i * 12.9898 + rot) * 43758.5453) % 1) * jit : 0;   // ±jit
    return mk(NAMES[i], base + j);
  });
const edgesOf = (pts) => staticAspects(pts, () => ORB);
const detect = (pts) => detectFigures(pts, edgesOf(pts));

console.log('=== реестр: 15 фигур, порядок от простых к сложным ===');
ok('ровно 15 фигур', () => assert.equal(FIGURES.length, 15));
ok('порядок арности неубывающий (простые раньше сложных)', () => {
  for (let i = 1; i < FIGURES.length; i++) assert.ok(FIGURES[i].arity >= FIGURES[i - 1].arity);
});
ok('первая — косой парус (треугольник), последняя — щит Давида (6)', () => {
  assert.equal(FIGURES[0].id, 'kosoy-parus');
  assert.equal(FIGURES[14].id, 'shchit');
});

console.log('=== самопроверка: состав рёбер выведен из канона = цифры владелицы ===');
// aspect-мультимножество ребра фигуры (ключ — символ для наглядности)
const tally = (edges) => {
  const t = {};
  for (const e of edges) t[e.aspect] = (t[e.aspect] ?? 0) + 1;
  return t;
};
const EXPECT = {
  'kosoy-parus': { 'оппозиция': 1, 'трин': 1, 'секстиль': 1 },
  'grand-trine': { 'трин': 3 },
  'tau': { 'оппозиция': 1, 'квадрат': 2 },
  'bisextile': { 'трин': 1, 'секстиль': 2 },
  'grand-cross': { 'оппозиция': 2, 'квадрат': 4 },
  'povozka': { 'оппозиция': 2, 'трин': 2, 'секстиль': 2 },
  'parus': { 'оппозиция': 1, 'трин': 3, 'секстиль': 2 },
  'kolybel': { 'оппозиция': 1, 'трин': 2, 'секстиль': 3 },
  'trapetsiya': { 'трин': 1, 'квадрат': 2, 'секстиль': 1 },
  'lira': { 'трин': 1, 'квадрат': 2, 'секстиль': 1 },
  'konvert': { 'оппозиция': 2, 'трин': 4, 'секстиль': 4 },   // ВСЕ трины (владелица 2026-07-08)
  'morozhenoe': { 'трин': 1, 'квадрат': 2, 'секстиль': 3 },
  'korablik': { 'трин': 1, 'квадрат': 2, 'секстиль': 3 },
  'brilliant': { 'оппозиция': 1, 'трин': 2, 'секстиль': 3, 'квадрат': 2 },
  'shchit': { 'секстиль': 6, 'трин': 6, 'оппозиция': 3 },
};
for (const [id, exp] of Object.entries(EXPECT)) {
  ok(`${id}: рёбра ${JSON.stringify(exp)}`, () => assert.deepEqual(tally(spec(id).edges), exp));
}
ok('конверт содержит ВСЕ 4 трина (0 пустых пар — полный граф)', () => {
  assert.equal(spec('konvert').empties.length, 0);
  assert.equal(tally(spec('konvert').edges)['трин'], 4);
});

console.log('=== пустые пары: разделяют двойников по составу рёбер ===');
const emp = (id) => spec(id).empties.map((e) => e.near).sort((a, b) => a - b);
ok('трапеция — 2 пустых по 30°', () => assert.deepEqual(emp('trapetsiya'), [30, 30]));
ok('лира — 2 пустых по 150°', () => assert.deepEqual(emp('lira'), [150, 150]));
ok('мороженое — 4 пустых по 30°', () => assert.deepEqual(emp('morozhenoe'), [30, 30, 30, 30]));
ok('кораблик — 4 пустых по 150°', () => assert.deepEqual(emp('korablik'), [150, 150, 150, 150]));

console.log('=== позитив: все 15 канонов находятся (поворот/зеркало/джиттер) ===');
for (const f of FIGURES) {
  ok(`${f.id} находится при 3 разных положениях`, () => {
    for (const opt of [{ rot: 0 }, { rot: 137.5, mirror: true, jit: 0.8 }, { rot: 300.2, jit: 0.6 }]) {
      const hits = detect(put(f.offsets, opt));
      assert.ok(hits.some((h) => h.spec.id === f.id), `${f.id} не найден при ${JSON.stringify(opt)}`);
    }
  });
}

console.log('=== негатив: двойники не путаются (пустые пары) ===');
ok('трапеция НЕ определяется как лира', () => {
  const hits = detect(put(spec('trapetsiya').offsets));
  assert.ok(hits.some((h) => h.spec.id === 'trapetsiya'));
  assert.ok(!hits.some((h) => h.spec.id === 'lira'));
});
ok('лира НЕ определяется как трапеция', () => {
  const hits = detect(put(spec('lira').offsets));
  assert.ok(hits.some((h) => h.spec.id === 'lira'));
  assert.ok(!hits.some((h) => h.spec.id === 'trapetsiya'));
});
ok('мороженое (30°) ≠ кораблик (150°) и наоборот', () => {
  const ice = detect(put(spec('morozhenoe').offsets)).map((h) => h.spec.id);
  const boat = detect(put(spec('korablik').offsets)).map((h) => h.spec.id);
  assert.ok(ice.includes('morozhenoe') && !ice.includes('korablik'));
  assert.ok(boat.includes('korablik') && !boat.includes('morozhenoe'));
});

console.log('=== негатив: бриллиант — тау только с ДРУГОЙ стороны оппозиции ===');
ok('колыбель [0,60,120,180] + тау-вершина на 270 = бриллиант', () => {
  const hits = detect(put([0, 60, 120, 180, 270]));
  assert.ok(hits.some((h) => h.spec.id === 'brilliant'));
});
ok('та же вершина на 90 (та же сторона) — НЕ бриллиант (пустые пары 30°, не 150°)', () => {
  const hits = detect(put([0, 60, 120, 180, 90]));
  assert.ok(!hits.some((h) => h.spec.id === 'brilliant'));
  assert.ok(hits.some((h) => h.spec.id === 'kolybel'));   // колыбель остаётся
});

console.log('=== негатив: парус без одного секстиля — не парус (но тригон цел) ===');
ok('убрать ребро 180–240 ⚹: парус пропадает, большой тригон остаётся', () => {
  const pts = put([0, 120, 240, 180]);       // A0 B120 C240 D180
  const edges = edgesOf(pts).filter((e) => {
    const s = [e.p1, e.p2].sort().join('');
    return !(s === 'CD' && e.aspect === 'секстиль');   // D(180)–C(240) секстиль
  });
  const hits = detectFigures(pts, edges);
  assert.ok(!hits.some((h) => h.spec.id === 'parus'));
  assert.ok(hits.some((h) => h.spec.id === 'grand-trine'));
});

console.log('=== максимальность и декомпозиция (parts) ===');
ok('полный парус → одна карточка parus, тригон+бисекстиль внутри parts', () => {
  const hits = detect(put(spec('parus').offsets));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].spec.id, 'parus');
  const partIds = hits[0].parts.map((p) => p.spec.id);
  assert.ok(partIds.includes('grand-trine'));
  assert.ok(partIds.includes('bisextile'));
  assert.ok(partIds.includes('kosoy-parus'));
});
ok('щит Давида → одна карточка, ровно 2 больших тригона в parts', () => {
  const hits = detect(put(spec('shchit').offsets));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].spec.id, 'shchit');
  const trines = hits[0].parts.filter((p) => p.spec.id === 'grand-trine');
  assert.equal(trines.length, 2);
});
ok('planets[apex] — это вершина фигуры (тау): в двух квадратах', () => {
  const hits = detect(put([0, 90, 180]));    // тау, вершина = offset 90 (индекс 1)
  const tau = hits.find((h) => h.spec.id === 'tau');
  const apexName = tau.planets[tau.spec.apex];
  const sq = tau.edges.filter((e) => e.aspect === 'квадрат' && (e.p1 === apexName || e.p2 === apexName));
  assert.equal(sq.length, 2);
});
ok('key стабилен и не зависит от порядка планет', () => {
  assert.equal(figureKey('tau', ['C', 'A', 'B']), figureKey('tau', ['A', 'B', 'C']));
});

console.log('=== figureWindow: пересечение интервалов рёбер ===');
const D = (iso) => new Date(iso);
ok('пересечение = [max(вход), min(выход)]', () => {
  const w = figureWindow([
    { beginTime: D('2026-07-08T08:00:00Z'), endTime: D('2026-07-08T20:00:00Z') },
    { beginTime: D('2026-07-08T10:00:00Z'), endTime: D('2026-07-08T14:00:00Z') },
  ]);
  assert.equal(w.begin.toISOString(), '2026-07-08T10:00:00.000Z');
  assert.equal(w.end.toISOString(), '2026-07-08T14:00:00.000Z');
});
ok('непересекающиеся окна → null (фигура не собирается)', () => {
  const w = figureWindow([
    { beginTime: D('2026-07-08T08:00:00Z'), endTime: D('2026-07-08T10:00:00Z') },
    { beginTime: D('2026-07-08T12:00:00Z'), endTime: D('2026-07-08T14:00:00Z') },
  ]);
  assert.equal(w, null);
});
ok('null-край = неограничен (вход/выход за горизонтом движка)', () => {
  const w = figureWindow([
    { beginTime: null, endTime: D('2026-07-08T20:00:00Z') },
    { beginTime: D('2026-07-08T10:00:00Z'), endTime: null },
  ]);
  assert.equal(w.begin.toISOString(), '2026-07-08T10:00:00.000Z');
  assert.equal(w.end.toISOString(), '2026-07-08T20:00:00.000Z');
});

console.log(`\n=== ФИГУРЫ: все ${n} проверок зелёные ===`);
