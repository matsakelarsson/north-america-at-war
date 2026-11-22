// Builds the base map geometry.
//  .cache/ne/*.geojson + content/borders/splits/*.geojson
//    -> site-data/atoms.topo.json   (projected km, SVG units, y down)
//    -> content/borders/atoms.json  (atom index: id, name, country, interior point)
//
// Atoms are Natural Earth admin-1 regions, optionally cut by hand-made splits.
// A split is a GeoJSON polygon (lon/lat) with properties {id, from, name}. The
// part of atom `from` inside the polygon becomes atom `id` (by convention
// `<from>~<suffix>`); the rest keeps the id `from`.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import polygonClipping from 'polygon-clipping';
import { projectRaw, unproject, mapCoords, DATA_CLIP } from './projection.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Natural Earth names that are wrong for the polygon they label.
const NAME_FIX = { 'MD-RE': 'Rîbnița', 'AZ-LAN': 'Lachin' };
const CACHE = join(ROOT, '.cache');
const PREFILTER = [-170, 5, -45, 85]; // lon/lat box that covers DATA_CLIP

const readJSON = async (p) => JSON.parse(await readFile(p, 'utf8'));

function bboxOf(geom) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  mapCoords(geom, (c) => { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; return c; });
  return [x0, y0, x1, y1];
}
const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const toMulti = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const fromMulti = (mp) => (mp.length === 1 ? { type: 'Polygon', coordinates: mp[0] } : { type: 'MultiPolygon', coordinates: mp });

async function loadSplits() {
  const dir = join(ROOT, 'content/borders/splits');
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.endsWith('.geojson')); } catch {}
  const out = [];
  for (const f of files.sort()) {
    const fc = await readJSON(join(dir, f));
    for (const ft of fc.features) {
      const { id, from } = ft.properties || {};
      if (!id || !from) throw new Error(`${f}: split feature needs properties.id and properties.from`);
      out.push({ ...ft.properties, file: f, geometry: ft.geometry });
    }
  }
  return out;
}

async function main() {
  const ne = await readJSON(join(CACHE, 'ne/admin1.geojson'));
  const seen = new Map();
  let atoms = [];
  for (const ft of ne.features) {
    if (!ft.geometry || !overlaps(bboxOf(ft.geometry), PREFILTER)) continue;
    const p = ft.properties;
    let id = /^[A-Z]{2}-[A-Z0-9]{1,4}$/.test(p.iso_3166_2 || '') ? p.iso_3166_2 : p.adm1_code;
    if (seen.has(id)) id = p.adm1_code;
    if (seen.has(id)) throw new Error('duplicate atom id ' + id);
    seen.set(id, true);
    atoms.push({ id, name: NAME_FIX[id] || p.name_en || p.name || id, country: p.adm0_a3, admin: p.admin, geometry: ft.geometry });
  }

  // Apply splits (in lon/lat, before projecting).
  const splits = await loadSplits();
  for (const s of splits) {
    const parent = atoms.find((a) => a.id === s.from);
    if (!parent) throw new Error(`split ${s.id}: no atom ${s.from}`);
    const cutter = toMulti(s.geometry);
    const inside = polygonClipping.intersection(toMulti(parent.geometry), cutter);
    const outside = polygonClipping.difference(toMulti(parent.geometry), cutter);
    if (!inside.length) { console.warn(`split ${s.id}: does not overlap ${s.from}`); continue; }
    if (outside.length) parent.geometry = fromMulti(outside);
    else atoms = atoms.filter((a) => a !== parent);
    atoms.push({ id: s.id, name: s.name || s.id, country: parent.country, admin: parent.admin, parent: s.from, geometry: fromMulti(inside) });
  }

  // Project everything to km.
  const proj = (fc) => ({ type: 'FeatureCollection', features: fc.map((f) => ({ type: 'Feature', properties: f.properties, geometry: mapCoords(f.geometry, (c) => projectRaw(c)) })) });
  const atomFC = proj(atoms.map((a) => ({ properties: { id: a.id }, geometry: a.geometry })));

  const lakesRaw = await readJSON(join(CACHE, 'ne/lakes.geojson'));
  const lakes = lakesRaw.features.filter((f) => f.geometry && f.properties.scalerank <= 5 && overlaps(bboxOf(f.geometry), PREFILTER));
  const lakeFC = proj(lakes.map((f) => ({ properties: { name: f.properties.name || '' }, geometry: f.geometry })));

  const riversRaw = await readJSON(join(CACHE, 'ne/rivers.geojson'));
  const rivers = riversRaw.features.filter((f) => f.geometry && f.properties.scalerank <= 5 && f.properties.featurecla !== 'Lake Centerline' && overlaps(bboxOf(f.geometry), PREFILTER));
  const riverFC = proj(rivers.map((f) => ({ properties: { name: f.properties.name || '' }, geometry: f.geometry })));

  const bbox = `${DATA_CLIP.x0},${DATA_CLIP.y0},${DATA_CLIP.x1},${DATA_CLIP.y1}`;
  const cmd = [
    '-i atoms.json lakes.json rivers.json combine-files snap',
    `-clip bbox=${bbox} target=*`,
    '-simplify interval=1.4 keep-shapes planar target=*',
    '-filter-slivers min-area=4 target=atoms',
    '-clean target=atoms',
    '-filter "this.area > 30" target=lakes',
    '-o format=topojson quantization=60000 atoms.topo.json target=*',
  ].join(' ');
  const out = await mapshaper.applyCommands(cmd, {
    'atoms.json': atomFC, 'lakes.json': lakeFC, 'rivers.json': riverFC,
  });
  const topo = JSON.parse(out['atoms.topo.json']);

  // Interior points for labelling and for drafting owners.
  const ptsOut = await mapshaper.applyCommands('-i atoms.json -points inner -o format=geojson pts.json', { 'atoms.json': atomFC });
  const pts = new Map(JSON.parse(ptsOut['pts.json']).features.map((f) => [f.properties.id, f.geometry.coordinates]));

  const kept = new Set(topo.objects.atoms.geometries.map((g) => g.properties.id));
  const index = atoms.filter((a) => kept.has(a.id)).map((a) => {
    const xy = pts.get(a.id);
    const ll = unproject(xy);
    return { id: a.id, name: a.name, country: a.country, admin: a.admin, ...(a.parent ? { parent: a.parent } : {}),
      xy: xy.map((v) => Math.round(v * 10) / 10), ll: ll.map((v) => Math.round(v * 1e4) / 1e4) };
  }).sort((a, b) => a.id.localeCompare(b.id));

  await mkdir(join(ROOT, 'site-data'), { recursive: true });
  await writeFile(join(ROOT, 'site-data/atoms.topo.json'), JSON.stringify(topo));
  await writeFile(join(ROOT, 'content/borders/atoms.json'), '[\n' + index.map((a) => JSON.stringify(a)).join(',\n') + '\n]\n');
  const size = Buffer.byteLength(JSON.stringify(topo));
  console.log(`atoms: ${index.length} (${splits.length} splits), lakes: ${topo.objects.lakes?.geometries.length}, rivers: ${topo.objects.rivers?.geometries.length}`);
  console.log(`atoms.topo.json: ${(size / 1e6).toFixed(2)} MB`);
}

main().catch((e) => { console.error(e); process.exit(1); });
