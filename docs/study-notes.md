# Study Notes: Heatmap, RRG, and where the data comes from

*Examples use real NEPSE data from **Sep 24, 2026**. The dashboard's **📚 Study
Notes** menu shows this same text, and the live values in the "Today" box are
filled in from the current data.*

---

## Part 1: The Market Heatmap

### What it shows
Every listed company is drawn as a **tile**. Tiles are **grouped by sector**. A tile's **colour** is its % price change over the chosen period; its **size** is its turnover.
You can see at a glance **where the money traded** (big tiles) and **which way it moved** (colour).

| Setting | Meaning |
|---|---|
| **Companies / Sector indices** | 280 companies in 12 sectors, or the 13 official NEPSE sector sub-indices |
| **Daily** | today's close vs the previous session's close |
| **Weekly** | today's close vs the **last close of the previous week** |
| **Monthly** | today's close vs the **last close of the previous month** |
| **Size: turnover / Equal** | tile area ∝ √turnover (so small companies stay visible), or all equal |

### The calculation
```
Daily %   = (Close_today / Close_previous_session − 1) × 100
Weekly %  = (Close_today / Close_last_session_of_previous_week − 1) × 100
Monthly % = (Close_today / Close_last_session_of_previous_month − 1) × 100
Tile area ∝ √(turnover in Rs)   (minimum size applied)
```
Weeks end on **Saturday** (NEPSE never trades on Saturday), so both the old Sun–Thu and the current Mon–Fri weeks group correctly.

**Worked example: NABIL on Sep 24, 2026.** It closed at Rs 569.00.
- Daily +0.71 %: its close on Sep 23 was about 565.0, and 569.0 / 565.0 − 1 = +0.71 %.
- Weekly +1.08 %: measured from the previous week's last close (Sep 18).
- Monthly +6.32 %: measured from the Aug 31 close.

### Colour scale
Grey = no change. Green gets deeper as the rise gets bigger, red as the fall gets bigger. Full colour is reached at **±5 % (daily)**, **±10 % (weekly)** and **±15 % (monthly)**, because longer periods move more. NEPSE's daily circuit limit is ±10 % for most stocks.

### How to read it
1. **Breadth:** is the map mostly green or mostly red? That's participation, not just the index.
2. **Where the money is:** big tiles are where turnover is. A green index day carried by one big tile is weaker than a broadly green map.
3. **Sector rotation:** compare the Weekly and Monthly maps. A sector turning from red (monthly) to green (weekly) is starting to recover; the RRG measures this properly.
4. **Sector indices view:** the table shows every sector index for 1 day, 1 week and 1 month next to NEPSE. A sector beating NEPSE on all three is in relative strength.

### Pitfalls
- **Thin trading:** a few trades can move a small company 5–10 %. Check the tile size (turnover) before trusting the colour.
- **Bonus and rights adjustments:** prices are adjusted. A company that looks like it "fell 20 %" on book-closure day probably didn't lose value. The Daily Data Check lists these adjustments.
- **Circuit days:** ±10 % tiles may just be the limit; the move could continue the next day.

---

## Part 2: The Relative Rotation Graph (RRG)

### The idea
A price chart shows whether something went **up**. An RRG shows whether it went up **more than the market**, and whether that **outperformance is speeding up or slowing down**. It answers "what is strong, and is it getting stronger?" for all sectors or stocks on one chart.

### Step 1: Relative Strength (RS)
```
RS = 100 × Price / Benchmark
```
The benchmark is **NEPSE** (for sectors and for all stocks), or the stock's **own sector index** in the "Sector stocks" view.

*Example, Commercial Banks index vs NEPSE:*

| Date | Banking index | NEPSE | RS |
|---|---|---|---|
| Sep 22 | 1,516.46 | 2,654.28 | 57.133 |
| Sep 23 | 1,497.87 | 2,618.03 | 57.214 |
| Sep 24 | 1,504.77 | 2,629.81 | 57.220 |

RS rose even on Sep 23, when both indices fell. Banks fell *less* than the market, which is relative strength.

### Step 2: RS-Ratio, the relative **trend** (x-axis)
RS itself is a meaningless level (57.2 has no reference point), so it's normalised.
We use the same 14-period scale as chukul.com's `rs_ratio_14`, after smoothing:
```
RS_smooth = EMA₁₀(RS)
RS-Ratio  = 100 + (RS_smooth − Average₁₄(RS_smooth)) / StdDev₁₄(RS_smooth)
```
- **100** means performing exactly in line with its recent relative average.
- **Above 100** means outperforming the benchmark relative to its recent history.
- Each 1 point is one standard deviation, so 101.6 is 1.6 standard deviations of relative strength above normal.

