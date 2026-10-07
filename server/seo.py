"""سئو: صفحه‌های واقعی و قابل خواندن برای موتورهای جست‌وجو.

سایت یک برنامهٔ تک‌صفحه‌ای با مسیرهای «#» است که گوگل آن‌ها را صفحهٔ جدا نمی‌شمارد. این ماژول برای هر شهر، هر محله،
هر آگهی، راهنماها و مقاله‌ها نشانی واقعی می‌سازد و همان index.html را با عنوان، توضیح، پیوند متعارف، داده‌های
ساخت‌یافتهٔ schema.org و متن ازپیش‌ساخته برمی‌گرداند. همهٔ عددهای متن از دادهٔ واقعی همان لحظه می‌آیند؛ اگر داده نباشد،
جمله‌ای ساخته نمی‌شود. فقط داده‌های عمومی نمایش داده می‌شود (نه قیمت منصفانه، نه پیوند منبع، نه نام سایت‌های آگهی).

دو نوع صفحه:
  supplement ← صفحهٔ برنامه (شهر، محله، آگهی، صفحهٔ اول) سر جایش می‌آید و این متن، زیر آن و بالای پانویس، به‌عنوان
               «دربارهٔ بازار ...» برای کاربر و موتور جست‌وجو دیده می‌شود.
  content    ← راهنماها و مقاله‌ها؛ خود متن، محتوای اصلی صفحه است (برنامه همان را از /api/page می‌گیرد).
"""
from __future__ import annotations

import html
import json
import math
import re
import time
import urllib.parse

import catalog
from features import clean_title
from report import market_report

ESC = html.escape
KIND = {"apartment": "آپارتمان", "suite": "سوئیت", "villa": "ویلا", "land": "زمین", "garden": "باغ", "shop": "مغازه", "office": "دفتر کار"}
DEAL = {"sale": "فروش", "rent": "رهن و اجاره", "daily": "اجارهٔ روزانه"}
LABEL = {"gold": "فرصت طلایی", "good": "زیر قیمت محله", "fair": "هم‌قیمت محله", "high": "بالاتر از قیمت محله"}
FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
JMONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]


def fa(n) -> str:
    return f"{int(round(n)):,}".replace(",", "٬").translate(FA) if n is not None else ""


def fa1(x) -> str:
    return (f"{x:.1f}".rstrip("0").rstrip(".")).replace(".", "٫").translate(FA)


def money(v) -> str:
    if not v:
        return ""
    if v >= 1e9:
        return (f"{v / 1e9:.2f}".rstrip("0").rstrip(".")).replace(".", "٫").translate(FA) + " میلیارد تومان"
    if v >= 1e6:
        return fa(v / 1e6) + " میلیون تومان"
    return fa(v) + " تومان"


def pct(x) -> str:
    return fa(abs(x) * 100) + "٪"


def band(d) -> str:
    """درصد فاصله به صورت بازهٔ ۵ درصدی، نه عدد دقیق."""
    if d is None or d < 0.05:
        return ""
    lo = int(d * 100) // 5 * 5
    return f"حدود {fa(lo)} تا {fa(lo + 5)}٪ زیر قیمت محله"


def jdate(ts) -> str:
    """تاریخ شمسی (الگوریتم استاندارد تبدیل میلادی به جلالی)."""
    t = time.gmtime(ts or time.time())
    gy, gm, gd = t.tm_year, t.tm_mon, t.tm_mday
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = 355666 + 365 * gy + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400 + gd + g_d_m[gm - 1]
    jy = -1595 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    jm = 1 + days // 31 if days < 186 else 7 + (days - 186) // 30
    jd = 1 + (days % 31 if days < 186 else (days - 186) % 30)
    return f"{fa(jd)} {JMONTHS[jm - 1]} {str(jy).translate(FA)}"


def city_path(key, district=None):
    return "/melk/" + key + ("/" + urllib.parse.quote(district) if district else "")


def guide_path(key):
    return "/rahnama/" + key


def _km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a["lat"], a["lng"], b["lat"], b["lng"]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def _crumbs_html(crumbs):
    return '<nav class="seo-crumbs" aria-label="مسیر">' + " › ".join(f'<a href="{ESC(u)}">{ESC(t)}</a>' for t, u in crumbs) + "</nav>"


def _crumbs_ld(base, crumbs):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": t, "item": base + (u if u.startswith("/") else "/" + u)} for i, (t, u) in enumerate(crumbs)]}


def _faq(items):
    """[(پرسش، پاسخ)] ← (html، ld)؛ فقط پرسش‌هایی که پاسخ دادهٔ واقعی دارند."""
    items = [(q, a) for q, a in items if a]
    if not items:
        return "", None
    h = "<h3>پرسش‌های پرتکرار</h3>" + "".join(f"<details><summary>{ESC(q)}</summary><p>{ESC(a)}</p></details>" for q, a in items)
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in items]}
    return h, ld


def _listing_rows(store, where, args, limit=12):
    q = store.q(f"""SELECT id, title, district, city_key, kind, deal, pp, price, area, label, discount, score, image FROM listings
                    WHERE status='active' AND hidden=0 AND vertical='estate' AND COALESCE(excluded,0)=0 AND {where}
                    ORDER BY (label IN ('gold','good')) DESC, score DESC LIMIT ?""", (*args, limit))
    out = []
    for r in q:
        d = dict(r)
        d["title"] = clean_title(d["title"], d.get("kind"), d.get("area"), d.get("district"))[0]
        out.append(d)
    return out


def _li(l):
    c = catalog.CITY_BY_KEY.get(l["city_key"], {})
    bits = [x for x in (KIND.get(l["kind"]), (fa(l["area"]) + " متر") if l.get("area") else "", l.get("district"), c.get("name")) if x]
    tag = LABEL.get(l.get("label") or "", "")
    gap = band(l.get("discount")) if l.get("label") in ("gold", "good") else ""
    price = l.get("price") or l.get("pp")
    return (f'<li><a href="/ad/{ESC(l["id"])}">{ESC(l["title"] or "آگهی ملک")}</a> — {ESC("، ".join(bits))}'
            f'{"، " + ESC(money(price)) if price else ""}{" — " + ESC(tag) if tag else ""}{"، " + ESC(gap) if gap else ""}</li>')


