---
name: nepse-wyckoff-review
description: Check the dashboard's hand-written Wyckoff analysis (ATH, cycle highs, SC/Ice floor, Creek/JAC, ST zone, LPS, phase labels, event dates, scenario triggers, emotion-cycle text) against the real NEPSE daily history, and report or update what the data contradicts. Use when the user asks to review, refresh, or sanity-check the Wyckoff levels/phase, after a big market move, or after new history is backfilled.
---

# Review Wyckoff levels against real history

The Wyckoff text and levels in `index.html` and `app.js` (`WYCKOFF_LEVELS`) are written by hand. The daily
closes in `data/history/index.csv` are the ground truth. This skill finds where
they disagree. **The interpretation is the user's analysis**: report
mismatches with evidence and propose wording, but only edit the analysis after
the user agrees.

## 1. Get the facts

```bash
python .claude/skills/nepse-wyckoff-review/levels.py --since 2025-01-01
```

It prints the all-time high close, yearly highs/lows, a month table (close,
high, low, average daily turnover) and zig-zag swing points (`--swing 4` = 4 %
reversals) with the turnover on each swing day. Turnover on the swing day is
your effort-vs-result evidence (a climax on high turnover, a test on low).

If `index.csv` is empty or stale, run the `nepse-update-data` skill first.

## 2. Find every hand-written level

```bash
grep -n "ATH\|Creek\|JAC\|Ice\|SC \|ST zone\|LPS\|cycle high\|2025 High" index.html app.js
```

The main places to check:
- `LIVE_SNAPSHOT` keys `ath`, `cycle_high`, `sc_low`, `creek`, `st_zone`, `phase`, `bias`
- the `drawHLine(...)` calls in the chart's `wyckoffZones` plugin
- the stat cards under the header, the Trading Range Position bar, the event cards
  (PS/SC/AR/ST/Spring/SOS/LPS…), support/resistance tables, BOS/CHoCH cards,
  trade scenarios, position-calculator defaults, and the emotion-cycle timeline

## 3. Compare and report

For each level, write one row: **claim in the page → what the data says →
verdict** (matches / off by X / wrong date / contradicted). Treat these as
contradictions:
- a named high or low that is not the actual extreme of its period (check the
  date as well as the value)
- an event dated to a month whose price action does not show it (e.g. an SC
  with no low and no turnover spike that month)
- "ATH" given as a month-end close rather than the highest daily close
- a phase or bias that current price has invalidated (e.g. the close is below the
  stated invalidation level)

Known as of 2026-09-24: the ATH is **3,198.60 on 2021-08-18** (the page says
3,080 Jul 2021). The 2025 high is 3,002.07 on 2025-07-29 (the page says 2,983).
The 2025 low is 2,487.17 on 2025-10-16 (the page puts the SC at 2,440 in Nov 2025).
The 2026 high is 2,960.40 on 2026-03-24. Re-run the script, because these move
with new data.

## 4. Update (only after the user agrees)

- Change a level everywhere it appears (use grep). The chart lines, stat cards,
  `LIVE_SNAPSHOT` and scenario tables must agree.
- Keep the user's voice and structure. Change numbers, dates and phase labels,
  not the teaching text.
- Afterwards, run `python scripts/validate_data.py` and render the page (the `run`
  skill, or a headless browser) to check the chart overlays still sit on the data.
