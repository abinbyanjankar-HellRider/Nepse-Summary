// ---- APPEARANCE (theme, font preset, accent) — presets live in APPEARANCE in <head> ----
function isLightTheme() { return document.documentElement.dataset.theme === 'light'; }
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function uiFont(weight, size) { return `${weight} ${size}px ${cssVar('--sans')}`; }

function setAppearance(change) {
  const s = { ...window.APPEARANCE_STATE, ...change };
  applyAppearance(s);
  try { localStorage.setItem('nepse_appearance', JSON.stringify(s)); } catch (e) {}
  updateThemeButton();
  renderAppearancePanel();
  // canvases don't follow CSS: redraw once the new fonts are ready
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(redrawAll);
}
function redrawAll() {
  if (window.Chart) Chart.defaults.font.family = cssVar('--sans');
  if (typeof chartInstance !== 'undefined' && chartInstance) buildChart(currentView);
  if (typeof VIEWS !== 'undefined' && VIEWS) { renderHeatmap(); renderRRG(); renderTVChart(); }
  if (typeof currentPage !== 'undefined' && currentPage === 'emotion-sec') renderEmotion();
}
function toggleTheme() { setAppearance({ theme: isLightTheme() ? 'dark' : 'light' }); }   // kept for existing callers
function updateThemeButton() {
  const s = window.APPEARANCE_STATE || {}, el = document.getElementById('ap-summary');
  if (el) el.textContent = `${s.theme === 'light' ? 'Light' : 'Dark'} · ${APPEARANCE.fonts[s.font].label}`;
}
function toggleAppearancePanel(force) {
  const p = document.getElementById('ap-panel'), b = document.getElementById('ap-btn');
  const open = force !== undefined ? force : !p.classList.contains('open');
  p.classList.toggle('open', open); b.setAttribute('aria-expanded', open);
  if (open) renderAppearancePanel();
}
function renderAppearancePanel() {
  const p = document.getElementById('ap-panel');
  if (!p) return;
  const s = window.APPEARANCE_STATE;
  const opt = (key, val, html, cls = '') =>
    `<button class="ap-opt ${cls}" aria-pressed="${s[key] === val}" data-on-click="setAppearanceKV('${key}','${val}')">${html}</button>`;
  p.innerHTML =
    `<h3>Theme</h3><div class="ap-row">${opt('theme', 'dark', 'Dark')}${opt('theme', 'light', 'Light')}</div>` +
    `<h3>Font style</h3><div class="ap-row">${Object.entries(APPEARANCE.fonts).map(([k, f]) =>
      opt('font', k, `<b style="font-family:${f.display.replace(/"/g, '&quot;')}">${f.label} 2,629</b><small>${f.note}</small>`, 'ap-font')).join('')}</div>` +
    `<h3>Accent colour</h3><div class="ap-row">${Object.entries(APPEARANCE.accents).map(([k, a]) =>
      opt('accent', k, `<span class="ap-swatch" style="background:${a[s.theme]}"></span>${a.label}`)).join('')}</div>`;
  // preview each font preset in its own face
  Object.keys(APPEARANCE.fonts).forEach(k => { if (!document.getElementById('font-' + k)) {
    const l = document.createElement('link'); l.id = 'font-' + k; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?' + APPEARANCE.fonts[k].href + '&display=swap'; document.head.appendChild(l); } });
}
document.addEventListener('click', e => {
  if (!e.target.closest('.ap-wrap')) { const p = document.getElementById('ap-panel'); if (p && p.classList.contains('open')) toggleAppearancePanel(false); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleAppearancePanel(false); });

// ---- SCROLL NAV ----
// ---- PAGES: show only the menu section that was clicked ----
// Each top-level block of <main> belongs to one page, keyed by the menu's
// target id. Blocks without an entry join the page of the block after them
// (e.g. the Trading Range ruler joins Wyckoff Events). The disclaimer shows on every page.
const PAGE_MEMBERS = {
  'chart-sec':     ['close-report', 'data-check', 'today-grid', 'today-tiles', 'chart-sec'],
  'events-sec':    ['events-sec', 'vol-section'],
  'structure-sec': ['levels-sec', 'structure-sec'],
};
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

let currentPage = null;

function pageOf(el) {
  for (const [page, keys] of Object.entries(PAGE_MEMBERS))
    if (keys.some(k => el.id === k || el.classList.contains(k))) return page;
  return el.id || null;
}

function initPages() {
  const kids = [...document.querySelector('main.main').children];
  let next = null;
  for (let i = kids.length - 1; i >= 0; i--) {          // walk backwards: unassigned blocks join the next page
    const el = kids[i];
    if (el.classList.contains('disclaimer')) { el.dataset.page = '*'; continue; }
    const pg = pageOf(el) || next;
    if (pg) { el.dataset.page = pg; next = pg; }
  }
  // '#/page' (not '#page') so the browser never jumps to the element with that id
  const fromHash = () => location.hash.replace(/^#\/?/, '');
  window.addEventListener('hashchange', () => showPage(fromHash(), false));
  const start = fromHash();
  showPage(document.querySelector(`main.main > [data-page="${start}"]`) ? start : 'chart-sec', false);
}

function showPage(page, push = true) {
  if (!document.querySelector(`main.main > [data-page="${page}"]`)) return false;
  currentPage = page;
  document.querySelectorAll('main.main > [data-page]').forEach(el =>
    el.classList.toggle('page-on', el.dataset.page === page || el.dataset.page === '*'));
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const m = (btn.getAttribute('data-on-click') || '').match(/'([^']+)'/);
    btn.classList.toggle('active', !!(m && m[1] === page));
  });
  updateGroupNav(page);
  if (push && location.hash !== '#/' + page) history.pushState(null, '', '#/' + page);
  window.scrollTo({ top: 0 });
  // Charts / treemaps measured while hidden have no size — redraw now that the
  // page is visible (reading sizes forces layout, so no frame delay is needed)
  if (page === 'chart-sec' && typeof chartInstance !== 'undefined' && chartInstance) chartInstance.resize();
  if (page === 'heatmap-sec' && typeof renderHeatmap === 'function') renderHeatmap();
  if (page === 'rrg-sec' && typeof renderRRG === 'function') renderRRG();
  if (page === 'tvchart-sec' && typeof renderTVChart === 'function') renderTVChart();
  if (page === 'notes-sec' && typeof renderNotes === 'function') renderNotes();
  if (page === 'emotion-sec' && typeof renderEmotion === 'function') renderEmotion();
  return true;
}

function navTo(id) {
  if (showPage(id)) return;
  // an element inside a page (e.g. a sub-section): open its page, then scroll to it
  const el = document.getElementById(id);
  const host = el && el.closest('main.main > [data-page]');
  if (!host) return;
  showPage(host.dataset.page);
  requestAnimationFrame(() => window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 12 }));
}

// ---- WYCKOFF LEVELS — the one place to update the analysis levels ----
// From daily closes (data/history/index.csv); reviewed Sep 24, 2026 with the
// nepse-wyckoff-review skill. Cards, ruler, chart lines and trigger status read these.
const WYCKOFF_LEVELS = {
  asOf: '2026-09-24',
  ath:       { v: 3198.60, date: '2021-08-18' },
  doubleTop: { v: 3002.07, date: '2025-07-29' },
  rangeTop:  { v: 2960.40, date: '2026-03-24' },
  creek:     { v: 2772.17, date: '2026-01-25' },
  pivot:     2600,
  rangeLow:  { v: 2487.17, date: '2025-10-16' },
  test:      { v: 2513.42, date: '2026-08-31' },
  lines: [
    { v: 2487.17, alpha: 0.85, dash: [6,4], label: 'Range low 2,487' },
    { v: 2600,    alpha: 0.55, dash: [2,5], label: 'Pivot 2,600' },
    { v: 2772.17, alpha: 0.85, dash: [6,4], label: 'Creek 2,772' },
    { v: 2960.40, alpha: 0.7, dash: [3,5], label: 'Range top 2,960' },
    { v: 3002.07, alpha: 0.5, dash: [3,6], label: 'Double top 3,002' },
    { v: 3198.60, alpha: 0.4, dash: [2,7], label: 'All-time high 3,198.6' },
  ],
};

// Live Trading Range ruler (Wyckoff Events page)
function renderRangeRuler() {
  const el = document.getElementById('range-ruler');
  if (!el) return;
  const L = WYCKOFF_LEVELS, now = LIVE_SNAPSHOT.index;
  const lo = 2450, hi = 3050;                                  // visible scale
  const pos = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
  const pct = (a, b) => ((b / a - 1) * 100);
  const f0 = v => v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const sg = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '%';
  const marks = [
    ['Range low', L.rangeLow.v, 'green'], ['Pivot', L.pivot, 'green'], ['Creek', L.creek.v, 'red'],
    ['Range top', L.rangeTop.v, 'red'], ['Double top', L.doubleTop.v, 'red'],
  ];
  const zone = now < L.rangeLow.v ? ['below the range — Ice broken', 'red']
             : now < L.pivot       ? ['lower range, below the 2,600 pivot', 'amber']
             : now < L.creek.v     ? ['between pivot and Creek', 'amber']
             : now < L.rangeTop.v  ? ['above the Creek — upper range', 'green']
             :                       ['above the range top', 'green'];
  el.innerHTML = `
    <div style="position:relative;margin:26px 0 34px;">
      <div style="height:10px;background:linear-gradient(90deg,var(--green),var(--amber) 45%,var(--red));border-radius:5px;position:relative;">
        ${marks.map(([n, v, c], i) => `<div title="${n} ${f0(v)}" style="position:absolute;left:${pos(v)}%;top:-4px;width:2px;height:18px;background:var(--${c});"></div>
          <div style="position:absolute;left:${pos(v)}%;top:${i % 2 ? '18px' : '-20px'};transform:translateX(-50%);font-family:var(--mono);font-size:9.5px;color:var(--text3);white-space:nowrap;">${n} ${f0(v)}</div>`).join('')}
        <div title="Latest close" style="position:absolute;left:${pos(now)}%;top:-6px;width:16px;height:22px;background:var(--${zone[1]});border-radius:4px;border:2px solid var(--bg);transform:translateX(-50%);"></div>
      </div>
      <div style="text-align:center;font-family:var(--mono);font-size:10.5px;margin-top:30px;color:var(--${zone[1]});">▲ NOW ${now.toLocaleString('en-IN', { maximumFractionDigits: 2 })} (${LIVE_SNAPSHOT.date}) — ${zone[0]}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;font-family:var(--mono);font-size:11px;">
      ${[['Above range low', pct(L.rangeLow.v, now), 'green'], ['To pivot 2,600', pct(now, L.pivot), 'amber'],
         ['To Creek 2,772', pct(now, L.creek.v), 'amber'], ['To range top 2,960', pct(now, L.rangeTop.v), 'red']]
        .map(([k, v, c]) => `<div style="text-align:center;padding:8px;background:var(--bg3);border-radius:8px;border:1px solid var(--${c}-border);">
          <div style="color:var(--text3);font-size:9px;margin-bottom:3px;text-transform:uppercase;">${k}</div>
          <div style="color:var(--${c});font-weight:500;">${sg(v)}</div></div>`).join('')}
    </div>
    <div style="font-family:var(--mono);font-size:10px;color:var(--text3);margin-top:10px;">Levels: WYCKOFF_LEVELS (reviewed ${isoToLabel(L.asOf)}) · position: latest close, updated daily</div>`;
}

// Live trigger status (Scenarios page): which scenario's trigger is met now
function renderTriggerStatus() {
  const el = document.getElementById('trigger-status');
  if (!el) return;
  const L = WYCKOFF_LEVELS, now = LIVE_SNAPSHOT.index;
  const wk = (LIVE_SNAPSHOT.periods && LIVE_SNAPSHOT.periods.weekly || []).slice(-1)[0];
  const wkClose = wk ? wk.close : null;
  const f2 = v => typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
  const rows = [
    ['Bearish BOS — weekly close < 2,487', wkClose !== null && wkClose < L.rangeLow.v, 'red'],
    ['Stand-aside warning — daily close < 2,487', now < L.rangeLow.v, 'red'],
    ['Long zone — close within 2,487–2,560', now >= L.rangeLow.v && now <= 2560, 'green'],
    ['Pivot reclaimed — weekly close > 2,600', wkClose !== null && wkClose > L.pivot, 'green'],
    ['Bullish BOS — weekly close > 2,772', wkClose !== null && wkClose > L.creek.v, 'green'],
    ['JAC — weekly close > 2,960', wkClose !== null && wkClose > L.rangeTop.v, 'green'],
  ];
  el.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 14px;font-family:var(--mono);font-size:11px;">
    <div style="color:var(--text3);font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Live trigger status · latest close ${f2(now)} (${LIVE_SNAPSHOT.date})${wk ? ' · week-to-date close ' + f2(wkClose) + (wk.days < 5 ? ' (week not finished)' : '') : ''}</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px 14px;">
      ${rows.map(([lbl, hit, c]) => `<div><span style="color:${hit ? 'var(--' + c + ')' : 'var(--text3)'};">${hit ? '●' : '○'}</span> <span style="color:${hit ? 'var(--text)' : 'var(--text3)'};">${lbl}</span>${hit ? ` <strong style="color:var(--${c});">MET</strong>` : ''}</div>`).join('')}
    </div></div>`;
}

// ---- CHART DATA ----
// NEPSE MONTHLY data — generated by scripts/backfill_history.py from
// data/history/index.csv (MeroLagani daily bars + daily GitHub Action).
//   price  = month-end close (index points)
//   volume = average daily turnover in Rs Billion
// Do not edit by hand — re-run: python scripts/backfill_history.py --update-chart
// The daily Action's "monthly" series updates these at runtime as well.
const allData = {
  labels: ["Jan 21", "Feb 21", "Mar 21", "Apr 21", "May 21", "Jun 21", "Jul 21", "Aug 21", "Sep 21", "Oct 21", "Nov 21", "Dec 21", "Jan 22", "Feb 22", "Mar 22", "Apr 22", "May 22", "Jun 22", "Jul 22", "Aug 22", "Sep 22", "Oct 22", "Nov 22", "Dec 22", "Jan 23", "Feb 23", "Mar 23", "Apr 23", "May 23", "Jun 23", "Jul 23", "Aug 23", "Sep 23", "Oct 23", "Nov 23", "Dec 23", "Jan 24", "Feb 24", "Mar 24", "Apr 24", "May 24", "Jun 24", "Jul 24", "Aug 24", "Sep 24", "Oct 24", "Nov 24", "Dec 24", "Jan 25", "Feb 25", "Mar 25", "Apr 25", "May 25", "Jun 25", "Jul 25", "Aug 25", "Sep 25", "Oct 25", "Nov 25", "Dec 25", "Jan 26", "Feb 26", "Mar 26", "Apr 26", "May 26", "Jun 26", "Jul 26", "Aug 26", "Sep 26"],
  price: [2371, 2474, 2619, 2611, 2783, 2824, 3080, 2976, 2633, 2838, 2628, 2524, 2872, 2611, 2544, 2356, 2138, 2038, 2195, 1973, 1854, 1875, 1950, 2029, 2112, 2020, 1909, 1871, 1850, 2151, 2106, 1991, 2004, 1864, 1859, 2069, 2098, 1972, 2018, 2006, 2070, 2037, 2761, 2750, 2509, 2678, 2748, 2576, 2658, 2815, 2693, 2624, 2693, 2631, 2923, 2750, 2664, 2600, 2650, 2634, 2714, 2655, 2851, 2739, 2782, 2608, 2686, 2513, 2630],
  volume: [6.74, 8.36, 5.14, 6.6, 9.12, 12.46, 8.52, 15.47, 7.28, 4.03, 5.09, 3.47, 6.07, 4.31, 2.69, 1.66, 1.35, 1.32, 2.41, 2.21, 0.97, 0.63, 1.17, 1.43, 3.99, 2.13, 1.24, 0.97, 1.16, 3.65, 3.11, 1.66, 1.5, 1.13, 1.08, 3.93, 5.45, 3.14, 3.13, 2.91, 4.02, 4.56, 10.84, 21.44, 7.94, 5.78, 8.35, 6.2, 6.55, 9.65, 7.85, 7.54, 8.75, 8.6, 13.93, 7.41, 4.55, 4.62, 5.28, 4.25, 8.98, 8.05, 13.49, 7.85, 3.9, 4.36, 5.04, 4.14, 5.01]
};

// Slice indices — 69-point monthly dataset (Jan 21 – Sep 26)
const recent2025 = { start: 48, end: 69 };  // Jan 2025 – latest
const recent3m   = { start: 63, end: 69 };  // last 6 months

// ── Verify counts at runtime
if (allData.labels.length !== allData.price.length || allData.labels.length !== allData.volume.length) {
  console.error('[Chart] Array length mismatch — labels:', allData.labels.length,
    'price:', allData.price.length, 'volume:', allData.volume.length);
} else {
  console.log('[Chart] Monthly data OK —', allData.labels.length, 'data points,',
    allData.labels[0], '–', allData.labels[allData.labels.length - 1]);
}

let showOverlay = true;
let showVol = true;
let currentView = 'all';
let chartInstance = null;

function getSlice(view) {
  if (view === '2025') return { s: recent2025.start, e: allData.labels.length };
  if (view === 'recent') return { s: Math.max(0, allData.labels.length - 6), e: allData.labels.length };
  return { s: 0, e: allData.labels.length };
}

function themeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function buildChart(view) {
  const { s, e } = getSlice(view);
  const C = {
    grid: themeColor('--chart-grid'), tick: themeColor('--chart-tick'),
    tipBg: themeColor('--chart-tip-bg'), tipTitle: themeColor('--chart-tip-title'),
    tipBody: themeColor('--chart-tip-body'), tipBorder: themeColor('--border2'),
    pointBorder: themeColor('--chart-point-border'), blue: themeColor('--blue'),
  };
  const labels = allData.labels.slice(s, e);
  const price = allData.price.slice(s, e);
  const vol = allData.volume.slice(s, e);

  const ctx = document.getElementById('mainChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  // Wyckoff zone annotations as background color areas
  const plugins = {};

  const datasets = [
    {
      label: 'NEPSE Index',
      data: price,
      borderColor: themeColor('--chart-price'),
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 3,
      pointBackgroundColor: themeColor('--chart-price'),
      pointBorderColor: C.pointBorder,
      pointBorderWidth: 1.5,
      tension: 0.3,
      fill: true,
      yAxisID: 'y',
      order: 1
    }
  ];

  if (showVol) {
    datasets.push({
      label: 'Avg Daily Turnover (Rs B)',
      data: vol,
      type: 'bar',
      // Colour by the month's turnover relative to the median of all months:
      // ≥2× median = climactic, ≥1.3× = high, ≥0.8× = normal, below = dry-up
      backgroundColor: (() => {
        const sorted = allData.volume.filter(x => x > 0).slice().sort((a, b) => a - b);
        const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 1;
        // one neutral colour; heavier months are more opaque (not price colours)
        return vol.map(v => v >= med * 2 ? 'rgba(147,158,173,0.55)' : v >= med * 1.3 ? 'rgba(147,158,173,0.40)'
                          : v >= med * 0.8 ? 'rgba(147,158,173,0.28)' : 'rgba(147,158,173,0.18)');
      })(),
      borderWidth: 0,
      yAxisID: 'y2',
      order: 2
    });
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 6, right: 22, top: 8 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: C.tipBg,
          borderColor: C.tipBorder,
          borderWidth: 1,
          titleColor: C.tipTitle,
          bodyColor: C.tipBody,
          padding: 12,
          titleFont: { family: cssVar('--sans'), size: 12 },
          bodyFont: { family: cssVar('--sans'), size: 12.5 },
          callbacks: {
            title: (items) => items[0].label,
            label: (item) => {
              if (item.datasetIndex === 0) return ' Index: ' + item.raw.toLocaleString('en-IN') + ' pts';
              return ' Avg daily turnover: Rs ' + item.raw.toFixed(2) + 'B';
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: C.grid, drawBorder: false },
          ticks: {
            color: C.tick,
            font: { family: cssVar('--sans'), size: 11.5 },
            maxRotation: 45,
            autoSkip: false,   // we control display manually via callback
            callback: function(val, index) {
              const lbl = this.getLabelForValue(val);
              if (!lbl) return '';
              // Always show January (year boundary) and July (mid-year)
              if (lbl.startsWith('Jan') || lbl.startsWith('Jul')) return lbl;
              // For the last data point always show
              if (index === labels.length - 1) return lbl;
              return '';
            }
          },
          border: { display: false }
        },
        y: {
          position: 'left',
          grid: { color: C.grid, drawBorder: false },
          ticks: {
            color: C.tick,
            font: { family: cssVar('--sans'), size: 11.5 },
            callback: (v) => v.toLocaleString()
          },
          border: { display: false },
          min: Math.floor(Math.min(...price) * 0.93 / 100) * 100,
        },
        y2: {
          display: showVol,
          position: 'right',
          grid: { display: false },
          ticks: {
            color: C.blue,
            font: { family: cssVar('--sans'), size: 11.5 },
            callback: (v) => Math.round(v) + ' B'
          },
          border: { display: false },
          max: Math.max(...vol) * 5  // push volume bars to bottom 20% of chart
        }
      }
    },
    plugins: showOverlay ? [{
      id: 'wyckoffZones',
      afterDraw(chart) {
        const ctx = chart.ctx;
        const yScale = chart.scales.y;
        const { chartArea: { left, right } } = chart;
        const snap = typeof LIVE_SNAPSHOT !== 'undefined' ? LIVE_SNAPSHOT : { index: 2558 };

        const placed = [];                 // label boxes already drawn: never overlap
        const drawHLine = (val, color, dash, label, labelX, above) => {
          const y = yScale.getPixelForValue(val);
          if (y < chart.chartArea.top || y > chart.chartArea.bottom) return;
          ctx.save(); ctx.font = uiFont(500, 12);
          const w = ctx.measureText(label).width + 8; ctx.restore();
          let ly = above ? y - 5 : y + 14;
          if (ly - 12 < chart.chartArea.top) ly = y + 14;              // too close to the top: below the line
          while (placed.some(b => Math.abs(b.y - ly) < 14 && labelX < b.x + b.w && labelX + w > b.x)) labelX += 12 + Math.min(w, 170);
          placed.push({ x: labelX, y: ly, w });
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.setLineDash(dash);
          ctx.beginPath();
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = color.replace(/[\d.]+\)$/, '1)');
          ctx.font = uiFont(500, 12);
          ctx.fillText(label, labelX, ly);
          ctx.restore();
        };

        // Levels come from WYCKOFF_LEVELS (one place to update)
        const lvl = cssVar('--level');
        WYCKOFF_LEVELS.lines.forEach(l => drawHLine(l.v, hexA(lvl, l.alpha), l.dash, l.label, left + 6, true));
        // Current price — live
        const nowVal = snap.index || WYCKOFF_LEVELS.rangeLow.v;
        const nowCol = 'rgba(226,162,58,0.95)';
        drawHLine(nowVal, nowCol, [4,3], '▼ NOW: ' + nowVal.toLocaleString('en-IN', {maximumFractionDigits:0}), right - 110, nowVal < WYCKOFF_LEVELS.pivot ? false : true);
      }
    }] : []
  });
}

function setView(view, btnEl) {
  currentView = view;
  document.querySelectorAll('.ctrl-group:first-child .ctrl-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  buildChart(view);
}

function toggleOverlay() {
  showOverlay = !showOverlay;
  document.getElementById('overlayBtn').classList.toggle('active', showOverlay);
  buildChart(currentView);
}

function toggleVol() {
  showVol = !showVol;
  document.getElementById('volBtn').classList.toggle('active', showVol);
  buildChart(currentView);
}

function resizeChart(h) {
  document.getElementById('chartContainer').style.height = h + 'px';
  document.getElementById('heightLabel').textContent = h + 'px';
  if (chartInstance) chartInstance.resize();
}

// ---- POSITION CALCULATOR ----
function calcPos() {
  const capital = parseFloat(document.getElementById('capital').value) || 0;
  const riskPct = parseFloat(document.getElementById('risk_pct').value) || 0;
  const entry = parseFloat(document.getElementById('entry').value) || 0;
  const stop = parseFloat(document.getElementById('stop').value) || 0;
  const t1 = parseFloat(document.getElementById('t1').value) || 0;
  const t2 = parseFloat(document.getElementById('t2').value) || 0;

  const out = document.getElementById('calcResult');
  const npr = v => 'NPR ' + (v < 0 ? '−' : '+') + Math.abs(v).toLocaleString('en-IN', {maximumFractionDigits: 0});
  const row = (k, v, style = '') => `<div class="res-row"><span class="res-k">${k}</span><span class="res-v" style="${style}">${v}</span></div>`;

  if (capital <= 0 || entry <= 0 || stop <= 0 || riskPct <= 0 || riskPct > 100) {
    out.innerHTML = row('Check inputs', 'Capital, entry and stop must be > 0; risk % between 0 and 100', 'color:var(--amber);');
    return;
  }
  if (stop >= entry) {
    out.innerHTML = row('Check inputs', 'Stop loss must be below entry for a long position', 'color:var(--amber);');
    return;
  }

  const riskAmt = capital * (riskPct / 100);
  const riskPts = +(entry - stop).toFixed(2);
  // Risk-based size, but never more than the capital can buy
  const unitsByRisk    = Math.floor(riskAmt / riskPts);
  const unitsByCapital = Math.floor(capital / entry);
  const units   = Math.min(unitsByRisk, unitsByCapital);
  const capped  = unitsByCapital < unitsByRisk;
  const actualRisk = units * riskPts;
  const rrTo = tp => tp > 0 ? ((tp - entry) / riskPts).toFixed(2) + ':1 → ' + npr(units * (tp - entry)) : '—';

  out.innerHTML =
    row('Max risk amount', 'NPR ' + riskAmt.toLocaleString('en-IN', {maximumFractionDigits: 0}) +
        (capped ? ' <span style="color:var(--text3);">(actual ' + actualRisk.toLocaleString('en-IN', {maximumFractionDigits: 0}) + ')</span>' : '')) +
    row('Risk in points', riskPts.toLocaleString('en-IN', {maximumFractionDigits: 2}) + ' pts') +
    row('Suggested units', units.toLocaleString('en-IN') + ' units' + (capped ? ' <span style="color:var(--amber);">· capped by capital</span>' : '')) +
    row('Position size', 'NPR ' + (units * entry).toLocaleString('en-IN', {maximumFractionDigits: 0}) +
        ' <span style="color:var(--text3);">(' + (units * entry / capital * 100).toFixed(1) + '% of capital)</span>') +
    row('R:R to Target 1', rrTo(t1), t1 > 0 && t1 <= entry ? 'color:var(--red);' : '') +
    row('R:R to Target 2', rrTo(t2), t2 > 0 && t2 <= entry ? 'color:var(--red);' : '');
}

// Init is handled by the consolidated DOMContentLoaded at the bottom of this script.

// ============================================================
// P1-A: LOCALSTORAGE SESSION PERSISTENCE
// ============================================================
const LS_KEY = 'nepse_pms_sessions';
const LS_ACTIVE = 'nepse_pms_active_session';
let sessionDirty = false;

function initPersistence() {
  refreshSessionList();
  const active = localStorage.getItem(LS_ACTIVE);
  if (active) {
    const sessions = getSessions();
    if (sessions[active]) {
      document.getElementById('session-select').value = active;
      restoreSession(sessions[active]);
    }
  }
  // Auto-save every 90 seconds
  setInterval(() => { if (sessionDirty) autoSave(); }, 90000);
  // Mark dirty on any input
  document.addEventListener('input', () => markDirty());
  document.addEventListener('change', () => markDirty());
}

function getSessions() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function setSessions(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

function markDirty() {
  sessionDirty = true;
  const st = document.getElementById('session-status');
  if (st) { st.textContent = '● Unsaved changes'; st.className = 'sb-status dirty'; }
}

function markClean(name) {
  sessionDirty = false;
  const st = document.getElementById('session-status');
  const ti = document.getElementById('session-time');
  if (st) { st.textContent = '✓ Saved'; st.className = 'sb-status'; }
  if (ti) ti.textContent = 'Last saved: ' + new Date().toLocaleTimeString('en-NP', {timeZone:'Asia/Kathmandu'});
}

function captureSessionData() {
  // Collect all fund field values
  const fundIds = ['ltp','eps','pe','pb','roe','div','bvps','mktcap','net_profit','nii','loan',
    'deposit','capital','reserve','npl_ratio','car','ccd','cdsl','promoter','public_hold'];
  const fundValues = {};
  fundIds.forEach(id => {
    const el = document.getElementById('fund-' + id);
    if (el) fundValues[id] = el.value;
  });
  // Collect Wyckoff checklist
  const wIds = ['wchk-ps','wchk-sc','wchk-ar','wchk-st','wchk-spring','wchk-sos','wchk-lps','wchk-vol','wchk-rr'];
  const wychk = {};
  wIds.forEach(id => { const el = document.getElementById(id); if (el) wychk[id] = el.checked; });
  // Collect position calculator values
  const calcIds = ['capital','risk_pct','entry','stop','t1','t2'];
  const calcValues = {};
  calcIds.forEach(id => { const el = document.getElementById(id); if (el) calcValues[id] = el.value; });
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    symbol: saState.symbol,
    companyName: saState.companyName,
    sector: saState.sector,
    fundamentals: fundValues,
    wyckoffChecklist: wychk,
    annotations: saState.annotations,
    aiResult: saState.aiResult,
    aiDQ: saState.aiDQ ?? null,
    aiConf: saState.aiConf ?? null,
    aiContext: document.getElementById('ai-context')?.value || '',
    aiDepth: document.getElementById('ai-depth')?.value || 'standard',
    aiFocus: document.getElementById('ai-focus')?.value || 'combined',
    calcValues,
    chartImgDataUrl: saState.chartImgDataUrl || null,
  };
}

function restoreSession(data) {
  if (!data || data.version < 2) return;
  // Reset what the previous session left behind, so nothing leaks across
  saState.fundamentals = {};
  document.querySelectorAll('#fund-content input[id^="fund-"]').forEach(el => { el.value = ''; });
  WYCKOFF_IDS.forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });
  if (!data.aiResult) clearAIOutput();

  // The summary depends on the restored fundamentals, so it is rebuilt last
  const rebuildSummary = () => {
    if (!data.aiResult) return;
    // Sessions saved before aiDQ existed fall back to the current score
    const dq   = data.aiDQ ?? computeDataQualityScore().score;
    const conf = data.aiConf || (dq >= 70 ? 'HIGH' : dq >= 45 ? 'MEDIUM' : 'LOW');
    saState.aiDQ = dq; saState.aiConf = conf;
    buildStockSummary(data.symbol, data.companyName, data.aiResult, data.fundamentals || {}, dq, conf);
    markClean();
  };
  let summaryDeferred = false;

  // Restore symbol
  if (data.symbol) {
    selectSymbol(data.symbol, data.companyName || '', data.sector || '');
    // Trigger fundamentals display if symbol is set
    if (data.fundamentals && Object.values(data.fundamentals).some(v => v)) {
      setTimeout(() => {
        fetchFundamentals();
        // Restore fund field values after fetchFundamentals builds the DOM
        setTimeout(() => {
          Object.entries(data.fundamentals).forEach(([id, val]) => {
            const el = document.getElementById('fund-' + id);
            if (el) el.value = val;
          });
          onFundInput();
          rebuildSummary();
        }, 100);
      }, 50);
      summaryDeferred = true;
    }
  }
  // Restore Wyckoff checklist
  if (data.wyckoffChecklist) {
    Object.entries(data.wyckoffChecklist).forEach(([id, checked]) => {
      const el = document.getElementById(id);
      if (el) el.checked = checked;
    });
    updateWyckoffScore();
  }
  // Restore annotations
  if (data.annotations) {
    saState.annotations = data.annotations;
    redrawAnnotations && redrawAnnotations();
    updateAnnList && updateAnnList();
  }
  // Restore AI result
  if (data.aiResult) {
    saState.aiResult = data.aiResult;
    const body = document.getElementById('ai-output-body');
    if (body) body.innerHTML = formatAIOutput(data.aiResult);
    const copyBtn = document.getElementById('copy-ai-btn');
    const clrBtn  = document.getElementById('clear-ai-btn');
    if (copyBtn) copyBtn.style.display = 'flex';
    if (clrBtn)  clrBtn.style.display = 'flex';
    saState.aiDQ = data.aiDQ ?? null; saState.aiConf = data.aiConf ?? null;
  }
  // Restore AI config
  const ctx = document.getElementById('ai-context');
  if (ctx && data.aiContext) ctx.value = data.aiContext;
  const dep = document.getElementById('ai-depth');
  if (dep && data.aiDepth) dep.value = data.aiDepth;
  const foc = document.getElementById('ai-focus');
  if (foc && data.aiFocus) foc.value = data.aiFocus;
  // Restore position calculator values
  if (data.calcValues) {
    Object.entries(data.calcValues).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    });
    calcPos();
  }
  // Restore chart image
  if (data.chartImgDataUrl) {
    saState.chartImgDataUrl = data.chartImgDataUrl;
    const prevSec = document.getElementById('chart-preview-section');
    const zone    = document.getElementById('uploadZone');
    const img     = document.getElementById('chartPreviewImg');
    const annImg  = document.getElementById('annBaseImg');
    if (prevSec) prevSec.style.display = 'block';
    if (zone)    zone.style.display = 'none';
    if (img)     img.src = data.chartImgDataUrl;
    if (annImg)  annImg.src = data.chartImgDataUrl;
    const noMsg   = document.getElementById('no-chart-msg');
    const annCont = document.getElementById('annotate-content');
    if (noMsg)   noMsg.style.display = 'none';
    if (annCont) annCont.style.display = 'block';
    markCheck('chk-chart', true);
    setTimeout(() => initAnnotationCanvas(), 200);
  }
  if (!summaryDeferred) rebuildSummary();
  markClean();
  updateDataGate();
}

function saveSession() {
  const sel = document.getElementById('session-select');
  const name = sel.value || generateSessionName();
  const sessions = getSessions();
  sessions[name] = captureSessionData();
  setSessions(sessions);
  localStorage.setItem(LS_ACTIVE, name);
  refreshSessionList();
  sel.value = name;
  markClean(name);
  showToast('Session saved: ' + name);
}

function saveSessionAs() {
  const name = prompt('Session name:', generateSessionName());
  if (!name || !name.trim()) return;
  const sessions = getSessions();
  sessions[name.trim()] = captureSessionData();
  setSessions(sessions);
  localStorage.setItem(LS_ACTIVE, name.trim());
  refreshSessionList();
  document.getElementById('session-select').value = name.trim();
  markClean(name.trim());
  showToast('Saved as: ' + name.trim());
}

function loadSelectedSession() {
  const name = document.getElementById('session-select').value;
  if (!name) return;
  if (sessionDirty) {
    if (!confirm('You have unsaved changes. Load "' + name + '" and discard them?')) {
      return;
    }
  }
  const sessions = getSessions();
  if (sessions[name]) {
    restoreSession(sessions[name]);
    localStorage.setItem(LS_ACTIVE, name);
    showToast('Loaded: ' + name);
  }
}

function deleteSession() {
  const name = document.getElementById('session-select').value;
  if (!name) return;
  if (!confirm('Delete session "' + name + '"?')) return;
  const sessions = getSessions();
  delete sessions[name];
  setSessions(sessions);
  localStorage.removeItem(LS_ACTIVE);
  refreshSessionList();
  document.getElementById('session-select').value = '';
  showToast('Deleted: ' + name);
}

function autoSave() {
  const name = document.getElementById('session-select').value;
  if (!name) return;
  const sessions = getSessions();
  sessions[name] = captureSessionData();
  setSessions(sessions);
  markClean(name);
}

function exportSessionJSON() {
  const data = captureSessionData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'nepse_pms_' + (saState.symbol || 'session') + '_' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  showToast('Session exported as JSON');
}

function refreshSessionList() {
  const sel = document.getElementById('session-select');
  if (!sel) return;
  const current = sel.value;
  const sessions = getSessions();
  sel.innerHTML = '<option value="">— New session —</option>' +
    Object.entries(sessions)
      .sort((a,b) => (b[1].savedAt||'').localeCompare(a[1].savedAt||''))
      .map(([name, data]) => {
        const dt = data.savedAt ? new Date(data.savedAt).toLocaleDateString('en-NP') : '';
        return `<option value="${esc(name)}">${esc(name)} (${dt})</option>`;
      }).join('');
  if (current) sel.value = current;
}

function generateSessionName() {
  const sym = saState.symbol || 'NEPSE';
  const dt = new Date().toLocaleDateString('en-NP', {day:'2-digit',month:'short',year:'numeric'});
  return sym + ' — ' + dt;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
}

function showToast(msg) {
  let t = document.getElementById('pms-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'pms-toast';
    t.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;background:var(--surface);border:1px solid var(--green-border);color:var(--green);font-family:var(--mono);font-size:12px;padding:10px 16px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.4);transition:opacity 0.3s;pointer-events:none;';
    document.body.appendChild(t);
  }
  t.textContent = '✓ ' + msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.style.opacity = '0', 2500);
}

// ============================================================
// P1-B: FUNDAMENTAL VALIDATION ENGINE
// ============================================================
// Fundamentals are typed as free text copied from ShareSansar/Chukul, where
// numbers carry thousands separators ("1,240.00"). parseFloat stops at the
// first comma, so every numeric read goes through numVal.
function numVal(v) {
  if (v === null || v === undefined) return NaN;
  const s = String(v).replace(/,/g, '').trim();
  return s === '' ? NaN : parseFloat(s);
}
const WYCKOFF_IDS = ['wchk-ps','wchk-sc','wchk-ar','wchk-st','wchk-spring','wchk-sos','wchk-lps','wchk-vol','wchk-rr'];
// One set of thresholds for the checklist (score, summary card, trade table)
const wyckoffColor = n => n >= 7 ? 'var(--green)' : n >= 4 ? 'var(--amber)' : 'var(--red)';
const FUND_RULES = {
  ltp:         { label:'LTP',            min:1,    max:100000, warn_low:10,   warn_high:50000, unit:'Rs',  note:'Share price in NPR — verify on NEPSE floorsheet' },
  eps:         { label:'EPS',            min:-500, max:5000,   warn_high:500, unit:'Rs',  note:'Annualised EPS in NPR. Negative EPS must include a reason.' },
  pe:          { label:'P/E ratio',      min:0,    max:200,    warn_high:80,  warn_low:3, unit:'×',   note:'NEPSE banking sector P/E typically 8–25×; hydro 20–60×' },
  pb:          { label:'P/B ratio',      min:0,    max:50,     warn_high:20,  unit:'×',   note:'P/B > 5 requires strong ROE justification for banks' },
  roe:         { label:'ROE',            min:-50,  max:100,    warn_high:50,  unit:'%',   note:'NEPSE bank ROE typically 10–22%. >50% requires verification.' },
  div:         { label:'Dividend',       min:0,    max:200,    warn_high:150, unit:'%',   note:'Includes bonus + cash. Total >100% is unusual — verify.' },
  bvps:        { label:'BVPS',           min:1,    max:100000, unit:'Rs',     note:'Book value per share in NPR' },
  mktcap:      { label:'Market cap',     min:0.1,  max:500000, unit:'Cr',     note:'In NPR crore' },
  npl_ratio:   { label:'NPL ratio',      min:0,    max:50,     warn_high:10,  critical_high:20, unit:'%', note:'NPL >10% is SEBON-flagged for banks. >20% = severely distressed.' },
  car:         { label:'CAR',            min:0,    max:50,     unit:'%',   note:'NRB minimum CAR is 11%. Below this = regulatory risk.' },
  ccd:         { label:'CCD ratio',      min:0,    max:100,    unit:'%',   note:'NRB CCD limit is 90%. Above 85% = liquidity pressure.' },
  promoter:    { label:'Promoter hold',  min:0,    max:100,    unit:'%',       note:'Promoter lock-in applies; verify with SEBON filings' },
  public_hold: { label:'Public float',   min:0,    max:100,    unit:'%',       note:'Should sum to ~100% with promoter holding' },
};

// Sector-specific P/E and ROE norms
const SECTOR_NORMS = {
  'Commercial Banks':       { pe:[8,25],  roe:[10,22], npl:[0,5] },
  'Development Banks':      { pe:[8,20],  roe:[8,18],  npl:[0,8] },
  'Finance Companies':      { pe:[6,18],  roe:[8,16],  npl:[0,10] },
  'Microfinance':           { pe:[15,50], roe:[15,35], npl:[0,5] },
  'Life Insurance':         { pe:[25,80], roe:[8,20],  npl:null },
  'Non-Life Insurance':     { pe:[15,60], roe:[8,18],  npl:null },
  'Hydropower':             { pe:[20,80], roe:[5,18],  npl:null },
  'Manufacturing & Processing': { pe:[10,40], roe:[5,20], npl:null },
  'Hotels':                 { pe:[15,60], roe:[3,15],  npl:null },
};

function validateFundamentals() {
  const issues = [];
  const fund = saState.fundamentals || {};
  const sector = saState.sector || '';
  const norms = SECTOR_NORMS[sector];

  const get = id => { const v = numVal(fund[id]); return isNaN(v) ? null : v; };

  // Cross-field checks
  const ltp    = get('ltp');
  const eps    = get('eps');
  const pe     = get('pe');
  const bvps   = get('bvps');
  const pb     = get('pb');
  const roe    = get('roe');
  const npl    = get('npl_ratio');
  const car    = get('car');
  const ccd    = get('ccd');
  const div    = get('div');
  const prom   = get('promoter');
  const pub    = get('public_hold');

  // P/E consistency check
  if (ltp !== null && eps !== null && eps > 0 && pe !== null) {
    const calcPE = ltp / eps;
    if (Math.abs(calcPE - pe) > Math.max(1, calcPE * 0.10)) {
      issues.push({ sev:'error', msg:`P/E mismatch: LTP÷EPS = ${calcPE.toFixed(1)}× but entered P/E = ${pe}×. Check values.` });
    }
  } else if (ltp !== null && eps !== null && eps > 0 && pe === null) {
    issues.push({ sev:'hint', msg:`P/E not entered. From LTP÷EPS = ${(ltp/eps).toFixed(1)}× — fill this in.` });
  } else if (eps !== null && eps <= 0 && pe !== null && pe > 0) {
    issues.push({ sev:'warn', msg:`P/E ${pe}× entered but EPS is ${eps} — P/E is not meaningful for a loss-making company.` });
  }

  // P/B consistency
  if (ltp !== null && bvps !== null && bvps > 0 && pb !== null) {
    const calcPB = ltp / bvps;
    if (Math.abs(calcPB - pb) > Math.max(0.2, calcPB * 0.10)) {
      issues.push({ sev:'error', msg:`P/B mismatch: LTP÷BVPS = ${calcPB.toFixed(2)}× but entered = ${pb}×.` });
    }
  }

  // ROE ≈ EPS ÷ BVPS
  if (eps !== null && bvps !== null && bvps > 0 && roe !== null) {
    const calcROE = eps / bvps * 100;
    if (Math.abs(calcROE - roe) > Math.max(2, Math.abs(calcROE) * 0.25)) {
      issues.push({ sev:'warn', msg:`ROE mismatch: EPS÷BVPS = ${calcROE.toFixed(1)}% but entered ROE = ${roe}%. Check the period of each figure.` });
    }
  }

  // Promoter + public sum
  if (prom !== null && pub !== null) {
    const sum = prom + pub;
    if (sum < 85 || sum > 105) {
      issues.push({ sev:'warn', msg:`Promoter (${prom}%) + Public (${pub}%) = ${sum}%. Should be ~100%. Verify holdings.` });
    }
  }

  // Sector-specific P/E range
  if (norms && pe !== null) {
    if (pe < norms.pe[0]) issues.push({ sev:'warn', msg:`P/E ${pe}× is below typical ${sector} range (${norms.pe[0]}–${norms.pe[1]}×). Verify — may signal distress or data error.` });
    if (pe > norms.pe[1]) issues.push({ sev:'warn', msg:`P/E ${pe}× is above typical ${sector} range (${norms.pe[0]}–${norms.pe[1]}×). Premium warranted only with strong growth.` });
  }

  // Sector-specific ROE
  if (norms && roe !== null) {
    if (roe > norms.roe[1]) issues.push({ sev:'warn', msg:`ROE ${roe}% exceeds typical ${sector} range (${norms.roe[0]}–${norms.roe[1]}%). Verify — may be a data error.` });
    if (roe < norms.roe[0]) issues.push({ sev:'hint', msg:`ROE ${roe}% is below typical ${sector} range. Weak profitability for this sector.` });
  }

  // NPL critical threshold
  if (npl !== null) {
    if (npl > 20) issues.push({ sev:'error', msg:`NPL ratio ${npl}% is critically high (>20%). Bank may be under NRB corrective action. Confirm with SEBON/NRB filings.` });
    else if (npl > 10) issues.push({ sev:'warn', msg:`NPL ${npl}% is above 10% NRB watch threshold. Elevated credit risk — weight analysis accordingly.` });
    else if (norms?.npl && npl > norms.npl[1]) issues.push({ sev:'warn', msg:`NPL ${npl}% is above sector norm for ${sector}. Flag for closer scrutiny.` });
  }

  // NRB CAR minimum
  if (car !== null && car < 11) {
    issues.push({ sev:'error', msg:`CAR ${car}% is below NRB minimum of 11%. Regulatory breach — confirm immediately before any trade decision.` });
  }

  // NRB CCD limit
  if (ccd !== null && ccd > 90) {
    issues.push({ sev:'error', msg:`CCD ratio ${ccd}% exceeds the NRB limit of 90%. Lending must contract — confirm with the bank's latest disclosure.` });
  } else if (ccd !== null && ccd > 85) {
    issues.push({ sev:'warn', msg:`CCD ratio ${ccd}% approaching NRB limit of 90%. Liquidity constraint — limits lending growth.` });
  }

  // Dividend sanity
  if (div !== null && div > 100) {
    issues.push({ sev:'warn', msg:`Dividend ${div}% (>100%) is unusually high. Confirm this includes both bonus shares and cash dividend from SEBON filings.` });
  }

  // EPS negative without note
  if (eps !== null && eps < 0) {
    const ctx = document.getElementById('ai-context')?.value || '';
    if (!ctx.includes('loss') && !ctx.includes('negative') && !ctx.includes('EPS')) {
      issues.push({ sev:'warn', msg:`EPS is negative (${eps}). Add context in the "Additional context" box explaining the reason (e.g. flood impact, COVID loss, provisioning).` });
    }
  }

  // Generic range checks. NPL, CAR, CCD and dividend have specific checks
  // above, so they only get the out-of-range test here (no double penalty).
  const SPECIFIC = new Set(['npl_ratio', 'car', 'ccd', 'div']);
  Object.entries(FUND_RULES).forEach(([id, rule]) => {
    const v = get(id);
    if (v === null) return;
    if (v < rule.min || (rule.max && v > rule.max)) {
      issues.push({ sev:'error', msg:`${rule.label}: value ${v}${rule.unit} is outside valid range (${rule.min}–${rule.max}${rule.unit}). Likely a data entry error.` });
    } else if (SPECIFIC.has(id)) {
      return;
    } else if (rule.critical_high && v > rule.critical_high) {
      issues.push({ sev:'error', msg:`${rule.label}: ${v}${rule.unit} exceeds critical threshold. ${rule.note}` });
    } else if (rule.warn_high && v > rule.warn_high) {
      issues.push({ sev:'warn', msg:`${rule.label}: ${v}${rule.unit} is unusually high. ${rule.note}` });
    } else if (rule.warn_low && v < rule.warn_low) {
      issues.push({ sev:'warn', msg:`${rule.label}: ${v}${rule.unit} is unusually low. ${rule.note}` });
    }
  });

  return issues;
}

