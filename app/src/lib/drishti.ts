/**
 * Дришти — аспекты грах в джйотише. Считаются по ЦЕЛЫМ ЗНАКАМ: граха смотрит
 * из своего знака в другой знак целиком, вместе со всеми, кто там стоит.
 * Ни градусов, ни орбисов, ни «входа-выхода» здесь нет — это другая механика,
 * чем западные аспекты (тем занимается engine/aspects).
 *
 * Канон: каждая граха смотрит в 7-й знак от себя (полная дришти). У трёх есть
 * особые взгляды сверх седьмого — Марс 4/8, Юпитер 5/9, Сатурн 3/10.
 * «N-й от себя» считается ВКЛЮЧИТЕЛЬНО (свой знак = 1-й), поэтому 7-й от Овна —
 * Весы, а формула смещения (si + N − 1) % 12.
 *
 * Частичные дришти (3/4, 1/2, 1/4 в разных знаках) сюда НЕ входят: астролог
 * читает полные, а «четвертинки» — материал шад-балы/аштакаварги.
 */
import { wholeSignHouse, type VedicPlanet } from './vedic.ts';

/**
 * Полные дришти: граха → номера знаков от себя (включительно).
 *
 * Раху и Кету: школы расходятся — часть традиции аспектов узлам не даёт вовсе,
 * часть даёт «юпитерианские» 5/7/9. РЕШЕНИЕ: по умолчанию узлы НЕ аспектируют
 * (базовая классика, так же считает программа астролога), а школа с 5/7/9
 * включается флагом `includeNodes`.
 */
export const DRISHTI: Record<string, number[]> = {
  'Солнце': [7],
  'Луна': [7],
  'Меркурий': [7],
  'Венера': [7],
  'Марс': [4, 7, 8],
  'Юпитер': [5, 7, 9],
  'Сатурн': [3, 7, 10],
  'Раху': [5, 7, 9],   // только при includeNodes
  'Кету': [5, 7, 9],   // только при includeNodes
};

const NODES = new Set(['Раху', 'Кету']);

/** Аспектирует ли объект вообще (граха ли это и не выключенный ли это узел). */
const aspects = (planet: string, includeNodes: boolean): boolean =>
  DRISHTI[planet] != null && (includeNodes || !NODES.has(planet));

/**
 * Знаки (0..11), куда смотрит граха из знака `signIndex`.
 * Узлы без флага `includeNodes` не смотрят никуда — пустой массив.
 */
export function drishtiSigns(
  planet: string, signIndex: number, includeNodes = false,
): number[] {
  if (!aspects(planet, includeNodes)) return [];
  return DRISHTI[planet].map((n) => (((signIndex + n - 1) % 12) + 12) % 12);
}

export interface DrishtiTarget {
  sign: number;      // знак-цель, 0..11
  house: number;     // дом-цель, 1..12 (whole sign от лагны)
  hits: string[];    // грахи, стоящие в этом знаке — они «под аспектом»
}

export interface DrishtiEntry {
  from: string;      // кто смотрит
  fromHouse: number; // из какого дома (1..12)
  targets: DrishtiTarget[];
}

/**
 * Кто куда смотрит в карте и кто под аспектом. Порядок целей — как в таблице
 * (Сатурн: 3-й, 7-й, 10-й), порядок грах — как в переданном списке.
 *
 * Неведические объекты (Уран, Нептун, астероиды) отсеиваются и как смотрящие,
 * и как «под аспектом»: в джйотише они не читаются. Узлы без `includeNodes`
 * записи не получают вовсе (сами не смотрят), но под аспектом других — стоят.
 */
export function grahaDrishti(
  planets: VedicPlanet[], lagnaSign: number, includeNodes = false,
): DrishtiEntry[] {
  const grahas = planets.filter((p) => DRISHTI[p.name] != null);
  return grahas
    .filter((p) => aspects(p.name, includeNodes))
    .map((p) => ({
      from: p.name,
      fromHouse: p.house,
      targets: drishtiSigns(p.name, p.signIndex, includeNodes).map((sign) => ({
        sign,
        // дом цели — тем же целознаковым правилом, что и дома планет
        house: wholeSignHouse(sign * 30, lagnaSign),
        hits: grahas.filter((q) => q.signIndex === sign).map((q) => q.name),
      })),
    }));
}
