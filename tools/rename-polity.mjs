// Rename (or merge) a polity id across all content: keyframes, border events,
// and war sides. Does not touch polities.yaml: edit that by hand first (give
// the target polity the old one's aliases and, if useful, dated `names`).
//
//   node tools/rename-polity.mjs <from> <to> [<from2> <to2> ...]
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';
import { CONTENT, listFiles } from './lib.mjs';

const args = process.argv.slice(2);
if (!args.length || args.length % 2) { console.error('usage: node tools/rename-polity.mjs <from> <to> [<from> <to> ...]'); process.exit(1); }
const map = new Map();
for (let i = 0; i < args.length; i += 2) map.set(args[i], args[i + 1]);
const ren = (id) => map.get(id) ?? id;

/** Merge owners maps: {polity: [atoms]} with renamed keys, arrays joined. */
function renameOwners(owners) {
  const out = {};
  let n = 0;
  for (const [p, atoms] of Object.entries(owners || {})) {
    const q = ren(p);
    if (q !== p) n++;
    out[q] = out[q] ? [...new Set([...out[q], ...atoms])] : atoms;
  }
  return [out, n];
}

let total = 0;
const kdir = join(CONTENT, 'borders', 'keyframes');
for (const f of await listFiles(kdir, '.json')) {
  const p = join(kdir, f);
  const kf = JSON.parse(await readFile(p, 'utf8'));
  const [owners, n] = renameOwners(kf.owners);
  if (!n) continue;
  kf.owners = owners;
  // Same layout as draft-keyframes.mjs: one polity per line.
  const body = Object.entries(owners).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  await writeFile(p, `{\n  "date": ${JSON.stringify(kf.date)},\n  "source": ${JSON.stringify(kf.source)},\n  "owners": {\n${body}\n  }\n}\n`);
  console.log(`${f}: ${n} renamed`); total += n;
}

// YAML files are edited as documents so comments and layout survive.
async function editYAML(p, fn) {
  const doc = YAML.parseDocument(await readFile(p, 'utf8'));
  const n = fn(doc);
  if (n) { await writeFile(p, doc.toString({ lineWidth: 0 })); console.log(`${p.slice(CONTENT.length + 1)}: ${n} renamed`); total += n; }
}
const edir = join(CONTENT, 'borders', 'events');
for (const f of await listFiles(edir, '.yaml')) {
  await editYAML(join(edir, f), (doc) => {
    let n = 0;
    for (const ev of doc.contents?.items || []) {
      const owners = ev.get('owners');
      if (!owners?.items) continue;
      const merged = new Map();
      for (const pair of owners.items) {
        const k = String(pair.key.value ?? pair.key), q = ren(k);
        if (q !== k) n++;
        if (merged.has(q)) { for (const a of pair.value.items) if (!merged.get(q).value.items.some((b) => b.value === a.value)) merged.get(q).value.items.push(a); }
        else { pair.key = doc.createNode(q); merged.set(q, pair); }
      }
      owners.items = [...merged.values()];
    }
    return n;
  });
}
const wdir = join(CONTENT, 'wars');
for (const f of await listFiles(wdir, '.yaml')) {
  await editYAML(join(wdir, f), (doc) => {
    let n = 0;
    for (const side of doc.get('sides')?.items || []) {
      const pols = side.get('polities');
      if (!pols?.items) continue;
      const seen = new Set();
      pols.items = pols.items.filter((it) => {
        const q = ren(String(it.value));
        if (q !== it.value) { n++; it.value = q; }
        if (seen.has(q)) return false;
        seen.add(q); return true;
      });
    }
    return n;
  });
}
console.log(total ? `${total} reference(s) renamed` : 'nothing to rename');
