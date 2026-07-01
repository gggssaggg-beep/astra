<script lang="ts">
  import { db, uid, onChange } from '../lib/db.ts';
  import { noteDateStr, filterNotes, type Period } from '../lib/journal.ts';
  import type { JournalNote } from '../lib/models.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import GlowCard from './GlowCard.svelte';
  import ScrollThread from './ScrollThread.svelte';

  let { date, onclose }: { date: Date; onclose: () => void } = $props();
  let sheetEl = $state<HTMLElement | null>(null);

  const OBJ = ['Луна', 'Солнце', 'Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Раху', 'Кету'];
  const PERIODS: [Period, string][] = [['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц'], ['all', 'Всё']];

  // db.notes.all() возвращает ТУ ЖЕ ссылку на массив; put() мутирует её на месте.
  // Чтобы Svelte 5 ($state/$derived) увидел изменение — отдаём НОВЫЙ массив (slice).
  let notes = $state<JournalNote[]>(db.notes.all().slice());
  const refresh = () => (notes = db.notes.all().slice());
  $effect(() => onChange(refresh));

  let text = $state('');
  let sel = $state<Set<string>>(new Set());
  let period = $state<Period>('day');
  let planet = $state('');
  let cmp = $state<Set<string>>(new Set());

  const list = $derived(filterNotes(notes, date, period, planet));
  const cmpList = $derived(list.filter((n) => cmp.has(n.id)));
  const dmy = (s: string) => { const p = s.split('-'); return `${p[2]}.${p[1]}.${p[0]}`; };

  function toggleObj(o: string) { const s = new Set(sel); s.has(o) ? s.delete(o) : s.add(o); sel = s; }
  function toggleCmp(id: string) { const c = new Set(cmp); c.has(id) ? c.delete(id) : c.add(id); cmp = c; }
  function save() {
    const t = text.trim(); if (!t) return;
    db.notes.put({ id: uid(), createdAt: new Date().toISOString(), date: noteDateStr(date), text: t, objects: [...sel] });
    text = ''; sel = new Set(); refresh();
  }
  function del(id: string) { db.notes.remove(id); const c = new Set(cmp); c.delete(id); cmp = c; refresh(); }
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<ScrollThread target={sheetEl} zIndex={22} />
<section class="sheet glass" aria-label="Журнал" use:bottomSheet={{ onclose }} bind:this={sheetEl}>
  <header><h2>Бортовой журнал</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>

  <div class="add">
    <textarea bind:value={text} rows="2" placeholder="Наблюдение за {dmy(noteDateStr(date))}…"></textarea>
    <div class="chips">
      {#each OBJ as o}
        <button class="chip glyph" class:on={sel.has(o)} onclick={() => toggleObj(o)}>{o}</button>
      {/each}
    </div>
    <div class="addrow">
      <span class="hint">Отметь объекты — потом фильтр по планете найдёт запись.</span>
      <button class="btn primary" onclick={save} disabled={!text.trim()}>Сохранить</button>
    </div>
  </div>

  <div class="filters">
    <div class="seg">
      {#each PERIODS as [id, label]}
        <button class:on={period === id} onclick={() => (period = id)}>{label}</button>
      {/each}
    </div>
    <select class="psel" bind:value={planet}>
      <option value="">Все планеты</option>
      {#each OBJ as o}<option value={o}>{o}</option>{/each}
    </select>
  </div>

  {#if cmpList.length >= 2}
    <div class="cmp glass">
      <div class="lbl">Сравнение ({cmpList.length})</div>
      {#each cmpList as n}
        <div class="cnote"><b>{dmy(n.date)}</b> <span class="tags">{n.objects.join(' · ')}</span><div>{n.text}</div></div>
      {/each}
    </div>
  {/if}

  <div class="list">
    {#if !list.length}<div class="empty">Записей нет</div>{/if}
    {#each list as n (n.id)}
      <GlowCard selected={cmp.has(n.id)} radius={12}>
        <div class="note reveal" class:picked={cmp.has(n.id)} use:reveal>
          <div class="nhead">
            <b>{dmy(n.date)}</b>
            {#if n.objects.length}<span class="tags">{n.objects.join(' · ')}</span>{/if}
            <span class="spacer"></span>
            <button class="mini" class:on={cmp.has(n.id)} title="Для сравнения" onclick={() => toggleCmp(n.id)}>⇄</button>
            <button class="mini" title="Удалить" onclick={() => del(n.id)}>🗑</button>
          </div>
          <div class="ntext">{n.text}</div>
        </div>
      </GlowCard>
    {/each}
  </div>
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0007; backdrop-filter: blur(2px); z-index: 20; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 88vh; overflow: auto; z-index: 21; padding: 16px 16px calc(18px + env(safe-area-inset-bottom)); border-radius: 22px 22px 0 0; animation: up 0.25s ease; }
  @keyframes up { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  textarea { width: 100%; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 10px 12px; font: inherit; resize: vertical; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .chip { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink-dim); border-radius: 999px; padding: 5px 11px; font-size: 0.82rem; }
  .chip.on { background: var(--accent); color: #0b0f24; border-color: transparent; }
  .addrow { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .hint { color: var(--ink-faint); font-size: 0.78rem; }
  .btn { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 9px 16px; font-size: 0.9rem; }
  .btn.primary { background: var(--accent); border-color: transparent; color: #0b0f24; font-weight: 600; }
  .btn:disabled { opacity: 0.5; }
  .filters { display: flex; gap: 10px; align-items: center; margin: 14px 0 8px; flex-wrap: wrap; }
  .seg { display: inline-flex; border: 1px solid var(--glass-brd); border-radius: 10px; overflow: hidden; }
  .seg button { background: transparent; border: none; color: var(--ink-dim); padding: 7px 12px; font-size: 0.84rem; }
  .seg button.on { background: var(--accent); color: #0b0f24; }
  .psel { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 10px; padding: 7px 10px; font: inherit; }
  .cmp { padding: 12px 14px; margin: 6px 0 10px; }
  .cmp .lbl { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); margin-bottom: 8px; }
  .cnote { padding: 6px 0; border-top: 1px solid var(--glass-brd); font-size: 0.9rem; }
  .tags { color: var(--silver); font-size: 0.8rem; }
  .list { display: flex; flex-direction: column; gap: 8px; }
  .note { background: #ffffff0c; border: 1px solid var(--glass-brd); border-radius: 12px; padding: 10px 12px; }
  .note.picked { border-color: var(--accent); }
  .nhead { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .spacer { flex: 1; }
  .mini { background: transparent; border: none; color: var(--ink-faint); font-size: 0.95rem; padding: 2px 4px; border-radius: 6px; }
  .mini.on, .mini:hover { color: var(--ink); background: #ffffff14; }
  .ntext { font-size: 0.92rem; white-space: pre-wrap; }
  .empty { text-align: center; color: var(--ink-faint); padding: 20px 0; }
</style>