def _site(app):
    return app.public_config()["site"]


def _updated(store):
    v = store.get_setting("valuation_info") or {}
    return v.get("at") or int(time.time())


def _counts(store):
    return {r["city_key"]: r["n"] for r in store.q("""SELECT city_key, COUNT(*) n FROM listings WHERE status='active' AND hidden=0
                                                     AND vertical='estate' GROUP BY city_key""")}


# ---------------------------------------------------------------- data paragraphs (فقط از دادهٔ واقعی)
def _city_paragraphs(name, rep, rent):
    o = rep["overview"]
    ps = []
    if o["valid"]:
        s = f"در حال حاضر {fa(o['valid'])} آگهی معتبر فروش آپارتمان در {name} بررسی شده است"
        if o.get("median_ppm"):
            s += f"؛ میانهٔ قیمت هر متر {money(o['median_ppm'])}"
        if o.get("median_price"):
            s += f" و میانهٔ قیمت کل {money(o['median_price'])}"
        if o.get("median_area"):
            s += f" برای میانهٔ متراژ {fa(o['median_area'])} متر"
        ps.append(s + ".")
    if rep.get("pricey") and rep.get("cheap") and o.get("n_districts", 0) >= 2:
        hi = "، ".join(f"{d['name']} ({money(d['median_ppm'])})" for d in rep["pricey"][:3])
        lo = "، ".join(f"{d['name']} ({money(d['median_ppm'])})" for d in rep["cheap"][:3])
        s = f"از نظر قیمت هر متر، گران‌ترین محله‌های {name} {hi} و ارزان‌ترین‌ها {lo} هستند"
        if o.get("spread"):
            s += f"؛ گران‌ترین محله حدود {fa1(o['spread'])} برابر ارزان‌ترین است"
        ps.append(s + ". به همین دلیل هر آگهی فقط با آگهی‌های مشابه محلهٔ خودش مقایسه می‌شود، نه با میانهٔ کل شهر.")
    if o.get("opportunities"):
        s = f"{fa(o['opportunities'])} آگهی آپارتمان در {name} دست‌کم ۱۵٪ زیر قیمت محلهٔ خودشان‌اند"
        if o.get("gold"):
            s += f" که {fa(o['gold'])} مورد «فرصت طلایی» است"
        if rep.get("hotspots"):
            s += "؛ بیشترین فرصت در " + "، ".join(d["name"] for d in rep["hotspots"][:3]) + " دیده می‌شود"
        ps.append(s + ".")
    if len(rep.get("by_age") or []) >= 2:
        ps.append("قیمت هر متر بر حسب سن بنا: " + "، ".join(f"{g['label']} {money(g['median_ppm'])}" for g in rep["by_age"]) + ".")
    if len(rep.get("by_rooms") or []) >= 2:
        ps.append("بر حسب تعداد خواب: " + "، ".join(f"{g['label']} {money(g['median_ppm'])}" for g in rep["by_rooms"]) + ".")
    am = [a for a in rep.get("amenities") or [] if a.get("premium") is not None and a.get("districts", 0) >= 2]
    if am:
        ps.append("درون یک محله، " + "، ".join(f"{a['name']} قیمت هر متر را به‌طور میانه حدود {pct(a['premium'])} {'بالا' if a['premium'] >= 0 else 'پایین'}"
                                              for a in am) + " می‌برد (مقایسهٔ آگهی‌های با و بدون این امکان در همان محله).")
    ro = (rent or {}).get("overview") or {}
    if ro.get("valid"):
        s = f"برای رهن و اجارهٔ آپارتمان، {fa(ro['valid'])} آگهی معتبر بررسی شده"
        if ro.get("median_deposit") is not None:
            s += f"؛ میانهٔ ودیعه {money(ro['median_deposit'])}"
        if ro.get("median_rent"):
            s += f" و میانهٔ اجارهٔ ماهانه {money(ro['median_rent'])}"
        ps.append(s + ".")
    if o.get("fresh_7d"):
        ps.append(f"در ۷ روز گذشته {fa(o['fresh_7d'])} آگهی تازهٔ فروش آپارتمان در {name} اضافه شده است.")
    return ps


def _city_faq(name, rep, rent):
    o = rep["overview"]
    ro = (rent or {}).get("overview") or {}
    return [
        (f"میانهٔ قیمت هر متر آپارتمان در {name} چقدر است؟",
         f"بر پایهٔ {fa(o['valid'])} آگهی معتبر فروش، میانهٔ قیمت هر متر آپارتمان در {name} {money(o['median_ppm'])} است. این قیمت پیشنهادی آگهی‌هاست، نه قیمت معامله‌شده." if o.get("median_ppm") else ""),
        (f"ارزان‌ترین محله‌های {name} برای خرید آپارتمان کدام‌اند؟",
         "از نظر میانهٔ قیمت هر متر: " + "، ".join(f"{d['name']} ({money(d['median_ppm'])})" for d in rep["cheap"][:4]) + "." if rep.get("cheap") and o.get("n_districts", 0) >= 2 else ""),
        (f"گران‌ترین محله‌های {name} کدام‌اند؟",
         "از نظر میانهٔ قیمت هر متر: " + "، ".join(f"{d['name']} ({money(d['median_ppm'])})" for d in rep["pricey"][:4]) + "." if rep.get("pricey") and o.get("n_districts", 0) >= 2 else ""),
        (f"الان چند آپارتمان زیر قیمت در {name} هست؟",
         f"{fa(o['opportunities'])} آگهی دست‌کم ۱۵٪ زیر قیمت محلهٔ خودشان‌اند؛ هر آگهی با آگهی‌های مشابه همان محله (متراژ، سن، طبقه و امکانات) سنجیده شده است." if o.get("opportunities") else ""),
        (f"میانهٔ ودیعه و اجارهٔ آپارتمان در {name} چقدر است؟",
         f"میانهٔ ودیعه {money(ro['median_deposit'])}" + (f" و میانهٔ اجارهٔ ماهانه {money(ro['median_rent'])}" if ro.get("median_rent") else "") + f" از {fa(ro['valid'])} آگهی معتبر." if ro.get("valid") and ro.get("median_deposit") is not None else ""),
    ]


