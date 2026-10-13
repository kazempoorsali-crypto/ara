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


# ---------------------------------------------------------------- مختصات محله‌ها
def _med(v):
    v = sorted(v)
    return v[len(v) // 2] if v else None


def _offset(key: str, spread=0.0028):
    import hashlib
    h = hashlib.sha1(key.encode()).digest()
    return (h[0] / 255 - 0.5) * 2 * spread, (h[1] / 255 - 0.5) * 2 * spread * 1.25


def place_listings(store) -> dict:
    """مرکز هر محله: میانهٔ مختصات دقیق آگهی‌هایش، وگرنه مختصاتی که از نام محله یافته شده (geo_cache).
    آگهی‌های بدون مختصات دقیق دور مرکز محلهٔ خودشان (حدود ۳۰۰ متر) قرار می‌گیرند، نه پراکنده در کل شهر."""
    import catalog
    rows = store.q("""SELECT id, city_key, district, lat, lng, COALESCE(latlng_exact,0) ex, COALESCE(settlement,'urban') st FROM listings
                      WHERE vertical='estate' AND district IS NOT NULL AND district != ''""")
    rural = rural_districts(store)
    geo = store.get_setting("geo_cache") or {}
    exact: dict = {}
    for r in rows:
        if r["ex"] and r["lat"] and r["lng"]:
            exact.setdefault(f'{r["city_key"]}|{r["district"]}', []).append((r["lat"], r["lng"]))
    centers = {}
    for r in rows:
        k = f'{r["city_key"]}|{r["district"]}'
        if k in centers:
            continue
        c = catalog.CITY_BY_KEY.get(r["city_key"])
        pts = exact.get(k)
        if pts:
            centers[k] = [round(_med([p[0] for p in pts]), 5), round(_med([p[1] for p in pts]), 5), "exact"]
        elif isinstance(geo.get(k), dict) and geo[k].get("ll") and geo[k].get("v") == GEO_V:
            centers[k] = [*geo[k]["ll"], "geo"]
        # مرکز دورتر از حدود ۱۳ کیلومتر از مرکز شهر، خطاست
        # محلهٔ شهری: نزدیک مرکز شهر؛ روستا و نواحی حاشیه‌ای شهرستان: تا حدود ۳۵ کیلومتر، در جای واقعی خودش
        lim = (0.32, 0.38) if k in rural else (0.12, 0.14) if k in centers and centers[k][2] == "exact" else (0.065, 0.08)
        if k in centers and c and (abs(centers[k][0] - c["lat"]) > lim[0] or abs(centers[k][1] - c["lng"]) > lim[1]):
            centers.pop(k)
    upd = []
    for r in rows:
        k = f'{r["city_key"]}|{r["district"]}'
        if r["ex"]:
            continue
        if k not in centers:
            # روستا یا ناحیهٔ حاشیه‌ای بی‌مکان: روی نقشه داخل شهر گذاشته نمی‌شود
            if k in rural and r["lat"] is not None:
                upd.append((None, None, r["id"]))
            continue
        dy, dx = _offset(r["id"])
        lat, lng = round(centers[k][0] + dy, 5), round(centers[k][1] + dx, 5)
        if r["lat"] is None or abs((r["lat"] or 0) - lat) > 1e-5 or abs((r["lng"] or 0) - lng) > 1e-5:
            upd.append((lat, lng, r["id"]))
    if upd:
        with store.lock:
            store.db.executemany("UPDATE listings SET lat=?, lng=? WHERE id=?", upd)
            store.db.commit()
    store.set_setting("district_centers", centers)
    return {"centers": len(centers), "placed": len(upd)}


GEO_V = 2   # نسخهٔ قاعدهٔ مکان‌یابی؛ با تغییرش جست‌وجوهای قبلی دوباره انجام می‌شود


def rural_districts(store) -> set:
    """محله‌هایی که بیشتر آگهی‌هایشان روستایی یا خارج از محدودهٔ شهرند (روستاهای شهرستان، نه محلهٔ شهر)."""
    out = set()
    for r in store.q("""SELECT city_key, district, COUNT(*) n, SUM(COALESCE(settlement,'urban')='rural') rr FROM listings
                        WHERE vertical='estate' AND district IS NOT NULL AND district != '' GROUP BY city_key, district"""):
        if r["rr"] * 2 > r["n"]:
            out.add(f'{r["city_key"]}|{r["district"]}')
    return out


def missing_geo(store, limit=40):
    """محله‌هایی که نه آگهی با مختصات دقیق دارند و نه در ۳۰ روز گذشته جست‌وجوی مکانی شده‌اند."""
    import time
    centers = store.get_setting("district_centers") or {}
    geo = store.get_setting("geo_cache") or {}
    now = time.time()
    out = []
    for r in store.q("""SELECT city_key, district, COUNT(*) n FROM listings WHERE vertical='estate' AND status='active'
                        AND district IS NOT NULL AND district != '' GROUP BY city_key, district ORDER BY n DESC"""):
        k = f'{r["city_key"]}|{r["district"]}'
        if k in centers or (k in geo and geo[k].get("v") == GEO_V and now - geo[k].get("at", 0) < 30 * 86400):
            continue
        out.append((r["city_key"], r["district"]))
        if len(out) >= limit:
            break
    return out


def geocode_once(store, limit=40, pause=1.2) -> int:
    """نام محله را با Nominatim (OpenStreetMap) به مختصات تبدیل می‌کند؛ فقط درون محدودهٔ شهر. نتیجه (حتی ناموفق) کش می‌شود."""
    import json
    import time
    import urllib.parse
    import urllib.request
    import catalog
    from divar_client import NET, _opener
    todo = missing_geo(store, limit)
    if not todo:
        return 0
    geo = store.get_setting("geo_cache") or {}
    rural = rural_districts(store)
    found = 0
    for city, district in todo:
        c = catalog.CITY_BY_KEY.get(city)
        k = f"{city}|{district}"
        geo[k] = {"at": int(time.time()), "ll": None, "v": GEO_V}
        if not c:
            continue
        r_ = 0.32 if k in rural else 0.065   # روستا: کل شهرستان؛ محلهٔ شهری: فقط محدودهٔ شهر
        vb = f'{c["lng"] - r_ * 1.2},{c["lat"] + r_},{c["lng"] + r_ * 1.2},{c["lat"] - r_}'
        for name in dict.fromkeys([norm(district), " ".join(tokens(district))]):
            q = urllib.parse.urlencode({"q": f'{name}، {c["name"]}', "format": "json", "limit": 1, "countrycodes": "ir",
                                        "viewbox": vb, "bounded": 1, "accept-language": "fa"})
            req = urllib.request.Request("https://nominatim.openstreetmap.org/search?" + q,
                                         headers={"user-agent": "forsatmelk.ir district geocoder (+https://forsatmelk.ir)"})
            try:
                with _opener(NET["proxy"]).open(req, timeout=10) as resp:
                    res = json.loads(resp.read(200_000) or b"[]")
            except Exception:  # noqa: BLE001
                res = []
            time.sleep(pause)
            if res:
                geo[k]["ll"] = [round(float(res[0]["lat"]), 5), round(float(res[0]["lon"]), 5)]
                found += 1
                break
    store.set_setting("geo_cache", geo)
    return found
