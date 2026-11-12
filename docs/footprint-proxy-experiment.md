# Footprint-proxy experiment (week 5 of the study plan)

*Data: `data/history/` through 2026-10-30. Scripts: `scripts/footprint_proxy_experiment.py` (pre-registered tests) and `scripts/footprint_proxy_diagnostics.py` (post-hoc robustness checks). Educational analysis, not trading advice.*

## Question

A real footprint chart needs trade-level bid/ask data, which this repo does not have. The closest daily proxy is **where the bar closed inside its range**. Does that proxy predict next-day or next-week returns on NEPSE, beyond plain price momentum?

```
CLV_t         = ((Close - Low) - (High - Close)) / (High - Low)     range -1 to +1
rel_turnover  = turnover_t / mean(turnover of the previous 20 days)
proxy_delta   = CLV_t * rel_turnover                                 (index only)
```

This is **not** a footprint. A footprint splits volume by price level and by aggressor side; the proxy only uses the bar's shape. It is the best that OHLC data allows.

## Method

The seven hypotheses, the proxy definitions, the permutation tests, the seed (20261101) and the Bonferroni threshold (0.05 / 7 = **0.0071**, one-sided) were fixed in the script header **before the first run**. The script was run once and nothing was tuned afterwards. The post-hoc checks were written after seeing the results and are labelled as such.

- **Index:** `index_ohlc.csv`, 1,520 usable days (2020-2026).
- **Stocks:** the 21 daily price lists (24 Sep - 30 Oct 2026), about 141 liquid stocks per day (turnover of at least Rs 5M), 20 usable day-pairs.

## Pre-registered results

| # | Test | Result | Verdict |
|---|---|---|---|
| H1 | Close location vs next-day index return | rank IC **+0.188**, p 0.0002, n 1,520 | **Pass** |
| H2 | Proxy delta vs next-day index return | IC **+0.176**, p 0.0002 | **Pass** |
| H3 | Proxy delta beyond same-day return | IC **+0.183**, p 0.0002 | **Pass** |
| H4 | Proxy delta vs 5-day return (non-overlapping) | IC +0.066, p 0.112, n 304 | Fail |
| H5 | Bearish divergence at 20-day highs: lower 5-day return | +0.30% (n 22) vs +1.52% (n 207), p 0.094 | Fail (few cases) |
| H6 | Stocks: close location vs next-day return | mean IC **-0.042**, t -1.44, p 0.913, 20 days | Fail (wrong sign) |
| H7 | Stocks: beyond same-day return | mean IC **-0.051**, t -1.71, p 0.947 | Fail (wrong sign) |

Descriptive only:
- IC of H1 by year: 2020 +0.245, 2021 +0.210, 2022 +0.207, 2023 +0.148, 2024 +0.164, 2025 +0.235, 2026 +0.079. Positive every year; weakest so far in 2026.
- By period: 2020-2023 +0.207, 2024-2026 +0.165.
- Mean next-day index return by close-location quintile: bottom **-33.9 bps**, top **+43.9 bps**.

## Post-hoc robustness checks (exploratory)

| Check | Result |
|---|---|
| D1 Index momentum alone (return today vs tomorrow) | rank IC **+0.140**, so the index itself has lag-1 momentum. H3 shows the proxy adds to it. |
| D2 Overnight vs intraday | IC with the **overnight gap +0.281**; with the **next-day intraday move +0.124**. The signal is stronger in the gap, but present in both. |
| D3 Circular-shift test (keeps serial dependence) | H1, H2 and H3 all **survive** (p 0.0002 each). |
| D4 Feed consistency | `index_ohlc.csv` close vs `index.csv` close: **0 mismatches** in 1,541 dates. |
| D5 Persistence of the proxy | Lag-1 autocorrelation of close location only +0.055, so it is not an inflated-p artifact. |
| D6 Stocks: same-day vs next-day return | mean IC +0.006 (t +0.19) over 20 days: no momentum or reversal visible across stocks. |

## What this means

1. **At the index level, close location carried real information about the next day on 2020-2026 NEPSE data.** It survives the pre-registered tests, a serial-dependence test and a feed-consistency check, and it adds to simple momentum. It did not carry over to a 5-day horizon (IC +0.066, not significant).
2. **It does not show up in individual stocks, but that test is nearly empty.** There are only 20 day-pairs of stock-level OHLC, so the stock result is inconclusive. It is not evidence against the proxy.
3. **This is not a footprint result.** It says nothing about bid/ask imbalance, stacked imbalances or absorption. Those need trade-level data.
4. **A plausible explanation (untested):** a thin-market index built from stocks that do not all trade every day will show lag-1 autocorrelation because stale prices catch up on later days. That would produce index predictability without any tradable stock-level signal. This is a hypothesis; the data here cannot separate it from a genuine effect.
5. **It is not shown to be tradable.** The index itself is not tradable, no transaction costs were tested, and a top-quintile gain of about 44 bps a day is gross.

## Limits

- Stock-level OHLC history starts on 24 Sep 2026 (21 daily price lists). The stock history files have only closes and volume.
- The proxy uses one bar's shape. It cannot see intrabar order flow.
- Seven tests were pre-registered, but I also looked at the descriptive and post-hoc numbers; those are not corrected for multiple testing.
- Index candles come from the MeroLagani chart feed.

## Next steps

1. **Check NepseAlpha's method** (week 1 of the plan): is its footprint built from trade-level data or inferred? That decides whether real footprint signals are worth studying.
2. **Re-run H6/H7 later.** The daily price lists accumulate in the repo. After about 3 months of lists, rerun `python scripts/footprint_proxy_experiment.py` for a meaningful stock-level test.
3. **If real trade data becomes available** (a floorsheet or tick export), replace the proxy with true delta and repeat the same pre-registered tests.

## How to rerun

```bash
python scripts/footprint_proxy_experiment.py          # pre-registered tests
python scripts/footprint_proxy_diagnostics.py         # post-hoc checks
python scripts/footprint_proxy_experiment.py --json   # machine-readable
```
