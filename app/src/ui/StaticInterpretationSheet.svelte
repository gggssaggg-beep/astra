<script lang="ts">
  /**
   * Детальная шторка МЕЖаспекта совмещённой карты (синастрия / транзит+натал) —
   * «как на главном экране», но для СТАТИЧНОГО аспекта: нет времени/окна/«когда
   * ещё» (снимок). Даёт: смысл взаимодействия пары (pairLore) + тон аспекта
   * (ASPECT_LORE) + свою трактовку (по сигнатуре), архетипы участников и действия
   * (чат с Claude, сообщество, отслеживание, заметка в журнал).
   */
  import { untrack } from 'svelte';
  import type { StaticAspect } from '../engine/index.ts';
  import { PLANET_GLYPH } from '../engine/index.ts';
  import { db, uid, onChange } from '../lib/db.ts';
  import { aspectSignature } from '../lib/signature.ts';
  import { noteDateStr } from '../lib/journal.ts';
  import { ASPECT_LORE } from '../lib/lore.ts';
  import { pairLore } from '../lib/pairLore.ts';
  import { fmtRelDay } from '../lib/format.ts';
  import { autogrow } from '../lib/autogrow.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { discussionCounts } from '../lib/community.ts';
  import { tap, success } from '../lib/haptics.ts';

  let { a, ownerA = null, ownerB = null, tz, win = null, onclose, onchat, oncommunity }:
    { a: StaticAspect; ownerA?: string | null; ownerB?: string | null; tz: string;
      win?: { begin: Date; exact: Date; end: Date } | null;
      onclose: () => void;
      onchat?: (seed: string, source: { objects: string[]; aspectSignature?: string; title?: string }) => void;
      oncommunity?: (sig: string, title: string) => void } = $props();

  // окно транзитного аспекта (вход орбиса → точно → выход) — аспект это ИНТЕРВАЛ
  const fmtWin = (d: Date): string => new Intl.DateTimeFormat('ru-RU',
    { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);

  const sig = untrack(() => aspectSignature(a.p1, a.p2, a.aspect));
  const n1 = $derived(ownerA ? `${a.p1} (${ownerA})` : a.p1);
  const n2 = $derived(ownerB ? `${a.p2} (${ownerB})` : a.p2);
  const title = $derived(`${n1} ${a.aspect} ${n2}`);

  const pair = untrack(() => pairLore(a.p1, a.p2));
  const lore = $derived(ASPECT_LORE[a.aspect]);

  // обсуждения сообщества по этому аспекту (тихо 0 без входа)
  let discCount = $state(0);
  $effect(() => {
    let cancelled = false;
    void discussionCounts([sig]).then((m) => { if (!cancelled) discCount = m.get(sig) ?? 0; });
    return () => { cancelled = true; };
  });

  let tracked = $state(!!db.tracked.all().find((t) => t.signature === sig));
  function toggleTrack(): void {
    const ex = db.tracked.all().find((t) => t.signature === sig);
    if (ex) db.tracked.remove(ex.id);
    else db.tracked.put({ id: uid(), p1: a.p1, p2: a.p2, aspect: a.aspect, signature: sig });
    tracked = !ex; tap();
  }

  // своя трактовка по сигнатуре (общая библиотека — как у транзитных аспектов)
  let interpText = $state(db.interpretations.get(sig)?.text ?? '');
  let interpSaved = $state(false);
  function saveInterp(): void {
    db.interpretations.put({ signature: sig, text: interpText.trim(), updatedAt: new Date().toISOString() });
    interpSaved = true; success();
    setTimeout(() => (interpSaved = false), 1600);
  }

  // заметка + похожие прошлые (по сигнатуре); дата — сегодня (снимок вне дня)
  let notes = $state(db.notes.all().slice());
  $effect(() => onChange(() => (notes = db.notes.all().slice())));
  const similar = $derived(notes.filter((n) => n.aspectSignature === sig)
    .sort((x, y) => y.date.localeCompare(x.date)));
  let noteText = $state('');
  let savedOk = $state(false);
  function addNote(): void {
    const t = noteText.trim(); if (!t) return;
    db.notes.put({ id: uid(), createdAt: new Date().toISOString(), date: noteDateStr(new Date()),
      text: t, objects: [a.p1, a.p2], aspectSignature: sig });
    noteText = ''; notes = db.notes.all().slice(); success();
    savedOk = true; setTimeout(() => (savedOk = false), 1600);
  }

  const arch = (o: string) => db.archetypes.get(o);
  const dmy = (s: string) => { const p = s.split('-'); return `${p[2]}.${p[1]}.${p[0]}`; };

  function discuss(): void {
    onchat?.(`Обсудим взаимодействие ${title} в совмещённой карте. Опираясь на заложенные `
      + `в приложении архетипы участников — что это сочетание значит для отношений и на что обратить внимание?`,
      { objects: [a.p1, a.p2], aspectSignature: sig, title });
  }
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Трактовка межаспекта" use:bottomSheet={{ onclose }}>
  <header>
    <div class="ttl glyph">
      {PLANET_GLYPH[a.p1] ?? a.p1}<span class="asp">{a.symbol}</span>{PLANET_GLYPH[a.p2] ?? a.p2}
      <span class="names">{title}</span>
    </div>
    <div class="hbtns">
      <button class="star" class:on={tracked} onclick={toggleTrack} title="Отслеживать">{tracked ? '★' : '☆'}</button>
      <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
    </div>
  </header>

  {#if win}
    <div class="exact">Орбис {a.orb.toFixed(2)}° · точно {fmtWin(win.exact)}</div>
    <div class="winrow">окно аспекта: {fmtWin(win.begin)} → <b>точно {fmtWin(win.exact)}</b> → {fmtWin(win.end)}</div>
  {:else}
    <div class="exact">Орбис {a.orb.toFixed(2)}° · снимок (без времени)</div>
  {/if}

  <div class="block">
    <div class="lbl">Взаимодействие</div>
    {#if pair}<div class="ptext">{pair}</div>{/if}
    {#if lore}
      <div class="lshort">{lore.symbol} {lore.short}</div>
      <div class="ltext">{lore.text}</div>
    {/if}
    <textarea class="seamless" use:autogrow={interpText} bind:value={interpText} rows="2"
      placeholder="Своя трактовка этой пары — коснись и пиши, сохранится в Библиотеку…"
      onchange={saveInterp}></textarea>
    {#if interpSaved}<div class="hint oksave">✓ Сохранено в библиотеку трактовок</div>{/if}
  </div>

  <button class="discuss" onclick={discuss}>
    <span class="dg glyph">💬</span>
    <span>Обсудить с Claude<small>по заложенным архетипам участников</small></span>
  </button>
  <button class="discuss ghost" onclick={() => oncommunity?.(sig, title)}>
    <span class="dg glyph">✧</span>
    <span>Обсуждения сообщества{#if discCount} · {discCount}{/if}<small>
      {discCount ? 'коллеги уже обсуждают этот аспект — загляни' : 'что говорят коллеги про этот аспект'}</small></span>
    {#if discCount}<span class="dbadge">💬 {discCount}</span>{/if}
  </button>

  {#if arch(a.p1) || arch(a.p2)}
    <div class="block">
      <div class="lbl">Архетипы участников</div>
      {#each [a.p1, a.p2] as o}
        {#if arch(o)}
          <div class="arch"><b>{o} · {arch(o)?.deity}</b><div class="atext">{arch(o)?.text}</div></div>
        {/if}
      {/each}
    </div>
  {/if}

  <div class="block">
    <div class="lbl">Заметка к этому аспекту</div>
    <textarea bind:value={noteText} rows="2" placeholder="Как проявилось в этой паре…"></textarea>
    <div class="row"><span class="hint">Сохранится в журнал с привязкой к этому аспекту.</span>
      <button class="btn" class:okflash={savedOk} onclick={addNote} disabled={!noteText.trim() && !savedOk}>
        {savedOk ? '✓ В журнале' : 'В журнал'}</button></div>
  </div>

  <div class="block">
    <div class="lbl">Похожие прошлые ({similar.length})</div>
    {#if !similar.length}<div class="hint">По этой паре пока пусто — первая заметка появится здесь ✧</div>{/if}
    {#each similar as n (n.id)}
      <div class="past"><b title={dmy(n.date)}>{fmtRelDay(n.date, tz)}</b><div>{n.text}</div></div>
    {/each}
  </div>
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 24; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 25; padding: 16px 16px calc(18px + var(--safe-bottom));
    border-radius: 22px 22px 0 0; animation: up 0.34s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
  header { display: flex; align-items: center; justify-content: space-between; }
  .ttl { font-size: 1.4rem; display: flex; align-items: center; gap: 6px; }
  .asp { margin: 0 2px; opacity: 0.85; }
  .names { font-size: 0.86rem; color: var(--ink-dim); margin-left: 8px; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hbtns { display: flex; align-items: center; gap: 6px; }
  .star { background: transparent; border: none; font-size: 1.3rem; color: var(--ink-faint); }
  .star.on { color: var(--gold); text-shadow: 0 0 10px color-mix(in srgb, var(--gold) 70%, transparent); }
  .okflash { background: var(--gold) !important; color: #201a08 !important; }
  .exact { color: var(--gold); font-size: 0.84rem; margin: 6px 0 2px; }
  .winrow { color: var(--ink-dim); font-size: 0.78rem; margin: 0 0 4px; }
  .winrow b { color: var(--gold); font-weight: 600; }
  .ptext { font-size: 0.92rem; margin-bottom: 8px; }
  .lshort { font-weight: 600; margin-bottom: 4px; }
  .ltext { font-size: 0.88rem; color: var(--ink-dim); margin-bottom: 10px; }
  .oksave { color: var(--gold); margin-top: 6px; }
  .block { padding: 12px 0; border-top: 1px solid var(--glass-brd); }
  .lbl { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); margin-bottom: 8px; }
  textarea { width: 100%; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 10px 12px; font: inherit; resize: vertical; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; }
  .hint { color: var(--ink-faint); font-size: 0.8rem; }
  .btn { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 9px 16px; font-size: 0.9rem; }
  .btn:disabled { opacity: 0.5; }
  .discuss { display: flex; align-items: center; gap: 12px; width: 100%; margin-top: 12px;
    background: var(--accent); border: none; color: var(--on-accent); border-radius: 14px; padding: 12px 14px; text-align: left; }
  .discuss .dg { font-size: 1.3rem; }
  .discuss.ghost { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); margin-top: 8px; }
  .dbadge { margin-left: auto; align-self: center; font-size: 0.78rem; color: var(--accent);
    background: #ffffff12; border: 1px solid var(--glass-brd); border-radius: 999px; padding: 2px 9px; white-space: nowrap; }
  .discuss.ghost small { color: var(--ink-faint); }
  .discuss span { font-weight: 600; }
  .discuss small { display: block; font-weight: 400; opacity: 0.8; font-size: 0.76rem; }
  .arch { margin-bottom: 8px; }
  .atext { font-size: 0.9rem; color: var(--ink-dim); white-space: pre-wrap; }
  .past { padding: 6px 0; border-top: 1px solid var(--glass-brd); font-size: 0.9rem; }
  .past:first-of-type { border-top: none; }
</style>
