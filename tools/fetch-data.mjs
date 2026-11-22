// Downloads the raw source data into .cache/ (git-ignored).
// Natural Earth (public domain) and historical-basemaps (GPL-3.0, A. Ourednik).
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache');

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const HB = 'https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/';

export const HB_YEARS = [800, 900, 1000, 1100, 1200, 1279, 1300, 1400, 1492, 1500, 1530, 1600, 1650,
  1700, 1715, 1783, 1800, 1815, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010];

const files = [
  ['ne/admin1.geojson', NE + 'ne_10m_admin_1_states_provinces.geojson'],
  ['ne/admin0.geojson', NE + 'ne_10m_admin_0_countries.geojson'],
  ['ne/lakes.geojson', NE + 'ne_10m_lakes.geojson'],
  ['ne/rivers.geojson', NE + 'ne_10m_rivers_lake_centerlines.geojson'],
  ['ne/land.geojson', NE + 'ne_10m_land.geojson'],
  ...HB_YEARS.map((y) => [`hb/world_${y}.geojson`, `${HB}world_${y}.geojson`]),
];

async function exists(p) { try { return (await stat(p)).size > 0; } catch { return false; } }

for (const [rel, url] of files) {
  const out = join(CACHE, rel);
  if (await exists(out)) { console.log('cached  ', rel); continue; }
  await mkdir(dirname(out), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(out, buf);
  console.log('fetched ', rel, (buf.length / 1e6).toFixed(1) + ' MB');
}
