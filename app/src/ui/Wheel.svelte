<script lang="ts">
  /**
   * «Фото неба» (§3.8) — транзитное колесо БЕЗ домов: круг зодиака, планеты на
   * своих градусах, линии аспектов. Чистый SVG (без генерации картинок, §8),
   * на уже посчитанных движком данных. Готовая либа (@astrodraw/astrochart) не
   * подошла: её radix всегда рисует дома/куспиды, а нужно без них.
   *
   * Ориентация: 0° Овна слева (9 часов). Если зеркально — поменять знак в ang().
   */
  import type { BodyPosition, AspectRecord } from '../engine/index.ts';
  import type { SignStyle } from '../lib/models.ts';
  import type { WheelInfo } from '../lib/lore.ts';
  import { aspectTone } from '../lib/format.ts';
  import { SIGN_PATHS } from './signIcons.ts';

  let { positions, aspects, signStyle = 'gold', oninfo }:
    { positions: BodyPosition[]; aspects: AspectRecord[]; signStyle?: SignStyle;
      oninfo?: (info: WheelInfo) => void } = $props();

  // цвета стихий: огонь, земля, воздух, вода (по индексу знака % 4)
  const ELEM = ['#ff8a5b', '#7fd99a', '#7fd0ff', '#b39bff'];
  const signStroke = (i: number): string => {
    switch (signStyle) {
      case 'silver': return 'var(--silver)';
      case 'gold': return 'var(--gold)';
      case 'element': return ELEM[i % 4];
      case 'shimmer': return 'url(#sgShimmer)';
      case 'rainbow': return 'url(#sgRainbow)';
    }
  };
  const glow = $derived(signStyle === 'gold' || signStyle === 'shimmer' || signStyle === 'rainbow');

  const SZ = 320, cx = SZ / 2, cy = SZ / 2;
  const rOuter = 152, rZodiac = 124, rTick = 124, rPlanet = 104, rAspect = 92;

  const ang = (lon: number) => ((180 - lon) * Math.PI) / 180;
  const pt = (lon: number, r: number) => ({ x: cx + r * Math.cos(ang(lon)), y: cy + r * Math.sin(ang(lon)) });

  // лёгкий разнос налегающих планет по радиусу
  const placed = $derived.by(() => {
    const sorted = [...positions].sort((a, b) => a.lon - b.lon);
    const out: { p: BodyPosition; r: number }[] = [];
    let prevLon = -999, level = 0;
    for (const p of sorted) {
      if (p.lon - prevLon < 8) { level = (level + 1) % 3; } else { level = 0; }
      out.push({ p, r: rPlanet - level * 16 });
      prevLon = p.lon;
    }
    return out;
  });

  const lonByName = $derived(new Map(positions.map((p) => [p.name, p.lon])));

  const toneColor = (asp: string) =>
    aspectTone(asp) === 'harm' ? 'var(--gold)' : aspectTone(asp) === 'tense' ? 'var(--rose)' : 'var(--silver)';

  // линии аспектов между точками планет на внутреннем кольце
  const lines = $derived(
    aspects
      .map((a) => {
        const l1 = lonByName.get(a.p1), l2 = lonByName.get(a.p2);
        if (l1 == null || l2 == null) return null;
        const A = pt(l1, rAspect), B = pt(l2, rAspect);
        return { x1: A.x, y1: A.y, x2: B.x, y2: B.y, color: toneColor(a.aspect), dim: !a.applying,
          aspect: a.aspect, p1: a.p1, p2: a.p2, symbol: a.symbol };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  );

  // 12 секторов знаков (символ — SVG из Tabler, по центру сектора)
  const ICON = 19;
  const signs = Array.from({ length: 12 }, (_, i) => {
    const mid = pt(i * 30 + 15, (rZodiac + rOuter) / 2);
    const edge = pt(i * 30, rOuter);
    const inner = pt(i * 30, rZodiac);
    return { i, gx: mid.x, gy: mid.y, ex: edge.x, ey: edge.y, ix: inner.x, iy: inner.y };
  });
</script>

<svg viewBox="0 0 {SZ} {SZ}" class="wheel" role="img" aria-label="Колесо транзитов">
  <defs>
    <linearGradient id="sgShimmer" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" style="stop-color:#f3c969" />
      <stop offset="50%" style="stop-color:#cdd6ff" />
      <stop offset="100%" style="stop-color:#9b8cff" />
      <animateTransform attributeName="gradientTransform" type="translate"
        values="-1 0;1 0;-1 0" dur="5s" repeatCount="indefinite" />
    </linearGradient>
    <linearGradient id="sgRainbow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" style="stop-color:#ff6b6b" />
      <stop offset="25%" style="stop-color:#f3c969" />
      <stop offset="50%" style="stop-color:#7fd99a" />
      <stop offset="75%" style="stop-color:#7fd0ff" />
      <stop offset="100%" style="stop-color:#b39bff" />
      <animateTransform attributeName="gradientTransform" type="rotate"
        values="0 0.5 0.5;360 0.5 0.5" dur="14s" repeatCount="indefinite" />
    </linearGradient>
    <filter id="sgGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="1" result="b" />
      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>

  <circle {cx} {cy} r={rOuter} class="ring" />
  <circle {cx} {cy} r={rZodiac} class="ring zodiac" />
  <circle {cx} {cy} r={rAspect} class="ring faint" />

  {#each signs as s}
    <line x1={s.ix} y1={s.iy} x2={s.ex} y2={s.ey} class="spoke" />
    <svg class="signicon" class:glow x={s.gx - ICON / 2} y={s.gy - ICON / 2} width={ICON} height={ICON}
      viewBox="0 0 24 24" fill="none" style="stroke:{signStroke(s.i)}" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round">
      {#each SIGN_PATHS[s.i] as d}<path {d} />{/each}
    </svg>
  {/each}

  {#each lines as l}
    <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color}
      stroke-width="1.2" opacity={l.dim ? 0.35 : 0.8}
      style="filter: drop-shadow(0 0 {l.dim ? 2 : 3}px {l.color}) drop-shadow(0 0 {l.dim ? 4 : 7}px {l.color})" />
    {#if oninfo}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <line class="hit" x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
        onclick={() => oninfo({ kind: 'aspect', aspect: l.aspect, p1: l.p1, p2: l.p2, symbol: l.symbol })}
        role="button" tabindex="-1" aria-label="{l.p1} {l.aspect} {l.p2}" />
    {/if}
  {/each}

  {#each placed as { p, r }}
    {@const pos = pt(p.lon, r)}
    {@const tick = pt(p.lon, rZodiac)}
    <line x1={tick.x} y1={tick.y} x2={pos.x} y2={pos.y} class="plink" />
    <text x={pos.x} y={pos.y} class="planet glyph" class:retro={p.retro}>{p.glyph}</text>
    {#if oninfo}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <circle class="hit" cx={pos.x} cy={pos.y} r="14"
        onclick={() => oninfo({ kind: 'planet', name: p.name })}
        role="button" tabindex="-1" aria-label={p.name} />
    {/if}
  {/each}
</svg>

<style>
  .wheel { width: 100%; max-width: 360px; display: block; margin: 0 auto; }
  .ring { fill: none; stroke: var(--glass-brd); stroke-width: 1; }
  .ring.faint { stroke: color-mix(in srgb, var(--glass-brd) 50%, transparent); }
  .ring.zodiac {
    stroke: color-mix(in srgb, var(--neon-violet) 45%, var(--glass-brd));
    filter: drop-shadow(0 0 3px color-mix(in srgb, var(--neon-violet) 55%, transparent));
  }
  .spoke { stroke: var(--glass-brd); stroke-width: 0.6; opacity: 0.5; }
  .signicon { opacity: 0.95; overflow: visible; }
  .signicon.glow { filter: url(#sgGlow); }
  .plink { stroke: var(--glass-brd); stroke-width: 0.5; opacity: 0.5; }
  .planet {
    fill: var(--ink); font-size: 15px; text-anchor: middle; dominant-baseline: central;
    filter: drop-shadow(0 0 3px color-mix(in srgb, var(--neon-cyan) 35%, transparent));
  }
  .planet.retro {
    fill: var(--gold);
    filter: drop-shadow(0 0 3px color-mix(in srgb, var(--gold) 55%, transparent));
  }
  /* прозрачные тыкаемые зоны (обучалка): широкий невидимый штрих/круг поверх */
  .hit { fill: transparent; stroke: transparent; stroke-width: 14; pointer-events: all; cursor: pointer; }
</style>
