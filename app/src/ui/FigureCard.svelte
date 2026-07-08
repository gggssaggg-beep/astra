<script lang="ts">
  /**
   * Карточка «Фигуры дня» (раунд 29). Показывает фигуру: имя, глифы планет,
   * состав рёбер, окно сборки-распада (транзит) и — когда выбрана — декомпозицию
   * «состоит из» (под-фигуры от простого к сложному). Выделение = подсветка
   * ПОЛИГОНА в колесе (пропом figureSigs/figureStaticKeys у Wheel), карточка
   * лишь держит лёгкую кромку — правило «сам элемент, не рамка».
   */
  import type { FigureHit, FigureEdge } from '../engine/index.ts';
  import { PLANET_GLYPH } from '../engine/index.ts';
  import { fmtTime } from '../lib/format.ts';
  import { figureLore } from '../lib/figureLore.ts';
  import { reveal } from '../lib/reveal.ts';

  let { hit, window = undefined, tz, selected = false, onactivate }:
    { hit: FigureHit<FigureEdge & { symbol?: string }>;
      window?: { begin: Date | null; end: Date | null } | null;
      tz: string; selected?: boolean; onactivate?: () => void } = $props();

  const glyphs = (names: string[]) => names.map((n) => PLANET_GLYPH[n] ?? n).join(' ');
  // порядок символов рёбер: ☍ □ △ ⚹ ☌ (от напряжённых к мягким), с кратностью
  const ORDER = ['☍', '□', '△', '⚹', '☌'];
  const composition = $derived.by(() => {
    const cnt = new Map<string, number>();
    for (const e of hit.edges) { const s = e.symbol ?? ''; if (s) cnt.set(s, (cnt.get(s) ?? 0) + 1); }
    return [...cnt.entries()].sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]))
      .map(([s, n]) => `${n}${s}`).join('  ');
  });
  // окно: undefined — статичная карта (натал), окна нет; null — рёбра за сутки
  // есть, но одновременно не стоят; иначе — держится [вход → выход]
  const windowLabel = $derived.by(() => {
    if (window === undefined) return null;
    if (window === null) return 'рёбра не совпадают по времени';
    const b = window.begin ? fmtTime(window.begin, tz) : '…';
    const e = window.end ? fmtTime(window.end, tz) : '…';
    return `держится ${b} → ${e}`;
  });
  const lore = $derived(figureLore(hit.spec.id));
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="fig glass reveal" class:clickable={!!onactivate} class:selected
  role={onactivate ? 'button' : undefined} tabindex={onactivate ? 0 : undefined}
  onclick={() => onactivate?.()} use:reveal
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onactivate?.()}>
  <div class="row top">
    <span class="name">{hit.spec.name}</span>
    <span class="comp glyph">{composition}</span>
  </div>
  <div class="planets glyph">{glyphs(hit.planets)}</div>
  {#if windowLabel}<div class="win">{windowLabel}</div>{/if}

  {#if selected}
    {#if hit.parts.length}
      <div class="parts">
        <div class="phdr">Состоит из:</div>
        {#each hit.parts as p (p.key)}
          <div class="part">
            <span class="pn">{p.spec.name}</span>
            <span class="pg glyph">{glyphs(p.planets)}</span>
          </div>
        {/each}
      </div>
    {/if}
    {#if lore}
      <div class="lore">
        <div class="li">{lore.image}</div>
        <div class="lp">{lore.practice}</div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .fig { padding: 12px 14px; margin: 8px 0; border-left: 3px solid var(--neon-violet); width: 100%; text-align: left; }
  .fig.clickable { cursor: pointer; }
  .fig.clickable:hover { background: color-mix(in srgb, var(--glass) 80%, #fff 8%); }
  .fig.selected { border-color: color-mix(in srgb, var(--neon-cyan) 55%, var(--glass-brd));
    background: color-mix(in srgb, var(--glass) 88%, var(--neon-cyan) 7%); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .name { font-size: 0.98rem; color: var(--ink); font-weight: 500; }
  .comp { font-size: 0.9rem; color: var(--ink-dim); letter-spacing: 1px; white-space: nowrap; }
  .planets { margin-top: 6px; font-size: 1.35rem; letter-spacing: 3px; color: var(--silver); }
  .win { margin-top: 4px; color: var(--ink-faint); font-size: 0.78rem;
    font-variant-numeric: tabular-nums; font-family: var(--font-mono); }
  .parts { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--glass-brd); }
  .phdr { color: var(--ink-faint); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .part { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 3px 0; }
  .part .pn { color: var(--ink-dim); font-size: 0.85rem; }
  .part .pg { font-size: 1.05rem; letter-spacing: 2px; color: var(--silver); }
  .lore { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--glass-brd); }
  .lore .li { color: var(--ink-dim); font-size: 0.82rem; font-style: italic; }
  .lore .lp { color: var(--ink-faint); font-size: 0.84rem; margin-top: 5px; line-height: 1.5; }
</style>
