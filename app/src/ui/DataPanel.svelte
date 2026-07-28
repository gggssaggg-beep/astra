<script lang="ts">
  import { db, file as dataFile, importText, onChange } from '../lib/db.ts';
  import { exportBackup } from '../lib/backup.ts';
  import { APP_VERSION } from '../lib/version.ts';
  import { SIGN_STYLES, DEFAULT_ORBS, HOUSE_SYSTEMS, type SignStyle, type Settings, type ThemeMode } from '../lib/models.ts';
  import { sendTest, requestPermission, reminderLog } from '../lib/reminders.ts';
  import { bottomSheet } from '../lib/sheet.ts';
  import { PLANET_GLYPH, AYANAMSAS } from '../engine/index.ts';
  import { getOtaStatus, checkOtaUpdate, applyQueuedNow } from '../lib/ota.ts';
  import { tgHref } from '../lib/telegram.ts';
  import Hint from './Hint.svelte';

  // базовые объекты (всегда в списке) и доп. объекты (по умолчанию выключены)
  const BASE_OBJ = ['Солнце', 'Луна', 'Меркурий', 'Венера', 'Марс',
    'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Раху', 'Кету'];
  const EXTRA_OBJ = ['Хирон', 'Церера', 'Паллада', 'Юнона', 'Веста', 'Лилит'];
  // объекты для индивидуального орбиса (светила + планеты + узлы + доп.)
  const ORB_OBJ = [...BASE_OBJ, ...EXTRA_OBJ];

  let { onclose, onchanged, onhelp, onastrologer, onstarttour, onCourse }:
    { onclose: () => void; onchanged: () => void; onhelp?: () => void; onstarttour?: () => void;
      onCourse?: () => void; onastrologer?: () => void } = $props();

  let cfg = $state<Settings>(db.settings.get());
  function save(patch: Partial<Settings>) {
    cfg = { ...db.settings.get(), ...patch };
    db.settings.set(cfg);
    onchanged();
  }
  const vedic = $derived((cfg.zodiac ?? 'tropical') === 'sidereal');
  const setSign = (id: SignStyle) => save({ signStyle: id });
  const setTheme = (t: ThemeMode) => save({ theme: t });

  // тумблеры объектов: вкл/выкл в расчётах (аспекты дня, карты, прогноз)
  function toggleObject(o: string) {
    const has = cfg.objects.includes(o);
    const next = has ? cfg.objects.filter((x) => x !== o) : [...cfg.objects, o];
    if (!next.length) return;            // хотя бы один объект должен остаться
    save({ objects: next });
  }

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
  // отфильтрованный список; текущий пояс всегда в списке (иначе select собьётся)
  const zonesShown = $derived.by(() => {
    const q = tzFilter.trim().toLowerCase();
    const list = q ? ZONES.filter((z) => z.toLowerCase().includes(q)) : ZONES;
    return list.includes(cfg.tz) ? list : [cfg.tz, ...list];
  });

  let testMsg = $state<string | null>(null);
  let testBusy = $state(false);

  // люди для выбора «моей карты» — реактивно: человек, добавленный в «Картах»
  // при открытых Настройках, сразу появляется в селекторе
  let people = $state(db.people.all().slice());
  $effect(() => onChange(() => (people = db.people.all().slice())));

  // фильтр списка часовых поясов (их 600+ — глазами не пролистать)
  let tzFilter = $state('');
  // 600+ <option> рендерились ОДНОВРЕМЕННО с анимацией выезда шторки —
  // «открывается с прерыванием». Откладываем список до конца анимации.
  let tzReady = $state(false);
  $effect(() => {
    const t = setTimeout(() => (tzReady = true), 400);   // шторка едет 0.34s
    return () => clearTimeout(t);
  });

  type NotifyField = 'notifyDaily' | 'notifyAspects' | 'notifyTransits';
  // какой тумблер ждёт пояснения перед первым запросом разрешения (П.8 онбординга):
  // при первом включении любого уведомления показываем свою карточку «зачем»,
  // и только по «Дальше →» дёргаем системный диалог. Повторные включения — сразу.
  let pendingNotify = $state<NotifyField | null>(null);

  async function requestAndSave(field: NotifyField, val: boolean) {
    if (val) {
      const r = await requestPermission();
      if (r === 'denied')
        testMsg = 'Разрешение отклонено. Включи вручную: Настройки Android → Приложения → Astra → Уведомления.';
      else if (r === 'unsupported')
        testMsg = 'Уведомления недоступны в этом окружении.';
    }
    save({ [field]: val });
  }

  async function onNotifyToggle(field: NotifyField, val: boolean) {
    // первое включение любого уведомления → сперва карточка-пояснение
    if (val && !cfg.seenNotifyWhy) { pendingNotify = field; return; }
    await requestAndSave(field, val);
  }
  // «Дальше →» на карточке: ставим флаг, зовём requestPermission и продолжаем включение
  async function confirmNotify() {
    const field = pendingNotify;
    pendingNotify = null;
    if (!field) return;
    save({ seenNotifyWhy: true });
    await requestAndSave(field, true);
  }
  // «Отмена»: тумблер откатывается (флаг сохранения = текущее значение поля)
  function cancelNotify() {
    pendingNotify = null;
    cfg = { ...db.settings.get() };   // перерисовать чекбоксы под сохранённое состояние
  }

  async function runTest() {
    if (testBusy) return;
    testBusy = true;
    try { testMsg = await sendTest(); }
    finally { testBusy = false; }
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
  let otaProg = $state<string | null>(null);   // живой прогресс скачивания (13 МБ)
  async function checkOta() {
    otaBusy = true; otaProg = null;
    try { ota = await checkOtaUpdate((m) => (otaProg = m)); }
    finally { otaBusy = false; otaProg = null; }
  }
  // применить скачанное СЕЙЧАС: перезапуск webview — надёжнее, чем ждать
  // «полного закрытия» (смахивание из недавних не всегда убивает процесс)
  async function applyOta() {
    otaBusy = true;
    try { ota = await applyQueuedNow(); }   // при успехе приложение перезапустится само
    finally { otaBusy = false; }
  }

  // Обратная связь — в Telegram владелице (просьба 2026-07-07). По @username:
  // числовой id не открывает личку (см. lib/telegram.ts). Консультация/отправка
  // данных астрологу — в отдельной шторке AstrologerSheet (кнопка ниже).
  const OWNER_TG = 'U314159';   // Telegram владелицы — обратная связь

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

<div class="backdrop sheet-backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass sheet-base" aria-label="Данные и настройки" use:bottomSheet={{ onclose }}>
  <header>
    <h2>Настройки</h2>
    <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
  </header>

  <details class="sec">
    <summary class="group">Внешний вид</summary>
  <div class="block">
    <div class="lbl">Тема</div>
    <div class="seg">
      {#each [['aurora', 'Аврора'], ['dawn', 'Рассвет ✨'], ['auto', 'Авто']] as [id, label]}
        <button class:on={cfg.theme === id} onclick={() => setTheme(id as ThemeMode)}>{label}</button>
      {/each}
    </div>

    <div class="lbl" style="margin-top:14px">Символы знаков</div>
    <div class="styles">
      {#each SIGN_STYLES as st}
        <button class="style st-{st.id}" class:on={cfg.signStyle === st.id} onclick={() => setSign(st.id)}>
          <span class="sw"></span>{st.label}
        </button>
      {/each}
    </div>

    <label class="toggle" style="margin-top:14px">
      <input type="checkbox" checked={cfg.largeFont}
        onchange={(e) => save({ largeFont: (e.target as HTMLInputElement).checked })} />
      Крупный шрифт
    </label>

    <div class="lbl" style="margin-top:14px">Экономия аккумулятора</div>
    <div class="seg">
      {#each [['off', 'Выкл'], ['auto', 'Авто'], ['on', 'Вкл']] as [id, label]}
        <button class:on={(cfg.batterySaver ?? 'auto') === id}
          onclick={() => save({ batterySaver: id as 'off' | 'auto' | 'on' })}>{label}</button>
      {/each}
    </div>
    <div class="hint small" style="margin-top:6px">
      Гасит блёстки, сполохи фона, размытие и анимации — заметно бережёт батарею
      на слабых телефонах. «Авто» включается сам при низком заряде.
    </div>
  </div>

  </details>
  <details class="sec">
    <summary class="group">Обучение</summary>
  <div class="block">
    {#if onstarttour}<button class="btn" onclick={() => onstarttour?.()} style="margin-bottom:8px">🎓 Тур по приложению</button>{/if}
    {#if onCourse}<button class="btn" onclick={() => onCourse?.()} style="margin-bottom:8px">📖 Курс астрологии</button>{/if}
    <button class="btn" onclick={() => onhelp?.()}>Приветствие и правила школы</button>
    <div class="hint small" style="margin-top:8px">Какой школы держимся и как считаем.
      Подсказка: в колесе можно коснуться любого символа — планеты или линии аспекта —
      и получить разбор.</div>
  </div>

  </details>
  <details class="sec">
    <summary class="group">Расчёты</summary>

  <div class="block">
    <div class="lbl">Часовой пояс</div>
    <!-- прозрачность прежде всего (вопрос владелицы «откуда пояс? не деанонит?») -->
    <div class="hint small" style="margin-bottom:8px">🔒 Пояс взят из настроек самого телефона —
      офлайн, без GPS и интернета. Местоположение приложение не знает и никуда не отправляет.</div>
    <input class="select" type="text" bind:value={tzFilter} placeholder="Поиск пояса (moscow, novosib…)"
      style="margin-bottom:6px" />
    <select class="select" value={cfg.tz} onchange={(e) => save({ tz: (e.target as HTMLSelectElement).value })}>
      {#if tzReady}
        {#each zonesShown as z}<option value={z}>{z}</option>{/each}
      {:else}
        <option value={cfg.tz}>{cfg.tz}</option>
      {/if}
    </select>
    <div class="hint small">Все времена и положения (колесо, планеты, точные аспекты, события)
      показываются в этом поясе; можно изменить вручную.</div>
  </div>

  <div class="block">
    <div class="lbl">Объекты</div>
    <div class="hint small">Что участвует в расчётах: аспекты дня, колесо, совмещённые карты, прогноз.
      Выключенное не считается и не рисуется.</div>
    <div class="objgrid">
      {#each BASE_OBJ as o}
        <button class="objchip" class:on={cfg.objects.includes(o)} onclick={() => toggleObject(o)}>
          <span class="g glyph">{PLANET_GLYPH[o] ?? '•'}</span>{o}
        </button>
      {/each}
    </div>
    <div class="lbl" style="margin-top:14px">Дополнительные</div>
    <div class="hint small">Астероиды и Чёрная Луна. По умолчанию выключены: включай по одному —
      каждый добавляет свои аспекты в сводку и колесо.</div>
    <div class="objgrid">
      {#each EXTRA_OBJ as o}
        <button class="objchip" class:on={cfg.objects.includes(o)} onclick={() => toggleObject(o)}>
          <span class="g glyph">{PLANET_GLYPH[o] ?? '•'}</span>{o}
        </button>
      {/each}
    </div>
    <label class="toggle" style="margin-top:12px">
      <input type="checkbox" checked={cfg.nodalAxisFigures ?? false}
        onchange={(e) => save({ nodalAxisFigures: (e.target as HTMLInputElement).checked })} />
      Строить фигуры на оси узлов
    </label>
    <div class="hint small" style="margin-top:4px">Раху и Кету всегда строго напротив (180°) — это ось, а не аспект. Обычно фигуры на ней не строят: иначе «косой парус» на Луне+узлах висит почти всё время. Включи, если хочешь видеть и их.</div>
  </div>

  <div class="block">
    <div class="lbl">Орбис <Hint k="orb" /></div>
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
          <input type="number" min="0.5" max="12" step="0.5" placeholder={String(DEFAULT_ORBS[o] ?? cfg.defaultOrb)}
            value={cfg.orbs[o] ?? ''} onchange={(e) => setOrb(o, (e.target as HTMLInputElement).value)} />
          <span class="u">°</span>
        </label>
      {/each}
    </div>
  </div>

  <div class="block">
    <div class="lbl">Зодиак</div>
    <select class="select" value={cfg.zodiac ?? 'tropical'}
      onchange={(e) => save({ zodiac: (e.target as HTMLSelectElement).value as 'tropical' | 'sidereal' })}>
      <option value="tropical">Западный · тропический</option>
      <option value="sidereal">Ведический · джйотиш</option>
    </select>
    {#if vedic}
      <div class="lbl" style="margin-top:10px">Аянамша</div>
      <select class="select" value={cfg.ayanamsa ?? 'lahiri'}
        onchange={(e) => save({ ayanamsa: (e.target as HTMLSelectElement).value })}>
        {#each AYANAMSAS as a}<option value={a.id}>{a.label}</option>{/each}
      </select>
      <div class="hint small" style="margin-top:8px">Ведический режим меняет весь расчёт: знаки и
        градусы сдвигаются на аянамшу (сейчас около 24°), дома становятся целознаковыми.
        Аспекты между планетами остаются те же — сдвиг одинаков для всех.</div>
      <!-- по умолчанию вид ПОЛНЫЙ (приложение делалось для астролога); тумблер
           убирает специальные слои для того, кто джйотиш только смотрит -->
      <label class="toggle" style="margin-top:12px">
        <input type="checkbox" checked={!!cfg.vedicSimple}
          onchange={(e) => save({ vedicSimple: (e.target as HTMLInputElement).checked })} />
        Я не астролог — упрощённый вид
      </label>
      <div class="hint small">Скрывает навамшу, отношения планет и прочие специальные слои —
        остаются дома, знаки, планеты с градусами, караки и периоды.</div>
    {:else}
      <div class="hint small" style="margin-top:8px">Западный зодиак отсчитывается от точки весеннего
        равноденствия, ведический — от неподвижных звёзд. Одна и та же планета попадает в разные знаки.</div>
    {/if}
  </div>

  <div class="block">
    <div class="lbl">Дома <Hint k="house-system" /></div>
    <select class="select" value={vedic ? 'wholeSign' : (cfg.houseSystem ?? 'horizontal')}
      disabled={vedic}
      onchange={(e) => save({ houseSystem: (e.target as HTMLSelectElement).value })}>
      {#each HOUSE_SYSTEMS as h}<option value={h.id}>{h.label}</option>{/each}
    </select>
    <div class="hint small" style="margin-top:8px">{#if vedic}В ведическом режиме дома всегда
      целознаковые: дом = знак целиком, первый дом начинается со знака лагны.{:else}Дома рисуются
      в натальных картах, где задано место рождения (координаты). Без места — колесо без домов.{/if}</div>
  </div>

  </details>
  <details class="sec">
    <summary class="group">Уведомления</summary>
  <div class="block">
    {#if pendingNotify}
      <!-- П.8 онбординга: контекст ПЕРЕД системным запросом разрешения -->
      <div class="whycard">
        <b>Включить напоминания?</b>
        <p>Напоминания приходят в момент точного аспекта и сводкой по расписанию.
          Android спросит разрешение — согласись, иначе ничего не придёт.</p>
        <div class="row">
          <button class="btn primary" onclick={confirmNotify}>Дальше →</button>
          <button class="btn ghost" onclick={cancelNotify}>Отмена</button>
        </div>
      </div>
    {/if}
    <label class="toggle">
      <input type="checkbox" checked={cfg.notifyDaily}
        onchange={(e) => onNotifyToggle('notifyDaily', (e.target as HTMLInputElement).checked)} />
      Ежедневная сводка неба
    </label>
    {#if cfg.notifyDaily}
      <div class="orb" style="margin-top:8px">
        <span class="small">приходит</span>
        <select class="select" value={cfg.dailyDigestMode ?? 'once'}
          onchange={(e) => save({ dailyDigestMode: (e.target as HTMLSelectElement).value as 'once' | 'twice' })}>
          <option value="once">раз в сутки</option>
          <option value="twice">дважды в сутки</option>
        </select>
      </div>
      <div class="orb" style="margin-top:8px">
        <span class="small">{(cfg.dailyDigestMode ?? 'once') === 'twice' ? 'утром в' : 'в'}</span>
        <input type="time" value={cfg.dailyNotifyTime}
          onchange={(e) => save({ dailyNotifyTime: (e.target as HTMLInputElement).value })} />
        {#if (cfg.dailyDigestMode ?? 'once') === 'twice'}
          <span class="small">и вечером в</span>
          <input type="time" value={cfg.dailyNotifyTime2 ?? '21:00'}
            onchange={(e) => save({ dailyNotifyTime2: (e.target as HTMLInputElement).value })} />
        {/if}
      </div>
      {#if (cfg.dailyDigestMode ?? 'once') === 'twice'}
        <div class="hint small" style="margin-top:6px">Каждая сводка перечисляет аспекты до следующей —
          вечерняя так забирает ночные.</div>
      {/if}
    {/if}
    <label class="toggle" style="margin-top:12px">
      <input type="checkbox" checked={cfg.notifyAspects}
        onchange={(e) => onNotifyToggle('notifyAspects', (e.target as HTMLInputElement).checked)} />
      В момент точного аспекта (планеты)
    </label>

    <label class="toggle" style="margin-top:12px">
      <input type="checkbox" checked={cfg.notifyTransits}
        onchange={(e) => onNotifyToggle('notifyTransits', (e.target as HTMLInputElement).checked)} />
      Транзиты к моей натальной карте
    </label>
    {#if cfg.notifyTransits}
      <div style="margin-top:8px">
        <select class="select" value={cfg.transitSelfId ?? ''}
          onchange={(e) => save({ transitSelfId: (e.target as HTMLSelectElement).value || undefined })}>
          <option value="">— выбери человека («моя карта») —</option>
          {#each people as p}<option value={p.id}>{p.name}</option>{/each}
        </select>
        <label class="toggle" style="margin-top:8px">
          <input type="checkbox" checked={cfg.transitCusps}
            onchange={(e) => save({ transitCusps: (e.target as HTMLInputElement).checked })} />
          + куспиды домов (нужны место и время рождения)
        </label>
        {#if !people.length}<div class="hint small" style="margin-top:6px">Сначала добавь человека в нижнем меню «Добавить».</div>{/if}
      </div>
    {/if}

    <label class="toggle" style="margin-top:12px">
      <input type="checkbox" checked={cfg.quietEnabled ?? true}
        onchange={(e) => save({ quietEnabled: (e.target as HTMLInputElement).checked })} />
      Тихое время (не беспокоить)
    </label>
    {#if cfg.quietEnabled ?? true}
      <div class="orb" style="margin-top:8px">
        <span class="small">с</span>
        <input type="time" value={cfg.quietFrom ?? '22:00'}
          onchange={(e) => save({ quietFrom: (e.target as HTMLInputElement).value })} />
        <span class="small">до</span>
        <input type="time" value={cfg.quietTo ?? '08:00'}
          onchange={(e) => save({ quietTo: (e.target as HTMLInputElement).value })} />
      </div>
      <div class="hint small" style="margin-top:6px">В это время точечные пинги аспектов и транзитов
        не приходят. Сводка приходит по своему расписанию.</div>
    {/if}

    <div style="margin-top:10px">
      <button class="btn" disabled={testBusy} onclick={runTest}>
        {testBusy ? 'Проверяю…' : 'Проверить'}</button>
    </div>
    {#if testMsg}<div class="msg" style="white-space:pre-line">{testMsg}</div>{/if}
    <details style="margin-top:10px">
      <summary class="small" style="cursor:pointer">Журнал шагов и советы</summary>
      <div class="hint small" style="margin-top:6px">На Xiaomi/MIUI ещё нужно: Автозапуск ВКЛ и Батарея →
        «Без ограничений» для Astra — иначе телефон молча убивает уведомления.</div>
      <div class="msg small" style="margin-top:6px;font-family:var(--font-mono);white-space:pre-wrap;font-size:0.72rem">{reminderLog().join('\n') || '(пусто)'}</div>
    </details>
  </div>

  </details>
  <details class="sec">
    <summary class="group">Данные</summary>
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

  </details>
  <details class="sec">
    <summary class="group">Обновление приложения</summary>
  <div class="block">
    <div class="lbl">Живое обновление (OTA)</div>
    <p class="hint small">Веб-часть обновляется без переустановки APK. «Проверить» скачает
      обновление, если оно есть; применить можно сразу кнопкой «⟳ Обновить сейчас» —
      или оно само встанет при следующем полном запуске приложения.</p>
    <div class="row" style="margin-top:8px">
      <button class="btn primary" disabled={otaBusy} onclick={checkOta}>
        {otaBusy ? (otaProg ?? 'Проверяю…') : 'Проверить обновление'}</button>
      {#if ota.state === 'queued'}
        <button class="btn" disabled={otaBusy} onclick={applyOta}>⟳ Обновить сейчас</button>
      {/if}
    </div>
    {#if ota.state !== 'idle' && ota.state !== 'checking'}
      <!-- во время проверки статус НЕ дублируем: «Проверяю…» уже на кнопке -->
      <div class="msg" class:err={ota.state === 'error'}>{ota.message}</div>
    {/if}
    <div class="hint small" style="margin-top:6px">
      Установлено: <b>{ota.applied}</b>{#if ota.latest} · в манифесте: {ota.latest}{/if}
      {#if ota.native && !ota.pluginOk} · <b>плагин OTA отсутствует</b> (нужен свежий APK){/if}
    </div>
  </div>

  </details>
  <details class="sec">
    <summary class="group">Помощь и связь</summary>
  <div class="block">
    <div class="lbl">Связаться</div>
    <p class="hint small">Вопросы по приложению, идеи, что улучшить (особенно трактовки
      через архетипы) — в Telegram разработчику. Нужен разбор карты — напиши астрологу
      и при желании отправь ей свои данные прямо из приложения.</p>
    <div class="row">
      <a class="btn primary maillink" href={tgHref(OWNER_TG)}>✈ Обратная связь</a>
      <button class="btn maillink" onclick={() => { onclose(); onastrologer?.(); }}>🔮 Написать астрологу</button>
    </div>
  </div>
  </details>

  <footer>Astra · версия {APP_VERSION}{#if ota.applied !== APP_VERSION} · бандл {ota.applied}{/if}</footer>
</section>

<style>
  /* геометрия/бэкдроп — глобальные .sheet-base/.sheet-backdrop; локально z-index + свой нижний паддинг */
  .backdrop { z-index: 20; }
  .sheet { z-index: 21; padding: 16px 16px calc(20px + var(--safe-bottom)); }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); }
  .block { padding: 12px 0; border-top: 1px solid var(--glass-brd); }
  .lbl { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); margin-bottom: 8px; }
  .styles { display: flex; flex-wrap: wrap; gap: 8px; }
  .style { display: inline-flex; align-items: center; gap: 8px; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink-dim); border-radius: 12px; padding: 8px 12px; font-size: 0.85rem; }
  .style.on { border-color: var(--accent); color: var(--ink); background: #ffffff1e; }
  .sw { width: 14px; height: 14px; border-radius: 50%; display: inline-block; }
  .st-auto .sw { background: linear-gradient(120deg, #cdd6ff 0 42%, #f3c969 54%, #7fd99a 68%, #7fd0ff 82%, #b39bff); }
  .st-silver .sw { background: var(--silver); }
  .st-gold .sw { background: var(--gold); box-shadow: 0 0 6px var(--gold); }
  .st-element .sw { background: conic-gradient(#ff8a5b, #7fd99a, #7fd0ff, #b39bff, #ff8a5b); }
  .st-shimmer .sw { background: linear-gradient(90deg, #f3c969, #cdd6ff, #9b8cff); }
  .st-rainbow .sw { background: linear-gradient(90deg, #ff6b6b, #f3c969, #7fd99a, #7fd0ff, #b39bff); }
  .select { width: 100%; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 12px; padding: 9px 12px; font: inherit; }
  .small { font-size: 0.78rem; color: var(--ink-faint); }
  .group { margin: 16px 2px 2px; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1.5px; color: var(--accent); font-weight: 600; }
  /* сворачиваемые разделы (accordion): заголовок = <summary>, блоки — внутри <details> */
  details.sec { border-top: 1px solid var(--glass-brd); }
  details.sec:first-of-type { border-top: none; }
  summary.group { list-style: none; cursor: pointer; user-select: none;
    display: flex; align-items: center; justify-content: space-between; margin: 0; padding: 13px 2px; }
  summary.group::-webkit-details-marker { display: none; }
  summary.group::after { content: '▾'; color: var(--ink-faint); font-size: 0.9rem; transition: transform 0.2s ease; }
  details.sec[open] > summary.group::after { transform: rotate(180deg); }
  /* тумблеры объектов */
  .objgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 4px; }
  .objchip { display: flex; align-items: center; gap: 6px; background: #ffffff0c;
    border: 1px solid var(--glass-brd); border-radius: 10px; padding: 8px 10px;
    color: var(--ink-faint); font-size: 0.84rem; }
  .objchip .g { font-size: 1.05rem; color: var(--silver); width: 1.3rem; text-align: center; opacity: 0.5; }
  .objchip.on { color: var(--ink); border-color: var(--accent); background: #ffffff1a; }
  .objchip.on .g { opacity: 1; }
  .orbgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
  .orbcell { display: flex; align-items: center; gap: 6px; background: #ffffff0c; border: 1px solid var(--glass-brd); border-radius: 10px; padding: 6px 8px; }
  .orbcell .g { font-size: 1.05rem; color: var(--silver); width: 1.3rem; text-align: center; }
  .orbcell input { width: 100%; min-width: 0; background: transparent; border: none; color: var(--ink); font: inherit; padding: 2px 0; }
  .orbcell .u { color: var(--ink-faint); }
  .orb { display: inline-flex; align-items: center; gap: 6px; }
  .orb input { width: 78px; background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink); border-radius: 10px; padding: 8px 10px; font: inherit; }
  /* окошко времени сводки: 78px обрезало цифры («9:00 не видна полностью») —
     полю времени нужна своя ширина под системный виджет Android */
  .orb input[type='time'] { width: auto; min-width: 116px; text-align: center;
    font-variant-numeric: tabular-nums; font-family: var(--font-mono); }
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
  /* тема-зависимо: на «Рассвете» светло-розовый текст сливался с белым (жалоба) */
  .msg.err { background: color-mix(in srgb, var(--rose) 14%, transparent); color: var(--rose); }
  .maillink { display: inline-block; text-decoration: none; text-align: center; }
  /* карточка-пояснение перед системным запросом уведомлений (П.8 онбординга) */
  .whycard { border: 1px solid var(--accent); border-radius: 14px; padding: 12px 14px;
    margin-bottom: 12px; background: color-mix(in srgb, var(--accent) 8%, transparent); }
  .whycard b { display: block; margin-bottom: 6px; }
  .whycard p { margin: 0 0 10px; font-size: 0.86rem; color: var(--ink-dim); }
  footer { margin-top: 14px; text-align: center; color: var(--ink-faint); font-size: 0.74rem; }
</style>
