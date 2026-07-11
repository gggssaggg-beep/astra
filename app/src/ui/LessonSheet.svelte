<script lang="ts">
  /** Один урок курса (слой 2). Блоки: текст / чипы-«?» / аккордеон готового
   *  текста / кнопка «открой сам». Мини-задание строится по ЖИВОМУ небу дня
   *  (positions на «сейчас» + аспекты дня из общего кэша). «Урок пройден»
   *  пишет studyDone (durable) и ведёт к следующему непройденному. */
  import type { Engine, BodyPosition, AspectRecord } from '../engine/index.ts';
  import { COURSE, lesson as findLesson } from '../lib/course.ts';
  import type { GlossSheet } from '../lib/glossary.ts';
  import { db } from '../lib/db.ts';
  import { openGloss, openLesson, closeLesson } from '../lib/studyStore.svelte.ts';
  import { gloss } from '../lib/glossary.ts';
  import { aspectsOnCached } from '../lib/dayCache.ts';
  import { zonedDayStartUTC } from '../lib/format.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import { tap, success } from '../lib/haptics.ts';
  import Wheel from './Wheel.svelte';
  import LessonVisual from './LessonVisual.svelte';
  import { glyphStyle } from '../lib/glyphStyle.svelte.ts';

  let { lessonId, engine, date, tz, objects, orbOf, onnavigate }:
    { lessonId: string; engine: Engine; date: Date; tz: string;
      objects?: string[]; orbOf: (name: string) => number;
      onnavigate?: (target: GlossSheet) => void } = $props();

  const lesson = $derived(findLesson(lessonId));

  // живое небо для квиза: позиции на «сейчас», аспекты дня из общего кэша (WASM
  // не пересчитывается). Если движка нет — пустые, build вернёт null → квиз скрыт.
  const ctx = $derived.by<{ positions: BodyPosition[]; aspects: AspectRecord[] }>(() => {
    try {
      const positions = engine.positions(new Date(), objects ?? undefined);
      const day = aspectsOnCached(engine, zonedDayStartUTC(date, tz), orbOf, objects);
      return { positions, aspects: [...day.moon, ...day.fast, ...day.slow] };
    } catch { return { positions: [], aspects: [] }; }
  });
  const quiz = $derived(lesson?.quiz ? lesson.quiz.build(ctx) : null);

  let picked = $state<number | null>(null);
  // смена урока НЕ пересоздаёт компонент (меняется только lessonId) — без сброса
  // ответ прошлого квиза оставался «нажатым» в следующем уроке (жалоба №6)
  $effect(() => { void lessonId; picked = null; });
  function pick(i: number): void {
    if (picked !== null || !quiz) return;
    picked = i;
    if (i === quiz.correct) success(); else tap();
  }

  // пересчитывать на смену урока — иначе кнопка «Урок пройден» показывала
  // состояние урока, с которого шторку открыли
  const doneSet = $derived.by(() => {
    void lessonId;
    return new Set(db.settings.get().studyDone ?? []);
  });
  function complete(): void {
    if (lesson && !doneSet.has(lesson.id)) {
      const next = [...(db.settings.get().studyDone ?? []), lesson.id];
      db.settings.set({ ...db.settings.get(), studyDone: next });
    }
    success();
    // следующий непройденный урок → открыть его; иначе закрыть (вернуться в курс)
    const done = new Set(db.settings.get().studyDone ?? []);
    const nextL = COURSE.find((l) => !done.has(l.id));
    if (nextL) openLesson(nextL.id); else closeLesson();
  }
</script>

