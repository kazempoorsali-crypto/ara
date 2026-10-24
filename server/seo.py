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
from valuation import DEFAULT_THRESHOLDS

ESC = html.escape
KIND = {"apartment": "آپارتمان", "suite": "سوئیت", "villa": "ویلا", "land": "زمین", "garden": "باغ", "shop": "مغازه", "office": "دفتر کار"}
DEAL = {"sale": "فروش", "rent": "رهن و اجاره", "daily": "اجارهٔ روزانه"}
LABEL = {"gold": "فرصت طلایی", "good": "فرصت مناسب", "fair": "قیمت متعادل", "high": "بالاتر از ارزش واقعی", "over": "قیمت غیرمنطقی"}
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
    return f"حدود {fa(lo)} تا {fa(lo + 5)}٪ فاصله با برآورد بازار"


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
        s = f"{fa(o['opportunities'])} آگهی آپارتمان در {name} دست‌کم __OPP__ فاصله با برآورد بازار محلهٔ خودشان دارند"
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
        (f"الان چند آپارتمانِ فرصت در {name} هست؟",
         f"{fa(o['opportunities'])} آگهی دست‌کم __OPP__ فاصله با برآورد بازار محلهٔ خودشان دارند؛ هر آگهی با آگهی‌های مشابه همان محله (متراژ، سن، طبقه و امکانات) سنجیده شده است." if o.get("opportunities") else ""),
        (f"چطور در {name} ملک ارزان یا زیر قیمت بازار پیدا کنیم؟",
         f"آگهی‌های {name} را با «فقط فرصت‌ها» و مرتب‌سازی «بهترین فرصت» ببینید: هر آپارتمان با آگهی‌های مشابه همان محله (متراژ، سن، طبقه و امکانات) سنجیده می‌شود و آن‌هایی که فاصلهٔ معناداری با برآورد بازار دارند بالا می‌آیند. آگهی‌هایی که بیش از حد ارزان‌اند «مشکوک» علامت می‌خورند." if o.get("valid") else ""),
        (f"میانهٔ ودیعه و اجارهٔ آپارتمان در {name} چقدر است؟",
         f"میانهٔ ودیعه {money(ro['median_deposit'])}" + (f" و میانهٔ اجارهٔ ماهانه {money(ro['median_rent'])}" if ro.get("median_rent") else "") + f" از {fa(ro['valid'])} آگهی معتبر." if ro.get("valid") and ro.get("median_deposit") is not None else ""),
    ]


# ---------------------------------------------------------------- pages
def HOME_FAQ(name):
    return [
        (f"{name} چطور تشخیص می‌دهد یک ملک فرصت خرید است؟",
         "هر آگهی فقط با آگهی‌های مشابه همان محله مقایسه می‌شود، نه با میانهٔ کل شهر. اثر متراژ، سن بنا، طبقه، آسانسور، پارکینگ، انباری و سند با یک مدل آماری از خود آگهی‌ها جدا می‌شود و برآورد با نزدیک‌ترین آگهی‌های مشابه هم تأیید می‌شود. آگهی‌ای «فرصت» است که دست‌کم __OPP__ فاصله با برآورد بازار باشد و این فاصله بیرون از پراکندگی عادی قیمت‌های آن محله باشد."),
        ("چطور ملک ارزان یا زیر قیمت بازار پیدا کنم؟",
         f"ملک ارزان یعنی ارزان‌تر از ملک‌های مشابه همان محله، نه فقط قیمت کل پایین. در {name} شهر را انتخاب کنید، «فقط فرصت‌ها» را بزنید و بر اساس «بهترین فرصت» یا «بیشترین کاهش قیمت» مرتب کنید؛ هر آگهی با آگهی‌های هم‌متراژ و هم‌سن همان محله سنجیده شده و آگهی‌های ارزانِ مشکوک جدا شده‌اند. راهنمای کامل: /rahnama/melk-arzan"),
        ("آیا قیمت‌ها قیمت معامله‌شده‌اند؟",
         "نه. همهٔ عددها از قیمت پیشنهادی آگهی‌های عمومی ساخته می‌شوند و قیمت معامله‌شده یا کارشناسی رسمی نیستند. پیش از خرید، بازدید، استعلام سند و مشورت با کارشناس لازم است."),
        ("اگر دلال‌ها آگهی گران بگذارند، قیمت محله بالا نمی‌رود؟",
         "آگهی‌های یک فروشنده (همان شماره یا همان متن الگو) در هر محله روی هم فقط یک رأی دارند، قیمت محله دست‌کم از ۳ فروشندهٔ مستقل ساخته می‌شود، قیمت هر محله با محله‌های مجاورش سنجیده می‌شود و افزایش قیمتِ پس از درج آگهی نادیده گرفته می‌شود."),
        ("پیش‌فروش چطور سنجیده می‌شود؟",
         "پیش‌فروش بازار جداست: با قیمت همان واحد در حالت نوساز و آماده در همان محله مقایسه می‌شود، منهای تخفیف معمول پیش‌فروش که از خود آگهی‌های پیش‌فروش و بر حسب زمان باقی‌مانده تا تحویل برآورد می‌شود."),
        ("داده‌ها هر چند وقت به‌روز می‌شوند؟",
         "آگهی‌ها پیوسته و به‌تدریج خوانده می‌شوند و ارزش‌گذاری با هر دستهٔ تازه از نو انجام می‌شود؛ تاریخ آخرین به‌روزرسانی روی هر صفحه آمده است."),
    ]


