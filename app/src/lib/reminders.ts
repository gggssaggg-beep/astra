/**
 * Напоминания — порт принципа MENS/FemCycle.
 * Один канал «care» (importance DEFAULT=3), без кастомной иконки,
 * журнал шагов вместо тихих catch.
 *
 * ВАЖНО: плагин импортируется СТАТИЧЕСКИ (как @capacitor/preferences), НЕ через
 * динамический import(). В офлайн-WebView (нет сети + service worker PWA) ленивый
 * чанк плагина не достаётся — `await import()` висел и отваливался по таймауту
 * («Загрузка плагина: нет ответа за 8 с»), из-за чего НИ разрешение, НИ показ
 * никогда не вызывались. Статический импорт кладёт регистрацию плагина в главный
 * бандл, который уже загружен, — грузить нечего.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Engine, BodyPosition, AspectRecord } from '../engine/index.ts';
import { aspectsOn, eventsOn, PLANET_GLYPH, signOf, stationsBetween } from '../engine/index.ts';
import { zonedDayStartUTC, todayCivil, fmtTime, civilOf } from './format.ts';
import type { Settings } from './models.ts';
import { orbResolver, notifySchoolOf, notifyZodiacOptions } from './models.ts';
import { aspectSignature } from './signature.ts';
import { inQuietHours, hmToMinutes, localMinutes } from './quiet.ts';
import { IDS, digestSlots, inSlot, digestTitle, pickDigest } from './digestSlots.ts';
import { db } from './db.ts';
import { natalPositions, birthInstantUTC } from './charts.ts';
import { forecastTransits } from './forecast.ts';
import { getEngine } from './engineStore.ts';
import { vedicDayEvents, vedicNotifyText, type VedicDayEvent } from './vedicEvents.ts';
import { vimshottari, type DashaPeriod } from './vedic.ts';

const NATIVE = Capacitor.isNativePlatform();
const CH = 'care';
// ID-диапазоны управляемых уведомлений вынесены в lib/digestSlots.ts (тестируемо)
const ID_DAILY_FROM = IDS.dailyFrom, ID_DAILY_TO = IDS.dailyTo;      // сводки-слоты
const ID_ASPECT_FROM = IDS.aspectFrom, ID_ASPECT_TO = IDS.aspectTo;  // точные аспекты
const ID_TRANSIT_FROM = IDS.transitFrom, ID_TRANSIT_TO = IDS.transitTo; // транзиты к наталу
const ID_MANAGED_TO = IDS.managedTo;     // наш управляемый диапазон 1000..1229
const ID_TEST_NOW = 9001;
const ID_TEST_DELAYED = 9002;
const ID_VERSION = 1250;        // «доступна новая версия» — вне диапазона отмены 1000..1229
const DAILY_DAYS = 7;           // на сколько дней вперёд ставим сводки
const SCAN_DAYS = 10;          // горизонт скана аспектов
const DASHA_DAYS = 365;        // горизонт смен периодов Вимшоттари (джйотиш)

// тихое время + разбор HH:MM — чистые функции в lib/quiet.ts (тестируемы в Node)
const inQuiet = (at: Date, tz: string, s: Settings): boolean =>
  inQuietHours(at, tz, { enabled: s.quietEnabled, from: s.quietFrom, to: s.quietTo });
const hm = hmToMinutes;

// — журнал шагов: каждый нативный вызов оставляет след —
const MAX_LOG = 30;
const _log: string[] = [];
function push(msg: string) {
  _log.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
  if (_log.length > MAX_LOG) _log.splice(0, _log.length - MAX_LOG);
}
export function reminderLog(): string[] { return [..._log]; }

const withTimeout = <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error(`${what}: нет ответа за ${Math.round(ms / 1000)} с`)), ms))]);

let _initDone = false;
async function ensureInit(): Promise<void> {
  if (_initDone) return;
  try {
    if (NATIVE) {
      await withTimeout(
        LocalNotifications.createChannel({ id: CH, name: 'Напоминания', importance: 3, vibration: true }),
        6000, 'Создание канала');
      push('канал создан ✓');
    }
    _initDone = true;
  } catch (e) {
    push('ОШИБКА init: ' + (e instanceof Error ? e.message : String(e)));
    throw e;
  }
}

export async function granted(): Promise<boolean> {
  if (!NATIVE) return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  try {
    const c = await withTimeout(LocalNotifications.checkPermissions(), 6000, 'checkPermissions');
    return c.display === 'granted';
  } catch (e) {
    push('granted() error: ' + (e instanceof Error ? e.message : String(e)));
    return false;
  }
}

export async function requestPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!NATIVE) {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    const p = await Notification.requestPermission();
    return p === 'granted' ? 'granted' : 'denied';
  }
  try {
    push('requestPermission: проверяю текущее состояние');
    const cur = await withTimeout(LocalNotifications.checkPermissions(), 6000, 'checkPermissions');
    push(`разрешение сейчас: ${cur.display}`);
    if (cur.display === 'granted') {
      push('уже granted — системный диалог не зову');
      return 'granted';
    }
    push('зову системный диалог...');
    const r = await withTimeout(LocalNotifications.requestPermissions(), 30000, 'requestPermissions');
    push(`результат: ${r.display}`);
    return r.display === 'granted' ? 'granted' : 'denied';
  } catch (e) {
    push('ОШИБКА requestPermission: ' + (e instanceof Error ? e.message : String(e)));
    return 'unsupported';
  }
}

/**
 * Движок ДЛЯ УВЕДОМЛЕНИЙ. Раньше сюда приходил движок экрана — и в ведическом
 * режиме сводка считалась по сидерике со СРЕДНИМИ узлами, а подписывалась
 * западными словами. Разница средних и истинных узлов доходит до ~1,7° при
 * орбисе 1° — Раху/Кету получали аспекты, которых в западной карте нет
 * («несуществующие аспекты», жалоба владелицы 2026-08-07).
 *
 * Теперь профиль берётся из НАСТРОЙКИ школы уведомлений. Если она совпала с
 * тем, что открыто на экране (обычный случай), переиспользуем готовый движок —
 * второй инстанс WASM (~12 МБ эфемерид) не поднимаем. Сравнения по зодиаку
 * достаточно: сидерический профиль в приложении один (аянамша и узлы берутся
 * из тех же настроек).
 */
