#!/usr/bin/env python3
"""
Sanity checks for the dashboard data — run before anything is committed.

  python scripts/validate_data.py        # checks data/ and the embedded block

Also imported by fetch_nepse.py, which validates each new day's payload
before writing it. Exit code 1 = at least one error (details are printed);
warnings never fail the run.
"""
import csv, datetime as dt, functools, json, re, sys
from pathlib import Path
from zoneinfo import ZoneInfo

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT       = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / 'index.html'
LATEST     = ROOT / 'data' / 'latest.json'
INDEX_CSV  = ROOT / 'data' / 'history' / 'index.csv'
HOLIDAYS_CSV = ROOT / 'data' / 'reference' / 'holidays.csv'
NPT        = ZoneInfo('Asia/Kathmandu')

MON_FRI_SINCE = '2026-04-06'   # NEPSE moved from Sun–Thu to Mon–Fri
MAX_DAY_MOVE  = 0.10           # index circuit breakers halt trading long before ±10 %
MIN_PRICES    = 150            # a normal day has 300+ traded scrips
MAX_PCT_ROWS  = 5              # more rows beyond ±20 % means misaligned columns
SYM_RE        = re.compile(r'^[A-Z0-9]{1,12}$')


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


@functools.lru_cache(maxsize=1)
def load_holidays():
    """{date: name} from data/reference/holidays.csv — NEPSE closures on
    weekdays. verify_daily.py stops reporting a listed day as a missed update.
    Advisory only: a close found on a listed day is a warning, never a refusal,
    so a wrong entry (the list comes partly from secondary sources) cannot
    block a real session."""
    if not HOLIDAYS_CSV.exists():
        return {}
    with HOLIDAYS_CSV.open(newline='', encoding='utf-8') as f:
        return {r['date']: r.get('name', '') for r in csv.DictReader(f) if r.get('date')}


def check_trade_date(d, today=None):
    """Errors for a date NEPSE cannot have traded on."""
    errs = []
    today = today or dt.datetime.now(NPT).date().isoformat()
    try:
        wd = dt.date.fromisoformat(d).weekday()          # Mon=0 … Sun=6
    except (TypeError, ValueError):
        return [f'invalid trade date {d!r}']
    if d > today:
        errs.append(f'{d} is in the future')
    if wd == 5:
        errs.append(f'{d} is a Saturday — NEPSE never trades on Saturday')
    if wd == 6 and d >= MON_FRI_SINCE:
        errs.append(f'{d} is a Sunday — NEPSE trades Mon–Fri since {MON_FRI_SINCE}')
    return errs


def check_payload(p, prev_close=None, today=None):
    """Validate one day's payload. Returns (errors, warnings)."""
    errs, warns = [], []
    idx = _f(p.get('index'))
    if idx is None or not 1000 <= idx <= 6000:
        errs.append(f'index {p.get("index")!r} outside 1000–6000')
    errs += check_trade_date(p.get('trade_date'), today)
    if p.get('trade_date') in load_holidays():
        warns.append(f"{p['trade_date']} is listed as a holiday ({load_holidays()[p['trade_date']]}) "
                     'but has a close — check data/reference/holidays.csv')
    if idx and prev_close:
        move = idx / prev_close - 1
        if abs(move) > MAX_DAY_MOVE:
            errs.append(f'index moved {move:+.1%} vs previous close {prev_close} — implausible')
        if abs(idx - prev_close) < 0.005:
            errs.append(f'index {idx} equals the previous close — stale source (phantom day)')
        chg = _f(p.get('change'))
        if chg is not None and abs((idx - prev_close) - chg) > 1.0:
            warns.append(f'reported change {chg} ≠ index − previous close '
                         f'({idx - prev_close:.2f}); a day may be missing from history')

    prices = p.get('prices') or []
    if prices:
        if len(prices) < MIN_PRICES:
            errs.append(f'only {len(prices)} price rows (expected ≥ {MIN_PRICES})')
        bad_sym = [r.get('sym') for r in prices if not SYM_RE.match(str(r.get('sym', '')))]
        if bad_sym:
            errs.append(f'{len(bad_sym)} price rows with invalid symbols, e.g. {bad_sym[:3]}')
        dup = len(prices) - len({r.get('sym') for r in prices})
        if dup:
            errs.append(f'{dup} duplicate symbols in price list')
        nonpos = [r['sym'] for r in prices if not (_f(r.get('ltp')) or 0) > 0]
        if nonpos:
            errs.append(f'{len(nonpos)} rows with LTP ≤ 0, e.g. {nonpos[:3]}')
        wild = [r['sym'] for r in prices if abs(_f(r.get('pct')) or 0) > 20]
        if len(wild) > MAX_PCT_ROWS:
            errs.append(f'{len(wild)} rows moved > ±20 % (e.g. {wild[:3]}) — columns likely misaligned')
        elif wild:
            warns.append(f'rows moved > ±20 % (new listings/rights?): {wild}')
        to = _f(p.get('turnover'))
        if to is not None and not 1e8 <= to <= 1e11:
            errs.append(f'turnover Rs {to:,.0f} outside Rs 0.1–100 B')
        st = p.get('scrips_traded')
        if isinstance(st, int) and st > len(prices):
            errs.append(f'scrips_traded {st} > price rows {len(prices)}')
    return errs, warns


