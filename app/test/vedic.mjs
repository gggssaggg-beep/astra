/**
 * Сверка СИДЕРИЧЕСКОГО (ведического) режима движка.
 *
 * Эталоны двух родов:
 *  1) питон-эталон (.venv, pysweph, SIDM_LAHIRI) — аянамша и долготы;
 *  2) профессиональная джйотиш-программа: контрольная карта
 *     эталон А. Значения приведены в
 *     комментариях — движок обязан сходиться с ними до секунд дуги.
 *
 * Запуск:  node test/vedic.mjs   (Node ≥23.6 исполняет .ts напрямую)
 */
import assert from 'node:assert/strict';
import { createEngine } from '../src/engine/engine.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
/** Долгота → «дд°мм′сс″ Знак» — как её читает астролог, не сырым числом. */
const Z = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева',
  'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];
const dms = (l) => {
  const s = Math.floor(l / 30) % 12, d = l % 30, m = (d % 1) * 60;
  return `${String(Math.floor(d)).padStart(2, '0')}°${String(Math.floor(m)).padStart(2, '0')}′`
    + `${((m % 1) * 60).toFixed(1)}″ ${Z[s]}`;
};
/** Разница в СЕКУНДАХ дуги — в них и меряем сходимость. */
const arcsec = (a, b) => Math.abs(((a - b + 540) % 360 - 180)) * 3600;

const eph = await createEngine('swieph', { zodiac: 'sidereal', ayanamsa: 'lahiri' });
const trop = await createEngine('swieph');

console.log('=== аянамша Лахири (эталон: pysweph, полдень UT) ===');
{
  const cases = [
    [Date.UTC(2000, 0, 1, 12), 23.857092],
    [Date.UTC(1998, 2, 12, 12), 23.831851],
    [Date.UTC(2026, 6, 28, 12), 24.228279],
  ];
  for (const [ms, ref] of cases) {
    const jd = eph.toJD(new Date(ms));
    const got = eph.ayanamsa(jd);
    ok(`${new Date(ms).toISOString().slice(0, 10)}: ${got.toFixed(6)}° ≈ ${ref}°`,
      () => assert.ok(Math.abs(got - ref) < 1e-4, `отклонение ${(got - ref).toFixed(6)}°`));
  }
}

console.log('=== сидерическая долгота = тропическая − аянамша ===');
{
  const jd = eph.toJD(new Date(Date.UTC(2026, 6, 28, 12)));
  for (const name of ['Солнце', 'Луна', 'Сатурн']) {
    const sid = eph.lon(jd, name), tr = trop.lon(jd, name), ay = eph.ayanamsa(jd);
    // Допуск 20″: swe_get_ayanamsa_ut отдаёт СРЕДНЮЮ аянамшу (без нутации), а
    // долготы считаются от истинной эклиптики — разница как раз в нутации (≤17″).
    ok(`${name}: ${dms(sid)} (троп. ${dms(tr)})`,
      () => assert.ok(arcsec(sid, tr - ay) < 20,
        `сдвиг ${arcsec(sid, tr - ay).toFixed(1)}″ не сводится к аянамше`));
  }
  ok('тропический движок аянамшу не применяет (ayanamsa = 0)',
    () => assert.equal(trop.ayanamsa(jd), 0));
}

console.log('=== карта эталон А (эталон — профессиональной джйотиш-программой) ===');
{
  const jd = eph.toJD(new Date(Date.UTC(1998, 2, 12, 16, 10)));   // 18:10 +2 → 16:10 UT
  // Значения с экране профессиональной программы (градус в знаке):
  const ref = {
    'Солнце': [28 + 3 / 60 + 2 / 3600, 'Водолей'],
    'Луна': [22 + 25 / 60 + 21 / 3600, 'Лев'],
    'Марс': [12 + 20 / 60 + 55 / 3600, 'Рыбы'],
    'Меркурий': [13 + 47 / 60 + 59 / 3600, 'Рыбы'],
    'Юпитер': [14 + 51 / 60 + 13 / 3600, 'Водолей'],
    'Венера': [12 + 34 / 60 + 46 / 3600, 'Козерог'],
    'Сатурн': [25 + 35 / 60 + 6 / 3600, 'Рыбы'],
    'Раху': [16 + 45 / 60 + 21 / 3600, 'Лев'],
    'Кету': [16 + 45 / 60 + 21 / 3600, 'Водолей'],
  };
  for (const [name, [deg, sign]] of Object.entries(ref)) {
    const got = eph.lon(jd, name);
    const si = Math.floor(got / 30) % 12;
    ok(`${name}: ${dms(got)} ≡ ${dms(Z.indexOf(sign) * 30 + deg)}`, () => {
      assert.equal(Z[si], sign, `знак разошёлся: ${Z[si]} вместо ${sign}`);
      const d = Math.abs((got % 30) - deg) * 3600;
      assert.ok(d < 5, `расхождение ${d.toFixed(1)}″ — больше 5″`);
    });
  }
  // Лагна: whole-sign дома от сидерического Асцендента.
  const h = eph.houses(jd, 54 + 13 / 60, 28 + 30 / 60, 'wholeSign');
  ok(`Асцендент ${h ? dms(h.asc) : '—'} ≡ 00°06′57″ Дева`, () => {
    assert.ok(h, 'swe_houses_ex недоступна в этой сборке WASM');
    assert.equal(Z[Math.floor(h.asc / 30) % 12], 'Дева');
    const d = Math.abs((h.asc % 30) - (6 / 60 + 57 / 3600)) * 3600;
    assert.ok(d < 5, `расхождение ${d.toFixed(1)}″`);
  });
  ok('whole-sign: каждый куспид — ровно 0° знака, дома идут подряд', () => {
    const a = Math.floor(h.asc / 30) % 12;
    h.cusps.forEach((c, i) => {
      assert.ok(Math.abs(c % 30) < 1e-6, `куспид ${i + 1} = ${c} — не начало знака`);
      assert.equal(Math.floor(c / 30) % 12, (a + i) % 12, `дом ${i + 1} не в своём знаке`);
    });
  });
}

console.log(`\n✅ ведический режим: ${n} проверок пройдено`);
