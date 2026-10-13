"""ارسال ایمیل (خوش‌آمد، بازیابی رمز) با SMTP؛ تنظیمات در پنل مدیریت. بدون تنظیم، ایمیلی ارسال نمی‌شود."""
from __future__ import annotations

import html
import smtplib
import ssl
import threading
import time
from email.message import EmailMessage
from email.utils import formataddr

DEFAULT_EMAIL = {"host": "", "port": 465, "user": "", "password": "", "from_addr": "", "from_name": "فرصت ملک", "security": "ssl"}


class Mailer:
    def __init__(self, store):
        self.store = store

    def cfg(self):
        return {**DEFAULT_EMAIL, **(self.store.get_setting("email") or {})}

    def ready(self) -> bool:
        c = self.cfg()
        return bool(c["host"] and c["from_addr"])

    def send(self, to: str, subject: str, body_html: str):
        c = self.cfg()
        msg = EmailMessage()
        msg["Subject"], msg["From"], msg["To"] = subject, formataddr((c["from_name"], c["from_addr"])), to
        msg.set_content("این ایمیل نسخهٔ HTML دارد؛ لطفاً در برنامهٔ ایمیلی که HTML را نشان می‌دهد باز کنید.")
        msg.add_alternative(body_html, subtype="html")
        port = int(c["port"] or 465)
        if c["security"] == "ssl":
            with smtplib.SMTP_SSL(c["host"], port, context=ssl.create_default_context(), timeout=20) as s:
                if c["user"]:
                    s.login(c["user"], c["password"])
                s.send_message(msg)
        else:
            with smtplib.SMTP(c["host"], port, timeout=20) as s:
                if c["security"] == "starttls":
                    s.starttls(context=ssl.create_default_context())
                if c["user"]:
                    s.login(c["user"], c["password"])
                s.send_message(msg)

    def send_async(self, to, subject, body_html):
        if not (to and self.ready()):
            return

        def run():
            try:
                self.send(to, subject, body_html)
                ok, err = True, ""
            except Exception as e:  # noqa: BLE001
                ok, err = False, str(e)[:200]
            self.store.set_setting("email_last", {"at": int(time.time()), "to": to[:3] + "***" + to[to.find("@"):], "ok": ok, "error": err})
        threading.Thread(target=run, daemon=True).start()

    # ---------------------------------------------------------- templates
    @staticmethod
    def _wrap(title, inner):
        return f"""<!doctype html><html lang="fa" dir="rtl"><body style="margin:0;background:#f6f3ee;font-family:Tahoma,Vazirmatn,sans-serif">
<div style="max-width:520px;margin:24px auto;background:#fff;border-radius:18px;padding:28px;border:1px solid #e2ddd3;direction:rtl;text-align:right;color:#151614;line-height:2">
<p style="font-size:20px;font-weight:bold;margin:0 0 6px">فرصت ملک</p><p style="color:#77746c;margin:0 0 18px;font-size:13px">ارزش واقعی ملک، محله به محله</p>
<h2 style="font-size:17px;margin:0 0 10px">{html.escape(title)}</h2>{inner}
<p style="color:#77746c;font-size:12px;margin-top:22px;border-top:1px dashed #e2ddd3;padding-top:12px">forsatmelk.ir · این ایمیل به‌طور خودکار ارسال شده است.</p></div></body></html>"""

    def welcome(self, first, username, trial_days):
        return self._wrap(f"{first} عزیز، خوش آمدید", f"""<p>حساب شما در فرصت ملک ساخته شد.</p>
<p>نام کاربری: <b dir="ltr">{html.escape(username or "")}</b></p>
{f'<p>همهٔ امکانات سایت تا {trial_days} روز برایتان رایگان باز است.</p>' if trial_days else ''}
<p><a href="https://forsatmelk.ir/#/s?sort=score&opp=1" style="display:inline-block;background:#151614;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none">دیدن فرصت‌های بازار</a></p>""")

    def reset(self, first, link):
        return self._wrap("بازیابی رمز عبور", f"""<p>{html.escape(first or "کاربر")} عزیز، برای تعیین رمز تازه روی دکمهٔ زیر بزنید. این پیوند تا ۳۰ دقیقه و فقط یک بار معتبر است.</p>
<p><a href="{html.escape(link)}" style="display:inline-block;background:#e0531f;color:#fff;padding:10px 18px;border-radius:12px;text-decoration:none">تعیین رمز تازه</a></p>
<p style="color:#77746c;font-size:12px">اگر شما درخواست نداده‌اید، این ایمیل را نادیده بگیرید؛ رمز فعلی‌تان تغییری نمی‌کند.</p>""")
