import fs from 'node:fs/promises';

export async function readProductionAssets(file) {
  if (!file) return null;
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
  const validPath = value => typeof value === 'string' && /^\/[A-Za-z0-9_./-]+$/.test(value)
    && !value.includes('//') && !value.split('/').some(part => part.startsWith('.'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length
      || !manifest.files.every(validPath) || !manifest.memberScenes || typeof manifest.memberScenes !== 'object') throw new Error('Invalid production asset manifest.');
  const allowed = new Set(manifest.files);
  const memberScenes = new Map(Object.entries(manifest.memberScenes));
  for (const [route, id] of memberScenes) {
    if (!allowed.has(route) || !/^[a-z0-9-]{1,40}$/.test(id) || route !== `/assets/scenes/${id}.js`) throw new Error('Invalid protected scene manifest.');
  }
  // The admin desk's page and its two bundles: served to admins only (lib/public-host.js).
  const adminFiles = new Set(manifest.adminFiles || []);
  for (const route of adminFiles) {
    if (!allowed.has(route) || !(route === '/admin/index.html' || /^\/assets\/admin-[A-Z0-9]+\.(js|css)$/.test(route))) throw new Error('Invalid admin asset manifest.');
  }
  // The site's pages, by the address they answer at: /scene/koi is the file /scene/koi.html.
  const pages = new Set(manifest.pages || []);
  for (const route of pages) {
    if (!/^\/[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(route) || !allowed.has(`${route}.html`)) throw new Error('Invalid page manifest.');
  }
  const build = manifest.build && typeof manifest.build === 'object' ? manifest.build : null;
  return { allowed, memberScenes, memberIds: new Set(memberScenes.values()), adminFiles, pages, build };
}
