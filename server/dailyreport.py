"""گزارش روزانهٔ سامانهٔ پرداخت (کارت‌به‌کارت و پیامک بانک) در بله، هر روز یک بار از ساعت ۸ صبح تهران.

گیرنده: شماره‌ای که در پنل (billing.report_phone) آمده و با ربات بلهٔ سایت پیوند خورده است.
همهٔ عددها از جدول‌های payments و bank_sms همان روز (دیروز به وقت تهران) خوانده می‌شوند؛ هیچ عددی ساخته نمی‌شود.
"""
from __future__ import annotations

import threading
import time

TEHRAN = 12600          # ۳:۳۰ ساعت (ایران از ۱۴۰۱ ساعت تابستانی ندارد)
SEND_HOUR = 8
NAMES = {"card": "کارت‌به‌کارت با رسید/پیامک", "bezan": "بزن به کارت", "bale": "بله‌پی", "zarinpal": "زرین‌پال", "idpay": "آیدی‌پی", "test": "آزمایشی"}


def _fa(x) -> str:
    return str(x).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def _money(v) -> str:
    return _fa(f"{int(v or 0):,}".replace(",", "٬")) + " تومان"


def day_range(now=None, back=1):
    """آغاز و پایان (ثانیهٔ یونیکس) روز تهرانیِ back روز پیش، و نشانی همان روز (YYYY-MM-DD تهران)."""
    t = int(now or time.time()) + TEHRAN
    d = t // 86400 - back
    start = d * 86400 - TEHRAN
    return start, start + 86400, time.strftime("%Y-%m-%d", time.gmtime(d * 86400))


def text(app, now=None) -> str:
    from seo import jdate
    s = app.store
    start, end, _ = day_range(now)
    paid = s.q("SELECT gateway, COUNT(*) n, SUM(amount) amt FROM payments WHERE status='paid' AND paid_at>=? AND paid_at<? GROUP BY gateway", (start, end))
    n = sum(int(r["n"]) for r in paid)
    total = sum(int(r["amt"] or 0) for r in paid)
    sms = {r["status"]: int(r["n"]) for r in s.q("SELECT status, COUNT(*) n FROM bank_sms WHERE at>=? AND at<? GROUP BY status", (start, end))}
    created = s.q("SELECT COUNT(*) n FROM payments WHERE created>=? AND created<? AND gateway IN ('card','bezan')", (start, end), one=True)["n"]
    pending = s.q("SELECT COUNT(*) n FROM payments WHERE status='pending' AND gateway IN ('card','bezan') AND created>?", (int(time.time()) - 3 * 86400,), one=True)["n"]
    review = s.q("SELECT COUNT(*) n FROM payments WHERE status='review'", one=True)["n"]
    last = s.q("SELECT MAX(at) t FROM bank_sms", one=True)["t"]

    t = f"📊 گزارش روزانهٔ کارت‌به‌کارت فرصت ملک — {_fa(jdate(start + TEHRAN))}\n\n"
    t += f"💳 اشتراک‌های پرداخت‌شده: {_fa(n)}\n"
    for r in paid:
        t += f"   • {NAMES.get(r['gateway'], r['gateway'] or '—')}: {_fa(r['n'])} ({_money(r['amt'])})\n"
    t += f"💰 جمع دریافتی: {_money(total)}\n"
    t += f"🧾 خرید کارت‌به‌کارت ثبت‌شده در این روز: {_fa(created)}\n\n"
    t += f"📩 پیامک‌های بانک: {_fa(sum(sms.values()))}\n"
    t += f"   • تأیید خودکار خرید: {_fa(sms.get('matched', 0))}\n"
    t += f"   • واریز بدون خرید هم‌مبلغ: {_fa(sms.get('unmatched', 0))}\n"
    t += f"   • چند خرید هم‌مبلغ (بررسی دستی): {_fa(sms.get('ambiguous', 0))}\n"
    t += f"   • غیرواریزی یا فرستندهٔ ناشناس: {_fa(sms.get('ignored', 0) + sms.get('rejected', 0))}\n\n"
    t += f"⏳ در انتظار واریز (۳ روز اخیر): {_fa(pending)}" + (f"\n🔎 منتظر بررسی رسید: {_fa(review)}" if review else "") + "\n"
    if app.billing.bank_sms_ready() and (not last or last < time.time() - 36 * 3600):
        t += ("\n⚠️ بیش از ۳۶ ساعت است هیچ پیامکی از گوشی نرسیده"
              + (f" (آخرین: {_fa(jdate(last + TEHRAN))} ساعت {_fa(time.strftime('%H:%M', time.gmtime(last + TEHRAN)))})" if last else "")
              + ".\nبرنامهٔ SMS to URL forwarder، باتری و اینترنت گوشی را بررسی کنید.")
    return t


def send(app, force=False, now=None) -> dict:
    """ارسال گزارش؛ بدون force فقط یک بار در روز و از ساعت ۸ صبح تهران."""
    from billing import norm_phone
    phone = norm_phone(str(app.billing.cfg().get("report_phone") or ""))
    if not phone:
        return {"ok": False, "error": "شمارهٔ گیرندهٔ گزارش در پنل تعیین نشده است"}
    if not app.bale.ready():
        return {"ok": False, "error": "ربات بله متصل نیست"}
    now = int(now or time.time())
    _, _, today = day_range(now, back=0)
    if not force:
        hour = time.gmtime(now + TEHRAN).tm_hour
        if hour < SEND_HOUR or (app.store.get_setting("daily_report") or {}).get("day") == today:
            return {"ok": False, "skipped": True}
    chat = app.bale.chat_of(phone)
    if not chat:
        return {"ok": False, "error": f"شمارهٔ {phone} هنوز به ربات بلهٔ سایت وصل نشده است (یک بار با همین شماره در سایت وارد شوید و «دریافت کد در بله» را بزنید)"}
    try:
        app.bale.call("sendMessage", {"chat_id": chat, "text": text(app, now)})
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"ارسال در بله: {e}"[:200]}
    if not force:
        app.store.set_setting("daily_report", {"day": today, "at": now})
    return {"ok": True}


def start(app):
    def loop():
        while True:
            time.sleep(300)
            try:
                send(app)
            except Exception:  # noqa: BLE001
                pass
    threading.Thread(target=loop, daemon=True, name="daily-report").start()
