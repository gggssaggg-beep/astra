<script lang="ts">
  import { db, uid, onChange } from '../lib/db.ts';
  import { noteDateStr, filterNotes, type Period } from '../lib/journal.ts';
  import type { JournalNote } from '../lib/models.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import { fmtRelDay } from '../lib/format.ts';
  import { success, tick } from '../lib/haptics.ts';
  import GlowCard from './GlowCard.svelte';

  let { date, tz, onclose }: { date: Date; tz: string; onclose: () => void } = $props();

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
  const rel = (s: string) => fmtRelDay(s, tz);   // «сегодня/вчера/3 дн. назад»

  function toggleObj(o: string) { const s = new Set(sel); s.has(o) ? s.delete(o) : s.add(o); sel = s; }
  function toggleCmp(id: string) { const c = new Set(cmp); c.has(id) ? c.delete(id) : c.add(id); cmp = c; }
  // обучалка журнала (просьба владелицы): видна до «Понятно», флаг в настройках
  let seenHelp = $state(!!db.settings.get().seenJournalHelp);
  function dismissHelp() {
    db.settings.set({ ...db.settings.get(), seenJournalHelp: true });
    seenHelp = true; tick();
  }

  let savedOk = $state(false);           // «✓ Сохранено» на кнопке — фидбек, что запись легла
  function save() {
    const t = text.trim(); if (!t) return;
    db.notes.put({ id: uid(), createdAt: new Date().toISOString(), date: noteDateStr(date), text: t, objects: [...sel] });
    text = ''; sel = new Set(); refresh();
    success();
    savedOk = true;
    setTimeout(() => (savedOk = false), 1600);
  }

  // удаление с «Вернуть»: промах пальцем больше не уносит наблюдение навсегда
  let deleted = $state<JournalNote | null>(null);
  let undoTimer: ReturnType<typeof setTimeout> | null = null;
  // не держим таймер после закрытия шторки
  $effect(() => () => { if (undoTimer) clearTimeout(undoTimer); });
  function del(id: string) {
    deleted = notes.find((n) => n.id === id) ?? null;
    db.notes.remove(id);
    const c = new Set(cmp); c.delete(id); cmp = c; refresh();
    tick();
    if (undoTimer) clearTimeout(undoTimer);
    undoTimer = setTimeout(() => (deleted = null), 6000);
  }
  function undo() {
    if (!deleted) return;
    db.notes.put(deleted); deleted = null; refresh(); tick();
  }
</script>

<div class="backdrop sheet-backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Журнал" use:bottomSheet={{ onclose }}>
  <header><h2>Бортовой журнал</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>

  {#if !seenHelp}
    <div class="help glass">
      <b>Как вести журнал ✧</b>
      <ul>
        <li>Пиши наблюдение дня и отмечай чипами планеты-участницы — потом фильтр «по планете» найдёт всё.</li>
        <li>Кнопка <b>⇄</b> на записи собирает 2+ заметки в блок «Сравнение».</li>
        <li>Разговоры с Claude по аспектам сохраняются сюда сами — с тегами планет.</li>
        <li>Заметку можно писать и из шторки аспекта — она привяжется к нему («Похожие прошлые»).</li>
      </ul>
      <button class="btn" onclick={dismissHelp}>Понятно ✓</button>
    </div>
  {/if}

  <div class="add">
    <textarea bind:value={text} rows="2" placeholder="Наблюдение за {dmy(noteDateStr(date))}…"></textarea>
    <div class="chips">
      {#each OBJ as o}
        <!-- выделение планеты — неоновый периметр (единый GlowCard), просьба владелицы -->
        <GlowCard radius={999} selected={sel.has(o)}>
          <button class="chip glyph" class:on={sel.has(o)} onclick={() => toggleObj(o)}>{o}</button>
        </GlowCard>
      {/each}
    </div>
    <div class="addrow">
      <span class="hint">Отметь объекты — потом фильтр по планете найдёт запись.</span>
      <button class="btn primary" class:okflash={savedOk} onclick={save} disabled={!text.trim() && !savedOk}>
        {savedOk ? '✓ Сохранено' : 'Сохранить'}</button>
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

  {#if deleted}
    <div class="undo">Запись удалена<button class="undobtn" onclick={undo}>Вернуть</button></div>
  {/if}

  <div class="list">
    {#if !list.length}<div class="empty">Здесь пока пусто ✧<br />
      <span class="empty2">Первая запись появится после наблюдений — журнал подождёт.</span></div>{/if}
    {#each list as n (n.id)}
      <GlowCard selected={cmp.has(n.id)} radius={12}>
        <div class="note reveal" class:picked={cmp.has(n.id)} use:reveal>
          <div class="nhead">
            <b title={dmy(n.date)}>{rel(n.date)}</b>
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
  /* геометрия/бэкдроп — глобальные .sheet-base/.sheet-backdrop; локально z-index + своя высота */
  .backdrop { z-index: 20; }
  .sheet { z-index: 21; max-height: 88vh; overflow: auto; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  textarea { width: 100%; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 10px 12px; font: inherit; resize: vertical; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .chip { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink-dim); border-radius: 999px; padding: 5px 11px; font-size: 0.82rem; }
  .chip.on { background: var(--accent); color: var(--on-accent); border-color: transparent; }
  .addrow { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .hint { color: var(--ink-faint); font-size: 0.78rem; }
  .btn { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 9px 16px; font-size: 0.9rem; }
  .btn.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); font-weight: 600; }
  .btn:disabled { opacity: 0.5; }
  .filters { display: flex; gap: 10px; align-items: center; margin: 14px 0 8px; flex-wrap: wrap; }
  .seg { display: inline-flex; border: 1px solid var(--glass-brd); border-radius: 10px; overflow: hidden; }
  .seg button { background: transparent; border: none; color: var(--ink-dim); padding: 7px 12px; font-size: 0.84rem; }
  .seg button.on { background: var(--accent); color: var(--on-accent); }
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
  .empty { text-align: center; color: var(--ink-dim); padding: 20px 0; line-height: 1.6; }
  .empty2 { color: var(--ink-faint); font-size: 0.84rem; }
  .okflash { background: var(--gold) !important; }
  .help { padding: 12px 14px; margin-bottom: 12px; font-size: 0.88rem; color: var(--ink-dim); }
  .help b { color: var(--ink); }
  .help ul { margin: 8px 0 10px; padding-left: 18px; display: flex; flex-direction: column; gap: 5px; }
  .help .btn { padding: 7px 14px; font-size: 0.84rem; }
  .undo { display: flex; align-items: center; justify-content: space-between; gap: 10px;
    background: #ffffff12; border: 1px solid var(--glass-brd); border-radius: 12px;
    padding: 9px 12px; margin: 6px 0 10px; font-size: 0.88rem; color: var(--ink-dim);
    animation: undo-in 0.2s ease; }
  .undobtn { background: transparent; border: none; color: var(--accent); font-weight: 600; }
  @keyframes undo-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
</style>
