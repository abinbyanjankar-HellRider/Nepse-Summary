#!/usr/bin/env python3
"""
Embed docs/study-notes.md into index.html (the 📚 Study Notes page), so the
notes work when the dashboard is opened as a local file too.

  python scripts/build_notes.py      # after editing docs/study-notes.md
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / 'index.html'
MD   = ROOT / 'docs' / 'study-notes.md'


def main():
    md = MD.read_text(encoding='utf-8').replace('</', '<\\/')      # cannot close the <script> early
    html = HTML.read_text(encoding='utf-8')
    pat = re.compile(r'(<script id="study-notes-md" type="text/markdown">)(.*?)(</script>)', re.S)
    if not pat.search(html):
        sys.exit('index.html has no <script id="study-notes-md"> block')
    HTML.write_text(pat.sub(lambda m: m.group(1) + '\n' + md + '\n' + m.group(3), html, count=1),
                    encoding='utf-8', newline='\n')
    print(f'study notes embedded ({len(md) // 1024} KB)')


if __name__ == '__main__':
    main()
