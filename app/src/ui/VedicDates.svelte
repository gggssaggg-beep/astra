<script lang="ts">
  /**
   * «Важные даты» — общая лента событий карты вперёд.
   *
   * Вынесена из VedicReport, чтобы тот же блок показывался и в гочаре (просьба
   * астролога 12.08.2026: «эту таблицу добавить в гочару, а не только в
   * кундали»). Один визуальный модуль — один компонент: копия разъехалась бы
   * при первой же правке текста.
   */
  import type { TimelineEvent } from '../lib/vedicTimeline.ts';
  import { reveal } from '../lib/reveal.ts';

  interface Props {
    events: TimelineEvent[];
    /** пояс показа: даты считаются в UTC, а читаются в поясе карты */
    tz: string;
    /** сколько показать до нажатия «Ещё» */
    head?: number;
    /** заголовок над карточкой; пустая строка — без заголовка */
    title?: string;
  }
  const { events, tz, head = 8, title = 'Важные даты' }: Props = $props();

  let all = $state(false);
  // даши тянутся десятилетиями — без года подпись бессмысленна
  const dt = (d: Date) => new Intl.DateTimeFormat('ru-RU',
    { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  const shown = $derived(all ? events : events.slice(0, head));
</script>

{#if events.length}
  {#if title}<div class="hdr">{title}</div>{/if}
  <div class="card glass reveal" use:reveal>
    {#each shown as e (e.at.getTime() + e.title)}
      <div class="tl w{e.weight}">
        <div class="tlhead"><span class="tldate">{dt(e.at)}</span><b>{e.title}</b></div>
        <div class="tldetail">{e.detail}</div>
      </div>
    {/each}
    {#if events.length > head}
      <button class="lorebtn" onclick={() => (all = !all)}>
        {all ? 'Свернуть' : `Ещё ${events.length - head}`} {all ? '▴' : '▾'}
      </button>
    {/if}
  </div>
  <div class="note">Даты рассчитаны движком: смены периодов, заходы Юпитера и Сатурна
    в новый знак, фазы Саде Сати, узловые возвращения, проход медленных грах через
    мритью бхагу. Быстрые грахи сюда не идут — они на экране дня.</div>
{:else}
  <div class="note">На ближайшие три года крупных смен не выпало: ни смены периода, ни
    захода Юпитера, Сатурна или узлов в новый знак. Это нормально — такие события редкие.</div>
{/if}

<style>
  .hdr { color: var(--ink-faint); font-size: 0.7rem; text-transform: uppercase;
    letter-spacing: 1px; margin: 16px 4px 4px; }
  .card { border-radius: 16px; padding: 10px 12px; }
  .note { color: var(--ink-faint); font-size: 0.76rem; line-height: 1.45; margin: 8px 4px 0; }
  .tl { padding: 8px 0; }
  .tl + .tl { border-top: 1px solid var(--glass-brd); }
  .tl.w0 { opacity: 0.66; }
  .tlhead { display: flex; gap: 9px; align-items: baseline; font-size: 0.86rem; color: var(--ink); }
  .tldate { color: var(--ink-faint); font-size: 0.76rem; font-variant-numeric: tabular-nums;
    min-width: 5.3rem; }
  .tl.w2 .tlhead b { color: var(--gold); }
  .tldetail { color: var(--ink-faint); font-size: 0.78rem; line-height: 1.45;
    margin: 3px 0 0 5.3rem; }
  .lorebtn { background: transparent; border: none; padding: 6px 0 2px; text-align: left;
    color: var(--ink-dim); font-size: 0.78rem; }
</style>
