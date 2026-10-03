"""The browser-side NSD2 reader must open what build_site.py writes (run under Node's WebCrypto)."""
import json, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import build_site as B

NODE = shutil.which('node')
USERS = {'zq-analyst': 'correct horse battery staple', 'ram.k': 'another: long passphrase ünï 42'}
FILES = {'index.html': {'t': 'text/html', 's': '<p>hi ünï</p>'}, 'data/x.bin': {'t': 'application/octet-stream', 'b': 'AP8='}}


@unittest.skipUnless(NODE, 'node not installed')
class Unlock(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.blob_path = Path(cls.tmp.name) / 'site.enc'
        cls.blob_path.write_bytes(B.encrypt(FILES, USERS, 1000))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def run_node(self, user, pw, path=None):
        out = subprocess.run([NODE, str(ROOT / 'tests' / 'js' / 'run_unlock.cjs'), str(path or self.blob_path), user, pw],
                             capture_output=True, text=True, encoding='utf-8', timeout=60, check=True).stdout
        return json.loads(out)

    def test_each_user_opens_the_python_built_bundle(self):
        for name, pw in USERS.items():
            r = self.run_node(name, pw)
            self.assertTrue(r['ok'], r)
            self.assertEqual(r['files'], FILES)

    def test_username_case_and_spaces_ignored(self):
        self.assertTrue(self.run_node('  ZQ-Analyst ', USERS['zq-analyst'])['ok'])

    def test_wrong_password_unknown_user_and_swapped_account_all_say_wrong(self):
        for name, pw in (('zq-analyst', 'wrong wrong wrong wrong'), ('nobody', USERS['zq-analyst']),
                         ('ram.k', USERS['zq-analyst'])):
            r = self.run_node(name, pw)
            self.assertFalse(r['ok'])
            self.assertTrue(r['wrong'], r)
            self.assertEqual(r['message'], 'Wrong username or passphrase.')

    def test_nfkc_parity_with_python(self):
        composed = 'café passphrase long'
        decomposed = 'café passphrase long'
        self.assertNotEqual(composed, decomposed)
        users = {B.norm_user('ＺＱ-Analyst'): composed,            # fullwidth ZQ in the stored username
                 B.norm_user('ﬁle.user'): 'fullwidth ＰＷ passphrase'}   # fi-ligature username
        path = Path(self.tmp.name) / 'nfkc.enc'
        path.write_bytes(B.encrypt(FILES, users, 1000))
        for name, pw in (('zq-analyst', decomposed),                       # decomposed password vs composed bundle
                         ('ZQ-Analyst', composed),
                         ('ＺＱ-Analyst', composed),                # fullwidth username typed in the browser
                         ('ﬁle.user', 'fullwidth PW passphrase'),
                         ('file.user', 'fullwidth ＰＷ passphrase')):
            self.assertTrue(self.run_node(name, pw, path)['ok'], name)
            self.assertEqual(B.decrypt(path.read_bytes(), name, pw), FILES, name)

    def test_bad_magic_and_truncated_blobs_give_a_clean_error(self):
        good = self.blob_path.read_bytes()
        cases = {'magic': b'XXXX' + good[4:], 'short': good[:6], 'tiny': b'NS', 'cut': good[:30],
                 'junk-header': b'NSD2' + (5).to_bytes(4, 'big') + b'{notj' + bytes(20)}
        for label, blob in cases.items():
            path = Path(self.tmp.name) / f'{label}.enc'
            path.write_bytes(blob)
            r = self.run_node('zq-analyst', USERS['zq-analyst'], path)
            self.assertFalse(r['ok'], label)
            self.assertFalse(r['wrong'], label)
            self.assertNotEqual(r['message'], 'Wrong username or passphrase.', label)
            self.assertNotRegex(r['message'], r'TypeError|RangeError|SyntaxError|undefined|Unexpected', label)


if __name__ == '__main__':
    unittest.main()
