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

    def do_POST(self):
        n = int(self.headers.get("content-length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
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
