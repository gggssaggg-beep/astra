/** Публичный интерфейс движка расчётов (§2.3). */
export { createEngine, signOf } from './engine.ts';
export type { Engine, EclipseInfo } from './engine.ts';
export { aspectsOn } from './aspects.ts';
export { findAspectOccurrences } from './aspectSearch.ts';
export type { AspectOccurrence } from './aspectSearch.ts';
export { eventsOn } from './events.ts';
export * from './constants.ts';
export type * from './types.ts';
