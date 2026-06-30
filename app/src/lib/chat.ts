/**
 * Чат трактовок (§3.6). В модель кладём УЖЕ посчитанные движком данные дня —
 * она их ТРАКТУЕТ, не пересчитывает (токен-экономия, §0). Модель — Claude
 * (claude-opus-4-8). В вебе зовём напрямую с заголовком direct-browser-access;
 * на устройстве (Capacitor) лучше нативный HTTP (CapacitorHttp) — обойти CORS.
 */
import type { Engine } from '../engine/index.ts';
import { aspectsOn, eventsOn } from '../engine/index.ts';
import { fmtPos, fmtTime, zonedDayStartUTC } from './format.ts';
import { db } from './db.ts';

export interface ChatMsg { role: 'user' | 'assistant'; content: string; }

/** Текстовая сводка дня для контекста модели. */
export function buildDayContext(E: Engine, date: Date, tz: string,
  orb: number | ((name: string) => number) = 1.0): string {
  const dayStart = zonedDayStartUTC(date, tz); // сутки и позиции — в выбранном поясе
  const day = aspectsOn(E, dayStart, orb, true);
  const evs = eventsOn(E, dayStart);
  const pos = E.positions(dayStart).map((p) => `${p.name} ${fmtPos(p.lon)}${p.retro ? ' ℞' : ''}`).join('; ');
  const asp = [...day.moon, ...day.fast, ...day.slow]
    .map((a) => `${a.p1} ${a.aspect} ${a.p2} (орбис ${a.exactOrb.toFixed(2)}°${a.exactTime ? `, точно ${fmtTime(a.exactTime, tz)}` : ''}, ${a.applying ? 'сходится' : 'расходится'})`)
    .join('; ');
  const ev = evs.map((e) => e.text).join('; ');
  return `Дата: ${date.toISOString().slice(0, 10)} (время в поясе ${tz}).
Позиции: ${pos}.
Аспекты: ${asp || 'нет в орбисе'}.
События: ${ev || 'нет'}.`;
}

export function systemPrompt(E: Engine, date: Date, tz: string,
  orb: number | ((name: string) => number) = 1.0): string {
  const arche = db.archetypes.all().filter((a) => a.text).map((a) => `${a.object} — ${a.deity}: ${a.text}`).join('\n');
  return `Ты — вдумчивый помощник практикующего астролога. Тебе даны УЖЕ ПОСЧИТАННЫЕ данные неба на день (позиции в знаках/градусах, мажорные аспекты с точными временами, события). Не пересчитывай астрономию — доверяй этим числам и ТРАКТУЙ их. Где уместно — опирайся на архетипы греческой мифологии. Пиши по-русски, ясно и по делу.

=== Данные дня ===
${buildDayContext(E, date, tz, orb)}${arche ? `\n\n=== Архетипы (от астролога) ===\n${arche}` : ''}`;
}

/** Подгрузить архетип-миф объекта (раунд 4 #7): краткий пересказ + параллели из
 *  других культур. Без отдельной «графы рассуждений» — кратко и по делу. */
export async function loadDeityMyth(key: string, object: string, deity: string): Promise<string> {
  const system = 'Ты — знаток мифологии и архетипов, помогаешь практикующему астрологу. '
    + 'Дай КРАТКИЙ архетип-портрет объекта карты на основе греческой мифологии и короткие '
    + 'параллели из других культур. По-русски, ясно и по делу, без рассуждений о процессе. '
    + '2–3 коротких абзаца; уместен список ключевых мотивов.';
  const user = `Объект карты: ${object}. Греческое соответствие: ${deity || '(подбери уместное)'}. `
    + 'Дай: краткий пересказ архетипа/мифа; ключевые мотивы; параллели в других культурах.';
  return askClaude(key, system, [{ role: 'user', content: user }]);
}

export async function askClaude(key: string, system: string, messages: ChatMsg[]): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 2000, system, messages }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('Неверный ключ (401). Проверь ключ Claude.');
    throw new Error(`Ошибка ${res.status}: ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  return (j.content ?? []).map((b: { type: string; text?: string }) => (b.type === 'text' ? b.text : '')).join('').trim();
}
