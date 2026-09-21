import { el, clamp } from '../util.js';
import { FX_PARAMS, defaultFx } from '../audio/params.js';

// A vibe is one press that moves the whole rig: the sound, the scene, the palette, the
// lens and how loud the room is. It glides instead of snapping, because the jump-cut
// version feels like a settings change and the glide feels like the room changing.
//
// Only what a vibe names is touched. Anything it leaves out stays where the user put it,
// the same rule the sound presets and the look presets already follow.
export const VIBES = [
  {
    id: 'rainy-drive', name: 'Rainy night drive', scene: 'highway', palette: 'ice',
    fx: { speed: 0.9, reverbMix: 0.3, reverbSize: 4, reverbTone: 0.4, bass: 3, treble: -2, ambience: 0.5 },
    look: { bloom: 1.2, aberration: 0.5, grain: 0.45, scanlines: false, glitch: false, symmetry: 0 },
  },
  {
    id: 'lofi-3am', name: '3AM lofi', scene: 'cassette', palette: 'gold',
    fx: { speed: 0.92, muffle: 0.4, drive: 0.3, crackle: 0.5, bass: 4, treble: -6, reverbMix: 0.14, reverbSize: 1.6, ambience: 0.3 },
    look: { bloom: 0.75, aberration: 0.3, grain: 0.7, scanlines: true, glitch: false, symmetry: 0 },
  },
  {
    id: 'bosphorus', name: 'Bosphorus sunset', scene: 'bosphorus', palette: 'dusk',
    fx: { speed: 0.96, reverbMix: 0.22, reverbSize: 3.4, reverbTone: 0.62, bass: 2, ambience: 0.35 },
    look: { bloom: 1.15, aberration: 0.35, grain: 0.3, scanlines: false, glitch: false, symmetry: 0 },
  },
  {
    id: 'campfire', name: 'Campfire', scene: 'ember', palette: 'inferno',
    fx: { speed: 0.94, reverbMix: 0.26, reverbSize: 2.8, reverbTone: 0.32, muffle: 0.18, bass: 3, treble: -3, ambience: 0.55 },
    look: { bloom: 1.0, aberration: 0.2, grain: 0.4, scanlines: false, glitch: false, symmetry: 0 },
  },
  {
    id: 'deep-blue', name: 'Deep blue', scene: 'abyss', palette: 'ice',
    fx: { speed: 0.88, muffle: 0.55, reverbMix: 0.42, reverbSize: 5.5, reverbTone: 0.25, orbit: 0.5, orbitRate: 0.08, ambience: 0.4 },
    look: { bloom: 1.1, aberration: 0.45, grain: 0.22, scanlines: false, glitch: false, symmetry: 0 },
  },
  {
    id: 'tokyo', name: 'Tokyo neon', scene: 'neon', palette: 'miami',
    fx: { speed: 1, treble: 2, reverbMix: 0.12, reverbSize: 1.4, ambience: 0.25 },
    look: { bloom: 1.35, aberration: 1.2, grain: 0.3, scanlines: false, glitch: true, symmetry: 0 },
  },
  {
    id: 'cappadocia', name: 'Cappadocia dawn', scene: 'cappadocia', palette: 'gold',
    fx: { speed: 0.95, reverbMix: 0.3, reverbSize: 4.4, reverbTone: 0.7, ambience: 0.35 },
    look: { bloom: 1.2, aberration: 0.25, grain: 0.25, scanlines: false, glitch: false, symmetry: 0, reduceFlashing: true },
  },
  {
    id: 'club', name: 'Club', scene: 'lasers', palette: 'laser',
    fx: { bass: 9, drive: 0.15, echoMix: 0.12, echoTime: 0.3, echoFeedback: 0.35, ambience: 0.15 },
    look: { bloom: 1.05, aberration: 1.3, grain: 0.3, scanlines: false, glitch: true, symmetry: 0 },
  },
];

const GLIDE = 2.4;       // seconds for a vibe to arrive
const SNAP_THRESHOLD = 0.6; // below this the fader is "at" a vibe

export function buildVibes({ engine, renderer, registry, selectScene, selectPalette, refreshLook, toast, lcdShow, saveSettings }) {
  let glide = null;
  let active = null;

  // Look values are plain numbers on renderer.look; switches are booleans and cannot be
  // half-on, so they land at the start of the glide while the numbers travel.
  const LOOK_NUMBERS = ['bloom', 'aberration', 'grain'];

  function start(vibe) {
    const fxFrom = {};
    const fxTo = {};
    // Everything a vibe does not mention returns to its default, so vibes cannot stack
    // into a soup of leftovers from the last one — the same contract as FX_PRESETS.
    const target = { ...defaultFx(), ...vibe.fx };
    for (const id of Object.keys(FX_PARAMS)) {
      fxFrom[id] = engine.fx[id];
      fxTo[id] = clamp(target[id], FX_PARAMS[id].min, FX_PARAMS[id].max);
    }
    const lookFrom = {};
    const lookTo = {};
    for (const id of LOOK_NUMBERS) {
      if (vibe.look?.[id] === undefined) continue;
      lookFrom[id] = renderer.look[id];
      lookTo[id] = vibe.look[id];
    }
    // Booleans and the symmetry mode cannot be interpolated: apply them at once.
    for (const [id, v] of Object.entries(vibe.look || {})) {
      if (!LOOK_NUMBERS.includes(id)) renderer.look[id] = v;
    }
    glide = { fxFrom, fxTo, lookFrom, lookTo, t: 0 };

    if (vibe.palette) selectPalette(vibe.palette);
    if (vibe.scene) {
      // Scenes are market plugins, so the one a vibe wants may not be installed yet.
      registry.install(vibe.scene)
        .then(() => selectScene(vibe.scene))
        .catch(() => toast(`The ${vibe.name} scene could not be loaded; the sound still changed.`));
    }
    refreshLook();
    active = vibe.id;
    setActive();
    lcdShow('vibe', vibe.name.toUpperCase());
  }

  const row = el('div', { class: 'keys', role: 'group', 'aria-label': 'Vibes' });
  for (const vibe of VIBES) {
    const btn = el('button', { class: 'key', type: 'button', title: `${vibe.name}: sound, scene, palette and lens together`, onclick: () => start(vibe) },
      el('span', { class: 'led' }), el('span', {}, vibe.name));
    btn.dataset.vibe = vibe.id;
    row.append(btn);
  }
  function setActive() {
    row.querySelectorAll('.key').forEach((b) => {
      const on = b.dataset.vibe === active;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  // Any hand-turned knob means the user has left the vibe: stop claiming it is on.
  engine.addEventListener('fxchange', (e) => {
    if (glide || !active || e.detail?.id === '*') return;
    active = null;
    setActive();
  });

  return {
    node: row,
    step(dir) {
      const i = VIBES.findIndex((v) => v.id === active);
      start(VIBES[(i + dir + VIBES.length) % VIBES.length] || VIBES[0]);
    },
    tick(dt) {
      if (!glide) return;
      glide.t += dt / GLIDE;
      const k = Math.min(1, glide.t);
      const ease = k * k * (3 - 2 * k);
      const fx = {};
      for (const id of Object.keys(glide.fxTo)) fx[id] = glide.fxFrom[id] + (glide.fxTo[id] - glide.fxFrom[id]) * ease;
      engine.setMany(fx, { silent: true });
      for (const id of Object.keys(glide.lookTo)) renderer.look[id] = glide.lookFrom[id] + (glide.lookTo[id] - glide.lookFrom[id]) * ease;
      if (k >= 1) {
        glide = null;
        refreshLook();
        saveSettings?.();
      }
    },
  };
}
