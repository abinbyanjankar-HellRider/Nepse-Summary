# Dashboard Redesign + Per-User Site Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard phone-first with 5 grouped navigation tabs and a decision-first "Today" page, and protect the published copy with per-user username + passphrase login.

**Architecture:** Navigation reuses the existing page system (`PAGE_MEMBERS` / `showPage` / `navTo` in `app.js`): a new `NAV_GROUPS` data table maps the 16 existing page ids to 5 groups, rendered as a phone bottom tab bar + sub-view chip row (desktop: the existing sidebar, regrouped). The published site moves from one shared passphrase (format NSD1) to per-user key slots (format NSD2): one random data key per build, wrapped separately under each user's PBKDF2-derived key. `.auth/users.json` and `secure_server.py` stay as they are.

**Tech Stack:** Python 3.12 (`cryptography`, `unittest`/`pytest`), vanilla JS (no framework), WebCrypto in the browser, Node 18+ (only to cross-test the browser crypto), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-03-dashboard-redesign-design.md`

## Global Constraints

- No inline JS and no inline event handlers; behaviour is declared with `data-on-click="fn('arg')"` (CSP in `scripts/secure_server.py:63` forbids inline script). The delegated dispatcher (`app.js` ~line 5015) works for elements created at runtime, and only calls global functions with literal args.
- Do not change `scripts/fetch_nepse.py`, `run_daily.py`, `market_views.py`, `verify_daily.py`, `validate_data.py`, `secure_server.py`, or the formats of anything in `data/`.
- Keep `.auth/users.json` as the local user store. No SQLite, no server-side database.
- Every existing page id keeps working as `#/<id>` and `navTo('<id>')`.
- Site passphrases: at least 16 characters (`MIN_PASSPHRASE` in `build_site.py`). PBKDF2-SHA256, 1,000,000 rounds (`ITERATIONS`). Usernames: `^[a-z0-9._-]{2,32}$` after NFKC + trim + lowercase.
- Secrets live only in GitHub Actions secrets / the environment; never print a passphrase, never commit one.
- Phone targets: 360-430 px wide; no horizontal page scroll; tap targets at least 44 px; form inputs at least 16 px font.
- Existing tests (`python -m pytest -q`, 55 pass at baseline) must keep passing after each task. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Work on branch `redesign/decision-first`.

## Deviations from the approved spec (found while reading the code)

1. **`levels-sec` is already reachable**: it belongs to the "Levels & structure" page (`PAGE_MEMBERS['structure-sec']`). No change needed; it stays in the Charts group.
2. **`chart-sec` is the home page** (close report + data check + changes + chart on one page), so it sits in the Today group, not Charts.
3. **No watchlist tile and no NRB strip on Today.** There is no watchlist data (it would need per-user storage, a non-goal), and the NRB blocks are hand-entered prose with no structured numbers, so a strip would duplicate hard-coded values. Today gets a breadth bar plus top gainers / losers / turnover from `data/latest.json`; the existing "what changed" and "plan status" panels stay.
4. **The unlock page does not read the old NSD1 format.** `index.html` and `site.enc` are published together in one orphan commit (the workflow already does this), so a mixed state cannot occur; a stale cached unlock page shows "Reload the page".
5. **The phone-first layer is additive**: the existing ~1,300-line desktop-first stylesheet is left alone; a new final block adds the phone-first nav and layout rules and neutralises the old `max-width: 900px` top-bar rule.

## Review Focus

Inputs and conditions the spec implies but would not otherwise be tested (each is pinned in the named task):

1. Username typed with capitals or spaces (`"  Abin "`) must still unlock (Tasks 1, 2).
2. Unknown user, wrong passphrase, and "right passphrase on someone else's account" must give the same message, so the page never reveals which part was wrong (Tasks 1, 2).
3. A passphrase containing `:` or non-ASCII characters: `SITE_USERS` splits only on the first colon, and NFKC normalisation must match between Python and the browser (Tasks 1, 2).
4. A sidebar page missing from every group, in two groups, or a group page that no longer exists (Task 4).
5. A stale or unknown hash (`#/nonsense`) and deep-linking `#/rrg-sec` on a phone with the bottom tab bar visible; charts hidden at load must resize when shown or rotated (Tasks 4, 5 manual check).

---

### Task 1: NSD2 per-user encryption in `build_site.py`

**Files:**
- Modify: `scripts/build_site.py` (replace `encrypt`, `decrypt`, `build`, `main`; update docstring)
- Test: `tests/test_site.py` (rewrite)

**Interfaces:**
- Produces:
  - `norm_user(username: str) -> str`
  - `parse_users(text: str) -> dict[str, str]` (username -> passphrase; raises `SystemExit` on bad input)
  - `user_id(username: str) -> str` (hex SHA-256 of the normalised username)
  - `encrypt(files: dict, users: dict[str, str], iterations: int = ITERATIONS) -> bytes`
  - `decrypt(blob: bytes, username: str, password: str) -> dict` (raises `ValueError` on any credential or integrity failure)
  - `build(out, users, iterations=ITERATIONS, root=ROOT) -> (files, blob)`
  - Format NSD2: `'NSD2' | header_len u32 BE | header JSON | iv 12 | AES-GCM(ciphertext+tag)`; header = `{"v":2,"slots":[{"id","it","salt","iv","wk"}]}` (base64 fields); slot-wrap AAD = `b'NSD2-slot:' + id`; bundle AAD = everything before the 12-byte iv (magic, length, header JSON).

- [ ] **Step 1: Rewrite `tests/test_site.py` (failing tests first)**

```python
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
        i = self.blob.index(B.user_id('ram.k').encode()) + 70       # inside that slot's salt/iv/wk text
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
```

- [ ] **Step 2: Run the tests; verify they fail**

Run: `python -m pytest tests/test_site.py -q`
Expected: FAIL (`AttributeError: module 'build_site' has no attribute 'parse_users'`).

- [ ] **Step 3: Implement NSD2 in `scripts/build_site.py`**

Docstring: replace the "Limits" and "File format" paragraphs with:

```
Limits (read DEPLOYMENT.md): each user has their own passphrase, but a static site
cannot lock anyone out - anyone can download site.enc and try guesses offline, so
passphrases must be long (the build refuses fewer than 16 characters). Removing a
user from SITE_USERS and redeploying revokes them from new builds only. This only
protects the published copy - the source repository must be private, or its plain
files give the same data away.

File format of site.enc (NSD2; integers big-endian):
  'NSD2' | header_len u32 | header JSON | iv 12 | AES-256-GCM(ciphertext + tag)
  header = {"v":2,"slots":[{"id","it","salt","iv","wk"}]}   (base64 fields)
  A fresh random 256-bit data key encrypts the bundle (AAD = everything before iv).
  Each user's slot holds that key, AES-GCM-wrapped under PBKDF2-SHA256(passphrase,
  salt, it) with AAD b'NSD2-slot:' + id, where id = SHA-256(normalised username).
```
Also in the docstring's first paragraph, change "under a key derived from the passphrase (PBKDF2-SHA256, 1,000,000 rounds)" to "under a data key wrapped per user (PBKDF2-SHA256, 1,000,000 rounds)".

