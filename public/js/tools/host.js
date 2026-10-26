import { el, clamp, store } from '../util.js';
import { Knob } from '../ui/knob.js';
import { makePad } from '../ui/pad.js';
import { registerSurface } from '../control/targets.js';

// What a tool is given: the music (a slot in the effects chain and the input after it), the beat
// clock, the analysis and the desk's own controls. A tool never reaches into the engine or into
// the page around its panel, so a plugin from the market can only do what this object allows.

const worklets = new WeakMap();   // ctx → Map(name → Promise): a processor is registered once per context
const noises = new WeakMap();     // ctx → a shared buffer of white noise
const playBuses = new WeakMap();  // chain → the bus every tool plays its own sound into
const musicHolds = new WeakMap(); // chain → Map(tool id → the level that tool wants the track at)

// What the tools play meets on one bus before it joins the mix, so a looper can record exactly
// that (your drums, your chords) without the track under it.
function playBus(engine) {
  const chain = engine.chain;
  if (!chain) return null;
  let bus = playBuses.get(chain);
  if (!bus) {
    bus = engine.ctx.createGain();
    bus.connect(chain.toolInput);
    playBuses.set(chain, bus);
  }
  return bus;
}
// Several tools may want the track quieter at once (a chop, a looper): the quietest wish wins,
// and the track comes back as each of them lets go.
function holdMusic(engine, id, level) {
  const chain = engine.chain;
  if (!chain) return;
  let holds = musicHolds.get(chain);
  if (!holds) { holds = new Map(); musicHolds.set(chain, holds); }
  if (level >= 1) holds.delete(id); else holds.set(id, Math.max(0, level));
  const want = Math.min(1, ...holds.values());
  chain.musicLevel.setTargetAtTime(want, engine.ctx.currentTime, 0.012);
}

