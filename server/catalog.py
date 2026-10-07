"""مرجع شهرها، دسته‌ها و تبدیل آگهی خام دیوار به ساختار یکسان فرصت‌یاب.

مختصات شهرها تقریبی است. شناسه عددی دیوار فقط برای سه مرکز استان قطعی است؛
بقیه از طریق «کشف شناسه» در پنل مدیریت یا وارد کردن دستی تکمیل می‌شوند.
حالت MCP به شناسه نیاز ندارد و نام فارسی شهر را می‌پذیرد.
"""
from __future__ import annotations

import hashlib
import re

PROVINCES = {
    "gilan": {"name": "گیلان", "center": (37.28, 49.58)},
    "mazandaran": {"name": "مازندران", "center": (36.56, 52.68)},
    "golestan": {"name": "گلستان", "center": (36.95, 54.6)},
}

# key, نام فارسی, استان, عرض, طول, شناسه دیوار (در صورت قطعی بودن)
_CITIES = [
    ("rasht", "رشت", "gilan", 37.2808, 49.5832, 12),
    ("anzali", "بندر انزلی", "gilan", 37.4727, 49.4622, None),
    ("lahijan", "لاهیجان", "gilan", 37.2071, 50.0039, None),
    ("langarud", "لنگرود", "gilan", 37.197, 50.1539, None),
    ("astara", "آستارا", "gilan", 38.4296, 48.8721, None),
    ("talesh", "تالش", "gilan", 37.8016, 48.9047, None),
    ("rudsar", "رودسر", "gilan", 37.1371, 50.2876, None),
    ("chaboksar", "چابکسر", "gilan", 36.9733, 50.5725, None),
    ("kiashahr", "کیاشهر", "gilan", 37.4211, 49.9396, None),
    ("astaneh", "آستانه اشرفیه", "gilan", 37.2597, 49.9441, None),
    ("fuman", "فومن", "gilan", 37.224, 49.3125, None),
    ("masal", "ماسال", "gilan", 37.3621, 49.1312, None),
    ("someh", "صومعه‌سرا", "gilan", 37.3117, 49.3219, None),
    ("rudbar", "رودبار", "gilan", 36.8237, 49.4237, None),
    ("sari", "ساری", "mazandaran", 36.5633, 53.0601, 22),
    ("babol", "بابل", "mazandaran", 36.5513, 52.679, None),
    ("amol", "آمل", "mazandaran", 36.4696, 52.3507, None),
    ("qaemshahr", "قائم‌شهر", "mazandaran", 36.4631, 52.8601, None),
    ("babolsar", "بابلسر", "mazandaran", 36.7025, 52.6576, None),
    ("fereydunkenar", "فریدونکنار", "mazandaran", 36.6836, 52.5225, None),
    ("mahmudabad", "محمودآباد", "mazandaran", 36.632, 52.263, None),
    ("nur", "نور", "mazandaran", 36.573, 52.0139, None),
    ("nowshahr", "نوشهر", "mazandaran", 36.649, 51.496, None),
    ("chalus", "چالوس", "mazandaran", 36.6459, 51.421, None),
    ("kelardasht", "کلاردشت", "mazandaran", 36.4986, 51.1441, None),
    ("abbasabad", "عباس‌آباد", "mazandaran", 36.7213, 51.115, None),
    ("tonekabon", "تنکابن", "mazandaran", 36.8163, 50.874, None),
    ("ramsar", "رامسر", "mazandaran", 36.9031, 50.6583, None),
    ("neka", "نکا", "mazandaran", 36.6508, 53.299, None),
    ("behshahr", "بهشهر", "mazandaran", 36.6923, 53.5526, None),
    ("gorgan", "گرگان", "golestan", 36.8427, 54.4353, 21),
    ("gonbad", "گنبد کاووس", "golestan", 37.25, 55.1672, None),
    ("torkaman", "بندر ترکمن", "golestan", 36.9015, 54.0708, None),
    ("bandargaz", "بندر گز", "golestan", 36.7732, 53.9474, None),
    ("kordkuy", "کردکوی", "golestan", 36.7943, 54.1101, None),
    ("aliabad", "علی‌آباد کتول", "golestan", 36.9083, 54.869, None),
    ("azadshahr", "آزادشهر", "golestan", 37.0866, 55.1738, None),
    ("minudasht", "مینودشت", "golestan", 37.2289, 55.3747, None),
    ("kalaleh", "کلاله", "golestan", 37.3807, 55.4916, None),
]

