/**
 * Координаты места рождения: честный разбор ввода и проверка правдоподобия.
 *
 * Зачем (разбор 2026-08-07, docs/TASK_JYOTISH_ROUND2.md §1): астролог сообщил
 * «лагна не совпадает». Движок оказался исправен — он ввёл широту и долготу
 * НАПЕРЕПУТКУ (в его программе поля идут Longitude → Latitude, у нас наоборот),
 * получил чужую лагну и «починил» её, сдвинув часовой пояс. Ошибка ввода на
 * четверть градуса двигает лагну на минуты, на десяток градусов — на знак.
 *
 * Отсюда три вещи, которые делает этот модуль:
 *   1) `parseCoord` — принимает и десятичные градусы, и запись градус-минута
 *      (`47N28`, `47°28′`, `47 28 30`). Человек набирает `47N28` как «47.28»,
 *      хотя это 47,467° — форма обязана показать, КАК поняла;
 *   2) буква полушария в чужом поле (`28E19` в поле широты) — прямой признак
 *      перепутанных полей, отдаём это наружу отдельным признаком `axis`;
 *   3) `checkPlace` — сверка с справочником городов и с часовым поясом:
 *      далеко от одноимённого города или долгота не вяжется с поясом → говорим
 *      об этом ДО сохранения, а не строим молча неверную карту.
 *
 * Сеть не используется (оффлайн-первое правило): справочник — свой, местный.
 */
import { CITIES, type City } from './cities.ts';
import { tzOffsetMinutes } from './format.ts';

export type CoordKind = 'lat' | 'lon';

export interface CoordParse {
  /** Градусы со знаком; null — разобрать не удалось. */
  deg: number | null;
  /** Запись была градус-минутной (`47N28`), а не десятичной. */
  dms: boolean;
  /** Ось, названная буквой полушария (N/S/С/Ю → lat, E/W/В/З → lon); null — буквы не было. */
  axis: CoordKind | null;
  /** Почему не разобрали: не читается / вне диапазона / минуты-секунды ≥ 60. */
  err: null | 'unreadable' | 'range' | 'sexagesimal';
}

const LIMIT: Record<CoordKind, number> = { lat: 90, lon: 180 };

// Буквы полушарий: латиница и кириллица (человек пишет и «47N28», и «47с28»).
const HEMI: Record<string, { axis: CoordKind; sign: 1 | -1 }> = {
  n: { axis: 'lat', sign: 1 }, s: { axis: 'lat', sign: -1 },
  e: { axis: 'lon', sign: 1 }, w: { axis: 'lon', sign: -1 },
  с: { axis: 'lat', sign: 1 }, ю: { axis: 'lat', sign: -1 },
  в: { axis: 'lon', sign: 1 }, з: { axis: 'lon', sign: -1 },
};

/**
 * Разбор одного поля координаты.
 *
 * Принимает: `59.9391`, `59,9391` (запятая — десятичная), `-30.32`,
 * `47N28`, `47 N 28`, `47°28′`, `47°28′30″`, `47 28 30`, `47:28:30`, `28E19.5`,
 * `47.47S`. Число групп цифр и решает: одна — десятичные градусы, две —
 * градусы+минуты, три — градусы+минуты+секунды.
 *
 * ВАЖНО про неоднозначность: `47.28` мы честно понимаем как 47,28° (а не
 * 47°28′) — угадывать за человека нельзя. Поэтому форма показывает разбор
 * обратно строкой `fmtCoord`, и ошибку видно сразу.
 */
export function parseCoord(raw: string, kind: CoordKind): CoordParse {
  const miss: CoordParse = { deg: null, dms: false, axis: null, err: 'unreadable' };
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return { ...miss, err: 'unreadable' };

  let axis: CoordKind | null = null;
  let hemiSign: 1 | -1 | null = null;
  for (const ch of s) {
    const h = HEMI[ch];
    if (!h) continue;
    if (axis) return miss;          // две буквы полушария в одном поле — не понимаем
    axis = h.axis; hemiSign = h.sign;
  }

  const minus = /^\s*[-−]/.test(s); // U+2212 приходит из копипасты таблиц
  if (minus && hemiSign != null) return miss; // и минус, и буква — противоречие

  const nums = s.match(/\d+(?:[.,]\d+)?/g);
  if (!nums || nums.length > 3) return miss;
  const parts = nums.map((n) => Number(n.replace(',', '.')));
  if (parts.some((n) => !Number.isFinite(n))) return miss;

  const dms = parts.length > 1;
  if (dms && parts.slice(1).some((n) => n >= 60)) return { ...miss, err: 'sexagesimal' };
  if (dms && !Number.isInteger(parts[0])) return miss; // «47.5°28′» — бессмыслица

  let deg = parts[0] + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600;
  if (minus) deg = -deg;
  else if (hemiSign === -1) deg = -deg;

  if (Math.abs(deg) > LIMIT[kind]) return { ...miss, err: 'range' };
  return { deg, dms, axis, err: null };
}

