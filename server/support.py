"""پشتیبانی: تیکت کاربر (پرداخت، پیامک، سایر) با پیوست تصویر، پاسخ مدیر و پاسخ خودکار.

کاربرِ واردشده تیکت‌هایش را با حساب خود می‌بیند. کسی که کد پیامکی به دستش نمی‌رسد نمی‌تواند وارد شود،
پس تیکت مهمان هم پذیرفته می‌شود: شمارهٔ موبایل می‌دهد و یک کلید دسترسی می‌گیرد که در مرورگرش می‌ماند.
اگر تیکت پرداخت همراه تصویر باشد و کاربر پرداخت کارت‌به‌کارتِ در انتظار رسید داشته باشد، تصویر همان‌جا
به‌عنوان رسید آن پرداخت ثبت می‌شود.
"""
from __future__ import annotations

import secrets
import time

CATEGORIES = {"payment": "پرداخت و اشتراک", "sms": "پیامک و کد ورود", "listing": "آگهی‌ها و قیمت‌ها", "other": "سایر"}
STATUS = {"open": "در انتظار پاسخ", "answered": "پاسخ داده شد", "closed": "بسته شد"}
DEFAULT_SUPPORT = {
    "auto_reply": True,
    "auto_text": {
        "payment": "پیام شما ثبت شد. اگر کارت‌به‌کارت کرده‌اید، تصویر رسید را پیوست کنید تا با مبلغ یکتای پرداخت تطبیق داده شود؛ پس از تأیید، پیامک فعال‌سازی ارسال می‌شود.",
        "sms": "پیام شما ثبت شد. اگر کد ورود نمی‌رسد: شماره را با ۰۹ وارد کنید، دریافت پیامک‌های تبلیغاتی و خدماتی را در گوشی مسدود نکرده باشید و ۹۰ ثانیه بعد دوباره درخواست کد بدهید. در صورت ادامهٔ مشکل، پشتیبانی بررسی می‌کند.",
        "listing": "پیام شما ثبت شد و پشتیبانی آن را بررسی می‌کند.",
        "other": "پیام شما ثبت شد و پشتیبانی به‌زودی پاسخ می‌دهد.",
    },
}
SCHEMA = """
CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT, guest_key TEXT, category TEXT, subject TEXT,
  status TEXT DEFAULT 'open', created INTEGER, updated INTEGER, admin_unread INTEGER DEFAULT 1, user_unread INTEGER DEFAULT 0, payment_id INTEGER);
CREATE TABLE IF NOT EXISTS ticket_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER, sender TEXT, body TEXT, has_image INTEGER DEFAULT 0, created INTEGER);
CREATE INDEX IF NOT EXISTS ix_tm_t ON ticket_msgs(ticket_id);
"""


