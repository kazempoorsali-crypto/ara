"""سئو: صفحه‌های واقعی و قابل خواندن برای موتورهای جست‌وجو.

سایت یک برنامهٔ تک‌صفحه‌ای با مسیرهای «#» است که گوگل آن‌ها را صفحهٔ جدا نمی‌شمارد. این ماژول برای هر شهر، هر محله و
هر آگهی یک نشانی واقعی می‌سازد (/melk/rasht، /melk/rasht/گلسار، /ad/dv-xxxx) و همان index.html را با عنوان، توضیح،
پیوند متعارف (canonical)، داده‌های ساخت‌یافتهٔ schema.org و متن و پیوندهای ازپیش‌ساخته برمی‌گرداند. کاربر واقعی پس از
بارگذاری به همان صفحه در برنامه برده می‌شود. فقط داده‌های عمومی نمایش داده می‌شود (نه قیمت منصفانه، نه پیوند منبع).
"""
from __future__ import annotations

import html
import json
import re
import time
import urllib.parse

import catalog
from report import market_report

ESC = html.escape
KIND = {"apartment": "آپارتمان", "suite": "سوئیت", "villa": "ویلا", "land": "زمین", "garden": "باغ", "shop": "مغازه", "office": "دفتر کار"}
DEAL = {"sale": "فروش", "rent": "رهن و اجاره", "daily": "اجارهٔ روزانه"}
LABEL = {"gold": "فرصت طلایی", "good": "زیر قیمت محله", "fair": "هم‌قیمت محله", "high": "بالاتر از قیمت محله"}
FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def fa(n) -> str:
    return f"{int(round(n)):,}".replace(",", "٬").translate(FA) if n is not None else ""


def money(v) -> str:
    if not v:
        return ""
    if v >= 1e9:
        return (f"{v / 1e9:.2f}".rstrip("0").rstrip(".")).replace(".", "٫").translate(FA) + " میلیارد تومان"
    if v >= 1e6:
        return fa(v / 1e6) + " میلیون تومان"
    return fa(v) + " تومان"


def band(d) -> str:
    """درصد فاصله به صورت بازهٔ ۵ درصدی، نه عدد دقیق."""
    if d is None or d < 0.05:
        return ""
    lo = int(d * 100) // 5 * 5
    return f"حدود {fa(lo)} تا {fa(lo + 5)}٪ زیر قیمت محله"


def city_path(key, district=None):
    return "/melk/" + key + ("/" + urllib.parse.quote(district) if district else "")


# ---------------------------------------------------------------- page builders
def _listing_rows(store, where, args, limit=12):
    q = store.q(f"""SELECT id, title, district, city_key, kind, deal, pp, price, area, label, discount, score FROM listings
                    WHERE status='active' AND hidden=0 AND vertical='estate' AND COALESCE(excluded,0)=0 AND {where}
                    ORDER BY (label IN ('gold','good')) DESC, score DESC LIMIT ?""", (*args, limit))
    return [dict(r) for r in q]


def _li(l, site):
    c = catalog.CITY_BY_KEY.get(l["city_key"], {})
    bits = [x for x in (KIND.get(l["kind"]), (fa(l["area"]) + " متر") if l.get("area") else "", l.get("district"), c.get("name")) if x]
    tag = LABEL.get(l.get("label") or "", "")
    gap = band(l.get("discount")) if l.get("label") in ("gold", "good") else ""
    return (f'<li><a href="/ad/{ESC(l["id"])}">{ESC(l["title"] or "آگهی ملک")}</a> — {ESC("، ".join(bits))}'
            f'{"، " + ESC(money(l.get("price") or l.get("pp"))) if (l.get("price") or l.get("pp")) else ""}'
            f'{" — " + ESC(tag) if tag else ""}{"، " + ESC(gap) if gap else ""}</li>')


