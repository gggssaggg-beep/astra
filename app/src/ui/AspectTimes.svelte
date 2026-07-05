<script lang="ts">
  /**
   * ОБЩАЯ ФОРМУЛА строки времён аспекта: «вход → точно → выход» с датами.
   * Одна на всё приложение (карточка дня, транзитные строки совмещённых карт) —
   * оформление правится в одном месте (просьба владелицы 2026-07-06).
   */
  import { fmtTime, fmtDateShort, sameDay } from '../lib/format.ts';

  let { begin = null, exact = null, end = null, tz }:
    { begin?: Date | null; exact?: Date | null; end?: Date | null; tz: string } = $props();

  const t = (d: Date | null) => (d ? fmtTime(d, tz) : '—');
  // дата начала/конца — аспект может растянуться на несколько дней (требование астролога)
  const dd = (d: Date | null) => (d ? fmtDateShort(d, tz) : '');
  // подпись «через полночь», если выход орбиса в другой день, чем точный
  const crosses = $derived(exact && end && !sameDay(exact, end, tz));
</script>

<div class="times">
  <span class="seg"><small class="d">{dd(begin)}</small><b>{t(begin)}</b><small>вход</small></span>
  <span class="dash">→</span>
  <span class="seg exact"><small class="d">{dd(exact)}</small><b>{t(exact)}</b><small>точно</small></span>
  <span class="dash">→</span>
  <span class="seg"><small class="d">{dd(end)}</small><b>{t(end)}</b><small>выход{crosses ? ' ⤵' : ''}</small></span>
</div>

<style>
  .times { display: flex; align-items: center; gap: 10px; margin-top: 8px;
    justify-content: space-between; color: var(--ink-dim); }
  .seg { display: flex; flex-direction: column; align-items: center; line-height: 1.15; }
  .seg b { font-variant-numeric: tabular-nums; font-family: var(--font-mono); color: var(--ink); }
  .seg.exact b { color: var(--gold);
    text-shadow: 0 0 8px color-mix(in srgb, var(--gold) 50%, transparent); }
  /* подписи — единый микро-капс (правило иерархии: лейбл/мета) */
  .seg small { font-size: 0.62rem; color: var(--ink-faint);
    text-transform: uppercase; letter-spacing: 0.5px; }
  .seg .d { color: var(--ink-dim); font-variant-numeric: tabular-nums; text-transform: none; }
  .dash { color: var(--ink-faint); }
</style>
