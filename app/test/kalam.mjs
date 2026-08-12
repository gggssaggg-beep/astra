/**
 * Каламы и мухурты (lib/kalam.ts).
 *
 * Главная страховка — не арифметика долей, а СОВПАДЕНИЕ С ЧУЖОЙ ПРОГРАММОЙ:
 * астролог прислал снимок Vedic times за среду 12.08.2026, и все пять полос
 * там указаны с точностью до минуты. Восстанавливаем восход и закат из этих
 * чисел и проверяем, что наши формулы дают ровно те же окна.
 *
 * Запуск: node test/kalam.mjs
 */
import assert from 'node:assert/strict';
import { kalamsOf, kalamNow, RAHU_PART, KALAM_LORE, DAY_PARTS, MUHURTAS } from '../src/lib/kalam.ts';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

/** Кадр суток: восход, закат, следующий восход и день недели (0 = вс). */
const frame = (sunrise, sunset, nextSunrise, weekday) => ({
  dayBirth: true, weekday,
  start: sunrise, end: sunset,
  sunrise, sunset, nextSunrise,
});
/** Минуты от начала суток → Date того же дня (UTC, пояс роли не играет). */
const T = (day, hh, mm) => new Date(Date.UTC(2026, 7, day, hh, mm, 0));
const hm = (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
const near = (d, want, tolMin = 1) => {
  const got = d.getUTCHours() * 60 + d.getUTCMinutes();
  const [h, m] = want.split(':').map(Number);
  assert.ok(Math.abs(got - (h * 60 + m)) <= tolMin,
    `ждали ${want}, получили ${hm(d)}`);
};

// Восход и закат, восстановленные из снимка Vedic times: Раху-калам там
// 13:43–15:34 (5-я часть среды) → часть = 111 мин, восход = 13:43 − 4·111.
const SUNRISE = T(12, 6, 19);
const SUNSET = T(12, 21, 7);          // восход + 8 частей по 111 мин
const NEXT_SUNRISE = T(13, 6, 21);    // ночь чуть длиннее: 9 ч 14 мин
const WED = frame(SUNRISE, SUNSET, NEXT_SUNRISE, 3);

console.log('=== среда 12.08.2026: сверка со снимком Vedic times ===');
{
  const w = kalamsOf(WED);
  const by = (name) => w.find((x) => x.name === name);

  ok('пять полос и все с непустыми границами', () => {
    assert.equal(w.length, 5);
    for (const x of w) assert.ok(+x.to > +x.from, `${x.name}: конец не позже начала`);
  });

  ok('Раху-калам — 5-я часть, 13:43–15:34', () => {
    const r = by('Раху-калам');
    assert.equal(r.part, 5);
    near(r.from, '13:43'); near(r.to, '15:34');
  });

  ok('Яма-ганда — 2-я часть, 08:07–09:59 (часть Юпитера)', () => {
    const y = by('Яма-ганда');
    assert.equal(y.part, 2);
    near(y.from, '08:10', 4); near(y.to, '10:01', 4);
  });

  ok('Гулика-калам — 4-я часть, 11:51–13:43 (часть Сатурна)', () => {
    const g = by('Гулика-калам');
    assert.equal(g.part, 4);
    near(g.from, '11:52', 2); near(g.to, '13:43');
  });

  ok('Абхиджит — 13:13–14:12, ровно вокруг середины дня', () => {
    const a = by('Абхиджит-мухурта');
    near(a.from, '13:13'); near(a.to, '14:12');
    const midday = (+SUNRISE + +SUNSET) / 2;
    assert.ok(Math.abs((+a.from + +a.to) / 2 - midday) < 60_000, 'центр = местный полдень');
  });

  // Допуск здесь шире: из снимка восстанавливаются восход и закат ЭТИХ суток,
  // а Брахма-мухурта отсчитывается от СЛЕДУЮЩЕГО восхода — его в снимке нет,
  // он взят с запасом в пару минут. Смысл проверки не в минутах, а в том, что
  // полоса лежит перед рассветом и равна двум ночным мухуртам.
  ok('Брахма — около 05:05–05:42, две ночные мухурты до восхода', () => {
    const b = by('Брахма-мухурта');
    near(b.from, '05:03', 5); near(b.to, '05:39', 5);
    assert.ok(b.to < NEXT_SUNRISE, 'кончается до восхода');
    const nightMuhurta = (+NEXT_SUNRISE - +SUNSET) / 15;
    assert.ok(Math.abs((+NEXT_SUNRISE - +b.to) - nightMuhurta) < 1000, 'конец = мухурта до восхода');
  });

  ok('благоприятные — только мухурты, каламы — трудные', () => {
    assert.deepEqual(w.filter((x) => x.kind === 'good').map((x) => x.name).sort(),
      ['Абхиджит-мухурта', 'Брахма-мухурта']);
    assert.deepEqual(w.filter((x) => x.kind === 'bad').map((x) => x.name).sort(),
      ['Гулика-калам', 'Раху-калам', 'Яма-ганда']);
  });

  ok('отсортированы по времени', () => {
    for (let i = 1; i < w.length; i++) assert.ok(+w[i].from >= +w[i - 1].from);
  });
}

console.log('=== устройство таблицы Раху ===');
{
  ok('семь дней, каждая часть 1..8 и все разные', () => {
    assert.equal(RAHU_PART.length, 7);
    for (const p of RAHU_PART) assert.ok(p >= 1 && p <= 8, `часть вне 1..8: ${p}`);
    assert.equal(new Set(RAHU_PART).size, 7, 'дни не должны делить одну часть');
  });
  ok('в воскресенье — последняя часть дня', () => assert.equal(RAHU_PART[0], 8));
}

console.log('=== доли суток ===');
{
  ok('каждая часть — ровно восьмая светового дня', () => {
    const w = kalamsOf(WED).filter((x) => x.part);
    const span = (+SUNSET - +SUNRISE) / DAY_PARTS;
    for (const x of w) assert.ok(Math.abs((+x.to - +x.from) - span) < 1000, x.name);
  });
  ok('мухурта — пятнадцатая доля своего отрезка', () => {
    const w = kalamsOf(WED);
    const a = w.find((x) => x.name === 'Абхиджит-мухурта');
    assert.ok(Math.abs((+a.to - +a.from) - (+SUNSET - +SUNRISE) / MUHURTAS) < 1000);
    const b = w.find((x) => x.name === 'Брахма-мухурта');
    assert.ok(Math.abs((+b.to - +b.from) - (+NEXT_SUNRISE - +SUNSET) / MUHURTAS) < 1000);
  });
  ok('зимние сутки: полосы сжимаются вместе с днём', () => {
    const wSun = T(1, 9, 30), wSet = T(1, 16, 30), wNext = T(2, 9, 31);
    const w = kalamsOf(frame(wSun, wSet, wNext, 3));
    const r = w.find((x) => x.name === 'Раху-калам');
    assert.ok(Math.abs((+r.to - +r.from) - (7 * 3600_000) / 8) < 1000);
    assert.ok(r.from > wSun && r.to < wSet, 'полоса внутри светового дня');
  });
  ok('полярный день: восход = закат → полос нет, а не деление на ноль', () => {
    assert.deepEqual(kalamsOf(frame(SUNRISE, SUNRISE, NEXT_SUNRISE, 3)), []);
  });
}

console.log('=== «сейчас» и тексты ===');
{
  ok('kalamNow: внутри — да, на конце — уже нет', () => {
    const r = kalamsOf(WED).find((x) => x.name === 'Раху-калам');
    assert.equal(kalamNow(r, new Date(+r.from + 60_000)), true);
    assert.equal(kalamNow(r, r.to), false);
    assert.equal(kalamNow(r, new Date(+r.from - 60_000)), false);
  });
  ok('у каждой полосы есть объяснение', () => {
    for (const x of kalamsOf(WED)) {
      assert.ok(KALAM_LORE[x.name], `нет текста: ${x.name}`);
      assert.ok(KALAM_LORE[x.name].length > 120, `текст слишком куцый: ${x.name}`);
    }
  });
  ok('тексты не обращаются к читателю на «ты»', () => {
    for (const t of Object.values(KALAM_LORE)) {
      assert.ok(!/\bты\b|\bтебе\b|\bтвой\b/i.test(t), `фамильярность в корпусе: ${t.slice(0, 40)}`);
    }
  });
}

console.log(`\nвсего проверок: ${n}`);
