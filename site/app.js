// North America at War — browser runtime. Plain ES module, no framework, no build step.
// Data comes from dist/data/*, produced by tools/build.mjs.
import { applyLocale, count, esc, formatDate, locale, number, rich, t } from './i18n.js';
import { defaultLocale } from './locales/index.js';
import { localizeCatalogue, localizeMap, localizeWar, translateText } from './localized-content.js';

applyLocale();
const topojson = window.topojson;
const NS = 'http://www.w3.org/2000/svg';
const $ = (id) => document.getElementById(id);
const svg = $('map'), wrap = $('mapwrap'), pop = $('pop');
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const themeRoot = document.documentElement, themeToggle = $('theme-toggle');
function describeThemeToggle() {
  const label = t(themeRoot.dataset.theme === 'dark' ? 'switchToLightTheme' : 'switchToDarkTheme');
  themeToggle.setAttribute('aria-label', label);
  themeToggle.title = label;
}
themeToggle.addEventListener('click', () => {
  const theme = themeRoot.dataset.theme === 'dark' ? 'light' : 'dark';
  themeRoot.dataset.theme = theme;
  describeThemeToggle();
  const url = new URL(location.href);
  let updateUrl = url.searchParams.has('theme');
  try { localStorage.setItem('north-america-at-war.theme', theme); } catch { updateUrl = true; }
  if (updateUrl) {
    url.searchParams.set('theme', theme);
    history.replaceState(history.state, '', url);
  }
});
describeThemeToggle();

const HATCH_ROT = [45, -45, 0, 90];

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function dateKey(d) {
  if (d === null || d === undefined) return null;
  const m = String(d).trim().match(/^(-?\d{1,4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  return m ? `${m[1].padStart(4, '0')}-${m[2] || '00'}-${m[3] || '00'}` : null;
}
const yearOf = (k) => (k ? parseInt(k.slice(0, 4), 10) : null);
function fmtYears(w) {
  const start = number(yearOf(w.sk));
  const end = w.end === 'ongoing' ? t('today') : number(yearOf(w.ek));
  return start === end ? start : t('yearRange', { start, end });
}

function shape(kind) {
  switch (kind) {
    case 'battle': return '<circle r="7" class="mfill"/><path d="M-3.1,-3.1L3.1,3.1M3.1,-3.1L-3.1,3.1" class="mglyph"/>';
    case 'naval': return '<circle r="7" class="mfill"/><path d="M-4.3,0.9H4.3L2.6,3.7H-2.6Z M-0.5,0.2V-4.6L3.5,0.2Z" class="mglyph-f"/>';
    case 'siege': return '<rect x="-6.5" y="-6.5" width="13" height="13" rx="2" class="mfill"/><path d="M-3.6,3.6V-1.4H-2.3V-3.3H-0.8V-1.4H0.8V-3.3H2.3V-1.4H3.6V3.6Z" class="mglyph-f"/>';
    case 'held': return '<rect x="-6.3" y="-6.3" width="12.6" height="12.6" rx="2" class="mhollow"/><path d="M-3.4,3.4V-1.3H-2.2V-3.1H-0.8V-1.3H0.8V-3.1H2.2V-1.3H3.4V3.4Z" class="mglyph-s"/>';
    case 'taken': return '<circle r="5" class="mfill"/>';
    case 'event': return '<circle r="6.2" class="mhollow"/><circle r="2.4" class="mfill" style="stroke:none"/>';
    case 'treaty': return '<rect x="-5.6" y="-5.6" width="11.2" height="11.2" transform="rotate(45)" class="mgold"/>';
    case 'toll': return '<circle r="7" class="mgold"/><path d="M-3.6,-1.3q1.8,-1.6 3.6,0t3.6,0M-3.6,1.9q1.8,-1.6 3.6,0t3.6,0" class="mglyph-g"/>';
    case 'air': return '<circle r="7" class="mfill"/><path d="M0,-4.4L1,-0.8L4.4,0.6V1.6L1,0.9L0.7,3L1.8,3.9V4.6L0,4.1L-1.8,4.6V3.9L-0.7,3L-1,0.9L-4.4,1.6V0.6L-1,-0.8Z" class="mglyph-f"/>';
    case 'capital': return '<circle r="3.2" class="mcap"/>';
    default: return '<circle r="5" class="mfill"/>';
  }
}
function labelAttrs(lp) {
  if (lp === 'l') return { x: -11, y: 4, a: 'end' };
  if (lp === 't') return { x: 0, y: -12, a: 'middle' };
  if (lp === 'b') return { x: 0, y: 20, a: 'middle' };
  return { x: 11, y: 4, a: 'start' };
}

// ---------- Geometry helpers ----------
function pathD(g) {
  if (!g) return '';
  const ring = (r, close) => 'M' + r.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L') + (close ? 'Z' : '');
  switch (g.type) {
    case 'Polygon': return g.coordinates.map((r) => ring(r, true)).join('');
    case 'MultiPolygon': return g.coordinates.map((p) => p.map((r) => ring(r, true)).join('')).join('');
    case 'LineString': return ring(g.coordinates, false);
    case 'MultiLineString': return g.coordinates.map((r) => ring(r, false)).join('');
    case 'GeometryCollection': return g.geometries.map(pathD).join('');
    default: return '';
  }
}
function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); }

/** Signed distance from (x, y) to the polygon's edges: positive inside. */
function signedDist(poly, x, y) {
  let inside = false, min = Infinity;
  for (const r of poly) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    let px = a[0], py = a[1], dx = b[0] - px, dy = b[1] - py;
    if (dx || dy) { const t = ((x - px) * dx + (y - py) * dy) / (dx * dx + dy * dy); if (t > 1) { px = b[0]; py = b[1]; } else if (t > 0) { px += dx * t; py += dy * t; } }
    dx = x - px; dy = y - py; const d = dx * dx + dy * dy; if (d < min) min = d;
  }
  return (inside ? 1 : -1) * Math.sqrt(min);
}
// Pole of inaccessibility (after Mapbox's polylabel, ISC licence).
function polylabel(poly, precision) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly[0]) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  const w = x1 - x0, h = y1 - y0, size = Math.min(w, h);
  if (!size) return [x0, y0, 0];
  const dist = (x, y) => signedDist(poly, x, y);
  const cell = (x, y, hh) => { const d = dist(x, y); return { x, y, h: hh, d, max: d + hh * Math.SQRT2 }; };
  const heap = [];
  const push = (c) => { heap.push(c); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].max >= heap[i].max) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const popTop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l].max > heap[m].max) m = l; if (r < heap.length && heap[r].max > heap[m].max) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  let half = size / 2;
  for (let x = x0; x < x1; x += size) for (let y = y0; y < y1; y += size) push(cell(x + half, y + half, half));
  let best = cell(x0 + w / 2, y0 + h / 2, 0);
  let n = 0;
  while (heap.length && n++ < 4000) {
    const c = popTop();
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    half = c.h / 2;
    push(cell(c.x - half, c.y - half, half)); push(cell(c.x + half, c.y - half, half));
    push(cell(c.x - half, c.y + half, half)); push(cell(c.x + half, c.y + half, half));
  }
  return [best.x, best.y, best.d];
}

// ---------- Load data ----------
const fetchJSON = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); });
const localeData = `data/locales/${locale}`;
const optionalTranslation = (file) => fetchJSON(`${localeData}/${file}`).catch(() => null);
let topo, B, WARS, LBL, translations;
try {
  const files = ['data/atoms.topo.json', 'data/borders.json', 'data/wars.json', 'data/labels.json'];
  [topo, B, WARS, LBL, translations] = await Promise.all([
    ...files.map(fetchJSON),
    locale === defaultLocale ? null : optionalTranslation('index.json'),
  ]);
} catch (e) {
  $('loading').textContent = t('mapError');
  throw e;
}
const searchIndex = new Map();
const searchText = (value) => value.toLocaleLowerCase(locale).normalize('NFC');
const warSearchText = (war) => [war.name, war.summary, ...war.steps.map(step => step.t)].map(searchText);
if (translations) localizeMap(B, LBL, (category, value) => translateText(translations.map[category], value));
for (const war of WARS) {
  const search = warSearchText(war);
  const dictionary = translations?.index[war.id];
  if (dictionary) {
    localizeCatalogue(war, (value) => translateText(dictionary, value));
    search.push(...warSearchText(war));
  }
  searchIndex.set(war.id, search);
}
const storyTranslations = new Set(translations?.stories);

