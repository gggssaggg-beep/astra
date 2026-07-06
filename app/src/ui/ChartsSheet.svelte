<script lang="ts" module>
  export type Mode = 'natal' | 'transitNatal' | 'triple' | 'synastry';
  // Память последней открытой карты НА СЕССИЮ: нечаянный свайп-вниз закрывал
  // шторку, и карту приходилось собирать заново (жалоба владелицы 2026-07-06).
  let lastMode: Mode | null = null;
  let lastPair: string[] = [];
  let lastView: 'list' | 'chart' = 'list';
</script>

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
  import { synastryAspects, staticAspects, staticKey, sunRank } from '../engine/index.ts';
  import type { StaticAspect } from '../engine/index.ts';
  import { PLANET_LORE, SIGN_LORE } from '../lib/lore.ts';
  import { natalPositions, birthInstantUTC } from '../lib/charts.ts';
  import { fmtPos, fmtPosRx, zonedTimeUTC } from '../lib/format.ts';
  import { maskDate, maskTime, isoFromMasked, maskedFromIso, normTime } from '../lib/inputmask.ts';
  import { parseDateInput } from '../lib/dateparse.ts';
  import { searchCities, type City } from '../lib/cities.ts';
  import { forecastTransits, transitWindow, type TransitHit, type TransitWindow } from '../lib/forecast.ts';
  import type { BodyPosition } from '../engine/index.ts';
  import Wheel from './Wheel.svelte';
  import StaticAspectRow from './StaticAspectRow.svelte';
  import StaticInterpretationSheet from './StaticInterpretationSheet.svelte';
  import GlowCard from './GlowCard.svelte';

  let { engine, orbOf, signStyle, defaultTz, tz, objects = null, houseSystem = 'placidus',
        initialMode = 'transitNatal', onclose, onchat, oncommunity, ongoto }:
    { engine: Engine; orbOf: (name: string) => number; signStyle: SignStyle;
      defaultTz: string; tz: string; objects?: string[] | null; houseSystem?: string;
      initialMode?: Mode; onclose: () => void;
      onchat?: (seed: string, source: { objects: string[]; aspectSignature?: string; title?: string }) => void;
      oncommunity?: (sig: string, title: string) => void;
      ongoto?: (d: Date) => void } = $props();

  // открытый межаспект (детальная шторка «как на главном»)
  let detail = $state<StaticAspect | null>(null);
  let detailA = $state<string | null>(null);
  let detailB = $state<string | null>(null);
  let detailWin = $state<TransitWindow | null>(null);
  // natalPos — набор натальных позиций (для транзит-режимов: p1 из натала, p2 —
  // транзитная планета) → считаем ОКНО аспекта (вход орбиса → точно → выход).
  function openDetail(a: StaticAspect, oa: string | null, ob: string | null,
    natalPos: BodyPosition[] | null = null, ring: 'A' | 'B' = 'A'): void {
    selKey = staticKey(a); detail = a; detailA = oa; detailB = ob; detailWin = null;
    if (ob === 'транзит' && natalPos) {
      const cached = winFor(a, ring);          // окно уже посчитано для строки?
      if (cached !== undefined) { detailWin = cached; return; }
      const n = natalPos.find((p) => p.name === a.p1);
      if (!n) return;
      // асинхронно: раньше WASM-поиск окна шёл ДО открытия шторки — «заикалось»
      setTimeout(() => {
        try { detailWin = transitWindow(engine, a.p2, n.lon, a.angle, Math.max(orbOf(a.p1), orbOf(a.p2)), transitAt); }
        catch { detailWin = null; }
      }, 40);
    }
  }

  // db.people.all() отдаёт ТУ ЖЕ ссылку — держим локальную копию, .slice() после мутаций
  let people = $state(db.people.all().slice());
  // восстановление последней карты: только при обычном открытии хаба (явный
  // initialMode из Библиотеки — например «Синастрия» — не перебиваем)
  const restore = untrack(() => {
    if (initialMode !== 'transitNatal' || !lastMode) return null;
    const alive = lastPair.filter((id) => db.people.get(id));
    if (alive.length !== lastPair.length) return null;
    const need = lastMode === 'triple' || lastMode === 'synastry' ? 2 : 1;
    return { mode: lastMode, pair: alive,
      view: lastView === 'chart' && alive.length === need ? 'chart' as const : 'list' as const };
  });
  let view = $state<'list' | 'form' | 'chart'>(restore?.view ?? 'list');
  let mode = $state<Mode>(untrack(() => restore?.mode ?? initialMode));
  let pair = $state<string[]>(restore?.pair ?? []); // выбранные id (0 → «А», 1 → «Б»)
  let selKey = $state<string | null>(null);     // выделенная линия в колесе
  let openPos = $state<string | null>(null);    // развёрнутое «Положение» (рамка активна)
  // запоминаем выбор для следующего открытия (память сессии, не диск)
  $effect(() => { lastMode = mode; lastPair = pair.slice(); lastView = view === 'chart' ? 'chart' : 'list'; });

  const MODES: { id: Mode; label: string; need: number; hint: string }[] = [
    { id: 'natal', label: 'Натал', need: 1, hint: 'одна карта — её аспекты и положения' },
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
  // кэш Intl-форматтеров: создание Intl.DateTimeFormat дорогое, а скраб дёргает
  // подписи десятки раз в секунду — пересоздаём только при смене пояса
  let fmtCache: { tz: string; label: Intl.DateTimeFormat; d: Intl.DateTimeFormat; t: Intl.DateTimeFormat } | null = null;
  function fmts(tzv: string) {
    if (!fmtCache || fmtCache.tz !== tzv) fmtCache = {
      tz: tzv,
      label: new Intl.DateTimeFormat('ru-RU', { timeZone: tzv, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      d: new Intl.DateTimeFormat('ru-RU', { timeZone: tzv, day: '2-digit', month: '2-digit', year: 'numeric' }),
      t: new Intl.DateTimeFormat('en-GB', { timeZone: tzv, hour: '2-digit', minute: '2-digit', hour12: false }),
    };
    return fmtCache;
  }
  const transitLabel = $derived(fmts(tz).label.format(transitAt));
  function refreshTransit(): void { transitAt = new Date(); }
  function stepTransit(ms: number): void { transitAt = new Date(transitAt.getTime() + ms); }
  // прокрутка прямо в основном колесе: оборот = сутки (см. Wheel.onscrub).
  // rAF-дебаунс: pointermove приходит чаще кадров, а каждый тик тянет WASM
  // positions()+аспекты — копим дельту и применяем раз в кадр.
  let scrubPending = 0;
  let scrubRaf = 0;
  function scrubTransit(deltaMs: number): void {
    scrubPending += deltaMs;
    if (scrubRaf) return;
    scrubRaf = requestAnimationFrame(() => {
      transitAt = new Date(transitAt.getTime() + scrubPending);
      scrubPending = 0; scrubRaf = 0;
    });
  }

  // поля даты/времени транзита в поясе вывода — зеркалят transitAt (шаги/диск их
  // обновляют), правка поля применяется в transitAt
  let tDate = $state('');
  let tTime = $state('');
  $effect(() => {
    tDate = fmts(tz).d.format(transitAt);
    tTime = fmts(tz).t.format(transitAt);
  });
  function applyTransitFields(): void {
    // терпимый разбор: «1.6.1990», «01.06.1990», ISO — всё принимаем
    const d = parseDateInput(tDate);
    const tm = normTime(tTime) ?? (tTime.trim() ? null : '12:00:00');
    if (!d || !tm) return;
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    transitAt = zonedTimeUTC(iso, tm, tz);
  }

  // --- прогноз: ближайшие точные транзиты к наталу(ам) ---
  let forecastDays = $state(30);
  let forecastList = $state<TransitHit[]>([]);
  let forecastBusy = $state(false);
  let forecastRan = $state(false);
  // прогноз транзитов доступен во ВСЕХ вариантах (синастрия — к обоим наталам)
  const forecastTargets = $derived(
    personA && personB ? [{ owner: personA.name, pos: posA }, { owner: personB.name, pos: posB }]
      : personA ? [{ owner: personA.name, pos: posA }] : []);
  let forecastGen = 0; // защита от устаревшего результата (скраб во время расчёта)
  async function runForecast(): Promise<void> {
    if (forecastBusy || !forecastTargets.length) return;
    const gen = ++forecastGen;
    forecastBusy = true; forecastRan = false;
    try {
      const list = await forecastTransits(engine, forecastTargets, transitAt, forecastDays, objects ?? undefined);
      if (gen !== forecastGen) return;
      forecastList = list;
    } catch { if (gen === forecastGen) forecastList = []; }
    finally { if (gen === forecastGen) { forecastBusy = false; forecastRan = true; } }
  }
  // тап по строке прогноза: перейти к моменту И ВЫДЕЛИТЬ сам аспект (строка +
  // линия в колесе), а не «просто открыть день» (просьба владелицы 2026-07-06)
  const hitKey = (h: TransitHit): string => `${h.nName}|${h.tName}|${h.aspect}`;
  function gotoHit(h: TransitHit): void { transitAt = new Date(h.when); selKey = hitKey(h); }
  const fmtHit = (d: Date): string => fmts(tz).label.format(d);

  // Вертикальный порядок — КАК НА ГЛАВНОМ экране (правило астролога): сверху
  // более быстрые/близкие к Солнцу, затем второй участник, при равенстве —
  // теснее орбис. В транзитных списках ведёт ТРАНЗИТНАЯ планета (p2 — движется).
  const byRank = (x: StaticAspect, y: StaticAspect): number =>
    sunRank(x.p1) - sunRank(y.p1) || sunRank(x.p2) - sunRank(y.p2) || x.orb - y.orb;
  const byTransit = (x: StaticAspect, y: StaticAspect): number =>
    sunRank(x.p2) - sunRank(y.p2) || sunRank(x.p1) - sunRank(y.p1) || x.orb - y.orb;

  // межаспекты по режиму (p1 всегда из первого набора)
  const natalAsp = $derived(posA.length ? staticAspects(posA, orbOf).sort(byRank) : []);
  const crossSyn = $derived(posA.length && posB.length ? synastryAspects(posA, posB, orbOf).sort(byRank) : []);
  const crossTA = $derived(posA.length ? synastryAspects(posA, transitPos, orbOf).sort(byTransit) : []);
  const crossTB = $derived(posB.length ? synastryAspects(posB, transitPos, orbOf).sort(byTransit) : []);

  // «Двойное попадание» (правка астролога, тройная карта): ОДНА транзитная
  // планета аспектирует объекты ОБЕИХ карт сразу — показываем первыми и особо
  // («Луна △ Венера (Аня) · □ Юпитер (Борис)»). Остальные — обычными списками.
  interface DoubleHit { planet: string; glyph: string; toA: StaticAspect[]; toB: StaticAspect[] }
  const doubleHits = $derived.by((): DoubleHit[] => {
    if (mode !== 'triple') return [];
    const byPlanet = new Map<string, DoubleHit>();
    const add = (a: StaticAspect, side: 'toA' | 'toB'): void => {
      let h = byPlanet.get(a.p2);
      if (!h) {
        h = { planet: a.p2, glyph: transitPos.find((p) => p.name === a.p2)?.glyph ?? '•', toA: [], toB: [] };
        byPlanet.set(a.p2, h);
      }
      h[side].push(a);
    };
    for (const a of crossTA) add(a, 'toA');
    for (const a of crossTB) add(a, 'toB');
    return [...byPlanet.values()]
      .filter((h) => h.toA.length && h.toB.length)
      .sort((x, y) => sunRank(x.planet) - sunRank(y.planet));
  });
  const dhPlanets = $derived(new Set(doubleHits.map((h) => h.planet)));
  const singleTA = $derived(mode === 'triple' ? crossTA.filter((a) => !dhPlanets.has(a.p2)) : crossTA);
  const singleTB = $derived(mode === 'triple' ? crossTB.filter((a) => !dhPlanets.has(a.p2)) : crossTB);

  // положения натала (одиночная карта): знак по долготе → разбор знака
  const signIdx = (lon: number): number => Math.floor((((lon % 360) + 360) % 360) / 30);

  // Окна действия транзитных СТРОК (вход → точно → выход) — как на карточках
  // главной. Считаются асинхронно после остановки скраба (дебаунс 300 мс),
  // кэш по паре+углу+дню: WASM не дёргается на каждый тик диска.
  let rowWins = $state(new Map<string, TransitWindow | null>());
  const winCache = new Map<string, TransitWindow | null>();
  let winGen = 0;
  let winTimer: ReturnType<typeof setTimeout> | null = null;
  const winFor = (a: StaticAspect, ring: 'A' | 'B'): TransitWindow | null | undefined =>
    rowWins.get(ring + staticKey(a));
  $effect(() => {
    if (view !== 'chart' || (mode !== 'transitNatal' && mode !== 'triple')) return;
    const jobs = [
      ...crossTA.map((a) => ({ a, natal: posA, ring: 'A' as const })),
      ...(mode === 'triple' ? crossTB.map((a) => ({ a, natal: posB, ring: 'B' as const })) : []),
    ];
    const at = transitAt;
    const gen = ++winGen;
    if (winTimer) clearTimeout(winTimer);
    winTimer = setTimeout(async () => {
      const next = new Map<string, TransitWindow | null>();
      const day = Math.floor(at.getTime() / 86_400_000);
      for (const { a, natal, ring } of jobs) {
        const n = natal.find((p) => p.name === a.p1);
        if (!n) continue;
        const ck = `${a.p2}|${n.lon.toFixed(2)}|${a.angle}|${day}`;
        let w = winCache.get(ck);
        if (w === undefined) {
          try { w = transitWindow(engine, a.p2, n.lon, a.angle, Math.max(orbOf(a.p1), orbOf(a.p2)), at) ?? null; }
          catch { w = null; }
          winCache.set(ck, w);
          await new Promise((r) => setTimeout(r, 0));   // передышка — кадр не виснет
          if (gen !== winGen) return;
        }
        next.set(ring + staticKey(a), w);
        rowWins = new Map(next);   // строки заполняются по мере готовности
      }
    }, 300);
  });

  // полный список IANA (native select не глючит) — лениво: 600+ строк Intl
  // нужны только форме человека, не каждому открытию шторки
  let TZs = $state<string[]>([]);
  $effect(() => { if (view === 'form' && !TZs.length) TZs = ZONES(); });
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
  const onDate = (v: string) => { fDate = maskDate(v, fDate); fErr = null; };
  const onTime = (v: string) => { fTime = maskTime(v, fTime); fErr = null; };

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
    if (!iso) { fErr = 'Дата рождения — как ДД.ММ.ГГГГ (например, 01.06.1988).'; return; }
    let time: string | null = null;
    if (!fUnknown && fTime.trim()) {
      time = normTime(fTime);
      if (!time) { fErr = 'Время — как ЧЧ:ММ или ЧЧ:ММ:СС (например, 04:30 или 04:30:15).'; return; }
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
  // удаление — двухтапное подтверждение прямо на кнопке (без системного confirm)
  let confirmDel = $state(false);
  function del(): void {
    if (!editId) return;
    if (!confirmDel) {
      confirmDel = true;
      setTimeout(() => (confirmDel = false), 3000);
      return;
    }
    confirmDel = false;
    db.people.remove(editId);
    pair = pair.filter((id) => id !== editId);
    people = db.people.all().slice();
    view = 'list';
  }

  function onStatic(key: string): void { selKey = selKey === key ? null : key; }
  function toList(): void { view = 'list'; selKey = null; }
  function openChart(): void { transitAt = new Date(); selKey = null; view = 'chart'; }

  const chartTitle = $derived(
    mode === 'natal' ? `Натал · ${personA?.name}`
    : mode === 'synastry' ? `${personA?.name} ✕ ${personB?.name}`
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
    {:else if people.length}
      <button class="btn open" disabled>Открыть карту — выбери
        {needCount === 1 ? 'человека' : pair.length === 1 ? 'ещё одного' : 'двух людей'}</button>
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
      {#if editId}<button class="btn danger" onclick={del}>{confirmDel ? 'Точно удалить?' : 'Удалить'}</button>{/if}
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
        <input class="tin" inputmode="numeric" maxlength="10" value={tDate} placeholder="ДД.ММ.ГГГГ" aria-label="Дата транзита"
          oninput={(e) => (tDate = maskDate((e.target as HTMLInputElement).value, tDate))}
          onchange={applyTransitFields} onkeydown={(e) => e.key === 'Enter' && applyTransitFields()} />
        <input class="tin tt" inputmode="numeric" maxlength="5" value={tTime} aria-label="Время транзита"
          oninput={(e) => (tTime = maskTime((e.target as HTMLInputElement).value, tTime))}
          onchange={applyTransitFields} onkeydown={(e) => e.key === 'Enter' && applyTransitFields()} />
        <button class="mini" onclick={applyTransitFields} aria-label="Применить дату и время">ОК</button>
        <button class="mini" onclick={() => stepTransit(86_400_000)} aria-label="День вперёд">день ›</button>
        <button class="mini now" onclick={refreshTransit}>сейчас</button>
      </div>
      <div class="cap">крути колесо пальцем — сутки за оборот</div>
    {/snippet}

    {#if mode === 'natal'}
      <Wheel positions={posA} staticAspects={natalAsp} {signStyle} houses={housesA}
        selectedStaticKey={selKey} onstatictap={onStatic} />
      <div class="legend">натальная карта {personA?.name}</div>
    {:else if mode === 'synastry'}
      <Wheel positions={posA} positionsOuter={posB} staticAspects={crossSyn} {signStyle} houses={housesA}
        selectedStaticKey={selKey} onstatictap={onStatic} />
      <div class="legend">внутри — {personA?.name}, снаружи — {personB?.name}</div>
    {:else if mode === 'transitNatal'}
      <Wheel positions={posA} positionsOuter={transitPos} staticAspects={crossTA} {signStyle} houses={housesA}
        selectedStaticKey={selKey} onstatictap={onStatic} onscrub={scrubTransit} />
      <div class="legend">внутри — {personA?.name}, снаружи — транзит на {transitLabel}</div>
      {@render transitCtl()}
    {:else}
      <Wheel positions={posA} positionsOuter={posB} positionsOuter2={transitPos}
        staticAspects={crossTA} staticAspects2={crossTB} {signStyle} houses={housesA}
        selectedStaticKey={selKey} onstatictap={onStatic} onscrub={scrubTransit} />
      <div class="legend">внутри — {personA?.name}, среднее — {personB?.name}, снаружи — транзит на {transitLabel}</div>
      {@render transitCtl()}
    {/if}

    {#if personA?.unknownTime}
      <div class="warn">⚠ У {personA.name} время рождения не задано — взят полдень, Луна и быстрые планеты неточны.</div>
    {/if}
    {#if (mode === 'synastry' || mode === 'triple') && personB?.unknownTime}
      <div class="warn">⚠ У {personB.name} время рождения не задано — взят полдень, Луна и быстрые планеты неточны.</div>
    {/if}

    {#if mode === 'natal'}
      {#if natalAsp.length === 0}<div class="empty">В карте нет мажорных аспектов в орбисе.</div>{/if}
      {#each natalAsp as a (staticKey(a))}
        <GlowCard radius={12} selected={staticKey(a) === selKey}
          onactivate={() => openDetail(a, personA?.name ?? null, personA?.name ?? null)}>
          <StaticAspectRow {a} ownerA={personA?.name} ownerB={personA?.name} selected={staticKey(a) === selKey} />
        </GlowCard>
      {/each}
    {:else if mode === 'synastry'}
      {#if crossSyn.length === 0}<div class="empty">Нет мажорных аспектов в орбисе.</div>{/if}
      {#each crossSyn as a (staticKey(a))}
        <GlowCard radius={12} selected={staticKey(a) === selKey}
          onactivate={() => openDetail(a, personA?.name ?? null, personB?.name ?? null)}>
          <StaticAspectRow {a} ownerA={personA?.name} ownerB={personB?.name} selected={staticKey(a) === selKey} />
        </GlowCard>
      {/each}
    {:else if mode === 'transitNatal'}
      {#if crossTA.length === 0}<div class="empty">Транзит сейчас не образует мажорных аспектов к карте в орбисе.</div>{/if}
      {#each crossTA as a (staticKey(a))}
        <GlowCard radius={12} selected={staticKey(a) === selKey}
          onactivate={() => openDetail(a, personA?.name ?? null, 'транзит', posA, 'A')}>
          <StaticAspectRow {a} ownerA={personA?.name} ownerB={'транзит'} {tz}
            win={winFor(a, 'A')} selected={staticKey(a) === selKey} />
        </GlowCard>
      {/each}
    {:else}
      {#if doubleHits.length}
        <div class="grp gold">✦ Касается обоих</div>
        <div class="hint small">Одна транзитная планета аспектирует объекты обеих карт одновременно —
          самое важное в паре.</div>
        {#each doubleHits as h (h.planet)}
          <div class="dhblock">
            <div class="dhhead"><span class="glyph">{h.glyph}</span> <b>{h.planet}</b>
              {#each h.toA as a}<span class="dhpart">{a.symbol} {a.p1} ({personA?.name})</span>{/each}
              {#each h.toB as a}<span class="dhpart">{a.symbol} {a.p1} ({personB?.name})</span>{/each}
            </div>
            {#each h.toA as a (staticKey(a))}
              <GlowCard radius={12} selected={staticKey(a) === selKey}
                onactivate={() => openDetail(a, personA?.name ?? null, 'транзит', posA, 'A')}>
                <StaticAspectRow {a} ownerA={personA?.name} ownerB={'транзит'} {tz}
                  win={winFor(a, 'A')} selected={staticKey(a) === selKey} />
              </GlowCard>
            {/each}
            {#each h.toB as a (staticKey(a))}
              <GlowCard radius={12} selected={staticKey(a) === selKey}
                onactivate={() => openDetail(a, personB?.name ?? null, 'транзит', posB, 'B')}>
                <StaticAspectRow {a} ownerA={personB?.name} ownerB={'транзит'} {tz}
                  win={winFor(a, 'B')} selected={staticKey(a) === selKey} />
              </GlowCard>
            {/each}
          </div>
        {/each}
      {/if}
      <div class="grp">Транзит → {personA?.name}</div>
      {#if singleTA.length === 0}<div class="empty">{doubleHits.length ? 'Остальных аспектов нет.' : 'Нет мажорных аспектов в орбисе.'}</div>{/if}
      {#each singleTA as a (staticKey(a))}
        <GlowCard radius={12} selected={staticKey(a) === selKey}
          onactivate={() => openDetail(a, personA?.name ?? null, 'транзит', posA, 'A')}>
          <StaticAspectRow {a} ownerA={personA?.name} ownerB={'транзит'} {tz}
            win={winFor(a, 'A')} selected={staticKey(a) === selKey} />
        </GlowCard>
      {/each}
      <div class="grp">Транзит → {personB?.name}</div>
      {#if singleTB.length === 0}<div class="empty">{doubleHits.length ? 'Остальных аспектов нет.' : 'Нет мажорных аспектов в орбисе.'}</div>{/if}
      {#each singleTB as a (staticKey(a))}
        <GlowCard radius={12} selected={staticKey(a) === selKey}
          onactivate={() => openDetail(a, personB?.name ?? null, 'транзит', posB, 'B')}>
          <StaticAspectRow {a} ownerA={personB?.name} ownerB={'транзит'} {tz}
            win={winFor(a, 'B')} selected={staticKey(a) === selKey} />
        </GlowCard>
      {/each}
    {/if}

    {#if forecastTargets.length}
      <div class="fc">
        <div class="fchead">
          <span class="grp">Прогноз транзитов</span>
          <div class="fcdays">
            {#each [7, 30, 90, 180] as d}
              <button class="mini" class:on={forecastDays === d} onclick={() => (forecastDays = d)}>{d}д</button>
            {/each}
          </div>
        </div>
        <button class="btn" disabled={forecastBusy} onclick={runForecast}>
          {forecastBusy ? 'Считаю…' : `Показать на ${forecastDays} дн. от текущего момента`}</button>
        {#if forecastRan}
          {#if forecastList.length === 0}<div class="empty">В этом окне точных транзитов нет.</div>{/if}
          {#each forecastList as h (hitKey(h) + h.jd)}
            <button class="fcrow" class:sel={selKey === hitKey(h)} onclick={() => gotoHit(h)}>
              <span class="fcglyph glyph">{h.tGlyph}<span class="fcasp">{h.symbol}</span>{h.nGlyph}</span>
              <span class="fcnames">{h.tName} {h.aspect} {h.nName} <small>({h.owner})</small></span>
              <span class="fcdate">{fmtHit(h.when)} <span class="go">→</span></span>
            </button>
          {/each}
        {/if}
      </div>
    {/if}

    {#if mode === 'natal'}
      <!-- расшифровка положений (правка астролога): планета в знаке + разбор.
           ЕДИНОЕ ПРАВИЛО выделения: развёрнутый блок держит рамку GlowCard -->
      <div class="grp">Положения</div>
      {#each posA as p (p.name)}
        {@const si = signIdx(p.lon)}
        <GlowCard radius={12} selected={openPos === p.name}>
          <details class="posx" ontoggle={(e) => {
            if ((e.currentTarget as HTMLDetailsElement).open) openPos = p.name;
            else if (openPos === p.name) openPos = null;
          }}>
            <summary><span class="glyph">{p.glyph}</span> <b>{p.name}</b>
              <span class="posval">{fmtPosRx(p.lon, p.retro)}</span></summary>
            <div class="posbody">
              {#if PLANET_LORE[p.name]}<div class="posrole">{PLANET_LORE[p.name].role}</div>{/if}
              {#if SIGN_LORE[si]}
                <div class="possign"><b>{p.sign}</b> · {SIGN_LORE[si].element}</div>
                <div class="postext">{SIGN_LORE[si].text}</div>
              {/if}
              {#if p.retro}<div class="postext">℞ Ретроградна в карте — энергия обращена внутрь,
                тема проживается через переосмысление.</div>{/if}
            </div>
          </details>
        </GlowCard>
      {/each}
    {:else}
      <details class="positions">
        <summary>Позиции</summary>
        <div class="posgrp">{personA?.name}</div>
        {#each posA as p}<div class="posrow"><span class="glyph">{p.glyph}</span> {p.name} — {fmtPosRx(p.lon, p.retro)}</div>{/each}
        {#if mode === 'synastry' || mode === 'triple'}
          <div class="posgrp">{personB?.name}</div>
          {#each posB as p}<div class="posrow"><span class="glyph">{p.glyph}</span> {p.name} — {fmtPosRx(p.lon, p.retro)}</div>{/each}
        {/if}
        {#if mode === 'transitNatal' || mode === 'triple'}
          <div class="posgrp">Транзит ({transitLabel})</div>
          {#each transitPos as p}<div class="posrow"><span class="glyph">{p.glyph}</span> {p.name} — {fmtPosRx(p.lon, p.retro)}</div>{/each}
        {/if}
      </details>
    {/if}
  {/if}
</section>

{#if detail}
  <StaticInterpretationSheet a={detail} ownerA={detailA} ownerB={detailB} {tz} win={detailWin}
    {engine} {orbOf}
    ongoto={ongoto ? (d) => { detail = null; ongoto?.(d); } : null}
    onclose={() => (detail = null)}
    onchat={(seed, src) => { detail = null; onchat?.(seed, src); }}
    oncommunity={(s, t) => { detail = null; oncommunity?.(s, t); }} />
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: #0009; z-index: 20; }
  .sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%);
    /* почти во весь экран: фоновая дата шапки не попадает в скриншот карты
       (ИИ-разбор скриншота принимал её за момент карты — жалоба) */
    max-height: 97vh;
    max-height: calc(100dvh - var(--safe-top) - 4px);
    overflow-y: auto; z-index: 21; padding: 16px 16px calc(18px + var(--safe-bottom));
    border-radius: 22px 22px 0 0; animation: up 0.34s cubic-bezier(0.215, 0.61, 0.355, 1); }
  @keyframes up { from { transform: translate(-50%, 100%); } to { transform: translate(-50%, 0); } }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  h2 { margin: 0; font-size: 1.1rem; }
  .pairttl { flex: 1; text-align: center; font-size: 1rem; }
  .x, .back { background: transparent; border: none; font-size: 1.1rem; color: var(--ink-dim); flex: none; }
  .hint { color: var(--ink-faint); font-size: 0.84rem; margin: 4px 0 12px; }
  .empty { color: var(--ink-faint); font-size: 0.86rem; margin: 10px 0; text-align: center; }

  /* переключатель типа карты — сетка 2×2: подписи не режутся на узких экранах */
  .seg.modes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 6px 0 8px; }
  .seg.modes button { background: #ffffff0c; border: 1px solid var(--glass-brd); color: var(--ink-dim);
    border-radius: 12px; padding: 10px 6px; font-size: 0.82rem; }
  .seg.modes button.on { background: var(--accent); border-color: transparent;
    color: var(--on-accent); font-weight: 600; }

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
    border-radius: 999px; padding: 7px 12px; font-size: 0.78rem; }
  .mini.now { color: var(--accent); }
  /* панель прокрутки транзита */
  .tctl { display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap; margin: 2px 0; }
  .tin { background: #ffffff10; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 10px; padding: 6px 8px; font: inherit; font-family: var(--font-mono);
    font-variant-numeric: tabular-nums; text-align: center; width: 6.4rem; }
  .tin.tt { width: 4rem; }
  .cap { text-align: center; color: var(--ink-faint); font-size: 0.72rem; margin: 2px 0 6px; }
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
  /* тапнутый пункт прогноза помнит выделение (как строки аспектов) */
  .fcrow.sel { border-color: color-mix(in srgb, var(--neon-cyan) 45%, var(--glass-brd));
    background: color-mix(in srgb, var(--glass) 82%, var(--neon-cyan) 8%); }
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
  .grp.gold { color: var(--gold); }
  /* «двойное попадание» — транзитная планета бьёт в обе карты (выделено особо) */
  .dhblock { border: 1px solid color-mix(in srgb, var(--gold) 45%, var(--glass-brd));
    background: color-mix(in srgb, var(--glass) 88%, var(--gold) 6%);
    border-radius: 14px; padding: 8px 10px; margin: 8px 0; }
  .dhhead { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px;
    color: var(--ink); font-size: 0.9rem; margin: 2px 2px 4px; }
  .dhpart { color: var(--ink-dim); font-size: 0.84rem; }
  /* положения одиночного натала — раскрывающийся разбор */
  .posx { margin: 6px 0; border-radius: 12px; background: #ffffff08;
    border: 1px solid var(--glass-brd); padding: 2px 10px; }
  .posx summary { display: flex; align-items: center; gap: 8px; cursor: pointer;
    padding: 8px 2px; color: var(--ink); }
  .posx .posval { margin-left: auto; color: var(--ink-dim); font-family: var(--font-mono);
    font-size: 0.82rem; font-variant-numeric: tabular-nums; }
  .posbody { padding: 2px 2px 10px; }
  .posrole { color: var(--ink-dim); font-size: 0.84rem; margin-bottom: 4px; }
  .possign { color: var(--gold); font-size: 0.8rem; margin-bottom: 2px; }
  .postext { color: var(--ink-dim); font-size: 0.84rem; line-height: 1.45; }
  .warn { color: var(--gold); font-size: 0.8rem; margin: 6px 0; }
  .positions { margin-top: 12px; }
  .positions summary { color: var(--ink-dim); font-size: 0.86rem; cursor: pointer; }
  .posgrp { color: var(--ink-dim); font-size: 0.8rem; font-weight: 600; margin: 8px 0 4px; }
  .posrow { color: var(--ink-dim); font-size: 0.86rem; padding: 2px 0; }
</style>
