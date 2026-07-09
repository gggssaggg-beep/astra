/**
 * «Фигуры дня» (раунд 29, ТЗ docs/TASK_SKY_GEOMETRY.md §1) — детекция
 * конфигураций аспектов. Чистая математика БЕЗ WASM (как static.ts): вход —
 * уже найденные движком аспекты (рёбра с орбисами пар) + долготы точек,
 * выход — фигуры. Реестр владелицы подтверждён 2026-07-08 (15 фигур).
 *
 * Реестр data-driven: фигура задана КАНОНИЧЕСКИМИ позициями (долготы с
 * точностью до поворота/зеркала); рёбра И «пустые» пары ВЫВОДЯТСЯ из них
 * автоматически. Пустые пары обязательны к проверке: трапеция и лира (и их
 * пятиугольные потомки мороженое/кораблик) имеют ОДИНАКОВЫЙ состав рёбер и
 * различаются ТОЛЬКО пустыми парами (30° против 150°); у бриллианта пустые
 * пары отсекают тау-вершину «не с той стороны» оппозиции (там лишних
 * аспектов нет — рёбрами не отличить).
 *
 * Детекция — общий матчер по реестру (одна процедура на все фигуры, без
 * кода на фигуру): обход вершин канона в порядке связности, кандидаты —
 * соседи по требуемому типу ребра. Той же цели, что «сборка из простых»
 * в ТЗ, служит декомпозиция parts: под-фигуры находятся сами (реестр идёт
 * от простых к сложным) и раскрываются внутри крупной, не дублируясь.
 */
import { ASPECTS } from './constants.ts';

/** Ребро-вход: найденный движком аспект (StaticAspect, AspectRecord, …). */
export interface FigureEdge { p1: string; p2: string; aspect: string }
export interface FigurePoint { name: string; lon: number }

export interface FigureSpec {
  id: string;
  name: string;
  arity: number;
  offsets: number[];              // канонические долготы вершин
  apex?: number;                  // индекс вершины-фокуса (тау/бисекстиль/бриллиант)
  contains: string[];             // id под-фигур для «состоит из» (от простых к сложным)
  // выводится из offsets при загрузке модуля:
  edges: { a: number; b: number; aspect: string }[];
  empties: { a: number; b: number; near: number }[];   // 30 | 150
  steps: Step[];                  // план обхода вершин для матчера
}

/** Найденная фигура. E — тип входного ребра (сохраняются ССЫЛКИ на входные
 *  рёбра: у транзитных записей это даёт окна, у статичных — ключи линий). */
export interface FigureHit<E extends FigureEdge = FigureEdge> {
  spec: FigureSpec;
  planets: string[];              // по вершинам канона (planets[spec.apex] — вершина)
  edges: E[];                     // рёбра фигуры — исходные объекты аспектов
  parts: FigureHit<E>[];          // найденные под-фигуры из spec.contains
  key: string;                    // стабильный ключ: id + отсорт. планеты
}

const dist = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

const NAME_BY_ANGLE = new Map<number, string>(
  Object.entries(ASPECTS).map(([n, a]) => [a.angle, n]));

// Допуск пустой пары: канон 30° или 150°, фактический угол обязан попасть в
// полосу ±25° (классы отстоят на 120° — полосы не пересекаются; орбис рёбер
// 1–3° сдвигает пустые пары лишь на единицы градусов).
const EMPTY_BAND = 25;

/** Шаг матчера: вершина канона + требования к уже размещённым вершинам. */
interface Step {
  v: number;                                          // индекс вершины канона
  rels: { u: number; aspect?: string; near?: number }[];  // ребро ИЛИ пустая пара
  anchor: { u: number; aspect: string };              // ребро для генерации кандидатов
}

interface RawSpec {
  id: string; name: string; arity: number; offsets: number[];
  apex?: number; contains: string[];
}

