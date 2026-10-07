"""آزمون موتور ارزش‌گذاری با داده مصنوعی دارای اثرهای معلوم. اجرا: python tests/test_valuation.py"""
import math
import time
import os
import random
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import features  # noqa: E402
import valuation  # noqa: E402
from store import Store  # noqa: E402


def check(cond, msg):
    print(("✔ " if cond else "✘ ") + msg)
    if not cond:
        raise SystemExit(1)


# ---- استخراج ویژگی
f = features.extract({"title": "آپارتمان ۱۲۰ متری نوساز گلسار", "description": "دارای آسانسور، دو پارکینگ، انباری ندارد. سند تک برگ. لابی و سرایدار",
                      "attributes": {"طبقه": "۳ از ۵", "جهت ساختمان": "شمالی"}, "area": 120, "rooms": 2, "year": 1402})
check(f["floor"] == 3 and f["floors_total"] == 5, "طبقه و تعداد طبقات")
check(f["elevator"] == 1 and f["parking"] == 2 and f["warehouse"] == 0, "آسانسور، دو پارکینگ، بدون انباری")
check(f["deed_single"] == 1 and f["lobby"] == 1 and f["north"] == 1, "سند، لابی، جهت شمالی")
check("presale" in features.extract({"title": "پیش فروش آپارتمان"})["market_flags"], "تشخیص پیش‌فروش")
check("partial" in features.extract({"title": "فروش ۳ دانگ ویلا"})["market_flags"], "تشخیص فروش دانگی")

# ---- داده مصنوعی: میانه محله‌ها متفاوت، سن ۱٫۲٪ کاهش در سال، آسانسور ۸٪، پارکینگ ۶٪
rnd = random.Random(7)
store = Store(Path(tempfile.mkdtemp()) / "t.db")
districts = {"گلسار": 95e6, "منظریه": 70e6, "معلم": 60e6, "بلوار گیلان": 50e6}
now_year = features.jalali_year_now()
truth = {}
TREND = 0.03  # رشد ماهانهٔ قیمت در دادهٔ مصنوعی؛ آگهی قدیمی‌تر با قیمت روز درج خودش آمده است
NOW = time.time()
for i in range(420):
    dist = rnd.choice(list(districts))
    age_days = rnd.uniform(0, 80)
    area = rnd.randint(60, 180)
    age = rnd.randint(0, 25)
    elev, park = rnd.random() < 0.6, rnd.random() < 0.7
    ppm = districts[dist] * math.exp(-0.012 * age + 0.08 * elev + 0.06 * park) * math.exp(rnd.gauss(0, 0.06))
    price = round(ppm * math.exp(-TREND * age_days / 30) * area / 1e6) * 1e6
    desc = ("آسانسور دارد. " if elev else "آسانسور ندارد. ") + ("پارکینگ دارد." if park else "پارکینگ ندارد.")
    item = {"id": f"t{i}", "source": "test", "vertical": "estate", "kind": "apartment", "deal": "sale", "title": f"آپارتمان {area} متری",
            "description": desc, "city_key": "rasht", "city_name": "رشت", "province": "gilan", "district": dist, "price": price,
            "area": area, "rooms": 2, "year": now_year - age, "images": ["a", "b", "c"], "detail_at": 1,
            "posted_at": int(NOW - age_days * 86400)}
    item["feat"] = features.extract(item)
    store.upsert(item)
    truth[item["id"]] = ppm


def add(i, **kw):
    base = {"id": i, "source": "test", "vertical": "estate", "kind": "apartment", "deal": "sale", "city_key": "rasht", "city_name": "رشت",
            "province": "gilan", "district": "معلم", "area": 100, "rooms": 2, "year": now_year - 5, "description": "آسانسور دارد. پارکینگ دارد.", "detail_at": 1}
    base.update(kw)
    base["feat"] = features.extract(base)
    store.upsert(base)


