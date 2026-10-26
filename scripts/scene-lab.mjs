// Local-only visual and audio regression harness. Uses the real WebGL renderer.
// Run: node scripts/scene-lab.mjs, then open the printed URL in a WebGL2 browser.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const port = 4781;
const requested = process.argv.slice(2).filter(id => /^[a-z0-9-]+$/.test(id));
const ids = requested.length ? requested : ['ink', 'nazar', 'kilim', 'pool', 'murmuration', 'lale', 'frost', 'garden', 'meadow', 'sema', 'koi', 'cappadocia'];
const page = `<!doctype html><meta charset="utf-8"><title>VISULASERZ scene studio</title>
<style>*{box-sizing:border-box}body{margin:24px;background:#080c13;color:#eee;font:14px system-ui}header{display:flex;gap:16px;align-items:center;margin-bottom:16px}h1{font-size:20px;letter-spacing:3px}button,select{background:#1a2636;border:1px solid #34465b;color:white;padding:8px;border-radius:6px}canvas{display:block;width:960px;height:540px;max-width:none}#sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:1440px}figure{margin:0;background:#111722;border-radius:8px;overflow:hidden}img{width:100%;display:block}figcaption{padding:9px 12px;letter-spacing:2px;text-transform:uppercase}#status{color:#9eb5ce}body.gallery canvas{display:none}body.gallery #status{margin-bottom:20px}</style>
<header><h1>VISULASERZ / SCENE STUDIO</h1><select id="scene">${ids.map(id => `<option>${id}</option>`).join('')}</select><select id="mode"><option>music</option><option>silent</option><option>bass</option><option>mid</option><option>high</option></select><button id="play">Play / pause</button><button id="check">Check all</button><button id="gallery">Gallery</button></header><p id="status">Loading</p><canvas id="canvas"></canvas><div id="sheet"></div>
<script type="module">
import { Renderer } from '/js/gfx/renderer.js';
import { SceneRegistry, normalise } from '/js/gfx/registry.js';
const ids = ${JSON.stringify(ids)};
const registry = new SceneRegistry();
const errors = [];
const renderer = new Renderer(document.getElementById('canvas'), registry, { onSceneError: (...e) => errors.push(e) });
renderer.look.hueDrift = false; renderer.look.grain = 0; renderer.look.aberration = 0.15; renderer.look.bloom = 0.55;
for (const id of ids) {
  const scene = normalise((await import('/scenes/' + id + '.js')).default);
  registry.loaded.set(id, scene);
}
let playing = false, clock = 0, last = 0;
function music(mode = 'music', active = true, t = 8.12) {
  const age = t % 0.5, beat = Math.exp(-age / 0.16);
  const an = { active, bass: 0, mid: 0, high: 0, level: 0, energy: 0.4, beat: 0, beatAge: age, beatCount: Math.floor(t * 2), balance: 0, travel: t * 1.1, cruise: t * 0.8, cruiseRate: 0.8, historyFrac: 0, xyGain: 2.5, texture: new Uint8Array(512 * 6), history: new Uint8Array(128 * 128) };
  an.texture.fill(128, 512, 1024); an.texture.fill(128, 2048);
  if (mode === 'music') { an.bass = 0.25 + 0.50 * beat; an.mid = 0.35 + 0.15 * Math.sin(t * 1.7); an.high = 0.22 + 0.3 * Math.exp(-((t + 0.25) % 0.5) * 12); an.beat = beat; }
  else if (mode !== 'silent') an[mode] = 0.8;
  an.level = an.bass * 0.45 + an.mid * 0.35 + an.high * 0.2;
  for (let i = 0; i < 512; i++) {
    const band = i < 72 ? an.bass : i < 282 ? an.mid : an.high;
    an.texture[i] = band * (0.65 + 0.35 * Math.sin(i * 0.09 + t) ** 2) * 255;
    an.texture[1024 + i] = an.texture[1536 + i] = an.texture[i];
    an.texture[512 + i] = 128 + 90 * Math.sin(i * 0.08 + t) * an.level;
  }
  return an;
}
function dimensions(w, h) {
  renderer.canvas.style.width = w + 'px'; renderer.canvas.style.height = h + 'px'; renderer.needsResize = true;
}
async function reset(id) {
  renderer.setScene('nova'); renderer.fade = 1; renderer.render(music('silent'), 1 / 60);
  renderer.setScene(id); renderer.fade = 1; renderer.clearTrails = true;
  renderer.time = 8.12; renderer.hue = 0;
}
async function frame(id, mode = 'music', active = true, w = 640, h = 360) {
  dimensions(w, h); await reset(id);
  const problem = renderer.check(registry.loaded.get(id));
  if (problem) throw Error(id + ': ' + problem);
  const frames = id === 'ink' ? 240 : 3;
  for (let f = 0; f < frames; f++) {
    renderer.fade = 1;
    renderer.render(music(mode, active, id === 'ink' ? 4.12 + f / 60 : 8.12), 1 / 60);
    if (f % 24 === 23 && f < frames - 1) { renderer.gl.finish(); await new Promise(r => setTimeout(r, 0)); }
  }
  renderer.gl.finish();
  const pixels = new Uint8Array(renderer.canvas.width * renderer.canvas.height * 4);
  renderer.gl.readPixels(0, 0, renderer.canvas.width, renderer.canvas.height, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, pixels);
  const image = renderer.canvas.toDataURL('image/webp', 0.92);
  return { pixels, image };
}
function difference(a, b) {
  let sum = 0, changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    sum += d; if (d > 6) changed++;
  }
  return { mean: +(sum / (a.length / 4) / 3).toFixed(3), changed: +(changed / (a.length / 4)).toFixed(4) };
}
function addImage(id, image) {
  const fig = document.createElement('figure'), img = document.createElement('img'), cap = document.createElement('figcaption');
  img.src = image; cap.textContent = id; fig.append(img, cap); document.getElementById('sheet').append(fig);
}
async function gallery() {
  playing = false; document.body.classList.remove('gallery'); document.getElementById('sheet').textContent = '';
  const failed = [];
  for (const id of ids) {
    document.getElementById('status').textContent = 'Rendering ' + id;
    try { const result = await frame(id); addImage(id, result.image); } catch (e) { failed.push(e.message); }
    await new Promise(r => setTimeout(r, 0));
  }
  document.body.classList.add('gallery'); document.getElementById('status').textContent = failed.length ? failed.join(' | ') : '${ids.length} scenes rendered with the production graphics engine';
  return { failed, errors };
}
async function check() {
  playing = false; document.body.classList.remove('gallery');
  const results = [];
  for (const id of ids) {
    document.getElementById('status').textContent = 'Audio regression: ' + id;
    try {
      const base = await frame(id, 'silent', true, 320, 180);
      const row = { id };
      for (const mode of ['bass', 'mid', 'high']) row[mode] = difference(base.pixels, (await frame(id, mode, true, 320, 180)).pixels);
      const off = await frame(id, 'silent', false, 320, 180);
      row.idle = difference(off.pixels, (await frame(id, 'music', false, 320, 180)).pixels);
      row.pass = ['bass', 'mid', 'high'].every(band => row[band].mean > 0.005 && row[band].changed > 0.0001) && row.idle.mean === 0;
      results.push(row);
    } catch (e) { results.push({ id, error: e.message }); }
    await new Promise(r => setTimeout(r, 0));
  }
  window.results = results; document.getElementById('status').textContent = JSON.stringify(results);
  return { passed: results.length === ids.length && results.every(row => row.pass) && !errors.length, results, errors };
}
async function select() {
  playing = false; document.body.classList.remove('gallery'); dimensions(960, 540);
  await reset(document.getElementById('scene').value);
  renderer.render(music(document.getElementById('mode').value), 1 / 60);
}
document.getElementById('scene').onchange = select;
document.getElementById('mode').onchange = select;
document.getElementById('play').onclick = () => { playing = !playing; };
document.getElementById('gallery').onclick = gallery;
document.getElementById('check').onclick = check;
function animate(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (playing) { clock += dt; renderer.fade = 1; renderer.render(music(document.getElementById('mode').value, true, clock + 8.12), dt); }
  requestAnimationFrame(animate);
}
window.lab = { renderer, registry, errors, frame, gallery, check, music, dimensions, reset, addImage };
await select(); requestAnimationFrame(animate);
document.getElementById('status').textContent = 'Ready';
</script>`;
const mime = { '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp' };
http.createServer(async (req, res) => {
  try {
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host)) { res.writeHead(403); return res.end(); }
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    const pathname = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
    if (pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(page); }
    const file = path.resolve(publicDir, '.' + pathname);
    if (!file.startsWith(publicDir + path.sep)) { res.writeHead(403); return res.end(); }
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Scene studio: http://localhost:${port}`));
