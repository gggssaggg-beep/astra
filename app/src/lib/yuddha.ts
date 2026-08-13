/**
 * ГРАХА-ЮДДХА — планетарная война: две грахи сошлись в одном знаке ближе чем на
 * градус, и одна из них «проигрывает» — её каракатвы (то, за что она отвечает)
 * повреждаются.
 *
 * ОТКУДА ПРАВИЛА. Страница, присланная астрологом 13.08.2026
 * (jyotish.study, «Война планет, или граха-юддха»). Его же слова к ней:
 * «мнения астрологов о том, кто побеждает, неоднозначные… если будут сложности
 * с анализом, пусть будет просто обозначен факт планетарной войны и текстовая
 * информация для анализа». Поэтому здесь СЧИТАЮТСЯ ВСЕ ТРИ признака победителя,
 * а вердикт выносится, ТОЛЬКО когда они сходятся. Разошлись — показываем факт
 * войны и что говорит каждый признак, а выбор оставляем астрологу. Так
 * приложение не выдаёт за истину одну школу из трёх.
 *
 * КТО ВОЮЕТ. Только пять тара-грах: Мангала, Будха, Гуру, Шукра, Шани. Сурья
 * не воюет — он ЖЖЁТ (астангата, отдельное явление); Чандра своего света не
 * имеет; Раху и Кету — тени, светиться нечем.
 */
import { ZODIAC } from '../engine/index.ts';

/** Пять тара-грах — единственные участницы войны. */
export const TARA_GRAHAS = ['Марс', 'Меркурий', 'Юпитер', 'Венера', 'Сатурн'] as const;

/** Война — сближение не больше градуса (и обязательно в одном знаке). */
export const YUDDHA_ORB = 1;
/** Амшувимарда («смешение лучей») — тесное сближение, около получаса дуги. */
export const AMSHU_ORB = 0.5;

/**
 * Найсаргика-бала (естественная сила, она же яркость) в вирупах — таблица со
 * страницы астролога. Величины постоянные: Шукра всегда ярче Шани, и это не
 * зависит от карты. Именно поэтому один этот признак не может быть последним
 * словом — иначе Шани не выигрывал бы никогда.
 */
export const NAISARGIKA_BALA: Record<string, number> = {
  'Венера': 43, 'Юпитер': 34, 'Меркурий': 26, 'Марс': 17, 'Сатурн': 9,
};

export interface YuddhaInput {
  name: string;
  lon: number;            // сидерическая долгота, °
  retro: boolean;
  lat?: number;           // эклиптическая широта, ° (плюс — север)
}

export interface YuddhaSide {
  name: string;
  lon: number;
  degInSign: number;
  lat: number | null;
  retro: boolean;
  bala: number;           // найсаргика-бала, вирупы
}

export type YuddhaKind = 'amshuvimarda' | 'ullekha';

export interface Yuddha {
  a: YuddhaSide;          // та, что на меньшем градусе (идёт позади)
  b: YuddhaSide;
  signIndex: number;
  sign: string;
  gap: number;            // расстояние по долготе, °
  kind: YuddhaKind;
  /** Апасавья: одна или обе грахи ретроградны — признаки победителя
   *  переворачиваются (источник: «побеждает планета с меньшей яркостью»). */
  apasavya: boolean;
  byBala: string;         // кто побеждает по силе и сиянию
  byLatitude: string | null;  // кто севернее (null — широт нет в данных)
  byDegree: string;       // кто на меньшем градусе — «догоняет»
  /** Победитель, ЕСЛИ все посчитанные признаки сошлись. Иначе null: школы
   *  расходятся, и приложение не выбирает за астролога. */
  winner: string | null;
  loser: string | null;
}

const norm = (x: number): number => ((x % 360) + 360) % 360;
const signIndex = (lon: number): number => Math.floor(norm(lon) / 30) % 12;

/** Кратчайшая разница долгот, |x| ≤ 180. */
const gapOf = (a: number, b: number): number => {
  const d = Math.abs(norm(a) - norm(b));
  return d > 180 ? 360 - d : d;
};

const sideOf = (p: YuddhaInput): YuddhaSide => ({
  name: p.name,
  lon: norm(p.lon),
  degInSign: norm(p.lon) % 30,
  lat: p.lat == null ? null : p.lat,
  retro: p.retro,
  bala: NAISARGIKA_BALA[p.name] ?? 0,
});

/**
 * Все войны в наборе грах. Пары перебираются один раз; порядок внутри пары —
 * по градусу (первой идёт та, что позади).
 */