def check_history(rows, today=None):
    """Validate index.csv rows (sorted by date). Returns (errors, warnings)."""
    errs, warns = [], []
    dates = [r['date'] for r in rows]
    if dates != sorted(set(dates)):
        errs.append('index.csv dates are not unique and sorted')
    prev = None
    for r in rows:
        for e in check_trade_date(r['date'], today):
            errs.append(f'index.csv {e}')
        if r['date'] in load_holidays():
            warns.append(f"index.csv {r['date']}: listed as a holiday but has a close — check holidays.csv")
        v = _f(r['index'])
        if v is None or not 500 <= v <= 6000:
            errs.append(f'index.csv {r["date"]}: index {r["index"]!r} out of range')
            continue
        if prev:
            pd, pv = prev
            if abs(v - pv) < 0.005:
                errs.append(f'index.csv {r["date"]}: same close as {pd} ({v}) — phantom day')
            elif abs(v / pv - 1) > MAX_DAY_MOVE:
                errs.append(f'index.csv {r["date"]}: {v / pv - 1:+.1%} vs {pd} — implausible')
        prev = (r['date'], v)
    return errs, warns


def check_ohlc(candles, index_rows):
    """Validate index_ohlc.csv (NEPSE candles for the chart) against index.csv.
    Returns (errors, warnings)."""
    errs, warns = [], []
    dates = [c['date'] for c in candles]
    if dates != sorted(set(dates)):
        errs.append('index_ohlc.csv: dates are not unique and ascending')
    closes = {r['date']: _f(r['index']) for r in index_rows}
    for c in candles:
        o, h, l, cl = (_f(c[k]) for k in ('open', 'high', 'low', 'close'))
        if None in (o, h, l, cl):
            errs.append(f"index_ohlc.csv {c['date']}: missing open/high/low/close")
            continue
        if not (l <= min(o, cl) and h >= max(o, cl)):
            errs.append(f"index_ohlc.csv {c['date']}: high/low do not contain open/close")
        ref = closes.get(c['date'])
        if ref and abs(cl / ref - 1) > 0.005:
            errs.append(f"index_ohlc.csv {c['date']}: close {cl} differs from index.csv {ref} by >0.5%")
    if candles and index_rows:
        missing = [d for d in closes if dates[0] <= d and d not in set(dates)]
        if missing:
            warns.append(f'index_ohlc.csv: no candle for {len(missing)} trading day(s), e.g. {missing[-3:]} '
                         '(chart shows a gap; refreshed by market_views.py)')
    return errs, warns


