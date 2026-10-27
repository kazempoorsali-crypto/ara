#!/usr/bin/env python3
"""Offline self-test for bourse-ir. No network: tse.http_get is replaced by
SYNTHETIC responses shaped like TSETMC and Codal. The numbers are generated
test data, not market data.

  python3 tests/selftest.py
"""
import contextlib
import datetime as dt
import io
import json
import os
import random
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scripts"))
TMP = tempfile.mkdtemp(prefix="bourse-selftest-")
os.environ["BOURSE_DIR"] = TMP

import tse  # noqa: E402

tse.STATE_DIR = TMP
tse.CACHE_DIR = os.path.join(TMP, "cache")
import analyze, plan, simulate, scan, codal, chart  # noqa: E402,E401

INS = "11111111111111111"
SYM = "تستي"  # Arabic yeh on purpose: must match a query typed with Persian ی


def synthetic_days(n=320, seed=3):
    rng = random.Random(seed)
    day = dt.date(2025, 1, 1)
    days, price = [], 10000.0
    for i in range(n):
        day += dt.timedelta(days=1 if day.weekday() != 2 else 3)
        yclose = price
        if i == 200:  # capital increase: reference price drops by a third
            yclose = round(price / 1.5)
        drift = 0.0015 if i > 150 else -0.0005
        ch = max(min(rng.gauss(drift, 0.02), 0.05), -0.05)
        close = round(yclose * (1 + ch))
        o = round(yclose * (1 + rng.uniform(-0.01, 0.01)))
        hi = max(o, close) * (1 + rng.uniform(0, 0.012))
        lo = min(o, close) * (1 - rng.uniform(0, 0.012))
        hi, lo = round(min(hi, yclose * 1.05)), round(max(lo, yclose * 0.95))
        o = min(max(o, lo), hi)
        close = min(max(close, lo), hi)
        if i in (290, 291):  # two locked limit-down days inside the last 60
            close = o = hi = lo = round(yclose * 0.95)
        vol = int(rng.uniform(1e6, 3e6)) * (3 if i == n - 1 else 1)
        days.append({"dEven": int(day.strftime("%Y%m%d")), "priceFirst": o, "priceMax": hi, "priceMin": lo,
                     "pClosing": close, "pDrCotVal": close, "priceYesterday": yclose,
                     "qTotTran5J": vol, "qTotCap": vol * close, "zTotTran": 500})
        price = close
    return days


DAYS = synthetic_days()


def client_rows():
    rng = random.Random(5)
    out = []
    for r in DAYS:
        bi, si = rng.uniform(5e9, 2e10), rng.uniform(5e9, 2e10)
        out.append({"recDate": r["dEven"], "buy_I_Count": rng.randint(100, 900), "sell_I_Count": rng.randint(100, 900),
                    "buy_N_Count": 3, "sell_N_Count": 2, "buy_I_Volume": 1, "buy_N_Volume": 1, "sell_I_Volume": 1,
                    "sell_N_Volume": 1, "buy_I_Value": bi, "sell_I_Value": si, "buy_N_Value": si * 0.3, "sell_N_Value": bi * 0.3})
    return out


