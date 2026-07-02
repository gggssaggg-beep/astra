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
  fit();
  node.addEventListener('input', fit);
  return {
    update(_v?: unknown) { requestAnimationFrame(fit); },
    destroy() { node.removeEventListener('input', fit); },
  };
}
