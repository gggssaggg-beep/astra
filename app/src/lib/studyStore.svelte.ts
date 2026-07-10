/**
 * Мини-стор обучалки (Svelte 5 руны в .svelte.ts) — чтобы не протаскивать
 * колбэки «?» через десяток компонентов. Пока — только глоссарий (слой 3);
 * тур (слой 1) и курс (слой 2) добавятся сюда же следующими партиями.
 */
export const glossState = $state<{ key: string | null }>({ key: null });
export const openGloss = (key: string): void => { glossState.key = key; };
export const closeGloss = (): void => { glossState.key = null; };

// Тур по интерфейсу (слой 1). open — идёт ли тур; step — текущий шаг.
export const tourState = $state<{ open: boolean; step: number }>({ open: false, step: 0 });
export const openTour = (): void => { tourState.step = 0; tourState.open = true; };
export const closeTour = (): void => { tourState.open = false; };

// Курс «астрология с нуля» (слой 2). open — открыт список уроков (шторка
// CourseSheet, живёт как библиотечная); lesson — id открытого урока поверх
// списка (шторка LessonSheet) либо null.
export const courseState = $state<{ open: boolean; lesson: string | null }>({ open: false, lesson: null });
export const openCourse = (): void => { courseState.open = true; };
export const closeCourse = (): void => { courseState.open = false; courseState.lesson = null; };
export const openLesson = (id: string): void => { courseState.lesson = id; };
export const closeLesson = (): void => { courseState.lesson = null; };
