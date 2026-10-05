"""گزارش بازار هر شهر: قیف داده، بودجه، کانون فرصت، قیمت هر متر بر حسب خواب و سن و متراژ،
ارزش آسانسور و پارکینگ و انباری درون محله، و دفتر محله‌ها.

همه عددها میانه‌اند، نه میانگین؛ گروه‌های کمتر از ۳ آگهی گزارش نمی‌شوند و کمتر از ۱۰ آگهی «دادهٔ کم» است.
"""
from __future__ import annotations

import statistics
import time

from features import jalali_year_now, kind_group

MIN_N, LOW_N = 3, 10
_cache: dict = {}

BUDGET_SALE = [(0, 1e9, "تا ۱ میلیارد"), (1e9, 2e9, "۱ تا ۲ میلیارد"), (2e9, 3e9, "۲ تا ۳ میلیارد"), (3e9, 5e9, "۳ تا ۵ میلیارد"),
               (5e9, 8e9, "۵ تا ۸ میلیارد"), (8e9, 12e9, "۸ تا ۱۲ میلیارد"), (12e9, 20e9, "۱۲ تا ۲۰ میلیارد"), (20e9, 1e15, "بیش از ۲۰ میلیارد")]
BUDGET_RENT = [(0, 3e8, "تا ۳۰۰ میلیون"), (3e8, 6e8, "۳۰۰ تا ۶۰۰ میلیون"), (6e8, 1e9, "۶۰۰ میلیون تا ۱ میلیارد"),
               (1e9, 2e9, "۱ تا ۲ میلیارد"), (2e9, 4e9, "۲ تا ۴ میلیارد"), (4e9, 1e15, "بیش از ۴ میلیارد")]
AGE_BANDS = [(0, 2, "نوساز (تا ۲ سال)"), (3, 5, "۳ تا ۵ سال"), (6, 10, "۶ تا ۱۰ سال"), (11, 20, "۱۱ تا ۲۰ سال"), (21, 999, "بیش از ۲۰ سال")]
AREA_BANDS = [(0, 60, "تا ۶۰ متر"), (60, 90, "۶۰ تا ۹۰ متر"), (90, 120, "۹۰ تا ۱۲۰ متر"), (120, 160, "۱۲۰ تا ۱۶۰ متر"), (160, 1e9, "بیش از ۱۶۰ متر")]
ROOM_NAMES = {0: "استودیو", 1: "یک‌خوابه", 2: "دوخوابه", 3: "سه‌خوابه", 4: "چهارخوابه و بیشتر"}
OPP = ("gold", "good")


def _med(v):
    return statistics.median(v) if v else None


def _group(rows, keyfn, order):
    g = {}
    for r in rows:
        k = keyfn(r)
        if k is not None:
            g.setdefault(k, []).append(r["ppm"])
    return [{"label": lab, "n": len(g.get(k, [])), "median_ppm": _med(g.get(k, [])), "low": len(g.get(k, [])) < LOW_N}
            for k, lab in order if len(g.get(k, [])) >= MIN_N]


def _band(v, bands):
    if v is None:
        return None
    for i, (lo, hi, _) in enumerate(bands):
        if lo <= v <= hi:
            return i
    return None


