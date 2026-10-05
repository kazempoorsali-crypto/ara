"""موتور ارزش‌گذاری فرصت‌یاب.

مراحل (روی همه آگهی‌های فعال، هر بار از نو):
  ۱. پاک‌سازی: قیمت نمادین، بازارهای جدا (پیش‌فروش، مشارکت، معاوضه، دانگی، هم‌خانه)، آگهی تکراری
  ۲. خط پایه مکانی: میانه لگاریتم «قیمت هر متر» در محله، با انقباض به سمت میانه شهر و استان وقتی نمونه کم است
  ۳. پرت‌یابی مقاوم: فاصله از خط پایه با معیار MAD؛ تشخیص جداگانه اشتباه صفر (۱۰ یا ۱۰۰ برابر)
  ۴. مدل هدونیک: رگرسیون ریج روی باقی‌مانده لگاریتمی با ویژگی‌های ملک (سن، طبقه، آسانسور، پارکینگ، ...)
  ۵. قیمت منصفانه، درصد زیر/بالای قیمت، اطمینان، امتیاز ۰ تا ۱۰۰ و توضیح اثر هر ویژگی
فقط کتابخانه استاندارد پایتون؛ برای ده‌ها هزار آگهی چند ثانیه طول می‌کشد.
"""
from __future__ import annotations

import json
import math
import statistics
import time

from catalog import norm
from features import LABELS, kind_group

K_SHRINK = 8           # نمونه معادل برای انقباض میانه محله به میانه شهر
MAD_Z = 3.5            # آستانه پرت مقاوم
MIN_CITY = 5           # کمترین نمونه شهر برای رتبه‌دادن
MIN_MODEL = 60         # کمترین نمونه برای مدل هدونیک
RIDGE = 2.0
LN10 = math.log(10)

DEFAULT_WEIGHTS = {"discount": 60, "confidence": 15, "quality": 15, "momentum": 10}

FEATURE_SETS = {
    "apartment": ["age", "age2", "floor", "ground", "top", "log_area", "rooms_density", "elevator", "parking", "warehouse",
                  "balcony", "deed_single", "renovated", "lobby", "complex", "north", "seaview", "furnished", "units", "agency"],
    "villa": ["age", "log_area", "log_land", "seaview", "sea_close", "pool", "gated", "duplex", "forest", "deed_single", "furnished", "agency"],
    "land": ["log_area", "deed_single", "residential_use", "frontage", "seaview", "sea_close", "in_city", "agency"],
    "commercial": ["age", "log_area", "ground", "deed_single", "agency"],
}
FLAG_TEXT = {
    "placeholder": "قیمت نمادین یا توافقی", "presale": "پیش‌فروش (بازار جدا)", "partnership": "مشارکت در ساخت",
    "exchange": "معاوضه", "partial": "فروش دانگی", "shared": "اتاق یا هم‌خانه", "duplicate": "آگهی تکراری",
    "outlier_high": "قیمت به‌طور غیرعادی بالا", "outlier_low": "قیمت به‌طور غیرعادی پایین",
    "zero_typo": "احتمال اشتباه در تعداد صفرهای قیمت", "ppm_as_total": "احتمالاً قیمت هر متر به جای قیمت کل درج شده",
    "no_area": "متراژ نامشخص",
}


def value_of(l: dict):
    """مقدار قابل‌مقایسه: فروش ← قیمت هر متر؛ رهن و اجاره ← ودیعه معادل هر متر؛ روزانه ← اجاره هر شب."""
    if l["deal"] == "daily":
        return l.get("price") or None
    if not l.get("area") or l["area"] < 15:
        return None
    pp = l.get("pp")
    return pp / l["area"] if pp else None


def design_row(f: dict, kg: str) -> dict:
    """تبدیل ویژگی‌های خام به متغیرهای مدل (None یعنی ناموجود)."""
    age = f.get("age")
    area = f.get("area")
    fl, tot = f.get("floor"), f.get("floors_total")
    sd = f.get("sea_dist")
    x = {
        "age": age, "age2": (age * age / 40) if age is not None else None,
        "floor": min(fl, 15) if fl is not None else None,
        "ground": (1 if fl == 0 else 0) if fl is not None else None,
        "top": (1 if fl and tot and fl == tot and tot > 1 else 0) if fl is not None and tot else None,
        "log_area": math.log(area) if area else None,
        "rooms_density": (f["rooms"] / area * 100) if f.get("rooms") is not None and area else None,
        "log_land": math.log(f["land_area"]) if f.get("land_area") else None,
        "sea_close": (1 if sd <= 500 else 0) if sd is not None else None,
        "parking": min(f["parking"], 2) if f.get("parking") is not None else None,
        "units": min(f["units_per_floor"], 8) if f.get("units_per_floor") else None,
    }
    for k in ("elevator", "warehouse", "balcony", "deed_single", "renovated", "lobby", "complex", "north", "seaview",
              "furnished", "pool", "gated", "duplex", "forest", "residential_use", "frontage", "in_city", "agency"):
        if k not in x:
            x[k] = f.get(k)
    return {k: x.get(k) for k in FEATURE_SETS[kg]}


