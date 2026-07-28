<script lang="ts">
  /** Окно «Промпт для любой ИИ»: показывает готовый полный промпт и даёт его
   *  скопировать (для ChatGPT/Gemini/др. — работа с картой на любом сервисе). */
  import { bottomSheet } from '../lib/sheet.ts';
  import { success, tap } from '../lib/haptics.ts';
  import { autogrow } from '../lib/autogrow.ts';
  import { FOCUS_OPTIONS, focusBlock, type FocusId } from '../lib/aiPrompt.ts';
  import Hint from './Hint.svelte';

  let { text, vedic = false, onclose }: { text: string; vedic?: boolean; onclose: () => void } = $props();

  // Фокус вопроса (2026-07-26): расчёт тот же, меняется только задача разбора.
  // По умолчанию «Общий» — промпт ровно такой, каким был раньше.
  let focus = $state<FocusId>('general');
  let question = $state('');
  const full = $derived(text + focusBlock(focus, question, vedic));
  function pickFocus(id: FocusId): void { focus = id; tap(); }

  let copied = $state(false);
  async function copy(): Promise<void> {
    try { await navigator.clipboard.writeText(full); }
    catch {
      // фолбэк для старых WebView без Clipboard API
      const ta = document.createElement('textarea');
      ta.value = full; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* совсем никак */ }
      ta.remove();
    }
    copied = true; success();
    setTimeout(() => (copied = false), 1800);
  }
</script>

<div class="backdrop sheet-backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Промпт для ИИ" use:bottomSheet={{ onclose }}>
  <header><h2>Промпт для любой ИИ</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">Полный корректный промпт с данными этой карты. Скопируй и вставь
    в ChatGPT, Gemini или другой ИИ — расчёт уже сделан, останется трактовать.</div>

  <div class="focus">
    <div class="flabel">Фокус разбора <Hint k="ai-prompt" /></div>
    <div class="chips">
      {#each FOCUS_OPTIONS as f}
        <button class="chip" class:on={focus === f.id} onclick={() => pickFocus(f.id)}>{f.label}</button>
      {/each}
    </div>
    <div class="fhint">{FOCUS_OPTIONS.find((f) => f.id === focus)!.hint}</div>
    {#if focus === 'custom'}
      <textarea class="q" rows="2" use:autogrow bind:value={question}
        placeholder="Например: стоит ли сейчас начинать разговор?"></textarea>
    {/if}
  </div>

  <button class="btn primary copy" onclick={copy}>{copied ? '✓ Скопировано' : '📋 Скопировать промпт'}</button>
  <pre class="promptbox">{full}</pre>
</section>

<style>
  /* геометрия/бэкдроп — глобальные .sheet-base/.sheet-backdrop (app.css); тут только z-index */
  .backdrop { z-index: 28; }
  .sheet { z-index: 29; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.82rem; margin: 6px 0 10px; }
  /* Фокус разбора — чипы как в остальных шторках (обводка по теме, активный акцентом) */
  .focus { margin-bottom: 12px; }
  .flabel { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 1px;
    color: var(--ink-faint); margin-bottom: 6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { background: #ffffff08; border: 1px solid var(--glass-brd); color: var(--ink-dim);
    border-radius: 999px; padding: 6px 12px; font-size: 0.85rem; white-space: nowrap; }
  .chip.on { background: color-mix(in srgb, var(--accent) 18%, transparent);
    border-color: var(--accent); color: var(--accent); }
  .fhint { color: var(--ink-faint); font-size: 0.76rem; margin-top: 6px; }
  .q { width: 100%; margin-top: 8px; background: #ffffff0a; color: var(--ink);
    border: 1px solid var(--glass-brd); border-radius: 12px; padding: 10px 12px;
    font: inherit; font-size: 0.9rem; resize: none; }
  .btn.primary { background: var(--accent); border: none; color: var(--on-accent); font-weight: 600;
    border-radius: 14px; padding: 12px; width: 100%; margin-bottom: 12px; }
  .promptbox { white-space: pre-wrap; word-break: break-word; font-family: var(--font-mono);
    font-size: 0.78rem; line-height: 1.5; color: var(--ink-dim); background: #ffffff0a;
    border: 1px solid var(--glass-brd); border-radius: 12px; padding: 12px; margin: 0; }
</style>
