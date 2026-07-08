/**
 * «Фигуры» в совмещённых картах (раунд 29, этап «в» — смешанный режим).
 * Ключевая фича владелицы: транзит, ЗАМЫКАЮЩИЙ натальную заготовку (транзитная
 * планета достраивает натальную оппозицию до тау-квадрата и т.п.).
 *
 * Проблема: имена планет в разных кольцах СОВПАДАЮТ («Солнце» и в натале, и в
 * транзите) — детектору фигур нужны уникальные узлы. Помечаем узлы кольцом
 * (A/B/T) невидимым разделителем; на входе движка это разные точки, на выходе
 * распаковываем обратно к глифу+кольцу. Рёбра, которые колесо РИСУЕТ линиями
 * (кросс-аспекты режима), несут `dispKey` = staticKey исходного аспекта — по
 * ним подсвечивается полигон; натальные/транзитные внутренние рёбра не
 * рисуются (dispKey=null), но участвуют в сборке и в декомпозиции карточки.
 */
import { detectFigures, staticAspects, synastryAspects, staticKey, PLANET_GLYPH } from '../engine/index.ts';
import type { BodyPosition, StaticAspect } from '../engine/index.ts';

export type Ring = 'A' | 'B' | 'T';
type ChartMode = 'natal' | 'synastry' | 'transitNatal' | 'triple';

interface ChartEdge { p1: string; p2: string; aspect: string; symbol: string; dispKey: string | null }
export interface FigureMember { glyph: string; name: string; ring: Ring }
export interface ChartFigure {
  key: string;
  id: string;                         // id реестра (для трактовки figureLore)
  name: string;                       // имя фигуры (Большой тригон…)
  members: FigureMember[];
  composition: string;                // «1☍ 2□» и т.п.
  parts: { name: string; members: FigureMember[] }[];
  staticKeys: string[];               // рисуемые рёбра для подсветки полигона
  closedByTransit: boolean;           // транзит замыкает натал — «вау»-режим
}

const SEP = '';
const tag = (ring: Ring, name: string): string => `${ring}${SEP}${name}`;
const untag = (s: string): FigureMember => {
  const name = s.slice(2);
  return { glyph: PLANET_GLYPH[name] ?? '•', name, ring: s[0] as Ring };
};
const pts = (ring: Ring, pos: BodyPosition[]) => pos.map((p) => ({ name: tag(ring, p.name), lon: p.lon }));
const grp = (list: StaticAspect[], r1: Ring, r2: Ring, drawn: boolean): ChartEdge[] =>
  list.map((a) => ({ p1: tag(r1, a.p1), p2: tag(r2, a.p2), aspect: a.aspect, symbol: a.symbol,
    dispKey: drawn ? staticKey(a) : null }));

const ORDER = ['☍', '□', '△', '⚹', '☌'];
const composeOf = (symbols: string[]): string => {
  const cnt = new Map<string, number>();
  for (const s of symbols) if (s) cnt.set(s, (cnt.get(s) ?? 0) + 1);
  return [...cnt.entries()].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]))
    .map(([s, n]) => `${n}${s}`).join('  ');
};

/**
 * Фигуры активной карты. Наталы A/B — снимок; транзит T — снимок на transitAt.
 * Смешанные режимы показывают только фигуры, где ЕСТЬ транзит и есть натал
 * (замыкание); синастрия — где участвуют оба человека; натал — все.
 */
export function chartFigures(
  mode: ChartMode,
  posA: BodyPosition[], posB: BodyPosition[], posT: BodyPosition[],
  orbOf: (name: string) => number,
): ChartFigure[] {
  const points: { name: string; lon: number }[] = [];
  const edges: ChartEdge[] = [];

  if (mode === 'natal') {
    points.push(...pts('A', posA));
    edges.push(...grp(staticAspects(posA, orbOf), 'A', 'A', true));   // натал рисуется
  } else if (mode === 'synastry') {
    points.push(...pts('A', posA), ...pts('B', posB));
    edges.push(...grp(staticAspects(posA, orbOf), 'A', 'A', false));
    edges.push(...grp(staticAspects(posB, orbOf), 'B', 'B', false));
    edges.push(...grp(synastryAspects(posA, posB, orbOf), 'A', 'B', true));   // кросс рисуется
  } else if (mode === 'transitNatal') {
    points.push(...pts('A', posA), ...pts('T', posT));
    edges.push(...grp(staticAspects(posA, orbOf), 'A', 'A', false));
    edges.push(...grp(staticAspects(posT, orbOf), 'T', 'T', false));
    edges.push(...grp(synastryAspects(posA, posT, orbOf), 'A', 'T', true));
  } else {
    points.push(...pts('A', posA), ...pts('B', posB), ...pts('T', posT));
    edges.push(...grp(staticAspects(posA, orbOf), 'A', 'A', false));
    edges.push(...grp(staticAspects(posB, orbOf), 'B', 'B', false));
    edges.push(...grp(staticAspects(posT, orbOf), 'T', 'T', false));
    edges.push(...grp(synastryAspects(posA, posT, orbOf), 'A', 'T', true));   // staticAspects
    edges.push(...grp(synastryAspects(posB, posT, orbOf), 'B', 'T', true));   // staticAspects2
    edges.push(...grp(synastryAspects(posA, posB, orbOf), 'A', 'B', false));  // AB линиями не рисуется
  }

  const hits = detectFigures<ChartEdge>(points, edges);
  const out: ChartFigure[] = [];
  for (const h of hits) {
    const members = h.planets.map(untag);
    const rings = new Set(members.map((m) => m.ring));
    const closedByTransit = rings.has('T') && members.some((m) => m.ring !== 'T');
    // фильтр по режиму: не сыпать пустыми/неинтересными фигурами
    if (mode === 'transitNatal' || mode === 'triple') { if (!closedByTransit) continue; }
    else if (mode === 'synastry') { if (!(rings.has('A') && rings.has('B'))) continue; }
    out.push({
      key: h.key,
      id: h.spec.id,
      name: h.spec.name,
      members,
      composition: composeOf(h.edges.map((e) => e.symbol)),
      parts: h.parts.map((p) => ({ name: p.spec.name, members: p.planets.map(untag) })),
      staticKeys: [...new Set(h.edges.map((e) => e.dispKey).filter((k): k is string => !!k))],
      closedByTransit,
    });
  }
  // самое интересное вперёд: замкнутые транзитом, затем крупные фигуры
  return out.sort((a, b) => Number(b.closedByTransit) - Number(a.closedByTransit) ||
    b.members.length - a.members.length || a.name.localeCompare(b.name, 'ru'));
}
