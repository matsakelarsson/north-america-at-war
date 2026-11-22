// Owner history of atoms, from the last build (dist/data/borders.json).
//   node tools/owner-history.mjs 'IS-|FRO' [from-year] [to-year]
// Prints each change: date, atom, new owner, and the entry's source.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';
const B = JSON.parse(readFileSync(join(ROOT, 'dist/data/borders.json'), 'utf8'));
const [pat, from = '0', to = '9999'] = process.argv.slice(2);
const re = new RegExp(pat);
for (const t of B.timeline) {
  const y = +t.k.slice(0, 4);
  if (y < +from || y > +to) continue;
  const by = new Map();
  for (let j = 0; j < t.c.length; j += 2) {
    const id = B.atoms[t.c[j]];
    if (!re.test(id)) continue;
    const p = t.c[j + 1] < 0 ? '-' : B.polities[t.c[j + 1]].id;
    (by.get(p) || by.set(p, []).get(p)).push(id);
  }
  if (by.size) console.log(`${t.d}  ${[...by].map(([p, l]) => `${p}: ${l.length > 8 ? l.length + ' atoms' : l.join(' ')}`).join('; ')}  [${String(t.s).slice(0, 50)}]`);
}
