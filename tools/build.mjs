// Validates content/ and emits the static site into dist/.
//
//   dist/index.html, app.js, style.css, vendor/…    (copied from site/)
//   dist/data/atoms.topo.json                      (from site-data/, see build-geo.mjs)
//   dist/data/borders.json                         polities + border timeline
//   dist/data/polities.css                         polity colours, light and dark
//   dist/data/wars.json                            catalogue
//   dist/data/wars/<id>.json                       one per war, projected
//   dist/data/labels.json                          seas, regions, capitals
//
// Exit code 1 on validation errors; warnings are printed but do not fail.
import { mkdir, writeFile, cp, rm, readFile, stat, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { ROOT, CONTENT, readJSON, readYAML, listFiles, exists, loadPolities, darkFill, hexToOklch, oklchToHex } from './lib.mjs';
import { loadLocales, prepareLocaleOutput, compileWarTranslations, emitLocales } from './locales.mjs';
import { compileCapitals } from './capitals.mjs';
import { feature } from 'topojson-client';
import { project, DATA_CLIP, FRAME, overviewGrid } from './projection.mjs';
// A YAML string containing ": " without quotes parses as a mapping and would show as "[object Object]".
const NOT_TEXT = 'is not plain text (it contains ": "; put it in quotes)';
const isObj = (v) => v !== null && typeof v === 'object';

const DIST = join(ROOT, 'dist');
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);

const INKS = ['blue', 'red', 'purple', 'orange', 'green', 'teal', 'brown', 'magenta', 'gold', 'slate', 'navy', 'olive', 'none'];
const KINDS = ['battle', 'naval', 'siege', 'held', 'taken', 'event', 'treaty', 'toll', 'air', 'capital'];
const AREA_STYLES = ['occupied', 'gained', 'pledged', 'lost', 'outline', 'contested', 'front'];

