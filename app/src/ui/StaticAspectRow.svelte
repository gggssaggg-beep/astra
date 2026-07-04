<script lang="ts">
  /**
   * Лёгкая строка статичного аспекта (синастрия/натал) — НЕ транзитный AspectCard:
   * у статичного аспекта нет времени/окна/applying, только пара, символ и орбис.
   * Тап по строке ↔ выделение линии в колесе (selected). Никаких рамок-прямоугольников
   * (правило владелицы) — только тонкая левая кромка цветом тона и подсветка фона.
   */
  import type { StaticAspect } from '../engine/index.ts';
  import { PLANET_GLYPH } from '../engine/index.ts';
  import { aspectTone } from '../lib/format.ts';

  let { a, ownerA = null, ownerB = null, selected, ontap }:
    { a: StaticAspect; ownerA?: string | null; ownerB?: string | null;
      selected: boolean; ontap: () => void } = $props();

  const tone = $derived(aspectTone(a.aspect));
  const g1 = $derived(PLANET_GLYPH[a.p1] ?? a.p1);
  const g2 = $derived(PLANET_GLYPH[a.p2] ?? a.p2);
  // подпись «Солнце (Аня)» в синастрии (владелец задан) или просто «Солнце» иначе
  const n1 = $derived(ownerA ? `${a.p1} (${ownerA})` : a.p1);
  const n2 = $derived(ownerB ? `${a.p2} (${ownerB})` : a.p2);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="srow tone-{tone}" class:selected role="button" tabindex="0" onclick={ontap}
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), ontap())}>
  <span class="pair glyph">{g1}<span class="asp glyph">{a.symbol}</span>{g2}</span>
  <span class="names">{n1} {a.symbol} {n2}</span>
  <span class="orb">{a.orb.toFixed(2)}°</span>
</div>

<style>
  .srow { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    padding: 8px 12px; margin: 6px 0; border-radius: 12px; cursor: pointer;
    border-left: 3px solid var(--silver); background: #ffffff08; }
  .srow:hover { background: #ffffff12; }
  /* выделено — усиление фона + кромка ярче тоном (без рамки вокруг текста) */
  .srow.selected { background: color-mix(in srgb, var(--glass) 82%, var(--neon-cyan) 8%); }
  .tone-harm { border-left-color: var(--gold); }
  .tone-tense { border-left-color: var(--rose); }
  .tone-neutral { border-left-color: var(--silver); }
  .pair { font-size: 1.15rem; letter-spacing: 1px; flex: none; }
  .asp { margin: 0 3px; opacity: 0.9; }
  .tone-harm .asp { color: var(--gold); }
  .tone-tense .asp { color: var(--rose); }
  .tone-neutral .asp { color: var(--silver); }
  .names { flex: 1; min-width: 0; color: var(--ink-dim); font-size: 0.84rem;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .orb { flex: none; font-variant-numeric: tabular-nums; font-family: var(--font-mono);
    font-weight: 600; color: var(--silver); font-size: 0.86rem; }
</style>
