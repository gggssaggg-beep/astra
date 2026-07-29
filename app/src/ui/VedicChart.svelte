<script lang="ts" module>
  /**
   * Ведическая карта D1 — только отрисовка по готовым данным, НИКАКИХ расчётов
   * (движок живёт отдельно). Два канонических стиля, проп `layout`:
   *
   *  • 'north' (по умолчанию) — СЕВЕРО-ИНДИЙСКИЙ: рамка-квадрат, обе диагонали и
   *    вписанный ромб. Дома стоят на ФИКСИРОВАННЫХ местах (дом 1 — верхний
   *    центральный ромб, дальше против часовой стрелки), а по домам «едут» знаки —
   *    поэтому в ячейке подписан номер ЗНАКА.
   *  • 'south' — ЮЖНО-ИНДИЙСКИЙ: сетка 4×4, центр 2×2 пустой. Здесь наоборот:
   *    ЗНАК закреплён за местом (по часовой стрелке от Овна), а «едут» по клеткам
   *    дома — поэтому подписан номер ДОМА, а лагна помечена диагональной чертой
   *    в левом верхнем углу своей клетки.
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
   * Внешние якоря ячейки — точки на рамке квадрата, «к которым смотрит» дом.
   *  · base — от него отсчитывается направление ВНУТРЬ (к центроиду): у
   *    треугольника это середина стороны, лежащей на рамке, у центрального
   *    ромба — единственная вершина, касающаяся рамки.
   *  · sign — где подписан номер знака. У треугольника середина стороны занята:
   *    там же по высоте идут подписи планет (боковые дома 3/5/9/11 накладывались
   *    цифрой на метку). Поэтому номер уезжает к УГЛУ квадрата — как и просит
   *    канон («у внешнего угла ячейки»). Соседние треугольники делят угол, но
   *    подходят к нему по разным сторонам, так что цифры расходятся.
   */
  const CORNER_BIAS = 0.55;
  const anchors = (pts: P[]): { base: P; sign: P } => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const flat = (a[0] === b[0] && onFrame(a[0])) || (a[1] === b[1] && onFrame(a[1]));
      if (!flat) continue;
      const mid: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // угол квадрата — тот конец стороны, у которого ОБЕ координаты на рамке
      const corner = onFrame(a[0]) && onFrame(a[1]) ? a : b;
      return { base: mid, sign: [mid[0] + (corner[0] - mid[0]) * CORNER_BIAS,
        mid[1] + (corner[1] - mid[1]) * CORNER_BIAS] };
    }
    // ромбы: сторон на рамке нет, берём вершину на рамке — она и есть их угол
    const v = pts.find((p) => onFrame(p[0]) || onFrame(p[1])) ?? centroid(pts);
    return { base: v, sign: v };
  };

  const SIGN_INSET = 5.5;   // насколько номер знака отступает от рамки внутрь
  const TEXT_INSET = 3.2;   // подпись планет в треугольнике — глубже от рамки

  // Готовая геометрия всех 12 ячеек: путь полигона, точка номера знака и центр
  // столбика планет. Считается один раз на модуль — она константна.
  export const VEDIC_CELLS = HOUSE_POLY.map((pts, i) => {
    const c = centroid(pts);
    const a = anchors(pts);
    const dx = c[0] - a.base[0], dy = c[1] - a.base[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;              // единичный вектор «внутрь»
    const rhomb = pts.length === 4;
    return {
      house: i + 1,
      rhomb,
      points: pts.map((p) => p.join(',')).join(' '),
      sx: a.sign[0] + ux * SIGN_INSET, sy: a.sign[1] + uy * SIGN_INSET,
      // у ромбов центроид уже в середине ячейки; треугольник сдвигаем от рамки
      tx: c[0] + (rhomb ? 0 : ux * TEXT_INSET),
      ty: c[1] + (rhomb ? 0 : uy * TEXT_INSET),
    };
  });

  // ─── южно-индийский стиль (South Indian) ──────────────────────────────────
  // Сетка 4×4 в том же viewBox: 12 внешних клеток по 25×25, центр 2×2 пустой.
  // Знак закреплён за КЛЕТКОЙ и идёт по часовой стрелке от Овна (второе место
  // верхнего ряда) — канон, менять нельзя. null = клетка центра.
  const SOUTH_SIGNS: (number | null)[] = [
    11, 0, 1, 2,          // Рыбы · Овен · Телец · Близнецы
    10, null, null, 3,    // Водолей ·   центр   · Рак
    9, null, null, 4,     // Козерог ·   центр   · Лев
    8, 7, 6, 5,           // Стрелец · Скорпион · Весы · Дева
  ];

  const SIDE = 25;                 // сторона клетки
  const LAGNA_MARK = SIDE * 0.35;  // длина катета диагональной метки лагны

  /** Единый вид геометрии для отрисовки — оба стиля рисуются одним кодом. */
  export interface ChartGeom {
    key: string;
    house: number;      // север: дом закреплён за местом; юг: 0 — дом придёт с данными
    signIndex: number;  // юг: знак закреплён за местом; север: −1 — знак придёт с данными
    rhomb: boolean;     // «просторная» клетка (центральный ромб севера, квадрат юга)
    points: string;
    sx: number; sy: number;   // цифра в углу клетки
    tx: number; ty: number;   // центр столбика грах
    /** метка лагны (только юг): диагональ, срезающая левый верхний угол клетки */
    lagna: { x1: number; y1: number; x2: number; y2: number } | null;
  }

  /** Геометрия 12 клеток южного стиля: знак — свойство МЕСТА, дом придёт с данными. */
  export const SOUTH_CELLS: ChartGeom[] = SOUTH_SIGNS.flatMap((si, i) => {
    if (si === null) return [];
    const x = (i % 4) * SIDE, y = Math.floor(i / 4) * SIDE;
    return [{
      key: `s${si}`,
      signIndex: si,
      house: 0,                    // «дом не задан местом» — берётся из данных
      rhomb: true,                 // квадрат просторен, как центральный ромб севера
      points: `${x},${y} ${x + SIDE},${y} ${x + SIDE},${y + SIDE} ${x},${y + SIDE}`,
      // номер дома — в ПРАВОМ верхнем углу: левый занят меткой лагны
      sx: x + SIDE - 4.2, sy: y + 4.2,
      tx: x + SIDE / 2, ty: y + SIDE / 2,
      lagna: { x1: x, y1: y + LAGNA_MARK, x2: x + LAGNA_MARK, y2: y },
    }];
  });

  /** Та же геометрия севера, приведённая к общему виду (сам канон не тронут). */
  export const NORTH_CELLS: ChartGeom[] = VEDIC_CELLS.map((g) => ({
    key: `h${g.house}`, house: g.house, signIndex: -1, rhomb: g.rhomb,
    points: g.points, sx: g.sx, sy: g.sy, tx: g.tx, ty: g.ty, lagna: null,
  }));

  /** Линии сетки южного стиля: центр 2×2 остаётся пустым, поэтому средние
   *  линии проведены только по краевым полосам. */
  export const SOUTH_GRID: [number, number, number, number][] = [
    [0, 25, 100, 25], [0, 75, 100, 75],     // горизонтали через всю карту
    [25, 0, 25, 100], [75, 0, 75, 100],     // вертикали через всю карту
    [0, 50, 25, 50], [75, 50, 100, 50],     // середина левого и правого столбцов
    [50, 0, 50, 25], [50, 75, 50, 100],     // середина верхнего и нижнего рядов
  ];
</script>

<script lang="ts">
  let { cells, size = 320, layout = 'north', onhouse }:
    { cells: VedicChartCell[]; size?: number; layout?: 'north' | 'south';
      onhouse?: (house: number) => void } = $props();

  const south = $derived(layout === 'south');
  // север: место = ДОМ, ячейку ищем по дому; юг: место = ЗНАК, ищем по знаку.
  // Порядок входного массива в обоих случаях не важен.
  const byHouse = $derived(new Map(cells.map((c) => [c.house, c])));
  const bySign = $derived(new Map(cells.map((c) => [c.signIndex, c])));

  /**
   * Кегль столбика планет. Чем больше планет в доме, тем мельче — иначе стеллиум
   * вылезает за полигон. Треугольники теснее центральных ромбов (вписанный круг
   * вдвое меньше), поэтому от трёх планет им дополнительная скидка.
   */
  const metrics = (n: number, rhomb: boolean) => {
    const base = n <= 1 ? 5.2 : n === 2 ? 4.8 : n === 3 ? 4.2 : n === 4 ? 3.6 : 3.1;
    const fs = rhomb || n < 3 ? base : base * 0.88;
    return { fs, lh: fs * 1.15, sup: fs * 0.62, rise: fs * 0.4 };
  };

  const view = $derived((south ? SOUTH_CELLS : NORTH_CELLS).map((g) => {
    const bySignCell = g.signIndex >= 0;      // южная клетка знает свой знак
    const cell = bySignCell ? bySign.get(g.signIndex) : byHouse.get(g.house);
    const ps = cell?.planets ?? [];
    const m = metrics(ps.length, g.rhomb);
    // Переносы строк — вручную (<tspan x= dy=>), т.к. SVG сам текст не переносит.
    // Надстрочный градус уводит текущую точку вверх на rise; вернуть её обязан
    // либо «R», либо (если ретроградности нет) следующая строка — иначе строки
    // поползут вверх. Этот «долг» и копится в debt.
    let debt = 0;
    const lines = ps.map((p, i) => {
      const dy = (i === 0 ? -((ps.length - 1) * m.lh) / 2 : m.lh) + debt;
      // deg < 0 = «градуса нет» (варги: там своя шкала, градус не читают) —
      // тогда надстрочника нет вовсе, и точку вверх никто не уводит
      const deg = p.deg < 0 ? null : String(Math.max(0, Math.floor(p.deg)));
      debt = deg !== null && !p.retro ? m.rise : 0;
      return { dy, short: p.short, deg, retro: p.retro };
    });
    return {
      key: g.key, points: g.points, sx: g.sx, sy: g.sy, tx: g.tx, ty: g.ty,
      // дом для касания: на юге он приходит с данными, на севере задан местом
      house: cell?.house ?? g.house,
      // цифра в углу: север — номер ЗНАКА (знаки едут по домам), юг — номер ДОМА
      corner: cell ? (bySignCell ? cell.house : cell.signIndex + 1) : null,
      // метка лагны рисуется только у клетки первого дома (и только на юге)
      lagna: cell?.house === 1 ? g.lagna : null,
      lines, ...m,
    };
  }));
</script>

<svg viewBox="0 0 100 100" class="vchart" style="max-width: {size}px"
  preserveAspectRatio="xMidYMid meet"
  role="img" aria-label="Ведическая карта, {south ? 'южный' : 'северный'} стиль">
  <!-- рамка — общая у обоих стилей; внутренние линии у каждого свои -->
  <rect x="0" y="0" width="100" height="100" class="frame" />
  {#if south}
    <!-- сетка 4×4 с пустым центром 2×2 -->
    {#each SOUTH_GRID as [x1, y1, x2, y2], i (i)}
      <line {x1} {y1} {x2} {y2} class="grid" />
    {/each}
  {:else}
    <!-- обе диагонали + вписанный ромб -->
    <line x1="0" y1="0" x2="100" y2="100" class="grid" />
    <line x1="100" y1="0" x2="0" y2="100" class="grid" />
    <polygon points="50,0 100,50 50,100 0,50" class="grid" />
  {/if}

  {#each view as g (g.key)}
    <!-- полигон невидим: он якорь позиции текста и зона касания дома -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <polygon points={g.points} class="cell" class:tappable={!!onhouse && g.house > 0}
      onclick={onhouse && g.house > 0 ? () => onhouse(g.house) : undefined} />
    {#if g.lagna}
      <!-- канон южного стиля: лагна отмечена срезанным углом клетки -->
      <line x1={g.lagna.x1} y1={g.lagna.y1} x2={g.lagna.x2} y2={g.lagna.y2} class="lagna" />
    {/if}
    {#if g.corner !== null}
      <text x={g.sx} y={g.sy} class="signnum">{g.corner}</text>
    {/if}
    {#if g.lines.length}
      <!-- tspan'ы держим В ОДНУ строку без пробелов: перевод строки в разметке
           SVG превратился бы в реальный пробел между меткой и градусом -->
      <text x={g.tx} y={g.ty} class="planets" font-size={g.fs}>
        {#each g.lines as l, i (i)}<tspan x={g.tx} dy={l.dy} class:retro={l.retro}>{l.short}</tspan>{#if l.deg !== null}<tspan dy={-g.rise} font-size={g.sup} class="deg">{l.deg}</tspan>{/if}{#if l.retro}<tspan dy={l.deg !== null ? g.rise : 0} class="retro">R</tspan>{/if}{/each}
      </text>
    {/if}
  {/each}
</svg>

<style>
  .vchart { width: 100%; height: auto; display: block; margin: 0 auto; }
  /* Штрихи тонкие: viewBox 100 единиц растягивается до ~320 px, т.е. каждая
     единица ≈ 3 px — «единичная» линия смотрелась бы жирнее колеса.
     Рамка чуть подсвечена фиолетом — та же кромка, что у зодиакального
     кольца в ui/Wheel.svelte (без drop-shadow: глоу-фильтры дороги для WebView). */
  .frame {
    fill: none; stroke-width: 0.45;
    stroke: color-mix(in srgb, var(--neon-violet) 40%, var(--glass-brd));
  }
  .grid { fill: none; stroke: var(--glass-brd); stroke-width: 0.35; opacity: 0.9; }
  /* Полигоны невидимы. Прозрачная заливка для браузера всё же «закрашена», т.е.
     ловила бы касания и без обработчика — поэтому по умолчанию не ловим ничего. */
  .cell { fill: transparent; stroke: none; pointer-events: none; }
  .cell.tappable { pointer-events: all; cursor: pointer; outline: none; }
  .signnum {
    fill: var(--ink-faint); font-size: 3.6px; opacity: 0.8;
    text-anchor: middle; dominant-baseline: central;
  }
  /* подписи планет — обычный текстовый шрифт: кириллица в моноширинном
     запрещена правилами проекта (цифры градуса идут тем же шрифтом) */
  .planets { fill: var(--ink); text-anchor: middle; dominant-baseline: central; }
  .planets .deg { fill: var(--ink-dim); }
  /* ретроградная планета — золотом, как глиф в колесе (ui/Wheel.svelte) */
  .planets .retro { fill: var(--gold); }
  /* метка лагны южного стиля — та же кромка, что у рамки */
  .lagna {
    stroke-width: 0.5; stroke-linecap: round;
    stroke: color-mix(in srgb, var(--neon-violet) 40%, var(--glass-brd));
  }
</style>
