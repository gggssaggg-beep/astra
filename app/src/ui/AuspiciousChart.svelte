<script lang="ts">
  /**
   * Ступенчатая кривая благоприятности суток. Свой лёгкий SVG — как колесо и
   * ромб: картинок не генерим, библиотек графиков ради одной кривой не тянем.
   *
   * Ступени, а не гладкая линия: благоприятность меняется скачком, когда
   * кончается полоса суток или Луна переходит накшатру. Гладкая кривая
   * соврала бы, показав плавный переход там, где его нет.
   */
  import type { AuspiciousPoint } from '../lib/auspicious.ts';

  interface Props {
    curve: AuspiciousPoint[];
    /** момент «сейчас» — вертикальная отметка; null для не-сегодня */
    now?: Date | null;
    tz: string;
  }
  const { curve, now = null, tz }: Props = $props();

  const W = 320, H = 120, PAD_L = 26, PAD_B = 16, PAD_T = 6;
  const plotW = W - PAD_L - 4, plotH = H - PAD_B - PAD_T;

  const t0 = $derived(curve.length ? +curve[0].at : 0);
  const t1 = $derived(curve.length ? +curve[curve.length - 1].at : 1);
  const x = (t: number) => PAD_L + ((t - t0) / Math.max(1, t1 - t0)) * plotW;
  const y = (s: number) => PAD_T + (1 - s / 100) * plotH;

  /** Ломаная ступенями: держим значение до следующей точки. */
  const path = $derived.by(() => {
    if (!curve.length) return '';
    const d: string[] = [`M ${x(+curve[0].at).toFixed(1)} ${y(curve[0].score).toFixed(1)}`];
    for (let i = 1; i < curve.length; i++) {
      d.push(`L ${x(+curve[i].at).toFixed(1)} ${y(curve[i - 1].score).toFixed(1)}`);
      d.push(`L ${x(+curve[i].at).toFixed(1)} ${y(curve[i].score).toFixed(1)}`);
    }
    return d.join(' ');
  });

  const hm = (d: Date) => new Intl.DateTimeFormat('ru-RU',
    { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d);
  /** Подписи оси времени — каждые шесть часов, чтобы не сливались. */
  const ticks = $derived(curve.filter((_, i) => i % Math.max(1, Math.round(curve.length / 4)) === 0));
  const nowX = $derived(now && +now >= t0 && +now <= t1 ? x(+now) : null);
</script>

{#if curve.length > 1}
  <svg viewBox="0 0 {W} {H}" class="chart" role="img"
    aria-label="Кривая благоприятности суток">
    <!-- горизонтали 25/50/75 %: глазу нужна опора, иначе ступени не читаются -->
    {#each [25, 50, 75] as g}
      <line x1={PAD_L} x2={W - 4} y1={y(g)} y2={y(g)} class="grid" />
      <text x={PAD_L - 4} y={y(g) + 3} class="ax" text-anchor="end">{g}</text>
    {/each}
    <path d={path} class="line" />
    {#if nowX != null}
      <line x1={nowX} x2={nowX} y1={PAD_T} y2={PAD_T + plotH} class="now" />
    {/if}
    {#each ticks as p}
      <text x={x(+p.at)} y={H - 4} class="ax" text-anchor="middle">{hm(p.at)}</text>
    {/each}
  </svg>
{/if}

<style>
  .chart { width: 100%; height: auto; display: block; margin: 6px 0 2px; }
  .grid { stroke: var(--glass-brd); stroke-width: 1; }
  .line { fill: none; stroke: var(--gold); stroke-width: 2; stroke-linejoin: round; }
  .now { stroke: var(--accent); stroke-width: 1.5; stroke-dasharray: 3 3; }
  .ax { fill: var(--ink-faint); font-size: 8px; }
</style>