async function engineForSchool(ui: Engine, settings: Settings): Promise<Engine> {
  const want = notifyZodiacOptions(settings);
  if (ui.zodiac === want.zodiac) return ui;
  return getEngine('swieph', want);
}

/** Лагна и даши «моей кундали» — нужны, чтобы назвать дом гочары и поймать
 *  смену периода. Лагна требует места рождения и ТОЧНОГО времени (она проходит
 *  знак за ~2 часа); даши считаются от одной Луны — им место не нужно. */
function myVedicChart(E: Engine, settings: Settings):
{ lagnaSign: number | null; dashas: DashaPeriod[] | null } {
  const me = settings.transitSelfId ? db.people.get(settings.transitSelfId) : null;
  if (!me) return { lagnaSign: null, dashas: null };
  const when = birthInstantUTC(me);
  let lagnaSign: number | null = null, dashas: DashaPeriod[] | null = null;
  try {
    if (me.place && !me.unknownTime && (me.place.lat !== 0 || me.place.lon !== 0)) {
      const h = E.houses(E.toJD(when), me.place.lat, me.place.lon, 'wholeSign');
      if (h) lagnaSign = Math.floor((((h.asc % 360) + 360) % 360) / 30);
    }
  } catch { /* без лагны просто не называем дома */ }
  try { dashas = vimshottari(E.lon(E.toJD(when), 'Луна'), when); }
  catch { /* без даш остаётся одно небо */ }
  return { lagnaSign, dashas };
}

let syncGen = 0;

