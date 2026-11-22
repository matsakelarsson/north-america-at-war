// Hand-correct a drafted keyframe: give atoms to a polity in one or more
// keyframes. Use "-" as the polity to leave the atoms unowned.
//
//   node tools/set-owner.mjs <year>[,<year>...] <polity> <atom> [<atom> ...]
//   node tools/set-owner.mjs 1530,1600 russia RU-PSK
//
// Marks the keyframe's source as hand-checked for those atoms.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONTENT, loadPolities } from './lib.mjs';

const [years, polity, ...atoms] = process.argv.slice(2);
if (!years || !polity || !atoms.length) { console.error('usage: node tools/set-owner.mjs <year>[,<year>...] <polity> <atom> [<atom> ...]'); process.exit(1); }
const { byId } = await loadPolities();
if (polity !== '-' && !byId.has(polity)) { console.error(`unknown polity ${polity}`); process.exit(1); }
const known = new Set(JSON.parse(await readFile(join(CONTENT, 'borders', 'atoms.json'), 'utf8')).map((a) => a.id));
for (const a of atoms) if (!known.has(a)) { console.error(`unknown atom ${a}`); process.exit(1); }

for (const y of years.split(',')) {
  const p = join(CONTENT, 'borders', 'keyframes', `${y}.json`);
  const kf = JSON.parse(await readFile(p, 'utf8'));
  const set = new Set(atoms);
  const owners = {};
  for (const [q, list] of Object.entries(kf.owners)) {
    const keep = list.filter((a) => !set.has(a));
    if (keep.length) owners[q] = keep;
  }
  owners[polity] = [...(owners[polity] || []), ...atoms].sort();
  kf.owners = owners;
  if (!/hand-corrected/.test(kf.source)) kf.source = kf.source.replace(/\(automatic draft, needs checking\)/, '(automatic draft, partly hand-corrected)');
  const lines = Object.entries(owners).map(([q, a]) => `    ${JSON.stringify(q)}: ${JSON.stringify(a)}`);
  await writeFile(p, `{\n  "date": ${JSON.stringify(kf.date)},\n  "source": ${JSON.stringify(kf.source)},\n  "owners": {\n${lines.join(',\n')}\n  }\n}\n`);
  console.log(`${y}: ${atoms.join(' ')} → ${polity}`);
}