// Реестр владелицы (2026-07-08), строго от простых к сложносоставным.
// Конверт: учитываются ВСЕ трины (указание 2026-07-08) — выводятся из канона.
const RAW: RawSpec[] = [
  { id: 'kosoy-parus', name: 'Косой парус', arity: 3, offsets: [0, 60, 180], contains: [] },
  { id: 'grand-trine', name: 'Большой тригон', arity: 3, offsets: [0, 120, 240], contains: [] },
  { id: 'tau', name: 'Тау-квадрат', arity: 3, offsets: [0, 90, 180], apex: 1, contains: [] },
  { id: 'bisextile', name: 'Бисекстиль', arity: 3, offsets: [0, 60, 120], apex: 1, contains: [] },
  { id: 'grand-cross', name: 'Большой крест', arity: 4, offsets: [0, 90, 180, 270],
    contains: ['tau'] },
  { id: 'povozka', name: 'Повозка', arity: 4, offsets: [0, 60, 180, 240],
    contains: ['kosoy-parus'] },
  { id: 'parus', name: 'Парус', arity: 4, offsets: [0, 120, 180, 240],
    contains: ['kosoy-parus', 'grand-trine', 'bisextile'] },
  { id: 'kolybel', name: 'Колыбель', arity: 4, offsets: [0, 60, 120, 180],
    contains: ['kosoy-parus', 'bisextile'] },
  { id: 'trapetsiya', name: 'Трапеция', arity: 4, offsets: [0, 30, 90, 120], contains: [] },
  { id: 'lira', name: 'Лира', arity: 4, offsets: [0, 90, 210, 300], contains: [] },
  { id: 'konvert', name: 'Конверт', arity: 5, offsets: [0, 60, 180, 240, 300],
    contains: ['kosoy-parus', 'grand-trine', 'bisextile', 'povozka', 'parus', 'kolybel'] },
  { id: 'morozhenoe', name: 'Мороженое', arity: 5, offsets: [0, 30, 60, 90, 120],
    contains: ['bisextile', 'trapetsiya'] },
  { id: 'korablik', name: 'Кораблик', arity: 5, offsets: [0, 90, 150, 210, 300],
    contains: ['bisextile', 'lira'] },
  { id: 'brilliant', name: 'Бриллиант', arity: 5, offsets: [0, 60, 120, 180, 270], apex: 4,
    contains: ['kosoy-parus', 'tau', 'bisextile', 'kolybel'] },
  { id: 'shchit', name: 'Щит Давида', arity: 6, offsets: [0, 60, 120, 180, 240, 300],
    contains: ['kosoy-parus', 'grand-trine', 'bisextile', 'povozka', 'parus', 'kolybel', 'konvert'] },
];

/** Вывод рёбер/пустых пар из канона + план обхода (каждая следующая вершина
 *  связана РЕБРОМ с уже размещённой — кандидаты берутся из соседей). */
function derive(raw: RawSpec): FigureSpec {
  const edges: FigureSpec['edges'] = [];
  const empties: FigureSpec['empties'] = [];
  for (let a = 0; a < raw.arity; a++) {
    for (let b = a + 1; b < raw.arity; b++) {
      const d = dist(raw.offsets[a], raw.offsets[b]);
      const aspect = NAME_BY_ANGLE.get(d);
      if (aspect && d > 0) edges.push({ a, b, aspect });
      else if (d === 30 || d === 150) empties.push({ a, b, near: d });
      else throw new Error(`${raw.id}: пара ${a}-${b} даёт ${d}° — не мажор и не 30/150`);
    }
  }
  // порядок обхода: жадно — следующая вершина с максимумом рёбер к размещённым
  const placed = [0];
  const steps: Step[] = [];
  while (placed.length < raw.arity) {
    let best = -1, bestCnt = -1;
    for (let v = 0; v < raw.arity; v++) {
      if (placed.includes(v)) continue;
      const cnt = edges.filter((e) => (e.a === v && placed.includes(e.b)) ||
                                      (e.b === v && placed.includes(e.a))).length;
      if (cnt > bestCnt) { bestCnt = cnt; best = v; }
    }
    if (bestCnt === 0) throw new Error(`${raw.id}: вершина ${best} не связана ребром`);
    const rels: Step['rels'] = [];
    let anchor: Step['anchor'] | null = null;
    for (const u of placed) {
      const e = edges.find((x) => (x.a === best && x.b === u) || (x.b === best && x.a === u));
      if (e) { rels.push({ u, aspect: e.aspect }); anchor ??= { u, aspect: e.aspect }; }
      else {
        const m = empties.find((x) => (x.a === best && x.b === u) || (x.b === best && x.a === u))!;
        rels.push({ u, near: m.near });
      }
    }
    steps.push({ v: best, rels, anchor: anchor! });
    placed.push(best);
  }
  return { ...raw, edges, empties, steps };
}

