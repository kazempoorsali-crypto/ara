"""سرور فرصت‌یاب: صفحات سایت، API آگهی‌ها و ارزش‌گذاری، عضویت و اشتراک، پنل مدیریت و دریافت تدریجی از دیوار.

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
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import catalog  # noqa: E402
from billing import DEFAULT_BILLING, DEFAULT_SMS, Billing  # noqa: E402
from ingest import DEFAULT_INGEST, Ingestor  # noqa: E402
from report import market_report  # noqa: E402
from store import Store  # noqa: E402
from valuation import DEFAULT_THRESHOLDS  # noqa: E402

DEFAULT_SITE = {"name": "فرصت‌یاب", "tagline": "قیمت منصفانه ملک در شمال", "about": "", "email": ""}
# contact_mode: none = هیچ شماره‌ای نشان داده نمی‌شود؛ owner = فقط شمارهٔ آگهی‌های شخصی (مالک)؛ all = شمارهٔ هر آگهی‌دهنده
DEFAULT_DISPLAY = {"show_samples": True, "contact_mode": "none", "show_address": True}
# اطلاعاتی که فقط مالک سایت می‌تواند بدهد؛ تا خالی است، جمله یا سطر مربوط در سایت نمایش داده نمی‌شود
DEFAULT_OWNER = {"support_url": "", "support_label": "", "legal_name": "", "refund_text": "", "enamad_url": ""}
PUBLIC_DIRS = ("assets",)
PUBLIC_FILES = ("index.html", "admin.html", "favicon.svg")
SESSIONS: dict[str, float] = {}
LOGIN_FAILS: dict[str, list] = {}
LOCKED_FIELDS = ("url", "token")


def hash_pw(pw: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 200_000).hex()


class App:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.store = Store(data_dir / "ara.db")
        self.ingest = Ingestor(self.store)
        self.billing = Billing(self.store)

    def public_config(self):
        s, b = self.store, self.billing
        return {
            "mode": "server",
            "site": {**DEFAULT_SITE, **(s.get_setting("site") or {})},
            "display": {k: v for k, v in {**DEFAULT_DISPLAY, **(s.get_setting("display") or {})}.items() if k != "contact_mode"},
            "plans": b.plans(), "payable": b.payable(), "test_payments": b.cfg()["test_mode"],
            "free_preview": int(b.cfg().get("free_preview") or 0),
            "free_results": int(b.cfg().get("free_results") or 0),
            "gateway": "card" if b.cfg()["gateway"] == "card" and not b.cfg()["test_mode"] else "online",
            "owner": {k: v for k, v in {**DEFAULT_OWNER, **(s.get_setting("owner") or {})}.items() if v},
            "thresholds": {**DEFAULT_THRESHOLDS, **(s.get_setting("thresholds") or {})},
            "updated": (s.q("SELECT MAX(last_seen) t FROM listings WHERE source IN ('divar','sheypoor')", one=True) or {"t": None})["t"],
            "sms_live": bool(b.sms_cfg()["api_key"] and b.sms_cfg()["template"]),
            "admin_ready": bool(s.get_setting("admin")),
            "valuation": s.get_setting("valuation_info") and {k: v for k, v in s.get_setting("valuation_info").items() if k != "models"},
        }


class Handler(BaseHTTPRequestHandler):
    app: App = None
    server_version = "Forsatyab/1.0"

    def log_message(self, fmt, *args):
        if os.environ.get("ARA_DEBUG"):
            super().log_message(fmt, *args)

    # ---------------------------------------------------------- io
    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False, default=str).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("cache-control", "no-store")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, location):
        self.send_response(302)
        self.send_header("location", location)
        self.end_headers()

    def body(self) -> dict:
        n = int(self.headers.get("content-length") or 0)
        if n > 8_000_000:
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

    def user(self):
        return self.app.billing.user_by_token(self.headers.get("x-user-token"))

    def base_url(self):
        host = self.headers.get("host") or "127.0.0.1:8000"
        proto = self.headers.get("x-forwarded-proto") or "http"
        return f"{proto}://{host}"

    # ---------------------------------------------------------- routing
    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        qs = {k: v[-1] for k, v in urllib.parse.parse_qs(url.query).items()}
        try:
            if url.path == "/pay/callback":
                return self.pay_callback(qs)
            if url.path == "/img":
                return self.image_proxy(qs.get("u") or "")
            if url.path.startswith("/api/"):
                return self.api_get(url.path, qs)
            return self.static(url.path)
        except Exception as e:  # noqa: BLE001
            return self.send_json({"error": str(e)}, 500)

    def do_POST(self):
        url = urllib.parse.urlsplit(self.path)
        try:
            data = self.body()
            if url.path == "/pay/callback":
                return self.pay_callback({**{k: v[-1] for k, v in urllib.parse.parse_qs(url.query).items()}, **data})
            return self.api_post(url.path, data)
        except ValueError as e:
            return self.send_json({"error": str(e)}, 400)
        except Exception as e:  # noqa: BLE001
            return self.send_json({"error": str(e)}, 500)

    def static(self, path):
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
        self.send_response(200)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(data)))
        self.send_header("cache-control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def image_proxy(self, u):
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
            data = None
            for proxy in [NET["proxy"]] + (["none"] if NET["proxy"] == "auto" and _system_proxies() else []):
                try:
                    with _opener(proxy).open(req, timeout=15) as r:
                        data = r.read(6_000_000)
                    break
                except Exception:  # noqa: BLE001
                    continue
            if not data:
                self.send_response(502)
                self.end_headers()
                return None
            f.write_bytes(data)
        data = f.read_bytes()
        ctype = "image/webp" if data[8:12] == b"WEBP" else "image/png" if data[:4] == b"\x89PNG" else "image/jpeg"
        self.send_response(200)
        self.send_header("content-type", ctype)
        self.send_header("content-length", str(len(data)))
        self.send_header("cache-control", "public, max-age=604800")
        self.end_headers()
        self.wfile.write(data)
        return None

    def pay_callback(self, params):
        ok = self.app.billing.callback(params)
        return self.redirect("/#/account?" + ("paid=1" if ok else "failed=1"))

    # ---------------------------------------------------------- public api
    def gate(self, d: dict, user, full=False):
        """پیوند دیوار و جزئیات کامل ارزش‌گذاری فقط برای مشترکان فعال."""
        active = bool(user and user["active"]) or d.get("id") in self.free_ids()
        d["locked"] = not active
        if not active:
            for k in LOCKED_FIELDS + ("fair_price", "fair_ppm", "phone", "address"):
                d.pop(k, None)
            if d.get("lat") is not None:  # موقعیت دقیق فقط برای مشترکان؛ برای بقیه حدود یک کیلومتر
                d["lat"], d["lng"], d["latlng_exact"] = round(d["lat"], 2), round(d["lng"], 2), 0
            if isinstance(d.get("verdict"), dict):
                d["verdict"].pop("fair", None)
                d["verdict"].pop("fair_ppm", None)
            ex = d.get("explain") or {}
            if full:
                keep = ("district_n", "city_n", "filled", "label", "district_median", "district_raw_n", "wide", "rank", "rank_n",
                        "ctx", "caution", "sus", "flags")
                d["explain"] = {**{k: ex.get(k) for k in keep}, "effects_count": len(ex.get("effects") or [])}
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

    def free_ids(self):
        """چند فرصت برتر که بدون اشتراک هم با جزئیات کامل نمایش داده می‌شوند."""
        n = int(self.app.billing.cfg().get("free_preview") or 0)
        if not n:
            return set()
        return {r["id"] for r in self.app.store.q(
            "SELECT id FROM listings WHERE score IS NOT NULL AND COALESCE(excluded,0)=0 AND status='active' AND hidden=0 ORDER BY score DESC LIMIT ?", (n,))}

    def similar(self, d):
        """مشابه‌ها: همان محله و نوع و معامله، هم‌خواب، نزدیک‌ترین متراژ؛ هر کدام با قیمت محلهٔ خودش."""
        s = self.app.store
        base = {"city": d["city_key"], "deal": d["deal"], "kinds": d.get("kind") or "", "limit": 60, "sort": "score"}
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
            return self.send_json(a.public_config())
        if path == "/api/me":
            return self.send_json({"user": self.user()})
        if path == "/api/listings":
            u = self.user()
            sub = bool(u and u["active"])
            qs = dict(qs)
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
        if path == "/api/stats":
            return self.send_json(a.store.stats())
        if path == "/api/districts":
            if qs.get("city") not in catalog.CITY_BY_KEY:
                return self.send_json({"items": []})
            return self.send_json({"items": a.store.districts(qs["city"], qs.get("deal") or None)})
        if path == "/api/market":
            out = {"rows": a.store.market_rows(qs.get("city"))}
            if qs.get("city") in catalog.CITY_BY_KEY:
                out["report"] = market_report(a.store, qs["city"], qs.get("deal") if qs.get("deal") in ("sale", "rent") else "sale",
                                              qs.get("kind") if qs.get("kind") in ("apartment", "villa", "land", "commercial") else "apartment")
            return self.send_json(out)
        m = re.fullmatch(r"/api/listing/([\w-]+)", path)
        if m:
            d = a.store.get(m.group(1))
            if not d or (d["hidden"] and not self.is_admin()):
                return self.send_json({"error": "یافت نشد"}, 404)
            d["verdict"] = a.store.verdict(d)
            d["history"] = a.store.history(d["id"])
            if not d.get("detail_at") and d.get("source") in ("divar", "sheypoor"):
                wanted = a.store.get_setting("detail_wanted") or []  # عکس و مشخصات این آگهی در نوبت اول دریافت
                if d["id"] not in wanted:
                    a.store.set_setting("detail_wanted", ([d["id"]] + wanted)[:200])
                    a.ingest.poke()
                d["detail_pending"] = True
            u = self.user()
            d["similar"] = [self.gate(x, u) for x in self.similar(d)]
            if d.get("excluded"):
                d["excluded_reasons"] = (d.get("explain") or {}).get("flags", [])
            return self.send_json(self.gate(d, u, full=True))
        if path.startswith("/api/admin/"):
            if not self.is_admin():
                return self.send_json({"error": "ورود لازم است"}, 401)
            return self.admin_get(path, qs)
        return self.send_json({"error": "مسیر نامعتبر"}, 404)

    def api_post(self, path, data):
        a = self.app
        if path == "/api/auth/otp":
            return self.send_json(a.billing.send_otp(data.get("phone")))
        if path == "/api/auth/verify":
            return self.send_json(a.billing.verify_otp(data.get("phone"), data.get("code")))
        if path == "/api/auth/logout":
            a.billing.logout(self.headers.get("x-user-token"))
            return self.send_json({"ok": True})
        if path == "/api/pay/start":
            u = self.user()
            if not u:
                return self.send_json({"error": "ابتدا وارد شوید"}, 401)
            return self.send_json(a.billing.start(u["phone"], data.get("plan"), self.base_url() + "/pay/callback"))
        if path == "/api/pay/receipt":
            u = self.user()
            if not u:
                return self.send_json({"error": "ابتدا وارد شوید"}, 401)
            img = None
            if data.get("image"):
                import base64
                raw = str(data["image"])
                m = re.match(r"^data:(image/(?:jpeg|png|webp)|application/pdf);base64,", raw)
                if not m:
                    raise ValueError("فقط تصویر JPG، PNG، WebP یا PDF")
                img = base64.b64decode(raw[m.end():], validate=False)
                if len(img) > 5_000_000:
                    raise ValueError("حجم فایل زیاد است: حداکثر ۵ مگابایت")
            return self.send_json(a.billing.card_receipt(u["phone"], data.get("payment_id"), data.get("tracking"), img, a.data_dir / "receipts"))
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
            ip = self.client_address[0]
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
                "catalog": {"cities": catalog.CITIES, "categories": catalog.CATEGORIES, "provinces": catalog.PROVINCES},
                "pending_details": s.q("SELECT COUNT(*) n FROM listings WHERE source IN ('divar','sheypoor') AND detail_at IS NULL AND status='active'", one=True)["n"],
                "billing": a.billing.cfg(), "sms": {**a.billing.sms_cfg(), "api_key": "•••" if a.billing.sms_cfg()["api_key"] else ""},
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
            f = a.data_dir / "receipts" / f"{int(m.group(1))}.img"
            if not f.is_file():
                return self.send_json({"error": "رسید تصویری ندارد"}, 404)
            data = f.read_bytes()
            ctype = "application/pdf" if data[:4] == b"%PDF" else "image/png" if data[:4] == b"\x89PNG" else "image/webp" if data[8:12] == b"WEBP" else "image/jpeg"
            self.send_response(200)
            self.send_header("content-type", ctype)
            self.send_header("content-length", str(len(data)))
            self.send_header("cache-control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return None
        return self.send_json({"error": "مسیر نامعتبر"}, 404)

    def admin_post(self, path, data):
        a, s = self.app, self.app.store
        if path == "/api/admin/settings":
            if isinstance(data.get("display"), dict) and data["display"].get("contact_mode") not in (None, "none", "owner", "all"):
                raise ValueError("حالت نمایش شماره نامعتبر است")
            for key, default in (("site", DEFAULT_SITE), ("display", DEFAULT_DISPLAY), ("billing", DEFAULT_BILLING)):
                if isinstance(data.get(key), dict):
                    clean = {k: v for k, v in data[key].items() if k in default}
                    s.set_setting(key, {**default, **(s.get_setting(key) or {}), **clean})
            if isinstance(data.get("sms"), dict):
                cur = {**DEFAULT_SMS, **(s.get_setting("sms") or {})}
                new = {k: v for k, v in data["sms"].items() if k in DEFAULT_SMS}
                if new.get("api_key") in ("•••", None):
                    new.pop("api_key", None)
                s.set_setting("sms", {**cur, **new})
            if isinstance(data.get("thresholds"), dict):
                bounds = {"max_age_days": (7, 730), "half_life_days": (7, 365), "trend_fixed": (-0.05, 0.10)}
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
        if path == "/api/admin/grant":
            phone = data.get("phone")
            if not a.billing.user(phone):
                raise ValueError("کاربری با این شماره نیست")
            a.billing.activate(phone, data.get("plan") or "weekly")
            return self.send_json({"ok": True})
        return self.send_json({"error": "مسیر نامعتبر"}, 404)


def main():
    ap = argparse.ArgumentParser(description="سرور فرصت‌یاب")
    ap.add_argument("--host", default=os.environ.get("ARA_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("ARA_PORT", "8000")))
    ap.add_argument("--data", default=os.environ.get("ARA_DATA", str(ROOT / "data")))
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()

    Handler.app = App(Path(args.data))
    Handler.app.ingest.start()
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    url = f"http://{'127.0.0.1' if args.host in ('0.0.0.0', '') else args.host}:{args.port}"
    print("=" * 56)
    print(f"  فرصت‌یاب روشن شد:    {url}")
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