def home(app, base):
    st, site = app.store, app.public_config()["site"]
    regions = app.regions()
    cities = [c for c in catalog.CITIES if c["province"] in regions["active"]]
    counts = {r["city_key"]: r["n"] for r in st.q("""SELECT city_key, COUNT(*) n FROM listings WHERE status='active' AND hidden=0
                                                       AND vertical='estate' GROUP BY city_key""")}
    provs = []
    for p in regions["active"]:
        items = "".join(f'<li><a href="{city_path(c["key"])}">خرید و اجارهٔ ملک در {ESC(c["name"])}</a>{" (" + fa(counts[c["key"]]) + " آگهی)" if counts.get(c["key"]) else ""}</li>'
                        for c in cities if c["province"] == p)
        provs.append(f'<h3>استان {ESC(catalog.PROVINCES[p]["name"])}</h3><ul>{items}</ul>')
    top = "".join(_li(l, site) for l in _listing_rows(st, "label IN ('gold','good')", (), 15))
    body = (f'<h1>{ESC(site["name"])}: ملک زیر قیمت، محله به محله</h1>'
            f'<p>{ESC(site["name"])} آگهی‌های عمومی ملک را شهر به شهر می‌خواند و هر آگهی را فقط با آگهی‌های مشابه همان محله، با در نظر گرفتن متراژ، سن بنا، طبقه، آسانسور، پارکینگ و سند می‌سنجد. فرصت‌های زیر قیمت محله رتبه‌بندی و قیمت‌های مشکوک جدا می‌شوند.</p>'
            + (f'<h2>برترین فرصت‌های امروز</h2><ul>{top}</ul>' if top else "")
            + f'<h2>راهنمای قیمت ملک شهرها</h2>{"".join(provs)}')
    title = f'{site["name"]} | ملک زیر قیمت، محله به محله'
    desc = ("آگهی‌های ملک شهرهای ایران، محله به محله با قیمت منصفانهٔ هر محله سنجیده می‌شوند؛ آپارتمان، ویلا و زمین زیر قیمت را "
            "برای خرید و اجاره پیش از بقیه پیدا کنید.")
    ld = [{"@context": "https://schema.org", "@type": "WebSite", "name": site["name"], "url": base + "/",
           "inLanguage": "fa-IR", "description": desc},
          {"@context": "https://schema.org", "@type": "Organization", "name": site["name"], "url": base + "/", "logo": base + "/favicon.svg"}]
    return {"title": title, "desc": desc, "canonical": base + "/", "body": body, "ld": ld, "hash": ""}


