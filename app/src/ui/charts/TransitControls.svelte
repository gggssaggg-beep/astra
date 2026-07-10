<script lang="ts">
  /** Панель прокрутки транзита (вынесено из ChartsSheet, SR-4): ряд ‹ [дата]
   *  [время] ОК ›, «⌂ сейчас», масштаб день/месяц/год, подпись. Двигает момент
   *  транзита `transitAt` (bindable — им владеет ChartsSheet: строит transitPos
   *  и колесо) и масштаб `scrubScale` (bindable — его же читает scrubTransit
   *  родителя при повороте колеса). Сам скраб-жест колеса остаётся в родителе. */
  import { maskDate, maskTime, normTime } from '../../lib/inputmask.ts';
  import { parseDateInput } from '../../lib/dateparse.ts';
  import { zonedTimeUTC } from '../../lib/format.ts';

  let { transitAt = $bindable(), scrubScale = $bindable(), tz }:
    { transitAt: Date; scrubScale: 'day' | 'month' | 'year'; tz: string } = $props();

  // кэш Intl-форматтеров даты/времени: пересоздаём только при смене пояса
  let fmtCache: { tz: string; d: Intl.DateTimeFormat; t: Intl.DateTimeFormat } | null = null;
  function fmts(tzv: string) {
    if (!fmtCache || fmtCache.tz !== tzv) fmtCache = {
      tz: tzv,
      d: new Intl.DateTimeFormat('ru-RU', { timeZone: tzv, day: '2-digit', month: '2-digit', year: 'numeric' }),
      t: new Intl.DateTimeFormat('en-GB', { timeZone: tzv, hour: '2-digit', minute: '2-digit', hour12: false }),
    };
    return fmtCache;
  }
  const UNIT_NAME = { day: 'день', month: 'месяц', year: 'год' } as const;
  const SCRUB_CAP = { day: 'сутки за оборот', month: 'месяц за оборот', year: 'год за оборот' } as const;

  function refreshTransit(): void { transitAt = new Date(); }
  function stepTransit(ms: number): void { transitAt = new Date(transitAt.getTime() + ms); }
  // шаг кнопками ‹ › — календарный (месяц/год честные, не 30/365 суток)
  function stepUnit(dir: 1 | -1): void {
    if (scrubScale === 'day') { stepTransit(dir * 86_400_000); return; }
    const d = new Date(transitAt);
    if (scrubScale === 'month') d.setUTCMonth(d.getUTCMonth() + dir);
    else d.setUTCFullYear(d.getUTCFullYear() + dir);
    transitAt = d;
  }

  // поля даты/времени в поясе вывода — зеркалят transitAt (шаги/диск их обновляют),
  // правка поля применяется в transitAt
  let tDate = $state('');
  let tTime = $state('');
  $effect(() => {
    tDate = fmts(tz).d.format(transitAt);
    tTime = fmts(tz).t.format(transitAt);
  });
  function applyTransitFields(): void {
    // терпимый разбор: «1.6.1990», «01.06.1990», ISO — всё принимаем
    const d = parseDateInput(tDate);
    const tm = normTime(tTime) ?? (tTime.trim() ? null : '12:00:00');
    if (!d || !tm) return;
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    transitAt = zonedTimeUTC(iso, tm, tz);
  }
</script>

<!-- один ровный ряд: ‹ [дата] [время] ОК › — без переносов и «кривизны» -->
<div class="tctl">
  <button class="mini navd" onclick={() => stepUnit(-1)}
    aria-label="Шаг назад: {UNIT_NAME[scrubScale]}" title="Назад: {UNIT_NAME[scrubScale]}">‹</button>
  <input class="tin" inputmode="numeric" maxlength="10" value={tDate} placeholder="ДД.ММ.ГГГГ" aria-label="Дата транзита"
    oninput={(e) => (tDate = maskDate((e.target as HTMLInputElement).value, tDate))}
    onchange={applyTransitFields} onkeydown={(e) => e.key === 'Enter' && applyTransitFields()} />
  <input class="tin tt" inputmode="numeric" maxlength="5" value={tTime} aria-label="Время транзита"
    oninput={(e) => (tTime = maskTime((e.target as HTMLInputElement).value, tTime))}
    onchange={applyTransitFields} onkeydown={(e) => e.key === 'Enter' && applyTransitFields()} />
  <button class="mini ok" onclick={applyTransitFields} aria-label="Применить дату и время">ОК</button>
  <button class="mini navd" onclick={() => stepUnit(1)}
    aria-label="Шаг вперёд: {UNIT_NAME[scrubScale]}" title="Вперёд: {UNIT_NAME[scrubScale]}">›</button>
</div>
<div class="tctl2">
  <button class="mini now" onclick={refreshTransit}>⌂ сейчас</button>
  <!-- масштаб: и оборот диска, и шаг кнопок ‹ › -->
  <div class="scale" role="group" aria-label="Масштаб прокрутки">
    <button class="mini sc" class:on={scrubScale === 'day'} onclick={() => (scrubScale = 'day')}>день</button>
    <button class="mini sc" class:on={scrubScale === 'month'} onclick={() => (scrubScale = 'month')}>месяц</button>
    <button class="mini sc" class:on={scrubScale === 'year'} onclick={() => (scrubScale = 'year')}>год</button>
  </div>
</div>
<div class="tctl3"><span class="cap">крути колесо пальцем — {SCRUB_CAP[scrubScale]}</span></div>

<style>
  /* .mini — ДУБЛЬ базовой кнопки ChartsSheet (scoped-стили не переходят в
     дочерний; в родителе .mini остаётся для прогноза) */
  .mini { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink-dim);
    border-radius: 999px; padding: 7px 12px; font-size: 0.78rem; }
  .mini.now { color: var(--accent); }
  /* панель прокрутки транзита: ровный ряд без переносов + строка «сейчас» */
  .tctl { display: flex; align-items: stretch; justify-content: center; gap: 6px;
    flex-wrap: nowrap; margin: 4px 0 0; }
  .mini.navd { width: 38px; padding: 0; display: grid; place-items: center;
    font-size: 1.15rem; border-radius: 12px; flex: none; }
  .mini.ok { border-radius: 12px; font-weight: 600; }
  .tin { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 8px 6px; font: inherit; font-family: var(--font-mono);
    font-variant-numeric: tabular-nums; text-align: center; width: 6.6rem; min-width: 0; }
  .tin.tt { width: 3.9rem; }
  .tctl2 { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 6px 0 0; }
  .tctl3 { text-align: center; margin: 4px 0 8px; }
  .scale { display: flex; gap: 4px; }
  .mini.sc { padding: 6px 10px; font-size: 0.74rem; }
  .mini.sc.on { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 55%, var(--glass-brd));
    background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .cap { color: var(--ink-faint); font-size: 0.72rem; }
</style>
