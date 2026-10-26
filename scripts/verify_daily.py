#!/usr/bin/env python3
"""
Daily verification — compares today's data with what was stored for the
previous trading session and across sources, then records what changed.

  python scripts/verify_daily.py            # after fetch_nepse.py + market_views.py

Writes
  data/history/checks/<date>.json   full report (checks + changes since the previous session)
  data/history/checks.csv           one line per trading day (audit trail)
  latest.json / index.html          a 'verification' summary the dashboard shows

Checks (each is ok / warn / error):
  index_continuity   today's change = today's index − stored previous close
  price_continuity   ShareSansar "prev close" = the LTP stored yesterday, per company
                     (differences explained by a corporate-action re-adjustment are ok)
  cross_source       ShareSansar LTP today = MeroLagani close today, per company
  sector_indices     all 13 sector indices have today's close
  breadth            gainers + losers + unchanged = scrips traded
  history_gaps       no trading day missing between the previous stored day and today
Changes since the previous session
  index / breadth / turnover deltas, sectors and stocks whose RRG quadrant changed
  (read from the archived snapshot, i.e. what the dashboard showed yesterday)
Exit code: 1 if any check is 'error' (the run stops before committing), else 0.
"""
import csv, datetime as dt, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_nepse import ROOT, LATEST, PRICE_DIR, log, num, read_index_history, inject_into_html, clean_payload, write_atomic
from market_views import SECTORS, slug
from validate_data import MON_FRI_SINCE, load_holidays
SECTOR_NAME = {slug(code): name for name, code in SECTORS.values()}

CHECK_DIR  = ROOT / 'data' / 'history' / 'checks'
CHECK_CSV  = ROOT / 'data' / 'history' / 'checks.csv'
RRG_DIR    = ROOT / 'data' / 'history' / 'rrg'
STOCK_DIR  = ROOT / 'data' / 'history' / 'stocks'
SECTOR_DIR = ROOT / 'data' / 'history' / 'sectors'
VIEWS_JSON = ROOT / 'data' / 'market_views.json'
ADJ_LOG    = ROOT / 'data' / 'history' / 'adjustments.csv'
TOL_PCT    = 0.5       # % difference tolerated between sources


