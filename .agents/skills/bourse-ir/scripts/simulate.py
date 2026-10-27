#!/usr/bin/env python3
"""Odds of a Tehran Stock Exchange trade plan: Monte Carlo plus a history replay.

Reads bourse/plan-<symbol>.json (plan.py) and bourse/bars-<symbol>.json
(analyze.py). Each simulated day is a real past day of this share, resampled:
its open, high, low and close relative to the previous close. That keeps the
share's own gaps, ranges and daily-limit days. Rules, applied each day:

  open at or below the stop  -> out at the open (a gap through the stop)
  open at or above the target -> out at the open
  low reaches the stop and high reaches the target the same day -> counted as the stop
  a day locked at the lower limit (high == low, down) -> no exit possible, carried to the next day
  nothing by the horizon -> out at that day's close

The replay runs the same rules on every past day as if the plan (same stop and
target distance in percent) had been entered at that close. It is every day,
not only days that looked like today's setup.

Usage:
  simulate.py فزر [--days 20] [--runs 10000] [--lookback 250] [--seed 7] [--json]
"""
import argparse
import json
import os
import random
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tse  # noqa: E402
from analyze import state_key  # noqa: E402


def templates(bars, lookback):
    out = []
    b = bars[-lookback - 1:]
    for prev, d in zip(b, b[1:]):
        pc = prev["close"]
        if not pc:
            continue
        locked_dn = d["high"] == d["low"] and d["close"] < pc
        out.append((d["open"] / pc, d["high"] / pc, d["low"] / pc, d["close"] / pc, locked_dn))
    return out


def walk(days, entry, stop, target):
    """days: iterable of (open, high, low, close, locked_down) in prices. -> (exit_price, how, n_days)."""
    n = 0
    c = entry
    for o, h, l, c, locked in days:
        n += 1
        if locked:
            continue
        if o <= stop:
            return o, "stop", n
        if o >= target:
            return o, "target", n
        if l <= stop:
            return stop, "stop", n
        if h >= target:
            return target, "target", n
    return c, "open", n


