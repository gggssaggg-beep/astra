/**
 * «Важные даты» — лента событий карты вперёд, чтобы астролог видел сроки БЕЗ
 * обращения к ИИ (запрос владелицы 2026-07-29).
 *
 * Что сюда попадает и почему: смены антардаш (меняется тон периода), заход
 * медленных грах в новый знак (Юпитер год в знаке, Сатурн 2,5 — их проход и
 * задаёт «главу» жизни), фазы Саде Сати и станции Сатурна от Луны, узловые
 * возвращения, развороты медленных в ретро.
 *
 * Быстрые грахи (Луна, Меркурий, Венера, Солнце, Марс) в ленту НЕ идут: они
 * меняют знак по нескольку раз в год и утопили бы важное в шуме — для них есть
 * блок «Переходы сегодня» на экране дня.
 */
import type { Engine } from '../engine/index.ts';
import { ZODIAC, stationsBetween } from '../engine/index.ts';
import { signIndexOf, saturnPeriods, nodeReturn, BHAVA_THEME } from './vedic.ts';
import type { DashaPeriod } from './vedic.ts';
import { mrityuDegree, MRITYU_ORB_MIN_DEFAULT } from './mrityu.ts';

export type TimelineKind = 'dasha' | 'antar' | 'ingress' | 'saturn' | 'node' | 'station' | 'mrityu';

export interface TimelineEvent {
  at: Date;
  kind: TimelineKind;
  title: string;      // короткая строка события
  detail: string;     // что это значит
  /** насколько крупное: 2 — глава жизни, 1 — заметное, 0 — фон */
  weight: 0 | 1 | 2;
}

/** Медленные грахи: их проход по знаку и есть «глава» в жизни карты. */
const SLOW = ['Юпитер', 'Сатурн', 'Раху', 'Кету'];

const ORD = (h: number): string => `${h}-й`;

/**
 * Лента важных дат на `years` лет вперёд от `from`.
 * lagnaSign/moonSign — из натальной карты: без них дома и Саде Сати не считаются.
 */
