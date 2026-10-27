#!/usr/bin/env python3
"""Tehran Stock Exchange data layer for the bourse-ir skill.

Fetches from TSETMC (cdn.tsetmc.com JSON API, falling back to the older
old.tsetmc.com text endpoints), caches every response under bourse/cache,
adjusts daily prices for capital increases and dividends, and imports CSV or
Excel exports (TSETMC, Rahavard, or any file with date/OHLC/volume columns)
when the live site is unreachable.

Usage:
  tse.py check                      # can this machine reach TSETMC and Codal?
  tse.py search فزر                  # candidate instruments with their insCode
  tse.py history فزر [--raw] [--n 30]
  tse.py flow فزر [--n 20]           # real (حقیقی) vs institutional (حقوقی) money
  tse.py info فزر
  tse.py import-csv FILE --symbol فزر   # load an exported file for offline use

Every command takes --ins INSCODE to skip the symbol search, --offline to use
the cache only, and --json for machine output. Standard library only.
"""
import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

CDN = "https://cdn.tsetmc.com/api"
OLD = "http://old.tsetmc.com/tsev2/data"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
STATE_DIR = os.environ.get("BOURSE_DIR", "bourse")
CACHE_DIR = os.path.join(STATE_DIR, "cache")

TTL_LIVE = 15 * 60
TTL_DAILY = 6 * 3600
TTL_STATIC = 7 * 86400


class FetchError(RuntimeError):
    pass


class ShapeError(RuntimeError):
    """The site answered, but not in the shape this code expects."""


# ---------------------------------------------------------------- text

_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_LETTERS = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک", "ۀ": "ه", "ة": "ه", "‌": " ", "‏": "", "‎": ""})


def norm(s):
    """Normalise Persian/Arabic letter variants, digits and spaces for matching."""
    s = str(s or "").translate(_DIGITS).translate(_LETTERS)
    return re.sub(r"\s+", " ", s).strip()


def to_num(x):
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return float(x)
    s = norm(x).replace(",", "").replace("٬", "").replace("،", "")
    if s in ("", "-", "--", "null", "None"):
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()")
    try:
        v = float(s)
    except ValueError:
        return None
    return -v if neg else v


# ---------------------------------------------------------------- Jalali calendar

def g2j(gy, gm, gd):
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = 355666 + 365 * gy + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400 + gd + g_d_m[gm - 1]
    jy = -1595 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    if days < 186:
        return jy, 1 + days // 31, 1 + days % 31
    return jy, 7 + (days - 186) // 30, 1 + (days - 186) % 30


def j2g(jy, jm, jd):
    jy += 1595
    days = -355668 + 365 * jy + (jy // 33) * 8 + ((jy % 33) + 3) // 4 + jd
    days += (jm - 1) * 31 if jm < 7 else (jm - 7) * 30 + 186
    gy = 400 * (days // 146097)
    days %= 146097
    if days > 36524:
        days -= 1
        gy += 100 * (days // 36524)
        days %= 36524
        if days >= 365:
            days += 1
    gy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        gy += (days - 1) // 365
        days = (days - 1) % 365
    gd = days + 1
    leap = (gy % 4 == 0 and gy % 100 != 0) or gy % 400 == 0
    months = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    gm = 1
    for m in months:
        if gd <= m:
            break
        gd -= m
        gm += 1
    return gy, gm, gd


def jdate(yyyymmdd):
    """20241020 -> '1403/07/29'."""
    d = int(yyyymmdd)
    jy, jm, jd = g2j(d // 10000, d // 100 % 100, d % 100)
    return f"{jy:04d}/{jm:02d}/{jd:02d}"


def parse_date(s):
    """Any of 20241020, 2024-10-20, 14030729, 1403/07/29 -> gregorian int yyyymmdd."""
    t = norm(s)
    m = re.match(r"^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})", t)
    if m:
        y, mo, d = (int(g) for g in m.groups())
    elif re.match(r"^\d{8}$", t):
        y, mo, d = int(t[:4]), int(t[4:6]), int(t[6:8])
    else:
        return None
    if y < 1700:
        y, mo, d = j2g(y, mo, d)
    return y * 10000 + mo * 100 + d


# ---------------------------------------------------------------- HTTP + cache

def http_get(url, timeout=20, retries=3):
    host = urllib.parse.urlsplit(url).netloc
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
                "Referer": "https://www.tsetmc.com/" if "tsetmc" in host else "https://codal.ir/",
            })
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # network errors of every kind end the same way
            last = e
            if i + 1 < retries:
                time.sleep(1.5 * (i + 1))
    raise FetchError(f"دسترسی به {host} ممکن نشد ({last.__class__.__name__}: {last})")


def _cache_path(key):
    safe = re.sub(r"[^0-9A-Za-z_.\-]+", "_", key)
    if safe.strip("_.") != key.strip("_."):  # Persian keys: keep them unique and readable on disk
        safe = re.sub(r"[\\/:*?\"<>|\s]+", "_", key)
    return os.path.join(CACHE_DIR, safe + ".json")


def cached(key, ttl, fetch, offline=False):
    """Return (data, age_seconds). fetch() is called when the cache is stale."""
    path = _cache_path(key)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            blob = json.load(f)
        age = time.time() - blob.get("ts", 0)
        if offline or age < ttl:
            return blob["data"], age
    elif offline:
        raise FetchError(f"در حالت آفلاین داده‌ای برای «{key}» در {CACHE_DIR} نیست")
    try:
        data = fetch()
    except FetchError:
        if os.path.exists(path):  # stale beats nothing; the caller reports the age
            with open(path, encoding="utf-8") as f:
                blob = json.load(f)
            return blob["data"], time.time() - blob.get("ts", 0)
        raise
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"ts": time.time(), "data": data}, f, ensure_ascii=False)
    return data, 0.0


