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

/** Заблокировать прокрутку фона вручную — для оверлеев БЕЗ свайп-закрытия
 *  (напр. приветствие): иначе фоновая лента проматывалась под окном. Возвращает
 *  функцию-разблокировку; участвует в общем ref-count (можно вкладывать). */
export function pushScrollLock(): () => void {
  lockScroll();
  let released = false;
  return () => { if (!released) { released = true; unlockScroll(); } };
}

// --- боковая scroll-нить шторки (ЕДИНАЯ процедура на всю программу) ---
// Любая шторка с use:bottomSheet автоматически получает нить прокрутки. Она
// видна ТОЛЬКО когда: (а) содержимое реально прокручивается и (б) это ВЕРХНЯЯ
// шторка — иначе нить из-под неё «просвечивала» в других меню (жалоба). Нить
// главного экрана (ui/ScrollThread) при открытой шторке гасится в App.svelte.
const openStack: HTMLElement[] = [];
const threadMeasure = new Map<HTMLElement, () => void>();
const threadCleanup = new Map<HTMLElement, () => void>();

function remeasureThreads(): void { threadMeasure.forEach((m) => m()); }

function attachThread(node: HTMLElement): void {
  const el = document.createElement('div');
  el.className = 'scroll-thread sheet-thread';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="track"></div><div class="fill"></div>'
    + '<div class="carrier"><div class="node"></div></div>';
  document.body.appendChild(el);
  const fill = el.querySelector('.fill') as HTMLElement;
  const carrier = el.querySelector('.carrier') as HTMLElement;

  const measure = () => {
    const max = node.scrollHeight - node.clientHeight;
    const isTop = openStack[openStack.length - 1] === node;
    if (max <= 4 || !isTop) { el.style.display = 'none'; return; }   // «при надобности»
    el.style.display = '';
    const p = Math.min(1, Math.max(0, node.scrollTop / max));
    fill.style.transform = `scaleY(${p})`;
    carrier.style.transform = `translateY(${p * 100}%)`;
    const r = node.getBoundingClientRect();   // подгон под реальную коробку шторки
    el.style.top = `${r.top + 10}px`;
    el.style.height = `${Math.max(0, r.height - 20)}px`;
  };

  const onScroll = () => measure();
  node.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  node.addEventListener('transitionend', onScroll);   // шторка доехала снизу — домер
  let ro: ResizeObserver | null = null;
  if ('ResizeObserver' in window) { ro = new ResizeObserver(onScroll); ro.observe(node); }
  const raf = requestAnimationFrame(measure);

  threadMeasure.set(node, measure);
  threadCleanup.set(node, () => {
    node.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    node.removeEventListener('transitionend', onScroll);
    ro?.disconnect();
    cancelAnimationFrame(raf);
    el.remove();
    threadMeasure.delete(node);
    threadCleanup.delete(node);
  });
}

export interface SheetParams { onclose: () => void; }

/** use:bottomSheet={{ onclose }} на корневом <section> шторки (он же скролл-контейнер). */
export function bottomSheet(node: HTMLElement, params: SheetParams) {
  let onclose = params.onclose;
  // Закрываем ТОЛЬКО при явном жесте: далеко утянул ИЛИ быстро смахнул.
  // Небольшое смещение — плавный возврат на место (просьба владелицы).
  const CLOSE_PX = 180;      // явное «далеко» (было 130 — закрывалось слишком легко)
  const FLICK_PX = 110;      // минимум пути для «быстрого смаха» (70 ловил случайные)
  const FLICK_V = 0.9;       // …при СГЛАЖЕННОЙ скорости больше этой (px/мс)
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
      // скорость СГЛАЖЕННАЯ (EMA): мгновенная ловила микро-рывок при отрыве
      // пальца и закрывала шторку от «чуть-чуть свернул» (жалоба владелицы)
      if (dt > 0) vel = 0.6 * ((e.touches[0].clientY - lastY) / dt) + 0.4 * vel;
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
    // палец в момент отпускания шёл ВВЕРХ — это «раскрыть обратно», не закрытие
    if (vel < -0.05 && dy <= CLOSE_PX) {
      node.style.transition = 'transform 0.22s ease';
      node.style.transform = 'translate(-50%, 0)';
      dy = 0;
      return;
    }
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
  openStack.push(node);
  attachThread(node);
  remeasureThreads();      // прежняя верхняя нить гаснет, эта — становится активной

  return {
    update(p: SheetParams) { onclose = p.onclose; },
    destroy() {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onEnd);
      unlockScroll();
      const i = openStack.indexOf(node);
      if (i >= 0) openStack.splice(i, 1);
      threadCleanup.get(node)?.();
      remeasureThreads();  // вернуть нить нижележащей шторке, если она есть
    },
  };
}
