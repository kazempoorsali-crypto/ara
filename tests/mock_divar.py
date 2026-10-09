"""شبیه‌ساز محلی دیوار برای آزمون موتور دریافت (بدون اینترنت).

هم نقطه پایانی MCP (POST /mcp) و هم نقاط پایانی مستقیم (/v8/...) را با داده ساختگی پاسخ می‌دهد.
اجرا: python tests/mock_divar.py 8799
"""
import json
import random
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CITY_IDS = {"12": "رشت", "21": "گرگان", "22": "ساری"}
CALLS = {"mcp": 0, "direct": 0}
SMS = {}


def fake_ads(city, category, page, n=24):
    rnd = random.Random(f"{city}{category}{page}")
    out = []
    for i in range(n):
        tok = f"T{abs(hash((city, category, page, i))) % 10**8:08d}"
        if i % 3 == 0:
            out.append({"token": tok, "title": f"اجاره آپارتمان {rnd.randint(60, 140)} متری", "price_toman": rnd.randint(5, 20) * 1_000_000,
                        "deposit_toman": rnd.randint(100, 900) * 1_000_000, "district": "منظریه"})
        else:
            out.append({"token": tok, "title": f"فروش ویلا {rnd.randint(150, 400)} متری استخردار", "price_toman": rnd.randint(4, 30) * 1_000_000_000,
                        "district": "ساحلی"})
    return out


def detail(token):
    rnd = random.Random(token)
    return {"token": token, "title": "ویلای دوبلکس با دید دریا", "description": "سند تک‌برگ، پارکینگ، استخر. فاصله تا دریا ۲۰۰ متر.",
            "specs": {"متراژ": "۲۴۰", "ساخت": "۱۳۹۹", "اتاق": "۳"}, "amenities": ["پارکینگ", "انباری"],
            "photos": [f"https://example.com/{token}/{i}.jpg" for i in range(3)], "category_name_fa": "فروش خانه و ویلا",
            "price_toman": rnd.randint(5, 30) * 1_000_000_000, "map": {"latitude": 37.29, "longitude": 49.6}}


