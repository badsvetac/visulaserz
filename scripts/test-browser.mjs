// The browser test: a real Chrome (its own throwaway profile, never yours) drives the running app the
// way a person would, over a song, and checks what only a browser can show: every tool opened and
// closed without the sound dropping out, the Studio worked end to end, every scene compiling, and the
// sound watchdog catching a cut on purpose. Nothing reaches the speakers: the master is disconnected
// and listened to instead.
//
//   npm run test:browser                          everything, against http://localhost:4777/
//   npm run test:browser -- http://localhost:4778/ --only=scenes --scenes=koi,frost
//
// Needs the server running and Chrome installed (CHROME=path overrides where it is looked for).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const url = args.find((a) => /^https?:/.test(a)) || 'http://localhost:4777/';
const only = (args.find((a) => a.startsWith('--only='))?.slice(7) || 'tools,studio,scenes,watchdog').split(',');
const sceneIds = args.find((a) => a.startsWith('--scenes='))?.slice(9).split(',').filter(Boolean) || null;
const CHROME = process.env.CHROME || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));
if (!CHROME) { console.error('Chrome was not found. Set CHROME to its path.'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = 9300 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(path.join(os.tmpdir(), 'vz-browser-test-'));
const chrome = spawn(CHROME, [
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check',
  '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--window-size=1400,900', url,
], { stdio: 'ignore' });

let failures = 0;
const fail = (what) => { failures++; console.log(`  FAIL  ${what}`); };
const pass = (what) => console.log(`  ok    ${what}`);

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page' && t.url.startsWith(url.slice(0, 16)));
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Chrome did not open its debugging port');
}

const ws = new WebSocket(await connect());
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0;
const waiting = new Map();
const errors = [];
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise((r) => { const n = ++seq; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
await send('Runtime.enable');
const run = async (body) => {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
// a real click (trusted input, so it counts as a gesture) in the middle of the first visible match
async function click(selector, text = '') {
  const at = await run(`const n = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.trim().includes(${JSON.stringify(text)}) && e.getClientRects().length);
    if (!n) return null; n.scrollIntoView({ block: 'nearest' }); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  if (!at) throw new Error(`nothing to click: ${selector} ${text}`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
  await sleep(40);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
}
const newErrors = (from) => errors.slice(from).filter((e) => !/Failed to load resource/.test(e || ''));

try {
  for (let i = 0; i < 80; i++) { if (await run('return !!window.visulaserz?.engine && window.visulaserz.tools.catalog.length > 0;')) break; await sleep(250); }
  await sleep(800);
  await run(`const v = window.visulaserz; for (const id of v.desk.openIds) v.desk.close(id); return true;`);
  await click('#crate-close');
  // a test song made on the spot (a kick on every beat, a chord, a hat), so no library is needed
  const setup = await run(`
    const v = window.visulaserz, e = v.engine, ctx = e.ensureContext();
    await new Promise((r) => setTimeout(r, 400));
    e.setVolume(0.85);
    try { e.master.disconnect(ctx.destination); } catch {}
    const sr = 48000, secs = 40, off = new OfflineAudioContext(2, sr * secs, sr);
    for (const f of [220, 261.6, 329.6]) { const o = off.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = off.createGain(); g.gain.value = 0.05; o.connect(g).connect(off.destination); o.start(); }
    for (let b = 0; b < secs * 2; b++) { const t = b * 0.5; const k = off.createOscillator(); k.frequency.setValueAtTime(140, t); k.frequency.exponentialRampToValueAtTime(45, t + 0.12); const kg = off.createGain(); kg.gain.setValueAtTime(0.7, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.3); k.connect(kg).connect(off.destination); k.start(t); k.stop(t + 0.32); }
    const buf = await off.startRendering(), n = buf.length, ab = new ArrayBuffer(44 + n * 4), dv = new DataView(ab);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    const fin = ctx.createAnalyser(); fin.fftSize = 2048; e.master.connect(fin);
    const b = new Float32Array(2048);
    window.__lvl = () => { fin.getFloatTimeDomainData(b); let s = 0; for (const x of b) s += x * x; return 10 * Math.log10(s / b.length + 1e-12); };
    e.el.loop = true;
    e.load({ title: '__test browser song', artist: 'Visulaserz', url: URL.createObjectURL(new Blob([ab], { type: 'audio/wav' })), id: '__test-browser' });
    await new Promise((r) => setTimeout(r, 2500));
    return { rate: ctx.sampleRate, playing: !e.el.paused, chrome: navigator.userAgent.match(/Chrome\\/[\\d.]+/)?.[0] };`);
  console.log(`${setup.chrome} · audio at ${setup.rate} Hz · ${url}`);
  if (!setup.playing) fail('the test song does not play');

  // what one stretch of time did to the sound: silence at the very end, dropped buffers, watchdog reports
  const watch = (body, ms) => run(`
    const v = window.visulaserz, e = v.engine, ctx = e.ctx;
    const ps0 = ctx.playbackStats?.underrunEvents ?? 0, inc0 = v.ui.sound.incidents.length, L = [];
    const iv = setInterval(() => L.push(window.__lvl()), 20);
    let err = null;
    try { ${body} } catch (x) { err = String(x).slice(0, 200); }
    await new Promise((r) => setTimeout(r, ${ms}));
    clearInterval(iv);
    return { err, silent: L.filter((x) => x < -70).length, underruns: (ctx.playbackStats?.underrunEvents ?? 0) - ps0, incidents: v.ui.sound.incidents.slice(inc0).map((i) => i.why), playing: !e.el.paused };`);
  // the same, around something done from out here (a real click)
  const begin = () => run(`const v = window.visulaserz, e = v.engine;
    window.__mark = { ps: e.ctx.playbackStats?.underrunEvents ?? 0, inc: v.ui.sound.incidents.length, L: [] };
    window.__markIv = setInterval(() => window.__mark.L.push(window.__lvl()), 20); return true;`);
  const end = () => run(`clearInterval(window.__markIv); const v = window.visulaserz, e = v.engine, m = window.__mark;
    return { err: null, silent: m.L.filter((x) => x < -70).length, underruns: (e.ctx.playbackStats?.underrunEvents ?? 0) - m.ps, incidents: v.ui.sound.incidents.slice(m.inc).map((i) => i.why), playing: !e.el.paused };`);
  const judge = (label, r, from) => {
    const errs = newErrors(from);
    const problems = [r.err, r.silent > 2 && `${r.silent} silent moments`, r.underruns > 0 && `${r.underruns} dropped buffers`, ...r.incidents, !r.playing && 'the song stopped', ...errs].filter(Boolean);
    if (problems.length) fail(`${label}: ${problems.join(' · ')}`); else pass(label);
  };

  if (only.includes('tools')) {
    console.log('\nTools');
    const ids = await run('return window.visulaserz.tools.catalog.map((t) => t.id);');
    for (const id of ids) {
      const from = errors.length;
      const r = await watch(`await v.desk.open(${JSON.stringify(id)}); await new Promise((r) => setTimeout(r, 1500)); v.desk.close(${JSON.stringify(id)});`, 600);
      judge(`${id} opens and closes over the song`, r, from);
    }
  }

  if (only.includes('studio')) {
    console.log('\nStudio');
    await run(`window.__downloads = []; const c = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__downloads.push(this.download); return; } return c.call(this); }; return true;`);
    const hint = (h) => click(`.vz-studio button[data-hint^="${h}"]`);
    let from = errors.length;
    await click('.tab[data-unit="perform"]');
    await sleep(300);
    await begin();
    await click('.tool-tray .key', 'Studio');
    await sleep(1500);
    judge('opens from the Perform rack without touching the song', await end(), from);
    from = errors.length;
    for (const w of ['Channel rack', 'Piano roll', 'Mixer', 'Drum pads']) { await hint(w); await sleep(250); }
    judge('its four windows open', await watch('', 300), from);
    from = errors.length;
    await hint('Play or pause'); await sleep(2500); await hint('Stop, and go back');
    await hint('Song mode'); await hint('Play or pause'); await sleep(3000); await hint('Stop, and go back'); await hint('Pattern mode');
    judge('plays its pattern and its song', await watch('', 300), from);
    from = errors.length;
    for (const f of ['Instruments', 'Drums', 'Synth presets', 'Effects']) await run(`[...document.querySelectorAll('.vz-studio .st2-node.is-folder')].find((x) => x.textContent.trim() === ${JSON.stringify(f)} && !x.classList.contains('is-open'))?.click(); return true;`);
    for (const item of ['3-Osc Synth', 'Drum Synth', 'Sampler', 'Slicer', 'Snare', 'Reese', 'Parametric EQ', 'Delay', 'Reverb', 'Sidechain']) { await click('.vz-studio .st2-node', item); await sleep(200); }
    for (let i = 0; i < 4; i++) { await hint('Undo'); await sleep(100); }
    for (let i = 0; i < 2; i++) { await hint('Redo'); await sleep(100); }
    await hint('Play or pause'); await sleep(2500); await hint('Stop, and go back');
    judge('instruments, effects, undo and redo, played', await watch('', 300), from);
    from = errors.length;
    await hint('Save the project'); await sleep(300);
    await hint('Export as a WAV'); await sleep(300);
    await click('.st2-menu', 'The song');
    await sleep(6000);
    const files = await run('return window.__downloads;');
    if (files.length === 2) pass('saves a project and exports the song as WAV'); else fail(`downloads: ${JSON.stringify(files)}`);
    await hint('Fill the window'); await sleep(500); await hint('Fill the window'); await sleep(500);
    judge('closes after all that', await watch(`v.desk.close('studio');`, 800), from);
  }

  if (only.includes('scenes')) {
    console.log('\nScenes');
    const ids = sceneIds || await run('return window.visulaserz.registry.catalog.map((e) => e.id);');
    let good = 0;
    for (const id of ids) {
      const from = errors.length;
      const r = await run(`
        const v = window.visulaserz, id = ${JSON.stringify(id)};
        let scene = null;
        try { scene = await v.registry.load(id, { prompt: false }); } catch (x) { return 'it does not load: ' + String(x).slice(0, 160); }
        if (!scene) return 'it does not load';
        const ok = await v.renderer.ready(scene);
        v.renderer.setScene(id);
        await new Promise((r) => setTimeout(r, 700));
        if (!ok || v.renderer.failed.has(id)) return 'its shader does not compile';
        return v.renderer.sceneId === id ? '' : 'it is not shown';`);
      const errs = newErrors(from);
      if (r || errs.length) fail(`${id}: ${[r, ...errs].filter(Boolean).join(' · ')}`); else good++;
    }
    pass(`${good} of ${ids.length} scenes load, compile and show`);
  }

  if (only.includes('watchdog')) {
    console.log('\nWatchdog');
    const r = await run(`
      const v = window.visulaserz, e = v.engine, n0 = v.ui.sound.incidents.length, g = e.monitor.gain;
      g.cancelScheduledValues(0); g.value = 0;
      await new Promise((r) => setTimeout(r, 2000));
      g.value = 1;
      return v.ui.sound.incidents.slice(n0).map((i) => i.kind);`);
    if (r.includes('silent')) pass('reports a cut made on purpose, with where it happened'); else fail(`the watchdog missed a cut: ${JSON.stringify(r)}`);
  }
} catch (e) {
  fail(`the test stopped: ${e.message}`);
} finally {
  try { await send('Browser.close'); } catch { /* gone */ }
  setTimeout(() => { chrome.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ } }, 1200);
}
console.log(failures ? `\n${failures} problem${failures > 1 ? 's' : ''}.` : '\nAll clear.');
setTimeout(() => process.exit(failures ? 1 : 0), 1500);
