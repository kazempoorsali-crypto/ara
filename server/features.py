"""استخراج ویژگی‌های ساخت‌یافته ملک از جدول مشخصات، عنوان و متن آگهی دیوار.

هر ویژگی فقط وقتی مقدار می‌گیرد که در آگهی آمده باشد؛ نبودِ اطلاعات با None نشان داده می‌شود
تا در مدل قیمت با «ناموجود» اشتباه نشود.
"""
from __future__ import annotations

import re
import time

from catalog import norm, number

WORD_NUM = {"یک": 1, "دو": 2, "سه": 3, "چهار": 4, "پنج": 5, "شش": 6}


def jalali_year_now() -> int:
    t = time.gmtime()
    return t.tm_year - 621 - (0 if (t.tm_mon, t.tm_mday) >= (3, 21) else 1)


def kind_group(kind: str | None) -> str:
    return {"apartment": "apartment", "suite": "apartment", "villa": "villa", "land": "land",
            "garden": "land", "shop": "commercial", "office": "commercial"}.get(kind or "", "apartment")


def _attr(attrs: dict, *keys):
    for k, v in attrs.items():
        nk = norm(k)
        if any(norm(key) == nk or norm(key) in nk for key in keys):
            return norm(v) if v is not None else None
    return None


def _yes(attrs: dict, blob: str, attr_keys, rx) -> int | None:
    """۱ اگر امکان وجود دارد، ۰ اگر صراحتاً ندارد، None اگر ذکر نشده."""
    v = _attr(attrs, *attr_keys)
    if v is not None:
        if re.search(r"ندارد|نداره|خیر|^0$", v):
            return 0
        return 1
    m = re.search(rx, blob)
    if not m:
        return None
    tail = blob[m.end():m.end() + 10]
    return 0 if re.match(r"\s*:?\s*(ندارد|نداره|نیست|خیر)", tail) else 1


