package ru.svcode.astra;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Константы ядра — перенос 1-в-1 из {@code app/src/engine/constants.ts}
 * (а тот, в свою очередь, из питон-эталона). Тропический зодиак, мажорные
 * аспекты, истинные узлы.
 *
 * <p><b>Порядок здесь значим.</b> В JS объект обходится в порядке вставки, и на
 * этом держится правило астролога «объекты по удалённости от Солнца». Поэтому
 * все словари — {@link LinkedHashMap}, а множества — {@link LinkedHashSet}:
 * обычный HashMap молча переставил бы объекты и сломал порядок выдачи.
 */
public final class Constants {
    private Constants() {}

    public static final List<String> ZODIAC = List.of(
            "Овен", "Телец", "Близнецы", "Рак", "Лев", "Дева",
            "Весы", "Скорпион", "Стрелец", "Козерог", "Водолей", "Рыбы");

    public static final List<String> SIGN_GLYPH = List.of(
            "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓");

    public static final String MOON = "Луна";
    public static final String RAHU = "Раху";
    public static final String KETU = "Кету";

    /** Коды Swiss Ephemeris. */
    public static final int SE_SUN = 0, SE_MOON = 1, SE_MERCURY = 2, SE_VENUS = 3,
            SE_MARS = 4, SE_JUPITER = 5, SE_SATURN = 6, SE_URANUS = 7,
            SE_NEPTUNE = 8, SE_MEAN_NODE = 10, SE_TRUE_NODE = 11;

    /** Флаги расчёта: SWIEPH (полные файлы эфемерид) + скорость. */
    public static final int FLAG_SWIEPH = 2 | 256;
    /** MOSEPH — аналитическая теория, без файлов (запасной режим). */
    public static final int FLAG_MOSEPH = 4 | 256;

    /** Базовые объекты: имя → код Swiss Ephemeris. Порядок — от медленных к быстрым. */
    public static final Map<String, Integer> BODIES;
    static {
        Map<String, Integer> m = new LinkedHashMap<>();
        m.put("Нептун", SE_NEPTUNE);
        m.put("Уран", SE_URANUS);
        m.put("Сатурн", SE_SATURN);
        m.put("Юпитер", SE_JUPITER);
        m.put(RAHU, SE_TRUE_NODE);
        m.put("Марс", SE_MARS);
        m.put("Солнце", SE_SUN);
        m.put("Венера", SE_VENUS);
        m.put("Меркурий", SE_MERCURY);
        BODIES = Map.copyOf(m);
    }
    /** Тот же порядок отдельным списком: Map.copyOf порядок не хранит. */
    public static final List<String> BODY_ORDER = List.of(
            "Нептун", "Уран", "Сатурн", "Юпитер", RAHU, "Марс", "Солнце", "Венера", "Меркурий");

    /** Глифы объектов — для подписей. */
    public static final Map<String, String> PLANET_GLYPH;
    static {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("Солнце", "☉"); m.put("Луна", "☽"); m.put("Меркурий", "☿"); m.put("Венера", "♀");
        m.put("Марс", "♂"); m.put("Юпитер", "♃"); m.put("Сатурн", "♄"); m.put("Уран", "♅");
        m.put("Нептун", "♆"); m.put(RAHU, "☊"); m.put(KETU, "☋");
        PLANET_GLYPH = Map.copyOf(m);
    }

    /** Мажорный аспект: угол и символ. */
    public record AspectSpec(String name, double angle, String symbol) {}

    /** Пять мажорных аспектов В ТОМ ЖЕ ПОРЯДКЕ, что в JS. */
    public static final List<AspectSpec> ASPECTS = List.of(
            new AspectSpec("соединение", 0, "☌"),
            new AspectSpec("секстиль", 60, "⚹"),
            new AspectSpec("квадрат", 90, "□"),
            new AspectSpec("трин", 120, "△"),
            new AspectSpec("оппозиция", 180, "☍"));

    /** «Медленные» — деление аспектов на slow/fast. */
    public static final Set<String> SLOW = new LinkedHashSet<>(
            List.of("Нептун", "Уран", "Сатурн", "Юпитер", RAHU, "Хирон"));

    /**
     * Порядок по удалённости от Солнца (требование астролога): Солнце = центр и
     * идёт ПЕРВЫМ, перед Меркурием и Венерой. Луна (−1) ведёт свой блок.
     */
    private static final Map<String, Integer> SUN_RANK;
    static {
        Map<String, Integer> m = new LinkedHashMap<>();
        m.put("Луна", -1); m.put("Солнце", 0); m.put("Меркурий", 1); m.put("Венера", 2);
        m.put("Марс", 3); m.put("Юпитер", 4); m.put("Сатурн", 5); m.put("Уран", 6);
        m.put("Нептун", 7); m.put(RAHU, 8); m.put(KETU, 9);
        m.put("Хирон", 10); m.put("Церера", 11); m.put("Паллада", 12);
        m.put("Юнона", 13); m.put("Веста", 14); m.put("Лилит", 15);
        SUN_RANK = Map.copyOf(m);
    }

    public static int sunRank(String name) {
        return SUN_RANK.getOrDefault(name, 99);
    }
}
