"""The encrypted, login-protected copy of the site (scripts/build_site.py)."""
import sys, tempfile, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import build_site as B

PASS = 'correct horse battery staple'
FAST = 1000                                  # PBKDF2 rounds: fast for tests, same code path


def make_root(tmp):
    root = Path(tmp)
    root.mkdir(parents=True, exist_ok=True)
    for n in B.PAGE_FILES:
        (root / n).write_text(f'<!-- {n} -->SECRET-MARKER-{n}', encoding='utf-8')
    (root / 'data' / 'history').mkdir(parents=True)
    (root / 'data' / 'latest.json').write_text('{"trade_date":"2026-09-29","index":2700.5}', encoding='utf-8')
    (root / 'data' / 'history' / 'index.csv').write_text('date,index\n2026-09-29,2700.5\n', encoding='utf-8')
    (root / 'data' / 'live.json').write_text('{"live":true}', encoding='utf-8')           # provisional
    (root / 'data' / 'live_views.json').write_text('{}', encoding='utf-8')
    (root / 'data' / 'x.tmp').write_text('half-written', encoding='utf-8')
    (root / 'data' / 'blob.bin').write_bytes(b'\xff\xfe\x00binary')
    return root


class Build(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = make_root(self.tmp.name + '/src')
        self.out = Path(self.tmp.name) / 'site'
        self.files, self.blob = B.build(self.out, PASS, FAST, root=self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def test_roundtrip(self):
        got = B.decrypt(self.blob, PASS)
        self.assertEqual(got, self.files)
        self.assertIn('2026-09-29', got['data/latest.json']['s'])
        self.assertEqual(got['data/blob.bin'].get('b') is not None, True)          # binary survives as base64

    def test_wrong_passphrase_and_tampering_rejected(self):
        with self.assertRaises(ValueError):
            B.decrypt(self.blob, PASS + 'x')
        bad = bytearray(self.blob)
        bad[-5] ^= 1
        with self.assertRaises(ValueError):
            B.decrypt(bytes(bad), PASS)
        params = bytearray(self.blob)
        params[7] ^= 1                                       # iterations field is authenticated
        with self.assertRaises(ValueError):
            B.decrypt(bytes(params), PASS)

    def test_no_plaintext_published(self):
        for p in self.out.rglob('*'):
            if p.is_file():
                data = p.read_bytes()
                for needle in (b'SECRET-MARKER', b'trade_date', b'2700.5', b'2026-09-29'):
                    self.assertNotIn(needle, data, f'{needle!r} leaked into {p.name}')
        self.assertEqual(sorted(p.name for p in self.out.iterdir()),
                         ['.nojekyll', 'index.html', 'robots.txt', 'site.enc'])

    def test_provisional_and_temp_files_excluded(self):
        got = B.decrypt(self.blob, PASS)
        for name in ('data/live.json', 'data/live_views.json', 'data/x.tmp'):
            self.assertNotIn(name, got)

    def test_fresh_salt_and_iv_each_build(self):
        _, again = B.build(self.out, PASS, FAST, root=self.root)
        self.assertNotEqual(self.blob[8:36], again[8:36])
        self.assertNotEqual(self.blob, again)


class Guards(unittest.TestCase):
    def test_short_passphrase_refused(self):
        with self.assertRaises(SystemExit):
            B.encrypt({'index.html': {'t': 'text/html', 's': 'x'}}, 'short', FAST)

    def test_missing_page_file_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'data').mkdir()
            (Path(tmp) / 'index.html').write_text('x', encoding='utf-8')
            with self.assertRaises(SystemExit):
                B.collect(Path(tmp))

    def test_unicode_passphrase_normalised(self):
        composed, decomposed = 'café passphrase long', 'café passphrase long'
        blob = B.encrypt({'index.html': {'t': 'text/html', 's': 'x'}}, composed, FAST)
        self.assertEqual(B.decrypt(blob, decomposed)['index.html']['s'], 'x')


if __name__ == '__main__':
    unittest.main()
