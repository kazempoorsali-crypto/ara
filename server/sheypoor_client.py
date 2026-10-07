"""منبع دوم آگهی: شیپور، از طریق سرور MCP عمومی sheypoor-mcp (github.com/FarhamAghdasi/sheypoor-mcp، MIT)
یا اتصال مستقیم به API عمومی شیپور؛ حالت پیش‌فرض «خودکار» اول MCP و در صورت نرسیدن، مستقیم را امتحان می‌کند.

ابزارهای استفاده‌شده (فقط‌خواندنی، بدون ورود به حساب):
  list_provinces، list_cities(province)، search_categories(query)، get_category_tree(parentId)،
  search_listings(city, cityId, categoryId, sort, page)، get_listing(id)

خروجی summary و detail هم‌شکل منبع دیوار است تا موتور دریافت و ارزش‌گذاری بدون تغییر کار کند.
شمارهٔ تلفن فقط وقتی ذخیره می‌شود که شیپور آن را عمومی برگرداند؛ نمایشش در سایت با تنظیم پنل است.
"""
from __future__ import annotations

import re

from catalog import PROVINCES, find_city, norm, parse_money_text, squash
import json
import urllib.parse

from divar_client import McpSource, SourceError, _http, find_images

DEFAULT_SHEYPOOR_MCP = "https://sheypoor-mcp.farhamaghdasi.workers.dev/"  # نشانی رسمی در README پروژه
SHEYPOOR_API = "https://www.sheypoor.com/api/v10.0.0"
# دسته‌های ملک شیپور که می‌خوانیم؛ نام دسته برای تشخیص نوع ملک و معامله به کار می‌رود
ESTATE_RX = r"آپارتمان|خانه|ویلا|زمین|باغ|مغازه|تجاری|اداری|دفتر|سوئیت|کلنگی|اجاره|رهن|فروش"


def _list(payload, *keys):
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    for k in keys:
        if isinstance(payload.get(k), list):
            return payload[k]
    for v in payload.values():
        if isinstance(v, list) and v and isinstance(v[0], dict):
            return v
    return []


def _money(prices, category_text=""):
    """قیمت‌های شیپور ← price/deposit/rent به تومان. در اجاره، اولی ودیعه و دومی اجارهٔ ماهانه است."""
    if isinstance(prices, dict):
        prices = [prices]
    prices = [p for p in (prices or []) if isinstance(p, dict)]
    out = {"price": None, "deposit": None, "rent": None, "negotiable": True}
    rent_like = bool(re.search(r"اجاره|رهن", category_text or ""))
    vals = []
    for p in prices:
        disp = norm(p.get("display") or p.get("title") or "")
        amt = p.get("amount")
        if isinstance(amt, str):
            amt = parse_money_text(norm(amt) + " تومان").get("price")
            disp = f"{norm(p.get('label') or '')} {disp}"
        elif p.get("label"):
            disp = f"{norm(p.get('label'))} {disp}"
        if not isinstance(amt, (int, float)) or amt <= 0:
            amt = parse_money_text(disp).get("price") or parse_money_text(disp).get("deposit")
        if not amt:
            continue
        if re.search(r"ریال", disp) and not re.search(r"تومان", disp):
            amt = amt / 10
        label = "deposit" if re.search(r"رهن|ودیعه", disp) else "rent" if re.search(r"اجاره|ماهانه", disp) else None
        vals.append((label, int(amt)))
    if not vals:
        return out
    out["negotiable"] = False
    if rent_like or any(lab for lab, _ in vals):
        for i, (lab, v) in enumerate(vals):
            lab = lab or ("deposit" if i == 0 else "rent")
            out[lab] = out[lab] or v
    else:
        out["price"] = vals[0][1]
    return out


def _split_location(loc, city):
    """«رشت، گلسار» یا «گلسار، رشت» ← نام محله (بدون نام شهر)."""
    parts = [x.strip() for x in re.split(r"[،,\-–|/]", norm(loc)) if x.strip()]
    cname = norm(city["name"]).replace(" ", "")
    rest = [p for p in parts if p.replace(" ", "") != cname]
    return rest[-1] if rest else None


