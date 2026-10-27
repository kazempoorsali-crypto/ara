#!/usr/bin/env python3
"""Analyse one Tehran Stock Exchange share: trend, levels, real money flow, basics.

Usage:
  analyze.py فزر                 # live from TSETMC (cache in bourse/cache)
  analyze.py فزر --offline       # cache or an imported CSV only
  analyze.py --ins 123456789 --symbol فزر
  analyze.py فزر --json

Writes bourse/analysis-<symbol>.json (numbers, used by plan.py, simulate.py and
chart.py), bourse/bars-<symbol>.json (adjusted daily bars) and
bourse/analysis-<symbol>.md (the Persian report). Every number in the report
comes from the fetched data; anything missing is printed as ⛔ and never guessed.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tse  # noqa: E402

MISSING = "⛔ ناموجود"


# ---------------------------------------------------------------- indicators

def sma(xs, n):
    return sum(xs[-n:]) / n if len(xs) >= n else None


def ema_series(xs, n):
    if len(xs) < n:
        return []
    k = 2 / (n + 1)
    out = [sum(xs[:n]) / n]
    for x in xs[n:]:
        out.append(x * k + out[-1] * (1 - k))
    return out  # aligned to xs[n-1:]


def rsi(xs, n=14):
    if len(xs) <= n:
        return None
    gains = [max(xs[i] - xs[i - 1], 0) for i in range(1, len(xs))]
    losses = [max(xs[i - 1] - xs[i], 0) for i in range(1, len(xs))]
    ag, al = sum(gains[:n]) / n, sum(losses[:n]) / n
    for g, l in zip(gains[n:], losses[n:]):
        ag, al = (ag * (n - 1) + g) / n, (al * (n - 1) + l) / n
    if al == 0:
        return 100.0
    return 100 - 100 / (1 + ag / al)


def macd(xs):
    e12, e26 = ema_series(xs, 12), ema_series(xs, 26)
    if not e26:
        return None
    line = [a - b for a, b in zip(e12[len(e12) - len(e26):], e26)]
    sig = ema_series(line, 9)
    if not sig:
        return None
    return {"macd": line[-1], "signal": sig[-1], "hist": line[-1] - sig[-1],
            "hist_prev": line[-2] - sig[-2] if len(sig) > 1 else None}


def atr(bars, n=14):
    if len(bars) <= n:
        return None
    trs = []
    for i in range(1, len(bars)):
        h, l, pc = bars[i]["high"], bars[i]["low"], bars[i - 1]["close"]
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    a = sum(trs[:n]) / n
    for t in trs[n:]:
        a = (a * (n - 1) + t) / n
    return a


def swing_levels(bars, close, atr_v, k=3, lookback=250):
    """Support/resistance from swing highs and lows; a level spans at most ~1.2 ATR (or 2% of price)."""
    b = bars[-lookback:]
    pts = []
    for i in range(k, len(b) - k):
        win = b[i - k:i + k + 1]
        if b[i]["high"] == max(x["high"] for x in win):
            pts.append((b[i]["high"], b[i]["date"]))
        if b[i]["low"] == min(x["low"] for x in win):
            pts.append((b[i]["low"], b[i]["date"]))
    if not pts:
        return [], []
    tol = max((atr_v or 0) * 0.6, close * 0.01)
    pts.sort()
    clusters = [[pts[0]]]
    for p in pts[1:]:
        if p[0] - clusters[-1][0][0] <= 2 * tol:  # measured from the cluster's lowest point: no chaining
            clusters[-1].append(p)
        else:
            clusters.append([p])
    levels = []
    for c in clusters:
        price = sum(p[0] for p in c) / len(c)
        levels.append({"price": round(price), "touches": len(c), "last": tse.jdate(max(p[1] for p in c))})
    sup = sorted([l for l in levels if l["price"] < close], key=lambda l: -l["price"])[:3]
    res = sorted([l for l in levels if l["price"] > close], key=lambda l: l["price"])[:3]
    return sup, res


# ---------------------------------------------------------------- sections

def technical(bars, raw):
    closes = [b["close"] for b in bars]
    c = closes[-1]
    out = {"close": c, "date": bars[-1]["date"], "jdate": tse.jdate(bars[-1]["date"]), "days": len(bars)}
    for n in (20, 50, 200):
        out[f"sma{n}"] = sma(closes, n)
    out["sma50_prev10"] = sma(closes[:-10], 50) if len(closes) >= 60 else None
    out["rsi14"] = rsi(closes)
    out["macd"] = macd(closes)
    out["atr14"] = atr(bars)
    out["atr_pct"] = out["atr14"] / c * 100 if out["atr14"] else None
    for n in (20, 60, 250):
        w = bars[-n - 1:-1] if len(bars) > n else None
        out[f"high{n}"] = max(x["high"] for x in w) if w else None
        out[f"low{n}"] = min(x["low"] for x in w) if w else None
    vols = [b["volume"] for b in bars]
    out["volume"] = vols[-1]
    out["vol_avg20"] = sma(vols[:-1], 20) if len(vols) > 20 else None
    out["vol_ratio"] = vols[-1] / out["vol_avg20"] if out["vol_avg20"] else None
    for n in (1, 5, 20, 60):
        out[f"ret{n}"] = (c / closes[-1 - n] - 1) * 100 if len(closes) > n else None

    s50, s200 = out["sma50"], out["sma200"]
    if s50 and s200 and c > s50 > s200:
        trend = "صعودی"
    elif s50 and s200 and c < s50 < s200:
        trend = "نزولی"
    elif s50 and c > s50:
        trend = "خنثی رو به بالا"
    elif s50:
        trend = "خنثی رو به پایین"
    else:
        trend = "نامشخص (دادهٔ کمتر از ۵۰ روز)"
    out["trend"] = trend
    out["supports"], out["resistances"] = swing_levels(bars, c, out["atr14"])

    # Daily-limit behaviour on unadjusted prices: days pinned at a limit are when a stop may not fill.
    raw60 = raw[-60:]
    chg = [(b["close"] / b["yclose"] - 1) * 100 for b in raw60 if b.get("yclose")]
    locked_dn = sum(1 for b in raw60 if b["high"] == b["low"] and b.get("yclose") and b["close"] < b["yclose"])
    locked_up = sum(1 for b in raw60 if b["high"] == b["low"] and b.get("yclose") and b["close"] > b["yclose"])
    out["limit_days_60"] = {"locked_down": locked_dn, "locked_up": locked_up,
                            "max_up_pct": max(chg) if chg else None, "max_down_pct": min(chg) if chg else None}
    # Consecutive locked days ending today: a running buy or sell queue.
    streak, side = 0, None
    for b in reversed(raw):
        if b["high"] != b["low"] or not b.get("yclose") or b["close"] == b["yclose"]:
            break
        s = "down" if b["close"] < b["yclose"] else "up"
        if side and s != side:
            break
        side, streak = s, streak + 1
    out["lock_streak"] = {"days": streak, "side": side}
    # Long pauses in trading (halts) inside the data.
    import datetime as _dt
    halts = []
    for p, q in zip(raw, raw[1:]):
        gap = (_dt.date(q["date"] // 10000, q["date"] // 100 % 100, q["date"] % 100)
               - _dt.date(p["date"] // 10000, p["date"] // 100 % 100, p["date"] % 100)).days
        if gap > 20:
            halts.append({"from": tse.jdate(p["date"]), "to": tse.jdate(q["date"]), "days": gap})
    out["halts"] = halts
    return out


def money_flow(rows, bars):
    if not rows:
        return None
    dates = {b["date"] for b in bars}
    rows = [r for r in rows if r["date"] in dates] or rows

    def window(n):
        w = rows[-n:]
        bi = sum(r["buy_I_Value"] or 0 for r in w)
        si = sum(r["sell_I_Value"] or 0 for r in w)
        bc = sum(r["buy_I_Count"] or 0 for r in w)
        sc = sum(r["sell_I_Count"] or 0 for r in w)
        tot = sum((r["buy_I_Value"] or 0) + (r["buy_N_Value"] or 0) for r in w)
        pcb = bi / bc if bc else None
        pcs = si / sc if sc else None
        return {
            "days": len(w), "net_real": bi - si,
            "per_capita_buy": pcb, "per_capita_sell": pcs,
            "buyer_power": pcb / pcs if pcb and pcs else None,
            "real_buy_share": bi / tot * 100 if tot else None,
            "inflow_days": sum(1 for r in w if (r["buy_I_Value"] or 0) > (r["sell_I_Value"] or 0)),
        }

    return {"last_date": tse.jdate(rows[-1]["date"]), "d1": window(1), "d5": window(5), "d20": window(20)}


def fundamentals(inf, raw_close):
    if not inf:
        return None
    out = dict(inf)
    eps = inf.get("eps")
    out["pe"] = raw_close / eps if eps and eps > 0 else None
    out["pe_note"] = "EPS منفی یا صفر؛ P/E معنا ندارد" if eps is not None and eps <= 0 else None
    out["market_cap"] = inf["shares"] * raw_close if inf.get("shares") else None
    if inf.get("limit_max") and inf.get("limit_min"):
        mid = (inf["limit_max"] + inf["limit_min"]) / 2
        out["limit_pct"] = (inf["limit_max"] / mid - 1) * 100
    return out


def signals(t, mf, live_q):
    """Plain facts that lean one way or the other. Counts, not a recommendation."""
    pos, neg = [], []
    c = t["close"]
    if t["trend"] == "صعودی":
        pos.append("قیمت بالای میانگین ۵۰ و ۲۰۰ روزه و میانگین ۵۰ بالای ۲۰۰ است")
    elif t["trend"] == "نزولی":
        neg.append("قیمت زیر میانگین ۵۰ و ۲۰۰ روزه و میانگین ۵۰ زیر ۲۰۰ است")
    if t["sma50"] and t["sma50_prev10"]:
        up = t["sma50"] > t["sma50_prev10"]
        (pos if up else neg).append("شیب میانگین ۵۰ روزه در ۱۰ روز اخیر " + ("مثبت" if up else "منفی") + " است")
    if t["high20"] and c > t["high20"]:
        pos.append("پایانی امروز بالای سقف ۲۰ روزهٔ قبلی است (شکست)")
    if t["low20"] and c < t["low20"]:
        neg.append("پایانی امروز زیر کف ۲۰ روزهٔ قبلی است")
    r = t["rsi14"]
    if r is not None and r >= 70:
        neg.append(f"RSI برابر {r:.0f} در محدودهٔ اشباع خرید است")
    elif r is not None and r <= 30:
        pos.append(f"RSI برابر {r:.0f} در محدودهٔ اشباع فروش است (احتمال برگشت، نه قطعیت)")
    m = t["macd"]
    if m and m["hist_prev"] is not None:
        if m["hist"] > 0 >= m["hist_prev"]:
            pos.append("هیستوگرام MACD امروز مثبت شد")
        elif m["hist"] < 0 <= m["hist_prev"]:
            neg.append("هیستوگرام MACD امروز منفی شد")
    if t["vol_ratio"] and t["vol_ratio"] >= 2:
        up = (t["ret1"] or 0) > 0
        (pos if up else neg).append(
            f"حجم امروز {t['vol_ratio']:.1f} برابر میانگین ۲۰ روزه، همراه با {'رشد' if up else 'افت'} قیمت")
    if mf:
        d5, d20 = mf["d5"], mf["d20"]
        (pos if d5["net_real"] > 0 else neg).append(
            f"خالص پول حقیقی ۵ روز اخیر {'ورودی' if d5['net_real'] > 0 else 'خروجی'} است")
        bp = mf["d1"]["buyer_power"]
        if bp and bp >= 1.5:
            pos.append(f"قدرت خریدار حقیقی امروز {bp:.2f} است")
        elif bp and bp <= 0.67:
            neg.append(f"قدرت خریدار حقیقی امروز {bp:.2f} است (فروشنده‌ها درشت‌ترند)")
        if d20["days"] >= 20 and d20["inflow_days"] >= 14:
            pos.append(f"در {d20['inflow_days']} روز از ۲۰ روز اخیر پول حقیقی وارد شده است")
        elif d20["days"] >= 20 and d20["inflow_days"] <= 6:
            neg.append(f"فقط در {d20['inflow_days']} روز از ۲۰ روز اخیر پول حقیقی وارد شده است")
    if live_q == "صف خرید":
        pos.append("سهم اکنون در صف خرید است (خرید در صف ممکن است انجام نشود)")
    elif live_q == "صف فروش":
        neg.append("سهم اکنون در صف فروش است")
    ls = t.get("lock_streak") or {}
    if ls.get("days", 0) >= 2:
        if ls["side"] == "down":
            neg.append(f"سهم {ls['days']} روز پیاپی تا امروز در صف فروش (قفل در حد پایین) بسته شده است")
        else:
            pos.append(f"سهم {ls['days']} روز پیاپی تا امروز در صف خرید (قفل در حد بالا) بسته شده است")
    if t["limit_days_60"]["locked_down"] >= 3:
        neg.append(f"در ۶۰ روز اخیر {t['limit_days_60']['locked_down']} روز قفل در حد پایین بوده؛ ریسک اجرانشدن حد ضرر")
    return pos, neg


# ---------------------------------------------------------------- report

def f0(x):
    return MISSING if x is None else f"{x:,.0f}"


def f1(x, suf=""):
    return MISSING if x is None else f"{x:,.1f}{suf}"


def toman(rial, unit="b"):
    """rial -> billions ('b') or millions ('m') of toman."""
    if rial is None:
        return MISSING
    return f"{rial / 1e10:,.1f} میلیارد تومان" if unit == "b" else f"{rial / 1e7:,.1f} میلیون تومان"


def report(a):
    t, mf, fu, lv = a["technical"], a["flow"], a["fundamentals"], a["live"]
    name = (a.get("name") or "").strip("()")
    L = [f"# تحلیل سهم {a['symbol']}" + (f" ({name})" if name else ""),
         "",
         f"آخرین دادهٔ روزانه: {t['jdate']} · {t['days']} روز معاملاتی · منبع: {a['source']} · قیمت‌ها به ریال",
         ""]
    if a["events"]:
        ev = "، ".join(f"{e['jdate']} (ضریب {e['ratio']:.3f})" for e in a["events"][-4:])
        L += [f"قیمت‌های گذشته برای رویدادهای شرکتی (افزایش سرمایه یا سود نقدی) تعدیل شده‌اند: {ev}.", ""]
    if lv:
        L += ["## وضعیت لحظه‌ای", "",
              "| آخرین معامله | پایانی | دیروز | بیشترین | کمترین | بهترین خرید | بهترین فروش | وضعیت صف |",
              "|---|---|---|---|---|---|---|---|",
              f"| {f0(lv.get('last'))} | {f0(lv.get('close'))} | {f0(lv.get('yclose'))} | {f0(lv.get('high'))} | "
              f"{f0(lv.get('low'))} | {f0(lv.get('bid'))} | {f0(lv.get('ask'))} | {a.get('queue') or '—'} |",
              "", f"دادهٔ لحظه‌ای {lv.get('age_min', 0)} دقیقه پیش گرفته شده است.", ""]
    m = t["macd"]
    L += ["## تحلیل تکنیکال", "",
          f"روند کلی **{t['trend']}** است. قیمت پایانی {f0(t['close'])} ریال است و بازدهٔ یک، پنج، بیست و شصت روزه "
          f"به‌ترتیب {f1(t['ret1'], '٪')}، {f1(t['ret5'], '٪')}، {f1(t['ret20'], '٪')} و {f1(t['ret60'], '٪')} بوده است.",
          "",
          "| شاخص | مقدار |", "|---|---|",
          f"| میانگین ساده ۲۰ / ۵۰ / ۲۰۰ روزه | {f0(t['sma20'])} / {f0(t['sma50'])} / {f0(t['sma200'])} |",
          f"| RSI(14) | {f1(t['rsi14'])} |",
          "| MACD / سیگنال / هیستوگرام | " + (f"{m['macd']:,.1f} / {m['signal']:,.1f} / {m['hist']:,.1f}" if m else MISSING) + " |",
          f"| ATR(14) | {f0(t['atr14'])} ({f1(t['atr_pct'], '٪')} قیمت) |",
          f"| سقف / کف ۲۰ روزه | {f0(t['high20'])} / {f0(t['low20'])} |",
          f"| سقف / کف ۶۰ روزه | {f0(t['high60'])} / {f0(t['low60'])} |",
          f"| سقف / کف ۲۵۰ روزه | {f0(t['high250'])} / {f0(t['low250'])} |",
          f"| حجم امروز / میانگین ۲۰ روزه | {f0(t['volume'])} / {f0(t['vol_avg20'])} ({f1(t['vol_ratio'], '×')}) |",
          ""]
    L += ["### سطوح حمایت و مقاومت", "",
          "سطوح از سقف‌ها و کف‌های چرخشی ۲۵۰ روز اخیر به‌دست آمده‌اند؛ «تعداد برخورد» یعنی چند نقطهٔ چرخشی در آن ناحیه جمع شده است.", "",
          "| نوع | قیمت | تعداد برخورد | آخرین برخورد | فاصله از قیمت |", "|---|---|---|---|---|"]
    for kind, lst in (("مقاومت", list(reversed(t["resistances"]))), ("حمایت", t["supports"])):
        for l in lst:
            L.append(f"| {kind} | {l['price']:,} | {l['touches']} | {l['last']} | {(l['price'] / t['close'] - 1) * 100:+.1f}٪ |")
    if not t["supports"] and not t["resistances"]:
        L.append("| — | ⛔ سطحی شناسایی نشد | | | |")
    ld = t["limit_days_60"]
    L += ["", f"در ۶۰ روز اخیر {ld['locked_down']} روز قفل در حد پایین و {ld['locked_up']} روز قفل در حد بالا ثبت شده است"
          f" (بیشترین رشد روزانه {f1(ld['max_up_pct'], '٪')} و بیشترین افت {f1(ld['max_down_pct'], '٪')}).", ""]
    ls = t.get("lock_streak") or {}
    if ls.get("days"):
        L += [f"**وضعیت صف در پایان داده:** {ls['days']} روز پیاپی قفل در "
              + ("حد پایین (صف فروش)" if ls["side"] == "down" else "حد بالا (صف خرید)") + ".", ""]
    if t.get("halts"):
        L += ["توقف‌های طولانی معاملات در داده: " + "، ".join(f"{h['from']} تا {h['to']} ({h['days']} روز)" for h in t["halts"]) + ".", ""]

    L += ["## جریان پول حقیقی و حقوقی", ""]
    if mf:
        L += [f"آخرین روز ثبت‌شده: {mf['last_date']}", "",
              "| بازه | خالص ورود پول حقیقی | سرانهٔ خرید حقیقی | سرانهٔ فروش حقیقی | قدرت خریدار | سهم حقیقی از خرید | روزهای ورود پول |",
              "|---|---|---|---|---|---|---|"]
        for k, lab in (("d1", "امروز"), ("d5", "۵ روز"), ("d20", "۲۰ روز")):
            w = mf[k]
            L.append(f"| {lab} | {toman(w['net_real'])} | {toman(w['per_capita_buy'], 'm')} | {toman(w['per_capita_sell'], 'm')} | "
                     f"{f1(w['buyer_power'])} | {f1(w['real_buy_share'], '٪')} | {w['inflow_days']} از {w['days']} |")
        L += ["", "قدرت خریدار نسبت سرانهٔ خرید حقیقی به سرانهٔ فروش حقیقی است؛ عدد بالاتر از یک یعنی خریداران حقیقی به‌طور میانگین درشت‌تر از فروشندگان بوده‌اند.", ""]
    else:
        why = " (برای فایل واردشده این داده وجود ندارد)." if a["insCode"].startswith("csv:") else "."
        L += [f"{MISSING}: دادهٔ حقیقی/حقوقی در دسترس نبود{why}", ""]

    L += ["## اطلاعات بنیادی از TSETMC", ""]
    if fu:
        L += ["| مورد | مقدار |", "|---|---|",
              f"| بازار / تابلو | {fu.get('market') or MISSING} / {fu.get('board') or MISSING} |",
              f"| گروه صنعت | {fu.get('sector') or MISSING} |",
              f"| تعداد سهام | {f0(fu.get('shares'))} |",
              f"| ارزش بازار | {toman(fu.get('market_cap'))} |",
              f"| EPS اعلامی | {f0(fu.get('eps'))} ریال |",
              f"| P/E (بر پایهٔ قیمت پایانی) | {f1(fu.get('pe'))}" + (f" — {fu['pe_note']}" if fu.get("pe_note") else "") + " |",
              f"| P/E گروه | {f1(fu.get('sector_pe'))} |",
              f"| حجم مبنا | {f0(fu.get('base_volume'))} |",
              f"| دامنهٔ مجاز امروز | {f0(fu.get('limit_min'))} تا {f0(fu.get('limit_max'))}"
              + (f" (±{fu['limit_pct']:.1f}٪)" if fu.get("limit_pct") else "") + " |",
              "", "برای صورت‌های مالی و گزارش فعالیت ماهانه، `codal.py` فهرست آخرین اطلاعیه‌های کدال را با پیوند می‌دهد.", ""]
    else:
        L += [f"{MISSING}: اطلاعات نماد از TSETMC گرفته نشد.", ""]

    pos, neg = a["signals"]
    L += ["## جمع‌بندی شواهد", "",
          f"{len(pos)} شاهد مثبت و {len(neg)} شاهد منفی شناسایی شد. این شمارش جهت شواهد را نشان می‌دهد و پیش‌بینی قیمت یا توصیهٔ خرید و فروش نیست.", "",
          "| جهت | شاهد |", "|---|---|"]
    L += [f"| مثبت | {p} |" for p in pos] + [f"| منفی | {n} |" for n in neg]
    L += ["", "برای برنامهٔ ورود، حد ضرر، هدف و حجم: `plan.py`؛ برای احتمال رسیدن به هدف یا حد ضرر: `simulate.py`.", "",
          "> این گزارش تحلیل داده است و توصیهٔ سرمایه‌گذاری نیست. مسئولیت تصمیم معاملاتی با خود سرمایه‌گذار است."]
    return "\n".join(L)


# ---------------------------------------------------------------- main

def state_key(sym):
    return tse.norm(sym).replace(" ", "_")


def run(symbol=None, ins=None, offline=False):
    ins, sym, name = tse.resolve(symbol, ins, offline)
    raw, _ = tse.history(ins, offline, adjusted=False)
    bars, events = tse.adjust(raw)
    if len(bars) < 30:
        raise tse.ShapeError(f"فقط {len(bars)} روز معاملاتی موجود است؛ برای تحلیل دست‌کم ۳۰ روز لازم است")
    inf = tse.info(ins, offline)
    name = name or inf.get("name", "")
    try:
        rows = tse.flow(ins, offline)
    except (tse.FetchError, tse.ShapeError):
        rows = None
    lv = tse.live(ins, offline)
    q = tse.queue_state(lv, inf)
    t = technical(bars, raw)
    mf = money_flow(rows, bars)
    fu = fundamentals(inf, raw[-1]["close"])
    a = {"symbol": sym, "name": name, "insCode": ins,
         "source": "فایل واردشده" if ins.startswith("csv:") else "TSETMC",
         "technical": t, "flow": mf, "fundamentals": fu, "live": lv, "queue": q, "events": events}
    a["signals"] = signals(t, mf, q)
    os.makedirs(tse.STATE_DIR, exist_ok=True)
    key = state_key(sym)
    with open(os.path.join(tse.STATE_DIR, f"analysis-{key}.json"), "w", encoding="utf-8") as f:
        json.dump(a, f, ensure_ascii=False, indent=1)
    with open(os.path.join(tse.STATE_DIR, f"bars-{key}.json"), "w", encoding="utf-8") as f:
        json.dump({"symbol": sym, "bars": bars}, f, ensure_ascii=False)
    md = report(a)
    with open(os.path.join(tse.STATE_DIR, f"analysis-{key}.md"), "w", encoding="utf-8") as f:
        f.write(md + "\n")
    return a, md


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("symbol", nargs="?")
    ap.add_argument("--ins")
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--symbol", dest="symbol_opt")
    a = ap.parse_args(argv)
    try:
        res, md = run(a.symbol or a.symbol_opt, a.ins, a.offline)
    except (tse.FetchError, tse.ShapeError) as e:
        print(f"⛔ {e}", file=sys.stderr)
        print("اگر TSETMC از این دستگاه در دسترس نیست: سابقهٔ قیمت را از TSETMC یا ره‌آورد خروجی بگیرید و "
              "با `tse.py import-csv FILE --symbol نماد` وارد کنید، سپس همین فرمان را با --offline اجرا کنید.", file=sys.stderr)
        return 2
    print(json.dumps(res, ensure_ascii=False, indent=1) if a.json else md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