def get_json(url):
    text = http_get(url)
    try:
        return json.loads(text)
    except ValueError:
        raise ShapeError(f"پاسخ {url} JSON نیست: {text[:120]!r}")


# ---------------------------------------------------------------- instruments

def _rank(item, q):
    sym = norm(item.get("symbol"))
    score = 0 if sym == q else (1 if sym.startswith(q) else 2)
    if item.get("inactive"):
        score += 3
    return score


def search(query, offline=False):
    q = norm(query)

    def fetch():
        out = []
        try:
            j = get_json(f"{CDN}/Instrument/GetInstrumentSearch/{urllib.parse.quote(q)}")
            for it in j.get("instrumentSearch") or []:
                out.append({
                    "insCode": str(it.get("insCode")),
                    "symbol": norm(it.get("lVal18AFC")),
                    "name": norm(it.get("lVal30")),
                    "market": it.get("flow"),
                    "inactive": bool(it.get("lastDate")) and str(it.get("lastDate")) not in ("0", ""),
                })
        except (FetchError, ShapeError):
            text = http_get(f"{OLD}/search.aspx?skey={urllib.parse.quote(q)}")
            for row in text.split(";"):
                p = row.split(",")
                if len(p) >= 3 and p[2].strip().isdigit():
                    out.append({"insCode": p[2].strip(), "symbol": norm(p[0]), "name": norm(p[1]),
                                "market": None, "inactive": False})
        if not out:
            raise ShapeError(f"جست‌وجوی «{q}» در TSETMC نتیجه‌ای نداد")
        return out

    items, _ = cached(f"search_{q}", TTL_STATIC, fetch, offline)
    return sorted(items, key=lambda it: _rank(it, q))


def resolve(symbol=None, ins=None, offline=False):
    """-> (insCode, symbol, name). Exact symbol match only; ambiguity is an error."""
    if ins:
        return str(ins), norm(symbol or ins), ""
    if not symbol:
        raise ShapeError("نماد یا --ins داده نشده است")
    if norm(symbol).startswith("csv:"):
        return norm(symbol), norm(symbol)[4:], "(از فایل واردشده)"
    if os.path.exists(_cache_path(f"history_csv:{norm(symbol)}")):
        return "csv:" + norm(symbol), norm(symbol), "(از فایل واردشده)"
    items = search(symbol, offline)
    exact = [it for it in items if norm(it["symbol"]) == norm(symbol)]
    if not exact:
        names = "، ".join(f"{it['symbol']} ({it['name']}) insCode={it['insCode']}" for it in items[:6])
        raise ShapeError(f"نماد «{symbol}» دقیقاً پیدا نشد. نزدیک‌ترین‌ها: {names}")
    live_ = [it for it in exact if not it["inactive"]] or exact
    it = live_[0]
    return it["insCode"], it["symbol"], it["name"]


# ---------------------------------------------------------------- daily prices

def _bar(date, o, h, l, c, last, yc, vol, val, cnt):
    return {"date": int(date), "open": o, "high": h, "low": l, "close": c, "last": last,
            "yclose": yc, "volume": vol, "value": val, "count": cnt}


