"""دستیار هوشمند ربات تلگرام فرصت ملک؛ همهٔ پیام‌ها و دکمه‌ها فارسی است.

- منوی ثابت: شکارهای طلایی امروز، رادار کاهش قیمت، تخمین قیمت ملک، جست‌وجوی منطقه، قیمت محله، خرید اشتراک،
  حساب من، هشدار محلهٔ من، پشتیبانی، راهنما و پرسش‌ها.
- پیام آزاد («آپارتمان زیر قیمت در رشت منظریه»، «تهران پونک ۱۰۰ متری») تحلیل می‌شود: شهر، محله، نوع ملک،
  رهن یا خرید، متراژ، تعداد خواب و سقف قیمت؛ سپس بهترین آگهی‌های همان منطقه از جست‌وجوی داخلی سایت فرستاده می‌شود.
- «قیمت متری رشت گلسار»: میانهٔ قیمت متری محله از همان دادهٔ ماشین‌حساب سایت.
- ماشین‌حساب گام‌به‌گام (شهر ← محله ← نوع ← متراژ ← سال ساخت) با همان مدل «تخمین ارزش» سایت.
- پرسش‌های پرتکرار با موتور کلیدواژه‌ای پاسخ داده می‌شود؛ اگر پاسخ مطمئنی نباشد، ربات حدس نمی‌زند و پیشنهاد
  می‌کند پرسش به‌صورت تیکت برای پشتیبانی برود. پاسخ پشتیبانی همین‌جا در تلگرام می‌رسد و کاربر می‌تواند جواب بدهد.
- حساب کاربر با دکمهٔ «اشتراک شمارهٔ من» وصل می‌شود (تلگرام شماره را تأیید می‌کند). جزئیات کامل فرصت‌ها،
  رادار و هشدار ویژهٔ مشترکان است و بقیه پیش‌نمایش و دکمهٔ فعال‌سازی اشتراک می‌بینند.
- یادآوری پایان اشتراک (دو روز مانده و روز پایان) برای کاربرانی که حسابشان را وصل کرده‌اند.
همه‌چیز مستقیم از توابع داخلی سرور خوانده می‌شود؛ هیچ عددی ساخته نمی‌شود.
"""
from __future__ import annotations

import html
import math
import re
import threading
import time
import traceback

import catalog
from catalog import CITY_BY_KEY, squash

B_GOLD, B_RADAR, B_EST, B_SEARCH = "🔥 شکارهای طلایی امروز", "📉 رادار کاهش قیمت", "🧮 تخمین قیمت ملک", "🔎 جست‌وجوی منطقه"
B_PRICE, B_PLANS, B_ACCOUNT, B_ALERT = "📊 قیمت محله", "💎 خرید اشتراک", "👤 حساب من", "🔔 هشدار محلهٔ من"
B_SUPPORT, B_HELP = "🎧 پشتیبانی", "❓ راهنما و پرسش‌ها"
B_CANCEL, B_SKIP = "↩️ انصراف", "نمی‌دانم"
MENU = {"keyboard": [[{"text": B_GOLD}, {"text": B_RADAR}], [{"text": B_EST}, {"text": B_SEARCH}],
                     [{"text": B_PRICE}, {"text": B_ALERT}], [{"text": B_PLANS}, {"text": B_ACCOUNT}],
                     [{"text": B_SUPPORT}, {"text": B_HELP}]],
        "resize_keyboard": True, "is_persistent": True, "input_field_placeholder": "نام شهر و محله یا پرسش خود را بنویسید…"}
BUTTONS = (B_GOLD, B_RADAR, B_EST, B_SEARCH, B_PRICE, B_PLANS, B_ACCOUNT, B_ALERT, B_SUPPORT, B_HELP)
COMMANDS = [("start", "منوی اصلی"), ("gold", "شکارهای طلایی امروز"), ("radar", "رادار کاهش قیمت"),
            ("estimate", "تخمین قیمت ملک"), ("price", "قیمت متری محله"), ("alert", "هشدار فرصت‌های تازهٔ محله"),
            ("plans", "خرید اشتراک"), ("account", "حساب من و وضعیت اشتراک"), ("support", "پشتیبانی و تیکت‌ها"),
            ("help", "راهنما و پرسش‌های پرتکرار")]
CMD_TO_BTN = {"/gold": B_GOLD, "/radar": B_RADAR, "/estimate": B_EST, "/price": B_PRICE, "/plans": B_PLANS, "/account": B_ACCOUNT,
              "/alert": B_ALERT, "/support": B_SUPPORT, "/help": B_HELP, "/search": B_SEARCH}
KIND_FA = {"apartment": "آپارتمان", "villa": "ویلا", "land": "زمین", "shop": "مغازه", "office": "دفتر کار", "garden": "باغ", "suite": "سوئیت"}
LABEL_FA = {"gold": "✦ فرصت طلایی", "good": "✓ فرصت مناسب", "fair": "قیمت منصفانه", "high": "کمی گران", "over": "گران"}
KIND_WORDS = (("آپارتمان", "apartment"), ("اپارتمان", "apartment"), ("واحد", "apartment"), ("ویلا", "villa"),
              ("زمین", "land"), ("مغازه", "shop"), ("تجاری", "shop"), ("دفتر", "office"), ("اداری", "office"), ("باغ", "garden"), ("سوئیت", "suite"))
RENT_WORDS = ("رهن", "اجاره", "کرایه")
OPP_WORDS = ("زیرقیمت", "زیر قیمت", "فرصت", "ارزان", "طلایی", "شکار", "زیر ارزش", "بصرفه", "به صرفه")
PRICE_WORDS = ("قیمت متری", "متری چند", "متر چند", "میانگین", "متوسط", "میانه", "نرخ", "قیمت محله", "قیمت منطقه", "قیمت مسکن", "قیمت خانه", "قیمت آپارتمان")
ESTATE_WORDS = ("متر", "خواب", "خرید", "فروش", "ملک", "خانه", "خونه", "آگهی", "فایل", "قیمت", "زیر", "رهن", "اجاره", "ویلا",
                "آپارتمان", "اپارتمان", "زمین", "مغازه", "واحد", "سوئیت", "باغ", "میلیارد", "میلیون", "ارزان", "فرصت", "طلایی", "نوساز")
PROBLEM_WORDS = ("مشکل", "خطا", "ارور", "نمیشه", "نمی شود", "نمی‌شود", "نشد", "نمیاد", "نمی آید", "نرسید", "نمیرسه", "کار نمیکنه", "کار نمی کند",
                 "پول کم شد", "کسر شد", "برگشت", "شکایت", "باگ", "قطع")
STOP = set("در از به با برای که را و یا تا این آن یک چند چه کجا کجاست میخوام میخواهم دنبال لطفا لطفاً "
           "خونه خانه ملک آگهی فایل قیمت متری متر خواب سال ساخت زیر بالای حدود حداکثر کمتر بیشتر میلیون میلیارد تومان "
           "خرید فروش رهن اجاره ارزان فرصت طلایی شکار بهترین شهر محله منطقه میانگین متوسط نرخ چنده است".split())
FA_DIG = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
TICKET_CATS = (("payment", "💳 پرداخت و اشتراک"), ("sms", "📱 پیامک و کد ورود"), ("listing", "🏠 آگهی‌ها و قیمت‌ها"), ("other", "💬 سایر"))
TICKET_STATUS = {"open": "⏳ در انتظار پاسخ", "answered": "✅ پاسخ داده شد", "closed": "بسته شد"}


def fa(n) -> str:
    return str(n).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def fa_int(n) -> str:
    return fa(f"{int(round(n)):,}").replace(",", "٬")


def fa_pct(p) -> str:
    return fa(f"{abs(p) * 100:.1f}".rstrip("0").rstrip(".")).replace(".", "٫")


def money(v) -> str:
    if not v:
        return "—"
    if v >= 1e9:
        return fa(f"{v / 1e9:.2f}".rstrip("0").rstrip(".")).replace(".", "٫") + " میلیارد تومان"
    if v >= 1e6:
        return fa_int(v / 1e6) + " میلیون تومان"
    return fa_int(v) + " تومان"


def esc(s) -> str:
    return html.escape(str(s or ""), quote=False)


def clean(text: str) -> str:
    t = catalog.norm(text or "").translate(FA_DIG)
    for ch in "؟?،,.!:؛;()«»\"'":
        t = t.replace(ch, " ")
    return re.sub(r"\s+", " ", t).strip()


def has(t: str, words) -> bool:
    return any(w in t for w in words)


