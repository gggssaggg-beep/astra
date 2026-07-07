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
import { flushNow } from './db.ts';

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
  queuedId?: string;     // id бандла, поставленного в очередь (для «Обновить сейчас»)
  autoApply?: boolean;   // можно ли применить сразу на старте (false = бандл прежде был битым)
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
 * `onProgress` — живой прогресс скачивания (бандл ~13 МБ, на мобильной сети
 * без процентов выглядело как «зависло/порвалось»).
 */
export async function checkOtaUpdate(onProgress?: (msg: string) => void): Promise<OtaStatus> {
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
    // таймаут на манифест: на captive portal / молчащей сети fetch иначе висит вечно
    const ctl = new AbortController();
    const tOut = setTimeout(() => ctl.abort(), 15_000);
    let res: Response;
    try { res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store', signal: ctl.signal }); }
    finally { clearTimeout(tOut); }
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

    // Вдруг нужная версия уже скачана (повторная проверка в этой же сессии) —
    // тогда не качаем заново. НО: бандл со статусом error (скачался и не
    // запустился → откатился) переиспользовать НЕЛЬЗЯ — именно так обновление
    // «залипало» навсегда («установлено 21, в манифесте 22, не берёт»).
    // Битый — удаляем и качаем заново начисто.
    let id: string | null = null;
    let hadBroken = false;
    try {
      const { bundles } = await CapacitorUpdater.list();
      for (const b of bundles) {
        if (b.version !== m.version || b.id === 'builtin') continue;
        if (b.status === 'success' || b.status === 'pending') { id = b.id; }
        else {
          hadBroken = true;
          try { await CapacitorUpdater.delete({ id: b.id }); } catch { /* занят — пропустим */ }
        }
      }
    } catch { /* нет list() — просто скачаем */ }
    if (!id) {
      onProgress?.('Скачиваю обновление…');
      // проценты скачивания — если плагин поддерживает событие
      const anyUpd = CapacitorUpdater as unknown as {
        addListener?: (n: string, cb: (e: { percent?: number }) => void) => Promise<{ remove: () => void }>;
      };
      let sub: { remove: () => void } | null = null;
      try { sub = (await anyUpd.addListener?.('download', (e) => {
        onProgress?.(`Скачиваю… ${Math.round(e.percent ?? 0)}%`);
      })) ?? null; } catch { /* старый плагин без события — просто без процентов */ }
      try {
        const bundle = await CapacitorUpdater.download({ url: m.url, version: m.version });
        id = bundle.id;
      } finally { try { sub?.remove(); } catch { /* уже снят */ } }
    }
    // ставим в очередь: применится при следующем запуске ЛИБО сразу по кнопке
    // «Обновить сейчас» (applyQueuedNow) в настройках
    await CapacitorUpdater.next({ id });
    status = { ...status, state: 'queued', queuedId: id, autoApply: !hadBroken,
      message: `Скачано ${m.version} — обновить сейчас или при следующем запуске.`
        + (hadBroken ? ' (прошлая загрузка была битой — скачано заново)' : '') };
    return getOtaStatus();
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'AbortError';
    status = { ...status, state: 'error',
      message: timedOut
        ? 'Сеть молчит (манифест не ответил за 15 с) — проверь интернет и попробуй ещё раз.'
        : `Ошибка обновления: ${errText(e)}` };
    return getOtaStatus();
  }
}

/**
 * Применить поставленный в очередь бандл НЕМЕДЛЕННО (reload webview). Кнопка
 * «Обновить сейчас» в настройках: не ждать следующего запуска — перезапуск
 * «убил из недавних» на Android не всегда реально убивает процесс, из-за чего
 * `next()` мог не примениться и обновление казалось «не берётся».
 * ВАЖНО: после reload() JS-контекст уничтожается — код дальше не выполнится.
 */
export async function applyQueuedNow(): Promise<OtaStatus> {
  try {
    await flushNow();   // не потерять несохранённые правки (дебаунс) при reload
    await CapacitorUpdater.reload();
    return getOtaStatus();   // сюда обычно уже не дойдём
  } catch (e) {
    status = { ...status, state: 'error', message: `Не удалось применить сейчас: ${errText(e)}` };
    return getOtaStatus();
  }
}

/**
 * Вызвать один раз при старте (до/сразу после mount). На вебе — no-op.
 * На устройстве: СРАЗУ подтвердить, что текущий бандл рабочий (иначе Capgo
 * откатит к вшитому), затем проверить обновление и — если скачалось —
 * ПРИМЕНИТЬ СРАЗУ (порт паттерна MENS useAutoUpdate: перезапуск на старте,
 * пока владелица ничего не успела ввести). Раньше `next()` ждал «следующего
 * полного запуска», которого на Android можно ждать днями (процесс живёт) —
 * «чтобы обновление встало, приходится перезагружаться раза 3».
 *
 * Защита от reload-петли: бандл, который прежде падал (откат Capgo), НЕ
 * автоприменяем (autoApply=false) — только вручную из настроек.
 */
let otaBusyGuard = false;   // не запускать проверку параллельно (старт + resume)

async function checkAndMaybeApply(): Promise<void> {
  if (otaBusyGuard) return;
  otaBusyGuard = true;
  try {
    const st = await checkOtaUpdate();
    // Применяем (reload) ТОЛЬКО когда приложение НА ЭКРАНЕ. Свёрнутое —
    // WebView заморожен, reload посреди фона может не сработать/оставить
    // приложение в странном состоянии; применим при следующем возврате.
    if (st.state === 'queued' && st.autoApply && document.visibilityState === 'visible') {
      await applyQueuedNow();
    }
  } catch { /* сеть/манифест недоступны — тихо, попробуем при возврате */ }
  finally { otaBusyGuard = false; }
}

/** Реально применённая версия бандла (для разового уведомления об обновлении). */
export async function appliedVersion(): Promise<string> { return currentApplied(); }

export async function initOta(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  void ensureReady();     // не ждём сети/манифеста — отчитаться надо немедленно
  await checkAndMaybeApply();
}

/**
 * Вызывать при ВОЗВРАЩЕНИИ приложения на экран (App appStateChange isActive,
 * либо visibilitychange). Сворачивание/блокировка экрана в Android WebView
 * ЗАМОРАЖИВАЕТ JS и рвёт скачивание бандла на середине («слетает загрузка
 * обновлений если свернуть» — жалоба 2026-07-07). При возврате докачиваем
 * начисто и применяем. checkOtaUpdate идемпотентен: недокачанный/битый бандл
 * удаляется и качается заново.
 */
export async function resumeOta(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await checkAndMaybeApply();
}
