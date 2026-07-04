<script lang="ts">
  import { untrack } from 'svelte';
  import { parseDateInput } from '../lib/dateparse.ts';
  import { maskDate } from '../lib/inputmask.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { db } from '../lib/db.ts';

  // дни с записями журнала — точка под числом («где жила практика»);
  // снимок на открытие шторки достаточен (.slice — правило Svelte 5)
  const noteDays = new Set(db.notes.all().slice().map((n) => n.date));
  const dayKey = (ms: number): string => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  };

  let { date, today, onpick, onclose }:
    { date: Date; today?: Date; onpick: (d: Date) => void; onclose: () => void } = $props();

  const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const MON = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  // снимок: календарь открывается на месяце выбранной даты (далее листается сам)
  let viewY = $state(untrack(() => date.getUTCFullYear()));
  let viewM = $state(untrack(() => date.getUTCMonth()));
  let input = $state('');
  let err = $state(false);

  // «сегодня» — по ВЫБРАННОМУ поясу (передаётся из App как UTC-полуночь-якорь),
  // иначе запасной вариант по поясу устройства. Так календарь согласован с шапкой.
  const todayMs = $derived(
    today ? Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
          : (() => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); })()
  );
  const selKey = $derived(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  // сетка месяца: 6 недель, понедельник первый
  const grid = $derived.by(() => {
    const first = new Date(Date.UTC(viewY, viewM, 1));
    const lead = (first.getUTCDay() + 6) % 7; // Пн=0
    const start = Date.UTC(viewY, viewM, 1 - lead);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start + i * 86400000);
      return { ms: d.getTime(), day: d.getUTCDate(), inMonth: d.getUTCMonth() === viewM };
    });
  });

  function shiftMonth(n: number) {
    let m = viewM + n, y = viewY;
    while (m < 0) { m += 12; y--; }
    while (m > 11) { m -= 12; y++; }
    viewM = m; viewY = y;
  }
  function submitInput() {
    const d = parseDateInput(input);
    if (d) { onpick(d); } else { err = true; }
  }
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Выбор даты" use:bottomSheet={{ onclose }}>
  <div class="inputrow">
    <input class="dinput" class:err inputmode="numeric" maxlength="10" placeholder="дата: 12.03.2026" value={input}
      oninput={(e) => { input = maskDate((e.target as HTMLInputElement).value); err = false; }}
      onkeydown={(e) => e.key === 'Enter' && submitInput()} />
    <button class="btn" onclick={submitInput}>Перейти</button>
  </div>

  <div class="cal-head">
    <button class="nav" onclick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">‹</button>
    <div class="mlabel">{MON[viewM]} {viewY}</div>
    <button class="nav" onclick={() => shiftMonth(1)} aria-label="Следующий месяц">›</button>
  </div>

  <div class="wd">{#each WD as w}<span>{w}</span>{/each}</div>
  <div class="days">
    {#each grid as c}
      <button class="day" class:dim={!c.inMonth} class:sel={c.ms === selKey} class:today={c.ms === todayMs}
        class:noted={noteDays.has(dayKey(c.ms))}
        onclick={() => onpick(new Date(c.ms))}>{c.day}</button>
    {/each}
  </div>

  <div class="footer">
    <button class="btn ghost" onclick={() => onpick(new Date(todayMs))}>Сегодня</button>
    <button class="btn ghost" onclick={onclose}>Закрыть</button>
  </div>
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 20; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(440px, 100%);
    z-index: 21; padding: 16px 16px calc(18px + var(--safe-bottom)); border-radius: 22px 22px 0 0; animation: up 0.34s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
  .inputrow { display: flex; gap: 8px; margin-bottom: 12px; }
  .dinput { flex: 1; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 10px 12px; font: inherit; }
  .dinput.err { border-color: var(--rose); }
  .btn { background: var(--accent); border: none; color: var(--on-accent); font-weight: 600; border-radius: 12px; padding: 10px 14px; }
  .btn.ghost { background: #ffffff14; color: var(--ink-dim); font-weight: 400; }
  .cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .nav { background: transparent; border: none; font-size: 1.6rem; color: var(--ink-dim); width: 40px; height: 40px; border-radius: 10px; }
  .nav:hover { background: #ffffff14; }
  .mlabel { font-weight: 600; }
  .wd { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; color: var(--ink-faint); font-size: 0.72rem; margin-bottom: 4px; }
  .days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
  .day { aspect-ratio: 1; background: transparent; border: 1px solid transparent; color: var(--ink); border-radius: 10px; font-size: 0.9rem; position: relative; }
  /* точка = в этот день есть записи журнала */
  .day.noted::after { content: ""; position: absolute; left: 50%; bottom: 4px; transform: translateX(-50%);
    width: 4px; height: 4px; border-radius: 50%; background: var(--accent); }
  .day.sel.noted::after { background: var(--on-accent); }
  .day:hover { background: #ffffff14; }
  .day.dim { color: var(--ink-faint); opacity: 0.6; }
  .day.today { border-color: var(--glass-brd); }
  .day.sel { background: var(--accent); color: var(--on-accent); font-weight: 600; }
  .footer { display: flex; justify-content: space-between; margin-top: 12px; }
</style>