class Support:
    def __init__(self, store, billing, data_dir):
        self.store, self.billing = store, billing
        self.dir = data_dir / "tickets"
        with store.lock:
            store.db.executescript(SCHEMA)
            store.db.commit()

    def cfg(self):
        c = {**DEFAULT_SUPPORT, **(self.store.get_setting("support") or {})}
        c["auto_text"] = {**DEFAULT_SUPPORT["auto_text"], **(c.get("auto_text") or {})}
        return c

    # ---------------------------------------------------------- helpers
    def _msg(self, tid, sender, body, image: bytes | None = None):
        now = int(time.time())
        cur = self.store.x("INSERT INTO ticket_msgs (ticket_id, sender, body, has_image, created) VALUES (?,?,?,?,?)",
                           (tid, sender, body, int(bool(image)), now))
        if image:
            self.dir.mkdir(parents=True, exist_ok=True)
            (self.dir / f"{cur.lastrowid}.img").write_bytes(image)
        return cur.lastrowid

    def _full(self, t) -> dict:
        d = dict(t)
        d.pop("guest_key", None)
        d["category_name"] = CATEGORIES.get(d["category"], d["category"])
        d["status_name"] = STATUS.get(d["status"], d["status"])
        d["messages"] = [dict(m) for m in self.store.q("SELECT id, sender, body, has_image, created FROM ticket_msgs WHERE ticket_id=? ORDER BY id", (d["id"],))]
        return d

    def _clean(self, text, n=3000):
        return str(text or "").strip()[:n]

    # ---------------------------------------------------------- user side
    def create(self, phone, category, body, image=None, guest=False, ip_recent=0) -> dict:
        from billing import norm_phone
        phone = norm_phone(phone)
        if not phone:
            raise ValueError("شمارهٔ موبایل معتبر نیست")
        if category not in CATEGORIES:
            category = "other"
        body = self._clean(body)
        if len(body) < 5 and not image:
            raise ValueError("متن پیام را بنویسید")
        if ip_recent >= 6:
            raise ValueError("تعداد تیکت‌های این ساعت زیاد است؛ کمی بعد دوباره امتحان کنید")
        now = int(time.time())
        key = secrets.token_urlsafe(16) if guest else None
        pay = None
        if category == "payment" and image and not guest:
            pay = self.store.q("SELECT id FROM payments WHERE phone=? AND gateway='card' AND status='pending' ORDER BY created DESC LIMIT 1", (phone,), one=True)
        cur = self.store.x("INSERT INTO tickets (phone, guest_key, category, subject, created, updated, payment_id) VALUES (?,?,?,?,?,?,?)",
                           (phone, key, category, body[:80] or "تصویر پیوست", now, now, pay["id"] if pay else None))
        tid = cur.lastrowid
        self._msg(tid, "user", body, image)
        notes = []
        if pay:
            try:
                r = self.billing.card_receipt(phone, pay["id"], "", image, self.store_dir_receipts())
                notes.append("تصویر پیوست به‌عنوان رسید پرداخت کارت‌به‌کارت ثبت شد" + ("؛ اشتراک شما فعال شد." if r.get("activated") else "؛ پس از بررسی، اشتراک فعال می‌شود."))
            except ValueError as e:
                notes.append(str(e))
        c = self.cfg()
        if c["auto_reply"] or notes:
            self._msg(tid, "auto", " ".join(([c["auto_text"].get(category, "")] if c["auto_reply"] else []) + notes).strip())
            self.store.x("UPDATE tickets SET user_unread=1 WHERE id=?", (tid,))
        return {"ok": True, "id": tid, "key": key}

    def store_dir_receipts(self):
        return self.dir.parent / "receipts"

    def mine(self, phone=None, keys=()) -> list:
        rows = []
        if phone:
            rows += self.store.q("SELECT * FROM tickets WHERE phone=? ORDER BY updated DESC LIMIT 50", (phone,))
        keys = [k for k in keys if k][:20]
        if keys:
            rows += self.store.q(f"SELECT * FROM tickets WHERE guest_key IN ({','.join('?' * len(keys))}) ORDER BY updated DESC", keys)
        seen, out = set(), []
        for t in rows:
            if t["id"] not in seen:
                seen.add(t["id"])
                out.append(self._full(t))
        return out

    def owns(self, tid, phone=None, keys=()) -> bool:
        t = self.store.q("SELECT phone, guest_key FROM tickets WHERE id=?", (int(tid),), one=True)
        return bool(t and ((phone and t["phone"] == phone) or (t["guest_key"] and t["guest_key"] in keys)))

    def reply_user(self, tid, body, image=None):
        body = self._clean(body)
        if len(body) < 2 and not image:
            raise ValueError("متن پیام را بنویسید")
        self._msg(int(tid), "user", body, image)
        self.store.x("UPDATE tickets SET status='open', updated=?, admin_unread=1 WHERE id=?", (int(time.time()), int(tid)))
        return {"ok": True}

    def seen_user(self, tid):
        self.store.x("UPDATE tickets SET user_unread=0 WHERE id=?", (int(tid),))

    def image_owner(self, mid):
        r = self.store.q("SELECT ticket_id FROM ticket_msgs WHERE id=? AND has_image=1", (int(mid),), one=True)
        return r["ticket_id"] if r else None

    # ---------------------------------------------------------- admin side
    def admin_list(self, status=None) -> list:
        q = "SELECT * FROM tickets" + (" WHERE status=?" if status else "") + " ORDER BY (status='closed'), updated DESC LIMIT 300"
        return [self._full(t) for t in self.store.q(q, (status,) if status else ())]

    def admin_reply(self, tid, body, close=False, reopen=False):
        t = self.store.q("SELECT * FROM tickets WHERE id=?", (int(tid),), one=True)
        if not t:
            raise ValueError("تیکت پیدا نشد")
        body = self._clean(body)
        if body:
            self._msg(t["id"], "admin", body)
        status = "closed" if close else "open" if reopen else ("answered" if body else t["status"])
        self.store.x("UPDATE tickets SET status=?, updated=?, admin_unread=0, user_unread=? WHERE id=?",
                     (status, int(time.time()), 1 if body else t["user_unread"], t["id"]))
        return {"ok": True}

    def unread_admin(self) -> int:
        return self.store.q("SELECT COUNT(*) n FROM tickets WHERE admin_unread=1 AND status!='closed'", one=True)["n"]
