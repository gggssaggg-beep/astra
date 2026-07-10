<script lang="ts">
  /**
   * «Ретроградность» (раунд 29 §3) — библиотечная графа. Показывает фазу каждой
   * ретроградящей планеты СЕЙЧАС (движок) + характер её ретро и смысл фаз.
   * Тексты композиционные (retroLore.ts): характер планеты × смысл фазы.
   */
  import { untrack } from 'svelte';
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import type { Engine, RetroPhase } from '../engine/index.ts';
  import { retroPhase, PLANET_GLYPH } from '../engine/index.ts';
  import { PHASE_LABEL, PHASE_MEANING, PHASE_PRACTICE, RETRO_FLAVOR, NODES_RETRO } from '../lib/retroLore.ts';
  import Hint from './Hint.svelte';

  let { engine, onclose }: { engine: Engine; onclose: () => void } = $props();

  const PLANETS = ['Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'Уран', 'Нептун'];
  const PHASES: RetroPhase[] = ['shadowBefore', 'retroStation', 'retro', 'directStation', 'shadowAfter'];
  const now = new Date();
  // фаза считается движком (несколько тысяч вызовов на планету) — один раз при
  // открытии; engine стабилен (создаётся в App единожды) → untrack без реактивности
  const nowPhase = untrack(() => new Map(PLANETS.map((p) => [p, retroPhase(engine, p, now)])));
  const nodePhase = untrack(() => retroPhase(engine, 'Раху', now));

  let open = $state<string | null>(null);
  const active = (ph: RetroPhase) => ph !== 'direct';
  const tone = (ph: RetroPhase): string =>
    ph === 'retro' || ph === 'retroStation' ? 'hot' : ph === 'direct' ? 'calm' : 'warm';
</script>

<div class="backdrop sheet-backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Ретроградность" use:bottomSheet={{ onclose }}>
  <header><h2>Ретроградность <Hint k="retro-phases" /></h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">Где планеты сейчас в своём цикле: тень → станция → ретроград → станция → тень.</div>

  {#each PLANETS as p}
    {@const ph = nowPhase.get(p) ?? 'direct'}
    <div class="card glass reveal" use:reveal>
      <button class="head" onclick={() => (open = open === p ? null : p)}>
        <span class="g glyph">{PLANET_GLYPH[p]}</span>
        <span class="nm">{p}</span>
        <span class="badge {tone(ph)}" class:on={active(ph)}>{PHASE_LABEL[ph]}</span>
        <span class="arr">{open === p ? '▾' : '▸'}</span>
      </button>
      {#if open === p}
        <div class="body">
          <div class="flavor">{RETRO_FLAVOR[p]}</div>
          <div class="nowline"><b>Сейчас — {PHASE_LABEL[ph]}:</b> {PHASE_MEANING[ph]}</div>
          <div class="practice"><b>На практике:</b> {PHASE_PRACTICE[ph]}</div>
          <div class="phdr">Все фазы</div>
          {#each PHASES as f}
            <div class="ph" class:cur={f === ph}>
              <span class="pl">{PHASE_LABEL[f]}</span>
              <span class="pm">{PHASE_MEANING[f]}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/each}

  <div class="card glass reveal nodes" use:reveal>
    <div class="head static">
      <span class="g glyph">☊☋</span><span class="nm">Лунные узлы</span>
      <span class="badge {tone(nodePhase)} on">{PHASE_LABEL[nodePhase]}</span>
    </div>
    <div class="flavor">{NODES_RETRO}</div>
  </div>
</section>

<style>
  /* геометрия/бэкдроп — глобальные .sheet-base/.sheet-backdrop (app.css); тут только z-index */
  .backdrop { z-index: 20; }
  .sheet { z-index: 21; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.84rem; margin: 4px 0 12px; }
  .card { padding: 4px 6px; margin: 8px 0; }
  .head { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    background: transparent; border: none; color: var(--ink); padding: 10px 8px; }
  .head.static { cursor: default; }
  .g { font-size: 1.3rem; color: var(--silver); }
  .nm { flex: 1; font-size: 0.95rem; }
  .badge { font-size: 0.7rem; border-radius: 999px; padding: 2px 9px; color: var(--ink-faint);
    border: 1px solid var(--glass-brd); white-space: nowrap; }
  .badge.on.hot { color: var(--rose); border-color: color-mix(in srgb, var(--rose) 45%, var(--glass-brd)); }
  .badge.on.warm { color: var(--gold); border-color: color-mix(in srgb, var(--gold) 40%, var(--glass-brd)); }
  .arr { color: var(--ink-faint); }
  .body { padding: 4px 10px 12px; }
  .flavor { color: var(--ink-dim); font-size: 0.86rem; line-height: 1.5; padding: 8px; }
  .nowline { color: var(--ink); font-size: 0.86rem; line-height: 1.5; padding: 8px;
    border-left: 2px solid var(--gold); background: #ffffff08; border-radius: 8px; margin: 4px 0; }
  .practice { color: var(--ink-dim); font-size: 0.86rem; line-height: 1.5; padding: 8px;
    border-left: 2px solid var(--neon-cyan); background: #ffffff08; border-radius: 8px; margin: 4px 0; }
  .practice b { color: var(--ink); }
  .phdr { color: var(--ink-faint); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; margin: 10px 4px 4px; }
  .ph { padding: 6px 8px; border-radius: 8px; }
  .ph.cur { background: color-mix(in srgb, var(--glass) 80%, var(--gold) 8%); }
  .ph .pl { color: var(--ink); font-weight: 600; font-size: 0.82rem; }
  .ph .pm { display: block; color: var(--ink-faint); font-size: 0.82rem; line-height: 1.45; margin-top: 2px; }
  .nodes .flavor { padding: 4px 8px 10px; }
</style>
