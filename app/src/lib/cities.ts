/**
 * Оффлайн-справочник городов для места рождения: город → часовой пояс (IANA) +
 * координаты (пригодятся домам). Сеть НЕ используется (геокодинг по интернету
 * запрещён CLAUDE.md). Поиск по-русски и по-английски.
 *
 * ВАЖНО: пояс — именно географический IANA-идентификатор, не «UTC+N». Тогда для
 * дат рождения ДО отмены перевода часов (Россия — 2011) Intl сам применит
 * историческое летнее время (напр. Москва, лето 1988 = MSD, UTC+4). Чего нет в
 * списке — вводится координатами и поясом вручную в форме.
 */

export interface City {
  ru: string;    // русское имя
  en: string;    // латиница (для поиска и «Saint Petersburg»)
  lat: number;
  lon: number;
  tz: string;    // IANA
  adm?: string;  // регион/страна — для различения тёзок в подсказке
}

// Компактная запись: [ru, en, lat, lon, tz, adm?]
type Row = [string, string, number, number, string, string?];

const RU: Row[] = [
  ['Москва', 'Moscow', 55.7558, 37.6173, 'Europe/Moscow', 'Россия'],
  ['Санкт-Петербург', 'Saint Petersburg', 59.9391, 30.3159, 'Europe/Moscow', 'Россия'],
  ['Великий Новгород', 'Veliky Novgorod', 58.5215, 31.2755, 'Europe/Moscow', 'Россия'],
  ['Псков', 'Pskov', 57.8194, 28.3319, 'Europe/Moscow', 'Россия'],
  ['Мурманск', 'Murmansk', 68.9585, 33.0827, 'Europe/Moscow', 'Россия'],
  ['Петрозаводск', 'Petrozavodsk', 61.7849, 34.3469, 'Europe/Moscow', 'Россия'],
  ['Архангельск', 'Arkhangelsk', 64.5401, 40.5433, 'Europe/Moscow', 'Россия'],
  ['Сыктывкар', 'Syktyvkar', 61.6688, 50.8360, 'Europe/Moscow', 'Россия'],
  ['Вологда', 'Vologda', 59.2181, 39.8886, 'Europe/Moscow', 'Россия'],
  ['Ярославль', 'Yaroslavl', 57.6261, 39.8845, 'Europe/Moscow', 'Россия'],
  ['Кострома', 'Kostroma', 57.7676, 40.9268, 'Europe/Moscow', 'Россия'],
  ['Иваново', 'Ivanovo', 57.0000, 40.9739, 'Europe/Moscow', 'Россия'],
  ['Тверь', 'Tver', 56.8587, 35.9176, 'Europe/Moscow', 'Россия'],
  ['Смоленск', 'Smolensk', 54.7818, 32.0401, 'Europe/Moscow', 'Россия'],
  ['Брянск', 'Bryansk', 53.2434, 34.3639, 'Europe/Moscow', 'Россия'],
  ['Калуга', 'Kaluga', 54.5293, 36.2754, 'Europe/Moscow', 'Россия'],
  ['Тула', 'Tula', 54.1961, 37.6182, 'Europe/Moscow', 'Россия'],
  ['Рязань', 'Ryazan', 54.6269, 39.6916, 'Europe/Moscow', 'Россия'],
  ['Владимир', 'Vladimir', 56.1290, 40.4066, 'Europe/Moscow', 'Россия'],
  ['Нижний Новгород', 'Nizhny Novgorod', 56.2965, 43.9361, 'Europe/Moscow', 'Россия'],
  ['Липецк', 'Lipetsk', 52.6031, 39.5708, 'Europe/Moscow', 'Россия'],
  ['Воронеж', 'Voronezh', 51.6608, 39.2003, 'Europe/Moscow', 'Россия'],
  ['Тамбов', 'Tambov', 52.7212, 41.4523, 'Europe/Moscow', 'Россия'],
  ['Орёл', 'Oryol', 52.9671, 36.0696, 'Europe/Moscow', 'Россия'],
  ['Курск', 'Kursk', 51.7304, 36.1926, 'Europe/Moscow', 'Россия'],
  ['Белгород', 'Belgorod', 50.5952, 36.5872, 'Europe/Moscow', 'Россия'],
  ['Ростов-на-Дону', 'Rostov-on-Don', 47.2357, 39.7015, 'Europe/Moscow', 'Россия'],
  ['Краснодар', 'Krasnodar', 45.0355, 38.9753, 'Europe/Moscow', 'Россия'],
  ['Сочи', 'Sochi', 43.5855, 39.7231, 'Europe/Moscow', 'Россия'],
  ['Ставрополь', 'Stavropol', 45.0428, 41.9734, 'Europe/Moscow', 'Россия'],
  ['Майкоп', 'Maykop', 44.6098, 40.1006, 'Europe/Moscow', 'Россия'],
  ['Черкесск', 'Cherkessk', 44.2269, 42.0466, 'Europe/Moscow', 'Россия'],
  ['Нальчик', 'Nalchik', 43.4981, 43.6189, 'Europe/Moscow', 'Россия'],
  ['Владикавказ', 'Vladikavkaz', 43.0241, 44.6814, 'Europe/Moscow', 'Россия'],
  ['Магас', 'Magas', 43.1667, 44.8119, 'Europe/Moscow', 'Россия'],
  ['Грозный', 'Grozny', 43.3179, 45.6981, 'Europe/Moscow', 'Россия'],
  ['Махачкала', 'Makhachkala', 42.9849, 47.5047, 'Europe/Moscow', 'Россия'],
  ['Элиста', 'Elista', 46.3079, 44.2558, 'Europe/Moscow', 'Россия'],
  ['Казань', 'Kazan', 55.7963, 49.1088, 'Europe/Moscow', 'Россия'],
  ['Чебоксары', 'Cheboksary', 56.1439, 47.2489, 'Europe/Moscow', 'Россия'],
  ['Йошкар-Ола', 'Yoshkar-Ola', 56.6388, 47.8908, 'Europe/Moscow', 'Россия'],
  ['Саранск', 'Saransk', 54.1838, 45.1749, 'Europe/Moscow', 'Россия'],
  ['Пенза', 'Penza', 53.1959, 45.0183, 'Europe/Moscow', 'Россия'],
  ['Киров', 'Kirov', 58.6035, 49.6680, 'Europe/Kirov', 'Россия'],
  ['Волгоград', 'Volgograd', 48.7080, 44.5133, 'Europe/Volgograd', 'Россия'],
  ['Астрахань', 'Astrakhan', 46.3479, 48.0336, 'Europe/Astrakhan', 'Россия'],
  ['Саратов', 'Saratov', 51.5924, 46.0348, 'Europe/Saratov', 'Россия'],
  ['Ульяновск', 'Ulyanovsk', 54.3142, 48.4031, 'Europe/Ulyanovsk', 'Россия'],
  ['Самара', 'Samara', 53.1959, 50.1000, 'Europe/Samara', 'Россия'],
  ['Тольятти', 'Tolyatti', 53.5303, 49.3461, 'Europe/Samara', 'Россия'],
  ['Ижевск', 'Izhevsk', 56.8526, 53.2045, 'Europe/Samara', 'Россия'],
  ['Уфа', 'Ufa', 54.7388, 55.9721, 'Asia/Yekaterinburg', 'Россия'],
  ['Пермь', 'Perm', 58.0105, 56.2502, 'Asia/Yekaterinburg', 'Россия'],
  ['Екатеринбург', 'Yekaterinburg', 56.8389, 60.6057, 'Asia/Yekaterinburg', 'Россия'],
  ['Челябинск', 'Chelyabinsk', 55.1644, 61.4368, 'Asia/Yekaterinburg', 'Россия'],
  ['Курган', 'Kurgan', 55.4410, 65.3411, 'Asia/Yekaterinburg', 'Россия'],
  ['Тюмень', 'Tyumen', 57.1522, 65.5272, 'Asia/Yekaterinburg', 'Россия'],
  ['Оренбург', 'Orenburg', 51.7682, 55.0969, 'Asia/Yekaterinburg', 'Россия'],
  ['Ханты-Мансийск', 'Khanty-Mansiysk', 61.0042, 69.0019, 'Asia/Yekaterinburg', 'Россия'],
  ['Сургут', 'Surgut', 61.2540, 73.3962, 'Asia/Yekaterinburg', 'Россия'],
  ['Салехард', 'Salekhard', 66.5299, 66.6136, 'Asia/Yekaterinburg', 'Россия'],
  ['Омск', 'Omsk', 54.9885, 73.3242, 'Asia/Omsk', 'Россия'],
  ['Новосибирск', 'Novosibirsk', 55.0084, 82.9357, 'Asia/Novosibirsk', 'Россия'],
  ['Барнаул', 'Barnaul', 53.3548, 83.7698, 'Asia/Barnaul', 'Россия'],
  ['Горно-Алтайск', 'Gorno-Altaysk', 51.9587, 85.9603, 'Asia/Barnaul', 'Россия'],
  ['Томск', 'Tomsk', 56.4846, 84.9476, 'Asia/Tomsk', 'Россия'],
  ['Кемерово', 'Kemerovo', 55.3547, 86.0873, 'Asia/Novokuznetsk', 'Россия'],
  ['Новокузнецк', 'Novokuznetsk', 53.7596, 87.1216, 'Asia/Novokuznetsk', 'Россия'],
  ['Красноярск', 'Krasnoyarsk', 56.0153, 92.8932, 'Asia/Krasnoyarsk', 'Россия'],
  ['Норильск', 'Norilsk', 69.3558, 88.1893, 'Asia/Krasnoyarsk', 'Россия'],
  ['Абакан', 'Abakan', 53.7223, 91.4437, 'Asia/Krasnoyarsk', 'Россия'],
  ['Кызыл', 'Kyzyl', 51.7191, 94.4378, 'Asia/Krasnoyarsk', 'Россия'],
  ['Иркутск', 'Irkutsk', 52.2870, 104.3050, 'Asia/Irkutsk', 'Россия'],
  ['Улан-Удэ', 'Ulan-Ude', 51.8335, 107.5842, 'Asia/Irkutsk', 'Россия'],
  ['Чита', 'Chita', 52.0340, 113.4994, 'Asia/Chita', 'Россия'],
  ['Якутск', 'Yakutsk', 62.0355, 129.6755, 'Asia/Yakutsk', 'Россия'],
  ['Благовещенск', 'Blagoveshchensk', 50.2907, 127.5272, 'Asia/Yakutsk', 'Россия'],
  ['Хабаровск', 'Khabarovsk', 48.4827, 135.0838, 'Asia/Vladivostok', 'Россия'],
  ['Владивосток', 'Vladivostok', 43.1155, 131.8855, 'Asia/Vladivostok', 'Россия'],
  ['Биробиджан', 'Birobidzhan', 48.7946, 132.9218, 'Asia/Vladivostok', 'Россия'],
  ['Магадан', 'Magadan', 59.5638, 150.8035, 'Asia/Magadan', 'Россия'],
  ['Южно-Сахалинск', 'Yuzhno-Sakhalinsk', 46.9591, 142.7380, 'Asia/Sakhalin', 'Россия'],
  ['Петропавловск-Камчатский', 'Petropavlovsk-Kamchatsky', 53.0370, 158.6559, 'Asia/Kamchatka', 'Россия'],
  ['Анадырь', 'Anadyr', 64.7337, 177.5083, 'Asia/Anadyr', 'Россия'],
  ['Калининград', 'Kaliningrad', 54.7104, 20.4522, 'Europe/Kaliningrad', 'Россия'],
  ['Симферополь', 'Simferopol', 44.9521, 34.1024, 'Europe/Simferopol', 'Крым'],
  ['Севастополь', 'Sevastopol', 44.6166, 33.5254, 'Europe/Simferopol', 'Крым'],
];

