#!/usr/bin/env python3
"""Technical + market-breadth fact sheet from the repo's stored NEPSE history.

Standard library only (no pandas). Prints numbers, not opinions: the skill
(SKILL.md) turns them into an analysis.

  python .claude/skills/investment-analyst/analyze.py                 # NEPSE index
  python .claude/skills/investment-analyst/analyze.py --symbol NABIL  # one stock
  python .claude/skills/investment-analyst/analyze.py --sector banking
  python .claude/skills/investment-analyst/analyze.py --json          # machine-readable
"""
import argparse, csv, json, math, statistics as st
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
H = ROOT / 'data' / 'history'


def read(path):
    with open(path, newline='') as f:
        return list(csv.DictReader(f))


def fnum(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def sma(v, n):
    return sum(v[-n:]) / n if len(v) >= n else None


def ema(v, n):
    if len(v) < n:
        return []
    k = 2 / (n + 1)
    out = [sum(v[:n]) / n]
    for x in v[n:]:
        out.append(x * k + out[-1] * (1 - k))
    return out


def rsi(v, n=14):
    if len(v) <= n:
        return None
    g = [max(v[i] - v[i - 1], 0) for i in range(1, len(v))]
    l = [max(v[i - 1] - v[i], 0) for i in range(1, len(v))]
    ag, al = sum(g[:n]) / n, sum(l[:n]) / n
    for i in range(n, len(g)):
        ag, al = (ag * (n - 1) + g[i]) / n, (al * (n - 1) + l[i]) / n
    return 100.0 if al == 0 else 100 - 100 / (1 + ag / al)


def macd(v):
    e12, e26 = ema(v, 12), ema(v, 26)
    if not e26:
        return None
    m = [a - b for a, b in zip(e12[-len(e26):], e26)]
    sig = ema(m, 9)
    return (m[-1], sig[-1], m[-1] - sig[-1]) if sig else None


def atr(rows, n=14):
    if len(rows) <= n:
        return None
    tr = [max(r['high'] - r['low'], abs(r['high'] - p['close']), abs(r['low'] - p['close']))
          for p, r in zip(rows, rows[1:])]
    a = sum(tr[:n]) / n
    for x in tr[n:]:
        a = (a * (n - 1) + x) / n
    return a


def pct(a, b):
    return None if a is None or not b else (a / b - 1) * 100


def load(args):
    if args.symbol:
        rows = [{'date': r['date'], 'close': fnum(r['close']), 'volume': fnum(r['volume'])}
                for r in read(H / 'stocks' / f'{args.symbol.upper()}.csv')]
        return f'{args.symbol.upper()} (adjusted close)', rows, False
    if args.sector:
        rows = [{'date': r['date'], 'close': fnum(r['close']), 'volume': fnum(r['volume'])}
                for r in read(H / 'sectors' / f'{args.sector}.csv')]
        return f'sector index: {args.sector}', rows, False
    rows = [{'date': r['date'], 'open': fnum(r['open']), 'high': fnum(r['high']),
             'low': fnum(r['low']), 'close': fnum(r['close']), 'turnover': fnum(r['turnover'])}
            for r in read(H / 'index_ohlc.csv')]
    return 'NEPSE index (daily OHLC)', rows, True


def facts(args):
    name, rows, has_ohlc = load(args)
    rows = [r for r in rows if r['close']]
    c = [r['close'] for r in rows]
    last = rows[-1]
    f = {'subject': name, 'as_of': last['date'], 'sessions': len(rows), 'close': c[-1]}
    for lab, n in (('1d', 1), ('1w', 5), ('1m', 21), ('3m', 63), ('6m', 126), ('1y', 252)):
        f[f'ret_{lab}_pct'] = pct(c[-1], c[-1 - n]) if len(c) > n else None
    for n in (20, 50, 200):
        f[f'sma{n}'] = sma(c, n)
        f[f'vs_sma{n}_pct'] = pct(c[-1], sma(c, n))
    f['rsi14'] = rsi(c)
    f['macd'] = macd(c)
    if len(c) > 21:
        rets = [math.log(c[i] / c[i - 1]) for i in range(len(c) - 20, len(c))]
        f['vol20_annualised_pct'] = st.pstdev(rets) * math.sqrt(250) * 100
    w = c[-252:]
    f['hi_52w'], f['lo_52w'] = max(w), min(w)
    f['pct_from_52w_high'] = pct(c[-1], max(w))
    f['pct_above_52w_low'] = pct(c[-1], min(w))
    f['range_position_52w_0to1'] = (c[-1] - min(w)) / (max(w) - min(w)) if max(w) > min(w) else None
    peak = max(c)
    f['all_time_high_in_data'] = peak
    f['drawdown_from_peak_pct'] = pct(c[-1], peak)
    if len(c) >= 20:
        m, s = sma(c, 20), st.pstdev(c[-20:])
        f['bollinger20'] = {'lower': m - 2 * s, 'mid': m, 'upper': m + 2 * s}
    if has_ohlc:
        f['atr14'] = atr(rows)
        f['atr14_pct_of_price'] = f['atr14'] / c[-1] * 100 if f['atr14'] else None
        t = [r['turnover'] for r in rows if r.get('turnover')]
        if len(t) >= 60:
            f['turnover_5d_avg_vs_60d_avg'] = (sum(t[-5:]) / 5) / (sum(t[-60:]) / 60)
        hi20 = max(r['high'] for r in rows[-20:]); lo20 = min(r['low'] for r in rows[-20:])
        f['swing_20d'] = {'high': hi20, 'low': lo20}
    elif rows[-1].get('volume') is not None:
        v = [r['volume'] for r in rows if r['volume'] is not None]
        if len(v) >= 60:
            f['volume_5d_avg_vs_60d_avg'] = (sum(v[-5:]) / 5) / (sum(v[-60:]) / 60)
    # cross signals
    sig = []
    if f['sma50'] and f['sma200']:
        sig.append('SMA50 above SMA200 (bullish trend filter)' if f['sma50'] > f['sma200']
                   else 'SMA50 below SMA200 (bearish trend filter)')
    if f['rsi14'] is not None:
        sig.append('RSI overbought >70' if f['rsi14'] > 70 else 'RSI oversold <30' if f['rsi14'] < 30
                   else 'RSI neutral 30-70')
    f['signals'] = sig
    return f, rows


def breadth(rows_idx):
    idx = read(H / 'index.csv')[-60:]
    out = {}
    adv = [(fnum(r['gainers']), fnum(r['losers'])) for r in idx if fnum(r['gainers']) is not None]
    if adv:
        last5 = adv[-5:]
        out['gainers_losers_last'] = adv[-1]
        out['sessions_with_breadth_data'] = len(adv)  # short history: 5d and 60d ratios may be identical
        out['adv_decl_ratio_5d'] = sum(a for a, _ in last5) / max(sum(b for _, b in last5), 1)
        out['adv_decl_ratio_60d'] = sum(a for a, _ in adv) / max(sum(b for _, b in adv), 1)
    return out


def sectors_rrg():
    files = sorted((H / 'rrg').glob('*.csv'))
    if not files:
        return None
    rows = [r for r in read(files[-1]) if r['kind'] == 'sector']
    return {'date': files[-1].stem,
            'sectors': [{'sector': r['symbol'], 'daily': r['d_quadrant'], 'weekly': r['w_quadrant'],
                         'w_ratio': fnum(r['w_ratio']), 'w_momentum': fnum(r['w_momentum'])} for r in rows]}


def fmt(x):
    return 'n/a' if x is None else f'{x:,.2f}' if isinstance(x, float) else str(x)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--symbol'); ap.add_argument('--sector'); ap.add_argument('--json', action='store_true')
    args = ap.parse_args()
    f, rows = facts(args)
    extra = {}
    if not args.symbol and not args.sector:
        extra['breadth'] = breadth(rows)
        extra['sector_rotation'] = sectors_rrg()
        try:
            extra['latest_session'] = {k: v for k, v in json.load(open(ROOT / 'data' / 'latest.json')).items()
                                       if k in ('trade_date', 'turnover', 'gainers', 'losers', 'unchanged',
                                                'sector_leader', 'sector_lagger')}
        except OSError:
            pass
    if args.json:
        print(json.dumps({**f, **extra}, indent=2, default=str)); return
    print(f"== {f['subject']} | as of {f['as_of']} | {f['sessions']} sessions ==")
    for k, v in f.items():
        if k in ('subject', 'as_of', 'sessions'):
            continue
        if isinstance(v, dict):
            v = ', '.join(f'{a}={fmt(b)}' for a, b in v.items())
        elif isinstance(v, (list, tuple)):
            v = '; '.join(fmt(i) for i in v)
        else:
            v = fmt(v)
        print(f'{k:28} {v}')
    for k, v in extra.items():
        print(f'-- {k} --'); print(json.dumps(v, indent=1, default=str) if v else 'n/a')
    print('\nNumbers only. Turn them into a view with SKILL.md; check data freshness first.')


if __name__ == '__main__':
    main()
