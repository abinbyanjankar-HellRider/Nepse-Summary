# NEPSE Wyckoff Technical Analysis Dashboard

Single-file dashboard (`index.html`) for NEPSE Wyckoff analysis, market summary, today's share prices and NRB macro data — updated automatically every trading day by GitHub Actions.

**Repository:** <https://github.com/abinbyanjankar-HellRider/Nepse-Summary> · **Pages site** (only if enabled, see DEPLOYMENT.md step 3): `https://abinbyanjankar-hellrider.github.io/Nepse-Summary/`

## How the daily update works

| When (NPT) | What happens |
|---|---|
| Mon–Fri 4:00 PM | GitHub Action runs `scripts/fetch_nepse.py`: price list from ShareSansar, NEPSE index from public pages, Claude API fallback if a source fails |
| Mon–Fri 4:45 PM | Retry run — does nothing if 4:00 PM already succeeded |
| After a successful run | Data is written into `index.html` + `data/latest.json`, committed, and GitHub Pages redeploys (~1 min) |
| Public holiday | Script sees ShareSansar still shows the previous day and keeps existing data |
| Sat–Sun | No run (NEPSE trades Mon–Fri since 6 Apr 2026) |

What the dashboard shows when you open it:

| Time you open it | Close shown |
|---|---|
| Mon–Fri before 3:45 PM (incl. 11 AM–3 PM market hours) | Previous trading day |
| Mon–Fri after the 4:00 PM update | Today |
| Sat–Sun | Friday |

The banner at the top always states which date's close is displayed and where it came from. If the page is left open, it picks up the 4:00 PM update by itself (checks `data/latest.json` every 5 minutes after 3:45 PM).

## Daily use: what runs, what is stored, how it is checked

One command does the whole daily update. The GitHub Action runs it Mon–Fri at 4:00 PM NPT (retry 4:45 PM), and you can run it yourself at any time:

```bash
python scripts/run_daily.py          # add --force for a re-run, weekend or holiday
```

| Step | Script | What it does |
|---|---|---|
| 1 | `fetch_nepse.py` | Today's close and full price list, with the phantom-day guard and sanity checks |
| 2 | `market_views.py` | Sector-index and company histories, heatmap, RRG, and the day's RRG snapshot |
| 3 | `verify_daily.py` | **Compares today with the stored previous session** and across sources (below) |
| 4 | `validate_data.py` | Final sanity checks. Nothing is committed if this fails. |

Every run is logged in `data/history/runs.csv`.

**Automatic updates, two ways (both set up):**

| Where | How | Notes |
|---|---|---|
| **This PC** | Windows Task Scheduler task **"NEPSE Daily Update"** runs `scripts/local_update.py` Mon–Fri 4:15 PM and 4:50 PM NPT. If the PC was off, it runs at the next logon. | Runs the full update and commits the day's data to the local git history. A missed session is caught up under its own date. Log: `logs/local-update.log`. |
| **GitHub Actions** (after you push; see DEPLOYMENT.md) | `.github/workflows/nepse-daily.yml` runs `scripts/run_daily.py` in the cloud, even when the PC is off | Once the `origin` remote exists, the PC task **stops updating and only pulls**, so there is only ever one updater. |

Manage the PC task: *Task Scheduler → Task Scheduler Library → NEPSE Daily Update* (Run / Disable / History). To remove it: `Unregister-ScheduledTask -TaskName 'NEPSE Daily Update'`.

**Verification** (the "Daily Data Check" card under the status banner; click it for details):
- today's index change equals today's index minus the stored previous close
- no trading day is missing since the previous session
- ShareSansar's "prev close" equals the LTP stored for the previous session, for every company. A difference only counts as explained when MeroLagani re-adjusted that company's history the same day (a bonus or rights issue); anything else is flagged by symbol.
- ShareSansar LTP equals the MeroLagani close for the same day, per company
- all 13 sector indices are updated
- breadth adds up

The card also lists **what changed since the previous session**: index, turnover, best and weakest sectors, and every company or sector whose RRG quadrant changed (read from the stored snapshot, i.e. exactly what the dashboard showed the previous day).

**Stored permanently** (the daily data commit on GitHub keeps every version):

