package ru.svcode.astra;

/**
 * Угловая арифметика — та же, что в JS-движке, буква в букву.
 *
 * <p>Про остаток от деления: в Java, как и в JS, {@code %} даёт остаток со
 * знаком делимого (это <i>remainder</i>, а не математический модуль), поэтому
 * формула {@code ((x % 360) + 360) % 360} переносится дословно и ведёт себя
 * одинаково для отрицательных долгот. Это проверено золотым файлом
 * {@code signs.json}, где есть случай −0.5°.
 */
public final class Angles {
    private Angles() {}

    /** Долгота в [0, 360). */
    public static double norm(double x) {
        return ((x % 360) + 360) % 360;
    }

    /** Разность углов в (−180, 180]: со знаком, кратчайшая дуга. */
    public static double angdiff(double a, double b) {
        double d = ((a - b) % 360 + 360) % 360;
        return d > 180 ? d - 360 : d;
    }

    /** Расстояние между долготами, 0..180 (без знака). */
    public static double separation(double a, double b) {
        return Math.abs(angdiff(a, b));
    }
}
