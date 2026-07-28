/**
 * Модели данных — фундамент под все фичи (§4 + раунд-3 пожелания астролога).
 * Хранилище абстрактно (db.ts): сейчас localStorage, позже Capacitor SQLite.
 */

// aurora — «живое стекло» (2026-07-06): тёмная тема с плывущими сполохами.
// dawn — светлый двойник Авроры с блёстками (2026-07-07, пожелание астролога).
// «Космос» удалён — Аврора его целиком заменила (он был её базой).
export type ThemeMode = 'auto' | 'dawn' | 'aurora';
export type EclipseKind = 'solar' | 'lunar';

/** Стиль символов знаков/планет/аспектов (выбирается в настройках).
 * 'auto' — по теме: тёмная → серебро, светлая → радуга (App резолвит в конкретный
 * стиль; компоненты 'auto' не видят). Красит и знаки, и глифы планет/аспектов. */
export type SignStyle = 'auto' | 'silver' | 'gold' | 'element' | 'shimmer' | 'rainbow';
// «Переливание» (shimmer) убрано из выбора 2026-07-11 (SMIL-градиент грузил
// интерфейс — жалоба). Тип остаётся для совместимости: у кого было выбрано —
// App резолвит как 'auto'.
export const SIGN_STYLES: { id: SignStyle; label: string }[] = [
  { id: 'auto', label: 'Авто · по теме' },
  { id: 'silver', label: 'Серебро' },
  { id: 'gold', label: 'Золото · свечение' },
  { id: 'element', label: 'По стихиям' },
  { id: 'rainbow', label: 'Радуга' },
];

export interface Settings {
  tz: string;                 // часовой пояс вывода (IANA), напр. 'Europe/Moscow'
  defaultOrb: number;         // орбис по умолчанию, °
  orbs: Record<string, number>; // индивидуальный орбис по объекту (нет ключа = defaultOrb)
  objects: string[];          // активный состав объектов (база + вкл. доп.)
  extraEnabled: string[];     // включённые доп. объекты (карлики/TNO)
  theme: ThemeMode;
  signStyle: SignStyle;       // стиль символов знаков в колесе
  notifyDaily: boolean;       // ежедневное уведомление-сводка
  dailyNotifyTime: string;    // 'HH:MM' — время сводки (для 'twice' — утренней)
  dailyDigestMode?: 'once' | 'twice';  // сводка раз в сутки или дважды (утро+вечер)
  dailyNotifyTime2?: string;  // 'HH:MM' — вечерняя сводка (режим 'twice')
  notifyAspects: boolean;     // уведомления в момент точного аспекта
  notifyTransits?: boolean;   // уведомления о транзитах к натальной карте
  quietEnabled?: boolean;     // «тихое время» — не слать точечные пинги ночью
  quietFrom?: string;         // 'HH:MM' начало тихого окна (по умолч. 22:00)
  quietTo?: string;           // 'HH:MM' конец тихого окна (по умолч. 08:00)
  transitSelfId?: string;     // id человека = «моя карта» (чей натал отслеживаем)
  transitCusps?: boolean;     // включать куспиды домов (не только планеты)
  largeFont: boolean;         // крупный шрифт (доступность)
  font?: string;              // id шрифта интерфейса (lib/fonts.ts; нет = дефолт)
  seenWelcome: boolean;       // приветствие первого запуска уже показано
  seenJournalHelp?: boolean;  // обучалка журнала показана (закрыта кнопкой)
  seenHintGlow?: boolean;     // разовая подсветка «?» на экране дня уже показана
  seenAspectCardHelp?: boolean; // обучалка-разбор первой карточки аспекта показана
  seenNotifyWhy?: boolean;    // карточка-пояснение «зачем уведомления» показана перед первым запросом
  seenTour?: boolean;         // тур по интерфейсу пройден/закрыт хотя бы раз
  tourOfferOff?: boolean;     // «не предлагать обучение» (✕ на плашке)
  studyDone?: string[];       // id пройденных уроков курса «с нуля» (слой 2); нет = пусто
  zodiac?: 'tropical' | 'sidereal';  // зодиак: западный (по умолч.) или ведический
  ayanamsa?: string;          // id аянамши для ведического режима (нет = Лахири)
  // «я не астролог»: убрать специальные слои джйотиша (навамша, отношения планет
  // и всё, что добавится дальше). По умолчанию ВЫКЛ — вид полный, приложение
  // делалось для астролога; упрощение включает тот, кто джйотиш только смотрит.
  vedicSimple?: boolean;
  houseSystem?: string;       // система домов (id из HOUSE_SYSTEMS; нет = горизонтальная)
  houseSysV2?: boolean;       // разовая миграция дефолта на горизонтальную (2026-07-06)
  themeV2?: boolean;          // разовая миграция темы на «Аврору» (2026-07-06)
  quietV2?: boolean;          // разовая миграция тихого времени на 22:00–09:00 (2026-07-10)
  notesDirV1?: boolean;       // разовое восстановление направления транзита у старых заметок (2026-07-25)
  batterySaver?: 'off' | 'auto' | 'on'; // экономия аккумулятора: off=полная графика,
                              // on=всегда экономно, auto=включается при низком заряде
  nodalAxisFigures?: boolean; // строить фигуры на оси узлов (Раху☍Кету всегда 180°);
                              // по умолч. false — иначе постоянный шум (косой парус Луна+узлы)
}

