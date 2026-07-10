<script lang="ts">
  /** Шторка контекстной «?»: короткое объяснение новичку + «подробнее»
   *  (раскрыть готовый текст lore-модуля ЛИБО перейти в существующую шторку).
   *  z-index 32/33 — ВЫШЕ InfoSheet (26/27) и шторок Библиотеки (20/21):
   *  «?» открывается поверх любой шторки. Паттерн — как InfoSheet. */
  import { gloss, type GlossSheet } from '../lib/glossary.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { tick } from '../lib/haptics.ts';

  let { k, onclose, onnavigate }:
    { k: string; onclose: () => void; onnavigate?: (target: GlossSheet) => void } = $props();

  const entry = $derived(gloss(k));
  let showText = $state(false);
  // смена термина (тап по другой «?» пока шторка открыта) — свернуть аккордеон
  $effect(() => { void k; showText = false; });
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Что это?" use:bottomSheet={{ onclose }}>
  {#if entry}
    <header>
      <div class="title"><span class="q">?</span><b>{entry.title}</b></div>
      <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
    </header>
    <p class="short">{entry.short}</p>

    {#if entry.more}
      {@const more = entry.more}
      {#if more.kind === 'text'}
        <button class="more" onclick={() => { tick(); showText = !showText; }}>
          {more.label}<span class="arr">{showText ? '▾' : '▸'}</span>
        </button>
        {#if showText}<div class="longtext">{more.text()}</div>{/if}
      {:else}
        <button class="more go" onclick={() => { tick(); onnavigate?.(more.target); }}>
          {more.label}<span class="arr">→</span>
        </button>
      {/if}
    {/if}
  {:else}
    <header>
      <div class="title"><span class="q">?</span><b>Термин</b></div>
      <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
    </header>
    <p class="short">Пояснение для этого термина пока готовится.</p>
  {/if}
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 32; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 80vh; overflow-y: auto; z-index: 33; padding: 16px 16px calc(18px + var(--safe-bottom));
    border-radius: 22px 22px 0 0; animation: up 0.34s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
  header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .title { display: flex; align-items: center; gap: 10px; }
  .title b { font-size: 1.05rem; }
  .q { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px;
    border-radius: 50%; background: var(--accent); color: var(--on-accent); font-weight: 700; font-size: 0.85rem; flex: none; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .short { margin: 12px 0 0; color: var(--ink-dim); line-height: 1.55; font-size: 0.94rem; }
  .more { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%;
    margin-top: 14px; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 11px 14px; font-size: 0.9rem; font-weight: 600; text-align: left; }
  .more.go { background: var(--accent); border-color: transparent; color: var(--on-accent); }
  .arr { color: var(--ink-faint); }
  .more.go .arr { color: var(--on-accent); }
  .longtext { margin-top: 8px; padding: 12px 14px; background: #ffffff08; border: 1px solid var(--glass-brd);
    border-radius: 12px; color: var(--ink-dim); line-height: 1.55; font-size: 0.9rem; white-space: pre-wrap; }
</style>
