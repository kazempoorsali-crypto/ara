#!/usr/bin/env python3
"""Daily candlestick chart as SVG with editable text (no plotting library needed).

Draws the last N adjusted daily candles, the 20- and 50-day averages, the
support and resistance levels from analyze.py and, when bourse/plan-<symbol>.json
exists, the entry, stop and target. Labels are English in Times New Roman so
they stay real <text> elements in Word, PowerPoint or Inkscape.

Usage:
  chart.py فزر [--days 120] [--out bourse/chart-فزر.svg]
"""
import argparse
import json
import os
import sys
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tse  # noqa: E402
from analyze import state_key  # noqa: E402

W, H = 1200, 720
L, R, T = 70, 110, 40
PRICE_H, GAP, VOL_H = 470, 30, 120
FONT = "Times New Roman, Times, serif"
UP, DOWN = "#2e7d32", "#c62828"


def sma_series(xs, n):
    out = [None] * len(xs)
    s = 0
    for i, v in enumerate(xs):
        s += v
        if i >= n:
            s -= xs[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out


def build(symbol, bars_all, analysis, plan, days):
    bars = bars_all[-days:]
    closes_all = [b["close"] for b in bars_all]
    ma20 = sma_series(closes_all, 20)[-days:]
    ma50 = sma_series(closes_all, 50)[-days:]
    t = analysis["technical"]
    lines = [("S", s["price"]) for s in t["supports"]] + [("R", r["price"]) for r in t["resistances"]]
    if plan:
        lines += [("Entry", plan["entry"]), ("Stop", plan["stop"]), ("Target", plan["target"])]
    lo = min([b["low"] for b in bars] + [p for _, p in lines])
    hi = max([b["high"] for b in bars] + [p for _, p in lines])
    pad = (hi - lo) * 0.04 or hi * 0.01
    lo, hi = lo - pad, hi + pad
    step = (W - L - R) / len(bars)
    y = lambda p: T + (hi - p) / (hi - lo) * PRICE_H
    x = lambda i: L + step * (i + 0.5)
    vmax = max(b["volume"] for b in bars) or 1
    vtop = T + PRICE_H + GAP
    vy = lambda v: vtop + VOL_H - v / vmax * VOL_H

    s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="{FONT}">',
         f'<rect width="{W}" height="{H}" fill="#ffffff"/>',
         f'<text x="{L}" y="24" font-size="18" font-weight="bold">{escape(symbol)} — daily, adjusted (IRR)</text>',
         f'<text x="{W - R}" y="24" font-size="13" text-anchor="end">'
         f'{escape(tse.jdate(bars[0]["date"]))} – {escape(tse.jdate(bars[-1]["date"]))}</text>']
    for k in range(6):
        p = lo + (hi - lo) * k / 5
        s.append(f'<line x1="{L}" x2="{W - R}" y1="{y(p):.1f}" y2="{y(p):.1f}" stroke="#e0e0e0" stroke-width="1"/>')
        s.append(f'<text x="{L - 6}" y="{y(p) + 4:.1f}" font-size="12" text-anchor="end">{p:,.0f}</text>')
    for i in range(0, len(bars), max(1, len(bars) // 8)):
        s.append(f'<text x="{x(i):.1f}" y="{vtop + VOL_H + 18}" font-size="11" text-anchor="middle">'
                 f'{escape(tse.jdate(bars[i]["date"]))}</text>')
    bw = max(1.0, step * 0.6)
    first = len(bars_all) - len(bars)
    for i, b in enumerate(bars):
        # Coloured by the change from yesterday, as on Iranian boards: a day locked in a queue has open == close.
        prev = bars_all[first + i - 1]["close"] if first + i > 0 else b["open"]
        col = UP if b["close"] >= prev else DOWN
        s.append(f'<line x1="{x(i):.1f}" x2="{x(i):.1f}" y1="{y(b["high"]):.1f}" y2="{y(b["low"]):.1f}" stroke="{col}" stroke-width="1"/>')
        top, bot = y(max(b["open"], b["close"])), y(min(b["open"], b["close"]))
        s.append(f'<rect x="{x(i) - bw / 2:.1f}" y="{top:.1f}" width="{bw:.1f}" height="{max(bot - top, 1):.1f}" fill="{col}"/>')
        s.append(f'<rect x="{x(i) - bw / 2:.1f}" y="{vy(b["volume"]):.1f}" width="{bw:.1f}" '
                 f'height="{vtop + VOL_H - vy(b["volume"]):.1f}" fill="{col}" opacity="0.45"/>')
    for ser, col in ((ma20, "#1565c0"), (ma50, "#ef6c00")):
        pts = " ".join(f"{x(i):.1f},{y(v):.1f}" for i, v in enumerate(ser) if v is not None)
        if pts:
            s.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="1.6"/>')
    s.append(f'<text x="{L + 8}" y="{T + PRICE_H - 8}" font-size="12" fill="#1565c0">SMA 20</text>')
    s.append(f'<text x="{L + 70}" y="{T + PRICE_H - 8}" font-size="12" fill="#ef6c00">SMA 50</text>')
    style = {"S": ("#2e7d32", "6,4"), "R": ("#c62828", "6,4"), "Entry": ("#000000", ""),
             "Stop": ("#c62828", ""), "Target": ("#2e7d32", "")}
    for name, p in lines:
        col, dash = style[name]
        da = f' stroke-dasharray="{dash}"' if dash else ""
        s.append(f'<line x1="{L}" x2="{W - R}" y1="{y(p):.1f}" y2="{y(p):.1f}" stroke="{col}" stroke-width="1.2"{da}/>')
        s.append(f'<text x="{W - R + 6}" y="{y(p) + 4:.1f}" font-size="12" fill="{col}">{name} {p:,.0f}</text>')
    s.append(f'<text x="{L - 6}" y="{vtop + 10}" font-size="11" text-anchor="end">Vol</text>')
    s.append("</svg>")
    return "\n".join(s)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("symbol")
    ap.add_argument("--days", type=int, default=120)
    ap.add_argument("--out")
    a = ap.parse_args(argv)
    key = state_key(a.symbol)
    p = lambda k: os.path.join(tse.STATE_DIR, f"{k}-{key}.json")
    if not os.path.exists(p("bars")) or not os.path.exists(p("analysis")):
        print(f"⛔ اول analyze.py {a.symbol} را اجرا کنید.", file=sys.stderr)
        return 2
    with open(p("bars"), encoding="utf-8") as f:
        bars = json.load(f)["bars"]
    with open(p("analysis"), encoding="utf-8") as f:
        analysis = json.load(f)
    plan = None
    if os.path.exists(p("plan")):
        with open(p("plan"), encoding="utf-8") as f:
            plan = json.load(f)
    out = a.out or os.path.join(tse.STATE_DIR, f"chart-{key}.svg")
    with open(out, "w", encoding="utf-8") as f:
        f.write(build(analysis["symbol"], bars, analysis, plan, a.days))
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
