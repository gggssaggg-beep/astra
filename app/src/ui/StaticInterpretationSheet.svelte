<script lang="ts">
  /**
   * Детальная шторка МЕЖаспекта совмещённой карты (синастрия / транзит+натал) —
   * «как на главном экране», но для СТАТИЧНОГО аспекта: нет времени/окна/«когда
   * ещё» (снимок). Даёт: смысл взаимодействия пары (pairLore) + тон аспекта
   * (ASPECT_LORE) + свою трактовку (по сигнатуре), архетипы участников и действия
   * (чат с Claude, сообщество, отслеживание, заметка в журнал).
   */
  import { untrack } from 'svelte';
  import type { StaticAspect, Engine } from '../engine/index.ts';
  import { PLANET_GLYPH } from '../engine/index.ts';
  import { db, uid } from '../lib/db.ts';
  import { aspectSignature, transitSignature } from '../lib/signature.ts';
  import { ASPECT_LORE } from '../lib/lore.ts';
  import { ASPECT_GLOSS } from '../lib/glossary.ts';
  import Hint from './Hint.svelte';
  import { pairLore } from '../lib/pairLore.ts';
  import { pairAspectLore, SYNASTRY_FEEL } from '../lib/pairAspectLore.ts';
  import { transitSelfLore, transitFrameText, transitRhythm } from '../lib/transitSelfLore.ts';
  import { buildAstroPrompt } from '../lib/aiPrompt.ts';
  import PromptSheet from './PromptSheet.svelte';
  import { autogrow } from '../lib/autogrow.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { tap, success } from '../lib/haptics.ts';
  // общие блоки шторок трактовки (7б, UX-аудит #14) — те же в InterpretationSheet
  import AspectActions from './aspect/AspectActions.svelte';
  import ArchetypesBlock from './aspect/ArchetypesBlock.svelte';
  import AspectNoteBlock from './aspect/AspectNoteBlock.svelte';
  import SimilarNotes from './aspect/SimilarNotes.svelte';
  import OccurrenceSearch from './aspect/OccurrenceSearch.svelte';
  import SignContext from './aspect/SignContext.svelte';

  let { a, ownerA = null, ownerB = null, tz, win = null, engine = null, orbOf = null,
        lon1 = null, lon2 = null,
        anchor = null, source = null, ongoto = null, onclose, oncommunity }:
    { a: StaticAspect; ownerA?: string | null; ownerB?: string | null; tz: string;
      win?: { begin: Date; exact: Date; end: Date } | null;
      engine?: Engine | null; orbOf?: ((name: string) => number) | null;
      lon1?: number | null; lon2?: number | null;
      // «натив+транзит»: аспект строки — это транзитная планета (planet) к
      // НЕПОДВИЖНОМУ натальному градусу (lon) объекта a.p1. Поиск «когда ещё»
      // ищет именно это, а не два транзитных тела (жалоба владелицы 2026-07-09).
      anchor?: { lon: number; planet: string } | null;
      // «откуда» заметка: «Я+Саша 13.06.25» (собирает ChartsSheet по режиму карты)
      source?: string | null;
      ongoto?: ((d: Date) => void) | null;
      onclose: () => void;
      oncommunity?: (sig: string, title: string) => void } = $props();

  // окно транзитного аспекта (вход орбиса → точно → выход) — аспект это ИНТЕРВАЛ
  const fmtWin = (d: Date): string => new Intl.DateTimeFormat('ru-RU',
    { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);

  const sig = untrack(() => aspectSignature(a.p1, a.p2, a.aspect));
  const n1 = $derived(ownerA ? `${a.p1} (${ownerA})` : a.p1);
  const n2 = $derived(ownerB ? `${a.p2} (${ownerB})` : a.p2);
  const title = $derived(`${n1} ${a.aspect} ${n2}`);

  // «я + небо»: второе кольцо — транзит, а не второй человек
  const isTransit = $derived(ownerB === 'транзит');
  // транзитная планета к СВОЕЙ ЖЕ натальной (Марс ↔ Марс) — это фаза цикла
  // планеты, а НЕ пара двух людей (жалоба владелицы 2026-07-25)
  const selfTransit = $derived(isTransit && a.p1 === a.p2);

  // Корпус pairLore/pairAspectLore для ОДНОИМЁННЫХ пар написан под синастрию
  // («оба», «пара»). В транзите его не показываем — вместо него текст цикла.
  const pair = $derived(isTransit && a.p1 === a.p2 ? null : pairLore(a.p1, a.p2));
  const lore = $derived(ASPECT_LORE[a.aspect]);
  // уникальный текст «пара×аспект»; null у доп. объектов → старая связка ниже
  const unique = $derived(isTransit && a.p1 === a.p2 ? null : pairAspectLore(a.p1, a.p2, a.aspect));
  // транзит к своей же планете → текст фазы цикла; транзит к другой планете →
  // рамка «небо задевает твоё» перед общим смыслом пары
  const selfText = $derived(selfTransit ? transitSelfLore(a.p1, a.aspect) : null);
  const frame = $derived(isTransit && !selfTransit ? transitFrameText(a.p2, a.p1) : null);
  // это взаимодействие ДВУХ людей (синастрия/двойные карты)? → добавка «в паре»
  const twoPeople = $derived(!!ownerA && !!ownerB && ownerA !== ownerB && !isTransit);
  const feel = $derived(twoPeople ? SYNASTRY_FEEL[a.aspect] ?? null : null);
  // Блок «В транзите» (transitFeel) УБРАН 2026-07-27: он пересказывал общий
  // характер аспекта в третий раз. Сама функция в transitSelfLore.ts осталась —
  // пригодится, если корпус переработают.
  // «кто движется, тот и задаёт смысл» + ритм транзитной планеты (как часто
  // возвращается, сколько держится, бывают ли три прохода на ретро)
  const rhythm = $derived(isTransit ? transitRhythm(a.p2, a.p1) : null);
  // НАПРАВЛЕННАЯ сигнатура: p1 — натальная точка, p2 — транзитная планета.
  // По ней заметки «Марс(я)☌Солнце(транзит)» и «Солнце(я)☌Марс(транзит)»
  // больше не сваливаются в одну ленту.
  const dirSig = $derived(isTransit ? transitSignature(a.p1, a.p2, a.aspect) : null);
  // ОДИН текст трактовки — самый конкретный из доступных. Раньше подряд шли
  // шесть слоёв, и три из них пересказывали один и тот же аспект другими
  // словами: общий смысл аспекта («△ трин · Гармония…»), общий смысл пары
  // («Марс — Меркурий: ум и напор») и «В транзите». Владелица 2026-07-27:
  // «убрать вообще, это мусор» — НЕ прятать под «Подробнее», а удалить.
  // Общие тексты остаются ФОЛБЭКОМ: если уникального нет (доп. объекты,
  // непокрытые пары) — показываем смысл пары, иначе смысл аспекта.
  const mainText = $derived(selfText ?? unique ?? pair ?? lore?.text ?? '');

  // подпись блока и placeholder заметки — по контексту, без слова «пара» в транзите
  const blockLbl = $derived(isTransit ? 'Что происходит' : 'Взаимодействие');
  const notePlaceholder = $derived(isTransit ? 'Как проявился этот транзит…'
    : twoPeople ? 'Как проявилось в этой паре…' : 'Как проявилось…');

  let tracked = $state(!!db.tracked.all().find((t) => t.signature === sig));
  function toggleTrack(): void {
    const ex = db.tracked.all().find((t) => t.signature === sig);
    if (ex) db.tracked.remove(ex.id);
    else db.tracked.put({ id: uid(), p1: a.p1, p2: a.p2, aspect: a.aspect, signature: sig });
    tracked = !ex; tap();
  }

  // своя трактовка по сигнатуре (общая библиотека — как у транзитных аспектов)
  let interpText = $state(db.interpretations.get(sig)?.text ?? '');
  let interpSaved = $state(false);
  function saveInterp(): void {
    db.interpretations.put({ signature: sig, text: interpText.trim(), updatedAt: new Date().toISOString() });
    interpSaved = true; success();
    setTimeout(() => (interpSaved = false), 1600);
  }

  // «Промпт для любой ИИ» по этому межаспекту
  let showPrompt = $state(false);
  const promptText = $derived.by(() => buildAstroPrompt({
    kind: 'aspect',
    title: `аспект ${title}`,
    aspects: [`${n1} ${a.aspect} ${n2}, орбис ${a.orb.toFixed(2)}°`],
    focus: `${title}${pair ? ` — смысл пары: ${pair}` : ''}${unique ? `. Трактовка: ${unique}` : ''}`,
    extra: twoPeople
      ? 'Это межаспект двух людей (синастрия). Разбери, как он ощущается ВНУТРИ взаимодействия пары.'
      : selfTransit
      ? `Это транзит планеты к СВОЕМУ ЖЕ натальному положению (${a.p1}) — фаза цикла этой планеты у одного человека, НЕ пара людей. Разбери, что за период сейчас идёт и что с ним делать.`
      : isTransit
      ? `Это транзит: небесный ${a.p2} задевает натальный ${a.p1} ОДНОГО человека — временный период, не черта характера и не отношения двух людей.`
      : 'Разбери этот аспект: взаимодействие энергий через характер аспекта.',
  }));

  // закрытие: недописанная «своя трактовка» не должна пропасть при свайпе
  function handleClose(): void {
    const stored = db.interpretations.get(sig)?.text ?? '';
    if (interpText.trim() !== stored.trim()) saveInterp();
    onclose();
  }
</script>

<div class="backdrop sheet-backdrop" onclick={handleClose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Трактовка межаспекта" use:bottomSheet={{ onclose: handleClose }}>
  <header>
    <div class="ttl glyph">
      {PLANET_GLYPH[a.p1] ?? a.p1}<span class="asp">{a.symbol}</span>{PLANET_GLYPH[a.p2] ?? a.p2}
      <span class="names">{title}</span>
    </div>
    <div class="hbtns">
      <button class="star" class:on={tracked} onclick={toggleTrack} title="Отслеживать">{tracked ? '★' : '☆'}</button>
      <button class="x" onclick={handleClose} aria-label="Закрыть">✕</button>
    </div>
  </header>

  {#if win}
    <div class="exact">Орбис {a.orb.toFixed(2)}° · точно {fmtWin(win.exact)}</div>
    <div class="winrow">Окно аспекта: {fmtWin(win.begin)} → <b>точно {fmtWin(win.exact)}</b> → {fmtWin(win.end)}</div>
  {:else}
    <div class="exact">Орбис {a.orb.toFixed(2)}° ·
      {isTransit ? 'транзит к твоей карте' : ownerA === ownerB ? 'натальный аспект' : 'межаспект карт (вне времени)'}
      {#if ASPECT_GLOSS[a.aspect]}<Hint k={ASPECT_GLOSS[a.aspect]} />{/if}</div>
  {/if}

  <div class="block">
    <div class="lbl">{blockLbl}</div>
    <!-- Рамка (одна строка: это период, а не черта) + ОДИН текст трактовки.
         Общий смысл аспекта, общий смысл пары и «В транзите» УДАЛЕНЫ: три
         пересказа одного и того же («мусор», владелица 2026-07-27). Ритм
         транзита — ниже отдельным блоком: это не пересказ, а факты о сроках. -->
    {#if frame}<div class="ptext frame">{frame}</div>{/if}
    {#if mainText}<div class="ptext">{mainText}</div>{/if}
    {#if feel}
      <!-- «В паре» остаётся только в синастрии: там нет ни рамки, ни ритма,
           и это единственная добавка про взаимодействие двоих -->
      <div class="lbl xlbl">В паре</div>
      <div class="ptext">{feel}</div>
    {/if}
    {#if rhythm}
      <div class="lbl xlbl">Ритм этого транзита</div>
      <div class="ptext">{rhythm}</div>
    {/if}
    <textarea class="seamless" use:autogrow={interpText} bind:value={interpText} rows="2"
      placeholder={isTransit ? 'Своя трактовка этого аспекта — коснись и пиши, сохранится в Библиотеку…'
        : 'Своя трактовка этой пары — коснись и пиши, сохранится в Библиотеку…'}
      onchange={saveInterp}></textarea>
    {#if interpSaved}<div class="hint oksave">✓ Сохранено в библиотеку трактовок</div>{/if}
  </div>

  {#if lon1 != null && lon2 != null}
    <SignContext p1={a.p1} p2={a.p2} {lon1} {lon2} transit={isTransit} />
  {/if}

  <AspectActions {sig} {title} onprompt={() => (showPrompt = true)} {oncommunity} />

  <ArchetypesBlock p1={a.p1} p2={a.p2} />

  <!-- дата заметки: «сейчас» на момент сохранения (снимок вне дня) — дефолт блока -->
  <AspectNoteBlock p1={a.p1} p2={a.p2} {sig} {dirSig} placeholder={notePlaceholder} {source} />

  <SimilarNotes {sig} {dirSig} {tz} />

  {#if engine && ongoto}
    <OccurrenceSearch {engine} {tz} p1={a.p1} p2={a.p2} aspect={a.aspect}
      {orbOf} {anchor} {ownerA} {ongoto} />
  {/if}
</section>

{#if showPrompt}
  <PromptSheet text={promptText} onclose={() => (showPrompt = false)} />
{/if}

<style>
  /* геометрия/бэкдроп — глобальные .sheet-base/.sheet-backdrop (app.css); тут только z-index */
  .backdrop { z-index: 24; }
  .sheet { z-index: 25; }
  header { display: flex; align-items: center; justify-content: space-between; }
  .ttl { font-size: 1.4rem; display: flex; align-items: center; gap: 6px; }
  .asp { margin: 0 2px; opacity: 0.85; }
  .names { font-size: 0.86rem; color: var(--ink-dim); margin-left: 8px; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hbtns { display: flex; align-items: center; gap: 6px; }
  .star { background: transparent; border: none; font-size: 1.3rem; color: var(--ink-faint); }
  .star.on { color: var(--gold); text-shadow: 0 0 10px color-mix(in srgb, var(--gold) 70%, transparent); }
  .exact { color: var(--gold); font-size: 0.84rem; margin: 6px 0 2px; }
  .winrow { color: var(--ink-dim); font-size: 0.78rem; margin: 0 0 4px; }
  .winrow b { color: var(--gold); font-weight: 600; }
  .ptext { font-size: 0.92rem; margin-bottom: 8px; }
  /* рамка «небо задевает твоё» — тихая вводная строка перед смыслом пары */
  .ptext.frame { color: var(--ink-dim); font-size: 0.86rem; }
  .oksave { color: var(--gold); margin-top: 6px; }
  .block { padding: 12px 0; border-top: 1px solid var(--glass-brd); }
  .lbl { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); margin-bottom: 8px; }
  .xlbl { margin-top: 10px; }
  textarea { width: 100%; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 10px 12px; font: inherit; resize: vertical; }
  .hint { color: var(--ink-faint); font-size: 0.8rem; }
</style>
