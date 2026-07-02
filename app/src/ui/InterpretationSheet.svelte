<script lang="ts">
  import { untrack } from 'svelte';
  import type { AspectRecord, Engine, AspectOccurrence } from '../engine/index.ts';
  import { PLANET_GLYPH, findAspectOccurrences } from '../engine/index.ts';
  import { db, uid, onChange } from '../lib/db.ts';
  import { aspectSignature } from '../lib/signature.ts';
  import { noteDateStr } from '../lib/journal.ts';
  import { fmtTime, civilOf } from '../lib/format.ts';
  import { bottomSheet } from '../lib/sheet.ts';

  let { rec, engine, date, tz, onclose, ondiscuss, ongoto }:
    { rec: AspectRecord; engine: Engine; date: Date; tz: string; onclose: () => void;
      ondiscuss?: (r: AspectRecord) => void; ongoto?: (d: Date) => void } = $props();

  const sig = untrack(() => aspectSignature(rec.p1, rec.p2, rec.aspect));

  let tracked = $state(!!db.tracked.all().find((t) => t.signature === sig));
  function toggleTrack() {
    const ex = db.tracked.all().find((t) => t.signature === sig);
    if (ex) db.tracked.remove(ex.id);
    else db.tracked.put({ id: uid(), p1: rec.p1, p2: rec.p2, aspect: rec.aspect, signature: sig });
    tracked = !ex;
  }

  // новый массив (slice) — иначе Svelte не заметит мутацию db.notes на месте
  let notes = $state(db.notes.all().slice());
  $effect(() => onChange(() => (notes = db.notes.all().slice())));
  const similar = $derived(
    notes.filter((n) => n.aspectSignature === sig).sort((a, b) => b.date.localeCompare(a.date))
  );

  let noteText = $state('');
  function addNote() {
    const t = noteText.trim(); if (!t) return;
    db.notes.put({ id: uid(), createdAt: new Date().toISOString(), date: noteDateStr(date), text: t, objects: [rec.p1, rec.p2], aspectSignature: sig });
    noteText = ''; notes = db.notes.all().slice();
  }

  const arch = (o: string) => db.archetypes.get(o);
  const dmy = (s: string) => { const p = s.split('-'); return `${p[2]}.${p[1]}.${p[0]}`; };

  // --- Поиск «когда ещё случался этот аспект» в диапазоне лет ---
  const curYear = untrack(() => date.getUTCFullYear());
  let fromYear = $state(curYear - 10);
  let toYear = $state(curYear + 10);
  let searching = $state(false);
  let searched = $state(false);
  let occ = $state<AspectOccurrence[]>([]);
  let truncated = $state(false);

  const fmtOcc = (d: Date) =>
    new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(d);

  async function runSearch() {
    if (searching) return;
    const y0 = Math.min(fromYear, toYear), y1 = Math.max(fromYear, toYear);
    fromYear = y0; toYear = y1;
    searching = true; searched = false; occ = []; truncated = false;
    try {
      const from = new Date(Date.UTC(y0, 0, 1));
      const to = new Date(Date.UTC(y1 + 1, 0, 1)); // конец года y1 включительно
      const res = await findAspectOccurrences(engine, rec.p1, rec.p2, rec.aspect, from, to);
      occ = res.list; truncated = res.truncated;
    } catch { occ = []; }
    finally { searching = false; searched = true; }
  }

  // переход к полной картинке дня, в который состоится выбранный аспект
  function goto(o: AspectOccurrence) { ongoto?.(civilOf(o.exact, tz)); }
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Трактовка аспекта" use:bottomSheet={{ onclose }}>
  <header>
    <div class="title glyph">
      {PLANET_GLYPH[rec.p1] ?? rec.p1}<span class="asp">{rec.symbol}</span>{PLANET_GLYPH[rec.p2] ?? rec.p2}
      <span class="names">{rec.p1} {rec.aspect} {rec.p2}</span>
    </div>
    <div class="hbtns">
      <button class="star" class:on={tracked} onclick={toggleTrack} title="Отслеживать">{tracked ? '★' : '☆'}</button>
      <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
    </div>
  </header>

  {#if rec.exactTime}<div class="exact">Точно: {fmtTime(rec.exactTime, tz)} · орбис {rec.exactOrb.toFixed(2)}°</div>{/if}

  <button class="discuss" onclick={() => ondiscuss?.(rec)}>
    <span class="dg glyph">💬</span>
    <span>Обсудить аспект с Claude<small>по заложенным архетипам участников</small></span>
  </button>

  {#if arch(rec.p1) || arch(rec.p2)}
    <div class="block">
      <div class="lbl">Архетипы участников</div>
      {#each [rec.p1, rec.p2] as o}
        {#if arch(o)}
          <div class="arch"><b>{o} · {arch(o)?.deity}</b><div class="atext">{arch(o)?.text}</div></div>
        {/if}
      {/each}
    </div>
  {/if}

  <div class="block">
    <div class="lbl">Заметка к этому аспекту</div>
    <textarea bind:value={noteText} rows="2" placeholder="Как проявилось сегодня…"></textarea>
    <div class="row"><span class="hint">Сохранится в журнал с привязкой к этому аспекту.</span><button class="btn" onclick={addNote} disabled={!noteText.trim()}>В журнал</button></div>
  </div>

  <div class="block">
    <div class="lbl">Похожие прошлые ({similar.length})</div>
    {#if !similar.length}<div class="hint">Заметок по этой паре+аспекту ещё нет.</div>{/if}
    {#each similar as n (n.id)}
      <div class="past"><b>{dmy(n.date)}</b><div>{n.text}</div></div>
    {/each}
  </div>

  <div class="block">
    <div class="lbl">Когда ещё этот аспект</div>
    <div class="rangerow">
      <span class="hint">с</span>
      <input class="year" type="number" bind:value={fromYear} min="1800" max="2200" />
      <span class="hint">по</span>
      <input class="year" type="number" bind:value={toYear} min="1800" max="2200" />
      <button class="btn" onclick={runSearch} disabled={searching}>{searching ? 'Ищу…' : 'Найти'}</button>
    </div>
    {#if searched}
      {#if occ.length}
        <div class="hint" style="margin:10px 0 6px">
          Найдено: {occ.length}{truncated ? '+ (первые)' : ''} — нажми дату, чтобы открыть тот день.</div>
        <div class="occ">
          {#each occ as o}
            <button class="occrow" onclick={() => goto(o)}>
              <b>{fmtOcc(o.exact)}</b><span class="t">{fmtTime(o.exact, tz)}</span><span class="go">→</span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="hint" style="margin-top:8px">В диапазоне {fromYear}–{toYear} этот аспект не находится.</div>
      {/if}
    {:else}
      <div class="hint" style="margin-top:6px">Точные даты, когда <b>{rec.p1} {rec.aspect} {rec.p2}</b>
        повторяется в выбранном диапазоне. Даты кликабельны — откроют картинку того дня.</div>
    {/if}
  </div>
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 22; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 23; padding: 16px 16px calc(18px + env(safe-area-inset-bottom)); border-radius: 22px 22px 0 0; animation: up 0.25s ease; }
  @keyframes up { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
  header { display: flex; align-items: center; justify-content: space-between; }
  .title { font-size: 1.4rem; display: flex; align-items: center; gap: 6px; }
  .asp { margin: 0 2px; opacity: 0.85; }
  .names { font-size: 0.86rem; color: var(--ink-dim); margin-left: 8px; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hbtns { display: flex; align-items: center; gap: 6px; }
  .star { background: transparent; border: none; font-size: 1.3rem; color: var(--ink-faint); }
  .star.on { color: var(--gold); }
  .exact { color: var(--gold); font-size: 0.84rem; margin: 6px 0 2px; }
  .block { padding: 12px 0; border-top: 1px solid var(--glass-brd); }
  .lbl { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); margin-bottom: 8px; }
  textarea { width: 100%; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 10px 12px; font: inherit; resize: vertical; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; }
  .hint { color: var(--ink-faint); font-size: 0.8rem; }
  .btn { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 9px 16px; font-size: 0.9rem; }
  .btn:disabled { opacity: 0.5; }
  .discuss { display: flex; align-items: center; gap: 12px; width: 100%; margin-top: 12px;
    background: var(--accent); border: none; color: var(--on-accent); border-radius: 14px; padding: 12px 14px; text-align: left; }
  .discuss .dg { font-size: 1.3rem; }
  .discuss span { font-weight: 600; }
  .discuss small { display: block; font-weight: 400; opacity: 0.8; font-size: 0.76rem; }
  .arch { margin-bottom: 8px; }
  .atext { font-size: 0.9rem; color: var(--ink-dim); white-space: pre-wrap; }
  .past { padding: 6px 0; border-top: 1px solid var(--glass-brd); font-size: 0.9rem; }
  .past:first-of-type { border-top: none; }
  .rangerow { display: flex; align-items: center; gap: 8px; }
  .year { width: 5rem; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 10px; padding: 8px 10px; font: inherit; font-family: var(--font-mono); text-align: center; }
  .occ { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
  .occrow { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    background: #ffffff0d; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 10px 12px; font-size: 0.92rem; }
  .occrow:hover { background: #ffffff18; }
  .occrow b { font-family: var(--font-display); }
  .occrow .t { color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.82rem; }
  .occrow .go { margin-left: auto; color: var(--accent); font-size: 1.1rem; }
</style>
