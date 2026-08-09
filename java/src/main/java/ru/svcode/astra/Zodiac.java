package ru.svcode.astra;

/**
 * Знак и градус по долготе — правило проекта: астролог читает «0°29′ Водолея»,
 * а не «300.4°». Перенос {@code signOf} из engine.ts.
 */
public final class Zodiac {
    private Zodiac() {}

    /** Знак зодиака: имя, глиф, градус внутри знака (0..30). */
    public record Sign(int index, String name, String glyph, double deg) {}

    public static Sign signOf(double lon) {
        int i = (int) (((Math.floor(lon / 30) % 12) + 12) % 12);
        double deg = ((lon % 30) + 30) % 30;
        return new Sign(i, Constants.ZODIAC.get(i), Constants.SIGN_GLYPH.get(i), deg);
    }

    /** «13°19′ Скорпион» — как это читает астролог. */
    public static String format(double lon) {
        Sign s = signOf(lon);
        int d = (int) Math.floor(s.deg());
        int m = (int) Math.floor((s.deg() - d) * 60);
        return String.format("%d°%02d′ %s", d, m, s.name());
    }
}