Imports: `import argparse, base64, gzip, hashlib, json, os, re, secrets, struct, sys, unicodedata`.
Constants (replace `MAGIC = b'NSD1'`; keep `ITERATIONS`, `MIN_PASSPHRASE`, `PAGE_FILES`, `SKIP_DATA`, `TYPES`, `norm`, `derive_key`, `collect`):

```python
MAGIC = b'NSD2'
SLOT_AAD = b'NSD2-slot:'
USER_RE = re.compile(r'^[a-z0-9._-]{2,32}$')
BAD = 'wrong username or passphrase, or corrupted bundle'
b64 = lambda b: base64.b64encode(b).decode('ascii')
```

Replace `encrypt`, `decrypt`, `build`, `main` with:

```python
def norm_user(username):
    return unicodedata.normalize('NFKC', username).strip().lower()


def user_id(username):
    return hashlib.sha256(norm_user(username).encode('utf-8')).hexdigest()


def parse_users(text):
    """SITE_USERS secret: one 'username:passphrase' per line; '#' comments and blank lines ignored.
    Splits on the FIRST colon only, so passphrases may contain colons. Never echoes a passphrase."""
    users = {}
    for n, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        name, sep, pw = line.partition(':')
        name = norm_user(name)
        if not sep or not USER_RE.match(name):
            raise SystemExit(f'build_site: SITE_USERS line {n}: expected "username:passphrase" with a username of '
                             '2-32 characters from a-z 0-9 . _ -')
        if name in users:
            raise SystemExit(f'build_site: SITE_USERS line {n}: duplicate username {name!r}')
        if len(pw) < MIN_PASSPHRASE:
            raise SystemExit(f'build_site: SITE_USERS line {n} ({name!r}): passphrase must be at least '
                             f'{MIN_PASSPHRASE} characters')
        users[name] = pw
    if not users:
        raise SystemExit('build_site: SITE_USERS has no users - refusing to publish a site nobody can open')
    return users


def encrypt(files, users, iterations=ITERATIONS):
    if not users:
        raise SystemExit('build_site: no users - refusing to publish a site nobody can open')
    dk = secrets.token_bytes(32)
    slots = []
    for name, pw in users.items():
        if len(pw) < MIN_PASSPHRASE:
            raise SystemExit(f'build_site: passphrase for {name!r} must be at least {MIN_PASSPHRASE} characters')
        sid, salt, iv = user_id(name), secrets.token_bytes(16), secrets.token_bytes(12)
        wk = AESGCM(derive_key(pw, salt, iterations)).encrypt(iv, dk, SLOT_AAD + sid.encode('ascii'))
        slots.append({'id': sid, 'it': iterations, 'salt': b64(salt), 'iv': b64(iv), 'wk': b64(wk)})
    slots.sort(key=lambda s: s['id'])                  # order by hash, not by name
    header = json.dumps({'v': 2, 'slots': slots}, separators=(',', ':')).encode('utf-8')
    prefix = MAGIC + struct.pack('>I', len(header)) + header
    iv = secrets.token_bytes(12)
    plain = gzip.compress(json.dumps(files, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), 9, mtime=0)
    return prefix + iv + AESGCM(dk).encrypt(iv, plain, prefix)


def decrypt(blob, username, password):
    """Inverse of encrypt (used by the tests). Raises ValueError on any credential or integrity failure."""
    if blob[:4] != MAGIC:
        raise ValueError('not a site bundle')
    hlen = struct.unpack('>I', blob[4:8])[0]
    if 8 + hlen + 12 > len(blob):
        raise ValueError(BAD)
    prefix = blob[:8 + hlen]
    sid = user_id(username)
    try:
        slot = next((s for s in json.loads(blob[8:8 + hlen])['slots'] if s['id'] == sid), None)
        if slot is None:
            raise ValueError(BAD)
        kek = derive_key(password, base64.b64decode(slot['salt']), slot['it'])
        dk = AESGCM(kek).decrypt(base64.b64decode(slot['iv']), base64.b64decode(slot['wk']),
                                 SLOT_AAD + sid.encode('ascii'))
        iv = blob[len(prefix):len(prefix) + 12]
        plain = AESGCM(dk).decrypt(iv, blob[len(prefix) + 12:], prefix)
    except (InvalidTag, KeyError, TypeError):
        raise ValueError(BAD) from None
    return json.loads(gzip.decompress(plain).decode('utf-8'))


def build(out, users, iterations=ITERATIONS, root=ROOT):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    files = collect(root)
    blob = encrypt(files, users, iterations)
    (out / 'site.enc').write_bytes(blob)
    (out / 'index.html').write_text((Path(__file__).with_name('unlock_template.html')).read_text(encoding='utf-8'),
                                    encoding='utf-8', newline='\n')
    (out / '.nojekyll').write_text('', encoding='utf-8')
    (out / 'robots.txt').write_text('User-agent: *\nDisallow: /\n', encoding='utf-8', newline='\n')
    return files, blob


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--out', default='_site')
    args = ap.parse_args()
    text = os.environ.get('SITE_USERS', '')
    if not text.strip():
        raise SystemExit('build_site: SITE_USERS is not set - refusing to publish an unprotected site')
    files, blob = build(args.out, parse_users(text))
    print(f'build_site: {len(files)} files -> {args.out}/site.enc ({len(blob) / 1e6:.2f} MB, encrypted)')
    return 0
```
(The `if __name__ == '__main__': sys.exit(main())` footer stays.)

- [ ] **Step 4: Run the tests; verify they pass**

Run: `python -m pytest tests/test_site.py -q`, then `python -m pytest -q`.
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/build_site.py tests/test_site.py
git commit -m "feat(site): per-user key slots (NSD2) replace the shared passphrase

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Browser unlock (`unlock_core.js`) and phone-friendly login page

**Files:**
- Create: `scripts/unlock_core.js` (pure WebCrypto reader of NSD2; no DOM)
- Create: `tests/js/run_unlock.cjs` (Node harness)
- Create: `tests/test_unlock_js.py` (Python-to-Node cross-test; skipped without Node)
- Modify: `scripts/unlock_template.html` (rewrite; contains the placeholder `/*__UNLOCK_CORE__*/`)
- Modify: `scripts/build_site.py` (`build()` inlines the core into the page)
- Test: `tests/test_site.py` (add one test)

**Interfaces:**
- Consumes: `build_site.encrypt(files, users, iterations)`, `build_site.build(...)` from Task 1.
- Produces: `UnlockCore.unlock(bytes: Uint8Array, username: string, password: string) -> Promise<files>`; rejects with an `Error` whose `.wrong === true` and message `Wrong username or passphrase.` for unknown user / wrong passphrase, or a plain `Error` for a damaged or unrecognised bundle.

- [ ] **Step 1: Write the failing tests**

