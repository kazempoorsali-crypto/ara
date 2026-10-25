"""آمار بازدید سایت برای پنل مدیریت (بدون سرویس بیرونی و بدون ذخیرهٔ IP).

- بازدید واقعی از خود مرورگر (پس از نمایش صفحه) با یک درخواست کوچک ثبت می‌شود، تا پیش‌بارگذاری صفحه‌ها آمار را زیاد نکند.
- مدت ماندن: هنگام ترک صفحه، مدت نمایش همان صفحه فرستاده می‌شود.
- بازدیدکنندهٔ یکتا: درهم‌سازی (hash) نشانی و مرورگر با نمک روزانه؛ خود IP هیچ‌جا ذخیره نمی‌شود.
- خزنده‌ها (گوگل، بینگ و دستیارهای هوش مصنوعی) جدا شمرده می‌شوند، از روی درخواست صفحه در سرور.
"""
from __future__ import annotations

import hashlib
import re
import secrets
import time
import urllib.parse

SQL = """
CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, day TEXT, vid TEXT, sid TEXT, path TEXT,
  src TEXT, ref TEXT, device TEXT, browser TEXT, os TEXT, user INTEGER DEFAULT 0, dur INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_visits_day ON visits(day);
CREATE TABLE IF NOT EXISTS bot_hits (day TEXT, bot TEXT, kind TEXT, n INTEGER DEFAULT 0, PRIMARY KEY (day, bot));
"""

# منبع ورود از روی دامنهٔ ارجاع‌دهنده
SOURCES = [
    (r"(^|\.)google\.", "گوگل", "search"), (r"(^|\.)bing\.com$", "بینگ", "search"), (r"(^|\.)yandex\.", "یاندکس", "search"),
    (r"duckduckgo\.com$", "داک‌داک‌گو", "search"), (r"(^|\.)yahoo\.", "یاهو", "search"),
    (r"chatgpt\.com$|chat\.openai\.com$|openai\.com$", "ChatGPT", "ai"), (r"perplexity\.ai$", "Perplexity", "ai"),
    (r"gemini\.google\.com$|bard\.google\.com$", "Gemini", "ai"), (r"claude\.ai$", "Claude", "ai"), (r"copilot\.microsoft\.com$", "Copilot", "ai"),
    (r"deepseek\.com$", "DeepSeek", "ai"), (r"grok\.com$|x\.ai$", "Grok", "ai"), (r"you\.com$|phind\.com$|meta\.ai$", "سایر هوش مصنوعی", "ai"),
    (r"(^|\.)t\.me$|telegram\.", "تلگرام", "social"), (r"ble\.ir$|bale\.ai$", "بله", "social"), (r"eitaa\.", "ایتا", "social"),
    (r"rubika\.ir$", "روبیکا", "social"), (r"instagram\.com$", "اینستاگرام", "social"), (r"whatsapp\.|wa\.me$", "واتساپ", "social"),
    (r"(^|\.)x\.com$|twitter\.com$|(^|\.)t\.co$", "ایکس (توییتر)", "social"), (r"linkedin\.", "لینکدین", "social"), (r"facebook\.|(^|\.)fb\.", "فیسبوک", "social"),
    (r"divar\.ir$", "دیوار", "ref"), (r"sheypoor\.com$", "شیپور", "ref"),
]
# Gemini پیش از گوگل سنجیده شود (زیردامنهٔ google است)
SOURCES.sort(key=lambda s: 0 if "gemini" in s[0] else 1)
BOTS = [
    ("Googlebot", "گوگل", "search"), ("bingbot", "بینگ", "search"), ("YandexBot", "یاندکس", "search"), ("DuckDuckBot", "داک‌داک‌گو", "search"),
    ("Applebot", "اپل", "search"), ("GPTBot", "OpenAI (GPTBot)", "ai"), ("OAI-SearchBot", "ChatGPT Search", "ai"), ("ChatGPT-User", "ChatGPT", "ai"),
    ("ClaudeBot", "Claude", "ai"), ("Claude-User", "Claude", "ai"), ("Claude-SearchBot", "Claude", "ai"), ("anthropic-ai", "Claude", "ai"),
    ("PerplexityBot", "Perplexity", "ai"), ("Perplexity-User", "Perplexity", "ai"), ("Google-Extended", "Gemini", "ai"), ("GoogleOther", "گوگل (سایر)", "ai"),
    ("DeepSeekBot", "DeepSeek", "ai"), ("GrokBot", "Grok", "ai"), ("xAI-Bot", "Grok", "ai"), ("MistralAI-User", "Mistral", "ai"), ("cohere-ai", "Cohere", "ai"),
    ("CCBot", "Common Crawl", "ai"), ("Amazonbot", "آمازون", "ai"), ("meta-externalagent", "Meta AI", "ai"), ("Bytespider", "ByteDance", "ai"),
    ("AhrefsBot", "Ahrefs", "seo"), ("SemrushBot", "Semrush", "seo"), ("MJ12bot", "Majestic", "seo"), ("DotBot", "Moz", "seo"),
]


