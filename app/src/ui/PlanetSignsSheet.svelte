<script lang="ts">
  /** «Планеты в знаках» — аккордеон по планетам; раскрытая строка показывает
   *  12 знаков с текстом из PLANET_SIGN_LORE (пустые ключи пропускаются). */
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import GlowCard from './GlowCard.svelte';
  import { LORE_PLANETS, PLANET_SIGN_LORE } from '../lib/planetSignLore.ts';
  import { PLANET_GLYPH, SIGN_GLYPH, ZODIAC } from '../engine/index.ts';
  import { PLANET_LORE } from '../lib/lore.ts';

  let { onclose }: { onclose: () => void } = $props();

  const signs = ZODIAC as readonly string[];
  const signGlyph = (sign: string): string => SIGN_GLYPH[signs.indexOf(sign)] ?? '✦';

  let open = $state<string | null>(null);
  const toggle = (planet: string): void => { open = open === planet ? null : planet; };
</script>

<div class="backdrop sheet-backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Планеты в знаках" use:bottomSheet={{ onclose }}>
  <header><h2>Планеты в знаках</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">Архетип планеты × бог знака — как это сочетание проявляется в жизни.
    Тап по планете раскрывает 12 знаков.</div>

  {#each LORE_PLANETS as planet (planet)}
    {@const opened = open === planet}
    {@const deity = PLANET_LORE[planet]?.deity ?? ''}
    <GlowCard radius={14} selected={opened}>
      <div class="row reveal" class:opened use:reveal>
        <button class="head" onclick={() => toggle(planet)} aria-expanded={opened}>
          <span class="pg glyph">{PLANET_GLYPH[planet] ?? '•'}</span>
          <div class="ptxt">
            <span class="pname">{planet}</span>
            {#if deity}<span class="deity">{deity}</span>{/if}
          </div>
          <span class="chev" class:up={opened}>▾</span>
        </button>
        {#if opened}
          <div class="body">
            {#each signs as sign (sign)}
              {@const text = PLANET_SIGN_LORE[`${planet}|${sign}`]}
              {#if text}
                <div class="line">
                  <span class="g glyph">{signGlyph(sign)}</span>
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
  .pg { font-size: 1.3rem; color: var(--gold); width: 1.8rem; text-align: center; flex: none; }
  .ptxt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .pname { font-family: var(--font-display); font-weight: 600; font-size: 0.95rem; }
  .deity { color: var(--ink-faint); font-size: 0.75rem; }
  .chev { color: var(--ink-faint); flex: none; transition: transform 0.2s ease; }
  .chev.up { transform: rotate(180deg); }

  .body { padding: 0 14px 10px; }
  .line { display: flex; gap: 10px; padding: 8px 0; border-top: 1px solid var(--glass-brd); }
  .g { font-size: 1.15rem; color: var(--silver); width: 1.5rem; text-align: center; flex: none; }
  .txt { flex: 1; min-width: 0; }
  .sname { font-size: 0.78rem; color: var(--ink-faint); }
  .body p { margin: 2px 0 0; color: var(--ink-dim); font-size: 0.88rem; line-height: 1.5; }
</style>
