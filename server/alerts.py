"""هشدار «فرصت‌های تازهٔ محلهٔ من» در پیام‌رسان بله.

کاربر مشترک فیلتر فعلی صفحهٔ اول (استان، شهر یا چند شهر، محله، نوع معامله، سقف قیمت) را ذخیره می‌کند؛
هر چند دقیقه آگهی‌های تازه‌ای که امتیازشان از حد هشدار بالاتر است و با فیلتر می‌خوانند پیدا می‌شوند
و در بله برایش فرستاده می‌شوند. هیچ عددی ساخته نمی‌شود: فقط عنوان، محل، قیمت آگهی، رده و بازهٔ فاصله با برآورد.
"""
from __future__ import annotations

import threading
import time
import traceback

SQL = """
CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT, province TEXT, city TEXT, district TEXT,
  deal TEXT, kinds TEXT, max_price INTEGER, min_score INTEGER DEFAULT 80, label TEXT, created INTEGER, last_check INTEGER,
  day TEXT, sent_day INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE INDEX IF NOT EXISTS ix_alerts_phone ON alerts(phone);
CREATE TABLE IF NOT EXISTS alerts_sent (alert_id INTEGER, listing_id TEXT, at INTEGER, PRIMARY KEY (alert_id, listing_id));
"""
MAX_PER_USER = 5      # هر کاربر حداکثر ۵ هشدار
MAX_PER_DAY = 8       # هر هشدار حداکثر ۸ پیام در روز (مزاحمت نشود)
MAX_PER_RUN = 3
LABEL_FA = {"gold": "✦ فرصت طلایی", "good": "فرصت مناسب"}


def _fa(n) -> str:
    return str(n).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def _money(v) -> str:
    if not v:
        return "—"
    if v >= 1e9:
        return _fa(f"{v / 1e9:.1f}".rstrip("0").rstrip(".")).replace(".", "٫") + " میلیارد تومان"
    return _fa(f"{round(v / 1e6):,}").replace(",", "٬") + " میلیون تومان"


