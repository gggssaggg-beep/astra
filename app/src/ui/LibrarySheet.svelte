<script lang="ts">
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import ScrollThread from './ScrollThread.svelte';

  let { onclose, onInterpretations, onArchetypes, onTracked }:
    { onclose: () => void; onInterpretations: () => void; onArchetypes: () => void; onTracked: () => void } = $props();
  let sheetEl = $state<HTMLElement | null>(null);
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<ScrollThread target={sheetEl} zIndex={22} />
<section class="sheet glass" aria-label="Библиотека" use:bottomSheet={{ onclose }} bind:this={sheetEl}>
  <header><h2>Библиотека</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">Трактовки, архетипы божеств и отслеживаемые аспекты — в одном месте.</div>

  <button class="row reveal" use:reveal onclick={onInterpretations}>
    <span class="ic glyph">📖</span>
    <div class="txt"><b>Трактовки</b><small>свои тексты по парам и аспектам</small></div>
    <span class="arr">→</span>
  </button>
  <button class="row reveal" use:reveal onclick={onArchetypes}>
    <span class="ic glyph">🏛</span>
    <div class="txt"><b>Архетипы божеств</b><small>миф и архетип на каждую планету</small></div>
    <span class="arr">→</span>
  </button>
  <button class="row reveal" use:reveal onclick={onTracked}>
    <span class="ic glyph">★</span>
    <div class="txt"><b>Отслеживаю</b><small>закреплённые пары + аспекты</small></div>
    <span class="arr">→</span>
  </button>
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0007; backdrop-filter: blur(2px); z-index: 20; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 21; padding: 16px 16px calc(18px + env(safe-area-inset-bottom)); border-radius: 22px 22px 0 0; animation: up 0.25s ease; }
  @keyframes up { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.84rem; margin: 4px 0 12px; }
  .row { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
    background: #ffffff0c; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 14px; padding: 14px; margin-bottom: 10px; }
  .row:hover { background: #ffffff16; }
  .ic { font-size: 1.4rem; width: 1.8rem; text-align: center; color: var(--gold); }
  .txt { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .txt b { font-family: var(--font-display); font-weight: 600; letter-spacing: 0.2px; }
  .txt small { color: var(--ink-faint); font-size: 0.78rem; }
  .arr { color: var(--ink-faint); }
</style>