def ridge(X, y, lam):
    """حل (XᵀX + λI)β = Xᵀy با حذف گاوسی."""
    p = len(X[0])
    A = [[0.0] * p for _ in range(p)]
    b = [0.0] * p
    for row, yi in zip(X, y):
        for i in range(p):
            ri = row[i]
            if ri == 0:
                continue
            b[i] += ri * yi
            Ai = A[i]
            for j in range(p):
                Ai[j] += ri * row[j]
    for i in range(p):
        A[i][i] += lam
    for c in range(p):
        piv = max(range(c, p), key=lambda r: abs(A[r][c]))
        A[c], A[piv] = A[piv], A[c]
        b[c], b[piv] = b[piv], b[c]
        if abs(A[c][c]) < 1e-12:
            continue
        for r in range(c + 1, p):
            fct = A[r][c] / A[c][c]
            if fct:
                for k in range(c, p):
                    A[r][k] -= fct * A[c][k]
                b[r] -= fct * b[c]
    beta = [0.0] * p
    for i in range(p - 1, -1, -1):
        s = b[i] - sum(A[i][k] * beta[k] for k in range(i + 1, p))
        beta[i] = s / A[i][i] if abs(A[i][i]) > 1e-12 else 0.0
    return beta


def fit_model(rows, kg):
    """rows: [(xdict, residual)] ← مدل استانداردشده با متغیرهای دارای پوشش کافی."""
    feats = [k for k in FEATURE_SETS[kg] if sum(1 for x, _ in rows if x.get(k) is not None) >= max(15, len(rows) * 0.15)]
    if not feats:
        return None
    stats_ = {}
    for k in feats:
        vals = [x[k] for x, _ in rows if x.get(k) is not None]
        mu = statistics.fmean(vals)
        sd = statistics.pstdev(vals) or 1.0
        stats_[k] = (mu, sd)
    X = [[((x[k] if x.get(k) is not None else stats_[k][0]) - stats_[k][0]) / stats_[k][1] for k in feats] for x, _ in rows]
    y = [r for _, r in rows]
    beta = ridge(X, y, RIDGE * len(feats))
    pred = [sum(b * v for b, v in zip(beta, row)) for row in X]
    ss_tot = sum(v * v for v in y) or 1e-9
    ss_res = sum((a - b) ** 2 for a, b in zip(y, pred))
    return {"feats": feats, "stats": stats_, "beta": beta, "r2": max(0.0, 1 - ss_res / ss_tot), "n": len(rows),
            "sd": math.sqrt(ss_res / max(1, len(rows) - len(feats)))}


def apply_model(m, x):
    contrib = {}
    total = 0.0
    for k, b in zip(m["feats"], m["beta"]):
        if x.get(k) is None:
            continue
        mu, sd = m["stats"][k]
        c = b * (x[k] - mu) / sd
        total += c
        contrib[k] = c
    return total, contrib


def _median(vals):
    return statistics.median(vals) if vals else None


def _mad(vals, med):
    return statistics.median([abs(v - med) for v in vals]) if vals else 0


