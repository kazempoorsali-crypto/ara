import re
"""دادهٔ آغازین صفحه‌های سایت (index / sky / property) که سرور در خود HTML می‌گذارد.

همهٔ عددها از پایگاه داده و موتور ارزش‌گذاری می‌آیند؛ اگر داده‌ای نباشد، فیلد خالی می‌ماند
و صفحه آن بخش را پنهان می‌کند (هیچ عدد ساختگی‌ای ساخته نمی‌شود).
"""
import json
import random
import threading
import time

import catalog

# فیلدهایی از آگهی که صفحه لازم دارد (بقیه برای کم شدن حجم HTML حذف می‌شوند)
KEEP = ("id", "title", "kind", "deal", "city_key", "city_name", "province", "district", "price", "pp", "ppm",
        "deposit", "rent", "area", "rooms", "year", "floor", "images", "image", "amenities", "description",
        "label", "score", "discount", "confidence", "verdict", "locked", "presale", "first_seen", "price_drop",
        "lat", "lng", "latlng_exact", "history", "similar", "fair_price", "fair_ppm", "estimated_profit", "detail_pending", "contact_mode", "why", "drop_info")


def _img_key(u: str) -> str:
    name = str(u).split("?")[0].rstrip("/").rsplit("/", 1)[-1].lower()
    name = re.sub(r"\.(webp|jpe?g|png|gif|avif)$", "", name)
    return re.sub(r"([_.-](\d{2,4}x\d{2,4}|thumb|thumbnail|small|medium|large|big|orig))+$", "", name)


def dedup_images(images) -> list:
    """فهرست عکس‌ها بدون تکرار؛ از دو نسخهٔ یک عکس، نسخهٔ غیر بندانگشتی (بزرگ) می‌ماند و ترتیب حفظ می‌شود."""
    order, best = [], {}
    small = lambda u: bool(re.search(r"thumb|small|_\d{2,3}x\d{2,3}", str(u), re.I))
    for u in images or []:
        if not u:
            continue
        k = _img_key(u)
        if k not in best:
            order.append(k)
            best[k] = u
        elif small(best[k]) and not small(u):
            best[k] = u
    return [best[k] for k in order]


def _trim(d):
    out = {k: d[k] for k in KEEP if k in d and d[k] not in (None, "", [])}
    if isinstance(out.get("images"), list):
        out["images"] = dedup_images(out["images"])[:10]
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
        ds = sorted(({"id": d, "name": d, "ppm": round(v[1]), "n": v[2], "p25": round(v[3] or 0), "p75": round(v[4] or 0)} for (k, d), v in med.items() if k == ck), key=lambda x: -x["n"])[:150]   # پرآگهی‌ترین محله‌ها؛ فهرست کامل حجم صفحه را زیاد می‌کرد
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


_CACHE = {}
_BUSY = set()


def cached(key, ttl, fn):
    """نتیجهٔ پرس‌وجوهای سنگین (آمار، محله‌ها، فرصت‌های برتر) چند ثانیه نگه داشته می‌شود تا صفحه سریع باز شود."""
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    if hit:   # کهنه ولی موجود: همان فوراً برمی‌گردد و نسخهٔ تازه در پس‌زمینه ساخته می‌شود
        if key not in _BUSY:
            _BUSY.add(key)

            def refresh():
                try:
                    _CACHE[key] = (time.time(), fn())
                except Exception:  # noqa: BLE001
                    pass
                finally:
                    _BUSY.discard(key)
            threading.Thread(target=refresh, daemon=True).start()
        return hit[1]
    val = fn()
    _CACHE[key] = (time.time(), val)
    return val


def common(app):
    return cached("common", 60, lambda: _common(app))


def _common(app):
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


