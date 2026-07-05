<script lang="ts">
  import { onMount } from 'svelte';
  import { Capacitor, registerPlugin } from '@capacitor/core';
  import { App as CapApp } from '@capacitor/app';
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
  import ChartsSheet from './ui/ChartsSheet.svelte';
  import ChatSheet from './ui/ChatSheet.svelte';
  import LibrarySheet from './ui/LibrarySheet.svelte';
  import InterpretationsSheet from './ui/InterpretationsSheet.svelte';
  import CommunitySheet from './ui/CommunitySheet.svelte';
  import Welcome from './ui/Welcome.svelte';
  import InfoSheet from './ui/InfoSheet.svelte';
  import Starfield from './ui/Starfield.svelte';
  import ScrollThread from './ui/ScrollThread.svelte';
  import type { WheelInfo } from './lib/lore.ts';
  import { rescheduleAll, onNotificationTap } from './lib/reminders.ts';
  import { fontStack } from './lib/fonts.ts';
  import { tick as buzzTick } from './lib/haptics.ts';

  let settings = $state(db.settings.get());
  let engine = $state<Engine | null>(null);
  let error = $state<string | null>(null);
  let showData = $state(false);
  let showCal = $state(false);
  let showJournal = $state(false);
  let showArch = $state(false);
  let showTracked = $state(false);
  let showCharts = $state<false | { mode?: 'transitNatal' | 'triple' | 'synastry' }>(false);
  let showChat = $state(false);
  let showLibrary = $state(false);
  let showInterp = $state(false);
  let showCommunity = $state<false | { signature?: string; title?: string }>(false);
  let selRec = $state<AspectRecord | null>(null);
  // Просмотренный аспект ОСТАЁТСЯ выделенным после закрытия трактовки (линия в
  // колесе + кромка карточки) — «пользователь знает, что смотрел». Сбрасывается
  // только выбором другого аспекта.
  let selSig = $state<string | null>(null);
  // откуда открыт аспект: закрытие возвращает «на пункт выше», а не на главный
  let selFrom = $state<'day' | 'interp' | 'tracked'>('day');
  function pickAspect(r: AspectRecord, from: 'day' | 'interp' | 'tracked' = 'day') {
    selRec = r;
    selSig = aspectSignature(r.p1, r.p2, r.aspect);
    selFrom = from;
  }
  function closeAspect() {
    selRec = null;   // selSig НЕ трогаем — выделение остаётся
    if (selFrom === 'interp') showInterp = true;
    else if (selFrom === 'tracked') showTracked = true;
    selFrom = 'day';
  }
  let needReconnect = $state(false);
  let showWelcome = $state(false);
  // открыта ли хоть одна шторка (событие из lib/sheet.ts) — прячем фоновую
  // scroll-нить, чтобы она не просвечивала поверх затемнения под шторкой
  let sheetsOpen = $state(false);
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

  // направление последнего листания — страница дня въезжает с нужной стороны
  let slideDir = $state(0);
  function shift(days: number) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    slideDir = Math.sign(days);
    date = d;
    buzzTick();                                    // лёгкий «щелчок» перелистывания
    window.scrollTo({ top: 0, behavior: 'smooth' }); // новый день — с начала ленты
  }
  function goToday() {
    slideDir = date.getTime() > todayCivil(settings.tz).getTime() ? -1 : 1;
    date = todayCivil(settings.tz);
    buzzTick();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // следим за открытием/закрытием любых шторок (ref-count в lib/sheet.ts)
  $effect(() => {
    const h = (e: Event) => { sheetsOpen = (e as CustomEvent).detail > 0; };
    document.addEventListener('astra:sheets', h);
    return () => document.removeEventListener('astra:sheets', h);
  });

  // Аппаратная кнопка/жест «Назад» на Android: закрываем ВЕРХНЮЮ открытую шторку,
  // а не выходим из приложения. Если ничего не открыто — сворачиваем (не убиваем).
  function onBack() {
    if (selRec) { closeAspect(); return; }
    if (wheelInfo) { wheelInfo = null; return; }
    if (showChat) { showChat = false; chatSeed = null; chatSource = null; return; }
    if (showCommunity) { showCommunity = false; return; }
    if (showInterp) { showInterp = false; showLibrary = true; return; }
    if (showArch) { showArch = false; showLibrary = true; return; }
    if (showTracked) { showTracked = false; showLibrary = true; return; }
    if (showCharts) { showCharts = false; return; }
    if (showCal) { showCal = false; return; }
    if (showJournal) { showJournal = false; return; }
    if (showLibrary) { showLibrary = false; return; }
    if (showData) { showData = false; return; }
    if (showWelcome) return;               // приветствие не закрываем «назад»
    void CapApp.minimizeApp();
  }

  // тап по уведомлению: открыть день аспекта на главном и ВЫДЕЛИТЬ этот аспект
  function openFromNotification(info: { dayAnchor?: string; signature?: string }) {
    showData = showJournal = showLibrary = showInterp = showArch = showTracked = showChat = false;
    showCharts = false; showCommunity = false; selRec = null; wheelInfo = null;
    if (info.dayAnchor) { const d = new Date(info.dayAnchor); if (!isNaN(d.getTime())) date = d; }
    if (info.signature) selSig = info.signature;
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  onMount(async () => {
    if (Capacitor.isNativePlatform()) {
      void CapApp.addListener('backButton', onBack);
    }
    onNotificationTap(openFromNotification);
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

  function reschedule() { if (engine) void rescheduleAll(engine, db.settings.get(), db.settings.get().tz); }
  function onPanelChanged() { settings = { ...db.settings.get() }; reschedule(); }

  // тема: ставим data-theme на корень; «авто» — по системной, со слежением.
  // Статус-бар Android: иконки часов должны читаться на НАШЕМ фоне (тема
  // приложения может не совпадать с системной) — стиль шлём через встроенный
  // SystemBars ('DARK' = светлые иконки). Старый APK без SystemBars — тихий no-op.
  $effect(() => {
    const apply = () => {
      const dark = settings.theme === 'cosmos' ? true
        : settings.theme === 'dawn' ? false
        : !window.matchMedia('(prefers-color-scheme: light)').matches;
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      if (Capacitor.isNativePlatform()) {
        registerPlugin<{ setStyle(o: { style: string }): Promise<void> }>('SystemBars')
          .setStyle({ style: dark ? 'DARK' : 'LIGHT' })
          .catch(() => { /* старый APK */ });
      }
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

  // выбранный шрифт интерфейса — переопределяем --font-body на корне
  $effect(() => {
    document.documentElement.style.setProperty('--font-body', fontStack(settings.font ?? 'default'));
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
{#if engine && !error && !sheetsOpen}<ScrollThread />{/if}

<main ontouchstart={onStart} ontouchend={onEnd}>
  <header class="glass frost">
    <button class="nav" onclick={() => shift(-1)} aria-label="Предыдущий день">‹</button>
    <div class="title">
      <button class="date" onclick={() => (showCal = true)} title="Выбрать дату">{fmtDayMid(date)}</button>
      <button class="today" class:hidden={isToday} onclick={goToday}>сегодня</button>
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
      <div class="page" class:from-right={slideDir > 0} class:from-left={slideDir < 0}>
        <DayScreen {engine} {date} {orbOf} tz={settings.tz} objects={settings.objects} signStyle={settings.signStyle}
          selectedSignature={selSig} selectedInfo={wheelInfo}
          onAspect={(r) => { pickAspect(r); buzzTick(); }} oninfo={(i) => { wheelInfo = i; buzzTick(); }} />
      </div>
    {/key}
  {/if}
</main>

<!-- Дата открывается тапом по дате в шапке; чат переехал в Библиотеку (просьба
     владелицы 2026-07-02) — в нижнем меню его место заняло Сообщество. -->
<nav class="tabbar glass frost" aria-label="Меню">
  <button onclick={() => (showLibrary = true)} aria-label="Библиотека"><span class="ti glyph">📚</span><span class="tl">Библиотека</span></button>
  <button onclick={() => (showJournal = true)} aria-label="Журнал"><span class="ti glyph">📓</span><span class="tl">Журнал</span></button>
  <button class="mid" onclick={() => (showCharts = {})} aria-label="Добавить"><span class="ti glyph">👥</span><span class="tl">Добавить</span></button>
  <button onclick={() => (showCommunity = {})} aria-label="Сообщество"><span class="ti glyph">✧</span><span class="tl">Сообщество</span></button>
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
    onTracked={() => { showLibrary = false; showTracked = true; }}
    onSynastry={() => { showLibrary = false; showCharts = { mode: 'synastry' }; }}
    onChat={() => { showLibrary = false; showChat = true; }} />
{/if}

<!-- закрытие разделов библиотеки возвращает В БИБЛИОТЕКУ (пункт выше), не на главный -->
{#if showInterp}
  <InterpretationsSheet onclose={() => { showInterp = false; showLibrary = true; }}
    onopen={(r) => { showInterp = false; pickAspect(r, 'interp'); }} />
{/if}

{#if showArch}
  <ArchetypesSheet onclose={() => { showArch = false; showLibrary = true; }} />
{/if}

{#if showTracked}
  <TrackedSheet onclose={() => { showTracked = false; showLibrary = true; }}
    onopen={(r) => { showTracked = false; pickAspect(r, 'tracked'); }} />
{/if}

{#if showCharts && engine}
  <ChartsSheet {engine} {orbOf} signStyle={settings.signStyle} defaultTz={settings.tz}
    tz={settings.tz} objects={settings.objects} houseSystem={settings.houseSystem}
    initialMode={showCharts.mode ?? 'transitNatal'}
    onchat={(seed, source) => openChat(seed, source)}
    oncommunity={(sig, title) => { showCommunity = { signature: sig, title }; }}
    onclose={() => (showCharts = false)} />
{/if}

{#if showCommunity}
  <CommunitySheet signature={showCommunity.signature} title={showCommunity.title}
    onclose={() => (showCommunity = false)} />
{/if}

{#if showCal}
  <DateSheet {date} today={todayCivil(settings.tz)}
    onpick={(d) => { slideDir = Math.sign(d.getTime() - date.getTime()); date = d; showCal = false; buzzTick();
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' })); }}
    onclose={() => (showCal = false)} />
{/if}

{#if showJournal}
  <Journal {date} tz={settings.tz} onclose={() => (showJournal = false)} />
{/if}

{#if selRec && engine}
  <InterpretationSheet rec={selRec} {engine} {date} tz={settings.tz} {orbOf} onclose={closeAspect}
    oncommunity={(sig, title) => { selRec = null; selFrom = 'day'; showCommunity = { signature: sig, title }; }}
    ongoto={(d) => { date = d; selRec = null; selFrom = 'day'; }}
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
    padding: calc(12px + var(--safe-top)) 12px calc(74px + var(--safe-bottom));
  }
  header {
    position: sticky; top: calc(8px + var(--safe-top)); z-index: 5;
    display: flex; align-items: center; gap: 6px; padding: 8px 10px; margin-bottom: 6px;
  }
  .nav { background: transparent; border: none; font-size: 1.8rem; line-height: 1; width: 40px; height: 44px; border-radius: 12px; color: var(--ink-dim); }
  .nav:hover { background: #ffffff14; color: var(--ink); }
  .title { flex: 1; text-align: center; }
  .date { font-family: var(--font-display); font-size: 1.0rem; font-weight: 600; letter-spacing: 0.2px; text-transform: capitalize; background: transparent; border: none; color: inherit; padding: 2px 6px; border-radius: 8px; }
  .date:hover { background: #ffffff14; }
  .today { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink-dim); border-radius: 999px; padding: 2px 12px; font-size: 0.72rem; margin-top: 4px;
    opacity: 1; transition: opacity 0.2s ease; }
  .today.hidden { opacity: 0; pointer-events: none; }
  .tabbar {
    position: fixed; left: 50%; bottom: 0; transform: translateX(-50%);
    width: min(560px, 100%); z-index: 10; display: flex; justify-content: space-around;
    gap: 4px; padding: 6px 8px calc(6px + var(--safe-bottom)); border-radius: 18px 18px 0 0;
  }
  .tabbar button { flex: 1; background: transparent; border: none; color: var(--ink-dim);
    display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; border-radius: 12px; }
  .tabbar button:hover { background: #ffffff14; color: var(--ink); }
  .tabbar .ti { font-size: 1.25rem; line-height: 1; }
  /* «Добавить» — центральная, главная точка входа: акцент + чуть крупнее */
  .tabbar .mid .ti { color: var(--accent); font-size: 1.5rem; }
  .tabbar .mid .tl { color: var(--accent); }
  .tabbar .tl { font-size: 0.7rem; letter-spacing: 0.2px; font-family: var(--font-mono); }
  .reconnect { display: block; width: 100%; text-align: left; padding: 10px 14px; margin-bottom: 6px; color: var(--gold); border: none; font-size: 0.86rem; }
  .state { padding: 24px; text-align: center; color: var(--ink-dim); margin-top: 20px; }
  .state.err { color: var(--rose); }
  .page { animation: fade 0.25s ease; }
  /* листание дня: новая страница въезжает со стороны жеста (главный жест приложения) */
  .page.from-right { animation: slide-r 0.28s cubic-bezier(0.215, 0.61, 0.355, 1); }
  .page.from-left { animation: slide-l 0.28s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes slide-r { from { opacity: 0; transform: translateX(26px); } to { opacity: 1; transform: none; } }
  @keyframes slide-l { from { opacity: 0; transform: translateX(-26px); } to { opacity: 1; transform: none; } }
</style>