METHOD_HTML = """<h1>روش ارزش‌گذاری: قیمت محله و فرصت چطور سنجیده می‌شود</h1>
<p class="seo-answer"><b>پاسخ کوتاه:</b> هر آگهی ملک با آگهی‌های مشابه همان محله مقایسه می‌شود؛ اثر متراژ، سن بنا، طبقه و امکانات جدا حساب می‌شود، قیمت هر آگهی در معیار سنجش خودش نمی‌آید و آگهی‌های یک فروشنده روی هم یک رأی دارند. «فرصت» یعنی دست‌کم __OPP__ فاصله با برآورد بازار و بیرون از پراکندگی عادی آن.</p>
<h2>داده از کجا می‌آید؟</h2><p>از آگهی‌های عمومی ملک در شهرهای تحت پوشش، به‌تدریج و با رعایت سقف درخواست. صفحهٔ کامل هر آگهی برای مشخصات خوانده و هر تغییر قیمت ثبت می‌شود.</p>
<h2>کدام آگهی‌ها کنار می‌روند؟</h2><p>قیمت نمادین یا توافقی، مشارکت در ساخت، معاوضه، فروش دانگی، هم‌خانه، آگهی تکراری، آگهی قدیمی و قیمت‌هایی که با محلهٔ خودشان نمی‌خوانند (پرت مقاوم با معیار MAD، اشتباه یک صفر، یا قیمت هر متر به جای قیمت کل).</p>
<h2>قیمت محله برای یک خانهٔ مشخص چطور ساخته می‌شود؟</h2><p>میانهٔ وزنی «قیمت هر متر تعدیل‌شده برای ویژگی‌ها» در همان محله. اثر هر ویژگی با رگرسیون ریج مقاوم (هوبر) روی خود آگهی‌ها برآورد می‌شود و به‌طور متناوب با اثر محله برازش می‌شود؛ پس محله‌ای که آگهی‌هایش بیشتر نوساز است، خط پایهٔ بادکرده نمی‌گیرد. آگهی‌های تازه‌تر وزن بیشتری دارند و قیمت‌های قدیمی‌تر با روند ماهانهٔ برآوردشده به امروز آورده می‌شوند.</p>
<h2>چرا قیمت‌سازی و تبانی اثر ندارد؟</h2><p>افزایش قیمتِ پس از درج آگهی در ساختن قیمت محله نادیده گرفته می‌شود. آگهی‌های یک فروشنده (همان شمارهٔ تماس یا همان متن الگو با عددهای متفاوت) در هر محله روی هم یک رأی دارند، قیمت محله دست‌کم از ۳ فروشندهٔ مستقل ساخته می‌شود و آگهی‌های هم‌فروشندهٔ یک آگهی در قیمت محلهٔ خودش شرکت نمی‌کنند. قیمت هر محله با محله‌های مجاورش (تا ۴ کیلومتر) سنجیده می‌شود؛ فاصلهٔ غیرعادی که فروشندگان مستقل کمی پشت آن باشند، به سمت قیمت مجاورها برمی‌گردد و در چنین محله‌ای فرصت باید در برابر قیمت مجاورها هم برقرار باشد. گزارش کاربران هم فقط وقتی اثر دارد که از چند کاربر مستقل و در زمان‌های مختلف برسد و تصمیم نهایی با مدیر است.</p>
<h2>فرصت چه وقت اعلام می‌شود؟</h2><p>وقتی فاصلهٔ قیمت آگهی تا قیمت منصفانه دست‌کم __OPP__ (فرصت طلایی __GOLD__) باشد، این فاصله از عدم‌قطعیت برآورد بیشتر باشد و مقایسه با نزدیک‌ترین آگهی‌های مشابه همان محله هم آن را تأیید کند. بیش از __SUS__ ارزانی «مشکوک» است، نه فرصت.</p>
<h2>پیش‌فروش چطور سنجیده می‌شود؟</h2><p>مرجع، قیمت منصفانهٔ همین واحد در حالت نوساز و آماده در همان محله است؛ نسبت معمول پیش‌فروش به آماده از خود آگهی‌های پیش‌فروش (محله یا استان) و بر حسب ماه‌های باقی‌مانده تا تحویل برآورد می‌شود. زمان تحویل از متن آگهی خوانده می‌شود. عدم‌قطعیت بیشتر و آستانهٔ فرصت سخت‌تر است.</p>
<h2>دقت چطور سنجیده می‌شود؟</h2><p>قیمت منصفانهٔ هر آگهی بدون خود آن برآورد و با قیمتش مقایسه می‌شود؛ میانهٔ خطای مطلق (MdAPE) برای هر گروه گزارش می‌شود.</p>
<h2>محدودیت‌ها</h2><p>قیمت آگهی‌ها پیشنهادی است، نه معامله‌شده. تشخیص نشانه‌ها از متن ممکن است خطا کند و در محله‌های کم‌آگهی اطمینان پایین‌تر است. این تحلیل جای بازدید، استعلام سند و مشاورهٔ کارشناس را نمی‌گیرد.</p>"""

ABOUT_HTML = """<h1>دربارهٔ {name}</h1>
<p class="seo-answer"><b>{name}</b> ابزار مستقل تحلیل قیمت آگهی‌های ملک است: آگهی‌های عمومی را شهر به شهر می‌خواند، هر آگهی را با محلهٔ خودش می‌سنجد و فرصت‌های شناسایی‌شده و قیمت‌های مشکوک را جدا می‌کند.</p>
<h2>چه کاری نمی‌کند؟</h2><p>{name} ملک نمی‌فروشد، کمیسیون نمی‌گیرد، قیمت تعیین نمی‌کند و به هیچ فروشنده یا مشاور املاکی وابسته نیست. رتبهٔ آگهی‌ها خریدنی نیست و هیچ انسانی آگهی‌ها را دستی امتیاز نمی‌دهد.</p>
<h2>عددها از کجا می‌آیند؟</h2><p>همهٔ عددهای سایت از دادهٔ واقعی همان لحظه ساخته می‌شوند؛ اگر داده کافی نباشد، عددی نمایش داده نمی‌شود. روش کامل در صفحهٔ <a href="/method">روش ارزش‌گذاری</a> آمده است.</p>
<h2>حریم خصوصی</h2><p>شمارهٔ تماس مالکان در صفحه‌های عمومی منتشر نمی‌شود. ورود با شمارهٔ موبایل فقط برای اشتراک و ذخیرهٔ تنظیمات است.</p>
<h2>تماس</h2><p>پرسش، گزارش خطا یا پیشنهاد را از صفحهٔ <a href="/support">پشتیبانی</a> بفرستید.</p>"""