def fake_http(url, timeout=20, retries=3):
    if "GetInstrumentSearch" in url:
        return json.dumps({"instrumentSearch": [
            {"insCode": "999", "lVal18AFC": SYM + "ح", "lVal30": "حق تقدم", "flow": 1, "lastDate": 0},
            {"insCode": INS, "lVal18AFC": SYM, "lVal30": "شركت تست سنتتيک", "flow": 1, "lastDate": 0}]})
    if "GetClosingPriceDailyList" in url:
        return json.dumps({"closingPriceDaily": list(reversed(DAYS))})
    if "GetClientTypeHistory" in url:
        return json.dumps({"clientType": client_rows()})
    if "GetInstrumentInfo" in url:
        last = DAYS[-1]["pClosing"]
        return json.dumps({"instrumentInfo": {"lVal18AFC": SYM, "lVal30": "شركت تست سنتتيک", "zTitad": 1e9,
                                              "baseVol": 500000, "eps": {"epsValue": 900, "sectorPE": 7.5},
                                              "sector": {"lSecVal": "گروه آزمایشی"}, "flowTitle": "بورس",
                                              "staticThreshold": {"psGelStaMax": round(last * 1.05),
                                                                  "psGelStaMin": round(last * 0.95)}}})
    if "GetClosingPriceInfo" in url:
        r = DAYS[-1]
        return json.dumps({"closingPriceInfo": {"pDrCotVal": r["pDrCotVal"], "pClosing": r["pClosing"],
                                                "priceYesterday": r["priceYesterday"], "priceFirst": r["priceFirst"],
                                                "priceMax": r["priceMax"], "priceMin": r["priceMin"]}})
    if "BestLimits" in url:
        return json.dumps({"bestLimits": [{"number": 1, "pMeDem": DAYS[-1]["pClosing"] - 10, "qTitMeDem": 1000,
                                           "pMeOf": DAYS[-1]["pClosing"] + 10, "qTitMeOf": 800}]})
    if "search.codal.ir" in url:
        return json.dumps({"Total": 3, "Letters": [
            {"Symbol": SYM, "CompanyName": "تست", "Title": "گزارش فعالیت ماهانه دوره ۱ ماهه منتهی به ۱۴۰۵/۰۷/۳۰",
             "PublishDateTime": "۱۴۰۵/۰۸/۰۵ ۱۸:۲۰:۰۰", "Url": "/Reports/Decision.aspx?LetterSerial=abc"},
            {"Symbol": SYM, "CompanyName": "تست", "Title": "اطلاعات و صورت‌های مالی میاندوره‌ای ۶ ماهه",
             "PublishDateTime": "۱۴۰۵/۰۷/۲۰ ۱۰:۰۰:۰۰", "Url": "/Reports/Decision.aspx?LetterSerial=def"},
            {"Symbol": SYM, "CompanyName": "تست", "Title": "آگهی دعوت به مجمع عمومی عادی سالیانه",
             "PublishDateTime": "۱۴۰۵/۰۴/۰۱ ۰۹:۰۰:۰۰", "Url": "/Reports/Decision.aspx?LetterSerial=ghi"}]})
    if "MarketWatchPlus" in url:
        return f"header@x@{INS},IRO1TST00001,{SYM},تست,1;222,IRT1FND00001,صندوق,صندوق,1@rest"
    raise tse.FetchError(f"synthetic server has no route for {url}")


tse.http_get = fake_http
ok = 0


def check(cond, msg):
    global ok
    if not cond:
        raise AssertionError(msg)
    ok += 1


def quiet(fn, *a):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = fn(*a)
    return rc, buf.getvalue()


# Jalali: Nowruz dates and today
for g, j in ((20240320, "1403/01/01"), (20250321, "1404/01/01"), (20261027, "1405/08/05"), (20000101, "1378/10/11")):
    check(tse.jdate(g) == j, f"jdate {g} -> {tse.jdate(g)} != {j}")
    check(tse.parse_date(j) == g, f"parse_date {j}")
check(tse.parse_date("۱۴۰۳/۰۷/۲۹") == 20241020, "persian digits")
check(tse.norm("تستي") == tse.norm("تستی"), "arabic/persian yeh")

# resolve picks the exact symbol, not the rights issue
ins, sym, name = tse.resolve("تستی")
check(ins == INS, f"resolve -> {ins}")

# adjustment: one event, earlier prices scaled, last bar raw, adjusted series continuous
raw, _ = tse.history(INS, adjusted=False)
adj, ev = tse.adjust(raw)
check(len(ev) == 1, f"events {ev}")
check(adj[-1]["close"] == raw[-1]["close"], "last bar unadjusted")
check(abs(adj[0]["close"] / raw[0]["close"] - ev[0]["ratio"]) < 1e-5, "first bar scaled")
check(all(abs(adj[i]["yclose"] - adj[i - 1]["close"]) < 1e-6 for i in range(1, len(adj))), "adjusted series continuous")

# analyse
a, md = analyze.run("تستی")
t = a["technical"]
check(t["days"] == len(DAYS), "days")
check(t["rsi14"] is not None and 0 <= t["rsi14"] <= 100, "rsi range")
check(t["limit_days_60"]["locked_down"] == 2, f"locked days {t['limit_days_60']}")
check(a["flow"] and a["flow"]["d20"]["days"] == 20, "flow window")
check(a["fundamentals"]["pe"] and abs(a["fundamentals"]["pe"] - raw[-1]["close"] / 900) < 1e-6, "P/E")
check(abs(a["fundamentals"]["limit_pct"] - 5) < 0.2, "limit pct")
check("تحلیل سهم" in md and "توصیهٔ سرمایه‌گذاری نیست" in md, "report text")
check("⛔" not in md.split("## جریان پول")[1].split("##")[0], "flow section complete")

