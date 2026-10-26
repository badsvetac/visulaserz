// Every sound the Studio makes: the drum synth, the three-oscillator synth, the sampler and the
// slicer. All of it is written against any BaseAudioContext, so the same code that plays live
// renders a song offline into a WAV. Nothing is downloaded: drums and synths are built from
// oscillators and noise on the spot; the sampler and the slicer play buffers they are given.

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const ROOT = 60;            // a step plays this note (C5 in FL's naming, C4 in MIDI's)
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (k) => `${NOTE_NAMES[((k % 12) + 12) % 12]}${Math.floor(k / 12) - 1}`;

const noises = new WeakMap();
export function noise(ctx) {
  let b = noises.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noises.set(ctx, b);
  }
  return b;
}
const filt = (ctx, type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = Math.min(f, ctx.sampleRate * 0.45); if (q !== undefined) b.Q.value = q; return b; };
const env = (ctx, t, peak, decay, attack = 0.001) => {
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0006, t + attack + decay);
  return g;
};
const burst = (ctx, t, dur) => {
  const s = ctx.createBufferSource();
  s.buffer = noise(ctx);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.02);
  return s;
};
const tone = (ctx, type, f, t, dur) => {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
};
// noise at a 96 kHz device is mostly above hearing: keep the part a cymbal is made of
const airy = (ctx, src, lo) => src.connect(filt(ctx, 'highpass', lo)).connect(filt(ctx, 'lowpass', 15000));

// ── the drum synth ─────────────────────────────────────────────────────────────────────────
export const DRUMS = [
  { id: 'kick', name: 'Kick' }, { id: 'snare', name: 'Snare' }, { id: 'clap', name: 'Clap' }, { id: 'hat', name: 'Hat' },
  { id: 'open', name: 'Open hat' }, { id: 'tom', name: 'Tom' }, { id: 'rim', name: 'Rim' }, { id: 'perc', name: 'Perc' },
  { id: 'shaker', name: 'Shaker' }, { id: 'snap', name: 'Snap' }, { id: 'cowbell', name: 'Cowbell' }, { id: 'crash', name: 'Crash' },
];

// Plays one drum at time t into dest. `pitch` is semitones from the drum's own tuning, `decay` a
// multiplier on its length, `tone` 0..1 from dark to bright, `vel` 0..1.
export function playDrum(ctx, dest, id, t, { vel = 1, pitch = 0, decay = 1, tone: bright = 0.5 } = {}) {
  const p = Math.pow(2, pitch / 12), v = vel * vel;
  const out = ctx.createGain();
  out.gain.value = v;
  // the tone knob: a gentle tilt, darker to the left, brighter to the right
  const tilt = ctx.createBiquadFilter();
  tilt.type = 'highshelf';
  tilt.frequency.value = 2500;
  tilt.gain.value = (bright - 0.5) * 18;
  tilt.connect(out).connect(dest);
  const o2 = tilt;
  switch (id) {
    case 'kick': {
      const len = 0.42 * decay;
      const o = tone(ctx, 'sine', 155 * p, t, len);
      o.frequency.exponentialRampToValueAtTime(46 * p, t + 0.075);
      o.connect(env(ctx, t, 1, len, 0.002)).connect(o2);
      airy(ctx, burst(ctx, t, 0.012), 1600).connect(env(ctx, t, 0.3, 0.006)).connect(o2);
      break;
    }
    case 'snare': {
      const o = tone(ctx, 'triangle', 190 * p, t, 0.2);
      o.frequency.exponentialRampToValueAtTime(160 * p, t + 0.08);
      o.connect(env(ctx, t, 0.5, 0.11 * decay)).connect(o2);
      burst(ctx, t, 0.3 * decay).connect(filt(ctx, 'bandpass', 1900 * p, 0.8)).connect(filt(ctx, 'highpass', 750)).connect(env(ctx, t, 0.85, 0.19 * decay)).connect(o2);
      break;
    }
    case 'clap': {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, t);
      for (let n = 0; n < 3; n++) {                // three hands, a few milliseconds apart
        const at = t + n * 0.011;
        g.gain.setValueAtTime(0.9, at);
        g.gain.exponentialRampToValueAtTime(0.08, at + 0.009);
      }
      g.gain.setValueAtTime(0.6, t + 0.033);
      g.gain.exponentialRampToValueAtTime(0.0006, t + 0.033 + 0.2 * decay);
      burst(ctx, t, 0.35 * decay).connect(filt(ctx, 'bandpass', 1250 * p, 1.6)).connect(filt(ctx, 'highpass', 600)).connect(g).connect(o2);
      break;
    }
    case 'hat':
    case 'open': {
      const len = (id === 'hat' ? 0.055 : 0.38) * decay;
      const sheen = filt(ctx, 'peaking', 10500 * Math.min(p, 1.3), 1);
      sheen.gain.value = 6;
      airy(ctx, burst(ctx, t, len + 0.05), 7200 * Math.min(p, 1.6)).connect(sheen).connect(env(ctx, t, id === 'hat' ? 0.32 : 0.26, len)).connect(o2);
      break;
    }
    case 'tom': {
      const len = 0.38 * decay;
      const o = tone(ctx, 'sine', 140 * p, t, len);
      o.frequency.exponentialRampToValueAtTime(92 * p, t + len * 0.6);
      o.connect(env(ctx, t, 0.85, len, 0.002)).connect(o2);
      break;
    }
    case 'rim':
      tone(ctx, 'triangle', 1700 * p, t, 0.05).connect(env(ctx, t, 0.5, 0.03 * decay)).connect(o2);
      burst(ctx, t, 0.02).connect(filt(ctx, 'bandpass', 3200 * p, 2)).connect(env(ctx, t, 0.5, 0.012)).connect(o2);
      break;
    case 'perc': {                                   // a conga-ish knock
      const o = tone(ctx, 'sine', 420 * p, t, 0.3);
      o.frequency.exponentialRampToValueAtTime(300 * p, t + 0.05);
      o.connect(env(ctx, t, 0.75, 0.16 * decay, 0.001)).connect(o2);
      break;
    }
    case 'shaker':
      airy(ctx, burst(ctx, t, 0.15 * decay), 5600 * Math.min(p, 1.6)).connect(env(ctx, t, 0.22, 0.07 * decay, 0.012)).connect(o2);
      break;
    case 'snap':
      burst(ctx, t, 0.1).connect(filt(ctx, 'bandpass', 2600 * p, 3)).connect(env(ctx, t, 1, 0.07 * decay)).connect(o2);
      break;
    case 'cowbell': {
      const bp = filt(ctx, 'bandpass', 2400 * p, 1.2);
      tone(ctx, 'square', 540 * p, t, 0.4).connect(bp);
      tone(ctx, 'square', 800 * p, t, 0.4).connect(bp);
      bp.connect(env(ctx, t, 0.45, 0.3 * decay)).connect(o2);
      break;
    }
    case 'crash':
      airy(ctx, burst(ctx, t, 1.9 * decay), 4200 * Math.min(p, 1.6)).connect(env(ctx, t, 0.3, 1.6 * decay, 0.004)).connect(o2);
      break;
    default:
      break;
  }
}

