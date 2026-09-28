#!/usr/bin/env python3
"""
Heatmap + Relative Rotation Graph (RRG) data for the dashboard.

  python scripts/market_views.py --backfill   # first run: ~300 histories (≈5 min)
  python scripts/market_views.py              # daily: incremental update + rebuild

Inputs it maintains (all from public MeroLagani pages/APIs):
  data/reference/companies.csv          symbol, name, sector  (refreshed weekly)
  data/history/sectors/<code>.csv       daily close of the 13 NEPSE sector indices
  data/history/stocks/<SYM>.csv         daily adjusted close + volume per company
  data/history/index.csv                NEPSE benchmark (written by fetch_nepse.py)

Output:
  data/market_views.json and the <script id="nepse-views"> block in index.html
    heatmap: stock and sector % change, daily / weekly / monthly
    rrg:     RS-Ratio / RS-Momentum trails (daily + weekly) for
             sectors vs NEPSE, stocks vs NEPSE, stocks vs their sector index,
             current/previous quadrant and quadrant-crossover signals

RRG method (the JdK formula is proprietary; this is an open approximation with
the same 14-period z-score scale as chukul.com's rs_ratio_14/rs_momentum_14,
smoothed so quadrants do not flip on daily noise — tested on 2024–26 NEPSE
data: 1.5 quadrant changes per stock per 10 sessions vs 5.9 unsmoothed):
  RS           = EMA₁₀(100 · price / benchmark)
  RS-Ratio     = 100 + (RS − SMA₁₄(RS)) / SD₁₄(RS)
  ROC          = EMA₅(100 · (RS-Ratio / RS-Ratio₋₅ − 1))
  RS-Momentum  = 100 + (ROC − SMA₁₄(ROC)) / SD₁₄(ROC)
  Leading  ratio ≥ 100, momentum ≥ 100   Weakening ratio ≥ 100, momentum < 100
  Lagging  ratio < 100, momentum < 100   Improving ratio < 100, momentum ≥ 100
"""
import argparse, csv, datetime as dt, json, math, re, statistics, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_nepse import (ROOT, INDEX_HTML, HEADERS, NPT, log, num, get, merolagani_history,
                         read_index_history, period_key, clean_payload, write_atomic)
from bs4 import BeautifulSoup

REF_DIR     = ROOT / 'data' / 'reference'
COMPANIES   = REF_DIR / 'companies.csv'
SECTOR_DIR  = ROOT / 'data' / 'history' / 'sectors'
STOCK_DIR   = ROOT / 'data' / 'history' / 'stocks'
VIEWS_JSON  = ROOT / 'data' / 'market_views.json'
ADJ_LOG     = ROOT / 'data' / 'history' / 'adjustments.csv'   # histories re-adjusted (bonus/rights)
RRG_ARCHIVE = ROOT / 'data' / 'history' / 'rrg'          # one CSV per trading day, never rewritten
RRG_FIELDS  = ['symbol', 'kind', 'sector', 'd_ratio', 'd_momentum', 'd_quadrant', 'd_quadrant_vs_sector',
               'w_ratio', 'w_momentum', 'w_quadrant', 'w_quadrant_vs_sector']
COMPANY_URL = 'https://merolagani.com/CompanyList.aspx'

START  = '2024-01-01'     # enough for weekly RRG (2×14 weeks warm-up + trail)
N      = 14               # RS-Ratio / RS-Momentum window
RS_EMA, ROC_LAG, ROC_EMA = 10, 5, 5   # smoothing (see module docstring)
TRAIL  = 12               # points kept per symbol for the tails
SIGNAL_DAYS, SIGNAL_WEEKS = 10, 8   # crossovers kept (daily flips are frequent)
PAUSE  = 0.25             # seconds between API calls (be polite)

