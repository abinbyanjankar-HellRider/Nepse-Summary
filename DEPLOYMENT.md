# Setup guide — GitHub Pages with daily auto-update

**Status (checked 2026-09-30):** steps 1, 2, 4 and 6 are done: the public repo `abinbyanjankar-HellRider/Nepse-Summary` exists and the workflow has run successfully on schedule and by hand (data commits are pushed). Steps 3 (Pages) and 5 (`ANTHROPIC_API_KEY`) are settings only the repo owner can see; confirm them under Settings → Secrets and variables → Actions.

Total time: about 15 minutes, once.

## 1. Create the repository
1. Go to https://github.com/new
2. Name: `Nepse-Summary` · Visibility: **Public** (free GitHub Pages needs a public repo; a private repo with Pages needs a paid plan) · do **not** add a README, .gitignore or licence.
3. Click **Create repository**.

## 2. Push the project (it's already a git repository with its full history)
```bash
cd <your local clone>
git remote add origin https://github.com/abinbyanjankar-HellRider/Nepse-Summary.git
git push -u origin main
```
Check on GitHub that you can see `.github/workflows/nepse-daily.yml` and `data/history/`.

From this moment the PC's scheduled task switches itself to **pull mode**: GitHub does the daily update, and the PC just downloads it. Nothing else to change.

## 3. (Optional) Turn on GitHub Pages — read this first
A Pages site is **public to anyone who has the link and has no login**: the
login in `scripts/secure_server.py` only protects the copy served from your PC.
Pages would publish the dashboard and all its data (not the scripts — the
deploy job uploads only `index.html` and `data/`). On a private repository
Pages also needs a paid GitHub plan.

If you still want it:
1. **Settings → Pages → Build and deployment → Source: `GitHub Actions`**.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   `PAGES_ENABLED` = `true`. Until this variable exists the deploy job is skipped.

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
Green tick = done. Your site: `https://abinbyanjankar-hellrider.github.io/Nepse-Summary/` (once Pages and `PAGES_ENABLED` are on)

If it fails, open the run → `update-data` → *Fetch today's NEPSE close* and read the `[fetch_nepse]` lines. The most common cause is a changed page layout; adding the API key (step 5) covers that.

## Daily use
Nothing to do. Mon–Fri after ~4:05 PM NPT the site shows that day's close, verified against the previous session (the "Daily Data Check" card).
Failed runs are emailed to you; press **Re-run jobs** or run manually with Force.
Before GitHub is set up, the PC task "NEPSE Daily Update" does the same locally (see README → Automatic updates).

## Changing the dashboard with Claude Code
```bash
npm install -g @anthropic-ai/claude-code
cd Nepse-Summary
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
