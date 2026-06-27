/**
 * API-ключ Claude (§3.6, Безопасность). Хранится ОТДЕЛЬНО от данных журнала и НЕ
 * попадает в экспорт (ключ 'astra-key' не под префиксом 'astra:'). На устройстве
 * (Capacitor) заменить на защищённое хранилище (Secure Storage / Preferences).
 * НЕ в коде, НЕ в гите.
 */
const K = 'astra-key';
export const getKey = (): string => { try { return localStorage.getItem(K) ?? ''; } catch { return ''; } };
export const setKey = (v: string): void => { try { localStorage.setItem(K, v.trim()); } catch { /* */ } };
export const clearKey = (): void => { try { localStorage.removeItem(K); } catch { /* */ } };
export const hasKey = (): boolean => !!getKey();
