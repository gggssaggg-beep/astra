/**
 * Сборка ведической карты из движка: мост между сидерическими позициями
 * (engine с zodiac:'sidereal') и чистой математикой джйотиша (lib/vedic.ts).
 *
 * Лагна требует места и времени рождения. Без места карту D1 построить нельзя —
 * дома отсчитываются от Асцендента; в этом случае отдаём null и UI объясняет,
 * чего не хватает (так же ведёт себя западная часть с домами).
 */
import type { Engine, BodyPosition } from '../engine/index.ts';
import { VEDIC_ORDER } from '../engine/index.ts';
import type { Person } from './models.ts';
import { birthInstantUTC } from './charts.ts';
import { buildVedicChart, vimshottari, currentDasha, navamshaSign,
  type VedicChart, type DashaPeriod } from './vedic.ts';

/** Сокращения планет для клеток диаграммы (в ромб длинные имена не влезают). */
export const SHORT: Record<string, string> = {
  'Солнце': 'Су', 'Луна': 'Лу', 'Марс': 'Ма', 'Меркурий': 'Ме', 'Юпитер': 'Юп',
  'Венера': 'Ве', 'Сатурн': 'Са', 'Раху': 'Ра', 'Кету': 'Ке',
};

export interface VedicNatal {
  chart: VedicChart;
  dashas: DashaPeriod[];
  now: ReturnType<typeof currentDasha>;
}

const lonMap = (pos: BodyPosition[]) => {
  const lons: Record<string, number> = {}, retro: Record<string, boolean> = {};
  for (const p of pos) { lons[p.name] = p.lon; retro[p.name] = p.retro; }
  return { lons, retro };
};

/** Натальная карта D1 + периоды Вимшоттари. null — нет места рождения (нет лагны). */
export function vedicNatal(E: Engine, p: Person, at: Date = new Date()): VedicNatal | null {
  if (!p.place) return null;
  const when = birthInstantUTC(p);
  const jd = E.toJD(when);
  const h = E.houses(jd, p.place.lat, p.place.lon, 'wholeSign');
  if (!h) return null;
  const { lons, retro } = lonMap(E.positions(when, [...VEDIC_ORDER]));
  const chart = buildVedicChart(lons, retro, h.asc);
  const dashas = vimshottari(lons['Луна'], when);
  return { chart, dashas, now: currentDasha(dashas, at) };
}

/** «Сейчас на небе» в сидерических знаках — карта без домов и без лагны:
 *  астролог смотрит просто, какая планета в каком знаке и градусе. */
export interface VedicSky {
  when: Date;
  planets: { name: string; short: string; sign: string; signIndex: number;
    degInSign: number; retro: boolean; nakshatra: string; pada: number; dignity: string }[];
  tithi: VedicChart['tithi'];
  moonNakshatra: VedicChart['moonNakshatra'];
  moonSign: number;
}

export function vedicSky(E: Engine, when: Date = new Date()): VedicSky {
  const pos = E.positions(when, [...VEDIC_ORDER]);
  const { lons, retro } = lonMap(pos);
  // лагну не знаем — считаем «карту» от Овна: дома в ней не читаем, нужны
  // только знаки, накшатры и достоинства
  const c = buildVedicChart(lons, retro, 0);
  return {
    when,
    planets: c.planets.map((p) => ({
      name: p.name, short: SHORT[p.name] ?? p.name.slice(0, 2),
      sign: p.sign, signIndex: p.signIndex, degInSign: p.degInSign, retro: p.retro,
      nakshatra: p.nakshatra.name, pada: p.nakshatra.pada, dignity: p.dignity.label,
    })),
    tithi: c.tithi, moonNakshatra: c.moonNakshatra, moonSign: c.moonSign,
  };
}

/** Клетки для VedicChart.svelte (северо-индийский ромб). */
export const chartCells = (c: VedicChart) => c.houses.map((h) => ({
  house: h.house,
  signIndex: h.signIndex,
  planets: h.planets.map((p) => ({
    short: SHORT[p.name] ?? p.name.slice(0, 2),
    deg: Math.floor(p.degInSign),
    retro: p.retro,
  })),
}));

/**
 * Клетки карты НАВАМШИ (D9). Лагна D9 — навамша Асцендента, дома дальше идут
 * знаками от неё; планета попадает в дом по своему знаку в D9. Градус в клетке
 * не пишем: в варге он не читается (там своя, растянутая шкала).
 */
export const navamshaCells = (c: VedicChart) => {
  const lagna = navamshaSign(c.lagnaLon);
  return Array.from({ length: 12 }, (_, i) => {
    const si = (lagna + i) % 12;
    return {
      house: i + 1,
      signIndex: si,
      planets: c.planets.filter((p) => p.navamsha === si).map((p) => ({
        short: SHORT[p.name] ?? p.name.slice(0, 2),
        deg: -1,            // «нет градуса» — компонент подпись пропустит
        retro: p.retro,
      })),
    };
  });
};

/** «12°34′» — градус в знаке так, как его читает астролог. */
export const degMin = (deg: number): string => {
  const d = Math.floor(deg), m = Math.floor((deg - d) * 60);
  return `${d}°${String(m).padStart(2, '0')}′`;
};