export async function rescheduleAll(engine: Engine, settings: Settings, tz: string): Promise<void> {
  if (!NATIVE) return;
  const gen = ++syncGen;
  const stale = () => gen !== syncGen;
  push(`rescheduleAll #${gen} start`);
  try {
    await ensureInit();

    try {
      const pd = await withTimeout(LocalNotifications.getPending(), 8000, 'getPending');
      const ours = pd.notifications
        .filter(n => n.id >= ID_DAILY_FROM && n.id <= ID_MANAGED_TO)
        .map(n => ({ id: n.id }));
      if (ours.length) {
        await withTimeout(LocalNotifications.cancel({ notifications: ours }), 6000, 'cancel');
        push(`отменено ${ours.length} старых`);
      }
    } catch (e) { push('cancel warn: ' + (e instanceof Error ? e.message : String(e))); }

    const want = settings.notifyDaily || settings.notifyAspects || settings.notifyTransits;
    if (!want || stale()) { push('skip: ничего не включено'); return; }

    const ok = await granted();
    if (!ok) { push('skip: нет разрешения'); return; }
    if (stale()) return;

    const list: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = [];

    // ШКОЛА уведомлений — отдельная настройка (по умолчанию = режим приложения).
    // От неё зависит и ЧТО считаем, и КАКИМИ СЛОВАМИ пишем: западная школа —
    // аспекты по орбисам на тропическом круге с истинными узлами; джйотиш —
    // гочара/панчанга/даши на сидерическом круге со средними узлами.
    const school = notifySchoolOf(settings);
    const E = await engineForSchool(engine, settings);
    if (stale()) return;
    push(`школа: ${school === 'jyotish' ? 'джйотиш' : 'западная'} (${E.zodiac})`);

    const now = Date.now();
    const breathe = () => new Promise(r => setTimeout(r, 0));
    const twice = settings.dailyDigestMode === 'twice';
    const mMin = hm(settings.dailyNotifyTime, '09:00');
    const eMin = hm(settings.dailyNotifyTime2, '21:00');
    /** Слоты сводок: местные полуночи ближайших дней + время(на) из настроек. */
    const digestSlotTimes = (): Date[] => {
      const dayStartsMs: number[] = [];
      for (let d = 0; d < DAILY_DAYS; d++) {
        const civil = todayCivil(tz); civil.setUTCDate(civil.getUTCDate() + d);
        dayStartsMs.push(zonedDayStartUTC(civil, tz).getTime());   // DST-безопасно
      }
      return digestSlots(dayStartsMs, mMin, eMin, twice).map((ms) => new Date(ms));
    };

    if (school === 'jyotish') {
      await scheduleJyotish(E, settings, tz, list, { now, breathe, stale, twice,
        slots: digestSlotTimes });
    } else {
      await scheduleWest(E, settings, tz, list, { now, breathe, stale, twice,
        slots: digestSlotTimes });
    }

    if (list.length && !stale()) {
      await withTimeout(
        LocalNotifications.schedule({ notifications: list }),
        10000, 'schedule');
      push(`schedule(${list.length} шт) ✓`);
    }
  } catch (e) {
    push('ОШИБКА rescheduleAll: ' + (e instanceof Error ? e.message : String(e)));
  }
}

/** Общий контекст планирования (одно и то же для обеих школ). */
interface SchedCtx {
  now: number;
  breathe: () => Promise<unknown>;
  stale: () => boolean;
  twice: boolean;
  slots: () => Date[];
}
type NotifyList = Parameters<typeof LocalNotifications.schedule>[0]['notifications'];

/** ЗАПАДНАЯ школа: аспекты по орбисам + транзиты к натальной карте.
 *  Считает на ТРОПИЧЕСКОМ движке с истинными узлами — том самом, что рисует
 *  западный экран дня, — поэтому в уведомление не попадает ничего, чего нет в
 *  списке аспектов дня. */