/** Системы домов для выбора в настройках (id → engine HOUSE_SYS; equalMC особо). */
// горизонтальная — ПО УМОЛЧАНИЮ (выбор владелицы 2026-07-06), поэтому первая
export const HOUSE_SYSTEMS: { id: string; label: string }[] = [
  { id: 'horizontal', label: 'Горизонтальная (вертексная)' },
  { id: 'placidus', label: 'Плацидус' },
  { id: 'koch', label: 'Кох' },
  { id: 'porphyry', label: 'Порфирий' },
  { id: 'regiomontanus', label: 'Региомонтанус' },
  { id: 'campanus', label: 'Кампанус' },
  { id: 'equalAsc', label: 'Равнодомная от Asc' },
  { id: 'equalMC', label: 'Равнодомная от MC' },
  { id: 'morinus', label: 'Моринус' },
  { id: 'alcabitus', label: 'Алькабитус' },
  { id: 'wholeSign', label: 'Целознаковые (джйотиш)' },
];

/** Настройки движка из настроек приложения (профиль зодиака). */
export const zodiacOptions = (s: Settings): { zodiac: 'tropical' | 'sidereal'; ayanamsa?: string } =>
  s.zodiac === 'sidereal' ? { zodiac: 'sidereal', ayanamsa: s.ayanamsa ?? 'lahiri' } : { zodiac: 'tropical' };

/** В ведическом режиме дома всегда целознаковые: так читает джйотиш. */
export const houseSystemOf = (s: Settings): string =>
  s.zodiac === 'sidereal' ? 'wholeSign' : (s.houseSystem ?? 'horizontal');

/** Запись бортового журнала = наблюдение (§3.5 + раунд 3). */
export interface JournalNote {
  id: string;
  createdAt: string;          // ISO timestamp создания
  date: string;               // 'YYYY-MM-DD' — день, к которому относится запись
  text: string;
  objects: string[];          // теги-объекты (планеты/карлики) — для выборки по планете
  aspectSignature?: string;   // опц. привязка к сигнатуре аспекта (пара, без направления)
  // НАПРАВЛЕНИЕ транзита: «н:Марс|т:Солнце|соединение» — чья планета натальная,
  // чья транзитная. «Мой Марс ☌ транзитное Солнце» (раз в год) и «моё Солнце ☌
  // транзитный Марс» (раз в 2 года) — РАЗНЫЕ события, заметки к ним не должны
  // смешиваться (просьба владелицы 2026-07-25). Пусто у заметок дня/натала/
  // синастрии и у старых записей — такие показываем в обоих направлениях.
  transitSignature?: string;
  // ОТКУДА сделана заметка (просьба владелицы 2026-07-25): «Я+Саша 13.06.25»,
  // «Саша 20.06.2006» (натал — дата рождения), «Небо 13.06.25» (день на главной).
  // Пишется при создании; у старых записей отсутствует — UI просто не показывает.
  source?: string;
  updatedAt?: string;         // ISO — если заметку правили (показываем «изменено»)
}

