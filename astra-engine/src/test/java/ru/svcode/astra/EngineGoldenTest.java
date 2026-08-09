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

    /**
     * Разница DeltaT между версиями — ИЗМЕРЕНА, а не назначена: до 14,4 секунды
     * на будущих датах (см. DeltaTGoldenTest, там же печатается сам замер).
     */
    private static final double DELTA_T_DAYS = 14.4 / 86400.0;

    /**
     * Допуск по объекту = сколько он проходит за эту разницу DeltaT, плюс
     * полуторный запас и шум арифметики.
     *
     * <p>Это главная мысль всей сверки: расхождение с приложением не
     * произвольное, оно РОВНО такое, какое даёт разное DeltaT. Поэтому у Луны
     * допуск в триста раз шире, чем у Нептуна, — не потому что «Луна плохо
     * считается», а потому что за одну и ту же секунду она проходит в триста
     * раз большую дугу. Вылезло за эту границу — значит дело уже НЕ в DeltaT,
     * и это настоящая ошибка порта.
     */
    private static double tolFor(String body) {
        return maxSpeed(body) * DELTA_T_DAYS * 1.5 + VERSION_NOISE;
    }

    /**
     * Второе слагаемое допуска: разница самих алгоритмов между версиями 2.01 и
     * 2.10, помимо сдвига времени. Тоже измерена, а не выдумана — по всему
     * набору она не превышает 1,3e-4° (куспиды Плацидуса в Рейкьявике) и 1,1e-4°
     * (истинный узел, у которого алгоритм в 2.10 уточняли). Берём 2e-4° = 0,72″
     * с запасом.
     *
     * <p>Проверка, что это не подгонка: у истинного узла сдвиг от ΔT составляет
     * 4,0e-5° (замерено прямой подстановкой времени), а расхождение с
     * приложением — 1,1e-4°. Разница между ними и есть алгоритмическая, и она
     * того же порядка, что у куспидов.
     */
    private static final double VERSION_NOISE = 2e-4;

    /** Наибольшая суточная скорость объекта, градусов в сутки (округлено вверх). */
    private static double maxSpeed(String body) {
        return switch (body) {
            case "Луна" -> 15.4;
            case "Меркурий" -> 2.2;
            case "Венера" -> 1.3;
            case "Солнце" -> 1.02;
            case "Марс" -> 0.8;
            case "Юпитер" -> 0.25;
            case "Сатурн" -> 0.14;
            case "Уран" -> 0.06;
            case "Нептун" -> 0.04;
            // у ИСТИННОГО узла мгновенная скорость не средняя (0,05): он
            // колеблется вокруг среднего, и на замере даёт до −0,24 °/сут
            case "Раху", "Кету" -> 0.5;
            default -> 1.0;
        };
    }

    /** Куспиды считаются из UT напрямую, DeltaT на них не влияет — тут чистая разница версий. */
    private static final double HOUSE_TOL = 1e-3;
    /** Скорости, градусов в сутки. */
    private static final double SPEED_TOL = 1e-4;
    /** Юлианские даты — арифметика календаря, совпадение обязано быть точным. */
    private static final double JD_TOL = 1e-9;
    /**
     * ТОЧНЫЙ момент аспекта — задача хорошо обусловленная: функция пересекает
     * ноль поперёк, и сдвиг долготы на доли секунды двигает корень на секунды.
     */
    private static final long EXACT_TOL_MS = 30_000;

    /**
     * ГРАНИЦЫ окна орбиса — задача плохо обусловленная, и это свойство самой
     * задачи, а не порта. У медленной пары расстояние подходит к орбису почти
     * по касательной: сотые доли угловой секунды сдвигают точку пересечения на
     * минуты, а у колеблющегося узла могут вообще выбрать соседнее пересечение.
     * Само окно при этом длится НЕДЕЛИ, так что цена вопроса нулевая.
     * Замер: Нептун ☍ Раху разошёлся на 9,9 минуты при точном моменте в норме.
     */
    private static final long EDGE_SLOW_TOL_MS = 6 * 3600_000L;
    /** У быстрых пар и Луны подход к орбису крутой — тут спрос строгий. */
    private static final long EDGE_FAST_TOL_MS = 5 * 60_000L;

    private static SwissEphemeris eph;

    @BeforeAll
    static void open() {
        String path = Golden.ephePath();
        assumeTrue(path != null, "нет каталога эфемерид (astra.ephe) — парити пропущена");
        eph = new SwissEphemeris(path);
    }

    /**
     * Копит расхождения по разделу. У каждого сравнения СВОЙ допуск (у Луны он
     * шире, чем у Нептуна), поэтому итог меряется отношением к допуску:
     * «во сколько раз вылезли». Печатается всегда — цифра должна быть на виду.
     */
    private static final class Dev {
        private final String what;
        private double maxAbs, worstRatio;
        private String where = "—";
        Dev(String what) { this.what = what; }

        void put(double want, double got, double tol, String where) {
            double d = Math.abs(want - got);
            if (d > maxAbs) maxAbs = d;
            double ratio = d / tol;
            if (ratio > worstRatio) { worstRatio = ratio; this.where = where; }
        }

        void report() {
            System.out.printf("  %s: максимум %.3e, это %.0f%% допуска — %s%n",
                    what, maxAbs, worstRatio * 100, where);
            assertTrue(worstRatio <= 1.0, String.format(
                    "%s вылезло за допуск в %.1f раза — %s (расхождение %.3e). "
                    + "Разницей DeltaT это уже не объясняется, ищи ошибку порта",
                    what, worstRatio, where, maxAbs));
        }
    }

    @Test
    @DisplayName("юлианские даты: туда и обратно, как в JS")
    void julianDates() {
        Dev jd = new Dev("юлианская дата");
        Dev back = new Dev("обратный перевод, мс");
        for (JsonNode c : Golden.cases("jd")) {
            Instant utc = Instant.parse(c.get("utc").asText());
            jd.put(c.get("jd").asDouble(), eph.toJD(utc), JD_TOL, "" + utc);
            back.put(Instant.parse(c.get("backToUtc").asText()).toEpochMilli(),
                    eph.fromJD(c.get("jd").asDouble()).toEpochMilli(), 2000, "" + utc);
        }
        jd.report();
        back.report();
    }

    @Test
    @DisplayName("положения объектов: долгота, знак, градус, скорость, ретро")
    void positions() {
        Dev lon = new Dev("долготы"), speed = new Dev("скорости");
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
                lon.put(want.get("lon").asDouble(), p.lon(), tolFor(p.name()), who);
                speed.put(want.get("speed").asDouble(), p.speed(), SPEED_TOL, who);
                // знак и ретроградность — качественные, обязаны совпадать ТОЧНО
                assertEquals(want.get("sign").asText(), p.sign(), "знак " + who);
                assertEquals(want.get("retro").asBoolean(), p.retro(), "ретро " + who);
                n++;
            }
        }
        System.out.println("  положений сверено: " + n);
        lon.report();
        speed.report();
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
            cusp.put(c.get("asc").asDouble(), h.asc(), HOUSE_TOL, "Asc " + who);
            cusp.put(c.get("mc").asDouble(), h.mc(), HOUSE_TOL, "MC " + who);
            for (int i = 0; i < 12; i++) {
                cusp.put(c.get("cusps").get(i).asDouble(), h.cusps()[i], HOUSE_TOL,
                        "куспид " + (i + 1) + " " + who);
            }
            n++;
        }
        System.out.println("  систем домов сверено: " + n + (skipped > 0 ? ", пропущено " + skipped : ""));
        cusp.report();
    }

    @Test
    @DisplayName("аспекты суток: состав, орбис, интервал вход-точно-выход и порядок")
    void aspects() {
        Dev pos = new Dev("позиции в аспекте"), orbDev = new Dev("орбис");
        Dev exact = new Dev("точные моменты, мс"), edge = new Dev("границы окна орбиса, мс");
        int n = 0;
        for (JsonNode c : Golden.cases("aspects")) {
            Instant day = Instant.parse(c.get("day").asText() + "T00:00:00Z");
            Aspects.DayAspects got = Aspects.aspectsOn(eph, day);
            n += compare(c.get("slow"), got.slow(), "slow " + c.get("day").asText(), pos, orbDev, exact, edge);
            n += compare(c.get("fast"), got.fast(), "fast " + c.get("day").asText(), pos, orbDev, exact, edge);
            n += compare(c.get("moon"), got.moon(), "moon " + c.get("day").asText(), pos, orbDev, exact, edge);
        }
        System.out.println("  аспектов сверено: " + n);
        pos.report();
        orbDev.report();
        exact.report();
        edge.report();
    }

    private int compare(JsonNode want, List<Aspects.AspectRecord> got, String where,
                        Dev pos, Dev orbDev, Dev exact, Dev edge) {
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
            // орбис считается из тех же долгот: его допуск — сумма допусков пары
            orbDev.put(w.get("exactOrb").asDouble(), a.exactOrb(),
                    tolFor(a.p1()) + tolFor(a.p2()) + 0.011, who);
            // позиция Луны сверяется своим допуском — причина та же, ΔT
            pos.put(w.get("pos1").asDouble(), a.pos1(), tolFor(a.p1()), who);
            pos.put(w.get("pos2").asDouble(), a.pos2(), tolFor(a.p2()), who);
            // Обусловленность границы определяется РЕАЛЬНОЙ скоростью пары, а не
            // корзиной показа: в корзинах Кету не считается медленным (его нет в
            // списке SLOW у движка), хотя движется он медленнее всех. Пара
            // Нептун ☌ Кету на этом и попалась.
            double fastest = Math.max(maxSpeed(a.p1()), maxSpeed(a.p2()));
            long edgeTol = fastest < 1.0 ? EDGE_SLOW_TOL_MS : EDGE_FAST_TOL_MS;
            putTime(exact, w.get("exactTime"), a.exactTime(), EXACT_TOL_MS, "точный момент, " + who);
            putTime(edge, w.get("beginTime"), a.beginTime(), edgeTol, "вход в орбис, " + who);
            putTime(edge, w.get("endTime"), a.endTime(), edgeTol, "выход из орбиса, " + who);
        }
        return want.size();
    }

    private void putTime(Dev dev, JsonNode want, Instant got, long tol, String what) {
        if (want.isNull()) {
            assertEquals(null, got, what + " — в эталоне пусто");
            return;
        }
        assertNotNull(got, what + " — в эталоне есть, у нас нет");
        dev.put(Instant.parse(want.asText()).toEpochMilli(), got.toEpochMilli(), tol, what);
    }
}
