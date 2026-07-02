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

// Таймаут на нативные вызовы: мост/плагин может «замолчать» (старый APK, баг
// системного диалога) — тогда кнопки висли «Отправляю…» вечно без объяснений.
const withTimeout = <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(
    () => rej(new Error(`${what}: система не ответила за ${Math.round(ms / 1000)} с`)), ms))]);

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

/** Запросить разрешение. Возвращает granted/denied/unsupported.
 *  Может бросить Error с понятным текстом (таймаут моста) — показывать юзеру. */
export async function requestNotify(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (NATIVE) {
    let ln: Awaited<ReturnType<typeof LN>>;
    try { ln = await withTimeout(LN(), 8000, 'Загрузка плагина уведомлений'); }
    catch { return 'unsupported'; }
    // если уже разрешено — НЕ дёргаем requestPermissions: на части устройств
    // повторный запрос при выданном разрешении не отвечает (висло «Отправляю…»)
    const cur = await withTimeout(ln.checkPermissions(), 6000, 'Проверка разрешения');
    if (cur.display === 'granted') return 'granted';
    const r = await withTimeout(ln.requestPermissions(), 30000, 'Запрос разрешения');
    return r.display === 'granted' ? 'granted' : 'denied';
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

/** Диагностика для настроек: почему уведомления могут не приходить.
 *  Возвращает null не на устройстве / без плагина (старый APK). */
export interface NotifyDiag {
  display: string;        // разрешение на показ: granted / denied / prompt
  exact: string | null;   // точные будильники (Android 12+): granted / denied / null=нет API
  pending: number;        // сколько наших уведомлений реально стоит в расписании ОС
}
export async function notifyDiagnostics(): Promise<NotifyDiag | null> {
  if (!NATIVE) return null;
  try {
    const ln = await LN();
    const p = await ln.checkPermissions();
    let exact: string | null = null;
    try { exact = (await ln.checkExactNotificationSetting()).exact_alarm; }
    catch { /* старый плагин или iOS — без точных будильников */ }
    let pending = 0;
    try {
      const pd = await ln.getPending();
      pending = pd.notifications.filter((n) => n.id >= ID_DAILY && n.id <= ID_ASPECT_TO).length;
    } catch { /* нет API */ }
    return { display: p.display, exact, pending };
  } catch { return null; }
}

/** Открыть системную настройку «точные будильники» (Android 12+). */
export async function requestExactAlarms(): Promise<void> {
  try { await (await LN()).changeExactNotificationSetting(); } catch { /* нет API */ }
}

/** Тестовое уведомление сейчас (демо, что всё работает; §10.5).
 *  Каждый шаг под таймаутом — при затыке вернёт, ГДЕ застряло, а не висит. */
export async function testNotify(title: string, body: string): Promise<string> {
  buzz();
  let perm: 'granted' | 'denied' | 'unsupported';
  try { perm = await requestNotify(); }
  catch (e) { return '⚠ ' + (e instanceof Error ? e.message : String(e)); }
  if (perm === 'unsupported') return 'Уведомления недоступны в этом окружении.';
  if (perm !== 'granted') return 'Разрешение на уведомления не выдано (откройте настройки приложения).';
  if (NATIVE) {
    try {
      const ln = await LN();
      await withTimeout(ensureChannels(), 6000, 'Создание канала');
      await withTimeout(ln.schedule({ notifications: [{
        id: ID_TEST, title, body, channelId: CH_ASPECT, smallIcon: 'ic_stat_astra',
        schedule: { at: new Date(Date.now() + 1500), allowWhileIdle: true },
      }] }), 8000, 'Постановка в расписание');
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
let syncGen = 0; // номер последнего запуска — устаревший проход не должен побеждать свежий

export async function syncNotifications(engine: Engine, settings: Settings, tz: string): Promise<void> {
  if (!NATIVE) return;
  try {
    await scheduleAll(engine, settings, tz, ++syncGen);
  } catch { /* плагина нет в этой сборке APK / нет разрешения — тихо */ }
}

// передышка главному потоку: скан аспектов на 10 дней — тяжёлые WASM-вызовы,
// без пауз UI замирал на старте и после каждого изменения настроек
const breathe = () => new Promise((r) => setTimeout(r, 0));

async function scheduleAll(engine: Engine, settings: Settings, tz: string, gen: number): Promise<void> {
  const stale = () => gen !== syncGen; // запущен более свежий проход — выходим
  const ln = await LN();
  await ensureChannels();

  const want = settings.notifyDaily || settings.notifyAspects;
  if (want) {
    const perm = await withTimeout(ln.checkPermissions(), 6000, 'Проверка разрешения');
    if (perm.display !== 'granted') {
      const r = await withTimeout(ln.requestPermissions(), 30000, 'Запрос разрешения');
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

  if (!want || stale()) return;

  const list: any[] = [];

  if (settings.notifyDaily) {
    const [hh, mm] = (settings.dailyNotifyTime || '09:00').split(':').map((x) => parseInt(x, 10));
    // время задано в ВЫБРАННОМ поясе, а плагин повторяет по часам ТЕЛЕФОНА —
    // переводим сегодняшнее hh:mm пояса в локальные час/минуту устройства
    const dayStart = zonedDayStartUTC(todayCivil(tz), tz);
    const at = new Date(dayStart.getTime() + ((isNaN(hh) ? 9 : hh) * 60 + (isNaN(mm) ? 0 : mm)) * 60_000);
    list.push({
      id: ID_DAILY,
      title: 'Сводка неба',
      body: 'Откройте Astra — аспекты и события сегодняшнего дня.',
      channelId: CH_DAILY, smallIcon: 'ic_stat_astra',
      schedule: { on: { hour: at.getHours(), minute: at.getMinutes() }, allowWhileIdle: true },
    });
  }

  if (settings.notifyAspects) {
    const orb = orbResolver(settings);
    const now = Date.now();
    let id = ID_ASPECT_FROM;
    for (let d = 0; d < 10 && id <= ID_ASPECT_TO; d++) {
      await breathe();
      if (stale()) return;
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

  if (list.length && !stale()) {
    try { await ln.schedule({ notifications: list }); } catch { /* тихо */ }
  }
}
