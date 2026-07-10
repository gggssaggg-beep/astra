<script lang="ts">
  /** «Астрология с нуля» — список 8 уроков (слой 2 обучалки). Прогресс durable
   *  в Settings.studyDone. Тап по уроку → openLesson (App рендерит LessonSheet
   *  поверх). Паттерн шторки — как в Библиотеке. */
  import { COURSE } from '../lib/course.ts';
  import { db } from '../lib/db.ts';
  import { openLesson } from '../lib/studyStore.svelte.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import { tap } from '../lib/haptics.ts';
  import GlowCard from './GlowCard.svelte';

  let { onclose }: { onclose: () => void } = $props();

  // slice/массив — реактивно перечитываем после «урок пройден» (onChange не нужен:
  // шторка курса не открыта во время урока, при возврате пересоздаётся derived)
  const done = $derived(new Set(db.settings.get().studyDone ?? []));
  // первый непройденный — на него чип «продолжить»
  const nextId = $derived(COURSE.find((l) => !done.has(l.id))?.id ?? null);

  function open(id: string): void { tap(); openLesson(id); }
</script>

<div class="backdrop sheet-backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Курс астрологии" use:bottomSheet={{ onclose }}>
  <header><h2>Астрология с нуля</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">Восемь коротких уроков — от колеса до чтения своей карты. У каждого — живое мини-задание по сегодняшнему небу.</div>

  {#each COURSE as l (l.id)}
    <GlowCard radius={14} onactivate={() => open(l.id)}>
      <button class="row reveal" use:reveal>
        <span class="ic glyph">{l.emoji}</span>
        <div class="txt"><b>{l.title}</b><small>{l.intro}</small></div>
        {#if done.has(l.id)}<span class="check" title="Пройден">✓</span>
        {:else if l.id === nextId}<span class="cont">продолжить</span>{/if}
        <span class="arr">→</span>
      </button>
    </GlowCard>
  {/each}
</section>

<style>
  .backdrop { z-index: 20; }
  .sheet { z-index: 21; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.84rem; margin: 4px 0 12px; }
  .row { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
    background: #ffffff0c; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 14px; padding: 14px; margin-bottom: 10px; }
  .row:hover { background: #ffffff16; }
  .ic { font-size: 1.4rem; width: 1.8rem; text-align: center; color: var(--gold); }
  .txt { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .txt b { font-family: var(--font-display); font-weight: 600; letter-spacing: 0.2px; }
  .txt small { color: var(--ink-faint); font-size: 0.78rem; }
  .check { color: var(--gold); font-weight: 700; font-size: 1.1rem; flex: none;
    text-shadow: 0 0 10px color-mix(in srgb, var(--gold) 55%, transparent); }
  .cont { flex: none; font-size: 0.68rem; color: var(--accent); background: #ffffff12;
    border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--glass-brd));
    border-radius: 999px; padding: 2px 9px; white-space: nowrap; }
  .arr { color: var(--ink-faint); flex: none; }
</style>
