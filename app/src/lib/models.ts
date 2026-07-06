/**
 * Модели данных — фундамент под все фичи (§4 + раунд-3 пожелания астролога).
 * Хранилище абстрактно (db.ts): сейчас localStorage, позже Capacitor SQLite.
 */

export type ThemeMode = 'auto' | 'cosmos' | 'dawn';
export type EclipseKind = 'solar' | 'lunar';

/** Стиль символов знаков (выбирается в настройках). */
export type SignStyle = 'silver' | 'gold' | 'element' | 'shimmer' | 'rainbow';
export const SIGN_STYLES: { id: SignStyle; label: string }[] = [
  { id: 'silver', label: 'Серебро' },
  { id: 'gold', label: 'Золото · свечение' },
  { id: 'element', label: 'По стихиям' },
  { id: 'shimmer', label: 'Переливание' },
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
  dailyNotifyTime: string;    // 'HH:MM' для ежедневного уведомления
  notifyAspects: boolean;     // уведомления в момент точного аспекта
  notifyTransits?: boolean;   // уведомления о транзитах к натальной карте
  transitSelfId?: string;     // id человека = «моя карта» (чей натал отслеживаем)
  transitCusps?: boolean;     // включать куспиды домов (не только планеты)
  largeFont: boolean;         // крупный шрифт (доступность)
  font?: string;              // id шрифта интерфейса (lib/fonts.ts; нет = дефолт)
  seenWelcome: boolean;       // приветствие первого запуска уже показано
  seenJournalHelp?: boolean;  // обучалка журнала показана (закрыта кнопкой)
  houseSystem?: string;       // система домов (id из HOUSE_SYSTEMS; нет = горизонтальная)
  houseSysV2?: boolean;       // разовая миграция дефолта на горизонтальную (2026-07-06)
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
];

/** Запись бортового журнала = наблюдение (§3.5 + раунд 3). */
export interface JournalNote {
  id: string;
  createdAt: string;          // ISO timestamp создания
  date: string;               // 'YYYY-MM-DD' — день, к которому относится запись
  text: string;
  objects: string[];          // теги-объекты (планеты/карлики) — для выборки по планете
  aspectSignature?: string;   // опц. привязка к сигнатуре аспекта
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
 *  Луна быстрая (~13°/сут) — окно шире: по умолчанию 3° (просьба владелицы). */
export const DEFAULT_ORBS: Record<string, number> = { 'Луна': 3 };

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
  signStyle: 'gold',
  notifyDaily: false,
  dailyNotifyTime: '09:00',
  notifyAspects: false,
  notifyTransits: false,
  transitCusps: false,
  largeFont: false,
  font: 'default',
  seenWelcome: false,
  houseSystem: 'horizontal',
};