const warById = new Map(WARS.map((w) => [w.id, w]));
const warCache = new Map();
function loadWar(id) {
  if (!warCache.has(id)) {
    const base = fetchJSON(`data/wars/${id}.json`);
    const translated = storyTranslations.has(id) ? optionalTranslation(`wars/${id}.json`) : null;
    warCache.set(id, Promise.all([base, translated]).then(([war, dictionary]) =>
      dictionary ? localizeWar(war, (value) => translateText(dictionary, value)) : war
    ).catch(error => {
      warCache.delete(id);
      throw error;
    }));
  }
  return warCache.get(id);
}
const POL = B.polities;
const datedPolities = POL.filter(p => p.names?.length);
let curKey = '1776-12-31';
/** A polity's name at a date: `names` holds [until, name] pairs, oldest first. */
function polName(p, key = curKey) {
  for (const [until, n] of p.names || []) if (key < until) return n;
  return p.name;
}
const geoms = topo.objects.atoms.geometries;
geoms.forEach((g, i) => { g.i = i; });
const NA = geoms.length;
const FRAME = B.frame || [-1950, -2400, 5600, 4750];
const REF_W = LBL.refWidth || 2000;

// ---------- Border timeline ----------
const T = B.timeline;
const snaps = new Map();
function stateIndex(key) {
  let lo = 0, hi = T.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (T[m].k <= key) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
function ownersAt(si) {
  if (snaps.has(si)) return snaps.get(si);
  let k = -1;
  for (const index of snaps.keys()) if (index <= si && index > k) k = index;
  const owners = k >= 0 ? snaps.get(k).slice() : new Int16Array(NA).fill(-1);
  for (let i = k + 1; i <= si; i++) {
    const changes = T[i].c;
    for (let j = 0; j < changes.length; j += 2) owners[changes[j]] = changes[j + 1];
  }
  if (snaps.size >= 40) snaps.delete(snaps.keys().next().value);
  snaps.set(si, owners);
  return owners;
}

// ---------- Build the map ----------
const defs = el('defs', null, svg);
const patterns = [];
function hatch(key, rot, cls, width, gap) {
  const id = 'h-' + key;
  if (!defs.querySelector('#' + id)) {
    const p = el('pattern', { id, width: gap, height: gap, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${rot})` }, defs);
    p.innerHTML = cls === 'hatch-lost'
      ? `<rect width="${width}" height="${gap}" class="hatch-lost"/><rect width="${gap}" height="${width}" class="hatch-lost"/>`
      // Patterns inherit CSS variables from <defs>, not from the shape that uses
      // them, so a side hatch names its ink directly (--mc would be unset here).
      : `<rect width="${width}" height="${gap}" class="${cls}"${cls === 'hatch' ? ` style="fill:var(--ink-${key.split('-')[0]})"` : ''}/>`;
    patterns.push([p, rot]);
    applyPatternScale(p, rot);
  }
  return `url(#${id})`;
}
if (B.overviewGrid) el('path', { d: B.overviewGrid, class: 'graticule', 'aria-hidden': 'true' }, svg);
const gAtoms = el('g', { 'aria-hidden': 'true' }, svg);
const atomEls = new Array(NA), atomFill = new Array(NA).fill('');
for (let i = 0; i < NA; i++) {
  atomEls[i] = el('path', { d: pathD(topojson.feature(topo, geoms[i]).geometry), class: 'atom' }, gAtoms);
}
let reliefImage;
if (B.reliefBounds) {
  const [x, y, width, height] = B.reliefBounds;
  reliefImage = el('image', { x, y, width, height, href: 'relief.webp', preserveAspectRatio: 'none', class: 'relief', 'aria-hidden': 'true' }, svg);
}
if (topo.objects.rivers) {
  const rivers = topojson.feature(topo, topo.objects.rivers).features;
  const lengths = new Map();
  for (const { geometry, properties } of rivers) {
    if (!geometry || !properties.name) continue;
    const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
    let length = lengths.get(properties.name) || 0;
    for (const line of lines) for (let i = 1; i < line.length; i++) {
      const [x, y] = line[i], [px, py] = line[i - 1];
      length += Math.hypot(x - px, y - py);
    }
    lengths.set(properties.name, length);
  }
  let minor = '', major = '';
  for (const { geometry, properties } of rivers) {
    if (lengths.get(properties.name) >= 500) major += pathD(geometry);
    else minor += pathD(geometry);
  }
  el('path', { d: minor, class: 'rivers', 'aria-hidden': 'true' }, svg);
  el('path', { d: major, class: 'rivers major', 'aria-hidden': 'true' }, svg);
}
if (topo.objects.lakes) el('path', { d: pathD(topojson.merge(topo, topo.objects.lakes.geometries)), class: 'lakes', 'aria-hidden': 'true' }, svg);
const gOv = el('g', { 'aria-hidden': 'true' }, svg);
const blineEl = el('path', { class: 'bline', 'aria-hidden': 'true' }, svg);
el('path', { d: pathD(topojson.mesh(topo, topo.objects.atoms, (a, b) => a === b)), class: 'coast', 'aria-hidden': 'true' }, svg);
const gLbl = el('g', { class: 'lbl', 'aria-hidden': 'true' }, svg);
const gPLbl = el('g', null, gLbl);
const gCaps = el('g', { role: 'group', 'aria-label': t('capitals') }, svg);
const gArrows = el('g', { 'aria-hidden': 'true', 'pointer-events': 'none' }, svg);
const gMarkers = el('g', null, svg);

// Scalables keep a constant on-screen size whatever the zoom.
let fixedScalables = [], stepScalables = [], polScalables = [], heads = [];
const staticLabels = [];
for (const l of LBL.labels) {
  const g = el('g', null, gLbl);
  const t = el('text', { class: l.cls, 'text-anchor': l.anchor, y: 4 }, g);
  t.textContent = l.t;
  fixedScalables.push({ g, x: l.xy[0], y: l.xy[1] });
  staticLabels.push({ g, minZoom: l.minZoom, from: l.from, until: l.until, dateOk: true });
}
// Only active seats in the buffered viewport get SVG nodes.
const activeSeats = new Set(), capitalNodes = new Map(), capitalWidths = new Map();
const measureCapital = document.createElement('canvas').getContext('2d');
let capitalPeriod = -1, capitalBuffer = null, capitalFocus = null;
function updateCapitalDate(key) {
  const timeline = LBL.capitalTimeline;
  let lo = 0, hi = timeline.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (timeline[mid].key <= key) lo = mid + 1; else hi = mid;
  }
  const next = lo - 1;
  if (next === capitalPeriod) return false;
  while (capitalPeriod < next) {
    const t = timeline[++capitalPeriod];
    for (const i of t.removed) activeSeats.delete(i);
    for (const i of t.added) activeSeats.add(i);
  }
  while (capitalPeriod > next) {
    const t = timeline[capitalPeriod--];
    for (const i of t.added) activeSeats.delete(i);
    for (const i of t.removed) activeSeats.add(i);
  }
  capitalBuffer = null;
  return true;
}
function describeSeat(c) {
  return t('capitalDescription', { place: c.name, role: c.role || t('capital'), state: polName(POL[c.owner]) });
}
function syncCapitals(v, scale) {
  const [x,y,w,h] = v;
  if (capitalBuffer && x >= capitalBuffer[0] && y >= capitalBuffer[1] &&
      x+w <= capitalBuffer[2] && y+h <= capitalBuffer[3] && w >= capitalBuffer[4]) return;
  const pad = 64 * scale;
  capitalBuffer = [x-pad, y-pad, x+w+pad, y+h+pad, w*0.8];
  const sites = new Map();
  for (const id of activeSeats) {
    const c = LBL.capitals[id], [cx,cy] = c.xy;
    if (cx < x-pad || cy < y-pad || cx > x+w+pad || cy > y+h+pad) continue;
    const k = c.xy.join(',');
    if (!sites.has(k)) sites.set(k, []);
    sites.get(k).push(c);
  }
  for (const [k,it] of capitalNodes) if (!sites.has(k)) {
    if (selected === it.g) closePop();
    it.g.remove(); capitalNodes.delete(k);
  }
  for (const [k,seats] of sites) {
    let it = capitalNodes.get(k);
    if (!it) {
      const [cx,cy] = seats[0].xy;
      const g = el('g', {class:'capital', tabindex:0, role:'button'}, gCaps);
      const title = el('title', null, g);
      el('circle', {class:'hit', r:12}, g);
      el('circle', {class:'capital-ring', r:2.8}, g);
      it = {g, title, x:cx, y:cy, anchor:'r'};
      capitalNodes.set(k,it);
      g.addEventListener('click', e => {
        e.stopPropagation();
        if (!dragMoved) openCapital(it, e.detail ? clientToMap(e.clientX, e.clientY) : null);
      });
      g.addEventListener('focus', () => { if (g.matches(':focus-visible')) openCapital(it); });
      g.addEventListener('keydown', e => {
        if (['Enter',' '].includes(e.key)) { e.preventDefault(); openCapital(it); }
      });
      g.style.transform = `translate(${cx}px, ${cy}px) scale(var(--capital-scale))`;
    }
    it.seats = seats;
    const description = seats.map(describeSeat).join(' / ');
    if (it.description !== description) {
      it.description = description;
      it.title.textContent = description;
      it.g.setAttribute('aria-label', description);
    }
  }
}

// ---------- View handling ----------
let vb = FRAME.slice(), S = 1, anim = null, targetBox = FRAME.slice();
function fit(b) {
  const cw = svg.clientWidth || 1, ch = svg.clientHeight || 1, A = cw / ch;
  let [x, y, w, h] = b;
  if (w / h > A) { const nh = w / A; y -= (nh - h) / 2; h = nh; } else { const nw = h * A; x -= (nw - w) / 2; w = nw; }
  return [x, y, w, h];
}
function applyPatternScale(p, rot) { p.setAttribute('patternTransform', `rotate(${rot}) scale(${S.toFixed(4)})`); }
function apply(v, viewportOnly = false) {
  vb = v;
  svg.setAttribute('viewBox', v.map((n) => n.toFixed(2)).join(' '));
  const cw = svg.clientWidth || 1;
  syncCapitals(v, v[2] / cw);
  if (viewportOnly && S === v[2] / cw) return;
  const scaleChanged = S !== v[2] / cw || !gCaps.style.getPropertyValue('--capital-scale');
  S = v[2] / cw;
  const s = S.toFixed(4);
  if (scaleChanged) {
    gCaps.style.setProperty('--capital-scale', s);
    // Fade the atlas-resolution raster where its pixels would stand out.
    if (reliefImage) {
      const opacity = Math.min(1, Math.max(0, (S - 0.58) * 0.76)).toFixed(2);
      if (reliefImage.getAttribute('opacity') !== opacity) reliefImage.setAttribute('opacity', opacity);
    }
  }
  svg.classList.toggle('overview', v[2] >= 4600);
  const lists = scaleChanged ? [fixedScalables, stepScalables, polScalables] : [stepScalables, polScalables];
  for (const list of lists) for (const it of list) it.g.setAttribute('transform', `translate(${it.x},${it.y}) scale(${s})`);
  for (const h of heads) {
    const tx = h.x + Math.cos(h.ang) * 6 * S, ty = h.y + Math.sin(h.ang) * 6 * S;
    h.g.setAttribute('transform', `translate(${tx.toFixed(2)},${ty.toFixed(2)}) rotate(${(h.ang * 180 / Math.PI).toFixed(1)}) scale(${s})`);
  }
  svg.style.setProperty('--sw', (3.2 * S).toFixed(3));
  for (const [p, rot] of patterns) applyPatternScale(p, rot);
  const zoom = (REF_W / v[2]) * (cw / 700);
  for (const l of staticLabels) l.g.style.display = zoom >= l.minZoom && l.dateOk && !l.coll ? '' : 'none';
  for (const l of polScalables) l.g.style.display = !l.coll && l.w / S > l.tw && l.h / S > l.th ? '' : 'none';
}
function cullLabels() {
  const cells = new Map();
  // Probe the cells a rectangle intersects, or reserve them for later labels.
  function visit(r, test) {
    for (let x = Math.floor(r.left/64); x <= Math.floor(r.right/64); x++)
      for (let y = Math.floor(r.top/64); y <= Math.floor(r.bottom/64); y++) {
        const k = x + ',' + y;
        if (test) {
          if (cells.get(k)?.some(t => r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top)) return true;
        } else {
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k).push(r);
        }
      }
    return false;
  }
  const frame = svg.getBoundingClientRect();
  const zoom = REF_W / S / 700;
  for (const g of [...gMarkers.children, ...gArrows.querySelectorAll('.alabel')]) visit(g.getBoundingClientRect(), false);
  const obstacles = [wrap.querySelector('.mapctl'), $('yearbadge'), wrap.querySelector('.capital-key')];
  for (const control of obstacles) visit(control.getBoundingClientRect(), false);
  const px = it => frame.left + (it.x-vb[0])/S;
  const py = it => frame.top + (it.y-vb[1])/S;
  for (const it of capitalNodes.values()) visit({left:px(it)-4, right:px(it)+4, top:py(it)-4, bottom:py(it)+4}, false);
  // Batch geometry reads before hiding rejected text.
  const candidates = [...polScalables, ...staticLabels].filter(l => l.g.style.display !== 'none')
    .map(l => [l, l.g.getBoundingClientRect()]);
  for (const [l,r] of candidates) {
    l.coll = r.left < frame.left || r.top < frame.top || r.right > frame.right || r.bottom > frame.bottom || visit(r,true);
    if (l.coll) l.g.style.display = 'none'; else visit(r,false);
  }
  const focused = it => it.seats.some(c => capitalFocus?.has(c.owner));
  const rank = it => Math.min(...it.seats.map(c => polityLabelOrder.get(c.owner) ?? Infinity));
  const seats = [...capitalNodes.values()].sort((a,b) => focused(b)-focused(a) || rank(a)-rank(b) || a.x-b.x);
  const nameBudget = Math.max(2, Math.ceil(frame.width * frame.height * zoom * zoom / 19000));
  let named = 0;
  // Give overview names room to breathe even when their glyphs barely fit.
  const gap = Math.max(3, 20 / Math.max(0.4,zoom));
  measureCapital.font = '500 11px ' + getComputedStyle(svg).getPropertyValue('--body');

  for (const it of seats) {
    const name = it.seats[0].name;
    if (!capitalWidths.has(name)) capitalWidths.set(name, measureCapital.measureText(name).width);
    const width = capitalWidths.get(name);
    let placement;
    for (const dir of new Set([it.anchor,'r','l','t','b'])) {
      if (named >= nameBudget) break;
      const a = labelAttrs(dir), x = px(it) + a.x, y = py(it) + a.y;
      const left = x - (a.a === 'middle' ? width/2 : a.a === 'end' ? width : 0);
      const r = {left:left-2, right:left+width+2, top:y-11, bottom:y+3};
      if (r.left < frame.left || r.top < frame.top || r.right > frame.right || r.bottom > frame.bottom || visit(r,true)) continue;
      visit({left:r.left-gap,right:r.right+gap,top:r.top-gap/2,bottom:r.bottom+gap/2},false);
      placement = a; it.anchor = dir; named++; break;
    }
    if (placement) {
      if (!it.label) it.label = el('text', {class:'caplabel'}, it.g);
      if (it.label.textContent !== name) it.label.textContent = name;
      if (it.placed !== it.anchor) {
        it.label.setAttribute('x', placement.x);
        it.label.setAttribute('y', placement.y);
        it.label.setAttribute('text-anchor', placement.a);
        it.placed = it.anchor;
      }
    } else if (it.label) {
      it.label.remove(); it.label = null; it.placed = null;
    }
  }
}
function animateTo(target, dur) {
  if (anim) cancelAnimationFrame(anim);
  anim = null;
  const distance = Math.max(...target.map((n, i) => Math.abs(n - vb[i]) / vb[i % 2 + 2]));
  dur = Math.min(dur, 400 * Math.sqrt(distance), 400);
  if (reduceMotion || !dur) { vb = target; placeLabels(); return; }
  const from = vb.slice(); let t0 = null;
  const frame = (t) => {
    if (t0 === null) t0 = t;
    const k = Math.min(1, (t - t0) / dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    apply(from.map((a, i) => a + (target[i] - a) * e), true);
    if (k < 1) anim = requestAnimationFrame(frame); else { anim = null; placeLabels(); }
  };
  anim = requestAnimationFrame(frame);
}
function clampView(v) {
  let [x, y, w, h] = v;
  const maxW = FRAME[2] * 1.25, minW = 40;
  if (w > maxW) { const k = maxW / w; const cx = x + w / 2, cy = y + h / 2; w *= k; h *= k; x = cx - w / 2; y = cy - h / 2; }
  if (w < minW) { const k = minW / w; const cx = x + w / 2, cy = y + h / 2; w *= k; h *= k; x = cx - w / 2; y = cy - h / 2; }
  const cx = Math.min(Math.max(x + w / 2, FRAME[0]), FRAME[0] + FRAME[2]);
  const cy = Math.min(Math.max(y + h / 2, FRAME[1]), FRAME[1] + FRAME[3]);
  return [cx - w / 2, cy - h / 2, w, h];
}
function clientToMap(cx, cy) {
  const r = svg.getBoundingClientRect();
  return [vb[0] + ((cx - r.left) / r.width) * vb[2], vb[1] + ((cy - r.top) / r.height) * vb[3]];
}
function zoomAt(p, k) {
  cancelAnimationFrame(anim); anim = null;
  const v = [p[0] - (p[0] - vb[0]) * k, p[1] - (p[1] - vb[1]) * k, vb[2] * k, vb[3] * k];
  apply(clampView(v));
  scheduleLabels();
}

// Pan and zoom: wheel, drag, pinch, buttons.
let dragMoved = false;
const pointers = new Map();
let pinch = null;
svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (anim) { cancelAnimationFrame(anim); anim = null; }
  const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
  zoomAt(clientToMap(e.clientX, e.clientY), Math.exp(Math.max(-1, Math.min(1, dy * 0.002))));
}, { passive: false });
svg.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
  dragMoved = false;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), vb: vb.slice(), m: clientToMap((a.x + b.x) / 2, (a.y + b.y) / 2) };
  }
});
svg.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (!dragMoved && Math.hypot(p.x - p.x0, p.y - p.y0) < 4) return;
  if (!dragMoved) { dragMoved = true; svg.setPointerCapture(e.pointerId); svg.classList.add('panning'); if (anim) { cancelAnimationFrame(anim); anim = null; } closePop(); }
  if (pointers.size === 1) {
    const r = svg.getBoundingClientRect();
    apply(clampView([vb[0] - (dx * vb[2]) / r.width, vb[1] - (dy * vb[3]) / r.height, vb[2], vb[3]]), true);
  } else if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const k = pinch.d / d;
    const v = pinch.vb, m = pinch.m;
    apply(clampView([m[0] - (m[0] - v[0]) * k, m[1] - (m[1] - v[1]) * k, v[2] * k, v[3] * k]));
  }
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) { svg.classList.remove('panning'); if (dragMoved) scheduleLabels(); }
};
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);
svg.addEventListener('dblclick', (e) => { e.preventDefault(); zoomAt(clientToMap(e.clientX, e.clientY), e.shiftKey ? 2 : 0.5); });
$('zin').addEventListener('click', () => zoomAt([vb[0] + vb[2] / 2, vb[1] + vb[3] / 2], 0.6));
$('zout').addEventListener('click', () => zoomAt([vb[0] + vb[2] / 2, vb[1] + vb[3] / 2], 1 / 0.6));
$('zfit').addEventListener('click', () => animateTo(fit(targetBox), 600));

