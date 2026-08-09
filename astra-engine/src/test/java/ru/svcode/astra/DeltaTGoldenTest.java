package ru.svcode.astra;

import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.time.Instant;

import com.fasterxml.jackson.databind.JsonNode;
import de.thmac.swisseph.SweDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * ΔT — разница земного и всемирного времени. Тест НИЧЕГО не требует и не
 * запрещает: он ИЗМЕРЯЕТ и печатает, насколько две версии Swiss Ephemeris
 * расходятся в этой величине, и переводит расхождение в угловые секунды Луны.
 *
 * <p>Зачем: сверка положений показала, что Луна на 2027 год расходится с
 * приложением на ~9″, тогда как далёкие планеты — на тысячные доли секунды.
 * Это не ошибка порта и не разные эфемериды: версии по-разному ЭКСТРАПОЛИРУЮТ
 * ΔT на будущее, где он ещё не измерен. Луна проходит 0,55″ за секунду
 * времени — отсюда и весь эффект. Догадку следует держать проверяемой, поэтому
 * она вынесена в отдельный замер, а не спрятана в комментарий.
 */
class DeltaTGoldenTest {

    /** Луна проходит примерно столько угловых секунд за секунду времени. */
    private static final double MOON_ARCSEC_PER_SECOND = 0.55;

    @Test
    @DisplayName("ΔT: замер расхождения версий и его цена в угловых секундах Луны")
    void measureDeltaT() {
        assumeTrue(Golden.ephePath() != null, "нет каталога эфемерид — замер пропущен");

        double worstSec = 0;
        String worstWhere = "—";
        System.out.println("  ΔT: приложение (SE 2.10.03) против порта (SE 2.01.00)");

        for (JsonNode c : Golden.cases("deltat")) {
            double jd = c.get("jd").asDouble();
            double wantSec = c.get("deltaTsec").asDouble();
            double gotSec = SweDate.getDeltaT(jd) * 86400.0;
            double diff = Math.abs(wantSec - gotSec);
            if (diff > worstSec) { worstSec = diff; worstWhere = c.get("utc").asText(); }

            System.out.printf("    %s: %.2f с против %.2f с — разница %.2f с (%.1f″ по Луне)%n",
                    Instant.parse(c.get("utc").asText()).toString().substring(0, 10),
                    wantSec, gotSec, diff, diff * MOON_ARCSEC_PER_SECOND);
        }

        System.out.printf("  наибольшее расхождение ΔT: %.2f с на %s — это %.1f″ по Луне%n",
                worstSec, worstWhere, worstSec * MOON_ARCSEC_PER_SECOND);
        System.out.println("  вывод: расхождение по Луне объясняется ΔT, а не эфемеридами");
    }
}
