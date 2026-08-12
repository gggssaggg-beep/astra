/**
 * ГРАФИК БЛАГОПРИЯТНОСТИ СУТОК — просьба астролога 12.08.2026. Образец он
 * приложил из Vedic times и сам оговорил: «он естественно не учитывает
 * индивидуальный гороскоп, но всё равно классно; если удастся что-то такое
 * сделать с учётом индивидуального — будет вообще круто».
 *
 * ⚠ ВЕСА ЗДЕСЬ — ПРЕДВАРИТЕЛЬНЫЕ, И ЭТО ГЛАВНОЕ, ЧТО НАДО ЗНАТЬ. Классика не
 * задаёт числовой шкалы: она говорит «Раху-калам не для начинаний», а на
 * сколько именно процентов — не говорит никто. Поэтому веса вынесены в одну
 * таблицу WEIGHTS, каждый со своим смыслом, и меняются одной строкой, когда
 * астролог назовёт свои. Кривая честно перечисляет, ИЗ ЧЕГО сложилась (`reasons`),
 * чтобы спорить можно было с конкретным слагаемым, а не с картинкой целиком.
 *
 * Ни одного нового астрологического правила здесь нет: все слагаемые взяты из
 * уже сверённых мест — каламы (kalam.ts), йога (panchanga.ts), тарабала и
 * чандра-гочара (panchangaLore.ts).
 */
import { yogaOf } from './panchanga.ts';
import { nakshatraOf, signIndexOf } from './vedic.ts';
import { YOGA_LORE, taraOf, CHANDRA_GOOD, chandraHouse } from './panchangaLore.ts';
import { kalamNow, type KalamWindow } from './kalam.ts';

/**
 * Вклад каждого слагаемого в проценты. Ноль по всем = ровная линия 50 %.
 * Порядок величин выбран так: полосы суток решают больше всего (они и есть
 * «время дня»), личные слои — заметно, общий фон панчанги — слабее всех.
 */
export const WEIGHTS = {
  /** Раху-калам, Яма-ганда, Гулика-калам */
  kalamBad: -22,
  /** Абхиджит-мухурта */
  abhijit: +18,
  /** Брахма-мухурта */
  brahma: +12,
  /** благоприятная / трудная йога панчанги */
  yoga: 8,
  /** тарабала: тара от накшатры своей Луны */
  tara: 12,
  /** чандра-гочара: дом Луны от натальной Луны */
  chandra: 12,
};

export const BASE = 50;

export interface AuspiciousPoint {
  at: Date;
  /** 0..100 */
  score: number;
  /** из чего сложилось — по одной строке на слагаемое */
  reasons: string[];
}

export interface AuspiciousOpts {
  /** полосы суток (kalamsOf) */
  windows: KalamWindow[];
  /** долготы на момент: Солнце и Луна (сидерические). null/отсутствует —
   *  считаем только полосы суток: без движка график всё равно должен строиться */
  sample?: ((t: Date) => { sunLon: number; moonLon: number } | null) | null;
  /** долгота Луны рождения — без неё личных слоёв не будет */
  natalMoonLon?: number | null;
  from: Date;
  to: Date;
  /** шаг выборки в минутах */
  stepMin?: number;
}

const clamp = (x: number): number => Math.max(0, Math.min(100, x));

/**
 * Ступенчатая кривая благоприятности от `from` до `to`.
 * Личные слои включаются только при известной Луне рождения — иначе график
 * остаётся общим, как в чужих приложениях, и об этом честно говорит UI.
 */
export function auspiciousCurve(opts: AuspiciousOpts): AuspiciousPoint[] {
  const { windows, sample = null, natalMoonLon = null, from, to, stepMin = 20 } = opts;
  const out: AuspiciousPoint[] = [];
  const stepMs = stepMin * 60_000;
  const natalNak = natalMoonLon == null ? null : nakshatraOf(natalMoonLon).index;
  const natalSign = natalMoonLon == null ? null : signIndexOf(natalMoonLon);

  for (let t = from.getTime(); t <= to.getTime(); t += stepMs) {
    const at = new Date(t);
    let score = BASE;
    const reasons: string[] = [];

    for (const w of windows) {
      if (!kalamNow(w, at)) continue;
      if (w.kind === 'bad') {
        score += WEIGHTS.kalamBad;
        reasons.push(`${w.name}: не для начинаний`);
      } else if (w.name.startsWith('Абхиджит')) {
        score += WEIGHTS.abhijit;
        reasons.push('Абхиджит-мухурта: опора дня');
      } else {
        score += WEIGHTS.brahma;
        reasons.push('Брахма-мухурта: время тишины');
      }
    }

    const s = sample?.(at) ?? null;
    if (s) {
      const yoga = YOGA_LORE[yogaOf(s.sunLon, s.moonLon).name];
      if (yoga) {
        score += yoga.good ? WEIGHTS.yoga : -WEIGHTS.yoga;
        reasons.push(`йога ${yogaOf(s.sunLon, s.moonLon).name}: `
          + (yoga.good ? 'благоприятная' : 'трудная'));
      }
      if (natalNak != null && natalSign != null) {
        const tara = taraOf(natalNak, nakshatraOf(s.moonLon).index);
        score += tara.good ? WEIGHTS.tara : -WEIGHTS.tara;
        reasons.push(`тара ${tara.name}: ` + (tara.good ? 'добрая' : 'требует осторожности'));

        const h = chandraHouse(natalSign, signIndexOf(s.moonLon));
        const good = CHANDRA_GOOD.has(h);
        score += good ? WEIGHTS.chandra : -WEIGHTS.chandra;
        reasons.push(`Луна в ${h}-м от своей: ` + (good ? 'попутная' : 'встречная'));
      }
    }

    out.push({ at, score: clamp(score), reasons });
  }
  return out;
}

/** Точка кривой, ближайшая к моменту (для подписи «сейчас»). */
export function pointAt(curve: AuspiciousPoint[], at: Date): AuspiciousPoint | null {
  if (!curve.length) return null;
  let best = curve[0], bestD = Math.abs(+curve[0].at - +at);
  for (const p of curve) {
    const d = Math.abs(+p.at - +at);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}