// ---------- Borders, polity labels ----------
let curSi = null, curFocusKey = null, curOwners = null;
const borderPaths = new Map();
const polyCache = new Map();
/** Merged polygons per polity for a border state: [{o, polys: [{rings, bbox, area}], total}] */
function polityPolys(si, own) {
  if (polyCache.has(si)) return polyCache.get(si);
  const groups = new Map();
  for (let i = 0; i < NA; i++) { const o = own[i]; if (o < 0) continue; (groups.get(o) || groups.set(o, []).get(o)).push(geoms[i]); }
  const out = [];
  for (const [o, gs] of groups) {
    const polys = topojson.merge(topo, gs).coordinates.map((rings) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of rings[0]) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      return { rings, bbox: [x0, y0, x1, y1], area: ringArea(rings[0]) };
    });
    out.push({ o, polys, total: polys.reduce((t, p) => t + p.area, 0) });
  }
  out.sort((a, b) => b.total - a.total);
  if (polyCache.size > 40) polyCache.delete(polyCache.keys().next().value);
  polyCache.set(si, out);
  return out;
}
// Sutherland–Hodgman clip of a ring to a rectangle.
function clipRing(ring, [bx0, by0, bx1, by1]) {
  let pts = ring;
  const edges = [[(p) => p[0] >= bx0, (a, b) => [bx0, a[1] + ((b[1] - a[1]) * (bx0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= bx1, (a, b) => [bx1, a[1] + ((b[1] - a[1]) * (bx1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= by0, (a, b) => [a[0] + ((b[0] - a[0]) * (by0 - a[1])) / (b[1] - a[1]), by0]],
    [(p) => p[1] <= by1, (a, b) => [a[0] + ((b[0] - a[0]) * (by1 - a[1])) / (b[1] - a[1]), by1]]];
  for (const [inside, cut] of edges) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) out.push(cut(a, b));
    }
    pts = out;
    if (pts.length < 3) return [];
  }
  return pts;
}
function inRings(rings, x, y) {
  let inside = false;
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
/** Polities with visible area in the current view, largest first: [{o, a (km²), rings}] */
function visiblePolities(box) {
  if (curSi === null) return [];
  const out = [];
  for (const P of polityPolys(curSi, curOwners)) {
    let best = null, sum = 0;
    for (const pg of P.polys) {
      const b = pg.bbox;
      if (b[2] < box[0] || b[0] > box[2] || b[3] < box[1] || b[1] > box[3]) continue;
      const inside = b[0] >= box[0] && b[2] <= box[2] && b[1] >= box[1] && b[3] <= box[3];
      const rings = inside ? pg.rings : pg.rings.map((r) => clipRing(r, box)).filter((r) => r.length >= 3);
      if (!rings.length) continue;
      const a = ringArea(rings[0]);
      sum += a;
      if (!best || a > best.a) best = { a, rings, poly: pg };
    }
    if (best) out.push({ o: P.o, a: best.a, sum, rings: best.rings, poly: best.poly });
  }
  out.sort((p, q) => q.sum - p.sum);
  return out;
}
const polityLabelOrder = new Map();
let labelT = 0;
function scheduleLabels() { clearTimeout(labelT); labelT = setTimeout(placeLabels, 140); }
function placeLabels() {
  svg.classList.remove('scrubbing');
  gPLbl.textContent = '';
  polScalables = [];
  const box = [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]];
  const viewScale = vb[2] / (svg.clientWidth || 1);
  const px2 = viewScale * viewScale;
  polityLabelOrder.clear();
  for (const V of visiblePolities(box)) {
    polityLabelOrder.set(V.o, polityLabelOrder.size);
    const screenA = V.a / px2;
    if (screenA < 1400) continue;
    const p = POL[V.o];
    let x, y, r;
    const hint = (p.lxy || []).find(([hx, hy]) => hx > box[0] + vb[2] * 0.08 && hx < box[2] - vb[2] * 0.08 && hy > box[1] + vb[3] * 0.08 && hy < box[3] - vb[3] * 0.08 && inRings(V.poly.rings, hx, hy));
    if (hint) { [x, y] = hint; r = Math.max(0, signedDist(V.rings, x, y)); }
    else [x, y, r] = polylabel(V.rings, Math.max(1.5 * viewScale, Math.sqrt(V.a) / 60));
    const tier = screenA > 70000 ? 1 : screenA > 16000 ? 2 : 3;
    const fs = tier === 1 ? 14 : tier === 2 ? 11 : 9.5, ls = tier === 1 ? 3.6 : tier === 2 ? 2.2 : 1.1;
    const name = polName(p);
    let lines = [name];
    if (name.length > 15 && name.includes(' ')) {
      const words = name.split(' '); let best = null;
      for (let k = 1; k < words.length; k++) { const a = words.slice(0, k).join(' '), b = words.slice(k).join(' '); const m = Math.max(a.length, b.length); if (!best || m < best.m) best = { m, l: [a, b] }; }
      lines = best.l;
    }
    const g = el('g', null, gPLbl);
    const t = el('text', { class: `plbl l${tier}`, 'text-anchor': 'middle' }, g);
    lines.forEach((ln, k) => { const ts = el('tspan', { x: 0, y: (k - (lines.length - 1) / 2) * fs * 1.25 + fs * 0.35 }, t); ts.textContent = ln; });
    const chars = Math.max(...lines.map((s) => s.length));
    let bw = 0; { let x0 = Infinity, x1 = -Infinity; for (const [px] of V.rings[0]) { if (px < x0) x0 = px; if (px > x1) x1 = px; } bw = x1 - x0; }
    // Shown when the text roughly fits: its width within the shape's extent
    // and its height within the inscribed circle.
    polScalables.push({ g, x, y, w: Math.min(bw, 4.4 * r), h: 2.6 * r, tw: chars * (fs * 0.62 + ls), th: lines.length * fs * 1.15 });
  }
  for (const l of staticLabels) l.coll = false;
  apply(vb);
  cullLabels();
}
/** Show the border state at `key`; polity names follow `nameKey` (a step's own date). */
function setBorders(key, focus, nameKey = key, deferLabels = false) {
  const si = stateIndex(key);
  const own = ownersAt(si);
  const fk = focus ? [...focus].sort((a, b) => a - b).join(',') : '';
  capitalFocus = focus;
  let labelDatesChanged = updateCapitalDate(nameKey);
  for (const l of staticLabels) {
    const visible = (!l.from || key >= l.from) && (!l.until || key < l.until);
    if (visible !== l.dateOk) labelDatesChanged = true;
    l.dateOk = visible;
  }
  const namesChanged = curKey !== nameKey && datedPolities.some(p => polName(p, curKey) !== polName(p, nameKey));
  if (namesChanged) capitalBuffer = null;
  curKey = nameKey;
  if (si === curSi && fk === curFocusKey) {
    if (!deferLabels && (namesChanged || labelDatesChanged)) placeLabels();
    return own;
  }
  for (let i = 0; i < NA; i++) {
    const o = own[i];
    const v = o < 0 ? 'var(--land)' : focus && !focus.has(o) ? `var(--q${o})` : `var(--p${o})`;
    if (atomFill[i] !== v) { atomEls[i].style.fill = v; atomEls[i].style.stroke = v; atomFill[i] = v; }
  }
  const changed = si !== curSi;
  curSi = si; curFocusKey = fk; curOwners = own;
  if (changed) {
    if (!borderPaths.has(si)) {
      if (borderPaths.size >= 40) borderPaths.delete(borderPaths.keys().next().value);
      borderPaths.set(si, pathD(topojson.mesh(topo, topo.objects.atoms, (a, b) => a !== b && own[a.i] !== own[b.i])));
    }
    blineEl.setAttribute('d', borderPaths.get(si));
  }
  if (!deferLabels) placeLabels();
  return own;
}
function swatch(fill, stroke) {
  return `<svg width="18" height="12" aria-hidden="true"><rect x="0.5" y="0.5" width="17" height="11" rx="2" style="fill:${fill};stroke:${stroke || 'var(--line)'}"/></svg>`;
}
function lineSw(ink) {
  return `<svg width="22" height="12" aria-hidden="true" class="side-${ink}"><path d="M1,6H15" style="stroke:var(--mc);stroke-width:3;stroke-linecap:round;fill:none"/><path d="M21,6L14,2.5L15.6,6L14,9.5Z" style="fill:var(--mc)"/></svg>`;
}
function markSw(kind, ink) {
  return `<svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true" class="side-${ink}">${shape(kind)}</svg>`;
}
function boxOf(b) { return [b[0], b[1], b[0] + b[2], b[1] + b[3]]; }
function otherListHTML(box, exclude) {
  const minA = ((box[2] - box[0]) * (box[3] - box[1])) / 2500;
  return visiblePolities(box).filter((V) => V.sum > minA && (!exclude || !exclude.has(V.o))).slice(0, 48)
    .map((V) => `<span>${swatch(`var(--${exclude ? 'q' : 'p'}${V.o})`)}${esc(polName(POL[V.o]))}</span>`).join('');
}

// ---------- Popover ----------
let selected = null, popItems = [];
function closePop() { pop.hidden = true; if (selected) { selected.classList.remove('sel'); selected = null; } }
function openPop(mi) {
  const it = popItems[mi];
  if (!it) return;
  const { m, g } = it;
  const nearby = nearbyCapitals(m.xy[0], m.xy[1], Math.min(7 * S, 8));
  showPopover(g, `<p class="pk">${esc(t(`kind.${m.kind}`))}</p><h3>${esc(m.name)}</h3><p class="pd">${esc(formatDate(m.date))}</p><p>${esc(m.text)}</p>` + seatDetails(nearby));
}
function nearbyCapitals(x,y,radius) {
  return [...capitalNodes.values()].filter(it => Math.hypot(it.x-x,it.y-y) <= radius);
}
function seatDetails(sites) {
  return sites.flatMap(it => it.seats.map(c => '<p>' + esc(describeSeat(c)) + '</p>')).join('');
}
function openCapital(it, point = null) {
  const nearby = point ? nearbyCapitals(...point, 12 * S).filter(other => other !== it) : [];
  showPopover(it.g, `<p class="pk">${esc(t('capital'))}</p>` + seatDetails([it, ...nearby]));
}
function showPopover(g, html) {
  if (selected) selected.classList.remove('sel');
  selected = g; g.classList.add('sel');
  pop.innerHTML = `<button type="button" class="x" aria-label="${esc(t('close'))}">×</button>` + html;
  pop.hidden = false;
  pop.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); closePop(); });
  const r = g.querySelector('.hit').getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  const cx = r.left + r.width / 2 - wr.left, cy = r.top + r.height / 2 - wr.top;
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const left = Math.min(Math.max(8, cx - pw / 2), wr.width - pw - 8);
  let top = cy - ph - 18;
  if (top < 8) top = Math.min(cy + 18, svg.clientHeight - ph - 8);
  pop.style.left = left + 'px'; pop.style.top = Math.max(8, top) + 'px';
}
pop.addEventListener('click', (e) => e.stopPropagation());
svg.addEventListener('click', () => { if (!dragMoved) closePop(); });

