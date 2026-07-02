/**
 * Нижняя шторка: свайп-вниз закрывает, фон не реагирует (требование астролога #10).
 * Один Svelte-экшен на все шторки (settings, журнал, дата, аспект, чат, …) — вместо
 * дублирования логики. Тянем лист пальцем вниз; за порогом — onclose(). Пока шторка
 * открыта — блокируем скролл фона (ref-count, т.к. шторок может быть несколько).
 */

import { tick } from './haptics.ts';

let locks = 0;
let prevBodyOverscroll = '';
let savedScrollY = 0;

/** Открыта ли сейчас хоть одна шторка (для паузы фоновых анимаций). */
export function anySheetOpen(): boolean { return locks > 0; }

// Событие для фоновых слоёв (Starfield): пока шторка открыта, канвас замирает —
// иначе backdrop-blur шторки пересчитывается на КАЖДЫЙ кадр канваса → лаги.
function notifySheets(): void {
  document.dispatchEvent(new CustomEvent('astra:sheets', { detail: locks }));
}

// Замок фона: body становится position:fixed со сдвигом на текущий скролл —
// фон не прокручивается ПОД шторкой, а при закрытии позиция восстанавливается
// точно. Прежний overflow:hidden на html СБРАСЫВАЛ прокрутку в ноль — жалоба
// «после библиотеки/окон не возвращает на то же место страницы».
function lockScroll(): void {
  if (locks === 0) {
    savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    prevBodyOverscroll = document.body.style.overscrollBehavior;
    const bs = document.body.style;
    bs.position = 'fixed';
    bs.top = `-${savedScrollY}px`;
    bs.left = '0'; bs.right = '0'; bs.width = '100%';
    bs.overscrollBehavior = 'none';
  }
  locks++;
  notifySheets();
}
function unlockScroll(): void {
  locks = Math.max(0, locks - 1);
  if (locks === 0) {
    const bs = document.body.style;
    bs.position = ''; bs.top = ''; bs.left = ''; bs.right = ''; bs.width = '';
    bs.overscrollBehavior = prevBodyOverscroll;
    window.scrollTo(0, savedScrollY);   // вернуть ленту ровно туда, откуда ушли
  }
  notifySheets();
}

export interface SheetParams { onclose: () => void; }

/** use:bottomSheet={{ onclose }} на корневом <section> шторки (он же скролл-контейнер). */
export function bottomSheet(node: HTMLElement, params: SheetParams) {
  let onclose = params.onclose;
  // Закрываем ТОЛЬКО при явном жесте: далеко утянул ИЛИ быстро смахнул.
  // Небольшое смещение — плавный возврат на место (просьба владелицы).
  const CLOSE_PX = 180;      // явное «далеко» (было 130 — закрывалось слишком легко)
  const FLICK_PX = 70;       // минимум пути для «быстрого смаха»…
  const FLICK_V = 0.65;      // …при скорости больше этой (px/мс)
  const DECIDE_PX = 10;      // порог распознавания направления жеста
  let startY = 0, startX = 0, dy = 0;
  let lastY = 0, lastT = 0, vel = 0;         // скорость жеста (для смаха)
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
    lastY = startY; lastT = performance.now(); vel = 0;
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
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) vel = (e.touches[0].clientY - lastY) / dt;   // px/мс, вниз = +
      lastY = e.touches[0].clientY; lastT = now;
      node.style.transition = 'none';
      node.style.transform = `translate(-50%, ${dy}px)`;
      e.preventDefault();     // фон/контент не скроллится во время закрытия
    }
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    const flick = dy > FLICK_PX && vel > FLICK_V;   // быстрый явный смах вниз
    if (dy > CLOSE_PX || flick) {
      // мягкое закрытие: лист доезжает вниз от текущей позиции, а не обрывается
      tick();
      node.style.transition = 'transform 0.18s ease-in';
      node.style.transform = 'translate(-50%, 105%)';
      window.setTimeout(onclose, 170);
      return;
    }
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
