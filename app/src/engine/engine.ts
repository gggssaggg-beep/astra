/**
 * Движок расчётов на swisseph-wasm. Тонкая обёртка (§2.3): инициализация,
 * время (JD↔UTC), позиции объектов, аудит элонгаций. Аспекты — в aspects.ts.
 *
 * Режим по умолчанию SWIEPH (полные файлы — на устройстве). Для сверки с
 * питон-эталоном (Moshier) можно создать движок в режиме 'moshier'.
 */
import SwissEph from 'swisseph-wasm';
import {
  BODIES, MOON, bodyCode, SWE_CODE, ZODIAC, SIGN_GLYPH, PLANET_GLYPH,
  FLAG_SWIEPH, FLAG_MOSEPH, FLAG_SIDEREAL, ayanamsaMode,
} from './constants.ts';
import type { BodyPosition, EphemerisMode, EngineOptions, ZodiacMode } from './types.ts';

export interface Engine {
  readonly mode: EphemerisMode;
  /** Зодиак этого движка: тропический или сидерический (ведический). */
  readonly zodiac: ZodiacMode;
  /** Аянамша (°) на момент jd — сдвиг сидерического круга. 0 в тропическом режиме. */
  ayanamsa(jd: number): number;
  toJD(utc: Date): number;
  fromJD(jd: number): Date;
  /** Долгота объекта (°), с учётом Кету = узел + 180. */
  lon(jd: number, name: string): number;
  /** [долгота°, скорость°/сут]. */
  lonSpeed(jd: number, name: string): [number, number];
  /** Позиции всех объектов из names на момент UTC (по умолчанию базовые). */
  positions(utc: Date, names?: string[]): BodyPosition[];
  /** Аудит элонгаций (Меркурий ≤28°, Венера ≤48°) на момент jd. */
  audit(jd: number): string[];
  /** Следующее СОЛНЕЧНОЕ затмение от jdStart (вперёд): время максимума + Сарос. */
  solEclipse(jdStart: number): EclipseInfo;
  /** Следующее ЛУННОЕ затмение от jdStart (вперёд): время максимума + Сарос. */
  lunEclipse(jdStart: number): EclipseInfo;
  /** Дома: 12 куспидов (°) + Asc/MC на момент jd для места lat/lon (система домов).
   *  null, если swe_houses недоступна в этой сборке WASM (деградируем без домов). */
  houses(jd: number, lat: number, lon: number, system: string): HousesInfo | null;
  /** Ближайший восход/закат Солнца ПОСЛЕ jd для места. JD или null (полярный
   *  день/ночь — светило не пересекает горизонт). */
  sunRiseSet(jd: number, lat: number, lon: number, kind: 'rise' | 'set'): number | null;
  /** Низкоуровневый доступ (для aspects.ts и расширений). */
  readonly flag: number;
  raw: any;
}

export interface HousesInfo { cusps: number[]; asc: number; mc: number; }

/** id системы домов → буква Swiss Ephemeris (equalMC считаем вручную от MC). */
export const HOUSE_SYS: Record<string, string> = {
  horizontal: 'H', placidus: 'P', koch: 'K', porphyry: 'O', regiomontanus: 'R',
  campanus: 'C', equalAsc: 'A', morinus: 'M', alcabitus: 'B',
  wholeSign: 'W',   // целознаковые дома — стандарт джйотиша (дом = знак целиком)
};

export interface EclipseInfo {
  retflag: number;   // биты типа затмения (ECL.*)
  tmax: number;      // JD максимума
  saros: number;     // номер серии Сароса
  member: number;    // номер члена серии
  mag: number;       // магнитуда
}

export function signOf(lon: number): { sign: string; glyph: string; deg: number } {
  const i = ((Math.floor(lon / 30) % 12) + 12) % 12;
  return { sign: ZODIAC[i], glyph: SIGN_GLYPH[i], deg: ((lon % 30) + 30) % 30 };
}

