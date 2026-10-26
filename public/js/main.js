import { AudioEngine } from './audio/engine.js';
import { AudioAnalysis } from './audio/analysis.js';
import { Renderer } from './gfx/renderer.js';
import { SceneRegistry } from './gfx/registry.js';
import { Director } from './gfx/director.js';
import { Pacer } from './gfx/pacer.js';
import { Crate } from './ui/crate.js';
import { buildUI } from './ui/ui.js';
import { store } from './util.js';

const canvas = document.getElementById('stage');
const engine = new AudioEngine();
const analysis = new AudioAnalysis(engine);

// Scenes are plugins: only the ones on the strip are fetched before the show starts.
const registry = new SceneRegistry();
await registry.init();

let ui = null;
let renderer;
try {
  renderer = new Renderer(canvas, registry, {
    onSceneError: (name, message) => {
      console.error(`[${name}]`, message);
      if (name === 'Graphics' && renderer?.scene?.custom) store.set('probation', renderer.sceneId);   // do not restart into the shader that did this
      ui?.toast(name === 'Graphics' ? message : `The ${name} scene could not start on this graphics card.`, { kind: 'error', timeout: 8000 });
    },
  });
} catch (e) {
  document.getElementById('fatal').hidden = false;
  document.getElementById('fatal-msg').textContent = e.message;
  throw e;
}

const director = new Director(renderer, registry);
const crate = new Crate(engine);
ui = buildUI({ engine, analysis, renderer, registry, director, crate });
crate.init();
renderer.warmUp();

// The beat detector, the loops and the tools run on every animation frame; the picture is drawn
// when the pacer says so (every frame on a computer, 30 a second on a phone: see pacer.js), and
// not at all while a drawer covers the whole stage.
const pacer = new Pacer(renderer, engine);
let last = performance.now();
let lastDraw = last;
let covered = false;
function frame(now) {
  requestAnimationFrame(frame);
  if (renderer.busy) return;                                        // a take is being rendered: the live show waits
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  engine.tick(dt);
  analysis.update(dt);
  director.update(dt, analysis);
  ui.tickLogic(dt, analysis);
  if (ui.stageCovered) { covered = true; return; }
  if (covered) { covered = false; pacer.lastDraw = now; }          // the gap behind a drawer is not a slow frame
  if (!pacer.due(now)) return;
  const drawDt = Math.min(0.1, Math.max(0.001, (now - lastDraw) / 1000));
  lastDraw = now;
  pacer.begin();
  renderer.render(analysis, drawDt);
  pacer.end();
  ui.tickVisual(drawDt, analysis);
}
requestAnimationFrame(frame);

// Out of sight (screen locked, another app or tab in front) the browser stops animation frames, but
// the song plays on, and the loops, the ramps, the tools' beat clock and the queue run on the frame
// tick. Ten slow ticks a second keep them going without drawing anything. The beat detector is left
// alone, so the tempo it last heard holds. On iOS the stand-in plays and Web Audio rests: nothing to do.
let hidden = 0;
document.addEventListener('visibilitychange', () => {
  clearInterval(hidden);
  last = lastDraw = performance.now();
  pacer.lastDraw = last;
  if (!document.hidden) return;
  hidden = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.25, Math.max(0.001, (now - last) / 1000));
    last = now;
    if (engine.standIn) return;
    engine.tick(dt);
    ui.tickLogic(dt, analysis);
  }, 100);
});

// Handy in the console: visulaserz.analysis.bass, visulaserz.renderer.setScene('tunnel'), and for a
// scene that is not on the strip: await visulaserz.registry.load('orb'); visulaserz.renderer.setScene('orb')
// `ui` is here so time-based work (vibe glides, the XY spring, tempo sync) can be stepped
// by hand from the console: a background tab throttles requestAnimationFrame, so waiting
// for the real loop proves nothing. ui.tick(1/60, analysis) advances exactly one frame.
if (typeof __VZ_PRODUCTION__ === 'undefined' || !__VZ_PRODUCTION__) {
  window.visulaserz = { engine, analysis, renderer, registry, director, crate, ui, lyrics: ui.lyrics, market: ui.market, desk: ui.desk, tools: ui.tools, pacer };
}