```
data/history/index.csv                  NEPSE close, turnover, breadth: one row per trading day since 2020
data/history/index_ohlc.csv             NEPSE daily open/high/low/close/turnover (candles for the NEPSE chart)
data/history/prices/<date>.csv          full price list of every trading day (browse it in Today's Price → date picker)
data/history/stocks/<SYM>.csv           adjusted daily close per company (since 2024)
data/history/sectors/<index>.csv        13 sector indices, daily
data/history/rrg/<date>.csv             RRG positions and quadrants as shown that day
data/history/checks/<date>.json         verification report and changes vs the previous session
data/history/checks.csv                 one line per day: ok / warn / error
data/history/adjustments.csv            corporate-action re-adjustments detected
data/history/runs.csv                   every run and the result of each step
data/reference/companies.csv            company → sector map (weekly refresh)
```

## NEPSE chart (TradingView Lightweight Charts)

Sidebar → **Today → NEPSE chart**: daily NEPSE candles since January 2020, drawn with TradingView's open-source [Lightweight Charts™](https://www.tradingview.com/lightweight-charts/) (Apache-2.0).

| | |
|---|---|
| Data | `data/history/index_ohlc.csv`, from MeroLagani's chart feed. Refreshed by `market_views.py` in every daily run; the closes are checked against `index.csv` by `validate_data.py` |
| On the chart | Candles or line · turnover bars · MA 20 / 50 / 200 · the Wyckoff levels (ATH, cycle high, creek, range low) · range 1M–All · crosshair legend with O/H/L/C, change and turnover |
| Live mode | Today's candle updates every minute, marked **LIVE**. Its open/high/low come from MeroLagani's intraday bar when available, otherwise from the live script's own polls |

TradingView itself has no NEPSE data feed, so its embeddable widgets cannot show NEPSE; the chart library is fed with our own data instead. The licence requires the TradingView credit shown under the chart.

## Intraday live mode (market hours, on this PC)

During trading hours (11 AM–3 PM NPT) the Market Summary, Heatmap and daily RRG can follow the market minute by minute:

```bash
start-live.bat                          # double-click: opens the dashboard and starts live mode
python scripts/live_intraday.py         # same, from a terminal (options: --interval 90, --port 8765, --once)
```

