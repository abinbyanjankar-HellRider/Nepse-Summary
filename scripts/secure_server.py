#!/usr/bin/env python3
"""
Project security: user login for the local dashboard server.

Every page and data file is served only to a signed-in user. Used by
scripts/live_intraday.py (start-live.bat); can also run on its own:

  python scripts/secure_server.py add <user>       # create a user (asks for the password)
  python scripts/secure_server.py passwd <user>    # change a password
  python scripts/secure_server.py remove <user>
  python scripts/secure_server.py list
  python scripts/secure_server.py serve [--port 8765] [--host 127.0.0.1]

Security model
  • Passwords: salted PBKDF2-SHA256 (600,000 iterations), stored only as hashes
    in .auth/users.json — git-ignored, never published (the repository is public).
  • Sessions: random 256-bit token in an HttpOnly, SameSite=Strict cookie,
    12-hour lifetime, kept in server memory (a restart signs everyone out).
  • Brute force: 5 failed sign-ins from one address → locked out for 5 minutes.
  • Audit: sign-ins, failures and lockouts are appended to logs/auth.log.
  • Served: only index.html and files under data/ (checked on the decoded
    path). Never: hidden paths (.git, .auth, …), scripts/, logs/, listings.
  • The server refuses to start while no user exists (fails closed).
  • Plain HTTP: keep the default host 127.0.0.1 (this PC only). --host 0.0.0.0
    shares it on your network, but passwords then cross the network unencrypted.

This protects the copy served from this PC only. The public GitHub repository
and any GitHub Pages site are not covered by this login.
"""
import argparse, base64, datetime as dt, functools, getpass, hashlib, hmac, html, json, os, re
import secrets, sys, threading, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit, quote, unquote

ROOT       = Path(__file__).resolve().parents[1]
AUTH_DIR   = ROOT / '.auth'
USERS_FILE = AUTH_DIR / 'users.json'
AUTH_LOG   = ROOT / 'logs' / 'auth.log'

ITERATIONS    = 600_000
SESSION_HOURS = 12
MAX_FAILS     = 5
LOCKOUT_SECS  = 300
COOKIE        = 'nepse_session'
USER_RE       = re.compile(r'^[A-Za-z0-9_.-]{3,32}$')
MIN_PASSWORD  = 10


# ── Password hashing ────────────────────────────────────────────────────
def hash_password(password, salt=None, iterations=ITERATIONS):
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, iterations)
    b64 = lambda b: base64.b64encode(b).decode('ascii')
    return f'pbkdf2_sha256${iterations}${b64(salt)}${b64(dk)}'


def verify_password(password, stored):
    try:
        algo, it, salt, dk = stored.split('$')
        if algo != 'pbkdf2_sha256':
            return False
        test = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), base64.b64decode(salt), int(it))
        return hmac.compare_digest(test, base64.b64decode(dk))
    except (ValueError, TypeError):
        return False


# A fixed hash to check against when the user does not exist, so a wrong
# username takes as long as a wrong password (no user enumeration by timing).
_DUMMY_HASH = hash_password('not-a-real-password', salt=b'\0' * 16)


# ── User store ──────────────────────────────────────────────────────────
def load_users():
    if not USERS_FILE.exists():
        return {}
    return json.loads(USERS_FILE.read_text(encoding='utf-8')).get('users', {})


def save_users(users):
    AUTH_DIR.mkdir(exist_ok=True)
    tmp = USERS_FILE.with_suffix('.tmp')
    tmp.write_text(json.dumps({'users': users}, indent=2), encoding='utf-8')
    os.replace(tmp, USERS_FILE)
    try:
        os.chmod(USERS_FILE, 0o600)
    except OSError:
        pass


def audit(event, user='', ip=''):
    AUTH_LOG.parent.mkdir(exist_ok=True)
    ts = dt.datetime.now().astimezone().isoformat(timespec='seconds')
    with AUTH_LOG.open('a', encoding='utf-8') as f:
        f.write(f'{ts}\t{event}\t{user}\t{ip}\n')


def ask_password(user):
    while True:
        p1 = getpass.getpass(f'New password for {user} (min {MIN_PASSWORD} characters): ')
        if len(p1) < MIN_PASSWORD:
            print(f'Too short — use at least {MIN_PASSWORD} characters.')
            continue
        if getpass.getpass('Repeat password: ') != p1:
            print('The passwords do not match.')
            continue
        return p1


