/**
 * ФУНКЦИОНАЛЬНАЯ ПРИРОДА ГРАХИ ПО ЛАГНЕ — добрая она в ЭТОЙ карте или злая.
 *
 * Астролог просил учитывать её в дришти гочары («благоприятность планет в
 * личном гороскопе»), но правило назвать затруднился: «слишком сложные вопросы,
 * думал, ИИ сам разберётся» (13.08.2026). Из головы такие правила брать нельзя,
 * поэтому здесь взята ОДНА НАЗВАННАЯ ШКОЛА — классика Парашары, и она подписана
 * на экране прямо. Не «истина джйотиша», а конкретный источник, который
 * астролог может поправить одной строкой.
 *
 * ПРАВИЛА (БПХШ, гл. о хозяевах домов):
 *  • хозяин триконы (5, 9) и лагнеш — функционально добрые;
 *  • хозяин 3, 6 или 11 (тришадая) — функционально злой;
 *  • хозяин 8 или 12 (дустхана) — злой; исключение — если это же лагнеш
 *    (Овен: Мангала 1 и 8; Весы: Шукра 1 и 8) — своя лагна снимает порчу;
 *  • граха, держащая И кендру (4, 7, 10), И трикону (5, 9), — ЙОГАКАРАКА,
 *    сильнейшая добрая точка карты;
 *  • кендрадхипатья-доша: если граха держит ТОЛЬКО кендры, счёт переворачивается
 *    — природный благодетель перестаёт давать добро, природный вредитель
 *    перестаёт вредить. Это буква Парашары, а не смягчение;
 *  • хозяин 2 или 7 — марака (даёт кризисы срока). Это отдельная пометка, а не
 *    приговор: марака бывает и доброй грахой одновременно.
 *
 * Раху и Кету своих знаков не имеют — функциональной природы у них нет вовсе,
 * они работают через хозяина знака, в котором стоят (это приложение уже
 * показывает отдельной строкой).
 */
import { ruledHouses } from './vedic.ts';

/** Школа, по которой считаем. Подписывается в интерфейсе — молча не выбираем. */
export const FUNCTIONAL_SCHOOL = 'по классике Парашары';

export type FunctionalKind = 'yogakaraka' | 'benefic' | 'malefic' | 'neutral';

export const FUNCTIONAL_LABEL: Record<FunctionalKind, string> = {
  yogakaraka: 'йогакарака',
  benefic: 'функционально добрая',
  malefic: 'функционально злая',
  neutral: 'функционально нейтральная',
};

/** Природные благодетели и вредители — от лагны не зависят. */
export const NATURAL_BENEFICS = new Set(['Юпитер', 'Венера', 'Меркурий', 'Луна']);
export const NATURAL_MALEFICS = new Set(['Солнце', 'Марс', 'Сатурн']);

const KENDRA = [4, 7, 10];      // лагну (1) считаем отдельно: она и кендра, и трикона
const TRIKONA = [5, 9];
const TRISHADAYA = [3, 6, 11];
const DUSTHANA = [8, 12];
const MARAKA = [2, 7];

export interface FunctionalNature {
  kind: FunctionalKind;
  label: string;
  /** дома, которыми граха управляет при этой лагне */
  rules: number[];
  /** из чего сложился вывод — списком, чтобы астролог видел ход, а не итог */
  reasons: string[];
  /** управляет 2-м или 7-м домом: марака (тема срока и кризисов) */
  maraka: boolean;
}

/** «5-й и 9-й» — дома всегда перечисляем словами, не голыми числами. */
const ORD = (h: number): string => `${h}-й`;
const list = (hs: number[]): string => hs.map(ORD).join(' и ');

/**
 * Функциональная природа грахи при данной лагне. null — у грахи нет своих
 * знаков (Раху, Кету) или имя вне девятки.
 *
 * @param moonBenefic растущая ли Луна. Убывающая в классике — вредитель, и
 *                    кендрадхипатья-доша считается для неё наоборот.
 */
