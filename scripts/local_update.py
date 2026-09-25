#!/usr/bin/env python3
"""
Scheduled daily update on this PC (Windows Task Scheduler runs this Mon–Fri
4:15 PM and 4:50 PM NPT, and at the next logon if the PC was off).

Two modes, chosen automatically:
  • No GitHub remote yet  → run scripts/run_daily.py here, then commit the new
                             data to the local git history (every day versioned).
  • GitHub remote 'origin' → the GitHub Action is the updater; just
                             `git pull --ff-only` so this folder has its data.
                             (Never both — two updaters would conflict.)

Log: logs/local-update.log (not committed).
"""
import datetime as dt, json, os, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG  = ROOT / 'logs' / 'local-update.log'
LOCK = ROOT / 'logs' / 'local-update.lock'


def log(msg):
    LOG.parent.mkdir(exist_ok=True)
    line = f'{dt.datetime.now():%Y-%m-%d %H:%M:%S} {msg}'
    with LOG.open('a', encoding='utf-8') as f:
        f.write(line + '\n')
    print(line, flush=True)


def run(cmd, **kw):
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace', **kw)
    out = (r.stdout + r.stderr).strip()
    if out:
        with LOG.open('a', encoding='utf-8') as f:
            f.write(out + '\n')
    return r


def git(*args):
    return run(['git', *args])


def main():
    LOG.parent.mkdir(exist_ok=True)
    # one run at a time (the 4:50 PM retry can overlap a slow 4:15 PM run)
    if LOCK.exists() and (dt.datetime.now().timestamp() - LOCK.stat().st_mtime) < 3600:
        log('another update is still running — skipped')
        return 0
    LOCK.write_text(str(os.getpid()))
    try:
        is_repo = git('rev-parse', '--is-inside-work-tree').returncode == 0
        has_origin = is_repo and git('remote', 'get-url', 'origin').returncode == 0

        if has_origin:
            r = git('pull', '--ff-only', 'origin', 'main')
            log('GitHub mode: pulled the Action\'s data' if r.returncode == 0 else
                'GitHub mode: git pull failed — see log above (local edits not committed?)')
            return r.returncode

        log('local mode: running scripts/run_daily.py')
        env = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}
        r = run([sys.executable, str(ROOT / 'scripts' / 'run_daily.py')], env=env)
        log(f'run_daily exit code {r.returncode}')
        if r.returncode != 0:
            log('update or verification failed — nothing committed; open data/history/checks/ and the log above')
            return r.returncode

        if is_repo:
            git('add', 'index.html', 'data')
            if git('diff', '--cached', '--quiet').returncode != 0:
                latest = ROOT / 'data' / 'latest.json'
                day = (json.loads(latest.read_text(encoding='utf-8')).get('trade_date')
                       if latest.exists() else None) or dt.datetime.now().strftime('%Y-%m-%d')
                c = git('-c', 'user.name=nepse-local', '-c', 'user.email=nepse-local@localhost',
                        'commit', '-m', f'data: NEPSE close {day} (local scheduled update)')
                log('committed to local history' if c.returncode == 0 else 'git commit failed — see log')
            else:
                log('no new data to commit (holiday, weekend, or already up to date)')
        return 0
    finally:
        LOCK.unlink(missing_ok=True)


if __name__ == '__main__':
    sys.exit(main())
