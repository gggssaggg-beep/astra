/** Совмещённые карты: момент рождения и натальные позиции человека.
 *  Математика статичных аспектов — engine/static.ts (движок-независимо). */
import type { Engine, BodyPosition } from '../engine/index.ts';
import type { Person } from './models.ts';
import { zonedTimeUTC } from './format.ts';

/** Момент рождения (UTC). Время неизвестно → полдень пояса рождения
 *  (Луна ≈13°/сут — помечаем в UI, что она неточна). */
export function birthInstantUTC(p: Person): Date {
  const t = (p.unknownTime || !p.birthTime) ? '12:00' : p.birthTime;
  return zonedTimeUTC(p.birthDate, t, p.birthTz);
}

export function natalPositions(E: Engine, p: Person): BodyPosition[] {
  return E.positions(birthInstantUTC(p));
}