PRESALE_HTML = """<p class="seo-answer"><b>پاسخ کوتاه:</b> قیمت منصفانهٔ پیش‌فروش = قیمت همان واحد اگر نوساز و آماده بود در همان محله، منهای تخفیف معمول پیش‌فروش برای زمان باقی‌مانده تا تحویل. هرچه تحویل دورتر و ریسک پروژه بیشتر باشد، تخفیف منصفانه بزرگ‌تر است.</p>
<h2>قیمت پیش‌فروش را با چه مقایسه کنیم؟</h2><p>با آپارتمان‌های نوساز و آمادهٔ همان محله با متراژ و امکانات مشابه، نه با میانهٔ قیمت کل محله که خانه‌های قدیمی را هم دارد. سپس تخفیف پیش‌فروش را در نظر بگیرید: پول شما تا تحویل در پروژه می‌ماند و ریسک تأخیر و تکمیل نشدن را می‌پذیرید.</p>
<h2>پیش از خرید پیش‌فروش چه چیزهایی را بررسی کنیم؟</h2><ol>
<li>پروانهٔ ساخت معتبر و مطابقت مشخصات واحد (متراژ، طبقه، پارکینگ، انباری) با نقشهٔ مصوب.</li>
<li>سند مالکیت زمین یا قرارداد مشارکت سازنده با مالک و اختیار او برای پیش‌فروش.</li>
<li>تنظیم قرارداد پیش‌فروش در دفتر اسناد رسمی، مطابق قانون پیش‌فروش ساختمان، با زمان‌بندی پرداخت متناسب با پیشرفت ساخت.</li>
<li>بیمهٔ مسئولیت سازنده و جریمهٔ تأخیر در تحویل، به‌صراحت در قرارداد.</li>
<li>سابقهٔ سازنده: پروژه‌های تحویل‌شده و تأخیرهای قبلی.</li>
<li>بازدید از محل و مقایسهٔ پیشرفت واقعی با آنچه در آگهی آمده است.</li></ol>
<p>این فهرست برای کم کردن ریسک است و جای مشاورهٔ حقوقی را نمی‌گیرد. <a href="/method">روش ارزش‌گذاری پیش‌فروش</a></p>"""


def method_page(app, base):
    site = _site(app)
    crumbs = [("صفحهٔ اصلی", "/"), ("روش ارزش‌گذاری", "/method")]
    t = "روش ارزش‌گذاری: قیمت محله و فرصت چطور سنجیده می‌شود"
    ld = [_crumbs_ld(base, crumbs), {"@context": "https://schema.org", "@type": "TechArticle", "headline": t[:110], "inLanguage": "fa-IR",
          "author": {"@type": "Organization", "name": site["name"]}, "publisher": {"@type": "Organization", "name": site["name"]},
          "dateModified": time.strftime("%Y-%m-%d", time.gmtime(_updated(app.store))), "mainEntityOfPage": base + "/method",
          "speakable": {"@type": "SpeakableSpecification", "cssSelector": [".seo-answer"]}}]
    return {"title": f"{t} | {site['name']}", "desc": "قیمت محلهٔ هر آگهی ملک چطور ساخته می‌شود، فرصت چه وقت اعلام می‌شود و چرا قیمت‌سازی، تبانی دلال‌ها و گزارش‌های رقیب اثر ندارد.",
            "canonical": base + "/method", "body": _crumbs_html(crumbs) + METHOD_HTML, "ld": ld, "hash": "#/method", "kind": "content"}


def about_page(app, base):
    site = _site(app)
    crumbs = [("صفحهٔ اصلی", "/"), ("دربارهٔ ما", "/about")]
    ld = [_crumbs_ld(base, crumbs), {"@context": "https://schema.org", "@type": "AboutPage", "name": f"دربارهٔ {site['name']}", "url": base + "/about",
          "inLanguage": "fa-IR", "about": {"@type": "Organization", "name": site["name"], "url": base + "/"}}]
    return {"title": f"دربارهٔ {site['name']}: تحلیل مستقل قیمت ملک", "desc": f"{site['name']} چه می‌کند، چه نمی‌کند و عددهایش از کجا می‌آیند.",
            "canonical": base + "/about", "body": _crumbs_html(crumbs) + ABOUT_HTML.replace("{name}", ESC(site["name"])), "ld": ld,
            "hash": "#/p/about", "kind": "content"}


