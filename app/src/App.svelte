<script lang="ts">
  import { onMount } from 'svelte';
  import type { Engine, AspectRecord } from './engine/index.ts';
  import { getEngine } from './lib/engineStore.ts';
  import { db, file as dataFile, hydrate } from './lib/db.ts';
  import { hydrateKey } from './lib/secret.ts';
  import { fmtDayMid, todayCivil } from './lib/format.ts';
  import { orbResolver } from './lib/models.ts';
  import { aspectSignature } from './lib/signature.ts';
  import DayScreen from './ui/DayScreen.svelte';
  import DataPanel from './ui/DataPanel.svelte';
  import DateSheet from './ui/DateSheet.svelte';
  import Journal from './ui/Journal.svelte';
  import InterpretationSheet from './ui/InterpretationSheet.svelte';
  import ArchetypesSheet from './ui/ArchetypesSheet.svelte';
  import TrackedSheet from './ui/TrackedSheet.svelte';
  import ChatSheet from './ui/ChatSheet.svelte';
  import LibrarySheet from './ui/LibrarySheet.svelte';
  import InterpretationsSheet from './ui/InterpretationsSheet.svelte';
  import Welcome from './ui/Welcome.svelte';
  import InfoSheet from './ui/InfoSheet.svelte';
  import Starfield from './ui/Starfield.svelte';
  import ScrollThread from './ui/ScrollThread.svelte';
  import type { WheelInfo } from './lib/lore.ts';
  import { syncNotifications } from './lib/notifications.ts';

  let settings = $state(db.settings.get());
  let engine = $state<Engine | null>(null);
  let error = $state<string | null>(null);
  let showData = $state(false);
  let showCal = $state(false);
  let showJournal = $state(false);
  let showArch = $state(false);
  let showTracked = $state(false);
  let showChat = $state(false);
  let showLibrary = $state(false);
  let showInterp = $state(false);
  let selRec = $state<AspectRecord | null>(null);
  let needReconnect = $state(false);
  let showWelcome = $state(false);
  let wheelInfo = $state<WheelInfo | null>(null);
  let chatSeed = $state<string | null>(null);
  // контекст, к которому привязан чат (аспект/объекты) — чтобы сохранить переписку
  // в журнал «в соответствующее место»: с тегами объектов и сигнатурой аспекта.
  let chatSource = $state<{ objects: string[]; aspectSignature?: string; title?: string } | null>(null);

  function dismissWelcome() {
    showWelcome = false;
    db.settings.set({ ...db.settings.get(), seenWelcome: true });
    settings = db.settings.get();
  }
  // открыть чат с готовой затравкой (обсуждение аспекта/планеты по архетипам)
  function openChat(seed: string, source: typeof chatSource = null) {
    chatSeed = seed;
    chatSource = source;
    selRec = null; wheelInfo = null;
    showChat = true;
  }

  // резолвер орбиса (индивидуально по объекту, пара — больший из двух)
  const orbOf = $derived(orbResolver(settings));

  // «Сегодня» — гражданская дата в ВЫБРАННОМ поясе (а не в поясе устройства).
  let date = $state(todayCivil(db.settings.get().tz));
  const isToday = $derived(date.getTime() === todayCivil(settings.tz).getTime());

  function shift(days: number) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    date = d;
  }

  onMount(async () => {
    // durable-данные устройства (Preferences) + встроенные архетипы — ДО UI,
    // чтобы заметки/архетипы/пояс/время уведомлений не «терялись» после перезапуска.
    try {
      await hydrate();
      void hydrateKey();   // ключ Claude из durable-хранилища (не ждём — нужен только чату)
      settings = db.settings.get();
      date = todayCivil(settings.tz);   // дата по сохранённому поясу
      showWelcome = !settings.seenWelcome;
    } catch { /* стартуем с дефолтов */ }

    try { engine = await getEngine('swieph'); reschedule(); }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
    // подхватить файл данных с диска (если доступ уже разрешён — тихо; только веб)
    try {
      const ok = await dataFile.reconnectSilently();
      if (ok) settings = db.settings.get();
      else if (await dataFile.hasSavedHandle()) needReconnect = true;
    } catch { /* нет файла — работаем из браузера */ }
  });

  async function reconnect() {
    try {
      if (await dataFile.reconnectWithPrompt()) { settings = db.settings.get(); needReconnect = false; }
    } catch { /* отказ — оставим как есть */ }
  }

  function reschedule() { if (engine) void syncNotifications(engine, db.settings.get(), db.settings.get().tz); }
  function onPanelChanged() { settings = { ...db.settings.get() }; reschedule(); }

  // тема: ставим data-theme на корень; «авто» — по системной, со слежением
  $effect(() => {
    const apply = () => {
      const dark = settings.theme === 'cosmos' ? true
        : settings.theme === 'dawn' ? false
        : !window.matchMedia('(prefers-color-scheme: light)').matches;
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    if (settings.theme === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  });

  // крупный шрифт — масштаб корня (см. app.css html[data-font='large'])
  $effect(() => {
    document.documentElement.dataset.font = settings.largeFont ? 'large' : 'normal';
  });

  // свайп ТОЛЬКО влево/вправо = соседний день. Вертикальный свайп (прокрутка) — не листает.
  let x0 = 0, y0 = 0;
  const onStart = (e: TouchEvent) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; };
  const onEnd = (e: TouchEvent) => {
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    // листаем только при почти горизонтальном свайпе (в пределах ~22° от горизонтали)
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2.5) shift(dx < 0 ? 1 : -1);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') shift(-1);
    if (e.key === 'ArrowRight') shift(1);
  };
