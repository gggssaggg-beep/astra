<script lang="ts">
  import { bottomSheet } from '../lib/sheet.ts';
  import { reveal } from '../lib/reveal.ts';
  import GlowCard from './GlowCard.svelte';

  let { onclose, onInterpretations, onArchetypes, onHouses, onTracked, onJournal, onSignMyths, onChat,
        onPlanetSigns, onPlanetHouses, onDispositors, onPlanetCusps, onDegree, onRetro, onFigures }:
    { onclose: () => void; onInterpretations: () => void; onArchetypes: () => void;
      onHouses: () => void; onTracked: () => void; onJournal: () => void; onSignMyths: () => void;
      onChat: () => void; onPlanetSigns: () => void; onPlanetHouses: () => void;
      onDispositors: () => void; onPlanetCusps: () => void; onDegree: () => void; onRetro: () => void;
      onFigures: () => void } = $props();
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Библиотека" use:bottomSheet={{ onclose }}>
  <header><h2>Библиотека</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>
  <div class="hint">Всё, что можно открыть и прочитать — в одном месте.</div>

  <!-- тап: обводка обегает контур → открытие (единый паттерн GlowCard).
       Список плоский (1 тап до всего), заголовки-капсы .grp только группируют —
       это НЕ аккордеон. Журнал переехал сюда из нижнего меню (просьба 2026-07-06),
       чат — тоже; Сообщество живёт ТОЛЬКО в нижнем меню; Синастрия убрана
       (дублировала «Карты»). -->

  <div class="grp">Мой дневник</div>
  <GlowCard radius={14} onactivate={onJournal}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">📓</span>
      <div class="txt"><b>Журнал</b><small>наблюдения по дням, сравнение заметок</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onTracked}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">★</span>
      <div class="txt"><b>Отслеживаю</b><small>закреплённые пары + аспекты</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>

  <div class="grp">Трактовки</div>
  <GlowCard radius={14} onactivate={onInterpretations}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">📖</span>
      <div class="txt"><b>Значения аспектов</b><small>тексты по парам планет в аспекте + свои</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onPlanetSigns}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">🪐</span>
      <div class="txt"><b>Планеты в знаках</b><small>архетип планеты в мифе знака</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onPlanetHouses}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">🔭</span>
      <div class="txt"><b>Планеты в домах</b><small>архетип планеты в чертогах дома</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onHouses}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">🏠</span>
      <div class="txt"><b>Значения домов</b><small>знак на куспиде каждого дома</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onDispositors}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">👑</span>
      <div class="txt"><b>Управители домов</b><small>диспозитор куспида и дом его положения</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onPlanetCusps}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">📐</span>
      <div class="txt"><b>Аспекты планет к домам</b><small>архетип планеты аспектирует куспид дома</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>

  <div class="grp">Небо сейчас</div>
  <GlowCard radius={14} onactivate={onFigures}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">◆</span>
      <div class="txt"><b>Фигуры дня</b><small>конфигурации аспектов: тригон, тау, парус…</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onRetro}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">℞</span>
      <div class="txt"><b>Ретроградность</b><small>фазы ретро сейчас: тень, станции, ход</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onDegree}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">🔎</span>
      <div class="txt"><b>Поиск градуса</b><small>когда планета проходила заданный градус</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>

  <div class="grp">Мифы</div>
  <GlowCard radius={14} onactivate={onArchetypes}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">🏛</span>
      <div class="txt"><b>Архетипы планет</b><small>миф и архетип на каждую планету</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
  <GlowCard radius={14} onactivate={onSignMyths}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">📜</span>
      <div class="txt"><b>Мифы знаков</b><small>бог на каждый знак зодиака и его грани</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>

  <GlowCard radius={14} onactivate={onChat}>
    <button class="row reveal" use:reveal>
      <span class="ic glyph">💬</span>
      <div class="txt"><b>Чат с Claude</b><small>трактовки по архетипам, на своём ключе</small></div>
      <span class="arr">→</span>
    </button>
  </GlowCard>
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 20; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 21; padding: 16px 16px calc(18px + var(--safe-bottom)); border-radius: 22px 22px 0 0; animation: up 0.34s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .hint { color: var(--ink-faint); font-size: 0.84rem; margin: 4px 0 12px; }
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