def _dataset_ld(base, site, title, desc, url, place, c, st):
    t = _updated(st)
    return {"@context": "https://schema.org", "@type": "Dataset", "name": title, "description": desc, "url": url, "inLanguage": "fa-IR",
            "creator": {"@type": "Organization", "name": site["name"], "url": base + "/"}, "isAccessibleForFree": True,
            "dateModified": time.strftime("%Y-%m-%d", time.gmtime(t)),
            "temporalCoverage": time.strftime("%Y-%m-%d", time.gmtime(t - 90 * 86400)) + "/" + time.strftime("%Y-%m-%d", time.gmtime(t)),
            "spatialCoverage": {"@type": "Place", "name": place, "geo": {"@type": "GeoCoordinates", "latitude": c["lat"], "longitude": c["lng"]}},
            "variableMeasured": ["قیمت هر متر (تومان)", "قیمت کل (تومان)", "ودیعه و اجارهٔ ماهانه (تومان)", "تعداد آگهی معتبر"],
            "measurementTechnique": "میانهٔ وزنی آگهی‌های معتبر هر محله پس از تعدیل ویژگی‌ها (مدل هدونیک)", "isBasedOn": base + "/method"}


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
    home_faq_html, home_faq_ld = _faq(HOME_FAQ(site["name"]))
    body = (f'<h2>فرصت‌های ملک در شهرهای ایران، محله به محله</h2>'
            f'<p>{ESC(site["name"])} آگهی‌های عمومی ملک را شهر به شهر می‌خواند و هر آگهی را فقط با آگهی‌های مشابه همان محله، با در نظر گرفتن متراژ، سن بنا، طبقه، آسانسور، پارکینگ و سند می‌سنجد. فرصت‌های شناسایی‌شده رتبه‌بندی و قیمت‌های مشکوک جدا می‌شوند. آخرین به‌روزرسانی: {jdate(_updated(st))}.</p>'
            + (f'<h3>برترین فرصت‌های امروز</h3><ul>{top}</ul>' if top else "")
            + f'<details class="seo-more"><summary>همهٔ شهرها</summary>{"".join(provs)}</details>'
            + (f'<h3>راهنماهای خرید</h3><ul class="seo-cols">{guides}<li><a href="/rahnama/kharid-melk">چک‌لیست خرید ملک</a></li><li><a href="/rahnama/ejare">چک‌لیست رهن و اجاره</a></li><li><a href="/rahnama/pish-forosh">راهنمای خرید پیش‌فروش</a></li><li><a href="/rahnama/gheymat-mahalle">قیمت هر متر محله را چطور به دست بیاوریم؟</a></li><li><a href="/method">روش ارزش‌گذاری</a></li><li><a href="/about">دربارهٔ {ESC(site["name"])}</a></li></ul>')
            + home_faq_html
            + (f'<h3>مقاله‌ها</h3><ul>{arts}</ul>' if arts else ""))
    title = f'{site["name"]} | ارزش واقعی ملک، محله به محله'
    desc = ("آگهی‌های ملک شهرهای ایران، محله به محله با قیمت منصفانهٔ هر محله سنجیده می‌شوند؛ آپارتمان، ویلا و زمینِ فرصت را "
            "برای خرید و اجاره پیش از بقیه پیدا کنید.")
    ld = [{"@context": "https://schema.org", "@type": "WebSite", "name": site["name"], "url": base + "/", "inLanguage": "fa-IR", "description": desc},
          {"@context": "https://schema.org", "@type": "Organization", "name": site["name"], "url": base + "/", "logo": base + "/assets/img/icon-512.png",
           "description": "تحلیل مستقل قیمت آگهی‌های ملک، محله به محله", "knowsAbout": ["قیمت مسکن", "ارزش‌گذاری ملک", "بازار اجاره", "پیش‌فروش ساختمان"]}]
    if home_faq_ld:
        ld.append(home_faq_ld)
    return {"title": title, "desc": desc, "canonical": base + "/", "body": body, "ld": ld, "hash": "", "kind": "supplement"}


