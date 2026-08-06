/** Синглтон движка: инициализируем swisseph-wasm один раз на профиль расчёта.
 *
 * Профилей может быть два — тропический (западная часть) и сидерический
 * (ведический режим). Оба живут параллельно: зодиак задаётся ФЛАГОМ расчёта,
 * поэтому один инстанс WASM не мешает другому. Кэш — по ключу профиля. */
import { createEngine } from '../engine/index.ts';
import type { Engine, EphemerisMode, EngineOptions } from '../engine/index.ts';

const cache = new Map<string, Promise<Engine>>();

const keyOf = (mode: EphemerisMode, o: EngineOptions): string =>
  `${mode}|${o.zodiac ?? 'tropical'}|${o.ayanamsa ?? 'lahiri'}|${o.nodes ?? 'auto'}`;

/** Текущий профиль зодиака (из настроек). Меняется тумблером «Ведический режим»
 *  и действует на ВЕСЬ интерфейс: getEngine() без аргументов отдаёт его движок. */
let profile: EngineOptions = {};

export function setEngineProfile(p: EngineOptions): void { profile = { ...p }; }
export const engineProfile = (): EngineOptions => ({ ...profile });

export function getEngine(mode: EphemerisMode = 'swieph', opts: EngineOptions = profile): Promise<Engine> {
  const key = keyOf(mode, opts);
  let p = cache.get(key);
  if (!p) {
    // Каждый профиль = свой WASM-инстанс с ~12 МБ эфемерид в памяти. Держать
    // оба зодиака разом WebView может не потянуть — вытесняем прочие профили:
    // кэш их больше не держит, и как только UI отпустит старую ссылку (App
    // заменяет engine при смене школы), память заберёт GC. Обратное
    // переключение просто пересоздаст движок — редкая операция, секунды.
    for (const k of [...cache.keys()]) if (k !== key) cache.delete(k);
    p = createEngine(mode, opts);
    // неудачу не кэшируем: разовый сбой WASM (память WebView и т.п.) не должен
    // навсегда оставлять «Ошибка движка» — следующий вызов попробует заново
    p.catch(() => { cache.delete(key); });
    cache.set(key, p);
  }
  return p;
}

/** Сидерический движок для ведического режима (аянамша из настроек). Узлы по
 *  умолчанию СРЕДНИЕ — это правило джйотиша (решение Георгия 06.08.2026);
 *  «истинные» приходят из настроек, а не из умолчания движка. */
export const getVedicEngine = (ayanamsa?: string, nodes: 'mean' | 'true' = 'mean'): Promise<Engine> =>
  getEngine('swieph', { zodiac: 'sidereal', ayanamsa, nodes });
