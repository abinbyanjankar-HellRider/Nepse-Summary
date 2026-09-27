#!/usr/bin/env python3
"""
Intraday live mode — during market hours (11:00 AM–3:00 PM NPT) the dashboard's
Market Summary, Heatmap and daily RRG follow the market minute by minute.

  python scripts/live_intraday.py              # serve the dashboard + poll every 60 s
  python scripts/live_intraday.py --once       # one poll, then exit
  python scripts/live_intraday.py --interval 90 --port 8765 --no-serve

Open http://127.0.0.1:8765/ while it runs and sign in (users: scripts/secure_server.py). Each poll reads ShareSansar's
live-trading page (LTP of every traded scrip + all indices) and writes

  data/live.json         market summary payload (same shape as data/latest.json)
  data/live_views.json   heatmap + RRG (same shape as data/market_views.json),
                         built from the stored histories with today's LTP as a
                         provisional last bar

Both files are provisional and git-ignored: nothing is added to the history.
The official close still comes from the daily update (scripts/run_daily.py) and
replaces the live figures on the page when it arrives.

Timing: polls from 10:50 AM until the page shows the market closed after
3:00 PM (one final write), then keeps serving the dashboard until --stay-until
(default 6 PM) so the page can pick up the 4 PM official close. If no session
has started for today by 11:45 AM (holiday), it stops polling.
"""
import argparse, datetime as dt, json, os, re, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bs4 import BeautifulSoup
from fetch_nepse import (ROOT, NPT, LATEST, log, num, get, parse_price_table, load_symbol_map,
                         derive_from_prices, read_index_history, clean_payload, merolagani_history)
import market_views as MV
import secure_server

LIVE_URL   = 'https://www.sharesansar.com/live-trading'
LIVE_JSON  = ROOT / 'data' / 'live.json'
LIVE_VIEWS = ROOT / 'data' / 'live_views.json'

# live-trading index tiles → market_views sector names
INDEX_TILES = {
    'Banking SubIndex':      'Commercial Banks',
    'Development Bank Ind.': 'Development Banks',
    'Finance Index':         'Finance',
    'Hotels And Tourism':    'Hotels & Tourism',
    'HydroPower Index':      'Hydropower',
    'Investment':            'Investment',
    'Life Insurance':        'Life Insurance',
    'Manufacturing And Pr.': 'Manufacturing & Processing',
    'Microfinance Index':    'Microfinance',
    'Mutual Fund':           'Mutual Fund',
    'Non Life Insurance':    'Non-Life Insurance',
    'Others Index':          'Others',
    'Trading Index':         'Trading',
}


# ── Parse ───────────────────────────────────────────────────────────────
def parse_live(html, symmap):
    soup = BeautifulSoup(html, 'html.parser')
    stamp = soup.select_one('#dDate')
    m = re.match(r'(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})', stamp.get_text(strip=True) if stamp else '')
    if not m:
        raise ValueError('no "As of" timestamp on the live-trading page')
    status = next((b.get_text(strip=True) for b in soup.select('#menu .btn, ul.pull-right .btn')
                   if 'market' in b.get_text(strip=True).lower()), '')
    tiles = {}
    for b in soup.select('div.mu-list'):
        name = b.h4.get_text(strip=True) if b.h4 else ''
        val, pct = b.select_one('.mu-value'), b.select_one('.mu-percent')
        to = b.select_one('.mu-price')
        if name and val and pct:
            tiles[name] = {'value': num(val.get_text(strip=True)), 'pct': num(pct.get_text(strip=True)),
                           'turnover': num(to.get_text(strip=True)) if to else None}
    rows = parse_price_table(html, symmap)
    return {'date': m.group(1), 'time': m.group(2), 'status': status, 'tiles': tiles, 'rows': rows}


# ── Build payloads ──────────────────────────────────────────────────────
def summary_payload(live, prev):
    nep = live['tiles'].get('NEPSE Index') or {}
    idx, pct = nep.get('value'), nep.get('pct')
    rows = live['rows']
    for r in rows:                      # per-scrip turnover is not published live: LTP × volume
        if r.get('turnover') is None and r.get('vol'):
            r['turnover'] = round(r['ltp'] * r['vol'], 2)
    d = derive_from_prices(rows)
    prev_close = idx / (1 + pct / 100) if idx and pct is not None else None
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    return {
        'trade_date': live['date'],
        'updated_at': now,
        'live': True,
        'as_of': f"{live['date']} {live['time']}",
        'status': live['status'],
        'index': idx,
        'change': round(idx - prev_close, 2) if prev_close else None,
        'changePct': pct,
        **d,
        # the exchange's own turnover (the per-scrip sum above is LTP × volume)
        'turnover': nep.get('turnover') or d['turnover'],
        'source': f"ShareSansar live-trading · provisional as of {live['time']} NPT",
        'prices': rows,
        # weekly / monthly summaries describe the stored history up to the last close
        'periods': prev.get('periods'),
    }


# Today's NEPSE candle for the chart. MeroLagani's chart feed is asked for
# today's bar first; if it has none yet, open/high/low are tracked from this
# script's own polls (open = first value seen, so it is approximate when the
# script starts after 11 AM).
_DAY = {}


