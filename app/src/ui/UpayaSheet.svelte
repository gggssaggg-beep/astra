<script lang="ts">
  /**
   * «Мантры и камни» — справочник упай девяти грах (ведический режим).
   * Чистые данные из lib/upaya.ts: движок здесь не нужен, карта — тоже.
   *
   * Предупреждение сверху обязательно и НЕ прячется под аккордеон: камень
   * усиливает граху, поэтому носят камень благодетеля карты, а не вредителя.
   */
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import { PLANET_GLYPH } from '../engine/index.ts';
  import { GRAHA_NAMES } from '../lib/vedicLore.ts';
  import { UPAYA, UPAYA_ORDER, UPAYA_WARNING } from '../lib/upaya.ts';

  let { onclose }: { onclose: () => void } = $props();

  let open = $state<string | null>(null);
</script>

<div class="backdrop sheet-backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Мантры и камни" use:bottomSheet={{ onclose }}>
  <header>
    <h2>Мантры и камни</h2>
    <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
  </header>
  <div class="hint">Упайи девяти грах: биджа-мантра, камень, день недели, дана и цвет.</div>

  <div class="warn">{UPAYA_WARNING}</div>

  {#each UPAYA_ORDER as name}
    {@const u = UPAYA[name]}
    <div class="card glass reveal" use:reveal>
      <button class="head" onclick={() => (open = open === name ? null : name)}>
        <span class="g glyph">{PLANET_GLYPH[name] ?? '•'}</span>
        <span class="nm">{name}<span class="sk">{GRAHA_NAMES[name] ?? ''}</span></span>
        <span class="arr">{open === name ? '▾' : '▸'}</span>
      </button>
      {#if open === name}
        <div class="body">
          <div class="mantra">{u.mantra}</div>
          <div class="grid">
            <div><span class="k">Камень</span><span class="v">{u.stone}
              <span class="note">{u.stoneNote}</span></span></div>
            <div><span class="k">День</span><span class="v">{u.day}</span></div>
            <div><span class="k">Дана</span><span class="v">{u.dana}</span></div>
            <div><span class="k">Цвет</span><span class="v">{u.color}</span></div>
          </div>
        </div>
      {/if}
    </div>
  {/each}

  <div class="foot">Числа повторений тут не написаны намеренно: у школ они разные,
    и назначают их по карте, а не по справочнику.</div>
</section>

<style>
  /* геометрия/бэкдроп — глобальные .sheet-base/.sheet-backdrop (app.css) */
  .backdrop { z-index: 20; }
  .sheet { z-index: 21; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.84rem; margin: 4px 0 12px; }

  .warn { color: var(--ink); font-size: 0.84rem; line-height: 1.55; padding: 12px 14px;
    border-radius: 12px; border: 1px solid color-mix(in srgb, var(--gold) 40%, var(--glass-brd));
    background: color-mix(in srgb, var(--glass) 78%, var(--gold) 10%); margin: 0 0 14px; }

  .card { padding: 4px 6px; margin: 8px 0; }
  .head { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    background: transparent; border: none; color: var(--ink); padding: 10px 8px; }
  .g { font-size: 1.3rem; color: var(--silver); }
  .nm { flex: 1; font-size: 0.95rem; }
  .sk { color: var(--ink-faint); font-size: 0.78rem; margin-left: 8px; }
  .arr { color: var(--ink-faint); }

  .body { padding: 2px 10px 12px; }
  .mantra { color: var(--ink); font-size: 0.9rem; line-height: 1.5; padding: 10px 12px;
    border-left: 2px solid var(--gold); background: #ffffff08; border-radius: 8px; margin: 4px 0 10px; }

  .grid { display: flex; flex-direction: column; gap: 9px; }
  .grid > div { display: flex; gap: 10px; align-items: baseline; }
  .k { color: var(--ink-faint); font-size: 0.78rem; min-width: 72px; }
  .v { flex: 1; color: var(--ink); font-size: 0.86rem; line-height: 1.45; }
  .note { display: block; color: var(--ink-faint); font-size: 0.78rem; line-height: 1.45; margin-top: 3px; }

  .foot { color: var(--ink-faint); font-size: 0.8rem; line-height: 1.45; margin: 14px 4px 8px; }
</style>
