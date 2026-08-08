/**
 * Тексты ведических уведомлений — ЧИСТЫЕ функции (без Capacitor и без движка),
 * поэтому проверяются в Node: `node test/vedicnotify.mjs`. Движок зовёт
 * `reminders.ts`, сюда приходят уже посчитанные величины.
 *
 * Зачем этот файл вообще (раунд 2, §5). Жалоба владелицы: «приходят аспекты,
 * которых нет». Разбор: уведомления были ТОЛЬКО западные — «Точный аспект:
 * Марс □ Сатурн». В ведическом режиме таких аспектов на экранах нет вовсе
 * (там дришти по целым знакам и гочара), поэтому пришедшее выглядело
 * несуществующим. Правило проекта — «два интерфейса, не путать»: значит у
 * джйотиша должны быть СВОИ поводы и свой словарь, а не перевод западных.
 *
 * Ведических поводов два, по образцу западной пары «сводка + точечные»:
 *   1) панчанга дня — вара, титхи, накшатра, йога, карана (с моментами смены);
 *   2) важные даты карты — смены даш, заход грах в знак, Саде Сати, узловые
 *      возвращения (лента `vedicTimeline`, она же на экране разбора).
 *
 * Школы включаются НЕЗАВИСИМО: можно обе сразу. Чтобы в шторке уведомлений
 * было видно, чьё это, ведические помечены словом «Джйотиш» в заголовке —
 * западные остаются как были.
 */
import type { Panchanga } from './panchanga.ts';
import type { TimelineEvent } from './vedicTimeline.ts';

export const VEDIC_TAG = 'Джйотиш';

/** Момент → «14:20» в нужном поясе; передаётся снаружи (в Node пояса свои). */
export type TimeFmt = (d: Date) => string;

export interface Ends {
  /** когда Луна уйдёт в следующую накшатру и в какую */
  nakshatra?: { at: Date; next: string };
  /** когда закончится текущий титхи */
  tithi?: { at: Date };
}

/**
 * Тело сводки-панчанги. Порядок членов — канонический (вара, титхи, накшатра,
 * йога, карана); у титхи и накшатры дописано, до какого часа они держатся —
 * это первое, что смотрят в дневной панчанге.
 */
export function panchangaBody(p: Panchanga, ends: Ends, fmtTime: TimeFmt): string {
  const parts: string[] = [];
  parts.push(`${p.vara.name} (${p.vara.day}, владыка ${p.vara.lord})`);
  const tithiTail = ends.tithi ? ` до ${fmtTime(ends.tithi.at)}` : '';
  parts.push(`титхи ${p.tithi.index} ${p.tithi.name}, ${p.tithi.paksha}-пакша${tithiTail}`);
  const nakTail = ends.nakshatra
    ? ` до ${fmtTime(ends.nakshatra.at)} → ${ends.nakshatra.next}` : '';
  parts.push(`накшатра ${p.nakshatra.name}, пада ${p.nakshatra.pada}${nakTail}`);
  parts.push(`йога ${p.yoga.name}`);
  parts.push(`карана ${p.karana.name}`);
  return parts.join(' · ');
}

/** Заголовок сводки-панчанги: помечен школой, чтобы не путался с западной. */
export const panchangaTitle = (): string => `${VEDIC_TAG} · панчанга дня`;

/**
 * Какие события ленты вообще годятся в уведомление. Станции (weight 0) —
 * фоновые, они уже есть в западной сводке ретро-строкой; смены антардаш и
 * заходы грах — то, ради чего это включают.
 */
export const NOTIFY_KINDS: TimelineEvent['kind'][] =
  ['dasha', 'antar', 'ingress', 'saturn', 'node'];

/**
 * Отбор событий для уведомлений: нужного рода, строго в будущем и в пределах
 * горизонта. Ограничение по количеству — чтобы одна смена знака не выгребла
 * весь ID-диапазон (у Сатурна в один момент бывает и заход, и фаза Саде Сати).
 */
export function pickVedicEvents(
  events: TimelineEvent[], from: Date, horizonDays: number, limit: number,
): TimelineEvent[] {
  const t0 = from.getTime(), t1 = t0 + horizonDays * 86_400_000;
  return events
    .filter((e) => NOTIFY_KINDS.includes(e.kind))
    .filter((e) => e.at.getTime() > t0 && e.at.getTime() <= t1)
    .sort((a, b) => +a.at - +b.at)
    .slice(0, limit);
}

/** Заголовок точечного ведического уведомления. */
export const vedicEventTitle = (e: TimelineEvent): string => `${VEDIC_TAG} · ${e.title}`;

/** Тело: пояснение из ленты, обрезанное до читаемой в шторке длины. */
export function vedicEventBody(e: TimelineEvent, max = 180): string {
  const s = e.detail.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:—-]+$/, '')}…`;
}
