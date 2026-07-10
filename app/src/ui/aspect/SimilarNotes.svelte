<script lang="ts">
  /** «Похожие прошлые» — заметки журнала по сигнатуре аспекта (7б, #14).
   *  Живёт на собственной подписке onChange: заметка, добавленная соседним
   *  блоком (AspectNoteBlock → db.notes.put → persist → notify), появляется сразу. */
  import { db, onChange } from '../../lib/db.ts';
  import { fmtRelDay } from '../../lib/format.ts';
  let { sig, tz }: { sig: string; tz: string } = $props();
  // db.notes.all() возвращает ТУ ЖЕ ссылку (мутируется на месте) → slice (Svelte 5)
  let notes = $state(db.notes.all().slice());
  $effect(() => onChange(() => (notes = db.notes.all().slice())));
  const similar = $derived(notes.filter((n) => n.aspectSignature === sig)
    .sort((a, b) => b.date.localeCompare(a.date)));
  const dmy = (s: string) => { const p = s.split('-'); return `${p[2]}.${p[1]}.${p[0]}`; };
</script>

<div class="block">
  <div class="lbl">Похожие прошлые ({similar.length})</div>
  {#if !similar.length}<div class="hint">По этой паре пока пусто — первая заметка появится здесь ✧</div>{/if}
  {#each similar as n (n.id)}
    <div class="past"><b title={dmy(n.date)}>{fmtRelDay(n.date, tz)}</b><div>{n.text}</div></div>
  {/each}
</div>

<style>
  .block { padding: 12px 0; border-top: 1px solid var(--glass-brd); }
  .lbl { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); margin-bottom: 8px; }
  .hint { color: var(--ink-faint); font-size: 0.8rem; }
  .past { padding: 6px 0; border-top: 1px solid var(--glass-brd); font-size: 0.9rem; }
  .past:first-of-type { border-top: none; }
</style>
