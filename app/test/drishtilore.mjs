/**
 * Трактовки дришти (lib/drishtiLore.ts).
 *
 * Тексты собираются из слоёв, а не лежат готовыми, поэтому проверять надо не
 * наличие ста восьми абзацев, а то, что сборка НИКОГДА не отдаёт огрызок: у
 * любой грахи в любом доме должна получиться связная строка, с домом, с
 * отношением и без «undefined».
 *
 * Запуск: node test/drishtilore.mjs
 */
import assert from 'node:assert/strict';
import { GAZE, SPECIAL, drishtiText, gocharaDrishtiText, distanceOf, rulesHouses,
  relationBetween } from '../src/lib/drishtiLore.ts';
import { DRISHTI } from '../src/lib/drishti.ts';
import { BHAVA_THEME } from '../src/lib/vedic.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const GRAHAS = ['Солнце', 'Луна', 'Марс', 'Меркурий', 'Юпитер', 'Венера', 'Сатурн', 'Раху', 'Кету'];

console.log('=== манера взгляда есть у каждой грахи ===');
{
  ok('девять грах, ни одной без текста', () => {
    for (const g of GRAHAS) assert.ok(GAZE[g], `нет манеры взгляда: ${g}`);
    assert.equal(Object.keys(GAZE).length, 9);
  });
  ok('особые дришти описаны ровно у Марса, Юпитера и Сатурна', () => {
    assert.deepEqual(Object.keys(SPECIAL).sort(), ['Марс', 'Сатурн', 'Юпитер']);
  });
  ok('описаны те же особые расстояния, что в таблице дришти', () => {
    for (const [g, m] of Object.entries(SPECIAL)) {
      for (const d of Object.keys(m).map(Number)) {
        assert.ok(DRISHTI[g].includes(d), `${g}: ${d}-го взгляда нет в таблице`);
      }
    }
  });
}

console.log('=== сборка в кундали: полное покрытие ===');
{
  ok('любая граха в любом доме даёт связный текст', () => {
    for (const g of GRAHAS) {
      for (let h = 1; h <= 12; h++) {
        const t = drishtiText(g, h, 7);
        assert.ok(t.length > 150, `куцо: ${g} → ${h}`);
        assert.ok(!/undefined|NaN/.test(t), `дыра в сборке: ${g} → ${h}: ${t}`);
        assert.ok(t.includes(`${h}-й дом`), `не назван дом: ${g} → ${h}`);
        assert.ok(t.includes(BHAVA_THEME[h]), `не названа тема дома: ${g} → ${h}`);
      }
    }
  });
  ok('особый взгляд добавляет свою строку, обычный — нет', () => {
    const special = drishtiText('Юпитер', 5, 9);
    const plain = drishtiText('Юпитер', 5, 7);
    assert.ok(special.includes(SPECIAL['Юпитер'][9]));
    assert.ok(!plain.includes(SPECIAL['Юпитер'][9]));
  });
  ok('граха под взглядом названа, с отношением', () => {
    // Сатурн в Овне (0) смотрит на Солнце в Весах (6): натурально враги
    const t = drishtiText('Сатурн', 7, 7, ['Солнце'], { 'Сатурн': 0, 'Солнце': 6 });
    assert.ok(t.includes('Солнце'), 'не названа граха под взглядом');
    assert.ok(/враг|нейтрально|друг/.test(t), 'не названо отношение');
  });
  ok('сам себя грахa под взглядом не считает', () => {
    const t = drishtiText('Марс', 4, 4, ['Марс'], { 'Марс': 0 });
    assert.ok(!t.includes('Под взглядом стоит Марс'));
  });
  ok('узлы: отношения не считаются, но текст всё равно связный', () => {
    const t = drishtiText('Раху', 3, 7, ['Кету'], { 'Раху': 0, 'Кету': 6 });
    assert.ok(t.includes('Кету'));
    assert.ok(!/undefined/.test(t));
  });
}

console.log('=== сборка в гочаре: четыре слоя астролога ===');
{
  // лагна Овен (0): Солнце управляет Львом → 5-й дом
  ok('называет дом, отношение, управление и период', () => {
    const t = gocharaDrishtiText('Сатурн', 'Солнце', 5, 11, 4, 0, ['Сатурн']);
    assert.ok(t.includes('5-й доме'), 'нет дома цели');
    assert.ok(/друг|враг|нейтрал/.test(t), 'нет отношения');
    assert.ok(t.includes('управляет'), 'нет домов управления');
    assert.ok(t.includes('период'), 'нет строки про период');
    assert.ok(!/undefined|NaN/.test(t));
  });
  ok('без идущего периода честно говорит «фоном»', () => {
    const t = gocharaDrishtiText('Венера', 'Луна', 4, 0, 3, 0, ['Марс']);
    assert.ok(t.includes('фоном'));
  });
  ok('период обеих грах отмечается отдельно', () => {
    const t = gocharaDrishtiText('Марс', 'Юпитер', 9, 0, 8, 0, ['Марс', 'Юпитер']);
    assert.ok(t.includes('обеих'));
  });
  ok('любая пара грах собирается без дыр', () => {
    for (const a of GRAHAS) for (const b of GRAHAS) {
      const t = gocharaDrishtiText(a, b, 7, 0, 6, 0, []);
      assert.ok(t.length > 150 && !/undefined|NaN/.test(t), `${a} → ${b}: ${t}`);
    }
  });
}

console.log('=== опоры сборки ===');
{
  ok('расстояние считается включительно: свой знак = 1', () => {
    assert.equal(distanceOf(0, 0), 1);
    assert.equal(distanceOf(0, 6), 7);
    assert.equal(distanceOf(11, 0), 2);
  });
  ok('управление домами: от лагны, оба знака Марса', () => {
    assert.deepEqual(rulesHouses('Марс', 0), [1, 8]);   // Овен и Скорпион от Овна
    assert.deepEqual(rulesHouses('Солнце', 0), [5]);
  });
  ok('узлы отношений не имеют — null, а не выдумка', () => {
    assert.equal(relationBetween('Раху', 'Солнце', 0, 6), null);
  });
}

console.log('=== правила корпуса ===');
{
  const all = [...Object.values(GAZE), ...Object.values(SPECIAL).flatMap((m) => Object.values(m))];
  ok('без обращения к читателю', () => {
    for (const t of all) assert.ok(!/\b(ты|тебе|твой)\b/i.test(t), t.slice(0, 40));
  });
  ok('без западных слов', () => {
    for (const t of all) assert.ok(!/\b(аспект|орбис|натал|асцендент)\w*/i.test(t), t.slice(0, 40));
  });
}

console.log(`\nвсего проверок: ${n}`);