/** Sortable date key: "1658" -> "1658-00-00", "1658-02" -> "1658-02-00". */
export function dateKey(d) {
  if (d === undefined || d === null) return null;
  const m = String(d).trim().match(/^(-?\d{1,4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (!m) return null;
  return `${m[1].padStart(4, '0')}-${m[2] || '00'}-${m[3] || '00'}`;
}

// ---------------------------------------------------------------- polities
async function buildPolities() {
  const { byId, redirect } = await loadPolities();
  const list = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const index = new Map(list.map((p, i) => [p.id, i]));
  for (const [from, to] of redirect) if (index.has(to)) index.set(from, index.get(to));
  for (const p of list) {
    if (!/^#[0-9a-f]{6}$/i.test(p.color || '')) err(`polity ${p.id}: bad color ${p.color}`);
    if (p.ink && !INKS.includes(p.ink)) err(`polity ${p.id}: unknown ink ${p.ink}`);
  }
  // CSS custom properties: --p<i> (fill), --q<i> (muted fill, for non-participants).
  const muted = (hex, dark) => { const [L, C, H] = hexToOklch(hex); return dark ? oklchToHex(0.3, Math.min(0.04, C * 0.6), H) : oklchToHex(Math.min(0.95, L + 0.035), C * 0.45, H); };
  const light = list.map((p, i) => `--p${i}:${p.color};--q${i}:${muted(p.color, false)};`).join('');
  const dark = list.map((p, i) => { const d = darkFill(p.color); return `--p${i}:${d};--q${i}:${muted(p.color, true)};`; }).join('');
  const css = `:root{${light}}\n:root[data-theme="dark"]{${dark}}\n`;
  return { list, index, css };
}

// ---------------------------------------------------------------- borders
async function buildBorders(pol, topo) {
  const atomsMeta = await readJSON(join(CONTENT, 'borders/atoms.json'));
  const meta = new Map(atomsMeta.map((a) => [a.id, a]));
  const order = topo.objects.atoms.geometries.map((g) => g.properties.id);
  const aidx = new Map(order.map((id, i) => [id, i]));
  const children = new Map();
  for (const a of atomsMeta) if (a.parent) (children.get(a.parent) || children.set(a.parent, []).get(a.parent)).push(a.id);
  /** An atom id means the original region, including any split-off children. */
  const expand = (id, where) => {
    // "X!" means only what is left of X itself, without its split-off children.
    if (id.endsWith('!')) { const x = id.slice(0, -1); if (aidx.has(x)) return [aidx.get(x)]; err(`${where}: unknown atom ${x}`); return []; }
    const out = [];
    const walk = (x) => { if (aidx.has(x)) out.push(aidx.get(x)); for (const c of children.get(x) || []) walk(c); };
    walk(id);
    if (!out.length) err(`${where}: unknown atom ${id}`);
    return out;
  };
  const polIdx = (id, where) => {
    if (id === '-' || id === null) return -1;
    if (!pol.index.has(id)) { err(`${where}: unknown polity ${id}`); return -1; }
    return pol.index.get(id);
  };

  // Curated ranges: keyframe assignments for these atoms inside [from, until) are ignored.
  const curated = [];
  if (await exists(join(CONTENT, 'borders/curated.yaml'))) {
    for (const c of (await readYAML(join(CONTENT, 'borders/curated.yaml'))) || []) {
      const set = new Set((c.atoms || []).flatMap((id) => expand(id, `curated ${c.name}`)));
      curated.push({ from: dateKey(c.from), until: dateKey(c.until), set });
    }
  }
  const isCurated = (i, key) => curated.some((c) => key >= c.from && key < c.until && c.set.has(i));

  const entries = [];
  for (const f of await listFiles(join(CONTENT, 'borders/keyframes'), '.json')) {
    const kf = await readJSON(join(CONTENT, 'borders/keyframes', f));
    const set = new Map();
    for (const [p, ids] of Object.entries(kf.owners)) {
      const pi = polIdx(p, `keyframe ${f}`);
      for (const id of ids) {
        if (!aidx.has(id) && !children.has(id)) { warn(`keyframe ${f}: atom ${id} no longer exists`); continue; }
        // Children inherit from the parent unless they are listed themselves.
        for (const i of expand(id, `keyframe ${f}`)) if (!set.has(i) || order[i] === id) set.set(i, pi);
      }
    }
    const key = dateKey(kf.date);
    const raw = new Map(set);
    for (const i of [...set.keys()]) if (isCurated(i, key)) set.delete(i);
    entries.push({ key, date: String(kf.date), src: kf.source || f, kind: 'keyframe', set, raw });
  }
  for (const f of await listFiles(join(CONTENT, 'borders/events'), '.yaml')) {
    const evs = (await readYAML(join(CONTENT, 'borders/events', f))) || [];
    for (const [k, ev] of evs.entries()) {
      const where = `events ${f} #${k + 1}`;
      if (!dateKey(ev.date)) { err(`${where}: bad date ${ev.date}`); continue; }
      const set = new Map();
      for (const [p, ids] of Object.entries(ev.owners || {})) {
        // "-" in an event means: no curated owner, use the latest keyframe.
        const pi = p === '-' ? 'kf' : polIdx(p, where);
        // As in keyframes: an atom listed itself beats one reached through its parent.
        for (const id of ids) for (const i of expand(id, where)) if (!set.has(i) || order[i] === id) set.set(i, pi);
      }
      entries.push({ key: dateKey(ev.date), date: String(ev.date), src: ev.note || f, kind: 'event', war: ev.war, set });
    }
  }
  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.kind === 'keyframe' ? -1 : 1));

  // Resolve full states to compute deltas and lint.
  const N = order.length;
  let state = new Int16Array(N).fill(-1);
  const lastKf = new Int16Array(N).fill(-1); // owner per the latest keyframe, ignoring curated ranges
  const timeline = [];
  const history = Array.from({ length: N }, () => []);
  for (const e of entries) {
    const next = state.slice();
    if (e.kind === 'keyframe') for (const [i, p] of e.raw || e.set) lastKf[i] = p;
    for (const [i, p] of e.set) next[i] = p === 'kf' ? lastKf[i] : p;
    const changes = [];
    for (let i = 0; i < N; i++) if (next[i] !== state[i]) { changes.push(i, next[i]); history[i].push({ key: e.key, p: next[i], kind: e.kind }); }
    timeline.push({ d: e.date, k: e.key, s: e.src, c: changes });
    state = next;
  }
  // Flip-flop lint: A -> B -> A within 60 years where a draft keyframe is involved.
  const reviewed = new Set();
  for (const r of (await exists(join(CONTENT, 'borders', 'reviewed.yaml'))) ? (await readYAML(join(CONTENT, 'borders', 'reviewed.yaml'))) || [] : []) {
    const k = dateKey(r.at);
    if (!k) err(`borders/reviewed.yaml: bad date ${r.at}`);
    for (const a of r.atoms || []) reviewed.add(`${a}@${k}`);
  }
  const flips = [];
  const pname = (pi) => (pi < 0 ? '-' : pol.list[pi].id);
  for (let i = 0; i < N; i++) {
    const h = history[i];
    for (let k = 2; k < h.length; k++) {
      if (h[k].p === h[k - 2].p && h[k].p !== h[k - 1].p && (h[k].kind === 'keyframe' || h[k - 1].kind === 'keyframe')) {
        const y0 = +h[k - 1].key.slice(0, 4), y1 = +h[k].key.slice(0, 4);
        if (y1 - y0 <= 60 && (h[k].kind === 'event' || h[k - 1].kind === 'event') && !reviewed.has(`${order[i]}@${h[k - 1].key}`)) flips.push(`${order[i]}: ${pname(h[k - 2].p)} → ${pname(h[k - 1].p)} (${h[k - 1].key.slice(0, 4)}, ${h[k - 1].kind}) → ${pname(h[k].p)} (${h[k].key.slice(0, 4)}, ${h[k].kind})`);
      }
    }
  }
  if (flips.length) warn(`borders: ${flips.length} flip-flop(s) between curated events and draft keyframes, check them:\n    ` + flips.slice(0, process.env.ALL_FLIPS ? Infinity : 12).join('\n    ') + (flips.length > 12 ? `\n    … and ${flips.length - 12} more` : ''));
  return { order, aidx, expand, timeline, meta };
}

// ---------------------------------------------------------------- labels
async function buildLabels(pol, borders, topo) {
  const L = await readYAML(join(CONTENT, 'labels.yaml'));
  const rivers = topo.objects.rivers.geometries;
  const labels = L.labels.map(l => {
    let xy = project(l.lonlat);
    if (l.river) {
      const lines = rivers.filter(g => g.properties.name === l.river)
        .flatMap(g => { const f = feature(topo, g).geometry; return f.type === 'LineString' ? [f.coordinates] : f.coordinates; });
      const hint = xy;
      let best = Infinity;
      for (const line of lines) for (const point of line) {
        const d = Math.hypot(point[0] - hint[0], point[1] - hint[1]);
        if (d < best) { best = d; xy = point; }
      }
      if (best > 100) err('Missing river near label ' + l.text);
    }
    return { t: l.text, xy, cls: l.class || 'lbl-reg', minZoom: l.min_zoom || 0, from: dateKey(l.from), until: dateKey(l.until), anchor: l.anchor || 'middle' };
  });
  const rows = await readYAML(join(CONTENT, 'capitals.yaml'));
  const {audit, ...seats} = compileCapitals(rows, pol, borders, dateKey, err);
  await emit('data/capital-coverage.json', JSON.stringify(audit, null, 2));
  return {labels, ...seats};
}

// ---------------------------------------------------------------- wars
const r1 = (v) => Math.round(v * 10) / 10;
function catmullRom(pts) {
  if (pts.length === 2) return `M${pts[0]}L${pts[1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r1(c1[0])},${r1(c1[1])} ${r1(c2[0])},${r1(c2[1])} ${p2[0]},${p2[1]}`;
  }
  return d;
}
function pathPoint(pts, t) {
  let L = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); L += l; }
  let goal = L * t;
  for (let i = 1; i < pts.length; i++) {
    if (goal <= seg[i - 1]) { const k = seg[i - 1] ? goal / seg[i - 1] : 0; return { p: [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k], dir: [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]] }; }
    goal -= seg[i - 1];
  }
  return { p: pts[pts.length - 1], dir: [1, 0] };
}

