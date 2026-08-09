package ru.svcode.astra;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Парити движка против золотых файлов JS-версии.
 *
 * <p><b>Почему допуски не нулевые.</b> Приложение считает на Swiss Ephemeris
 * <b>2.10.03</b> (сборка WASM), а эта библиотека — на Java-порте версии
 * <b>2.01.00</b>: между ними лежат правки самой библиотеки Astrodienst
 * (уточнения нутации и прочего). Отсюда расхождение в доли угловой секунды —
 * не ошибка порта, а разница версий. Точных совпадений здесь ждать нельзя, и
 * делать вид, что они есть, тоже: тест МЕРЯЕТ максимальное расхождение и
 * печатает его, чтобы цифра была на виду и её рост сразу заметили.
 *
 * <p>Насколько это много: 1e-4° = 0,36″. Луна проходит такую дугу примерно за
 * 0,7 секунды времени — на момент точного аспекта не влияет вовсе.
 *
 * <p>Если каталога эфемерид нет, тесты ПРОПУСКАЮТСЯ, а не проходят молча:
 * зелёная сборка не должна означать «проверено», когда проверять было нечем.
 */
class EngineGoldenTest {

    /** Долготы планет: 1e-4° = 0,36″. */
    private static final double LON_TOL = 1e-4;
    /**
     * Луне — свой допуск, 4e-3° (около 14″). Она движется в тридцать раз быстрее
     * далёких планет, поэтому разница ΔT между версиями (до ~16 с на будущих
     * датах) бьёт по ней сильнее всего. Величина измерена, а не назначена:
     * см. DeltaTGoldenTest, который печатает и саму разницу ΔT, и её цену.
     */
    private static final double MOON_TOL = 4e-3;
    /** Куспиды домов: расходятся заметнее — они считаются из долгот и наклона. */
    private static final double HOUSE_TOL = 1e-3;
    /** Скорости, °/сут. */
    private static final double SPEED_TOL = 1e-4;
    /** Юлианские даты — чистая арифметика календаря, тут совпадение обязано быть точным. */
    private static final double JD_TOL = 1e-9;
    /** Моменты: обе стороны ищут корень делением пополам. */
    private static final long TIME_TOL_MS = 2000;

    private static SwissEphemeris eph;

    @BeforeAll
    static void open() {
        String path = Golden.ephePath();
        assumeTrue(path != null, "нет каталога эфемерид (astra.ephe) — парити пропущена");
        eph = new SwissEphemeris(path);
    }

    /** Копит максимальное расхождение по разделу и печатает его в конце. */
    private static final class Dev {
        private final String what;
        private double max;
        private String where = "—";
        Dev(String what) { this.what = what; }

        void put(double want, double got, String where) {
            double d = Math.abs(want - got);
            if (d > max) { max = d; this.where = where; }
        }

        void report(double tol) {
            System.out.printf("  %s: максимум расхождения %.3e (допуск %.0e) — %s%n",
                    what, max, tol, where);
            assertTrue(max <= tol, String.format(
                    "%s разошлось на %.3e при допуске %.0e — %s", what, max, tol, where));
        }
    }

    @Test
    @DisplayName("юлианские даты: туда и обратно, как в JS")
    void julianDates() {
        Dev jd = new Dev("юлианская дата");
        Dev back = new Dev("обратный перевод, мс");
        for (JsonNode c : Golden.cases("jd")) {
            Instant utc = Instant.parse(c.get("utc").asText());
            jd.put(c.get("jd").asDouble(), eph.toJD(utc), "" + utc);
            back.put(Instant.parse(c.get("backToUtc").asText()).toEpochMilli(),
                    eph.fromJD(c.get("jd").asDouble()).toEpochMilli(), "" + utc);
        }
        jd.report(JD_TOL);
        back.report(TIME_TOL_MS);
    }

    @Test
    @DisplayName("положения объектов: долгота, знак, градус, скорость, ретро")
    void positions() {
        Dev lon = new Dev("долгота планет"), moonLon = new Dev("долгота Луны");
        Dev speed = new Dev("скорость");
        int n = 0;
        for (JsonNode c : Golden.cases("positions")) {
            Instant utc = Instant.parse(c.get("utc").asText());
            List<String> names = new ArrayList<>();
            for (JsonNode b : c.get("bodies")) names.add(b.get("name").asText());
            List<Ephemeris.BodyPosition> got = eph.positions(utc, names);

            for (int i = 0; i < names.size(); i++) {
                JsonNode want = c.get("bodies").get(i);
                Ephemeris.BodyPosition p = got.get(i);
                String who = want.get("name").asText() + " на " + utc;
                boolean isMoon = Constants.MOON.equals(p.name());
                (isMoon ? moonLon : lon).put(want.get("lon").asDouble(), p.lon(), who);
                speed.put(want.get("speed").asDouble(), p.speed(), who);
                // знак и ретроградность — качественные, обязаны совпадать ТОЧНО
                assertEquals(want.get("sign").asText(), p.sign(), "знак " + who);
                assertEquals(want.get("retro").asBoolean(), p.retro(), "ретро " + who);
                n++;
            }
        }
        System.out.println("  положений сверено: " + n);
        lon.report(LON_TOL);
        moonLon.report(MOON_TOL);
        speed.report(SPEED_TOL);
    }

