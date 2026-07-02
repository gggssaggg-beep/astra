/**
 * OTA-обновления веб-части (§10.3/10.4). На УСТРОЙСТВЕ (Capacitor) бесшовно
 * подтягиваем новый веб-бандл с GitHub и применяем на СЛЕДУЮЩЕМ запуске — без
 * переустановки APK. Нативную часть (новые плагины) OTA не меняет — там нужен APK.
 *
 * Без аккаунта/бэкенда Capgo: плагин используем только как загрузчик. На GitHub
 * лежат `apk/latest.json` ({version,url,notes}) и `apk/bundle.zip` (содержимое
 * `dist`) — их публикует CI.
 *
 * ДВА ВЫУЧЕННЫХ УРОКА (2026-07-02, «интерфейс откатился к старой версии»):
 * 1. `notifyAppReady()` надо звать КАК МОЖНО РАНЬШЕ после старта. Если новый
 *    бандл не успевает отчитаться за ~10 с (медленный телефон, долгий старт),
 *    Capgo считает его «сломанным» и молча откатывает к вшитому.
 * 2. Применённую версию НЕЛЬЗЯ хранить маркером в localStorage: после отката
 *    маркер продолжал говорить «стоит 0.1.0.15», проверка отвечала «Актуально»,
 *    и обновление больше никогда не ставилось. Истина — только у плагина
 *    (`CapacitorUpdater.current()`).
 */
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { APP_VERSION } from './version.ts';

const REPO = 'gggssaggg-beep/astra';
const MANIFEST_URL = `https://raw.githubusercontent.com/${REPO}/main/apk/latest.json`;

interface Manifest { version: string; url: string; notes?: string; }

/** Итог последней проверки OTA — для показа в настройках (диагностика). */
export interface OtaStatus {
  native: boolean;       // это устройство (Capacitor)?
  pluginOk: boolean;     // плагин Capgo есть в этой сборке APK?
  applied: string;       // реально применённая версия бандла (builtin = версия APK)
  latest?: string;       // версия из манифеста, если удалось получить
  state: 'idle' | 'checking' | 'uptodate' | 'queued' | 'error';
  message: string;       // человекочитаемый итог
}

let status: OtaStatus = {
  native: false, pluginOk: false, applied: APP_VERSION,
  state: 'idle', message: 'Проверка ещё не запускалась.',
};

export function getOtaStatus(): OtaStatus { return { ...status }; }

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

// notifyAppReady — один раз за сессию, максимально рано (см. урок №1 выше).
// Ошибку запоминаем отдельно: промис кэшируется, а статус выставляет КАЖДЫЙ
// вызов checkOtaUpdate (иначе повторная проверка зависала бы на «Проверяю…»).
let readyPromise: Promise<boolean> | null = null;
let readyErr = '';
function ensureReady(): Promise<boolean> {
  readyPromise ??= CapacitorUpdater.notifyAppReady()
    .then(() => true)
    .catch((e) => {
      // плагин может отсутствовать, если APK собран ДО его добавления (Раунд 4)
      readyErr = 'Плагин обновления не найден в этой сборке — нужен свежий APK '
        + `(причина: ${errText(e)}).`;
      return false;
    });
  return readyPromise;
}

/** Реально применённая сейчас версия — спрашиваем плагин, не localStorage. */
async function currentApplied(): Promise<string> {
  try {
    const { bundle } = await CapacitorUpdater.current();
    return (!bundle || bundle.id === 'builtin' || !bundle.version) ? APP_VERSION : bundle.version;
  } catch { return APP_VERSION; }
}

/**
 * Проверить обновление и, если оно новее применённого, скачать + поставить в
 * очередь. Возвращает статус — годится и для авто-проверки на старте, и для
 * кнопки в UI. Ошибки НЕ глотаются молча: попадают в `status.message`.
 */
export async function checkOtaUpdate(): Promise<OtaStatus> {
  if (!Capacitor.isNativePlatform()) {
    status = { ...status, native: false, state: 'idle',
      message: 'OTA работает только на телефоне (в браузере — нет).' };
    return getOtaStatus();
  }
  status.native = true;
  status.state = 'checking';
  status.message = 'Проверяю обновление…';

  if (!(await ensureReady())) {
    status = { ...status, pluginOk: false, state: 'error', message: readyErr };
    return getOtaStatus();
  }
  status.pluginOk = true;
  status.applied = await currentApplied();

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

    // вдруг нужная версия уже скачана (повторная проверка в этой же сессии,
    // либо бандл пережил откат) — тогда не качаем заново, просто ставим в очередь
    let id: string | null = null;
    try {
      const { bundles } = await CapacitorUpdater.list();
      id = bundles.find((b) => b.version === m.version)?.id ?? null;
    } catch { /* нет list() — просто скачаем */ }
    if (!id) {
      const bundle = await CapacitorUpdater.download({ url: m.url, version: m.version });
      id = bundle.id;
    }
    // применится на следующем запуске (без рывка посреди работы)
    await CapacitorUpdater.next({ id });
    status = { ...status, state: 'queued',
      message: `Скачано ${m.version} — применится при следующем запуске приложения.` };
    return getOtaStatus();
  } catch (e) {
    status = { ...status, state: 'error', message: `Ошибка обновления: ${errText(e)}` };
    return getOtaStatus();
  }
}

/**
 * Вызвать один раз при старте (до/сразу после mount). На вебе — no-op.
 * На устройстве: СРАЗУ подтвердить, что текущий бандл рабочий (иначе Capgo
 * откатит к вшитому), затем проверить обновление в фоне.
 */
export async function initOta(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  void ensureReady();     // не ждём сети/манифеста — отчитаться надо немедленно
  await checkOtaUpdate();
}
