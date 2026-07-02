/** Синглтон движка: инициализируем swisseph-wasm один раз. */
import { createEngine } from '../engine/index.ts';
import type { Engine, EphemerisMode } from '../engine/index.ts';

let promise: Promise<Engine> | null = null;

export function getEngine(mode: EphemerisMode = 'swieph'): Promise<Engine> {
  if (!promise) {
    promise = createEngine(mode);
    // неудачу не кэшируем: разовый сбой WASM (память WebView и т.п.) не должен
    // навсегда оставлять «Ошибка движка» — следующий вызов попробует заново
    promise.catch(() => { promise = null; });
  }
  return promise;
}
