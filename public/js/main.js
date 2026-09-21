import { AudioEngine } from './audio/engine.js';
import { AudioAnalysis } from './audio/analysis.js';
import { Renderer } from './gfx/renderer.js';
import { SceneRegistry } from './gfx/registry.js';
import { Director } from './gfx/director.js';
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

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  engine.tick(dt);
  analysis.update(dt);
  director.update(dt, analysis);
  renderer.render(analysis, dt);
  ui.tick(dt, analysis);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy in the console: visulaserz.analysis.bass, visulaserz.renderer.setScene('tunnel'), and for a
// scene that is not on the strip: await visulaserz.registry.load('orb'); visulaserz.renderer.setScene('orb')
window.visulaserz = { engine, analysis, renderer, registry, director, crate, lyrics: ui.lyrics, market: ui.market };
