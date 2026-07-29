/**
 * Полнота и тон транзитного корпуса гочары:
 *   • затравки плашек    — `lib/gocharaTeaser.ts`   (9 грах × 12 раши);
 *   • тексты по знаку     — `lib/gocharaSignLore.ts` (9 × 12);
 *   • тексты по дому      — `lib/gocharaLore.ts`     (9 грах × 12 бхав).
 *
 * Каталог легко «недокомплектовать» при добавлении партиями — счётчик держит
 * полноту. Заодно проверяем правило корпуса: третье лицо, без команд читателю
 * («смотри», «сделай», «не бойся») — «ты» остаётся только интерфейсу.
 *
 * Запуск:  node test/gocharatexts.mjs
 */
import assert from 'node:assert/strict';
import { gocharaTeaser } from '../src/lib/gocharaTeaser.ts';
import { gocharaSignText } from '../src/lib/gocharaSignLore.ts';
import { gocharaText } from '../src/lib/gocharaLore.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

const GRAHAS = ['Солнце', 'Луна', 'Марс', 'Меркурий', 'Юпитер', 'Венера', 'Сатурн', 'Раху', 'Кету'];
const SIGNS = ['Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева',
  'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'];

console.log('Корпус гочары (транзит грахи)');

ok('затравок 108 — на каждую пару граха × раши', () => {
  const miss = [];
  for (const g of GRAHAS) for (const s of SIGNS) if (!gocharaTeaser(g, s)) miss.push(`${g}|${s}`);
  assert.equal(miss.length, 0, `нет затравки: ${miss.slice(0, 5).join(', ')}`);
});

ok('текстов по знаку 108', () => {
  const miss = [];
  for (const g of GRAHAS) for (const s of SIGNS) if (!gocharaSignText(g, s)) miss.push(`${g}|${s}`);
  assert.equal(miss.length, 0, `нет текста: ${miss.slice(0, 5).join(', ')}`);
});

ok('текстов по дому 108', () => {
  const miss = [];
  for (const g of GRAHAS) for (let h = 1; h <= 12; h++) if (!gocharaText(g, h)) miss.push(`${g}|${h}`);
  assert.equal(miss.length, 0, `нет текста: ${miss.slice(0, 5).join(', ')}`);
});

ok('затравка короткая, текст по знаку — развёрнутый', () => {
  for (const g of GRAHAS) for (const s of SIGNS) {
    const t = gocharaTeaser(g, s), full = gocharaSignText(g, s);
    assert.ok(t.length <= 60, `длинная затравка ${g}|${s}: ${t.length}`);
    assert.ok(full.length >= 120, `короткий текст ${g}|${s}: ${full.length}`);
  }
});

ok('корпус в третьем лице: без обращений и команд читателю', () => {
  // «ты» только у интерфейса; в корпусе — описание, а не указания
  const BAD = /\b(ты|тебе|тебя|твой|твоя|твои|твоего|смотри|сделай|попробуй|не бойся|запомни|используй)\b/i;
  const hits = [];
  for (const g of GRAHAS) for (const s of SIGNS) {
    for (const [kind, text] of [['знак', gocharaSignText(g, s)], ['затравка', gocharaTeaser(g, s)]]) {
      if (BAD.test(text)) hits.push(`${g}|${s} (${kind})`);
    }
  }
  assert.equal(hits.length, 0, `панибратство: ${hits.slice(0, 5).join(', ')}`);
});

ok('каждый знак упомянут ровно у девяти грах (нет копипасты пар)', () => {
  const seen = new Set();
  for (const g of GRAHAS) for (const s of SIGNS) {
    const t = gocharaSignText(g, s);
    assert.ok(!seen.has(t), `текст ${g}|${s} повторяет другой`);
    seen.add(t);
  }
  assert.equal(seen.size, 108);
});

console.log(`\n${n} проверок пройдено ✓`);
