"""آزمون حساب کاربری: ثبت‌نام با کد، ورود با نام کاربری/موبایل و رمز، قفل پس از تلاش ناموفق، بازیابی با کد و لینک ایمیلی، ویرایش مشخصات."""
import hashlib
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "server"))
import accounts as A  # noqa: E402
from billing import Billing  # noqa: E402
from mailer import Mailer  # noqa: E402
from store import Store  # noqa: E402


def ok(cond, msg):
    if not cond:
        raise SystemExit("✘ " + msg)
    print("✔ " + msg)


def err(fn, part, msg):
    try:
        fn()
    except ValueError as e:
        ok(part in str(e), f"{msg} ({e})")
        return
    ok(False, msg + " — باید خطا می‌داد")


st = Store(Path(tempfile.mkdtemp()) / "t.db")
bill = Billing(st)
mails = []
mailer = Mailer(st)
mailer.ready = lambda: True
mailer.send_async = lambda to, subj, body: mails.append((to, subj, body))
acc = A.Accounts(st, bill, mailer)
st.set_setting("sms", {**bill.sms_cfg(), "dev_mode": True})
PH = "09121112233"


def code(phone=PH):
    st.x("UPDATE otps SET sent_at=0")
    return bill.send_otp(phone, local=True)["dev_code"]


base = {"phone": PH, "first_name": "علی", "last_name": "رضایی", "email": "Ali@Example.com", "username": "ali.rezaei", "password": "secret123"}
err(lambda: acc.register({**base, "username": "1ab", "code": code()}), "نام کاربری", "نام کاربری نامعتبر رد می‌شود")
err(lambda: acc.register({**base, "password": "12345678", "code": code()}), "ترکیبی", "رمز فقط عددی رد می‌شود")
err(lambda: acc.register({**base, "code": "00000"}), "کد", "کد نادرست رد می‌شود")
r = acc.register({**base, "code": code()})
u = r["user"]
ok(r["token"] and u["username"] == "ali.rezaei" and u["email"] == "ali@example.com" and u["has_password"], "ثبت‌نام کامل انجام شد")
ok(mails and mails[-1][0] == "ali@example.com", "ایمیل خوش‌آمد ارسال شد")
row = st.q("SELECT pw_hash FROM users WHERE phone=?", (PH,), one=True)
ok(row["pw_hash"].startswith("pbkdf2$") and "secret123" not in row["pw_hash"], "رمز به‌صورت هش ذخیره شده است")
err(lambda: acc.register({**base, "code": code()}), "قبلاً", "ثبت‌نام دوباره با همان شماره رد می‌شود")
err(lambda: acc.register({**base, "phone": "09125556677", "code": code("09125556677")}), "گرفته", "نام کاربری تکراری رد می‌شود")

ok(acc.login("ALI.REZAEI", "secret123")["token"], "ورود با نام کاربری (بی‌حساسیت به حروف)")
ok(acc.login("۰۹۱۲۱۱۱۲۲۳۳", "secret123")["token"], "ورود با شمارهٔ موبایل فارسی")
ok(acc.login("ali@example.com", "secret123")["token"], "ورود با ایمیل")
err(lambda: acc.login("ali.rezaei", "wrong"), "نادرست", "رمز نادرست رد می‌شود")
for _ in range(8):
    try:
        acc.login("ali.rezaei", "wrong", "1.1.1.1")
    except ValueError:
        pass
err(lambda: acc.login("ali.rezaei", "secret123", "1.1.1.1"), "۱۵ دقیقه", "پس از تلاش‌های ناموفق زیاد، ورود موقتاً قفل می‌شود")
A._FAILS.clear()

# بازیابی با کد
r = acc.reset_request("ali.rezaei", "sms", local=True)
ok(r["phone"] == "0912***233" and r.get("dev_code"), "درخواست بازیابی؛ شماره کامل افشا نمی‌شود")
old_tok = acc.login("ali.rezaei", "secret123")["token"]
acc.reset_with_code("ali.rezaei", r["dev_code"], "newpass456")
ok(not st.q("SELECT 1 FROM user_sessions WHERE token=?", (old_tok,), one=True), "پس از بازیابی، نشست‌های قبلی بسته می‌شوند")
ok(acc.login("ali.rezaei", "newpass456")["token"], "ورود با رمز تازه")

# بازیابی با ایمیل
r = acc.reset_request("ali@example.com", "email", base_url="https://x")
link = mails[-1][2]
tok = link.split("token=")[1].split('"')[0]
ok(r["via"] == "email" and "#/reset?token=" in link, "لینک بازیابی ایمیل شد")
ok(st.q("SELECT 1 FROM pw_resets WHERE token_hash=?", (hashlib.sha256(tok.encode()).hexdigest(),), one=True), "توکن به‌صورت هش ذخیره شد")
ok(acc.reset_request("nobody@example.com", "email")["ok"], "ایمیل ناشناس هم پاسخ یکسان می‌گیرد (حفظ حریم)")
acc.reset_with_token(tok, "mail789x")
ok(acc.login("ali.rezaei", "mail789x")["token"], "ورود پس از بازیابی ایمیلی")
err(lambda: acc.reset_with_token(tok, "again123"), "منقضی", "لینک بازیابی یک‌بار مصرف است")

# کاربر قدیمی (فقط کد) رمز می‌گذارد
OLD = "09131234567"
bill.verify_otp(OLD, code(OLD))
err(lambda: acc.login(OLD, "x"), "رمز تعیین نشده", "کاربر قدیمی بی‌رمز راهنمایی می‌شود")
acc.update_profile(OLD, {"first_name": "مریم", "last_name": "کاظمی", "username": "maryam_k", "email": "", "new_password": "abc12345"})
ok(acc.login("maryam_k", "abc12345")["token"], "کاربر قدیمی از حساب کاربری رمز گذاشت و وارد شد")
err(lambda: acc.update_profile(OLD, {"new_password": "zzz12345", "password": "bad"}), "رمز فعلی", "تغییر رمز بدون رمز فعلی درست رد می‌شود")
print("همهٔ آزمون‌های حساب کاربری موفق بود.")