def sheypoor_tool(name, a):
    """شبیه‌ساز ابزارهای sheypoor-mcp."""
    if name == "list_provinces":
        return [{"id": 1, "name": "گیلان", "slug": "gilan"}, {"id": 2, "name": "مازندران", "slug": "mazandaran"}, {"id": 3, "name": "گلستان", "slug": "golestan"}]
    if name == "list_cities":
        cities = {"gilan": [{"id": 101, "name": "رشت", "slug": "rasht"}], "mazandaran": [{"id": 201, "name": "ساری", "slug": "sari"}],
                  "golestan": [{"id": 301, "name": "گرگان", "slug": "gorgan"}]}
        return {"province": a["province"], "cities": cities.get(a["province"], [])}
    if name == "search_categories":
        return [{"id": 43603, "name": "املاک", "slug": "real-estate", "path": "املاک"}]
    if name == "get_category_tree":
        return {"tree": [{"id": 43603, "name": "املاک", "children": [
            {"id": 44096, "name": "فروش آپارتمان", "children": []}, {"id": 44098, "name": "رهن و اجاره آپارتمان", "children": []}]}]}
    if name == "search_listings":
        rnd = random.Random(f"{a.get('cityId')}{a.get('categoryId')}{a['page']}")
        rent = a.get("categoryId") == 44098
        items = []
        for i in range(12 if a["page"] < 3 else 0):
            lid = 400000000 + (a.get("cityId") or 0) * 1000 + a["page"] * 50 + i + (500 if rent else 0)
            area = rnd.randint(60, 150)
            if rent:
                price = {"amount": rnd.randint(100, 800) * 1_000_000, "currency": "تومان", "negotiable": False, "display": "رهن"}
            else:
                price = {"amount": area * rnd.randint(25, 45) * 1_000_000, "currency": "تومان", "negotiable": False, "display": ""}
            items.append({"id": str(lid), "title": f"آپارتمان {area} متری", "url": f"https://www.sheypoor.com/v/{lid}",
                          "price": price, "location": "رشت، گلسار" if a.get("cityId") == 101 else "ساری، کوی کارمندان",
                          "categoryId": a.get("categoryId"), "imageCount": 2, "phone": "0911" + str(lid)[-7:]})
        return {"total": 24, "page": a["page"], "items_per_page": 12, "count": len(items), "listings": items}
    if name == "get_listing":
        return {"id": str(a["id"]), "title": "آپارتمان ۹۰ متری نوساز", "url": f"https://www.sheypoor.com/v/{a['id']}",
                "description": "سند تک‌برگ، آسانسور، پارکینگ. ساخت ۱۴۰۰.", "price": [{"amount": 3_100_000_000, "display": "۳٬۱۰۰٬۰۰۰٬۰۰۰ تومان"}],
                "location": "رشت، گلسار", "phone": "09110000000", "shop_profile": False,
                "breadcrumbs": [{"title": "املاک"}, {"title": "فروش آپارتمان"}],
                "attributes": [{"key": "متراژ", "value": "۹۰"}, {"key": "تعداد اتاق", "value": "۲"}, {"key": "سال ساخت", "value": "۱۴۰۰"}],
                "images": ["https://example.com/sp.jpg"]}
    return {"error": "unknown tool"}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, obj, status=200, headers=None):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == "/payamak-last":
            return self.reply(SMS)
        if self.path.startswith("/api/v10.0.0/"):
            return self.sheypoor_direct(self.path[len("/api/v10.0.0"):])
        if self.path.startswith("/v8/posts-v2/web/"):
            CALLS["direct"] += 1
            tok = self.path.rsplit("/", 1)[-1]
            if tok.endswith("00"):
                return self.reply({"message": "not found"}, 404)
            return self.reply({"city": {"name": "رشت", "city_id": "12"}, "share": {"web_url": f"https://divar.ir/v/{tok}"},
                               "webengage": {"category": "house-villa-sell", "price": 9000000000},
                               "sections": [
                                   {"section_name": "BREADCRUMB", "widgets": [{"data": {"parent_items": [{"title": "املاک"}, {"title": "فروش خانه و ویلا"}]}}]},
                                   {"section_name": "TITLE", "widgets": [{"widget_type": "LEGEND_TITLE_ROW", "data": {"title": "ویلا نوساز جنگلی", "subtitle": "لحظاتی پیش در رشت، گلسار"}}]},
                                   {"section_name": "DESCRIPTION", "widgets": [{"widget_type": "DESCRIPTION_ROW", "data": {"text": "دارای استخر و آلاچیق"}}]},
                                   {"section_name": "IMAGE", "widgets": [{"data": {"items": [{"image": {"url": "https://example.com/a.jpg"}}]}}]},
                                   {"section_name": "LIST_DATA", "widgets": [{"widget_type": "GROUP_INFO_ROW", "data": {"items": [{"title": "متراژ", "value": "۳۰۰"}, {"title": "ساخت", "value": "۱۴۰۱"}, {"title": "اتاق", "value": "۴"}]}}]},
                               ]})
        self.reply({}, 404)

    def sheypoor_direct(self, path):
        """شبیه‌ساز نقاط پایانی مستقیم شیپور (/api/v10.0.0/...)."""
        from urllib.parse import parse_qs, urlsplit
        u = urlsplit(path)
        q = {k: v[-1] for k, v in parse_qs(u.query).items()}
        if u.path == "/general/locations":
            return self.reply({"data": {"version": 1, "list": [
                {"provinceID": 1, "name": "گیلان", "slug": "gilan", "cities": [{"cityID": 101, "name": "رشت", "slug": "rasht"}]},
                {"provinceID": 2, "name": "مازندران", "slug": "mazandaran", "cities": [{"cityID": 201, "name": "ساری", "slug": "sari"}]}]}})
        if u.path == "/categories/compact":
            return self.reply({"data": [{"id": 43603, "attributes": {"title": "املاک"}, "relationships": {"children": {"data": [
                {"id": 44096, "title": "فروش آپارتمان"}, {"id": 44098, "title": "رهن و اجاره آپارتمان"}]}}}]})
        if u.path.startswith("/search/"):
            res = sheypoor_tool("search_listings", {"cityId": int(q.get("ct", 0)), "categoryId": int(q.get("c", 0)), "page": int(q.get("p", 1))})
            groups = [{"type": "listingGroup", "items": [{"id": it["id"], "type": "normal", "attributes": {
                "title": it["title"], "url": it["url"], "location": it["location"], "telephone": it["phone"],
                "price": [{"label": "رهن" if it["price"]["display"] == "رهن" else "قیمت", "amount": f"{it['price']['amount']:,}", "currency": "تومان"}]}}
                for it in res["listings"]]}]
            return self.reply({"data": groups, "meta": {"f": "cur" + q.get("p", "1") if res["listings"] else None}})
        if u.path.startswith("/listings/"):
            d = sheypoor_tool("get_listing", {"id": u.path.rsplit("/", 1)[-1]})
            return self.reply({"data": {"id": d["id"], "attributes": {**d, "isShopProfile": False, "images": [{"source": {"desktop": "https://example.com/sp.jpg"}}]}}})
        return self.reply({}, 404)

    def do_POST(self):
        n = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(n) or b"{}"
        if self.path == "/api/SendSMS/BaseServiceNumber":  # شبیه‌ساز پنل پیامک هاست‌ایران / ملی پیامک
            from urllib.parse import parse_qs
            f = {k: v[-1] for k, v in parse_qs(raw.decode()).items()}
            if f.get("username") != "user" or f.get("password") != "pass" or not f.get("bodyId"):
                return self.reply({"Value": "-1", "RetStatus": 0, "StrRetStatus": "InvalidUserPass"})
            SMS.update(f)
            return self.reply({"Value": "4512367890123456789", "RetStatus": 1, "StrRetStatus": "Ok"})
        body = json.loads(raw)
        if self.path in ("/mcp-quota", "/sheypoor/mcp-quota"):  # سهمیهٔ تمام‌شدهٔ پلن رایگان کلادفلر
            return self.reply({"type": "https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/",
                               "title": "Error 1027: This website has been temporarily rate limited", "status": 429,
                               "detail": "The site owner has exceeded their Workers free tier daily request limit. The limit resets at midnight UTC."}, 429)
        if self.path == "/sheypoor/mcp":
            m = body.get("method")
            if "id" not in body:
                self.send_response(202)
                self.end_headers()
                return
            if m == "initialize":
                return self.reply({"jsonrpc": "2.0", "id": body["id"], "result": {"protocolVersion": "2025-03-26", "capabilities": {"tools": {}}}})
            if m == "tools/list":
                return self.reply({"jsonrpc": "2.0", "id": body["id"], "result": {"tools": [{"name": n} for n in (
                    "list_provinces", "list_cities", "search_categories", "get_category_tree", "search_listings", "get_listing")]}})
            p = body["params"]
            data = sheypoor_tool(p["name"], p.get("arguments") or {})
            return self.reply({"jsonrpc": "2.0", "id": body["id"], "result": {"content": [{"type": "text", "text": json.dumps(data, ensure_ascii=False)}]}})
        if self.path == "/mcp":
            CALLS["mcp"] += 1
            m = body.get("method")
            if "id" not in body:
                self.send_response(202)
                self.end_headers()
                return
            if m == "initialize":
                return self.reply({"jsonrpc": "2.0", "id": body["id"], "result": {"protocolVersion": "2025-03-26", "capabilities": {"tools": {}}}},
                                  headers={"mcp-session-id": "s1"})
            if m == "tools/list":
                return self.reply({"jsonrpc": "2.0", "id": body["id"], "result": {"tools": [{"name": "search_ads"}, {"name": "ad_details"}]}})
            if m == "tools/call":
                p = body["params"]
                a = p["arguments"]
                if p["name"] == "search_ads":
                    data = {"ads": fake_ads(a["city"], a["category"], a["page"], 10 if a["page"] < 3 else 0), "has_next_page": a["page"] < 3}
                else:
                    data = detail(a["token"])
                # پاسخ به‌صورت SSE برای آزمودن هر دو قالب
                text = json.dumps({"jsonrpc": "2.0", "id": body["id"], "result": {"content": [{"type": "text", "text": json.dumps(data, ensure_ascii=False)}]}}, ensure_ascii=False)
                b = f"event: message\ndata: {text}\n\n".encode()
                self.send_response(200)
                self.send_header("content-type", "text/event-stream")
                self.end_headers()
                self.wfile.write(b)
                return
        if self.path == "/v8/postlist/w/search":
            CALLS["direct"] += 1
            cid = body["city_ids"][0]
            pg = body["pagination_data"].get("page", 1)
            if body["pagination_data"].get("page_size") == 1:
                name = CITY_IDS.get(cid) or ("بابل" if cid == "40" else None)
                return self.reply({"seo_details": {"bread_crumb": [{"name": name}] if name else []}, "list_widgets": []})
            cat = body["search_data"]["form_data"]["data"]["category"]["str"]["value"]
            rows = []
            for ad in fake_ads(cid, cat, pg, 24):
                mid = f"{ad['price_toman']:,} تومان".replace(",", "٬")
                if ad.get("deposit_toman"):
                    mid = f"ودیعه: {ad['deposit_toman'] // 1_000_000} میلیون تومان\nاجاره: {ad['price_toman'] // 1_000_000} میلیون تومان"
                rows.append({"widget_type": "POST_ROW", "data": {"title": ad["title"], "token": ad["token"], "middle_description_text": mid,
                             "bottom_description_text": "دقایقی پیش در گلسار", "image_url": "https://example.com/t.webp",
                             "action": {"payload": {"token": ad["token"], "web_info": {"city_persian": CITY_IDS.get(cid, "رشت"), "district_persian": "گلسار"}}}}})
            return self.reply({"list_widgets": rows, "pagination": {"has_next_page": pg < 2, "data": {"page": pg + 1, "last_post_date": "x", "layer_page": 1}}})
        self.reply({}, 404)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8799
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
