/**
 * Кривая благоприятности суток (lib/auspicious.ts).
 *
 * Смысл шкалы задаёт астролог, а тест держит механику: кривая не выходит за
 * 0..100, полосы суток действительно опускают и поднимают её, личные слои
 * включаются только при известной Луне рождения, и каждое слагаемое честно
 * названо в `reasons` — иначе спорить с графиком будет не о чем.
 *
 * Запуск: node test/auspicious.mjs
 */
import assert from 'node:assert/strict';
import { auspiciousCurve, pointAt, WEIGHTS, BASE } from '../src/lib/auspicious.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };
const T = (h, m = 0) => new Date(Date.UTC(2026, 7, 12, h, m, 0));

const win = (name, from, to, kind) => ({ name, from, to, kind });
const WINDOWS = [
  win('Раху-калам', T(13, 43), T(15, 34), 'bad'),
  win('Абхиджит-мухурта', T(13, 13), T(14, 12), 'good'),
];
/** Небо-заглушка: долготы не двигаются — так виден вклад ТОЛЬКО полос. */
const still = () => ({ sunLon: 140, moonLon: 140 });

console.log('=== границы и форма ===');
{
  const c = auspiciousCurve({ windows: WINDOWS, sample: still, from: T(0), to: T(23), stepMin: 20 });
  ok('точек столько, сколько шагов', () => {
    assert.ok(c.length > 60 && c.length < 80, `точек: ${c.length}`);
  });
  ok('значения не выходят за 0..100', () => {
    for (const p of c) assert.ok(p.score >= 0 && p.score <= 100, `вне шкалы: ${p.score}`);
  });
  ok('точки идут по времени вперёд', () => {
    for (let i = 1; i < c.length; i++) assert.ok(+c[i].at > +c[i - 1].at);
  });
}

console.log('=== вклад полос суток ===');
{
  const c = auspiciousCurve({ windows: WINDOWS, sample: null, from: T(0), to: T(23), stepMin: 10 });
  const at = (h, m) => c.find((p) => +p.at >= +T(h, m)) ?? c[c.length - 1];

  ok('вне полос — ровно базовый уровень', () => {
    assert.equal(at(3, 0).score, BASE);
    assert.deepEqual(at(3, 0).reasons, []);
  });
  ok('в Раху-каламе кривая падает и называет причину', () => {
    const p = at(14, 30);
    assert.ok(p.score < BASE, `не упала: ${p.score}`);
    assert.ok(p.reasons.some((r) => r.startsWith('Раху-калам')), p.reasons.join('; '));
  });
  ok('в Абхиджите поднимается', () => {
    const p = at(13, 20);
    assert.ok(p.score > BASE, `не поднялась: ${p.score}`);
    assert.ok(p.reasons.some((r) => r.startsWith('Абхиджит')));
  });
  ok('на нахлёсте Абхиджита и Раху складываются оба вклада', () => {
    const p = at(13, 50);
    assert.equal(p.reasons.length, 2, p.reasons.join('; '));
    assert.equal(p.score, BASE + WEIGHTS.kalamBad + WEIGHTS.abhijit);
  });
}

console.log('=== личные слои ===');
{
  const base = { windows: [], sample: still, from: T(6), to: T(7), stepMin: 30 };
  ok('без Луны рождения личных слагаемых нет', () => {
    for (const p of auspiciousCurve(base)) {
      assert.ok(!p.reasons.some((r) => r.startsWith('тара') || r.includes('от своей')),
        p.reasons.join('; '));
    }
  });
  ok('с Луной рождения появляются тара и чандра-гочара', () => {
    const c = auspiciousCurve({ ...base, natalMoonLon: 100 });
    const r = c[0].reasons.join('; ');
    assert.ok(/тара /.test(r), r);
    assert.ok(/от своей/.test(r), r);
  });
  ok('своя же накшатра и свой знак — тара Джанма, Луна в 1-м', () => {
    const c = auspiciousCurve({ ...base, natalMoonLon: 140, sample: () => ({ sunLon: 0, moonLon: 140 }) });
    const r = c[0].reasons.join('; ');
    assert.ok(r.includes('Джанма'), r);
    assert.ok(r.includes('Луна в 1-м от своей'), r);
  });
  ok('без неба (sample=null) кривая всё равно строится', () => {
    const c = auspiciousCurve({ ...base, sample: () => null, natalMoonLon: 100 });
    assert.ok(c.length > 0 && c.every((p) => p.score === BASE));
  });
}

console.log('=== поиск точки «сейчас» ===');
{
  const c = auspiciousCurve({ windows: WINDOWS, sample: still, from: T(0), to: T(23), stepMin: 20 });
  ok('находит ближайшую точку', () => {
    const p = pointAt(c, T(14, 3));
    assert.ok(Math.abs(+p.at - +T(14, 3)) <= 10 * 60_000);
  });
  ok('пустая кривая — null, а не падение', () => assert.equal(pointAt([], T(0)), null));
}

console.log('=== веса вынесены наружу ===');
{
  ok('все веса — числа, каламы тянут вниз, мухурты вверх', () => {
    for (const [k, v] of Object.entries(WEIGHTS)) assert.equal(typeof v, 'number', k);
    assert.ok(WEIGHTS.kalamBad < 0);
    assert.ok(WEIGHTS.abhijit > 0 && WEIGHTS.brahma > 0);
  });
}

console.log(`\nвсего проверок: ${n}`);