async function scheduleWest(E: Engine, settings: Settings, tz: string,
  list: NotifyList, ctx: SchedCtx): Promise<void> {
  const { now, breathe, stale, twice, slots: slotTimes } = ctx;
  // Один проход по дням: аспекты дня считаем ОДИН раз и копим в общий список.
  // Из него собираем (1) точечные уведомления в момент аспекта (с учётом
  // «тихого времени») и (2) сводки-слоты: раз или дважды в сутки — каждая
  // сводка перечисляет аспекты ОТ своего момента ДО следующей сводки.
  const orb = orbResolver(settings);
  let aid = ID_ASPECT_FROM, aspectCount = 0, quietSkipped = 0;
  const allAspects: { rec: AspectRecord; anchor: string }[] = [];

  for (let d = 0; d < SCAN_DAYS; d++) {
    const needAspects = settings.notifyAspects && aid <= ID_ASPECT_TO;
    const needCollect = settings.notifyDaily && d <= DAILY_DAYS;   // +1 день — на вечернее окно
    if (!needAspects && !needCollect) continue;
    await breathe();
    if (stale()) { push('reschedule: прерван более свежим вызовом'); return; }

    const civil = todayCivil(tz);
    civil.setUTCDate(civil.getUTCDate() + d);
    const dayStart = zonedDayStartUTC(civil, tz);
    // settings.objects — ТЕ ЖЕ тумблеры объектов, что у экрана дня (dayCache).
    // Без них уведомления приходили про Уран/Нептун/узлы, выключенные в
    // настройках: аспект «которого нет» в списке дня (жалоба 2026-08-07).
    const res = aspectsOn(E, dayStart, orb, false, settings.objects);
    const dayAspects = [...res.fast, ...res.slow];
    const anchor = civil.toISOString();

    for (const a of dayAspects) {
      if (!a.exactTime) continue;
      if (needCollect) allAspects.push({ rec: a, anchor });
      // точечный пинг — только будущее и вне тихого времени
      if (needAspects && aid <= ID_ASPECT_TO && a.exactTime.getTime() > now + 60_000) {
        if (inQuiet(a.exactTime, tz, settings)) { quietSkipped++; continue; }
        list.push({
          id: aid++,
          title: `${PLANET_GLYPH[a.p1] ?? a.p1} ${a.symbol} ${PLANET_GLYPH[a.p2] ?? a.p2}`,
          body: `Точный аспект: ${a.p1} ${a.aspect} ${a.p2}`,
          channelId: CH,
          extra: { dayAnchor: anchor, signature: aspectSignature(a.p1, a.p2, a.aspect) },
          schedule: { at: a.exactTime, allowWhileIdle: true },
        });
        aspectCount++;
      }
    }
  }
  if (settings.notifyAspects) push(`аспектов запланировано: ${aspectCount} (тихих пропущено: ${quietSkipped})`);

  // Сводки-слоты. Раз в сутки: один слот на день (Tm). Дважды: утро (Tm) +
  // вечер (Te). Каждый слот показывает аспекты [слот → следующий слот) —
  // вечерняя сводка так забирает НОЧНЫЕ аспекты (просьба владелицы).
  if (settings.notifyDaily && !stale()) {
    const slots = slotTimes();
    const sorted = allAspects.slice().sort((x, y) =>
      (x.rec.exactTime as Date).getTime() - (y.rec.exactTime as Date).getTime());
    // ретро-станции (разворот планеты R↔D) как события сводки — не только
    // аспекты (жалоба: «Нептун → ретроград» не попадал в дайджест). Кладём в
    // слот, чей интервал накрывает станцию.
    const stationEvents: { at: Date; planet: string; toRetro: boolean }[] = [];
    {
      const from = new Date(now), to = new Date(now + DAILY_DAYS * 86_400_000);
      for (const p of settings.objects) {
        for (const st of stationsBetween(E, p, from, to)) {
          stationEvents.push({ at: st.at, planet: p, toRetro: st.toRetro });
        }
      }
    }
    let did = ID_DAILY_FROM, dailyCount = 0;
    for (let i = 0; i < slots.length && did <= ID_DAILY_TO; i++) {
      const at = slots[i];
      if (at.getTime() <= now + 60_000) continue;
      const nextAt = slots[i + 1]?.getTime();   // undefined у последнего → inSlot берёт +24ч
      const win = inSlot(sorted, (x) => (x.rec.exactTime as Date).getTime(), at.getTime(), nextAt);
      const stWin = inSlot(stationEvents, (s) => s.at.getTime(), at.getTime(), nextAt);
      const stItems = stWin.map((s) =>
        `${PLANET_GLYPH[s.planet] ?? s.planet} ${s.toRetro ? '℞ ретроград' : 'D директ'} ${fmtTime(s.at, tz)}`);
      // станции вперёд — они заметнее рядовых аспектов
      const items = [...stItems, ...win.slice(0, 6).map((x) =>
        `${PLANET_GLYPH[x.rec.p1] ?? x.rec.p1}${x.rec.symbol}${PLANET_GLYPH[x.rec.p2] ?? x.rec.p2} ${fmtTime(x.rec.exactTime as Date, tz)}`)];
      // на небе спокойно (ни аспектов, ни станций) — сводку НЕ шлём вовсе
      // (просьба владелицы 2026-07-25: без пустых «спокойный отрезок»-пингов)
      if (!items.length) continue;
      list.push({
        id: did++,
        title: digestTitle(twice, localMinutes(at, tz)),
        body: items.join(' · '),
        channelId: CH,
        extra: { dayAnchor: civilOf(at, tz).toISOString(), signature: win.length
          ? aspectSignature(win[0].rec.p1, win[0].rec.p2, win[0].rec.aspect) : null },
        schedule: { at, allowWhileIdle: true },
      });
      dailyCount++;
    }
    push(`сводок запланировано: ${dailyCount} (${twice ? 'дважды в сутки' : 'раз в сутки'})`);
  }

  // транзиты к натальной карте («моя карта») — планеты и/или куспиды домов
  if (settings.notifyTransits && !stale()) {
    const self = settings.transitSelfId ? db.people.get(settings.transitSelfId) : null;
    if (!self) {
      push('транзиты: не выбрана «моя карта»');
      return;
    }
    const targets: { owner: string; pos: BodyPosition[] }[] =
      [{ owner: self.name, pos: natalPositions(E, self, settings.objects) }];
    if (settings.transitCusps && self.place && !self.unknownTime
      && (self.place.lat !== 0 || self.place.lon !== 0)) {
      const h = E.houses(E.toJD(birthInstantUTC(self)),
        self.place.lat, self.place.lon, settings.houseSystem ?? 'horizontal');
      if (h) {
        targets.push({ owner: self.name, pos: h.cusps.map((lon, i) => {
          const s = signOf(lon);
          return { name: `Дом ${i + 1}`, glyph: `${i + 1}`, lon,
            sign: s.sign, signGlyph: s.glyph, degInSign: s.deg, speed: 0, retro: false };
        }) });
      }
    }
    const hits = await forecastTransits(E, targets, new Date(), 21, settings.objects, 40);
    let tid = ID_TRANSIT_FROM, tcount = 0;
    for (const hh of hits) {
      if (tid > ID_TRANSIT_TO) break;
      if (hh.when.getTime() <= now + 60_000) continue;
      if (inQuiet(hh.when, tz, settings)) continue;   // тихое время — без ночных пингов
      list.push({
        id: tid++,
        title: `${hh.tGlyph} ${hh.symbol} ${hh.nGlyph}`,
        body: `Транзит к ${hh.owner}: ${hh.tName} ${hh.aspect} ${hh.nName}`,
        channelId: CH,
        // тап по «моему» аспекту открывает МОЮ карту ТРАНЗИТ+НАТАЛ на этот
        // момент с выделенным аспектом (просьба владелицы 2026-07-25).
        // Куспиды (`Дом N`) в карте отдельной строкой не выделяются — тогда
        // просто открываем карту на момент.
        extra: {
          dayAnchor: civilOf(hh.when, tz).toISOString(),
          transitNatal: true,
          selfId: settings.transitSelfId,
          nName: hh.nName, tName: hh.tName, aspect: hh.aspect,
          at: hh.when.toISOString(),
        },
        schedule: { at: hh.when, allowWhileIdle: true },
      });
      tcount++;
    }
    push(`транзитов запланировано: ${tcount}`);
  }
}