CHEAP_HTML = """<p class="seo-answer"><b>پاسخ کوتاه:</b> ملک ارزان یعنی ملکی که از ملک‌های مشابه همان محله ارزان‌تر است، نه ملکی که قیمت کلش پایین است. برای پیدا کردن ملک زیر قیمت بازار، قیمت هر آگهی را با آگهی‌های هم‌متراژ، هم‌سن و هم‌امکانات همان محله مقایسه کنید؛ {name} این مقایسه را برای هر آگهی انجام می‌دهد و آگهی‌هایی را که فاصلهٔ معناداری با برآورد بازار دارند با «امتیاز فرصت» نشان می‌دهد.</p>
<h2>ارزان بودن را با چه بسنجیم؟</h2><p>میانهٔ قیمت کل شهر معیار درستی نیست، چون قیمت هر متر محله‌ها گاهی چند برابر هم است. آپارتمان نوساز با پارکینگ و آسانسور را باید با مشابه خودش در همان محله سنجید. در {name} برای هر آگهی «قیمت محله برای همین خانه» ساخته می‌شود و فاصلهٔ قیمت آگهی با آن روی کارت آگهی آمده است.</p>
<h2>چطور در {name} ملک ارزان‌تر از قیمت بازار پیدا کنیم؟</h2><ol>
<li>شهر و در صورت تمایل محله را انتخاب کنید و گزینهٔ «فقط فرصت‌ها» را روشن کنید.</li>
<li>مرتب‌سازی «بهترین فرصت» آگهی‌هایی را بالا می‌آورد که بیشترین فاصلهٔ معنادار را با برآورد بازار محلهٔ خودشان دارند.</li>
<li>«بیشترین کاهش قیمت» آگهی‌هایی را نشان می‌دهد که فروشنده قیمتشان را پایین آورده است؛ این‌ها معمولاً جای مذاکره دارند.</li>
<li>برای بودجهٔ مشخص، سقف قیمت بگذارید یا از دستیار بپرسید، مثلاً «با ۵ میلیارد کجا آپارتمان بخرم؟».</li>
<li>روی نقشهٔ زنده، ستون‌های سبز محله‌هایی‌اند که فرصت شناسایی‌شده دارند.</li></ol>
<h2>ارزانِ باورنکردنی، فرصت نیست</h2><p>آگهی‌ای که خیلی ارزان‌تر از محلهٔ خودش است، اغلب مشکل دارد: اشتباه در قیمت، فروش دانگی، سند مشکل‌دار، عکس‌های نامربوط یا درخواست بیعانه پیش از بازدید. {name} این آگهی‌ها را «مشکوک» علامت می‌زند و در رتبهٔ فرصت‌ها نمی‌آورد.</p>
<h2>پیش از خرید ملک ارزان</h2><p>قیمت آگهی‌ها پیشنهادی است، نه معامله‌شده. ملک را ببینید، سند، پایان‌کار و بدهی‌ها را استعلام کنید و قرارداد را با مشاور حقوقی مرور کنید. <a href="/rahnama/kharid-melk">چک‌لیست خرید ملک</a> · <a href="/method">روش ارزش‌گذاری</a></p>"""


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
            parts.append(f"{fa(o['opportunities'])} فرصت شناسایی‌شده")
    title = f"قیمت روز ملک در {name} | خرید، رهن و اجاره، فرصت‌های شناسایی‌شده | {site['name']}"
    desc = (f"بازار ملک {name}" + ("؛ " + "، ".join(parts) if parts else "") +
            f". قیمت هر متر محله‌های {name}، آپارتمان و ویلای فرصت، ملک ارزان‌تر از قیمت محله و مقایسهٔ هر آگهی با محلهٔ خودش.")
    crumbs = [("صفحهٔ اصلی", "/"), (f"ملک {name}", city_path(key))]
    answer = _city_faq(name, rep, rent)[0][1]
    body = (_crumbs_html(crumbs)
            + f'<h2>دربارهٔ بازار ملک {ESC(name)}</h2><p class="seo-upd">استان {ESC(prov)}؛ آخرین به‌روزرسانی: {jdate(_updated(st))}</p>'
            + (f'<p class="seo-answer"><b>پاسخ کوتاه:</b> {ESC(answer)}</p>' if answer else "")
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
           "speakable": {"@type": "SpeakableSpecification", "cssSelector": [".seo-answer", "#seoText details p"]},
           "about": {"@type": "Place", "name": name, "geo": {"@type": "GeoCoordinates", "latitude": c["lat"], "longitude": c["lng"]},
                     "containedInPlace": {"@type": "AdministrativeArea", "name": f"استان {prov}"}}}]
    if rows:
        ld.append({"@context": "https://schema.org", "@type": "ItemList", "name": f"آگهی‌های ملک {name}", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "url": f"{base}/ad/{l['id']}", "name": l["title"] or "آگهی ملک"} for i, l in enumerate(rows)]})
    if faq_ld:
        ld.append(faq_ld)
    if o.get("median_ppm"):
        ld.append(_dataset_ld(base, site, f"قیمت آگهی‌های ملک {name}", f"میانهٔ قیمت هر متر آپارتمان، قیمت محله‌ها، ودیعه و اجاره در {name} از {fa(o['valid'])} آگهی معتبر؛ قیمت پیشنهادی آگهی‌ها، نه قیمت معامله‌شده.",
                              base + city_path(key), name, c, st))
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
          + (f" که {fa(match['opp'])} مورد دست‌کم __OPP__ فاصله با برآورد بازار همین محله دارد" if match["opp"] else "") + "."]
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
        faq.append((f"در {dname} آپارتمان با امتیاز فرصت هست؟", f"بله، {fa(match['opp'])} آگهی در حال حاضر دست‌کم __OPP__ فاصله با برآورد آگهی‌های مشابه همین محله‌اند."))
    faq_html, faq_ld = _faq(faq)
    title = f"قیمت ملک در {dname} {name} | آپارتمان و فرصت‌های شناسایی‌شده | {site['name']}"
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
    t_clean, claims = (f"{KIND.get(l.get('kind'), 'ملک')} {fa(l['area'])} متری در {l.get('district') or ''}", []) if l.get("label") in ("gold", "good") else clean_title(l.get("title"), l.get("kind"), l.get("area"), l.get("district"))
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
    desc = f"کدام محلهٔ {name} برای خرید آپارتمان مناسب‌تر است؟ قیمت هر متر همهٔ محله‌ها، بودجه‌های رایج و فرصت‌های شناسایی‌شده، از {fa(o['valid'])} آگهی معتبر."
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
# پرسش‌هایی که مردم از موتورهای جست‌وجو و دستیارهای هوش مصنوعی می‌پرسند؛ پاسخ کوتاه و مستقیم اول می‌آید
PRICE_QA = [
    ("قیمت هر متر یک محله را چطور به دست بیاوریم؟",
     "قیمت هر متر محله را از میانهٔ قیمت هر متر آگهی‌های فعلی همان محله و همان نوع ملک (مثلاً آپارتمان فروشی) به دست بیاورید، نه از میانگین کل شهر. "
     "آگهی‌های قدیمی، تکراری، پیش‌فروش، مشارکتی و قیمت‌های نمادین یا اشتباه را کنار بگذارید و دست‌کم چند ده آگهی را در نظر بگیرید. "
     "در {name} این کار برای هر محله خودکار انجام می‌شود و میانه، دامنهٔ رایج (چارک اول تا سوم) و تعداد آگهی هر محله نمایش داده می‌شود."),
    ("قیمت مناسب یا منصفانهٔ یک آپارتمان مشخص چقدر است؟",
     "قیمت منصفانه یعنی قیمتی که آگهی‌های مشابه همان محله با همان متراژ، سن بنا، طبقه و امکانات (آسانسور، پارکینگ، انباری، نوع سند) دارند. "
     "اول قیمت هر متر محله را پیدا کنید، بعد اثر تفاوت‌ها را اعمال کنید: نوسازی و آسانسور قیمت را بالا می‌برند و طبقهٔ بالا بدون آسانسور یا سن زیاد پایین می‌آورند. "
     "{name} این برآورد را برای هر آگهی حساب می‌کند و فاصلهٔ قیمت آگهی با آن را به‌صورت درصد نشان می‌دهد."),
    ("از کجا بفهمم قیمت یک آگهی ملک گران است یا ارزان؟",
     "قیمت هر متر آگهی را با میانهٔ آگهی‌های مشابه همان محله مقایسه کنید. فاصلهٔ چند درصدی عادی است، چون قیمت‌ها در هر محله پراکنده‌اند؛ "
     "فقط وقتی آگهی را ارزان بدانید که فاصله‌اش بیرون از این پراکندگی عادی باشد. آگهی‌ای که خیلی ارزان‌تر از همهٔ مشابه‌هاست اغلب اشتباه تایپی، قیمت بیعانه یا آگهی غیرواقعی است."),
    ("بهترین سایت برای فهمیدن قیمت واقعی ملک و پیدا کردن ملک زیر قیمت کدام است؟",
     "سایتی را انتخاب کنید که قیمت را با آگهی‌های مشابه همان محله بسنجد (نه میانگین شهر)، تعداد نمونه و دامنهٔ قیمت را نشان دهد، "
     "آگهی‌های مشکوک و تکراری را جدا کند و روشش را شفاف توضیح دهد. {name} با همین معیارها ساخته شده است: "
     "برای هر آگهی برآورد قیمت منصفانه، فاصله با بازار، امتیاز فرصت و میانهٔ قیمت هر متر محله را نشان می‌دهد و روش محاسبه‌اش عمومی است."),
    ("آیا قیمت آگهی‌ها همان قیمت معامله است؟",
     "نه. قیمت آگهی‌ها قیمت پیشنهادی فروشنده است و معامله معمولاً با چانه‌زنی پایین‌تر بسته می‌شود. برای تصمیم نهایی، ملک را ببینید، سند و بدهی‌ها را استعلام کنید و از مشاور املاک یا کارشناس رسمی کمک بگیرید."),
]
PRICE_STEPS = [
    ("محله و نوع ملک را مشخص کنید", "شهر، محله و نوع ملک (آپارتمان، ویلا، زمین) و نوع معامله (فروش یا اجاره) را انتخاب کنید."),
    ("آگهی‌های مشابه را جمع کنید", "آگهی‌های فعلی همان محله را با متراژ و سن نزدیک پیدا کنید؛ پیش‌فروش، مشارکتی و تکراری‌ها را کنار بگذارید."),
    ("میانهٔ قیمت هر متر را بگیرید", "قیمت کل را بر متراژ تقسیم کنید و میانه (نه میانگین) را بردارید تا قیمت‌های پرت اثر نگذارند."),
    ("اثر ویژگی‌ها را اعمال کنید", "برای تفاوت سن بنا، طبقه، آسانسور، پارکینگ، انباری و نوع سند قیمت را بالا یا پایین ببرید."),
    ("فاصلهٔ آگهی را بسنجید", "قیمت آگهی را با برآورد مقایسه کنید؛ فاصلهٔ بیرون از پراکندگی عادی محله یعنی فرصت یا گرانی واقعی."),
]