/** Реестр фигур — 15, от простых к сложным (порядок = порядок описаний). */
export const FIGURES: FigureSpec[] = RAW.map(derive);

/** Оппозиция Раху–Кету — это ОСЬ узлов (всегда ровно 180° по геометрии), не
 *  найденная конфигурация. Фигуры на ней (постоянные косые паруса/тау на
 *  Луне+узлах) — шум; по умолчанию их не строим. true, если пара — ось узлов. */
export const isNodalAxisPair = (a: string, b: string): boolean =>
  (a === 'Раху' && b === 'Кету') || (a === 'Кету' && b === 'Раху');

const BY_ID = new Map(FIGURES.map((f) => [f.id, f]));
// самопроверка ссылок contains (ошибку реестра ловим на загрузке, не в бою)
for (const f of FIGURES) for (const c of f.contains) {
  if (!BY_ID.has(c)) throw new Error(`${f.id}: contains «${c}» нет в реестре`);
}

export const figureKey = (specId: string, planets: string[]): string =>
  `${specId}:${[...planets].sort().join('+')}`;

/**
 * Детекция фигур. `points` — долготы участников НА ОДИН момент (натал — сами
 * позиции; транзитный день — полдень: пустым парам хватает, классы 30/150
 * отстоят на 120°, суточный ход их не путает). `edges` — найденные аспекты
 * (соединения передавать ТОЖЕ: ребром фигуры они не бывают, но блокируют
 * «пустые» пары). Возвращаются МАКСИМАЛЬНЫЕ фигуры (планеты под-фигуры ⊆
 * планет крупной → под-фигура не отдельной карточкой, а в parts), порядок —
 * реестровый (от простых к сложным).
 */
