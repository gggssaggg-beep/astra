/**
 * Шрифт интерфейса — ОДИН, без выбора (решение владелицы 2026-07-11: убрать
 * «разнообразие»). Космо-гротеск: латиница/цифры — Space Grotesk (эстетика темы,
 * импортируется в main.ts), кириллица — Golos Text (у Space Grotesk кириллицы нет,
 * иначе русский падал на системный Roboto — мешанина двух гарнитур в строке).
 * Заголовки — Unbounded, моно-цифры — JetBrains Mono (оба в main.ts) — часть темы.
 */
import '@fontsource-variable/golos-text/wght.css';

const FALLBACK = '"Segoe UI", system-ui, -apple-system, "Noto Sans", sans-serif';

/** Единственный стек шрифта тела интерфейса. */
export const FONT_BODY = `'Space Grotesk', 'Golos Text Variable', ${FALLBACK}`;

/** Совместимость: раньше шрифт выбирался по id — теперь всегда один стек. */
export function fontStack(_id?: string): string {
  return FONT_BODY;
}