`tests/test_unlock_js.py`:
```python
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

    def run_node(self, user, pw):
        out = subprocess.run([NODE, str(ROOT / 'tests' / 'js' / 'run_unlock.cjs'), str(self.blob_path), user, pw],
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


if __name__ == '__main__':
    unittest.main()
```
Append to class `Build` in `tests/test_site.py`:
```python
    def test_unlock_page_embeds_the_reader_and_asks_for_a_username(self):
        page = (self.out / 'index.html').read_text(encoding='utf-8')
        self.assertIn('UnlockCore', page)
        self.assertNotIn('__UNLOCK_CORE__', page)
        field = page.split('name="username"')[1].split('>')[0]
        self.assertNotIn('hidden', field)                          # a real, visible field
```

- [ ] **Step 2: Run; verify failure**

Run: `python -m pytest tests/test_unlock_js.py tests/test_site.py -q`
Expected: FAIL (`run_unlock.cjs` missing; no `UnlockCore` in the page).

- [ ] **Step 3: Create `scripts/unlock_core.js` and `tests/js/run_unlock.cjs`**

`scripts/unlock_core.js`:
```js
'use strict';
// Reads the NSD2 bundle written by scripts/build_site.py (format described there).
// Pure WebCrypto: no DOM, so the same file runs in the browser and under Node tests.
(function (root) {
  const enc = new TextEncoder();
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const wrong = () => { const e = new Error('Wrong username or passphrase.'); e.wrong = true; return e; };

  async function unlock(bytes, username, password) {
    if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'NSD2') throw new Error('Unrecognised bundle format. Reload the page.');
    const hlen = new DataView(bytes.buffer, bytes.byteOffset).getUint32(4);
    if (8 + hlen + 12 > bytes.length) throw new Error('The encrypted bundle is damaged.');
    const prefix = bytes.subarray(0, 8 + hlen);
    const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + hlen)));
    const name = username.normalize('NFKC').trim().toLowerCase();
    const sid = hex(await crypto.subtle.digest('SHA-256', enc.encode(name)));
    const slot = header.slots.find(s => s.id === sid);
    if (!slot) throw wrong();
    const pw = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    const kek = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: b64(slot.salt), iterations: slot.it },
      pw, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    let dkRaw;
    try {
      dkRaw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(slot.iv), additionalData: enc.encode('NSD2-slot:' + sid) },
        kek, b64(slot.wk));
    } catch (e) { throw wrong(); }
    const dk = await crypto.subtle.importKey('raw', dkRaw, 'AES-GCM', false, ['decrypt']);
    let plain;
    try {
      plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(prefix.length, prefix.length + 12), additionalData: prefix },
        dk, bytes.subarray(prefix.length + 12));
    } catch (e) { throw new Error('The encrypted bundle was modified or is damaged.'); }
    const text = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(text);
  }

  root.UnlockCore = { unlock };
  if (typeof module !== 'undefined') module.exports = root.UnlockCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```
`tests/js/run_unlock.cjs`:
```js
const fs = require('fs');
const { unlock } = require('../../scripts/unlock_core.js');
(async () => {
  const [, , blob, user, pass] = process.argv;
  try {
    const files = await unlock(new Uint8Array(fs.readFileSync(blob)), user, pass);
    console.log(JSON.stringify({ ok: true, files }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, wrong: !!e.wrong, message: e.message }));
  }
})();
```

