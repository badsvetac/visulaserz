// The effects a mixer insert can carry in its slots. Each one is a small graph with an input and
// an output, built against any BaseAudioContext (so a song renders offline with them), and set()
// takes its settings as the plain numbers its window shows. The delay keeps time with the song;
// the sidechain ducks on every kick.

const pct = (v) => `${Math.round(v * 100)}%`;
const dB = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;
const hz = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} kHz` : `${Math.round(v)} Hz`);
const sec = (v) => `${v.toFixed(1)} s`;
const ms = (v) => `${Math.round(v * 1000)} ms`;

export const DELAY_TIMES = [['1/16', 1], ['1/8', 2], ['3/16', 3], ['1/4', 4], ['3/8', 6], ['1/2', 8]];

export const FX = [
  { id: 'eq', name: 'Parametric EQ', params: [
    { id: 'low', label: 'Low', min: -18, max: 18, def: 0, origin: 0, fmt: dB },
    { id: 'mid', label: 'Mid', min: -18, max: 18, def: 0, origin: 0, fmt: dB },
    { id: 'freq', label: 'Freq', min: 200, max: 6000, def: 1000, curve: 2.5, fmt: hz },
    { id: 'high', label: 'High', min: -18, max: 18, def: 0, origin: 0, fmt: dB },
  ] },
  { id: 'filter', name: 'Filter', params: [
    { id: 'mode', label: 'Mode', options: ['Low-pass', 'High-pass', 'Band-pass'], def: 0 },
    { id: 'cutoff', label: 'Cutoff', min: 40, max: 18000, def: 18000, curve: 3, fmt: hz },
    { id: 'reso', label: 'Reso', min: 0.5, max: 15, def: 1, curve: 2, fmt: (v) => v.toFixed(1) },
  ] },
  { id: 'drive', name: 'Distortion', params: [
    { id: 'drive', label: 'Drive', min: 0, max: 1, def: 0.4, fmt: pct },
    { id: 'tone', label: 'Tone', min: 0, max: 1, def: 0.6, fmt: pct },
    { id: 'mix', label: 'Mix', min: 0, max: 1, def: 1, fmt: pct },
  ] },
  { id: 'crush', name: 'Bitcrusher', params: [
    { id: 'bits', label: 'Bits', min: 2, max: 12, def: 6, fmt: (v) => `${Math.round(v)} bit` },
    { id: 'mix', label: 'Mix', min: 0, max: 1, def: 1, fmt: pct },
  ] },
  { id: 'delay', name: 'Delay', params: [
    { id: 'time', label: 'Time', options: DELAY_TIMES.map((d) => d[0]), def: 2 },
    { id: 'feedback', label: 'Feedback', min: 0, max: 0.9, def: 0.4, fmt: pct },
    { id: 'damp', label: 'Damp', min: 0, max: 1, def: 0.5, fmt: pct },
    { id: 'mix', label: 'Mix', min: 0, max: 1, def: 0.3, fmt: pct },
  ] },
  { id: 'reverb', name: 'Reverb', params: [
    { id: 'size', label: 'Size', min: 0.3, max: 6, def: 2.2, curve: 1.5, fmt: sec },
    { id: 'damp', label: 'Damp', min: 0, max: 1, def: 0.5, fmt: pct },
    { id: 'mix', label: 'Mix', min: 0, max: 1, def: 0.25, fmt: pct },
  ] },
  { id: 'chorus', name: 'Chorus', params: [
    { id: 'rate', label: 'Rate', min: 0.05, max: 5, def: 0.8, curve: 2, fmt: (v) => `${v.toFixed(2)} Hz` },
    { id: 'depth', label: 'Depth', min: 0, max: 1, def: 0.5, fmt: pct },
    { id: 'mix', label: 'Mix', min: 0, max: 1, def: 0.5, fmt: pct },
  ] },
  { id: 'comp', name: 'Compressor', params: [
    { id: 'thresh', label: 'Thresh', min: -60, max: 0, def: -18, fmt: dB },
    { id: 'ratio', label: 'Ratio', min: 1, max: 20, def: 4, curve: 2, fmt: (v) => `${v.toFixed(1)}:1` },
    { id: 'attack', label: 'Attack', min: 0.001, max: 0.1, def: 0.005, curve: 2, fmt: ms },
    { id: 'release', label: 'Release', min: 0.02, max: 1, def: 0.2, curve: 2, fmt: ms },
    { id: 'gain', label: 'Gain', min: 0, max: 24, def: 4, fmt: dB },
  ] },
  { id: 'duck', name: 'Sidechain', params: [
    { id: 'depth', label: 'Depth', min: 0, max: 1, def: 0.8, fmt: pct },
    { id: 'release', label: 'Release', min: 0.1, max: 1, def: 0.6, fmt: (v) => `${v.toFixed(2)} beat` },
  ] },
];
export const fxDef = (id) => FX.find((f) => f.id === id);
export const fxDefaults = (id) => Object.fromEntries(fxDef(id).params.map((p) => [p.id, p.def]));

const impulses = new WeakMap();
// a room, as decaying noise: longer for a bigger one, darker for a damped one
function impulse(ctx, seconds) {
  let cache = impulses.get(ctx);
  if (!cache) { cache = new Map(); impulses.set(ctx, cache); }
  const key = seconds.toFixed(1);
  if (cache.has(key)) return cache.get(key);
  const n = Math.round(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
  }
  cache.set(key, b);
  return b;
}

// Builds an effect. `env.stepDur()` is the length of a sixteenth note now, for the delay.
export function createEffect(ctx, type, params, env) {
  const p = { ...fxDefaults(type), ...params };
  const input = ctx.createGain(), output = ctx.createGain();
  const now = () => ctx.currentTime;
  const ease = (param, v, tau = 0.02) => param.setTargetAtTime(v, now(), tau);
  const mixer = () => {                       // a dry/wet pair, for the effects that have a Mix
    const dry = ctx.createGain(), wet = ctx.createGain();
    input.connect(dry).connect(output);
    wet.connect(output);
    return { dry, wet, mix: (m) => { ease(dry.gain, 1 - m); ease(wet.gain, m); } };
  };
  let fx;
  switch (type) {
    case 'eq': {
      const lo = ctx.createBiquadFilter(), mid = ctx.createBiquadFilter(), hi = ctx.createBiquadFilter();
      lo.type = 'lowshelf'; lo.frequency.value = 120;
      mid.type = 'peaking'; mid.Q.value = 1;
      hi.type = 'highshelf'; hi.frequency.value = 8000;
      input.connect(lo).connect(mid).connect(hi).connect(output);
      fx = { set(q) { ease(lo.gain, q.low); ease(mid.gain, q.mid); ease(mid.frequency, q.freq); ease(hi.gain, q.high); } };
      break;
    }
    case 'filter': {
      const b = ctx.createBiquadFilter();
      input.connect(b).connect(output);
      fx = { set(q) { b.type = ['lowpass', 'highpass', 'bandpass'][q.mode | 0] || 'lowpass'; ease(b.frequency, Math.min(q.cutoff, ctx.sampleRate * 0.45)); ease(b.Q, q.reso); } };
      break;
    }
    case 'drive': {
      const m = mixer();
      const shaper = ctx.createWaveShaper();
      shaper.oversample = '2x';
      const toneLp = ctx.createBiquadFilter();
      toneLp.type = 'lowpass';
      const trim = ctx.createGain();
      input.connect(shaper).connect(toneLp).connect(trim).connect(m.wet);
      let last = -1;
      fx = { set(q) {
        if (q.drive !== last) {
          last = q.drive;
          const k = 1 + q.drive * 24, c = new Float32Array(1024);
          for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
          shaper.curve = c;
          trim.gain.value = 1 / (1 + q.drive * 1.5);
        }
        ease(toneLp.frequency, Math.min(ctx.sampleRate * 0.45, 800 * Math.pow(20, q.tone)));
        m.mix(q.mix);
      } };
      break;
    }
    case 'crush': {
      const m = mixer();
      const shaper = ctx.createWaveShaper();
      input.connect(shaper).connect(m.wet);
      let last = -1;
      fx = { set(q) {
        const bits = Math.round(q.bits);
        if (bits !== last) {
          last = bits;
          const steps = Math.pow(2, bits - 1), c = new Float32Array(4096);
          for (let i = 0; i < 4096; i++) { const x = (i / 4095) * 2 - 1; c[i] = Math.round(x * steps) / steps; }
          shaper.curve = c;
        }
        m.mix(q.mix);
      } };
      break;
    }
    case 'delay': {
      // a ping-pong echo, darker on every repeat
      input.connect(output);
      const send = ctx.createGain();
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      const dl = ctx.createDelay(4), dr = ctx.createDelay(4);
      const fbl = ctx.createGain(), fbr = ctx.createGain();
      const pl = ctx.createStereoPanner(), pr = ctx.createStereoPanner();
      pl.pan.value = -0.8;
      pr.pan.value = 0.8;
      input.connect(send).connect(damp).connect(dl);
      dl.connect(fbl).connect(dr);
      dr.connect(fbr).connect(dl);
      dl.connect(pl).connect(output);
      dr.connect(pr).connect(output);
      let steps = 3;
      const retime = () => { const t = Math.min(3.9, env.stepDur() * steps); ease(dl.delayTime, t, 0.05); ease(dr.delayTime, t, 0.05); };
      fx = {
        set(q) { steps = DELAY_TIMES[q.time | 0]?.[1] || 3; retime(); ease(fbl.gain, q.feedback); ease(fbr.gain, q.feedback); ease(damp.frequency, Math.min(ctx.sampleRate * 0.45, 1200 * Math.pow(14, 1 - q.damp))); ease(send.gain, q.mix); },
        tempo: retime,
      };
      break;
    }
    case 'reverb': {
      const m = mixer();
      const conv = ctx.createConvolver();
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      input.connect(conv).connect(damp).connect(m.wet);
      let size = -1;
      fx = { set(q) {
        const s = Math.round(q.size * 10) / 10;
        if (s !== size) { size = s; conv.buffer = impulse(ctx, s); }
        ease(damp.frequency, Math.min(ctx.sampleRate * 0.45, 1500 * Math.pow(10, 1 - q.damp)));
        m.mix(q.mix);
      } };
      break;
    }
    case 'chorus': {
      const m = mixer();
      const lfo = ctx.createOscillator();
      lfo.start();
      const mkVoice = (base, sign, pan) => {
        const d = ctx.createDelay(0.1);
        d.delayTime.value = base;
        const depth = ctx.createGain();
        lfo.connect(depth).connect(d.delayTime);
        const pn = ctx.createStereoPanner();
        pn.pan.value = pan;
        input.connect(d).connect(pn).connect(m.wet);
        return { depth, sign };
      };
      const vs = [mkVoice(0.018, 1, -0.7), mkVoice(0.024, -1, 0.7)];
      fx = {
        set(q) { ease(lfo.frequency, q.rate); for (const v of vs) ease(v.depth.gain, v.sign * q.depth * 0.006); m.mix(q.mix); },
        dispose() { try { lfo.stop(); } catch { /* stopped */ } },
      };
      break;
    }
    case 'comp': {
      const c = ctx.createDynamicsCompressor();
      const make = ctx.createGain();
      input.connect(c).connect(make).connect(output);
      fx = { set(q) { ease(c.threshold, q.thresh); ease(c.ratio, q.ratio); ease(c.attack, q.attack); ease(c.release, q.release); ease(make.gain, Math.pow(10, q.gain / 20)); } };
      break;
    }
    case 'duck': {
      // dips on every kick and swells back over a part of a beat: the sidechain pump
      const g = ctx.createGain();
      input.connect(g).connect(output);
      fx = {
        set() {},
        kick(t, vel) {
          const param = g.gain;
          if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t); else param.cancelScheduledValues(t);
          param.linearRampToValueAtTime(1 - p.depth * vel, t + 0.006);
          param.linearRampToValueAtTime(1, t + Math.max(0.08, p.release * env.stepDur() * 4));
        },
      };
      break;
    }
    default:
      input.connect(output);
      fx = { set() {} };
  }
  fx.set(p);
  return {
    type, input, output,
    set(q) { Object.assign(p, q); fx.set(p); },
    tempo: () => fx.tempo?.(),
    kick: fx.kick ? (t, vel) => fx.kick(t, vel) : null,
    dispose() { fx.dispose?.(); try { input.disconnect(); output.disconnect(); } catch { /* gone */ } },
  };
}
