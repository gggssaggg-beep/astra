/** Нормализованная сигнатура аспекта: пара (по алфавиту) + тип (§3.5/§4). */
export function aspectSignature(p1: string, p2: string, aspect: string): string {
  const [a, b] = [p1, p2].sort((x, y) => x.localeCompare(y, 'ru'));
  return `${a}|${b}|${aspect}`;
}

export function parseSignature(sig: string): { p1: string; p2: string; aspect: string } {
  const [p1, p2, aspect] = sig.split('|');
  return { p1, p2, aspect };
}

/**
 * НАПРАВЛЕННАЯ сигнатура транзита к наталу: важно, КТО ДВИЖЕТСЯ.
 *
 * «Мой Марс ☌ транзитное Солнце» и «моё Солнце ☌ транзитный Марс» —
 * РАЗНЫЕ события (жалоба владелицы 2026-07-25): у первого период год и орбис
 * ~2 дня, у второго — два года и полторы недели, даты не пересекаются. Обычная
 * `aspectSignature` их не различает (пара нормализована по алфавиту), поэтому
 * заметки к ним склеивались в одну ленту.
 *
 * Формат: «н:Марс|т:Солнце|соединение» (н — натальная точка, т — транзитная).
 */
export function transitSignature(natal: string, transit: string, aspect: string): string {
  return `н:${natal}|т:${transit}|${aspect}`;
}

export function parseTransitSignature(
  sig: string,
): { natal: string; transit: string; aspect: string } | null {
  const m = sig.match(/^н:([^|]+)\|т:([^|]+)\|(.+)$/);
  return m ? { natal: m[1], transit: m[2], aspect: m[3] } : null;
}
