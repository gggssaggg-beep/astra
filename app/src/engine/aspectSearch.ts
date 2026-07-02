/**
 * Поиск точных моментов КОНКРЕТНОГО аспекта (пара p1/p2, тип) в диапазоне дат —
 * для функции «когда ещё случался этот аспект» (тап по аспекту → диапазон лет).
 *
 * Тот же корневой поиск по ЗНАКОВОЙ функции, что и `exactTime` в aspects.ts, но
 * прогоняется по всему диапазону. Отдельный модуль (использует только публичный
 * Engine.lon/toJD/fromJD) — чтобы НЕ трогать ядро aspects.ts и его парити-тесты.
 * Асинхронный, режется на куски (yield) — многолетний скан не подвешивает UI.
 */
import type { Engine } from './engine.ts';
import { ASPECTS } from './constants.ts';

const angdiff = (a: number, b: number): number => {
  const d = ((a - b) % 360 + 360) % 360;
  return d > 180 ? d - 360 : d;
};

// Знаковая функция f, чей ноль = точный аспект (согласована с aspects.ts).
function signedFn(E: Engine, n1: string, n2: string, target: number): (j: number) => number {
  const delta = (j: number) => angdiff(E.lon(j, n1), E.lon(j, n2));
  if (target === 0) return delta;
  if (target === 180) return (j) => angdiff(delta(j), 180);
  return (j) => Math.abs(delta(j)) - target;
}

export interface AspectOccurrence { exact: Date; jd: number; }

/**
 * Все точные моменты аспекта (пара p1/p2, тип `aspect`) в [from, to].
 * Шаг сетки адаптивен: с Луной — 1ч (быстрая), иначе 6ч (планеты). При каждом
 * смене знака f уточняем момент делением пополам (как exactTime). Результат
 * ограничен maxResults (для частых пар — Солнце/Меркурий и т.п.).
 */
export async function findAspectOccurrences(
  E: Engine, p1: string, p2: string, aspect: string,
  from: Date, to: Date, maxResults = 120,
): Promise<{ list: AspectOccurrence[]; truncated: boolean }> {
  const spec = (ASPECTS as Record<string, { angle: number; symbol: string }>)[aspect];
  if (!spec || to <= from) return { list: [], truncated: false };
  const f = signedFn(E, p1, p2, spec.angle);
  const jdFrom = E.toJD(from), jdTo = E.toJD(to);
  const fast = p1 === 'Луна' || p2 === 'Луна';
  const step = fast ? 1 / 24 : 0.25; // Луна — 1ч, планеты — 6ч

  const out: AspectOccurrence[] = [];
  let prevJ = jdFrom, prevV = f(jdFrom), sinceYield = 0;
  for (let j = jdFrom + step; j <= jdTo; j += step) {
    const v = f(j);
    // смена знака (и не «скачок через 180°» — как в aspects.ts) ⇒ есть корень
    if ((prevV <= 0) !== (v <= 0) && Math.abs(prevV - v) < 30) {
      let lo = prevJ, hi = j;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if ((f(lo) <= 0) !== (f(mid) <= 0)) hi = mid; else lo = mid;
      }
      const jd = (lo + hi) / 2;
      out.push({ jd, exact: E.fromJD(jd) });
      if (out.length >= maxResults) return { list: out, truncated: true };
    }
    prevJ = j; prevV = v;
    // передышка почаще: 4000 шагов × 2 WASM-вызова держали главный поток
    // сотни мс — кнопка «Ищу…» и анимации замирали (жалоба «нет плавности»)
    if (++sinceYield >= 500) { sinceYield = 0; await new Promise((r) => setTimeout(r, 0)); }
  }
  return { list: out, truncated: false };
}
