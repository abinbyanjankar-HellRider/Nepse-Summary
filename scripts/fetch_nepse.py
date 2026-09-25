#!/usr/bin/env python3
"""
NEPSE daily data updater for the Wyckoff dashboard.

Runs in GitHub Actions after market close (Mon–Fri, 4:00 PM NPT) and:
  1. Scrapes the full price list from sharesansar.com/today-share-price
  2. Reads the NEPSE index from public pages (ShareSansar / MeroLagani)
  3. Falls back to the Claude API + web search when a source fails
     (only if the ANTHROPIC_API_KEY secret is set — never exposed to browsers)
  4. Writes data/latest.json, data/history/index.csv,
     data/history/prices/YYYY-MM-DD.csv
  5. Rewrites the <script id="nepse-data"> block inside index.html,
     so the dashboard stays a single self-contained file.

Exit codes: 0 = updated or nothing to do (weekend/holiday/already done)
            1 = could not get the NEPSE index — the workflow fails and
                GitHub emails you, and yesterday's data stays live.
"""
import argparse, csv, datetime as dt, json, os, re, statistics, sys
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_data import SYM_RE, check_payload

if hasattr(sys.stdout, 'reconfigure'):          # Windows consoles default to cp1252
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT       = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / 'index.html'
DATA_DIR   = ROOT / 'data'
HIST_DIR   = DATA_DIR / 'history'
PRICE_DIR  = HIST_DIR / 'prices'
LATEST     = DATA_DIR / 'latest.json'
INDEX_CSV  = HIST_DIR / 'index.csv'
NPT        = ZoneInfo('Asia/Kathmandu')

SS_PRICE_URL = 'https://www.sharesansar.com/today-share-price'
ML_CHART_URL = 'https://merolagani.com/handlers/TechnicalChartHandler.ashx'
INDEX_URLS   = ['https://www.sharesansar.com/',
                'https://merolagani.com/LatestMarket.aspx',
                'https://www.sharesansar.com/market']
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
}
MODEL = os.getenv('CLAUDE_MODEL', 'claude-sonnet-4-6')
INDEX_CSV_FIELDS = ['date', 'index', 'change', 'changePct', 'turnover', 'traded_shares',
                    'transactions', 'scrips_traded', 'gainers', 'losers', 'unchanged', 'source']


def log(msg):
    print(f'[fetch_nepse] {msg}', flush=True)


def num(v):
    """'1,234.56' → 1234.56 ; '-', '' → None ; '(1.5)' → -1.5 ; '−2' → -2"""
    if v is None:
        return None
    s = str(v).strip().replace(',', '').replace('%', '').replace('Rs.', '').replace('Rs', '')
    s = s.replace('\u2212', '-').replace(' ', '').strip()
    if s in ('', '-', '--', 'N/A', 'NA'):
        return None
    neg = s.startswith('(') and s.endswith(')')
    s = s.strip('()')
    try:
        f = float(s)
        return -f if neg else f
    except ValueError:
        return None


