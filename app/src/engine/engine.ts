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
  FLAG_SWIEPH, FLAG_MOSEPH,
} from './constants.ts';
import type { BodyPosition, EphemerisMode } from './types.ts';

export interface Engine {
  readonly mode: EphemerisMode;
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
  /** Низкоуровневый доступ (для aspects.ts и расширений). */
  readonly flag: number;
  raw: any;
}

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

export async function createEngine(mode: EphemerisMode = 'swieph'): Promise<Engine> {
  const swe: any = new SwissEph();
  await swe.initSwissEph();
  const m: any = swe.SweModule;   // emscripten Module (нет в .d.ts пакета)
  const flag = mode === 'moshier' ? FLAG_MOSEPH : FLAG_SWIEPH;

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

  const calc = (jd: number, code: number): { lon: number; speed: number } => {
    const xx = swe.calc_ut(jd, code, flag);   // Float64Array[6]
    return { lon: xx[0], speed: xx[3] };
  };

  const lon = (jd: number, name: string): number => {
    if (name === 'Кету') return (calc(jd, SWE_CODE.TRUE_NODE).lon + 180) % 360;
    return calc(jd, bodyCode(name)).lon;
  };

  const lonSpeed = (jd: number, name: string): [number, number] => {
    const r = calc(jd, bodyCode(name));
    const l = name === 'Кету' ? (r.lon + 180) % 360 : r.lon;
    return [l, r.speed];
  };

  const positions = (utc: Date, names?: string[]): BodyPosition[] => {
    const list = names ?? [MOON, ...Object.keys(BODIES), 'Кету'];
    const jd = toJD(utc);
    return list.map((name) => {
      const [l, speed] = lonSpeed(jd, name);
      const s = signOf(l);
      return {
        name, glyph: PLANET_GLYPH[name] ?? '•', lon: l,
        sign: s.sign, signGlyph: s.glyph, degInSign: s.deg,
        speed, retro: speed < 0,
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

  return { mode, toJD, fromJD, lon, lonSpeed, positions, audit, solEclipse, lunEclipse, flag, raw: swe };
}
