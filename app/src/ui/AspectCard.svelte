<script lang="ts">
  import type { AspectRecord } from '../engine/index.ts';
  import { PLANET_GLYPH } from '../engine/index.ts';
  import { fmtTime, fmtDateShort, applyingArrow, aspectTone, sameDay } from '../lib/format.ts';
  import { reveal } from '../lib/reveal.ts';
  import { ASPECT_LORE } from '../lib/lore.ts';
  import { aspectSignature } from '../lib/signature.ts';
  import { db } from '../lib/db.ts';

  let { rec, tz, onpick, selected = false, discussions = 0 }:
    { rec: AspectRecord; tz: string; onpick?: (r: AspectRecord) => void; selected?: boolean;
      discussions?: number } = $props();
  const tone = $derived(aspectTone(rec.aspect));
  const t = (d: Date | null) => (d ? fmtTime(d, tz) : '—');
  // дата начала/конца — аспект может растянуться на несколько дней (требование астролога)
  const dd = (d: Date | null) => (d ? fmtDateShort(d, tz) : '');
  // подпись «через полночь», если выход орбиса в другой день, чем точный
  const crosses = $derived(
    rec.exactTime && rec.endTime && !sameDay(rec.exactTime, rec.endTime, tz)
  );
  // аспект «живой» прямо сейчас — дышащая точка (снимок на момент отрисовки)
  const live = $derived.by(() => {
    const now = Date.now();
    return !!rec.beginTime && !!rec.endTime
      && now >= rec.beginTime.getTime() && now <= rec.endTime.getTime();
  });
  // краткая трактовка: своя (из библиотеки, первая строка) либо общая по типу аспекта
  const shortLore = $derived.by(() => {
    const own = db.interpretations.get(aspectSignature(rec.p1, rec.p2, rec.aspect))?.text.trim();
    if (own) return own.split('\n')[0];
    return ASPECT_LORE[rec.aspect]?.short ?? '';
  });
</script>

<!-- Выбор подсвечивается ЛИНИЕЙ в колесе + лёгкой кромкой карточки; рамка-квадратик
     (GlowCard) убрана — «квадратик не красиво» (просьба владелицы, клод-дизайн). -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="card glass reveal tone-{tone}" class:clickable={!!onpick} class:selected
  role={onpick ? 'button' : undefined}
  tabindex={onpick ? 0 : undefined} onclick={() => onpick?.(rec)} use:reveal
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onpick?.(rec)}>
  <div class="row top">
    <span class="pair glyph">
      {PLANET_GLYPH[rec.p1] ?? rec.p1}<span class="asp glyph">{rec.symbol}</span>{PLANET_GLYPH[rec.p2] ?? rec.p2}
    </span>
    <span class="names">{rec.p1} {rec.aspect} {rec.p2}</span>
    {#if discussions}<span class="disc" title="в сообществе есть обсуждение">💬 {discussions}</span>{/if}
    {#if live}<span class="live tone-{tone}" title="сейчас в орбисе"></span>{/if}
    <span class="orb" title="текущий орбис">{rec.exactOrb.toFixed(2)}°<span class="arr">{applyingArrow(rec.applying)}</span></span>
  </div>

  {#if shortLore}<div class="lore">{shortLore}</div>{/if}

  <div class="row times">
    <span class="seg"><small class="d">{dd(rec.beginTime)}</small><b>{t(rec.beginTime)}</b><small>вход</small></span>
    <span class="dash">→</span>
    <span class="seg exact"><small class="d">{dd(rec.exactTime)}</small><b>{t(rec.exactTime)}</b><small>точно</small></span>
    <span class="dash">→</span>
    <span class="seg"><small class="d">{dd(rec.endTime)}</small><b>{t(rec.endTime)}</b><small>выход{crosses ? ' ⤵' : ''}</small></span>
  </div>
</div>

<style>
  .card { padding: 12px 14px; margin: 8px 0; border-left: 3px solid var(--accent); width: 100%; text-align: left; }
  .card.clickable { cursor: pointer; }
  .card.clickable:hover { background: color-mix(in srgb, var(--glass) 80%, #fff 8%); }
  .card.selected { border-color: color-mix(in srgb, var(--neon-cyan) 55%, var(--glass-brd));
    background: color-mix(in srgb, var(--glass) 88%, var(--neon-cyan) 7%); }
  .tone-harm { border-left-color: var(--gold); }
  .tone-tense { border-left-color: var(--rose); }
  .tone-neutral { border-left-color: var(--silver); }
  .row { display: flex; align-items: center; gap: 10px; }
  .top { justify-content: space-between; }
  .pair { font-size: 1.5rem; letter-spacing: 2px; }
  .asp { margin: 0 4px; opacity: 0.85; }
  .names { flex: 1; color: var(--ink-dim); font-size: 0.86rem; }
  .disc { font-size: 0.72rem; color: var(--accent); background: #ffffff12;
    border: 1px solid var(--glass-brd); border-radius: 999px; padding: 1px 8px; white-space: nowrap; }
  .orb { font-variant-numeric: tabular-nums; font-family: var(--font-mono); font-weight: 600; color: var(--silver); }
  .arr { margin-left: 4px; opacity: 0.8; }
  /* «сейчас в орбисе» — небо живое именно тут; лёгкий opacity-pulse, GPU не грузит */
  .live { width: 7px; height: 7px; border-radius: 50%; flex: none;
    background: var(--accent); animation: breathe 2.6s ease-in-out infinite; }
  .live.tone-harm { background: var(--gold); }
  .live.tone-tense { background: var(--rose); }
  .live.tone-neutral { background: var(--silver); }
  @keyframes breathe { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
  /* короткая трактовка (своя из библиотеки либо общая по типу аспекта) */
  .lore { margin-top: 6px; color: var(--ink-faint); font-size: 0.8rem;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .times { margin-top: 8px; justify-content: space-between; color: var(--ink-dim); }
  .seg { display: flex; flex-direction: column; align-items: center; line-height: 1.15; }
  .seg b { font-variant-numeric: tabular-nums; font-family: var(--font-mono); color: var(--ink); }
  .seg.exact b { color: var(--gold); }
  .seg small { font-size: 0.66rem; color: var(--ink-faint); }
  .seg .d { color: var(--ink-dim); font-variant-numeric: tabular-nums; font-family: var(--font-mono); }
  .dash { color: var(--ink-faint); }
</style>
