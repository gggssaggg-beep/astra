/**
 * Кута (гуна-милан) — джйотиш-совместимость. Чистая математика без WASM.
 *
 * Эталон А: Луна 22°25′ Льва → Пурвапхалгуни (11-я, индекс
 * 10). پартнёры B — синтетические, посчитаны вручную по классическим таблицам.
 *
 * Запуск: node test/kuta.mjs
 */
import assert from 'node:assert/strict';
import { kutaMatch, manglik, VARNA_NAME } from '../src/lib/kuta.ts';
import { buildVedicChart } from '../src/lib/vedic.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const score = (r, name) => r.scores.find((s) => s.name === name).got;

console.log('=== кута: A = Луна во Льве (Пурвапхалгуни, ид. 10), B = Луна в Тельце (Рохини, ид. 3) ===');
{
  const r = kutaMatch(10, 4, 3, 1);
  ok('варна: кшатрий (Лев) × вайшья (Телец) — жених ниже → 0', () =>
    assert.equal(score(r, 'Варна'), 0));
  ok('вашья: лев × четвероногое → 0 (v1)', () =>
    assert.equal(score(r, 'Вашья'), 0));
  ok('тара: A→B випат (21-я накшатра → тара 3), B→A митра (8) → 1.5', () =>
    assert.equal(score(r, 'Тара'), 1.5));
  ok('йони: крыса × змея — не пара и не вайра → 2 (v1)', () =>
    assert.equal(score(r, 'Йони'), 2));
  ok('майтри: Солнце × Венера — враги оба направления → 0', () =>
    assert.equal(score(r, 'Граха-майтри'), 0));
  ok('гана: манушья × манушья → 6', () =>
    assert.equal(score(r, 'Гана'), 6));
  ok('бхакута: Лев→Телец = 10/4 — не доша → 7', () =>
    assert.equal(score(r, 'Бхакута'), 7));
  ok('нади: мадхья × антья → 8', () =>
    assert.equal(score(r, 'Нади'), 8));
  ok('итог 24.5 из 36 — «приемлемо», дош нет', () => {
    assert.equal(r.total, 24.5);
    assert.equal(r.verdict, 'приемлемо');
    assert.equal(r.doshas.length, 0);
  });
}

console.log('=== доши ===');
{
  // обе Луны в ади-нади: Ашвини (0) и Ардра (5)
  const r = kutaMatch(0, 0, 5, 2);
  ok('нади-доша: Ашвини и Ардра — обе ади → 0 очков и доша в списке', () => {
    assert.equal(score(r, 'Нади'), 0);
    assert.ok(r.doshas.some((d) => d.includes('нади')));
  });
  // бхакута 6/8: Луны в Овне и Деве (расстояние 6)
  const r2 = kutaMatch(0, 0, 13, 5);
  ok('бхакута-доша 6/8: Овен × Дева → 0 очков', () => {
    assert.equal(score(r2, 'Бхакута'), 0);
    assert.ok(r2.doshas.some((d) => d.includes('бхакута')));
  });
  // заклятая йони: Пунарвасу (кошка, 6) × Магха (крыса, 9)
  const r3 = kutaMatch(6, 2, 9, 4);
  ok('йони-вайра: кошка × крыса → 0', () => assert.equal(score(r3, 'Йони'), 0));
}

console.log('=== направленность и максимумы ===');
{
  // варна направленная: невеста вайшья × жених кшатрий = 1, наоборот = 0
  const ab = kutaMatch(3, 1, 10, 4);   // A Телец (вайшья), B Лев (кшатрий)
  const ba = kutaMatch(10, 4, 3, 1);
  ok('варна направленная: вайшья→кшатрий 1, кшатрий→вайшья 0', () => {
    assert.equal(score(ab, 'Варна'), 1);
    assert.equal(score(ba, 'Варна'), 0);
  });
  // идеальный случай: одинаковая накшатра БЕЗ нади-доши невозможна — та же
  // накшатра всегда даёт ту же нади: правило «same nakshatra» отдельное в
  // классике; проверяем, что сумма максимумов = 36
  ok('сумма максимумов всех кут = 36', () => {
    assert.equal(ab.scores.reduce((s, k) => s + k.max, 0), 36);
  });
  ok('имена варн: индексы согласованы', () =>
    assert.deepEqual(VARNA_NAME, ['шудра', 'вайшья', 'кшатрий', 'брахман']));
}

console.log('=== раджу, махендра, стри-диргха ===');
{
  const { extraChecks, rajjuOf } = await import('../src/lib/kuta.ts');
  ok('все 27 накшатр разложены по пяти раджу, пропусков нет', () => {
    for (let i = 0; i < 27; i++) assert.ok(rajjuOf(i), `накшатра ${i} без раджу`);
  });
  ok('раджу «голова» — три накшатры, прочие по шесть', () => {
    const cnt = {};
    for (let i = 0; i < 27; i++) cnt[rajjuOf(i)] = (cnt[rajjuOf(i)] ?? 0) + 1;
    assert.equal(cnt['голова'], 3);
    assert.equal(cnt['стопы'], 6);
    assert.equal(Object.values(cnt).reduce((a, b) => a + b, 0), 27);
  });
  ok('одна раджу у обоих — помечено как неблагоприятное', () => {
    const e = extraChecks(0, 8);            // Ашвини и Ашлеша — обе «стопы»
    assert.equal(e.rajju.same, true);
    assert.equal(e.rajju.name, 'стопы');
  });
  ok('разные раджу — благоприятно', () =>
    assert.equal(extraChecks(0, 4).rajju.same, false));   // стопы × голова
  ok('махендра: счёт 4, 7, 10… от невесты к жениху', () => {
    assert.equal(extraChecks(0, 3).mahendra.ok, true);    // счёт 4
    assert.equal(extraChecks(0, 4).mahendra.ok, false);   // счёт 5
    assert.equal(extraChecks(0, 3).mahendra.count, 4);
  });
  ok('стри-диргха: счёт больше девяти', () => {
    assert.equal(extraChecks(0, 8).streeDirgha.ok, false);   // 9
    assert.equal(extraChecks(0, 9).streeDirgha.ok, true);    // 10
  });
  ok('счёт направленный: от A к B и от B к A разный', () =>
    assert.notEqual(extraChecks(0, 9).streeDirgha.count, extraChecks(9, 0).streeDirgha.count));
}

console.log('=== манглик (эталон А) ===');
{
  const Z = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева',
    'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];
  const at = (sign, d) => Z.indexOf(sign) * 30 + d;
  const CHART = {
    'Солнце': at('Водолей', 28.05), 'Луна': at('Лев', 22.42),
    'Марс': at('Рыбы', 12.35), 'Меркурий': at('Рыбы', 13.8),
    'Юпитер': at('Водолей', 14.85), 'Венера': at('Козерог', 12.58),
    'Сатурн': at('Рыбы', 25.58), 'Раху': at('Лев', 16.76), 'Кету': at('Водолей', 16.76),
  };
  const c = buildVedicChart(CHART, {}, at('Дева', 0.12));
  const m = manglik(c.planets, c.lagnaSign, c.moonSign);
  ok('от лагны (Дева): Марс в 7-м — манглик', () => assert.equal(m.fromLagna, true));
  ok('от Луны (Лев): Марс в 8-м — манглик', () => assert.equal(m.fromMoon, true));
  ok('итоговый флаг установлен', () => assert.equal(m.any, true));
}

console.log(`\n✅ кута: ${n} проверок пройдено`);
