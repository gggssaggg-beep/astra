<script lang="ts">
  // Кэш тяжёлых расчётов дня — в ОБЩЕМ модуле lib/dayCache.ts (живёт между
  // пересозданиями компонента на листание и делится с чатом).
  import { aspectsOnCached, eventsOnCached, figuresOnCached } from '../lib/dayCache.ts';
  import type { Engine, AspectRecord, BodyPosition } from '../engine/index.ts';
  import { staticAspects } from '../engine/index.ts';
  import { fmtPos, fmtPosRx, fmtTime, zonedDayStartUTC, todayCivil, sameDay } from '../lib/format.ts';
  import AspectCard from './AspectCard.svelte';
  import FigureCard from './FigureCard.svelte';
  import GlowCard from './GlowCard.svelte';
  import Wheel from './Wheel.svelte';
  import VedicChart from './VedicChart.svelte';
  import { gocharaCells, type NatalGraha } from '../lib/vedicChart.ts';
  import { VEDIC_ORDER_SET, signIndexOf as sidSign, BHAVA_THEME } from '../lib/vedic.ts';
  import { vedicDayEvents } from '../lib/vedicEvents.ts';
  import { gocharaTeaser } from '../lib/gocharaTeaser.ts';
  import { degMin } from '../lib/vedicChart.ts';
  import type { DashaPeriod } from '../lib/vedic.ts';
  import { ZODIAC as ZODIAC_RU, PLANET_GLYPH } from '../engine/index.ts';
  import { panchangaOf } from '../lib/panchanga.ts';
  import { kalamsOf, kalamNow, KALAM_LORE } from '../lib/kalam.ts';
  import { dayFrame } from '../lib/upagraha.ts';
  import { auspiciousCurve, pointAt } from '../lib/auspicious.ts';
  import AuspiciousChart from './AuspiciousChart.svelte';
  import { dayHeadline, VARA_LORE, TITHI_LORE, PAKSHA_LORE, tithiGroup, KARANA_LORE,
    NAKSHATRA_LORE, YOGA_LORE } from '../lib/panchangaLore.ts';
  import Hint from './Hint.svelte';
  import { reveal } from '../lib/reveal.ts';
  import { aspectSignature } from '../lib/signature.ts';
  import { discussionCounts } from '../lib/community.ts';
  import { db, onChange } from '../lib/db.ts';

  import type { SignStyle } from '../lib/models.ts';
  import type { WheelInfo } from '../lib/lore.ts';
  // Прокрутка живёт в App (переживает пересоздание страницы, не сбрасывается на
  // границе суток). Сюда приходят готовый `snapshot` (прокрученный момент для
  // колеса/планет/Луны) и `scrubbed`/`scrubScale`; жест колеса и «↺ сейчас»/
  // смена масштаба — коллбэки наверх.
  let { engine, date, snapshot, scrubbed = false, scrubScale = 'day',
        vedic = false, vedicLagna = null, vedicMoon = null, vedicDashas = null,
        vedicNatalGrahas = null, chartStyle = 'north',
        orbOf, tz, objects = null, signStyle = 'gold', nodalAxisFigures = false,
        selectedSignature = null, selectedInfo = null, vedicPlace = null,
        onAspect, oninfo, onscrub, onresetnow, onscale, ongraha }:
    { engine: Engine; date: Date; snapshot: Date; scrubbed?: boolean;
      scrubScale?: 'day' | 'month' | 'year';
      vedic?: boolean;
      /** знак лагны «моей карты» (0..11) — от него нумеруются дома гочары;
       *  null = своей карты нет, показываем просто знаки */
      vedicLagna?: number | null;
      /** Луна «моей карты»: от неё считаются тарабала и чандра-гочара — то, что
       *  джйотиш и называет «какой сегодня день ДЛЯ МЕНЯ». Место рождения тут
       *  не нужно, а вот время важно (Луна проходит накшатру за сутки). */
      vedicMoon?: { lon: number; unknownTime: boolean; name: string } | null;
      /** периоды Вимшоттари «моей карты»: смены даш попадают в события дня */
      vedicDashas?: DashaPeriod[] | null;
      /** грахи рождения «моей карты» — их можно наложить на гочару одним чертежом;
       *  null = своей карты (или места рождения) нет, показываем только гочару */
      vedicNatalGrahas?: NatalGraha[] | null;
      /** место «моей карты»: каламы и мухурты считаются от восхода и заката,
       *  а те бывают только у точки на земле. null — блока не будет */
      vedicPlace?: { name: string; lat: number; lon: number } | null;
      /** стиль чертежа кундали: 'north' — ромб, 'south' — квадратная сетка */
      chartStyle?: 'north' | 'south';
      orbOf: (name: string) => number; tz: string;
      objects?: string[] | null; signStyle?: SignStyle; nodalAxisFigures?: boolean;
      selectedSignature?: string | null; selectedInfo?: WheelInfo | null;
      onAspect?: (r: AspectRecord) => void; oninfo?: (info: WheelInfo) => void;
      onscrub?: (deltaMs: number) => void; onresetnow?: () => void;
      onscale?: (s: 'day' | 'month' | 'year') => void;
      /** тап по плашке грахи — открыть её страницу (джйотиш) */
      ongraha?: (name: string) => void } = $props();

  // Сутки (для аспектов/событий) — 00:00 ВЫБРАННОГО пояса ЭФФЕКТИВНОЙ даты (при
  // прокрутке за полночь `date` = гражданская дата прокрученного момента, контент
  // следует за ней). Снимок положений (колесо, Луна, чипы) — переданный `snapshot`.
  const dayStart = $derived(zonedDayStartUTC(date, tz));
  const isToday = $derived(!scrubbed && date.getTime() === todayCivil(tz).getTime());

  const SCRUB_CAP = { day: 'сутки за оборот', month: 'месяц за оборот', year: 'год за оборот' } as const;
  // подпись прокрученного дня для строки под колесом (в поясе tz)
  const dfDay = (d: Date) => new Intl.DateTimeFormat('ru-RU',
    { timeZone: tz, day: 'numeric', month: 'short' }).format(d);

  const positions = $derived(engine.positions(snapshot, objects ?? undefined));

  // ── ведический вид неба (гочара) ───────────────────────────────────────────
  // Транзиты в джйотише читают от ЛАГНЫ натальной карты, а не от Овна: «Сатурн
  // идёт по 7-му дому». Нет своей карты (или места рождения) — показываем просто
  // знаки, честно об этом подписав.
  // Грахи рождения можно наложить на гочару одним чертежом (просьба астролога):
  // видно сразу, куда транзит пришёл в карте. По умолчанию — вместе.
  let withNatal = $state(true);
  const canPairNatal = $derived(!!vedicNatalGrahas?.length);
  const skyCells = $derived(gocharaCells(positions, vedicLagna ?? 0,
    withNatal && vedicNatalGrahas?.length ? vedicNatalGrahas : undefined));

  // Дришти и юти с главного экрана УБРАНЫ (правка астролога 2026-07-29): их
  // место — в карте человека, а не в ленте дней. Переходы грах перестали быть
  // отдельным разделом — они внутри «Событий дня» (там же станции, границы
  // накшатры/титхи/йоги и смены даш).
  const vedicFrom = $derived(vedicLagna == null
    ? 'дома не показаны: задай свою карту с местом рождения — тогда транзит ляжет на твои дома'
    : 'дома — от лагны твоей карты (гочара)');
  const moon = $derived(positions.find((p) => p.name === 'Луна'));
  const sun = $derived(positions.find((p) => p.name === 'Солнце'));

  // ── панчанга: пять членов дня (вара, титхи, накшатра, йога, карана) ────────
  // В джйотише «содержание дня» — это она, а не список аспектов с орбисами.
  // Долготы берём из уже посчитанных positions: в ведическом режиме движок
  // сидерический, значит и накшатра, и йога считаются от правильного круга.
  const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // день недели в ПОЯСЕ ПОКАЗА, а не в UTC: после полуночи пояса вара уже другая
  const civilWeekday = (d: Date) => WEEKDAYS_EN.indexOf(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d));
  const panchanga = $derived(vedic && sun && moon
    ? panchangaOf(sun.lon, moon.lon, civilWeekday(snapshot)) : null);

  // ── трактовка дня (джйотиш) ───────────────────────────────────────────────
  // Главный текст дня: накшатра ведёт, вара и титхи уточняют, трудная йога
  // добавляет оговорку. Личный слой («День для тебя» — тарабала и чандра-
  // гочара) с главного экрана уехал в «Карты»: там, где заведена карта
  // человека (решение владелицы 2026-07-29).
  const dayText = $derived(panchanga
    ? dayHeadline({
        varaDay: panchanga.vara.day, varaLord: panchanga.vara.lord,
        tithiName: panchanga.tithi.name, tithiIndex: panchanga.tithi.index,
        paksha: panchanga.tithi.paksha,
        nakshatra: panchanga.nakshatra.name, yoga: panchanga.yoga.name,
      })
    : null);
  // раскрытая строка панчанги (одна за раз — иначе экран превращается в простыню)
  let openPan = $state<string | null>(null);
  const panRows = $derived(panchanga ? [
    { k: 'вара', label: 'Вара', value: `${panchanga.vara.name} · ${panchanga.vara.lord}`,
      text: VARA_LORE[panchanga.vara.day] ?? '' },
    { k: 'титхи', label: 'Титхи', value: `${panchanga.tithi.index} · ${panchanga.tithi.name} · ${panchanga.tithi.paksha}`
        + ` · прошло ${Math.round(panchanga.tithi.fraction * 100)}%`,
      text: `${TITHI_LORE[panchanga.tithi.name] ?? ''} ${PAKSHA_LORE[panchanga.tithi.paksha]}`
        + ` Группа: ${tithiGroup(panchanga.tithi.index).name} — ${tithiGroup(panchanga.tithi.index).text}.` },
    { k: 'накшатра', label: 'Накшатра Луны', value: `${panchanga.nakshatra.name} · пада ${panchanga.nakshatra.pada}`
        + ` · упр. ${panchanga.nakshatra.lord}`,
      text: NAKSHATRA_LORE[panchanga.nakshatra.name] ?? '' },
    { k: 'йога', label: 'Йога', value: `${panchanga.yoga.index} · ${panchanga.yoga.name}`,
      text: YOGA_LORE[panchanga.yoga.name]
        ? `${YOGA_LORE[panchanga.yoga.name].good ? 'Благоприятная' : 'Трудная'} — `
          + `${YOGA_LORE[panchanga.yoga.name].text}.` : '' },
    { k: 'карана', label: 'Карана', value: panchanga.karana.name,
      text: KARANA_LORE[panchanga.karana.name] ?? '' },
  ] : []);

  // КАЛАМЫ И МУХУРТЫ (просьба астролога 12.08.2026). Отсчитываются от восхода
  // и заката в МЕСТЕ, поэтому без места «моей карты» блока просто нет.
  // Кадр суток берём тот же, что и упаграхи (dayFrame): джйотиш-сутки начинаются
  // с восхода, и полночь тут ни при чём.
  const kalams = $derived.by(() => {
    if (!vedic || !vedicPlace) return [];
    try {
      const frame = dayFrame(snapshot, {
        riseAfter: (t) => { const r = engine.sunRiseSet(engine.toJD(t), vedicPlace.lat, vedicPlace.lon, 'rise'); return r == null ? null : engine.fromJD(r); },
        setAfter: (t) => { const r = engine.sunRiseSet(engine.toJD(t), vedicPlace.lat, vedicPlace.lon, 'set'); return r == null ? null : engine.fromJD(r); },
        asc: () => 0,   // каламам лагна не нужна
        weekday: (t) => civilWeekday(t),
      });
      return frame ? kalamsOf(frame) : [];
    } catch { return []; }
  });
  const hhmm = (d: Date) => new Intl.DateTimeFormat('ru-RU',
    { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d);
  let openKalam = $state<string | null>(null);

  // КРИВАЯ БЛАГОПРИЯТНОСТИ СУТОК (просьба астролога 12.08.2026, образец —
  // Vedic times). Считается на сутки от восхода: полосы дня, йога панчанги, а
  // при известной Луне рождения ещё тарабала и чандра-гочара. Веса —
  // предварительные, см. lib/auspicious.ts.
  const auspicious = $derived.by(() => {
    if (!vedic || !kalams.length) return [];
    const frame0 = kalams[0];
    const from = new Date(frame0.from.getTime() - 6 * 3600_000);
    try {
      return auspiciousCurve({
        windows: kalams,
        from,
        to: new Date(from.getTime() + 24 * 3600_000),
        natalMoonLon: vedicMoon?.unknownTime ? null : vedicMoon?.lon ?? null,
        sample: (t) => {
          const pos = engine.positions(t, ['Солнце', 'Луна']);
          const sn = pos.find((p) => p.name === 'Солнце');
          const mn = pos.find((p) => p.name === 'Луна');
          return sn && mn ? { sunLon: sn.lon, moonLon: mn.lon } : null;
        },
      });
    } catch { return []; }
  });
  const auspiciousNow = $derived(isToday ? pointAt(auspicious, snapshot) : null);

  // фаза Луны — из уже посчитанных долгот (элонгация Луна−Солнце), без движка
  const PHASE_EM = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  const phase = $derived.by(() => {
    if (!moon || !sun) return null;
    const e = ((moon.lon - sun.lon) % 360 + 360) % 360;
    const illum = Math.round(((1 - Math.cos((e * Math.PI) / 180)) / 2) * 100);
    const idx = Math.round(e / 45) % 8;
    const name = idx === 0 ? 'новолуние' : idx === 4 ? 'полнолуние' : e < 180 ? 'растущая' : 'убывающая';
    return { em: PHASE_EM[idx], name, illum };
  });

  // тёплое приветствие по времени суток — только на «сегодня»
  const greet = $derived.by(() => {
    if (!isToday) return null;
    const h = parseInt(new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: 'numeric', hour12: false }).format(snapshot), 10);
    return h < 5 ? 'Тихой ночи ✧' : h < 12 ? 'Доброе утро ✧' : h < 18 ? 'Доброго дня ✧' : 'Тихого вечера ✧';
  });
  // Порядок по колонкам (требование астролога): левая сверху-вниз, потом правая.
  // Сетка заполняется по столбцам (grid-auto-flow: column, 5 строк).
  const ORDER = ['Солнце', 'Меркурий', 'Венера', 'Марс', 'Раху',
    'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Кету'];
  // Доп. объекты (астероиды/Лилит), если включены тумблером, — хвостом списка:
  // порядок ORDER задан астрологом только для базовых.
  const planets = $derived.by(() => {
    const list = [
      ...ORDER.map((n) => positions.find((p) => p.name === n)).filter((p): p is BodyPosition => !!p),
      ...positions.filter((p) => p.name !== 'Луна' && !ORDER.includes(p.name)),
    ];
    // в джйотише грах девять: Уран/Нептун/астероиды в ведическом списке не место
    return vedic ? list.filter((p) => VEDIC_ORDER_SET.has(p.name)) : list;
  });
  // ПЛАШКИ ГРАХ (правка астролога 2026-07-29): вместо строки таблицы — карточка
  // с домом от лагны и затравкой в несколько слов, чтобы «глянул и понял».
  // Тап уводит на страницу грахи с полным разбором.
  const favTransits = $derived(db.settings.get().favTransits ?? []);
  const grahaCards = $derived.by(() => {
    if (!vedic) return [];
    return planets.map((p) => {
      const si = sidSign(p.lon);
      const house = vedicLagna == null ? 0 : ((si - vedicLagna + 12) % 12) + 1;
      return { name: p.name, glyph: p.glyph, retro: p.retro, lon: p.lon, signIndex: si,
        sign: ZODIAC_RU[si], deg: p.lon - si * 30, house,
        teaser: gocharaTeaser(p.name, ZODIAC_RU[si]),
        fav: favTransits.includes(`${p.name}|${ZODIAC_RU[si]}`) };
    });
  });

  const day = $derived(aspectsOnCached(engine, dayStart, orbOf, objects));
  const allAspects = $derived([...day.moon, ...day.fast, ...day.slow]);
  // КОЛЕСО ЧЕСТНОЕ К МОМЕНТУ: линии = РЕАЛЬНЫЕ углы между показанными планетами
  // на прокрученный момент (staticAspects — град-в-град между positions, как в
  // проф. астропроцессорах). Прошлый фикс фильтровал дневные аспекты по
  // ПРИБЛИЗИТЕЛЬНОМУ окну — у быстрой Луны окна короткие, линии выпадали, а при
  // прокрутке гасли (жалоба владелицы: колесо скудное, прокрутка «не работает»).
  // Теперь крутишь — планеты движутся, линии честно собираются и распадаются.
  // applying/времена берём из дневного аспекта по сигнатуре (для dim/тона).
  const wheelAspects = $derived.by<AspectRecord[]>(() => {
    const byDay = new Map(allAspects.map((a) => [aspectSignature(a.p1, a.p2, a.aspect), a]));
    const recs: AspectRecord[] = staticAspects(positions, orbOf).map((s) => {
      const day = byDay.get(aspectSignature(s.p1, s.p2, s.aspect));
      if (day) return day;
      // аспект в орбисе на момент, но не в дневном списке (Луна в редком часе) —
      // минимальный record: Wheel рисует линию по p1/p2/aspect/symbol/applying
      return { p1: s.p1, p2: s.p2, aspect: s.aspect, symbol: s.symbol, exactOrb: s.orb,
        exactTime: null, beginTime: null, endTime: null, applying: true, pos1: 0, pos2: 0, bucket: 'fast' };
    });
    // выбранный аспект держим всегда, даже если сейчас уже вне орбиса
    if (selectedSignature && !recs.some((r) => aspectSignature(r.p1, r.p2, r.aspect) === selectedSignature)) {
      const sel = allAspects.find((a) => aspectSignature(a.p1, a.p2, a.aspect) === selectedSignature);
      if (sel) recs.push(sel);
    }
    return recs;
  });

  // метка «в сообществе есть обсуждение» — тихий сетевой запрос по сигнатурам дня
  // (оффлайн-ядро не ждёт: пусто без входа/сети). Обновляется при смене дня.
  let discCounts = $state<Map<string, number>>(new Map());
  $effect(() => {
    const sigs = allAspects.map((a) => aspectSignature(a.p1, a.p2, a.aspect));
    let cancelled = false;
    void discussionCounts(sigs).then((m) => { if (!cancelled) discCounts = m; });
    return () => { cancelled = true; };
  });
  const events = $derived(eventsOnCached(engine, dayStart));
  // СОБЫТИЯ ДНЯ (джйотиш): всё, что сегодня меняется, одним списком — смены
  // знака всеми грахами с домом от лагны, станции, затмения, границы накшатры,
  // титхи и йоги, смены даш «моей карты».
  const vedicEvents = $derived.by(() => {
    if (!vedic) return [];
    try {
      return vedicDayEvents(engine, dayStart,
        { lagnaSign: vedicLagna, dashas: vedicDashas, base: events });
    } catch { return []; }
  });

  // «Фигуры дня» — конфигурации аспектов (§ раунд 29). Тап по фигуре подсвечивает
  // весь её полигон в колесе (набор линий) и раскрывает декомпозицию.
  // крупные фигуры вперёд (большой крест выше одинокого треугольника); кэш
  // возвращает ТУ ЖЕ ссылку — сортируем копию (Svelte 5 реактивность)
  const figures = $derived([...figuresOnCached(engine, dayStart, orbOf, objects, nodalAxisFigures)]
    .sort((a, b) => b.hit.spec.arity - a.hit.spec.arity || a.hit.spec.name.localeCompare(b.hit.spec.name, 'ru')));
  let selFigureKey = $state<string | null>(null);
  // смена дня сбрасывает выбор (ключ фигуры другого дня не совпадёт всё равно)
  $effect(() => { void dayStart; selFigureKey = null; });
  const selFigure = $derived(figures.find((f) => f.hit.key === selFigureKey) ?? null);
  const figureSigs = $derived(selFigure
    ? selFigure.hit.edges.map((e) => aspectSignature(e.p1, e.p2, e.aspect)) : null);
  // Прокрутка колеса снимает подсветку фигуры С ПЕРВОГО движения пальца — как в
  // «Картах» (selFigKey в scrubTransit). Иначе на прокрученный момент фигуры уже
  // нет, её рёбра не находятся, а остальные линии всё это время притушены.
  function scrubWheel(deltaMs: number): void {
    if (selFigureKey) selFigureKey = null;
    onscrub?.(deltaMs);
  }

  // вертикальный порядок в блоках уже задан движком (aspects.ts: быстрые сверху
  // по sunRank, Луна — по времени точного аспекта) — здесь не пересортировываем
  const section = (title: string, list: AspectRecord[]) => ({ title, list });
  // «?» про аспекты — только на первой НЕпустой секции (не троить подсказку)
  const firstAspectSec = $derived(
    day.moon.length ? 'Луна' : day.fast.length ? 'Быстрые' : day.slow.length ? 'Медленные' : null);

  // ── Онбординг: разовая подсветка «?» (П.2) ─────────────────────────────
  // При ПЕРВОМ визите экрана дня кнопки-подсказки «?» мягко пульсируют 3 сек
  // (класс на обёртке .day → CSS-анимация; экономия глушит её общим правилом
  // app.css :root[data-saver] — обычный CSS animation, не инлайн-стиль).
  // Гаснет по таймеру ИЛИ при первом тапе по любой «?» — тогда флаг seenHintGlow.
  // ВАЖНО: DayScreen смонтирован ПОД оверлеем Welcome — стартуем подсветку
  // только когда приветствие закрыто (seenWelcome), иначе 3 сек сгорали за
  // оверлеем и пользователь пульсацию не видел.
  let glowHints = $state(false);
  function dismissHintGlow() {
    if (db.settings.get().seenHintGlow) return;   // уже гасили — не трогаем стор
    db.settings.set({ ...db.settings.get(), seenHintGlow: true });
    glowHints = false;
  }
  $effect(() => {
    if (db.settings.get().seenHintGlow) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const tryStart = () => {
      const s = db.settings.get();
      if (glowHints || t || s.seenHintGlow || !s.seenWelcome) return;
      glowHints = true;
      t = setTimeout(dismissHintGlow, 3000);      // до 3 сек, потом сам гаснет
    };
    tryStart();                                    // уже не первый запуск → сразу
    const off = onChange(tryStart);                // Welcome закрылся → старт
    return () => { off(); if (t) clearTimeout(t); };
  });

  // ── Онбординг: разбор первой карточки аспекта (П.5) ────────────────────
  // Одноразовая обучалка НАД первой карточкой — как обучалка журнала
  // (seenJournalHelp): видна до «Понятно», флаг в настройках (пишем напрямую в db).
  let seenCardHelp = $state(!!db.settings.get().seenAspectCardHelp);
  function dismissCardHelp() {
    db.settings.set({ ...db.settings.get(), seenAspectCardHelp: true });
    seenCardHelp = true;
  }