/**
 * ДЖЙОТИШ: поводы дня по-ведически. Никаких аспектов и орбисов — в кундали их
 * нет (дришти считаются по целым знакам, экран дня в ведическом режиме списка
 * аспектов не рисует вовсе). Уведомление приносит то же, что видно на экране:
 * гочару (переход грахи в знак и дом), вакри/марги (разворот хода), грахану,
 * панчангу (накшатра/титхи/йога) и смены периодов Вимшоттари.
 */
async function scheduleJyotish(E: Engine, settings: Settings, tz: string,
  list: NotifyList, ctx: SchedCtx): Promise<void> {
  const { now, breathe, stale, twice, slots: slotTimes } = ctx;
  const my = myVedicChart(E, settings);
  const events: VedicDayEvent[] = [];

  if (settings.notifyDaily || settings.notifyAspects) {
    for (let d = 0; d < SCAN_DAYS; d++) {
      const needPoint = settings.notifyAspects;
      const needCollect = settings.notifyDaily && d <= DAILY_DAYS;  // +1 день — на вечернее окно
      if (!needPoint && !needCollect) continue;
      await breathe();
      if (stale()) { push('reschedule: прерван более свежим вызовом'); return; }
      const civil = todayCivil(tz);
      civil.setUTCDate(civil.getUTCDate() + d);
      const dayStart = zonedDayStartUTC(civil, tz);
      events.push(...vedicDayEvents(E, dayStart, {
        lagnaSign: my.lagnaSign, dashas: my.dashas, base: eventsOn(E, dayStart),
      }));
    }
    events.sort((x, y) => +x.at - +y.at);
  }

  // Точечные пинги — только весомые поводы (вес ≥ 1): переход грахи, разворот
  // хода, грахана, новолуние/полнолуние. Лунная мелочь (смена накшатры, титхи,
  // йоги — вес 0) идёт по несколько раз в сутки: ей место в сводке, а не в
  // пинге. Смены даш — у своего тумблера «моя кундали», здесь их не дублируем.
  if (settings.notifyAspects && !stale()) {
    let aid = ID_ASPECT_FROM, cnt = 0, quietSkipped = 0;
    for (const ev of events) {
      if (aid > ID_ASPECT_TO) break;
      if (ev.weight < 1 || ev.kind === 'dasha') continue;
      if (+ev.at <= now + 60_000) continue;
      if (inQuiet(ev.at, tz, settings)) { quietSkipped++; continue; }
      const t = vedicNotifyText(ev);
      list.push({
        id: aid++, title: t.title, body: t.body, channelId: CH,
        extra: { dayAnchor: civilOf(ev.at, tz).toISOString() },
        schedule: { at: ev.at, allowWhileIdle: true },
      });
      cnt++;
    }
    push(`ведических поводов запланировано: ${cnt} (тихих пропущено: ${quietSkipped})`);
  }

  // Сводка: те же слоты, что у западной школы; в строку идут события окна
  // [слот → следующий слот). Пустых сводок не шлём.
  if (settings.notifyDaily && !stale()) {
    const slots = slotTimes();
    let did = ID_DAILY_FROM, dailyCount = 0;
    for (let i = 0; i < slots.length && did <= ID_DAILY_TO; i++) {
      const at = slots[i];
      if (at.getTime() <= now + 60_000) continue;
      const nextAt = slots[i + 1]?.getTime();
      const win = pickDigest(inSlot(events, (e) => +e.at, at.getTime(), nextAt),
        (e) => e.weight, (e) => +e.at);
      if (!win.length) continue;
      list.push({
        id: did++,
        title: digestTitle(twice, localMinutes(at, tz)),
        body: win.map((e) => `${e.glyph} ${e.title} ${fmtTime(e.at, tz)}`).join(' · '),
        channelId: CH,
        extra: { dayAnchor: civilOf(at, tz).toISOString() },
        schedule: { at, allowWhileIdle: true },
      });
      dailyCount++;
    }
    push(`сводок запланировано: ${dailyCount} (${twice ? 'дважды в сутки' : 'раз в сутки'})`);
  }

  // «Моя кундали»: смены периодов Вимшоттари на год вперёд. Даша — событие
  // МЕСЯЦЕВ, а не минуты: пинг ставим на время утренней сводки того дня, когда
  // период начинается (иначе махадаша разбудила бы в 03:12 — и раз в годы).
  if (settings.notifyTransits && !stale()) {
    if (!my.dashas) { push('даши: не выбрана «моя кундали»'); return; }
    const mMin = hm(settings.dailyNotifyTime, '09:00');
    const horizon = now + DASHA_DAYS * 86_400_000;
    const changes: { at: Date; title: string; note: string; lord: string }[] = [];
    for (const m of my.dashas) {
      if (+m.from > now && +m.from < horizon) {
        changes.push({ at: m.from, lord: m.lord,
          title: `Махадаша: период ${m.lord}`, note: 'большой период жизни сменился' });
      }
      for (const a of m.sub ?? []) {
        if (+a.from > now && +a.from < horizon) {
          changes.push({ at: a.from, lord: a.lord,
            title: `Антардаша: ${m.lord} — ${a.lord}`, note: 'подпериод сменился' });
        }
      }
    }
    changes.sort((x, y) => +x.at - +y.at);
    let tid = ID_TRANSIT_FROM, cnt = 0;
    for (const c of changes) {
      if (tid > ID_TRANSIT_TO) break;
      const civil = civilOf(c.at, tz);
      const at = new Date(zonedDayStartUTC(civil, tz).getTime() + mMin * 60_000);
      if (at.getTime() <= now + 60_000) continue;
      list.push({
        id: tid++,
        title: `${PLANET_GLYPH[c.lord] ?? '✧'} ${c.title}`,
        body: `${c.note} — ${fmtTime(c.at, tz)}`,
        channelId: CH,
        extra: { dayAnchor: civil.toISOString() },
        schedule: { at, allowWhileIdle: true },
      });
      cnt++;
    }
    push(`смен даш запланировано: ${cnt}`);
  }
}

