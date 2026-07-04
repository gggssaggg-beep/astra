<script lang="ts">
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import GlowCard from './GlowCard.svelte';

  let { onclose, onInterpretations, onArchetypes, onTracked, onChat }:
    { onclose: () => void; onInterpretations: () => void; onArchetypes: () => void;
      onTracked: () => void; onChat: () => void } = $props();
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Библиотека" use:bottomSheet={{ onclose }}>
  <header><h2>Библиотека</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">Трактовки, архетипы божеств и отслеживаемые аспекты — в одном месте.</div>

  <!-- тап: обводка обегает контур → открытие (единый паттерн GlowCard) -->
  <GlowCard radius={14} onactivate={onInterpretations}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">📖</span>
      <div class="txt"><b>Трактовки</b><small>свои тексты по парам и аспектам</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onArchetypes}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">🏛</span>
      <div class="txt"><b>Архетипы божеств</b><small>миф и архетип на каждую планету</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onTracked}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">★</span>
      <div class="txt"><b>Отслеживаю</b><small>закреплённые пары + аспекты</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <!-- чат переехал сюда из нижнего меню; Сообщество живёт ТОЛЬКО в нижнем
       меню (дубль из библиотеки убран — просьба 2026-07-02) -->
  <GlowCard radius={14} onactivate={onChat}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">💬</span>
      <div class="txt"><b>Чат с Claude</b><small>трактовки по архетипам, на своём ключе</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 20; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 21; padding: 16px 16px calc(18px + var(--safe-bottom)); border-radius: 22px 22px 0 0; animation: up 0.34s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
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