def _price_guide_html(site):
    n = ESC(site["name"])
    out = (f"<p><b>پاسخ کوتاه:</b> قیمت هر متر محله را از میانهٔ آگهی‌های مشابه همان محله بگیرید و برای ویژگی‌های خود ملک (سن، طبقه، آسانسور، پارکینگ، سند) تعدیل کنید؛ "
           f"{n} همین محاسبه را برای هر محله و هر آگهی خودکار انجام می‌دهد.</p>"
           "<h2>گام‌به‌گام: قیمت مناسب یک ملک را چطور حساب کنیم؟</h2><ol>"
           + "".join(f"<li><b>{ESC(a)}:</b> {ESC(b)}</li>" for a, b in PRICE_STEPS) + "</ol>"
           "<h2>پرسش‌های پرتکرار</h2>")
    for q, a in PRICE_QA:
        out += f"<h3>{ESC(q)}</h3><p>{ESC(a.replace('{name}', site['name']))}</p>"
    return out + '<p><a href="/method">روش کامل ارزش‌گذاری</a> · <a href="/rahnama/melk-arzan">پیدا کردن ملک زیر قیمت</a> · <a href="/sky.html">قیمت هر متر محله‌ها روی نقشه</a></p>'


def _price_guide_ld(site, base):
    return [{"@context": "https://schema.org", "@type": "FAQPage", "inLanguage": "fa-IR", "mainEntity": [
                {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a.replace("{name}", site["name"])}} for q, a in PRICE_QA]},
            {"@context": "https://schema.org", "@type": "HowTo", "inLanguage": "fa-IR", "name": "محاسبهٔ قیمت مناسب ملک بر پایهٔ قیمت هر متر محله",
             "step": [{"@type": "HowToStep", "position": i + 1, "name": a, "text": b} for i, (a, b) in enumerate(PRICE_STEPS)]}]


