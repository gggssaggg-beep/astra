/**
 * СОБЫТИЯ ДНЯ для джйотиша — единый список всего, что сегодня МЕНЯЕТСЯ
 * (правка астролога 2026-07-29: «показывать переходы всех грах, а не только
 * быстрых, плюс смены даш и начала йог; и поднять раздел выше»).
 *
 * Отдельного блока «Переходы сегодня» больше нет — он влился сюда: строка
 * перехода даёт откуда → куда и дом с описанием в два слова, без трактовки
 * (её место — страница грахи).
 *
 * Источники: смены знака (все грахи, `ingressesOnDay`), станции и затмения
 * (готовый список событий движка), границы накшатры/титхи/йоги внутри суток и
 * смены периодов Вимшоттари, если известна карта человека.
 */
import type { Engine } from '../engine/index.ts';
import type { DayEvent } from '../engine/index.ts';
import { ZODIAC, PLANET_GLYPH } from '../engine/index.ts';
import { nakshatraOf, tithiOf, VEDIC_ORDER_SET, BHAVA_THEME, NAK_SPAN,
  type DashaPeriod } from './vedic.ts';
import { YOGAS, YOGA_SPAN } from './panchanga.ts';
import { ingressesOnDay } from './vedicForecast.ts';

export type VedicEventKind =
  | 'ingress' | 'station' | 'eclipse' | 'nakshatra' | 'tithi' | 'yoga' | 'dasha';

export interface VedicDayEvent {
  at: Date;
  kind: VedicEventKind;
  glyph: string;
  /** «Сатурн: Рыбы → Овен» — откуда куда, без трактовки */
  title: string;
  /** «входит в 5-й дом — дети, творчество, разум» */
  note?: string;
  /** 2 — медленные грахи и даши (событие месяцев), 1 — обычное, 0 — лунное */
  weight: 0 | 1 | 2;
}

const norm = (d: number): number => ((d % 360) + 360) % 360;
const SLOW = new Set(['Юпитер', 'Сатурн', 'Раху', 'Кету']);

/** Все моменты внутри суток, где меняется целочисленный индекс f(jd). */
function boundaries(E: Engine, jd0: number, jd1: number, f: (jd: number) => number,
  stepHours = 1): number[] {
  const step = stepHours / 24;
  const out: number[] = [];
  let prev = jd0, prevIdx = f(jd0);
  for (let j = jd0 + step; j <= jd1 + 1e-9; j += step) {
    const idx = f(j);
    if (idx !== prevIdx) {
      let lo = prev, hi = j;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (f(mid) === prevIdx) lo = mid; else hi = mid;
      }
      out.push(hi);
      prevIdx = idx;
    }
    prev = j;
  }
  return out;
}

export interface VedicEventsOpts {
  /** знак лагны «моей карты» — без него дом перехода не показываем */
  lagnaSign?: number | null;
  /** периоды Вимшоттари «моей карты» — для смен маха/антардаши */
  dashas?: DashaPeriod[] | null;
  /** готовые события движка (кэш дня): берём станции и затмения */
  base?: DayEvent[];
}

/**
 * Список событий суток от `dayStart` (инстант начала суток в поясе показа).
 * Отсортирован по времени: день читается сверху вниз.
 */
