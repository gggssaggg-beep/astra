<script lang="ts">
  /** «Мифы знаков» — бог на каждый знак (АВТОРСКАЯ раскладка владелицы).
   *  Аккордеон как в ArchetypesSheet: развёрнутый знак держит рамку GlowCard.
   *  Совпадающие с расхожим образом знака грани — выше, новые — ниже. */
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import GlowCard from './GlowCard.svelte';
  import { SIGN_MYTHS } from '../lib/signMyths.ts';
  import { SIGN_GLYPH, ZODIAC } from '../engine/index.ts';

  let { onclose }: { onclose: () => void } = $props();

  let open = $state<string | null>(null);
  const toggle = (s: string): void => { open = open === s ? null : s; };
  const glyph = (sign: string): string =>
    SIGN_GLYPH[(ZODIAC as readonly string[]).indexOf(sign)] ?? '✦';
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Мифы знаков" use:bottomSheet={{ onclose }}>
  <header><h2>Мифы знаков</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">Каждому знаку — свой бог (авторская раскладка). Ключ к архетипу —
    сокровенное желание бога: через него противоречия мифов раскрывают знак глубже.</div>

  {#each SIGN_MYTHS as m (m.sign)}
    {@const opened = open === m.sign}
    <GlowCard radius={14} selected={opened}>
      <div class="row reveal" class:opened use:reveal>
        <button class="head" onclick={() => toggle(m.sign)} aria-expanded={opened}>
          <span class="g glyph">{glyph(m.sign)}</span>
          <span class="name">{m.sign}</span>
          <span class="deity-tag">{m.deity} · упр. {m.ruler}</span>
          <span class="chev" class:up={opened}>▾</span>
        </button>
        {#if opened}
          <div class="body">
            <p class="myth">{m.myth}</p>
            <div class="lbl">Сокровенное желание</div>
            <p class="wish">{m.wish}</p>
            <div class="lbl">Покровительство и обряды</div>
            <p class="myth">{m.domain}</p>
            <div class="lbl light">Свет</div>
            <ul>{#each m.plus as t}<li>{t}</li>{/each}</ul>
            <div class="lbl shade">Тень</div>
            <ul>{#each m.minus as t}<li>{t}</li>{/each}</ul>
          </div>
        {/if}
      </div>
    </GlowCard>
  {/each}
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 24; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 25; padding: 16px 16px calc(18px + var(--safe-bottom));
    border-radius: 22px 22px 0 0; animation: up 0.34s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.82rem; margin: 6px 0 12px; }

  .row { background: #ffffff0a; border: 1px solid var(--glass-brd); border-radius: 14px;
    margin-bottom: 8px; overflow: hidden; }
  .row.opened { background: #ffffff10; border-color: color-mix(in srgb, var(--accent) 45%, var(--glass-brd)); }
  .head { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    background: transparent; border: none; padding: 12px 14px; color: var(--ink); }
  .g { font-size: 1.25rem; color: var(--silver); width: 1.5rem; text-align: center; flex: none; }
  .name { font-weight: 600; flex: none; }
  .deity-tag { flex: 1; min-width: 0; color: var(--ink-dim); font-size: 0.86rem;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; }
  .chev { color: var(--ink-faint); flex: none; transition: transform 0.2s ease; }
  .chev.up { transform: rotate(180deg); }

  .body { padding: 0 14px 12px; }
  .myth { margin: 0 0 10px; color: var(--ink-dim); font-size: 0.9rem; line-height: 1.55; }
  .lbl { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 1.1px;
    color: var(--ink-faint); font-weight: 600; margin: 8px 0 4px; }
  .lbl.light { color: var(--gold); }
  .lbl.shade { color: var(--rose); }
  /* сокровенное желание — сердце архетипа, выделено мягким свечением */
  .wish { margin: 0 0 10px; color: var(--ink); font-size: 0.9rem; line-height: 1.55;
    border-left: 2px solid color-mix(in srgb, var(--accent) 60%, transparent);
    padding-left: 10px;
    text-shadow: 0 0 12px color-mix(in srgb, var(--accent) 25%, transparent); }
  ul { margin: 0; padding-left: 18px; color: var(--ink-dim); font-size: 0.88rem; line-height: 1.5; }
  li { margin-bottom: 3px; }
</style>
