/**
 * Нижняя шторка: свайп-вниз закрывает, фон не реагирует (требование астролога #10).
 * Один Svelte-экшен на все шторки (settings, журнал, дата, аспект, чат, …) — вместо
 * дублирования логики. Тянем лист пальцем вниз; за порогом — onclose(). Пока шторка
 * открыта — блокируем скролл фона (ref-count, т.к. шторок может быть несколько).
 */

let locks = 0;
let prevBodyOverflow = '';
let prevBodyOverscroll = '';

/** Открыта ли сейчас хоть одна шторка (для паузы фоновых анимаций). */
export function anySheetOpen(): boolean { return locks > 0; }

// Событие для фоновых слоёв (Starfield): пока шторка открыта, канвас замирает —
// иначе backdrop-blur шторки пересчитывается на КАЖДЫЙ кадр канваса → лаги.
function notifySheets(): void {
  document.dispatchEvent(new CustomEvent('astra:sheets', { detail: locks }));
}

function lockScroll(): void {
  if (locks === 0) {
    prevBodyOverflow = document.body.style.overflow;
    prevBodyOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
  }
  locks++;
  notifySheets();
}
function unlockScroll(): void {
  locks = Math.max(0, locks - 1);
  if (locks === 0) {
    document.body.style.overflow = prevBodyOverflow;
    document.body.style.overscrollBehavior = prevBodyOverscroll;
  }
  notifySheets();
}

export interface SheetParams { onclose: () => void; }

/** use:bottomSheet={{ onclose }} на корневом <section> шторки (он же скролл-контейнер). */
export function bottomSheet(node: HTMLElement, params: SheetParams) {
  let onclose = params.onclose;
  const CLOSE_PX = 130;     // дальше потянул — закрываем (было 90: закрывалось слишком легко)
  const DECIDE_PX = 10;     // порог распознавания направления жеста
  let startY = 0, startX = 0, dy = 0;
  let dragging = false, decided = false, vertical = false;
  let scroller: HTMLElement | null = null;   // внутренний скролл-контейнер под пальцем

  // Ближайший прокручиваемый предок между целью касания и корнем шторки. Нужен,
  // чтобы «потянуть вниз = закрыть» срабатывало ТОЛЬКО когда контент домотан
  // наверх. Иначе в чате (список сообщений скроллится внутри) шторка закрывалась
  // от любого движения вниз — жалоба «слишком резко свопается».
  function nearestScroller(from: EventTarget | null): HTMLElement | null {
    let el = from as HTMLElement | null;
    while (el && el !== node) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
      el = el.parentElement;
    }
    return null;
  }

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    startY = e.touches[0].clientY; startX = e.touches[0].clientX;
    dragging = true; decided = false; vertical = false; dy = 0;
    scroller = nearestScroller(e.target);
  };
  const onMove = (e: TouchEvent) => {
    if (!dragging) return;
    const cy = e.touches[0].clientY - startY;
    const cx = e.touches[0].clientX - startX;
    if (!decided) {
      if (Math.abs(cy) < DECIDE_PX && Math.abs(cx) < DECIDE_PX) return;
      decided = true;
      vertical = Math.abs(cy) >= Math.abs(cx);
    }
    // тянем вниз только когда прокрутка (внутренняя ИЛИ самой шторки) наверху —
    // иначе это обычный скролл содержимого, а не жест закрытия
    if (vertical && cy > 0 && (scroller ? scroller.scrollTop <= 0 : node.scrollTop <= 0)) {
      dy = cy;
      node.style.transition = 'none';
      node.style.transform = `translate(-50%, ${dy}px)`;
      e.preventDefault();     // фон/контент не скроллится во время закрытия
    }
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    if (dy > CLOSE_PX) { onclose(); return; }
    if (dy > 0) {
      node.style.transition = 'transform 0.22s ease';
      node.style.transform = 'translate(-50%, 0)';
    }
    dy = 0;
  };

  node.addEventListener('touchstart', onStart, { passive: true });
  node.addEventListener('touchmove', onMove, { passive: false });
  node.addEventListener('touchend', onEnd);
  node.addEventListener('touchcancel', onEnd);
  lockScroll();

  return {
    update(p: SheetParams) { onclose = p.onclose; },
    destroy() {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
      unlockScroll();
    },
  };
}
