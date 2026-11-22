// Shared helpers for the build tools.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CONTENT = join(ROOT, 'content');

export const readJSON = async (p) => JSON.parse(await readFile(p, 'utf8'));
export const readYAML = async (p) => YAML.parse(await readFile(p, 'utf8'));
export async function exists(p) { try { await readFile(p); return true; } catch { return false; } }
export async function listFiles(dir, ext) {
  try { return (await readdir(dir)).filter((f) => f.endsWith(ext)).sort(); } catch { return []; }
}

export function slug(s) {
  return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
}

/** Curated + auto polities, merged. Curated wins on id and alias clashes. */
export async function loadPolities() {
  // polities.yaml plus any topic files in content/polities/ (all curated).
  const curated = (await readYAML(join(CONTENT, 'polities.yaml'))) || [];
  for (const f of await listFiles(join(CONTENT, 'polities'), '.yaml')) curated.push(...(((await readYAML(join(CONTENT, 'polities', f))) || []).map((p) => ({ ...p, file: f }))));
  let auto = [];
  if (await exists(join(CONTENT, 'polities.auto.yaml'))) auto = (await readYAML(join(CONTENT, 'polities.auto.yaml'))) || [];
  const byId = new Map();
  const alias = new Map();
  for (const p of curated) {
    if (byId.has(p.id)) throw new Error(`${p.file || 'polities.yaml'}: duplicate polity id ${p.id}`);
    byId.set(p.id, { ...p, curated: true });
    for (const a of p.aliases || []) {
      if (alias.has(a) && alias.get(a) !== p.id) throw new Error(`polities.yaml: alias "${a}" used by ${alias.get(a)} and ${p.id}`);
      alias.set(a, p.id);
    }
  }
  // An auto polity whose names have all been claimed by curated polities is
  // superseded: its id redirects to the curated polity (keyframes may still use it).
  const redirect = new Map();
  for (const p of auto) {
    if (byId.has(p.id)) continue;
    const aliases = (p.aliases || []).filter((a) => !alias.has(a));
    if (!aliases.length && p.aliases?.length) { redirect.set(p.id, alias.get(p.aliases[0])); continue; }
    byId.set(p.id, { ...p, auto: true });
    for (const a of aliases) alias.set(a, p.id);
  }
  return { byId, alias, curated, auto, redirect };
}

/** A soft pastel derived from a string, for auto polities. */
export function hashColor(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const hue = (h >>> 0) % 360;
  return oklchToHex(0.89, 0.045, hue);
}

// ---- Colour maths (OKLab/OKLCH), used for auto colours and dark mode ----
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const delin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export function hexToOklch(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => lin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}
export function oklchToHex(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.round(Math.min(1, Math.max(0, delin(v))) * 255));
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
}
/** Dark-mode twin of a light pastel fill: same hue, low lightness. */
export function darkFill(hex) {
  const [, C, H] = hexToOklch(hex);
  return oklchToHex(0.34, Math.min(0.07, C * 1.1 + 0.01), H);
}

export async function writeText(p, s) { await writeFile(p, s); }
