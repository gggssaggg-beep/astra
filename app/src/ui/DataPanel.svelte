<script lang="ts">
  import { db, file as dataFile, importText, onChange } from '../lib/db.ts';
  import { exportBackup } from '../lib/backup.ts';
  import { APP_VERSION } from '../lib/version.ts';
  import { SIGN_STYLES, type SignStyle, type Settings, type ThemeMode } from '../lib/models.ts';
  import { testNotify } from '../lib/notifications.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { PLANET_GLYPH } from '../engine/index.ts';
  import { getOtaStatus, checkOtaUpdate } from '../lib/ota.ts';

  // объекты для индивидуального орбиса (светила + планеты + узлы)
  const ORB_OBJ = ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс',
    'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Раху', 'Кету'];

  let { onclose, onchanged, onhelp }:
    { onclose: () => void; onchanged: () => void; onhelp?: () => void } = $props();

  let cfg = $state<Settings>(db.settings.get());
  function save(patch: Partial<Settings>) {
    cfg = { ...db.settings.get(), ...patch };
    db.settings.set(cfg);
    onchanged();
  }
  const setSign = (id: SignStyle) => save({ signStyle: id });
  const setTheme = (t: ThemeMode) => save({ theme: t });

  // индивидуальный орбис: пусто = убрать переопределение (тогда берётся «по умолчанию»)
  function setOrb(o: string, raw: string) {
    const next = { ...cfg.orbs };
    const v = parseFloat(raw);
    if (!raw.trim() || isNaN(v)) delete next[o];
    else next[o] = Math.max(0.5, Math.min(12, v));
    save({ orbs: next });
  }

  // список часовых поясов (IANA) — из движка Intl, иначе короткий запасной
  const ZONES: string[] = (() => {
    const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    return f ? f('timeZone') : ['UTC', 'Europe/Moscow', 'Europe/Kyiv', 'Europe/Berlin', 'Asia/Almaty', 'Asia/Yekaterinburg'];
  })();

  let notifyMsg = $state<string | null>(null);
  async function checkNotify() {
    notifyMsg = await testNotify('Astra', 'Тест уведомления — на телефоне так придёт сводка дня.');
  }

  let status = $state(dataFile.status());
  let busy = $state(false);
  let msg = $state<string | null>(null);
  let importMode = $state<'merge' | 'replace'>('merge');
  const apiOk = dataFile.available();

  // обновляться на изменения файла/данных
  $effect(() => onChange(() => { status = dataFile.status(); }));

  async function run(fn: () => Promise<void>, ok: string) {
    busy = true; msg = null;
    try { await fn(); status = dataFile.status(); onchanged(); msg = ok; }
    catch (e) { msg = '⚠ ' + (e instanceof Error ? e.message : String(e)); }
    finally { busy = false; }
  }

  // OTA-обновление веб-части: показываем реальный статус (версия не в footer,
  // а из манифеста) и даём ручную проверку — иначе понять, работает ли, нельзя.
  let ota = $state(getOtaStatus());
  let otaBusy = $state(false);
  async function checkOta() {
    otaBusy = true;
    try { ota = await checkOtaUpdate(); }
    finally { otaBusy = false; }
  }

  const connectNew = () => run(() => dataFile.connectNew(), 'Файл создан, данные сохраняются в него.');
  const connectExisting = () => run(() => dataFile.connectExisting(), 'Файл подключён, данные загружены.');
  const disconnect = () => run(() => dataFile.disconnect(), 'Файл отключён (данные остались в приложении).');

  async function downloadExport() {
    busy = true; msg = null;
    try { msg = await exportBackup(); }
    catch (e) { msg = '⚠ ' + (e instanceof Error ? e.message : String(e)); }
    finally { busy = false; }
  }

  async function onImportFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    busy = true; msg = null;
    try {
      importText(await f.text(), importMode);
      onchanged();
      msg = `Импорт (${importMode === 'merge' ? 'объединение' : 'замена'}) выполнен.`;
    } catch (err) { msg = '⚠ ' + (err instanceof Error ? err.message : String(err)); }
    finally { busy = false; (e.target as HTMLInputElement).value = ''; }
  }
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Данные и настройки" use:bottomSheet={{ onclose }}>
  <header>
    <h2>Данные</h2>
    <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
  </header>

  <div class="group">Внешний вид</div>
  <div class="block">
    <div class="lbl">Символы знаков</div>
    <div class="styles">
      {#each SIGN_STYLES as st}
        <button class="style st-{st.id}" class:on={cfg.signStyle === st.id} onclick={() => setSign(st.id)}>
          <span class="sw"></span>{st.label}
        </button>
      {/each}
    </div>
    <div class="two">
      <label class="toggle">
        <input type="checkbox" checked={cfg.largeFont}
          onchange={(e) => save({ largeFont: (e.target as HTMLInputElement).checked })} />
        Крупный шрифт
      </label>
      <div class="seg">
        {#each [['auto', 'Авто'], ['cosmos', 'Космос'], ['dawn', 'Рассвет']] as [id, label]}
          <button class:on={cfg.theme === id} onclick={() => setTheme(id as ThemeMode)}>{label}</button>
        {/each}
      </div>
    </div>
  </div>

  <div class="group">Часовой пояс и уведомления</div>
  <div class="block">
    <div class="lbl">Часовой пояс</div>
    <select class="select" value={cfg.tz} onchange={(e) => save({ tz: (e.target as HTMLSelectElement).value })}>
      {#each ZONES as z}<option value={z}>{z}</option>{/each}
    </select>
    <div class="hint small">Все времена и положения (колесо, планеты, точные аспекты, события)
      показываются в этом поясе. Пояс при первом запуске взят из настроек самого телефона —
      офлайн, без интернета и GPS; можно изменить вручную здесь.</div>
  </div>

  <div class="block">
    <div class="lbl">Уведомления</div>
    <label class="toggle">
      <input type="checkbox" checked={cfg.notifyDaily}
        onchange={(e) => save({ notifyDaily: (e.target as HTMLInputElement).checked })} />
      Ежедневная сводка дня
    </label>
    <div class="orb" style="margin-top:8px">
      <span class="small">в</span>
      <input type="time" value={cfg.dailyNotifyTime}
        onchange={(e) => save({ dailyNotifyTime: (e.target as HTMLInputElement).value })} />
    </div>
    <label class="toggle" style="margin-top:12px">
      <input type="checkbox" checked={cfg.notifyAspects}
        onchange={(e) => save({ notifyAspects: (e.target as HTMLInputElement).checked })} />
      В момент точного аспекта (планеты)
    </label>
    <div class="row" style="margin-top:10px">
      <button class="btn" onclick={checkNotify}>Проверить уведомление</button>
    </div>
    {#if notifyMsg}<div class="msg">{notifyMsg}</div>{/if}
    <div class="hint small">Реальные уведомления (ежедневно и в момент аспекта) сработают
      в приложении на телефоне; здесь — проверка.</div>
  </div>

  <div class="group">Орбис</div>
  <div class="block">
    <div class="orb">
      <span class="small">по умолчанию</span>
      <input type="number" min="0.5" max="12" step="0.5" value={cfg.defaultOrb}
        onchange={(e) => save({ defaultOrb: Math.max(0.5, Math.min(12, +(e.target as HTMLInputElement).value || 1)) })} />
      <span>°</span>
    </div>
    <div class="hint small">Можно задать орбис отдельно по светилам и планетам (пусто = по умолчанию).
      Для пары берётся больший из двух орбисов.</div>
    <div class="orbgrid">
      {#each ORB_OBJ as o}
        <label class="orbcell">
          <span class="g glyph">{PLANET_GLYPH[o] ?? '•'}</span>
          <input type="number" min="0.5" max="12" step="0.5" placeholder={String(cfg.defaultOrb)}
            value={cfg.orbs[o] ?? ''} onchange={(e) => setOrb(o, (e.target as HTMLInputElement).value)} />
          <span class="u">°</span>
        </label>
      {/each}
    </div>
  </div>

  <div class="group">Данные</div>
  {#if apiOk}
    <!-- Только настоящий десктоп-браузер (Chrome/Edge). На телефоне блок скрыт:
         там данные durable в Preferences, а бэкап — через Экспорт/Импорт ниже. -->
    <div class="block">
      <div class="lbl">Файл данных на компьютере</div>
      {#if status.connected}
        <p class="ok">✓ Сохраняется в <b>{status.name}</b>{status.saving ? ' (запись…)' : ''}</p>
        <div class="row">
          <button class="btn" disabled={busy} onclick={connectExisting}>Открыть другой…</button>
          <button class="btn ghost" disabled={busy} onclick={disconnect}>Отключить</button>
        </div>
      {:else}
        <p class="hint">Сейчас данные в браузере (могут пропасть при чистке кэша).
          Подключи файл — и всё будет авто-сохраняться на диск читаемым текстом.</p>
        <div class="row">
          <button class="btn primary" disabled={busy} onclick={connectNew}>Создать файл…</button>
          <button class="btn" disabled={busy} onclick={connectExisting}>Открыть файл…</button>
        </div>
      {/if}
    </div>
  {/if}

  <div class="block">
    <div class="lbl">Экспорт / Импорт (читаемый JSON)</div>
    <div class="row">
      <button class="btn" disabled={busy} onclick={downloadExport}>Экспорт в файл</button>
      <label class="btn file">
        Импорт из файла
        <input type="file" accept=".json,application/json" onchange={onImportFile} hidden />
      </label>
    </div>
    <label class="mode">
      <input type="checkbox" checked={importMode === 'replace'}
        onchange={(e) => (importMode = (e.target as HTMLInputElement).checked ? 'replace' : 'merge')} />
      при импорте заменять всё (иначе — объединять без потерь)
    </label>
  </div>

  {#if msg}<div class="msg">{msg}</div>{/if}

  <div class="group">Обновление приложения</div>
  <div class="block">
    <div class="lbl">Живое обновление (OTA)</div>
    <p class="hint small">Веб-часть обновляется без переустановки APK. Кнопка ниже
      проверит обновление и покажет, что произошло. Новый бандл применяется при
      следующем полном запуске приложения (закрыть и открыть заново).</p>
    <div class="row" style="margin-top:8px">
      <button class="btn primary" disabled={otaBusy} onclick={checkOta}>
        {otaBusy ? 'Проверяю…' : 'Проверить обновление'}</button>
    </div>
    {#if ota.state !== 'idle'}
      <div class="msg" class:err={ota.state === 'error'}>{ota.message}</div>
    {/if}
    <div class="hint small" style="margin-top:6px">
      Установлено: <b>{ota.applied}</b>{#if ota.latest} · в манифесте: {ota.latest}{/if}
      {#if ota.native && !ota.pluginOk} · <b>плагин OTA отсутствует</b> (нужен свежий APK){/if}
    </div>
  </div>

  <div class="group">Обучение</div>
  <div class="block">
    <button class="btn" onclick={() => onhelp?.()}>Приветствие и правила школы</button>
    <div class="hint small" style="margin-top:8px">Какой школы держимся и как считаем.
      Подсказка: в колесе можно коснуться любого символа — планеты или линии аспекта —
      и получить разбор.</div>
  </div>

  <footer>Astra · версия {APP_VERSION}{#if ota.applied !== APP_VERSION} · бандл {ota.applied}{/if}</footer>
</section>

<style>
  .backdrop { position: fixed; inset: 0; background: #0007; backdrop-filter: blur(2px); z-index: 20; }
  .sheet {
    position: fixed; left: 50%; bottom: 0; transform: translateX(-50%);
    width: min(560px, 100%); z-index: 21; padding: 16px 16px calc(20px + env(safe-area-inset-bottom));
    border-radius: 22px 22px 0 0; animation: up 0.25s ease;
    max-height: 90vh; overflow-y: auto;   /* иначе верхние блоки уходят за край */
  }
  @keyframes up { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .block { padding: 12px 0; border-top: 1px solid var(--glass-brd); }
  .lbl { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); margin-bottom: 8px; }
  .styles { display: flex; flex-wrap: wrap; gap: 8px; }
  .style { display: inline-flex; align-items: center; gap: 8px; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink-dim); border-radius: 12px; padding: 8px 12px; font-size: 0.85rem; }
  .style.on { border-color: var(--accent); color: var(--ink); background: #ffffff1e; }
  .sw { width: 14px; height: 14px; border-radius: 50%; display: inline-block; }
  .st-silver .sw { background: var(--silver); }
  .st-gold .sw { background: var(--gold); box-shadow: 0 0 6px var(--gold); }
  .st-element .sw { background: conic-gradient(#ff8a5b, #7fd99a, #7fd0ff, #b39bff, #ff8a5b); }
  .st-shimmer .sw { background: linear-gradient(90deg, #f3c969, #cdd6ff, #9b8cff); }
  .st-rainbow .sw { background: linear-gradient(90deg, #ff6b6b, #f3c969, #7fd99a, #7fd0ff, #b39bff); }
  .select { width: 100%; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 9px 12px; font: inherit; }
  .small { font-size: 0.78rem; color: var(--ink-faint); }
  .group { margin: 16px 2px 2px; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1.5px; color: var(--accent); font-weight: 600; }
  .group:first-of-type { margin-top: 4px; }
  .two { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
  .orbgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
  .orbcell { display: flex; align-items: center; gap: 6px; background: #ffffff0c; border: 1px solid var(--glass-brd); border-radius: 10px; padding: 6px 8px; }
  .orbcell .g { font-size: 1.05rem; color: var(--silver); width: 1.3rem; text-align: center; }
  .orbcell input { width: 100%; min-width: 0; background: transparent; border: none; color: var(--ink); font: inherit; padding: 2px 0; }
  .orbcell .u { color: var(--ink-faint); }
  .orb { display: inline-flex; align-items: center; gap: 6px; }
  .orb input { width: 78px; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 10px; padding: 8px 10px; font: inherit; }
  .seg { display: inline-flex; border: 1px solid var(--glass-brd); border-radius: 10px; overflow: hidden; }
  .seg button { background: transparent; border: none; color: var(--ink-dim); padding: 8px 12px; font-size: 0.84rem; }
  .seg button.on { background: var(--accent); color: var(--on-accent); }
  .toggle { display: flex; align-items: center; gap: 8px; color: var(--ink-dim); font-size: 0.9rem; }
  .hint { color: var(--ink-dim); font-size: 0.86rem; margin: 0 0 10px; }
  .ok { color: var(--gold); margin: 0 0 10px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 9px 14px; font-size: 0.9rem; }
  .btn:hover { background: #ffffff22; }
  .btn.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); font-weight: 600; }
  .btn.ghost { color: var(--ink-dim); }
  .btn.file { display: inline-flex; align-items: center; cursor: pointer; }
  .mode { display: flex; align-items: center; gap: 8px; margin-top: 10px; color: var(--ink-dim); font-size: 0.82rem; }
  .msg { margin-top: 10px; padding: 8px 12px; background: #ffffff10; border-radius: 10px; font-size: 0.86rem; color: var(--ink-dim); }
  .msg.err { background: #ff5a5a1e; color: #ffb3b3; }
  footer { margin-top: 14px; text-align: center; color: var(--ink-faint); font-size: 0.74rem; }
</style>
