<script lang="ts" module>
  // стабильные id градиентов (вместо Math.random на каждый экземпляр)
  let gidCounter = 0;
</script>

<script lang="ts">
  /**
   * ЕДИНАЯ неоновая обводка по периметру (тема neon-stardust, п.6 DESIGN_BRIEF).
   * Все выделения блоков в приложении — ТОЛЬКО через этот компонент, чтобы
   * стиль правился одной итерацией (просьба владелицы 2026-07-02).
   *
   * Режимы:
   *  • `selected` — обводка горит, пока блок выбран/раскрыт (журнал-сравнение,
   *    раскрытый архетип, чипы планет).
   *  • `onactivate` — тап: обводка быстро обегает контур (~flashMs) и ТОЛЬКО
   *    потом вызывается действие (открытие пункта библиотеки/трактовки) —
   *    «сначала выделяется, потом открывается».
   * pathLength нормализует длину контура — анимация не зависит от размера.
   */
  import type { Snippet } from 'svelte';

  let { selected = false, radius = 16, flashMs = 240, onactivate, children }:
    { selected?: boolean; radius?: number; flashMs?: number;
      onactivate?: () => void; children: Snippet } = $props();

  const gid = `glowcard-${++gidCounter}`;
  let flashing = $state(false);
  const active = $derived(selected || flashing);
  let play = $state(false);
  let show = $state(false);
  const dur = $derived(flashing ? flashMs : 560);

  function activate() {
    if (!onactivate || flashing) return;
    flashing = true;
    setTimeout(() => { flashing = false; onactivate?.(); }, flashMs + 40);
  }

  $effect(() => {
    if (active) {
      show = true;
      play = false;
      const raf = requestAnimationFrame(() => (play = true));
      return () => cancelAnimationFrame(raf);
    } else {
      show = false;
      play = false;
    }
  });
</script>

<div class="glowcard" class:tappable={!!onactivate} onclick={activate} role="presentation">
  {@render children()}
  {#if show}
    <svg class="glow-overlay" class:play aria-hidden="true" style="--glowdur: {dur}ms">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style="stop-color:var(--neon-violet)" />
          <stop offset="100%" style="stop-color:var(--neon-cyan)" />
        </linearGradient>
      </defs>
      <rect x="1.2" y="1.2" rx={radius} ry={radius} pathLength="100"
        style="stroke:url(#{gid})" />
    </svg>
  {/if}
</div>

<style>
  .glowcard { position: relative; }
  .glowcard.tappable { cursor: pointer; }
  .glow-overlay { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  .glow-overlay rect {
    fill: none; stroke-width: 2.4px;
    width: calc(100% - 2.4px); height: calc(100% - 2.4px);
    stroke-dasharray: 100; stroke-dashoffset: 100;
    /* один drop-shadow: двойной глоу ел плавность на телефоне */
    filter: drop-shadow(0 0 7px var(--neon-cyan));
    transition: stroke-dashoffset var(--glowdur, 560ms) cubic-bezier(0.215, 0.61, 0.355, 1);
  }
  .glow-overlay.play rect { stroke-dashoffset: 0; }
</style>
