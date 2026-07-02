/** use:autogrow={значение} — textarea растёт под содержимое: весь текст всегда
 *  влазит, без внутренней прокрутки и ручки resize (просьба владелицы 2026-07-02).
 *  Параметр — текущий текст: когда он меняется программно (подгрузка мифа),
 *  Svelte вызовет update() и высота подгонится заново. */
export function autogrow(node: HTMLTextAreaElement, _value?: unknown) {
  const fit = () => {
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  };
  node.style.overflowY = 'hidden';
  node.style.resize = 'none';
  // Подгонка несколько раз: сразу, на след. кадре, после анимации шторки и
  // после загрузки шрифтов — на телефоне разовый замер при монтаже давал
  // высоту «3 строки» (жалоба «текст не влазит», 2026-07-02/03).
  fit();
  requestAnimationFrame(fit);
  const t = setTimeout(fit, 400);
  try { void document.fonts?.ready.then(() => fit()); } catch { /* нет API */ }
  node.addEventListener('input', fit);
  return {
    update(_v?: unknown) { requestAnimationFrame(fit); },
    destroy() { clearTimeout(t); node.removeEventListener('input', fit); },
  };
}
