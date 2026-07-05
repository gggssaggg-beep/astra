<script lang="ts">
  /**
   * Хаб совмещённых карт («Добавить» в нижнем меню). Хранит коллекцию людей
   * (CRUD) и строит карты трёх типов:
   *   • Транзит + натал        — двойное кольцо (натал внутри, транзит снаружи);
   *   • Транзит + натал + натал — тройное кольцо (A / B / транзит), межаспекты
   *                               транзита к каждому наталу;
   *   • Синастрия              — два натала, межаспекты A×B (композит владелица не ведёт).
   * Одна шторка, виды: список → форма человека → карта. Момент рождения —
   * DST-безопасный zonedTimeUTC. Транзит берётся на «сейчас» (кнопка ⟳ обновляет).
   */
  import { untrack } from 'svelte';
  import { bottomSheet } from '../lib/sheet.ts';
  import { db, uid } from '../lib/db.ts';
  import type { Person, SignStyle } from '../lib/models.ts';
  import type { Engine } from '../engine/index.ts';
  import { synastryAspects, staticKey } from '../engine/index.ts';
  import type { StaticAspect } from '../engine/index.ts';
  import { natalPositions, birthInstantUTC } from '../lib/charts.ts';
  import { fmtPos, zonedTimeUTC } from '../lib/format.ts';
  import { maskDate, maskTime, isoFromMasked, maskedFromIso, normTime } from '../lib/inputmask.ts';
  import { searchCities, type City } from '../lib/cities.ts';
  import { forecastTransits, type TransitHit } from '../lib/forecast.ts';
  import Wheel from './Wheel.svelte';
  import StaticAspectRow from './StaticAspectRow.svelte';
  import StaticInterpretationSheet from './StaticInterpretationSheet.svelte';
  import TransitDial from './TransitDial.svelte';

  type Mode = 'transitNatal' | 'triple' | 'synastry';

  let { engine, orbOf, signStyle, defaultTz, tz, objects = null, houseSystem = 'placidus',
        initialMode = 'transitNatal', onclose, onchat, oncommunity }:
    { engine: Engine; orbOf: (name: string) => number; signStyle: SignStyle;
      defaultTz: string; tz: string; objects?: string[] | null; houseSystem?: string;
      initialMode?: Mode; onclose: () => void;
      onchat?: (seed: string, source: { objects: string[]; aspectSignature?: string; title?: string }) => void;
      oncommunity?: (sig: string, title: string) => void } = $props();

  // открытый межаспект (детальная шторка «как на главном»)
  let detail = $state<StaticAspect | null>(null);
  let detailA = $state<string | null>(null);
  let detailB = $state<string | null>(null);
  function openDetail(a: StaticAspect, oa: string | null, ob: string | null): void {
    selKey = staticKey(a); detail = a; detailA = oa; detailB = ob;
  }

  let view = $state<'list' | 'form' | 'chart'>('list');
  let mode = $state<Mode>(untrack(() => initialMode));
  // db.people.all() отдаёт ТУ ЖЕ ссылку — держим локальную копию, .slice() после мутаций
  let people = $state(db.people.all().slice());
  let pair = $state<string[]>([]);              // выбранные id (0 → «А», 1 → «Б»)
  let selKey = $state<string | null>(null);     // выделенная линия в колесе

  const MODES: { id: Mode; label: string; need: number; hint: string }[] = [
    { id: 'transitNatal', label: 'Транзит + натал', need: 1, hint: 'небо сейчас к карте человека' },
    { id: 'triple', label: 'Транзит + 2 натала', need: 2, hint: 'небо сейчас к двум людям' },
    { id: 'synastry', label: 'Синастрия', need: 2, hint: 'межаспекты карт двух людей' },
  ];
  const needCount = $derived(MODES.find((m) => m.id === mode)!.need);

  function setMode(m: Mode): void {
    mode = m;
    const need = MODES.find((x) => x.id === m)!.need;
    if (pair.length > need) pair = pair.slice(0, need);
    selKey = null;
  }

  const personA = $derived(people.find((p) => p.id === pair[0]) ?? null);
  const personB = $derived(people.find((p) => p.id === pair[1]) ?? null);

  // расчёт: движок зовём при смене людей/режима/момента (не при выделении линии)
  const posA = $derived(personA ? natalPositions(engine, personA, objects ?? undefined) : []);
  const posB = $derived(personB ? natalPositions(engine, personB, objects ?? undefined) : []);

  // дома внутренней карты (человек A) — нужны место (координаты) и известное время
  const hasPlace = (p: typeof personA): boolean =>
    !!p?.place && (p.place.lat !== 0 || p.place.lon !== 0);
  const housesA = $derived.by(() => {
    if (!personA || personA.unknownTime || !hasPlace(personA)) return null;
    return engine.houses(engine.toJD(birthInstantUTC(personA)), personA.place!.lat, personA.place!.lon, houseSystem);
  });

  // транзит: старт «сейчас», можно проматывать (ввод даты/времени, шаги, диск)
  let transitAt = $state(new Date());
  const transitPos = $derived(engine.positions(transitAt, objects ?? undefined));
  const transitLabel = $derived(new Intl.DateTimeFormat('ru-RU',
    { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(transitAt));
  function refreshTransit(): void { transitAt = new Date(); }
  function stepTransit(ms: number): void { transitAt = new Date(transitAt.getTime() + ms); }

  // поля даты/времени транзита в поясе вывода — зеркалят transitAt (шаги/диск их
  // обновляют), правка поля применяется в transitAt
  let tDate = $state('');
  let tTime = $state('');
  $effect(() => {
    tDate = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(transitAt);
    tTime = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(transitAt);
  });
  function applyTransitFields(): void {
    const iso = isoFromMasked(tDate);
    const tm = normTime(tTime);
    if (iso && tm) transitAt = zonedTimeUTC(iso, tm, tz);
  }

  // --- прогноз: ближайшие точные транзиты к наталу(ам) ---
  let forecastDays = $state(90);
  let forecastList = $state<TransitHit[]>([]);
  let forecastBusy = $state(false);
  let forecastRan = $state(false);
  // прогноз транзитов доступен во ВСЕХ вариантах (синастрия — к обоим наталам)
  const forecastTargets = $derived(
    personA && personB ? [{ owner: personA.name, pos: posA }, { owner: personB.name, pos: posB }]
      : personA ? [{ owner: personA.name, pos: posA }] : []);
  async function runForecast(): Promise<void> {
    if (forecastBusy || !forecastTargets.length) return;
    forecastBusy = true; forecastRan = false;
    try { forecastList = await forecastTransits(engine, forecastTargets, transitAt, forecastDays, objects ?? undefined); }
    catch { forecastList = []; }
    finally { forecastBusy = false; forecastRan = true; }
  }
  function gotoHit(h: TransitHit): void { transitAt = new Date(h.when); selKey = null; }
  const fmtHit = (d: Date): string => new Intl.DateTimeFormat('ru-RU',
    { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);

  // межаспекты по режиму (p1 всегда из первого набора)
  const crossSyn = $derived(posA.length && posB.length ? synastryAspects(posA, posB, orbOf) : []);
  const crossTA = $derived(posA.length ? synastryAspects(posA, transitPos, orbOf) : []);
  const crossTB = $derived(posB.length ? synastryAspects(posB, transitPos, orbOf) : []);

  const TZs = ZONES(); // полный список IANA (native select не глючит)
  function ZONES(): string[] {
    const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    return f ? f('timeZone') : ['UTC', 'Europe/Moscow', 'Asia/Yekaterinburg', 'Asia/Novosibirsk'];
  }

  const fmtBirth = (p: Person): string => {
    const [y, m, d] = p.birthDate.split('-');
    const tm = p.unknownTime || !p.birthTime ? 'время неизвестно' : p.birthTime;
    const where = p.place?.name ? ` · ${p.place.name}` : '';
    return `${d}.${m}.${y} · ${tm} · ${p.birthTz}${where}`;
  };

  function toggleSel(id: string): void {
    if (pair.includes(id)) { pair = pair.filter((x) => x !== id); return; }
    if (pair.length < needCount) pair = [...pair, id];
    else if (needCount === 1) pair = [id];   // одиночный режим — замена
    // иначе (уже двое) третий тап игнорируем
  }

  // --- форма (добавить/править человека) ---
  let editId = $state<string | null>(null);
  let fName = $state('');
  let fDate = $state('');   // маскированная «ДД.ММ.ГГГГ»
  let fTime = $state('');   // маскированная «ЧЧ:ММ:СС»
  let fUnknown = $state(false);
  let fTz = $state('');
  let fPlaceName = $state('');
  let fLat = $state<number | null>(null);
  let fLon = $state<number | null>(null);
  let fErr = $state<string | null>(null);
  let tzBad = $state(false);
  let cityQuery = $state('');
  let citySug = $state<City[]>([]);
  let manualPlace = $state(false);

  function onCityInput(v: string): void { cityQuery = v; citySug = searchCities(v); }
  function pickCity(c: City): void {
    fPlaceName = c.ru; cityQuery = c.ru; fLat = c.lat; fLon = c.lon; fTz = c.tz; citySug = []; tzBad = false;
  }
  const onDate = (v: string) => { fDate = maskDate(v); fErr = null; };
  const onTime = (v: string) => { fTime = maskTime(v); fErr = null; };

  function openNew(): void {
    editId = null; fName = ''; fDate = ''; fTime = ''; fUnknown = false; fTz = defaultTz;
    fPlaceName = ''; fLat = null; fLon = null; fErr = null; tzBad = false;
    cityQuery = ''; citySug = []; manualPlace = false;
    view = 'form';
  }
  function openEdit(p: Person): void {
    editId = p.id; fName = p.name; fDate = maskedFromIso(p.birthDate);
    fTime = p.birthTime ?? ''; fUnknown = p.unknownTime; fTz = p.birthTz;
    fPlaceName = p.place?.name ?? ''; fLat = p.place?.lat ?? null; fLon = p.place?.lon ?? null;
    cityQuery = p.place?.name ?? ''; citySug = []; manualPlace = !p.place?.name && p.place != null;
    fErr = null; tzBad = false;
    view = 'form';
  }
  function toggleUnknown(): void { if (fUnknown) fTime = ''; }

  function save(): void {
    fErr = null; tzBad = false;
    const name = fName.trim();
    if (!name) { fErr = 'Впиши имя.'; return; }
    const iso = isoFromMasked(fDate);
    if (!iso) { fErr = 'Дата рождения — как ДД.ММ.ГГГГ (например 01.06.1988).'; return; }
    let time: string | null = null;
    if (!fUnknown && fTime.trim()) {
      time = normTime(fTime);
      if (!time) { fErr = 'Время — как ЧЧ:ММ или ЧЧ:ММ:СС (например 04:30 или 04:30:15).'; return; }
    }
    const tzv = fTz.trim();
    try { new Intl.DateTimeFormat('ru', { timeZone: tzv }); }
    catch { tzBad = true; fErr = 'Не узнаю такой часовой пояс — выбери город или пояс вручную.'; return; }
    if (fLat != null && (fLat < -90 || fLat > 90)) { fErr = 'Широта — от −90 до 90.'; return; }
    if (fLon != null && (fLon < -180 || fLon > 180)) { fErr = 'Долгота — от −180 до 180.'; return; }
    const place = (fPlaceName.trim() || fLat != null || fLon != null)
      ? { name: fPlaceName.trim() || cityQuery.trim(), lat: fLat ?? 0, lon: fLon ?? 0 } : null;
    const prev = editId ? db.people.get(editId) : null;
    db.people.put({
      id: editId ?? uid(), name, birthDate: iso,
      birthTime: time, birthTz: tzv, place, unknownTime: time == null,
      createdAt: prev?.createdAt ?? new Date().toISOString(),
    });
    people = db.people.all().slice();
    view = 'list';
  }
  function del(): void {
    if (!editId) return;
    if (!confirm('Удалить этого человека?')) return;
    db.people.remove(editId);
    pair = pair.filter((id) => id !== editId);
    people = db.people.all().slice();
    view = 'list';
  }

  function onStatic(key: string): void { selKey = selKey === key ? null : key; }
  function toList(): void { view = 'list'; selKey = null; }
  function openChart(): void { transitAt = new Date(); selKey = null; view = 'chart'; }

  const chartTitle = $derived(
    mode === 'synastry' ? `${personA?.name} ✕ ${personB?.name}`
    : mode === 'triple' ? `Транзит · ${personA?.name} + ${personB?.name}`
    : `Транзит · ${personA?.name}`);
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Совмещённые карты" use:bottomSheet={{ onclose }}>
  {#if view === 'list'}
    <header><h2>Карты и люди</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>

    <div class="seg modes">
      {#each MODES as m}
        <button class:on={mode === m.id} onclick={() => setMode(m.id)}>{m.label}</button>
      {/each}
    </div>
    <div class="hint">{MODES.find((m) => m.id === mode)!.hint} — выбери
      {needCount === 1 ? 'человека' : 'двух людей'}.</div>

    {#if people.length === 0}
      <div class="empty">Пока никого нет — добавь первого человека.</div>
    {/if}
    {#each people as p (p.id)}
      {@const idx = pair.indexOf(p.id)}
      <div class="prow" class:sel={idx >= 0}>
        <button class="pmain" onclick={() => toggleSel(p.id)}>
          {#if idx >= 0}<span class="badge">{idx === 0 ? 'А' : 'Б'}</span>{/if}
          <span class="pinfo"><b>{p.name}</b><small>{fmtBirth(p)}</small></span>
        </button>
        <button class="edit" onclick={() => openEdit(p)} aria-label="Править">✎</button>
      </div>
    {/each}

    <button class="btn add" onclick={openNew}>+ Добавить человека</button>
    {#if pair.length === needCount}
      <button class="btn primary open" onclick={openChart}>Открыть карту →</button>
    {/if}

  {:else if view === 'form'}
    <header>
      <button class="back" onclick={toList} aria-label="Назад">←</button>
      <h2>{editId ? 'Править человека' : 'Новый человек'}</h2>
      <button class="x" onclick={onclose} aria-label="Закрыть">✕</button>
    </header>

    <label class="fld"><span>Имя</span>
      <input type="text" bind:value={fName} placeholder="Имя" /></label>
    <div class="two">
      <label class="fld"><span>Дата рождения</span>
        <input type="text" inputmode="numeric" value={fDate} placeholder="ДД.ММ.ГГГГ"
          maxlength="10" oninput={(e) => onDate((e.target as HTMLInputElement).value)} /></label>
      <label class="fld"><span>Время (можно с секундами)</span>
        <input type="text" inputmode="numeric" value={fTime} placeholder="ЧЧ:ММ:СС" disabled={fUnknown}
          maxlength="8" oninput={(e) => onTime((e.target as HTMLInputElement).value)} /></label>
    </div>
    <label class="chk">
      <input type="checkbox" bind:checked={fUnknown} onchange={toggleUnknown} />
      Время неизвестно (возьму полдень)</label>

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
      <div class="tzchip" class:bad={tzBad}>Часовой пояс: <b>{fTz}</b>{#if fLat != null} · {fLat.toFixed(2)}, {fLon?.toFixed(2)}{/if}</div>
    {/if}
    <div class="hint small">Город нужен только чтобы взять часовой пояс (и координаты для домов позже) —
      геолокация телефона не используется. Нет в списке — впиши координаты и пояс вручную.</div>

    <details class="place" bind:open={manualPlace}>
      <summary>Координаты и пояс вручную</summary>
      <div class="two">
        <label class="fld"><span>Широта (−90…90)</span>
          <input type="number" step="0.0001" bind:value={fLat} placeholder="59.9391" /></label>
        <label class="fld"><span>Долгота (−180…180)</span>
          <input type="number" step="0.0001" bind:value={fLon} placeholder="30.3159" /></label>
      </div>
      <label class="fld"><span>Часовой пояс места рождения</span>
        <select class="tzsel" bind:value={fTz}>
          {#each TZs as z}<option value={z}>{z}</option>{/each}
        </select></label>
    </details>

    {#if fErr}<div class="err">⚠ {fErr}</div>{/if}
    <div class="formbtns">
      <button class="btn" onclick={toList}>← Назад</button>
      {#if editId}<button class="btn danger" onclick={del}>Удалить</button>{/if}
      <button class="btn primary" onclick={save}>Сохранить</button>
    </div>

  {:else}
    <header>
      <button class="back" onclick={toList} aria-label="К списку">←</button>
      <h2 class="pairttl">{chartTitle}</h2>
    </header>

    {#snippet transitCtl()}
      <div class="tctl">
        <button class="mini" onclick={() => stepTransit(-86_400_000)} aria-label="День назад">‹ день</button>
        <input class="tin" inputmode="numeric" maxlength="10" value={tDate} aria-label="Дата транзита"
          oninput={(e) => (tDate = maskDate((e.target as HTMLInputElement).value))} onchange={applyTransitFields} />
        <input class="tin tt" inputmode="numeric" maxlength="5" value={tTime} aria-label="Время транзита"
          oninput={(e) => (tTime = maskTime((e.target as HTMLInputElement).value))} onchange={applyTransitFields} />
        <button class="mini" onclick={() => stepTransit(86_400_000)} aria-label="День вперёд">день ›</button>
        <button class="mini now" onclick={refreshTransit}>сейчас</button>
      </div>
      <TransitDial value={transitAt} {tz} onchange={(d) => (transitAt = d)} />
    {/snippet}

    {#if mode === 'synastry'}
      <Wheel positions={posA} positionsOuter={posB} staticAspects={crossSyn} {signStyle} houses={housesA}
        selectedStaticKey={selKey} onstatictap={onStatic} />
      <div class="legend">внутри — {personA?.name}, снаружи — {personB?.name}</div>
    {:else if mode === 'transitNatal'}
      <Wheel positions={posA} positionsOuter={transitPos} staticAspects={crossTA} {signStyle} houses={housesA}
        selectedStaticKey={selKey} onstatictap={onStatic} />
      <div class="legend">внутри — {personA?.name}, снаружи — транзит на {transitLabel}</div>
      {@render transitCtl()}
    {:else}
      <Wheel positions={posA} positionsOuter={posB} positionsOuter2={transitPos}
        staticAspects={crossTA} staticAspects2={crossTB} {signStyle} houses={housesA}
        selectedStaticKey={selKey} onstatictap={onStatic} />
      <div class="legend">внутри — {personA?.name}, среднее — {personB?.name}, снаружи — транзит на {transitLabel}</div>
      {@render transitCtl()}
    {/if}

    {#if personA?.unknownTime}
      <div class="warn">⚠ У {personA.name} время рождения не задано — взят полдень, Луна и быстрые точки неточны.</div>
    {/if}
    {#if (mode === 'synastry' || mode === 'triple') && personB?.unknownTime}
      <div class="warn">⚠ У {personB.name} время рождения не задано — взят полдень, Луна и быстрые точки неточны.</div>
    {/if}

    {#if mode === 'synastry'}
      {#if crossSyn.length === 0}<div class="empty">Нет мажорных аспектов в орбисе.</div>{/if}
      {#each crossSyn as a}
        <StaticAspectRow {a} ownerA={personA?.name} ownerB={personB?.name}
          selected={staticKey(a) === selKey} ontap={() => openDetail(a, personA?.name ?? null, personB?.name ?? null)} />
      {/each}
    {:else if mode === 'transitNatal'}
      {#if crossTA.length === 0}<div class="empty">Транзит сейчас не делает мажорных аспектов к карте в орбисе.</div>{/if}
      {#each crossTA as a}
        <StaticAspectRow {a} ownerA={personA?.name} ownerB={'транзит'}
          selected={staticKey(a) === selKey} ontap={() => openDetail(a, personA?.name ?? null, 'транзит')} />
      {/each}
    {:else}
      <div class="grp">Транзит → {personA?.name}</div>
      {#if crossTA.length === 0}<div class="empty">Нет аспектов в орбисе.</div>{/if}
      {#each crossTA as a}
        <StaticAspectRow {a} ownerA={personA?.name} ownerB={'транзит'}
          selected={staticKey(a) === selKey} ontap={() => openDetail(a, personA?.name ?? null, 'транзит')} />
      {/each}
      <div class="grp">Транзит → {personB?.name}</div>
      {#if crossTB.length === 0}<div class="empty">Нет аспектов в орбисе.</div>{/if}
      {#each crossTB as a}
        <StaticAspectRow {a} ownerA={personB?.name} ownerB={'транзит'}
          selected={staticKey(a) === selKey} ontap={() => openDetail(a, personB?.name ?? null, 'транзит')} />
      {/each}
    {/if}

    {#if forecastTargets.length}
      <div class="fc">
        <div class="fchead">
          <span class="grp">Прогноз транзитов</span>
          <div class="fcdays">
            {#each [30, 90, 180, 365] as d}
              <button class="mini" class:on={forecastDays === d} onclick={() => (forecastDays = d)}>{d}д</button>
            {/each}
          </div>
        </div>
        <button class="btn" disabled={forecastBusy} onclick={runForecast}>
          {forecastBusy ? 'Считаю…' : `Показать на ${forecastDays} дн. от текущего момента`}</button>
        {#if forecastRan}
          {#if forecastList.length === 0}<div class="empty">В этом окне точных транзитов нет.</div>{/if}
          {#each forecastList as h}
            <button class="fcrow" onclick={() => gotoHit(h)}>
              <span class="fcglyph glyph">{h.tGlyph}<span class="fcasp">{h.symbol}</span>{h.nGlyph}</span>
              <span class="fcnames">{h.tName} {h.aspect} {h.nName} <small>({h.owner})</small></span>
              <span class="fcdate">{fmtHit(h.when)} <span class="go">→</span></span>
            </button>
          {/each}
        {/if}
      </div>
    {/if}

    <details class="positions">
      <summary>Позиции</summary>
      <div class="posgrp">{personA?.name}</div>
      {#each posA as p}<div class="posrow"><span class="glyph">{p.glyph}</span> {p.name} — {fmtPos(p.lon)}</div>{/each}
      {#if mode === 'synastry' || mode === 'triple'}
        <div class="posgrp">{personB?.name}</div>
        {#each posB as p}<div class="posrow"><span class="glyph">{p.glyph}</span> {p.name} — {fmtPos(p.lon)}</div>{/each}
      {/if}
      {#if mode !== 'synastry'}
        <div class="posgrp">Транзит ({transitLabel})</div>
        {#each transitPos as p}<div class="posrow"><span class="glyph">{p.glyph}</span> {p.name} — {fmtPos(p.lon)}</div>{/each}
      {/if}
    </details>
  {/if}
</section>

{#if detail}
  <StaticInterpretationSheet a={detail} ownerA={detailA} ownerB={detailB} {tz}
    onclose={() => (detail = null)}
    onchat={(seed, src) => { detail = null; onchat?.(seed, src); }}
    oncommunity={(s, t) => { detail = null; oncommunity?.(s, t); }} />
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 20; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    max-height: 90vh; overflow-y: auto; z-index: 21; padding: 16px 16px calc(18px + var(--safe-bottom));
    border-radius: 22px 22px 0 0; animation: up 0.34s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .pairttl { flex: 1; text-align: center; font-size: 1rem; }
  .x, .back { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); flex: none; }
  .hint { color: var(--ink-faint); font-size: 0.84rem; margin: 4px 0 12px; }
  .empty { color: var(--ink-faint); font-size: 0.86rem; margin: 10px 0; text-align: center; }

  /* переключатель типа карты */
  .seg.modes { display: flex; gap: 4px; margin: 6px 0 8px; border: 1px solid var(--glass-brd);
    border-radius: 12px; overflow: hidden; }
  .seg.modes button { flex: 1; background: transparent; border: none; color: var(--ink-dim);
    padding: 9px 6px; font-size: 0.8rem; }
  .seg.modes button.on { background: var(--accent); color: var(--on-accent); font-weight: 600; }

  /* список людей */
  .prow { display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
    border-radius: 14px; background: #ffffff08; border: 1px solid var(--glass-brd); }
  .prow.sel { background: color-mix(in srgb, var(--glass) 80%, var(--neon-cyan) 8%);
    border-color: color-mix(in srgb, var(--neon-cyan) 45%, var(--glass-brd)); }
  .pmain { flex: 1; display: flex; align-items: center; gap: 10px; text-align: left;
    background: transparent; border: none; color: var(--ink); padding: 12px 14px; }
  .badge { flex: none; width: 1.5rem; height: 1.5rem; border-radius: 50%; display: grid; place-items: center;
    font-size: 0.8rem; font-weight: 700; background: var(--accent); color: var(--on-accent); }
  .pinfo { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .pinfo b { font-family: var(--font-display); font-weight: 600; }
  .pinfo small { color: var(--ink-faint); font-size: 0.76rem; }
  .edit { flex: none; background: transparent; border: none; color: var(--ink-dim); font-size: 1rem; padding: 12px 14px; }

  /* кнопки */
  .btn { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 11px 14px; }
  .btn.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); font-weight: 600; }
  .btn.danger { color: var(--rose); }
  .btn.add { width: 100%; margin-top: 6px; }
  .btn.open { width: 100%; margin-top: 10px; }

  /* форма */
  .fld { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
  .fld > span { color: var(--ink-dim); font-size: 0.8rem; }
  .fld input { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 10px 12px; font: inherit; }
  .fld input:disabled { opacity: 0.5; }
  .chk { display: flex; align-items: center; gap: 8px; color: var(--ink-dim); font-size: 0.86rem; margin-bottom: 10px; }
  .place { margin-bottom: 10px; }
  .place summary { color: var(--ink-dim); font-size: 0.86rem; cursor: pointer; margin-bottom: 8px; }
  .two { display: flex; gap: 10px; }
  .two .fld { flex: 1; min-width: 0; }
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
  .formbtns { display: flex; gap: 8px; justify-content: flex-end; }

  /* карта */
  .legend { color: var(--ink-faint); font-size: 0.78rem; text-align: center; margin: 4px 0 12px; }
  .mini { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink-dim);
    border-radius: 999px; padding: 3px 10px; font-size: 0.74rem; }
  .mini.now { color: var(--accent); }
  /* панель прокрутки транзита */
  .tctl { display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap; margin: 2px 0; }
  .tin { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 10px; padding: 6px 8px; font: inherit; font-family: var(--font-mono);
    font-variant-numeric: tabular-nums; text-align: center; width: 6.4rem; }
  .tin.tt { width: 4rem; }
  /* прогноз транзитов */
  .fc { margin-top: 14px; }
  .fchead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .fcdays { display: flex; gap: 4px; }
  .mini.on { background: var(--accent); color: var(--on-accent); border-color: transparent; }
  .fc .btn { width: 100%; }
  .fcrow { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    background: #ffffff0c; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 8px 12px; margin: 6px 0; }
  .fcrow:hover { background: #ffffff16; }
  .fcglyph { font-size: 1.05rem; letter-spacing: 1px; flex: none; }
  .fcasp { margin: 0 2px; opacity: 0.9; }
  .fcnames { flex: 1; min-width: 0; color: var(--ink-dim); font-size: 0.82rem;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fcnames small { color: var(--ink-faint); }
  .fcdate { flex: none; font-family: var(--font-mono); font-size: 0.74rem; color: var(--ink-faint);
    font-variant-numeric: tabular-nums; }
  .fcdate .go { color: var(--accent); }
  .grp { color: var(--accent); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px;
    font-weight: 600; margin: 12px 2px 6px; }
  .warn { color: var(--gold); font-size: 0.8rem; margin: 6px 0; }
  .positions { margin-top: 12px; }
  .positions summary { color: var(--ink-dim); font-size: 0.86rem; cursor: pointer; }
  .posgrp { color: var(--ink-dim); font-size: 0.8rem; font-weight: 600; margin: 8px 0 4px; }
  .posrow { color: var(--ink-dim); font-size: 0.86rem; padding: 2px 0; }
</style>
