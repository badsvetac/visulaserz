// Test the actual published files and authorization with disposable account data.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestFile = process.env.ASSET_MANIFEST || path.join(root, 'dist', 'asset-manifest.json');
const staticDir = process.env.STATIC_DIR || path.join(root, process.env.ASSET_MANIFEST ? 'public' : 'dist/web');
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
const directory = await mkdtemp(path.join(tmpdir(), 'visulaserz-production-test-'));
const port = 14890;
let child, output = '', count = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); count++; };
function request(url, { method = 'GET', data, cookie, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const body = data === undefined ? undefined : JSON.stringify(data);
    const req = http.request({ hostname: '127.0.0.1', port, path: url, method, headers: {
      Host: 'test.visulaserz.local',
      ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...headers,
    } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json; try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text, json, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] });
      });
    });
    req.on('error', reject); req.end(body);
  });
}
// The site's own pages: every one answers at its address with its own canonical address, a title and
// a description that fit a search result, a link-preview picture that is published, structured data
// that parses, and links that land. The sitemap lists exactly these pages and the app.
async function checkPages(catalog, toolCatalog) {
  const ORIGIN = 'https://visulaserz.com';
  const files = new Set(manifest.files);
  const pages = manifest.pages || [];
  const useCases = ['/music-visualizer', '/lyric-video-maker', '/slowed-reverb', '/online-daw', '/visualizer-for-tiktok', '/tr', '/tr/slowed-reverb', '/tr/sarki-sozu-videosu', '/tr/online-daw', '/tr/dikey-video'];
  check(pages.length, catalog.scenes.length + toolCatalog.tools.length + 2 + useCases.length, 'A page for every scene and tool, the two indexes and the use-case pages');
  for (const route of [...catalog.scenes.map(e => `/scene/${e.id}`), ...toolCatalog.tools.map(t => `/tool/${t.id}`), '/scenes', '/tools', ...useCases]) check(pages.includes(route), true, `${route} is a page`);
  const sceneIds = new Set(catalog.scenes.map(e => e.id)), toolIds = new Set(toolCatalog.tools.map(t => t.id));
  const alternates = new Map();
  const attr = (text, re) => re.exec(text)?.[1];
  const unescape = value => value.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const linkLands = to => {
    if (/^https:\/\//.test(to)) return !to.startsWith(ORIGIN);
    const [bare, query] = to.split('#')[0].split('?');
    if (query) return bare === '/' && ((/^scene=/.test(query) && sceneIds.has(query.slice(6))) || (/^tool=/.test(query) && toolIds.has(query.slice(5))));
    return bare === '/' || pages.includes(bare) || files.has(bare);
  };
  async function readPage(route) {
    const response = await request(route);
    check(response.status, 200, `${route} answers`);
    check(response.headers['content-type'], 'text/html; charset=utf-8', `${route} is a page`);
    check(/default-src 'self'/.test(response.headers['content-security-policy'] || ''), true, `${route} keeps the content security policy`);
    const text = response.text;
    const title = unescape(attr(text, /<title>([^<]*)<\/title>/) || '');
    const description = unescape(attr(text, /<meta name="description" content="([^"]*)"/) || '');
    check(title.length > 10 && title.length <= 70, true, `${route}: a title that fits (${title.length})`);
    check(description.length > 60 && description.length <= 160, true, `${route}: a description that fits (${description.length})`);
    check(attr(text, /<link rel="canonical" href="([^"]*)"/), ORIGIN + route, `${route}: its own canonical address`);
    check(attr(text, /<meta property="og:url" content="([^"]*)"/), ORIGIN + route, `${route}: the same address for link previews`);
    const image = attr(text, /<meta property="og:image" content="([^"]*)"/) || '';
    check(image.startsWith(ORIGIN + '/assets/') && files.has(image.slice(ORIGIN.length)), true, `${route}: a published link-preview picture`);
    check(/<meta name="twitter:card" content="summary_large_image">/.test(text), true, `${route}: a large card on X`);
    for (const [, json] of text.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)) {
      const data = JSON.parse(json);
      check(data['@context'], 'https://schema.org', `${route}: structured data`);
    }
    check(/<script(?![^>]*application\/ld\+json)[^>]*>/.test(text), false, `${route}: no script runs on the page`);
    for (const [, to] of text.matchAll(/\shref="([^"]+)"/g)) {
      if (/^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(to) || to.startsWith(ORIGIN)) continue;
      if (to.startsWith('#') ? !text.includes(`id="${to.slice(1)}"`) : !linkLands(to)) throw new Error(`${route} links to ${to}, which is not there`);
      count++;
    }
    for (const [, src] of text.matchAll(/\ssrc="([^"]+)"/g)) check(files.has(src), true, `${route}: ${src} is published`);
    for (const [, set] of text.matchAll(/\ssrcset="([^"]+)"/g)) for (const part of set.split(',')) check(files.has(part.trim().split(/\s+/)[0]), true, `${route}: ${part} is published`);
    alternates.set(route, [...text.matchAll(/<link rel="alternate" hreflang="([a-z-]+)" href="([^"]+)">/g)].map(([, lang, to]) => [lang, to.slice(ORIGIN.length) || '/']));
    return text;
  }
  for (const route of pages) {
    const text = await readPage(route);
    if (route.startsWith('/scene/')) {
      const entry = catalog.scenes.find(e => `/scene/${e.id}` === route);
      check(text.includes(`href="/?scene=${entry.id}"`), true, `${route} opens its scene in the app`);
      check(text.includes(entry.requiresAccount ? 'Free account' : 'Works without an account'), true, `${route} says what it needs`);
    }
    if (route.startsWith('/tool/')) check(text.includes(`href="/?tool=${route.slice(6)}"`), true, `${route} opens its tool in the app`);
    check(/<html lang="(en|tr)">/.exec(text)?.[1], route === '/tr' || route.startsWith('/tr/') ? 'tr' : 'en', `${route} says its language`);
  }
  // the app page itself
  const app = (await request('/')).text;
  check(attr(app, /<link rel="canonical" href="([^"]*)"/), ORIGIN + '/', 'The app has its canonical address');
  const appImage = attr(app, /<meta property="og:image" content="([^"]*)"/) || '';
  check(files.has(appImage.slice(ORIGIN.length)) && appImage.includes('/assets/og/site-'), true, 'The app has its published link-preview picture');
  check(JSON.parse(attr(app, /<script type="application\/ld\+json">([^<]*)<\/script>/))['@graph'].some(n => n['@type'] === 'WebApplication' && n.image === appImage), true, 'The app describes itself, with its picture');
  check(/<nav class="hero-links"/.test(app) && app.includes('href="/scenes"') && app.includes('href="/tr"'), true, 'The app links to the site’s pages');
  alternates.set('/', [...app.matchAll(/<link rel="alternate" hreflang="([a-z-]+)" href="([^"]+)">/g)].map(([, lang, to]) => [lang, to.slice(ORIGIN.length) || '/']));
  // a language version points back at the page that points at it
  for (const [route, list] of alternates) {
    for (const [lang, to] of list) {
      if (lang === 'x-default' || to === route) continue;
      check((alternates.get(to) || []).some(([, back]) => back === route), true, `${route} and ${to} name each other (${lang})`);
    }
  }
  check(alternates.get('/').map(([lang]) => lang).sort(), ['en', 'tr', 'x-default'], 'The app has its Turkish page');
  // the sitemap and robots.txt
  const sitemap = await request('/sitemap.xml');
  check([sitemap.status, sitemap.headers['content-type']], [200, 'application/xml; charset=utf-8'], 'The sitemap is published');
  const locs = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].slice(ORIGIN.length) || '/');
  check(locs.sort(), ['/', ...pages].sort(), 'The sitemap lists the app and every page, once');
  check(sitemap.text.includes('<lastmod>'), false, 'The sitemap carries no build time');
  for (const [, image] of sitemap.text.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)) check(files.has(image.slice(ORIGIN.length)), true, `Sitemap picture published: ${image}`);
  const robots = await request('/robots.txt');
  check([robots.status, robots.headers['content-type']], [200, 'text/plain; charset=utf-8'], 'robots.txt is published');
  check(/^Sitemap: https:\/\/visulaserz\.com\/sitemap\.xml$/m.test(robots.text) && /^Disallow: \/api\/$/m.test(robots.text), true, 'robots.txt points at the sitemap and keeps crawlers off the API');
  check(/desk|admin/i.test(robots.text), false, 'robots.txt names no hidden page');
  // one address per page
  for (const [from, to] of [['/scene/koi.html', '/scene/koi'], ['/scenes/', '/scenes'], ['/scene/koi/', '/scene/koi'], ['/tr/', '/tr'], ['/scenes/?ref=tiktok', '/scenes?ref=tiktok']]) {
    const response = await request(from);
    check([response.status, response.headers.location], [301, to], `${from} moves to ${to}`);
  }
  // a missing address is a page for a browser and stays JSON for everything else
  const missing = await request('/scene/no-such-scene', { headers: { Accept: 'text/html,application/xhtml+xml' } });
  check([missing.status, missing.headers['content-type']], [404, 'text/html; charset=utf-8'], 'A missing page shows a page');
  check(/<meta name="robots" content="noindex">/.test(missing.text) && !/rel="canonical"/.test(missing.text), true, 'The missing page stays out of search results');
  check((await request('/scene/no-such-scene')).json?.error, 'Not found', 'An API-style request still gets JSON');
  check((await request('/404.html', { headers: { Accept: 'text/html' } })).status, 404, 'The missing page has no address of its own');
  // www moves to the bare domain, for page loads only
  const www = await request('/scene/koi?ref=x', { headers: { Host: 'www.test.visulaserz.local' } });
  check([www.status, www.headers.location], [301, 'https://test.visulaserz.local/scene/koi?ref=x'], 'A page opened at www moves to the bare domain');
  check((await request('/', { headers: { Host: 'www.test.visulaserz.local', 'Sec-Fetch-Mode': 'navigate' } })).status, 301, 'And so does the app');
  check((await request('/assets/scenes/catalog.json', { headers: { Host: 'www.test.visulaserz.local', 'Sec-Fetch-Mode': 'cors' } })).status, 200, 'What an open www tab fetches still answers there');
  check((await request('/api/health', { headers: { Host: 'www.test.visulaserz.local' } })).status, 200, 'The API answers at www');
}