# ---------------------------------------------------------------- pages
def home(app, base):
    st, site = app.store, _site(app)
    act = app.regions()["active"]
    counts = _counts(st)
    provs = []
    for p in act:
        items = "".join(f'<li><a href="{city_path(c["key"])}">ملک {ESC(c["name"])}</a>{" (" + fa(counts[c["key"]]) + " آگهی)" if counts.get(c["key"]) else ""}</li>'
                        for c in catalog.CITIES if c["province"] == p)
        provs.append(f'<h3>استان {ESC(catalog.PROVINCES[p]["name"])}</h3><ul class="seo-cols">{items}</ul>')
    top = "".join(_li(l) for l in _listing_rows(st, "label IN ('gold','good')", (), 15))
    guides = "".join(f'<li><a href="{guide_path(c["key"])}">راهنمای خرید ملک در {ESC(c["name"])}</a></li>'
                     for c in catalog.CITIES if counts.get(c["key"], 0) >= 20)
    arts = "".join(f'<li><a href="/maghale/{ESC(a["slug"])}">{ESC(a["title"])}</a></li>' for a in articles_list(st, 8))
    body = (f'<h2>ملک زیر قیمت در شهرهای ایران، محله به محله</h2>'
            f'<p>{ESC(site["name"])} آگهی‌های عمومی ملک را شهر به شهر می‌خواند و هر آگهی را فقط با آگهی‌های مشابه همان محله، با در نظر گرفتن متراژ، سن بنا، طبقه، آسانسور، پارکینگ و سند می‌سنجد. فرصت‌های زیر قیمت محله رتبه‌بندی و قیمت‌های مشکوک جدا می‌شوند. آخرین به‌روزرسانی: {jdate(_updated(st))}.</p>'
            + (f'<h3>برترین فرصت‌های امروز</h3><ul>{top}</ul>' if top else "")
            + f'<details class="seo-more"><summary>همهٔ شهرها</summary>{"".join(provs)}</details>'
            + (f'<h3>راهنماهای خرید</h3><ul class="seo-cols">{guides}<li><a href="/rahnama/kharid-melk">چک‌لیست خرید ملک</a></li><li><a href="/rahnama/ejare">چک‌لیست رهن و اجاره</a></li></ul>')
            + (f'<h3>مقاله‌ها</h3><ul>{arts}</ul>' if arts else ""))
    title = f'{site["name"]} | ملک زیر قیمت، محله به محله'
    desc = ("آگهی‌های ملک شهرهای ایران، محله به محله با قیمت منصفانهٔ هر محله سنجیده می‌شوند؛ آپارتمان، ویلا و زمین زیر قیمت را "
            "برای خرید و اجاره پیش از بقیه پیدا کنید.")
    ld = [{"@context": "https://schema.org", "@type": "WebSite", "name": site["name"], "url": base + "/", "inLanguage": "fa-IR", "description": desc},
          {"@context": "https://schema.org", "@type": "Organization", "name": site["name"], "url": base + "/", "logo": base + "/assets/img/icon-512.png"}]
    return {"title": title, "desc": desc, "canonical": base + "/", "body": body, "ld": ld, "hash": "", "kind": "supplement"}


def city(app, base, key):
    c = catalog.CITY_BY_KEY.get(key)
    if not c or c["province"] not in app.regions()["active"]:
        return None
    st, site = app.store, _site(app)
    name, prov = c["name"], catalog.PROVINCES[c["province"]]["name"]
    rep = market_report(st, key, "sale", "apartment")
    rent = market_report(st, key, "rent", "apartment")
    o = rep["overview"]
    rows = _listing_rows(st, "city_key=?", (key,), 20)
    dists = [d for d in st.districts(key) if d["n"] >= 3]
    counts = _counts(st)
    near = sorted((x for x in catalog.CITIES if x["key"] != key and counts.get(x["key"])), key=lambda x: _km(c, x))[:8]
    paras = _city_paragraphs(name, rep, rent)
    faq_html, faq_ld = _faq(_city_faq(name, rep, rent))
    parts = []
    if o["valid"]:
        if o.get("median_ppm"):
            parts.append(f"میانهٔ قیمت هر متر آپارتمان {money(o['median_ppm'])}")
        if o.get("opportunities"):
            parts.append(f"{fa(o['opportunities'])} فرصت زیر قیمت محله")
    title = f"قیمت روز ملک در {name} | خرید، رهن و اجاره، فرصت‌های زیر قیمت | {site['name']}"
    desc = (f"بازار ملک {name}" + ("؛ " + "، ".join(parts) if parts else "") +
            f". قیمت هر متر محله‌های {name}، آپارتمان و ویلای زیر قیمت و مقایسهٔ هر آگهی با محلهٔ خودش.")
    crumbs = [("صفحهٔ اصلی", "/"), (f"ملک {name}", city_path(key))]
    body = (_crumbs_html(crumbs)
            + f'<h2>دربارهٔ بازار ملک {ESC(name)}</h2><p class="seo-upd">استان {ESC(prov)}؛ آخرین به‌روزرسانی: {jdate(_updated(st))}</p>'
            + ("".join(f"<p>{ESC(p)}</p>" for p in paras) if paras else f"<p>آگهی‌های ملک {ESC(name)} به‌تدریج جمع‌آوری می‌شوند؛ با رسیدن داده کافی، قیمت هر متر محله‌ها و فرصت‌ها این‌جا نمایش داده می‌شود.</p>")
            + (f'<h3>آگهی‌ها و فرصت‌های {ESC(name)}</h3><ul>{"".join(_li(l) for l in rows)}</ul>' if rows else "")
            + (f'<h3>محله‌های {ESC(name)}</h3><ul class="seo-cols">' + "".join(
                f'<li><a href="{city_path(key, d["name"])}">ملک {ESC(d["name"])}</a> ({fa(d["n"])} آگهی{"، " + fa(d["opp"]) + " فرصت" if d["opp"] else ""})</li>'
                for d in dists[:80]) + "</ul>" if dists else "")
            + (f'<p><a href="{guide_path(key)}">راهنمای خرید ملک در {ESC(name)}: بهترین محله‌ها، قیمت‌ها و فرصت‌ها</a></p>' if o["valid"] else "")
            + (f'<h3>شهرهای نزدیک</h3><ul class="seo-cols">' + "".join(f'<li><a href="{city_path(x["key"])}">ملک {ESC(x["name"])}</a></li>' for x in near) + "</ul>" if near else "")
            + faq_html)
    ld = [_crumbs_ld(base, crumbs),
          {"@context": "https://schema.org", "@type": "WebPage", "name": title, "url": base + city_path(key), "inLanguage": "fa-IR",
           "dateModified": time.strftime("%Y-%m-%d", time.gmtime(_updated(st))),
           "about": {"@type": "Place", "name": name, "geo": {"@type": "GeoCoordinates", "latitude": c["lat"], "longitude": c["lng"]},
                     "containedInPlace": {"@type": "AdministrativeArea", "name": f"استان {prov}"}}}]
    if rows:
        ld.append({"@context": "https://schema.org", "@type": "ItemList", "name": f"آگهی‌های ملک {name}", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "url": f"{base}/ad/{l['id']}", "name": l["title"] or "آگهی ملک"} for i, l in enumerate(rows)]})
    if faq_ld:
        ld.append(faq_ld)
    return {"title": title, "desc": desc, "canonical": base + city_path(key), "body": body, "ld": ld,
            "hash": "#/market?city=" + key, "kind": "supplement", "noindex": not counts.get(key)}


