<script lang="ts">
  import { onMount } from 'svelte';
  import { Capacitor, registerPlugin } from '@capacitor/core';
  import { App as CapApp } from '@capacitor/app';
  import type { Engine, AspectRecord } from './engine/index.ts';
  import { getEngine } from './lib/engineStore.ts';
  import { db, file as dataFile, hydrate } from './lib/db.ts';
  import { hydrateKey } from './lib/secret.ts';
  import { todayCivil, zonedDayStartUTC } from './lib/format.ts';
  import { orbResolver } from './lib/models.ts';
  import { aspectSignature } from './lib/signature.ts';
  import { aspectsOnCached } from './lib/dayCache.ts';
  import DayScreen from './ui/DayScreen.svelte';
  import DataPanel from './ui/DataPanel.svelte';
  import DateSheet from './ui/DateSheet.svelte';
  import Journal from './ui/Journal.svelte';
  import InterpretationSheet from './ui/InterpretationSheet.svelte';
  import ArchetypesSheet from './ui/ArchetypesSheet.svelte';
  import TrackedSheet from './ui/TrackedSheet.svelte';
  import SignMythsSheet from './ui/SignMythsSheet.svelte';
  import ChartsSheet from './ui/ChartsSheet.svelte';
  import AstrologerSheet from './ui/AstrologerSheet.svelte';
  import ChatSheet from './ui/ChatSheet.svelte';
  import LibrarySheet from './ui/LibrarySheet.svelte';
  import InterpretationsSheet from './ui/InterpretationsSheet.svelte';
  import HousesSheet from './ui/HousesSheet.svelte';
  import PlanetSignsSheet from './ui/PlanetSignsSheet.svelte';
  import PlanetHousesSheet from './ui/PlanetHousesSheet.svelte';
  import DispositorsSheet from './ui/DispositorsSheet.svelte';
  import PlanetCuspsSheet from './ui/PlanetCuspsSheet.svelte';
  import DegreeSearchSheet from './ui/DegreeSearchSheet.svelte';
  import RetroSheet from './ui/RetroSheet.svelte';
  import FiguresSheet from './ui/FiguresSheet.svelte';
  import CommunitySheet from './ui/CommunitySheet.svelte';
  import Welcome from './ui/Welcome.svelte';
  import InfoSheet from './ui/InfoSheet.svelte';
  import GlossarySheet from './ui/GlossarySheet.svelte';
  import { glossState, closeGloss } from './lib/studyStore.svelte.ts';
  import type { GlossSheet } from './lib/glossary.ts';
  import Starfield from './ui/Starfield.svelte';
  import ScrollThread from './ui/ScrollThread.svelte';
  import type { WheelInfo } from './lib/lore.ts';
  import { rescheduleAll, onNotificationTap, notifyNewVersion } from './lib/reminders.ts';
  import { initPush } from './lib/push.ts';
  import { watchLowBattery } from './lib/battery.ts';
  import { resumeOta, appliedVersion } from './lib/ota.ts';
  import { Preferences } from '@capacitor/preferences';
  import { clientChartsUnread } from './lib/community.ts';
  import { fontStack } from './lib/fonts.ts';
  import { tick as buzzTick } from './lib/haptics.ts';

  let settings = $state(db.settings.get());
  let engine = $state<Engine | null>(null);
  let error = $state<string | null>(null);
  let showData = $state(false);
  let showCal = $state(false);
  // Библиотечные шторки (дети «Библиотеки») — ОДИН переключатель вместо 13
  // отдельных флагов. Открытие закрывает меню; закрытие/«Назад» возвращает В
  // БИБЛИОТЕКУ (пункт выше). Открыта может быть только одна — как и раньше.
  type LibKey = 'journal' | 'arch' | 'houses' | 'planetSigns' | 'planetHouses'
    | 'dispositors' | 'planetCusps' | 'degree' | 'retro' | 'figures'
    | 'tracked' | 'signMyths' | 'interp';
  let libSheet = $state<LibKey | null>(null);
  const openLib = (k: LibKey) => { showLibrary = false; libSheet = k; };
  const closeLib = () => { libSheet = null; showLibrary = true; };
  let showCharts = $state<false | { mode?: 'transitNatal' | 'triple' | 'synastry' }>(false);
  let clientChartsWaiting = $state(0);   // бейдж «Карты»: новые карты от клиентов (только у астролога)
  let showChat = $state(false);
  let showAstrologer = $state(false);
  let showLibrary = $state(false);
  let showCommunity = $state<false | { signature?: string; title?: string }>(false);
  // ссылки на шторки — Android «Назад» шагает по их внутренней навигации
  let communityRef = $state<{ stepBack: () => boolean } | undefined>(undefined);
  let chartsRef = $state<{ stepBack: () => boolean } | undefined>(undefined);
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
    if (selFrom === 'interp') libSheet = 'interp';
    else if (selFrom === 'tracked') libSheet = 'tracked';
    selFrom = 'day';
  }
  let needReconnect = $state(false);
  let showWelcome = $state(false);
  // открыта ли хоть одна шторка (событие из lib/sheet.ts) — прячем фоновую
  // scroll-нить, чтобы она не просвечивала поверх затемнения под шторкой
  let sheetsOpen = $state(false);
  let wheelInfo = $state<WheelInfo | null>(null);
  // Мостик колесо → карточка: если тапнутая линия аспекта есть в списке дня,
  // даём в InfoSheet кнопку «Открыть карточку аспекта →» (полная шторка с
  // временами). Ищем в том же кэше дня, что считает DayScreen — бесплатно.
  const wheelAspectRec = $derived.by<AspectRecord | null>(() => {
    if (!engine || wheelInfo?.kind !== 'aspect') return null;
    const dayStart = zonedDayStartUTC(date, settings.tz);
    const day = aspectsOnCached(engine, dayStart, orbOf, settings.objects);
    const sig = aspectSignature(wheelInfo.p1, wheelInfo.p2, wheelInfo.aspect);
    return [...day.moon, ...day.fast, ...day.slow]
      .find((r) => aspectSignature(r.p1, r.p2, r.aspect) === sig) ?? null;
  });
  let chatSeed = $state<string | null>(null);
  // контекст, к которому привязан чат (аспект/объекты) — чтобы сохранить переписку
  // в журнал «в соответствующее место»: с тегами объектов и сигнатурой аспекта.
  let chatSource = $state<{ objects: string[]; aspectSignature?: string; title?: string; selfContained?: boolean } | null>(null);

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

  // «Подробнее →» из глоссария: закрыть «?» и открыть соответствующую шторку
  // (мишени — уже существующие; ничего нового не заводим)
  function openGlossTarget(target: GlossSheet) {
    closeGloss();
    switch (target) {
      case 'library': showLibrary = true; break;
      case 'interpretations': openLib('interp'); break;
      case 'houses': openLib('houses'); break;
      case 'archetypes': openLib('arch'); break;
      case 'signMyths': openLib('signMyths'); break;
      case 'retro': openLib('retro'); break;
      case 'figures': openLib('figures'); break;
      case 'dispositors': openLib('dispositors'); break;
      case 'planetCusps': openLib('planetCusps'); break;
      case 'degree': openLib('degree'); break;
      case 'charts': showCharts = {}; break;
      case 'chartsSynastry': showCharts = { mode: 'synastry' }; break;
      case 'settings': showData = true; break;
    }
  }

  // резолвер орбиса (индивидуально по объекту, пара — больший из двух)
  const orbOf = $derived(orbResolver(settings));

  // «Сегодня» — гражданская дата в ВЫБРАННОМ поясе (а не в поясе устройства).
  let date = $state(todayCivil(db.settings.get().tz));
  const isToday = $derived(date.getTime() === todayCivil(settings.tz).getTime());
  // подпись даты в шапке: месяц полностью, год ТОЛЬКО если не текущий —
  // «строка с датой перегружена» (жалоба владелицы, разгрузка шапки)
  const dateLabel = $derived.by(() => {
    const y = date.getUTCFullYear();
    const sameYear = y === todayCivil(settings.tz).getUTCFullYear();
    // с чужим годом месяц короткий + год ДВУМЯ цифрами («13 мар ’06, пт») —
    // полный «2006» не влезал в шапку (жалоба владелицы 2026-07-07)
    const dm = new Intl.DateTimeFormat('ru-RU',
      { timeZone: 'UTC', day: 'numeric', month: sameYear ? 'long' : 'short' }).format(date);
    const wd = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'short' }).format(date);
    const yy = String(y % 100).padStart(2, '0');
    return sameYear ? `${dm}, ${wd}` : `${dm} ’${yy}, ${wd}`;
  });

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
    if (glossState.key) { closeGloss(); return; }   // «?» — самый верхний слой
    if (selRec) { closeAspect(); return; }
    if (wheelInfo) { wheelInfo = null; return; }
    if (showAstrologer) { showAstrologer = false; return; }
    if (showChat) { showChat = false; chatSeed = null; chatSource = null; return; }
    if (showCommunity) {
      // внутри Сообщества «Назад» идёт на шаг выше (профиль → тред → лента),
      // и только с ленты закрывает шторку
      if (!communityRef?.stepBack()) showCommunity = false;
      return;
    }
    if (libSheet) { closeLib(); return; }
    if (showCharts) {
      // из открытой карты/формы «Назад» = стрелочка ← (на список), не закрытие
      if (!chartsRef?.stepBack()) showCharts = false;
      return;
    }
    if (showCal) { showCal = false; return; }
    if (showLibrary) { showLibrary = false; return; }
    if (showData) { showData = false; return; }
    if (showWelcome) {
      // первое приветствие «назад» не закрывает; повторный просмотр — закрывает
      if (db.settings.get().seenWelcome) showWelcome = false;
      return;
    }
    void CapApp.minimizeApp();
  }

  // тап по уведомлению: открыть день аспекта на главном и ВЫДЕЛИТЬ этот аспект
  function openFromNotification(info: { dayAnchor?: string; signature?: string }) {
    showData = showLibrary = showChat = false;
    libSheet = null;
    showCharts = false; showCommunity = false; showAstrologer = false; selRec = null; wheelInfo = null;
    if (info.dayAnchor) { const d = new Date(info.dayAnchor); if (!isNaN(d.getTime())) date = d; }
    if (info.signature) selSig = info.signature;
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // Бейдж на «Картах»: сколько новых карт от клиентов ждёт астролога. У всех
  // остальных 0 — clientChartsUnread гейтит по email (требование владелицы 2026-07-07).
  async function refreshClientCharts(): Promise<void> {
    try { clientChartsWaiting = await clientChartsUnread(); } catch { /* оффлайн/без входа */ }
  }
  onMount(() => { const t = setInterval(() => void refreshClientCharts(), 120000); return () => clearInterval(t); });

  onMount(async () => {
    if (Capacitor.isNativePlatform()) {
      void CapApp.addListener('backButton', onBack);
      // вернулись на экран → докачать OTA + освежить бейдж карт клиентов
      void CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) { void resumeOta(); void refreshClientCharts(); } });
    }
    onNotificationTap(openFromNotification);
    // пуши сообщества (FCM): регистрация токена при сессии; тап по пушу —
    // обсуждение → шторка Сообщества (колокольчик), аспект → выделить на дне
    initPush((info) => {
      if (info.discussionId) { openFromNotification({}); showCommunity = {}; }
      else if (info.signature) openFromNotification({ signature: info.signature });
    });
    // durable-данные устройства (Preferences) + встроенные архетипы — ДО UI,
    // чтобы заметки/архетипы/пояс/время уведомлений не «терялись» после перезапуска.
    try {
      await hydrate();
      void hydrateKey();   // ключ Claude из durable-хранилища (не ждём — нужен только чату)
      void refreshClientCharts();   // бейдж карт клиентов (0 у всех, кроме астролога)
      // разовое уведомление «доступна новая версия» после применения OTA-бандла
      // (просьба владелицы 2026-07-07). Ключ версии — durable; свежую установку
      // (ещё не видела приветствие) не пингуем, вернувшихся — да, в т.ч. в этот раз.
      if (Capacitor.isNativePlatform()) {
        try {
          const applied = await appliedVersion();
          const { value } = await Preferences.get({ key: 'astra:verNotified' });
          if (value !== applied) {
            await Preferences.set({ key: 'astra:verNotified', value: applied });
            // ВРЕМЕННО отключено по просьбе владелицы (2026-07-09): при частых
            // правках пинги «доступна новая версия» надоедают. Вернуть = true.
            // Версия выше уже помечена показанной → при возврате не будет backlog-а.
            const SEND_UPDATE_PINGS = false;
            if (SEND_UPDATE_PINGS && db.settings.get().seenWelcome) await notifyNewVersion(applied);
          }
        } catch { /* не критично */ }
      }
      // разовая миграция (2026-07-06): горизонтальная система домов по умолчанию —
      // у уже установленных приложений в настройках лежал старый дефолт placidus
      if (!db.settings.get().houseSysV2) {
        db.settings.set({ ...db.settings.get(), houseSystem: 'horizontal', houseSysV2: true });
      }
      // разовая миграция (2026-07-06): новая тема «Аврора» по умолчанию
      // («Рассвет» остаётся в Настройках — мгновенный откат)
      if (!db.settings.get().themeV2) {
        db.settings.set({ ...db.settings.get(), theme: 'aurora', themeV2: true });
      }
      // разовая миграция (2026-07-10): тихое время по умолчанию теперь до 09:00 —
      // у кого лежал старый дефолт 08:00, поднимаем до 09:00 (кастомные не трогаем)
      if (!db.settings.get().quietV2) {
        const s = db.settings.get();
        db.settings.set({ ...s, quietTo: s.quietTo === '08:00' ? '09:00' : s.quietTo, quietV2: true });
      }
      // «Космос» удалён (2026-07-07): у кого он был выбран — переводим на Аврору
      if ((db.settings.get().theme as string) === 'cosmos') {
        db.settings.set({ ...db.settings.get(), theme: 'aurora' });
      }
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
  function onPanelChanged() {
    const wasToday = isToday;
    settings = { ...db.settings.get() };
    // сменили пояс, стоя на «сегодня» — «сегодня» пересчитываем в новом поясе
    if (wasToday) date = todayCivil(settings.tz);
    reschedule();
  }

  // тема: ставим data-theme на корень; «авто» — по системной, со слежением.
  // Статус-бар Android: иконки часов должны читаться на НАШЕМ фоне (тема
  // приложения может не совпадать с системной) — стиль шлём через встроенный
  // SystemBars ('DARK' = светлые иконки). Старый APK без SystemBars — тихий no-op.
  $effect(() => {
    const apply = () => {
      const systemLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      // «Космос» удалён: тёмная тема = ТОЛЬКО «Аврора». Светлая = «Рассвет»
      // (или авто при светлой системной теме). data-theme = 'aurora' | 'light'.
      const light = settings.theme === 'dawn' || (settings.theme === 'auto' && systemLight);
      document.documentElement.dataset.theme = light ? 'light' : 'aurora';
      if (Capacitor.isNativePlatform()) {
        registerPlugin<{ setStyle(o: { style: string }): Promise<void> }>('SystemBars')
          .setStyle({ style: light ? 'LIGHT' : 'DARK' })
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

  // «Экономия аккумулятора»: рубим блёстки/аврору/размытие/анимации. Флаг
  // data-saver на корне — CSS гасит графику (app.css), Starfield читает его и
  // не крутит цикл. 'auto' = включать при низком заряде (Battery API).
  let lowBattery = $state(false);
  $effect(() => watchLowBattery((low) => (lowBattery = low)));   // отписка = возврат watch
  $effect(() => {
    const mode = settings.batterySaver ?? 'auto';
    const on = mode === 'on' || (mode === 'auto' && lowBattery);
    document.documentElement.dataset.saver = on ? 'on' : 'off';
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
      <button class="date" onclick={() => (showCal = true)} title="Выбрать дату">
        {dateLabel}<span class="caret">▾</span></button>
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
          nodalAxisFigures={settings.nodalAxisFigures ?? false}
          selectedSignature={selSig} selectedInfo={wheelInfo}
          onAspect={(r) => { pickAspect(r); buzzTick(); }} oninfo={(i) => { wheelInfo = i; buzzTick(); }} />
      </div>
    {/key}
  {/if}
</main>

<!-- Меню из 4 пунктов (2026-07-06): Журнал переехал в Библиотеку, Синастрия
     из Библиотеки убрана (есть в «Картах»). Дата — тапом по шапке. -->
<nav class="tabbar glass frost" aria-label="Меню">
  <button class:on={showLibrary || !!libSheet}
    onclick={() => (showLibrary = true)} aria-label="Библиотека"><span class="ti glyph">📚</span><span class="tl">Библиотека</span></button>
  <button class="mid" class:on={!!showCharts} onclick={() => (showCharts = {})} aria-label="Карты и люди"><span class="ti glyph">👥</span><span class="tl">Карты</span>{#if clientChartsWaiting > 0}<span class="ncount" aria-label="Новые карты клиентов">{clientChartsWaiting}</span>{/if}</button>
  <button class:on={!!showCommunity} onclick={() => (showCommunity = {})} aria-label="Сообщество"><span class="ti glyph">✧</span><span class="tl">Сообщество</span></button>
  <button class:on={showData} onclick={() => (showData = true)} aria-label="Настройки"><span class="ti glyph">⚙</span><span class="tl">Настройки</span></button>
</nav>

{#if showData}
  <DataPanel onclose={() => (showData = false)} onchanged={onPanelChanged}
    onhelp={() => { showData = false; showWelcome = true; }}
    onastrologer={() => (showAstrologer = true)} />
{/if}

{#if showAstrologer && engine}
  <AstrologerSheet {engine} {orbOf} objects={settings.objects} houseSystem={settings.houseSystem}
    tz={settings.tz} onclose={() => { showAstrologer = false; void refreshClientCharts(); }} />
{/if}

{#if showLibrary}
  <LibrarySheet onclose={() => (showLibrary = false)}
    onInterpretations={() => openLib('interp')}
    onArchetypes={() => openLib('arch')}
    onHouses={() => openLib('houses')}
    onTracked={() => openLib('tracked')}
    onJournal={() => openLib('journal')}
    onSignMyths={() => openLib('signMyths')}
    onChat={() => { showLibrary = false; showChat = true; }}
    onPlanetSigns={() => openLib('planetSigns')}
    onPlanetHouses={() => openLib('planetHouses')}
    onDispositors={() => openLib('dispositors')}
    onPlanetCusps={() => openLib('planetCusps')}
    onDegree={() => openLib('degree')}
    onRetro={() => openLib('retro')}
    onFigures={() => openLib('figures')} />
{/if}

{#if libSheet === 'signMyths'}
  <SignMythsSheet onclose={closeLib} />
{/if}

<!-- закрытие разделов библиотеки возвращает В БИБЛИОТЕКУ (пункт выше), не на главный -->
{#if libSheet === 'interp'}
  <InterpretationsSheet onclose={closeLib}
    onopen={(r) => { libSheet = null; pickAspect(r, 'interp'); }} />
{/if}

{#if libSheet === 'houses'}
  <HousesSheet onclose={closeLib} />
{/if}

{#if libSheet === 'planetSigns'}
  <PlanetSignsSheet onclose={closeLib} />
{/if}

{#if libSheet === 'planetHouses'}
  <PlanetHousesSheet onclose={closeLib} />
{/if}

{#if libSheet === 'dispositors'}
  <DispositorsSheet onclose={closeLib} />
{/if}

{#if libSheet === 'planetCusps'}
  <PlanetCuspsSheet onclose={closeLib} />
{/if}

{#if libSheet === 'degree' && engine}
  <DegreeSearchSheet {engine} tz={settings.tz}
    onclose={closeLib}
    ongoto={(d) => { libSheet = null; slideDir = Math.sign(d.getTime() - date.getTime()); date = d; }} />
{/if}

{#if libSheet === 'retro' && engine}
  <RetroSheet {engine} onclose={closeLib} />
{/if}

{#if libSheet === 'figures'}
  <FiguresSheet onclose={closeLib} />
{/if}

{#if libSheet === 'arch'}
  <ArchetypesSheet onclose={closeLib} />
{/if}

{#if libSheet === 'tracked'}
  <TrackedSheet onclose={closeLib}
    onopen={(r) => { libSheet = null; pickAspect(r, 'tracked'); }} />
{/if}

{#if showCharts && engine}
  <ChartsSheet bind:this={chartsRef} {engine} {orbOf} signStyle={settings.signStyle} defaultTz={settings.tz}
    tz={settings.tz} objects={settings.objects} houseSystem={settings.houseSystem}
    nodalAxisFigures={settings.nodalAxisFigures ?? false}
    initialMode={showCharts.mode ?? 'transitNatal'}
    onchat={(seed, source) => openChat(seed, source)}
    oncommunity={(sig, title) => { showCommunity = { signature: sig, title }; }}
    ongoto={(d) => { showCharts = false; slideDir = Math.sign(d.getTime() - date.getTime()); date = d;
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' })); }}
    onclose={() => (showCharts = false)} />
{/if}

{#if showCommunity}
  <CommunitySheet bind:this={communityRef} signature={showCommunity.signature} title={showCommunity.title}
    onclose={() => (showCommunity = false)} />
{/if}

{#if showCal}
  <DateSheet {date} today={todayCivil(settings.tz)}
    onpick={(d) => { slideDir = Math.sign(d.getTime() - date.getTime()); date = d; showCal = false; buzzTick();
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' })); }}
    onclose={() => (showCal = false)} />
{/if}

<!-- Журнал открывается из Библиотеки; закрытие возвращает в неё (пункт выше) -->
{#if libSheet === 'journal'}
  <Journal {date} tz={settings.tz} onclose={closeLib} />
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
  <InfoSheet info={wheelInfo} onclose={() => (wheelInfo = null)} ondiscuss={openChat}
    onopenfull={wheelAspectRec
      ? () => { const r = wheelAspectRec; wheelInfo = null; if (r) { pickAspect(r); buzzTick(); } }
      : undefined} />
{/if}

{#if showWelcome}
  <Welcome onclose={dismissWelcome} />
{/if}

<!-- контекстная «?» — поверх всех шторок (z-index 32/33), один монтаж на всё приложение -->
{#if glossState.key}
  <GlossarySheet k={glossState.key} onclose={closeGloss} onnavigate={openGlossTarget} />
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
  .nav { background: transparent; border: none; font-size: 1.8rem; line-height: 1; width: 44px; height: 44px; border-radius: 12px; color: var(--ink-dim); }
  .nav:hover { background: #ffffff14; color: var(--ink); }
  /* шапка одним рядом: дата-кнопка с кареткой + чип «сегодня» в ту же строку
     (раньше чип распирал шапку вторым рядом — «строка перегружена») */
  .title { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 0; }
  .date { font-family: var(--font-display); font-size: 1.0rem; font-weight: 600; letter-spacing: 0.3px; text-transform: capitalize; background: transparent; border: none; color: inherit; padding: 6px; border-radius: 8px; white-space: nowrap;
    min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis;
    text-shadow: 0 0 10px color-mix(in srgb, var(--accent) 30%, transparent); }
  .date:hover { background: #ffffff14; }
  .caret { color: var(--ink-faint); font-size: 0.7rem; margin-left: 4px; vertical-align: middle; }
  .today { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink-dim); border-radius: 999px; padding: 4px 10px; font-size: 0.72rem;
    opacity: 1; transition: opacity 0.2s ease; white-space: nowrap; }
  .today.hidden { opacity: 0; pointer-events: none; }
  .tabbar {
    position: fixed; left: 50%; bottom: 0; transform: translateX(-50%);
    width: min(560px, 100%); z-index: 10; display: flex; justify-content: space-around;
    gap: 4px; padding: 6px 8px calc(6px + var(--safe-bottom)); border-radius: 18px 18px 0 0;
  }
  .tabbar button { flex: 1; background: transparent; border: none; color: var(--ink-dim);
    display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; border-radius: 12px; }
  .tabbar button:hover { background: #ffffff14; color: var(--ink); }
  /* активный раздел подсвечен (nav-state-active): видно, где находишься */
  .tabbar button.on { color: var(--accent); }
  .tabbar button.on .ti { text-shadow: 0 0 10px color-mix(in srgb, var(--accent) 55%, transparent); }
  .tabbar .ti { font-size: 1.25rem; line-height: 1; }
  /* «Карты» — центральная, главная точка входа: акцент + чуть крупнее + тихий глоу */
  .tabbar .mid .ti { color: var(--accent); font-size: 1.5rem;
    text-shadow: 0 0 10px color-mix(in srgb, var(--accent) 55%, transparent); }
  .tabbar .mid .tl { color: var(--accent); }
  /* бейдж новых карт клиентов (виден только астрологу) */
  .tabbar .mid { position: relative; }
  .tabbar .mid .ncount { position: absolute; top: 2px; right: calc(50% - 22px);
    min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: var(--rose);
    color: #fff; font-size: 0.64rem; font-weight: 700; line-height: 1;
    display: inline-flex; align-items: center; justify-content: center;
    box-shadow: 0 0 8px color-mix(in srgb, var(--rose) 70%, transparent); }
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
