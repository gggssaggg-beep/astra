"""
Спайк-сверка SWIEPH↔SWIEPH, ШАГ 1: дамп ЭТАЛОНА (pysweph) в режиме SWIEPH с
ФАЙЛАМИ эфемерид из ../ephe (как на устройстве), вкл. доп. объекты и TNO.

Список доп. объектов берётся ДАННЫМИ: сканируем ../ephe/astN/*.se1, номер →
ipl = SE_AST_OFFSET + номер. Кладёт новые файлы — они подхватятся сами.
Объекты, файла которых нет, помечаются available=false и в сверке пропускаются.

Запуск:  ../.venv/Scripts/python.exe dump_swieph.py
"""
from __future__ import annotations
import os, re, sys, json, glob
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "engine_reference"))
import swisseph as swe  # noqa: E402
from daily_aspects_astro import to_jd  # noqa: E402

EPHE = os.path.abspath(os.path.join(HERE, "..", "ephe"))
swe.set_ephe_path(EPHE)

SWIEPH = swe.FLG_SWIEPH | swe.FLG_SPEED
AST = 10000  # SE_AST_OFFSET

DATES = ["2000-01-01", "2010-09-09", "2020-12-21",
         "2023-03-02", "2025-01-01", "2026-06-27"]

# Имена для известных карликов/TNO (остальные — «№<номер>»).
TNO_NAMES = {
    19521: "Хаос", 20000: "Варуна", 28978: "Иксион", 38628: "Хуйя",
    50000: "Квавар", 55637: "2002 UX25", 84922: "2003 VS2", 90377: "Седна",
    90482: "Оркус", 90568: "2004 GV9", 120347: "Салация", 136108: "Хаумеа",
    136199: "Эрида", 136472: "Макемаке", 174567: "Варда", 208996: "2003 AZ84",
    225088: "Гонгун", 307261: "2002 MS4", 541132: "Лелеакухонуа",
}

# Базовые + «коробочные» доп. объекты (стабильный список).
BASE = [
    ("Солнце", 0), ("Луна", 1), ("Меркурий", 2), ("Венера", 3), ("Марс", 4),
    ("Юпитер", 5), ("Сатурн", 6), ("Уран", 7), ("Нептун", 8), ("Раху", 11),
    ("Хирон", 15), ("Фолус", 16), ("Церера", 17), ("Паллада", 18),
    ("Юнона", 19), ("Веста", 20), ("Лилит ср.", 12), ("Лилит ист.", 13),
]


def scan_extra():
    """Найти номера астероидов по файлам ../ephe/astN/*.se1."""
    nums = set()
    for f in glob.glob(os.path.join(EPHE, "ast*", "*.se1")):
        m = re.search(r"(\d+)", os.path.basename(f))
        if m:
            nums.add(int(m.group(1)))
    out = []
    for n in sorted(nums):
        out.append((TNO_NAMES.get(n, f"№{n}"), AST + n))
    return out


def one(jd, code):
    try:
        res = swe.calc_ut(jd, code, SWIEPH)
        xx, rf = res[0], res[1]
        if rf < 0:
            return None
        return {"lon": xx[0], "speed": xx[3]}
    except swe.Error:
        return None


def main():
    OBJ = BASE + scan_extra()
    codes = {name: code for name, code in OBJ}
    dump = {"swe_version": getattr(swe, "version", "?"), "ephe_path": EPHE,
            "flag": "SWIEPH", "codes": codes, "dates": {}}
    avail = {}
    for d in DATES:
        y, m, dd = map(int, d.split("-"))
        jd = to_jd(datetime(y, m, dd, 12, 0, 0, tzinfo=timezone.utc))
        pos = {}
        for name, code in OBJ:
            r = one(jd, code)
            if r is not None:
                pos[name] = r
                avail[name] = True
            else:
                avail.setdefault(name, False)
        if "Раху" in pos:
            pos["Кету"] = {"lon": (pos["Раху"]["lon"] + 180) % 360,
                           "speed": pos["Раху"]["speed"]}
        dump["dates"][d] = {"jd_noon": jd, "positions": pos}

    dump["available"] = avail
    outp = os.path.join(HERE, "swieph_dump.json")
    with open(outp, "w", encoding="utf-8") as f:
        json.dump(dump, f, ensure_ascii=False, indent=2)

    have = [n for n, ok in avail.items() if ok]
    miss = [n for n, ok in avail.items() if not ok]
    print(f"swe.version={dump['swe_version']}  ephe={EPHE}")
    print(f"объектов посчитано: {len(have)}")
    print("  " + ", ".join(have))
    if miss:
        print(f"НЕТ ФАЙЛОВ (пропущены): {', '.join(miss)}")
    print(f"сохранено: {outp}")
    d0 = DATES[4]
    print(f"\n--- {d0} 12:00 UTC ---")
    for name in have:
        if name in dump["dates"][d0]["positions"]:
            p = dump["dates"][d0]["positions"][name]
            print(f"  {name:12s} {p['lon']:10.5f}°  v={p['speed']:+.5f}")


if __name__ == "__main__":
    main()
