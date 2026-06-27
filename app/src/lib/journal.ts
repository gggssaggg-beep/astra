/** Бортовой журнал: ключ дня и фильтры день/неделя/месяц + по планете (раунд 3). */
import type { JournalNote } from './models.ts';

export type Period = 'day' | 'week' | 'month' | 'all';

/** 'YYYY-MM-DD' дня, к которому относится запись (день ленты — в UTC). */
export const noteDateStr = (d: Date): string => d.toISOString().slice(0, 10);

function weekRange(around: Date): [string, string] {
  const base = Date.UTC(around.getUTCFullYear(), around.getUTCMonth(), around.getUTCDate());
  const lead = (new Date(base).getUTCDay() + 6) % 7; // Пн=0
  const start = base - lead * 86400000;
  return [noteDateStr(new Date(start)), noteDateStr(new Date(start + 7 * 86400000))];
}

export function filterNotes(
  notes: JournalNote[], around: Date, period: Period, planet: string
): JournalNote[] {
  const day = noteDateStr(around);
  const month = day.slice(0, 7);
  const [wStart, wEnd] = weekRange(around);
  return notes
    .filter((n) => {
      const okPeriod =
        period === 'all' ? true
        : period === 'day' ? n.date === day
        : period === 'month' ? n.date.slice(0, 7) === month
        : n.date >= wStart && n.date < wEnd; // week
      const okPlanet = !planet || n.objects.includes(planet);
      return okPeriod && okPlanet;
    })
    .sort((a, b) => (b.date.localeCompare(a.date)) || b.createdAt.localeCompare(a.createdAt));
}