const CIS: Row[] = [
  ['Минск', 'Minsk', 53.9006, 27.5590, 'Europe/Minsk', 'Беларусь'],
  ['Киев', 'Kyiv', 50.4501, 30.5234, 'Europe/Kyiv', 'Украина'],
  ['Харьков', 'Kharkiv', 49.9935, 36.2304, 'Europe/Kyiv', 'Украина'],
  ['Одесса', 'Odesa', 46.4825, 30.7233, 'Europe/Kyiv', 'Украина'],
  ['Львов', 'Lviv', 49.8397, 24.0297, 'Europe/Kyiv', 'Украина'],
  ['Днепр', 'Dnipro', 48.4647, 35.0462, 'Europe/Kyiv', 'Украина'],
  ['Кишинёв', 'Chisinau', 47.0105, 28.8638, 'Europe/Chisinau', 'Молдова'],
  ['Ереван', 'Yerevan', 40.1792, 44.4991, 'Asia/Yerevan', 'Армения'],
  ['Тбилиси', 'Tbilisi', 41.7151, 44.8271, 'Asia/Tbilisi', 'Грузия'],
  ['Баку', 'Baku', 40.4093, 49.8671, 'Asia/Baku', 'Азербайджан'],
  ['Астана', 'Astana', 51.1694, 71.4491, 'Asia/Almaty', 'Казахстан'],
  ['Алматы', 'Almaty', 43.2220, 76.8512, 'Asia/Almaty', 'Казахстан'],
  ['Шымкент', 'Shymkent', 42.3417, 69.5901, 'Asia/Almaty', 'Казахстан'],
  ['Ташкент', 'Tashkent', 41.2995, 69.2401, 'Asia/Tashkent', 'Узбекистан'],
  ['Самарканд', 'Samarkand', 39.6270, 66.9750, 'Asia/Samarkand', 'Узбекистан'],
  ['Бишкек', 'Bishkek', 42.8746, 74.5698, 'Asia/Bishkek', 'Киргизия'],
  ['Душанбе', 'Dushanbe', 38.5598, 68.7870, 'Asia/Dushanbe', 'Таджикистан'],
  ['Ашхабад', 'Ashgabat', 37.9601, 58.3261, 'Asia/Ashgabat', 'Туркмения'],
];

