<script lang="ts">
  /** «Значения домов» — знак на куспиде каждого дома (144 = 12 домов × 12 знаков,
   *  тексты astролога в lib/houseLore.ts). Аккордеон по домам: тап по дому
   *  раскрывает все 12 знаков. Следующий раздел (планеты в домах) — отдельно. */
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import GlowCard from './GlowCard.svelte';
  import { HOUSE_LORE } from '../lib/houseLore.ts';
  import { SIGN_GLYPH, ZODIAC } from '../engine/index.ts';
  import { HOUSE_THEME } from '../lib/houseThemes.ts';

  let { onclose }: { onclose: () => void } = $props();

  const HOUSES = Array.from({ length: 12 }, (_, i) => i + 1);
  const signs = ZODIAC as readonly string[];
  const glyph = (sign: string): string => SIGN_GLYPH[signs.indexOf(sign)] ?? '✦';

  let open = $state<number | null>(null);
  const toggle = (h: number): void => { open = open === h ? null : h; };
</script>

<div class="backdrop sheet-backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Значения домов" use:bottomSheet={{ onclose }}>
  <header><h2>Значения домов</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">Знак на куспиде каждого дома — как тема дома окрашивается знаком.
    Тап по дому раскрывает все 12 знаков.</div>

  {#each HOUSES as h (h)}
    {@const opened = open === h}
    <GlowCard radius={14} selected={opened}>
      <div class="row reveal" class:opened use:reveal>
        <button class="head" onclick={() => toggle(h)} aria-expanded={opened}>
          <span class="num">{h}</span>
          <span class="theme">{HOUSE_THEME[h]}</span>
          <span class="chev" class:up={opened}>▾</span>
        </button>
        {#if opened}
          <div class="body">
            {#each signs as sign (sign)}
              {@const text = HOUSE_LORE[`${h}|${sign}`]}
              {#if text}
                <div class="line">
                  <span class="g glyph">{glyph(sign)}</span>
                  <div class="txt"><span class="sname">{sign}</span><p>{text}</p></div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    </GlowCard>
  {/each}
</section>

<style>
  /* геометрия/бэкдроп — глобальные .sheet-base/.sheet-backdrop (app.css); тут только z-index */
  .backdrop { z-index: 26; }
  .sheet { z-index: 27; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.82rem; margin: 6px 0 12px; }

  .row { background: #ffffff0a; border: 1px solid var(--glass-brd); border-radius: 14px;
    margin-bottom: 8px; overflow: hidden; }
  .row.opened { background: #ffffff10; border-color: color-mix(in srgb, var(--accent) 45%, var(--glass-brd)); }
  .head { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    background: transparent; border: none; padding: 12px 14px; color: var(--ink); }
  .num { font-family: var(--font-display); font-weight: 700; font-size: 1.1rem; color: var(--gold);
    width: 1.6rem; text-align: center; flex: none; }
  .theme { flex: 1; min-width: 0; color: var(--ink-dim); font-size: 0.9rem; }
  .chev { color: var(--ink-faint); flex: none; transition: transform 0.2s ease; }
  .chev.up { transform: rotate(180deg); }

  .body { padding: 0 14px 10px; }
  .line { display: flex; gap: 10px; padding: 8px 0; border-top: 1px solid var(--glass-brd); }
  .g { font-size: 1.15rem; color: var(--silver); width: 1.5rem; text-align: center; flex: none; }
  .txt { flex: 1; min-width: 0; }
  .sname { font-size: 0.78rem; color: var(--ink-faint); }
  .body p { margin: 2px 0 0; color: var(--ink-dim); font-size: 0.88rem; line-height: 1.5; }
</style>
