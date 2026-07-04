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
import type { Engine } from '../engine/index.ts';
import { aspectsOn, PLANET_GLYPH } from '../engine/index.ts';
import { zonedDayStartUTC, todayCivil, fmtTime } from './format.ts';
import type { Settings } from './models.ts';
import { orbResolver } from './models.ts';
import { aspectSignature } from './signature.ts';

const NATIVE = Capacitor.isNativePlatform();
const CH = 'care';
const ID_DAILY_FROM = 1000;     // сводки: сегодня..+6 (одноразовые, свой текст на день)
const ID_ASPECT_FROM = 1010;    // моменты точных аспектов
const ID_ASPECT_TO = 1099;      // наш управляемый диапазон 1000..1099
const ID_TEST_NOW = 9001;
const ID_TEST_DELAYED = 9002;
const DAILY_DAYS = 7;           // на сколько дней вперёд ставим сводки
const SCAN_DAYS = 10;          // горизонт скана аспектов

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
        .filter(n => n.id >= ID_DAILY_FROM && n.id <= ID_ASPECT_TO)
        .map(n => ({ id: n.id }));
      if (ours.length) {
        await withTimeout(LocalNotifications.cancel({ notifications: ours }), 6000, 'cancel');
        push(`отменено ${ours.length} старых`);
      }
    } catch (e) { push('cancel warn: ' + (e instanceof Error ? e.message : String(e))); }

    const want = settings.notifyDaily || settings.notifyAspects;
    if (!want || stale()) { push('skip: ничего не включено'); return; }

    const ok = await granted();
    if (!ok) { push('skip: нет разрешения'); return; }
    if (stale()) return;

    const list: Parameters<typeof LocalNotifications.schedule>[0]['notifications'] = [];

    // Один проход по дням: аспекты дня считаем ОДИН раз и используем и для
    // ежедневной сводки (краткий дайджест «глиф-аспект-глиф ЧЧ:ММ»), и для
    // отдельных уведомлений в момент точного аспекта. Сводки — одноразовые на
    // каждый день (свой текст), а не одно повторяющееся с общей фразой.
    const orb = orbResolver(settings);
    const now = Date.now();
    const [dhh, dmm] = (settings.dailyNotifyTime || '09:00').split(':').map(x => parseInt(x, 10));
    const DH = isNaN(dhh) ? 9 : dhh, DM = isNaN(dmm) ? 0 : dmm;
    const breathe = () => new Promise(r => setTimeout(r, 0));
    let aid = ID_ASPECT_FROM, dailyCount = 0, aspectCount = 0;

    for (let d = 0; d < SCAN_DAYS; d++) {
      const needDaily = settings.notifyDaily && d < DAILY_DAYS;
      const needAspects = settings.notifyAspects && aid <= ID_ASPECT_TO;
      if (!needDaily && !needAspects) continue;
      await breathe();
      if (stale()) { push('reschedule: прерван более свежим вызовом'); return; }

      const civil = todayCivil(tz);
      civil.setUTCDate(civil.getUTCDate() + d);
      const dayStart = zonedDayStartUTC(civil, tz);
      const res = aspectsOn(engine, dayStart, orb, false);
      const dayAspects = [...res.fast, ...res.slow];

      // extra.dayAnchor/signature — чтобы тап по уведомлению открыл нужный день и
      // выделил аспект (App.svelte слушает localNotificationActionPerformed)
      const anchor = civil.toISOString();

      if (needDaily) {
        const at = new Date(dayStart.getTime() + (DH * 60 + DM) * 60_000);
        if (at.getTime() > now + 60_000) {
          const withTime = dayAspects
            .filter(a => a.exactTime)
            .sort((a, b) => (a.exactTime as Date).getTime() - (b.exactTime as Date).getTime());
          const items = withTime.slice(0, 6)
            .map(a => `${PLANET_GLYPH[a.p1] ?? a.p1}${a.symbol}${PLANET_GLYPH[a.p2] ?? a.p2} ${fmtTime(a.exactTime as Date, tz)}`);
          const firstSig = withTime.length
            ? aspectSignature(withTime[0].p1, withTime[0].p2, withTime[0].aspect) : null;
          list.push({
            id: ID_DAILY_FROM + d,
            title: 'Сводка неба',
            body: items.length ? items.join(' · ') : 'Особых аспектов нет — спокойный день.',
            channelId: CH,
            extra: { dayAnchor: anchor, signature: firstSig },
            schedule: { at, allowWhileIdle: true },
          });
          dailyCount++;
        }
      }

      if (needAspects) {
        for (const a of dayAspects) {
          if (aid > ID_ASPECT_TO) break;
          if (!a.exactTime || a.exactTime.getTime() <= now + 60_000) continue;
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
    if (settings.notifyDaily) push(`сводок запланировано: ${dailyCount}`);
    if (settings.notifyAspects) push(`аспектов запланировано: ${aspectCount}`);

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

/** Тап по уведомлению → колбэк с extra (день + сигнатура аспекта), чтобы App
 *  открыл нужный день и выделил аспект. Регистрировать один раз на старте. */
export function onNotificationTap(
  cb: (info: { dayAnchor?: string; signature?: string }) => void,
): void {
  if (!NATIVE) return;
  void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const ex = action.notification?.extra as { dayAnchor?: string; signature?: string } | undefined;
    if (ex && (ex.dayAnchor || ex.signature)) { push('тап по уведомлению'); cb(ex); }
  });
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
      return 'Разрешения нет. Включите: Настройки Android → Приложения → Astra → Уведомления.';
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
