  // ════════════════════════════════════════════════════════════════
  // APPEARANCE — the one place to change the look.
  //   fonts:   add a preset = one entry (Google Fonts URL + the two families)
  //   accents: UI + level colour per theme (never green/red: those mean up/down)
  //   Colours, spacing and components use the CSS tokens in "DESIGN SYSTEM v2".
  // Saved per browser (localStorage 'nepse_appearance'); applied before first paint.
  // ════════════════════════════════════════════════════════════════
  const APPEARANCE = {
    defaults: { theme: 'dark', font: 'signal', accent: 'indigo' },
    fonts: {
      signal:    { label: 'Signal',    note: 'Bricolage Grotesque + Plex Sans',
                   display: "'Bricolage Grotesque', 'IBM Plex Sans', sans-serif", text: "'IBM Plex Sans', system-ui, sans-serif",
                   href: 'family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700;12..96,800&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400' },
      classic:   { label: 'Classic',   note: 'IBM Plex Sans Condensed + Plex Sans',
                   display: "'IBM Plex Sans Condensed', 'IBM Plex Sans', sans-serif", text: "'IBM Plex Sans', system-ui, sans-serif",
                   href: 'family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400' },
      editorial: { label: 'Editorial', note: 'Fraunces + Source Sans 3',
                   display: "'Fraunces', Georgia, serif", text: "'Source Sans 3', system-ui, sans-serif",
                   href: 'family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,800&family=Source+Sans+3:wght@400;500;600;700' },
      modern:    { label: 'Modern',    note: 'Outfit + Manrope',
                   display: "'Outfit', system-ui, sans-serif", text: "'Manrope', system-ui, sans-serif",
                   href: 'family=Outfit:wght@500;600;700;800&family=Manrope:wght@400;500;600;700' },
    },
    accents: {
      indigo: { label: 'Indigo', dark: '#8C9CF5', light: '#4A55C9' },
      teal:   { label: 'Teal',   dark: '#45C4C0', light: '#0B7A78' },
      violet: { label: 'Violet', dark: '#B79CF7', light: '#6B45C8' },
    },
  };
  function loadAppearance() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('nepse_appearance') || '{}') || {}; } catch (e) {}
    try { if (!s.theme && localStorage.getItem('nepse_theme') === 'light') s.theme = 'light'; } catch (e) {}   // older setting
    const d = APPEARANCE.defaults;
    return { theme: s.theme === 'light' ? 'light' : 'dark',
             font: APPEARANCE.fonts[s.font] ? s.font : d.font,
             accent: APPEARANCE.accents[s.accent] ? s.accent : d.accent };
  }
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
  function applyAppearance(s) {
    const root = document.documentElement, f = APPEARANCE.fonts[s.font], ac = APPEARANCE.accents[s.accent][s.theme];
    if (s.theme === 'light') root.dataset.theme = 'light'; else delete root.dataset.theme;
    root.dataset.font = s.font;
    const id = 'font-' + s.font;
    if (!document.getElementById(id)) {
      const l = document.createElement('link');
      l.id = id; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?' + f.href + '&display=swap';
      document.head.appendChild(l);
    }
    const set = (k, v) => root.style.setProperty(k, v);
    set('--display', f.display); set('--sans', f.text); set('--mono', f.text);
    set('--accent', ac); set('--blue', ac); set('--level', ac);
    set('--accent-dim', hexA(ac, 0.14)); set('--accent-border', hexA(ac, 0.45)); set('--blue-dim', hexA(ac, 0.14));
    window.APPEARANCE_STATE = s;
  }
  applyAppearance(loadAppearance());
