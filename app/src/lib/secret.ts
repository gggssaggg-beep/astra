/**
 * API-ключ Claude (§3.6, Безопасность). Хранится ОТДЕЛЬНО от данных журнала и НЕ
 * попадает в экспорт (ключ 'astra-key' не под префиксом 'astra:'). НЕ в коде, НЕ в гите.
 *
 * На устройстве durable-копия — в @capacitor/preferences (app-private
 * SharedPreferences): localStorage в WebView НЕ переживает перезапуск/OTA,
 * из-за чего ключ «сам стирался» и его приходилось вводить заново.
 * В памяти держим кэш, чтобы getKey() остался синхронным для UI.
 */
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const K = 'astra-key';
const NATIVE = Capacitor.isNativePlatform();

let cached = '';
try { cached = localStorage.getItem(K) ?? ''; } catch { /* нет localStorage */ }

/** Поднять ключ из durable-хранилища устройства. Вызвать один раз при старте. */
export async function hydrateKey(): Promise<void> {
  if (!NATIVE) return;
  try {
    const { value } = await Preferences.get({ key: K });
    if (value) {
      cached = value;
      try { localStorage.setItem(K, value); } catch { /* quota */ }
    }
  } catch { /* первый запуск / нет плагина */ }
}

export const getKey = (): string => cached;
export const setKey = (v: string): void => {
  cached = v.trim();
  try { localStorage.setItem(K, cached); } catch { /* quota */ }
  if (NATIVE) void Preferences.set({ key: K, value: cached }).catch(() => { /* тихо */ });
};
export const clearKey = (): void => {
  cached = '';
  try { localStorage.removeItem(K); } catch { /* */ }
  if (NATIVE) void Preferences.remove({ key: K }).catch(() => { /* тихо */ });
};
export const hasKey = (): boolean => !!cached;
