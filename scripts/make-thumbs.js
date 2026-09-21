// Renders the market's card pictures: public/scenes/thumbs/<id>.webp. `npm run thumbs`, then open
// the address it prints and leave the tab open until it says it is done.
//
// A scene is a shader, so its picture has to come from a GPU: the page below runs the app's own
// renderer on a small canvas, feeds every scene a few seconds of synthetic music (a steady kick,
// hats, a moving spectrum) so trails and beat effects have built up, and posts the frame back
// here. Pass scene ids to redo only those:  npm run thumbs -- koi garden
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const THUMBS = path.join(PUBLIC_DIR, 'scenes', 'thumbs');
const PORT = Number(process.env.PORT) || 4779;
const ONLY = process.argv.slice(2).filter((a) => /^[a-z0-9-]+$/.test(a));
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp' };

const PAGE = `<!doctype html><meta charset="utf-8"><title>thumbs</title>
<link href="https://fonts.googleapis.com/css2?family=Michroma&display=swap" rel="stylesheet">
<style>body{background:#07070b;color:#d3d0c7;font:14px system-ui;margin:20px}canvas{width:480px;height:270px;display:block;border:1px solid #333}#sheet{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}#sheet img{width:160px;height:90px}#sheet figure{margin:0;font-size:11px}</style>
<canvas id="c"></canvas><p id="status">starting…</p><div id="sheet"></div>
<script type="module">
import { Renderer } from '/js/gfx/renderer.js';
import { SceneRegistry } from '/js/gfx/registry.js';
import { PALETTES } from '/js/gfx/palettes.js';
import { SPECTRUM_BINS as N, HIST_W, HIST_H } from '/js/audio/analysis.js';

const only = ${JSON.stringify(ONLY)};
const status = document.getElementById('status');
const registry = new SceneRegistry();
await registry.refreshCatalog();
const renderer = new Renderer(document.getElementById('c'), registry);
renderer.look.hueDrift = false;
try { await document.fonts.load('78px Michroma'); } catch {}
const text = Object.assign(document.createElement('canvas'), { width: 1024, height: 256 });
const tc = text.getContext('2d');
tc.fillStyle = '#fff'; tc.textAlign = 'center'; tc.textBaseline = 'middle'; tc.font = '74px Michroma, sans-serif';
tc.fillText('VISULASERZ', 512, 128);
renderer.setText(text);
renderer.extra.uProgress = 0.62;

// A few seconds of music that never happened: 120 BPM, kick on the beat, hats on the off-beats.
function music() {
  const an = {
    texture: new Uint8Array(N * 6), history: new Uint8Array(HIST_W * HIST_H), historyFrac: 0, xyGain: 2.5,
    bass: 0, mid: 0, high: 0, level: 0, energy: 0.4, beat: 0, beatAge: 10, beatCount: 0, isBeat: false,
    bpm: 120, balance: 0, travel: 0, cruise: 0, cruiseRate: 0.9, time: 0,
  };
  const spectrum = new Float32Array(N), slow = new Float32Array(N), peaks = new Float32Array(N);
  let nextBeat = 0;
  an.step = (dt) => {
    an.time += dt;
    const t = an.time;
    an.isBeat = false;
    an.beatAge += dt;
    an.beat *= Math.exp(-dt / 0.16);
    if (t >= nextBeat) { nextBeat += 0.5; an.isBeat = true; an.beat = 1; an.beatAge = 0; an.beatCount++; an.travel += 0.1; }
    const kick = Math.exp(-an.beatAge * 7), hat = Math.exp(-((t * 2 + 0.5) % 1) * 9);
    let b = 0, m = 0, h = 0;
    for (let i = 0; i < N; i++) {
      const x = i / N;
      const body = 0.62 * Math.exp(-x * 2.4) + 0.1;
      const move = 0.5 + 0.5 * Math.sin(x * 23 + t * 2.1) * Math.sin(x * 7 - t * 1.3);
      const grain = 0.75 + 0.25 * Math.sin(i * 12.9898 + Math.floor(t * 30) * 78.233);
      const target = Math.min(1, (body * (0.55 + 0.6 * move) + (x < 0.14 ? 0.55 * kick : 0) + (x > 0.62 ? 0.3 * hat : 0)) * grain);
      spectrum[i] += (target - spectrum[i]) * (target > spectrum[i] ? 0.6 : 0.16);
      slow[i] += (spectrum[i] - slow[i]) * 0.03;
      peaks[i] = Math.max(peaks[i] - dt * 0.35, spectrum[i]);
      const w = (0.34 * Math.sin(x * 40 + t * 9) + 0.22 * Math.sin(x * 93 - t * 5) + 0.3 * kick * Math.sin(x * 12)) * 0.9;
      an.texture[i] = spectrum[i] * 255;
      an.texture[N + i] = (w * 0.5 + 0.5) * 255;
      an.texture[2 * N + i] = peaks[i] * 255;
      an.texture[3 * N + i] = slow[i] * 255;
      // left and right differ, as they do on a real mix: the vectorscope needs a figure to draw
      an.texture[4 * N + i] = ((0.5 * Math.sin(x * 40 + t * 9) + 0.3 * Math.sin(x * 93 - t * 5)) * 0.5 + 0.5) * 255;
      an.texture[5 * N + i] = ((0.5 * Math.sin(x * 40 + t * 9 + 0.9) + 0.3 * Math.sin(x * 71 + t * 3)) * 0.5 + 0.5) * 255;
      if (x < 0.14) b += spectrum[i]; else if (x < 0.55) m += spectrum[i]; else h += spectrum[i];
    }
    an.bass = Math.min(1, b / (N * 0.14) * 1.3); an.mid = Math.min(1, m / (N * 0.41) * 1.3); an.high = Math.min(1, h / (N * 0.45) * 1.6);
    an.level = an.bass * 0.45 + an.mid * 0.35 + an.high * 0.2;
    an.travel += dt * (0.35 + 1.5 * an.level);
    an.cruise += dt * an.cruiseRate;
    an.history.copyWithin(HIST_W, 0, HIST_W * (HIST_H - 1));
    for (let x = 0; x < HIST_W; x++) an.history[x] = spectrum[x * (N / HIST_W)] * 255;
  };
  return an;
}

const entries = registry.catalog.filter((e) => !only.length || only.includes(e.id));
const failed = [];
let done = 0;
for (const [i, entry] of entries.entries()) {
  status.textContent = document.title = 'thumbs ' + (i + 1) + '/' + entries.length + ' · ' + entry.id;
  try {
    const scene = await registry.load(entry.id);
    const problem = renderer.check(scene);
    if (problem) throw new Error(problem);
    renderer.setPalette(PALETTES[i % PALETTES.length].id);
    renderer.setScene(scene.id);
    renderer.fade = 1;
    const an = music();
    // Stop 0.12 s after a kick, on an even beat (some scenes only fire on those); long trails need longer to draw.
    const frames = scene.trails > 0.9 ? 637 : 217;
    for (let f = 0; f < frames; f++) { an.step(1 / 60); renderer.fade = 1; renderer.render(an, 1 / 60); }
    const blob = await new Promise((resolve) => renderer.canvas.toBlob(resolve, 'image/webp', 0.82));
    const res = await fetch('/__save?id=' + entry.id, { method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: blob });
    if (!res.ok) throw new Error('save failed: HTTP ' + res.status);
    const fig = document.createElement('figure');
    fig.innerHTML = '<img><figcaption></figcaption>';
    fig.firstChild.src = URL.createObjectURL(blob);
    fig.lastChild.textContent = entry.id + ' · ' + Math.round(blob.size / 1024) + ' KB';
    document.getElementById('sheet').append(fig);
    done++;
  } catch (e) {
    failed.push(entry.id + ': ' + e.message);
  }
  renderer.forget(entry.id);
  await new Promise((r) => setTimeout(r, 0));
}
await fetch('/__done', { method: 'POST' });
window.__thumbs = { done, failed };
status.textContent = document.title = 'thumbs done: ' + done + ' saved' + (failed.length ? ', failed → ' + failed.join(' | ') : '');
</script>`;

