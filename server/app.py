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
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

import catalog  # noqa: E402
from billing import DEFAULT_BILLING, DEFAULT_SMS, Billing  # noqa: E402
from ingest import DEFAULT_INGEST, Ingestor  # noqa: E402
from store import Store  # noqa: E402
from valuation import DEFAULT_WEIGHTS  # noqa: E402

DEFAULT_SITE = {"name": "فرصت‌یاب", "tagline": "قیمت منصفانه ملک در شمال", "about": "", "email": ""}
DEFAULT_DISPLAY = {"show_samples": True}
PUBLIC_DIRS = ("assets",)
PUBLIC_FILES = ("index.html", "admin.html", "favicon.svg")
SESSIONS: dict[str, float] = {}
LOGIN_FAILS: dict[str, list] = {}
LOCKED_FIELDS = ("url", "token")


def hash_pw(pw: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 200_000).hex()


class App:
    def __init__(self, data_dir: Path):
        self.store = Store(data_dir / "ara.db")
        self.ingest = Ingestor(self.store)
        self.billing = Billing(self.store)

    def public_config(self):
        s, b = self.store, self.billing
        return {
            "mode": "server",
            "site": {**DEFAULT_SITE, **(s.get_setting("site") or {})},
            "display": {**DEFAULT_DISPLAY, **(s.get_setting("display") or {})},
            "plans": b.plans(), "payable": b.payable(), "test_payments": b.cfg()["test_mode"],
            "free_preview": int(b.cfg().get("free_preview") or 0),
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
        if n > 2_000_000:
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

    def pay_callback(self, params):
        ok = self.app.billing.callback(params)
        return self.redirect("/#/account?" + ("paid=1" if ok else "failed=1"))

    # ---------------------------------------------------------- public api
    def gate(self, d: dict, user, full=False):
        """پیوند دیوار و جزئیات کامل ارزش‌گذاری فقط برای مشترکان فعال."""
        active = bool(user and user["active"]) or d.get("id") in self.free_ids()
        d["locked"] = not active
        if not active:
            for k in LOCKED_FIELDS:
                d.pop(k, None)
            ex = d.get("explain") or {}
            if full:
                d["explain"] = {"district_n": ex.get("district_n"), "city_n": ex.get("city_n"), "filled": ex.get("filled"),
                                "effects_count": len(ex.get("effects") or [])}
        else:
            d.pop("token", None)
        return d

    def free_ids(self):
        """چند فرصت برتر که بدون اشتراک هم با جزئیات کامل نمایش داده می‌شوند."""
        n = int(self.app.billing.cfg().get("free_preview") or 0)
        if not n:
            return set()
        return {r["id"] for r in self.app.store.q(
            "SELECT id FROM listings WHERE score IS NOT NULL AND COALESCE(excluded,0)=0 AND status='active' AND hidden=0 ORDER BY score DESC LIMIT ?", (n,))}

    def api_get(self, path, qs):
        a = self.app
        if path == "/api/config":
            return self.send_json(a.public_config())
        if path == "/api/me":
            return self.send_json({"user": self.user()})
        if path == "/api/listings":
            r = a.store.search(qs)
            u = self.user()
            for d in r["items"]:
                self.gate(d, u)
                d.pop("attributes", None)
                d.pop("feat", None)
            return self.send_json(r)
        if path == "/api/stats":
            return self.send_json(a.store.stats())
        if path == "/api/market":
            return self.send_json({"rows": a.store.market_rows(qs.get("city"))})
        m = re.fullmatch(r"/api/listing/([\w-]+)", path)
        if m:
            d = a.store.get(m.group(1))
            if not d or (d["hidden"] and not self.is_admin()):
                return self.send_json({"error": "یافت نشد"}, 404)
            d["verdict"] = a.store.verdict(d)
            d["history"] = a.store.history(d["id"])
            sim = a.store.search({"city": d["city_key"], "deal": d["deal"], "kinds": d.get("kind") or "", "limit": 7, "sort": "score"})["items"]
            u = self.user()
            d["similar"] = [self.gate(x, u) for x in sim if x["id"] != d["id"]][:6]
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
                "hour": s.requests_in_last(3600), "day": s.requests_in_last(86400),
                "feeds": feeds,
                "log": [dict(r) for r in s.q("SELECT * FROM requests_log ORDER BY at DESC LIMIT 60")],
                "stats": s.stats(),
                "city_ids": {**{c["key"]: c["divar_id"] for c in catalog.CITIES if c["divar_id"]}, **(s.get_setting("city_ids") or {})},
                "catalog": {"cities": catalog.CITIES, "categories": catalog.CATEGORIES, "provinces": catalog.PROVINCES},
                "pending_details": s.q("SELECT COUNT(*) n FROM listings WHERE source='divar' AND detail_at IS NULL AND status='active'", one=True)["n"],
                "billing": a.billing.cfg(), "sms": {**a.billing.sms_cfg(), "api_key": "•••" if a.billing.sms_cfg()["api_key"] else ""},
                "scoring": {"weights": {**DEFAULT_WEIGHTS, **((s.get_setting("scoring") or {}).get("weights") or {})}},
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
        return self.send_json({"error": "مسیر نامعتبر"}, 404)

    def admin_post(self, path, data):
        a, s = self.app, self.app.store
        if path == "/api/admin/settings":
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
            if isinstance(data.get("weights"), dict):
                w = {k: max(0, min(100, float(v))) for k, v in data["weights"].items() if k in DEFAULT_WEIGHTS}
                s.set_setting("scoring", {"weights": {**DEFAULT_WEIGHTS, **w}})
                threading.Thread(target=a.ingest.run_valuation, daemon=True).start()
            if data.get("new_password"):
                if len(data["new_password"]) < 6:
                    raise ValueError("رمز دست‌کم ۶ نویسه باشد")
                salt = secrets.token_hex(8)
                s.set_setting("admin", {"salt": salt, "hash": hash_pw(data["new_password"], salt)})
            return self.send_json({"ok": True})
        if path == "/api/admin/ingest":
            cfg = {**a.ingest.cfg(), **{k: v for k, v in data.items() if k in DEFAULT_INGEST}}
            cfg["cities"] = [c for c in cfg["cities"] if c in catalog.CITY_BY_KEY]
            cfg["categories"] = [c for c in cfg["categories"] if c in catalog.CATEGORY_BY_SLUG]
            s.set_setting("ingest", cfg)
            if isinstance(data.get("city_ids"), dict):
                ids = {k: int(v) for k, v in data["city_ids"].items() if k in catalog.CITY_BY_KEY and str(v).isdigit()}
                s.set_setting("city_ids", ids)
            a.ingest.pause_until = 0
            a.ingest.poke()
            return self.send_json({"ok": True, "ingest": cfg})
        if path == "/api/admin/test":
            return self.send_json(a.ingest.test_connection())
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
