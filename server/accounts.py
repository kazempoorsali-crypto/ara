"""حساب کاربری کامل: ثبت‌نام با نام، موبایل (تأیید با کد)، ایمیل اختیاری، نام کاربری و رمز؛
ورود با نام کاربری/موبایل/ایمیل و رمز؛ بازیابی رمز با کد (پیامک یا بله) یا لینک ایمیلی.

رمزها با PBKDF2-SHA256 و نمک تصادفی ذخیره می‌شوند؛ هیچ رمزی به‌صورت خام نگه داشته یا ارسال نمی‌شود.
"""
from __future__ import annotations

import hashlib
import re
import secrets
import threading
import time

USER_COLS = {"first_name": "TEXT", "last_name": "TEXT", "email": "TEXT", "username": "TEXT", "pw_hash": "TEXT", "email_verified": "INTEGER DEFAULT 0"}
RESET_SQL = "CREATE TABLE IF NOT EXISTS pw_resets (token_hash TEXT PRIMARY KEY, phone TEXT, expires INTEGER)"
USERNAME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_.]{3,29}$")
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[a-zA-Z]{2,}$")
ITER = 200_000
_FAILS: dict = {}
_LOCK = threading.Lock()


def ensure_schema(store):
    with store.lock:
        have = {r[1] for r in store.db.execute("PRAGMA table_info(users)")}
        for c, t in USER_COLS.items():
            if c not in have:
                store.db.execute(f"ALTER TABLE users ADD COLUMN {c} {t}")
        store.db.execute(RESET_SQL)
        store.db.execute("CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username ON users(username COLLATE NOCASE) WHERE username IS NOT NULL")
        store.db.commit()


def hash_pw(pw: str) -> str:
    salt = secrets.token_hex(16)
    return f"pbkdf2${ITER}${salt}${hashlib.pbkdf2_hmac('sha256', pw.encode(), bytes.fromhex(salt), ITER).hex()}"


def check_pw(pw: str, stored: str | None) -> bool:
    try:
        _, it, salt, h = (stored or "").split("$")
        return secrets.compare_digest(h, hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), int(it)).hex())
    except ValueError:
        return False


def _digits(s):
    return (s or "").translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")).strip()


def _name(v, label):
    v = re.sub(r"\s+", " ", (v or "").strip())[:40]
    if len(v) < 2:
        raise ValueError(f"{label} را وارد کنید")
    return v


def validate_password(pw):
    pw = pw or ""
    if len(pw) < 8:
        raise ValueError("رمز عبور دست‌کم ۸ نویسه باشد")
    if pw.isdigit() or pw.isalpha():
        raise ValueError("رمز عبور ترکیبی از حرف و عدد باشد")
    return pw


