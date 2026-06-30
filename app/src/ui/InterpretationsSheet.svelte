<script lang="ts">
  import type { AspectRecord } from '../engine/index.ts';
  import { PLANET_GLYPH, ASPECTS } from '../engine/index.ts';
  import { db, onChange } from '../lib/db.ts';
  import { parseSignature } from '../lib/signature.ts';
  import { bottomSheet } from '../lib/sheet.ts';

  let { onclose, onopen }: { onclose: () => void; onopen: (r: AspectRecord) => void } = $props();

  // slice — иначе Svelte не заметит мутацию db на месте (см. lib/db.ts)
  let items = $state(db.interpretations.all().slice());
  $effect(() => onChange(() => (items = db.interpretations.all().slice())));
  const list = $derived(items.filter((i) => i.text.trim()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));

  /** Открыть редактор трактовки: восстанавливаем мин. запись аспекта из сигнатуры. */
  function open(sig: string) {
    const { p1, p2, aspect } = parseSignature(sig);
    onopen({
      p1, p2, aspect, symbol: ASPECTS[aspect]?.symbol ?? '',
      exactOrb: 0, exactTime: null, beginTime: null, endTime: null,
      applying: false, pos1: 0, pos2: 0, bucket: 'fast',
    });
  }
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Трактовки" use:bottomSheet={{ onclose }}>
  <header><h2>Трактовки</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>

  {#if !list.length}
    <div class="hint">Пока пусто. Трактовки пишутся тапом по карточке аспекта в ленте дня.</div>
  {/if}

  {#each list as it (it.signature)}
    {@const p = parseSignature(it.signature)}
    <button class="item" onclick={() => open(it.signature)}>
      <span class="pair glyph">{PLANET_GLYPH[p.p1] ?? p.p1}<span class="a">{ASPECTS[p.aspect]?.symbol}</span>{PLANET_GLYPH[p.p2] ?? p.p2}</span>
      <div class="body">
        <span class="nm">{p.p1} {p.aspect} {p.p2}</span>
        <span class="prev">{it.text}</span>
      </div>
    </button>
  {/each}
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0007; backdrop-filter: blur(2px); z-index: 22; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 23; padding: 16px 16px calc(18px + env(safe-area-inset-bottom)); border-radius: 22px 22px 0 0; animation: up 0.25s ease; }
  @keyframes up { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.85rem; padding: 10px 0; }
  .item { display: flex; align-items: flex-start; gap: 10px; width: 100%; text-align: left;
    background: transparent; border: none; border-top: 1px solid var(--glass-brd); color: var(--ink); padding: 11px 0; }
  .item:hover { background: #ffffff0a; }
  .pair { font-size: 1.3rem; }
  .a { margin: 0 3px; opacity: 0.85; }
  .body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .nm { font-size: 0.82rem; color: var(--ink-dim); }
  .prev { font-size: 0.86rem; color: var(--ink-faint); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
</style>