| What | How |
|---|---|
| Source | ShareSansar live-trading page: LTP, change and volume of every traded scrip, NEPSE and all sector indices |
| Refresh | Every 60 s from 10:50 AM until the market closes; stops by itself on a holiday (no session by 11:45 AM) |
| Market Summary | Live index, breadth, top gainers/losers/volume/turnover. Per-scrip turnover is estimated as LTP × volume (the NEPSE total is the exchange's own figure) |
| Heatmap + RRG | Rebuilt each minute from the stored histories with today's LTP as a provisional last bar, using the same maths as the daily build (a build takes ~20 s) |
| Files | `data/live.json`, `data/live_views.json`: provisional, git-ignored, never added to the history |
| Access | Sign-in required (see **Login** below) |
| After the close | The script keeps serving the page until 6 PM. When the 4 PM daily update publishes the official close, the page swaps the live figures for it by itself |

The banner shows **LIVE · as of HH:MM NPT** while live figures are shown, and warns if no update has arrived for more than 5 minutes. Live mode needs this PC to run the script; the GitHub Pages copy only shows official closes.

## Login (project security)

The dashboard served from this PC (`start-live.bat`, `scripts/live_intraday.py`, or `python scripts/secure_server.py serve`) is only shown to signed-in users. Create at least one user first; the server will not start without one:

```bash
python scripts/secure_server.py add <username>      # asks for a password (min 10 characters)
python scripts/secure_server.py passwd <username>   # change a password (signs that user out everywhere)
python scripts/secure_server.py remove <username>   # delete a user (signs them out immediately)
python scripts/secure_server.py list
```

| Protection | Detail |
|---|---|
| Passwords | Salted PBKDF2-SHA256, 600,000 iterations, stored only as hashes in `.auth/users.json` (git-ignored, never published) |
| Sessions | Random token in an HttpOnly, SameSite=Strict cookie; 12 hours; **Sign out** in the sidebar |
| Everything locked | Pages redirect to the sign-in page; data files return 401 until signed in |
| Brute force | 5 wrong passwords from one address → locked out for 5 minutes |
| Never served | `.git`, `.auth` and other hidden paths; directory listings |
| Audit | Sign-ins, failures, lockouts and user changes in `logs/auth.log` |

By default it listens on `127.0.0.1` (this PC only). `--host 0.0.0.0` shares it on your network, but over plain HTTP, so passwords are not encrypted in transit.

**Not covered:** this login protects the copy served from this PC. The GitHub repository is public, so anything committed to it (including `index.html` and `data/`) can be read there, and a GitHub Pages site would be public too.

## Changing the look

Everyone can pick a look in the sidebar: **Appearance** → theme (dark/light), font style, accent colour (saved per browser).

To change or add options, edit one object near the top of `index.html`:

```js
const APPEARANCE = {
  defaults: { theme: 'dark', font: 'signal', accent: 'indigo' },
  fonts:   { signal: { label, note, display, text, href }, … },   // add a Google Fonts preset here
  accents: { indigo: { label, dark, light }, … },                    // UI + level colour per theme
};
```

- **Fonts:** `display` is used for headlines and the big close figure, and `text` for everything else, with tabular numbers. `href` is the Google Fonts `family=…` part of the URL. The charts pick up the new font automatically.
- **Colours:** the tokens live in the `DESIGN SYSTEM v2` block of the stylesheet. Keep the rule that **green and red mean price up and down only**. Accents are for interface elements and level lines; amber is for things that need attention.

## Repository layout

```
index.html                         ← the dashboard (single self-contained file)
scripts/run_daily.py               ← the daily update (all steps, in order)
scripts/fetch_nepse.py             ← today's close + price list
scripts/market_views.py            ← heatmap + RRG (sector/company histories)
scripts/verify_daily.py            ← compare with the previous session
scripts/validate_data.py           ← sanity checks, run before every commit
scripts/backfill_history.py        ← one-off: daily index history since 2020 + chart arrays
docs/rrg-inputs.md                 ← RRG / heatmap inputs, formulas, outputs
.github/workflows/nepse-daily.yml  ← schedule + GitHub Pages deploy
```

## Backfilling index history

`data/history/index.csv` is seeded with every NEPSE close since Jan 2020 from MeroLagani's chart API:

```bash
git pull                                            # keep rows the daily Action already wrote
python scripts/backfill_history.py --update-chart   # re-runnable; existing rows are never overwritten
```

`--update-chart` also regenerates the monthly chart arrays (`allData`) in `index.html` from real month-end closes.

## Phantom-day guard

The daily updater never stores a close under a date it cannot confirm. The date must come from ShareSansar's as-of date, a dated MeroLagani bar or Claude's `trade_date`. An index reading equal to the previous close is treated as a stale page and ignored. On a weekend with no confirmed date, the run fails instead of writing a row.

## Data sanity checks

`scripts/validate_data.py` runs in the Action between the fetch and the commit, and `fetch_nepse.py` applies the same checks before writing anything. A failing check means nothing is committed, the site keeps yesterday's data and GitHub emails you. It fails on:

- a trade date on a Saturday, in the future, or on a Sunday after 6 Apr 2026
- an index move over ±10 % or a close identical to the previous day
- fewer than 150 price rows, duplicate or invalid symbols, or LTP ≤ 0
- more than 5 stocks moving over ±20 % (usually shifted columns)
- turnover outside Rs 0.1–100 B
- `latest.json`, `index.csv` and the embedded block disagreeing

Run it locally any time: `python scripts/validate_data.py`.

Scraped and AI-generated text is cleaned before display. Markup characters are removed, rows with non-ticker symbols are dropped, and AI output is HTML-escaped.

## Known limits

- Scraping depends on ShareSansar/MeroLagani page layouts. If they change, the run fails (GitHub emails you) and the previous day's data stays online. The optional `ANTHROPIC_API_KEY` secret adds a Claude web-search fallback.
- Market cap / float market cap are only filled when the Claude fallback runs; otherwise they show "—".
- The Stock Analyzer's AI tab calls the Claude API from the browser, which only works when the file is opened inside Claude.ai.
- The Wyckoff phase/scenario text is written by hand; review it periodically.

Educational use only — not financial advice.
