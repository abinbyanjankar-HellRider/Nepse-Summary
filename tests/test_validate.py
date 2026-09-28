"""Sanity checks in scripts/validate_data.py — what may never be committed."""
import sys, tempfile, unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import validate_data as V

TODAY = '2026-09-28'


def payload(**kw):
    p = {'index': 2700.0, 'trade_date': '2026-09-24',
         'prices': [{'sym': f'S{i:03d}', 'ltp': 100.0, 'pct': 1.0} for i in range(200)]}
    p.update(kw)
    return p


class TradeDate(unittest.TestCase):
    def setUp(self):
        V.load_holidays.cache_clear()

    def tearDown(self):
        V.load_holidays.cache_clear()

    def test_weekend_and_future(self):
        self.assertEqual(V.check_trade_date('2026-09-24', TODAY), [])       # Thursday
        self.assertTrue(V.check_trade_date('2026-09-26', TODAY))            # Saturday
        self.assertTrue(V.check_trade_date('2026-09-27', TODAY))            # Sunday after Mon–Fri switch
        self.assertEqual(V.check_trade_date('2026-01-04', TODAY), [])       # Sunday before the switch
        self.assertTrue(V.check_trade_date('2026-09-29', TODAY))            # future
        self.assertTrue(V.check_trade_date('not-a-date', TODAY))

    def test_weekly_holidays(self):
        # Sunday: trading day before the Government's weekly-holiday change,
        # weekly holiday after it; Friday: trading day after it; Saturday: never
        self.assertFalse(V.weekly_holiday('2026-04-05'))    # last Sunday session
        self.assertTrue(V.weekly_holiday('2026-04-12'))     # Sunday after the change
        self.assertFalse(V.weekly_holiday('2026-04-10'))    # first Friday session
        self.assertTrue(V.weekly_holiday('2026-09-26'))     # Saturday

    def test_repo_holiday_list_has_no_weekly_holidays(self):
        # holidays.csv lists only closures on trading weekdays (Mon–Fri)
        self.assertEqual(V.check_holiday_list(V.load_holidays()), [])
        self.assertTrue(V.check_holiday_list({'2026-10-11': 'Ghatasthapana (a Sunday)'}))

    def test_listed_holiday_is_advisory(self):
        # a close on a listed day is a warning, never a refusal: a wrong list
        # entry must not block a real session
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / 'holidays.csv'
            f.write_text('date,name,source\n2026-09-24,Test holiday,test\n', encoding='utf-8')
            with mock.patch.object(V, 'HOLIDAYS_CSV', f):
                errs, warns = V.check_payload(payload(), 2690.0, TODAY)
        self.assertEqual(errs, [])
        self.assertTrue(any('holiday' in w for w in warns))


class Payload(unittest.TestCase):
    def test_good_day(self):
        self.assertEqual(V.check_payload(payload(), 2690.0, TODAY)[0], [])

    def test_phantom_day(self):
        errs, _ = V.check_payload(payload(), 2700.0, TODAY)
        self.assertTrue(any('phantom' in e for e in errs))

    def test_implausible_move(self):
        self.assertTrue(V.check_payload(payload(index=3100.0), 2700.0, TODAY)[0])

    def test_index_out_of_range(self):
        self.assertTrue(V.check_payload(payload(index=50.0), None, TODAY)[0])

    def test_bad_price_rows(self):
        p = payload()
        p['prices'][0]['sym'] = 'bad sym'
        p['prices'][1] = dict(p['prices'][2])                  # duplicate symbol
        p['prices'][3]['ltp'] = 0
        errs, _ = V.check_payload(p, 2690.0, TODAY)
        text = ' '.join(errs)
        for word in ('invalid symbols', 'duplicate', 'LTP'):
            self.assertIn(word, text)

    def test_misaligned_columns(self):
        p = payload()
        for r in p['prices'][:10]:
            r['pct'] = 45.0
        self.assertTrue(any('misaligned' in e for e in V.check_payload(p, 2690.0, TODAY)[0]))


class History(unittest.TestCase):
    def test_duplicates_and_phantoms(self):
        rows = [{'date': '2026-09-23', 'index': '2700'}, {'date': '2026-09-24', 'index': '2700'}]
        self.assertTrue(any('phantom' in e for e in V.check_history(rows, TODAY)[0]))
        rows = [{'date': '2026-09-24', 'index': '2700'}, {'date': '2026-09-24', 'index': '2710'}]
        self.assertTrue(any('unique' in e for e in V.check_history(rows, TODAY)[0]))


class Candles(unittest.TestCase):
    def test_high_low_must_contain_open_close(self):
        c = [{'date': '2026-09-24', 'open': '2700', 'high': '2705', 'low': '2690', 'close': '2710'}]
        self.assertTrue(V.check_ohlc(c, [])[0])


if __name__ == '__main__':
    unittest.main()
