<script lang="ts">
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import GlowCard from './GlowCard.svelte';
  import Icon from './Icon.svelte';

  let { onclose, onCourse, onInterpretations, onArchetypes, onHouses, onTracked, onJournal, onSignMyths,
        onPlanetSigns, onPlanetHouses, onDispositors, onPlanetCusps, onDegree, onRetro, onFigures,
        onUpaya, vedic = false }:
    { onclose: () => void; onCourse: () => void; onInterpretations: () => void; onArchetypes: () => void;
      onHouses: () => void; onTracked: () => void; onJournal: () => void; onSignMyths: () => void;
      onPlanetSigns: () => void; onPlanetHouses: () => void;
      onDispositors: () => void; onPlanetCusps: () => void; onDegree: () => void; onRetro: () => void;
      onFigures: () => void; onUpaya: () => void; vedic?: boolean } = $props();
</script>

<div class="backdrop sheet-backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Библиотека" use:bottomSheet={{ onclose }}>
  <header><h2>Библиотека</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">Всё, что можно открыть и прочитать — в одном месте.</div>

  <!-- тап: обводка обегает контур → открытие (единый паттерн GlowCard).
       Список плоский (1 тап до всего), заголовки-капсы .grp только группируют —
       это НЕ аккордеон. Журнал переехал сюда из нижнего меню (просьба 2026-07-06);
       Сообщество живёт ТОЛЬКО в нижнем меню; Синастрия убрана (дублировала
       «Карты»); «Чат с Claude» убран 2026-07-25 — снят до доработки. -->

  <!-- джйотиш — ПЕРВЫМ в ведическом режиме (в западном пункта нет: тропический
       движок дал бы карте D1 неверные знаки). Остальные разделы — западная
       школа, о чём честно сказано строкой ниже -->
  {#if vedic}
    <div class="grp">Джйотиш</div>
    <div class="libnote">Разбор своей карты — во вкладке «Карты»: там кундали, дома,
      периоды и важные даты. Здесь — общий справочник.</div>
    <GlowCard radius={14} onactivate={onUpaya}>
      <button class="row reveal" use:reveal>
        <span class="ic"><Icon name="diamond" /></span>
        <div class="txt"><b>Мантры и камни</b><small>упайи девяти грах — справочник</small></div>
        <span class="arr">→</span>
      </button>
    </GlowCard>
  {/if}

  <!-- курс написан про западную астрологию — в джйотише не показываем -->
  {#if !vedic}
  <div class="grp">Учусь</div>
  <GlowCard radius={14} onactivate={onCourse}>
    <button class="row reveal" use:reveal>
      <span class="ic"><Icon name="school" /></span>
      <div class="txt"><b>Астрология с нуля</b><small>8 коротких уроков от колеса до своей карты</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  {/if}

  <div class="grp">Мой дневник</div>
  <GlowCard radius={14} onactivate={onJournal}>
    <button class="row reveal" use:reveal>
      <span class="ic"><Icon name="notebook" /></span>
      <div class="txt"><b>Журнал</b><small>наблюдения по дням, сравнение заметок</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onTracked}>
    <button class="row reveal" use:reveal>
      <span class="ic"><Icon name="star" /></span>
      <div class="txt"><b>Отслеживаю</b><small>закреплённые пары + аспекты</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>

  <!-- весь блок трактовок — западная школа: орбисные аспекты, куспиды,
       авторская раскладка управителей. В джйотише вместо него свои
       тексты внутри «Ведической карты» -->
  {#if !vedic}
  <div class="grp">Трактовки</div>
  <GlowCard radius={14} onactivate={onInterpretations}>
    <button class="row reveal" use:reveal>
      <span class="ic"><Icon name="book2" /></span>
      <div class="txt"><b>Значения аспектов</b><small>тексты по парам планет в аспекте + свои</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onPlanetSigns}>
    <button class="row reveal" use:reveal>
      <span class="ic"><Icon name="planet" /></span>
      <div class="txt"><b>Планеты в знаках</b><small>архетип планеты в мифе знака</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onPlanetHouses}>
    <button class="row reveal" use:reveal>
      <span class="ic"><Icon name="telescope" /></span>
      <div class="txt"><b>Планеты в домах</b><small>архетип планеты в чертогах дома</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onHouses}>
    <button class="row reveal" use:reveal>
      <span class="ic"><Icon name="home" /></span>
      <div class="txt"><b>Значения домов</b><small>знак на куспиде каждого дома</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onDispositors}>
    <button class="row reveal" use:reveal>
      <span class="ic"><Icon name="crown" /></span>
      <div class="txt"><b>Управители домов</b><small>диспозитор куспида и дом его положения</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onPlanetCusps}>
    <button class="row reveal" use:reveal>
      <span class="ic"><Icon name="angle" /></span>
      <div class="txt"><b>Аспекты планет к домам</b><small>архетип планеты аспектирует куспид дома</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>

  {/if}

  <!-- фигуры и ретро-фазы считаются по орбисам — западное; поиск градуса
       работает в обеих школах, поэтому остаётся -->
  <div class="grp">Небо сейчас</div>
  {#if !vedic}
  <GlowCard radius={14} onactivate={onFigures}>
    <button class="row reveal" use:reveal>
      <span class="ic"><Icon name="diamond" /></span>
      <div class="txt"><b>Фигуры дня</b><small>конфигурации аспектов: тригон, тау, парус…</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onRetro}>
    <button class="row reveal" use:reveal>
      <span class="ic"><Icon name="arrow-back" /></span>
      <div class="txt"><b>Ретроградность</b><small>фазы ретро сейчас: тень, станции, ход</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  {/if}
  <GlowCard radius={14} onactivate={onDegree}>
    <button class="row reveal" use:reveal>
      <span class="ic"><Icon name="search" /></span>
      <div class="txt"><b>Поиск градуса</b><small>когда планета проходила заданный градус</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>

  <div class="grp">Мифы</div>

  <GlowCard radius={14} onactivate={onArchetypes}>
    <button class="row reveal" use:reveal>
      <span class="ic"><Icon name="columns" /></span>
      <div class="txt"><b>{vedic ? 'Архетипы грах' : 'Архетипы планет'}</b><small>{vedic
        ? 'наваграха: Сурья, Чандра, Мангала и другие' : 'миф и архетип на каждую планету'}</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <!-- мифы знаков — авторская западная раскладка богов; в джйотише знаками
       владеют классические управители, эта раскладка там неверна -->
  {#if !vedic}
  <GlowCard radius={14} onactivate={onSignMyths}>
    <button class="row reveal" use:reveal>
      <span class="ic"><Icon name="scroll" /></span>
      <div class="txt"><b>Мифы знаков</b><small>бог на каждый знак зодиака и его грани</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  {/if}

</section>

<style>
  /* геометрия/бэкдроп — глобальные .sheet-base/.sheet-backdrop (app.css); тут только z-index */
  .backdrop { z-index: 20; }
  .sheet { z-index: 21; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.84rem; margin: 4px 0 12px; }
  .libnote { color: var(--ink-faint); font-size: 0.76rem; line-height: 1.45; margin: 2px 4px 8px; }
  .grp { color: var(--accent); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px;
    font-weight: 600; margin: 12px 2px 6px; }
  .row { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
    background: #ffffff0c; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 14px; padding: 14px; margin-bottom: 10px; }
  .row:hover { background: #ffffff16; }
  .ic { font-size: 1.4rem; width: 1.8rem; text-align: center; color: var(--gold); }
  .txt { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .txt b { font-family: var(--font-display); font-weight: 600; letter-spacing: 0.2px; }
  .txt small { color: var(--ink-faint); font-size: 0.78rem; }
  .arr { color: var(--ink-faint); }
</style>
