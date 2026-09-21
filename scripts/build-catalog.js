// Rebuilds public/scenes/catalog.json, the index the in-app market reads. `npm run catalog`.
//
// Every public/scenes/<id>.js is a scene plugin whose default export describes itself. The
// catalogue is those descriptions without the shader code, so the market can show a card for a
// scene nobody has downloaded yet. Scenes already listed keep their place; a new file lands at
// the end of its group.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public', 'scenes');
const OUT = path.join(DIR, 'catalog.json');
const GROUPS = ['Show', 'Journey', 'Vibe', 'Things', 'Lab'];

const files = (await fs.readdir(DIR)).filter((f) => /^[a-z0-9-]+\.js$/.test(f)).sort();
const thumbs = new Set(await fs.readdir(path.join(DIR, 'thumbs')).catch(() => []));
let previous = [];
try { previous = JSON.parse(await fs.readFile(OUT, 'utf8')).scenes.map((s) => s.id); } catch { /* first build */ }

const problems = [];
const scenes = [];
for (const file of files) {
  const id = file.slice(0, -3);
  let scene;
  try {
    scene = (await import(`${pathToFileURL(path.join(DIR, file)).href}?t=${Date.now()}`)).default;
  } catch (e) {
    problems.push(`${file}: ${e.message}`);
    continue;
  }
  if (!scene || scene.id !== id) { problems.push(`${file}: the default export's id must be "${id}"`); continue; }
  if (typeof scene.frag !== 'string' || !/\bvoid\s+main\s*\(/.test(scene.frag)) { problems.push(`${file}: "frag" must be a shader with a main()`); continue; }
  if (!scene.name || !scene.group) { problems.push(`${file}: "name" and "group" are required`); continue; }
  scenes.push({
    id,
    name: scene.name,
    group: scene.group,
    blurb: scene.blurb || '',
    tags: scene.tags || [],
    energy: Number.isFinite(scene.energy) ? scene.energy : 0.5,
    file,
    thumb: thumbs.has(`${id}.webp`) ? `thumbs/${id}.webp` : null,
  });
}

const groupRank = (g) => { const i = GROUPS.indexOf(g); return i < 0 ? GROUPS.length : i; };
const placeRank = (id) => { const i = previous.indexOf(id); return i < 0 ? Infinity : i; };
scenes.sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.group.localeCompare(b.group)
  || placeRank(a.id) - placeRank(b.id) || a.name.localeCompare(b.name));

const groups = [...new Set(scenes.map((s) => s.group))];
await fs.writeFile(OUT, `${JSON.stringify({ version: 1, groups, scenes }, null, 1)}\n`);
console.log(`catalog.json: ${scenes.length} scenes in ${groups.length} groups (${scenes.filter((s) => s.thumb).length} with a thumbnail).`);
if (problems.length) {
  console.error(`\nSkipped:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
