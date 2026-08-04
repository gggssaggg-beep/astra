<script lang="ts">
  /**
   * Полный разбор кундали — ВСТРАИВАЕМЫЙ блок (не шторка): дом → знак → грахи,
   * дришти, аштакаварга, грахи с трактовками, важные даты, периоды Вимшоттари.
   *
   * Был отдельной шторкой «Ведическая карта» с кнопкой «Полный разбор карты →».
   * Правка владелицы 2026-07-29: лишний переход убран — карта человека и её
   * разбор живут на ОДНОМ экране в «Картах». Ромб и переключатель варг рисует
   * родитель (ChartsSheet): диаграмма — часть самой карты, а не разбора.
   *
   * Считает движок в СИДЕРИЧЕСКОМ режиме (карта приходит готовой сверху),
   * раскладывает lib/vedic.ts. Здесь только отображение.
   */
  import { reveal } from '../lib/reveal.ts';
  import type { Engine } from '../engine/index.ts';
  import { ZODIAC, SIGN_GLYPH, PLANET_GLYPH } from '../engine/index.ts';
  import { vedicSky, degMin, type VedicNatal } from '../lib/vedicChart.ts';
  import { NATURAL_KARAKAS, CHARA_KARAKAS, RELATION_LABEL, sadeSati,
    pratyantarDashas } from '../lib/vedic.ts';
  import { ashtakavarga } from '../lib/ashtakavarga.ts';
  import { vedicTimeline } from '../lib/vedicTimeline.ts';
  import { grahaHouseText } from '../lib/grahaHouseLore.ts';
  import { mahaDashaText, antarDashaText } from '../lib/dashaLore.ts';
  import { grahaSignText } from '../lib/grahaSignLore.ts';
  import { grahaDrishti } from '../lib/drishti.ts';
  import Hint from './Hint.svelte';

  let { engine, tz, natal, simple = false }:
    { engine: Engine; tz: string; natal: VedicNatal;
      /** «я не астролог»: варги, отношения грах и дришти — специальные слои */
      simple?: boolean } = $props();

  let openDasha = $state<string | null>(null);
  // раскрытая антардаша: ключ «махадаша|антардаша» — третий уровень (пратьянтары)
  // строится на лету, поэтому раскрыта всегда только одна ветка
  let openAntar = $state<string | null>(null);
  let openLore = $state<string | null>(null);   // раскрытая трактовка грахи
  let tlAll = $state(false);                    // лента дат раскрыта целиком

  // Разделы разбора — вкладками (правка астролога 2026-07-29): одна простыня из
  // домов, дришти, аштакаварги, грах и даш перегружала экран. Сводка о карте
  // остаётся НАД вкладками — это шапка кундали, а не раздел.
  type TabId = 'grahas' | 'houses' | 'drishti' | 'av' | 'dashas';
  let tab = $state<TabId>('grahas');

  // небо «сейчас» нужно только для станции Сатурна от Луны (Саде Сати)
  const sky = $derived(vedicSky(engine));

  // аштакаварга: бинду по домам от лагны (узлы в системе не участвуют)
  const av = $derived.by(() => {
    const signs: Record<string, number> = {};
    for (const p of natal.chart.planets) signs[p.name] = p.signIndex;
    return ashtakavarga(signs, natal.chart.lagnaSign);
  });

  // важные даты на три года вперёд (движок, без ИИ)
  const timeline = $derived.by(() => {
    const rahu = natal.chart.planets.find((p) => p.name === 'Раху');
    try {
      return vedicTimeline(engine, natal.dashas, {
        lagnaSign: natal.chart.lagnaSign, moonSign: natal.chart.moonSign,
        rahuSign: rahu?.signIndex ?? 0,
      }, new Date(), 3);
    } catch { return []; }
  });

  // Саде Сати: транзитный Сатурн относительно НАТАЛЬНОЙ Луны (12/1/2-й знак =
  // фазы; 4-й — кантака, 8-й — аштама). Строка есть только когда Сатурн в станции
  const sadeSatiNow = $derived.by(() => {
    const sat = sky.planets.find((p) => p.name === 'Сатурн');
    return sat ? sadeSati(natal.chart.moonSign, sat.signIndex) : null;
  });

  // дришти: узлы не аспектируют (школа по умолчанию, см. lib/drishti.ts)
  const drishti = $derived(grahaDrishti(natal.chart.planets, natal.chart.lagnaSign));

  // короткое имя карты — {@const} на верхнем уровне разметки Svelte не разрешён
  const c = $derived(natal.chart);

  // «я не астролог»: дришти и аштакаварга — специальные слои, вкладок под них нет
  const tabs = $derived.by(() => {
    const out: { id: TabId; label: string }[] = [
      { id: 'grahas', label: 'Грахи' },
      { id: 'houses', label: 'Дома' },
    ];
    if (!simple && drishti.length) out.push({ id: 'drishti', label: 'Дришти' });
    if (!simple && av) out.push({ id: 'av', label: 'Аштакаварга' });
    out.push({ id: 'dashas', label: 'Даши' });
    return out;
  });
  // если открытая вкладка исчезла (включили упрощённый вид) — возвращаемся к грахам
  const active = $derived(tabs.some((t) => t.id === tab) ? tab : 'grahas');

  const karakaName = (code?: string) =>
    CHARA_KARAKAS.find((k) => k.code === code)?.name ?? '';
  // даши тянутся десятилетиями — без года подпись «24 июл. — 24 июл.» бессмысленна
  const dt = (d: Date) => new Intl.DateTimeFormat('ru-RU',
    { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  /** «Солнце (1, 11)» — в скобках дома, которыми граха управляет. */
  const rules = (r: number[]) => (r.length ? ` (${r.join(', ')})` : '');
  const ORD = ['', '1-м', '2-м', '3-м', '4-м', '5-м', '6-м', '7-м', '8-м', '9-м', '10-м', '11-м', '12-м'];
</script>

<div class="card glass reveal" use:reveal>
  <div class="grid">
    <div><span class="k">Лагна <Hint k="lagna" /></span><span class="v">{degMin(c.lagnaLon % 30)} {ZODIAC[c.lagnaSign]}</span></div>
    <div><span class="k">Лагнеш</span><span class="v">{c.houses[0].lord}
      {#if c.houses[0].lordHouse}· в {ORD[c.houses[0].lordHouse]} доме{/if}</span></div>
    <div><span class="k">Лунный знак</span><span class="v">{ZODIAC[c.moonSign]}</span></div>
    <div><span class="k">Накшатра Луны <Hint k="nakshatra" /></span><span class="v">{c.moonNakshatra.name}
      · пада {c.moonNakshatra.pada} · упр. {c.moonNakshatra.lord}</span></div>
    <div><span class="k">Лунный день <Hint k="tithi" /></span><span class="v">{c.tithi.index} · {c.tithi.name}
      ({c.tithi.paksha})</span></div>
    {#each c.planets.filter((p) => p.karaka === 'АК') as ak}
      <div><span class="k">Атмакарака <Hint k="karaka" /></span><span class="v">{ak.name}</span></div>
    {/each}
    {#if natal.now.maha}
      <div><span class="k">Текущий период <Hint k="dasha" /></span><span class="v">{natal.now.maha.lord}
        {#if natal.now.antar}— {natal.now.antar.lord}{/if}
        {#if natal.now.pratyantar}— {natal.now.pratyantar.lord}{/if}</span></div>
    {/if}
    {#if sadeSatiNow}
      <div><span class="k">Сатурн от Луны</span><span class="v">{sadeSatiNow.label}</span></div>
    {/if}
  </div>
</div>

<!-- разделы разбора: на экране живёт один, остальные — в один тап -->
<div class="tabs">
  {#each tabs as t (t.id)}
    <button class:on={active === t.id} aria-current={active === t.id ? 'true' : undefined}
      onclick={() => (tab = t.id)}>{t.label}</button>
  {/each}
</div>

{#if active === 'houses'}
<div class="hdr">Дома <Hint k="wholeSign" /></div>
<div class="card glass table reveal" use:reveal>
  <div class="row th"><span>Дом</span><span>Знак <Hint k="rashi" /></span><span>Грахи</span><span>Упр. в</span></div>
  {#each c.houses as h}
    <div class="row">
      <span class="hn">{h.house}-й</span>
      <span>{SIGN_GLYPH[h.signIndex]} {h.sign}</span>
      <span class="pls">{#each h.planets as p}<span class="pl" class:rx={p.retro}
        >{PLANET_GLYPH[p.name] ?? p.name}{p.retro ? 'R' : ''}</span>{:else}<span class="dash">—</span>{/each}</span>
      <span class="lord">{h.lordHouse ? `${ORD[h.lordHouse]}` : '—'}</span>
    </div>
  {/each}
</div>
<div class="note">«Упр. в» — где стоит управитель знака этого дома: связь домов, с которой
  начинается чтение карты.</div>
{/if}

<!-- дришти — специальный слой джйотиша, в упрощённом виде его не показываем -->
{#if active === 'drishti' && !simple && drishti.length}
  <div class="hdr">Дришти <Hint k="drishti" /></div>
  <div class="card glass table drishti reveal" use:reveal>
    <div class="row th"><span>Граха</span><span>Куда смотрит</span></div>
    {#each drishti as d}
      {@const under = d.targets.flatMap((t) => t.hits)}
      <div class="row">
        <span class="pn"><span class="g glyph">{PLANET_GLYPH[d.from] ?? '•'}</span> {d.from}</span>
        <span class="tg">
          <span>из {d.fromHouse}-го дома смотрит в {d.targets.map((t) => `${t.house}-й`).join(', ')}</span>
          {#if under.length}<span class="under">под дришти: {under.join(', ')}</span>{/if}
        </span>
      </div>
    {/each}
  </div>
  <div class="note">Дришти считаются по целым знакам: граха смотрит из своего знака в знак
    целиком, вместе со всеми, кто там стоит, — градусы здесь не участвуют.</div>
{/if}

{#if active === 'av' && !simple && av}
  <div class="hdr">Аштакаварга</div>
  <div class="card glass table reveal" use:reveal>
    <div class="row th av"><span>Дом</span><span>Знак</span><span>Бинду</span><span></span></div>
    {#each c.houses as h, i}
      {@const v = av.savByHouse[i]}
      <div class="row av">
        <span class="hn">{h.house}-й</span>
        <span>{SIGN_GLYPH[h.signIndex]} {h.sign}</span>
        <span class="bindu" class:strong={v >= 30} class:weak={v < 25}>{v}</span>
        <span class="bar"><span class="fill" style="width:{Math.min(100, v / 45 * 100)}%"></span></span>
      </div>
    {/each}
  </div>
  <div class="note">Сарва-аштакаварга: сколько бинду набрал каждый дом (всего 337,
    в среднем 28 на знак). Больше — дела дома идут легче, меньше — территория,
    где приходится добирать усилием.</div>
{/if}

{#if active === 'grahas'}
<div class="hdr">Грахи <Hint k="dignity" /></div>
<!-- Сводная таблица положений — то, с чего джйотиш-программы начинают разбор:
     где стоит каждая граха. Первой строкой лагна. Без трактовок: они ниже,
     в карточках. Правка астролога 2026-07-29. -->
<div class="card glass ptable reveal" use:reveal>
  <div class="pscroll">
    <table class="pgrid">
      <thead>
        <tr><th>Граха</th><th>Градус</th><th>Раши</th><th>Накшатра</th><th class="pd">Пада</th></tr>
      </thead>
      <tbody>
        <tr>
          <td class="pn"><span class="as">As</span><span class="nm">Лагна</span></td>
          <td class="deg">{degMin(c.lagnaLon % 30)}</td>
          <td class="sg"><span class="g glyph">{SIGN_GLYPH[c.lagnaSign]}</span><span
            class="sn">{ZODIAC[c.lagnaSign]}</span></td>
          <td class="nk">{c.lagnaNakshatra.name}</td>
          <td class="pd">{c.lagnaNakshatra.pada}</td>
        </tr>
        {#each c.planets as p}
          <tr>
            <td class="pn"><span class="g glyph">{PLANET_GLYPH[p.name] ?? '•'}</span><span
              class="nm">{p.name}{#if p.retro}<span class="rx">R</span>{/if}</span
              >{#if p.karaka}<span class="kk">{p.karaka}</span>{/if}</td>
            <td class="deg">{degMin(p.degInSign)}</td>
            <td class="sg"><span class="g glyph">{SIGN_GLYPH[p.signIndex]}</span><span
              class="sn">{p.sign}</span></td>
            <td class="nk">{p.nakshatra.name}</td>
            <td class="pd">{p.nakshatra.pada}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
<div class="note">R — граха идёт попятно; АК, АмК и прочие пометки у имени — чара-караки.{#if !simple}
  Ниже то же самое подробно: достоинство, навамша и что это значит.{/if}</div>
{#each c.planets as p}
  <div class="card glass pcard reveal" use:reveal>
    <div class="pline">
      <span class="g glyph">{PLANET_GLYPH[p.name] ?? '•'}</span>
      <span class="pname">{p.name}<span class="rul">{rules(p.rules)}</span></span>
      <span class="ppos">{degMin(p.degInSign)} {p.sign}{p.retro ? ' R' : ''}</span>
    </div>
    <div class="psub">в {ORD[p.house]} доме · {p.nakshatra.name} (пада {p.nakshatra.pada},
      упр. {p.nakshatra.lord})</div>
    <!-- хозяин знака в именительном: склонять имена грах по суффиксам
         нельзя («Меркурийа»), а сокращать до «у друга» — терять, у кого -->
    {#if !simple}<div class="psub">навамша {ZODIAC[p.navamsha]}{#if p.hostRelation}&nbsp;· хозяин знака {p.host} — {RELATION_LABEL[p.hostRelation]}{/if}</div>{/if}
    <!-- трактовки: граха в доме и в знаке. Раскрываются по тапу — иначе
         девять карточек по два абзаца превращают экран в простыню -->
    {#if !simple}
      {@const hTxt = grahaHouseText(p.name, p.house)}
      {@const sTxt = grahaSignText(p.name, p.sign)}
      {#if hTxt || sTxt}
        <button class="lorebtn" onclick={() => (openLore = openLore === p.name ? null : p.name)}>
          {openLore === p.name ? 'Свернуть' : 'Что это значит'} {openLore === p.name ? '▴' : '▾'}
        </button>
        {#if openLore === p.name}
          <div class="lorebox">
            {#if hTxt}<div class="loreone"><span class="lorelbl">в {ORD[p.house]} доме</span>{hTxt}</div>{/if}
            {#if sTxt}<div class="loreone"><span class="lorelbl">в знаке {p.sign}</span>{sTxt}</div>{/if}
          </div>
        {/if}
      {/if}
    {/if}
    <div class="tags">
      {#if p.dignity.kind}<span class="tag {p.dignity.kind}">{p.dignity.label}</span>{/if}
      {#if p.karaka}<span class="tag k">{p.karaka} · {karakaName(p.karaka)}</span>{/if}
      {#if NATURAL_KARAKAS[p.name]}<span class="nat">{NATURAL_KARAKAS[p.name]}</span>{/if}
    </div>
  </div>
{/each}
{/if}

{#if active === 'dashas'}
<!-- Что и когда — без похода к ИИ: смены даш, заходы медленных грах,
     Саде Сати, узловые возвращения. Ближайшее сверху. -->
{#if timeline.length}
  <div class="hdr">Важные даты</div>
  <div class="card glass reveal" use:reveal>
    {#each timeline.slice(0, tlAll ? timeline.length : 8) as e (e.at.getTime() + e.title)}
      <div class="tl w{e.weight}">
        <div class="tlhead"><span class="tldate">{dt(e.at)}</span><b>{e.title}</b></div>
        <div class="tldetail">{e.detail}</div>
      </div>
    {/each}
    {#if timeline.length > 8}
      <button class="lorebtn" onclick={() => (tlAll = !tlAll)}>
        {tlAll ? 'Свернуть' : `Ещё ${timeline.length - 8}`} {tlAll ? '▴' : '▾'}
      </button>
    {/if}
  </div>
  <div class="note">Даты рассчитаны движком: смены периодов, заходы Юпитера и Сатурна
    в новый знак, фазы Саде Сати, узловые возвращения. Быстрые грахи сюда не идут —
    они на экране дня.</div>
{/if}

<div class="hdr">Периоды Вимшоттари <Hint k="dasha" /></div>
{#each natal.dashas as d}
  {@const cur = natal.now.maha?.from.getTime() === d.from.getTime()}
  <div class="card glass dasha reveal" class:cur use:reveal>
    <button class="dhead" onclick={() => (openDasha = openDasha === d.lord ? null : d.lord)}>
      <span class="g glyph">{PLANET_GLYPH[d.lord] ?? '•'}</span>
      <span class="dl">{d.lord}</span>
      <span class="dd">{dt(d.from)} — {dt(d.to)}</span>
      <span class="arr">{openDasha === d.lord ? '▾' : '▸'}</span>
    </button>
    {#if openDasha === d.lord}
      <!-- что значит период: текст махадаши, а у текущей антардаши — её сочетание -->
      {@const mTxt = mahaDashaText(d.lord)}
      {#if mTxt}<div class="dashaTxt">{mTxt}</div>{/if}
      <div class="subs">
        {#each d.sub ?? [] as s}
          {@const scur = natal.now.antar?.from.getTime() === s.from.getTime()}
          {@const key = `${d.lord}|${s.lord}`}
          <!-- антардаша раскрывается в третий уровень: пратьянтар-даши -->
          <button class="sub" class:cur={scur}
            onclick={() => (openAntar = openAntar === key ? null : key)}>
            <span class="sl">{d.lord} — {s.lord}</span>
            <span class="sd">{dt(s.from)} — {dt(s.to)}</span>
            <span class="arr">{openAntar === key ? '▾' : '▸'}</span>
          </button>
          {#if scur}
            {@const aTxt = antarDashaText(d.lord, s.lord)}
            {#if aTxt}<div class="dashaTxt sub2">{aTxt}</div>{/if}
          {/if}
          {#if openAntar === key}
            <div class="prs">
              {#each pratyantarDashas(s) as p}
                {@const pcur = natal.now.pratyantar?.from.getTime() === p.from.getTime()}
                <div class="pr" class:cur={pcur}>
                  <span class="pl">{d.lord} — {s.lord} — {p.lord}</span>
                  <span class="pd">{dt(p.from)} — {dt(p.to)}</span>
                </div>
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
{/each}
<div class="note">Три уровня: махадаша (нажми на строку) → антардаша → пратьянтар (нажми на
  антардашу). Владыки идут одним и тем же кругом Кету&nbsp;7 · Венера&nbsp;20 · Солнце&nbsp;6 ·
  Луна&nbsp;10 · Марс&nbsp;7 · Раху&nbsp;18 · Юпитер&nbsp;16 · Сатурн&nbsp;19 · Меркурий&nbsp;17 =
  120 лет; внутри периода счёт начинается с его же владыки, а доля каждого — его годы, делённые
  на 120. Первый период идёт неполным: он начался до рождения, и прошедшую часть задаёт
  положение Луны внутри её накшатры.</div>
<div class="note">Отсюда чувствительность ко времени рождения: накшатра — всего 800′, минута
  времени сдвигает границы примерно на {natal.dashaDaysPerMinute.toFixed(1)} сут, три минуты —
  на две недели. Если даты не сходятся с другой программой, сверяй сперва время рождения,
  потом аянамшу, и только потом подозревай расчёт. Год даши здесь юлианский — 365,25 суток.</div>
{/if}

<style>
  .note { color: var(--ink-faint); font-size: 0.8rem; line-height: 1.45; margin: 6px 4px 12px; }
  .card { padding: 10px 12px; margin: 8px 0; }
  .hdr { color: var(--ink-faint); font-size: 0.7rem; text-transform: uppercase;
    letter-spacing: 1px; margin: 16px 4px 4px; }

  /* Вкладки разделов — в духе переключателя варг, но ряд прокручивается вбок и
     НЕ переносится: «Аштакаварга» длинная. Кегль и поля подобраны так, чтобы
     все пять названий влезали в 360 px без прокрутки (мерено браузером). */
  .tabs { display: flex; gap: 4px; margin: 14px 0 2px; overflow-x: auto;
    white-space: nowrap; padding-bottom: 2px; scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tabs button { flex: 0 0 auto; padding: 8px; border-radius: 10px; font-size: 0.74rem;
    background: transparent; border: 1px solid var(--glass-brd); color: var(--ink-faint); }
  .tabs button.on { color: var(--ink-dim);
    border-color: color-mix(in srgb, var(--gold) 35%, var(--glass-brd));
    background: color-mix(in srgb, var(--glass) 80%, var(--gold) 8%); }

  .grid { display: flex; flex-direction: column; gap: 8px; }
  .grid > div { display: flex; gap: 10px; align-items: baseline; }
  .k { color: var(--ink-faint); font-size: 0.78rem; min-width: 108px; }
  .v { color: var(--ink); font-size: 0.86rem; line-height: 1.4; }

  .table { padding: 4px 6px; }
  .row { display: grid; grid-template-columns: 3.2rem 1fr 1fr 3.2rem; gap: 6px;
    padding: 7px 6px; align-items: center; font-size: 0.82rem; color: var(--ink); }
  .row + .row { border-top: 1px solid var(--glass-brd); }
  .row.th { color: var(--ink-faint); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; }
  /* аштакаварга: число бинду + полоска-индикатор */
  .row.av { grid-template-columns: 3.2rem 1fr 2.4rem 3.4rem; }
  .bindu { text-align: right; font-variant-numeric: tabular-nums; color: var(--ink-dim); }
  .bindu.strong { color: var(--gold); }
  .bindu.weak { color: var(--rose); }
  .bar { height: 5px; border-radius: 3px; background: var(--glass-brd); overflow: hidden; }
  .bar .fill { display: block; height: 100%; background: color-mix(in srgb, var(--gold) 55%, transparent); }
  .hn { color: var(--ink-dim); }
  .pls { display: flex; flex-wrap: wrap; gap: 4px; }
  .pl { font-size: 0.9rem; color: var(--ink); }
  .pl.rx { color: var(--gold); }
  .dash, .lord { color: var(--ink-faint); }

  /* дришти: две колонки — кто смотрит и куда, цели с переносом по ширине */
  .drishti .row { grid-template-columns: 6rem 1fr; align-items: start; }
  .drishti .pn { display: flex; align-items: baseline; gap: 6px; color: var(--ink-dim); }
  .drishti .tg { display: flex; flex-direction: column; gap: 3px; line-height: 1.4; }
  .drishti .under { color: var(--ink-faint); font-size: 0.76rem; }

  /* Таблица положений грах — настоящая <table>, а не сетка по строкам: колонки
     сами берут ширину по содержимому и совпадают во всех строках (у «Меркурия»
     и «Уттарапхалгуни» ширина не угадывается рёмами). Если строка всё же не
     влезла в телефон — вбок едет ТОЛЬКО таблица (обёртка), не страница. */
  .ptable { padding: 4px 6px; }
  .pscroll { overflow-x: auto; scrollbar-width: none; }
  .pscroll::-webkit-scrollbar { display: none; }
  .pgrid { width: 100%; border-collapse: collapse; font-size: 0.66rem; color: var(--ink); }
  /* поля ячеек тесные намеренно: пять колонок должны уложиться в 360 px,
     а «Уттарапхалгуни» и «Меркурий АмК» — самые широкие строки (мерено
     headless-браузером на 320/360/384/390/412) */
  .pgrid th, .pgrid td { padding: 7px 2px; text-align: left; font-weight: 400;
    white-space: nowrap; vertical-align: baseline; }
  .pgrid th { color: var(--ink-faint); font-size: 0.62rem; text-transform: uppercase;
    letter-spacing: 0.2px; }
  .pgrid tbody tr + tr td { border-top: 1px solid var(--glass-brd); }
  /* правила ниже держим внутри .pgrid: класс .pn есть и в таблице дришти,
     без прививки к таблице он утащил бы туда чужой кегль глифа */
  .pgrid .pn .g { font-size: 0.92rem; margin-right: 4px; }
  .pgrid .as { color: var(--ink-faint); font-size: 0.7rem; margin-right: 4px; }
  .pgrid .nm { color: var(--ink); }
  .pgrid .nm .rx { color: var(--gold); margin-left: 2px; }
  .pgrid .kk { color: var(--neon-cyan); font-size: 0.6rem; margin-left: 4px; }
  .pgrid .deg { color: var(--ink-dim); font-variant-numeric: tabular-nums; }
  .pgrid .sg { color: var(--ink-dim); }
  .pgrid .sg .g { font-size: 0.86rem; }
  /* Раши: на узком экране (≤ 384 px) в колонке остаётся только глиф знака —
     со словом «Стрелец» строка перестаёт помещаться и таблицу приходится
     возить вбок. Название знака целиком есть ниже, в карточке грахи. */
  .pgrid .sn { display: none; }
  @media (min-width: 390px) {
    .pgrid .sg .g { margin-right: 3px; }
    .pgrid .sn { display: inline; }
  }
  .pgrid .nk { color: var(--ink-dim); }
  .pgrid .pd { color: var(--ink-faint); text-align: center; font-variant-numeric: tabular-nums; }

  .pcard { padding: 10px 12px; }
  .pline { display: flex; align-items: baseline; gap: 8px; }
  .g { color: var(--silver); font-size: 1.1rem; }
  .pname { flex: 1; font-size: 0.92rem; color: var(--ink); }
  .rul { color: var(--ink-faint); font-size: 0.78rem; }
  .ppos { font-size: 0.84rem; color: var(--ink-dim); }
  .psub { color: var(--ink-faint); font-size: 0.78rem; margin-top: 4px; line-height: 1.4; }
  .tl { padding: 8px 0; }
  .tl + .tl { border-top: 1px solid var(--glass-brd); }
  .tl.w0 { opacity: 0.66; }
  .tlhead { display: flex; gap: 9px; align-items: baseline; font-size: 0.86rem; color: var(--ink); }
  .tldate { color: var(--ink-faint); font-size: 0.76rem; font-variant-numeric: tabular-nums;
    min-width: 5.3rem; }
  .tl.w2 .tlhead b { color: var(--gold); }
  .tldetail { color: var(--ink-faint); font-size: 0.78rem; line-height: 1.45;
    margin: 3px 0 0 5.3rem; }
  .lorebtn { background: transparent; border: none; padding: 6px 0 2px; text-align: left;
    color: var(--ink-dim); font-size: 0.78rem; }
  .lorebox { margin: 4px 0 2px; display: flex; flex-direction: column; gap: 9px; }
  .loreone { font-size: 0.84rem; line-height: 1.5; color: var(--ink-dim); }
  .lorelbl { display: block; color: var(--ink-faint); font-size: 0.72rem;
    text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 2px; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px; }
  .tag { font-size: 0.7rem; border-radius: 999px; padding: 2px 9px; border: 1px solid var(--glass-brd);
    color: var(--ink-dim); white-space: nowrap; }
  .tag.exalted { color: var(--gold); border-color: color-mix(in srgb, var(--gold) 45%, var(--glass-brd)); }
  .tag.debilitated { color: var(--rose); border-color: color-mix(in srgb, var(--rose) 45%, var(--glass-brd)); }
  .tag.k { color: var(--neon-cyan); border-color: color-mix(in srgb, var(--neon-cyan) 40%, var(--glass-brd)); }
  .nat { color: var(--ink-faint); font-size: 0.76rem; }

  .dasha { padding: 2px 6px; }
  .dasha.cur { border-color: color-mix(in srgb, var(--gold) 40%, var(--glass-brd)); }
  .dhead { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    background: transparent; border: none; color: var(--ink); padding: 9px 6px; }
  .dl { flex: 1; font-size: 0.9rem; }
  .dd { color: var(--ink-dim); font-size: 0.78rem; }
  .arr { color: var(--ink-faint); }
  .subs { padding: 2px 6px 8px; }
  .dashaTxt { color: var(--ink-dim); font-size: 0.82rem; line-height: 1.5;
    padding: 4px 6px 8px; }
  .dashaTxt.sub2 { color: var(--ink-faint); font-size: 0.78rem; padding: 2px 10px 8px; }
  /* антардаша — кнопка (раскрывает третий уровень), но выглядит как строка */
  .sub { display: flex; align-items: center; justify-content: space-between; gap: 8px;
    width: 100%; text-align: left; padding: 5px 6px; border-radius: 8px;
    background: transparent; border: none; }
  .sub.cur { background: color-mix(in srgb, var(--glass) 80%, var(--gold) 8%); }
  .sl { color: var(--ink-dim); font-size: 0.8rem; flex: 1; }
  .sd { color: var(--ink-faint); font-size: 0.76rem; }
  /* третий уровень: пратьянтары — с отступом и мельче, чтобы вложенность читалась */
  .prs { padding: 2px 0 6px 14px; border-left: 1px solid var(--glass-brd); margin-left: 8px; }
  .pr { display: flex; justify-content: space-between; gap: 8px; padding: 3px 6px;
    border-radius: 6px; }
  .pr.cur { background: color-mix(in srgb, var(--glass) 80%, var(--gold) 10%); }
  .pl { color: var(--ink-faint); font-size: 0.74rem; }
  .pd { color: var(--ink-faint); font-size: 0.72rem; white-space: nowrap; }
</style>