def get(url, timeout=30):
    r = requests.get(url, headers=HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.text


# ── Symbol → name / sector map (taken from the dashboard itself) ──
def load_symbol_map():
    m = {}
    ref = ROOT / 'data' / 'reference' / 'companies.csv'     # full list (market_views.py)
    if ref.exists():
        with ref.open(newline='', encoding='utf-8') as f:
            for r in csv.DictReader(f):
                m[r['symbol']] = (r['name'], r['sector'])
    html = INDEX_HTML.read_text(encoding='utf-8')
    for s, n, sec in re.findall(r"\{s:'([A-Z0-9]+)',n:'([^']*)',sec:'([^']*)'\}", html):
        m.setdefault(s, (n, sec))
    for s, n, sec in re.findall(r"\['([A-Z0-9]+)','([^']*)','([^']*)',[\d.\-]", html):
        m.setdefault(s, (n, sec))
    return m


# ── ShareSansar price table ──────────────────────────────────
HEADER_MAP = {
    'symbol': 'sym', 'conf': 'conf', 'open': 'open', 'high': 'high', 'low': 'low',
    'close': 'close', 'ltp': 'ltp', 'vwap': 'vwap', 'vol': 'vol', 'volume': 'vol',
    'prevclose': 'prev', 'previousclose': 'prev', 'prevclosing': 'prev',
    'turnover': 'turnover', 'trans': 'txns', 'notrans': 'txns', 'transactions': 'txns',
    'nooftransactions': 'txns', 'diff': 'change', 'change': 'change', 'pointchange': 'change',
    'diffpct': 'pct', 'changepct': 'pct', 'pctchange': 'pct',
    '52weekshigh': 'w52h', '52weekhigh': 'w52h', '52wh': 'w52h',
    '52weekslow': 'w52l', '52weeklow': 'w52l', '52wl': 'w52l',
}


def norm_header(h):
    h = h.lower().replace('%', ' pct')
    return re.sub(r'[^a-z0-9]', '', h)


def parse_price_table(html, symmap):
    soup = BeautifulSoup(html, 'html.parser')
    for table in soup.find_all('table'):
        first = table.find('tr')
        head_cells = table.select('thead th') or (first.find_all(['th', 'td']) if first else [])
        fields = [HEADER_MAP.get(norm_header(c.get_text(' ', strip=True))) for c in head_cells]
        if 'sym' not in fields or not ({'close', 'ltp'} & set(fields)):
            continue
        body_rows = table.select('tbody tr') or table.find_all('tr')[1:]
        rows = []
        for tr in body_rows:
            tds = tr.find_all('td')
            if len(tds) < len(fields) - 2:
                continue
            rec = {}
            for f, td in zip(fields, tds):
                if not f:
                    continue
                if f == 'sym':
                    rec['sym'] = td.get_text(strip=True).upper()
                    a = td.find('a')
                    if a and a.get('title'):
                        rec['name'] = a['title'].strip()
                else:
                    rec[f] = num(td.get_text(strip=True))
            sym = rec.get('sym', '')
            if not re.fullmatch(r'[A-Z0-9]{2,12}', sym):
                continue
            ltp = rec.get('ltp') if rec.get('ltp') is not None else rec.get('close')
            if ltp is None:
                continue
            prev = rec.get('prev')
            chg = rec.get('change')
            if chg is None and prev:
                chg = round(ltp - prev, 2)
            pct = rec.get('pct')
            if pct is None and prev:
                pct = round((ltp - prev) / prev * 100, 2)
            name, sector = symmap.get(sym, (rec.get('name') or sym, 'Others'))
            rows.append({
                'sym': sym, 'name': rec.get('name') or name, 'sector': sector,
                'ltp': ltp, 'change': chg, 'pct': pct,     # None = unknown, not "unchanged"
                'open': rec.get('open'), 'high': rec.get('high'), 'low': rec.get('low'),
                'close': rec.get('close', ltp), 'vwap': rec.get('vwap'),
                'vol': rec.get('vol'), 'prev': prev, 'turnover': rec.get('turnover'),
                'txns': rec.get('txns'), 'w52h': rec.get('w52h'), 'w52l': rec.get('w52l'),
            })
        if len(rows) >= 50:
            return rows
    return []


def find_as_of_date(html):
    pats = [r'As\s*(?:of|on)\s*:?\s*(\d{4}-\d{2}-\d{2})',
            r'id=["\']fromdate["\'][^>]*value=["\'](\d{4}-\d{2}-\d{2})',
            r'value=["\'](\d{4}-\d{2}-\d{2})["\'][^>]*id=["\']fromdate']
    for p in pats:
        m = re.search(p, html, re.I)
        if m:
            return m.group(1)
    return None


# ── NEPSE index from public HTML ─────────────────────────────
INDEX_RE = re.compile(
    r'NEPSE(?:\s+Index)?\s*[:\-]?\s*([1-9]\d?,?\d{3}\.\d{1,2})'
    r'(?:\s*\(?\s*([+\-\u2212]?\s?\d{1,3}(?:\.\d{1,2})?)(?![\d%]))?'
    r'(?:\s*\(?\s*([+\-\u2212]?\s?\d{1,2}(?:\.\d{1,2})?)\s*%)?')


def extract_index(html):
    text = BeautifulSoup(html, 'html.parser').get_text(' ', strip=True)
    for m in INDEX_RE.finditer(text):
        idx = num(m.group(1))
        if idx and 1000 <= idx <= 6000:
            out = {'index': idx}
            chg, pct = num(m.group(2)), num(m.group(3))
            if chg is not None and abs(chg) < 400:
                out['change'] = chg
            if pct is not None and abs(pct) < 15:
                out['changePct'] = pct
            return out
    return None


# ── NEPSE daily bars from MeroLagani's chart API (dated) ─────
def merolagani_history(start='2020-01-01', end=None, timeout=60, symbol='NEPSE', bounds=(500, 10000)):
    """Daily bars as [{date, index, open, high, low, turnover}], oldest first.
    `symbol` may be NEPSE, a sector index ('BANKING', 'LIFE INSURANCE', …) or a
    stock (adjusted for corporate actions); for stocks `turnover` is volume.

    Bars are stamped ~20:45 UTC; the UTC calendar date is the trading date
    (verified: Sun–Thu before Apr 2026, Mon–Fri after). When a date has more
    than one bar (a few intraday snapshots exist), the latest stamp wins.
    """
    s = int(dt.datetime.fromisoformat(start).replace(tzinfo=dt.timezone.utc).timestamp())
    e = int((dt.datetime.fromisoformat(end).replace(tzinfo=dt.timezone.utc)
             if end else dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).timestamp())
    r = requests.get(ML_CHART_URL, headers=HEADERS, timeout=timeout, params={
        'type': 'get_advanced_chart', 'symbol': symbol, 'resolution': '1D',
        'rangeStartDate': s, 'rangeEndDate': e, 'isAdjust': 1, 'currencyCode': 'NPR'})
    r.raise_for_status()
    return parse_merolagani_bars(r.json(), bounds)


def parse_merolagani_bars(d, bounds=(500, 10000)):
    if d.get('s') != 'ok' or not d.get('t'):
        return []
    by_date = {}
    for i, t in enumerate(d['t']):
        close = d['c'][i]
        if not isinstance(close, (int, float)) or not bounds[0] <= close <= bounds[1]:
            continue
        day = dt.datetime.fromtimestamp(t, dt.timezone.utc).date().isoformat()
        if day in by_date and by_date[day][0] > t:
            continue
        by_date[day] = (t, {'date': day, 'index': round(close, 2),
                            'open': d['o'][i], 'high': d['h'][i], 'low': d['l'][i],
                            'turnover': round(d['v'][i], 2) if d['v'][i] else None})
    return [by_date[k][1] for k in sorted(by_date)]


def is_repeat(value, prev_close):
    """True when an index reading is just the previous close again (stale page)."""
    return prev_close is not None and value is not None and abs(value - prev_close) < 0.005


# ── Claude API fallback (server-side only) ───────────────────
CLAUDE_SYSTEM = (
    'You are a NEPSE (Nepal Stock Exchange) data agent. Use web search on nepalstock.com, '
    'sharesansar.com, merolagani.com and nrb.org.np. NEPSE trades Monday–Friday, 11:00–15:00 NPT. '
    'Return ONLY one JSON object, no prose, no markdown. Numbers must be numbers; use null when '
    'unknown — never guess. Keys: trade_date (YYYY-MM-DD of the close you report), index, change, '
    'changePct, turnover, traded_shares, transactions, scrips_traded, market_cap, float_mkt_cap, '
    'gainers, losers, unchanged, sector_leader, sector_lagger, nrb_repo, nrb_slf, '
    'top_gainers [{sym,name,close,change,pct}], top_losers [same], '
    'top_turnover [{sym,name,turnover,ltp}], top_volume [{sym,name,volume,ltp}], '
    'top_transactions [{sym,name,txns,ltp}].'
)


def claude_fetch(expected_date):
    key = os.getenv('ANTHROPIC_API_KEY', '').strip()
    if not key:
        log('Claude fallback skipped — ANTHROPIC_API_KEY secret not set')
        return None
    prompt = (f'Report the official NEPSE closing market summary for {expected_date} '
              f'(or the most recent completed trading day before it if the market was closed). '
              f'Set trade_date to the date the figures belong to.')
    try:
        r = requests.post('https://api.anthropic.com/v1/messages', timeout=180, headers={
            'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
            json={'model': MODEL, 'max_tokens': 2500, 'system': CLAUDE_SYSTEM,
                  'tools': [{'type': 'web_search_20250305', 'name': 'web_search', 'max_uses': 6}],
                  'messages': [{'role': 'user', 'content': prompt}]})
        r.raise_for_status()
        text = ''.join(b.get('text', '') for b in r.json().get('content', []) if b.get('type') == 'text')
        text = re.sub(r'```(?:json)?', '', text)
        a, b = text.find('{'), text.rfind('}')
        data = json.loads(text[a:b + 1])
        if not isinstance(data.get('index'), (int, float)) or not 1000 <= data['index'] <= 6000:
            log('Claude returned no valid index')
            return None
        log(f"Claude fallback OK: index {data['index']} for {data.get('trade_date')}")
        return data
    except Exception as e:
        log(f'Claude fallback failed: {e}')
        return None


# ── History helpers ──────────────────────────────────────────
def read_index_history():
    if not INDEX_CSV.exists():
        return []
    with INDEX_CSV.open(newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def write_index_history(rows):
    rows = sorted({r['date']: r for r in rows}.values(), key=lambda r: r['date'])
    with INDEX_CSV.open('w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=INDEX_CSV_FIELDS, extrasaction='ignore')
        w.writeheader()
        w.writerows(rows)
    return rows


def monthly_from_history(rows):
    mons = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    groups = {}
    for r in rows:
        groups.setdefault(r['date'][:7], []).append(r)
    out = []
    for ym in sorted(groups):
        g = sorted(groups[ym], key=lambda r: r['date'])
        close = num(g[-1]['index'])
        tos = [num(r['turnover']) for r in g if num(r['turnover'])]
        y, m = ym.split('-')
        out.append({'label': f'{mons[int(m) - 1]} {y[2:]}', 'close': close,
                    'turnover_b': round(statistics.mean(tos) / 1e9, 2) if tos else None})
    return out


def period_key(day, kind):
    """Month → 'YYYY-MM'. Week → the Saturday that ends it: NEPSE never trades on
    Saturday, so this groups both the old Sun–Thu and the Mon–Fri weeks."""
    if kind == 'month':
        return day[:7]
    d = dt.date.fromisoformat(day)
    return (d + dt.timedelta(days=(5 - d.weekday()) % 7)).isoformat()


def period_summaries(rows, kind, n):
    """Last n weeks/months from index history: close, change vs the previous
    period's close, high/low with dates, turnover, up/down sessions."""
    groups = {}
    for r in sorted(rows, key=lambda r: r['date']):
        if num(r['index']) is not None:
            groups.setdefault(period_key(r['date'], kind), []).append(r)
    keys, out = list(groups), []
    for i, k in enumerate(keys[-(n + 1):] if len(keys) > n else keys):
        g = groups[k]
        j = keys.index(k)
        prev_close = num(groups[keys[j - 1]][-1]['index']) if j > 0 else None
        closes = [num(r['index']) for r in g]
        hi, lo = max(range(len(g)), key=closes.__getitem__), min(range(len(g)), key=closes.__getitem__)
        tos = [num(r['turnover']) for r in g if num(r['turnover'])]
        up = down = 0
        for x, c in enumerate(closes):
            before = closes[x - 1] if x else prev_close
            if before is not None:
                up += c > before
                down += c < before
        close = closes[-1]
        out.append({
            'key': k, 'start': g[0]['date'], 'end': g[-1]['date'], 'days': len(g),
            'close': close, 'prev_close': prev_close,
            'change': round(close - prev_close, 2) if prev_close else None,
            'changePct': round((close - prev_close) / prev_close * 100, 2) if prev_close else None,
            'high': closes[hi], 'high_date': g[hi]['date'], 'low': closes[lo], 'low_date': g[lo]['date'],
            'turnover': round(sum(tos), 2) if tos else None,
            'avg_turnover': round(sum(tos) / len(tos), 2) if tos else None,
            'up_days': up, 'down_days': down,
        })
    return out[-n:]


def period_movers(start, trade_date, n=5):
    """Top stock gainers/losers from the last close before `start` to the latest
    close — needs daily price files on both sides (data/history/prices/)."""
    files = sorted(p.stem for p in PRICE_DIR.glob('*.csv'))
    base = [d for d in files if d < start]
    end = [d for d in files if d <= trade_date]
    if not base or not end:
        return None

    def load(d):
        with (PRICE_DIR / f'{d}.csv').open(newline='', encoding='utf-8') as f:
            return {r['sym']: r for r in csv.DictReader(f)}

    a, b = load(base[-1]), load(end[-1])
    rows = []
    for sym, r in b.items():
        p0, p1 = num(a.get(sym, {}).get('ltp')), num(r.get('ltp'))
        if p0 and p1:
            rows.append({'sym': sym, 'name': r.get('name') or sym, 'close': p1,
                         'pct': round((p1 - p0) / p0 * 100, 2)})
    if not rows:
        return None
    rows.sort(key=lambda r: r['pct'])
    return {'base_date': base[-1], 'end_date': end[-1],
            'gainers': [r for r in reversed(rows[-n:]) if r['pct'] > 0],
            'losers': [r for r in rows[:n] if r['pct'] < 0]}


def top(rows, key, n=5, reverse=True, fmt=None):
    valid = [r for r in rows if isinstance(r.get(key), (int, float))]
    return [fmt(r) for r in sorted(valid, key=lambda r: r[key], reverse=reverse)[:n]]


def derive_from_prices(rows):
    traded = [r for r in rows if (r.get('vol') or 0) > 0]
    known = [r for r in traded if isinstance(r.get('change'), (int, float))]
    # Sector leader/lagger: equal-weight mean % change of the sector's traded
    # stocks. Symbols outside the dashboard's symbol map are 'Others' and
    # excluded, so require ≥5 stocks and publish the count with the name.
    by_sector = {}
    for r in known:
        if isinstance(r.get('pct'), (int, float)):
            by_sector.setdefault(r['sector'], []).append(r['pct'])
    sec_avg = {s: statistics.mean(v) for s, v in by_sector.items() if len(v) >= 5 and s != 'Others'}
    sec_name = lambda s: f'{s} ({sec_avg[s]:+.2f}% avg, {len(by_sector[s])} stocks)'
    txns = [r['txns'] for r in rows if isinstance(r.get('txns'), (int, float))]
    g = lambda r: {'sym': r['sym'], 'name': r['name'], 'close': r['ltp'], 'change': r['change'], 'pct': r['pct']}
    return {
        'turnover': round(sum(r['turnover'] or 0 for r in rows), 2),
        'traded_shares': int(sum(r['vol'] or 0 for r in rows)),
        'transactions': int(sum(txns)) if txns else None,
        'scrips_traded': len(traded),
        'gainers': sum(1 for r in known if r['change'] > 0),
        'losers': sum(1 for r in known if r['change'] < 0),
        'unchanged': sum(1 for r in known if r['change'] == 0),
        'sector_leader': sec_name(max(sec_avg, key=sec_avg.get)) if sec_avg else None,
        'sector_lagger': sec_name(min(sec_avg, key=sec_avg.get)) if sec_avg else None,
        # Only actual gainers/losers — on a strong day there may be < 5 losers
        'top_gainers': top([r for r in known if (r.get('pct') or 0) > 0], 'pct', fmt=g),
        'top_losers': top([r for r in known if (r.get('pct') or 0) < 0], 'pct', reverse=False, fmt=g),
        'top_turnover': top(traded, 'turnover', fmt=lambda r: {'sym': r['sym'], 'name': r['name'], 'turnover': r['turnover'], 'ltp': r['ltp']}),
        'top_volume': top(traded, 'vol', fmt=lambda r: {'sym': r['sym'], 'name': r['name'], 'volume': r['vol'], 'ltp': r['ltp']}),
        'top_transactions': top(traded, 'txns', fmt=lambda r: {'sym': r['sym'], 'name': r['name'], 'txns': r['txns'], 'ltp': r['ltp']}),
    }


def clean_payload(v):
    """Strip markup characters from every string and drop rows with a non-ticker
    symbol — scraped/model text is rendered with innerHTML on the page."""
    if isinstance(v, str):
        return re.sub(r'[<>`]', '', v).replace('"', '”').replace("'", '’')
    if isinstance(v, list):
        return [clean_payload(x) for x in v
                if not (isinstance(x, dict) and 'sym' in x and not SYM_RE.match(str(x['sym'])))]
    if isinstance(v, dict):
        return {k: clean_payload(x) for k, x in v.items()}
    return v


def inject_into_html(payload):
    html = INDEX_HTML.read_text(encoding='utf-8')
    blob = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    pat = re.compile(r'(<script id="nepse-data" type="application/json">)(.*?)(</script>)', re.S)
    if not pat.search(html):
        raise SystemExit('index.html has no <script id="nepse-data"> block — cannot inject data')
    html = pat.sub(lambda m: m.group(1) + blob + m.group(3), html, count=1)
    INDEX_HTML.write_text(html, encoding='utf-8', newline='\n')


# ── Main ─────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true',
                    default=os.getenv('FORCE', '').lower() in ('1', 'true', 'yes'),
                    help='run on weekends/holidays and overwrite (useful for the first run)')
    ap.add_argument('--ss-html', help='test: read ShareSansar price page from a local file')
    ap.add_argument('--index-html', help='test: read index page from a local file')
    ap.add_argument('--today', help='test: pretend today (NPT) is YYYY-MM-DD')
    args = ap.parse_args()

    now = dt.datetime.now(NPT)
    today = args.today or now.date().isoformat()
    weekday = dt.date.fromisoformat(today).weekday()        # Mon=0 … Sun=6
    log(f'NPT now {now:%Y-%m-%d %H:%M} · run date {today} · force={args.force}')

    # A session counts as stored only when its full price list was saved — a
    # backfilled index row alone (no price list) is caught up by the next run.
    stored = {f.stem for f in PRICE_DIR.glob('*.csv')}
    if LATEST.exists():
        stored.add(json.loads(LATEST.read_text(encoding='utf-8')).get('trade_date') or '')
    last_wd = dt.date.fromisoformat(today)
    while last_wd.weekday() >= 5:
        last_wd -= dt.timedelta(days=1)
    if weekday >= 5 and not args.force and last_wd.isoformat() in stored:
        log('Weekend (Sat/Sun) — NEPSE closed and Friday is stored. Nothing to do.')
        return 0
    if LATEST.exists() and not args.force:
        prev = json.loads(LATEST.read_text(encoding='utf-8'))
        if prev.get('trade_date') == today and prev.get('index'):
            log(f'Already updated for {today}. Nothing to do.')
            return 0

    symmap = load_symbol_map()
    sources = []

    # 1. Price table
    prices, as_of = [], None
    try:
        ss_html = Path(args.ss_html).read_text(encoding='utf-8') if args.ss_html else get(SS_PRICE_URL)
        prices, as_of = parse_price_table(ss_html, symmap), find_as_of_date(ss_html)
        log(f'ShareSansar: {len(prices)} rows · as-of {as_of}')
        if prices:
            sources.append('sharesansar.com')
    except Exception as e:
        log(f'ShareSansar price page failed: {e}')

    if as_of and as_of < today and not args.force:
        if as_of in stored:
            log(f'Latest published prices are for {as_of}, not {today}, and {as_of} is already stored — '
                f'a public holiday or not published yet. Keeping existing data.')
            return 0
        # The run is late (PC was off at 4 PM, or it is the weekend/next morning):
        # the newest published session is not stored yet, so store it under its own date.
        log(f'Catch-up: the latest published session {as_of} is not stored yet — storing it now.')

    # 2. Index — phantom-day guard: a reading is only accepted when its date is
    #    known (ShareSansar as-of, MeroLagani bar date, Claude trade_date) or it
    #    differs from the previous close. A page still showing yesterday's close
    #    must never be stored under today's date.
    want = as_of or today
    hist_all = read_index_history()
    prev_rows = [r for r in hist_all if r['date'] < want]
    prev_close = num(prev_rows[-1]['index']) if prev_rows else None
    if prev_close is None and LATEST.exists():
        last = json.loads(LATEST.read_text(encoding='utf-8'))
        if (last.get('trade_date') or '') < want:
            prev_close = last.get('index')
    idx, idx_date = None, None

    if not args.index_html:
        try:
            bars = merolagani_history(start=(dt.date.fromisoformat(want) - dt.timedelta(days=20)).isoformat())
            pos = next((i for i, x in enumerate(bars) if x['date'] == want), None)
            if pos is not None:
                # Change vs the stored previous close; the previous MeroLagani bar
                # is only used when history has none (a missing bar would span 2 days)
                b = bars[pos]
                p = prev_close or (bars[pos - 1]['index'] if pos > 0 else None)
                idx = {'index': b['index']}
                if p:
                    idx['change'] = round(b['index'] - p, 2)
                    idx['changePct'] = round((b['index'] - p) / p * 100, 2)
                idx_date = want
                log(f'Index {idx} from merolagani chart API (bar dated {want})')
                sources.append('merolagani.com')
            else:
                log(f"MeroLagani has no bar dated {want} (latest {bars[-1]['date'] if bars else 'none'})")
        except Exception as e:
            log(f'MeroLagani chart API failed: {e}')

    for url in ([] if idx else [args.index_html] if args.index_html else INDEX_URLS):
        try:
            html = Path(url).read_text(encoding='utf-8') if args.index_html else get(url)
            cand = extract_index(html)
            if cand and is_repeat(cand['index'], prev_close):
                log(f"Index {cand['index']} from {url} equals the previous close — stale page, ignored")
                continue
            if cand:
                idx = cand
                log(f'Index {idx} from {url}')
                sources.append(url.split('/')[2] if '://' in url else 'local-file')
                break
        except Exception as e:
            log(f'Index source failed {url}: {e}')

    # 3. Claude fallback — fills the index and anything else missing
    claude = None
    if not idx or not prices:
        claude = claude_fetch(want)
        if claude and not idx and not claude.get('trade_date') and is_repeat(claude['index'], prev_close):
            log('Claude index equals the previous close and has no trade_date — ignored')
            claude = None
        if claude:
            sources.append('claude-web-search')
    if not idx and claude:
        idx = {k: claude.get(k) for k in ('index', 'change', 'changePct')}
        idx_date = claude.get('trade_date')
    if not idx:
        log('ERROR: NEPSE index unavailable from every source. Existing data left unchanged.')
        return 1

    trade_date = as_of or idx_date or today
    if not (as_of or idx_date) and weekday >= 5:
        log(f'ERROR: {today} is a weekend and no source confirmed the trade date — '
            f'refusing to store the index under {today}.')
        return 1
    if trade_date < today and not args.force and trade_date in stored:
        log(f'Newest close found is {trade_date}, which is already stored — '
            f'public holiday or not published yet. Keeping existing data.')
        return 0

    # 4. Build payload
    hist = [r for r in read_index_history() if r['date'] != trade_date]
    prev_rows = [r for r in hist if r['date'] < trade_date]
    if idx.get('change') is None and prev_rows:
        p = num(prev_rows[-1]['index'])
        idx['change'] = round(idx['index'] - p, 2)
        idx['changePct'] = round((idx['index'] - p) / p * 100, 2)
    if idx.get('changePct') is None and idx.get('change') is not None:
        base = idx['index'] - idx['change']
        idx['changePct'] = round(idx['change'] / base * 100, 2) if base else None

    payload = {
        'trade_date': trade_date,
        'updated_at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
        'index': round(idx['index'], 2),
        'change': idx.get('change'),
        'changePct': idx.get('changePct'),
        'market_cap': None, 'float_mkt_cap': None,
    }
    if prices:
        payload.update(derive_from_prices(prices))
    if claude:
        for k, v in claude.items():
            if k != 'trade_date' and payload.get(k) in (None, [], '') and v not in (None, [], ''):
                payload[k] = v
    payload['source'] = ' + '.join(dict.fromkeys(sources)) or 'unknown'
    if prices:
        payload['prices'] = prices
    payload = clean_payload(payload)
    prices = payload.get('prices', [])

    # Sanity check — nothing is written unless the day's data is plausible
    errs, warns = check_payload(payload, num(prev_rows[-1]['index']) if prev_rows else None, today)
    for w in warns:
        log(f'WARNING: {w}')
    if errs:
        for e in errs:
            log(f'ERROR: {e}')
        log('Sanity check failed — existing data left unchanged.')
        return 1

    # 5. History + monthly series
    hist.append({'date': trade_date, **{k: payload.get(k) for k in INDEX_CSV_FIELDS if k != 'date'}})
    hist = write_index_history(hist)
    payload['monthly'] = [m for m in monthly_from_history(hist) if m['label'] and m['close']]
    if prices:
        with (PRICE_DIR / f'{trade_date}.csv').open('w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=list(prices[0].keys()))
            w.writeheader()
            w.writerows(prices)
        # index of archived trading days, for the dashboard's date picker
        (PRICE_DIR / 'index.json').write_text(json.dumps(sorted(p.stem for p in PRICE_DIR.glob('*.csv'))), encoding='utf-8', newline='\n')

    # Weekly / monthly market summaries (after today's price file is written,
    # so the period's stock movers include today)
    weekly, monthly = period_summaries(hist, 'week', 8), period_summaries(hist, 'month', 12)
    payload['periods'] = clean_payload({
        'weekly': weekly, 'monthly': monthly,
        'week_movers': period_movers(weekly[-1]['start'], trade_date) if weekly else None,
        'month_movers': period_movers(monthly[-1]['start'], trade_date) if monthly else None,
    })

    LATEST.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding='utf-8', newline='\n')
    inject_into_html(payload)
    log(f"Done: {trade_date} · NEPSE {payload['index']} ({payload['change']}) · "
        f"{len(prices)} prices · source {payload['source']}")
    return 0


if __name__ == '__main__':
    DATA_DIR.mkdir(exist_ok=True)
    PRICE_DIR.mkdir(parents=True, exist_ok=True)
    sys.exit(main())
