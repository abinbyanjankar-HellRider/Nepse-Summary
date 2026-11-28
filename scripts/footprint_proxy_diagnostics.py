#!/usr/bin/env python3
"""POST-HOC robustness checks for footprint_proxy_experiment.py.

These were written AFTER seeing the pre-registered results (H1-H3 passed on the
index with an unexpectedly large IC of about 0.19). They are exploratory: they
do not change the pre-registered verdicts, they test whether those results can
be trusted. Reported as such.

Checks
  D1  Lag-1 autocorrelation of index returns (Spearman r1_t vs r_{t+1}): is plain momentum
      already as strong as the proxy?
  D2  Overnight vs intraday decomposition of the next-day return:
        overnight = open_{t+1}/close_t - 1,   intraday = close_{t+1}/open_{t+1} - 1
      A signal that lives almost entirely in the overnight gap points to a data/index
      construction artifact rather than a tradable pattern.
  D3  Serial dependence: circular-shift permutation (shift the forward-return series by a
      random offset of at least 20 days). Unlike a plain shuffle this keeps the
      autocorrelation of both series, so it does not overstate significance.
  D4  Feed consistency: index_ohlc.csv close vs index.csv close.
  D5  Is CLV itself autocorrelated (a persistent feature inflates naive p-values)?
  D6  Stock panel: lag-1 cross-sectional IC of same-day pct vs next-day pct
      (is there momentum or reversal across stocks over these 21 days?).

Run:  python scripts/footprint_proxy_diagnostics.py
"""
import csv
import json
import random
import statistics as st
from pathlib import Path

from footprint_proxy_experiment import (H, PERMS, SEED, clv, pearson, ranks, residualise, spearman)


def load_rows():
    return [{'date': r['date'], 'o': float(r['open']), 'h': float(r['high']), 'l': float(r['low']),
             'c': float(r['close']), 't': float(r['turnover'])} for r in csv.DictReader(open(H / 'index_ohlc.csv'))]


def shift_p(x, y, rng, min_shift=20, perms=PERMS):
    """One-sided p that Spearman(x, y) >= observed under circular shifts of y."""
    rx, ry = ranks(x), ranks(y)
    obs = pearson(rx, ry)
    n = len(y)
    cnt = 0
    for _ in range(perms):
        k = rng.randrange(min_shift, n - min_shift)
        if pearson(rx, ry[k:] + ry[:k]) >= obs:
            cnt += 1
    return obs, (cnt + 1) / (perms + 1)


def main():
    rng = random.Random(SEED + 1)
    rows = load_rows()
    n = len(rows)
    feats = []
    for i in range(20, n - 1):
        r = rows[i]
        rel = r['t'] / (sum(x['t'] for x in rows[i - 20:i]) / 20)
        cl = clv(r['o'], r['h'], r['l'], r['c'])
        nx = rows[i + 1]
        feats.append({'clv': cl, 'proxy': cl * rel, 'r1': r['c'] / rows[i - 1]['c'] - 1,
                      'fwd1': nx['c'] / r['c'] - 1, 'over': nx['o'] / r['c'] - 1, 'intra': nx['c'] / nx['o'] - 1})
    clvs = [f['clv'] for f in feats]; pds = [f['proxy'] for f in feats]
    print('D1 lag-1 autocorrelation of index returns (Spearman r1_t vs r_{t+1}): %+.3f' %
          spearman([f['r1'] for f in feats], [f['fwd1'] for f in feats]))
    print('D2 decomposition of the next-day return (Spearman IC):')
    for lab, key in (('total next-day', 'fwd1'), ('overnight gap', 'over'), ('intraday (open->close)', 'intra')):
        print('   CLV vs %-24s %+.3f   proxy vs %-24s %+.3f' % (lab, spearman(clvs, [f[key] for f in feats]),
                                                                 lab, spearman(pds, [f[key] for f in feats])))
    print('   mean next-day return, top vs bottom CLV quintile (bps): overnight / intraday')
    order = sorted(feats, key=lambda f: f['clv']); q = len(order) // 5
    for lab, grp in (('bottom', order[:q]), ('top', order[-q:])):
        print('     %-6s %+6.1f / %+6.1f' % (lab, st.mean(f['over'] for f in grp) * 1e4, st.mean(f['intra'] for f in grp) * 1e4))
    print('D3 circular-shift p-values (keeps serial dependence; threshold 0.0071):')
    y1 = [f['fwd1'] for f in feats]
    for lab, x in (('H1 CLV', clvs), ('H2 proxy delta', pds), ('H3 proxy beyond r1', residualise(pds, [f['r1'] for f in feats]))):
        ic, p = shift_p(x, y1, rng); print('   %-20s IC %+.3f  p %.4f  -> %s' % (lab, ic, p, 'survives' if p < 0.0071 else 'does NOT survive'))
    print('D4 feed consistency (index_ohlc close vs index.csv close):')
    ix = {r['date']: float(r['index']) for r in csv.DictReader(open(H / 'index.csv'))}
    both = [(r['date'], r['c'], ix[r['date']]) for r in rows if r['date'] in ix]
    bad = [x for x in both if abs(x[1] - x[2]) > 0.05]
    print('   dates compared %d, mismatches >0.05: %d %s' % (len(both), len(bad), bad[:3]))
    print('D5 CLV lag-1 autocorrelation (Spearman clv_t vs clv_{t+1}): %+.3f' % spearman(clvs[:-1], clvs[1:]))
    dates = json.load(open(H / 'prices' / 'index.json'))
    panel = {d: {r['sym']: r for r in csv.DictReader(open(H / 'prices' / f'{d}.csv'))} for d in dates}
    ics = []
    for a, b in zip(dates, dates[1:]):
        xs, ys = [], []
        for sym, r in panel[a].items():
            nx = panel[b].get(sym)
            try:
                if nx and float(r['turnover']) >= 5e6:
                    xs.append(float(r['pct'])); ys.append(float(nx['pct']))
            except ValueError:
                continue
        if len(xs) >= 50:
            ics.append(spearman(xs, ys))
    print('D6 stock panel: mean cross-sectional IC of same-day pct vs next-day pct: %+.3f over %d days (t %+.2f)' %
          (st.mean(ics), len(ics), st.mean(ics) / (st.stdev(ics) / len(ics) ** 0.5)))


if __name__ == '__main__':
    main()
