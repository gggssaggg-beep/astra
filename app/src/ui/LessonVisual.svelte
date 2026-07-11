<script lang="ts">
  /**
   * Иллюстрации уроков курса (№9 владелицы: «везде где возможно вставляй
   * картинки»). Каждый тип — компактный рисунок ТЕМИ ЖЕ символами, что и всё
   * приложение (Glyph/пути глифов), никаких растров. Подключается из
   * LessonSheet по полю block.visual (id типа).
   */
  import Glyph from './Glyph.svelte';
  import { PLANET_PATHS } from './glyphPaths.ts';
  import { SIGN_PATHS } from './signIcons.ts';
  import { ZODIAC } from '../engine/index.ts';

  let { type }: { type: string } = $props();

  const PLANETS = ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс',
    'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Раху', 'Кету'];
  // стихии: индексы знаков и цвет (как ELEM в колесе)
  const ELEMENTS: { name: string; idx: number[]; color: string }[] = [
    { name: 'Огонь', idx: [0, 4, 8], color: '#ff8a5b' },
    { name: 'Земля', idx: [1, 5, 9], color: '#7fd99a' },
    { name: 'Воздух', idx: [2, 6, 10], color: '#7fd0ff' },
    { name: 'Вода', idx: [3, 7, 11], color: '#b39bff' },
  ];
  const CROSSES: { name: string; hint: string; idx: number[] }[] = [
    { name: 'Кардинальные', hint: 'начинают', idx: [0, 3, 6, 9] },
    { name: 'Фиксированные', hint: 'держат', idx: [1, 4, 7, 10] },
    { name: 'Мутабельные', hint: 'меняются', idx: [2, 5, 8, 11] },
  ];
  const ASPECT_CARDS: { name: string; angle: string; tone: 'h' | 't' | 'n' }[] = [
    { name: 'соединение', angle: '0°', tone: 'n' },
    { name: 'секстиль', angle: '60°', tone: 'h' },
    { name: 'квадрат', angle: '90°', tone: 't' },
    { name: 'трин', angle: '120°', tone: 'h' },
    { name: 'оппозиция', angle: '180°', tone: 't' },
  ];
  // точка на окружности мини-схемы (угол в градусах, 0° = вверх, по часовой)
  const pt = (deg: number, r: number, c: number) => ({
    x: c + r * Math.sin((deg * Math.PI) / 180),
    y: c - r * Math.cos((deg * Math.PI) / 180),
  });
  // мини-фигуры: точки канона на круге r=38, центр 50
  const tri = [0, 120, 240].map((d) => pt(d, 38, 50));
  const tau = [270, 90, 0].map((d) => pt(d, 38, 50));   // A☍B горизонталь + вершина сверху
  const cross = [0, 90, 180, 270].map((d) => pt(d, 38, 50));
  // дома: середины секторов против часовой от Asc (слева), как в натальном колесе
  const housePts = Array.from({ length: 12 }, (_, i) => {
    const mid = 270 - (i + 0.5) * 30;   // экранный угол середины сектора (0°=вверх)
    return { n: i + 1, ...pt(mid, 33, 50) };
  });
</script>

