<script lang="ts" module>
  export type Mode = 'natal' | 'transitNatal' | 'triple' | 'synastry' | 'composite';
  // Память последней открытой карты НА СЕССИЮ: нечаянный свайп-вниз закрывал
  // шторку, и карту приходилось собирать заново (жалоба владелицы 2026-07-06).
  let lastMode: Mode | null = null;
  let lastPair: string[] = [];
  let lastView: 'list' | 'chart' = 'list';
</script>

<script lang="ts">
  /**
   * Хаб совмещённых карт («Добавить» в нижнем меню). Хранит коллекцию людей
   * (CRUD) и строит карты пяти типов:
   *   • Натал                  — одно кольцо, аспекты и положения одного человека;
   *   • Транзит + натал        — двойное кольцо (натал внутри, транзит снаружи);
   *   • Транзит + натал + натал — тройное кольцо (A / B / транзит), межаспекты
   *                               транзита к каждому наталу;
   *   • Синастрия              — два натала, межаспекты A×B;
   *   • Композит               — ОДНА карта средних точек двоих (круговые середины),
   *                               читается как карта самих отношений; домов нет.
   * Одна шторка, виды: список → форма человека → карта. Момент рождения —
   * DST-безопасный zonedTimeUTC. Транзит берётся на «сейчас» (кнопка ⟳ обновляет).
   */
  import { untrack } from 'svelte';
  import { bottomSheet } from '../lib/sheet.ts';
  import { db } from '../lib/db.ts';
  import type { Person, SignStyle } from '../lib/models.ts';
  import type { Engine } from '../engine/index.ts';
  import { synastryAspects, staticAspects, compositeChart, staticKey, sunRank, ASPECTS, SLOW } from '../engine/index.ts';
  import type { StaticAspect } from '../engine/index.ts';
  import { PLANET_LORE, SIGN_LORE } from '../lib/lore.ts';
  import { natalPositions, birthInstantUTC } from '../lib/charts.ts';
  import { chartSource } from '../lib/journal.ts';
  import { analyzeHouses, houseOfLon, type HouseInfo } from '../lib/houses.ts';
  import { HOUSE_SYSTEMS } from '../lib/models.ts';
  import { buildAstroPrompt, type PromptPerson } from '../lib/aiPrompt.ts';
  import { fmtPos, fmtPosRx } from '../lib/format.ts';
  import { forecastTransits, transitWindow, type TransitHit, type TransitWindow } from '../lib/forecast.ts';
  import type { BodyPosition } from '../engine/index.ts';
  import Wheel from './Wheel.svelte';
  import { chartFigures } from '../lib/chartFigures.ts';
  import ChartFigureCard from './ChartFigureCard.svelte';
  import DispositorChains from './DispositorChains.svelte';
  import { cuspAspects } from '../lib/cuspAspects.ts';
  import { PLANET_CUSP_LORE } from '../lib/planetCuspLore.ts';
  import { transitCuspText } from '../lib/transitCuspLore.ts';
  import StaticAspectRow from './StaticAspectRow.svelte';
  import StaticInterpretationSheet from './StaticInterpretationSheet.svelte';
  import PromptSheet from './PromptSheet.svelte';
  import GlowCard from './GlowCard.svelte';
  import Hint from './Hint.svelte';
  import PersonForm from './charts/PersonForm.svelte';
  import TransitControls from './charts/TransitControls.svelte';
  import PeopleList from './charts/PeopleList.svelte';

  let { engine, orbOf, signStyle, defaultTz, tz, objects = null, houseSystem = 'horizontal',
        nodalAxisFigures = false,
        initialMode = 'transitNatal', initialSelect = null, onclose, oncommunity, ongoto }:
    { engine: Engine; orbOf: (name: string) => number; signStyle: SignStyle;
      defaultTz: string; tz: string; objects?: string[] | null; houseSystem?: string;
      nodalAxisFigures?: boolean;
      initialMode?: Mode;
      // Открыть СРАЗУ карту транзит+натал этого человека на момент `at` и
      // выделить аспект (тап по уведомлению «мой аспект», просьба 2026-07-25).
      initialSelect?: { personId: string; nName: string; tName: string;
        aspect: string; at?: string } | null;
      onclose: () => void;
      oncommunity?: (sig: string, title: string) => void;
      ongoto?: (d: Date) => void } = $props();

  // открытый межаспект (детальная шторка «как на главном»)
  let detail = $state<StaticAspect | null>(null);
  let detailA = $state<string | null>(null);
  let detailB = $state<string | null>(null);
  let detailWin = $state<TransitWindow | null>(null);
  // «натив+транзит» для поиска «когда ещё»: неподвижный натальный градус a.p1 +
  // движущаяся (транзитная/эфемеридная) планета a.p2. Работает во ВСЕХ режимах:
  // натал/синастрия — тоже «когда транзит a.p2 замкнёт натальный a.p1».
  let detailAnchor = $state<{ lon: number; planet: string } | null>(null);
  // долготы участников для блока «Участники в знаках» (SignContext): p1 из своего
  // кольца (натал A/B), p2 — из своего (натал B / транзит / тот же натал)
  let detailLon1 = $state<number | null>(null);
  let detailLon2 = $state<number | null>(null);
  // Тап по карточке аспекта: тумблер. 1-й тап по НЕвыделенному — выделить И
  // сразу открыть детали; повторный тап по УЖЕ выделенному — снять выделение,
  // ничего не открывая (правка владелицы: «выделить+раскрыть / снять»).
  function toggleDetail(a: StaticAspect, oa: string | null, ob: string | null,
    natalPos: BodyPosition[] | null = null, ring: 'A' | 'B' = 'A'): void {
    if (selKey === staticKey(a)) { selKey = null; return; }
    openDetail(a, oa, ob, natalPos, ring);
  }
  // natalPos — набор натальных позиций (для транзит-режимов: p1 из натала, p2 —
  // транзитная планета) → считаем ОКНО аспекта (вход орбиса → точно → выход).
  function openDetail(a: StaticAspect, oa: string | null, ob: string | null,
    natalPos: BodyPosition[] | null = null, ring: 'A' | 'B' = 'A'): void {
    selKey = staticKey(a); detail = a; detailA = oa; detailB = ob; detailWin = null;
    // фикс. долгота a.p1: из переданного натального набора либо из posA/posB
    const lon1 = (natalPos ?? posA).find((p) => p.name === a.p1)?.lon
      ?? posA.find((p) => p.name === a.p1)?.lon ?? posB.find((p) => p.name === a.p1)?.lon;
    detailAnchor = lon1 != null ? { lon: lon1, planet: a.p2 } : null;
    // долгота a.p2 для SignContext: транзит → из transitPos; синастрия → posB;
    // натал → тот же posA. p1 берём из уже найденного lon1.
    const lon2 = ob === 'транзит'
      ? transitPos.find((p) => p.name === a.p2)?.lon
      : posB.find((p) => p.name === a.p2)?.lon ?? posA.find((p) => p.name === a.p2)?.lon;
    detailLon1 = lon1 ?? null;
    detailLon2 = lon2 ?? null;
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
  // адрес из уведомления сильнее «памяти последней карты»
  const fromNotify = untrack(() =>
    initialSelect && db.people.get(initialSelect.personId) ? initialSelect : null);
  const restore = untrack(() => {
    if (fromNotify) return null;
    if (initialMode !== 'transitNatal' || !lastMode) return null;
    const alive = lastPair.filter((id) => db.people.get(id));
    if (alive.length !== lastPair.length) return null;
    const need = lastMode === 'triple' || lastMode === 'synastry' || lastMode === 'composite' ? 2 : 1;
    return { mode: lastMode, pair: alive,
      view: lastView === 'chart' && alive.length === need ? 'chart' as const : 'list' as const };
  });
  let view = $state<'list' | 'form' | 'chart'>(fromNotify ? 'chart' : restore?.view ?? 'list');
  let mode = $state<Mode>(untrack(() => fromNotify ? 'transitNatal' : restore?.mode ?? initialMode));
  let pair = $state<string[]>(fromNotify ? [fromNotify.personId] : restore?.pair ?? []); // выбранные id (0 → «А», 1 → «Б»)
  // выделенная линия в колесе; из уведомления — сразу нужный аспект
  let selKey = $state<string | null>(fromNotify
    ? `${fromNotify.nName}|${fromNotify.tName}|${fromNotify.aspect}` : null);
  let openPos = $state<string | null>(null);    // развёрнутое «Положение» (рамка активна)
  // запоминаем выбор для следующего открытия (память сессии, не диск)
  $effect(() => { lastMode = mode; lastPair = pair.slice(); lastView = view === 'chart' ? 'chart' : 'list'; });

  const MODES: { id: Mode; label: string; need: number; hint: string }[] = [
    { id: 'natal', label: 'Натал', need: 1, hint: 'одна карта — её аспекты и положения' },
    { id: 'transitNatal', label: 'Транзит + натал', need: 1, hint: 'небо сейчас к карте человека' },
    { id: 'triple', label: 'Транзит + 2 натала', need: 2, hint: 'небо сейчас к двум людям' },
    { id: 'synastry', label: 'Синастрия', need: 2, hint: 'межаспекты карт двух людей' },
    { id: 'composite', label: 'Композит', need: 2, hint: 'общая карта пары — середины между вашими планетами' },
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

  // При неизвестном времени можно смотреть только МЕДЛЕННЫЕ планеты (полдень
  // почти не влияет на них; быстрые и Луна — неточны). Галочка у человека.
  const SLOW_SET = new Set([...SLOW, 'Кету']);   // Кету движется как Раху
  const slowFilter = (p: Person | null, pos: BodyPosition[]): BodyPosition[] =>
    p?.unknownTime && p.slowOnly ? pos.filter((b) => SLOW_SET.has(b.name)) : pos;

  // расчёт: движок зовём при смене людей/режима/момента (не при выделении линии)
  const posA = $derived(personA ? slowFilter(personA, natalPositions(engine, personA, objects ?? undefined)) : []);
  const posB = $derived(personB ? slowFilter(personB, natalPositions(engine, personB, objects ?? undefined)) : []);

  // Композит: карта средних точек двоих. slowOnly-фильтр людей наследуется сам —
  // compositeChart сопоставляет по имени (пересечение наборов).
  const posMid = $derived(mode === 'composite' && posA.length && posB.length ? compositeChart(posA, posB) : []);
  const compAsp = $derived(posMid.length ? staticAspects(posMid, orbOf) : []);

  // дома внутренней карты (человек A) — нужны место (координаты) и известное время
  const hasPlace = (p: typeof personA): boolean =>
    !!p?.place && (p.place.lat !== 0 || p.place.lon !== 0);
  const housesA = $derived.by(() => {
    if (!personA || personA.unknownTime || !hasPlace(personA)) return null;
    return engine.houses(engine.toJD(birthInstantUTC(personA)), personA.place!.lat, personA.place!.lon, houseSystem);
  });
  // разбор домов A: знак на куспиде + управитель(и) + трактовка (для графы домов)
  const houseInfoA = $derived(housesA ? analyzeHouses(housesA.cusps) : null);
  // римский номер дома планеты (для списка положений): дом стояния
  const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  const houseOfA = (lon: number): string =>
    housesA ? ROMAN[houseOfLon(lon, housesA.cusps) - 1] : '';
  const houseSysLabel = $derived(HOUSE_SYSTEMS.find((h) => h.id === houseSystem)?.label ?? houseSystem);

  // транзит: старт «сейчас», можно проматывать (ввод даты/времени, шаги, диск).
  // Из уведомления — момент точного аспекта (иначе к открытию он уже «уехал»).
  let transitAt = $state(untrack(() => {
    const d = fromNotify?.at ? new Date(fromNotify.at) : null;
    return d && !isNaN(d.getTime()) ? d : new Date();
  }));
  const transitPos = $derived(engine.positions(transitAt, objects ?? undefined));
  // кэш Intl-форматтера ПОДПИСИ транзита (label): пересоздаём при смене пояса.
  // Форматтеры полей даты/времени и вся панель управления — в дочернем
  // charts/TransitControls.svelte.
  let fmtCache: { tz: string; label: Intl.DateTimeFormat } | null = null;
  function fmts(tzv: string) {
    if (!fmtCache || fmtCache.tz !== tzv) fmtCache = {
      tz: tzv,
      label: new Intl.DateTimeFormat('ru-RU', { timeZone: tzv, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    };
    return fmtCache;
  }
  const transitLabel = $derived(fmts(tz).label.format(transitAt));
  // масштаб прокрутки (просьба владелицы 2026-07-08): оборот диска = день/месяц/
  // год. Панель управления (поля/шаги ‹›/масштаб) вынесена в TransitControls
  // (bind:scrubScale); сам скраб-жест колеса остаётся здесь (wired в Wheel.onscrub).
  let scrubScale = $state<'day' | 'month' | 'year'>('day');
  const SCRUB_MULT = { day: 1, month: 30, year: 365 } as const;
  // прокрутка прямо в основном колесе: оборот = сутки×масштаб (см. Wheel.onscrub).
  // rAF-дебаунс: pointermove приходит чаще кадров, а каждый тик тянет WASM
  // positions()+аспекты — копим дельту и применяем раз в кадр.
  let scrubPending = 0;
  let scrubRaf = 0;
  function scrubTransit(deltaMs: number): void {
    // Перемотка снимает выделение СРАЗУ, с первого движения пальца (правка
    // владелицы 2026-07-25: «линии не становятся яркими, пока не отпущу палец»).
    // Раньше выделение держалось, пока аспект не выпадал из орбиса (эффект
    // activeKeys ниже) — всё это время остальные линии оставались пригашенными.
    if (selKey) selKey = null;
    if (selFigKey) selFigKey = null;
    scrubPending += deltaMs * SCRUB_MULT[scrubScale];
    if (scrubRaf) return;
    scrubRaf = requestAnimationFrame(() => {
      transitAt = new Date(transitAt.getTime() + scrubPending);
      scrubPending = 0; scrubRaf = 0;
    });
  }

  // --- прогноз: ближайшие точные транзиты к наталу(ам) ---
  let forecastDays = $state(30);
  let forecastList = $state<TransitHit[]>([]);
  let forecastBusy = $state(false);
  let forecastRan = $state(false);
  let forecastAt = $state<Date | null>(null);   // от какого момента считали (для промпта)
  // Прогноз транзитов — в транзитных режимах и натале. В СИНАСТРИИ его НЕТ
  // (статичная карта двух людей — транзиты там сбивали с толку; правка владелицы).
  // Композит — точки фиксированы (карта вне времени), поэтому обычный механизм
  // прогноза работает: цель одна — «композит», набор posMid.
  const forecastTargets = $derived(
    mode === 'synastry' ? []
      : mode === 'composite' ? (posMid.length ? [{ owner: 'композит', pos: posMid }] : [])
      : personA && personB ? [{ owner: personA.name, pos: posA }, { owner: personB.name, pos: posB }]
      : personA ? [{ owner: personA.name, pos: posA }] : []);

  // В тройной карте (2 натала + транзит) прогноз показывает ТОЛЬКО «двойные»
  // моменты: одна НЕБЕСНАЯ планета касается ОБЕИХ карт в близкие дни (±5 сут).
  // Спаренный вид «♀ Венера (небо): □ Луна (я) · △ Марс (Саша)» — иначе
  // подпись «(транзит)» читалась как «чья-то» Венера (вопрос владелицы).
  interface ForecastPair { tName: string; tGlyph: string; a: TransitHit; b: TransitHit }
  const forecastPairs = $derived.by((): ForecastPair[] => {
    if (mode !== 'triple' || !personA) return [];
    const WIN = 5 * 86_400_000;
    const hitsA = forecastList.filter((h) => h.owner === personA.name);
    const hitsB = forecastList.filter((h) => h.owner !== personA.name);
    const used = new Set<TransitHit>();
    const rows: ForecastPair[] = [];
    for (const ha of hitsA) {
      let best: TransitHit | null = null;
      for (const hb of hitsB) {
        if (used.has(hb) || hb.tName !== ha.tName) continue;
        const d = Math.abs(hb.when.getTime() - ha.when.getTime());
        if (d > WIN) continue;
        if (!best || d < Math.abs(best.when.getTime() - ha.when.getTime())) best = hb;
      }
      if (best) { used.add(best); rows.push({ tName: ha.tName, tGlyph: ha.tGlyph, a: ha, b: best }); }
    }
    rows.sort((x, y) => Math.min(x.a.jd, x.b.jd) - Math.min(y.a.jd, y.b.jd));
    return rows;
  });
  let forecastGen = 0; // защита от устаревшего результата (скраб во время расчёта)
  async function runForecast(): Promise<void> {
    if (forecastBusy || !forecastTargets.length) return;
    const gen = ++forecastGen;
    const at = transitAt;
    forecastBusy = true; forecastRan = false;
    try {
      const list = await forecastTransits(engine, forecastTargets, at, forecastDays, objects ?? undefined);
      if (gen !== forecastGen) return;
      forecastList = list; forecastAt = at;
    } catch { if (gen === forecastGen) forecastList = []; }
    finally { if (gen === forecastGen) { forecastBusy = false; forecastRan = true; } }
  }
  // Тап по строке прогноза: перейти к моменту, выделить аспект И открыть его
  // ОПИСАНИЕ с владельцем — «Уран (Саша) ⚹ Раху (транзит)», а не «просто
  // транзит» (правки владелицы, работает во всех режимах вкл. синастрию).
  const hitKey = (h: TransitHit): string => `${h.nName}|${h.tName}|${h.aspect}`;
  function gotoHit(h: TransitHit): void {
    transitAt = new Date(h.when);
    selKey = hitKey(h);
    const isA = !!personA && h.owner === personA.name;
    const a: StaticAspect = {
      p1: h.nName, p2: h.tName, aspect: h.aspect, symbol: h.symbol,
      angle: ASPECTS[h.aspect]?.angle ?? 0, orb: 0,
    };
    // в композите owner = «композит» (isA=false) — натальный набор берём posMid,
    // кольцо 'B' безвредно: окно всё равно считается по найденной долготе p1
    const natal = mode === 'composite' ? posMid : isA ? posA : posB;
    openDetail(a, h.owner, 'транзит', natal, isA ? 'A' : 'B');
  }
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

  // Ключи всех аспектов, реально показанных в текущем режиме. При прокрутке
  // транзитного колеса набор пересчитывается — выделенный аспект может выпасть
  // (вышел из орбиса). Тогда сбрасываем выделение, иначе остальные линии/карточки
  // остаются пригашены «навсегда» (жалоба владелицы).
  const activeKeys = $derived.by((): Set<string> => {
    const src = mode === 'natal' ? natalAsp
      : mode === 'synastry' ? crossSyn
      : mode === 'composite' ? compAsp
      : mode === 'triple' ? [...crossTA, ...crossTB]
      : crossTA;
    return new Set(src.map((a) => staticKey(a)));
  });
  $effect(() => { if (selKey && !activeKeys.has(selKey)) selKey = null; });

  // Из уведомления: как только аспекты карты посчитаны — РАСКРЫТЬ его описание
  // (владелица: «открывается моя карта транзит+натал и там выделен этот аспект»).
  // Один раз; если аспект уже вне орбиса, эффект выше просто снимет выделение.
  let notifyOpened = false;
  $effect(() => {
    if (!fromNotify || notifyOpened || view !== 'chart') return;
    const key = `${fromNotify.nName}|${fromNotify.tName}|${fromNotify.aspect}`;
    const a = crossTA.find((x) => staticKey(x) === key);
    if (!a || !posA.length) return;
    notifyOpened = true;
    openDetail(a, personA?.name ?? null, 'транзит', posA, 'A');
  });

  // «Фигуры» карты (раунд 29): натал — классические; транзитные режимы —
  // фигуры, ЗАМКНУТЫЕ транзитом (натальная заготовка + транзитная планета).
  // Композит — классические фигуры на карте СЕРЕДИН (как натал; lib не меняем).
  const chartFigs = $derived(chartFigures(mode === 'composite' ? 'natal' : mode,
    mode === 'composite' ? posMid : posA, posB, transitPos, orbOf, nodalAxisFigures));
  // аспекты натальных планет к куспидам домов A (§4) — только если дома есть
  const cuspAsp = $derived(mode === 'natal' && housesA ? cuspAspects(posA, housesA.cusps, orbOf) : []);
  // транзиты к натальным куспидам A: проходящие планеты активируют темы домов
  // (снимок «сейчас»). Только в режимах с транзитом и когда дома A известны.
  const transitCuspAsp = $derived((mode === 'transitNatal' || mode === 'triple') && housesA
    ? cuspAspects(transitPos, housesA.cusps, orbOf) : []);
  const ANGLE_LBL: Record<number, string> = { 1: 'Asc', 4: 'IC', 7: 'Dsc', 10: 'MC' };
  let openCusp = $state<string | null>(null);
  let openTCusp = $state<string | null>(null);
  const cuspKey = (c: { planet: string; cusp: number; aspect: string }) => `${c.planet}|${c.cusp}|${c.aspect}`;
  let selFigKey = $state<string | null>(null);
  $effect(() => { void mode; void pair; selFigKey = null; });   // смена карты сбрасывает выбор
  const figStaticKeys = $derived(chartFigs.find((f) => f.key === selFigKey)?.staticKeys ?? null);

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

  // --- форма (добавить/править человека) — в charts/PersonForm.svelte (SR-4) ---
  let editPerson = $state<Person | null>(null);
  function openNew(): void { editPerson = null; view = 'form'; }
  function openEdit(p: Person): void { editPerson = p; view = 'form'; }
  function onFormSaved(): void { people = db.people.all().slice(); view = 'list'; }
  function onFormDeleted(id: string): void {
    pair = pair.filter((x) => x !== id);
    people = db.people.all().slice();
    view = 'list';
  }

  function onStatic(key: string): void { selKey = selKey === key ? null : key; }
  function toList(): void { view = 'list'; selKey = null; }
  /** Android «Назад»: сперва закрыть открытую деталь аспекта, затем из
   *  карты/формы — на список (как стрелочка ←); закрывать шторку будет App,
   *  когда мы уже на списке. Единый порядок для ВСЕХ режимов карт. */
  export function stepBack(): boolean {
    if (detail) { detail = null; return true; }
    if (view === 'chart' || view === 'form') { toList(); return true; }
    return false;
  }
  function openChart(): void { transitAt = new Date(); selKey = null; view = 'chart'; }

  const chartTitle = $derived(
    mode === 'natal' ? `Натал · ${personA?.name}`
    : mode === 'synastry' ? `${personA?.name} ✕ ${personB?.name}`
    : mode === 'composite' ? `Композит · ${personA?.name} + ${personB?.name}`
    : mode === 'triple' ? `Транзит · ${personA?.name} + ${personB?.name}`
    : `Транзит · ${personA?.name}`);

  // ЕДИНЫЙ контекст карты — общий и для Claude, и для экспорта в любую ИИ.
  // Индивидуально по режиму: натал = только этот человек; синастрия = обе карты;
  // транзит+натал = человек + небо на рассматриваемый момент; тройная = двое + небо.
  const posLine = (pos: BodyPosition[], withHouse: boolean): string =>
    pos.map((p) => `${p.name} ${fmtPosRx(p.lon, p.retro)}${withHouse && houseOfA(p.lon) ? ` (${houseOfA(p.lon)} дом)` : ''}`).join('; ');
  // точные числа для самостоятельных расчётов ИИ: эклиптическая долгота 0–360° и
  // скорость °/сут (− = ретроград). Куспиды A добавляем к его строке.
  const rawLine = (pos: BodyPosition[]): string =>
    pos.map((p) => `${p.name} ${p.lon.toFixed(3)}° v=${p.speed >= 0 ? '+' : ''}${p.speed.toFixed(3)}`).join('; ');
  const rawA = (): string => {
    const cusps = housesA ? ` | Куспиды°: ${housesA.cusps.map((c, i) => `${i + 1}:${c.toFixed(2)}`).join(', ')}` : '';
    return rawLine(posA) + cusps;
  };
  // Вес аспекта по тесноте орбиса (доля от макс. орбиса пары). Считаем в
  // приложении, а не просим ИИ «оценить силу» — она оценивает наугад (2026-07-27).
  const weightOf = (a: StaticAspect): string => {
    const share = a.orb / Math.max(orbOf(a.p1), orbOf(a.p2));
    return share <= 0.34 ? 'сильный' : share <= 0.7 ? 'средний' : 'фоновый';
  };
  const aspLine = (list: StaticAspect[], oa: string, ob: string): string =>
    list.slice(0, 20).map((a) => `${a.p1} (${oa}) ${a.aspect} ${a.p2} (${ob}), орбис ${a.orb.toFixed(2)}° (${weightOf(a)})`).join('; ');
  // Транзитные аспекты — с направлением и ОКНОМ (вход → точно → выход). Эти
  // числа уже посчитаны для строк карты (rowWins); раньше промпт просил ИИ
  // вычислить их самостоятельно — она их выдумывала (правка 2026-07-26).
  // Окна считаются с дебаунсом: если ещё не готовы — просто без них.
  const aspLineT = (list: StaticAspect[], oa: string, ring: 'A' | 'B'): string =>
    list.slice(0, 20).map((a) => {
      const w = winFor(a, ring);
      const tail = w
        ? `, ${transitAt < w.exact ? 'сходится' : 'расходится'}`
          + `, окно ${fmtHit(w.begin)} → точно ${fmtHit(w.exact)} → ${fmtHit(w.end)}`
        : '';
      return `${a.p1} (${oa}) ${a.aspect} ${a.p2} (транзит), орбис ${a.orb.toFixed(2)}° (${weightOf(a)})${tail}`;
    }).join('; ');
  // Ближайшие точные транзиты — если прогноз уже посчитан в этой карте (кнопка
  // «Показать на N дн.»). Это и есть честный ответ на «какие дни активны».
  // Прогноз считается по требованию и НЕ сбрасывается при смене людей/режима —
  // поэтому фильтруем по владельцам текущей карты и метим момент, от которого
  // он считался (после скраба он уже не «от сейчас»).
  const forecastForPrompt = $derived.by(() => {
    if (!forecastRan || mode === 'synastry') return undefined;
    const owners = new Set([personA?.name, personB?.name].filter(Boolean) as string[]);
    if (mode === 'composite') owners.add('композит');   // владелец целей прогноза композита
    const items = forecastList.filter((h) => owners.has(h.owner)).slice(0, 14)
      .map((h) => `${h.tName} (небо) ${h.aspect} ${h.nName} (${h.owner}) — ${fmtHit(h.when)}`);
    if (!items.length) return undefined;
    return { span: `${forecastDays} дн. от ${fmtHit(forecastAt ?? transitAt)}`, items };
  });
  const housesLine = (): string | undefined =>
    houseInfoA ? houseInfoA.map((h) => `${['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'][h.house - 1]} ${h.sign} (упр. ${h.rulers.join(', ')})`).join('; ') : undefined;

  const chartPromptText = $derived.by((): string => {
    if (!personA) return '';
    const people: PromptPerson[] = [];
    const aspects: string[] = [];
    if (mode === 'natal') {
      people.push({ name: personA.name, birth: fmtBirth(personA), positions: posLine(posA, true), houses: housesLine(), raw: rawA() });
      if (natalAsp.length) aspects.push(aspLine(natalAsp, personA.name, personA.name));
    } else if (mode === 'synastry' && personB) {
      people.push({ name: personA.name, birth: fmtBirth(personA), positions: posLine(posA, true), houses: housesLine(), raw: rawA() });
      people.push({ name: personB.name, birth: fmtBirth(personB), positions: posLine(posB, false), raw: rawLine(posB) });
      if (crossSyn.length) aspects.push('Межаспекты: ' + aspLine(crossSyn, personA.name, personB.name));
    } else if (mode === 'composite' && personB) {
      people.push({ name: personA.name, birth: fmtBirth(personA), positions: posLine(posA, false), raw: rawLine(posA) });
      people.push({ name: personB.name, birth: fmtBirth(personB), positions: posLine(posB, false), raw: rawLine(posB) });
      people.push({ name: `Композит ${personA.name} + ${personB.name}`,
        birth: 'карта средних точек двух рождений (вне времени)',
        positions: posLine(posMid, false), raw: rawLine(posMid) });
      if (compAsp.length) aspects.push('Аспекты композита: ' + aspLine(compAsp, 'композит', 'композит'));
    } else {
      people.push({ name: personA.name, birth: fmtBirth(personA), positions: posLine(posA, true), houses: housesLine(), raw: rawA() });
      if (personB) people.push({ name: personB.name, birth: fmtBirth(personB), positions: posLine(posB, false), raw: rawLine(posB) });
      if (crossTA.length) aspects.push(`Транзит → ${personA.name}: ` + aspLineT(crossTA, personA.name, 'A'));
      if (personB && crossTB.length) aspects.push(`Транзит → ${personB.name}: ` + aspLineT(crossTB, personB.name, 'B'));
      // Перекрёстная активация: одна небесная планета задевает ОБЕ карты сразу.
      // UI это уже показывает (doubleHits) — теперь и промпт (2026-07-27).
      if (mode === 'triple' && doubleHits.length && personB) {
        aspects.push('ДВОЙНЫЕ ПОПАДАНИЯ (одна небесная планета задевает обе карты сразу — перекрёстная активация): '
          + doubleHits.map((h) => `${h.planet} → ${personA.name}: ${h.toA.map((a) => `${a.aspect} ${a.p1}`).join(', ')} · ${personB.name}: ${h.toB.map((a) => `${a.aspect} ${a.p1}`).join(', ')}`).join('; '));
      }
    }
    return buildAstroPrompt({
      title: chartTitle, kind: mode, houseSystem: houseSysLabel, people, aspects, weighted: true,
      // транзитные планеты — С ДОМАМИ натальной карты A (houseOfA); чьи это дома,
      // промпт называет явно (в тройной карте иначе не понять)
      transit: (mode === 'transitNatal' || mode === 'triple')
        ? { label: transitLabel, positions: posLine(transitPos, true), raw: rawLine(transitPos),
            housesOwner: housesA ? personA.name : undefined } : undefined,
      forecast: forecastForPrompt,
      extra: mode === 'synastry' ? 'Это синастрия — взаимодействие двух карт (не композит).'
        : mode === 'composite' ? 'Это композит — карта средних точек: каждая её точка — круговая '
          + 'середина дуги между одноимёнными планетами двоих. Читается как карта САМИХ отношений '
          + '(характер союза), а не характер кого-то из людей. У точек композита нет скоростей и '
          + 'ретро-статуса, дома не считаются — не выдумывай их.'
        : mode === 'triple' ? 'Это «два натала + транзит»: одно небо на двоих. Смотри перекрёстную '
          + 'активацию: двойные попадания (в аспектах выше) и места, где натальные точки этих двоих '
          + 'стоят в соединении друг с другом (в паре градусов) — транзит по такому градусу включает '
          + 'обоих сразу.'
        : undefined,
    });
  });

  let showPrompt = $state(false);   // окно «Промпт для любой ИИ»

  // «Откуда» заметка: «Я+Саша 13.06.25» / «Я 20.06.2006» (просьба владелицы
  // 2026-07-25). «Я» — карта, выбранная как своя в Настройках (transitSelfId).
  const noteSource = $derived(chartSource(mode, personA, personB, transitAt,
    db.settings.get().transitSelfId));
</script>

<div class="backdrop sheet-backdrop" onclick={onclose} role="presentation"></div>
<section class="sheet glass" aria-label="Совмещённые карты" use:bottomSheet={{ onclose }}>
  {#if view === 'list'}
    <header><h2>Карты и люди</h2><button class="x" onclick={onclose} aria-label="Закрыть">✕</button></header>

    <div class="seg modes">
      {#each MODES as m}
        <button class:on={mode === m.id} onclick={() => setMode(m.id)}>{m.label}</button>
      {/each}
      <Hint k="transit" />
    </div>
    <div class="hint">{MODES.find((m) => m.id === mode)!.hint} — выбери
      {needCount === 1 ? 'человека' : 'двух людей'}.</div>

    <!-- «Открыть карту» НАД списком (просьба 2026-07-11): при длинном списке
         людей кнопка внизу терялась за прокруткой -->
    {#if pair.length === needCount}
      <button class="btn primary open" onclick={openChart}>Открыть карту →</button>
    {:else if people.length}
      <button class="btn open" disabled>Открыть карту — выбери
        {needCount === 1 ? 'человека' : pair.length === 1 ? 'ещё одного' : 'двух людей'}</button>
    {/if}

    <PeopleList {people} {pair} {fmtBirth} ontoggle={toggleSel} onedit={openEdit} />

    <button class="btn add" onclick={openNew}>+ Добавить человека</button>

  {:else if view === 'form'}
    <PersonForm person={editPerson} {defaultTz}
      onsaved={onFormSaved} ondeleted={onFormDeleted} oncancel={toList} {onclose} />

  {:else}
    <header>
      <button class="back" onclick={toList} aria-label="К списку">←</button>
      <h2 class="pairttl">{chartTitle}</h2>
    </header>

    {#snippet transitCtl()}
      <TransitControls bind:transitAt bind:scrubScale {tz} />
    {/snippet}

    {#if mode === 'natal'}
      <Wheel positions={posA} staticAspects={natalAsp} {signStyle} houses={housesA}
        selectedStaticKey={selKey} figureStaticKeys={figStaticKeys} onstatictap={onStatic} />
      <div class="legend">натальная карта {personA?.name}</div>
    {:else if mode === 'composite'}
      <!-- одно кольцо середин: домов у композита нет (housesA к нему не относятся),
           скраба нет — карта статичная -->
      <Wheel positions={posMid} staticAspects={compAsp} {signStyle}
        selectedStaticKey={selKey} figureStaticKeys={figStaticKeys} onstatictap={onStatic} />
      <div class="legend">композит {personA?.name} + {personB?.name} — середины планет</div>
    {:else if mode === 'synastry'}
      <Wheel positions={posA} positionsOuter={posB} staticAspects={crossSyn} {signStyle} houses={housesA}
        selectedStaticKey={selKey} figureStaticKeys={figStaticKeys} onstatictap={onStatic} />
      <div class="legend">внутри — {personA?.name}, снаружи — {personB?.name} <Hint k="synastry" /></div>
    {:else if mode === 'transitNatal'}
      <Wheel positions={posA} positionsOuter={transitPos} staticAspects={crossTA} {signStyle} houses={housesA}
        selectedStaticKey={selKey} figureStaticKeys={figStaticKeys} onstatictap={onStatic} onscrub={scrubTransit} />
      <div class="legend">внутри — {personA?.name}, снаружи — транзит на {transitLabel}</div>
      {@render transitCtl()}
    {:else}
      <Wheel positions={posA} positionsOuter={posB} positionsOuter2={transitPos}
        staticAspects={crossTA} staticAspects2={crossTB} {signStyle} houses={housesA}
        selectedStaticKey={selKey} figureStaticKeys={figStaticKeys} onstatictap={onStatic} onscrub={scrubTransit} />
      <div class="legend">внутри — {personA?.name}, среднее — {personB?.name}, снаружи — транзит на {transitLabel}</div>
      {@render transitCtl()}
    {/if}

    <!-- данные рождения на самой карте: скриншот несёт ВСЮ информацию
         (дата/время/пояс/место) — внешний ИИ-разбор не гадает о моменте -->
    {#if personA}<div class="birth">{personA.name} — род. {fmtBirth(personA)}</div>{/if}
    {#if (mode === 'synastry' || mode === 'triple' || mode === 'composite') && personB}
      <div class="birth">{personB.name} — род. {fmtBirth(personB)}</div>
    {/if}

    <div class="chatrow">
      <button class="btn promptbtn" onclick={() => (showPrompt = true)}
        title="Готовый промпт для ChatGPT, Gemini и др.">📋 Промпт для ИИ</button>
    </div>

    {#if personA?.unknownTime}
      <div class="warn">⚠ У {personA.name} время рождения не задано — {personA.slowOnly
        ? 'показаны только медленные планеты' : 'взят полдень, Луна и быстрые планеты неточны'}.</div>
    {/if}
    {#if (mode === 'synastry' || mode === 'triple' || mode === 'composite') && personB?.unknownTime}
      <div class="warn">⚠ У {personB.name} время рождения не задано — {personB.slowOnly
        ? 'показаны только медленные планеты' : 'взят полдень, Луна и быстрые планеты неточны'}.</div>
    {/if}

    {#if chartFigs.length}
      <!-- «по желанию» (просьба владелицы): раздел свёрнут, как соседние fold-разделы -->
      <details class="fold">
        <summary class="grp">◆ Фигуры{#if mode === 'transitNatal' || mode === 'triple'} — замыкает транзит{/if} · {chartFigs.length}</summary>
        {#each chartFigs as f (f.key)}
          <ChartFigureCard fig={f} selected={selFigKey === f.key}
            onactivate={() => (selFigKey = selFigKey === f.key ? null : f.key)} />
        {/each}
      </details>
    {/if}

    {#if mode === 'natal' && posA.length}
      <details class="fold">
        <summary class="grp">⛓ Цепочки диспозиторов</summary>
        <div class="hint small">Каждая планета служит управителю своего знака — до «царя» карты (планеты в своём знаке) или кольца соправителей.</div>
        <div class="glass dispbox"><DispositorChains positions={posA} /></div>
      </details>
    {/if}

    {#if cuspAsp.length}
      <details class="fold">
        <summary class="grp">📐 Аспекты к куспидам · {cuspAsp.length} <Hint k="cusp" /></summary>
        <div class="hint small">Куспид — «дверь» дома (сферы жизни). Планета, задевающая эту дверь, окрашивает вход в сферу своим архетипом. Орбис куспида 1°.</div>
        {#each cuspAsp as c (cuspKey(c))}
          {@const key = cuspKey(c)}
          {@const lore = PLANET_CUSP_LORE[`${c.planet}|${c.cusp}`]}
          <GlowCard radius={12} selected={openCusp === key}
            onactivate={() => (openCusp = openCusp === key ? null : key)}>
            <div class="cusprow">
              <span class="cg glyph">{c.glyph}</span>
              <span class="csym glyph">{c.symbol}</span>
              <span class="clbl">куспид {c.cusp}{#if ANGLE_LBL[c.cusp]} ({ANGLE_LBL[c.cusp]}){/if}</span>
              <span class="corb">{c.orb.toFixed(2)}°</span>
            </div>
            {#if openCusp === key && lore}<div class="cusplore">{lore}</div>{/if}
          </GlowCard>
        {/each}
      </details>
    {/if}

    {#if transitCuspAsp.length}
      <details class="fold">
        <summary class="grp">🚶 Транзиты к куспидам · {transitCuspAsp.length}</summary>
        <div class="hint small">Куспид — «дверь» дома (сферы жизни). Транзитная планета у этой двери активирует сферу прямо сейчас, временно включает её тему. Снимок на текущий момент.</div>
        {#each transitCuspAsp as c (cuspKey(c))}
          {@const key = cuspKey(c)}
          <GlowCard radius={12} selected={openTCusp === key}
            onactivate={() => (openTCusp = openTCusp === key ? null : key)}>
            <div class="cusprow">
              <span class="cg glyph">{c.glyph}</span>
              <span class="csym glyph">{c.symbol}</span>
              <span class="clbl">куспид {c.cusp}{#if ANGLE_LBL[c.cusp]} ({ANGLE_LBL[c.cusp]}){/if}</span>
              <span class="corb">{c.orb.toFixed(2)}°</span>
            </div>
            {#if openTCusp === key}<div class="cusplore">{transitCuspText(c.planet, c.cusp, c.aspect)}</div>{/if}
          </GlowCard>
        {/each}
      </details>
    {/if}

    {#if mode === 'natal'}
      {#if natalAsp.length === 0}<div class="empty">В карте нет мажорных аспектов в орбисе.</div>{/if}
      <!-- в одиночном натале владелец не подписывается: «Луна (Саша) ☌ Венера
           (Саша)» было избыточно — чей натал, видно в заголовке карты -->
      {#each natalAsp as a (staticKey(a))}
        <GlowCard radius={12} selected={staticKey(a) === selKey}
          onactivate={() => toggleDetail(a, null, null)}>
          <StaticAspectRow {a} selected={staticKey(a) === selKey} />
        </GlowCard>
      {/each}
    {:else if mode === 'composite'}
      <!-- аспекты ВНУТРИ карты середин: владельцев нет, окон нет (карта статичная) -->
      <div class="grp">Аспекты композита · {compAsp.length}</div>
      <div class="hint small">Композит — карта самих отношений: аспекты читаются как характер союза,
        а не кого-то из двоих.</div>
      {#if compAsp.length === 0}<div class="empty">Нет мажорных аспектов в орбисе.</div>{/if}
      {#each compAsp as a (staticKey(a))}
        <GlowCard radius={12} selected={staticKey(a) === selKey}
          onactivate={() => toggleDetail(a, null, null)}>
          <StaticAspectRow {a} selected={staticKey(a) === selKey} />
        </GlowCard>
      {/each}
    {:else if mode === 'synastry'}
      {#if crossSyn.length === 0}<div class="empty">Нет мажорных аспектов в орбисе.</div>{/if}
      {#each crossSyn as a (staticKey(a))}
        <GlowCard radius={12} selected={staticKey(a) === selKey}
          onactivate={() => toggleDetail(a, personA?.name ?? null, personB?.name ?? null)}>
          <StaticAspectRow {a} ownerA={personA?.name} ownerB={personB?.name} selected={staticKey(a) === selKey} />
        </GlowCard>
      {/each}
    {:else if mode === 'transitNatal'}
      {#if crossTA.length === 0}<div class="empty">Транзит сейчас не образует мажорных аспектов к карте в орбисе.</div>{/if}
      {#each crossTA as a (staticKey(a))}
        <GlowCard radius={12} selected={staticKey(a) === selKey}
          onactivate={() => toggleDetail(a, personA?.name ?? null, 'транзит', posA, 'A')}>
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
                onactivate={() => toggleDetail(a, personA?.name ?? null, 'транзит', posA, 'A')}>
                <StaticAspectRow {a} ownerA={personA?.name} ownerB={'транзит'} {tz}
                  win={winFor(a, 'A')} selected={staticKey(a) === selKey} />
              </GlowCard>
            {/each}
            {#each h.toB as a (staticKey(a))}
              <GlowCard radius={12} selected={staticKey(a) === selKey}
                onactivate={() => toggleDetail(a, personB?.name ?? null, 'транзит', posB, 'B')}>
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
          onactivate={() => toggleDetail(a, personA?.name ?? null, 'транзит', posA, 'A')}>
          <StaticAspectRow {a} ownerA={personA?.name} ownerB={'транзит'} {tz}
            win={winFor(a, 'A')} selected={staticKey(a) === selKey} />
        </GlowCard>
      {/each}
      <div class="grp">Транзит → {personB?.name}</div>
      {#if singleTB.length === 0}<div class="empty">{doubleHits.length ? 'Остальных аспектов нет.' : 'Нет мажорных аспектов в орбисе.'}</div>{/if}
      {#each singleTB as a (staticKey(a))}
        <GlowCard radius={12} selected={staticKey(a) === selKey}
          onactivate={() => toggleDetail(a, personB?.name ?? null, 'транзит', posB, 'B')}>
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
        {#if mode === 'triple'}
          <div class="hint small">Показаны планеты НЕБА, касающиеся обеих карт в близкие дни —
            небесная планета общая, ничья.</div>
        {/if}
        {#if forecastRan}
          {#if mode === 'triple'}
            {#if forecastPairs.length === 0}<div class="empty">В этом окне нет транзитов, задевающих обе карты сразу.</div>{/if}
            {#each forecastPairs as r (r.tName + r.a.jd)}
              <div class="fcpair">
                <div class="fcphead"><span class="fcglyph glyph">{r.tGlyph}</span>
                  <b>{r.tName}</b> <small>небо · к обоим</small></div>
                <button class="fcrow half" class:sel={selKey === hitKey(r.a)} onclick={() => gotoHit(r.a)}>
                  <span class="fcnames">{r.a.symbol} {r.a.nName} <small>({r.a.owner})</small></span>
                  <span class="fcdate">{fmtHit(r.a.when)} <span class="go">→</span></span>
                </button>
                <button class="fcrow half" class:sel={selKey === hitKey(r.b)} onclick={() => gotoHit(r.b)}>
                  <span class="fcnames">{r.b.symbol} {r.b.nName} <small>({r.b.owner})</small></span>
                  <span class="fcdate">{fmtHit(r.b.when)} <span class="go">→</span></span>
                </button>
              </div>
            {/each}
          {:else}
            {#if forecastList.length === 0}<div class="empty">В этом окне точных транзитов нет.</div>{/if}
            {#each forecastList as h (hitKey(h) + h.jd)}
              <button class="fcrow" class:sel={selKey === hitKey(h)} onclick={() => gotoHit(h)}>
                <span class="fcglyph glyph">{h.tGlyph}<span class="fcasp">{h.symbol}</span>{h.nGlyph}</span>
                <span class="fcnames">{h.tName} {h.aspect} {h.nName} <small>({h.owner})</small></span>
                <span class="fcdate">{fmtHit(h.when)} <span class="go">→</span></span>
              </button>
            {/each}
          {/if}
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
              {#if houseOfA(p.lon)}<span class="hbadge">{houseOfA(p.lon)}</span>{/if}
              <span class="posval">{fmtPosRx(p.lon, p.retro)}</span></summary>
            <div class="posbody">
              {#if PLANET_LORE[p.name]}<div class="posrole">{PLANET_LORE[p.name].role}</div>{/if}
              {#if houseOfA(p.lon)}<div class="postext">Дом стояния: {houseOfA(p.lon)} — планета
                проявляется в этой сфере жизни и влияет на её дела.</div>{/if}
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

      {#if houseInfoA}
        <!-- дома: символизм 1↔Овен…, знак на куспиде, управитель(и), трактовка.
             Управитель — по авторской раскладке знака (SIGN_MYTHS). -->
        <div class="grp">Дома <Hint k="house" /></div>
        {#each houseInfoA as h (h.house)}
          <details class="posx">
            <summary><span class="hbadge big">{['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'][h.house - 1]}</span>
              <b>{h.sign}</b>
              <span class="posval">упр. {h.rulers.join(', ')}</span></summary>
            <div class="posbody">
              {#if h.lore}<div class="postext">{h.lore}</div>{/if}
              <div class="posrole">Управитель дома — {h.rulers.join(' и ')}
                ({h.rulers.length > 1 ? 'знак перехвачен: два управителя' : 'по знаку на куспиде'}).</div>
            </div>
          </details>
        {/each}
      {:else if personA && !personA.unknownTime}
        <div class="hint small" style="margin-top:8px">Дома не показаны: не задано место рождения
          (координаты). Впиши город в карточке человека — появятся куспиды и управители.</div>
      {/if}
    {:else}
      <details class="positions">
        <summary>Позиции</summary>
        <div class="posgrp">{personA?.name}</div>
        {#each posA as p}<div class="posrow"><span class="glyph">{p.glyph}</span> {p.name} — {fmtPosRx(p.lon, p.retro)}</div>{/each}
        {#if mode === 'synastry' || mode === 'triple' || mode === 'composite'}
          <div class="posgrp">{personB?.name}</div>
          {#each posB as p}<div class="posrow"><span class="glyph">{p.glyph}</span> {p.name} — {fmtPosRx(p.lon, p.retro)}</div>{/each}
        {/if}
        {#if mode === 'composite'}
          <!-- у точек композита нет ретро-статуса — fmtPos, не fmtPosRx -->
          <div class="posgrp">Композит</div>
          {#each posMid as p}<div class="posrow"><span class="glyph">{p.glyph}</span> {p.name} — {fmtPos(p.lon)}</div>{/each}
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
    {engine} {orbOf} anchor={detailAnchor} lon1={detailLon1} lon2={detailLon2} source={noteSource}
    ongoto={ongoto ? (d) => { detail = null; ongoto?.(d); } : null}
    onclose={() => (detail = null)}
    oncommunity={(s, t) => { detail = null; oncommunity?.(s, t); }} />
{/if}

{#if showPrompt}
  <PromptSheet text={chartPromptText} onclose={() => (showPrompt = false)} />
{/if}

<style>
  /* backdrop — глобальный .sheet-backdrop (app.css); .sheet локальный: почти
     во весь экран (100dvh) — своя высота, не под .sheet-base */
  .backdrop { z-index: 20; }
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

  /* список людей (.prow/.pmain/.badge/.pinfo/.edit) — в charts/PeopleList.svelte */

  /* кнопки */
  .btn { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 11px 14px; }
  .btn.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); font-weight: 600; }
  .btn.add { width: 100%; margin-top: 6px; }
  /* «Открыть карту» отклеена от списка людей: свой зазор снизу + тонкий
     разделитель, чтобы кнопка не читалась как часть карточки первого человека
     (просьба владелицы 2026-07-25) */
  .btn.open { width: 100%; margin-top: 10px; margin-bottom: 14px;
    padding-bottom: 15px; border-bottom: 1px solid var(--glass-brd); border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
  .chatrow { display: flex; gap: 8px; margin: 2px 0 8px; }
  .btn.promptbtn { flex: 1; background: #ffffff10; }
  /* римский номер дома у планеты/куспида */
  .hbadge { flex: none; font-size: 0.7rem; font-weight: 700; color: var(--accent);
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    border-radius: 6px; padding: 1px 6px; font-variant-numeric: normal; }
  .hbadge.big { font-size: 0.82rem; min-width: 2.2rem; text-align: center; }

  /* форма (добавить/править человека) переехала в charts/PersonForm.svelte */

  /* карта */
  .legend { color: var(--ink-faint); font-size: 0.78rem; text-align: center; margin: 4px 0 12px; }
  .birth { color: var(--ink-dim); font-size: 0.78rem; text-align: center; margin: 0 0 4px;
    font-variant-numeric: tabular-nums; }
  .mini { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink-dim);
    border-radius: 999px; padding: 7px 12px; font-size: 0.78rem; }
  /* панель прокрутки транзита (.tctl/.tin/.scale/.mini.navd/ok/now/sc/.cap) —
     в charts/TransitControls.svelte */
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
  /* спаренный прогноз тройной карты: небесная планета → обе карты */
  .fcpair { border: 1px solid color-mix(in srgb, var(--gold) 40%, var(--glass-brd));
    background: color-mix(in srgb, var(--glass) 90%, var(--gold) 5%);
    border-radius: 12px; padding: 6px 8px; margin: 6px 0; }
  .fcphead { display: flex; align-items: center; gap: 8px; color: var(--ink);
    font-size: 0.88rem; padding: 2px 4px 4px; }
  .fcphead small { color: var(--ink-faint); }
  .fcrow.half { margin: 4px 0; padding: 6px 10px; }
  .grp { color: var(--accent); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px;
    font-weight: 600; margin: 12px 2px 6px; }
  .grp.gold { color: var(--gold); }
  .fold { margin: 0; }
  .fold summary { cursor: pointer; list-style: none; }
  .fold summary::-webkit-details-marker { display: none; }
  .fold summary::before { content: '▸ '; }
  .fold[open] summary::before { content: '▾ '; }
  .dispbox { padding: 12px 14px; margin: 6px 0 4px; }
  /* горизонтальный отступ, чтобы неоновая рамка/глоу GlowCard не наезжали на
     буквы у края («рамка съедает буквы») */
  .cusprow { display: flex; align-items: center; gap: 10px; padding: 4px 10px; }
  .cusprow .cg { font-size: 1.2rem; color: var(--silver); }
  .cusprow .csym { font-size: 1rem; color: var(--ink-dim); }
  .cusprow .clbl { flex: 1; font-size: 0.9rem; color: var(--ink); }
  .cusprow .corb { font-variant-numeric: tabular-nums; font-family: var(--font-mono); color: var(--ink-dim); font-size: 0.85rem; }
  .cusplore { margin-top: 8px; padding: 8px 10px 2px; border-top: 1px solid var(--glass-brd);
    color: var(--ink-faint); font-size: 0.85rem; line-height: 1.5; }
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
    padding: 8px 2px; color: var(--ink); min-width: 0; }
  .posx .posval { margin-left: auto; color: var(--ink-dim); font-family: var(--font-mono);
    font-size: 0.82rem; font-variant-numeric: tabular-nums;
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
