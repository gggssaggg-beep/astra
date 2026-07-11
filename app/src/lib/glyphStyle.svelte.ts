/**
 * Текущий стиль окраски символов знаков (серебро/золото/стихии/радуга) —
 * модульный $state-стор. App резолвит settings.signStyle ('auto' → по теме,
 * экономия → 'gold') и кладёт сюда; шторки читают без прокидывания пропа через
 * всё дерево (сейчас: LessonSheet красит мини-колесо квиза).
 */
import type { SignStyle } from './models.ts';

export const glyphStyle = $state<{ v: SignStyle }>({ v: 'silver' });
