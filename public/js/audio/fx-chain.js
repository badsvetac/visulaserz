// The FX chain is built against *any* BaseAudioContext, so the exact same graph runs
// live (AudioContext) and offline (OfflineAudioContext) for the WAV export.
//
//   input → bass shelf → treble shelf → muffle (lowpass) → drive (waveshaper)
//         → DJ filter (highpass ⇄ lowpass pair) → 3-band isolator (LOW/MID/HIGH kills)
//         ├→ main gate ─┬→ dry ──────────────────────────┐
//         │             └→ convolver A/B (crossfaded) → wet ─┤
//         └→ echo send → delay ⟲ feedback(+damping) → wet ──┤
//                                                          └→ gate → orbit filter
//                                                             → panner (LFO) → track slots → music level
//                                                             → (+ the tools' own sound) → tool slots → limiter → output
//
// Two layers of control, and keeping them apart matters:
//   apply(fx)  — the knobs. Persisted, restored, and used by the offline export.
//   perf.*     — what a held pad or a tempo sync is doing *right now*. Never written into
//                fx, so turning a knob mid-gesture cannot cancel a pad you are holding,
//                and a performance move never leaks into the exported file.
import { clamp } from '../util.js';
import { djFilterCurve } from './dj-filter.js';

const FLAT_Q = -3.01; // Butterworth, in dB: what a Linkwitz-Riley crossover pair needs to sum flat
const XOVER_LOW = 250;
const XOVER_HIGH = 2500;

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
  const biquad = (type, frequency, q) => {
    const n = ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = frequency;
    n.Q.value = q;
    return n;
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

  // ── DJ filter: one bipolar knob, two filters, the unused one parked wide open ──
  const djHP = biquad('highpass', 20, FLAT_Q);
  const djLP = biquad('lowpass', Math.min(20000, 0.45 * ctx.sampleRate), FLAT_Q);
  const post = ctx.createGain();

  // ── 3-band isolator ───────────────────────────────────────────────────────
  // Linkwitz-Riley 4th order: two Butterworth sections per branch. The tree splits at
  // 250 Hz, then splits what is left at 2.5 kHz — which allpasses the mid+high sum, so
  // the low band gets a matching allpass or the three bands would not add back to flat.
  const lowA = biquad('lowpass', XOVER_LOW, FLAT_Q);
  const lowB = biquad('lowpass', XOVER_LOW, FLAT_Q);
  const lowAP = biquad('allpass', XOVER_HIGH, 0.7071); // allpass Q *is* linear, unlike the others
  const restA = biquad('highpass', XOVER_LOW, FLAT_Q);
  const restB = biquad('highpass', XOVER_LOW, FLAT_Q);
  const midA = biquad('lowpass', XOVER_HIGH, FLAT_Q);
  const midB = biquad('lowpass', XOVER_HIGH, FLAT_Q);
  const highA = biquad('highpass', XOVER_HIGH, FLAT_Q);
  const highB = biquad('highpass', XOVER_HIGH, FLAT_Q);
  const bandGains = [ctx.createGain(), ctx.createGain(), ctx.createGain()]; // low, mid, high
  const iso = ctx.createGain();

  post.connect(lowA).connect(lowB).connect(lowAP).connect(bandGains[0]).connect(iso);
  post.connect(restA).connect(restB);
  restB.connect(midA).connect(midB).connect(bandGains[1]).connect(iso);
  restB.connect(highA).connect(highB).connect(bandGains[2]).connect(iso);

  // ── wet / dry ─────────────────────────────────────────────────────────────
  const mainGate = ctx.createGain(); // 0 = echo-out: the track vanishes, the repeats stay
  const dry = ctx.createGain();
  const convs = [ctx.createConvolver(), ctx.createConvolver()];
  const convGains = [ctx.createGain(), ctx.createGain()];
  convGains[0].gain.value = 1;
  convGains[1].gain.value = 0;
  const reverbWet = ctx.createGain();
  reverbWet.gain.value = 0;

  const echoSend = ctx.createGain(); // what reaches the delay line at all
  const delay = ctx.createDelay(2);
  const feedback = ctx.createGain();
  const echoDamp = ctx.createBiquadFilter();
  echoDamp.type = 'lowpass';
  echoDamp.frequency.value = 3800;
  const echoWet = ctx.createGain();
  echoWet.gain.value = 0;

  const bus = ctx.createGain();
  const gate = ctx.createGain(); // trance gate / tremolo: written by a scheduler, not by apply()
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

  // ── tool slots ────────────────────────────────────────────────────────────
  // The market's tools (public/tools) play here: after the rack and before the limiter, so a
  // touch effect bends the whole mix, echo tails and all, and whatever a tool plays itself joins
  // the music the picture listens to. Each slot is a plain wire until a tool takes it, and the
  // hand-over is a crossfade with matching time constants (pass + wet stays exactly 1), so
  // opening a tool in the middle of a song never clicks. The offline export builds the same row
  // and leaves it empty: no tool ever reaches the WAV.
  //
  // A few more slots sit on the track alone, before the tools' own sound joins it: an effect that
  // should change the song but not what you play over it (taking the vocals out, freezing it)
  // goes there, so your drum pads and your microphone are left alone.
  const TOOL_SLOTS = 8;
  const MUSIC_SLOTS = 3;
  const toolIn = ctx.createGain();
  const musicIn = ctx.createGain();
  // The music on its way in, on its own gain: a tool can take the track out from under what the
  // tools are playing (Chop's "mute track", the looper playing alone) without silencing them too.
  const musicLevel = ctx.createGain();
  const row = (head, n) => {
    const list = [];
    let tail = head;
    for (let i = 0; i < n; i++) {
      const pass = ctx.createGain();
      const wet = ctx.createGain();
      const out = ctx.createGain();
      wet.gain.value = 0;
      tail.connect(pass).connect(out);
      wet.connect(out);
      list.push({ from: tail, pass, wet, fx: null });
      tail = out;
    }
    return { list, tail };
  };
  const toolRow = row(toolIn, TOOL_SLOTS);
  const musicRow = row(musicIn, MUSIC_SLOTS);
  toolRow.tail.connect(limiter);
  musicRow.tail.connect(musicLevel);

  input.connect(bass).connect(treble).connect(muffle).connect(shaper).connect(driveTrim);
  driveTrim.connect(djHP).connect(djLP).connect(post);
  iso.connect(mainGate);
  mainGate.connect(dry).connect(bus);
  convs.forEach((c, i) => {
    mainGate.connect(c);
    c.connect(convGains[i]).connect(reverbWet);
  });
  reverbWet.connect(bus);
  iso.connect(echoSend).connect(delay);
  delay.connect(echoDamp).connect(feedback).connect(delay);
  delay.connect(echoWet).connect(bus);
  bus.connect(gate).connect(orbitFilter).connect(panner).connect(musicIn);
  musicLevel.connect(toolIn);
  crackleGain.connect(limiter);
  limiter.connect(output);

  let activeConv = 0;
  let impulseKey = '';
  let driveKey = -1;
  let crackleLevel = 0;
  let audible = true;
  let lastFx = null;

  // Everything a held pad or a tempo sync is doing right now. Neutral values here mean
  // "the knobs decide", which is exactly the state the offline export runs in.
  const perf = {
    kill: [1, 1, 1], // LOW / MID / HIGH band gains
    main: 1,         // 0 = echo-out
    send: 1,         // 0 = nothing new enters the delay
    throwWet: 0,     // extra echo while THROW is held
    throwFb: 0,
    echoTime: null,  // seconds, or null to follow the knob
  };

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
    lastFx = fx;
    setP(bass.gain, fx.bass);
    setP(treble.gain, fx.treble);
    // Muffle sweeps the cutoff exponentially: 20 kHz (open) down to 250 Hz (next room).
    setP(muffle.frequency, 20000 * Math.pow(250 / 20000, clamp(fx.muffle, 0, 1)));

    // The waveshaper curve is a 2048-sample array; rebuilding it on every knob frame
    // (the morph fader moves a dozen params at 60 fps) is pure garbage, so cache it.
    const driveNow = Math.round(clamp(fx.drive ?? 0, 0, 1) * 200);
    if (driveNow !== driveKey) {
      driveKey = driveNow;
      shaper.curve = driveNow > 0 ? driveCurve(driveNow / 200) : null;
    }
    setP(driveTrim.gain, fx.drive > 0.001 ? 1 / Math.pow(1 + fx.drive * 9, 0.55) : 1);

    const dj = djFilterCurve(fx.filter ?? 0, fx.filterReso ?? 0, ctx.sampleRate);
    setP(djLP.frequency, dj.lpHz, 0.012);
    setP(djHP.frequency, dj.hpHz, 0.012);
    setP(djLP.Q, dj.lpQ, 0.02);
    setP(djHP.Q, dj.hpQ, 0.02);

    // Kills are a performance move: fast enough to feel like a switch, slow enough not to click.
    for (let i = 0; i < 3; i++) setP(bandGains[i].gain, perf.kill[i], 0.008);
    setP(mainGate.gain, perf.main, 0.02);
    setP(echoSend.gain, perf.send, 0.02);

    // Equal-power-ish mix so turning the reverb up does not make everything louder.
    setP(dry.gain, Math.cos(fx.reverbMix * 0.5 * Math.PI) * 0.35 + 0.65);
    setP(reverbWet.gain, fx.reverbMix * 1.5);
    setImpulse(fx.reverbSize, fx.reverbTone);

    // A held pad may only ever *add* to what the knobs ask for, so releasing it cannot
    // leave the echo quieter than the knob position the user can see.
    setP(delay.delayTime, perf.echoTime ?? fx.echoTime, 0.08);
    setP(feedback.gain, Math.max(fx.echoFeedback, perf.throwFb));
    setP(echoWet.gain, Math.max(fx.echoMix * 0.9, perf.throwWet));

    lfoSide.frequency.value = fx.orbitRate;
    lfoDepth.frequency.value = fx.orbitRate;
    setP(sideAmount.gain, fx.orbit * 0.95);
    setP(orbitFilter.frequency, 20000 - fx.orbit * 10500);
    setP(depthAmount.gain, fx.orbit * 6000);

    crackleLevel = fx.crackle * fx.crackle * 0.5;
    setP(crackleGain.gain, audible ? crackleLevel : 0, 0.1);
  }

  const refresh = () => lastFx && apply(lastFx);

  return {
    input,
    output,
    apply,
    // The trance gate writes sample-accurate automation straight onto this.
    gateParam: gate.gain,
    get sampleRate() { return ctx.sampleRate; },

    // ── performance overrides ────────────────────────────────────────────────
    setKill(band, on) {
      const next = on ? 0 : 1;
      if (perf.kill[band] === next) return;
      perf.kill[band] = next;
      refresh();
    },
    // Echo-out: the music disappears and only the decaying repeats are left. The delay's
    // input is cut a beat later so the last phrase makes it into the tail first.
    setEchoOut(on, tailDelay = 0) {
      perf.main = on ? 0 : 1;
      if (on) {
        perf.throwWet = Math.max(perf.throwWet, 0.75);
        perf.throwFb = Math.max(perf.throwFb, 0.62);
        refresh();
        if (live) setTimeout(() => { if (perf.main === 0) { perf.send = 0; refresh(); } }, tailDelay * 1000);
      } else {
        perf.send = 1;
        perf.throwWet = 0;
        perf.throwFb = 0;
        refresh();
      }
    },
    // Throw: hold to push the music into the echo, release and the repeats ring on.
    setThrow(on) {
      perf.throwWet = on ? 0.7 : 0;
      perf.throwFb = on ? 0.72 : 0;
      refresh();
    },
    // Tempo-synced echo time, or null to hand the delay back to the knob.
    setEchoTime(seconds) {
      const next = seconds === null ? null : clamp(seconds, 0.02, 1.95);
      if (perf.echoTime !== null && next !== null && Math.abs(perf.echoTime - next) < 0.0005) return;
      perf.echoTime = next;
      refresh();
    },
    get performance() { return { ...perf, kill: [...perf.kill] }; },
    // Puts every held override back to neutral in one glide: the panic key.
    clearPerformance() {
      perf.kill = [1, 1, 1];
      perf.main = 1;
      perf.send = 1;
      perf.throwWet = 0;
      perf.throwFb = 0;
      refresh();
    },

    // Surface noise should stop when the record stops.
    setAudible(on) {
      audible = on;
      setP(crackleGain.gain, on ? crackleLevel : 0, 0.15);
    },

    // ── the tool slots ───────────────────────────────────────────────────────
    // What a tool plays (a drum hit, a riser) goes into toolInput and through every slot after it.
    toolInput: toolIn,
    // The track's own level as it joins the tools (an AudioParam; 1 = all of it).
    musicLevel: musicLevel.gain,
    // Lends the first free slot to a tool's effect, { input, output }, which must be transparent
    // at that moment (its own dry path open): one on the whole mix, or with { music: true } one on
    // the track alone. Returns the function that gives the slot back, or null when all of them
    // are taken.
    claimSlot(fx, { music = false } = {}) {
      const slot = (music ? musicRow : toolRow).list.find((s) => !s.fx);
      if (!slot || !live) return null;
      slot.fx = fx;
      slot.from.connect(fx.input);
      fx.output.connect(slot.wet);
      const now = ctx.currentTime;
      slot.pass.gain.setTargetAtTime(0, now, 0.005);
      slot.wet.gain.setTargetAtTime(1, now, 0.005);
      return () => {
        if (slot.fx !== fx) return;
        const t = ctx.currentTime;
        slot.pass.gain.setTargetAtTime(1, t, 0.005);
        slot.wet.gain.setTargetAtTime(0, t, 0.005);
        setTimeout(() => {
          try { slot.from.disconnect(fx.input); } catch { /* already gone */ }
          try { fx.output.disconnect(slot.wet); } catch { /* already gone */ }
          slot.fx = null;
        }, 80);
      };
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
