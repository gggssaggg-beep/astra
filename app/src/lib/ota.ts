/**
 * OTA-обновления веб-части (§10.3/10.4). На УСТРОЙСTVE (Capacitor) бесшовно
 * подтягиваем новый веб-бандл с GitHub и применяем на СЛЕДУЮЩЕМ запуске — без
 * переустановки APK. Нативную часть (новые плагины) OTA не меняет — там нужен APK.
 *
 * Без аккаунта/бэкенда Capgo: плагин используем только как загрузчик. На GitHub
 * лежат `apk/latest.json` ({version,url,notes}) и `apk/bundle.zip` (содержимое
 * `dist`) — их публикует CI. Что новее — решаем по нашему маркеру в localStorage.
 */
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { APP_VERSION } from './version.ts';

const REPO = 'gggssaggg-beep/astra';
const MANIFEST_URL = `https://raw.githubusercontent.com/${REPO}/main/apk/latest.json`;
const APPLIED_KEY = 'astra:otaVersion';

interface Manifest { version: string; url: string; notes?: string; }

/** Уже применённая (или поставленная в очередь) версия бандла; базово — версия APK. */
function appliedVersion(): string {
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

/**
 * Вызвать один раз при старте. На вебе — no-op. На устройстве: подтвердить, что
 * текущий бандл рабочий (иначе Capgo откатит), и проверить обновление в фоне.
 */
export async function initOta(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try { await CapacitorUpdater.notifyAppReady(); } catch { /* плагина нет в этой сборке */ return; }

  try {
    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const m: Manifest = await res.json();
    if (!m?.version || !m?.url) return;
    if (!isNewer(m.version, appliedVersion())) return;

    // скачиваем и ставим в очередь — применится на следующем запуске (без рывка)
    const bundle = await CapacitorUpdater.download({ url: m.url, version: m.version });
    await CapacitorUpdater.next({ id: bundle.id });
    try { localStorage.setItem(APPLIED_KEY, m.version); } catch { /* quota */ }
  } catch {
    /* офлайн / нет манифеста / ошибка сети — тихо, приложение работает как есть */
  }
}
