/**
 * Сборка «карты клиента» для отправки астрологу (кнопка «Написать астрологу» →
 * «Отправить свои данные», просьба владелицы 2026-07-07). Клиент выбирает
 * галочками, что приложить (положения / аспекты / дома); текст строится тем же
 * buildAstroPrompt, что и «Промпт для ИИ», поэтому у астролога карта приходит
 * готовым разбором с корректным расчётом. Доставка — Supabase (lib/community.ts:
 * sendClientChart → таблица client_charts, читает только астролог по RLS).
 */
import type { Engine } from '../engine/index.ts';
import { staticAspects } from '../engine/index.ts';
import type { Person } from './models.ts';
import { HOUSE_SYSTEMS } from './models.ts';
import { natalPositions, birthInstantUTC } from './charts.ts';
import { analyzeHouses, houseOfLon } from './houses.ts';
import { buildAstroPrompt } from './aiPrompt.ts';
import { fmtPosRx } from './format.ts';

export interface ClientChartBlocks { positions: boolean; aspects: boolean; houses: boolean; }

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** Строка рождения человека: «23.03.1989 · 02:40 · Asia/Novosibirsk · Новосибирск». */
export function personBirthLine(p: Person): string {
  const time = (p.unknownTime || !p.birthTime) ? 'время неизвестно' : p.birthTime;
  const place = p.place?.name ? ` · ${p.place.name}` : '';
  const [Y, M, D] = p.birthDate.split('-');
  return `${D}.${M}.${Y} · ${time} · ${p.birthTz}${place}`;
}

/** Собрать текст натальной карты клиента из выбранных блоков. */
export function buildClientChart(
  E: Engine, p: Person,
  opts: { orbOf: (n: string) => number; objects?: string[] | null; houseSystem: string; blocks: ClientChartBlocks },
): { summary: string; text: string } {
  const pos = natalPositions(E, p, opts.objects ?? undefined);
  const hasPlace = !!p.place && (p.place.lat !== 0 || p.place.lon !== 0);
  const houses = (!p.unknownTime && hasPlace)
    ? E.houses(E.toJD(birthInstantUTC(p)), p.place!.lat, p.place!.lon, opts.houseSystem)
    : null;
  const houseOf = (lon: number): string => houses ? ROMAN[houseOfLon(lon, houses.cusps) - 1] : '';
  const houseInfo = (houses && opts.blocks.houses) ? analyzeHouses(houses.cusps) : null;

  const positions = opts.blocks.positions
    ? pos.map((b) => `${b.name} ${fmtPosRx(b.lon, b.retro)}${houseOf(b.lon) ? ` (${houseOf(b.lon)} дом)` : ''}`).join('; ')
    : '(клиент не приложил положения)';

  const aspects: string[] = [];
  if (opts.blocks.aspects) {
    const asp = staticAspects(pos, opts.orbOf);
    if (asp.length) aspects.push(asp.map((a) => `${a.p1} ${a.aspect} ${a.p2}, орбис ${a.orb.toFixed(2)}°`).join('; '));
  }
  const housesLine = houseInfo
    ? houseInfo.map((h) => `${ROMAN[h.house - 1]} ${h.sign} (упр. ${h.rulers.join(', ')})`).join('; ')
    : undefined;

  const text = buildAstroPrompt({
    title: `Натал · ${p.name}`, kind: 'natal',
    houseSystem: HOUSE_SYSTEMS.find((h) => h.id === opts.houseSystem)?.label ?? opts.houseSystem,
    people: [{ name: p.name, birth: personBirthLine(p), positions, houses: housesLine }],
    aspects,
  });
  return { summary: `Натал · ${p.name} · ${personBirthLine(p)}`, text };
}