<div class="vis">
{#if type === 'degrees'}
  <!-- позиция в знаке+градусе, как пишет приложение -->
  <div class="signstrip">
    {#each ZODIAC as z, i}
      <span class="ss" class:hl={i === 10} title={z}><Glyph kind="sign" index={i} /></span>
    {/each}
  </div>
  <div class="cap">Круг = 360° = 12 знаков по 30°. Пример: долгота 300°29′ —
    это 10 полных знаков (300°) и ещё 0°29′ → в приложении такая позиция пишется
    <b>0°29′ Водолея</b>.</div>

{:else if type === 'elements'}
  {#each ELEMENTS as el}
    <div class="row">
      <span class="rlbl" style="color:{el.color}">{el.name}</span>
      <span class="glyphs">
        {#each el.idx as i}
          <svg class="sg" viewBox="0 0 24 24" fill="none" style="stroke:{el.color}"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            {#each SIGN_PATHS[i] as d}<path {d} />{/each}
          </svg>
        {/each}
      </span>
      <span class="names">{el.idx.map((i) => ZODIAC[i]).join(' · ')}</span>
    </div>
  {/each}

{:else if type === 'crosses'}
  {#each CROSSES as cr}
    <div class="row">
      <span class="rlbl">{cr.name}</span>
      <span class="glyphs">
        {#each cr.idx as i}
          <svg class="sg" viewBox="0 0 24 24" fill="none" style="stroke:var(--silver)"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            {#each SIGN_PATHS[i] as d}<path {d} />{/each}
          </svg>
        {/each}
      </span>
      <span class="names">{cr.hint}</span>
    </div>
  {/each}

{:else if type === 'planets-row'}
  <div class="pgrid">
    {#each PLANETS as p}
      <span class="pcell"><Glyph kind="planet" name={p} /><em>{p}</em></span>
    {/each}
  </div>

{:else if type === 'aspect-angles'}
  <div class="acards">
    {#each ASPECT_CARDS as a}
      <span class="acard t-{a.tone}">
        <span class="ag"><Glyph kind="aspect" name={a.name} /></span>
        <b>{a.angle}</b><em>{a.name}</em>
      </span>
    {/each}
  </div>
  <div class="cap">Золотые — гармония (помогают), розовые — напряжение (двигают
    через трение), соединение — нейтрально: планеты просто сливают силы.</div>

{:else if type === 'orb-window'}
  <!-- орбис в цифрах: линейка 119–121° -->
  <svg class="ruler" viewBox="0 0 300 58" aria-hidden="true">
    <rect x="20" y="18" width="260" height="14" rx="7" class="band" />
    <line x1="20" y1="12" x2="20" y2="38" class="tick" />
    <line x1="150" y1="8" x2="150" y2="42" class="tick main" />
    <line x1="280" y1="12" x2="280" y2="38" class="tick" />
    <text x="20" y="54" class="tx">119° вход</text>
    <text x="150" y="54" class="tx mid">120° точно</text>
    <text x="280" y="54" class="tx end">121° выход</text>
  </svg>
  <!-- окно аспекта как в карточке приложения: вход → точно → выход -->
  <div class="mock">
    <span class="mpair">
      <Glyph kind="planet" name="Луна" /><span class="masp"><Glyph kind="aspect" name="трин" /></span><Glyph kind="planet" name="Венера" />
    </span>
    <span class="mtimes">14:02 <i>→</i> <b>19:36</b> <i>→</i> 01:12<sup>+1</sup></span>
  </div>
  <div class="cap">Так окно выглядит на карточке: аспект начался днём, точный
    вечером, а закончится уже после полуночи — на следующий день.</div>

{:else if type === 'retro-phases'}
  <div class="phases">
    <span class="ph dim">тень до</span><i>→</i>
    <span class="ph st">станция R</span><i>→</i>
    <span class="ph rx"><Glyph kind="retro" /> ретроград</span><i>→</i>
    <span class="ph st">станция D</span><i>→</i>
    <span class="ph dim">тень после</span>
  </div>

{:else if type === 'nodes-axis'}
  <svg class="mini" viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="60" r="45" class="ring" />
    <line x1="60" y1="28" x2="60" y2="92" class="axis" />
    <g transform="translate(48,3)" class="npath">{#each PLANET_PATHS['Раху'] as d}<path {d} />{/each}</g>
    <g transform="translate(48,93)" class="npath">{#each PLANET_PATHS['Кету'] as d}<path {d} />{/each}</g>
    <text x="70" y="63" class="tx">180°</text>
  </svg>
  <div class="cap">Раху и Кету — всегда точно напротив: одна ось через весь круг.</div>

{:else if type === 'figures-mini'}
  <div class="figs">
    <span class="fig">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="42" class="ring" />
        <path d="M{tri[0].x} {tri[0].y} L{tri[1].x} {tri[1].y} L{tri[2].x} {tri[2].y} Z" class="lh" />
      </svg><em>большой тригон</em>
    </span>
    <span class="fig">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="42" class="ring" />
        <path d="M{tau[0].x} {tau[0].y} L{tau[1].x} {tau[1].y}" class="lt" />
        <path d="M{tau[0].x} {tau[0].y} L{tau[2].x} {tau[2].y} M{tau[1].x} {tau[1].y} L{tau[2].x} {tau[2].y}" class="lt" />
      </svg><em>тау-квадрат</em>
    </span>
    <span class="fig">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="42" class="ring" />
        <path d="M{cross[0].x} {cross[0].y} L{cross[2].x} {cross[2].y} M{cross[1].x} {cross[1].y} L{cross[3].x} {cross[3].y}" class="lt" />
        <path d="M{cross[0].x} {cross[0].y} L{cross[1].x} {cross[1].y} L{cross[2].x} {cross[2].y} L{cross[3].x} {cross[3].y} Z" class="lt thin" />
      </svg><em>большой крест</em>
    </span>
  </div>

{:else if type === 'houses-wheel'}
  <svg class="mini wide" viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="60" r="50" class="ring" />
    <circle cx="60" cy="60" r="22" class="ring faint" />
    {#each Array.from({ length: 12 }, (_, i) => i) as i}
      {@const a = pt(270 - i * 30, 50, 50)}
      {@const b = pt(270 - i * 30, 22, 50)}
      <line x1={a.x + 10} y1={a.y + 10} x2={b.x + 10} y2={b.y + 10} class="spoke" />
    {/each}
    {#each housePts as h}
      <text x={h.x + 10} y={h.y + 10} class="hn">{h.n}</text>
    {/each}
    <text x="4" y="63" class="tx">Asc</text>
    <text x="53" y="9" class="tx">MC</text>
  </svg>
  <div class="cap">12 секторов-домов против часовой от Asc (слева). Куда попала
    планета — в той сфере жизни и работает.</div>

{:else if type === 'read-steps'}
  <div class="steps">
    <span class="step"><Glyph kind="planet" name="Марс" /><em>планета<br/>КТО действует</em></span><i>→</i>
    <span class="step"><Glyph kind="sign" index={4} /><em>знак<br/>КАК себя ведёт</em></span><i>→</i>
    <span class="step">🏠<em>дом<br/>ГДЕ работает</em></span>
  </div>
{/if}
</div>

<style>
  .vis { margin-top: 10px; }
  .cap { margin-top: 8px; color: var(--ink-faint); font-size: 0.82rem; line-height: 1.5; }
  .cap b { color: var(--ink-dim); }
  /* полоса знаков */
  .signstrip { display: flex; flex-wrap: wrap; gap: 4px; font-size: 1.05rem; }
  .ss { display: inline-flex; align-items: center; justify-content: center; width: 1.7em; height: 1.7em;
    border: 1px solid var(--glass-brd); border-radius: 8px; background: #ffffff08; }
  .ss.hl { border-color: var(--accent); box-shadow: 0 0 6px color-mix(in srgb, var(--accent) 55%, transparent); }
  /* строки стихий/крестов */
  .row { display: flex; align-items: center; gap: 10px; padding: 5px 0; font-size: 0.86rem; }
  .rlbl { width: 108px; flex: none; color: var(--ink-dim); font-weight: 600; }
  .glyphs { display: inline-flex; gap: 4px; font-size: 1.05rem; }
  .sg { width: 1.35em; height: 1.35em; overflow: visible; }
  .names { color: var(--ink-faint); font-size: 0.76rem; }
  /* сетка планет */
  .pgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .pcell { display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 1.25rem;
    background: #ffffff08; border: 1px solid var(--glass-brd); border-radius: 10px; padding: 8px 2px; }
  .pcell em { font-style: normal; font-size: 0.66rem; color: var(--ink-faint); }
  /* карточки аспектов */
  .acards { display: flex; flex-wrap: wrap; gap: 8px; }
  .acard { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 58px; flex: 1;
    background: #ffffff08; border: 1px solid var(--glass-brd); border-radius: 10px; padding: 8px 4px; }
  .acard .ag { font-size: 1.3rem; }
  .acard b { font-size: 0.9rem; }
  .acard em { font-style: normal; font-size: 0.64rem; color: var(--ink-faint); }
  .acard.t-h b { color: var(--gold); }
  .acard.t-t b { color: var(--rose); }
  .acard.t-n b { color: var(--silver); }
  /* линейка орбиса */
  .ruler { width: 100%; display: block; }
  .ruler .band { fill: color-mix(in srgb, var(--gold) 14%, transparent); }
  .ruler .tick { stroke: var(--ink-faint); stroke-width: 1.4; }
  .ruler .tick.main { stroke: var(--gold); stroke-width: 2; }
  .tx { fill: var(--ink-faint); font-size: 9px; }
  .ruler .tx { text-anchor: start; }
  .ruler .tx.mid { text-anchor: middle; fill: var(--gold); }
  .ruler .tx.end { text-anchor: end; }
  /* мок карточки окна аспекта */
  .mock { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px;
    background: #ffffff0a; border: 1px solid var(--glass-brd); border-radius: 12px; padding: 10px 12px; }
  .mpair { display: inline-flex; align-items: center; gap: 5px; font-size: 1.15rem; }
  .masp { font-size: 0.95rem; }
  .mtimes { font-family: var(--font-mono, monospace); font-size: 0.88rem; color: var(--ink-dim); white-space: nowrap; }
  .mtimes b { color: var(--gold); }
  .mtimes i { font-style: normal; color: var(--ink-faint); }
  .mtimes sup { font-size: 0.6em; color: var(--ink-faint); }
  /* лента фаз ретро */
  .phases { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 0.78rem; }
  .phases i { font-style: normal; color: var(--ink-faint); }
  .ph { border: 1px solid var(--glass-brd); border-radius: 999px; padding: 4px 10px; color: var(--ink-dim); background: #ffffff08; }
  .ph.dim { opacity: 0.65; }
  .ph.st { border-color: var(--gold); }
  .ph.rx { border-color: var(--gold); background: color-mix(in srgb, var(--gold) 16%, transparent); color: var(--ink); }
  /* мини-схемы на круге */
  .mini { width: 128px; display: block; margin: 0 auto; }
  .mini.wide { width: 150px; }
  .ring { fill: none; stroke: var(--glass-brd); stroke-width: 1.5; }
  .ring.faint { opacity: 0.5; }
  .axis { stroke: var(--ink-faint); stroke-width: 1.2; stroke-dasharray: 4 3; }
  .npath { stroke: var(--silver); stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .figs { display: flex; gap: 8px; justify-content: space-between; }
  .fig { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; }
  .fig svg { width: 100%; max-width: 96px; }
  .fig em { font-style: normal; font-size: 0.68rem; color: var(--ink-faint); text-align: center; }
  .lh { stroke: var(--gold); stroke-width: 2; fill: color-mix(in srgb, var(--gold) 8%, transparent); }
  .lt { stroke: var(--rose); stroke-width: 2; fill: none; }
  .lt.thin { stroke-width: 1; opacity: 0.55; }
  .spoke { stroke: var(--glass-brd); stroke-width: 1; }
  .hn { fill: var(--ink-dim); font-size: 8.5px; text-anchor: middle; dominant-baseline: central; }
  /* шаги чтения карты */
  .steps { display: flex; align-items: stretch; gap: 6px; }
  .steps i { font-style: normal; color: var(--ink-faint); align-self: center; }
  .step { display: flex; flex-direction: column; align-items: center; gap: 4px; flex: 1; font-size: 1.3rem;
    background: #ffffff08; border: 1px solid var(--glass-brd); border-radius: 10px; padding: 10px 4px; }
  .step em { font-style: normal; font-size: 0.66rem; color: var(--ink-faint); text-align: center; line-height: 1.35; }
</style>
