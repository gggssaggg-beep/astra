/**
 * Нижняя шторка: свайп-вниз закрывает, фон не реагирует (требование астролога #10).
 * Один Svelte-экшен на все шторки (settings, журнал, дата, аспект, чат, …) — вместо
 * дублирования логики. Тянем лист пальцем вниз; за порогом — onclose(). Пока шторка
 * открыта — блокируем скролл фона (ref-count, т.к. шторок может быть несколько).
 */

let locks = 0;
let prevBodyOverflow = '';
let prevBodyOverscroll = '';
function lockScroll(): void {
  if (locks === 0) {
    prevBodyOverflow = document.body.style.overflow;
    prevBodyOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
  }
  locks++;
}
function unlockScroll(): void {
  locks = Math.max(0, locks - 1);
  if (locks === 0) {
    document.body.style.overflow = prevBodyOverflow;
    document.body.style.overscrollBehavior = prevBodyOverscroll;
  }
}

export interface SheetParams { onclose: () => void; }

/** use:bottomSheet={{ onclose }} на корневом <section> шторки (он же скролл-контейнер). */
export function bottomSheet(node: HTMLElement, params: SheetParams) {
  let onclose = params.onclose;
  const CLOSE_PX = 90;      // дальше потянул — закрываем
  const DECIDE_PX = 8;      // порог распознавания направления жеста
  let startY = 0, startX = 0, dy = 0;
  let dragging = false, decided = false, vertical = false;

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    startY = e.touches[0].clientY; startX = e.touches[0].clientX;
    dragging = true; decided = false; vertical = false; dy = 0;
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
    // тянем вниз только когда внутренний скролл листа наверху — иначе это обычная прокрутка
    if (vertical && cy > 0 && node.scrollTop <= 0) {
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
