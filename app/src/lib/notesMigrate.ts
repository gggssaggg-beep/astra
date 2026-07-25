/**
 * ВОССТАНОВЛЕНИЕ НАПРАВЛЕНИЯ у старых заметок (просьба владелицы 2026-07-25:
 * «можно ли из существующих заметок выяснить, к какому именно аспекту она была?»).
 *
 * Да, можно — по ДАТЕ заметки и натальной карте пользователя. Заметка знает
 * пару планет и день; на этот день проверяем три гипотезы:
 *   1) транзитная P2 задела натальную P1  → «н:P1|т:P2»
 *   2) транзитная P1 задела натальную P2  → «н:P2|т:P1»
 *   3) обе планеты были в аспекте В НЕБЕ (заметка со страницы дня) → направления нет
 *
 * Ставим направление ТОЛЬКО когда ответ однозначен: сработала ровно одна из
 * (1)/(2) и не сработала (3). Во всех спорных случаях оставляем пусто — такие
 * заметки видны в обоих направлениях с пометкой «направление не указано».
 * Лучше не знать, чем приписать заметку не тому событию.
 */
import type { Engine, BodyPosition } from '../engine/index.ts';
import { ASPECTS } from '../engine/index.ts';
import type { JournalNote } from './models.ts';
import { parseSignature, transitSignature } from './signature.ts';

/** Кратчайшая разница углов, |x| ≤ 180. */
const angDiff = (a: number, b: number): number => ((a - b) % 360 + 540) % 360 - 180;

/** Было ли расхождение в орбисе аспекта хоть в один из моментов суток. */
function hitsDuringDay(
  lonsAt: (t: Date) => number | null,
  fixedLon: number,
  angle: number,
  orb: number,
  dayStart: Date,
): boolean {
  // 5 проб за сутки (каждые 6 часов) — Луна за 6 ч уходит на ~3°, для орбиса
  // в 1–2° этого достаточно, чтобы поймать попадание хотя бы одной пробой
  for (let h = 0; h <= 24; h += 6) {
    const t = new Date(dayStart.getTime() + h * 3600_000);
    const lon = lonsAt(t);
    if (lon == null) continue;
    const d = Math.abs(angDiff(lon, fixedLon));
    if (Math.abs(d - angle) <= orb) return true;
  }
  return false;
}

export interface MigrateResult {
  /** заметки, которым проставили направление (id → сигнатура) */
  updates: Map<string, string>;
  /** сколько осталось неоднозначными (направление не проставлено) */
  ambiguous: number;
  /** сколько распознано как заметки НЕБА (обе планеты транзитные) */
  sky: number;
}

/**
 * Разобрать заметки и определить направление там, где оно однозначно.
 * natal — натальные позиции «моей карты»; orbOf — резолвер орбиса.
 * Заметки, у которых направление уже есть, пропускаются.
 */
export function recoverNoteDirections(
  engine: Engine,
  notes: JournalNote[],
  natal: BodyPosition[],
  orbOf: (name: string) => number,
  objects?: string[] | null,
): MigrateResult {
  const updates = new Map<string, string>();
  let ambiguous = 0, sky = 0;
  const natalLon = new Map(natal.map((p) => [p.name, p.lon]));
  // кэш позиций неба по моменту — у заметок часто совпадают дни
  const posCache = new Map<number, BodyPosition[]>();
  const posAt = (t: Date): BodyPosition[] => {
    const k = t.getTime();
    let p = posCache.get(k);
    if (!p) { p = engine.positions(t, objects ?? undefined); posCache.set(k, p); }
    return p;
  };
  const lonOf = (name: string) => (t: Date): number | null =>
    posAt(t).find((x) => x.name === name)?.lon ?? null;

  for (const n of notes) {
    if (n.transitSignature || !n.aspectSignature || !n.date) continue;
    const { p1, p2, aspect } = parseSignature(n.aspectSignature);
    const spec = ASPECTS[aspect];
    if (!spec) continue;
    const angle = spec.angle;
    const orb = Math.max(orbOf(p1), orbOf(p2));
    const dayStart = new Date(`${n.date}T00:00:00Z`);
    if (isNaN(dayStart.getTime())) continue;

    const n1 = natalLon.get(p1), n2 = natalLon.get(p2);
    // (1) транзитная p2 по натальной p1; (2) транзитная p1 по натальной p2
    const dir1 = n1 != null && hitsDuringDay(lonOf(p2), n1, angle, orb, dayStart);
    const dir2 = n2 != null && hitsDuringDay(lonOf(p1), n2, angle, orb, dayStart);
    // (3) обе планеты были в аспекте В НЕБЕ — заметка со страницы дня, у неё
    // направления «натал↔транзит» нет вовсе. Обе точки движутся, поэтому
    // сравниваем их между собой на каждой пробе.
    let skyHit = false;
    for (let h = 0; h <= 24 && !skyHit; h += 6) {
      const t = new Date(dayStart.getTime() + h * 3600_000);
      const l1 = lonOf(p1)(t), l2 = lonOf(p2)(t);
      if (l1 == null || l2 == null) continue;
      if (Math.abs(Math.abs(angDiff(l1, l2)) - angle) <= orb) skyHit = true;
    }

    if (skyHit) { sky++; continue; }              // заметка про небо — направления нет
    if (dir1 && !dir2) updates.set(n.id, transitSignature(p1, p2, aspect));
    else if (dir2 && !dir1) updates.set(n.id, transitSignature(p2, p1, aspect));
    else ambiguous++;                              // оба или ни одного — не гадаем
  }
  return { updates, ambiguous, sky };
}
