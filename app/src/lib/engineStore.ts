/** Синглтон движка: инициализируем swisseph-wasm один раз. */
import { createEngine } from '../engine/index.ts';
import type { Engine, EphemerisMode } from '../engine/index.ts';

let promise: Promise<Engine> | null = null;

export function getEngine(mode: EphemerisMode = 'swieph'): Promise<Engine> {
  if (!promise) promise = createEngine(mode);
  return promise;
}
