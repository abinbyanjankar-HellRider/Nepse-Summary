"""Scraper parsing and the day-level guards in scripts/fetch_nepse.py.
Run: python -m unittest discover -s tests"""
import csv, os, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import fetch_nepse as F


def price_page(rows, as_of='2026-09-24'):
    """A ShareSansar-like price table: header + one row per (sym, ltp, prev)."""
    body = ''.join(f'<tr><td>{i}</td><td><a title="{s} Ltd">{s}</a></td><td>{ltp:,.2f}</td>'
                   f'<td>{prev:,.2f}</td><td>1,000</td><td>{ltp * 1000:,.2f}</td></tr>'
                   for i, (s, ltp, prev) in enumerate(rows, 1))
    stamp = f'<span>As of : {as_of}</span>' if as_of else ''
    return (f'<html><body>{stamp}<table><thead><tr><th>S.No</th><th>Symbol</th><th>LTP</th>'
            f'<th>Prev. Close</th><th>Vol</th><th>Turnover</th></tr></thead><tbody>{body}</tbody></table>'
            f'</body></html>')


def syms(n):
    return [f'S{i:03d}' for i in range(n)]


class Num(unittest.TestCase):
    def test_formats(self):
        self.assertEqual(F.num('1,234.56'), 1234.56)
        self.assertEqual(F.num('(1.5)'), -1.5)
        self.assertEqual(F.num('−2'), -2)
        self.assertEqual(F.num('Rs. 10'), 10)
        for blank in (None, '', '-', '--', 'N/A', 'abc'):
            self.assertIsNone(F.num(blank))


class PriceTable(unittest.TestCase):
    def test_parses_rows_and_derives_change(self):
        rows = F.parse_price_table(price_page([(s, 110.0, 100.0) for s in syms(60)]), {})
        self.assertEqual(len(rows), 60)
        r = rows[0]
        self.assertEqual((r['sym'], r['ltp'], r['prev'], r['change'], r['pct']), ('S000', 110.0, 100.0, 10.0, 10.0))
        self.assertEqual(r['name'], 'S000 Ltd')

    def test_too_few_rows_is_not_a_price_table(self):
        self.assertEqual(F.parse_price_table(price_page([(s, 1.0, 1.0) for s in syms(10)]), {}), [])

    def test_non_ticker_symbols_dropped(self):
        rows = [(s, 5.0, 5.0) for s in syms(60)] + [('<b>X</b>', 5.0, 5.0)]
        self.assertTrue(all(r['sym'].isalnum() for r in F.parse_price_table(price_page(rows), {})))

    def test_as_of_date(self):
        self.assertEqual(F.find_as_of_date(price_page([], '2026-09-24')), '2026-09-24')
        self.assertIsNone(F.find_as_of_date(price_page([], None)))


class IndexText(unittest.TestCase):
    def test_extract(self):
        out = F.extract_index('<div>NEPSE Index 2,712.45 +12.30 +0.46%</div>')
        self.assertEqual(out['index'], 2712.45)
        self.assertEqual(out['change'], 12.30)
        self.assertEqual(out['changePct'], 0.46)

    def test_implausible_value_ignored(self):
        self.assertIsNone(F.extract_index('<div>NEPSE 9,999.00</div>'))


class MeroLaganiBars(unittest.TestCase):
    def test_latest_stamp_wins_and_bounds(self):
        day = 1790000000          # a UTC timestamp; two stamps on the same UTC date
        d = {'s': 'ok', 't': [day, day + 60, day + 86400], 'c': [2700, 2710, 99999],
             'o': [1, 1, 1], 'h': [1, 1, 1], 'l': [1, 1, 1], 'v': [5, 6, 7]}
        bars = F.parse_merolagani_bars(d)
        self.assertEqual(len(bars), 1)                 # 99999 is outside the bounds
        self.assertEqual(bars[0]['index'], 2710)       # later stamp of the same day

    def test_not_ok(self):
        self.assertEqual(F.parse_merolagani_bars({'s': 'no_data'}), [])


class CleanPayload(unittest.TestCase):
    def test_strips_markup_and_bad_rows(self):
        out = F.clean_payload({'name': '<img src=x onerror=alert(1)>', 'rows': [{'sym': 'NABIL'}, {'sym': 'x<y'}]})
        self.assertNotIn('<', out['name'])
        self.assertEqual(out['rows'], [{'sym': 'NABIL'}])


class PeriodKey(unittest.TestCase):
    def test_week_ends_saturday(self):
        # Mon–Fri and the old Sun–Thu week both group under the Saturday that ends them
        self.assertEqual(F.period_key('2026-09-21', 'week'), '2026-09-26')
        self.assertEqual(F.period_key('2026-09-25', 'week'), '2026-09-26')
        self.assertEqual(F.period_key('2026-09-24', 'month'), '2026-09')


class PricesWithoutDate(unittest.TestCase):
    """A price list with no as-of date must continue the last stored session."""
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        with (self.dir / '2026-09-24.csv').open('w', newline='', encoding='utf-8') as f:
            w = csv.writer(f)
            w.writerow(['sym', 'ltp'])
            w.writerows([(s, 100.0) for s in syms(60)])
        self.patch = mock.patch.object(F, 'PRICE_DIR', self.dir)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()

    def test_next_session_accepted(self):
        prices = [{'sym': s, 'prev': 100.0, 'ltp': 104.0} for s in syms(60)]
        self.assertTrue(F.prices_follow_last_session(prices, '2026-09-25')[0])

    def test_stale_page_rejected(self):
        # yesterday's list again: its prev closes are the day before, not the stored LTPs
        prices = [{'sym': s, 'prev': 96.0, 'ltp': 100.0} for s in syms(60)]
        self.assertFalse(F.prices_follow_last_session(prices, '2026-09-25')[0])


class ClaudeFallback(unittest.TestCase):
    def test_only_known_keys_survive(self):
        reply = '```json {"index": 2700.5, "trade_date": "2026-09-24", "prices": [1], "source": "x"} ```'
        with mock.patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'test'}), \
             mock.patch('claude_client.ask', return_value=reply):
            data = F.claude_fetch('2026-09-24')
        self.assertEqual(data, {'index': 2700.5, 'trade_date': '2026-09-24'})

    def test_invalid_index_rejected(self):
        with mock.patch.dict(os.environ, {'ANTHROPIC_API_KEY': 'test'}), \
             mock.patch('claude_client.ask', return_value='{"index": 12}'):
            self.assertIsNone(F.claude_fetch('2026-09-24'))


if __name__ == '__main__':
    unittest.main()
