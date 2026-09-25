# Heatmap and RRG: inputs, method and outputs

The page's **Market Heatmap** and **Relative Rotation Graph (RRG)** sections are
modelled on chukul.com's RRG dashboard (`/rrg-dashboard/details`). That page's
public front-end code shows how it is organised:
- views: Universe, Sectors, Sector → stocks, Symbol trail, Top by quadrant, Full table, Signals
- a Daily / Weekly toggle
- fields `rs_ratio_14`, `rs_momentum_14`, `quadrant`, `previous_quadrant`
- benchmark "NEPSE" for stocks and sectors, and "Sector Index" for stocks inside a sector
- quadrant colours Leading `#21ba45`, Weakening `#f2c037`, Lagging `#c10015`, Improving `#31ccec`

Everything here is rebuilt from public data by `scripts/market_views.py`.

## 1. Inputs

| # | Input | Source | Stored in | Refresh |
|---|---|---|---|---|
| 1 | **Benchmark:** NEPSE index daily close | MeroLagani chart API, `symbol=NEPSE` | `data/history/index.csv` | daily (`fetch_nepse.py`) |
| 2 | **13 sector indices:** daily close | MeroLagani chart API. Symbols: `BANKING`, `DEVELOPMENT BANK`, `FINANCE`, `HOTELS AND TOURISM`, `HYDROPOWER`, `INVESTMENT`, `LIFE INSURANCE`, `MANU.AND PRO.`, `MICROFINANCE`, `MUTUAL FUND`, `NON-LIFE INSURANCE`, `OTHERS`, `TRADING` | `data/history/sectors/<code>.csv` | daily, incremental |
| 3 | **Company universe + sector map** | merolagani.com/CompanyList.aspx. Debentures, government bonds, promoter shares and mutual-fund units are excluded from the stock universe. | `data/reference/companies.csv` (symbol, name, sector) | weekly |
| 4 | **Company daily closes**, adjusted for bonus and rights | MeroLagani chart API, `symbol=<SYM>`, `isAdjust=1` | `data/history/stocks/<SYM>.csv` (date, close, volume) | daily. The last 30 sessions are re-read; if an adjustment changed them, the full history is re-fetched. |
| 5 | **Company turnover** for tile sizes | today's ShareSansar price list | `data/latest.json` → `prices[].turnover` | daily |

- **API endpoint:** `https://merolagani.com/handlers/TechnicalChartHandler.ashx?type=get_advanced_chart&symbol=…&resolution=1D&rangeStartDate=<unix>&rangeEndDate=<unix>&isAdjust=1&currencyCode=NPR`
- **Bar dates:** bars are stamped about 20:45 UTC, and the **UTC date is the trading date**.
- **History length:** from 2024-01-01. The weekly RRG needs 2 × 14 weeks of warm-up plus the trail.

## 2. Parameters

| Parameter | Value | Where |
|---|---|---|
| Window *n* for RS-Ratio and RS-Momentum | 14 (same as chukul's `_14`) | `N` in `market_views.py` |
| Trail length stored | 12 points (the page slider shows 1–12) | `TRAIL` |
| Weekly bars | last close of each week; weeks end on Saturday, so the Sun–Thu and Mon–Fri schedules both work | `period_key()` |
| Missing sessions (no trade) | forward-filled up to 5 sessions, then treated as a gap | `align()` |
| Signal look-back | 10 sessions (daily), 8 weeks (weekly) | `SIGNAL_DAYS`, `SIGNAL_WEEKS` |
| Heatmap colour scale | ±5 % daily, ±10 % weekly, ±15 % monthly | `HM_SCALE` in `index.html` |
| Tile size | √turnover (so small caps stay visible) or equal | heatmap "Size" toggle |

## 3. Method

The JdK RS-Ratio and RS-Momentum formulas are proprietary. This is an open
approximation that keeps the same 14-period z-score scale, smoothed so that
quadrants don't flip on daily noise:

```
RS_t          = EMA₁₀(100 × Price_t / Benchmark_t)
RS-Ratio_t    = 100 + (RS_t − mean₁₄(RS)) / stdev₁₄(RS)
ROC_t         = EMA₅(100 × (RS-Ratio_t / RS-Ratio_{t−5} − 1))
RS-Momentum_t = 100 + (ROC_t − mean₁₄(ROC)) / stdev₁₄(ROC)
```

Tested on 2024–26 NEPSE data for the 279 companies:

| Variant | Quadrant changes per stock per 10 sessions | Clockwise share of transitions |
|---|---|---|
| Unsmoothed z-score | 5.9 | 54 % |
| **Used: EMA₁₀ RS + smoothed 5-period ROC** | **1.5** | **64 %** |

The smoothing settings are `RS_EMA`, `ROC_LAG` and `ROC_EMA` in `market_views.py`.

| Quadrant | RS-Ratio | RS-Momentum | Meaning |
|---|---|---|---|
| Leading | ≥ 100 | ≥ 100 | outperforming, and the outperformance is growing |
| Weakening | ≥ 100 | < 100 | still outperforming, but losing pace |
| Lagging | < 100 | < 100 | underperforming, and falling further behind |
| Improving | < 100 | ≥ 100 | underperforming, but catching up |

Rotation is normally clockwise: Improving → Leading → Weakening → Lagging.
Absolute values will not match chukul.com one-for-one, because the exact
smoothing is unpublished. Quadrant positions and rotation direction are what to
compare.

**Heatmap % changes:**
- 1 Day: vs the previous session
- 1 Week: vs the last close of the previous week
- 1 Month: vs the last close of the previous month

## 4. Output: `data/market_views.json` (also embedded in `index.html`)

```
as_of, generated_at
benchmark  {symbol, close, d, w, m}
sectors    [{name, code}]
companies  {SYM: {name, sector}}
heatmap    {stocks: [{sym, name, sector, close, date, d, w, m, to}],
            sectors: [{sector, close, date, d, w, m, stocks, to}]}
rrg        {params: {n, trail, method},
            daily|weekly: {
              sectors:   {as_of, symbols: {NAME: {d[], x[], y[], q, pq}}, signals[]},   vs NEPSE
              universe:  {…same, one entry per company…},                               vs NEPSE
              in_sector: {SECTOR: {…same, that sector's companies…}}                    vs the sector index
            }}
signals    [{date, sym, from, to, x, y}]   quadrant crossovers, newest first
```

## 5. Daily archive (what is kept for later reference)

| File | Content |
|---|---|
| `data/history/rrg/<date>.csv` | Every company's and sector's RS-Ratio, RS-Momentum and quadrant (daily, weekly, and vs its sector) **as shown that day**. Never rewritten by later runs. |
| `data/history/adjustments.csv` | Companies whose history MeroLagani re-adjusted (bonus or rights), by date |
| `data/history/checks/<date>.json`, `checks.csv` | The day's verification report and changes since the previous session |

## 6. Commands

```bash
python scripts/market_views.py --backfill   # first time: every history (~300 requests, ≈5 min)
python scripts/market_views.py              # daily (the GitHub Action runs this after fetch_nepse.py)
python scripts/market_views.py --no-fetch --force   # rebuild from stored histories only
python scripts/validate_data.py             # checks the views file too
```