fair_ref = 60e6 * math.exp(-0.012 * 5 + 0.08 + 0.06) * 100
add("zero", title="آپارتمان ۱۰۰ متری", price=round(fair_ref * 10 / 1e6) * 1e6)
add("low", title="آپارتمان ۱۰۰ متری", price=round(fair_ref * 0.12 / 1e6) * 1e6)
add("presale", title="پیش فروش آپارتمان ۱۰۰ متری", price=round(fair_ref / 1e6) * 1e6)
add("token", title="آپارتمان ۱۰۰ متری", price=1000)
add("deal", title="آپارتمان ۱۰۰ متری فوری", price=round(fair_ref * 0.78 / 1e6) * 1e6, images=["a", "b", "c", "d"], first_seen=10**10)
add("pricey", title="آپارتمان ۱۰۰ متری", price=round(fair_ref * 1.25 / 1e6) * 1e6)
# هم‌قیمت میانهٔ شهر، ولی در گران‌ترین محله: باید فرصت باشد (مقایسه فقط با محله)
golsar_ref = 95e6 * math.exp(-0.012 * 5 + 0.08 + 0.06) * 100
add("golsar", title="آپارتمان ۱۰۰ متری", district="گلسار", price=round(golsar_ref * 0.70 / 1e6) * 1e6)
# محلهٔ کم‌آگهی: با میانهٔ شهر سنجیده نمی‌شود
add("old", title="آپارتمان ۱۰۰ متری", price=round(fair_ref * 0.7 / 1e6) * 1e6, posted_at=int(NOW - 120 * 86400))
add("rare1", title="آپارتمان ۱۰۰ متری", district="محله‌ای کم‌آگهی", price=round(fair_ref * 0.6 / 1e6) * 1e6)
add("rare2", title="آپارتمان ۱۰۰ متری", district="محله‌ای کم‌آگهی", price=round(fair_ref / 1e6) * 1e6)

