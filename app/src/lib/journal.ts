/** Бортовой журнал: ключ дня и фильтры день/неделя/месяц + по планете (раунд 3). */
import type { JournalNote, Person } from './models.ts';

export type Period = 'day' | 'week' | 'month' | 'all';

/** 'YYYY-MM-DD' дня, к которому относится запись (день ленты — в UTC). */
export const noteDateStr = (d: Date): string => d.toISOString().slice(0, 10);

// ── «Откуда» заметка (просьба владелицы 2026-07-25) ───────────────────────────
// Подпись вида «Я+Саша 13.06.25» (совмещённая карта), «Я 20.06.2006» (натал —
// дата рождения), «Небо 13.06.25» (день на главной/журнал).

/** dd.mm.yy — короткая дата для подписи. */
export const shortDate = (d: Date): string => {
  const s = noteDateStr(d).split('-');
  return `${s[2]}.${s[1]}.${s[0].slice(2)}`;
};

/** dd.mm.yyyy из 'YYYY-MM-DD' (дата рождения — год полностью, это опознавалка). */
export const fullDate = (ymd: string): string => {
  const s = ymd.split('-');
  return `${s[2]}.${s[1]}.${s[0]}`;
};

/** Имя человека для подписи: своя карта — «Я». */
export const personLabel = (p: Person | null | undefined, selfId?: string | null): string =>
  !p ? '' : p.id && selfId && p.id === selfId ? 'Я' : p.name;

/** Подпись «откуда» для заметки по совмещённой карте. */
export function chartSource(
  mode: 'natal' | 'transitNatal' | 'triple' | 'synastry',
  a: Person | null, b: Person | null, at: Date, selfId?: string | null,
): string {
  const la = personLabel(a, selfId), lb = personLabel(b, selfId);
  // натал — карта одного человека вне времени: опознаётся датой РОЖДЕНИЯ
  if (mode === 'natal') return a ? `${la} ${fullDate(a.birthDate)}` : '';
  if (mode === 'synastry') return `${la}+${lb} ${shortDate(at)}`;
  if (mode === 'triple') return `${la}+${lb}+небо ${shortDate(at)}`;
  return `${la}+небо ${shortDate(at)}`;   // transitNatal
}

/** Подпись «откуда» для заметки со дня на главной / из журнала. */
export const skySource = (at: Date): string => `Небо ${shortDate(at)}`;

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