class Accounts:
    def __init__(self, store, billing, mailer):
        self.store, self.billing, self.mailer = store, billing, mailer

    # ---------------------------------------------------------- helpers
    def _find(self, ident: str):
        from billing import norm_phone
        ident = _digits(ident)
        if not ident:
            return None
        ph = norm_phone(ident)
        if ph:
            return self.store.q("SELECT * FROM users WHERE phone=?", (ph,), one=True)
        if "@" in ident:
            return self.store.q("SELECT * FROM users WHERE lower(email)=lower(?)", (ident,), one=True)
        return self.store.q("SELECT * FROM users WHERE username=? COLLATE NOCASE", (ident,), one=True)

    def _clean_profile(self, data, phone=None):
        first, last = _name(data.get("first_name"), "نام"), _name(data.get("last_name"), "نام خانوادگی")
        email = (data.get("email") or "").strip().lower()[:200]
        if email and not EMAIL_RE.match(email):
            raise ValueError("ایمیل معتبر نیست")
        username = (data.get("username") or "").strip()
        if not USERNAME_RE.match(username):
            raise ValueError("نام کاربری ۴ تا ۳۰ نویسهٔ انگلیسی باشد و با حرف شروع شود (حرف، عدد، نقطه و _)")
        other = self.store.q("SELECT phone FROM users WHERE username=? COLLATE NOCASE", (username,), one=True)
        if other and other["phone"] != phone:
            raise ValueError("این نام کاربری قبلاً گرفته شده است")
        if email:
            other = self.store.q("SELECT phone FROM users WHERE lower(email)=?", (email,), one=True)
            if other and other["phone"] != phone:
                raise ValueError("این ایمیل با حساب دیگری ثبت شده است")
        return first, last, email or None, username

    def _throttle(self, key):
        now = time.time()
        with _LOCK:
            fails = [t for t in _FAILS.get(key, []) if now - t < 900]
            _FAILS[key] = fails
            if len(fails) >= 8:
                raise ValueError("تلاش‌های ناموفق زیاد بود؛ ۱۵ دقیقه دیگر دوباره امتحان کنید یا «فراموشی رمز» را بزنید")

    def _fail(self, key):
        with _LOCK:
            _FAILS.setdefault(key, []).append(time.time())

    # ---------------------------------------------------------- register / login
    def register(self, data: dict) -> dict:
        """ثبت‌نام: کد تأیید موبایل (پیامک یا بله) + نام، نام خانوادگی، ایمیل اختیاری، نام کاربری و رمز."""
        from billing import norm_phone
        phone = norm_phone(data.get("phone"))
        if not phone:
            raise ValueError("شمارهٔ موبایل معتبر نیست")
        ex = self.store.q("SELECT * FROM users WHERE phone=?", (phone,), one=True)
        if ex and ex["pw_hash"]:
            raise ValueError("با این شماره قبلاً ثبت‌نام شده است؛ وارد شوید یا «فراموشی رمز» را بزنید")
        first, last, email, username = self._clean_profile(data, phone)
        pw = validate_password(data.get("password"))
        self.billing.check_otp(phone, data.get("code"))
        res = self.billing.start_session(phone)
        self.store.x("UPDATE users SET first_name=?, last_name=?, email=?, username=?, pw_hash=? WHERE phone=?",
                     (first, last, email, username, hash_pw(pw), phone))
        res["user"] = self.billing.user(phone)
        if email:
            self.mailer.send_async(email, "به فرصت ملک خوش آمدید", self.mailer.welcome(first, username, res.get("trial_days") or 0))
        self.billing.notify_user(phone, f"👋 {first} عزیز، حساب شما در فرصت ملک ساخته شد.\nنام کاربری: {username}\nhttps://forsatmelk.ir")
        return res

    def login(self, ident: str, password: str, ip: str = "") -> dict:
        key = "login:" + (_digits(ident).lower() or "?")
        self._throttle(key)
        self._throttle("ip:" + ip)
        u = self._find(ident)
        if not u or not u["pw_hash"] or not check_pw(password or "", u["pw_hash"]):
            self._fail(key)
            self._fail("ip:" + ip)
            if u and not u["pw_hash"]:
                raise ValueError("برای این حساب هنوز رمز تعیین نشده؛ با «ورود با کد یک‌بار مصرف» وارد شوید و از حساب کاربری رمز بگذارید")
            raise ValueError("نام کاربری یا رمز عبور نادرست است")
        return self.billing.start_session(u["phone"])

    # ---------------------------------------------------------- reset
    def reset_request(self, ident: str, channel: str = "sms", base_url: str = "", local=False) -> dict:
        """بازیابی رمز: ایمیل ← لینک یک‌بارمصرف ۳۰ دقیقه‌ای؛ موبایل یا نام کاربری ← کد با پیامک یا بله."""
        u = self._find(ident)
        generic = {"ok": True}
        if "@" in (ident or "") or (channel == "email"):
            if u and u["email"] and self.mailer.ready():
                tok = secrets.token_urlsafe(24)
                self.store.x("INSERT INTO pw_resets VALUES(?,?,?)", (hashlib.sha256(tok.encode()).hexdigest(), u["phone"], int(time.time()) + 1800))
                self.mailer.send_async(u["email"], "بازیابی رمز فرصت ملک", self.mailer.reset(u["first_name"] or "", f"{base_url}/#/reset?token={tok}"))
            elif not self.mailer.ready():
                raise ValueError("ارسال ایمیل هنوز فعال نیست؛ با شمارهٔ موبایل بازیابی کنید")
            return {**generic, "via": "email"}   # برای حفظ حریم خصوصی، وجود یا نبود حساب گفته نمی‌شود
        if not u:
            raise ValueError("حسابی با این مشخصات پیدا نشد")
        r = self.billing.send_otp(u["phone"], local=local, channel=channel)
        return {**generic, "via": channel, "phone": u["phone"][:4] + "***" + u["phone"][-3:],
                **{k: r[k] for k in ("dev_code", "link", "sent") if k in r}}

    def reset_with_code(self, ident: str, code: str, password: str) -> dict:
        u = self._find(ident)
        if not u:
            raise ValueError("حسابی با این مشخصات پیدا نشد")
        validate_password(password)
        self.billing.check_otp(u["phone"], code)
        self.store.x("UPDATE users SET pw_hash=? WHERE phone=?", (hash_pw(password), u["phone"]))
        self.store.x("DELETE FROM user_sessions WHERE phone=?", (u["phone"],))   # همهٔ نشست‌های قبلی بسته شوند
        return self.billing.start_session(u["phone"])

    def reset_with_token(self, token: str, password: str) -> dict:
        validate_password(password)
        h = hashlib.sha256((token or "").encode()).hexdigest()
        r = self.store.q("SELECT * FROM pw_resets WHERE token_hash=? AND expires>?", (h, int(time.time())), one=True)
        if not r:
            raise ValueError("لینک بازیابی نامعتبر یا منقضی است؛ دوباره درخواست دهید")
        self.store.x("DELETE FROM pw_resets WHERE token_hash=?", (h,))
        self.store.x("UPDATE users SET pw_hash=?, email_verified=1 WHERE phone=?", (hash_pw(password), r["phone"]))
        self.store.x("DELETE FROM user_sessions WHERE phone=?", (r["phone"],))
        return self.billing.start_session(r["phone"])

    # ---------------------------------------------------------- profile
    def update_profile(self, phone, data: dict) -> dict:
        u = self.store.q("SELECT * FROM users WHERE phone=?", (phone,), one=True)
        first, last, email, username = self._clean_profile({**dict(u), **{k: v for k, v in data.items() if v is not None}}, phone)
        new_hash = None
        if data.get("new_password"):
            if u["pw_hash"] and not check_pw(data.get("password") or "", u["pw_hash"]):
                raise ValueError("رمز فعلی نادرست است")
            new_hash = hash_pw(validate_password(data["new_password"]))
        self.store.x("UPDATE users SET first_name=?, last_name=?, email=?, username=? WHERE phone=?", (first, last, email, username, phone))
        if new_hash:
            self.store.x("UPDATE users SET pw_hash=? WHERE phone=?", (new_hash, phone))
        if email and email != (u["email"] or ""):
            self.mailer.send_async(email, "ایمیل شما در فرصت ملک ثبت شد", self.mailer.welcome(first, username, 0))
        return {"ok": True, "user": self.billing.user(phone)}
