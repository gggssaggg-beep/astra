"""
Сборка выходных файлов: .ics (календарь) и .txt (для астролога).
Поддержка часового пояса: события в .ics можно выдавать в UTC
или с фиксированным смещением (UTC+offset_hours).
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from .astro import sign_of, fmt_pos, PLANET_GLYPH


def _ics_fold(s: str) -> str:
    """RFC 5545: перенос длинных строк (UTF-8 безопасно)."""
    b = s.encode("utf-8")
    out = []
    while len(b) > 73:
        cut = 73
        while (b[cut] & 0xC0) == 0x80:  # не рвём UTF-8 символ
            cut -= 1
        out.append(b[:cut].decode("utf-8"))
        b = b" " + b[cut:]
    out.append(b.decode("utf-8"))
    return "\r\n".join(out)


def build_ics(events: list[dict], title: str,
              tz_offset_hours: float = 0.0,
              label_a: str = "Меркурий", label_b: str = "Венера") -> str:
    """
    events: список из transit_conjunctions (dt_utc, lon_a, orb_start, orb_end, multi).
    tz_offset_hours: 0 => UTC; иначе события сдвигаются и помечаются временем.
    Если tz != 0 — события с конкретным временем; если 0 — события «весь день».
    """
    ga = PLANET_GLYPH.get(label_a, "")
    gb = PLANET_GLYPH.get(label_b, "")
    tz = timezone(timedelta(hours=tz_offset_hours))
    tzname = "UTC" if tz_offset_hours == 0 else f"UTC{tz_offset_hours:+g}"

    lines = ["BEGIN:VCALENDAR", "VERSION:2.0",
             "PRODID:-//AstroBot//Transits//RU", "CALSCALE:GREGORIAN",
             "METHOD:PUBLISH", _ics_fold(f"X-WR-CALNAME:{ga}{gb} {title}")]
    now = datetime.now(timezone.utc)

    for i, ev in enumerate(events):
        dt_utc = ev["dt_utc"]
        dt_loc = dt_utc.astimezone(tz)
        s, g, deg = sign_of(ev["lon_a"])
        sv, gv, degv = sign_of(ev["lon_b"])
        ostart = ev["orb_start"].astimezone(tz)
        oend = ev["orb_end"].astimezone(tz)

        summary = f"{ga}{gb} {label_a}-{label_b} {deg:.1f}° {s}"
        flag = "\\nРетроградность: несколько входов в орбис" if ev.get("multi") else ""
        desc = (f"Точное соединение: {dt_loc:%Y-%m-%d %H:%M} {tzname}\\n"
                f"{label_a}: {deg:.2f}° {s}\\n{label_b}: {degv:.2f}° {sv}\\n"
                f"Орбис 1°: {ostart:%Y-%m-%d %H:%M} – {oend:%Y-%m-%d %H:%M} {tzname}{flag}\\n"
                f"Тропический зодиак, Swiss Ephemeris")

        lines.append("BEGIN:VEVENT")
        lines.append(f"UID:transit-{dt_utc:%Y%m%d%H%M}-{i}@astrobot")
        lines.append(f"DTSTAMP:{now:%Y%m%dT%H%M%SZ}")
        if tz_offset_hours == 0:
            # событие «весь день» по дате UTC
            lines.append(f"DTSTART;VALUE=DATE:{dt_utc:%Y%m%d}")
            lines.append(f"DTEND;VALUE=DATE:{(dt_utc + timedelta(days=1)):%Y%m%d}")
        else:
            # событие с конкретным временем в выбранном поясе (плавающее локальное)
            end_loc = dt_loc + timedelta(hours=1)
            lines.append(f"DTSTART:{dt_loc:%Y%m%dT%H%M%S}")
            lines.append(f"DTEND:{end_loc:%Y%m%dT%H%M%S}")
        lines.append(_ics_fold(f"SUMMARY:{summary}"))
        lines.append(_ics_fold(f"DESCRIPTION:{desc}"))
        lines.append("TRANSP:TRANSPARENT")
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def build_txt(events: list[dict], title: str,
              tz_offset_hours: float = 0.0,
              label_a: str = "Меркурий", label_b: str = "Венера") -> str:
    """Читаемый отчёт для астролога."""
    ga = PLANET_GLYPH.get(label_a, "")
    gb = PLANET_GLYPH.get(label_b, "")
    tz = timezone(timedelta(hours=tz_offset_hours))
    tzname = "UTC" if tz_offset_hours == 0 else f"UTC{tz_offset_hours:+g}"

    L = [f"СОЕДИНЕНИЯ {label_a} {ga} — {label_b} {gb}",
         title, "=" * 72, "",
         "ПАРАМЕТРЫ РАСЧЁТА:",
         "  • Эфемериды: Swiss Ephemeris (pyswisseph), FLG_SWIEPH",
         "  • Зодиак: тропический",
         f"  • Время: {tzname}",
         "  • Соединение = обнуление разницы эклиптических долгот",
         "  • Орбис 1°: вход/выход главного интервала вокруг точного соединения",
         "  • * = ретроградное качание (несколько пересечений орбиса)",
         "=" * 72, "",
         f"Всего точных соединений: {len(events)}", ""]
    for ev in events:
        dt = ev["dt_utc"].astimezone(tz)
        ds = ev["orb_start"].astimezone(tz)
        de = ev["orb_end"].astimezone(tz)
        s, g, deg = sign_of(ev["lon_a"])
        sv, gv, degv = sign_of(ev["lon_b"])
        flag = " *" if ev.get("multi") else ""
        L.append(f"{dt:%Y-%m-%d %H:%M} {tzname}{flag}  —  {ga} {g} {deg:5.2f}° {s}")
        L.append(f"    {label_b} {gb}: {gv} {degv:5.2f}° {sv}")
        L.append(f"    Орбис 1°:  вход {ds:%Y-%m-%d %H:%M}  →  выход {de:%Y-%m-%d %H:%M} {tzname}")
        L.append("-" * 72)
    return "\n".join(L)


def build_natal_txt(chart: dict, aspects: list[dict], who: str = "") -> str:
    """Текстовый отчёт по натальной карте."""
    from .astro import ZODIAC
    L = [f"НАТАЛЬНАЯ КАРТА {who}".strip(), "=" * 60, "",
         f"Дата/время (UTC): {chart['dt_utc']:%Y-%m-%d %H:%M:%S}",
         f"Координаты: {chart['lat']:.4f}, {chart['lon']:.4f}",
         "Система домов: горизонтальная (вертексная, 'H')",
         f"Антивертекс (куспид 1): {fmt_pos(chart['antivertex'])}",
         f"Вертекс (куспид 7): {fmt_pos(chart['vertex'])}",
         "", "ПЛАНЕТЫ:", "-" * 60]
    for name, p in chart["planets"].items():
        r = " R" if p.get("retro") else ""
        h = p.get("house")
        L.append(f"  {name:14s} {fmt_pos(p['lon'])}{r}   дом {h}")
    L.append("")
    L.append("АСПЕКТЫ (орбис 1°):")
    L.append("-" * 60)
    if aspects:
        for a in aspects:
            L.append(f"  {a['p1']} {a['symbol']} {a['p2']}  ({a['aspect']}, орб {a['exact_orb']}°)")
    else:
        L.append("  (нет аспектов в пределах 1°)")
    if chart["audit"]:
        L.append("")
        L.append("АУДИТ:")
        for w in chart["audit"]:
            L.append("  " + w)
    return "\n".join(L)