export function vedicDayEvents(E: Engine, dayStart: Date, opts: VedicEventsOpts = {}): VedicDayEvent[] {
  const { lagnaSign = null, dashas = null, base = [] } = opts;
  const jd0 = E.toJD(dayStart), jd1 = jd0 + 1;
  const out: VedicDayEvent[] = [];

  // 1. смены знака — все грахи, включая медленные (Сатурн/Юпитер/узлы)
  for (const g of ingressesOnDay(E, dayStart, lagnaSign)) {
    out.push({
      at: g.at, kind: 'ingress', glyph: PLANET_GLYPH[g.name] ?? '•',
      title: `${g.name}: ${ZODIAC[g.fromSign]} → ${ZODIAC[g.toSign]}${g.retro ? ' ℞' : ''}`,
      note: g.house ? `входит в ${g.house}-й дом — ${BHAVA_THEME[g.house]}` : undefined,
      weight: SLOW.has(g.name) ? 2 : g.name === 'Луна' ? 0 : 1,
    });
  }

  // 2. станции и затмения — из общего списка движка, только ведические грахи.
  //    Затмение (грахана) в джйотише — событие само по себе, оставляем всегда.
  for (const e of base) {
    if (e.kind === 'station' && e.object && VEDIC_ORDER_SET.has(e.object)) {
      out.push({
        at: e.time, kind: 'station', glyph: e.glyph ?? '•',
        title: `${e.object}: ${e.retro ? 'разворот в попятный ход' : 'разворот в прямой ход'}`,
        note: e.retro ? 'вакри — тема уходит на пересмотр' : 'марги — тема снова идёт вперёд',
        weight: SLOW.has(e.object) ? 2 : 1,
      });
    } else if (e.kind === 'eclipse') {
      out.push({
        at: e.time, kind: 'eclipse', glyph: e.eclipseKind === 'solar' ? '☉' : '☽',
        title: `Грахана — ${e.eclipseKind === 'solar' ? 'солнечное' : 'лунное'} затмение${e.eclipseType && e.eclipseType !== '—' ? `, ${e.eclipseType}` : ''}`,
        note: e.sign ? `в знаке ${e.sign}` : undefined,
        weight: 2,
      });
    }
  }

  // 3. границы накшатры, титхи и йоги внутри суток
  const moon = (jd: number) => E.lon(jd, 'Луна');
  const sun = (jd: number) => E.lon(jd, 'Солнце');
  for (const jd of boundaries(E, jd0, jd1, (j) => Math.floor(norm(moon(j)) / NAK_SPAN))) {
    const before = nakshatraOf(moon(jd - 1e-4)).name, after = nakshatraOf(moon(jd + 1e-4)).name;
    out.push({ at: E.fromJD(jd), kind: 'nakshatra', glyph: '☽',
      title: `Луна: ${before} → ${after}`, weight: 0 });
  }
  for (const jd of boundaries(E, jd0, jd1, (j) => Math.floor(norm(moon(j) - sun(j)) / 12))) {
    const before = tithiOf(sun(jd - 1e-4), moon(jd - 1e-4));
    const after = tithiOf(sun(jd + 1e-4), moon(jd + 1e-4));
    // граница 14→15 — это ровно полнолуние, 29→0 — новолуние
    const mark = after.index === 16 ? 'полнолуние' : after.index === 1 ? 'новолуние' : undefined;
    out.push({ at: E.fromJD(jd), kind: 'tithi', glyph: '☽',
      title: `Титхи: ${before.name} → ${after.name} (${after.paksha})`,
      note: mark, weight: mark ? 1 : 0 });
  }
  for (const jd of boundaries(E, jd0, jd1, (j) => Math.floor(norm(moon(j) + sun(j)) / YOGA_SPAN))) {
    const bi = Math.floor(norm(moon(jd - 1e-4) + sun(jd - 1e-4)) / YOGA_SPAN);
    const ai = Math.floor(norm(moon(jd + 1e-4) + sun(jd + 1e-4)) / YOGA_SPAN);
    out.push({ at: E.fromJD(jd), kind: 'yoga', glyph: '✧',
      title: `Йога: ${YOGAS[bi]} → ${YOGAS[ai]}`, weight: 0 });
  }

  // 4. смены периодов Вимшоттари «моей карты» (маха и антардаша)
  if (dashas?.length) {
    const from = dayStart.getTime(), to = from + 86_400_000;
    for (const m of dashas) {
      if (+m.from >= from && +m.from < to) {
        out.push({ at: m.from, kind: 'dasha', glyph: PLANET_GLYPH[m.lord] ?? '•',
          title: `Махадаша: начинается период ${m.lord}`,
          note: 'большой период жизни сменился', weight: 2 });
      }
      for (const a of m.sub ?? []) {
        if (+a.from >= from && +a.from < to) {
          out.push({ at: a.from, kind: 'dasha', glyph: PLANET_GLYPH[a.lord] ?? '•',
            title: `Антардаша: ${m.lord} — ${a.lord}`,
            note: 'подпериод сменился', weight: 2 });
        }
      }
    }
  }

  return out.sort((x, y) => +x.at - +y.at);
}

/** Как назвать повод в уведомлении — СЛОВАРЬ ДЖЙОТИША. Ни «аспекта», ни
 *  «транзита», ни «натала»: гочара, панчанга, вакри-марги, грахана, даша
 *  (правило «два интерфейса, не путать»). */
export const VEDIC_EVENT_KIND_TITLE: Record<VedicEventKind, string> = {
  ingress: 'Гочара',
  station: 'Ход грахи',
  eclipse: 'Грахана',
  nakshatra: 'Панчанга · накшатра',
  tithi: 'Панчанга · титхи',
  yoga: 'Панчанга · йога',
  dasha: 'Даша',
};

/** Текст ведического уведомления: заголовок с глифом грахи и вид повода,
 *  тело — что именно меняется (и дом моей кундали, если лагна известна).
 *  Разделитель «·», а не тире: в самой пояснительной строке тире уже есть
 *  («входит в 12-й дом — траты, уход, сон»), два подряд читаются кашей. */
export function vedicNotifyText(ev: VedicDayEvent): { title: string; body: string } {
  return {
    title: `${ev.glyph} ${VEDIC_EVENT_KIND_TITLE[ev.kind]}`,
    body: ev.note ? `${ev.title} · ${ev.note}` : ev.title,
  };
}