CITIES = [
    {"key": k, "name": n, "province": p, "lat": la, "lng": ln, "divar_id": d}
    for k, n, p, la, ln, d in _CITIES
]
CITY_BY_KEY = {c["key"]: c for c in CITIES}

# دسته‌های قابل دریافت (فعلاً فقط املاک). «real-estate» در هر دو MCP بررسی‌شده است و همه
# زیردسته‌ها را پوشش می‌دهند؛ نوع ملک و معامله از مسیر دسته هر آگهی استخراج می‌شود.
CATEGORIES = [
    {"slug": "real-estate", "name": "همه املاک", "vertical": "estate", "verified": True, "default": True},
    {"slug": "apartment-sell", "name": "فروش آپارتمان", "vertical": "estate", "verified": True, "default": False},
    {"slug": "apartment-rent", "name": "اجاره آپارتمان", "vertical": "estate", "verified": True, "default": False},
    {"slug": "residential-rent", "name": "اجاره مسکونی", "vertical": "estate", "verified": True, "default": False},
    {"slug": "commercial-sell", "name": "فروش اداری و تجاری", "vertical": "estate", "verified": True, "default": False},
    {"slug": "commercial-rent", "name": "اجاره اداری و تجاری", "vertical": "estate", "verified": True, "default": False},
]
CATEGORY_BY_SLUG = {c["slug"]: c for c in CATEGORIES}

FA_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def norm(text: str | None) -> str:
    if not text:
        return ""
    return (str(text).translate(FA_DIGITS).replace("ي", "ی").replace("ك", "ک")
            .replace("‌", " ").strip())


def squash(text: str | None) -> str:
    return re.sub(r"\s+", "", norm(text))


def find_city(name: str | None) -> dict | None:
    """نام فارسی شهر (از دیوار) را به شهر فرصت‌یاب نگاشت می‌کند؛ طولانی‌ترین تطابق برنده است."""
    s = squash(name)
    if not s:
        return None
    for c in CITIES:
        if squash(c["name"]) == s:
            return c
    best, size = None, 0
    for c in CITIES:  # نام شهر درون متن ورودی (مثلاً «رشت، گلسار»)
        k = squash(c["name"])
        if k in s and len(k) > size:
            best, size = c, len(k)
    if best:
        return best
    for c in CITIES:  # ورودی کوتاه‌شده (مثلاً «انزلی»)
        if len(s) >= 3 and s in squash(c["name"]):
            return c
    return None


def number(text) -> int | None:
    """اولین عدد متن را با درنظرگرفتن میلیون/میلیارد/هزار برمی‌گرداند."""
    if text is None:
        return None
    if isinstance(text, (int, float)):
        return int(text)
    t = norm(text).replace("٬", "").replace(",", "").replace("/", ".")
    m = re.search(r"\d+(?:\.\d+)?", t)
    if not m:
        return None
    v = float(m.group())
    if "میلیارد" in t:
        v *= 1e9
    elif "میلیون" in t:
        v *= 1e6
    elif "هزار" in t and v < 1e5:
        v *= 1e3
    return int(v)


def parse_money_text(text: str | None) -> dict:
    """متن قیمت کارت دیوار: «۱۲٬۵۰۰٬۰۰۰٬۰۰۰ تومان» یا «ودیعه: ... اجاره: ...»."""
    out = {"price": None, "deposit": None, "rent": None, "negotiable": False}
    t = norm(text)
    if not t:
        return out
    if "توافقی" in t or "مجانی" in t:
        out["negotiable"] = True
    dep = re.search(r"ودیعه[:\s]*([^\n]+?)(?:\n|اجاره|$)", t)
    rent = re.search(r"اجاره[:\s]*([^\n]+)", t)
    if dep or rent:
        out["deposit"] = number(dep.group(1)) if dep and "رایگان" not in dep.group(1) else (0 if dep else None)
        out["rent"] = number(rent.group(1)) if rent and "رایگان" not in rent.group(1) else (0 if rent else None)
    else:
        out["price"] = number(t)
    return out


