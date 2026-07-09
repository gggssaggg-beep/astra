/**
 * Svelte-экшен use:reveal (тема neon-stardust, п.5 DESIGN_BRIEF): карточка мягко
 * всплывает (opacity 0→1 + translateY), когда впервые попадает в зону видимости
 * скролла. Класс 'revealed' добавляется ОДИН РАЗ (дальше observer отключается).
 * Сама анимация — CSS transition на .reveal/.reveal.revealed (app.css).
 *
 * СТРАХОВКА (баг «в блоке пусто»): карточки внутри ВЫЕЗЖАЮЩЕЙ шторки появляются
 * через transform родителя и скроллятся в своём контейнере — IntersectionObserver
 * с корнем-вьюпортом там не всегда срабатывает, и карточка навсегда остаётся с
 * opacity:0 (весь блок выглядит пустым). Поэтому: (1) корень наблюдения — ближайший
 * скролл-контейнер, если он есть; (2) таймер-подстраховка гарантированно покажет
 * карточку, даже если observer промолчал. Контент НЕ должен оставаться невидимым.
 */
function nearestScrollParent(node: HTMLElement): HTMLElement | null {
  let el = node.parentElement;
  while (el) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
    el = el.parentElement;
  }
  return null;
}

export function reveal(node: HTMLElement) {
  let done = false;
  let timer = 0;
  const show = () => {
    if (done) return;
    done = true;
    node.classList.add('revealed');
    io.disconnect();
    if (timer) clearTimeout(timer);
  };
  const io = new IntersectionObserver(
    (entries) => { for (const e of entries) if (e.isIntersecting) show(); },
    { root: nearestScrollParent(node), threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
  );
  io.observe(node);
  // подстраховка: если observer не сработал (transform шторки/особый контейнер) —
  // всё равно показать, чтобы блок не остался пустым
  timer = window.setTimeout(show, 700);
  return { destroy() { io.disconnect(); if (timer) clearTimeout(timer); } };
}