info = valuation.recompute(store)
print("   ", {k: info[k] for k in ("listings", "excluded", "ranked", "seconds")})
get = store.get
check("zero_typo" in get("zero")["flags"], "قیمت ده‌برابر: «اشتباه صفر»")
check(any(f in get("low")["flags"] for f in ("outlier_low", "zero_typo_low")) and get("low")["label"] == "sus", "قیمت بسیار پایین: پرت و «مشکوک»")
check("presale" in get("presale")["flags"], "پیش‌فروش کنار گذاشته شد")
check("placeholder" in get("token")["flags"], "قیمت نمادین کنار گذاشته شد")
d = get("deal")
check(d["excluded"] == 0 and 0.15 < d["discount"] < 0.30, f"آگهی ارزان: {d['discount']:.0%} زیر قیمت منصفانه (واقعی ۲۲٪)")
check(d["label"] in ("gold", "good"), f"برچسب آگهی ارزان: {d['label']}")
check(d["explain"]["rank"] == 1 and d["score"] >= 65, f"امتیاز فرصت در محله: {d['score']} (رتبه {d['explain']['rank']} از {d['explain']['rank_n']})")
check("فروشنده عجله دارد" in d["explain"]["ctx"], "نشانهٔ متنی «فروشنده عجله دارد»")
check(get("presale")["label"] == "excluded", "پیش‌فروش: برچسب «کنار رفت»")
p = get("pricey")
check(p["label"] == "high" and p["score"] <= 64, f"برچسب آگهی گران: {p['label']}، امتیاز {p['score']}")
check(-0.32 < p["discount"] < -0.18, f"آگهی گران: {-p['discount']:.0%} بالای قیمت منصفانه (واقعی ۲۵٪)")
g = get("golsar")
check(g["label"] == "gold" and 0.25 < g["discount"] < 0.35, f"قیمت نزدیک میانهٔ شهر در گلسار: {g['label']}، {g['discount']:.0%} زیر قیمت محله")
tr = next(t for t in info["trends"] if t["scope"] == "gilan" and t["deal"] == "sale")
check(abs(tr["monthly"] - TREND) < 0.012, f"روند ماهانهٔ قیمت از داده: {tr['monthly']:.1%} (واقعی {TREND:.0%})")
check("stale" in get("old")["flags"], "آگهی ۱۲۰ روز پیش: کنار رفت (قدیمی)")
r1 = get("rare1")
check(r1["label"] == "pending" and r1["score"] is None, f"محلهٔ کم‌آگهی بدون سنجش: {r1['label']}")
rank = [r["id"] for r in store.q("SELECT id FROM listings WHERE score IS NOT NULL ORDER BY score DESC LIMIT 15")]
check("deal" in rank, f"آگهی ارزان در ۱۵ رتبه اول ({rank.index('deal') + 1 if 'deal' in rank else '-'})")
m = next(m for m in info["models"] if m["scope"] == "rasht")
eff = m["effects"]
check(eff.get("سن بنا", 0) < 0 and eff.get("آسانسور", 0) > 0 and eff.get("پارکینگ", 0) > 0, f"جهت اثرها درست است (R²={m['r2']})")
errs = [abs(get(i)["fair_ppm"] - truth[i]) / truth[i] for i in truth if get(i)["fair_ppm"]]
med_err = sorted(errs)[len(errs) // 2]
check(med_err < 0.08, f"میانه خطای قیمت منصفانه هر متر: {med_err:.1%} (نویز داده ۶٪)")
check({"گلسار", "منظریه", "معلم", "بلوار گیلان"} <= {r["district"] for r in store.market_rows("rasht")}, "جدول بازار ۴ محله اصلی رشت")
acc = next((a for a in info["accuracy"] if a["scope"] == "gilan" and a["deal"] == "sale"), None)
check(acc and acc["mdape"] < 0.10 and acc["n"] > 300, f"دقت بیرون از نمونه گزارش شد: میانهٔ خطا {acc and acc['mdape']:.1%}، {acc and acc['within10']:.0%} آگهی‌ها در ±۱۰٪")

# ---- سوگیری ترکیب محله: محله‌ای که بیشتر آگهی‌هایش نوساز است نباید آگهی کهنه با قیمت درست را «فرصت» نشان دهد
st2 = Store(Path(tempfile.mkdtemp()) / "t2.db")
rnd2 = random.Random(11)
def add2(i, dist, age, base_ppm, mult=1.0, area=100):
    ppm = base_ppm * math.exp(-0.02 * age) * mult
    it = {"id": i, "source": "test", "vertical": "estate", "kind": "apartment", "deal": "sale", "title": f"آپارتمان {area} متری",
          "description": "آسانسور دارد. پارکینگ دارد.", "city_key": "rasht", "city_name": "رشت", "province": "gilan", "district": dist,
          "price": round(ppm * area / 1e6) * 1e6, "area": area, "rooms": 2, "year": now_year - age, "detail_at": 1, "posted_at": int(NOW)}
    it["feat"] = features.extract(it)
    st2.upsert(it)
for i in range(24):
    add2(f"n{i}", "نوساز", rnd2.randint(0, 2), 80e6, math.exp(rnd2.gauss(0, 0.04)), rnd2.randint(80, 140))
for i in range(6):
    add2(f"o{i}", "نوساز", rnd2.randint(28, 32), 80e6, math.exp(rnd2.gauss(0, 0.04)), rnd2.randint(80, 140))
for i in range(70):
    add2(f"x{i}", "دیگر", rnd2.randint(0, 30), 60e6, math.exp(rnd2.gauss(0, 0.04)), rnd2.randint(60, 160))
add2("oldfair", "نوساز", 30, 80e6)
valuation.recompute(st2)
of = st2.get("oldfair")
check(of["label"] == "fair" and abs(of["discount"]) < 0.08, f"آگهی کهنه با قیمت درست در محلهٔ نوساز: {of['label']}، فاصله {of['discount']:.0%}")
# ---- ضد قیمت‌سازی: افزایش قیمت پس از درج، قیمت محلهٔ بقیه را بالا نمی‌برد
before = st2.get("x5")["fair_ppm"]
for k in range(8):
    it = dict(st2.get(f"x{k + 10}"))
    it["price"] = round(it["price"] * 1.5 / 1e6) * 1e6
    st2.upsert({k2: it[k2] for k2 in ("id", "source", "vertical", "kind", "deal", "title", "description", "city_key", "city_name",
                                       "province", "district", "price", "area", "rooms", "year", "detail_at", "posted_at", "feat")})
valuation.recompute(st2)
after = st2.get("x5")["fair_ppm"]
check(abs(after / before - 1) < 0.02, f"۸ آگهی قیمتشان را ۵۰٪ بالا بردند؛ قیمت منصفانهٔ همسایه {abs(after / before - 1):.1%} تغییر کرد")
check(st2.get("x10")["explain"]["raised"] and st2.get("x10")["label"] == "high", "آگهی‌ای که قیمتش را بالا برد «بالاتر از قیمت محله» شد")
print("همه آزمون‌های ارزش‌گذاری موفق بود.")
