<script lang="ts">
  /** «Когда ещё этот аспект» — поиск повторов по диапазону лет (7б, #14).
   *  Два режима: пара движущихся тел (главный экран) ИЛИ anchor — транзитная
   *  планета к НЕПОДВИЖНОМУ натальному градусу (карты; жалоба владелицы
   *  2026-07-09, findAspectToPoint). Диапазон по умолчанию 2025–2027 —
   *  узкое окно «около сейчас» (просьба владелицы). */
  import type { Engine, AspectOccurrence } from '../../engine/index.ts';
  import { findAspectOccurrences, findAspectToPoint } from '../../engine/index.ts';
  import { fmtTime, civilOf } from '../../lib/format.ts';
  import { expandYear } from '../../lib/inputmask.ts';
  let { engine, tz, p1, p2, aspect, orbOf = null, fallbackOrb = 1, anchor = null, ownerA = null, ongoto = null }:
    { engine: Engine; tz: string; p1: string; p2: string; aspect: string;
      orbOf?: ((name: string) => number) | null; fallbackOrb?: number;
      anchor?: { lon: number; planet: string } | null; ownerA?: string | null;
      ongoto?: ((d: Date) => void) | null } = $props();

  let fromYear = $state(2025);
  let toYear = $state(2027);
  let searching = $state(false);
  let searched = $state(false);
  let occ = $state<AspectOccurrence[]>([]);
  let truncated = $state(false);

  const fmtOcc = (d: Date) =>
    new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' }).format(d);

  async function runSearch(): Promise<void> {
    if (searching) return;
    // «26» → 2026, «89» → 1989 (пивот двухзначного года)
    const e0 = expandYear(fromYear), e1 = expandYear(toYear);
    const y0 = Math.min(e0, e1), y1 = Math.max(e0, e1);
    fromYear = y0; toYear = y1;
    searching = true; searched = false; occ = []; truncated = false;
    try {
      const from = new Date(Date.UTC(y0, 0, 1));
      const to = new Date(Date.UTC(y1 + 1, 0, 1)); // конец года y1 включительно
      // орбис пары (больший из двух); нет резолвера → орбис записи/рекомендованный
      const pairOrb = orbOf ? Math.max(orbOf(p1), orbOf(p2)) : fallbackOrb;
      const res = anchor
        ? await findAspectToPoint(engine, anchor.planet, anchor.lon, aspect, from, to, pairOrb)
        : await findAspectOccurrences(engine, p1, p2, aspect, from, to, pairOrb);
      occ = res.list; truncated = res.truncated;
    } catch { occ = []; }
    finally { searching = false; searched = true; }
  }

  // переход к полной картинке дня, в который состоится выбранный аспект
  const goto = (o: AspectOccurrence) => ongoto?.(civilOf(o.exact, tz));
</script>

<div class="block">
  <div class="lbl">Когда ещё этот аспект</div>
  {#if anchor}
    <div class="hint" style="margin-bottom:8px">Когда транзитный <b>{p2}</b> снова {aspect}
      натальному <b>{p1}</b>{ownerA ? ` (${ownerA})` : ''} — по неподвижному градусу.</div>
  {/if}
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
  {:else if !anchor}
    <div class="hint" style="margin-top:6px">Точные даты, когда <b>{p1} {aspect} {p2}</b>
      повторяется в выбранном диапазоне. По дате можно нажать — откроется картинка того дня.</div>
  {/if}
</div>

<style>
  .block { padding: 12px 0; border-top: 1px solid var(--glass-brd); }
  .lbl { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); margin-bottom: 8px; }
  .hint { color: var(--ink-faint); font-size: 0.8rem; }
  .btn { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 9px 16px; font-size: 0.9rem; }
  .btn:disabled { opacity: 0.5; }
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
