/**
 * Граха-юддха (lib/yuddha.ts) — планетная война.
 *
 * Правила взяты со страницы, присланной астрологом 13.08.2026 (jyotish.study).
 * Его же оговорка: «мнения астрологов о том, кто побеждает, неоднозначные…
 * если будут сложности, пусть будет просто обозначен факт войны». Поэтому
 * главная проверка здесь — не «кто победил», а что вердикт выносится ТОЛЬКО
 * при согласии всех признаков, а при разногласии честно отдаётся null.
 *
 * Запуск: node test/yuddha.mjs
 */
import assert from 'node:assert/strict';
import { grahaYuddha, NAISARGIKA_BALA, TARA_GRAHAS, YUDDHA_ORB, AMSHU_ORB,
  YUDDHA_HURT, YUDDHA_KIND_LORE } from '../src/lib/yuddha.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const P = (name, lon, lat = 0, retro = false) => ({ name, lon, lat, retro });

console.log('=== кто вообще воюет ===');
{
  ok('воюют пять тара-грах, и только они', () => {
    assert.deepEqual([...TARA_GRAHAS], ['Марс', 'Меркурий', 'Юпитер', 'Венера', 'Сатурн']);
  });
  ok('Сурья, Чандра и узлы в войну не вступают', () => {
    // все четверо стоят в одном градусе — войн быть не должно ни одной
    const w = grahaYuddha([P('Солнце', 10.1), P('Луна', 10.2), P('Раху', 10.3), P('Кету', 190.3)]);
    assert.equal(w.length, 0);
  });
  ok('Сурья рядом с Шукрой — не война (это сожжение, другое явление)', () => {
    assert.equal(grahaYuddha([P('Солнце', 10.1), P('Венера', 10.4)]).length, 0);
  });
}

console.log('=== когда война считается ===');
{
  ok('сближение больше градуса войной не считается', () => {
    assert.equal(grahaYuddha([P('Венера', 10), P('Сатурн', 11.5)]).length, 0);
  });
  ok('ровно градус — ещё война (граница включительно)', () => {
    assert.equal(grahaYuddha([P('Венера', 10), P('Сатурн', 10 + YUDDHA_ORB)]).length, 1);
  });
  ok('через границу знаков войны нет, даже если рядом', () => {
    // 29°48′ Овна и 0°24′ Тельца — расстояние 0,6°, но знаки разные
    assert.equal(grahaYuddha([P('Венера', 29.8), P('Сатурн', 30.4)]).length, 0);
  });
  ok('вид войны: до получаса дуги — амшувимарда, дальше — уллекха', () => {
    assert.equal(grahaYuddha([P('Венера', 10), P('Сатурн', 10.3)])[0].kind, 'amshuvimarda');
    assert.equal(grahaYuddha([P('Венера', 10), P('Сатурн', 10 + AMSHU_ORB)])[0].kind, 'amshuvimarda');
    assert.equal(grahaYuddha([P('Венера', 10), P('Сатурн', 10.8)])[0].kind, 'ullekha');
  });
  ok('три грахи в одном градусе дают три войны, самая тесная — первой', () => {
    const w = grahaYuddha([P('Венера', 10.0), P('Сатурн', 10.9), P('Марс', 10.8)]);
    assert.equal(w.length, 3);
    assert.ok(w[0].gap <= w[1].gap && w[1].gap <= w[2].gap);
  });
}

