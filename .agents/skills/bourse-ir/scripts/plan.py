#!/usr/bin/env python3
"""Trade plan for one Tehran Stock Exchange share: entry, stop, target, size.

Reads bourse/analysis-<symbol>.json (run analyze.py first) and the rules in
bourse/config.json, then writes bourse/plan-<symbol>.json and prints an order
ticket to place by hand in the broker's online trading system. Long only;
nothing is sent anywhere.

Usage:
  plan.py فزر                                  # entry = last price, stop under nearest support, target 2R
  plan.py فزر --entry 1250 --stop atr --atr-mult 2
  plan.py فزر --stop pct --stop-value 7 --target 3r
  plan.py فزر --stop price --stop-value 1180 --target price --target-value 1420
  plan.py فزر --target resistance             # target at the first resistance above the entry

Stop methods: support (default; nearest support minus half an ATR, falls back to
2 ATR), atr, pct, price. Target: 1r, 2r (default), 3r, resistance, price.
"""
import argparse
import datetime as dt
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tse  # noqa: E402
from analyze import state_key  # noqa: E402

DEFAULT_CONFIG = {
    "budget_rial": None,
    "max_loss_per_trade_rial": None,
    "max_position_pct": 25,
    "cash_buffer_pct": 10,
    "commission_buy": None,
    "commission_sell": None,
    "tick_rial": 1,
    "min_reward_risk": 1.5,
}


class Refusal(Exception):
    pass


def load_config(path):
    cfg = dict(DEFAULT_CONFIG)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            cfg.update({k: v for k, v in json.load(f).items() if not k.startswith("_")})
    return cfg


def floor_tick(x, tick):
    return math.floor(x / tick) * tick


def ceil_tick(x, tick):
    return math.ceil(x / tick) * tick