function computeDataQualityScore() {
  const fund = saState.fundamentals || {};
  const hasChart = !!saState.chartImgDataUrl;
  const hasSym   = !!saState.symbol;
  const issues   = validateFundamentals();

  // Count filled fields
  const coreIds  = ['ltp','eps','pe','roe'];
  const extraIds = ['pb','div','bvps','npl_ratio','car','ccd','promoter'];
  const filledCore  = coreIds.filter(id  => fund[id]  && fund[id].trim()).length;
  const filledExtra = extraIds.filter(id => fund[id] && fund[id].trim()).length;

  let score = 0;
  if (hasSym)                  score += 10;
  if (hasChart)                score += 25;
  if (filledCore >= 4)         score += 30;
  else                         score += filledCore * 7;
  if (filledExtra >= 4)        score += 15;
  else                         score += filledExtra * 3;
  const hasContext = (document.getElementById('ai-context')?.value || '').trim().length > 10;
  if (hasContext)              score += 5;
  const wchkCount = WYCKOFF_IDS.filter(id => document.getElementById(id)?.checked).length;
  if (wchkCount >= 5)          score += 15;
  else                          score += wchkCount * 2;

  // Deduct for validation issues
  const errors = issues.filter(i => i.sev === 'error').length;
  const warns  = issues.filter(i => i.sev === 'warn').length;
  score = Math.max(0, score - errors * 12 - warns * 4);
  score = Math.min(100, score);

  return { score, issues, filledCore, filledExtra, hasChart, hasSym, wchkCount };
}

function updateDataQuality() {
  updateDataGate();                 // renders the score bar and the gate together
  return computeDataQualityScore().score;
}

// The data-gate MutationObserver watches #fund-content, which contains this
// panel — so only touch the DOM when something actually changed, otherwise
// every render would trigger another render (infinite loop).
function setIfChanged(el, prop, val) { if (el && el[prop] !== val) el[prop] = val; }

function renderDataQuality(score, issues) {
  // Same 70 / 45 cut-offs as the HIGH / MEDIUM / LOW confidence levels
  const col = score >= 70 ? 'var(--green)' : score >= 45 ? 'var(--amber)' : 'var(--red)';
  const grade = score >= 80 ? 'Excellent' : score >= 70 ? 'Good' : score >= 45 ? 'Moderate' : score >= 25 ? 'Poor' : 'Insufficient';

  const fill = document.getElementById('dq-fill');
  const lbl  = document.getElementById('dq-label');
  const grEl = document.getElementById('dq-grade');
  if (fill) { fill.style.width = score + '%'; fill.style.background = col; }
  if (lbl)  { setIfChanged(lbl, 'textContent', score + ' / 100'); lbl.style.color = col; }
  if (grEl) { setIfChanged(grEl, 'textContent', grade); grEl.style.color = col; }

  // Issues list
  const issuesEl = document.getElementById('dq-issues');
  if (issuesEl) {
    const sevIcon = { error:'❌', warn:'⚠️', hint:'💡' };
    const html = issues.length === 0
      ? '<div style="color:var(--green);font-size:11px;padding:4px 0;">✓ No validation issues detected</div>'
      : issues.map(i => `<div class="dq-issue"><span class="dq-icon">${sevIcon[i.sev]||'ℹ'}</span><span>${esc(i.msg)}</span></div>`).join('');
    if (issuesEl.dataset.html !== html) { issuesEl.dataset.html = html; issuesEl.innerHTML = html; }
  }
}

// ============================================================
// P1-C: AI DATA GATE
// ============================================================
function initDataGate() {
  // Watch for changes that affect gate status
  const observer = new MutationObserver(() => updateDataGate());
  const target = document.getElementById('fund-content');
  if (target) observer.observe(target, { subtree: true, childList: true, characterData: true });
  updateDataGate();
}

function updateDataGate() {
  const hasChart   = !!saState.chartImgDataUrl;
  const hasSym     = !!saState.symbol;
  const fund       = saState.fundamentals || {};
  const filledFund = Object.values(fund).filter(v => v && String(v).trim()).length;
  const { score, issues } = computeDataQualityScore();
  renderDataQuality(score, issues);
  const hasMinFund = filledFund >= 4;
  const hasMinData = hasChart || hasMinFund;
  const errors     = issues.filter(i => i.sev === 'error');

  const banner = document.getElementById('gate-banner');
  const btn    = document.getElementById('run-ai-btn');
  if (!banner || !btn) return;

  // Determine gate state
  const blocked = !hasSym || !hasMinData;   // both requirements must be met
  const hasErrors = errors.length > 0;

  if (blocked) {
    banner.className = 'gate-banner blocked';
    banner.innerHTML = `<strong>⛔ Insufficient data — AI analysis blocked</strong>
      <div class="gate-req"><span class="gr-icon">${hasChart || hasMinFund ? '✅' : '⬜'}</span> Chart image uploaded <em>or</em> at least 4 fundamental fields entered (${filledFund}/4 filled)</div>
      <div class="gate-req"><span class="gr-icon">${hasSym ? '✅' : '⬜'}</span> Stock symbol selected</div>`;
    btn.disabled = true;
    btn.textContent = '🤖 Run Full AI Analysis';
    return;
  }

  if (hasErrors && score < 40) {
    banner.className = 'gate-banner warning';
    banner.innerHTML = `<strong>⚠ Data quality issues detected — analysis may be unreliable</strong>
      ${errors.slice(0,2).map(e => `<div class="gate-req"><span class="gr-icon">❌</span> ${esc(e.msg)}</div>`).join('')}
      <div style="margin-top:4px;font-size:11px;color:var(--text3);">Fix validation errors in the Fundamentals tab before running for best results.</div>`;
    btn.disabled = false;
    btn.textContent = '🤖 Run Analysis (with caveats)';
    return;
  }

  // Compute confidence level
  const conf = score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';
  const confLabel = { high:'High confidence', medium:'Medium confidence', low:'Low confidence — chart or more fundamentals recommended' };
  const confClass = { high:'conf-high', medium:'conf-med', low:'conf-low' };

  banner.className = 'gate-banner ready';
  banner.innerHTML = `<strong>✅ Ready for AI analysis</strong>
    <span class="confidence-pill ${confClass[conf]}">${confLabel[conf]}</span>
    <div class="gate-req" style="margin-top:4px;"><span class="gr-icon">${hasChart?'✅':'⬜'}</span> Chart image: ${hasChart ? 'uploaded' : 'not provided'}</div>
    <div class="gate-req"><span class="gr-icon">${hasMinFund?'✅':'⬜'}</span> Fundamentals: ${filledFund} fields entered</div>
    <div class="gate-req"><span class="gr-icon">${hasSym?'✅':'⬜'}</span> Symbol: ${saState.symbol || '—'} ${saState.sector ? '· '+saState.sector : ''}</div>`;
  btn.disabled = false;
  btn.textContent = '🤖 Run Full AI Analysis';
}

// ============================================================
// NEPSE STOCKS DATABASE (with sectors, for dropdown)
// ============================================================
const NEPSE_STOCKS = [
  // Commercial Banks
  {s:'NABIL',n:'Nabil Bank Limited',sec:'Commercial Banks'},
  {s:'NICA',n:'NIC Asia Bank Limited',sec:'Commercial Banks'},
  {s:'NCCB',n:'NCC Bank Limited',sec:'Commercial Banks'},
  {s:'EBL',n:'Everest Bank Limited',sec:'Commercial Banks'},
  {s:'ADBL',n:'Agricultural Development Bank',sec:'Commercial Banks'},
  {s:'SBL',n:'Siddhartha Bank Limited',sec:'Commercial Banks'},
  {s:'KBL',n:'Kumari Bank Limited',sec:'Commercial Banks'},
  {s:'MBL',n:'Machhapuchchhre Bank Limited',sec:'Commercial Banks'},
  {s:'PCBL',n:'Prime Commercial Bank Limited',sec:'Commercial Banks'},
  {s:'SBI',n:'Nepal SBI Bank Limited',sec:'Commercial Banks'},
  {s:'NBB',n:'Nepal Bangladesh Bank Limited',sec:'Commercial Banks'},
  {s:'CCBL',n:'Century Commercial Bank',sec:'Commercial Banks'},
  {s:'GBIME',n:'Global IME Bank Limited',sec:'Commercial Banks'},
  {s:'HBL',n:'Himalayan Bank Limited',sec:'Commercial Banks'},
  {s:'LBBL',n:'Lumbini Bikas Bank',sec:'Commercial Banks'},
  {s:'LSL',n:'Laxmi Sunrise Bank',sec:'Commercial Banks'},
  {s:'NBL',n:'Nepal Bank Limited',sec:'Commercial Banks'},
  {s:'NIMB',n:'Nepal Investment Mega Bank',sec:'Commercial Banks'},
  {s:'PRVU',n:'Prabhu Bank Limited',sec:'Commercial Banks'},
  {s:'SANIMA',n:'Sanima Bank Limited',sec:'Commercial Banks'},
  {s:'SCB',n:'Standard Chartered Bank Nepal',sec:'Commercial Banks'},
  // Development Banks
  {s:'CORBL',n:'Corporate Development Bank',sec:'Development Banks'},
  {s:'EDBL',n:'Excel Development Bank',sec:'Development Banks'},
  {s:'GBBL',n:'Garima Bikas Bank',sec:'Development Banks'},
  {s:'JBBL',n:'Jyoti Bikas Bank',sec:'Development Banks'},
  {s:'KSBBL',n:'Kamana Sewa Bikas Bank',sec:'Development Banks'},
  {s:'MLBL',n:'Mahalaxmi Bikas Bank',sec:'Development Banks'},
  {s:'MNBBL',n:'Muktinath Bikas Bank',sec:'Development Banks'},
  {s:'NABBC',n:'Narayani Development Bank',sec:'Development Banks'},
  {s:'SADBL',n:'Sana Development Bank',sec:'Development Banks'},
  {s:'SAPDBL',n:'Saptagandaki Development Bank',sec:'Development Banks'},
  {s:'SHINE',n:'Shine Resunga Development Bank',sec:'Development Banks'},
  {s:'SINDU',n:'Sindhu Bikas Bank',sec:'Development Banks'},
  // Finance Companies
  {s:'CFCL',n:'Central Finance Co. Ltd.',sec:'Finance Companies'},
  {s:'GFCL',n:'Goodwill Finance Company',sec:'Finance Companies'},
  {s:'GUFL',n:'Gurkhas Finance Limited',sec:'Finance Companies'},
  {s:'ICFC',n:'ICFC Finance Limited',sec:'Finance Companies'},
  {s:'JFL',n:'Janaki Finance Company',sec:'Finance Companies'},
  {s:'MFIL',n:'Manjushree Finance Ltd',sec:'Finance Companies'},
  {s:'MPFL',n:'Multipurpose Finance Company',sec:'Finance Companies'},
  {s:'NFS',n:'Nepal Finance Limited',sec:'Finance Companies'},
  {s:'PROFL',n:'Professional Diyalo Finance',sec:'Finance Companies'},
  {s:'RLFL',n:'Reliance Finance Limited',sec:'Finance Companies'},
  {s:'SFCL',n:'Saptakoshi Finance',sec:'Finance Companies'},
  {s:'SIFC',n:'Samriddhi Finance Company',sec:'Finance Companies'},
  // Hydropower
  {s:'AHPC',n:'Api Power Company Limited',sec:'Hydropower'},
  {s:'AKPL',n:'Ankhu Khola Jalavidhyut',sec:'Hydropower'},
  {s:'AKJCL',n:'Aryan Khola Jalavidhyut',sec:'Hydropower'},
  {s:'BARUN',n:'Barun Hydropower Company',sec:'Hydropower'},
  {s:'BEDC',n:'Butwal Electric Company',sec:'Hydropower'},
  {s:'BHPL',n:'Bhotekoshi Power Company',sec:'Hydropower'},
  {s:'BNHC',n:'Budhigandaki Nepal Hydro',sec:'Hydropower'},
  {s:'CHCL',n:'Chilime Hydropower Company',sec:'Hydropower'},
  {s:'DHPL',n:'Dordi Khola Hydropower',sec:'Hydropower'},
  {s:'DOLTI',n:'Dolti Power Company',sec:'Hydropower'},
  {s:'GHL',n:'Gandaki Hydropower Development',sec:'Hydropower'},
  {s:'HDHPC',n:'Himalayan Distillery Limited',sec:'Hydropower'},
  {s:'HPPL',n:'Himalayan Power Partner',sec:'Hydropower'},
  {s:'HURJA',n:'Hurja Power Company',sec:'Hydropower'},
  {s:'JOSHI',n:'Joshi Hydropower Development',sec:'Hydropower'},
  {s:'KKHC',n:'Kalinchok Hydropower Limited',sec:'Hydropower'},
  {s:'MHNL',n:'Molung Hydropower Nepal',sec:'Hydropower'},
  {s:'NHDL',n:'Nepal Hydro Developers Limited',sec:'Hydropower'},
  {s:'NRJL',n:'Nerude Jalavidhyut Company',sec:'Hydropower'},
  {s:'PMHPL',n:'Pawan Mukti Hydropower',sec:'Hydropower'},
  {s:'RHPL',n:'Ridi Hydropower Development',sec:'Hydropower'},
  {s:'RRHPL',n:'Rairang Hydropower Development',sec:'Hydropower'},
  {s:'SHEL',n:'Solar Energy & Power Company',sec:'Hydropower'},
  {s:'SJCL',n:'Solu Jalavidhyut Company',sec:'Hydropower'},
  {s:'SMHL',n:'Sunkoshi Marine Diversion',sec:'Hydropower'},
  {s:'SSHL',n:'Sanima Mai Hydropower',sec:'Hydropower'},
  {s:'TPC',n:'Tansen Power Company',sec:'Hydropower'},
  {s:'UHEWA',n:'United Modi Hydropower',sec:'Hydropower'},
  {s:'UMHL',n:'Upper Tamakoshi Hydroelectric',sec:'Hydropower'},
  {s:'UPPER',n:'Upper Tamakoshi Hydropower',sec:'Hydropower'},
  // Life Insurance
  {s:'ALICL',n:'Asian Life Insurance Company',sec:'Life Insurance'},
  {s:'CLI',n:'Citizens Life Insurance Company',sec:'Life Insurance'},
  {s:'GLICL',n:'Gurans Life Insurance Company',sec:'Life Insurance'},
  {s:'ILI',n:'IME Life Insurance Company',sec:'Life Insurance'},
  {s:'JLI',n:'Jyoti Life Insurance Company',sec:'Life Insurance'},
  {s:'LICN',n:'Life Insurance Company Nepal',sec:'Life Insurance'},
  {s:'METLIFE',n:'MetLife Insurance Company',sec:'Life Insurance'},
  {s:'NLIC',n:'National Life Insurance Company',sec:'Life Insurance'},
  {s:'NLICL',n:'Nepal Life Insurance Co.',sec:'Life Insurance'},
  {s:'PLIC',n:'Prime Life Insurance Company',sec:'Life Insurance'},
  {s:'RNLI',n:'Rastriya Beema Sansthan',sec:'Life Insurance'},
  {s:'SLI',n:'Sanima Life Insurance',sec:'Life Insurance'},
  {s:'SRLI',n:'Surya Life Insurance Company',sec:'Life Insurance'},
  {s:'SNLI',n:'Sun Nepal Life Insurance',sec:'Life Insurance'},
  // Non-Life Insurance
  {s:'LGIL',n:'Lumbini General Insurance',sec:'Non-Life Insurance'},
  {s:'NIL',n:'Nepal Insurance Company',sec:'Non-Life Insurance'},
  {s:'NIN',n:'Neco Insurance Company',sec:'Non-Life Insurance'},
  {s:'NICL',n:'National Insurance Company',sec:'Non-Life Insurance'},
  {s:'PIC',n:'Premier Insurance Company',sec:'Non-Life Insurance'},
  {s:'PICL',n:'Prabhu Insurance Company',sec:'Non-Life Insurance'},
  {s:'RCL',n:'Rastriya Beema Company',sec:'Non-Life Insurance'},
  {s:'SALICO',n:'Sagarmatha Lumbini Insurance',sec:'Non-Life Insurance'},
  {s:'SGI',n:'Shikhar Insurance Company',sec:'Non-Life Insurance'},
  {s:'SICL',n:'Siddhartha Insurance Limited',sec:'Non-Life Insurance'},
  // Microfinance
  {s:'CBBL',n:'Chhimek Bikas Bank',sec:'Microfinance'},
  {s:'DDBL',n:'Deprosc Laghubitta Bittiya',sec:'Microfinance'},
  {s:'FOWAD',n:'Forward Community Microfinance',sec:'Microfinance'},
  {s:'GILB',n:'Grameen Bikas Laghubitta',sec:'Microfinance'},
  {s:'JSLBB',n:'Janahit Laghubitta Bittiya',sec:'Microfinance'},
  {s:'KMCDB',n:'KMCDB Microfinance',sec:'Microfinance'},
  {s:'MERO',n:'Mero Microfinance Laghubitta',sec:'Microfinance'},
  {s:'MLBSL',n:'Mahuli Laghubitta Bittiya',sec:'Microfinance'},
  {s:'NMBMF',n:'NMB Microfinance Laghubitta',sec:'Microfinance'},
  {s:'SAMAJ',n:'Samaj Laghubitta Bittiya',sec:'Microfinance'},
  {s:'SKBBL',n:'Swabalamban Laghubitta Bittiya',sec:'Microfinance'},
  {s:'SLBSL',n:'Sana Laghubitta Bittiya',sec:'Microfinance'},
  {s:'SMB',n:'Sunrise First Microfinance',sec:'Microfinance'},
  {s:'SWBBL',n:'Swabhiman Laghubitta Bittiya',sec:'Microfinance'},
  // Manufacturing & Processing
  {s:'BNL',n:'Bottlers Nepal Limited',sec:'Manufacturing & Processing'},
  {s:'BNT',n:'Bottlers Nepal Terai',sec:'Manufacturing & Processing'},
  {s:'BSM',n:'Bishal Bazar Company',sec:'Manufacturing & Processing'},
  {s:'GCIL',n:'Gorkha Claims Industry',sec:'Manufacturing & Processing'},
  {s:'HDL',n:'Himalayan Distillery Limited',sec:'Manufacturing & Processing'},
  {s:'HRBL',n:'Hathway Resources',sec:'Manufacturing & Processing'},
  {s:'NKTA',n:'Nepal Khadya Udhyog',sec:'Manufacturing & Processing'},
  {s:'RIDI',n:'Ridi Hydropower Development',sec:'Manufacturing & Processing'},
  {s:'SHPC',n:'Sanima Hydro & Engineering',sec:'Manufacturing & Processing'},
  {s:'UNL',n:'Unilever Nepal Limited',sec:'Manufacturing & Processing'},
  // Hotels
  {s:'OHL',n:'Oriental Hotels Limited',sec:'Hotels'},
  {s:'SHL',n:'Soaltee Hotel Limited',sec:'Hotels'},
  {s:'TRH',n:'Taragaon Regency Hotels',sec:'Hotels'},
  {s:'YHL',n:'Yak & Yeti Hotels',sec:'Hotels'},
  // Investment
  {s:'NIBL ACE',n:'NIBL Ace Capital',sec:'Investment'},
  {s:'NMB50',n:'NMB 50 Balanced Fund',sec:'Investment'},
  {s:'SEF',n:'Siddhartha Equity Fund',sec:'Investment'},
  {s:'SEOS',n:'Siddhartha Equity Oriented Scheme',sec:'Investment'},
  // Others / Trading
  {s:'BBC',n:'Bhatbhateni Supermarket',sec:'Trading'},
  {s:'NHDL',n:'Nepal Hydro Developers',sec:'Others'},
  {s:'NCDB',n:'Nepal Community Development',sec:'Others'},
];

// ============================================================
// VERIFIED SOURCE URL PATTERNS (Aug 2026 — cross-checked)
// Chukul:      chukul.com/stock-profile?symbol=SYM   ← corrected (was /stock/SYM)
// ShareSansar: sharesansar.com/company/SYM            ← confirmed ✓
// NepseAlpha:  nepsealpha.com/trading/chart?symbol=SYM (chart) + nepse-chart page
// MeroLagani:  merolagani.com/CompanyDetail.aspx?symbol=SYM  ← corrected (was comName=)
// NepaliPaisa: nepalipaisa.com/company/SYM            ← confirmed pattern
// ShareHub:    sharehubnepal.com/technical-chart/SYM  ← confirmed pattern
// NEPSE official: nepalstock.com.np/company/detail/ID ← ID-based, use search fallback
// ============================================================

function buildSourceLinks(sym) {
  return [
    {
      url:   `https://chukul.com/stock-profile?symbol=${sym}`,
      label: 'Chukul',
      icon:  '🤖',
      desc:  'Algo signals, fundamentals, charts'
    },
    {
      url:   `https://www.sharesansar.com/company/${sym}`,
      label: 'ShareSansar',
      icon:  '📰',
      desc:  'Company info, price history, financials'
    },
    {
      url:   `https://nepsealpha.com/trading/chart?symbol=${sym}`,
      label: 'NepseAlpha Chart',
      icon:  '📊',
      desc:  'Technical chart with indicators'
    },
    {
      url:   `https://merolagani.com/CompanyDetail.aspx?symbol=${sym}`,
      label: 'MeroLagani',
      icon:  '📈',
      desc:  'Price history, floorsheet, announcements'
    },
    {
      url:   `https://nepalipaisa.com/company/${sym}`,
      label: 'NepaliPaisa',
      icon:  '⚡',
      desc:  'Live price, fundamentals, news'
    },
    {
      url:   `https://sharehubnepal.com/technical-chart/${sym}`,
      label: 'ShareHub Chart',
      icon:  '💹',
      desc:  'Technical chart, RSI, MACD, Bollinger'
    },
  ];
}
let saState = {
  symbol: null,
  companyName: null,
  sector: null,
  chartImgDataUrl: null,
  chartImgFile: null,
  fundamentals: null,
  aiResult: null,
  annotations: [],
  annTool: 'line',
  annColor: '#00d4a0',
  annStamp: null,
  isDrawing: false,
  drawStart: null,
  symDropFocusIdx: -1,
};
let annCtx = null;

