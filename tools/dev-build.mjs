// Reuse validated data when restarting the local preview.
import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

async function fingerprint(paths) {
  const hash = createHash('sha256');
  async function visit(path) {
    const entries = await readdir(join(ROOT, path), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await visit(file);
      else await add(file);
    }
  }
  async function add(file) {
    const digest = createHash('sha256').update(await readFile(join(ROOT, file))).digest();
    hash.update(file).update('\0').update(digest);
  }
  for (const path of paths) {
    if (path.endsWith('/')) await visit(path);
    else await add(path);
  }
  return hash.digest('hex');
}

const cache = join(ROOT, '.cache/dev-build.json');
export async function previewCache() {
  const inputs = await fingerprint(['content/', 'site-data/', 'tools/build.mjs', 'tools/lib.mjs',
    'tools/locales.mjs', 'site/localized-content.js', 'site/locales/', 'tools/projection.mjs', 'tools/capitals.mjs', 'package.json', 'package-lock.json']);
  let previous;
  try { previous = JSON.parse(await readFile(cache, 'utf8')); } catch { /* First preview. */ }
  let reuseData = false;
  if (previous?.inputs === inputs) {
    try { reuseData = previous.data === await fingerprint(['dist/data/']); } catch { /* Missing output. */ }
  }
  return {
    reuseData,
    async save() {
      const data = await fingerprint(['dist/data/']);
      await mkdir(join(ROOT, '.cache'), { recursive: true });
      const temp = cache + '.' + process.pid;
      await writeFile(temp, JSON.stringify({ inputs, data }));
      await rename(temp, cache);
    },
  };
}
