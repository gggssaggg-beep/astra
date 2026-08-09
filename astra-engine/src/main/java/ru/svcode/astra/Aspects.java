package ru.svcode.astra;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.function.DoubleUnaryOperator;
import java.util.function.ToDoubleFunction;

/**
 * Аспекты на сутки — перенос 1-в-1 из {@code app/src/engine/aspects.ts}
 * (а тот — из питон-эталона {@code daily_aspects_astro.py}).
 *
 * <p><b>Главное правило проекта:</b> аспект — это ИНТЕРВАЛ (вход в орбис →
 * точный момент → выход), а не «весь день». Окно может выходить за границы
 * суток, и это нормально.
 *
 * <p>Для соединения и оппозиции точный момент ищется по ЗНАКОВОЙ функции:
 * величина |sep| − target у 0° и 180° лишь касается нуля, не меняя знака, и
 * деление пополам по ней ничего не находит.
 */
public final class Aspects {
    private Aspects() {}

    /** Корзина аспекта: с Луной, между медленными, прочее. */
    public enum Bucket { SLOW, FAST, MOON }

    /** Один аспект суток со своим окном орбиса. */
    public record AspectRecord(
            String p1, String p2, String aspect, String symbol,
            double exactOrb, Instant exactTime, Instant beginTime, Instant endTime,
            boolean applying, double pos1, double pos2, Bucket bucket) {}

    /** Аспекты суток, разложенные по корзинам. */
    public record DayAspects(Instant date, List<AspectRecord> slow, List<AspectRecord> fast,
                             List<AspectRecord> moon, List<String> audit) {}

    /** Орбис по умолчанию — 1°, настраивается индивидуально по объекту. */
    public static DayAspects aspectsOn(Ephemeris E, Instant dayStart) {
        return aspectsOn(E, dayStart, name -> 1.0, true, null);
    }

    /**
     * Все мажорные аспекты на сутки, начинающиеся в момент {@code dayStart}.
     *
     * @param orb          орбис объекта; для пары берётся БОЛЬШИЙ из двух
     * @param includeMoon  включать ли Луну (у неё своя корзина)
     * @param objects      тумблеры объектов; null — все базовые
     */
    public static DayAspects aspectsOn(Ephemeris E, Instant dayStart,
                                       ToDoubleFunction<String> orb, boolean includeMoon,
                                       List<String> objects) {
        final double jd0 = E.toJD(dayStart);
        final double jd1 = jd0 + 1;
        final double jdNoon = jd0 + 0.5;

        // порядок имён важен: он определяет порядок пар и в конечном счёте выдачу
        List<String> names = new ArrayList<>();
        if (includeMoon) names.add(Constants.MOON);
        names.addAll(Constants.BODY_ORDER);
        names.add(Constants.KETU);
        if (objects != null) {
            var on = new LinkedHashSet<>(objects);
            names.removeIf(n -> !on.contains(n));
        }

        // Сетка долгот по часам суток. В JS это спасало от 16 500 вызовов WASM;
        // здесь — та же математика на тех же точках, иначе минимум орбиса может
        // сойтись в другой момент и разойтись с эталоном.
        List<Double> grid = new ArrayList<>();
        for (double jd = jd0; jd <= jd1 + 1e-9; jd += 1.0 / 24) grid.add(jd);
        Map<String, double[]> gridLon = new HashMap<>();
        java.util.function.Function<String, double[]> lonsOf = n -> gridLon.computeIfAbsent(n, k -> {
            double[] arr = new double[grid.size()];
            for (int i = 0; i < arr.length; i++) arr[i] = E.lon(grid.get(i), k);
            return arr;
        });

        List<AspectRecord> slow = new ArrayList<>(), fast = new ArrayList<>(), moon = new ArrayList<>();

        for (int i = 0; i < names.size(); i++) {
            for (int jx = i + 1; jx < names.size(); jx++) {
                final String n1 = names.get(i), n2 = names.get(jx);
                // Раху и Кету всегда строго напротив — это ось, а не аспект
                if ((n1.equals(Constants.RAHU) && n2.equals(Constants.KETU))
                        || (n1.equals(Constants.KETU) && n2.equals(Constants.RAHU))) continue;

                final double pairOrb = Math.max(orb.applyAsDouble(n1), orb.applyAsDouble(n2));
                final double[] L1 = lonsOf.apply(n1), L2 = lonsOf.apply(n2);

                for (Constants.AspectSpec spec : Constants.ASPECTS) {
                    double minOrb = Double.NaN, minJd = jdNoon;
                    for (int k = 0; k < grid.size(); k++) {
                        double o = Math.abs(Math.abs(Angles.angdiff(L1[k], L2[k])) - spec.angle());
                        if (Double.isNaN(minOrb) || o < minOrb) { minOrb = o; minJd = grid.get(k); }
                    }
                    if (Double.isNaN(minOrb) || minOrb > pairOrb) continue;

                    Double exactJd = exactTime(E, n1, n2, spec.angle(), jd0, jd1);

                    double sepA = Angles.separation(E.lon(minJd, n1), E.lon(minJd, n2));
                    double sepB = Angles.separation(E.lon(minJd + 0.01, n1), E.lon(minJd + 0.01, n2));
                    boolean applying = Math.abs(sepB - spec.angle()) < Math.abs(sepA - spec.angle());

                    DoubleUnaryOperator m = orbDistance(E, n1, n2, spec.angle());
                    double rel = E.lonSpeed(minJd, n1)[1] - E.lonSpeed(minJd, n2)[1];
                    Double beginJd = orbEdge(m, pairOrb, minJd, rel, -1);
                    Double endJd = orbEdge(m, pairOrb, minJd, rel, +1);

                    // внутри пары первой — более близкая к Солнцу (= более быстрая)
                    boolean swap = Constants.sunRank(n1) > Constants.sunRank(n2);
                    String a1 = swap ? n2 : n1, a2 = swap ? n1 : n2;

                    Bucket bucket = (n1.equals(Constants.MOON) || n2.equals(Constants.MOON)) ? Bucket.MOON
                            : (Constants.SLOW.contains(n1) && Constants.SLOW.contains(n2)) ? Bucket.SLOW
                            : Bucket.FAST;

                    AspectRecord rec = new AspectRecord(
                            a1, a2, spec.name(), spec.symbol(),
                            Math.round(minOrb * 100) / 100.0,
                            exactJd == null ? null : E.fromJD(exactJd),
                            beginJd == null ? null : E.fromJD(beginJd),
                            endJd == null ? null : E.fromJD(endJd),
                            applying, E.lon(minJd, a1), E.lon(minJd, a2), bucket);

                    (bucket == Bucket.MOON ? moon : bucket == Bucket.SLOW ? slow : fast).add(rec);
                }
            }
        }

        // Вертикальный порядок (требование астролога): сверху пары, которые ведёт
        // более быстрый объект; при равенстве — по теснотe орбиса.
        Comparator<AspectRecord> byRank = Comparator
                .comparingInt((AspectRecord a) -> Constants.sunRank(a.p1()))
                .thenComparingInt(a -> Constants.sunRank(a.p2()))
                .thenComparingDouble(AspectRecord::exactOrb);
        slow.sort(byRank);
        fast.sort(byRank);
        // Луна — по времени точного аспекта: у неё день читают по часам
        final long day0ms = dayStart.toEpochMilli();
        moon.sort(Comparator.comparingLong(a ->
                a.exactTime() == null ? day0ms : a.exactTime().toEpochMilli()));

        return new DayAspects(dayStart, List.copyOf(slow), List.copyOf(fast),
                List.copyOf(moon), List.copyOf(E.audit(jdNoon)));
    }

