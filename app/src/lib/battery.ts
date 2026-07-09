/**
 * Низкий заряд по Battery Status API — для режима «Экономия аккумулятора»
 * (settings.batterySaver='auto'). Android WebView = Chromium → getBattery есть;
 * iOS/Safari и часть десктопов API убрали. Нет API → тихо считаем «не низкий»
 * (режим 'auto' тогда просто = 'off'), ошибок не поднимаем.
 */

export type BatteryListener = (low: boolean) => void;

interface BatteryLike {
  level: number;              // 0..1
  charging: boolean;
  addEventListener(type: string, cb: () => void): void;
  removeEventListener(type: string, cb: () => void): void;
}

const LOW = 0.2; // ≤20% и не на зарядке → «низкий заряд»

/**
 * Следить за низким зарядом. Дёргает cb при каждом изменении (и один раз сразу).
 * Возвращает функцию отписки. Если Battery API недоступен — сразу cb(false).
 */
export function watchLowBattery(cb: BatteryListener): () => void {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
  if (typeof nav.getBattery !== 'function') { cb(false); return () => {}; }

  let bat: BatteryLike | null = null;
  let cancelled = false;
  const update = () => { if (bat) cb(bat.level <= LOW && !bat.charging); };

  nav.getBattery().then((b) => {
    if (cancelled) return;
    bat = b;
    b.addEventListener('levelchange', update);
    b.addEventListener('chargingchange', update);
    update();
  }).catch(() => cb(false));

  return () => {
    cancelled = true;
    if (bat) {
      bat.removeEventListener('levelchange', update);
      bat.removeEventListener('chargingchange', update);
    }
  };
}
