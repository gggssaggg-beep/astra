/**
 * События неба на сутки (§2.3 events_on, §3.3): ингрессии (смена знака),
 * станции (ретро↔директ), ново/полнолуния, затмения с № Сароса.
 * Детерминированно, на движке; времена — бисекцией внутри суток.
 */
import { BODIES, MOON, ZODIAC, SIGN_GLYPH, PLANET_GLYPH } from './constants.ts';
import type { Engine } from './engine.ts';
import type { DayEvent } from './types.ts';

const STEP = 1 / 24; // час
const signIdx = (l: number) => Math.floor((((l % 360) + 360) % 360) / 30);
const angdiff = (a: number, b: number) => { const d = ((a - b) % 360 + 360) % 360; return d > 180 ? d - 360 : d; };

function eclType(rf: number): string {
  if (rf & 4) return 'полное';
  if (rf & 8) return 'кольцевое';
  if (rf & 32) return 'гибридное';
  if (rf & 64) return 'полутеневое';
  if (rf & 16) return 'частное';
  return '—';
}

/** dayStart — точный инстант начала суток (UTC-полночь ИЛИ 00:00 выбранного
 *  пояса в UTC; см. zonedDayStartUTC). Окно событий — 24 часа от него. */
export function eventsOn(E: Engine, dayStart: Date): DayEvent[] {
  const day0 = dayStart;
  const jd0 = E.toJD(day0), jd1 = jd0 + 1;
  const out: DayEvent[] = [];

  // --- ингрессии (смена знака) ---
  const ingressObjs = [MOON, ...Object.keys(BODIES), 'Кету'];
  for (const name of ingressObjs) {
    let prev = jd0, prevIdx = signIdx(E.lon(jd0, name));
    for (let j = jd0 + STEP; j <= jd1 + 1e-9; j += STEP) {
      const idx = signIdx(E.lon(j, name));
      if (idx !== prevIdx) {
        let lo = prev, hi = j;
        for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (signIdx(E.lon(mid, name)) === prevIdx) lo = mid; else hi = mid; }
        const t = (lo + hi) / 2, ni = signIdx(E.lon(hi, name));
        out.push({ kind: 'ingress', time: E.fromJD(t), object: name, glyph: PLANET_GLYPH[name] ?? '•',
          sign: ZODIAC[ni], signGlyph: SIGN_GLYPH[ni], text: `${name} → ${ZODIAC[ni]}` });
        prevIdx = idx;
      }
      prev = j;
    }
  }

  // --- станции (ретро↔директ) ---
  for (const name of ['Меркурий', 'Венера', 'Марс', 'Юпитер', 'Сатурн', 'Уран', 'Нептун']) {
    let prev = jd0, prevSp = E.lonSpeed(jd0, name)[1];
    for (let j = jd0 + STEP; j <= jd1 + 1e-9; j += STEP) {
      const sp = E.lonSpeed(j, name)[1];
      if ((prevSp < 0) !== (sp < 0)) {
        let lo = prev, hi = j;
        for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if ((E.lonSpeed(lo, name)[1] < 0) === (E.lonSpeed(mid, name)[1] < 0)) lo = mid; else hi = mid; }
        const retro = sp < 0;
        out.push({ kind: 'station', time: E.fromJD((lo + hi) / 2), object: name, glyph: PLANET_GLYPH[name] ?? '•',
          retro, text: `${name} — станция (${retro ? '℞ ретроградность' : 'D директность'})` });
      }
      prev = j; prevSp = sp;
    }
  }

  // --- затмения на этот день ---
  let solarToday = false, lunarToday = false;
  const sol = E.solEclipse(jd0 - 0.5);
  if (sol.tmax >= jd0 && sol.tmax < jd1) {
    solarToday = true;
    const si = signIdx(E.lon(sol.tmax, 'Солнце'));
    out.push({ kind: 'eclipse', time: E.fromJD(sol.tmax), glyph: '☉', eclipseKind: 'solar',
      eclipseType: eclType(sol.retflag), saros: sol.saros, member: sol.member,
      sign: ZODIAC[si], signGlyph: SIGN_GLYPH[si],
      text: `Солнечное затмение (${eclType(sol.retflag)}) · ${ZODIAC[si]} · Сарос ${sol.saros}/${sol.member}` });
  }
  const lun = E.lunEclipse(jd0 - 0.5);
  if (lun.tmax >= jd0 && lun.tmax < jd1) {
    lunarToday = true;
    const si = signIdx(E.lon(lun.tmax, 'Луна'));
    out.push({ kind: 'eclipse', time: E.fromJD(lun.tmax), glyph: '☽', eclipseKind: 'lunar',
      eclipseType: eclType(lun.retflag), saros: lun.saros, member: lun.member,
      sign: ZODIAC[si], signGlyph: SIGN_GLYPH[si],
      text: `Лунное затмение (${eclType(lun.retflag)}) · ${ZODIAC[si]} · Сарос ${lun.saros}/${lun.member}` });
  }

  // --- ново/полнолуния (если не перекрыты затмением) ---
  const delta = (j: number) => angdiff(E.lon(j, 'Луна'), E.lon(j, 'Солнце'));
  const findZero = (f: (j: number) => number): number | null => {
    let prev = jd0, pv = f(jd0);
    for (let j = jd0 + STEP; j <= jd1 + 1e-9; j += STEP) {
      const v = f(j);
      if ((pv <= 0) !== (v <= 0) && Math.abs(pv - v) < 30) {
        let lo = prev, hi = j;
        for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if ((f(lo) <= 0) !== (f(mid) <= 0)) hi = mid; else lo = mid; }
        return (lo + hi) / 2;
      }
      prev = j; pv = v;
    }
    return null;
  };
  if (!solarToday) {
    const t = findZero(delta);
    if (t != null) { const si = signIdx(E.lon(t, 'Солнце')); out.push({ kind: 'lunation', time: E.fromJD(t), phase: 'new', glyph: '☽', sign: ZODIAC[si], signGlyph: SIGN_GLYPH[si], text: `Новолуние · ${ZODIAC[si]}` }); }
  }
  if (!lunarToday) {
    const t = findZero((j) => angdiff(delta(j), 180));
    if (t != null) { const si = signIdx(E.lon(t, 'Луна')); out.push({ kind: 'lunation', time: E.fromJD(t), phase: 'full', glyph: '☽', sign: ZODIAC[si], signGlyph: SIGN_GLYPH[si], text: `Полнолуние · ${ZODIAC[si]}` }); }
  }

  out.sort((a, b) => a.time.getTime() - b.time.getTime());
  return out;
}