// ── the three-oscillator synth ─────────────────────────────────────────────────────────────
// A synth's settings are plain numbers, the same ones its window shows: three oscillators (wave,
// coarse in semitones, fine in cents, level), a low-pass filter with its own envelope, an amp
// envelope, mono with glide, unison, drive. A preset is only a starting set of those numbers.
export const WAVES = ['sine', 'triangle', 'square', 'sawtooth', 'noise'];
const osc = (wave, coarse = 0, fine = 0, level = 1) => ({ wave, coarse, fine, level });
const off = () => osc('sine', 0, 0, 0);
export const SYNTH_PRESETS = [
  { id: '808', name: '808 Bass', osc: [osc('sine', 0, 0, 1), osc('triangle', 12, 0, 0.08), off()], mono: true, glide: 0.07, drop: 1.8, drive: 0.55, cutoff: 1600, reso: 0.5, env: 0, envDecay: 0.2, a: 0.002, d: 1.6, s: 0, r: 0.3 },
  { id: 'bass', name: 'Bass', osc: [osc('sawtooth', 0, 0, 0.55), osc('square', -12, 0, 0.4), off()], mono: true, glide: 0.035, cutoff: 420, reso: 4, env: 1500, envDecay: 0.17, a: 0.003, d: 0.3, s: 0.7, r: 0.08 },
  { id: 'reese', name: 'Reese', osc: [osc('sawtooth', 0, -16, 0.45), osc('sawtooth', 0, 16, 0.45), osc('sine', -12, 0, 0.4)], mono: true, glide: 0.06, cutoff: 850, reso: 2, env: 350, envDecay: 0.4, a: 0.01, d: 0.4, s: 0.9, r: 0.15 },
  { id: 'lead', name: 'Lead', osc: [osc('sawtooth', 0, -7, 0.5), osc('sawtooth', 0, 7, 0.5), off()], cutoff: 2400, reso: 3, env: 2600, envDecay: 0.25, a: 0.004, d: 0.2, s: 0.8, r: 0.18 },
  { id: 'pluck', name: 'Pluck', osc: [osc('sawtooth', 0, 0, 0.6), osc('square', 0, 5, 0.3), off()], cutoff: 450, reso: 5, env: 5200, envDecay: 0.14, a: 0.002, d: 0.32, s: 0, r: 0.16 },
  { id: 'keys', name: 'Keys', osc: [osc('triangle', 0, 0, 0.7), osc('sine', 12, 0, 0.3), off()], cutoff: 3600, reso: 0.7, env: 1600, envDecay: 0.4, a: 0.003, d: 1.2, s: 0.25, r: 0.4 },
  { id: 'pad', name: 'Pad', osc: [osc('sawtooth', 0, -11, 0.35), osc('sawtooth', 0, 11, 0.35), osc('triangle', -12, 0, 0.3)], cutoff: 1300, reso: 1, env: 700, envDecay: 1.2, a: 0.5, d: 0.8, s: 0.8, r: 1.3 },
  { id: 'supersaw', name: 'Supersaw', osc: [osc('sawtooth', 0, 0, 1), off(), off()], unison: 5, spread: 24, cutoff: 5200, reso: 1, env: 0, envDecay: 0.2, a: 0.012, d: 0.3, s: 0.85, r: 0.35 },
  { id: 'chip', name: 'Chip', osc: [osc('square', 0, 0, 0.55), off(), off()], cutoff: 9000, reso: 0.5, env: 0, envDecay: 0.2, a: 0.001, d: 0.12, s: 0.6, r: 0.05 },
  { id: 'bell', name: 'Bell', osc: [osc('sine', 0, 0, 0.8), off(), off()], fm: { ratio: 3.5, index: 3 }, cutoff: 9000, reso: 0.5, env: 0, envDecay: 0.2, a: 0.002, d: 1.7, s: 0, r: 0.7 },
  { id: 'brass', name: 'Brass', osc: [osc('sawtooth', 0, -4, 0.5), osc('sawtooth', 0, 4, 0.5), osc('square', -12, 0, 0.2)], cutoff: 900, reso: 1.5, env: 2200, envDecay: 0.35, a: 0.04, d: 0.4, s: 0.75, r: 0.25 },
  { id: 'noise', name: 'Noise sweep', osc: [osc('noise', 0, 0, 0.6), off(), off()], cutoff: 600, reso: 6, env: 9000, envDecay: 1.4, a: 0.01, d: 1.5, s: 0.2, r: 0.6 },
];
// a fresh, editable copy of a preset's numbers
export function presetParams(id) {
  const pr = SYNTH_PRESETS.find((p) => p.id === id) || SYNTH_PRESETS[3];
  const { id: pid, name, ...rest } = JSON.parse(JSON.stringify(pr));
  return { preset: pid, mono: false, glide: 0, drop: 0, drive: 0, unison: 1, spread: 0, fm: null, tune: 0, envDecay: 0.2, ...rest };
}

