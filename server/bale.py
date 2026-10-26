"""اتصال به پیام‌رسان بله: کد ورود، پرداخت با «بله‌پی» و پیام‌های اطلاع‌رسانی؛ همه خودکار و بدون دخالت انسان.

- ربات بله را در خود بله از @botfather می‌سازید؛ توکن و نام کاربری ربات در پنل وارد می‌شود.
- سرور با «دریافت پیوستهٔ به‌روزرسانی‌ها» (getUpdates) کار می‌کند؛ نیازی به وب‌هوک و دامنهٔ جدا نیست.
  سرور بله (tapi.bale.ai) داخلی است و در قطع اینترنت بین‌الملل هم در دسترس می‌ماند.
- کد ورود: اولین بار کاربر در ربات «اشتراک شمارهٔ من» را می‌زند؛ بله شماره را تأیید می‌کند و
  ربات کد را می‌فرستد. از آن پس کد مستقیم در بله ارسال می‌شود.
- پرداخت: صورت‌حساب (sendInvoice) در بله ارسال می‌شود. پس از پرداخت موفق، بله پیام successful_payment
  می‌فرستد؛ مبلغ و شناسه بررسی و اشتراک همان لحظه فعال می‌شود و رسید در بله و (در صورت فعال بودن) پیامک ارسال می‌شود.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import threading
import time
import traceback
import urllib.request

API = "https://tapi.bale.ai/bot{token}/{method}"
DEFAULT_BALE = {"token": "", "bot_username": "", "provider_token": "",
                "otp": False,       # ارسال کد ورود در بله
                "pay": False,       # پرداخت با بله‌پی
                "notify": True}     # پیام فعال‌سازی و رسید در بله برای کاربرانی که ربات را آغاز کرده‌اند
SQL = """
CREATE TABLE IF NOT EXISTS bale_links (phone TEXT PRIMARY KEY, chat_id INTEGER, user_id INTEGER, linked_at INTEGER);
CREATE TABLE IF NOT EXISTS bale_nonce (nonce TEXT PRIMARY KEY, kind TEXT, phone TEXT, pid INTEGER, created INTEGER);
"""


def _fa(n) -> str:
    return f"{int(n):,}".translate(str.maketrans("0123456789,", "۰۱۲۳۴۵۶۷۸۹٬"))


class Bale:
    KEY, TBL, API, DEFAULTS, NAME = "bale", "bale", API, DEFAULT_BALE, "بله"

    def __init__(self, store, billing):
        self.store, self.billing = store, billing
        with store.lock:
            store.db.executescript(SQL.replace("bale_", self.TBL + "_"))
            store.db.commit()
        self.state = {"running": False, "last_ok": None, "last_error": None, "bot": None}
        self.stop = threading.Event()
        self.thread = None

    # ---------------------------------------------------------- config
    def cfg(self):
        return {**self.DEFAULTS, **(self.store.get_setting(self.KEY) or {})}

    def ready(self) -> bool:
        c = self.cfg()
        return bool(c["token"] and c["bot_username"])

    def otp_ready(self) -> bool:
        return self.ready() and bool(self.cfg()["otp"])

    def pay_ready(self) -> bool:
        c = self.cfg()
        return self.ready() and bool(c["pay"] and c["provider_token"])

    def link_url(self, payload: str) -> str:
        return f"https://ble.ir/{self.cfg()['bot_username'].lstrip('@')}?start={payload}"

    # ---------------------------------------------------------- http
    def call(self, method, body=None, timeout=30):
        from divar_client import NET, _opener
        c = self.cfg()
        req = urllib.request.Request(self.api_url(c, method),
                                     data=json.dumps(body or {}).encode(), method="POST",
                                     headers={"content-type": "application/json"})
        with _opener(NET["proxy"]).open(req, timeout=timeout) as r:
            res = json.loads(r.read().decode() or "{}")
        if not res.get("ok"):
            raise RuntimeError(res.get("description") or "خطای " + self.NAME)
        return res.get("result")

    def api_url(self, c, method) -> str:
        return self.API.format(token=c["token"], method=method)

    def send(self, chat_id, text, **extra):
        try:
            return self.call("sendMessage", {"chat_id": chat_id, "text": text, **extra})
        except Exception as e:  # noqa: BLE001
            self.state["last_error"] = f"ارسال پیام: {e}"
            return None

    def chat_of(self, phone):
        r = self.store.q(f"SELECT chat_id FROM {self.TBL}_links WHERE phone=?", (phone,), one=True)
        return r["chat_id"] if r else None

    def test(self) -> dict:
        me = self.call("getMe", timeout=15)
        self.state["bot"] = me
        return me

    # ---------------------------------------------------------- nonce
    def _nonce(self, kind, phone=None, pid=None) -> str:
        n = secrets.token_urlsafe(9).replace("-", "x").replace("_", "y")
        now = int(time.time())
        self.store.x(f"INSERT INTO {self.TBL}_nonce VALUES(?,?,?,?,?)", (n, kind, phone, pid, now))
        self.store.x(f"DELETE FROM {self.TBL}_nonce WHERE created < ?", (now - 86400,))
        return n

    def _take(self, n):
        r = self.store.q(f"SELECT * FROM {self.TBL}_nonce WHERE nonce=? AND created > ?", (n, int(time.time()) - 86400), one=True)
        return dict(r) if r else None

    # ---------------------------------------------------------- otp
    def start_otp(self, phone, code) -> dict:
        """کد را در بله می‌فرستد؛ اگر شماره هنوز به ربات وصل نیست، پیوند ربات برمی‌گردد و کد پس از تأیید شماره ارسال می‌شود."""
        chat = self.chat_of(phone)
        if chat and self.send(chat, f"کد ورود شما به فرصت ملک: {code}\nاین کد تا ۳ دقیقه معتبر است. آن را به کسی ندهید."):
            return {"sent": True}
        n = self._nonce("otp", phone)
        return {"sent": False, "link": self.link_url("otp_" + n)}

    # ---------------------------------------------------------- pay
    def start_pay(self, pid) -> dict:
        pay = self.store.q("SELECT * FROM payments WHERE id=?", (pid,), one=True)
        chat = self.chat_of(pay["phone"])
        if chat and self.send_invoice(chat, pay):
            return {"sent": True, "link": self.link_url("open"), "payment_id": pid}
        n = self._nonce("pay", pay["phone"], pid)
        return {"sent": False, "link": self.link_url("pay_" + n), "payment_id": pid}

    def _sig(self, pid) -> str:
        return hmac.new(self.cfg()["token"].encode(), f"pay:{pid}".encode(), hashlib.sha256).hexdigest()[:16]

    def send_invoice(self, chat, pay) -> bool:
        plan = next((p for p in self.billing.plans() if p["id"] == pay["plan"]), None)
        name = plan["name"] if plan else pay["plan"]
        try:
            self.call("sendInvoice", {
                "chat_id": chat, "title": f"اشتراک {name} فرصت ملک"[:32],
                "description": f"دسترسی کامل به فرصت‌ها و شناسنامهٔ قیمت آگهی‌ها؛ {plan['days'] if plan else ''} روز. پس از پرداخت، اشتراک خودکار فعال می‌شود."[:255],
                "payload": f"pay:{pay['id']}:{self._sig(pay['id'])}", "provider_token": self.cfg()["provider_token"],
                "currency": "IRR", "prices": [{"label": f"اشتراک {name}", "amount": int(pay["amount"]) * 10}]})
            self.store.x("UPDATE payments SET note='صورت‌حساب در بله ارسال شد' WHERE id=?", (pay["id"],))
            return True
        except Exception as e:  # noqa: BLE001
            self.state["last_error"] = f"ارسال صورت‌حساب: {e}"
            return False

    def _check_payload(self, payload):
        try:
            _, pid, sig = (payload or "").split(":")
            pid = int(pid)
        except ValueError:
            return None
        if not hmac.compare_digest(sig, self._sig(pid)):
            return None
        return self.store.q("SELECT * FROM payments WHERE id=? AND gateway='bale'", (pid,), one=True)

    # ---------------------------------------------------------- updates
    def link(self, phone, chat_id, user_id=None):
        self.store.x(f"INSERT OR REPLACE INTO {self.TBL}_links VALUES(?,?,?,?)", (phone, chat_id, user_id, int(time.time())))

    def handle(self, u: dict):
        from billing import norm_phone
        if u.get("pre_checkout_query"):
            q = u["pre_checkout_query"]
            pay = self._check_payload(q.get("invoice_payload"))
            ok = bool(pay and pay["status"] == "pending" and int(q.get("total_amount") or 0) == int(pay["amount"]) * 10)
            body = {"pre_checkout_query_id": q["id"], "ok": ok}
            if not ok:
                body["error_message"] = "این صورت‌حساب معتبر نیست یا قبلاً پرداخت شده است."
            self.call("answerPreCheckoutQuery", body)
            return
        m = u.get("message") or {}
        chat = (m.get("chat") or {}).get("id")
        if not chat:
            return
        if m.get("successful_payment"):
            sp = m["successful_payment"]
            pay = self._check_payload(sp.get("invoice_payload"))
            if not pay:
                self.send(chat, "پرداخت دریافت شد اما صورت‌حساب شناخته نشد؛ لطفاً از بخش پشتیبانی سایت پیگیری کنید.")
                return
            if pay["status"] != "paid" and int(sp.get("total_amount") or 0) == int(pay["amount"]) * 10:
                ref = sp.get("provider_payment_charge_id") or sp.get("telegram_payment_charge_id") or ""
                self.billing.activate(pay["phone"], pay["plan"], pay["id"], str(ref))
                self.store.x("UPDATE payments SET note='پرداخت با بله‌پی؛ تأیید خودکار' WHERE id=?", (pay["id"],))
            return
        text = (m.get("text") or "").strip()
        frm = m.get("from") or {}
        if m.get("contact"):
            c = m["contact"]
            if c.get("user_id") and frm.get("id") and c["user_id"] != frm["id"]:
                self.send(chat, "فقط شمارهٔ خودتان را با دکمهٔ «اشتراک شمارهٔ من» بفرستید.")
                return
            phone = norm_phone(c.get("phone_number"))
            pend = self.store.q("SELECT * FROM bale_nonce WHERE kind='otp_wait' AND pid=? ORDER BY created DESC", (chat,), one=True)
            if not phone or not pend or pend["phone"] != phone:
                self.send(chat, "این شماره با شماره‌ای که در سایت وارد کرده‌اید یکی نیست. در سایت دوباره «دریافت کد در بله» را بزنید.",
                          reply_markup={"remove_keyboard": True})
                return
            self.link(phone, chat, frm.get("id"))
            self.store.x("DELETE FROM bale_nonce WHERE nonce=?", (pend["nonce"],))
            code = self.billing.fresh_code(phone)
            self.send(chat, f"شماره تأیید شد ✅\nکد ورود شما به فرصت ملک: {code}\nاین کد تا ۳ دقیقه معتبر است. از این پس کدها مستقیم همین‌جا می‌آید.",
                      reply_markup={"remove_keyboard": True})
            return
        if text.startswith("/start"):
            arg = text[6:].strip()
            if arg.startswith("otp_"):
                n = self._take(arg[4:])
                if not n or n["kind"] != "otp":
                    self.send(chat, "این پیوند منقضی شده است؛ در سایت دوباره «دریافت کد در بله» را بزنید.")
                    return
                self.store.x("UPDATE bale_nonce SET kind='otp_wait', pid=? WHERE nonce=?", (chat, n["nonce"]))
                self.send(chat, "برای تأیید شماره، دکمهٔ زیر را بزنید تا بله شماره‌تان را بفرستد؛ کد ورود فوراً همین‌جا ارسال می‌شود.",
                          reply_markup={"keyboard": [[{"text": "📱 اشتراک شمارهٔ من", "request_contact": True}]], "resize_keyboard": True, "one_time_keyboard": True})
                return
            if arg.startswith("alert_"):   # وصل کردن حساب سایت به این گفت‌وگو برای هشدار فرصت‌های تازه
                n = self._take(arg[6:])
                if not n or n["kind"] != "alert":
                    self.send(chat, "این پیوند منقضی شده است؛ در سایت دوباره «خبرم کن» را بزنید.")
                    return
                self.link(n["phone"], chat, frm.get("id"))
                self.send(chat, "🔔 هشدار فرصت‌های تازه فعال شد.\nهر وقت آگهی تازه‌ای با امتیاز بالا در منطقهٔ انتخابی شما پیدا شود، همین‌جا خبرتان می‌کنیم (حداکثر چند پیام در روز).")
                return
            if arg.startswith("pay_"):
                n = self._take(arg[4:])
                if not n or n["kind"] != "pay":
                    self.send(chat, "این پیوند پرداخت منقضی شده است؛ از صفحهٔ اشتراک سایت دوباره اقدام کنید.")
                    return
                self.link(n["phone"], chat, frm.get("id"))
                pay = self.store.q("SELECT * FROM payments WHERE id=?", (n["pid"],), one=True)
                if pay and pay["status"] == "pending":
                    self.send_invoice(chat, pay)
                else:
                    self.send(chat, "این پرداخت قبلاً انجام شده است. ✅")
                return
            self.send(chat, "سلام! این ربات رسمی فرصت ملک است: کد ورود، صورت‌حساب اشتراک و پیام فعال‌سازی را همین‌جا دریافت می‌کنید.\nforsatmelk.ir")

    def loop(self):
        offset = int(self.store.get_setting(self.KEY + "_offset") or 0)
        while not self.stop.is_set():
            if not self.ready():
                self.state["running"] = False
                self.stop.wait(15)
                continue
            self.state["running"] = True
            try:
                ups = self.call("getUpdates", {**({"offset": offset + 1} if offset else {}), "timeout": 25}, timeout=40) or []
                self.state["last_ok"] = int(time.time())
                for u in ups:
                    offset = max(offset, int(u.get("update_id") or 0))
                    try:
                        self.handle(u)
                    except Exception as e:  # noqa: BLE001
                        traceback.print_exc()
                        self.state["last_error"] = str(e)[:200]
                if ups:
                    self.store.set_setting(self.KEY + "_offset", offset)
            except Exception as e:  # noqa: BLE001
                self.state["last_error"] = str(e)[:200]
                self.stop.wait(10)

    def start(self):
        if self.thread and self.thread.is_alive():
            return
        self.thread = threading.Thread(target=self.loop, name=self.KEY, daemon=True)
        self.thread.start()

    # ---------------------------------------------------------- notify
    def notify_paid(self, phone, plan_name, days, until, amount, pid):
        chat = self.chat_of(phone)
        if not (chat and self.ready() and self.cfg()["notify"]):
            return
        from seo import jdate
        self.send(chat, f"✅ پرداخت شما دریافت شد و اشتراک فعال است.\n"
                        f"طرح: {plan_name} ({_fa(days)} روز)\nمبلغ: {_fa(amount)} تومان\nشمارهٔ فاکتور: {_fa(pid)}\n"
                        f"اعتبار تا: {jdate(until)}\nفاکتور: https://forsatmelk.ir/#/invoice/{pid}")


TG_API = "https://api.telegram.org/bot{token}/{method}"
DEFAULT_TG = {"token": "", "bot_username": "", "alerts": True,
              "assistant": True,   # دستیار هوشمند: منو، جست‌وجو، ماشین‌حساب، پرسش‌ها و پشتیبانی (tgbot.py)
              "notify": True,      # رسید پرداخت، پاسخ تیکت و یادآوری تمدید در تلگرام
              "api_base": ""}      # نشانی واسط (مثلاً Cloudflare Worker) وقتی api.telegram.org از سرور فیلتر است


class Telegram(Bale):
    """ربات تلگرام: هشدار «خبرم کن»، رسید و پاسخ پشتیبانی، و دستیار هوشمند فارسی (tgbot.Assistant).
    توجه: اگر سرور در ایران است، دسترسی به api.telegram.org معمولاً فقط با پروکسی خروجی ممکن است
    (همان پروکسی بخش «دریافت آگهی‌ها»)."""
    KEY, TBL, API, DEFAULTS, NAME = "telegram", "tg", TG_API, DEFAULT_TG, "تلگرام"
    assistant = None   # در App ساخته می‌شود

    def otp_ready(self) -> bool:
        return False

    def pay_ready(self) -> bool:
        return False

    def ready(self) -> bool:
        c = self.cfg()
        return bool(c["token"] and c["bot_username"] and (c.get("alerts", True) or c.get("assistant", True)))

    def link_url(self, payload: str) -> str:
        return f"https://t.me/{self.cfg()['bot_username'].lstrip('@')}?start={payload}"

    def api_url(self, c, method) -> str:
        base = (c.get("api_base") or "").strip().rstrip("/") or "https://api.telegram.org"
        return f"{base}/bot{c['token']}/{method}"

    def call(self, method, body=None, timeout=30):
        import urllib.error
        try:
            return super().call(method, body, timeout)
        except urllib.error.HTTPError as e:   # تلگرام خطا را با کد HTTP و متن JSON برمی‌گرداند (مثلاً توکن نادرست)
            try:
                desc = json.loads(e.read().decode() or "{}").get("description") or ""
            except Exception:  # noqa: BLE001
                desc = ""
            via = (self.cfg().get("api_base") or "").strip()
            if via and not desc and e.code in (401, 403):   # پاسخ خود واسط، نه تلگرام (مثلاً اسکریپت گوگل که دسترسی‌اش روی Anyone نیست)
                raise RuntimeError("واسط اجازهٔ دسترسی نمی‌دهد؛ در اسکریپت گوگل، Who has access باید Anyone باشد") from None
            raise RuntimeError(("توکن ربات نادرست است یا باطل شده" if e.code == 401 else f"خطای تلگرام {e.code}") + (f" ({desc})" if desc else "")) from None
        except (urllib.error.URLError, OSError) as e:
            via = (self.cfg().get("api_base") or "").strip()
            raise RuntimeError(("نشانی واسط تلگرام در دسترس نیست یا درست کار نمی‌کند" if via else
                                "سرور به api.telegram.org دسترسی ندارد (فیلتر)؛ «نشانی واسط تلگرام» را در پنل تنظیم کنید")
                               + f" — {getattr(e, 'reason', e)}") from None

    def start(self):
        super().start()
        if self.assistant and not getattr(self, "_periodic", None):
            from tgbot import periodic
            self._periodic = threading.Thread(target=periodic, args=(self.assistant, self.stop), name="tg-assistant", daemon=True)
            self._periodic.start()

    def handle(self, u: dict):
        if self.assistant and self.cfg().get("assistant", True):
            return self.assistant.handle(u)
        m = u.get("message") or {}
        chat = (m.get("chat") or {}).get("id")
        if not chat:
            return
        text = (m.get("text") or "").strip()
        frm = m.get("from") or {}
        if text.startswith("/start"):
            arg = text[6:].strip()
            if arg.startswith("alert_"):
                n = self._take(arg[6:])
                if not n or n["kind"] != "alert":
                    self.send(chat, "این پیوند منقضی شده است؛ در سایت دوباره «خبرم کن» را بزنید.")
                    return
                self.link(n["phone"], chat, frm.get("id"))
                self.send(chat, "🔔 هشدار فرصت‌های تازه در تلگرام فعال شد.\nهر وقت آگهی تازه‌ای با امتیاز بالا در منطقهٔ انتخابی شما پیدا شود، همین‌جا خبرتان می‌کنیم (حداکثر چند پیام در روز).")
                return
            self.send(chat, "سلام! این ربات رسمی فرصت ملک است: هشدار فرصت‌های تازهٔ ملک را همین‌جا دریافت می‌کنید.\nforsatmelk.ir")


def send_instant_opportunity_alert(chat_id, deal_data, bot_token):
    """
    ارسال بلادرنگ آگهی شکار شده با قالب مارک‌داون رسمی بله
    """
    neighborhood = deal_data.get('neighborhood', 'تهران')
    area = deal_data.get('area', 0)
    price_b = deal_data.get('total_price_billion', 0)
    sqm_m = deal_data.get('listed_sqm', 0)
    discount = deal_data.get('discount_pct', 0)
    profit = deal_data.get('potential_profit_billion', 0)
    url = deal_data.get('source_url', 'https://forsatmelk.ir')
    risk_level = deal_data.get('risk_score', 10)

    risk_badge = "🟢 تایید اولیه سند رسمی" if risk_level < 40 else "🟡 نیازمند استعلام سند ثبتی"
    if risk_level >= 70:
        risk_badge = "🔴 هشدار: احتمال آگهی صوری (تخفیف نامتعارف)"

    text = f"""🔥 **شکار فرصت ملکی جدید در {neighborhood}**

🏢 **مشخصات:** {area} متر · {deal_data.get('age', 0)} سال ساخت
💰 **قیمت کل:** {price_b} میلیارد تومان (متری {sqm_m} م.ت)
📉 **تخفیف نسبت به عرف:** {discount}% زیر قیمت منصفانه
💎 **سود تخمینی خرید:** +{profit} میلیارد تومان
🛡️ **وضعیت اصالت:** {risk_badge}

⚡ *فرصت ملک | موتور هوشمند پردازش و تحلیل آماری بازار مسکن*"""

    payload = {
        "chat_id": chat_id,
        "text": text,
        "reply_markup": {
            "inline_keyboard": [
                [{"text": "📞 تماس با فروشنده / منبع اصلی", "url": url}],
                [{"text": "📊 گزارش کامل محله در سایت", "url": "https://forsatmelk.ir"}]
            ]
        }
    }

    api_url = f"https://tapi.bale.ai/bot{bot_token}/sendMessage"
    req = urllib.request.Request(
        api_url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status == 200
    except Exception as e:
        print(f"Error sending Bale alert: {e}")
        return False
