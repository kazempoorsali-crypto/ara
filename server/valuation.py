"""موتور ارزش‌گذاری فرصت‌یاب.

مراحل (روی همه آگهی‌های فعال، هر بار از نو):
  ۱. پاک‌سازی: قیمت نمادین، بازارهای جدا (پیش‌فروش، مشارکت، معاوضه، دانگی، هم‌خانه)، آگهی تکراری
  ۲. قیمت محله: میانهٔ لگاریتم «قیمت هر متر» آگهی‌های معتبر هم‌نوع همان محله (دست‌کم ۵ آگهی)؛
     میانهٔ شهر هرگز مبنای فرصت نیست و محلهٔ کم‌آگهی «در انتظار داده» می‌ماند
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
from features import LABELS, SIGNAL_TEXT, kind_group, settlement

MIN_DISTRICT = 5       # کمترین آگهی معتبر هم‌نوع در محله تا قیمت محله ساخته و آگهی سنجیده شود
MAD_Z = 3.5            # آستانه پرت مقاوم
MIN_MODEL = 60         # کمترین نمونه برای مدل هدونیک
RIDGE = 2.0
LN10 = math.log(10)

# آستانه‌ها (قابل تنظیم در پنل): فرصت، فرصت طلایی، مشکوک، و ضریب پراکندگی محله
DEFAULT_THRESHOLDS = {"opp": 0.15, "gold": 0.22, "sus": 0.40, "sus_flagged": 0.25, "disp_k": 1.0}
SUS_FLAGS = {"outlier_low", "too_cheap", "cheap_flagged", "scam_text", "ppm_as_total", "zero_typo_low"}

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
    "no_area": "متراژ نامشخص", "zero_typo_low": "احتمال جاافتادن صفر در قیمت",
    "too_cheap": "بیش از حد ارزان‌تر از قیمت محله؛ باورپذیر نیست",
    "cheap_flagged": "خیلی ارزان، همراه با نشانهٔ مشکوک در متن آگهی",
    "scam_text": "ارزان، همراه با متن مشکوک",
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


def recompute(store, thresholds: dict | None = None) -> dict:
    t0 = time.time()
    th = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
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
            city_med = {ck: _median(v) for ck, v in city_vals.items()}
            for l in items:
                # قیمت محله فقط از آگهی‌های همان محله؛ هیچ انقباضی به سمت میانهٔ شهر نیست
                dv = dist_vals.get((l["city_key"], l["_district"])) if l["_district"] else None
                dn = len(dv) if dv else 0
                l["_base"] = _median(dv) if dn >= MIN_DISTRICT else None
                l["_dn"], l["_cn"] = dn, len(city_vals.get(l["city_key"], []))
                l["_cmed"] = city_med.get(l["city_key"], prov_med)
            if _round == 0:
                res = [l["_v"] - l["_base"] for l in clean if l["_base"] is not None]
                med = _median(res) or 0
                mad = _mad(res, med) or 0.15
                for l in items:
                    if l["_v"] is None or "placeholder" in l["_flags"] or l["id"] in overrides:
                        continue
                    if l["_base"] is not None:
                        r = l["_v"] - l["_base"]
                        z = 0.6745 * (r - med) / mad
                        typo = min(abs(r - LN10), abs(r + LN10), abs(r - 2 * LN10), abs(r + 2 * LN10)) < 0.35
                        if abs(z) > MAD_Z:
                            if typo:
                                l["_flags"].append("zero_typo" if r > 0 else "zero_typo_low")
                            else:
                                l["_flags"].append("outlier_high" if z > 0 else "outlier_low")
                    else:
                        # محلهٔ کم‌آگهی: فقط خطای آشکار ورود داده (۱۰ یا ۱۰۰ برابر) پاک‌سازی می‌شود، بدون سنجش فرصت
                        r = l["_v"] - l["_cmed"]
                        if abs(r) > 1.6 and min(abs(r - LN10), abs(r + LN10), abs(r - 2 * LN10), abs(r + 2 * LN10)) < 0.35:
                            l["_flags"].append("zero_typo" if r > 0 else "zero_typo_low")

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

        # پراکندگی عادی قیمت در هر محله: MAD باقی‌مانده‌ها پس از تعدیل، با انقباض به سمت شهر
        res_cell, res_city = {}, {}
        for l in items:
            if l.get("_fair_v") and l["_v"] is not None:
                l["_r"] = l["_v"] - math.log(l["_fair_v"])
                if usable(l):
                    res_cell.setdefault((l["city_key"], l["_district"] or ""), []).append(l["_r"])
                    res_city.setdefault(l["city_key"], []).append(l["_r"])
        for l in items:
            if l.get("_r") is None:
                continue
            rv = res_cell.get((l["city_key"], l["_district"] or ""), [])
            # پراکندگی عادی همان محله (بدون قرض گرفتن از شهر)
            l["_sigma"] = max(0.06, 1.4826 * _mad(rv, _median(rv))) if len(rv) >= 3 else 0.15
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

    # برچسب، قاعده‌های مشکوک و امتیاز
    dist_raw = {}
    for l in rows:
        if usable(l) and l.get("_base") is not None:
            dist_raw.setdefault((l["city_key"], l["_district"] or "", l["_kg"], l["deal"]), []).append(math.exp(l["_v"]))
    for l in rows:
        flags = l["_flags"]
        fair = l.get("_fair")
        ask = l.get("price") if l["deal"] == "daily" else l.get("pp")
        l["_disc"] = (fair - ask) / fair if fair and ask else None
        d = l["_disc"]
        sig = (l.get("feat") or {}).get("sus") or []
        if not flags and d is not None and l.get("_base") is not None and l["id"] not in overrides:
            if d >= th["sus"]:
                flags.append("too_cheap")
            elif d >= th["sus_flagged"] and set(sig) & {"fake_photos", "multi_price"}:
                flags.append("cheap_flagged")
            elif d >= th["opp"] and "scam" in sig:
                flags.append("scam_text")
        if flags:
            l["_label"] = "sus" if set(flags) & SUS_FLAGS else "excluded"
        elif d is None or l.get("_base") is None:
            l["_label"] = "pending"
        else:
            outside = -(l.get("_r") or 0) >= th["disp_k"] * (l.get("_sigma") or 0.15)
            l["_label"] = ("gold" if d >= th["gold"] and outside else "good" if d >= th["opp"] and outside
                           else "high" if d <= -th["opp"] else "fair")
            l["_wide"] = d >= th["opp"] and not outside
    opp_cells = {}
    for l in rows:
        if l["_label"] in ("gold", "good"):
            opp_cells.setdefault((l["city_key"], l["_district"] or "", l["_kg"], l["deal"]), []).append(l)
    for ls in opp_cells.values():
        ls.sort(key=lambda l: -l["_disc"])
        for i, l in enumerate(ls):
            l["_rank"], l["_rank_n"] = i + 1, len(ls)

    updates = []
    for l in rows:
        flags, label, d = l["_flags"], l["_label"], l["_disc"]
        excluded = 1 if flags else 0
        fair = l.get("_fair")
        cn, dn = l.get("_cn", 0), l.get("_dn", 0)
        feat = l.get("feat") or {}
        filled = sum(1 for k in FEATURE_SETS[l["_kg"]] if design_row(feat, l["_kg"]).get(k) is not None) / len(FEATURE_SETS[l["_kg"]])
        conf, score = None, None
        if label in ("gold", "good", "fair", "high"):
            conf = "high" if dn >= 15 and filled >= 0.5 else "medium" if dn >= 8 else "low"
            if label in ("gold", "good"):
                p_rank = (l["_rank_n"] - l["_rank"] + 1) / l["_rank_n"]
                depth = max(0.0, min(1.0, (d - th["opp"]) / max(0.01, th["sus"] - th["opp"])))
                score = round(65 + 35 * (0.5 * p_rank + 0.5 * depth), 1)
            else:
                score = round(max(0.0, min(64.0, 50 + d / th["opp"] * 14)), 1)
        raw = dist_raw.get((l["city_key"], l["_district"] or "", l["_kg"], l["deal"])) or []
        explain = {"base_ppm": round(math.exp(l["_base"])) if l.get("_base") is not None else None,
                   "district_n": dn, "city_n": cn, "effects": l.get("_contrib", []), "model": l.get("_model"),
                   "flags": [FLAG_TEXT.get(f, f) for f in flags], "filled": round(filled, 2), "label": label,
                   "district_median": round(statistics.median(raw)) if len(raw) >= 3 else None, "district_raw_n": len(raw),
                   "adj": round(l["_fair_v"] / math.exp(l["_base"]) - 1, 3) if l.get("_fair_v") and l.get("_base") is not None else None,
                   "sigma": round(l["_sigma"], 3) if l.get("_sigma") else None, "wide": bool(l.get("_wide")),
                   "rank": l.get("_rank"), "rank_n": l.get("_rank_n"),
                   "ctx": [SIGNAL_TEXT[k] for k in feat.get("ctx", []) if k in SIGNAL_TEXT],
                   "caution": [SIGNAL_TEXT[k] for k in feat.get("caution", []) if k in SIGNAL_TEXT],
                   "sus": [SIGNAL_TEXT[k] for k in feat.get("sus", []) if k in SIGNAL_TEXT]}
        updates.append((round(l["_fair_v"]) if l.get("_fair_v") else None, round(fair) if fair else None,
                        round(d, 4) if d is not None else None, score, conf,
                        json.dumps(explain, ensure_ascii=False), excluded, json.dumps(flags), label,
                        settlement(l.get("title"), l.get("description"), l.get("district"), feat), l["id"]))
    with store.lock:
        store.db.executemany("""UPDATE listings SET fair_ppm=?, fair_price=?, discount=?, score=?, confidence=?, explain=?,
                                excluded=?, flags=?, label=?, settlement=? WHERE id=?""", updates)
        store.db.execute("DELETE FROM market")
        store.db.executemany("INSERT INTO market VALUES(?,?,?,?,?,?,?,?)", market)
        store.db.commit()
    info = {"at": int(time.time()), "listings": len(rows), "excluded": sum(1 for u in updates if u[6]),
            "ranked": sum(1 for u in updates if u[3] is not None),
            "labels": {k: sum(1 for u in updates if u[8] == k) for k in ("gold", "good", "fair", "high", "pending", "sus", "excluded")},
            "thresholds": th, "models": models_info, "seconds": round(time.time() - t0, 2)}
    store.set_setting("valuation_info", info)
    return info
