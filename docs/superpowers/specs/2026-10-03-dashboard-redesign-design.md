# NEPSE Dashboard Redesign: Decision-First Layout

Date: 2026-10-03 · Status: draft for review

## Intent
The dashboard is used every trading day to decide investments. The redesign must
shorten the path from opening the page to a decision, and reduce navigation
overload (16 flat sidebar sections), without changing data, security or tests.

Stated by user: redesign the dashboard; approved direction = decision-first
(daily decision speed + navigation grouping, light visual refresh).
Assumptions (to confirm): desktop is primary, phone is secondary; the existing
dark/light themes stay.

## Success criteria
1. Opening the page shows a "Today" view that answers "what changed and what do
   I act on" without scrolling on a 1080p desktop.
2. Every existing section remains reachable in at most two clicks.
3. No change to `scripts/`, `data/` formats, encryption, or CSP (no inline JS or
   inline handlers added).
4. All existing tests pass; new navigation smoke test passes.
5. Deep links to old section ids (`#heatmap-sec` etc.) still work.

## Non-goals
Framework rewrite, new data sources, new analytics, mobile-only layouts,
removing any section.

## Design

### 1. Information architecture
Five groups replace the flat list. Existing `*-sec` elements are kept as-is and
only re-parented/shown by group; their ids do not change.

| Group | Sections (existing ids) |
|---|---|
| Today | close-report, today-grid, summary-sec, events-sec |
| Market | market-summary-sec, heatmap-sec, price-table-sec, rrg-sec, money-sec, emotion-sec |
| Charts | chart-sec, tvchart-sec, structure-sec, levels-sec, trade-sec |
| Stocks | stock-analyzer-sec, notes-sec (fundamentals/AI/summary tabs live inside the analyzer) |
| Macro & Links | macro-sec, links-sec |

`levels-sec` exists in the page but not in the current nav; it is placed under
Charts so it becomes reachable.

### 2. Today view (home)
Composed from data already on the page; no new fetches:
- Close banner (date, source) - existing.
- Market verdict: index value/change, breadth, turnover - from today-grid data.
- Liquidity/macro strip: existing NRB blocks, condensed.
- Movers and watchlist: top gainers/losers from the price list.
- "Changed since yesterday": RRG quadrant moves and Wyckoff signals, from the
  stored previous-session snapshot already produced by `market_views.py`.
  If a source is missing, the tile shows "no data" rather than hiding.

### 3. Navigation
- Desktop: sidebar collapses to icon+label groups; group click shows its
  sub-views as a secondary tab row.
- Phone: top bar with group menu; sub-views scroll horizontally.
- `navTo(id)` stays the single entry point: it resolves the id to its group,
  activates the group, then scrolls to the section. Hash routing calls it, so
  old deep links keep working.
- Handlers use the existing `data-on-click` mechanism (CSP forbids inline JS).

### 4. Visual refresh
Keep tokens in `app.css` (`--bg/--surface/--green/--red/...`) and both themes.
Changes: consistent card component (padding, radius, header), tighter type
scale, green/red reserved for gain/loss and signals, shared chart colours.

### 5. Components and boundaries
- `nav-groups` map (id -> group): data, one place.
- `navTo` update in `app.js`: group-aware, no other behaviour change.
- New CSS blocks for group nav and Today cards in `app.css`.
- `index.html`: add group containers and Today view markup; section markup
  untouched. Encrypted-site build must still process the new markup (verify).

### 6. Error handling
Missing data in a Today tile degrades to "no data". Unknown hash falls back to
Today. Rendering errors in one tile must not break others (per-tile try/catch).

### 7. Testing
- Existing suite (55 tests) must pass.
- New: every `*-sec` id appears in exactly one group; `navTo` resolves each id;
  old hash links resolve; no inline handlers or `unsafe-inline` introduced.
- Manual check in the browser at desktop and phone widths, both themes, and
  through the encrypted build.

### 8. Risks
- `index.html`/`app.js` are large; re-parenting sections may break scripts that
  assume DOM order. Mitigation: keep ids, change visibility not structure
  where possible; test navigation per section.
- Charts rendered while hidden can size to zero. Mitigation: re-trigger resize
  when a group becomes visible.
- Branch base: this work starts on `hardening/split-csp-encrypted-site`
  (PR open); the redesign branch should be rebased once that merges.
