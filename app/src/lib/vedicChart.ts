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
import { buildVedicChart, vimshottari, currentDasha,
  signIndexOf, VEDIC_ORDER_SET, dashaSensitivity, VIMSHOTTARI,
  type VedicChart, type DashaPeriod } from './vedic.ts';
import { vargaSignAt, type VargaId } from './vargas.ts';
import { upagrahas, type SkyForUpagraha, type UpagrahaResult } from './upagraha.ts';
import { mrityuCheck } from './mrityu.ts';
import { grahaYuddha, type Yuddha } from './yuddha.ts';

/** Сокращения планет для клеток диаграммы (в ромб длинные имена не влезают). */
/** Латиница — международный стандарт джйотиш-программ; выбор владелицы
 *  2026-07-29 («так привычнее»). Лагна помечается As, как в тех же программах. */
export const SHORT: Record<string, string> = {
  'Солнце': 'Su', 'Луна': 'Mo', 'Марс': 'Ma', 'Меркурий': 'Me', 'Юпитер': 'Ju',
  'Венера': 'Ve', 'Сатурн': 'Sa', 'Раху': 'Ra', 'Кету': 'Ke',
};
export const LAGNA_SHORT = 'As';

export interface VedicNatal {
  chart: VedicChart;
  dashas: DashaPeriod[];
  now: ReturnType<typeof currentDasha>;
  /** на сколько суток уедут границы даш, если время рождения сдвинуть на минуту */
  dashaDaysPerMinute: number;
  /** упаграхи: пять от Солнца всегда, шесть суточных — если есть восход/закат */
  upagrahas: UpagrahaResult;
  /** граха-юддха: тара-грахи, сошедшиеся в одном знаке ближе градуса. Пусто —
   *  войн в карте нет (обычное дело: сближения такой тесноты редки). */
  yuddha: Yuddha[];
  /** пояс МЕСТА рождения: границы частей суток лежат в нём, не в поясе показа */
  birthTz: string;
  /** Исходные данные расчёта — их и сверяют построчно с другой программой,
   *  когда «даты даш не сходятся» (раунд 2, §2: расхождение почти всегда в
   *  часовом поясе или координатах, а не в математике даш). */
  birthUTC: Date;
  place: { lat: number; lon: number };
  /** аянамша на момент рождения, градусы */
  ayanamsa: number;
}

/** Дни недели en-US → индекс (0 = вс): вара берётся по МЕСТНОЙ дате места
 *  рождения, иначе у рождений под утро день недели уезжает на сутки. */
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekdayIn = (t: Date, tz: string): number =>
  WD.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(t));

/**
 * Небо глазами упаграх: восход/закат и лагна на произвольный момент. Восход
 * считается по индийскому соглашению (центр диска без рефракции) — это зашито
 * в engine.sunRiseSet.
 */
function skyFor(E: Engine, lat: number, lon: number, tz: string): SkyForUpagraha {
  const jd = (t: Date) => E.toJD(t);
  return {
    riseAfter: (t) => { const r = E.sunRiseSet(jd(t), lat, lon, 'rise'); return r == null ? null : E.fromJD(r); },
    setAfter: (t) => { const r = E.sunRiseSet(jd(t), lat, lon, 'set'); return r == null ? null : E.fromJD(r); },
    asc: (t) => E.houses(jd(t), lat, lon, 'wholeSign')?.asc ?? 0,
    weekday: (t) => weekdayIn(t, tz),
  };
}

const lonMap = (pos: BodyPosition[]) => {
  const lons: Record<string, number> = {}, retro: Record<string, boolean> = {};
  for (const p of pos) { lons[p.name] = p.lon; retro[p.name] = p.retro; }
  return { lons, retro };
};

/** Место годится для лагны. Ровно 0,0 — не место рождения, а след старого бага
 *  формы (координаты молча сохранялись нулями, Гвинейский залив). Такие записи
 *  ещё лежат на устройствах: лучше честно сказать «нет места», чем нарисовать
 *  кундали с чужой лагной. */
export const placeUsable = (place: Person['place']): place is NonNullable<Person['place']> =>
  !!place && (place.lat !== 0 || place.lon !== 0);