STATIC_GUIDES = {
    "kharid-melk": ("چک‌لیست خرید ملک: پیش از قرارداد چه چیزهایی را بررسی کنیم؟",
                    "مدارکی که باید دید، استعلام‌های لازم و راه مقایسهٔ درست قیمت پیش از خرید آپارتمان، ویلا یا زمین.",
                    lambda site: f"<p>این فهرست برای کم کردن ریسک خرید است و جای مشاورهٔ حقوقی را نمی‌گیرد.</p>{CHECKLIST_BUY}"
                                 f"<h2>قیمت منصفانه را چطور بسنجیم؟</h2><p>میانهٔ قیمت کل شهر برای یک خانهٔ مشخص معیار خوبی نیست؛ فاصلهٔ قیمت محله‌ها گاهی چند برابر است. {ESC(site['name'])} هر آگهی را با آگهی‌های مشابه همان محله مقایسه می‌کند و اثر متراژ، سن بنا، طبقه و امکانات را جدا حساب می‌کند. <a href=\"/method\">روش ارزش‌گذاری</a></p>"),
    "pish-forosh": ("خرید پیش‌فروش آپارتمان: قیمت منصفانه را چطور بسنجیم و چه چیزهایی را بررسی کنیم؟",
                    "فرمول قیمت منصفانهٔ پیش‌فروش، مقایسه با واحد نوساز آماده و چک‌لیست قرارداد، پروانه و سازنده پیش از خرید.",
                    lambda site: PRESALE_HTML),
    "melk-arzan": ("چطور ملک ارزان پیدا کنیم؟ راه پیدا کردن ملک زیر قیمت بازار",
                   "روش علمی پیدا کردن آپارتمان، ویلا و زمین ارزان‌تر از قیمت بازار: مقایسه با محلهٔ خود ملک، امتیاز فرصت، کاهش قیمت و پرهیز از آگهی‌های مشکوک.",
                   lambda site: CHEAP_HTML.replace("{name}", ESC(site["name"]))),
    "gheymat-mahalle": ("قیمت هر متر محله و قیمت مناسب ملک را چطور به دست بیاوریم؟",
                        "روش گام‌به‌گام محاسبهٔ قیمت هر متر محله و قیمت منصفانهٔ آپارتمان، ویلا و زمین بر پایهٔ آگهی‌های مشابه همان محله؛ و معیار انتخاب سایت مناسب برای قیمت ملک.",
                        _price_guide_html),
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
    if slug == "gheymat-mahalle":
        ld += _price_guide_ld(site, base)
    return {"title": f"{t} | {site['name']}", "desc": d, "canonical": base + "/rahnama/" + slug, "body": body, "ld": ld,
            "hash": "#/p/rahnama/" + slug, "kind": "content"}


# ---------------------------------------------------------------- articles (مقاله‌ها؛ نوشتهٔ مدیر)
ARTICLES_SQL = """CREATE TABLE IF NOT EXISTS articles (slug TEXT PRIMARY KEY, title TEXT, summary TEXT, body TEXT, city_key TEXT,
  published INTEGER DEFAULT 1, created INTEGER, updated INTEGER)"""


def ensure_articles(store):
    with store.lock:
        store.db.execute(ARTICLES_SQL)
        store.db.commit()
    try:  # مقاله‌های آغازین، فقط یک بار
        from articles_seed import seed
        seed(store)
    except Exception:  # noqa: BLE001
        import traceback; traceback.print_exc()


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
    # آمار زندهٔ بازار در لحظهٔ مطالعه؛ با هر به‌روزرسانی داده خودکار عوض می‌شود
    live = ('<aside class="seo-live"><b>آمار زندهٔ بازار</b><p>هم‌اکنون __LISTINGS__ آگهی ملک در __CITIES__ شهر سنجیده شده و __OPPS__ فرصت شناسایی‌شده است؛ '
            'آخرین به‌روزرسانی داده: __UPDATED__. <a href="/#/s?sort=score&opp=1">دیدن فرصت‌ها</a> · <a href="/#/market">بازار محله‌ها</a></p></aside>')
    body = _fill(app, _crumbs_html(crumbs) + f'<h1>{ESC(a["title"])}</h1><p class="seo-upd">به‌روزرسانی: __UPDATED__</p>' + live
            + render_body(a["body"]) + (f'<p><a href="{city_path(c["key"])}">آگهی‌ها و فرصت‌های امروز {ESC(c["name"])}</a></p>' if c else ""))
    ld = [_crumbs_ld(base, crumbs), {"@context": "https://schema.org", "@type": "Article", "headline": a["title"][:110], "inLanguage": "fa-IR",
          "datePublished": time.strftime("%Y-%m-%d", time.gmtime(a["created"])), "dateModified": time.strftime("%Y-%m-%d", time.gmtime(max(a["updated"], _updated(st) or 0))),
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


def _fill(app, text: str) -> str:
    """آستانه‌های واقعی پنل به جای نشانه‌های متن (تا متن با تنظیمات مدیر یکی بماند)."""
    th = {**DEFAULT_THRESHOLDS, **(app.store.get_setting("thresholds") or {})}
    for k, v in (("OPP", th["opp"]), ("GOLD", th["gold"]), ("SUS", th["sus"])):
        text = text.replace(f"__{k}__", fa(round(float(v) * 100)) + "٪")
    if "__" in text:  # عددهای زندهٔ سایت برای متن مقاله‌ها و راهنماها
        stt = app.store.stats()
        for k, v in (("LISTINGS", fa(stt.get("total") or 0)), ("OPPS", fa(stt.get("deals") or 0)),
                     ("CITIES", fa(len(stt.get("cities") or {}))), ("UPDATED", jdate(_updated(app.store)))):
            text = text.replace(f"__{k}__", v)
    return text


def page(app, base, path):
    p = _page(app, base, path)
    if p:
        p["title"], p["desc"], p["body"] = _fill(app, p["title"]), _fill(app, p["desc"]), _fill(app, p["body"])
        p["ld"] = json.loads(_fill(app, json.dumps(p["ld"], ensure_ascii=False)))
    return p


def _page(app, base, path):
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
    if path == "/method":
        return method_page(app, base)
    if path == "/about":
        return about_page(app, base)
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
            f'  <meta property="og:site_name" content="فرصت ملک" />\n'
            f'  <meta property="og:title" content="{ESC(p["title"])}" />\n  <meta property="og:description" content="{ESC(p["desc"])}" />\n'
            f'  <meta property="og:url" content="{ESC(p["canonical"])}" />\n'
            f'  <meta property="og:image" content="{ESC(p.get("image") or p["canonical"].split("/", 3)[0] + "//" + p["canonical"].split("/", 3)[2] + "/assets/img/og.png")}" />\n'
            + '  <meta name="twitter:card" content="summary_large_image" />\n'
            + ('  <meta name="robots" content="noindex, follow" />\n' if p.get("noindex") else '  <meta name="robots" content="index, follow, max-image-preview:large" />\n')
            + "".join(f'  <script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n' for x in p["ld"])
            + (f'  <script>if(!location.hash)history.replaceState(null,"","/{p["hash"]}");</script>\n' if p.get("hash") else "")
            # کاربر واقعی: نشانی سئو به مسیر همان صفحه در برنامه برده می‌شود (پیش از بارگذاری بقیهٔ اسکریپت‌ها)
            )
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


AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai", "PerplexityBot", "Perplexity-User",
           "Google-Extended", "GoogleOther", "Applebot", "Applebot-Extended", "Bingbot", "Googlebot", "YandexBot", "DuckAssistBot", "MistralAI-User", "cohere-ai",
           "CCBot", "Amazonbot", "meta-externalagent", "DeepSeekBot", "xAI-Bot", "GrokBot", "YouBot", "PhindBot"]
HEAVY_BOTS = ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "BLEXBot", "PetalBot", "DataForSeoBot", "Bytespider", "serpstatbot"]


def robots(base) -> str:
    rules = "Allow: /\nDisallow: /api/\nDisallow: /admin.html\nDisallow: /img\nDisallow: /pay/\n"
    out = "# موتورهای جست‌وجو و دستیارهای هوش مصنوعی خوش‌آمدند؛ خلاصهٔ سایت برای مدل‌های زبانی: " + base + "/llms.txt\n\n"
    out += "User-agent: *\n" + rules + "\n"
    out += "".join(f"User-agent: {b}\n" for b in AI_BOTS) + rules + "\n"
    # خزنده‌های تحلیل بک‌لینک بار زیادی می‌سازند و سودی برای کاربر ندارند
    out += "".join(f"User-agent: {b}\n" for b in HEAVY_BOTS) + "Disallow: /\n\n"
    return out + f"Sitemap: {base}/sitemap.xml\n"