def extract(item: dict) -> dict:
    attrs = item.get("attributes") or {}
    title = norm(item.get("title"))
    desc = norm(item.get("description"))
    blob = f"{title} {desc} " + " ".join(f"{norm(k)}: {norm(v)}" for k, v in attrs.items())
    f: dict = {}

    # سن بنا
    year = item.get("year")
    if not year:
        y = _attr(attrs, "ساخت", "سال ساخت")
        if y and "قبل" in y:
            year = 1365
    if year:
        f["age"] = max(0, jalali_year_now() - int(year))
    elif re.search(r"نوساز|کلید ?نخورده|صفر", blob):
        f["age"] = 0

    # طبقه
    fl = _attr(attrs, "طبقه")
    if fl:
        if "همکف" in fl:
            f["floor"] = 0
        nums = [int(x) for x in re.findall(r"\d+", fl)]
        if nums:
            f["floor"] = nums[0]
            if len(nums) > 1:
                f["floors_total"] = nums[1]
        elif "زیرهمکف" in fl.replace(" ", "") or "منفی" in fl:
            f["floor"] = -1
    elif item.get("floor") is not None:
        f["floor"] = item["floor"]
    m = re.search(r"(\d+)\s*واحد(?:ی)?\s*(?:در|هر)?\s*طبقه", blob) or re.search(r"طبقه[ای]*\s*(\d+)\s*واحد", blob)
    if m:
        f["units_per_floor"] = int(m.group(1))
    m = re.search(r"(\d+)\s*طبقه\s*(?:ای)?\s*(?:است|ساختمان)?", title)
    if m and "floors_total" not in f:
        f["floors_total"] = int(m.group(1))

    f["rooms"] = item.get("rooms")
    f["area"] = item.get("area")
    la = _attr(attrs, "متراژ زمین", "مساحت زمین")
    if la:
        f["land_area"] = number(la)
    else:
        m = re.search(r"(\d{3,5})\s*متر\s*زمین|زمین\s*(\d{3,5})\s*متر", blob)
        if m:
            f["land_area"] = int(m.group(1) or m.group(2))

    f["elevator"] = _yes(attrs, blob, ["آسانسور"], r"آسانسور|اسانسور")
    f["parking"] = _yes(attrs, blob, ["پارکینگ"], r"پارکینگ")
    if f["parking"]:
        m = re.search(r"(\d|دو|سه)\s*(?:عدد|تا)?\s*پارکینگ|پارکینگ\s*(\d|دو|سه)\s*(?:عدد|تا)", blob)
        if m:
            v = m.group(1) or m.group(2)
            f["parking"] = WORD_NUM.get(v) or int(v)
    f["warehouse"] = _yes(attrs, blob, ["انباری"], r"انباری")
    f["balcony"] = _yes(attrs, blob, ["بالکن"], r"بالکن|تراس")

    deed = _attr(attrs, "سند")
    if deed or re.search(r"سند", blob):
        src = deed or blob
        f["deed_single"] = 1 if re.search(r"تک ?برگ|شش ?دانگ|منگوله", src) else 0 if re.search(r"قولنامه|اوقاف|بنچاق|مشاع|معارض", src) else None
    direction = _attr(attrs, "جهت ساختمان", "جهت")
    if direction:
        f["north"] = 1 if "شمال" in direction else 0
    f["renovated"] = 1 if re.search(r"بازسازی|بازسازی ?شده|نوسازی شده", blob) else None
    f["lobby"] = 1 if re.search(r"لابی|سرایدار|نگهبان|سرایداری", blob) else None
    f["complex"] = 1 if re.search(r"استخر|سونا|جکوزی|باشگاه|سالن ورزش|روف ?گاردن", blob) else None
    f["furnished"] = 1 if re.search(r"مبله|فول ?مبله", blob) else None
    f["seaview"] = 1 if re.search(r"دید دریا|ویو دریا|ویو ابدی دریا|نمای دریا|رو به دریا|ساحل اختصاصی", blob) else None
    m = re.search(r"(\d{2,5})\s*متر(?:ی)?\s*(?:تا|با)?\s*(?:دریا|ساحل)|(?:فاصله|تا)\s*(?:دریا|ساحل)\s*(\d{2,5})\s*متر", blob)
    if m:
        f["sea_dist"] = int(m.group(1) or m.group(2))
    elif re.search(r"ساحلی|کنار دریا|لب دریا", blob):
        f["sea_dist"] = 300
    f["pool"] = 1 if re.search(r"استخر", blob) else None
    f["gated"] = 1 if re.search(r"شهرک|نگهبانی ?۲۴|درب ?ریموت ?شهرک", blob) else None
    f["duplex"] = 1 if re.search(r"دوبلکس|تریبلکس", blob) else None
    f["forest"] = 1 if re.search(r"جنگل|ویو جنگل", blob) else None
    f["residential_use"] = 1 if re.search(r"کاربری ?مسکونی|مسکونی", blob) else 0 if re.search(r"کشاورزی|زراعی|باغی", blob) else None
    m = re.search(r"(\d{1,3})\s*متر\s*بر|بر\s*(\d{1,3})\s*متر", blob)
    if m:
        f["frontage"] = int(m.group(1) or m.group(2))
    f["in_city"] = 1 if re.search(r"داخل ?بافت|بافت ?مسکونی|داخل ?محدوده", blob) else 0 if re.search(r"خارج ?از ?بافت|خارج ?از ?محدوده", blob) else None
    f["agency"] = 1 if (item.get("seller_type") or "").lower() in ("business", "real-estate-business", "shop") or re.search(r"مشاور ?املاک|املاک\s", title) else None
    f["photos"] = len(item.get("images") or ([item["image"]] if item.get("image") else []))
    f["desc_len"] = len(desc)

    # بازارهای جدا که نباید در میانگین قیمت فروش قطعی بیایند
    flags = []
    if re.search(r"پیش ?فروش", blob):
        flags.append("presale")
    if re.search(r"مشارکت(?: در ساخت)?", blob):
        flags.append("partnership")
    if re.search(r"معاوضه|تهاتر", title):
        flags.append("exchange")
    if re.search(r"(\d|یک|دو|سه|چهار|پنج)\s*دانگ(?!\s*سند)", blob) and not re.search(r"شش ?دانگ|۶ ?دانگ|6 ?دانگ", blob):
        flags.append("partial")
    if re.search(r"هم ?خونه|هم ?خانه|اتاق اجاره|خوابگاه", blob):
        flags.append("shared")
    f["market_flags"] = flags
    f.update(text_signals(title, desc, attrs))
    return {k: v for k, v in f.items() if v not in (None, [])}


