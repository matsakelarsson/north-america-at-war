// Cut atoms along a historical-basemaps border.
//
//   node tools/split-from-hb.mjs <splits-file> <year> "<NAME>[|<NAME>…]" <suffix> "<name>" <atom> [<atom> …]
//   node tools/split-from-hb.mjs 20-schleswig 1880 Germany nschleswig "North Schleswig" DK-83
//   node tools/split-from-hb.mjs 60-german-lands my-lines.geojson "Upper Palatinate" opf "Upper Palatinate" DE-BY~bav
//
// For each atom, the part inside the named historical-basemaps polygon(s) of
// that year becomes a new atom `<atom>~<suffix>`, appended to
// content/borders/splits/<splits-file>.geojson. Work is done on the same raw
// lon/lat geometry build-geo.mjs uses (Natural Earth plus every existing
// split, in file order), so the cut matches the atom's edges exactly.
// Pieces smaller than MIN_PART km² or thinner than MIN_WIDTH km are folded into
// the other side, and a cut that leaves less than MIN_SIDE km² on either side
// is skipped. Run `npm run geo` and `npm run draft` afterwards.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import polygonClipping from 'polygon-clipping';
import { projectRaw } from './projection.mjs';
import { ROOT } from './lib.mjs';

const MIN_PART = 150, MIN_WIDTH = 4, MIN_SIDE = 300;
const [fileArg, year, names, suffix, label, ...targets] = process.argv.slice(2);
if (!targets.length) { console.error('usage: node tools/split-from-hb.mjs <splits-file> <year> "<NAME>[|<NAME>…]" <suffix> "<name>" <atom> [<atom> …]'); process.exit(1); }
const SPLITS = join(ROOT, 'content/borders/splits');
const outFile = join(SPLITS, fileArg.replace(/\.geojson$/, '') + '.geojson');

const readJSON = async (p) => JSON.parse(await readFile(p, 'utf8'));
const toMulti = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const fromMulti = (mp) => (mp.length === 1 ? { type: 'Polygon', coordinates: mp[0] } : { type: 'MultiPolygon', coordinates: mp });
function bbox(mp) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of mp) for (const [x, y] of p[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
/** Area (km²) and perimeter (km) of one polygon, measured in the map projection. */
function measure(poly) {
  let area = 0, per = 0;
  poly.forEach((ring, k) => {
    const P = ring.map((c) => projectRaw(c));
    let a = 0;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) { a += (P[j][0] - P[i][0]) * (P[j][1] + P[i][1]); per += Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]); }
    area += (k === 0 ? 1 : -1) * Math.abs(a / 2);
  });
  return { area, width: per ? (2 * area) / per : 0 };
}
const small = (poly) => { const m = measure(poly); return m.area < MIN_PART || m.width < MIN_WIDTH; };
const total = (mp) => mp.reduce((t, p) => t + measure(p).area, 0);

// Atoms as build-geo makes them: Natural Earth admin-1 plus all splits so far.
const ne = await readJSON(join(ROOT, '.cache/ne/admin1.geojson'));
const atoms = new Map();
for (const ft of ne.features) {
  if (!ft.geometry) continue;
  const p = ft.properties;
  let id = /^[A-Z]{2}-[A-Z0-9]{1,4}$/.test(p.iso_3166_2 || '') ? p.iso_3166_2 : p.adm1_code;
  if (atoms.has(id)) id = p.adm1_code;
  atoms.set(id, toMulti(ft.geometry));
}
const files = (await readdir(SPLITS)).filter((f) => f.endsWith('.geojson')).sort();
const outName = outFile.split('/').pop();
if (files.length && !files.includes(outName) && outName < files[files.length - 1]) console.warn(`note: ${outName} sorts before ${files[files.length - 1]}; its splits are applied first`);
let out = { type: 'FeatureCollection', features: [] };
for (const f of files) {
  const fc = await readJSON(join(SPLITS, f));
  if (f === outName) out = fc;
  for (const ft of fc.features) {
    const { id, from } = ft.properties;
    const parent = atoms.get(from);
    if (!parent) throw new Error(`${f}: split ${id}: no atom ${from}`);
    const cut = toMulti(ft.geometry);
    const inside = polygonClipping.intersection(parent, cut), outside = polygonClipping.difference(parent, cut);
    if (!inside.length) continue;
    if (outside.length) atoms.set(from, outside); else atoms.delete(from);
    atoms.set(id, inside);
  }
}

// A path to a .geojson file (features with a NAME property) can stand in for the year, for hand-drawn cuts.
const handFile = /\.geojson$/.test(year);
const hb = await readJSON(handFile ? year : join(ROOT, `.cache/hb/world_${year}.geojson`));
const wanted = new Set(names.split('|'));
const hbPolys = hb.features.filter((f) => f.geometry && wanted.has(f.properties.NAME)).flatMap((f) => toMulti(f.geometry));
if (!hbPolys.length) { console.error(`no historical-basemaps ${year} feature named ${[...wanted].join(' or ')}`); process.exit(1); }

for (const id of targets) {
  const geom = atoms.get(id);
  if (!geom) { console.error(`${id}: no such atom (after existing splits)`); continue; }
  const newId = `${id}~${suffix}`;
  if (atoms.has(newId) || out.features.some((f) => f.properties.id === newId)) { console.log(`${newId}: exists, skipped`); continue; }
  const [x0, y0, x1, y1] = bbox(geom);
  const box = [[[x0 - 0.1, y0 - 0.1], [x1 + 0.1, y0 - 0.1], [x1 + 0.1, y1 + 0.1], [x0 - 0.1, y1 + 0.1], [x0 - 0.1, y0 - 0.1]]];
  const near = hbPolys.filter((p) => { const b = bbox([p]); return b[0] <= x1 && b[2] >= x0 && b[1] <= y1 && b[3] >= y0; });
  const zone = near.length ? polygonClipping.intersection(box, polygonClipping.union(...near.map((p) => [p]))) : [];
  let inside = zone.length ? polygonClipping.intersection(geom, zone) : [];
  let outside = zone.length ? polygonClipping.difference(geom, zone) : geom;
  // Fold slivers into the other side.
  const inKeep = inside.filter((p) => !small(p)), inDrop = inside.filter(small);
  const outKeep = outside.filter((p) => !small(p)), outDrop = outside.filter(small);
  inside = [...inKeep, ...outDrop];
  outside = [...outKeep, ...inDrop];
  if (inDrop.length || outDrop.length) inside = inside.length ? polygonClipping.union(...inside.map((p) => [p])) : [];
  const ai = total(inside), ao = total(outside);
  if (ai < MIN_SIDE || ao < MIN_SIDE || !inKeep.length || !outKeep.length) { console.log(`${id}: ${Math.round(ai)} km² inside, ${Math.round(ao)} km² outside, no split`); continue; }
  out.features.push({ type: 'Feature', properties: { id: newId, from: id, name: label, source: handFile ? `hand-drawn: ${[...wanted].join(' | ')}` : `historical-basemaps ${year}: ${[...wanted].join(' | ')}` }, geometry: fromMulti(inside) });
  atoms.set(newId, inside); atoms.set(id, outside);
  console.log(`${newId}: ${Math.round(ai)} km² split off, ${Math.round(ao)} km² stay in ${id}`);
}
await writeFile(outFile, JSON.stringify(out));