export async function createEngine(
  mode: EphemerisMode = 'swieph',
  opts: EngineOptions = {},
): Promise<Engine> {
  const swe: any = new SwissEph();
  await swe.initSwissEph();
  const m: any = swe.SweModule;   // emscripten Module (нет в .d.ts пакета)
  const zodiac: ZodiacMode = opts.zodiac ?? 'tropical';
  const base = mode === 'moshier' ? FLAG_MOSEPH : FLAG_SWIEPH;
  // В сидерическом режиме аянамшу выбирает swe_set_sid_mode, а сам сдвиг долгот
  // включается флагом расчёта. Тропический движок флага не ставит, поэтому общий
  // на инстанс sid_mode ему безразличен — режимы не мешают друг другу.
  const flag = zodiac === 'sidereal' ? base | FLAG_SIDEREAL : base;
  if (zodiac === 'sidereal') {
    m.ccall('swe_set_sid_mode', null, ['number', 'number', 'number'],
      [ayanamsaMode(opts.ayanamsa), 0, 0]);
  }
  // Узлы: без указания — ИСТИННЫЕ (правило ТЗ для западной части; по ним же
  // сверялся эталон А). В ведическом режиме приложение просит СРЕДНИЕ: так
  // считает классика и так по умолчанию делает Jagannatha Hora (решение
  // Георгия 2026-08-06), а истинные там — переключатель в настройках.
  const nodeCode = opts.nodes === 'mean' ? SWE_CODE.MEAN_NODE : SWE_CODE.TRUE_NODE;

  const toJD = (utc: Date): number => {
    const h = utc.getUTCHours() + utc.getUTCMinutes() / 60
      + utc.getUTCSeconds() / 3600 + utc.getUTCMilliseconds() / 3.6e6;
    return swe.julday(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate(), h);
  };

  // swe_revjul через ccall: jd → (год, мес, день, час-дробь)
  const fromJD = (jd: number): Date => {
    const yP = m._malloc(4), moP = m._malloc(4), dP = m._malloc(4), hP = m._malloc(8);
    m.ccall('swe_revjul', null, ['number', 'number', 'number', 'number', 'number', 'number'],
      [jd, 1, yP, moP, dP, hP]);
    const y = m.HEAP32[yP >> 2], mo = m.HEAP32[moP >> 2], d = m.HEAP32[dP >> 2];
    const h = m.HEAPF64[hP >> 3];
    m._free(yP); m._free(moP); m._free(dP); m._free(hP);
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 60);
    const ss = (h - hh) * 3600 - mm * 60;
    return new Date(Date.UTC(y, mo - 1, d, hh, mm, Math.round(ss)));
  };

  const calc = (jd: number, code: number): { lon: number; lat: number; speed: number } => {
    const xx = swe.calc_ut(jd, code, flag);   // Float64Array[6]
    return { lon: xx[0], lat: xx[1], speed: xx[3] };
  };

  // Узлы считаем выбранным кодом (mean/true), остальные объекты — как обычно.
  const codeOf = (name: string): number =>
    (name === 'Раху' || name === 'Кету') ? nodeCode : bodyCode(name);

  const lon = (jd: number, name: string): number => {
    if (name === 'Кету') return (calc(jd, nodeCode).lon + 180) % 360;
    return calc(jd, codeOf(name)).lon;
  };

  const lonSpeed = (jd: number, name: string): [number, number] => {
    const r = calc(jd, codeOf(name));
    const l = name === 'Кету' ? (r.lon + 180) % 360 : r.lon;
    return [l, r.speed];
  };

  const positions = (utc: Date, names?: string[]): BodyPosition[] => {
    const list = names ?? [MOON, ...Object.keys(BODIES), 'Кету'];
    const jd = toJD(utc);
    return list.map((name) => {
      const r = calc(jd, codeOf(name));
      const l = name === 'Кету' ? (r.lon + 180) % 360 : r.lon;
      // у Кету широта зеркальна узлу: точки лежат по разные стороны эклиптики
      const lat = name === 'Кету' ? -r.lat : r.lat;
      const s = signOf(l);
      return {
        name, glyph: PLANET_GLYPH[name] ?? '•', lon: l,
        sign: s.sign, signGlyph: s.glyph, degInSign: s.deg,
        speed: r.speed, retro: r.speed < 0, lat,
      };
    });
  };

  const angdiff = (a: number, b: number): number => {
    const d = ((a - b) % 360 + 360) % 360;
    return d > 180 ? d - 360 : d;
  };

  const audit = (jd: number): string[] => {
    const warns: string[] = [];
    const sun = calc(jd, SWE_CODE.SUN).lon;
    const merc = Math.abs(angdiff(calc(jd, SWE_CODE.MERCURY).lon, sun));
    const ven = Math.abs(angdiff(calc(jd, SWE_CODE.VENUS).lon, sun));
    if (merc > 28) warns.push(`⚠ Элонгация Меркурия ${merc.toFixed(1)}° > 28°`);
    if (ven > 48) warns.push(`⚠ Элонгация Венеры ${ven.toFixed(1)}° > 48°`);
    return warns;
  };

  // --- затмения (ccall, см. spike/engine.mjs и memory: Сарос = attr[9]/[10]) ---
  const dblArr = (n: number): number => { const p = m._malloc(n * 8); for (let i = 0; i < n; i++) m.HEAPF64[(p >> 3) + i] = 0; return p; };
  const rd = (p: number, i: number): number => m.HEAPF64[(p >> 3) + i];
  const wr = (p: number, i: number, v: number): void => { m.HEAPF64[(p >> 3) + i] = v; };

  const solEclipse = (jdStart: number): EclipseInfo => {
    const tret = dblArr(10), serr = m._malloc(256);
    const rf = m.ccall('swe_sol_eclipse_when_glob', 'number',
      ['number', 'number', 'number', 'number', 'number', 'number'], [jdStart, flag, 0, tret, 0, serr]);
    const tmax = rd(tret, 0);
    const geo = dblArr(10), attrW = dblArr(20);
    m.ccall('swe_sol_eclipse_where', 'number', ['number', 'number', 'number', 'number', 'number'], [tmax, flag, geo, attrW, serr]);
    const geoIn = dblArr(3); wr(geoIn, 0, rd(geo, 0)); wr(geoIn, 1, rd(geo, 1));
    const attr = dblArr(20);
    m.ccall('swe_sol_eclipse_how', 'number', ['number', 'number', 'number', 'number', 'number'], [tmax, flag, geoIn, attr, serr]);
    const out: EclipseInfo = { retflag: rf, tmax, saros: Math.round(rd(attr, 9)), member: Math.round(rd(attr, 10)), mag: rd(attr, 0) };
    [tret, serr, geo, attrW, geoIn, attr].forEach((p) => m._free(p));
    return out;
  };

  const lunEclipse = (jdStart: number): EclipseInfo => {
    const tret = dblArr(10), serr = m._malloc(256);
    const rf = m.ccall('swe_lun_eclipse_when', 'number',
      ['number', 'number', 'number', 'number', 'number', 'number'], [jdStart, flag, 0, tret, 0, serr]);
    const tmax = rd(tret, 0);
    const geoIn = dblArr(3), attr = dblArr(20);
    m.ccall('swe_lun_eclipse_how', 'number', ['number', 'number', 'number', 'number', 'number'], [tmax, flag, geoIn, attr, serr]);
    const out: EclipseInfo = { retflag: rf, tmax, saros: Math.round(rd(attr, 9)), member: Math.round(rd(attr, 10)), mag: rd(attr, 0) };
    [tret, serr, geoIn, attr].forEach((p) => m._free(p));
    return out;
  };

  // Аянамша на момент jd (0 в тропическом режиме — сдвига нет).
  const ayanamsa = (jd: number): number => {
    if (zodiac !== 'sidereal') return 0;
    return m.ccall('swe_get_ayanamsa_ut', 'number', ['number'], [jd]);
  };

  // --- дома (swe_houses через ccall; equalMC — вручную от MC) ---
  const norm360 = (x: number): number => ((x % 360) + 360) % 360;
  const houses = (jd: number, lat: number, lon: number, system: string): HousesInfo | null => {
    try {
      const char = HOUSE_SYS[system] ?? 'P';
      const cuspsP = dblArr(13), ascmcP = dblArr(10);
      // В сидерическом режиме нужен swe_houses_ex с флагом: он сам вычитает
      // аянамшу из куспидов и Asc/MC (иначе лагна уехала бы на ~24°).
      if (zodiac === 'sidereal') {
        m.ccall('swe_houses_ex', 'number',
          ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
          [jd, flag, lat, lon, char.charCodeAt(0), cuspsP, ascmcP]);
      } else {
        m.ccall('swe_houses', 'number',
          ['number', 'number', 'number', 'number', 'number', 'number'],
          [jd, lat, lon, char.charCodeAt(0), cuspsP, ascmcP]);
      }
      const asc = rd(ascmcP, 0), mc = rd(ascmcP, 1);
      let cusps = Array.from({ length: 12 }, (_, i) => rd(cuspsP, i + 1));
      if (system === 'equalMC') cusps = Array.from({ length: 12 }, (_, i) => norm360(mc + (i + 1 - 10) * 30));
      [cuspsP, ascmcP].forEach((p) => m._free(p));
      if (!isFinite(asc) || !isFinite(mc)) return null;
      return { cusps, asc, mc };
    } catch { return null; }   // swe_houses не экспортирована в этой сборке — без домов
  };

  // --- восход/закат (swe_rise_trans) ------------------------------------
  // Флаг SE_BIT_HINDU_RISING = центр диска (256) + без рефракции (512) +
  // геоцентрически без экл. широты (128) = 896. Это индийское соглашение:
  // джйотиш считает восходом момент, когда ЦЕНТР Солнца на горизонте, без
  // поправки на атмосферу. Западный «гражданский» восход (верхний край с
  // рефракцией) даёт другую минуту — и другие границы частей дня у упаграх.
  const HINDU_RISING = 128 + 256 + 512;
  const sunRiseSet = (jd: number, lat: number, lon: number, kind: 'rise' | 'set'): number | null => {
    try {
      const geo = dblArr(3);
      wr(geo, 0, lon); wr(geo, 1, lat); wr(geo, 2, 0);
      const tret = dblArr(10), serr = m._malloc(256);
      const rsmi = (kind === 'rise' ? 1 : 2) | HINDU_RISING;
      const rf = m.ccall('swe_rise_trans', 'number',
        ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
        [jd, SWE_CODE.SUN, 0, flag, rsmi, geo, 0, 0, tret, serr]);
      const t = rd(tret, 0);
      [geo, tret, serr].forEach((p) => m._free(p));
      // -2 = светило вообще не пересекает горизонт в этих сутках (заполярье)
      return rf < 0 || !isFinite(t) ? null : t;
    } catch { return null; }   // swe_rise_trans не экспортирована в этой сборке
  };

  return { mode, zodiac, ayanamsa, toJD, fromJD, lon, lonSpeed, positions, audit,
    solEclipse, lunEclipse, houses, sunRiseSet, flag, raw: swe };
}
