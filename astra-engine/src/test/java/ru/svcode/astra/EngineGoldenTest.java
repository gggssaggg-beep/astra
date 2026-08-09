package ru.svcode.astra;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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
 * <p>Допуски (обоснование — в astra-engine/README.md): долготы 1e-6°, юлианские даты
 * 1e-9 суток, моменты времени ±1 секунда, орбис — как записан (он и в JS
 * округлён до сотых).
 *
 * <p>Если каталога эфемерид нет, тесты ПРОПУСКАЮТСЯ, а не падают: без файлов
 * SWIEPH сверять нечего, и зелёная сборка не должна это скрывать.
 */
class EngineGoldenTest {

    private static final double LON_EPS = 1e-6;
    private static final double JD_EPS = 1e-9;
    private static final long TIME_EPS_MS = 1000;

    private static SwissEphemeris eph;

    @BeforeAll
    static void open() {
        String path = Golden.ephePath();
        assumeTrue(path != null, "нет каталога эфемерид (astra.ephe) — парити пропущена");
        eph = new SwissEphemeris(path);
    }

    @Test
    @DisplayName("юлианские даты: туда и обратно, как в JS")
    void julianDates() {
        for (JsonNode c : Golden.cases("jd")) {
            Instant utc = Instant.parse(c.get("utc").asText());
            assertEquals(c.get("jd").asDouble(), eph.toJD(utc), JD_EPS, "JD для " + utc);
            Instant back = eph.fromJD(c.get("jd").asDouble());
            assertEquals(Instant.parse(c.get("backToUtc").asText()).toEpochMilli(),
                    back.toEpochMilli(), TIME_EPS_MS, "обратный перевод для " + utc);
        }
    }

    @Test
    @DisplayName("положения объектов: долгота, знак, градус, скорость, ретро")
    void positions() {
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
                assertEquals(want.get("lon").asDouble(), p.lon(), LON_EPS, "долгота " + who);
                assertEquals(want.get("sign").asText(), p.sign(), "знак " + who);
                assertEquals(want.get("degInSign").asDouble(), p.degInSign(), LON_EPS, "градус " + who);
                assertEquals(want.get("speed").asDouble(), p.speed(), 1e-5, "скорость " + who);
                assertEquals(want.get("retro").asBoolean(), p.retro(), "ретро " + who);
                n++;
            }
        }
        System.out.println("  положений сверено: " + n);
    }

    @Test
    @DisplayName("дома: куспиды, Asc и MC во всех системах и на всех широтах")
    void houses() {
        int n = 0, skipped = 0;
        for (JsonNode c : Golden.cases("houses")) {
            if (c.get("asc").isNull()) { skipped++; continue; }   // система недоступна и в JS
            double jd = eph.toJD(Instant.parse(c.get("utc").asText()));
            Ephemeris.Houses h = eph.houses(jd, c.get("lat").asDouble(),
                    c.get("lon").asDouble(), c.get("system").asText());
            String who = c.get("system").asText() + " @ " + c.get("why").asText();
            assertNotNull(h, "дома не посчитались: " + who);
            assertEquals(c.get("asc").asDouble(), h.asc(), LON_EPS, "Asc " + who);
            assertEquals(c.get("mc").asDouble(), h.mc(), LON_EPS, "MC " + who);
            for (int i = 0; i < 12; i++) {
                assertEquals(c.get("cusps").get(i).asDouble(), h.cusps()[i], LON_EPS,
                        "куспид " + (i + 1) + " " + who);
            }
            n++;
        }
        System.out.println("  систем домов сверено: " + n + (skipped > 0 ? ", пропущено " + skipped : ""));
    }

    @Test
    @DisplayName("аспекты суток: состав, орбис, интервал вход-точно-выход и порядок")
    void aspects() {
        int n = 0;
        for (JsonNode c : Golden.cases("aspects")) {
            Instant day = Instant.parse(c.get("day").asText() + "T00:00:00Z");
            Aspects.DayAspects got = Aspects.aspectsOn(eph, day);

            n += compare(c.get("slow"), got.slow(), "slow " + c.get("day").asText());
            n += compare(c.get("fast"), got.fast(), "fast " + c.get("day").asText());
            n += compare(c.get("moon"), got.moon(), "moon " + c.get("day").asText());
        }
        System.out.println("  аспектов сверено: " + n);
    }

    private int compare(JsonNode want, List<Aspects.AspectRecord> got, String where) {
        assertEquals(want.size(), got.size(), "число аспектов, " + where);
        for (int i = 0; i < want.size(); i++) {
            JsonNode w = want.get(i);
            Aspects.AspectRecord a = got.get(i);
            String who = where + " #" + i + " (" + w.get("p1").asText() + " "
                    + w.get("symbol").asText() + " " + w.get("p2").asText() + ")";
            // порядок значим: он и есть требование астролога
            assertEquals(w.get("p1").asText(), a.p1(), "первый объект пары, " + who);
            assertEquals(w.get("p2").asText(), a.p2(), "второй объект пары, " + who);
            assertEquals(w.get("aspect").asText(), a.aspect(), "аспект, " + who);
            assertEquals(w.get("exactOrb").asDouble(), a.exactOrb(), 0.011, "орбис, " + who);
            assertEquals(w.get("applying").asBoolean(), a.applying(), "сходится/расходится, " + who);
            assertEquals(w.get("pos1").asDouble(), a.pos1(), LON_EPS, "позиция 1, " + who);
            assertEquals(w.get("pos2").asDouble(), a.pos2(), LON_EPS, "позиция 2, " + who);
            assertTime(w.get("exactTime"), a.exactTime(), "точный момент, " + who);
            assertTime(w.get("beginTime"), a.beginTime(), "вход в орбис, " + who);
            assertTime(w.get("endTime"), a.endTime(), "выход из орбиса, " + who);
        }
        return want.size();
    }

    private void assertTime(JsonNode want, Instant got, String what) {
        if (want.isNull()) {
            assertEquals(null, got, what + " — в эталоне пусто");
            return;
        }
        assertNotNull(got, what + " — в эталоне есть, у нас нет");
        assertEquals(Instant.parse(want.asText()).toEpochMilli(), got.toEpochMilli(),
                TIME_EPS_MS, what);
    }
}
