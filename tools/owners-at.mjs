// List atom owners on a date, from the last build (dist/data/borders.json).
//   node tools/owners-at.mjs 1772-01-01                 all polities
//   node tools/owners-at.mjs 1772-01-01 poland prussia  only these
//   node tools/owners-at.mjs 1772-01-01 --atoms 'PL-|LT-'   atoms matching a regex
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';
const B = JSON.parse(readFileSync(join(ROOT, 'dist/data/borders.json'), 'utf8'));
const args = process.argv.slice(2);
const key = (s) => { const [y, m = '00', d = '00'] = String(s).split('-'); return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`; };
const k = key(args.shift());
const ai = args.indexOf('--atoms'); const re = ai >= 0 ? new RegExp(args.splice(ai, 2)[1]) : null;
const own = new Int16Array(B.atoms.length).fill(-1);
for (const t of B.timeline) { if (t.k > k) break; for (let j = 0; j < t.c.length; j += 2) own[t.c[j]] = t.c[j + 1]; }
const by = new Map();
B.atoms.forEach((id, i) => { if (re && !re.test(id)) return; const p = own[i] < 0 ? '-' : B.polities[own[i]].id; (by.get(p) || by.set(p, []).get(p)).push(id); });
for (const [p, l] of [...by].sort()) if (!args.length || args.includes(p)) console.log(`${p} (${l.length}): ${l.join(' ')}`);