    // ─── внутренняя кухня: те же функции, что в JS ──────────────────────────

    /** Знаковая функция, чей ноль = точный аспект (согласована с orbDistance). */
    private static DoubleUnaryOperator signedFn(Ephemeris E, String n1, String n2, double target) {
        DoubleUnaryOperator delta = j -> Angles.angdiff(E.lon(j, n1), E.lon(j, n2));
        if (target == 0) return delta;
        if (target == 180) return j -> Angles.angdiff(delta.applyAsDouble(j), 180);
        return j -> Math.abs(delta.applyAsDouble(j)) - target;
    }

    /** Расстояние до точного аспекта ≥ 0: ≤ orb — в орбисе, 0 — точный. */
    private static DoubleUnaryOperator orbDistance(Ephemeris E, String n1, String n2, double target) {
        DoubleUnaryOperator delta = j -> Angles.angdiff(E.lon(j, n1), E.lon(j, n2));
        if (target == 0) return j -> Math.abs(delta.applyAsDouble(j));
        if (target == 180) return j -> Math.abs(Angles.angdiff(delta.applyAsDouble(j), 180));
        return j -> Math.abs(Math.abs(delta.applyAsDouble(j)) - target);
    }

    /** Момент точного аспекта в [jdStart, jdEnd] либо null. */
    private static Double exactTime(Ephemeris E, String n1, String n2, double target,
                                    double jdStart, double jdEnd) {
        DoubleUnaryOperator f = signedFn(E, n1, n2, target);
        final double step = 1.0 / 48;   // полчаса
        double prevJ = jdStart, prevV = f.applyAsDouble(jdStart), j = jdStart + step;
        // +1e-9: накопленная ошибка сложений иначе съедает последний полушаг суток
        while (j <= jdEnd + 1e-9) {
            double v = f.applyAsDouble(j);
            if ((prevV <= 0) != (v <= 0) && Math.abs(prevV - v) < 30) {
                double lo = prevJ, hi = j;
                for (int i = 0; i < 50; i++) {
                    double mid = (lo + hi) / 2;
                    if ((f.applyAsDouble(lo) <= 0) != (f.applyAsDouble(mid) <= 0)) hi = mid; else lo = mid;
                }
                return (lo + hi) / 2;
            }
            prevJ = j; prevV = v; j += step;
        }
        return null;
    }

    /** Край окна орбиса: вход (dir=−1) или выход (dir=+1) от момента минимума. */
    private static Double orbEdge(DoubleUnaryOperator m, double orb, double jdFrom,
                                  double relSpeed, int dir) {
        final double maxDays = 120;
        double step = Math.max(1.0 / 96, Math.min(0.5, (orb * 0.5) / Math.max(Math.abs(relSpeed), 1e-4))) * dir;
        DoubleUnaryOperator g = j -> m.applyAsDouble(j) - orb;
        double jdLimit = jdFrom + dir * maxDays;
        double prevJ = jdFrom, j = jdFrom + step;
        while (dir > 0 ? j <= jdLimit : j >= jdLimit) {
            if (g.applyAsDouble(prevJ) <= 0 && g.applyAsDouble(j) > 0) {
                double lo = prevJ, hi = j;
                for (int i = 0; i < 50; i++) {
                    double mid = (lo + hi) / 2;
                    if ((g.applyAsDouble(lo) <= 0) != (g.applyAsDouble(mid) <= 0)) hi = mid; else lo = mid;
                }
                return (lo + hi) / 2;
            }
            prevJ = j; j += step;
        }
        return null;
    }
}