KIND_RULES = [
    ("villa", r"ویلا|خانه ویلایی|ویلایی"),
    ("suite", r"سوئیت|سوییت"),
    ("land", r"زمین|کلنگی"),
    ("garden", r"باغ(?!چه)|باغچه دار"),
    ("shop", r"مغازه|غرفه|تجاری"),
    ("office", r"دفتر|اداری|مطب"),
    ("apartment", r"آپارتمان|اپارتمان|واحد|برج"),
]


def classify_estate(path_text: str, title: str) -> tuple[str, str]:
    """(kind, deal) از مسیر دسته و عنوان."""
    p, t = norm(path_text), norm(title)
    deal = "sale"
    if re.search(r"کوتاه|روزانه|اقامتگاه|temporary|daily", p + " " + t):
        deal = "daily"
    elif re.search(r"اجاره|رهن|rent", p) or re.search(r"\b(اجاره|رهن)\b", t):
        deal = "rent"
    kind = "apartment"
    for k, rx in KIND_RULES:
        if re.search(rx, p):
            kind = k
            break
    else:
        for k, rx in KIND_RULES:
            if re.search(rx, t):
                kind = k
                break
    return kind, deal


AMENITY_RULES = {
    "seaview": r"دید دریا|ویو دریا|نمای دریا|ساحل",
    "forest": r"جنگل",
    "pool": r"استخر",
    "jacuzzi": r"جکوزی",
    "parking": r"پارکینگ",
    "elevator": r"آسانسور|اسانسور",
    "gated": r"شهرک|نگهبان",
    "deed": r"سند",
    "furnished": r"مبله|مبلمان",
    "barbecue": r"باربیکیو|آلاچیق|الاچیق",
    "mountain": r"کوه|ییلاق",
    "warehouse": r"انباری",
    "balcony": r"بالکن",
}


def detect_amenities(*texts) -> list[str]:
    blob = norm(" ".join(t for t in texts if t))
    found = []
    for k, rx in AMENITY_RULES.items():
        m = re.search(rx, blob)
        if not m:
            continue
        # «ندارد» درست بعد از امکان یعنی نبودِ آن
        if re.match(r"\s*:?\s*(ندارد|نداره|خیر)", blob[m.end():m.end() + 8]):
            continue
        found.append(k)
    return found


# سمت خشکی شهرهای ساحلی: نقطهٔ تقریبی فقط به این سمت جابه‌جا می‌شود تا در دریا یا تالاب نیفتد.
# S = جنوب (ساحل شرقی‌غربی)، W = غرب (ساحل شمالی‌جنوبی تالش و آستارا)، T = نوار باریک بین دریا و تالاب.
COAST = {
    "anzali": "T", "astara": "W", "talesh": "W", "kiashahr": "S", "chaboksar": "S", "rudsar": "S", "langarud": "S",
    "babolsar": "S", "fereydunkenar": "S", "mahmudabad": "S", "nur": "S", "nowshahr": "S", "chalus": "S",
    "abbasabad": "S", "tonekabon": "S", "ramsar": "S", "torkaman": "S", "bandargaz": "S", "astaneh": "S",
}


def jitter(key: str, lat: float, lng: float, spread: float = 0.02, city_key: str | None = None) -> tuple[float, float]:
    """موقعیت تقریبیِ پایدار برای آگهی بدون مختصات (بر پایه هش توکن)؛ در شهرهای ساحلی فقط رو به خشکی."""
    h = hashlib.sha1(key.encode()).digest()
    u, v = h[0] / 255 - 0.5, h[1] / 255 - 0.5
    side = COAST.get(city_key or "")
    if side == "T":
        return round(lat, 5), round(lng + v * 0.012, 5)
    if side == "S":
        return round(lat - (0.002 + abs(u) * 0.022), 5), round(lng + v * 1.6 * spread, 5)
    if side == "W":
        return round(lat + u * 1.6 * spread, 5), round(lng - (0.004 + abs(v) * 0.03), 5)
    return round(lat + u * 2 * spread, 5), round(lng + v * 2 * spread * 1.3, 5)


