#!/usr/bin/env python3
"""Footprint-proxy experiment (week 5 of docs/footprint-study-plan.md).

QUESTION
    A real footprint needs trade-level bid/ask data, which this repo does not
    have. The closest daily proxy is the close location in the bar. Does that
    proxy predict next-day or next-week returns on NEPSE, beyond plain price
    momentum?

PROXY (fixed before the first run; nothing below was tuned after seeing results)
    CLV_t         = ((C - L) - (H - C)) / (H - L)          in [-1, 1]
    rel_turn_t    = turnover_t / mean(turnover_{t-20..t-1})
    proxy_delta_t = CLV_t * rel_turn_t                      (index only)
    r1_t          = C_t / C_{t-1} - 1                       (same-day return)

PRE-REGISTERED HYPOTHESES (one-sided: proxy > 0 predicts higher returns)
    Index, daily OHLC + turnover, 2020-2026 (index_ohlc.csv):
      H1  Spearman(CLV_t,           r_{t+1}) > 0
      H2  Spearman(proxy_delta_t,   r_{t+1}) > 0
      H3  Spearman(proxy_delta_t residualised on r1_t, r_{t+1}) > 0   ("beyond momentum")
      H4  Spearman(proxy_delta_t,   5-day forward return) > 0, non-overlapping weeks
      H5  On days when the close is a 20-day high: mean 5-day forward return is LOWER
          when the sum of CLV over the last 5 days is < 0 ("bearish divergence")
          than when it is >= 0
    Stocks, cross-section of the 21 daily price lists (stocks with turnover >= Rs 5M):
      H6  Mean daily cross-sectional Spearman(CLV_t, next-day pct) > 0
      H7  Same, with CLV residualised on same-day pct ("beyond momentum")

    Seven tests, so the Bonferroni one-sided threshold is 0.05 / 7 = 0.0071.
    p-values come from permutation tests (seeded). Out-of-sample stability is
    reported by year and by period split but is descriptive only.

    No transaction costs, no tradability test: a result here is evidence about
    information content, not a strategy.

Run:  python scripts/footprint_proxy_experiment.py [--json]
"""
import csv
import json
import random
import statistics as st
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
H = ROOT / 'data' / 'history'
SEED = 20261101
PERMS = 5000
LIQ_MIN_TURNOVER = 5e6
ALPHA = 0.05 / 7


def ranks(v):
    order = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0] * len(v)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            r[order[k]] = avg
        i = j + 1
    return r


def pearson(a, b):
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    da = sum((x - ma) ** 2 for x in a) ** 0.5
    db = sum((y - mb) ** 2 for y in b) ** 0.5
    return num / (da * db) if da and db else 0.0


def spearman(x, y):
    return pearson(ranks(x), ranks(y))


def perm_p_corr(x, y, rng, perms=PERMS):
    """One-sided p that Spearman(x, y) >= observed under shuffled y."""
    rx, ry = ranks(x), ranks(y)
    obs = pearson(rx, ry)
    count = 0
    ry2 = ry[:]
    for _ in range(perms):
        rng.shuffle(ry2)
        if pearson(rx, ry2) >= obs:
            count += 1
    return obs, (count + 1) / (perms + 1)


def residualise(y, x):
    mx, my = sum(x) / len(x), sum(y) / len(y)
    var = sum((a - mx) ** 2 for a in x)
    slope = sum((a - mx) * (b - my) for a, b in zip(x, y)) / var if var else 0.0
    return [b - (my + slope * (a - mx)) for a, b in zip(x, y)]


def clv(o, h, l, c):
    return ((c - l) - (h - c)) / (h - l)