def district(app, base, key, dname):
    c = catalog.CITY_BY_KEY.get(key)
    if not c:
        return None
    st, site = app.store, _site(app)
    dkey = dname.replace(" ", "").replace("‌", "")
    all_d = st.districts(key)
    match = next((d for d in all_d if d["name"].replace(" ", "").replace("‌", "") == dkey), None)
    if not match:
        return None
    dname, name = match["name"], c["name"]
    rows = _listing_rows(st, "city_key=? AND REPLACE(REPLACE(district,' ',''),'‌','')=?", (key, dkey), 30)
    rep = market_report(st, key, "sale", "apartment")
    drow = next((d for d in rep.get("districts") or [] if d["name"].replace(" ", "").replace("‌", "") == dkey), None)
    ps = [f"{fa(match['n'])} آگهی ملک فعال در محلهٔ {dname} {name} بررسی شده است"
          + (f" که {fa(match['opp'])} مورد دست‌کم ۱۵٪ زیر قیمت همین محله است" if match["opp"] else "") + "."]
    faq = []
    if drow:
        s = f"میانهٔ قیمت هر متر آپارتمان در {dname} {money(drow['median_ppm'])} از {fa(drow['n'])} آگهی معتبر است"
        if drow.get("vs_city") is not None and abs(drow["vs_city"]) >= 0.01:
            s += f"؛ یعنی حدود {pct(drow['vs_city'])} {'گران‌تر' if drow['vs_city'] > 0 else 'ارزان‌تر'} از میانهٔ کل {name}"
        if drow.get("median_area"):
            s += f". میانهٔ متراژ آگهی‌ها {fa(drow['median_area'])} متر و میانهٔ قیمت کل {money(drow['median_price'])} است"
        if drow.get("elevator_share") is not None:
            s += f"؛ {pct(drow['elevator_share'])} آگهی‌ها آسانسور دارند"
        ps.append(s + ".")
        faq.append((f"قیمت هر متر آپارتمان در {dname} {name} چقدر است؟", f"میانهٔ قیمت هر متر {money(drow['median_ppm'])} از {fa(drow['n'])} آگهی معتبر؛ قیمت پیشنهادی آگهی‌هاست، نه قیمت معامله‌شده."))
        sib = sorted((d for d in rep["districts"] if d is not drow and not d.get("low")), key=lambda d: abs(math.log(d["median_ppm"] / drow["median_ppm"])))[:6]
    else:
        sib = sorted((d for d in all_d if d is not match and d["n"] >= 5), key=lambda d: -d["n"])[:6]
    if match["opp"]:
        faq.append((f"در {dname} آپارتمان زیر قیمت هست؟", f"بله، {fa(match['opp'])} آگهی در حال حاضر دست‌کم ۱۵٪ زیر قیمت آگهی‌های مشابه همین محله‌اند."))
    faq_html, faq_ld = _faq(faq)
    title = f"قیمت ملک در {dname} {name} | آپارتمان و فرصت‌های زیر قیمت | {site['name']}"
    desc = ps[-1] if drow else ps[0]
    desc = desc + f" آپارتمان، ویلا و زمین در {dname} با سنجش هر آگهی در برابر آگهی‌های مشابه همین محله."
    crumbs = [("صفحهٔ اصلی", "/"), (f"ملک {name}", city_path(key)), (dname, city_path(key, dname))]
    body = (_crumbs_html(crumbs) + f'<h2>دربارهٔ بازار ملک {ESC(dname)}، {ESC(name)}</h2><p class="seo-upd">آخرین به‌روزرسانی: {jdate(_updated(st))}</p>'
            + "".join(f"<p>{ESC(p)}</p>" for p in ps)
            + (f'<h3>آگهی‌ها و فرصت‌های {ESC(dname)}</h3><ul>{"".join(_li(l) for l in rows)}</ul>' if rows else "")
            + (f'<h3>محله‌های هم‌قیمت در {ESC(name)}</h3><ul class="seo-cols">' + "".join(f'<li><a href="{city_path(key, d["name"])}">ملک {ESC(d["name"])}</a></li>' for d in sib) + "</ul>" if sib else "")
            + f'<p><a href="{city_path(key)}">همهٔ محله‌ها و بازار ملک {ESC(name)}</a></p>' + faq_html)
    ld = [_crumbs_ld(base, crumbs),
          {"@context": "https://schema.org", "@type": "WebPage", "name": title, "url": base + city_path(key, dname), "inLanguage": "fa-IR",
           "dateModified": time.strftime("%Y-%m-%d", time.gmtime(_updated(st))),
           "about": {"@type": "Place", "name": f"{dname}، {name}", "containedInPlace": {"@type": "City", "name": name}}}]
    if rows:
        ld.append({"@context": "https://schema.org", "@type": "ItemList", "name": f"آگهی‌های ملک {dname}", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "url": f"{base}/ad/{l['id']}", "name": l["title"]} for i, l in enumerate(rows[:20])]})
    if faq_ld:
        ld.append(faq_ld)
    return {"title": title, "desc": desc[:300], "canonical": base + city_path(key, dname), "body": body, "ld": ld,
            "hash": "#/s?" + urllib.parse.urlencode({"city": key, "district": dname, "sort": "score"}), "kind": "supplement",
            "noindex": match["n"] < 3}