# company-list heading → (display name, MeroLagani sector-index symbol)
SECTORS = {
    'Commercial Banks':             ('Commercial Banks',           'BANKING'),
    'Development Bank Limited':     ('Development Banks',          'DEVELOPMENT BANK'),
    'Finance':                      ('Finance',                    'FINANCE'),
    'Hotels And Tourism':           ('Hotels & Tourism',           'HOTELS AND TOURISM'),
    'Hydro Power':                  ('Hydropower',                 'HYDROPOWER'),
    'Investment':                   ('Investment',                 'INVESTMENT'),
    'Life Insurance':               ('Life Insurance',             'LIFE INSURANCE'),
    'Manufacturing And Processing': ('Manufacturing & Processing', 'MANU.AND PRO.'),
    'Microfinance':                 ('Microfinance',               'MICROFINANCE'),
    'Mutual Fund':                  ('Mutual Fund',                'MUTUAL FUND'),
    'Non-Life Insurance':           ('Non-Life Insurance',         'NON-LIFE INSURANCE'),
    'Others':                       ('Others',                     'OTHERS'),
    'Tradings':                     ('Trading',                    'TRADING'),
}
NOT_IN_STOCK_UNIVERSE = {'Mutual Fund'}   # fund units, not companies
STOCK_BOUNDS = (1, 200000)


def slug(code):
    return re.sub(r'[^a-z0-9]+', '-', code.lower()).strip('-')


# ── Reference: company → sector ─────────────────────────────────────────
def refresh_companies(force=False):
    if COMPANIES.exists() and not force:
        age = time.time() - COMPANIES.stat().st_mtime
        if age < 7 * 86400:
            return load_companies()
    soup = BeautifulSoup(get(COMPANY_URL, timeout=60), 'html.parser')
    rows = []
    for panel in soup.select('.panel'):
        head = panel.select_one('.panel-title, .panel-heading')
        sector = SECTORS.get(head.get_text(' ', strip=True)) if head else None
        if not sector:
            continue                                   # debentures, bonds, promoter shares
        for tr in panel.select('tr'):
            a = tr.select_one('a[href*="CompanyDetail.aspx?symbol="]')
            tds = tr.find_all('td')
            if a and len(tds) >= 2:
                sym = a.get_text(strip=True).upper()
                if re.fullmatch(r'[A-Z0-9]{2,12}', sym):
                    rows.append({'symbol': sym, 'name': tds[1].get_text(' ', strip=True), 'sector': sector[0]})
    if len(rows) < 200:
        raise SystemExit(f'Company list looks wrong ({len(rows)} rows) — not overwriting {COMPANIES}')
    REF_DIR.mkdir(parents=True, exist_ok=True)
    with COMPANIES.open('w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, lineterminator='\n', fieldnames=['symbol', 'name', 'sector'])
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r['sector'], r['symbol'])))
    log(f'companies.csv: {len(rows)} securities in {len({r["sector"] for r in rows})} sectors')
    return rows