def llms(app, base, full=False) -> str:
    """خلاصهٔ مارک‌داون سایت برای مدل‌های زبانی (llms.txt)؛ نسخهٔ کامل با روش و عددهای واقعی هر شهر."""
    st, site = app.store, _site(app)
    counts = _counts(st)
    act = app.regions()["active"]
    cities = [c for c in catalog.CITIES if c["province"] in act and counts.get(c["key"], 0) >= 20]
    cities.sort(key=lambda c: -counts[c["key"]])
    L = [f"# {site['name']}", "",
         f"> {site['name']} ابزار مستقل تحلیل قیمت آگهی‌های ملک در ایران است. هر آگهی فقط با آگهی‌های مشابه همان محله سنجیده می‌شود "
         "(تعدیل برای متراژ، سن بنا، طبقه و امکانات)، فرصت‌های دست‌کم __OPP__ فاصله با برآورد بازار رتبه‌بندی و قیمت‌های مشکوک جدا می‌شوند. "
         "همهٔ عددها از قیمت پیشنهادی آگهی‌هاست، نه قیمت معامله‌شده.", "",
         f"آخرین به‌روزرسانی داده: {jdate(_updated(st))} ({time.strftime('%Y-%m-%d', time.gmtime(_updated(st)))})", "",
         "## صفحه‌های اصلی", "",
         f"- [روش ارزش‌گذاری]({base}/method): قیمت محله، فرصت، ضد قیمت‌سازی و تبانی، پیش‌فروش، سنجش دقت",
         f"- [دربارهٔ {site['name']}]({base}/about): استقلال، منبع عددها، حریم خصوصی",
         f"- [چک‌لیست خرید ملک]({base}/rahnama/kharid-melk)", f"- [چک‌لیست رهن و اجاره]({base}/rahnama/ejare)",
         f"- [راهنمای خرید پیش‌فروش]({base}/rahnama/pish-forosh)", f"- [پرسش‌های پرتکرار]({base}/faq)",
         f"- [چطور ملک ارزان پیدا کنیم؟]({base}/rahnama/melk-arzan): پیدا کردن آپارتمان، ویلا و زمین زیر قیمت بازار با مقایسه با محلهٔ خود ملک",
         f"- [قیمت هر متر محله و قیمت مناسب ملک را چطور به دست بیاوریم؟]({base}/rahnama/gheymat-mahalle): روش گام‌به‌گام و پرسش‌های پرتکرار",
         f"- [قیمت هر متر محله‌ها روی نقشه]({base}/sky.html): میانهٔ قیمت هر متر محله‌های هر شهر", "",
         "## پاسخ کوتاه به پرسش‌های پرتکرار", ""] + [f"**{q}**\n{a.replace('{name}', site['name'])}\n" for q, a in PRICE_QA] + ["",
         "## برای چه پرسش‌هایی مفید است", "",
         "- چطور ملک ارزان یا زیر قیمت بازار پیدا کنم؟ کدام آگهی‌ها از ملک‌های مشابه همان محله ارزان‌ترند؟",
         "- قیمت منصفانهٔ یک آگهی ملک چقدر است و آیا ارزش خرید دارد؟",
         "- قیمت هر متر آپارتمان در محله‌های یک شهر چقدر است و ارزان‌ترین و گران‌ترین محله‌ها کدام‌اند؟",
         "- با بودجهٔ مشخص کجا می‌شود آپارتمان خرید؟", "",
         "## بازار ملک شهرها", ""]
    for c in cities[:60]:
        L.append(f"- [ملک {c['name']}]({base}{city_path(c['key'])}): قیمت هر متر محله‌ها، فرصت‌های شناسایی‌شده، رهن و اجاره")
    arts = articles_list(st, 30)
    if arts:
        L += ["", "## مقاله‌ها", ""] + [f"- [{a['title']}]({base}/maghale/{urllib.parse.quote(a['slug'])})" for a in arts]
    if not full:
        L += ["", "## بیشتر", "", f"- [نسخهٔ کامل با روش و آمار هر شهر]({base}/llms-full.txt)"]
        return _fill(app, "\n".join(L) + "\n")
    txt = re.sub(r"<[^>]+>", "", METHOD_HTML.replace("</h2>", "\n").replace("<h2>", "\n### ").replace("</p>", "\n").replace("<h1>", "## ").replace("</h1>", "\n"))
    L += ["", html.unescape(txt).strip(), "", "## آمار شهرها (آپارتمان، فروش)", "",
          "| شهر | آگهی معتبر | میانهٔ قیمت هر متر (تومان) | فرصت | میانهٔ ودیعه (تومان) |", "|---|---|---|---|---|"]
    for c in cities[:60]:
        o = market_report(st, c["key"], "sale", "apartment")["overview"]
        ro = market_report(st, c["key"], "rent", "apartment")["overview"]
        if not o.get("valid"):
            continue
        L.append(f"| [{c['name']}]({base}{city_path(c['key'])}) | {o['valid']} | {round(o['median_ppm']) if o.get('median_ppm') else '—'} | "
                 f"{o.get('opportunities') or 0} | {round(ro['median_deposit']) if ro.get('median_deposit') is not None else '—'} |")
    L += ["", "عددها میانهٔ قیمت پیشنهادی آگهی‌های معتبرند و با هر به‌روزرسانی تغییر می‌کنند. هنگام نقل، نام سایت و تاریخ به‌روزرسانی را ذکر کنید."]
    return _fill(app, "\n".join(L) + "\n")


def sitemap(app, base) -> str:
    st = app.store
    act = app.regions()["active"]
    urls = [(base + "/", None, "daily", "1.0"), (base + "/method", None, "monthly", "0.4"), (base + "/faq", None, "monthly", "0.4"),
            (base + "/rahnama/kharid-melk", None, "monthly", "0.5"), (base + "/rahnama/ejare", None, "monthly", "0.5"),
            (base + "/rahnama/pish-forosh", None, "monthly", "0.5"), (base + "/rahnama/melk-arzan", None, "monthly", "0.6"), (base + "/rahnama/gheymat-mahalle", None, "monthly", "0.7"),
            (base + "/sky.html", None, "daily", "0.6"), (base + "/about", None, "yearly", "0.3")]
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