def ad(app, base, lid):
    st, site = app.store, _site(app)
    l = st.get(lid)
    if not l or l.get("hidden") or l.get("vertical") != "estate":
        return None
    c = catalog.CITY_BY_KEY.get(l["city_key"], {})
    kind, deal = KIND.get(l.get("kind"), "ملک"), DEAL.get(l.get("deal"), "")
    t_clean, claims = clean_title(l.get("title"), l.get("kind"), l.get("area"), l.get("district"))
    price = l.get("price") or l.get("pp")
    loc = "، ".join(x for x in (l.get("district"), c.get("name")) if x)
    label = LABEL.get(l.get("label") or "", "") if not l.get("excluded") else ""
    gap = band(l.get("discount")) if l.get("label") in ("gold", "good") else ""
    title = f"{t_clean} | {loc} | {site['name']}"
    facts = [x for x in (f"{deal} {kind}", (fa(l['area']) + " متر") if l.get("area") else "",
                         (fa(l['rooms']) + " خواب") if l.get("rooms") is not None else "", loc, money(price)) if x]
    desc = "، ".join(facts) + (f"؛ {label}" if label else "") + (f" ({gap})" if gap else "") + f". سنجش قیمت این آگهی در برابر آگهی‌های مشابه محله در {site['name']}."
    status = "" if l.get("status") == "active" else "<p><b>این آگهی دیگر فعال نیست.</b></p>"
    crumbs = [("صفحهٔ اصلی", "/")] + ([(f"ملک {c['name']}", city_path(c["key"]))] if c else []) + \
             ([(l["district"], city_path(c["key"], l["district"]))] if c and l.get("district") else [])
    sim = _listing_rows(st, "city_key=? AND district=? AND id!=?", (l["city_key"], l.get("district") or "", lid), 8) if l.get("district") else []
    img = (base + "/img?u=" + urllib.parse.quote(l["image"], safe="")) if l.get("image") else None
    claim_txt = ""
    if claims and l.get("label") not in ("gold", "good"):
        claim_txt = f"<p>آگهی‌دهنده این ملک را با صفت‌های تبلیغاتی معرفی کرده؛ حکم {ESC(site['name'])} فقط از مقایسه با آگهی‌های مشابه همان محله می‌آید.</p>"
    body = (_crumbs_html(crumbs) + f'<h2>{ESC(t_clean)}</h2>{status}'
            + (f'<img src="{ESC(img)}" alt="{ESC(t_clean + "، " + loc)}" loading="lazy" width="640" height="420" class="seo-img">' if img else "")
            + f'<p>{ESC(desc)}</p>{claim_txt}'
            + (f'<h3>آگهی‌های دیگر {ESC(l["district"])}</h3><ul>{"".join(_li(x) for x in sim)}</ul>' if sim else ""))
    item = {"@context": "https://schema.org", "@type": "RealEstateListing", "name": t_clean, "url": f"{base}/ad/{lid}",
            "description": desc, "inLanguage": "fa-IR"}
    if l.get("posted_at") or l.get("first_seen"):
        item["datePosted"] = time.strftime("%Y-%m-%d", time.gmtime(l.get("posted_at") or l.get("first_seen")))
    if img:
        item["image"] = img
    if price and l.get("deal") == "sale":
        item["offers"] = {"@type": "Offer", "price": int(price) * 10, "priceCurrency": "IRR"}
    if c:
        item["contentLocation"] = {"@type": "Place", "name": loc, "address": {"@type": "PostalAddress", "addressLocality": c["name"],
                                   "addressRegion": catalog.PROVINCES[c["province"]]["name"], "addressCountry": "IR"}}
    return {"title": title, "desc": desc[:300], "canonical": f"{base}/ad/{lid}", "body": body, "ld": [item, _crumbs_ld(base, crumbs)],
            "hash": "#/ad/" + urllib.parse.quote(lid), "image": img, "kind": "supplement", "noindex": l.get("status") != "active"}