const shapers = new WeakMap();
function softClip(ctx) {
  let curve = shapers.get(ctx);
  if (!curve) {
    curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.tanh(x * 1.5) / Math.tanh(1.5); }
    shapers.set(ctx, curve);
  }
  const s = ctx.createWaveShaper();
  s.curve = curve;
  return s;
}

// One note of a synth channel, from its settings. `from` is the frequency a mono synth slides up
// or down from. Returns the voice, to be let go with releaseVoice() (or dur gives it its end).
export function playSynth(ctx, dest, pr, key, t, { vel = 1, dur = 0.25, from = 0 } = {}) {
  const f = mtof(key + (pr.tune || 0));
  const ny = ctx.sampleRate * 0.45;
  const filter = filt(ctx, 'lowpass', pr.cutoff, pr.reso);
  const amp = ctx.createGain();
  amp.gain.value = 0;
  amp.gain.setValueAtTime(0, t);
  const peak = 0.32 * vel;
  amp.gain.linearRampToValueAtTime(peak, t + pr.a);
  amp.gain.setTargetAtTime(peak * pr.s, t + pr.a, Math.max(0.01, pr.d / 4));
  if (pr.env) {
    filter.frequency.setValueAtTime(Math.min(pr.cutoff + pr.env, ny), t);
    filter.frequency.setTargetAtTime(Math.min(pr.cutoff, ny), t + 0.002, Math.max(0.01, (pr.envDecay || 0.2) / 3));
  }
  let head = filter;
  if (pr.drive) { const s = softClip(ctx); const pre = ctx.createGain(); pre.gain.value = 1 + pr.drive * 2; pre.connect(s).connect(filter); head = pre; }
  filter.connect(amp).connect(dest);
  const srcs = [];
  const glide = pr.mono ? pr.glide || 0 : 0;
  const uni = Math.max(1, Math.round(pr.unison || 1));
  for (const o of pr.osc) {
    if (!o || !(o.level > 0)) continue;
    if (o.wave === 'noise') {
      const n = ctx.createBufferSource();
      n.buffer = noise(ctx);
      n.loop = true;
      const g = ctx.createGain();
      g.gain.value = o.level * 0.5;
      n.connect(g).connect(head);
      n.start(t, Math.random());
      srcs.push(n);
      continue;
    }
    for (let u = 0; u < uni; u++) {
      const spread = uni > 1 ? ((u / (uni - 1)) * 2 - 1) * (pr.spread || 0) : 0;
      const v = ctx.createOscillator();
      v.type = o.wave;
      const fr = f * Math.pow(2, (o.coarse || 0) / 12);
      if (from && glide) {
        v.frequency.setValueAtTime(from * Math.pow(2, (o.coarse || 0) / 12), t);
        v.frequency.exponentialRampToValueAtTime(fr, t + glide);
      } else if (pr.drop) {                            // an 808 starts a little sharp and falls into its note
        v.frequency.setValueAtTime(fr * pr.drop, t);
        v.frequency.exponentialRampToValueAtTime(fr, t + 0.06);
      } else {
        v.frequency.setValueAtTime(fr, t);
      }
      v.detune.value = (o.fine || 0) + spread;
      const g = ctx.createGain();
      g.gain.value = o.level / Math.sqrt(uni);
      v.connect(g).connect(head);
      v.start(t);
      srcs.push(v);
    }
  }
  if (pr.fm) {                                       // a bell: the pitch wobbled by a faster sine
    const mod = ctx.createOscillator();
    mod.frequency.value = f * pr.fm.ratio;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(f * pr.fm.index, t);
    depth.gain.exponentialRampToValueAtTime(f * 0.05, t + pr.d);
    mod.connect(depth);
    for (const s of srcs) if (s.frequency) depth.connect(s.frequency);
    mod.start(t);
    srcs.push(mod);
  }
  const voice = { oscs: srcs, amp, freq: f, r: pr.r, ended: Infinity };
  if (dur > 0) releaseVoice(voice, t + dur);
  return voice;
}
export function releaseVoice(voice, t) {
  if (!voice || voice.ended <= t) return;
  const g = voice.amp.gain;
  if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else g.cancelScheduledValues(t);
  g.setTargetAtTime(0, t, Math.max(0.005, voice.r / 4));
  voice.ended = t;
  for (const o of voice.oscs) { try { o.stop(t + voice.r * 1.6 + 0.05); } catch { /* already stopped */ } }
}
// a mono synth's previous note, cut short as the next one slides in
export function cutVoice(voice, t) {
  if (!voice || voice.ended <= t) return;
  const g = voice.amp.gain;
  if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else g.cancelScheduledValues(t);
  g.setTargetAtTime(0, t, 0.006);
  voice.ended = t;
  for (const o of voice.oscs) { try { o.stop(t + 0.06); } catch { /* already stopped */ } }
}