def index_tests(rng):
    rows = [{'date': r['date'], 'o': float(r['open']), 'h': float(r['high']), 'l': float(r['low']),
             'c': float(r['close']), 't': float(r['turnover'])} for r in csv.DictReader(open(H / 'index_ohlc.csv'))]
    n = len(rows)
    feats = []  # index i -> dict
    for i in range(20, n - 1):
        r = rows[i]
        if r['h'] <= r['l'] or r['t'] <= 0:
            continue
        rel = r['t'] / (sum(x['t'] for x in rows[i - 20:i]) / 20)
        cl = clv(r['o'], r['h'], r['l'], r['c'])
        feats.append({'i': i, 'date': r['date'], 'clv': cl, 'proxy': cl * rel,
                      'r1': r['c'] / rows[i - 1]['c'] - 1, 'fwd1': rows[i + 1]['c'] / r['c'] - 1})
    out = {'n_days': len(feats)}
    x_clv = [f['clv'] for f in feats]
    x_pd = [f['proxy'] for f in feats]
    y1 = [f['fwd1'] for f in feats]
    ic, p = perm_p_corr(x_clv, y1, rng); out['H1'] = {'ic': ic, 'p': p, 'n': len(feats)}
    ic, p = perm_p_corr(x_pd, y1, rng); out['H2'] = {'ic': ic, 'p': p, 'n': len(feats)}
    res = residualise(x_pd, [f['r1'] for f in feats])
    ic, p = perm_p_corr(res, y1, rng); out['H3'] = {'ic': ic, 'p': p, 'n': len(feats)}
    # H4: non-overlapping 5-day forward returns
    sub = [f for k, f in enumerate(feats) if f['i'] + 5 < n and k % 5 == 0]
    y5 = [rows[f['i'] + 5]['c'] / rows[f['i']]['c'] - 1 for f in sub]
    ic, p = perm_p_corr([f['proxy'] for f in sub], y5, rng); out['H4'] = {'ic': ic, 'p': p, 'n': len(sub)}
    # H5: 20-day-high days, bearish divergence vs not
    clv_by_i = {f['i']: f['clv'] for f in feats}
    div, non = [], []
    for f in feats:
        i = f['i']
        if i + 5 >= n or i < 25:
            continue
        if rows[i]['c'] >= max(x['c'] for x in rows[i - 20:i]):
            s5 = sum(clv_by_i.get(j, 0.0) for j in range(i - 4, i + 1))
            fw = rows[i + 5]['c'] / rows[i]['c'] - 1
            (div if s5 < 0 else non).append(fw)
    obs = (st.mean(div) - st.mean(non)) if div and non else float('nan')
    pool = div + non
    cnt = 0
    for _ in range(PERMS):
        rng.shuffle(pool)
        d2, n2 = pool[:len(div)], pool[len(div):]
        if st.mean(d2) - st.mean(n2) <= obs:
            cnt += 1
    out['H5'] = {'diff_mean_div_minus_non': obs, 'p': (cnt + 1) / (PERMS + 1), 'n_div': len(div), 'n_non': len(non),
                 'mean_div': st.mean(div) if div else None, 'mean_non': st.mean(non) if non else None}
    # descriptive stability
    by_year = defaultdict(lambda: ([], []))
    for f in feats:
        y = f['date'][:4]
        by_year[y][0].append(f['clv']); by_year[y][1].append(f['fwd1'])
    out['H1_by_year'] = {y: round(spearman(a, b), 3) for y, (a, b) in sorted(by_year.items()) if len(a) > 30}
    half = [f for f in feats if f['date'] < '2024-01-01'], [f for f in feats if f['date'] >= '2024-01-01']
    out['H1_split'] = {'2020-2023': round(spearman([f['clv'] for f in half[0]], [f['fwd1'] for f in half[0]]), 3),
                       '2024-2026': round(spearman([f['clv'] for f in half[1]], [f['fwd1'] for f in half[1]]), 3)}
    # quintile spread (descriptive): mean next-day return, top vs bottom CLV quintile, in bps
    order = sorted(feats, key=lambda f: f['clv']); q = len(order) // 5
    out['quintile_next_day_bps'] = {'bottom_clv': round(st.mean(f['fwd1'] for f in order[:q]) * 1e4, 1),
                                    'top_clv': round(st.mean(f['fwd1'] for f in order[-q:]) * 1e4, 1)}
    return out


