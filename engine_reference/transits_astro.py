"""
Астрологическое ядро. Только Swiss Ephemeris (pyswisseph), тропический зодиак.
Жёсткие правила:
  - Никаких самодельных формул эфемерид.
  - Тропический зодиак (без сидерики/Джйотиш).
  - Все расчёты во времени UTC.
  - Система домов: горизонтальная (вертексная), код 'H'.
    Куспид 7 = Вертекс, куспид 1 = Антивертекс.
  - Орбис аспектов по умолчанию 1°.
  - Физ-аудит: Меркурий <~28° от Солнца, Венера <~48°.
"""
from __future__ import annotations
import swisseph as swe
from datetime import datetime, timedelta, timezone

ZODIAC = ["Овен", "Телец", "Близнецы", "Рак", "Лев", "Дева",
          "Весы", "Скорпион", "Стрелец", "Козерог", "Водолей", "Рыбы"]
GLYPH = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"]

PLANETS = {
    "Солнце":   swe.SUN,
    "Луна":     swe.MOON,
    "Меркурий": swe.MERCURY,
    "Венера":   swe.VENUS,
    "Марс":     swe.MARS,
    "Юпитер":   swe.JUPITER,
    "Сатурн":   swe.SATURN,
    "Уран":     swe.URANUS,
    "Нептун":   swe.NEPTUNE,
    "Плутон":   swe.PLUTO,
}
PLANET_GLYPH = {
    "Солнце": "☉", "Луна": "☽", "Меркурий": "☿", "Венера": "♀",
    "Марс": "♂", "Юпитер": "♃", "Сатурн": "♄", "Уран": "♅",
    "Нептун": "♆", "Плутон": "♇",
}

ASPECTS = {  # имя: (угол, символ)
    "соединение":  (0,   "☌"),
    "секстиль":    (60,  "⚹"),
    "квадрат":     (90,  "□"),
    "трин":        (120, "△"),
    "оппозиция":   (180, "☍"),
}

FLAGS = swe.FLG_SWIEPH | swe.FLG_SPEED


