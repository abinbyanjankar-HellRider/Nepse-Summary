#!/usr/bin/env python3
"""
Build the login-protected copy of the dashboard for publishing.

  SITE_PASSPHRASE='…' python scripts/build_site.py [--out _site]

GitHub Pages cannot check passwords, so the published site is encrypted instead:

  _site/index.html   the unlock page (scripts/unlock_template.html) — no data in it
  _site/site.enc     index.html + app.css/app.js/app-boot.js + data/ as one
                     gzip'd JSON bundle, encrypted with AES-256-GCM under a key
                     derived from the passphrase (PBKDF2-SHA256, 1,000,000 rounds)
  _site/.nojekyll, robots.txt

The unlock page asks for the passphrase, decrypts in the browser, and renders the
dashboard from memory. Nothing readable is ever served.

Limits (read DEPLOYMENT.md): one shared passphrase, not per-user accounts; anyone
can download site.enc and try guesses offline, so the passphrase must be long
(the build refuses fewer than 16 characters); and this only protects the
published copy — the source repository must be private, or its plain files
give the same data away.

File format of site.enc (all integers big-endian):
  'NSD1' | iterations u32 | salt 16 | iv 12 | AES-GCM ciphertext+tag
  additional authenticated data = the first 24 bytes (magic, iterations, salt)
"""
import argparse, base64, gzip, hashlib, json, os, secrets, struct, sys, unicodedata
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = Path(__file__).resolve().parents[1]
MAGIC = b'NSD1'
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


def encrypt(files, passphrase, iterations=ITERATIONS):
    if len(passphrase) < MIN_PASSPHRASE:
        raise SystemExit(f'build_site: passphrase must be at least {MIN_PASSPHRASE} characters')
    salt, iv = secrets.token_bytes(16), secrets.token_bytes(12)
    header = MAGIC + struct.pack('>I', iterations) + salt
    plain = gzip.compress(json.dumps(files, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), 9, mtime=0)
    ct = AESGCM(derive_key(passphrase, salt, iterations)).encrypt(iv, plain, header)
    return header + iv + ct


def decrypt(blob, passphrase):
    """Inverse of encrypt (used by the tests). Raises ValueError on a wrong passphrase."""
    if blob[:4] != MAGIC:
        raise ValueError('not a site bundle')
    iterations = struct.unpack('>I', blob[4:8])[0]
    salt, iv, header = blob[8:24], blob[24:36], blob[:24]
    try:
        plain = AESGCM(derive_key(passphrase, salt, iterations)).decrypt(iv, blob[36:], header)
    except InvalidTag:
        raise ValueError('wrong passphrase or corrupted bundle') from None
    return json.loads(gzip.decompress(plain).decode('utf-8'))


def build(out, passphrase, iterations=ITERATIONS, root=ROOT):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    files = collect(root)
    blob = encrypt(files, passphrase, iterations)
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
    passphrase = os.environ.get('SITE_PASSPHRASE', '')
    if not passphrase:
        raise SystemExit('build_site: SITE_PASSPHRASE is not set — refusing to publish an unprotected site')
    files, blob = build(args.out, passphrase)
    print(f'build_site: {len(files)} files → {args.out}/site.enc ({len(blob) / 1e6:.2f} MB, encrypted)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