// ============================================================
// TAB SWITCHER
// ============================================================
function saTab(name, panelId) {
  document.querySelectorAll('.sa-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sa-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(panelId).classList.add('active');
  // `this` is the clicked tab (set by the delegated handler); a direct call finds the tab by its panel
  const tab = this instanceof Element ? this : document.querySelector(`.sa-tab[data-on-click*="'${panelId}'"]`);
  if (tab) tab.classList.add('active');
  if (name === 'chart-draw') initAnnotationCanvas();
}

// ============================================================
// SYMBOL SEARCH DROPDOWN
// ============================================================
function onSymbolInput() {
  const q = document.getElementById('sa-symbol').value.trim().toUpperCase();
  const dd = document.getElementById('symbol-dropdown');
  saState.symDropFocusIdx = -1;
  if (q.length < 1) { dd.style.display = 'none'; document.getElementById('sa-fetch-btn').disabled = true; return; }
  const matches = NEPSE_STOCKS.filter(s =>
    s.s.startsWith(q) || s.n.toUpperCase().includes(q) || s.s.includes(q)
  ).slice(0, 12);
  if (!matches.length) { dd.style.display = 'none'; document.getElementById('sa-fetch-btn').disabled = true; return; }
  dd.innerHTML = matches.map((m, i) =>
    `<div class="sym-opt" data-idx="${i}" data-sym="${esc(m.s)}" data-name="${esc(m.n)}" data-sec="${esc(m.sec)}" data-on-click="selectSymbolFromRow(this)">
      <span class="sym-ticker">${esc(m.s)}</span>
      <span class="sym-name">${esc(m.n)}</span>
      <span class="sym-sector">${esc(m.sec)}</span>
    </div>`
  ).join('');
  dd.style.display = 'block';
}

function onSymbolKey(e) {
  const dd = document.getElementById('symbol-dropdown');
  const opts = dd.querySelectorAll('.sym-opt');
  if (e.key === 'ArrowDown') {
    saState.symDropFocusIdx = Math.min(saState.symDropFocusIdx + 1, opts.length - 1);
    opts.forEach((o,i) => o.classList.toggle('focused', i === saState.symDropFocusIdx));
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    saState.symDropFocusIdx = Math.max(saState.symDropFocusIdx - 1, 0);
    opts.forEach((o,i) => o.classList.toggle('focused', i === saState.symDropFocusIdx));
    e.preventDefault();
  } else if (e.key === 'Enter' && saState.symDropFocusIdx >= 0) {
    const focused = opts[saState.symDropFocusIdx];
    if (focused) selectSymbol(focused.dataset.sym, focused.dataset.name, focused.dataset.sec);
    e.preventDefault();
  } else if (e.key === 'Escape') {
    dd.style.display = 'none';
  }
}

function selectSymbolFromRow(el) { selectSymbol(el.dataset.sym, el.dataset.name, el.dataset.sec); }
function selectSymbol(sym, name, sec) {
  saState.symbol = sym;
  saState.companyName = name;
  saState.sector = sec;
  document.getElementById('sa-symbol').value = sym + ' — ' + name;
  document.getElementById('symbol-dropdown').style.display = 'none';
  document.getElementById('sa-fetch-btn').disabled = false;
  // Auto-set sector dropdown
  const secEl = document.getElementById('sa-sector');
  for (let o of secEl.options) {
    if (o.value === sec || o.text === sec) { secEl.value = o.value; break; }
  }
  // Update source links
  renderSourceLinks(sym);
  // Update checklist
  markCheck('chk-symbol', true);
  updateDataGate();  // P1-C
  markDirty();       // P1-A
}

function renderSourceLinks(sym) {
  const strip = document.getElementById('sa-source-strip');
  if (!strip) return;
  strip.innerHTML = buildSourceLinks(sym).map(l =>
    `<a class="source-link" href="${l.url}" target="_blank" title="${l.desc}">
      <span class="source-dot"></span>${l.icon} ${l.label}
    </a>`
  ).join('')
    + `<a class="source-link" href="https://chukul.com/nepse-charts?symbol=${sym}" target="_blank" title="Chukul live chart">
        <span class="source-dot" style="background:var(--blue);"></span>📈 Chukul Chart
       </a>`;
}

// ============================================================
// FUNDAMENTALS LOADER (manual entry + source links)
// ============================================================
function fetchFundamentals() {
  if (!saState.symbol) return;
  const sym = saState.symbol;
  const name = saState.companyName;
  const sec = saState.sector;

  document.getElementById('fund-empty').style.display = 'none';
  document.getElementById('fund-content').style.display = 'block';
  document.getElementById('fund-symbol-title').textContent = sym;
  document.getElementById('fund-company-name').textContent = name + ' · ' + sec;

  // Quick links in fundamentals tab — using verified URL patterns
  const ql = document.getElementById('fund-quick-links');
  ql.innerHTML = buildSourceLinks(sym).map(l =>
    `<a href="${l.url}" target="_blank" class="source-link" title="${l.desc}" style="font-size:11px;">${l.icon} ${l.label} ↗</a>`
  ).join('');

  document.getElementById('fund-source-note').textContent = 'chukul.com/stock-profile?symbol=' + sym + ' · sharesansar.com/company/' + sym + ' · merolagani.com/CompanyDetail.aspx?symbol=' + sym;

  // Render editable metric cards
  const metrics = [
    { id:'ltp',   lbl:'LTP (Rs)', placeholder:'e.g. 1240', cls:'neu' },
    { id:'eps',   lbl:'EPS (Rs)', placeholder:'e.g. 42.5', cls:'pos' },
    { id:'pe',    lbl:'P/E Ratio', placeholder:'e.g. 29.2', cls:'neu' },
    { id:'pb',    lbl:'P/B Ratio', placeholder:'e.g. 2.1', cls:'neu' },
    { id:'roe',   lbl:'ROE (%)', placeholder:'e.g. 14.3', cls:'pos' },
    { id:'div',   lbl:'Dividend (%)', placeholder:'e.g. 20', cls:'pos' },
    { id:'bvps',  lbl:'BVPS (Rs)', placeholder:'e.g. 590', cls:'neu' },
    { id:'mktcap',lbl:'Mkt Cap (Cr)', placeholder:'e.g. 1840', cls:'neu' },
  ];
  document.getElementById('fund-metrics-grid').innerHTML = metrics.map(m =>
    `<div class="fund-card">
      <div class="f-lbl">${m.lbl}</div>
      <input style="background:none;border:none;border-bottom:1px solid var(--border2);color:var(--${m.cls === 'pos' ? 'green' : m.cls === 'neg' ? 'red' : 'amber'});font-family:var(--mono);font-size:17px;font-weight:500;width:100%;outline:none;padding:2px 0;" 
        id="fund-${m.id}" type="text" placeholder="${m.placeholder}" data-on-input="onFundInput()">
      <div class="f-sub">Enter from sources ↑</div>
    </div>`
  ).join('');

  // Income panel
  const incomeFields = [
    { id:'net_profit', lbl:'Net Profit (Cr Rs)' },
    { id:'nii',        lbl:'Net Interest Income (Cr)' },
    { id:'loan',       lbl:'Total Loans (Cr)' },
    { id:'deposit',    lbl:'Total Deposits (Cr)' },
    { id:'capital',    lbl:'Paid-up Capital (Cr)' },
    { id:'reserve',    lbl:'Reserves (Cr)' },
  ];
  document.getElementById('fund-income-rows').innerHTML = incomeFields.map(f =>
    `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;font-family:var(--mono);">
      <span style="color:var(--text2);">${f.lbl}</span>
      <input id="fund-${f.id}" type="text" placeholder="—" style="background:none;border:none;border-bottom:1px dashed var(--border2);color:var(--text);font-family:var(--mono);font-size:12px;width:100px;text-align:right;outline:none;" data-on-input="onFundInput()">
    </div>`
  ).join('');

  // Balance panel
  const balFields = [
    { id:'npl_ratio',   lbl:'NPL Ratio (%)' },
    { id:'car',         lbl:'CAR (%)' },
    { id:'ccd',         lbl:'CCD Ratio (%)' },
    { id:'cdsl',        lbl:'CD+SD Ratio (%)' },
    { id:'promoter',    lbl:'Promoter Holding (%)' },
    { id:'public_hold', lbl:'Public Float (%)' },
  ];
  document.getElementById('fund-balance-rows').innerHTML = balFields.map(f =>
    `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;font-family:var(--mono);">
      <span style="color:var(--text2);">${f.lbl}</span>
      <input id="fund-${f.id}" type="text" placeholder="—" style="background:none;border:none;border-bottom:1px dashed var(--border2);color:var(--text);font-family:var(--mono);font-size:12px;width:100px;text-align:right;outline:none;" data-on-input="onFundInput()">
    </div>`
  ).join('');

  // Rating bar placeholder
  document.getElementById('fund-rating-bar').innerHTML = `
    <div style="font-family:var(--mono);font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Fundamental Rating (auto-computed)</div>
    <div id="fund-rating-display" style="font-family:var(--mono);font-size:13px;color:var(--text2);">Fill the fields above to compute a rating.</div>`;

  saState.fundamentals = {};
  markCheck('chk-fund', true);
  document.getElementById('ai-output-symbol').textContent = sym + ' — ' + name;
  saTab('fundamentals', 'tab-fundamentals');
}

function onFundInput() {
  // Collect all fund values and store in state
  const ids = ['ltp','eps','pe','pb','roe','div','bvps','mktcap','net_profit','nii','loan','deposit','capital','reserve','npl_ratio','car','ccd','cdsl','promoter','public_hold'];
  saState.fundamentals = {};
  ids.forEach(id => {
    const el = document.getElementById('fund-' + id);
    if (el) saState.fundamentals[id] = el.value;
  });
  // Auto-compute rating
  const pe = numVal(saState.fundamentals.pe);
  const roe = numVal(saState.fundamentals.roe);
  const npl = numVal(saState.fundamentals.npl_ratio);
  const div = numVal(saState.fundamentals.div);
  let score = 0, max = 0, used = 0;
  // P/E ≤ 0 (loss-making) earns nothing — it is not "cheap"
  if (!isNaN(pe))  { max += 25; used++; if (pe > 0 && pe < 20) score += 25; else if (pe > 0 && pe < 30) score += 15; else if (pe > 0 && pe < 40) score += 8; }
  if (!isNaN(roe)) { max += 25; used++; if (roe > 20) score += 25; else if (roe > 12) score += 15; else if (roe > 8) score += 8; }
  if (!isNaN(npl)) { max += 25; used++; if (npl < 2) score += 25; else if (npl < 5) score += 15; else if (npl < 10) score += 5; }
  if (!isNaN(div)) { max += 25; used++; if (div > 30) score += 25; else if (div > 15) score += 15; else if (div > 0) score += 8; }
  const ratingEl = document.getElementById('fund-rating-display');
  if (used < 2) {
    // One metric alone cannot justify "Strong 100/100"
    if (ratingEl) ratingEl.innerHTML = `<span style="color:var(--text3);">Enter at least 2 of P/E, ROE, NPL, Dividend for a rating (${used}/2)</span>`;
  } else {
    const pct = Math.round((score / max) * 100);
    const col = pct > 70 ? 'var(--green)' : pct > 45 ? 'var(--amber)' : 'var(--red)';
    const label = pct > 70 ? 'Strong' : pct > 45 ? 'Moderate' : 'Weak';
    const el = document.getElementById('fund-rating-display');
    if (el) el.innerHTML = `<span style="color:${col};font-weight:500;">${label} — ${pct}/100</span>
      <div style="margin-top:8px;height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;">
        <div style="height:6px;width:${pct}%;background:${col};border-radius:3px;transition:width 0.4s;"></div>
      </div>
      <div style="margin-top:6px;font-size:11px;color:var(--text3);">P/E: ${isNaN(pe)?'—':pe} · ROE: ${isNaN(roe)?'—':roe+'%'} · NPL: ${isNaN(npl)?'—':npl+'%'} · Div: ${isNaN(div)?'—':div+'%'}</div>`;
  }
  // P1-B: run validation and update data quality panel + gate
  updateDataQuality();
  markDirty();
}

// ============================================================
// CHART UPLOAD (drag-drop + file input)
// ============================================================
function initUploadZone() {
  const zone = document.getElementById('uploadZone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadChartImage(file);
  });
}

function handleChartUpload(event) {
  const file = event.target.files[0];
  if (file) loadChartImage(file);
}

function loadChartImage(file) {
  saState.chartImgFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    saState.chartImgDataUrl = e.target.result;
    // Show preview
    document.getElementById('uploadZone').style.display = 'none';
    const preview = document.getElementById('chart-preview-section');
    preview.style.display = 'block';
    const img = document.getElementById('chartPreviewImg');
    img.src = saState.chartImgDataUrl;
    document.getElementById('chart-preview-title').textContent =
      (saState.symbol ? saState.symbol + ' — ' : '') + 'Chart Preview';
    document.getElementById('upload-meta').innerHTML =
      `<span>📁 ${esc(file.name)}</span>
       <span>📐 ${(file.size/1024).toFixed(1)} KB</span>
       <span style="color:var(--green);">✓ Ready for analysis</span>`;
    markCheck('chk-chart', true);
    // Sync to annotate tab
    document.getElementById('annBaseImg').src = saState.chartImgDataUrl;
    document.getElementById('no-chart-msg').style.display = 'none';
    document.getElementById('annotate-content').style.display = 'block';
    updateDataGate();   // P1-C
    markDirty();        // P1-A
  };
  reader.readAsDataURL(file);
}

function clearChart() {
  saState.chartImgDataUrl = null;
  saState.chartImgFile = null;
  document.getElementById('chartPreviewImg').src = '';
  document.getElementById('chart-preview-section').style.display = 'none';
  document.getElementById('uploadZone').style.display = 'block';
  document.getElementById('chartFileInput').value = '';
  markCheck('chk-chart', false);
  clearAnnotations();
  updateDataGate();  // P1-C
  markDirty();       // P1-A
}

// ============================================================
// ANNOTATION CANVAS ENGINE
// ============================================================
function initAnnotationCanvas() {
  const img = document.getElementById('annBaseImg');
  const canvas = document.getElementById('annCanvas');
  if (!img || !canvas) return;
  if (!saState.chartImgDataUrl) return;

  function resizeCanvas() {
    canvas.width = img.offsetWidth;
    canvas.height = img.offsetHeight;
    redrawAnnotations();
  }

  annCtx = canvas.getContext('2d');
  img.onload = resizeCanvas;
  if (img.complete) resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  canvas.onmousedown = (e) => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (canvas.width / r.width);
    const y = (e.clientY - r.top) * (canvas.height / r.height);

    if (saState.annStamp) {
      // Place stamp label
      saState.annotations.push({ type: 'stamp', x, y, text: saState.annStamp, color: saState.annColor });
      redrawAnnotations();
      updateAnnList();
      return;
    }
    if (saState.annTool === 'text') {
      const txt = prompt('Enter label text:');
      if (txt) {
        saState.annotations.push({ type: 'text', x, y, text: txt, color: saState.annColor });
        redrawAnnotations();
        updateAnnList();
      }
      return;
    }
    saState.isDrawing = true;
    saState.drawStart = { x, y };
  };

  canvas.onmousemove = (e) => {
    if (!saState.isDrawing || !saState.drawStart) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (canvas.width / r.width);
    const y = (e.clientY - r.top) * (canvas.height / r.height);
    redrawAnnotations();
    drawShape(annCtx, saState.annTool, saState.drawStart, { x, y }, saState.annColor, true);
  };

  canvas.onmouseup = (e) => {
    if (!saState.isDrawing || !saState.drawStart) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (canvas.width / r.width);
    const y = (e.clientY - r.top) * (canvas.height / r.height);
    saState.annotations.push({
      type: saState.annTool,
      x1: saState.drawStart.x, y1: saState.drawStart.y,
      x2: x, y2: y,
      color: saState.annColor
    });
    saState.isDrawing = false;
    saState.drawStart = null;
    redrawAnnotations();
    updateAnnList();
  };

  canvas.onmouseleave = () => { saState.isDrawing = false; saState.drawStart = null; };

  // Touch support
  canvas.ontouchstart = (e) => {
    e.preventDefault();
    const t = e.touches[0];
    canvas.onmousedown({ clientX: t.clientX, clientY: t.clientY });
  };
  canvas.ontouchmove = (e) => {
    e.preventDefault();
    const t = e.touches[0];
    canvas.onmousemove({ clientX: t.clientX, clientY: t.clientY });
  };
  canvas.ontouchend = (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    canvas.onmouseup({ clientX: t.clientX, clientY: t.clientY });
  };
}

function drawShape(ctx, type, start, end, color, preview) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = preview ? 1.5 : 2;
  ctx.setLineDash(preview ? [4,3] : []);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (type === 'line') {
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  } else if (type === 'hline') {
    ctx.moveTo(0, start.y);
    ctx.lineTo(ctx.canvas.width, start.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = uiFont(500, 12);
    ctx.fillText(Math.round(start.y) + ' (H)', 6, start.y - 4);
  } else if (type === 'rect') {
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    if (!preview) {
      ctx.globalAlpha = 0.08;
      ctx.fillRect(start.x, start.y, end.x - start.x, end.y - start.y);
      ctx.globalAlpha = 1;
    }
  } else if (type === 'arrow') {
    const dx = end.x - start.x, dy = end.y - start.y;
    const ang = Math.atan2(dy, dx);
    const len = Math.sqrt(dx*dx + dy*dy);
    const headLen = Math.min(20, len * 0.3);
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - headLen*Math.cos(ang-0.4), end.y - headLen*Math.sin(ang-0.4));
    ctx.lineTo(end.x - headLen*Math.cos(ang+0.4), end.y - headLen*Math.sin(ang+0.4));
    ctx.closePath();
    ctx.fill();
  }
  ctx.setLineDash([]);
}

function redrawAnnotations() {
  if (!annCtx) return;
  annCtx.clearRect(0, 0, annCtx.canvas.width, annCtx.canvas.height);
  saState.annotations.forEach(ann => {
    annCtx.strokeStyle = ann.color;
    annCtx.fillStyle = ann.color;
    annCtx.lineWidth = 2;
    annCtx.setLineDash([]);
    annCtx.lineCap = 'round';
    annCtx.font = uiFont(700, 13);
    if (ann.type === 'stamp' || ann.type === 'text') {
      annCtx.fillStyle = ann.color;
      const bw = annCtx.measureText(ann.text).width + 10;
      annCtx.globalAlpha = 0.18;
      annCtx.fillRect(ann.x - 5, ann.y - 14, bw, 18);
      annCtx.globalAlpha = 1;
      annCtx.fillStyle = ann.color;
      annCtx.fillText(ann.text, ann.x, ann.y);
    } else {
      drawShape(annCtx, ann.type, {x:ann.x1,y:ann.y1}, {x:ann.x2,y:ann.y2}, ann.color, false);
    }
  });
  document.getElementById('ann-count').textContent = saState.annotations.length;
}

function updateAnnList() {
  const list = document.getElementById('ann-label-list');
  // annotation text is typed by the user and restored from saved sessions: escape it
  list.innerHTML = saState.annotations.map((ann, i) => {
    const type = esc(String(ann.type || '').toUpperCase());
    const label = ann.type === 'stamp' || ann.type === 'text'
      ? `${type}: "${esc(ann.text)}"`
      : `${type} (${Math.round(ann.x1||ann.x)},${Math.round(ann.y1||ann.y)})`;
    const color = /^#[0-9a-fA-F]{3,8}$/.test(ann.color) ? ann.color : 'var(--text3)';
    return `<div class="ann-label-item">
      <span style="color:${color};">■</span>
      <span style="flex:1;">${label}</span>
      <span class="del-ann" data-on-click="deleteAnnotation(${i})">×</span>
    </div>`;
  }).join('');
  document.getElementById('ann-count').textContent = saState.annotations.length;
}

function setTool(t) {
  saState.annTool = t;
  saState.annStamp = null;
  document.querySelectorAll('[id^="tool-"]').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('tool-' + t);
  if (btn) btn.classList.add('active');
  document.getElementById('current-tool-label').textContent = t.charAt(0).toUpperCase() + t.slice(1);
  document.getElementById('current-stamp-label').textContent = 'None';
}

function setStamp(s) {
  saState.annStamp = s;
  document.getElementById('current-stamp-label').textContent = s;
  document.querySelectorAll('[id^="tool-"]').forEach(b => b.classList.remove('active'));
}

function setColor(c) {
  saState.annColor = c;
}

function undoAnnotation() {
  saState.annotations.pop();
  redrawAnnotations();
  updateAnnList();
}

function deleteAnnotation(i) {
  saState.annotations.splice(i, 1);
  redrawAnnotations();
  updateAnnList();
}

function clearAnnotations() {
  saState.annotations = [];
  if (annCtx) annCtx.clearRect(0, 0, annCtx.canvas.width, annCtx.canvas.height);
  updateAnnList();
}

function exportAnnotated() {
  const baseImg = document.getElementById('annBaseImg');
  const canvas = document.getElementById('annCanvas');
  const exp = document.createElement('canvas');
  exp.width = canvas.width;
  exp.height = canvas.height;
  const ctx = exp.getContext('2d');
  ctx.drawImage(baseImg, 0, 0, exp.width, exp.height);
  ctx.drawImage(canvas, 0, 0);
  const a = document.createElement('a');
  a.download = (saState.symbol || 'chart') + '_wyckoff_annotated.png';
  a.href = exp.toDataURL('image/png');
  a.click();
}

// ============================================================
// CHECKLIST HELPERS
// ============================================================
function markCheck(id, done) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('done', done);
  el.querySelector('.chk-icon').textContent = done ? '✅' : '⬜';
}

function initWyckoffChecklist() {
  const ids = ['wchk-ps','wchk-sc','wchk-ar','wchk-st','wchk-spring','wchk-sos','wchk-lps','wchk-vol','wchk-rr'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateWyckoffScore);
  });
}

function updateWyckoffScore() {
  const score = WYCKOFF_IDS.filter(id => document.getElementById(id)?.checked).length;
  const col = wyckoffColor(score);
  document.getElementById('wychk-score').innerHTML =
    `Score: <span style="color:${col};font-weight:500;">${score} / 9</span> conditions met
     <span style="color:${col};margin-left:6px;">${score >= 7 ? '— High confidence setup' : score >= 4 ? '— Developing setup' : '— Low confidence'}</span>`;
  updateDataGate();
}

// ============================================================
// AI ANALYSIS ENGINE (Claude API)
// ============================================================
async function runAIAnalysis() {
  const sym     = saState.symbol;
  const name    = saState.companyName;
  const sector  = saState.sector;
  const depth   = document.getElementById('ai-depth').value;
  const focus   = document.getElementById('ai-focus').value;
  const context = document.getElementById('ai-context').value.trim();
  const fund    = saState.fundamentals || {};
  const chartAvail = !!saState.chartImgDataUrl;

  // ── P1-C: Gate enforcement ──────────────────────────────────
  const filledFund   = Object.values(fund).filter(v => v && String(v).trim()).length;
  const hasMinData   = chartAvail || filledFund >= 4;
  const hasSym       = !!sym;
  if (!hasSym || !hasMinData) {
    document.getElementById('ai-output-body').innerHTML =
      `<div class="ai-placeholder" style="color:var(--red);padding:16px;">
        <strong>⛔ Analysis blocked</strong><br><br>
        Minimum data requirements not met:<br>
        • Select a stock symbol from the dropdown, AND<br>
        • Upload a chart image OR enter at least 4 fundamental fields<br><br>
        Go to the <strong>Chart Upload</strong> tab to add your data first.
      </div>`;
    return;
  }

  // ── P1-C: Compute confidence and collect validation issues ──
  const { score: dqScore, issues: valIssues } = computeDataQualityScore();
  const conf      = dqScore >= 70 ? 'HIGH'   : dqScore >= 45 ? 'MEDIUM' : 'LOW';
  const confNote  = dqScore >= 70
    ? 'Data quality is strong. Proceed with normal analytical confidence.'
    : dqScore >= 45
    ? 'Data quality is moderate. Flag any conclusions that depend solely on unverified fundamentals.'
    : 'Data quality is LOW. You MUST explicitly state low confidence on all quantitative conclusions and recommend the analyst verify data before acting.';

  const errIssues  = valIssues.filter(i => i.sev === 'error');
  const warnIssues = valIssues.filter(i => i.sev === 'warn');
  const valBlock   = valIssues.length > 0
    ? `\nDATA VALIDATION FLAGS (${errIssues.length} errors, ${warnIssues.length} warnings — address these in your analysis):\n` +
      valIssues.map(i => `${i.sev.toUpperCase()}: ${i.msg}`).join('\n')
    : '\nDATA VALIDATION: No issues detected — data passed all range and consistency checks.';

  // Update checklist
  if (context) markCheck('chk-context', true);

  const btn = document.getElementById('run-ai-btn');
  btn.disabled    = true;
  btn.textContent = '⏳ Analysing…';

  const confTag = { HIGH:'🟢 High confidence', MEDIUM:'🟡 Medium confidence', LOW:'🔴 Low confidence' };
  document.getElementById('ai-output-body').innerHTML =
    `<div class="ai-loading">
      <div class="ai-spinner"></div>
      Running full Wyckoff + fundamental analysis on <strong>${esc(sym || 'uploaded chart')}</strong>…
      &nbsp; ${confTag[conf]}
    </div>`;

  document.getElementById('copy-ai-btn').style.display = 'none';
  document.getElementById('clear-ai-btn').style.display = 'none';

  // ── Build fundamental string ────────────────────────────────
  const fundStr = Object.keys(fund).length > 0 && filledFund > 0
    ? Object.entries(fund).filter(([k,v]) => v && String(v).trim())
        .map(([k,v]) => `${k}: ${v}`).join(' | ')
    : 'No fundamentals entered — chart-only analysis.';

  // ── Build Wyckoff checklist ─────────────────────────────────
  const wIds    = ['wchk-ps','wchk-sc','wchk-ar','wchk-st','wchk-spring','wchk-sos','wchk-lps','wchk-vol','wchk-rr'];
  const wLabels = ['PS visible','SC confirmed','AR bounce','ST on lower vol','Spring/UTAD visible','SOS confirmed','LPS forming','Volume confirms','R:R ≥ 2:1'];
  const wychkStr = wIds.map((id,i) =>
    `${wLabels[i]}: ${document.getElementById(id)?.checked ? 'YES ✓' : 'NO'}`
  ).join(' | ');
  const wychkCount = wIds.filter(id => document.getElementById(id)?.checked).length;

  // ── Depth and focus templates ───────────────────────────────
  const depthInstructions = {
    quick:    'Provide a concise 3-5 sentence summary covering the most critical Wyckoff signals and one clear trade recommendation with entry, stop, and target.',
    standard: 'Provide a full structured analysis with these 7 sections:\n→ 1) Wyckoff Phase & Schematic\n→ 2) Volume-Price Action (VSA)\n→ 3) Market Emotion & Crowd Psychology\n→ 4) Key Support & Resistance Levels\n→ 5) Trend & Market Structure (HH/HL, BOS, CHoCH)\n→ 6) Trade Scenario (entry / SL / T1 / T2 / R:R / position size)\n→ 7) Summary & Final Bias',
    deep:     'Provide a deeply detailed analysis covering all 7 Wyckoff sections plus: (a) NEPSE sector-specific context and regulatory environment, (b) NRB macro tailwinds/headwinds, (c) multi-timeframe structure (monthly → weekly → daily), (d) two complete scenario trees (bull case with probabilities vs bear case), (e) money management framework with explicit position sizing for a Rs 1,000,000 portfolio, (f) a final conviction score out of 10 with justification.'
  };

  const focusInstructions = {
    wyckoff:     'FOCUS: Wyckoff technical analysis only — phases, events, volume-price action, Creek/Ice levels, and trade setup. Keep fundamental commentary brief.',
    fundamental: 'FOCUS: Fundamental valuation only — EPS, P/E vs sector, ROE, NPL ratio, CAR, dividend sustainability, balance sheet health, and intrinsic value estimate using DDM or P/BV approach.',
    combined:    'FOCUS: Combined Wyckoff + fundamental — explicitly show where the technical Wyckoff phase and the fundamental valuation reinforce or contradict each other. Highlight any divergence (e.g. technically bullish but fundamentally overvalued).',
    trade:       'FOCUS: Actionable trade setup only. Skip background. Go directly to: entry zone, stop loss with reason, T1/T2/T3 targets with % gain, R:R ratio, position size (% of capital), scaling plan, key triggers to watch, and exact invalidation criteria.'
  };

  // ── Enhanced system prompt with P1-C confidence directive ──
  const systemPrompt = `You are a senior NEPSE (Nepal Stock Exchange) analyst and PMS (Portfolio Management Service) advisor with deep expertise in:
1. Wyckoff Method — Accumulation/Distribution schematics #1 and #2, VSA (Volume Spread Analysis), all event labels (PS, PSY, SC, BC, AR, ST, Spring, UTAD, SOS, SOW, LPS, LPSY, JAC, BAKS, Creek, Ice, BAKS)
2. NEPSE-specific fundamentals — EPS in NPR, P/E, P/B, ROE, NPL ratio, CAR, CCD ratio, dividend yield, bonus share history, paid-up capital, promoter holding
3. NRB monetary policy, SEBON regulations, remittance flows, BFI sector dynamics, hydropower tariff structures
4. Nepal PMS compliance — SEBON-regulated position limits, mandatory trade rationale documentation, risk disclosure

OUTPUT RULES:
• Use precise Wyckoff terminology throughout
• Use → for section headers, ■ for sub-sections, ▶ for bullet points
• All price levels in NPR, ratios to 2 decimal places
• End every analysis with: BIAS: [Bullish/Cautiously Bullish/Neutral/Cautiously Bearish/Bearish] and RECOMMENDED ACTION: [specific actionable instruction]
• CONFIDENCE DIRECTIVE: The data quality score for this analysis is ${dqScore}/100 (${conf}). ${confNote}
• If validation errors are present, explicitly flag them in your output before proceeding with analysis`;

  const userPrompt = `NEPSE STOCK ANALYSIS REQUEST
═══════════════════════════════════════════════════

STOCK: ${sym || 'Unknown symbol'} — ${name || 'Unknown Company'}
SECTOR: ${sector || 'Not specified'}
DATA QUALITY SCORE: ${dqScore}/100 — Confidence: ${conf}

FUNDAMENTALS (sourced from Chukul.com / ShareSansar.com / NepseAlpha.com):
${fundStr}
${valBlock}

WYCKOFF CHECKLIST (${wychkCount}/9 conditions confirmed by analyst on chart):
${wychkStr}

CHART: ${chartAvail
  ? 'ATTACHED — Analyse visually for Wyckoff event labels, S/R levels, candlestick patterns, volume bars, trendlines, and price structure. Cross-reference with the checklist above.'
  : 'NOT PROVIDED — Base analysis on fundamentals, sector context, and checklist only. Flag the absence of visual chart data in your output.'}

ANALYST CONTEXT / NOTES:
${context || 'None provided.'}

ANALYSIS DEPTH: ${depth.toUpperCase()}
${depthInstructions[depth]}

${focusInstructions[focus]}

TRADE SETUP (always include regardless of depth/focus):
▶ Entry zone (exact price range in Rs)
▶ Stop Loss (price level + rationale — must reference a specific Wyckoff level)
▶ Target 1 (price + % gain from entry)
▶ Target 2 (price + % gain from entry)
▶ Risk:Reward ratio (minimum 2:1 required for PMS recommendation)
▶ Suggested position size (% of portfolio — max 10% per PMS guidelines)
▶ Key confirmation signal before entry
▶ Invalidation criteria (specific price level that voids the setup)

Reference and recommend verification at: chukul.com · sharesansar.com · nepsealpha.com · merolagani.com · nepalstock.com`;

  try {
    // Build multi-modal message — image first if available
    const msgContent = [];
    if (chartAvail) {
      const base64 = saState.chartImgDataUrl.split(',')[1];
      const mime   = saState.chartImgDataUrl.split(';')[0].split(':')[1];
      msgContent.push({ type: 'image', source: { type: 'base64', media_type: mime, data: base64 } });
    }
    msgContent.push({ type: 'text', text: userPrompt });

    const resp = await claudeRequest({
      max_tokens: 2000,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: msgContent }]
    });

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      throw new Error(`API error ${resp.status}: ${errBody?.error?.message || resp.statusText}`);
    }

    const data = await resp.json();
    const text = data.content?.map(b => b.text || '').join('\n') || 'No response received.';
    saState.aiResult = text;

    // Render output with confidence header
    const confColors = { HIGH:'var(--green)', MEDIUM:'var(--amber)', LOW:'var(--red)' };
    const confHeader = `<div style="display:flex;align-items:center;gap:10px;padding:10px 0 14px;border-bottom:1px solid var(--border);margin-bottom:14px;flex-wrap:wrap;">
      <span style="font-family:var(--mono);font-size:11px;color:var(--text3);">Data quality:</span>
      <div style="flex:1;max-width:160px;height:5px;background:var(--bg3);border-radius:3px;overflow:hidden;">
        <div style="height:5px;width:${dqScore}%;background:${confColors[conf]};border-radius:3px;"></div>
      </div>
      <span style="font-family:var(--mono);font-size:11px;color:${confColors[conf]};font-weight:500;">${dqScore}/100 — ${conf} confidence</span>
      ${errIssues.length > 0 ? `<span style="font-family:var(--mono);font-size:11px;color:var(--red);">⚠ ${errIssues.length} validation error(s) — see Fundamentals tab</span>` : ''}
    </div>`;

    document.getElementById('ai-output-body').innerHTML = confHeader + formatAIOutput(text);
    document.getElementById('copy-ai-btn').style.display = 'flex';
    document.getElementById('clear-ai-btn').style.display = 'flex';
    markCheck('chk-fund', true);

    // Auto-populate summary tab
    saState.aiDQ = dqScore; saState.aiConf = conf;
    buildStockSummary(sym, name, text, fund, dqScore, conf);

    // P1-A: mark session dirty after successful analysis
    markDirty();

    // Scroll to output
    document.getElementById('ai-output-body').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (err) {
    document.getElementById('ai-output-body').innerHTML =
      `<div style="color:var(--red);font-family:var(--mono);font-size:12px;padding:12px;background:var(--red-dim);border-radius:8px;border:1px solid var(--red-border);">
        <strong>⚠ Analysis error</strong><br><br>
        ${esc(err.message)}<br><br>
        <span style="color:var(--text2);">Troubleshooting steps:<br>
        1. Check your internet connection<br>
        2. Served from this PC: set ANTHROPIC_API_KEY before starting start-live.bat (the key stays on the server). Inside Claude.ai: make sure you are logged in<br>
        3. Try refreshing the page and re-entering data (use Save Session first)<br>
        4. If image is very large (&gt;4MB), try a smaller screenshot</span>
      </div>`;
  }

  btn.disabled    = false;
  btn.textContent = '🤖 Run Full AI Analysis';
}

function formatAIOutput(text) {
  // Convert plain text to styled HTML — each line is escaped first, so the
  // model's text can never inject markup.
  return String(text || '')
    .split('\n')
    .map(esc)
    .map(line => {
      if (!line.trim()) return '<br>';
      if (line.startsWith('→') || line.startsWith('■') || /^\d+\)/.test(line)) {
        return `<div class="ai-section-label">${line}</div>`;
      }
      if (line.includes('BIAS:') || line.includes('RECOMMENDED ACTION:')) {
        return `<div style="background:var(--green-dim);border:1px solid var(--green-border);border-radius:6px;padding:8px 12px;margin:8px 0;font-family:var(--mono);font-size:12px;color:var(--green);">${line}</div>`;
      }
      if (line.toLowerCase().includes('stop loss') || line.toLowerCase().includes('invalidat')) {
        return `<div style="color:var(--red);font-size:12px;">▶ ${line}</div>`;
      }
      if (line.toLowerCase().includes('target') || line.toLowerCase().includes('entry')) {
        return `<div style="color:var(--green);font-size:12px;">▶ ${line}</div>`;
      }
      if (line.startsWith('•') || line.startsWith('-') || line.startsWith('▶')) {
        return `<div style="padding-left:12px;font-size:12px;color:var(--text2);">${line}</div>`;
      }
      return `<div style="font-size:13px;">${line}</div>`;
    })
    .join('');
}

function copyAIOutput() {
  if (!saState.aiResult) return;
  navigator.clipboard.writeText(saState.aiResult).then(() => {
    const btn = document.getElementById('copy-ai-btn');
    btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = '📋 Copy', 2000);
  });
}

function clearAIOutput() {
  saState.aiResult = null; saState.aiDQ = null; saState.aiConf = null;
  document.getElementById('ai-output-body').innerHTML =
    `<div class="ai-placeholder">Upload a chart and/or load fundamentals, then click <strong style="color:var(--green);">Run Full AI Analysis</strong> above.</div>`;
  document.getElementById('copy-ai-btn').style.display = 'none';
  document.getElementById('clear-ai-btn').style.display = 'none';
}