# ---------------------------------------------------------------- guides (راهنماها)
def guide_city(app, base, key):
    c = catalog.CITY_BY_KEY.get(key)
    if not c:
        return None
    st, site = app.store, _site(app)
    name = c["name"]
    rep = market_report(st, key, "sale", "apartment")
    o = rep["overview"]
    if not o["valid"]:
        return None
    ds = [d for d in rep["districts"] if not d.get("low")] or rep["districts"]
    rows_ppm = "".join(f"<tr><td><a href=\"{city_path(key, d['name'])}\">{ESC(d['name'])}</a></td><td>{ESC(money(d['median_ppm']))}</td>"
                       f"<td>{ESC(money(d['median_price']))}</td><td>{fa(d['n'])}</td><td>{fa(d['opportunities']) if d['opportunities'] else '—'}</td></tr>"
                       for d in sorted(ds, key=lambda d: d["median_ppm"]))
    bud = "".join(f"<li>{ESC(b['label'])}: {fa(b['n'])} آگهی" + (f"، {fa(b['good'] + b['gold'])} فرصت" if b["good"] + b["gold"] else "") + "</li>" for b in rep.get("budget") or [])
    paras = _city_paragraphs(name, rep, market_report(st, key, "rent", "apartment"))
    title = f"راهنمای خرید آپارتمان در {name}: بهترین محله‌ها، قیمت هر متر و فرصت‌ها | {site['name']}"
    desc = f"کدام محلهٔ {name} برای خرید آپارتمان مناسب‌تر است؟ قیمت هر متر همهٔ محله‌ها، بودجه‌های رایج و فرصت‌های زیر قیمت، از {fa(o['valid'])} آگهی معتبر."
    crumbs = [("صفحهٔ اصلی", "/"), (f"ملک {name}", city_path(key)), ("راهنمای خرید", guide_path(key))]
    body = (_crumbs_html(crumbs) + f'<h1>راهنمای خرید آپارتمان در {ESC(name)}</h1><p class="seo-upd">آخرین به‌روزرسانی: {jdate(_updated(st))}؛ از {fa(o["valid"])} آگهی معتبر</p>'
            + "".join(f"<p>{ESC(p)}</p>" for p in paras)
            + (f'<h2>قیمت هر متر آپارتمان در محله‌های {ESC(name)} (از ارزان به گران)</h2><div class="tbl-scroll"><table class="tbl"><thead><tr><th>محله</th><th>میانهٔ هر متر</th><th>میانهٔ قیمت کل</th><th>آگهی</th><th>فرصت</th></tr></thead><tbody>{rows_ppm}</tbody></table></div>' if rows_ppm else "")
            + (f"<h2>با چه بودجه‌ای چند آگهی هست؟</h2><ul>{bud}</ul>" if bud else "")
            + f'<h2>پیش از خرید در {ESC(name)}</h2>' + CHECKLIST_BUY
            + f'<p><a href="{city_path(key)}">آگهی‌ها و فرصت‌های امروز {ESC(name)}</a> · <a href="/rahnama/kharid-melk">چک‌لیست کامل خرید ملک</a></p>'
            + f'<p class="seo-note">عددها میانهٔ قیمت پیشنهادی آگهی‌های معتبرند، نه قیمت معامله‌شده یا کارشناسی، و با هر به‌روزرسانی داده تغییر می‌کنند.</p>')
    ld = [_crumbs_ld(base, crumbs), {"@context": "https://schema.org", "@type": "Article", "headline": title[:110], "inLanguage": "fa-IR",
          "dateModified": time.strftime("%Y-%m-%d", time.gmtime(_updated(st))), "author": {"@type": "Organization", "name": site["name"]},
          "publisher": {"@type": "Organization", "name": site["name"]}, "mainEntityOfPage": base + guide_path(key)}]
    return {"title": title, "desc": desc, "canonical": base + guide_path(key), "body": body, "ld": ld, "hash": "#/p" + guide_path(key), "kind": "content"}


CHECKLIST_BUY = ("<ol><li>اصل سند را ببینید و مشخصات آن (متراژ، طبقه، پلاک ثبتی، نام مالک) را با ملک و کارت ملی فروشنده تطبیق دهید.</li>"
                 "<li>وضعیت حقوقی ملک (رهن بانکی، بازداشت، توقیف) را از دفترخانه یا سامانه‌های رسمی استعلام کنید.</li>"
                 "<li>برای ساختمان نوساز پایان‌کار و پروانهٔ ساخت را ببینید؛ نبود پایان‌کار در انتقال سند و وام مشکل‌ساز است.</li>"
                 "<li>بدهی عوارض شهرداری، قبض‌های آب، برق و گاز و شارژ ساختمان را پیش از قرارداد بررسی کنید.</li>"
                 "<li>قرارداد را با کد رهگیری و در دفتر مشاور املاک دارای مجوز یا دفترخانه تنظیم کنید و پیش از دیدن مدارک بیعانه ندهید.</li>"
                 "<li>قیمت را با آگهی‌های مشابه همان محله، نه میانهٔ شهر، مقایسه کنید؛ متراژ، سن بنا، طبقه، آسانسور و پارکینگ قیمت را جابه‌جا می‌کنند.</li></ol>")
CHECKLIST_RENT = ("<ol><li>سند یا مدرک مالکیت و کارت ملی موجر را ببینید؛ اگر طرف قرارداد مالک نیست، وکالت‌نامهٔ رسمی او را بخواهید.</li>"
                  "<li>قرارداد را با کد رهگیری تنظیم کنید؛ بدون کد رهگیری، پیگیری قانونی ودیعه دشوارتر است.</li>"
                  "<li>وضعیت کنتورها، شارژ ساختمان و هزینه‌های مشترک را در قرارداد بنویسید.</li>"
                  "<li>تاریخ تخلیه، شرایط تمدید و افزایش اجاره را در قرارداد مشخص کنید.</li>"
                  "<li>برای مقایسهٔ آگهی‌ها، ودیعه و اجاره را به «رهن کامل» تبدیل کنید؛ نرخ تبدیل رایج حدود ۳٪ ماهانه است و در محله‌ها فرق می‌کند.</li></ol>")
STATIC_GUIDES = {
    "kharid-melk": ("چک‌لیست خرید ملک: پیش از قرارداد چه چیزهایی را بررسی کنیم؟",
                    "مدارکی که باید دید، استعلام‌های لازم و راه مقایسهٔ درست قیمت پیش از خرید آپارتمان، ویلا یا زمین.",
                    lambda site: f"<p>این فهرست برای کم کردن ریسک خرید است و جای مشاورهٔ حقوقی را نمی‌گیرد.</p>{CHECKLIST_BUY}"
                                 f"<h2>قیمت منصفانه را چطور بسنجیم؟</h2><p>میانهٔ قیمت کل شهر برای یک خانهٔ مشخص معیار خوبی نیست؛ فاصلهٔ قیمت محله‌ها گاهی چند برابر است. {ESC(site['name'])} هر آگهی را با آگهی‌های مشابه همان محله مقایسه می‌کند و اثر متراژ، سن بنا، طبقه و امکانات را جدا حساب می‌کند. <a href=\"/method\">روش ارزش‌گذاری</a></p>"),
    "ejare": ("چک‌لیست رهن و اجاره: پیش از امضای قرارداد",
              "مدارک موجر، کد رهگیری، تبدیل ودیعه و اجاره و نکته‌هایی که پیش از اجارهٔ آپارتمان باید بدانید.",
              lambda site: f"<p>این فهرست برای کم کردن ریسک اجاره است و جای مشاورهٔ حقوقی را نمی‌گیرد.</p>{CHECKLIST_RENT}"),
}


