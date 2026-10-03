#!/usr/bin/env python3
"""
One command for the whole daily update — used by the GitHub Action and for
running it yourself (or from Windows Task Scheduler):

  python scripts/run_daily.py            # normal daily run
  python scripts/run_daily.py --force    # re-run today / weekend / holiday

Steps (in order)
  1. fetch_nepse.py     today's close + price list        (must succeed)
  2. market_views.py    sector/company histories, heatmap, RRG, RRG snapshot
                        (a failure keeps yesterday's views; reported, not fatal)
  3. verify_daily.py    compare with the previous session, write the report
  4. validate_data.py   sanity checks — nothing should be committed if this fails
Every run is logged to data/history/runs.csv (time, trade date, result of each step).
"""
import argparse, csv, datetime as dt, json, os, subprocess, sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT    = Path(__file__).resolve().parents[1]
RUN_LOG = ROOT / 'data' / 'history' / 'runs.csv'
PY      = sys.executable


def step(name, args):
    print(f'\n=== {name} ===', flush=True)
    # Capture and re-print: under pythonw (Task Scheduler, no console) a child's
    # inherited output would otherwise be lost from the log
    r = subprocess.run([PY, str(ROOT / 'scripts' / name), *args], cwd=ROOT, capture_output=True,
                       text=True, encoding='utf-8', errors='replace',
                       env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
    print((r.stdout + r.stderr).rstrip(), flush=True)
    return r.returncode


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    started = dt.datetime.now(dt.timezone.utc)
    latest = ROOT / 'data' / 'latest.json'
    before = latest.read_bytes() if latest.exists() else None

    res = {'fetch': step('fetch_nepse.py', ['--force'] if a.force else [])}
    if res['fetch'] == 0:
        res['views'] = step('market_views.py', ['--force'] if a.force else [])
        res['verify'] = step('verify_daily.py', [])
    res['validate'] = step('validate_data.py', [])

    trade = json.loads(latest.read_text(encoding='utf-8')).get('trade_date') if latest.exists() else ''
    # A clean run that changed nothing (the 4:45 PM retry after a 4:00 PM success)
    # is not logged — otherwise runs.csv alone makes every retry a commit.
    if not any(res.values()) and not a.force and before is not None and latest.read_bytes() == before:
        print(f'\nrun_daily: {res} — nothing changed, run not logged', flush=True)
        return 0
    RUN_LOG.parent.mkdir(parents=True, exist_ok=True)
    new = not RUN_LOG.exists()
    with RUN_LOG.open('a', newline='', encoding='utf-8') as f:
        w = csv.writer(f, lineterminator='\n')
        if new:
            w.writerow(['started_utc', 'trade_date', 'fetch', 'views', 'verify', 'validate', 'seconds'])
        w.writerow([started.isoformat(timespec='seconds'), trade,
                    *(res.get(k, 'skipped') for k in ('fetch', 'views', 'verify', 'validate')),
                    round((dt.datetime.now(dt.timezone.utc) - started).total_seconds())])

    print(f'\nrun_daily: {res}', flush=True)
    # fetch / verify / validate failures stop the commit; a views failure does not
    return 1 if res['fetch'] or res.get('verify') or res['validate'] else 0


if __name__ == '__main__':
    sys.exit(main())