def summarise(results, entry, loss_ps, cb, cs):
    n = len(results)
    rs = [((px * (1 - cs) - entry * (1 + cb)) / loss_ps) for px, _, _ in results]
    count = {k: sum(1 for _, how, _ in results if how == k) for k in ("target", "stop", "open")}
    gap = sum(1 for (_, how, _), r in zip(results, rs) if how == "stop" and r < -1.05)
    srt = sorted(rs)
    return {
        "n": n,
        "p_target": count["target"] / n, "p_stop": count["stop"] / n, "p_open": count["open"] / n,
        "avg_r": statistics.fmean(rs), "median_r": srt[n // 2],
        "p5_r": srt[int(n * 0.05)], "p95_r": srt[min(n - 1, int(n * 0.95))],
        "p_worse_than_stop": gap / n,
        "avg_days": statistics.fmean(d for _, _, d in results),
    }


def run(plan, bars, days=20, runs=10000, lookback=250, seed=7):
    entry, stop, target = plan["entry"], plan["stop"], plan["target"]
    cb, cs = plan.get("commission_buy") or 0, plan.get("commission_sell") or 0
    loss_ps = plan["loss_per_share"]
    tpl = templates(bars, lookback)
    if len(tpl) < 40:
        raise ValueError(f"فقط {len(tpl)} روز برای نمونه‌گیری هست؛ دست‌کم ۴۰ روز لازم است")
    rng = random.Random(seed)
    mc = []
    for _ in range(runs):
        p = entry
        path = []
        for _ in range(days):
            o, h, l, c, locked = rng.choice(tpl)
            path.append((p * o, p * h, p * l, p * c, locked))
            p *= c
        mc.append(walk(path, entry, stop, target))

    s_pct, t_pct = stop / entry, target / entry
    hist = []
    for i in range(len(bars) - days - 1):
        e = bars[i]["close"]
        seq = []
        for j in range(i + 1, i + 1 + days):
            d, pc = bars[j], bars[j - 1]["close"]
            seq.append((d["open"], d["high"], d["low"], d["close"], d["high"] == d["low"] and d["close"] < pc))
        px, how, n = walk(seq, e, e * s_pct, e * t_pct)
        hist.append((px / e * entry, how, n))  # rescale to today's entry so R is comparable
    return {"days": days, "runs": runs, "lookback": len(tpl), "seed": seed,
            "mc": summarise(mc, entry, loss_ps, cb, cs),
            "history": summarise(hist, entry, loss_ps, cb, cs) if len(hist) >= 30 else None,
            "breakeven_p": loss_ps / (loss_ps + plan["gain_per_share"])}


def verdict(s):
    m, h = s["mc"], s["history"]
    neg = [name for name, x in (("مونت‌کارلو", m), ("بازآزمایی تاریخی", h)) if x and x["avg_r"] <= 0]
    if len(neg) == 2:
        return "میانگین نتیجه در هر دو روش صفر یا منفی است: با این حد ضرر و هدف، رفتار گذشتهٔ این سهم انتظار سود نمی‌دهد."
    if neg:
        return (f"دو روش هم‌جهت نیستند و میانگین نتیجه در {neg[0]} صفر یا منفی است؛ "
                "شواهد برای انتظار سود مثبت کافی نیست.")
    if m["p_target"] < s["breakeven_p"]:
        return ("احتمال رسیدن به هدف از احتمال سربه‌سر کمتر است و میانگین مثبت از معاملاتی می‌آید که تا پایان بازه باز مانده‌اند؛ "
                "این نتیجه شکننده است.")
    return ("میانگین نتیجه در هر دو روش مثبت و احتمال رسیدن به هدف از احتمال سربه‌سر بیشتر است. "
            "این یعنی رفتار گذشته با این برنامه سازگار است، نه اینکه نتیجه تضمین شده باشد.")


def report(plan, s):
    m, h = s["mc"], s["history"]
    pct = lambda x: f"{x * 100:.1f}٪"
    rows = [("رسیدن به هدف پیش از حد ضرر", pct(m["p_target"]), pct(h["p_target"]) if h else "⛔"),
            ("خوردن حد ضرر", pct(m["p_stop"]), pct(h["p_stop"]) if h else "⛔"),
            (f"هیچ‌کدام تا {s['days']} روز", pct(m["p_open"]), pct(h["p_open"]) if h else "⛔"),
            ("میانگین نتیجه (R)", f"{m['avg_r']:+.2f}", f"{h['avg_r']:+.2f}" if h else "⛔"),
            ("میانه (R)", f"{m['median_r']:+.2f}", f"{h['median_r']:+.2f}" if h else "⛔"),
            ("صدک ۵ و ۹۵ (R)", f"{m['p5_r']:+.2f} / {m['p95_r']:+.2f}", f"{h['p5_r']:+.2f} / {h['p95_r']:+.2f}" if h else "⛔"),
            ("زیان بدتر از حد ضرر (گپ یا صف)", pct(m["p_worse_than_stop"]), pct(h["p_worse_than_stop"]) if h else "⛔"),
            ("میانگین روزهای نگهداری", f"{m['avg_days']:.1f}", f"{h['avg_days']:.1f}" if h else "⛔")]
    L = [f"# شبیه‌سازی معامله: {plan['symbol']}", "",
         f"ورود {plan['entry']:,.0f}، حد ضرر {plan['stop']:,.0f}، هدف {plan['target']:,.0f} ریال؛ افق {s['days']} روز معاملاتی. "
         f"شبیه‌سازی مونت‌کارلو با {s['runs']:,} اجرا از {s['lookback']} روز گذشتهٔ همین سهم نمونه‌گیری کرده است"
         + (f" و بازآزمایی تاریخی روی {h['n']} روز گذشته انجام شده است." if h else "؛ دادهٔ کافی برای بازآزمایی تاریخی نبود."),
         "", "| معیار | مونت‌کارلو | بازآزمایی تاریخی |", "|---|---|---|"]
    L += [f"| {a} | {b} | {c} |" for a, b, c in rows]
    L += ["", f"احتمال سربه‌سر برای این نسبت سود به زیان (پس از کارمزد) {pct(s['breakeven_p'])} است.", "",
          f"**جمع‌بندی:** {verdict(s)}", "",
          "مونت‌کارلو روزهای گذشته را مستقل از هم بازچینی می‌کند و دنباله‌های روند یا صف چندروزه را کمتر از واقعیت نشان می‌دهد؛ "
          "بازآزمایی تاریخی همهٔ روزهای گذشته را می‌شمارد، نه فقط روزهایی را که ستاپ امروز را داشته‌اند.", "",
          "> نتیجهٔ شبیه‌سازی بر پایهٔ رفتار گذشته است و پیش‌بینی یا توصیهٔ سرمایه‌گذاری نیست."]
    return "\n".join(L)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("symbol")
    ap.add_argument("--days", type=int, default=20)
    ap.add_argument("--runs", type=int, default=10000)
    ap.add_argument("--lookback", type=int, default=250)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    key = state_key(a.symbol)
    pp, bp = (os.path.join(tse.STATE_DIR, f"{k}-{key}.json") for k in ("plan", "bars"))
    for p, cmd in ((bp, "analyze.py"), (pp, "plan.py")):
        if not os.path.exists(p):
            print(f"⛔ {p} وجود ندارد؛ اول {cmd} {a.symbol} را اجرا کنید.", file=sys.stderr)
            return 2
    with open(pp, encoding="utf-8") as f:
        plan = json.load(f)
    with open(bp, encoding="utf-8") as f:
        bars = json.load(f)["bars"]
    try:
        s = run(plan, bars, a.days, a.runs, a.lookback, a.seed)
    except ValueError as e:
        print(f"⛔ {e}", file=sys.stderr)
        return 2
    with open(os.path.join(tse.STATE_DIR, f"sim-{key}.json"), "w", encoding="utf-8") as f:
        json.dump(s, f, ensure_ascii=False, indent=1)
    print(json.dumps(s, ensure_ascii=False, indent=1) if a.json else report(plan, s))
    return 0


if __name__ == "__main__":
    sys.exit(main())
