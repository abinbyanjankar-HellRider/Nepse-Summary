# NEPSE Dashboard Redesign: Decision-First Layout

Date: 2026-10-03 · Status: amended 2026-10-03 (phone-first + per-user site login) - pending re-approval

## Intent
The dashboard is used every trading day to decide investments. The redesign must
shorten the path from opening the page to a decision, and reduce navigation
overload (16 flat sidebar sections), without changing data, security or tests.

Stated by user: redesign the dashboard; approved direction = decision-first
(daily decision speed + navigation grouping, light visual refresh).
Amendment (user): the design must be phone-friendly (phone is a first-class
target, designed first), and viewing the project must be protected by per-user
login. Chosen: per-user passphrases on the static site; users.json stays the
local user store (no SQLite). Existing dark/light themes stay.

## Success criteria
1. Opening the page shows a "Today" view that answers "what changed and what do
   I act on" without scrolling on a 1080p desktop.
2. Every existing section remains reachable in at most two clicks.
3. No change to `scripts/`, `data/` formats, encryption, or CSP (no inline JS or
   inline handlers added).
4. All existing tests pass; new navigation smoke test passes.
5. Deep links to old section ids (`#heatmap-sec` etc.) still work.
6. Phone (360-430 px wide): no horizontal page scroll, tap targets >= 44 px,
   Today readable without zooming, tables scroll inside their own container,
   charts resize on rotate.
7. The published site opens only with a valid per-user username + passphrase;
   removing a user and redeploying revokes that user's access to new builds.

## Non-goals
Framework rewrite, new data sources, new analytics, removing any section,
SQLite or any server-side database, a hosted login server, per-user data
(watchlists/notes) stored remotely.

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

### 3. Navigation (phone-first)
- Phone (default styles): fixed bottom tab bar with the 5 groups (thumb reach);
  sub-views as a horizontally scrolling chip row under the header; safe-area
  insets respected.
- Desktop (>= 900 px): the bottom bar becomes a collapsible left sidebar of the
  same 5 groups; sub-views as a secondary tab row.
- Breakpoints are min-width media queries layered on the phone styles.
- `navTo(id)` stays the single entry point: it resolves the id to its group,
  activates the group, then scrolls to the section. Hash routing calls it, so
  old deep links keep working.
- Handlers use the existing `data-on-click` mechanism (CSP forbids inline JS).

### 3b. Phone layout rules
Cards stack in one column and become 2-3 columns on wider screens; Today tiles
reorder by importance; wide tables (price table, heatmap labels) scroll
horizontally inside a wrapper with a sticky first column; charts use container
width and re-render on `resize`/`orientationchange`; inputs use >= 16 px font to
avoid iOS zoom.

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

## Site access: per-user login (published copy)

Replaces the single shared passphrase (format NSD1) with per-user key slots
(format NSD2). The local server (`secure_server.py`, `.auth/users.json`) is
unchanged.

### Format NSD2
- Build generates a fresh random 256-bit data key (DK) every build and encrypts
  the gzip'd bundle with AES-256-GCM under DK (as now).
- Each user gets a slot: `id = SHA-256(NFKC(username))` (hex), `salt` 16 B,
  `iterations`, `iv` 12 B, and DK wrapped with AES-256-GCM under
  KEK = PBKDF2-SHA256(NFKC(password), salt, 1,000,000 rounds). AAD binds the
  slot id and the bundle header, so slots cannot be swapped between bundles.
- Header (JSON, unencrypted): `magic, slots[...]`; then `iv | ciphertext`.

### Users source
`SITE_USERS` GitHub Actions secret, one `username:passphrase` per line (never in
the repository). Build refuses: no users, passphrase < 16 chars, duplicate or
empty usernames. Local `build_site.py` reads the same env var.

### Unlock page (phone-friendly)
Real username field plus password field (password-manager friendly), >= 16 px
inputs, large button, no zoom on focus. Looks up the slot by username hash,
derives the KEK, unwraps DK, decrypts. The same generic message is shown for
unknown user and wrong password. A short client-side delay after failures is
cosmetic only (see limits).

### Revocation and rotation
Remove the line from `SITE_USERS` and redeploy: the new build has no slot for
that user and a new DK. The deploy publishes a fresh orphan commit to the site
repo so old ciphertext is not kept in its history.

### Honest limits (documented in DEPLOYMENT.md)
- A static site cannot enforce lockout; attackers can download the bundle and
  guess offline. Defence = long random passphrases (>= 16 chars enforced) and
  1M-round PBKDF2.
- A revoked user keeps whatever they already downloaded or decrypted.
- Usernames are not secret (their hash is guessable); only passphrases are.
- This protects the published copy only; the source repo must stay private.

### Components
- `scripts/build_site.py`: NSD2 writer, user parsing/validation, orphan-commit
  deploy step in the workflow.
- `scripts/unlock_template.html`: username+password form, NSD2 reader.
- `scripts/manage_site_users.py` (new, small): validates a users file and
  generates strong passphrases for the secret; touches no secrets itself.
- `tests/test_site.py`: round-trip per user, wrong password, unknown user, slot
  tamper, revoked user cannot open a new build, weak passphrase refused.
- Compatibility: the unlock page can still read NSD1 until the first NSD2
  deploy, so a half-deployed state does not lock you out.

### Added risks
- Crypto format change: mitigate with Python and WebCrypto round-trip tests and
  a test vector shared by both.
- Page-load cost: PBKDF2 at 1M rounds takes ~1-2 s on phones; show progress.
