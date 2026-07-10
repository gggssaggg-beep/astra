<script lang="ts">
  /** «Управители домов» — три ряда чипов для поиска по комбинаторикам:
   *  дом N → знак на куспиде → управитель в доме M → текст из dispositorLore.
   *  Активный чип подсвечен через --accent/--gold; фокус-рамок нет (правило проекта). */
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import GlowCard from './GlowCard.svelte';
  import { HOUSE_SIGN, SIGN_DEITY, SIGN_RULER, dispositorLore } from '../lib/dispositorLore.ts';
  import { SIGN_GLYPH, ZODIAC } from '../engine/index.ts';
  import { HOUSE_THEME } from '../lib/houseThemes.ts';

  let { onclose }: { onclose: () => void } = $props();

  const HOUSES = Array.from({ length: 12 }, (_, i) => i + 1);
  const signs = ZODIAC as readonly string[];

  // Состояние трёх рядов чипов
  let selHouse = $state(1);
  let selSign = $state(HOUSE_SIGN[1]);
  let selRulerHouse = $state(1);

  // При смене «Дома N» знак сбрасывается на символический дефолт
  function pickHouse(h: number): void {
    selHouse = h;
    selSign = HOUSE_SIGN[h];
  }

  // Производные — собирают заголовок и подзаголовок карточки
  const ruler = $derived(SIGN_RULER[selSign] ?? '—');
  const deitySign = $derived(SIGN_DEITY[selSign] ?? '');
  const deityHouse = $derived(SIGN_DEITY[HOUSE_SIGN[selRulerHouse]] ?? '');
  const houseTheme = $derived(HOUSE_THEME[selHouse] ?? '');
  const loreText = $derived(dispositorLore(selSign, selRulerHouse));
</script>

<div class="backdrop sheet-backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Управители домов" use:bottomSheet={{ onclose }}>
  <header><h2>Управители домов</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">У знака на «двери» дома (куспиде) есть планета-хозяин — управитель; дом, где она
    стоит, показывает, через что человек живёт эту сферу. Выбери дом, знак на куспиде и дом
    положения управителя — увидишь трактовку архетипа.</div>

  <!-- Ряд 1: чей управитель ищем (Дом N) -->
  <div class="row-label">Дом</div>
  <div class="chips-row">
    {#each HOUSES as h (h)}
      <button class="chip" class:active={selHouse === h} onclick={() => pickHouse(h)}>{h}</button>
    {/each}
  </div>

  <!-- Ряд 2: знак на куспиде этого дома (дефолт = символический знак) -->
  <div class="row-label">Знак на куспиде</div>
  <div class="chips-row">
    {#each signs as sign, i (sign)}
      <button class="chip glyph" class:active={selSign === sign}
        onclick={() => { selSign = sign; }}
        title={sign}>{SIGN_GLYPH[i]}</button>
    {/each}
  </div>

  <!-- Ряд 3: в каком доме стоит управитель -->
  <div class="row-label">Управитель в доме</div>
  <div class="chips-row">
    {#each HOUSES as h (h)}
      <button class="chip" class:active={selRulerHouse === h} onclick={() => { selRulerHouse = h; }}>{h}</button>
    {/each}
  </div>

  <!-- Карточка-результат — всегда видна, текст обновляется реактивно -->
  <GlowCard radius={14}>
    <div class="card reveal" use:reveal>
      <p class="card-title">Управитель {selHouse} дома — {ruler}</p>
      <p class="card-sub">{deitySign} в {selRulerHouse}-м доме — чертоги {deityHouse};<br>дела дома: {houseTheme}</p>
      <p class="card-text">{loreText ?? 'текст готовится…'}</p>
    </div>
  </GlowCard>
</section>

<style>
  /* геометрия/бэкдроп — глобальные .sheet-base/.sheet-backdrop (app.css); тут только z-index */
  .backdrop { z-index: 26; }
  .sheet { z-index: 27; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.82rem; margin: 6px 0 12px; }

  /* Ряды чипов */
  .row-label { font-size: 0.72rem; color: var(--ink-faint); margin: 12px 0 5px;
    text-transform: uppercase; letter-spacing: 0.6px; }
  .chips-row { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px;
    scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .chips-row::-webkit-scrollbar { display: none; }
  /* компактный чип: обводка по теме, активный — акцент без рамки фокуса */
  .chip { flex: none; background: #ffffff08; border: 1px solid var(--glass-brd);
    color: var(--ink-dim); border-radius: 999px; padding: 5px 12px;
    font-size: 0.85rem; white-space: nowrap; }
  .chip.glyph { padding: 5px 10px; font-size: 1.05rem; }
  .chip.active { background: color-mix(in srgb, var(--accent) 18%, transparent);
    border-color: var(--accent); color: var(--accent); }

  /* Карточка результата */
  .card { background: #ffffff0a; border: 1px solid var(--glass-brd); border-radius: 14px;
    padding: 14px 16px; margin-top: 16px; }
  .card-title { font-family: var(--font-display); font-weight: 600; font-size: 1.0rem;
    color: var(--gold); margin: 0 0 6px; }
  .card-sub { color: var(--ink-dim); font-size: 0.82rem; margin: 0 0 10px; line-height: 1.45; }
  .card-text { color: var(--ink-dim); font-size: 0.88rem; line-height: 1.55; margin: 0; }
</style>
