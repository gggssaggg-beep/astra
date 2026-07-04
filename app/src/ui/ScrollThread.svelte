<script lang="ts">
  /**
   * Боковая scroll-нить ГЛАВНОГО экрана (прокрутка окна — лента дней).
   * Для шторок нить рисует и ведёт общий экшен use:bottomSheet (lib/sheet.ts),
   * поэтому здесь только оконный режим. Визуальные стили — ГЛОБАЛЬНЫЕ в app.css
   * (класс .scroll-thread), общие с нитью шторок.
   */
  let { zIndex = 30 }: { zIndex?: number } = $props();

  let progress = $state(0);

  function measure() {
    const top = window.scrollY || document.documentElement.scrollTop;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress = max > 1 ? Math.min(1, Math.max(0, top / max)) : 0;
  }

  $effect(() => {
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    measure();
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  });
</script>

<div class="scroll-thread" style="z-index: {zIndex}" aria-hidden="true">
  <div class="track"></div>
  <div class="fill" style="transform: scaleY({progress})"></div>
  <div class="carrier" style="transform: translateY({progress * 100}%)"><div class="node"></div></div>
</div>
