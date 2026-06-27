<script lang="ts">
  import { onMount } from 'svelte';
  import type { Engine, AspectRecord } from './engine/index.ts';
  import { getEngine } from './lib/engineStore.ts';
  import { db, file as dataFile } from './lib/db.ts';
  import { fmtDayFull } from './lib/format.ts';
  import DayScreen from './ui/DayScreen.svelte';
  import DataPanel from './ui/DataPanel.svelte';
  import DateSheet from './ui/DateSheet.svelte';
  import Journal from './ui/Journal.svelte';
  import InterpretationSheet from './ui/InterpretationSheet.svelte';
  import ArchetypesSheet from './ui/ArchetypesSheet.svelte';
  import TrackedSheet from './ui/TrackedSheet.svelte';
  import ChatSheet from './ui/ChatSheet.svelte';

  let settings = $state(db.settings.get());
  let engine = $state<Engine | null>(null);
  let error = $state<string | null>(null);
  let showData = $state(false);
  let showCal = $state(false);
  let showJournal = $state(false);
  let showArch = $state(false);
  let showTracked = $state(false);
  let showChat = $state(false);
  let selRec = $state<AspectRecord | null>(null);
  let needReconnect = $state(false);

  function startOfTodayUTC(): Date {
    const n = new Date();
    return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
  }
  let date = $state(startOfTodayUTC());
  const isToday = $derived(date.getTime() === startOfTodayUTC().getTime());

  function shift(days: number) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    date = d;
  }

  onMount(async () => {
    try { engine = await getEngine('swieph'); }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
    // подхватить файл данных с диска (если доступ уже разрешён — тихо)
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

  function onPanelChanged() { settings = { ...db.settings.get() }; }

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

  // свайп влево/вправо = соседний день
  let x0 = 0;
  const onStart = (e: TouchEvent) => { x0 = e.touches[0].clientX; };
  const onEnd = (e: TouchEvent) => {
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) shift(dx < 0 ? 1 : -1);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') shift(-1);
    if (e.key === 'ArrowRight') shift(1);
  };
</script>

<svelte:window onkeydown={onKey} />

<main ontouchstart={onStart} ontouchend={onEnd}>
  <header class="glass">
    <button class="nav" onclick={() => shift(-1)} aria-label="Предыдущий день">‹</button>
    <div class="title">
      <button class="date" onclick={() => (showCal = true)} title="Выбрать дату">{fmtDayFull(date, settings.tz)}</button>
      <button class="today" class:hidden={isToday} onclick={() => (date = startOfTodayUTC())}>сегодня</button>
    </div>
    <button class="nav" onclick={() => shift(1)} aria-label="Следующий день">›</button>
    <button class="gear" onclick={() => (showChat = true)} aria-label="Чат трактовок">💬</button>
    <button class="gear" onclick={() => (showJournal = true)} aria-label="Журнал">📓</button>
    <button class="gear" onclick={() => (showData = true)} aria-label="Данные и настройки">⚙</button>
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
        <DayScreen {engine} {date} orb={settings.defaultOrb} tz={settings.tz} signStyle={settings.signStyle} onAspect={(r) => (selRec = r)} />
      </div>
    {/key}
  {/if}
</main>

{#if showData}
  <DataPanel onclose={() => (showData = false)} onchanged={onPanelChanged}
    onArchetypes={() => { showData = false; showArch = true; }}
    onTracked={() => { showData = false; showTracked = true; }} />
{/if}

{#if showArch}
  <ArchetypesSheet onclose={() => (showArch = false)} />
{/if}

{#if showTracked}
  <TrackedSheet onclose={() => (showTracked = false)} onopen={(r) => { showTracked = false; selRec = r; }} />
{/if}

{#if showCal}
  <DateSheet {date} onpick={(d) => { date = d; showCal = false; }} onclose={() => (showCal = false)} />
{/if}

{#if showJournal}
  <Journal {date} onclose={() => (showJournal = false)} />
{/if}

{#if selRec}
  <InterpretationSheet rec={selRec} {date} tz={settings.tz} onclose={() => (selRec = null)} />
{/if}

{#if showChat && engine}
  <ChatSheet {engine} {date} tz={settings.tz} orb={settings.defaultOrb} onclose={() => (showChat = false)} />
{/if}

<style>
  main { max-width: 560px; margin: 0 auto; padding: 12px 12px env(safe-area-inset-bottom); min-height: 100%; }
  header {
    position: sticky; top: 8px; z-index: 5;
    display: flex; align-items: center; gap: 6px; padding: 8px 10px; margin-bottom: 6px;
  }
  .nav { background: transparent; border: none; font-size: 1.8rem; line-height: 1; width: 40px; height: 44px; border-radius: 12px; color: var(--ink-dim); }
  .nav:hover { background: #ffffff14; color: var(--ink); }
  .title { flex: 1; text-align: center; }
  .date { font-size: 1.0rem; font-weight: 600; text-transform: capitalize; background: transparent; border: none; color: inherit; padding: 2px 6px; border-radius: 8px; }
  .date:hover { background: #ffffff14; }
  .today { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink-dim); border-radius: 999px; padding: 2px 12px; font-size: 0.72rem; margin-top: 4px; }
  .today.hidden { visibility: hidden; }
  .gear { background: transparent; border: none; font-size: 1.2rem; width: 40px; height: 44px; border-radius: 12px; color: var(--ink-dim); }
  .gear:hover { background: #ffffff14; color: var(--ink); }
  .reconnect { display: block; width: 100%; text-align: left; padding: 10px 14px; margin-bottom: 6px; color: var(--gold); border: none; font-size: 0.86rem; }
  .state { padding: 24px; text-align: center; color: var(--ink-dim); margin-top: 20px; }
  .state.err { color: var(--rose); }
  .page { animation: fade 0.25s ease; }
  @keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
</style>