/** Человек для совмещённых карт (синастрия/композит). Время и место — сразу
 *  в модели (нужны для домов в будущей фазе), но опциональны. */
export interface Person {
  id: string;
  name: string;
  birthDate: string;        // 'YYYY-MM-DD' — гражданская дата рождения
  birthTime: string | null; // 'HH:MM:SS' в поясе birthTz; null = время неизвестно
  birthTz: string;          // IANA пояс МЕСТА рождения (перевод в UTC)
  place: { name: string; lat: number; lon: number } | null; // для домов (позже)
  unknownTime: boolean;     // true → берём полдень 12:00 (Луна/дома неточны)
  slowOnly?: boolean;       // при неизвестном времени показывать только медленные планеты
  createdAt: string;
}

/** Закреплённый («отслеживаю») аспект (§3.3). */
export interface TrackedAspect {
  id: string;
  p1: string; p2: string; aspect: string;
  signature: string;          // нормализованный ключ
}

/** Трактовка по сигнатуре аспекта (§3.7). */
export interface Interpretation {
  signature: string;          // ключ
  text: string;
  updatedAt: string;
}

/** Архетип бога греческой мифологии для объекта/планеты (раунд 3). */
export interface DeityArchetype {
  object: string;             // 'Солнце', 'Луна', … , доп. карлики
  deity: string;              // имя божества
  text: string;               // редактируемый текст-архетип
  updatedAt: string;
}

/** Напоминание на аспект (§3.4). */
export interface Reminder {
  id: string;
  signature: string;
  kind: 'before' | 'at';      // «за X дней» или «в момент»
  daysBefore?: number;
  atUtc?: string;             // вычисленный момент точного аспекта (ISO)
}

/** Умолчания орбиса по объекту (когда пользователь не переопределил в настройках).
 *  Луна быстрая (~13°/сут) — окно шире: по умолчанию 3° (просьба владелицы).
 *  Доп. объекты мелкие — 0,5°, иначе на 1° засоряют сводку. */
export const DEFAULT_ORBS: Record<string, number> = {
  'Луна': 3,
  'Хирон': 0.5, 'Церера': 0.5, 'Паллада': 0.5,
  'Юнона': 0.5, 'Веста': 0.5, 'Лилит': 0.5,
};

/** Орбис объекта: индивидуальный → умолчание по объекту → общий по умолчанию. */
export function orbFor(s: Settings, name: string): number {
  return s.orbs?.[name] ?? DEFAULT_ORBS[name] ?? s.defaultOrb;
}
/** Резолвер орбиса для движка (пара берёт больший из двух — решение астролога). */
export function orbResolver(s: Settings): (name: string) => number {
  return (name) => orbFor(s, name);
}

export const DEFAULT_SETTINGS: Settings = {
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  defaultOrb: 1.0,
  orbs: {},
  objects: ['Луна', 'Меркурий', 'Венера', 'Солнце', 'Марс',
    'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Раху', 'Кету'],
  extraEnabled: [],
  theme: 'auto',
  signStyle: 'auto',
  notifyDaily: false,
  dailyNotifyTime: '09:00',
  dailyDigestMode: 'once',
  dailyNotifyTime2: '21:00',
  notifyAspects: false,
  notifyTransits: false,
  quietEnabled: true,
  quietFrom: '22:00',
  quietTo: '09:00',   // тихое время по умолчанию 22:00–09:00 (просьба владелицы 2026-07-10)
  transitCusps: false,
  largeFont: false,
  font: 'default',
  seenWelcome: false,
  houseSystem: 'horizontal',
  batterySaver: 'auto',
  nodalAxisFigures: false,
};