# ------------------------------------------------------------------ FAQ
# هر موضوع: کلیدواژه‌های قوی (هر کدام ۲ امتیاز) و ضعیف (۱ امتیاز)؛ پاسخ فقط اگر امتیاز ≥ ۲ باشد
FAQ = [
    ("calc", ("چطور حساب", "چگونه حساب", "چطوری حساب", "محاسبه", "الگوریتم", "ارزش برآوردی", "ارزش گذاری", "ارزشگذاری", "برآورد", "منصفانه", "دقیق"),
     ("چطور", "چگونه", "حساب", "مدل", "ارزش")),
    ("trust", ("فیک", "جعلی", "صوری", "اعتبارسنجی", "کلاهبرداری", "مشکوک", "تقلبی", "معتبرن", "واقعین", "واقعی هستن", "واقعیه"),
     ("واقعی", "اعتبار", "معتبر", "دروغ")),
    ("deed", ("قولنامه", "وکالتی", "بنچاق", "تک برگ", "تکبرگ", "استعلام سند", "نوع سند"), ("سند", "استعلام")),
    ("plans", ("قیمت اشتراک", "هزینه اشتراک", "خرید اشتراک", "اشتراک چند", "تمدید", "پلن", "اشتراک ماهانه", "اشتراک هفتگی", "اشتراک بخرم", "پرداخت کنم"),
     ("اشتراک", "پرداخت", "هزینه", "رایگان", "پولی", "ماهانه", "هفتگی")),
    ("site", ("آدرس سایت", "لینک سایت", "وبسایت", "وب سایت", "سایتتون"), ("سایت", "لینک")),
    ("support", ("پشتیبانی", "تیکت", "تماس بگیرم", "شماره تماس", "با کی صحبت", "اپراتور", "ادمین", "مدیر سایت"), ("تماس", "ارتباط", "کمک")),
    ("alert", ("خبرم کن", "هشدار", "نوتیف", "اعلان", "خبر بده"), ("اطلاع",)),
    ("labels", ("برچسب", "فرصت طلایی یعنی", "طلایی یعنی", "فرصت مناسب یعنی", "امتیاز آگهی", "امتیاز چیه", "رتبه"), ("طلایی", "مناسب", "امتیاز", "گران")),
    ("login", ("ورود", "رمز عبور", "رمزم", "کد تایید", "کد تأیید", "ثبت نام", "ثبتنام", "لاگین", "وارد شم", "وارد بشم"), ("رمز", "کد", "حساب")),
    ("radar", ("رادار", "کاهش قیمت", "قیمتشون رو پایین", "قیمت پایین آوردن", "افت قیمت"), ("کاهش", "افت")),
    ("cities", ("کدوم شهر", "کدام شهر", "چه شهرهایی", "شهرهای تحت پوشش", "همه شهرها", "سراسر ایران"), ("شهرها",)),
    ("bot", ("چه کارهایی", "چیکار میکنی", "چه کار میکنی", "کمکم کنی", "قابلیت", "امکانات ربات", "چطور کار میکنی", "چطوری کار میکنی"), ("ربات", "امکانات")),
    ("hello", ("سلام", "درود", "وقت بخیر", "صبح بخیر", "عصر بخیر", "شب بخیر"), ()),
    ("thanks", ("ممنون", "مرسی", "متشکرم", "سپاس", "تشکر", "دمت گرم", "عالی بود"), ()),
]