try {
  for (const route of manifest.files) await access(path.join(staticDir, route));
  check(manifest.files.some(file => /\.map$|\/js\/|\/css\//.test(file)), false, 'Only generated assets may be published');
  const html = await readFile(path.join(staticDir, 'index.html'), 'utf8');
  const pageRoutes = new Set(manifest.pages || []);
  for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|data:|#)/.test(url) || pageRoutes.has(url)) continue;
    check(manifest.files.includes('/' + url.replace(/^\//, '')), true, `HTML asset must be published: ${url}`);
  }
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(match => match[1]);
  check(scripts.length, 2);
  check(scripts.every(url => /^\/assets\/(app|account)-[A-Z0-9]+\.js$/.test(url)), true);
  for (const script of scripts) {
    const code = await readFile(path.join(staticDir, script), 'utf8');
    check(/sourceMappingURL|window\.visulaserz\s*=/.test(code), false, script);
  }
  child = spawn(process.execPath, ['server.js'], { cwd: root, windowsHide: true, env: {
    ...process.env, PORT: String(port), HOST: '127.0.0.1', PUBLIC_HOSTS: 'test.visulaserz.local,www.test.visulaserz.local',
    DATA_DIR: directory, STATIC_DIR: staticDir, ASSET_MANIFEST: manifestFile,
  } });
  child.stdout.on('data', data => output += data);
  child.stderr.on('data', data => output += data);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await request('/api/health')).status === 200) { ready = true; break; } } catch {}
    if (child.exitCode !== null) throw new Error(`Test server exited: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'Production test server did not start.');
  check((await request('/')).status, 200);
  // the home-screen app: its manifest and icons at fixed addresses (the lock screen asks for two by name)
  for (const route of ['/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']) {
    check(manifest.files.includes(route), true, `${route} is published`);
    check((await request(route)).status, 200, `${route} answers`);
  }
  const appManifest = JSON.parse((await request('/manifest.webmanifest')).text);
  check(appManifest.start_url === '/' && appManifest.icons.every(icon => manifest.files.includes(icon.src)), true, 'The app manifest starts at the app and names published icons');
  const catalog = (await request('/assets/scenes/catalog.json')).json;
  check(catalog.scenes.filter(scene => scene.requiresAccount).length, Object.keys(manifest.memberScenes).length);
  for (const scene of catalog.scenes.filter(scene => scene.thumb)) {
    const bytes = await readFile(path.join(staticDir, 'assets', 'scenes', scene.thumb));
    const revision = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    check(scene.thumb, `thumbs/${scene.id}-${revision}.webp`, 'Thumbnail URL must change with its image');
  }
  // the market's tools: all public, each a published bundle, each card renamed with its content
  const toolCatalog = await request('/assets/tools/catalog.json');
  check(toolCatalog.status, 200, 'The tool catalogue is published');
  check(toolCatalog.json.tools.length > 0, true, 'The tool catalogue lists tools');
  for (const tool of toolCatalog.json.tools) {
    check(manifest.files.includes(`/assets/tools/${tool.file}`), true, `Tool bundle published: ${tool.id}`);
    if (!tool.thumb) continue;
    const bytes = await readFile(path.join(staticDir, 'assets', 'tools', tool.thumb));
    check(tool.thumb, `thumbs/${tool.id}-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.svg`, 'A tool card URL must change with its picture');
  }
  for (const route of ['/js/main.js', '/js/ui/account.js', '/scenes/nova.js', '/scenes/coral.js', '/tools/touchfx.js', '/tools/catalog.json', '/tools/lib/tape.js', '/js/tools/desk.js', '/css/style.css', '/css/tools.css', '/admin/admin.js', '/admin/admin.css', '/lib/admin-cli.js', '/server.js', '/package.json', '/asset-manifest.json', '/.env', '/.git/config', '/data/accounts.sqlite', '/run/secrets/youtube-proxy.conf', ...scripts.map(url => url + '.map')]) {
    check((await request(route)).status, 404, route);
  }
  // a page's file moves to the page's own address; the missing page is never a page of its own
  const pageFiles = new Set([...pageRoutes].map(route => `${route}.html`));
  for (const route of manifest.files) {
    const response = await request(route);
    check(response.status, route in manifest.memberScenes ? 401 : manifest.adminFiles.includes(route) || route === '/404.html' ? 404 : pageFiles.has(route) ? 301 : 200, route);
    if (pageFiles.has(route)) check(response.headers.location, route.slice(0, -5), `${route} moves to its address`);
    if (route in manifest.memberScenes) check(response.headers['cache-control'].includes('no-store'), true, route);
  }
  await checkPages(catalog, toolCatalog.json);
  const [sceneRoute, sceneId] = Object.entries(manifest.memberScenes)[0];
  const variants = [sceneRoute, sceneRoute + '?member=true', sceneRoute.replace('/scenes/', '//scenes/'), sceneRoute.replace('/scenes/', '%2fscenes%2f'), sceneRoute.replace('/assets/', '/assets/unused/../')];
  for (const route of variants) {
    check((await request(route)).status, 401, route);
    check((await request(route, { method: 'HEAD' })).status, 401, route);
  }
  check((await request(`/api/market/access?id=${sceneId}`)).status, 401);
  check((await request(sceneRoute, { cookie: 'visulaserz_session=forged; admin=true' })).status, 401);
  const user = await request('/api/auth/register', { method: 'POST', data: { name: 'Asset test', email: 'assets@example.invalid', password: 'Disposable-test-only-123!' } });
  check(user.status, 201);
  for (const route of Object.keys(manifest.memberScenes)) {
    const response = await request(route, { cookie: user.cookie });
    check(response.status, 200, route);
    check(response.headers['cache-control'], 'private, no-store', route);
    check(response.headers.vary, 'Cookie', route);
    check(response.text.includes('export'), true, route);
  }
  for (const route of variants) check((await request(route, { cookie: user.cookie })).status, 200, route);
  check((await request(`/api/market/access?id=${sceneId}`, { cookie: user.cookie })).json.allowed, true);
  check((await request('/api/market/access?id=made-up-scene', { cookie: user.cookie })).status, 404);
  check((await request(sceneRoute, { cookie: user.cookie, headers: { Origin: 'https://attacker.example' } })).status, 403);
  check((await request(sceneRoute, { cookie: user.cookie, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  check((await request(sceneRoute, { cookie: user.cookie, headers: { Host: 'attacker.example' } })).status, 421);
  const ranged = await request(sceneRoute, { cookie: user.cookie, headers: { Range: 'bytes=0-15' } });
  check(ranged.status, 206); check(ranged.headers['cache-control'], 'private, no-store');
  // the admin desk: a missing page to visitors and members, open to an account granted admin rights on the server
  check(manifest.adminFiles.length, 3, 'The admin desk is one page and two bundles');
  check(/^[a-f0-9]{12}$/.test(manifest.build.id), true, 'The build carries an id from its own bytes');
  const cli = (...args) => spawnSync(process.execPath, ['lib/admin-cli.js', ...args], { cwd: root, env: { ...process.env, DATA_DIR: directory }, encoding: 'utf8' });
  const deskPath = cli('where').stdout.trim().replace(/^https?:\/\/[^/]+/, '');
  check(/^\/desk-[a-f0-9]{24}$/.test(deskPath), true, 'The desk has a secret address');
  const desk = { 'X-Desk-Key': deskPath.slice('/desk-'.length) };
  for (const route of ['/admin', deskPath, ...manifest.adminFiles]) {
    check((await request(route)).status, 404, `${route} hidden from visitors`);
    check((await request(route, { cookie: user.cookie })).status, 404, `${route} hidden from members`);
  }
  check((await request('/api/admin/overview', { cookie: user.cookie, headers: desk })).status, 404, 'The admin API is hidden from members, key or not');
  check(cli('grant', 'assets@example.invalid').status, 0, 'Admin rights are granted from the server');
  for (const route of ['/admin', '/admin/index.html']) check((await request(route, { cookie: user.cookie })).status, 404, `${route} is a missing page for the admin too`);
  for (const route of [deskPath, ...manifest.adminFiles.slice(1)]) {
    const response = await request(route, { cookie: user.cookie });
    check(response.status, 200, `${route} open to the admin`);
    check(response.headers['cache-control'], 'private, no-store', route);
  }
  const deskPage = (await request(deskPath, { cookie: user.cookie })).text;
  for (const route of manifest.adminFiles.slice(1)) check(deskPage.includes(`"${route}"`), true, `The desk page loads ${route}`);
  check((await request('/api/admin/overview', { cookie: user.cookie })).status, 404, 'The admin API wants the address key as well as the session');
  check((await request('/api/admin/overview', { cookie: user.cookie, headers: desk })).status, 200, 'The admin API answers the admin at the desk');
  check((await request('/api/admin/system', { cookie: user.cookie, headers: desk })).json.build.id, manifest.build.id, 'The desk reports the build it runs');
  let limited;
  for (let i = 0; i < 241; i++) {
    limited = await request(sceneRoute, { cookie: user.cookie, method: 'HEAD' });
    if (limited.status === 429) break;
    check(limited.status, 200);
  }
  check(limited.status, 429); check(limited.headers['retry-after'], '60');
  check((await request('/api/auth/logout', { cookie: user.cookie, method: 'POST', data: {} })).status, 200);
  check((await request(sceneRoute, { cookie: user.cookie })).status, 401, 'Revoked sessions cannot fetch protected files');
  // the desk's refusal is the same missing page as any other, for a browser too
  const page404 = (await request('/no-such-page', { headers: { Accept: 'text/html' } })).text;
  for (const route of ['/admin', deskPath]) {
    const response = await request(route, { headers: { Accept: 'text/html' } });
    check([response.status, response.text], [404, page404], `${route} looks like any missing page`);
  }
  console.log(`PASS: ${count} checks — compiled assets, source isolation, all member scenes, tools, the site's pages and sitemap, the admin desk, URL variants, sessions, cache isolation and request limits.`);
} finally {
  if (child && child.exitCode === null) { const stopped = once(child, 'exit'); child.kill(); await stopped; }
  if (path.dirname(directory) === tmpdir() && path.basename(directory).startsWith('visulaserz-production-test-')) await rm(directory, { recursive: true, force: true });
}
