/**
 * Цепочки диспозиторов (раунд 29 §2). Формула детерминированная (ИИ не нужен):
 * каждая планета → УПРАВИТЕЛЬ знака, в котором она стоит (`SIGN_RULER` —
 * авторская система владелицы, [[dispositorLore]]). Повторяем, пока не придём
 * к планете в СВОЁМ знаке («царь цепочки», финальный диспозитор) или к циклу
 * взаимной рецепции (соправители).
 *
 * Граф функциональный: у каждой планеты РОВНО одно исходящее ребро (её
 * диспозитор), поэтому в каждой компоненте ровно один цикл (само-петля царя
 * либо кольцо рецепции), а остальные планеты — «притоки». Солнце/Луна/Раху/
 * Кету в системе владелицы ничем не управляют → всегда истоки (в них никто не
 * впадает), но сами диспозируются к управителю своего знака.
 */
import { SIGN_RULER } from './dispositorLore.ts';
import { EXTRA_BODIES } from '../engine/constants.ts';
import type { BodyPosition } from '../engine/index.ts';

export interface DispChain {
  planet: string;         // с кого начинается
  path: string[];         // [planet, disp, disp², …] до входа в цикл (без повтора)
  cycle: string[];        // терминальный цикл: [X] царь ИЛИ [X,Y,…] рецепция
  king: string | null;    // финальный диспозитор, если цикл длиной 1; иначе null
}
export interface DispositorResult {
  dispOf: Record<string, string>;   // планета → её диспозитор (управитель знака)
  chains: DispChain[];               // по одной на каждую присутствующую планету
  kings: string[];                   // планеты в своём знаке (цари) — истоки силы карты
  receptions: string[][];            // циклы взаимной рецепции (длина ≥2)
}

/**
 * Диспозиторы для набора позиций (натал). Управитель может оказаться планетой,
 * выключенной тумблером объектов — тогда цепочка обрывается на её имени
 * (path включает недостижимого управителя последним, cycle пуст).
 *
 * Доп. объекты (астероиды, Лилит) знаками НЕ управляют — их отбрасываем сразу,
 * иначе они висели бы в цепочках лишними притоками и мешали читать «царей».
 */
export function chartDispositors(allPositions: BodyPosition[]): DispositorResult {
  const positions = allPositions.filter((p) => EXTRA_BODIES[p.name] == null);
  const sign = new Map(positions.map((p) => [p.name, p.sign]));
  const rulerOf = (name: string): string | undefined => {
    const s = sign.get(name);
    return s ? SIGN_RULER[s] : undefined;
  };

  const dispOf: Record<string, string> = {};
  for (const p of positions) { const r = rulerOf(p.name); if (r) dispOf[p.name] = r; }

  const chains: DispChain[] = [];
  const kingsSet = new Set<string>();
  const cyclesSeen = new Map<string, string[]>();   // ключ по отсортированному циклу

  for (const p of positions) {
    const path: string[] = [];
    const order = new Map<string, number>();
    let cur: string | undefined = p.name;
    let cycle: string[] = [];
    while (cur && !order.has(cur)) {
      order.set(cur, path.length);
      path.push(cur);
      const nx = rulerOf(cur);
      if (!nx) { cur = undefined; break; }             // Солнце/Луна/узел без управителя (не бывает — у всех есть знак)
      if (!sign.has(nx)) { path.push(nx); cur = undefined; break; }  // управитель выключен тумблером
      cur = nx;
    }
    if (cur && order.has(cur)) cycle = path.slice(order.get(cur)!);   // замкнулись на cur
    const king = cycle.length === 1 ? cycle[0] : null;
    if (king) kingsSet.add(king);
    if (cycle.length >= 2) {
      const key = [...cycle].sort().join('|');
      if (!cyclesSeen.has(key)) cyclesSeen.set(key, cycle);
    }
    // path без хвоста-цикла: оставляем ход до входа в цикл включительно
    chains.push({ planet: p.name, path, cycle, king });
  }

  return {
    dispOf,
    chains,
    kings: [...kingsSet],
    receptions: [...cyclesSeen.values()],
  };
}

/**
 * Промпт для ИИ-чата: разобрать цепочки диспозиторов простым языком, через
 * характеры планет-богов (правило владелицы — бытовой язык, «на ты»). Управители
 * авторские — передаём связи как есть, чтобы чат не «поправлял» на классику.
 */
export function dispositorPrompt(res: DispositorResult, positions: BodyPosition[]): string {
  const signOf = new Map(positions.map((p) => [p.name, p.sign]));
  const L: string[] = [];
  L.push('Разбери цепочки диспозиторов в моей карте простым, бытовым языком — как будто объясняешь близкому человеку, без заумных терминов и «на ты».');
  L.push('Система управителей знаков тут авторская (не классическая) — бери связи ровно как даны ниже, не переправляй на привычную схему.');
  L.push('');
  L.push('Цепочки (каждая планета ведёт к управителю знака, где она стоит):');
  for (const c of res.chains) {
    const parts = c.path.map((n) => `${n} (в ${signOf.get(n) ?? '?'})`);
    L.push('• ' + parts.join(' → ') + (c.king ? ' ⟲ царь' : c.cycle.length >= 2 ? ' ⟲ кольцо рецепции' : ''));
  }
  if (res.kings.length) L.push('', `Цари карты (планеты в своём знаке — к ним стекается вся карта): ${res.kings.join(', ')}.`);
  if (res.receptions.length) L.push(`Взаимные рецепции (соправители): ${res.receptions.map((c) => c.join(' ⇄ ')).join('; ')}.`);
  L.push('');
  L.push('Объясни: кто в карте главный распорядитель энергии, через какие темы «проходит» сила каждой планеты, что это даёт мне в жизни на практике и на что обратить внимание. Опирайся на характеры планет-богов, но говори по-человечески.');
  return L.join('\n');
}
