<script lang="ts">
  /** «Похожие прошлые» — заметки журнала по сигнатуре аспекта (7б, #14).
   *  Живёт на собственной подписке onChange: заметка, добавленная соседним
   *  блоком (AspectNoteBlock → db.notes.put → persist → notify), появляется сразу.
   *  Заметку можно ПРАВИТЬ и УДАЛИТЬ прямо здесь (просьба владелицы 2026-07-25:
   *  «не могу удалить заметку к аспекту из описания транзита») — раньше за этим
   *  приходилось идти в Журнал. Удаление с «Вернуть», как в Журнале. */
  import { db, onChange } from '../../lib/db.ts';
  import { fmtRelDay } from '../../lib/format.ts';
  import type { JournalNote } from '../../lib/models.ts';
  import { tap, success } from '../../lib/haptics.ts';
  let { sig, tz }: { sig: string; tz: string } = $props();
  // db.notes.all() возвращает ТУ ЖЕ ссылку (мутируется на месте) → slice (Svelte 5)
  let notes = $state(db.notes.all().slice());
  $effect(() => onChange(() => (notes = db.notes.all().slice())));
  const similar = $derived(notes.filter((n) => n.aspectSignature === sig)
    .sort((a, b) => b.date.localeCompare(a.date)));
  const dmy = (s: string) => { const p = s.split('-'); return `${p[2]}.${p[1]}.${p[0]}`; };

  // правка на месте
  let editId = $state<string | null>(null);
  let editText = $state('');
  function startEdit(n: JournalNote): void { editId = n.id; editText = n.text; tap(); }
  function cancelEdit(): void { editId = null; editText = ''; }
  function saveEdit(n: JournalNote): void {
    const t = editText.trim(); if (!t) return;
    db.notes.put({ ...n, text: t, updatedAt: new Date().toISOString() });
    cancelEdit(); success();
  }

  // удаление с «Вернуть» (промах пальцем не уносит наблюдение навсегда)
  let deleted = $state<JournalNote | null>(null);
  let undoTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => () => { if (undoTimer) clearTimeout(undoTimer); });
  function del(n: JournalNote): void {
    if (editId === n.id) cancelEdit();
    deleted = n;
    db.notes.remove(n.id);
    tap();
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(() => (deleted = null), 6000);
  }
  function undo(): void {
    if (!deleted) return;
    db.notes.put(deleted); deleted = null; tap();
  }
</script>

<div class="block">
  <div class="lbl">Похожие прошлые ({similar.length})</div>
  {#if !similar.length}<div class="hint">По этой паре пока пусто — первая заметка появится здесь ✧</div>{/if}

  {#if deleted}
    <div class="undo">Запись удалена<button class="undobtn" onclick={undo}>Вернуть</button></div>
  {/if}

  {#each similar as n (n.id)}
    <div class="past">
      <div class="phead">
        <b title={dmy(n.date)}>{fmtRelDay(n.date, tz)}</b>
        {#if n.source}<span class="src" title="откуда сделана заметка">{n.source}</span>{/if}
        <span class="spacer"></span>
        {#if editId === n.id}
          <button class="mini ok" title="Сохранить" onclick={() => saveEdit(n)} disabled={!editText.trim()}>✓</button>
          <button class="mini" title="Отменить" onclick={cancelEdit}>✕</button>
        {:else}
          <button class="mini" title="Править" onclick={() => startEdit(n)}>✎</button>
          <button class="mini" title="Удалить" onclick={() => del(n)}>🗑</button>
        {/if}
      </div>
      {#if editId === n.id}
        <textarea class="nedit" bind:value={editText} rows="3"></textarea>
      {:else}
        <div class="ptext">{n.text}</div>
        {#if n.updatedAt}<div class="edited">изменено {fmtRelDay(n.updatedAt.slice(0, 10), tz)}</div>{/if}
      {/if}
    </div>
  {/each}
</div>

<style>
  .block { padding: 12px 0; border-top: 1px solid var(--glass-brd); }
  .lbl { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); margin-bottom: 8px; }
  .hint { color: var(--ink-faint); font-size: 0.8rem; }
  .past { padding: 6px 0; border-top: 1px solid var(--glass-brd); font-size: 0.9rem; }
  .past:first-of-type { border-top: none; }
  .phead { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
  .spacer { flex: 1; }
  .ptext { white-space: pre-wrap; }
  /* «откуда» заметка: «Я+Саша 13.06.25» — чтобы прошлые записи не путались */
  .src { color: var(--accent); font-size: 0.72rem; background: #ffffff10;
    border: 1px solid var(--glass-brd); border-radius: 999px; padding: 1px 8px; white-space: nowrap; }
  .edited { color: var(--ink-faint); font-size: 0.72rem; margin-top: 2px; }
  .mini { background: transparent; border: none; color: var(--ink-faint); font-size: 0.95rem;
    padding: 2px 4px; border-radius: 6px; }
  .mini:hover { color: var(--ink); background: #ffffff14; }
  .mini.ok { color: var(--gold); }
  .mini:disabled { opacity: 0.4; }
  .nedit { width: 100%; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 10px; padding: 8px 10px; font: inherit; resize: vertical; margin-top: 4px; }
  .undo { display: flex; align-items: center; justify-content: space-between; gap: 10px;
    background: #ffffff12; border: 1px solid var(--glass-brd); border-radius: 12px;
    padding: 9px 12px; margin-bottom: 8px; font-size: 0.88rem; color: var(--ink-dim); }
  .undobtn { background: transparent; border: none; color: var(--accent); font-weight: 600; }
</style>