/** «47°28′12″ с.ш.» — как приложение поняло введённое. */
export function fmtCoord(deg: number, kind: CoordKind): string {
  const a = Math.abs(deg);
  let d = Math.floor(a);
  const mFull = (a - d) * 60;
  let m = Math.floor(mFull);
  let sec = Math.round((mFull - m) * 60);
  if (sec === 60) { sec = 0; m += 1; }   // округление секунд вверх переносится в минуты,
  if (m === 60) { m = 0; d += 1; }       // а минут — в градусы (иначе «47°60′»)
  const suffix = kind === 'lat' ? (deg < 0 ? 'ю.ш.' : 'с.ш.') : (deg < 0 ? 'з.д.' : 'в.д.');
  const secPart = sec ? `${String(sec).padStart(2, '0')}″` : '';
  return `${d}°${String(m).padStart(2, '0')}′${secPart} ${suffix}`;
}

/** Десятичная запись по-русски: «47,467°» (для строки «как поняли»). */
export const fmtDegDecimal = (deg: number): string =>
  `${deg.toFixed(4).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',')}°`;

/** Расстояние по большому кругу, км (гаверсинус; Земля 6371 км). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const norm = (s: string): string => s.toLowerCase().replace(/ё/g, 'е').replace(/-/g, ' ').trim();

/** Город справочника ровно с таким названием (рус./лат.); тёзки — только если один. */
export function cityByName(name: string): City | null {
  const q = norm(name);
  if (!q) return null;
  const hits = CITIES.filter((c) => norm(c.ru) === q || norm(c.en) === q);
  return hits.length === 1 ? hits[0] : null;
}

export interface PlaceCheck {
  level: 'ok' | 'warn';
  text: string;
  /** Замена «поменять местами» реально помогает — можно предложить кнопкой. */
  swap: boolean;
}

const OK: PlaceCheck = { level: 'ok', text: '', swap: false };

/** Угловая разница долгот, −180…180. */
const lonDelta = (a: number, b: number): number => ((a - b + 540) % 360) - 180;

/**
 * Правдоподобны ли координаты. Не запрещает сохранение — даёт человеку повод
 * перепроверить (посёлка может не быть в справочнике, и это нормально).
 *
 * Проверки по убыванию надёжности:
 *   1) нули — молчаливый провал старой формы (Гвинейский залив);
 *   2) точка далеко от одноимённого города справочника;
 *   3) долгота не вяжется с часовым поясом (>45° = больше трёх часов; такой
 *      запас переживает и декретное время, и широкие пояса Китая/Индии).
 * Если перестановка широты с долготой снимает претензию — говорим об этом.
 */
export function checkPlace(
  name: string, lat: number, lon: number, tz: string, when: Date = new Date(),
): PlaceCheck {
  if (lat === 0 && lon === 0) {
    return { level: 'warn', text: 'Координаты 0, 0 — это Гвинейский залив. Выбери город или впиши координаты.', swap: false };
  }

  const city = cityByName(name);
  if (city) {
    const d = distanceKm(lat, lon, city.lat, city.lon);
    if (d > 200) {
      const swapped = Math.abs(lon) <= 90 ? distanceKm(lon, lat, city.lat, city.lon) : Infinity;
      const swap = swapped < d / 3 && swapped < 200;
      const where = `${fmtCoord(city.lat, 'lat')}, ${fmtCoord(city.lon, 'lon')}`;
      return {
        level: 'warn',
        text: `«${city.ru}» в справочнике — ${where}, а введено на ${Math.round(d)} км в стороне.`
          + (swap ? ' Похоже, широта и долгота перепутаны местами.' : ''),
        swap,
      };
    }
    return OK;
  }

  const off = tzOffsetMinutes(when, tz);
  if (off == null) return OK;
  const expected = (off / 60) * 15;         // средний меридиан пояса
  const miss = Math.abs(lonDelta(lon, expected));
  if (miss > 45) {
    const swappedMiss = Math.abs(lat) <= 180 ? Math.abs(lonDelta(lat, expected)) : Infinity;
    const swap = swappedMiss <= 45 && Math.abs(lon) <= 90;
    return {
      level: 'warn',
      text: `Долгота ${fmtCoord(lon, 'lon')} не вяжется с часовым поясом: ему отвечает примерно ${fmtCoord(expected, 'lon')}.`
        + (swap ? ' Похоже, широта и долгота перепутаны местами.' : ' Проверь и координаты, и пояс.'),
      swap,
    };
  }
  return OK;
}

/** Ближайший город справочника — подсказка «нет посёлка, возьми соседа». */
export function nearestCity(lat: number, lon: number): { city: City; km: number } | null {
  let best: City | null = null, bestKm = Infinity;
  for (const c of CITIES) {
    const km = distanceKm(lat, lon, c.lat, c.lon);
    if (km < bestKm) { bestKm = km; best = c; }
  }
  return best ? { city: best, km: bestKm } : null;
}