// ── the sampler and the slicer ────────────────────────────────────────────────────────────────
// A sample plays faster for a higher note (and slower for a lower one), the way a tape would.
const reversed = new WeakMap();
export function reverseOf(ctx, buffer) {
  let r = reversed.get(buffer);
  if (!r) {
    r = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) { const s = buffer.getChannelData(c), d = r.getChannelData(c); for (let i = 0, n = s.length; i < n; i++) d[i] = s[n - 1 - i]; }
    reversed.set(buffer, r);
  }
  return r;
}
export function playBuffer(ctx, dest, buffer, t, { vel = 1, key = ROOT, root = ROOT, offset = 0, length = 0, dur = 0, attack = 0.002, release = 0.01, reverse = false } = {}) {
  if (!buffer) return null;
  const src = ctx.createBufferSource();
  src.buffer = reverse ? reverseOf(ctx, buffer) : buffer;
  const rate = Math.pow(2, (key - root) / 12);
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * vel, t + attack);
  src.connect(g).connect(dest);
  const total = buffer.duration;
  const span = length || total - offset;
  const from = reverse ? Math.max(0, total - offset - span) : offset;
  const play = dur > 0 ? Math.min(span / rate, dur) : span / rate;
  src.start(t, from, span);
  g.gain.setValueAtTime(vel * vel, t + Math.max(attack, play - release));
  g.gain.linearRampToValueAtTime(0, t + play);
  src.stop(t + play + 0.02);
  return src;
}

// a short click for the metronome: higher on the bar, lower on the beats
export function playClick(ctx, dest, t, accent) {
  const o = tone(ctx, 'sine', accent ? 1760 : 1175, t, 0.04);
  o.connect(env(ctx, t, accent ? 0.5 : 0.32, 0.03)).connect(dest);
}
