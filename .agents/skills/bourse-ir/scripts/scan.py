#!/usr/bin/env python3
"""Scan Tehran Stock Exchange shares for setups on daily data.

Setups (each is a fact about the last trading day, not a recommendation):
  breakout     close above the previous 20-day high
  reclaim20    close back above the 20-day average after closing below it
  oversold     RSI(14) at or below 30
  bounce       RSI(14) under 40, rising, and a green day (close > open)
  real_money   real (حقیقی) net inflow today with buyer power >= 1.5
  volume       volume at least 2x its 20-day average
  buy_queue    locked at the upper limit (high == low, up)

Universe: symbols on the command line, a file (one symbol per line), or
--market for every TSE and Farabourse share from TSETMC's market watch.
Requests are spaced (--pause) and cached, so a rerun the same day is fast.

Usage:
  scan.py فزر فولاد شپنا
  scan.py --file bourse/watchlist.txt
  scan.py --market [--limit 300] [--min-value 5e10]
  scan.py --market --offline             # rescan from the cache only
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tse  # noqa: E402
from analyze import rsi, sma  # noqa: E402

LABELS = {
    "breakout": "شکست سقف ۲۰ روزه",
    "reclaim20": "بازگشت بالای میانگین ۲۰ روزه",
    "oversold": "اشباع فروش (RSI ≤ ۳۰)",
    "bounce": "برگشت از محدودهٔ اشباع فروش",
    "real_money": "ورود پول حقیقی با قدرت خریدار ≥ ۱٫۵",
    "volume": "حجم ≥ ۲ برابر میانگین",
    "buy_queue": "قفل در صف خرید",
}


def setups(bars, rows):
    if len(bars) < 25:
        return None
    b, p = bars[-1], bars[-2]
    closes = [x["close"] for x in bars]
    hits = []
    if b["close"] > max(x["high"] for x in bars[-21:-1]):
        hits.append("breakout")
    s20, s20p = sma(closes, 20), sma(closes[:-1], 20)
    if s20 and s20p and b["close"] > s20 and p["close"] <= s20p:
        hits.append("reclaim20")
    r, rp = rsi(closes), rsi(closes[:-1])
    if r is not None and r <= 30:
        hits.append("oversold")
    if r is not None and rp is not None and r < 40 and r > rp and b["close"] > b["open"]:
        hits.append("bounce")
    v20 = sma([x["volume"] for x in bars[:-1]], 20)
    if v20 and b["volume"] >= 2 * v20:
        hits.append("volume")
    if b["high"] == b["low"] and b["close"] > p["close"]:
        hits.append("buy_queue")
    bp = None
    if rows:
        last = [x for x in rows if x["date"] == b["date"]]
        if last:
            x = last[0]
            net = (x["buy_I_Value"] or 0) - (x["sell_I_Value"] or 0)
            if x["buy_I_Count"] and x["sell_I_Count"] and x["sell_I_Value"]:
                bp = (x["buy_I_Value"] / x["buy_I_Count"]) / (x["sell_I_Value"] / x["sell_I_Count"])
            if net > 0 and bp and bp >= 1.5:
                hits.append("real_money")
    return {"date": tse.jdate(b["date"]), "close": b["close"], "chg": (b["close"] / p["close"] - 1) * 100,
            "value": b.get("value"), "rsi": r, "buyer_power": bp, "setups": hits}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("symbols", nargs="*")
    ap.add_argument("--file")
    ap.add_argument("--market", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="scan at most N shares (0 = all)")
    ap.add_argument("--min-value", type=float, default=0, help="skip shares whose last traded value (rial) is lower")
    ap.add_argument("--only", help="comma list of setups to keep, e.g. breakout,real_money")
    ap.add_argument("--pause", type=float, default=0.4)
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)

    universe = [{"symbol": tse.norm(s)} for s in a.symbols]
    if a.file:
        with open(a.file, encoding="utf-8") as f:
            universe += [{"symbol": tse.norm(l)} for l in f if l.strip() and not l.startswith("#")]
    if a.market:
        try:
            universe += tse.market_universe(a.offline)
        except (tse.FetchError, tse.ShapeError) as e:
            print(f"⛔ فهرست بازار گرفته نشد: {e}\nفهرست نمادها را با آرگومان یا --file بدهید.", file=sys.stderr)
            return 2
    if not universe:
        ap.error("نمادی برای اسکن داده نشده است (نماد، --file یا --market)")
    if a.limit:
        universe = universe[:a.limit]
    keep = set(a.only.split(",")) if a.only else None

    found, errors = [], []
    for n, u in enumerate(universe, 1):
        try:
            ins = u.get("insCode") or tse.resolve(u["symbol"], None, a.offline)[0]
            raw, _ = tse.history(ins, a.offline, adjusted=False)
            bars, _ = tse.adjust(raw)
            try:
                rows = tse.flow(ins, a.offline)
            except (tse.FetchError, tse.ShapeError):
                rows = None
            res = setups(bars, rows)
        except (tse.FetchError, tse.ShapeError) as e:
            errors.append((u["symbol"], str(e)))
            continue
        finally:
            if not a.offline and n < len(universe):
                time.sleep(a.pause)
        if n % 50 == 0:
            print(f"… {n} از {len(universe)}", file=sys.stderr)
        if not res or (a.min_value and (res["value"] or 0) < a.min_value):
            continue
        hits = [h for h in res["setups"] if not keep or h in keep]
        if hits:
            found.append({"symbol": u["symbol"], "insCode": ins, "score": len(hits), **res, "setups": hits})

    found.sort(key=lambda x: (-x["score"], -(x["value"] or 0)))
    os.makedirs(tse.STATE_DIR, exist_ok=True)
    with open(os.path.join(tse.STATE_DIR, "watchlist.json"), "w", encoding="utf-8") as f:
        json.dump({"scanned": len(universe), "errors": len(errors), "found": found}, f, ensure_ascii=False, indent=1)
    if a.json:
        print(json.dumps(found, ensure_ascii=False, indent=1))
        return 0
    print(f"# نتیجهٔ اسکن: {len(found)} سهم از {len(universe)}\n")
    print("| نماد | تاریخ | پایانی | تغییر | RSI | قدرت خریدار | ستاپ‌ها |\n|---|---|---|---|---|---|---|")
    for x in found:
        rs = f"{x['rsi']:.0f}" if x["rsi"] is not None else "⛔"
        bp = f"{x['buyer_power']:.2f}" if x["buyer_power"] else "⛔"
        print(f"| {x['symbol']} | {x['date']} | {x['close']:,.0f} | {x['chg']:+.1f}٪ | {rs} | {bp} | "
              + "، ".join(LABELS[h] for h in x["setups"]) + " |")
    if errors:
        print(f"\n{len(errors)} نماد به‌دلیل خطای داده کنار گذاشته شد؛ نمونه: {errors[0][0]} — {errors[0][1]}")
    print("\nستاپ‌ها واقعیت‌های روز آخرند، نه توصیهٔ خرید. برای هر نماد analyze.py را اجرا کنید.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
