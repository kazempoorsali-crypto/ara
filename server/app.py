"""سرور محلی آرا: صفحات سایت، API آگهی‌ها، پنل مدیریت و موتور دریافت تدریجی از دیوار.

اجرا:  python server/app.py            (پیش‌فرض http://127.0.0.1:8000)
       python server/app.py --port 9000 --host 0.0.0.0 --no-browser
فقط به کتابخانه استاندارد پایتون ۳.۹ به بالا نیاز دارد.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
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
from ingest import DEFAULT_INGEST, Ingestor  # noqa: E402
from store import Store  # noqa: E402

DEFAULT_SITE = {
    "name": "آرا", "tagline": "دلال هوشمند املاک و خودروی شمال",
    "owner_name": "", "phone": "", "whatsapp": "", "telegram": "", "instagram": "", "email": "",
    "address": "", "hours": "همه روزه ۹ تا ۲۱", "about": "",
}
DEFAULT_PAYMENT = {"card": "", "sheba": "", "holder": "", "bank": "", "note": "", "services": []}
DEFAULT_DISPLAY = {"show_samples": True}
PUBLIC_DIRS = ("assets",)
PUBLIC_FILES = ("index.html", "admin.html", "favicon.svg")
SESSIONS: dict[str, float] = {}
LOGIN_FAILS: dict[str, list] = {}


def hash_pw(pw: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 200_000).hex()


class App:
    def __init__(self, data_dir: Path):
        self.store = Store(data_dir / "ara.db")
        self.ingest = Ingestor(self.store)

    def public_config(self):
        s = self.store
        return {
            "mode": "server",
            "site": {**DEFAULT_SITE, **(s.get_setting("site") or {})},
            "payment": {**DEFAULT_PAYMENT, **(s.get_setting("payment") or {})},
            "display": {**DEFAULT_DISPLAY, **(s.get_setting("display") or {})},
            "admin_ready": bool(s.get_setting("admin")),
        }


class Handler(BaseHTTPRequestHandler):
    app: App = None
    server_version = "Ara/1.0"

    def log_message(self, fmt, *args):  # خروجی کنسول را خلوت نگه می‌داریم
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

    def body(self) -> dict:
        n = int(self.headers.get("content-length") or 0)
        if n > 2_000_000:
            raise ValueError("درخواست بیش از حد بزرگ است")
        raw = self.rfile.read(n) if n else b"{}"
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

    # ---------------------------------------------------------- routing
    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        path = url.path
        qs = {k: v[-1] for k, v in urllib.parse.parse_qs(url.query).items()}
        try:
            if path.startswith("/api/"):
                return self.api_get(path, qs)
            return self.static(path)
        except Exception as e:  # noqa: BLE001
            return self.send_json({"error": str(e)}, 500)

    def do_POST(self):
        path = urllib.parse.urlsplit(self.path).path
        try:
            data = self.body()
            return self.api_post(path, data)
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

    # ---------------------------------------------------------- public api
    def api_get(self, path, qs):
        a = self.app
        if path == "/api/config":
            return self.send_json(a.public_config())
        if path == "/api/listings":
            return self.send_json(a.store.search(qs))
        if path == "/api/stats":
            return self.send_json(a.store.stats())
        m = re.fullmatch(r"/api/listing/([\w-]+)", path)
        if m:
            d = a.store.get(m.group(1))
            if not d or (d["hidden"] and not self.is_admin()):
                return self.send_json({"error": "یافت نشد"}, 404)
            d["verdict"] = a.store.verdict(d)
            d["history"] = a.store.history(d["id"])
            sim = a.store.search({"vertical": d["vertical"], "city": d["city_key"], "deal": d["deal"],
                                  "kinds": d.get("kind") or "", "limit": 7, "sort": "new"})["items"]
            d["similar"] = [x for x in sim if x["id"] != d["id"]][:6]
            return self.send_json(d)
        if path.startswith("/api/admin/"):
            if not self.is_admin():
                return self.send_json({"error": "ورود لازم است"}, 401)
            return self.admin_get(path, qs)
        return self.send_json({"error": "مسیر نامعتبر"}, 404)

    def api_post(self, path, data):
        a = self.app
        if path == "/api/leads":
            phone = catalog.norm(data.get("phone") or "").replace(" ", "")
            if not re.fullmatch(r"(\+98|0)?9\d{9}", phone):
                raise ValueError("شماره موبایل معتبر نیست")
            name = (data.get("name") or "").strip()[:80]
            a.store.x("INSERT INTO leads(at,name,phone,message,listing_id,kind) VALUES(?,?,?,?,?,?)",
                      (int(time.time()), name, phone, (data.get("message") or "")[:1000],
                       (data.get("listing_id") or "")[:60], (data.get("kind") or "contact")[:30]))
            return self.send_json({"ok": True})
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
            return self.send_json({
                **a.public_config(),
                "ingest": cfg, "status": a.ingest.state,
                "hour": s.requests_in_last(3600), "day": s.requests_in_last(86400),
                "feeds": feeds,
                "log": [dict(r) for r in s.q("SELECT * FROM requests_log ORDER BY at DESC LIMIT 60")],
                "leads": [dict(r) for r in s.q("SELECT * FROM leads ORDER BY at DESC LIMIT 200")],
                "stats": s.stats(),
                "city_ids": {**{c["key"]: c["divar_id"] for c in catalog.CITIES if c["divar_id"]}, **(s.get_setting("city_ids") or {})},
                "catalog": {"cities": catalog.CITIES, "categories": catalog.CATEGORIES, "provinces": catalog.PROVINCES},
                "pending_details": s.q("SELECT COUNT(*) n FROM listings WHERE source='divar' AND detail_at IS NULL AND status='active'", one=True)["n"],
            })
        if path == "/api/admin/listings":
            qs = {**qs, "limit": qs.get("limit") or 50}
            where = "1=1"
            args = []
            if qs.get("q"):
                where = "(title LIKE ? OR id LIKE ?)"
                args = [f"%{qs['q']}%", f"%{qs['q']}%"]
            rows = [s.row_to_dict(r) for r in s.q(f"SELECT id,title,city_name,deal,kind,pp,status,hidden,featured,source,first_seen,url FROM listings WHERE {where} ORDER BY first_seen DESC LIMIT 100", args)]
            return self.send_json({"items": rows})
        if path == "/api/admin/leads.csv":
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["زمان", "نام", "تلفن", "پیام", "آگهی", "نوع", "وضعیت"])
            for r in s.q("SELECT * FROM leads ORDER BY at DESC"):
                w.writerow([time.strftime("%Y-%m-%d %H:%M", time.localtime(r["at"])), r["name"], r["phone"], r["message"], r["listing_id"], r["kind"], r["status"]])
            body = ("﻿" + buf.getvalue()).encode()
            self.send_response(200)
            self.send_header("content-type", "text/csv; charset=utf-8")
            self.send_header("content-disposition", "attachment; filename=leads.csv")
            self.end_headers()
            self.wfile.write(body)
            return
        return self.send_json({"error": "مسیر نامعتبر"}, 404)

    def admin_post(self, path, data):
        a, s = self.app, self.app.store
        if path == "/api/admin/settings":
            for key, default in (("site", DEFAULT_SITE), ("payment", DEFAULT_PAYMENT), ("display", DEFAULT_DISPLAY)):
                if isinstance(data.get(key), dict):
                    clean = {k: v for k, v in data[key].items() if k in default}
                    s.set_setting(key, {**default, **(s.get_setting(key) or {}), **clean})
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
            return self.send_json({"ok": True})
        if path == "/api/admin/lead":
            s.x("UPDATE leads SET status=? WHERE id=?", (str(data.get("status") or "new")[:20], int(data["id"])))
            return self.send_json({"ok": True})
        if path == "/api/admin/own-listing":
            city = catalog.CITY_BY_KEY.get(data.get("city_key")) or catalog.CITIES[0]
            lid = data.get("id") or "own-" + secrets.token_hex(4)
            lat, lng = catalog.jitter(lid, city["lat"], city["lng"], 0.015)
            item = {"id": lid, "source": "owner", "vertical": data.get("vertical") or "estate",
                    "kind": data.get("kind") or "apartment", "deal": data.get("deal") or "sale",
                    "title": (data.get("title") or "")[:120], "description": (data.get("description") or "")[:4000],
                    "city_key": city["key"], "city_name": city["name"], "province": city["province"],
                    "district": data.get("district"), "lat": lat, "lng": lng, "featured": 1,
                    "images": [u for u in (data.get("images") or []) if isinstance(u, str)][:12],
                    "amenities": [x for x in (data.get("amenities") or []) if x in catalog.AMENITY_RULES]}
            for f in ("price", "deposit", "rent", "area", "rooms", "year", "mileage"):
                if data.get(f) not in (None, ""):
                    item[f] = catalog.number(data[f])
            if item["images"]:
                item["image"] = item["images"][0]
            for f in ("brand", "gearbox", "fuel", "color", "body"):
                if data.get(f):
                    item[f] = str(data[f])[:60]
            s.upsert(item)
            return self.send_json({"ok": True, "id": lid})
        return self.send_json({"error": "مسیر نامعتبر"}, 404)


def main():
    ap = argparse.ArgumentParser(description="سرور محلی آرا")
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
    print(f"  آرا روشن شد:        {url}")
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
