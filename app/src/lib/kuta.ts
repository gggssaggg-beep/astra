/**
 * КУТА (гуна-милан, аштакута) — джйотиш-аналог синастрии: совместимость двоих
 * по накшатрам и знакам их ЛУН. Восемь кут, максимум 36 гун.
 *
 * Классика считается от карты НЕВЕСТЫ к карте ЖЕНИХА (варна и гана
 * направленные): здесь A = «невеста», B = «жених»; UI обязан дать поменять
 * порядок и сказать об этом.
 *
 * ⚠ v1-упрощения (сверить с профессиональной программой, как сверяли карту эталон А):
 *  - ЙОНИ: точная матрица 14×14 не зашита — очки: то же животное 4, заклятая
 *    пара 0 (семь канонических пар), прочее 2. Дружественные тройки (3 очка)
 *    не различаются.
 *  - ВАШЬЯ: классы по ЦЕЛЫМ знакам (классика делит Стрельца/Козерога пополам);
 *    очки: свой класс 2, лев×четвероногие 0, прочее 1.
 * Остальные шесть кут — точные правила.
 */
import { NAKSHATRAS, SIGN_LORDS, naturalRelation } from './vedic.ts';
import type { VedicPlanet } from './vedic.ts';

// ─── таблицы по накшатрам (индексы 0..26 = Ашвини..Ревати) ─────────────────
// Гана: дева (боги) / манушья (люди) / ракшаса.
const GANA: ('дева' | 'манушья' | 'ракшаса')[] = [
  'дева', 'манушья', 'ракшаса',        // Ашвини, Бхарани, Криттика
  'манушья', 'дева', 'манушья',        // Рохини, Мригашира, Ардра
  'дева', 'дева', 'ракшаса',           // Пунарвасу, Пушья, Ашлеша
  'ракшаса', 'манушья', 'манушья',     // Магха, Пурвапхалгуни, Уттарапхалгуни
  'дева', 'ракшаса', 'дева',           // Хаста, Читра, Свати
  'ракшаса', 'дева', 'ракшаса',        // Вишакха, Анурадха, Джьештха
  'ракшаса', 'манушья', 'манушья',     // Мула, Пурвашадха, Уттарашадха
  'дева', 'ракшаса', 'ракшаса',        // Шравана, Дхаништха, Шатабхиша
  'манушья', 'манушья', 'дева',        // Пурвабхадра, Уттарабхадра, Ревати
];

// Нади: ади / мадхья / антья (цикл 1-2-3-3-2-1 по шесть раз).
const NADI: ('ади' | 'мадхья' | 'антья')[] = [
  'ади', 'мадхья', 'антья', 'антья', 'мадхья', 'ади',
  'ади', 'мадхья', 'антья', 'антья', 'мадхья', 'ади',
  'ади', 'мадхья', 'антья', 'антья', 'мадхья', 'ади',
  'ади', 'мадхья', 'антья', 'антья', 'мадхья', 'ади',
  'ади', 'мадхья', 'антья',
];

// Йони — животное накшатры (классическая таблица).
const YONI: string[] = [
  'конь', 'слон', 'баран', 'змея', 'змея', 'собака',
  'кошка', 'баран', 'кошка', 'крыса', 'крыса', 'корова',
  'буйвол', 'тигр', 'буйвол', 'тигр', 'олень', 'олень',
  'собака', 'обезьяна', 'мангуст', 'обезьяна', 'лев', 'конь',
  'лев', 'корова', 'слон',
];
// Заклятые пары (вайра) — 0 очков.
const YONI_ENEMIES: [string, string][] = [
  ['конь', 'буйвол'], ['слон', 'лев'], ['баран', 'обезьяна'],
  ['змея', 'мангуст'], ['собака', 'олень'], ['кошка', 'крыса'],
  ['корова', 'тигр'],
];

// ─── таблицы по знакам ─────────────────────────────────────────────────────
// Варна знака Луны: вода → брахман, огонь → кшатрий, земля → вайшья, воздух → шудра.
const VARNA_RANK: number[] = [2, 1, 0, 3, 2, 1, 0, 3, 2, 1, 0, 3];
export const VARNA_NAME = ['шудра', 'вайшья', 'кшатрий', 'брахман'];