def guide_static(app, base, slug):
    g = STATIC_GUIDES.get(slug)
    if not g:
        return None
    site = _site(app)
    t, d, fn = g
    crumbs = [("صفحهٔ اصلی", "/"), ("راهنما", "/rahnama/" + slug)]
    body = _crumbs_html(crumbs) + f"<h1>{ESC(t)}</h1>" + fn(site)
    ld = [_crumbs_ld(base, crumbs), {"@context": "https://schema.org", "@type": "Article", "headline": t[:110], "inLanguage": "fa-IR",
          "author": {"@type": "Organization", "name": site["name"]}, "publisher": {"@type": "Organization", "name": site["name"]},
          "mainEntityOfPage": base + "/rahnama/" + slug}]
    return {"title": f"{t} | {site['name']}", "desc": d, "canonical": base + "/rahnama/" + slug, "body": body, "ld": ld,
            "hash": "#/p/rahnama/" + slug, "kind": "content"}


# ---------------------------------------------------------------- articles (مقاله‌ها؛ نوشتهٔ مدیر)
ARTICLES_SQL = """CREATE TABLE IF NOT EXISTS articles (slug TEXT PRIMARY KEY, title TEXT, summary TEXT, body TEXT, city_key TEXT,
  published INTEGER DEFAULT 1, created INTEGER, updated INTEGER)"""


def ensure_articles(store):
    with store.lock:
        store.db.execute(ARTICLES_SQL)
        store.db.commit()


def articles_list(store, limit=50, all_=False):
    return [dict(r) for r in store.q(f"SELECT * FROM articles {'' if all_ else 'WHERE published=1'} ORDER BY updated DESC LIMIT ?", (limit,))]


def slugify(s: str) -> str:
    s = re.sub(r"[^\w؀-ۿ]+", "-", (s or "").strip().replace("‌", "-")).strip("-").lower()
    return s[:80]


