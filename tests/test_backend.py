"""آزمون یکپارچه: سرور فرصت‌یاب + شبیه‌ساز دیوار (MCP و مستقیم). اجرا: python tests/test_backend.py"""
import json, os, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request
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
check(not any(c["vertical"] == "car" for c in catalog.CATEGORIES), "فقط دسته‌های املاک")
check(catalog.classify_estate("فروش خانه و ویلا", "") == ("villa", "sale"), "دسته ویلا")
check(catalog.classify_estate("اجارهٔ مسکونی آپارتمان", "")[1] == "rent", "دسته اجاره")
check(catalog.classify_estate("اجاره کوتاه مدت ویلا", "")[1] == "daily", "اجاره روزانه")
check(catalog.find_city("بابلسر")["key"] == "babolsar" and catalog.find_city("بابل")["key"] == "babol", "تطابق شهر")
check(catalog.find_city("مشهد")["province"] == "khorasan_razavi" and catalog.find_city("نور")["key"] == "nur", "تطابق شهرهای استان‌های دیگر")
# گسترش تدریجی: وقتی فهرست‌های شمال کامل شد، تهران فعال می‌شود
os.environ["ARA_INGEST_DEFAULT"] = "0"
from store import Store  # noqa
from ingest import Ingestor  # noqa
from pathlib import Path  # noqa
_st = Store(Path(tempfile.mkdtemp()) / "t.db")
_ig = Ingestor(_st)
_cfg = _ig.cfg()
check(all(catalog.CITY_BY_KEY[c]["province"] in catalog.NORTH for c in _cfg["cities"]), "پیش‌فرض دریافت فقط شهرهای شمال")
_ig.ensure_feeds(_cfg)
_ig.maybe_expand(_cfg)
check("tehran" not in _ig.expansion()["active"], "پیش از کامل شدن شمال، استان تازه فعال نمی‌شود")
_st.x("UPDATE feeds SET pages_done=40, has_next=1")
_ig._exp_checked = 0
_ig.maybe_expand(_ig.cfg())
check("tehran" in _ig.expansion()["active"] and "mashhad" not in _ig.cfg()["cities"] and "tehran" in _ig.cfg()["cities"], "شمال کامل شد: تهران فعال و شهرهایش به دریافت اضافه شد")
check("parking" not in catalog.detect_amenities("پارکینگ: ندارد"), "نبود امکان")
it = {}; catalog.enrich_from_attributes(it, {"متراژ": "۱۲۰", "ساخت": "۹۸", "اتاق": "۲"})
check(it == {"area": 120, "year": 1398, "rooms": 2}, "ویژگی‌ها")