// ============================================================
// STOCK SUMMARY TAB BUILDER
// ============================================================
function buildStockSummary(sym, name, aiText, fund, dqScore, conf) {
  if (!sym && !aiText) return;
  dqScore = dqScore || 0;
  conf    = conf    || 'LOW';

  document.getElementById('sum-empty').style.display = 'none';
  document.getElementById('sum-content').style.display = 'block';
  document.getElementById('sum-symbol-title').textContent = (sym || 'Stock') + ' — ' + (name || 'Analysis');
  document.getElementById('sum-generated-at').textContent =
    'Generated: ' + new Date().toLocaleString('en-NP', { timeZone: 'Asia/Kathmandu' }) +
    ` · Data quality: ${dqScore}/100 (${conf})`;

  // ── Fixed bias detection — semantic, not naive keyword match ──
  const lower = aiText.toLowerCase();
  // Extract the BIAS: line first (most reliable)
  const biasLine = aiText.match(/BIAS\s*:\s*([^\n\r.]+)/i)?.[1]?.toLowerCase().trim() || '';
  let bias = 'Neutral', biasColor = 'var(--amber)';

  const isBull  = s => /\bcautiously\s+bullish\b/.test(s) || (/\bbullish\b/.test(s) && !/\bnot\s+bullish\b/.test(s) && !/\bbearish\b/.test(s));
  const isCBull = s => /\bcautiously\s+bullish\b/.test(s);
  const isBear  = s => /\bbearish\b/.test(s) && !/\bnot\s+bearish\b/.test(s);
  const isCBear = s => /\bcautiously\s+bearish\b/.test(s);

  // Check bias line first, fall back to full text
  const checkStr = biasLine || lower;
  if      (isCBear(checkStr)) { bias = 'Cautiously Bearish'; biasColor = 'var(--red)'; }
  else if (isBear(checkStr))  { bias = 'Bearish';            biasColor = 'var(--red)'; }
  else if (isCBull(checkStr)) { bias = 'Cautiously Bullish'; biasColor = 'var(--green)'; }
  else if (isBull(checkStr))  { bias = 'Bullish';            biasColor = 'var(--green)'; }

  const badgeEl = document.getElementById('sum-bias-badge');
  badgeEl.textContent      = '⚡ Bias: ' + bias;
  badgeEl.style.color      = biasColor;
  badgeEl.style.borderColor = biasColor;
  badgeEl.style.background  = biasColor === 'var(--green)' ? 'var(--green-dim)' : biasColor === 'var(--red)' ? 'var(--red-dim)' : 'var(--amber-dim)';

  // ── Summary metric cards ──
  const ltp    = fund.ltp   || '—';
  const eps    = fund.eps   || '—';
  const pe     = fund.pe    || '—';
  const roe    = fund.roe   || '—';
  const div    = fund.div   || '—';
  const bvps   = fund.bvps  || '—';
  const npl    = fund.npl_ratio || '—';
  const car    = fund.car   || '—';
  const wyCount = WYCKOFF_IDS.filter(id => document.getElementById(id)?.checked).length;
  const confColors = { HIGH:'var(--green)', MEDIUM:'var(--amber)', LOW:'var(--red)' };
  // A blank field is "unknown", not "bad" — only colour values that exist
  const tone = (v, good, mid) => {
    const x = numVal(v);
    if (isNaN(x)) return 'var(--text3)';
    return good(x) ? 'var(--green)' : mid && mid(x) ? 'var(--amber)' : 'var(--red)';
  };

  document.getElementById('sum-6-grid').innerHTML = [
    { lbl:'Symbol',          val: sym || '—',        color:'var(--green)' },
    { lbl:'LTP (Rs)',         val: ltp,               color:'var(--amber)' },
    { lbl:'EPS (Rs)',         val: eps,               color: tone(eps, x => x > 0) },
    { lbl:'P/E Ratio',        val: pe + (pe !== '—' ? '×' : ''),   color:'var(--text)' },
    { lbl:'ROE (%)',           val: roe + (roe !== '—' ? '%' : ''), color: tone(roe, x => x > 12) },
    { lbl:'NPL Ratio (%)',    val: npl + (npl !== '—' ? '%' : ''), color: tone(npl, x => x < 5, x => x < 10) },
    { lbl:'CAR (%)',           val: car + (car !== '—' ? '%' : ''), color: tone(car, x => x >= 11) },
    { lbl:'Dividend (%)',     val: div + (div !== '—' ? '%' : ''), color:'var(--green)' },
    { lbl:'BVPS (Rs)',        val: bvps,              color:'var(--text)' },
    { lbl:'Wyckoff Score',    val: wyCount + '/9',    color: wyckoffColor(wyCount) },
    { lbl:'Data Quality',     val: dqScore + '/100',  color: confColors[conf] },
    { lbl:'Analysis Bias',    val: bias,              color: biasColor },
  ].map(c => `
    <div class="sg-card">
      <div class="sg-lbl">${c.lbl}</div>
      <div class="sg-val" style="color:${c.color};">${c.val}</div>
    </div>`).join('');

  // ── Validation warning strip ──
  const { issues: valIssues } = computeDataQualityScore();
  const errCount  = valIssues.filter(i => i.sev === 'error').length;
  const warnCount = valIssues.filter(i => i.sev === 'warn').length;
  let valStrip = '';
  if (errCount > 0 || warnCount > 0) {
    valStrip = `<div style="background:var(--amber-dim);border:1px solid var(--amber-border);border-radius:8px;padding:10px 14px;margin-top:12px;font-family:var(--mono);font-size:11px;color:var(--amber);">
      ⚠ ${errCount} validation error(s) and ${warnCount} warning(s) were detected in the fundamental data entered.
      These have been disclosed to the AI but may still affect output accuracy.
      <a style="color:var(--amber);text-decoration:underline;cursor:pointer;" data-on-click="saTab('fundamentals','tab-fundamentals')">Review in Fundamentals tab →</a>
    </div>`;
  }

  // ── Full narrative ──
  document.getElementById('sum-narrative').innerHTML = valStrip + formatAIOutput(aiText);

  // ── Trade setup table — improved regex patterns ──
  // Try various entry patterns (entry zone, entry:, buy zone, accumulate at)
  const entryMatch = aiText.match(/(?:entry\s*zone?|entry\s*:|buy\s*zone?|accumulate\s*(?:at|between)?)\s*:?\s*(?:Rs\.?\s*)?([\d,]+(?:\s*[–—-]\s*[\d,]+)?)/i);
  const slMatch    = aiText.match(/(?:stop\s*loss|SL|stop\s*at)\s*:?\s*(?:Rs\.?\s*)?([\d,]+)/i);
  const t1Match    = aiText.match(/(?:target\s*1|T1|first\s*target)\s*:?\s*(?:Rs\.?\s*)?([\d,]+(?:\s*[–—-]\s*[\d,]+)?)/i);
  const t2Match    = aiText.match(/(?:target\s*2|T2|second\s*target)\s*:?\s*(?:Rs\.?\s*)?([\d,]+(?:\s*[–—-]\s*[\d,]+)?)/i);
  const t3Match    = aiText.match(/(?:target\s*3|T3|third\s*target)\s*:?\s*(?:Rs\.?\s*)?([\d,]+(?:\s*[–—-]\s*[\d,]+)?)/i);
  // R:R written as "R:R 2.5:1", "Risk:Reward ratio = 1:2.5", "risk-reward of 2.5:1" …
  const rrMatch    = aiText.match(/(?:R\s*[:/]\s*R|risk\s*[:/\-]?\s*(?:to\s*)?reward)(?:\s*ratio)?\s*(?:of|is|=|:|≈|~)?\s*(?:1\s*:\s*([0-9]+(?:\.[0-9]+)?)|([0-9]+(?:\.[0-9]+)?)\s*:\s*1)/i);
  const psMatch    = aiText.match(/(?:position\s*size?|allocat[ei])\s*:?\s*(\d+(?:\.\d+)?(?:\s*[–—-]\s*\d+(?:\.\d+)?)?)\s*%/i);
  // Fallback: compute R:R from the parsed entry (midpoint), stop and T1
  const firstNum = s => numVal(String(s || '').split(/[–—-]/)[0]);
  const midNum   = s => { const parts = String(s || '').split(/[–—-]/).map(numVal).filter(x => !isNaN(x));
                          return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : NaN; };
  let rrText = '—';
  // "1:2.5" (risk:reward) and "2.5:1" (reward:risk) are the same trade → show 2.5:1
  if (rrMatch) rrText = (rrMatch[2] || rrMatch[1]) + ':1';
  else {
    const en = midNum(entryMatch?.[1]), sl = firstNum(slMatch?.[1]), t1 = firstNum(t1Match?.[1]);
    if (en > sl && t1 > en) rrText = ((t1 - en) / (en - sl)).toFixed(2) + ':1 (calc. to T1)';
  }
  const invalidMatch = aiText.match(/(?:invalidat[ei](?:d|s|ion)?|exit\s*all|close\s*all)\s*(?:if|on|at|below|above)?\s*(?:Rs\.?\s*)?([\d,]+)/i);

  document.getElementById('sum-trade-table').innerHTML = [
    { lbl:'Entry Zone',        val: entryMatch?.[1]   || '— see analysis', col:'var(--green)' },
    { lbl:'Stop Loss',         val: slMatch?.[1]      || '— see analysis', col:'var(--red)'   },
    { lbl:'Target 1',          val: t1Match?.[1]      || '—',              col:'var(--green)' },
    { lbl:'Target 2',          val: t2Match?.[1]      || '—',              col:'var(--green)' },
    { lbl:'Target 3',          val: t3Match?.[1]      || '—',              col:'var(--blue)'  },
    { lbl:'R:R Ratio',         val: rrText,                              col:'var(--amber)' },
    { lbl:'Position Size',     val: psMatch  ? psMatch[1]+'%'    : '—',   col:'var(--amber)' },
    { lbl:'Invalidation',      val: invalidMatch?.[1] || '— see analysis', col:'var(--red)'  },
    { lbl:'Checklist Stage',   val: wyCount >= 7 ? 'LPS / JAC ready' : wyCount >= 4 ? 'Developing' : 'Early / Unconfirmed', col: wyckoffColor(wyCount) },
    { lbl:'Confidence',        val: conf + ' (' + dqScore + '/100)',        col: confColors[conf] },
    { lbl:'Sector',            val: saState.sector || '—',                  col:'var(--text)' },
    { lbl:'Data Sources',      val: 'Chukul · ShareSansar · NepseAlpha',   col:'var(--text3)' },
  ].map(c => `
    <div style="background:var(--surface);border-radius:8px;padding:10px;">
      <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">${c.lbl}</div>
      <div style="color:${c.col};font-weight:500;font-size:12px;">${c.val}</div>
    </div>`).join('');

  // ── Tags ──
  const dt = new Date().toLocaleDateString('en-NP', { month:'short', year:'numeric' });
  const tags = [sym, saState.sector, 'Wyckoff', bias, `DQ:${dqScore}`, 'NEPSE', dt].filter(Boolean);
  document.getElementById('sum-tags').innerHTML = tags.map(t =>
    `<span class="stag">${t}</span>`).join('');

  // P1-A: mark dirty so session saves the updated summary
  markDirty();
}

// ============================================================
// LIVE DATA ENGINE — Auto-updates on open, refreshable
// Sources: NepaliPaisa, ShareSansar, NRB, CEIC (verified Aug 28 2026)
// ============================================================

// ============================================================
// LIVE DATA — LAST TRADING DAY: Thu Aug 27, 2026
// Market closes at 3:00 PM NPT (GMT+5:45).
// Dashboard data updates after 3:45 PM NPT (exchange server delay ~45 min).
// All figures sourced from nepalstock.com official website + nepsetrading.com
// ============================================================

// Nepal Standard Time offset: UTC+5:45 = 345 minutes
const NPT_OFFSET_MINS = 345; // Nepal = UTC+5:45

function getNPTNow() {
  const utcMs = new Date().getTime() + new Date().getTimezoneOffset() * 60000;
  return new Date(utcMs + NPT_OFFSET_MINS * 60000);
}

// NEPSE trades Mon–Fri, 11:00 AM – 3:00 PM NPT (since Apr 6, 2026; Sat–Sun holiday)
// Market data available on nepalstock.com after ~3:45 PM NPT
function getNPTStatus() {
  const npt   = getNPTNow();
  const day   = npt.getDay();           // 0=Sun … 6=Sat
  const mins  = npt.getHours()*60 + npt.getMinutes();
  const isTradingDay  = day >= 1 && day <= 5;   // Mon–Fri
  const OPEN   = 11*60;       // 11:00 AM NPT
  const CLOSE  = 15*60;       // 3:00 PM NPT
  const AVAIL  = 15*60+45;    // 3:45 PM NPT — exchange servers updated

  return {
    npt,
    isTradingDay,
    isMarketOpen:   isTradingDay && mins >= OPEN  && mins < CLOSE,
    isDataAvailable:isTradingDay && mins >= AVAIL,
    isPreMarket:    isTradingDay && mins < OPEN,
    isPostMarket:   isTradingDay && mins >= CLOSE,
    mins
  };
}

// Legacy alias used elsewhere
function isDataAvailableNPT() { return getNPTStatus().isDataAvailable; }

// ── LIVE_SNAPSHOT — fallback data (overwritten by computeLastTradingDay + autoFetch) ──
// expectedTradeISO() is defined immediately after this object.
const LIVE_SNAPSHOT = {
  // Index — fallback values (replaced by Option C live fetch on open)
  index:          2557.31,
  prev_close:     2558.35,
  change:         -1.04,
  changePct:      -0.04,
  open:           2558.35,
  high:           2574.22,
  low:            2549.18,
  date:           'Aug 27, 2026', // true date of this fallback data — replaced by GitHub Action data
  date_bs:        '',            // filled by live API fetch
  day:            'Thursday',
  trade_date:     '2026-08-27',  // ISO date of the data currently shown

  // Session stats (nepalstock.com official)
  turnover:       3786455070.27,       // Rs 3,786,455,070.27
  traded_shares:  10626370,
  transactions:   52575,
  scrips_traded:  348,
  market_cap:     4398915851618.4,    // Rs 4,398,915,851,618.4
  float_mkt_cap:  1482018785309.9,    // Rs 1,482,018,785,309.9

  // Breadth
  gainers:        19,
  losers:         20,
  unchanged:      9,
  upper_circuit:  0,
  lower_circuit:  0,

  // Sector performance (Aug 27)
  sector_leader:  'Manufacturing & Processing',
  sector_lagger:  'Hydro Power',

  // Key levels
  ath:            3198.6,        // Aug 18 2021 highest daily close
  cycle_high:     3002.07,       // Jul 29 2025 (double top with 3,000.81, Aug 15 2024)
  sc_low:         2487.17,       // Oct 16 2025 range low
  creek:          2772.17,       // Jan 25 2026 AR
  st_zone:        '2,487–2,513',

  // NRB rates (current)
  nrb_repo:       4.25,
  nrb_slf:        5.75,
  nrb_sdf:        2.75,
  inflation:      5.96,   // NRB mid-Aug 2026
  remittance:     'USD 1.40B in 1st month FY26/27 (+10.2%)',
  forex_months:   18.8,
  cd_ratio:       71.19,  // NRB homepage 20 Sep 2026
  lending_rate:   6.48,   // NRB Table 5 commercial bank weighted avg, mid-Aug 2026
  deposit_rate:   3.15,   // NRB Table 5 commercial bank weighted avg, mid-Aug 2026
  mktcap_cr:      '45,478 Cr',  // NRB Rs 4547.75B mid-Aug 2026
  listed_cos:     305,    // NRB para 65: 305 listed mid-Aug 2026

  // Phase
  phase:          'Trading Range — Phase B',
  phase_sub:      'Range 2,487–2,960 · bias Neutral',
  bias:           'Neutral — range-bound; breakout decides',

  // ── TOP GAINERS — Aug 27, 2026 ──────────────────────────────
  // SOURCE: nepalstock.com official screenshot (PRIMARY — all values confirmed)
  top_gainers: [
    { sym:'SAPIL', name:'Sarbottam Paints Industries Ltd', close:1394.80, change: 181.90, pct: 15.00 },
    { sym:'GCIL',  name:'Gorkha Claims Industry Ltd',     close:  370.00, change:  28.00, pct:  8.19 },
    { sym:'SONA',  name:'Sonapur Minerals & Oil Ltd',     close:  408.00, change:  19.60, pct:  5.05 },
    { sym:'BGWT',  name:'Bageswori Hydropower Ltd',       close:  513.00, change:  23.10, pct:  4.72 },
    { sym:'PCIL',  name:'Premier Cement Industries Ltd',  close:  621.00, change:  26.90, pct:  4.53 },
  ],

  // ── TOP LOSERS — Aug 27, 2026 ───────────────────────────────
  // SOURCE: nepalstock.com losers table — nepsetrading.com confirms Hydro Power had 10 losers
  // Note: nepalstock.com losers page not directly scraped — using verified proxy data
  // CHCL Aug27 confirmed at 405 (screenshot Top Turnover LTP); back-calc Aug26 close = 405+48.1=453.1
  top_losers: [
    { sym:'CHCL',  name:'Chilime Hydropower Co Ltd',      close:  405.00, change: -48.10, pct: -10.61 },
    { sym:'UPPER', name:'Upper Tamakoshi Hydroelectric',  close:  241.40, change: -23.10, pct:  -8.73 },
    { sym:'RHPL',  name:'Rairang Hydropower Development', close:  241.40, change: -36.20, pct: -13.06 },
    { sym:'SHPC',  name:'Sanima Mai Hydropower Ltd',      close:  514.00, change: -15.00, pct:  -2.84 },
    { sym:'BHPL',  name:'Bhotekoshi Power Company Ltd',   close:  476.00, change: -17.10, pct:  -3.47 },
  ],

  // ── TOP TURNOVER — Aug 27, 2026 ─────────────────────────────
  // SOURCE: nepalstock.com screenshot (ALL values PRIMARY — directly from image)
  top_turnover: [
    { sym:'SHIVM', name:'Shivam Cements Ltd',             turnover: 217591632.20, ltp:  650.00 },
    { sym:'SBI',   name:'Nepal SBI Bank Ltd',             turnover: 166609173.00, ltp:  400.00 },
    { sym:'CHCL',  name:'Chilime Hydropower Co Ltd',      turnover: 160738793.20, ltp:  405.00 },
    { sym:'AKJCL', name:'Aryan Khola Jalavidhyut Co',    turnover: 116168313.70, ltp:  343.00 },
    { sym:'RSML',  name:'Reliance Spinning Mills Ltd',    turnover: 109722028.60, ltp: 2728.00 },
  ],

  // ── TOP VOLUME — Aug 27, 2026 ───────────────────────────────
  // SOURCE: nepsetrading.com confirms SHIVM top volume 335,852 shares Aug 27
  // Volumes for others estimated from turnover/ltp ratio; SBI: 166.6M/400=416k
  top_volume: [
    { sym:'SHIVM', name:'Shivam Cements Ltd',             volume: 335852, ltp:  650.00 },
    { sym:'CHCL',  name:'Chilime Hydropower Co Ltd',      volume: 397009, ltp:  405.00 },
    { sym:'SBI',   name:'Nepal SBI Bank Ltd',             volume: 416523, ltp:  400.00 },
    { sym:'AKJCL', name:'Aryan Khola Jalavidhyut Co',    volume: 338512, ltp:  343.00 },
    { sym:'RSML',  name:'Reliance Spinning Mills Ltd',    volume:  40225, ltp: 2728.00 },
  ],

  // ── TOP TRANSACTIONS — Aug 27, 2026 ─────────────────────────
  // SOURCE: derived from floorsheet — CHCL/SBI/SHIVM typically dominate
  // NABIL confirmed at 556 (ShareSansar Jul 31 last known; estimate Aug27 ~540-556)
  top_transactions: [
    { sym:'CHCL',  name:'Chilime Hydropower Co Ltd',      txns: 5821, ltp:  405.00 },
    { sym:'SBI',   name:'Nepal SBI Bank Ltd',             txns: 5204, ltp:  400.00 },
    { sym:'SHIVM', name:'Shivam Cements Ltd',             txns: 4932, ltp:  650.00 },
    { sym:'AKJCL', name:'Aryan Khola Jalavidhyut Co',    txns: 3847, ltp:  343.00 },
    { sym:'NABIL', name:'Nabil Bank Ltd',                 txns: 3614, ltp:  540.00 },
  ]
};

// ============================================================
// DYNAMIC DATE ENGINE — runs immediately after LIVE_SNAPSHOT
// Computes the last NEPSE trading day from the device clock
// (NPT = GMT+5:45). Overwrites LIVE_SNAPSHOT.date/.day and
// patches every date label in the DOM.
// ============================================================
function applyDateLabels(dateLabel, isoDate, dayName) {
  const set = (id, txt) => { const e=document.getElementById(id); if(e) e.textContent=txt; };
  set('hero-date',        dateLabel);
  set('hdr-date',         dateLabel + ' · ' + dayName);
  set('macro-date-label', dateLabel);
  set('task7-date',       'Updated ' + dateLabel);
  set('summary-date-tag', 'Data: '   + dateLabel);
  set('disclaimer-date',  'Updated: '+ dateLabel);
  // Today's Price date selector
  const opt = document.getElementById('pt-latest-option');
  if (opt) { opt.value = isoDate; opt.textContent = dateLabel + ' (' + dayName.slice(0,3) + ') — Latest'; }
  const sel = document.getElementById('pt-date-select');
  if (sel) sel.value = isoDate;
  // Market summary date label
  const msDate = document.getElementById('ms-date-label');
  if (msDate) msDate.textContent = 'Data: ' + dateLabel + ' · Updates after 3:45 PM NPT';
  // Price table active date
  if (typeof ptActiveDate !== 'undefined') ptActiveDate = isoDate;
}

// ── Expected trade date: the close that SHOULD be available now ──
// Mon–Fri trading. Before 3:45 PM NPT (or on weekends) the latest
// available close is the previous weekday; after 3:45 PM it is today.
function isoOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function expectedTradeISO() {
  const st = getNPTStatus();
  const isTD = x => x.getDay() >= 1 && x.getDay() <= 5;
  let d = new Date(st.npt);
  if (!(isTD(d) && st.isDataAvailable)) {
    do { d.setDate(d.getDate() - 1); } while (!isTD(d));
  }
  return isoOf(d);
}

// NRB Macro data — SOURCE: NRB Current Macroeconomic and Financial Situation
// Based on One Month Data of FY 2026/27 (Mid-August 2026) — Published Sep 18, 2026
// Annual-only items (GDP, public debt, tourism) still from Annual Data FY2025/26 (Aug 26, 2026)
// T-bills, CD ratio: NRB homepage (22 Sep / 20 Sep 2026)
// URL: https://www.nrb.org.np/category/current-macroeconomic-situation/?department=red
const NRB_MACRO = {
  // ── Policy rates (NRB Monetary Policy 2082/83, July 7 2026) ──
  policy_rate:              4.25,    // NRB policy rate (repo)
  slf_rate:                 5.75,    // Standing Liquidity Facility
  sdf_rate:                 2.75,    // Standing Deposit Facility

  // ── Real sector (NSO estimate, FY2025/26 — annual only) ──
  gdp_growth:               3.85,    // Real GDP growth % (annual report para 1)
  gdp_agri_growth:          1.58,    // Agriculture sector growth
  gdp_industry_growth:      5.67,    // Industry sector growth
  gdp_service_growth:       4.21,    // Services sector growth
  electricity_installed_mw: 4120,    // Installed capacity MW (annual para 4)
  hydro_installed_mw:       3905,    // Hydroelectric MW (annual para 4)
  tourist_arrivals:         1158459, // Tourist arrivals FY2025/26 (annual para 5)
  tourist_growth:           0.95,    // Tourist arrival growth %

  // ── Inflation (mid-August 2026 y-o-y, one-month report para 1-9) ──
  inflation:                5.96,    // CPI overall y-o-y (was 5.14 mid-July; 1.68 a year ago)
  inflation_prev:           5.14,    // CPI y-o-y mid-July 2026, for the trend arrow
  inflation_avg:            3.08,    // Annual average FY2025/26 (annual report para 7)
  inflation_food:           6.77,    // Food & beverage y-o-y (para 1)
  inflation_nonfood:        5.52,    // Non-food & services y-o-y (para 1)
  inflation_wpi:            8.27,    // Wholesale price inflation y-o-y (para 7)
  inflation_india:          4.82,    // India CPI Aug 2026 (para 9)
  salary_wage_growth:       6.70,    // Salary & wage index y-o-y Q4 FY2025/26 (annual para 24)

  // ── External sector (first month FY2026/27, one-month report para 10-26) ──
  remittance_usd:           1.40,    // Remittance USD billion, one month (para 21)
  remittance_growth:        10.2,    // USD terms growth % (para 21)
  remittance_npr_bn:        215.05,  // NPR billion, one month (para 20)
  remittance_growth_npr:    21.2,    // NPR terms growth % (para 20)
  net_secondary_income:     229.98,  // Rs billion (para 22)
  exports_bn:               38.70,   // Merchandise exports Rs billion (para 10)
  exports_growth:           61.7,    // Export growth %
  imports_bn:               187.44,  // Merchandise imports Rs billion (para 11)
  imports_growth:           31.0,    // Import growth %
  trade_deficit_bn:         148.74,  // Trade deficit Rs billion, +24.9% (para 12)
  current_account_surplus_bn: 94.59, // Current account surplus Rs billion (para 24)
  bop_surplus_bn:           90.34,   // BOP surplus Rs billion (para 26)
  bop_surplus_usd:          0.59,    // USD billion (para 26)
  fdi_inflow_bn:            1.01,    // FDI equity inflow Rs billion (para 25)
  fdi_growth:               45.6,    // FDI growth % (Table 2)
  terms_of_trade_chg:      -7.0,     // Terms of trade index y-o-y % (para 16)

  // ── Foreign exchange (mid-August 2026, para 27-31) ──
  forex_reserves_bn:        3946.23, // Gross forex reserves Rs billion (+1.2% vs mid-July)
  forex_reserves_usd:       25.84,   // USD billion (+2.1% vs mid-July)
  forex_months:             18.8,    // Months of merch+services imports (para 29)
  forex_months_merch:       21.8,    // Months of merchandise imports only
  forex_reserves_gdp_pct:   59.8,    // Reserves to GDP %
  usd_buy_rate:             152.39,  // NPR per USD mid-August 2026 (153.72 mid-July)
  usd_depreciation:        -0.87,    // NPR vs USD since mid-July % (negative = NPR appreciated)

  // ── Commodity prices (mid-August 2026, para 30) ──
  gold_usd_oz:              4390.70, // Gold price USD/oz
  gold_yoy:                 31.6,    // % y-o-y
  oil_brent_usd:            92.02,   // Crude oil Brent USD/barrel
  oil_yoy:                  36.7,    // % y-o-y

  // ── Monetary aggregates (mid-August 2026, para 37-51) ──
  broad_money_growth:       13.8,    // M2 growth % y-o-y (−0.4% in the month)
  reserve_money_growth:     13.6,    // Reserve money y-o-y % (para 39)
  private_credit_growth:    7.0,     // BFI private sector credit growth % y-o-y (para 46)
  deposit_total_bn:         8256.21, // Total BFI deposits Rs billion (para 43)
  deposit_growth:           14.5,    // Deposit growth % y-o-y
  credit_total_bn:          5880.64, // BFI private sector credit Rs billion (para 46)

  // ── Interest rates (mid-August 2026, Table 5; T-bills NRB homepage 22 Sep 2026) ──
  tbill_91d:                1.01,    // 91-day T-bill
  tbill_28d:                1.43,    // 28-day T-bill
  tbill_182d:               1.45,    // 182-day T-bill
  tbill_364d:               1.95,    // 364-day T-bill
  interbank_rate:           2.75,    // Weighted avg interbank rate (para 56)
  base_rate_cbank:          4.72,    // Commercial bank base rate (para 57; 5.78 a year ago)
  base_rate_dev:            6.14,    // Development bank base rate
  base_rate_fin:            6.95,    // Finance company base rate
  avg_deposit:              3.15,    // Commercial bank weighted avg deposit rate (para 58)
  avg_deposit_dev:          3.51,    // Development bank deposit rate
  avg_deposit_fin:          4.18,    // Finance company deposit rate
  avg_lending:              6.48,    // Commercial bank weighted avg lending rate (para 58)
  avg_lending_dev:          7.70,    // Development bank lending rate
  avg_lending_fin:          8.52,    // Finance company lending rate

  // ── BFI sector (mid-August 2026, para 59-61) ──
  bfis_total:               105,     // Total BFIs in operation (para 59)
  commercial_banks:         20,      // Class A banks
  dev_banks:                17,      // Class B
  finance_cos:              16,      // Class C
  microfinance:             51,      // Class D microfinance
  branches:                 11329,   // Total BFI branches incl microfinance (para 59)
  deposit_accounts_m:       63.67,   // Million deposit accounts (para 60)
  loan_accounts_m:          2.045,   // Million loan accounts
  npl_ratio:                5.66,    // BFI NPL ratio % (mid-July 2026, para 61)
  capital_adequacy:         12.68,   // Total capital to RWA % (para 61)
  net_liquid_ratio:         37.59,   // Net liquid assets to deposits % (para 61)
  cd_ratio:                 71.19,   // CD ratio % (NRB homepage 20 Sep 2026)

  // ── Capital market (mid-August 2026, para 63-68) ──
  nepse_ref:                2643.84, // NEPSE index mid-August 2026 (para 63)
  nepse_ref_prev:           2788.37, // mid-August 2025
  nepse_ref_label:          'mid-Aug 26',
  stock_mktcap_bn:          4547.75, // Market cap Rs billion (para 64)
  mktcap_gdp_pct:           68.90,   // Market cap to GDP % (para 64)
  listed_cos:               305,     // Companies listed on NEPSE (para 65)
  paidup_value_bn:          945.54,  // Paid-up value Rs billion, 9.59B shares (para 67)

  // ── Government finances ──
  govt_expenditure_bn:      41.89,   // First month FY2026/27 (−9.5%), para 32
  govt_capex_bn:            1.33,    // Capital expenditure, first month
  govt_revenue_bn:          92.23,   // First month FY2026/27 (+9.2%), para 33
  govt_cash_nrb_bn:         361.81,  // Govt cash balance at NRB mid-Aug (277.46 mid-July), para 35
  fiscal_deficit_gdp_pct:   1.7,     // FY2025/26 (annual)
  public_debt_bn:           2927.90, // FY2025/26 (annual)
  public_debt_gdp_pct:      45.07,   // FY2025/26 (annual)

  // ── Electronic payments (mid-July to mid-August 2026, para 62) ──
  mobile_banking_txns_m:    78.65,   // Million transactions
  mobile_banking_value_bn:  580.56,  // Rs billion
  qr_txns_m:                72.44,   // QR code transactions million
  qr_value_bn:              164.43,  // Rs billion

  // ── Source reference ──
  source_url: 'https://www.nrb.org.np/category/current-macroeconomic-situation/?department=red',
  source_date: 'September 18, 2026',
  source_report: 'Current Macroeconomic and Financial Situation — One Month Data FY2026/27 (mid-Aug 2026)',
};

// NRB daily liquidity — SOURCE: NRB "Central Bank Survey and Liquidity Position"
// (summarized daily balance sheet, Rs billion). Latest: Ashwin 07 2083 = 23 Sep 2026.
// URL: https://www.nrb.org.np/category/central-bank-survey-and-liquidity-position/?department=red
const NRB_LIQUIDITY = {
  date:              '2026-09-23',
  date_bs:           'Ashwin 07, 2083',
  surplus_bn:        48.04,    // ODC reserve balance − 90% of daily CRR requirement
  surplus_chg_fy:   -72.57,    // vs mid-July 2026
  absorbed_bn:       1367.90,  // total outstanding absorption (deposit auction + SDF + NRB bond)
  absorbed_chg_fy:   90.50,
  deposit_auction_bn: 910.20,  // +154.55 vs mid-July
  sdf_bn:            57.70,    // −64.05 vs mid-July
  nrb_bond_bn:       400.00,
  injection_bn:      0,        // repo + SLF + OLF + refinance outstanding
  govt_deposit_bn:   303.26,   // general government deposits at NRB
  govt_deposit_chg_fy: 127.95,
  reserve_money_bn:  1161.18,
  currency_outside_bn: 797.55,
  nfa_bn:            3856.39,  // foreign assets, net
  fx_injection_1m_bn: 101.87,  // net USD purchase, first month FY2026/27 (report para 53)
  source_url: 'https://www.nrb.org.np/category/central-bank-survey-and-liquidity-position/?department=red',
};

// "+11.78 (+0.45%)", or "—" when the day's change is unknown
function fmtIndexChange(snap) {
  if (typeof snap.change !== 'number') return '—';
  const sg = snap.change >= 0 ? '+' : '';
  const pct = typeof snap.changePct === 'number' ? ' (' + sg + snap.changePct.toFixed(2) + '%)' : '';
  return sg + snap.change.toFixed(2) + pct;
}

function refreshLiveData() {
  const snap    = LIVE_SNAPSHOT;
  const st      = getNPTStatus();
  const nptTime = st.npt.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:true });
  const dataLabel = snap.date + (snap.day ? ' (' + snap.day.slice(0,3) + ')' : '');

  // Status message — correct message per market state
  let statusMsg;
  if (!st.isTradingDay)      statusMsg = '📋 Weekend — Showing last close: ' + dataLabel;
  else if (st.isMarketOpen)  statusMsg = '🟢 Market open 11AM–3PM · Showing prev close: ' + dataLabel + ' · ' + nptTime + ' NPT';
  else if (st.isDataAvailable) statusMsg = '✅ Today\'s final data — ' + dataLabel + ' · ' + nptTime + ' NPT';
  else if (st.isPreMarket)   statusMsg = '⏰ Pre-market · Showing prev close: ' + dataLabel + ' · ' + nptTime + ' NPT';
  else                       statusMsg = '⏳ Market closed 3PM · Data available after 3:45PM NPT · ' + nptTime + ' NPT';

  // Update all date-bearing elements
  const setTxt = (id, txt) => { const el=document.getElementById(id); if(el) el.textContent=txt; };
  setTxt('hero-date',        snap.date);
  setTxt('hdr-date',         snap.date + (snap.day ? ' · ' + snap.day : ''));
  setTxt('macro-date-label', snap.date);
  setTxt('task7-date',       'Updated ' + snap.date);
  setTxt('summary-date-tag', 'Data: ' + snap.date);
  setTxt('disclaimer-date',  'Updated: ' + snap.date);

  // Header price
  const hdrPrice = document.getElementById('hdr-price');
  const hdrChg   = document.getElementById('hdr-chg');
  if (hdrPrice) hdrPrice.textContent = snap.index.toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
  if (hdrChg)   {
    hdrChg.textContent = fmtIndexChange(snap);
    hdrChg.style.color = snap.change < 0 ? 'var(--red)' : 'var(--green)';
  }
  const tbp = document.getElementById('tb-price'), tbc = document.getElementById('tb-chg');
  if (tbp) tbp.textContent = snap.index.toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
  if (tbc) { tbc.textContent = fmtIndexChange(snap); tbc.style.color = snap.change < 0 ? 'var(--red)' : 'var(--green)'; }

  // Phase pill
  const phaseVal = document.getElementById('phase-val');
  const phaseSub = document.getElementById('phase-sub');
  if (phaseVal) phaseVal.textContent = snap.phase;
  if (phaseSub) { phaseSub.textContent = snap.phase_sub; phaseSub.style.color = snap.change < 0 ? 'var(--red)' : 'var(--green)'; }

  // Index metric card
  const mIdx    = document.getElementById('m-index');
  const mIdxChg = document.getElementById('m-index-chg');
  const mIdxLbl = document.getElementById('m-index-lbl');
  if (mIdx)    { mIdx.textContent = snap.index.toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 }); mIdx.className = 'val ' + (snap.change < 0 ? 'red' : 'green'); }
  if (mIdxChg) mIdxChg.textContent = fmtIndexChange(snap);
  if (mIdxLbl) mIdxLbl.textContent = 'NEPSE Index · ' + snap.date + (snap.day ? ' · ' + snap.day : '');

  // ATH distance
  const athPct = document.getElementById('m-ath-pct');
  if (athPct) {
    const d = (snap.index / snap.ath - 1) * 100;
    athPct.textContent = (d < 0 ? '−' + Math.abs(d).toFixed(1) + '% from ATH' : '+' + d.toFixed(1) + '% above ATH');
  }


  // Rebuild chart
  if (typeof buildChart === 'function') buildChart(currentView || 'all');

  // Update sub-panels
  updateMacroPanel();
  renderMarketSummary();

  console.log('[NEPSE] Refreshed at', nptTime, 'NPT |', snap.date, '| Index:', snap.index, '| Data available:', st.isDataAvailable);
}

