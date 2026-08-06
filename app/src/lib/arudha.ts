/**
 * АРУДХИ (пады бхав) — просьба астролога от 03.08.2026, п.4.
 *
 * Арудха — это «отражение» дома: не то, чем дом является, а то, каким он
 * ВЫГЛЯДИТ снаружи. Правило Джаймини одно на все двенадцать домов:
 *
 *   1. взять знак дома и его управителя;
 *   2. посчитать, в каком доме ОТ ЭТОГО ДОМА стоит управитель (расстояние d,
 *      считается включительно: сам знак = 1);
 *   3. отсчитать столько же (d) знаков ОТ УПРАВИТЕЛЯ — это и есть пада.
 *
 * Исключение: если пада упала на сам дом или на седьмой от него, отражение
 * «схлопнулось» — берут десятый знак от неё. Математически оба случая дают
 * пада = дом или пада = 7-й от дома, поэтому проверяем результат, а не d.
 *
 * Управители — КЛАССИЧЕСКИЕ (правило проекта): Скорпион у Марса, Водолей у
 * Сатурна. Часть школ Джаймини берёт для пад сильнейшего из пары с узлом —
 * это отдельная развилка, см. docs/TASK_JYOTISH_CORE.md.
 */
import { SIGN_LORDS } from './vedic.ts';

export interface ArudhaPada {
  /** номер дома, 1..12 */
  house: number;
  /** 'A1'…'A12' — международное обозначение */
  code: string;
  /** особые имена: A1 — Арудха Лагна, A12 — Упапада */
  special: 'АЛ' | 'УЛ' | '';
  /** знак самого дома (0..11) */
  houseSign: number;
  lord: string;
  /** знак, где стоит управитель (null — грахи нет в наборе) */
  lordSign: number | null;
  /** расстояние «дом → управитель», включительно (1..12) */
  distance: number;
  /** знак пады (0..11) */
  sign: number;
  /** сработало ли исключение (пада схлопнулась и сдвинута на десятый знак) */
  shifted: boolean;
}

/** Расстояние от знака a до знака b по кругу, включительно: a→a = 1. */
export const signDistance = (a: number, b: number): number => ((b - a + 12) % 12) + 1;

/**
 * Пады всех двенадцати бхав. `signs` — имя грахи → индекс её знака (0..11);
 * нужны семь классических управителей, узлы в правиле не участвуют.
 */
export function arudhaPadas(lagnaSign: number, signs: Record<string, number>): ArudhaPada[] {
  const out: ArudhaPada[] = [];
  for (let house = 1; house <= 12; house++) {
    const houseSign = (lagnaSign + house - 1) % 12;
    const lord = SIGN_LORDS[houseSign];
    const lordSign = signs[lord];
    const code = `A${house}`;
    const special: ArudhaPada['special'] = house === 1 ? 'АЛ' : house === 12 ? 'УЛ' : '';
    if (lordSign == null) {
      // управителя нет в наборе — паду посчитать нечем, но строку не теряем
      out.push({ house, code, special, houseSign, lord, lordSign: null,
        distance: 0, sign: houseSign, shifted: false });
      continue;
    }
    const distance = signDistance(houseSign, lordSign);
    let sign = (lordSign + distance - 1) % 12;
    // «схлопнулась»: пада на самом доме либо на седьмом от него → десятый от неё
    const collapsed = sign === houseSign || sign === (houseSign + 6) % 12;
    if (collapsed) sign = (sign + 9) % 12;
    out.push({ house, code, special, houseSign, lord, lordSign, distance, sign,
      shifted: collapsed });
  }
  return out;
}

/** Арудха Лагна (A1) — как человека видят снаружи. */
export const arudhaLagna = (padas: ArudhaPada[]): ArudhaPada | undefined =>
  padas.find((p) => p.house === 1);
/** Упапада (A12) — брак и партнёрство. */
export const upapada = (padas: ArudhaPada[]): ArudhaPada | undefined =>
  padas.find((p) => p.house === 12);

/** Дом, в котором пада стоит относительно лагны (целознаковые дома). */
export const padaHouse = (p: ArudhaPada, lagnaSign: number): number =>
  ((p.sign - lagnaSign + 12) % 12) + 1;
