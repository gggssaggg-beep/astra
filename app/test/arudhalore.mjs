/**
 * Трактовки арудх (lib/arudhaLore.ts) — полнота каталогов и правила корпуса.
 *
 * Проверяем не смысл (его сверяет астролог), а то, что ни одна строка таблицы
 * не окажется без текста и что тексты написаны по правилам проекта: третье
 * лицо, без обращения к читателю.
 *
 * Запуск: node test/arudhalore.mjs
 */
import assert from 'node:assert/strict';
import { PADA_ROLE, AL_SIGN, AL_HOUSE, UL_SIGN, padaText } from '../src/lib/arudhaLore.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const all = [...Object.values(PADA_ROLE), ...Object.values(AL_SIGN),
  ...Object.values(AL_HOUSE), ...Object.values(UL_SIGN)];

console.log('=== полнота каталогов ===');
{
  ok('двенадцать пад: A1…A12, без пропусков', () => {
    for (let i = 1; i <= 12; i++) assert.ok(PADA_ROLE[`A${i}`], `нет текста пады A${i}`);
    assert.equal(Object.keys(PADA_ROLE).length, 12);
  });
  ok('арудха лагна — все двенадцать знаков', () => {
    for (let s = 0; s < 12; s++) assert.ok(AL_SIGN[s], `нет АЛ для знака ${s}`);
    assert.equal(Object.keys(AL_SIGN).length, 12);
  });
  ok('арудха лагна — все двенадцать домов', () => {
    for (let h = 1; h <= 12; h++) assert.ok(AL_HOUSE[h], `нет АЛ для дома ${h}`);
    assert.equal(Object.keys(AL_HOUSE).length, 12);
  });
  ok('упапада — все двенадцать знаков', () => {
    for (let s = 0; s < 12; s++) assert.ok(UL_SIGN[s], `нет УЛ для знака ${s}`);
    assert.equal(Object.keys(UL_SIGN).length, 12);
  });
}

console.log('=== сборка текста строки ===');
{
  ok('А1 собирает роль + знак + дом — три слоя', () => {
    const t = padaText('A1', 4, 10);
    assert.ok(t.includes('Арудха лагна'), 'нет роли пады');
    assert.ok(t.includes(AL_SIGN[4]), 'нет знака');
    assert.ok(t.includes(AL_HOUSE[10]), 'нет дома');
  });
  ok('А12 добавляет знак упапады, но не дом', () => {
    const t = padaText('A12', 7, 3);
    assert.ok(t.includes(UL_SIGN[7]), 'нет знака упапады');
    assert.ok(!t.includes(AL_HOUSE[3]), 'дом читается только у арудха-лагны');
  });
  ok('прочие пады — только своя роль', () => {
    assert.equal(padaText('A5', 2, 6), PADA_ROLE.A5);
  });
  ok('пада без знака (управителя нет) не роняет сборку', () => {
    const t = padaText('A1', null, null);
    assert.equal(t, PADA_ROLE.A1);
  });
  ok('неизвестный код — пустая строка, а не «undefined»', () => {
    assert.equal(padaText('A13', 0, 1), '');
  });
}

console.log('=== правила корпуса ===');
{
  ok('нет обращения к читателю на «ты»', () => {
    for (const t of all) {
      assert.ok(!/\b(ты|тебе|тебя|твой|твоя|твоё|твои)\b/i.test(t),
        `фамильярность: ${t.slice(0, 50)}…`);
    }
  });
  ok('нет повелительного наклонения-совета', () => {
    for (const t of all) {
      assert.ok(!/\b(запомни|учти|обрати внимание|подумай|сделай)\b/i.test(t),
        `команда читателю: ${t.slice(0, 50)}…`);
    }
  });
  ok('нет западных слов в ведическом корпусе', () => {
    for (const t of all) {
      assert.ok(!/\b(аспект|орбис|натал|транзит|асцендент)\w*/i.test(t),
        `западное слово: ${t.slice(0, 50)}…`);
    }
  });
  ok('тексты не куцые (каждый длиннее ста знаков)', () => {
    for (const t of all) assert.ok(t.length > 100, `слишком коротко: ${t}`);
  });
}

console.log(`\nвсего проверок: ${n}`);
