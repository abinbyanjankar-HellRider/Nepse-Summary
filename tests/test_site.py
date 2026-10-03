"""The encrypted, per-user login-protected copy of the site (scripts/build_site.py)."""
import sys, tempfile, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import build_site as B

USERS = {'zq-analyst': 'correct horse battery staple', 'ram.k': 'another: long passphrase ünï 42'}
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


class ParseUsers(unittest.TestCase):
    def test_parses_lines_comments_and_blank_lines(self):
        text = '# team\n\nZq-Analyst:correct horse battery staple\nram.k:pass:with:colons:and-more-chars\n'
        got = B.parse_users(text)
        self.assertEqual(got, {'zq-analyst': 'correct horse battery staple', 'ram.k': 'pass:with:colons:and-more-chars'})

    def test_rejects_bad_input(self):
        good = 'a-long-enough-passphrase'
        for text in ('', '# only a comment\n', 'nocolon\n', f'x:{good}\n',           # too-short username
                     f'bad name:{good}\n', 'ok.name:short\n',                        # space in name / short passphrase
                     f'dup.user:{good}\nDUP.user:{good}\n'):                         # duplicate after lowercasing
            with self.assertRaises(SystemExit, msg=repr(text)):
                B.parse_users(text)

    def test_error_never_echoes_the_passphrase(self):
        try:
            B.parse_users('ok.name:tooshort\n')
        except SystemExit as e:
            self.assertNotIn('tooshort', str(e))


class Build(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = make_root(self.tmp.name + '/src')
        self.out = Path(self.tmp.name) / 'site'
        self.files, self.blob = B.build(self.out, USERS, FAST, root=self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def test_each_user_can_open_it(self):
        for name, pw in USERS.items():
            got = B.decrypt(self.blob, name, pw)
            self.assertEqual(got, self.files)
            self.assertIn('2026-09-29', got['data/latest.json']['s'])
            self.assertIsNotNone(got['data/blob.bin'].get('b'))                     # binary survives as base64

    def test_username_is_normalised(self):
        self.assertEqual(B.decrypt(self.blob, '  ZQ-Analyst ', USERS['zq-analyst']), self.files)

    def test_wrong_password_and_unknown_user_look_identical(self):
        errs = []
        for name, pw in (('zq-analyst', 'wrong wrong wrong wrong'), ('nobody', USERS['zq-analyst']),
                         ('ram.k', USERS['zq-analyst'])):          # right password, someone else's account
            with self.assertRaises(ValueError) as cm:
                B.decrypt(self.blob, name, pw)
            errs.append(str(cm.exception))
        self.assertEqual(len(set(errs)), 1)

    def test_tampering_rejected(self):
        bad = bytearray(self.blob)
        bad[-5] ^= 1                                               # ciphertext
        with self.assertRaises(ValueError):
            B.decrypt(bytes(bad), 'zq-analyst', USERS['zq-analyst'])
        # the header is authenticated as a whole: altering ANOTHER user's slot breaks everyone's bundle
        i = self.blob.index(B.user_id('ram.k').encode()) + 100      # inside that slot's salt/iv/wk text
        forged = bytearray(self.blob)
        forged[i] = ord('A') if forged[i] != ord('A') else ord('B')
        with self.assertRaises(ValueError):
            B.decrypt(bytes(forged), 'zq-analyst', USERS['zq-analyst'])

    def test_revoked_user_cannot_open_a_new_build(self):
        only_one = {'zq-analyst': USERS['zq-analyst']}
        _, new_blob = B.build(self.out, only_one, FAST, root=self.root)
        with self.assertRaises(ValueError):
            B.decrypt(new_blob, 'ram.k', USERS['ram.k'])
        self.assertEqual(B.decrypt(new_blob, 'zq-analyst', USERS['zq-analyst']), self.files)

    def test_no_plaintext_or_usernames_published(self):
        for p in self.out.rglob('*'):
            if p.is_file():
                data = p.read_bytes()
                for needle in (b'SECRET-MARKER', b'trade_date', b'2700.5', b'2026-09-29', b'zq-analyst', b'ram.k'):
                    self.assertNotIn(needle, data, f'{needle!r} leaked into {p.name}')
        self.assertEqual(sorted(p.name for p in self.out.iterdir()),
                         ['.nojekyll', 'index.html', 'robots.txt', 'site.enc'])

    def test_provisional_and_temp_files_excluded(self):
        got = B.decrypt(self.blob, 'zq-analyst', USERS['zq-analyst'])
        for name in ('data/live.json', 'data/live_views.json', 'data/x.tmp'):
            self.assertNotIn(name, got)

    def test_fresh_keys_each_build(self):
        _, again = B.build(self.out, USERS, FAST, root=self.root)
        self.assertNotEqual(self.blob, again)
        self.assertNotEqual(self.blob[8:200], again[8:200])        # new salts / wrapped keys in the header

    def test_unlock_page_embeds_the_reader_and_asks_for_a_username(self):
        page = (self.out / 'index.html').read_text(encoding='utf-8')
        self.assertIn('UnlockCore', page)
        self.assertNotIn('__UNLOCK_CORE__', page)
        field = page.split('name="username"')[1].split('>')[0]
        self.assertNotIn('hidden', field)                          # a real, visible field


class Guards(unittest.TestCase):
    def test_short_passphrase_refused(self):
        with self.assertRaises(SystemExit):
            B.encrypt({'index.html': {'t': 'text/html', 's': 'x'}}, {'someone': 'short'}, FAST)

    def test_no_users_refused(self):
        with self.assertRaises(SystemExit):
            B.encrypt({'index.html': {'t': 'text/html', 's': 'x'}}, {}, FAST)

    def test_missing_page_file_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'data').mkdir()
            (Path(tmp) / 'index.html').write_text('x', encoding='utf-8')
            with self.assertRaises(SystemExit):
                B.collect(Path(tmp))

    def test_unicode_passphrase_normalised(self):
        composed, decomposed = 'caf\u00e9 passphrase long', 'cafe\u0301 passphrase long'
        blob = B.encrypt({'index.html': {'t': 'text/html', 's': 'x'}}, {'someone': composed}, FAST)
        self.assertEqual(B.decrypt(blob, 'someone', decomposed)['index.html']['s'], 'x')


if __name__ == '__main__':
    unittest.main()
