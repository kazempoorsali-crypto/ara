"""آزمون «بزن به کارت» (کارت‌به‌کارت خودکار) با سرور شبیه‌سازی‌شده: ساخت سفارش، بازگشت در انتظار، تطبیق و فعال‌سازی، انقضا، امضای اعلان."""
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

MOCK = {"orders": {}, "seen": []}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, code, body):
        b = json.dumps(body).encode()
        self.send_response(code); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("content-length") or 0)) or b"{}")
        MOCK["seen"].append((self.path, dict(self.headers), body))
        if self.headers.get("x-api-key") != "KEY-12345678":
            return self.reply(401, {"code": "unauthenticated", "detail": "کلید نامعتبر"})
        tok = "tok" + str(len(MOCK["orders"]) + 1)
        MOCK["orders"][tok] = {"status": "pending", "unique_amount": body["amount"] + 543}
        self.reply(200, {"order_id": "o1", "order_code": "BZ-77", "payment_token": tok, "payment_url": f"https://bezanbecard.ir/pay/{tok}", "unique_amount": body["amount"] + 543, "status": "pending"})

    def do_GET(self):
        if self.headers.get("x-api-key") != "KEY-12345678":
            return self.reply(401, {"code": "unauthenticated", "detail": "کلید نامعتبر"})
        if self.path.endswith("/public/me"):
            return self.reply(200, {"merchant_id": "m1", "store_name": "فرصت ملک"})
        tok = self.path.rsplit("/", 1)[1]
        o = MOCK["orders"].get(tok)
        return self.reply(200, {"order_id": "o1", "order_code": "BZ-77", **o}) if o else self.reply(404, {"code": "not_found", "detail": "یافت نشد"})


srv = HTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
os.environ["ARA_BEZAN_API"] = f"http://127.0.0.1:{srv.server_port}/api/v1"
os.environ["ARA_PROXY"] = "none"
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import billing  # noqa: E402
from billing import Billing  # noqa: E402
billing.BEZAN_API = os.environ["ARA_BEZAN_API"]   # اگر billing پیش‌تر (در pytest) بارگذاری شده باشد
from store import Store  # noqa: E402


def ok(cond, msg):
    if not cond:
        raise SystemExit("✘ " + msg)
    print("✔ " + msg)


st = Store(Path(tempfile.mkdtemp()) / "t.db")
bill = Billing(st)
PH = "09121234567"
st.x("INSERT INTO users(phone, created) VALUES(?, 0)", (PH,))
st.set_setting("billing", {"daily_price": 0, "monthly_price": 900000, "monthly_days": 30, "pay_methods": ["bale", "bezan"], "trial_enabled": False})
ok(not {m["id"]: m["ready"] for m in bill.methods_public()}["bezan"], "بدون کلید API، «کارت‌به‌کارت خودکار» فعلاً فعال نیست")
st.set_setting("billing", {**st.get_setting("billing"), "bezan_api_key": "KEY-12345678", "bezan_expiry": 30})
ok({m["id"]: m["ready"] for m in bill.methods_public()}["bezan"], "با کلید API، روش آماده است")
bale_on = st.get_setting("billing")["pay_methods"]
ok("bale" in bale_on, "روش بله‌پی روشن ماند")

r = bill.start(PH, "monthly", "https://forsatmelk.ir/pay/callback", local=False, method="bezan")
pid = r["payment_id"]
path, hdr, body = MOCK["seen"][-1]
ok(r["redirect"] == "https://bezanbecard.ir/pay/tok1", "کاربر به صفحهٔ پرداخت «بزن به کارت» فرستاده می‌شود")
ok(body["amount"] == 9000000 and body["customer_phone"] == PH and body["merchant_order_id"] == f"fm-{pid}", "مبلغ به ریال، شماره و شناسهٔ سفارش درست ارسال شد")
ok(body["return_url"] == f"https://forsatmelk.ir/pay/callback?pid={pid}" and "/api/pay/bezan/hook?pid=" in body["callback_url"] and "sig=" in body["callback_url"], "نشانی بازگشت و اعلان امضاشده تنظیم شد")
ok(any(k.lower() == "idempotency-key" for k in hdr), "کلید یکتایی برای تکرار امن ارسال شد")
ok(bill.callback({"pid": pid}) == "pending", "بازگشت پیش از واریز: «در انتظار»، نه شکست")
ok(st.q("SELECT status FROM payments WHERE id=?", (pid,), one=True)["status"] == "pending", "پرداخت در انتظار ماند")
MOCK["orders"]["tok1"]["status"] = "paid"
bill.bezan_poll()
u = bill.user(PH)
pay = st.q("SELECT * FROM payments WHERE id=?", (pid,), one=True)
ok(pay["status"] == "paid" and u["active"] and u["days_left"] >= 29, "پس از تطبیق واریز، اشتراک خودکار فعال شد")
ok(bill.callback({"pid": pid}) is True, "بازگشت پس از پرداخت: موفق")
bill.bezan_poll()
ok(bill.user(PH)["days_left"] == u["days_left"], "بررسی دوباره اشتراک را دوبار تمدید نمی‌کند")
ok(bill.bezan_sig(pid) != bill.bezan_sig(pid + 1) and len(bill.bezan_sig(pid)) == 24, "امضای اعلان برای هر پرداخت یکتاست")

r2 = bill.start(PH, "monthly", "https://forsatmelk.ir/pay/callback", local=False, method="bezan")
MOCK["orders"]["tok2"]["status"] = "expired"
ok(bill.bezan_check(r2["payment_id"]) == "expired" and st.q("SELECT status FROM payments WHERE id=?", (r2["payment_id"],), one=True)["status"] == "failed", "سفارش منقضی، شکست ثبت می‌شود")
st.set_setting("billing", {**st.get_setting("billing"), "bezan_api_key": "WRONG-KEY-000"})
try:
    bill.start(PH, "monthly", "https://forsatmelk.ir/pay/callback", local=False, method="bezan")
    ok(False, "باید خطا می‌داد")
except ValueError as e:
    ok("بزن به کارت" in str(e), f"کلید نادرست: پیام روشن ({e})")
inv = bill.invoice(PH, pid)
ok(inv["gateway"] == "کارت‌به‌کارت خودکار" and inv["status"] == "paid", "فاکتور با نام روش پرداخت")
print("همهٔ آزمون‌های بزن به کارت موفق بود.")