class SheypoorSource(McpSource):
    name = "sheypoor"

    def __init__(self, url: str = DEFAULT_SHEYPOOR_MCP, store=None, timeout: int = 40):
        super().__init__(url or DEFAULT_SHEYPOOR_MCP, timeout)
        self.store = store

    def connect(self):
        try:
            super().connect()
        except SourceError as e:  # بعضی استقرارها MCP را روی ریشه و بعضی روی /mcp دارند
            if e.status not in (404, 405):
                raise
            base = self.url.rstrip("/")
            self.url = base[:-4] + "/" if base.endswith("/mcp") else base + "/mcp"
            self.session = None
            super().connect()

    # ---------------------------------------------------------- نگاشت شهر و دسته
    def _cache(self):
        return (self.store.get_setting("sheypoor_map") if self.store else None) or {}

    def _save(self, m):
        if self.store:
            self.store.set_setting("sheypoor_map", m)

    def city_ref(self, city: dict) -> dict | None:
        """شناسهٔ شیپوری شهر؛ شهرهای هر استان یک‌بار (با اولین شهر همان استان) کشف و ذخیره می‌شوند."""
        m = self._cache()
        if city["key"] in m.get("cities", {}):
            return m["cities"][city["key"]]
        done = m.setdefault("prov_done", ["gilan", "mazandaran", "golestan"] if m.get("cities_done") else [])
        pkey = city.get("province")
        if pkey in done or pkey not in PROVINCES:
            return None
        cities = m.setdefault("cities", {})
        pname = PROVINCES[pkey]["name"]
        provinces = _list(self.call("list_provinces", {}), "provinces")
        prov = next((p for p in provinces if squash(pname) in squash(p.get("name")) or squash(p.get("name")) == squash(pname)), None)
        arg = (prov or {}).get("slug") or pname
        res = self.call("list_cities", {"province": arg})
        for c in _list(res, "cities"):
            hit = find_city(c.get("name"))
            if hit and hit["province"] == pkey and squash(hit["name"]) == squash(c.get("name")):
                cities[hit["key"]] = {"id": c.get("id"), "slug": c.get("slug"), "name": c.get("name")}
        done.append(pkey)
        self._save(m)
        return cities.get(city["key"])

    def categories(self) -> list:
        """شناسهٔ دسته‌های ملک شیپور (برگ‌ها، با نام) — یک‌بار کشف و ذخیره می‌شود."""
        m = self._cache()
        if m.get("categories"):
            return m["categories"]
        found = _list(self.call("search_categories", {"query": "املاک"}), "results", "matches", "categories")
        top = next((c for c in found if norm(c.get("name")) == "املاک" or c.get("slug") in ("real-estate", "realestate")), None)
        leaves = []
        if top:
            tree = self.call("get_category_tree", {"parentId": str(top.get("id"))})

            def walk(node, path):
                kids = (node.get("children") or node.get("subcategories") or []) if isinstance(node, dict) else []
                name = norm(node.get("name")) if isinstance(node, dict) else ""
                if isinstance(node, dict) and not kids and node.get("id") is not None and re.search(ESTATE_RX, name):
                    leaves.append({"id": node["id"], "name": " ".join(path + [name]).strip()})
                for k in kids:
                    walk(k, path + ([name] if name else []))
            for node in _list(tree, "tree", "children", "categories") or ([tree] if isinstance(tree, dict) else []):
                walk(node, [])
        if not leaves:  # اگر درخت در دسترس نبود: خود دستهٔ املاک
            leaves = [{"id": top.get("id"), "name": "املاک"}] if top else []
        if not leaves:
            raise SourceError("دستهٔ املاک در شیپور پیدا نشد")
        m["categories"] = leaves
        self._save(m)
        return leaves

    # ---------------------------------------------------------- فهرست و جزئیات
    def search(self, city: dict, category: str, page: int, cursor=None):
        """category به شکل «sheypoor:<شناسهٔ دسته>» است."""
        cat_id = category.split(":", 1)[1]
        cat = next((c for c in self.categories() if str(c["id"]) == cat_id), {"id": cat_id, "name": ""})
        ref = self.city_ref(city)
        if not ref:
            raise SourceError(f"شهر {city['name']} در شیپور پیدا نشد", status=404)
        args = {"city": ref.get("slug") or "iran", "sort": "newest", "page": page}
        if ref.get("id") is not None:
            args["cityId"] = int(ref["id"])
        if str(cat_id).isdigit():
            args["categoryId"] = int(cat_id)
        if cursor and self.name == "sheypoor-direct":
            args["f"] = cursor
        payload = self.call("search_listings", args)
        rows = []
        for it in _list(payload, "listings", "items"):
            if not it.get("id"):
                continue
            money = _money(it.get("price"), cat["name"])
            rows.append({
                "token": str(it["id"]), "title": it.get("title") or "", "url": it.get("url"),
                "price": money["price"], "deposit": money["deposit"], "rent": money["rent"], "negotiable": money["negotiable"],
                "district": _split_location(it.get("location"), city), "city_name": city["name"],
                "phone": it.get("phone"), "category_text": cat["name"], "image": (find_images(it, 1) or [None])[0], "raw": it,
            })
        total, per = payload.get("total") or 0, payload.get("items_per_page") or 24
        has_next = bool(rows) and (page * per < total if total else len(rows) >= per) and page < 50
        return {"rows": rows, "has_next": has_next, "cursor": payload.get("next")}

    def detail(self, token: str):
        d = self.call("get_listing", {"id": int(token) if str(token).isdigit() else token})
        if not isinstance(d, dict) or not (d.get("id") or d.get("title")):
            raise SourceError("آگهی پیدا نشد", status=404)
        crumbs = " ".join(norm(b.get("title")) for b in d.get("breadcrumbs") or [] if isinstance(b, dict))
        attrs = {}
        for a in d.get("attributes") or []:
            if isinstance(a, dict) and a.get("key"):
                attrs[str(a["key"])] = str(a.get("value") if a.get("value") is not None else "")
        loc = d.get("location") or ""
        city = find_city(loc) or find_city(crumbs)
        money = _money(d.get("price"), crumbs)
        return {
            "token": str(token), "title": d.get("title"), "description": d.get("description"),
            "attributes": attrs, "images": find_images(d.get("images") or []) or find_images(d, 10),
            "category_text": crumbs, "city_name": city["name"] if city else None,
            "district": _split_location(loc, city) if city else None, "address": loc or None,
            "latlng": None, "price": money["price"], "deposit": money["deposit"], "rent": money["rent"],
            "seller_type": "business" if d.get("shop_profile") else "personal",
            "phone": d.get("phone"), "url": d.get("url"),
            "time_text": d.get("added_at") or d.get("time_passed_label"),
        }

    def probe(self):
        self.connect()
        return {"tools": self.tools, "categories": len(self.categories())}


