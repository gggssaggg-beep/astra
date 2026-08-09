package ru.svcode.astra;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

import de.thmac.swisseph.SweConst;
import de.thmac.swisseph.SweDate;
import de.thmac.swisseph.SwissEph;

/**
 * Реализация {@link Ephemeris} поверх Java-порта Swiss Ephemeris (Томас Мак).
 *
 * <p>Никаких самодельных формул эфемерид — жёсткое правило проекта. Режим
 * SWIEPH: считаем по полным файлам эфемерид из каталога {@code ephe/}, тем же,
 * что лежат в приложении.
 *
 * <p><b>Лицензия.</b> Swiss Ephemeris распространяется под AGPL либо по платной
 * коммерческой лицензии Astrodienst; Java-порт наследует то же условие. Проект,
 * который подключает эту библиотеку, обязан соблюдать одно из двух — см.
 * {@code java/README.md}.
 */
public final class SwissEphemeris implements Ephemeris, AutoCloseable {

    private final SwissEph swe;
    private final int flags;

    /** @param ephePath каталог с файлами эфемерид (наш {@code ephe/}) */
    public SwissEphemeris(String ephePath) {
        this.swe = new SwissEph(ephePath);
        this.flags = Constants.FLAG_SWIEPH;
    }

    /** Режим без файлов эфемерид — только для сверки, точность ниже. */
    public static SwissEphemeris moshier() {
        return new SwissEphemeris(null, Constants.FLAG_MOSEPH);
    }

    private SwissEphemeris(String ephePath, int flags) {
        this.swe = new SwissEph(ephePath);
        this.flags = flags;
    }

    @Override
    public double toJD(Instant utc) {
        ZonedDateTime z = utc.atZone(ZoneOffset.UTC);
        double hours = z.getHour() + z.getMinute() / 60.0 + z.getSecond() / 3600.0
                + z.getNano() / 3.6e12;
        return SweDate.getJulDay(z.getYear(), z.getMonthValue(), z.getDayOfMonth(), hours,
                SweDate.SE_GREG_CAL);
    }

    @Override
    public Instant fromJD(double jd) {
        SweDate d = new SweDate(jd, SweDate.SE_GREG_CAL);
        double h = d.getHour();
        int hh = (int) Math.floor(h);
        int mm = (int) Math.floor((h - hh) * 60);
        double secF = ((h - hh) * 60 - mm) * 60;
        int ss = (int) Math.floor(secF);
        int ms = (int) Math.round((secF - ss) * 1000);
        if (ms == 1000) { ms = 0; ss++; }   // округление секунд не должно давать 1000 мс
        return ZonedDateTime.of(d.getYear(), d.getMonth(), d.getDay(), hh, mm, ss,
                ms * 1_000_000, ZoneOffset.UTC).toInstant();
    }

    /** Долгота объекта. Кету — узел плюс 180°, как во всём проекте. */
    @Override
    public double lon(double jd, String name) {
        return lonSpeed(jd, name)[0];
    }

    @Override
    public double[] lonSpeed(double jd, String name) {
        boolean ketu = Constants.KETU.equals(name);
        String target = ketu ? Constants.RAHU : name;
        Integer code = Constants.MOON.equals(target) ? Constants.SE_MOON : Constants.BODIES.get(target);
        if (code == null) throw new IllegalArgumentException("нет такого объекта: " + name);

        double[] xx = new double[6];
        StringBuffer err = new StringBuffer();
        int rc = swe.swe_calc_ut(jd, code, flags, xx, err);
        if (rc < 0) throw new IllegalStateException("swe_calc_ut: " + err);
        double l = ketu ? Angles.norm(xx[0] + 180) : Angles.norm(xx[0]);
        return new double[]{l, xx[3]};
    }

    @Override
    public List<BodyPosition> positions(Instant utc, List<String> names) {
        double jd = toJD(utc);
        List<BodyPosition> out = new ArrayList<>(names.size());
        for (String n : names) {
            double[] ls = lonSpeed(jd, n);
            Zodiac.Sign s = Zodiac.signOf(ls[0]);
            out.add(new BodyPosition(n, Constants.PLANET_GLYPH.getOrDefault(n, "•"),
                    ls[0], s.name(), s.glyph(), s.deg(), ls[1], ls[1] < 0));
        }
        return out;
    }

    /** Буква системы домов для swe_houses; наши id — как в настройках Astra. */
    static char houseChar(String system) {
        return switch (system) {
            case "placidus" -> 'P';
            case "koch" -> 'K';
            case "porphyry" -> 'O';
            case "regiomontanus" -> 'R';
            case "campanus" -> 'C';
            case "equalAsc" -> 'A';
            case "equalMC" -> 'D';
            case "wholeSign" -> 'W';
            case "horizontal" -> 'H';   // горизонтальная (вертексная) — наш дефолт
            default -> 'P';
        };
    }

    @Override
    public Houses houses(double jd, double lat, double lon, String system) {
        double[] cusps = new double[13];
        double[] ascmc = new double[10];
        int rc = swe.swe_houses(jd, flags, lat, lon, houseChar(system), cusps, ascmc);
        if (rc < 0) return null;
        double[] out = new double[12];
        System.arraycopy(cusps, 1, out, 0, 12);   // порт нумерует куспиды с 1
        return new Houses(out, ascmc[0], ascmc[1]);
    }

    /**
     * Аудит элонгаций — та же страховка, что в JS: Меркурий дальше ~28° от
     * Солнца или Венера дальше ~48° означают, что расчёт сломан, а не что небо
     * необычное.
     */
    @Override
    public List<String> audit(double jd) {
        List<String> out = new ArrayList<>();
        double sun = lon(jd, "Солнце");
        double me = Angles.separation(lon(jd, "Меркурий"), sun);
        double ve = Angles.separation(lon(jd, "Венера"), sun);
        if (me > 28.5) out.add(String.format("Меркурий в %.1f° от Солнца — больше предела 28°", me));
        if (ve > 48.5) out.add(String.format("Венера в %.1f° от Солнца — больше предела 48°", ve));
        return out;
    }

    @Override
    public void close() {
        swe.swe_close();
    }

    /** Прямой доступ к порту — для расширений, которых пока нет в интерфейсе. */
    public SwissEph raw() {
        return swe;
    }

    @SuppressWarnings("unused")
    private static final int UNUSED_KEEPS_IMPORT = SweConst.SEFLG_SWIEPH;
}