</script>

<!-- glow-hints: разовая пульсация «?» (П.2). Тап по любой «?» гасит подсветку —
     ловим в фазе ЗАХВАТА, т.к. Hint делает stopPropagation (не всплывёт). -->
<div class="day" class:glow-hints={glowHints}
  onclickcapture={(e) => { if (glowHints && (e.target as HTMLElement)?.closest('.hint-q')) dismissHintGlow(); }}>
  {#if greet}<div class="greet display">{greet}</div>{/if}
  <div class="wheel-wrap glass" data-tour="wheel">
    <!-- В джйотише колеса нет: карту рисуют квадратом (северо-индийский ромб).
         Круг с линиями аспектов — западная форма, и линии там строятся по
         орбисам, которых в джйотише тоже нет (дришти считаются по знакам). -->
    {#if vedic}
      <VedicChart cells={skyCells} layout={chartStyle} />
      {#if canPairNatal}
        <!-- один чертёж вместо двух: гочара и грахи рождения рядом -->
        <div class="vpair" role="group" aria-label="Что показывать на чертеже">
          <button class="vp" class:on={withNatal} onclick={() => (withNatal = true)}>гочара + кундали</button>
          <button class="vp" class:on={!withNatal} onclick={() => (withNatal = false)}>только гочара</button>
        </div>
        {#if withNatal}
          <div class="vhint"><span class="lgt">грахи гочары</span> — идут по небу сейчас;
            <span class="lgn">грахи рождения</span> — из твоей кундали</div>
        {/if}
      {/if}
      <div class="vhint">{vedicFrom}</div>
    {:else}
      <Wheel {positions} aspects={wheelAspects} {signStyle} {selectedSignature} {selectedInfo} {figureSigs}
        {oninfo} onscrub={onscrub ? scrubWheel : undefined} />
    {/if}
    <!-- честно объясняем момент снимка: «то же время суток, что сейчас» — иначе
         выглядит как загадочные «мои 4 утра» (вопрос владелицы). Прокрутка колеса
         двигает момент — тогда показываем прокрученную дату/время и кнопку «сейчас». -->
    <div class="snaptime">
      {#if scrubbed}
        <button class="resetnow" onclick={() => onresetnow?.()}>↺ сейчас</button>
        <span>прокрутка · <b class="scrubday">{dfDay(snapshot)}</b>,&nbsp;{fmtTime(snapshot, tz)}</span>
      {:else}
        {isToday ? `сейчас · ${fmtTime(snapshot, tz)}` : `на ${fmtTime(snapshot, tz)} — тот же час, что сейчас`}
      {/if}
    </div>
    <!-- масштаб прокрутки как в «Картах»: оборот диска = сутки/30 суток/365 суток.
         Дата при прокрутке уезжает в ШАПКУ (её меняет App), контент следует. -->
    <!-- прокрутка и легенда цветов — принадлежность КОЛЕСА: у квадратной карты
         нет ни диска под палец, ни линий аспектов, которые надо расшифровывать -->
    {#if !vedic}
      <div class="scale" role="group" aria-label="Масштаб прокрутки">
        <button class="sc" class:on={scrubScale === 'day'} onclick={() => onscale?.('day')}>день</button>
        <button class="sc" class:on={scrubScale === 'month'} onclick={() => onscale?.('month')}>месяц</button>
        <button class="sc" class:on={scrubScale === 'year'} onclick={() => onscale?.('year')}>год</button>
      </div>
      <div class="scalecap">крути колесо пальцем — {SCRUB_CAP[scrubScale]}</div>
      <!-- легенда цветов линий/кромок — «невзначай», одной тихой строкой -->
      <div class="legend">
        <span class="lg harm">гармония</span><span class="lg tense">напряжение</span><span class="lg neutral">нейтрально</span>
      </div>
    {/if}
  </div>

  <!-- ПАНЧАНГА — пять членов дня джйотиша. Карточка идёт сразу под квадратной
       картой (сестра блоку Луны, не вложена в карточку карты: стекло в стекле
       даёт двойную кромку). Это ведическая замена западному «содержанию дня». -->
  {#if vedic && panchanga}
    <!-- ТРАКТОВКА ДНЯ. Панчанга давала одни факты — «на главном экране ничего
         не написано» (владелица 2026-07-29). Теперь сверху главный текст дня
         (накшатра ведёт, вара и титхи уточняют, трудная йога добавляет
         оговорку), под ним — личный слой от Луны своей карты, и только потом
         сами пять членов, каждый со своей трактовкой по тапу. -->
    <h3 class="sec">Что сегодня</h3>
    <div class="daytext glass reveal" use:reveal>
      <p>{dayText}</p>
    </div>

    <h3 class="sec">Панчанга</h3>
    <div class="panch glass">
      {#each panRows as r (r.k)}
        <button class="prow tap" class:open={openPan === r.k}
          onclick={() => (openPan = openPan === r.k ? null : r.k)}>
          <span class="pk">{r.label}</span>
          <span class="pv">{r.value}</span>
          {#if r.text}<span class="parr">{openPan === r.k ? '▾' : '▸'}</span>{/if}
        </button>
        {#if openPan === r.k && r.text}
          <div class="plore">{r.text}</div>
        {/if}
      {/each}
    </div>

    <!-- Каламы и мухурты: благоприятные и трудные полосы светового дня
         (просьба астролога 12.08.2026, образец — Vedic times). Считаются от
         восхода и заката, поэтому привязаны к месту и подписаны им. -->
    {#if kalams.length}
      <h3 class="sec">Каламы и мухурты</h3>
      <div class="panch glass">
        {#each kalams as k (k.name)}
          <button class="prow tap kal {k.kind}" class:open={openKalam === k.name}
            class:now={isToday && kalamNow(k, snapshot)}
            onclick={() => (openKalam = openKalam === k.name ? null : k.name)}>
            <span class="pk kname">{k.name}<em>{k.kind === 'good' ? 'опора дня' : 'не для начинаний'}</em></span>
            <span class="pv">{hhmm(k.from)} — {hhmm(k.to)}{#if isToday && kalamNow(k, snapshot)}<em class="nowm">идёт сейчас</em>{/if}</span>
            <span class="parr">{openKalam === k.name ? '▾' : '▸'}</span>
          </button>
          {#if openKalam === k.name}
            <div class="plore">{KALAM_LORE[k.name] ?? ''}</div>
          {/if}
        {/each}
      </div>
      {#if auspicious.length > 1}
        <h3 class="sec">Благоприятность суток</h3>
        <div class="panch glass">
          <AuspiciousChart curve={auspicious} now={isToday ? snapshot : null} {tz} />
          {#if auspiciousNow}
            <div class="ausnow"><b>{auspiciousNow.score}%</b> сейчас</div>
            <ul class="auswhy">
              {#each auspiciousNow.reasons as r}<li>{r}</li>{/each}
              {#if !auspiciousNow.reasons.length}<li>ничего заметного — ровный отрезок</li>{/if}
            </ul>
          {/if}
          <div class="kalnote">Складываются полосы суток, йога панчанги{#if vedicMoon && !vedicMoon.unknownTime},
              тарабала и чандра-гочара от Луны рождения{:else} (личные слои включатся, когда
              у карты появится точное время рождения){/if}. Числовой шкалы классика не даёт —
            веса подобраны и ждут правки астролога, поэтому под графиком и написано,
            из чего он сложился.</div>
        </div>
      {/if}

      <div class="kalnote">Полосы отсчитываются от восхода и заката{#if vedicPlace}
          в месте карты — {vedicPlace.name}{/if}. Летом они шире, зимой уже:
        доли светового дня, а не часы по календарю.</div>
    {/if}
  {/if}

  {#if day.audit.length}
    <div class="audit glass">{#each day.audit as w}<div>{w}</div>{/each}</div>
  {/if}

  {#if moon}
    <div class="moon glass" data-tour="moon">
      <span class="g glyph">{moon.glyph}</span>
      <div>
        <div class="lbl">Луна <Hint k="position" /></div>
        <div class="pos">{fmtPosRx(moon.lon, moon.retro)}</div>
      </div>
      {#if phase}
        <div class="phase">
          <span class="pem">{phase.em}</span>
          <div><div class="lbl">Фаза <Hint k="moon-phase" /></div><div class="pname">{phase.name} · {phase.illum}%</div></div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- СОБЫТИЯ ДНЯ в джйотише идут ВЫШЕ грах (правка астролога 2026-07-29):
       сперва что сегодня меняется, потом где кто стоит. Западный экран не
       трогаем — там раздел остаётся ниже, на прежнем месте. -->
  {#if vedic && vedicEvents.length}
    <h3 class="sec" data-tour="events">События дня <Hint k="day-events" /></h3>
    <div class="events glass">
      {#each vedicEvents as ev (ev.at.getTime() + ev.title)}
        <div class="vev w{ev.weight}" class:passed={ev.at.getTime() <= snapshot.getTime()}>
          <div class="vevhead">
            <span class="evg glyph">{ev.glyph}</span>
            <span class="evt">{ev.title}</span>
            <span class="evtime">{fmtTime(ev.at, tz)}</span>
          </div>
          {#if ev.note}<div class="vevnote">{ev.note}</div>{/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- в джйотише планеты зовут грахами: слово идёт через весь ведический режим -->
  <h3 class="sec" data-tour="positions">{vedic ? 'Грахи сейчас' : 'Планеты сейчас'} <Hint k="planet" /></h3>
  {#if vedic}
    <!-- ПЛАШКИ: знак и градус, дом от лагны и затравка в несколько слов;
         тап — страница грахи с разбором (правка астролога 2026-07-29) -->
    <div class="cards">
      {#each grahaCards as g (g.name)}
        <button class="gcard glass reveal" class:retro={g.retro} use:reveal
          onclick={() => ongraha?.(g.name)}>
          <div class="gtop">
            <span class="g glyph">{g.glyph}</span>
            <span class="gname">{g.name}{#if g.retro}<span class="grx">℞</span>{/if}{#if g.fav}<span class="gfav">★</span>{/if}</span>
            <span class="gpos">{degMin(g.deg)} {g.sign}</span>
          </div>
          {#if g.house}
            <div class="ghouse">{g.house}-й дом — {BHAVA_THEME[g.house]}</div>
          {/if}
          {#if g.teaser}<div class="gteaser">{g.teaser}</div>{/if}
        </button>
      {/each}
    </div>
    {#if vedicLagna == null}
      <div class="vhint" style="text-align:left">Дома не показаны: выбери свою карту с местом
        рождения в настройках — тогда у каждой грахи появится дом от твоей лагны.</div>
    {/if}
  {:else}
  <div class="positions glass">
    {#each planets as p}
      <!-- каждая планета своей строкой С ИМЕНЕМ: «☉ Солнце — 2°09′ Рака»
           (просьба владелицы 2026-07-06; ℞ внутри строки позиции) -->
      <div class="chip reveal" class:retro={p.retro} use:reveal>
        <span class="g glyph">{p.glyph}</span>
        <span class="pn">{p.name}</span>
        <span class="pp">{fmtPosRx(p.lon, p.retro)}</span>
      </div>
    {/each}
  </div>
  {/if}

  {#if events.length && !vedic}
    <h3 class="sec" data-tour="events">События дня <Hint k="day-events" /></h3>
    <div class="events glass">
      {#each events as ev}
        <div class="ev k-{ev.kind}">
          <span class="evg glyph">{ev.glyph ?? '•'}</span>
          <span class="evt">{ev.text}</span>
          <span class="evtime">{fmtTime(ev.time, tz)}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if figures.length && !vedic}
    <!-- «по желанию» (просьба владелицы): раздел свёрнут, как разделы карт.
         В джйотише скрыт: фигуры строятся на орбисных аспектах — западное -->
    <details class="fold" data-tour="figures">
      <summary class="sec">Фигуры дня · {figures.length}<Hint k="figure" /><span class="arr">▸</span></summary>
      {#each figures as f (f.hit.key)}
        <FigureCard hit={f.hit} window={f.window} {tz}
          selected={selFigureKey === f.hit.key}
          onactivate={() => (selFigureKey = selFigureKey === f.hit.key ? null : f.hit.key)} />
      {/each}
    </details>
  {/if}

  <!-- Аспектные секции — ЗАПАДНАЯ школа (орбисы). В джйотише их нет: аспекты
       (дришти) считаются по целым знакам, а «содержание дня» даёт панчанга
       выше. Ответ на вопрос владелицы «почему в джйотиш западные аспекты?» -->
  {#each vedic ? [] : [section('Луна', day.moon), section('Быстрые', day.fast), section('Медленные', day.slow)] as s}
    {#if s.list.length}
      <h3 class="sec" data-tour={s.title === firstAspectSec ? 'aspects' : undefined}>{s.title}{#if s.title === firstAspectSec} <Hint k="aspect" />{/if}</h3>
      <!-- П.5: разовый разбор карточки аспекта «на пальцах» — над самой первой
           карточкой (первой НЕпустой секции). Как обучалка журнала: до «Понятно». -->
      {#if !seenCardHelp && s.title === firstAspectSec}
        <div class="cardhelp glass">
          <b>Как читать карточку ✧</b>
          <ul>
            <li><b>☽△♀</b> — кто с кем и какой аспект (например, Луна в трине к Венере).</li>
            <li><b>0.42°→</b> — текущий орбис (насколько точно сходятся) и куда идёт: <b>→</b> сближается, <b>←</b> расходится.</li>
            <li><b>времена внизу</b> — интервал аспекта: вход в орбис → точный момент → выход.</li>
          </ul>
          <button class="btn" onclick={dismissCardHelp}>Понятно ✓</button>
        </div>
      {/if}
      {#each s.list as rec (rec.p1 + rec.p2 + rec.aspect)}
        {@const sig = aspectSignature(rec.p1, rec.p2, rec.aspect)}
        <!-- тап: обводка обегает карточку → ПОТОМ открывается трактовка; выбранный
             блок ДЕРЖИТ рамку (ЕДИНОЕ правило выделения, как в «Картах») -->
        <GlowCard radius={18} selected={selectedSignature === sig} onactivate={() => onAspect?.(rec)}>
          <AspectCard {rec} {tz}
            discussions={discCounts.get(sig) ?? 0}
            selected={selectedSignature === sig} />
        </GlowCard>
      {/each}
    {/if}
  {/each}

  {#if !vedic && !day.moon.length && !day.fast.length && !day.slow.length}
    <div class="empty">☽ Небо сегодня тихое — ни одного мажорного аспекта в орбисе.<br />
      <span class="empty2">Такое бывает часто — это не поломка, приложение считает верно.<br />
        Полистай соседние дни ‹ › — там аспекты найдутся; или расширь орбис в Настройках.</span></div>
  {/if}
</div>

<style>
  .day { padding: 6px 2px 40px; }
  /* колесо — «герой» экрана: тонкая фиолетовая градиентная кромка, как у Луны */
  .wheel-wrap { padding: 14px; margin: 8px 0; position: relative; overflow: hidden; }
  .wheel-wrap::before { content: ""; position: absolute; inset: 0; border-radius: inherit;
    padding: 1px; pointer-events: none;
    background: linear-gradient(160deg, color-mix(in srgb, var(--neon-violet) 50%, transparent), transparent 45%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude; }
  /* подпись под квадратной картой: от чего считаются дома гочары */
  /* события дня (джйотиш): строка «откуда → куда» + дом в два слова.
     Медленные грахи и смены даш (w2) — ярче: это событие месяцев, не суток. */
  .vev { padding: 8px 0; }
  .vev + .vev { border-top: 1px solid var(--glass-brd); }
  .vev.passed { opacity: 0.62; }
  .vev.w0 .evt { color: var(--ink-dim); }
  .vev.w2 .evt { color: var(--gold); }
  .vevhead { display: flex; align-items: baseline; gap: 8px; font-size: 0.88rem; color: var(--ink); }
  .vevnote { color: var(--ink-faint); font-size: 0.78rem; line-height: 1.45; margin: 3px 0 0 1.9rem; }
  .vhint { text-align: center; color: var(--ink-faint); font-size: 0.74rem;
    line-height: 1.4; margin: 8px 10px 0; }
  /* «гочара + кундали» / «только гочара» — тем же сегментом, что масштаб прокрутки */
  .vpair { display: flex; justify-content: center; gap: 4px; margin-top: 8px; }
  .vp { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink-dim);
    border-radius: 999px; padding: 5px 12px; font-size: 0.74rem; }
  .vp.on { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 55%, var(--glass-brd));
    background: color-mix(in srgb, var(--accent) 14%, transparent); }
  /* легенда совмещённого чертежа — теми же цветами, что метки в клетках */
  .lgt { color: var(--neon-cyan); }
  .lgn { color: var(--ink-dim); }
  .snaptime { display: flex; align-items: center; justify-content: center; gap: 8px;
    text-align: center; color: var(--ink-faint); font-size: 0.72rem; margin-top: 6px; font-variant-numeric: tabular-nums; font-family: var(--font-mono); }
  .resetnow { background: #ffffff12; border: 1px solid var(--glass-brd); color: var(--accent);
    border-radius: 999px; padding: 2px 10px; font-size: 0.72rem; font-family: var(--font-mono); }
  .scrubday { color: var(--accent); font-weight: 600; }
  /* сегмент масштаба прокрутки — как в «Картах» (TransitControls .scale/.sc) */
  .scale { display: flex; justify-content: center; gap: 4px; margin-top: 6px; }
  .sc { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink-dim);
    border-radius: 999px; padding: 5px 12px; font-size: 0.74rem; }
  .sc.on { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 55%, var(--glass-brd));
    background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .scalecap { text-align: center; color: var(--ink-faint); font-size: 0.7rem; margin-top: 4px; }
  /* тихая легенда цветов: чёрточка цвета линии + слово, не отвлекает */
  .legend { display: flex; justify-content: center; gap: 14px; margin-top: 4px;
    color: var(--ink-faint); font-size: 0.68rem; }
  .lg::before { content: ''; display: inline-block; width: 14px; height: 2px;
    border-radius: 2px; vertical-align: middle; margin-right: 5px; }
  .lg.harm::before { background: var(--gold); }
  .lg.tense::before { background: var(--rose); }
  .lg.neutral::before { background: var(--silver); }
  .audit { padding: 10px 12px; margin: 8px 0; color: var(--rose); font-size: 0.85rem; }
  /* приветствие — «магия»: градиентный текст (серебро → фиолет), статично */
  .greet { text-align: center; font-size: 0.82rem; margin: 10px 0 2px; letter-spacing: 0.4px;
    background: linear-gradient(100deg, var(--silver), var(--neon-violet));
    -webkit-background-clip: text; background-clip: text; color: transparent; }
  /* ── Блок Луны: серебристый «герой» ленты ──────────────────────────
     Единая иерархия: лейблы одинаковые (.lbl), значения одинаковые
     (.pos = .pname). «Магию» несут свечение глифа и градиентная кромка,
     а не разнобой цветов. Всё на переменных → работает и в «Рассвете». */
  .moon { position: relative; overflow: hidden;
    display: flex; align-items: center; gap: 14px; padding: 14px 16px; margin: 8px 0; }
  /* тонкая серебристая градиентная кромка — «лунный свет по краю» (1px, статично) */
  .moon::before { content: ""; position: absolute; inset: 0; border-radius: inherit;
    padding: 1px; pointer-events: none;
    background: linear-gradient(135deg, color-mix(in srgb, var(--silver) 55%, transparent), transparent 42%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor; mask-composite: exclude; }
  /* глиф ☽ — серебро + мягкое свечение (один text-shadow, GPU не грузит) */
  .moon .g { font-size: 2rem; line-height: 1; color: var(--silver);
    text-shadow: 0 0 14px color-mix(in srgb, var(--silver) 55%, transparent); }
  /* ЛЕЙБЛЫ — единый микро-капс (Луна ≡ Фаза), тот же токен, что .sec */
  .moon .lbl { color: var(--ink-faint); font-size: 0.66rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: 1.1px; margin-bottom: 2px; }
  /* ЗНАЧЕНИЯ — единый стиль (позиция ≡ фаза): один цвет, один размер.
     Кириллица («Водолея») — body-шрифтом, mono-цифры ровняет tabular-nums */
  .moon .pos, .pname { color: var(--ink); font-size: 0.98rem; font-weight: 500;
    line-height: 1.2; font-variant-numeric: tabular-nums; }
  /* правый кластер зеркалит левый: диск + (лейбл/значение) */
  .phase { display: flex; align-items: center; gap: 10px; margin-left: auto; }
  /* фаза-эмодзи → серебряный диск: grayscale убирает «жёлтый», сохраняя форму
     серпа; гало в тон Луны. Без растровой генерации. */
  .pem { font-size: 1.35rem; line-height: 1; opacity: 0.9;
    filter: grayscale(1) brightness(1.35) contrast(0.95)
      drop-shadow(0 0 6px color-mix(in srgb, var(--silver) 45%, transparent)); }
  /* ── Трактовка дня (джйотиш): главный текст + личный слой ─────────────── */
  .daytext { padding: 14px 16px; margin: 8px 0; }
  .daytext p { margin: 0; font-size: 0.92rem; line-height: 1.6; color: var(--ink); }
  /* ── Панчанга: список «член дня → значение», как «Планеты сейчас» ──────── */
  .panch { display: flex; flex-direction: column; gap: 7px; padding: 12px 14px; margin: 8px 0; }
  .prow { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  /* строка-кнопка: тап раскрывает трактовку члена дня */
  .prow.tap { width: 100%; background: transparent; border: none; padding: 0; text-align: left; }
  .prow.tap.open .pk { color: var(--ink-dim); }
  .parr { flex: none; color: var(--ink-faint); font-size: 0.7rem; margin-left: 6px; }
  .plore { color: var(--ink-dim); font-size: 0.84rem; line-height: 1.55;
    margin: -2px 0 4px; padding-left: 2px; }
  .pk { flex: none; color: var(--ink-faint); font-size: 0.8rem; }
  /* Каламы: благоприятность подписана СЛОВОМ, а не цветом — светофор плашек в
     проекте не используем, серьёзность доносит текст. Золотом отмечена только
     полоса, которая идёт прямо сейчас: это «где я», а не оценка. */
  .kname { display: flex; flex-direction: column; gap: 2px; }
  .kname em { font-style: normal; font-size: 0.68rem; color: var(--ink-faint); opacity: 0.75; }
  .nowm { display: block; font-style: normal; font-size: 0.68rem; color: var(--gold); }
  .prow.kal.now .pk { color: var(--ink-dim); }
  .kalnote { color: var(--ink-faint); font-size: 0.74rem; line-height: 1.45; margin: 2px 4px 0; }
  .ausnow { font-size: 0.86rem; color: var(--ink); margin-top: 2px; }
  .ausnow b { color: var(--gold); font-size: 1.05rem; }
  .auswhy { margin: 4px 0 6px; padding-left: 18px; color: var(--ink-dim);
    font-size: 0.78rem; line-height: 1.5; }
  /* значение прижато вправо и переносится (титхи — длинная строка) */
  .pv { margin-left: auto; text-align: right; color: var(--ink); font-size: 0.9rem;
    line-height: 1.35; min-width: 0; }
  /* переходы — тише основного списка, отделены затухающим hairline */
  .pnext { margin-top: 3px; padding-top: 9px; position: relative;
    color: var(--ink-dim); font-size: 0.78rem; line-height: 1.6;
    font-variant-numeric: tabular-nums; }
  .pnext::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px;
    background: linear-gradient(90deg, transparent, var(--glass-brd), transparent); }
  /* плашки грах (джйотиш): карточка на граху с домом и затравкой */
  .cards { display: flex; flex-direction: column; gap: 8px; margin: 8px 0; }
  .gcard { display: block; width: 100%; text-align: left; padding: 11px 14px;
    border-radius: 16px; border: 1px solid var(--glass-brd); }
  .gtop { display: flex; align-items: baseline; gap: 8px; }
  .gcard .g { font-size: 1.15rem; color: var(--silver); flex: none; }
  .gname { font-size: 0.95rem; color: var(--ink); }
  .grx { color: var(--gold); font-size: 0.78rem; margin-left: 4px; }
  .gfav { color: var(--gold); font-size: 0.76rem; margin-left: 5px; }
  .gpos { margin-left: auto; font-size: 0.88rem; color: var(--ink-dim);
    font-variant-numeric: tabular-nums; }
  .gcard.retro .gpos { color: var(--gold); }
  .ghouse { color: var(--ink-faint); font-size: 0.76rem; margin: 5px 0 0 1.9rem; }
  .gteaser { color: var(--ink-dim); font-size: 0.84rem; line-height: 1.45;
    margin: 3px 0 0 1.9rem; }
  /* один пункт = одна строка (перенос каждому пункту — просьба владелицы) */
  .positions { display: flex; flex-direction: column; gap: 7px; padding: 12px 14px; margin: 8px 0; }
  .chip { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .chip .g { font-size: 1.2rem; width: 1.4rem; text-align: center; color: var(--silver); flex: none; }
  .chip.retro .pp { color: var(--gold); }
  .pn { flex: none; font-size: 0.92rem; color: var(--ink); }
  .pp { font-variant-numeric: tabular-nums; font-size: 0.92rem; white-space: nowrap;
    margin-left: auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
    color: var(--ink-dim); }
  .sec { margin: 16px 4px 4px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); }
  /* «Фигуры дня» — свёрнутый раздел (по желанию): summary заменяет .sec */
  details.fold summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 6px; }
  details.fold summary::-webkit-details-marker { display: none; }
  details.fold summary .arr { transition: transform 0.2s ease; }
  details.fold[open] summary .arr { transform: rotate(90deg); }
  .events { padding: 6px 12px; margin: 8px 0; }
  /* затухающий hairline-разделитель — тоньше и «дороже» сплошной линии */
  .ev { display: flex; align-items: center; gap: 10px; padding: 9px 2px; position: relative; }
  .ev:not(:last-child)::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 1px;
    background: linear-gradient(90deg, transparent, var(--glass-brd), transparent); }
  .evg { width: 1.4rem; text-align: center; font-size: 1.1rem; color: var(--silver); }
  .evt { flex: 1; font-size: 0.9rem; }
  .evtime { font-variant-numeric: tabular-nums; font-family: var(--font-mono); color: var(--ink-faint); font-size: 0.85rem; }
  .k-eclipse { color: var(--gold); }
  .k-eclipse .evg { color: var(--gold); }
  .k-station .evg { color: var(--rose); }
  .k-lunation .evg { color: var(--silver); }
  .empty { text-align: center; color: var(--ink-dim); padding: 30px 0; line-height: 1.6; }
  .empty2 { color: var(--ink-faint); font-size: 0.86rem; }

  /* ── П.5: обучалка-разбор первой карточки аспекта (как .help журнала) ── */
  .cardhelp { padding: 12px 14px; margin: 4px 4px 10px; font-size: 0.88rem; color: var(--ink-dim); }
  .cardhelp b { color: var(--ink); }
  .cardhelp ul { margin: 8px 0 10px; padding-left: 18px; display: flex; flex-direction: column; gap: 5px; }
  .cardhelp .btn { background: #ffffff14; border: 1px solid var(--glass-brd); color: var(--ink);
    border-radius: 12px; padding: 7px 14px; font-size: 0.84rem; }

  /* ── П.2: разовая мягкая пульсация «?» при первом визите экрана дня ──────
     Обычный CSS animation → экономия глушит его общим правилом app.css
     (:root[data-saver] animation-iteration-count:1 → одна вспышка, не бесконечно). */
  .glow-hints :global(.hint-q) {
    animation: hint-pulse 1.4s ease-in-out 2;
    border-color: color-mix(in srgb, var(--accent) 60%, var(--glass-brd));
    color: var(--accent);
  }
  @keyframes hint-pulse {
    0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 0%, transparent); }
    50% { box-shadow: 0 0 8px 2px color-mix(in srgb, var(--accent) 55%, transparent); }
  }
</style>
