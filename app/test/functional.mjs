/**
 * Функциональная природа грахи по лагне (lib/functional.ts).
 *
 * Школа названа явно — классика Парашары. Главная страховка теста: ШЕСТЬ
 * канонических йогакарак. Их знает наизусть любой учебник, и если правило
 * собрано неверно, они не сойдутся:
 *   Телец и Весы — Шани; Рак и Лев — Мангала; Козерог и Водолей — Шукра.
 *
 * Запуск: node test/functional.mjs
 */
import assert from 'node:assert/strict';
import { functionalNature, functionalLine, FUNCTIONAL_LABEL,
  NATURAL_BENEFICS, NATURAL_MALEFICS } from '../src/lib/functional.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const Z = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева',
  'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];
const L = (sign) => Z.indexOf(sign);
const kind = (graha, sign) => functionalNature(graha, L(sign))?.kind;

console.log('=== шесть канонических йогакарак ===');
{
  const CANON = [
    ['Сатурн', 'Телец', [9, 10]],
    ['Сатурн', 'Весы', [4, 5]],
    ['Марс', 'Рак', [5, 10]],
    ['Марс', 'Лев', [4, 9]],
    ['Венера', 'Козерог', [5, 10]],
    ['Венера', 'Водолей', [4, 9]],
  ];
  for (const [graha, sign, rules] of CANON) {
    ok(`${sign} — йогакарака ${graha} (упр. ${rules.join(' и ')})`, () => {
      const f = functionalNature(graha, L(sign));
      assert.equal(f.kind, 'yogakaraka');
      assert.deepEqual(f.rules, rules);
    });
  }
  ok('и больше ни у кого йогакараки нет — по одной на эти шесть лагн', () => {
    const grahas = ['Солнце', 'Луна', 'Марс', 'Меркурий', 'Юпитер', 'Венера', 'Сатурн'];
    let total = 0;
    for (let lag = 0; lag < 12; lag++) {
      for (const g of grahas) if (functionalNature(g, lag).kind === 'yogakaraka') total++;
    }
    assert.equal(total, 6);
  });
}

console.log('=== добрые и трудные хозяева ===');
{
  ok('лагнеш — добрая граха (Овен: Мангала 1 и 8, своя лагна снимает порчу)', () => {
    const f = functionalNature('Марс', L('Овен'));
    assert.deepEqual(f.rules, [1, 8]);
    assert.equal(f.kind, 'benefic');
    assert.ok(f.reasons.some((r) => r.includes('лагнеш')));
    assert.ok(f.reasons.some((r) => r.includes('снимает эту порчу')));
  });
  ok('Весы: Шукра тоже лагнеш с 8-м домом — та же поблажка', () => {
    const f = functionalNature('Венера', L('Весы'));
    assert.deepEqual(f.rules, [1, 8]);
    assert.equal(f.kind, 'benefic');
  });
  ok('хозяин триконы — добрый (Овен: Гуру 9 и 12)', () => {
    const f = functionalNature('Юпитер', L('Овен'));
    assert.deepEqual(f.rules, [9, 12]);
    assert.equal(f.kind, 'benefic');
    assert.ok(f.reasons.some((r) => r.includes('тень на добрых обещаниях')));
  });
  ok('хозяин тришадаи — трудный (Овен: Будха 3 и 6)', () => {
    assert.equal(kind('Меркурий', 'Овен'), 'malefic');
  });
  ok('хозяин дустханы без лагны — трудный (Телец: Гуру 8 и 11)', () => {
    const f = functionalNature('Юпитер', L('Телец'));
    assert.deepEqual(f.rules, [8, 11]);
    assert.equal(f.kind, 'malefic');
  });
}

console.log('=== кендрадхипатья: счёт переворачивается ===');
{
  ok('Дева: Гуру держит только кендры (4 и 7) — доброта гасится', () => {
    const f = functionalNature('Юпитер', L('Дева'));
    assert.deepEqual(f.rules, [4, 7]);
    assert.equal(f.kind, 'neutral');
    assert.ok(f.reasons.some((r) => r.includes('кендрадхипатья')));
  });
  ok('Близнецы: у Гуру те же только кендры (7 и 10)', () => {
    assert.equal(kind('Юпитер', 'Близнецы'), 'neutral');
  });
  ok('Рыбы: Будха на кендрах (4 и 7) — благодетель гаснет', () => {
    assert.equal(kind('Меркурий', 'Рыбы'), 'neutral');
  });
  ok('вредитель на одних кендрах, наоборот, перестаёт вредить', () => {
    // Рак: Шани держит 7-й и 8-й — дустхана перевешивает, это не наш случай;
    // берём Стрельца, где Будха держит 7-й и 10-й
    const f = functionalNature('Меркурий', L('Стрелец'));
    assert.deepEqual(f.rules, [7, 10]);
    assert.equal(f.kind, 'neutral');   // Будха — природный благодетель
    const s = functionalNature('Солнце', L('Скорпион'));
    assert.deepEqual(s.rules, [10]);   // Сурья держит только кендру
    assert.equal(s.kind, 'benefic');   // природный вредитель — вред гасится
  });
}

console.log('=== мараки и узлы ===');
{
  ok('хозяин 2-го или 7-го помечается маракой', () => {
    const f = functionalNature('Венера', L('Овен'));   // 2 и 7 — двойная марака
    assert.deepEqual(f.rules, [2, 7]);
    assert.equal(f.maraka, true);
    assert.ok(f.reasons.some((r) => r.includes('марака')));
  });
  ok('марака не отменяет доброты: Шани Весов — йогакарака и не марака', () => {
    const f = functionalNature('Сатурн', L('Весы'));
    assert.equal(f.kind, 'yogakaraka');
    assert.equal(f.maraka, false);
  });
  ok('у Раху и Кету функциональной природы нет — своих знаков нет', () => {
    assert.equal(functionalNature('Раху', 0), null);
    assert.equal(functionalNature('Кету', 5), null);
  });
}

console.log('=== строка для промпта и подписей ===');
{
  ok('functionalLine собирает читаемую строку', () => {
    assert.equal(functionalLine('Сатурн', L('Телец')), 'Сатурн — йогакарака (управляет 9-й и 10-й домом)');
    assert.equal(functionalLine('Раху', 0), null);
  });
  ok('у каждого вердикта есть подпись и хотя бы одна причина', () => {
    for (let lag = 0; lag < 12; lag++) {
      for (const g of [...NATURAL_BENEFICS, ...NATURAL_MALEFICS]) {
        const f = functionalNature(g, lag);
        assert.ok(FUNCTIONAL_LABEL[f.kind], `${g}/${lag}`);
        assert.ok(f.reasons.length >= 1, `${g}/${lag}`);
      }
    }
  });
}

console.log(`\n✅ функциональная природа: ${n} проверок пройдено`);