def _top(handler, user=None):
    """برترین فرصت‌های خالص برای ویترین صفحه اول (بدون پیش‌فروش، بدون اقساطی/معاوضه و بدون هشدار مشکوک)."""
    app = handler.app
    raw_items = app.store.search({"opp": 1, "deal": "sale", "sort": "score", "limit": 120, "imgs": 1})["items"]
    bad_words = ("پیش فروش", "پیش‌فروش", "اقساط", "قسطی", "معاوضه", "مشارکت", "اسکلت", "نیمه کاره", "نیمه‌کاره", "قولنامه", "نسق", "وکالتی")
    clean_top = []
    for x in raw_items:
        if x.get("presale"):
            continue
        t_desc = (str(x.get("title") or "") + " " + str(x.get("description") or "")[:200])
        if any(w in t_desc for w in bad_words):
            continue
        ex = x.get("explain") if isinstance(x.get("explain"), dict) else {}
        if ex.get("caution") or ex.get("sus"):
            continue
        imgs = x.get("images") or ([] if not x.get("image") else [x.get("image")])
        if len(imgs) < 2:
            continue
        if ex.get("estimated_profit"):
            x["estimated_profit"] = ex["estimated_profit"]
        clean_top.append(x)
        if len(clean_top) >= 24:
            break
    if len(clean_top) < 24:
        seen = {x["id"] for x in clean_top}
        for x in raw_items:
            if x["id"] not in seen and not x.get("presale"):
                ex = x.get("explain") if isinstance(x.get("explain"), dict) else {}
                if ex.get("estimated_profit"):
                    x["estimated_profit"] = ex["estimated_profit"]
                clean_top.append(x)
                if len(clean_top) >= 24:
                    break
    return [_trim(handler.gate(dict(x), user)) for x in clean_top[:24]]


def mark_sub(html: str) -> str:
    """مشترک: نشانهٔ is-sub از همان اول روی <html> تا قفل‌ها حتی یک لحظه دیده نشوند."""
    return re.sub(r"<html\b([^>]*)>", lambda m: m.group(0) if "is-sub" in m.group(1) else
                  ("<html" + re.sub(r'class="', 'class="is-sub ', m.group(1), 1) + ">" if 'class="' in m.group(1) else "<html" + m.group(1) + ' class="is-sub">'), html, count=1)


def boot(handler, page, qs):
    """داده‌ای که در صفحه با window.FM_BOOT در دسترس است.
    کاربر واردشده (کوکی fy_t): حساب و فرصت‌ها از همان اول برای خودش ساخته می‌شود؛ مشترک قفل نمی‌بیند."""
    app = handler.app
    data = {"page": page, **common(app)}
    u = handler.page_user()
    if u:
        data["me"] = u
    if page in ("home", "sky"):
        if u and u.get("active"):   # فهرست مشترکان برای همهٔ مشترکان یکی است
            data["properties"] = cached("top-sub", 60, lambda: _top(handler, u))
        else:
            data["properties"] = cached("top", 60, lambda: _top(handler))
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


