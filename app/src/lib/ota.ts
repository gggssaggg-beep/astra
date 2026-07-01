/**
 * OTA-обновления веб-части (§10.3/10.4). На УСТРОЙСTVE (Capacitor) бесшовно
 * подтягиваем новый веб-бандл с GitHub и применяем на СЛЕДУЮЩЕМ запуске — без
 * переустановки APK. Нативную часть (новые плагины) OTA не меняет — там нужен APK.
 *
 * Без аккаунта/бэкенда Capgo: плагин используем только как загрузчик. На GitHub
 * лежат `apk/latest.json` ({version,url,notes}) и `apk/bundle.zip` (содержимое
 * `dist`) — их публикует CI. Что новее — решаем по нашему маркеру в localStorage.
 *
 * НАБЛЮДАЕМОСТЬ: раньше все ошибки молча глотались, а footer показывал вшитую
 * APP_VERSION — понять, сработал ли OTA, было нельзя. Теперь путь пишет статус
 * (`getOtaStatus`) и есть ручная проверка (`checkOtaUpdate`) с явным результатом.
 */
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { APP_VERSION } from './version.ts';

const REPO = 'gggssaggg-beep/astra';
const MANIFEST_URL = `https://raw.githubusercontent.com/${REPO}/main/apk/latest.json`;
const APPLIED_KEY = 'astra:otaVersion';

interface Manifest { version: string; url: string; notes?: string; }

/** Итог последней проверки OTA — для показа в настройках (диагностика). */
export interface OtaStatus {
  native: boolean;       // это устройство (Capacitor)?
  pluginOk: boolean;     // плагин Capgo есть в этой сборке APK?
  applied: string;       // применённая (или вшитая) версия бандла
  latest?: string;       // версия из манифеста, если удалось получить
  state: 'idle' | 'checking' | 'uptodate' | 'queued' | 'error';
  message: string;       // человекочитаемый итог
}

let status: OtaStatus = {
  native: false, pluginOk: false, applied: APP_VERSION,
  state: 'idle', message: 'Проверка ещё не запускалась.',
};

export function getOtaStatus(): OtaStatus { return { ...status }; }

/** Уже применённая (или поставленная в очередь) версия бандла; базово — версия APK. */
export function appliedVersion(): string {
  try { return localStorage.getItem(APPLIED_KEY) || APP_VERSION; } catch { return APP_VERSION; }
}

/** Сравнение версий вида «0.1.0» / «0.1.0.42» — по числовым частям. */
function isNewer(a: string, b: string): boolean {
  const pa = String(a).split(/\D+/).filter(Boolean).map(Number);
  const pb = String(b).split(/\D+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Проверить обновление и, если оно новее, скачать + поставить в очередь.
 * Возвращает статус — годится и для авто-проверки на старте, и для кнопки в UI.
 * Ошибки НЕ глотаются молча: попадают в `status.message`.
 */
export async function checkOtaUpdate(): Promise<OtaStatus> {
  status.applied = appliedVersion();

  if (!Capacitor.isNativePlatform()) {
    status = { ...status, native: false, state: 'idle',
      message: 'OTA работает только на телефоне (в браузере — нет).' };
    return getOtaStatus();
  }
  status.native = true;
  status.state = 'checking';
  status.message = 'Проверяю обновление…';

  // Плагин может отсутствовать, если APK собран ДО его добавления (Раунд 4).
  try {
    await CapacitorUpdater.notifyAppReady();
    status.pluginOk = true;
  } catch (e) {
    status = { ...status, pluginOk: false, state: 'error',
      message: 'Плагин обновления не найден в этой сборке — нужен свежий APK '
        + `(причина: ${errText(e)}).` };
    return getOtaStatus();
  }

  try {
    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) {
      status = { ...status, state: 'error', message: `Манифест недоступен (HTTP ${res.status}).` };
      return getOtaStatus();
    }
    const m: Manifest = await res.json();
    status.latest = m?.version;
    if (!m?.version || !m?.url) {
      status = { ...status, state: 'error', message: 'Манифест без version/url.' };
      return getOtaStatus();
    }
    if (!isNewer(m.version, status.applied)) {
      status = { ...status, state: 'uptodate',
        message: `Актуально: установлен ${status.applied}, в манифесте ${m.version}.` };
      return getOtaStatus();
    }

    // скачиваем и ставим в очередь — применится на следующем запуске (без рывка)
    const bundle = await CapacitorUpdater.download({ url: m.url, version: m.version });
    await CapacitorUpdater.next({ id: bundle.id });
    try { localStorage.setItem(APPLIED_KEY, m.version); } catch { /* quota */ }
    status = { ...status, applied: m.version, state: 'queued',
      message: `Скачано ${m.version} — применится при следующем запуске приложения.` };
    return getOtaStatus();
  } catch (e) {
    status = { ...status, state: 'error', message: `Ошибка обновления: ${errText(e)}` };
    return getOtaStatus();
  }
}

/**
 * Вызвать один раз при старте. На вебе — no-op. На устройстве: подтвердить, что
 * текущий бандл рабочий (иначе Capgo откатит), и проверить обновление в фоне.
 */
export async function initOta(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await checkOtaUpdate();
}
