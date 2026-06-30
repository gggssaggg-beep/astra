<script lang="ts">
  import { untrack } from 'svelte';
  import type { AspectRecord } from '../engine/index.ts';
  import { PLANET_GLYPH } from '../engine/index.ts';
  import { db, uid, onChange } from '../lib/db.ts';
  import { aspectSignature } from '../lib/signature.ts';
  import { noteDateStr } from '../lib/journal.ts';
  import { fmtTime } from '../lib/format.ts';
  import { bottomSheet } from '../lib/sheet.ts';

  let { rec, date, tz, onclose, ondiscuss }:
    { rec: AspectRecord; date: Date; tz: string; onclose: () => void; ondiscuss?: (r: AspectRecord) => void } = $props();

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
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0007; backdrop-filter: blur(2px); z-index: 22; }
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
    background: var(--accent); border: none; color: #0b0f24; border-radius: 14px; padding: 12px 14px; text-align: left; }
  .discuss .dg { font-size: 1.3rem; }
  .discuss span { font-weight: 600; }
  .discuss small { display: block; font-weight: 400; opacity: 0.8; font-size: 0.76rem; }
  .arch { margin-bottom: 8px; }
  .atext { font-size: 0.9rem; color: var(--ink-dim); white-space: pre-wrap; }
  .past { padding: 6px 0; border-top: 1px solid var(--glass-brd); font-size: 0.9rem; }
  .past:first-of-type { border-top: none; }
</style>