/** Что уведомление знает о своём аспекте (кладём в extra при планировании). */
export interface NotificationTarget {
  dayAnchor?: string;      // день на главной (ISO гражданской даты)
  signature?: string;      // сигнатура аспекта неба → выделить в списке дня
  // «мой» аспект: транзит к натальной карте → открыть карту ТРАНЗИТ+НАТАЛ
  transitNatal?: boolean;
  selfId?: string;         // чья карта (id человека из «моя карта» настроек)
  nName?: string;          // натальная точка (p1 в строках карты)
  tName?: string;          // транзитная планета (p2)
  aspect?: string;
  at?: string;             // ISO момента точного аспекта — на него мотаем транзит
}

/** Тап по уведомлению → колбэк с extra (день + сигнатура аспекта либо адрес
 *  карты транзит+натал), чтобы App открыл нужный экран и выделил аспект.
 *  Регистрировать один раз на старте. */
export function onNotificationTap(cb: (info: NotificationTarget) => void): void {
  if (!NATIVE) return;
  void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const ex = action.notification?.extra as NotificationTarget | undefined;
    if (ex && (ex.dayAnchor || ex.signature || ex.transitNatal)) { push('тап по уведомлению'); cb(ex); }
  });
}

/** Разовое уведомление «доступна новая версия» — после применения OTA-бандла
 *  (просьба владелицы 2026-07-07). Приходит на телефон, зовёт открыть приложение. */