- [ ] **Step 4: Rewrite `scripts/unlock_template.html`**

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark light">
<title>NEPSE Dashboard · Sign in</title>
<style>
:root { --bg:#F6F7F9; --surface:#FFFFFF; --text:#161B22; --text2:#57606A; --border:#D8DEE4; --accent:#1F883D; --err:#CF222E; }
@media (prefers-color-scheme: dark) { :root { --bg:#0D1117; --surface:#161B22; --text:#E6EDF3; --text2:#8B949E; --border:#30363D; --accent:#3FB950; --err:#F85149; } }
* { box-sizing:border-box; }
body { margin:0; min-height:100vh; min-height:100dvh; display:flex; padding:16px; padding-bottom:max(16px, env(safe-area-inset-bottom));
       background:var(--bg); color:var(--text); font:16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
form { margin:auto; width:100%; max-width:380px; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:24px; }
h1 { font-size:20px; margin:0 0 4px; }
p.sub { margin:0 0 18px; color:var(--text2); font-size:14px; }
label { display:block; font-size:14px; color:var(--text2); margin:14px 0 6px; }
input { width:100%; min-height:48px; padding:10px 12px; border:1px solid var(--border); border-radius:10px; background:var(--bg); color:var(--text); font-size:16px; }
input:focus { outline:2px solid var(--accent); outline-offset:1px; }
button { width:100%; min-height:48px; margin-top:20px; padding:12px; border:0; border-radius:10px; background:var(--accent); color:#fff; font-size:16px; font-weight:600; cursor:pointer; }
button:disabled { opacity:.6; cursor:progress; }
.msg { margin:14px 0 0; font-size:14px; min-height:1.5em; }
.err { color:var(--err); }
noscript { color:var(--err); font-size:14px; }
</style></head>
<body>
<form id="f" autocomplete="on">
  <h1>NEPSE Dashboard</h1>
  <p class="sub">Sign in to decrypt and open the dashboard.</p>
  <label for="u">Username</label>
  <input id="u" name="username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus>
  <label for="p">Passphrase</label>
  <input id="p" name="password" type="password" autocomplete="current-password" required>
  <div class="msg" id="msg" role="alert" aria-live="polite"></div>
  <button id="go" type="submit">Sign in</button>
  <noscript>JavaScript is required to decrypt this page.</noscript>
</form>
<script>
/*__UNLOCK_CORE__*/
</script>
<script>
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const msg = (t, err) => { $('msg').textContent = t; $('msg').className = 'msg' + (err ? ' err' : ''); };
  const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  // Serve the dashboard's own fetch() calls (data/*.json, data/history/…) from the decrypted bundle
  function installFetch(files) {
    const base = new URL('.', location.href).pathname;
    const real = window.fetch.bind(window);
    window.fetch = function (input, init) {
      try {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if (url.origin === location.origin && url.pathname.startsWith(base)) {
          const rel = decodeURIComponent(url.pathname.slice(base.length));
          const f = files[rel];
          if (f) return Promise.resolve(new Response(f.b ? bytes(f.b) : f.s, { status: 200, headers: { 'Content-Type': f.t } }));
          if (rel.startsWith('data/')) return Promise.resolve(new Response('Not found', { status: 404 }));
        }
      } catch (e) { /* fall through to the network */ }
      return real(input, init);
    };
  }

  function render(files) {
    const blob = (name, type) => URL.createObjectURL(new Blob([files[name].s], { type }));
    const html = files['index.html'].s
      .replace('href="app.css"', 'href="' + blob('app.css', 'text/css') + '"')
      .replace('src="app-boot.js"', 'src="' + blob('app-boot.js', 'text/javascript') + '"')
      .replace('src="app.js"', 'src="' + blob('app.js', 'text/javascript') + '"');
    installFetch(files);
    document.open(); document.write(html); document.close();
  }

  $('f').addEventListener('submit', async ev => {
    ev.preventDefault();
    const user = $('u').value, pass = $('p').value;
    if (!user || !pass) return;
    $('go').disabled = true; msg('Signing in… this can take a few seconds on a phone.');
    try {
      const res = await fetch('site.enc', { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load the encrypted bundle (' + res.status + ')');
      const files = await UnlockCore.unlock(new Uint8Array(await res.arrayBuffer()), user, pass);
      $('p').value = '';
      render(files);
    } catch (e) {
      msg(e.wrong ? 'Wrong username or passphrase.' : (e.message || 'Could not sign in.'), true);
      $('go').disabled = false; $('p').select();
    }
  });
})();
</script>
</body></html>
```

- [ ] **Step 5: Inline the core in `build()`**

In `scripts/build_site.py`, replace the `index.html` write inside `build()` with:
```python
    core = (Path(__file__).with_name('unlock_core.js')).read_text(encoding='utf-8')
    assert '</script' not in core.lower()
    page = (Path(__file__).with_name('unlock_template.html')).read_text(encoding='utf-8')
    (out / 'index.html').write_text(page.replace('/*__UNLOCK_CORE__*/', core), encoding='utf-8', newline='\n')
```

- [ ] **Step 6: Run; verify pass**

Run: `python -m pytest tests/test_unlock_js.py tests/test_site.py -q`, then `python -m pytest -q`.
Expected: pass (the Node tests are skipped, not failed, if Node is absent; Node 24 is installed here so they run).

- [ ] **Step 7: Commit**

```bash
git add scripts/unlock_core.js scripts/unlock_template.html scripts/build_site.py tests/js/run_unlock.cjs tests/test_unlock_js.py tests/test_site.py
git commit -m "feat(site): username + passphrase unlock page, phone-friendly, WebCrypto reader cross-tested

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: User-secret helper, workflow, and docs

**Files:**
- Create: `scripts/manage_site_users.py`
- Create: `tests/test_site_users.py`
- Modify: `.github/workflows/nepse-daily.yml` (deploy job env + guard + validation step)
- Modify: `DEPLOYMENT.md` (step 3 intro, step 4 secrets, "What this protects" list, local test line)
- Modify: `README.md` (one sentence only if it mentions the shared passphrase; check with `grep -n -i passphrase README.md`)

**Interfaces:**
- Consumes: `build_site.parse_users`, `build_site.norm_user`, `build_site.USER_RE`.
- Produces: `generate(names: list[str]) -> str` (lines `name:passphrase`), `check(text: str) -> str`; CLI `python scripts/manage_site_users.py gen NAME [NAME…]` and `… check` (stdin; prints usernames only).

- [ ] **Step 1: Write the failing tests** — `tests/test_site_users.py`

```python
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
```

- [ ] **Step 2: Run; verify failure**

Run: `python -m pytest tests/test_site_users.py -q`
Expected: FAIL (`No module named 'manage_site_users'`).

- [ ] **Step 3: Create `scripts/manage_site_users.py`**

```python
#!/usr/bin/env python3
"""Helpers for the SITE_USERS secret (one 'username:passphrase' per line).

  python scripts/manage_site_users.py gen abin ram.k     # print new lines with random passphrases
  python scripts/manage_site_users.py check < users.txt  # validate; prints usernames only

This tool stores nothing and sends nothing. Paste the lines into GitHub:
Settings -> Secrets and variables -> Actions -> SITE_USERS. Give each person only
their own passphrase. To revoke someone, delete their line and re-run the deploy.
"""
import secrets, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_site as B


def generate(names):
    lines = []
    for n in names:
        name = B.norm_user(n)
        if not B.USER_RE.match(name):
            raise SystemExit(f'manage_site_users: bad username {n!r} (2-32 characters from a-z 0-9 . _ -)')
        lines.append(f'{name}:{secrets.token_urlsafe(18)}')       # 24 characters, ~144 bits
    return '\n'.join(lines) + '\n'


def check(text):
    users = B.parse_users(text)
    return f'OK: {len(users)} user(s): ' + ', '.join(sorted(users))


def main(argv):
    if len(argv) >= 3 and argv[1] == 'gen':
        sys.stdout.write(generate(argv[2:]))
    elif len(argv) == 2 and argv[1] == 'check':
        print(check(sys.stdin.read()))
    else:
        raise SystemExit(__doc__)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
```

- [ ] **Step 4: Edit `.github/workflows/nepse-daily.yml` (deploy job)**

- Comment above `if:`: replace "Needs the secrets SITE_PASSPHRASE and SITE_DEPLOY_TOKEN" with "Needs the secrets SITE_USERS (one username:passphrase per line) and SITE_DEPLOY_TOKEN".
- `env:` — replace `SITE_PASSPHRASE: ${{ secrets.SITE_PASSPHRASE }}` with `SITE_USERS: ${{ secrets.SITE_USERS }}`.
- Guard step — replace the first line with:
  `[ -n "$SITE_USERS" ]        || { echo "::error::Secret SITE_USERS is not set - refusing to publish"; exit 1; }`
- After the `pip install -r scripts/requirements-site.txt` step and before "Encrypt the site", add:
```yaml
      - name: Validate SITE_USERS (usernames only are printed)
        run: printf '%s\n' "$SITE_USERS" | python scripts/manage_site_users.py check
```

- [ ] **Step 5: Edit `DEPLOYMENT.md`** (use the Edit tool with these exact old strings)

- Step 3 intro: replace `(AES-256-GCM, key from your passphrase via PBKDF2-SHA256, 1,000,000\nrounds)` with `(AES-256-GCM under a random data key that is wrapped separately for each user with a key from their passphrase via PBKDF2-SHA256, 1,000,000\nrounds)`; replace `Visitors see a passphrase prompt` with `Visitors see a username and passphrase prompt`.
- Step 4 first bullet — replace the line starting ``   * Secret `SITE_PASSPHRASE` `` with:
  ``   * Secret `SITE_USERS` — one `username:passphrase` per line (usernames 2–32 characters of a–z 0–9 . _ - ; passphrases at least 16 characters). Create the lines with `python scripts/manage_site_users.py gen abin ram.k` and give each person only their own.``
- Step 4 sentence "Without both secrets it **fails**" stays true; change "both secrets" only if the wording now reads wrongly.
- "What this protects" first bullet — replace the `* **One shared passphrase**, not per-user accounts; there is no per-person revocation. To lock someone out, change `SITE_PASSPHRASE` (the next deploy re-encrypts).` bullet with:
  `* **Per-user passphrases**, but a static site cannot lock anyone out and cannot hide who has an account. To revoke someone, delete their line from `SITE_USERS` and run the workflow: the new build has no slot for them and uses a new data key. They keep anything they already downloaded or decrypted.`
- "Local test" line: replace `SITE_PASSPHRASE='…'` with `SITE_USERS='demo.user:a-long-demo-passphrase'`.
- Step 3 header sentence "(The per-user login in `scripts/secure_server.py` still protects the copy on your PC.)" stays.

- [ ] **Step 6: Run; verify pass** — `python -m pytest -q` (all pass).

- [ ] **Step 7: Commit**

```bash
git add scripts/manage_site_users.py tests/test_site_users.py .github/workflows/nepse-daily.yml DEPLOYMENT.md README.md
git commit -m "feat(site): SITE_USERS secret, helper script, workflow and docs for per-user login

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Navigation groups (data, markup, behaviour)

**Files:**
- Modify: `app.js` (add `NAV_GROUPS` + helpers after the `PAGE_MEMBERS` block ~line 63; call `updateGroupNav(page)` inside `showPage`; mirror the index price into the top bar)
- Modify: `index.html` (sidebar nav ~lines 40-66 regrouped; add `.topbar`, `.subnav`, `.tabbar` markup before `<main>`; viewport meta)
- Test: `tests/test_nav.py` (new)

**Interfaces:**
- Produces (globals in `app.js`): `NAV_GROUPS` (array of `{id, label, pages[]}`), `groupOf(page) -> group|null`, `pageLabel(page) -> string`, `navGroup(id)` (opens the last page used in that group, else its first), `updateGroupNav(page)`. Markup contract for Task 5: `<nav class="tabbar">` of `<button class="tab" data-group="…" data-on-click="navGroup('…')">`; `<div class="subnav" id="subnav">` filled at runtime with `<button class="chip" data-page="…">`; `<header class="topbar">` with `#tb-price`, `#tb-chg`.

- [ ] **Step 1: Write the failing tests** — `tests/test_nav.py`

```python
"""Navigation groups: data, sidebar markup and tab bar stay in step (static checks)."""
import json, re, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JS = (ROOT / 'app.js').read_text(encoding='utf-8')
HTML = (ROOT / 'index.html').read_text(encoding='utf-8')


def groups():
    m = re.search(r'const NAV_GROUPS = (\[.*?\n\]);', JS, re.S)
    assert m, 'NAV_GROUPS literal not found in app.js'
    return json.loads(m.group(1))            # the literal is strict JSON on purpose


def sidebar_nav():
    return HTML.split('<nav class="sidebar-nav"', 1)[1].split('</nav>', 1)[0]


class NavGroups(unittest.TestCase):
    def test_every_sidebar_page_is_in_exactly_one_group(self):
        flat = [p for g in groups() for p in g['pages']]
        self.assertEqual(len(flat), len(set(flat)), 'a page is in two groups')
        self.assertEqual(sorted(flat), sorted(re.findall(r"navTo\('([a-z-]+)'\)", sidebar_nav())))

    def test_every_group_page_exists(self):
        keys = set(re.findall(r"^\s*'([a-z-]+)':\s*\[", JS.split('const PAGE_MEMBERS', 1)[1].split('};', 1)[0], re.M))
        for g in groups():
            for p in g['pages']:
                self.assertTrue(p in keys or f'id="{p}"' in HTML, f'{p} is not a page')

    def test_group_ids_are_unique_and_labelled(self):
        ids = [g['id'] for g in groups()]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(len(ids), 5)
        for g in groups():
            self.assertTrue(g['label'] and g['pages'])

    def test_tab_bar_has_one_button_per_group(self):
        bar = HTML.split('<nav class="tabbar"', 1)[1].split('</nav>', 1)[0]
        for g in groups():
            self.assertIn(f"data-on-click=\"navGroup('{g['id']}')\"", bar)
        self.assertIn('id="subnav"', HTML)
        self.assertIn('class="topbar"', HTML)

    def test_sidebar_sections_match_group_labels(self):
        self.assertEqual(re.findall(r'nav-section-label">([^<]+)<', sidebar_nav()), [g['label'] for g in groups()])

    def test_no_inline_handlers_added(self):
        self.assertNotRegex(HTML, r'\sonclick=')

    def test_viewport_covers_the_notch(self):
        self.assertIn('viewport-fit=cover', HTML)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run; verify failure** — `python -m pytest tests/test_nav.py -q` → FAIL ("NAV_GROUPS literal not found").

- [ ] **Step 3: Add `NAV_GROUPS` and helpers to `app.js`**

Insert directly after the `PAGE_MEMBERS` block (after the `};` that ends it, before `let currentPage = null;`):

```js
// Five groups over the sixteen pages (page id = the menu's navTo target). Strict JSON on
// purpose: tests/test_nav.py parses it. Each page in exactly one group.
const NAV_GROUPS = [
  {"id": "today",  "label": "Today",  "pages": ["chart-sec", "events-sec", "summary-sec"]},
  {"id": "market", "label": "Market", "pages": ["market-summary-sec", "heatmap-sec", "price-table-sec", "rrg-sec", "money-sec", "emotion-sec"]},
  {"id": "charts", "label": "Charts", "pages": ["tvchart-sec", "structure-sec", "trade-sec"]},
  {"id": "stocks", "label": "Stocks", "pages": ["stock-analyzer-sec", "notes-sec"]},
  {"id": "more",   "label": "More",   "pages": ["macro-sec", "links-sec"]}
];
const lastPageInGroup = {};

function groupOf(page) { return NAV_GROUPS.find(g => g.pages.includes(page)) || null; }

function pageLabel(page) {
  const el = document.querySelector(`.sidebar-nav .nav-btn[data-on-click="navTo('${page}')"] .nav-label`);
  return el ? el.textContent : page;
}

function navGroup(id) {
  const g = NAV_GROUPS.find(x => x.id === id);
  if (g) navTo(lastPageInGroup[id] || g.pages[0]);
}

// Highlight the group's tab, (re)build the chip row for its pages, mark the current chip.
function updateGroupNav(page) {
  const g = groupOf(page);
  document.querySelectorAll('.tabbar .tab').forEach(b => {
    const on = !!g && b.dataset.group === g.id;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const sub = document.getElementById('subnav');
  if (!sub || !g) return;
  lastPageInGroup[g.id] = page;
  if (sub.dataset.group !== g.id) {
    sub.dataset.group = g.id;
    sub.replaceChildren(...g.pages.map(p => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.page = p;
      b.setAttribute('data-on-click', `navTo('${p}')`);
      b.textContent = pageLabel(p);
      return b;
    }));
  }
  sub.querySelectorAll('.chip').forEach(c => {
    const on = c.dataset.page === page;
    c.classList.toggle('active', on);
    if (on) { c.setAttribute('aria-current', 'page'); c.scrollIntoView({ inline: 'center', block: 'nearest' }); }
    else c.removeAttribute('aria-current');
  });
}
```
In `showPage`, add one line right after the `.nav-btn` `forEach` block that toggles `active` (before `if (push && location.hash …`):
```js
  updateGroupNav(page);
```
`initPages()` already falls back to `'chart-sec'` for an unknown hash (Today), which satisfies the "unknown hash" requirement.

Mirror the price into the top bar: run `grep -n "hdr-price" app.js`; wherever `hdr-price` / `hdr-chg` text is assigned, add next to it (same function, same values, each guarded with `if (el)`):
```js
const tbp = document.getElementById('tb-price'), tbc = document.getElementById('tb-chg');
if (tbp) tbp.textContent = <the same text assigned to hdr-price>;
if (tbc) { tbc.textContent = <the same text assigned to hdr-chg>; tbc.style.color = <the same colour assigned to hdr-chg>; }
```
(Use the same variables the existing lines use; do not recompute.)

- [ ] **Step 4: Regroup `index.html`**

Replace everything inside `<nav class="sidebar-nav" aria-label="Sections"> … </nav>` with the same buttons, reordered under the five labels (exact `data-on-click` and label text per button preserved):

```html
  <nav class="sidebar-nav" aria-label="Sections">
    <div class="nav-section-label">Today</div>
    <button class="nav-btn active" data-on-click="navTo('chart-sec')"><span class="nav-label">Close report</span></button>
    <button class="nav-btn" data-on-click="navTo('events-sec')"><span class="nav-label">Phase &amp; events</span></button>
    <button class="nav-btn" data-on-click="navTo('summary-sec')"><span class="nav-label">Analysis summary</span></button>

    <div class="nav-section-label">Market</div>
    <button class="nav-btn" data-on-click="navTo('market-summary-sec')"><span class="nav-label">Market summary</span></button>
    <button class="nav-btn" data-on-click="navTo('heatmap-sec')"><span class="nav-label">Heatmap</span></button>
    <button class="nav-btn" data-on-click="navTo('price-table-sec')"><span class="nav-label">Share prices</span></button>
    <button class="nav-btn" data-on-click="navTo('rrg-sec')"><span class="nav-label">Relative rotation (RRG)</span></button>
    <button class="nav-btn" data-on-click="navTo('money-sec')"><span class="nav-label">Risk &amp; position size</span></button>
    <button class="nav-btn" data-on-click="navTo('emotion-sec')"><span class="nav-label">Emotion cycle</span></button>

    <div class="nav-section-label">Charts</div>
    <button class="nav-btn" data-on-click="navTo('tvchart-sec')"><span class="nav-label">NEPSE chart</span></button>
    <button class="nav-btn" data-on-click="navTo('structure-sec')"><span class="nav-label">Levels &amp; structure</span></button>
    <button class="nav-btn" data-on-click="navTo('trade-sec')"><span class="nav-label">Scenarios &amp; triggers</span></button>

    <div class="nav-section-label">Stocks</div>
    <button class="nav-btn" data-on-click="navTo('stock-analyzer-sec')"><span class="nav-label">Stock analyzer</span></button>
    <button class="nav-btn" data-on-click="navTo('notes-sec')"><span class="nav-label">Study notes</span></button>

    <div class="nav-section-label">More</div>
    <button class="nav-btn" data-on-click="navTo('macro-sec')"><span class="nav-label">NRB macro</span></button>
    <button class="nav-btn" data-on-click="navTo('links-sec')"><span class="nav-label">Resources</span></button>
  </nav>
```
Immediately before `<main class="main">` (after `</aside>`), add the phone chrome:

```html
<!-- PHONE CHROME (shown below 900 px by app.css): slim top bar, sub-view chips, bottom tab bar -->
<header class="topbar">
  <span class="logo">NEPSE<span>Analytics</span></span>
  <span class="topbar-price"><b id="tb-price">—</b> <span id="tb-chg"></span></span>
</header>
<div class="subnav" id="subnav" role="navigation" aria-label="Pages in this group"></div>
<nav class="tabbar" aria-label="Sections">
  <button class="tab" data-group="today"  data-on-click="navGroup('today')">Today</button>
  <button class="tab" data-group="market" data-on-click="navGroup('market')">Market</button>
  <button class="tab" data-group="charts" data-on-click="navGroup('charts')">Charts</button>
  <button class="tab" data-group="stocks" data-on-click="navGroup('stocks')">Stocks</button>
  <button class="tab" data-group="more"   data-on-click="navGroup('more')">More</button>
</nav>
```
Line 5: change the viewport meta to `content="width=device-width, initial-scale=1.0, viewport-fit=cover"`.

- [ ] **Step 5: Run; verify pass** — `python -m pytest tests/test_nav.py -q`, then `python -m pytest -q`.

- [ ] **Step 6: Commit**

```bash
git add app.js index.html tests/test_nav.py
git commit -m "feat(nav): five navigation groups over the existing pages, tab bar and chip row markup

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Phone-first layout and styling

**Files:**
- Modify: `app.css` (append one final block "PHONE-FIRST LAYER")
- Modify: `index.html` (wrap `#pt-table`, line ~916, in a scroll container)
- Modify: `app.js` (wrap the JS-built `hm-table`, ~line 3317; `ps-table` is already inside `.ps-scroll` and `rrg-table` inside `.rrg-table-wrap`)
- Test: `tests/test_nav.py` (append CSS contract tests)

**Interfaces:**
- Consumes: Task 4 markup (`.topbar`, `.subnav`, `.chip`, `.tabbar`, `.tab`).
- Produces: below 900 px the sidebar is hidden and `.topbar` + `.subnav` + `.tabbar` are shown; at 900 px and up those three are hidden and the existing sidebar shows. Class `.table-scroll` = horizontally scrolling table wrapper with sticky first column.

- [ ] **Step 1: Append failing CSS contract tests to `tests/test_nav.py`**

```python
CSS = (ROOT / 'app.css').read_text(encoding='utf-8')
PHONE = CSS.split('PHONE-FIRST LAYER', 1)[1] if 'PHONE-FIRST LAYER' in CSS else ''


class PhoneLayer(unittest.TestCase):
    def test_layer_exists(self):
        self.assertTrue(PHONE, 'PHONE-FIRST LAYER block missing')

    def test_phone_chrome_is_styled_and_desktop_hides_it(self):
        for sel in ('.tabbar', '.subnav', '.chip', '.topbar'):
            self.assertIn(sel, PHONE)
        self.assertRegex(PHONE, r'@media \(min-width: 900px\)')
        self.assertIn('env(safe-area-inset-bottom)', PHONE)

    def test_tap_targets_and_input_size(self):
        self.assertRegex(PHONE, r'\.tab\s*\{[^}]*min-height:\s*(4[4-9]|[5-9]\d)px')
        self.assertRegex(PHONE, r'input[^{]*\{[^}]*font-size:\s*16px')

    def test_old_mobile_top_bar_is_neutralised(self):
        self.assertRegex(PHONE, r'@media \(max-width: 899px\)[^{]*\{[^@]*\.sidebar\s*\{\s*display:\s*none')

    def test_no_page_level_horizontal_scroll(self):
        self.assertRegex(PHONE, r'overflow-x:\s*(hidden|clip)')

    def test_price_table_is_scrollable(self):
        self.assertRegex(HTML, r'<div class="table-scroll">\s*<table id="pt-table"')
```

- [ ] **Step 2: Run; verify failure** — `python -m pytest tests/test_nav.py -q` → FAIL (PhoneLayer tests).

- [ ] **Step 3: Wrap the tables**

`index.html` ~line 916: put `<div class="table-scroll">` directly before `<table id="pt-table" …>` and `</div>` directly after its `</table>`.
`app.js` ~line 3317: the template `` `<table class="hm-table"> … </table>` `` becomes `` `<div class="table-scroll"><table class="hm-table"> … </table></div>` `` (open the div before `<table`, close it after the template's `</table>`, inside the same template string).

- [ ] **Step 4: Append the phone-first block to the END of `app.css`**

```css

  /* ════════════════════════════════════════════════════════════════
     PHONE-FIRST LAYER — last block of the stylesheet.
     Default rules are for a phone (360-430 px); min-width: 900px restores
     the desktop sidebar. The older desktop-first rules above are left alone;
     this layer overrides them where they disagree.
       phone:   .topbar (top) · .subnav chips · .tabbar (bottom, thumb reach)
       desktop: .sidebar (grouped) on the left
     ════════════════════════════════════════════════════════════════ */
  html { -webkit-text-size-adjust: 100%; }
  body { overflow-x: clip; }
  img, canvas, svg { max-width: 100%; }

  .topbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 210;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    min-height: 48px; padding: 6px 16px; padding-top: max(6px, env(safe-area-inset-top));
    background: var(--sidebar-bg); backdrop-filter: blur(16px); border-bottom: 1px solid var(--border);
  }
  .topbar .logo { font-family: var(--display); font-weight: 700; font-size: 15px; color: var(--text); }
  .topbar .logo span { color: var(--text3); font-weight: 400; }
  .topbar-price { font-size: 14px; color: var(--text2); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .topbar-price b { color: var(--text); font-size: 16px; }

  .subnav {
    position: fixed; top: calc(48px + env(safe-area-inset-top)); left: 0; right: 0; z-index: 205;
    display: flex; gap: 8px; padding: 8px 16px; overflow-x: auto; -webkit-overflow-scrolling: touch;
    scrollbar-width: none; background: var(--bg); border-bottom: 1px solid var(--border);
  }
  .subnav::-webkit-scrollbar { display: none; }
  .chip {
    flex: 0 0 auto; min-height: 36px; padding: 6px 14px; border-radius: 999px; white-space: nowrap;
    border: 1px solid var(--border2); background: var(--surface); color: var(--text2);
    font: 500 14px/1 var(--sans); cursor: pointer;
  }
  .chip.active { background: var(--accent-dim); border-color: var(--accent-border); color: var(--text); }

  .tabbar {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 220;
    display: grid; grid-template-columns: repeat(5, 1fr);
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--sidebar-bg); backdrop-filter: blur(16px); border-top: 1px solid var(--border);
  }
  .tab {
    min-height: 52px; padding: 8px 2px; border: 0; background: none; color: var(--text3);
    font: 600 12px/1.2 var(--sans); cursor: pointer; border-top: 3px solid transparent;
  }
  .tab.active { color: var(--text); border-top-color: var(--accent); }

  @media (max-width: 899px) {
    .sidebar { display: none; }
    body { padding-left: 0; padding-top: calc(48px + 52px + env(safe-area-inset-top)); padding-bottom: calc(60px + env(safe-area-inset-bottom)); }
    .main { padding: 14px 16px 24px; max-width: 100%; }
    .main > * { max-width: 100%; }
    .today-grid, .rrg-grid { grid-template-columns: 1fr; }
    .table-scroll, .rrg-table-wrap, .ps-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%; }
    .table-scroll table { min-width: 560px; }
    .table-scroll th:first-child, .table-scroll td:first-child { position: sticky; left: 0; background: var(--surface); z-index: 1; }
    button, .nav-btn, .ctrl-btn, .sa-tab { min-height: 44px; }
    input, select, textarea { font-size: 16px; }
    .ctrl-group, .chart-controls { flex-wrap: wrap; }
    #tv-chart { height: 300px; }
  }

  @media (min-width: 900px) {
    .topbar, .subnav, .tabbar { display: none; }
  }
```
If any table sits on a background other than `--surface`, set that table's sticky first-cell background to match after viewing it in Step 6.

- [ ] **Step 5: Run; verify pass** — `python -m pytest tests/test_nav.py -q`, then `python -m pytest -q`.

- [ ] **Step 6: Manual phone check (required: layout cannot be proven by these tests)**

Run `python scripts/secure_server.py` (or `start-live.bat`), sign in, open `http://127.0.0.1:8765/`. With the Chrome tools or DevTools device mode check **390x844**, **768x1024** and **1280x800**, in both themes:
1. At 390: top bar, chip row and bottom tab bar visible, sidebar hidden, and no horizontal scrollbar on any of the 16 pages (visit each via the chips).
2. At 1280: sidebar visible and grouped under Today / Market / Charts / Stocks / More; top bar, chips and tab bar hidden.
3. Deep link `#/rrg-sec` at 390 opens Market with the RRG chip active; `#/nonsense` opens Today.
4. Rotate 390 to 844 wide: heatmap, RRG and the TV chart redraw to the new width (no blank or clipped canvas). If one does not, call its existing `render…()` from a `resize`/`orientationchange` listener in `app.js` next to the `showPage` redraw calls.
5. The price table and heatmap table scroll sideways inside their box; the first column stays put.
Fix anything that fails before committing; list any page you could not check.

- [ ] **Step 7: Commit**

```bash
git add app.css app.js index.html tests/test_nav.py
git commit -m "feat(ui): phone-first layout with bottom tab bar, chip sub-nav, scrollable tables

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Decision-first "Today" tiles

**Files:**
- Modify: `index.html` (new `<section class="today-tiles" id="today-tiles">` after the `#data-check` block, before `#today-grid`; `initPages` assigns un-keyed blocks to the next page, so it joins the home page without further changes)
- Modify: `app.js` (add `renderTodayTiles()` above `renderCloseReport()`; call it as the last statement of `renderCloseReport()`)
- Modify: `app.css` (tile styles inside the PHONE-FIRST LAYER)
- Test: `tests/test_nav.py` (append)

**Interfaces:**
- Consumes: `LIVE_SNAPSHOT` (fields `gainers`, `losers`, `unchanged`, `turnover`, `scrips_traded`, `top_gainers[{sym,name,close,change,pct}]`, `top_losers[...]`, `top_turnover[{sym,name,turnover,ltp}]`) and the existing `esc(s)` helper (`app.js:766`).
- Produces: `renderTodayTiles()`; elements `#tt-breadth`, `#tt-gainers`, `#tt-losers`, `#tt-turnover`.

- [ ] **Step 1: Append the failing test to `tests/test_nav.py`**

```python
class TodayTiles(unittest.TestCase):
    def test_tiles_markup_and_renderer(self):
        for el in ('id="today-tiles"', 'id="tt-breadth"', 'id="tt-gainers"', 'id="tt-losers"', 'id="tt-turnover"'):
            self.assertIn(el, HTML)
        self.assertIn('function renderTodayTiles', JS)
        self.assertRegex(JS, r'function renderCloseReport\(\)\s*\{[\s\S]*?renderTodayTiles\(\);\s*\}\s*\n')

    def test_tiles_come_before_the_changes_panel(self):
        self.assertLess(HTML.index('id="today-tiles"'), HTML.index('id="today-grid"'))
```

- [ ] **Step 2: Run; verify failure** — `python -m pytest tests/test_nav.py -q` → FAIL.

- [ ] **Step 3: Markup** — in `index.html`, after the `#data-check` block and before the `<!-- WHAT CHANGED + PLAN STATUS -->` comment:

```html
  <!-- DECISION TILES: breadth + movers, straight from today's close -->
  <section class="today-tiles" id="today-tiles" aria-label="Today at a glance">
    <div class="tt-card tt-wide">
      <h2>Breadth</h2>
      <div id="tt-breadth"><div class="row">Waiting for the first daily update.</div></div>
    </div>
    <div class="tt-card"><h2>Top gainers</h2><div id="tt-gainers"></div></div>
    <div class="tt-card"><h2>Top losers</h2><div id="tt-losers"></div></div>
    <div class="tt-card"><h2>Most turnover</h2><div id="tt-turnover"></div></div>
  </section>
```

- [ ] **Step 4: Renderer** — in `app.js`, directly above `function renderCloseReport()`:

```js
// Today at a glance: breadth bar and three top-5 lists from today's snapshot.
// Each tile is built on its own so one missing field never blanks the others.
function renderTodayTiles() {
  const s = LIVE_SNAPSHOT || {};
  const $ = id => document.getElementById(id);
  const num = (v, d = 2) => typeof v === 'number' ? v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const none = '<div class="row">No data</div>';
  const tile = (id, build) => {
    const el = $(id); if (!el) return;
    try { el.innerHTML = build() || none; } catch (e) { console.error('[today]', id, e); el.innerHTML = none; }
  };
  tile('tt-breadth', () => {
    const { gainers: g, losers: l, unchanged: u } = s;
    if (![g, l, u].every(v => typeof v === 'number')) return '';
    const t = (g + l + u) || 1;
    return `<div class="breadth" role="img" aria-label="${g} up, ${l} down, ${u} unchanged">
        <span class="b-up" style="width:${(g / t * 100).toFixed(1)}%"></span>
        <span class="b-flat" style="width:${(u / t * 100).toFixed(1)}%"></span>
        <span class="b-down" style="width:${(l / t * 100).toFixed(1)}%"></span></div>
      <div class="row"><span class="up">${g} up</span><span class="flat">${u} unchanged</span><span class="down">${l} down</span></div>` +
      (typeof s.turnover === 'number' ? `<div class="row"><span class="k">Turnover</span><span>Rs ${(s.turnover / 1e9).toFixed(2)} bil${typeof s.scrips_traded === 'number' ? ` · ${s.scrips_traded} scrips` : ''}</span></div>` : '');
  });
  const movers = (list, cls) => (list || []).slice(0, 5).map(m =>
    `<div class="row"><span class="k">${esc(m.sym)}</span><span class="${cls}">${num(m.close)} (${m.pct > 0 ? '+' : m.pct < 0 ? '−' : ''}${num(Math.abs(m.pct))}%)</span></div>`).join('');
  tile('tt-gainers', () => movers(s.top_gainers, 'up'));
  tile('tt-losers', () => movers(s.top_losers, 'down'));
  tile('tt-turnover', () => (s.top_turnover || []).slice(0, 5).map(m =>
    `<div class="row"><span class="k">${esc(m.sym)}</span><span>Rs ${(m.turnover / 1e6).toFixed(0)} mil</span></div>`).join(''));
}
```
Then make `renderTodayTiles();` the last statement of `renderCloseReport()` (after the "Plan status" block, just before its closing `}`).

- [ ] **Step 5: Styles** — append inside the PHONE-FIRST LAYER block, before the final `@media (min-width: 900px)`:

```css
  .today-tiles { display: grid; grid-template-columns: 1fr; gap: 12px; margin: 12px 0; }
  .tt-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
  .tt-card h2 { margin: 0 0 8px; font: 600 13px/1.2 var(--display); color: var(--text2); text-transform: uppercase; letter-spacing: .04em; }
  .tt-card .row { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: 14px; font-variant-numeric: tabular-nums; border-top: 1px solid var(--border); }
  .tt-card .row:first-child { border-top: 0; }
  .tt-card .k { color: var(--text2); }
  .tt-card .up { color: var(--green); } .tt-card .down { color: var(--red); } .tt-card .flat { color: var(--text3); }
  .breadth { display: flex; height: 10px; border-radius: 6px; overflow: hidden; background: var(--bg3); margin-bottom: 8px; }
  .breadth .b-up { background: var(--green); } .breadth .b-down { background: var(--red); } .breadth .b-flat { background: var(--text3); }
```
and inside the existing `@media (min-width: 900px)` block add:
```css
    .today-tiles { grid-template-columns: repeat(3, 1fr); }
    .tt-wide { grid-column: 1 / -1; }
```
The inline `style="width:…%"` on the breadth bar is a style attribute, which the current CSP allows (`style-src 'unsafe-inline'`); do not add inline scripts.

- [ ] **Step 6: Run; verify pass, then check visually** — `python -m pytest -q`. Open the dashboard at 390 px and 1280 px: tiles show real values, the breadth bar widths add to 100%, and setting `LIVE_SNAPSHOT.top_losers = []` then calling `renderTodayTiles()` in the console shows "No data" in that card only.

- [ ] **Step 7: Commit**

```bash
git add index.html app.js app.css tests/test_nav.py
git commit -m "feat(today): breadth and movers tiles on the home page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: End-to-end verification through the encrypted build

**Files:**
- Modify: `docs/superpowers/specs/2026-10-03-dashboard-redesign-design.md` (record the five deviations from this plan's header)
- No product-code changes unless a check fails.

- [ ] **Step 1: Full test suite.** `python -m pytest -q` — expect all pass, none newly skipped (Node 24 is present, so the Node cross-tests run).

- [ ] **Step 2: Build and serve the encrypted site locally**

```bash
SITE_USERS='demo.user:a-long-demo-passphrase-123' python scripts/build_site.py --out _site
cd _site && python -m http.server 8890
```
Expect `build_site: N files -> _site/site.enc (… MB, encrypted)`. Confirm no plaintext: `grep -c "NEPSE Wyckoff" _site/site.enc` prints `0`.

- [ ] **Step 3: Browser check of the published copy** at `http://127.0.0.1:8890/` (390x844, then 1280x800):
1. Wrong passphrase, unknown username, and the right passphrase on a wrong username each show exactly "Wrong username or passphrase."
2. `Demo.User` (capital D) with the right passphrase opens the dashboard.
3. After sign-in, the tab bar or sidebar, chips, Today tiles, charts and `fetch`ed data (price table, heatmap, RRG) all work, with no console errors (`read_console_messages`).
4. Reload: the sign-in page returns (nothing persisted); `site.enc` is the only data file requested.
Then delete `_site/` and confirm `git status` shows nothing from it (it is git-ignored; check `.gitignore`).

- [ ] **Step 4: Local server still works.** `python -m pytest tests/test_server.py -q` (login server unchanged) and open the page served by `scripts/secure_server.py` once at 390 px to confirm the same phone layout there.

- [ ] **Step 5: Update the spec and commit**

Append the five deviations (copied from this plan's "Deviations" section) under a `## Deviations found during planning` heading in the spec, then:
```bash
git add docs/superpowers/specs/2026-10-03-dashboard-redesign-design.md
git commit -m "docs: record plan-time deviations in the redesign spec

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand back for the user's manual setup** (code cannot do this): create the `SITE_USERS` secret with `python scripts/manage_site_users.py gen <names>`, delete the old `SITE_PASSPHRASE` secret, run the workflow, give each person only their own passphrase, and keep the source repository private (DEPLOYMENT.md steps 1-4).
