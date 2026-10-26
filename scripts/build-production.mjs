import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { shaderPlugin } from './compact-shaders.mjs';
import { PUBLIC_SCENES } from '../lib/market-policy.js';
import { buildSite, ORIGIN } from './site/pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public');
const output = path.join(root, 'dist', 'web');
// Delete only this generated directory, never a user-controlled output path.
if (path.relative(root, output) !== path.join('dist', 'web')) throw new Error('Unsafe build output.');
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(path.join(output, 'assets', 'scenes'), { recursive: true });

const common = {
  absWorkingDir: root, bundle: true, minify: true, sourcemap: false,
  platform: 'browser', target: ['es2022'], legalComments: 'eof', charset: 'utf8',
  metafile: true, logLevel: 'warning',
};
const urlFor = (result, entry) => {
  const file = Object.entries(result.metafile.outputs).find(([, info]) => info.entryPoint === entry)?.[0];
  if (!file) throw new Error(`Missing built entry: ${entry}`);
  return '/' + path.relative(output, path.resolve(root, file)).split(path.sep).join('/');
};
const worklet = await build({ ...common, format: 'esm', entryPoints: ['public/js/audio/deck-processor.js'], outdir: path.join(output, 'assets'), entryNames: '[name]-[hash]' });
const worker = await build({ ...common, format: 'iife', entryPoints: ['public/js/audio/track-analysis.js'], outdir: path.join(output, 'assets'), entryNames: '[name]-[hash]' });
const app = await build({
  ...common, format: 'esm', splitting: true,
  entryPoints: { app: 'public/js/main.js', account: 'public/js/ui/account.js' },
  outdir: path.join(output, 'assets'), entryNames: '[name]-[hash]', chunkNames: 'shared-[hash]',
  plugins: [shaderPlugin],
  define: {
    __VZ_PRODUCTION__: 'true',
    __VZ_SCENES_URL__: JSON.stringify('/assets/scenes/'),
    __VZ_TOOLS_URL__: JSON.stringify('/assets/tools/'),
    __VZ_WORKLET_URL__: JSON.stringify(urlFor(worklet, 'public/js/audio/deck-processor.js')),
    __VZ_WORKER_URL__: JSON.stringify(urlFor(worker, 'public/js/audio/track-analysis.js')),
  },
});
const styles = await build({ ...common, entryPoints: ['public/css/style.css', 'public/css/dj.css', 'public/css/account.css', 'public/css/tools.css'], outdir: path.join(output, 'assets'), entryNames: '[name]-[hash]' });
// The admin desk: its own page, script and style. The manifest lists them as adminFiles, which
// the server hands to admins only (lib/public-host.js).
const desk = await build({ ...common, format: 'esm', entryPoints: { admin: 'public/admin/admin.js' }, outdir: path.join(output, 'assets'), entryNames: '[name]-[hash]' });
const deskStyle = await build({ ...common, entryPoints: { admin: 'public/admin/admin.css' }, outdir: path.join(output, 'assets'), entryNames: '[name]-[hash]' });

const catalogue = JSON.parse(await fs.readFile(path.join(source, 'scenes', 'catalog.json'), 'utf8'));
const memberScenes = {};
const memberSources = new Set();
await fs.mkdir(path.join(output, 'assets', 'scenes', 'thumbs'), { recursive: true });
for (const entry of catalogue.scenes) {
  if (!/^[a-z0-9-]{1,40}$/.test(entry.id) || entry.file !== `${entry.id}.js`) throw new Error('Invalid scene catalogue.');
  entry.requiresAccount = !PUBLIC_SCENES.has(entry.id);
  if (entry.requiresAccount) {
    memberScenes[`/assets/scenes/${entry.file}`] = entry.id;
    memberSources.add(`public/scenes/${entry.file}`);
  }
  // A changed card gets a new URL, including behind an edge/browser image cache.
  if (entry.thumb) {
    if (!/^thumbs\/[a-z0-9-]+\.webp$/.test(entry.thumb)) throw new Error('Invalid scene thumbnail.');
    const bytes = await fs.readFile(path.join(source, 'scenes', entry.thumb));
    const revision = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    entry.thumb = `thumbs/${entry.id}-${revision}.webp`;
    await fs.writeFile(path.join(output, 'assets', 'scenes', entry.thumb), bytes);
  }
}
const includesMember = inputs => Object.keys(inputs).some(file => memberSources.has(file.split(path.sep).join('/')));
if ([app, worklet, worker, desk].some(result => includesMember(result.metafile.inputs))) throw new Error('A public bundle imports a member scene.');
// Separate scene outputs prevent a public/shared bundle from embedding member scenes.
const sceneBuild = await build({ ...common, format: 'esm', entryPoints: catalogue.scenes.map(e => path.join('public', 'scenes', e.file)),
  outdir: path.join(output, 'assets', 'scenes'), entryNames: '[name]', splitting: false, plugins: [shaderPlugin] });