// ---------- Step layers (arrows, markers, areas) ----------
let arrowItems = [];
function clearStepLayers() {
  gArrows.textContent = ''; gMarkers.textContent = ''; gOv.textContent = '';
  stepScalables = []; heads = []; arrowItems = []; popItems = [];
}
function buildStepLayers(war, step) {
  clearStepLayers();
  const inkOf = (sid) => (war.sides.find((s) => s.id === sid) || { ink: 'none' }).ink;
  const sideIdx = (sid) => Math.max(0, war.sides.findIndex((s) => s.id === sid));
  for (const ar of step.areas) {
    if (ar.line) el('path', { d: ar.line, class: `front side-${inkOf(ar.side)}` }, gOv);
    if (ar.style === 'front' || (!ar.atoms.length && !ar.shape)) continue;
    const d = (ar.atoms.length ? pathD(topojson.merge(topo, ar.atoms.map((i) => geoms[i]))) : '') + (ar.shape || '');
    let cls = 'ov', fill = null;
    if (ar.style === 'gained') cls += ' ov-gained';
    else if (ar.style === 'pledged') { cls += ' ov-pledged'; fill = hatch('gold', 45, 'hatch-gold', 2.6, 7); }
    else if (ar.style === 'lost') { cls += ' ov-lost'; fill = hatch('lost', 45, 'hatch-lost', 1.6, 8); }
    else if (ar.style === 'outline') cls += ' ov-outline';
    else { const ink = inkOf(ar.side); const rot = HATCH_ROT[sideIdx(ar.side) % 4]; cls += ` ov-hatch side-${ink}`; fill = hatch(`${ink}-${rot}`, rot, 'hatch', 1.8, 7); }
    const p = el('path', { d, class: cls }, gOv);
    if (fill) p.style.fill = fill;
    if (ar.style !== 'gained' && ar.style !== 'outline' && ar.style !== 'pledged' && ar.style !== 'lost') p.classList.add(`side-${inkOf(ar.side)}`);
  }
  for (const a of step.arrows) {
    const ink = inkOf(a.side);
    const g = el('g', { class: `side-${ink}` }, gArrows);
    const p = el('path', { d: a.d, class: 'arrow' }, g);
    const hg = el('g', null, g);
    el('path', { d: 'M0,0L-11,-5.5L-8.4,0L-11,5.5Z', class: 'ah' }, hg);
    heads.push({ g: hg, x: a.end[0], y: a.end[1], ang: a.ang });
    if (a.label && a.lxy) {
      const lg = el('g', null, g);
      const lt = el('text', { class: 'alabel', 'text-anchor': 'middle', y: 4 }, lg);
      lt.textContent = a.label;
      stepScalables.push({ g: lg, x: a.lxy[0], y: a.lxy[1] });
    }
    arrowItems.push({ group: g, path: p, head: hg, phase: a.phase });
  }
  step.markers.forEach((m, mi) => {
    const ink = inkOf(m.side);
    const g = el('g', { class: `marker side-${ink}`, tabindex: '0', role: 'button', 'aria-label': t('markerDescription', { name: m.name, date: formatDate(m.date) }) }, gMarkers);
    const la = labelAttrs(m.lp);
    g.innerHTML = '<circle r="16" class="hit"/><circle r="11.5" class="ring"/>' + shape(m.kind) +
      `<text class="mlabel" x="${la.x}" y="${la.y}" text-anchor="${la.a}">${esc(m.name)}</text>`;
    stepScalables.push({ g, x: m.xy[0], y: m.xy[1] });
    g.addEventListener('click', (e) => { e.stopPropagation(); if (!dragMoved) openPop(mi); });
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPop(mi); } });
    popItems.push({ m, g });
  });
}
function drawArrows(instant) {
  if (instant || reduceMotion || !arrowItems.length) return;
  const phaseDuration = 700;
  for (const { group, path, head, phase } of arrowItems) {
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length} ${length}`;
    path.style.strokeDashoffset = length;
    head.style.opacity = 0;
    if (phase !== undefined) group.style.opacity = 0;
  }
  // Commit the hidden state before starting the transitions together.
  gArrows.getBoundingClientRect();
  arrowItems.forEach((a, k) => {
    const phased = a.phase !== undefined;
    const delay = phased ? (a.phase - 1) * phaseDuration : k * 180;
    const drawDuration = phased ? 600 : 1000;
    const headDuration = phased ? 150 : 250;
    const headDelay = phased ? phaseDuration - headDuration : 850;
    if (phased) {
      a.group.style.transition = `opacity 0s linear ${delay}ms`;
      a.group.style.opacity = 1;
    }
    a.path.style.transition = `stroke-dashoffset ${drawDuration}ms cubic-bezier(.4,0,.2,1) ${delay}ms`;
    a.path.style.strokeDashoffset = 0;
    a.head.style.transition = `opacity ${headDuration}ms ease ${delay + headDelay}ms`;
    a.head.style.opacity = 1;
  });
}
// ---------- Explore mode ----------
const exploreEl = $('explore'), storyViewEl = $('storyView');
const yearEl = $('year'), yearOut = $('yearOut'), badge = $('yearbadge');
const timelineEl = yearEl.parentElement;
const timelineStart = +yearEl.min, timelineEnd = +yearEl.max, timelineSpan = timelineEnd - timelineStart;
const yearPrev = $('yprev'), yearNext = $('ynext');
// The timeline can extend beyond the first and last recorded border states.
const borderYears = [...new Set(T.map((entry) => yearOf(entry.k)))];
const timelinePosition = (year) => ((year - timelineStart) / timelineSpan) * 100 + '%';
for (const tick of timelineEl.querySelectorAll('.tl-ticks span')) {
  tick.style.insetInlineStart = timelinePosition(+tick.dataset.year);
}
const countryEl = $('country'), qEl = $('q');
const regionNames = (() => { try { return new Intl.DisplayNames([locale], { type: 'region' }); } catch { return null; } })();
const countryName = (cc) => { if (cc === 'xk') return t('kosovo'); try { return regionNames?.of(cc.toUpperCase()) || cc.toUpperCase(); } catch { return cc.toUpperCase(); } };
const collator = new Intl.Collator(locale);
(function fillCountries() {
  const all = new Set();
  for (const w of WARS) for (const c of w.countries) all.add(c);
  [...all].map((c) => [c, countryName(c)]).sort((a, b) => collator.compare(a[1], b[1]))
    .forEach(([c, n]) => { const o = document.createElement('option'); o.value = c; o.textContent = n; countryEl.appendChild(o); });
})();
let mode = null, year = 1776;
$('language').addEventListener('change', () => {
  if (mode === 'explore' && hashT) history.replaceState(null, '', `#/year/${year}`);
}, { capture: true });
// A country view: every step of every war that involves the country, in
// reading order (step "when" date, then war start, then step order).
const lensSteps = (cc) => {
  const items = [];
  WARS.forEach((w, wi) => { if (!w.countries.includes(cc)) return; w.steps.forEach((s, i) => { if (!s.c || s.c.includes(cc)) items.push({ w: w.id, s: i, k: s.w || w.sk, wi }); }); });
  items.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.wi - b.wi || a.s - b.s));
  return items;
};
function renderTimelineBars() {
  const cc = countryEl.value;
  const list = WARS.filter((w) => !cc || w.countries.includes(cc));
  const lanes = [];
  const html = list.map((w) => {
    const a = Math.max(timelineStart, yearOf(w.sk));
    const b = w.end === 'ongoing' ? timelineEnd : Math.min(timelineEnd, yearOf(w.ek));
    let lane = lanes.findIndex((end) => end < a - 3); if (lane < 0) { lane = lanes.length; lanes.push(b); } else lanes[lane] = b;
    if (lane > 3) return '';
    return `<span data-a="${a}" data-b="${b}" style="inset-inline-start:${timelinePosition(a)};width:${((b - a + 1) / timelineSpan) * 100}%;top:${lane * 4.5}px" title="${esc(w.name)}"></span>`;
  }).join('');
  $('tlBars').innerHTML = html;
}
function markTimeline() {
  for (const s of $('tlBars').children) s.classList.toggle('a', +s.dataset.a <= year && +s.dataset.b >= year);
}
function renderWarList() {
  const cc = countryEl.value, q = searchText(qEl.value.trim());
  let list, head;
  if (q) {
    list = WARS.filter((w) => (!cc || w.countries.includes(cc)) && searchIndex.get(w.id).some(text => text.includes(q)));
    head = t('searchResults', { count: list.length });
  } else {
    const k0 = `${String(year).padStart(4, '0')}-00-00`, k1 = `${String(year).padStart(4, '0')}-99-99`;
    list = WARS.filter((w) => (!cc || w.countries.includes(cc)) && w.sk <= k1 && w.ek >= k0);
    head = t(cc ? 'warsInCountryYear' : 'warsInYear', { year: number(year), country: countryName(cc) });
  }
  $('listHead').textContent = head;
  $('warList').innerHTML = list.length ? list.map((w) => {
    const n = w.steps.length;
    const inner = `<span class="wn">${esc(w.name)}</span>${w.tier === 'C' ? `<span class="tier">${esc(t('brief'))}</span>` : ''}<span class="wd">${esc(fmtYears(w))}${n ? ` · ${esc(t('stepCount', { count: n }))}` : ''}</span>${w.summary ? `<span class="ws">${esc(w.summary)}</span>` : ''}`;
    // A catalogue entry without steps has nothing to open: show it as a card.
    return n ? `<li><a href="#/war/${encodeURIComponent(w.id)}">${inner}</a></li>` : `<li><div class="wcard">${inner}${w.sources?.length ? `<span class="wsrc">${w.sources.map((s) => `<a href="${esc(s.url)}">${esc(s.title)}</a>`).join(' · ')}</span>` : ''}</div></li>`;
  }).join('') : `<li class="empty">${esc(t(q ? 'noSearchResults' : 'noWars'))}</li>`;
  const lens = $('lensLink');
  if (cc) {
    const n = lensSteps(cc).length;
    lens.hidden = !n;
    lens.href = `#/country/${cc}`;
    lens.innerHTML = rich('followCountry', {
      country: `<b>${esc(countryName(cc))}</b>`, steps: esc(t('stepCount', { count: n })),
    });
  } else lens.hidden = true;
}
let exploreListKey;
let yearRaf = 0, hashT = 0;
function setYear(y, opts = {}) {
  ++goToken;
  $('storyError').hidden = true;
  year = Math.max(timelineStart, Math.min(timelineEnd, Math.round(y)));
  yearEl.value = year; yearOut.textContent = number(year); badge.textContent = number(year);
  yearEl.setAttribute('aria-valuetext', number(year));
  yearPrev.disabled = year === timelineStart;
  yearNext.disabled = year === timelineEnd;
  timelineEl.style.setProperty('--year-position', timelinePosition(year));
  const key = `${String(year).padStart(4, '0')}-12-31`;
  closePop();
  setBorders(key, null, key, opts.scrub);
  if (opts.scrub) {
    svg.classList.add('scrubbing');
    syncCapitals(vb, S);
    scheduleLabels();
  }
  const si = stateIndex(key);
  $('bsrc').textContent = si >= 0 ? t('borderSource', { source: T[si].s }) : '';
  renderWarList(); markTimeline();
  const box = boxOf(fit(FRAME));
  const listKey = JSON.stringify([si, box, datedPolities.map(p => polName(p))]);
  if (listKey !== exploreListKey) {
    exploreListKey = listKey;
    $('exOtherList').innerHTML = otherListHTML(box, null);
    $('exOthers').hidden = !$('exOtherList').innerHTML;
  }
  if (!opts.noHash) {
    clearTimeout(hashT);
    hashT = setTimeout(() => {
      hashT = 0;
      history.replaceState(null, '', `#/year/${year}`);
    }, 250);
  }
}
yearEl.addEventListener('input', () => { cancelAnimationFrame(yearRaf); yearRaf = requestAnimationFrame(() => setYear(+yearEl.value, {scrub:true})); });
yearPrev.addEventListener('click', () => setYear(borderYears.findLast((v) => v < year) ?? timelineStart));
yearNext.addEventListener('click', () => setYear(borderYears.find((v) => v > year) ?? timelineEnd));
countryEl.addEventListener('change', () => { renderTimelineBars(); renderWarList(); markTimeline(); });
qEl.addEventListener('input', renderWarList);

