"""Navigation groups: data, sidebar markup and tab bar stay in step (static checks)."""
import json, re, unittest
from html.parser import HTMLParser
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

    def test_sidebar_page_order_per_section(self):
        parts = re.split(r'<div class="nav-section-label"[^>]*>([^<]+)</div>', sidebar_nav())
        found = {parts[i].strip(): re.findall(r"navTo\('([a-z-]+)'\)", parts[i + 1]) for i in range(1, len(parts), 2)}
        self.assertEqual(len(found), 5)
        for g in groups():
            self.assertEqual(found[g['label']], g['pages'], g['id'])


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
        self.assertRegex(PHONE, r'input[^{]*\{[^}]*font-size:\s*16px\s*!important')
        # must beat the older [style*="font-size:11px"] !important rule
        self.assertRegex(PHONE, r'input\[style\][^{]*\{[^}]*font-size:\s*16px\s*!important')

    def test_sticky_first_column_is_opaque(self):
        self.assertRegex(PHONE, r'\.table-scroll td:first-child[^{]*\{[^}]*background(-color)?:[^;}]*!important')

    def test_old_mobile_top_bar_is_neutralised(self):
        self.assertRegex(PHONE, r'@media \(max-width: 899px\)[^{]*\{[^@]*\.sidebar\s*\{\s*display:\s*none')

    def test_no_page_level_horizontal_scroll(self):
        self.assertRegex(PHONE, r'body\s*\{[^}]*overflow-x:\s*(hidden|clip)')

    def test_price_table_is_scrollable(self):
        self.assertRegex(HTML, r'<div class="table-scroll">\s*<table id="pt-table"')

    def test_old_top_bar_block_stops_at_899(self):
        i = CSS.index('.sidebar-logo .live-badge { display: none; }')
        self.assertRegex(CSS[:i][CSS[:i].rindex('@media'):], r'@media \(max-width: 899px\)')


class TodayTiles(unittest.TestCase):
    def test_tiles_markup_and_renderer(self):
        for el in ('id="today-tiles"', 'id="tt-breadth"', 'id="tt-gainers"', 'id="tt-losers"', 'id="tt-turnover"'):
            self.assertIn(el, HTML)
        self.assertIn('function renderTodayTiles', JS)
        self.assertRegex(JS, r'function renderCloseReport\(\)\s*\{[\s\S]*?renderTodayTiles\(\);\s*\}\s*\n')

    def test_tiles_come_before_the_changes_panel(self):
        self.assertLess(HTML.index('id="today-tiles"'), HTML.index('id="today-grid"'))


VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}


class _MainKids(HTMLParser):
    """Collects (id, classes) of the top-level children of <main class="main">."""
    def __init__(self):
        super().__init__()
        self.depth = None          # None = before <main>; 0 = directly inside it
        self.kids = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if self.depth is None:
            if tag == 'main' and 'main' in (a.get('class') or '').split():
                self.depth = 0
            return
        if self.depth == 0:
            self.kids.append((a.get('id'), (a.get('class') or '').split()))
        if tag not in VOID:
            self.depth += 1

    def handle_endtag(self, tag):
        if self.depth is None or tag in VOID:
            return
        self.depth -= 1
        if self.depth < 0:
            self.depth = None      # left <main>


def simulate_init_pages():
    """Mirror initPages/pageOf in app.js over the real index.html: returns [(id, classes, page)]."""
    members = {}
    block = JS.split('const PAGE_MEMBERS = {', 1)[1].split('};', 1)[0]
    for page, keys in re.findall(r"'([a-z-]+)':\s*\[([^\]]*)\]", block):
        members[page] = re.findall(r"'([^']+)'", keys)
    p = _MainKids()
    p.feed(HTML)
    out, nxt = [], None
    for ident, classes in reversed(p.kids):                     # walk backwards: unassigned blocks join the next page
        if 'disclaimer' in classes:
            out.append((ident, classes, '*'))
            continue
        pg = next((pg for pg, keys in members.items() if ident in keys or any(c in keys for c in classes)), None) \
            or ident or None
        pg = pg or nxt
        if pg:
            nxt = pg
        out.append((ident, classes, pg))
    return list(reversed(out))


class PageAssignment(unittest.TestCase):
    def test_every_block_lands_on_a_real_page(self):
        valid = {p for g in groups() for p in g['pages']} | {'*'}
        res = simulate_init_pages()
        self.assertTrue(res, 'no <main class="main"> children found')
        for ident, classes, pg in res:
            self.assertIn(pg, valid, f'block id={ident!r} class={classes} would become its own page {pg!r}')

    def test_today_blocks_all_land_on_the_today_page(self):
        pages = {ident: pg for ident, _, pg in simulate_init_pages() if ident}
        for ident in ('today-tiles', 'today-grid', 'data-check', 'close-report'):
            self.assertEqual(pages.get(ident), 'chart-sec', ident)


if __name__ == '__main__':
    unittest.main()
