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
CREATE TABLE IF NOT EXISTS market (city_key TEXT, district TEXT, kind TEXT, deal TEXT, n INTEGER, median REAL, p25 REAL, p75 REAL);
CREATE TABLE IF NOT EXISTS users (phone TEXT PRIMARY KEY, created INTEGER, sub_until INTEGER DEFAULT 0, plan TEXT, last_login INTEGER);
CREATE TABLE IF NOT EXISTS otps (phone TEXT PRIMARY KEY, code_hash TEXT, expires INTEGER, attempts INTEGER DEFAULT 0, sent_at INTEGER);
CREATE TABLE IF NOT EXISTS user_sessions (token TEXT PRIMARY KEY, phone TEXT, expires INTEGER);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT, plan TEXT, amount INTEGER, gateway TEXT, authority TEXT,
  status TEXT DEFAULT 'pending', ref_id TEXT, created INTEGER, paid_at INTEGER, note TEXT
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, name TEXT, phone TEXT, message TEXT,
  listing_id TEXT, kind TEXT, status TEXT DEFAULT 'new'
);
"""

COLUMNS = ["id", "source", "token", "url", "vertical", "category", "kind", "deal", "title", "description",
           "city_key", "city_name", "province", "district", "price", "deposit", "rent", "negotiable", "pp", "ppm",
           "area", "rooms", "year", "mileage", "floor", "brand", "gearbox", "fuel", "color", "body",
           "amenities", "attributes", "images", "image", "lat", "lng", "latlng_exact", "seller_type", "time_text",
           "first_seen", "last_seen", "detail_at", "checked_at", "status", "featured", "hidden", "price_drop",
           "feat", "flags", "excluded", "fair_ppm", "fair_price", "discount", "score", "confidence", "explain", "label", "settlement", "phone", "address", "posted_at"]
JSON_COLS = {"amenities", "attributes", "images", "feat", "flags", "explain"}
NEW_COLS = {"feat": "TEXT", "flags": "TEXT", "excluded": "INTEGER DEFAULT 0", "fair_ppm": "REAL", "fair_price": "REAL",
            "discount": "REAL", "score": "REAL", "confidence": "TEXT", "explain": "TEXT", "label": "TEXT", "settlement": "TEXT", "phone": "TEXT", "address": "TEXT", "posted_at": "INTEGER"}


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
            have = {r[1] for r in self.db.execute("PRAGMA table_info(listings)")}
            for col, typ in NEW_COLS.items():  # ارتقای پایگاه داده نسخه قبل
                if col not in have:
                    self.db.execute(f"ALTER TABLE listings ADD COLUMN {col} {typ}")
            self.db.execute("CREATE INDEX IF NOT EXISTS ix_l_score ON listings(score)")
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
                d[c] = {} if c in ("attributes", "feat", "explain") else []
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
            if old.get("detail_at") and not d.get("detail_at"):
                # خلاصه کارت نباید مشخصات دقیق صفحه کامل آگهی را بازنویسی کند
                for k in ("feat", "attributes", "images", "area", "rooms", "year", "floor", "amenities", "kind", "deal", "description"):
                    d.pop(k, None)
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
        # زمان درج آگهی در منبع: زودترین زمانی که تا حالا دیده یا از متن «… پیش» برداشت شده
        from catalog import parse_posted
        cands = [x for x in (d.get("posted_at"), parse_posted(d.get("time_text"), now), (old or {}).get("posted_at")) if x]
        if cands:
            d["posted_at"] = min(min(cands), d.get("first_seen") or now)
        if d.get("vertical") == "estate":
            from features import settlement
            d["settlement"] = settlement(d.get("title"), d.get("description"), d.get("district"),
                                         d.get("feat") if isinstance(d.get("feat"), dict) else None)
        for c, default in (("status", "active"), ("hidden", 0), ("featured", 0), ("negotiable", 0),
                           ("price_drop", 0), ("latlng_exact", 0), ("excluded", 0)):
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

    # ---------------------------------------------------------- verdict
    @staticmethod
    def verdict(d: dict) -> dict | None:
        """حکم قیمت: برچسب (طلایی، زیر قیمت، منصفانه، بالاتر، مشکوک)، فاصله تا قیمت محله و اطمینان."""
        disc = d.get("discount")
        label = d.get("label")
        if disc is None or (d.get("excluded") and label != "sus"):
            return None
        ex = d.get("explain") or {}
        return {"label": label, "delta": round(-disc, 3), "fair": d.get("fair_price"), "fair_ppm": d.get("fair_ppm"),
                "n": ex.get("district_n") or 0, "city_n": ex.get("city_n") or 0, "confidence": d.get("confidence"),
                "score": d.get("score"), "wide": ex.get("wide"), "rank": ex.get("rank"), "rank_n": ex.get("rank_n"), "estimated_profit": ex.get("estimated_profit"), "trust_score": ex.get("trust_score")}

    # ---------------------------------------------------------- search
    def search(self, f: dict) -> dict:
        where, args = ["status='active'", "hidden=0", "vertical='estate'"], []
        if f.get("include_excluded"):
            pass
        elif f.get("sus"):
            where.append("(COALESCE(excluded,0)=0 OR label='sus')")
        else:
            where.append("COALESCE(excluded,0)=0")

        def add(cond, *a):
            where.append(cond)
            args.extend(a)

        if f.get("city") and f.get("province"):
            cities = [c.strip() for c in str(f["city"]).split(",") if c.strip()]
            provinces = [p.strip() for p in str(f["province"]).split(",") if p.strip()]
            add(f"(city_key IN ({','.join('?' * len(cities))}) OR province IN ({','.join('?' * len(provinces))}))", *cities, *provinces)
        elif f.get("city"):
            cities = [c.strip() for c in str(f["city"]).split(",") if c.strip()]
            if len(cities) == 1:
                add("city_key=?", cities[0])
            elif len(cities) > 1:
                add(f"city_key IN ({','.join('?' * len(cities))})", *cities)
        elif f.get("province"):
            provinces = [p.strip() for p in str(f["province"]).split(",") if p.strip()]
            if len(provinces) == 1:
                add("province=?", provinces[0])
            elif len(provinces) > 1:
                add(f"province IN ({','.join('?' * len(provinces))})", *provinces)
        if f.get("deal"):
            add("deal=?", f["deal"])
        if f.get("kinds"):
            ks = [k for k in f["kinds"].split(",") if k]
            add(f"kind IN ({','.join('?' * len(ks))})", *ks)
        for key, col, op in (("min", "pp", ">="), ("max", "pp", "<="), ("areaMin", "area", ">="), ("areaMax", "area", "<="),
                             ("yearMin", "year", ">="), ("yearMax", "year", "<="), ("minScore", "score", ">=")):
            if f.get(key):
                add(f"{col} {op} ?", float(f[key]))
        if f.get("rooms") not in (None, ""):
            rs = sorted({int(x) for x in str(f["rooms"]).split(",") if x.strip().isdigit()})
            conds = [("rooms >= ?" if r >= 4 else "rooms = ?") for r in rs]
            if conds:
                add("(" + " OR ".join(conds) + ")", *rs)
        if f.get("ageMax"):
            from features import jalali_year_now
            add("year >= ?", jalali_year_now() - int(f["ageMax"]))
        if f.get("fresh"):  # تازگی آگهی بر پایهٔ زمان درج در منبع
            add("COALESCE(posted_at, first_seen) >= ?", int(time.time()) - int(f["fresh"]) * 86400)
        if f.get("depMax"):
            add("deposit <= ?", float(f["depMax"]))
        if f.get("rentMax"):
            add("rent <= ?", float(f["rentMax"]))
        if f.get("settle") in ("urban", "rural"):
            add("COALESCE(settlement,'urban') = ?", f["settle"])
        if f.get("opp"):
            where.append("label IN ('gold','good')")
        if f.get("label"):
            ls = [x for x in f["label"].split(",") if x in ("gold", "good", "fair", "high", "sus", "pending")]
            if ls:
                add(f"label IN ({','.join('?' * len(ls))})", *ls)
        for a in [a for a in (f.get("amenities") or "").split(",") if a]:
            add("amenities LIKE ?", f'%"{a}"%')
        if f.get("district"):
            ds = [x.strip() for x in f["district"].split(",") if x.strip()][:12]
            add(f"REPLACE(REPLACE(district,' ',''),char(8204),'') IN ({','.join('?' * len(ds))})",
                *[x.replace(" ", "").replace("\u200c", "") for x in ds])
        if f.get("ranked"):
            where.append("score IS NOT NULL")
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
        order = {"new": "featured DESC, COALESCE(posted_at, first_seen) DESC", "score": "score IS NULL, score DESC, discount DESC", "deal": "discount IS NULL, discount DESC",
                 "cheap": "pp IS NULL, pp ASC", "exp": "pp DESC", "area_asc": "area IS NULL, area ASC", "age_asc": "year IS NULL, year DESC", "exp": "pp DESC", "ppm": "ppm IS NULL, ppm ASC", "area": "area DESC",
                 "drop": "price_drop DESC"}.get(f.get("sort") or "score", "score IS NULL, score DESC, discount DESC")
        total = self.q(f"SELECT COUNT(*) n FROM listings WHERE {w}", args, one=True)["n"]
        limit = max(1, min(int(f.get("limit") or 24), 60))
        offset = max(0, int(f.get("offset") or 0))
        items = [self.row_to_dict(r) for r in self.q(f"SELECT * FROM listings WHERE {w} ORDER BY {order} LIMIT ? OFFSET ?", (*args, limit, offset))]
        for d in items:
            d["verdict"] = self.verdict(d)
        points = [dict(r) for r in self.q(f"SELECT id,lat,lng,deal,pp,price,deposit,rent,vertical,city_key,score,label FROM listings WHERE {w} AND lat IS NOT NULL LIMIT 3000", args)]
        for d in items:
            d.pop("description", None)
            d["images"] = d["images"][:1]
        return {"total": total, "items": items, "points": points}

    # ---------------------------------------------------------- stats
    def stats(self) -> dict:
        day = int(time.time()) - 86400
        base = "status='active' AND hidden=0 AND vertical='estate'"
        r = self.q(f"""SELECT COUNT(*) total, SUM(COALESCE(excluded,0)=0) estate, SUM(first_seen > ?) today,
                SUM(price_drop > 0) drops, SUM(detail_at IS NOT NULL) detailed, SUM(score IS NOT NULL) ranked,
                SUM(excluded=1) excluded, SUM(label IN ('gold','good')) deals, SUM(label='gold') gold,
                SUM(label='sus') sus, MAX(last_seen) updated
              FROM listings WHERE {base}""", (day,), one=True)
        cities = {row["city_key"]: {"n": row["n"], "estate": row["n"], "ranked": row["rk"]} for row in
                  self.q(f"SELECT city_key, COUNT(*) n, SUM(score IS NOT NULL) rk FROM listings WHERE {base} AND COALESCE(excluded,0)=0 GROUP BY city_key")}
        agg = {}
        for m in self.q("SELECT city_key, kind, n, median FROM market WHERE deal='sale' AND kind IN ('apartment','villa')"):
            agg.setdefault((m["city_key"], m["kind"]), []).append((m["median"], m["n"]))
        for (ck, kind), cells in agg.items():
            vals = sorted(v for v, n in cells for _ in range(n))
            if ck in cities and len(vals) >= 5:
                cities[ck].setdefault("ppm", {})[kind] = vals[len(vals) // 2]
        return {**{k: (r[k] or 0) for k in r.keys()}, "car": 0, "cities": cities}

    def districts(self, city: str, deal: str | None = None) -> list:
        """همهٔ محله‌های یک شهر با تعداد آگهی فعال، نوع سکونتگاه و تعداد فرصت (برای فیلتر محله)."""
        sql = """SELECT district, COUNT(*) n, SUM(label IN ('gold','good')) opp,
                        SUM(COALESCE(settlement,'urban')='rural') rural
                 FROM listings WHERE status='active' AND hidden=0 AND vertical='estate' AND COALESCE(excluded,0)=0
                   AND city_key=? AND district IS NOT NULL AND district != ''"""
        args = [city]
        if deal:
            sql += " AND deal=?"
            args.append(deal)
        groups = {}
        for r in self.q(sql + " GROUP BY district", args):
            key = r["district"].replace(" ", "").replace("\u200c", "")
            g = groups.setdefault(key, {"name": r["district"], "n": 0, "opp": 0, "rural": 0, "_best": 0})
            g["n"] += r["n"]; g["opp"] += r["opp"] or 0; g["rural"] += r["rural"] or 0
            if r["n"] > g["_best"]:
                g["name"], g["_best"] = r["district"], r["n"]
        out = [{"name": g["name"], "n": g["n"], "opp": g["opp"], "rural": g["rural"] * 2 > g["n"]} for g in groups.values()]
        return sorted(out, key=lambda x: -x["n"])

    def market_rows(self, city=None):
        sql, args = "SELECT * FROM market", []
        if city:
            sql += " WHERE city_key=?"
            args.append(city)
        return [dict(r) for r in self.q(sql + " ORDER BY city_key, kind, deal, n DESC", args)]

    def requests_in_last(self, seconds: int, ads_only: bool = False) -> int:
        extra = " AND kind NOT IN ('discover','test','sms')" if ads_only else ""
        return self.q(f"SELECT COUNT(*) n FROM requests_log WHERE at > ?{extra}", (int(time.time()) - seconds,), one=True)["n"]

    def log_request(self, kind, ok, note=""):
        self.x("INSERT INTO requests_log VALUES(?,?,?,?)", (int(time.time()), kind, int(ok), note[:300]))
        self.x("DELETE FROM requests_log WHERE at < ?", (int(time.time()) - 7 * 86400,))