def parse_ua(ua: str):
    u = ua or ""
    if re.search(r"iPad|Tablet", u) or (re.search(r"Android", u) and not re.search(r"Mobile", u)):
        device = "تبلت"
    elif re.search(r"Mobi|iPhone|Android", u):
        device = "موبایل"
    else:
        device = "دسکتاپ"
    browser = ("Edge" if "Edg/" in u else "Opera" if re.search(r"OPR/|Opera", u) else "Samsung" if "SamsungBrowser" in u else
               "Firefox" if re.search(r"Firefox|FxiOS", u) else "Chrome" if re.search(r"Chrome|CriOS", u) else "Safari" if "Safari" in u else "سایر")
    os_ = ("Android" if "Android" in u else "iOS" if re.search(r"iPhone|iPad|iPod", u) else "Windows" if "Windows" in u else
           "macOS" if "Mac OS X" in u else "Linux" if "Linux" in u else "سایر")
    return device, browser, os_


def bot_of(ua: str):
    low = (ua or "").lower()
    for key, name, kind in BOTS:
        if key.lower() in low:
            return name, kind
    return None


def source_of(ref: str, own_host: str, utm: str = ""):
    if utm:
        u = utm.lower()
        for pat, name, _ in SOURCES:
            if re.search(pat.replace("$", "").replace("(^|\\.)", "").rstrip("\\."), u):
                return name
        return utm[:40]
    if not ref:
        return "مستقیم"
    host = (urllib.parse.urlsplit(ref).hostname or "").lower()
    host = host[4:] if host.startswith("www.") else host
    if not host:
        return "مستقیم"
    own = (own_host or "").lower().split(":")[0]
    own = own[4:] if own.startswith("www.") else own
    if own and (host == own or host.endswith("." + own)):
        return "داخلی"
    for pat, name, _ in SOURCES:
        if re.search(pat, host):
            return name
    return host[:60]


KIND_OF_SOURCE = {name: kind for _, name, kind in SOURCES}


