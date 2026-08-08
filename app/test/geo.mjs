/**
 * Тест разбора координат и проверки правдоподобия (docs/TASK_JYOTISH_ROUND2.md §1).
 *
 * Повод: астролог ввёл широту и долготу наперепутку и получил лагну на знак
 * дальше. Движок был исправен — виноват ввод. Здесь закреплено то, что должно
 * ловить такую ошибку ДО построения карты.
 *
 * Запуск: node test/geo.mjs
 */
import { parseCoord, fmtCoord, fmtDegDecimal, distanceKm, checkPlace, cityByName, nearestCity }
  from '../src/lib/geo.ts';

let ok = 0, bad = 0;
const eq = (name, got, exp) => {
  if (got === exp) { ok++; }
  else { bad++; console.log(`  БАГ  ${name}: ${got} ≠ ${exp}`); }
};
const near = (name, got, exp, tol = 1e-6) => {
  if (Math.abs(got - exp) <= tol) { ok++; }
  else { bad++; console.log(`  БАГ  ${name}: ${got} ≉ ${exp}`); }
};

// --- десятичные градусы ---
near('59.9391 широта', parseCoord('59.9391', 'lat').deg, 59.9391);
near('запятая как точка', parseCoord('59,9391', 'lat').deg, 59.9391);
near('минус', parseCoord('-33.8688', 'lat').deg, -33.8688);
near('типографский минус', parseCoord('−33.8688', 'lat').deg, -33.8688);
eq('десятичное не dms', parseCoord('59.9391', 'lat').dms, false);
eq('без буквы оси нет', parseCoord('59.9391', 'lat').axis, null);

// --- градус-минута: ровно та запись, которую человек путает с дробью ---
near('47N28 = 47°28′', parseCoord('47N28', 'lat').deg, 47 + 28 / 60);
near('47 N 28 с пробелами', parseCoord('47 N 28', 'lat').deg, 47 + 28 / 60);
near('кириллица 47с28', parseCoord('47с28', 'lat').deg, 47 + 28 / 60);
near('47°28′', parseCoord('47°28′', 'lat').deg, 47 + 28 / 60);
near('47 28 30', parseCoord('47 28 30', 'lat').deg, 47 + 28 / 60 + 30 / 3600);
near('47:28:30', parseCoord('47:28:30', 'lat').deg, 47 + 28 / 60 + 30 / 3600);
near('южное 33S52', parseCoord('33S52', 'lat').deg, -(33 + 52 / 60));
near('западное 58W22', parseCoord('58W22', 'lon').deg, -(58 + 22 / 60));
eq('градус-минута помечена dms', parseCoord('47N28', 'lat').dms, true);
// та же строка без буквы читается как ДРОБЬ — угадывать за человека нельзя
near('47.28 = 47,28° (не 47°28′)', parseCoord('47.28', 'lat').deg, 47.28);

// --- буква чужой оси = признак перепутанных полей ---
eq('в поле широты долгота', parseCoord('28E19', 'lat').axis, 'lon');
eq('и всё же разобрана', parseCoord('28E19', 'lat').err, null);
eq('в поле долготы широта', parseCoord('47N28', 'lon').axis, 'lat');

// --- отказы ---
eq('пусто', parseCoord('', 'lat').deg, null);
eq('буквы', parseCoord('около Киева', 'lat').deg, null);
eq('широта 95 вне диапазона', parseCoord('95', 'lat').err, 'range');
eq('долгота 181 вне диапазона', parseCoord('181', 'lon').err, 'range');
eq('долгота 95 — годная', parseCoord('95', 'lon').err, null);
eq('минуты 70', parseCoord('47 70', 'lat').err, 'sexagesimal');
eq('секунды 61', parseCoord('47 28 61', 'lat').err, 'sexagesimal');
eq('две буквы полушария', parseCoord('47NS28', 'lat').deg, null);
eq('минус и буква разом', parseCoord('-47N28', 'lat').deg, null);
eq('четыре группы', parseCoord('47 28 30 15', 'lat').deg, null);

// --- показ разбора обратно человеку ---
eq('формат широты', fmtCoord(47 + 28 / 60, 'lat'), '47°28′ с.ш.');
eq('формат с секундами', fmtCoord(47 + 28 / 60 + 30 / 3600, 'lat'), '47°28′30″ с.ш.');
eq('южная широта', fmtCoord(-33.8688, 'lat'), '33°52′08″ ю.ш.');
eq('западная долгота', fmtCoord(-58.3816, 'lon'), '58°22′54″ з.д.');
eq('десятичная запись', fmtDegDecimal(47 + 28 / 60), '47,4667°');
// перенос 59,9′ вверх не должен родить «60′»
eq('минуты не превращаются в 60', fmtCoord(47.99999, 'lat'), '48°00′ с.ш.');

// --- расстояние ---
near('Москва—Питер ≈ 634 км', distanceKm(55.7558, 37.6173, 59.9391, 30.3159), 634, 6);
near('нулевое расстояние', distanceKm(55, 37, 55, 37), 0, 1e-9);

// --- справочник ---
eq('город по имени', cityByName('Санкт-Петербург')?.tz, 'Europe/Moscow');
eq('город по латинице', cityByName('saint petersburg')?.ru, 'Санкт-Петербург');
eq('несуществующий', cityByName('Малые Васюки'), null);
eq('ближайший к точке рядом с Москвой', nearestCity(55.8, 37.5).city.ru, 'Москва');

// --- проверка правдоподобия ---
eq('нули ловятся', checkPlace('Питер', 0, 0, 'Europe/Moscow').level, 'warn');
eq('верные координаты города молчат',
  checkPlace('Санкт-Петербург', 59.9391, 30.3159, 'Europe/Moscow').level, 'ok');
eq('соседний посёлок под тем же именем — молчим',
  checkPlace('Санкт-Петербург', 60.05, 30.4, 'Europe/Moscow').level, 'ok');
const swapped = checkPlace('Санкт-Петербург', 30.3159, 59.9391, 'Europe/Moscow');
eq('перепутанные местами — предупреждение', swapped.level, 'warn');
eq('и предложение поменять местами', swapped.swap, true);
// посёлка в справочнике нет — работает сверка с поясом
const tzMiss = checkPlace('Посёлок у астролога', 47.47, 30.5, 'Asia/Vladivostok');
eq('долгота против пояса — предупреждение', tzMiss.level, 'warn');
eq('незнакомое место с верным поясом молчит',
  checkPlace('Посёлок у астролога', 47.47, 30.5, 'Europe/Kyiv').level, 'ok');
// декретное время СССР: пояс +4 при долготе 30 — запас в 45° это переживает
eq('декретный час не поднимает ложную тревогу',
  checkPlace('Посёлок у астролога', 47.47, 30.5, '+04:00').level, 'ok');

console.log(`\ngeo: ${ok} проверок ок, ${bad} — с ошибками`);
process.exit(bad ? 1 : 0);