ATTR_KEYS = {
    "area": ["متراژ", "متراژ زمین", "متراژ بنا", "زیربنا"],
    "rooms": ["اتاق", "تعداد اتاق"],
    "year": ["ساخت", "سال ساخت", "مدل (سال تولید)", "سال تولید", "مدل"],
    "mileage": ["کارکرد"],
    "gearbox": ["گیربکس", "نوع گیربکس"],
    "fuel": ["نوع سوخت", "سوخت"],
    "color": ["رنگ"],
    "body": ["وضعیت بدنه", "بدنه"],
    "brand": ["برند و تیپ", "برند و مدل", "برند"],
    "floor": ["طبقه"],
    "deposit": ["ودیعه", "رهن"],
    "rent": ["اجارهٔ ماهانه", "اجاره ماهانه", "اجاره"],
    "price": ["قیمت کل", "قیمت"],
    "ppm": ["قیمت هر متر"],
}


def pick_attr(attrs: dict, field: str):
    for key in ATTR_KEYS[field]:
        for k, v in attrs.items():
            if norm(k) == norm(key):
                return v
    return None


def enrich_from_attributes(item: dict, attrs: dict) -> None:
    """ویژگی‌های جدول آگهی را در ستون‌های ساخت‌یافته می‌ریزد."""
    for f in ("area", "rooms", "mileage", "floor"):
        v = pick_attr(attrs, f)
        if v is not None:
            n = number(v)
            if f == "rooms" and n is None and "بدون" in norm(v):
                n = 0
            if n is not None:
                item[f] = n
    y = pick_attr(attrs, "year")
    if y is not None:
        n = number(y)
        if n and n < 100:  # «۹۸» یعنی ۱۳۹۸
            n += 1300
        if n and n < 1300:  # «قبل از ۱۳۷۰» و ...
            n = None
        if n:
            item["year"] = n
    for f in ("gearbox", "fuel", "color", "body", "brand"):
        v = pick_attr(attrs, f)
        if v:
            item[f] = str(v).strip()
    for f in ("deposit", "rent", "price"):
        v = pick_attr(attrs, f)
        if v is not None and not item.get(f):
            n = number(v)
            if n is not None:
                item[f] = n


WORD_N = {"یک": 1, "دو": 2, "سه": 3, "چهار": 4, "پنج": 5, "شش": 6, "هفت": 7, "هشت": 8, "نه": 9, "ده": 10, "یازده": 11}


def parse_posted(text, now: float | None = None) -> int | None:
    """زمان تقریبی درج آگهی از متن نسبی («۳ هفته پیش»، «دیروز») یا تاریخ ISO/عددی."""
    import time as _t
    from datetime import datetime
    now = now or _t.time()
    if text is None or text == "":
        return None
    if isinstance(text, (int, float)):
        v = float(text)
        v = v / 1000 if v > 1e12 else v
        return int(v) if 1e9 < v <= now + 86400 else None
    t = norm(str(text))
    m = re.match(r"^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?", t)
    if m:
        try:
            dt = datetime.fromisoformat(m.group(1) + ("T" + m.group(2) if m.group(2) else ""))
            return int(dt.timestamp())
        except ValueError:
            pass
    if re.fullmatch(r"\d{10,13}", t):
        return parse_posted(int(t), now)
    if re.search(r"لحظاتی|دقایقی|همین الان|اکنون|ثانیه", t):
        return int(now)
    if re.search(r"پریروز", t):
        return int(now - 2 * 86400)
    if re.search(r"دیروز", t):
        return int(now - 86400)
    m = re.search(r"(\d+|" + "|".join(WORD_N) + r")?\s*(دقیقه|ساعت|روز|هفته|ماه|سال)", t)
    if not m:
        return None
    n = m.group(1)
    n = int(n) if n and n.isdigit() else WORD_N.get(n or "", 1)
    unit = {"دقیقه": 60, "ساعت": 3600, "روز": 86400, "هفته": 7 * 86400, "ماه": 30 * 86400, "سال": 365 * 86400}[m.group(2)]
    if re.search(r"بیش ?از|ماه ?ها|چند ?ماه", t) and m.group(2) in ("ماه", "سال"):
        n = n + 1
    return int(now - n * unit)