function validLonLat(ll, where) {
  if (!Array.isArray(ll) || ll.length !== 2 || !ll.every(Number.isFinite)) { err(`${where}: bad lonlat ${JSON.stringify(ll)}`); return false; }
  const [x, y] = project(ll);
  if (x < FRAME.x0 || x > FRAME.x1 || y < FRAME.y0 || y > FRAME.y1) warn(`${where}: ${JSON.stringify(ll)} is outside the map frame`);
  return true;
}

// Links in content end up in href attributes on the live site. Text is escaped,
// but a `javascript:` or `data:` URL would still run when clicked, so only web
// links (and, for step links, links inside the site) are allowed.
function validLink(u, where, internal = false) {
  const ok = typeof u === 'string' && (/^https?:\/\/[^\s"<>]+$/.test(u) || (internal && /^#\/[^\s"<>]*$/.test(u)));
  if (!ok) err(`${where}: link must be a web link (https://…)${internal ? ' or a link inside the site (#/…)' : ''}, got ${JSON.stringify(u)}`);
}

function buildWar(w, file, ctx) {
  const where = `war ${file}`;
  for (const k of ['id', 'name', 'start', 'tier']) if (w[k] === undefined) err(`${where}: missing ${k}`);
  if (w.id && file !== `${w.id}.yaml` && !file.endsWith(`-${w.id}.yaml`)) warn(`${where}: file name does not match id ${w.id}`);
  if (!dateKey(w.start)) err(`${where}: bad start ${w.start}`);
  if (w.end !== undefined && w.end !== 'ongoing' && !dateKey(w.end)) err(`${where}: bad end ${w.end}`);
  if (!['A', 'B', 'C'].includes(w.tier)) err(`${where}: tier must be A, B or C`);
  if (w.tier !== 'C' && !w.steps?.length) err(`${where}: tier ${w.tier} needs steps (or make it tier C)`);
  if (w.tier === 'C' && !w.summary) err(`${where}: a tier C entry needs a summary`);
  if (!w.sources?.length) err(`${where}: no sources`);
  (w.sources || []).forEach((s, i) => {
    if (!s?.title) err(`${where}: source ${i + 1} has no title`);
    if (s?.url !== undefined) validLink(s.url, `${where}: source ${i + 1}`);
  });
  const sides = (w.sides || []).map((s, i) => {
    for (const p of s.polities || []) if (!ctx.pol.index.has(p)) err(`${where}: side ${s.id}: unknown polity ${p}`);
    const first = ctx.pol.list[ctx.pol.index.get((s.polities || [])[0])];
    const ink = s.ink || first?.ink || ['blue', 'red', 'purple', 'orange'][i % 4];
    if (!INKS.includes(ink)) err(`${where}: side ${s.id}: unknown ink ${ink}`);
    return { id: s.id, name: s.name, ink, polities: (s.polities || []).map((p) => ctx.pol.index.get(p)).filter((v) => v !== undefined), moves: s.moves || null, success: s.success || null };
  });
  const sideIds = new Set(sides.map((s) => s.id).concat('none'));
  const countries = new Set(w.countries || []);
  for (const s of w.sides || []) for (const p of s.polities || []) for (const c of ctx.pol.list[ctx.pol.index.get(p)]?.countries || []) if (!w.countries) countries.add(c);

  for (const [k, v] of [['name', w.name], ['summary', w.summary], ...(w.notes || []).map((n, i) => [`note ${i + 1}`, n])]) if (isObj(v)) err(`${where}: ${k} ${NOT_TEXT}`);
  const steps = (w.steps || []).map((s, si) => {
    const sw = `${where} step ${si + 1}`;
    if (!s.title) err(`${sw}: missing title`);
    if (!s.body?.length && w.tier !== 'C') err(`${sw}: missing body`);
    (s.body || []).forEach((b, k) => { if (typeof b !== 'string') err(`${sw}: body paragraph ${k + 1} ${NOT_TEXT}`); });
    for (const v of [s.title, s.date, ...(s.facts || []).flat(), ...(s.markers || []).flatMap((m) => [m.name, m.text, m.date])]) if (isObj(v)) err(`${sw}: "${Object.keys(v)[0]}…" ${NOT_TEXT}`);
    if (s.link) validLink(s.link.href, `${sw} link`, true);
    const bkey = dateKey(s.borders ?? s.date);
    if (!bkey) err(`${sw}: bad date/borders ${s.borders ?? s.date}`);
    const pts = [];
    const markers = (s.markers || []).map((m, mi) => {
      const mw = `${sw} marker ${m.name || mi + 1}`;
      if (!KINDS.includes(m.kind)) err(`${mw}: unknown kind ${m.kind}`);
      if (!sideIds.has(m.side || 'none')) err(`${mw}: unknown side ${m.side}`);
      validLonLat(m.lonlat, mw);
      const xy = project(m.lonlat || [0, 0]); pts.push(xy);
      return { kind: m.kind, side: m.side || 'none', name: m.name, date: m.date || '', text: m.text || '', xy, lp: m.lp || 'r' };
    });
    const arrowPhases = new Set();
    const hasArrowPhases = s.arrows?.some((a) => a.phase !== undefined);
    const arrows = (s.arrows || []).map((a, ai) => {
      const aw = `${sw} arrow ${ai + 1}`;
      if (!sideIds.has(a.side || 'none')) err(`${aw}: unknown side ${a.side}`);
      if (hasArrowPhases) {
        if (!Number.isSafeInteger(a.phase) || a.phase < 1) err(`${aw}: phase must be a positive integer on every arrow in a phased step`);
        else arrowPhases.add(a.phase);
      }
      let d, end, ang, poly;
      if (a.bezier) {
        const P = a.bezier.map((ll) => (validLonLat(ll, aw), project(ll)));
        if ((P.length - 1) % 3) err(`${aw}: bezier needs 1 + 3n points`);
        d = `M${P[0]}` + Array.from({ length: (P.length - 1) / 3 | 0 }, (_, k) => `C${P[1 + 3 * k]} ${P[2 + 3 * k]} ${P[3 + 3 * k]}`).join('');
        end = P[P.length - 1]; const c = P[P.length - 2]; ang = Math.atan2(end[1] - c[1], end[0] - c[0]); poly = P.filter((_, k) => k % 3 === 0);
      } else {
        const P = (a.via || []).map((ll) => (validLonLat(ll, aw), project(ll)));
        if (P.length < 2) { err(`${aw}: needs at least two points in via`); return null; }
        d = catmullRom(P); end = P[P.length - 1];
        // The spline's end tangent points from the second-to-last point to the end.
        const c = P[P.length - 2];
        ang = Math.atan2(end[1] - c[1], end[0] - c[0]);
        poly = P;
      }
      pts.push(...poly);
      let lxy = null;
      if (a.label) {
        if (a.label_at) { validLonLat(a.label_at, aw); lxy = project(a.label_at); }
        else { const { p, dir } = pathPoint(poly, 0.5); const n = Math.hypot(dir[0], dir[1]) || 1; lxy = [p[0], p[1]]; lxy.auto = [-dir[1] / n, dir[0] / n]; }
      }
      return { side: a.side || 'none', phase: a.phase, d, end, ang: Math.round(ang * 1000) / 1000, label: a.label || null, lxy, auto: lxy?.auto || null };
    }).filter(Boolean);
    if ([...arrowPhases].some((phase) => phase > arrowPhases.size)) err(`${sw}: arrow phases must be consecutive starting at 1`);
    const areas = (s.areas || []).map((ar, ai) => {
      const aw = `${sw} area ${ai + 1}`;
      if (!AREA_STYLES.includes(ar.style)) err(`${aw}: unknown style ${ar.style}`);
      if (ar.side && !sideIds.has(ar.side)) err(`${aw}: unknown side ${ar.side}`);
      const atoms = [...new Set((ar.atoms || []).flatMap((id) => ctx.borders.expand(id, aw)))];
      for (const i of atoms) { const m = ctx.borders.meta.get(ctx.borders.order[i]); if (m) pts.push(m.xy); }
      // Free-form shapes, for lines and zones that do not follow atoms (fronts,
      // occupation zones): polygon (one ring), polygons (several), line(s) (open).
      const ring = (r, what) => {
        if (!Array.isArray(r) || r.length < 2) { err(`${aw}: ${what} needs at least two [lon, lat] points`); return []; }
        return r.map((ll) => { validLonLat(ll, aw); const xy = project(ll); pts.push(xy); return xy; });
      };
      const rings = [...(ar.polygon ? [ar.polygon] : []), ...(ar.polygons || [])].map((r) => ring(r, 'polygon')).filter((r) => r.length >= 3);
      const shape = rings.length ? rings.map((r) => `M${r.join('L')}Z`).join('') : null;
      const lines = [...(ar.line ? [ar.line] : []), ...(ar.lines || [])].map((r) => ring(r, 'line')).filter((r) => r.length >= 2);
      const line = lines.length ? lines.map((r) => `M${r.join('L')}`).join('') : null;
      if (!atoms.length && !shape && !line) err(`${aw}: needs atoms, polygon(s) or line(s)`);
      if (ar.style === 'front' && !line) err(`${aw}: a front needs line or lines`);
      return { style: ar.style, side: ar.side || null, label: ar.label || null, atoms, ...(shape ? { shape } : {}), ...(line ? { line } : {}) };
    });
    // View box
    let view;
    if (s.view?.center) { const c = project(s.view.center); const [vw, vh] = s.view.size; view = [c[0] - vw / 2, c[1] - vh / 2, vw, vh]; }
    else if (Array.isArray(s.view) && s.view.length === 2) { const a = project(s.view[0]), b = project(s.view[1]); view = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])]; }
    else if (pts.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const w0 = Math.max(x1 - x0, 260), h0 = Math.max(y1 - y0, 260), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      view = [cx - w0 * 0.62, cy - h0 * 0.62, w0 * 1.24, h0 * 1.24];
    } else view = null;
    if (view) view = view.map(r1);
    for (const a of arrows) if (a.auto && view) { const off = Math.max(view[2], view[3]) * 0.025; a.lxy = [r1(a.lxy[0] + a.auto[0] * off), r1(a.lxy[1] + a.auto[1] * off)]; }
    for (const a of arrows) delete a.auto;
    const when = dateKey(s.when ?? (String(s.date ?? '').match(/\d{4}/) || [])[0] ?? w.start);
    if (!when) err(`${sw}: cannot work out a sort date (add when:)`);
    return {
      title: s.title, date: String(s.date ?? ''), when, borders: bkey, countries: s.countries || null,
      body: s.body || [], facts: s.facts || [], link: s.link || null, view, markers, arrows, areas,
      sideNames: s.side_names || null, moveNames: s.move_names || null,
    };
  });
  // A step tagged with a country puts the war in that country's view.
  for (const st of steps) for (const c of st.countries || []) countries.add(c);
  return {
    war: { id: w.id, name: w.name, start: String(w.start), end: w.end !== undefined ? String(w.end) : null, tier: w.tier, summary: w.summary || '', sides, notes: w.notes || [], sources: w.sources || [], steps },
    index: { id: w.id, name: w.name, start: String(w.start), end: w.end !== undefined ? String(w.end) : null, sk: dateKey(w.start), ek: dateKey(w.end === 'ongoing' ? '9999' : w.end ?? w.start), tier: w.tier, summary: w.summary || '', countries: [...countries].sort(), steps: steps.map((s) => ({ t: s.title, d: s.date, c: s.countries, w: s.when })), polities: [...new Set(sides.flatMap((s) => s.polities))], ...(steps.length ? {} : { sources: w.sources || [] }) },
  };
}

