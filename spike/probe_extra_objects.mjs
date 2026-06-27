/**
 * Спайк-проба ДОП. ОБЪЕКТОВ (§ астролог 2026-06-27): астероиды и догрузка TNO.
 * Не сверка с эталоном (у pysweph нет файлов → астероиды ему недоступны), а
 * проверка возможностей движка swisseph-wasm в режиме SWIEPH:
 *   1) что лежит в бандле (виртуальная ФС);
 *   2) считаются ли «коробочные» доп. объекты (Хирон…Веста, Лилит);
 *   3) РАБОТАЕТ ли догрузка .se1 во время работы (механизм для Эриды/Макемаке).
 *
 * Запуск:  node probe_extra_objects.mjs   (из папки spike/)
 */
import SwissEph from 'swisseph-wasm';

const SWIEPH = 2 | 256;          // FLG_SWIEPH | FLG_SPEED
const AST = 10000;               // SE_AST_OFFSET

const swe = new SwissEph();
await swe.initSwissEph();
const m = swe.SweModule;

function calc(jd, ipl) {
  const xx = m._malloc(6 * 8), serr = m._malloc(256);
  const rf = m.ccall('swe_calc_ut', 'number',
    ['number','number','number','number','number'], [jd, ipl, SWIEPH, xx, serr]);
  const lon = m.HEAPF64[xx >> 3], err = m.UTF8ToString(serr);
  m._free(xx); m._free(serr);
  return { rf, lon, err };
}

const jd = swe.julday(2025, 1, 1, 0);
console.log('swe', swe.version());

console.log('\n1) бандл (/sweph):', m.FS.readdir('/sweph').filter((f) => !f.startsWith('.')).join(', '));

console.log('\n2) «коробочные» доп. объекты на 2025-01-01:');
for (const [name, ipl] of [['Хирон',15],['Фолус',16],['Церера',17],['Паллада',18],
  ['Юнона',19],['Веста',20],['Лилит ср.',12],['Лилит ист.',13]]) {
  const r = calc(jd, ipl);
  console.log(`   ${name.padEnd(11)} ${r.rf >= 0 ? r.lon.toFixed(5) + '°' : 'ОШИБКА: ' + r.err}`);
}

console.log('\n3) догрузка .se1 во время работы (Церера на 1000 г., файла нет в бандле):');
const jdFar = swe.julday(1000, 1, 1, 0);
const before = calc(jdFar, 17);
const fn = (before.err.match(/([a-z0-9_]+\.se1)/i) || [])[1];
console.log(`   до: ${before.rf >= 0 ? before.lon.toFixed(5) + '°' : '«' + before.err + '»'}`);
if (fn) {
  try {
    const url = `https://raw.githubusercontent.com/aloistr/swisseph/master/ephe/${fn}`;
    const resp = await fetch(url);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    m.FS.writeFile('/sweph/' + fn, bytes);
    const after = calc(jdFar, 17);
    console.log(`   докачал ${fn} (${bytes.length} б, HTTP ${resp.status}), пишу в ФС →`,
      after.rf >= 0 ? '✅ Церера = ' + after.lon.toFixed(5) + '°' : 'ОШИБКА: ' + after.err);
  } catch (e) {
    console.log('   (нет сети для докачки — пропуск; механизм FS.writeFile тот же):', e.message);
  }
}

// то же для TNO (Эрида): только демонстрация имени файла и пути astN
const eris = calc(jd, AST + 136199);
console.log('\n4) TNO Эрида (без файла):', eris.rf >= 0 ? eris.lon.toFixed(5) + '°' :
  `нужен ${(eris.err.match(/([a-z0-9_]+\.se1)/i) || [])[1]} в /sweph/ast136/`);

swe.close?.();