// Вашья (v1, целыми знаками): класс «власти» знака.
const VASHYA: string[] = [
  'четвероногое', 'четвероногое', 'человек', 'водное', 'лев', 'человек',
  'человек', 'кита', 'человек', 'водное', 'человек', 'водное',
];

// ─── дополнительные проверки сверх 36 гун ──────────────────────────────────
// Аштакута даёт очки, но классика смотрит и то, что очками не меряется. Эти
// три проверяют почти везде (в южной традиции раджу — важнее суммы гун).

/** Раджу — «части тела»: одна раджу у обоих считается неблагоприятной. */
const RAJJU: Record<string, number[]> = {   // индексы накшатр 0..26
  'стопы': [0, 8, 9, 17, 18, 26],
  'бёдра': [1, 7, 10, 16, 19, 25],
  'пупок': [2, 6, 11, 15, 20, 24],
  'шея': [3, 5, 12, 14, 21, 23],
  'голова': [4, 13, 22],
};
export const rajjuOf = (nak: number): string =>
  Object.keys(RAJJU).find((k) => RAJJU[k].includes(nak)) ?? '';

/** Счёт накшатр от A к B включительно (1..27). */
const countNak = (from: number, to: number): number => ((to - from + 27) % 27) + 1;

export interface ExtraChecks {
  rajju: { same: boolean; name: string; note: string };
  mahendra: { ok: boolean; count: number; note: string };
  streeDirgha: { ok: boolean; count: number; note: string };
}

/**
 * Раджу, махендра и стри-диргха. A — «невеста», B — «жених»: махендра и
 * стри-диргха считаются НАПРАВЛЕННО, от накшатры невесты к накшатре жениха.
 */
export function extraChecks(nakA: number, nakB: number): ExtraChecks {
  const ra = rajjuOf(nakA), rb = rajjuOf(nakB);
  const same = ra === rb;
  const n = countNak(nakA, nakB);
  const mahOk = [4, 7, 10, 13, 16, 19, 22, 25].includes(n);
  const sdOk = n > 9;
  return {
    rajju: { same, name: same ? ra : `${ra} × ${rb}`,
      note: same ? 'одна раджу у обоих — классика считает это неблагоприятным'
                 : 'раджу разные — благоприятно' },
    mahendra: { ok: mahOk, count: n,
      note: mahOk ? 'махендра есть — поддержка потомству и долголетию союза'
                  : 'махендры нет' },
    streeDirgha: { ok: sdOk, count: n,
      note: sdOk ? 'стри-диргха соблюдена — благополучие жены'
                 : 'стри-диргха не соблюдена (счёт девять и меньше)' },
  };
}

export interface KutaScore { name: string; got: number; max: number; note?: string; }
export interface KutaResult {
  scores: KutaScore[];
  total: number;               // из 36
  verdict: string;
  doshas: string[];            // нади-доша, бхакута-доша, если есть
}

const badTara = (from: number, to: number): boolean => {
  const t = (((to - from + 27) % 27) + 1) % 9;     // 1..9, 0≡9
  const n = t === 0 ? 9 : t;
  return n === 3 || n === 5 || n === 7;            // випат, пратьяри, вадха
};

/**
 * Аштакута. A — «невеста», B — «жених» (направленные варна и гана).
 * nak* — индекс накшатры Луны 0..26, sign* — знак Луны 0..11.
 */
