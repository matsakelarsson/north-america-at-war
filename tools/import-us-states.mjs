// Import the Newberry Library's US_HistStateTerr_Gen05.shp and its sidecars.
// Download the Generalized .05 degree states/territories archive from
// https://publications.newberry.org/ahcb/pages/United_States.html
// Usage: node tools/import-us-states.mjs /path/to/states.shp /path/to/counties.shp
// Use the Generalized .05 degree archives for both inputs.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import mapshaper from 'mapshaper';
import { topology } from 'topojson-server';
import polygonClipping from 'polygon-clipping';
import { ROOT } from './lib.mjs';
import { DATA_CLIP, mapCoords, projectRaw } from './projection.mjs';

const [stateInput, countyInput] = process.argv.slice(2);
if (!stateInput || !countyInput) throw new Error('Pass the paths to the Newberry state and county shapefiles');
async function importShapefile(path, filter) {
  const args = ['-i', path, ...(filter ? ['-filter', filter] : []), '-o', 'format=geojson', 'features.json'];
  const file = await mapshaper.applyCommands(args, {});
  return JSON.parse(file['features.json']);
}
const [states, counties] = await Promise.all([
  importShapefile(stateInput),
  importShapefile(countyInput, 'START_N < 17830903'),
]);
states.features = states.features
  .filter(f => f.geometry && f.properties.NAME !== 'Hawaii' && f.properties.ID !== 'hi_terr')
  .map(({ properties: p, geometry }) => ({
    type: 'Feature',
    properties: { name: p.NAME, start: p.START_N, end: p.END_N },
    geometry: mapCoords(geometry, projectRaw),
  }));
if (!states.features.length || states.features.some(f => !Number.isInteger(f.properties.start) || !Number.isInteger(f.properties.end))) {
  throw new Error('No dated state boundaries found in the shapefile');
}
const toDate = stamp => new Date(`${String(stamp).slice(0, 4)}-${String(stamp).slice(4, 6)}-${String(stamp).slice(6)}T00:00:00Z`);
const offsetDay = (stamp, offset) => {
  const date = toDate(stamp);
  date.setUTCDate(date.getUTCDate() + offset);
  return Number(date.toISOString().slice(0, 10).replaceAll('-', ''));
};
const jurisdictions = new Map();
for (const f of counties.features) {
  const { STATE_TERR: name, START_N: start, END_N: end } = f.properties;
  if (!f.geometry || !name || !Number.isInteger(start) || !Number.isInteger(end)) continue;
  const records = [[name, start, Math.min(end, 17830902)]];
  if (start < 17120101 && ['North Carolina Colony', 'South Carolina Colony'].includes(name)) {
    records[0] = ['Province of Carolina', start, Math.min(end, 17111231)];
    if (end >= 17120101) records.push([name, 17120101, Math.min(end, 17830902)]);
  }
  for (const [label, from, until] of records) {
    if (!jurisdictions.has(label)) jurisdictions.set(label, []);
    jurisdictions.get(label).push({ start: from, end: until, rings: f.geometry.coordinates });
  }
}
const colonial = [];
for (const [name, counties] of jurisdictions) {
  const dates = [...new Set(counties.flatMap(c => [c.start, offsetDay(c.end, 1)]))].sort((a, b) => a - b);
  let previous = '';
  for (let i = 0; i < dates.length - 1; i++) {
    const start = dates[i], end = offsetDay(dates[i + 1], -1);
    const active = counties.filter(c => c.start <= start && c.end >= start);
    if (!active.length) { previous = ''; continue; }
    const coordinates = polygonClipping.union(...active.map(c => c.rings));
    const signature = JSON.stringify(coordinates);
    if (signature === previous) {
      colonial.at(-1).properties.end = end;
    } else if (coordinates.length) {
      colonial.push({
        type: 'Feature',
        properties: { name, start, end },
        geometry: mapCoords({ type: 'MultiPolygon', coordinates }, projectRaw),
      });
    }
    previous = signature;
  }
}
const { x0, y0, x1, y1 } = DATA_CLIP;
const clipped = await mapshaper.applyCommands(
  '-i states.json -clip bbox=' + [x0, y0, x1, y1].join(',') + ' -o format=geojson clipped.json',
  { 'states.json': states },
);
const topo = topology({ states: JSON.parse(clipped['clipped.json']) }, 42000);
const jurisdictionsTopo = topology({ colonial: { type: 'FeatureCollection', features: colonial } }, 42000);
await writeFile(join(ROOT, 'site-data/us-states.topo.json'), JSON.stringify(topo));
await writeFile(join(ROOT, 'site-data/colonial-jurisdictions.topo.json'), JSON.stringify(jurisdictionsTopo));
console.log(`Imported ${topo.objects.states.geometries.length} dated polygons`);
console.log(`Derived ${jurisdictionsTopo.objects.colonial.geometries.length} colonial jurisdictions from county geometry`);