def recompute(store, weights: dict | None = None) -> dict:
    t0 = time.time()
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    rows = [store.row_to_dict(r) for r in store.q("SELECT * FROM listings WHERE status='active' AND vertical='estate'")]
    now = time.time()
    disp: dict = {}
    for l in rows:
        l["_kg"] = kind_group(l.get("kind"))
        l["_flags"] = list((l.get("feat") or {}).get("market_flags", []))
        l["_district"] = norm(l.get("district") or "").replace(" ", "") or None
        if l["_district"]:
            disp.setdefault(l["_district"], {}).setdefault(l["district"], 0)
            disp[l["_district"]][l["district"]] += 1
        v = value_of(l)
        l["_v"] = math.log(v) if v and v > 0 else None
        if l.get("negotiable") or (l.get("pp") or 0) < (5e4 if l["deal"] == "daily" else 1e6):
            l["_flags"].append("placeholder")
        elif l["deal"] != "daily" and not l.get("area"):
            l["_flags"].append("no_area")
        if l["deal"] == "sale" and l.get("pp") and l.get("area") and l["pp"] < 2e8 and l["_kg"] in ("apartment", "villa"):
            l["_flags"].append("ppm_as_total")  # کل قیمت کمتر از ۲۰۰ میلیون برای خانه = احتمالاً قیمت هر متر

    # آگهی تکراری: همان شهر، نوع، معامله، متراژ و قیمت
    seen = {}
    for l in sorted(rows, key=lambda l: (-(len(l.get("images") or [])), l.get("first_seen") or 0)):
        if l["_v"] is None:
            continue
        key = (l["city_key"], l["_kg"], l["deal"], l.get("area"), round((l.get("pp") or 0) / 1e6))
        if key in seen:
            l["_flags"].append("duplicate")
        else:
            seen[key] = l["id"]

    overrides = set(store.get_setting("overrides") or [])  # آگهی‌هایی که مدیر دستی تأیید کرده
    for l in rows:
        if l["id"] in overrides:
            l["_flags"] = []
    usable = lambda l: l["_v"] is not None and not l["_flags"]
    groups: dict = {}
    for l in rows:
        groups.setdefault((l["province"], l["_kg"], l["deal"]), []).append(l)

    market = []
    models_info = []
    for (prov, kg, deal), items in groups.items():
        # دو دور: خط پایه ← پرت‌یابی ← خط پایه دوباره بدون پرت‌ها
        for _round in range(2):
            clean = [l for l in items if usable(l)]
            prov_med = _median([l["_v"] for l in clean])
            if prov_med is None:
                break
            city_vals, dist_vals = {}, {}
            for l in clean:
                city_vals.setdefault(l["city_key"], []).append(l["_v"])
                if l["_district"]:
                    dist_vals.setdefault((l["city_key"], l["_district"]), []).append(l["_v"])
            city_base = {}
            for ck, vals in city_vals.items():
                n = len(vals)
                city_base[ck] = ((_median(vals) * n + prov_med * K_SHRINK) / (n + K_SHRINK), n)
            for l in items:
                cb, cn = city_base.get(l["city_key"], (prov_med, 0))
                dv = dist_vals.get((l["city_key"], l["_district"])) if l["_district"] else None
                dn = len(dv) if dv else 0
                base = (_median(dv) * dn + cb * K_SHRINK) / (dn + K_SHRINK) if dn else cb
                l["_base"], l["_cn"], l["_dn"] = base, cn, dn
            if _round == 0:
                res = [l["_v"] - l["_base"] for l in clean]
                med = _median(res) or 0
                mad = _mad(res, med) or 0.15
                for l in items:
                    if l["_v"] is None or "placeholder" in l["_flags"] or l["id"] in overrides:
                        continue
                    r = l["_v"] - l["_base"]
                    z = 0.6745 * (r - med) / mad
                    if abs(z) > MAD_Z:
                        if min(abs(r - LN10), abs(r + LN10), abs(r - 2 * LN10), abs(r + 2 * LN10)) < 0.35:
                            l["_flags"].append("zero_typo")
                        else:
                            l["_flags"].append("outlier_high" if z > 0 else "outlier_low")

        # مدل هدونیک: سطح شهر اگر نمونه کافی باشد، وگرنه استان
        clean = [l for l in items if usable(l) and l.get("_base") is not None]
        by_city = {}
        for l in clean:
            by_city.setdefault(l["city_key"], []).append(l)
        prov_model = fit_model([(design_row(l.get("feat") or {}, kg), l["_v"] - l["_base"]) for l in clean], kg) if len(clean) >= MIN_MODEL else None
        city_models = {ck: fit_model([(design_row(l.get("feat") or {}, kg), l["_v"] - l["_base"]) for l in ls], kg)
                       for ck, ls in by_city.items() if len(ls) >= MIN_MODEL}
        if prov_model:
            models_info.append({"scope": prov, "kind": kg, "deal": deal, "n": prov_model["n"], "r2": round(prov_model["r2"], 3),
                                "effects": {LABELS.get(k, k): round(b, 4) for k, b in zip(prov_model["feats"], prov_model["beta"])}})
        for ck, m in city_models.items():
            if m:
                models_info.append({"scope": ck, "kind": kg, "deal": deal, "n": m["n"], "r2": round(m["r2"], 3),
                                    "effects": {LABELS.get(k, k): round(b, 4) for k, b in zip(m["feats"], m["beta"])}})

        for l in items:
            l["_fair"] = None
            if l.get("_base") is None or l["_v"] is None:
                continue
            model = city_models.get(l["city_key"]) or prov_model
            x = design_row(l.get("feat") or {}, kg)
            adj, contrib = (apply_model(model, x) if model else (0.0, {}))
            adj = max(-0.6, min(0.6, adj))
            fair_v = math.exp(l["_base"] + adj)
            l["_fair_v"] = fair_v
            l["_fair"] = fair_v if deal == "daily" else fair_v * l["area"]
            merged = {}
            for k, c in contrib.items():  # سن و مجذور سن یک برچسب دارند
                merged[LABELS.get(k, k)] = merged.get(LABELS.get(k, k), 0) + c
            l["_contrib"] = sorted(((lab, round(math.exp(c) - 1, 3)) for lab, c in merged.items() if abs(c) >= 0.01),
                                   key=lambda t: -abs(t[1]))[:6]
            l["_model"] = {"n": model["n"], "r2": round(model["r2"], 2)} if model else None

        # جدول بازار هر محله
        cells = {}
        for l in items:
            if usable(l):
                cells.setdefault((l["city_key"], l["_district"] or ""), []).append(math.exp(l["_v"]))
        for (ck, dist), vals in cells.items():
            vals.sort()
            n = len(vals)
            dname = max(disp[dist].items(), key=lambda t: t[1])[0] if dist else ""
            market.append((ck, dname, kg, deal, n, statistics.median(vals), vals[int(n * 0.25)], vals[min(n - 1, int(n * 0.75))]))

    # امتیاز و ذخیره
    updates = []
    for l in rows:
        flags = l["_flags"]
        excluded = 1 if flags else 0
        fair = l.get("_fair")
        ask = l.get("price") if l["deal"] == "daily" else l.get("pp")
        discount = (fair - ask) / fair if fair and ask and not excluded else None
        cn, dn = l.get("_cn", 0), l.get("_dn", 0)
        feat = l.get("feat") or {}
        filled = sum(1 for k in FEATURE_SETS[l["_kg"]] if design_row(feat, l["_kg"]).get(k) is not None) / len(FEATURE_SETS[l["_kg"]])
        if discount is None or cn < MIN_CITY:
            conf, score = None, None
        else:
            conf = "high" if dn >= 15 and filled >= 0.5 else "medium" if cn >= 15 else "low"
            s_disc = max(0.0, min(100.0, 50 + discount * 250))
            s_conf = {"high": 100, "medium": 65, "low": 30}[conf]
            s_qual = min(100, (min(feat.get("photos", 0), 6) / 6) * 40 + (30 if feat.get("desc_len", 0) > 120 else 10 if feat.get("desc_len", 0) > 30 else 0) + filled * 30)
            days = (now - (l.get("first_seen") or now)) / 86400
            s_mom = min(100, (60 if (l.get("price_drop") or 0) > 0 else 0) + (40 if days < 3 else 20 if days < 10 else 0))
            tw = sum(w.values()) or 1
            score = round((s_disc * w["discount"] + s_conf * w["confidence"] + s_qual * w["quality"] + s_mom * w["momentum"]) / tw, 1)
            if discount > 0.4:  # تخفیف بیش از حد باورپذیر: احتیاط
                score = min(score, 60)
        explain = {"base_ppm": round(math.exp(l["_base"])) if l.get("_base") is not None else None,
                   "district_n": dn, "city_n": cn, "effects": l.get("_contrib", []), "model": l.get("_model"),
                   "flags": [FLAG_TEXT.get(f, f) for f in flags], "filled": round(filled, 2)}
        updates.append((round(l["_fair_v"]) if l.get("_fair_v") else None, round(fair) if fair else None,
                        round(discount, 4) if discount is not None else None, score, conf,
                        json.dumps(explain, ensure_ascii=False), excluded, json.dumps(flags), l["id"]))
    with store.lock:
        store.db.executemany("""UPDATE listings SET fair_ppm=?, fair_price=?, discount=?, score=?, confidence=?, explain=?,
                                excluded=?, flags=? WHERE id=?""", updates)
        store.db.execute("DELETE FROM market")
        store.db.executemany("INSERT INTO market VALUES(?,?,?,?,?,?,?,?)", market)
        store.db.commit()
    info = {"at": int(time.time()), "listings": len(rows), "excluded": sum(1 for u in updates if u[6]),
            "ranked": sum(1 for u in updates if u[3] is not None), "models": models_info, "seconds": round(time.time() - t0, 2)}
    store.set_setting("valuation_info", info)
    return info
