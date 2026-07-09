<script lang="ts">
  /**
   * Карточка фигуры в совмещённой карте (раунд 29, смешанный режим). Показывает
   * фигуру с пометкой кольца у каждой планеты (натал / транзит) и бейджем
   * «замкнута транзитом» — когда транзит достраивает натальную заготовку.
   * Выделение подсвечивает рисуемые рёбра полигона в колесе (правило «сам
   * элемент, не рамка»).
   */
  import type { ChartFigure } from '../lib/chartFigures.ts';
  import { figureLore } from '../lib/figureLore.ts';
  import { reveal } from '../lib/reveal.ts';

  let { fig, selected = false, onactivate }:
    { fig: ChartFigure; selected?: boolean; onactivate?: () => void } = $props();

  const RING_LABEL: Record<string, string> = { A: '', B: '₂', T: 'ᵗ' };
  const lore = $derived(figureLore(fig.id));
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="fig glass reveal" class:clickable={!!onactivate} class:selected class:wow={fig.closedByTransit}
  role={onactivate ? 'button' : undefined} tabindex={onactivate ? 0 : undefined}
  onclick={() => onactivate?.()} use:reveal
  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onactivate?.()}>
  <div class="row top">
    <span class="name">{fig.name}</span>
    {#if fig.closedByTransit}<span class="badge">⟳ замкнута транзитом</span>{/if}
    <span class="comp glyph">{fig.composition}</span>
  </div>
  <div class="planets">
    {#each fig.members as m}
      <span class="mem glyph" class:transit={m.ring === 'T'} title={m.name}>{m.glyph}<span class="rl">{RING_LABEL[m.ring]}</span></span>
    {/each}
  </div>

  {#if selected}
    {#if fig.parts.length}
      <div class="parts">
        <div class="phdr">Состоит из:</div>
        {#each fig.parts as p, i (p.name + i)}
          <div class="part">
            <span class="pn">{p.name}</span>
            <span class="pg">{#each p.members as m}<span class="glyph" class:transit={m.ring === 'T'}>{m.glyph}</span>{/each}</span>
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
  .fig { padding: 11px 13px; margin: 8px 0; border-left: 3px solid var(--neon-violet); width: 100%; text-align: left; }
  .fig.wow { border-left-color: var(--gold); }
  .fig.clickable { cursor: pointer; }
  .fig.clickable:hover { background: color-mix(in srgb, var(--glass) 80%, #fff 8%); }
  .fig.selected { border-color: color-mix(in srgb, var(--neon-cyan) 55%, var(--glass-brd));
    background: color-mix(in srgb, var(--glass) 88%, var(--neon-cyan) 7%); }
  .row { display: flex; align-items: center; gap: 8px; }
  .name { font-size: 0.95rem; color: var(--ink); font-weight: 500; }
  .badge { font-size: 0.66rem; color: var(--gold); border: 1px solid color-mix(in srgb, var(--gold) 45%, var(--glass-brd));
    border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
  .comp { margin-left: auto; font-size: 0.88rem; color: var(--ink-dim); letter-spacing: 1px; white-space: nowrap; }
  .planets { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 8px; }
  .mem { font-size: 1.25rem; color: var(--silver); }
  .mem.transit { color: var(--neon-cyan); }
  .rl { font-size: 0.7rem; vertical-align: super; opacity: 0.8; }
  .parts { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--glass-brd); }
  .phdr { color: var(--ink-faint); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .part { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 3px 0; }
  .part .pn { color: var(--ink-dim); font-size: 0.85rem; }
  .part .pg { font-size: 1.02rem; letter-spacing: 2px; color: var(--silver); }
  .part .pg .transit { color: var(--neon-cyan); }
  .lore { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--glass-brd); }
  .lore .li { color: var(--ink-dim); font-size: 0.82rem; font-style: italic; }
  .lore .lp { color: var(--ink-faint); font-size: 0.84rem; margin-top: 5px; line-height: 1.5; }
</style>