export function createHost({ engine, analysis, clock, lcdShow, toast, reduceMotion, renderer }, tool, panel) {
  const disposers = [];
  const owned = [];               // the nodes the tool built for itself (audio.own), let go when it closes
  let disposed = false;
  let musicHeld = false;
  // after the slot's fade (it lets go of the tool 80 ms after a 5 ms fade), so nothing clicks
  function letGo() {
    if (!owned.length) return;
    const list = owned.splice(0);
    setTimeout(() => {
      for (const n of list) {
        try { n.stop?.(); } catch { /* never started, or already stopped */ }
        try { n.disconnect(); } catch { /* not connected */ }
        // a worklet's port stays tied to its processor, and its handler would keep the whole tool alive
        if (n.port) { n.port.onmessage = null; n.port.close(); }
      }
    }, 150);
  }
  const prefsKey = `tool:${tool.id}`;
  let prefs = store.get(prefsKey, {});
  if (!prefs || typeof prefs !== 'object') prefs = {};

  const audio = {
    get ctx() { return engine.ctx; },
    get ready() { return !!engine.chain; },
    get sampleRate() { return engine.ctx?.sampleRate ?? 48000; },
    // Creates (or wakes) the audio context. Only from a click or a key: browsers refuse otherwise.
    ensure() { return engine.ensureContext(); },
    // Runs fn once the effects chain exists: now, or when the first sound starts.
    whenReady(fn) {
      if (engine.chain) { fn(engine.ctx); return; }
      const once = () => { if (engine.chain) fn(engine.ctx); };
      engine.addEventListener('context', once, { once: true });
      disposers.push(() => engine.removeEventListener('context', once));
    },
    // Where a tool plays its own sound: the tools' bus, after the rack, through every tool slot.
    get input() { return playBus(engine); },
    // The same place, but past the bus a looper listens to: for a looper's own playback.
    get direct() { return engine.chain?.toolInput ?? null; },
    // The bus itself, to listen to what the tools are playing (a looper records it).
    get instruments() { return playBus(engine); },
    // Takes the track itself down to `level` (0 = gone) under what the tools play; 1 gives it back.
    muteMusic(level) {
      holdMusic(engine, tool.id, level);
      if (!musicHeld && level < 1) { musicHeld = true; disposers.push(() => holdMusic(engine, tool.id, 1)); }
    },
    // Puts an effect { input, output } into a slot. It must pass the music unchanged when it is
    // put in (its own dry path open); the slot fades over to it. Returns the undo. A slot is on
    // the whole mix, tools and all; with { music: true } it is on the track alone, so what the
    // tools play (pads, a microphone) goes past it untouched.
    insert(fx, { music = false } = {}) {
      if (!engine.chain) engine.ensureContext();
      const release = engine.chain.claimSlot(fx, { music });
      if (!release) {
        toast(music ? 'All three of the track’s effect slots are in use. Close a tool to free one.'
          : 'All eight effect slots are in use. Close a tool to free one.', { kind: 'error' });
        return () => {};
      }
      let done = false;
      const undo = () => { if (!done) { done = true; release(); } };
      disposers.push(undo);
      return undo;
    },
    // Registers an AudioWorklet processor from its source text (once per context and name).
    worklet(name, source) {
      const ctx = engine.ensureContext();
      let known = worklets.get(ctx);
      if (!known) { known = new Map(); worklets.set(ctx, known); }
      if (!known.has(name)) {
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        known.set(name, ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url)));
      }
      return known.get(name);
    },
    // Hands over the nodes a tool built for itself, to be let go when its panel closes: once its
    // slot has faded out, each is disconnected and a running source (an LFO, a noise loop) stopped.
    // Nodes wired to one another keep each other alive, so an island left connected would stay
    // in memory, and a source in it would go on running, for the rest of the visit. Returns the first.
    own(...nodes) { owned.push(...nodes.filter(Boolean)); if (disposed) letGo(); return nodes[0]; },
    // Two seconds of white noise, shared by every tool (risers, snares, hats, crackles).
    noise() {
      const ctx = engine.ensureContext();
      let buffer = noises.get(ctx);
      if (!buffer) {
        buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2), ctx.sampleRate);
        const d = buffer.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        noises.set(ctx, buffer);
      }
      return buffer;
    },
    // The spectrum of the music itself (before any effect or tool), in dB per bin, for a tool
    // that wants to listen: a key finder, a tuner. Returns null while nothing has played.
    spectrum() {
      const a = engine.beatAnalyser;
      if (!a) return null;
      const data = new Float32Array(a.frequencyBinCount);
      a.getFloatFrequencyData(data);
      return { data, binHz: engine.ctx.sampleRate / a.fftSize };
    },
  };

  // The desk's own controls, so every tool looks and behaves like the rest of the rack.
  const ui = {
    knob({ label, min = 0, max = 1, value = min, def = value, fmt, curve, origin, onChange }) {
      const format = fmt || ((v) => `${Math.round(((v - min) / (max - min)) * 100)}%`);
      return new Knob({ id: `${tool.id}-${label}`, label, min, max, def, value, curve, origin, fmt: format, onChange,
        onTouch: (k) => lcdShow(`${tool.name} ${label}`, format(k.value)) });
    },
    pad(opts) { return makePad(opts); },
    cycle({ label, options, index = 0, title, onChange }) {
      let i = clamp(index | 0, 0, options.length - 1);
      const value = el('span', { class: 'cycle-value' }, options[i]);
      const node = el('button', { class: 'cycle', type: 'button', title: title || `${label}: click to change, Shift-click to go back` },
        el('span', { class: 'cycle-label' }, label), value);
      const set = (next, quiet = false) => {
        i = (next + options.length) % options.length;
        value.textContent = options[i];
        if (!quiet) { lcdShow(`${tool.name} ${label}`, options[i]); onChange?.(i, options[i]); }
      };
      node.addEventListener('click', (e) => set(i + (e.shiftKey ? -1 : 1)));
      return { el: node, get index() { return i; }, set };
    },
    toggle({ label, on = false, title, onChange }) {
      let state = !!on;
      const node = el('button', { class: 'switch', type: 'button', title, 'aria-pressed': String(state) },
        el('span', { class: 'switch-track' }, el('span', { class: 'switch-thumb' })), el('span', { class: 'switch-label' }, label));
      const set = (v, quiet = false) => {
        state = !!v;
        node.setAttribute('aria-pressed', String(state));
        if (!quiet) { lcdShow(`${tool.name} ${label}`, state ? 'ON' : 'OFF'); onChange?.(state); }
      };
      node.addEventListener('click', () => set(!state));
      return { el: node, get on() { return state; }, set };
    },
    // Offers a touch surface to controllers (MIDI knobs, a gamepad stick, the hand in the air), so
    // Learn can map them onto it: api = { down(p), move(p), up() }, p = { x, y } from 0 to 1, y up.
    surface(node, api) { disposers.push(registerSurface(node, api)); },
    // A small labelled block, the way the rack groups its controls.
    group(legend, ...children) {
      return el('div', { class: 'tool-group' }, el('div', { class: 'group-legend' }, legend), el('div', { class: 'tool-group-body' }, ...children));
    },
  };

  // The picture: a tool can light it up on a hit, shock it on a drop, and bend it while it plays.
  // It goes through the renderer's own channel for tools, never through the beat detector.
  const visual = {
    hit: (strength = 1) => renderer?.hit(strength),
    shock: (amount = 1) => renderer?.shock(amount),
    // call every frame while bending: hue (turns of the colour wheel), warp (pull in, 0..0.3),
    // twist (radians), spin (radians a second, the trails swirl), slow (0..1: the picture's own
    // clock slows, and at 1 the motion stands still while it still pulses to the music)
    bend: (values) => renderer?.bend(values),
  };

  return {
    id: tool.id,
    name: tool.name,
    audio,
    ui,
    visual,
    el,
    clock,
    analysis,
    get reducedMotion() { return reduceMotion; },
    lcd: (label, value) => lcdShow(label, value),
    toast: (message, opts) => toast(message, opts),
    // Settings this tool keeps between visits (its program, its kit, its pattern).
    store: {
      get: (key, fallback) => (key in prefs ? prefs[key] : fallback),
      set: (key, value) => { prefs = { ...prefs, [key]: value }; store.set(prefsKey, prefs); },
    },
    // Lights the LED in the tool's header while it is changing the sound.
    setActive(on) { panel.classList.toggle('is-playing', !!on); },
    // A big tool (the Studio) can fill the window above the transport bar, and give it back.
    window: {
      maximize(on) { panel.dispatchEvent(new CustomEvent('vz-maximize', { detail: !!on })); },
      get maximized() { return panel.classList.contains('is-max'); },
    },
    // Keeps a drag on its element even when the pointer leaves it. A pointer can already be gone
    // by the time its pointerdown runs (a pen lifted, a touch cancelled), so a failure is not one.
    capture(node, e) { try { node.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ } },
    onDispose(fn) { disposers.push(fn); },
    dispose() {
      disposed = true;
      while (disposers.length) { try { disposers.pop()(); } catch (e) { console.warn(`[${tool.id}]`, e); } }
      letGo();
    },
  };
}
