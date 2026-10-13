"""آزمون بله: کد ورود (بار اول با تأیید شماره، سپس مستقیم)، بله‌پی خودکار، رد مبلغ نادرست و روش غیرفعال.
سرور بله شبیه‌سازی می‌شود (بدون شبکه)."""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
from bale import Bale  # noqa: E402
from billing import Billing  # noqa: E402
from store import Store  # noqa: E402


def ok(cond, msg):
    if not cond:
        raise SystemExit("✘ " + msg)
    print("✔ " + msg)


tmp = tempfile.mkdtemp()
st = Store(Path(tmp) / "t.db")
bill = Billing(st)
bale = Bale(st, bill)
bill.bale = bale
calls = []


def fake_call(method, body=None, timeout=30):
    calls.append((method, body or {}))
    return {"ok": True}


bale.call = fake_call
PHONE, CHAT, UID = "09121234567", 555, 777

# روش‌ها پیش از تنظیم: همه دیده می‌شوند ولی آماده نیستند
ok(not any(c["ready"] for c in bill.login_channels() if c["id"] == "bale"), "کد در بله پیش از تنظیم «فعلاً فعال نیست»")
try:
    bill.send_otp(PHONE, local=False, channel="bale")
    ok(False, "باید خطا می‌داد")
except ValueError as e:
    ok("فعال نیست" in str(e), "درخواست کد بله پیش از فعال‌سازی رد می‌شود")

st.set_setting("bale", {"token": "1:abc", "bot_username": "forsatmelk_bot", "provider_token": "6037000000000000", "otp": True, "pay": True})
ok(bill.login_channels()[1]["ready"], "پس از تنظیم در پنل، «دریافت کد در بله» فعال است")

# ---- کد ورود، بار اول: پیوند ربات و تأیید شماره
r = bill.send_otp(PHONE, local=False, channel="bale")
ok(r["channel"] == "bale" and not r["sent"] and r["link"].startswith("https://ble.ir/forsatmelk_bot?start=otp_"), "بار اول پیوند ربات برمی‌گردد")
nonce = r["link"].split("start=")[1]
bale.handle({"message": {"chat": {"id": CHAT}, "from": {"id": UID}, "text": "/start " + nonce}})
ok(calls[-1][1].get("reply_markup", {}).get("keyboard"), "ربات دکمهٔ «اشتراک شمارهٔ من» را می‌فرستد")
# شمارهٔ کس دیگر پذیرفته نمی‌شود
bale.handle({"message": {"chat": {"id": CHAT}, "from": {"id": UID}, "contact": {"phone_number": "989121234567", "user_id": 999}}})
ok("خودتان" in calls[-1][1]["text"], "شمارهٔ شخص دیگر رد می‌شود")
bale.handle({"message": {"chat": {"id": CHAT}, "from": {"id": UID}, "contact": {"phone_number": "989121234567", "user_id": UID}}})
txt = calls[-1][1]["text"]
code = "".join(ch for ch in txt.split("کد ورود شما به فرصت ملک:")[1].split("\n")[0] if ch.isdigit())
ok(len(code) == 5, f"پس از تأیید شماره، کد در بله ارسال شد ({code})")
res = bill.verify_otp(PHONE, code)
ok(res["token"] and res["user"]["phone"] == PHONE, "ورود با کد بله موفق است")

# ---- بار دوم: کد مستقیم
st.x("UPDATE otps SET sent_at=0")
r = bill.send_otp(PHONE, local=False, channel="bale")
ok(r["sent"] and calls[-1][0] == "sendMessage" and calls[-1][1]["chat_id"] == CHAT, "بار دوم کد مستقیم در بله ارسال می‌شود")

# ---- بله‌پی
st.set_setting("billing", {"monthly_price": 500000, "monthly_days": 30, "pay_methods": ["bale", "card"], "trial_enabled": False})
ms = {m["id"]: m["ready"] for m in bill.methods_public()}
ok(ms["bale"] and not ms["card"] and not ms["zarinpal"], "بله‌پی آماده؛ کارت‌به‌کارت (بی‌شماره کارت) و زرین‌پال «فعلاً فعال نیست»")
try:
    bill.start(PHONE, "monthly", "http://x/cb", local=False, method="zarinpal")
    ok(False, "باید خطا می‌داد")
except ValueError as e:
    ok("فعال نیست" in str(e), "انتخاب روش غیرفعال پیام «فعلاً فعال نیست» می‌دهد")
r = bill.start(PHONE, "monthly", "http://x/cb", local=False, method="bale")
pid = r["payment_id"]
inv = calls[-1]
ok(r["bale"]["sent"] and inv[0] == "sendInvoice" and inv[1]["prices"][0]["amount"] == 5000000 and inv[1]["currency"] == "IRR", "صورت‌حساب ۵۰۰٬۰۰۰ تومانی (ریال) در بله ارسال شد")
payload = inv[1]["payload"]
# پیش‌پرداخت با مبلغ نادرست رد می‌شود
bale.handle({"pre_checkout_query": {"id": "q1", "invoice_payload": payload, "total_amount": 100}})
ok(calls[-1] == ("answerPreCheckoutQuery", {"pre_checkout_query_id": "q1", "ok": False, "error_message": calls[-1][1].get("error_message")}), "پیش‌پرداخت با مبلغ نادرست رد می‌شود")
# بار جعلی (امضای نادرست)
bale.handle({"pre_checkout_query": {"id": "q2", "invoice_payload": f"pay:{pid}:deadbeefdeadbeef", "total_amount": 5000000}})
ok(calls[-1][1]["ok"] is False, "صورت‌حساب جعلی رد می‌شود")
bale.handle({"pre_checkout_query": {"id": "q3", "invoice_payload": payload, "total_amount": 5000000}})
ok(calls[-1][1]["ok"] is True, "پیش‌پرداخت معتبر پذیرفته می‌شود")
before = bill.user(PHONE)["days_left"]
bale.handle({"message": {"chat": {"id": CHAT}, "from": {"id": UID}, "successful_payment": {"invoice_payload": payload, "total_amount": 5000000, "provider_payment_charge_id": "BP-123"}}})
u = bill.user(PHONE)
pay = st.q("SELECT * FROM payments WHERE id=?", (pid,), one=True)
ok(u["active"] and u["days_left"] == before + 30 and pay["status"] == "paid" and pay["ref_id"] == "BP-123", "پس از پرداخت، اشتراک خودکار فعال و پرداخت ثبت شد")
ok(any(c[0] == "sendMessage" and "پرداخت شما دریافت شد" in c[1].get("text", "") and "فاکتور" in c[1]["text"] for c in calls[-3:]), "رسید و فاکتور فوراً در بله ارسال شد")
inv = bill.invoice(PHONE, pid)
ok(inv["status"] == "paid" and inv["amount"] == 500000 and inv["gateway"] == "بله‌پی", "فاکتور در سایت آماده است")
# تکرار پیام پرداخت، اشتراک را دوبار تمدید نمی‌کند
bale.handle({"message": {"chat": {"id": CHAT}, "from": {"id": UID}, "successful_payment": {"invoice_payload": payload, "total_amount": 5000000}}})
ok(bill.user(PHONE)["days_left"] == before + 30, "پیام تکراری پرداخت، اشتراک را دوبار تمدید نمی‌کند")
try:
    bill.invoice("09350000000", pid)
    ok(False, "باید خطا می‌داد")
except ValueError:
    ok(True, "فاکتور هر کاربر فقط برای خودش باز می‌شود")
print("همهٔ آزمون‌های بله موفق بود.")
