/**
 * Фаза ретроградности планеты (раунд 29 §3). Цикл: тень-до → станция R →
 * ретро-ход → станция D → тень-после → снова директ. Определяем по скорости
 * (знак/ноль) и по долготам ОКРУЖАЮЩИХ станций (тень = директный проход по
 * дуге ретро-петли до/после самой петли).
 *
 * Только публичный Engine.lon/lonSpeed/toJD/fromJD — ядро не трогаем. Считается
 * по требованию (несколько тысяч вызовов скорости), не в каждом рендере.
 */
import type { Engine } from './engine.ts';

export type RetroPhase =
  | 'direct'          // прямое движение вне тени
  | 'shadowBefore'    // тень до ретро (первый проход по будущей дуге)
  | 'retroStation'    // станция — разворот в ретроград
  | 'retro'           // ретроградный ход
  | 'directStation'   // станция — разворот в директ
  | 'shadowAfter';    // тень после ретро (повторный проход по дуге)

const angdiff = (a: number, b: number): number => {
  const d = ((a - b) % 360 + 360) % 360;
  return d > 180 ? d - 360 : d;
};

interface Station { jd: number; lon: number; toRetro: boolean }   // toRetro: R-станция (директ→ретро)

/** Собрать до `count` станций (смен знака скорости) от `jd0` в направлении dir. */
function stations(E: Engine, planet: string, jd0: number, dir: 1 | -1, count: number, maxDays = 420): Station[] {
  const step = 0.5 * dir;
  const sp = (j: number) => E.lonSpeed(j, planet)[1];
  const out: Station[] = [];
  let prevJ = jd0, prevV = sp(jd0);
  for (let k = 1; k <= maxDays * 2 && out.length < count; k++) {
    const j = jd0 + k * step;
    const v = sp(j);
    if ((prevV <= 0) !== (v <= 0)) {
      let lo = Math.min(prevJ, j), hi = Math.max(prevJ, j);
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if ((sp(lo) <= 0) !== (sp(mid) <= 0)) hi = mid; else lo = mid;
      }
      const jd = (lo + hi) / 2;
      out.push({ jd, lon: E.lon(jd, planet), toRetro: sp(jd - 0.3) > 0 && sp(jd + 0.3) < 0 });
    }
    prevJ = j; prevV = v;
  }
  return out;
}

const STATION_WIN = 1.2;   // ±дней вокруг точной станции считаем «станцией»

/**
 * Фаза планеты на момент `at`. Солнце/Луна не ретроградят → всегда 'direct'.
 * Узлы (Раху/Кету) почти всегда ретроградны — вернётся 'retro' (директные
 * узлы редки, тень к ним не применяется).
 */
export function retroPhase(E: Engine, planet: string, at: Date): RetroPhase {
  if (planet === 'Солнце' || planet === 'Луна') return 'direct';
  const jd = E.toJD(at);
  // Узлы ВИБРИРУЮТ (истинный узел то ретро, то на короткое время директ) — это
  // не ретро-петля с тенью, а колебание. Отдаём просто по знаку скорости:
  // ретро (норма) либо редкий директный узел (§3 «директные узлы как редкость»).
  if (planet === 'Раху' || planet === 'Кету') return E.lonSpeed(jd, planet)[1] < 0 ? 'retro' : 'direct';
  const speed = E.lonSpeed(jd, planet)[1];
  const lon = E.lon(jd, planet);

  const ahead = stations(E, planet, jd, 1, 2);
  const behind = stations(E, planet, jd, -1, 2);
  const nextSt = ahead[0], prevSt = behind[0];

  // рядом со станцией по времени — это станция (R или D)
  if (nextSt && Math.abs(nextSt.jd - jd) < STATION_WIN) return nextSt.toRetro ? 'retroStation' : 'directStation';
  if (prevSt && Math.abs(jd - prevSt.jd) < STATION_WIN) return prevSt.toRetro ? 'retroStation' : 'directStation';

  if (speed < 0) return 'retro';

  // директ: тень-до (перед будущей петлёй) или тень-после (после петли)
  // тень-до: впереди R-станция (Lr) и за ней D-станция (Ld); мы уже прошли Ld снизу
  if (nextSt?.toRetro && ahead[1] && !ahead[1].toRetro) {
    const Lr = nextSt.lon, Ld = ahead[1].lon;
    // planet идёт вверх к Lr; в тени, если долгота уже за Ld (нижней точкой петли)
    if (angdiff(lon, Ld) >= 0 && angdiff(lon, Lr) < 0) return 'shadowBefore';
  }
  // тень-после: позади D-станция (Ld) и перед ней R-станция (Lr); мы ещё не прошли Lr
  if (prevSt && !prevSt.toRetro && behind[1]?.toRetro) {
    const Ld = prevSt.lon, Lr = behind[1].lon;
    if (angdiff(lon, Ld) >= 0 && angdiff(lon, Lr) <= 0) return 'shadowAfter';
  }
  return 'direct';
}
