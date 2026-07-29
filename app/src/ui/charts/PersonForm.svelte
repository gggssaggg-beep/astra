<script lang="ts">
  /** Форма «добавить / править человека» карт (вынесено из ChartsSheet, SR-4).
   *  Самодостаточна: держит всё своё состояние, маски ввода, поиск города и
   *  сама пишет в db.people. Наружу — только колбэки: сохранено / удалён / назад
   *  / закрыть шторку. Монтируется, когда ChartsSheet во view='form'; инициализ.
   *  из пропа `person` (null = новый) один раз при маунте. */
  import { untrack } from 'svelte';
  import { db, uid } from '../../lib/db.ts';
  import type { Person } from '../../lib/models.ts';
  import { maskDate, maskTime, maskWithCaret, isoFromMasked, maskedFromIso, normTime } from '../../lib/inputmask.ts';
  import { searchCities, type City } from '../../lib/cities.ts';
  import { fixedTzMinutes, fixedTzId, tzLabel, tzValid } from '../../lib/format.ts';
  import Hint from '../Hint.svelte';

  let { person, defaultTz, onsaved, ondeleted, oncancel, onclose,
        embedded = false, defaultName, saveLabel }:
    { person: Person | null; defaultTz: string;
      onsaved: (id: string) => void; ondeleted: (id: string) => void;
      oncancel: () => void; onclose: () => void;
      // embedded — форма без своей шапки (её даёт хост, напр. приветствие);
      // defaultName — предзаполнить имя («Я» в онбординге); saveLabel — текст кнопки.
      embedded?: boolean; defaultName?: string; saveLabel?: string } = $props();

  // список поясов — форма всегда видна при маунте, считаем сразу
  function ZONES(): string[] {
    const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    return f ? f('timeZone') : ['UTC', 'Europe/Moscow', 'Asia/Yekaterinburg', 'Asia/Novosibirsk'];
  }
  const TZs = ZONES();

  /** Пояс ЧИСЛОМ (GMT±ч) — правка астролога 2026-07-29: «нужен GMT+3, по городу
   *  и стране не находит». Список — реально существующие смещения, включая
   *  получасовые и Непал (+5:45); ввод руками не нужен, ошибиться нечем. */
  const GMT_OFFSETS = [-720, -660, -600, -570, -540, -480, -420, -360, -300, -270, -240, -210,
    -180, -120, -60, 0, 60, 120, 180, 210, 240, 270, 300, 330, 345, 360, 390, 420, 480, 525,
    540, 570, 600, 630, 660, 720, 765, 780, 840];
  const GMT_LIST = GMT_OFFSETS.map((m) => ({ id: fixedTzId(m), label: tzLabel(fixedTzId(m)) }));

  // Инициализация ОДИН раз из пропа (компонент ремонтируется при каждом входе в
  // форму). untrack — снимок без реактивной подписки: значения стартовые, дальше
  // форма живёт своим состоянием (иначе svelte ругается state_referenced_locally).
  // id правимого фиксирован на маунт (переключение человека идёт через список).
  const p0 = untrack(() => person);
  const dtz = untrack(() => defaultTz);
  const editId = p0?.id ?? null;
  let fName = $state(p0?.name ?? untrack(() => defaultName) ?? '');
  let fDate = $state(p0 ? maskedFromIso(p0.birthDate) : '');   // «ДД.ММ.ГГГГ»
  let fTime = $state(p0?.birthTime ?? '');                      // «ЧЧ:ММ:СС»
  let fUnknown = $state(p0?.unknownTime ?? false);
  let fSlowOnly = $state(p0?.slowOnly ?? false);
  let fTz = $state(p0?.birthTz ?? dtz);
  let fPlaceName = $state(p0?.place?.name ?? '');
  let fLat = $state<number | null>(p0?.place?.lat ?? null);
  let fLon = $state<number | null>(p0?.place?.lon ?? null);
  let fErr = $state<string | null>(null);
  let tzBad = $state(false);
  let cityQuery = $state(p0?.place?.name ?? '');
  let citySug = $state<City[]>([]);
  let manualPlace = $state(p0 ? (!p0.place?.name && p0.place != null) : false);
  let confirmDel = $state(false);
  // каким способом задаётся пояс вручную: городом (IANA) или числом (GMT±ч)
  let tzMode = $state<'city' | 'gmt'>(fixedTzMinutes(untrack(() => p0?.birthTz ?? dtz)) != null ? 'gmt' : 'city');

  function onCityInput(v: string): void { cityQuery = v; citySug = searchCities(v); }
  function pickCity(c: City): void {
    fPlaceName = c.ru; cityQuery = c.ru; fLat = c.lat; fLon = c.lon; fTz = c.tz; citySug = [];
    tzBad = false; tzMode = 'city';
  }
  // Маска + ВОЗВРАТ КУРСОРА на место (правка в середине поля больше не швыряет
  // его в конец). Значение полю выставляем сами и сразу ставим курсор: Svelte
  // перерисует то же самое значение, позиция не собьётся.
  function masked(e: Event, mask: (raw: string, prev?: string) => string, prev: string): string {
    const el = e.target as HTMLInputElement;
    const { value, caret } = maskWithCaret(el, mask, prev);
    el.value = value;
    el.setSelectionRange(caret, caret);
    fErr = null;
    return value;
  }
  const onDate = (e: Event) => { fDate = masked(e, maskDate, fDate); };
  const onTime = (e: Event) => { fTime = masked(e, maskTime, fTime); };

  function save(): void {
    fErr = null; tzBad = false;
    const name = fName.trim();
    if (!name) { fErr = 'Впиши имя.'; return; }
    const iso = isoFromMasked(fDate);
    if (!iso) { fErr = 'Дата рождения — как ДД.ММ.ГГГГ (например, 01.06.1988).'; return; }
    let time: string | null = null;
    if (!fUnknown && fTime.trim()) {
      time = normTime(fTime);
      if (!time) { fErr = 'Время — как ЧЧ:ММ или ЧЧ:ММ:СС (например, 04:30 или 04:30:15).'; return; }
    }
    const tzv = fTz.trim();
    if (!tzValid(tzv)) {
      tzBad = true; fErr = 'Не узнаю такой часовой пояс — выбери город, зону или смещение GMT.'; return;
    }
    if (fLat != null && (fLat < -90 || fLat > 90)) { fErr = 'Широта — от −90 до 90.'; return; }
    if (fLon != null && (fLon < -180 || fLon > 180)) { fErr = 'Долгота — от −180 до 180.'; return; }
    const place = (fPlaceName.trim() || fLat != null || fLon != null)
      ? { name: fPlaceName.trim() || cityQuery.trim(), lat: fLat ?? 0, lon: fLon ?? 0 } : null;
    const prev = editId ? db.people.get(editId) : null;
    const newId = editId ?? uid();
    db.people.put({
      id: newId, name, birthDate: iso,
      birthTime: time, birthTz: tzv, place, unknownTime: time == null,
      slowOnly: time == null ? fSlowOnly : false,
      createdAt: prev?.createdAt ?? new Date().toISOString(),
    });
    onsaved(newId);
  }
  // удаление — двухтапное подтверждение прямо на кнопке (без системного confirm)
  function del(): void {
    if (!editId) return;
    if (!confirmDel) {
      confirmDel = true;
      setTimeout(() => (confirmDel = false), 3000);
      return;
    }
    confirmDel = false;
    db.people.remove(editId);
    ondeleted(editId);
  }