### Step 3: RS-Momentum, the **rate of change** of the trend (y-axis)
```
ROC         = EMA₅( 100 × (RS-Ratio / RS-Ratio five periods ago − 1) )
RS-Momentum = 100 + (ROC − Average₁₄(ROC)) / StdDev₁₄(ROC)
```
- **Above 100** means the relative trend is improving (accelerating).
- **Below 100** means it is deteriorating (decelerating).

### Step 4: The four quadrants
| Quadrant | RS-Ratio | RS-Momentum | Meaning | Colour |
|---|---|---|---|---|
| **Leading** | ≥ 100 | ≥ 100 | outperforming, and the outperformance is growing | green |
| **Weakening** | ≥ 100 | < 100 | still outperforming, but losing pace | yellow |
| **Lagging** | < 100 | < 100 | underperforming, and falling further behind | red |
| **Improving** | < 100 | ≥ 100 | underperforming, but catching up | cyan |

Rotation is normally **clockwise**: Improving → Leading → Weakening → Lagging → Improving.
Momentum turns first, so the path curves before the trend changes.

### Step 5: Tails
The **tail** is the path of the last *n* points (slider 1–12). The **head** (big dot) is today.
- **Long tails** mean strong, fast rotation. Short tails mean little is changing.
- **Direction matters more than position.** A tail in Lagging heading up and right toward Improving is an early recovery. A Leading tail curling down is losing steam.

**Worked example: Commercial Banks, daily, last 5 sessions (vs NEPSE)**

| Date | RS-Ratio | RS-Momentum | Quadrant |
|---|---|---|---|
| Sep 17 | 101.25 | 98.98 | Weakening |
| Sep 18 | 101.39 | 99.18 | Weakening |
| Sep 22 | 101.51 | 99.42 | Weakening |
| Sep 23 | 101.59 | 99.70 | Weakening |
| Sep 24 | 101.63 | **100.09** | **Leading** |

The relative trend was already positive (above 100) and momentum rose every day until it crossed 100: **Weakening → Leading**. That is a quadrant crossover, and it appears in the **Signals** tab and in the Daily Data Check.
On the **weekly** RRG, banks are still *Weakening* (101.73, 99.26). The daily turn is fresh, and the weekly chart hasn't confirmed it yet.

### Daily vs Weekly
| | Daily | Weekly |
|---|---|---|
| Built from | each session's close | the last close of each week |
| Reacts | fast, and noisier | slow, and more reliable |
| Use for | timing, early turns | the main trend |

A good setup usually has **both agreeing**, for example weekly Improving/Leading and daily just turning Leading.

### The five RRG views in the dashboard
- **Sectors:** the 13 sector indices vs NEPSE. Start here to see which sectors money is rotating into.
- **Universe:** all 279 companies vs NEPSE (heads only; click one for its tail).
- **Sector stocks:** one sector's companies vs **their sector index**, to find the leaders within a leading sector.
- **Signals:** quadrant crossovers in the last 10 sessions (daily) or 8 weeks (weekly), vs the sector index (the way chukul.com shows them) or vs NEPSE.
- **Table:** every company's RS-Ratio, RS-Momentum, quadrant, previous quadrant and quadrant vs its sector. Sortable.

### How to use it (a typical routine)
1. **Sectors, Weekly:** which sectors are Leading or Improving?
2. **Sectors, Daily:** is the rotation continuing, or turning?
3. **Sector stocks** for that sector: which companies are Leading vs their own sector?
4. **Cross-check** on the Heatmap (turnover present?) and the price chart (support or resistance?).
5. **Risk:** set the stop with the position-size calculator before entering.

### Pitfalls and honest limits
- **An approximation.** The original JdK RS-Ratio/RS-Momentum formula is proprietary. This is the standard open approximation with smoothing. Quadrants and direction behave the same way, but the exact numbers won't match chukul.com or other tools one-for-one.
- **Smoothing is a trade-off.** Without it, stocks changed quadrant about 6 times per 10 sessions (noise). With it, about 1.5 times, and 64 % of changes follow the normal clockwise path. The cost is a signal that comes a few sessions later.
- **It's relative.** "Leading" in a falling market can still lose money, just less than NEPSE. Always check the absolute trend too.
- **Thin stocks** jump around the chart. Prefer names with real turnover.
- **Not a buy/sell signal on its own.** Use it to find where to look, then decide with price levels, volume and risk.

---

## Part 3: Where the data comes from