class Alerts:
    def __init__(self, store, billing, bale):
        self.store, self.billing, self.bale = store, billing, bale
        with store.lock:
            store.db.executescript(SQL)
            store.db.commit()
        self.stop = threading.Event()
        self.thread = None
        self.state = {"last_run": None, "sent": 0, "last_error": None}

    # ---------------------------------------------------------- api
    def mine(self, phone) -> dict:
        rows = [dict(r) for r in self.store.q("SELECT id,province,city,district,deal,kinds,max_price,min_score,created FROM alerts WHERE phone=? AND active=1 ORDER BY id DESC", (phone,))]
        linked = bool(self.bale.chat_of(phone))
        return {"items": rows, "linked": linked, "bot": self.bale.cfg().get("bot_username") or "", "ready": self.bale.ready()}

    def add(self, phone, data: dict) -> dict:
        u = self.billing.user(phone)
        if not (u and u["active"]):
            raise ValueError("هشدار فرصت‌های تازه برای مشترکان است؛ اول اشتراک را فعال کنید")
        if not self.bale.ready():
            raise ValueError("ارسال هشدار فعلاً در دسترس نیست")
        n = self.store.q("SELECT COUNT(*) n FROM alerts WHERE phone=? AND active=1", (phone,), one=True)["n"]
        if n >= MAX_PER_USER:
            raise ValueError(f"حداکثر {_fa(MAX_PER_USER)} هشدار فعال می‌توانید داشته باشید؛ یکی را حذف کنید")
        clean = lambda k, m=80: str(data.get(k) or "").strip()[:m]
        city, prov = clean("city", 200), clean("province")
        if not (city or prov):
            raise ValueError("برای هشدار دست‌کم یک استان یا شهر انتخاب کنید")
        try:
            maxp = int(float(data.get("max_price") or 0)) or None
        except (TypeError, ValueError):
            maxp = None
        deal = clean("deal") if clean("deal") in ("sale", "rent", "presale") else ""
        now = int(time.time())
        aid = self.store.x("INSERT INTO alerts(phone,province,city,district,deal,kinds,max_price,min_score,created,last_check,day,sent_day,active) "
                           "VALUES(?,?,?,?,?,?,?,?,?,?,?,0,1)",
                           (phone, prov, city, clean("district"), deal, clean("kinds"), maxp, 80, now, now, time.strftime("%Y-%m-%d"))).lastrowid
        out = {"ok": True, "id": aid, **self.mine(phone)}
        if out["linked"]:   # تأیید فوری در خود بله تا کاربر ببیند پیام‌ها به کجا می‌رسد
            out["confirmed"] = bool(self.bale.send(self.bale.chat_of(phone), "🔔 هشدار «خبرم کن» ثبت شد.\nاز این پس هر آگهی تازه‌ای با امتیاز بالا (فرصت طلایی یا مناسب) در این فیلتر پیدا شود، همین‌جا برایتان فرستاده می‌شود."))
        if not out["linked"]:   # پیوند یک‌باره با ربات: کاربر «شروع» را می‌زند و حساب به گفت‌وگو وصل می‌شود
            out["link"] = self.bale.link_url("alert_" + self.bale._nonce("alert", phone=phone))
        return out

    def test(self, phone) -> dict:
        """پیام آزمایشی در بله: کاربر مطمئن می‌شود هشدارها به گفت‌وگوی درست می‌رسد."""
        if not self.bale.ready():
            raise ValueError("ارسال پیام در بله فعلاً در دسترس نیست")
        chat = self.bale.chat_of(phone)
        if not chat:
            return {"ok": False, "link": self.bale.link_url("alert_" + self.bale._nonce("alert", phone=phone)), **self.mine(phone)}
        ok = bool(self.bale.send(chat, "✅ پیام آزمایشی فرصت ملک\nهشدارهای «خبرم کن» دقیقاً همین‌جا به دستتان می‌رسد."))
        return {"ok": ok, "sent": ok, **self.mine(phone)}

    def remove(self, phone, aid) -> dict:
        self.store.x("UPDATE alerts SET active=0 WHERE id=? AND phone=?", (int(aid or 0), phone))
        return {"ok": True, **self.mine(phone)}

    # ---------------------------------------------------------- matcher
    def run_once(self) -> int:
        if not self.bale.ready():
            return 0
        sent_total, today, now = 0, time.strftime("%Y-%m-%d"), int(time.time())
        for a in [dict(r) for r in self.store.q("SELECT * FROM alerts WHERE active=1")]:
            try:
                u = self.billing.user(a["phone"])
                chat = self.bale.chat_of(a["phone"])
                if not (u and u["active"] and chat):
                    continue
                sent_day = a["sent_day"] if a["day"] == today else 0
                room = min(MAX_PER_RUN, MAX_PER_DAY - sent_day)
                if room <= 0:
                    continue
                cities = [c for c in (a["city"] or "").split(",") if c] or [""]
                fresh = []
                for city in cities[:8]:
                    f = {"province": "" if city else a["province"], "city": city, "district": a["district"] if len(cities) == 1 else "",
                         "deal": a["deal"], "kinds": a["kinds"], "max": a["max_price"] or "", "ranked": 1, "sort": "new", "limit": 30}
                    f = {k: v for k, v in f.items() if v not in ("", None)}
                    for d in self.store.search(f)["items"]:
                        if (d.get("score") or 0) < a["min_score"] or d.get("label") not in LABEL_FA:
                            continue
                        if (d.get("first_seen") or 0) <= a["last_check"]:
                            continue
                        fresh.append(d)
                fresh.sort(key=lambda d: -(d.get("score") or 0))
                done = 0
                for d in fresh:
                    if done >= room:
                        break
                    if self.store.q("SELECT 1 FROM alerts_sent WHERE alert_id=? AND listing_id=?", (a["id"], d["id"]), one=True):
                        continue
                    if self.bale.send(chat, self.text(d), reply_markup={"inline_keyboard": [[{"text": "مشاهدهٔ ارزیابی کامل", "url": f"https://forsatmelk.ir/ad/{d['id']}"}]]}):
                        self.store.x("INSERT OR IGNORE INTO alerts_sent VALUES(?,?,?)", (a["id"], d["id"], now))
                        done += 1
                self.store.x("UPDATE alerts SET last_check=?, day=?, sent_day=? WHERE id=?", (now, today, sent_day + done, a["id"]))
                sent_total += done
            except Exception as e:  # noqa: BLE001
                traceback.print_exc()
                self.state["last_error"] = str(e)[:200]
        self.state.update(last_run=now, sent=self.state["sent"] + sent_total)
        return sent_total

    @staticmethod
    def text(d: dict) -> str:
        where = "، ".join(x for x in (d.get("district"), d.get("city_name")) if x)
        disc = d.get("discount")
        gap = ""
        if disc and disc > 0:
            lo = int(disc * 100) // 5 * 5
            gap = f"\n📉 حدود {_fa(lo)} تا {_fa(lo + 5)}٪ زیر برآورد بازار محله"
        area = f" | {_fa(d['area'])} متر" if d.get("area") else ""
        return (f"🔔 فرصت تازه در {where or 'منطقهٔ مورد نظر شما'}\n{LABEL_FA.get(d.get('label'), '')}  |  امتیاز {_fa(round(d.get('score') or 0))}\n"
                f"🏠 {d.get('title') or 'ملک'}{area}\n💰 {_money(d.get('pp') or d.get('price'))}{gap}\n"
                "پیش از هر اقدام، سند و واقعی بودن آگهی را استعلام کنید.")

    def loop(self):
        self.stop.wait(60)
        while not self.stop.is_set():
            self.run_once()
            self.stop.wait(600)   # هر ۱۰ دقیقه

    def start(self):
        if self.thread and self.thread.is_alive():
            return
        self.thread = threading.Thread(target=self.loop, name="alerts", daemon=True)
        self.thread.start()