def _check_bars(bars, src):
    if not bars:
        raise ShapeError(f"سابقهٔ قیمتی از {src} خالی است")
    ok = lambda b: b["low"] and b["high"] and b["close"] and 0 < b["low"] <= b["close"] <= b["high"]
    bad = sum(1 for b in bars if not ok(b))
    if bad > max(3, len(bars) // 10):
        raise ShapeError(f"ساختار پاسخ {src} با انتظار نمی‌خواند ({bad} ردیف از {len(bars)} ناسازگار)؛ "
                         "احتمالاً API تغییر کرده است. نگاشت فیلدها در references/data-sources.md است.")
    return [b for b in bars if ok(b)]


def _history_fetch(ins):
    bars = []
    try:
        j = get_json(f"{CDN}/ClosingPrice/GetClosingPriceDailyList/{ins}/0")
        for r in j.get("closingPriceDaily") or []:
            bars.append(_bar(r.get("dEven"), to_num(r.get("priceFirst")), to_num(r.get("priceMax")),
                             to_num(r.get("priceMin")), to_num(r.get("pClosing")), to_num(r.get("pDrCotVal")),
                             to_num(r.get("priceYesterday")), to_num(r.get("qTotTran5J")),
                             to_num(r.get("qTotCap")), to_num(r.get("zTotTran"))))
        src = "cdn.tsetmc.com"
        if not bars:
            raise ShapeError("closingPriceDaily خالی است")
    except (FetchError, ShapeError):
        bars = []
        text = http_get(f"{OLD}/InstTradeHistory.aspx?i={ins}&Top=999999&A=0")
        for row in text.split(";"):
            p = row.split("@")
            if len(p) >= 10 and p[0].strip().isdigit():
                # date@high@low@pClosing@last@first@yesterday@value@volume@count
                bars.append(_bar(p[0], to_num(p[5]), to_num(p[1]), to_num(p[2]), to_num(p[3]),
                                 to_num(p[4]), to_num(p[6]), to_num(p[8]), to_num(p[7]), to_num(p[9])))
        src = "old.tsetmc.com"
    bars = [b for b in bars if b["date"] and (b["volume"] or 0) > 0]
    bars.sort(key=lambda b: b["date"])
    return _check_bars(bars, src)


def adjust(bars, tol=0.001):
    """Back-adjust for capital increases and dividends.

    TSETMC sets a day's 'yesterday price' to the adjusted reference after a
    corporate action, so yclose[t] / close[t-1] != 1 marks one. Every earlier
    bar is scaled by that ratio; the latest bar keeps its real price.
    Returns (adjusted_bars, events).
    """
    out = [None] * len(bars)
    events = []
    f = 1.0
    for i in range(len(bars) - 1, -1, -1):
        b = bars[i]
        nb = dict(b)
        for k in ("open", "high", "low", "close", "last", "yclose"):
            if nb.get(k) is not None:
                nb[k] = nb[k] * f
        nb["factor"] = f
        out[i] = nb
        if i > 0:
            prev, yc = bars[i - 1]["close"], b.get("yclose")
            if prev and yc and abs(yc / prev - 1) > tol:
                ratio = yc / prev
                events.append({"date": b["date"], "jdate": jdate(b["date"]), "ratio": round(ratio, 6),
                               "before": prev, "reference": yc})
                f *= ratio
    events.reverse()
    return out, events


def history(ins, offline=False, adjusted=True):
    if str(ins).startswith("csv:"):
        bars, _ = cached(f"history_{ins}", 10 ** 12, lambda: None, offline=True)
    else:
        bars, _ = cached(f"history_{ins}", TTL_DAILY, lambda: _history_fetch(ins), offline)
    if not adjusted:
        return bars, []
    return adjust(bars)


# ---------------------------------------------------------------- real vs institutional money

_FLOW_KEYS = ["buy_I_Count", "buy_N_Count", "sell_I_Count", "sell_N_Count",
              "buy_I_Volume", "buy_N_Volume", "sell_I_Volume", "sell_N_Volume",
              "buy_I_Value", "buy_N_Value", "sell_I_Value", "sell_N_Value"]


def _flow_fetch(ins):
    rows = []
    try:
        j = get_json(f"{CDN}/ClientType/GetClientTypeHistory/{ins}")
        for r in j.get("clientType") or []:
            row = {"date": int(r.get("recDate"))}
            for k in _FLOW_KEYS:
                row[k] = to_num(r.get(k))
            rows.append(row)
        if not rows:
            raise ShapeError("clientType خالی است")
    except (FetchError, ShapeError):
        rows = []
        text = http_get(f"{OLD}/clienttype.aspx?i={ins}")
        for line in text.split(";"):
            p = line.split(",")
            if len(p) >= 13 and p[0].strip().isdigit():
                row = {"date": int(p[0])}
                for k, v in zip(_FLOW_KEYS, p[1:13]):
                    row[k] = to_num(v)
                rows.append(row)
    rows = [r for r in rows if r["buy_I_Value"] is not None]
    if not rows:
        raise ShapeError("دادهٔ حقیقی/حقوقی خالی است یا ساختارش تغییر کرده")
    rows.sort(key=lambda r: r["date"])
    return rows


def flow(ins, offline=False):
    if str(ins).startswith("csv:"):
        raise FetchError("برای فایل واردشده دادهٔ حقیقی/حقوقی وجود ندارد")
    rows, _ = cached(f"flow_{ins}", TTL_DAILY, lambda: _flow_fetch(ins), offline)
    return rows


# ---------------------------------------------------------------- instrument info, live price, order book

def _dig(d, *path):
    for p in path:
        if not isinstance(d, dict):
            return None
        d = d.get(p)
    return d


def info(ins, offline=False):
    if str(ins).startswith("csv:"):
        return {}

    def fetch():
        j = get_json(f"{CDN}/Instrument/GetInstrumentInfo/{ins}")
        i = j.get("instrumentInfo") or {}
        if not i:
            raise ShapeError("پاسخ GetInstrumentInfo خالی است")
        return {
            "symbol": norm(i.get("lVal18AFC")),
            "name": norm(i.get("lVal30")),
            "shares": to_num(i.get("zTitad")),
            "base_volume": to_num(i.get("baseVol")),
            "eps": to_num(_dig(i, "eps", "epsValue")),
            "eps_estimated": to_num(_dig(i, "eps", "estimatedEPS")),
            "sector_pe": to_num(_dig(i, "eps", "sectorPE")),
            "sector": norm(_dig(i, "sector", "lSecVal")),
            "market": norm(i.get("flowTitle")),
            "board": norm(i.get("cgrValCotTitle")),
            "limit_max": to_num(_dig(i, "staticThreshold", "psGelStaMax")),
            "limit_min": to_num(_dig(i, "staticThreshold", "psGelStaMin")),
            "max_order_volume": to_num(i.get("maxQOrd") or i.get("qTitMaxOrd")),
        }

    try:
        data, _ = cached(f"info_{ins}", TTL_DAILY, fetch, offline)
        return data
    except (FetchError, ShapeError):
        return {}


def live(ins, offline=False):
    """Today's prices and the top of the order book; {} when unavailable."""
    if str(ins).startswith("csv:"):
        return {}

    def fetch():
        j = get_json(f"{CDN}/ClosingPrice/GetClosingPriceInfo/{ins}")
        c = j.get("closingPriceInfo") or {}
        if not c:
            raise ShapeError("closingPriceInfo خالی است")
        out = {
            "last": to_num(c.get("pDrCotVal")), "close": to_num(c.get("pClosing")),
            "yclose": to_num(c.get("priceYesterday")), "open": to_num(c.get("priceFirst")),
            "high": to_num(c.get("priceMax")), "low": to_num(c.get("priceMin")),
            "volume": to_num(c.get("qTotTran5J")), "value": to_num(c.get("qTotCap")),
            "date": c.get("finalLastDate"), "time": c.get("hEven"),
        }
        try:
            bl = get_json(f"{CDN}/BestLimits/{ins}").get("bestLimits") or []
            top = min(bl, key=lambda r: r.get("number", 99)) if bl else {}
            out.update({"bid": to_num(top.get("pMeDem")), "bid_vol": to_num(top.get("qTitMeDem")),
                        "ask": to_num(top.get("pMeOf")), "ask_vol": to_num(top.get("qTitMeOf"))})
        except (FetchError, ShapeError):
            pass
        return out

    try:
        data, age = cached(f"live_{ins}", TTL_LIVE, fetch, offline)
        data["age_min"] = round(age / 60, 1)
        return data
    except (FetchError, ShapeError):
        return {}


def queue_state(lv, inf):
    """'صف خرید' / 'صف فروش' / None from the order book and today's limits."""
    hi, lo = inf.get("limit_max"), inf.get("limit_min")
    if not lv or not hi or not lo:
        return None
    if lv.get("bid") and abs(lv["bid"] - hi) < 0.5 and not lv.get("ask"):
        return "صف خرید"
    if lv.get("ask") and abs(lv["ask"] - lo) < 0.5 and not lv.get("bid"):
        return "صف فروش"
    return None


def market_universe(offline=False):
    """Every listed share on TSE and IFB: [{insCode, symbol, name, isin}]."""
    def fetch():
        text = http_get(f"{OLD}/MarketWatchPlus.aspx?h=0&r=0", timeout=40)
        parts = text.split("@")
        if len(parts) < 3:
            raise ShapeError("ساختار MarketWatchPlus تغییر کرده است")
        out = []
        for row in parts[2].split(";"):
            p = row.split(",")
            if len(p) > 4 and p[0].strip().isdigit():
                isin = p[1].strip()
                # IRO1 = Tehran Stock Exchange shares, IRO3 = Farabourse shares; funds, rights and bonds are excluded.
                if isin.startswith(("IRO1", "IRO3")):
                    out.append({"insCode": p[0].strip(), "isin": isin, "symbol": norm(p[2]), "name": norm(p[3])})
        if not out:
            raise ShapeError("دیده‌بان بازار هیچ سهمی برنگرداند")
        return out

    data, _ = cached("universe", TTL_DAILY, fetch, offline)
    return data


# ---------------------------------------------------------------- CSV / Excel import

_COLS = {
    "date": ["dtyyyymmdd", "date", "تاریخ", "تاریخ میلادی", "gregorian", "jdate", "تاریخ شمسی"],
    "open": ["first", "open", "اولین", "اولین قیمت", "بازگشایی", "قیمت اولین"],
    "high": ["high", "max", "بیشترین", "بیشترین قیمت", "حداکثر"],
    "low": ["low", "min", "کمترین", "کمترین قیمت", "حداقل"],
    "close": ["close", "adjclose", "adj close", "final", "پایانی", "قیمت پایانی", "closing"],
    "last": ["last", "آخرین", "آخرین قیمت", "آخرین معامله"],
    "yclose": ["yesterday", "قیمت دیروز", "دیروز"],
    "volume": ["vol", "volume", "حجم", "حجم معاملات"],
    "value": ["value", "ارزش", "ارزش معاملات"],
    "count": ["count", "openint", "تعداد", "تعداد معاملات"],
}


def _header_key(h):
    h = norm(h).lower().strip("<> ").replace("_", " ")
    for key, names in _COLS.items():
        if h in names:
            return key
    return None


def _read_table(path):
    if path.lower().endswith((".xlsx", ".xlsm")):
        try:
            import openpyxl
        except ImportError:
            raise SystemExit("برای خواندن Excel بستهٔ openpyxl لازم است؛ یا فایل را CSV ذخیره کنید.")
        ws = openpyxl.load_workbook(path, read_only=True, data_only=True).active
        return [[("" if v is None else v) for v in r] for r in ws.iter_rows(values_only=True)]
    with open(path, encoding="utf-8-sig", newline="") as f:
        sample = f.read(4096)
        f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        return list(csv.reader(f, dialect))


def import_table(path, symbol):
    rows = _read_table(path)
    if not rows:
        raise SystemExit("فایل خالی است")
    keys = [_header_key(h) for h in rows[0]]
    need = {"date", "high", "low", "close"}
    if not need <= set(keys):
        raise SystemExit(f"ستون‌های لازم (تاریخ، بیشترین، کمترین، پایانی) شناخته نشد. سرستون‌ها: {rows[0]}")
    bars = []
    for r in rows[1:]:
        rec = {}
        for i, k in enumerate(keys):
            if k and i < len(r) and k not in rec:
                rec[k] = r[i]
        d = parse_date(rec.get("date"))
        if not d:
            continue
        c = to_num(rec.get("close"))
        bars.append(_bar(d, to_num(rec.get("open")) or c, to_num(rec.get("high")), to_num(rec.get("low")), c,
                         to_num(rec.get("last")) or c, to_num(rec.get("yclose")), to_num(rec.get("volume")) or 0,
                         to_num(rec.get("value")), to_num(rec.get("count"))))
    bars = [b for b in bars if b["close"] and b["high"] and b["low"]]
    bars.sort(key=lambda b: b["date"])
    # Without a 'yesterday' column, yesterday = previous close (no corporate-action adjustment possible).
    for i, b in enumerate(bars):
        if b["yclose"] is None:
            b["yclose"] = bars[i - 1]["close"] if i else b["open"]
    bars = _check_bars(bars, os.path.basename(path))
    key = f"history_csv:{norm(symbol)}"
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(_cache_path(key), "w", encoding="utf-8") as f:
        json.dump({"ts": time.time(), "data": bars}, f, ensure_ascii=False)
    return bars


# ---------------------------------------------------------------- reachability

def check():
    probes = [
        ("TSETMC (API جدید)", f"{CDN}/Instrument/GetInstrumentSearch/{urllib.parse.quote('فولاد')}"),
        ("TSETMC (نسخهٔ قدیم)", f"{OLD}/search.aspx?skey={urllib.parse.quote('فولاد')}"),
        ("کدال", "https://search.codal.ir/api/search/v2/q?Symbol=" + urllib.parse.quote("فولاد") + "&PageNumber=1"),
    ]
    res = []
    for name, url in probes:
        try:
            http_get(url, timeout=12, retries=1)
            res.append((name, True, ""))
        except FetchError as e:
            res.append((name, False, str(e)))
    return res


# ---------------------------------------------------------------- CLI

def _fmt(x, nd=0):
    if x is None:
        return "⛔"
    return f"{x:,.{nd}f}"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["check", "search", "history", "flow", "info", "import-csv"])
    ap.add_argument("arg", nargs="?")
    ap.add_argument("--ins")
    ap.add_argument("--symbol")
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--raw", action="store_true", help="unadjusted prices")
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)

    try:
        if a.cmd == "check":
            res = check()
            for name, ok, err in res:
                print(f"{'✓' if ok else '✗'} {name}" + ("" if ok else f" — {err}"))
            if not any(ok for _, ok, _ in res[:2]):
                print("\nTSETMC از این دستگاه در دسترس نیست. یا اسکیل را روی رایانه‌ای در ایران اجرا کنید، "
                      "یا خروجی سابقهٔ قیمت را از TSETMC/ره‌آورد بگیرید و با import-csv وارد کنید.")
                return 2
            return 0
        if a.cmd == "import-csv":
            if not a.arg or not a.symbol:
                ap.error("import-csv FILE --symbol SYMBOL")
            bars = import_table(a.arg, a.symbol)
            print(f"{len(bars)} روز از {jdate(bars[0]['date'])} تا {jdate(bars[-1]['date'])} برای «{norm(a.symbol)}» وارد شد.")
            return 0
        if a.cmd == "search":
            items = search(a.arg, a.offline)
            if a.json:
                print(json.dumps(items, ensure_ascii=False, indent=1))
            else:
                for it in items[:15]:
                    print(f"{it['symbol']}\t{it['name']}\tinsCode={it['insCode']}" + ("\t(غیرفعال)" if it["inactive"] else ""))
            return 0
        ins, sym, name = resolve(a.arg or a.symbol, a.ins, a.offline)
        if a.cmd == "history":
            bars, events = history(ins, a.offline, adjusted=not a.raw)
            if a.json:
                print(json.dumps({"symbol": sym, "insCode": ins, "bars": bars, "events": events}, ensure_ascii=False))
                return 0
            print(f"{sym} {name} — {len(bars)} روز معاملاتی، {'تعدیل‌شده' if not a.raw else 'تعدیل‌نشده'}")
            for b in bars[-a.n:]:
                print(f"{jdate(b['date'])}  باز {_fmt(b['open'])}  بیش {_fmt(b['high'])}  کم {_fmt(b['low'])}  "
                      f"پایانی {_fmt(b['close'])}  حجم {_fmt(b['volume'])}")
            for e in events[-5:]:
                print(f"رویداد شرکتی {e['jdate']}: ضریب تعدیل {e['ratio']}")
        elif a.cmd == "flow":
            rows = flow(ins, a.offline)
            if a.json:
                print(json.dumps(rows[-a.n:], ensure_ascii=False))
                return 0
            for r in rows[-a.n:]:
                net = (r["buy_I_Value"] or 0) - (r["sell_I_Value"] or 0)
                print(f"{jdate(r['date'])}  ورود پول حقیقی {_fmt(net / 1e10, 2)} میلیارد تومان")
        elif a.cmd == "info":
            print(json.dumps(info(ins, a.offline), ensure_ascii=False, indent=1))
    except (FetchError, ShapeError) as e:
        print(f"⛔ {e}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
