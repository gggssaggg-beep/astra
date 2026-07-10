<script lang="ts">
  import type { AspectRecord } from '../engine/index.ts';
  import { PLANET_GLYPH, ASPECTS } from '../engine/index.ts';
  import { db, onChange } from '../lib/db.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import GlowCard from './GlowCard.svelte';

  let { onclose, onopen }: { onclose: () => void; onopen: (r: AspectRecord) => void } = $props();

  let items = $state(db.tracked.all().slice());
  $effect(() => onChange(() => (items = db.tracked.all().slice())));

  const interpOf = (sig: string) => db.interpretations.get(sig)?.text ?? '';

  function open(p1: string, p2: string, aspect: string) {
    onopen({
      p1, p2, aspect, symbol: ASPECTS[aspect]?.symbol ?? '',
      exactOrb: 0, exactTime: null, beginTime: null, endTime: null,
      applying: false, pos1: 0, pos2: 0, bucket: 'fast',
    });
  }
  function unpin(id: string) { db.tracked.remove(id); items = db.tracked.all().slice(); }
</script>

<div class="backdrop sheet-backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Отслеживаемые аспекты" use:bottomSheet={{ onclose }}>
  <header><h2>Отслеживаю</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>

  {#if !items.length}
    <div class="hint">Пока пусто. Открой карточку аспекта и нажми ☆, чтобы отслеживать пару+аспект.</div>
  {/if}

  {#each items as t (t.id)}
    <!-- обводка обегает контур и лишь потом открывает (единый паттерн GlowCard) -->
    <GlowCard radius={12} onactivate={() => open(t.p1, t.p2, t.aspect)}>
      <div class="item reveal" use:reveal>
        <button class="open">
          <span class="glyph pair">{PLANET_GLYPH[t.p1] ?? t.p1}<span class="a">{ASPECTS[t.aspect]?.symbol}</span>{PLANET_GLYPH[t.p2] ?? t.p2}</span>
          <span class="nm">{t.p1} {t.aspect} {t.p2}</span>
          {#if interpOf(t.signature)}<span class="prev">{interpOf(t.signature)}</span>{/if}
        </button>
        <button class="mini" title="Открепить" onclick={(e) => { e.stopPropagation(); unpin(t.id); }}>★</button>
      </div>
    </GlowCard>
  {/each}
</section>

<style>
  /* геометрия/бэкдроп — глобальные .sheet-base/.sheet-backdrop (app.css); тут только z-index */
  .backdrop { z-index: 22; }
  .sheet { z-index: 23; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.85rem; padding: 10px 0; }
  .item { display: flex; align-items: flex-start; gap: 8px; padding: 10px 0; border-top: 1px solid var(--glass-brd); }
  .open { flex: 1; background: transparent; border: none; text-align: left; color: var(--ink); display: flex; flex-direction: column; gap: 2px; cursor: pointer; }
  .open:hover { color: var(--ink); }
  .pair { font-size: 1.3rem; }
  .a { margin: 0 3px; opacity: 0.85; }
  .nm { font-size: 0.82rem; color: var(--ink-dim); }
  .prev { font-size: 0.84rem; color: var(--ink-faint); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .mini { background: transparent; border: none; color: var(--gold); font-size: 1.2rem; }
</style>