def build(a, cfg, entry=None, stop="support", stop_value=None, atr_mult=2.0, target="2r", target_value=None):
    t = a["technical"]
    tick = cfg.get("tick_rial") or 1
    warnings = []
    lv = a.get("live") or {}
    if entry is None:
        entry = lv.get("last") or t["close"]
        src = "آخرین معامله" if lv.get("last") else "قیمت پایانی آخرین روز"
    else:
        src = "قیمت واردشده"
    entry = float(entry)
    atr_v = t.get("atr14")

    # ---- stop
    if stop == "support":
        sups = [s for s in t["supports"] if s["price"] < entry]
        if sups and atr_v:
            s = sups[0]["price"] - 0.5 * atr_v
            if (entry - s) <= 3 * atr_v and (entry - s) / entry <= 0.15:
                stop_px = s
                method = f"زیر حمایت {sups[0]['price']:,} (نیم ATR فاصله)"
            else:
                stop_px = entry - atr_mult * atr_v
                method = f"{atr_mult:g} ATR (نزدیک‌ترین حمایت بیش از حد دور بود)"
        elif atr_v:
            stop_px = entry - atr_mult * atr_v
            method = f"{atr_mult:g} ATR (حمایتی زیر قیمت ورود پیدا نشد)"
        else:
            raise Refusal("نه حمایتی پیدا شد و نه ATR محاسبه‌پذیر بود؛ حد ضرر را با --stop price یا pct بدهید.")
    elif stop == "atr":
        if not atr_v:
            raise Refusal("ATR در دسترس نیست")
        stop_px = entry - atr_mult * atr_v
        method = f"{atr_mult:g} ATR"
    elif stop == "pct":
        if stop_value is None:
            raise Refusal("--stop pct به --stop-value (درصد) نیاز دارد")
        stop_px = entry * (1 - stop_value / 100)
        method = f"{stop_value:g}٪ زیر ورود"
    elif stop == "price":
        if stop_value is None:
            raise Refusal("--stop price به --stop-value نیاز دارد")
        stop_px = stop_value
        method = "قیمت واردشده"
    else:
        raise Refusal(f"روش حد ضرر ناشناخته: {stop}")
    stop_px = floor_tick(stop_px, tick)
    if stop_px >= entry:
        raise Refusal(f"حد ضرر ({stop_px:,.0f}) باید زیر قیمت ورود ({entry:,.0f}) باشد.")
    if stop_px <= 0:
        raise Refusal("حد ضرر محاسبه‌شده صفر یا منفی است.")
    risk_ps = entry - stop_px
    if atr_v and risk_ps < 0.5 * atr_v:
        warnings.append(f"فاصلهٔ حد ضرر ({risk_ps:,.0f}) کمتر از نصف ATR ({atr_v:,.0f}) است؛ نوسان عادی یک روز ممکن است آن را بزند.")

    # ---- target
    res = [r for r in t["resistances"] if r["price"] > entry]
    if target in ("1r", "2r", "3r"):
        k = int(target[0])
        tgt = entry + k * risk_ps
        tmethod = f"{k}R"
    elif target == "resistance":
        if not res:
            raise Refusal("مقاومتی بالای قیمت ورود پیدا نشد؛ از --target 2r یا price استفاده کنید.")
        tgt = res[0]["price"]
        tmethod = f"مقاومت {res[0]['price']:,}"
    elif target == "price":
        if target_value is None:
            raise Refusal("--target price به --target-value نیاز دارد")
        tgt, tmethod = target_value, "قیمت واردشده"
    else:
        raise Refusal(f"روش هدف ناشناخته: {target}")
    tgt = ceil_tick(tgt, tick)
    if tgt <= entry:
        raise Refusal(f"هدف ({tgt:,.0f}) باید بالای قیمت ورود باشد.")
    blocking = [r for r in res if r["price"] < tgt]
    if blocking and target != "resistance":
        warnings.append(f"مقاومت {blocking[0]['price']:,} ({blocking[0]['touches']} برخورد) پیش از هدف قرار دارد.")

    # ---- costs
    cb, cs = cfg.get("commission_buy"), cfg.get("commission_sell")
    if cb is None or cs is None:
        warnings.append("کارمزد خرید و فروش در bourse/config.json تنظیم نشده و صفر فرض شد؛ نرخ دقیق را از کارگزاری خود بگیرید.")
        cb, cs = cb or 0.0, cs or 0.0
    loss_ps = entry * (1 + cb) - stop_px * (1 - cs)
    gain_ps = tgt * (1 - cs) - entry * (1 + cb)
    rr = gain_ps / loss_ps if loss_ps > 0 else None
    if rr is not None and cfg.get("min_reward_risk") and rr < cfg["min_reward_risk"]:
        warnings.append(f"نسبت سود به زیان پس از کارمزد {rr:.2f} است و از حداقل {cfg['min_reward_risk']} کمتر است.")

    # ---- daily limit: how many full limit-down days the stop is away
    fu = a.get("fundamentals") or {}
    lim = fu.get("limit_pct")
    days_to_stop = (risk_ps / entry * 100) / lim if lim else None

    # ---- size
    budget, max_loss = cfg.get("budget_rial"), cfg.get("max_loss_per_trade_rial")
    size = None
    if budget and max_loss:
        limits = {
            "حداکثر زیان هر معامله": math.floor(max_loss / loss_ps),
            "سقف هر موقعیت": math.floor(budget * cfg["max_position_pct"] / 100 / (entry * (1 + cb))),
            "نقد پس از ذخیرهٔ احتیاطی": math.floor(budget * (1 - cfg["cash_buffer_pct"] / 100) / (entry * (1 + cb))),
        }
        if fu.get("max_order_volume"):
            limits["سقف حجم هر سفارش در بورس"] = int(fu["max_order_volume"])
        binding = min(limits, key=limits.get)
        shares = max(limits[binding], 0)
        if shares == 0:
            raise Refusal(f"با این حد ضرر حتی یک سهم در «{binding}» جا نمی‌شود؛ حد ضرر نزدیک‌تر یا بودجهٔ ریسک بیشتر لازم است.")
        size = {"shares": shares, "binding": binding, "limits": limits,
                "cost": shares * entry * (1 + cb), "max_loss": shares * loss_ps, "max_gain": shares * gain_ps}
    else:
        warnings.append("بودجه یا حداکثر زیان هر معامله در bourse/config.json تعیین نشده؛ حجم سفارش محاسبه نشد.")

    today = dt.date.today()
    return {
        "symbol": a["symbol"], "insCode": a["insCode"],
        "created": tse.jdate(today.year * 10000 + today.month * 100 + today.day),
        "entry": entry, "entry_source": src, "stop": stop_px, "stop_method": method,
        "target": tgt, "target_method": tmethod, "r_per_share": risk_ps,
        "loss_per_share": loss_ps, "gain_per_share": gain_ps, "reward_risk": rr,
        "stop_pct": risk_ps / entry * 100, "target_pct": (tgt / entry - 1) * 100,
        "limit_pct": lim, "limit_days_to_stop": days_to_stop,
        "commission_buy": cb, "commission_sell": cs, "size": size, "warnings": warnings,
    }


