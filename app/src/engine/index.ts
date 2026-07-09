/** Публичный интерфейс движка расчётов (§2.3). */
export { createEngine, signOf } from './engine.ts';
export type { Engine, EclipseInfo } from './engine.ts';
export { aspectsOn } from './aspects.ts';
export { findAspectOccurrences } from './aspectSearch.ts';
export type { AspectOccurrence } from './aspectSearch.ts';
export { findDegreePassages, degreeToLon } from './degreeSearch.ts';
export type { DegreePassage } from './degreeSearch.ts';
export { retroPhase } from './retro.ts';
export type { RetroPhase } from './retro.ts';
export { eventsOn } from './events.ts';
export * from './static.ts';
export { FIGURES, detectFigures, figureWindow, figureKey } from './figures.ts';
export type { FigureSpec, FigureHit, FigureEdge, FigurePoint } from './figures.ts';
export * from './constants.ts';
export type * from './types.ts';