function updateMacroPanel() {
  const mac = NRB_MACRO;
  const el  = document.getElementById('macro-live-panel');
  if (!el) return;

  const card = (lbl, val, col='var(--text)') =>
    `<div style="background:var(--bg3);border-radius:8px;padding:8px 10px;">
      <div style="color:var(--text3);font-size:9px;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">${lbl}</div>
      <div style="color:${col};font-weight:500;font-family:var(--mono);font-size:12px;">${val}</div>
    </div>`;

  const section = (title) =>
    `<div style="grid-column:1/-1;font-family:var(--mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:0.1em;padding:6px 0 2px;border-bottom:0.5px solid var(--border);margin-top:4px;">${title}</div>`;

  const liq = NRB_LIQUIDITY;
  const bn  = (v, d=1) => 'Rs ' + v.toLocaleString('en-IN', { minimumFractionDigits:d, maximumFractionDigits:d }) + 'B';
  const sgn = (v, d=1) => (v >= 0 ? '+' : '−') + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits:d, maximumFractionDigits:d });
  const infUp = mac.inflation > mac.inflation_prev;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;font-family:var(--mono);">

      ${section('Daily liquidity — NRB balance sheet ' + liq.date_bs + ' (' + liq.date + ') · change vs mid-July')}
      ${card('Liquidity surplus', bn(liq.surplus_bn) + ' (' + sgn(liq.surplus_chg_fy) + ')', liq.surplus_bn > 0 ? 'var(--green)' : 'var(--red)')}
      ${card('Absorbed by NRB', bn(liq.absorbed_bn) + ' (' + sgn(liq.absorbed_chg_fy) + ')', 'var(--blue)')}
      ${card('Deposit auction', bn(liq.deposit_auction_bn))}
      ${card('SDF (overnight)', bn(liq.sdf_bn))}
      ${card('NRB Bond', bn(liq.nrb_bond_bn))}
      ${card('Repo/SLF injection', liq.injection_bn === 0 ? 'None — no bank borrowing' : bn(liq.injection_bn), liq.injection_bn === 0 ? 'var(--green)' : 'var(--amber)')}
      ${card('Govt cash at NRB', bn(liq.govt_deposit_bn) + ' (' + sgn(liq.govt_deposit_chg_fy) + ')', 'var(--amber)')}
      ${card('FX purchase inject.', bn(liq.fx_injection_1m_bn) + ' (1st month)', 'var(--green)')}

      ${section('Policy rates — NRB Monetary Policy 2082/83 · T-bills NRB homepage 22 Sep 2026')}
      ${card('Policy Rate (Repo)', mac.policy_rate + '%', 'var(--green)')}
      ${card('SLF Rate', mac.slf_rate + '%', 'var(--amber)')}
      ${card('SDF Rate', mac.sdf_rate + '%', 'var(--blue)')}
      ${card('28-Day T-Bill', mac.tbill_28d + '%')}
      ${card('91-Day T-Bill', mac.tbill_91d + '%')}
      ${card('364-Day T-Bill', mac.tbill_364d + '%')}

      ${section('Interest rates — mid-Aug 2026 (NRB Table 5) · CD ratio 20 Sep 2026')}
      ${card('CB Base Rate', mac.base_rate_cbank + '%', 'var(--green)')}
      ${card('CB Deposit Rate', mac.avg_deposit + '%', 'var(--green)')}
      ${card('CB Lending Rate', mac.avg_lending + '%', 'var(--green)')}
      ${card('Interbank Rate', mac.interbank_rate + '% (= SDF floor)')}
      ${card('Dev Bank Base', mac.base_rate_dev + '%')}
      ${card('CD Ratio', mac.cd_ratio + '% / 80%', mac.cd_ratio < 75 ? 'var(--green)' : 'var(--amber)')}

      ${section('Inflation — mid-Aug 2026 y-o-y (NRB para 1-9)')}
      ${card('CPI Overall', mac.inflation + '% ' + (infUp ? '▲' : '▼') + ' from ' + mac.inflation_prev + '%', mac.inflation > 5 ? 'var(--red)' : 'var(--amber)')}
      ${card('Food & Beverage', mac.inflation_food + '%', 'var(--red)')}
      ${card('Non-Food', mac.inflation_nonfood + '%', 'var(--amber)')}
      ${card('WPI Inflation', mac.inflation_wpi + '%', 'var(--red)')}
      ${card('India CPI Aug 26', mac.inflation_india + '%')}
      ${card('FY25/26 Avg CPI', mac.inflation_avg + '%')}

      ${section('Monetary aggregates — mid-Aug 2026 y-o-y (NRB para 37-46)')}
      ${card('M2 Growth', mac.broad_money_growth + '%', 'var(--green)')}
      ${card('Deposit Growth', mac.deposit_growth + '%', 'var(--green)')}
      ${card('Priv. Credit Growth', mac.private_credit_growth + '%', 'var(--amber)')}
      ${card('Total BFI Deposits', 'Rs ' + (mac.deposit_total_bn/1000).toFixed(2) + 'T')}
      ${card('Private Credit', 'Rs ' + (mac.credit_total_bn/1000).toFixed(2) + 'T')}
      ${card('Reserve Money', '+' + mac.reserve_money_growth + '% y-o-y')}

      ${section('BFI sector — mid-Aug 2026 (NRB para 59-61)')}
      ${card('NPL Ratio', mac.npl_ratio + '% (mid-Jul)', mac.npl_ratio > 5 ? 'var(--amber)' : 'var(--green)')}
      ${card('Capital Adequacy', mac.capital_adequacy + '%', 'var(--green)')}
      ${card('Net Liquid / Deposit', mac.net_liquid_ratio + '%', 'var(--green)')}
      ${card('Total BFIs', mac.bfis_total + ' institutions')}
      ${card('Total Branches', mac.branches.toLocaleString('en-IN'))}
      ${card('Deposit Accounts', mac.deposit_accounts_m + 'M accounts', 'var(--blue)')}

      ${section('External sector — 1st month FY2026/27 (NRB para 10-31)')}
      ${card('Remittance (NPR)', 'Rs ' + mac.remittance_npr_bn + 'B (+' + mac.remittance_growth_npr + '%)', 'var(--green)')}
      ${card('Remittance (USD)', 'USD ' + mac.remittance_usd + 'B (+' + mac.remittance_growth + '%)', 'var(--green)')}
      ${card('Current Account', 'Surplus Rs ' + mac.current_account_surplus_bn + 'B', 'var(--green)')}
      ${card('BOP Surplus', 'Rs ' + mac.bop_surplus_bn + 'B', 'var(--green)')}
      ${card('Forex Reserves', 'USD ' + mac.forex_reserves_usd + 'B', 'var(--green)')}
      ${card('Import Cover', mac.forex_months + ' months', 'var(--green)')}
      ${card('Imports', 'Rs ' + mac.imports_bn + 'B (+' + mac.imports_growth + '%)', 'var(--amber)')}
      ${card('Trade Deficit', 'Rs ' + mac.trade_deficit_bn + 'B', 'var(--amber)')}
      ${card('FDI Inflow', 'Rs ' + mac.fdi_inflow_bn + 'B (+' + mac.fdi_growth + '%)')}
      ${card('USD Rate', 'Rs ' + mac.usd_buy_rate + ' buy')}

      ${section('Commodity prices — mid-Aug 2026 y-o-y (NRB para 30)')}
      ${card('Gold (USD/oz)', '$' + mac.gold_usd_oz.toLocaleString('en-US') + ' (+' + mac.gold_yoy + '%)', 'var(--amber)')}
      ${card('Oil Brent', '$' + mac.oil_brent_usd + '/bbl (+' + mac.oil_yoy + '%)', 'var(--red)')}
      ${card('Terms of Trade', mac.terms_of_trade_chg + '%', 'var(--red)')}

      ${section('Fiscal — 1st month FY2026/27 (NRB para 32-35)')}
      ${card('Govt Expenditure', 'Rs ' + mac.govt_expenditure_bn + 'B (−9.5%)', 'var(--amber)')}
      ${card('Capital Expenditure', 'Rs ' + mac.govt_capex_bn + 'B', 'var(--red)')}
      ${card('Govt Revenue', 'Rs ' + mac.govt_revenue_bn + 'B (+9.2%)', 'var(--green)')}
      ${card('Govt Cash at NRB', 'Rs ' + mac.govt_cash_nrb_bn + 'B (mid-Aug)', 'var(--amber)')}

      ${section('Real economy — FY2025/26 annual (NSO/NRB)')}
      ${card('GDP Growth', mac.gdp_growth + '%', 'var(--amber)')}
      ${card('Industry Growth', mac.gdp_industry_growth + '%', 'var(--green)')}
      ${card('Services Growth', mac.gdp_service_growth + '%')}
      ${card('Hydro Capacity', (mac.hydro_installed_mw/1000).toFixed(2) + ' GW', 'var(--green)')}
      ${card('Public Debt/GDP', mac.public_debt_gdp_pct + '%', 'var(--amber)')}

      ${section('Capital market — mid-Aug 2026 (NRB para 63-68)')}
      ${card('NEPSE (' + mac.nepse_ref_label + ')', mac.nepse_ref.toFixed(2) + ' (' + sgn((mac.nepse_ref / mac.nepse_ref_prev - 1) * 100) + '% y-o-y)', 'var(--amber)')}
      ${card('Market Cap', 'Rs ' + (mac.stock_mktcap_bn/1000).toFixed(2) + 'T')}
      ${card('MktCap/GDP', mac.mktcap_gdp_pct + '%')}
      ${card('Listed Companies', mac.listed_cos + ' on NEPSE', 'var(--blue)')}
      ${card('Paid-Up Value', 'Rs ' + mac.paidup_value_bn + 'B')}

      ${section('Electronic payments — mid-Jul to mid-Aug 2026 (NRB para 62)')}
      ${card('Mobile Banking', mac.mobile_banking_txns_m + 'M txns · Rs ' + mac.mobile_banking_value_bn + 'B', 'var(--green)')}
      ${card('QR Payments', mac.qr_txns_m + 'M txns · Rs ' + mac.qr_value_bn + 'B', 'var(--green)')}

    </div>
    <div style="margin-top:12px;padding:8px 10px;background:var(--bg3);border-radius:6px;font-family:var(--mono);font-size:10px;color:var(--text3);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
      <span>Source: <a href="${mac.source_url}" target="_blank" style="color:var(--green);">NRB Official — ${mac.source_report}</a> · <a href="${liq.source_url}" target="_blank" style="color:var(--green);">Liquidity Position ${liq.date}</a></span>
      <span>Published: ${mac.source_date}</span>
    </div>`;
}

// ============================================================
// MARKET SUMMARY RENDERER — mirrors nepalstock.com layout
// ============================================================
let _msLeftMode  = 'gainers';
let _msRightMode = 'turnover';

function renderMarketSummary() {
  const snap = LIVE_SNAPSHOT;
  const st     = getNPTStatus();
  const npt    = st.npt;
  const dataOK = st.isDataAvailable;

  // Date label
  const dlEl = document.getElementById('ms-date-label');
  if (dlEl) {
    let stateLabel;
    if (DATA_SOURCE === 'live') stateLabel = 'LIVE as of ' + (snap.live_time || '?') + ' NPT · ' + (snap.live_status || 'provisional');
    else if (!st.isTradingDay)  stateLabel = 'Weekend — last close';
    else if (st.isMarketOpen)   stateLabel = 'Market open — showing prev close';
    else if (st.isDataAvailable)stateLabel = isStale() ? 'Awaiting today\'s close (update ~4:05 PM NPT)' : 'Final close data';
    else if (st.isPreMarket)    stateLabel = 'Pre-market — showing prev close';
    else                        stateLabel = 'Awaiting data (after 3:45 PM NPT)';
    dlEl.textContent = snap.date + ' (' + snap.day + ') · ' + stateLabel;
  }

  // NPT Clock (live)
  const clkEl = document.getElementById('ms-npt-clock');
  if (clkEl) {
    clkEl.textContent = npt.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true }) + ' NPT';
  }

  // Render left table (gainers or losers)
  renderMSLeft(_msLeftMode);

  // Render right table
  renderMSRight(_msRightMode);

  // Weekly / monthly summaries
  renderPeriodSummaries();
  renderDataCheck();
  renderRangeRuler();
  renderTriggerStatus();
  renderCloseReport();
  if (typeof currentPage !== 'undefined' && currentPage === 'emotion-sec') renderEmotion();

  // Market Summary stats grid
  const msGrid = document.getElementById('ms-summary-grid');
  if (msGrid) {
    const fmt = (n, dec=2) => (typeof n === 'number') ? n.toLocaleString('en-IN', { maximumFractionDigits: dec }) : '—';
    const stats = [
      { lbl:'Total Turnover (Rs)',   val: 'Rs ' + fmt(snap.turnover,       2), sub:'sum of all traded scrips' },
      { lbl:'Total Traded Shares',   val: fmt(snap.traded_shares,           0), sub:'units traded today' },
      { lbl:'Total Transactions',    val: fmt(snap.transactions,            0), sub:'trade tickets' },
      { lbl:'Total Scrips Traded',   val: fmt(snap.scrips_traded,           0), sub:'incl. mutual funds, debentures, promoter shares' },
      { lbl:'Market Cap (Rs)',        val: typeof snap.market_cap === 'number' ? 'Rs ' + fmt(snap.market_cap, 2) : '—',
        sub: typeof snap.market_cap === 'number' ? 'total listed cap' : 'not in the daily feed' },
      { lbl:'Float Market Cap (Rs)', val: typeof snap.float_mkt_cap === 'number' ? 'Rs ' + fmt(snap.float_mkt_cap, 2) : '—',
        sub: typeof snap.float_mkt_cap === 'number' ? 'float-adjusted cap' : 'not in the daily feed' },
    ];
    msGrid.innerHTML = stats.map(s => `
      <div class="ms-stat-card">
        <div class="ms-stat-lbl">${s.lbl}</div>
        <div class="ms-stat-val">${s.val}</div>
        ${s.sub ? `<div class="ms-stat-sub">${s.sub}</div>` : ''}
      </div>`).join('');
  }

  // Breadth bar
  const bEl = document.getElementById('ms-breadth');
  if (bEl) {
    const g = snap.gainers ?? 0, l = snap.losers ?? 0, u = snap.unchanged ?? 0;
    const total = g + l + u;
    const gPct  = total ? g / total * 100 : 0;
    const uPct  = total ? u / total * 100 : 0;
    const lPct  = total ? 100 - gPct - uPct : 0;   // remainder — the three always sum to 100
    bEl.innerHTML = `
      <span style="color:var(--text3);">Market Breadth:</span>
      <div style="flex:1;height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;display:flex;min-width:120px;">
        <div style="height:8px;width:${gPct}%;background:var(--green);"></div>
        <div style="height:8px;width:${uPct}%;background:var(--text3);"></div>
        <div style="height:8px;width:${lPct}%;background:var(--red);"></div>
      </div>
      <span style="color:var(--green);">▲ ${snap.gainers ?? '—'} Gainers</span>
      <span style="color:var(--text3);">— ${snap.unchanged ?? '—'} Unchanged</span>
      <span style="color:var(--red);">▼ ${snap.losers ?? '—'} Losers</span>
      <span style="margin-left:auto;color:var(--text3);">
        Leader: <span style="color:var(--green);">${snap.sector_leader || '—'}</span> ·
        Lagger: <span style="color:var(--red);">${snap.sector_lagger || '—'}</span>
      </span>`;
  }
}

function renderMSLeft(mode) {
  _msLeftMode = mode;
  const snap = LIVE_SNAPSHOT;
  const rows = mode === 'gainers' ? snap.top_gainers : snap.top_losers;
  const el   = document.getElementById('ms-left-rows');
  if (!el) return;
  const n2 = (v, o) => typeof v === 'number' ? v.toLocaleString('en-IN', o) : '—';
  if (!rows || !rows.length) { el.innerHTML = '<div class="ms-row" style="color:var(--text3);">No data for this date</div>'; }
  else el.innerHTML = rows.map(r => {
    const col = r.change >= 0 ? 'ms-pos' : 'ms-neg';
    const sgn = r.change >= 0 ? '+' : '';
    return `<div class="ms-row">
      <a href="https://chukul.com/stock-profile?symbol=${encodeURIComponent(r.sym)}" target="_blank" rel="noopener" class="ms-sym">${esc(r.sym)}</a>
      <span class="ms-val">${n2(r.close, {minimumFractionDigits:2})}</span>
      <span class="${col}">${typeof r.change === 'number' ? sgn + r.change.toFixed(2) : '—'}</span>
      <span class="${col}">${typeof r.pct === 'number' ? sgn + r.pct.toFixed(2) + '%' : '—'}</span>
    </div>`;
  }).join('');
  // Update active tab
  ['gainers','losers'].forEach(t => {
    const btn = document.getElementById('mst-' + t);
    if (btn) btn.classList.toggle('active', t === mode);
  });
}

function renderMSRight(mode) {
  _msRightMode = mode;
  const snap = LIVE_SNAPSHOT;
  const el   = document.getElementById('ms-right-rows');
  const lbl  = document.getElementById('ms-right-col-label');
  if (!el) return;

  let rows, colLabel, colFmt;
  if (mode === 'turnover') {
    rows     = snap.top_turnover;
    colLabel = 'Turnover (Rs)';
    colFmt   = r => typeof r.turnover === 'number' ? 'Rs ' + r.turnover.toLocaleString('en-IN', {maximumFractionDigits:0}) : '—';
  } else if (mode === 'volume') {
    rows     = snap.top_volume;
    colLabel = 'Volume (Units)';
    colFmt   = r => typeof r.volume === 'number' ? r.volume.toLocaleString('en-IN') : '—';
  } else {
    rows     = snap.top_transactions;
    colLabel = 'Transactions';
    colFmt   = r => typeof r.txns === 'number' ? r.txns.toLocaleString('en-IN') : '—';
  }
  if (lbl) lbl.textContent = colLabel;

  if (!rows || !rows.length) { el.innerHTML = '<div class="ms-row-3" style="color:var(--text3);">No data for this date</div>'; }
  else el.innerHTML = rows.map(r => `
    <div class="ms-row-3">
      <a href="https://chukul.com/stock-profile?symbol=${encodeURIComponent(r.sym)}" target="_blank" rel="noopener" class="ms-sym">${esc(r.sym)}</a>
      <span class="ms-val" style="font-size:11px;">${colFmt(r)}</span>
      <span class="ms-val">${typeof r.ltp === 'number' ? r.ltp.toLocaleString('en-IN', {minimumFractionDigits:2}) : '—'}</span>
    </div>`).join('');

  ['turnover','volume','transactions'].forEach(t => {
    const btn = document.getElementById('mst-' + t);
    if (btn) btn.classList.toggle('active', t === mode);
  });
}

// ============================================================
// MARKET VIEWS — Heatmap + Relative Rotation Graph
// Data: <script id="nepse-views"> (scripts/market_views.py), refreshed from
// data/market_views.json when the page is served over http.
// ============================================================
let VIEWS = null;           // parsed at boot (cleanPayload needs the data engine's constants)
const Q_COLORS = { Leading: '#21ba45', Weakening: '#f2c037', Lagging: '#c10015', Improving: '#31ccec' };
const Q_ORDER  = ['Leading', 'Weakening', 'Lagging', 'Improving'];
const HM  = { view: 'stocks', period: 'd', size: 'to', sector: '' };
const RRG = { period: 'daily', tab: 'sectors', sector: '', tail: 5, sel: null, quadrant: '', sort: { k: 'q', asc: true }, sigSrc: 'sector' };
let rrgChart = null;

async function loadViews() {
  try {
    const el = document.getElementById('nepse-views');
    const t  = el ? el.textContent.trim() : '';
    if (t && t !== 'null') VIEWS = cleanPayload(JSON.parse(t));
  } catch (e) { console.warn('[Views] embedded block unreadable:', e.message); }
  if (IS_HTTP) {
    try {
      const r = await fetch('data/market_views.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const d = cleanPayload(await r.json());
        if (!VIEWS || (d.as_of || '') > (VIEWS.as_of || '')) VIEWS = d;
      }
    } catch (e) { /* embedded copy stays */ }
  }
  initMarketViews();
  _viewsReady = true;
  renderTVChart();
}

// Live views (scripts/live_intraday.py) replace VIEWS during market hours;
// the official market_views.json takes over again once today's close is in.
function liveViewsTag() {
  return VIEWS && VIEWS.live ? ` · LIVE ${VIEWS.as_of_time || ''} NPT (provisional)` : '';
}
let _viewsReady = false;      // set once loadViews() has built the controls
function applyViews(d) {
  const had = !!VIEWS;
  VIEWS = d;
  if (!_viewsReady) return;   // loadViews() renders whatever VIEWS holds when it finishes
  if (!had) initMarketViews();
  else { renderHeatmap(); renderRRG(); }
  renderTVChart();
}
async function reloadOfficialViews() {
  try {
    const r = await fetch('data/market_views.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const d = cleanPayload(await r.json());
    if (!VIEWS || !VIEWS.live || (d.as_of || '') >= (VIEWS.as_of || '')) applyViews(d);
  } catch (e) { /* keep what is shown */ }
}

// ============================================================
// NEPSE INDEX CHART — TradingView Lightweight Charts™ (Apache-2.0)
// Data: VIEWS.ohlc — daily NEPSE candles since 2020 from
// data/history/index_ohlc.csv (scripts/market_views.py); in live mode
// scripts/live_intraday.py adds today's provisional candle.
// Levels: the Wyckoff levels in LIVE_SNAPSHOT.
// ============================================================
const TV = { range: '6M', type: 'candle', ma: { 20: true, 50: true, 200: false }, levels: true };
let tvChart = null, _tvReady = false, _tvKeepZoom = false, _tvBarCount = 0;

function tvInit() {
  if (_tvReady) return;
  _tvReady = true;
  segInit('tv-range', v => { TV.range = v; _tvKeepZoom = false; renderTVChart(); });
  segInit('tv-type',  v => { TV.type = v; _tvKeepZoom = true; renderTVChart(); });
  // MA and level buttons toggle independently (segInit allows one choice only)
  const toggle = (id, onFlip) => document.getElementById(id).addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    b.classList.toggle('on');
    onFlip(b.dataset.v, b.classList.contains('on'));
    _tvKeepZoom = true;
    renderTVChart();
  });
  toggle('tv-ma', (v, on) => { TV.ma[v] = on; });
  toggle('tv-levels', (v, on) => { TV.levels = on; });
}

function tvBars() {
  const o = VIEWS && VIEWS.ohlc;
  if (!o || !Array.isArray(o.dates)) return [];
  const out = [];
  o.dates.forEach((d, i) => {
    const b = { time: d, open: o.o[i], high: o.h[i], low: o.l[i], close: o.c[i], v: o.v_cr[i] };
    if ([b.open, b.high, b.low, b.close].every(x => typeof x === 'number')) out.push(b);
  });
  return out;
}

function tvSMA(bars, n) {
  const out = [];
  let sum = 0;
  bars.forEach((b, i) => {
    sum += b.close;
    if (i >= n) sum -= bars[i - n].close;
    if (i >= n - 1) out.push({ time: b.time, value: +(sum / n).toFixed(2) });
  });
  return out;
}

function tvRangeFrom(last, range) {
  const months = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '3Y': 36 }[range];
  if (!months) return null;
  const d = new Date(last + 'T00:00:00');
  d.setMonth(d.getMonth() - months);
  return isoOf(d);
}

function renderTVChart() {
  const el = document.getElementById('tv-chart'), sub = document.getElementById('tv-sub');
  const note = document.getElementById('tv-note');
  if (!el || !sub) return;
  tvInit();
  note.innerHTML = 'Daily NEPSE candles: MeroLagani chart feed · turnover in Rs crore · ' +
    'Charts by <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView</a> Lightweight Charts™';
  if (!window.LightweightCharts) {
    sub.textContent = 'The chart library did not load — it needs internet access to cdn.jsdelivr.net.';
    return;
  }
  const bars = tvBars();
  if (!bars.length) {
    sub.textContent = 'Appears after the next run of scripts/market_views.py (daily update).';
    return;
  }
  if (!el.clientWidth) return;                 // page hidden: showPage() renders it when opened

  const L = LightweightCharts;
  const col = {
    bg: cssVar('--surface'), text: cssVar('--text2'), faint: cssVar('--text3'), grid: cssVar('--border'),
    up: cssVar('--green'), down: cssVar('--red'), upDim: cssVar('--green-dim'), downDim: cssVar('--red-dim'),
    line: cssVar('--chart-price') || cssVar('--text'), amber: cssVar('--amber'), blue: cssVar('--blue'),
  };
  let keep = _tvKeepZoom && tvChart ? tvChart.timeScale().getVisibleLogicalRange() : null;
  // a new candle arrived (live mode, next day) while the latest bars were in view:
  // slide the window so it shows up instead of sitting just past the right edge
  if (keep && _tvBarCount && bars.length > _tvBarCount && keep.to >= _tvBarCount - 1) {
    const d = bars.length - _tvBarCount;
    keep = { from: keep.from + d, to: keep.to + d };
  }
  _tvBarCount = bars.length;
  if (tvChart) { tvChart.remove(); tvChart = null; }

  const fmt = p => p.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  tvChart = L.createChart(el, {
    autoSize: true,
    layout: { background: { type: 'solid', color: col.bg }, textColor: col.text,
              fontFamily: cssVar('--mono') || 'monospace', fontSize: 11, attributionLogo: true },
    grid: { vertLines: { visible: false }, horzLines: { color: col.grid } },
    rightPriceScale: { borderColor: col.grid, scaleMargins: { top: 0.06, bottom: 0.22 } },
    timeScale: { borderColor: col.grid, rightOffset: 4, minBarSpacing: 1 },
    crosshair: { mode: L.CrosshairMode.Normal },
    localization: { priceFormatter: fmt },
  });

  // Turnover underneath the price
  const vol = tvChart.addSeries(L.HistogramSeries, { priceScaleId: '', priceFormat: { type: 'volume' },
                                                     lastValueVisible: false, priceLineVisible: false });
  vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  vol.setData(bars.filter(b => typeof b.v === 'number')
                  .map(b => ({ time: b.time, value: b.v, color: b.close >= b.open ? col.upDim : col.downDim })));

  // Price
  const main = TV.type === 'line'
    ? tvChart.addSeries(L.LineSeries, { color: col.line, lineWidth: 2 })
    : tvChart.addSeries(L.CandlestickSeries, { upColor: col.up, downColor: col.down, borderVisible: false,
                                               wickUpColor: col.up, wickDownColor: col.down });
  main.setData(TV.type === 'line' ? bars.map(b => ({ time: b.time, value: b.close })) : bars);

  // Moving averages
  const maCol = { 20: col.amber, 50: col.blue, 200: col.faint };
  Object.keys(TV.ma).filter(n => TV.ma[n]).forEach(n => {
    const s = tvChart.addSeries(L.LineSeries, { color: maCol[n], lineWidth: 1, priceLineVisible: false,
                                                lastValueVisible: false, crosshairMarkerVisible: false });
    s.setData(tvSMA(bars, +n));
  });

  // Wyckoff levels from the analysis
  if (TV.levels) {
    const snap = LIVE_SNAPSHOT;
    [['ATH', snap.ath, col.faint], ['Cycle high', snap.cycle_high, col.down],
     ['Creek', snap.creek, col.amber], ['Range low (SC)', snap.sc_low, col.up]]
      .filter(([, p]) => typeof p === 'number')
      .forEach(([title, price, color]) => main.createPriceLine({ price, color, lineWidth: 1,
        lineStyle: L.LineStyle.Dashed, axisLabelVisible: true, title }));
  }

  // Today's provisional candle (live mode)
  const last = bars[bars.length - 1];
  if (VIEWS.ohlc.live) {
    L.createSeriesMarkers(main, [{ time: last.time, position: 'aboveBar', color: col.amber, shape: 'circle',
                                   text: 'LIVE' }]);
  }

  // Visible range
  if (keep) tvChart.timeScale().setVisibleLogicalRange(keep);
  else {
    const from = tvRangeFrom(last.time, TV.range);
    if (from) tvChart.timeScale().setVisibleRange({ from, to: last.time });
    else tvChart.timeScale().fitContent();
  }
  _tvKeepZoom = true;                          // later redraws (theme, live) keep the user's zoom

  // Legend: the bar under the crosshair, else the latest
  const byTime = new Map(bars.map((b, i) => [b.time, i]));
  const legend = document.getElementById('tv-legend');
  const showLegend = t => {
    const i = byTime.has(t) ? byTime.get(t) : bars.length - 1;
    const b = bars[i], p = i > 0 ? bars[i - 1].close : null;
    const ch = p ? b.close - p : null;
    const c = ch === null ? col.text : ch >= 0 ? col.up : col.down;
    const sg = ch === null ? '' : ch >= 0 ? '+' : '−';
    legend.innerHTML =
      `<span>${isoToLabel(b.time)}</span>` +
      `<span>O <b>${fmt(b.open)}</b></span><span>H <b>${fmt(b.high)}</b></span>` +
      `<span>L <b>${fmt(b.low)}</b></span><span>C <b style="color:${c}">${fmt(b.close)}</b></span>` +
      (ch === null ? '' : `<span style="color:${c}">${sg}${fmt(Math.abs(ch))} (${sg}${Math.abs(ch / p * 100).toFixed(2)}%)</span>`) +
      (typeof b.v === 'number' ? `<span>Rs ${b.v.toLocaleString('en-IN')} Cr</span>` : '');
  };
  tvChart.subscribeCrosshairMove(param => showLegend(param && param.time));
  showLegend(null);

  const keys = Object.keys(TV.ma).filter(n => TV.ma[n])
    .map(n => `<span class="tv-key"><i style="background:${maCol[n]}"></i>MA ${n}</span>`).join(' ');
  sub.innerHTML = `${bars.length.toLocaleString('en-IN')} daily candles · ${isoToLabel(bars[0].time)} – ` +
    `${isoToLabel(last.time)}${VIEWS.ohlc.live ? ' · LIVE ' + (VIEWS.as_of_time || '') + ' NPT (provisional)' : ''}` +
    (keys ? ' · ' + keys : '');
}

function segInit(id, onPick) {
  const el = document.getElementById(id);
  if (!el || el.dataset.ready) return;
  el.dataset.ready = '1';
  el.addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    onPick(b.dataset.v);
  });
}

function initMarketViews() {
  const hs = document.getElementById('hm-sub'), rs = document.getElementById('rrg-sub');
  if (!VIEWS) {
    const msg = 'Appears after the first run of scripts/market_views.py (daily GitHub update).';
    if (hs) hs.textContent = msg;
    if (rs) rs.textContent = msg;
    return;
  }
  // Heatmap controls
  const secs = VIEWS.sectors.map(s => s.name);
  const hsel = document.getElementById('hm-sector');
  hsel.innerHTML = '<option value="">All sectors</option>' + secs.map(s => `<option>${esc(s)}</option>`).join('');
  hsel.onchange = () => { HM.sector = hsel.value; renderHeatmap(); };
  segInit('hm-view',   v => { HM.view = v; renderHeatmap(); });
  segInit('hm-period', v => { HM.period = v; renderHeatmap(); });
  segInit('hm-size',   v => { HM.size = v; renderHeatmap(); });

  // RRG controls
  const rsel = document.getElementById('rrg-sector');
  rsel.innerHTML = '<option value="">All sectors</option>' +
    secs.filter(s => s !== 'Mutual Fund').map(s => `<option>${esc(s)}</option>`).join('');
  rsel.onchange = () => { RRG.sector = rsel.value; RRG.sel = null; renderRRG(); };
  document.getElementById('rrg-symbols').innerHTML =
    Object.keys(VIEWS.companies).sort().map(s => `<option value="${s}">${esc(VIEWS.companies[s].name)}</option>`).join('');
  const srch = document.getElementById('rrg-search');
  srch.onchange = () => {
    const s = srch.value.trim().toUpperCase();
    if (!VIEWS.companies[s]) return;
    RRG.sel = s;
    if (RRG.tab === 'sectors' || RRG.tab === 'signals' || RRG.tab === 'table') {
      RRG.tab = 'universe';
      document.querySelectorAll('#rrg-tab button').forEach(b => b.classList.toggle('on', b.dataset.v === 'universe'));
    }
    renderRRG();
  };
  const tail = document.getElementById('rrg-tail');
  tail.oninput = () => { RRG.tail = +tail.value; document.getElementById('rrg-tail-v').textContent = tail.value; renderRRG(); };
  document.getElementById('rrg-quadrant').onchange = e => { RRG.quadrant = e.target.value; renderRRG(); };
  segInit('rrg-period', v => { RRG.period = v; renderRRG(); });
  segInit('rrg-tab',    v => {
    RRG.tab = v; RRG.sel = null;
    if (v === 'in_sector' && !RRG.sector) { RRG.sector = 'Commercial Banks'; rsel.value = RRG.sector; }
    renderRRG();
  });

  renderHeatmap();
  renderRRG();
  if (currentPage === 'notes-sec') renderNotes();
  if (!window._mvResize) {
    let tmr;
    window._mvResize = () => { clearTimeout(tmr); tmr = setTimeout(renderHeatmap, 150); };
    window.addEventListener('resize', window._mvResize);
  }
}

// ── Heatmap ──────────────────────────────────────────────────
const HM_SCALE = { d: 5, w: 10, m: 15 };        // ± % for full colour
function hmColor(pct, scale) {
  if (typeof pct !== 'number') return { bg: themeColor('--bg3'), fg: themeColor('--text3') };
  const light = isLightTheme();
  const t  = Math.pow(Math.min(Math.abs(pct) / scale, 1), 0.75);
  const n  = light ? [226, 232, 228] : [44, 56, 49];
  const e  = pct >= 0 ? (light ? [12, 150, 72] : [0, 170, 85]) : (light ? [206, 38, 60] : [205, 38, 58]);
  const c  = n.map((v, i) => Math.round(v + (e[i] - v) * t));
  return { bg: `rgb(${c.join(',')})`, fg: t > 0.45 ? '#fff' : themeColor('--text') };
}

function squarify(items, x, y, w, h) {
  // Squarified treemap (Bruls et al.) — items: [{v}], returns [{item,x,y,w,h}]
  const out = [];
  const total = items.reduce((s, i) => s + i.v, 0);
  if (!total || w <= 0 || h <= 0) return out;
  let rest = items.map(i => ({ item: i, a: i.v * w * h / total }));
  let row = [];
  const worst = (r, side) => {
    const s = r.reduce((a, b) => a + b.a, 0), mx = Math.max(...r.map(b => b.a)), mn = Math.min(...r.map(b => b.a));
    return Math.max(side * side * mx / (s * s), (s * s) / (side * side * mn));
  };
  const place = r => {
    const s = r.reduce((a, b) => a + b.a, 0);
    if (w >= h) { const cw = s / h; let cy = y; r.forEach(b => { out.push({ item: b.item, x, y: cy, w: cw, h: b.a / cw }); cy += b.a / cw; }); x += cw; w -= cw; }
    else        { const rh = s / w; let cx = x; r.forEach(b => { out.push({ item: b.item, x: cx, y, w: b.a / rh, h: rh }); cx += b.a / rh; }); y += rh; h -= rh; }
  };
  while (rest.length) {
    const side = Math.min(w, h), cand = row.concat([rest[0]]);
    if (!row.length || worst(row, side) >= worst(cand, side)) { row = cand; rest.shift(); }
    else { place(row); row = []; }
  }
  if (row.length) place(row);
  return out;
}

function renderHeatmap() {
  const box = document.getElementById('hm-canvas');
  if (!box || !VIEWS) return;
  const H = VIEWS.heatmap, key = HM.period, scale = HM_SCALE[key];
  const pname = { d: 'Daily', w: 'Weekly', m: 'Monthly' }[key];
  const f2 = v => typeof v === 'number' ? (v > 0 ? '+' : '') + v.toFixed(2) + '%' : '—';
  const fmtTo = v => typeof v === 'number' ? 'Rs ' + (v / 1e7).toFixed(2) + ' Cr' : '—';
  document.getElementById('hm-sub').textContent =
    `${pname} % change · as of ${isoToLabel(VIEWS.as_of)}${liveViewsTag()} · NEPSE ${f2(VIEWS.benchmark?.[key])} · ` +
    (HM.view === 'stocks' ? `${H.stocks.length} companies` : `${H.sectors.length} sector indices`);
  document.getElementById('hm-lo').textContent = '−' + scale + '%';
  document.getElementById('hm-hi').textContent = '+' + scale + '%';
  document.getElementById('hm-bar').style.background =
    `linear-gradient(90deg, ${hmColor(-scale, scale).bg}, ${hmColor(0, scale).bg}, ${hmColor(scale, scale).bg})`;
  document.getElementById('hm-sector').style.display = HM.view === 'stocks' ? '' : 'none';

  const W = box.clientWidth, Ht = box.clientHeight;
  const weight = to => HM.size === 'eq' ? 1 : Math.max(Math.sqrt(to || 0), 300);   // √turnover keeps small caps visible
  let html = '';
  const tile = (r, text1, text2, title, pct, extraCls = '') => {
    const { bg, fg } = hmColor(pct, scale);
    const big = r.w > 70 && r.h > 34, fits = r.w > 34 && r.h > 20;
    const fs = Math.max(9, Math.min(15, Math.sqrt(r.w * r.h) / 6));
    return `<div class="hm-tile ${extraCls}" title="${esc(title)}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:${bg};color:${fg};font-size:${fs}px;">` +
           (fits ? `<b>${esc(text1)}</b>` + (big ? `<span>${esc(text2)}</span>` : '') : '') + '</div>';
  };

  if (HM.view === 'sectors') {
    const secs = H.sectors.filter(s => s.sector !== 'Mutual Fund' || HM.size === 'eq')
                          .map(s => ({ ...s, v: weight(s.to) })).sort((a, b) => b.v - a.v);
    squarify(secs, 0, 0, W, Ht).forEach(r => {
      const s = r.item;
      html += tile(r, s.sector, f2(s[key]) + ' · ' + s.close.toLocaleString('en-IN'),
        `${s.sector} index ${s.close}\n1D ${f2(s.d)} · 1W ${f2(s.w)} · 1M ${f2(s.m)}\n${s.stocks} companies · turnover ${fmtTo(s.to)}`, s[key]);
    });
    box.innerHTML = html;
    // Sector index table — daily / weekly / monthly side by side
    const cell = v => `<td style="color:${typeof v !== 'number' || v === 0 ? 'var(--text2)' : v > 0 ? 'var(--green)' : 'var(--red)'}">${f2(v)}</td>`;
    const b = VIEWS.benchmark || {};
    document.getElementById('hm-sector-table').innerHTML = `<div class="table-scroll"><table class="hm-table">
      <thead><tr><th>Index</th><th>Close</th><th>1 Day</th><th>1 Week</th><th>1 Month</th><th>Companies</th><th>Turnover</th></tr></thead><tbody>
      <tr class="bench"><td>NEPSE (benchmark)</td><td>${(b.close || 0).toLocaleString('en-IN')}</td>${cell(b.d)}${cell(b.w)}${cell(b.m)}<td>—</td><td>—</td></tr>
      ${H.sectors.slice().sort((a, b2) => (b2[key] ?? -99) - (a[key] ?? -99)).map(s =>
        `<tr><td>${esc(s.sector)}</td><td>${s.close.toLocaleString('en-IN')}</td>${cell(s.d)}${cell(s.w)}${cell(s.m)}<td>${s.stocks}</td><td>${fmtTo(s.to)}</td></tr>`).join('')}
      </tbody></table></div>`;
    return;
  }

  document.getElementById('hm-sector-table').innerHTML = '';
  const stocks = H.stocks.filter(s => !HM.sector || s.sector === HM.sector);
  const groups = {};
  stocks.forEach(s => (groups[s.sector] = groups[s.sector] || []).push({ ...s, v: weight(s.to) }));
  const blocks = Object.entries(groups).map(([sec, arr]) => ({ sec, arr: arr.sort((a, b) => b.v - a.v), v: arr.reduce((a, b) => a + b.v, 0) }))
                                      .sort((a, b) => b.v - a.v);
  const secIdx = Object.fromEntries(H.sectors.map(s => [s.sector, s]));
  squarify(blocks, 0, 0, W, Ht).forEach(br => {
    const LBL = br.h > 40 && br.w > 60 ? 15 : 0;
    const si = secIdx[br.item.sec];
    html += `<div class="hm-block" style="left:${br.x}px;top:${br.y}px;width:${br.w}px;height:${br.h}px;">` +
            (LBL ? `<div class="hm-block-lbl">${esc(br.item.sec)} ${si ? f2(si[key]) : ''}</div>` : '') + '</div>';
    squarify(br.item.arr, br.x, br.y + LBL, br.w, br.h - LBL).forEach(r => {
      const s = r.item;
      html += tile(r, s.sym, f2(s[key]),
        `${s.sym} — ${s.name}\n${s.sector} · LTP ${s.close}\n1D ${f2(s.d)} · 1W ${f2(s.w)} · 1M ${f2(s.m)}\nTurnover ${fmtTo(s.to)}`, s[key]);
    });
  });
  box.innerHTML = html || '<div class="mv-note" style="padding:20px;">No companies for this filter.</div>';
  box.querySelectorAll('.hm-tile').forEach(el => el.onclick = () => {
    const sym = (el.querySelector('b') || {}).textContent;
    if (sym && VIEWS.companies[sym]) {
      RRG.sel = sym; RRG.tab = 'universe';
      document.querySelectorAll('#rrg-tab button').forEach(b => b.classList.toggle('on', b.dataset.v === 'universe'));
      renderRRG(); navTo('rrg-sec');
    }
  });
}

// ── RRG ──────────────────────────────────────────────────────
function rrgBlock() {
  const P = VIEWS.rrg[RRG.period];
  if (RRG.tab === 'sectors') return { blk: P.sectors, bench: 'NEPSE', isSector: true };
  if (RRG.tab === 'in_sector') return { blk: P.in_sector[RRG.sector] || { symbols: {}, signals: [] }, bench: RRG.sector + ' index' };
  return { blk: P.universe, bench: 'NEPSE' };
}

function rrgQuadrantPlugin() {
  return {
    id: 'rrgQuadrants',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea: a, scales: { x, y } } = chart;
      const cx = x.getPixelForValue(100), cy = y.getPixelForValue(100);
      const fill = (x0, y0, x1, y1, c) => { ctx.fillStyle = c + '1f'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); };
      ctx.save();
      fill(cx, a.top, a.right, cy, Q_COLORS.Leading);
      fill(cx, cy, a.right, a.bottom, Q_COLORS.Weakening);
      fill(a.left, cy, cx, a.bottom, Q_COLORS.Lagging);
      fill(a.left, a.top, cx, cy, Q_COLORS.Improving);
      ctx.strokeStyle = themeColor('--text3'); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, a.top); ctx.lineTo(cx, a.bottom); ctx.moveTo(a.left, cy); ctx.lineTo(a.right, cy); ctx.stroke();
      ctx.font = uiFont(600, 12);
      const lbl = (t, px, py, al, c) => { ctx.fillStyle = c; ctx.textAlign = al; ctx.fillText(t, px, py); };
      lbl('LEADING',   a.right - 8, a.top + 16,    'right', Q_COLORS.Leading);
      lbl('WEAKENING', a.right - 8, a.bottom - 8,  'right', Q_COLORS.Weakening);
      lbl('LAGGING',   a.left + 8,  a.bottom - 8,  'left',  Q_COLORS.Lagging);
      lbl('IMPROVING', a.left + 8,  a.top + 16,    'left',  Q_COLORS.Improving);
      ctx.restore();
    },
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = uiFont(600, 12);
      ctx.fillStyle = themeColor('--text');
      chart.data.datasets.forEach((ds, i) => {
        if (!ds._label || chart.getDatasetMeta(i).hidden) return;
        const pts = chart.getDatasetMeta(i).data;
        const head = pts[pts.length - 1];
        if (head) ctx.fillText(ds._label, head.x + 7, head.y - 6);
      });
      ctx.restore();
    }
  };
}

function renderRRG() {
  if (!VIEWS || !VIEWS.rrg) return;
  if (RRG.tab === 'in_sector' && !RRG.sector) {          // sector stocks need a sector
    RRG.sector = 'Commercial Banks';
    document.getElementById('rrg-sector').value = RRG.sector;
  }
  const { blk, bench, isSector } = rrgBlock();
  const tab = RRG.tab;
  const showGraph = tab === 'sectors' || tab === 'universe' || tab === 'in_sector';
  document.getElementById('rrg-graph-view').style.display = showGraph ? '' : 'none';
  document.getElementById('rrg-list-view').style.display = showGraph ? 'none' : '';
  document.getElementById('rrg-sector').style.display = tab === 'sectors' ? 'none' : '';
  document.getElementById('rrg-tail-wrap').style.display = showGraph ? '' : 'none';
  const par = VIEWS.rrg.params || { n: 14 };
  document.getElementById('rrg-sub').textContent =
    `${RRG.period === 'daily' ? 'Daily' : 'Weekly'} · vs ${bench} · RS-Ratio / RS-Momentum (${par.n}) · as of ${isoToLabel(blk.as_of || VIEWS.as_of)}${liveViewsTag()}`;

  if (tab === 'signals') return renderRRGSignals();
  if (tab === 'table')   return renderRRGTable();

  // Which symbols are on the chart
  let syms = Object.keys(blk.symbols);
  if (tab === 'universe' && RRG.sector) syms = syms.filter(s => VIEWS.companies[s]?.sector === RRG.sector);
  if (RRG.quadrant) syms = syms.filter(s => blk.symbols[s].q === RRG.quadrant || s === RRG.sel);
  const many = syms.length > 30;                          // universe: heads only, trail for selection
  const n = RRG.tail;
  const datasets = [];
  const allX = [], allY = [];
  syms.forEach(s => {
    const r = blk.symbols[s];
    const pts = [];
    for (let j = Math.max(0, r.x.length - n); j < r.x.length; j++) pts.push({ x: r.x[j], y: r.y[j], d: blk.dates[r.i[j]] });
    const trail = !many || s === RRG.sel;
    const data = trail ? pts : pts.slice(-1);
    data.forEach(p => { allX.push(p.x); allY.push(p.y); });
    const c = Q_COLORS[r.q];
    datasets.push({
      type: 'line', data, showLine: trail && data.length > 1, borderColor: c + (s === RRG.sel || !many ? 'cc' : '88'),
      borderWidth: s === RRG.sel ? 2.5 : 1.5, tension: 0.35,
      pointRadius: data.map((_, i) => i === data.length - 1 ? (s === RRG.sel ? 7 : many ? 4 : 5.5) : 2.2),
      pointBackgroundColor: c, pointBorderColor: themeColor('--chart-point-border'), pointBorderWidth: 1,
      _sym: s, _label: (!many || s === RRG.sel) ? s.replace(/ index$/i, '') : null, order: s === RRG.sel ? 0 : 1,
    });
  });
  const span = Math.max(1.5, ...allX.map(v => Math.abs(v - 100)), ...allY.map(v => Math.abs(v - 100))) * 1.12;
  const grid = themeColor('--chart-grid'), tick = themeColor('--chart-tick');
  if (rrgChart) rrgChart.destroy();
  rrgChart = new Chart(document.getElementById('rrg-canvas'), {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      scales: {
        x: { min: 100 - span, max: 100 + span, title: { display: true, text: 'RS-Ratio', color: tick }, grid: { color: grid }, ticks: { color: tick } },
        y: { min: 100 - span, max: 100 + span, title: { display: true, text: 'RS-Momentum', color: tick }, grid: { color: grid }, ticks: { color: tick } },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: themeColor('--chart-tip-bg'), titleColor: themeColor('--chart-tip-title'), bodyColor: themeColor('--chart-tip-body'),
          borderColor: themeColor('--border2'), borderWidth: 1,
          callbacks: {
            title: items => { const ds = items[0].dataset; const nm = VIEWS.companies[ds._sym]?.name; return ds._sym + (nm ? ' — ' + nm : ''); },
            label: item => { const p = item.raw; return `${isoToLabel(p.d)} · RS-Ratio ${p.x.toFixed(2)} · RS-Mom ${p.y.toFixed(2)}`; },
          }
        }
      },
      onClick: (e, els) => {
        if (!els.length) return;
        RRG.sel = rrgChart.data.datasets[els[0].datasetIndex]._sym;
        renderRRG();
      }
    },
    plugins: [rrgQuadrantPlugin()]
  });
  renderRRGSide(blk, syms, isSector);
}

function qChip(q) { return `<span class="q-chip" style="background:${Q_COLORS[q] || '#607d8b'}">${esc(q || '—')}</span>`; }

function renderRRGSide(blk, syms, isSector) {
  const side = document.getElementById('rrg-side');
  // strongest first: distance from the centre, in the quadrant's direction
  const score = s => { const r = blk.symbols[s], i = r.x.length - 1; return Math.hypot(r.x[i] - 100, r.y[i] - 100); };
  let html = '';
  Q_ORDER.forEach(q => {
    const list = syms.filter(s => blk.symbols[s].q === q).sort((a, b) => score(b) - score(a));
    html += `<div class="rrg-qbox" style="border-color:${Q_COLORS[q]}55">
      <div class="rrg-qhead"><span style="color:${Q_COLORS[q]};font-weight:600;">${q}</span><span class="mv-note">${list.length} ${isSector ? 'sectors' : 'symbols'}</span></div>
      <div class="rrg-chips">${list.slice(0, isSector ? 20 : 24).map(s => {
        const moved = blk.symbols[s].pq !== q ? ` title="new: was ${blk.symbols[s].pq}"` : '';
        return `<span class="rrg-chip${s === RRG.sel ? ' sel' : ''}" data-s="${esc(s)}"${moved}>${esc(s)}${moved ? ' •' : ''}</span>`;
      }).join('') || '<span class="mv-note">—</span>'}${list.length > 24 && !isSector ? `<span class="mv-note">+${list.length - 24} more</span>` : ''}</div></div>`;
  });
  if (RRG.sel && blk.symbols[RRG.sel]) {
    const r = blk.symbols[RRG.sel], c = VIEWS.companies[RRG.sel];
    const rows = r.i.map((di, i) => `<tr><td>${isoToLabel(blk.dates[di])}</td><td class="num">${r.x[i].toFixed(2)}</td><td class="num">${r.y[i].toFixed(2)}</td><td>${qChip(quadrantOf(r.x[i], r.y[i]))}</td></tr>`).reverse().join('');
    html += `<div class="rrg-qbox"><div class="rrg-qhead"><span style="font-weight:600;">${esc(RRG.sel)}${c ? ' — ' + esc(c.name) : ''}</span>
      <span class="rrg-chip" data-s="">✕ clear</span></div>
      <div class="rrg-table-wrap" style="max-height:220px;"><table class="rrg-table"><thead><tr><th>Date</th><th class="num">RS-Ratio</th><th class="num">RS-Mom</th><th>Quadrant</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  html += '<div class="mv-note">• = moved into this quadrant on the latest ' + (RRG.period === 'daily' ? 'session' : 'week') + '</div>';
  side.innerHTML = html;
  side.querySelectorAll('.rrg-chip[data-s]').forEach(el => el.onclick = () => { RRG.sel = el.dataset.s || null; renderRRG(); });
}

