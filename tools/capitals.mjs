// Resolve capital tenures once at build time and audit each mapped owner-period.
import { project, FRAME } from './projection.mjs';

export function compileCapitals(rows, pol, borders, dateKey, err) {
  const pointOwners = new Set();
  const records = [], starts = new Map(), ends = new Map(), byOwner = new Map();
  const add = (map, key, value) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };
  const validDate = value => {
    if (value == null) return true;
    const s = String(value);
    if (!/^\d{3,4}(-\d\d(-\d\d)?)?$/.test(s)) return false;
    const [year, month = 1, day = 1] = s.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
  };
  for (const row of rows) {
    const {polity, name, lonlat, source, from, until, role} = row || {};
    const location = Array.isArray(lonlat) && lonlat.length === 2 && lonlat.every(Number.isFinite) &&
      Math.abs(lonlat[0]) <= 180 && Math.abs(lonlat[1]) <= 90;
    const noSeat = ['Itinerant court', 'No permanent capital', 'Territorial grouping'].includes(role);
    const unlocated = role === 'Unlocated seat' && !lonlat;
    const validSeat = name ? typeof name === 'string' && (location || unlocated) : noSeat && !lonlat;
    const validSource = typeof source === 'string' && URL.canParse(source) && source.startsWith('https://');
    if (!pol.index.has(polity) || !validSource ||
        !validDate(from) || !validDate(until) || (from && until && dateKey(from) >= dateKey(until)) ||
        (row?.point_only && !from) || !validSeat) {
      err('Invalid capital tenure: ' + JSON.stringify(row));
      continue;
    }
    const xy = location ? project(lonlat) : null;
    const inFrame = xy && xy[0] >= FRAME.x0 && xy[0] <= FRAME.x1 && xy[1] >= FRAME.y0 && xy[1] <= FRAME.y1;
    const owner = pol.index.get(polity), id = records.length;
    const auditName = unlocated ? name + ' (location unresolved)' : name ? name + (inFrame ? '' : ' (outside map)') : role;
    records.push({name, xy, owner, role, inFrame, auditName, pointOnly: row.point_only});
    if (row.point_only) pointOwners.add(owner);
    add(byOwner, owner, id);
    add(starts, dateKey(from) || '0000-00-00', id);
    if (until) add(ends, dateKey(until), id);
  }
  const changes = new Map();
  for (const t of borders.timeline) add(changes, t.k, t.c);
  const keys = [...new Set([...changes.keys(), ...starts.keys(), ...ends.keys()])].sort();
  const atoms = new Map(), counts = new Map(), eligible = new Set(), rendered = new Set();
  for (const owner of pointOwners) counts.set(owner, 0);
  const timeline = [], audit = new Map(), published = [], publishedIndex = new Map();
  for (const key of keys) {
    for (const id of ends.get(key) || []) eligible.delete(id);
    for (const id of starts.get(key) || []) eligible.add(id);
    for (const delta of changes.get(key) || []) for (let i = 0; i < delta.length; i += 2) {
      const atom = delta[i], prev = atoms.get(atom), next = delta[i + 1];
      if (prev >= 0) counts.set(prev, counts.get(prev) - 1);
      atoms.set(atom, next);
      if (next >= 0) counts.set(next, (counts.get(next) || 0) + 1);
    }
    const active = new Set(), added = [], removed = [];
    for (const [owner, atomCount] of counts) {
      const seats = (byOwner.get(owner) || []).filter(i => eligible.has(i) && (atomCount || records[i].pointOnly));
      const present = atomCount > 0 || seats.length > 0;
      const status = seats.length ? seats.map(i => records[i].auditName).sort().join(' / ') : 'unresolved';
      const id = pol.list[owner].id;
      const spans = audit.get(id) || [];
      const last = spans.at(-1);
      if (last && !last.until && (!present || last.status !== status)) last.until = key;
      if (present && (!last || last.until)) { spans.push({from:key, status}); audit.set(id, spans); }
      for (const i of seats) if (records[i].inFrame) active.add(i);
    }
    for (const i of active) if (!rendered.has(i)) {
      if (!publishedIndex.has(i)) {
        const {name, xy, owner, role} = records[i];
        publishedIndex.set(i, published.length);
        published.push({name, xy, owner, ...(role && {role})});
      }
      added.push(publishedIndex.get(i)); rendered.add(i);
    }
    for (const i of rendered) if (!active.has(i)) { removed.push(publishedIndex.get(i)); rendered.delete(i); }
    if (added.length || removed.length) timeline.push({key, added, removed});
  }
  return {capitals:published, capitalTimeline:timeline, audit:Object.fromEntries([...audit].sort())};
}
