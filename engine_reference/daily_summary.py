"""
Форматирование ежедневной сводки аспектов в текст для Telegram.
Времена показываются в выбранном часовом поясе.
"""
from __future__ import annotations
from datetime import timedelta, timezone
from .astro import PLANET_GLYPH, sign_of

# Русские склонения аспектов для заголовка строки не нужны — используем символ.
ASPECT_WORD = {
    "соединение": "соединение",
    "секстиль":   "секстиль",
    "квадрат":    "квадрат",
    "трин":       "трин",
    "оппозиция":  "оппозиция",
}


def _glyph(name: str) -> str:
    return PLANET_GLYPH.get(name, name)


def _short_sign(lon: float) -> str:
    name, g, deg = sign_of(lon)
    return f"{g}{int(deg)}°"


def _line(a: dict, tz, show_time: bool = True) -> str:
    g1 = _glyph(a["p1"])
    g2 = _glyph(a["p2"])
    sym = a["symbol"]
    orb = a["exact_orb"]
    arrow = "→" if a["applying"] else "←"
    base = f"{g1} {sym} {g2}  ({a['p1']}–{a['p2']}, {ASPECT_WORD[a['aspect']]}) орб {orb}° {arrow}"
    if show_time and a["exact_time"]:
        t = a["exact_time"].astimezone(tz)
        base += f"  точно {t:%H:%M}"
    return base


def format_summary(res: dict, tz_offset_hours: float = 0.0,
                   include_moon: bool = True) -> str:
    tz = timezone(timedelta(hours=tz_offset_hours))
    tzname = "UTC" if tz_offset_hours == 0 else f"UTC{tz_offset_hours:+g}"
    date_loc = res["date"].astimezone(tz)

    lines = [f"🌌 *Аспекты на {date_loc:%d.%m.%Y}*  ({tzname})", ""]

    if res["slow"]:
        lines.append("*Крупные (медленные планеты):*")
        for a in res["slow"]:
            lines.append("• " + _line(a, tz))
        lines.append("")

    if res["fast"]:
        lines.append("*Основные:*")
        for a in res["fast"]:
            lines.append("• " + _line(a, tz))
        lines.append("")

    if include_moon and res["moon"]:
        lines.append("*Луна* (быстрая, аспект действует часы):")
        for a in res["moon"]:
            lines.append("• " + _line(a, tz))
        lines.append("")

    if not (res["slow"] or res["fast"] or (include_moon and res["moon"])):
        lines.append("Сегодня мажорных аспектов в пределах орбиса нет.")

    if res["audit"]:
        lines.append("")
        for w in res["audit"]:
            lines.append(w)

    lines.append("")
    lines.append("_→ применяющийся · ← расходящийся · орбис 1°_")
    lines.append("_Тропический зодиак, Swiss Ephemeris_")
    return "\n".join(lines)