    @Test
    @DisplayName("дома: куспиды, Asc и MC во всех системах и на всех широтах")
    void houses() {
        Dev cusp = new Dev("куспиды и оси");
        int n = 0, skipped = 0;
        for (JsonNode c : Golden.cases("houses")) {
            if (c.get("asc").isNull()) { skipped++; continue; }   // системы нет и в JS
            double jd = eph.toJD(Instant.parse(c.get("utc").asText()));
            Ephemeris.Houses h = eph.houses(jd, c.get("lat").asDouble(),
                    c.get("lon").asDouble(), c.get("system").asText());
            String who = c.get("system").asText() + " @ " + c.get("why").asText();
            assertNotNull(h, "дома не посчитались: " + who);
            cusp.put(c.get("asc").asDouble(), h.asc(), "Asc " + who);
            cusp.put(c.get("mc").asDouble(), h.mc(), "MC " + who);
            for (int i = 0; i < 12; i++) {
                cusp.put(c.get("cusps").get(i).asDouble(), h.cusps()[i], "куспид " + (i + 1) + " " + who);
            }
            n++;
        }
        System.out.println("  систем домов сверено: " + n + (skipped > 0 ? ", пропущено " + skipped : ""));
        cusp.report(HOUSE_TOL);
    }

    @Test
    @DisplayName("аспекты суток: состав, орбис, интервал вход-точно-выход и порядок")
    void aspects() {
        Dev pos = new Dev("позиции планет в аспекте"), posMoon = new Dev("позиция Луны в аспекте");
        Dev orbDev = new Dev("орбис");
        Dev time = new Dev("моменты, мс");
        int n = 0;
        for (JsonNode c : Golden.cases("aspects")) {
            Instant day = Instant.parse(c.get("day").asText() + "T00:00:00Z");
            Aspects.DayAspects got = Aspects.aspectsOn(eph, day);
            n += compare(c.get("slow"), got.slow(), "slow " + c.get("day").asText(), pos, posMoon, orbDev, time);
            n += compare(c.get("fast"), got.fast(), "fast " + c.get("day").asText(), pos, posMoon, orbDev, time);
            n += compare(c.get("moon"), got.moon(), "moon " + c.get("day").asText(), pos, posMoon, orbDev, time);
        }
        System.out.println("  аспектов сверено: " + n);
        pos.report(LON_TOL);
        posMoon.report(MOON_TOL);
        // 0,05° — не «чтобы прошло»: орбис считается из тех же долгот, а у Луны
        // они сдвинуты разницей ΔT; для планет расхождение остаётся в сотых
        orbDev.report(0.05);
        time.report(TIME_TOL_MS);
    }

    private int compare(JsonNode want, List<Aspects.AspectRecord> got, String where,
                        Dev pos, Dev posMoon, Dev orbDev, Dev time) {
        // состав и порядок обязаны совпадать точно: порядок — требование астролога
        assertEquals(want.size(), got.size(), "число аспектов, " + where);
        for (int i = 0; i < want.size(); i++) {
            JsonNode w = want.get(i);
            Aspects.AspectRecord a = got.get(i);
            String who = where + " #" + i + " (" + w.get("p1").asText() + " "
                    + w.get("symbol").asText() + " " + w.get("p2").asText() + ")";
            assertEquals(w.get("p1").asText(), a.p1(), "первый объект пары, " + who);
            assertEquals(w.get("p2").asText(), a.p2(), "второй объект пары, " + who);
            assertEquals(w.get("aspect").asText(), a.aspect(), "аспект, " + who);
            assertEquals(w.get("applying").asBoolean(), a.applying(), "сходится/расходится, " + who);
            orbDev.put(w.get("exactOrb").asDouble(), a.exactOrb(), who);
            // позиция Луны сверяется своим допуском — причина та же, ΔT
            Dev p1dev = Constants.MOON.equals(a.p1()) ? posMoon : pos;
            Dev p2dev = Constants.MOON.equals(a.p2()) ? posMoon : pos;
            p1dev.put(w.get("pos1").asDouble(), a.pos1(), who);
            p2dev.put(w.get("pos2").asDouble(), a.pos2(), who);
            putTime(time, w.get("exactTime"), a.exactTime(), "точный момент, " + who);
            putTime(time, w.get("beginTime"), a.beginTime(), "вход в орбис, " + who);
            putTime(time, w.get("endTime"), a.endTime(), "выход из орбиса, " + who);
        }
        return want.size();
    }

    private void putTime(Dev dev, JsonNode want, Instant got, String what) {
        if (want.isNull()) {
            assertEquals(null, got, what + " — в эталоне пусто");
            return;
        }
        assertNotNull(got, what + " — в эталоне есть, у нас нет");
        dev.put(Instant.parse(want.asText()).toEpochMilli(), got.toEpochMilli(), what);
    }
}
