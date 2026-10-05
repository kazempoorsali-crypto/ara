"""منبع دوم آگهی: شیپور، از طریق سرور MCP عمومی sheypoor-mcp (github.com/FarhamAghdasi/sheypoor-mcp، MIT).

ابزارهای استفاده‌شده (فقط‌خواندنی، بدون ورود به حساب):
  list_provinces، list_cities(province)، search_categories(query)، get_category_tree(parentId)،
  search_listings(city, cityId, categoryId, sort, page)، get_listing(id)

خروجی summary و detail هم‌شکل منبع دیوار است تا موتور دریافت و ارزش‌گذاری بدون تغییر کار کند.
شمارهٔ تلفن فقط وقتی ذخیره می‌شود که شیپور آن را عمومی برگرداند؛ نمایشش در سایت با تنظیم پنل است.
"""
from __future__ import annotations

import re

from catalog import find_city, norm, parse_money_text
from divar_client import McpSource, SourceError

DEFAULT_SHEYPOOR_MCP = "https://sheypoor-mcp.farhamaghdasi.workers.dev/mcp"
PROVINCE_NAMES = {"gilan": "گیلان", "mazandaran": "مازندران", "golestan": "گلستان"}
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
            if e.status != 404:
                raise
            self.url = self.url[:-4] if self.url.rstrip("/").endswith("/mcp") else self.url.rstrip("/") + "/mcp"
            self.session = None
            super().connect()

    # ---------------------------------------------------------- نگاشت شهر و دسته
    def _cache(self):
        return (self.store.get_setting("sheypoor_map") if self.store else None) or {}

    def _save(self, m):
        if self.store:
            self.store.set_setting("sheypoor_map", m)

    def city_ref(self, city: dict) -> dict | None:
        m = self._cache()
        if city["key"] in m.get("cities", {}):
            return m["cities"][city["key"]]
        if m.get("cities_done"):
            return None
        cities = m.setdefault("cities", {})
        provinces = _list(self.call("list_provinces", {}), "provinces")
        for pkey, pname in PROVINCE_NAMES.items():
            prov = next((p for p in provinces if pname in norm(p.get("name"))), None)
            arg = (prov or {}).get("slug") or pname
            res = self.call("list_cities", {"province": arg})
            for c in _list(res, "cities"):
                hit = find_city(c.get("name"))
                if hit and norm(hit["name"]).replace(" ", "") == norm(c.get("name")).replace(" ", ""):
                    cities[hit["key"]] = {"id": c.get("id"), "slug": c.get("slug"), "name": c.get("name")}
        m["cities_done"] = True
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
                "phone": it.get("phone"), "category_text": cat["name"], "raw": it,
            })
        total, per = payload.get("total") or 0, payload.get("items_per_page") or 24
        has_next = bool(rows) and (page * per < total if total else len(rows) >= per) and page < 50
        return {"rows": rows, "has_next": has_next, "cursor": None}

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
            "attributes": attrs, "images": [i for i in d.get("images") or [] if isinstance(i, str)],
            "category_text": crumbs, "city_name": city["name"] if city else None,
            "district": _split_location(loc, city) if city else None, "address": loc or None,
            "latlng": None, "price": money["price"], "deposit": money["deposit"], "rent": money["rent"],
            "seller_type": "business" if d.get("shop_profile") else "personal",
            "phone": d.get("phone"), "url": d.get("url"),
        }

    def probe(self):
        self.connect()
        return {"tools": self.tools, "categories": len(self.categories())}