// ---------------------------------------------------------------- main
// `--check`: validate only, write nothing (safe to run alongside a dev build).
// A full build writes to a temporary folder and replaces dist/ only when it
// succeeds, so a failed build leaves the served site as it was.
const CHECK = process.argv.includes('--check');
const OUT = join(ROOT, '.dist-tmp');
const emit = (f, data) => (CHECK ? null : writeFile(join(OUT, f), data));

async function main() {
  const preview = process.argv.includes('--dev') && !CHECK
    ? await (await import('./dev-build.mjs')).previewCache() : null;
  if (preview?.reuseData) {
    console.log('Reusing validated map data for local preview.');
    return;
  }
  if (!CHECK) {
    await rm(OUT, { recursive: true, force: true });
    await mkdir(join(OUT, 'data/wars'), { recursive: true });
    await cp(join(ROOT, 'site'), OUT, { recursive: true });
  }

  const topoText = await readFile(join(ROOT, 'site-data/atoms.topo.json'), 'utf8');
  const topo = JSON.parse(topoText);
  const pol = await buildPolities();
  const borders = await buildBorders(pol, topo);
  const labels = await buildLabels(pol, borders, topo);

  const locales = await loadLocales(err);
  if (!CHECK) await prepareLocaleOutput(locales, OUT);
  const wars = [];
  const seen = new Set();
  const files = await listFiles(join(CONTENT, 'wars'), '.yaml');
  for (let start = 0; start < files.length; start += 16) {
    const batch = files.slice(start, start + 16);
    const entries = await Promise.all(batch.map(f => readYAML(join(CONTENT, 'wars', f))));
    const outputs = entries.map((w, i) => {
      const f = batch[i];
      if (seen.has(w.id)) err(`war ${f}: duplicate id ${w.id}`);
      seen.add(w.id);
      const { war, index } = buildWar(w, f, { pol, borders });
      wars.push(index);
      return { war, index };
    });
    await Promise.all(outputs.map(async ({ war, index }) => {
      await compileWarTranslations(locales, war, index, emit, err);
      await emit(`data/wars/${war.id}.json`, JSON.stringify(war));
    }));
  }
  wars.sort((a, b) => (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : a.name.localeCompare(b.name)));

  const bordersOut = {
    frame: [FRAME.x0, FRAME.y0, FRAME.x1 - FRAME.x0, FRAME.y1 - FRAME.y0],
    reliefBounds: [DATA_CLIP.x0, DATA_CLIP.y0, DATA_CLIP.x1 - DATA_CLIP.x0, DATA_CLIP.y1 - DATA_CLIP.y0],
    overviewGrid: overviewGrid(),
    
    atoms: borders.order,
    names: borders.order.map((id) => borders.meta.get(id)?.name || id),
    polities: pol.list.map((p) => {
      const hints = p.label ? (Array.isArray(p.label[0]) ? p.label : [p.label]) : [];
      const names = (p.names || []).map(([until, n]) => [dateKey(until), n]);
      for (const [k] of names) if (!k) err(`polity ${p.id}: bad date in names`);
      return { id: p.id, name: p.name, ink: p.ink || null, countries: p.countries || [], auto: !!p.auto, ...(hints.length ? { lxy: hints.map((h) => project(h)) } : {}), ...(names.length ? { names } : {}) };
    }),
    timeline: borders.timeline.map((t) => ({ d: t.d, k: t.k, s: t.s, c: t.c })),
  };
  await emitLocales(locales, bordersOut, labels, emit, err);
  await emit('data/atoms.topo.json', topoText);
  await emit('data/borders.json', JSON.stringify(bordersOut));
  await emit('data/polities.css', pol.css);
  await emit('data/wars.json', JSON.stringify(wars));
  await emit('data/labels.json', JSON.stringify(labels));

  // Size report: what a first visit downloads.
  const first = ['index.html', 'app.js', 'i18n.js', 'localized-content.js', ...(await listFiles(join(ROOT, 'site/locales'), '.js')).map(file => `locales/${file}`), 'style.css', 'relief.webp', 'vendor/topojson-client.min.js', 'data/atoms.topo.json', 'data/borders.json', 'data/polities.css', 'data/wars.json', 'data/labels.json'];
  let raw = 0, gz = 0;
  for (const f of CHECK ? [] : first) { try { const b = await readFile(join(OUT, f)); raw += b.length; gz += gzipSync(b).length; } catch {} }
  console.log(`polities ${pol.list.length}, atoms ${borders.order.length}, timeline entries ${borders.timeline.length}, wars ${wars.length}`);
  if (!CHECK) console.log(`first load: ${(raw / 1e6).toFixed(2)} MB raw, ${(gz / 1e6).toFixed(2)} MB gzip`);
  if (!CHECK && gz > 1.2e6) warn(`first load is over budget (${(gz / 1e6).toFixed(2)} MB gzip > 1.2 MB)`);
  for (const w of warnings) console.warn('warning:', w);
  for (const e of errors) console.error('ERROR:', e);
  if (errors.length) {
    if (!CHECK) await rm(OUT, { recursive: true, force: true });
    console.error(`${errors.length} error(s)${CHECK ? '' : '; dist/ left unchanged'}`);
    process.exit(1);
  }
  if (!CHECK) {
    await rm(DIST, { recursive: true, force: true });
    await rename(OUT, DIST);
    if (preview) await preview.save();
  }
}

main().catch(async (e) => {
  console.error(e);
  if (!CHECK) await rm(OUT, { recursive: true, force: true }).catch(() => {});
  process.exit(1);
});
