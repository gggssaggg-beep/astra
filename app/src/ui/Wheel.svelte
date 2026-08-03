<script lang="ts" module>
  // счётчик экземпляров: SVG-id должны быть уникальны на страницу — колесо дня
  // и колесо совмещённых карт живут в DOM одновременно (иначе градиенты знаков
  // одного колеса тихо подменяются градиентами другого)
  let wheelUid = 0;
</script>

<script lang="ts">
  /**
   * «Фото неба» (§3.8) — транзитное колесо БЕЗ домов: круг зодиака, планеты на
   * своих градусах, линии аспектов. Чистый SVG (без генерации картинок, §8),
   * на уже посчитанных движком данных. Готовая либа (@astrodraw/astrochart) не
   * подошла: её radix всегда рисует дома/куспиды, а нужно без них.
   *
   * Ориентация: 0° Овна слева (9 часов). Если зеркально — поменять знак в ang().
   */
  import type { BodyPosition, AspectRecord, StaticAspect } from '../engine/index.ts';
  import { staticKey } from '../engine/index.ts';
  import type { SignStyle } from '../lib/models.ts';
  import type { WheelInfo } from '../lib/lore.ts';
  import { aspectTone } from '../lib/format.ts';
  import { aspectSignature } from '../lib/signature.ts';
  import { SIGN_PATHS } from './signIcons.ts';

  // Транзитный режим (день) — как раньше: positions + aspects. Совмещённые карты:
  //   двойное кольцо  — positionsOuter (карта B / транзит) + staticAspects;
  //   тройное кольцо  — + positionsOuter2 (самое внешнее) + staticAspects2
  //     (межаспекты СРЕДНЕГО кольца с внешним). Транзитные линии тогда не рисуем.
  let { positions, aspects = [], positionsOuter = null, positionsOuter2 = null,
        staticAspects = null, staticAspects2 = null, houses = null,
        signStyle = 'gold', selectedSignature = null, selectedInfo = null,
        selectedStaticKey = null, figureSigs = null, figureStaticKeys = null,
        oninfo, onstatictap, onscrub }:
    { positions: BodyPosition[]; aspects?: AspectRecord[];
      positionsOuter?: BodyPosition[] | null; positionsOuter2?: BodyPosition[] | null;
      staticAspects?: StaticAspect[] | null; staticAspects2?: StaticAspect[] | null;
      houses?: { cusps: number[]; asc: number; mc: number } | null;
      signStyle?: SignStyle; selectedSignature?: string | null; selectedInfo?: WheelInfo | null;
      selectedStaticKey?: string | null;
      // Полигон фигуры: подсветить СРАЗУ набор рёбер (сигнатуры аспектов для
      // транзитного колеса / staticKey для совмещённых карт). Правило «сам
      // элемент, не рамка» — светятся линии, как у одиночного выбора.
      figureSigs?: string[] | null; figureStaticKeys?: string[] | null;
      oninfo?: (info: WheelInfo) => void; onstatictap?: (key: string) => void;
      onscrub?: (deltaMs: number) => void } = $props();

  const figSet = $derived(new Set(figureSigs ?? []));
  const figKeySet = $derived(new Set(figureStaticKeys ?? []));

  // Прокрутка времени ПРЯМО в колесе (транзитные карты): тянешь по кругу — момент
  // транзита едет, полный оборот = сутки (суточное вращение неба). Малое смещение
  // считается тапом, поэтому касания планет/знаков/линий сохраняются.
  let svgEl: SVGSVGElement;
  let scrubbing = false, lastAng = 0;
  let dragged = $state(false);
  const angAt = (e: PointerEvent): number => {
    const b = svgEl.getBoundingClientRect();
    return Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2)) * 180 / Math.PI;
  };
  function scrubDown(e: PointerEvent): void {
    if (!onscrub) return;
    scrubbing = true; dragged = false; lastAng = angAt(e);
    svgEl.setPointerCapture?.(e.pointerId);
  }
  function scrubMove(e: PointerEvent): void {
    if (!onscrub || !scrubbing) return;
    const a = angAt(e);
    let d = a - lastAng;
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    if (Math.abs(d) < 0.01) return;
    lastAng = a;
    if (Math.abs(d) > 1.2) dragged = true;   // заметный поворот → прокрутка, не тап
    onscrub?.((d / 360) * 86_400_000);
  }
  function scrubUp(): void { scrubbing = false; }
  // касание засчитываем только если НЕ было прокрутки (иначе тап после драга ложный)
  const tapGuard = (fn: () => void) => () => { if (dragged) { dragged = false; return; } fn(); };

  // выделение тапнутого элемента = подсветка САМОГО элемента (глиф планеты /
  // символ знака / линия аспекта). НИКОГДА не рамка (жёсткое правило владелицы).
  const selSignIdx = $derived(selectedInfo?.kind === 'sign' ? selectedInfo.index : -1);
  const selPlanet = $derived(selectedInfo?.kind === 'planet' ? selectedInfo.name : null);
  // ОДИН источник выделения линии — `selectedSignature`; ровно так же, как в
  // «Картах» линия светится по `selectedStaticKey`. Раньше источников было ДВА
  // (ещё и `selectedInfo` от тапа по линии), и второй ПРОИГРЫВАЛ первому: пока
  // жила «липкая» подсветка выбранной карточки, тапнутая линия не загоралась
  // вовсе — светилась чужая. Тап по линии теперь сам ставит `selectedSignature`
  // (App), поэтому колесо всегда честно к последнему выбору.
  const effSig = $derived(selectedSignature);

  const uid = ++wheelUid;
  // цвета стихий: огонь, земля, воздух, вода (по индексу знака % 4)
  const ELEM = ['#ff8a5b', '#7fd99a', '#7fd0ff', '#b39bff'];
  const signStroke = (i: number): string => {
    switch (signStyle) {
      case 'silver': return 'var(--silver)';
      case 'gold': return 'var(--gold)';
      case 'element': return ELEM[i % 4];
      case 'shimmer': return `url(#sgShimmer-${uid})`;
      case 'rainbow': return `url(#sgRainbow-${uid})`;
      default: return 'var(--silver)'; // 'auto' сюда не доходит (App резолвит), но тип — string
    }
  };

  const SZ = 320, cx = SZ / 2, cy = SZ / 2;
  const rOuter = 152, rZodiac = 124, rTick = 124, rPlanet = 104, rAspect = 92;

  const ang = (lon: number) => ((180 - lon) * Math.PI) / 180;
  const pt = (lon: number, r: number) => ({ x: cx + r * Math.cos(ang(lon)), y: cy + r * Math.sin(ang(lon)) });

  // двойное кольцо (синастрия/транзит+натал) / тройное (транзит+натал+натал)
  const double = $derived(!!positionsOuter);
  const triple = $derived(!!positionsOuter2);

  // Разнос налегающих планет по радиусу — общий алгоритм для всех колец.
  // (1) Обход начинается с самого большого углового разрыва — стеллиум на стыке
  //     0° Овна (359° и 1°) больше не рвётся и не слипается.
  // (2) Уровень выбирается ГРИДИ по последней долготе на каждом радиусе (раньше
  //     цикл %3 в стеллиуме >3 планет возвращал 4-ю на радиус 1-й — налегали).
  // (3) Число уровней `levels` — параметр: тесный стеллиум из 4–5 планет требует
  //     больше радиусов, иначе лишние глифы слипаются на самом глубоком уровне.
  const placeRing = (poss: BodyPosition[], baseR: number, step: number, levels = 3): { p: BodyPosition; r: number }[] => {
    if (!poss.length) return [];
    const sorted = [...poss].sort((a, b) => a.lon - b.lon);
    let cut = 0, best = -1;
    for (let i = 0; i < sorted.length; i++) {
      const next = (i + 1) % sorted.length;
      const gap = sorted[next].lon - sorted[i].lon + (next === 0 ? 360 : 0);
      if (gap > best) { best = gap; cut = next; }
    }
    const ring = cut ? [...sorted.slice(cut), ...sorted.slice(0, cut)] : sorted;
    const lastAt: number[] = new Array(levels).fill(-999);   // последняя «расправленная» долгота на уровне
    const out: { p: BodyPosition; r: number }[] = [];
    let prev = -Infinity, offset = 0;
    for (const p of ring) {
      let lon = p.lon + offset;
      if (lon < prev) { offset += 360; lon += 360; }   // монотонная развёртка через 0°
      prev = lon;
      let lv = 0;
      while (lv < lastAt.length && lon - lastAt[lv] < 8) lv++;
      if (lv >= lastAt.length) lv = lastAt.length - 1; // плотнее некуда — глубже не лезем
      lastAt[lv] = lon;
      out.push({ p, r: baseR - lv * step });
    }
    return out;
  };

  // радиусы колец: одиночное 104; двойное 72/106; тройное 58/84/110 (шаг тесней)
  const rInner = $derived(triple ? 58 : double ? 72 : rPlanet);
  const rMid = $derived(triple ? 84 : 106);
  const rOut2 = 110;
  // одиночное (день) кольцо просторнее → до 5 уровней разноса: плотный стеллиум
  // 4–5 планет в пределах ~8° не слипается. В двойном/тройном места меньше → 3.
  const placedInner = $derived(placeRing(positions, rInner, triple ? 11 : double ? 12 : 16, triple || double ? 3 : 5));
  const placedMid = $derived(positionsOuter ? placeRing(positionsOuter, rMid, 11) : []);
  const placedOut2 = $derived(triple && positionsOuter2 ? placeRing(positionsOuter2, rOut2, 11) : []);
  // ключ = кольцо+имя: при скрабе транзита натальные глифы не перерисовываются
  const allPlaced = $derived([
    ...placedInner.map((x) => ({ ...x, k: 'i' + x.p.name })),
    ...placedMid.map((x) => ({ ...x, k: 'm' + x.p.name })),
    ...placedOut2.map((x) => ({ ...x, k: 'o' + x.p.name })),
  ]);

  // якорь линий аспектов ближе к центру, чем больше колец
  const rAspectUse = $derived(triple ? 46 : double ? 56 : rAspect);

  const lonByName = $derived(new Map(positions.map((p) => [p.name, p.lon])));
  const lonMid = $derived(new Map((positionsOuter ?? []).map((p) => [p.name, p.lon])));
  // самое внешнее кольцо (карта B / транзит); в одиночном статичном — те же positions
  const lonOut = $derived(new Map(
    (positionsOuter2 ?? positionsOuter ?? positions).map((p) => [p.name, p.lon])));

  const toneColor = (asp: string) =>
    aspectTone(asp) === 'harm' ? 'var(--gold)' : aspectTone(asp) === 'tense' ? 'var(--rose)' : 'var(--silver)';

  // линии аспектов между точками планет на внутреннем кольце
  const lines = $derived(
    aspects
      .map((a) => {
        const l1 = lonByName.get(a.p1), l2 = lonByName.get(a.p2);
        if (l1 == null || l2 == null) return null;
        const A = pt(l1, rAspect), B = pt(l2, rAspect);
        const sig = aspectSignature(a.p1, a.p2, a.aspect);
        return { x1: A.x, y1: A.y, x2: B.x, y2: B.y, color: toneColor(a.aspect),
          aspect: a.aspect, p1: a.p1, p2: a.p2, symbol: a.symbol,
          sel: (!!effSig && sig === effSig) || figSet.has(sig) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  );

  // Подсветка активна, только если выделенное РЕАЛЬНО ЕСТЬ на колесе. Раньше
  // считали по самому факту выделения (`!!effSig`) — и если сигнатура не
  // совпадала ни с одной линией (пролистнули на другой день, тап по сводке-
  // уведомлению с аспектом другого дня), колесо гасило ВСЕ линии, а подсвечивать
  // было нечего: «все линии тусклые» (жалоба владелицы 2026-07-25).
  const anySel = $derived(lines.some((l) => l.sel));

  // статичные линии: p1/p2 берём из указанных колец; без applying/времени —
  // только выделение по ключу. Набор 1 — внутреннее↔внешнее; набор 2 (тройная) —
  // среднее↔внешнее.
  const buildStatic = (
    list: StaticAspect[] | null,
    m1: Map<string, number>, m2: Map<string, number>, ring: string,
  ) => (list ?? [])
    .map((a) => {
      const l1 = m1.get(a.p1), l2 = m2.get(a.p2);
      if (l1 == null || l2 == null) return null;
      const A = pt(l1, rAspectUse), B = pt(l2, rAspectUse);
      const key = staticKey(a);
      // kk — ключ рендера (в тройной карте один и тот же key может быть у линий
      // разных колец: «Солнце △ Луна» к наталу А и к наталу Б)
      return { x1: A.x, y1: A.y, x2: B.x, y2: B.y, color: toneColor(a.aspect),
        key, kk: ring + key, sel: key === selectedStaticKey || figKeySet.has(key) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const slines = $derived(buildStatic(staticAspects, lonByName, lonOut, '1'));
  const slines2 = $derived(triple ? buildStatic(staticAspects2, lonMid, lonOut, '2') : []);
  // как и anySel: гасим остальные линии, только если выделенное есть на колесе
  const anySelStatic = $derived(slines.some((l) => l.sel) || slines2.some((l) => l.sel));

  // дома: 12 куспидов-спиц + номера в середине сектора + метки Asc/MC
  const houseGeo = $derived.by(() => {
    if (!houses) return null;
    const cl = houses.cusps;
    const lines = cl.map((lon, i) => {
      const a = pt(lon, 26), b = pt(lon, rZodiac);
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, axis: i === 0 || i === 9 };
    });
    const nums = cl.map((lon, i) => {
      const span = ((cl[(i + 1) % 12] - lon) % 360 + 360) % 360;
      const p = pt(lon + span / 2, 33);
      return { x: p.x, y: p.y, n: i + 1 };
    });
    const asc = pt(houses.asc, rZodiac - 7), mc = pt(houses.mc, rZodiac - 7);
    return { lines, nums, asc, mc };
  });

  // 12 секторов знаков (символ — SVG из Tabler, по центру сектора)
  const ICON = 19;
  const signs = Array.from({ length: 12 }, (_, i) => {
    const mid = pt(i * 30 + 15, (rZodiac + rOuter) / 2);
    const edge = pt(i * 30, rOuter);
    const inner = pt(i * 30, rZodiac);
    return { i, gx: mid.x, gy: mid.y, ex: edge.x, ey: edge.y, ix: inner.x, iy: inner.y };
  });
</script>

<!-- touch-события скраба НЕ всплывают к шторке: иначе круговое движение по
     колесу дёргало жест «свайп-вниз = закрыть» — шторка прыгала и закрывалась -->
<svg bind:this={svgEl} viewBox="0 0 {SZ} {SZ}" class="wheel" class:scrub={!!onscrub}
  role="img" aria-label="Колесо транзитов"
  onpointerdown={scrubDown} onpointermove={scrubMove}
  onpointerup={scrubUp} onpointercancel={scrubUp}
  ontouchstart={(e) => onscrub && e.stopPropagation()}
  ontouchmove={(e) => onscrub && e.stopPropagation()}>
  <defs>
    <!-- градиенты (и их SMIL-анимации) рендерим только для активного стиля:
         вне его они впустую крутились и жгли батарею -->
    {#if signStyle === 'shimmer'}
      <linearGradient id="sgShimmer-{uid}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" style="stop-color:#f3c969" />
        <stop offset="50%" style="stop-color:#cdd6ff" />
        <stop offset="100%" style="stop-color:#9b8cff" />
        <animateTransform attributeName="gradientTransform" type="translate"
          values="-1 0;1 0;-1 0" dur="5s" repeatCount="indefinite" />
      </linearGradient>
    {/if}
    {#if signStyle === 'rainbow'}
      <linearGradient id="sgRainbow-{uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" style="stop-color:#ff6b6b" />
        <stop offset="25%" style="stop-color:#f3c969" />
        <stop offset="50%" style="stop-color:#7fd99a" />
        <stop offset="75%" style="stop-color:#7fd0ff" />
        <stop offset="100%" style="stop-color:#b39bff" />
        <animateTransform attributeName="gradientTransform" type="rotate"
          values="0 0.5 0.5;360 0.5 0.5" dur="14s" repeatCount="indefinite" />
      </linearGradient>
    {/if}
  </defs>

  <circle {cx} {cy} r={rOuter} class="ring" />
  <circle {cx} {cy} r={rZodiac} class="ring zodiac" />
  {#if triple}
    <!-- разделители между тремя кольцами -->
    <circle {cx} {cy} r={71} class="ring faint" />
    <circle {cx} {cy} r={97} class="ring faint" />
  {:else if double}
    <!-- тонкий разделитель между кольцами карт A и B -->
    <circle {cx} {cy} r={88} class="ring faint" />
  {:else}
    <circle {cx} {cy} r={rAspect} class="ring faint" />
  {/if}

  {#if houseGeo}
    {#each houseGeo.lines as h}
      <line x1={h.x1} y1={h.y1} x2={h.x2} y2={h.y2} class="cusp" class:axis={h.axis} />
    {/each}
    {#each houseGeo.nums as hn}
      <text x={hn.x} y={hn.y} class="hnum">{hn.n}</text>
    {/each}
    <text x={houseGeo.asc.x} y={houseGeo.asc.y} class="axislbl">Asc</text>
    <text x={houseGeo.mc.x} y={houseGeo.mc.y} class="axislbl">MC</text>
  {/if}

  {#each signs as s}
    <line x1={s.ix} y1={s.iy} x2={s.ex} y2={s.ey} class="spoke" />
    <!-- выбранный тапом знак подсвечивается САМИМ символом (циан + глоу),
         никакой прямоугольной рамки (жёсткое правило владелицы).
         Глоу-фильтр ТОЛЬКО у выбранного знака: 12 параллельных blur-проходов
         на каждый рендер перегружали GPU слабых WebView -->
    <svg class="signicon" class:sel={s.i === selSignIdx}
      x={s.gx - ICON / 2} y={s.gy - ICON / 2} width={ICON} height={ICON}
      viewBox="0 0 24 24" fill="none"
      style="stroke:{s.i === selSignIdx ? 'var(--neon-cyan)' : signStroke(s.i)}"
      stroke-width={s.i === selSignIdx ? 2.6 : 2}
      stroke-linecap="round" stroke-linejoin="round">
      {#each SIGN_PATHS[s.i] as d}<path {d} />{/each}
    </svg>
    {#if oninfo}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <circle class="hit" cx={s.gx} cy={s.gy} r="15"
        onclick={tapGuard(() => oninfo({ kind: 'sign', index: s.i }))} />
    {/if}
  {/each}

  {#if staticAspects}
    <!-- статичный режим (совмещённые карты): транзитные линии не рисуем -->
    {#each [...slines, ...slines2] as l (l.kk)}
      <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color}
        stroke-width={l.sel ? 2.8 : 1.2}
        opacity={l.sel ? 1 : anySelStatic ? 0.18 : 0.8}
        class:selline={l.sel}
        style={l.sel ? `filter: drop-shadow(0 0 6px ${l.color})` : ''} />
      {#if onstatictap}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <line class="hit" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          onclick={tapGuard(() => onstatictap(l.key))} />
      {/if}
    {/each}
  {:else}
    {#each lines as l (l.p1 + '|' + l.p2 + '|' + l.aspect)}
      <!-- выбранный аспект подсвечивается САМОЙ линией: толще, ярче, с глоу;
           остальные притухают. Глоу-фильтр ТОЛЬКО у выбранной линии: пачка
           drop-shadow на каждой линии перегружала GPU слабых WebView («тупит»).
           Яркость невыбранных — ровно как в «Картах»: 0.8 у ВСЕХ. Раньше
           расходящиеся аспекты (applying=false) гасились до 0.35 — половина
           линий выглядела приглушённой, будто что-то уже выделено. Сходится
           аспект или расходится, видно по стрелке в карточке. -->
      <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color}
        stroke-width={l.sel ? 2.8 : 1.2}
        opacity={l.sel ? 1 : anySel ? 0.18 : 0.8}
        class:selline={l.sel}
        style={l.sel ? `filter: drop-shadow(0 0 6px ${l.color})` : ''} />
      {#if oninfo}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <!-- хит-зоны БЕЗ role/tabindex: фокусируемые элементы рисовали системную
             фокус-рамку (скруглённый прямоугольник) на каждый тап -->
        <line class="hit" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          onclick={tapGuard(() => oninfo({ kind: 'aspect', aspect: l.aspect, p1: l.p1, p2: l.p2, symbol: l.symbol }))} />
      {/if}
    {/each}
  {/if}

  {#each allPlaced as { p, r, k } (k)}
    {@const pos = pt(p.lon, r)}
    {@const tick = pt(p.lon, rZodiac)}
    <line x1={tick.x} y1={tick.y} x2={pos.x} y2={pos.y} class="plink" />
    <!-- глиф планеты — ПРЕЖНИЙ символьный шрифт (владелица 2026-07-11: SVG-обвод
         «перерисовали плохо» — вернули как было); ретро — золотой + ℞ рядом -->
    <text x={pos.x} y={pos.y} class="planet glyph" class:retro={p.retro}
      class:sel={p.name === selPlanet}>{p.glyph}</text>
    {#if p.retro}<text x={pos.x + 9} y={pos.y - 8} class="rxmark">℞</text>{/if}
    {#if oninfo}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <circle class="hit" cx={pos.x} cy={pos.y} r="14"
        onclick={tapGuard(() => oninfo({ kind: 'planet', name: p.name }))} />
    {/if}
  {/each}
</svg>

<style>
  .wheel { width: 100%; max-width: 360px; display: block; margin: 0 auto; }
  /* прокрутка времени в колесе: вертикальный скролл экрана не перехватываем,
     но круговое перетаскивание крутит время (grab-курсор + touch-action) */
  .wheel.scrub { cursor: grab; touch-action: pan-y; }
  .wheel.scrub:active { cursor: grabbing; }
  .ring { fill: none; stroke: var(--glass-brd); stroke-width: 1; }
  .ring.faint { stroke: color-mix(in srgb, var(--glass-brd) 50%, transparent); }
  .ring.zodiac {
    stroke: color-mix(in srgb, var(--neon-violet) 45%, var(--glass-brd));
    filter: drop-shadow(0 0 3px color-mix(in srgb, var(--neon-violet) 55%, transparent));
  }
  .spoke { stroke: var(--glass-brd); stroke-width: 0.6; opacity: 0.5; }
  /* дома: тонкие спицы куспидов; оси Asc/MC ярче */
  .cusp { stroke: color-mix(in srgb, var(--neon-cyan) 35%, var(--glass-brd)); stroke-width: 0.7; opacity: 0.45; }
  .cusp.axis { stroke: var(--gold); stroke-width: 1.3; opacity: 0.85; stroke-dasharray: 3 2; }
  .hnum { fill: var(--ink-faint); font-size: 7px; text-anchor: middle; dominant-baseline: central; opacity: 0.7; }
  .axislbl { fill: var(--gold); font-size: 7.5px; font-weight: 600; text-anchor: middle; dominant-baseline: central; }
  .signicon { opacity: 0.95; overflow: visible; }
  .signicon.sel { opacity: 1; filter: drop-shadow(0 0 5px var(--neon-cyan)); }
  .plink { stroke: var(--glass-brd); stroke-width: 0.5; opacity: 0.5; }
  .planet {
    fill: var(--ink); font-size: 15px; text-anchor: middle; dominant-baseline: central;
  }
  .planet.retro { fill: var(--gold); }
  /* тапнутая планета светится САМА (не рамка) */
  .planet.sel { fill: var(--neon-cyan); filter: drop-shadow(0 0 5px var(--neon-cyan)); }
  /* явный значок ретроградности у глифа — «℞ не видно» (жалоба 2026-07-02) */
  .rxmark { fill: var(--gold); font-size: 8px; text-anchor: middle; font-weight: 600; }
  /* прозрачные тыкаемые зоны (обучалка): широкий невидимый штрих/круг поверх.
     outline: тап НЕ должен рисовать фокус-прямоугольник (правило владелицы) */
  .hit { fill: transparent; stroke: transparent; stroke-width: 14; pointer-events: all; cursor: pointer; outline: none; }
  /* выбранная линия мягко «дышит» — глаз сразу находит аспект на колесе */
  .selline { animation: line-breathe 2.2s ease-in-out infinite; }
  @keyframes line-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
</style>