def ticket(p):
    L = [f"# برنامهٔ معامله: {p['symbol']} ({p['created']})", "",
         "| مورد | مقدار |", "|---|---|",
         f"| ورود (خرید) | {p['entry']:,.0f} ریال — {p['entry_source']} |",
         f"| حد ضرر | {p['stop']:,.0f} ریال ({-p['stop_pct']:.1f}٪) — {p['stop_method']} |",
         f"| هدف | {p['target']:,.0f} ریال (+{p['target_pct']:.1f}٪) — {p['target_method']} |",
         f"| ریسک هر سهم (R) | {p['r_per_share']:,.0f} ریال؛ با کارمزد {p['loss_per_share']:,.0f} |",
         f"| نسبت سود به زیان پس از کارمزد | {p['reward_risk']:.2f} |" if p["reward_risk"] else "| نسبت سود به زیان | ⛔ |"]
    if p["limit_days_to_stop"]:
        L.append(f"| فاصلهٔ حد ضرر بر حسب دامنهٔ نوسان | حدود {p['limit_days_to_stop']:.1f} روز افت کامل (دامنه ±{p['limit_pct']:.1f}٪) |")
    s = p["size"]
    if s:
        L += [f"| تعداد سهم | **{s['shares']:,}** (محدودیت تعیین‌کننده: {s['binding']}) |",
              f"| مبلغ خرید با کارمزد | {s['cost'] / 10:,.0f} تومان |",
              f"| زیان در صورت خوردن حد ضرر | {s['max_loss'] / 10:,.0f} تومان |",
              f"| سود در صورت رسیدن به هدف | {s['max_gain'] / 10:,.0f} تومان |"]
    L += ["", "## برگهٔ سفارش برای ثبت دستی در سامانهٔ معاملات برخط", "",
          f"1. سفارش **خرید** {p['symbol']}، " + (f"{s['shares']:,} سهم، " if s else "") + f"قیمت محدود {p['entry']:,.0f} ریال.",
          f"2. پس از اجرا، اگر کارگزاری شما سفارش شرطی دارد، فروش شرطی در {p['stop']:,.0f} ریال (حد ضرر) ثبت کنید؛ وگرنه هشدار قیمت بگذارید.",
          f"3. سفارش فروش محدود در {p['target']:,.0f} ریال (هدف).",
          ""]
    if p["warnings"]:
        L += ["## هشدارها", ""] + [f"- {w}" for w in p["warnings"]] + [""]
    L += ["در بورس تهران اگر سهم در صف فروش قفل شود، حد ضرر ممکن است در قیمت تعیین‌شده اجرا نشود و زیان واقعی از عدد بالا بیشتر شود.",
          "", "> این برنامه بر پایهٔ قواعدی است که خودتان تعیین کرده‌اید و توصیهٔ سرمایه‌گذاری نیست."]
    return "\n".join(L)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("symbol")
    ap.add_argument("--entry", type=float)
    ap.add_argument("--stop", default="support", choices=["support", "atr", "pct", "price"])
    ap.add_argument("--stop-value", type=float)
    ap.add_argument("--atr-mult", type=float, default=2.0)
    ap.add_argument("--target", default="2r", choices=["1r", "2r", "3r", "resistance", "price"])
    ap.add_argument("--target-value", type=float)
    ap.add_argument("--config", default=os.path.join(tse.STATE_DIR, "config.json"))
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    key = state_key(a.symbol)
    path = os.path.join(tse.STATE_DIR, f"analysis-{key}.json")
    if not os.path.exists(path):
        print(f"⛔ {path} وجود ندارد؛ اول analyze.py {a.symbol} را اجرا کنید.", file=sys.stderr)
        return 2
    with open(path, encoding="utf-8") as f:
        an = json.load(f)
    try:
        p = build(an, load_config(a.config), a.entry, a.stop, a.stop_value, a.atr_mult, a.target, a.target_value)
    except Refusal as e:
        print(f"⛔ رد شد: {e}", file=sys.stderr)
        return 3
    with open(os.path.join(tse.STATE_DIR, f"plan-{key}.json"), "w", encoding="utf-8") as f:
        json.dump(p, f, ensure_ascii=False, indent=1)
    print(json.dumps(p, ensure_ascii=False, indent=1) if a.json else ticket(p))
    return 0


if __name__ == "__main__":
    sys.exit(main())