for (const info of Object.values(sceneBuild.metafile.outputs)) {
  if (!memberSources.has(info.entryPoint) && includesMember(info.inputs)) throw new Error('A public scene imports a member scene.');
}
await fs.writeFile(path.join(output, 'assets', 'scenes', 'catalog.json'), JSON.stringify(catalogue));

// The market's tools: one bundle per tool (its shared helpers inlined), cards renamed by content.
// They are played with, not watched, and need nothing from an account, so they are all public.
const tools = JSON.parse(await fs.readFile(path.join(source, 'tools', 'catalog.json'), 'utf8'));
await fs.mkdir(path.join(output, 'assets', 'tools', 'thumbs'), { recursive: true });
for (const entry of tools.tools) {
  if (!/^[a-z0-9-]{1,40}$/.test(entry.id) || entry.file !== `${entry.id}.js`) throw new Error('Invalid tool catalogue.');
  if (entry.thumb) {
    if (!/^thumbs\/[a-z0-9-]+\.svg$/.test(entry.thumb)) throw new Error('Invalid tool picture.');
    const bytes = await fs.readFile(path.join(source, 'tools', entry.thumb));
    entry.thumb = `thumbs/${entry.id}-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.svg`;
    await fs.writeFile(path.join(output, 'assets', 'tools', entry.thumb), bytes);
  }
}
const toolBuild = await build({ ...common, format: 'esm', entryPoints: tools.tools.map(e => path.join('public', 'tools', e.file)),
  outdir: path.join(output, 'assets', 'tools'), entryNames: '[name]', splitting: false });
for (const info of Object.values(toolBuild.metafile.outputs)) {
  if (includesMember(info.inputs)) throw new Error('A tool imports a member scene.');
}
await fs.writeFile(path.join(output, 'assets', 'tools', 'catalog.json'), JSON.stringify(tools));

