"""
Астрономическое ядро ежедневной сводки.
Только Swiss Ephemeris (pyswisseph), тропический зодиак, время UTC.

Объекты: Солнце, Луна, Меркурий, Венера, Марс, Юпитер, Сатурн,
Уран, Нептун, истинные Лунные узлы (Раху/Кету).

Аспекты: соединение, секстиль, квадрат, трин, оппозиция (мажорные).
Для каждого аспекта на день определяется:
  - факт нахождения в орбисе на момент расчёта,
  - точное время кульминации (минимум орбиса) в течение суток, если оно есть,
  - применяющийся / расходящийся (applying / separating).
"""
from __future__ import annotations
import swisseph as swe
from datetime import datetime, timedelta, timezone

FLAGS = swe.FLG_SWIEPH | swe.FLG_SPEED

ZODIAC = ["Овен", "Телец", "Близнецы", "Рак", "Лев", "Дева",
          "Весы", "Скорпион", "Стрелец", "Козерог", "Водолей", "Рыбы"]
GLYPH = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"]

# Порядок = от медленных к быстрым (для сортировки в сводке).
# Луна вынесена отдельно (см. MOON).
BODIES = {
    "Нептун":   swe.NEPTUNE,
    "Уран":     swe.URANUS,
    "Сатурн":   swe.SATURN,
    "Юпитер":   swe.JUPITER,
    "Раху":     swe.TRUE_NODE,      # истинный Северный узел
    "Марс":     swe.MARS,
    "Солнце":   swe.SUN,
    "Венера":   swe.VENUS,
    "Меркурий": swe.MERCURY,
}
MOON = "Луна"

PLANET_GLYPH = {
    "Солнце": "☉", "Луна": "☽", "Меркурий": "☿", "Венера": "♀",
    "Марс": "♂", "Юпитер": "♃", "Сатурн": "♄", "Уран": "♅",
    "Нептун": "♆", "Раху": "☊", "Кету": "☋",
}

ASPECTS = {  # имя: (угол, символ)
    "соединение": (0,   "☌"),
    "секстиль":   (60,  "⚹"),
    "квадрат":    (90,  "□"),
    "трин":       (120, "△"),
    "оппозиция":  (180, "☍"),
}

# «Скорость» объекта для пометки applying/separating и сортировки.
SLOW = {"Нептун", "Уран", "Сатурн", "Юпитер", "Раху"}


