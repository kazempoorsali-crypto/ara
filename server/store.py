"""لایه ذخیره‌سازی SQLite: آگهی‌ها، تاریخچه قیمت، وضعیت دریافت، تنظیمات و درخواست مشتریان."""
from __future__ import annotations

import json
import sqlite3
import statistics
import threading
import time
from pathlib import Path

RENT_RATE = 0.03  # تبدیل اجاره ماهانه به ودیعه معادل

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY, source TEXT, token TEXT, url TEXT,
  vertical TEXT, category TEXT, kind TEXT, deal TEXT,
  title TEXT, description TEXT,
  city_key TEXT, city_name TEXT, province TEXT, district TEXT,
  price INTEGER, deposit INTEGER, rent INTEGER, negotiable INTEGER DEFAULT 0, pp REAL, ppm REAL,
  area INTEGER, rooms INTEGER, year INTEGER, mileage INTEGER, floor INTEGER,
  brand TEXT, gearbox TEXT, fuel TEXT, color TEXT, body TEXT,
  amenities TEXT, attributes TEXT, images TEXT, image TEXT,
  lat REAL, lng REAL, latlng_exact INTEGER DEFAULT 0,
  seller_type TEXT, time_text TEXT,
  first_seen INTEGER, last_seen INTEGER, detail_at INTEGER, checked_at INTEGER,
  status TEXT DEFAULT 'active', featured INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0,
  price_drop REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_l_city ON listings(city_key, vertical, deal);