def market_report(store, city: str, deal: str = "sale", kind: str = "apartment") -> dict:
    vinfo = store.get_setting("valuation_info") or {}
    key = (city, deal, kind, vinfo.get("at"))
    if key in _cache:
        return _cache[key]
    q = store.q("""SELECT id, kind, district, pp, area, rooms, year, ppm, amenities, feat, label, discount, score, excluded,
                          first_seen, deposit, rent FROM listings
                   WHERE status='active' AND hidden=0 AND vertical='estate' AND city_key=? AND deal=?""", (city, deal))
    allrows = [store.row_to_dict(r) for r in q if kind_group(r["kind"]) == kind]
    now = int(time.time())
    yr = jalali_year_now()
    valid = []
    for r in allrows:
        if r["excluded"] or not r.get("pp") or not r.get("area"):
            continue
        r["ppm"] = r["pp"] / r["area"]
        f = r.get("feat") or {}
        r["age"] = f.get("age") if f.get("age") is not None else (yr - r["year"] if r.get("year") else None)
        valid.append(r)
    scored = [r for r in valid if r["score"] is not None]
    opps = [r for r in scored if r["label"] in OPP]

    # قیف
    funnel = [
        {"k": "read", "label": "خوانده شد", "n": len(allrows)},
        {"k": "dropped", "label": "کنار رفت: پیش‌فروش، مشارکت، تکراری، بی‌قیمت", "n": sum(1 for r in allrows if r["label"] == "excluded" or (not r["excluded"] and not (r.get("pp") and r.get("area"))))},
        {"k": "sus", "label": "قیمت مشکوک", "n": sum(1 for r in allrows if r["label"] == "sus")},
        {"k": "pending", "label": "در انتظار داده: محله آگهی کافی ندارد", "n": sum(1 for r in valid if r["score"] is None)},
        {"k": "scored", "label": "سنجیده شد، هر کدام با محلهٔ خودش", "n": len(scored)},
        {"k": "opp", "label": "فرصت", "n": len(opps)},
    ]

    # محله‌ها
    by_d = {}
    for r in valid:
        by_d.setdefault(r.get("district") or "", []).append(r)
    city_ppm = _med([r["ppm"] for r in valid])
    districts = []
    for d, rs in by_d.items():
        if not d or len(rs) < MIN_N:
            continue
        ppm = _med([r["ppm"] for r in rs])
        el = [r for r in rs if (r.get("feat") or {}).get("elevator") is not None]
        districts.append({
            "name": d, "n": len(rs), "median_ppm": ppm, "median_price": _med([r["pp"] for r in rs]),
            "median_area": _med([r["area"] for r in rs]), "opportunities": sum(1 for r in rs if r["label"] in OPP),
            "gold": sum(1 for r in rs if r["label"] == "gold"), "scored": sum(1 for r in rs if r["score"] is not None),
            "elevator_share": (sum(1 for r in el if (r.get("feat") or {}).get("elevator")) / len(el)) if el else None,
            "vs_city": (ppm / city_ppm - 1) if city_ppm else None, "low": len(rs) < LOW_N})
    districts.sort(key=lambda x: -x["median_ppm"])

    # بودجه
    bands = BUDGET_SALE if deal == "sale" else BUDGET_RENT
    budget = [{"label": lab, "n": 0, "good": 0, "gold": 0} for _, _, lab in bands]
    for r in valid:
        i = _band(r["pp"], bands)
        if i is not None:
            budget[i]["n"] += 1
            if r["label"] == "gold":
                budget[i]["gold"] += 1
            elif r["label"] == "good":
                budget[i]["good"] += 1
    budget = [b for b in budget if b["n"]]

    # ارزش امکانات درون محله
    amenities = []
    for k, name in (("elevator", "آسانسور"), ("parking", "پارکینگ"), ("warehouse", "انباری")):
        ratios, higher, have, known = [], 0, 0, 0
        for d, rs in by_d.items():
            w = [r["ppm"] for r in rs if (r.get("feat") or {}).get(k)]
            wo = [r["ppm"] for r in rs if (r.get("feat") or {}).get(k) == 0]
            known += len(w) + len(wo)
            have += len(w)
            if d and len(w) >= MIN_N and len(wo) >= MIN_N:
                ratio = _med(w) / _med(wo)
                ratios.append(ratio)
                higher += ratio > 1
        amenities.append({"key": k, "name": name, "premium": (_med(ratios) - 1) if ratios else None,
                          "districts": len(ratios), "higher": higher, "share": (have / known) if known else None})

    hotspots = sorted([d for d in districts if d["opportunities"]], key=lambda d: (-d["opportunities"], -d["gold"]))[:10]
    ranked = [d for d in districts if not d["low"]] or districts
    cheap = sorted(ranked, key=lambda d: d["median_ppm"])[:5]
    pricey = sorted(ranked, key=lambda d: -d["median_ppm"])[:5]
    ratio = (pricey[0]["median_ppm"] / cheap[0]["median_ppm"]) if cheap and pricey and cheap[0]["median_ppm"] else None
    discounts = sorted(r["discount"] for r in opps if r["discount"] is not None)
    rep = {
        "city": city, "deal": deal, "kind": kind, "at": vinfo.get("at"),
        "overview": {
            "valid": len(valid), "scored": len(scored), "median_ppm": city_ppm, "median_price": _med([r["pp"] for r in valid]),
            "median_area": _med([r["area"] for r in valid]),
            "median_year": _med([r["year"] for r in valid if r.get("year")]),
            "median_deposit": _med([r["deposit"] for r in valid if r.get("deposit") is not None]) if deal == "rent" else None,
            "median_rent": _med([r["rent"] for r in valid if r.get("rent")]) if deal == "rent" else None,
            "n_districts": len(districts), "spread": ratio, "opportunities": len(opps),
            "gold": sum(1 for r in opps if r["label"] == "gold"),
            "per100": (100 * len(opps) / len(scored)) if scored else None,
            "opp_median_discount": discounts[len(discounts) // 2] if discounts else None,
            "fresh_7d": sum(1 for r in valid if (r.get("first_seen") or 0) > now - 7 * 86400),
            "fresh_24h": sum(1 for r in valid if (r.get("first_seen") or 0) > now - 86400),
        },
        "funnel": funnel, "budget": budget, "hotspots": hotspots,
        "by_rooms": _group(valid, lambda r: min(4, r["rooms"]) if r.get("rooms") is not None else None, sorted(ROOM_NAMES.items())),
        "by_age": _group(valid, lambda r: _band(r["age"], AGE_BANDS), [(i, b[2]) for i, b in enumerate(AGE_BANDS)]),
        "by_area": _group(valid, lambda r: _band(r["area"], AREA_BANDS), [(i, b[2]) for i, b in enumerate(AREA_BANDS)]),
        "amenities": amenities, "cheap": cheap, "pricey": pricey, "districts": districts,
    }
    if len(_cache) > 200:
        _cache.clear()
    _cache[key] = rep
    return rep