# ── Sessions and lockouts (in memory) ───────────────────────────────────
class Guard:
    def __init__(self):
        self.lock = threading.Lock()
        self.sessions = {}      # token → (user, password hash at sign-in, expires_epoch)
        self.fails = {}         # ip → (count, first_fail_epoch, locked_until_epoch)

    def new_session(self, user, pw_hash):
        token = secrets.token_urlsafe(32)
        with self.lock:
            self.sessions[token] = (user, pw_hash, time.time() + SESSION_HOURS * 3600)
        return token

    def user_for(self, token):
        if not token:
            return None
        with self.lock:
            s = self.sessions.get(token)
            if not s:
                return None
            # expired, user removed, or password changed since sign-in → session ends
            rec = load_users().get(s[0])
            if s[2] < time.time() or not rec or rec.get('hash') != s[1]:
                del self.sessions[token]
                return None
            return s[0]

    def end_session(self, token):
        with self.lock:
            self.sessions.pop(token, None)

    def locked(self, ip):
        with self.lock:
            f = self.fails.get(ip)
            return bool(f and f[2] > time.time())

    def failed(self, ip):
        with self.lock:
            n, first, until = self.fails.get(ip, (0, time.time(), 0))
            if time.time() - first > LOCKOUT_SECS:
                n, first = 0, time.time()
            n += 1
            until = time.time() + LOCKOUT_SECS if n >= MAX_FAILS else 0
            self.fails[ip] = (n, first, until)
            return until > 0

    def succeeded(self, ip):
        with self.lock:
            self.fails.pop(ip, None)


GUARD = Guard()


