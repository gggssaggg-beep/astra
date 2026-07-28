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
  import { SHORT } from '../lib/vedicChart.ts';
  import { signIndexOf, VEDIC_ORDER_SET } from '../lib/vedic.ts';
  import { panchangaOf, nextNakshatraEnd, nextTithiEnd } from '../lib/panchanga.ts';
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
        vedic = false, vedicLagna = null,
        orbOf, tz, objects = null, signStyle = 'gold', nodalAxisFigures = false,
        selectedSignature = null, selectedInfo = null,
        onAspect, oninfo, onscrub, onresetnow, onscale }:
    { engine: Engine; date: Date; snapshot: Date; scrubbed?: boolean;
      scrubScale?: 'day' | 'month' | 'year';
      vedic?: boolean;
      /** знак лагны «моей карты» (0..11) — от него нумеруются дома гочары;
       *  null = своей карты нет, показываем просто знаки */
      vedicLagna?: number | null;
      orbOf: (name: string) => number; tz: string;
      objects?: string[] | null; signStyle?: SignStyle; nodalAxisFigures?: boolean;
      selectedSignature?: string | null; selectedInfo?: WheelInfo | null;
      onAspect?: (r: AspectRecord) => void; oninfo?: (info: WheelInfo) => void;
      onscrub?: (deltaMs: number) => void; onresetnow?: () => void;
      onscale?: (s: 'day' | 'month' | 'year') => void } = $props();

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
  const skyCells = $derived.by(() => {
    const lagna = vedicLagna ?? 0;
    return Array.from({ length: 12 }, (_, i) => {
      const si = (lagna + i) % 12;
      return {
        house: i + 1,
        signIndex: si,
        planets: positions
          .filter((p) => VEDIC_ORDER_SET.has(p.name) && signIndexOf(p.lon) === si)
          .map((p) => ({
            short: SHORT[p.name] ?? p.name.slice(0, 2),
            deg: Math.floor(p.degInSign), retro: p.retro,
          })),
      };
    });
  });
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

  // Моменты переходов ищутся двоичным поиском (десятки обращений к движку), а
  // `snapshot` тикает раз в минуту — считаем от момента, огрублённого до 10 мин,
  // иначе поиск гонялся бы на каждый тик часов. Отставание невидимо: строка
  // «перейдёт в HH:MM» не меняется, пока переход не случится.
  const coarseMs = $derived(Math.floor(snapshot.getTime() / 600_000) * 600_000);
  const vedicNext = $derived.by(() => {
    if (!vedic) return null;
    const at = new Date(coarseMs);
    try {
      return { nak: nextNakshatraEnd(engine, at), tithi: nextTithiEnd(engine, at) };
    } catch { return null; }   // сбой движка не должен уронить экран дня
  });

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
      <VedicChart cells={skyCells} />
      <div class="vhint">{vedicFrom}</div>
    {:else}
      <Wheel {positions} aspects={wheelAspects} {signStyle} {selectedSignature} {selectedInfo} {figureSigs}
        {oninfo} {onscrub} />
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
    <h3 class="sec">Панчанга</h3>
    <div class="panch glass">
      <div class="prow">
        <span class="pk">Вара</span>
        <span class="pv">{panchanga.vara.name} · {panchanga.vara.lord}</span>
      </div>
      <div class="prow">
        <span class="pk">Титхи</span>
        <span class="pv">{panchanga.tithi.index} · {panchanga.tithi.name} · {panchanga.tithi.paksha}
          · прошло {Math.round(panchanga.tithi.fraction * 100)}%</span>
      </div>
      <div class="prow">
        <span class="pk">Накшатра Луны</span>
        <span class="pv">{panchanga.nakshatra.name} · пада {panchanga.nakshatra.pada}
          · упр. {panchanga.nakshatra.lord}</span>
      </div>
      <div class="prow">
        <span class="pk">Йога</span>
        <span class="pv">{panchanga.yoga.index} · {panchanga.yoga.name}</span>
      </div>
      <div class="prow">
        <span class="pk">Карана</span>
        <span class="pv">{panchanga.karana.name}</span>
      </div>
      {#if vedicNext}
        <!-- титхи и накшатра меняются посреди суток — без времени перехода
             строка «сегодня Двадаши» вводит в заблуждение -->
        <!-- переход часто ЗАВТРАШНИЙ (накшатра длится ~сутки): без пометки дня
             «в 13:07» при «сейчас 21:19» читается как прошедшее время -->
        <div class="pnext">
          <div>Луна перейдёт в {vedicNext.nak.next}
            {sameDay(vedicNext.nak.at, snapshot, tz) ? '' : 'завтра '}в {fmtTime(vedicNext.nak.at, tz)}</div>
          <div>Титхи сменится {sameDay(vedicNext.tithi.at, snapshot, tz) ? '' : 'завтра '}в {fmtTime(vedicNext.tithi.at, tz)}</div>
        </div>
      {/if}
    </div>
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

  <h3 class="sec" data-tour="positions">Планеты сейчас <Hint k="planet" /></h3>
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

  {#if events.length}
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

  {#if figures.length}
    <!-- «по желанию» (просьба владелицы): раздел свёрнут, как разделы карт -->
    <details class="fold" data-tour="figures">
      <summary class="sec">Фигуры дня · {figures.length}<Hint k="figure" /><span class="arr">▸</span></summary>
      {#each figures as f (f.hit.key)}
        <FigureCard hit={f.hit} window={f.window} {tz}
          selected={selFigureKey === f.hit.key}
          onactivate={() => (selFigureKey = selFigureKey === f.hit.key ? null : f.hit.key)} />
      {/each}
    </details>
  {/if}

  {#each [section('Луна', day.moon), section('Быстрые', day.fast), section('Медленные', day.slow)] as s}
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

  {#if !day.moon.length && !day.fast.length && !day.slow.length}
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
  .vhint { text-align: center; color: var(--ink-faint); font-size: 0.74rem;
    line-height: 1.4; margin: 8px 10px 0; }
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
  /* ── Панчанга: список «член дня → значение», как «Планеты сейчас» ──────── */
  .panch { display: flex; flex-direction: column; gap: 7px; padding: 12px 14px; margin: 8px 0; }
  .prow { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  .pk { flex: none; color: var(--ink-faint); font-size: 0.8rem; }
  /* значение прижато вправо и переносится (титхи — длинная строка) */
  .pv { margin-left: auto; text-align: right; color: var(--ink); font-size: 0.9rem;
    line-height: 1.35; min-width: 0; }
  /* переходы — тише основного списка, отделены затухающим hairline */
  .pnext { margin-top: 3px; padding-top: 9px; position: relative;
    color: var(--ink-dim); font-size: 0.78rem; line-height: 1.6;
    font-variant-numeric: tabular-nums; }
  .pnext::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1px;
    background: linear-gradient(90deg, transparent, var(--glass-brd), transparent); }
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
