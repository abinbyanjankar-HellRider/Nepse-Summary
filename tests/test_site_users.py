import sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import build_site as B
import manage_site_users as M


class Gen(unittest.TestCase):
    def test_generated_lines_pass_the_build_parser(self):
        users = B.parse_users(M.generate(['Abin', 'ram.k']))
        self.assertEqual(sorted(users), ['abin', 'ram.k'])
        for pw in users.values():
            self.assertGreaterEqual(len(pw), 24)

    def test_passphrases_differ(self):
        users = B.parse_users(M.generate(['abin', 'ram.k']))
        self.assertEqual(len(set(users.values())), 2)

    def test_bad_username_refused(self):
        with self.assertRaises(SystemExit):
            M.generate(['bad name'])


class Check(unittest.TestCase):
    def test_check_lists_names_not_passphrases(self):
        out = M.check('abin:correct horse battery staple\n')
        self.assertEqual(out, 'OK: 1 user(s): abin')
        self.assertNotIn('correct', out)

    def test_check_rejects_a_weak_line(self):
        with self.assertRaises(SystemExit):
            M.check('abin:short\n')


class Workflow(unittest.TestCase):
    def test_deploy_uses_site_users_not_a_shared_passphrase(self):
        text = (ROOT / '.github' / 'workflows' / 'nepse-daily.yml').read_text(encoding='utf-8')
        self.assertIn('SITE_USERS', text)
        self.assertNotIn('SITE_PASSPHRASE', text)
        self.assertIn('refusing to publish', text)
        self.assertIn('manage_site_users.py check', text)


if __name__ == '__main__':
    unittest.main()
