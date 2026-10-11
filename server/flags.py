"""گزارش تخلف آگهی (فروخته‌شده، قیمت دروغین، عکس غیرواقعی، کلاهبرداری) با مقاومت در برابر سوءاستفاده.

خطر اصلی: رقیب‌ها با گزارش‌های پیاپی آگهی دیگران را حذف کنند. قاعده‌ها:
  • هر گزارش‌دهنده برای هر آگهی فقط یک گزارش دارد (کاربر واردشده با شمارهٔ موبایل؛ مهمان با نشانی IP).
  • وزن گزارش: کاربر واردشده ۱، مهمان ۰٫۲۵؛ کسی که گزارش‌هایش قبلاً رد شده وزن کمتری دارد.
  • سقف: هر IP حداکثر ۱۰ گزارش در ساعت و هر کاربر ۲۰ گزارش در روز.
  • هیچ آگهی‌ای خودکار حذف نمی‌شود. وقتی جمع وزن‌ها به آستانه برسد، از دست‌کم ۳ کاربر واردشدهٔ متفاوت باشد
    و گزارش‌ها دست‌کم در ۱۲ ساعت پخش شده باشند (نه هجوم یک‌باره)، آگهی «در حال بررسی» می‌شود: در قیمت محله
    شرکت داده نمی‌شود و کنارش هشدار می‌آید. حذف یا ردّ گزارش فقط با تصمیم مدیر است.
"""
from __future__ import annotations

import time

REASONS = {"sold": "فروخته یا اجاره داده شده", "fake_price": "قیمت غیرواقعی", "fake_photos": "عکس غیرواقعی", "scam": "مشکوک به کلاهبرداری"}
THRESHOLD_WEIGHT = 3.0
MIN_DISTINCT_USERS = 3
MIN_SPREAD_SEC = 12 * 3600
SCHEMA = """
CREATE TABLE IF NOT EXISTS flags (listing_id TEXT, reporter TEXT, logged INTEGER, weight REAL, reason TEXT, ip TEXT, at INTEGER,
  status TEXT DEFAULT 'open', PRIMARY KEY (listing_id, reporter));
CREATE INDEX IF NOT EXISTS ix_flags_ip ON flags(ip, at);
CREATE INDEX IF NOT EXISTS ix_flags_rep ON flags(reporter, at);
"""


class Flags:
    def __init__(self, store):
        self.store = store
        with store.lock:
            store.db.executescript(SCHEMA)
            store.db.commit()

    def _reputation(self, reporter) -> float:
        r = self.store.q("SELECT SUM(status='rejected') bad, SUM(status='accepted') good FROM flags WHERE reporter=?", (reporter,), one=True)
        bad, good = (r["bad"] or 0), (r["good"] or 0)
        return max(0.1, min(1.5, (1 + good) / (1 + 2 * bad)))

    def report(self, lid, reason, phone=None, ip="") -> dict:
        if reason not in REASONS:
            raise ValueError("دلیل گزارش نامعتبر است")
        d = self.store.get(lid)
        if not d or d.get("hidden"):
            raise ValueError("آگهی پیدا نشد")
        now = int(time.time())
        if self.store.q("SELECT COUNT(*) n FROM flags WHERE ip=? AND at>?", (ip, now - 3600), one=True)["n"] >= 10:
            raise ValueError("تعداد گزارش‌های شما در این ساعت زیاد است؛ بعداً دوباره امتحان کنید")
        reporter = f"u:{phone}" if phone else f"ip:{ip}"
        if phone and self.store.q("SELECT COUNT(*) n FROM flags WHERE reporter=? AND at>?", (reporter, now - 86400), one=True)["n"] >= 20:
            raise ValueError("سقف گزارش روزانه پر شده است")
        weight = (1.0 if phone else 0.25) * self._reputation(reporter)
        cur = self.store.x("INSERT OR IGNORE INTO flags VALUES(?,?,?,?,?,?,?, 'open')", (lid, reporter, int(bool(phone)), weight, reason, ip, now))
        if cur.rowcount == 0:
            return {"ok": True, "message": "گزارش شما برای این آگهی قبلاً ثبت شده است"}
        state = self.evaluate(lid)
        msg = "گزارش ثبت شد؛ پس از رسیدن گزارش‌های مستقل کافی بررسی می‌شود"
        if not phone:
            msg += ". گزارش کاربران واردشده وزن بیشتری دارد"
        return {"ok": True, "message": msg, "review": state["review"]}

    def evaluate(self, lid) -> dict:
        rows = self.store.q("SELECT * FROM flags WHERE listing_id=? AND status='open'", (lid,))
        weight = sum(r["weight"] for r in rows)
        users = {r["reporter"] for r in rows if r["logged"]}
        spread = (max(r["at"] for r in rows) - min(r["at"] for r in rows)) if rows else 0
        review = weight >= THRESHOLD_WEIGHT and len(users) >= MIN_DISTINCT_USERS and spread >= MIN_SPREAD_SEC
        cur = self.store.q("SELECT user_review FROM listings WHERE id=?", (lid,), one=True)
        if cur is not None and bool(cur["user_review"]) != review:
            self.store.mark(lid, user_review=int(review))
        return {"review": review, "weight": round(weight, 2), "users": len(users), "spread_h": round(spread / 3600, 1), "n": len(rows)}

    # ---------------------------------------------------------- admin
    def queue(self, limit=200) -> list:
        rows = self.store.q("""SELECT f.listing_id, COUNT(*) n, SUM(f.weight) w, SUM(f.logged) users, MIN(f.at) first, MAX(f.at) last,
                                      GROUP_CONCAT(f.reason) reasons, l.title, l.city_name, l.district, l.user_review, l.hidden
                               FROM flags f LEFT JOIN listings l ON l.id=f.listing_id WHERE f.status='open'
                               GROUP BY f.listing_id ORDER BY (l.user_review=1) DESC, w DESC LIMIT ?""", (limit,))
        out = []
        for r in rows:
            d = dict(r)
            rs = (d.pop("reasons") or "").split(",")
            d["reasons"] = {REASONS.get(k, k): rs.count(k) for k in set(rs) if k}
            out.append(d)
        return out

    def decide(self, lid, accept: bool):
        """تأیید: آگهی پنهان می‌شود و اعتبار گزارش‌دهندگان بالا می‌رود. رد: گزارش‌ها بسته و اعتبار گزارش‌دهندگان کم می‌شود."""
        self.store.x("UPDATE flags SET status=? WHERE listing_id=? AND status='open'", ("accepted" if accept else "rejected", lid))
        if accept:
            self.store.mark(lid, hidden=1, user_review=0)
        else:
            self.store.mark(lid, user_review=0)  # گزارش‌های ردشده دیگر شمرده نمی‌شوند؛ فقط گزارش‌دهندگان تازه

    def counts(self) -> dict:
        r = self.store.q("SELECT COUNT(DISTINCT listing_id) n FROM flags WHERE status='open'", one=True)
        rv = self.store.q("SELECT COUNT(*) n FROM listings WHERE user_review=1", one=True)
        return {"open": r["n"], "review": rv["n"]}