def stock_tests(rng):
    dates = json.load(open(H / 'prices' / 'index.json'))
    panel = {}
    for d in dates:
        panel[d] = {r['sym']: r for r in csv.DictReader(open(H / 'prices' / f'{d}.csv'))}
    ic_raw, ic_res, used = [], [], []
    for a, b in zip(dates, dates[1:]):
        xs, rs, ys = [], [], []
        for sym, r in panel[a].items():
            nxt = panel[b].get(sym)
            try:
                hi, lo, cl, op = float(r['high']), float(r['low']), float(r['close']), float(r['open'])
                tv, pct = float(r['turnover']), float(r['pct'])
                nxt_pct = float(nxt['pct']) if nxt else None
            except (TypeError, ValueError):
                continue
            if nxt_pct is None or hi <= lo or tv < LIQ_MIN_TURNOVER:
                continue
            xs.append(clv(op, hi, lo, cl)); rs.append(pct); ys.append(nxt_pct)
        if len(xs) < 50:
            continue
        ic_raw.append(spearman(xs, ys))
        ic_res.append(spearman(residualise(xs, rs), ys))
        used.append((a, len(xs)))

    def summ(ics, label):
        m = st.mean(ics); sd = st.stdev(ics); t = m / (sd / len(ics) ** 0.5)
        # permutation over days: flip sign of each daily IC (null: symmetric around 0)
        cnt = 0
        for _ in range(PERMS):
            m2 = st.mean(x if rng.random() < 0.5 else -x for x in ics)
            if m2 >= m:
                cnt += 1
        return {'mean_ic': m, 't_stat': t, 'p': (cnt + 1) / (PERMS + 1), 'days': len(ics),
                'share_days_positive': sum(1 for x in ics if x > 0) / len(ics)}
    return {'H6': summ(ic_raw, 'raw'), 'H7': summ(ic_res, 'resid'), 'avg_stocks_per_day': round(st.mean(n for _, n in used))}


def main():
    rng = random.Random(SEED)
    res = {'seed': SEED, 'perms': PERMS, 'alpha_bonferroni_one_sided': ALPHA}
    res['index'] = index_tests(rng)
    res['stocks'] = stock_tests(rng)
    if '--json' in sys.argv:
        print(json.dumps(res, indent=2, default=float)); return
    ix, sk = res['index'], res['stocks']
    print(f"Seed {SEED}, {PERMS} permutations, Bonferroni one-sided alpha = {ALPHA:.4f}\n")
    print(f"INDEX (n days with features: {ix['n_days']})")
    for h, label in (('H1', 'CLV vs next-day return'), ('H2', 'proxy delta vs next-day return'),
                     ('H3', 'proxy delta beyond same-day return'), ('H4', 'proxy delta vs 5d return (non-overlapping)')):
        r = ix[h]; flag = 'PASS' if r['p'] < ALPHA and r['ic'] > 0 else 'no'
        print(f"  {h} {label:45} IC {r['ic']:+.3f}  p {r['p']:.4f}  n {r['n']}  -> {flag}")
    r = ix['H5']; flag = 'PASS' if r['p'] < ALPHA and r['diff_mean_div_minus_non'] < 0 else 'no'
    print(f"  H5 divergence at 20d highs: 5d fwd mean {r['mean_div']*100:+.2f}% (n={r['n_div']}) vs {r['mean_non']*100:+.2f}% (n={r['n_non']}); diff {r['diff_mean_div_minus_non']*100:+.2f} pts  p {r['p']:.4f} -> {flag}")
    print(f"  H1 by year (descriptive): {ix['H1_by_year']}")
    print(f"  H1 by period (descriptive): {ix['H1_split']}")
    print(f"  Next-day return by CLV quintile (bps): {ix['quintile_next_day_bps']}")
    print(f"\nSTOCKS (cross-section, ~{sk['avg_stocks_per_day']} liquid stocks/day)")
    for h, label in (('H6', 'CLV vs next-day pct'), ('H7', 'CLV beyond same-day pct')):
        r = sk[h]; flag = 'PASS' if r['p'] < ALPHA and r['mean_ic'] > 0 else 'no'
        print(f"  {h} {label:30} mean IC {r['mean_ic']:+.3f}  t {r['t_stat']:+.2f}  p {r['p']:.4f}  days {r['days']}  positive days {r['share_days_positive']*100:.0f}%  -> {flag}")


if __name__ == '__main__':
    main()
