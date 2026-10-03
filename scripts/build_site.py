#!/usr/bin/env python3
"""
Build the login-protected copy of the dashboard for publishing.

  SITE_USERS='name:passphrase' python scripts/build_site.py [--out _site]

GitHub Pages cannot check passwords, so the published site is encrypted instead:

  _site/index.html   the unlock page (scripts/unlock_template.html) — no data in it
  _site/site.enc     index.html + app.css/app.js/app-boot.js + data/ as one
                     gzip'd JSON bundle, encrypted with AES-256-GCM under a data key
                     wrapped per user (PBKDF2-SHA256, 1,000,000 rounds)
  _site/.nojekyll, robots.txt

The unlock page asks for the passphrase, decrypts in the browser, and renders the
dashboard from memory. Nothing readable is ever served.

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
"""
import argparse, base64, gzip, hashlib, json, os, re, secrets, struct, sys, unicodedata
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = Path(__file__).resolve().parents[1]
MAGIC = b'NSD2'
SLOT_AAD = b'NSD2-slot:'
USER_RE = re.compile(r'^[a-z0-9._-]{2,32}$')
BAD = 'wrong username or passphrase, or corrupted bundle'
b64 = lambda b: base64.b64encode(b).decode('ascii')
ITERATIONS = 1_000_000
MIN_PASSPHRASE = 16
PAGE_FILES = ['index.html', 'app.css', 'app.js', 'app-boot.js']
# provisional intraday files (git-ignored) and scratch files never ship
SKIP_DATA = {'live.json', 'live_views.json', '.gitkeep'}
TYPES = {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
         '.csv': 'text/csv', '.md': 'text/markdown', '.txt': 'text/plain'}


def norm(passphrase):
    return unicodedata.normalize('NFKC', passphrase).encode('utf-8')


def derive_key(passphrase, salt, iterations):
    return hashlib.pbkdf2_hmac('sha256', norm(passphrase), salt, iterations, dklen=32)


def collect(root):
    """{published path: {'t': content type, 's': text} or {'t': …, 'b': base64}}"""
    missing = [n for n in PAGE_FILES if not (root / n).is_file()]
    if missing:
        raise SystemExit(f'build_site: missing page files: {missing}')
    paths = [root / n for n in PAGE_FILES]
    data = root / 'data'
    paths += sorted(p for p in data.rglob('*')
                    if p.is_file() and p.name not in SKIP_DATA and not p.name.endswith('.tmp'))
    files = {}
    for p in paths:
        rel = p.relative_to(root).as_posix()
        raw = p.read_bytes()
        t = TYPES.get(p.suffix.lower(), 'application/octet-stream')
        try:
            files[rel] = {'t': t, 's': raw.decode('utf-8')}
        except UnicodeDecodeError:
            files[rel] = {'t': t, 'b': base64.b64encode(raw).decode('ascii')}
    return files


MAGIC = b'NSD2'
SLOT_AAD = b'NSD2-slot:'
USER_RE = re.compile(r'^[a-z0-9._-]{2,32}$')
BAD = 'wrong username or passphrase, or corrupted bundle'
b64 = lambda b: base64.b64encode(b).decode('ascii')


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


if __name__ == '__main__':
    sys.exit(main())
