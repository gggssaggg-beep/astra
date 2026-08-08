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
  import { synastryAspects, staticAspects, compositeChart, circularMidpoint, staticKey, sunRank, ASPECTS, SLOW } from '../engine/index.ts';
  import type { StaticAspect } from '../engine/index.ts';
  import { PLANET_LORE, SIGN_LORE } from '../lib/lore.ts';
  import { natalPositions, birthInstantUTC } from '../lib/charts.ts';
  import { chartSource } from '../lib/journal.ts';
  import { analyzeHouses, houseOfLon, type HouseInfo } from '../lib/houses.ts';
  import { HOUSE_SYSTEMS } from '../lib/models.ts';
  import { buildAstroPrompt, type PromptPerson } from '../lib/aiPrompt.ts';
  import { fmtPos, fmtPosRx, tzLabel } from '../lib/format.ts';
  import { forecastTransits, transitWindow, type TransitHit, type TransitWindow } from '../lib/forecast.ts';
  import type { BodyPosition } from '../engine/index.ts';
  import Wheel from './Wheel.svelte';
  import { chartFigures } from '../lib/chartFigures.ts';
  import ChartFigureCard from './ChartFigureCard.svelte';
  import DispositorChains from './DispositorChains.svelte';
  import { cuspAspects, isEqualGrid } from '../lib/cuspAspects.ts';
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
  import VedicChart from './VedicChart.svelte';
  import VedicReport from './VedicReport.svelte';
  import { vedicNatal, vargaCells, gocharaCells, degMin } from '../lib/vedicChart.ts';
  import { VARGA_LIST, vargaInfo, type VargaId } from '../lib/vargas.ts';
  import { drishtiSigns } from '../lib/drishti.ts';
  import { buildVedicPrompt } from '../lib/vedicPrompt.ts';
  import { kutaMatch, manglik } from '../lib/kuta.ts';
  import { KUTA_LORE, TOTAL_LORE, DOSHA_LORE, MANGLIK_LORE, KUTA_NOTE } from '../lib/kutaLore.ts';
  import { nakshatraOf, signIndexOf, VEDIC_ORDER_SET } from '../lib/vedic.ts';
  import { taraOf, chandraHouse, CHANDRA_LORE, CHANDRA_GOOD } from '../lib/panchangaLore.ts';
  import { antarWindows, sidIngresses, stationsInWindow, monthlyGochara } from '../lib/vedicForecast.ts';
  import { ZODIAC } from '../engine/index.ts';

  let { engine, orbOf, signStyle, defaultTz, tz, objects = null, houseSystem = 'horizontal',
        nodalAxisFigures = false, vedic = false,
        initialMode = 'transitNatal', initialSelect = null, onclose, oncommunity, ongoto }:
    { engine: Engine; orbOf: (name: string) => number; signStyle: SignStyle;
      defaultTz: string; tz: string; objects?: string[] | null; houseSystem?: string;
      nodalAxisFigures?: boolean;
      /** ведический режим: натал и транзит рисуются ромбом D1/гочарой, а не колесом */
      vedic?: boolean;
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
    // В КОМПОЗИТЕ обе точки аспекта — из карты середин: натальные posA/posB тут
    // чужие (иначе «когда ещё» искало бы транзит к градусу человека A, а «Участники
    // в знаках» показали бы знаки людей вместо знаков композита).
    const base = mode === 'composite' ? posMid : posA;
    // фикс. долгота a.p1: из переданного натального набора либо из base/posB
    const lon1 = (natalPos ?? base).find((p) => p.name === a.p1)?.lon
      ?? base.find((p) => p.name === a.p1)?.lon ?? posB.find((p) => p.name === a.p1)?.lon;
    detailAnchor = lon1 != null ? { lon: lon1, planet: a.p2 } : null;
    // долгота a.p2 для SignContext: транзит → из transitPos; синастрия → posB;
    // натал/композит → тот же набор. p1 берём из уже найденного lon1.
    const lon2 = ob === 'транзит'
      ? transitPos.find((p) => p.name === a.p2)?.lon
      : mode === 'composite' ? posMid.find((p) => p.name === a.p2)?.lon
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
  // раскрытые пояснения гуна-милана: строка куты, итог, манглик
  let openKuta = $state<string | null>(null);
  let openKutaTotal = $state(false);
  let openKutaMang = $state(false);
  // запоминаем выбор для следующего открытия (память сессии, не диск)
  $effect(() => { lastMode = mode; lastPair = pair.slice(); lastView = view === 'chart' ? 'chart' : 'list'; });

  // Западные режимы. В джйотише у них свои имена и свой состав: «натал» там
  // кундали (раши), «транзит+натал» — гочара, «синастрия» — гуна-милан по
  // накшатрам Лун. Композита в джйотише нет вовсе (изобретение западного XX
  // века), «небо к двум наталам» тоже: гочару смотрят каждому отдельно —
  // поэтому в ведическом режиме эти два режима не показываем.
  const MODES_WEST: { id: Mode; label: string; need: number; hint: string }[] = [
    { id: 'natal', label: 'Натал', need: 1, hint: 'одна карта — её аспекты и положения' },
    { id: 'transitNatal', label: 'Транзит + натал', need: 1, hint: 'небо сейчас к карте человека' },
    { id: 'triple', label: 'Транзит + 2 натала', need: 2, hint: 'небо сейчас к двум людям' },
    { id: 'synastry', label: 'Синастрия', need: 2, hint: 'межаспекты карт двух людей' },
    { id: 'composite', label: 'Композит', need: 2, hint: 'общая карта пары — середины между вашими планетами' },
  ];
  const MODES_VEDIC: { id: Mode; label: string; need: number; hint: string }[] = [
    { id: 'natal', label: 'Кундали', need: 1, hint: 'карта рождения — раши (D1), дома, дришти' },
    { id: 'transitNatal', label: 'Гочара', need: 1, hint: 'транзит грах по домам от твоей лагны' },
    { id: 'synastry', label: 'Гуна-милан', need: 2, hint: 'совместимость по накшатрам Лун — куты и доши' },
  ];
  const MODES = $derived(vedic ? MODES_VEDIC : MODES_WEST);
  const modeInfo = $derived(MODES.find((m) => m.id === mode) ?? MODES[0]);
  const needCount = $derived(modeInfo.need);
  // переключили школу, стоя в композите/тройной — в джйотише их нет, уводим
  // на кундали, иначе экран остался бы на режиме, которого нет в списке
  $effect(() => {
    if (vedic && !MODES_VEDIC.some((m) => m.id === mode)) setMode('natal');
  });
  // статья глоссария под каждый режим — «?» рядом с описанием выбранного.
  // В джйотише свои статьи: западные «Натальная карта»/«Транзит»/«Синастрия»
  // там не к месту (правка владелицы 2026-07-29).
  const MODE_GLOSS_WEST: Record<Mode, string> = {
    natal: 'natal', transitNatal: 'transit', triple: 'transit',
    synastry: 'synastry', composite: 'composite',
  };
  const MODE_GLOSS_VEDIC: Partial<Record<Mode, string>> = {
    natal: 'kundali', transitNatal: 'gochara', synastry: 'kuta',
  };
  const modeGloss = $derived((vedic ? MODE_GLOSS_VEDIC[mode] : null) ?? MODE_GLOSS_WEST[mode]);

  function setMode(m: Mode): void {
    mode = m;
    const need = (MODES.find((x) => x.id === m) ?? MODES_WEST.find((x) => x.id === m))!.need;
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

  // Ведический режим: натал человека A ромбом D1 (нужны место и время — иначе
  // нет лагны). null → показываем колесо с честной подписью-предупреждением.
  const vedicA = $derived.by(() => {
    if (!vedic || !personA || (mode !== 'natal' && mode !== 'transitNatal')) return null;
    try { return vedicNatal(engine, personA); } catch { return null; }
  });

  // дришти натальной карты рисует сам разбор (VedicReport) — здесь дублировать
  // не надо: карта человека и её разбор теперь один экран.

  // «Я не астролог» из настроек: разбор прячет специальные слои (навамша,
  // отношения грах, дришти, аштакаварга, варги). Тумблер был в настройках, но
  // никуда не приходил — теперь он наконец работает.
  const vedicSimple = $derived(!!db.settings.get().vedicSimple);

  // Стиль чертежа кундали (север — ромб, юг — квадратная сетка). Держим ЛОКАЛЬНО
  // в $state: db.settings.get() не реактивен, а переключатель стоит прямо над
  // картой — она должна перерисоваться сразу. Значение пишем и в настройки.
  let chartStyle = $state<'north' | 'south'>(db.settings.get().chartStyle ?? 'north');
  function setChartStyle(s: 'north' | 'south') {
    chartStyle = s;
    db.settings.set({ ...db.settings.get(), chartStyle: s });
  }

  // Гочара: показывать ли вместе с транзитными грахами ещё и грахи рождения
  // (одна карта вместо двух — просьба астролога). По умолчанию — вместе.
  let withNatal = $state(true);

  // варга (D1/D9/D10…) — переключатель над ромбом кундали. Ходовые три кнопками,
  // остальные списком: восемь кнопок в ряд на телефоне не влезают.
  const VARGA_MAIN: VargaId[] = ['d1', 'd9', 'd10'];
  const VARGA_MORE = VARGA_LIST.filter((v) => !VARGA_MAIN.includes(v.id));
  let varga = $state<VargaId>('d1');
  const inMoreVarga = $derived(VARGA_MORE.some((v) => v.id === varga));

  // ГОЧАРА-ДРИШТИ: транзитная граха смотрит на натальную (по целым знакам).
  // Джйотиш-замена «транзит аспектирует натал» — держится знаком, не орбисом.
  const transitDrishti = $derived.by(() => {
    if (!vedicA || mode !== 'transitNatal') return [];
    const lagna = vedicA.chart.lagnaSign;
    const house = (si: number) => ((si - lagna + 12) % 12) + 1;
    const out: { from: string; to: string; fromSign: number; toSign: number;
      fromHouse: number; toHouse: number }[] = [];
    for (const t of transitPos) {
      if (!VEDIC_ORDER_SET.has(t.name)) continue;
      const tSign = signIndexOf(t.lon);
      const targets = drishtiSigns(t.name, tSign);
      if (!targets.length) continue;
      for (const n of vedicA.chart.planets) {
        if (targets.includes(n.signIndex)) {
          out.push({ from: t.name, to: n.name, fromSign: tSign, toSign: n.signIndex,
            fromHouse: house(tSign), toHouse: n.house });
        }
      }
    }
    return out;
  });

  // «ДЕНЬ ДЛЯ ЭТОГО ЧЕЛОВЕКА» — тарабала (счёт накшатр от его Луны) и чандра-
  // гочара (дом Луны от его натальной). Раньше блок жил на главном экране;
  // решение владелицы 2026-07-29: место личного слоя — в «Картах», у карты
  // человека. Следует за перемоткой момента, как и вся гочара.
  const personalDay = $derived.by(() => {
    if (!vedic || mode !== 'transitNatal' || !personA) return null;
    const natalMoon = posA.find((p) => p.name === 'Луна');
    const tMoon = transitPos.find((p) => p.name === 'Луна');
    if (!natalMoon || !tMoon) return null;
    const natal = nakshatraOf(natalMoon.lon);
    const tara = taraOf(natal.index, nakshatraOf(tMoon.lon).index);
    const house = chandraHouse(signIndexOf(natalMoon.lon), signIndexOf(tMoon.lon));
    return { tara, house, text: CHANDRA_LORE[house - 1], good: CHANDRA_GOOD.has(house),
      natalNak: natal.name, unknownTime: !!personA.unknownTime };
  });

  // Грахи гочары списком: знак, накшатра и дом ОТ ЛАГНЫ выбранного человека.
  // Джйотиш-замена западного списка «Позиции» (там были только градусы) —
  // и заодно то, что раньше жило отдельной вкладкой «Сейчас на небе».
  const gocharaRows = $derived.by(() => {
    if (!vedicA || mode !== 'transitNatal') return [];
    const lagna = vedicA.chart.lagnaSign;
    return transitPos.filter((p) => VEDIC_ORDER_SET.has(p.name)).map((p) => {
      const si = signIndexOf(p.lon);
      const nak = nakshatraOf(p.lon);
      return { name: p.name, glyph: p.glyph, retro: p.retro, signIndex: si,
        deg: p.lon - si * 30, nak: nak.name, pada: nak.pada,
        house: ((si - lagna + 12) % 12) + 1 };
    });
  });

  // КУТА (гуна-милан) — джйотиш-замена синастрии: считается от ЛУН двоих,
  // место рождения не обязательно (лагна не нужна). Манглик — только если у
  // человека есть место (нужна лагна).
  const kutaData = $derived.by(() => {
    if (!vedic || mode !== 'synastry' || !personA || !personB) return null;
    const mA = posA.find((p) => p.name === 'Луна'), mB = posB.find((p) => p.name === 'Луна');
    if (!mA || !mB) return null;
    const nA = nakshatraOf(mA.lon), nB = nakshatraOf(mB.lon);
    const sA = signIndexOf(mA.lon), sB = signIndexOf(mB.lon);
    const mang = (p: Person | null) => {
      if (!p?.place) return null;
      try {
        const v = vedicNatal(engine, p);
        return v ? manglik(v.chart.planets, v.chart.lagnaSign, v.chart.moonSign) : null;
      } catch { return null; }
    };
    return {
      res: kutaMatch(nA.index - 1, sA, nB.index - 1, sB),
      a: { sign: ZODIAC[sA], nak: nA }, b: { sign: ZODIAC[sB], nak: nB },
      mangA: mang(personA), mangB: mang(personB),
    };
  });

  // что прятать из западных блоков: ведический натал/гочара ИЛИ кута-синастрия
  const vedicHide = $derived(!!vedicA || !!kutaData);

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
  // Спаренный вид «♀ Венера (небо): □ Луна (я) · △ Марс (Пётр)» — иначе
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
  // ОПИСАНИЕ с владельцем — «Уран (Пётр) ⚹ Раху (транзит)», а не «просто
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
  // Текущие транзиты к точкам композита (срез «сейчас»): что в связи активировано.
  // Точки фиксированы — окна считает тот же механизм rowWins, что у транзит+натал.
  // Стоит здесь, а не рядом с compAsp: нужны transitPos и byTransit (объявлены выше).
  const crossTC = $derived(mode === 'composite' && posMid.length
    ? synastryAspects(posMid, transitPos, orbOf).sort(byTransit) : []);

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
      : mode === 'composite' ? [...compAsp, ...crossTC]
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
  // Равнодомная сетка (куспиды через 30°): аспект к одному куспиду повторяется
  // к восьми с тем же орбисом — оставляем только оси 1/10 (см. isEqualGrid).
  const equalGrid = $derived(housesA ? isEqualGrid(housesA.cusps) : false);
  const gridFilter = (c: { cusp: number }): boolean => !equalGrid || c.cusp === 1 || c.cusp === 10;
  // аспекты натальных планет к куспидам домов A (§4) — только если дома есть
  const cuspAsp = $derived(mode === 'natal' && housesA
    ? cuspAspects(posA, housesA.cusps, orbOf).filter(gridFilter) : []);
  // транзиты к натальным куспидам A: проходящие планеты активируют темы домов
  // (снимок «сейчас»). Только в режимах с транзитом и когда дома A известны.
  const transitCuspAsp = $derived((mode === 'transitNatal' || mode === 'triple') && housesA
    ? cuspAspects(transitPos, housesA.cusps, orbOf).filter(gridFilter) : []);
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
    if (view !== 'chart' || (mode !== 'transitNatal' && mode !== 'triple' && mode !== 'composite')) return;
    // композит: цель — точки карты середин (одно кольцо, ring 'A')
    const jobs = mode === 'composite'
      ? crossTC.map((a) => ({ a, natal: posMid, ring: 'A' as const }))
      : [
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
    return `${d}.${m}.${y} · ${tm} · ${tzLabel(p.birthTz)}${where}`;
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

  // Заголовок — В ТЕРМИНАХ ШКОЛЫ (правка владелицы 2026-07-29: в джйотише не
  // должно быть западных слов). Кундали/гочара/гуна-милан вместо натала и
  // транзита; тройная и композит — западные инструменты, остаются как есть.
  const chartTitle = $derived(
    mode === 'natal' ? `${vedic ? 'Кундали' : 'Натал'} · ${personA?.name}`
    : mode === 'synastry' ? `${vedic ? 'Гуна-милан · ' : ''}${personA?.name} ✕ ${personB?.name}`
    : mode === 'composite' ? `Композит · ${personA?.name} + ${personB?.name}`
    : mode === 'triple' ? `Транзит · ${personA?.name} + ${personB?.name}`
    : `${vedic ? 'Гочара' : 'Транзит'} · ${personA?.name}`);

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
  // null-владелец = без суффикса (композит: «(композит)» на каждой планете шумел)
  const aspLine = (list: StaticAspect[], oa: string | null, ob: string | null): string =>
    list.slice(0, 20).map((a) => `${a.p1}${oa ? ` (${oa})` : ''} ${a.aspect} ${a.p2}${ob ? ` (${ob})` : ''}, орбис ${a.orb.toFixed(2)}° (${weightOf(a)})`).join('; ');
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
    // джйотиш: заполненный раздел «КАРТА» мастер-промпта астролога вместо
    // западного текста (образец — docs/JYOTISH_MASTER_PROMPT.md)
    if (vedicA) {
      let ayanamsaDeg: number | undefined;
      try { ayanamsaDeg = engine.ayanamsa(engine.toJD(birthInstantUTC(personA))); } catch { /* без цифры */ }
      // прогнозный горизонт 6 месяцев — как в живом запросе астролога
      // (антардаши + переходы транзитов); ~1500 вызовов движка, но текст
      // собирается лениво — только при открытии «Промпта для ИИ»
      const months = 6, days = 183;
      const to = new Date(transitAt.getTime() + days * 86400000);
      let forecast = null;
      try {
        forecast = {
          months,
          antars: antarWindows(vedicA.dashas, transitAt, to),
          ingresses: sidIngresses(engine, transitAt, days),
          stations: stationsInWindow(engine, transitAt, to),
          months12: monthlyGochara(engine, vedicA.chart.moonSign, transitAt, months),
        };
      } catch { /* прогноз опционален — карта важнее */ }
      return buildVedicPrompt({
        person: personA, natal: vedicA, ayanamsaDeg, tz, forecast,
        ayanamsa: db.settings.get().ayanamsa,
        nodes: db.settings.get().vedicNodes ?? 'mean',
        transit: { at: transitAt, positions: transitPos },
      });
    }
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
      // raw без скоростей: «v=+0.000» противоречил «скоростей нет» и читался
      // ИИ как «планета стационарна» (вычитка живого промпта 2026-07-27)
      people.push({ name: `Композит ${personA.name} + ${personB.name}`,
        birth: 'карта средних точек двух рождений (вне времени)',
        positions: posLine(posMid, false),
        raw: posMid.map((p) => `${p.name} ${p.lon.toFixed(3)}°`).join('; ') });
      if (compAsp.length) aspects.push('Аспекты композита: ' + aspLine(compAsp, null, null));
      if (crossTC.length) aspects.push('Транзит → композит (небо сейчас к карте отношений): '
        + aspLineT(crossTC, 'композит', 'A'));
      // Общие чувствительные градусы пары: синастрические СОЕДИНЕНИЯ (точки двоих
      // в одном градусе). Транзит по такому градусу включает обоих сразу; если он
      // же в эти даты задевает точку композита — совпадение слоёв и есть ответ
      // «почему именно сейчас» (слой из разбора ChatGPT 2026-07-27). crossSyn уже
      // посчитан (считается при двух выбранных людях в любом режиме).
      const conj = crossSyn.filter((x) => x.aspect === 'соединение').slice(0, 12);
      if (conj.length) aspects.push('ОБЩИЕ ЧУВСТВИТЕЛЬНЫЕ ГРАДУСЫ ПАРЫ (синастрические '
        + 'соединения: здесь точки двоих стоят в одном градусе — транзит по нему включает '
        + 'обоих сразу; если тот же транзит в эти же даты задевает и точку композита, '
        + 'совпадение слоёв — ответ на «почему именно сейчас»): '
        + conj.map((x) => {
          const lA = posA.find((p) => p.name === x.p1)?.lon;
          const lB = posB.find((p) => p.name === x.p2)?.lon;
          const mid = lA != null && lB != null
            ? ` — общий градус ~${fmtPos(circularMidpoint(lA, lB))}` : '';
          return `${x.p1} (${personA.name}) ☌ ${x.p2} (${personB.name})${mid}, орбис ${x.orb.toFixed(2)}°`;
        }).join('; '));
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
      // без системы домов у композита: строка противоречила «дома не считаются»
      title: chartTitle, kind: mode,
      houseSystem: mode === 'composite' ? undefined : houseSysLabel,
      people, aspects, weighted: true,
      // транзитные планеты — С ДОМАМИ натальной карты A (houseOfA); чьи это дома,
      // промпт называет явно (в тройной карте иначе не понять)
      // у композита домов нет — небо даём без привязки к домам (housesOwner)
      transit: (mode === 'transitNatal' || mode === 'triple')
        ? { label: transitLabel, positions: posLine(transitPos, true), raw: rawLine(transitPos),
            housesOwner: housesA ? personA.name : undefined }
        : mode === 'composite' && crossTC.length
          ? { label: transitLabel, positions: posLine(transitPos, false), raw: rawLine(transitPos) }
          : undefined,
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

  let showPrompt = $state(false);      // окно «Промпт для любой ИИ»

  // «Откуда» заметка: «Я+Пётр 13.06.25» / «Я 20.06.2006» (просьба владелицы
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
    </div>
    <!-- «?» объясняет ВЫБРАННЫЙ режим (жалоба владелицы 2026-07-27: одна общая
         «?» в ряду всегда открывала «Транзит» — не к селу ни к городу) -->
    <div class="hint">{modeInfo.hint} — выбери
      {needCount === 1 ? 'человека' : 'двух людей'}. <Hint k={modeGloss} /></div>

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
      {#if vedicA}
        <!-- джйотиш: кундали — ромб, не колесо. Разбор (дома, грахи, дришти,
             аштакаварга, даши) идёт НИЖЕ на этом же экране: отдельной шторки
             «Полный разбор карты» больше нет — лишний переход убран по правке
             владелицы 2026-07-29. -->
        <!-- стиль чертежа под рукой: тот же выбор, что в настройках (пишет туда же) -->
        <div class="vargas">
          <button class:on={chartStyle === 'north'} onclick={() => setChartStyle('north')}>Север · ромб</button>
          <button class:on={chartStyle === 'south'} onclick={() => setChartStyle('south')}>Юг · квадрат</button>
        </div>
        <!-- «я не астролог»: варги — специальный слой, их не показываем -->
        {#if !vedicSimple}
        <div class="vargas">
          {#each VARGA_MAIN as id}
            <button class:on={varga === id} onclick={() => (varga = id)}>{id.toUpperCase()}</button>
          {/each}
          <select class="more" class:on={inMoreVarga} aria-label="Другие варги"
            value={inMoreVarga ? varga : ''}
            onchange={(e) => {
              const v = (e.currentTarget as HTMLSelectElement).value;
              if (v) varga = v as VargaId;
            }}>
            <option value="">ещё…</option>
            {#each VARGA_MORE as v}<option value={v.id}>{v.label}</option>{/each}
          </select>
        </div>
        {/if}
        <VedicChart cells={vargaCells(vedicA.chart, vedicSimple ? 'd1' : varga)} layout={chartStyle} />
        <div class="legend">{vedicSimple ? 'D1' : varga.toUpperCase()} ·
          {vedicSimple || varga === 'd1' ? 'раши' : vargaInfo(varga).theme}
          {personA?.name} · лагна
          {degMin(vedicA.chart.lagnaLon % 30)} {ZODIAC[vedicA.chart.lagnaSign]}</div>
        {#if !vedicSimple && varga !== 'd1'}
          {@const info = vargaInfo(varga)}
          <div class="vnote"><b>{info.label} — {info.theme}.</b> Варга берёт одну тему крупным
            планом: по ней смотрят, дотягивает ли граха то, что обещает в раши. Градусы здесь
            не пишут — в варге своя, растянутая шкала. Разбор ниже — всегда по раши (D1).</div>
        {/if}
      {:else}
        <Wheel positions={posA} staticAspects={natalAsp} {signStyle} houses={housesA}
          selectedStaticKey={selKey} figureStaticKeys={figStaticKeys} onstatictap={onStatic} />
        <div class="legend">натальная карта {personA?.name}</div>
        {#if vedic}<div class="vnote">Для ромба D1 нужны место и точное время рождения —
          без них нет лагны, показано западное колесо.</div>{/if}
      {/if}
    {:else if mode === 'composite'}
      <!-- одно кольцо середин: домов у композита нет (housesA к нему не относятся),
           скраба нет — карта статичная -->
      <Wheel positions={posMid} staticAspects={compAsp} {signStyle}
        selectedStaticKey={selKey} figureStaticKeys={figStaticKeys} onstatictap={onStatic} />
      <div class="legend">композит {personA?.name} + {personB?.name} — середины планет <Hint k="composite" /></div>
    {:else if mode === 'synastry'}
      {#if kutaData}
        <!-- джйотиш-совместимость: КУТА (гуна-милан) по Лунам двоих — колесо и
             орбисные межаспекты здесь ни при чём -->
        <div class="kuta glass">
          <div class="kmoons">
            <div><b>{personA?.name}</b> — Луна {kutaData.a.sign} · {kutaData.a.nak.name} (пада {kutaData.a.nak.pada})</div>
            <div><b>{personB?.name}</b> — Луна {kutaData.b.sign} · {kutaData.b.nak.name} (пада {kutaData.b.nak.pada})</div>
          </div>
          <!-- Каждая кута раскрывается: что меряет и что значит именно этот балл
               (правка владелицы 2026-08-07 — в блоке не было ни одного пояснения).
               Приём тот же, что у ведических аспектов: «Что это значит» в строке. -->
          {#each kutaData.res.scores as s (s.name)}
            {@const lore = KUTA_LORE[s.name]}
            <button class="krow" class:open={openKuta === s.name}
              onclick={() => (openKuta = openKuta === s.name ? null : s.name)}>
              <span class="kn">{s.name}</span>
              <span class="knote">{s.note ?? ''}</span>
              <span class="kv" class:zero={s.got === 0}>{s.got}/{s.max}</span>
            </button>
            {#if openKuta === s.name && lore}
              {@const verdict = s.got === 0 ? lore.zero : s.got >= s.max ? lore.full : (lore.part || lore.full)}
              <div class="kexpl">{lore.what}<span class="kexpl2">{verdict}</span></div>
            {/if}
          {/each}
          <div class="ktotal">Итог: <b>{kutaData.res.total} из 36</b> — {kutaData.res.verdict}</div>
          <button class="lorebtn" onclick={() => (openKutaTotal = !openKutaTotal)}>
            {openKutaTotal ? 'Свернуть' : 'Что это значит'} {openKutaTotal ? '▴' : '▾'}</button>
          {#if openKutaTotal}<div class="kexpl">{TOTAL_LORE}</div>{/if}
          {#if kutaData.res.doshas.length}
            <div class="kdosha">⚠ {kutaData.res.doshas.join('; ')}</div>
            <div class="kexpl">{DOSHA_LORE}</div>
          {/if}
          {#if kutaData.mangA || kutaData.mangB}
            <div class="kmang">Манглик: {personA?.name} — {kutaData.mangA ? (kutaData.mangA.any ? 'да' : 'нет') : '(нет лагны)'};
              {personB?.name} — {kutaData.mangB ? (kutaData.mangB.any ? 'да' : 'нет') : '(нет лагны)'}.
              {#if kutaData.mangA?.any && kutaData.mangB?.any}Оба — доша взаимно погашена.{/if}</div>
            <button class="lorebtn" onclick={() => (openKutaMang = !openKutaMang)}>
              {openKutaMang ? 'Свернуть' : 'Что это значит'} {openKutaMang ? '▴' : '▾'}</button>
            {#if openKutaMang}<div class="kexpl">{MANGLIK_LORE}</div>{/if}
          {/if}
        </div>
        <div class="vnote">{KUTA_NOTE}</div>
        <div class="vnote">Кута считается от Луны первого выбранного ({personA?.name} = «невеста»
          в направленных кутах — поменяй порядок выбора, если наоборот). Вашья и йони в v1
          упрощены — сверить с программой астролога.</div>
      {:else}
        <Wheel positions={posA} positionsOuter={posB} staticAspects={crossSyn} {signStyle} houses={housesA}
          selectedStaticKey={selKey} figureStaticKeys={figStaticKeys} onstatictap={onStatic} />
        <div class="legend">внутри — {personA?.name}, снаружи — {personB?.name} <Hint k="synastry" /></div>
      {/if}
    {:else if mode === 'transitNatal'}
      {#if vedicA}
        <!-- гочара: транзитные грахи по домам ОТ НАТАЛЬНОЙ лагны — так джйотиш
             и читает транзит («Сатурн идёт по 7-му дому»). Скраб работает:
             transitPos пересчитывается, клетки следуют -->
        <VedicChart layout={chartStyle}
          cells={gocharaCells(transitPos, vedicA.chart.lagnaSign,
            withNatal ? vedicA.chart.planets : undefined)} />
        <div class="legend">гочара — небо на {transitLabel} в домах {personA?.name}</div>
        <!-- один чертёж вместо двух: грахи гочары и грахи рождения рядом -->
        <div class="vargas">
          <button class:on={withNatal} onclick={() => (withNatal = true)}>гочара + кундали</button>
          <button class:on={!withNatal} onclick={() => (withNatal = false)}>только гочара</button>
        </div>
        {#if withNatal}
          <div class="vnote"><span class="lgt">грахи гочары</span> — те, что идут по небу сейчас;
            <span class="lgn">грахи рождения</span> — из кундали {personA?.name}. Обе группы в одной
            клетке стоят в одном знаке.</div>
        {/if}
        <div class="vnote">Дома — от лагны рождения ({ZODIAC[vedicA.chart.lagnaSign]}).
          Сама кундали тем же чертежом — режим «Кундали».</div>
        {@render transitCtl()}
        {#if personalDay}
          <!-- личный день: тарабала + ход Луны от натальной. Переехал сюда с
               главного экрана — там день «вообще», здесь день конкретного
               человека (правка владелицы 2026-07-29) -->
          <div class="grp">День для {personA?.name} <Hint k="tarabala" /></div>
          <div class="pers glass">
            <div class="prow2">
              <span class="ptara" class:good={personalDay.tara.good}>{personalDay.tara.index}. {personalDay.tara.name}</span>
              <span class="pverdict">{personalDay.tara.good ? 'благоприятная тара' : 'тара осторожности'}</span>
            </div>
            <p>{personalDay.tara.text}</p>
            <div class="prow2">
              <span class="ptara" class:good={personalDay.good}>Луна в {personalDay.house}-м от натальной</span>
              <span class="pverdict">{personalDay.good ? 'удачный ход' : 'слабый ход'}</span>
            </div>
            <p>{personalDay.text}</p>
            <div class="pfrom">Считается от Луны рождения — накшатра {personalDay.natalNak}.
              {#if personalDay.unknownTime}⚠ Время рождения не задано: Луна проходит накшатру
                примерно за сутки, поэтому тара может оказаться соседней.{/if}</div>
          </div>
        {/if}
      {:else}
        <Wheel positions={posA} positionsOuter={transitPos} staticAspects={crossTA} {signStyle} houses={housesA}
          selectedStaticKey={selKey} figureStaticKeys={figStaticKeys} onstatictap={onStatic} onscrub={scrubTransit} />
        <div class="legend">внутри — {personA?.name}, снаружи — транзит на {transitLabel}</div>
        {#if vedic}<div class="vnote">Для гочары нужны место и точное время рождения —
          без них нет лагны, показано западное колесо.</div>{/if}
        {@render transitCtl()}
      {/if}
    {:else}
      <Wheel positions={posA} positionsOuter={posB} positionsOuter2={transitPos}
        staticAspects={crossTA} staticAspects2={crossTB} {signStyle} houses={housesA}
        selectedStaticKey={selKey} figureStaticKeys={figStaticKeys} onstatictap={onStatic} onscrub={scrubTransit} />
      <div class="legend">внутри — {personA?.name}, среднее — {personB?.name}, снаружи — транзит на {transitLabel}</div>
      {@render transitCtl()}
    {/if}

    <!-- синастрия/тройная/композит — ЗАПАДНЫЕ инструменты: в джйотише
         совместимость считается кутами (по накшатрам Лун), а композита нет
         вовсе. Не прячем (углы между планетами от аянамши не зависят — расчёт
         честен), но предупреждаем -->
    {#if vedic && (mode === 'triple' || mode === 'composite')}
      <div class="vnote">Это инструмент западной школы: в джйотише аналога нет
        (композит — изобретение XX века, «небо к двум наталам» смотрят гочарой
        каждого отдельно). Углы между планетами от аянамши не зависят — расчёт
        корректен, но читается по-западному.</div>
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

    {#if chartFigs.length && !vedicHide}
      <!-- «по желанию» (просьба владелицы): раздел свёрнут, как соседние fold-разделы.
           В джйотише скрыт: фигуры — орбисные конфигурации, западное -->
      <details class="fold">
        <summary class="grp">◆ Фигуры{#if mode === 'transitNatal' || mode === 'triple'} — замыкает транзит{/if} · {chartFigs.length}</summary>
        {#each chartFigs as f (f.key)}
          <ChartFigureCard fig={f} selected={selFigKey === f.key}
            onactivate={() => (selFigKey = selFigKey === f.key ? null : f.key)} />
        {/each}
      </details>
    {/if}

    <!-- диспозиторы в джйотише скрыты: цепочки идут по АВТОРСКОЙ западной
         раскладке управителей, в джйотише управители классические -->
    {#if mode === 'natal' && posA.length && !vedicA}
      <details class="fold">
        <summary class="grp">⛓ Цепочки диспозиторов</summary>
        <div class="hint small">Каждая планета служит управителю своего знака — до «царя» карты (планеты в своём знаке) или кольца соправителей.</div>
        <div class="glass dispbox"><DispositorChains positions={posA} /></div>
      </details>
    {/if}

    {#if cuspAsp.length && !vedicHide}
      <details class="fold">
        <summary class="grp">📐 Аспекты к куспидам · {cuspAsp.length} <Hint k="cusp" /></summary>
        <div class="hint small">Куспид — «дверь» дома (сферы жизни). Планета, задевающая эту дверь, окрашивает вход в сферу своим архетипом. Орбис куспида 1°.{#if equalGrid}
          В равнодомной системе куспиды идут ровно через 30°, и аспект к одному повторяется к восьми — показаны только оси Asc и MC, остальные несут ту же сетку.{/if}</div>
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

    {#if transitCuspAsp.length && !vedicHide}
      <details class="fold">
        <summary class="grp">🚶 Транзиты к куспидам · {transitCuspAsp.length}</summary>
        <div class="hint small">Куспид — «дверь» дома (сферы жизни). Транзитная планета у этой двери активирует сферу прямо сейчас, временно включает её тему. Снимок на текущий момент.{#if equalGrid}
          В равнодомной системе куспиды идут ровно через 30°, и аспект к одному повторяется к восьми — показаны только оси Asc и MC, остальные несут ту же сетку.{/if}</div>
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

    {#if vedicHide}
      <!-- Западных орбисных списков в джйотише нет вовсе (ответ на вопрос
           владелицы 2026-07-29 «почему в джйотиш западные аспекты?»): дришти
           грах кундали идут ниже, внутри самого разбора (VedicReport), а
           прогноз здесь делают даши и гочара — они там же. -->

      <!-- гочара-дришти: какие ТРАНЗИТНЫЕ грахи смотрят на грахи кундали.
           В джйотише это и есть «транзит задел карту» — вместо орбисных окон -->
      {#if vedicA && mode === 'transitNatal' && transitDrishti.length}
        <details class="fold" open>
          <summary class="grp">☍ Дришти гочары · {transitDrishti.length} <Hint k="drishti" /></summary>
          <div class="hint small">Идущая граха смотрит на граху кундали по целым знакам:
            влияние держится, пока она проходит этот знак, — в градусах и минутах не считается.</div>
          {#each transitDrishti as d (d.from + d.to)}
            <div class="drow glass">
              <div class="drhead">в гочаре <b>{d.from}</b> ({ZODIAC[d.fromSign]}, {d.fromHouse}-й дом)
                смотрит на <b>{d.to}</b> в кундали ({ZODIAC[d.toSign]}, {d.toHouse}-й дом)</div>
            </div>
          {/each}
        </details>
      {/if}
    {:else}
    {#if mode === 'natal'}
      {#if natalAsp.length === 0}<div class="empty">В карте нет мажорных аспектов в орбисе.</div>{/if}
      <!-- в одиночном натале владелец не подписывается: «Луна (Пётр) ☌ Венера
           (Пётр)» было избыточно — чей натал, видно в заголовке карты -->
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
      <!-- срез «сейчас» к карте отношений. Линии в колесе НЕ рисуем: у композита
           одно кольцо, транзитным точкам там места нет — только список -->
      {#if crossTC.length}
        <details class="fold">
          <summary class="grp">🚶 Транзит к композиту сейчас · {crossTC.length} <Hint k="transit-composite" /></summary>
          <div class="hint small">Небо на {transitLabel} к карте отношений: какие темы связи
            активированы прямо сейчас. Даты точных попаданий — в прогнозе ниже.</div>
          {#each crossTC as a (staticKey(a))}
            <GlowCard radius={12} selected={staticKey(a) === selKey}
              onactivate={() => toggleDetail(a, 'композит', 'транзит', posMid, 'A')}>
              <StaticAspectRow {a} ownerA={'композит'} ownerB={'транзит'} {tz}
                win={winFor(a, 'A')} selected={staticKey(a) === selKey} />
            </GlowCard>
          {/each}
        </details>
      {/if}
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
    {/if}

    {#if forecastTargets.length && !vedicHide}
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

    {#if vedicA && mode === 'natal'}
      <!-- ПОЛНЫЙ РАЗБОР КУНДАЛИ прямо здесь, без перехода в отдельную шторку
           (правка владелицы 2026-07-29: «мы и так на моей карте — зачем ещё
           куда-то тыкать»). Западные «Положения»/«Дома» ниже в джйотише не
           показываем: там знаки трактуются по-западному, а управители домов —
           по авторской раскладке, чего в джйотише нет. -->
      <VedicReport {engine} {tz} natal={vedicA} simple={vedicSimple} />

    {:else if vedicA && mode === 'transitNatal'}
      <!-- гочара списком: где какая граха идёт сейчас — знак, накшатра, дом от
           лагны. Заменяет западный список «Позиции» с градусами -->
      <details class="fold" open>
        <summary class="grp">✧ Грахи в гочаре · {transitLabel}</summary>
        <div class="vtable glass">
          <div class="vrow th"><span class="vn">Граха</span><span class="vsign">Знак</span>
            <span class="vnak">Накшатра</span><span class="vh">Дом</span></div>
          {#each gocharaRows as r (r.name)}
            <div class="vrow">
              <span class="vn"><span class="glyph">{r.glyph}</span> {r.name}{r.retro ? ' R' : ''}</span>
              <span class="vsign">{degMin(r.deg)} {ZODIAC[r.signIndex]}</span>
              <span class="vnak">{r.nak} ({r.pada})</span>
              <span class="vh">{r.house}-й</span>
            </div>
          {/each}
        </div>
      </details>

    {:else if mode === 'natal'}
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
          <div class="posgrp">Композит <Hint k="midpoint" /></div>
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
    composite={mode === 'composite'}
    ongoto={ongoto ? (d) => { detail = null; ongoto?.(d); } : null}
    onclose={() => (detail = null)}
    oncommunity={(s, t) => { detail = null; oncommunity?.(s, t); }} />
{/if}

{#if showPrompt}
  <PromptSheet text={chartPromptText} vedic={!!vedicA || !!kutaData} onclose={() => (showPrompt = false)} />
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
  /* пояснение ведического режима: что здесь джйотиш, а что — западная школа */
  .vnote { color: var(--ink-faint); font-size: 0.74rem; line-height: 1.45;
    text-align: center; margin: -6px 8px 12px; }
  /* переключатель варг над ромбом — мельче кнопок режима: это выбор карты
     внутри кундали, а не раздел */
  .vargas { display: flex; gap: 6px; margin: 0 0 8px; }
  .vargas button { flex: 1; padding: 6px 8px; border-radius: 10px; font-size: 0.78rem;
    background: transparent; border: 1px solid var(--glass-brd); color: var(--ink-faint); }
  .vargas button.on { color: var(--ink-dim); border-color: color-mix(in srgb, var(--gold) 35%, var(--glass-brd)); }
  .vargas .more { flex: 1.7; min-width: 0; padding: 6px 8px; border-radius: 10px;
    font-size: 0.78rem; background: transparent; border: 1px solid var(--glass-brd);
    color: var(--ink-faint); }
  .vargas .more.on { color: var(--ink-dim);
    border-color: color-mix(in srgb, var(--gold) 35%, var(--glass-brd)); }
  .vnote b { color: var(--ink-dim); font-weight: 500; }
  /* легенда совмещённого чертежа — теми же цветами, что и метки в клетках */
  .lgt { color: var(--neon-cyan); }
  .lgn { color: var(--ink-dim); }
  /* строки дришти (джйотиш-аспекты по знакам) */
  .drow { padding: 9px 12px; margin: 6px 0; border-radius: 12px; }
  .drhead { font-size: 0.84rem; color: var(--ink); line-height: 1.4; }
  .drhead b { font-weight: 600; }
  /* личный день (тарабала + чандра-гочара) */
  .pers { padding: 12px 14px; margin: 6px 0 10px; border-radius: 14px; }
  .pers p { margin: 4px 0 10px; font-size: 0.86rem; line-height: 1.55; color: var(--ink-dim); }
  .prow2 { display: flex; align-items: baseline; gap: 10px; }
  .ptara { font-size: 0.9rem; color: var(--rose); }
  .ptara.good { color: var(--gold); }
  .pverdict { margin-left: auto; color: var(--ink-faint); font-size: 0.72rem;
    text-transform: uppercase; letter-spacing: 0.6px; }
  .pfrom { color: var(--ink-faint); font-size: 0.76rem; line-height: 1.5; }
  /* таблица грах гочары: знак · накшатра · дом от лагны */
  .vtable { padding: 4px 6px; margin: 6px 0 10px; border-radius: 12px; }
  /* Жалоба владелицы 2026-08-07: «Грахи в гочаре» вылезали за рамки, страница
     ездила вбок. Причина — четыре колонки в фиксированных долях: «Пурва
     Бхадрапада (4)» не влезает, а у grid-детей min-width по умолчанию auto, и
     колонка распирала таблицу шире экрана.
     Решение — не сжимать текст, а разложить строку на ДВЕ линии (мерено в
     браузере на 320 px: сжатие давало столбик по две буквы). Накшатра уходит
     под первую линию во всю ширину. От 430 px, где всё влезает, строка
     собирается обратно в один ряд из четырёх колонок. */
  .vrow { display: grid; gap: 2px 6px; padding: 7px 6px; font-size: 0.82rem; color: var(--ink);
    grid-template-columns: minmax(0, 7.4rem) minmax(0, 1fr) 2.4rem;
    grid-template-areas: 'nm sg hs' 'nk nk nk'; align-items: baseline; }
  .vrow > span { min-width: 0; overflow-wrap: anywhere; }
  .vn { grid-area: nm; }
  .vsign { grid-area: sg; }
  .vnak { grid-area: nk; }
  .vh { grid-area: hs; }
  @media (min-width: 430px) {
    .vrow { grid-template-columns: 5.4rem minmax(0, 7rem) minmax(0, 1fr) 2.4rem;
      grid-template-areas: 'nm sg nk hs'; align-items: center; gap: 6px; }
  }
  .vrow + .vrow { border-top: 1px solid var(--glass-brd); }
  .vrow.th { color: var(--ink-faint); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; }
  .vn { display: flex; align-items: baseline; gap: 6px; color: var(--ink-dim); }
  .vnak { color: var(--ink-dim); font-size: 0.78rem; }
  .vh { color: var(--ink-faint); text-align: right; }
  /* кута (гуна-милан): таблица восьми кут + итог */
  .kuta { padding: 12px 14px; margin: 8px 0 6px; border-radius: 16px; }
  .kmoons { display: flex; flex-direction: column; gap: 4px; font-size: 0.84rem;
    color: var(--ink); margin-bottom: 10px; }
  .krow { display: grid; grid-template-columns: 7.2rem minmax(0, 1fr) 3.2rem; gap: 6px; padding: 5px 0;
    align-items: baseline; font-size: 0.82rem; border-top: 1px solid var(--glass-brd); }
  .krow > * { min-width: 0; overflow-wrap: anywhere; }
  /* строка куты — кнопка: раскрывает пояснение, поэтому гасим вид кнопки */
  .krow { background: transparent; border: none; border-top: 1px solid var(--glass-brd);
    width: 100%; text-align: left; font: inherit; color: inherit; cursor: pointer; }
  .krow.open .kn { color: var(--ink); }
  .kn { color: var(--ink-dim); }
  .knote { color: var(--ink-faint); font-size: 0.74rem; }
  /* пояснение куты: что меряет + что значит именно этот балл */
  .kexpl { color: var(--ink-dim); font-size: 0.8rem; line-height: 1.5; padding: 2px 0 8px; }
  .kexpl2 { display: block; margin-top: 6px; color: var(--ink-faint); }
  .lorebtn { background: transparent; border: none; padding: 6px 0 2px; text-align: left;
    color: var(--ink-dim); font-size: 0.78rem; }
  .kv { text-align: right; color: var(--ink); font-variant-numeric: tabular-nums; }
  .kv.zero { color: var(--rose); }
  .ktotal { margin-top: 10px; font-size: 0.9rem; color: var(--ink); }
  .kdosha { color: var(--rose); font-size: 0.8rem; margin-top: 6px; }
  .kmang { color: var(--ink-dim); font-size: 0.8rem; margin-top: 6px; line-height: 1.45; }
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
