/**
 * Напоминания — порт принципа MENS/FemCycle.
 * Один канал «care» (importance DEFAULT=3), без кастомной иконки,
 * журнал шагов вместо тихих catch.
 */
import { Capacitor } from '@capacitor/core';
import type { Engine } from '../engine/index.ts';
import { aspectsOn, PLANET_GLYPH } from '../engine/index.ts';
import { zonedDayStartUTC, todayCivil } from './format.ts';
import type { Settings } from './models.ts';
import { orbResolver } from './models.ts';

const NATIVE = Capacitor.isNativePlatform();
const CH = 'care';
const ID_DAILY = 1000;
const ID_ASPECT_FROM = 1001;
const ID_ASPECT_TO = 1099;
const ID_TEST_NOW = 9001;
const ID_TEST_DELAYED = 9002;

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

async function LN() {
  return (await import('@capacitor/local-notifications')).LocalNotifications;
}

let _initDone = false;
async function ensureInit(): Promise<void> {
  if (_initDone) return;
  try {
    const ln = await withTimeout(LN(), 8000, 'Загрузка плагина');
    push('плагин загружен ✓');
    if (NATIVE) {
      await withTimeout(
        ln.createChannel({ id: CH, name: 'Напоминания', importance: 3, vibration: true }),
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
    const c = await withTimeout((await LN()).checkPermissions(), 6000, 'checkPermissions');
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
    const ln = await LN();
    push('requestPermission: проверяю текущее состояние');
    const cur = await withTimeout(ln.checkPermissions(), 6000, 'checkPermissions');
    push(`разрешение сейчас: ${cur.display}`);
    if (cur.display === 'granted') {
      push('уже granted — системный диалог не зову');
      return 'granted';
    }
    push('зову системный диалог...');
    const r = await withTimeout(ln.requestPermissions(), 30000, 'requestPermissions');
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
    const ln = await LN();

    try {
      const pd = await withTimeout(ln.getPending(), 8000, 'getPending');
      const ours = pd.notifications
        .filter(n => n.id >= ID_DAILY && n.id <= ID_ASPECT_TO)
        .map(n => ({ id: n.id }));
      if (ours.length) {
        await withTimeout(ln.cancel({ notifications: ours }), 6000, 'cancel');
        push(`отменено ${ours.length} старых`);
      }
    } catch (e) { push('cancel warn: ' + (e instanceof Error ? e.message : String(e))); }

    const want = settings.notifyDaily || settings.notifyAspects;
    if (!want || stale()) { push('skip: ничего не включено'); return; }

    const ok = await granted();
    if (!ok) { push('skip: нет разрешения'); return; }
    if (stale()) return;

    const list: unknown[] = [];

    if (settings.notifyDaily) {
      const [hh, mm] = (settings.dailyNotifyTime || '09:00')
        .split(':').map(x => parseInt(x, 10));
      const dayStart = zonedDayStartUTC(todayCivil(tz), tz);
      const at = new Date(
        dayStart.getTime() +
        ((isNaN(hh) ? 9 : hh) * 60 + (isNaN(mm) ? 0 : mm)) * 60_000);
      list.push({
        id: ID_DAILY,
        title: 'Сводка неба',
        body: 'Откройте Astra — аспекты и события сегодняшнего дня.',
        channelId: CH,
        schedule: { on: { hour: at.getHours(), minute: at.getMinutes() }, allowWhileIdle: true },
      });
      push(`сводка → ${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')} (часы устройства)`);
    }

    if (settings.notifyAspects) {
      const orb = orbResolver(settings);
      const now = Date.now();
      let id = ID_ASPECT_FROM;
      const breathe = () => new Promise(r => setTimeout(r, 0));
      for (let d = 0; d < 10 && id <= ID_ASPECT_TO; d++) {
        await breathe();
        if (stale()) { push('reschedule: прерван более свежим вызовом'); return; }
        const civil = todayCivil(tz);
        civil.setUTCDate(civil.getUTCDate() + d);
        const dayStart = zonedDayStartUTC(civil, tz);
        const res = aspectsOn(engine, dayStart, orb, false);
        for (const a of [...res.fast, ...res.slow]) {
          if (id > ID_ASPECT_TO) break;
          if (!a.exactTime || a.exactTime.getTime() <= now + 60_000) continue;
          list.push({
            id: id++,
            title: `${PLANET_GLYPH[a.p1] ?? a.p1} ${a.symbol} ${PLANET_GLYPH[a.p2] ?? a.p2}`,
            body: `Точный аспект: ${a.p1} ${a.aspect} ${a.p2}`,
            channelId: CH,
            schedule: { at: a.exactTime, allowWhileIdle: true },
          });
        }
      }
      push(`аспектов запланировано: ${id - ID_ASPECT_FROM}`);
    }

    if (list.length && !stale()) {
      await withTimeout(
        (await LN()).schedule({ notifications: list as Parameters<typeof ln.schedule>[0]['notifications'] }),
        10000, 'schedule');
      push(`schedule(${list.length} шт) ✓`);
    }
  } catch (e) {
    push('ОШИБКА rescheduleAll: ' + (e instanceof Error ? e.message : String(e)));
  }
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
    const ln = await LN();
    const ok = await granted();
    push(`разрешение: ${ok ? 'granted' : 'НЕТ'}`);
    if (!ok) {
      return 'Разрешения нет. Включите: Настройки Android → Приложения → Astra → Уведомления.';
    }
    // Ступень 1: мгновенное БЕЗ расписания — мимо AlarmManager
    await withTimeout(ln.schedule({ notifications: [{
      id: ID_TEST_NOW,
      title: '🔔 Astra — сразу',
      body: 'Мгновенное уведомление (мимо будильника) — если нет, система блокирует.',
      channelId: CH,
    }] }), 8000, 'Мгновенное уведомление');
    push('мгновенное ✓');
    // Ступень 2: через 10 с через AlarmManager (+10 с как в FemCycle; +1.5 с было в прошлом)
    await withTimeout(ln.schedule({ notifications: [{
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