def articles_html(app) -> str:
    """بخش «از مجلهٔ فرصت ملک» صفحهٔ اول: پیوند واقعی (قابل خزش برای گوگل) به تازه‌ترین مقاله‌ها و راهنماها."""
    import seo
    arts = cached("arts-home", 300, lambda: seo.articles_list(app.store, 6))
    esc = lambda t: str(t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    import urllib.parse
    cards = "".join(
        f'<a class="mag__card" href="/maghale/{urllib.parse.quote(a["slug"])}"><b>{esc(a["title"])}</b>'
        f'{"<span>" + esc(a.get("summary"))[:160] + "</span>" if a.get("summary") else ""}<i>خواندن ←</i></a>' for a in arts)
    guides = [("/rahnama/melk-arzan", "ملک زیر قیمت را چطور پیدا کنیم؟"), ("/rahnama/gheymat-mahalle", "قیمت هر متر محله را چطور به دست بیاوریم؟"),
              ("/rahnama/kharid-melk", "چک‌لیست خرید ملک"), ("/rahnama/ejare", "چک‌لیست رهن و اجاره"), ("/rahnama/pish-forosh", "راهنمای خرید پیش‌فروش")]
    gl = "".join(f'<a href="{u}">{t}</a>' for u, t in guides)
    grid = f'<div class="mag__grid">{cards}</div>' if cards else ""
    return (f'<section class="mag" id="magazine" aria-labelledby="magT"><div class="mag__in">'
            f'<div class="mag__head"><p class="eyebrow">مجلهٔ فرصت ملک</p><h2 class="section-title" id="magT">مقاله‌ها و راهنمای خرید ملک</h2>'
            f'<a class="mag__all" href="/maghale">همهٔ مقاله‌ها ←</a></div>'
            f'{grid}'
            f'<nav class="mag__guides" aria-label="راهنماها">{gl}</nav></div></section>')


def video_embed(url: str):
    """پیوند ویدیو ← (نوع، نشانی جاسازی). آپارات: aparat.com/v/HASH؛ یوتیوب؛ یا فایل مستقیم mp4/webm."""
    u = (url or "").strip()
    # پیوند صفحهٔ ویدیو، پیوند کوتاه، یا کد جاسازی کامل (iframe یا script) که آپارات می‌دهد
    m = re.search(r"aparat\.com/(?:v|embed|video/video/embed/videohash)/([A-Za-z0-9]{3,32})", u)
    if m:
        return ("iframe", f"https://www.aparat.com/video/video/embed/videohash/{m.group(1)}/vt/frame")
    if not u.startswith("https://"):
        return None
    m = re.search(r"(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([\w-]{6,20})", u)
    if m:
        return ("iframe", f"https://www.youtube-nocookie.com/embed/{m.group(1)}")
    if re.search(r"\.(mp4|webm)(\?|$)", u, re.I):
        return ("video", u)
    return None


def video_html(app) -> str:
    """بخش ویدیوی معرفی صفحهٔ اول؛ پیوند، عنوان و توضیح از پنل مدیریت (تنظیمات سایت)."""
    site = app.store.get_setting("site") or {}
    esc = lambda t: str(t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    # ویدیوهای فعال (فهرست پنل؛ برای سازگاری، پیوند تکی قدیمی هم)؛ هر بازدید یکی به‌تصادف
    pool = [v for v in (site.get("videos") or []) if isinstance(v, dict) and v.get("on") and video_embed(v.get("url") or "")]
    if not pool and video_embed(site.get("video_url") or ""):
        pool = [{"url": site["video_url"]}]
    pick = random.choice(pool) if pool else {}
    title = esc(pick.get("title") or site.get("video_title") or "فرصت ملک در یک نگاه")
    desc = esc(pick.get("desc") or site.get("video_desc") or "در چند دقیقه ببینید فرصت ملک چطور قیمت هر آگهی را با محلهٔ خودش می‌سنجد و فرصت‌های واقعی را پیدا می‌کند.")
    emb = video_embed(pick.get("url") or "")
    if emb and emb[0] == "iframe":
        player = (f'<iframe src="{esc(emb[1])}" title="{title}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" '
                  'allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>')
    elif emb:
        player = f'<video src="{esc(emb[1])}" controls preload="metadata" playsinline></video>'
    else:
        player = '<div class="vid__soon"><i aria-hidden="true">▶</i><b>ویدیوی معرفی به‌زودی</b></div>'
    return (f'<section class="vid" id="video" aria-labelledby="vidT"><div class="vid__in">'
            f'<div class="vid__txt"><p class="eyebrow">معرفی فرصت ملک</p><h2 class="section-title" id="vidT">{title}</h2><p class="section-sub">{desc}</p>'
            f'<div class="vid__acts"><a class="btn btn--gold" href="#homefilter" data-scroll-to>شروع جست‌وجو</a><a class="btn btn--ghost" href="/maghale/asansor-arzesh">آسانسور ارزش ←</a></div></div>'
            f'<div class="vid__box"><div class="vid__frame">{player}</div>'
            + ('<button type="button" class="vid__fs" data-vid-fs>⛶ نمایش تمام‌صفحه</button>' if emb else "")
            + '</div></div></section>')


def inject(html: bytes, data: dict) -> bytes:
    if (data.get("me") or {}).get("active"):
        html = mark_sub(html.decode()).encode()
    js = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    tag = f"<script>window.FM_BOOT={js};</script>".encode()
    if b"<!--FM_BOOT-->" in html:
        return html.replace(b"<!--FM_BOOT-->", tag, 1)
    return html.replace(b"</head>", tag + b"\n</head>", 1)