class Assistant:
    def __init__(self, bot, app, estimate):
        self.bot, self.app, self.estimate = bot, app, estimate
        self.state = {}      # گفت‌وگوی گام‌به‌گام هر chat (فقط در حافظه)
        self.rate = {}
        self.lock = threading.Lock()
        self.ready_once = False
        with bot.store.lock:
            bot.store.db.executescript("""
                CREATE TABLE IF NOT EXISTS tg_prefs (chat_id INTEGER PRIMARY KEY, city TEXT, district TEXT, updated INTEGER);
                CREATE TABLE IF NOT EXISTS tg_remind (phone TEXT, kind TEXT, until INTEGER, PRIMARY KEY (phone, kind, until));""")
            bot.store.db.commit()

    # ---------------------------------------------------------- helpers
    @property
    def store(self):
        return self.bot.store

    @property
    def billing(self):
        return self.bot.billing

    def base(self) -> str:
        b = (self.store.get_setting("public_base") or "").rstrip("/")
        return b if b.startswith("https://") else "https://forsatmelk.ir"

    def send(self, chat, text, kb=None):
        return self.bot.send(chat, text, parse_mode="HTML", disable_web_page_preview=True,
                             reply_markup=kb if kb is not None else MENU)

    def phone_of(self, chat):
        r = self.store.q("SELECT phone FROM tg_links WHERE chat_id=? ORDER BY linked_at DESC", (chat,), one=True)
        return r["phone"] if r else None

    def user_of(self, chat):
        p = self.phone_of(chat)
        return (self.billing.user(p) if p else None), p

    def is_sub(self, chat) -> bool:
        u, _ = self.user_of(chat)
        return bool(u and u["active"])

    def pref(self, chat):
        r = self.store.q("SELECT city, district FROM tg_prefs WHERE chat_id=?", (chat,), one=True)
        return (r["city"], r["district"] or None) if r else (None, None)

    def set_pref(self, chat, city, district=None):
        self.store.x("INSERT OR REPLACE INTO tg_prefs VALUES(?,?,?,?)", (chat, city, district or "", int(time.time())))

    def limited(self, chat) -> bool:
        now = time.time()
        with self.lock:
            hits = [t for t in self.rate.get(chat, []) if now - t < 60] + [now]
            self.rate[chat] = hits
        return len(hits) > 25

    def sub_kb(self, extra=None):
        return {"inline_keyboard": (extra or []) + [[{"text": "💎 فعال‌سازی اشتراک در سایت", "url": self.base() + "/account.html?subscribe=1"}]]}

    def contact_kb(self):
        return {"keyboard": [[{"text": "📱 اشتراک شمارهٔ من", "request_contact": True}], [{"text": B_CANCEL}]],
                "resize_keyboard": True, "one_time_keyboard": True}

    def cancel_kb(self, rows=None):
        return {"keyboard": (rows or []) + [[{"text": B_CANCEL}]], "resize_keyboard": True}

    # ---------------------------------------------------------- setup / periodic
    def setup(self):
        """فهرست دستورها و توضیح ربات به فارسی."""
        try:
            self.bot.call("setMyCommands", {"commands": [{"command": c, "description": d} for c, d in COMMANDS]}, timeout=15)
            self.bot.call("setMyShortDescription", {"short_description": "دستیار هوشمند فرصت ملک: ملک زیر قیمت، تخمین ارزش، رادار کاهش قیمت و پشتیبانی، محله به محله."}, timeout=15)
            self.bot.call("setMyDescription", {"description": (
                "سلام! من دستیار فرصت ملک هستم.\n"
                "نام شهر و محله را بنویسید تا بهترین آگهی‌های آن‌جا را با ارزش برآوردی ببینید؛ ارزش منصفانهٔ ملک خودتان را حساب کنید؛ "
                "فروشنده‌هایی را که قیمت را پایین آورده‌اند پیدا کنید؛ برای فرصت‌های تازهٔ محله‌تان هشدار بگیرید "
                "و پرسش‌هایتان را از پشتیبانی بپرسید.\nforsatmelk.ir")}, timeout=15)
            self.ready_once = True
        except Exception as e:  # noqa: BLE001
            self.bot.state["last_error"] = f"تنظیم منوی ربات: {e}"[:200]

    def tick(self):
        """یادآوری پایان اشتراک: دو روز مانده و پس از پایان (هر کدام یک بار برای هر دورهٔ اشتراک)."""
        now = int(time.time())
        for r in self.store.q("SELECT l.phone, l.chat_id, u.sub_until FROM tg_links l JOIN users u ON u.phone=l.phone "
                              "WHERE u.sub_until BETWEEN ? AND ?", (now - 86400, now + 2 * 86400)):
            until = r["sub_until"]
            kind = "ended" if until <= now else "soon"
            if self.store.q("SELECT 1 FROM tg_remind WHERE phone=? AND kind=? AND until=?", (r["phone"], kind, until), one=True):
                continue
            if kind == "soon":
                left = max(1, -(-(until - now) // 86400))
                txt = f"⏰ اشتراک فرصت ملک شما {fa(left)} روز دیگر تمام می‌شود. برای اینکه شکارهای طلایی و هشدارهای محله قطع نشود، اشتراک را تمدید کنید."
            else:
                txt = "اشتراک فرصت ملک شما به پایان رسید. با تمدید، دوباره به شکارهای طلایی، رادار کاهش قیمت و هشدار فرصت‌های تازه دسترسی دارید."
            if self.send(r["chat_id"], txt, kb=self.sub_kb()):
                self.store.x("INSERT OR IGNORE INTO tg_remind VALUES(?,?,?)", (r["phone"], kind, until))

    # ---------------------------------------------------------- entry
    def handle(self, u: dict):
        if u.get("callback_query"):
            return self.on_callback(u["callback_query"])
        m = u.get("message") or {}
        chat = (m.get("chat") or {}).get("id")
        if not chat or (m.get("chat") or {}).get("type", "private") != "private":
            return
        if self.limited(chat):
            return
        frm = m.get("from") or {}
        if m.get("contact"):
            return self.on_contact(chat, frm, m["contact"])
        text = (m.get("text") or m.get("caption") or "").strip()
        if not text:
            return self.send(chat, "فعلاً فقط پیام متنی را می‌فهمم. نام شهر و محله یا پرسش خود را بنویسید، یا از دکمه‌های پایین صفحه استفاده کنید.\n"
                                   "برای فرستادن تصویر رسید پرداخت، از بخش پشتیبانی سایت استفاده کنید.")
        if text.startswith("/start"):
            arg = text[6:].strip()
            self.state.pop(chat, None)
            if arg.startswith("alert_"):
                return self.on_alert_link(chat, frm, arg[6:])
            return self.welcome(chat, frm)
        if text.startswith("/"):
            text = CMD_TO_BTN.get(text.split()[0].split("@")[0].lower(), text)
        if text == B_CANCEL:
            self.state.pop(chat, None)
            return self.send(chat, "لغو شد. هر وقت خواستید از منو انتخاب کنید یا نام شهر و محله را بنویسید.")
        if text in BUTTONS:
            self.state.pop(chat, None)
            return {B_GOLD: self.gold, B_RADAR: self.radar, B_EST: self.est_start, B_SEARCH: self.search_help, B_PRICE: self.price_help,
                    B_PLANS: self.plans, B_ACCOUNT: self.account, B_ALERT: self.alert, B_SUPPORT: self.support, B_HELP: self.help}[text](chat)
        st = self.state.get(chat)
        if st:
            if st.get("flow") == "est":
                return self.est_step(chat, text)
            if st.get("flow") == "ticket":
                return self.ticket_body(chat, text)
            if st.get("flow") == "reply":
                return self.ticket_reply(chat, text)
        return self.free_text(chat, text)

    def welcome(self, chat, frm):
        name = esc((frm.get("first_name") or "").strip()[:30])
        self.send(chat, (f"سلام{(' ' + name) if name else ''}! 👋 به دستیار هوشمند <b>فرصت ملک</b> خوش آمدید.\n\n"
                         "کافی است بنویسید کجا دنبال ملک هستید؛ مثلاً:\n"
                         "• «آپارتمان زیر قیمت در رشت منظریه»\n• «تهران پونک ۱۰۰ متری»\n• «رهن آپارتمان در شیراز معالی‌آباد»\n"
                         "• «قیمت متری رشت گلسار»\n\n"
                         "پرسش‌هایی مثل «قیمت‌ها چطور حساب می‌شود؟» یا «اشتراک چند است؟» را هم همین‌جا بپرسید؛ "
                         "اگر پاسخ را نداشته باشم، پرسش شما را برای پشتیبانی می‌فرستم و جوابش همین‌جا می‌رسد."))
        if not self.phone_of(chat):
            self.send(chat, "برای دیدن جزئیات کامل فرصت‌ها (ویژهٔ مشترکان) و پیگیری تیکت‌ها، یک بار حساب سایت را با شمارهٔ موبایل به ربات وصل کنید:",
                      kb={"inline_keyboard": [[{"text": "🔗 اتصال حساب سایت", "callback_data": "link"}]]})

    # ---------------------------------------------------------- account link
    def ask_contact(self, chat, then=None):
        if then:
            self.state[chat] = {"flow": "contact", "then": then}
        self.send(chat, "دکمهٔ «📱 اشتراک شمارهٔ من» را بزنید تا تلگرام شماره‌تان را بفرستد. شماره فقط برای شناختن حساب شما در سایت به کار می‌رود.",
                  kb=self.contact_kb())

    def on_contact(self, chat, frm, c):
        from billing import norm_phone
        if not c.get("user_id") or c["user_id"] != frm.get("id"):
            return self.send(chat, "فقط شمارهٔ خودتان را با دکمهٔ «📱 اشتراک شمارهٔ من» بفرستید.", kb=self.contact_kb())
        phone = norm_phone(c.get("phone_number"))
        if not phone or not re.fullmatch(r"09\d{9}", phone):
            return self.send(chat, "این شماره معتبر نیست؛ فقط شماره‌های موبایل ایران پذیرفته می‌شود.")
        self.bot.link(phone, chat, frm.get("id"))
        then = (self.state.pop(chat, None) or {}).get("then")
        if not self.billing.user(phone):
            self.send(chat, ("✅ شماره ثبت شد، اما هنوز با این شماره در سایت حسابی ساخته نشده است.\n"
                             "در سایت با همین شماره ثبت‌نام کنید (چند ثانیه طول می‌کشد)؛ ربات خودکار حساب را می‌شناسد."),
                      kb={"inline_keyboard": [[{"text": "ثبت‌نام در سایت", "url": self.base() + "/account.html"}]]})
        else:
            self.send(chat, "✅ حساب شما به ربات وصل شد.")
        if then == "support":
            return self.support(chat)
        if then == "alert":
            return self.alert(chat)
        return self.account(chat)

    def on_alert_link(self, chat, frm, nonce):
        n = self.bot._take(nonce)
        if not n or n["kind"] != "alert":
            return self.send(chat, "این پیوند منقضی شده است؛ در سایت دوباره «خبرم کن» را بزنید.")
        self.bot.link(n["phone"], chat, frm.get("id"))
        self.send(chat, "🔔 هشدار فرصت‌های تازه در تلگرام فعال شد.\nهر وقت آگهی تازه‌ای با امتیاز بالا در منطقهٔ انتخابی شما پیدا شود، "
                        "همین‌جا خبرتان می‌کنیم (حداکثر چند پیام در روز).\n\nبقیهٔ امکانات ربات هم از منوی پایین صفحه در دسترس است.")

    def account(self, chat):
        u, phone = self.user_of(chat)
        if not phone:
            return self.ask_contact(chat)
        masked = phone[:4] + "•••" + phone[-4:]
        if not u:
            return self.send(chat, f"شمارهٔ {fa(masked)} وصل است، ولی هنوز با آن در سایت ثبت‌نام نکرده‌اید.",
                             kb={"inline_keyboard": [[{"text": "ثبت‌نام در سایت", "url": self.base() + "/account.html"}]]})
        if u["active"]:
            from seo import jdate
            plan = {"weekly": "هفتگی", "monthly": "ماهانه", "trial": "آزمایشی"}.get(u["plan"], u["plan"] or "")
            return self.send(chat, (f"👤 <b>حساب من</b>\nشماره: {fa(masked)}\n✅ اشتراک {esc(plan)} فعال است\n"
                                    f"اعتبار تا {esc(jdate(u['sub_until']))} ({fa(u['days_left'])} روز مانده)\n\n"
                                    "همهٔ امکانات ربات برای شما باز است: شکارهای طلایی، رادار کاهش قیمت، جزئیات کامل آگهی‌ها و هشدار محله."),
                             kb={"inline_keyboard": [[{"text": "تمدید اشتراک", "url": self.base() + "/account.html?subscribe=1"},
                                                      {"text": "حساب در سایت", "url": self.base() + "/account.html"}],
                                                     [{"text": "📨 تیکت‌های من", "callback_data": "tk_list"}]]})
        return self.send(chat, (f"👤 <b>حساب من</b>\nشماره: {fa(masked)}\n⛔️ اشتراک فعال ندارید.\n\n"
                                "با اشتراک، شکارهای طلایی روز، رادار کاهش قیمت، فاصلهٔ قیمت هر آگهی با ارزش برآوردی، "
                                "آدرس و پیوند آگهی اصلی و هشدار فوری فرصت‌های تازهٔ محله‌تان باز می‌شود."),
                         kb=self.sub_kb([[{"text": "📨 تیکت‌های من", "callback_data": "tk_list"}]]))

    # ---------------------------------------------------------- listings
    def card(self, d, sub) -> tuple[str, list]:
        from features import clean_title
        kind = KIND_FA.get(d.get("kind"), "ملک")
        city = d.get("city_name") or (CITY_BY_KEY.get(d.get("city_key")) or {}).get("name") or ""
        where = "، ".join(x for x in (d.get("district"), city) if x)
        bits = []
        if d.get("area"):
            bits.append(f"{fa_int(d['area'])} متر")
        if d.get("rooms"):
            bits.append(f"{fa(int(d['rooms']))} خواب")
        if d.get("year"):
            bits.append(f"ساخت {fa(int(d['year']))}")
        if sub:
            title = fa(clean_title(d.get("title") or "", d.get("kind"), d.get("area"), d.get("district"))[0] or kind)
        else:
            title = f"{kind}{(' ' + fa_int(d['area']) + ' متری') if d.get('area') else ''}"
        if d.get("deal") == "rent":
            price = f"ودیعه {money(d.get('deposit'))} · اجاره {money(d.get('rent'))}"
        else:
            price = money(d.get("pp") or d.get("price"))
        lines = [f"🏠 <b>{esc(title)}</b>", f"📍 {esc(where)}" if where else "", ("📐 " + " · ".join(bits)) if bits else "", f"💰 {price}"]
        lab = LABEL_FA.get(d.get("label"))
        disc = d.get("discount")
        if lab:
            if sub and disc and disc > 0 and d.get("label") in ("gold", "good"):
                lo = int(disc * 100) // 5 * 5
                lines.append(f"{lab} · حدود {fa(lo)} تا {fa(lo + 5)}٪ زیر ارزش برآوردی")
            elif d.get("label") in ("gold", "good") and not sub:
                lines.append(lab + " · 🔒 فاصله با ارزش برآوردی ویژهٔ مشترکان")
            else:
                lines.append(lab)
        di = d.get("drop_info")
        if di:
            lines.append(f"📉 کاهش قیمت: از {money(di['prev'])} به {money(di['now'])} ({fa_pct(di['pct'])}٪)")
        btns = [{"text": "📄 شناسنامهٔ قیمت در سایت", "url": f"{self.base()}/ad/{d['id']}"}]
        if sub and d.get("url"):
            btns.append({"text": "🔗 آگهی اصلی", "url": d["url"]})
        return "\n".join(x for x in lines if x), [btns]

    def send_cards(self, chat, items, sub):
        for d in items:
            text, kb = self.card(d, sub)
            self.send(chat, text, kb={"inline_keyboard": kb})

    def scope(self, chat):
        city, dist = self.pref(chat)
        f = {}
        if city in CITY_BY_KEY:
            f["city"] = city
            if dist:
                f["district"] = dist
        return f, city, dist

    @staticmethod
    def scope_name(city, dist):
        if city not in CITY_BY_KEY:
            return "سراسر ایران"
        return (f"{dist}، " if dist else "") + CITY_BY_KEY[city]["name"]

    def gold(self, chat):
        sub = self.is_sub(chat)
        f, city, dist = self.scope(chat)
        tries = [(1, f), (3, f), (7, f)]
        if f.get("district"):
            tries.append((7, {"city": f["city"]}))
        found, window, total = [], None, 0
        for fresh, flt in tries:
            r = self.store.search({**flt, "label": "gold", "sort": "score", "fresh": fresh, "limit": 5, "points": "0"})
            if r["items"]:
                found, window, total = r["items"], fresh, r["total"]
                if "district" not in flt:
                    dist = None
                break
        where = self.scope_name(city, dist)
        if not found:
            return self.send(chat, f"در هفت روز گذشته در {esc(where)} آگهی با برچسب «فرصت طلایی» ثبت نشده است. "
                                   "نام شهر یا محلهٔ دیگری بنویسید، یا «🔔 هشدار محلهٔ من» را بزنید تا به محض پیدا شدن خبرتان کنیم.")
        span = "۲۴ ساعت گذشته" if window == 1 else f"{fa(window)} روز گذشته"
        head = f"🔥 <b>شکارهای طلایی {esc(where)}</b>\n{fa_int(total)} فرصت طلایی در {span} ثبت شده است."
        if not sub:
            self.send(chat, head + "\n\nپیش‌نمایش دو مورد را می‌بینید؛ فهرست کامل، فاصلهٔ قیمت با ارزش برآوردی، آدرس و پیوند آگهی اصلی ویژهٔ مشترکان است.", kb=self.sub_kb())
            return self.send_cards(chat, found[:2], False)
        self.send(chat, head + ("\nبرای محدودهٔ دیگر، نام شهر و محله را بنویسید." if city else "\nبرای دیدن شهر خودتان، نام شهر و محله را بنویسید."))
        self.send_cards(chat, found, True)
        self.send(chat, "⚠️ پیش از هر اقدام، سند و واقعی بودن آگهی را استعلام کنید.")

    def radar(self, chat):
        sub = self.is_sub(chat)
        f, city, dist = self.scope(chat)
        q = {"drop": 1, "sort": "drop_new", "drop_info": 1, "limit": 8, "points": "0"}
        r = self.store.search({**f, **q})
        if not r["items"] and dist:
            r = self.store.search({"city": city, **q})
            dist = None
        where = self.scope_name(city, dist)
        items = [d for d in r["items"] if d.get("drop_info")][:5]
        if not items:
            return self.send(chat, f"فعلاً در {esc(where)} کاهش قیمتی ثبت نشده است. نام شهر یا محلهٔ دیگری را بنویسید.")
        head = f"📉 <b>رادار کاهش قیمت {esc(where)}</b>\n{fa_int(r['total'])} آگهی که فروشنده قیمت را پایین آورده؛ تازه‌ترین‌ها:"
        if not sub:
            self.send(chat, head + "\n\nپیش‌نمایش یک مورد را می‌بینید؛ فهرست کامل و پیوند آگهی‌ها ویژهٔ مشترکان است.", kb=self.sub_kb())
            return self.send_cards(chat, items[:1], False)
        self.send(chat, head)
        self.send_cards(chat, items, True)

    def listing(self, chat, lid):
        r = self.store.search({"ids": lid, "limit": 1, "points": "0", "drop_info": 1})
        if not r["items"]:
            return self.send(chat, "این آگهی پیدا نشد یا دیگر فعال نیست.")
        sub = self.is_sub(chat)
        self.send_cards(chat, r["items"], sub)
        if not sub:
            self.send(chat, "فاصلهٔ قیمت با ارزش برآوردی، آدرس و پیوند آگهی اصلی ویژهٔ مشترکان است.", kb=self.sub_kb())

    # ---------------------------------------------------------- parsing
    def find_city(self, words):
        names = {}
        for c in catalog.CITIES:
            names.setdefault(squash(c["name"]), c)
        for n in (3, 2, 1):
            for i in range(len(words) - n + 1):
                w = squash(" ".join(words[i:i + n]))
                if len(w) >= 2 and w in names:
                    return names[w], set(range(i, i + n))
        for i, w in enumerate(words):   # نام کوتاه‌شده («انزلی» ← «بندر انزلی»)
            if len(w) >= 4 and w not in STOP:
                hit = [c for k, c in names.items() if squash(w) in k]
                if len(hit) == 1:
                    return hit[0], {i}
        return None, set()

    def find_district(self, city, words, used, names=None):
        from districts import matches
        names = names if names is not None else [d["name"] for d in self.store.districts(city)]
        if not names:
            return None
        rest = [w for i, w in enumerate(words) if i not in used and w not in STOP and not w.isdigit() and len(w) >= 2]
        for n in (3, 2, 1):
            best, size = None, 0
            for i in range(len(rest) - n + 1):
                phrase = " ".join(rest[i:i + n])
                hit = next((d for d in names if squash(phrase) == squash(d)), None) or next((d for d in names if matches(phrase, d)), None)
                if hit and len(squash(phrase)) > size:
                    best, size = hit, len(squash(phrase))
            if best:
                return best
        return None

    def parse(self, text):
        t = clean(text)
        words = t.split()
        f = {}
        city, used = self.find_city(words)
        if city:
            f["city"] = city["key"]
            dist = self.find_district(city["key"], words, used)
            if dist:
                f["district"] = dist
        f["deal"] = "rent" if has(t, RENT_WORDS) else "sale"
        kinds = {k for w, k in KIND_WORDS if w in t}
        if kinds:
            f["kinds"] = ",".join(sorted(kinds))
        if has(t, OPP_WORDS):
            f["opp"] = 1
        m = re.search(r"(\d{2,4})\s*(?:متر|متری)", t)
        if m:
            a = int(m.group(1))
            f["areaMin"], f["areaMax"] = int(a * 0.85), int(a * 1.15)
        m = re.search(r"(\d)\s*(?:خواب|خوابه)", t)
        if m:
            f["rooms"] = m.group(1)
        m = re.search(r"(?:زیر|تا|حداکثر|کمتر\s*از|سقف)\s*(\d+(?:[/]\d+)?)\s*(میلیارد|میلیون)", t.replace("٫", "/"))
        if m:
            v = float(m.group(1).replace("/", "."))
            f["max"] = int(v * (1e9 if m.group(2) == "میلیارد" else 1e6))
        return f

    # ---------------------------------------------------------- free text
    def free_text(self, chat, text):
        m = re.search(r"/ad/([\w-]{1,60})", text)
        if m:
            return self.listing(chat, m.group(1))
        t = clean(text)
        f = self.parse(text)
        if f.get("city") and has(t, PRICE_WORDS) and not f.get("opp"):
            return self.price_report(chat, f["city"], f.get("district"), (f.get("kinds") or "apartment").split(",")[0])
        # شهر به‌تنهایی کافی نیست: «رشت گلسار» یا متنی با واژه‌های ملکی جست‌وجوست؛ پرسش‌های بی‌ربط («هواپیما کی به کیش می‌رسد») نه
        if f.get("city") and (f.get("district") or has(t, ESTATE_WORDS) or len(t.split()) <= 3):
            return self.search(chat, f)
        if has(t, PROBLEM_WORDS):
            return self.offer_ticket(chat, text, guess=self.guess_cat(t))
        key = self.faq(t)
        if key:
            return self.answer(chat, key)
        if len(t) <= 2:
            return self.send(chat, "نام شهر و محله یا پرسش خود را بنویسید.")
        return self.offer_ticket(chat, text)

    def search_help(self, chat):
        city, dist = self.pref(chat)
        sample = f"«{self.scope_name(city, dist)} ۱۰۰ متری»" if city in CITY_BY_KEY else "«تهران پونک ۱۰۰ متری»"
        self.send(chat, ("🔎 نام شهر و محله را با هر جزئیاتی که می‌خواهید بنویسید؛ مثلاً:\n"
                         f"• {esc(sample)}\n• «آپارتمان زیر قیمت در رشت منظریه»\n• «ویلا در نوشهر زیر ۸ میلیارد»\n"
                         "• «رهن آپارتمان ۲ خواب در اصفهان»\n\nمتن را تحلیل می‌کنم و بهترین آگهی‌های همان منطقه را به ترتیب امتیاز می‌فرستم. "
                         "پیوند هر آگهی فرصت ملک را هم بفرستید تا خلاصهٔ ارزیابی‌اش را بفرستم."))

    def search(self, chat, f):
        self.set_pref(chat, f["city"], f.get("district"))
        sub = self.is_sub(chat)
        q = {**f, "ranked": 1, "sort": "score", "limit": 5 if sub else 3, "points": "0"}
        r = self.store.search(q)
        note = ""
        if not r["items"] and f.get("district"):
            q.pop("district")
            r = self.store.search(q)
            note += f"در محلهٔ «{esc(f['district'])}» آگهی مطابقی پیدا نشد؛ نتایج کل {esc(CITY_BY_KEY[f['city']]['name'])}:\n"
            f = {**f}
            f.pop("district")
        if not r["items"] and f.get("opp"):
            q.pop("opp")
            r = self.store.search(q)
            note += "فرصت زیر قیمتی با این مشخصات پیدا نشد؛ بهترین آگهی‌های موجود به ترتیب امتیاز:\n"
        where = self.scope_name(f["city"], f.get("district"))
        if not r["items"]:
            return self.send(chat, f"در {esc(where)} آگهی فعالی با این مشخصات پیدا نشد. شرط‌ها را کمتر کنید (مثلاً متراژ یا سقف قیمت را بردارید).")
        deal = "رهن و اجاره" if f["deal"] == "rent" else "خرید"
        kinds = "، ".join(KIND_FA[k] for k in (f.get("kinds") or "").split(",") if k in KIND_FA) or "همهٔ انواع ملک"
        self.send(chat, (f"{note}🔎 <b>{esc(where)}</b> · {deal} · {esc(kinds)}\n{fa_int(r['total'])} آگهی پیدا شد؛ "
                         f"{'بهترین‌ها' if sub else 'پیش‌نمایش سه مورد برتر'} به ترتیب امتیاز:"))
        self.send_cards(chat, r["items"], sub)
        if not sub:
            self.send(chat, "جزئیات کامل، فاصله با ارزش برآوردی و پیوند آگهی اصلی ویژهٔ مشترکان است.", kb=self.sub_kb())
        else:
            self.send(chat, "می‌خواهید آگهی‌های تازهٔ این محدوده را خودکار برایتان بفرستم؟",
                      kb={"inline_keyboard": [[{"text": "🔔 هشدار فرصت‌های تازهٔ همین محدوده", "callback_data": "alert_here"}]]})

    # ---------------------------------------------------------- district prices
    def base_of(self, kind="apartment"):
        from features import kind_group
        e = self.store.get_setting("estimator") or {}
        return (e.get(kind_group(kind)) or {}).get("base") or {}

    def price_help(self, chat):
        city, dist = self.pref(chat)
        if city in CITY_BY_KEY:
            return self.price_report(chat, city, dist)
        self.send(chat, "📊 نام شهر (و در صورت تمایل محله) را با واژهٔ «قیمت متری» بنویسید؛ مثلاً «قیمت متری رشت گلسار» یا «قیمت متری تهران».")

    def price_report(self, chat, city, dist=None, kind="apartment"):
        self.set_pref(chat, city, dist)
        base = self.base_of(kind)
        cname = CITY_BY_KEY[city]["name"]
        names = {d["name"]: d["n"] for d in self.store.districts(city)}
        rows = []
        for k, v in base.items():
            if not k.startswith(city + "|") or not v or len(v) < 2:
                continue
            nm = next((n for n in names if catalog.norm(n).replace(" ", "") == k.split("|", 1)[1]), k.split("|", 1)[1])
            rows.append((nm, math.exp(v[0]), int(v[1])))
        kfa = KIND_FA.get(kind, "ملک")
        if not rows:
            return self.send(chat, f"برای {kfa} در {esc(cname)} هنوز آگهی معتبر کافی برای محاسبهٔ قیمت متری محله‌ها نداریم.")
        if dist:
            hit = next((r for r in rows if squash(r[0]) == squash(dist)), None)
            if hit:
                rank = sorted(rows, key=lambda r: -r[1]).index(hit) + 1
                return self.send(chat, (f"📊 <b>قیمت متری {kfa} در {esc(hit[0])}، {esc(cname)}</b>\n"
                                        f"میانهٔ قیمت هر متر: <b>{money(hit[1])}</b>\nمبنا: {fa_int(hit[2])} آگهی معتبر\n"
                                        f"رتبهٔ گرانی در میان {fa(len(rows))} محلهٔ دارای داده: {fa(rank)}\n\n"
                                        "قیمت هر ملک بسته به سن بنا، طبقه، امکانات و سند با این میانه فرق دارد؛ برای ملک خودتان «🧮 تخمین قیمت ملک» را بزنید."),
                                 kb={"inline_keyboard": [[{"text": "🗺 نقشهٔ قیمت از دید آسمان", "url": self.base() + "/sky.html"}],
                                                         [{"text": "🔎 آگهی‌های همین محله", "callback_data": "here"}]]})
        rows.sort(key=lambda r: -r[1])
        top, low = rows[:5], rows[-5:][::-1] if len(rows) > 5 else []
        lines = [f"📊 <b>قیمت متری {kfa} در {esc(cname)}</b> (میانهٔ آگهی‌های معتبر هر محله)", "", "گران‌ترین محله‌ها:"]
        lines += [f"• {esc(n)}: {money(p)} ({fa_int(c)} آگهی)" for n, p, c in top]
        if low:
            lines += ["", "ارزان‌ترین محله‌ها:"] + [f"• {esc(n)}: {money(p)} ({fa_int(c)} آگهی)" for n, p, c in low]
        lines.append("\nبرای یک محلهٔ مشخص بنویسید: «قیمت متری " + esc(cname) + " نام‌محله».")
        self.send(chat, "\n".join(lines), kb={"inline_keyboard": [[{"text": "🗺 نقشهٔ قیمت از دید آسمان", "url": self.base() + "/sky.html"}]]})

    # ---------------------------------------------------------- estimator
    def est_start(self, chat):
        self.state[chat] = {"flow": "est", "step": "city", "q": {}}
        city, _ = self.pref(chat)
        rows = [[{"text": CITY_BY_KEY[city]["name"]}]] if city in CITY_BY_KEY else []
        self.send(chat, "🧮 <b>تخمین ارزش منصفانهٔ ملک</b>\nگام ۱ از ۵: ملک در کدام <b>شهر</b> است؟", kb=self.cancel_kb(rows))

    def est_districts(self, city, kind="apartment"):
        base = self.base_of(kind)
        keys = {k.split("|", 1)[1] for k in base if k.startswith(city + "|")}
        return [d["name"] for d in self.store.districts(city) if catalog.norm(d["name"]).replace(" ", "") in keys]

    def est_step(self, chat, text):
        st = self.state[chat]
        q, t = st["q"], clean(text)
        if st["step"] == "city":
            c, _ = self.find_city(t.split())
            if not c:
                return self.send(chat, "این شهر را نشناختم؛ نام شهر را دوباره بنویسید (مثلاً «رشت» یا «تهران»).", kb=self.cancel_kb())
            q["city"], st["step"] = c["key"], "kind"
            return self.send(chat, f"گام ۲ از ۵: <b>نوع ملک</b> در {esc(c['name'])} چیست؟",
                             kb=self.cancel_kb([[{"text": "آپارتمان"}, {"text": "ویلا"}, {"text": "زمین"}]]))
        if st["step"] == "kind":
            k = next((v for w, v in KIND_WORDS if w in t), None)
            if k not in ("apartment", "villa", "land", "suite"):
                return self.send(chat, "یکی از گزینه‌های آپارتمان، ویلا یا زمین را انتخاب کنید.")
            ds = self.est_districts(q["city"], k)
            if not ds:
                st["step"] = "city"
                return self.send(chat, f"برای {KIND_FA[k]} در {esc(CITY_BY_KEY[q['city']]['name'])} هنوز دادهٔ کافی برای تخمین نداریم. شهر دیگری بنویسید.", kb=self.cancel_kb())
            q["kind"], st["districts"], st["step"] = k, ds, "district"
            rows = [[{"text": d} for d in ds[i:i + 3]] for i in range(0, min(len(ds), 18), 3)]
            return self.send(chat, "گام ۳ از ۵: ملک در کدام <b>محله</b> است؟\nاز دکمه‌ها انتخاب کنید یا نام محله را بنویسید.", kb=self.cancel_kb(rows))
        if st["step"] == "district":
            hit = self.find_district(q["city"], t.split(), set(), st["districts"])
            if not hit:
                return self.send(chat, "این محله در فهرست محله‌های دارای داده نیست. یکی از دکمه‌ها را انتخاب کنید یا نام را دقیق‌تر بنویسید.")
            q["district"], st["step"] = hit, "area"
            return self.send(chat, "گام ۴ از ۵: <b>متراژ</b> ملک چند متر است؟ (فقط عدد، مثلاً ۱۲۰)", kb=self.cancel_kb())
        if st["step"] == "area":
            m = re.search(r"\d+", t)
            a = int(m.group()) if m else 0
            if not 15 <= a <= 20000:
                return self.send(chat, "متراژ را به صورت عدد بنویسید (مثلاً ۱۲۰).")
            q["area"] = a
            if q["kind"] == "land":
                return self.est_finish(chat)
            st["step"] = "year"
            return self.send(chat, "گام ۵ از ۵: <b>سال ساخت</b> (مثلاً ۱۳۹۵) یا سن بنا (مثلاً «۸ سال») را بنویسید.",
                             kb=self.cancel_kb([[{"text": "نوساز"}, {"text": B_SKIP}]]))
        if st["step"] == "year":
            from features import jalali_year_now
            now = jalali_year_now()
            m = re.search(r"\d+", t)
            if "نوساز" in t:
                q["year"] = now
            elif B_SKIP in text or "نمیدانم" in t:
                pass
            elif m:
                v = int(m.group())
                if 1300 <= v <= now + 3:
                    q["year"] = v
                elif 1900 <= v <= 2100:
                    q["year"] = v - 621
                elif 0 <= v <= 80:
                    q["year"] = now - v
                else:
                    return self.send(chat, "سال ساخت را چهاررقمی (مثلاً ۱۳۹۵) یا سن بنا را (مثلاً «۸ سال») بنویسید.")
            else:
                return self.send(chat, "سال ساخت را چهاررقمی (مثلاً ۱۳۹۵) یا سن بنا را (مثلاً «۸ سال») بنویسید، یا «نمی‌دانم» را بزنید.")
            return self.est_finish(chat)

    def est_finish(self, chat):
        q = self.state.pop(chat)["q"]
        self.set_pref(chat, q["city"], q["district"])
        try:
            r = self.estimate(self.store, {k: str(v) for k, v in q.items()})
        except ValueError as e:
            return self.send(chat, f"تخمین ممکن نشد: {esc(e)}")
        kind = KIND_FA.get(q["kind"], "ملک")
        lines = ["🧮 <b>ارزش منصفانهٔ برآوردی</b>",
                 f"{kind} {fa_int(q['area'])} متری در {esc(q['district'])}، {esc(CITY_BY_KEY[q['city']]['name'])}"
                 + (f" · ساخت {fa(q['year'])}" if q.get("year") else ""),
                 "", f"💰 ارزش کل: حدود <b>{money(r['total'])}</b>", f"📐 قیمت هر متر: حدود <b>{money(r['ppm'])}</b>",
                 f"میانهٔ قیمت متری محله: {money(r['base_ppm'])}"]
        if r.get("effects"):
            lines.append("\nاثر ویژگی‌ها بر قیمت متری:")
            for lab, p in r["effects"][:6]:
                lines.append(f"• {esc(lab)}: {'+' if p > 0 else '−'}{fa_pct(p)}٪")
        lines.append(f"\nمبنا: {fa_int(r['n'])} آگهی معتبر همین محله"
                     + ("، با مدل آماری همین شهر" if r.get("method") == "model" else "، با ضریب‌های عرف بازار (مدل آماری این شهر هنوز دادهٔ کافی ندارد)") + ".")
        lines.append("این عدد برآورد آماری از آگهی‌هاست، نه قیمت کارشناسی رسمی. برای جزئیات بیشتر (طبقه، آسانسور، پارکینگ و…) از ماشین‌حساب سایت استفاده کنید.")
        self.send(chat, "\n".join(lines), kb={"inline_keyboard": [[{"text": "🧮 ماشین‌حساب کامل در سایت", "url": self.base() + "/#estimator"}],
                                                                   [{"text": "🔎 آگهی‌های همین محله", "callback_data": "here"}]]})
        self.send(chat, "برای تخمین دوباره «🧮 تخمین قیمت ملک» را بزنید.")

    # ---------------------------------------------------------- plans / alert
    def plans(self, chat):
        ps = self.billing.plans()
        u, phone = self.user_of(chat)
        lines = ["💎 <b>اشتراک فرصت ملک</b>"]
        if u and u["active"]:
            lines.append(f"✅ اشتراک شما فعال است ({fa(u['days_left'])} روز مانده). برای تمدید، طرح دلخواه را در سایت انتخاب کنید.")
        if ps:
            lines.append("")
            lines += [f"• طرح {esc(p['name'])}: {fa_int(p['price'])} تومان برای {fa(p['days'])} روز" for p in ps]
        lines += ["", "با اشتراک باز می‌شود:", "• شکارهای طلایی روز و رادار کاهش قیمت در ربات و سایت",
                  "• فاصلهٔ قیمت هر آگهی با ارزش برآوردی و دلیل ارزانی", "• آدرس، توضیحات کامل و پیوند آگهی اصلی",
                  "• هشدار فوری فرصت‌های تازهٔ محلهٔ دلخواه در تلگرام یا بله",
                  "", "پرداخت در سایت انجام می‌شود و اشتراک همان لحظه فعال است. اگر حسابتان به ربات وصل باشد، رسید و امکانات کامل همین‌جا هم باز می‌شود."]
        extra = [] if phone else [[{"text": "🔗 اتصال حساب سایت به ربات", "callback_data": "link"}]]
        self.send(chat, "\n".join(lines), kb=self.sub_kb(extra))

    def alert(self, chat, here=False):
        u, phone = self.user_of(chat)
        if not phone:
            self.send(chat, "هشدار فرصت‌های تازه ویژهٔ مشترکان است. اول حساب سایت را به ربات وصل کنید:")
            return self.ask_contact(chat, then="alert")
        from alerts import allowed
        if not allowed(u):
            return self.send(chat, "🔔 هشدار فوری فرصت‌های تازهٔ محله ویژهٔ مشترکان است (برای ثبت‌نامی‌های تازه ۵ روز رایگان).", kb=self.sub_kb())
        al = self.app.alerts
        city, dist = self.pref(chat)
        if here:
            if city not in CITY_BY_KEY:
                return self.send(chat, "اول نام شهر و محله را بنویسید (مثلاً «رشت گلسار»).")
            try:
                al.add(phone, {"city": city, "province": CITY_BY_KEY[city]["province"], "district": dist or "", "deal": "sale", "channel": "telegram"})
            except ValueError as e:
                return self.send(chat, esc(e))
            return None   # پیام تأیید را خود بخش هشدار همین‌جا می‌فرستد
        mine = [a for a in al.mine(phone)["items"] if a.get("channel") == "telegram"]
        lines, kb = ["🔔 <b>هشدار فرصت‌های تازه</b>"], []
        if mine:
            lines.append("هشدارهای فعال شما در تلگرام:")
            for a in mine:
                names = "، ".join(CITY_BY_KEY[c]["name"] for c in (a.get("city") or "").split(",") if c in CITY_BY_KEY) or \
                        (catalog.PROVINCES.get(a.get("province") or "") or {}).get("name", "")
                label = ((a.get("district") + "، ") if a.get("district") else "") + names
                lines.append(f"• {esc(label)}")
                kb.append([{"text": f"🗑 حذف هشدار {label}"[:60], "callback_data": f"al_rm:{a['id']}"}])
        else:
            lines.append("هنوز هشداری در تلگرام ندارید.")
        if city in CITY_BY_KEY:
            kb.insert(0, [{"text": f"➕ هشدار برای {self.scope_name(city, dist)}"[:60], "callback_data": "alert_here"}])
            lines.append("\nبرای محدودهٔ دیگر، اول نام شهر و محله را بنویسید و بعد دکمهٔ هشدار را بزنید.")
        else:
            lines.append("\nنام شهر و محله را بنویسید (مثلاً «رشت گلسار») تا دکمهٔ ساخت هشدار برای همان محدوده ظاهر شود.")
        lines.append("هر هشدار حداکثر چند پیام در روز می‌فرستد تا مزاحم نشود.")
        self.send(chat, "\n".join(lines), kb={"inline_keyboard": kb} if kb else None)

    # ---------------------------------------------------------- support
    def support(self, chat):
        _, phone = self.user_of(chat)
        if not phone:
            self.send(chat, "برای ثبت و پیگیری تیکت، اول شمارهٔ موبایل خود را تأیید کنید تا پاسخ پشتیبانی به همین گفت‌وگو برسد:")
            return self.ask_contact(chat, then="support")
        rows = [[{"text": n, "callback_data": f"tk_new:{k}"}] for k, n in TICKET_CATS]
        rows.append([{"text": "📨 تیکت‌های من", "callback_data": "tk_list"}])
        self.send(chat, ("🎧 <b>پشتیبانی فرصت ملک</b>\nبیشتر پرسش‌ها را خودم فوراً جواب می‌دهم؛ کافی است بپرسید.\n"
                         "اگر مشکلی دارید (پرداخت، کد ورود، آگهی و…)، موضوع را انتخاب کنید تا تیکت ثبت شود. "
                         "پاسخ پشتیبانی همین‌جا در تلگرام به دستتان می‌رسد."), kb={"inline_keyboard": rows})

    def guess_cat(self, t):
        if has(t, ("پرداخت", "اشتراک", "پول", "کارت", "واریز", "رسید", "تمدید", "فاکتور")):
            return "payment"
        if has(t, ("کد", "پیامک", "اس ام اس", "ورود", "رمز", "لاگین")):
            return "sms"
        if has(t, ("آگهی", "قیمت", "فایل", "ملک", "عکس")):
            return "listing"
        return "other"

    def offer_ticket(self, chat, text, guess=None):
        self.state[chat] = {"flow": "pending_q", "text": text[:2000], "cat": guess or self.guess_cat(clean(text))}
        lead = ("متأسفم که مشکلی پیش آمده. " if guess else
                "پاسخ دقیق این پرسش را ندارم و نمی‌خواهم حدسی جواب بدهم. ")
        self.send(chat, lead + "اگر بخواهید، همین پیام را برای پشتیبانی می‌فرستم؛ پاسخ همین‌جا در تلگرام به دستتان می‌رسد.",
                  kb={"inline_keyboard": [[{"text": "📨 ارسال برای پشتیبانی", "callback_data": "tk_send"}],
                                          [{"text": "❓ پرسش‌های پرتکرار", "callback_data": "help"}]]})

    def ticket_new(self, chat, cat, text=None):
        _, phone = self.user_of(chat)
        if not phone:
            self.send(chat, "برای ثبت تیکت، اول شمارهٔ موبایل خود را تأیید کنید:")
            return self.ask_contact(chat, then="support")
        if text:
            return self.ticket_create(chat, phone, cat, text)
        self.state[chat] = {"flow": "ticket", "cat": cat}
        self.send(chat, "مشکل یا پرسش خود را کامل در یک پیام بنویسید (مثلاً زمان پرداخت، مبلغ، یا شمارهٔ آگهی):", kb=self.cancel_kb())

    def ticket_body(self, chat, text):
        st = self.state.pop(chat, {})
        _, phone = self.user_of(chat)
        if not phone:
            return self.ask_contact(chat, then="support")
        return self.ticket_create(chat, phone, st.get("cat") or "other", text)

    def ticket_create(self, chat, phone, cat, text):
        sup = self.app.support
        recent = self.store.q("SELECT COUNT(*) n FROM tickets WHERE phone=? AND created > ?", (phone, int(time.time()) - 3600), one=True)["n"]
        try:
            r = sup.create(phone, cat, "[از ربات تلگرام] " + text, ip_recent=recent)
        except ValueError as e:
            return self.send(chat, f"ثبت تیکت ممکن نشد: {esc(e)}")
        auto = self.store.q("SELECT body FROM ticket_msgs WHERE ticket_id=? AND sender='auto' ORDER BY id DESC", (r["id"],), one=True)
        self.send(chat, (f"✅ تیکت شمارهٔ {fa(r['id'])} ثبت شد.\n" + (f"{esc(auto['body'])}\n" if auto else "")
                         + "پاسخ پشتیبانی همین‌جا در تلگرام برایتان فرستاده می‌شود."))

    def ticket_list(self, chat):
        _, phone = self.user_of(chat)
        if not phone:
            return self.ask_contact(chat, then="support")
        items = self.app.support.mine(phone)[:5]
        if not items:
            return self.send(chat, "هنوز تیکتی ثبت نکرده‌اید. برای ثبت، «🎧 پشتیبانی» را بزنید.")
        for t in items:
            last = next((m for m in reversed(t["messages"]) if m["sender"] in ("admin", "auto")), None)
            txt = (f"📨 <b>تیکت {fa(t['id'])}</b> · {esc(t['category_name'])}\nوضعیت: {TICKET_STATUS.get(t['status'], esc(t['status_name']))}\n"
                   f"موضوع: {esc(t['subject'])}")
            if last:
                who = "پشتیبانی" if last["sender"] == "admin" else "پاسخ خودکار"
                txt += f"\n\n💬 {who}: {esc(last['body'][:700])}"
            kb = None if t["status"] == "closed" else {"inline_keyboard": [[{"text": "✍️ پاسخ به این تیکت", "callback_data": f"tk_re:{t['id']}"}]]}
            self.send(chat, txt, kb=kb)
            if t.get("user_unread"):
                self.app.support.seen_user(t["id"])

    def ticket_reply(self, chat, text):
        st = self.state.pop(chat, {})
        _, phone = self.user_of(chat)
        tid = st.get("tid")
        if not (phone and tid and self.app.support.owns(tid, phone)):
            return self.send(chat, "این تیکت پیدا نشد.")
        try:
            self.app.support.reply_user(tid, "[از ربات تلگرام] " + text)
        except ValueError as e:
            return self.send(chat, esc(e))
        self.send(chat, f"✅ پیام شما به تیکت {fa(tid)} اضافه شد؛ پاسخ همین‌جا می‌رسد.")

    # ---------------------------------------------------------- help / FAQ
    def help(self, chat):
        self.send(chat, ("❓ <b>راهنما و پرسش‌های پرتکرار</b>\nروی هر پرسش بزنید یا پرسش خود را بنویسید:"),
                  kb={"inline_keyboard": [[{"text": "ربات چه کارهایی انجام می‌دهد؟", "callback_data": "faq:bot"}],
                                          [{"text": "ارزش برآوردی چطور حساب می‌شود؟", "callback_data": "faq:calc"}],
                                          [{"text": "آگهی‌های جعلی چطور حذف می‌شوند؟", "callback_data": "faq:trust"}],
                                          [{"text": "برچسب‌ها (طلایی، مناسب…) یعنی چه؟", "callback_data": "faq:labels"}],
                                          [{"text": "سند قولنامه‌ای و وکالتی", "callback_data": "faq:deed"}],
                                          [{"text": "اشتراک و نحوهٔ خرید", "callback_data": "faq:plans"}],
                                          [{"text": "ورود و کد تأیید", "callback_data": "faq:login"}],
                                          [{"text": "🎧 پشتیبانی و تیکت", "callback_data": "faq:support"}]]})

    @staticmethod
    def faq(t):
        best, score = None, 0
        for key, strong, weak in FAQ:
            s = 2 * sum(1 for w in strong if w in t) + sum(1 for w in weak if w in t)
            if s > score:
                best, score = key, s
        return best if score >= 2 else None

    def answer(self, chat, key):
        b = self.base()
        route = {"plans": self.plans, "radar": self.radar, "alert": self.alert, "support": self.support}
        if key in route:
            return route[key](chat)
        n_cities = self.store.q("SELECT COUNT(DISTINCT city_key) n FROM listings WHERE status='active' AND hidden=0", one=True)["n"] if key == "cities" else 0
        txt = {
            "calc": ("🧮 <b>ارزش برآوردی چطور حساب می‌شود؟</b>\nهر روز آگهی‌های ملک شهر به شهر و محله به محله جمع‌آوری می‌شود. "
                     "برای هر محله، میانهٔ قیمت متری آگهی‌های معتبر همان محله و همان نوع ملک مبنا قرار می‌گیرد؛ سپس مدلی آماری که از آگهی‌های همان شهر یاد گرفته، "
                     "اثر ویژگی‌های هر ملک را اعمال می‌کند: متراژ، سن بنا، طبقه، آسانسور، پارکینگ، انباری، نوع سند و… .\n"
                     "فاصلهٔ قیمت آگهی با این برآورد، برچسب آن را تعیین می‌کند. آگهی‌هایی که دادهٔ مقایسه‌ای کافی ندارند برچسب «فرصت» نمی‌گیرند.\n"
                     "این برآورد آماری است و جای کارشناسی رسمی را نمی‌گیرد."),
            "trust": ("🛡 <b>اعتبارسنجی آگهی‌ها</b>\nپیش از رتبه‌بندی، آگهی‌های تکراری، آگهی‌هایی که عکسشان مال ملک دیگری است، قیمت‌های غیرواقعی و "
                      "تخفیف‌های نامتعارف (نشانهٔ آگهی صوری) شناسایی و کنار گذاشته یا با برچسب «مشکوک» مشخص می‌شوند. آگهی‌هایی که در منبع حذف شوند هم از سایت می‌روند.\n"
                      "با این حال پیش از هر معامله، سند و واقعی بودن آگهی را حضوری و از مراجع رسمی استعلام کنید."),
            "deed": ("📜 <b>نوع سند</b>\nآگهی‌های دارای سند قولنامه‌ای، وکالتی یا بنچاق هیچ‌وقت برچسب «فرصت» نمی‌گیرند، چون ارزان‌تر بودنشان معمولاً به خاطر ریسک سند است. "
                     "پیش از خرید حتماً استعلام ثبتی بگیرید."),
            "labels": ("🏷 <b>برچسب‌ها</b>\n✦ فرصت طلایی: به‌طور معنادار زیر ارزش برآوردی محله، با دادهٔ مقایسه‌ای کافی\n✓ فرصت مناسب: زیر ارزش برآوردی\n"
                       "قیمت منصفانه: نزدیک ارزش برآوردی\nکمی گران / گران: بالاتر از ارزش برآوردی\n"
                       "امتیاز هر آگهی فاصلهٔ قیمت، اعتبار داده و ریسک آگهی را با هم می‌سنجد."),
            "site": f"🌐 سایت فرصت ملک: {b}\nنقشهٔ «قیمت از دید آسمان»، ماشین‌حساب ارزش و همهٔ آگهی‌ها آن‌جاست.",
            "login": (f"🔑 <b>ورود به سایت</b>\nدر {b}/account.html با شمارهٔ موبایل و رمز وارد شوید یا با کد تأیید ثبت‌نام کنید. "
                      "اگر کد نمی‌رسد، «🎧 پشتیبانی» را بزنید و موضوع «پیامک و کد ورود» را انتخاب کنید.\nبرای اتصال همان حساب به ربات، «👤 حساب من» را بزنید."),
            "cities": (f"🗺 آگهی‌های {fa(n_cities)} شهر در حال حاضر بررسی می‌شود. نام شهر و محلهٔ خود را بنویسید؛ "
                       "اگر برای آن‌جا آگهی کافی داشته باشیم، بهترین‌ها را می‌فرستم."),
            "bot": ("🤖 <b>کارهایی که از من برمی‌آید</b>\n• نام شهر و محله را بنویسید تا بهترین آگهی‌ها را به ترتیب امتیاز بفرستم\n"
                    "• «قیمت متری» هر محله را بگویم\n• ارزش منصفانهٔ ملک شما را گام‌به‌گام حساب کنم\n"
                    "• شکارهای طلایی روز و رادار کاهش قیمت (ویژهٔ مشترکان)\n• هشدار فوری فرصت‌های تازهٔ محلهٔ دلخواه\n"
                    "• وضعیت اشتراک و یادآوری تمدید\n• پاسخ به پرسش‌ها و ثبت و پیگیری تیکت پشتیبانی\n"
                    "• پیوند هر آگهی فرصت ملک را بفرستید تا خلاصهٔ ارزیابی‌اش را بفرستم"),
            "hello": "سلام! 🌷 نام شهر و محله را بنویسید تا بهترین آگهی‌های آن‌جا را بفرستم، یا از منوی پایین صفحه انتخاب کنید.",
            "thanks": "خواهش می‌کنم 🌷 هر وقت خواستید نام شهر و محله را بنویسید.",
        }.get(key)
        if txt:
            self.send(chat, txt)

    # ---------------------------------------------------------- callbacks
    def on_callback(self, cq):
        chat = ((cq.get("message") or {}).get("chat") or {}).get("id")
        data = cq.get("data") or ""
        try:
            self.bot.call("answerCallbackQuery", {"callback_query_id": cq["id"]}, timeout=10)
        except Exception:  # noqa: BLE001
            pass
        if not chat or self.limited(chat):
            return
        if data == "link":
            return self.ask_contact(chat)
        if data == "help":
            return self.help(chat)
        if data == "alert_here":
            return self.alert(chat, here=True)
        if data == "here":
            city, dist = self.pref(chat)
            if city in CITY_BY_KEY:
                return self.search(chat, {"city": city, "deal": "sale", **({"district": dist} if dist else {})})
            return self.search_help(chat)
        if data.startswith("faq:"):
            return self.answer(chat, data[4:])
        if data.startswith("al_rm:"):
            _, phone = self.user_of(chat)
            if phone:
                self.app.alerts.remove(phone, data[6:])
                self.send(chat, "هشدار حذف شد.")
            return self.alert(chat)
        if data == "tk_list":
            return self.ticket_list(chat)
        if data.startswith("tk_new:"):
            return self.ticket_new(chat, data[7:])
        if data == "tk_send":
            st = self.state.pop(chat, None) or {}
            if st.get("flow") != "pending_q":
                return self.support(chat)
            if not self.phone_of(chat):
                self.state[chat] = {"flow": "contact", "then": "support"}
                self.send(chat, "برای ثبت تیکت، اول شمارهٔ موبایل خود را تأیید کنید؛ سپس پرسش را دوباره بفرستید.")
                return self.ask_contact(chat, then="support")
            return self.ticket_new(chat, st["cat"], st["text"])
        if data.startswith("tk_re:"):
            self.state[chat] = {"flow": "reply", "tid": int(data[6:] or 0)}
            return self.send(chat, "پاسخ خود را بنویسید:", kb=self.cancel_kb())


def periodic(assistant, stop):
    """تنظیم منوی ربات پس از آماده شدن و یادآوری‌های ساعتی."""
    while not stop.is_set():
        try:
            if assistant.bot.ready():
                if not assistant.ready_once:
                    assistant.setup()
                assistant.tick()
        except Exception:  # noqa: BLE001
            traceback.print_exc()
        stop.wait(3600 if assistant.ready_once else 60)