def city(app, base, key, district=None):
    c = catalog.CITY_BY_KEY.get(key)
    if not c:
        return None
    st, site = app.store, app.public_config()["site"]
    name = c["name"]
    if district:
        dkey = district.replace(" ", "").replace("‌", "")
        match = next((d for d in st.districts(key) if d["name"].replace(" ", "").replace("‌", "") == dkey), None)
        if not match:
            return None
        district = match["name"]
        rows = _listing_rows(st, "city_key=? AND REPLACE(REPLACE(district,' ',''),'‌','')=?", (key, dkey), 30)
        n, opp = match["n"], match["opp"]
        title = f"خرید و اجارهٔ ملک در {district} {name} | قیمت روز و فرصت‌های زیر قیمت | {site['name']}"
        desc = (f"{fa(n)} آگهی ملک فعال در محلهٔ {district} {name}" + (f"، {fa(opp)} فرصت زیر قیمت محله" if opp else "")
                + "؛ آپارتمان، ویلا و زمین با سنجش قیمت هر آگهی در برابر آگهی‌های مشابه همین محله.")
        h1 = f"ملک در محلهٔ {district}، {name}"
        intro = f"<p>{ESC(desc)}</p>"
        crumbs = [("صفحهٔ اصلی", "/"), (f"ملک {name}", city_path(key)), (district, city_path(key, district))]
        hsh = "#/s?" + urllib.parse.urlencode({"city": key, "district": district, "sort": "score"})
        extra = ""
    else:
        rep = market_report(st, key, "sale", "apartment")
        o = rep["overview"]
        rows = _listing_rows(st, "city_key=?", (key,), 20)
        dists = st.districts(key)
        parts = []
        if o["valid"]:
            parts.append(f"{fa(o['valid'])} آگهی معتبر فروش آپارتمان")
            if o.get("median_ppm"):
                parts.append(f"میانهٔ قیمت هر متر {money(o['median_ppm'])}")
            if o.get("opportunities"):
                parts.append(f"{fa(o['opportunities'])} فرصت زیر قیمت محله")
        title = f"قیمت روز ملک در {name} | خرید، رهن و اجاره، فرصت‌های زیر قیمت | {site['name']}"
        desc = (f"بازار ملک {name}" + ("؛ " + "، ".join(parts) if parts else "") +
                f". مقایسهٔ هر آگهی با محلهٔ خودش در {name}، قیمت هر متر محله‌ها و بهترین فرصت‌های خرید و اجاره.")
        h1 = f"خرید، رهن و اجارهٔ ملک در {name}"
        intro = f"<p>{ESC(desc)}</p>"
        extra = ("<h2>محله‌های " + ESC(name) + "</h2><ul>" + "".join(
            f'<li><a href="{city_path(key, d["name"])}">ملک در {ESC(d["name"])}</a> ({fa(d["n"])} آگهی{"، " + fa(d["opp"]) + " فرصت" if d["opp"] else ""})</li>'
            for d in dists[:60] if d["n"] >= 3) + "</ul>") if dists else ""
        if rep.get("districts"):
            extra += "<h2>قیمت هر متر آپارتمان به تفکیک محله</h2><ul>" + "".join(
                f'<li>{ESC(d["name"])}: میانه {ESC(money(d["median_ppm"]))} برای هر متر ({fa(d["n"])} آگهی)</li>' for d in rep["districts"][:30]) + "</ul>"
        crumbs = [("صفحهٔ اصلی", "/"), (f"ملک {name}", city_path(key))]
        hsh = "#/market?city=" + key
    body = (f'<nav aria-label="مسیر">{" › ".join(f"<a href={chr(34)}{ESC(u)}{chr(34)}>{ESC(t)}</a>" for t, u in crumbs)}</nav>'
            f'<h1>{ESC(h1)}</h1>{intro}'
            + (f'<h2>آگهی‌ها و فرصت‌ها</h2><ul>{"".join(_li(l, site) for l in rows)}</ul>' if rows else "<p>آگهی‌های این بخش به‌تدریج جمع‌آوری می‌شوند.</p>")
            + extra)
    ld = [{"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": t, "item": base + u} for i, (t, u) in enumerate(crumbs)]}]
    if rows:
        ld.append({"@context": "https://schema.org", "@type": "ItemList", "name": h1, "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "url": f"{base}/ad/{l['id']}", "name": l["title"] or "آگهی ملک"} for i, l in enumerate(rows[:20])]})
    return {"title": title, "desc": desc, "canonical": base + urllib.parse.quote(urllib.parse.unquote(crumbs[-1][1]), safe="/"),
            "body": body, "ld": ld, "hash": hsh}


def ad(app, base, lid):
    st, site = app.store, app.public_config()["site"]
    l = st.get(lid)
    if not l or l.get("hidden") or l.get("vertical") != "estate":
        return None
    c = catalog.CITY_BY_KEY.get(l["city_key"], {})
    kind, deal = KIND.get(l.get("kind"), "ملک"), DEAL.get(l.get("deal"), "")
    price = l.get("price") or l.get("pp")
    loc = "، ".join(x for x in (l.get("district"), c.get("name")) if x)
    label = LABEL.get(l.get("label") or "", "") if not l.get("excluded") else ""
    gap = band(l.get("discount")) if l.get("label") in ("gold", "good") else ""
    title = f"{l.get('title') or kind} | {loc} | {site['name']}"
    facts = [x for x in (f"{deal} {kind}", (fa(l['area']) + " متر") if l.get("area") else "",
                         (fa(l['rooms']) + " خواب") if l.get("rooms") is not None else "", loc, money(price)) if x]
    desc = "، ".join(facts) + (f"؛ {label}" if label else "") + (f" ({gap})" if gap else "") + f". سنجش قیمت این آگهی در برابر آگهی‌های مشابه محله در {site['name']}."
    status = "" if l.get("status") == "active" else "<p><b>این آگهی دیگر فعال نیست.</b></p>"
    crumbs = [("صفحهٔ اصلی", "/")] + ([(f"ملک {c['name']}", city_path(c["key"]))] if c else []) + \
             ([(l["district"], city_path(c["key"], l["district"]))] if c and l.get("district") else [])
    sim = _listing_rows(st, "city_key=? AND district=? AND id!=?", (l["city_key"], l.get("district") or "", lid), 8) if l.get("district") else []
    body = (f'<nav aria-label="مسیر">{" › ".join(f"<a href={chr(34)}{ESC(u)}{chr(34)}>{ESC(t)}</a>" for t, u in crumbs)}</nav>'
            f'<h1>{ESC(l.get("title") or kind)}</h1>{status}<p>{ESC(desc)}</p>'
            + (f'<p>{ESC((l.get("description") or "")[:600])}</p>' if l.get("description") else "")
            + (f'<h2>آگهی‌های دیگر {ESC(l["district"])}</h2><ul>{"".join(_li(x, site) for x in sim)}</ul>' if sim else ""))
    item = {"@context": "https://schema.org", "@type": "RealEstateListing", "name": l.get("title") or kind, "url": f"{base}/ad/{lid}",
            "description": desc, "inLanguage": "fa-IR"}
    if l.get("posted_at") or l.get("first_seen"):
        item["datePosted"] = time.strftime("%Y-%m-%d", time.gmtime(l.get("posted_at") or l.get("first_seen")))
    if l.get("image"):
        item["image"] = base + "/img?u=" + urllib.parse.quote(l["image"], safe="")
    if price and l.get("deal") == "sale":
        item["offers"] = {"@type": "Offer", "price": int(price) * 10, "priceCurrency": "IRR"}
    if c:
        item["contentLocation"] = {"@type": "Place", "name": loc, "address": {"@type": "PostalAddress", "addressLocality": c["name"],
                                   "addressRegion": catalog.PROVINCES[c["province"]]["name"], "addressCountry": "IR"}}
    ld = [item, {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": t, "item": base + u} for i, (t, u) in enumerate(crumbs)]}]
    return {"title": title, "desc": desc[:300], "canonical": f"{base}/ad/{lid}", "body": body, "ld": ld,
            "hash": "#/ad/" + urllib.parse.quote(lid), "image": item.get("image"),
            "noindex": l.get("status") != "active"}


STATIC_PAGES = {
    "/method": ("روش ارزش‌گذاری: قیمت محله و فرصت چطور سنجیده می‌شود", "#/method"),
    "/faq": ("پرسش‌های پرتکرار", "#/faq"),
    "/support": ("پشتیبانی", "#/support"),
}


def page(app, base, path):
    path = urllib.parse.unquote(path).rstrip("/") or "/"
    if path in ("/", "/index.html"):
        return home(app, base)
    m = re.fullmatch(r"/melk/([a-z_]+)(?:/(.+))?", path)
    if m:
        return city(app, base, m.group(1), m.group(2))
    m = re.fullmatch(r"/ad/([\w-]+)", path)
    if m:
        return ad(app, base, m.group(1))
    if path in STATIC_PAGES:
        t, h = STATIC_PAGES[path]
        site = app.public_config()["site"]
        return {"title": f"{t} | {site['name']}", "desc": t, "canonical": base + path, "body": f"<h1>{ESC(t)}</h1>", "ld": [], "hash": h}
    return None


def render(template: str, p: dict, version_tag: str) -> str:
    """index.html را با سربرگ و محتوای ازپیش‌ساخته برای همین نشانی پر می‌کند."""
    head = (f'<link rel="canonical" href="{ESC(p["canonical"])}" />\n'
            f'  <meta property="og:type" content="website" />\n  <meta property="og:locale" content="fa_IR" />\n'
            f'  <meta property="og:title" content="{ESC(p["title"])}" />\n  <meta property="og:description" content="{ESC(p["desc"])}" />\n'
            f'  <meta property="og:url" content="{ESC(p["canonical"])}" />\n'
            + (f'  <meta property="og:image" content="{ESC(p["image"])}" />\n' if p.get("image") else "")
            + '  <meta name="twitter:card" content="summary_large_image" />\n'
            + ('  <meta name="robots" content="noindex, follow" />\n' if p.get("noindex") else '  <meta name="robots" content="index, follow, max-image-preview:large" />\n')
            + "".join(f'  <script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n' for x in p["ld"])
            # کاربر واقعی: نشانی سئو به مسیر همان صفحه در برنامه برده می‌شود (پیش از بارگذاری بقیهٔ اسکریپت‌ها)
            + (f'  <script>if(!location.hash)history.replaceState(null,"","/{p["hash"]}");</script>\n' if p.get("hash") else ""))
    out = re.sub(r"<title>.*?</title>", f"<title>{ESC(p['title'])}</title>", template, count=1, flags=re.S)
    out = re.sub(r'<meta name="description" content="[^"]*"\s*/?>', f'<meta name="description" content="{ESC(p["desc"])}" />', out, count=1)
    out = out.replace("</head>", "  " + head + "</head>", 1)
    out = out.replace('<main id="view" tabindex="-1"></main>', f'<main id="view" tabindex="-1"><div class="wrap seo-pre">{p["body"]}</div></main>', 1)
    # نشانی‌های نسبی فایل‌ها در مسیرهای تو در تو (/melk/rasht) باید از ریشه خوانده شوند
    out = re.sub(r'((?:src|href)=")(assets/|favicon\.svg)', r"\1/\2", out)
    return out


def robots(base) -> str:
    return f"User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin.html\nDisallow: /img\nDisallow: /pay/\n\nSitemap: {base}/sitemap.xml\n"


def sitemap(app, base) -> str:
    st = app.store
    act = app.regions()["active"]
    urls = [(base + "/", None, "daily", "1.0"), (base + "/method", None, "monthly", "0.4"), (base + "/faq", None, "monthly", "0.4")]
    last = {r["city_key"]: r["t"] for r in st.q("""SELECT city_key, MAX(last_seen) t FROM listings WHERE status='active' AND hidden=0
                                                    AND vertical='estate' GROUP BY city_key""")}
    for c in catalog.CITIES:
        if c["province"] in act and last.get(c["key"]):
            urls.append((base + city_path(c["key"]), last[c["key"]], "daily", "0.9"))
            for d in st.districts(c["key"]):
                if d["n"] >= 5:
                    urls.append((base + city_path(c["key"], d["name"]), last[c["key"]], "daily", "0.7"))
    for r in st.q("""SELECT id, last_seen FROM listings WHERE status='active' AND hidden=0 AND vertical='estate' AND COALESCE(excluded,0)=0
                     ORDER BY (label IN ('gold','good')) DESC, last_seen DESC LIMIT 40000"""):
        urls.append((f"{base}/ad/{r['id']}", r["last_seen"], "weekly", "0.6"))
    rows = "".join(f"<url><loc>{ESC(u)}</loc>" + (f"<lastmod>{time.strftime('%Y-%m-%d', time.gmtime(t))}</lastmod>" if t else "")
                   + f"<changefreq>{cf}</changefreq><priority>{pr}</priority></url>" for u, t, cf, pr in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{rows}</urlset>'
