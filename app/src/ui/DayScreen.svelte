<script lang="ts">
  import type { Engine, AspectRecord, BodyPosition } from '../engine/index.ts';
  import { aspectsOn, eventsOn } from '../engine/index.ts';
  import { fmtPos, fmtTime, zonedDayStartUTC, todayCivil } from '../lib/format.ts';
  import AspectCard from './AspectCard.svelte';
  import Wheel from './Wheel.svelte';

  import type { SignStyle } from '../lib/models.ts';
  import type { WheelInfo } from '../lib/lore.ts';
  let { engine, date, orbOf, tz, signStyle = 'gold', onAspect, oninfo }:
    { engine: Engine; date: Date; orbOf: (name: string) => number; tz: string; signStyle?: SignStyle;
      onAspect?: (r: AspectRecord) => void; oninfo?: (info: WheelInfo) => void } = $props();

  // Сутки (для аспектов/событий) — 00:00 ВЫБРАННОГО пояса. Снимок положений
  // (колесо, Луна, чипы планет) — на НАСТОЯЩИЙ момент: для сегодня = «сейчас»,
  // для другого дня = тот же час суток (требование астролога), а не 00:00.
  const dayStart = $derived(zonedDayStartUTC(date, tz));
  const isToday = $derived(date.getTime() === todayCivil(tz).getTime());

  let nowMs = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (nowMs = Date.now()), 60_000); // живое «сейчас», без перегруза
    return () => clearInterval(id);
  });
  const snapshot = $derived.by(() => {
    const todayStart = zonedDayStartUTC(todayCivil(tz), tz).getTime();
    const tod = Math.min(Math.max(nowMs - todayStart, 0), 86_400_000 - 1); // мс от местной полуночи
    return new Date(dayStart.getTime() + tod);
  });

  const positions = $derived(engine.positions(snapshot));
  const moon = $derived(positions.find((p) => p.name === 'Луна'));
  // Порядок по колонкам (требование астролога): левая сверху-вниз, потом правая.
  // Сетка заполняется по столбцам (grid-auto-flow: column, 5 строк).
  const ORDER = ['Солнце', 'Меркурий', 'Венера', 'Марс', 'Раху',
    'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Кету'];
  const planets = $derived(
    ORDER.map((n) => positions.find((p) => p.name === n)).filter((p): p is BodyPosition => !!p)
  );
  const day = $derived(aspectsOn(engine, dayStart, orbOf, true));
  const allAspects = $derived([...day.moon, ...day.fast, ...day.slow]);
  const events = $derived(eventsOn(engine, dayStart));

  const section = (title: string, list: AspectRecord[]) => ({ title, list });
</script>

<div class="day">
  <div class="wheel-wrap glass">
    <Wheel {positions} aspects={allAspects} {signStyle} {oninfo} />
    <div class="snaptime">{isToday ? `сейчас · ${fmtTime(snapshot, tz)}` : `на ${fmtTime(snapshot, tz)}`}</div>
  </div>

  {#if day.audit.length}
    <div class="audit glass">{#each day.audit as w}<div>{w}</div>{/each}</div>
  {/if}

  {#if moon}
    <div class="moon glass">
      <span class="g glyph">{moon.glyph}</span>
      <div>
        <div class="lbl">Луна</div>
        <div class="pos">{fmtPos(moon.lon)} {moon.retro ? '℞' : ''}</div>
      </div>
    </div>
  {/if}

  <div class="positions glass">
    {#each planets as p}
      <div class="chip" class:retro={p.retro}>
        <span class="g glyph">{p.glyph}</span>
        <span class="pp">{fmtPos(p.lon)}</span>
      </div>
    {/each}
  </div>

  {#if events.length}
    <h3 class="sec">События дня</h3>
    <div class="events glass">
      {#each events as ev}
        <div class="ev k-{ev.kind}">
          <span class="evg glyph">{ev.glyph ?? '•'}</span>
          <span class="evt">{ev.text}</span>
          <span class="evtime">{fmtTime(ev.time, tz)}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#each [section('Луна', day.moon), section('Быстрые', day.fast), section('Медленные', day.slow)] as s}
    {#if s.list.length}
      <h3 class="sec">{s.title}</h3>
      {#each s.list as rec (rec.p1 + rec.p2 + rec.aspect)}
        <AspectCard {rec} {tz} onpick={onAspect} />
      {/each}
    {/if}
  {/each}

  {#if !day.moon.length && !day.fast.length && !day.slow.length}
    <div class="empty">Мажорных аспектов в орбисе нет</div>
  {/if}
</div>

<style>
  .day { padding: 6px 2px 40px; }
  .wheel-wrap { padding: 14px; margin: 8px 0; }
  .snaptime { text-align: center; color: var(--ink-faint); font-size: 0.72rem; margin-top: 6px; font-variant-numeric: tabular-nums; }
  .audit { padding: 10px 12px; margin: 8px 0; color: var(--rose); font-size: 0.85rem; }
  .moon { display: flex; align-items: center; gap: 12px; padding: 12px 14px; margin: 8px 0; }
  .moon .g { font-size: 1.8rem; color: var(--silver); }
  .moon .lbl { color: var(--ink-faint); font-size: 0.72rem; }
  .moon .pos { font-size: 1.05rem; }
  .positions { display: grid; grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(5, auto); grid-auto-flow: column; gap: 7px 16px; padding: 12px 14px; margin: 8px 0; }
  .chip { display: flex; align-items: center; gap: 8px; }
  .chip .g { font-size: 1.2rem; width: 1.4rem; text-align: center; color: var(--silver); }
  .chip.retro .pp { color: var(--gold); }
  .pp { font-variant-numeric: tabular-nums; font-size: 0.92rem; }
  .sec { margin: 16px 4px 4px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); }
  .events { padding: 6px 12px; margin: 8px 0; }
  .ev { display: flex; align-items: center; gap: 10px; padding: 9px 2px; border-bottom: 1px solid var(--glass-brd); }
  .ev:last-child { border-bottom: none; }
  .evg { width: 1.4rem; text-align: center; font-size: 1.1rem; color: var(--silver); }
  .evt { flex: 1; font-size: 0.9rem; }
  .evtime { font-variant-numeric: tabular-nums; color: var(--ink-dim); font-size: 0.85rem; }
  .k-eclipse { color: var(--gold); }
  .k-eclipse .evg { color: var(--gold); }
  .k-station .evg { color: var(--rose); }
  .k-lunation .evg { color: var(--silver); }
  .empty { text-align: center; color: var(--ink-faint); padding: 30px 0; }
</style>
