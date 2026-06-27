/** Нормализованная сигнатура аспекта: пара (по алфавиту) + тип (§3.5/§4). */
export function aspectSignature(p1: string, p2: string, aspect: string): string {
  const [a, b] = [p1, p2].sort((x, y) => x.localeCompare(y, 'ru'));
  return `${a}|${b}|${aspect}`;
}

export function parseSignature(sig: string): { p1: string; p2: string; aspect: string } {
  const [p1, p2, aspect] = sig.split('|');
  return { p1, p2, aspect };
}
