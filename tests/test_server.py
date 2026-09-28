"""Access rules in scripts/secure_server.py — what the login server will serve."""
import sys, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import secure_server as S


class Servable(unittest.TestCase):
    def test_allowed(self):
        for p in ('/', '/index.html', '/data/latest.json', '/data/history/prices/2026-09-24.csv'):
            self.assertTrue(S.servable(p), p)

    def test_refused(self):
        for p in ('/.auth/users.json', '/%2Eauth/users.json', '/%2egit/config', '/data/%2E%2E/.auth/x',
                  '/data/..%2F.auth/users.json', '/data/..%5C.auth', '/logs/auth.log',
                  '/scripts/secure_server.py', '/docs/study-notes.md', '/data', '/data/x%00.json'):
            self.assertFalse(S.servable(p), p)


class Redirect(unittest.TestCase):
    def test_no_open_redirect(self):
        self.assertEqual(S.safe_next('/data/latest.json'), '/data/latest.json')
        for bad in ('https://evil.example', '//evil.example', '/\\evil.example', '', None):
            self.assertEqual(S.safe_next(bad), '/')


class Passwords(unittest.TestCase):
    def test_hash_roundtrip(self):
        h = S.hash_password('correct horse battery', iterations=1000)
        self.assertTrue(S.verify_password('correct horse battery', h))
        self.assertFalse(S.verify_password('wrong', h))
        self.assertFalse(S.verify_password('x', 'garbage'))


class AIRequest(unittest.TestCase):
    def req(self, content, **kw):
        return {'system': 'sys', 'messages': [{'role': 'user', 'content': content}], **kw}

    def test_text_and_image(self):
        img = {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': 'AAAA'}}
        system, blocks, web = S.parse_ai_request(self.req([img, {'type': 'text', 'text': 'hi'}], web_search=True))
        self.assertEqual((system, len(blocks), web), ('sys', 2, True))

    def test_string_content(self):
        self.assertEqual(S.parse_ai_request(self.req('hi'))[1], [{'type': 'text', 'text': 'hi'}])

    def test_refused(self):
        bad = [
            {'system': 'x', 'messages': []},                                                # no turn
            self.req('hi') | {'messages': [{'role': 'assistant', 'content': 'hi'}]},        # not a user turn
            self.req([{'type': 'tool_use', 'id': 'x', 'name': 'y', 'input': {}}]),          # other block types
            self.req([{'type': 'image', 'source': {'type': 'url', 'url': 'http://x'}}]),    # remote image
            self.req([{'type': 'image', 'source': {'type': 'base64', 'media_type': 'text/html', 'data': 'x'}}]),
            {'system': 'x' * 30_001, 'messages': [{'role': 'user', 'content': 'hi'}]},      # oversized
        ]
        for r in bad:
            with self.assertRaises(ValueError, msg=str(r)[:80]):
                S.parse_ai_request(r)

    def test_model_and_tools_not_taken_from_page(self):
        system, blocks, web = S.parse_ai_request(self.req('hi', model='claude-x', max_tokens=10 ** 9,
                                                          tools=[{'type': 'bash_20250124'}]))
        self.assertFalse(web)       # only the web_search flag is honoured; model/tools are the server's


class RateLimit(unittest.TestCase):
    def test_per_user_hourly_cap(self):
        g = S.Guard()
        self.assertTrue(all(g.ai_allowed('u') for _ in range(S.AI_PER_HOUR)))
        self.assertFalse(g.ai_allowed('u'))
        self.assertTrue(g.ai_allowed('other'))


if __name__ == '__main__':
    unittest.main()
