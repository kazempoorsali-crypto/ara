"""مرتب‌سازی محله‌ها پیش از ارزش‌گذاری.

۱. مقدارهای بی‌معنا («سراسر استان …»، «سراسر ایران»، نام خود شهر) محله حساب نمی‌شوند.
۲. شکل‌های مختلف نام یک محله («بلوار منفرد»، «خیابان منفرد»، «منفرد») در هر شهر یکی می‌شوند.
۳. آگهی بدون محله، اگر در عنوان یا متنش نام یکی از محله‌های شناخته‌شدهٔ همان شهر آمده باشد، به آن محله نسبت داده می‌شود
   (اول عنوان، بعد متن؛ نام بلندتر برنده است). در غیر این صورت بدون محله می‌ماند و چیزی حدس زده نمی‌شود.
"""
from __future__ import annotations

import re

from catalog import norm

PREFIX = re.compile(r"^(?:بلوار|خیابان|خ|میدان|کوچه|شهرک|محله|محلهٔ|جاده|کمربندی|بزرگراه|انتهای|ابتدای|اول|منطقه)\s+")
JUNK = re.compile(r"^(?:سراسر|همه|کل|تمام|کلیه)\b|^(?:مرکز استان|حومه|اطراف|نامشخص|سایر|غیره)$")
GENERIC = {"مرکز", "مرکزشهر", "شهر", "شهرک", "حومه", "جنوب", "شمال", "شرق", "غرب", "بالا", "پایین", "ساحلی", "جنگلی"}
FA = "؀-ۿ"


def core(name: str | None) -> str:
    """کلید مقایسه: بدون پیشوند (بلوار، خیابان، …)، بدون فاصله و نیم‌فاصله."""
    s = norm(name).replace("ـ", "")
    s = re.sub(r"\s+", " ", s).strip()
    for _ in range(2):
        s = PREFIX.sub("", s)
    return s.replace(" ", "")


def tokens(name: str | None) -> list:
    s = norm(name)
    for _ in range(2):
        s = PREFIX.sub("", s.strip())
    return [t for t in re.split(r"[\s،,\-/]+", s) if t]


def is_junk(name: str | None, city_name: str | None = None) -> bool:
    s = norm(name).strip()
    if not s:
        return True
    if JUNK.search(s):
        return True
    return bool(city_name) and core(s) == core(city_name)


def matches(want: str, district: str | None) -> bool:
    """فیلتر محله: همهٔ واژه‌های نام خواسته‌شده در نام محله باشد («منفرد» ← «بلوار منفرد»، «منفرد نیاکی»)."""
    if not district:
        return False
    w, d = tokens(want), tokens(district)
    if not w:
        return False
    if core(want) == core(district):
        return True
    return all(t in d for t in w)


def _pattern(name: str):
    ts = tokens(name)
    if not ts or len("".join(ts)) < 3:
        return None
    body = r"[\s‌]*".join(re.escape(t) for t in ts)
    return re.compile(rf"(?<![{FA}\w]){body}(?![{FA}\w])")


def cur(x):
    return x["_new"] if "_new" in x else x["district"]


def fix_districts(store) -> dict:
    rows = store.q("SELECT id, city_key, city_name, district, title, description FROM listings WHERE vertical='estate'")
    by_city: dict = {}
    for r in rows:
        by_city.setdefault(r["city_key"], []).append(dict(r))
    updates, stats = [], {"junk": 0, "merged": 0, "inferred": 0}
    for city, items in by_city.items():
        cname = next((x["city_name"] for x in items if x.get("city_name")), None)
        # ۱. حذف مقدارهای بی‌معنا
        for x in items:
            if x["district"] and is_junk(x["district"], cname):
                x["_new"] = None
                stats["junk"] += 1
        # ۲. یکی کردن شکل‌های یک نام: پرتکرارترین شکل
        variants: dict = {}
        for x in items:
            d = cur(x)
            if d:
                variants.setdefault(core(d), {}).setdefault(d, 0)
                variants[core(d)][d] += 1
        canon = {k: max(v.items(), key=lambda kv: (kv[1], -len(kv[0])))[0] for k, v in variants.items()}
        for x in items:
            d = cur(x)
            if d and canon.get(core(d)) and canon[core(d)] != d:
                x["_new"] = canon[core(d)]
                stats["merged"] += 1
        # ۳. نسبت دادن آگهی بی‌محله از روی عنوان و متن
        counts = {k: sum(v.values()) for k, v in variants.items()}
        gaz = []
        for k, name in canon.items():
            if counts[k] < 2 or k in GENERIC or len(k) < 3 or (cname and k == core(cname)):
                continue
            p = _pattern(name)
            if p:
                gaz.append((len(k), name, p))
        gaz.sort(key=lambda g: -g[0])
        if gaz:
            for x in items:
                d = cur(x)
                if d:
                    continue
                hit = None
                for field in ("title", "description"):
                    text = norm(x.get(field))
                    if not text:
                        continue
                    found = [(-ln, m.start(), name) for ln, name, p in gaz for m in [p.search(text)] if m]
                    if found:
                        hit = min(found)[2]   # نام بلندتر، سپس زودتر در متن
                        break
                if hit:
                    x["_new"] = hit
                    stats["inferred"] += 1
        updates += [(x["_new"], x["id"]) for x in items if "_new" in x and x["_new"] != x["district"]]
    if updates:
        with store.lock:
            store.db.executemany("UPDATE listings SET district=? WHERE id=?", updates)
            store.db.commit()
    stats["updated"] = len(updates)
    return stats
