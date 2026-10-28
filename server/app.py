"""سرور فرصت ملک: صفحات سایت، API آگهی‌ها و ارزش‌گذاری، عضویت و اشتراک، پنل مدیریت و دریافت تدریجی از دیوار.

اجرا:  python server/app.py            (پیش‌فرض http://127.0.0.1:8000)
       python server/app.py --port 9000 --host 0.0.0.0 --no-browser
فقط به کتابخانه استاندارد پایتون ۳.۹ به بالا نیاز دارد.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import secrets
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import sqlite3
from pathlib import Path


def get_optimized_db(db_path='database.db'):
    """
    اتصال امن و همزمان به SQLite با فعال‌سازی WAL mode
    """
    conn = sqlite3.connect(db_path, timeout=30.0, check_same_thread=False)
    conn.execute('PRAGMA journal_mode=WAL;') # خواندن و نوشتن همزمان بدون قفل
    conn.execute('PRAGMA synchronous=NORMAL;')
    conn.execute('PRAGMA cache_size=-64000;') # ۶۴ مگابایت کش رم
    conn.row_factory = sqlite3.Row
    return conn

mimetypes.add_type("image/webp", ".webp")   # پایتون‌های قدیمی‌تر WebP را نمی‌شناسند
_WEBP = {}


def webp_ok() -> bool:
    """تبدیل به WebP فقط اگر کتابخانهٔ Pillow روی سرور نصب باشد (pip install pillow)؛ وگرنه همان عکس اصلی."""
    if "ok" not in _WEBP:
        try:
            from PIL import features, Image  # noqa: F401
            _WEBP["ok"] = bool(features.check("webp"))
        except Exception:  # noqa: BLE001
            _WEBP["ok"] = False
    return _WEBP["ok"]


def to_webp(data: bytes, out: Path, max_w: int = 1600, quality: int = 80):
    import io
    from PIL import Image
    im = Image.open(io.BytesIO(data))
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    tmp = out.with_suffix(".tmp")
    im.save(tmp, "WEBP", quality=quality, method=4)
    tmp.replace(out)


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import catalog  # noqa: E402
from billing import DEFAULT_BILLING, DEFAULT_SMS, Billing  # noqa: E402
from support import DEFAULT_SUPPORT, Support  # noqa: E402
from flags import Flags  # noqa: E402
import seo  # noqa: E402
import sitepage  # noqa: E402
from features import clean_title  # noqa: E402
from ingest import DEFAULT_INGEST, Ingestor  # noqa: E402
from report import market_report  # noqa: E402
from store import Store  # noqa: E402
from valuation import DEFAULT_THRESHOLDS  # noqa: E402

DEFAULT_SITE = {"name": "فرصت ملک", "tagline": "ارزش واقعی ملک، محله به محله", "about": "", "email": "",
                # طراحی سایت: classic (قبلی) یا new (طراحی سینمایی تازه)؛ پیش‌نمایش برای خود مالک با ?design=new
                "design": "classic",
                # ویدیوی معرفی صفحهٔ اول (پیوند آپارات، یوتیوب یا فایل mp4)؛ با تغییر پیوند در پنل، ویدیوی سایت عوض می‌شود
                "video_url": "", "video_title": "فرصت ملک در یک نگاه", "video_desc": "",
                # چند ویدیو: [{url, title, desc, on}]؛ برای هر بازدید یکی از ویدیوهای فعال به‌تصادف نمایش داده می‌شود
                "videos": []}
# contact_mode: none = هیچ شماره‌ای نشان داده نمی‌شود؛ owner = فقط شمارهٔ آگهی‌های شخصی (مالک)؛ all = شمارهٔ هر آگهی‌دهنده
DEFAULT_DISPLAY = {"show_samples": True, "contact_mode": "none", "show_address": True}
# اطلاعاتی که فقط مالک سایت می‌تواند بدهد؛ تا خالی است، جمله یا سطر مربوط در سایت نمایش داده نمی‌شود
DEFAULT_OWNER = {"support_url": "", "support_label": "", "legal_name": "", "refund_text": "", "enamad_url": ""}
PUBLIC_DIRS = ("assets",)
PUBLIC_FILES = ("index.html", "app.html", "sky.html", "property.html", "account.html", "admin.html", "favicon.svg", "manifest.webmanifest")
SESSIONS: dict[str, float] = {}
LOGIN_FAILS: dict[str, list] = {}
LOCKED_FIELDS = ("url", "token")


def hash_pw(pw: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 200_000).hex()


TICKET_IPS: dict = {}


class RateLimiter:
    """محدودیت درخواست هر IP در پنجرهٔ لغزان یک‌دقیقه‌ای (در حافظه)؛ جلوی ربات‌ها و حمله‌های ساده را می‌گیرد."""
    def __init__(self):
        self.hits: dict = {}
        self.lock = threading.Lock()
        self.last_gc = time.time()

    def allow(self, key: str, limit: int, window: int = 60) -> bool:
        now = time.time()
        with self.lock:
            q = [t for t in self.hits.get(key, ()) if t > now - window]
            ok = len(q) < limit
            if ok:
                q.append(now)
            self.hits[key] = q
            if now - self.last_gc > 300:  # پاک‌سازی دوره‌ای تا حافظه پر نشود
                self.hits = {k: v for k, v in self.hits.items() if v and v[-1] > now - 3600}
                self.last_gc = now
            return ok


LIMITER = RateLimiter()
# سقف هر IP در دقیقه: خواندن API، نوشتن، عکس، صفحه‌ها
# سقف‌ها برای هر IP در دقیقه؛ کاربران اینترنت همراه گاهی پشت یک IP مشترک‌اند، پس سقف صفحه و API سخاوتمندانه است
LIMITS = {"api": 480, "post": 40, "img": 600, "page": 300, "tile": 1500}
# کاشی‌های نقشه از طریق سرور خود سایت با کش دائمی روی دیسک: بدون کلید، و در قطع اینترنت بین‌الملل
# هر ناحیه‌ای که یک بار دیده شده باز هم نمایش داده می‌شود
# هر سبک چند منبع دارد: اگر یکی از ایران کند یا مسدود باشد (مثلاً اسری که ایران را تحریم کرده)، منبع بعدی امتحان می‌شود
# و منبعی که پشت سر هم خطا داده چند دقیقه کنار گذاشته می‌شود تا کاشی‌ها منتظر تایم‌اوت نمانند.
TILE_SOURCES = {
    "osm": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://{abc}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
            "https://tile.openstreetmap.de/{z}/{x}/{y}.png"],
    "sat": ["https://mt{n}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"],
}
TILE_HEALTH = {}             # url → {"fail": خطاهای پیاپی, "until": زمان پایان کنارگذاری}
TILE_LOCK = threading.Lock()
OTP_PER_IP_HOUR = int(os.environ.get("ARA_OTP_PER_IP_HOUR", 6))         # درخواست کد ورود از هر IP در ساعت (جلوی پیامک‌بمباران و هزینهٔ پیامک)
OTP_GLOBAL_DAY = int(os.environ.get("ARA_OTP_DAILY_CAP", "500"))
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-Permitted-Cross-Domain-Policies": "none",
    # اسکریپت و اتصال فقط از خود سایت؛ کاشی نقشه و عکس از https
    "Content-Security-Policy": ("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
                                "img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob: https:; "
                                # ویدیوی معرفی صفحهٔ اول (پخش‌کنندهٔ آپارات یا یوتیوب در iframe)
                                "frame-src 'self' https://www.aparat.com https://aparat.com https://www.youtube-nocookie.com https://www.youtube.com; "
                                "frame-ancestors 'self'; base-uri 'self'; form-action 'self' https:; object-src 'none'"),
}


class BoundedServer(ThreadingHTTPServer):
    """حداکثر ۶۴ اتصال هم‌زمان؛ اتصال اضافه فوراً بسته می‌شود تا سرور با هجوم درخواست از کار نیفتد."""
    daemon_threads = True
    request_queue_size = 128

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.slots = threading.BoundedSemaphore(int(os.environ.get("ARA_MAX_CONN", 160)))

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            try:
                request.sendall(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nRetry-After: 5\r\nConnection: close\r\n\r\n")
            except OSError:
                pass
            self.shutdown_request(request)
            return
        super().process_request(request, client_address)

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()
SITEMAP: dict = {}
LLMS: dict = {}


def _version() -> str:
    """شناسهٔ کوتاه نسخهٔ نصب‌شده (کامیت گیت) برای نمایش در پایین سایت و پنل، و شکستن کش مرورگر."""
    try:
        import subprocess
        v = subprocess.run(["git", "-C", str(ROOT), "log", "-1", "--format=%h|%cd", "--date=format:%Y-%m-%d %H:%M"],
                           capture_output=True, text=True, timeout=5).stdout.strip()
        if v:
            return v
    except Exception:  # noqa: BLE001
        pass
    return str(int(max(f.stat().st_mtime for f in (ROOT / "assets").rglob("*") if f.is_file())))


VERSION = _version()


def band5(x: float) -> float:
    """گرد کردن به سمت صفر در گام‌های ۵ درصدی (۰٫۲۷ ← ۰٫۲۵، −۰٫۱۸ ← −۰٫۱۵)."""
    return (1 if x >= 0 else -1) * (int(abs(x) * 100) // 5 * 5) / 100


def decode_upload(raw):
    """تصویر یا PDF ارسال‌شده به‌صورت data URL؛ حداکثر ۵ مگابایت."""
    if not raw:
        return None
    import base64
    raw = str(raw)
    m = re.match(r"^data:(image/(?:jpeg|png|webp)|application/pdf);base64,", raw)
    if not m:
        raise ValueError("فقط تصویر JPG، PNG، WebP یا PDF")
    img = base64.b64decode(raw[m.end():], validate=False)
    if len(img) > 5_000_000:
        raise ValueError("حجم فایل زیاد است: حداکثر ۵ مگابایت")
    return img


class App:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.store = Store(data_dir / "ara.db")
        self.ingest = Ingestor(self.store)
        self.ingest.migrate()
        self.billing = Billing(self.store)
        from bale import Bale, Telegram
        self.bale = Bale(self.store, self.billing)
        self.billing.bale = self.bale
        from alerts import Alerts
        self.telegram = Telegram(self.store, self.billing)   # هشدار «خبرم کن»، رسید، پاسخ پشتیبانی و دستیار هوشمند
        self.billing.telegram = self.telegram
        from analytics import Analytics
        self.analytics = Analytics(self.store)   # آمار بازدید برای پنل مدیریت
        try:
            self.analytics.prune()   # بیش از ۴۰۰ روز نگه داشته نمی‌شود
        except Exception:  # noqa: BLE001
            pass
        self.alerts = Alerts(self.store, self.billing, self.bale, self.telegram)
        from mailer import Mailer
        from accounts import Accounts
        self.mailer = Mailer(self.store)
        self.accounts = Accounts(self.store, self.billing, self.mailer)
        self.support = Support(self.store, self.billing, data_dir)
        from tgbot import Assistant
        self.telegram.assistant = Assistant(self.telegram, self, estimate_value)   # دستیار فارسی ربات تلگرام
        self.flags = Flags(self.store)
        seo.ensure_articles(self.store)
        # اصلاح امتیازهای اشتباه قبلی در دیتابیس
        try:
            self.store.x("UPDATE listings SET score=84.9 WHERE label='good' AND score>=85")
        except: pass
        if not self.store.get_setting("mig_strict_lock_v1"):
            b = self.store.get_setting("billing") or {}
            self.store.set_setting("billing", {**b, "free_preview": 0, "trial_enabled": False, "weekly_price": b.get("weekly_price") or 98000, "monthly_price": b.get("monthly_price") or 248000})
            self.store.x("UPDATE users SET sub_until=0 WHERE plan='trial'")
            self.store.set_setting("mig_strict_lock_v1", int(time.time()))
        # نام قدیمی سایت که در پنل ذخیره شده بود ← «فرصت ملک» (نیم‌فاصلهٔ نام قبلی در برخی دستگاه‌ها مربع دیده می‌شد)
        site = self.store.get_setting("site") or {}
        if re.sub(r"[\s\u200c\u200d\u200f\u200e]", "", site.get("name") or "") in ("فرصتیاب", "ملکیاب"):
            self.store.set_setting("site", {**site, "name": "فرصت ملک"})
        if not self.store.get_setting("mig_trial3"):   # دورهٔ رایگان پیش‌فرض از ۱۰ به ۳ روز (قابل تغییر در پنل، ۰ = بدون دوره)
            b = self.store.get_setting("billing") or {}
            if int(b.get("trial_days") or 10) == 10:
                self.store.set_setting("billing", {**b, "trial_days": 3})
            self.store.set_setting("mig_trial3", int(time.time()))
        site = self.store.get_setting("site") or {}
        if (site.get("tagline") or "").strip() in ("ملک زیر قیمت، محله به محله",):  # شعار قدیمی ← شعار تازه
            self.store.set_setting("site", {**site, "tagline": "ارزش واقعی ملک، محله به محله"})

    def regions(self):
        """استان‌های فعال غیرشمالی و شهرهایشان برای سایت (شمال در خود سایت ثابت است)."""
        act = [p for p in self.ingest.expansion()["active"] if p not in catalog.NORTH]
        # استان‌هایی که آگهی فعال دارند (حتی اگر دریافتشان متوقف شده) هم شناخته شوند؛ وگرنه صفحهٔ محلهٔ تهران «۰ آگهی» نشان می‌داد
        now = time.time()
        if now - getattr(self, "_live_prov_at", 0) > 300:
            self._live_prov = [r[0] for r in self.store.q("SELECT DISTINCT province FROM listings WHERE status='active' AND hidden=0 AND province IS NOT NULL")]
            self._live_prov_at = now
        act += [p for p in self._live_prov if p in catalog.PROVINCES and p not in catalog.NORTH and p not in act]
        return {"active": catalog.NORTH + act,
                "provinces": [{"id": p, "name": catalog.PROVINCES[p]["name"], "center": list(catalog.PROVINCES[p]["center"])} for p in act],
                "cities": [{"id": c["key"], "name": c["name"], "province": c["province"], "lat": c["lat"], "lng": c["lng"], "tags": []}
                           for c in catalog.CITIES if c["province"] in act]}

    def public_config(self, local=False):
        s, b = self.store, self.billing
        return {
            "mode": "server",
            "site": {**DEFAULT_SITE, **(s.get_setting("site") or {})},
            "display": {k: v for k, v in {**DEFAULT_DISPLAY, **(s.get_setting("display") or {})}.items() if k != "contact_mode"},
            "plans": b.plans(), "payable": b.payable(), "test_payments": b.cfg()["test_mode"],
            "free_preview": int(b.cfg().get("free_preview") or 0),
            "free_results": int(b.cfg().get("free_results") or 0),
            "trial_days": int(b.cfg().get("trial_days") or 0) if b.cfg().get("trial_enabled") else 0,
            "gateway": "card" if b.cfg()["gateway"] == "card" and not b.cfg()["test_mode"] else "online",
            "owner": {k: v for k, v in {**DEFAULT_OWNER, **(s.get_setting("owner") or {})}.items() if v},
            "thresholds": {**DEFAULT_THRESHOLDS, **(s.get_setting("thresholds") or {})},
            "updated": (s.q("SELECT MAX(last_seen) t FROM listings WHERE source IN ('divar','sheypoor')", one=True) or {"t": None})["t"],
            "sms_live": b.sms_live(), "email_ready": self.mailer.ready(),
            # روش‌های ورود و پرداخت: همه نمایش داده می‌شوند؛ آماده‌نشده‌ها «فعلاً فعال نیست»
            "login_channels": b.login_channels(local), "pay_methods": b.methods_public(),
            "admin_ready": bool(s.get_setting("admin")),
            "regions": self.regions(), "version": VERSION,
            "valuation": s.get_setting("valuation_info") and {k: v for k, v in s.get_setting("valuation_info").items() if k != "models"},
        }


def estimate_value(store, q: dict) -> dict:
    """تخمین ارزش یک ملک توصیف‌شده با همان مدل ارزش‌گذاری سایت: قیمت پایهٔ محله × اثر ویژگی‌ها (سن بنا، طبقه، آسانسور، …).
    اگر برای آن شهر مدل آماری نباشد، ضریب‌های عرف بازار به کار می‌رود و همین گفته می‌شود."""
    import math
    from catalog import norm as _norm
    from features import jalali_year_now, kind_group
    from valuation import apply_model, design_row
    from features import LABELS
    city, dist = q.get("city") or "", q.get("district") or ""
    c = catalog.CITY_BY_KEY.get(city)
    if not c or not dist:
        raise ValueError("شهر و محله را انتخاب کنید")
    kg = kind_group(q.get("kind") or "apartment")
    num = lambda k: (float(str(q[k]).translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789"))) if str(q.get(k) or "").strip() not in ("", "null", "undefined") else None)
    area = num("area")
    if not area or area < 15:
        raise ValueError("متراژ را وارد کنید")
    e = (store.get_setting("estimator") or {}).get(kg) or {}
    bkey = f"{city}|{_norm(dist).replace(' ', '')}"
    b = (e.get("base") or {}).get(bkey)
    if not b:
        raise ValueError("برای این محله و این نوع ملک هنوز آگهی معتبر کافی نیست")
    year = num("year")
    age = None
    if year:
        y = year if year > 1200 else None
        if y and y > 1900:   # سال میلادی
            y = y - 621
        age = max(0, jalali_year_now() - int(y)) if y else None
    f = {"area": area, "age": age, "floor": num("floor"), "floors_total": num("floors_total"), "elevator": num("elevator"),
         "parking": num("parking"), "warehouse": num("warehouse"), "deed_single": num("deed_single"), "renovated": num("renovated"),
         "rooms": num("rooms"), "land_area": num("land_area"), "pool": num("pool")}
    model = (e.get("models") or {}).get("c:" + city) or (e.get("models") or {}).get("p:" + c["province"])
    effects, adj, method = [], 0.0, "model"
    if model and model.get("n", 0) >= 20:
        m = {**model, "stats": {k: tuple(v) for k, v in model["stats"].items()}}
        adj, contrib = apply_model(m, design_row(f, kg))
        adj = max(-0.6, min(0.6, adj))
        merged = {}
        for k, v in contrib.items():
            merged[LABELS.get(k, k)] = merged.get(LABELS.get(k, k), 0) + v
        effects = [[lab, round(math.exp(v) - 1, 3)] for lab, v in sorted(merged.items(), key=lambda t: -abs(t[1])) if abs(v) >= 0.005][:8]
    else:
        # ضریب‌های عرف بازار (تقریبی): نوسازی، سن بنا، آسانسور در طبقات بالا، پارکینگ و انباری
        method = "rule"
        fx = []
        if age is not None:
            fx.append(("سن بنا", 0.06 if age <= 2 else max(-0.35, -0.012 * (age - 2))))
        if kg == "apartment":
            fl = f["floor"]
            if fl is not None and f["elevator"] == 0 and fl >= 3:
                fx.append(("طبقه بدون آسانسور", -0.04 * (fl - 2)))
            elif f["elevator"] == 1:
                fx.append(("آسانسور", 0.03))
            if fl == 0:
                fx.append(("طبقهٔ همکف", -0.03))
            if f["parking"]:
                fx.append(("پارکینگ", 0.06))
            elif f["parking"] == 0:
                fx.append(("بدون پارکینگ", -0.06))
            if f["warehouse"]:
                fx.append(("انباری", 0.02))
        for lab, p in fx:
            adj += math.log(1 + p)
        effects = [[lab, round(p, 3)] for lab, p in fx]
    ppm = math.exp(b[0] + adj)
    return {"ppm": ppm, "total": ppm * area, "base_ppm": math.exp(b[0]), "effects": effects, "method": method,
            "n": b[1], "model": {"n": model["n"], "r2": model["r2"]} if model and method == "model" else None}


class Handler(BaseHTTPRequestHandler):
    app: App = None
    server_version = "Forsatyab"
    sys_version = ""
    timeout = 20  # اتصال کُند یا نیمه‌کاره (حملهٔ slowloris) پس از ۲۰ ثانیه بسته می‌شود

    def end_headers(self):
        for k, v in SECURITY_HEADERS.items():
            self.send_header(k, v)
        super().end_headers()

    def limited(self, kind: str) -> bool:
        """اگر سقف درخواست این IP پر شده باشد، پاسخ ۴۲۹ می‌فرستد و True برمی‌گرداند (درخواست‌های خود همین رایانه آزادند)."""
        if self.is_local() or LIMITER.allow(f"{kind}:{self.client_ip()}", LIMITS[kind]):
            return False
        body = json.dumps({"error": "تعداد درخواست زیاد است؛ کمی بعد دوباره امتحان کنید"}, ensure_ascii=False).encode()
        self.send_response(429)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("retry-after", "30")
        self.send_header("content-length", str(len(body)))
        super().end_headers()
        self.wfile.write(body)
        return True

    def log_message(self, fmt, *args):
        if os.environ.get("ARA_DEBUG"):
            super().log_message(fmt, *args)

    # ---------------------------------------------------------- io
    # فشرده‌سازی gzip برای متن (HTML، CSS، JS، JSON، SVG): حجم دانلود چند برابر کمتر، به‌ویژه روی اینترنت کند
    _GZ_CACHE = {}

    def gz(self, body: bytes, ctype: str, key=None) -> bytes:
        if len(body) < 1200 or "gzip" not in (self.headers.get("accept-encoding") or "") or not (
                ctype.startswith(("text/", "application/javascript", "application/json", "image/svg+xml", "application/xml"))):
            return body
        if key and key in Handler._GZ_CACHE:
            out = Handler._GZ_CACHE[key]
        else:
            import gzip as _gzip
            out = _gzip.compress(body, 6)
            if key:
                if len(Handler._GZ_CACHE) > 400:
                    Handler._GZ_CACHE.clear()
                Handler._GZ_CACHE[key] = out
        self._gzipped = True
        return out

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False, default=str).encode()
        self._gzipped = False
        body = self.gz(body, "application/json")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("cache-control", "no-store")
        if self._gzipped:
            self.send_header("content-encoding", "gzip")
            self.send_header("vary", "Accept-Encoding")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, location):
        self.send_response(302)
        self.send_header("location", location)
        self.end_headers()

    def body(self) -> dict:
        try:
            n = int(self.headers.get("content-length") or 0)
        except ValueError:
            raise ValueError("درخواست نامعتبر است")
        if n < 0 or n > 8_000_000:
            raise ValueError("درخواست بیش از حد بزرگ است")
        raw = self.rfile.read(n) if n else b""
        if "application/x-www-form-urlencoded" in (self.headers.get("content-type") or ""):
            return {k: v[-1] for k, v in urllib.parse.parse_qs(raw.decode()).items()}
        try:
            return json.loads(raw or b"{}")
        except json.JSONDecodeError:
            raise ValueError("JSON نامعتبر")

    def is_admin(self) -> bool:
        tok = self.headers.get("x-admin-token") or ""
        exp = SESSIONS.get(tok)
        if exp and exp > time.time():
            SESSIONS[tok] = time.time() + 8 * 3600
            return True
        return False

    @staticmethod
    def versioned(data: bytes) -> bytes:
        """هر نسخهٔ تازه، فایل‌های تازه را از مرورگر می‌خواهد (شکستن کش)."""
        tag = re.sub(r"\W", "", VERSION.split("|")[0])
        # نسخهٔ دستی (?v=...) هم با نسخهٔ واقعی جایگزین می‌شود تا هیچ فایلی در کش مرورگر نماند
        return re.sub(rb'((?:src|href)="/?assets/[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"', lambda m: m.group(1) + b"?v=" + tag.encode() + b'"', data)

    def page_html(self, data: bytes) -> bytes:
        """صفحهٔ اصلی با نسخهٔ فایل‌ها و طراحی انتخاب‌شده در پنل (بدون پرش ظاهر هنگام بارگذاری)."""
        data = self.versioned(data)
        site = self.app.store.get_setting("site") or {}
        if site.get("design") == "new":
            data = data.replace(b'<html lang="fa" dir="rtl">', b'<html lang="fa" dir="rtl" data-design="new" data-design-src="site">', 1)
        return data

    def send_text(self, text: str, ctype: str, status=200, cache="public, max-age=600"):
        body = text.encode()
        self._gzipped = False
        body = self.gz(body, ctype)
        self.send_response(status)
        self.send_header("content-type", ctype)
        if self._gzipped:
            self.send_header("content-encoding", "gzip")
            self.send_header("vary", "Accept-Encoding")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", cache)
        self.end_headers()
        self.wfile.write(body)
        return None

    def ticket_keys(self):
        return [k.strip() for k in (self.headers.get("x-ticket-keys") or "").split(",") if k.strip()][:20]

    def send_upload(self, f):
        if not f.is_file():
            return self.send_json({"error": "فایل پیدا نشد"}, 404)
        data = f.read_bytes()
        ctype = "application/pdf" if data[:4] == b"%PDF" else "image/png" if data[:4] == b"\x89PNG" else "image/webp" if data[8:12] == b"WEBP" else "image/jpeg"
        self.send_response(200)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(data)))
        self.send_header("cache-control", "no-store")
        self.send_header("x-content-type-options", "nosniff")
        self.end_headers()
        self.wfile.write(data)
        return None

    def user(self):
        return self.app.billing.user_by_token(self.headers.get("x-user-token"))

    def page_user(self):
        """کاربرِ درخواستِ صفحه (نه API): توکن در کوکی fy_t که خود سایت از localStorage می‌گذارد؛
        فقط برای ساختن صفحه با دادهٔ درست (مشترک بدون قفل) از همان اول، تا قفل‌ها اول نیایند و بعد نپرند."""
        raw = self.headers.get("cookie") or ""
        m = re.search(r"(?:^|;\s*)fy_t=([A-Za-z0-9_\-]{20,80})", raw)
        try:
            return self.app.billing.user_by_token(m.group(1)) if m else None
        except Exception:  # noqa: BLE001
            return None

    def client_ip(self) -> str:
        """نشانی واقعی کاربر؛ پشت وب‌سرور (Caddy/Nginx) از سرآیند X-Forwarded-For."""
        # فقط وقتی درخواست از وب‌سرور محلی (Caddy) آمده، به سرآیند اعتماد می‌شود؛ و آخرین نشانی (که خود Caddy
        # افزوده) برداشته می‌شود، نه اولی که کاربر می‌تواند جعل کند و با آن محدودیت‌ها را دور بزند
        peer = self.client_address[0]
        if peer not in ("127.0.0.1", "::1"):
            return peer
        hops = [h.strip() for h in (self.headers.get("x-forwarded-for") or "").split(",") if h.strip()]
        return hops[-1] if hops else peer

    def is_local(self) -> bool:
        """درخواست از خود همین رایانه است، نه از اینترنت (پشت وب‌سرور همیشه X-Forwarded-For دارد)."""
        return not self.headers.get("x-forwarded-for") and self.client_address[0] in ("127.0.0.1", "::1")

    def base_url(self):
        # نشانی متعارف بدون www تا گوگل دو نسخه از یک صفحه نبیند
        host = (self.headers.get("host") or "127.0.0.1:8000").lower()
        if host.startswith("www."):
            host = host[4:]
        proto = self.headers.get("x-forwarded-proto") or "http"
        return f"{proto}://{host}"

    # ---------------------------------------------------------- routing
    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        qs = {k: v[-1] for k, v in urllib.parse.parse_qs(url.query).items()}
        try:
            if url.path == "/pay/callback":
                return self.pay_callback(qs)
            m = re.fullmatch(r"/tiles/(osm|sat)/(\d{1,2})/(\d{1,7})/(\d{1,7})\.png", url.path)
            if m:
                if self.limited("tile"):
                    return None
                return self.tile_proxy(m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4)))
            if url.path == "/img":
                if self.limited("img"):
                    return None
                return self.image_proxy(qs.get("u") or "", qs.get("w") or "")
            if url.path.startswith("/api/"):
                if not url.path.startswith("/api/admin/") and self.limited("api"):
                    return None
                return self.api_get(url.path, qs)
            if not url.path.startswith("/assets/") and self.limited("page"):
                return None
            if not url.path.startswith("/assets/"):
                try:
                    self.app.analytics.bot_hit(self.headers.get("user-agent") or "")
                except Exception:  # noqa: BLE001
                    pass
            if url.path == "/boot/regions.js":
                ver, js = sitepage.regions_js(self.app)
                # نسخهٔ درست: یک سال در مرورگر؛ نسخهٔ کهنه یا بدون نسخه: داده تازه ولی بدون کش طولانی
                return self.send_text(js.decode(), "application/javascript; charset=utf-8",
                                      cache="public, max-age=31536000, immutable" if qs.get("v") == ver else "no-cache")
            if url.path == "/robots.txt":
                return self.send_text(seo.robots(self.base_url()), "text/plain; charset=utf-8")
            if url.path in ("/llms.txt", "/llms-full.txt"):
                key = (self.base_url(), url.path)
                if LLMS.get(key, (0,))[0] < time.time() - 1800:
                    LLMS[key] = (time.time(), seo.llms(self.app, self.base_url(), full=url.path == "/llms-full.txt"))
                return self.send_text(LLMS[key][1], "text/markdown; charset=utf-8")
            if re.fullmatch(r"/[0-9a-f]{32}\.txt", url.path) and url.path[1:-4] == seo.indexnow_key(self.app.store):
                return self.send_text(url.path[1:-4], "text/plain; charset=utf-8")
            msm = re.fullmatch(r"/sitemap(?:-(pages|places|ads))?\.xml", url.path)
            if msm:
                key = self.base_url()
                if SITEMAP.get("key") != key or time.time() - SITEMAP.get("at", 0) > 600:
                    SITEMAP.update(key=key, at=time.time(), xml=seo.sitemap(self.app, key))
                return self.send_text(SITEMAP["xml"][msm.group(1) or "index"], "application/xml; charset=utf-8")
            # صفحه‌های سایت اصلی: دادهٔ واقعی (آمار، محله‌ها، فرصت‌ها) در خود HTML گذاشته می‌شود
            SITE_PAGES = {"/": ("index.html", "home"), "/index.html": ("index.html", "home"),
                          "/sky.html": ("sky.html", "sky"), "/property.html": ("property.html", "property"),
                          "/maghale/asansor-arzesh": ("floors.html", "article")}
            # صفحهٔ هر آگهی همان صفحهٔ کامل سایت قبلی است (مشخصات، ارزش‌گذاری، نمودارها، نمایشگر عکس)
            if url.path == "/property.html" and qs.get("id"):
                return self.redirect("/ad/" + urllib.parse.quote(qs["id"]))
            mad = None
            if url.path in SITE_PAGES or mad:
                fname, page = SITE_PAGES[url.path] if not mad else ("property.html", "property")
                if mad:
                    qs = {**qs, "id": mad.group(1)}
                data = sitepage.boot(self, page, qs)
                if page == "property" and mad and not data.get("property"):
                    return self.send_text("<!doctype html><meta charset=utf-8><title>یافت نشد</title><p>این آگهی پیدا نشد. <a href='/'>صفحهٔ اصلی</a></p>",
                                          "text/html; charset=utf-8", status=404, cache="no-cache")
                body = sitepage.inject(self.versioned((ROOT / fname).read_bytes()), data).decode()
                # فهرست محله‌ها فایل جدا و ماندگار در کش، درست پیش از data.js (پس از نمایش صفحه)
                body = body.replace('<script src="/assets/site/js/data.js', f'<script src="/boot/regions.js?v={sitepage.regions_js(self.app)[0]}"></script>\n  <script src="/assets/site/js/data.js', 1)
                ua = self.headers.get("user-agent") or ""
                if page == "home" and self.base_url().startswith("https://") and sitepage.cached("public-base", 3600, lambda: self.app.store.get_setting("public_base")) != self.base_url():
                    self.app.store.set_setting("public_base", self.base_url())   # برای گزارش IndexNow
                    sitepage._CACHE["public-base"] = (time.time(), self.base_url())
                if page == "home" and re.search(r"bot|crawl|spider|slurp|lighthouse|pagespeed|headless|gtmetrix|preview", ua, re.I):
                    body = sitepage.html_class(body, "intro-fast")   # خزنده‌ها و ابزارهای سنجش سرعت پردهٔ ابتدایی را نمی‌بینند
                if page == "home":
                    # شمارنده‌های بالای صفحه با عدد واقعی در خود HTML (نه «۰» تا اجرای اسکریپت)
                    stt = data.get("stats") or {}
                    body = re.sub(r'data-count="0" data-stat="(\w+)" data-suffix="">۰</b>',
                                  lambda m: f'data-count="{int(stt.get(m.group(1)) or 0)}" data-stat="{m.group(1)}" data-suffix="">{sitepage.fa_num(int(stt.get(m.group(1)) or 0))}</b>', body)
                    body = body.replace("<!--FM_ARTICLES-->", sitepage.articles_html(self.app), 1)
                    body = body.replace("<!--FM_VIDEO-->", sitepage.video_html(self.app), 1)   # تنظیمات سایت از کش ۶۰ ثانیه‌ای
                # سربرگ سئو (عنوان، توضیح، پیوند متعارف، دادهٔ ساختاریافته) و متن کامل برای خزنده‌ها و دستیارهای هوش مصنوعی؛
                # متن برای کاربر جمع است و با یک کلیک باز می‌شود
                # صفحهٔ «قیمت از دید آسمان» عنوان و پیوند متعارف خودش را دارد (نه سئوی صفحهٔ اصلی)
                sp = (sitepage.cached("seo-home|" + self.base_url(), 120, lambda: seo.page(self.app, self.base_url(), "/")) if page == "home"
                      else seo.page(self.app, self.base_url(), url.path if mad else "") if page not in ("sky", "article") else None)
                if page == "article":
                    ar = self.app.store.q("SELECT * FROM articles WHERE slug='asansor-arzesh'", one=True)
                    vid = seo.article_video(dict(ar) if ar else {}, "آسانسور ارزش")
                    body = body.replace("<!--FM_ART_VIDEO-->", vid, 1)
                if page == "article":   # مقالهٔ تعاملی: پیوند متعارف و دادهٔ ساختاریافتهٔ مقاله
                    ld = json.dumps({"@context": "https://schema.org", "@type": "Article", "headline": "آسانسور ارزش: هر طبقه و هر جهت ساختمان چقدر می‌ارزد؟",
                                     "inLanguage": "fa-IR", "mainEntityOfPage": self.base_url() + url.path,
                                     "publisher": {"@type": "Organization", "name": "فرصت ملک"}}, ensure_ascii=False)
                    body = body.replace("</head>", f'  <link rel="canonical" href="{self.base_url()}{url.path}" />\n  <script type="application/ld+json">{ld}</script>\n</head>', 1)
                if page == "sky":   # پیوند متعارف برای صفحهٔ قیمت محله‌ها
                    body = body.replace("</head>", f'  <link rel="canonical" href="{self.base_url()}/sky.html" />\n</head>', 1)
                if sp:
                    body = seo.render(body, {**sp, "hash": ""}, VERSION)
                    fold = (f'<section class="seo-text" id="seoText"><div class="wrap"><details class="seo-fold"><summary>'
                            f'{"دربارهٔ بازار ملک و فرصت‌های امروز" if page == "home" else "خلاصهٔ تحلیل این آگهی"}'
                            f'<small>برای خواندن کامل بزنید</small></summary><div class="seo-fold__body">{sp["body"]}</div></details></div></section>\n')
                    body = body.replace('<footer class="foot', fold + '    <footer class="foot', 1)
                return self.send_text(body, "text/html; charset=utf-8", cache="private, no-cache")
            p = seo.page(self.app, self.base_url(), url.path) if not url.path.startswith(("/assets/", "/admin")) else None
            if p is not None and p.get("redirect"):
                self.send_response(301)
                self.send_header("location", urllib.parse.quote(p["redirect"], safe="/"))
                self.end_headers()
                return None
            if p is not None:
                tpl = self.page_html((ROOT / "app.html").read_bytes()).decode()
                body = seo.render(tpl, p, VERSION)
                mad = re.fullmatch(r"/ad/([\w-]+)", url.path)
                if mad:
                    # دادهٔ آگهی همراه خود صفحه می‌آید (یک رفت‌وبرگشت کمتر) و جای صفحه تا آماده شدن اسکلت خاکستری است، نه متن خام
                    pu = self.page_user()
                    pre = self.listing_payload(mad.group(1), pu)
                    if pre:
                        js = json.dumps({"id": mad.group(1), "data": pre}, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
                        body = body.replace("</head>", f"<script>window.AD_PRELOAD={js};</script>\n</head>", 1)
                    if pu and pu.get("active"):
                        body = sitepage.mark_sub(body)
                    body = body.replace('<main id="view" tabindex="-1"></main>',
                                        '<main id="view" tabindex="-1"><div class="wrap ad"><div class="skeleton" style="height:440px;margin-top:22px"></div>'
                                        '<div class="skeleton" style="height:120px;margin-top:22px"></div></div></main>', 1)
                return self.send_text(body, "text/html; charset=utf-8", cache="private, no-cache")
            if re.fullmatch(r"/(melk|ad|rahnama|maghale)/.*", url.path):
                tpl = self.page_html((ROOT / "app.html").read_bytes()).decode()
                body = seo.render(tpl, {"title": "یافت نشد", "desc": "این صفحه پیدا نشد.", "canonical": self.base_url() + "/",
                                        "body": "<h1>این صفحه پیدا نشد</h1><p><a href=\"/\">بازگشت به صفحهٔ اصلی</a></p>",
                                        "ld": [], "hash": "", "noindex": True}, VERSION)
                return self.send_text(body, "text/html; charset=utf-8", status=404)
            return self.static(url.path, versioned="v" in qs)
        except Exception as e:  # noqa: BLE001
            return self.send_json({"error": str(e)}, 500)

    def do_HEAD(self):
        """درخواست HEAD (خزنده‌ها و پایش در دسترس بودن): همان پاسخ GET بدون بدنه."""
        real = self.wfile

        class _HeadOnly:
            sent = False

            def write(self, b):
                if not _HeadOnly.sent:   # نخستین نوشتن، سرآیندهاست
                    _HeadOnly.sent = True
                    return real.write(b)
                return len(b)

            def flush(self):
                return real.flush()
        self.wfile = _HeadOnly()
        try:
            self.do_GET()
        finally:
            self.wfile = real

    def do_POST(self):
        url = urllib.parse.urlsplit(self.path)
        if self.limited("post"):
            return None
        try:
            data = self.body()
            if url.path == "/api/t":   # آمار بازدید (بدون IP)؛ حداکثر ۶۰ رویداد در دقیقه از هر نشانی
                if not LIMITER.allow("t:" + self.client_ip(), 60, 60):
                    return self.send_json({"ok": True})
                u = None
                try:
                    u = self.user()
                except Exception:  # noqa: BLE001
                    pass
                return self.send_json(self.app.analytics.hit(data if isinstance(data, dict) else {}, self.client_ip(),
                                                              self.headers.get("user-agent") or "", (self.headers.get("host") or "").split(":")[0], bool(u)))
            if url.path == "/pay/callback":
                return self.pay_callback({**{k: v[-1] for k, v in urllib.parse.parse_qs(url.query).items()}, **data})
            return self.api_post(url.path, data)
        except ValueError as e:
            return self.send_json({"error": str(e)}, 400)
        except Exception as e:  # noqa: BLE001
            return self.send_json({"error": str(e)}, 500)

    def static(self, path, versioned=False):
        if path in ("", "/"):
            path = "/index.html"
        rel = urllib.parse.unquote(path).lstrip("/")
        target = (ROOT / rel).resolve()
        allowed = rel in PUBLIC_FILES or any(rel.startswith(d + "/") for d in PUBLIC_DIRS)
        if not allowed or ROOT not in target.parents or not target.is_file():
            self.send_response(404)
            self.end_headers()
            return
        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "image/svg+xml"):
            ctype += "; charset=utf-8"
        data = target.read_bytes()
        if rel == "app.html":
            data = self.page_html(data)
        elif rel.endswith(".html"):
            data = self.versioned(data)
        self._gzipped = False
        data = self.gz(data, ctype, key=None if rel.endswith(".html") else (rel, target.stat().st_mtime_ns))
        self.send_response(200)
        self.send_header("content-type", ctype)
        if self._gzipped:
            self.send_header("content-encoding", "gzip")
            self.send_header("vary", "Accept-Encoding")
        self.send_header("content-length", str(len(data)))
        # فایل‌های نسخه‌دار (?v=) و کتابخانه‌ها یک سال در مرورگر می‌مانند؛ بقیه هر بار بازبینی می‌شوند
        long = (versioned and not rel.endswith(".html")) or rel.startswith("assets/vendor/") or rel.startswith("assets/img/")
        # فونت، عکس و بافت‌ها (بدون نسخه) هم یک ماه می‌مانند تا هر بازدید دوباره دانلود نشوند
        media = rel.startswith("assets/") and not rel.endswith((".js", ".css", ".html", ".json"))
        self.send_header("cache-control", "public, max-age=31536000, immutable" if long else "public, max-age=2592000" if media else "no-cache")
        self.end_headers()
        self.wfile.write(data)

    @staticmethod
    def prune_imgcache(cache, cap=1_500_000_000):
        """کش عکس از ۱٫۵ گیگابایت بیشتر نشود (قدیمی‌ترها پاک می‌شوند)؛ هر ۲۰۰ ذخیره یک بار بررسی می‌شود."""
        Handler._img_writes = getattr(Handler, "_img_writes", 0) + 1
        if Handler._img_writes % 200:
            return
        files = sorted((f for f in cache.iterdir() if f.is_file()), key=lambda f: f.stat().st_mtime)
        total = sum(f.stat().st_size for f in files)
        for f in files:
            if total <= cap:
                break
            total -= f.stat().st_size
            f.unlink(missing_ok=True)

    def tile_proxy(self, style, z, x, y):
        if z > 19 or x >= 2 ** z or y >= 2 ** z:
            self.send_response(404); self.end_headers(); return None
        f = self.app.data_dir / "tilecache" / style / str(z) / str(x) / f"{y}.img"
        if not f.is_file():
            data = self.fetch_tile(style, z, x, y)
            if not data or not (data[:3] == b"\xff\xd8\xff" or data[:4] == b"\x89PNG"):
                self.send_response(404); self.send_header("cache-control", "no-store"); self.end_headers(); return None
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(data)
            Handler._tile_writes = getattr(Handler, "_tile_writes", 0) + 1
            if Handler._tile_writes % 2000 == 0:
                threading.Thread(target=self.prune_tiles, args=(self.app.data_dir / "tilecache",), daemon=True).start()
        data = f.read_bytes()
        self.send_response(200)
        self.send_header("content-type", "image/png" if data[:4] == b"\x89PNG" else "image/jpeg")
        self.send_header("content-length", str(len(data)))
        self.send_header("cache-control", "public, max-age=2592000")
        self.end_headers()
        self.wfile.write(data)
        return None

    @staticmethod
    def fetch_tile(style, z, x, y):
        from divar_client import NET, _opener, _system_proxies
        now = time.time()
        with TILE_LOCK:
            srcs = sorted(TILE_SOURCES[style], key=lambda t: TILE_HEALTH.get(t, {}).get("fail", 0))
        # منبع نقشهٔ ایرانی که مدیر در پنل گذاشته (مثلاً Map.ir با کلید خودش) همیشه اول امتحان می‌شود
        custom = ((Handler.app.store.get_setting("tiles") or {}).get("street" if style == "osm" else "sat") or "").strip() if Handler.app else ""
        if custom.startswith("https://") and "{z}" in custom:
            srcs = [custom] + [t for t in srcs if t != custom]
        proxies = [NET["proxy"]] + (["none"] if NET["proxy"] == "auto" and _system_proxies() else [])
        for tpl in srcs:
            h = TILE_HEALTH.get(tpl, {})
            if h.get("until", 0) > now:
                continue
            u = tpl.format(z=z, x=x, y=y, n=(x + y) % 4, abc="abc"[(x + y) % 3])
            req = urllib.request.Request(u, headers={"user-agent": "Mozilla/5.0 (compatible; forsatmelk.ir tile cache; +https://forsatmelk.ir)", "referer": "https://forsatmelk.ir/"})
            for proxy in proxies:
                try:
                    with _opener(proxy).open(req, timeout=6) as r:
                        data = r.read(2_000_000)
                    if data[:3] == b"\xff\xd8\xff" or data[:4] == b"\x89PNG":
                        with TILE_LOCK:
                            TILE_HEALTH[tpl] = {"fail": 0}
                        return data
                except Exception:  # noqa: BLE001
                    continue
            with TILE_LOCK:
                f = TILE_HEALTH.get(tpl, {}).get("fail", 0) + 1
                TILE_HEALTH[tpl] = {"fail": f, "until": now + 300 if f >= 4 else 0}
        return None

    @staticmethod
    def prune_tiles(root, cap=4_000_000_000):
        """کش نقشه از ۴ گیگابایت بیشتر نشود؛ کاشی‌هایی که دیرتر دیده شده‌اند پاک می‌شوند."""
        files = sorted((p for p in root.rglob("*.img")), key=lambda p: p.stat().st_mtime)
        total = sum(p.stat().st_size for p in files)
        for p in files:
            if total <= cap:
                break
            total -= p.stat().st_size
            p.unlink(missing_ok=True)

    def image_proxy(self, u, w=""):
        """عکس آگهی از طریق همین سرور، با کش روی دیسک؛ فقط از میزبان‌های عکس دیوار و شیپور."""
        import hashlib as _h
        host = (urllib.parse.urlsplit(u).hostname or "").lower()
        if not u.startswith("https://") or not re.search(r"(^|\.)(divarcdn\.com|divar\.ir|sheypoor\.com|sheypoor\.ir)$", host):
            self.send_response(404)
            self.end_headers()
            return None
        cache = self.app.data_dir / "imgcache"
        cache.mkdir(parents=True, exist_ok=True)
        f = cache / _h.sha1(u.encode()).hexdigest()
        if not f.is_file():
            from divar_client import NET, _opener, _system_proxies
            req = urllib.request.Request(u, headers={"user-agent": "Mozilla/5.0", "referer": "https://divar.ir/" if "divar" in host else "https://www.sheypoor.com/"})
            data, gone = None, False
            for proxy in [NET["proxy"]] + (["none"] if NET["proxy"] == "auto" and _system_proxies() else []):
                try:
                    with _opener(proxy).open(req, timeout=15) as r:
                        final = (urllib.parse.urlsplit(r.geturl()).hostname or "").lower()
                        if not re.search(r"(^|\.)(divarcdn\.com|divar\.ir|sheypoor\.com|sheypoor\.ir)$", final):
                            break  # تغییر مسیر به میزبان دیگر (جلوگیری از سوءاستفاده برای دسترسی به نشانی‌های داخلی)
                        data = r.read(6_000_000)
                    break
                except urllib.error.HTTPError as e:
                    gone = e.code in (404, 410)
                    break
                except Exception:  # noqa: BLE001
                    continue
            if gone:
                self.recheck_by_image(u)
            # فقط عکس واقعی (JPEG، PNG، WebP، GIF) ذخیره و نمایش داده می‌شود
            if data and not (data[:3] == b"\xff\xd8\xff" or data[:4] == b"\x89PNG" or data[8:12] == b"WEBP" or data[:4] == b"GIF8"):
                data = None
            if data:
                self.prune_imgcache(cache)
            if not data:
                self.send_response(502)
                self.end_headers()
                return None
            f.write_bytes(data)
        data = f.read_bytes()
        # نسخهٔ کوچک برای کارت‌ها (w=360/560/800): چند برابر کم‌حجم‌تر از عکس کامل؛ یک بار ساخته و کش می‌شود
        try:
            tw = int(w or 0)
        except ValueError:
            tw = 0
        if tw in (360, 560, 800) and webp_ok():
            tf = f.with_suffix(f".w{tw}.webp")
            if not tf.is_file():
                try:
                    to_webp(data, tf, max_w=tw, quality=72)
                except Exception:  # noqa: BLE001
                    tf = None
            if tf and tf.is_file():
                data = tf.read_bytes()
        # عکس JPEG/PNG برای مرورگرهای پشتیبان به WebP تبدیل و جدا کش می‌شود (کم‌حجم‌تر، بارگذاری سریع‌تر)
        if data[8:12] != b"WEBP" and "image/webp" in (self.headers.get("accept") or ""):
            wf = f.with_suffix(".webp")
            if not wf.is_file() and webp_ok():
                try:
                    to_webp(data, wf)
                except Exception:  # noqa: BLE001
                    pass
            if wf.is_file():
                data = wf.read_bytes()
        ctype = "image/webp" if data[8:12] == b"WEBP" else "image/png" if data[:4] == b"\x89PNG" else "image/jpeg"
        self.send_response(200)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(data)))
        self.send_header("vary", "Accept")
        self.send_header("cache-control", "public, max-age=2592000, immutable")   # عکس آگهی تغییر نمی‌کند
        self.end_headers()
        self.wfile.write(data)
        return None

    def pay_callback(self, params):
        ok = self.app.billing.callback(params)
        pid = params.get("pid") or params.get("order_id")
        if ok == "pending":   # کارت‌به‌کارت خودکار: واریز هنوز تطبیق نشده؛ صفحهٔ حساب منتظر می‌ماند و خودکار بررسی می‌کند
            return self.redirect(f"/account.html?pending={int(pid or 0)}")
        return self.redirect(f"/account.html?invoice={pid}" if ok and pid else "/account.html?" + ("paid=1" if ok else "failed=1"))

    # ---------------------------------------------------------- public api
    def gate(self, d: dict, user, full=False):

        # هر عکس یک بار: نسخهٔ کوچک و بزرگِ یک عکس (thumbnail/post، اندازه‌های مختلف) نام فایل یکسان دارند؛ نسخهٔ بزرگ نگه داشته می‌شود
        if isinstance(d.get("images"), list):
            d["images"] = sitepage.dedup_images(d["images"])[:12]
            if d["images"] and not d.get("image"):
                d["image"] = d["images"][0]
        """پیوند دیوار و جزئیات کامل ارزش‌گذاری فقط برای مشترکان فعال."""
        active = bool(user and user["active"]) or d.get("id") in self.free_ids()
        d["locked"] = not active
        # «چرا ارزان‌تر است؟»: دو عامل اصلی کاهندهٔ قیمت همین خانه (از مدل ارزش‌گذاری) و هشدار استعلام؛
        # درصد اثر فقط برای مشترکان، بقیه فقط نام عامل را می‌بینند (برآورد دقیق لو نرود)
        ex0 = d.get("explain") or {}
        if ex0 and "why" not in d:
            neg = sorted((e for e in (ex0.get("effects") or []) if isinstance(e, (list, tuple)) and len(e) == 2 and e[1] <= -0.02), key=lambda e: e[1])[:2]
            why = {"neg": [[n, round(v, 3) if active else None] for n, v in neg], "warn": bool(ex0.get("caution"))}
            if why["neg"] or why["warn"]:
                d["why"] = why
        # ادعاهای تبلیغاتی عنوان («فرصت طلایی»، «زیر قیمت»، ...) با برچسب‌های سایت قاطی نشوند
        if d.get("title") and "claims" not in d:
            raw = d["title"]
            d["title"], claims = clean_title(raw, d.get("kind"), d.get("area"), d.get("district"))
            d["claims"] = claims
            if full and d["title"] != raw:
                d["title_raw"] = raw
        if not active:
            for k in LOCKED_FIELDS + ("phone", "address", "title_raw", "settlement"):
                d.pop(k, None)
            # حذف نام خیابان و جزئیات لوکیشن از عنوان و توضیحات برای تمام آگهی‌ها تا کاربر نتواند در دیوار پیدا کند
            k_fa = {"apartment": "آپارتمان", "villa": "ویلا", "land": "زمین", "shop": "مغازه", "office": "دفتر کار", "garden": "باغ", "suite": "سوئیت"}.get(d.get("kind"), "ملک")
            a_fa = f" {int(d['area'])} متری" if d.get("area") else ""
            r_fa = f" {int(d['rooms'])} خواب" if d.get("rooms") else ""
            loc_fa = d.get("district") or d.get("city_name") or ""
            d["title"] = f"{k_fa}{a_fa}{r_fa}" + (f" (محدوده {loc_fa})" if loc_fa else "")
            d["claims"] = []
            d["description"] = "🔒 نام خیابان، آدرس دقیق، توضیحات مالک، شماره تماس و لینک مستقیم آگهی اصلی ویژهٔ اعضای دارای اشتراک است. با تهیه اشتراک به تمامی مشخصات و لینک منبع دسترسی خواهید داشت."
            if isinstance(d.get("feat"), dict):
                d["feat"].pop("address", None)
            if isinstance(d.get("attributes"), list):
                d["attributes"] = [a for a in d["attributes"] if "آدرس" not in str(a) and "خیابان" not in str(a)]
            if d.get("lat") is not None:
                d["lat"], d["lng"], d["latlng_exact"] = round(d["lat"], 2), round(d["lng"], 2), 0
            ex = d.get("explain") or {}
            if full:
                keep = ("estimated_profit", "base_ppm", "fair_low", "fair_high", "adj", "effects", "district_n", "city_n", "filled", "label", "district_median", "district_raw_n", "wide", "disagree", "rank", "rank_n", "trust_score", "sellers", "spatial", "caution", "sus", "flags", "deed_weak", "unknown")
                d["explain"] = {**{k: ex.get(k) for k in keep}, "effects_count": len(ex.get("effects") or [])}
                if ex.get("presale"):  # مشخصات پیش‌فروش بله، مرجع قیمت و نسبت (که قیمت منصفانه را لو می‌دهد) نه
                    d["explain"]["presale"] = {k: ex["presale"].get(k) for k in ("months", "months_assumed", "progress", "installments")}
        else:
            d.pop("token", None)
            disp = {**DEFAULT_DISPLAY, **(self.app.store.get_setting("display") or {})}
            agency = (d.get("feat") or {}).get("agency") == 1 or (d.get("seller_type") or "").lower() in ("business", "real-estate-business", "shop")
            if disp["contact_mode"] == "none" or (disp["contact_mode"] == "owner" and agency):
                d.pop("phone", None)
            if not disp["show_address"]:
                d.pop("address", None)
            d["contact_mode"] = disp["contact_mode"]
        return d

    def queue_recheck(self, ids):
        """آگهی‌ها در صف بازبینی فوری؛ اگر در منبع حذف شده باشند وضعیتشان «حذف‌شده» می‌شود و از سایت می‌روند."""
        a = self.app
        again = a.store.get_setting("recheck_wanted") or []
        new = [i for i in ids if i not in again]
        if new:
            a.store.set_setting("recheck_wanted", (new + again)[:300])
            a.ingest.poke()

    def recheck_by_image(self, u):
        """عکس آگهی در دیوار/شیپور دیگر نیست: معمولاً یعنی آگهی حذف شده؛ آگهی‌های صاحب این عکس بازبینی می‌شوند."""
        name = urllib.parse.urlsplit(u).path.rsplit("/", 1)[-1]
        if len(name) < 8 or "%" in name:
            return
        now = int(time.time())
        rows = self.app.store.q("""SELECT id FROM listings WHERE status='active' AND (images LIKE ? OR image LIKE ?)
                                   AND COALESCE(checked_at, detail_at, 0) < ? LIMIT 5""",
                                (f"%{name}%", f"%{name}%", now - 3600))
        self.queue_recheck([r["id"] for r in rows])

    def listing_payload(self, lid, u):
        """دادهٔ کامل صفحهٔ یک آگهی (همان پاسخ /api/listing) برای کاربر u؛ None اگر نبود."""
        a = self.app
        d = a.store.get(lid)
        if not d or (d["hidden"] and not self.is_admin()):
            return None
        d["verdict"] = a.store.verdict(d)
        d["history"] = a.store.history(d["id"])
        if not d.get("detail_at") and d.get("source") in ("divar", "sheypoor"):
            wanted = a.store.get_setting("detail_wanted") or []  # عکس و مشخصات این آگهی در نوبت اول دریافت
            if d["id"] not in wanted:
                a.store.set_setting("detail_wanted", ([d["id"]] + wanted)[:200])
                a.ingest.poke()
            d["detail_pending"] = True
        elif d.get("status") == "active" and d.get("source") in ("divar", "sheypoor") \
                and time.time() - (d.get("checked_at") or d.get("detail_at") or 0) > 12 * 3600:
            self.queue_recheck([d["id"]])  # آگهی باز شد و مدتی بازبینی نشده: شاید در منبع حذف شده باشد
        d["similar"] = [self.gate(x, u) for x in self.similar(d)]
        if d.get("excluded"):
            d["excluded_reasons"] = (d.get("explain") or {}).get("flags", [])
        return self.gate(d, u, full=True)

    def free_ids(self):
        return set()

    def similar(self, d):
        """مشابه‌ها: همان محله و نوع و معامله، هم‌خواب، نزدیک‌ترین متراژ؛ هر کدام با قیمت محلهٔ خودش."""
        s = self.app.store
        base = {"city": d["city_key"], "deal": d["deal"], "kinds": d.get("kind") or "", "limit": 60, "sort": "score", "_lite": 1}
        pool = []
        if d.get("district"):
            pool = s.search({**base, "district": d["district"], **({"rooms": d["rooms"]} if d.get("rooms") is not None else {})})["items"]
            if len(pool) < 4:
                pool = s.search({**base, "district": d["district"]})["items"]
        if len(pool) < 4:
            pool = s.search(base)["items"]
        pool = [x for x in pool if x["id"] != d["id"]]
        pool.sort(key=lambda x: abs((x.get("area") or 0) - (d.get("area") or 0)))
        out = pool[:6]
        for x in out:
            x.pop("explain", None)
            x.pop("feat", None)
            x.pop("attributes", None)
        return out

    def api_get(self, path, qs):
        a = self.app
        if path == "/api/config":
            return self.send_json(a.public_config(self.is_local()))
        if path == "/api/pay/bezan/hook":
            return self.api_post(path, {})
        if path == "/api/pay/check":
            # خریدار منتظر تطبیق کارت‌به‌کارت خودکار است؛ وضعیت فقط برای صاحب پرداخت
            u = self.user()
            if not u:
                return self.send_json({"error": "ابتدا وارد شوید"}, 401)
            pid = int(qs.get("pid") or 0)
            pay = a.store.q("SELECT gateway FROM payments WHERE id=? AND phone=?", (pid, u["phone"]), one=True)
            if not pay:
                return self.send_json({"error": "پرداخت پیدا نشد"}, 404)
            st = a.billing.bezan_check(pid) if pay["gateway"] == "bezan" else "missing"
            return self.send_json({"status": st})
        if path == "/api/pay/invoice":
            u = self.user()
            if not u:
                return self.send_json({"error": "ابتدا وارد شوید"}, 401)
            return self.send_json(a.billing.invoice(u["phone"], qs.get("pid")))
        if path == "/api/me":
            return self.send_json({"user": self.user()})
        if path == "/api/alerts":
            u = self.user()
            if not u:
                return self.send_json({"error": "ابتدا وارد شوید"}, 401)
            return self.send_json(a.alerts.mine(u["phone"]))
        if path == "/api/listings":
            u = self.user()
            sub = bool(u and u["active"])
            qs = dict(qs); qs.pop("_lite", None)
            if qs.get("sus") and not sub:
                qs.pop("sus")
            r = a.store.search(qs)
            free = int(a.billing.cfg().get("free_results") or 0)
            offset = int(qs.get("offset") or 0)
            if not sub and not qs.get("ids") and free:
                keep = max(0, free - offset)
                r["locked_more"] = max(0, r["total"] - free)
                r["items"] = r["items"][:keep]
                r["free_results"] = free
            r["sub"] = sub
            for d in r["items"]:
                self.gate(d, u)
                ex = d.get("explain") or {}
                d["signals"] = {"ctx": len(ex.get("ctx") or []), "caution": len(ex.get("caution") or []),
                                "fake": "عکس‌ها مال این ملک نیست" in (ex.get("sus") or [])}
                if d.get("label") == "sus":
                    d["sus_reason"] = "، ".join(ex.get("flags") or [])
                d.pop("attributes", None)
                d.pop("feat", None)
                d.pop("explain", None)
            return self.send_json(r)
        if path == "/api/stats":   # آمار سنگین کل جدول: ۶۰ ثانیه نگه داشته می‌شود
            return self.send_json(sitepage.cached("api-stats", 60, a.store.stats))
        if path == "/api/page":  # راهنماها و مقاله‌ها برای نمایش درون برنامه
            p = seo.page(a, self.base_url(), qs.get("path") or "")
            if not p or p.get("kind") != "content":
                return self.send_json({"error": "یافت نشد"}, 404)
            return self.send_json({"title": p["title"], "body": p["body"]})

        if path == "/api/tickets":
            u = self.user()
            return self.send_json({"items": a.support.mine(u["phone"] if u else None, self.ticket_keys())})
        m = re.fullmatch(r"/api/ticket-img/(\d+)", path)
        if m:
            tid = a.support.image_owner(m.group(1))
            u = self.user()
            if not tid or not a.support.owns(tid, u["phone"] if u else None, self.ticket_keys()):
                return self.send_json({"error": "یافت نشد"}, 404)
            return self.send_upload(a.data_dir / "tickets" / f"{int(m.group(1))}.img")
        if path == "/api/districts":
            if qs.get("city") not in catalog.CITY_BY_KEY:
                return self.send_json({"items": []})
            return self.send_json({"items": a.store.districts(qs["city"], qs.get("deal") or None)})
        if path == "/api/estimate":
            return self.send_json(estimate_value(a.store, qs))
        if path == "/api/district_map":
            if qs.get("city") not in catalog.CITY_BY_KEY:
                return self.send_json({"districts": []})
            from report import district_map
            return self.send_json(sitepage.cached("dmap-" + qs["city"], 300, lambda: district_map(a.store, qs["city"])))
        if path == "/api/market":
            out = {"rows": a.store.market_rows(qs.get("city"))}
            if qs.get("city") in catalog.CITY_BY_KEY:
                out["report"] = market_report(a.store, qs["city"], qs.get("deal") if qs.get("deal") in ("sale", "rent") else "sale",
                                              qs.get("kind") if qs.get("kind") in ("apartment", "villa", "land", "commercial") else "apartment")
            return self.send_json(out)
        m = re.fullmatch(r"/api/listing/([\w-]+)", path)
        if m:
            d = self.listing_payload(m.group(1), self.user())
            if not d:
                return self.send_json({"error": "یافت نشد"}, 404)
            return self.send_json(d)
        if path.startswith("/api/admin/"):
            if not self.is_admin():
                return self.send_json({"error": "ورود لازم است"}, 401)
            return self.admin_get(path, qs)
        return self.send_json({"error": "مسیر نامعتبر"}, 404)

    def api_post(self, path, data):
        a = self.app
        m_flag = re.fullmatch(r"/api/listing/([\w-]+)/flag", path)
        if m_flag:
            u = self.user()
            return self.send_json(a.flags.report(m_flag.group(1), (data or {}).get("reason") or "", u["phone"] if u else None, self.client_ip()))

        if path == "/api/auth/otp":
            if not LIMITER.allow("otp:" + self.client_ip(), OTP_PER_IP_HOUR, 3600):
                return self.send_json({"error": "درخواست کد زیاد بود؛ یک ساعت دیگر دوباره امتحان کنید"}, 429)
            if not LIMITER.allow("otp:global", OTP_GLOBAL_DAY, 86400):
                return self.send_json({"error": "سقف روزانهٔ ارسال پیامک پر شده است؛ فردا دوباره امتحان کنید"}, 429)
            return self.send_json(a.billing.send_otp(data.get("phone"), local=self.is_local(), channel=data.get("channel") or "sms"))
        if path == "/api/auth/register":
            if not LIMITER.allow("reg:" + self.client_ip(), 20, 3600):
                return self.send_json({"error": "تلاش زیاد؛ کمی بعد دوباره امتحان کنید"}, 429)
            return self.send_json(a.accounts.register(data))
        if path == "/api/auth/login":
            if not LIMITER.allow("login:" + self.client_ip(), 30, 600):
                return self.send_json({"error": "تلاش زیاد؛ چند دقیقه دیگر دوباره امتحان کنید"}, 429)
            return self.send_json(a.accounts.login(data.get("ident"), data.get("password"), self.client_ip()))
        if path == "/api/auth/reset/request":
            if not LIMITER.allow("otp:" + self.client_ip(), OTP_PER_IP_HOUR, 3600):
                return self.send_json({"error": "درخواست زیاد بود؛ یک ساعت دیگر دوباره امتحان کنید"}, 429)
            return self.send_json(a.accounts.reset_request(data.get("ident"), data.get("channel") or "sms", self.base_url(), local=self.is_local()))
        if path == "/api/auth/reset/code":
            return self.send_json(a.accounts.reset_with_code(data.get("ident"), data.get("code"), data.get("password")))
        if path == "/api/auth/reset/token":
            return self.send_json(a.accounts.reset_with_token(data.get("token"), data.get("password")))
        if path == "/api/alerts":   # هشدار فرصت‌های تازه در بله: افزودن یا حذف
            u = self.user()
            if not u:
                return self.send_json({"error": "ابتدا وارد شوید"}, 401)
            if data.get("action") == "remove":
                return self.send_json(a.alerts.remove(u["phone"], data.get("id")))
            if data.get("action") == "test":
                return self.send_json(a.alerts.test(u["phone"], "telegram" if data.get("channel") == "telegram" else "bale"))
            return self.send_json(a.alerts.add(u["phone"], data))
        if path == "/api/me/profile":
            u = self.user()
            if not u:
                return self.send_json({"error": "ابتدا وارد شوید"}, 401)
            return self.send_json(a.accounts.update_profile(u["phone"], data))
        if path == "/api/auth/verify":
            return self.send_json(a.billing.verify_otp(data.get("phone"), data.get("code")))
        if path == "/api/auth/logout":
            a.billing.logout(self.headers.get("x-user-token"))
            return self.send_json({"ok": True})
        if path == "/api/pay/bezan/hook":
            # اعلان سرور‌به‌سرور «بزن به کارت»: به محتوای آن اعتماد نمی‌شود؛ فقط امضا سنجیده و وضعیت از API خوانده می‌شود
            q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(self.path).query))
            pid = int(q.get("pid") or 0)
            import hmac as _hm
            if not pid or not _hm.compare_digest(q.get("sig") or "", a.billing.bezan_sig(pid)):
                return self.send_json({"error": "امضای نامعتبر"}, 403)
            return self.send_json({"ok": True, "status": a.billing.bezan_check(pid)})
        if path == "/api/pay/start":
            u = self.user()
            if not u:
                return self.send_json({"error": "ابتدا وارد شوید"}, 401)
            return self.send_json(a.billing.start(u["phone"], data.get("plan"), self.base_url() + "/pay/callback", local=self.is_local(), method=data.get("method")))
        if path == "/api/pay/receipt":
            u = self.user()
            if not u:
                return self.send_json({"error": "ابتدا وارد شوید"}, 401)
            img = decode_upload(data.get("image"))
            return self.send_json(a.billing.card_receipt(u["phone"], data.get("payment_id"), data.get("tracking"), img, a.data_dir / "receipts"))
        if path == "/api/tickets":
            u = self.user()
            ip = self.client_ip()
            recent = [t for t in TICKET_IPS.get(ip, []) if t > time.time() - 3600]
            r = a.support.create(u["phone"] if u else data.get("phone"), data.get("category"), data.get("body"),
                                 decode_upload(data.get("image")), guest=not u, ip_recent=len(recent))
            TICKET_IPS[ip] = recent + [time.time()]
            return self.send_json(r)
        m = re.fullmatch(r"/api/tickets/(\d+)/(reply|seen)", path)
        if m:
            u = self.user()
            if not a.support.owns(m.group(1), u["phone"] if u else None, self.ticket_keys()):
                return self.send_json({"error": "یافت نشد"}, 404)
            if m.group(2) == "seen":
                a.support.seen_user(m.group(1))
                return self.send_json({"ok": True})
            return self.send_json(a.support.reply_user(m.group(1), data.get("body"), decode_upload(data.get("image"))))
        if path == "/api/admin/setup":
            if a.store.get_setting("admin"):
                return self.send_json({"error": "رمز قبلاً تعیین شده است"}, 403)
            pw = data.get("password") or ""
            if len(pw) < 6:
                raise ValueError("رمز دست‌کم ۶ نویسه باشد")
            salt = secrets.token_hex(8)
            a.store.set_setting("admin", {"salt": salt, "hash": hash_pw(pw, salt)})
            return self.login_ok()
        if path == "/api/admin/login":
            ip = self.client_ip()
            fails = [t for t in LOGIN_FAILS.get(ip, []) if t > time.time() - 600]
            if len(fails) >= 8:
                return self.send_json({"error": "تلاش زیاد؛ ده دقیقه دیگر امتحان کنید"}, 429)
            adm = a.store.get_setting("admin")
            if not adm:
                return self.send_json({"error": "ابتدا رمز را تعیین کنید", "setup": True}, 403)
            if secrets.compare_digest(hash_pw(data.get("password") or "", adm["salt"]), adm["hash"]):
                LOGIN_FAILS.pop(ip, None)
                return self.login_ok()
            LOGIN_FAILS[ip] = fails + [time.time()]
            return self.send_json({"error": "رمز نادرست است"}, 403)
        if path.startswith("/api/admin/"):
            if not self.is_admin():
                return self.send_json({"error": "ورود لازم است"}, 401)
            return self.admin_post(path, data)
        return self.send_json({"error": "مسیر نامعتبر"}, 404)

    def login_ok(self):
        tok = secrets.token_urlsafe(24)
        SESSIONS[tok] = time.time() + 8 * 3600
        return self.send_json({"ok": True, "token": tok})

    # ---------------------------------------------------------- admin api
    def admin_get(self, path, qs):
        a, s = self.app, self.app.store
        if path == "/api/admin/state":
            cfg = a.ingest.cfg()
            feeds = [dict(r) for r in s.q("SELECT * FROM feeds ORDER BY city_key, category")]
            for f in feeds:
                f.pop("cursor", None)
            now = int(time.time())
            return self.send_json({
                **a.public_config(),
                "ingest": cfg, "status": a.ingest.state,
                "hour": s.requests_in_last(3600, ads_only=True), "day": s.requests_in_last(86400, ads_only=True),
                "feeds": feeds,
                "log": [dict(r) for r in s.q("SELECT * FROM requests_log ORDER BY at DESC LIMIT 60")],
                "stats": s.stats(),
                "sheypoor_cats": (s.get_setting("sheypoor_map") or {}).get("categories") or [],
                "images": dict(s.q("SELECT COUNT(*) n, SUM(image IS NOT NULL AND image != '') w FROM listings WHERE status='active'", one=True)),
                "by_source": {r["source"]: r["n"] for r in s.q("SELECT source, COUNT(*) n FROM listings WHERE status='active' GROUP BY source")},
                "city_ids": {**{c["key"]: c["divar_id"] for c in catalog.CITIES if c["divar_id"]}, **(s.get_setting("city_ids") or {})},
                "catalog": {"cities": [c for c in catalog.CITIES if c["province"] in a.ingest.expansion()["active"]],
                            "categories": catalog.CATEGORIES,
                            "provinces": {k: v for k, v in catalog.PROVINCES.items() if k in a.ingest.expansion()["active"]},
                            "all_provinces": catalog.PROVINCES},
                "expansion": a.ingest.expansion(), "province_progress": a.ingest.province_progress(),
                "pending_details": s.q("SELECT COUNT(*) n FROM listings WHERE source IN ('divar','sheypoor') AND detail_at IS NULL AND status='active'", one=True)["n"],
                "tickets_unread": a.support.unread_admin(), "flags": a.flags.counts(), "sms_last_notify": s.get_setting("sms_last_notify"),
                "billing": {**a.billing.cfg(), "bezan_api_key": "•••" if a.billing.cfg().get("bezan_api_key") else ""}, "sms": {**a.billing.sms_cfg(), "api_key": "•••" if a.billing.sms_cfg()["api_key"] else ""},
                "bale": {**a.bale.cfg(), "token": "•••" if a.bale.cfg()["token"] else "", "provider_token": "•••" if a.bale.cfg()["provider_token"] else ""},
                "bale_state": {**a.bale.state, "links": s.q("SELECT COUNT(*) n FROM bale_links", one=True)["n"]},
                "telegram": {**a.telegram.cfg(), "token": "•••" if a.telegram.cfg()["token"] else ""},
                "telegram_state": {**a.telegram.state, "links": s.q("SELECT COUNT(*) n FROM tg_links", one=True)["n"],
                                   "alerts": s.q("SELECT COUNT(*) n FROM alerts WHERE active=1 AND channel='telegram'", one=True)["n"]},
                "tiles": s.get_setting("tiles") or {"street": "", "sat": ""},
                "email": {**a.mailer.cfg(), "password": "•••" if a.mailer.cfg()["password"] else ""}, "email_last": s.get_setting("email_last"),
                "geo": {"stats": s.get_setting("geo_stats") or {}, "centers": len(s.get_setting("district_centers") or {}),
                        "districts": s.q("SELECT COUNT(*) n FROM (SELECT DISTINCT city_key, district FROM listings WHERE vertical='estate' AND status='active' AND district IS NOT NULL AND district != '')", one=True)["n"]},
                "thresholds": {**DEFAULT_THRESHOLDS, **(s.get_setting("thresholds") or {})},
                "display_full": {**DEFAULT_DISPLAY, **(s.get_setting("display") or {})},
                "owner": {**DEFAULT_OWNER, **(s.get_setting("owner") or {})},
                "valuation_full": s.get_setting("valuation_info"),
                "users": {"total": s.q("SELECT COUNT(*) n FROM users", one=True)["n"],
                          "active": s.q("SELECT COUNT(*) n FROM users WHERE sub_until>?", (now,), one=True)["n"]},
                "revenue": s.q("SELECT COALESCE(SUM(amount),0) t, COUNT(*) n FROM payments WHERE status='paid' AND gateway!='test'", one=True)["t"],
            })
        if path == "/api/admin/listings":
            where, args = "1=1", []
            if qs.get("q"):
                where = "(title LIKE ? OR id LIKE ?)"
                args = [f"%{qs['q']}%", f"%{qs['q']}%"]
            if qs.get("excluded"):
                where += " AND excluded=1"
            rows = [s.row_to_dict(r) for r in s.q(f"SELECT id,title,city_name,district,deal,kind,pp,area,status,hidden,featured,excluded,flags,explain,score,discount,fair_price,first_seen,url FROM listings WHERE {where} ORDER BY first_seen DESC LIMIT 200", args)]
            ov = set(s.get_setting("overrides") or [])
            for r in rows:
                r["override"] = r["id"] in ov
            return self.send_json({"items": rows})
        if path == "/api/admin/users":
            return self.send_json({
                "users": [dict(r) for r in s.q("SELECT * FROM users ORDER BY created DESC LIMIT 300")],
                "payments": [dict(r) for r in s.q("SELECT * FROM payments ORDER BY created DESC LIMIT 300")],
            })
        m = re.fullmatch(r"/api/admin/receipt/(\d+)", path)
        if m:
            return self.send_upload(a.data_dir / "receipts" / f"{int(m.group(1))}.img")
        m = re.fullmatch(r"/api/admin/ticket-img/(\d+)", path)
        if m:
            return self.send_upload(a.data_dir / "tickets" / f"{int(m.group(1))}.img")
        if path == "/api/admin/flags":
            return self.send_json({"items": a.flags.queue(), "counts": a.flags.counts()})
        if path == "/api/admin/articles":
            return self.send_json({"items": seo.articles_list(s, 500, all_=True)})
        if path == "/api/admin/tickets":
            return self.send_json({"items": a.support.admin_list(qs.get("status") or None), "support": a.support.cfg()})
        return self.send_json({"error": "مسیر نامعتبر"}, 404)

    def admin_post(self, path, data):
        a, s = self.app, self.app.store
        if path == "/api/admin/settings":
            if isinstance(data.get("display"), dict) and data["display"].get("contact_mode") not in (None, "none", "owner", "all"):
                raise ValueError("حالت نمایش شماره نامعتبر است")
            if isinstance(data.get("billing"), dict) and data["billing"].get("bezan_api_key") in ("•••", None):
                data["billing"].pop("bezan_api_key", None)   # کلید ذخیره‌شده با مقدار پوشیده بازنویسی نشود
            for key, default in (("site", DEFAULT_SITE), ("display", DEFAULT_DISPLAY), ("billing", DEFAULT_BILLING)):
                if isinstance(data.get(key), dict):
                    clean = {k: v for k, v in data[key].items() if k in default}
                    if key == "site" and "videos" in clean:   # فهرست ویدیوها: فقط پیوند، عنوان، توضیح و وضعیت؛ حداکثر ۱۲ ردیف
                        vs = clean["videos"] if isinstance(clean["videos"], list) else []
                        clean["videos"] = [{"url": str(v.get("url") or "").strip()[:2000], "title": str(v.get("title") or "").strip()[:120],
                                            "desc": str(v.get("desc") or "").strip()[:400], "on": bool(v.get("on"))}
                                           for v in vs if isinstance(v, dict) and str(v.get("url") or "").strip()][:12]
                    s.set_setting(key, {**default, **(s.get_setting(key) or {}), **clean})
            if isinstance(data.get("support"), dict):
                sup = {**DEFAULT_SUPPORT, **(s.get_setting("support") or {})}
                if "auto_reply" in data["support"]:
                    sup["auto_reply"] = bool(data["support"]["auto_reply"])
                if isinstance(data["support"].get("auto_text"), dict):
                    sup["auto_text"] = {**sup.get("auto_text", {}), **{k: str(v)[:1000] for k, v in data["support"]["auto_text"].items() if k in DEFAULT_SUPPORT["auto_text"]}}
                s.set_setting("support", sup)
            if isinstance(data.get("email"), dict):
                from mailer import DEFAULT_EMAIL
                cur = {**DEFAULT_EMAIL, **(s.get_setting("email") or {})}
                new = {k: v for k, v in data["email"].items() if k in DEFAULT_EMAIL}
                if new.get("password") in ("•••", None):
                    new.pop("password", None)
                if "port" in new:
                    new["port"] = int(new["port"] or 465)
                s.set_setting("email", {**cur, **new})
            if isinstance(data.get("tiles"), dict):
                t = {k: str(data["tiles"].get(k) or "").strip()[:400] for k in ("street", "sat")}
                for k, v in t.items():
                    if v and not (v.startswith("https://") and "{z}" in v and "{x}" in v and "{y}" in v):
                        raise ValueError("نشانی منبع نقشه باید با https شروع شود و {z}، {x} و {y} داشته باشد")
                s.set_setting("tiles", t)
                TILE_HEALTH.clear()
            if isinstance(data.get("bale"), dict):
                from bale import DEFAULT_BALE
                cur = {**DEFAULT_BALE, **(s.get_setting("bale") or {})}
                new = {k: v for k, v in data["bale"].items() if k in DEFAULT_BALE}
                for k in ("token", "provider_token"):
                    if new.get(k) in ("•••", None):
                        new.pop(k, None)
                if "bot_username" in new:
                    new["bot_username"] = str(new["bot_username"]).strip().lstrip("@")
                s.set_setting("bale", {**cur, **new})
            if isinstance(data.get("telegram"), dict):
                from bale import DEFAULT_TG
                cur = {**DEFAULT_TG, **(s.get_setting("telegram") or {})}
                new = {k: v for k, v in data["telegram"].items() if k in DEFAULT_TG}
                if new.get("token") in ("•••", None):
                    new.pop("token", None)
                elif "token" in new:
                    new["token"] = str(new["token"]).strip()
                if "api_base" in new:
                    v = str(new["api_base"] or "").strip().rstrip("/")
                    if v and not re.fullmatch(r"https?://[\w.-]+(:\d+)?(/[\w./-]*)?", v):
                        return self.send_json({"error": "نشانی واسط تلگرام باید با https:// شروع شود"}, 400)
                    new["api_base"] = v
                if "bot_username" in new:
                    new["bot_username"] = str(new["bot_username"]).strip().lstrip("@")
                s.set_setting("telegram", {**cur, **new})
            if isinstance(data.get("sms"), dict):
                cur = {**DEFAULT_SMS, **(s.get_setting("sms") or {})}
                new = {k: v for k, v in data["sms"].items() if k in DEFAULT_SMS}
                if new.get("api_key") in ("•••", None):
                    new.pop("api_key", None)
                s.set_setting("sms", {**cur, **new})
            if isinstance(data.get("thresholds"), dict):
                bounds = {"max_age_days": (7, 730), "half_life_days": (7, 365), "trend_fixed": (-0.05, 0.10),
                          "presale_monthly": (0.0, 0.04), "presale_default_months": (1, 60), "presale_extra": (0.0, 0.3), "spatial_tol": (0.05, 1.0), "opp": (0.05, 0.4), "gold": (0.08, 0.5), "sus": (0.25, 0.6), "sus_flagged": (0.15, 0.6), "over": (0.2, 1.0)}
                t = {}
                for k, v in data["thresholds"].items():
                    if k not in DEFAULT_THRESHOLDS:
                        continue
                    if k == "trend_fixed" and v in (None, ""):
                        t[k] = None
                        continue
                    lo, hi = bounds.get(k, (0.0, 3.0))
                    t[k] = max(lo, min(hi, float(v)))
                t = {**DEFAULT_THRESHOLDS, **(s.get_setting("thresholds") or {}), **t}
                if not t["opp"] < t["gold"] <= t["sus"]:
                    raise ValueError("آستانه‌ها باید به ترتیب «فرصت < طلایی ≤ مشکوک» باشند")
                s.set_setting("thresholds", t)
                threading.Thread(target=a.ingest.run_valuation, daemon=True).start()
            if isinstance(data.get("owner"), dict):
                o = {k: str(v).strip()[:500] for k, v in data["owner"].items() if k in DEFAULT_OWNER}
                for k in ("support_url", "enamad_url"):
                    if o.get(k) and not re.match(r"^(https://|tel:|mailto:)", o[k]):
                        raise ValueError("پیوند باید با https:// یا tel: یا mailto: شروع شود")
                s.set_setting("owner", {**DEFAULT_OWNER, **(s.get_setting("owner") or {}), **o})
            if data.get("new_password"):
                if len(data["new_password"]) < 6:
                    raise ValueError("رمز دست‌کم ۶ نویسه باشد")
                salt = secrets.token_hex(8)
                s.set_setting("admin", {"salt": salt, "hash": hash_pw(data["new_password"], salt)})
            return self.send_json({"ok": True})
        if path == "/api/admin/ingest":
            if data.get("proxy") and data["proxy"] not in ("auto", "none") and not re.match(r"^https?://", data["proxy"]):
                raise ValueError("نشانی پروکسی باید مثل http://127.0.0.1:10809 باشد")
            cfg = {**a.ingest.cfg(), **{k: v for k, v in data.items() if k in DEFAULT_INGEST}}
            cfg["cities"] = [c for c in cfg["cities"] if c in catalog.CITY_BY_KEY]
            cfg["categories"] = [c for c in cfg["categories"] if c in catalog.CATEGORY_BY_SLUG]
            s.set_setting("ingest", cfg)
            if isinstance(data.get("city_ids"), dict):
                ids = {k: int(v) for k, v in data["city_ids"].items() if k in catalog.CITY_BY_KEY and str(v).isdigit()}
                s.set_setting("city_ids", ids)
            a.ingest.pause_until = 0
            a.ingest.poke()
            ids = {**{c["key"]: c["divar_id"] for c in catalog.CITIES if c["divar_id"]}, **(s.get_setting("city_ids") or {})}
            if cfg["mode"] in ("mcp", "direct") and cfg["enabled"] and not s.get_setting("discover_done") \
                    and any(not ids.get(k) for k in cfg["cities"]):
                a.ingest.discover_ids()  # یک‌بار: شناسهٔ شهرها برای اتصال مستقیم (فهرست مستقیم عکس دارد) در پس‌زمینه
            return self.send_json({"ok": True, "ingest": cfg})
        if path == "/api/admin/test":
            return self.send_json(a.ingest.test_connection(data.get("source") or "divar"))
        if path == "/api/admin/email-test":
            to = (data.get("to") or "").strip()
            if not to:
                return self.send_json({"ok": False, "error": "نشانی ایمیل آزمایشی را وارد کنید"})
            try:
                a.mailer.send(to, "آزمون ایمیل فرصت ملک", a.mailer._wrap("ایمیل سایت درست کار می‌کند", "<p>این یک ایمیل آزمایشی است.</p>"))
                return self.send_json({"ok": True})
            except Exception as e:  # noqa: BLE001
                return self.send_json({"ok": False, "error": str(e)[:200]})
        if path == "/api/admin/bezan-test":
            from billing import BEZAN_API, _http_json
            r = _http_json("GET", f"{BEZAN_API}/public/me", None, a.billing._bezan_headers(), timeout=15)
            if r.get("merchant_id") or r.get("store_name"):
                return self.send_json({"ok": True, "store": r.get("store_name"), "subscription": r.get("subscription")})
            return self.send_json({"ok": False, "error": r.get("detail") or r.get("error") or "پاسخ نامعتبر"})
        if path == "/api/admin/analytics":
            return self.send_json(a.analytics.report(int((data or {}).get("days") or 30)))
        if path == "/api/admin/telegram-test":
            try:
                return self.send_json({"ok": True, "bot": a.telegram.test()})
            except Exception as e:  # noqa: BLE001
                return self.send_json({"ok": False, "error": str(e)[:200]})
        if path == "/api/admin/bale-test":
            try:
                me = a.bale.test()
                return self.send_json({"ok": True, "bot": me})
            except Exception as e:  # noqa: BLE001
                return self.send_json({"ok": False, "error": str(e)[:200]})
        if path == "/api/admin/revalue":
            return self.send_json(a.ingest.run_valuation() or {"busy": True})
        if path == "/api/admin/discover":
            a.ingest.discover_ids(int(data.get("start") or 1), int(data.get("end") or 1300))
            return self.send_json({"ok": True})
        if path == "/api/admin/reset-feeds":
            s.x("DELETE FROM feeds")
            return self.send_json({"ok": True})
        if path == "/api/admin/listing":
            fields = {k: int(bool(data[k])) for k in ("hidden", "featured") if k in data}
            if fields:
                s.mark(data["id"], **fields)
            if "override" in data:
                ov = set(s.get_setting("overrides") or [])
                (ov.add if data["override"] else ov.discard)(data["id"])
                s.set_setting("overrides", sorted(ov))
                threading.Thread(target=a.ingest.run_valuation, daemon=True).start()
            return self.send_json({"ok": True})
        if path == "/api/admin/review":
            a.billing.review(data.get("id"), bool(data.get("approve")))
            return self.send_json({"ok": True})
        if path == "/api/admin/flag-review":
            a.flags.decide(str(data.get("id") or ""), bool(data.get("accept")))
            threading.Thread(target=a.ingest.run_valuation, daemon=True).start()
            return self.send_json({"ok": True})
        if path == "/api/admin/article":
            slug = seo.slugify(data.get("slug") or data.get("title") or "")
            if data.get("delete"):
                s.x("DELETE FROM articles WHERE slug=?", (slug,))
                SITEMAP.clear()
                return self.send_json({"ok": True})
            title, body = (data.get("title") or "").strip()[:200], (data.get("body") or "").strip()[:60000]
            if not slug or len(title) < 5 or len(body) < 50:
                raise ValueError("عنوان (دست‌کم ۵ نویسه) و متن (دست‌کم ۵۰ نویسه) لازم است")
            now = int(time.time())
            old = s.q("SELECT created FROM articles WHERE slug=?", (slug,), one=True)
            ck = data.get("city_key") if data.get("city_key") in catalog.CITY_BY_KEY else None
            vurl = (data.get("video_url") or "").strip()[:2000]
            if vurl and not sitepage.video_embed(vurl):
                raise ValueError("پیوند ویدیو شناخته نشد؛ نشانی صفحهٔ ویدیو در آپارات (aparat.com/v/...) یا یوتیوب را بگذارید")
            s.x("INSERT OR REPLACE INTO articles(slug,title,summary,body,city_key,published,created,updated,video_url) VALUES(?,?,?,?,?,?,?,?,?)",
                (slug, title, (data.get("summary") or "").strip()[:300], body, ck, int(bool(data.get("published", True))), old["created"] if old else now, now, vurl))
            SITEMAP.clear()
            return self.send_json({"ok": True, "slug": slug})
        if path == "/api/admin/expansion":
            exp = a.ingest.expansion()
            if "auto" in data:
                exp["auto"] = bool(data["auto"])
            if data.get("threshold") is not None:
                exp["threshold"] = min(1.0, max(0.3, float(data["threshold"])))
            if data.get("deep_pages") is not None:
                exp["deep_pages"] = min(500, max(1, int(data["deep_pages"])))
            if isinstance(data.get("order"), list):
                exp["order"] = [p for p in data["order"] if p in catalog.PROVINCES and p not in catalog.NORTH]
            if data.get("deactivate") in exp["active"] and data["deactivate"] not in catalog.NORTH:
                p = data["deactivate"]
                exp["active"].remove(p)
                cur = s.get_setting("ingest") or {}
                cur["cities"] = [c for c in (cur.get("cities") or []) if catalog.CITY_BY_KEY.get(c, {}).get("province") != p]
                s.set_setting("ingest", cur)
            s.set_setting("expansion", exp)
            if data.get("activate"):
                a.ingest.activate_province(data["activate"], "دستی از پنل")
            return self.send_json({"ok": True, "expansion": a.ingest.expansion()})
        if path == "/api/admin/ticket":
            return self.send_json(a.support.admin_reply(data.get("id"), data.get("body"), bool(data.get("close")), bool(data.get("reopen"))))
        if path == "/api/admin/grant":
            phone = data.get("phone")
            if not a.billing.user(phone):
                raise ValueError("کاربری با این شماره نیست")
            a.billing.activate(phone, data.get("plan") or "weekly")
            return self.send_json({"ok": True})
        return self.send_json({"error": "مسیر نامعتبر"}, 404)


def main():
    ap = argparse.ArgumentParser(description="سرور فرصت ملک")
    ap.add_argument("--host", default=os.environ.get("ARA_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("ARA_PORT", "8000")))
    ap.add_argument("--data", default=os.environ.get("ARA_DATA", str(ROOT / "data")))
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    Handler.app = App(Path(args.data))
    Handler.app.ingest.start()
    Handler.app.bale.start()
    Handler.app.telegram.start()
    Handler.app.alerts.start()
    threading.Thread(target=seo.indexnow_loop, args=(Handler.app,), name="indexnow", daemon=True).start()
    Handler.app.billing.start_bezan_poller()
    httpd = BoundedServer((args.host, args.port), Handler)
    url = f"http://{'127.0.0.1' if args.host in ('0.0.0.0', '') else args.host}:{args.port}"
    print("=" * 56)
    print(f"  فرصت ملک روشن شد:    {url}")
    print(f"  پنل مدیریت:          {url}/admin.html")
    print("  برای خاموش کردن، این پنجره را ببندید یا Ctrl+C بزنید.")
    print("=" * 56, flush=True)
    if not args.no_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        Handler.app.ingest.stop.set()
        httpd.server_close()


if __name__ == "__main__":
    main()