# ---------------------------------------------------------------- утилиты
def sign_of(lon: float):
    i = int(lon // 30) % 12
    return ZODIAC[i], GLYPH[i], lon % 30


def fmt_pos(lon: float) -> str:
    name, g, deg = sign_of(lon)
    d = int(deg)
    m = int(round((deg - d) * 60))
    if m == 60:
        m = 0; d += 1
    return f"{g} {d}°{m:02d}′ {name}"


def to_jd(dt_utc: datetime) -> float:
    h = dt_utc.hour + dt_utc.minute / 60 + dt_utc.second / 3600
    return swe.julday(dt_utc.year, dt_utc.month, dt_utc.day, h)


def from_jd(jd: float) -> datetime:
    y, mo, dy, h = swe.revjul(jd)
    hh = int(h)
    mm = int((h - hh) * 60)
    ss = int(round((((h - hh) * 60) - mm) * 60))
    if ss == 60:
        ss = 0; mm += 1
    if mm == 60:
        mm = 0; hh += 1
    return datetime(y, mo, dy, hh, mm, ss, tzinfo=timezone.utc)


def angdiff(a: float, b: float) -> float:
    d = (a - b) % 360
    return d - 360 if d > 180 else d


def lon_of(jd: float, name: str) -> float:
    if name == "Кету":
        return (swe.calc_ut(jd, swe.TRUE_NODE, FLAGS)[0][0] + 180) % 360
    return swe.calc_ut(jd, BODIES.get(name, MOON) if name != MOON else swe.MOON, FLAGS)[0][0]


def _body_code(name: str) -> int:
    if name == MOON:
        return swe.MOON
    if name == "Кету":
        return swe.TRUE_NODE
    return BODIES[name]


def lon_speed(jd: float, name: str):
    """(долгота, скорость °/сут). Для Кету скорость как у узла."""
    code = _body_code(name)
    r = swe.calc_ut(jd, code, FLAGS)[0]
    lon = (r[0] + 180) % 360 if name == "Кету" else r[0]
    return lon, r[3]


# ---------------------------------------------------------------- аудит
def physics_audit(jd: float) -> list[str]:
    warns = []
    sun = swe.calc_ut(jd, swe.SUN, FLAGS)[0][0]
    merc = abs(angdiff(swe.calc_ut(jd, swe.MERCURY, FLAGS)[0][0], sun))
    ven = abs(angdiff(swe.calc_ut(jd, swe.VENUS, FLAGS)[0][0], sun))
    if merc > 28:
        warns.append(f"⚠ Элонгация Меркурия {merc:.1f}° > 28°")
    if ven > 48:
        warns.append(f"⚠ Элонгация Венеры {ven:.1f}° > 48°")
    return warns


# ---------------------------------------------------------------- аспекты на день
def _separation(jd: float, n1: str, n2: str) -> float:
    return abs(angdiff(lon_of(jd, n1), lon_of(jd, n2)))


def _exact_time(n1: str, n2: str, target: float,
                jd_start: float, jd_end: float):
    """
    Ищет момент в [jd_start, jd_end], где разница углов == target (точный аспект).
    Возвращает jd или None. Метод: ищем нулевое пересечение знаковой функции f,
    чей ноль = точный аспект, и уточняем бисекцией.

    ВАЖНО: для соединения (target=0) и оппозиции (target=180) нельзя брать
    |sep|-target — в этих крайних точках |sep| лишь КАСАЕТСЯ нуля/180 и знак не
    меняет, поэтому пересечение не детектится (раньше exact_time выходил None для
    ВСЕХ соединений и оппозиций). Берём знаковую разницу:
      соединение: delta = angdiff(lon1, lon2) пересекает 0;
      оппозиция:  angdiff(delta, 180) пересекает 0;
      секстиль/квадрат/трин: |delta|-target меняет знак как и прежде.
    """
    def delta(j):
        return angdiff(lon_of(j, n1), lon_of(j, n2))

    if target == 0:
        f = delta
    elif target == 180:
        f = lambda j: angdiff(delta(j), 180.0)
    else:
        f = lambda j: abs(delta(j)) - target

    step = 1.0 / 48  # полчаса
    prev_j = jd_start
    prev_v = f(jd_start)
    j = jd_start + step
    found = None
    best = (abs(prev_v), prev_j)
    while j <= jd_end:
        v = f(j)
        if abs(v) < best[0]:
            best = (abs(v), j)
        if (prev_v <= 0) != (v <= 0) and abs(prev_v - v) < 30:
            lo, hi = prev_j, j
            for _ in range(50):
                mid = (lo + hi) / 2
                if (f(lo) <= 0) != (f(mid) <= 0):
                    hi = mid
                else:
                    lo = mid
            found = (lo + hi) / 2
            break
        prev_j, prev_v = j, v
        j += step
    return found


def _orb_distance(n1: str, n2: str, target: float):
    """
    Возвращает функцию m(jd) ≥ 0 — угловое расстояние до ТОЧНОГО аспекта.
    Аспект «в орбисе», когда m ≤ orb; m==0 — точный. Согласована с _exact_time:
      соединение → |delta|, оппозиция → |angdiff(delta,180)|, иначе → ||delta|-target|.
    """
    def delta(j):
        return angdiff(lon_of(j, n1), lon_of(j, n2))
    if target == 0:
        return lambda j: abs(delta(j))
    if target == 180:
        return lambda j: abs(angdiff(delta(j), 180.0))
    return lambda j: abs(abs(delta(j)) - target)


def _orb_edge(m, orb: float, jd_from: float, rel_speed: float,
              direction: int, max_days: float = 120.0):
    """
    Момент, когда аспект ВХОДИТ в орбис (direction=-1, назад) или ВЫХОДИТ из него
    (direction=+1, вперёд). Идём от jd_from (там m≤orb) наружу, пока m не превысит
    orb, затем уточняем бисекцией пересечение m==orb.

    Окно может выходить далеко за сутки (для медленных планет — дни/недели),
    поэтому шаг адаптивный по относительной скорости, а поиск ограничен max_days.
    Возвращает jd или None (за max_days из орба не вышли — край окна не в горизонте).
    """
    # шаг подбираем так, чтобы орбис проходился за ~несколько шагов:
    step = max(1.0 / 96, min(0.5, (orb * 0.5) / max(abs(rel_speed), 1e-4))) * direction
    g = lambda j: m(j) - orb
    jd_limit = jd_from + direction * max_days
    prev_j = jd_from
    j = jd_from + step
    while (j <= jd_limit) if direction > 0 else (j >= jd_limit):
        if g(prev_j) <= 0 and g(j) > 0:        # prev_j внутри орба, j — снаружи
            lo, hi = prev_j, j
            for _ in range(50):
                mid = (lo + hi) / 2
                if (g(lo) <= 0) != (g(mid) <= 0):
                    hi = mid
                else:
                    lo = mid
            return (lo + hi) / 2
        prev_j = j
        j += step
    return None


def aspects_for_day(date_utc: datetime, orb: float = 1.0,
                    include_moon: bool = True) -> dict:
    """
    Все мажорные аспекты на сутки date_utc (00:00–24:00 UTC).
    Возвращает {'slow': [...], 'fast': [...], 'moon': [...], 'audit': [...]}.
    Каждый аспект: dict с полями
      p1, p2, aspect, symbol, exact_orb, exact_time (datetime|None),
      begin_time/end_time (datetime|None — вход/выход орбиса, могут быть за
      пределами суток), applying (bool|None), pos1, pos2.
    """
    day0 = datetime(date_utc.year, date_utc.month, date_utc.day,
                    0, 0, 0, tzinfo=timezone.utc)
    jd0 = to_jd(day0)
    jd1 = to_jd(day0 + timedelta(days=1))
    jd_noon = to_jd(day0 + timedelta(hours=12))

    names = list(BODIES.keys()) + ["Кету"]
    if include_moon:
        names = [MOON] + names

    slow_res, fast_res, moon_res = [], [], []

    for i in range(len(names)):
        for jx in range(i + 1, len(names)):
            n1, n2 = names[i], names[jx]
            # Раху и Кету всегда в оппозиции — пропускаем их пару
            if {n1, n2} == {"Раху", "Кету"}:
                continue
            for asp, (ang, sym) in ASPECTS.items():
                # минимальный орбис за сутки: сканируем сеткой
                min_orb = None
                min_jd = jd_noon
                jd = jd0
                grid = 1.0 / 24  # час
                while jd <= jd1:
                    o = abs(_separation(jd, n1, n2) - ang)
                    if min_orb is None or o < min_orb:
                        min_orb, min_jd = o, jd
                    jd += grid
                if min_orb is None or min_orb > orb:
                    continue
                exact_jd = _exact_time(n1, n2, ang, jd0, jd1)
                cur_orb = round(min_orb, 2)
                # applying / separating относительно момента минимума орбиса
                sep_a = _separation(min_jd, n1, n2)
                sep_b = _separation(min_jd + 0.01, n1, n2)
                applying = abs(sep_b - ang) < abs(sep_a - ang)

                # окно орбиса: вход («начинается») и выход («заканчивается»).
                # Может выходить за сутки — особенно у Луны (вечером начался,
                # назавтра закончился). Ищем наружу от момента минимума орба.
                m = _orb_distance(n1, n2, ang)
                sp1 = lon_speed(min_jd, n1)[1]
                sp2 = lon_speed(min_jd, n2)[1]
                rel_speed = sp1 - sp2
                begin_jd = _orb_edge(m, orb, min_jd, rel_speed, -1)
                end_jd = _orb_edge(m, orb, min_jd, rel_speed, +1)

                rec = {
                    "p1": n1, "p2": n2, "aspect": asp, "symbol": sym,
                    "exact_orb": cur_orb,
                    "exact_time": from_jd(exact_jd) if exact_jd else None,
                    "begin_time": from_jd(begin_jd) if begin_jd else None,
                    "end_time": from_jd(end_jd) if end_jd else None,
                    "applying": applying,
                    "pos1": lon_of(min_jd, n1),
                    "pos2": lon_of(min_jd, n2),
                }
                if n1 == MOON or n2 == MOON:
                    moon_res.append(rec)
                elif n1 in SLOW and n2 in SLOW:
                    slow_res.append(rec)
                else:
                    fast_res.append(rec)

    keyf = lambda r: (r["exact_orb"])
    slow_res.sort(key=keyf)
    fast_res.sort(key=keyf)
    moon_res.sort(key=lambda r: (r["exact_time"] or day0))

    return {
        "date": day0,
        "slow": slow_res,
        "fast": fast_res,
        "moon": moon_res,
        "audit": physics_audit(jd_noon),
    }