function explore(y) {
  const storyWasVisible = mode === 'story';
  const entering = mode !== 'explore';
  ++goToken;
  cancelAnimationFrame(yearRaf);
  clearTimeout(hashT);
  $('storyError').hidden = true;
  $('loading')?.remove();
  mode = 'explore'; story = null;
  exploreEl.hidden = false; storyViewEl.hidden = true; badge.hidden = false;
  clearStepLayers(); closePop();
  $('footStory').innerHTML = '';
  document.title = t('siteTitle');
  if (entering) {
    cancelAnimationFrame(anim);
    anim = null;
    renderTimelineBars();
  }
  setYear(y ?? year, { noHash: true });
  if (entering) {
    targetBox = START_BOX || FRAME.slice();
    const target = fit(targetBox);
    if (target.some((n, i) => n !== vb[i])) animateTo(target, 400);
    else if (storyWasVisible) placeLabels();
    START_BOX = null;
  }
}
// `?box=x,y,w,h` (map km) opens explore mode on that box; used for review screenshots.
let START_BOX = (() => { const b = new URLSearchParams(location.search).get('box'); const v = b ? b.split(',').map(Number) : []; return v.length === 4 && v.every(Number.isFinite) ? v : null; })();

// ---------- Story mode (one war, or one country's wars) ----------
const storyEl = $('story'), legendEl = $('legend'), jumpEl = $('jump'), progEl = $('progress');
const prevBtn = $('prev'), nextBtn = $('next');
let story = null, cur = -1, requested = -1, goToken = 0;
function stepBox(step) {
  const b = step.view;
  if (!b) return FRAME.slice();
  const px = b[2] * 0.04, py = b[3] * 0.04;
  return [b[0] - px, b[1] - py, b[2] + 2 * px, b[3] + 2 * py];
}
function buildNav() {
  jumpEl.innerHTML = ''; progEl.innerHTML = '';
  let group = null, lastW = null;
  story.items.forEach((it, k) => {
    const w = warById.get(it.w), s = w.steps[it.s];
    if (it.w !== lastW) { group = document.createElement('optgroup'); group.label = w.name; jumpEl.appendChild(group); }
    const o = document.createElement('option');
    o.value = k; o.textContent = t('stepOption', { number: count(k + 1), date: formatDate(s.d), title: s.t });
    group.appendChild(o);
    const b = document.createElement('button');
    b.type = 'button'; b.tabIndex = -1; b.title = t('stepTooltip', { number: count(k + 1), title: s.t });
    if (lastW !== null && it.w !== lastW) b.className = 'newch';
    b.addEventListener('click', () => go(k));
    progEl.appendChild(b);
    lastW = it.w;
  });
}
jumpEl.addEventListener('change', () => go(+jumpEl.value));
prevBtn.addEventListener('click', () => go(requested - 1));
nextBtn.addEventListener('click', () => go(requested + 1));
function renderNav(i) {
  jumpEl.value = String(i);
  Array.prototype.forEach.call(progEl.children, (b, k) => {
    if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    b.classList.toggle('done', k < i);
  });
  prevBtn.disabled = i === 0;
  nextBtn.disabled = i === story.items.length - 1;
}
function renderLegend(war, step, own) {
  const h = [];
  const vbox = boxOf(fit(stepBox(step)));
  const minA = ((vbox[2] - vbox[0]) * (vbox[3] - vbox[1])) / 2500;
  const present = new Set(visiblePolities(vbox).filter((V) => V.sum > minA).map((V) => V.o));
  const shown = new Set();
  for (const s of war.sides) for (const p of s.polities) if (present.has(p) && !shown.has(p)) { shown.add(p); h.push(`<span>${swatch(`var(--p${p})`)}${esc(polName(POL[p]))}</span>`); }
  const sideOf = (sid) => war.sides.find((s) => s.id === sid);
  for (const ar of step.areas) {
    const s = sideOf(ar.side); const ink = s?.ink || 'none';
    const lab = ar.label || t(`area.${ar.style}`, { side: s?.name });
    let sw;
    if (ar.style === 'gained') sw = swatch('var(--gold-fill)');
    else if (ar.style === 'pledged') sw = swatch(hatch('gold', 45, 'hatch-gold', 2.6, 7), 'var(--gold)');
    else if (ar.style === 'lost') sw = swatch(hatch('lost', 45, 'hatch-lost', 1.6, 8), 'var(--ink)');
    else if (ar.style === 'front') sw = `<svg class="side-${ink}" width="18" height="12" aria-hidden="true"><path d="M1,8 C6,2 11,10 17,4" style="fill:none;stroke:var(--mc);stroke-width:2.6;stroke-linecap:round"/></svg>`;
    else if (ar.style === 'outline') sw = '<svg width="18" height="12" aria-hidden="true"><rect x="1" y="1" width="16" height="10" rx="2" style="fill:none;stroke:var(--ink);stroke-width:1.6;stroke-dasharray:4 2"/></svg>';
    else { const rot = HATCH_ROT[Math.max(0, war.sides.indexOf(s)) % 4]; sw = `<span class="side-${ink}" style="display:inline-flex">${swatch(hatch(`${ink}-${rot}`, rot, 'hatch', 1.8, 7), 'var(--mc)')}</span>`; }
    const html = `<span>${sw}${esc(lab)}</span>`;
    if (!h.includes(html)) h.push(html);
  }
  const arrowSides = [...new Set(step.arrows.map((a) => a.side))];
  for (const sid of arrowSides) { const s = sideOf(sid); h.push(`<span>${lineSw(s?.ink || 'none')}${esc(step.moveNames?.[sid] || s?.moves || (s ? t('sideMoves', { side: s.name }) : t('moves')))}</span>`); }
  const mSides = [...new Set(step.markers.filter((m) => m.kind !== 'toll' && m.kind !== 'treaty').map((m) => m.side))];
  for (const sid of mSides) { const s = sideOf(sid); h.push(`<span>${markSw('taken', s?.ink || 'none')}${esc(step.sideNames?.[sid] || s?.success || (s ? t('sideSuccess', { side: s.name }) : t('neutral')))}</span>`); }
  legendEl.innerHTML = h.join('');
}
function renderStory(i, war, step) {
  const displayed = story;
  const N = story.items.length;
  let h = `<p class="eyebrow"><b>${esc(war.name)}</b> · ${esc(t('stepPosition', { number: count(i + 1), total: count(N) }))} · ${esc(formatDate(step.date))}</p>`;
  h += `<h2 class="st">${esc(step.title)}</h2><div class="story">`;
  for (const p of step.body) h += `<p>${esc(p)}</p>`;
  if (step.link) h += `<p class="more"><a href="${esc(step.link.href)}">${esc(step.link.text)}</a></p>`;
  h += '</div>';
  if (step.facts?.length) { h += '<dl class="facts">'; for (const f of step.facts) h += `<dt>${esc(f[0])}</dt><dd>${esc(f[1])}</dd>`; h += '</dl>'; }
  if (step.markers.length) {
    h += `<div class="onmap"><h3>${esc(t('onTheMap'))}</h3><div class="chips">`;
    step.markers.forEach((m, mi) => {
      const ink = (war.sides.find((s) => s.id === m.side) || { ink: 'none' }).ink;
      h += `<button type="button" class="chip side-${ink}" data-mi="${mi}">${markSw(m.kind, ink)}${esc(m.name)}</button>`;
    });
    h += '</div></div>';
  }
  if (i === 0) h += `<p class="hint">${esc(t('keyboardTip'))}</p>`;
  storyEl.innerHTML = h;
  for (const b of storyEl.querySelectorAll('.chip')) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const mi = +b.dataset.mi;
      const r = wrap.getBoundingClientRect();
      if (r.top < 0 || r.bottom > window.innerHeight) {
        wrap.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        setTimeout(() => { if (displayed === story && cur === i) openPop(mi); }, reduceMotion ? 0 : 450);
      } else openPop(mi);
    });
  }
}
function renderFooter(war) {
  let h = '';
  if (war.notes?.length) h += war.notes.map((n) => `<p>${esc(n)}</p>`).join('');
  if (war.sources?.length) h += `<h3>${esc(t('sourcesFor', { war: war.name }))}</h3><ul>${war.sources.map((s) => `<li>${s.url ? `<a href="${esc(s.url)}">${esc(s.title)}</a>` : esc(s.title)}</li>`).join('')}</ul>`;
  $('footStory').innerHTML = h;
}
let retryStory;
$('retryStory').addEventListener('click', () => retryStory?.());
async function go(i, instant = false, destination = story, push = false) {
  if (!destination || i < 0 || i >= destination.items.length) return;
  const token = ++goToken;
  clearTimeout(hashT);
  cancelAnimationFrame(yearRaf);
  $('storyError').hidden = true;
  const same = destination === story;
  if (same) {
    requested = i;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === story.items.length - 1;
  }
  const it = destination.items[i];
  let war;
  try { war = await loadWar(it.w); }
  catch {
    if (token !== goToken) return;
    if (!mode) explore(year);
    requested = cur;
    if (story) renderNav(cur);
    history.replaceState(null, '', story ? `#/${story.kind}/${encodeURIComponent(story.id)}/${cur + 1}` : `#/year/${year}`);
    retryStory = () => go(i, instant, destination, push);
    $('storyError').hidden = false;
    return;
  }
  if (token !== goToken) return;
  clearTimeout(hashT);
  if (!same) {
    story = destination;
    $('loading')?.remove();
    mode = 'story';
    exploreEl.hidden = true; storyViewEl.hidden = false; badge.hidden = false;
    buildNav();
    const back = $('back');
    back.href = `#/year/${yearOf(warById.get(story.items[0].w).sk)}`;
    back.textContent = story.kind === 'country' ? t('backFromCountry', { country: countryName(story.id) }) : t('allWars');
    if (window.matchMedia('(min-width: 900px)').matches) $('others').open = true;
  }
  requested = i;
  const step = war.steps[it.s];
  closePop();
  cur = i;
  const focus = new Set(war.sides.flatMap((s) => s.polities));
  const own = setBorders(step.borders, focus, step.when || step.borders, true);
  buildStepLayers(war, step);
  renderStory(i, war, step);
  renderLegend(war, step, own);
  renderNav(i);
  renderFooter(war);
  targetBox = stepBox(step);
  $('otherList').innerHTML = otherListHTML(boxOf(fit(targetBox)), focus);
  $('others').hidden = !$('otherList').innerHTML;
  badge.textContent = formatDate(step.date);
  document.title = t('storyTitle', { step: step.title, war: war.name, site: t('siteTitle') });
  history[push ? 'pushState' : 'replaceState'](null, '', `#/${story.kind}/${encodeURIComponent(story.id)}/${i + 1}`);
  drawArrows(instant);
  if (!instant && !reduceMotion) apply(vb);
  animateTo(fit(targetBox), instant ? 0 : 400);
}
function openStory(kind, id, i, push = false) {
  let items;
  if (kind === 'war') {
    const w = warById.get(id);
    if (!w) return explore();
    // A catalogue entry with no steps: show its years and list it there.
    if (!w.steps.length) { location.replace(`#/year/${yearOf(w.sk)}`); return; }
    items = w.steps.map((_, k) => ({ w: id, s: k }));
  }
  else items = lensSteps(id);
  if (!items.length) return explore();
  const same = story && story.kind === kind && story.id === id;
  go(Math.max(0, Math.min(items.length - 1, i || 0)), !mode,
    same ? story : { kind, id, items }, push);
}

