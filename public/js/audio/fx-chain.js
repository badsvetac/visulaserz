// The FX chain is built against *any* BaseAudioContext, so the exact same graph runs
// live (AudioContext) and offline (OfflineAudioContext) for the WAV export.
//
//   input → bass shelf → treble shelf → muffle (lowpass) → drive (waveshaper)
//         ├→ dry ───────────────────────────────┐
//         ├→ convolver A/B (crossfaded) → wet ──┤
//         └→ delay ⟲ feedback(+damping) → wet ──┤
//                                               └→ orbit filter → panner (LFO) → limiter → output
import { clamp } from '../util.js';

// Synthesises a stereo impulse response: decaying noise whose highs die faster than its
// lows (like air and soft walls absorb them), preceded by a few discrete early reflections.
export function buildImpulse(ctx, rt60, tone) {
  const rate = ctx.sampleRate;
  const preDelay = 0.010 + 0.005 * rt60;
  const length = Math.ceil((rt60 * 1.08 + preDelay) * rate);
  const buffer = ctx.createBuffer(2, length, rate);
  const pre = Math.floor(preDelay * rate);
  const decayPerSample = Math.pow(10, -3 / (rt60 * rate)); // reaches -60 dB after rt60 seconds
  const brightStart = 0.30 + 0.65 * tone; // one-pole lowpass coefficient: 1 = unfiltered
  const brightEnd = 0.03 + 0.32 * tone;
  const dampSamples = rt60 * rate;
  const onsetSamples = 0.03 * rate;

  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    let lp = 0;
    let env = 1;
    for (let i = pre; i < length; i++) {
      const n = i - pre;
      const k = brightStart + (brightEnd - brightStart) * Math.min(1, n / dampSamples);
      lp += (Math.random() * 2 - 1 - lp) * k;
      d[i] = lp * env * (0.3 + 0.7 * Math.min(1, n / onsetSamples));
      env *= decayPerSample;
    }
    const taps = 7;
    for (let n = 0; n < taps; n++) {
      const t = 0.004 + (0.05 + 0.02 * rt60) * Math.pow((n + 1) / taps, 1.4) * (ch === 0 ? 1 : 1.07);
      const idx = pre + Math.floor(t * rate);
      if (idx < length) d[idx] += (n % 2 ? -1 : 1) * 0.5 * Math.pow(0.78, n);
    }
  }
  return buffer;
}

function driveCurve(amount) {
  const n = 2048;
  const curve = new Float32Array(n);
  const k = 1 + amount * 9;
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) curve[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / norm;
  return curve;
}

// Four seconds of vinyl surface noise: soft hiss plus sparse clicks and pops.
function buildCrackle(ctx) {
  const rate = ctx.sampleRate;
  const length = rate * 4;
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      lp += (Math.random() * 2 - 1 - lp) * 0.12;
      d[i] = lp * 0.05;
    }
    const pops = 70;
    for (let n = 0; n < pops; n++) {
      const at = Math.floor(Math.random() * (length - 400));
      const amp = (Math.random() < 0.15 ? 0.9 : 0.3) * (Math.random() * 0.7 + 0.3) * (Math.random() < 0.5 ? -1 : 1);
      const len = 20 + Math.floor(Math.random() * 120);
      for (let j = 0; j < len; j++) d[at + j] += amp * Math.exp(-j / (len * 0.18)) * (Math.random() * 0.6 + 0.4);
    }
  }
  return buffer;
}

