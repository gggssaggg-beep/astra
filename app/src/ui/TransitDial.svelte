<script lang="ts">
  /**
   * Поворотный диск прокрутки времени транзита: тянешь по кругу — время едет,
   * ОДИН полный оборот = СУТКИ (просьба владелицы). Стрелка показывает время
   * суток в поясе tz (0ч — сверху, по часовой). Непрерывный скраб: накопление
   * дельты угла × 24ч / 360°.
   */
  let { value, tz = 'UTC', onchange }:
    { value: Date; tz?: string; onchange: (d: Date) => void } = $props();

  let el: SVGSVGElement;
  let dragging = $state(false);
  let last = 0;
  const SZ = 100, c = SZ / 2, r = 40;

  // время суток (в поясе) → угол стрелки
  const hm = $derived.by(() => {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(value);
    const h = +(p.find((x) => x.type === 'hour')?.value ?? 0);
    const m = +(p.find((x) => x.type === 'minute')?.value ?? 0);
    return h + m / 60;
  });
  const handAngle = $derived((hm / 24) * 360 - 90);   // −90: 0ч наверху
  const hx = $derived(c + r * Math.cos((handAngle * Math.PI) / 180));
  const hy = $derived(c + r * Math.sin((handAngle * Math.PI) / 180));
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = ((i / 24) * 360 - 90) * Math.PI / 180;
    const r0 = i % 6 === 0 ? r - 8 : r - 4;
    return { x1: c + r0 * Math.cos(a), y1: c + r0 * Math.sin(a), x2: c + r * Math.cos(a), y2: c + r * Math.sin(a), major: i % 6 === 0 };
  });

  function ang(e: PointerEvent): number {
    const b = el.getBoundingClientRect();
    return Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2)) * 180 / Math.PI;
  }
  function down(e: PointerEvent): void { dragging = true; last = ang(e); el.setPointerCapture(e.pointerId); }
  function move(e: PointerEvent): void {
    if (!dragging) return;
    const a = ang(e);
    let d = a - last;
    if (d > 180) d -= 360; else if (d < -180) d += 360;   // через 12/0 плавно
    last = a;
    onchange(new Date(value.getTime() + (d / 360) * 86_400_000));
  }
  function up(): void { dragging = false; }
</script>

<div class="wrap">
  <svg bind:this={el} viewBox="0 0 {SZ} {SZ}" class="dial" class:drag={dragging}
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}
    role="slider" tabindex="0" aria-label="Прокрутка времени транзита: круг — сутки"
    aria-valuemin="0" aria-valuemax="24" aria-valuenow={Math.floor(hm)} aria-valuetext="{Math.floor(hm)}ч">
    <circle cx={c} cy={c} r={r} class="track" />
    {#each ticks as t}
      <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} class="tick" class:major={t.major} />
    {/each}
    <line x1={c} y1={c} x2={hx} y2={hy} class="hand" />
    <circle cx={hx} cy={hy} r="6" class="knob" />
    <circle cx={c} cy={c} r="3" class="hub" />
  </svg>
  <div class="cap">крути — сутки за оборот</div>
</div>

<style>
  .wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; margin: 4px 0 8px; }
  .dial { width: 100px; height: 100px; touch-action: none; cursor: grab; outline: none; }
  .dial.drag { cursor: grabbing; }
  .track { fill: color-mix(in srgb, var(--glass) 70%, transparent); stroke: var(--glass-brd); stroke-width: 1.5; }
  .tick { stroke: var(--ink-faint); stroke-width: 1; opacity: 0.5; }
  .tick.major { stroke: var(--ink-dim); stroke-width: 1.4; opacity: 0.8; }
  .hand { stroke: var(--accent); stroke-width: 2.4; stroke-linecap: round; }
  .knob { fill: var(--accent); filter: drop-shadow(0 0 4px color-mix(in srgb, var(--accent) 60%, transparent)); }
  .hub { fill: var(--ink-dim); }
  .cap { color: var(--ink-faint); font-size: 0.68rem; }
</style>
