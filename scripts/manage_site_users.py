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
