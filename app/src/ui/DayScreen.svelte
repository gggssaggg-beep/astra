<script lang="ts">
  // Кэш тяжёлых расчётов дня — в ОБЩЕМ модуле lib/dayCache.ts (живёт между
  // пересозданиями компонента на листание и делится с чатом).
  import { aspectsOnCached, eventsOnCached } from '../lib/dayCache.ts';
  import type { Engine, AspectRecord, BodyPosition } from '../engine/index.ts';
  import { fmtPos, fmtTime, zonedDayStartUTC, todayCivil } from '../lib/format.ts';
  import AspectCard from './AspectCard.svelte';
  import GlowCard from './GlowCard.svelte';
  import Wheel from './Wheel.svelte';
  import { reveal } from '../lib/reveal.ts';
  import { aspectSignature } from '../lib/signature.ts';
  import { discussionCounts } from '../lib/community.ts';

  import type { SignStyle } from '../lib/models.ts';
  import type { WheelInfo } from '../lib/lore.ts';
  let { engine, date, orbOf, tz, objects = null, signStyle = 'gold', selectedSignature = null, selectedInfo = null, onAspect, oninfo }:
    { engine: Engine; date: Date; orbOf: (name: string) => number; tz: string;
      objects?: string[] | null; signStyle?: SignStyle;
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
  const snapshot = $derived.by(() => {
    const todayStart = zonedDayStartUTC(todayCivil(tz), tz).getTime();
    const tod = Math.min(Math.max(nowMs - todayStart, 0), 86_400_000 - 1); // мс от местной полуночи
    return new Date(dayStart.getTime() + tod);
  });

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

  // вертикальный порядок в блоках уже задан движком (aspects.ts: быстрые сверху
  // по sunRank, Луна — по времени точного аспекта) — здесь не пересортировываем
  const section = (title: string, list: AspectRecord[]) => ({ title, list });
</script>

<div class="day">
  {#if greet}<div class="greet display">{greet}</div>{/if}
  <div class="wheel-wrap glass">
    <Wheel {positions} aspects={allAspects} {signStyle} {selectedSignature} {selectedInfo} {oninfo} />
    <!-- честно объясняем момент снимка: «то же время суток, что сейчас» — иначе
         выглядит как загадочные «мои 4 утра» (вопрос владелицы) -->
    <div class="snaptime">{isToday ? `сейчас · ${fmtTime(snapshot, tz)}`
      : `на ${fmtTime(snapshot, tz)} — тот же час, что сейчас`}</div>
    <!-- легенда цветов линий/кромок — «невзначай», одной тихой строкой -->
    <div class="legend">
      <span class="lg harm">гармония</span><span class="lg tense">напряжение</span><span class="lg neutral">нейтрально</span>
    </div>
  </div>

  {#if day.audit.length}
    <div class="audit glass">{#each day.audit as w}<div>{w}</div>{/each}</div>
  {/if}

  {#if moon}
    <div class="moon glass">
      <span class="g glyph">{moon.glyph}</span>
      <div>
        <div class="lbl">Луна</div>
        <div class="pos">{fmtPos(moon.lon)} {moon.retro ? '℞' : ''}</div>
      </div>
      {#if phase}
        <div class="phase">
          <span class="pem">{phase.em}</span>
          <div><div class="lbl">Фаза</div><div class="pname">{phase.name} · {phase.illum}%</div></div>
        </div>
      {/if}
    </div>
  {/if}

  <div class="positions glass">
    {#each planets as p}
      <div class="chip reveal" class:retro={p.retro} use:reveal>
        <span class="g glyph">{p.glyph}</span>
        <span class="pp">{fmtPos(p.lon)}</span>
        {#if p.retro}<span class="rx">℞</span>{/if}
      </div>
    {/each}
  </div>

  {#if events.length}
    <h3 class="sec">События дня</h3>
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

  {#each [section('Луна', day.moon), section('Быстрые', day.fast), section('Медленные', day.slow)] as s}
    {#if s.list.length}
      <h3 class="sec">{s.title}</h3>
      {#each s.list as rec (rec.p1 + rec.p2 + rec.aspect)}
        <!-- тап: обводка обегает карточку → ПОТОМ плавно открывается трактовка
             (единый паттерн GlowCard, просьба «сперва рамка, потом открытие») -->
        <GlowCard radius={18} onactivate={() => onAspect?.(rec)}>
          <AspectCard {rec} {tz}
            discussions={discCounts.get(aspectSignature(rec.p1, rec.p2, rec.aspect)) ?? 0}
            selected={!!selectedSignature && selectedSignature === aspectSignature(rec.p1, rec.p2, rec.aspect)} />
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
  .wheel-wrap { padding: 14px; margin: 8px 0; }
  .snaptime { text-align: center; color: var(--ink-faint); font-size: 0.72rem; margin-top: 6px; font-variant-numeric: tabular-nums; font-family: var(--font-mono); }
  /* тихая легенда цветов: чёрточка цвета линии + слово, не отвлекает */
  .legend { display: flex; justify-content: center; gap: 14px; margin-top: 4px;
    color: var(--ink-faint); font-size: 0.68rem; }
  .lg::before { content: ''; display: inline-block; width: 14px; height: 2px;
    border-radius: 2px; vertical-align: middle; margin-right: 5px; }
  .lg.harm::before { background: var(--gold); }
  .lg.tense::before { background: var(--rose); }
  .lg.neutral::before { background: var(--silver); }
  .audit { padding: 10px 12px; margin: 8px 0; color: var(--rose); font-size: 0.85rem; }
  .greet { text-align: center; color: var(--ink-faint); font-size: 0.82rem; margin: 10px 0 2px; letter-spacing: 0.4px; }
  .moon { display: flex; align-items: center; gap: 12px; padding: 12px 14px; margin: 8px 0; }
  .moon .g { font-size: 1.8rem; color: var(--silver); }
  .moon .lbl { color: var(--ink-faint); font-size: 0.75rem; letter-spacing: 0.5px; }
  /* кириллица («Водолея») — body-шрифтом, mono только выравнивает цифры:
     слово в кодерском JetBrains Mono было главным «некрасивым шрифтом» (жалоба) */
  .moon .pos { font-size: 1rem; font-variant-numeric: tabular-nums; }
  .phase { display: flex; align-items: center; gap: 10px; margin-left: auto; }
  .pem { font-size: 1.2rem; }
  .pname { font-size: 0.9rem; color: var(--ink-dim); font-variant-numeric: tabular-nums; }
  .positions { display: grid; grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(5, auto); grid-auto-flow: column; gap: 7px 16px; padding: 12px 14px; margin: 8px 0; }
  .chip { display: flex; align-items: center; gap: 8px; }
  .chip .g { font-size: 1.2rem; width: 1.4rem; text-align: center; color: var(--silver); }
  .chip.retro .pp { color: var(--gold); }
  .rx { color: var(--gold); font-size: 0.8rem; font-weight: 600; }
  .pp { font-variant-numeric: tabular-nums; font-size: 0.92rem; }
  .sec { margin: 16px 4px 4px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: var(--ink-faint); }
  .events { padding: 6px 12px; margin: 8px 0; }
  .ev { display: flex; align-items: center; gap: 10px; padding: 9px 2px; border-bottom: 1px solid var(--glass-brd); }
  .ev:last-child { border-bottom: none; }
  .evg { width: 1.4rem; text-align: center; font-size: 1.1rem; color: var(--silver); }
  .evt { flex: 1; font-size: 0.9rem; }
  .evtime { font-variant-numeric: tabular-nums; font-family: var(--font-mono); color: var(--ink-dim); font-size: 0.85rem; }
  .k-eclipse { color: var(--gold); }
  .k-eclipse .evg { color: var(--gold); }
  .k-station .evg { color: var(--rose); }
  .k-lunation .evg { color: var(--silver); }
  .empty { text-align: center; color: var(--ink-dim); padding: 30px 0; line-height: 1.6; }
  .empty2 { color: var(--ink-faint); font-size: 0.86rem; }
</style>
