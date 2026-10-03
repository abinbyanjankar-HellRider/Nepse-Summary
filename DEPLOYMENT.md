# Setup guide — GitHub Pages with daily auto-update

Total time: about 15 minutes, once.

## 1. Create the repository
1. Go to https://github.com/new
2. Name: `nepse-dashboard` · Visibility: **Private** — this repository holds `index.html` and all the price data as plain files, so anyone who can see it can read the data. (Free GitHub Pages needs a public repo, which is why step 3 publishes an *encrypted* copy to a second repo instead.) · do **not** add a README, .gitignore or licence.
3. Click **Create repository**.

## 2. Push the project (it's already a git repository with its full history)
```bash
cd "D:/Projects/Technical Analysis/nepse-dashboard"
git remote add origin https://github.com/YOUR-USERNAME/nepse-dashboard.git
git push -u origin main
```
Check on GitHub that you can see `.github/workflows/nepse-daily.yml` and `data/history/`.

From this moment the PC's scheduled task switches itself to **pull mode**: GitHub does the daily update, and the PC just downloads it. Nothing else to change.

## 3. (Optional) Publish a login-protected copy on GitHub Pages
GitHub Pages cannot check passwords, so the published site is **encrypted**: the
deploy job runs `scripts/build_site.py`, which encrypts `index.html`, the app files
and `data/` (AES-256-GCM under a random data key that is wrapped separately for each user with a key from their passphrase via PBKDF2-SHA256, 1,000,000
rounds) and pushes only the ciphertext plus a small unlock page to a **second,
public repository**. Visitors see a username and passphrase prompt; the browser decrypts and shows
the dashboard. Nothing readable is ever served. (The per-user login in
`scripts/secure_server.py` still protects the copy on your PC.)

1. **Make this repository private** (Settings → General → Danger Zone → Change visibility).
   Do this first: while it is public, the same data is readable right here.
2. **Create the site repository**: e.g. `nepse-dashboard-site`, **Public**, empty (no README). It only ever holds ciphertext.
   In it: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`**.
3. **Create a deploy token**: GitHub → Settings → Developer settings → Fine-grained tokens → *Generate new token*;
   Repository access: **only** the site repository; Permissions: **Contents: Read and write**. Set an expiry and put a reminder in your calendar.
4. In **this** repository, **Settings → Secrets and variables → Actions**:
   * Secret `SITE_USERS` — one `username:passphrase` per line (usernames 2–32 characters of a–z 0–9 . _ - ; passphrases at least 16 characters). Create the lines with `python scripts/manage_site_users.py gen abin ram.k` and give each person only their own.
   * Secret `SITE_DEPLOY_TOKEN` — the token from step 3.
   * Variable `SITE_REPO` — `your-username/nepse-dashboard-site`.
   Until `SITE_REPO` exists the deploy job is skipped. Without both secrets it **fails** rather than publish anything unprotected.
5. Run the workflow once (Actions → NEPSE daily data → Run workflow). Your site: `https://YOUR-USERNAME.github.io/nepse-dashboard-site/`

What this protects, and what it does not:
* **Per-user passphrases**, but a static site cannot lock anyone out and cannot hide who has an account. To revoke someone, delete their line from `SITE_USERS` and run the workflow: the new build has no slot for them and uses a new data key. They keep anything they already downloaded or decrypted.
* Anyone can download `site.enc` and guess passphrases offline, with no lockout. The 1M-round key derivation slows this, but only a **long, random passphrase** makes it infeasible. A short or guessable one is not protection.
* Data already published while the repository was public (including old commits and any forks or caches) stays exposed; making the repo private stops new exposure only. Consider that data public.
* The site is a static snapshot from the last deploy: the Refresh button and intraday live mode work only on your PC (`start-live.bat`).
* Local test: `SITE_USERS='demo.user:a-long-demo-passphrase' python scripts/build_site.py --out _site`, then serve `_site/` with any static server.

## 4. Allow the Action to save data
**Settings → Actions → General → Workflow permissions → `Read and write permissions` → Save**.

## 5. (Recommended) Add the Claude fallback key
Without it, the update only works while ShareSansar/MeroLagani page layouts stay the same.
1. Create an API key at https://console.anthropic.com
2. **Settings → Secrets and variables → Actions → New repository secret**
3. Name: `ANTHROPIC_API_KEY` · Value: your key.

The key stays on GitHub's servers; it is never placed in the web page.

For the dashboard's **AI analysis** on your PC, set the same key on the PC
(`setx ANTHROPIC_API_KEY "sk-ant-..."`, then open a new terminal) before running
`start-live.bat`. The login server calls Claude for the page (`/api/claude`), so
the key never reaches the browser. Default model: `claude-opus-5`
(override with `CLAUDE_MODEL`); limit: 30 requests per user per hour.

## 6. First run (seeds today's data)
**Actions → NEPSE daily data → Run workflow → tick "Force update" → Run workflow**.
Green tick = done. Your site: `https://YOUR-USERNAME.github.io/nepse-dashboard/`

If it fails, open the run → `update-data` → *Fetch today's NEPSE close* and read the `[fetch_nepse]` lines. The most common cause is a changed page layout; adding the API key (step 5) covers that.

## Daily use
Nothing to do. Mon–Fri after ~4:05 PM NPT the site shows that day's close, verified against the previous session (the "Daily Data Check" card).
Failed runs are emailed to you; press **Re-run jobs** or run manually with Force.
Before GitHub is set up, the PC task "NEPSE Daily Update" does the same locally (see README → Automatic updates).

## Changing the dashboard with Claude Code
```bash
npm install -g @anthropic-ai/claude-code
cd nepse-dashboard
git pull                    # always pull first — the bot commits data every day
claude                      # then describe the change you want
```
Ask Claude Code to commit and push when you are happy; the site redeploys automatically.
Do not edit the `<script id="nepse-data">` block by hand — the Action rewrites it daily.
Trading week: **Mon–Fri since 2026-04-06** — after the Government of Nepal changed the weekly holiday, Sunday became a weekly holiday and Friday a trading day (before: Sun–Thu). Saturday is always closed.
Festival/extra closures on Mon–Fri go in `data/reference/holidays.csv` (`date,name,source`): the daily check then stops reporting them as missed updates. Never list a Saturday or Sunday there — they are weekly holidays already (`validate_data.py` warns if one is listed).
See https://docs.claude.com for Claude Code setup details.

## Schedule reference
| Cron (UTC) | NPT | Purpose |
|---|---|---|
| `15 10 * * 1-5` | 4:00 PM Mon–Fri | Main update |
| `0 11 * * 1-5` | 4:45 PM Mon–Fri | Retry |

GitHub may start scheduled runs a few minutes late at busy times. GitHub also pauses schedules in repos with no activity for 60 days; the daily data commits normally count as activity.
