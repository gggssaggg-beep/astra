/** Типы публичного интерфейса движка (§2.3). */

export type EphemerisMode = 'swieph' | 'moshier';

export interface BodyPosition {
  name: string;
  glyph: string;
  lon: number;          // эклиптическая долгота, °
  sign: string;         // знак зодиака
  signGlyph: string;
  degInSign: number;    // 0..30
  speed: number;        // °/сут
  retro: boolean;
}

export type AspectBucket = 'slow' | 'fast' | 'moon';

export interface AspectRecord {
  p1: string;
  p2: string;
  aspect: string;
  symbol: string;
  exactOrb: number;        // текущий минимальный орбис за сутки, °
  exactTime: Date | null;  // момент точного аспекта (UTC), если есть в сутках
  beginTime: Date | null;  // вход в орбис (может быть за пределами суток)
  endTime: Date | null;    // выход из орбиса
  applying: boolean;       // приближается (true) / расходится (false)
  pos1: number;
  pos2: number;
  bucket: AspectBucket;
}

export interface DayAspects {
  date: Date;              // 00:00 UTC суток
  slow: AspectRecord[];
  fast: AspectRecord[];
  moon: AspectRecord[];
  audit: string[];         // предупреждения аудита элонгаций
}

export type DayEventKind = 'ingress' | 'station' | 'lunation' | 'eclipse';

/** «Событие неба» помимо аспектов (§2.3 events_on, §3.3 фильтры). */
export interface DayEvent {
  kind: DayEventKind;
  time: Date;
  object?: string;          // планета (ингрессия/станция)
  glyph?: string;
  sign?: string;            // знак (ингрессия/лунация/затмение)
  signGlyph?: string;
  text: string;             // готовая подпись
  retro?: boolean;          // станция: true = становится ретроградной
  phase?: 'new' | 'full';   // лунация
  eclipseKind?: 'solar' | 'lunar';
  eclipseType?: string;     // полное/частное/…
  saros?: number;
  member?: number;
}