def live_candle(live):
    idx = (live['tiles'].get('NEPSE Index') or {}).get('value')
    to = (live['tiles'].get('NEPSE Index') or {}).get('turnover')
    if idx is None:
        return None
    if _DAY.get('date') != live['date']:
        _DAY.clear()
        _DAY.update(date=live['date'], open=idx, high=idx, low=idx, source='polls')
    _DAY['high'], _DAY['low'] = max(_DAY['high'], idx), min(_DAY['low'], idx)
    try:
        bar = next((b for b in merolagani_history(start=live['date'], timeout=15)
                    if b['date'] == live['date'] and None not in (b['open'], b['high'], b['low'])), None)
    except Exception:
        bar = None
    o, h, l = (bar['open'], bar['high'], bar['low']) if bar else (_DAY['open'], _DAY['high'], _DAY['low'])
    return {'date': live['date'], 'open': round(o, 2), 'high': round(max(h, idx, o), 2),
            'low': round(min(l, idx, o), 2), 'close': idx, 'turnover': to,
            'source': 'merolagani' if bar else 'polls'}


def live_bar(live):
    return {
        'candle': live_candle(live),
        'date': live['date'],
        'index': (live['tiles'].get('NEPSE Index') or {}).get('value'),
        'turnover': (live['tiles'].get('NEPSE Index') or {}).get('turnover'),
        'sectors': {INDEX_TILES[k]: v['value'] for k, v in live['tiles'].items() if k in INDEX_TILES},
        'stocks': {r['sym']: (r['ltp'], r.get('vol')) for r in live['rows'] if r.get('vol')},
        'stock_turnover': {r['sym']: r.get('turnover') for r in live['rows']},
    }


def sane(live, last_close):
    idx = (live['tiles'].get('NEPSE Index') or {}).get('value')
    if not idx or len(live['rows']) < 50:
        return f"incomplete page (index {idx}, {len(live['rows'])} rows)"
    if last_close and abs(idx / last_close - 1) > 0.12:
        return f'index {idx} is >12% away from the last close {last_close}'
    return None


def write_json(path, obj):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8', newline='\n')
    for _ in range(10):                 # Windows: the file may be open by the web server for a moment
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            time.sleep(0.2)
    raise PermissionError(f'could not replace {path}')


# ── One poll ────────────────────────────────────────────────────────────
def poll(symmap, companies, html=None):
    """Returns (state, live) — state: 'live' | 'no-session' | 'error: …'."""
    try:
        live = parse_live(html if html is not None else get(LIVE_URL, timeout=30), symmap)
    except Exception as e:
        return f'error: {e}', None
    hist = read_index_history()
    last_day = hist[-1]['date'] if hist else ''
    if live['date'] <= last_day:
        return 'no-session', live      # page still shows a session already stored as a close
    why = sane(live, num(hist[-1]['index']) if hist else None)
    if why:
        return f'error: {why}', live
    prev = json.loads(LATEST.read_text(encoding='utf-8')) if LATEST.exists() else {}
    t0 = time.time()
    views = clean_payload(MV.build(companies, live=live_bar(live)))
    views['live'] = True
    views['as_of_time'] = live['time']
    write_json(LIVE_VIEWS, views)       # views first: the page reads live.json, then the views
    write_json(LIVE_JSON, clean_payload(summary_payload(live, prev)))
    nep = live['tiles']['NEPSE Index']
    log(f"live {live['date']} {live['time']} · {live['status'] or '?'} · NEPSE {nep['value']:,.2f} "
        f"({nep['pct']:+.2f}%) · {len(live['rows'])} scrips · views {time.time() - t0:.1f}s")
    return 'live', live


def npt_now():
    return dt.datetime.now(NPT)


def at(h, m):
    n = npt_now()
    return n.replace(hour=h, minute=m, second=0, microsecond=0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--interval', type=int, default=60, help='seconds between polls (min 30)')
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--host', default='127.0.0.1', help='127.0.0.1 = this PC only (see secure_server.py)')
    ap.add_argument('--no-serve', action='store_true', help='do not start the local web server')
    ap.add_argument('--once', action='store_true', help='poll once and exit')
    ap.add_argument('--html', help='test: parse this saved live-trading page instead of fetching')
    ap.add_argument('--stay-until', default='18:00', help='keep serving until this NPT time (HH:MM)')
    a = ap.parse_args()
    interval = max(30, a.interval)

    symmap = load_symbol_map()
    companies = MV.load_companies()
    html = Path(a.html).read_text(encoding='utf-8') if a.html else None

    if a.once:
        state, _ = poll(symmap, companies, html)
        log(f'poll: {state}')
        return 0 if state in ('live', 'no-session') else 1

    # the dashboard is only served behind the login (scripts/secure_server.py)
    srv = None if a.no_serve else secure_server.serve(a.port, a.host)
    start, give_up, hard_stop = at(10, 50), at(11, 45), at(15, 30)
    stay = at(*map(int, a.stay_until.split(':')))

    if npt_now() < start:
        log(f'waiting for 10:50 AM NPT ({(start - npt_now()).seconds // 60} min)…')
        while npt_now() < start:
            time.sleep(20)

    seen_session = False
    while npt_now() < hard_stop:
        state, live = poll(symmap, companies, html)
        if state == 'live':
            seen_session = True
            closed = 'closed' in (live['status'] or '').lower()
            if closed and live['time'] >= '15:00':
                log('market closed — final live snapshot written')
                break
        elif state == 'no-session':
            if seen_session:
                break
            if npt_now() >= give_up:
                log(f"no session today (page still shows {live['date']}) — public holiday or no trading")
                break
            log(f"waiting for today's session (page shows {live['date']} {live['time']})")
        else:
            log(state)
        time.sleep(interval)

    if srv:
        if npt_now() < stay:
            log(f'polling finished — still serving the dashboard until {a.stay_until} NPT (Ctrl+C to stop)')
            try:
                while npt_now() < stay:
                    time.sleep(30)
            except KeyboardInterrupt:
                pass
        srv.shutdown()
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
