// The one projection used everywhere: spherical Lambert azimuthal equal-area
// centred on 100°W 45°N. Output units are
// kilometres, x to the east and y to the SOUTH, so they are SVG user units.
import { geoAzimuthalEqualArea, geoGraticule, geoPath } from 'd3-geo';

const atlasProjection = () => geoAzimuthalEqualArea()
  .rotate([100, -45])
  .scale(6371.0088)
  .translate([0, 0]);
export const projection = atlasProjection().precision(0);

const r1 = (v) => Math.round(v * 10) / 10;

/** [lon, lat] -> [x, y] in km (SVG units), rounded to 100 m. */
export function project(lonlat) {
  const p = projection(lonlat);
  return [r1(p[0]), r1(p[1])];
}
/** Unrounded projection, for geometry. */
export function projectRaw(lonlat) { return projection(lonlat); }
/** [x, y] -> [lon, lat] */
export function unproject(xy) { return projection.invert(xy); }

/** Walk any GeoJSON geometry's coordinates through fn. */
export function mapCoords(geom, fn) {
  if (!geom) return geom;
  const walk = (c) => (typeof c[0] === 'number' ? fn(c) : c.map(walk));
  if (geom.type === 'GeometryCollection') return { ...geom, geometries: geom.geometries.map((g) => mapCoords(g, fn)) };
  return { ...geom, coordinates: walk(geom.coordinates) };
}

// Map frame in projected km, including the Central American isthmus.
export const FRAME = { x0: -4300, y0: -3650, x1: 4650, y1: 4000 };
// Geometry is kept a good way beyond FRAME so that no clip edge shows when
// the view is wider than the frame or panned to its edge.
export const DATA_CLIP = { x0: -5400, y0: -4300, x1: 5300, y1: 4300 };

// A ten-degree grid for the atlas overview, simplified in projected kilometres.
export function overviewGrid() {
  const grid = geoGraticule().extent([[-170, 5], [-45, 85]]).step([10, 10]).precision(5);
  return geoPath(atlasProjection().precision(4)).digits(0)(grid());
}