def load_companies():
    with COMPANIES.open(newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


# ── Price histories ─────────────────────────────────────────────────────
def load_series(path):
    if not path.exists():
        return []
    with path.open(newline='', encoding='utf-8') as f:
        return [(r['date'], float(r['close']), num(r.get('volume'))) for r in csv.DictReader(f)]


def save_series(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['date', 'close', 'volume'])
        for d, c, v in rows:
            w.writerow([d, round(c, 2), '' if v is None else round(v)])


def refresh_series(symbol, path, bounds, full=False):
    """Fetch a symbol's adjusted daily closes. Incremental: re-reads the last 30
    sessions; if those changed (bonus/rights re-adjustment) the full history is
    fetched again so the series stays internally consistent."""
    old = [] if full else load_series(path)
    fetch = lambda start: [(b['date'], b['index'], b['turnover'])
                           for b in merolagani_history(start=start, symbol=symbol, bounds=bounds)]
    if not old:
        new = fetch(START)
        status = 'full'
    else:
        new = fetch(old[-30][0] if len(old) > 30 else START)
        stored = {d: c for d, c, _ in old}
        if any(d in stored and abs(c / stored[d] - 1) > 0.005 for d, c, _ in new):
            new, old, status = fetch(START), [], 'readjusted'
        else:
            status = 'updated'
    if not new and not old:
        return 'empty'
    merged = {d: (d, c, v) for d, c, v in old}
    merged.update({d: (d, c, v) for d, c, v in new})
    save_series(path, [merged[d] for d in sorted(merged)])
    return status


def refresh_histories(companies, full=False):
    todo = [(code, SECTOR_DIR / f'{slug(code)}.csv', (1, 100000)) for _, code in SECTORS.values()]
    todo += [(c['symbol'], STOCK_DIR / f"{c['symbol']}.csv", STOCK_BOUNDS)
             for c in companies if c['sector'] not in NOT_IN_STOCK_UNIVERSE]
    stats, readjusted = {}, []
    for i, (sym, path, bounds) in enumerate(todo, 1):
        for attempt in range(3):
            try:
                st = refresh_series(sym, path, bounds, full)
                break
            except Exception as e:
                st = f'error: {e}'
                time.sleep(2 * (attempt + 1))
        stats[st if not st.startswith('error') else 'error'] = stats.get(st if not st.startswith('error') else 'error', 0) + 1
        if st.startswith('error'):
            log(f'{sym}: {st}')
        if st == 'readjusted':
            readjusted.append(sym)
        if i % 50 == 0:
            log(f'  {i}/{len(todo)} histories …')
        time.sleep(PAUSE)
    log(f'histories: {stats}')
    if readjusted and not full:
        # Audit trail: verify_daily.py only accepts a changed previous close as a
        # corporate action when the company's history was re-adjusted today
        day = (read_index_history() or [{}])[-1].get('date', '')
        new = not ADJ_LOG.exists()
        with ADJ_LOG.open('a', newline='', encoding='utf-8') as f:
            w = csv.writer(f, lineterminator='\n')
            if new:
                w.writerow(['date', 'symbol'])
            for s in readjusted:
                w.writerow([day, s])
        log(f're-adjusted histories (corporate actions): {", ".join(readjusted)}')
    return stats


# ── NEPSE index candles (TradingView Lightweight Charts panel) ──────────
OHLC_CSV    = ROOT / 'data' / 'history' / 'index_ohlc.csv'
OHLC_FIELDS = ['date', 'open', 'high', 'low', 'close', 'turnover']
OHLC_START  = '2020-01-01'


def load_ohlc():
    if not OHLC_CSV.exists():
        return []
    with OHLC_CSV.open(newline='', encoding='utf-8') as f:
        return [{k: (r[k] if k == 'date' else num(r[k])) for k in OHLC_FIELDS} for r in csv.DictReader(f)]


def refresh_index_ohlc(full=False):
    """Daily NEPSE open/high/low/close/turnover from MeroLagani. Incremental:
    re-reads the last 10 stored sessions (a late correction replaces them)."""
    old = [] if full else load_ohlc()
    start = old[-10]['date'] if len(old) > 10 else OHLC_START
    merged = {r['date']: r for r in old}
    for b in merolagani_history(start=start):
        if None in (b['open'], b['high'], b['low'], b['index']):
            continue
        o, c = round(b['open'], 2), b['index']
        # the source occasionally has high/low a rounding step inside open/close
        # (once, 2021-03-03, the open is 20 pts above the high): widen to contain both
        h, l = max(round(b['high'], 2), o, c), min(round(b['low'], 2), o, c)
        if h - b['high'] > 0.5 or b['low'] - l > 0.5:
            log(f"NEPSE candle {b['date']}: high/low widened to contain open/close "
                f"(source O {o} H {b['high']} L {b['low']} C {c})")
        merged[b['date']] = {'date': b['date'], 'open': o, 'high': h, 'low': l, 'close': c,
                             'turnover': b['turnover']}
    rows = [merged[d] for d in sorted(merged)]
    OHLC_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OHLC_CSV.open('w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=OHLC_FIELDS, lineterminator='\n')
        w.writeheader()
        w.writerows(rows)
    log(f'NEPSE candles: {len(rows)} stored, last {rows[-1]["date"] if rows else "—"}')
    return rows


def ohlc_block(rows, candle=None):
    """Compact arrays for the page. candle: today's provisional bar (live mode)."""
    rows = list(rows)
    if candle and candle.get('close') is not None:
        if rows and rows[-1]['date'] == candle['date']:
            rows[-1] = candle
        elif not rows or rows[-1]['date'] < candle['date']:
            rows.append(candle)
    r2 = lambda v: round(v, 2) if isinstance(v, (int, float)) else None
    return {
        'dates': [r['date'] for r in rows],
        'o': [r2(r['open']) for r in rows], 'h': [r2(r['high']) for r in rows],
        'l': [r2(r['low']) for r in rows], 'c': [r2(r['close']) for r in rows],
        'v_cr': [round(r['turnover'] / 1e7, 2) if r.get('turnover') else None for r in rows],   # Rs crore
        'live': bool(candle and rows and rows[-1] is candle),
    }


# ── RRG maths ───────────────────────────────────────────────────────────
def zscore_series(vals, n):
    out = [None] * len(vals)
    for i in range(n - 1, len(vals)):
        win = vals[i - n + 1:i + 1]
        if any(v is None for v in win):
            continue
        # plain float maths: statistics.pstdev works in exact fractions and made
        # a full build take minutes (too slow for scripts/live_intraday.py)
        mean = sum(win) / n
        sd = math.sqrt(sum((v - mean) ** 2 for v in win) / n)
        out[i] = 100 + (vals[i] - mean) / sd if sd > 0 else 100.0
    return out


def ema(vals, n):
    """EMA that restarts after a gap (None)."""
    out, a, e = [], 2 / (n + 1), None
    for v in vals:
        if v is None:
            e = None
            out.append(None)
            continue
        e = v if e is None else e + a * (v - e)
        out.append(e)
    return out


def rrg(prices, bench, n=N):
    """prices, bench: aligned lists of closes. Returns [(ratio, momentum)|None…]."""
    rs = ema([100 * p / b if p and b else None for p, b in zip(prices, bench)], RS_EMA)
    ratio = zscore_series(rs, n)
    k = ROC_LAG
    roc = [None] * k + [100 * (ratio[i] / ratio[i - k] - 1) if ratio[i] and ratio[i - k] else None
                        for i in range(k, len(ratio))]
    mom = zscore_series(ema(roc, ROC_EMA), n)
    return [(r, m) if r is not None and m is not None else None for r, m in zip(ratio, mom)]


def quadrant(r, m):
    if r >= 100:
        return 'Leading' if m >= 100 else 'Weakening'
    return 'Improving' if m >= 100 else 'Lagging'


def align(series, dates):
    """Close for each benchmark date, forward-filled across days without trades
    (at most 5 sessions); None before the first trade."""
    m = {d: c for d, c, _ in series}
    out, last, gap = [], None, 0
    for d in dates:
        if d in m:
            last, gap = m[d], 0
        else:
            gap += 1
            if gap > 5:
                last = None
        out.append(last)
    return out


def to_weekly(dates, *cols):
    """Last value of each week (weeks end on Saturday, see period_key)."""
    idx = {}
    for i, d in enumerate(dates):
        idx[period_key(d, 'week')] = i
    keep = [idx[k] for k in sorted(idx)]
    return [dates[i] for i in keep], [[c[i] for i in keep] for c in cols]


def rrg_block(dates, bench, members, n_trail, signal_span, key='sym'):
    """members: {symbol: closes aligned to dates}. Returns the payload block.
    Dates are stored once per block ('dates'); each symbol's trail points refer
    to them by index ('i') to keep the embedded payload small."""
    out, signals, first = {}, [], len(dates)
    for sym, closes in members.items():
        pts = rrg(closes, bench)
        valid = [(i, p) for i, p in enumerate(pts) if p]
        if len(valid) < 2:
            continue
        tail = valid[-n_trail:]
        first = min(first, tail[0][0])
        out[sym] = {
            'i': [i for i, _ in tail],
            'x': [round(p[0], 2) for _, p in tail],
            'y': [round(p[1], 2) for _, p in tail],
            'q': quadrant(*tail[-1][1]), 'pq': quadrant(*tail[-2][1]),
        }
        valid = [(dates[i], p) for i, p in valid]
        # quadrant changes within the signal window
        for (d0, p0), (d1, p1) in zip(valid[-signal_span - 1:-1], valid[-signal_span:]):
            a, b = quadrant(*p0), quadrant(*p1)
            if a != b:
                signals.append({'date': d1, key: sym, 'from': a, 'to': b,
                                'x': round(p1[0], 1), 'y': round(p1[1], 1)})
    signals.sort(key=lambda s: (s['date'], s[key]), reverse=True)
    first = min(first, len(dates) - 1) if dates else 0
    for r in out.values():
        r['i'] = [i - first for i in r['i']]
    return {'as_of': dates[-1] if dates else None, 'dates': dates[first:],
            'symbols': out, 'signals': signals}


# ── Heatmap maths ───────────────────────────────────────────────────────
def pct_changes(series):
    """% change of the last close vs the previous session, previous week's
    close and previous month's close."""
    if len(series) < 2:
        return None
    d_last, c_last = series[-1][0], series[-1][1]
    res = {'close': round(c_last, 2), 'date': d_last,
           'd': round((c_last / series[-2][1] - 1) * 100, 2)}
    for kind, key in (('week', 'w'), ('month', 'm')):
        cur = period_key(d_last, kind)
        prev = [c for d, c, _ in series if period_key(d, kind) < cur]
        res[key] = round((c_last / prev[-1] - 1) * 100, 2) if prev else None
    return res


# ── Build ───────────────────────────────────────────────────────────────
def add_bar(series, day, close, volume=None):
    """Put a provisional bar for `day` on the end of a (date, close, volume) list."""
    if close is None:
        return
    if series and series[-1][0] == day:
        series[-1] = (day, close, volume)
    elif not series or series[-1][0] < day:
        series.append((day, close, volume))


def build(companies, live=None):
    """live (scripts/live_intraday.py): today's provisional values added as the
    last bar — {'date', 'index', 'turnover', 'sectors': {name: close},
    'stocks': {sym: (ltp, volume)}, 'stock_turnover': {sym: rs}}."""
    hist = [(r['date'], num(r['index']), num(r['turnover'])) for r in read_index_history()
            if num(r['index'])]
    if live:
        add_bar(hist, live['date'], live['index'], live.get('turnover'))
    if len(hist) < 60:
        raise SystemExit('data/history/index.csv is too short — run backfill_history.py first')
    dates = [d for d, _, _ in hist[-400:]]
    bench = [c for _, c, _ in hist[-400:]]

    sector_series = {name: load_series(SECTOR_DIR / f'{slug(code)}.csv') for name, code in SECTORS.values()}
    stock_series = {c['symbol']: load_series(STOCK_DIR / f"{c['symbol']}.csv")
                    for c in companies if c['sector'] not in NOT_IN_STOCK_UNIVERSE}
    meta = {c['symbol']: {'name': c['name'], 'sector': c['sector']} for c in companies}
    if live:
        for name, s in sector_series.items():
            add_bar(s, live['date'], live['sectors'].get(name))
        for sym, s in stock_series.items():
            add_bar(s, live['date'], *live['stocks'].get(sym, (None, None)))

    # Latest turnover for tile sizes, from today's price list (fetch_nepse output)
    turnover = dict(live['stock_turnover']) if live else {}
    latest = ROOT / 'data' / 'latest.json'
    if not live and latest.exists():
        for p in json.loads(latest.read_text(encoding='utf-8')).get('prices', []):
            turnover[p['sym']] = p.get('turnover')

    # ---- heatmap
    heat_stocks = []
    recent = set(dates[-10:])
    for sym, s in stock_series.items():
        ch = pct_changes(s)
        if not ch or ch['date'] not in recent:      # suspended / delisted: skip
            continue
        if ch['date'] != dates[-1]:
            ch['d'] = None                          # no trade on the latest session
        heat_stocks.append({'sym': sym, **meta[sym], **ch, 'to': turnover.get(sym)})
    heat_sectors = []
    for name, s in sector_series.items():
        ch = pct_changes(s)
        if ch:
            members = [h for h in heat_stocks if h['sector'] == name]
            heat_sectors.append({'sector': name, **ch, 'stocks': len(members),
                                 'to': round(sum(h['to'] or 0 for h in members), 2) or None})
    bench_ch = pct_changes([(d, c, None) for d, c, _ in hist])

    # ---- RRG (daily + weekly)
    views = {}
    wdates, (wbench,) = to_weekly(dates, bench)
    for period, dts, bch, span in (('daily', dates, bench, SIGNAL_DAYS), ('weekly', wdates, wbench, SIGNAL_WEEKS)):
        def closes(series):
            a = align(series, dates)
            return a if period == 'daily' else to_weekly(dates, a)[1][0]
        sec_closes = {n: closes(s) for n, s in sector_series.items() if s}
        stk_closes = {sym: closes(s) for sym, s in stock_series.items() if len(s) > 2 * N + 2}
        by_sector = {}
        for sym in stk_closes:
            by_sector.setdefault(meta[sym]['sector'], []).append(sym)
        views[period] = {
            # sector names are not tickers: signals carry 'name' (the page's safety
            # filter only lets plain tickers through under 'sym')
            'sectors':  rrg_block(dts, bch, sec_closes, TRAIL, span, key='name'),
            'universe': rrg_block(dts, bch, stk_closes, TRAIL, span),
            # each stock against its own sector index
            'in_sector': {sec: rrg_block(dts, sec_closes[sec], {s: stk_closes[s] for s in syms}, TRAIL, span)
                          for sec, syms in by_sector.items() if sec in sec_closes},
        }

    return {
        'as_of': dates[-1],
        'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
        'benchmark': {'symbol': 'NEPSE', **(bench_ch or {})},
        'sectors': [{'name': n, 'code': c} for n, c in SECTORS.values()],
        'companies': {s: m for s, m in meta.items() if s in stock_series},
        'heatmap': {'stocks': heat_stocks, 'sectors': heat_sectors},
        'ohlc': ohlc_block(load_ohlc(), (live or {}).get('candle')),
        'rrg': {'params': {'n': N, 'trail': TRAIL, 'rs_ema': RS_EMA, 'roc_lag': ROC_LAG, 'roc_ema': ROC_EMA,
                           'method': 'smoothed z-score approximation of JdK RS-Ratio / RS-Momentum'},
                **views},
    }


def archive_snapshot(payload):
    """Store the day's RRG positions as data/history/rrg/<date>.csv. The recomputed
    history can shift slightly when prices are re-adjusted, so what the dashboard
    showed on each day is kept as-is for later reference. Existing days are not
    overwritten unless the file is for the same, still-open trading date."""
    day = payload['as_of']
    path = RRG_ARCHIVE / f'{day}.csv'
    R = payload['rrg']
    last = lambda blk, s, k: (blk['symbols'].get(s) or {}).get(k)
    def tip(blk, s):
        r = blk['symbols'].get(s)
        return (r['x'][-1], r['y'][-1], r['q']) if r and blk['dates'][r['i'][-1]] == blk['as_of'] else (None, None, None)
    rows = []
    for kind, name_blk in (('sector', 'sectors'), ('stock', 'universe')):
        for s in sorted(R['daily'][name_blk]['symbols']):
            sec = s if kind == 'sector' else payload['companies'].get(s, {}).get('sector', '')
            dx, dy, dq = tip(R['daily'][name_blk], s)
            wx, wy, wq = tip(R['weekly'][name_blk], s)
            dvs = last(R['daily']['in_sector'].get(sec, {'symbols': {}}), s, 'q') if kind == 'stock' else ''
            wvs = last(R['weekly']['in_sector'].get(sec, {'symbols': {}}), s, 'q') if kind == 'stock' else ''
            rows.append({'symbol': s, 'kind': kind, 'sector': sec, 'd_ratio': dx, 'd_momentum': dy, 'd_quadrant': dq,
                         'd_quadrant_vs_sector': dvs, 'w_ratio': wx, 'w_momentum': wy, 'w_quadrant': wq,
                         'w_quadrant_vs_sector': wvs})
    RRG_ARCHIVE.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, lineterminator='\n', fieldnames=RRG_FIELDS)
        w.writeheader()
        w.writerows(rows)
    log(f'archived RRG snapshot {path.relative_to(ROOT)} ({len(rows)} rows)')


def inject(payload):
    html = INDEX_HTML.read_text(encoding='utf-8')
    blob = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    pat = re.compile(r'(<script id="nepse-views" type="application/json">)(.*?)(</script>)', re.S)
    if not pat.search(html):
        raise SystemExit('index.html has no <script id="nepse-views"> block')
    write_atomic(INDEX_HTML, pat.sub(lambda m: m.group(1) + blob + m.group(3), html, count=1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--backfill', action='store_true', help='fetch full histories for every symbol')
    ap.add_argument('--no-fetch', action='store_true', help='rebuild from stored histories only')
    ap.add_argument('--force', action='store_true', help='rebuild even if already built for the latest close')
    args = ap.parse_args()

    latest_trade = (read_index_history() or [{}])[-1].get('date')
    if VIEWS_JSON.exists() and not (args.force or args.backfill):
        prev = json.loads(VIEWS_JSON.read_text(encoding='utf-8'))
        latest = ROOT / 'data' / 'latest.json'
        prices_at = json.loads(latest.read_text(encoding='utf-8')).get('updated_at', '') if latest.exists() else ''
        # rebuild when today's price list (turnover for tile sizes) is newer than the views
        if prev.get('as_of') == latest_trade and prev.get('generated_at', '') >= prices_at:
            log(f'market views already built for {latest_trade}. Nothing to do.')
            return 0

    companies = refresh_companies(force=args.backfill)
    if not args.no_fetch:
        refresh_histories(companies, full=args.backfill)
        try:
            refresh_index_ohlc(full=args.backfill)
        except Exception as e:                  # chart keeps the stored candles
            log(f'NEPSE candles not refreshed: {e}')
    payload = clean_payload(build(companies))
    write_atomic(VIEWS_JSON, json.dumps(payload, ensure_ascii=False, separators=(',', ':')))
    inject(payload)
    archive_snapshot(payload)
    r = payload['rrg']['daily']
    log(f"market views {payload['as_of']}: heatmap {len(payload['heatmap']['stocks'])} stocks / "
        f"{len(payload['heatmap']['sectors'])} sectors · RRG daily {len(r['universe']['symbols'])} stocks, "
        f"{len(r['sectors']['symbols'])} sectors, {len(r['universe']['signals'])} universe signals · "
        f"{VIEWS_JSON.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == '__main__':
    sys.exit(main())