### Sources used today
| Data | Source | How it's read | When |
|---|---|---|---|
| NEPSE index close (dated) | **MeroLagani** chart API (`TechnicalChartHandler.ashx`, symbol `NEPSE`) | JSON bars (time, open, high, low, close, turnover) | daily, after 4 PM |
| Full price list (≈350 scrips: LTP, OHLC, prev close, volume, turnover, 52-week) | **ShareSansar** "Today's Share Price" page | HTML table | daily |
| 13 sector indices | MeroLagani chart API (`BANKING`, `HYDROPOWER`, `DEVELOPMENT BANK`, `LIFE INSURANCE`, `MANU.AND PRO.` …) | JSON bars | daily |
| Company histories (adjusted for bonus and rights) | MeroLagani chart API, per symbol, `isAdjust=1` | JSON bars | daily (last 30 sessions re-read) |
| Company → sector map (345 companies) | MeroLagani Company List page | HTML | weekly |
| Fallback when a page fails | Claude API with web search (optional key) | JSON | only on failure |
| NRB macro data | NRB publications (entered by hand) | — | when NRB publishes |

Two independent sources (ShareSansar and MeroLagani) are **cross-checked every day**. On Sep 24, 2026, 278 of 278 companies agreed within 0.5 %.

### How future updates happen
Every trading day (Mon–Fri), `scripts/run_daily.py` runs automatically:
1. **Fetch** today's close and price list (the phantom-day guard refuses undated or repeated data).
2. **Update** sector and company histories, and rebuild the heatmap and RRG.
3. **Verify** against the stored previous session and across sources (the Daily Data Check card).
4. **Validate** the whole data set; nothing is saved if this fails.

It runs in two places:
- **This PC**, via Windows Task Scheduler "NEPSE Daily Update", Mon–Fri 4:15 PM and 4:50 PM. If the PC was off, it runs at the next logon and stores the missed session under its own date.
- **GitHub Actions**, once the project is pushed to GitHub: the same script runs in the cloud even when the PC is off, and the PC task then just pulls the result.

Everything is **stored permanently**. Every day's price list, RRG snapshot, verification report and run log is kept in `data/history/`.

---

## Part 4: Is there an official NEPSE API? Can we connect for free?

**Short answer: there is no free, official, public NEPSE API.**

| Option | What it is | Cost | Reliability / terms | Verdict |
|---|---|---|---|---|
| **nepalstock.com internal API** (`/api/nots/...`) | The JSON API the official website itself uses | free | Not public. Without a token it answers `WARNING: UNAUTHORIZED ACCESS` (checked Sep 2026). The token the site hands out is deliberately scrambled; open-source libraries such as *NepseUnofficialApi* decode it by reverse-engineering, and these break whenever NEPSE changes the scheme. The site also has TLS certificate-chain problems. | **Not recommended** as a main source; unauthorised use, and fragile |
| **Licensed NEPSE market-data vendors** | Official real-time and end-of-day feeds, licensed by NEPSE through authorised data providers | **Paid** (one open-source project cites about Rs 10,000–60,000 per month; confirm with NEPSE or the vendor) | Official and stable, with a contract. **Required for any commercial use.** | For a commercial product, or real-time trading |
| **Your broker's TMS** | Live market watch in the NEPSE trading system | included with a broker account | Screen use; no public API for automation | For watching live prices, not for this pipeline |
| **ShareSansar / MeroLagani** (used now) | Public web pages and a chart data endpoint | free | Undocumented, so layouts or endpoints can change. We use **two sources**, cross-check them daily, keep a Claude fallback, and fail loudly instead of saving bad data. | **Good for personal end-of-day analysis**, which is what this dashboard does |

**Recommendation.** For personal, end-of-day decisions, the current free dual-source setup with daily verification is appropriate. If you later need **real-time** data, or use the data **commercially**, get a licensed feed from NEPSE or an authorised vendor; its API could replace the scraping step in `fetch_nepse.py` without changing the rest of the pipeline. Using the nepalstock.com internal API without authorisation isn't advisable.

Sources: GitHub projects [NepseUnofficialApi](https://github.com/basic-bgnr/NepseUnofficialApi), [nepse-scraper](https://github.com/polymorphisma/nepse_scraper), [NepseAPI-Unofficial](https://github.com/surajrimal07/NepseAPI-Unofficial); licensed-data example [MDP — NEPSE-Licensed Market Data API](https://data.smartwealthpro.com/); [Nepal Stock Exchange](https://www.nepalstock.com).

---

*Educational material. Not investment advice. Check levels and data before acting.*