console.log('=== признаки победителя ===');
{
  ok('таблица найсаргика-балы — со страницы астролога, в вирупах', () => {
    assert.deepEqual(NAISARGIKA_BALA,
      { 'Венера': 43, 'Юпитер': 34, 'Меркурий': 26, 'Марс': 17, 'Сатурн': 9 });
  });
  ok('все три признака сошлись — победитель назван', () => {
    // Шукра ярче, севернее и на меньшем градусе
    const [w] = grahaYuddha([P('Венера', 10.2, 1.0), P('Сатурн', 10.6, 0.5)]);
    assert.equal(w.byBala, 'Венера');
    assert.equal(w.byLatitude, 'Венера');
    assert.equal(w.byDegree, 'Венера');
    assert.equal(w.winner, 'Венера');
    assert.equal(w.loser, 'Сатурн');
  });
  ok('признаки разошлись — вердикта НЕТ (null), но все три видны', () => {
    // Шукра ярче, зато Шани севернее и позади по градусу
    const [w] = grahaYuddha([P('Сатурн', 10.2, 2.0), P('Венера', 10.6, 1.0)]);
    assert.equal(w.byBala, 'Венера');
    assert.equal(w.byLatitude, 'Сатурн');
    assert.equal(w.byDegree, 'Сатурн');
    assert.equal(w.winner, null);
    assert.equal(w.loser, null);
  });
  ok('без широт признак молчит, вердикт выносится по двум оставшимся', () => {
    const [w] = grahaYuddha([{ name: 'Венера', lon: 10.2, retro: false },
      { name: 'Сатурн', lon: 10.6, retro: false }]);
    assert.equal(w.byLatitude, null);
    assert.equal(w.winner, 'Венера');
  });
  ok('равные широты — признак тоже молчит', () => {
    const [w] = grahaYuddha([P('Венера', 10.2, 1.0), P('Сатурн', 10.6, 1.0)]);
    assert.equal(w.byLatitude, null);
  });
}

console.log('=== апасавья (есть попятная) ===');
{
  ok('попятная граха включает апасавью', () => {
    const [w] = grahaYuddha([P('Венера', 10.2, 1.0), P('Сатурн', 10.6, 0.5, true)]);
    assert.equal(w.apasavya, true);
  });
  ok('в апасавье побеждает СЛАБЕЙШАЯ и ЮЖНАЯ — счёт переворачивается', () => {
    // Шани тусклее и южнее Шукры, зато идёт позади по градусу и попятно
    const [w] = grahaYuddha([P('Сатурн', 10.2, 0.5, true), P('Венера', 10.6, 1.0)]);
    assert.equal(w.byBala, 'Сатурн');       // слабейшая
    assert.equal(w.byLatitude, 'Сатурн');   // южная
    assert.equal(w.byDegree, 'Сатурн');     // меньший градус
    assert.equal(w.winner, 'Сатурн');
  });
  ok('прямое движение считается обычным порядком', () => {
    const [w] = grahaYuddha([P('Сатурн', 10.2, 0.5), P('Венера', 10.6, 1.0)]);
    assert.equal(w.apasavya, false);
    assert.equal(w.byBala, 'Венера');
    assert.equal(w.byLatitude, 'Венера');
  });
}

console.log('=== состав карточки и тексты ===');
{
  ok('первой в паре идёт граха с меньшим градусом', () => {
    const [w] = grahaYuddha([P('Сатурн', 10.9), P('Венера', 10.1)]);
    assert.equal(w.a.name, 'Венера');
    assert.equal(w.b.name, 'Сатурн');
  });
  ok('знак войны и расстояние отданы наружу', () => {
    const [w] = grahaYuddha([P('Венера', 40.2), P('Сатурн', 40.6)]);
    assert.equal(w.sign, 'Телец');
    assert.equal(w.signIndex, 1);
    assert.ok(Math.abs(w.gap - 0.4) < 1e-9);
  });
  ok('у каждой воюющей грахи есть текст «что повреждается»', () => {
    for (const g of TARA_GRAHAS) assert.ok(YUDDHA_HURT[g]?.length > 20, g);
  });
  ok('у каждого вида войны есть объяснение', () => {
    for (const k of ['amshuvimarda', 'ullekha']) assert.ok(YUDDHA_KIND_LORE[k]?.length > 40, k);
  });
}

console.log(`\n✅ граха-юддха: ${n} проверок пройдено`);
