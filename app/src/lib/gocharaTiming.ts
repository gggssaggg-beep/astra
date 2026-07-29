/**
 * СРОКИ транзита грахи по знаку: когда вошла, когда выйдет и когда была здесь
 * раньше (правка астролога 2026-07-29: «тут же можно посмотреть, когда похожие
 * транзиты были в прошлом»).
 *
 * Один проход сканирования по времени с шагом под скорость грахи, границы
 * уточняются делением пополам. РЕТРОГРАДНЫЕ ЗАХОДЫ СКЛЕИВАЮТСЯ: Юпитер входит
 * в знак, откатывается назад и заходит снова — для астролога это ОДИН проход
 * («Юпитер в Раке с октября 2025»), а не три обрывка.
 */
import type { Engine } from '../engine/index.ts';
import { signIndexOf } from './vedic.ts';

/** Шаг сканирования, глубина назад/вперёд и склейка ретро-заходов (сутки). */
const SCAN: Record<string, { step: number; back: number; fwd: number; gap: number }> = {
  'Луна':      { step: 0.2,  back: 60,     fwd: 40,   gap: 2 },
  'Меркурий':  { step: 1,    back: 500,    fwd: 200,  gap: 90 },
  'Венера':    { step: 1,    back: 700,    fwd: 300,  gap: 120 },
  'Солнце':    { step: 1,    back: 500,    fwd: 60,   gap: 30 },
  'Марс':      { step: 2,    back: 1600,   fwd: 500,  gap: 200 },
  'Юпитер':    { step: 5,    back: 5600,   fwd: 900,  gap: 400 },
  'Сатурн':    { step: 10,   back: 13_000, fwd: 1800, gap: 500 },
  'Раху':      { step: 10,   back: 8000,   fwd: 900,  gap: 200 },
  'Кету':      { step: 10,   back: 8000,   fwd: 900,  gap: 200 },
};
const DEF = { step: 5, back: 3000, fwd: 600, gap: 200 };
const DAY = 86_400_000;

const cfg = (name: string) => SCAN[name] ?? DEF;

/** Момент пересечения границы знака между jd0 (в знаке) и jd1 (вне). */
function edge(E: Engine, name: string, sign: number, jd0: number, jd1: number): number {
  let lo = jd0, hi = jd1;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (signIndexOf(E.lon(mid, name)) === sign) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface Passage {
  /** null — начало дальше глубины поиска (Сатурн, узлы) */
  from: Date | null;
  /** null — конец дальше глубины поиска */
  to: Date | null;
  /** идёт прямо сейчас */
  current: boolean;
}

/**
 * Проходы грахи по знаку `sign` вокруг момента `at`: первым — текущий (если
 * граха в этом знаке сейчас), дальше прошлые, свежие первыми.
 * `count` — сколько ПРОШЛЫХ проходов вернуть сверх текущего.
 */
export function signPassages(E: Engine, name: string, sign: number, at: Date,
  count = 3): Passage[] {
  const { step, back, fwd, gap } = cfg(name);
  const jdNow = E.toJD(at);
  const inSign = (jd: number) => signIndexOf(E.lon(jd, name)) === sign;

  // 1. один проход по сетке: собираем интервалы «был в знаке»
  const raw: { from: number | null; to: number | null }[] = [];
  let open: number | null | undefined;          // левая граница текущего интервала
  let prev = jdNow - back, prevIn = inSign(prev);
  if (prevIn) open = null;                      // начало за горизонтом поиска
  for (let jd = prev + step; jd <= jdNow + fwd + 1e-9; jd += step) {
    const now = inSign(jd);
    if (now && !prevIn) open = edge(E, name, sign, jd, prev);
    else if (!now && prevIn) { raw.push({ from: open ?? null, to: edge(E, name, sign, prev, jd) }); open = undefined; }
    prev = jd; prevIn = now;
  }
  if (prevIn) raw.push({ from: open ?? null, to: null });   // не закрылся до горизонта

  // 2. склейка ретро-заходов: разрыв меньше `gap` — это один проход
  const merged: { from: number | null; to: number | null }[] = [];
  for (const p of raw) {
    const last = merged[merged.length - 1];
    if (last && last.to != null && p.from != null && (p.from - last.to) < gap) last.to = p.to;
    else merged.push({ ...p });
  }

  // 3. текущий проход — тот, внутрь которого попадает `at`
  const out: Passage[] = [];
  const idx = merged.findIndex((p) => (p.from == null || p.from <= jdNow) && (p.to == null || p.to >= jdNow));
  if (idx >= 0) {
    const p = merged[idx];
    out.push({ from: p.from == null ? null : E.fromJD(p.from), to: p.to == null ? null : E.fromJD(p.to), current: true });
  }
  const past = merged.slice(0, idx >= 0 ? idx : merged.length).reverse().slice(0, count);
  for (const p of past) {
    out.push({ from: p.from == null ? null : E.fromJD(p.from), to: p.to == null ? null : E.fromJD(p.to), current: false });
  }
  return out;
}

/** Границы текущего прохода (ретро-заходы уже склеены). */
export function currentSignWindow(E: Engine, name: string, at: Date): { from: Date | null; to: Date | null } {
  const sign = signIndexOf(E.lon(E.toJD(at), name));
  const cur = signPassages(E, name, sign, at, 0).find((p) => p.current);
  return { from: cur?.from ?? null, to: cur?.to ?? null };
}

/** Сколько суток длится текущий проход (для подписи «идёт 3-й месяц»). */
export const passageDays = (p: Passage): number | null =>
  p.from && p.to ? Math.round((+p.to - +p.from) / DAY) : null;