# ------------------------------------------------------------------ مستقیم
def _unwrap(obj, depth=0):
    """data تو در تو را تا رسیدن به فهرست باز می‌کند."""
    while isinstance(obj, dict) and "data" in obj and depth < 5:
        obj, depth = obj["data"], depth + 1
    return obj


class SheypoorDirectSource(SheypoorSource):
    """اتصال مستقیم به نقاط پایانی عمومی وب‌اپ شیپور (همان‌هایی که sheypoor-mcp استفاده می‌کند)؛
    از داخل ایران بدون فیلترشکن کار می‌کند و به سرور واسط نیاز ندارد."""
    name = "sheypoor-direct"

    def __init__(self, api: str = SHEYPOOR_API, store=None, timeout: int = 30):
        McpSource.__init__(self, api, timeout)
        self.api = (api or SHEYPOOR_API).rstrip("/")
        self.store = store

    def _get(self, path, params=None):
        url = self.api + path + ("?" + urllib.parse.urlencode(params, doseq=True) if params else "")
        _, _, text = _http("GET", url, headers={"accept": "application/json, text/plain, */*", "referer": "https://www.sheypoor.com/",
                                               "origin": "https://www.sheypoor.com"}, timeout=self.timeout)
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise SourceError("پاسخ نامفهوم از شیپور") from e

    def connect(self):
        return None

    def call(self, tool, args):  # نگاشت ابزارهای MCP به نقاط پایانی مستقیم
        if tool == "list_provinces":
            return [{"id": p.get("provinceID"), "name": p.get("name"), "slug": p.get("slug"), "cities": p.get("cities")} for p in self._locations()]
        if tool == "list_cities":
            prov = next((p for p in self._locations() if p.get("slug") == args["province"] or norm(args["province"]) in norm(p.get("name"))), {})
            return {"cities": [{"id": c.get("cityID"), "name": c.get("name"), "slug": c.get("slug")} for c in prov.get("cities") or []]}
        if tool == "search_categories":
            out = []

            def walk(n, path):
                name = norm(n.get("name") or n.get("title") or (n.get("attributes") or {}).get("name") or (n.get("attributes") or {}).get("title"))
                if args["query"] in name:
                    out.append({"id": n.get("id"), "name": name, "slug": n.get("slug") or (n.get("attributes") or {}).get("slug")})
                for k in self._kids(n):
                    walk(k, path + [name])
            for n in self._categories():
                walk(n, [])
            return out
        if tool == "get_category_tree":
            def find(nodes):
                for n in nodes:
                    if str(n.get("id")) == str(args.get("parentId")):
                        return n
                    hit = find(self._kids(n))
                    if hit:
                        return hit
            node = find(self._categories())

            def norm_node(n):
                return {"id": n.get("id"), "name": norm(n.get("name") or n.get("title") or (n.get("attributes") or {}).get("name") or (n.get("attributes") or {}).get("title")),
                        "children": [norm_node(k) for k in self._kids(n)]}
            return {"tree": [norm_node(node)] if node else []}
        if tool == "search_listings":
            params = {"p": args.get("page", 1), "o": {"newest": "n", "cheapest": "pa", "expensive": "pd"}.get(args.get("sort"), "n")}
            if args.get("categoryId") is not None:
                params["c"] = args["categoryId"]
            if args.get("cityId") is not None:
                params["ct"] = args["cityId"]
            if args.get("f"):
                params["f"] = args["f"]
            res = self._get(f"/search/{args.get('city') or 'iran'}", params)
            items = []
            for g in res.get("data") or []:
                group = g.get("items") if g.get("type") in ("listingGroup", "vip") and isinstance(g.get("items"), list) else [g]
                for it in group:
                    at = it.get("attributes") or {}
                    if not it.get("id") or not at.get("title"):
                        continue
                    items.append({"id": str(it["id"]), "title": at.get("title"), "url": at.get("url"), "price": at.get("price") or [],
                                  "location": at.get("location"), "phone": at.get("telephone"),
                                  "image": (find_images({k: v for k, v in at.items() if re.search(r"image|thumb|photo", k, re.I)}, 1) or [None])[0]})
            meta = res.get("meta") or {}
            return {"listings": items, "total": meta.get("total") or 0, "items_per_page": 24, "next": meta.get("f")}
        if tool == "get_listing":
            res = self._get(f"/listings/{args['id']}")
            d = res.get("data") if isinstance(res.get("data"), dict) else res
            at = {**(d.get("attributes") or {}), "id": d.get("id")}
            imgs = []
            for im in at.get("images") or []:
                u = im if isinstance(im, str) else ((im.get("source") or {}).get("desktop") or im.get("url")) if isinstance(im, dict) else None
                if u:
                    imgs.append(u)
            return {"id": at.get("id"), "title": at.get("title"), "url": at.get("url"), "description": at.get("description"),
                    "price": at.get("price") or [], "location": at.get("location"), "phone": at.get("phone") or at.get("telephone"),
                    "shop_profile": bool(at.get("isShopProfile")), "breadcrumbs": at.get("breadcrumbs") or [],
                    "attributes": [a for a in at.get("attributes") or [] if isinstance(a, dict)], "images": imgs,
                    "added_at": at.get("addedAt") or at.get("added_at"), "time_passed_label": at.get("timePassedLabel")}
        raise SourceError(f"ابزار ناشناخته: {tool}")

    @staticmethod
    def _kids(n):
        k = n.get("children") or ((n.get("relationships") or {}).get("children") or {}).get("data") or []
        return [x for x in k if isinstance(x, dict)]

    def _locations(self):
        if not getattr(self, "_loc", None):
            d = self._get("/general/locations").get("data") or {}
            self._loc = d.get("list") if isinstance(d, dict) else d or []
        return self._loc

    def _categories(self):
        if not getattr(self, "_cats", None):
            d = _unwrap(self._get("/categories/compact"))
            self._cats = [x for x in d if isinstance(x, dict)] if isinstance(d, list) else []
        return self._cats

    def probe(self):
        return {"categories": len(self.categories()), "provinces": len(self._locations())}