export function detectFigures<E extends FigureEdge>(
  points: FigurePoint[], edges: E[],
): FigureHit<E>[] {
  const lon = new Map(points.map((p) => [p.name, p.lon]));
  // пара+аспект → исходное ребро (у пары может быть 2 записи за день: Луна
  // утром ⚹, вечером □ — храним обе); пара → есть ХОТЬ какой-то аспект
  const edgeBy = new Map<string, E>();
  const hasAspect = new Set<string>();
  const adj = new Map<string, Map<string, string[]>>();   // имя → тип → соседи
  for (const e of edges) {
    if (!lon.has(e.p1) || !lon.has(e.p2)) continue;
    const pk = pairKey(e.p1, e.p2);
    hasAspect.add(pk);
    if (e.aspect === 'соединение') continue;   // не ребро фигур, но пару занимает
    edgeBy.set(`${pk}|${e.aspect}`, e);
    for (const [me, other] of [[e.p1, e.p2], [e.p2, e.p1]]) {
      let m = adj.get(me);
      if (!m) adj.set(me, (m = new Map()));
      const arr = m.get(e.aspect);
      if (arr) { if (!arr.includes(other)) arr.push(other); } else m.set(e.aspect, [other]);
    }
  }

  const all: FigureHit<E>[] = [];
  const seen = new Set<string>();
  for (const spec of FIGURES) {
    if (points.length < spec.arity) continue;
    const assign: string[] = new Array(spec.arity);
    const used = new Set<string>();

    const emit = (): void => {
      const key = figureKey(spec.id, assign);
      if (seen.has(key)) return;   // автоморфизмы канона дают повторы
      seen.add(key);
      const hitEdges: E[] = [];
      for (const e of spec.edges) {
        const found = edgeBy.get(`${pairKey(assign[e.a], assign[e.b])}|${e.aspect}`);
        if (!found) return;        // не должно случаться — рёбра проверены шагами
        hitEdges.push(found);
      }
      all.push({ spec, planets: [...assign], edges: hitEdges, parts: [], key });
    };

    const place = (stepIdx: number): void => {
      if (stepIdx === spec.steps.length) { emit(); return; }
      const st = spec.steps[stepIdx];
      const anchorName = assign[st.anchor.u];
      const cands = adj.get(anchorName)?.get(st.anchor.aspect) ?? [];
      outer: for (const c of cands) {
        if (used.has(c)) continue;
        for (const rel of st.rels) {
          const other = assign[rel.u];
          const pk = pairKey(other, c);
          if (rel.aspect) {
            if (!edgeBy.has(`${pk}|${rel.aspect}`)) continue outer;
          } else {
            if (hasAspect.has(pk)) continue outer;               // пара занята аспектом
            const d = dist(lon.get(c)!, lon.get(other)!);
            if (Math.abs(d - rel.near!) > EMPTY_BAND) continue outer;
          }
        }
        assign[st.v] = c; used.add(c);
        place(stepIdx + 1);
        used.delete(c);
      }
    };

    // вершина 0 — любая точка; дальше по плану связности
    for (const p of points) {
      assign[0] = p.name; used.add(p.name);
      place(0);
      used.delete(p.name);
    }
  }

  // максимальность: фигура прячется внутрь любой, чьи планеты — надмножество
  const setOf = new Map(all.map((h) => [h, new Set(h.planets)]));
  const keeps = all.filter((h) => !all.some((o) =>
    o !== h && o.planets.length > h.planets.length &&
    h.planets.every((p) => setOf.get(o)!.has(p))));
  // декомпозиция «состоит из»: под-фигуры из contains внутри планет фигуры
  const specIdx = new Map(FIGURES.map((f, i) => [f.id, i]));
  for (const h of all) {
    if (!h.spec.contains.length) continue;
    h.parts = all.filter((o) => o !== h && h.spec.contains.includes(o.spec.id) &&
      o.planets.every((p) => setOf.get(h)!.has(p)))
      .sort((a, b) => specIdx.get(a.spec.id)! - specIdx.get(b.spec.id)! ||
        a.key.localeCompare(b.key, 'ru'));
  }
  return keeps.sort((a, b) => specIdx.get(a.spec.id)! - specIdx.get(b.spec.id)! ||
    a.key.localeCompare(b.key, 'ru'));
}

/**
 * Окно жизни фигуры = ПЕРЕСЕЧЕНИЕ интервалов всех рёбер (вход последнего →
 * выход первого; философия «аспект — интервал», ЗАДАНИЕ §2.2). null-края
 * записей (вход/выход за горизонтом поиска движка) считаются неограниченными.
 * Пустое пересечение → null: рёбра есть в сутках, но ОДНОВРЕМЕННО не стоят —
 * фигуры нет (это правильно, не баг).
 */
export function figureWindow(edges: { beginTime: Date | null; endTime: Date | null }[]):
  { begin: Date | null; end: Date | null } | null {
  let begin: Date | null = null, end: Date | null = null;
  for (const e of edges) {
    if (e.beginTime && (!begin || e.beginTime > begin)) begin = e.beginTime;
    if (e.endTime && (!end || e.endTime < end)) end = e.endTime;
  }
  if (begin && end && begin.getTime() >= end.getTime()) return null;
  return { begin, end };
}