# نشانه‌های متنی: «شاید دلیل ارزانی» (ctx)، «پیش از خرید استعلام کن» (caution) و نشانه‌های مشکوک (sus)
CTX_RULES = [
    ("urgent", r"فوری|عجله|نقد ?لازم|به ?علت ?مهاجرت|زیر ?قیمت ?(?:فوری|واقعی)|نیاز ?به ?(?:پول|نقدینگی)", "فروشنده عجله دارد"),
    ("swap", r"معاوضه|تهاتر|قابل ?معاوضه", "معاوضه هم قبول است"),
    ("owner", r"از ?مالک|بدون ?واسطه|مالک ?هستم|خود ?مالک|بدون ?کمیسیون", "آگهی خود مالک"),
    ("furn", r"با ?وسایل|با ?لوازم|با ?اثاث", "با وسایل"),
    ("builder", r"قیمت ?سازنده|از ?سازنده|مستقیم ?از ?سازنده", "قیمت سازنده ذکر شده"),
    ("alley", r"کوچه ?(?:باریک|تنگ)|بافت ?فرسوده|ماشین ?رو ?نیست|ماشین ?نمی ?(?:رود|ره)", "کوچهٔ باریک یا بافت فرسوده"),
    ("yardunit", r"(?:طبقه ?(?:بالا|پایین|دوم|اول)|واحد ?جدا).{0,25}(?:حیاط|ویلایی)|(?:حیاط ?دار|ویلایی).{0,25}(?:طبقه ?(?:بالا|پایین)|واحد ?جدا)", "واحد جدا در خانهٔ حیاط‌دار"),
    ("shop", r"مغازه|تجاری ?(?:دارد|زیرش)|بر ?خیابان ?اصلی ?تجاری", "اشاره به مغازه"),
]
CAUTION_RULES = [
    ("deed_weak", r"قول ?نامه ?ای|قولنامه|وکالتی|وکالت ?نامه", "سند قول‌نامه‌ای یا وکالتی"),
    ("waqf", r"وقفی|اوقافی|اوقاف|آستان ?قدس|آستانی|زمین ?شهری ?(?:اجاره|اجاره ?ای)", "زمین وقفی یا آستانی"),
    ("deed_missing", r"(?:بدون|فاقد|بی) ?(?:سند|پایان ?کار)|سند ?(?:ندارد|نداره)|پایان ?کار ?(?:ندارد|نداره|در ?حال)|در ?حال ?(?:اخذ|گرفتن) ?سند|سند ?در ?(?:راه|حال)", "سند یا پایان‌کار ناقص"),
    ("tenant", r"مست[اأ]جر ?(?:دارد|داره|نشین)|با ?مست[اأ]جر|مست[اأ]جر ?تا ?(?:پایان|آخر)", "مستأجر دارد"),
    ("loan", r"وام ?(?:دارد|داره|بانکی ?دارد)|(?:رهن|وام).{0,15}(?:کسر|کم) ?(?:می ?شود|میشه)|در ?رهن ?بانک|قابل ?انتقال ?وام", "رهن یا وام از قیمت کم می‌شود"),
]
SUS_RULES = [
    ("fake_photos", r"عکس.{0,20}(?:تزئینی|نمونه|مربوط ?به ?این ?(?:ملک|واحد) ?نیست|واقعی ?نیست|از ?اینترنت)|تصاویر.{0,15}(?:تزئینی|نمونه)", "عکس‌ها مال این ملک نیست"),
    ("scam", r"(?:بیعانه|پیش ?پرداخت|کارت ?به ?کارت|واریز).{0,30}(?:قبل ?از|پیش ?از|بدون) ?بازدید|ارسال ?مدارک ?(?:در|به) ?(?:تلگرام|واتساپ)|فقط ?(?:تلگرام|واتساپ)", "متن آگهی مشکوک است"),
]


def _multi_price(text: str) -> bool:
    """چند قیمت کل متفاوت در متن (مثلاً «۳ میلیارد ... ۴ میلیارد»)."""
    vals = set()
    for m in re.finditer(r"(\d+(?:[.,/]\d+)?)\s*(میلیارد|میلیون)", text):
        try:
            v = float(m.group(1).replace(",", ".").replace("/", "."))
        except ValueError:
            continue
        v *= 1e9 if m.group(2) == "میلیارد" else 1e6
        if v >= 3e8:
            vals.add(round(v, -7))
    return len(vals) >= 2 and max(vals) / min(vals) > 1.15


def text_signals(title: str, desc: str, attrs: dict) -> dict:
    blob = f"{title} {desc}"
    ctx = [k for k, rx, _ in CTX_RULES if re.search(rx, blob)]
    caution = [k for k, rx, _ in CAUTION_RULES if re.search(rx, blob)]
    sus = [k for k, rx, _ in SUS_RULES if re.search(rx, blob)]
    deed = _attr(attrs, "سند")
    if not deed and not re.search(r"سند", blob):
        caution.append("deed_unknown")
    if _multi_price(desc):
        sus.append("multi_price")
    return {"ctx": ctx, "caution": caution, "sus": sus}


SIGNAL_TEXT = {**{k: t for k, _, t in CTX_RULES}, **{k: t for k, _, t in CAUTION_RULES}, **{k: t for k, _, t in SUS_RULES},
               "deed_unknown": "نوع سند نامشخص", "multi_price": "چند قیمت در آگهی"}


# برچسب فارسی ویژگی‌ها برای توضیح امتیاز
LABELS = {
    "age": "سن بنا", "age2": "سن بنا", "floor": "طبقه", "ground": "همکف بودن", "top": "طبقه آخر",
    "log_area": "متراژ", "rooms_density": "تعداد اتاق نسبت به متراژ", "elevator": "آسانسور",
    "parking": "پارکینگ", "warehouse": "انباری", "balcony": "بالکن", "deed_single": "سند تک‌برگ",
    "renovated": "بازسازی‌شده", "lobby": "لابی و سرایدار", "complex": "امکانات مجتمع", "north": "جهت شمالی",
    "seaview": "دید دریا", "sea_close": "نزدیکی به دریا", "pool": "استخر", "gated": "شهرکی", "duplex": "دوبلکس",
    "forest": "دید جنگل", "furnished": "مبله", "log_land": "متراژ زمین", "residential_use": "کاربری مسکونی",
    "frontage": "عرض بر", "in_city": "داخل بافت", "agency": "آگهی مشاور املاک", "units": "واحد در هر طبقه",
}