CREATE INDEX IF NOT EXISTS ix_l_seen ON listings(first_seen);
CREATE INDEX IF NOT EXISTS ix_l_detail ON listings(detail_at);
CREATE TABLE IF NOT EXISTS price_history (listing_id TEXT, at INTEGER, price INTEGER, deposit INTEGER, rent INTEGER);
CREATE INDEX IF NOT EXISTS ix_ph ON price_history(listing_id, at);
CREATE TABLE IF NOT EXISTS feeds (
  city_key TEXT, category TEXT, page INTEGER DEFAULT 0, cursor TEXT, has_next INTEGER DEFAULT 1,
  last_page1 INTEGER DEFAULT 0, pages_done INTEGER DEFAULT 0, items INTEGER DEFAULT 0,
  last_error TEXT, PRIMARY KEY (city_key, category)
);
CREATE TABLE IF NOT EXISTS requests_log (at INTEGER, kind TEXT, ok INTEGER, note TEXT);
CREATE INDEX IF NOT EXISTS ix_rl ON requests_log(at);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, name TEXT, phone TEXT, message TEXT,
  listing_id TEXT, kind TEXT, status TEXT DEFAULT 'new'
);
"""

COLUMNS = ["id", "source", "token", "url", "vertical", "category", "kind", "deal", "title", "description",
           "city_key", "city_name", "province", "district", "price", "deposit", "rent", "negotiable", "pp", "ppm",
           "area", "rooms", "year", "mileage", "floor", "brand", "gearbox", "fuel", "color", "body",
           "amenities", "attributes", "images", "image", "lat", "lng", "latlng_exact", "seller_type", "time_text",
           "first_seen", "last_seen", "detail_at", "checked_at", "status", "featured", "hidden", "price_drop"]
JSON_COLS = {"amenities", "attributes", "images"}


def primary_price(d: dict) -> float | None:
    if d.get("deal") == "rent":
        if d.get("deposit") is None and d.get("rent") is None:
            return None
        return (d.get("deposit") or 0) + (d.get("rent") or 0) / RENT_RATE
    return d.get("price")


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path), check_same_thread=False, timeout=30)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        with self.lock:
            self.db.execute("PRAGMA journal_mode=WAL")
            self.db.executescript(SCHEMA)
            self.db.commit()
        self._median_cache = (0, {})

    # ---------------------------------------------------------- helpers
    def q(self, sql, args=(), one=False):
        with self.lock:
            cur = self.db.execute(sql, args)
            rows = cur.fetchall()
        return (rows[0] if rows else None) if one else rows

    def x(self, sql, args=()):
        with self.lock:
            cur = self.db.execute(sql, args)
            self.db.commit()
            return cur

    @staticmethod
    def row_to_dict(r) -> dict:
        d = dict(r)
        for c in JSON_COLS:
            if d.get(c):
                try:
                    d[c] = json.loads(d[c])
                except (TypeError, json.JSONDecodeError):
                    d[c] = [] if c != "attributes" else {}
            else:
                d[c] = {} if c == "attributes" else []
        return d

    # ---------------------------------------------------------- settings
    def get_setting(self, key, default=None):
        r = self.q("SELECT value FROM settings WHERE key=?", (key,), one=True)
        return json.loads(r["value"]) if r else default

    def set_setting(self, key, value):
        self.x("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
               (key, json.dumps(value, ensure_ascii=False)))

    # ---------------------------------------------------------- listings
    def get(self, lid: str) -> dict | None:
        r = self.q("SELECT * FROM listings WHERE id=?", (lid,), one=True)
        return self.row_to_dict(r) if r else None

    def upsert(self, d: dict) -> str:
        """درج یا به‌روزرسانی؛ تغییر قیمت در تاریخچه ثبت و کاهش قیمت علامت‌گذاری می‌شود. خروجی: new/updated/same."""
        now = int(time.time())
        old = self.get(d["id"])
        d = dict(d)
        d["pp"] = primary_price(d)
        if d.get("vertical") == "estate" and d.get("deal") == "sale" and d.get("price") and d.get("area"):
            d["ppm"] = d["price"] / d["area"]
        result = "new"
        if old:
            result = "same"
            merged = {**old, **{k: v for k, v in d.items() if v not in (None, "", [], {})}}
            old_pp, new_pp = old.get("pp"), merged.get("pp")
            if old_pp and new_pp and abs(new_pp - old_pp) / old_pp > 0.001:
                result = "updated"
                if new_pp < old_pp:
                    merged["price_drop"] = round((old_pp - new_pp) / old_pp, 4)
                self.x("INSERT INTO price_history VALUES(?,?,?,?,?)",
                       (d["id"], now, merged.get("price"), merged.get("deposit"), merged.get("rent")))
            merged["last_seen"] = now
            if merged.get("status") == "removed" and d.get("status") != "removed":
                merged["status"] = "active"
            d = merged
        else:
            d.setdefault("first_seen", now)
            d["last_seen"] = now
            if d.get("pp"):
                self.x("INSERT INTO price_history VALUES(?,?,?,?,?)",
                       (d["id"], now, d.get("price"), d.get("deposit"), d.get("rent")))
        for c, default in (("status", "active"), ("hidden", 0), ("featured", 0), ("negotiable", 0),
                           ("price_drop", 0), ("latlng_exact", 0)):
            if d.get(c) is None:
                d[c] = default
        vals = []
        for c in COLUMNS:
            v = d.get(c)
            if c in JSON_COLS and v is not None and not isinstance(v, str):
                v = json.dumps(v, ensure_ascii=False)
            vals.append(v)
        self.x(f"INSERT OR REPLACE INTO listings({','.join(COLUMNS)}) VALUES({','.join('?' * len(COLUMNS))})", vals)
        return result

    def mark(self, lid, **fields):
        sets = ",".join(f"{k}=?" for k in fields)
        self.x(f"UPDATE listings SET {sets} WHERE id=?", (*fields.values(), lid))

    def history(self, lid):
        return [dict(r) for r in self.q("SELECT at,price,deposit,rent FROM price_history WHERE listing_id=? ORDER BY at", (lid,))]

    # ---------------------------------------------------------- medians
    def medians(self) -> dict:
        at, cache = self._median_cache
        if time.time() - at < 300:
            return cache
        est, car = {}, {}
        for r in self.q("SELECT city_key, kind, ppm FROM listings WHERE status='active' AND hidden=0 AND ppm>0"):
            est.setdefault((r["city_key"], r["kind"]), []).append(r["ppm"])
        for r in self.q("SELECT brand, year, price FROM listings WHERE vertical='car' AND status='active' AND price>0 AND brand IS NOT NULL"):
            b = (r["brand"] or "").split("،")[0].strip()
            car.setdefault((b, r["year"]), []).append(r["price"])
            car.setdefault((b, None), []).append(r["price"])
        out = {"estate": {k: (statistics.median(v), len(v)) for k, v in est.items() if len(v) >= 5},
               "car": {k: (statistics.median(v), len(v)) for k, v in car.items() if len(v) >= 5}}
        self._median_cache = (time.time(), out)
        return out

    def verdict(self, d: dict) -> dict | None:
        """رتبه‌بندی معامله به سبک CarGurus بر پایه میانه آگهی‌های مشابه همین سامانه."""
        m = self.medians()
        ref = None
        if d.get("vertical") == "estate" and d.get("ppm"):
            ref = m["estate"].get((d["city_key"], d["kind"]))
            value = d["ppm"]
        elif d.get("vertical") == "car" and d.get("price") and d.get("brand"):
            b = d["brand"].split("،")[0].strip()
            ref = m["car"].get((b, d.get("year"))) or m["car"].get((b, None))
            value = d["price"]
        if not ref:
            return None
        med, n = ref
        delta = (value - med) / med
        band = "great" if delta <= -0.15 else "good" if delta <= -0.05 else "fair" if delta < 0.05 else "high" if delta < 0.15 else "over"
        return {"band": band, "delta": round(delta, 3), "median": med, "n": n}

    # ---------------------------------------------------------- search
    def search(self, f: dict) -> dict:
        where, args = ["status='active'", "hidden=0"], []

        def add(cond, *a):
            where.append(cond)
            args.extend(a)

        if f.get("vertical"):
            add("vertical=?", f["vertical"])
        if f.get("city"):
            add("city_key=?", f["city"])
        elif f.get("province"):
            add("province=?", f["province"])
        if f.get("deal"):
            add("deal=?", f["deal"])
        if f.get("kinds"):
            ks = [k for k in f["kinds"].split(",") if k]
            add(f"kind IN ({','.join('?' * len(ks))})", *ks)
        for key, col, op in (("min", "pp", ">="), ("max", "pp", "<="), ("areaMin", "area", ">="), ("areaMax", "area", "<="),
                             ("yearMin", "year", ">="), ("yearMax", "year", "<="), ("mileageMax", "mileage", "<=")):
            if f.get(key):
                add(f"{col} {op} ?", float(f[key]))
        if f.get("rooms"):
            r = int(f["rooms"])
            add("rooms >= ?" if r >= 4 else "rooms = ?", r)
        for a in [a for a in (f.get("amenities") or "").split(",") if a]:
            add("amenities LIKE ?", f'%"{a}"%')
        if f.get("brand"):
            add("(brand LIKE ? OR title LIKE ?)", f"%{f['brand']}%", f"%{f['brand']}%")
        if f.get("gearbox"):
            add("gearbox LIKE ?", f"%{f['gearbox']}%")
        if f.get("q"):
            for word in f["q"].split()[:5]:
                add("(title LIKE ? OR description LIKE ? OR district LIKE ?)", f"%{word}%", f"%{word}%", f"%{word}%")
        if f.get("photo"):
            where.append("image IS NOT NULL AND image != ''")
        if f.get("drop"):
            where.append("price_drop > 0")
        if f.get("ids"):
            ids = f["ids"].split(",")[:100]
            add(f"id IN ({','.join('?' * len(ids))})", *ids)
        w = " AND ".join(where)
        order = {"new": "featured DESC, first_seen DESC", "cheap": "pp IS NULL, pp ASC", "exp": "pp DESC",
                 "ppm": "ppm IS NULL, ppm ASC", "area": "area DESC", "drop": "price_drop DESC"}.get(f.get("sort") or "new", "featured DESC, first_seen DESC")
        total = self.q(f"SELECT COUNT(*) n FROM listings WHERE {w}", args, one=True)["n"]
        limit = max(1, min(int(f.get("limit") or 24), 60))
        offset = max(0, int(f.get("offset") or 0))
        if f.get("sort") == "deal":
            rows = [self.row_to_dict(r) for r in self.q(f"SELECT * FROM listings WHERE {w} LIMIT 4000", args)]
            for d in rows:
                d["verdict"] = self.verdict(d)
            rows.sort(key=lambda d: d["verdict"]["delta"] if d["verdict"] else 9)
            items = rows[offset:offset + limit]
        else:
            items = [self.row_to_dict(r) for r in self.q(f"SELECT * FROM listings WHERE {w} ORDER BY {order} LIMIT ? OFFSET ?", (*args, limit, offset))]
            for d in items:
                d["verdict"] = self.verdict(d)
        points = [dict(r) for r in self.q(f"SELECT id,lat,lng,deal,pp,price,deposit,rent,vertical,city_key FROM listings WHERE {w} AND lat IS NOT NULL LIMIT 3000", args)]
        for d in items:
            d.pop("description", None)
            d["images"] = d["images"][:1]
        return {"total": total, "items": items, "points": points}

    # ---------------------------------------------------------- stats
    def stats(self) -> dict:
        day = int(time.time()) - 86400
        base = "status='active' AND hidden=0"
        r = self.q(f"""SELECT COUNT(*) total,
                SUM(vertical='estate') estate, SUM(vertical='car') car,
                SUM(first_seen > ?) today, SUM(price_drop > 0) drops,
                SUM(detail_at IS NOT NULL) detailed
              FROM listings WHERE {base}""", (day,), one=True)
        cities = {row["city_key"]: {"n": row["n"], "estate": row["e"], "car": row["c"]} for row in
                  self.q(f"SELECT city_key, COUNT(*) n, SUM(vertical='estate') e, SUM(vertical='car') c FROM listings WHERE {base} GROUP BY city_key")}
        med = self.medians()["estate"]
        for (ck, kind), (m, n) in med.items():
            if ck in cities and kind in ("villa", "apartment"):
                cities[ck].setdefault("ppm", {})[kind] = m
        return {**{k: (r[k] or 0) for k in r.keys()}, "cities": cities}

    def requests_in_last(self, seconds: int) -> int:
        return self.q("SELECT COUNT(*) n FROM requests_log WHERE at > ?", (int(time.time()) - seconds,), one=True)["n"]

    def log_request(self, kind, ok, note=""):
        self.x("INSERT INTO requests_log VALUES(?,?,?,?)", (int(time.time()), kind, int(ok), note[:300]))
        self.x("DELETE FROM requests_log WHERE at < ?", (int(time.time()) - 7 * 86400,))
