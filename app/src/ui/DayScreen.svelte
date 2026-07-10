<script lang="ts">
  // Кэш тяжёлых расчётов дня — в ОБЩЕМ модуле lib/dayCache.ts (живёт между
  // пересозданиями компонента на листание и делится с чатом).
  import { aspectsOnCached, eventsOnCached, figuresOnCached } from '../lib/dayCache.ts';
  import type { Engine, AspectRecord, BodyPosition } from '../engine/index.ts';
  import { staticAspects } from '../engine/index.ts';
  import { fmtPos, fmtPosRx, fmtTime, zonedDayStartUTC, todayCivil } from '../lib/format.ts';
  import AspectCard from './AspectCard.svelte';
  import FigureCard from './FigureCard.svelte';
  import GlowCard from './GlowCard.svelte';
  import Wheel from './Wheel.svelte';
  import Hint from './Hint.svelte';
  import { reveal } from '../lib/reveal.ts';
  import { aspectSignature } from '../lib/signature.ts';
  import { discussionCounts } from '../lib/community.ts';

  import type { SignStyle } from '../lib/models.ts';
  import type { WheelInfo } from '../lib/lore.ts';
  let { engine, date, orbOf, tz, objects = null, signStyle = 'gold', nodalAxisFigures = false, selectedSignature = null, selectedInfo = null, onAspect, oninfo }:
    { engine: Engine; date: Date; orbOf: (name: string) => number; tz: string;
      objects?: string[] | null; signStyle?: SignStyle; nodalAxisFigures?: boolean;
      selectedSignature?: string | null; selectedInfo?: WheelInfo | null;
      onAspect?: (r: AspectRecord) => void; oninfo?: (info: WheelInfo) => void } = $props();

  // Сутки (для аспектов/событий) — 00:00 ВЫБРАННОГО пояса. Снимок положений
  // (колесо, Луна, чипы планет) — на НАСТОЯЩИЙ момент: для сегодня = «сейчас»,
  // для другого дня = тот же час суток (требование астролога), а не 00:00.
  const dayStart = $derived(zonedDayStartUTC(date, tz));
  const isToday = $derived(date.getTime() === todayCivil(tz).getTime());

  let nowMs = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (nowMs = Date.now()), 60_000); // живое «сейчас», без перегруза
    return () => clearInterval(id);
  });
  // прокрутка колеса дня: тянешь по кругу — момент снимка едет (оборот = сутки),
  // как в «Картах». Смена дня сбрасывает прокрутку. rAF-дебаунс: pointermove
  // чаще кадров, а каждый тик тянет WASM positions() — копим дельту на кадр.
  let scrubOffset = $state(0);
  $effect(() => { void date; scrubOffset = 0; });
  let scrubPending = 0, scrubRaf = 0;
  function scrubWheel(deltaMs: number): void {
    scrubPending += deltaMs;
    if (scrubRaf) return;
    scrubRaf = requestAnimationFrame(() => { scrubOffset += scrubPending; scrubPending = 0; scrubRaf = 0; });
  }
  const scrubbed = $derived(scrubOffset !== 0);
  function resetScrub(): void { scrubOffset = 0; }
  const snapshot = $derived.by(() => {
    const todayStart = zonedDayStartUTC(todayCivil(tz), tz).getTime();
    const tod = Math.min(Math.max(nowMs - todayStart, 0), 86_400_000 - 1); // мс от местной полуночи
    return new Date(dayStart.getTime() + tod + scrubOffset);
  });
  // при прокрутке ЗА ПОЛНОЧЬ показываем и ДАТУ снимка, не только время — иначе
  // «кручу-кручу, а дата та же» (жалоба владелицы). Ярлык дня — в поясе tz.
  const dfKey = (d: Date) => new Intl.DateTimeFormat('en-CA',
    { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const dfDay = (d: Date) => new Intl.DateTimeFormat('ru-RU',
    { timeZone: tz, day: 'numeric', month: 'short' }).format(d);
  const scrubCrossesDay = $derived(scrubbed && dfKey(snapshot) !== dfKey(dayStart));

  const positions = $derived(engine.positions(snapshot, objects ?? undefined));
  const moon = $derived(positions.find((p) => p.name === 'Луна'));
  const sun = $derived(positions.find((p) => p.name === 'Солнце'));

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
  const planets = $derived(
    ORDER.map((n) => positions.find((p) => p.name === n)).filter((p): p is BodyPosition => !!p)
  );
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
</script>

<div class="day">
  {#if greet}<div class="greet display">{greet}</div>{/if}
  <div class="wheel-wrap glass" data-tour="wheel">
    <Wheel {positions} aspects={wheelAspects} {signStyle} {selectedSignature} {selectedInfo} {figureSigs}
      {oninfo} onscrub={scrubWheel} />
    <!-- честно объясняем момент снимка: «то же время суток, что сейчас» — иначе
         выглядит как загадочные «мои 4 утра» (вопрос владелицы). Прокрутка колеса
         двигает момент — тогда показываем прокрученное время и кнопку «сейчас». -->
    <div class="snaptime">
      {#if scrubbed}
        <button class="resetnow" onclick={resetScrub}>↺ сейчас</button>
        <span>прокрутка · {#if scrubCrossesDay}<b class="scrubday">{dfDay(snapshot)}</b>,&nbsp;{/if}{fmtTime(snapshot, tz)}</span>
      {:else}
        {isToday ? `сейчас · ${fmtTime(snapshot, tz)}` : `на ${fmtTime(snapshot, tz)} — тот же час, что сейчас`}
      {/if}
    </div>
    <!-- легенда цветов линий/кромок — «невзначай», одной тихой строкой -->
    <div class="legend">
      <span class="lg harm">гармония</span><span class="lg tense">напряжение</span><span class="lg neutral">нейтрально</span>
    </div>
  </div>

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
      <span class="empty2">Редкий день, чтобы просто выдохнуть.<br />
        Хочется больше — полистай соседние дни ‹ › или расширь орбис в Настройках.</span></div>
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
  .snaptime { display: flex; align-items: center; justify-content: center; gap: 8px;
    text-align: center; color: var(--ink-faint); font-size: 0.72rem; margin-top: 6px; font-variant-numeric: tabular-nums; font-family: var(--font-mono); }
  .resetnow { background: #ffffff12; border: 1px solid var(--glass-brd); color: var(--accent);
    border-radius: 999px; padding: 2px 10px; font-size: 0.72rem; font-family: var(--font-mono); }
  .scrubday { color: var(--accent); font-weight: 600; }
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
</style>