</script>

{#if !embedded}
  <header>
    <button class="back" onclick={oncancel} aria-label="Назад">←</button>
    <h2>{editId ? 'Править человека' : 'Новый человек'}</h2>
    <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
  </header>
{/if}

<label class="fld"><span>Имя</span>
  <input type="text" bind:value={fName} placeholder="Имя" /></label>
<div class="two">
  <label class="fld"><span>Дата рождения</span>
    <input type="text" inputmode="numeric" value={fDate} placeholder="ДД.ММ.ГГГГ"
      maxlength="10" oninput={onDate} /></label>
  {#if !fUnknown}
    <label class="fld"><span>Время · чч:мм:сс</span>
      <input type="text" inputmode="numeric" value={fTime} placeholder="ЧЧ:ММ:СС"
        maxlength="8" oninput={onTime} /></label>
  {/if}
</div>
<!-- время рождения: единый выбор (просьба владелицы — «красивое логичное меню») -->
<div class="fld"><span>Время рождения <Hint k="unknown-time" /></span>
  <div class="tmode">
    <button type="button" class:on={!fUnknown} onclick={() => (fUnknown = false)}>Известно</button>
    <button type="button" class:on={fUnknown}
      onclick={() => { fUnknown = true; fTime = ''; }}>Неизвестно — возьму полдень</button>
  </div>
</div>
{#if fUnknown}
  <label class="chk">
    <input type="checkbox" bind:checked={fSlowOnly} />
    Показывать только медленные планеты
    <small class="chksub">быстрые и Луна при полудне неточны</small></label>
{/if}

<div class="fld citywrap">
  <span>Место рождения</span>
  <input type="text" value={cityQuery} placeholder="Город — рус. или англ. (Санкт-Петербург, Saint Petersburg)"
    oninput={(e) => onCityInput((e.target as HTMLInputElement).value)} autocomplete="off" />
  {#if citySug.length}
    <ul class="suggest">
      {#each citySug as c (c.ru + c.tz)}
        <li><button type="button" onclick={() => pickCity(c)}>
          <b>{c.ru}</b> <small>{c.adm} · {c.tz}</small></button></li>
      {/each}
    </ul>
  {/if}
</div>
{#if fTz}
  <div class="tzchip" class:bad={tzBad}>Часовой пояс: <b>{tzLabel(fTz)}</b>{#if fLat != null} · {fLat.toFixed(2)}, {fLon?.toFixed(2)}{/if}</div>
{/if}
<div class="hint small">Город нужен только чтобы взять часовой пояс (и координаты для домов позже) —
  геолокация телефона не используется. Нет в списке — впиши координаты и пояс вручную (там же
  можно задать пояс просто числом, GMT+3).</div>

<details class="place" bind:open={manualPlace}>
  <summary>Координаты и пояс вручную</summary>
  <div class="two">
    <label class="fld"><span>Широта (−90…90)</span>
      <input type="number" step="0.0001" bind:value={fLat} placeholder="59.9391" /></label>
    <label class="fld"><span>Долгота (−180…180)</span>
      <input type="number" step="0.0001" bind:value={fLon} placeholder="30.3159" /></label>
  </div>
  <!-- пояс двумя способами: зоной-городом или ЧИСЛОМ (GMT±ч). Второй — правка
       астролога 2026-07-29: когда города в списке нет, смещение он знает точно,
       а какую зону выбрать — нет. -->
  <div class="fld"><span>Часовой пояс места рождения</span>
    <div class="tmode">
      <button type="button" class:on={tzMode === 'city'}
        onclick={() => { tzMode = 'city'; if (fixedTzMinutes(fTz) != null) fTz = dtz; tzBad = false; }}>Зоной</button>
      <button type="button" class:on={tzMode === 'gmt'}
        onclick={() => { tzMode = 'gmt'; if (fixedTzMinutes(fTz) == null) fTz = fixedTzId(0); tzBad = false; }}>Числом · GMT</button>
    </div>
  </div>
  {#if tzMode === 'gmt'}
    <label class="fld"><span>Смещение от Гринвича</span>
      <select class="tzsel" bind:value={fTz}>
        {#each GMT_LIST as z (z.id)}<option value={z.id}>{z.label}</option>{/each}
      </select></label>
    <div class="hint small">Смещение фиксировано — перевод часов к нему не применяется.
      Ставь то, что было в месте рождения в тот день (например, летнее время СССР).</div>
  {:else}
    <label class="fld"><span>Зона (город/регион)</span>
      <select class="tzsel" bind:value={fTz}>
        {#each TZs as z}<option value={z}>{z}</option>{/each}
      </select></label>
  {/if}
</details>

{#if fErr}<div class="err">⚠ {fErr}</div>{/if}
<div class="formbtns">
  {#if editId}<button class="btn danger" onclick={del}>{confirmDel ? 'Точно удалить?' : 'Удалить'}</button>{/if}
  <button class="btn primary" onclick={save}>{saveLabel ?? 'Сохранить'}</button>
</div>

<style>
  /* шапка/кнопки — ДУБЛЬ общих правил ChartsSheet (scoped-стили не переходят в
     дочерний компонент; форма-only классы перенесены целиком) */
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .x, .back { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); flex: none; }
  .hint { color: var(--ink-faint); font-size: 0.84rem; margin: 4px 0 12px; }
  .btn { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 11px 14px; }
  .btn.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); font-weight: 600; }
  .btn.danger { color: var(--rose); }

  /* форма (перенесено из ChartsSheet) */
  .fld { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
  .fld > span { color: var(--ink-dim); font-size: 0.8rem; }
  .fld input { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 10px 12px; font: inherit; }
  .fld input:disabled { opacity: 0.5; }
  .chk { display: flex; align-items: center; gap: 8px; color: var(--ink-dim); font-size: 0.86rem; margin-bottom: 10px; flex-wrap: wrap; }
  .chksub { flex-basis: 100%; margin-left: 26px; color: var(--ink-faint); font-size: 0.76rem; }
  /* сегмент «время известно/неизвестно» */
  .tmode { display: flex; gap: 6px; }
  .tmode button { flex: 1; background: #ffffff0c; border: 1px solid var(--glass-brd);
    color: var(--ink-dim); border-radius: 12px; padding: 10px 6px; font-size: 0.84rem; }
  .tmode button.on { background: var(--accent); border-color: transparent;
    color: var(--on-accent); font-weight: 600; }
  .place { margin-bottom: 10px; }
  .place summary { color: var(--ink-dim); font-size: 0.86rem; cursor: pointer; margin-bottom: 8px; }
  .two { display: flex; gap: 10px; align-items: end; }
  .two .fld { flex: 1; min-width: 0; }
  /* лейблы полей пары — одной строкой: разноВысокие лейблы съезжали поле «Время» */
  .two .fld > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .small { font-size: 0.78rem; }
  .citywrap { position: relative; }
  .suggest { list-style: none; margin: 4px 0 0; padding: 4px; position: absolute; top: 100%; left: 0; right: 0;
    z-index: 5; background: var(--bg-1); border: 1px solid var(--glass-brd);
    border-radius: 12px; box-shadow: 0 10px 30px #000a; max-height: 46vh; overflow-y: auto; }
  .suggest li { margin: 0; }
  .suggest button { display: block; width: 100%; text-align: left; background: transparent; border: none;
    color: var(--ink); padding: 9px 10px; border-radius: 8px; font: inherit; }
  .suggest button:hover { background: #ffffff14; }
  .suggest small { color: var(--ink-faint); font-size: 0.76rem; margin-left: 6px; }
  .tzchip { display: inline-block; margin: 2px 0 6px; padding: 6px 10px; border-radius: 10px;
    background: #ffffff0c; border: 1px solid var(--glass-brd); color: var(--ink-dim); font-size: 0.82rem; }
  .tzchip b { color: var(--ink); }
  .tzchip.bad { border-color: var(--rose); color: var(--rose); }
  .tzsel { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 10px 12px; font: inherit; }
  .err { color: var(--rose); font-size: 0.84rem; margin-bottom: 10px; }
  /* три кнопки одинаковой высоты в один ряд, надписи не переносятся */
  .formbtns { display: flex; gap: 8px; }
  .formbtns .btn { flex: 1; white-space: nowrap; padding: 11px 8px; text-align: center; }
</style>
