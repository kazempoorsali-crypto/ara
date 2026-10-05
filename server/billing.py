"""عضویت با موبایل، کد یک‌بارمصرف، اشتراک و درگاه پرداخت (بدون دخالت انسان).

پیامک: کاوه‌نگار (سرویس verify/lookup). تا کلید API وارد نشده، «حالت آزمایشی» کد را روی صفحه نشان می‌دهد.
درگاه: زرین‌پال (نسخه ۴) یا آیدی‌پی. تا کد پذیرنده وارد نشده، خرید غیرفعال است مگر «حالت آزمایشی پرداخت»
روشن باشد که اشتراک را بدون پول فعال می‌کند (فقط برای آزمون؛ در پنل هشدار داده می‌شود).
"""
from __future__ import annotations

import hashlib
import json
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_BILLING = {
    "weekly_price": 0, "monthly_price": 0, "weekly_days": 7, "monthly_days": 30,
    "gateway": "", "merchant_id": "", "sandbox": False, "test_mode": False,
    "free_preview": 3,   # تعداد فرصت برتر که بدون اشتراک کامل نمایش داده می‌شود
    "free_results": 10,  # تعداد نتیجهٔ اول هر جست‌وجو که برای همه نمایش داده می‌شود
    # کارت‌به‌کارت: مبلغ هر پرداخت با سه رقم یکتا پایان می‌یابد تا واریز بدون نیاز به انسان قابل شناسایی باشد
    "card_number": "", "card_holder": "", "card_bank": "", "card_auto_activate": True,
}
DEFAULT_SMS = {"provider": "kavenegar", "api_key": "", "template": "", "dev_mode": True}

OTP_TTL = 180
OTP_RESEND = 90
SESSION_DAYS = 30


def norm_phone(p: str) -> str | None:
    p = (p or "").translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789"))
    p = "".join(ch for ch in p if ch.isdigit() or ch == "+")
    if p.startswith("+98"):
        p = "0" + p[3:]
    elif p.startswith("98") and len(p) == 12:
        p = "0" + p[2:]
    elif p.startswith("9") and len(p) == 10:
        p = "0" + p
    return p if len(p) == 11 and p.startswith("09") else None


def _hash(code: str, phone: str) -> str:
    return hashlib.sha256(f"{phone}:{code}".encode()).hexdigest()