# plan: no sizing without budget, then sized; a stop above entry is refused
cfg = dict(plan.DEFAULT_CONFIG)
p = plan.build(a, cfg)
check(p["stop"] < p["entry"] < p["target"] and p["size"] is None, "plan without budget")
cfg.update(budget_rial=1e9, max_loss_per_trade_rial=2e7, commission_buy=0.004, commission_sell=0.009)
p = plan.build(a, cfg, stop="pct", stop_value=6, target="2r")
s = p["size"]
check(s and s["max_loss"] <= 2e7 + 1 and s["cost"] <= 1e9 * 0.25 + p["entry"], f"sizing {s}")
try:
    plan.build(a, cfg, stop="price", stop_value=p["entry"] + 5)
    check(False, "stop above entry must be refused")
except plan.Refusal:
    ok += 1
with open(os.path.join(TMP, f"plan-{analyze.state_key(sym)}.json"), "w", encoding="utf-8") as f:
    json.dump(p, f, ensure_ascii=False)

# simulate
with open(os.path.join(TMP, f"bars-{analyze.state_key(sym)}.json"), encoding="utf-8") as f:
    bars = json.load(f)["bars"]
r = simulate.run(p, bars, days=20, runs=3000, seed=1)
m = r["mc"]
check(abs(m["p_target"] + m["p_stop"] + m["p_open"] - 1) < 1e-9, "probabilities sum to 1")
check(r["history"] and r["history"]["n"] > 200, "history replay")
check(m["p5_r"] >= -3 and m["p95_r"] <= 2.5, f"R bounds {m['p5_r']} {m['p95_r']}")
px, how, n = simulate.walk([(90, 90, 90, 90, True), (95, 99, 94, 97, False)], 100, 95, 110)
check(how == "stop" and n == 2 and px == 95, f"locked day {px, how, n}")
px, how, n = simulate.walk([(101, 103, 99, 102, False)] * 3, 100, 95, 110)
check(how == "open" and px == 102 and n == 3, f"horizon exit {px, how, n}")

# CLIs end to end
rc, out = quiet(plan.main, ["تستی", "--stop", "atr"])
check(rc == 0 and "برگهٔ سفارش" in out, "plan CLI")
rc, out = quiet(simulate.main, ["تستی", "--runs", "500"])
check(rc == 0 and "مونت‌کارلو" in out, "simulate CLI")
rc, out = quiet(chart.main, ["تستی"])
with open(out.strip(), encoding="utf-8") as f:
    svg = f.read()
check(rc == 0 and svg.startswith("<svg") and "<text" in svg and "Times New Roman" in svg, "chart svg")
rc, out = quiet(codal.main, ["تستی"])
check(rc == 0 and "گزارش فعالیت ماهانه" in out and "صورت‌های مالی" in out and "codal.ir/Reports" in out, "codal")
rc, out = quiet(scan.main, ["--market", "--pause", "0"])
check(rc == 0 and "نتیجهٔ اسکن" in out, "scan market")
with open(os.path.join(TMP, "watchlist.json"), encoding="utf-8") as f:
    wl = json.load(f)
check(wl["scanned"] == 1, "universe filtered to shares (fund excluded)")

# CSV import with Jalali dates and Persian headers, then offline analysis
csv_path = os.path.join(TMP, "export.csv")
with open(csv_path, "w", encoding="utf-8") as f:
    f.write("تاریخ,اولین قیمت,بیشترین قیمت,کمترین قیمت,قیمت پایانی,حجم\n")
    for r_ in DAYS[-120:]:
        f.write(f"{tse.jdate(r_['dEven'])},{r_['priceFirst']},{r_['priceMax']},{r_['priceMin']},{r_['pClosing']},{r_['qTotTran5J']}\n")
imported = tse.import_table(csv_path, "دستی")
check(len(imported) == 120 and imported[0]["date"] == DAYS[-120]["dEven"], "csv import")
a2, md2 = analyze.run("دستی", offline=True)
check(a2["insCode"] == "csv:دستی" and a2["flow"] is None and "⛔" in md2, "offline csv analysis")

# old-endpoint fallback parsing
def old_only(url, timeout=20, retries=3):
    if "InstTradeHistory" in url:
        return "20250101@105@95@100@101@98@97@1000000@10000@50;20250102@110@100@108@108@101@100@2000000@20000@60;"
    raise tse.FetchError("cdn down")


tse.http_get = old_only
fb = tse._history_fetch("42")
check(len(fb) == 2 and fb[1]["close"] == 108 and fb[1]["open"] == 101 and fb[1]["volume"] == 20000, f"fallback {fb}")

print(f"✓ همهٔ {ok} آزمون گذشت (دادهٔ مصنوعی، بدون شبکه) — {TMP}")
