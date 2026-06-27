/**
 * Движок B1 для спайка: swisseph-wasm (prolaxu) — emscripten-сборка канонического
 * Swiss Ephemeris 2.10.03. Единая точка доступа для всех verify-скриптов.
 *
 * Почему этот пакет (решено 2026-06-27): из свежих WASM-сборок только он отдаёт
 * ПОЛНЫЙ низкоуровневый API затмений (sol/lun eclipse when/where/how), а значит
 * номера Сароса (§10.1). Высокоуровневая обёртка eclipse-методов не имеет —
 * зовём C-функции напрямую через Module.ccall (Module лежит в swe.SweModule).
 *
 * Сверяем в режиме Moshier (FLG_MOSEPH), т.к. питон-эталон без файлов эфемерид
 * тоже фактически Moshier — сравнение «яблоки к яблокам».
 */
import SwissEph from 'swisseph-wasm';

export const MOSHIER = 4 | 256;        // FLG_MOSEPH | FLG_SPEED
const TRUE_NODE = 11;

// коды Swiss Ephemeris: Солнце..Нептун = 0..8, истинный узел = 11
export const BODY = {
  'Солнце': 0, 'Луна': 1, 'Меркурий': 2, 'Венера': 3, 'Марс': 4,
  'Юпитер': 5, 'Сатурн': 6, 'Уран': 7, 'Нептун': 8, 'Раху': TRUE_NODE,
};
export const NAMES = ['Солнце','Луна','Меркурий','Венера','Марс',
  'Юпитер','Сатурн','Уран','Нептун','Раху','Кету'];

// биты типа затмения в retflag (swephexp.h)
export const ECL = { TOTAL: 4, ANNULAR: 8, PARTIAL: 16, ANNULAR_TOTAL: 32, PENUMBRAL: 64, CENTRAL: 1, NONCENTRAL: 2 };

export async function createEngine() {
  const swe = new SwissEph();
  await swe.initSwissEph();
  const m = swe.SweModule;

  const dblArr = (n) => { const p = m._malloc(n * 8); for (let i = 0; i < n; i++) m.HEAPF64[(p >> 3) + i] = 0; return p; };
  const rd = (p, i) => m.HEAPF64[(p >> 3) + i];
  const wr = (p, i, v) => { m.HEAPF64[(p >> 3) + i] = v; };

  const version = () => swe.version();
  const julday = (y, mo, d, h = 0) => swe.julday(y, mo, d, h);   // gregflag=1 внутри

  const pos = (jd, code, flags = MOSHIER) => {
    const xx = swe.calc_ut(jd, code, flags);                      // [lon,lat,dist,lonSpd,..]
    return { longitude: xx[0], longitudeSpeed: xx[3] };
  };
  const lon = (jd, name) => {
    if (name === 'Кету') return (pos(jd, TRUE_NODE).longitude + 180) % 360;
    return pos(jd, BODY[name]).longitude;
  };

  // Сарос солнечного: when_glob -> tmax -> where (точка максимума) -> how там.
  // how в точке невидимости вернул бы 0, поэтому обязателен where.
  function solEclipse(jdStart, backward = false) {
    const tret = dblArr(10), serr = m._malloc(256);
    const rf = m.ccall('swe_sol_eclipse_when_glob', 'number',
      ['number','number','number','number','number','number'],
      [jdStart, MOSHIER, 0, tret, backward ? 1 : 0, serr]);
    const tmax = rd(tret, 0);
    const geo = dblArr(10), attrW = dblArr(20);
    m.ccall('swe_sol_eclipse_where', 'number',
      ['number','number','number','number','number'], [tmax, MOSHIER, geo, attrW, serr]);
    const glon = rd(geo, 0), glat = rd(geo, 1);
    const geoIn = dblArr(3); wr(geoIn, 0, glon); wr(geoIn, 1, glat);
    const attr = dblArr(20);
    m.ccall('swe_sol_eclipse_how', 'number',
      ['number','number','number','number','number'], [tmax, MOSHIER, geoIn, attr, serr]);
    const out = { retflag: rf, tret: Array.from({ length: 10 }, (_, i) => rd(tret, i)),
      tmax, saros: Math.round(rd(attr, 9)), member: Math.round(rd(attr, 10)),
      mag: rd(attr, 0), where: [glon, glat] };
    [tret, serr, geo, attrW, geoIn, attr].forEach((p) => m._free(p));
    return out;
  }

  // Сарос лунного: when -> tmax -> how (geopos [0,0,0] годится, видно с ночной стороны).
  function lunEclipse(jdStart, backward = false) {
    const tret = dblArr(10), serr = m._malloc(256);
    const rf = m.ccall('swe_lun_eclipse_when', 'number',
      ['number','number','number','number','number','number'],
      [jdStart, MOSHIER, 0, tret, backward ? 1 : 0, serr]);
    const tmax = rd(tret, 0);
    const geoIn = dblArr(3), attr = dblArr(20);
    m.ccall('swe_lun_eclipse_how', 'number',
      ['number','number','number','number','number'], [tmax, MOSHIER, geoIn, attr, serr]);
    const out = { retflag: rf, tret: Array.from({ length: 10 }, (_, i) => rd(tret, i)),
      tmax, saros: Math.round(rd(attr, 9)), member: Math.round(rd(attr, 10)), mag: rd(attr, 0) };
    [tret, serr, geoIn, attr].forEach((p) => m._free(p));
    return out;
  }

  const close = () => swe.close?.();
  return { version, julday, pos, lon, solEclipse, lunEclipse, close, raw: swe };
}

// Сторож от зависания init/расчёта: падаем с понятной ошибкой, а не висим молча.
export function watchdog(ms = 30_000, label = 'сверка') {
  const t = setTimeout(() => {
    console.error(`\n❌ ТАЙМАУТ ${ms / 1000} с: ${label} зависла (вероятно init/.wasm). Прерываю.`);
    process.exit(2);
  }, ms);
  t.unref();
  return t;
}
