"""آزمون گزارش روزانهٔ کارت‌به‌کارت در بله: پیش از ۸ صبح تهران چیزی نمی‌رود، بعد از آن فقط یک بار در روز، و عددها از خود جدول‌ها."""
import os
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import dailyreport as D  # noqa: E402
from bale import Bale  # noqa: E402
from billing import Billing  # noqa: E402
from store import Store  # noqa: E402


def ok(cond, msg):
    if not cond:
        raise SystemExit("✘ " + msg)
    print("✔ " + msg)


st = Store(Path(tempfile.mkdtemp()) / "t.db")
bill = Billing(st)
bale = Bale(st, bill)
sent = []
bale.call = lambda method, body=None, timeout=30: sent.append((method, body)) or {"ok": True}
app = SimpleNamespace(store=st, billing=bill, bale=bale)

ok(bill.cfg()["report_phone"] == "09119041271", "شمارهٔ پیش‌فرض گیرندهٔ گزارش")
r = D.send(app, force=True)
ok(not r["ok"] and "بله" in r["error"], "ربات بله تنظیم نشده: چیزی فرستاده نمی‌شود")
st.set_setting("bale", {"token": "1:abc", "bot_username": "fm_bot"})
r = D.send(app, force=True)
ok(not r["ok"] and "وصل نشده" in r["error"], "شماره هنوز به ربات وصل نشده: پیام روشن")
st.x("INSERT INTO bale_links VALUES(?,?,?,?)", ("09119041271", 4242, 1, 1))

# روز آزمایشی: ۱۰ آبان (تهران)؛ «اکنون» ساعت ۷:۳۰ و سپس ۸:۱۰ صبح تهران روز بعد
start, end, _ = D.day_range(1_700_000_000)
now_730 = end + int(7.5 * 3600)
now_810 = end + 8 * 3600 + 600
for i, (gw, amt, stt, paid) in enumerate([("card", 248000, "paid", start + 3600), ("card", 98000, "paid", start + 7200),
                                           ("bezan", 248000, "paid", start + 9000), ("card", 248000, "paid", start - 50),
                                           ("card", 99000, "review", None)]):
    st.x("INSERT INTO payments (phone, plan, amount, gateway, status, created, paid_at) VALUES (?,?,?,?,?,?,?)",
         ("0912000000" + str(i), "monthly", amt, gw, stt, start + 60, paid))
for k, stt in enumerate(("matched", "matched", "unmatched", "ignored", "rejected")):
    st.x("INSERT INTO bank_sms (at, sender, body, amount, status, hash) VALUES (?,?,?,?,?,?)", (start + 100, "Bank", "x", 1, stt, f"h{k}"))

t = D.text(app, now_810)
ok("اشتراک‌های پرداخت‌شده: ۳" in t, "سه پرداخت همان روز شمرده شد (پرداخت روز قبل نه)")
ok("۵۹۴٬۰۰۰ تومان" in t, "جمع دریافتی درست است")
ok("پیامک‌های بانک: ۵" in t and "تأیید خودکار خرید: ۲" in t and "غیرواریزی یا فرستندهٔ ناشناس: ۲" in t, "شمار پیامک‌ها به تفکیک")
ok("منتظر بررسی رسید: ۱" in t, "رسید در انتظار بررسی گزارش شد")

sent.clear()
ok(D.send(app, now=now_730).get("skipped") and not sent, "پیش از ساعت ۸ صبح تهران چیزی فرستاده نمی‌شود")
ok(D.send(app, now=now_810)["ok"] and sent and sent[-1][1]["chat_id"] == 4242, "ساعت ۸:۱۰ گزارش به بلهٔ همان شماره رفت")
ok(D.send(app, now=now_810 + 3600).get("skipped") and len(sent) == 1, "همان روز دوباره فرستاده نمی‌شود")
ok(D.send(app, now=now_810 + 86400)["ok"] and len(sent) == 2, "فردا دوباره فرستاده می‌شود")
bill_cfg = st.get_setting("billing") or {}
st.set_setting("billing", {**bill_cfg, "report_phone": ""})
ok(not D.send(app, now=now_810 + 2 * 86400)["ok"], "شمارهٔ خالی در پنل = گزارش خاموش")
# «پرداخت‌ها و رسیدها» در حساب کاربر: کارت‌به‌کارتِ نیمه‌تمام برای ادامه، با شماره کارت و مبلغ یکتا
import time  # noqa: E402
U = "09125556677"
st.set_setting("billing", {**(st.get_setting("billing") or {}), "card_number": "6037-0000-0000-0000", "card_holder": "آزمون", "card_sheba": "IR000000000000000000000000",
                           "pay_methods": ["card"]})
st.x("INSERT INTO payments (phone, plan, amount, gateway, status, created) VALUES (?,?,?,?,?,?)", (U, "monthly", 249000, "card", "pending", int(time.time()) - 600))
st.x("INSERT INTO payments (phone, plan, amount, gateway, status, created, paid_at) VALUES (?,?,?,?,?,?,?)", (U, "weekly", 98000, "card", "paid", int(time.time()) - 9 * 86400, int(time.time()) - 9 * 86400))
st.x("INSERT INTO payments (phone, plan, amount, gateway, status, created) VALUES (?,?,?,?,?,?)", ("09120000009", "monthly", 250000, "card", "pending", int(time.time())))
m = bill.my_payments(U)
ok(len(m["items"]) == 2 and {x["status"] for x in m["items"]} == {"pending", "paid"}, "فقط پرداخت‌های خود کاربر (رسید قدیمی هم می‌ماند)")
ok(m["pending"] and m["pending"]["amount"] == 249000 and m["pending"]["card"]["number"].startswith("6037") and m["pending"]["card"]["sheba"].startswith("IR"),
   "کارت‌به‌کارت نیمه‌تمام با همان مبلغ یکتا، شماره کارت و شبا برای ادامه")
print("همهٔ آزمون‌های گزارش روزانه موفق بود.")
