/**
 * Уведомления (§3.4, §10.5, раунд 5 — реализовано нативно).
 * На УСТРОЙСТВЕ (Capacitor) — реальные локальные уведомления через
 * @capacitor/local-notifications: ОС поднимает их сама, фоновый процесс не нужен.
 *  • ежедневная сводка дня — повторяющееся, в выбранное время;
 *  • момент точного аспекта — одноразовые, на ближайшие ~10 дней (планета–планета).
 * В вебе — проверка/демо через Notification API (надёжного фонового расписания
 * браузер не даёт). Контракт функций один на обе платформы.
 */
import { Capacitor } from '@capacitor/core';
import type { Engine } from '../engine/index.ts';
import { aspectsOn, PLANET_GLYPH } from '../engine/index.ts';
import { zonedDayStartUTC, todayCivil } from './format.ts';
import type { Settings } from './models.ts';
import { orbResolver } from './models.ts';

const NATIVE = Capacitor.isNativePlatform();
const ID_DAILY = 1000;          // повторяющаяся сводка
const ID_ASPECT_FROM = 1001;    // одноразовые моменты аспектов
const ID_ASPECT_TO = 1099;      // наш управляемый диапазон 1000..1099
const ID_TEST = 9001;

// Каналы уведомлений (Android 8+): без явного канала нет ни звука, ни всплытия.
// daily — HIGH (звук + всплывашка), aspect — MAX (важный момент точного аспекта).
const CH_DAILY = 'astra-daily';
const CH_ASPECT = 'astra-aspect';

async function LN() {
  return (await import('@capacitor/local-notifications')).LocalNotifications;
}

/** Создать каналы (идемпотентно). Только натив; без канала звук/heads-up не работают. */
async function ensureChannels(): Promise<void> {
  if (!NATIVE) return;
  try {
    const ln = await LN();
    await ln.createChannel({
      id: CH_DAILY, name: 'Сводка неба',
      description: 'Ежедневная сводка аспектов и событий дня',
      importance: 4, visibility: 1, vibration: true, lights: true, lightColor: '#9b6bff',
    });
    await ln.createChannel({
      id: CH_ASPECT, name: 'Точные аспекты',
      description: 'Уведомление в момент точного аспекта планет',
      importance: 5, visibility: 1, vibration: true, lights: true, lightColor: '#4deaff',
    });
  } catch { /* старый плагин / не поддерживает каналы — тихо */ }
}

export const notifyAvailable = (): boolean =>
  NATIVE || typeof Notification !== 'undefined';

/** Запросить разрешение. Возвращает granted/denied/unsupported. */
export async function requestNotify(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (NATIVE) {
    try {
      const ln = await LN();
      const r = await ln.requestPermissions();
      return r.display === 'granted' ? 'granted' : 'denied';
    } catch { return 'unsupported'; }
  }
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  const p = await Notification.requestPermission();
  return p === 'granted' ? 'granted' : 'denied';
}

/** Хаптик — Capacitor WebView понимает navigator.vibrate (Android). */
export function buzz(ms = 60): void {
  try { navigator.vibrate?.(ms); } catch { /* нет вибро */ }
}

/** Тестовое уведомление сейчас (демо, что всё работает; §10.5). */
export async function testNotify(title: string, body: string): Promise<string> {
  buzz();
  const perm = await requestNotify();
  if (perm === 'unsupported') return 'Уведомления недоступны в этом окружении.';
  if (perm !== 'granted') return 'Разрешение на уведомления не выдано (откройте настройки приложения).';
  if (NATIVE) {
    try {
      const ln = await LN();
      await ensureChannels();
      await ln.schedule({ notifications: [{
        id: ID_TEST, title, body, channelId: CH_ASPECT, smallIcon: 'ic_stat_astra',
        schedule: { at: new Date(Date.now() + 1500), allowWhileIdle: true },
      }] });
      return 'Уведомление придёт через пару секунд ✓';
    } catch (e) {
      return 'Не удалось запланировать: ' + (e instanceof Error ? e.message : String(e));
    }
  }
  try { new Notification(title, { body }); return 'Уведомление отправлено ✓'; }
  catch { return 'Не удалось показать уведомление в этом браузере.'; }
}

/**
 * Пересобрать расписание уведомлений по текущим настройкам. На вебе — no-op
 * (надёжного фонового расписания нет). Вызывать при старте (после движка) и при
 * изменении настроек уведомлений/пояса/орбиса.
 */
export async function syncNotifications(engine: Engine, settings: Settings, tz: string): Promise<void> {
  if (!NATIVE) return;
  try {
    await scheduleAll(engine, settings, tz);
  } catch { /* плагина нет в этой сборке APK / нет разрешения — тихо */ }
}

async function scheduleAll(engine: Engine, settings: Settings, tz: string): Promise<void> {
  const ln = await LN();
  await ensureChannels();

  const want = settings.notifyDaily || settings.notifyAspects;
  if (want) {
    const perm = await ln.checkPermissions();
    if (perm.display !== 'granted') {
      const r = await ln.requestPermissions();
      if (r.display !== 'granted') return;
    }
  }

  // снять наши прежние (диапазон 1000..1099), чужие не трогаем
  try {
    const pending = await ln.getPending();
    const ours = pending.notifications
      .filter((n) => n.id >= ID_DAILY && n.id <= ID_ASPECT_TO)
      .map((n) => ({ id: n.id }));
    if (ours.length) await ln.cancel({ notifications: ours });
  } catch { /* нет ожидающих */ }

  if (!want) return;

  const list: any[] = [];

  if (settings.notifyDaily) {
    const [hh, mm] = (settings.dailyNotifyTime || '09:00').split(':').map((x) => parseInt(x, 10));
    list.push({
      id: ID_DAILY,
      title: 'Сводка неба',
      body: 'Откройте Astra — аспекты и события сегодняшнего дня.',
      channelId: CH_DAILY, smallIcon: 'ic_stat_astra',
      schedule: { on: { hour: isNaN(hh) ? 9 : hh, minute: isNaN(mm) ? 0 : mm }, allowWhileIdle: true },
    });
  }

  if (settings.notifyAspects) {
    const orb = orbResolver(settings);
    const now = Date.now();
    let id = ID_ASPECT_FROM;
    for (let d = 0; d < 10 && id <= ID_ASPECT_TO; d++) {
      const civil = todayCivil(tz);
      civil.setUTCDate(civil.getUTCDate() + d);
      const dayStart = zonedDayStartUTC(civil, tz);
      // только планета–планета (без Луны: слишком частые аспекты)
      const res = aspectsOn(engine, dayStart, orb, false);
      for (const a of [...res.fast, ...res.slow]) {
        if (id > ID_ASPECT_TO) break;
        if (!a.exactTime || a.exactTime.getTime() <= now + 60_000) continue;
        list.push({
          id: id++,
          title: `${PLANET_GLYPH[a.p1] ?? a.p1} ${a.symbol} ${PLANET_GLYPH[a.p2] ?? a.p2}`,
          body: `Точный аспект: ${a.p1} ${a.aspect} ${a.p2}`,
          channelId: CH_ASPECT, smallIcon: 'ic_stat_astra',
          schedule: { at: a.exactTime, allowWhileIdle: true },
        });
      }
    }
  }

  if (list.length) {
    try { await ln.schedule({ notifications: list }); } catch { /* тихо */ }
  }
}
