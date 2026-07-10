/**
 * Мини-стор обучалки (Svelte 5 руны в .svelte.ts) — чтобы не протаскивать
 * колбэки «?» через десяток компонентов. Пока — только глоссарий (слой 3);
 * тур (слой 1) и курс (слой 2) добавятся сюда же следующими партиями.
 */
export const glossState = $state<{ key: string | null }>({ key: null });
export const openGloss = (key: string): void => { glossState.key = key; };
export const closeGloss = (): void => { glossState.key = null; };