class Analytics:
    def __init__(self, store):
        self.store = store
        with store.lock:
            store.db.executescript(SQL)
            store.db.commit()
        self._salt = (time.strftime("%Y-%m-%d"), secrets.token_hex(8))

    def _vid(self, ip, ua):
        day = time.strftime("%Y-%m-%d")
        if self._salt[0] != day:   # نمک روزانه: بازدیدکننده فقط در همان روز یکتا شمرده می‌شود و قابل ردیابی نیست
            self._salt = (day, secrets.token_hex(8))
        return hashlib.sha256(f"{self._salt[1]}|{ip}|{ua}".encode()).hexdigest()[:16]

    def hit(self, data: dict, ip: str, ua: str, host: str, user: bool) -> dict:
        """بازدید صفحه (e=view) یا پایان آن با مدت (e=end)."""
        if bot_of(ua):
            return {"ok": True}
        ev = str(data.get("e") or "view")
        if ev == "end":
            try:
                vid_id, dur = int(data.get("id") or 0), max(0, min(3600, int(float(data.get("d") or 0))))
            except (TypeError, ValueError):
                return {"ok": True}
            if vid_id and dur:
                self.store.x("UPDATE visits SET dur=MAX(dur, ?) WHERE id=? AND vid=?", (dur, vid_id, self._vid(ip, ua)))
            return {"ok": True}
        path = str(data.get("p") or "/")[:200]
        ref = str(data.get("r") or "")[:300]
        src = source_of(ref, host, str(data.get("u") or "")[:60])
        device, browser, os_ = parse_ua(ua)
        rid = self.store.x("INSERT INTO visits(at,day,vid,sid,path,src,ref,device,browser,os,user) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                           (int(time.time()), time.strftime("%Y-%m-%d"), self._vid(ip, ua), str(data.get("s") or "")[:24], path, src,
                            (urllib.parse.urlsplit(ref).hostname or "")[:80], device, browser, os_, 1 if user else 0)).lastrowid
        return {"ok": True, "id": rid}

    def bot_hit(self, ua: str):
        b = bot_of(ua)
        if b:
            self.store.x("INSERT INTO bot_hits(day,bot,kind,n) VALUES(?,?,?,1) ON CONFLICT(day,bot) DO UPDATE SET n=n+1",
                         (time.strftime("%Y-%m-%d"), b[0], b[1]))

    def report(self, days: int = 30) -> dict:
        days = max(1, min(365, int(days or 30)))
        since = time.strftime("%Y-%m-%d", time.localtime(time.time() - (days - 1) * 86400))
        q = self.store.q
        W = "day>=?"
        tot = dict(q(f"SELECT COUNT(*) views, COUNT(DISTINCT vid||day) visitors, COUNT(DISTINCT NULLIF(sid,'')) sessions, COALESCE(SUM(user),0) users FROM visits WHERE {W}", (since,), one=True))
        per = [dict(r) for r in q(f"SELECT sid, SUM(dur) d, COUNT(*) n FROM visits WHERE {W} AND sid<>'' GROUP BY sid", (since,))]
        dl = sorted(r["d"] for r in per if r["d"])
        tot["avg_session"] = round(sum(dl) / len(dl)) if dl else 0
        tot["median_session"] = dl[len(dl) // 2] if dl else 0
        tot["pages_per_session"] = round(sum(r["n"] for r in per) / len(per), 1) if per else 0
        tot["bounce"] = round(100 * sum(1 for r in per if r["n"] == 1) / len(per)) if per else 0
        tot["online"] = q("SELECT COUNT(DISTINCT vid) n FROM visits WHERE at>?", (int(time.time()) - 300,), one=True)["n"]
        tot["today"] = q("SELECT COUNT(*) v, COUNT(DISTINCT vid) u FROM visits WHERE day=?", (time.strftime("%Y-%m-%d"),), one=True)["u"]

        def grp(col, lim=12):
            return [dict(r) for r in q(f"SELECT {col} k, COUNT(*) n, COUNT(DISTINCT vid||day) u FROM visits WHERE {W} GROUP BY {col} ORDER BY u DESC, n DESC LIMIT {lim}", (since,))]
        series = [dict(r) for r in q(f"SELECT day, COUNT(*) views, COUNT(DISTINCT vid) visitors FROM visits WHERE {W} GROUP BY day ORDER BY day", (since,))]
        # منبع ورود فقط برای اولین صفحهٔ هر نشست (صفحه‌های بعدی «داخلی»اند)
        sources = [dict(r) for r in q(f"SELECT src k, COUNT(*) n, COUNT(DISTINCT vid||day) u FROM visits WHERE {W} AND src<>'داخلی' GROUP BY src ORDER BY u DESC LIMIT 20", (since,))]
        kinds = {}
        for s in sources:
            s["kind"] = "direct" if s["k"] == "مستقیم" else KIND_OF_SOURCE.get(s["k"], "ref")
            kinds[s["kind"]] = kinds.get(s["kind"], 0) + s["u"]
        bots = [dict(r) for r in q("SELECT bot k, kind, SUM(n) n FROM bot_hits WHERE day>=? GROUP BY bot ORDER BY n DESC LIMIT 20", (since,))]
        return {"days": days, "since": since, "totals": tot, "series": series, "devices": grp("device"), "browsers": grp("browser"),
                "os": grp("os"), "sources": sources, "source_kinds": kinds, "pages": grp("path", 15), "bots": bots}

    def prune(self, keep_days=400):
        cut = time.strftime("%Y-%m-%d", time.localtime(time.time() - keep_days * 86400))
        self.store.x("DELETE FROM visits WHERE day<?", (cut,))
        self.store.x("DELETE FROM bot_hits WHERE day<?", (cut,))