const local = (req) => [`127.0.0.1:${PORT}`, `localhost:${PORT}`].includes(req.headers.host) && (!req.headers.origin || req.headers.origin === `http://${req.headers.host}`);

http.createServer(async (req, res) => {
  try {
    if (!local(req)) { res.writeHead(403); return res.end(); }
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const p = decodeURIComponent(url.pathname);

    if (req.method === 'POST' && p === '/__save') {
      const id = url.searchParams.get('id') || '';
      if (!/^[a-z0-9-]+$/.test(id) || !fs.existsSync(path.join(PUBLIC_DIR, 'scenes', `${id}.js`))) { res.writeHead(400); return res.end(); }
      const chunks = [];
      let size = 0;
      for await (const c of req) { size += c.length; if (size > 400 * 1024) { res.writeHead(413); return res.end(); } chunks.push(c); }
      const body = Buffer.concat(chunks);
      if (body.subarray(0, 4).toString('latin1') !== 'RIFF' || body.subarray(8, 12).toString('latin1') !== 'WEBP') { res.writeHead(415); return res.end(); }
      await fsp.mkdir(THUMBS, { recursive: true });
      await fsp.writeFile(path.join(THUMBS, `${id}.webp`), body);
      console.log(`  ${id}.webp  ${Math.round(size / 1024)} KB`);
      res.writeHead(204);
      return res.end();
    }
    if (req.method === 'POST' && p === '/__done') {
      await import(`${pathToFileURL(path.join(ROOT, 'scripts', 'build-catalog.js')).href}?t=${Date.now()}`);
      res.writeHead(204);
      res.end();
      console.log('\nDone. You can close the tab and stop this script (Ctrl+C).');
      return;
    }
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    if (p === '/' || p === '/__thumbs') { res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }); return res.end(PAGE); }

    const filePath = path.normalize(path.join(PUBLIC_DIR, p));
    if (!filePath.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
    const data = await fsp.readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' || e.code === 'EISDIR' ? 404 : 500);
    res.end();
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Open http://localhost:${PORT} in a browser with WebGL2 and keep the tab in front.${ONLY.length ? `\nOnly: ${ONLY.join(', ')}` : ''}\n`));
