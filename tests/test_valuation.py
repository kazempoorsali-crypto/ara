"""آزمون موتور ارزش‌گذاری با داده مصنوعی دارای اثرهای معلوم. اجرا: python tests/test_valuation.py"""
import math
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
for i in range(420):
    dist = rnd.choice(list(districts))
    area = rnd.randint(60, 180)
    age = rnd.randint(0, 25)
    elev, park = rnd.random() < 0.6, rnd.random() < 0.7
    ppm = districts[dist] * math.exp(-0.012 * age + 0.08 * elev + 0.06 * park) * math.exp(rnd.gauss(0, 0.06))
    price = round(ppm * area / 1e6) * 1e6
    desc = ("آسانسور دارد. " if elev else "آسانسور ندارد. ") + ("پارکینگ دارد." if park else "پارکینگ ندارد.")
    item = {"id": f"t{i}", "source": "test", "vertical": "estate", "kind": "apartment", "deal": "sale", "title": f"آپارتمان {area} متری",
            "description": desc, "city_key": "rasht", "city_name": "رشت", "province": "gilan", "district": dist, "price": price,
            "area": area, "rooms": 2, "year": now_year - age, "images": ["a", "b", "c"], "detail_at": 1}
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

info = valuation.recompute(store)
print("   ", {k: info[k] for k in ("listings", "excluded", "ranked", "seconds")})
get = store.get
check("zero_typo" in get("zero")["flags"], "قیمت ده‌برابر: «اشتباه صفر»")
check(any(f in get("low")["flags"] for f in ("outlier_low", "zero_typo")), "قیمت بسیار پایین: پرت")
check("presale" in get("presale")["flags"], "پیش‌فروش کنار گذاشته شد")
check("placeholder" in get("token")["flags"], "قیمت نمادین کنار گذاشته شد")
d = get("deal")
check(d["excluded"] == 0 and 0.15 < d["discount"] < 0.30, f"آگهی ارزان: {d['discount']:.0%} زیر قیمت منصفانه (واقعی ۲۲٪)")
p = get("pricey")
check(-0.32 < p["discount"] < -0.18, f"آگهی گران: {-p['discount']:.0%} بالای قیمت منصفانه (واقعی ۲۵٪)")
rank = [r["id"] for r in store.q("SELECT id FROM listings WHERE score IS NOT NULL ORDER BY score DESC LIMIT 15")]
check("deal" in rank, f"آگهی ارزان در ۱۵ رتبه اول ({rank.index('deal') + 1 if 'deal' in rank else '-'})")
m = next(m for m in info["models"] if m["scope"] == "rasht")
eff = m["effects"]
check(eff.get("سن بنا", 0) < 0 and eff.get("آسانسور", 0) > 0 and eff.get("پارکینگ", 0) > 0, f"جهت اثرها درست است (R²={m['r2']})")
errs = [abs(get(i)["fair_ppm"] - truth[i]) / truth[i] for i in truth if get(i)["fair_ppm"]]
med_err = sorted(errs)[len(errs) // 2]
check(med_err < 0.08, f"میانه خطای قیمت منصفانه هر متر: {med_err:.1%} (نویز داده ۶٪)")
check(store.market_rows("rasht") and len(store.market_rows("rasht")) == 4, "جدول بازار ۴ محله رشت")
print("همه آزمون‌های ارزش‌گذاری موفق بود.")