# ---------------------------------------------------------------- утилиты
def sign_of(lon: float):
    """Возвращает (имя_знака, глиф, градус_в_знаке)."""
    i = int(lon // 30) % 12
    return ZODIAC[i], GLYPH[i], lon % 30


def fmt_pos(lon: float) -> str:
    name, g, deg = sign_of(lon)
    d = int(deg)
    m = int(round((deg - d) * 60))
    if m == 60:
        m = 0
        d += 1
    return f"{g} {d}°{m:02d}′ {name}"


def to_jd(dt_utc: datetime) -> float:
    """datetime (UTC) -> юлианская дата."""
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
    """Знаковая минимальная разница a-b в диапазоне (-180,180]."""
    d = (a - b) % 360
    return d - 360 if d > 180 else d


def planet_lon(jd: float, body: int) -> float:
    return swe.calc_ut(jd, body, FLAGS)[0][0]


def planet_speed(jd: float, body: int) -> float:
    """Скорость по долготе (°/сут). <0 => ретроградность."""
    return swe.calc_ut(jd, body, FLAGS)[0][3]


# ---------------------------------------------------------------- аудит
def physics_audit(jd: float) -> list[str]:
    """Проверка элонгаций. Возвращает список предупреждений (пустой = ок)."""
    warns = []
    sun = planet_lon(jd, swe.SUN)
    merc = abs(angdiff(planet_lon(jd, swe.MERCURY), sun))
    ven = abs(angdiff(planet_lon(jd, swe.VENUS), sun))
    if merc > 28:
        warns.append(f"⚠ Элонгация Меркурия {merc:.1f}° > 28° — расчёт под подозрением")
    if ven > 48:
        warns.append(f"⚠ Элонгация Венеры {ven:.1f}° > 48° — расчёт под подозрением")
    return warns


# ---------------------------------------------------------------- натал
def natal_chart(dt_utc: datetime, lat: float, lon: float) -> dict:
    """
    Натальная карта. Дома — горизонтальная система ('H').
    Куспид 1 = Антивертекс, куспид 7 = Вертекс.
    """
    jd = to_jd(dt_utc)
    cusps, ascmc = swe.houses_ex(jd, lat, lon, b'H')
    # cusps: куспиды домов 1..12 (cusps[0]..cusps[11])
    planets = {}
    for name, body in PLANETS.items():
        res = swe.calc_ut(jd, body, FLAGS)[0]
        planets[name] = {"lon": res[0], "speed": res[3], "retro": res[3] < 0}
    # лунные узлы (средний)
    node = swe.calc_ut(jd, swe.MEAN_NODE, FLAGS)[0]
    planets["Раху (С.Узел)"] = {"lon": node[0], "speed": node[3], "retro": node[3] < 0}
    planets["Кету (Ю.Узел)"] = {"lon": (node[0] + 180) % 360, "speed": node[3], "retro": node[3] < 0}

    def house_of(plon):
        for i in range(12):
            a = cusps[i]
            b = cusps[(i + 1) % 12]
            span = (b - a) % 360
            off = (plon - a) % 360
            if off < span:
                return i + 1
        return None

    for p in planets.values():
        p["house"] = house_of(p["lon"])

    return {
        "jd": jd,
        "dt_utc": dt_utc,
        "lat": lat, "lon": lon,
        "cusps": list(cusps),
        "antivertex": cusps[0],   # куспид 1
        "vertex": cusps[6],       # куспид 7
        "planets": planets,
        "audit": physics_audit(jd),
    }


def natal_aspects(chart: dict, orb: float = 1.0) -> list[dict]:
    """Натальные аспекты между планетами с заданным орбисом."""
    names = list(chart["planets"].keys())
    out = []
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            n1, n2 = names[i], names[j]
            l1 = chart["planets"][n1]["lon"]
            l2 = chart["planets"][n2]["lon"]
            sep = abs(angdiff(l1, l2))
            for asp, (ang, sym) in ASPECTS.items():
                d = abs(sep - ang)
                if d <= orb:
                    out.append({"p1": n1, "p2": n2, "aspect": asp,
                                "symbol": sym, "exact_orb": round(d, 2)})
    return out


# ---------------------------------------------------------------- транзиты
def transit_conjunctions(body_a: int, body_b: int,
                         start: datetime, end: datetime,
                         orb: float = 1.0, step_days: float = 1.0) -> list[dict]:
    """
    Все соединения двух тел в периоде. Точный момент ищется бисекцией
    по смене знака разницы долгот. Окно орбиса — главный непрерывный
    интервал вокруг точного соединения (учитывает ретро-качание).
    """
    jd0, jd1 = to_jd(start), to_jd(end)
    events = []
    jd = jd0
    prev = None
    prevjd = None
    while jd <= jd1:
        d = angdiff(planet_lon(jd, body_a), planet_lon(jd, body_b))
        if prev is not None and (prev > 0) != (d > 0) and abs(prev - d) < 30:
            lo, hi = prevjd, jd
            for _ in range(60):
                mid = (lo + hi) / 2
                dm = angdiff(planet_lon(mid, body_a), planet_lon(mid, body_b))
                if (angdiff(planet_lon(lo, body_a), planet_lon(lo, body_b)) > 0) != (dm > 0):
                    hi = mid
                else:
                    lo = mid
            cj = (lo + hi) / 2
            la = planet_lon(cj, body_a)
            lb = planet_lon(cj, body_b)
            win = _orb_window(body_a, body_b, cj, orb)
            events.append({
                "jd": cj,
                "dt_utc": from_jd(cj),
                "lon_a": la, "lon_b": lb,
                "orb_start": from_jd(win[0]),
                "orb_end": from_jd(win[1]),
                "multi": win[2],   # True если были доп. пересечения (ретро)
            })
        prev, prevjd = d, jd
        jd += step_days
    return events


def _orb_window(body_a: int, body_b: int, cj: float, orb: float):
    """Главный интервал, где |разница|<orb, вокруг точного соединения cj."""
    def orb_at(j):
        return abs(angdiff(planet_lon(j, body_a), planet_lon(j, body_b)))

    step = 1.0 / 24  # час
    js, je = cj - 30, cj + 30
    segs = []
    j = js
    prev_in = orb_at(js) < orb
    seg_start = js if prev_in else None
    while j <= je:
        cur = orb_at(j) < orb
        if cur and not prev_in:
            a, b = j - step, j
            for _ in range(40):
                m = (a + b) / 2
                if (orb_at(a) < orb) != (orb_at(m) < orb):
                    b = m
                else:
                    a = m
            seg_start = (a + b) / 2
        if (not cur) and prev_in:
            a, b = j - step, j
            for _ in range(40):
                m = (a + b) / 2
                if (orb_at(a) < orb) != (orb_at(m) < orb):
                    b = m
                else:
                    a = m
            segs.append((seg_start, (a + b) / 2))
            seg_start = None
        prev_in = cur
        j += step
    if seg_start is not None:
        segs.append((seg_start, je))
    main = next((s for s in segs if s[0] <= cj <= s[1]),
                segs[0] if segs else (cj, cj))
    return main[0], main[1], len(segs) > 1


def transit_to_natal(chart: dict, when: datetime,
                     bodies: list[str] | None = None,
                     orb: float = 1.0) -> list[dict]:
    """Аспекты транзитных планет к натальным точкам на дату when."""
    jd = to_jd(when)
    if bodies is None:
        bodies = list(PLANETS.keys())
    out = []
    for tname in bodies:
        tlon = planet_lon(jd, PLANETS[tname])
        for nname, nd in chart["planets"].items():
            sep = abs(angdiff(tlon, nd["lon"]))
            for asp, (ang, sym) in ASPECTS.items():
                d = abs(sep - ang)
                if d <= orb:
                    out.append({
                        "transit": tname, "natal": nname,
                        "aspect": asp, "symbol": sym,
                        "exact_orb": round(d, 2),
                    })
    return out