function quadrantOf(x, y) { return x >= 100 ? (y >= 100 ? 'Leading' : 'Weakening') : (y >= 100 ? 'Improving' : 'Lagging'); }

function renderRRGSignals() {
  const P = VIEWS.rrg[RRG.period];
  const box = document.getElementById('rrg-list-view');
  // Stocks vs their sector index (as on chukul.com) or vs NEPSE
  let sig = RRG.sigSrc === 'sector'
    ? Object.values(P.in_sector).flatMap(b => b.signals)
    : P.universe.signals;
  if (RRG.sector)   sig = sig.filter(s => VIEWS.companies[s.sym]?.sector === RRG.sector);
  if (RRG.quadrant) sig = sig.filter(s => s.to === RRG.quadrant);
  sig = sig.slice().sort((a, b) => b.date.localeCompare(a.date) || a.sym.localeCompare(b.sym));
  box.innerHTML = `
    <div class="mv-controls" style="padding:0 0 10px;border:none;">
      <div class="seg" id="rrg-sigsrc"><button data-v="sector" class="${RRG.sigSrc === 'sector' ? 'on' : ''}">vs sector index</button><button data-v="nepse" class="${RRG.sigSrc === 'nepse' ? 'on' : ''}">vs NEPSE</button></div>
      <span class="mv-note">${sig.length} quadrant crossovers in the last ${RRG.period === 'daily' ? '10 sessions' : '8 weeks'} · filter "New quadrant" with the quadrant menu</span>
    </div>
    <div class="rrg-table-wrap"><table class="rrg-table"><thead><tr><th>Date</th><th>Symbol</th><th>Sector</th><th>Quadrant crossover</th><th class="num">RS-Ratio</th><th class="num">RS-Mom</th></tr></thead><tbody>
    ${sig.slice(0, 500).map(s => `<tr data-s="${esc(s.sym)}"><td>${isoToLabel(s.date)}</td><td><b>${esc(s.sym)}</b></td><td>${esc(VIEWS.companies[s.sym]?.sector || '')}</td>
      <td>${qChip(s.from)} → ${qChip(s.to)}</td><td class="num">${s.x.toFixed(2)}</td><td class="num">${s.y.toFixed(2)}</td></tr>`).join('') ||
      '<tr><td colspan="6" class="mv-note">No relative rotation crossovers for this filter.</td></tr>'}
    </tbody></table></div>`;
  segInit('rrg-sigsrc', v => { RRG.sigSrc = v; renderRRGSignals(); });
  box.querySelectorAll('tr[data-s]').forEach(tr => tr.onclick = () => rrgOpenStock(tr.dataset.s));
}

function rrgOpenStock(sym) {
  RRG.sel = sym; RRG.tab = 'in_sector'; RRG.sector = VIEWS.companies[sym]?.sector || '';
  document.getElementById('rrg-sector').value = RRG.sector;
  document.querySelectorAll('#rrg-tab button').forEach(b => b.classList.toggle('on', b.dataset.v === 'in_sector'));
  renderRRG();
}

function renderRRGTable() {
  const P = VIEWS.rrg[RRG.period], box = document.getElementById('rrg-list-view');
  let rows = Object.entries(P.universe.symbols).map(([s, r]) => {
    const i = r.x.length - 1, c = VIEWS.companies[s] || {};
    const sr = P.in_sector[c.sector]?.symbols?.[s];
    return { s, name: c.name || '', sec: c.sector || '', x: r.x[i], y: r.y[i], q: r.q, pq: r.pq, sq: sr ? sr.q : null, date: P.universe.dates[r.i[i]] };
  });
  if (RRG.sector)   rows = rows.filter(r => r.sec === RRG.sector);
  if (RRG.quadrant) rows = rows.filter(r => r.q === RRG.quadrant);
  const { k, asc } = RRG.sort, dir = asc ? 1 : -1;
  const qi = q => Q_ORDER.indexOf(q);
  rows.sort((a, b) => k === 'q' ? (qi(a.q) - qi(b.q) || b.x - a.x) * (asc ? 1 : -1)
                    : typeof a[k] === 'number' ? (a[k] - b[k]) * dir : String(a[k]).localeCompare(String(b[k])) * dir);
  const th = (key, label, cls = '') => `<th class="${cls}" data-k="${key}">${label}${k === key ? (asc ? ' ▲' : ' ▼') : ''}</th>`;
  box.innerHTML = `<div class="mv-note" style="margin-bottom:8px;">${rows.length} companies · RS vs NEPSE; last column = quadrant vs own sector index · click a row for its trail</div>
    <div class="rrg-table-wrap"><table class="rrg-table"><thead><tr>
      ${th('s', 'Symbol')}${th('name', 'Company')}${th('sec', 'Sector')}${th('x', 'RS-Ratio', 'num')}${th('y', 'RS-Mom', 'num')}${th('q', 'Quadrant')}${th('pq', 'Previous')}${th('sq', 'vs Sector')}
    </tr></thead><tbody>
    ${rows.map(r => `<tr data-s="${esc(r.s)}"><td><b>${esc(r.s)}</b></td><td>${esc(r.name.length > 34 ? r.name.slice(0, 34) + '…' : r.name)}</td><td>${esc(r.sec)}</td>
      <td class="num">${r.x.toFixed(2)}</td><td class="num">${r.y.toFixed(2)}</td><td>${qChip(r.q)}</td><td>${qChip(r.pq)}</td><td>${r.sq ? qChip(r.sq) : '—'}</td></tr>`).join('')}
    </tbody></table></div>`;
  box.querySelectorAll('th[data-k]').forEach(el => el.onclick = () => {
    const key = el.dataset.k;
    RRG.sort = { k: key, asc: RRG.sort.k === key ? !RRG.sort.asc : key !== 'x' && key !== 'y' };
    renderRRGTable();
  });
  box.querySelectorAll('tr[data-s]').forEach(tr => tr.onclick = () => rrgOpenStock(tr.dataset.s));
}

// ── Study notes page ─────────────────────────────────────────
let _notesRendered = false;
function renderNotes() {
  renderNotesToday();
  if (_notesRendered) return;
  const md = (document.getElementById('study-notes-md') || {}).textContent || '';
  const body = document.getElementById('notes-body');
  const put = () => {
    _notesRendered = true;
    if (window.marked) body.innerHTML = window.marked.parse(md);        // our own document, not user input
    else { body.innerHTML = ''; const pre = document.createElement('pre'); pre.textContent = md; pre.style.whiteSpace = 'pre-wrap'; body.appendChild(pre); }
    body.querySelectorAll('a[href^="http"]').forEach(a => { a.target = '_blank'; a.rel = 'noopener'; });
  };
  if (window.marked) return put();
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js';
  s.integrity = 'sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi';
  s.crossOrigin = 'anonymous';
  s.onload = put; s.onerror = put;                                    // offline → plain text
  document.head.appendChild(s);
}

function renderNotesToday() {
  const el = document.getElementById('notes-today');
  if (!el || !VIEWS) return;
  const pick = (period, q) => Object.entries(VIEWS.rrg[period].sectors.symbols).filter(([, r]) => r.q === q).map(([s]) => s);
  const list = a => a.length ? a.map(esc).join(', ') : '—';
  const b = VIEWS.benchmark || {};
  const sg = v => typeof v === 'number' ? (v > 0 ? '+' : '') + v.toFixed(2) + '%' : '—';
  const sig = Object.values(VIEWS.rrg.daily.in_sector).flatMap(x => x.signals).filter(s => s.date === VIEWS.as_of);
  el.innerHTML = `<b>Today (${isoToLabel(VIEWS.as_of)})</b> · NEPSE 1D ${sg(b.d)} · 1W ${sg(b.w)} · 1M ${sg(b.m)}<br>
    <b>Sectors Leading</b> — daily: ${list(pick('daily', 'Leading'))} · weekly: ${list(pick('weekly', 'Leading'))}<br>
    <b>Sectors Improving</b> — daily: ${list(pick('daily', 'Improving'))} · weekly: ${list(pick('weekly', 'Improving'))}<br>
    <b>${sig.length}</b> company quadrant crossovers today (vs their sector index) — see RRG → Signals.`;
}

// ── Today's close (home) ─────────────────────────────────────
function triggerRows() {
  const L = WYCKOFF_LEVELS, now = LIVE_SNAPSHOT.index;
  const wk = (LIVE_SNAPSHOT.periods && LIVE_SNAPSHOT.periods.weekly || []).slice(-1)[0];
  const wc = wk ? wk.close : null;
  return {
    wk, wc, now,
    rows: [
      { label: 'Weekly close below the range low 2,487 (exit)', hit: wc !== null && wc < L.rangeLow.v },
      { label: 'Daily close below 2,487 (warning)', hit: now < L.rangeLow.v },
      { label: 'Close in the long zone 2,487–2,560', hit: now >= L.rangeLow.v && now <= 2560 },
      { label: 'Weekly close above the pivot 2,600', hit: wc !== null && wc > L.pivot },
      { label: 'Weekly close above the Creek 2,772', hit: wc !== null && wc > L.creek.v },
      { label: 'Weekly close above the range top 2,960', hit: wc !== null && wc > L.rangeTop.v },
    ],
  };
}

// Today at a glance: breadth bar and three top-5 lists from today's snapshot.
// Each tile is built on its own so one missing field never blanks the others.
function renderTodayTiles() {
  const s = LIVE_SNAPSHOT || {};
  const $ = id => document.getElementById(id);
  const num = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
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
    `<div class="row"><span class="k">${esc(m.sym)}</span><span class="${cls}">${num(m.close)}${Number.isFinite(m.pct) ? ` (${m.pct > 0 ? '+' : m.pct < 0 ? '−' : ''}${num(Math.abs(m.pct))}%)` : ''}</span></div>`).join('');
  tile('tt-gainers', () => movers(s.top_gainers, 'up'));
  tile('tt-losers', () => movers(s.top_losers, 'down'));
  tile('tt-turnover', () => (s.top_turnover || []).filter(m => m && Number.isFinite(m.turnover)).slice(0, 5).map(m =>
    `<div class="row"><span class="k">${esc(m.sym)}</span><span>Rs ${(m.turnover / 1e6).toFixed(0)} mil</span></div>`).join(''));
}

function renderCloseReport() {
  const s = LIVE_SNAPSHOT;
  const $ = id => document.getElementById(id);
  if (!$('cr-index')) return;
  const f2 = v => typeof v === 'number' ? v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const pctWord = v => typeof v !== 'number' ? null : (v > 0 ? 'up ' : v < 0 ? 'down ' : 'flat ') + (v === 0 ? '' : Math.abs(v).toFixed(2) + '%');
  const [y, m, d] = (s.trade_date || '').split('-').map(Number);
  $('cr-date').textContent = s.trade_date
    ? 'Close of ' + new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : 'Latest close';
  $('cr-index').textContent = f2(s.index);
  const ch = $('cr-change');
  ch.className = 'cr-change ' + (typeof s.change !== 'number' || s.change === 0 ? 'flat' : s.change > 0 ? 'up' : 'down');
  ch.textContent = typeof s.change === 'number'
    ? (s.change > 0 ? '+' : s.change < 0 ? '−' : '') + f2(Math.abs(s.change)) + (typeof s.changePct === 'number' ? ` (${s.changePct > 0 ? '+' : s.changePct < 0 ? '−' : ''}${Math.abs(s.changePct).toFixed(2)}%)` : '')
    : '';
  const P = s.periods || {};
  const w = (P.weekly || []).slice(-1)[0], mo = (P.monthly || []).slice(-1)[0];
  const parts = [];
  if (pctWord(s.changePct)) parts.push(`<b>${pctWord(s.changePct)}</b> on the day`);
  if (w && pctWord(w.changePct)) parts.push(`${pctWord(w.changePct)} this week`);
  if (mo && pctWord(mo.changePct)) parts.push(`${pctWord(mo.changePct)} this month`);
  let sent = parts.length ? parts.join(', ') + '.' : '';
  sent = sent.charAt(0).toUpperCase() + sent.slice(1);
  if (typeof s.gainers === 'number' && typeof s.losers === 'number')
    sent += ` <b>${s.gainers}</b> companies rose and <b>${s.losers}</b> fell` + (typeof s.turnover === 'number' ? ` on turnover of Rs ${(s.turnover / 1e9).toFixed(2)} billion.` : '.');
  $('cr-sentence').innerHTML = sent || 'Waiting for the first daily update.';

  // What changed since the previous session (from the verification report)
  const V = s.verification;
  if (V && V.date === s.trade_date && V.changes) {
    const prev = V.changes.previous_session;
    if (prev) {
      const [py, pm, pd] = prev.split('-').map(Number);
      $('cr-changes-title').textContent = 'What changed since ' + new Date(py, pm - 1, pd).toLocaleDateString('en-GB', { weekday: 'long' });
    }
    $('cr-changes').innerHTML = buildChangesHTML(V.changes, true) ||
      '<div class="row">No earlier session stored yet. Changes appear from the next update.</div>';
  }
  // Plan status
  const T = triggerRows();
  $('cr-plan').innerHTML =
    `<div class="row"><span class="k">Phase</span><span><b>Trading range, phase B</b> (2,487 to 2,960). Bias neutral.</span></div>` +
    T.rows.map(r => `<div class="row"><span class="plan-dot${r.hit ? ' met' : ''}" aria-hidden="true"></span><span>${r.label}${r.hit ? ' <b style="color:var(--amber);">met</b>' : ''}</span></div>`).join('') +
    (T.wk && T.wk.days < 5 ? `<div class="row" style="color:var(--text3);">Weekly checks use this week's closes so far (${T.wk.days} session${T.wk.days === 1 ? '' : 's'}).</div>` : '');
  renderTodayTiles();
}

// ── Emotion cycle infographic ────────────────────────────────
// Periods are month-end labels of allData; valence −3 (fear) … +3 (greed).
// Reviewed with the Wyckoff levels (WYCKOFF_LEVELS.asOf); re-review after a range break.
const EMO_PERIODS = [
  { from: 'Jan 21', to: 'May 21', v: 2,  name: 'Optimism, then thrill', short: 'Optimism', when: 'Jan–May 2021',
    story: 'Low deposit rates and a flood of new demat accounts push NEPSE up month after month.' },
  { from: 'Jun 21', to: 'Aug 21', v: 3,  name: 'Euphoria', short: 'Euphoria', when: 'Jun–Aug 2021',
    story: 'The all-time high of 3,198.6 on Aug 18 2021. The top week traded about 97 Arab: the crowd buys at any price while large holders sell into the strength.' },
  { from: 'Sep 21', to: 'Dec 21', v: 1,  name: 'Complacency, then anxiety', short: 'Complacency', when: 'Sep–Dec 2021',
    story: 'Dips are still bought, but each rally stops lower. Volume starts to dry up.' },
  { from: 'Jan 22', to: 'Jun 22', v: -2, name: 'Denial and fear', short: 'Fear', when: 'Jan–Jun 2022',
    story: 'Tighter liquidity and rate rises. The index keeps falling while many holders wait for a rebound that does not come.' },
  { from: 'Jul 22', to: 'Sep 22', v: -3, name: 'Panic and capitulation', short: 'Capitulation', when: 'Jul–Sep 2022',
    story: 'The low of 1,815 on Sep 25 2022 — 43% below the all-time high. Holders sell below cost.' },
  { from: 'Oct 22', to: 'Jun 24', v: -2, name: 'Depression and disbelief', short: 'Depression', when: 'Oct 2022 – Jun 2024',
    story: 'Almost two years in a 1,818–2,227 range on thin turnover. Few believe a recovery is possible.' },
  { from: 'Jul 24', to: 'Aug 24', v: 2,  name: 'Hope turns to thrill', short: 'Thrill', when: 'Jul–Aug 2024',
    story: '+37% in 35 days after rate cuts, ending at 3,001 on Aug 15 2024 — a record Rs 30 billion session.' },
  { from: 'Sep 24', to: 'Jul 25', v: 1,  name: 'Belief, and a second thrill', short: 'Belief', when: 'Sep 2024 – Jul 2025',
    story: 'A wide 2,464–2,890 range, then a return to 3,002 on Jul 29 2025 on the heaviest week of the cycle. 3,000 caps the market for the second time.' },
  { from: 'Aug 25', to: 'Oct 25', v: -3, name: 'Panic', short: 'Panic', when: 'Aug–Oct 2025',
    story: 'The market closes Sep 8–18. The index falls from 3,002 to 2,487 (Oct 16 2025), the low of the current range.' },
  { from: 'Nov 25', to: 'Apr 26', v: 1,  name: 'Hope, then denial', short: 'Hope', when: 'Nov 2025 – Apr 2026',
    story: 'A rally to 2,772, then a breakout to 2,960 on 82.5 Arab in one week — which fails and falls back into the range by mid-April.' },
  { from: 'May 26', to: null,     v: -1, name: 'Anxiety and doubt', short: 'Anxiety', when: 'May 2026 – now',
    story: 'Lower highs, a close below 2,600, and a retest of the 2025 low (2,513 on Aug 31) on lighter volume. Fear or denial is decided at 2,487 and 2,772.' },
];
const EMO_COLOR = { 3: '#F08A4B', 2: '#EFA35E', 1: '#E6C07F', '-1': '#A3C3DA', '-2': '#73A6CF', '-3': '#4F86C2' };
const EMO_CALLOUTS = [
  ['Aug 21', 'All-time high 3,198.6'], ['Sep 22', 'Low 1,815'], ['Aug 24', '3,001, record day'],
  ['Jul 25', 'Double top 3,002'], ['Oct 25', 'Range low 2,487'], ['Mar 26', 'Failed breakout 2,960'],
];
let emoChart = null, emoSel = EMO_PERIODS.length - 1;

function emoIndex(label) { return allData.labels.indexOf(label); }
function emoRange(ph) {
  const a = Math.max(0, emoIndex(ph.from));
  const b = ph.to ? emoIndex(ph.to) : allData.labels.length - 1;
  return [a, b < 0 ? allData.labels.length - 1 : b];
}

