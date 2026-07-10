<script lang="ts">
  /** Тур-«прожектор» по интерфейсу (слой 1). Затемняет экран, вырезает окно
   *  вокруг текущего элемента (box-shadow 9999px), над ним — карточка с текстом
   *  и кнопками Назад/Далее. Грабли учтены: двойной rAF + scrollIntoView перед
   *  замером; центр-карточка позиционируется В ПИКСЕЛЯХ (не translate — CSS-
   *  анимация появления перебивает transform); отсутствующий элемент тихо
   *  пропускается. z-index 45 — выше всех шторок. */
  import { TOUR_STEPS } from '../lib/tour.ts';
  import { tourState, closeTour } from '../lib/studyStore.svelte.ts';
  import { tick as haptic } from '../lib/haptics.ts';
  import { pushScrollLock } from '../lib/sheet.ts';

  let { ondone }: { ondone?: () => void } = $props();

  const PAD = 8;                         // отступ прожектора вокруг элемента
  const CARD_W = 320;                    // ширина карточки-подсказки
  let rect = $state<{ x: number; y: number; w: number; h: number } | null>(null);
  let cardPos = $state<{ left: number; top: number }>({ left: 0, top: 0 });
  let measuring = $state(false);

  const step = $derived(TOUR_STEPS[tourState.step]);
  const total = TOUR_STEPS.length;

  $effect(() => pushScrollLock());       // фон под туром не проматывается

  // Пересчёт геометрии при смене шага. Ищем элемент, скроллим к центру,
  // ждём ДВА кадра (иначе координаты устаревшие), затем замеряем.
  $effect(() => {
    const s = TOUR_STEPS[tourState.step];
    if (!s) return;
    measuring = true;
    rect = null;
    if (!s.sel) { placeCenter(); measuring = false; return; }
    const el = document.querySelector(s.sel) as HTMLElement | null;
    if (!el) {                            // элемента нет (нет фигур и т.п.) — скип
      advance(1);
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      rect = { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
      placeCard(s.place, rect);
      measuring = false;
    }));
  });

  function placeCenter() {
    rect = null;
    cardPos = { left: Math.max(12, (window.innerWidth - CARD_W) / 2), top: window.innerHeight / 2 - 90 };
  }
  function placeCard(place: string, r: { x: number; y: number; w: number; h: number }) {
    const left = Math.min(Math.max(12, r.x + r.w / 2 - CARD_W / 2), window.innerWidth - CARD_W - 12);
    // карточка над или под окном прожектора; ~150px запас под высоту карточки
    const top = place === 'top' ? Math.max(12, r.y - 150) : Math.min(window.innerHeight - 180, r.y + r.h + 12);
    cardPos = { left, top };
  }

  function advance(dir: number) {
    const next = tourState.step + dir;
    if (next < 0) return;
    if (next >= total) { finish(); return; }
    haptic();
    tourState.step = next;
  }
  function finish() {
    closeTour();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    ondone?.();
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(); };
</script>

<svelte:window onkeydown={onKey} />

<!-- перехватчик кликов на весь экран: тур ведут только кнопки -->
<div class="catch" role="presentation"></div>

<!-- прожектор: прозрачное окно с огромной тенью = всё вокруг затемнено -->
{#if rect && !measuring}
  <div class="spot" style="left:{rect.x}px; top:{rect.y}px; width:{rect.w}px; height:{rect.h}px;"></div>
{:else if !rect}
  <div class="dim"></div>
{/if}

<div class="card glass" style="left:{cardPos.left}px; top:{cardPos.top}px; width:{CARD_W}px;">
  <div class="counter">Шаг {tourState.step + 1} / {total}</div>
  <button class="x" onclick={finish} aria-label="Закрыть обучение">✕</button>
  <h3>{step.title}</h3>
  <p>{step.text}</p>
  <div class="btns">
    {#if tourState.step > 0}<button class="ghost" onclick={() => advance(-1)}>Назад</button>{/if}
    <button class="next" onclick={() => advance(1)}>
      {tourState.step === total - 1 ? 'Готово' : 'Далее'}</button>
  </div>
</div>

<style>
  .catch { position: fixed; inset: 0; z-index: 45; }
  .dim { position: fixed; inset: 0; z-index: 45; background: rgba(5, 7, 20, 0.72); }
  .spot { position: fixed; z-index: 45; border-radius: 16px; pointer-events: none;
    box-shadow: 0 0 0 9999px rgba(5, 7, 20, 0.72);
    outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent); outline-offset: 0; }
  .card { position: fixed; z-index: 46; padding: 16px; border-radius: 18px;
    animation: pop 0.28s cubic-bezier(0.34, 1.4, 0.64, 1); }
  @keyframes pop { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .counter { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1px; color: var(--accent); font-weight: 600; }
  .x { position: absolute; top: 10px; right: 12px; background: transparent; border: none; color: var(--ink-dim); font-size: 1rem; }
  h3 { margin: 6px 0 8px; font-size: 1.05rem; padding-right: 20px; }
  p { margin: 0 0 14px; color: var(--ink-dim); font-size: 0.9rem; line-height: 1.5; }
  .btns { display: flex; gap: 8px; justify-content: flex-end; }
  .ghost { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 9px 16px; font-size: 0.9rem; }
  .next { background: var(--accent); border: none; color: var(--on-accent); font-weight: 600;
    border-radius: 12px; padding: 9px 20px; font-size: 0.9rem; }
</style>
