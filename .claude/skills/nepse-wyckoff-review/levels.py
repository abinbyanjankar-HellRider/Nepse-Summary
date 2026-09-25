#!/usr/bin/env python3
"""Key NEPSE levels from data/history/index.csv, for checking the hand-written
Wyckoff levels in index.html.

  python .claude/skills/nepse-wyckoff-review/levels.py [--since 2025-01-01]
"""
import argparse, csv, sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = Path(__file__).resolve().parents[3]
ap = argparse.ArgumentParser()
ap.add_argument('--since', default='2025-01-01', help='start of the swing/month table')
ap.add_argument('--swing', type=float, default=4.0, help='min %% reversal for a swing point')
args = ap.parse_args()

rows = [(r['date'], float(r['index']), float(r['turnover'] or 0))
        for r in csv.DictReader((ROOT / 'data/history/index.csv').open(encoding='utf-8'))]
if not rows:
    sys.exit('data/history/index.csv is empty — run scripts/backfill_history.py first')

hi = max(rows, key=lambda r: r[1])
print(f'History {rows[0][0]} → {rows[-1][0]} ({len(rows)} days) · last close {rows[-1][1]:.2f}')
print(f'All-time high close: {hi[1]:.2f} on {hi[0]}')

print('\nYear   high (date)            low (date)')
for y in sorted({d[:4] for d, *_ in rows}):
    ys = [r for r in rows if r[0].startswith(y)]
    h, l = max(ys, key=lambda r: r[1]), min(ys, key=lambda r: r[1])
    print(f'{y}   {h[1]:8.2f} ({h[0]})   {l[1]:8.2f} ({l[0]})')

sel = [r for r in rows if r[0] >= args.since]
print(f'\nMonth    close    high     low      avg turnover (Rs B)  since {args.since}')
months = {}
for r in sel:
    months.setdefault(r[0][:7], []).append(r)
for m, g in months.items():
    tos = [r[2] for r in g if r[2]]
    print(f'{m}  {g[-1][1]:8.2f} {max(r[1] for r in g):8.2f} {min(r[1] for r in g):8.2f}'
          f'   {sum(tos) / len(tos) / 1e9 if tos else 0:6.2f}')

# Zig-zag swing points: a new extreme is confirmed after a reversal of --swing %
print(f'\nSwing points (≥ {args.swing:g}% reversals) since {args.since}')
piv, trend, ext = [], None, sel[0]
for r in sel[1:]:
    if trend in (None, 'up') and r[1] >= ext[1] or trend == 'down' and r[1] <= ext[1]:
        ext = r
    elif abs(r[1] / ext[1] - 1) * 100 >= args.swing:
        kind = 'HIGH' if r[1] < ext[1] else 'LOW'
        piv.append((kind, ext))
        trend, ext = ('down' if kind == 'HIGH' else 'up'), r
for kind, (d, v, to) in piv:
    print(f'  {kind:4} {v:8.2f}  {d}  turnover Rs {to / 1e9:.1f} B')
print(f'  (unconfirmed extreme: {ext[1]:.2f} on {ext[0]})')