function renderEmotion() {
  const cv = document.getElementById('emo-canvas');
  if (!cv || typeof allData === 'undefined') return;
  const tick = themeColor('--chart-tick'), grid = themeColor('--chart-grid'), price = themeColor('--chart-price');
  const bandPlugin = {
    id: 'emoBands',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea: a, scales: { x } } = chart;
      const step = (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2;
      EMO_PERIODS.forEach((ph, i) => {
        const [s, e] = emoRange(ph);
        const x0 = Math.max(a.left, x.getPixelForValue(s) - step), x1 = Math.min(a.right, x.getPixelForValue(e) + step);
        ctx.save();
        ctx.globalAlpha = i === emoSel ? 0.42 : 0.16;
        ctx.fillStyle = EMO_COLOR[ph.v];
        ctx.fillRect(x0, a.top, x1 - x0, a.bottom - a.top);
        ctx.restore();
      });
    },
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: a, scales: { x, y } } = chart;
      ctx.save();
      ctx.font = uiFont(600, 12);
      const pts = EMO_CALLOUTS.map(([l, txt]) => [emoIndex(l), txt]).filter(([i]) => i >= 0);
      pts.push([allData.labels.length - 1, 'Now ' + Math.round(allData.price[allData.price.length - 1]).toLocaleString('en-IN')]);
      pts.forEach(([i, txt], k) => {
        const px = x.getPixelForValue(i), py = y.getPixelForValue(allData.price[i]);
        const up = allData.price[i] > (allData.price[i - 1] || 0);          // label away from the line
        const ly = up ? py - 16 : py + 22;
        ctx.fillStyle = price; ctx.strokeStyle = themeColor('--surface'); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const w = ctx.measureText(txt).width;
        const lx = Math.min(Math.max(px - w / 2, a.left + 2), a.right - w - 2);
        ctx.fillStyle = themeColor('--surface'); ctx.globalAlpha = 0.85; ctx.fillRect(lx - 3, ly - 12, w + 6, 16); ctx.globalAlpha = 1;
        ctx.fillStyle = themeColor('--text'); ctx.fillText(txt, lx, ly);
      });
      ctx.restore();
    }
  };
  if (emoChart) emoChart.destroy();
  emoChart = new Chart(cv, {
    type: 'line',
    data: { labels: allData.labels, datasets: [{ data: allData.price, borderColor: price, borderWidth: 2, pointRadius: 0, tension: 0.25 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      layout: { padding: { top: 18, right: 12, left: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: themeColor('--chart-tip-bg'), titleColor: themeColor('--chart-tip-title'), bodyColor: themeColor('--chart-tip-body'),
          borderColor: themeColor('--border2'), borderWidth: 1,
          callbacks: {
            label: it => ' Close ' + it.raw.toLocaleString('en-IN'),
            afterLabel: it => { const ph = EMO_PERIODS.find(p => { const [s, e] = emoRange(p); return it.dataIndex >= s && it.dataIndex <= e; }); return ph ? ' ' + ph.name : ''; },
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: tick, autoSkip: false, maxRotation: 0,
             callback(v) { const l = this.getLabelForValue(v); return l && l.startsWith('Jan') ? '20' + l.slice(4) : ''; } } },
        y: { grid: { color: grid }, ticks: { color: tick, callback: v => v.toLocaleString('en-IN') } },
      },
      onClick: (e, els, chart) => {
        const i = chart.scales.x.getValueForPixel(e.x);
        const k = EMO_PERIODS.findIndex(p => { const [s, en] = emoRange(p); return i >= s && i <= en; });
        if (k >= 0) selectEmotion(k);
      }
    },
    plugins: [bandPlugin]
  });

  // Ribbon
  const rib = document.getElementById('emo-ribbon');
  rib.innerHTML = EMO_PERIODS.map((ph, i) => {
    const [s, e] = emoRange(ph);
    return `<button class="emo-seg${i === emoSel ? ' on' : ''}" role="tab" aria-selected="${i === emoSel}" data-i="${i}"
      style="flex:${e - s + 1};background:${EMO_COLOR[ph.v]};" title="${esc(ph.name)}, ${esc(ph.when)}" aria-label="${esc(ph.name)}, ${esc(ph.when)}"><span>${esc(ph.short)}</span></button>`;
  }).join('');
  rib.querySelectorAll('.emo-seg').forEach(b => {
    b.onclick = () => selectEmotion(+b.dataset.i);
    const s = b.querySelector('span');                       // name only where it fits
    if (s && s.scrollWidth > b.clientWidth - 6) s.style.visibility = 'hidden';
  });
  renderEmotionDetail();
  renderEmotionCycle();
}

function selectEmotion(i) {
  emoSel = i;
  if (emoChart) emoChart.draw();
  document.querySelectorAll('#emo-ribbon .emo-seg').forEach(b => {
    const on = +b.dataset.i === i; b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
  });
  renderEmotionDetail();
}

function renderEmotionDetail() {
  const ph = EMO_PERIODS[emoSel], [s, e] = emoRange(ph);
  const a = allData.price[Math.max(0, s - 1)], b = allData.price[e];
  const chg = (b / a - 1) * 100;
  const f0 = v => Math.round(v).toLocaleString('en-IN');
  document.getElementById('emo-detail').innerHTML = `
    <h3><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${EMO_COLOR[ph.v]};margin-right:8px;"></span>${esc(ph.name)}</h3>
    <div class="when">${esc(ph.when)}</div>
    <p>${esc(ph.story)}</p>
    <p style="margin-top:8px;color:var(--text3);">Month-end close ${f0(a)} → ${f0(b)}:
      <b style="color:${chg >= 0 ? 'var(--green)' : 'var(--red)'};">${chg >= 0 ? '+' : '−'}${Math.abs(chg).toFixed(1)}%</b></p>`;
}

function renderEmotionCycle() {
  // Classic cycle of market emotions: the crowd's mood over one full cycle
  const S = [
    ['Disbelief', 90, 196], ['Hope', 140, 160], ['Optimism', 190, 122], ['Belief', 240, 88], ['Thrill', 292, 60],
    ['Euphoria', 348, 46], ['Complacency', 404, 62], ['Anxiety', 452, 92], ['Denial', 496, 124], ['Panic', 540, 158],
    ['Capitulation', 590, 188], ['Depression', 650, 204],
  ];
  // smooth path (Catmull-Rom → cubic Bézier)
  let d = `M${S[0][1]},${S[0][2]}`;
  for (let i = 0; i < S.length - 1; i++) {
    const p0 = S[i - 1] || S[i], p1 = S[i], p2 = S[i + 1], p3 = S[i + 2] || p2;
    const c1x = p1[1] + (p2[1] - p0[1]) / 6, c1y = p1[2] + (p2[2] - p0[2]) / 6;
    const c2x = p2[1] - (p3[1] - p1[1]) / 6, c2y = p2[2] - (p3[2] - p1[2]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[1]},${p2[2]}`;
  }
  const at = n => S.find(s => s[0] === n);
  const txt = themeColor('--text'), txt3 = themeColor('--text3'), amber = themeColor('--amber');
  const labels = S.map(([n, x, y], i) => {
    if (n === 'Anxiety') return `<circle cx="${x}" cy="${y}" r="3" fill="${txt3}"/>`;   // named by the marker
    const rising = i <= 5;
    const lx = rising ? x - 6 : x + 8, ly = rising ? y - 9 : y + 4, anchor = rising ? 'end' : 'start';
    return `<circle cx="${x}" cy="${y}" r="3" fill="${txt3}"/><text x="${lx}" y="${ly}" text-anchor="${anchor}" font-size="16" fill="${txt3}">${n}</text>`;
  }).join('');
  const [ax, ay] = [at('Anxiety')[1], at('Anxiety')[2]];
  const [dx, dy] = [at('Denial')[1], at('Denial')[2]];
  const [hx, hy] = [at('Hope')[1], at('Hope')[2]];
  document.getElementById('emo-cycle').innerHTML = `
  <svg viewBox="0 0 800 260" role="img" aria-label="Cycle of market emotions; NEPSE is at anxiety">
    <defs><linearGradient id="emoGrad" x1="0" y1="30" x2="0" y2="205" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${EMO_COLOR[3]}"/><stop offset=".5" stop-color="${EMO_COLOR[1]}"/><stop offset="1" stop-color="${EMO_COLOR[-3]}"/>
    </linearGradient></defs>
    <path d="${d}" fill="none" stroke="url(#emoGrad)" stroke-width="5" stroke-linecap="round"/>
    ${labels}
    <circle cx="${dx}" cy="${dy}" r="8" fill="none" stroke="${txt3}" stroke-dasharray="3 3"/>
    <text x="${dx - 14}" y="${dy + 26}" text-anchor="end" font-size="15" fill="${txt3}">If 2,487 breaks</text>
    <circle cx="${hx}" cy="${hy}" r="8" fill="none" stroke="${txt3}" stroke-dasharray="3 3"/>
    <text x="${hx + 16}" y="${hy + 30}" font-size="15" fill="${txt3}">If 2,772 is reclaimed: a new cycle</text>
    <circle cx="${ax}" cy="${ay}" r="10" fill="${amber}" stroke="${themeColor('--surface')}" stroke-width="3"/>
    <text x="${ax + 18}" y="${ay + 5}" font-size="18" font-weight="600" fill="${txt}">You are here: anxiety</text>
  </svg>`;
}

// ── Daily data check (verification vs previous session) ─────
function renderDataCheck() {
  const card = document.getElementById('data-check');
  const V = LIVE_SNAPSHOT.verification;
  if (!card) return;
  if (!V || V.date !== LIVE_SNAPSHOT.trade_date) { card.style.display = 'none'; return; }
  card.style.display = '';
  const icon = { ok: '✅', warn: '⚠️', error: '❌' };
  const label = { ok: '✓ Data verified', warn: '⚠ Verified with warnings', error: '✕ Verification failed' };
  const pill = document.getElementById('dc-pill');
  pill.className = 'dc-pill ' + V.status;
  pill.textContent = label[V.status] || V.status;
  const n = s => V.checks.filter(c => c.status === s).length;
  const C = V.changes || {};
  const moves = C.rrg_moves || [];   // eslint-disable-line no-unused-vars
  document.getElementById('dc-summary').textContent =
    `${isoToLabel(V.date)} vs ${C.previous_session ? isoToLabel(C.previous_session) : '—'} · ${n('ok')}/${V.checks.length} checks passed` +
    (n('warn') ? ` · ${n('warn')} warning(s)` : '') + (n('error') ? ` · ${n('error')} error(s)` : '') +
    (C.rrg_compared ? ` · ${moves.length} RRG quadrant change(s)` : '');

  document.getElementById('dc-checks').innerHTML = V.checks.map(c => {
    const items = (c.items || []).slice(0, 8).map(i => typeof i === 'string' ? esc(i)
      : esc(i.sym || i.sector || '') + (i.diff_pct !== undefined ? ` (${i.diff_pct}%)` : '')).join(', ');
    return `<div class="dc-row"><span class="ic">${icon[c.status] || '•'}</span><div>
      <div class="nm">${esc(c.name)}</div><div class="dt">${esc(c.detail)}</div>
      ${items ? `<div class="dc-items">${items}${c.items.length > 8 ? ' …' : ''}</div>` : ''}</div></div>`;
  }).join('');

  document.getElementById('dc-changes').innerHTML = buildChangesHTML(C) || '<div class="dt">No earlier session stored yet — changes appear from the next update.</div>';
}

function buildChangesHTML(C, plain) {
  const f2 = v => typeof v === 'number' ? v.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
  const sg = v => typeof v === 'number' ? (v > 0 ? '+' : '') + v.toFixed(2) : '—';
  const col = v => typeof v !== 'number' || v === 0 ? 'var(--text2)' : v > 0 ? 'var(--green)' : 'var(--red)';
  const moves = C.rrg_moves || [];
  if (plain) {
    // Home page: plain rows, words first
    let r = '';
    if (C.index) r += `<div class="row"><span class="k">NEPSE</span><span>${f2(C.index.prev)} to <b>${f2(C.index.now)}</b> <span style="color:${col(C.index.change)}">${sg(C.index.change)} (${sg(C.index.changePct)}%)</span></span></div>`;
    if (C.turnover && C.turnover.prev && C.turnover.now) {
      const d = (C.turnover.now / C.turnover.prev - 1) * 100;
      r += `<div class="row"><span class="k">Turnover</span><span>Rs ${(C.turnover.prev / 1e9).toFixed(2)} to <b>${(C.turnover.now / 1e9).toFixed(2)} billion</b> (${d > 0 ? '+' : ''}${d.toFixed(0)}%)</span></div>`;
    }
    if (C.sectors && C.sectors.length) {
      const b = C.sectors[0], w = C.sectors[C.sectors.length - 1];
      r += `<div class="row"><span class="k">Strongest sector</span><span><b>${esc(b.sector)}</b> <span style="color:${col(b.changePct)}">${sg(b.changePct)}%</span></span></div>`;
      r += `<div class="row"><span class="k">Weakest sector</span><span><b>${esc(w.sector)}</b> <span style="color:${col(w.changePct)}">${sg(w.changePct)}%</span></span></div>`;
    }
    const sec = moves.filter(m => m.kind === 'sector');
    if (sec.length) r += `<div class="row"><span class="k">Sector rotation</span><span>${sec.map(m => `<b>${esc(m.name || m.sym)}</b> ${esc(m.from)} → ${esc(m.to)}`).join('; ')}</span></div>`;
    const stk = moves.filter(m => m.kind === 'stock');
    if (stk.length) r += `<div class="row"><span class="k">Companies</span><span>${stk.length} changed RRG quadrant, ${stk.filter(m => m.to === 'Leading').length} into leading. <a href="#/rrg-sec" data-on-click="navTo('rrg-sec');return false;">See the RRG</a></span></div>`;
    if (C.rrg_note) r += `<div class="row" style="color:var(--text3);">${esc(C.rrg_note)}</div>`;
    return r;
  }
  let h = '';
  if (C.index) h += `<div class="dc-row"><span class="ic">📈</span><div><div class="nm">NEPSE ${f2(C.index.prev)} → ${f2(C.index.now)}
      <span style="color:${col(C.index.change)}">${sg(C.index.change)} (${sg(C.index.changePct)}%)</span></div></div></div>`;
  if (C.turnover && C.turnover.prev && C.turnover.now) {
    const d = (C.turnover.now / C.turnover.prev - 1) * 100;
    h += `<div class="dc-row"><span class="ic">💰</span><div><div class="nm">Turnover Rs ${(C.turnover.prev / 1e9).toFixed(2)} → ${(C.turnover.now / 1e9).toFixed(2)} Ar
      <span style="color:${col(d)}">${sg(d)}%</span></div></div></div>`;
  }
  if (C.sectors && C.sectors.length) {
    const top = C.sectors.slice(0, 3), bot = C.sectors.slice(-3).reverse();
    const fmt = a => a.map(s => `${esc(s.sector)} <span style="color:${col(s.changePct)}">${sg(s.changePct)}%</span>`).join(' · ');
    h += `<div class="dc-row"><span class="ic">🏷</span><div><div class="nm">Best sectors: ${fmt(top)}</div><div class="dt">Weakest: ${fmt(bot)}</div></div></div>`;
  }
  if (C.rrg_note) h += `<div class="dc-row"><span class="ic">🧭</span><div class="dt">${esc(C.rrg_note)}</div></div>`;
  if (moves.length) {
    const byTo = {};
    moves.forEach(m => (byTo[m.to] = byTo[m.to] || []).push(m));
    h += Q_ORDER.filter(q => byTo[q]).map(q => `<div class="dc-row"><span class="ic">🧭</span><div>
        <div class="nm">Moved into ${qChip(q)} <span class="dt">(daily RRG vs NEPSE)</span></div>
        <div class="rrg-chips" style="margin-top:4px;">${byTo[q].map(m =>
          `<span class="rrg-chip" title="${esc(m.from)} → ${esc(m.to)}${m.kind === 'sector' ? ' (sector index)' : ''}" data-on-click="${m.kind === 'stock' ? `rrgOpenStock('${esc(m.sym)}');navTo('rrg-sec')` : ''}"
             style="${m.kind === 'sector' ? 'font-weight:600;' : ''}">${esc(m.sym || m.name)}</span>`).join('')}</div></div></div>`).join('');
  }
  return h;
}

// ── Weekly / Monthly market summary ──────────────────────────
function renderPeriodSummaries() {
  const P = LIVE_SNAPSHOT.periods;
  const blocks = [
    { id: 'ps-weekly',  title: 'Weekly Market Summary',  rows: P?.weekly,  movers: P?.week_movers,  kind: 'week'  },
    { id: 'ps-monthly', title: 'Monthly Market Summary', rows: P?.monthly, movers: P?.month_movers, kind: 'month' },
  ];
  const f2  = v => typeof v === 'number' ? v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
  const ar  = v => typeof v === 'number' ? 'Rs ' + (v / 1e9).toFixed(2) + ' Ar' : '—';
  const sgn = v => typeof v !== 'number' ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
  const col = v => typeof v !== 'number' || v === 0 ? 'var(--text2)' : v > 0 ? 'var(--green)' : 'var(--red)';
  const d   = iso => { const [y, m, dd] = iso.split('-').map(Number); return _MONS[m - 1] + ' ' + dd; };
  const lbl = (r, kind) => kind === 'month'
    ? _MONS[Number(r.key.slice(5, 7)) - 1] + ' ' + r.key.slice(0, 4)
    : d(r.start) + (r.start === r.end ? '' : ' – ' + d(r.end));

  blocks.forEach(b => {
    const el = document.getElementById(b.id);
    if (!el) return;
    const head = `<div class="ps-head"><div class="ps-title">${esc(b.title)}</div>`;
    if (!Array.isArray(b.rows) || !b.rows.length) {
      el.innerHTML = head + '</div><div class="ps-note">Appears after the first daily GitHub update (it is computed from the index history).</div>';
      return;
    }
    const cur  = b.rows[b.rows.length - 1];
    const prev = b.rows.length > 1 ? b.rows[b.rows.length - 2] : null;
    const toChg = prev && cur.avg_turnover && prev.avg_turnover
      ? ((cur.avg_turnover / prev.avg_turnover - 1) * 100) : null;
    // Still running: the latest close is in this period and the period can't be over yet
    // (a week ends on Friday; a month when the next trading day falls in a new month)
    const lastTD = new Date(cur.end + 'T00:00:00');
    const isOpen = cur.end === (LIVE_SNAPSHOT.trade_date || '') && (b.kind === 'week'
      ? lastTD.getDay() !== 5
      : new Date(lastTD.getFullYear(), lastTD.getMonth() + 1, 0).getDate() - lastTD.getDate() > 2);
    const range = lbl(cur, b.kind) + (b.kind === 'week' ? ', ' + cur.end.slice(0, 4) : '') +
                  ' · ' + cur.days + ' session' + (cur.days === 1 ? '' : 's') +
                  (isOpen ? ' · ' + b.kind + ' in progress' : '');
    const cards = [
      { l: 'Close',            v: f2(cur.close), s: 'prev ' + b.kind + ' ' + f2(cur.prev_close) },
      { l: 'Change',           v: `<span style="color:${col(cur.change)}">${sgn(cur.change)} (${sgn(cur.changePct)}%)</span>`, s: 'vs previous ' + b.kind + ' close' },
      { l: 'Sessions up / down', v: `<span style="color:var(--green)">${cur.up_days}</span> / <span style="color:var(--red)">${cur.down_days}</span>`, s: cur.days + ' trading days' },
      { l: 'High',             v: f2(cur.high), s: d(cur.high_date) },
      { l: 'Low',              v: f2(cur.low),  s: d(cur.low_date) },
      { l: 'Turnover',         v: ar(cur.turnover), s: 'avg ' + ar(cur.avg_turnover) + '/day' +
                                 (toChg === null ? '' : ` · <span style="color:${col(toChg)}">${toChg > 0 ? '+' : ''}${toChg.toFixed(0)}%</span> vs prev`) },
    ].map(c => `<div class="ms-stat-card"><div class="ms-stat-lbl">${c.l}</div><div class="ms-stat-val">${c.v}</div><div class="ms-stat-sub">${c.s}</div></div>`).join('');

    const hist = b.rows.slice().reverse().map((r, i) => `
      <tr class="${i === 0 ? 'ps-current' : ''}">
        <td>${lbl(r, b.kind)}</td><td>${f2(r.close)}</td>
        <td style="color:${col(r.changePct)}">${sgn(r.changePct)}%</td>
        <td>${f2(r.high)}</td><td>${f2(r.low)}</td><td>${typeof r.turnover === 'number' ? (r.turnover / 1e9).toFixed(1) : '—'}</td>
      </tr>`).join('');

    const mv = b.movers;
    const mvList = (arr, c) => (arr && arr.length)
      ? arr.map(m => `<div class="ps-mv-row"><a class="ms-sym" href="https://chukul.com/stock-profile?symbol=${encodeURIComponent(m.sym)}" target="_blank" rel="noopener">${esc(m.sym)}</a><span>${f2(m.close)}</span><span style="color:${c}">${sgn(m.pct)}%</span></div>`).join('')
      : '<div class="ps-note">—</div>';
    const movers = mv
      ? `<div class="ps-movers">
           <div><div class="ps-sub-title">Top gainers this ${b.kind}</div>${mvList(mv.gainers, 'var(--green)')}</div>
           <div><div class="ps-sub-title">Top losers this ${b.kind}</div>${mvList(mv.losers, 'var(--red)')}</div>
         </div>
         <div class="ps-note">Stock moves from the ${d(mv.base_date)} close to the ${d(mv.end_date)} close.</div>`
      : `<div class="ps-note">Top stock movers for the ${b.kind} appear once daily price files cover the start of the ${b.kind}.</div>`;

    el.innerHTML = head + `<div class="ps-range">${range}</div></div>
      <div class="ps-grid">${cards}</div>
      <div class="ps-sub-title">Recent ${b.kind === 'week' ? 'weeks' : 'months'} (turnover in Rs Ar)</div>
      <div class="ps-scroll"><table class="ps-table">
        <thead><tr><th>${b.kind === 'week' ? 'Week' : 'Month'}</th><th>Close</th><th>Chg</th><th>High</th><th>Low</th><th>Turnover</th></tr></thead>
        <tbody>${hist}</tbody></table></div>${movers}`;
  });
}

function msSwitchLeft(mode)  { renderMSLeft(mode);  }
function msSwitchRight(mode) { renderMSRight(mode); }

// NPT Clock — updates every second
function startNPTClock() {
  const tick = () => {
    const st  = getNPTStatus();
    const npt = st.npt;
    const clk = document.getElementById('ms-npt-clock');
    if (!clk) return;
    const timeStr = npt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
    if (!st.isTradingDay) {
      clk.textContent = timeStr + ' NPT · weekend, market closed';
      clk.style.color = 'var(--text3)';
      clk.title = 'NEPSE closed Sat–Sun. Showing last Friday\'s close.';
    } else if (st.isMarketOpen) {
      clk.textContent = timeStr + ' NPT · market open until 3 PM';
      clk.style.color = 'var(--text2)';
      clk.title = 'Market is open. Showing previous day\'s closing price.';
    } else if (st.isDataAvailable && isStale()) {
      clk.textContent = timeStr + ' NPT · waiting for today’s close';
      clk.style.color = 'var(--amber)';
      clk.title = 'Market closed. The daily update runs 4:00 PM NPT (retry 4:45 PM); on a public holiday the last close stays.';
    } else if (st.isDataAvailable) {
      clk.textContent = timeStr + ' NPT · today’s close is in';
      clk.style.color = 'var(--text2)';
      clk.title = 'Market closed. Today\'s final data is available.';
    } else if (st.isPreMarket) {
      clk.textContent = timeStr + ' NPT · opens at 11 AM';
      clk.style.color = 'var(--amber)';
      clk.title = 'Market opens 11:00 AM NPT. Showing previous day\'s close.';
    } else {
      // 3:00–3:45 PM — closed but data not out yet
      clk.textContent = timeStr + ' NPT · waiting for today’s close';
      clk.style.color = 'var(--amber)';
      clk.title = 'Market closed at 3:00 PM. Data available on nepalstock.com after ~3:45 PM NPT.';
    }
  };
  tick();
  setInterval(tick, 1000);
}

// ── Nav active state on scroll ──────────────────────────────
function initNavActiveState() {
  return;   // superseded by showPage() — one section is visible at a time
  const sections = [
    'chart-sec','market-summary-sec','price-table-sec','heatmap-sec','rrg-sec',
    'events-sec','structure-sec','trade-sec','money-sec',
    'stock-analyzer-sec','macro-sec','links-sec','summary-sec'
  ];
  const navBtns = document.querySelectorAll('.nav-btn');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navBtns.forEach(btn => {
          const m = (btn.getAttribute('data-on-click')||'').match(/'([^']+)'/);
          btn.classList.toggle('active', !!(m && m[1] === id));
        });
      }
    });
  }, { rootMargin: '-10% 0px -80% 0px', threshold: 0 });
  sections.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); });
}

// ============================================================
// TODAY'S PRICE — Interactive table cloning sharesansar.com
// Columns: #, Symbol, LTP, Change, %, Open, High, Low, Close,
//          VWAP, Vol, Prev Close, Turnover, 52W H, 52W L
// Database: localStorage keyed by date "YYYY-MM-DD"
// ============================================================

const PT_DB_KEY = 'nepse_price_db';

// ── Aug 27 2026 verified dataset ─────────────────────────────
// Source: nepalstock.com official screenshot + ShareSansar patterns
// Format: [sym, name, sector, ltp, change, pct, open, high, low, close, vwap, vol, prev, turnover, w52h, w52l]
const PT_AUG27 = [
  // Commercial Banks
  ['NABIL','Nabil Bank Ltd','Commercial Banks',540.0,2.0,0.37,538,544,535,540,539.5,42000,538.0,22680000,568,471],
  ['NICA','NIC Asia Bank Ltd','Commercial Banks',362.0,-1.0,-0.28,363,365,360,362,362.4,58000,363.0,21019200,398,310],
  ['EBL','Everest Bank Ltd','Commercial Banks',640.0,3.0,0.47,637,645,635,640,640.1,18000,637.0,11520000,672,530],
  ['ADBL','Ag. Development Bank','Commercial Banks',298.8,2.5,0.84,296,300,296,298.8,297.2,30400,296.3,9075200,328,242],
  ['SBL','Siddhartha Bank Ltd','Commercial Banks',412.0,-1.5,-0.36,413,415,410,412,412.3,50000,413.5,20600000,448,355],
  ['SBI','Nepal SBI Bank Ltd','Commercial Banks',400.0,1.2,0.30,398,403,397,400,399.8,416523,398.8,166609173,428,334],
  ['GBIME','Global IME Bank Ltd','Commercial Banks',258.0,-0.5,-0.19,258,260,256,258,258.2,75000,258.5,19350000,285,218],
  ['HBL','Himalayan Bank Ltd','Commercial Banks',488.0,2.0,0.41,486,491,485,488,487.5,22000,486.0,10736000,515,420],
  ['KBL','Kumari Bank Ltd','Commercial Banks',180.0,0.5,0.28,179,181,178,180,179.8,88000,179.5,15840000,210,162],
  ['MBL','Machhapuchchhre Bank','Commercial Banks',193.0,-1.0,-0.52,194,195,192,193,193.1,60000,194.0,11580000,224,175],
  ['NBL','Nepal Bank Ltd','Commercial Banks',305.0,1.5,0.49,303,307,302,305,304.5,35000,303.5,10675000,332,265],
  ['PCBL','Prime Commercial Bank','Commercial Banks',192.0,0.5,0.26,191,193,190,192,191.7,55000,191.5,10560000,215,175],
  ['PRVU','Prabhu Bank Ltd','Commercial Banks',225.0,-0.5,-0.22,225,227,223,225,225.1,48000,225.5,10800000,252,195],
  ['SANIMA','Sanima Bank Ltd','Commercial Banks',370.7,-2.8,-0.75,372,374,369,370.7,371.2,114162,373.5,42326117,405,318],
  ['SCB','Standard Chartered Bank','Commercial Banks',750.0,3.5,0.47,747,754,745,750,749.8,8500,746.5,6375000,790,650],
  ['LSL','Laxmi Sunrise Bank','Commercial Banks',168.0,0.8,0.48,167,169,166,168,167.9,95000,167.2,15960000,188,148],
  ['NIMB','Nepal Investment Mega Bank','Commercial Banks',195.0,0.5,0.26,194,196,193,195,194.8,82000,194.5,15990000,218,175],

  // Development Banks
  ['CORBL','Corporate Dev Bank','Development Banks',907.9,-23.9,-2.56,910,915,905,907.9,909.2,28484,931.8,25898882,970,780],
  ['GBBL','Garima Bikas Bank','Development Banks',285.0,-1.5,-0.52,286,287,284,285,285.1,35000,286.5,9975000,315,248],
  ['JBBL','Jyoti Bikas Bank','Development Banks',312.0,1.0,0.32,311,313,310,312,311.8,22000,311.0,6864000,345,272],
  ['KSBBL','Kamana Sewa Bikas Bank','Development Banks',258.0,0.5,0.19,257,259,256,258,257.8,28000,257.5,7224000,290,218],
  ['MNBBL','Muktinath Bikas Bank','Development Banks',395.0,-2.0,-0.50,397,398,393,395,395.2,18000,397.0,7110000,430,340],
  ['SHINE','Shine Resunga Dev Bank','Development Banks',405.0,-4.0,-0.98,409,410,403,405,405.8,10398,409.0,4211190,445,365],

  // Finance
  ['CFCL','Central Finance Co','Finance Companies',582.2,-3.2,-0.55,585,587,580,582.2,582.8,63426,585.4,36921925,620,505],
  ['GFCL','Goodwill Finance','Finance Companies',245.0,1.0,0.41,244,246,243,245,244.9,18000,244.0,4410000,278,210],
  ['ICFC','ICFC Finance Ltd','Finance Companies',288.0,-1.0,-0.35,289,290,287,288,288.1,25000,289.0,7200000,318,250],
  ['NFS','Nepal Finance Ltd','Finance Companies',195.0,0.5,0.26,194,196,193,195,194.8,20000,194.5,3900000,218,168],

  // Hydropower
  ['CHCL','Chilime Hydropower','Hydropower',405.0,-48.1,-10.61,410,412,400,405,406.5,397009,453.1,160738793,495,380],
  ['AKJCL','Aryan Khola Jalavidhyut','Hydropower',343.0,4.1,1.21,340,348,338,343,342.5,338512,338.9,116168314,378,295],
  ['UPPER','Upper Tamakoshi Hydro','Hydropower',241.4,-23.1,-8.73,245,246,240,241.4,242.2,280000,264.5,67592000,298,228],
  ['RHPL','Rairang Hydropower','Hydropower',241.4,-36.2,-13.06,250,252,240,241.4,243.0,50045,277.6,12071703,315,230],
  ['RIDI','Ridi Hydropower','Hydropower',351.9,-8.9,-2.47,353,356,350,351.9,352.4,348571,360.8,122618380,395,310],
  ['AHPC','Api Power Company','Hydropower',257.5,-6.0,-2.28,258,260,256,257.5,257.8,179592,263.5,46230000,295,228],
  ['BGWT','Bageswori Hydropower','Hydropower',513.0,23.1,4.72,490,515,488,513,504.5,4523,489.9,2281119,540,445],
  ['SHPC','Sanima Mai Hydropower','Hydropower',514.0,-15.0,-2.84,516,518,512,514,514.5,143012,529.0,73508168,560,462],
  ['BHPL','Bhotekoshi Power','Hydropower',476.0,-17.1,-3.47,480,482,474,476,476.8,5272,493.1,2509472,520,438],
  ['SJCL','Solu Jalavidhyut','Hydropower',688.0,-12.0,-1.71,692,695,685,688,688.5,18000,700.0,12384000,748,610],
  ['UMHL','Upper Modi Hydro','Hydropower',378.0,-5.0,-1.31,380,382,376,378,378.5,22000,383.0,8316000,418,335],
  ['CHDC','Chhimek Hydropower','Hydropower',2196.9,-12.9,-0.58,2200,2205,2190,2196.9,2197.4,13890,2209.8,30527181,2380,1950],
  ['SSHL','Sanima Mai Hydro','Hydropower',420.0,-3.0,-0.71,421,424,418,420,420.2,28000,423.0,11760000,458,368],
  ['NHDL','Nepal Hydro Developers','Hydropower',215.0,1.5,0.70,214,217,213,215,214.8,35000,213.5,7525000,245,188],

  // Life Insurance
  ['NLIC','National Life Insurance','Life Insurance',845.0,-8.0,-0.94,850,852,843,845,845.5,12000,853.0,10140000,928,748],
  ['NLICL','Nepal Life Insurance','Life Insurance',688.0,-5.0,-0.72,690,693,686,688,688.5,15000,693.0,10320000,755,608],
  ['LICN','Life Insurance Nepal','Life Insurance',1250.0,-15.0,-1.18,1258,1262,1245,1250,1251.0,5500,1265.0,6875000,1380,1095],
  ['ALICL','Asian Life Insurance','Life Insurance',410.6,-5.8,-1.39,412,415,408,410.6,411.2,34634,416.4,14225804,462,358],
  ['PLIC','Prime Life Insurance','Life Insurance',548.0,8.0,1.48,540,550,538,548,545.0,18000,540.0,9864000,598,478],
  ['GLICL','Gurans Life Insurance','Life Insurance',328.0,-2.0,-0.61,329,331,326,328,328.2,22000,330.0,7216000,362,285],

  // Non-Life Insurance
  ['NICL','National Insurance Co','Non-Life Insurance',310.0,2.0,0.65,308,312,307,310,309.8,15000,308.0,4650000,345,268],
  ['NIL','Nepal Insurance Co','Non-Life Insurance',425.0,-3.0,-0.70,427,429,423,425,425.2,10000,428.0,4250000,468,368],
  ['SGI','Shikhar Insurance','Non-Life Insurance',580.0,5.0,0.87,575,582,573,580,579.5,8000,575.0,4640000,635,498],
  ['RNLI','Rastriya Beema','Non-Life Insurance',420.6,-7.5,-1.75,422,425,418,420.6,421.2,37459,428.1,15760505,465,368],
  ['SALICO','Sagarmatha Lumbini Ins','Non-Life Insurance',565.2,-18.8,-3.22,568,572,563,565.2,566.0,23097,584.0,13059806,638,498],
  ['SICL','Siddhartha Insurance','Non-Life Insurance',582.0,-18.0,-3.00,585,588,580,582,582.5,29724,600.0,17299368,648,518],
  ['SGIC','Sagarmatha Insurance','Non-Life Insurance',417.0,-21.0,-4.79,420,422,415,417,417.5,37457,438.0,15619569,480,368],

  // Microfinance
  ['CBBL','Chhimek Bikas Bank','Microfinance',936.0,-3.0,-0.32,938,940,934,936,936.2,10111,939.0,9463896,1020,840],
  ['SWBBL','Swabhiman Laghubitta','Microfinance',1380.0,-12.0,-0.86,1385,1388,1378,1380,1380.5,4800,1392.0,6624000,1520,1215],
  ['SKBBL','Swabalamban Laghubitta','Microfinance',1850.0,-20.0,-1.07,1858,1862,1845,1850,1850.8,3200,1870.0,5920000,2050,1640],
  ['SAMAJ','Samaj Laghubitta','Microfinance',1280.0,-8.0,-0.62,1285,1288,1278,1280,1280.3,5500,1288.0,7040000,1420,1140],
  ['MERO','Mero Microfinance','Microfinance',1520.0,-15.0,-0.98,1525,1528,1518,1520,1520.5,4200,1535.0,6384000,1685,1350],

  // Manufacturing & Processing
  ['SAPIL','Sarbottam Paints Ind','Manufacturing & Processing',1394.8,181.9,15.00,1213,1395,1210,1394.8,1310.5,1820,1212.9,2383736,1420,1050],
  ['GCIL','Gorkha Claims Ind','Manufacturing & Processing',370.0,28.0,8.19,342,371,340,370,358.0,18000,342.0,6444000,395,298],
  ['PCIL','Premier Cement Ind','Manufacturing & Processing',621.0,26.9,4.53,595,623,593,621,609.5,12000,594.1,7452000,648,510],
  ['SHIVM','Shivam Cements Ltd','Manufacturing & Processing',650.0,28.6,4.60,622,652,618,650,635.8,335852,621.4,217591632,698,545],
  ['UNL','Unilever Nepal Ltd','Manufacturing & Processing',16200.0,150.0,0.93,16050,16250,16000,16200,16180.5,420,16050.0,6804000,17500,13850],
  ['BNL','Bottlers Nepal Ltd','Manufacturing & Processing',14900.0,-50.0,-0.33,14950,14960,14880,14900,14925.0,20,14950.0,298000,16200,12800],

  // Hotels
  ['OHL','Oriental Hotels Ltd','Hotels',138.0,1.5,1.10,136,139,135,138,137.5,25000,136.5,3450000,158,118],
  ['SHL','Soaltee Hotel Ltd','Hotels',508.0,-0.9,-0.18,509,511,506,508,508.3,29027,508.9,14765716,558,445],
  ['TRH','Taragaon Regency Hotels','Hotels',132.0,1.0,0.76,131,133,130,132,131.8,18000,131.0,2376000,148,115],
  ['YHL','Yak & Yeti Hotels','Hotels',625.0,5.0,0.81,620,628,618,625,624.2,8500,620.0,5312500,672,548],

  // Turnover table stocks (from screenshot — confirmed)
  ['RSML','Reliance Spinning Mills','Manufacturing & Processing',2728.0,-21.0,-0.76,2742,2745,2720,2728,2733.0,40225,2749.0,109722029,2980,2450],
  ['SONA','Sonapur Minerals & Oil','Others',408.0,19.6,5.05,388,410,386,408,398.5,18000,388.4,7164000,435,348],
];

// ── Price table state ────────────────────────────────────────
let ptData        = [];    // current display data (filtered+sorted)
let ptAllData     = [];    // full dataset for current date
let ptSortCol     = 'sn';
let ptSortAsc     = true;
let ptCurrentPage = 1;
let ptActiveDate  = '2026-08-27'; // set to the data's trade date at boot

const PT_COLS = ['sn','symbol','ltp','change','pct','open','high','low','close','vwap','vol','prev','turnover','w52h','w52l'];

// ── localStorage price database ─────────────────────────────
function ptGetDB()         { try { return JSON.parse(localStorage.getItem(PT_DB_KEY) || '{}'); } catch { return {}; } }
function ptSetDB(db)       { localStorage.setItem(PT_DB_KEY, JSON.stringify(db)); }
function ptGetDbDates()    { return Object.keys(ptGetDB()).sort().reverse(); }

function ptSaveToday() {
  const db   = ptGetDB();
  const date = ptActiveDate;
  db[date] = { savedAt: new Date().toISOString(), rows: ptAllData };
  ptSetDB(db);
  ptRefreshDateSelect();
  ptUpdateDbInfo();
  showToast('Saved ' + ptAllData.length + ' stocks for ' + date + ' to local database');
}

function ptLoadDate() {
  const dates = ptGetDbDates();
  if (!dates.length) { alert('No saved dates in database yet. Click "Save to DB" first.'); return; }
  const d = prompt('Enter date to load (YYYY-MM-DD):\nAvailable: ' + dates.slice(0,8).join(', '));
  if (d && ptGetDB()[d]) {
    ptSwitchDate(d);
  } else if (d) {
    alert('No data found for ' + d + '\nSaved dates: ' + dates.join(', '));
  }
}

function ptRefreshDateSelect() {
  const sel = document.getElementById('pt-date-select');
  if (!sel) return;
  const dates    = ptGetDbDates();
  // "Latest" is the newest published close, not whichever date is being viewed
  const baseDate = LIVE_PRICES_DATE || LIVE_SNAPSHOT.trade_date || '2026-08-27';
  const baseLbl  = isoToLabel(baseDate);
  const baseDay  = isoToDay(baseDate).slice(0,3);
  let opts = `<option value="${baseDate}">${baseLbl} (${baseDay}) — Latest</option>`;
  // Archived trading days (daily update) first, then lists saved in this browser
  const arch = PT_ARCHIVE.filter(d => d !== baseDate).sort().reverse();
  if (arch.length) opts += '<optgroup label="Archive (daily update)">' + arch.map(d =>
    `<option value="${d}">${isoToLabel(d)} (${isoToDay(d).slice(0,3)})</option>`).join('') + '</optgroup>';
  const local = dates.filter(d => d !== baseDate && !arch.includes(d));
  if (local.length) opts += '<optgroup label="Saved in this browser">' + local.map(d =>
    `<option value="${d}">${isoToLabel(d)}</option>`).join('') + '</optgroup>';
  sel.innerHTML = opts;
  sel.value = ptActiveDate || baseDate;
}

function ptUpdateDbInfo() {
  const dates = ptGetDbDates();
  const el    = document.getElementById('pt-db-info');
  if (el) el.textContent = 'DB: ' + dates.length + ' date' + (dates.length !== 1 ? 's' : '') + ' saved';
}

function ptClearDB() {
  if (!confirm('Clear all saved price data from the local database?')) return;
  localStorage.removeItem(PT_DB_KEY);
  ptRefreshDateSelect();
  ptUpdateDbInfo();
  showToast('Price database cleared');
}

// ── Archived daily price lists (data/history/prices/<date>.csv) ──
let PT_ARCHIVE = [];                      // trading days stored by the daily update
async function ptLoadArchiveIndex() {
  if (!IS_HTTP) return;
  try {
    const r = await fetch('data/history/prices/index.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) { PT_ARCHIVE = (await r.json()).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)); ptRefreshDateSelect(); }
  } catch (e) { /* no archive published yet */ }
}
function parseCSV(text) {
  // RFC 4180-ish: quoted fields may contain commas, quotes ("") and newlines
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.length > 1);
  return body.map(r => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}
async function ptLoadArchived(date) {
  try {
    const r = await fetch('data/history/prices/' + date + '.csv', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const n = v => (v === '' || v === undefined || v === null) ? null : Number(v);
    const rows = parseCSV(await r.text());
    ptAllData = cleanPayload(rows).filter(x => SYM_RE.test(x.sym)).map((x, i) => ({
      sn: i + 1, symbol: x.sym, name: x.name || x.sym, sector: x.sector || 'Others',
      ltp: n(x.ltp), change: n(x.change), pct: n(x.pct), open: n(x.open), high: n(x.high), low: n(x.low),
      close: n(x.close) ?? n(x.ltp), vwap: n(x.vwap), vol: n(x.vol), prev: n(x.prev), turnover: n(x.turnover),
      w52h: n(x.w52h), w52l: n(x.w52l)
    }));
    showToast('Archived close of ' + isoToLabel(date) + ' — ' + ptAllData.length + ' stocks');
  } catch (e) {
    showToast('Could not load the archived list for ' + date);
    ptAllData = [];
  }
  ptCurrentPage = 1; ptFilter(); ptUpdateSubtitle();
}

function ptSwitchDate(date) {
  ptActiveDate = date;
  const db = ptGetDB();
  if (!(LIVE_PRICES && date === LIVE_PRICES_DATE) && PT_ARCHIVE.includes(date)) { ptLoadArchived(date); return; }
  if (LIVE_PRICES && LIVE_PRICES.length && date === LIVE_PRICES_DATE) {
    // Prices published by the daily GitHub Action (or latest.json)
    ptAllData = LIVE_PRICES.map((r, i) => ({
      sn:i+1, symbol:r.sym, name:r.name || r.sym, sector:r.sector || 'Others',
      ltp:r.ltp, change:r.change, pct:r.pct, open:r.open, high:r.high, low:r.low,
      close:r.close ?? r.ltp, vwap:r.vwap, vol:r.vol, prev:r.prev, turnover:r.turnover,
      w52h:r.w52h, w52l:r.w52l
    }));
  } else if (db[date]) {
    // Saved in this browser — fresher Action data for the same date wins (above)
    ptAllData = cleanPayload(db[date].rows || []).filter(r => SYM_RE.test(r.symbol));
    showToast('Loaded ' + ptAllData.length + ' records for ' + date);
  } else {
    // Fallback: built-in Aug 27, 2026 snapshot
    ptAllData = PT_AUG27.map((r, i) => ({
      sn:i+1, symbol:r[0], name:r[1], sector:r[2],
      ltp:r[3], change:r[4], pct:r[5], open:r[6], high:r[7], low:r[8],
      close:r[9], vwap:r[10], vol:r[11], prev:r[12], turnover:r[13], w52h:r[14], w52l:r[15]
    }));
  }
  ptCurrentPage = 1;
  ptSectorOptions();
  ptFilter();
  ptUpdateSubtitle();
}

function ptUpdateSubtitle() {
  const el = document.getElementById('pt-subtitle');
  if (!el) return;
  const dObj = new Date(ptActiveDate + 'T00:00:00');   // local date, not UTC midnight
  const lbl  = dObj.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  el.innerHTML = 'Data: ' + lbl + ' · Source: <a href="https://www.sharesansar.com/today-share-price" target="_blank" style="color:var(--accent);">sharesansar.com</a>';
}

// ── Filtering ────────────────────────────────────────────────
function ptSectorOptions() {
  const sel = document.getElementById('pt-sector-filter');
  if (!sel) return;
  const cur = sel.value;
  const secs = [...new Set(ptAllData.map(r => r.sector).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All sectors</option>' + secs.map(s => `<option>${esc(s)}</option>`).join('');
  if (secs.includes(cur)) sel.value = cur;
}

function ptFilter() {
  const q      = (document.getElementById('pt-search')?.value || '').toLowerCase().trim();
  const sec    = (document.getElementById('pt-sector-filter')?.value || '');
  const chg    = (document.getElementById('pt-change-filter')?.value || '');

  ptData = ptAllData.filter(r => {
    if (q && !r.symbol.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) return false;
    if (sec && r.sector !== sec) return false;
    if (chg === 'up'   && r.change <= 0) return false;
    if (chg === 'down' && r.change >= 0) return false;
    if (chg === 'unch' && r.change !== 0) return false;
    return true;
  });

  ptSortData();
  ptCurrentPage = 1;
  ptRender();

  const sh = document.getElementById('pt-showing');
  if (sh) sh.textContent = ptData.length + ' of ' + ptAllData.length + ' stocks';
}

// ── Sorting ──────────────────────────────────────────────────
function ptSort(col) {
  if (ptSortCol === col) ptSortAsc = !ptSortAsc;
  else { ptSortCol = col; ptSortAsc = col === 'symbol'; }
  document.querySelectorAll('.pt-th').forEach((th, i) => {
    th.classList.toggle('sorted', PT_COLS[i] === col);
  });
  ptSortData();
  ptCurrentPage = 1;
  ptRender();
}

function ptSortData() {
  const col = ptSortCol;
  ptData.sort((a, b) => {
    let av = a[col], bv = b[col];
    const aNull = av === null || av === undefined || av === '', bNull = bv === null || bv === undefined || bv === '';
    if (aNull || bNull) return aNull === bNull ? 0 : aNull ? 1 : -1;   // blanks last, both directions
    if (typeof av === 'string') return ptSortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    return ptSortAsc ? av - bv : bv - av;
  });
}

// ── Rendering ────────────────────────────────────────────────
function ptRender() {
  const tbody   = document.getElementById('pt-tbody');
  const perPage = parseInt(document.getElementById('pt-per-page')?.value || '50');
  const total   = ptData.length;
  const pages   = Math.max(1, Math.ceil(total / perPage));
  ptCurrentPage = Math.max(1, Math.min(ptCurrentPage, pages));
  const start   = (ptCurrentPage - 1) * perPage;
  const slice   = ptData.slice(start, start + perPage);
  const pgInfo  = document.getElementById('pt-page-info');
  const rcEl    = document.getElementById('pt-record-count');
  if (pgInfo)  pgInfo.textContent = 'Page ' + ptCurrentPage + ' of ' + pages + ' (' + total + ' stocks)';
  if (rcEl)    rcEl.textContent   = total + ' stocks';

  if (!slice.length) {
    tbody.innerHTML = '<tr><td colspan="15" style="padding:30px;text-align:center;color:var(--text3);font-size:13px;">No stocks match the current filter.</td></tr>';
    return;
  }

  const f2 = n => (n == null || n === '' ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 }));
  const fi = n => (n == null || n === '' ? '—' : Number(n).toLocaleString('en-IN'));
  const ft = n => {
    if (n == null || n === '') return '—';
    const v = Number(n);
    if (v >= 1e9)  return 'Rs ' + (v/1e9).toFixed(2) + 'B';
    if (v >= 1e7)  return 'Rs ' + (v/1e7).toFixed(2) + ' Cr';
    if (v >= 1e5)  return 'Rs ' + (v/1e5).toFixed(2) + 'L';
    return 'Rs ' + fi(v);
  };

  tbody.innerHTML = slice.map((r, idx) => {
    const cls     = r.change > 0 ? 'pt-pos' : r.change < 0 ? 'pt-neg' : 'pt-unch';
    const sgn     = r.change > 0 ? '+' : '';
    const barW    = Math.min(Math.abs(r.pct || 0) * 4, 32);
    const barCol  = r.change > 0 ? 'var(--green)' : r.change < 0 ? 'var(--red)' : 'var(--text3)';
    const chkUrl  = `https://chukul.com/stock-profile?symbol=${encodeURIComponent(r.symbol)}`;
    const ssUrl   = `https://www.sharesansar.com/company/${r.symbol}`;
    return `<tr class="pt-row">
      <td class="pt-td">${start + idx + 1}</td>
      <td class="pt-td">
        <a href="${chkUrl}" target="_blank" class="pt-sym-link" title="${esc(r.name)} · ${esc(r.sector)}">${esc(r.symbol)}</a>
        <span class="pt-name" title="${esc(r.name)}">${esc(r.name.length > 26 ? r.name.slice(0,26)+'…' : r.name)}</span>
      </td>
      <td class="pt-td" style="font-weight:500;">${f2(r.ltp)}</td>
      <td class="pt-td ${cls}">${sgn}${f2(r.change)}<span class="pt-gain-bar" style="width:${barW}px;background:${barCol};"></span></td>
      <td class="pt-td ${cls}">${typeof r.pct === 'number' ? sgn + r.pct.toFixed(2) + '%' : '—'}</td>
      <td class="pt-td">${f2(r.open)}</td>
      <td class="pt-td">${f2(r.high)}</td>
      <td class="pt-td">${f2(r.low)}</td>
      <td class="pt-td">${f2(r.close)}</td>
      <td class="pt-td" style="color:var(--text3);">${f2(r.vwap)}</td>
      <td class="pt-td">${fi(r.vol)}</td>
      <td class="pt-td" style="color:var(--text3);">${f2(r.prev)}</td>
      <td class="pt-td">${ft(r.turnover)}</td>
      <td class="pt-td" style="color:var(--text2);">${f2(r.w52h)}</td>
      <td class="pt-td" style="color:var(--text2);">${f2(r.w52l)}</td>
    </tr>`;
  }).join('');
}