// ---------- Keyboard, resize, routing ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closePop(); return; }
  const tag = (e.target && e.target.tagName) || '';
  if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const rtl = document.documentElement.dir === 'rtl';
  const delta = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
  if (mode === 'story') { e.preventDefault(); go(requested + delta); }
  if (mode === 'explore') { e.preventDefault(); setYear(year + delta); }
});
let resizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    animateTo(fit(targetBox), anim ? 400 : 0);
    closePop();
  }, 80);
});
function route() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/');
  if ((h[0] === 'war' || h[0] === 'country') && h[1]) openStory(h[0], h[1], (parseInt(h[2], 10) || 1) - 1);
  else explore(h[0] === 'year' && h[1] ? parseInt(h[1], 10) : undefined);
}
// Commit an in-page story link to history when its content is ready.
document.addEventListener('click', e => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const link = e.target.closest('a[href^="#/"]');
  const match = link?.hash.match(/^#\/(war|country)\/([^/]+)(?:\/(\d+))?$/);
  if (!match || link.target || link.hasAttribute('download')) return;
  e.preventDefault();
  if (mode === 'explore' && hashT) {
    clearTimeout(hashT);
    hashT = 0;
    history.replaceState(null, '', `#/year/${year}`);
  }
  openStory(match[1], decodeURIComponent(match[2]), Number(match[3] || 1) - 1, location.hash !== link.hash);
});
window.addEventListener('hashchange', route);
apply(fit(FRAME));
route();

document.fonts?.ready.then(() => { capitalWidths.clear(); scheduleLabels(); });
