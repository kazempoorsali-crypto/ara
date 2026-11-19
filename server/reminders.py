"""یادآوری پایان اشتراک: فقط دو پیام در هر دورهٔ اشتراک، برای هر شماره فقط یک بار:
۱) سه روز مانده به پایان اشتراک؛ ۲) وقتی اشتراک تمام شد.

پیام در بله می‌رود (اگر شماره به ربات بله وصل باشد) و در غیر این صورت در تلگرام؛ هرگز در هر دو.
پیش از ارسال در جدول tg_remind علامت زده می‌شود تا خطا، کندی پاسخ یا راه‌اندازی دوبارهٔ سرور
هرگز به پیام تکراری نینجامد (یک پیام از دست رفته بهتر از پیام ساعتی است).
"""
from __future__ import annotations

import threading
import time

SOON_DAYS = 3
_LOCK = threading.Lock()
_STARTED = []


def _fa(n) -> str:
    return str(n).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def _ensure(store):
    with store.lock:
        store.db.execute("CREATE TABLE IF NOT EXISTS tg_remind (phone TEXT, kind TEXT, until INTEGER, PRIMARY KEY (phone, kind, until))")
        store.db.commit()


def _bot_for(app, phone):
    """ربات و گفت‌وگوی این شماره: اول بله، بعد تلگرام."""
    for bot in (getattr(app, "bale", None), getattr(app, "telegram", None)):
        try:
            if bot and bot.ready() and bot.cfg().get("notify", True):
                chat = bot.chat_of(phone)
                if chat:
                    return bot, chat
        except Exception:  # noqa: BLE001
            continue
    return None, None


def text(kind, until, now) -> str:
    if kind == "soon":
        left = max(1, -(-(until - now) // 86400))
        return (f"⏰ اشتراک فرصت ملک شما {_fa(left)} روز دیگر تمام می‌شود.\n"
                "برای اینکه شکارهای طلایی و هشدارهای محله قطع نشود، اشتراک را تمدید کنید (روزهای باقی‌مانده نمی‌سوزد):\n"
                "https://forsatmelk.ir/account.html?subscribe=1")
    return ("اشتراک فرصت ملک شما به پایان رسید.\n"
            "با تمدید، دوباره به شکارهای طلایی، رادار کاهش قیمت و هشدار فرصت‌های تازه دسترسی دارید:\n"
            "https://forsatmelk.ir/account.html?subscribe=1")


def run_once(app, now=None) -> int:
    """یک دور بررسی؛ خروجی: تعداد پیام فرستاده‌شده."""
    s = app.store
    _ensure(s)
    now = int(now or time.time())
    if not s.get_setting("remind_v2_init"):
        # نخستین اجرا پس از اصلاح: کسانی که پیش‌تر پیام‌های تکراری گرفته‌اند، پیام دیگری برای همین دوره نمی‌گیرند
        for r in s.q("SELECT phone, sub_until FROM users WHERE sub_until > 0 AND sub_until <= ?", (now + SOON_DAYS * 86400,)):
            u = int(r["sub_until"])
            s.x("INSERT OR IGNORE INTO tg_remind VALUES(?,?,?)", (r["phone"], "soon", u))
            if u <= now:
                s.x("INSERT OR IGNORE INTO tg_remind VALUES(?,?,?)", (r["phone"], "ended", u))
        s.set_setting("remind_v2_init", now)
    sent = 0
    rows = s.q("SELECT phone, sub_until FROM users WHERE sub_until BETWEEN ? AND ?", (now - 86400, now + SOON_DAYS * 86400))
    owners = app.billing.owner_phones() if hasattr(app.billing, "owner_phones") else set()
    for r in rows:
        phone, until = r["phone"], int(r["sub_until"] or 0)
        if phone in owners:   # مدیر سایت اشتراک دائمی دارد؛ یادآوری تمدید نمی‌گیرد
            continue
        kind = "ended" if until <= now else "soon"
        with _LOCK:
            if s.q("SELECT 1 FROM tg_remind WHERE phone=? AND kind=? AND until=?", (phone, kind, until), one=True):
                continue
            # اشتراک تمام‌شده‌ای که یادآوری «نزدیک پایان»ش هم نرفته، فقط پیام پایان را می‌گیرد
            s.x("INSERT OR IGNORE INTO tg_remind VALUES(?,?,?)", (phone, kind, until))
            if kind == "ended":
                s.x("INSERT OR IGNORE INTO tg_remind VALUES(?,?,?)", (phone, "soon", until))
        bot, chat = _bot_for(app, phone)
        if not bot:
            continue
        try:
            bot.call("sendMessage", {"chat_id": chat, "text": text(kind, until, now), "disable_web_page_preview": True})
            sent += 1
        except Exception:  # noqa: BLE001
            pass   # علامت خورده؛ دوباره فرستاده نمی‌شود
    return sent


def start(app):
    if _STARTED:
        return
    _STARTED.append(1)

    def loop():
        time.sleep(120)
        while True:
            try:
                run_once(app)
            except Exception:  # noqa: BLE001
                pass
            time.sleep(1800)
    threading.Thread(target=loop, daemon=True, name="sub-reminders").start()