def _http_json(method, url, body=None, headers=None, timeout=20):
    """درخواست به درگاه یا پیامک؛ اگر پروکسی سیستم خاموش باشد، خودکار بدون پروکسی تکرار می‌شود."""
    from divar_client import NET, _opener, _system_proxies
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("accept", "application/json")
    if data is not None:
        req.add_header("content-type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    tries = [NET["proxy"]] + (["none"] if NET["proxy"] == "auto" and _system_proxies() else [])
    err = None
    for proxy in tries:
        try:
            with _opener(proxy).open(req, timeout=timeout) as r:
                return json.loads(r.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            try:
                return json.loads(e.read().decode() or "{}")
            except Exception:
                return {"error": f"HTTP {e.code}"}
        except Exception as e:  # شبکه
            err = e
    return {"error": str(err)}


class Billing:
    def __init__(self, store):
        self.store = store

    def cfg(self):
        return {**DEFAULT_BILLING, **(self.store.get_setting("billing") or {})}

    def sms_cfg(self):
        return {**DEFAULT_SMS, **(self.store.get_setting("sms") or {})}

    def plans(self):
        c = self.cfg()
        out = []
        for key, name in (("weekly", "هفتگی"), ("monthly", "ماهانه")):
            price = int(c.get(f"{key}_price") or 0)
            if price > 0:
                out.append({"id": key, "name": name, "price": price, "days": int(c.get(f"{key}_days") or 7)})
        return out

    def payable(self):
        c = self.cfg()
        return bool(self.plans()) and (c["test_mode"] or (c["gateway"] in ("zarinpal", "idpay") and c["merchant_id"])
                                       or (c["gateway"] == "card" and len(c["card_number"].replace("-", "").replace(" ", "")) == 16))

    # ---------------------------------------------------------- OTP
    def send_otp(self, phone_raw: str) -> dict:
        phone = norm_phone(phone_raw)
        if not phone:
            raise ValueError("شماره موبایل معتبر نیست")
        now = int(time.time())
        row = self.store.q("SELECT * FROM otps WHERE phone=?", (phone,), one=True)
        if row and now - (row["sent_at"] or 0) < OTP_RESEND:
            raise ValueError(f"کد قبلی هنوز معتبر است؛ {OTP_RESEND - (now - row['sent_at'])} ثانیه دیگر دوباره امتحان کنید")
        code = f"{secrets.randbelow(90000) + 10000}"
        self.store.x("INSERT OR REPLACE INTO otps(phone, code_hash, expires, attempts, sent_at) VALUES(?,?,?,?,?)",
                     (phone, _hash(code, phone), now + OTP_TTL, 0, now))
        s = self.sms_cfg()
        if s["api_key"] and s["template"]:
            url = (f"https://api.kavenegar.com/v1/{urllib.parse.quote(s['api_key'])}/verify/lookup.json?"
                   + urllib.parse.urlencode({"receptor": phone, "token": code, "template": s["template"]}))
            r = _http_json("GET", url)
            ok = (r.get("return") or {}).get("status") == 200
            self.store.log_request("sms", ok, f"ارسال کد به {phone[:4]}***{phone[-3:]}" + ("" if ok else f": {r}"))
            if not ok:
                raise ValueError("ارسال پیامک ناموفق بود؛ چند دقیقه دیگر امتحان کنید")
            return {"ok": True, "phone": phone}
        if s["dev_mode"]:
            return {"ok": True, "phone": phone, "dev_code": code}
        raise ValueError("ورود موقتاً در دسترس نیست")

    def verify_otp(self, phone_raw: str, code: str) -> dict:
        phone = norm_phone(phone_raw)
        code = (code or "").translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")).strip()
        row = self.store.q("SELECT * FROM otps WHERE phone=?", (phone,), one=True) if phone else None
        now = int(time.time())
        if not row or row["expires"] < now:
            raise ValueError("کد منقضی شده است؛ دوباره درخواست دهید")
        if row["attempts"] >= 5:
            raise ValueError("تلاش زیاد؛ کد تازه بگیرید")
        if not secrets.compare_digest(row["code_hash"], _hash(code, phone)):
            self.store.x("UPDATE otps SET attempts=attempts+1 WHERE phone=?", (phone,))
            raise ValueError("کد نادرست است")
        self.store.x("DELETE FROM otps WHERE phone=?", (phone,))
        self.store.x("INSERT OR IGNORE INTO users(phone, created) VALUES(?,?)", (phone, now))
        self.store.x("UPDATE users SET last_login=? WHERE phone=?", (now, phone))
        token = secrets.token_urlsafe(32)
        self.store.x("INSERT INTO user_sessions VALUES(?,?,?)", (token, phone, now + SESSION_DAYS * 86400))
        self.store.x("DELETE FROM user_sessions WHERE expires < ?", (now,))
        return {"token": token, "user": self.user(phone)}

    def user_by_token(self, token: str | None):
        if not token:
            return None
        r = self.store.q("SELECT phone FROM user_sessions WHERE token=? AND expires>?", (token, int(time.time())), one=True)
        return self.user(r["phone"]) if r else None

    def user(self, phone):
        r = self.store.q("SELECT * FROM users WHERE phone=?", (phone,), one=True)
        if not r:
            return None
        now = int(time.time())
        return {"phone": r["phone"], "sub_until": r["sub_until"] or 0, "plan": r["plan"],
                "active": (r["sub_until"] or 0) > now, "days_left": max(0, ((r["sub_until"] or 0) - now) // 86400)}

    def logout(self, token):
        self.store.x("DELETE FROM user_sessions WHERE token=?", (token,))

    # ---------------------------------------------------------- payment
    def activate(self, phone, plan_id, pay_id=None, ref=None):
        plan = next((p for p in self.plans() if p["id"] == plan_id), None)
        days = plan["days"] if plan else (7 if plan_id == "weekly" else 30)
        now = int(time.time())
        r = self.store.q("SELECT sub_until FROM users WHERE phone=?", (phone,), one=True)
        start = max(now, (r["sub_until"] or 0) if r else 0)
        self.store.x("UPDATE users SET sub_until=?, plan=? WHERE phone=?", (start + days * 86400, plan_id, phone))
        if pay_id:
            self.store.x("UPDATE payments SET status='paid', paid_at=?, ref_id=? WHERE id=?", (now, ref, pay_id))

    def start(self, phone, plan_id, callback_url) -> dict:
        plan = next((p for p in self.plans() if p["id"] == plan_id), None)
        if not plan:
            raise ValueError("این طرح اشتراک فعال نیست")
        c = self.cfg()
        now = int(time.time())
        cur = self.store.x("INSERT INTO payments(phone, plan, amount, gateway, created) VALUES(?,?,?,?,?)",
                           (phone, plan_id, plan["price"], "test" if c["test_mode"] else c["gateway"], now))
        pid = cur.lastrowid
        if c["test_mode"]:
            self.activate(phone, plan_id, pid, "TEST")
            self.store.x("UPDATE payments SET note='حالت آزمایشی؛ پولی دریافت نشد' WHERE id=?", (pid,))
            return {"ok": True, "activated": True, "test": True}
        if c["gateway"] == "card":
            return self._card_start(pid, plan)
        rial = plan["price"] * 10
        cb = f"{callback_url}?pid={pid}"
        if c["gateway"] == "zarinpal":
            host = "sandbox.zarinpal.com" if c["sandbox"] else "payment.zarinpal.com"
            r = _http_json("POST", f"https://{host}/pg/v4/payment/request.json",
                           {"merchant_id": c["merchant_id"], "amount": rial, "callback_url": cb,
                            "description": f"اشتراک {plan['name']} فرصت‌یاب", "metadata": {"mobile": phone}})
            auth = (r.get("data") or {}).get("authority")
            if not auth:
                self.store.x("UPDATE payments SET status='failed', note=? WHERE id=?", (json.dumps(r, ensure_ascii=False)[:300], pid))
                raise ValueError("اتصال به درگاه ناموفق بود")
            self.store.x("UPDATE payments SET authority=? WHERE id=?", (auth, pid))
            return {"ok": True, "redirect": f"https://{host}/pg/StartPay/{auth}"}
        if c["gateway"] == "idpay":
            r = _http_json("POST", "https://api.idpay.ir/v1.1/payment",
                           {"order_id": str(pid), "amount": rial, "phone": phone, "callback": cb, "desc": f"اشتراک {plan['name']}"},
                           {"X-API-KEY": c["merchant_id"], "X-SANDBOX": "1" if c["sandbox"] else "0"})
            if not r.get("link"):
                self.store.x("UPDATE payments SET status='failed', note=? WHERE id=?", (json.dumps(r, ensure_ascii=False)[:300], pid))
                raise ValueError("اتصال به درگاه ناموفق بود")
            self.store.x("UPDATE payments SET authority=? WHERE id=?", (r.get("id"), pid))
            return {"ok": True, "redirect": r["link"]}
        raise ValueError("درگاه پرداخت هنوز تنظیم نشده است")

    # ---------------------------------------------------------- card to card
    def _card_start(self, pid, plan):
        c = self.cfg()
        if len(c["card_number"].replace("-", "").replace(" ", "")) != 16:
            raise ValueError("شماره کارت هنوز در پنل وارد نشده است")
        busy = {r["amount"] for r in self.store.q(
            "SELECT amount FROM payments WHERE gateway='card' AND status IN ('pending','review') AND created>?", (int(time.time()) - 3 * 86400,))}
        for _ in range(50):
            amount = plan["price"] + 100 + secrets.randbelow(900)
            if amount not in busy:
                break
        self.store.x("UPDATE payments SET amount=?, note='در انتظار رسید کارت‌به‌کارت' WHERE id=?", (amount, pid))
        return {"ok": True, "card": {"number": c["card_number"], "holder": c["card_holder"], "bank": c["card_bank"]},
                "payment_id": pid, "amount": amount, "plan": plan["name"]}

    def card_receipt(self, phone, pid, tracking, image: bytes | None, receipts_dir) -> dict:
        pay = self.store.q("SELECT * FROM payments WHERE id=? AND phone=? AND gateway='card'", (int(pid or 0), phone), one=True)
        if not pay:
            raise ValueError("پرداخت پیدا نشد")
        if pay["status"] not in ("pending",):
            raise ValueError("رسید این پرداخت قبلاً ثبت شده است")
        tracking = "".join(ch for ch in str(tracking or "").translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")) if ch.isalnum())[:40]
        if len(tracking) < 4 and not image:
            raise ValueError("کد پیگیری یا تصویر رسید را وارد کنید")
        if image:
            receipts_dir.mkdir(parents=True, exist_ok=True)
            (receipts_dir / f"{pay['id']}.img").write_bytes(image)
        auto = self.cfg()["card_auto_activate"]
        self.store.x("UPDATE payments SET status='review', ref_id=?, note=? WHERE id=?",
                     (tracking, ("فعال‌شده پیش از بررسی" if auto else "در انتظار بررسی") + ("؛ رسید تصویری دارد" if image else ""), pay["id"]))
        if auto:
            self.activate(phone, pay["plan"])
        return {"ok": True, "activated": bool(auto)}

    def review(self, pid, approve: bool):
        """تأیید یا رد واریز کارت‌به‌کارت؛ رد کردن، روزهای اشتراک فعال‌شده را پس می‌گیرد."""
        pay = self.store.q("SELECT * FROM payments WHERE id=?", (int(pid),), one=True)
        if not pay or pay["status"] != "review":
            raise ValueError("این پرداخت در انتظار بررسی نیست")
        now = int(time.time())
        if approve:
            if "فعال‌شده" not in (pay["note"] or ""):
                self.activate(pay["phone"], pay["plan"])
            self.store.x("UPDATE payments SET status='paid', paid_at=? WHERE id=?", (now, pay["id"]))
            return
        if "فعال‌شده" in (pay["note"] or ""):
            plan = next((p for p in self.plans() if p["id"] == pay["plan"]), None)
            days = plan["days"] if plan else 7
            self.store.x("UPDATE users SET sub_until=MAX(0, sub_until-?) WHERE phone=?", (days * 86400, pay["phone"]))
        self.store.x("UPDATE payments SET status='rejected' WHERE id=?", (pay["id"],))

    def callback(self, params: dict) -> bool:
        pid = int(params.get("pid") or params.get("order_id") or 0)
        pay = self.store.q("SELECT * FROM payments WHERE id=?", (pid,), one=True)
        if not pay or pay["status"] == "paid":
            return bool(pay and pay["status"] == "paid")
        c = self.cfg()
        ok, ref = False, None
        if pay["gateway"] == "zarinpal" and params.get("Status") == "OK":
            host = "sandbox.zarinpal.com" if c["sandbox"] else "payment.zarinpal.com"
            r = _http_json("POST", f"https://{host}/pg/v4/payment/verify.json",
                           {"merchant_id": c["merchant_id"], "amount": pay["amount"] * 10, "authority": params.get("Authority") or pay["authority"]})
            d = r.get("data") or {}
            ok, ref = d.get("code") in (100, 101), d.get("ref_id")
        elif pay["gateway"] == "idpay" and str(params.get("status")) in ("10", "100"):
            r = _http_json("POST", "https://api.idpay.ir/v1.1/payment/verify", {"id": params.get("id") or pay["authority"], "order_id": str(pid)},
                           {"X-API-KEY": c["merchant_id"], "X-SANDBOX": "1" if c["sandbox"] else "0"})
            ok, ref = int(r.get("status") or 0) in (100, 101), (r.get("payment") or {}).get("track_id")
        if ok:
            self.activate(pay["phone"], pay["plan"], pid, str(ref))
        else:
            self.store.x("UPDATE payments SET status='failed' WHERE id=?", (pid,))
        return ok