const WORLD: Row[] = [
  ['Лондон', 'London', 51.5074, -0.1278, 'Europe/London', 'Великобритания'],
  ['Париж', 'Paris', 48.8566, 2.3522, 'Europe/Paris', 'Франция'],
  ['Берлин', 'Berlin', 52.5200, 13.4050, 'Europe/Berlin', 'Германия'],
  ['Мюнхен', 'Munich', 48.1351, 11.5820, 'Europe/Berlin', 'Германия'],
  ['Рим', 'Rome', 41.9028, 12.4964, 'Europe/Rome', 'Италия'],
  ['Милан', 'Milan', 45.4642, 9.1900, 'Europe/Rome', 'Италия'],
  ['Мадрид', 'Madrid', 40.4168, -3.7038, 'Europe/Madrid', 'Испания'],
  ['Барселона', 'Barcelona', 41.3874, 2.1686, 'Europe/Madrid', 'Испания'],
  ['Лиссабон', 'Lisbon', 38.7223, -9.1393, 'Europe/Lisbon', 'Португалия'],
  ['Амстердам', 'Amsterdam', 52.3676, 4.9041, 'Europe/Amsterdam', 'Нидерланды'],
  ['Брюссель', 'Brussels', 50.8503, 4.3517, 'Europe/Brussels', 'Бельгия'],
  ['Цюрих', 'Zurich', 47.3769, 8.5417, 'Europe/Zurich', 'Швейцария'],
  ['Вена', 'Vienna', 48.2082, 16.3738, 'Europe/Vienna', 'Австрия'],
  ['Прага', 'Prague', 50.0755, 14.4378, 'Europe/Prague', 'Чехия'],
  ['Варшава', 'Warsaw', 52.2297, 21.0122, 'Europe/Warsaw', 'Польша'],
  ['Будапешт', 'Budapest', 47.4979, 19.0402, 'Europe/Budapest', 'Венгрия'],
  ['Бухарест', 'Bucharest', 44.4268, 26.1025, 'Europe/Bucharest', 'Румыния'],
  ['София', 'Sofia', 42.6977, 23.3219, 'Europe/Sofia', 'Болгария'],
  ['Афины', 'Athens', 37.9838, 23.7275, 'Europe/Athens', 'Греция'],
  ['Стокгольм', 'Stockholm', 59.3293, 18.0686, 'Europe/Stockholm', 'Швеция'],
  ['Осло', 'Oslo', 59.9139, 10.7522, 'Europe/Oslo', 'Норвегия'],
  ['Копенгаген', 'Copenhagen', 55.6761, 12.5683, 'Europe/Copenhagen', 'Дания'],
  ['Хельсинки', 'Helsinki', 60.1699, 24.9384, 'Europe/Helsinki', 'Финляндия'],
  ['Рига', 'Riga', 56.9496, 24.1052, 'Europe/Riga', 'Латвия'],
  ['Вильнюс', 'Vilnius', 54.6872, 25.2797, 'Europe/Vilnius', 'Литва'],
  ['Таллин', 'Tallinn', 59.4370, 24.7536, 'Europe/Tallinn', 'Эстония'],
  ['Стамбул', 'Istanbul', 41.0082, 28.9784, 'Europe/Istanbul', 'Турция'],
  ['Дубай', 'Dubai', 25.2048, 55.2708, 'Asia/Dubai', 'ОАЭ'],
  ['Тель-Авив', 'Tel Aviv', 32.0853, 34.7818, 'Asia/Jerusalem', 'Израиль'],
  ['Иерусалим', 'Jerusalem', 31.7683, 35.2137, 'Asia/Jerusalem', 'Израиль'],
  ['Каир', 'Cairo', 30.0444, 31.2357, 'Africa/Cairo', 'Египет'],
  ['Нью-Дели', 'New Delhi', 28.6139, 77.2090, 'Asia/Kolkata', 'Индия'],
  ['Мумбаи', 'Mumbai', 19.0760, 72.8777, 'Asia/Kolkata', 'Индия'],
  ['Пекин', 'Beijing', 39.9042, 116.4074, 'Asia/Shanghai', 'Китай'],
  ['Шанхай', 'Shanghai', 31.2304, 121.4737, 'Asia/Shanghai', 'Китай'],
  ['Гонконг', 'Hong Kong', 22.3193, 114.1694, 'Asia/Hong_Kong', 'Китай'],
  ['Токио', 'Tokyo', 35.6762, 139.6503, 'Asia/Tokyo', 'Япония'],
  ['Сеул', 'Seoul', 37.5665, 126.9780, 'Asia/Seoul', 'Корея'],
  ['Бангкок', 'Bangkok', 13.7563, 100.5018, 'Asia/Bangkok', 'Таиланд'],
  ['Сингапур', 'Singapore', 1.3521, 103.8198, 'Asia/Singapore', 'Сингапур'],
  ['Нью-Йорк', 'New York', 40.7128, -74.0060, 'America/New_York', 'США'],
  ['Лос-Анджелес', 'Los Angeles', 34.0522, -118.2437, 'America/Los_Angeles', 'США'],
  ['Чикаго', 'Chicago', 41.8781, -87.6298, 'America/Chicago', 'США'],
  ['Торонто', 'Toronto', 43.6532, -79.3832, 'America/Toronto', 'Канада'],
  ['Мехико', 'Mexico City', 19.4326, -99.1332, 'America/Mexico_City', 'Мексика'],
  ['Сан-Паулу', 'Sao Paulo', -23.5505, -46.6333, 'America/Sao_Paulo', 'Бразилия'],
  ['Буэнос-Айрес', 'Buenos Aires', -34.6037, -58.3816, 'America/Argentina/Buenos_Aires', 'Аргентина'],
  ['Сидней', 'Sydney', -33.8688, 151.2093, 'Australia/Sydney', 'Австралия'],
];

export const CITIES: City[] = [...RU, ...CIS, ...WORLD].map(
  ([ru, en, lat, lon, tz, adm]) => ({ ru, en, lat, lon, tz, adm }),
);

const norm = (s: string): string => s.toLowerCase().replace(/ё/g, 'е').replace(/-/g, ' ').trim();

/** Поиск по началу слова (сначала) и по вхождению (потом), русский/латиница. */
export function searchCities(query: string, limit = 7): City[] {
  const q = norm(query);
  if (!q) return [];
  const starts: City[] = [], contains: City[] = [];
  for (const c of CITIES) {
    const ru = norm(c.ru), en = norm(c.en);
    if (ru.startsWith(q) || en.startsWith(q)) starts.push(c);
    else if (ru.includes(q) || en.includes(q)) contains.push(c);
  }
  return [...starts, ...contains].slice(0, limit);
}