# ── Login page ──────────────────────────────────────────────────────────
LOGIN_HTML = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NEPSE Dashboard · Sign in</title>
<style>
:root { --bg:#F6F7F9; --surface:#FFFFFF; --text:#161B22; --text2:#57606A; --border:#D8DEE4; --accent:#1F883D; --err:#CF222E; }
@media (prefers-color-scheme: dark) { :root { --bg:#0D1117; --surface:#161B22; --text:#E6EDF3; --text2:#8B949E; --border:#30363D; --accent:#3FB950; --err:#F85149; } }
* { box-sizing:border-box; }
body { margin:0; min-height:100vh; display:flex; padding:16px; background:var(--bg); color:var(--text);
       font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
form { margin:auto; width:100%; max-width:360px; background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:28px; }
h1 { font-size:18px; margin:0 0 4px; }
p.sub { margin:0 0 20px; color:var(--text2); font-size:13px; }
label { display:block; font-size:13px; color:var(--text2); margin:14px 0 6px; }
input { width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:8px; background:var(--bg); color:var(--text); font-size:15px; }
input:focus { outline:2px solid var(--accent); outline-offset:1px; }
button { width:100%; margin-top:22px; padding:11px; border:0; border-radius:8px; background:var(--accent); color:#fff; font-size:15px; font-weight:600; cursor:pointer; }
.err { margin:14px 0 0; color:var(--err); font-size:13px; }
</style></head>
<body>
<form method="post" action="/login" autocomplete="on">
  <h1>NEPSE Dashboard</h1>
  <p class="sub">Sign in to view the project.</p>
  <input type="hidden" name="next" value="{next}">
  <label for="u">Username</label>
  <input id="u" name="username" autocomplete="username" required autofocus>
  <label for="p">Password</label>
  <input id="p" name="password" type="password" autocomplete="current-password" required>
  {error}
  <button type="submit">Sign in</button>
</form>
</body></html>'''


def safe_next(target):
    """Only redirect back to a path on this server (no open redirect)."""
    if not target or not target.startswith('/') or target.startswith('//') or '\\' in target:
        return '/'
    return target


def servable(raw_path):
    """Allowlist of what the page needs: index.html and files under data/.
    Checked on the *decoded* path — the file lookup decodes %2E to '.', so a
    check on the raw path let /%2Eauth/users.json and /%2Egit/config through."""
    path = unquote(raw_path)
    if '\\' in path or '\0' in path:
        return False
    segs = [s for s in path.split('/') if s]
    if any(s.startswith('.') for s in segs):     # also rules out '..'
        return False
    return not segs or segs == ['index.html'] or (segs[0] == 'data' and len(segs) > 1)


# ── HTTP handler ────────────────────────────────────────────────────────
class SecureHandler(SimpleHTTPRequestHandler):
    server_version = 'NEPSE'
    sys_version = ''

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'no-referrer')
        super().end_headers()

    # helpers
    def client_ip(self):
        return self.client_address[0]

    def token(self):
        for part in (self.headers.get('Cookie') or '').split(';'):
            k, _, v = part.strip().partition('=')
            if k == COOKIE:
                return v
        return None

    def send_page(self, code, body, extra_headers=()):
        data = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        for k, v in extra_headers:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def redirect(self, where, extra_headers=()):
        self.send_response(303)
        self.send_header('Location', where)
        self.send_header('Content-Length', '0')
        for k, v in extra_headers:
            self.send_header(k, v)
        self.end_headers()

    def login_page(self, nxt='/', error='', code=200):
        err = f'<p class="err" role="alert">{html.escape(error)}</p>' if error else ''
        self.send_page(code, LOGIN_HTML.replace('{next}', html.escape(safe_next(nxt), quote=True)).replace('{error}', err))

    # routing
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/login':
            nxt = parse_qs(urlsplit(self.path).query).get('next', ['/'])[0]
            if GUARD.user_for(self.token()):
                return self.redirect(safe_next(nxt))
            return self.login_page(nxt)
        if path == '/logout':
            tok = self.token()
            user = GUARD.user_for(tok)
            GUARD.end_session(tok)
            if user:
                audit('logout', user, self.client_ip())
            return self.redirect('/login', [('Set-Cookie', f'{COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict')])
        user = GUARD.user_for(self.token())
        if not user:
            if path in ('/', '') or path.endswith('.html'):
                return self.redirect('/login?next=' + quote(self.path, safe='/'))
            self.send_error(401, 'Sign in required')
            return
        if path == '/whoami':
            body = json.dumps({'user': user}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if not servable(path):
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not GUARD.user_for(self.token()):
            self.send_error(401)
            return
        if not servable(urlsplit(self.path).path):
            self.send_error(404)
            return
        super().do_HEAD()

    def do_POST(self):
        if urlsplit(self.path).path != '/login':
            self.send_error(405)
            return
        ip = self.client_ip()
        # a negative length made rfile.read(-1) wait for EOF, pinning the thread
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = -1
        if not 0 <= length <= 4096:
            self.send_error(400)
            return
        form = parse_qs(self.rfile.read(length).decode('utf-8', 'replace'))
        user = (form.get('username') or [''])[0].strip()
        pw = (form.get('password') or [''])[0]
        nxt = (form.get('next') or ['/'])[0]
        if GUARD.locked(ip):
            audit('login-blocked', user, ip)
            return self.login_page(nxt, f'Too many failed attempts. Try again in {LOCKOUT_SECS // 60} minutes.', 429)
        users = load_users()
        rec = users.get(user)
        ok = verify_password(pw, rec['hash'] if rec else _DUMMY_HASH) and rec is not None
        if not ok:
            locked = GUARD.failed(ip)
            audit('login-failed' + (' (locked out)' if locked else ''), user, ip)
            return self.login_page(nxt, 'Wrong username or password.', 401)
        GUARD.succeeded(ip)
        token = GUARD.new_session(user, rec['hash'])
        audit('login', user, ip)
        cookie = f'{COOKIE}={token}; Path=/; Max-Age={SESSION_HOURS * 3600}; HttpOnly; SameSite=Strict'
        self.redirect(safe_next(nxt), [('Set-Cookie', cookie)])

    def list_directory(self, path):
        self.send_error(404)
        return None


def serve(port=8765, host='127.0.0.1', block=False):
    """Start the login-protected dashboard server. Returns the server (running in
    a thread) or raises SystemExit if it cannot start safely."""
    if not load_users():
        raise SystemExit('No dashboard users yet. Create one first:\n'
                         '  python scripts/secure_server.py add <username>')
    try:
        srv = ThreadingHTTPServer((host, port), functools.partial(SecureHandler, directory=str(ROOT)))
    except OSError:
        raise SystemExit(f'Port {port} is already in use. Close whatever is using it '
                         f'(e.g. an old "python -m http.server") so that only the '
                         f'login-protected server serves the dashboard.')
    shown = '127.0.0.1' if host in ('127.0.0.1', 'localhost') else host
    print(f'[secure_server] dashboard (sign-in required): http://{shown}:{port}/', flush=True)
    if host not in ('127.0.0.1', 'localhost', '::1'):
        print('[secure_server] WARNING: shared on the network over plain HTTP — '
              'passwords are not encrypted in transit.', flush=True)
    if block:
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass
        srv.server_close()
        return srv
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main():
    ap = argparse.ArgumentParser(description='Dashboard users and login-protected server')
    sub = ap.add_subparsers(dest='cmd', required=True)
    for c in ('add', 'passwd', 'remove'):
        sub.add_parser(c).add_argument('user')
    sub.add_parser('list')
    s = sub.add_parser('serve')
    s.add_argument('--port', type=int, default=8765)
    s.add_argument('--host', default='127.0.0.1')
    a = ap.parse_args()

    users = load_users()
    if a.cmd == 'list':
        if not users:
            print('No users.')
        for u, r in sorted(users.items()):
            print(f"{u}\tcreated {r.get('created', '?')}")
        return 0
    if a.cmd == 'serve':
        serve(a.port, a.host, block=True)
        return 0
    if not USER_RE.match(a.user):
        raise SystemExit('Username: 3–32 characters, letters, digits, . _ - only.')
    if a.cmd == 'add':
        if a.user in users:
            raise SystemExit(f'{a.user} already exists (use passwd to change the password).')
        users[a.user] = {'hash': hash_password(ask_password(a.user)),
                         'created': dt.date.today().isoformat()}
        save_users(users)
        audit('user-added', a.user)
        print(f'User {a.user} created.')
    elif a.cmd == 'passwd':
        if a.user not in users:
            raise SystemExit(f'No user {a.user}.')
        users[a.user]['hash'] = hash_password(ask_password(a.user))
        save_users(users)
        audit('password-changed', a.user)
        print(f'Password changed for {a.user}. Their open sessions end immediately.')
    elif a.cmd == 'remove':
        if users.pop(a.user, None) is None:
            raise SystemExit(f'No user {a.user}.')
        save_users(users)
        audit('user-removed', a.user)
        print(f'User {a.user} removed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
