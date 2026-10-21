"""آزمون هشدار «فرصت‌های تازهٔ محلهٔ من» در بله: فقط مشترک، پیوند ربات، تطبیق آگهی تازهٔ پرامتیاز، بدون تکرار، حذف."""
import os
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
from alerts import Alerts  # noqa: E402
from billing import Billing  # noqa: E402
from store import Store  # noqa: E402


def ok(cond, msg):
    if not cond:
        raise SystemExit("✘ " + msg)
    print("✔ " + msg)


class FakeBale:
    def __init__(self):
        self.sent, self.links = [], {}
    def ready(self): return True
    def cfg(self): return {"bot_username": "forsatmelk_bot"}
    def chat_of(self, phone): return self.links.get(phone)
    def _nonce(self, kind, phone=None, pid=None): return "N" + kind
    def link_url(self, payload): return "https://ble.ir/forsatmelk_bot?start=" + payload
    def send(self, chat, text, **extra):
        self.sent.append((chat, text, extra)); return {"ok": True}


st = Store(Path(tempfile.mkdtemp()) / "t.db")
bill, bale = Billing(st), FakeBale()
al = Alerts(st, bill, bale)
PH, FREE = "09121234567", "09120000000"
now = int(time.time())
st.x("INSERT INTO users(phone, created, sub_until, plan) VALUES(?, 0, ?, 'monthly')", (PH, now + 86400 * 10))
st.x("INSERT INTO users(phone, created) VALUES(?, 0)", (FREE,))

try:
    al.add(FREE, {"city": "amol"}); ok(False, "کاربر بدون اشتراک نباید هشدار بسازد")
except ValueError:
    ok(True, "کاربر بدون اشتراک هشدار نمی‌سازد")
try:
    al.add(PH, {}); ok(False, "هشدار بی‌منطقه نباید ساخته شود")
except ValueError:
    ok(True, "هشدار بدون استان یا شهر ساخته نمی‌شود")

r = al.add(PH, {"province": "mazandaran", "city": "amol", "deal": "sale", "max_price": 20e9})
ok(r["ok"] and r.get("link", "").endswith("alert_Nalert") and not r["linked"], "هشدار ذخیره شد و پیوند یک‌بارهٔ ربات برگشت")
ok(al.run_once() == 0, "تا حساب به ربات وصل نشده، پیامی فرستاده نمی‌شود")
bale.links[PH] = 555

def listing(i, score, label, price, seen):
    st.upsert({"id": i, "title": "آپارتمان " + i, "city_key": "amol", "city_name": "آمل", "province": "mazandaran", "district": "امام رضا",
               "deal": "sale", "kind": "apartment", "vertical": "estate", "price": price, "area": 100, "status": "active", "images": []})
    st.x("UPDATE listings SET score=?, label=?, discount=?, first_seen=? WHERE id=?", (score, label, 0.27, seen, i))

listing("old", 95, "gold", 9e9, now - 3600)          # قبل از ساخت هشدار
listing("low", 60, "fair", 9e9, now + 30)            # امتیاز کم
listing("exp", 92, "gold", 30e9, now + 30)           # بالاتر از سقف قیمت
listing("hit", 90, "gold", 9e9, now + 30)            # باید فرستاده شود
st.x("UPDATE alerts SET last_check=?", (now,))
n = al.run_once()
ok(n == 1 and bale.sent[-1][0] == 555 and "آپارتمان hit" in bale.sent[-1][1], "فقط آگهی تازه، پرامتیاز و زیر سقف قیمت فرستاده شد")
ok("۲۵ تا ۳۰٪" in bale.sent[-1][1] and "/ad/hit" in str(bale.sent[-1][2]), "متن پیام: بازهٔ فاصله با برآورد و پیوند صفحهٔ ملک")
st.x("UPDATE alerts SET last_check=?", (now,))
ok(al.run_once() == 0, "همان آگهی دوباره فرستاده نمی‌شود")
aid = al.mine(PH)["items"][0]["id"]
al.remove(PH, aid)
ok(not al.mine(PH)["items"], "هشدار حذف شد")
k = len(bale.sent)
r3 = al.add(PH, {"city": "amol"})
ok(r3["linked"] and r3.get("confirmed") and "link" not in r3 and bale.sent[-1][0] == 555 and "ثبت شد" in bale.sent[-1][1], "حساب وصل: پیام تأیید ثبت هشدار همان لحظه در بله فرستاده شد")
t = al.test(PH)
ok(t["sent"] and len(bale.sent) == k + 2 and "آزمایشی" in bale.sent[-1][1], "پیام آزمایشی به همان گفت‌وگوی بله رسید")
ok(al.test(FREE).get("link", "").endswith("alert_Nalert"), "حساب وصل‌نشده: پیام آزمایشی پیوند وصل شدن برمی‌گرداند")
al.remove(PH, r3["id"])
st.x("UPDATE users SET sub_until=? WHERE phone=?", (now - 10, PH))
r2 = al.mine(PH)
ok(r2["linked"], "وضعیت پیوند ربات برمی‌گردد")
print("همهٔ آزمون‌های هشدار گذشت")
