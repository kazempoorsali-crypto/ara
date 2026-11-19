"""آزمون یادآوری پایان اشتراک: در هر دورهٔ اشتراک فقط دو پیام (سه روز مانده و هنگام پایان)، هر کدام یک بار، فقط در یک پیام‌رسان."""
import os
import sys
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import reminders as R  # noqa: E402
from bale import Bale, Telegram  # noqa: E402
from billing import Billing  # noqa: E402
from store import Store  # noqa: E402


def ok(cond, msg):
    if not cond:
        raise SystemExit("✘ " + msg)
    print("✔ " + msg)


st = Store(Path(tempfile.mkdtemp()) / "t.db")
bill = Billing(st)
bale, tg = Bale(st, bill), Telegram(st, bill)
sent = []
bale.call = lambda m, body=None, timeout=30: sent.append(("bale", body["chat_id"], body["text"])) or None   # پاسخ خالی (مثل واسط)
tg.call = lambda m, body=None, timeout=30: sent.append(("tg", body["chat_id"], body["text"])) or None
st.set_setting("bale", {"token": "1:a", "bot_username": "b"})
st.set_setting("telegram", {"token": "2:b", "bot_username": "t"})
app = SimpleNamespace(store=st, billing=bill, bale=bale, telegram=tg)
NOW = int(time.time())

# کاربری که پیش از این اصلاح، پیام‌های ساعتی گرفته بود: اشتراکش تمام شده است
st.x("INSERT INTO users (phone, created, sub_until, plan) VALUES (?,?,?,?)", ("09110000001", 1, NOW - 3600, "monthly"))
st.x("INSERT INTO bale_links VALUES(?,?,?,?)", ("09110000001", 11, 1, 1))
ok(R.run_once(app, NOW) == 0 and not sent, "نخستین اجرا: به کسی که پیام‌های تکراری گرفته بود، پیام دیگری برای همان دوره نمی‌رود")

# کاربر تازه: اشتراک ۱۰ روز دیگر تمام می‌شود؛ در بله و تلگرام هر دو وصل است
P = "09110000002"
until = NOW + 10 * 86400
st.x("INSERT INTO users (phone, created, sub_until, plan) VALUES (?,?,?,?)", (P, 1, until, "monthly"))
st.x("INSERT INTO bale_links VALUES(?,?,?,?)", (P, 22, 1, 1))
st.x("INSERT INTO tg_links VALUES(?,?,?,?)", (P, 33, 1, 1))
ok(R.run_once(app, NOW) == 0, "۱۰ روز مانده: پیامی نمی‌رود")
t = until - 3 * 86400 + 60
for h in range(48):   # دو روز، هر ساعت یک بار بررسی
    R.run_once(app, t + h * 3600)
ok(len(sent) == 1 and sent[0][0] == "bale" and "روز دیگر تمام می‌شود" in sent[0][2], "سه روز مانده: فقط یک پیام، فقط در بله (نه تلگرام)، با وجود پاسخ خالی پیام‌رسان")
for h in range(72):   # پس از پایان، سه روز هر ساعت
    R.run_once(app, until + 60 + h * 3600)
ok(len(sent) == 2 and "به پایان رسید" in sent[1][2], "پایان اشتراک: فقط یک پیام")

# خطای ارسال: باز هم تکرار نمی‌شود
P2 = "09110000003"
u2 = NOW + 2 * 86400
st.x("INSERT INTO users (phone, created, sub_until, plan) VALUES (?,?,?,?)", (P2, 1, u2, "weekly"))
st.x("INSERT INTO tg_links VALUES(?,?,?,?)", (P2, 44, 1, 1))
tg.call = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("timeout"))
R.run_once(app, NOW)
tg.call = lambda m, body=None, timeout=30: sent.append(("tg", body["chat_id"], body["text"])) or None
for h in range(10):
    R.run_once(app, NOW + h * 3600)
ok(len(sent) == 2, "پس از خطای ارسال، همان یادآوری دوباره فرستاده نمی‌شود")

# تمدید: دورهٔ تازه دوباره دو پیام خودش را دارد
st.x("UPDATE users SET sub_until=? WHERE phone=?", (until + 30 * 86400, P))
R.run_once(app, until + 27 * 86400 + 60)
ok(len(sent) == 3 and sent[-1][1] == 22, "پس از تمدید، دورهٔ تازه یادآوری خودش را دارد")
# شمارهٔ مدیر (owner_phones): همیشه فعال و VIP، بدون یادآوری تمدید، حتی با sub_until منقضی
OW = "09119041271"
st.x("INSERT OR REPLACE INTO users (phone, created, sub_until, plan) VALUES (?,?,?,?)", (OW, 1, NOW + 86400, "weekly"))
st.x("INSERT OR REPLACE INTO bale_links VALUES(?,?,?,?)", (OW, 99, 1, 1))
u = bill.user(OW)
ok(u["active"] and u["plan"] == "vip" and u.get("owner"), "شمارهٔ مدیر: دسترسی کامل VIP")
before = len(sent)
for h in range(80):
    R.run_once(app, NOW + h * 3600)
ok(not any(x[1] == 99 for x in sent[before:]), "شمارهٔ مدیر یادآوری تمدید نمی‌گیرد")
st.x("UPDATE users SET sub_until=0 WHERE phone=?", (OW,))
ok(bill.user(OW)["active"], "شمارهٔ مدیر بدون اشتراک خریده‌شده هم فعال است")
ok(not bill.user("09110000002").get("owner"), "کاربر عادی مدیر حساب نمی‌شود")
print("همهٔ آزمون‌های یادآوری اشتراک موفق بود.")
