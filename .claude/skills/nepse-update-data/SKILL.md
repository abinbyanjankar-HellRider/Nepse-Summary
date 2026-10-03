---
name: nepse-update-data
description: Refresh, backfill, or repair the NEPSE dashboard's data (index history, daily price lists, latest.json, the embedded nepse-data block, the monthly chart arrays) and validate it before committing. Use when the user asks to update/refresh/backfill NEPSE data, fix a failed daily GitHub Action run, re-seed history, or check whether the published data is correct.
---

# Update NEPSE dashboard data

The data pipeline lives in `scripts/`. Never hand-edit `data/` files, the
`<script id="nepse-data">` block, or the `// ---- CHART DATA ----` block in
`index.html` — they are generated.

| Script | What it does |
|---|---|
| `scripts/fetch_nepse.py` | One trading day: ShareSansar price list + dated NEPSE index (MeroLagani chart API first, then page scrapes, then Claude fallback). Writes `data/latest.json`, `data/history/index.csv`, `data/history/prices/<date>.csv`, and injects the payload into `index.html`. |
| `scripts/backfill_history.py` | Daily index closes since 2020 from MeroLagani into `index.csv` (existing rows are kept). `--update-chart` regenerates the monthly chart arrays in `app.js`. |
| `scripts/validate_data.py` | Sanity checks on everything above. Exit 1 = do not commit. |
| `scripts/market_views.py` | Sector-index and company histories, heatmap and RRG (`--backfill` the first time), plus the daily RRG snapshot in `data/history/rrg/`. |
| `scripts/verify_daily.py` | Compares today with the stored previous session and across sources; writes `data/history/checks/<date>.json`. |
| `scripts/run_daily.py` | **All of the above, in order.** This is what the GitHub Action runs. Use it for normal daily updates. |

## Automation (already set up)

- **This PC:** the Windows scheduled task "NEPSE Daily Update" runs `scripts/local_update.py`
  Mon–Fri 4:15 PM and 4:50 PM NPT, and at the next logon if the PC was off. It runs
  `run_daily.py` and commits to the local git history. Log: `logs/local-update.log`.
- **GitHub:** once `origin` exists, the Action is the only updater and the PC task only
  runs `git pull --ff-only`. Never run two updaters against the same data.
- A session is "stored" only when `data/history/prices/<date>.csv` exists. A late run
  catches up the newest published session under its own date.

## Workflow

1. **Sync first.** The GitHub Action commits data every trading day, so run
   `git pull` before touching anything. If the folder is not a git clone, stop
   and tell the user: copying data files over the repo would drop rows the
   Action wrote.
2. **Pick the job:**
   - Normal daily update → `python scripts/run_daily.py` (fetch → views → verify → validate)
   - Today's close missing → `python scripts/fetch_nepse.py`
     (`--force` only for a first run, weekend, or holiday re-run the user asked for).
   - History gaps or a fresh repo → `python scripts/backfill_history.py --update-chart`
   - Only checking → skip to step 3.
3. **Validate:** `python scripts/validate_data.py`. It must print `Data OK`. Then read
   `data/history/checks/<date>.json`: any unexplained prev-close mismatch or
   cross-source disagreement must be explained to the user before relying on the data.
   If it fails, report the exact `ERROR:` lines and fix the cause — do not
   delete the check or edit data to make it pass.
4. **Report** trade date, index, change, number of price rows, and source line
   from the `[fetch_nepse] Done:` log line. Commit/push only when the user asks
   (commit `index.html data/`).

## Offline testing (no network, no repo changes)

Copy the repo to the scratchpad and use the test flags there:

```bash
python scripts/fetch_nepse.py --today 2026-09-25 --ss-html page.html --index-html index.html
```

`--index-html` skips the MeroLagani API so the run is fully offline.

## Rules that protect the data

- A close is only stored under a date a source confirmed (ShareSansar as-of,
  MeroLagani bar date, Claude `trade_date`). An index equal to the previous
  close is a stale page (a "phantom day") and must be rejected.
- NEPSE trades Mon–Fri since 2026-04-06 (Sun–Thu before). Never on Saturday.
- MeroLagani bar timestamps: the **UTC** date is the trading date. Converting
  to NPT shifts every bar one day forward.
- Windows consoles need UTF-8 output; the scripts reconfigure stdout already.
