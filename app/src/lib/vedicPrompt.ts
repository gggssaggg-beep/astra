/**
 * Ведический «Промпт для ИИ» — по мастер-промпту астролога (владелица принесла
 * образец 2026-07-29; полный текст — docs/JYOTISH_MASTER_PROMPT.md).
 *
 * Философия прежняя (память: ai prompt = data, not requests): приложение САМО
 * заполняет раздел «КАРТА» точными расчётами — лагна, позиции с накшатрами и
 * состояниями, лорды домов, караки, даши, транзиты с Саде Сати, — а ИИ остаётся
 * толкование. Каркас разбора (разделы II–XIII мастер-промпта) даём сжато:
 * полный шаблон у астролога и так есть, промпт не должен весить 40 КБ.
 */
import type { BodyPosition } from '../engine/index.ts';
import { ZODIAC, AYANAMSAS } from '../engine/index.ts';
import type { Person } from './models.ts';
import type { VedicNatal } from './vedicChart.ts';
import { degMin, SHORT } from './vedicChart.ts';
import { GRAHA_NAMES } from './vedicLore.ts';
import {
  sadeSati, signIndexOf, RELATION_LABEL, CHARA_KARAKAS, VEDIC_ORDER_SET,
} from './vedic.ts';
import type { AntarWindow, SidIngress, StationInWindow } from './vedicForecast.ts';

const DD = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
};

const D = (deg: number): string => degMin(deg);

/** «Состояние» планеты — как в таблице мастер-промпта: достоинство, а если его
 *  нет — отношение к хозяину знака (митра/шатру/нейтрально). */
function stateOf(p: VedicNatal['chart']['planets'][number]): string {
  if (p.dignity.kind === 'exalted') return 'уттама (экзальтация)';
  if (p.dignity.kind === 'debilitated') return 'нича (падение)';
  if (p.dignity.kind === 'moolatrikona') return 'мулатрикона';
  if (p.dignity.kind === 'own') return 'свакшетра (свой знак)';
  // хозяин в именительном падеже: склонять имена планет по суффиксам нельзя
  if (p.hostRelation) return `хозяин знака ${p.host} — ${RELATION_LABEL[p.hostRelation]}`;
  return 'нейтрально';
}

export interface VedicPromptInput {
  person: Person;
  natal: VedicNatal;
  ayanamsa?: string;          // id из AYANAMSAS
  ayanamsaDeg?: number;       // значение аянамши на момент рождения, °
  /** транзитные позиции (сидерические) на момент запроса + сам момент */
  transit?: { at: Date; positions: BodyPosition[] } | null;
  /** прогнозный горизонт: антардаши + расписание переходов транзитов.
   *  Ровно то, что астролог вбивала в ИИ руками (образец запроса 2026-07-29). */
  forecast?: {
    months: number;
    antars: AntarWindow[];
    ingresses: SidIngress[];
    stations: StationInWindow[];
  } | null;
  tz: string;
}

