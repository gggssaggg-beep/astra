<script lang="ts">
  /**
   * «Поиск градуса» (раунд 29 §5): когда планета проходила заданный градус знака
   * в диапазоне лет. Планета проходит точку 1 или 3 раза (директ→ретро→директ) —
   * показываем ВСЕ прохождения с направлением; тап по дате открывает день.
   */
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import type { Engine, DegreePassage } from '../engine/index.ts';
  import { findDegreePassages, degreeToLon, ZODIAC, PLANET_GLYPH } from '../engine/index.ts';
  import { fmtDayFull, fmtTime, fmtPos } from '../lib/format.ts';
  import Hint from './Hint.svelte';

  let { engine, tz, onclose, ongoto }:
    { engine: Engine; tz: string; onclose: () => void; ongoto: (d: Date) => void } = $props();

  const PLANETS = ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс', 'Юпитер',
    'Сатурн', 'Уран', 'Нептун', 'Раху', 'Кету'];
  const nowY = new Date().getUTCFullYear();

  let planet = $state('Венера');
  let signIdx = $state(4);          // Лев по умолчанию (пример из ТЗ)
  let deg = $state(27);
  let min = $state(56);
  let yFrom = $state(nowY - 5);
  let yTo = $state(nowY + 5);

  let busy = $state(false);
  let done = $state(false);
  let results = $state<DegreePassage[]>([]);
  let truncated = $state(false);
  const targetLon = $derived(degreeToLon(signIdx, Math.min(29, Math.max(0, deg)), Math.min(59, Math.max(0, min))));

  async function run(): Promise<void> {
    if (busy) return;
    busy = true; done = false;
    const from = new Date(Date.UTC(Math.min(yFrom, yTo), 0, 1));
    const to = new Date(Date.UTC(Math.max(yFrom, yTo) + 1, 0, 1));
    try {
      const r = await findDegreePassages(engine, planet, targetLon, from, to);
      results = r.list; truncated = r.truncated;
    } finally { busy = false; done = true; }
  }
</script>

<div class="backdrop sheet-backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Поиск градуса" use:bottomSheet={{ onclose }}>
  <header><h2>Поиск градуса <Hint k="degree" /></h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">Когда планета проходила заданный градус — со всеми ретро-возвратами.</div>

  <div class="form">
    <label class="fld">Планета
      <select bind:value={planet}>
        {#each PLANETS as p}<option value={p}>{PLANET_GLYPH[p] ?? ''} {p}</option>{/each}
      </select>
    </label>
    <label class="fld">Знак
      <select bind:value={signIdx}>
        {#each ZODIAC as z, i}<option value={i}>{z}</option>{/each}
      </select>
    </label>
    <label class="fld sm">Градус
      <input type="number" min="0" max="29" bind:value={deg} />
    </label>
    <label class="fld sm">Минуты
      <input type="number" min="0" max="59" bind:value={min} />
    </label>
    <label class="fld sm">Год от
      <input type="number" bind:value={yFrom} />
    </label>
    <label class="fld sm">Год до
      <input type="number" bind:value={yTo} />
    </label>
  </div>
  <div class="target">Ищем: {PLANET_GLYPH[planet] ?? ''} {planet} на {fmtPos(targetLon)}</div>
  <button class="go" onclick={run} disabled={busy}>{busy ? 'Ищу…' : 'Найти'}</button>

  {#if done && !busy}
    {#if results.length === 0}
      <div class="empty">За выбранные годы планета не проходила этот градус.</div>
    {:else}
      <div class="cnt">Прохождений: {results.length}{truncated ? '+ (показаны первые)' : ''}</div>
      {#each results as p (p.jd)}
        <button class="res reveal" use:reveal onclick={() => ongoto(p.exact)}>
          <span class="date">{fmtDayFull(new Date(Date.UTC(p.exact.getUTCFullYear(), p.exact.getUTCMonth(), p.exact.getUTCDate())))}</span>
          <span class="time">{fmtTime(p.exact, tz)}</span>
          {#if p.retro}<span class="rx" title="ретроградное прохождение">℞</span>{/if}
          <span class="arr">→</span>
        </button>
      {/each}
    {/if}
  {/if}
</section>

<style>
  /* геометрия/бэкдроп — глобальные .sheet-base/.sheet-backdrop (app.css); тут только z-index */
  .backdrop { z-index: 20; }
  .sheet { z-index: 21; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.84rem; margin: 4px 0 12px; }
  .form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .fld { display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; color: var(--ink-faint); }
  .fld.sm { grid-column: span 1; }
  select, input { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 10px; padding: 9px 10px; font-size: 0.95rem; font-family: inherit; }
  .target { margin: 12px 0 8px; color: var(--ink-dim); font-size: 0.9rem; }
  .go { width: 100%; padding: 12px; border-radius: 12px; border: 1px solid var(--glass-brd);
    background: color-mix(in srgb, var(--neon-violet) 22%, transparent); color: var(--ink);
    font-size: 0.95rem; font-weight: 600; }
  .go:disabled { opacity: 0.6; }
  .empty { text-align: center; color: var(--ink-dim); padding: 20px 0; }
  .cnt { margin: 14px 0 6px; color: var(--ink-faint); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 1px; }
  .res { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    background: #ffffff0c; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; }
  .res:hover { background: #ffffff16; }
  .date { flex: 1; font-size: 0.9rem; }
  .time { font-variant-numeric: tabular-nums; font-family: var(--font-mono); color: var(--ink-dim); font-size: 0.85rem; }
  .rx { color: var(--gold); font-weight: 600; }
  .arr { color: var(--ink-faint); }
</style>
