<script lang="ts">
  import type { AspectRecord } from '../engine/index.ts';
  import { PLANET_GLYPH } from '../engine/index.ts';
  import { fmtTime, applyingArrow, aspectTone, sameDay } from '../lib/format.ts';

  let { rec, tz, onpick }: { rec: AspectRecord; tz: string; onpick?: (r: AspectRecord) => void } = $props();
  const tone = $derived(aspectTone(rec.aspect));
  const t = (d: Date | null) => (d ? fmtTime(d, tz) : '—');
  // подпись «через полночь», если выход орбиса в другой день, чем точный
  const crosses = $derived(
    rec.exactTime && rec.endTime && !sameDay(rec.exactTime, rec.endTime, tz)
  );
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="card glass tone-{tone}" class:clickable={!!onpick} role={onpick ? 'button' : undefined}
  tabindex={onpick ? 0 : undefined} onclick={() => onpick?.(rec)}
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onpick?.(rec)}>
  <div class="row top">
    <span class="pair glyph">
      {PLANET_GLYPH[rec.p1] ?? rec.p1}<span class="asp glyph">{rec.symbol}</span>{PLANET_GLYPH[rec.p2] ?? rec.p2}
    </span>
    <span class="names">{rec.p1} {rec.aspect} {rec.p2}</span>
    <span class="orb" title="текущий орбис">{rec.exactOrb.toFixed(2)}°<span class="arr">{applyingArrow(rec.applying)}</span></span>
  </div>

  <div class="row times">
    <span class="seg"><b>{t(rec.beginTime)}</b><small>вход</small></span>
    <span class="dash">→</span>
    <span class="seg exact"><b>{t(rec.exactTime)}</b><small>точно</small></span>
    <span class="dash">→</span>
    <span class="seg"><b>{t(rec.endTime)}</b><small>выход{crosses ? ' ⤵' : ''}</small></span>
  </div>
</div>

<style>
  .card { padding: 12px 14px; margin: 8px 0; border-left: 3px solid var(--accent); width: 100%; text-align: left; }
  .card.clickable { cursor: pointer; }
  .card.clickable:hover { background: color-mix(in srgb, var(--glass) 80%, #fff 8%); }
  .tone-harm { border-left-color: var(--gold); }
  .tone-tense { border-left-color: var(--rose); }
  .tone-neutral { border-left-color: var(--silver); }
  .row { display: flex; align-items: center; gap: 10px; }
  .top { justify-content: space-between; }
  .pair { font-size: 1.5rem; letter-spacing: 2px; }
  .asp { margin: 0 4px; opacity: 0.85; }
  .names { flex: 1; color: var(--ink-dim); font-size: 0.86rem; }
  .orb { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--silver); }
  .arr { margin-left: 4px; opacity: 0.8; }
  .times { margin-top: 8px; justify-content: space-between; color: var(--ink-dim); }
  .seg { display: flex; flex-direction: column; align-items: center; line-height: 1.1; }
  .seg b { font-variant-numeric: tabular-nums; color: var(--ink); }
  .seg.exact b { color: var(--gold); }
  .seg small { font-size: 0.66rem; color: var(--ink-faint); }
  .dash { color: var(--ink-faint); }
</style>