def main():
    errs, warns = [], []
    rows = []
    if INDEX_CSV.exists():
        with INDEX_CSV.open(newline='', encoding='utf-8') as f:
            rows = list(csv.DictReader(f))
        e, w = check_history(rows)
        errs += e; warns += w
        print(f'index.csv: {len(rows)} rows checked')

    latest = None
    if LATEST.exists():
        latest = json.loads(LATEST.read_text(encoding='utf-8'))
        d = latest.get('trade_date')
        prev = [r for r in rows if r['date'] < (d or '')]
        e, w = check_payload(latest, _f(prev[-1]['index']) if prev else None)
        errs += [f'latest.json: {x}' for x in e]; warns += [f'latest.json: {x}' for x in w]
        if rows and rows[-1]['date'] != d:
            errs.append(f'latest.json is for {d} but index.csv ends at {rows[-1]["date"]}')
        print(f'latest.json: {d} checked')

    m = re.search(r'<script id="nepse-data" type="application/json">(.*?)</script>',
                  INDEX_HTML.read_text(encoding='utf-8'), re.S)
    if not m:
        errs.append('index.html has no <script id="nepse-data"> block')
    elif m.group(1).strip() != 'null':
        try:
            emb = json.loads(m.group(1))
            if latest and (emb.get('trade_date'), emb.get('index')) != (latest.get('trade_date'), latest.get('index')):
                errs.append('embedded data in index.html does not match latest.json')
        except json.JSONDecodeError as e:
            errs.append(f'embedded data in index.html is not valid JSON: {e}')

    ohlc_csv = ROOT / 'data' / 'history' / 'index_ohlc.csv'
    if ohlc_csv.exists():
        with ohlc_csv.open(newline='', encoding='utf-8') as f:
            candles = list(csv.DictReader(f))
        e, w = check_ohlc(candles, rows)
        errs += e; warns += w
        print(f'index_ohlc.csv: {len(candles)} candles checked')

    views = ROOT / 'data' / 'market_views.json'
    if views.exists():
        v = json.loads(views.read_text(encoding='utf-8'))
        if rows and v.get('as_of') != rows[-1]['date']:
            warns.append(f'market_views.json is for {v.get("as_of")}, index.csv ends at {rows[-1]["date"]} '
                         '(heatmap/RRG step failed or has not run — yesterday\'s views stay online)')
        hm = v.get('heatmap', {})
        if len(hm.get('stocks', [])) < 150:
            errs.append(f'heatmap has only {len(hm.get("stocks", []))} companies (expected ≥ 150)')
        if len(hm.get('sectors', [])) < 10:
            errs.append(f'heatmap has only {len(hm.get("sectors", []))} sector indices')
        for period in ('daily', 'weekly'):
            blk = v.get('rrg', {}).get(period, {})
            for name in ('sectors', 'universe'):
                syms = blk.get(name, {}).get('symbols', {})
                if len(syms) < (10 if name == 'sectors' else 150):
                    errs.append(f'RRG {period}/{name}: only {len(syms)} symbols')
                bad = [s for s, r in syms.items()
                       if not all(isinstance(z, (int, float)) and 50 < z < 150 for z in r.get('x', []) + r.get('y', []))]
                if bad:
                    errs.append(f'RRG {period}/{name}: implausible RS values for {bad[:5]}')
        print(f'market_views.json: {v.get("as_of")} checked')
        m2 = re.search(r'<script id="nepse-views" type="application/json">(.*?)</script>',
                       INDEX_HTML.read_text(encoding='utf-8'), re.S)
        if m2 and m2.group(1).strip() != 'null':
            try:
                if json.loads(m2.group(1)).get('as_of') != v.get('as_of'):
                    errs.append('embedded views in index.html do not match data/market_views.json')
            except json.JSONDecodeError as e:
                errs.append(f'embedded views in index.html are not valid JSON: {e}')

    for w in warns:
        print(f'WARNING: {w}')
    for e in errs[:50]:
        print(f'ERROR: {e}')
    if len(errs) > 50:
        print(f'… and {len(errs) - 50} more errors')
    print('Data OK' if not errs else f'{len(errs)} error(s) — do not commit')
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
