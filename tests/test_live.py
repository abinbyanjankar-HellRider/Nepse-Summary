"""Live-trading page parsing (scripts/live_intraday.py) and the fetch session."""
import sys, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import fetch_nepse as F
import live_intraday as L

ROWS = ''.join(
    f'<tr><td>S{i:03d}</td><td>{100 + i}</td><td>{99 + i}</td><td>{1000 + i}</td></tr>' for i in range(60))
PAGE = f'''<html><body>
<span id="dDate">2026-09-29 13:45:10</span>
<ul class="pull-right"><li><a class="btn">Market Open</a></li></ul>
<div class="mu-list"><h4>NEPSE Index</h4><span class="mu-value">2,700.50</span>
  <span class="mu-percent">1.25</span><span class="mu-price">3,500,000,000</span></div>
<div class="mu-list"><h4>Banking SubIndex</h4><span class="mu-value">1,500.10</span>
  <span class="mu-percent">-0.40</span></div>
<table><thead><tr><th>Symbol</th><th>LTP</th><th>Prev. Close</th><th>Vol</th></tr></thead>
<tbody>{ROWS}</tbody></table></body></html>'''


class ParseLive(unittest.TestCase):
    def test_parses_timestamp_tiles_and_rows(self):
        live = L.parse_live(PAGE, {})
        self.assertEqual((live['date'], live['time']), ('2026-09-29', '13:45'))
        self.assertEqual(live['tiles']['NEPSE Index']['value'], 2700.5)
        self.assertEqual(live['tiles']['Banking SubIndex']['pct'], -0.4)
        self.assertEqual(len(live['rows']), 60)

    def test_missing_timestamp_raises(self):
        with self.assertRaises(ValueError):
            L.parse_live(PAGE.replace('id="dDate"', 'id="other"'), {})


class SymbolMap(unittest.TestCase):
    def test_loaded_from_csv_only(self):
        m = F.load_symbol_map()
        self.assertGreater(len(m), 300)
        self.assertIn('NCCB', m)                    # legacy_symbols.csv
        name, sector = m['NCCB']
        self.assertTrue(name and sector)


class Session(unittest.TestCase):
    def test_retries_transient_errors(self):
        retry = F.SESSION.get_adapter('https://example.com').max_retries
        self.assertEqual(retry.total, 3)
        self.assertIn(503, retry.status_forcelist)


if __name__ == '__main__':
    unittest.main()