export function createFxChain(ctx) {
  const live = typeof OfflineAudioContext === 'undefined' || !(ctx instanceof OfflineAudioContext);
  const setP = (param, value, tau = 0.03) => {
    if (live) param.setTargetAtTime(value, ctx.currentTime, tau);
    else param.value = value;
  };

  const input = ctx.createGain();
  const bass = ctx.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = 110;
  const treble = ctx.createBiquadFilter();
  treble.type = 'highshelf';
  treble.frequency.value = 5200;
  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 20000;
  muffle.Q.value = 0.8;
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '2x';
  const driveTrim = ctx.createGain();

  const dry = ctx.createGain();
  const convs = [ctx.createConvolver(), ctx.createConvolver()];
  const convGains = [ctx.createGain(), ctx.createGain()];
  convGains[0].gain.value = 1;
  convGains[1].gain.value = 0;
  const reverbWet = ctx.createGain();
  reverbWet.gain.value = 0;

  const delay = ctx.createDelay(2);
  const feedback = ctx.createGain();
  const echoDamp = ctx.createBiquadFilter();
  echoDamp.type = 'lowpass';
  echoDamp.frequency.value = 3800;
  const echoWet = ctx.createGain();
  echoWet.gain.value = 0;

  const bus = ctx.createGain();
  const orbitFilter = ctx.createBiquadFilter();
  orbitFilter.type = 'lowpass';
  orbitFilter.frequency.value = 20000;
  orbitFilter.Q.value = 0.5;
  const panner = ctx.createStereoPanner();

  // Two LFOs a quarter-turn apart: sine drives left/right, cosine drives "in front / behind".
  const lfoSide = ctx.createOscillator();
  const lfoDepth = ctx.createOscillator();
  lfoDepth.setPeriodicWave(ctx.createPeriodicWave(new Float32Array([0, 1]), new Float32Array([0, 0])));
  const sideAmount = ctx.createGain();
  const depthAmount = ctx.createGain();
  sideAmount.gain.value = 0;
  depthAmount.gain.value = 0;
  lfoSide.connect(sideAmount).connect(panner.pan);
  lfoDepth.connect(depthAmount).connect(orbitFilter.frequency);
  lfoSide.start();
  lfoDepth.start();

  const crackleSrc = ctx.createBufferSource();
  crackleSrc.buffer = buildCrackle(ctx);
  crackleSrc.loop = true;
  const crackleGain = ctx.createGain();
  crackleGain.gain.value = 0;
  crackleSrc.connect(crackleGain);
  crackleSrc.start();

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  const output = ctx.createGain();
  output.gain.value = 0.7; // cancels the compressor's automatic make-up gain

  input.connect(bass).connect(treble).connect(muffle).connect(shaper).connect(driveTrim);
  driveTrim.connect(dry).connect(bus);
  convs.forEach((c, i) => {
    driveTrim.connect(c);
    c.connect(convGains[i]).connect(reverbWet);
  });
  reverbWet.connect(bus);
  driveTrim.connect(delay);
  delay.connect(echoDamp).connect(feedback).connect(delay);
  delay.connect(echoWet).connect(bus);
  bus.connect(orbitFilter).connect(panner).connect(limiter);
  crackleGain.connect(limiter);
  limiter.connect(output);

  let activeConv = 0;
  let impulseKey = '';
  let crackleLevel = 0;
  let audible = true;

  function setImpulse(rt60, tone) {
    const key = `${rt60.toFixed(2)}|${tone.toFixed(2)}`;
    if (key === impulseKey) return;
    const first = impulseKey === '';
    impulseKey = key;
    const buffer = buildImpulse(ctx, rt60, tone);
    if (first || !live) {
      convs[activeConv].buffer = buffer;
      return;
    }
    // Swapping a convolver's buffer mid-playback clicks, so load the idle one and crossfade.
    const next = 1 - activeConv;
    convs[next].buffer = buffer;
    const now = ctx.currentTime;
    convGains[next].gain.setTargetAtTime(1, now, 0.06);
    convGains[activeConv].gain.setTargetAtTime(0, now, 0.06);
    activeConv = next;
  }

  function apply(fx) {
    setP(bass.gain, fx.bass);
    setP(treble.gain, fx.treble);
    // Muffle sweeps the cutoff exponentially: 20 kHz (open) down to 250 Hz (next room).
    setP(muffle.frequency, 20000 * Math.pow(250 / 20000, clamp(fx.muffle, 0, 1)));

    if (fx.drive > 0.001) {
      shaper.curve = driveCurve(fx.drive);
      setP(driveTrim.gain, 1 / Math.pow(1 + fx.drive * 9, 0.55));
    } else {
      shaper.curve = null;
      setP(driveTrim.gain, 1);
    }

    // Equal-power-ish mix so turning the reverb up does not make everything louder.
    setP(dry.gain, Math.cos(fx.reverbMix * 0.5 * Math.PI) * 0.35 + 0.65);
    setP(reverbWet.gain, fx.reverbMix * 1.5);
    setImpulse(fx.reverbSize, fx.reverbTone);

    setP(delay.delayTime, fx.echoTime, 0.08);
    setP(feedback.gain, fx.echoFeedback);
    setP(echoWet.gain, fx.echoMix * 0.9);

    lfoSide.frequency.value = fx.orbitRate;
    lfoDepth.frequency.value = fx.orbitRate;
    setP(sideAmount.gain, fx.orbit * 0.95);
    setP(orbitFilter.frequency, 20000 - fx.orbit * 10500);
    setP(depthAmount.gain, fx.orbit * 6000);

    crackleLevel = fx.crackle * fx.crackle * 0.5;
    setP(crackleGain.gain, audible ? crackleLevel : 0, 0.1);
  }

  return {
    input,
    output,
    apply,
    // Surface noise should stop when the record stops.
    setAudible(on) {
      audible = on;
      setP(crackleGain.gain, on ? crackleLevel : 0, 0.15);
    },
  };
}

// How long the wet signal keeps ringing after the music ends (used to size the export).
export function fxTailSeconds(fx) {
  let tail = 0.3;
  if (fx.reverbMix > 0.01) tail = Math.max(tail, fx.reverbSize);
  if (fx.echoMix > 0.01 && fx.echoFeedback > 0) {
    const repeats = Math.log(0.001) / Math.log(Math.max(fx.echoFeedback, 0.01));
    tail = Math.max(tail, Math.min(12, fx.echoTime * repeats));
  }
  return tail;
}