export function grahaYuddha(planets: YuddhaInput[]): Yuddha[] {
  const fighters = planets.filter((p) => (TARA_GRAHAS as readonly string[]).includes(p.name));
  const out: Yuddha[] = [];

  for (let i = 0; i < fighters.length; i++) {
    for (let j = i + 1; j < fighters.length; j++) {
      const gap = gapOf(fighters[i].lon, fighters[j].lon);
      if (gap > YUDDHA_ORB) continue;
      // «в одном знаке» — условие и астролога, и источника: сближение через
      // границу знаков (29°50′ Тельца и 0°20′ Близнецов) войной не считаем
      const si = signIndex(fighters[i].lon);
      if (si !== signIndex(fighters[j].lon)) continue;

      const pair = [sideOf(fighters[i]), sideOf(fighters[j])]
        .sort((x, y) => x.degInSign - y.degInSign);
      const [a, b] = pair;
      const apasavya = a.retro || b.retro;

      // 1) сила и сияние: больше вируп — победа. В апасавье наоборот.
      const strong = a.bala >= b.bala ? a : b;
      const weak = strong === a ? b : a;
      const byBala = (apasavya ? weak : strong).name;

      // 2) широта: севернее — победа. В апасавье побеждает южная.
      let byLatitude: string | null = null;
      if (a.lat != null && b.lat != null && a.lat !== b.lat) {
        const north = a.lat > b.lat ? a : b;
        const south = north === a ? b : a;
        byLatitude = (apasavya ? south : north).name;
      }

      // 3) градус: побеждает та, что позади и догоняет, — меньший градус
      const byDegree = a.name;

      const votes = [byBala, byLatitude, byDegree].filter((v): v is string => v != null);
      const unanimous = votes.every((v) => v === votes[0]);
      const winner = unanimous ? votes[0] : null;

      out.push({
        a, b, signIndex: si, sign: ZODIAC[si], gap,
        kind: gap <= AMSHU_ORB ? 'amshuvimarda' : 'ullekha',
        apasavya, byBala, byLatitude, byDegree,
        winner, loser: winner ? (winner === a.name ? b.name : a.name) : null,
      });
    }
  }
  return out.sort((x, y) => x.gap - y.gap);
}

/* ── тексты (третье лицо, без команд читателю — правило корпусов) ─────────── */

export const YUDDHA_KIND_LABEL: Record<YuddhaKind, string> = {
  amshuvimarda: 'Амшувимарда — смешение лучей',
  ullekha: 'Уллекха — соприкосновение',
};

export const YUDDHA_KIND_LORE: Record<YuddhaKind, string> = {
  amshuvimarda:
    'Грахи сошлись теснее получаса дуги — лучи смешиваются полностью. Самый '
    + 'сильный вид войны: каракатвы обеих перепутываются, а проигравшая теряет '
    + 'сияние, и её темы в жизни звучат приглушённо.',
  ullekha:
    'Диски грах соприкоснулись, но не наложились друг на друга: расстояние '
    + 'около градуса. Обе сохраняют собственную силу, и проигрыш здесь мягче, '
    + 'чем при полном смешении лучей.',
};

export const YUDDHA_APASAVYA_LORE =
  'Апасавья: одна из воюющих грах (или обе) идёт попятно. Источник даёт для '
  + 'такой войны обратный счёт — победа достаётся не яркой, а слабейшей, и '
  + 'события темы склонны повторяться: возвращаться и переигрываться заново.';

/** Что повреждается у проигравшей грахи — её каракатвы. */
export const YUDDHA_HURT: Record<string, string> = {
  'Марс': 'смелость, напор, выносливость тела, младшие братья, земля и недвижимость',
  'Меркурий': 'ум и речь, счёт и сделки, учёба, связи и переписка',
  'Юпитер': 'знание и вера, учитель, дети, покровители, чувство меры',
  'Венера': 'влечение и брак, вкус и красота, достаток, лёгкость в отношениях',
  'Сатурн': 'выносливость и срок, труд и порядок, старшие, долгие обязательства',
};

export const YUDDHA_GENERAL =
  'Планетная война повреждает и дом, в котором она случилась, и дома, которыми '
  + 'управляет проигравшая граха: их темы даются с натугой, а обещанное грахой '
  + 'приходит позже и меньшим, чем по карте. Победившая граха своих качеств не '
  + 'теряет — спор идёт о том, чей голос будет слышен.';

export const YUDDHA_DISPUTE =
  'Кто именно побеждает — вопрос школы, единого мнения у астрологов нет. '
  + 'Признаков три: естественная сила и сияние грахи, положение севернее по '
  + 'широте и меньший градус (граха идёт позади и догоняет). Здесь посчитаны '
  + 'все три: когда они сходятся, победитель назван прямо; когда расходятся — '
  + 'показано, что говорит каждый, и выбор остаётся за астрологом.';
