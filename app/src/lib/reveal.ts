/**
 * Svelte-экшен use:reveal (тема neon-stardust, п.5 DESIGN_BRIEF): карточка мягко
 * всплывает (opacity 0→1 + translateY), когда впервые попадает в зону видимости
 * скролла. Класс 'revealed' добавляется ОДИН РАЗ при входе в вьюпорт (не при
 * каждом ре-рендере) — дальше IntersectionObserver для узла отключается.
 * Сама анимация — CSS transition на классе .reveal/.reveal.revealed (app.css).
 */
export function reveal(node: HTMLElement) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          node.classList.add('revealed');
          io.unobserve(node);
        }
      }
    },
    { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
  );
  io.observe(node);
  return { destroy() { io.disconnect(); } };
}
