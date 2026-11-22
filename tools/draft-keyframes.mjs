// Drafts border keyframes from historical-basemaps (GPL-3.0, A. Ourednik) and,
// for today, from Natural Earth admin-0 codes on the atoms themselves.
//
// For every snapshot year, each atom's interior point is placed inside the
// smallest historical-basemaps polygon that contains it, and that polygon's
// NAME is mapped to a polity through the aliases in content/polities.yaml.
// Unknown names become auto polities in content/polities.auto.yaml.
//
// Existing keyframe files are NOT overwritten: only atoms missing from a file
// are filled in, so hand corrections survive. Use --force to redraft a year.
//
//   node tools/draft-keyframes.mjs [--force] [years...]
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { ROOT, CONTENT, readJSON, exists, loadPolities, slug, hashColor } from './lib.mjs';
import { HB_YEARS } from './fetch-data.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyYears = args.filter((a) => /^\d+$/.test(a)).map(Number);
const TODAY = { year: 2010, date: '2010', note: 'Natural Earth modern administrative borders' };
// The 2010 snapshot is replaced by the exact modern borders of the atoms.
const YEARS = HB_YEARS.filter((y) => y !== 2010);

const UNCLAIMED = new Set(['None', '', null, undefined]);

function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polyContains(poly, x, y) {
  if (!ringContains(poly[0], x, y)) return false;
  for (let k = 1; k < poly.length; k++) if (ringContains(poly[k], x, y)) return false;
  return true;
}
function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); }

function prepare(fc) {
  const out = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of poly[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      out.push({ name: f.properties.NAME, poly, bbox: [x0, y0, x1, y1], area: ringArea(poly[0]) });
    }
  }
  return out;
}

function lookup(polys, [x, y]) {
  let best = null;
  for (const p of polys) {
    const b = p.bbox;
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    if (best && p.area >= best.area) continue;
    if (polyContains(p.poly, x, y)) best = p;
  }
  return best ? best.name : null;
}

function groupOwners(assign) {
  const owners = {};
  for (const [atom, pol] of Object.entries(assign)) (owners[pol] ||= []).push(atom);
  const sorted = {};
  for (const k of Object.keys(owners).sort()) sorted[k] = owners[k].sort();
  return sorted;
}
function formatKeyframe(kf) {
  // One polity per line keeps diffs readable.
  const lines = Object.entries(kf.owners).map(([p, a]) => `    ${JSON.stringify(p)}: ${JSON.stringify(a)}`);
  return `{\n  "date": ${JSON.stringify(kf.date)},\n  "source": ${JSON.stringify(kf.source)},\n  "owners": {\n${lines.join(',\n')}\n  }\n}\n`;
}

async function main() {
  const atoms = await readJSON(join(CONTENT, 'borders/atoms.json'));
  const byAtom = new Map(atoms.map((a) => [a.id, a]));
  const { alias, byId } = await loadPolities();
  const autoPath = join(CONTENT, 'polities.auto.yaml');
  const autoList = (await exists(autoPath)) ? (YAML.parse(await (await import('node:fs/promises')).readFile(autoPath, 'utf8')) || []) : [];
  const autoById = new Map(autoList.map((p) => [p.id, p]));
  const unmapped = new Map();
  const kfDir = join(CONTENT, 'borders/keyframes');
  await mkdir(kfDir, { recursive: true });

  const resolve = (name, year) => {
    if (UNCLAIMED.has(name) || !String(name).trim()) return null;
    name = String(name).trim();
    if (alias.has(name)) return alias.get(name);
    let id = slug(name);
    if (byId.has(id) && !(byId.get(id).aliases || []).includes(name)) id = id + '-' + year;
    if (!autoById.has(id)) autoById.set(id, { id, name, color: hashColor(id), aliases: [name] });
    alias.set(name, id);
    unmapped.set(name, (unmapped.get(name) || []).concat(year));
    return id;
  };

  const jobs = [...YEARS.map((y) => ({ year: y })), { year: TODAY.year, today: true }]
    .filter((j) => !onlyYears.length || onlyYears.includes(j.year));
  for (const job of jobs) {
    const file = join(kfDir, `${String(job.year).padStart(4, '0')}.json`);
    let existing = null;
    if (!force && (await exists(file))) existing = await readJSON(file);
    const have = new Set(existing ? Object.values(existing.owners).flat() : []);
    const assign = {};
    if (existing) for (const [p, list] of Object.entries(existing.owners)) for (const a of list) assign[a] = p;

    let polys = null;
    if (!job.today) polys = prepare(await readJSON(join(ROOT, `.cache/hb/world_${job.year}.geojson`)));
    let added = 0;
    // Parents before their split-off children (children of children last).
    const depth = (a) => a.id.split('~').length;
    const ownerOf = (id) => { for (let x = id; x; x = byAtom.get(x)?.parent) if (assign[x] !== undefined) return assign[x]; return undefined; };
    for (const a of [...atoms].sort((p, q) => depth(p) - depth(q))) {
      if (have.has(a.id)) continue;
      const pol = (job.today ? resolve(a.country, job.year) : resolve(lookup(polys, a.ll), job.year)) || '-';
      // A split atom inherits from its parent; list it only where its own draft differs.
      if (a.parent && ownerOf(a.parent) === pol) continue;
      assign[a.id] = pol;
      added++;
    }
    const kf = {
      date: existing?.date ?? (job.today ? TODAY.date : String(job.year)),   // keep hand-set dates (1945 → Potsdam)
      source: existing?.source || (job.today ? TODAY.note : `historical-basemaps world_${job.year} (automatic draft, needs checking)`),
      owners: groupOwners(assign),
    };
    await writeFile(file, formatKeyframe(kf));
    console.log(`${job.year}: ${added} atoms drafted${existing ? ` (${have.size} kept)` : ''}`);
  }

  const autoOut = [...autoById.values()].sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(autoPath, '# Generated by `npm run draft` for historical-basemaps names that have no curated\n# polity yet. Move an entry to polities.yaml (and fix it) to curate it.\n' + YAML.stringify(autoOut, { lineWidth: 0 }));
  if (unmapped.size) {
    console.log(`\n${unmapped.size} names had no curated polity (now in polities.auto.yaml):`);
    for (const [n, ys] of [...unmapped].sort()) console.log(`  ${n}  [${ys.join(', ')}]`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
