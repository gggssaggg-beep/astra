/**
 * «Тихое время» и разбор времени сводок (раунд уведомлений). Чистые функции без
 * Capacitor — тестируются в Node (reminders.ts тянет нативные плагины и в Node
 * не грузится). Окно тихого времени может переходить через полночь (22:00→08:00).
 */

/** 'HH:MM' → минуты от полуночи (дефолт при пустом/битом вводе). */
export function hmToMinutes(s: string | undefined, def: string): number {
  const [h, m] = (s || def).split(':').map((x) => parseInt(x, 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

/** Минуты от МЕСТНОЙ полуночи в поясе tz на момент at. */
export function localMinutes(at: Date, tz: string): number {
  const p = new Intl.DateTimeFormat('en-GB',
    { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(at);
  const h = parseInt(p.find((x) => x.type === 'hour')?.value ?? '0', 10);
  const m = parseInt(p.find((x) => x.type === 'minute')?.value ?? '0', 10);
  return h * 60 + m;
}

export interface QuietWindow { enabled?: boolean; from?: string; to?: string }

/** Момент at попадает в тихое окно [from, to) в поясе tz? Окно может идти через
 *  полночь (from > to). enabled=undefined → включено (дефолт true). */
export function inQuietHours(at: Date, tz: string, q: QuietWindow): boolean {
  if (q.enabled === false) return false;
  const from = hmToMinutes(q.from, '22:00'), to = hmToMinutes(q.to, '08:00');
  if (from === to) return false;   // пустое окно
  const t = localMinutes(at, tz);
  return from < to ? (t >= from && t < to) : (t >= from || t < to);
}