export function kutaMatch(nakA: number, signA: number, nakB: number, signB: number): KutaResult {
  const S: KutaScore[] = [];
  const doshas: string[] = [];

  // 1. Варна (1): варна жениха не ниже варны невесты.
  const varnaOk = VARNA_RANK[signB] >= VARNA_RANK[signA];
  S.push({ name: 'Варна', got: varnaOk ? 1 : 0, max: 1,
    note: `${VARNA_NAME[VARNA_RANK[signA]]} × ${VARNA_NAME[VARNA_RANK[signB]]}` });

  // 2. Вашья (2) — v1 целыми знаками.
  const va = VASHYA[signA], vb = VASHYA[signB];
  const vashya = va === vb ? 2
    : (va === 'лев' && vb === 'четвероногое') || (vb === 'лев' && va === 'четвероногое') ? 0 : 1;
  S.push({ name: 'Вашья', got: vashya, max: 2, note: `${va} × ${vb} (упрощённо)` });

  // 3. Тара (3): счёт накшатр в обе стороны; плохие тары — 3, 5, 7.
  const badAB = badTara(nakA, nakB), badBA = badTara(nakB, nakA);
  const tara = !badAB && !badBA ? 3 : (badAB !== badBA ? 1.5 : 0);
  S.push({ name: 'Тара', got: tara, max: 3 });

  // 4. Йони (4) — v1: то же животное 4, вайра 0, прочее 2.
  const ya = YONI[nakA], yb = YONI[nakB];
  const enemy = YONI_ENEMIES.some(([p, q]) => (p === ya && q === yb) || (p === yb && q === ya));
  const yoni = ya === yb ? 4 : enemy ? 0 : 2;
  S.push({ name: 'Йони', got: yoni, max: 4, note: `${ya} × ${yb}${enemy ? ' — вайра!' : ''} (упрощённо)` });

  // 5. Граха-майтри (5): дружба управителей знаков Лун (в обе стороны).
  const la = SIGN_LORDS[signA], lb = SIGN_LORDS[signB];
  const ab = naturalRelation(la, lb), ba = naturalRelation(lb, la);
  let maitri = 0;
  if (la === lb) maitri = 5;
  else {
    const pair = [ab, ba].sort().join('|');
    maitri = pair === 'friend|friend' ? 5
      : pair === 'friend|neutral' ? 4
      : pair === 'neutral|neutral' ? 3
      : pair === 'enemy|friend' ? 1
      : pair === 'enemy|neutral' ? 0.5 : 0;
  }
  S.push({ name: 'Граха-майтри', got: maitri, max: 5, note: `${la} × ${lb}` });

  // 6. Гана (6): дева/манушья/ракшаса.
  const ga = GANA[nakA], gb = GANA[nakB];
  const gana = ga === gb ? 6
    : (ga !== 'ракшаса' && gb !== 'ракшаса') ? 5      // дева × манушья
    : (ga === 'дева' || gb === 'дева') ? 1 : 0;       // дева×ракшаса 1, манушья×ракшаса 0
  S.push({ name: 'Гана', got: gana, max: 6, note: `${ga} × ${gb}` });

  // 7. Бхакута (7): расстояние знаков Лун; пары 2/12, 5/9, 6/8 — доша.
  const d = ((signB - signA + 12) % 12) + 1;
  const pair = Math.min(d, 14 - d);                   // 2/12→2, 5/9→5, 6/8→6
  const bhakootaBad = pair === 2 || pair === 5 || pair === 6;
  S.push({ name: 'Бхакута', got: bhakootaBad ? 0 : 7, max: 7 });
  if (bhakootaBad) doshas.push(`бхакута-доша (знаки Лун ${d}/${14 - d})`);

  // 8. Нади (8): одна нади у двоих — самая тяжёлая доша.
  const same = NADI[nakA] === NADI[nakB];
  S.push({ name: 'Нади', got: same ? 0 : 8, max: 8, note: `${NADI[nakA]} × ${NADI[nakB]}` });
  if (same) doshas.push(`нади-доша (обе Луны — ${NADI[nakA]} нади)`);

  const total = S.reduce((s, k) => s + k.got, 0);
  const verdict = total >= 33 ? 'отлично'
    : total >= 25 ? 'хорошо'
    : total >= 18 ? 'приемлемо'
    : 'ниже порога (классически не рекомендуется без разбора дош)';
  return { scores: S, total, verdict, doshas };
}

/**
 * Манглик (мангала-доша): Марс в 1, 2, 4, 7, 8 или 12-м доме. Считаем и от
 * лагны, и от Луны — школы используют оба отсчёта. Если манглики оба партнёра,
 * доша считается взаимно погашенной.
 */
export function manglik(planets: VedicPlanet[], lagnaSign: number, moonSign: number): {
  fromLagna: boolean; fromMoon: boolean; any: boolean;
} {
  const mars = planets.find((p) => p.name === 'Марс');
  if (!mars) return { fromLagna: false, fromMoon: false, any: false };
  const houseFrom = (ref: number) => ((mars.signIndex - ref + 12) % 12) + 1;
  const BAD = new Set([1, 2, 4, 7, 8, 12]);
  const fromLagna = BAD.has(houseFrom(lagnaSign));
  const fromMoon = BAD.has(houseFrom(moonSign));
  return { fromLagna, fromMoon, any: fromLagna || fromMoon };
}

/** Имя накшатры для подписи. */
export const nakName = (i: number): string => NAKSHATRAS[i]?.name ?? '';