export function vedicTimeline(
  E: Engine,
  dashas: DashaPeriod[],
  natal: { lagnaSign: number; moonSign: number; rahuSign: number },
  from: Date,
  years = 3,
): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  const to = new Date(from.getTime() + years * 365.25 * 86400000);
  const house = (sign: number) => ((sign - natal.lagnaSign + 12) % 12) + 1;

  // ── смены даш ──
  for (const m of dashas) {
    if (m.from > from && m.from < to) {
      out.push({ at: m.from, kind: 'dasha', weight: 2,
        title: `Махадаша ${m.lord}`,
        detail: `Начинается большой период ${m.lord}. Меняется сам тон жизни на годы — `
          + 'то, чем человек занят и что даётся легче всего.' });
    }
    for (const s of m.sub ?? []) {
      if (s.from > from && s.from < to) {
        out.push({ at: s.from, kind: 'antar', weight: 1,
          title: `${m.lord} — ${s.lord}`,
          detail: `Подпериод ${s.lord} внутри махадаши ${m.lord}: большая тема остаётся, `
            + 'но окрашивается по-новому.' });
      }
    }
  }

  // ── заход медленных в новый знак ──
  const j0 = E.toJD(from), j1 = E.toJD(to);
  for (const name of SLOW) {
    let prevJ = j0, prevS = signIndexOf(E.lon(j0, name));
    for (let j = j0 + 5; j <= j1; j += 5) {
      const s = signIndexOf(E.lon(j, name));
      if (s !== prevS) {
        let a = prevJ, b = j;
        for (let i = 0; i < 16; i++) {
          const m = (a + b) / 2;
          if (signIndexOf(E.lon(m, name)) === prevS) a = m; else b = m;
        }
        const at = E.fromJD(b), sign = signIndexOf(E.lon(b, name));
        const h = house(sign);
        const retro = E.lonSpeed(b, name)[1] < 0;
        out.push({ at, kind: 'ingress', weight: 2,
          title: `${name} → ${ZODIAC[sign]}${retro ? ' (ретро)' : ''}`,
          detail: `Входит в ${ORD(h)} дом — ${BHAVA_THEME[h]}. Тема дома включается на весь `
            + `срок прохода: у Юпитера это около года, у Сатурна — до двух с половиной лет.` });
        // Саде Сати и станции Сатурна пересчитываем на момент захода
        if (name === 'Сатурн') {
          const per = saturnPeriods(natal.moonSign, natal.lagnaSign, sign);
          for (const label of per) {
            out.push({ at, kind: 'saturn', weight: 2, title: label.split(' —')[0],
              detail: `${label}. Период высокой нагрузки: требует режима, трезвого расчёта `
                + 'и терпения — но именно в нём вызревает то, что потом держится долго.' });
          }
        }
        if (name === 'Раху') {
          const nr = nodeReturn(natal.rahuSign, sign);
          if (nr) out.push({ at, kind: 'node', weight: 2, title: nr.split(' —')[0],
            detail: `${nr}. Узловые возвращения приходят примерно раз в 18 лет и разворачивают `
              + 'то, что человек осваивает, а что уже пройдено.' });
        }
        prevS = s;
      }
      prevJ = j;
    }
  }

  // ── проход медленных через мритью бхагу (просьба астролога 12.08.2026) ──
  // Только медленные, по тому же правилу, что и весь этот файл: Солнце и Марс
  // проходят свой градус в каждом знаке, то есть по десятку раз в год — лента
  // превратилась бы в шум. У Юпитера и Сатурна это событие раз в год-два.
  // Момент — точное попадание в градус; в скобках срок, пока граха в орбисе.
  for (const name of SLOW) {
    let prevJ = j0, prevOff = null as number | null;
    for (let j = j0 + 1; j <= j1; j += 1) {
      const lon = E.lon(j, name);
      const sign = signIndexOf(lon);
      const degree = mrityuDegree(name, sign);
      const off = degree == null ? null : lon - sign * 30 - degree;
      // разные знаки → точка пройдена; смена знака рвёт отсчёт (prevOff = null)
      if (prevOff != null && off != null && Math.sign(off) !== Math.sign(prevOff)
          && Math.abs(off - prevOff) < 5) {
        let a = prevJ, b = j;
        for (let i = 0; i < 20; i++) {
          const m = (a + b) / 2;
          const l = E.lon(m, name);
          const o = l - signIndexOf(l) * 30 - (mrityuDegree(name, signIndexOf(l)) ?? 0);
          if (Math.sign(o) === Math.sign(prevOff)) a = m; else b = m;
        }
        const at = E.fromJD(b);
        out.push({ at, kind: 'mrityu', weight: 1,
          title: `${name} в мритью бхаге ${ZODIAC[sign]}`,
          detail: `${name} проходит критический градус (${degree}° ${ZODIAC[sign]}) — классика `
            + 'считает граху в нём лишённой сил. Читается не как беда, а как жёсткий урок по её '
            + `теме; влияние держится, пока граха в пределах ${MRITYU_ORB_MIN_DEFAULT}′ от точки.` });
      }
      prevOff = off; prevJ = j;
    }
  }

  // ── развороты медленных ──
  for (const p of ['Юпитер', 'Сатурн']) {
    for (const s of stationsBetween(E, p, from, to)) {
      out.push({ at: s.at, kind: 'station', weight: 0,
        title: `${p} ${s.toRetro ? '→ ретро' : '→ прямой ход'}`,
        detail: s.toRetro
          ? `${p} разворачивается в ${ZODIAC[signIndexOf(s.lon)]}: тема его дома уходит вглубь, `
            + 'время пересмотра, а не новых шагов.'
          : `${p} снова идёт вперёд в ${ZODIAC[signIndexOf(s.lon)]}: то, что стояло, сдвигается.` });
    }
  }

  return out.sort((a, b) => +a.at - +b.at);
}
