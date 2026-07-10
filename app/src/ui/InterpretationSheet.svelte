<script lang="ts">
  import { untrack } from 'svelte';
  import type { AspectRecord, Engine, AspectOccurrence } from '../engine/index.ts';
  import { PLANET_GLYPH, findAspectOccurrences } from '../engine/index.ts';
  import { db, uid, onChange } from '../lib/db.ts';
  import { aspectSignature } from '../lib/signature.ts';
  import { noteDateStr } from '../lib/journal.ts';
  import { ASPECT_LORE } from '../lib/lore.ts';
  import { pairLore } from '../lib/pairLore.ts';
  import { pairAspectLore } from '../lib/pairAspectLore.ts';
  import { buildAstroPrompt } from '../lib/aiPrompt.ts';
  import PromptSheet from './PromptSheet.svelte';
  import { fmtTime, civilOf, fmtRelDay } from '../lib/format.ts';
  import { expandYear } from '../lib/inputmask.ts';
  import { autogrow } from '../lib/autogrow.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { discussionCounts } from '../lib/community.ts';
  import { tap, success } from '../lib/haptics.ts';

  let { rec, engine, date, tz, orbOf, onclose, ondiscuss, ongoto, oncommunity }:
    { rec: AspectRecord; engine: Engine; date: Date; tz: string;
      orbOf?: (name: string) => number; onclose: () => void;
      ondiscuss?: (r: AspectRecord) => void; ongoto?: (d: Date) => void;
      oncommunity?: (sig: string, title: string) => void } = $props();

  const sig = untrack(() => aspectSignature(rec.p1, rec.p2, rec.aspect));

  // сколько обсуждений сообщества по этому аспекту (метка на кнопке; тихо 0 без входа)
  let discCount = $state(0);
  $effect(() => {
    let cancelled = false;
    void discussionCounts([sig]).then((m) => { if (!cancelled) discCount = m.get(sig) ?? 0; });
    return () => { cancelled = true; };
  });

  let tracked = $state(!!db.tracked.all().find((t) => t.signature === sig));
  function toggleTrack() {
    const ex = db.tracked.all().find((t) => t.signature === sig);
    if (ex) db.tracked.remove(ex.id);
    else db.tracked.put({ id: uid(), p1: rec.p1, p2: rec.p2, aspect: rec.aspect, signature: sig });
    tracked = !ex;
    tap();
  }

  // новый массив (slice) — иначе Svelte не заметит мутацию db.notes на месте
  let notes = $state(db.notes.all().slice());
  $effect(() => onChange(() => (notes = db.notes.all().slice())));
  const similar = $derived(
    notes.filter((n) => n.aspectSignature === sig).sort((a, b) => b.date.localeCompare(a.date))
  );

  let noteText = $state('');
  let savedOk = $state(false);          // «✓ В журнале» — видно, что запись легла
  function addNote() {
    const t = noteText.trim(); if (!t) return;
    db.notes.put({ id: uid(), createdAt: new Date().toISOString(), date: noteDateStr(date), text: t, objects: [rec.p1, rec.p2], aspectSignature: sig });
    noteText = ''; notes = db.notes.all().slice();
    success();
    savedOk = true;
    setTimeout(() => (savedOk = false), 1600);
  }

  const arch = (o: string) => db.archetypes.get(o);
  const dmy = (s: string) => { const p = s.split('-'); return `${p[2]}.${p[1]}.${p[0]}`; };

  // --- Трактовка (краткая общая + СВОЯ, сохраняется в библиотеку по сигнатуре) ---
  const lore = $derived(ASPECT_LORE[rec.aspect]);
  const pair = $derived(pairLore(rec.p1, rec.p2));   // смысл пары планет (не только тип аспекта)
  // УНИКАЛЬНЫЙ текст «пара×аспект» (Марс⚹Венера ≠ Марс☌Венера); null у доп. объектов
  const unique = $derived(pairAspectLore(rec.p1, rec.p2, rec.aspect));
  let interpText = $state(db.interpretations.get(sig)?.text ?? '');
  let interpSaved = $state(false);
  function saveInterp() {
    db.interpretations.put({ signature: sig, text: interpText.trim(), updatedAt: new Date().toISOString() });
    interpSaved = true; success();
    setTimeout(() => (interpSaved = false), 1600);
  }

  // --- Поиск «когда ещё случался этот аспект» в диапазоне лет ---
  // Диапазон по умолчанию 2025–2027 (просьба владелицы) — узкое окно «около
  // сейчас»: быстрее считается и обычно то, что интересно.
  let fromYear = $state(2025);
  let toYear = $state(2027);
  let searching = $state(false);
  let searched = $state(false);
  let occ = $state<AspectOccurrence[]>([]);
  let truncated = $state(false);

  const fmtOcc = (d: Date) =>
    new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(d);

  async function runSearch() {
    if (searching) return;
    // «26» → 2026, «89» → 1989 (пивот двухзначного года)
    const e0 = expandYear(fromYear), e1 = expandYear(toYear);
    const y0 = Math.min(e0, e1), y1 = Math.max(e0, e1);
    fromYear = y0; toYear = y1;
    searching = true; searched = false; occ = []; truncated = false;
    try {
      const from = new Date(Date.UTC(y0, 0, 1));
      const to = new Date(Date.UTC(y1 + 1, 0, 1)); // конец года y1 включительно
      // орбис пары (больший из двух) — для окна вход/выход; нет резолвера → рек.орбис
      const pairOrb = orbOf ? Math.max(orbOf(rec.p1), orbOf(rec.p2)) : (rec.exactOrb || 1);
      const res = await findAspectOccurrences(engine, rec.p1, rec.p2, rec.aspect, from, to, pairOrb);
      occ = res.list; truncated = res.truncated;
    } catch { occ = []; }
    finally { searching = false; searched = true; }
  }

  // переход к полной картинке дня, в который состоится выбранный аспект
  function goto(o: AspectOccurrence) { ongoto?.(civilOf(o.exact, tz)); }

  // «Промпт для любой ИИ» по этому аспекту дня — тот же корректный контекст
  let showPrompt = $state(false);
  const promptText = $derived.by(() => buildAstroPrompt({
    kind: 'aspect',
    title: `аспект ${rec.p1} ${rec.aspect} ${rec.p2}`,
    aspects: [`${rec.p1} ${rec.aspect} ${rec.p2}, орбис ${rec.exactOrb.toFixed(2)}°`
      + (rec.exactTime ? `, точно ${fmtTime(rec.exactTime, tz)}` : '')],
    focus: `${rec.p1} ${rec.aspect} ${rec.p2}${pair ? ` — смысл пары: ${pair}` : ''}`
      + (unique ? `. Трактовка сочетания: ${unique}` : ''),
    extra: 'Разбери этот аспект: как энергии участников взаимодействуют через характер аспекта, как это проживается, на что обратить внимание.',
  }));

  // закрытие (свайп/бекдроп/✕): недописанная «своя трактовка» не должна пропасть —
  // textarea сохраняется по blur, но свайп-закрытие blur не гарантирует
  function handleClose() {
    const stored = db.interpretations.get(sig)?.text ?? '';
    if (interpText.trim() !== stored.trim()) saveInterp();
    onclose();
  }
