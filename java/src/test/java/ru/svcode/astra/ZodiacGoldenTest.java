package ru.svcode.astra;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Знак и градус по долготе против золотого файла.
 *
 * <p>Эфемерид этот тест не требует — чистая арифметика, и именно поэтому он
 * ловит самую подлую разновидность ошибки порта: расхождение в остатке от
 * деления для отрицательных долгот и на границах знаков (0°, 30°, 359.9999°).
 */
class ZodiacGoldenTest {

    @Test
    @DisplayName("signOf: знак и градус совпадают с JS-движком на всех границах")
    void signsMatchGolden() {
        JsonNode cases = Golden.cases("signs");
        int n = 0;
        for (JsonNode c : cases) {
            double lon = c.get("lon").asDouble();
            Zodiac.Sign s = Zodiac.signOf(lon);
            assertEquals(c.get("sign").asText(), s.name(), "знак при lon=" + lon);
            assertEquals(c.get("deg").asDouble(), s.deg(), 1e-9, "градус при lon=" + lon);
            n++;
        }
        System.out.println("  знаков сверено: " + n);
    }

    @Test
    @DisplayName("угловая арифметика ведёт себя как в JS")
    void anglesBehaveLikeJs() {
        assertEquals(0, Angles.norm(360), 1e-12);
        assertEquals(359.5, Angles.norm(-0.5), 1e-12);
        assertEquals(-90, Angles.angdiff(0, 90), 1e-12);
        assertEquals(180, Angles.angdiff(180, 0), 1e-12);
        assertEquals(90, Angles.separation(350, 80), 1e-12);
    }
}