def run(mode):
    data = tempfile.mkdtemp()
    env = {**os.environ, "ARA_DIVAR_API": "http://127.0.0.1:8799", "ARA_SHEYPOOR_API": "http://127.0.0.1:8799/api/v10.0.0",
           "ARA_PAYAMAK_URL": "http://127.0.0.1:8799/api/SendSMS/BaseServiceNumber", "ARA_INGEST_DEFAULT": "0"}
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
        call("/api/admin/settings", {"site": {"name": "فرصت‌یاب"}, "billing": {"weekly_price": 200000, "monthly_price": 600000, "test_mode": True, "free_preview": 0}}, tok)
        cfg = call("/api/config")
        check(cfg["site"]["name"] == "فرصت‌یاب" and len(cfg["plans"]) == 2 and cfg["payable"], f"[{mode}] تنظیمات و طرح‌های اشتراک")
        r = call("/api/admin/ingest", {"enabled": True, "mode": "mcp_only" if mode == "mcp" else mode, "mcp_url": "http://127.0.0.1:8799/mcp", "hourly_limit": 1200,
                                         "cities": ["rasht", "sari"], "categories": ["real-estate"], "detail_ratio": 1}, tok)
        check(r["ok"], f"[{mode}] پیکربندی دریافت")
        t = call("/api/admin/test", {}, tok)
        check(t["ok"] and t["count"] > 0, f"[{mode}] آزمون اتصال: {t.get('count')} آگهی")
        time.sleep(22)
        st = call("/api/admin/state", tok=tok)
        check(st["hour"] <= 9, f"[{mode}] سقف ساعتی رعایت شد ({st['hour']} درخواست در ~۲۲ ثانیه با فاصله ۳ ثانیه)")
        s = call("/api/stats")
        check(s["total"] > 0, f"[{mode}] آگهی‌ها ذخیره شدند: {s['total']}")
        check(s["detailed"] >= 1, f"[{mode}] جزئیات دریافت شد: {s['detailed']}")
        v = call("/api/admin/revalue", {}, tok)
        check("ranked" in v, f"[{mode}] ارزش‌گذاری اجرا شد: {v.get('ranked')} رتبه‌دار، {v.get('excluded')} کنارگذاشته")
        imgs = call("/api/admin/state", tok=tok)["images"]
        check((imgs["w"] or 0) >= 1, f"[{mode}] عکس آگهی از جزئیات دریافت شد ({imgs['w']} از {imgs['n']})")
        try:
            urllib.request.urlopen(B + "/img?u=" + urllib.parse.quote("https://evil.example.com/a.jpg"))
            check(False, f"[{mode}] پراکسی عکس میزبان ناشناس را رد می‌کند")
        except urllib.error.HTTPError as e:
            check(e.code == 404, f"[{mode}] پراکسی عکس میزبان ناشناس را رد می‌کند")
        L = call("/api/listings?deal=rent")
        check(all(x["deal"] == "rent" for x in L["items"]), f"[{mode}] فیلتر اجاره ({L['total']})")
        call("/api/admin/settings", {"billing": {"free_results": 5}}, tok)
        F = call("/api/listings?limit=24")
        check(len(F["items"]) <= 5 and F["locked_more"] == max(0, F["total"] - 5), f"[{mode}] مهمان فقط ۵ نتیجهٔ اول را می‌بیند (قفل: {F['locked_more']})")
        check(call("/api/listings?limit=24&offset=24")["items"] == [], f"[{mode}] صفحهٔ بعد برای مهمان قفل است")
        M = call("/api/market?city=rasht&deal=sale")
        check("report" in M and M["report"]["funnel"][0]["n"] >= M["report"]["overview"]["valid"], f"[{mode}] گزارش بازار و قیف ({M['report']['funnel'][0]['n']} خوانده‌شده)")
        call("/api/admin/settings", {"billing": {"free_results": 0}}, tok)
        L = call("/api/listings?sort=cheap")
        pp = [x["pp"] for x in L["items"] if x["pp"]]
        check(pp == sorted(pp), f"[{mode}] مرتب‌سازی قیمت")
        one = L["items"][0]
        check("url" not in one and one["locked"], f"[{mode}] پیوند دیوار برای مهمان قفل است")
        check(call("/api/auth/otp", {"phone": "123"}).get("status") == 400, f"[{mode}] شماره نامعتبر رد شد")
        rq = urllib.request.Request(B + "/api/auth/otp", data=json.dumps({"phone": "09350000000"}).encode(), method="POST",
                                    headers={"content-type": "application/json", "x-forwarded-for": "5.6.7.8"})
        try:
            with urllib.request.urlopen(rq) as rr: pub = json.loads(rr.read())
        except urllib.error.HTTPError as e: pub = json.loads(e.read())
        check("dev_code" not in pub, f"[{mode}] کد آزمایشی ورود از اینترنت نمایش داده نمی‌شود")
        # دورهٔ رایگان ۱۰ روزه برای ثبت‌نام تازه (پیش‌فرض روشن)
        ot = call("/api/auth/otp", {"phone": "09123334444"})
        vt = call("/api/auth/verify", {"phone": "09123334444", "code": ot["dev_code"]})
        check(vt["user"]["active"] and vt["user"]["trial"] and vt["user"]["days_left"] == 10 and vt.get("trial_days") == 10, f"[{mode}] ثبت‌نام تازه: ۱۰ روز دسترسی کامل رایگان")
        call("/api/admin/settings", {"billing": {"trial_enabled": False}}, tok)
        check(call("/api/config")["trial_days"] == 0, f"[{mode}] دورهٔ رایگان خاموش شد")
        o = call("/api/auth/otp", {"phone": "۰۹۱۲۱۲۳۴۵۶۷"})
        check(o.get("dev_code"), f"[{mode}] کد ورود (حالت آزمایشی پیامک)")
        check(call("/api/auth/verify", {"phone": "09121234567", "code": "00000"}).get("status") == 400, f"[{mode}] کد نادرست رد شد")
        ut = call("/api/auth/verify", {"phone": "09121234567", "code": o["dev_code"]})["token"]
        def ucall(path, body=None):
            req = urllib.request.Request(B + path, data=json.dumps(body).encode() if body is not None else None, method="POST" if body is not None else "GET")
            req.add_header("content-type", "application/json"); req.add_header("x-user-token", ut)
            try:
                with urllib.request.urlopen(req) as r: return json.loads(r.read())
            except urllib.error.HTTPError as e: return {"status": e.code, **json.loads(e.read())}
        check(not ucall("/api/me")["user"]["active"], f"[{mode}] کاربر جدید بدون اشتراک")
        check("url" not in ucall("/api/listing/" + one["id"]), f"[{mode}] بدون اشتراک پیوند دیوار ندارد")
        # سئو: صفحه‌های واقعی شهر و آگهی، نقشهٔ سایت و robots
        def raw(path):
            try:
                with urllib.request.urlopen(B + path) as r: return r.status, r.read().decode(errors="replace")
            except urllib.error.HTTPError as e: return e.code, e.read().decode()
        sm = raw("/sitemap.xml")[1]
        check("/melk/rasht</loc>" in sm and "/ad/" in sm and "Sitemap:" in raw("/robots.txt")[1], f"[{mode}] نقشهٔ سایت و robots.txt")
        cs, ch = raw("/melk/rasht")
        check(cs == 200 and "<title>قیمت روز ملک در رشت" in ch and 'rel="canonical"' in ch and 'src="/assets/js/app.js' in ch and "/ad/" in ch, f"[{mode}] صفحهٔ سئوی شهر رشت")
        aid = sm.split("/ad/")[1].split("<")[0]
        as_, ah = raw("/ad/" + aid)
        check(as_ == 200 and "RealEstateListing" in ah and "divar" not in ah.lower().split("<main")[1].split("</main>")[0], f"[{mode}] صفحهٔ سئوی آگهی بدون نام منبع")
        check(raw("/melk/nowhere")[0] == 404 and raw("/ad/nope-1")[0] == 404, f"[{mode}] نشانی نامعتبر ۴۰۴")
        check('id="seoText"' in ch and "دربارهٔ بازار ملک رشت" in ch and "Place" in ch, f"[{mode}] متن «دربارهٔ بازار» و داده‌های ساخت‌یافتهٔ مکان")
        gs, gh = raw("/rahnama/kharid-melk")
        check(gs == 200 and "<h1>چک‌لیست خرید ملک" in gh and '"Article"' in gh, f"[{mode}] صفحهٔ راهنمای ثابت")
        check(raw("/manifest.webmanifest")[0] == 200 and raw("/assets/img/og.png")[0] == 200, f"[{mode}] manifest و تصویر اشتراک‌گذاری")
        ar = call("/api/admin/article", {"title": "راهنمای خرید آپارتمان در رشت", "summary": "آزمون", "city_key": "rasht",
                                         "body": "## بخش اول\nاین یک متن آزمایشی برای مقاله است که باید بیش از پنجاه نویسه داشته باشد.\n- مورد [رشت](/melk/rasht)"}, tok)
        mst, mh = raw("/maghale/" + urllib.parse.quote(ar["slug"]))
        check(ar.get("ok") and mst == 200 and "<h2>بخش اول</h2>" in mh and 'href="/melk/rasht"' in mh and "/maghale/" in raw("/sitemap.xml")[1], f"[{mode}] مقاله منتشر شد و در نقشهٔ سایت است")
        check(call("/api/page?path=/rahnama/ejare").get("body"), f"[{mode}] نمایش راهنما درون برنامه")
        pub = call("/api/listings?limit=60&sort=score")["items"]
        check(all(x.get("discount") is None or abs(x["discount"] * 20 - round(x["discount"] * 20)) < 1e-9 for x in pub)
              and all(x.get("verdict") is None or x["verdict"].get("approx") for x in pub), f"[{mode}] غیرمشترک فقط بازهٔ ۵ درصدی می‌بیند")
        p = ucall("/api/pay/start", {"plan": "weekly"})
        check(p.get("activated"), f"[{mode}] خرید اشتراک هفتگی (حالت آزمایشی پرداخت)")
        me = ucall("/api/me")["user"]
        check(me["active"] and me["days_left"] >= 6, f"[{mode}] اشتراک فعال: {me['days_left']} روز")
        d = ucall("/api/listing/" + one["id"])
        check(d.get("url", "").startswith("https://divar.ir/v/") and not d["locked"], f"[{mode}] مشترک پیوند مستقیم دیوار را می‌بیند")
        # پیامک هاست‌ایران (ملی پیامک): کد با الگو ارسال و با آن وارد می‌شود
        call("/api/admin/settings", {"sms": {"provider": "payamak", "username": "user", "api_key": "pass", "template": "123456"}}, tok)
        check(call("/api/config")["sms_live"], f"[{mode}] پیامک هاست‌ایران فعال")
        r1 = call("/api/auth/otp", {"phone": "09127777777"})
        last = json.loads(urllib.request.urlopen("http://127.0.0.1:8799/payamak-last").read())
        check(r1.get("ok") and "dev_code" not in r1 and last.get("to") == "09127777777" and last.get("bodyId") == "123456", f"[{mode}] کد ورود با الگوی پنل پیامک ارسال شد")
        v1 = call("/api/auth/verify", {"phone": "09127777777", "code": last.get("text", "")})
        check(bool(v1.get("token")), f"[{mode}] ورود با کد پیامک‌شده")
        call("/api/admin/settings", {"sms": {"provider": "payamak", "api_key": "wrong"}}, tok)
        check(call("/api/auth/otp", {"phone": "09128888888"}).get("status") == 400, f"[{mode}] رمز نادرست پنل پیامک: خطای ارسال")
        call("/api/admin/settings", {"sms": {"provider": "kavenegar", "api_key": "", "template": ""}}, tok)
        st2 = call("/api/admin/users", tok=tok)
        check(st2["payments"] and st2["payments"][0]["status"] == "paid", f"[{mode}] پرداخت در پنل ثبت شد")
        # کارت‌به‌کارت با مبلغ یکتا و رسید
        call("/api/admin/settings", {"billing": {"test_mode": False, "gateway": "card", "card_number": "6037-9900-0000-0000", "card_holder": "آزمون"}}, tok)
        check(call("/api/config")["gateway"] == "card", f"[{mode}] درگاه کارت‌به‌کارت فعال")
        c = ucall("/api/pay/start", {"plan": "monthly"})
        check(c.get("card") and c["amount"] == 600000, f"[{mode}] مبلغ یکتا برای کارت‌به‌کارت، اولین نفر خود قیمت: {c.get('amount')}")
        c2 = ucall("/api/pay/start", {"plan": "monthly"})
        c3 = ucall("/api/pay/start", {"plan": "monthly"})
        check({c2.get("amount"), c3.get("amount")} == {599000, 601000}, f"[{mode}] مبلغ‌های بعدی با گام هزار تومانی: {c2.get('amount')}، {c3.get('amount')}")
        call("/api/admin/settings", {"sms": {"provider": "payamak", "username": "user", "api_key": "pass", "template": "123456", "notify_template": "777"}}, tok)
        check(ucall("/api/pay/receipt", {"payment_id": c["payment_id"], "tracking": "12"}).get("status") == 400, f"[{mode}] رسید بی‌کد رد شد")
        png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        rc = ucall("/api/pay/receipt", {"payment_id": c["payment_id"], "tracking": "۱۲۳۴۵۶", "image": png})
        before = ucall("/api/me")["user"]["days_left"]
        check(rc.get("activated") and before >= 35, f"[{mode}] رسید ثبت و اشتراک فوراً تمدید شد ({before} روز)")
        time.sleep(0.8)
        last = json.loads(urllib.request.urlopen("http://127.0.0.1:8799/payamak-last").read())
        check(last.get("bodyId") == "777" and last.get("text") == "30", f"[{mode}] پیامک «دسترسی شما باز شد» با الگوی فعال‌سازی ارسال شد")
        call("/api/admin/settings", {"sms": {"provider": "kavenegar", "api_key": "", "template": "", "notify_template": ""}}, tok)
        call("/api/admin/review", {"id": c["payment_id"], "approve": False}, tok)
        after = ucall("/api/me")["user"]["days_left"]
        check(after <= before - 29, f"[{mode}] رد رسید، روزهای اضافه را پس گرفت ({after} روز)")
        # پشتیبانی: تیکت مهمان (کد ورود نمی‌رسد) و تیکت پرداخت با رسید
        def hcall(path, body=None, headers=None):
            req = urllib.request.Request(B + path, data=json.dumps(body).encode() if body is not None else None, method="POST" if body is not None else "GET")
            req.add_header("content-type", "application/json")
            for k, v in (headers or {}).items(): req.add_header(k, v)
            try:
                with urllib.request.urlopen(req) as r: return json.loads(r.read())
            except urllib.error.HTTPError as e: return {"status": e.code, **json.loads(e.read())}
        g = hcall("/api/tickets", {"category": "sms", "phone": "09125555555", "body": "کد ورود برای من نمی‌آید"})
        check(g.get("ok") and g.get("key"), f"[{mode}] تیکت مهمان ثبت شد")
        gl = hcall("/api/tickets", headers={"x-ticket-keys": g["key"]})["items"]
        check(len(gl) == 1 and gl[0]["messages"][-1]["sender"] == "auto", f"[{mode}] تیکت مهمان با کلید دیده می‌شود و پاسخ خودکار دارد")
        check(hcall("/api/tickets")["items"] == [], f"[{mode}] بدون کلید تیکت دیگران دیده نمی‌شود")
        c4 = ucall("/api/pay/start", {"plan": "weekly"})
        utk = ucall("/api/tickets", {"category": "payment", "body": "واریز کردم", "image": png})
        mine = ucall("/api/tickets")["items"]
        tk = next((x for x in mine if x["id"] == utk.get("id")), {})
        check(tk.get("payment_id") == c4.get("payment_id") and "رسید" in tk["messages"][-1]["body"], f"[{mode}] پیوست تیکت پرداخت، رسید پرداخت کارت‌به‌کارت شد")
        at = call("/api/admin/tickets", tok=tok)["items"]
        check(len(at) >= 2 and call("/api/admin/state", tok=tok)["tickets_unread"] >= 2, f"[{mode}] تیکت‌ها در پنل مدیریت")
        call("/api/admin/ticket", {"id": g["id"], "body": "پیامک شما بررسی شد"}, tok)
        gl = hcall("/api/tickets", headers={"x-ticket-keys": g["key"]})["items"]
        check(gl[0]["status"] == "answered" and gl[0]["messages"][-1]["sender"] == "admin" and gl[0]["user_unread"], f"[{mode}] پاسخ مدیر به کاربر رسید")
        mid = tk["messages"][0]["id"]
        check(hcall(f"/api/ticket-img/{mid}").get("status") == 404, f"[{mode}] پیوست تیکت برای دیگران باز نمی‌شود")
        if True:
            # منبع دوم: شیپور (در دور mcp از طریق سرور واسط، در دور direct مستقیم)
            call("/api/admin/ingest", {"sheypoor": True, "sheypoor_mode": mode, "sheypoor_url": "http://127.0.0.1:8799/sheypoor/mcp"}, tok)
            t2 = call("/api/admin/test", {"source": "sheypoor"}, tok)
            check(t2.get("ok") and t2["count"] > 0 and t2["sample"][0].get("district") == "گلسار", f"[{mode}] آزمون اتصال شیپور: {t2.get('count')} آگهی، محله {t2.get('sample', [{}])[0].get('district')}")
            time.sleep(14)
            bs = call("/api/admin/state", tok=tok)["by_source"]
            check(bs.get("sheypoor", 0) > 0, f"[{mode}] آگهی‌های شیپور ذخیره شدند: {bs.get('sheypoor', 0)} (دیوار {bs.get('divar', 0)})")
            sp = call("/api/listings?limit=60&sort=new")
            check(all("phone" not in x for x in sp["items"]), f"[{mode}] شماره برای مهمان ارسال نمی‌شود")
            call("/api/admin/settings", {"display": {"contact_mode": "all"}}, tok)
            spid = next((x["id"] for x in ucall("/api/listings?limit=60&sort=new")["items"] if x["id"].startswith("sp-")), None)
            dsp = ucall("/api/listing/" + spid) if spid else {}
            check(spid and dsp.get("phone"), f"[{mode}] مشترک با تنظیم «همه» شمارهٔ آگهی شیپور را می‌بیند")
            call("/api/admin/settings", {"display": {"contact_mode": "none"}}, tok)
            if mode == "mcp":  # سهمیهٔ روزانهٔ سرور MCP دیوار تمام شده
                call("/api/admin/ingest", {"mode": "mcp_only", "mcp_url": "http://127.0.0.1:8799/mcp-quota"}, tok)
                q1 = call("/api/admin/test", {}, tok)
                check(not q1["ok"] and "سهمیه" in q1["error"], f"[{mode}] پیام سهمیهٔ تمام‌شده: {q1.get('error', '')[:60]}…")
                call("/api/admin/ingest", {"mode": "mcp", "mcp_url": "http://127.0.0.1:8799/mcp-quota"}, tok)
                q2 = call("/api/admin/test", {}, tok)
                check(q2.get("ok") and q2["info"].get("روش") == "اتصال مستقیم", f"[{mode}] دیوار خودکار: سهمیهٔ MCP تمام شد، اتصال مستقیم ({q2.get('info', {}).get('روش') or q2.get('error')})")
                call("/api/admin/ingest", {"sheypoor_mode": "auto", "sheypoor_url": "http://127.0.0.1:8799/sheypoor/mcp-quota"}, tok)
                q3 = call("/api/admin/test", {"source": "sheypoor"}, tok)
                check(q3.get("ok") and q3["info"].get("روش") == "اتصال مستقیم", f"[{mode}] شیپور خودکار: سهمیهٔ MCP تمام شد، اتصال مستقیم")
            if mode == "direct":  # خودکار: سرور MCP در دسترس نیست ← اتصال مستقیم
                call("/api/admin/ingest", {"sheypoor_mode": "auto", "sheypoor_url": "http://127.0.0.1:9/"}, tok)
                t3 = call("/api/admin/test", {"source": "sheypoor"}, tok)
                check(t3.get("ok") and t3["info"].get("روش") == "اتصال مستقیم", f"[{mode}] شیپور خودکار: MCP نرسید، اتصال مستقیم ({t3.get('info', {}).get('روش') or t3.get('error')})")
            check(spid and "phone" not in ucall("/api/listing/" + spid), f"[{mode}] با تنظیم «نمایش داده نشود» شماره پنهان است")
        print("   آخرین رویدادها:", [x["note"][:60] for x in st["log"][:4]])
    finally:
        srv.terminate()

# تشخیص خطای شبکه و بازگشت خودکار از پروکسی خاموش
sys.path.insert(0, os.path.join(ROOT, "server"))
import divar_client  # noqa: E402
try:
    divar_client._http("GET", "http://127.0.0.1:9/x", timeout=3)
except divar_client.SourceError as e:
    check("رد کرد" in str(e), f"پیام خطای اتصال ردشده: {str(e)[:70]}…")

mock = subprocess.Popen([sys.executable, "tests/mock_divar.py", "8799"], cwd=ROOT)
time.sleep(0.8)
os.environ["http_proxy"] = "http://127.0.0.1:9"  # پروکسی خاموش
try:
    st_, _, _ = divar_client._http("GET", "http://127.0.0.1:8799/api/v10.0.0/general/locations", timeout=5)
    check(st_ == 200, "پروکسی سیستم خاموش: اتصال خودکار بدون پروکسی")
except divar_client.SourceError as e:
    check(False, f"بازگشت از پروکسی خاموش: {e}")
del os.environ["http_proxy"]
try:
    run("mcp")
    run("direct")
finally:
    mock.terminate()
print("همه آزمون‌ها موفق بود.")
