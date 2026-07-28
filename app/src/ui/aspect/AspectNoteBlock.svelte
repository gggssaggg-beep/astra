<script lang="ts">
  /** «Заметка к этому аспекту» → журнал с тегами объектов и сигнатурой (7б, #14).
   *  Обновление «Похожих прошлых» — через db.put → notify (подписка SimilarNotes). */
  import { db, uid } from '../../lib/db.ts';
  import { noteDateStr } from '../../lib/journal.ts';
  import { success } from '../../lib/haptics.ts';
  let { p1, p2, sig, dirSig = null, date = null,
        placeholder = 'Как проявилось сегодня…', source = null }:
    { p1: string; p2: string; sig: string;
      // направленная сигнатура транзита («н:Марс|т:Солнце|соединение») — чтобы
      // заметка легла именно к ЭТОМУ транзиту, а не к обратному
      dirSig?: string | null;
      // дата записи: день экрана (транзитный аспект) или null = «сейчас» НА МОМЕНТ
      // сохранения (статичный снимок — как было в StaticInterpretationSheet)
      date?: Date | null; placeholder?: string;
      // ОТКУДА заметка: «Я+Пётр 13.06.25» / «Небо 13.06.25» (просьба 2026-07-25)
      source?: string | null } = $props();
  let noteText = $state('');
  let savedOk = $state(false);          // «✓ В журнале» — видно, что запись легла
  function addNote(): void {
    const t = noteText.trim(); if (!t) return;
    db.notes.put({ id: uid(), createdAt: new Date().toISOString(), date: noteDateStr(date ?? new Date()),
      text: t, objects: [p1, p2], aspectSignature: sig,
      transitSignature: dirSig ?? undefined, source: source ?? undefined });
    noteText = ''; success();
    savedOk = true; setTimeout(() => (savedOk = false), 1600);
  }
</script>

<div class="block">
  <div class="lbl">Заметка к этому аспекту</div>
  <textarea bind:value={noteText} rows="2" {placeholder}></textarea>
  <div class="row"><span class="hint">Сохранится в журнал с привязкой к этому аспекту{#if source} · <b>{source}</b>{/if}.</span>
    <button class="btn" class:okflash={savedOk} onclick={addNote} disabled={!noteText.trim() && !savedOk}>
      {savedOk ? '✓ В журнале' : 'В журнал'}</button></div>
</div>

<style>
  .block { padding: 12px 0; border-top: 1px solid var(--glass-brd); }
  .lbl { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); margin-bottom: 8px; }
  textarea { width: 100%; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 10px 12px; font: inherit; resize: vertical; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; }
  .hint { color: var(--ink-faint); font-size: 0.8rem; }
  .btn { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 9px 16px; font-size: 0.9rem; }
  .btn:disabled { opacity: 0.5; }
  .okflash { background: var(--gold) !important; color: #201a08 !important; }
</style>
