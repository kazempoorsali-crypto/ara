"""موتور دریافت تدریجی آگهی‌ها از دیوار با سقف درخواست ساعتی.

راهبرد: درخواست‌ها با فاصله یکنواخت (۳۶۰۰ ÷ سقف ساعتی ثانیه) ارسال می‌شوند. در هر نوبت یکی از
این کارها با اولویت انجام می‌شود:
  ۱. تازه‌سازی صفحه اول هر شهر/دسته (برای آگهی‌های جدید و تغییر قیمت)
  ۲. دریافت جزئیات آگهی‌هایی که فقط خلاصه‌شان را داریم
  ۳. رفتن به صفحه بعدیِ فهرست هر شهر/دسته (پوشش تدریجی همه آگهی‌ها)
  ۴. بازبینی آگهی‌های قدیمی برای تشخیص حذف‌شده‌ها
وضعیت هر فهرست (صفحه و نشانگر) در پایگاه داده می‌ماند تا با خاموش و روشن شدن رایانه ادامه یابد.
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
import traceback

import catalog
import features
import valuation
from divar_client import SourceError, backoff_seconds, make_source
import divar_client
from sheypoor_client import SheypoorAutoSource, SheypoorDirectSource, SheypoorSource

DEFAULT_INGEST = {
    "enabled": True,          # پیش‌فرض روشن؛ فقط مدیر آن را خاموش می‌کند
    "mode": "mcp",            # mcp = خودکار (اول سرور MCP، اگر سهمیه تمام شد یا نرسید مستقیم) | mcp_only | direct
    "mcp_url": "",
    "hourly_limit": 60,
    "cities": [c["key"] for c in catalog.CITIES if c["province"] in catalog.NORTH],
    "categories": [c["slug"] for c in catalog.CATEGORIES if c["default"]],
    "refresh_hours": 6,
    "detail_ratio": 2,        # تعداد جزئیات به ازای هر صفحه فهرست
    "recheck_days": 4,
    "sheypoor": True,         # منبع دوم: شیپور (پیش‌فرض روشن)
    "sheypoor_mode": "auto",  # auto = اول سرور واسط MCP، اگر نرسید مستقیم | mcp | direct
    "sheypoor_url": "",
    "proxy": "auto",          # auto = پروکسی سیستم با بازگشت خودکار؛ none = بدون پروکسی؛ یا نشانی پروکسی
}
SRC_PREFIX = {"divar": "dv-", "sheypoor": "sp-"}


# گسترش تدریجی به استان‌های دیگر: وقتی دست‌کم «threshold» فهرست‌های استان‌های فعال کامل شد
# (به انتهای فهرست رسید یا «deep_pages» صفحه پیمایش شد)، استان بعدی به ترتیب «order» فعال می‌شود.
DEFAULT_EXPANSION = {"auto": True, "active": list(catalog.NORTH), "order": list(catalog.EXPANSION_ORDER),
                     "threshold": 0.9, "deep_pages": 30, "log": []}


class Ingestor:
    def __init__(self, store):
        self.store = store
        self.stop = threading.Event()
        self.wake = threading.Event()
        self.thread = None
        self.source = None
        self.source_key = None
        self.sp_source = None
        self.sp_key = None
        self.pause_until = 0
        self.fail_streak = 0
        self.detail_credit = 0
        self.state = {"running": False, "last": None, "last_at": None, "next_at": None, "error": None, "discover": None}
        self.discover_thread = None
        self.dirty = 0
        self.valuing = threading.Lock()

    def migrate(self):
        """یک‌بار برای نصب‌های قبلی: دریافت هر دو منبع روشن می‌شود و مختصات تقریبی با قاعدهٔ رو به خشکی بازسازی می‌شود.
        پس از آن انتخاب مدیر (حتی خاموش کردن) حفظ می‌شود."""
        st = self.store
        if not st.get_setting("mig_ingest_on") and os.environ.get("ARA_INGEST_DEFAULT", "1") != "0":
            cur = st.get_setting("ingest")
            if cur is not None:
                st.set_setting("ingest", {**cur, "enabled": True, "sheypoor": True})
            st.set_setting("mig_ingest_on", int(time.time()))
        if not st.get_setting("mig_geo_v2"):
            rows = st.q("SELECT id, token, city_key FROM listings WHERE COALESCE(latlng_exact,0)=0")
            with st.lock:
                for r in rows:
                    c = catalog.CITY_BY_KEY.get(r["city_key"])
                    if c and r["token"]:
                        lat, lng = catalog.jitter(r["token"], c["lat"], c["lng"], city_key=c["key"])
                        st.db.execute("UPDATE listings SET lat=?, lng=? WHERE id=?", (lat, lng, r["id"]))
                st.db.commit()
            st.set_setting("mig_geo_v2", int(time.time()))

    # ---------------------------------------------------------- expansion
    def expansion(self) -> dict:
        e = {**DEFAULT_EXPANSION, **(self.store.get_setting("expansion") or {})}
        e["active"] = [p for p in e["active"] if p in catalog.PROVINCES] or list(catalog.NORTH)
        e["order"] = [p for p in e["order"] if p in catalog.PROVINCES and p not in catalog.NORTH]
        e["order"] += [p for p in catalog.EXPANSION_ORDER if p not in e["order"]]
        return e

    def feed_done(self, f, deep_pages) -> bool:
        return bool(f["pages_done"]) and (not f["has_next"] or f["pages_done"] >= deep_pages)

    def province_progress(self, cfg=None, exp=None) -> dict:
        """پیشرفت هر استان فعال: تعداد فهرست‌های کامل از کل فهرست‌های شهرهای انتخاب‌شدهٔ آن."""
        cfg, exp = cfg or self.cfg(), exp or self.expansion()
        feeds = self.active_feeds(cfg)
        out = {}
        for p in exp["active"]:
            fs = [f for f in feeds if catalog.CITY_BY_KEY.get(f["city_key"], {}).get("province") == p]
            done = sum(1 for f in fs if self.feed_done(f, exp["deep_pages"]))
            out[p] = {"name": catalog.PROVINCES[p]["name"], "feeds": len(fs), "done": done, "ratio": (done / len(fs)) if fs else 0.0}
        return out

    def activate_province(self, pkey, reason="دستی"):
        if pkey not in catalog.PROVINCES:
            raise ValueError("استان نامعتبر است")
        exp = self.expansion()
        if pkey not in exp["active"]:
            exp["active"].append(pkey)
            exp["log"] = ([{"at": int(time.time()), "province": pkey, "reason": reason}] + exp["log"])[:50]
            self.store.set_setting("expansion", exp)
        cur = self.store.get_setting("ingest") or {}
        cities = cur.get("cities") or list(DEFAULT_INGEST["cities"])
        add = [c["key"] for c in catalog.CITIES if c["province"] == pkey and c["key"] not in cities]
        self.store.set_setting("ingest", {**cur, "cities": cities + add})
        self.store.log_request("expand", True, f"استان {catalog.PROVINCES[pkey]['name']} فعال شد ({reason}): {len(add)} شهر")
        self.poke()

    def maybe_expand(self, cfg):
        """هر چند دقیقه: اگر همهٔ استان‌های فعال به آستانهٔ کامل شدن رسیده‌اند، استان بعدی را فعال کن."""
        now = time.time()
        if now - getattr(self, "_exp_checked", 0) < 600:
            return
        self._exp_checked = now
        exp = self.expansion()
        if not exp["auto"]:
            return
        nxt = next((p for p in exp["order"] if p not in exp["active"]), None)
        if not nxt:
            return
        prog = self.province_progress(cfg, exp)
        if prog and all(v["feeds"] and v["ratio"] >= exp["threshold"] for v in prog.values()):
            self.activate_province(nxt, "خودکار: استان‌های قبلی کامل شدند")

    # ---------------------------------------------------------- config
    def cfg(self) -> dict:
        base = DEFAULT_INGEST if os.environ.get("ARA_INGEST_DEFAULT", "1") != "0" else {**DEFAULT_INGEST, "enabled": False, "sheypoor": False}
        c = {**base, **(self.store.get_setting("ingest") or {})}
        c["hourly_limit"] = max(1, min(int(c.get("hourly_limit") or 60), 1200))
        c["categories"] = [x for x in c["categories"] if x in catalog.CATEGORY_BY_SLUG] or ["real-estate"]
        divar_client.NET["proxy"] = c.get("proxy") or "auto"
        return c

    def city(self, key) -> dict:
        c = dict(catalog.CITY_BY_KEY[key])
        ids = self.store.get_setting("city_ids") or {}
        if ids.get(key):
            c["divar_id"] = int(ids[key])
        return c

    @staticmethod
    def make_sheypoor(cfg, store):
        api = os.environ.get("ARA_SHEYPOOR_API") or None
        if cfg.get("sheypoor_mode") == "mcp":
            return SheypoorSource(cfg.get("sheypoor_url") or None, store=store)
        if cfg.get("sheypoor_mode") == "direct":
            return SheypoorDirectSource(api, store=store)
        return SheypoorAutoSource(cfg.get("sheypoor_url") or None, api, store=store)

    def get_sheypoor(self, cfg):
        key = (cfg.get("sheypoor_mode"), cfg.get("sheypoor_url") or "")
        if self.sp_source is None or key != self.sp_key:
            self.sp_source = self.make_sheypoor(cfg, self.store)
            self.sp_key = key
        return self.sp_source

    def source_for(self, cfg, name):
        return self.get_sheypoor(cfg) if name == "sheypoor" else self.get_source(cfg)

    def _mcp_blocked(self):
        """سرور MCP دیوار در دسترس نیست: برای اتصال مستقیم، شناسهٔ شهرهای باقی‌مانده را در پس‌زمینه پیدا کن."""
        ids = self.store.get_setting("city_ids") or {}
        if any(not c["divar_id"] and not ids.get(c["key"]) for c in catalog.CITIES if c["key"] in self.cfg()["cities"]):
            self.discover_ids()

    def get_source(self, cfg):
        key = (cfg["mode"], cfg.get("mcp_url"))
        if self.source is None or key != self.source_key:
            self.source = make_source(cfg["mode"], cfg.get("mcp_url"), on_block=self._mcp_blocked)
            self.source_key = key
        return self.source

    # ---------------------------------------------------------- lifecycle
    def start(self):
        if self.thread and self.thread.is_alive():
            return
        self.thread = threading.Thread(target=self.loop, name="ingest", daemon=True)
        self.thread.start()
        threading.Thread(target=self.value_loop, name="valuation", daemon=True).start()

    def run_valuation(self):
        """بازمحاسبه قیمت منصفانه، پاک‌سازی و امتیاز همه آگهی‌ها."""
        if not self.valuing.acquire(blocking=False):
            return None
        try:
            self.dirty = 0
            return valuation.recompute(self.store, self.store.get_setting("thresholds"))
        except Exception:
            traceback.print_exc()
            return None
        finally:
            self.valuing.release()

    def value_loop(self):
        last = 0
        while not self.stop.is_set():
            if self.dirty >= 25 or (self.dirty and time.time() - last > 600) or not last:
                self.run_valuation()
                last = time.time()
            self.stop.wait(20)

    def poke(self):
        self.wake.set()

    def loop(self):
        while not self.stop.is_set():
            cfg = self.cfg()
            self.state["running"] = bool(cfg["enabled"])
            if not cfg["enabled"]:
                self.state["next_at"] = None
                self.wake.wait(5)
                self.wake.clear()
                continue
            interval = 3600 / cfg["hourly_limit"]
            last = self.store.q("SELECT MAX(at) t FROM requests_log WHERE kind != 'discover'", one=True)["t"] or 0
            due = max(last + interval, self.pause_until)
            # سقف سخت: بیش از حد مجاز در ۶۰ دقیقه گذشته ارسال نشود
            if self.store.requests_in_last(3600, ads_only=True) >= cfg["hourly_limit"]:
                oldest = self.store.q("SELECT at FROM requests_log WHERE at > ? AND kind NOT IN ('discover','test','sms') ORDER BY at LIMIT 1",
                                      (int(time.time()) - 3600,), one=True)
                due = max(due, (oldest["at"] if oldest else time.time()) + 3600)
            self.state["next_at"] = int(due)
            wait = due - time.time()
            if wait > 0:
                self.wake.wait(min(wait, 15))
                self.wake.clear()
                continue
            try:
                self.step(cfg)
                self.fail_streak = 0
                self.state["error"] = None
            except SourceError as e:
                self.fail_streak += 1
                self.pause_until = time.time() + backoff_seconds(e, self.fail_streak - 1)
                self.state["error"] = f"{e} — تلاش دوباره پس از {int(self.pause_until - time.time())} ثانیه"
            except Exception as e:  # خطای پیش‌بینی‌نشده نباید موتور را متوقف کند
                self.fail_streak += 1
                self.pause_until = time.time() + 120
                self.state["error"] = f"خطای داخلی: {e}"
                traceback.print_exc()

    # ---------------------------------------------------------- scheduling
    def ensure_feeds(self, cfg):
        sp_cats = ((self.store.get_setting("sheypoor_map") or {}).get("categories") or []) if cfg.get("sheypoor") else []
        for ck in cfg["cities"]:
            if ck not in catalog.CITY_BY_KEY:
                continue
            for cat in cfg["categories"]:
                self.store.x("INSERT OR IGNORE INTO feeds(city_key, category) VALUES(?,?)", (ck, cat))
            for c in sp_cats:
                self.store.x("INSERT OR IGNORE INTO feeds(city_key, category) VALUES(?,?)", (ck, f"sheypoor:{c['id']}"))

    def active_feeds(self, cfg):
        rows = self.store.q("SELECT * FROM feeds")
        return [dict(r) for r in rows if r["city_key"] in cfg["cities"]
                and (r["category"] in cfg["categories"] or (cfg.get("sheypoor") and r["category"].startswith("sheypoor:")))]

    def step(self, cfg):
        if cfg.get("sheypoor") and not (self.store.get_setting("sheypoor_map") or {}).get("categories"):
            # یک‌بار: کشف دسته‌های ملک و شهرهای شمال در شیپور
            src = self.get_sheypoor(cfg)
            try:
                cats = src.categories()
                src.city_ref(catalog.CITY_BY_KEY[cfg["cities"][0]] if cfg["cities"] else catalog.CITIES[0])
                self.store.log_request("discover", True, f"شیپور: {len(cats)} دستهٔ ملک کشف شد")
            except SourceError as e:
                self.store.log_request("discover", False, f"شیپور: {e}")
            return
        self.ensure_feeds(cfg)
        self.maybe_expand(cfg)
        feeds = self.active_feeds(cfg)
        src = self.get_source(cfg)
        if cfg["mode"] == "direct" or (hasattr(src, "using_direct") and src.using_direct()):
            feeds = [f for f in feeds if f["category"].startswith("sheypoor:") or self.city(f["city_key"]).get("divar_id")]
        now = time.time()
        stale = [f for f in feeds if now - (f["last_page1"] or 0) > cfg["refresh_hours"] * 3600]
        srcs = ("divar", "sheypoor") if cfg.get("sheypoor") else ("divar",)
        marks = ",".join("?" * len(srcs))
        # جزئیات (عکس، مشخصات کامل): اول آگهی‌هایی که کاربری بازشان کرده، بعد فرصت‌ها، بعد بقیه به ترتیب تازگی
        wanted = self.store.get_setting("detail_wanted") or []
        if wanted:
            lid = wanted.pop(0)
            self.store.set_setting("detail_wanted", wanted)
            row = self.store.q("SELECT id, token, source, detail_at FROM listings WHERE id=? AND status='active'", (lid,), one=True)
            if row and not row["detail_at"] and row["source"] in srcs:
                return self.fetch_detail(cfg, row["id"], row["token"], source=row["source"])
        pending = self.store.q(f"""SELECT id, token, source FROM listings WHERE source IN ({marks}) AND detail_at IS NULL
                                  AND status='active'
                                  ORDER BY (label IN ('gold','good')) DESC, (score IS NOT NULL) DESC, score DESC, first_seen DESC LIMIT 1""",
                               srcs, one=True)
        deep = [f for f in feeds if f["has_next"]]
        # با شهرهای زیاد، تازه‌سازی صفحهٔ اول نباید کل سهمیه را بگیرد: نوبت در میان با پیمایش عمیق
        self.turn = not getattr(self, "turn", False)
        if stale and (not deep or self.turn or len(stale) < 10):
            f = min(stale, key=lambda f: f["last_page1"] or 0)
            return self.fetch_page(cfg, f, first=True)
        if pending and self.detail_credit > 0:
            self.detail_credit -= 1
            return self.fetch_detail(cfg, pending["id"], pending["token"], source=pending["source"])
        if deep:
            f = min(deep, key=lambda f: (f["pages_done"], f["items"]))
            return self.fetch_page(cfg, f, first=False)
        if pending:
            return self.fetch_detail(cfg, pending["id"], pending["token"], source=pending["source"])
        old = self.store.q(f"""SELECT id, token, source FROM listings WHERE source IN ({marks}) AND status='active'
                              AND COALESCE(checked_at, detail_at, 0) < ? ORDER BY COALESCE(checked_at, detail_at, 0) LIMIT 1""",
                           (*srcs, int(now - cfg["recheck_days"] * 86400)), one=True)
        if old:
            return self.fetch_detail(cfg, old["id"], old["token"], recheck=True, source=old["source"])
        self.state["last"] = "همه فهرست‌ها کامل است؛ منتظر نوبت تازه‌سازی"
        self.pause_until = now + 300

    # ---------------------------------------------------------- tasks
    def fetch_page(self, cfg, feed, first: bool):
        city = self.city(feed["city_key"])
        page = 1 if first else (feed["page"] or 0) + 1
        cursor = None if first else (json.loads(feed["cursor"]) if feed["cursor"] else None)
        sp = feed["category"].startswith("sheypoor:")
        src = self.get_sheypoor(cfg) if sp else self.get_source(cfg)
        if sp:
            cid = feed["category"].split(":", 1)[1]
            cname = next((c["name"] for c in (self.store.get_setting("sheypoor_map") or {}).get("categories", []) if str(c["id"]) == cid), cid)
            label = f"شیپور {city['name']} / {cname} صفحه {page}"
        else:
            label = f"دیوار {city['name']} / {catalog.CATEGORY_BY_SLUG.get(feed['category'], {}).get('name', feed['category'])} صفحه {page}"
        try:
            res = src.search(city, feed["category"], page, cursor)
        except SourceError as e:
            self.store.log_request("search", False, f"{label}: {e}")
            self.store.x("UPDATE feeds SET last_error=? WHERE city_key=? AND category=?", (str(e)[:200], feed["city_key"], feed["category"]))
            if e.status in (400, 404) and not first:  # نشانگر منقضی شده: از ابتدا
                self.store.x("UPDATE feeds SET page=0, cursor=NULL WHERE city_key=? AND category=?", (feed["city_key"], feed["category"]))
                return
            if first:  # تا ۳۰ دقیقه دیگر سراغ فهرست‌های دیگر برو
                retry = int(time.time() - cfg["refresh_hours"] * 3600 + 1800)
                self.store.x("UPDATE feeds SET last_page1=? WHERE city_key=? AND category=?", (retry, feed["city_key"], feed["category"]))
            raise
        counts = {"new": 0, "updated": 0, "same": 0}
        for row in res["rows"]:
            counts[self.store.upsert(self.from_summary(row, city, feed["category"], "sheypoor" if sp else "divar"))] += 1
        self.dirty += counts["new"] + counts["updated"]
        self.store.log_request("search", True, f"{label}: {len(res['rows'])} آگهی ({counts['new']} جدید، {counts['updated']} تغییر قیمت)")
        fields = {"last_error": None, "items": (feed["items"] or 0) + counts["new"]}
        if first:
            fields.update(last_page1=int(time.time()))
            if not feed["pages_done"]:
                fields.update(page=1, cursor=json.dumps(res["cursor"]) if res["cursor"] else None,
                              has_next=int(res["has_next"]), pages_done=1)
        else:
            fields.update(page=page, cursor=json.dumps(res["cursor"]) if res["cursor"] else None,
                          has_next=int(res["has_next"] and bool(res["rows"])), pages_done=(feed["pages_done"] or 0) + 1)
        sets = ",".join(f"{k}=?" for k in fields)
        self.store.x(f"UPDATE feeds SET {sets} WHERE city_key=? AND category=?", (*fields.values(), feed["city_key"], feed["category"]))
        self.detail_credit += cfg["detail_ratio"]
        self.state.update(last=label, last_at=int(time.time()))

    def fetch_detail(self, cfg, lid, token, recheck=False, source="divar"):
        src = self.source_for(cfg, source)
        try:
            d = src.detail(token)
        except SourceError as e:
            if e.status in (404, 410):
                self.store.mark(lid, status="removed", checked_at=int(time.time()))
                self.store.log_request("detail", True, f"{token}: آگهی در منبع حذف شده است")
                return
            self.store.log_request("detail", False, f"{token}: {e}")
            if e.status and 400 <= e.status < 500 and e.status != 429:  # آگهی مشکل‌دار: رد شو
                self.store.mark(lid, detail_at=int(time.time()), checked_at=int(time.time()))
                return
            raise
        current = self.store.get(lid) or {}
        city = catalog.find_city(d.get("city_name")) or catalog.CITY_BY_KEY.get(current.get("city_key"))
        item = self.from_detail(d, current, city)
        self.store.upsert(item)
        self.dirty += 1
        self.store.log_request("detail", True, f"{'بازبینی' if recheck else 'جزئیات'}: {(item.get('title') or token)[:50]}")
        self.state.update(last=f"جزئیات «{(item.get('title') or token)[:40]}»", last_at=int(time.time()))

    # ---------------------------------------------------------- mapping
    def from_summary(self, row, city, category, source="divar") -> dict:
        cat = catalog.CATEGORY_BY_SLUG.get(category, {"vertical": "estate"})
        cat_text = row.get("category_text") or category
        mapped = catalog.find_city(row.get("city_name")) or city
        lat, lng = catalog.jitter(row["token"], mapped["lat"], mapped["lng"], city_key=mapped["key"])
        item = {
            "id": SRC_PREFIX[source] + row["token"], "source": source, "token": row["token"], "url": row.get("url"),
            "vertical": cat["vertical"], "category": category, "title": row.get("title"),
            "city_key": mapped["key"], "city_name": mapped["name"], "province": mapped["province"],
            "district": row.get("district"), "price": row.get("price"), "deposit": row.get("deposit"),
            "rent": row.get("rent"), "negotiable": int(bool(row.get("negotiable"))),
            "image": row.get("image"), "lat": lat, "lng": lng, "time_text": row.get("time_text"),
        }
        if row.get("phone"):
            item["phone"] = str(row["phone"])[:40]
        if cat["vertical"] == "estate":
            item["kind"], item["deal"] = catalog.classify_estate(cat_text, row.get("title") or "")
            if item["deposit"] is not None or item["rent"] is not None:
                item["deal"] = "rent" if item["deal"] == "sale" else item["deal"]
            item["amenities"] = catalog.detect_amenities(row.get("title"))
            t = catalog.norm(row.get("title"))
            m = re.search(r"(\d{2,5})\s*(?:متر|متری)", t)
            if m:
                item["area"] = int(m.group(1))
            m = re.search(r"(\d|یک|دو|سه|چهار|پنج)\s*خواب", t)
            if m:
                item["rooms"] = {"یک": 1, "دو": 2, "سه": 3, "چهار": 4, "پنج": 5}.get(m.group(1)) or int(m.group(1))
        item["feat"] = features.extract(item)
        return item

    def from_detail(self, d, current, city) -> dict:
        city = city or catalog.CITIES[0]
        source = current.get("source") or "divar"
        item = {"id": current.get("id") or SRC_PREFIX.get(source, "dv-") + d["token"], "source": source, "token": d["token"],
                "url": d.get("url"), "title": d.get("title") or current.get("title"),
                "description": d.get("description"), "attributes": d.get("attributes") or {},
                "images": d.get("images") or [], "district": d.get("district") or current.get("district"),
                "seller_type": d.get("seller_type"), "detail_at": int(time.time()), "checked_at": int(time.time()),
                "city_key": city["key"], "city_name": city["name"], "province": city["province"],
                "vertical": current.get("vertical") or "estate", "category": current.get("category")}
        if item["images"]:
            item["image"] = item["images"][0]
        for f in ("price", "deposit", "rent"):
            if d.get(f):
                item[f] = d[f]
        catalog.enrich_from_attributes(item, item["attributes"])
        if item["vertical"] == "estate":
            kind, deal = catalog.classify_estate(d.get("category_text") or "", item["title"] or "")
            item["kind"] = kind
            item["deal"] = deal if (d.get("category_text") or "").strip() else current.get("deal", deal)
            if item.get("deposit") is not None or item.get("rent") is not None:
                if item["deal"] == "sale":
                    item["deal"] = "rent"
            attrs_text = " ".join(f"{k}: {v}" for k, v in item["attributes"].items())
            item["amenities"] = catalog.detect_amenities(item["title"], attrs_text, d.get("description"))
        if d.get("latlng"):
            item["lat"], item["lng"] = d["latlng"]
            item["latlng_exact"] = 1
        item["seller_type"] = d.get("seller_type")
        if d.get("time_text"):
            item["time_text"] = str(d["time_text"])[:60]
        # شماره و نشانی فقط وقتی ذخیره می‌شود که منبع آن را به‌صورت عمومی برگرداند (بدون ورود به حساب کاربری)
        for k in ("phone", "address"):
            if d.get(k):
                item[k] = str(d[k])[:200]
        item["feat"] = features.extract({**current, **item})
        return item

    # ---------------------------------------------------------- admin actions
    def test_connection(self, source="divar") -> dict:
        cfg = self.cfg()
        started = time.time()
        if source == "sheypoor":
            src = self.make_sheypoor(cfg, self.store)
            try:
                info = src.probe()
                city = self.city(cfg["cities"][0] if cfg["cities"] else "rasht")
                cats = src.categories()
                res = src.search(city, f"sheypoor:{cats[0]['id']}", 1)
                self.store.log_request("test", True, f"آزمون شیپور: {len(res['rows'])} آگهی از {city['name']}")
                sample = [{k: v for k, v in r.items() if k != "raw"} for r in res["rows"][:3]]
                return {"ok": True, "ms": int((time.time() - started) * 1000), "info": info, "count": len(res["rows"]), "sample": sample}
            except Exception as e:
                self.store.log_request("test", False, f"آزمون شیپور: {e}")
                return {"ok": False, "error": str(e)}
        src = make_source(cfg["mode"], cfg.get("mcp_url"), on_block=self._mcp_blocked)
        try:
            city = self.city(cfg["cities"][0] if cfg["cities"] else "rasht")
            if cfg["mode"] == "direct" and not city.get("divar_id"):
                city = self.city("rasht")
            info = src.probe()
            res = src.search(city, cfg["categories"][0] if cfg["categories"] else "real-estate", 1)
            self.store.log_request("test", True, f"آزمون اتصال: {len(res['rows'])} آگهی از {city['name']}")
            sample = res["rows"][:3]
            for s in sample:
                s.pop("raw", None)
            return {"ok": True, "ms": int((time.time() - started) * 1000), "info": info, "count": len(res["rows"]), "sample": sample}
        except Exception as e:
            self.store.log_request("test", False, f"آزمون اتصال: {e}")
            return {"ok": False, "error": str(e)}

    def discover_ids(self, start=1, end=1300, delay=2.5):
        """یافتن شناسه عددی شهرهای شمال در دیوار (فقط برای حالت اتصال مستقیم)."""
        if self.discover_thread and self.discover_thread.is_alive():
            return

        def run():
            src = make_source("direct")
            ids = self.store.get_setting("city_ids") or {}
            targets = {c["key"]: c for c in catalog.CITIES if not c["divar_id"] and not ids.get(c["key"])}
            for cid in range(start, end + 1):
                if self.stop.is_set() or not targets:
                    break
                self.state["discover"] = f"بررسی شناسه {cid} — {len(targets)} شهر باقی‌مانده"
                try:
                    name = src.probe_city(cid)
                except SourceError as e:
                    self.store.log_request("discover", False, f"شناسه {cid}: {e}")
                    time.sleep(backoff_seconds(e, 0) if e.status == 429 else delay)
                    continue
                self.store.log_request("discover", True, f"شناسه {cid}: {name}")
                hit = catalog.find_city(name) if name else None
                if hit and hit["key"] in targets and catalog.squash(hit["name"]) == catalog.squash(name):
                    ids[hit["key"]] = cid
                    self.store.set_setting("city_ids", ids)
                    targets.pop(hit["key"])
                time.sleep(delay)
            self.state["discover"] = f"پایان کشف شناسه‌ها؛ {len(targets)} شهر یافت نشد" if targets else "همه شناسه‌ها یافت شد"
            if not self.stop.is_set():
                self.store.set_setting("discover_done", int(time.time()))

        self.discover_thread = threading.Thread(target=run, name="discover", daemon=True)
        self.discover_thread.start()