def read_csv(path):
    if not path.exists():
        return []
    with path.open(newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def last_close(path, on=None, before=None):
    rows = read_csv(path)
    if on:
        rows = [r for r in rows if r['date'] == on]
    if before:
        rows = [r for r in rows if r['date'] < before]
    return (rows[-1]['date'], num(rows[-1]['close'])) if rows else (None, None)


def pct_diff(a, b):
    return abs(a / b - 1) * 100 if a and b else None


def check(cid, name, status, detail, items=None):
    return {'id': cid, 'name': name, 'status': status, 'detail': detail, 'items': items or []}


def main():
    if not LATEST.exists():
        log('verify: no data/latest.json yet — nothing to verify')
        return 0
    today = json.loads(LATEST.read_text(encoding='utf-8'))
    day = today['trade_date']
    hist = read_index_history()
    prev_rows = [r for r in hist if r['date'] < day]
    prev_day = prev_rows[-1]['date'] if prev_rows else None
    checks, changes = [], {'previous_session': prev_day}

    # 1. Index continuity
    if prev_rows:
        p = num(prev_rows[-1]['index'])
        exp = round(today['index'] - p, 2)
        got = today.get('change')
        ok = got is not None and abs(got - exp) <= 0.02
        checks.append(check('index_continuity', 'Index change vs stored previous close', 'ok' if ok else 'error',
                            f'{prev_day} close {p:,.2f} → {day} {today["index"]:,.2f}: change {exp:+.2f}'
                            + ('' if ok else f', but the source reported {got}')))
        changes['index'] = {'prev': p, 'now': today['index'], 'change': exp,
                            'changePct': round(exp / p * 100, 2)}
    else:
        checks.append(check('index_continuity', 'Index change vs stored previous close', 'warn',
                             'No earlier close stored — first day of history'))

    # 2. Gaps between the previous stored day and today (weekday calendar,
    #    minus the holidays listed in data/reference/holidays.csv)
    if prev_day:
        d0, d1 = dt.date.fromisoformat(prev_day), dt.date.fromisoformat(day)
        between = [d0 + dt.timedelta(days=i) for i in range(1, (d1 - d0).days)]
        holidays = load_holidays()
        closed = [d.isoformat() for d in between if d.isoformat() in holidays]
        weekdays = [d.isoformat() for d in between
                    if d.weekday() < 5 and d.isoformat() >= MON_FRI_SINCE and d.isoformat() not in holidays]
        checks.append(check('history_gaps', 'No missing trading day since the previous session',
                            'ok' if not weekdays else 'warn',
                            ('Consecutive sessions' if not weekdays else
                             f'{len(weekdays)} weekday(s) without a stored close: {", ".join(weekdays)} '
                             '(a missed update — check the Actions log — or a holiday not yet in '
                             'data/reference/holidays.csv)')
                            + (f' · holiday: {", ".join(f"{d} {holidays[d]}" for d in closed)}' if closed else ''),
                            weekdays))

    # 3. Price continuity: today's "prev close" vs yesterday's stored LTP
    prices = today.get('prices') or []
    prev_file = PRICE_DIR / f'{prev_day}.csv' if prev_day else None
    if prices and prev_file and prev_file.exists():
        stored = {r['sym']: num(r['ltp']) for r in read_csv(prev_file)}
        readjusted_today = {r['symbol'] for r in read_csv(ADJ_LOG) if r['date'] == day}
        compared, adjusted, bad = 0, [], []
        for r in prices:
            y, pv = stored.get(r['sym']), r.get('prev')
            if not y or not pv:
                continue
            compared += 1
            if pct_diff(pv, y) > TOL_PCT:
                # Only a corporate action (bonus / rights) explains a changed previous
                # close — and then MeroLagani re-adjusted that company's history today
                # AND today's prev-close agrees with the re-adjusted history.
                _, hist_prev = last_close(STOCK_DIR / f"{r['sym']}.csv", before=day)
                explained = (r['sym'] in readjusted_today and hist_prev and pct_diff(pv, hist_prev) <= TOL_PCT)
                (adjusted if explained else bad).append(
                    {'sym': r['sym'], 'stored': y, 'prev_close': pv, 'diff_pct': round(pct_diff(pv, y), 2)})
        status = 'ok' if len(bad) <= 3 else 'warn' if len(bad) <= 15 else 'error'
        checks.append(check('price_continuity', "Today's prev-close = LTP stored for the previous session", status,
                            f'{compared - len(adjusted) - len(bad)}/{compared} match · {len(adjusted)} explained by '
                            f'corporate-action adjustment · {len(bad)} unexplained', adjusted + bad))
    else:
        checks.append(check('price_continuity', "Today's prev-close = LTP stored for the previous session", 'warn',
                            'No stored price list for the previous session yet (it builds up from the first daily run)'))

    # 4. Cross-source: ShareSansar LTP vs MeroLagani close, same day
    if prices:
        compared, bad = 0, []
        for r in prices:
            _, ml = last_close(STOCK_DIR / f"{r['sym']}.csv", on=day)
            if ml is None:
                continue
            compared += 1
            d = pct_diff(r['ltp'], ml)
            if d > TOL_PCT:
                bad.append({'sym': r['sym'], 'sharesansar': r['ltp'], 'merolagani': ml, 'diff_pct': round(d, 2)})
        if compared:
            status = 'ok' if len(bad) <= 5 else 'warn' if len(bad) <= 20 else 'error'
            checks.append(check('cross_source', 'ShareSansar LTP = MeroLagani close (same day)', status,
                                f'{compared - len(bad)}/{compared} agree within {TOL_PCT}%', bad))

    # 5. Sector indices present for today
    sec_files = sorted(SECTOR_DIR.glob('*.csv'))
    if sec_files:
        have, missing, moves = 0, [], []
        for f in sec_files:
            d_last, c_last = last_close(f)
            _, c_prev = last_close(f, before=day)
            if d_last == day:
                have += 1
                if c_prev:
                    moves.append({'sector': SECTOR_NAME.get(f.stem, f.stem), 'close': c_last, 'changePct': round((c_last / c_prev - 1) * 100, 2)})
            else:
                missing.append(f'{SECTOR_NAME.get(f.stem, f.stem)} (last {d_last})')
        checks.append(check('sector_indices', 'All sector indices have today\'s close',
                            'ok' if not missing else 'warn',
                            f'{have}/{len(sec_files)} updated' + (f' · missing: {", ".join(missing)}' if missing else ''), missing))
        changes['sectors'] = sorted(moves, key=lambda m: -m['changePct'])

    # 6. Breadth consistency
    g, l, u, s = (today.get(k) for k in ('gainers', 'losers', 'unchanged', 'scrips_traded'))
    if all(isinstance(v, int) for v in (g, l, u, s)):
        checks.append(check('breadth', 'Gainers + losers + unchanged = scrips traded',
                            'ok' if g + l + u == s else 'warn', f'{g} + {l} + {u} = {g + l + u} (scrips traded {s})'))

    # Changes since the previous session: breadth + turnover
    if prev_rows:
        pr = prev_rows[-1]
        changes['turnover'] = {'prev': num(pr.get('turnover')), 'now': today.get('turnover')}
        changes['breadth'] = {'prev': [num(pr.get('gainers')), num(pr.get('losers'))], 'now': [g, l]}

    # RRG quadrant changes vs the archived snapshot of the previous session
    snap_now = {r['symbol']: r for r in read_csv(RRG_DIR / f'{day}.csv')}
    snap_prev = {r['symbol']: r for r in read_csv(RRG_DIR / f'{prev_day}.csv')} if prev_day else {}
    if snap_now and snap_prev:
        moved = [{('sym' if r['kind'] == 'stock' else 'name'): s, 'kind': r['kind'], 'sector': r['sector'], 'from': snap_prev[s]['d_quadrant'], 'to': r['d_quadrant'],
                  'weekly': r['w_quadrant']}
                 for s, r in snap_now.items()
                 if s in snap_prev and r['d_quadrant'] and snap_prev[s]['d_quadrant'] and r['d_quadrant'] != snap_prev[s]['d_quadrant']]
        changes['rrg_moves'] = sorted(moved, key=lambda m: (m['kind'] != 'sector', m['to'], m.get('sym') or m.get('name')))
        changes['rrg_compared'] = len([s for s in snap_now if s in snap_prev])
    elif snap_now:
        changes['rrg_note'] = 'First archived RRG snapshot — quadrant changes appear from the next session.'

    status = 'error' if any(c['status'] == 'error' for c in checks) else \
             'warn' if any(c['status'] == 'warn' for c in checks) else 'ok'
    report = {'date': day, 'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
              'status': status, 'checks': checks, 'changes': changes}

    CHECK_DIR.mkdir(parents=True, exist_ok=True)
    # A re-run with an identical result keeps the earlier timestamp, so a no-op
    # retry leaves every file byte-identical and produces no commit.
    try:
        old = json.loads((CHECK_DIR / f'{day}.json').read_text(encoding='utf-8'))
        if {k: v for k, v in old.items() if k != 'generated_at'} == {k: v for k, v in report.items() if k != 'generated_at'}:
            report['generated_at'] = old['generated_at']
    except (OSError, ValueError, KeyError):
        pass
    (CHECK_DIR / f'{day}.json').write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8', newline='\n')
    rows = [r for r in read_csv(CHECK_CSV) if r['date'] != day]
    rows.append({'date': day, 'status': status, 'ok': sum(c['status'] == 'ok' for c in checks),
                 'warn': sum(c['status'] == 'warn' for c in checks), 'error': sum(c['status'] == 'error' for c in checks),
                 'rrg_moves': len(changes.get('rrg_moves', [])), 'generated_at': report['generated_at']})
    with CHECK_CSV.open('w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, lineterminator='\n', fieldnames=list(rows[-1].keys()))
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: r['date']))

    # Summary for the dashboard (items trimmed; full detail stays in the JSON)
    summary = clean_payload({**report, 'checks': [{**c, 'items': c['items'][:12]} for c in checks],
                             'changes': {**changes, 'rrg_moves': changes.get('rrg_moves', [])[:60]}})
    today['verification'] = summary
    write_atomic(LATEST, json.dumps(today, ensure_ascii=False, indent=1))
    inject_into_html(today)

    for c in checks:
        log(f"verify [{c['status'].upper():5}] {c['name']}: {c['detail']}")
    log(f'verify: {day} → {status.upper()} (report data/history/checks/{day}.json)')
    return 1 if status == 'error' else 0


if __name__ == '__main__':
    sys.exit(main())
