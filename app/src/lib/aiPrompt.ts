/**
 * Единый ПОЛНЫЙ промпт для внешней ИИ (кнопка «Промпт для ИИ» рядом с «Обсудить
 * с Claude», просьба владелицы 2026-07-07). Тот же корректный контекст, что уходит
 * Клоду: правила верного расчёта + система домов пользователя + все позиции
 * (в знаке+градусе, с домом) + все аспекты рассматриваемых карт. Индивидуально
 * для каждого окна — лишнего не тащим (экономия токенов пользователя).
 */

const CALC_RULES =
  'Данные УЖЕ рассчитаны в приложении по Swiss Ephemeris (тропический зодиак, '
  + 'расчёт в UTC, аспект — интервал вход→точно→выход орбиса). Не пересчитывай '
  + 'астрономию и не сомневайся в числах: проверки уже выполнены (элонгации '
  + 'Меркурия <28° и Венеры <48° от Солнца соблюдены; углы через кратчайшую дугу '
  + 'с переходом через 0° Овна). Твоя задача — ТРАКТОВАТЬ.';

export interface PromptPerson {
  name: string;
  birth: string;          // «23.03.1989 · 02:40 · Asia/Novosibirsk · Новосибирск»
  positions: string;      // «Солнце 2°09′ Овна (I дом ℞?)…»
  houses?: string;        // «I 5°Овна (упр. Марс)…» — если есть
}

export interface AstroPrompt {
  title: string;
  kind: 'natal' | 'synastry' | 'transitNatal' | 'triple' | 'day' | 'aspect';
  houseSystem?: string;   // человекочитаемое название системы домов
  people?: PromptPerson[];
  transit?: { label: string; positions: string };
  aspects?: string[];     // строки аспектов рассматриваемой карты
  focus?: string;         // конкретный аспект/вопрос, если окно — про один аспект
  extra?: string;         // доп. пояснение по типу карты
}

/** Собрать полный текст промпта. Пустые секции опускаются — токены не тратятся. */
export function buildAstroPrompt(p: AstroPrompt): string {
  const L: string[] = [];
  L.push(`Ты — вдумчивый астролог. Разбери: ${p.title}.`);
  L.push(CALC_RULES);
  if (p.houseSystem) L.push(`Система домов: ${p.houseSystem} (выбрана пользователем).`);
  if (p.extra) L.push(p.extra);

  for (const per of p.people ?? []) {
    L.push(`\n=== ${per.name} ===\nРождение: ${per.birth}.`);
    L.push(`Положения: ${per.positions}.`);
    if (per.houses) L.push(`Дома (куспиды и управители): ${per.houses}.`);
  }
  if (p.transit) L.push(`\n=== Транзит (небо на ${p.transit.label}) ===\n${p.transit.positions}.`);
  if (p.aspects?.length) L.push(`\n=== Аспекты ===\n${p.aspects.join('; ')}.`);
  if (p.focus) L.push(`\nВ фокусе: ${p.focus}.`);

  L.push('\nПиши по-русски, ясно и по делу, переводи всё на бытовой язык — '
    + 'простыми словами, без заумных терминов. '
    + 'Дай цельную картину: главные темы, сильные и напряжённые места, на что обратить внимание.');
  return L.join('\n');
}
