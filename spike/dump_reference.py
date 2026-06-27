"""
Спайк-сверка, ШАГ 1: дамп ЭТАЛОНА (pysweph) по контрольным датам.

Печатает и сохраняет в reference_dump.json:
  - долготы/скорости всех объектов на 12:00 UTC (режимы SWIEPH и MOSEPH),
  - флаг фактически использованной эфемериды (детект fallback SWIEPH->Moshier),
  - мажорные аспекты на сутки с точным временем (через эталонный aspects_for_day).

Запуск:  .venv/Scripts/python.exe spike/dump_reference.py
"""
from __future__ import annotations
import os, sys, json
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# подключаем эталонные модули
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "engine_reference"))

import swisseph as swe  # noqa: E402
from daily_aspects_astro import (  # noqa: E402
    BODIES, MOON, to_jd, aspects_for_day,
)

SWIEPH = swe.FLG_SWIEPH | swe.FLG_SPEED
MOSEPH = swe.FLG_MOSEPH | swe.FLG_SPEED
SEFLG_MOSEPH = 4  # бит в retflags => фактически считалось Moshier

# Контрольные даты (UTC). Включают тесные соединения для проверки точного времени:
#   2020-12-21 — великое соединение Юпитер–Сатурн,
#   2023-03-02 — соединение Венера–Юпитер.
DATES = ["2000-01-01", "2010-09-09", "2020-12-21",
         "2023-03-02", "2025-01-01", "2026-06-27"]

# Объекты для дампа позиций (Раху=истинный узел, Кету=+180)
POS_BODIES = [
    ("Солнце", swe.SUN), ("Луна", swe.MOON), ("Меркурий", swe.MERCURY),
    ("Венера", swe.VENUS), ("Марс", swe.MARS), ("Юпитер", swe.JUPITER),
    ("Сатурн", swe.SATURN), ("Уран", swe.URANUS), ("Нептун", swe.NEPTUNE),
    ("Раху", swe.TRUE_NODE),
]


def calc(jd: float, code: int, flags: int):
    res = swe.calc_ut(jd, code, flags)
    xx, retflags = res[0], res[1]
    return xx, retflags


def positions(jd_noon: float) -> dict:
    out = {}
    for name, code in POS_BODIES:
        xx_s, rf_s = calc(jd_noon, code, SWIEPH)
        xx_m, rf_m = calc(jd_noon, code, MOSEPH)
        out[name] = {
            "lon_swieph": xx_s[0],
            "lon_moseph": xx_m[0],
            "speed": xx_s[3],
            "retro": xx_s[3] < 0,
            "swieph_fell_back_to_moshier": bool(rf_s & SEFLG_MOSEPH),
        }
    # Кету = Раху + 180
    rahu_s = out["Раху"]["lon_swieph"]
    rahu_m = out["Раху"]["lon_moseph"]
    out["Кету"] = {
        "lon_swieph": (rahu_s + 180) % 360,
        "lon_moseph": (rahu_m + 180) % 360,
        "speed": out["Раху"]["speed"],
        "retro": out["Раху"]["retro"],
        "swieph_fell_back_to_moshier": out["Раху"]["swieph_fell_back_to_moshier"],
    }
    return out


# --- затмения (§10.1): времена + номер серии/члена Сароса ---
# Контрольные точки поиска: от каждой ищем СЛЕДУЮЩЕЕ затмение вперёд.
SOL_STARTS = ["2024-01-01", "2024-06-01", "2017-01-01", "1999-01-01", "2026-01-01"]
LUN_STARTS = ["2025-01-01", "2024-06-01", "2022-06-01", "2018-01-01", "2026-01-01"]

# биты типа затмения в retflag (swephexp.h)
ECL_BITS = [(swe.ECL_TOTAL, "полное"), (swe.ECL_ANNULAR, "кольцевое"),
            (swe.ECL_PARTIAL, "частное"), (swe.ECL_ANNULAR_TOTAL, "гибридное"),
            (swe.ECL_PENUMBRAL, "полутеневое")]


def _start_jd(d: str) -> float:
    y, m, dd = map(int, d.split("-"))
    return swe.julday(y, m, dd, 0)


def _jd_to_iso(jd: float) -> str:
    y, m, dd, h = swe.revjul(jd)
    hh = int(h); mm = int((h - hh) * 60); ss = int(round((((h - hh) * 60) - mm) * 60))
    if ss == 60:
        ss = 0; mm += 1
    if mm == 60:
        mm = 0; hh += 1
    return datetime(y, m, dd, hh, mm, ss, tzinfo=timezone.utc).isoformat()


