"""دادهٔ آغازین صفحه‌های سایت (index / sky / property) که سرور در خود HTML می‌گذارد.

همهٔ عددها از پایگاه داده و موتور ارزش‌گذاری می‌آیند؛ اگر داده‌ای نباشد، فیلد خالی می‌ماند
و صفحه آن بخش را پنهان می‌کند (هیچ عدد ساختگی‌ای ساخته نمی‌شود).
"""
import json

import catalog

# فیلدهایی از آگهی که صفحه لازم دارد (بقیه برای کم شدن حجم HTML حذف می‌شوند)
KEEP = ("id", "title", "kind", "deal", "city_key", "city_name", "province", "district", "price", "pp", "ppm",
        "deposit", "rent", "area", "rooms", "year", "floor", "images", "image", "amenities", "description",
        "label", "score", "discount", "confidence", "verdict", "locked", "presale", "first_seen", "price_drop",
        "lat", "lng", "latlng_exact", "history", "similar", "fair_price", "fair_ppm", "detail_pending", "contact_mode")


def _trim(d):
    out = {k: d[k] for k in KEEP if k in d and d[k] not in (None, "", [])}
    if isinstance(out.get("images"), list):
        out["images"] = out["images"][:6]
    if isinstance(out.get("description"), str):
        out["description"] = out["description"][:1200]
    return out


def regions(store):
    """استان ← شهرهای دارای آگهی ← محله‌ها با میانهٔ قیمت هر متر (فروش آپارتمان، در نبود آن هر نوع)."""
    st = store.stats()
    cities = st.get("cities") or {}
    med = {}
    for r in store.q("SELECT city_key, district, kind, n, median, p25, p75 FROM market WHERE deal='sale' AND district IS NOT NULL AND district != ''"):
        key = (r["city_key"], r["district"])
        best = med.get(key)
        rank = 0 if r["kind"] == "apartment" else 1
        if not best or (rank, -r["n"]) < (best[0], -best[2]):
            med[key] = (rank, r["median"], r["n"], r["p25"], r["p75"])
    out = {}
    for ck, info in cities.items():
        c = catalog.CITY_BY_KEY.get(ck)
        if not c:
            continue
        prov = out.setdefault(c["province"], {"id": c["province"], "name": (catalog.PROVINCES.get(c["province"]) or {}).get("name", c["province"]),
                                              "cities": []})
        ds = sorted(({"id": d, "name": d, "ppm": round(v[1]), "n": v[2], "p25": round(v[3] or 0), "p75": round(v[4] or 0)} for (k, d), v in med.items() if k == ck), key=lambda x: -x["n"])
        prov["cities"].append({"id": ck, "name": c["name"], "lat": c["lat"], "lng": c["lng"], "n": info.get("n", 0), "districts": ds})
    for p in out.values():
        p["cities"].sort(key=lambda x: -x["n"])
    return sorted(out.values(), key=lambda p: -sum(c["n"] for c in p["cities"]))


def market_of(store, d):
    """آمار قیمت هر متر بازار همین ملک: اول محلهٔ خودش (همان نوع و معامله)، در نبود دادهٔ کافی کل شهر."""
    kind, deal = d.get("kind") or "apartment", d.get("deal") or "sale"
    if d.get("district"):
        r = store.q("SELECT n, median, p25, p75 FROM market WHERE city_key=? AND district=? AND kind=? AND deal=?",
                    (d["city_key"], d["district"], kind, deal), one=True)
        if r and r["n"] and r["n"] >= 3 and r["median"]:
            return {"scope": "district", "name": d["district"], "n": r["n"], "median": round(r["median"]),
                    "p25": round(r["p25"] or 0), "p75": round(r["p75"] or 0)}
    rows = store.q("SELECT n, median, p25, p75 FROM market WHERE city_key=? AND kind=? AND deal=? AND median > 0", (d["city_key"], kind, deal))
    n = sum(r["n"] for r in rows)
    if n >= 3:
        w = lambda k: round(sum((r[k] or 0) * r["n"] for r in rows) / n)
        return {"scope": "city", "name": d.get("city_name") or "", "n": n, "median": w("median"), "p25": w("p25"), "p75": w("p75")}
    return None


def common(app):
    store = app.store
    st = store.stats()
    regs = regions(store)
    th = {**{"opp": 0.15, "gold": 0.22, "over": 0.30}, **(store.get_setting("thresholds") or {})}
    return {
        "stats": {"total": st.get("estate") or 0, "deals": st.get("deals") or 0, "gold": st.get("gold") or 0,
                  "today": st.get("today") or 0, "updated": st.get("updated") or 0,
                  "cities": sum(len(p["cities"]) for p in regs),
                  "districts": sum(len(c["districts"]) for p in regs for c in p["cities"])},
        "thresholds": {k: th[k] for k in ("opp", "gold", "over")},
        "regions": regs,
    }


def boot(handler, page, qs):
    """داده‌ای که در صفحه با window.FM_BOOT در دسترس است (برای مهمان؛ پس از ورود، صفحه خودش دوباره می‌خواند)."""
    app = handler.app
    data = {"page": page, **common(app)}
    if page in ("home", "sky"):
        top = app.store.search({"opp": 1, "sort": "score", "limit": 12})["items"]
        if len(top) < 6:  # فرصت کم است: بهترین‌های سنجیده‌شده (نه مشکوک) هم می‌آیند
            seen = {x["id"] for x in top}
            top += [x for x in app.store.search({"ranked": 1, "sort": "score", "limit": 12})["items"] if x["id"] not in seen][: 12 - len(top)]
        data["properties"] = [_trim(handler.gate(dict(x), None)) for x in top]
    if page == "property":
        lid = (qs.get("id") or "").strip()
        d = app.store.get(lid) if lid else None
        if d and not d.get("hidden"):
            d["verdict"] = app.store.verdict(d)
            d["history"] = app.store.history(d["id"])
            d["similar"] = [_trim(handler.gate(dict(x), None)) for x in handler.similar(d)]
            data["market"] = market_of(app.store, d)
            data["property"] = _trim(handler.gate(d, None, full=True))
    return data


def inject(html: bytes, data: dict) -> bytes:
    js = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    tag = f"<script>window.FM_BOOT={js};</script>".encode()
    if b"<!--FM_BOOT-->" in html:
        return html.replace(b"<!--FM_BOOT-->", tag, 1)
    return html.replace(b"</head>", tag + b"\n</head>", 1)