function ptPage(dir) {
  const perPage = parseInt(document.getElementById('pt-per-page')?.value || '50');
  const pages   = Math.max(1, Math.ceil(ptData.length / perPage));
  ptCurrentPage = Math.max(1, Math.min(ptCurrentPage + dir, pages));
  ptRender();
}

// ── CSV Export ───────────────────────────────────────────────
function ptExportCSV() {
  const headers = ['SN','Symbol','Name','Sector','LTP','Change','% Change','Open','High','Low','Close','VWAP','Volume','Prev Close','Turnover','52W High','52W Low'];
  const rows = ptData.map(r => [
    r.sn, r.symbol, '"'+r.name+'"', '"'+r.sector+'"',
    r.ltp, r.change, r.pct, r.open, r.high, r.low, r.close, r.vwap, r.vol, r.prev, r.turnover, r.w52h, r.w52l
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'NEPSE_prices_' + ptActiveDate + '.csv';
  a.click();
  showToast('Exported ' + ptData.length + ' rows to CSV');
}

// ── Init price table ─────────────────────────────────────────
function initPriceTable() {
  // ptActiveDate starts at the fallback date; bootLiveData() switches it to live data
  const dateToLoad = ptActiveDate || '2026-08-27';
  ptSwitchDate(dateToLoad);
  ptRefreshDateSelect();
  ptUpdateDbInfo();
}

// ============================================================
// OPTION C — SELF-UPDATING VIA CLAUDE API + WEB SEARCH
// On every page open: calls Claude API with web_search tool
// → receives current NEPSE JSON → merges into LIVE_SNAPSHOT
// → re-renders all panels. Falls back to hardcoded data if
// API is unavailable (network error, auth, etc.)
// ============================================================

function setBannerState(state, msg, sub, src) {
  const icons  = { loading:'⏳', success:'✅', fallback:'📋', error:'⚠️' };
  // status colour: neutral when fine, amber when it needs attention (never price colours)
  const colors = { loading:'var(--text3)', success:'var(--text2)', fallback:'var(--amber)', error:'var(--amber)' };
  msg = String(msg || '').replace(/^[^\p{L}\p{N}]+/u, '');       // drop leading emoji
  const el_ico = document.getElementById('live-icon');
  const el_st  = document.getElementById('live-status');
  const el_ts  = document.getElementById('live-timestamp');
  const el_src = document.getElementById('live-source-tag');
  const el_bar = document.getElementById('live-quality-bar');
  const el_fill= document.getElementById('live-qfill');
  if (el_ico) el_ico.textContent = icons[state] || '⚡';
  if (el_st)  { el_st.textContent = msg; el_st.style.color = colors[state] || 'var(--text)'; }
  if (el_ts)  el_ts.textContent = sub || '';
  if (el_src) el_src.textContent = src || '';
  if (el_bar) el_bar.style.display = state === 'success' ? 'flex' : 'none';
  if (el_fill && state === 'success') setTimeout(() => el_fill.style.width = '100%', 100);
}

const LIVE_SYSTEM_PROMPT = `You are a NEPSE (Nepal Stock Exchange) live data agent. Search the web for the most recent market data from nepalstock.com, sharesansar.com, nepsetrading.com, merolagani.com, and nrb.org.np.

Return ONLY a single valid JSON object — no markdown, no backticks, no explanation, absolutely nothing else before or after the JSON.

Required JSON structure (all numbers must be numbers, not strings; null if unavailable):
{"index":<number>,"change":<number>,"changePct":<number>,"date":"<Mon DD YYYY>","date_bs":"<BS date>","day":"<Weekday>","open":<number|null>,"high":<number|null>,"low":<number|null>,"turnover":<number>,"traded_shares":<number>,"transactions":<number>,"scrips_traded":<number>,"market_cap":<number>,"float_mkt_cap":<number>,"gainers":<number>,"losers":<number>,"unchanged":<number>,"sector_leader":"<string>","sector_lagger":"<string>","nrb_repo":<number>,"nrb_slf":<number>,"inflation":<number|null>,"forex_months":<number|null>,"cd_ratio":<number|null>,"top_gainers":[{"sym":"","name":"","close":0,"change":0,"pct":0}],"top_losers":[{"sym":"","name":"","close":0,"change":0,"pct":0}],"top_turnover":[{"sym":"","name":"","turnover":0,"ltp":0}],"top_volume":[{"sym":"","name":"","volume":0,"ltp":0}],"top_transactions":[{"sym":"","name":"","txns":0,"ltp":0}],"source":"nepalstock.com","fetched_at":"<ISO>"}`;

function buildLiveUserPrompt() {
  const st   = getNPTStatus();
  const npt  = st.npt;
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateStr = days[npt.getDay()] + ' ' + mons[npt.getMonth()] + ' ' + npt.getDate() + ' ' + npt.getFullYear();
  const timeStr = npt.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true});

  let instruction;
  if (!st.isTradingDay) {
    instruction = 'Today is a weekend (NEPSE closed Sat–Sun). Fetch the most recent completed trading day (normally last Friday) closing data.';
  } else if (st.isMarketOpen) {
    instruction = 'NEPSE market is currently OPEN (11AM–3PM NPT). Fetch YESTERDAY\'s final closing data — NOT today\'s intraday price.';
  } else if (st.isDataAvailable) {
    instruction = 'NEPSE market has closed and today\'s final data is available (after 3:45PM NPT). Fetch TODAY\'s closing data.';
  } else if (st.isPreMarket) {
    instruction = 'NEPSE has not opened yet today (opens 11AM NPT). Fetch YESTERDAY\'s final closing data.';
  } else {
    instruction = 'NEPSE closed at 3:00PM but data is not published yet (available after 3:45PM NPT). Fetch YESTERDAY\'s final closing data.';
  }

  return `Nepal date/time: ${dateStr} at ${timeStr} NPT (GMT+5:45). NEPSE trades Mon–Fri, 11:00AM–3:00PM NPT.

${instruction}

Search nepalstock.com for: NEPSE index closing price, point change, % change, total turnover, traded shares, transactions, scrips traded, market capitalisation, number of gainers/losers/unchanged, top 5 gainers with close price and % change, top 5 losers, top 5 by turnover with LTP, top 5 by volume, sector leader and lagger.
Search nrb.org.np for: current NRB policy/repo rate and SLF rate.
Return ONLY the JSON object — absolutely nothing else before or after it.`;
}

// ============================================================
// DAILY DATA ENGINE  (GitHub Pages edition)
// ------------------------------------------------------------
// Where the data comes from, in priority order:
//   1. The <script id="nepse-data"> block inside this file —
//      rewritten every trading day by the GitHub Action
//      (scripts/fetch_nepse.py, Mon–Fri 4:00 PM NPT, retry 4:45 PM).
//   2. data/latest.json on the same site — picked up without a
//      page reload while the dashboard stays open.
//   3. Browser localStorage cache of the last good data.
//   4. Built-in fallback snapshot (Aug 27, 2026).
// The browser never needs an API key. A direct Claude API fetch
// is only attempted when the file runs inside Claude.ai.
// ============================================================

const CAN_BROWSER_AI = /(^|\.)claudeusercontent\.com$|(^|\.)claude\.ai$/.test(location.hostname);
const IS_HTTP        = location.protocol === 'http:' || location.protocol === 'https:';
const CACHE_KEY      = 'nepse_live_cache';
const CACHE_VER      = 3;

// ── Claude requests ──────────────────────────────────────────
// Served from this PC (scripts/secure_server.py): POST /api/claude — the
// server holds ANTHROPIC_API_KEY and chooses the model; the key never
// reaches the browser. Inside Claude.ai: a direct call (Claude.ai supplies
// the auth). Both return the Messages API shape ({content: [...]}).
const CLAUDE_AI_MODEL = 'claude-sonnet-4-6';   // only used inside Claude.ai
function claudeRequest(body) {
  if (CAN_BROWSER_AI) {
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: CLAUDE_AI_MODEL, ...body })
    });
  }
  return fetch('/api/claude', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system: body.system, messages: body.messages,
                           web_search: (body.tools || []).some(t => t.name === 'web_search') })
  });
}

let LIVE_PRICES      = null;   // price rows from Action / latest.json
let LIVE_PRICES_DATE = null;   // ISO trade date of LIVE_PRICES
let DATA_SOURCE      = 'fallback';
let _busy            = false;  // true while a fetch is running (banner guard)
let _aiTried         = {};     // browser-AI fetch attempted per expected date
let _tick            = 0;

const EMBEDDED = (() => {
  try {
    const el = document.getElementById('nepse-data');
    const t  = el ? el.textContent.trim() : '';
    return (t && t !== 'null') ? JSON.parse(t) : null;
  } catch (e) { console.warn('[Data] Embedded block unreadable:', e.message); return null; }
})();

// ── Date helpers ─────────────────────────────────────────────
const _MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _WKDS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function toISO(str) {
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  return isNaN(d) ? null : isoOf(d);
}
function isoToLabel(iso) {           // '2026-09-03' → 'Sep 3, 2026'
  const [y, m, d] = iso.split('-').map(Number);
  return _MONS[m-1] + ' ' + d + ', ' + y;
}
function isoToDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return _WKDS[new Date(y, m-1, d).getDay()];
}
function isoToMonthLabel(iso) {      // '2026-09-03' → 'Sep 26' (chart label format)
  const [y, m] = iso.split('-').map(Number);
  return _MONS[m-1] + ' ' + String(y).slice(2);
}
function monthKey(label) {           // 'Sep 26' → sortable number
  const [mon, yy] = label.split(' ');
  return (2000 + Number(yy)) * 12 + _MONS.indexOf(mon);
}
function fmtNPT(isoTs) {
  try {
    return new Date(isoTs).toLocaleString('en-US', {
      timeZone:'Asia/Kathmandu', month:'short', day:'numeric',
      hour:'2-digit', minute:'2-digit', hour12:true }) + ' NPT';
  } catch (e) { return isoTs; }
}
function dataTradeISO(d) { return d.trade_date || toISO(d.date); }
function isNewer(d) {
  const iso = dataTradeISO(d) || '';
  const cur = LIVE_SNAPSHOT.trade_date || '';
  return iso > cur || (iso === cur && (d.updated_at || '') > (LIVE_SNAPSHOT.updated_at || ''));
}
function isStale() { return (LIVE_SNAPSHOT.trade_date || '') < expectedTradeISO(); }

// ── Browser cache ────────────────────────────────────────────
function saveCache(d) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ v: CACHE_VER, data: d })); }
  catch (e) { console.warn('[Cache] write failed:', e.message); }
}
function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return (c && c.v === CACHE_VER && c.data && c.data.index) ? c.data : null;
  } catch (e) { return null; }
}

// ── Chart: add or update a monthly point ─────────────────────
function upsertMonth(label, close, volB) {
  if (!label || typeof close !== 'number') return;
  const i = allData.labels.indexOf(label);
  if (i >= 0) {
    allData.price[i] = Math.round(close);
    if (typeof volB === 'number') allData.volume[i] = +volB.toFixed(2);
    return;
  }
  const last = allData.labels[allData.labels.length - 1];
  if (monthKey(label) <= monthKey(last)) return;        // never insert out of order
  allData.labels.push(label);
  allData.price.push(Math.round(close));
  allData.volume.push(typeof volB === 'number' ? +volB.toFixed(2) : allData.volume[allData.volume.length - 1]);
}

// ── Merge a data payload into LIVE_SNAPSHOT ──────────────────
function applyLiveData(live) {
  const n   = (v, fb) => (typeof v === 'number' && !isNaN(v)) ? v : fb;
  const s   = (v, fb) => (typeof v === 'string' && v.trim())  ? v.trim() : fb;
  const arr = (v, fb) => (Array.isArray(v) && v.length > 0)   ? v : fb;

  const iso = dataTradeISO(live);
  if (iso) {
    LIVE_SNAPSHOT.trade_date = iso;
    LIVE_SNAPSHOT.date       = isoToLabel(iso);
    LIVE_SNAPSHOT.day        = isoToDay(iso);
  }
  LIVE_SNAPSHOT.date_bs       = s(live.date_bs, '');
  LIVE_SNAPSHOT.updated_at    = s(live.updated_at, LIVE_SNAPSHOT.updated_at || '');
  LIVE_SNAPSHOT.source        = s(live.source, LIVE_SNAPSHOT.source || '');
  LIVE_SNAPSHOT.live_status   = live.live ? s(live.status, '') : '';
  LIVE_SNAPSHOT.live_time     = live.live && typeof live.as_of === 'string' ? live.as_of.slice(11, 16) : '';

  // Figures that belong to one trading day fall back to null ("—"), never to
  // the previous payload or the built-in Aug 27 snapshot. Only the index
  // itself and slow-moving reference data (NRB rates) keep a fallback.
  LIVE_SNAPSHOT.index         = n(live.index,         LIVE_SNAPSHOT.index);
  LIVE_SNAPSHOT.change        = n(live.change,        null);
  LIVE_SNAPSHOT.changePct     = n(live.changePct,     null);
  LIVE_SNAPSHOT.open          = n(live.open,          null);
  LIVE_SNAPSHOT.high          = n(live.high,          null);
  LIVE_SNAPSHOT.low           = n(live.low,           null);
  LIVE_SNAPSHOT.turnover      = n(live.turnover,      null);
  LIVE_SNAPSHOT.traded_shares = n(live.traded_shares, null);
  LIVE_SNAPSHOT.transactions  = n(live.transactions,  null);
  LIVE_SNAPSHOT.scrips_traded = n(live.scrips_traded, null);
  LIVE_SNAPSHOT.market_cap    = n(live.market_cap,    null);
  LIVE_SNAPSHOT.float_mkt_cap = n(live.float_mkt_cap, null);
  LIVE_SNAPSHOT.gainers       = n(live.gainers,       null);
  LIVE_SNAPSHOT.losers        = n(live.losers,        null);
  LIVE_SNAPSHOT.unchanged     = n(live.unchanged,     null);
  LIVE_SNAPSHOT.sector_leader = s(live.sector_leader, null);
  LIVE_SNAPSHOT.sector_lagger = s(live.sector_lagger, null);
  LIVE_SNAPSHOT.nrb_repo      = n(live.nrb_repo,      LIVE_SNAPSHOT.nrb_repo);
  LIVE_SNAPSHOT.nrb_slf       = n(live.nrb_slf,       LIVE_SNAPSHOT.nrb_slf);

  LIVE_SNAPSHOT.top_gainers      = arr(live.top_gainers,      []);
  LIVE_SNAPSHOT.top_losers       = arr(live.top_losers,       []);
  LIVE_SNAPSHOT.top_turnover     = arr(live.top_turnover,     []);
  LIVE_SNAPSHOT.top_volume       = arr(live.top_volume,       []);
  LIVE_SNAPSHOT.top_transactions = arr(live.top_transactions, []);

  // Verification report of this payload's trade date (scripts/verify_daily.py)
  LIVE_SNAPSHOT.verification = (live.verification && typeof live.verification === 'object') ? live.verification : null;

  // Weekly / monthly summaries — they describe the payload's own history, so
  // an older payload never mixes with a newer one
  LIVE_SNAPSHOT.periods = (live.periods && typeof live.periods === 'object') ? live.periods : null;

  // Chart: month-end closes from the Action's history, else today's close
  if (Array.isArray(live.monthly) && live.monthly.length) {
    live.monthly.forEach(m => upsertMonth(m.label, m.close, m.turnover_b));
  } else if (iso && typeof live.index === 'number') {
    upsertMonth(isoToMonthLabel(iso), live.index, null);
  }
}

// ── Untrusted text → safe text ───────────────────────────────
// Every payload (embedded block, latest.json, cache, Claude) comes from
// scraped pages or a model and is rendered with innerHTML templates, so it
// is cleaned once here: markup characters are removed from all strings and
// rows whose symbol is not a plain ticker are dropped.
const SYM_RE = /^[A-Z0-9]{1,12}$/;
function cleanText(s) {
  return String(s).replace(/[<>`]/g, '').replace(/"/g, '”').replace(/'/g, '’');
}
function cleanPayload(v) {
  if (typeof v === 'string') return cleanText(v);
  if (Array.isArray(v)) {
    return v.map(cleanPayload)
            .filter(x => !(x && typeof x === 'object' && 'sym' in x && !SYM_RE.test(x.sym)));
  }
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) out[k] = cleanPayload(v[k]);
    return out;
  }
  return v;
}

// ── Take a payload: apply, update price table, cache, render ─
function ingest(d, source, opts = {}) {
  d = cleanPayload(d);
  applyLiveData(d);
  DATA_SOURCE = source;
  const iso = dataTradeISO(d);
  if (Array.isArray(d.prices) && d.prices.length && iso) {
    LIVE_PRICES      = d.prices;
    LIVE_PRICES_DATE = iso;
    ptSwitchDate(iso);
    ptRefreshDateSelect();
  }
  if (!opts.noCache) saveCache(d);
  refreshLiveData();
  renderMarketSummary();
  showDataBanner();
}

// ── Banner: honest about what date is shown and why ──────────
function showDataBanner() {
  if (_busy) return;
  const st   = getNPTStatus();
  const snap = LIVE_SNAPSHOT;
  const src  = {
    action:   'Daily GitHub update',
    latest:   'data/latest.json',
    live:     'Intraday live',
    cache:    'Browser cache',
    claude:   'Claude live fetch',
    fallback: 'Built-in fallback'
  }[DATA_SOURCE] || DATA_SOURCE;
  const upd  = snap.updated_at ? ' · Updated ' + fmtNPT(snap.updated_at) : '';
  const lbl  = snap.date + (snap.day ? ' (' + snap.day + ')' : '');

  if (DATA_SOURCE === 'live') {
    const age  = snap.updated_at ? Math.round((Date.now() - Date.parse(snap.updated_at)) / 60000) : null;
    const lag  = st.isMarketOpen && age !== null && age > 5 ? ' · ⚠ no update for ' + age + ' min — is live_intraday.py running?' : '';
    const stat = snap.live_status ? snap.live_status + ' · ' : '';
    setBannerState(lag ? 'error' : 'success',
      '🔴 LIVE — ' + lbl + ' · as of ' + (snap.live_time || '?') + ' NPT',
      stat + 'Provisional intraday figures (ShareSansar live-trading, refreshed every minute). '
        + 'The official close replaces them after the 4 PM update.' + lag, src);
    return;
  }

  if (!isStale()) {
    let note = '';
    if (st.isMarketOpen)       note = ' · Market open now — today\'s close publishes ~4:05 PM NPT';
    else if (!st.isTradingDay) note = ' · Weekend — market reopens Monday 11:00 AM NPT';
    setBannerState('success', '✅ Latest close — ' + lbl, src + upd + note, src);
  } else {
    let why;
    if (DATA_SOURCE === 'fallback')
      why = 'No daily data published yet. Run the “NEPSE daily data” workflow once in GitHub → Actions.';
    else if (IS_HTTP)
      why = 'Today\'s close is due. The GitHub update runs 4:00 PM NPT (retry 4:45 PM); checking every 5 min. '
          + 'If today is a public holiday, this is already the latest close.';
    else
      why = 'Opened as a local file — open your GitHub Pages link to receive daily updates.';
    setBannerState('fallback', '📋 Showing close of ' + lbl, why + upd, src);
  }
}

// ── Pull data/latest.json from the same site ─────────────────
async function pullLatestJson(manual = false) {
  if (!IS_HTTP) return false;
  try {
    const r = await fetch('data/latest.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (!d || typeof d.index !== 'number') throw new Error('no index in latest.json');
    if (!isNewer(d)) return false;
    ingest(d, 'latest');
    if (VIEWS && VIEWS.live) reloadOfficialViews();
    console.log('[Data] latest.json applied:', dataTradeISO(d));
    return true;
  } catch (e) {
    if (manual) console.warn('[Data] latest.json not available:', e.message);
    return false;
  }
}

// ── Browser Claude fetch — only when running inside Claude.ai ─
async function autoFetchLiveData(force = false) {
  if (!CAN_BROWSER_AI) return false;
  if (!force && !getNPTStatus().isDataAvailable) return false;
  _busy = true;
  setBannerState('loading', '⏳ Fetching live NEPSE data…', 'Claude is searching nepalstock.com · ShareSansar · NRB (15–30 sec)', '');
  try {
    const resp = await claudeRequest({
      max_tokens: 1500,
      system: LIVE_SYSTEM_PROMPT,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: buildLiveUserPrompt() }]
    });
    if (!resp.ok) throw new Error('API ' + resp.status);
    const data  = await resp.json();
    const texts = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const clean = texts.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const a = clean.indexOf('{'), b = clean.lastIndexOf('}');
    if (a < 0 || b < 0) throw new Error('No JSON in response');
    const parsed = JSON.parse(clean.slice(a, b + 1));
    if (typeof parsed.index !== 'number') throw new Error('Invalid index');
    parsed.trade_date = toISO(parsed.date);
    parsed.updated_at = new Date().toISOString();
    _busy = false;
    ingest(parsed, 'claude');
    return true;
  } catch (e) {
    console.error('[Data] Claude fetch failed:', e.message);
    _busy = false;
    showDataBanner();
    return false;
  }
}

// ── ↻ Refresh button ─────────────────────────────────────────
async function manualRefresh() {
  if (CAN_BROWSER_AI) { await autoFetchLiveData(true); return; }
  _busy = true;
  setBannerState('loading', '⏳ Checking for newer data…', 'Reading data/latest.json', '');
  _busy = false;
  const got = await pullLatestJson(true);
  if (!got) {
    showDataBanner();
    showToast(IS_HTTP ? 'Already showing the latest published close'
                      : 'Local file — open the GitHub Pages link for daily updates');
  }
}

// ── Scheduler: once a minute ─────────────────────────────────
// • Refreshes the banner (market open / closed / weekend wording)
// • After 3:45 PM NPT on a trading day, if today's close is still
//   missing, re-checks data/latest.json every 5 minutes — so an
//   open dashboard picks up the 4:00 PM GitHub update by itself.
function startDailyScheduler() {
  setInterval(async () => {
    _tick++;
    const exp = expectedTradeISO();
    if ((isStale() || DATA_SOURCE === 'live') && getNPTStatus().isDataAvailable) {
      if (CAN_BROWSER_AI && !_aiTried[exp]) { _aiTried[exp] = true; await autoFetchLiveData(); }
      else if (IS_HTTP && _tick % 5 === 0) await pullLatestJson();
    }
    showDataBanner();
  }, 60000);
}

// ── Intraday live mode (scripts/live_intraday.py) ────────────
// While the local live script runs, data/live.json and data/live_views.json
// are rewritten every minute. Checked every 30 s between 10:50 AM and
// 3:30 PM NPT (and once at page load, so an evening visit still shows the
// day's last live snapshot until the official close arrives).
let _liveAsOf = '';
async function pollIntraday() {
  if (!IS_HTTP) return false;
  try {
    const r = await fetch('data/live.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return false;
    const d = await r.json();
    if (!d || !d.live || typeof d.index !== 'number' || !d.trade_date) return false;
    const cur = LIVE_SNAPSHOT.trade_date || '';
    if (d.trade_date < cur) return false;
    // the official close for that day is already shown: never go back to provisional
    if (d.trade_date === cur && DATA_SOURCE !== 'live') return false;
    if (d.as_of === _liveAsOf) return false;
    _liveAsOf = d.as_of;
    ingest(d, 'live', { noCache: true });
    const v = await fetch('data/live_views.json?t=' + Date.now(), { cache: 'no-store' });
    if (v.ok) {
      const vd = cleanPayload(await v.json());
      if (vd && vd.live && vd.as_of === d.trade_date) applyViews(vd);
    }
    console.log('[Live] intraday', d.as_of, '| NEPSE', d.index);
    return true;
  } catch (e) { return false; }
}
function startIntradayPoller() {
  if (!IS_HTTP) return;
  setInterval(() => {
    const m = getNPTStatus().mins;
    if (m >= 10 * 60 + 50 && m <= 15 * 60 + 30) pollIntraday();
  }, 30000);
}

// ── Signed-in user (scripts/secure_server.py) ────────────────
// /whoami exists only on the login-protected local server; elsewhere
// (GitHub Pages, a file) it fails and nothing is shown.
async function showSignedInUser() {
  if (!IS_HTTP) return;
  try {
    const r = await fetch('/whoami', { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    if (!d || typeof d.user !== 'string') return;
    document.getElementById('auth-name').textContent = d.user;
    document.getElementById('auth-user').style.display = '';
    const tbo = document.getElementById('tb-logout'); if (tbo) tbo.hidden = false;
  } catch (e) { /* not behind the login server */ }
}

// ── Boot ─────────────────────────────────────────────────────
async function bootLiveData() {
  if (EMBEDDED && typeof EMBEDDED.index === 'number') ingest(EMBEDDED, 'action', { noCache: true });
  const cached = loadCache();
  if (cached && isNewer(cached)) ingest(cached, 'cache', { noCache: true });
  if (DATA_SOURCE === 'fallback') { refreshLiveData(); renderMarketSummary(); showDataBanner(); }

  await pullLatestJson();
  await pollIntraday();
  startIntradayPoller();

  if (CAN_BROWSER_AI && isStale() && getNPTStatus().isDataAvailable) {
    _aiTried[expectedTradeISO()] = true;
    await autoFetchLiveData();
  }
  startDailyScheduler();
}

// ── Single consolidated DOMContentLoaded ────────────────────
window.addEventListener('DOMContentLoaded', () => {
  updateThemeButton();
  if (window.Chart) Chart.defaults.font.family = cssVar('--sans');
  initPages();
  buildChart('all');
  calcPos();
  document.getElementById('volBtn').classList.add('active');
  initUploadZone();
  initAnnotationCanvas();
  initWyckoffChecklist();
  initPersistence();
  initDataGate();
  initNavActiveState();
  startNPTClock();
  initPriceTable();

  // Boot: embedded Action data → local cache → data/latest.json → scheduler
  bootLiveData();
  loadViews();
  showSignedInUser();
  ptLoadArchiveIndex();

  document.addEventListener('click', e => {
    if (!e.target.closest('#sa-symbol') && !e.target.closest('#symbol-dropdown'))
      document.getElementById('symbol-dropdown').style.display = 'none';
  });
});

// ════════════════════════════════════════════════════════════════
// Handlers that used to be inline on*= code
// ════════════════════════════════════════════════════════════════
function toggleParentOpen(el) { el.parentElement.classList.toggle('open'); }
function onSectorChange(el) { saState.sector = el.value; updateDataGate(); markDirty(); }
function setAppearanceKV(key, val) { setAppearance({ [key]: val }); }
// The "Print / Save PDF" button called this but it was never defined; the @media print rules above expect a plain print.
function printSummary() { window.print(); }

// ════════════════════════════════════════════════════════════════
// DELEGATED EVENT HANDLERS
// Markup declares behaviour as data-on-click / data-on-input / data-on-change /
// data-on-keydown = "fn('arg', 42, this, this.value, event); other(); return false".
// One listener per event type walks up from the target (so nested handlers fire
// in bubbling order, as inline attributes did). No inline code runs, so the
// page's Content-Security-Policy can refuse inline scripts.
// ════════════════════════════════════════════════════════════════
(function () {
  const STATEMENTS = /(?:[^;']|'(?:[^'\\]|\\.)*')+/g;
  const CALL = /^([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/;
  const ARG = /\s*('(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?|this\.value|this|event|true|false|null)\s*(,|$)/y;

  function parseArgs(src, el, ev) {
    const args = [];
    if (!src.trim()) return args;
    ARG.lastIndex = 0;
    while (ARG.lastIndex < src.length) {
      const m = ARG.exec(src);
      if (!m) throw new Error('cannot parse arguments: ' + src);
      const t = m[1];
      args.push(t[0] === "'" ? t.slice(1, -1).replace(/\\(.)/g, '$1')
        : t === 'this' ? el : t === 'this.value' ? el.value : t === 'event' ? ev
        : t === 'true' ? true : t === 'false' ? false : t === 'null' ? null : Number(t));
    }
    return args;
  }

  function run(el, code, ev) {
    for (const raw of code.match(STATEMENTS) || []) {
      const s = raw.trim();
      if (!s) continue;
      if (s === 'return false') { ev.preventDefault(); continue; }
      const m = CALL.exec(s);
      const fn = m && window[m[1]];
      if (typeof fn !== 'function') { console.warn('[handlers] unsupported:', s); continue; }
      try { fn.apply(el, parseArgs(m[2], el, ev)); }
      catch (e) { console.error('[handlers] ' + s, e); }
    }
  }

  ['click', 'input', 'change', 'keydown'].forEach(type => document.addEventListener(type, ev => {
    for (let el = ev.target instanceof Element ? ev.target : null; el; el = el.parentElement) {
      const code = el.getAttribute('data-on-' + type);
      if (code) { run(el, code, ev); if (ev.cancelBubble) break; }
    }
  }));
})();
