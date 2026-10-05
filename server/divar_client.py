"""دو راه دسترسی فقط‌خواندنی به آگهی‌های عمومی دیوار.

۱. McpSource: اتصال به یک سرور MCP دیوار از طریق HTTP (پروتکل JSON-RPC، بدون کلید).
   پیش‌فرض، سرور عمومی divar-mcp (github.com/mmdju/divar-mcp) است که ابزارهای
   search_ads و ad_details را ارائه می‌دهد و شهر را با نام فارسی می‌پذیرد.
۲. DirectSource: همان نقاط پایانی JSON که وب‌اپ divar.ir و MCPهای دیوار استفاده می‌کنند
   (POST /v8/postlist/w/search و GET /v8/posts-v2/web/{token}). به شناسه عددی شهر نیاز دارد.

هر دو خروجی یکسان دارند: summary (کارت فهرست) و detail (آگهی کامل).
شماره تماس آگهی‌دهنده در هیچ‌کدام برگردانده نمی‌شود.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request

from catalog import number, parse_money_text

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
DEFAULT_MCP_URL = "https://divar-mcp.mmdju2.workers.dev/mcp"
DIVAR_API = "https://api.divar.ir"
PAGINATION_TYPE = "type.googleapis.com/post_list.PaginationData"


class SourceError(Exception):
    def __init__(self, msg, status=None, retry_after=None):
        super().__init__(msg)
        self.status = status
        self.retry_after = retry_after


def _http(method, url, body=None, headers=None, timeout=30):
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in {"user-agent": UA, "accept": "application/json", "accept-language": "fa-IR,fa;q=0.9", **(headers or {})}.items():
        req.add_header(k, v)
    if data is not None:
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise SourceError(f"HTTP {e.code}: {detail}", status=e.code, retry_after=e.headers.get("retry-after")) from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise SourceError(f"خطای شبکه: {e}") from e


def _find_lists_of_dicts(obj, depth=0):
    if depth > 4:
        return
    if isinstance(obj, list) and obj and all(isinstance(x, dict) for x in obj):
        yield obj
    if isinstance(obj, dict):
        for v in obj.values():
            yield from _find_lists_of_dicts(v, depth + 1)


def _find_latlng(obj, depth=0):
    if depth > 8:
        return None
    if isinstance(obj, dict):
        lat = obj.get("latitude", obj.get("lat"))
        lng = obj.get("longitude", obj.get("lng", obj.get("lon")))
        if isinstance(lat, (int, float)) and isinstance(lng, (int, float)) and 25 < lat < 40 and 44 < lng < 64:
            return float(lat), float(lng)
        for v in obj.values():
            r = _find_latlng(v, depth + 1)
            if r:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = _find_latlng(v, depth + 1)
            if r:
                return r
    return None


def _token_from(item: dict) -> str | None:
    tok = item.get("token") or item.get("post_token") or item.get("id")
    if not tok and item.get("url"):
        m = re.search(r"/v/(?:[^/]+/)?([A-Za-z0-9_-]{6,})", item["url"])
        tok = m.group(1) if m else None
    return str(tok) if tok else None


def _first(d: dict, *keys):
    for k in keys:
        if d.get(k) not in (None, "", []):
            return d[k]
    return None


# --------------------------------------------------------------------- MCP
class McpSource:
    name = "mcp"

    def __init__(self, url: str = DEFAULT_MCP_URL, timeout: int = 40):
        self.url = url or DEFAULT_MCP_URL
        self.timeout = timeout
        self.session = None
        self._id = 0
        self.tools: list[str] = []

    def _rpc(self, method, params=None, notify=False):
        self._id += 1
        body = {"jsonrpc": "2.0", "method": method}
        if not notify:
            body["id"] = self._id
        if params is not None:
            body["params"] = params
        headers = {"accept": "application/json, text/event-stream"}
        if self.session:
            headers["mcp-session-id"] = self.session
        status, hdrs, text = _http("POST", self.url, body, headers, self.timeout)
        sid = {k.lower(): v for k, v in hdrs.items()}.get("mcp-session-id")
        if sid:
            self.session = sid
        if notify or not text.strip():
            return None
        msg = None
        if text.lstrip().startswith("{"):
            msg = json.loads(text)
        else:  # پاسخ به شکل Server-Sent Events
            for line in text.splitlines():
                if line.startswith("data:"):
                    try:
                        cand = json.loads(line[5:].strip())
                    except json.JSONDecodeError:
                        continue
                    if cand.get("id") == body.get("id"):
                        msg = cand
        if msg is None:
            raise SourceError("پاسخ نامفهوم از سرور MCP")
        if "error" in msg:
            raise SourceError(f"MCP: {msg['error'].get('message')}")
        return msg.get("result")

    def connect(self):
        if self.tools:
            return
        self._rpc("initialize", {"protocolVersion": "2025-03-26", "capabilities": {},
                                 "clientInfo": {"name": "ara-broker", "version": "1.0"}})
        try:
            self._rpc("notifications/initialized", notify=True)
        except SourceError:
            pass
        res = self._rpc("tools/list", {}) or {}
        self.tools = [t.get("name") for t in res.get("tools", [])]

    def call(self, tool, args):
        self.connect()
        res = self._rpc("tools/call", {"name": tool, "arguments": args}) or {}
        if res.get("isError"):
            text = " ".join(c.get("text", "") for c in res.get("content", []))
            if "429" in text or "rate" in text.lower():
                raise SourceError(text[:200], status=429)
            raise SourceError(text[:300] or "خطای ابزار MCP")
        if isinstance(res.get("structuredContent"), dict):
            return res["structuredContent"]
        for c in res.get("content", []):
            if c.get("type") == "text":
                try:
                    return json.loads(c["text"])
                except (json.JSONDecodeError, KeyError):
                    return {"text": c.get("text")}
        return res

    def search(self, city: dict, category: str, page: int, cursor=None):
        payload = self.call("search_ads", {"city": city["name"], "category": category, "page": page,
                                           "limit": 30, "sort": "newest"})
        items = []
        for key in ("ads", "results", "items", "posts", "cards"):
            if isinstance(payload.get(key), list):
                items = payload[key]
                break
        else:
            items = next(_find_lists_of_dicts(payload), [])
        rows = []
        for it in items:
            tok = _token_from(it)
            if not tok:
                continue
            money = parse_money_text(_first(it, "price_text", "price_human") or "")
            rows.append({
                "token": tok,
                "title": _first(it, "title", "name") or "",
                "price": _first(it, "price_toman") if not money["price"] else money["price"],
                "deposit": _first(it, "deposit_toman") or money["deposit"],
                "rent": _first(it, "rent_toman", "monthly_rent_toman") or money["rent"],
                "negotiable": it.get("price_toman") is None and not it.get("deposit_toman"),
                "image": _first(it, "thumbnail", "image", "image_url"),
                "district": _first(it, "district", "district_fa", "district_name"),
                "city_name": _first(it, "city", "city_fa") or city["name"],
                "url": _first(it, "url") or f"https://divar.ir/v/{tok}",
                "time_text": _first(it, "time_ago", "time_text"),
                "raw": it,
            })
        has_next = bool(payload.get("has_next_page", payload.get("has_more", len(rows) > 0))) and page < 50
        return {"rows": rows, "has_next": has_next, "cursor": None}

    def detail(self, token: str):
        d = self.call("ad_details", {"token": token, "detail": "full"})
        if not isinstance(d, dict) or not d:
            raise SourceError("جزئیات خالی")
        if d.get("error") or d.get("not_found"):
            raise SourceError(str(d.get("error") or "not found"), status=404)
        specs = d.get("specs") if isinstance(d.get("specs"), dict) else {}
        if isinstance(d.get("specs"), list):
            specs = {s.get("title") or s.get("name"): s.get("value") for s in d["specs"] if isinstance(s, dict)}
        images = []
        for im in d.get("photos") or d.get("images") or ([d["thumbnail"]] if d.get("thumbnail") else []):
            url = im if isinstance(im, str) else _first(im, "url", "src", "image")
            if url:
                images.append(url)
        amenities = d.get("amenities") or []
        if isinstance(amenities, dict):
            amenities = [k for k, v in amenities.items() if v]
        return {
            "token": token,
            "title": d.get("title"),
            "description": _first(d, "description", "body", "text"),
            "attributes": {**specs, **({"امکانات": "، ".join(map(str, amenities))} if amenities else {})},
            "images": images,
            "category_text": " ".join(str(x) for x in [d.get("category_name_fa"), d.get("category"), d.get("category_slug")] if x),
            "city_name": _first(d, "city", "city_fa"),
            "district": _first(d, "district", "district_fa"),
            "latlng": _find_latlng(d.get("map") or d.get("location") or d),
            "price": d.get("price_toman"),
            "deposit": d.get("deposit_toman"),
            "rent": d.get("monthly_rent_toman"),
            "seller_type": d.get("seller_type"),
            "url": d.get("url") or f"https://divar.ir/v/{token}",
        }

    def probe(self):
        self.connect()
        return {"tools": self.tools}


# ------------------------------------------------------------------ Direct
class DirectSource:
    name = "direct"
    headers = {"origin": "https://divar.ir", "referer": "https://divar.ir/"}

    def __init__(self, api: str = DIVAR_API, timeout: int = 30):
        self.api = api.rstrip("/")
        self.timeout = timeout

    def _post(self, path, body):
        _, _, text = _http("POST", self.api + path, body, self.headers, self.timeout)
        return json.loads(text)

    def search(self, city: dict, category: str, page: int, cursor=None):
        if not city.get("divar_id"):
            raise SourceError(f"شناسه دیوار برای {city['name']} ثبت نشده است")
        pag = {"@type": PAGINATION_TYPE, "page": page, "page_size": 24}
        if cursor:
            pag.update({k: v for k, v in cursor.items() if k not in ("@type", "search_uid", "viewed_tokens")})
            pag["page"] = page
        body = {"city_ids": [str(city["divar_id"])],
                "search_data": {"form_data": {"data": {"category": {"str": {"value": category}}}}},
                "pagination_data": pag}
        data = self._post("/v8/postlist/w/search", body)
        rows = []
        for w in data.get("list_widgets", []):
            if w.get("widget_type") != "POST_ROW":
                continue
            row = w.get("data") or {}
            payload = (row.get("action") or {}).get("payload") or {}
            info = payload.get("web_info") or {}
            tok = row.get("token") or payload.get("token")
            if not tok:
                continue
            money = parse_money_text(row.get("middle_description_text"))
            rows.append({
                "token": tok, "title": (row.get("title") or "").strip(),
                "price": money["price"], "deposit": money["deposit"], "rent": money["rent"],
                "negotiable": money["negotiable"], "image": row.get("image_url"),
                "district": info.get("district_persian"), "city_name": info.get("city_persian") or city["name"],
                "url": f"https://divar.ir/v/{tok}", "time_text": (row.get("bottom_description_text") or "").split(" در ")[0],
                "raw": {"middle": row.get("middle_description_text")},
            })
        pagination = data.get("pagination") or {}
        return {"rows": rows, "has_next": bool(pagination.get("has_next_page")), "cursor": pagination.get("data")}

    def detail(self, token: str):
        _, _, text = _http("GET", f"{self.api}/v8/posts-v2/web/{token}", None, self.headers, self.timeout)
        p = json.loads(text)
        sections = {s.get("section_name"): s.get("widgets", []) for s in p.get("sections", [])}
        out = {"token": token, "title": None, "description": None, "attributes": {}, "images": [],
               "category_text": "", "city_name": (p.get("city") or {}).get("name"), "district": None,
               "latlng": None, "price": None, "deposit": None, "rent": None, "seller_type": None,
               "url": (p.get("share") or {}).get("web_url") or f"https://divar.ir/v/{token}"}
        crumbs = []
        for w in sections.get("BREADCRUMB", []):
            for it in (w.get("data") or {}).get("parent_items", []):
                crumbs.append(it.get("title") or "")
                slug = (((((it.get("action") or {}).get("payload") or {}).get("search_data") or {})
                         .get("form_data") or {}).get("data", {}).get("category", {}).get("str", {}).get("value"))
                if slug:
                    crumbs.append(slug)
        web = p.get("webengage") or {}
        out["category_text"] = " ".join(crumbs + [str(web.get("category") or "")])
        for w in sections.get("TITLE", []):
            d = w.get("data") or {}
            if w.get("widget_type") == "LEGEND_TITLE_ROW":
                out["title"] = d.get("title")
                sub = d.get("subtitle") or ""
                if "،" in sub:
                    out["district"] = sub.split("،")[-1].strip()
        for w in sections.get("DESCRIPTION", []):
            if w.get("widget_type") == "DESCRIPTION_ROW":
                out["description"] = (w.get("data") or {}).get("text")
        for w in sections.get("IMAGE", []):
            for it in (w.get("data") or {}).get("items", []) or []:
                url = (it.get("image") or {}).get("url")
                if url:
                    out["images"].append(url)
        for w in sections.get("LIST_DATA", []):
            d = w.get("data") or {}
            if w.get("widget_type") == "GROUP_INFO_ROW":
                for it in d.get("items", []) or []:
                    if it.get("title"):
                        out["attributes"][it["title"]] = it.get("value")
            elif w.get("widget_type") == "GROUP_FEATURE_ROW":
                for i in d.get("items", []) or []:
                    t = (i.get("title") or "").strip()
                    if t:  # «پارکینگ» یا «پارکینگ ندارد»
                        base = t.replace("ندارد", "").strip()
                        out["attributes"][base] = "ندارد" if (not i.get("available", True) or "ندارد" in t) else "دارد"
                # جدول «همه ویژگی‌ها» (سند، جهت، گرمایش، ...) در اکشن مودال
                for sec in (((d.get("action") or {}).get("payload") or {}).get("modal_page") or {}).get("widget_list", []) or []:
                    sd = sec.get("data") or {}
                    if sd.get("title") and sd.get("value") is not None:
                        out["attributes"][sd["title"]] = sd["value"]
                    for i in sd.get("items", []) or []:
                        if i.get("title"):
                            out["attributes"][i["title"].replace("ندارد", "").strip()] = "ندارد" if (not i.get("available", True) or "ندارد" in i["title"]) else i.get("value", "دارد")
            elif d.get("title") and d.get("value") is not None:
                out["attributes"][d["title"]] = d.get("value")
        out["latlng"] = _find_latlng(sections.get("MAP") or p.get("sections"))
        if web.get("price"):
            out["price"] = number(web["price"])
        return out

    def probe_city(self, divar_id: int) -> str | None:
        """نام شهر متناظر با یک شناسه دیوار (برای کشف شناسه‌ها)."""
        data = self._post("/v8/postlist/w/search", {"city_ids": [str(divar_id)],
                          "pagination_data": {"@type": PAGINATION_TYPE, "page": 1, "page_size": 1}})
        bc = (data.get("seo_details") or {}).get("bread_crumb") or []
        return bc[0].get("name") if bc else None

    def probe(self):
        return {"sample_city": self.probe_city(12)}


def make_source(mode: str, mcp_url: str | None = None, api: str | None = None):
    if mode == "direct":
        return DirectSource(api or os.environ.get("ARA_DIVAR_API") or DIVAR_API)
    return McpSource(mcp_url or DEFAULT_MCP_URL)


def backoff_seconds(err: SourceError, attempt: int) -> float:
    if err.retry_after:
        try:
            return float(err.retry_after)
        except ValueError:
            pass
    return min(900, 30 * (2 ** attempt))