export function functionalNature(
  graha: string, lagnaSign: number, moonBenefic = true,
): FunctionalNature | null {
  const rules = ruledHouses(graha, lagnaSign);
  if (!rules.length) return null;

  // имя параметра не `list` — иначе перекроет одноимённый хелпер выше
  const has = (group: number[]): number[] => rules.filter((h) => group.includes(h));
  const kendra = has(KENDRA);
  const trikona = has(TRIKONA);
  const trishadaya = has(TRISHADAYA);
  const dusthana = has(DUSTHANA);
  const lagnesh = rules.includes(1);
  const maraka = has(MARAKA).length > 0;
  const benefic = graha === 'Луна' ? moonBenefic : NATURAL_BENEFICS.has(graha);

  const reasons: string[] = [];
  let kind: FunctionalKind;

  if (kendra.length && trikona.length) {
    kind = 'yogakaraka';
    reasons.push(`держит и кендру (${list(kendra)} дом), и трикону (${list(trikona)} дом) — `
      + 'это йогакарака, сильнейшая добрая точка карты');
  } else if (trikona.length) {
    kind = 'benefic';
    reasons.push(`хозяин триконы (${list(trikona)} дом) — дома удачи и опоры`);
  } else if (lagnesh) {
    kind = 'benefic';
    reasons.push('лагнеш — хозяин самой лагны, а она и кендра, и трикона разом');
  } else if (trishadaya.length) {
    kind = 'malefic';
    reasons.push(`хозяин тришадаи (${list(trishadaya)} дом) — эти дома классика считает `
      + 'трудными для их же хозяина');
  } else if (dusthana.length) {
    kind = 'malefic';
    reasons.push(`хозяин дустханы (${list(dusthana)} дом)`);
  } else if (kendra.length) {
    // кендрадхипатья-доша: только кендры, без триконы
    kind = benefic ? 'neutral' : 'benefic';
    reasons.push(`держит только кендры (${list(kendra)} дом) — кендрадхипатья: `
      + (benefic
        ? `${graha} природный благодетель, и власть над кендрой гасит его доброту`
        : `${graha} природный вредитель, и власть над кендрой гасит его вред`));
  } else {
    kind = 'neutral';
    reasons.push('ни трикон, ни трудных домов — природа грахи здесь ничем не окрашена');
  }

  // добавочные пометки: они не меняют вердикт, но их видно
  if (kind !== 'malefic' && dusthana.length) {
    reasons.push(lagnesh && dusthana.length
      ? `управляет ещё и ${list(dusthana)} домом, но своя лагна снимает эту порчу`
      : `управляет ещё и ${list(dusthana)} домом — тень на добрых обещаниях`);
  }
  if (kind !== 'malefic' && trishadaya.length) {
    reasons.push(`управляет ещё и ${list(trishadaya)} домом — часть плодов уходит туда`);
  }
  if (maraka) {
    reasons.push(`хозяин ${list(has(MARAKA))} дома — марака: в свои периоды `
      + 'может поднимать темы срока, здоровья и потерь');
  }

  return { kind, label: FUNCTIONAL_LABEL[kind], rules, reasons, maraka };
}

/** Одной строкой — для промпта и подписей: «Сатурн — йогакарака (упр. 9, 10)». */
export function functionalLine(graha: string, lagnaSign: number, moonBenefic = true): string | null {
  const f = functionalNature(graha, lagnaSign, moonBenefic);
  if (!f) return null;
  return `${graha} — ${f.label} (управляет ${list(f.rules)} домом)${f.maraka ? ', марака' : ''}`;
}

export const FUNCTIONAL_NOTE =
  'Добрая граха или злая — считается не вообще, а ДЛЯ ЭТОЙ ЛАГНЫ: одна и та же '
  + 'граха у разных людей работает по-разному, потому что управляет разными домами. '
  + 'Счёт здесь ведётся по классике Парашары: хозяин триконы и лагнеш — добрые, '
  + 'хозяин 3, 6, 11 и 8, 12 — трудные, а граха, держащая сразу кендру и трикону, — '
  + 'йогакарака, лучшее, что может быть в карте. Отдельный случай — кендрадхипатья: '
  + 'у грахи только кендры, и тогда счёт переворачивается, благодетель перестаёт '
  + 'давать добро, а вредитель — вредить. Раху и Кету своих знаков не имеют, у них '
  + 'функциональной природы нет: они работают через хозяина знака, где стоят.';
