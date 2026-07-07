/**
 * Ссылка «написать в Telegram» по @username. Числовой Telegram-ID НЕ открывает
 * личку постороннему — нужен username. Схема tg://resolve?domain=… нативная:
 * якорь с ней Capacitor отдаёт ОС, а приложение Telegram открывает чат этого
 * пользователя (в отличие от tg://user?id=, который лишь показывал профиль по id
 * и для чужих не резолвился — жалоба владелицы 2026-07-07).
 */
export function tgHref(username: string): string {
  return `tg://resolve?domain=${username.trim().replace(/^@/, '')}`;
}