</script>

<svelte:window onkeydown={onKey} />

<Starfield />
{#if engine && !error}<ScrollThread />{/if}

<main ontouchstart={onStart} ontouchend={onEnd}>
  <header class="glass frost">
    <button class="nav" onclick={() => shift(-1)} aria-label="Предыдущий день">‹</button>
    <div class="title">
      <button class="date" onclick={() => (showCal = true)} title="Выбрать дату">{fmtDayMid(date)}</button>
      <button class="today" class:hidden={isToday} onclick={() => (date = todayCivil(settings.tz))}>сегодня</button>
    </div>
    <button class="nav" onclick={() => shift(1)} aria-label="Следующий день">›</button>
  </header>

  {#if needReconnect}
    <button class="reconnect glass" onclick={reconnect}>
      Подключить файл данных на диске (нужен один клик) →
    </button>
  {/if}

  {#if error}
    <div class="state err glass">Ошибка движка: {error}</div>
  {:else if !engine}
    <div class="state glass">Загрузка эфемерид…</div>
  {:else}
    {#key date.getTime()}
      <div class="page">
        <DayScreen {engine} {date} {orbOf} tz={settings.tz} signStyle={settings.signStyle}
          selectedSignature={selRec ? aspectSignature(selRec.p1, selRec.p2, selRec.aspect) : null}
          onAspect={(r) => (selRec = r)} oninfo={(i) => (wheelInfo = i)} />
      </div>
    {/key}
  {/if}
</main>

<nav class="tabbar glass frost" aria-label="Меню">
  <button onclick={() => (showCal = true)} aria-label="Календарь"><span class="ti glyph">📅</span><span class="tl">Дата</span></button>
  <button onclick={() => (showJournal = true)} aria-label="Журнал"><span class="ti glyph">📓</span><span class="tl">Журнал</span></button>
  <button onclick={() => (showLibrary = true)} aria-label="Библиотека"><span class="ti glyph">📚</span><span class="tl">Библиотека</span></button>
  <button onclick={() => (showChat = true)} aria-label="Чат"><span class="ti glyph">💬</span><span class="tl">Чат</span></button>
  <button onclick={() => (showData = true)} aria-label="Настройки"><span class="ti glyph">⚙</span><span class="tl">Настройки</span></button>
</nav>

{#if showData}
  <DataPanel onclose={() => (showData = false)} onchanged={onPanelChanged}
    onhelp={() => { showData = false; showWelcome = true; }} />
{/if}

{#if showLibrary}
  <LibrarySheet onclose={() => (showLibrary = false)}
    onInterpretations={() => { showLibrary = false; showInterp = true; }}
    onArchetypes={() => { showLibrary = false; showArch = true; }}
    onTracked={() => { showLibrary = false; showTracked = true; }} />
{/if}

{#if showInterp}
  <InterpretationsSheet onclose={() => (showInterp = false)}
    onopen={(r) => { showInterp = false; selRec = r; }} />
{/if}

{#if showArch}
  <ArchetypesSheet onclose={() => (showArch = false)} />
{/if}

{#if showTracked}
  <TrackedSheet onclose={() => (showTracked = false)} onopen={(r) => { showTracked = false; selRec = r; }} />
{/if}

{#if showCal}
  <DateSheet {date} today={todayCivil(settings.tz)} onpick={(d) => { date = d; showCal = false; }} onclose={() => (showCal = false)} />
{/if}

{#if showJournal}
  <Journal {date} onclose={() => (showJournal = false)} />
{/if}

{#if selRec && engine}
  <InterpretationSheet rec={selRec} {engine} {date} tz={settings.tz} onclose={() => (selRec = null)}
    ongoto={(d) => { date = d; selRec = null; }}
    ondiscuss={(r) => openChat(`Обсудим аспект ${r.p1} ${r.aspect} ${r.p2}. Опираясь на заложенные `
      + `в приложении архетипы участников — что это сочетание значит и на что обратить внимание?`,
      { objects: [r.p1, r.p2], aspectSignature: aspectSignature(r.p1, r.p2, r.aspect), title: `${r.p1} ${r.aspect} ${r.p2}` })} />
{/if}

{#if wheelInfo}
  <InfoSheet info={wheelInfo} onclose={() => (wheelInfo = null)} ondiscuss={openChat} />
{/if}

{#if showWelcome}
  <Welcome onclose={dismissWelcome} />
{/if}

{#if showChat && engine}
  <ChatSheet {engine} {date} tz={settings.tz} {orbOf} seed={chatSeed} source={chatSource}
    onclose={() => { showChat = false; chatSeed = null; chatSource = null; }} />
{/if}

<style>
  main {
    max-width: 560px; margin: 0 auto; min-height: 100%;
    padding: calc(12px + env(safe-area-inset-top)) 12px calc(74px + env(safe-area-inset-bottom));
  }
  header {
    position: sticky; top: calc(8px + env(safe-area-inset-top)); z-index: 5;
    display: flex; align-items: center; gap: 6px; padding: 8px 10px; margin-bottom: 6px;
  }
  .nav { background: transparent; border: none; font-size: 1.8rem; line-height: 1; width: 40px; height: 44px; border-radius: 12px; color: var(--ink-dim); }
  .nav:hover { background: #ffffff14; color: var(--ink); }
  .title { flex: 1; text-align: center; }
  .date { font-family: var(--font-display); font-size: 1.0rem; font-weight: 600; letter-spacing: 0.2px; text-transform: capitalize; background: transparent; border: none; color: inherit; padding: 2px 6px; border-radius: 8px; }
  .date:hover { background: #ffffff14; }
  .today { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink-dim); border-radius: 999px; padding: 2px 12px; font-size: 0.72rem; margin-top: 4px; }
  .today.hidden { visibility: hidden; }
  .tabbar {
    position: fixed; left: 50%; bottom: 0; transform: translateX(-50%);
    width: min(560px, 100%); z-index: 10; display: flex; justify-content: space-around;
    gap: 4px; padding: 6px 8px calc(6px + env(safe-area-inset-bottom)); border-radius: 18px 18px 0 0;
  }
  .tabbar button { flex: 1; background: transparent; border: none; color: var(--ink-dim);
    display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; border-radius: 12px; }
  .tabbar button:hover { background: #ffffff14; color: var(--ink); }
  .tabbar .ti { font-size: 1.25rem; line-height: 1; }
  .tabbar .tl { font-size: 0.6rem; letter-spacing: 0.2px; font-family: var(--font-mono); }
  .reconnect { display: block; width: 100%; text-align: left; padding: 10px 14px; margin-bottom: 6px; color: var(--gold); border: none; font-size: 0.86rem; }
  .state { padding: 24px; text-align: center; color: var(--ink-dim); margin-top: 20px; }
  .state.err { color: var(--rose); }
  .page { animation: fade 0.25s ease; }
  @keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
</style>
