<script lang="ts">
  import { untrack } from 'svelte';
  import type { AspectRecord, Engine } from '../engine/index.ts';
  import { PLANET_GLYPH } from '../engine/index.ts';
  import { db, uid } from '../lib/db.ts';
  import { aspectSignature } from '../lib/signature.ts';
  import { ASPECT_LORE } from '../lib/lore.ts';
  import { pairLore } from '../lib/pairLore.ts';
  import { pairAspectLore } from '../lib/pairAspectLore.ts';
  import { buildAstroPrompt } from '../lib/aiPrompt.ts';
  import PromptSheet from './PromptSheet.svelte';
  import { fmtTime } from '../lib/format.ts';
  import { autogrow } from '../lib/autogrow.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { tap, success } from '../lib/haptics.ts';
  // общие блоки шторок трактовки (7б, UX-аудит #14) — те же в StaticInterpretationSheet
  import AspectActions from './aspect/AspectActions.svelte';
  import ArchetypesBlock from './aspect/ArchetypesBlock.svelte';
  import AspectNoteBlock from './aspect/AspectNoteBlock.svelte';
  import SimilarNotes from './aspect/SimilarNotes.svelte';
  import OccurrenceSearch from './aspect/OccurrenceSearch.svelte';
  import SignContext from './aspect/SignContext.svelte';
  import Hint from './Hint.svelte';

  let { rec, engine, date, tz, orbOf, onclose, ongoto, oncommunity }:
    { rec: AspectRecord; engine: Engine; date: Date; tz: string;
      orbOf?: (name: string) => number; onclose: () => void;
      ongoto?: (d: Date) => void;
      oncommunity?: (sig: string, title: string) => void } = $props();

  const sig = untrack(() => aspectSignature(rec.p1, rec.p2, rec.aspect));

  let tracked = $state(!!db.tracked.all().find((t) => t.signature === sig));
  function toggleTrack() {
    const ex = db.tracked.all().find((t) => t.signature === sig);
    if (ex) db.tracked.remove(ex.id);
    else db.tracked.put({ id: uid(), p1: rec.p1, p2: rec.p2, aspect: rec.aspect, signature: sig });
    tracked = !ex;
    tap();
  }

  // --- Трактовка (краткая общая + СВОЯ, сохраняется в библиотеку по сигнатуре) ---
  const lore = $derived(ASPECT_LORE[rec.aspect]);
  const pair = $derived(pairLore(rec.p1, rec.p2));   // смысл пары планет (не только тип аспекта)
  // УНИКАЛЬНЫЙ текст «пара×аспект» (Марс⚹Венера ≠ Марс☌Венера); null у доп. объектов
  const unique = $derived(pairAspectLore(rec.p1, rec.p2, rec.aspect));
  let interpText = $state(db.interpretations.get(sig)?.text ?? '');
  let interpSaved = $state(false);
  function saveInterp() {
    db.interpretations.put({ signature: sig, text: interpText.trim(), updatedAt: new Date().toISOString() });
    interpSaved = true; success();
    setTimeout(() => (interpSaved = false), 1600);
  }

  // «Промпт для любой ИИ» по этому аспекту дня — тот же корректный контекст
  let showPrompt = $state(false);
  const promptText = $derived.by(() => buildAstroPrompt({
    kind: 'aspect',
    title: `аспект ${rec.p1} ${rec.aspect} ${rec.p2}`,
    aspects: [`${rec.p1} ${rec.aspect} ${rec.p2}, орбис ${rec.exactOrb.toFixed(2)}°`
      + (rec.exactTime ? `, точно ${fmtTime(rec.exactTime, tz)}` : '')],
    focus: `${rec.p1} ${rec.aspect} ${rec.p2}${pair ? ` — смысл пары: ${pair}` : ''}`
      + (unique ? `. Трактовка сочетания: ${unique}` : ''),
    extra: 'Разбери этот аспект: как энергии участников взаимодействуют через характер аспекта, как это проживается, на что обратить внимание.',
  }));

  // закрытие (свайп/бекдроп/✕): недописанная «своя трактовка» не должна пропасть —
  // textarea сохраняется по blur, но свайп-закрытие blur не гарантирует
  function handleClose() {
    const stored = db.interpretations.get(sig)?.text ?? '';
    if (interpText.trim() !== stored.trim()) saveInterp();
    onclose();
  }
</script>

