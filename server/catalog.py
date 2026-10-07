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
    # گسترش تدریجی: پس از کامل شدن شمال، استان‌ها به ترتیب جمعیت یکی‌یکی فعال می‌شوند
    "tehran": {"name": "تهران", "center": (35.69, 51.39)},
    "khorasan_razavi": {"name": "خراسان رضوی", "center": (36.26, 59.62)},
    "isfahan": {"name": "اصفهان", "center": (32.65, 51.67)},
    "fars": {"name": "فارس", "center": (29.59, 52.58)},
    "khuzestan": {"name": "خوزستان", "center": (31.32, 48.67)},
    "azarbaijan_east": {"name": "آذربایجان شرقی", "center": (38.08, 46.29)},
    "azarbaijan_west": {"name": "آذربایجان غربی", "center": (37.55, 45.08)},
    "kerman": {"name": "کرمان", "center": (30.28, 57.08)},
    "sistan": {"name": "سیستان و بلوچستان", "center": (29.5, 60.86)},
    "alborz": {"name": "البرز", "center": (35.84, 50.94)},
    "kermanshah": {"name": "کرمانشاه", "center": (34.31, 47.07)},
    "hormozgan": {"name": "هرمزگان", "center": (27.18, 56.27)},
    "lorestan": {"name": "لرستان", "center": (33.49, 48.36)},
    "hamadan": {"name": "همدان", "center": (34.8, 48.51)},
    "kurdistan": {"name": "کردستان", "center": (35.32, 46.99)},
    "markazi": {"name": "مرکزی", "center": (34.1, 49.7)},
    "qom": {"name": "قم", "center": (34.64, 50.87)},
    "qazvin": {"name": "قزوین", "center": (36.28, 50.0)},
    "ardabil": {"name": "اردبیل", "center": (38.25, 48.29)},
    "bushehr": {"name": "بوشهر", "center": (28.92, 50.82)},
    "yazd": {"name": "یزد", "center": (31.9, 54.36)},
    "zanjan": {"name": "زنجان", "center": (36.67, 48.48)},
    "chaharmahal": {"name": "چهارمحال و بختیاری", "center": (32.33, 50.86)},
    "khorasan_north": {"name": "خراسان شمالی", "center": (37.47, 57.33)},
    "khorasan_south": {"name": "خراسان جنوبی", "center": (32.86, 59.23)},
    "kohgiluyeh": {"name": "کهگیلویه و بویراحمد", "center": (30.67, 51.59)},
    "semnan": {"name": "سمنان", "center": (35.57, 53.4)},
    "ilam": {"name": "ایلام", "center": (33.64, 46.42)},
}
NORTH = ["gilan", "mazandaran", "golestan"]
# ترتیب پیش‌فرض گسترش: استان‌های پرجمعیت‌تر زودتر (مدیر می‌تواند ترتیب را عوض کند)
EXPANSION_ORDER = [k for k in PROVINCES if k not in NORTH]

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
] + [(k, n, p, la, ln, None) for p, rows in {
    "tehran": [("tehran", "تهران", 35.6892, 51.389), ("eslamshahr", "اسلامشهر", 35.5522, 51.235), ("shahriar", "شهریار", 35.6597, 51.0592),
               ("qods", "قدس", 35.7214, 51.1094), ("malard", "ملارد", 35.6658, 50.9767), ("pakdasht", "پاکدشت", 35.4817, 51.6803),
               ("varamin", "ورامین", 35.3242, 51.6457), ("robatkarim", "رباط کریم", 35.4846, 51.0829), ("pardis", "پردیس", 35.7419, 51.775),
               ("damavand", "دماوند", 35.7178, 52.065), ("baharestan", "بهارستان", 35.525, 51.165)],
    "khorasan_razavi": [("mashhad", "مشهد", 36.2605, 59.6168), ("neyshabur", "نیشابور", 36.2133, 58.7958), ("sabzevar", "سبزوار", 36.2126, 57.6819),
                        ("torbat_heydarieh", "تربت حیدریه", 35.274, 59.2195), ("quchan", "قوچان", 37.106, 58.51), ("kashmar", "کاشمر", 35.2383, 58.4656),
                        ("torbat_jam", "تربت جام", 35.244, 60.6225), ("chenaran", "چناران", 36.6455, 59.1212), ("fariman", "فریمان", 35.7069, 59.85)],
    "isfahan": [("isfahan", "اصفهان", 32.6546, 51.668), ("kashan", "کاشان", 33.985, 51.41), ("khomeinishahr", "خمینی شهر", 32.7, 51.52),
                ("najafabad", "نجف آباد", 32.6324, 51.365), ("shahinshahr", "شاهین شهر", 32.8628, 51.553), ("shahreza", "شهرضا", 32.0089, 51.8668),
                ("mobarakeh", "مبارکه", 32.3464, 51.5044), ("golpayegan", "گلپایگان", 33.4537, 50.2884), ("falavarjan", "فلاورجان", 32.555, 51.5097),
                ("zarrinshahr", "زرین شهر", 32.3897, 51.3766)],
    "fars": [("shiraz", "شیراز", 29.5918, 52.5837), ("marvdasht", "مرودشت", 29.8742, 52.8025), ("kazerun", "کازرون", 29.6195, 51.6541),
             ("jahrom", "جهرم", 28.5, 53.5605), ("fasa", "فسا", 28.9383, 53.6482), ("lar", "لار", 27.6811, 54.3424), ("darab", "داراب", 28.7519, 54.5444),
             ("firuzabad", "فیروزآباد", 28.8438, 52.5707), ("abadeh", "آباده", 31.1608, 52.6506)],
    "khuzestan": [("ahvaz", "اهواز", 31.3183, 48.6706), ("dezful", "دزفول", 32.3811, 48.4058), ("abadan", "آبادان", 30.3392, 48.3043),
                  ("khorramshahr", "خرمشهر", 30.4256, 48.1891), ("mahshahr", "ماهشهر", 30.5589, 49.1981), ("andimeshk", "اندیمشک", 32.46, 48.3592),
                  ("behbahan", "بهبهان", 30.5959, 50.2417), ("shushtar", "شوشتر", 32.0455, 48.8567), ("izeh", "ایذه", 31.8341, 49.867),
                  ("masjed_soleyman", "مسجد سلیمان", 31.9364, 49.3039)],
    "azarbaijan_east": [("tabriz", "تبریز", 38.08, 46.2919), ("maragheh", "مراغه", 37.3917, 46.2397), ("marand", "مرند", 38.4329, 45.7749),
                        ("mianeh", "میانه", 37.4211, 47.715), ("ahar", "اهر", 38.4774, 47.0699), ("bonab", "بناب", 37.3404, 46.0561),
                        ("sarab", "سراب", 37.9408, 47.5367), ("shabestar", "شبستر", 38.1803, 45.7028), ("azarshahr", "آذرشهر", 37.7589, 45.9783)],
    "azarbaijan_west": [("urmia", "ارومیه", 37.5527, 45.0761), ("khoy", "خوی", 38.5503, 44.9521), ("bukan", "بوکان", 36.521, 46.2089),
                        ("mahabad", "مهاباد", 36.7631, 45.7222), ("miandoab", "میاندوآب", 36.9694, 46.1027), ("salmas", "سلماس", 38.1973, 44.7653),
                        ("piranshahr", "پیرانشهر", 36.694, 45.1413), ("naqadeh", "نقده", 36.9553, 45.388), ("maku", "ماکو", 39.2953, 44.5167)],
    "kerman": [("kerman", "کرمان", 30.2839, 57.0834), ("sirjan", "سیرجان", 29.452, 55.6814), ("rafsanjan", "رفسنجان", 30.4067, 55.9939),
               ("jiroft", "جیرفت", 28.6751, 57.7372), ("bam", "بم", 29.106, 58.357), ("zarand", "زرند", 30.8127, 56.5639), ("kahnuj", "کهنوج", 27.9469, 57.7004)],
    "sistan": [("zahedan", "زاهدان", 29.4963, 60.8629), ("zabol", "زابل", 31.0287, 61.5012), ("chabahar", "چابهار", 25.2919, 60.643),
               ("iranshahr", "ایرانشهر", 27.2025, 60.6848), ("saravan", "سراوان", 27.3709, 62.3342), ("khash", "خاش", 28.2211, 61.2158)],
    "alborz": [("karaj", "کرج", 35.84, 50.9391), ("fardis", "فردیس", 35.7236, 50.9861), ("nazarabad", "نظرآباد", 35.9522, 50.6075),
               ("hashtgerd", "هشتگرد", 35.9622, 50.68), ("eshtehard", "اشتهارد", 35.7255, 50.3662)],
    "kermanshah": [("kermanshah", "کرمانشاه", 34.3142, 47.065), ("eslamabad_gharb", "اسلام آباد غرب", 34.1094, 46.5275), ("kangavar", "کنگاور", 34.5043, 47.9653),
                   ("harsin", "هرسین", 34.2721, 47.5861), ("sahneh", "صحنه", 34.4813, 47.6908), ("javanrud", "جوانرود", 34.8067, 46.4886),
                   ("paveh", "پاوه", 35.0434, 46.3565)],
    "hormozgan": [("bandarabbas", "بندرعباس", 27.1832, 56.2666), ("qeshm", "قشم", 26.9581, 56.2719), ("kish", "کیش", 26.5578, 54.0194),
                  ("minab", "میناب", 27.1467, 57.0801), ("bandar_lengeh", "بندر لنگه", 26.5579, 54.8807), ("hajiabad", "حاجی آباد", 28.3091, 55.9017)],
    "lorestan": [("khorramabad", "خرم آباد", 33.4878, 48.3558), ("borujerd", "بروجرد", 33.8973, 48.7516), ("dorud", "دورود", 33.4955, 49.0578),
                 ("kuhdasht", "کوهدشت", 33.535, 47.6061), ("aligudarz", "الیگودرز", 33.4006, 49.6949), ("azna", "ازنا", 33.4558, 49.4555)],
    "hamadan": [("hamadan", "همدان", 34.7983, 48.5146), ("malayer", "ملایر", 34.2969, 48.8235), ("nahavand", "نهاوند", 34.1883, 48.3769),
                ("tuyserkan", "تویسرکان", 34.548, 48.4469), ("asadabad", "اسدآباد", 34.7824, 48.1185), ("kabudrahang", "کبودرآهنگ", 35.2083, 48.7239)],
    "kurdistan": [("sanandaj", "سنندج", 35.3219, 46.9862), ("saqqez", "سقز", 36.2499, 46.2735), ("marivan", "مریوان", 35.5183, 46.176),
                  ("baneh", "بانه", 35.9975, 45.8853), ("qorveh", "قروه", 35.1664, 47.8056), ("bijar", "بیجار", 35.8668, 47.6051)],
    "markazi": [("arak", "اراک", 34.0954, 49.7013), ("saveh", "ساوه", 35.0213, 50.3566), ("khomein", "خمین", 33.6386, 50.0801),
                ("mahallat", "محلات", 33.911, 50.4535), ("delijan", "دلیجان", 33.9905, 50.6838), ("shazand", "شازند", 33.9273, 49.4116)],
    "qom": [("qom", "قم", 34.6416, 50.8746)],
    "qazvin": [("qazvin", "قزوین", 36.2797, 50.0049), ("takestan", "تاکستان", 36.0696, 49.6959), ("alvand", "الوند", 36.1893, 50.0643),
               ("abyek", "آبیک", 36.0402, 50.531), ("buin_zahra", "بوئین زهرا", 35.7669, 50.0578)],
    "ardabil": [("ardabil", "اردبیل", 38.2498, 48.2933), ("parsabad", "پارس آباد", 39.6482, 47.9174), ("meshgin_shahr", "مشگین شهر", 38.3989, 47.6819),
                ("khalkhal", "خلخال", 37.6189, 48.5258), ("sarein", "سرعین", 38.1494, 48.0711), ("germi", "گرمی", 39.0215, 48.08)],
    "bushehr": [("bushehr", "بوشهر", 28.9234, 50.8203), ("borazjan", "برازجان", 29.2666, 51.2159), ("genaveh", "بندر گناوه", 29.5791, 50.517),
                ("kangan", "بندر کنگان", 27.837, 52.0645), ("asaluyeh", "عسلویه", 27.4761, 52.6074), ("jam", "جم", 27.8279, 52.3274)],
    "yazd": [("yazd", "یزد", 31.8974, 54.3569), ("meybod", "میبد", 32.2501, 54.0166), ("ardakan", "اردکان", 32.31, 54.0175),
             ("bafq", "بافق", 31.6035, 55.4025), ("mehriz", "مهریز", 31.5917, 54.4318), ("taft", "تفت", 31.7475, 54.2091)],
    "zanjan": [("zanjan", "زنجان", 36.6736, 48.4787), ("abhar", "ابهر", 36.1468, 49.218), ("khorramdarreh", "خرمدره", 36.2034, 49.1915),
               ("qeydar", "قیدار", 36.1203, 48.5911)],
    "chaharmahal": [("shahrekord", "شهرکرد", 32.3256, 50.8644), ("borujen", "بروجن", 31.9652, 51.2873), ("farsan", "فارسان", 32.2575, 50.5666),
                    ("lordegan", "لردگان", 31.5103, 50.8299)],
    "khorasan_north": [("bojnurd", "بجنورد", 37.4747, 57.329), ("shirvan", "شیروان", 37.3967, 57.9295), ("esfarayen", "اسفراین", 37.0765, 57.5101)],
    "khorasan_south": [("birjand", "بیرجند", 32.8649, 59.2262), ("ferdows", "فردوس", 34.0186, 58.1722), ("qaen", "قائن", 33.7265, 59.1844),
                       ("nehbandan", "نهبندان", 31.5418, 60.0365)],
    "kohgiluyeh": [("yasuj", "یاسوج", 30.6682, 51.588), ("dogonbadan", "دوگنبدان", 30.3586, 50.7981), ("dehdasht", "دهدشت", 30.7949, 50.5646)],
    "semnan": [("semnan", "سمنان", 35.5729, 53.3971), ("shahrud", "شاهرود", 36.4182, 54.9763), ("damghan", "دامغان", 36.1683, 54.348),
               ("garmsar", "گرمسار", 35.2182, 52.3409)],
    "ilam": [("ilam", "ایلام", 33.6374, 46.4227), ("dehloran", "دهلران", 32.6941, 47.2679), ("ivan", "ایوان", 33.8273, 46.3096),
             ("mehran", "مهران", 33.1222, 46.1646)],
}.items() for k, n, la, ln in rows]

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
# S = جنوب (ساحل شرقی‌غربی)، N = شمال (ساحل جنوبی کشور)، W = غرب (ساحل شمالی‌جنوبی تالش و آستارا)، T = نوار باریک بین دریا و تالاب.
COAST = {
    "anzali": "T", "astara": "W", "talesh": "W", "kiashahr": "S", "chaboksar": "S", "rudsar": "S", "langarud": "S",
    "babolsar": "S", "fereydunkenar": "S", "mahmudabad": "S", "nur": "S", "nowshahr": "S", "chalus": "S",
    "abbasabad": "S", "tonekabon": "S", "ramsar": "S", "torkaman": "S", "bandargaz": "S", "astaneh": "S",
    # خلیج فارس و دریای عمان: دریا در جنوب است (N = فقط رو به شمال)
    "bandarabbas": "N", "chabahar": "N", "bandar_lengeh": "N", "kangan": "N", "asaluyeh": "N", "mahshahr": "N", "genaveh": "N",
    "bushehr": "T", "kish": "T", "qeshm": "T",
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
    if side == "N":
        return round(lat + (0.002 + abs(u) * 0.022), 5), round(lng + v * 1.6 * spread, 5)
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
