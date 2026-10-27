# Methods and formulas

All indicators run on adjusted daily prices; limit-day counts run on raw prices.

| item | definition |
|---|---|
| SMA n | mean of the last n closes (final price, `pClosing`) |
| RSI(14) | Wilder smoothing of gains and losses |
| MACD | EMA12 − EMA26; signal EMA9 of MACD; histogram = MACD − signal |
| ATR(14) | Wilder average of true range |
| n-day high / low | over the n days before today (today excluded) |
| trend | up: close > SMA50 > SMA200; down: close < SMA50 < SMA200; otherwise neutral, leaning by close vs SMA50 |
| swing point | a high (low) that is the highest (lowest) of the 3 bars on each side, last 250 days |
| level | swing points grouped from the lowest upward while within 2 × max(0.6 ATR, 1% of price) of the group's lowest point; price = mean; touches = count |
| locked day | high == low (whole day at one price); down = locked at the lower limit (sell queue) |
| net real money | Σ buy_I_Value − Σ sell_I_Value over the window |
| per-capita buy / sell | Σ buy_I_Value / Σ buy_I_Count, Σ sell_I_Value / Σ sell_I_Count |
| buyer power | per-capita buy / per-capita sell |
| real share of buying | Σ buy_I_Value / (Σ buy_I_Value + Σ buy_N_Value) |
| P/E | today's raw final price / TSETMC EPS (blank when EPS ≤ 0) |
| limit % | (psGelStaMax / midpoint of today's limits − 1) × 100 |

## Plan

Stop `support`: nearest support below entry minus 0.5 ATR, used if within
3 ATR and 15% of entry; otherwise entry − 2 ATR. Rounded down to the tick.
Target `kR`: entry + k × (entry − stop), rounded up. Loss per share includes
commission: entry × (1 + c_buy) − stop × (1 − c_sell). Size = the smallest of
max loss / loss per share, position cap, cash after buffer, and the exchange's
max order volume when TSETMC reports it.

## Simulation

Monte Carlo resamples whole past days (open, high, low, close relative to the
previous close, plus the locked-down flag) independently, 10,000 paths of 20
days by default, from the last 250 days. Exit rules are in
`scripts/simulate.py`. A day locked at the lower limit cannot be exited. The
historical replay applies the same percent stop and target to every past
close. R = (exit after commission − entry with commission) / loss per share.
Break-even probability = loss / (loss + gain).

Limits: independent resampling understates multi-day trends and queues; the
replay is unconditional (all days, not only days like today); neither accounts
for news, market-wide halts or changes in the daily-limit regime.
