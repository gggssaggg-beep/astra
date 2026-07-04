/**
 * Шрифты интерфейса (настройка «Шрифт»). Все — с ПОЛНОЙ кириллицей (русский UI),
 * подобраны как «топ-10» разборчивых/красивых. CSS импортируется статически: на
 * устройстве ассеты раздаёт Capacitor локально (офлайн-первый), а переключение
 * мгновенное. Субсеты в variable-CSS помечены unicode-range — браузер тянет
 * только нужные (кириллица/латиница), не всё сразу.
 *
 * Меняем ТОЛЬКО --font-body (основной текст). Дисплейный Unbounded у заголовков
 * и моно JetBrains у цифр/позиций остаются — часть темы.
 */
import '@fontsource-variable/golos-text/wght.css';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/nunito/wght.css';
import '@fontsource-variable/montserrat/wght.css';
import '@fontsource-variable/rubik/wght.css';
import '@fontsource-variable/onest/wght.css';
import '@fontsource-variable/comfortaa/wght.css';
import '@fontsource/pt-sans/cyrillic-400.css';
import '@fontsource/pt-sans/cyrillic-700.css';
import '@fontsource/pt-sans/latin-400.css';
import '@fontsource/pt-sans/latin-700.css';

const FALLBACK = '"Segoe UI", system-ui, -apple-system, "Noto Sans", sans-serif';

export interface FontOption { id: string; label: string; stack: string; }

export const FONTS: FontOption[] = [
  { id: 'default',    label: 'Космо-гротеск · как сейчас', stack: `'Space Grotesk', ${FALLBACK}` },
  { id: 'golos',      label: 'Golos · чистый гротеск',      stack: `'Golos Text Variable', ${FALLBACK}` },
  { id: 'inter',      label: 'Inter · нейтральный',         stack: `'Inter Variable', ${FALLBACK}` },
  { id: 'manrope',    label: 'Manrope · мягкая геометрия',  stack: `'Manrope Variable', ${FALLBACK}` },
  { id: 'nunito',     label: 'Nunito · округлый, тёплый',   stack: `'Nunito Variable', ${FALLBACK}` },
  { id: 'montserrat', label: 'Montserrat · строгий модерн', stack: `'Montserrat Variable', ${FALLBACK}` },
  { id: 'rubik',      label: 'Rubik · дружелюбный',         stack: `'Rubik Variable', ${FALLBACK}` },
  { id: 'onest',      label: 'Onest · современный',         stack: `'Onest Variable', ${FALLBACK}` },
  { id: 'comfortaa',  label: 'Comfortaa · округлый дисплей', stack: `'Comfortaa Variable', ${FALLBACK}` },
  { id: 'ptsans',     label: 'PT Sans · классика',          stack: `'PT Sans', ${FALLBACK}` },
];

/** Стек шрифта по id (неизвестный id → первый = дефолт). */
export function fontStack(id: string): string {
  return (FONTS.find((f) => f.id === id) ?? FONTS[0]).stack;
}