export async function notifyNewVersion(version: string): Promise<void> {
  try {
    if (!NATIVE) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted')
        new Notification('Astra обновлена', { body: `Доступна новая версия (${version}).` });
      return;
    }
    await ensureInit();
    if (!(await granted())) { push('notifyNewVersion: нет разрешения'); return; }
    await withTimeout(LocalNotifications.schedule({ notifications: [{
      id: ID_VERSION,
      title: '🔄 Доступна новая версия Astra',
      body: `Приложение обновилось до ${version}. Открой — посмотри, что нового.`,
      channelId: CH,
    }] }), 8000, 'notifyNewVersion');
    push(`notifyNewVersion ${version} ✓`);
  } catch (e) { push('ОШИБКА notifyNewVersion: ' + (e instanceof Error ? e.message : String(e))); }
}

export async function sendTest(): Promise<string> {
  push('sendTest начат');
  if (!NATIVE) {
    if (typeof Notification === 'undefined') return 'Уведомления недоступны.';
    if (Notification.permission !== 'granted') return 'Нет разрешения (веб).';
    new Notification('Astra — тест', { body: 'Уведомления работают.' });
    push('sendTest (веб) ✓');
    return 'Отправлено (браузер).';
  }
  try {
    await ensureInit();
    const ok = await granted();
    push(`разрешение: ${ok ? 'granted' : 'НЕТ'}`);
    if (!ok) {
      return 'Разрешения нет. Включи: Настройки Android → Приложения → Astra → Уведомления.';
    }
    // Ступень 1: мгновенное БЕЗ расписания — мимо AlarmManager
    await withTimeout(LocalNotifications.schedule({ notifications: [{
      id: ID_TEST_NOW,
      title: '🔔 Astra — сразу',
      body: 'Мгновенное уведомление (мимо будильника) — если нет, система блокирует.',
      channelId: CH,
    }] }), 8000, 'Мгновенное уведомление');
    push('мгновенное ✓');
    // Ступень 2: через 10 с через AlarmManager (+10 с как в FemCycle; +1.5 с было в прошлом)
    await withTimeout(LocalNotifications.schedule({ notifications: [{
      id: ID_TEST_DELAYED,
      title: '🔔 Astra — через 10 с',
      body: 'Отложенное (будильник) — так придёт сводка дня. Сверните приложение.',
      channelId: CH,
      schedule: { at: new Date(Date.now() + 10_000), allowWhileIdle: true },
    }] }), 8000, 'Отложенное уведомление');
    push('отложенное на 10 с ✓');
    return 'Отправлено два:\n'
      + '• первое — уже в шторке уведомлений\n'
      + '• второе — через ~10 с (сверните приложение)\n'
      + 'Нет первого → система блокирует. Есть первое, нет второго → '
      + 'Xiaomi: Автозапуск + Батарея «Без ограничений».';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    push('ОШИБКА sendTest: ' + msg);
    return '⚠ ' + msg;
  }
}
