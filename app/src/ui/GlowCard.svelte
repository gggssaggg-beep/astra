<script lang="ts">
  /**
   * Обводка выбранного блока (тема neon-stardust, п.6 DESIGN_BRIEF): когда
   * блок выбран — рамка ОДИН РАЗ обводится градиентом фиолет→циан
   * (stroke-dashoffset), затем обводка остаётся статично + мягкий glow.
   * pathLength нормализует длину контура, чтобы dash-анимация не зависела
   * от реального размера карточки.
   *
   * Выбор = `selected` (готовое состояние экрана, напр. «сравнение» в
   * журнале) ИЛИ тап по самому блоку (`manual` — локальный тоггл). Тап
   * работает всегда, даже если у блока нет своего onclick — событие просто
   * всплывает до этого div, не мешая другим обработчикам внутри children.
   */
  import type { Snippet } from 'svelte';

  let { selected = false, radius = 16, children }:
    { selected?: boolean; radius?: number; children: Snippet } = $props();

  const gid = `glowcard-${Math.random().toString(36).slice(2, 9)}`;
  let manual = $state(false);
  const active = $derived(selected || manual);
  let play = $state(false);
  let show = $state(false);

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

<div class="glowcard" onclick={() => (manual = !manual)} role="presentation">
  {@render children()}
  {#if show}
    <svg class="glow-overlay" class:play aria-hidden="true">
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
  .glow-overlay { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  .glow-overlay rect {
    fill: none; stroke-width: 2.4px;
    width: calc(100% - 2.4px); height: calc(100% - 2.4px);
    stroke-dasharray: 100; stroke-dashoffset: 100;
    filter: drop-shadow(0 0 5px var(--neon-cyan)) drop-shadow(0 0 9px var(--neon-violet));
    transition: stroke-dashoffset 0.56s cubic-bezier(0.215, 0.61, 0.355, 1);
  }
  .glow-overlay.play rect { stroke-dashoffset: 0; }
</style>
