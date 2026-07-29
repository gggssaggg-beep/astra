/**
 * Сборка «карты клиента» для отправки астрологу (кнопки «Отправить астрологу» /
 * «через Telegram» в ui/AstrologerSheet). Астролог должна получить САМУ КАРТУ —
 * структурированные данные рождения (Person), которые добавляются к ней В ПРОГРАММУ
 * и дальше считаются локально (колесо/аспекты/дома/транзиты), — а НЕ ИИ-промпт
 * (требование владелицы 2026-07-07). Поэтому payload = JSON-конверт {person, card}:
 *   • person — данные рождения (кнопка «➕ Добавить карту в программу»);
 *   • card   — человекочитаемая карточка (превью у астролога, текст для Telegram).
 * Доставка — Supabase (lib/community.ts: sendClientChart → таблица client_charts).
 */
import type { Engine } from '../engine/index.ts';
import { staticAspects } from '../engine/index.ts';
import type { Person } from './models.ts';
import { HOUSE_SYSTEMS } from './models.ts';
import { natalPositions, birthInstantUTC } from './charts.ts';
import { analyzeHouses, houseOfLon } from './houses.ts';
import { fmtPosRx, tzLabel } from './format.ts';

export interface ClientChartBlocks { positions: boolean; aspects: boolean; houses: boolean; }

/** Конверт в payload строки client_charts: сама карта + читаемое превью. */
export interface ClientChartEnvelope { v: 1; person: Person; card: string; }

/** Разобрать payload входящей карты. Новый формат — JSON-конверт с person;
 *  старые/чужие строки (или ИИ-промпт) → null, показываем как текст. */
export function parseChartEnvelope(payload: string): ClientChartEnvelope | null {
  try {
    const o = JSON.parse(payload);
    if (o && o.person && typeof o.person.birthDate === 'string') return o as ClientChartEnvelope;
  } catch { /* не JSON — легаси-текст */ }
  return null;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** Строка рождения человека: «23.03.1989 · 02:40 · Asia/Novosibirsk · Новосибирск». */
export function personBirthLine(p: Person): string {
  const time = (p.unknownTime || !p.birthTime) ? 'время неизвестно' : p.birthTime;
  const place = p.place?.name ? ` · ${p.place.name}` : '';
  const [Y, M, D] = p.birthDate.split('-');
  return `${D}.${M}.${Y} · ${time} · ${tzLabel(p.birthTz)}${place}`;
}

export interface ClientChartResult { summary: string; card: string; person: Person; payload: string; }

/** Собрать карту клиента: структурированный Person + читаемая карточка + JSON-конверт. */
export function buildClientChart(
  E: Engine, p: Person,
  opts: { orbOf: (n: string) => number; objects?: string[] | null; houseSystem: string; blocks: ClientChartBlocks },
): ClientChartResult {
  const pos = natalPositions(E, p, opts.objects ?? undefined);
  const hasPlace = !!p.place && (p.place.lat !== 0 || p.place.lon !== 0);
  const houses = (!p.unknownTime && hasPlace)
    ? E.houses(E.toJD(birthInstantUTC(p)), p.place!.lat, p.place!.lon, opts.houseSystem)
    : null;
  const houseOf = (lon: number): string => houses ? ROMAN[houseOfLon(lon, houses.cusps) - 1] : '';
  const houseInfo = (houses && opts.blocks.houses) ? analyzeHouses(houses.cusps) : null;

  // --- читаемая карточка (НЕ ИИ-промпт): просто данные карты по-человечески ---
  const L: string[] = [`Карта клиента · ${p.name}`, `Рождение: ${personBirthLine(p)}`];
  if (houseInfo) {
    const hsLabel = HOUSE_SYSTEMS.find((h) => h.id === opts.houseSystem)?.label ?? opts.houseSystem;
    L.push(`Система домов: ${hsLabel}`);
  }
  if (opts.blocks.positions) {
    L.push('Положения: ' + pos.map((b) =>
      `${b.name} ${fmtPosRx(b.lon, b.retro)}${houseOf(b.lon) ? ` (${houseOf(b.lon)} дом)` : ''}`).join('; '));
  }
  if (opts.blocks.aspects) {
    const asp = staticAspects(pos, opts.orbOf);
    L.push('Аспекты: ' + (asp.length
      ? asp.map((a) => `${a.p1} ${a.aspect} ${a.p2}, орбис ${a.orb.toFixed(2)}°`).join('; ')
      : 'нет в орбисе'));
  }
  if (houseInfo) {
    L.push('Дома: ' + houseInfo.map((h) => `${ROMAN[h.house - 1]} ${h.sign} (упр. ${h.rulers.join(', ')})`).join('; '));
  }
  const card = L.join('\n');

  const payload = JSON.stringify({ v: 1, person: p, card } satisfies ClientChartEnvelope);
  return { summary: `Натал · ${p.name} · ${personBirthLine(p)}`, card, person: p, payload };
}