</script>

<div class="backdrop sheet-backdrop" onclick={handleClose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Трактовка аспекта" use:bottomSheet={{ onclose: handleClose }}>
  <header>
    <div class="title glyph">
      {PLANET_GLYPH[rec.p1] ?? rec.p1}<span class="asp">{rec.symbol}</span>{PLANET_GLYPH[rec.p2] ?? rec.p2}
      <span class="names">{rec.p1} {rec.aspect} {rec.p2}</span>
    </div>
    <div class="hbtns">
      <button class="star" class:on={tracked} onclick={toggleTrack} title="Отслеживать">{tracked ? '★' : '☆'}</button>
      <button class="x" onclick={handleClose} aria-label="Закрыть">✕</button>
    </div>
  </header>

  {#if rec.exactTime}<div class="exact">Точно: {fmtTime(rec.exactTime, tz)} · орбис {rec.exactOrb.toFixed(2)}°</div>
  {:else}<div class="exact">Пара и аспект без привязки ко дню — общий разбор</div>{/if}

  <div class="block">
    <div class="lbl">Трактовка</div>
    {#if unique}
      <!-- уникальный текст именно этого сочетания пары и аспекта -->
      {#if lore}<div class="lshort">{lore.symbol} {lore.short}</div>{/if}
      <div class="ptext">{unique}</div>
      {#if pair}<div class="ltext">{rec.p1} — {rec.p2}: {pair}</div>{/if}
    {:else}
      {#if pair}<div class="ptext">{rec.p1} — {rec.p2}: {pair}</div>{/if}
      {#if lore}
        <div class="lshort">{lore.symbol} {lore.short}</div>
        <div class="ltext">{lore.text}</div>
      {/if}
    {/if}
    <!-- «неявный» ввод: без коробки, растёт под текст, курсор показывает правку -->
    <textarea class="seamless" use:autogrow={interpText} bind:value={interpText} rows="2"
      placeholder="Своя трактовка этой пары — коснись и пиши, сохранится в Библиотеку…"
      onchange={saveInterp}></textarea>
    {#if interpSaved}<div class="hint oksave">✓ Сохранено в библиотеку трактовок</div>{/if}
  </div>

  <button class="discuss" onclick={() => ondiscuss?.(rec)}>
    <span class="dg glyph">💬</span>
    <span>Обсудить аспект с Claude<small>по заложенным архетипам участников</small></span>
  </button>

  <div class="actrow">
    <button class="discuss ghost mini" title="готовый текст для ChatGPT, Gemini и др." onclick={() => (showPrompt = true)}>
      <span class="dg glyph">📋</span>
      <span>Промпт для ИИ</span>
    </button>
    <button class="discuss ghost mini"
      title={discCount ? 'коллеги уже обсуждают этот аспект — загляни' : 'что говорят коллеги про этот аспект'}
      onclick={() => oncommunity?.(sig, `${rec.p1} ${rec.aspect} ${rec.p2}`)}>
      <span class="dg glyph">✧</span>
      <span>Сообщество</span>
      {#if discCount}<span class="dbadge">💬 {discCount}</span>{/if}
    </button>
  </div>

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

  <div class="block">
    <div class="lbl">Когда ещё этот аспект</div>
    <div class="rangerow">
      <span class="hint">с</span>
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
            <button class="occrow" onclick={() => goto(o)}>
              <div class="occtop"><b>{fmtOcc(o.exact)}</b><span class="t">{fmtTime(o.exact, tz)}</span><span class="go">→</span></div>
              <!-- аспект — интервал: вход→выход орбиса мелким шрифтом (правило астролога) -->
              <small class="occwin">окно: {fmtOcc(o.begin)} {fmtTime(o.begin, tz)} → {fmtOcc(o.end)} {fmtTime(o.end, tz)}</small>
            </button>
          {/each}
        </div>
      {:else}
        <div class="hint" style="margin-top:8px">В диапазоне {fromYear}–{toYear} этот аспект не встречается.</div>
      {/if}
    {:else}
      <div class="hint" style="margin-top:6px">Точные даты, когда <b>{rec.p1} {rec.aspect} {rec.p2}</b>
        повторяется в выбранном диапазоне. По дате можно нажать — откроется картинка того дня.</div>
    {/if}
  </div>
</section>

{#if showPrompt}
  <PromptSheet text={promptText} onclose={() => (showPrompt = false)} />
{/if}

<style>
  /* геометрия/бэкдроп — глобальные .sheet-base/.sheet-backdrop (app.css); тут только z-index */
  .backdrop { z-index: 22; }
  .sheet { z-index: 23; }
  header { display: flex; align-items: center; justify-content: space-between; }
  .title { font-size: 1.4rem; display: flex; align-items: center; gap: 6px; }
  .asp { margin: 0 2px; opacity: 0.85; }
  .names { font-size: 0.86rem; color: var(--ink-dim); margin-left: 8px; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hbtns { display: flex; align-items: center; gap: 6px; }
  .star { background: transparent; border: none; font-size: 1.3rem; color: var(--ink-faint); }
  .star.on { color: var(--gold); animation: starpop 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
    text-shadow: 0 0 10px color-mix(in srgb, var(--gold) 70%, transparent); }
  @keyframes starpop { 0% { transform: scale(1); } 45% { transform: scale(1.35); } 100% { transform: scale(1); } }
  .okflash { background: var(--gold) !important; color: #201a08 !important; }
  .exact { color: var(--gold); font-size: 0.84rem; margin: 6px 0 2px; }
  .ptext { font-size: 0.92rem; margin-bottom: 8px; }
  .lshort { font-weight: 600; margin-bottom: 4px; }
  .ltext { font-size: 0.88rem; color: var(--ink-dim); margin-bottom: 10px; }
  .oksave { color: var(--gold); margin-top: 6px; }
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
  .discuss.ghost { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); margin-top: 8px; }
  /* два вторичных действия в один ряд (высота одной строки, без подписей) */
  .actrow { display: flex; gap: 8px; margin-top: 8px; }
  .discuss.ghost.mini { flex: 1; min-width: 0; margin-top: 0; justify-content: center;
    gap: 6px; padding: 10px 10px; font-size: 0.86rem; }
  .discuss.ghost.mini .dg { font-size: 1.05rem; }
  .dbadge { margin-left: auto; align-self: center; font-size: 0.78rem; color: var(--accent);
    background: #ffffff12; border: 1px solid var(--glass-brd); border-radius: 999px; padding: 2px 9px; white-space: nowrap; }
  .discuss.ghost.mini .dbadge { margin-left: 2px; }
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
  .occrow { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left;
    background: #ffffff0d; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 10px 12px; font-size: 0.92rem; }
  .occrow:hover { background: #ffffff18; }
  .occtop { display: flex; align-items: center; gap: 10px; }
  .occrow b { font-family: var(--font-display); }
  .occrow .t { color: var(--ink-dim); font-family: var(--font-mono); font-size: 0.82rem; }
  .occrow .go { margin-left: auto; color: var(--accent); font-size: 1.1rem; }
  .occwin { color: var(--ink-faint); font-size: 0.7rem; font-family: var(--font-mono); }
</style>
