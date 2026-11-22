// Print a ?box= value (map km) for a lon/lat centre and a width in km.
//   node tools/box.mjs 19 52 1200 [height-km]
import { project } from './projection.mjs';
const [lon, lat, w, h] = process.argv.slice(2).map(Number);
const [x, y] = project([lon, lat]);
const H = h || w * 0.9;
console.log([x - w / 2, y - H / 2, w, H].map((v) => Math.round(v)).join(','));
