<script lang="ts">
  /**
   * Боковая scroll-нить (тема neon-stardust, п.7 DESIGN_BRIEF): тонкая
   * вертикальная рейка слева от прокручиваемой ленты — серый неактивный трек +
   * градиентная заливка (прогресс скролла) + светящийся узел на текущей позиции.
   * `target` — прокручиваемый контейнер (напр. `.sheet`); без него следим за
   * скроллом окна (лента дней в App.svelte, скроллится сама страница).
   */
  let { target = null, zIndex = 30 }: { target?: HTMLElement | null; zIndex?: number } = $props();

  let progress = $state(0);

  function measure(el: HTMLElement | null) {
    const top = el ? el.scrollTop : window.scrollY || document.documentElement.scrollTop;
    const height = el ? el.scrollHeight : document.documentElement.scrollHeight;
    const client = el ? el.clientHeight : window.innerHeight;
    const max = height - client;
    progress = max > 1 ? Math.min(1, Math.max(0, top / max)) : 0;
  }

  $effect(() => {
    const scrollEl: HTMLElement | Window = target ?? window;
    const onScroll = () => measure(target);
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  });
</script>

<div class="scroll-thread" style="z-index: {zIndex}" aria-hidden="true">
  <div class="track"></div>
  <div class="fill" style="transform: scaleY({progress})"></div>
  <!-- шарик едет на «носителе» высотой в весь трек: transform, как у заливки, —
       одинаковый GPU-путь, поэтому линия и шарик движутся строго синхронно
       (раньше шарик шёл через top — layout отставал на первой прокрутке) -->
  <div class="carrier" style="transform: translateY({progress * 100}%)"><div class="node"></div></div>
</div>

<style>
  .scroll-thread {
    position: fixed; left: 5px; width: 2px; pointer-events: none;
    top: calc(64px + var(--safe-top)); bottom: calc(84px + var(--safe-bottom));
  }
  .track {
    position: absolute; inset: 0; border-radius: 999px;
    background: color-mix(in srgb, var(--ink-faint) 35%, transparent);
  }
  .fill {
    position: absolute; inset: 0; transform-origin: top; border-radius: 999px;
    background: linear-gradient(to bottom, var(--neon-violet), var(--neon-cyan));
    transition: transform 0.08s linear;
  }
  .carrier {
    position: absolute; inset: 0;
    transition: transform 0.08s linear;   /* та же кривая, что у .fill — без рассинхрона */
  }
  .node {
    position: absolute; top: 0; left: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px;
    border-radius: 50%; background: var(--neon-cyan);
    box-shadow: 0 0 6px 2px color-mix(in srgb, var(--neon-cyan) 65%, transparent);
  }
</style>