<div class="backdrop sheet-backdrop" onclick={closeLesson} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Урок" use:bottomSheet={{ onclose: closeLesson }}>
  {#if lesson}
    <header>
      <div class="ttl"><span class="em">{lesson.emoji}</span><h2>{lesson.title}</h2></div>
      <button class="x" onclick={closeLesson} aria-label="Закрыть">✕</button>
    </header>
    <p class="intro">{lesson.intro}</p>

    {#each lesson.blocks as b}
      <div class="block reveal" use:reveal>
        {#if b.text}<p class="btext">{b.text}</p>{/if}
        {#if b.visual}<LessonVisual type={b.visual} />{/if}
        {#if b.glossKeys?.length}
          <div class="chips">
            {#each b.glossKeys as k}
              {#if gloss(k)}<button class="chip" onclick={() => { tap(); openGloss(k); }}>{gloss(k)?.title} <span class="q">?</span></button>{/if}
            {/each}
          </div>
        {/if}
        {#if b.loreRef}
          <details class="lore">
            <summary>{b.loreRef.label}<span class="arr">▸</span></summary>
            <div class="ltext">{b.loreRef.text()}</div>
          </details>
        {/if}
        {#if b.go}
          {@const go = b.go}
          <button class="go" onclick={() => onnavigate?.(go.target)}>{go.label} →</button>
        {/if}
      </div>
    {/each}

    {#if quiz}
      <div class="quiz block">
        <div class="qlbl">Мини-задание</div>
        <div class="q">{quiz.q}</div>
        {#if quiz.wheel}
          <!-- вопрос «про колесо» → живое колесо ПРЯМО в вопросе (№7: раньше
               приходилось сворачивать три шторки, чтобы взглянуть на небо) -->
          <div class="qwheel"><Wheel positions={ctx.positions} signStyle={glyphStyle.v} /></div>
        {/if}
        <div class="opts">
          {#each quiz.options as opt, i}
            <button class="opt" class:right={picked !== null && i === quiz.correct}
              class:wrong={picked === i && i !== quiz.correct}
              disabled={picked !== null} onclick={() => pick(i)}>{opt}</button>
          {/each}
        </div>
        {#if picked !== null}
          <div class="verdict">{picked === quiz.correct ? '✓ Верно!' : 'Не совсем — верный вариант подсвечен.'}</div>
        {/if}
      </div>
    {/if}

    <button class="done" onclick={complete}>
      {doneSet.has(lesson.id) ? 'Готово' : 'Урок пройден →'}</button>
  {/if}
</section>

<style>
  .backdrop { z-index: 22; }   /* поверх шторки курса (20/21) */
  .sheet { z-index: 23; }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .ttl { display: flex; align-items: center; gap: 10px; }
  .em { font-size: 1.5rem; }
  h2 { margin: 0; font-size: 1.15rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .intro { color: var(--ink-dim); font-size: 0.94rem; line-height: 1.5; margin: 10px 0 4px; }
  .block { padding: 12px 0; border-top: 1px solid var(--glass-brd); }
  .btext { margin: 0; color: var(--ink-dim); line-height: 1.6; font-size: 0.94rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; background: #ffffff10;
    border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 999px;
    padding: 5px 11px; font-size: 0.8rem; }
  .chip .q { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px;
    border-radius: 50%; background: var(--accent); color: var(--on-accent); font-size: 0.62rem; font-weight: 700; }
  details.lore { margin-top: 10px; }
  details.lore summary { list-style: none; cursor: pointer; display: flex; align-items: center;
    justify-content: space-between; gap: 8px; background: #ffffff0c; border: 1px solid var(--glass-brd);
    border-radius: 12px; padding: 11px 14px; font-size: 0.9rem; font-weight: 600; color: var(--ink); }
  details.lore summary::-webkit-details-marker { display: none; }
  details.lore .arr { color: var(--ink-faint); transition: transform 0.2s ease; }
  details.lore[open] summary .arr { transform: rotate(90deg); }
  .ltext { margin-top: 8px; padding: 12px 14px; background: #ffffff08; border: 1px solid var(--glass-brd);
    border-radius: 12px; color: var(--ink-dim); line-height: 1.55; font-size: 0.9rem; white-space: pre-wrap; }
  .go { display: inline-block; margin-top: 12px; background: var(--accent); border: none; color: var(--on-accent);
    font-weight: 600; border-radius: 12px; padding: 10px 16px; font-size: 0.9rem; }
  .qlbl { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px; color: var(--accent); font-weight: 600; margin-bottom: 8px; }
  .qwheel { margin: 2px 0 12px; }
  .quiz .q { font-size: 0.98rem; margin-bottom: 12px; }
  .opts { display: flex; flex-direction: column; gap: 8px; }
  .opt { text-align: left; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 12px 14px; font-size: 0.92rem; }
  .opt.right { background: color-mix(in srgb, var(--gold) 22%, transparent); border-color: var(--gold); color: var(--ink); }
  .opt.wrong { background: color-mix(in srgb, var(--rose) 20%, transparent); border-color: var(--rose); }
  .opt:disabled { opacity: 1; }
  .verdict { margin-top: 10px; color: var(--ink-dim); font-size: 0.88rem; }
  .done { display: block; width: 100%; margin-top: 18px; background: var(--accent); border: none;
    color: var(--on-accent); font-weight: 600; font-size: 1rem; border-radius: 14px; padding: 13px; }
</style>