def _type_label(rf: int) -> str:
    return "+".join(lbl for bit, lbl in ECL_BITS if rf & bit) or "?"


def eclipses() -> dict:
    out = {"solar": [], "lunar": []}
    for start in SOL_STARTS:
        rf, tret = swe.sol_eclipse_when_glob(_start_jd(start), MOSEPH, 0, False)
        tmax = tret[0]
        _, geopos, _ = swe.sol_eclipse_where(tmax, MOSEPH)
        _, attr = swe.sol_eclipse_how(tmax, [geopos[0], geopos[1], 0.0], MOSEPH)
        out["solar"].append({
            "start": start, "jd_max": tmax, "time": _jd_to_iso(tmax),
            "retflag": int(rf), "type": _type_label(rf),
            "saros": int(attr[9]), "member": int(attr[10]), "mag": attr[0],
        })
    for start in LUN_STARTS:
        rf, tret = swe.lun_eclipse_when(_start_jd(start), MOSEPH, 0, False)
        tmax = tret[0]
        _, attr = swe.lun_eclipse_how(tmax, [0.0, 0.0, 0.0], MOSEPH)
        out["lunar"].append({
            "start": start, "jd_max": tmax, "time": _jd_to_iso(tmax),
            "retflag": int(rf), "type": _type_label(rf),
            "saros": int(attr[9]), "member": int(attr[10]), "mag": attr[0],
        })
    return out


def aspects(date_utc: datetime) -> list:
    res = aspects_for_day(date_utc, orb=1.0, include_moon=True)
    flat = []
    for bucket in ("slow", "fast", "moon"):
        for r in res[bucket]:
            flat.append({
                "bucket": bucket,
                "p1": r["p1"], "p2": r["p2"], "aspect": r["aspect"],
                "exact_orb": r["exact_orb"],
                "exact_time": r["exact_time"].isoformat() if r["exact_time"] else None,
                "begin_time": r["begin_time"].isoformat() if r["begin_time"] else None,
                "end_time": r["end_time"].isoformat() if r["end_time"] else None,
                "applying": r["applying"],
            })
    return {"aspects": flat, "audit": res["audit"]}


def main():
    dump = {"swe_version": getattr(swe, "version", "?"),
            "ephe_path_set": False, "dates": {}}
    any_fallback = False
    for d in DATES:
        y, m, dd = map(int, d.split("-"))
        noon = datetime(y, m, dd, 12, 0, 0, tzinfo=timezone.utc)
        jd_noon = to_jd(noon)
        pos = positions(jd_noon)
        asp = aspects(noon)
        if any(p["swieph_fell_back_to_moshier"] for p in pos.values()):
            any_fallback = True
        dump["dates"][d] = {"jd_noon": jd_noon, "positions": pos, **asp}

    dump["swieph_is_moshier_fallback"] = any_fallback
    dump["eclipses"] = eclipses()

    outp = os.path.join(HERE, "reference_dump.json")
    with open(outp, "w", encoding="utf-8") as f:
        json.dump(dump, f, ensure_ascii=False, indent=2)

    # краткий вывод в консоль
    print(f"swe.version = {dump['swe_version']}")
    print(f"SWIEPH фактически == Moshier (нет файлов эфемерид): {any_fallback}")
    print(f"сохранено: {outp}\n")
    for d in DATES:
        print(f"--- {d} 12:00 UTC ---")
        for name in ["Солнце", "Луна", "Меркурий", "Венера", "Марс",
                     "Юпитер", "Сатурн", "Уран", "Нептун", "Раху", "Кету"]:
            p = dump["dates"][d]["positions"][name]
            diff = abs(((p["lon_swieph"] - p["lon_moseph"] + 180) % 360) - 180) * 3600
            print(f"  {name:9s} {p['lon_swieph']:10.5f}°  "
                  f"(SWIEPH-MOSEPH={diff:6.2f}″)  v={p['speed']:+.4f}")
        na = len(dump["dates"][d]["aspects"])
        print(f"  аспектов за сутки: {na}; аудит: {dump['dates'][d]['audit']}")

    print("\n--- затмения (Сарос §10.1) ---")
    for e in dump["eclipses"]["solar"]:
        print(f"  СОЛН {e['time'][:16]}  {e['type']:9s}  Сарос {e['saros']}/{e['member']}  mag={e['mag']:.3f}")
    for e in dump["eclipses"]["lunar"]:
        print(f"  ЛУНН {e['time'][:16]}  {e['type']:10s}  Сарос {e['saros']}/{e['member']}")


if __name__ == "__main__":
    main()
