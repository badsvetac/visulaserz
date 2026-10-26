// Rebuilds public/tools/catalog.json, the index of the market's Tools shelf. `npm run tools`.
//
// Every public/tools/<id>.js is a tool plugin whose default export describes itself; the catalogue
// is those descriptions without the code, so the market can show a card for a tool nobody has
// opened yet. Tools already listed keep their place; a new file lands at the end of its group.
// Shared code for tools lives in public/tools/lib and is not a tool itself.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public', 'tools');
const OUT = path.join(DIR, 'catalog.json');
const GROUPS = ['Studio', 'Pads', 'Rhythm', 'Instruments', 'FX'];

const files = (await fs.readdir(DIR)).filter((f) => /^[a-z0-9-]+\.js$/.test(f)).sort();
const thumbs = new Set(await fs.readdir(path.join(DIR, 'thumbs')).catch(() => []));
let previous = [];
try { previous = JSON.parse(await fs.readFile(OUT, 'utf8')).tools.map((t) => t.id); } catch { /* first build */ }

const problems = [];
const tools = [];
for (const file of files) {
  const id = file.slice(0, -3);
  let tool;
  try {
    tool = (await import(`${pathToFileURL(path.join(DIR, file)).href}?t=${Date.now()}`)).default;
  } catch (e) {
    problems.push(`${file}: ${e.message}`);
    continue;
  }
  if (!tool || tool.id !== id) { problems.push(`${file}: the default export's id must be "${id}"`); continue; }
  if (typeof tool.create !== 'function') { problems.push(`${file}: a tool needs create(host, mount)`); continue; }
  if (!tool.name || !GROUPS.includes(tool.group)) { problems.push(`${file}: "name" is required and "group" must be one of ${GROUPS.join(', ')}`); continue; }
  tools.push({
    id,
    name: tool.name,
    group: tool.group,
    blurb: tool.blurb || '',
    tags: tool.tags || [],
    file,
    thumb: thumbs.has(`${id}.svg`) ? `thumbs/${id}.svg` : null,
  });
}

const placeRank = (id) => { const i = previous.indexOf(id); return i < 0 ? Infinity : i; };
tools.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || placeRank(a.id) - placeRank(b.id) || a.name.localeCompare(b.name));

const groups = [...new Set(tools.map((t) => t.group))];
await fs.writeFile(OUT, `${JSON.stringify({ version: 1, groups, tools }, null, 1)}\n`);
console.log(`tools/catalog.json: ${tools.length} tools in ${groups.length} groups (${tools.filter((t) => t.thumb).length} with a picture).`);
if (problems.length) {
  console.error(`\nSkipped:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
}
