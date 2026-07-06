<script lang="ts">
  /**
   * Детальная шторка МЕЖаспекта совмещённой карты (синастрия / транзит+натал) —
   * «как на главном экране», но для СТАТИЧНОГО аспекта: нет времени/окна/«когда
   * ещё» (снимок). Даёт: смысл взаимодействия пары (pairLore) + тон аспекта
   * (ASPECT_LORE) + свою трактовку (по сигнатуре), архетипы участников и действия
   * (чат с Claude, сообщество, отслеживание, заметка в журнал).
   */
  import { untrack } from 'svelte';
  import type { StaticAspect, Engine, AspectOccurrence } from '../engine/index.ts';
  import { PLANET_GLYPH, findAspectOccurrences } from '../engine/index.ts';
  import { civilOf } from '../lib/format.ts';
  import { expandYear } from '../lib/inputmask.ts';
  import { db, uid, onChange } from '../lib/db.ts';
  import { aspectSignature } from '../lib/signature.ts';
  import { noteDateStr } from '../lib/journal.ts';
  import { ASPECT_LORE } from '../lib/lore.ts';
  import { pairLore } from '../lib/pairLore.ts';
  import { pairAspectLore } from '../lib/pairAspectLore.ts';
  import { fmtRelDay } from '../lib/format.ts';
  import { autogrow } from '../lib/autogrow.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { discussionCounts } from '../lib/community.ts';
  import { tap, success } from '../lib/haptics.ts';

  let { a, ownerA = null, ownerB = null, tz, win = null, engine = null, orbOf = null,
        ongoto = null, onclose, onchat, oncommunity }:
    { a: StaticAspect; ownerA?: string | null; ownerB?: string | null; tz: string;
      win?: { begin: Date; exact: Date; end: Date } | null;
      engine?: Engine | null; orbOf?: ((name: string) => number) | null;
      ongoto?: ((d: Date) => void) | null;
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
  // уникальный текст «пара×аспект»; null у доп. объектов → старая связка ниже
  const unique = untrack(() => pairAspectLore(a.p1, a.p2, a.aspect));

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

  // --- «Когда ещё этот аспект» — поиск по диапазону лет, как на главной ---
  // (жалоба: из натала блока не было, а с главной страницы — был)
  let fromYear = $state(2025);
  let toYear = $state(2027);
  let searching = $state(false);
  let searched = $state(false);
  let occ = $state<AspectOccurrence[]>([]);
  let truncated = $state(false);
  const fmtOcc = (d: Date) =>
    new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  const fmtOccT = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  async function runSearch(): Promise<void> {
    if (searching || !engine) return;
    // «26» → 2026, «89» → 1989 (пивот двухзначного года)
    const e0 = expandYear(fromYear), e1 = expandYear(toYear);
    const y0 = Math.min(e0, e1), y1 = Math.max(e0, e1);
    fromYear = y0; toYear = y1;
    searching = true; searched = false; occ = []; truncated = false;
    try {
      const from = new Date(Date.UTC(y0, 0, 1));
      const to = new Date(Date.UTC(y1 + 1, 0, 1));
      const pairOrb = orbOf ? Math.max(orbOf(a.p1), orbOf(a.p2)) : 1;
      const res = await findAspectOccurrences(engine, a.p1, a.p2, a.aspect, from, to, pairOrb);
      occ = res.list; truncated = res.truncated;
    } catch { occ = []; }
    finally { searching = false; searched = true; }
  }
  function gotoOcc(o: AspectOccurrence): void { ongoto?.(civilOf(o.exact, tz)); }

  // закрытие: недописанная «своя трактовка» не должна пропасть при свайпе
  function handleClose(): void {
    const stored = db.interpretations.get(sig)?.text ?? '';
    if (interpText.trim() !== stored.trim()) saveInterp();
    onclose();
  }
</script>

<div class="backdrop" onclick={handleClose} role="presentation"></div>
<section class="sheet glass" aria-label="Трактовка межаспекта" use:bottomSheet={{ onclose: handleClose }}>
  <header>
    <div class="ttl glyph">
      {PLANET_GLYPH[a.p1] ?? a.p1}<span class="asp">{a.symbol}</span>{PLANET_GLYPH[a.p2] ?? a.p2}
      <span class="names">{title}</span>
    </div>
    <div class="hbtns">
      <button class="star" class:on={tracked} onclick={toggleTrack} title="Отслеживать">{tracked ? '★' : '☆'}</button>
      <button class="x" onclick={handleClose} aria-label="Закрыть">✕</button>
    </div>
  </header>

  {#if win}
    <div class="exact">Орбис {a.orb.toFixed(2)}° · точно {fmtWin(win.exact)}</div>
    <div class="winrow">Окно аспекта: {fmtWin(win.begin)} → <b>точно {fmtWin(win.exact)}</b> → {fmtWin(win.end)}</div>
  {:else}
    <div class="exact">Орбис {a.orb.toFixed(2)}° ·
      {ownerA && ownerB && ownerA === ownerB ? 'натальный аспект' : 'межаспект карт (вне времени)'}</div>
  {/if}

  <div class="block">
    <div class="lbl">Взаимодействие</div>
    {#if unique}
      {#if lore}<div class="lshort">{lore.symbol} {lore.short}</div>{/if}
      <div class="ptext">{unique}</div>
      {#if pair}<div class="ltext">{a.p1} — {a.p2}: {pair}</div>{/if}
    {:else}
      {#if pair}<div class="ptext">{pair}</div>{/if}
      {#if lore}
        <div class="lshort">{lore.symbol} {lore.short}</div>
        <div class="ltext">{lore.text}</div>
      {/if}
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

  {#if engine && ongoto}
    <div class="block">
      <div class="lbl">Когда ещё этот аспект</div>
      <div class="rangerow">
        <input class="year" type="number" bind:value={fromYear} min="1800" max="2200" placeholder="2025" aria-label="Год с" />
        <span class="hint">по</span>
        <input class="year" type="number" bind:value={toYear} min="1800" max="2200" placeholder="2027" aria-label="Год по" />
        <button class="btn" onclick={runSearch} disabled={searching}>{searching ? 'Ищу…' : 'Найти'}</button>
      </div>
      {#if searched}
        {#if occ.length}
          <div class="hint" style="margin:10px 0 6px">
            Найдено: {occ.length}{truncated ? '+ (показаны первые)' : ''} — нажми дату, чтобы открыть тот день.</div>
          <div class="occ">
            {#each occ as o}
              <button class="occrow" onclick={() => gotoOcc(o)}>
                <div class="occtop"><b>{fmtOcc(o.exact)}</b><span class="t">{fmtOccT(o.exact)}</span><span class="go">→</span></div>
                <small class="occwin">окно: {fmtOcc(o.begin)} {fmtOccT(o.begin)} → {fmtOcc(o.end)} {fmtOccT(o.end)}</small>
              </button>
            {/each}
          </div>
        {:else}
          <div class="hint" style="margin-top:8px">В диапазоне {fromYear}–{toYear} этот аспект не встречается.</div>
        {/if}
      {:else}
        <div class="hint" style="margin-top:6px">Точные даты, когда <b>{a.p1} {a.aspect} {a.p2}</b>
          повторяется в небе. По дате можно нажать — откроется картинка того дня.</div>
      {/if}
    </div>
  {/if}
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
  /* «Когда ещё» — как на главной (InterpretationSheet) */
  .rangerow { display: flex; align-items: center; gap: 8px; }
  .year { width: 5rem; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 10px; padding: 8px 10px; font: inherit; font-family: var(--font-mono); text-align: center; }
  .occ { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
  .occrow { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left;
    background: #ffffff0d; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 10px 12px; font-size: 0.92rem; }
  .occrow:hover { background: #ffffff18; }
  .occtop { display: flex; align-items: center; gap: 10px; }
  .occrow b { font-family: var(--font-display); }
  .occrow .t { color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.82rem; }
  .occrow .go { margin-left: auto; color: var(--accent); font-size: 1.1rem; }
  .occwin { color: var(--ink-faint); font-size: 0.7rem; font-family: var(--font-mono); }
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
