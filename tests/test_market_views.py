"""RRG / heatmap maths in scripts/market_views.py."""
import sys, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import market_views as M


class Maths(unittest.TestCase):
    def test_zscore(self):
        out = M.zscore_series([1, 2, 3, 4, 5], 3)
        self.assertEqual(out[:2], [None, None])
        self.assertAlmostEqual(out[2], 100 + (3 - 2) / (2 / 3) ** 0.5)
        self.assertEqual(M.zscore_series([7, 7, 7], 3)[2], 100.0)          # flat → 100, no division by 0
        self.assertIsNone(M.zscore_series([1, None, 3], 3)[2])            # gap inside the window

    def test_ema_restarts_after_gap(self):
        out = M.ema([10, 20, None, 30], 3)
        self.assertEqual(out[0], 10)
        self.assertEqual(out[1], 15)
        self.assertIsNone(out[2])
        self.assertEqual(out[3], 30)                                       # restarted

    def test_quadrants(self):
        self.assertEqual(M.quadrant(101, 101), 'Leading')
        self.assertEqual(M.quadrant(101, 99), 'Weakening')
        self.assertEqual(M.quadrant(99, 99), 'Lagging')
        self.assertEqual(M.quadrant(99, 101), 'Improving')

    def test_rrg_length_and_warmup(self):
        n = 80
        prices = [100 + i * 0.5 for i in range(n)]
        bench = [100 + i * 0.2 for i in range(n)]
        out = M.rrg(prices, bench)
        self.assertEqual(len(out), n)
        self.assertIsNone(out[0])
        self.assertIsNotNone(out[-1])


class Align(unittest.TestCase):
    def test_forward_fill_limited_to_five_sessions(self):
        dates = [f'd{i:02d}' for i in range(8)]
        out = M.align([('d00', 1.0, None)], dates)
        self.assertEqual(out[:6], [1.0] * 6)
        self.assertEqual(out[6:], [None, None])


class Heatmap(unittest.TestCase):
    def test_pct_changes(self):
        s = [('2026-08-28', 90.0, None), ('2026-09-18', 100.0, None), ('2026-09-24', 110.0, None)]
        ch = M.pct_changes(s)
        self.assertEqual(ch['d'], 10.0)                # vs previous session
        self.assertEqual(ch['w'], 10.0)                # vs last close of an earlier week
        self.assertEqual(ch['m'], round((110 / 90 - 1) * 100, 2))


if __name__ == '__main__':
    unittest.main()
