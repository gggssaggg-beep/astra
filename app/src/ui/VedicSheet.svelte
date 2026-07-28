<script lang="ts">
  /**
   * «Ведическая карта» (джйотиш) — экран того, что астролог читает в D1:
   * дом → знак → планеты в доме → градус, плюс лагна, лунный знак с накшатрой,
   * титхи, караки, достоинства и периоды Вимшоттари.
   *
   * Вторая вкладка — «Сейчас на небе»: чистые транзиты без карты (какая планета
   * в каком знаке сейчас), они от карты не зависят.
   *
   * Считает движок в СИДЕРИЧЕСКОМ режиме (передаётся сверху), раскладывает
   * lib/vedic.ts. Здесь только отображение.
   */
  import { untrack } from 'svelte';
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import type { Engine } from '../engine/index.ts';
  import { ZODIAC, SIGN_GLYPH, PLANET_GLYPH } from '../engine/index.ts';
  import { db } from '../lib/db.ts';
  import type { Person } from '../lib/models.ts';
  import { vedicNatal, vedicSky, vargaCells, degMin } from '../lib/vedicChart.ts';
  import { NATURAL_KARAKAS, CHARA_KARAKAS, RELATION_LABEL, sadeSati } from '../lib/vedic.ts';
  import { ashtakavarga } from '../lib/ashtakavarga.ts';
  import { grahaHouseText } from '../lib/grahaHouseLore.ts';
  import { grahaSignText } from '../lib/grahaSignLore.ts';
  import { VARGA_LIST, vargaInfo, type VargaId } from '../lib/vargas.ts';
  import { grahaDrishti } from '../lib/drishti.ts';
  import VedicChart from './VedicChart.svelte';
  import Hint from './Hint.svelte';

  let { engine, tz, selfId, simple = false, onclose }:
    { engine: Engine; tz: string; selfId?: string; simple?: boolean;
      onclose: () => void } = $props();

  const people = db.people.all().slice();
  // выбор пользователя перекрывает «мою карту» из настроек, но не затирает её
  let picked = $state<string | null>(null);
  const personId = $derived(picked ?? selfId ?? people[0]?.id ?? '');
  const person = $derived<Person | null>(people.find((p) => p.id === personId) ?? null);

  let tab = $state<'chart' | 'sky'>('chart');
  let openDasha = $state<string | null>(null);
  let openLore = $state<string | null>(null);   // раскрытая трактовка грахи

  // Варги: три ходовые карты кнопками, остальные — в компактном «ещё», иначе
  // ряд из восьми кнопок на телефоне разъезжается.
  const VARGA_MAIN: VargaId[] = ['d1', 'd9', 'd10'];
  const VARGA_MORE = VARGA_LIST.filter((v) => !VARGA_MAIN.includes(v.id));
  let varga = $state<VargaId>('d1');
  const inMore = $derived(VARGA_MORE.some((v) => v.id === varga));

  // расчёт карты — на смену человека; движок стабилен (создан в App один раз)
  const natal = $derived.by(() => (person ? untrack(() => vedicNatal(engine, person)) : null));
  const sky = untrack(() => vedicSky(engine));

  // аштакаварга: бинду по домам от лагны (узлы в системе не участвуют)
  const av = $derived.by(() => {
    if (!natal) return null;
    const signs: Record<string, number> = {};
    for (const p of natal.chart.planets) signs[p.name] = p.signIndex;
    return ashtakavarga(signs, natal.chart.lagnaSign);
  });

  // Саде Сати: транзитный Сатурн относительно НАТАЛЬНОЙ Луны (12/1/2-й знак =
  // фазы; 4-й — кантака, 8-й — аштама). Строка есть только когда Сатурн в станции
  const sadeSatiNow = $derived.by(() => {
    if (!natal) return null;
    const sat = sky.planets.find((p) => p.name === 'Сатурн');
    return sat ? sadeSati(natal.chart.moonSign, sat.signIndex) : null;
  });

  const karakaName = (code?: string) =>
    CHARA_KARAKAS.find((k) => k.code === code)?.name ?? '';
  // даши тянутся десятилетиями — без года подпись «24 июл. — 24 июл.» бессмысленна
  const dt = (d: Date) => new Intl.DateTimeFormat('ru-RU',
    { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  /** «Солнце (1, 11)» — в скобках дома, которыми планета управляет. */
  const rules = (r: number[]) => (r.length ? ` (${r.join(', ')})` : '');
  const ORD = ['', '1-м', '2-м', '3-м', '4-м', '5-м', '6-м', '7-м', '8-м', '9-м', '10-м', '11-м', '12-м'];

  // дришти: узлы не аспектируют (школа по умолчанию, см. lib/drishti.ts)
  const drishti = $derived(natal
    ? grahaDrishti(natal.chart.planets, natal.chart.lagnaSign)
    : []);
</script>

<div class="backdrop sheet-backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Ведическая карта" use:bottomSheet={{ onclose }}>
  <header>
    <h2>Ведическая карта <Hint k="vedic" /></h2>
    <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
  </header>

  <div class="tabs">
    <button class:on={tab === 'chart'} onclick={() => (tab = 'chart')}>Карта</button>
    <button class:on={tab === 'sky'} onclick={() => (tab = 'sky')}>Сейчас на небе</button>
  </div>

  {#if tab === 'chart'}
    {#if people.length > 1}
      <select class="select" value={personId} onchange={(e) => (picked = (e.target as HTMLSelectElement).value)}>
        {#each people as p}<option value={p.id}>{p.name}</option>{/each}
      </select>
    {/if}

    {#if !person}
      <div class="empty">Нет ни одной карты. Заведи человека с датой, временем и местом рождения —
        без места нет лагны, а без лагны в джйотише не строятся дома.</div>
    {:else if !natal}
      <div class="empty">У карты «{person.name}» не задано место рождения. Лагна считается от
        координат и точного времени — добавь место, и карта соберётся.</div>
    {:else}
      {@const c = natal.chart}
      <!-- «я не астролог»: варги и отношения планет — специальные слои, их прячем -->
      {#if !simple}
        <div class="vargas">
          {#each VARGA_MAIN as id}
            <button class:on={varga === id} onclick={() => (varga = id)}>{id.toUpperCase()}</button>
          {/each}
          <!-- редкие варги — списком: восемь кнопок в ряд на телефоне не влезают -->
          <select class="more" class:on={inMore} aria-label="Другие варги"
            value={inMore ? varga : ''}
            onchange={(e) => {
              const v = (e.currentTarget as HTMLSelectElement).value;
              if (v) varga = v as VargaId;
            }}>
            <option value="">ещё…</option>
            {#each VARGA_MORE as v}<option value={v.id}>{v.label}</option>{/each}
          </select>
        </div>
      {/if}
      <VedicChart cells={vargaCells(c, simple ? 'd1' : varga)} />
      {#if !simple && varga !== 'd1'}
        {@const info = vargaInfo(varga)}
        <div class="note"><b>{info.label} — {info.theme}.</b> Варга берёт одну тему крупным планом:
          по ней смотрят, дотягивает ли планета то, что обещает в раши. Градусы здесь не пишут —
          в варге своя, растянутая шкала.</div>
      {/if}

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

      <div class="hdr">Дома <Hint k="wholeSign" /></div>
      <div class="card glass table reveal" use:reveal>
        <div class="row th"><span>Дом</span><span>Знак <Hint k="rashi" /></span><span>Планеты</span><span>Упр. в</span></div>
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

      <!-- дришти — специальный слой джйотиша, в упрощённом виде его не показываем -->
      {#if !simple && drishti.length}
        <div class="hdr">Дришти</div>
        <div class="card glass table drishti reveal" use:reveal>
          <div class="row th"><span>Граха</span><span>Куда смотрит</span></div>
          {#each drishti as d}
            {@const under = d.targets.flatMap((t) => t.hits)}
            <div class="row">
              <span class="pn"><span class="g glyph">{PLANET_GLYPH[d.from] ?? '•'}</span> {d.from}</span>
              <span class="tg">
                <span>из {d.fromHouse}-го дома смотрит в {d.targets.map((t) => `${t.house}-й`).join(', ')}</span>
                {#if under.length}<span class="under">под аспектом: {under.join(', ')}</span>{/if}
              </span>
            </div>
          {/each}
        </div>
        <div class="note">Дришти считаются по целым знакам: граха смотрит из своего знака в знак
          целиком, вместе со всеми, кто там стоит, — градусы и орбисы здесь не участвуют.</div>
      {/if}

      {#if !simple && av}
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

      <div class="hdr">Планеты <Hint k="dignity" /></div>
      {#each c.planets as p}
        <div class="card glass pcard reveal" use:reveal>
          <div class="pline">
            <span class="g glyph">{PLANET_GLYPH[p.name] ?? '•'}</span>
            <span class="pname">{p.name}<span class="rul">{rules(p.rules)}</span></span>
            <span class="ppos">{degMin(p.degInSign)} {p.sign}{p.retro ? ' R' : ''}</span>
          </div>
          <div class="psub">в {ORD[p.house]} доме · {p.nakshatra.name} (пада {p.nakshatra.pada},
            упр. {p.nakshatra.lord})</div>
          <!-- хозяин знака в именительном: склонять имена планет по суффиксам
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

      <div class="hdr">Периоды Вимшоттари</div>
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
            <div class="subs">
              {#each d.sub ?? [] as s}
                {@const scur = natal.now.antar?.from.getTime() === s.from.getTime()}
                <div class="sub" class:cur={scur}>
                  <span class="sl">{d.lord} — {s.lord}</span>
                  <span class="sd">{dt(s.from)} — {dt(s.to)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
      <div class="note">Периоды считаются от накшатры Луны: первый идёт неполным — часть его прошла
        до рождения. Границы очень чувствительны ко времени рождения: минута сдвигает их примерно
        на {natal.dashaDaysPerMinute.toFixed(1)} сут, три минуты — на две недели. Если даты не сходятся
        с другой программой, сверяй сперва время, а не расчёт.</div>
    {/if}
  {:else}
    <div class="hint">Небо сейчас, в сидерических знаках <Hint k="sidereal" /> — карта для этого не нужна.</div>
    <div class="card glass table sky reveal" use:reveal>
      <div class="row th"><span>Планета</span><span>Знак</span><span>Накшатра</span></div>
      {#each sky.planets as p}
        <div class="row">
          <span class="hn"><span class="g glyph">{PLANET_GLYPH[p.name] ?? '•'}</span> {p.name}</span>
          <span>{degMin(p.degInSign)} {p.sign}{p.retro ? ' R' : ''}</span>
          <span class="nak">{p.nakshatra} ({p.pada})</span>
        </div>
      {/each}
    </div>
    <div class="card glass reveal" use:reveal>
      <div class="grid">
        <div><span class="k">Луна</span><span class="v">{ZODIAC[sky.moonSign]} ·
          {sky.moonNakshatra.name} (пада {sky.moonNakshatra.pada})</span></div>
        <div><span class="k">Лунный день</span><span class="v">{sky.tithi.index} · {sky.tithi.name}
          ({sky.tithi.paksha})</span></div>
      </div>
    </div>
    {#if sky.planets.some((p) => p.dignity)}
      <div class="hdr">Сильные и слабые по знаку</div>
      <div class="card glass reveal" use:reveal>
        {#each sky.planets.filter((p) => p.dignity) as p}
          <div class="dig"><span class="g glyph">{PLANET_GLYPH[p.name] ?? '•'}</span>
            <span class="dn">{p.name}</span><span class="dv">{p.dignity} · {p.sign}</span></div>
        {/each}
      </div>
    {/if}
  {/if}
</section>

<style>
  .backdrop { z-index: 20; }
  .sheet { z-index: 21; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint, .note { color: var(--ink-faint); font-size: 0.8rem; line-height: 1.45; margin: 6px 4px 12px; }
  .empty { color: var(--ink-dim); font-size: 0.88rem; line-height: 1.55; padding: 18px 10px; }

  .tabs { display: flex; gap: 8px; margin: 8px 0 12px; }
  .tabs button { flex: 1; padding: 8px 10px; border-radius: 999px; font-size: 0.85rem;
    background: transparent; border: 1px solid var(--glass-brd); color: var(--ink-dim); }
  .tabs button.on { color: var(--ink); border-color: color-mix(in srgb, var(--gold) 45%, var(--glass-brd));
    background: color-mix(in srgb, var(--glass) 80%, var(--gold) 8%); }

  .select { width: 100%; margin-bottom: 10px; }
  /* переключатель варг — мельче вкладок: это выбор карты внутри вкладки, не раздел */
  .vargas { display: flex; gap: 6px; margin: 0 0 8px; }
  .vargas button { flex: 1; padding: 6px 8px; border-radius: 10px; font-size: 0.78rem;
    background: transparent; border: 1px solid var(--glass-brd); color: var(--ink-faint); }
  .vargas button.on { color: var(--ink-dim); border-color: color-mix(in srgb, var(--gold) 35%, var(--glass-brd)); }
  /* «ещё…» — редкие варги списком; шире кнопок, чтобы влезла подпись выбранной */
  .vargas .more { flex: 1.7; min-width: 0; padding: 6px 8px; border-radius: 10px;
    font-size: 0.78rem; background: transparent; border: 1px solid var(--glass-brd);
    color: var(--ink-faint); }
  .vargas .more.on { color: var(--ink-dim);
    border-color: color-mix(in srgb, var(--gold) 35%, var(--glass-brd)); }
  .note b { color: var(--ink-dim); font-weight: 500; }
  .card { padding: 10px 12px; margin: 8px 0; }
  .hdr { color: var(--ink-faint); font-size: 0.7rem; text-transform: uppercase;
    letter-spacing: 1px; margin: 16px 4px 4px; }

  .grid { display: flex; flex-direction: column; gap: 8px; }
  .grid > div { display: flex; gap: 10px; align-items: baseline; }
  .k { color: var(--ink-faint); font-size: 0.78rem; min-width: 108px; }
  .v { color: var(--ink); font-size: 0.86rem; line-height: 1.4; }

  .table { padding: 4px 6px; }
  .row { display: grid; grid-template-columns: 3.2rem 1fr 1fr 3.2rem; gap: 6px;
    padding: 7px 6px; align-items: center; font-size: 0.82rem; color: var(--ink); }
  .row + .row { border-top: 1px solid var(--glass-brd); }
  .row.th { color: var(--ink-faint); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; }
  .sky .row { grid-template-columns: 1fr 1fr 1fr; }
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
  .nak { color: var(--ink-dim); font-size: 0.78rem; }

  /* дришти: две колонки — кто смотрит и куда, цели с переносом по ширине */
  .drishti .row { grid-template-columns: 6rem 1fr; align-items: start; }
  .drishti .pn { display: flex; align-items: baseline; gap: 6px; color: var(--ink-dim); }
  .drishti .tg { display: flex; flex-direction: column; gap: 3px; line-height: 1.4; }
  .drishti .under { color: var(--ink-faint); font-size: 0.76rem; }

  .pcard { padding: 10px 12px; }
  .pline { display: flex; align-items: baseline; gap: 8px; }
  .g { color: var(--silver); font-size: 1.1rem; }
  .pname { flex: 1; font-size: 0.92rem; color: var(--ink); }
  .rul { color: var(--ink-faint); font-size: 0.78rem; }
  .ppos { font-size: 0.84rem; color: var(--ink-dim); }
  .psub { color: var(--ink-faint); font-size: 0.78rem; margin-top: 4px; line-height: 1.4; }
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
  .sub { display: flex; justify-content: space-between; gap: 8px; padding: 5px 6px; border-radius: 8px; }
  .sub.cur { background: color-mix(in srgb, var(--glass) 80%, var(--gold) 8%); }
  .sl { color: var(--ink-dim); font-size: 0.8rem; }
  .sd { color: var(--ink-faint); font-size: 0.76rem; }

  .dig { display: flex; align-items: baseline; gap: 8px; padding: 5px 2px; }
  .dn { flex: 1; font-size: 0.86rem; color: var(--ink); }
  .dv { color: var(--ink-dim); font-size: 0.8rem; }
</style>
