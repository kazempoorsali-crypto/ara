"""آزمون یکپارچه: سرور آرا + شبیه‌ساز دیوار (MCP و مستقیم). اجرا: python tests/test_backend.py"""
import json, os, subprocess, sys, tempfile, time, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
import catalog  # noqa

def check(cond, msg):
    print(("✔ " if cond else "✘ ") + msg)
    if not cond:
        raise SystemExit(1)

# ---- واحد
check(catalog.parse_money_text("۱۲٬۵۰۰٬۰۰۰٬۰۰۰ تومان")["price"] == 12_500_000_000, "قیمت فروش")
m = catalog.parse_money_text("ودیعه: ۲۰۰ میلیون تومان\nاجاره: ۸ میلیون تومان")
check(m["deposit"] == 200_000_000 and m["rent"] == 8_000_000, "ودیعه و اجاره")
check(catalog.parse_money_text("توافقی")["negotiable"], "توافقی")
check(catalog.classify_estate("فروش خانه و ویلا", "") == ("villa", "sale"), "دسته ویلا")
check(catalog.classify_estate("اجارهٔ مسکونی آپارتمان", "")[1] == "rent", "دسته اجاره")
check(catalog.classify_estate("اجاره کوتاه مدت ویلا", "")[1] == "daily", "اجاره روزانه")
check(catalog.find_city("بابلسر")["key"] == "babolsar" and catalog.find_city("بابل")["key"] == "babol", "تطابق شهر")
check("parking" not in catalog.detect_amenities("پارکینگ: ندارد"), "نبود امکان")
it = {}; catalog.enrich_from_attributes(it, {"متراژ": "۱۲۰", "ساخت": "۹۸", "اتاق": "۲"})
check(it == {"area": 120, "year": 1398, "rooms": 2}, "ویژگی‌ها")

def run(mode):
    data = tempfile.mkdtemp()
    env = {**os.environ, "ARA_DIVAR_API": "http://127.0.0.1:8799"}
    srv = subprocess.Popen([sys.executable, "server/app.py", "--port", "8788", "--data", data, "--no-browser"], cwd=ROOT, env=env)
    time.sleep(1.5)
    B = "http://127.0.0.1:8788"
    def call(path, body=None, tok=None):
        req = urllib.request.Request(B + path, data=json.dumps(body).encode() if body is not None else None, method="POST" if body is not None else "GET")
        req.add_header("content-type", "application/json")
        if tok: req.add_header("x-admin-token", tok)
        try:
            with urllib.request.urlopen(req) as r: return json.loads(r.read())
        except urllib.error.HTTPError as e: return {"status": e.code, **json.loads(e.read())}
    try:
        check(call("/api/admin/state").get("status") == 401, f"[{mode}] پنل بدون ورود بسته است")
        tok = call("/api/admin/setup", {"password": "secret123"})["token"]
        check(call("/api/admin/login", {"password": "bad"}).get("status") == 403, f"[{mode}] رمز نادرست رد شد")
        call("/api/admin/settings", {"site": {"phone": "09120000000", "name": "آرای من"}, "payment": {"card": "6037991234567890"}}, tok)
        cfg = call("/api/config")
        check(cfg["site"]["phone"] == "09120000000" and cfg["payment"]["card"].startswith("6037"), f"[{mode}] تنظیمات ذخیره شد")
        r = call("/api/admin/ingest", {"enabled": True, "mode": mode, "mcp_url": "http://127.0.0.1:8799/mcp", "hourly_limit": 1200,
                                         "cities": ["rasht", "sari"], "categories": ["real-estate", "light"], "detail_ratio": 1}, tok)
        check(r["ok"], f"[{mode}] پیکربندی دریافت")
        t = call("/api/admin/test", {}, tok)
        check(t["ok"] and t["count"] > 0, f"[{mode}] آزمون اتصال: {t.get('count')} آگهی")
        time.sleep(22)
        st = call("/api/admin/state", tok=tok)
        check(st["hour"] <= 9, f"[{mode}] سقف ساعتی رعایت شد ({st['hour']} درخواست در ~۲۲ ثانیه با فاصله ۳ ثانیه)")
        s = call("/api/stats")
        if not s["total"]: print("   DEBUG", st["status"], [x["note"] for x in st["log"][:6]])
        check(s["total"] > 0, f"[{mode}] آگهی‌ها ذخیره شدند: {s['total']} (املاک {s['estate']}، خودرو {s['car']})")
        check(s["detailed"] >= 1, f"[{mode}] جزئیات دریافت شد: {s['detailed']}")
        L = call("/api/listings?vertical=estate&deal=rent")
        check(all(x["deal"] == "rent" for x in L["items"]), f"[{mode}] فیلتر اجاره ({L['total']})")
        L = call("/api/listings?vertical=car&sort=cheap")
        pp = [x["pp"] for x in L["items"] if x["pp"]]
        check(pp == sorted(pp), f"[{mode}] مرتب‌سازی خودرو")
        one = [x for x in call("/api/listings?vertical=estate")["items"]][0]
        d = call("/api/listing/" + one["id"])
        check("history" in d and "similar" in d, f"[{mode}] صفحه آگهی")
        check(call("/api/leads", {"name": "علی", "phone": "۰۹۱۲۱۲۳۴۵۶۷", "message": "بازدید"})["ok"], f"[{mode}] ثبت درخواست مشتری")
        check(call("/api/leads", {"phone": "123"}).get("status") == 400, f"[{mode}] شماره نامعتبر رد شد")
        print("   آخرین رویدادها:", [x["note"][:60] for x in st["log"][:4]])
    finally:
        srv.terminate()

mock = subprocess.Popen([sys.executable, "tests/mock_divar.py", "8799"], cwd=ROOT)
time.sleep(0.8)
try:
    run("mcp")
    run("direct")
finally:
    mock.terminate()
print("همه آزمون‌ها موفق بود.")