class SheypoorAutoSource:
    """روش خودکار: اول سرور واسط MCP (همان مسیری که MCP دیوار از آن کار می‌کند)، و اگر شبکه به آن نرسید،
    اتصال مستقیم به sheypoor.com. شناسهٔ شهرها و دسته‌ها در هر دو روش یکی است (هر دو از API خود شیپورند)."""
    name = "sheypoor-auto"

    def __init__(self, mcp_url=None, api=None, store=None):
        self.mcp = SheypoorSource(mcp_url, store=store)
        self.direct = SheypoorDirectSource(api, store=store)
        self.active = None
        self.errors = {}

    def _run(self, fn):
        order = [self.active] if self.active else [self.mcp, self.direct]
        if self.active:
            order.append(self.direct if self.active is self.mcp else self.mcp)
        last, statuses = None, []
        for src in order:
            try:
                out = fn(src)
                self.active = src
                return out
            except SourceError as e:
                if e.status is not None and e.status not in (404, 405, 502, 503, 530) and not e.quota:
                    raise  # خطای واقعی آگهی (مثلاً ۴۲۹)، نه مشکل رسیدن به سرور
                self.errors[src.name] = str(e)
                # سرور واسط خطای شیپور را گاهی فقط در متن می‌آورد («404 Not Found: ...»)
                statuses.append(404 if e.status == 404 or (e.status is None and str(e).lstrip().startswith("404")) else e.status)
                last = e
        # هر دو راه «پیدا نشد» (۴۰۴) گفتند: آگهی در شیپور حذف شده است، نه اینکه سرور در دسترس نباشد؛
        # وضعیت ۴۰۴ حفظ می‌شود تا موتور آگهی را «حذف‌شده» علامت بزند و بی‌توقف ادامه دهد
        status = 404 if statuses and all(s == 404 for s in statuses) else None
        raise SourceError(" | ".join(f"{'واسط MCP' if k == 'sheypoor' else 'مستقیم'}: {v}" for k, v in self.errors.items()),
                          status=status) from last

    def categories(self):
        return self._run(lambda s: s.categories())

    def city_ref(self, city):
        return self._run(lambda s: s.city_ref(city))

    def search(self, city, category, page, cursor=None):
        return self._run(lambda s: s.search(city, category, page, cursor if s is self.direct else None))

    def detail(self, token):
        return self._run(lambda s: s.detail(token))

    def probe(self):
        info = self._run(lambda s: s.probe())
        return {**(info or {}), "روش": "سرور واسط MCP" if self.active is self.mcp else "اتصال مستقیم"}
