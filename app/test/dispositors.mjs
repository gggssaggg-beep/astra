/**
 * Тест цепочек диспозиторов (lib/dispositors.ts). БЕЗ WASM: чистая формула от
 * знаков позиций. Система управителей — авторская (SIGN_RULER).
 *
 * Запуск:  node test/dispositors.mjs
 */
import assert from 'node:assert/strict';
import { chartDispositors } from '../src/lib/dispositors.ts';
import { SIGN_RULER } from '../src/lib/dispositorLore.ts';
import { signOf } from '../src/engine/engine.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
// позиция по знаку: середина знака i (i*30+15)
const at = (name, sign) => { const i = ['Овен','Телец','Близнецы','Рак','Лев','Дева','Весы','Скорпион','Стрелец','Козерог','Водолей','Рыбы'].indexOf(sign); const lon = i*30+15; const s = signOf(lon); return { name, lon, sign: s.sign, signGlyph: s.glyph, degInSign: s.deg, glyph: '•', speed: 0, retro: false }; };

console.log('=== SIGN_RULER — авторская система (не классика) ===');
ok('Рак→Меркурий, Козерог→Уран (канон владелицы)', () => {
  assert.equal(SIGN_RULER['Рак'], 'Меркурий');
  assert.equal(SIGN_RULER['Козерог'], 'Уран');
});

console.log('=== царь цепочки: планета в своём знаке ===');
ok('Марс в Овне — царь (само-петля), к нему стекается Солнце из Овна', () => {
  const pos = [at('Марс', 'Овен'), at('Солнце', 'Овен')];
  const r = chartDispositors(pos);
  assert.deepEqual(r.kings, ['Марс']);
  const sun = r.chains.find((c) => c.planet === 'Солнце');
  assert.deepEqual(sun.path, ['Солнце', 'Марс']);   // Солнце → управитель Овна (Марс)
  assert.deepEqual(sun.cycle, ['Марс']);
  assert.equal(sun.king, 'Марс');
});

console.log('=== взаимная рецепция (соправители) ===');
ok('Марс в Тельце, Венера в Овне — цикл [Венера,Марс]', () => {
  // Марс(Телец)→управитель Тельца=Венера; Венера(Овен)→управитель Овна=Марс
  const pos = [at('Марс', 'Телец'), at('Венера', 'Овен')];
  const r = chartDispositors(pos);
  assert.equal(r.kings.length, 0);
  assert.equal(r.receptions.length, 1);
  assert.deepEqual([...r.receptions[0]].sort(), ['Венера', 'Марс']);
});

console.log('=== источники Солнце/Луна/узлы: диспозируются, но не управляют ===');
ok('никакой знак не управляется Солнцем/Луной/Раху/Кету', () => {
  for (const ruler of Object.values(SIGN_RULER)) {
    assert.ok(!['Солнце', 'Луна', 'Раху', 'Кету'].includes(ruler));
  }
});
ok('Луна впадает в цепочку, но в dispOf её никто не назначает управителем', () => {
  const pos = [at('Луна', 'Лев'), at('Венера', 'Телец')];  // Лев→Венера; Телец→Венера (царь)
  const r = chartDispositors(pos);
  assert.equal(r.dispOf['Луна'], 'Венера');
  assert.deepEqual(r.kings, ['Венера']);
  assert.ok(!Object.values(r.dispOf).includes('Луна'));
});

console.log('=== управитель выключен тумблером — цепочка обрывается на его имени ===');
ok('Солнце в Стрельце, Урана нет в наборе → path=[Солнце,Уран], cycle пуст', () => {
  const pos = [at('Солнце', 'Стрелец')];   // Стрелец→Уран, но Урана нет
  const r = chartDispositors(pos);
  const c = r.chains[0];
  assert.deepEqual(c.path, ['Солнце', 'Уран']);
  assert.deepEqual(c.cycle, []);
  assert.equal(c.king, null);
});

console.log(`\n=== ДИСПОЗИТОРЫ: все ${n} проверок зелёные ===`);