def render_body(text: str) -> str:
    """متن ساده با عنوان‌های «## » و فهرست‌های «- » ← HTML امن."""
    out, ul = [], False
    for line in (text or "").splitlines():
        line = line.rstrip()
        m_link = lambda t: re.sub(r"\[([^\]]+)\]\((/[^)\s]*|https?://[^)\s]+)\)", lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', t)
        if line.startswith("- "):
            if not ul:
                out.append("<ul>")
                ul = True
            out.append(f"<li>{m_link(ESC(line[2:]))}</li>")
            continue
        if ul:
            out.append("</ul>")
            ul = False
        if line.startswith("### "):
            out.append(f"<h3>{ESC(line[4:])}</h3>")
        elif line.startswith("## "):
            out.append(f"<h2>{ESC(line[3:])}</h2>")
        elif line.strip():
            out.append(f"<p>{m_link(ESC(line))}</p>")
    if ul:
        out.append("</ul>")
    return "".join(out)


def article(app, base, slug):
    st, site = app.store, _site(app)
    r = st.q("SELECT * FROM articles WHERE slug=? AND published=1", (slug,), one=True)
    if not r:
        return None
    a = dict(r)
    crumbs = [("صفحهٔ اصلی", "/"), ("مقاله‌ها", "/maghale"), (a["title"], "/maghale/" + urllib.parse.quote(slug))]
    c = catalog.CITY_BY_KEY.get(a.get("city_key") or "")
    body = (_crumbs_html(crumbs) + f'<h1>{ESC(a["title"])}</h1><p class="seo-upd">{jdate(a["updated"])}</p>'
            + render_body(a["body"]) + (f'<p><a href="{city_path(c["key"])}">آگهی‌ها و فرصت‌های امروز {ESC(c["name"])}</a></p>' if c else ""))
    ld = [_crumbs_ld(base, crumbs), {"@context": "https://schema.org", "@type": "Article", "headline": a["title"][:110], "inLanguage": "fa-IR",
          "datePublished": time.strftime("%Y-%m-%d", time.gmtime(a["created"])), "dateModified": time.strftime("%Y-%m-%d", time.gmtime(a["updated"])),
          "author": {"@type": "Organization", "name": site["name"]}, "publisher": {"@type": "Organization", "name": site["name"]},
          "mainEntityOfPage": base + "/maghale/" + urllib.parse.quote(slug), "description": a.get("summary") or ""}]
    return {"title": f"{a['title']} | {site['name']}", "desc": (a.get("summary") or a["title"])[:300],
            "canonical": base + "/maghale/" + urllib.parse.quote(slug), "body": body, "ld": ld,
            "hash": "#/p/maghale/" + urllib.parse.quote(slug), "kind": "content"}


def article_index(app, base):
    st, site = app.store, _site(app)
    arts = articles_list(st, 200)
    crumbs = [("صفحهٔ اصلی", "/"), ("مقاله‌ها", "/maghale")]
    body = (_crumbs_html(crumbs) + "<h1>مقاله‌ها و راهنماها</h1>"
            + ("<ul>" + "".join(f'<li><a href="/maghale/{ESC(a["slug"])}">{ESC(a["title"])}</a>{" — " + ESC(a["summary"]) if a.get("summary") else ""}</li>' for a in arts) + "</ul>" if arts else "<p>به‌زودی.</p>")
            + '<h2>راهنماها</h2><ul><li><a href="/rahnama/kharid-melk">چک‌لیست خرید ملک</a></li><li><a href="/rahnama/ejare">چک‌لیست رهن و اجاره</a></li></ul>')
    return {"title": f"مقاله‌ها و راهنماهای خرید و اجارهٔ ملک | {site['name']}", "desc": "مقاله‌ها و راهنماهای خرید، رهن و اجارهٔ ملک و قیمت محله‌ها.",
            "canonical": base + "/maghale", "body": body, "ld": [_crumbs_ld(base, crumbs)], "hash": "#/p/maghale", "kind": "content",
            "noindex": not arts}


STATIC_PAGES = {
    "/method": ("روش ارزش‌گذاری: قیمت محله و فرصت چطور سنجیده می‌شود", "#/method"),
    "/faq": ("پرسش‌های پرتکرار", "#/faq"),
    "/support": ("پشتیبانی", "#/support"),
}


def page(app, base, path):
    path = urllib.parse.unquote(path).rstrip("/") or "/"
    if path in ("/", "/index.html"):
        return home(app, base)
    m = re.fullmatch(r"/melk/([a-z_]+)", path)
    if m:
        return city(app, base, m.group(1))
    m = re.fullmatch(r"/melk/([a-z_]+)/(.+)", path)
    if m:
        return district(app, base, m.group(1), m.group(2))
    m = re.fullmatch(r"/ad/([\w-]+)", path)
    if m:
        return ad(app, base, m.group(1))
    m = re.fullmatch(r"/rahnama/([a-z_-]+)", path)
    if m:
        return guide_static(app, base, m.group(1)) or guide_city(app, base, m.group(1))
    if path == "/maghale":
        return article_index(app, base)
    m = re.fullmatch(r"/maghale/(.+)", path)
    if m:
        return article(app, base, m.group(1))
    if path in STATIC_PAGES:
        t, h = STATIC_PAGES[path]
        site = _site(app)
        return {"title": f"{t} | {site['name']}", "desc": t, "canonical": base + path, "body": f"<h2>{ESC(t)}</h2>", "ld": [], "hash": h,
                "kind": "supplement"}
    return None


def render(template: str, p: dict, version_tag: str) -> str:
    """index.html را با سربرگ و محتوای ازپیش‌ساخته برای همین نشانی پر می‌کند."""
    head = (f'<link rel="canonical" href="{ESC(p["canonical"])}" />\n'
            f'  <meta property="og:type" content="{"article" if p.get("kind") == "content" else "website"}" />\n  <meta property="og:locale" content="fa_IR" />\n'
            f'  <meta property="og:site_name" content="فرصت‌یاب" />\n'
            f'  <meta property="og:title" content="{ESC(p["title"])}" />\n  <meta property="og:description" content="{ESC(p["desc"])}" />\n'
            f'  <meta property="og:url" content="{ESC(p["canonical"])}" />\n'
            f'  <meta property="og:image" content="{ESC(p.get("image") or p["canonical"].split("/", 3)[0] + "//" + p["canonical"].split("/", 3)[2] + "/assets/img/og.png")}" />\n'
            + '  <meta name="twitter:card" content="summary_large_image" />\n'
            + ('  <meta name="robots" content="noindex, follow" />\n' if p.get("noindex") else '  <meta name="robots" content="index, follow, max-image-preview:large" />\n')
            + "".join(f'  <script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n' for x in p["ld"])
            # کاربر واقعی: نشانی سئو به مسیر همان صفحه در برنامه برده می‌شود (پیش از بارگذاری بقیهٔ اسکریپت‌ها)
            + (f'  <script>if(!location.hash)history.replaceState(null,"","/{p["hash"]}");</script>\n' if p.get("hash") else ""))
    out = re.sub(r"<title>.*?</title>", f"<title>{ESC(p['title'])}</title>", template, count=1, flags=re.S)
    out = re.sub(r'<meta name="description" content="[^"]*"\s*/?>', f'<meta name="description" content="{ESC(p["desc"])}" />', out, count=1)
    out = out.replace("</head>", "  " + head + "</head>", 1)
    if p.get("kind") == "content":
        out = out.replace('<main id="view" tabindex="-1"></main>', f'<main id="view" tabindex="-1"><article class="wrap seo-page">{p["body"]}</article></main>', 1)
    else:  # متن «دربارهٔ بازار»، زیر صفحهٔ برنامه و بالای پانویس
        out = out.replace('<footer class="foot">', f'<section class="seo-text" id="seoText" data-hash="{ESC(p.get("hash") or "")}"><div class="wrap">{p["body"]}</div></section>\n  <footer class="foot">', 1)
    # نشانی‌های نسبی فایل‌ها در مسیرهای تو در تو (/melk/rasht) باید از ریشه خوانده شوند
    out = re.sub(r'((?:src|href)=")(assets/|favicon\.svg|manifest\.webmanifest)', r"\1/\2", out)
    return out


def robots(base) -> str:
    return f"User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin.html\nDisallow: /img\nDisallow: /pay/\n\nSitemap: {base}/sitemap.xml\n"


def sitemap(app, base) -> str:
    st = app.store
    act = app.regions()["active"]
    urls = [(base + "/", None, "daily", "1.0"), (base + "/method", None, "monthly", "0.4"), (base + "/faq", None, "monthly", "0.4"),
            (base + "/rahnama/kharid-melk", None, "monthly", "0.5"), (base + "/rahnama/ejare", None, "monthly", "0.5")]
    arts = articles_list(st, 1000)
    if arts:
        urls.append((base + "/maghale", arts[0]["updated"], "weekly", "0.5"))
        urls += [(base + "/maghale/" + urllib.parse.quote(a["slug"]), a["updated"], "monthly", "0.6") for a in arts]
    last = {r["city_key"]: r["t"] for r in st.q("""SELECT city_key, MAX(last_seen) t FROM listings WHERE status='active' AND hidden=0
                                                    AND vertical='estate' GROUP BY city_key""")}
    counts = _counts(st)
    for c in catalog.CITIES:
        if c["province"] in act and last.get(c["key"]):
            urls.append((base + city_path(c["key"]), last[c["key"]], "daily", "0.9"))
            if counts.get(c["key"], 0) >= 20:
                urls.append((base + guide_path(c["key"]), last[c["key"]], "weekly", "0.7"))
            for d in st.districts(c["key"]):
                if d["n"] >= 5:
                    urls.append((base + city_path(c["key"], d["name"]), last[c["key"]], "daily", "0.7"))
    room = max(0, 49000 - len(urls))
    for r in st.q("""SELECT id, last_seen FROM listings WHERE status='active' AND hidden=0 AND vertical='estate' AND COALESCE(excluded,0)=0
                     ORDER BY (label IN ('gold','good')) DESC, last_seen DESC LIMIT ?""", (room,)):
        urls.append((f"{base}/ad/{r['id']}", r["last_seen"], "weekly", "0.6"))
    rows = "".join(f"<url><loc>{ESC(u)}</loc>" + (f"<lastmod>{time.strftime('%Y-%m-%d', time.gmtime(t))}</lastmod>" if t else "")
                   + f"<changefreq>{cf}</changefreq><priority>{pr}</priority></url>" for u, t, cf, pr in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{rows}</urlset>'
