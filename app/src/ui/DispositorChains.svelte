<script lang="ts">
  /**
   * Цепочки диспозиторов (раунд 29 §2): каждая планета → управитель своего знака,
   * до «царя» (планеты в своём знаке) или кольца взаимной рецепции. Формула
   * детерминированная (lib/dispositors.ts); ИИ нужен только для трактовки.
   */
  import type { BodyPosition } from '../engine/index.ts';
  import { PLANET_GLYPH } from '../engine/index.ts';
  import { chartDispositors } from '../lib/dispositors.ts';
  import { sunRank } from '../engine/index.ts';

  let { positions }: { positions: BodyPosition[] } = $props();
  const res = $derived(chartDispositors(positions));
  const kingSet = $derived(new Set(res.kings));
  const g = (name: string) => PLANET_GLYPH[name] ?? name;
  const chains = $derived([...res.chains].sort((a, b) => sunRank(a.planet) - sunRank(b.planet)));
</script>

<div class="disp">
  {#if res.kings.length}
    <div class="crown">👑 Царь карты: {#each res.kings as k, i}<span class="king glyph">{g(k)} {k}</span>{#if i < res.kings.length - 1}, {/if}{/each}
      <span class="note">— к нему стекается вся карта</span></div>
  {/if}
  {#each res.receptions as cyc}
    <div class="recep">⇄ Взаимная рецепция: {#each cyc as p, i}<span class="glyph">{g(p)}</span>{#if i < cyc.length - 1} ⇄ {/if}{/each}
      <span class="note">— соправители</span></div>
  {/each}

  {#each chains as c (c.planet)}
    <div class="chain">
      {#each c.path as p, i}<span class="node glyph" class:king={kingSet.has(p)} title={p}>{g(p)}</span>{#if i < c.path.length - 1}<span class="to">→</span>{/if}{/each}
      {#if c.cycle.length}<span class="loop" title={c.king ? 'в своём знаке — царь' : 'кольцо рецепции'}>⟲</span>{/if}
    </div>
  {/each}
</div>

<style>
  .disp { display: flex; flex-direction: column; gap: 6px; padding: 4px 2px; }
  .crown, .recep { font-size: 0.86rem; color: var(--ink-dim); }
  .crown .king { color: var(--gold); font-weight: 600; }
  .note { color: var(--ink-faint); font-size: 0.78rem; }
  .chain { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 1.05rem; }
  .node { color: var(--silver); }
  .node.king { color: var(--gold); text-shadow: 0 0 6px color-mix(in srgb, var(--gold) 45%, transparent); }
  .to { color: var(--ink-faint); font-size: 0.85rem; }
  .loop { color: var(--neon-cyan); font-size: 0.9rem; }
</style>
