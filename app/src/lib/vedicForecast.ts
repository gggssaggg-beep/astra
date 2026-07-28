/**
 * Прогнозный горизонт для джйотиша — то, что астролог до сих пор вбивала в ИИ
 * руками (образец запроса 2026-07-29): антардаши на ближайшие месяцы + все
 * переходы транзитов за период. Приложение считает, ИИ толкует.
 */
import type { Engine } from '../engine/index.ts';
import { stationsBetween } from '../engine/index.ts';
import { signIndexOf } from './vedic.ts';
import type { DashaPeriod } from './vedic.ts';

export interface AntarWindow {
  maha: string; antar: string; from: Date; to: Date; current: boolean;
}

/** Антардаши, пересекающие окно [from, to] — как в запросе астролога:
 *  «Марс-Венера с 07 июн 2025 до 07 авг 2026». */
export function antarWindows(dashas: DashaPeriod[], from: Date, to: Date): AntarWindow[] {
  const out: AntarWindow[] = [];
  for (const m of dashas) {
    for (const s of m.sub ?? []) {
      if (s.to > from && s.from < to) {
        out.push({ maha: m.lord, antar: s.lord, from: s.from, to: s.to,
          current: from >= s.from && from < s.to });
      }
    }
  }
  return out;
}

export interface SidIngress {
  name: string; at: Date; fromSign: number; toSign: number; retro: boolean;
}

// Луны в расписании нет: она меняет знак каждые ~2¼ дня — за полгода это ~80
// строк шума; лунный уровень астролог смотрит панчангой по дню.
const FORECAST_GRAHAS = ['Солнце', 'Марс', 'Меркурий', 'Юпитер', 'Венера',
  'Сатурн', 'Раху', 'Кету'];

/**
 * Все смены СИДЕРИЧЕСКОГО знака грахами за days суток от from. Суточный шаг +
 * бисекция до ~получаса. Ретро-планета может вернуться в прежний знак — оба
 * перехода честно попадают в список (флаг retro говорит, каким ходом шла).
 */
export function sidIngresses(E: Engine, from: Date, days: number): SidIngress[] {
  const out: SidIngress[] = [];
  const j0 = E.toJD(from);
  for (const name of FORECAST_GRAHAS) {
    let prevJ = j0, prevS = signIndexOf(E.lon(j0, name));
    for (let d = 1; d <= days; d++) {
      const j = j0 + d;
      const s = signIndexOf(E.lon(j, name));
      if (s !== prevS) {
        let a = prevJ, b = j;
        for (let i = 0; i < 12; i++) {
          const m = (a + b) / 2;
          if (signIndexOf(E.lon(m, name)) === prevS) a = m; else b = m;
        }
        out.push({ name, at: E.fromJD(b), fromSign: prevS,
          toSign: signIndexOf(E.lon(b, name)), retro: E.lonSpeed(b, name)[1] < 0 });
      }
      prevJ = j; prevS = s;
    }
  }
  return out.sort((x, y) => +x.at - +y.at);
}

export interface StationInWindow { planet: string; at: Date; toRetro: boolean; sign: number; }

/** Станции (развороты R↔D) пяти планет за окно — узлы и светила не ретроградят. */
export function stationsInWindow(E: Engine, from: Date, to: Date): StationInWindow[] {
  const out: StationInWindow[] = [];
  for (const p of ['Марс', 'Меркурий', 'Юпитер', 'Венера', 'Сатурн']) {
    for (const s of stationsBetween(E, p, from, to)) {
      out.push({ planet: p, at: s.at, toRetro: s.toRetro, sign: signIndexOf(s.lon) });
    }
  }
  return out.sort((a, b) => +a.at - +b.at);
}
