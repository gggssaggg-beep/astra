<script lang="ts" module>
  /**
   * Ведическая карта D1 в СЕВЕРО-ИНДИЙСКОМ стиле (North Indian) — только
   * отрисовка по готовым данным, НИКАКИХ расчётов (движок живёт отдельно).
   *
   * Канон стиля: рамка-квадрат, обе диагонали и вписанный ромб. Дома стоят на
   * ФИКСИРОВАННЫХ местах (дом 1 — верхний центральный ромб, дальше против
   * часовой стрелки), а по домам «едут» знаки — поэтому в каждой ячейке
   * подписан номер ЗНАКА, а не дома.
   */
  export interface VedicChartCell {
    house: number;      // 1..12 — номер дома (фиксированная позиция в North Indian)
    signIndex: number;  // 0..11 — знак в этом доме (0=Овен … 11=Рыбы)
    planets: { short: string; deg: number; retro: boolean }[];  // short — краткая метка
  }

  type P = [number, number];

  // Полигоны домов в системе координат viewBox 0 0 100 100 (канон, не менять).
  const HOUSE_POLY: P[][] = [
    [[50, 0], [75, 25], [50, 50], [25, 25]],      // 1  — верхний центральный ромб
    [[0, 0], [50, 0], [25, 25]],                  // 2
    [[0, 0], [25, 25], [0, 50]],                  // 3
    [[0, 50], [25, 25], [50, 50], [25, 75]],      // 4  — левый центральный ромб
    [[0, 50], [25, 75], [0, 100]],                // 5
    [[0, 100], [25, 75], [50, 100]],              // 6
    [[50, 100], [25, 75], [50, 50], [75, 75]],    // 7  — нижний центральный ромб
    [[50, 100], [75, 75], [100, 100]],            // 8
    [[100, 100], [75, 75], [100, 50]],            // 9
    [[100, 50], [75, 75], [50, 50], [75, 25]],    // 10 — правый центральный ромб
    [[100, 50], [75, 25], [100, 0]],              // 11
    [[100, 0], [75, 25], [50, 0]],                // 12
  ];

  const centroid = (pts: P[]): P => [
    pts.reduce((s, p) => s + p[0], 0) / pts.length,
    pts.reduce((s, p) => s + p[1], 0) / pts.length,
  ];
  const onFrame = (v: number) => v === 0 || v === 100;

  /**
   * Внешний якорь ячейки — точка на рамке квадрата, «к которой смотрит» дом:
   * у треугольников это середина их стороны, лежащей на рамке, у центральных
   * ромбов — единственная вершина, касающаяся рамки. От него отсчитываются и
   * номер знака (у самого края), и сдвиг подписей планет внутрь (чтобы текст
   * не липнул к рамке).
   */
  const anchor = (pts: P[]): P => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (a[0] === b[0] && onFrame(a[0])) return [a[0], (a[1] + b[1]) / 2];
      if (a[1] === b[1] && onFrame(a[1])) return [(a[0] + b[0]) / 2, a[1]];
    }
    // ромбы: сторон на рамке нет, берём вершину на рамке
    return pts.find((p) => onFrame(p[0]) || onFrame(p[1])) ?? centroid(pts);
  };

  const SIGN_INSET = 5.5;   // насколько номер знака отступает от рамки внутрь
  const TEXT_INSET = 3.2;   // подпись планет в треугольнике — глубже от рамки

  // Готовая геометрия всех 12 ячеек: путь полигона, точка номера знака и центр
  // столбика планет. Считается один раз на модуль — она константна.
  export const VEDIC_CELLS = HOUSE_POLY.map((pts, i) => {
    const c = centroid(pts);
    const a = anchor(pts);
    const dx = c[0] - a[0], dy = c[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;              // единичный вектор «внутрь»
    const rhomb = pts.length === 4;
    return {
      house: i + 1,
      rhomb,
      points: pts.map((p) => p.join(',')).join(' '),
      sx: a[0] + ux * SIGN_INSET, sy: a[1] + uy * SIGN_INSET,
      // у ромбов центроид уже в середине ячейки; треугольник сдвигаем от рамки
      tx: c[0] + (rhomb ? 0 : ux * TEXT_INSET),
      ty: c[1] + (rhomb ? 0 : uy * TEXT_INSET),
    };
  });
</script>

<script lang="ts">
  let { cells, size = 320, onhouse }:
    { cells: VedicChartCell[]; size?: number; onhouse?: (house: number) => void } = $props();

  // ячейка ищется по номеру дома — порядок входного массива не важен
  const byHouse = $derived(new Map(cells.map((c) => [c.house, c])));

  const view = $derived(VEDIC_CELLS.map((g) => {
    const cell = byHouse.get(g.house);
    return { ...g, sign: cell ? cell.signIndex + 1 : null };
  }));
</script>

<svg viewBox="0 0 100 100" class="vchart" style="max-width: {size}px"
  preserveAspectRatio="xMidYMid meet"
  role="img" aria-label="Ведическая карта, северный стиль">
  <!-- рамка + обе диагонали + вписанный ромб — единственные видимые линии -->
  <rect x="0" y="0" width="100" height="100" class="frame" />
  <line x1="0" y1="0" x2="100" y2="100" class="grid" />
  <line x1="100" y1="0" x2="0" y2="100" class="grid" />
  <polygon points="50,0 100,50 50,100 0,50" class="grid" />

  {#each view as g (g.house)}
    <!-- полигон невидим: он якорь позиции текста и зона касания дома -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <polygon points={g.points} class="cell" class:tappable={!!onhouse}
      onclick={onhouse ? () => onhouse(g.house) : undefined} />
    {#if g.sign !== null}
      <text x={g.sx} y={g.sy} class="signnum">{g.sign}</text>
    {/if}
  {/each}
</svg>

<style>
  .vchart { width: 100%; height: auto; display: block; margin: 0 auto; }
  .frame { fill: none; stroke: var(--glass-brd); stroke-width: 0.8; }
  .grid { fill: none; stroke: var(--glass-brd); stroke-width: 0.6; opacity: 0.85; }
  .cell { fill: transparent; stroke: none; }
  .cell.tappable { pointer-events: all; cursor: pointer; outline: none; }
  .signnum {
    fill: var(--ink-faint); font-size: 3.6px; opacity: 0.8;
    text-anchor: middle; dominant-baseline: central;
  }
</style>