<div class="backdrop sheet-backdrop" onclick={handleClose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Трактовка аспекта" use:bottomSheet={{ onclose: handleClose }}>
  <header>
    <div class="title glyph">
      {PLANET_GLYPH[rec.p1] ?? rec.p1}<span class="asp">{rec.symbol}</span>{PLANET_GLYPH[rec.p2] ?? rec.p2}
      <span class="names">{rec.p1} {rec.aspect} {rec.p2}</span>
    </div>
    <div class="hbtns">
      <button class="star" class:on={tracked} onclick={toggleTrack} title="Отслеживать">{tracked ? '★' : '☆'}</button>
      <button class="x" onclick={handleClose} aria-label="Закрыть">✕</button>
    </div>
  </header>

  {#if rec.exactTime}<div class="exact">Точно: {fmtTime(rec.exactTime, tz)} · орбис {rec.exactOrb.toFixed(2)}° <Hint k="aspect-window" /></div>
  {:else}<div class="exact">Пара и аспект без привязки ко дню — общий разбор</div>{/if}

  <div class="block">
    <div class="lbl">Трактовка</div>
    {#if unique}
      <!-- уникальный текст ИМЕННО этого сочетания — первым (жалоба: типовая
           строка аспекта жирным заголовком читалась как «трин, трин, трин») -->
      <div class="ptext">{unique}</div>
      {#if lore}<div class="ltext">{lore.symbol} {rec.aspect} · {lore.short}</div>{/if}
      {#if pair}<div class="ltext">{rec.p1} — {rec.p2}: {pair}</div>{/if}
    {:else}
      {#if pair}<div class="ptext">{rec.p1} — {rec.p2}: {pair}</div>{/if}
      {#if lore}
        <div class="lshort">{lore.symbol} {lore.short}</div>
        <div class="ltext">{lore.text}</div>
      {/if}
    {/if}
    <!-- «неявный» ввод: без коробки, растёт под текст, курсор показывает правку -->
    <textarea class="seamless" use:autogrow={interpText} bind:value={interpText} rows="2"
      placeholder="Своя трактовка этой пары — коснись и пиши, сохранится в Библиотеку…"
      onchange={saveInterp}></textarea>
    {#if interpSaved}<div class="hint oksave">✓ Сохранено в библиотеку трактовок</div>{/if}
  </div>

  <!-- ЭТОТ конкретный аспект: участники в своих знаках на момент точного -->
  <SignContext p1={rec.p1} p2={rec.p2} lon1={rec.pos1} lon2={rec.pos2} />

  <AspectActions {sig} title={`${rec.p1} ${rec.aspect} ${rec.p2}`}
    onprompt={() => (showPrompt = true)} {oncommunity} />

  <ArchetypesBlock p1={rec.p1} p2={rec.p2} />

  <AspectNoteBlock p1={rec.p1} p2={rec.p2} {sig} {date} />

  <SimilarNotes {sig} {tz} />

  <OccurrenceSearch {engine} {tz} p1={rec.p1} p2={rec.p2} aspect={rec.aspect}
    {orbOf} fallbackOrb={rec.exactOrb || 1} {ongoto} />
</section>

{#if showPrompt}
  <PromptSheet text={promptText} onclose={() => (showPrompt = false)} />
{/if}

<style>
  /* геометрия/бэкдроп — глобальные .sheet-base/.sheet-backdrop (app.css); тут только z-index */
  .backdrop { z-index: 22; }
  .sheet { z-index: 23; }
  header { display: flex; align-items: center; justify-content: space-between; }
  .title { font-size: 1.4rem; display: flex; align-items: center; gap: 6px; }
  .asp { margin: 0 2px; opacity: 0.85; }
  .names { font-size: 0.86rem; color: var(--ink-dim); margin-left: 8px; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hbtns { display: flex; align-items: center; gap: 6px; }
  .star { background: transparent; border: none; font-size: 1.3rem; color: var(--ink-faint); }
  .star.on { color: var(--gold); animation: starpop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
    text-shadow: 0 0 10px color-mix(in srgb, var(--gold) 70%, transparent); }
  @keyframes starpop { 0% { transform: scale(1); } 45% { transform: scale(1.35); } 100% { transform: scale(1); } }
  .exact { color: var(--gold); font-size: 0.84rem; margin: 6px 0 2px; }
  .ptext { font-size: 0.92rem; margin-bottom: 8px; }
  .lshort { font-weight: 600; margin-bottom: 4px; }
  .ltext { font-size: 0.88rem; color: var(--ink-dim); margin-bottom: 10px; }
  .oksave { color: var(--gold); margin-top: 6px; }
  .block { padding: 12px 0; border-top: 1px solid var(--glass-brd); }
  .lbl { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); margin-bottom: 8px; }
  textarea { width: 100%; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 10px 12px; font: inherit; resize: vertical; }
  .hint { color: var(--ink-faint); font-size: 0.8rem; }
</style>
