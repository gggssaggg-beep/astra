package ru.svcode.astra;

import java.time.Instant;
import java.util.List;

/**
 * Поставщик эфемерид — ровно тот же интерфейс, что {@code Engine} в JS
 * (правило ТЗ §2.3: расчёт спрятан за интерфейсом функций, вся логика выше
 * от него не зависит).
 *
 * <p>Благодаря этому слою прикладной код (аспекты, дома, события, фигуры)
 * тестируется и переносится независимо от того, кто именно считает положения:
 * Swiss Ephemeris, запись из золотого файла или другой поставщик.
 */
public interface Ephemeris {

    /** Юлианская дата (UT) для момента. */
    double toJD(Instant utc);

    /** Момент по юлианской дате. */
    Instant fromJD(double jd);

    /** Эклиптическая долгота объекта, ° (Кету = узел + 180). */
    double lon(double jd, String name);

    /** Долгота и скорость, °/сут. */
    double[] lonSpeed(double jd, String name);

    /** Положения объектов на момент: имя, знак, градус, скорость, ретро. */
    List<BodyPosition> positions(Instant utc, List<String> names);

    /** Дома: 12 куспидов + Asc/MC. null — система недоступна для этих координат. */
    Houses houses(double jd, double lat, double lon, String system);

    /** Аудит элонгаций: Меркурий ≤28°, Венера ≤48° — иначе расчёт сломан. */
    List<String> audit(double jd);

    /** Положение объекта на момент. */
    record BodyPosition(String name, String glyph, double lon, String sign,
                        String signGlyph, double degInSign, double speed, boolean retro) {}

    /** Куспиды домов. cusps[0] — первый дом. */
    record Houses(double[] cusps, double asc, double mc) {}
}