// The site's own pages: one for every scene and tool, the two indexes, the use-case pages in English
// and Turkish, the sitemap and robots.txt (scripts/site/pages.mjs). Their 1200×630 pictures, made with
// `node scripts/make-thumbs.js --og` and the card job, are renamed by content like the cards above.
const pageStyle = await build({ ...common, entryPoints: { pages: 'public/css/pages.css' }, outdir: path.join(output, 'assets'), entryNames: '[name]-[hash]' });
async function publishPicture(from, to) {
  let bytes;
  try { bytes = await fs.readFile(from); } catch { return null; }   // a page without one uses the small card
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) throw new Error(`Not a JPEG: ${from}`);
  const route = `${to}-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.jpg`;
  await fs.mkdir(path.dirname(path.join(output, route)), { recursive: true });
  await fs.writeFile(path.join(output, route), bytes);
  return '/' + route;
}
const sceneOg = new Map(), toolOg = new Map(), cards = new Map();
for (const entry of catalogue.scenes) { const url = await publishPicture(path.join(source, 'scenes', 'og', `${entry.id}.jpg`), `assets/scenes/og/${entry.id}`); if (url) sceneOg.set(entry.id, url); }
for (const entry of tools.tools) { const url = await publishPicture(path.join(source, 'tools', 'og', `${entry.id}.jpg`), `assets/tools/og/${entry.id}`); if (url) toolOg.set(entry.id, url); }
for (const name of (await fs.readdir(path.join(source, 'og'))).filter(n => /^[a-z0-9-]+\.jpg$/.test(n)).sort()) {
  cards.set(name.slice(0, -4), await publishPicture(path.join(source, 'og', name), `assets/og/${name.slice(0, -4)}`));
}
if (!cards.has('site')) throw new Error('The site card (public/og/site.jpg) is missing.');
const site = buildSite({ scenes: catalogue.scenes, tools: tools.tools, sceneOg, toolOg, cards, css: urlFor(pageStyle, 'public/css/pages.css') });
for (const page of site.pages) {
  await fs.mkdir(path.dirname(path.join(output, page.file)), { recursive: true });
  await fs.writeFile(path.join(output, page.file), page.html);
}
await fs.writeFile(path.join(output, 'sitemap.xml'), site.sitemap);
await fs.writeFile(path.join(output, 'robots.txt'), site.robots);
await fs.writeFile(path.join(output, site.notFound.file), site.notFound.html);
const pages = site.pages.map(page => page.route).sort();
await fs.copyFile(path.join(source, 'favicon.svg'), path.join(output, 'favicon.svg'));
// The home-screen app: its manifest and the PNG icons phones want. They keep fixed addresses, because
// the lock screen's fallback picture (lockscreen.js) asks for /icon-512.png and /icon-192.png by name.
for (const name of ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
  await fs.copyFile(path.join(source, name), path.join(output, name));
}
// This deliberately public example supports the custom-scene import feature.
await fs.copyFile(path.join(source, 'scenes', 'template.glsl'), path.join(output, 'assets', 'scenes', 'template.glsl'));
let html = await fs.readFile(path.join(source, 'index.html'), 'utf8');
for (const [original, built] of [
  ['js/main.js', urlFor(app, 'public/js/main.js')], ['js/ui/account.js', urlFor(app, 'public/js/ui/account.js')],
  ['scenes/template.glsl', '/assets/scenes/template.glsl'],
  [`${ORIGIN}/og/site.jpg`, ORIGIN + cards.get('site')],
  ...['style', 'dj', 'account', 'tools'].map(name => [`css/${name}.css`, urlFor(styles, `public/css/${name}.css`)]),
]) {
  if (!html.includes(`"${original}"`)) throw new Error(`HTML entry not found: ${original}`);
  html = html.replaceAll(`"${original}"`, `"${built}"`);
}
// the hosted site's pages, linked under the hero
const marker = /<!-- site-links:[^>]*-->/;
if (!marker.test(html)) throw new Error('HTML entry not found: site-links');
html = html.replace(marker, site.heroLinks);
html = html.replace(/<!--(?!\s*\[if)[\s\S]*?-->/g, '').replace(/\n[\t ]+/g, '\n');
await fs.writeFile(path.join(output, 'index.html'), html);
const deskUrls = [urlFor(desk, 'public/admin/admin.js'), urlFor(deskStyle, 'public/admin/admin.css')];
let deskHtml = await fs.readFile(path.join(source, 'admin', 'index.html'), 'utf8');
for (const [original, built] of [['/admin/admin.js', deskUrls[0]], ['/admin/admin.css', deskUrls[1]]]) {
  if (!deskHtml.includes(`"${original}"`)) throw new Error(`Admin HTML entry not found: ${original}`);
  deskHtml = deskHtml.replaceAll(`"${original}"`, `"${built}"`);
}
await fs.mkdir(path.join(output, 'admin'), { recursive: true });
await fs.writeFile(path.join(output, 'admin', 'index.html'), deskHtml.replace(/<!--[\s\S]*?-->/g, '').replace(/\n[\t ]+/g, '\n'));
const adminFiles = ['/admin/index.html', ...deskUrls];

async function list(dir) {
  const result = [];
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isSymbolicLink()) throw new Error('Symlinks are not allowed in published assets.');
    if (item.isDirectory()) result.push(...await list(full));
    else result.push('/' + path.relative(output, full).split(path.sep).join('/'));
  }
  return result;
}
const files = (await list(output)).sort();
if (files.some(file => /\.map$|\/js\/|\/css\//.test(file))) throw new Error('Source artifacts leaked into the build.');
// The allowlist is deliberately outside the served directory.
// A build id from the published bytes themselves, so the same sources always give the same manifest.
const content = createHash('sha256');
for (const file of files) content.update(file).update(await fs.readFile(path.join(output, file)));
const buildInfo = { id: content.digest('hex').slice(0, 12), files: files.length, scenes: catalogue.scenes.length, memberScenes: Object.keys(memberScenes).length, tools: tools.tools.length, pages: pages.length };
await fs.writeFile(path.join(root, 'dist', 'asset-manifest.json'), JSON.stringify({ version: 1, files, memberScenes, adminFiles, pages, build: buildInfo }));
console.log(`Production build ${buildInfo.id}: ${files.length} files, ${catalogue.scenes.length} scenes, ${Object.keys(memberScenes).length} member scenes, ${tools.tools.length} tools, ${pages.length} pages, the admin desk. No source maps.`);