export function buildVedicPrompt(inp: VedicPromptInput): string {
  const { person, natal } = inp;
  const c = natal.chart;
  const L: string[] = [];
  const ayLabel = AYANAMSAS.find((a) => a.id === (inp.ayanamsa ?? 'lahiri'))?.label ?? 'Лахири';

  L.push('Ты — опытный джйотиши (Парашара + Джаймини, накшатра-видья, Вимшоттари).');
  L.push('Ниже ТОЧНО РАССЧИТАННАЯ карта (Swiss Ephemeris, сидерический зодиак, аянамша '
    + `${ayLabel}${inp.ayanamsaDeg != null ? ` = ${inp.ayanamsaDeg.toFixed(4)}°` : ''}, `
    + 'дома целознаковые, узлы истинные). НИЧЕГО не пересчитывай — работай с данными.');

  // ── данные рождения ──
  L.push(`\n## КАРТА: ${person.name}`);
  L.push(`Рождение: ${person.birthDate} ${person.birthTime ?? '12:00 (время неизвестно!)'} `
    + `(${person.birthTz})${person.place ? `, ${person.place.name} — ${person.place.lat.toFixed(3)}°N ${person.place.lon.toFixed(3)}°E` : ''}.`);
  if (person.unknownTime) L.push('⚠ Время рождения НЕ задано — взят полдень: лагна и дома ненадёжны, предложи ректификацию.');

  // ── базовые параметры ──
  const lagNak = c.lagnaNakshatra;
  L.push(`\nЛагна: ${D(c.lagnaLon % 30)} ${ZODIAC[c.lagnaSign]} · накшатра ${lagNak.name} (пада ${lagNak.pada}).`);
  const lagnesh = c.planets.find((p) => p.name === c.houses[0].lord);
  L.push(`Лагнеш: ${c.houses[0].lord}${lagnesh ? ` — в ${lagnesh.house}-м доме, ${D(lagnesh.degInSign)} ${lagnesh.sign}, ${stateOf(lagnesh)}` : ''}.`);
  L.push(`Лунный знак: ${ZODIAC[c.moonSign]} · накшатра Луны ${c.moonNakshatra.name} (пада ${c.moonNakshatra.pada}, упр. ${c.moonNakshatra.lord}).`);
  L.push(`Титхи рождения: ${c.tithi.index} · ${c.tithi.name} (${c.tithi.paksha}).`);

  // ── позиции ──
  L.push('\n### Позиции (знак · градус · дом · накшатра/пада · состояние)');
  for (const p of c.planets) {
    const sanskrit = GRAHA_NAMES[p.name] && GRAHA_NAMES[p.name] !== p.name ? ` (${GRAHA_NAMES[p.name]})` : '';
    L.push(`${p.name}${sanskrit}: ${D(p.degInSign)} ${p.sign}${p.retro ? ' R' : ''} · ${p.house}-й дом · `
      + `${p.nakshatra.name} ${p.nakshatra.pada} (упр. ${p.nakshatra.lord}) · ${stateOf(p)}`
      + (p.rules.length ? ` · управляет домами ${p.rules.join(', ')}` : ''));
  }
  L.push(`Навамша (D9): ${c.planets.map((p) => `${SHORT[p.name] ?? p.name} — ${ZODIAC[p.navamsha]}`).join('; ')}.`);

  // ── лорды домов ──
  L.push('\n### Лорды домов (дом · знак · лорд · где стоит)');
  L.push(c.houses.map((h) => `${h.house}: ${h.sign}, ${h.lord} → ${h.lordHouse ? `${h.lordHouse}-й` : '—'}`).join(' · '));

  // ── караки ──
  L.push('\n### Чара-караки (Джаймини, 7 планет по градусу в знаке)');
  for (const k of CHARA_KARAKAS) {
    const p = c.planets.find((x) => x.karaka === k.code);
    if (p) L.push(`${k.code} ${k.name} (${k.of}): ${p.name}, ${D(p.degInSign)} ${p.sign}`);
  }

  // ── даши ──
  const now = natal.now;
  L.push('\n### Вимшоттари');
  if (now.maha) {
    const dt = (d: Date) => d.toISOString().slice(0, 10);
    L.push(`Сейчас: маха ${now.maha.lord} (${dt(now.maha.from)} — ${dt(now.maha.to)})`
      + (now.antar ? ` · антар ${now.antar.lord} (до ${dt(now.antar.to)})` : '')
      + (now.pratyantar ? ` · пратьянтар ${now.pratyantar.lord} (до ${dt(now.pratyantar.to)})` : '') + '.');
    L.push('Махадаши: ' + natal.dashas.map((d) => `${d.lord} ${dt(d.from)}—${dt(d.to)}`).join('; ') + '.');
  }

  // ── транзиты ──
  if (inp.transit) {
    const { at, positions } = inp.transit;
    L.push(`\n### Транзиты (гочара) на ${at.toISOString().slice(0, 16).replace('T', ' ')} UTC — дома от лагны`);
    for (const p of positions) {
      if (!VEDIC_ORDER_SET.has(p.name)) continue;
      const si = signIndexOf(p.lon);
      const house = ((si - c.lagnaSign + 12) % 12) + 1;
      L.push(`${p.name}: ${D(p.degInSign)} ${ZODIAC[si]}${p.retro ? ' R' : ''} · ${house}-й дом`);
    }
    const sat = positions.find((p) => p.name === 'Сатурн');
    const ss = sat ? sadeSati(c.moonSign, signIndexOf(sat.lon)) : null;
    L.push(`Саде Сати: ${ss ? ss.label : 'неактивна (Сатурн вне 12/1/2/4/8-го от Луны)'}.`);
  }

  // ── прогнозный горизонт: антардаши + расписание транзитов ──
  if (inp.forecast) {
    const f = inp.forecast;
    L.push(`\n### Прогнозный горизонт: ближайшие ${f.months} месяцев`);
    L.push('Антардаши: ' + f.antars.map((a) =>
      `${a.maha}–${a.antar} с ${DD(a.from)} до ${DD(a.to)}${a.current ? ' (ТЕКУЩАЯ)' : ''}`).join('; ') + '.');
    if (f.ingresses.length) {
      L.push('Переходы транзитов (дома от лагны):');
      for (const g of f.ingresses) {
        const house = ((g.toSign - c.lagnaSign + 12) % 12) + 1;
        L.push(`  ${DD(g.at)} — ${g.name}${g.retro ? ' (ретро)' : ''} → ${ZODIAC[g.toSign]} (${house}-й дом)`);
      }
    }
    if (f.stations.length) {
      L.push('Станции: ' + f.stations.map((s) =>
        `${DD(s.at)} ${s.planet} ${s.toRetro ? 'разворачивается в ретро' : 'выходит из ретро'} в ${ZODIAC[s.sign]}`).join('; ') + '.');
    }
  }

  // ── каркас разбора (сжатый мастер-промпт) ──
  L.push(`
## ЗАДАНИЕ
Сделай разбор по конкретной конфигурации (не по общим смыслам знаков), каждый
вывод обосновывай позициями (дом · лорд · накшатра · дришти · йога), противоречия
карты не сглаживай, говори прямо и бытовым языком. Порядок:
1. Ядро личности: лагна+лагнеш, Атмакарака, психологический профиль.
2. Предназначение и карьера: 10-й дом и его лорд, АмК, раджа/дхана-йоги, периоды.
3. Финансы: 2-й и 11-й дома, паттерны, периоды.
4. Отношения и брак: 7-й дом, ДК, Венера/Юпитер, доши (в т.ч. манглик — проверь
   Марс в 1/2/4/7/8/12 от лагны и от Луны), навамша, сроки.
5. Психика: Луна (накшатра!), Меркурий, кармические узлы Раху/Кету по оси домов.
6. Здоровье: 6-й дом, конституция по сильнейшим грахам, уязвимые зоны.
7. Дхарма: 9-й дом, Юпитер, путь.
8. Текущий период и прогноз: разбери ТЕКУЩУЮ антардашу и следующие из
   прогнозного горизонта ПО МЕСЯЦАМ, связывая каждую с переходами транзитов и
   станциями из расписания выше (антардаша + транзит = влияние); Саде Сати
   учитывай отдельно. Что поддержано сейчас, что подождёт — с датами.
9. Итог: кто этот человек, главная тема жизни — 5–7 фраз без воды.
Если данных не хватает — скажи, каких именно.`);

  return L.join('\n');
}