/** Натальная карта D1 + периоды Вимшоттари. null — нет места рождения (нет лагны). */
export function vedicNatal(E: Engine, p: Person, at: Date = new Date()): VedicNatal | null {
  if (!placeUsable(p.place)) return null;
  const when = birthInstantUTC(p);
  const jd = E.toJD(when);
  const h = E.houses(jd, p.place.lat, p.place.lon, 'wholeSign');
  if (!h) return null;
  // позиции держим целиком: граха-юддхе нужна ещё и широта, а lonMap её теряет
  const pos = E.positions(when, [...VEDIC_ORDER]);
  const { lons, retro } = lonMap(pos);
  const chart = buildVedicChart(lons, retro, h.asc);
  const dashas = vimshottari(lons['Луна'], when);
  const first = VIMSHOTTARI.find((v) => v.lord === dashas[0]?.lord)?.years ?? 20;
  const moonSpeed = E.lonSpeed(jd, 'Луна')[1];
  const sky = skyFor(E, p.place.lat, p.place.lon, p.birthTz);
  return { chart, dashas, now: currentDasha(dashas, at),
    dashaDaysPerMinute: dashaSensitivity(moonSpeed, first),
    upagrahas: upagrahas(when, lons['Солнце'], sky), birthTz: p.birthTz,
    yuddha: grahaYuddha(pos.map((x) => ({ name: x.name, lon: x.lon, retro: x.retro, lat: x.lat }))),
    birthUTC: when, place: { lat: p.place.lat, lon: p.place.lon }, ayanamsa: E.ayanamsa(jd) };
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
/** Пометка мритью бхаги для клетки чертежа: в орбисе / близко к точке. */
const mbMark = (name: string, lon: number): 'hit' | 'strong' | undefined => {
  const h = mrityuCheck(name, lon);
  return h ? (h.strong ? 'strong' : 'hit') : undefined;
};

export const chartCells = (c: VedicChart) => c.houses.map((h) => ({
  house: h.house,
  signIndex: h.signIndex,
  planets: [
    // As в первом доме: без метки лагны непонятно, где начало карты —
    // во всех джйотиш-программах она стоит
    ...(h.house === 1
      ? [{ short: LAGNA_SHORT, deg: Math.floor(c.lagnaLon % 30), retro: false,
          mb: mbMark('Лагна', c.lagnaLon) }]
      : []),
    ...h.planets.map((p) => ({
      short: SHORT[p.name] ?? p.name.slice(0, 2),
      deg: Math.floor(p.degInSign),
      retro: p.retro,
      // красным — попавшие в мритью бхагу (правка астролога, раунд 2 §3)
      mb: mbMark(p.name, p.lon),
    })),
  ],
}));

/** Граха рождения для совмещённого чертежа (то, что даёт VedicChart.planets). */
export interface NatalGraha {
  name: string; signIndex: number; degInSign: number; retro: boolean;
}

/**
 * Клетки ГОЧАРЫ: транзитные грахи, разложенные по домам от заданной лагны
 * (натальной). Так джйотиш читает транзит: «Сатурн идёт по 7-му дому».
 * Неведические объекты (Уран/Нептун/астероиды) отсеиваются здесь же.
 * Используется экраном дня (лагна «моей карты») и «Картами» (лагна выбранного
 * человека) — одна реализация, чтобы не разъезжались.
 *
 * `natal` — грахи рождения (кундали) того же человека. Передан → в клетке идут
 * обе группы: сперва грахи гочары (kind 'transit'), затем грахи рождения
 * (kind 'natal'), и компонент красит их разным цветом. Не передан → всё как
 * было: один список без пометок и один цвет.
 */
export const gocharaCells = (positions: BodyPosition[], lagnaSign: number,
  natal?: NatalGraha[]) =>
  Array.from({ length: 12 }, (_, i) => {
    const si = (lagnaSign + i) % 12;
    const kind = natal ? ('transit' as const) : undefined;
    return {
      house: i + 1,
      signIndex: si,
      planets: [
        ...(i === 0 ? [{ short: LAGNA_SHORT, deg: -1, retro: false }] : []),
        ...positions
          .filter((p) => VEDIC_ORDER_SET.has(p.name) && signIndexOf(p.lon) === si)
          .map((p) => ({
            short: SHORT[p.name] ?? p.name.slice(0, 2),
            deg: Math.floor(p.degInSign), retro: p.retro, kind,
          })),
        ...(natal ?? [])
          .filter((p) => VEDIC_ORDER_SET.has(p.name) && p.signIndex === si)
          .map((p) => ({
            short: SHORT[p.name] ?? p.name.slice(0, 2),
            deg: Math.floor(p.degInSign), retro: p.retro, kind: 'natal' as const,
          })),
      ],
    };
  });

/**
 * Клетки ЛЮБОЙ варги (D9, D10, D30 …). Лагна варги — знак варги Асцендента,
 * дома дальше идут знаками от неё; планета попадает в дом по своему знаку в
 * этой варге. Градус в клетке не пишем: в варге он не читается (там своя,
 * растянутая шкала) — deg −1 компонент понимает как «градуса нет».
 * D1 отдаём обычной сборкой: там дома, градусы и знаки настоящие.
 */
export const vargaCells = (c: VedicChart, id: VargaId) => {
  if (id === 'd1') return chartCells(c);
  const lagna = vargaSignAt(id, c.lagnaLon);
  return Array.from({ length: 12 }, (_, i) => {
    const si = (lagna + i) % 12;
    return {
      house: i + 1,
      signIndex: si,
      planets: [
        ...(i === 0 ? [{ short: LAGNA_SHORT, deg: -1, retro: false }] : []),
        ...c.planets.filter((p) => vargaSignAt(id, p.lon) === si).map((p) => ({
          short: SHORT[p.name] ?? p.name.slice(0, 2),
          deg: -1,
          retro: p.retro,
        })),
      ],
    };
  });
};

/** «12°34′» — градус в знаке так, как его читает астролог. */
export const degMin = (deg: number): string => {
  const d = Math.floor(deg), m = Math.floor((deg - d) * 60);
  return `${d}°${String(m).padStart(2, '0')}′`;
};
