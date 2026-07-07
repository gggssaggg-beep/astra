<script lang="ts">
  import type { AspectRecord } from '../engine/index.ts';
  import { PLANET_GLYPH, ASPECTS } from '../engine/index.ts';
  import { db, onChange } from '../lib/db.ts';
  import { parseSignature } from '../lib/signature.ts';
  import { orderedPairAspects, LEAD_ORDER, ASPECT_ORDER } from '../lib/pairAspectLore.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import GlowCard from './GlowCard.svelte';

  let { onclose, onopen }: { onclose: () => void; onopen: (r: AspectRecord) => void } = $props();

  let tab = $state<'mine' | 'base'>('base');

  // slice — иначе Svelte не заметит мутацию db на месте (см. lib/db.ts)
  let items = $state(db.interpretations.all().slice());
  $effect(() => onChange(() => (items = db.interpretations.all().slice())));
  const list = $derived(items.filter((i) => i.text.trim()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));

  // База трактовок пар планет — упорядочена астрологом (Луна со всеми, потом
  // Солнце без Луны, …; аспекты соединение→оппозиция→трин→квадрат→секстиль).
  const base = orderedPairAspects();

  // ── Фильтры (просьба астролога 2026-07-07) ─────────────────────────────────
  // Планеты — «Вариант Б»: тап двух планет = конкретная пара (Марс+Венера →
  // только Марс–Венера, 5 аспектов). Одна планета — все её пары; три и больше —
  // все пары ВНУТРИ выбора. Аспекты — «сразу попасть на нужный аспект».
  let selP = $state<string[]>([]);
  let selA = $state<string[]>([]);
  const toggleP = (p: string) => (selP = selP.includes(p) ? selP.filter((x) => x !== p) : [...selP, p]);
  const toggleA = (a: string) => (selA = selA.includes(a) ? selA.filter((x) => x !== a) : [...selA, a]);
  const clearF = () => { selP = []; selA = []; };
  const anyF = $derived(selP.length > 0 || selA.length > 0);

  function matchP(p1: string, p2: string): boolean {
    if (selP.length === 0) return true;
    if (selP.length === 1) return p1 === selP[0] || p2 === selP[0];
    return selP.includes(p1) && selP.includes(p2); // пара целиком внутри выбора
  }
  const matchA = (a: string) => selA.length === 0 || selA.includes(a);

  const baseView = $derived(base.filter((e) => matchP(e.p1, e.p2) && matchA(e.aspect)));
  const mineView = $derived(
    list.map((it) => ({ it, p: parseSignature(it.signature) }))
        .filter(({ p }) => matchP(p.p1, p.p2) && matchA(p.aspect))
  );

  function openRec(p1: string, p2: string, aspect: string): void {
    onopen({
      p1, p2, aspect, symbol: ASPECTS[aspect]?.symbol ?? '',
      exactOrb: 0, exactTime: null, beginTime: null, endTime: null,
      applying: false, pos1: 0, pos2: 0, bucket: 'fast',
    });
  }
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Значения аспектов" use:bottomSheet={{ onclose }}>
  <header><h2>Значения аспектов</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>

  <div class="seg">
    <button class:on={tab === 'base'} onclick={() => (tab = 'base')}>База пар ({base.length})</button>
    <button class:on={tab === 'mine'} onclick={() => (tab = 'mine')}>Мои ({list.length})</button>
  </div>

  <!-- фильтр: планеты (пара) + аспекты -->
  <div class="filter">
    <div class="chips">
      {#each LEAD_ORDER as p (p)}
        <button class="chip glyph" class:on={selP.includes(p)} onclick={() => toggleP(p)}
          aria-pressed={selP.includes(p)} title={p}>{PLANET_GLYPH[p] ?? p}</button>
      {/each}
    </div>
    <div class="chips asp">
      {#each ASPECT_ORDER as a (a)}
        <button class="chip glyph" class:on={selA.includes(a)} onclick={() => toggleA(a)}
          aria-pressed={selA.includes(a)} title={a}>{ASPECTS[a]?.symbol ?? a}</button>
      {/each}
      {#if anyF}<button class="chip clear" onclick={clearF} title="Сбросить">✕</button>{/if}
    </div>
    <div class="fhint">
      {#if selP.length >= 2}Пара: {selP.join(' · ')}{:else if selP.length === 1}Все пары с {selP[0]}{:else}Тап по двум планетам — конкретная пара; по аспекту — только он{/if}
    </div>
  </div>

  {#if tab === 'mine'}
    {#if !mineView.length}
      <div class="hint">{list.length ? 'Ничего под фильтр не подошло.' : 'Пока пусто. Свои трактовки пишутся тапом по карточке аспекта в ленте дня.'}</div>
    {/if}
    {#each mineView as { it, p } (it.signature)}
      <GlowCard radius={14} onactivate={() => openRec(p.p1, p.p2, p.aspect)}>
        <button class="item reveal" use:reveal>
          <span class="pair glyph">{PLANET_GLYPH[p.p1] ?? p.p1}<span class="a">{ASPECTS[p.aspect]?.symbol}</span>{PLANET_GLYPH[p.p2] ?? p.p2}</span>
          <div class="body">
            <span class="nm">{p.p1} {p.aspect} {p.p2}</span>
            <span class="prev">{it.text}</span>
          </div>
        </button>
      </GlowCard>
    {/each}
  {:else}
    {#if !baseView.length}
      <div class="hint">Ничего под фильтр не подошло. Такой пары в аспекте не бывает (элонгация) или снимите часть фильтра.</div>
    {:else}
      <div class="hint">Тап открывает разбор. Порядок: сперва Луна со всеми, затем Солнце (без Луны) и так далее.</div>
    {/if}
    {#each baseView as e (e.p1 + e.p2 + e.aspect)}
      <GlowCard radius={14} onactivate={() => openRec(e.p1, e.p2, e.aspect)}>
        <button class="item reveal" use:reveal>
          <span class="pair glyph">{PLANET_GLYPH[e.p1] ?? e.p1}<span class="a">{ASPECTS[e.aspect]?.symbol}</span>{PLANET_GLYPH[e.p2] ?? e.p2}</span>
          <div class="body">
            <span class="nm">{e.p1} {e.aspect} {e.p2}</span>
            <span class="prev">{e.text}</span>
          </div>
        </button>
      </GlowCard>
    {/each}
  {/if}
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 22; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 23; padding: 16px 16px calc(18px + var(--safe-bottom)); border-radius: 22px 22px 0 0; animation: up 0.34s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.85rem; padding: 10px 0; }
  .seg { display: flex; gap: 6px; margin: 4px 0 8px; }
  .seg button { flex: 1; background: #ffffff0c; border: 1px solid var(--glass-brd); color: var(--ink-dim);
    border-radius: 12px; padding: 9px 6px; font-size: 0.84rem; }
  .seg button.on { background: var(--accent); border-color: transparent; color: var(--on-accent); font-weight: 600; }

  /* фильтр-чипы: сам символ подсвечивается при выборе (не рамка) */
  .filter { margin: 2px 0 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
  .chips.asp { margin-bottom: 4px; }
  .chip { min-width: 2rem; height: 2rem; padding: 0 8px; display: inline-flex; align-items: center;
    justify-content: center; background: #ffffff0c; border: 1px solid var(--glass-brd);
    border-radius: 10px; color: var(--ink-dim); font-size: 1.1rem; line-height: 1; }
  .chip.on { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 55%, var(--glass-brd));
    text-shadow: 0 0 10px color-mix(in srgb, var(--accent) 45%, transparent); }
  .chip.clear { font-size: 0.8rem; color: var(--ink-faint); }
  .fhint { color: var(--ink-faint); font-size: 0.76rem; padding: 2px 0 4px; }

  .item { display: flex; align-items: flex-start; gap: 10px; width: 100%; text-align: left;
    background: transparent; border: none; border-top: 1px solid var(--glass-brd); color: var(--ink); padding: 11px 0; }
  .item:hover { background: #ffffff0a; }
  .pair { font-size: 1.3rem; }
  .a { margin: 0 3px; opacity: 0.85; }
  .body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .nm { font-size: 0.82rem; color: var(--ink-dim); }
  /* весь текст трактовки виден целиком (просьба владелицы — без обрезания) */
  .prev { font-size: 0.86rem; color: var(--ink-faint); white-space: pre-wrap; }
</style>
