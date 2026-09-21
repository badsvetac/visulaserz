import { clamp } from '../util.js';

// Scene sound mixed under the music — the room the track is playing in.
//
// Three things can make that sound, and they stack:
//  - a recording the user picked (any queued/saved track, looped): the real thing
//  - the scene's own suggestion (the Rain scene asks for rain)
//  - the Room mixer: layers the user dialled in by hand, which outlive scene changes
//
// Every layer is synthesised, so none of it is a download and all of it responds to
// setIntensity(). thunder() is available whatever is playing; the Rain and Storm scenes
// call it after each lightning flash, picture first.
export const ROOM_LAYERS = [
  { id: 'rain', name: 'Rain' },
  { id: 'fire', name: 'Fire' },
  { id: 'wind', name: 'Wind' },
  { id: 'waves', name: 'Waves' },
  { id: 'crickets', name: 'Night' },
  { id: 'room', name: 'Room' },
];

export class Ambience extends EventTarget {
  constructor(ctx, destination) {
    super();
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);
    this.fileGain = ctx.createGain();
    this.fileGain.gain.value = 1;
    this.fileGain.connect(this.out);
    this.level = 0.35;
    this.kind = null;      // what the current scene asks for
    this.audible = false;
    this.intensity = 0.5;
    this.file = null;
    this.mix = {};         // id → 0…1, the user's own Room levels
    this.live = new Map(); // id → { gain, nodes, bed, timer }
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  setLevel(v) {
    this.level = clamp(v, 0, 1);
    this.#gain();
  }

  setAudible(on) {
    this.audible = on;
    this.#gain();
    if (this.file && this.kind) {
      if (on) this.file.el.play().catch(() => {});
      else this.file.el.pause();
    }
  }

  // 0..1 from the music's level: the weather swells a little in the loud parts.
  setIntensity(x) {
    this.intensity = clamp(x, 0, 1);
    for (const l of this.live.values()) {
      if (l.bed) l.bed.gain.setTargetAtTime(l.bedBase * (0.7 + 0.6 * this.intensity), this.ctx.currentTime, 0.6);
    }
  }

  // The scene's suggestion. A recording, if one is loaded, wins over the synthesis.
  set(kind) {
    if (kind === this.kind) return;
    this.kind = kind;
    this.#reconcile();
    this.#gain();
  }

  // A layer the user turned up by hand. These are theirs: they survive scene changes.
  setLayer(id, level) {
    this.mix[id] = clamp(level, 0, 1);
    this.#reconcile();
    this.#gain();
    this.dispatchEvent(new Event('room'));
  }

  getLayer(id) { return this.mix[id] || 0; }

  // Use a recording (a same-origin or blob URL) instead of the synthesis.
  setFile(url, label) {
    this.clearFile();
    const el = new Audio();
    el.loop = true;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.src = url;
    const src = this.ctx.createMediaElementSource(el);
    src.connect(this.fileGain);
    this.file = { el, src, label, url };
    this.#reconcile();
    this.#gain();
    this.dispatchEvent(new Event('source'));
  }

  clearFile() {
    if (!this.file) return;
    this.file.el.pause();
    this.file.src.disconnect();
    this.file.el.removeAttribute('src');
    this.file = null;
    this.#reconcile();
    this.#gain();
    this.dispatchEvent(new Event('source'));
  }

  // What should be playing right now, and at what level. Called after anything changes;
  // builds what is newly wanted, tears down what is not, and leaves the rest alone so a
  // scene change never restarts a layer that was already running.
  #reconcile() {
    const want = new Map();
    // A recording replaces the scene's synthesis, but not the user's own Room layers:
    // rain over a lo-fi tape is a choice someone made on purpose.
    if (this.kind && !this.file && ROOM_LAYERS.some((l) => l.id === this.kind)) want.set(this.kind, 1);
    for (const [id, level] of Object.entries(this.mix)) {
      if (level > 0.001) want.set(id, Math.max(want.get(id) || 0, level));
    }

    for (const [id, l] of this.live) {
      if (want.has(id)) continue;
      this.#stop(id, l);
    }
    for (const [id, level] of want) {
      let l = this.live.get(id);
      if (!l) {
        l = this.#build(id);
        if (!l) continue;
        this.live.set(id, l);
      }
      l.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.5);
    }

    if (this.file) {
      if (this.audible && this.kind) this.file.el.play().catch(() => {});
      else this.file.el.pause();
    }
  }

  #stop(id, l) {
    this.live.delete(id);
    clearInterval(l.timer);
    const t = this.ctx.currentTime;
    l.gain.gain.setTargetAtTime(0, t, 0.4);
    // Let the fade finish before the oscillators go, or stopping them is an audible click.
    setTimeout(() => {
      for (const n of l.nodes) { try { n.stop(); } catch { /* already stopped */ } }
      l.gain.disconnect();
    }, 1600);
  }

  #gain() {
    const k = this.file ? 0.9 : 1.2; // recordings are mastered loud; the synth is not
    const anything = this.live.size > 0 || (this.file && this.kind);
    const target = anything && this.audible ? this.level * this.level * k : 0;
    this.out.gain.setTargetAtTime(target, this.ctx.currentTime, 0.8);
  }

  // ── layer synthesis ────────────────────────────────────────────────────────
  #source(loop = true, offset = 0) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    s.start(0, offset);
    return s;
  }

  #build(id) {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.out);
    const make = this[`_${id}`];
    if (typeof make !== 'function') { gain.disconnect(); return null; }
    return make.call(this, ctx, gain);
  }

  // Hiss in the 2–3 kHz band for the drops, a low roar underneath for the weight of it,
  // then individual droplets and sill drips scheduled on the audio clock.
  _rain(ctx, gain) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    const bed = ctx.createGain();
    bed.gain.value = 0.5;
    const src = this.#source();
    src.connect(bp).connect(lp).connect(bed).connect(gain);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.12;
    lfo.connect(lfoAmt).connect(bed.gain);
    lfo.start();
    const roarSrc = this.#source(true, 0.7);
    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 350;
    const roar = ctx.createGain();
    roar.gain.value = 0.25;
    roarSrc.connect(lp2).connect(roar).connect(gain);

    const l = { gain, bed, bedBase: 0.5, nodes: [src, roarSrc, lfo] };
    let nextPatter = ctx.currentTime + 0.05;
    let nextDrip = ctx.currentTime + 0.5;
    l.timer = setInterval(() => {
      const horizon = ctx.currentTime + 0.25;
      while (nextPatter < horizon) {
        this.#burst(nextPatter, gain, 1500 + Math.random() * 6000, 2 + Math.random() * 6, (0.1 + Math.random() * 0.35) * (0.5 + this.intensity), 0.006 + Math.random() * 0.025);
        nextPatter += 0.02 + (Math.random() * 0.06) / (0.4 + this.intensity);
      }
      while (nextDrip < horizon) {
        this.#drip(nextDrip, gain);
        nextDrip += 0.35 + Math.random() * 1.4;
      }
    }, 90);
    return l;
  }

  // Brown-ish noise for the body of the flame, plus sharp little resin pops on top.
  _fire(ctx, gain) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 760;
    lp.Q.value = 0.4;
    const bed = ctx.createGain();
    bed.gain.value = 0.55;
    const src = this.#source();
    src.connect(lp).connect(bed).connect(gain);
    // Two slow LFOs at unrelated rates: the flame breathes without ever repeating.
    const breath = ctx.createOscillator();
    breath.frequency.value = 0.23;
    const breathAmt = ctx.createGain();
    breathAmt.gain.value = 0.2;
    breath.connect(breathAmt).connect(bed.gain);
    breath.start();
    const flicker = ctx.createOscillator();
    flicker.frequency.value = 1.7;
    const flickerAmt = ctx.createGain();
    flickerAmt.gain.value = 260;
    flicker.connect(flickerAmt).connect(lp.frequency);
    flicker.start();

    const l = { gain, bed, bedBase: 0.55, nodes: [src, breath, flicker] };
    let next = ctx.currentTime + 0.2;
    l.timer = setInterval(() => {
      const horizon = ctx.currentTime + 0.25;
      while (next < horizon) {
        this.#burst(next, gain, 700 + Math.random() * 2600, 3 + Math.random() * 9, (0.05 + Math.random() * 0.3) * (0.6 + this.intensity), 0.004 + Math.random() * 0.02);
        next += 0.03 + Math.random() * 0.4;
      }
    }, 110);
    return l;
  }

  // One bandpass wandering across the spectrum, which is most of what wind is.
  _wind(ctx, gain) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 1.6;
    const bed = ctx.createGain();
    bed.gain.value = 0.7;
    const src = this.#source();
    src.connect(bp).connect(bed).connect(gain);
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.055;
    const sweepAmt = ctx.createGain();
    sweepAmt.gain.value = 380;
    sweep.connect(sweepAmt).connect(bp.frequency);
    sweep.start();
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.037; // deliberately not a multiple of the sweep
    const gustAmt = ctx.createGain();
    gustAmt.gain.value = 0.35;
    gust.connect(gustAmt).connect(bed.gain);
    gust.start();
    return { gain, bed, bedBase: 0.7, nodes: [src, sweep, gust], timer: 0 };
  }

  // A slow swell with a little foam hiss riding on it.
  _waves(ctx, gain) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const bed = ctx.createGain();
    bed.gain.value = 0.5;
    const src = this.#source();
    src.connect(lp).connect(bed).connect(gain);
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.09; // about one wave every eleven seconds
    const swellAmt = ctx.createGain();
    swellAmt.gain.value = 0.42;
    swell.connect(swellAmt).connect(bed.gain);
    swell.start();
    const foamSrc = this.#source(true, 1.1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3200;
    const foam = ctx.createGain();
    foam.gain.value = 0.06;
    foamSrc.connect(hp).connect(foam).connect(gain);
    // The foam rides the same swell, a quarter turn later: it arrives as the wave breaks.
    const foamLfo = ctx.createOscillator();
    foamLfo.frequency.value = 0.09;
    const foamAmt = ctx.createGain();
    foamAmt.gain.value = 0.055;
    foamLfo.connect(foamAmt).connect(foam.gain);
    foamLfo.start(ctx.currentTime + 2.8);
    return { gain, bed, bedBase: 0.5, nodes: [src, foamSrc, swell, foamLfo], timer: 0 };
  }

  // Crickets: short high chirps in irregular bursts, with a very quiet air bed behind.
  _crickets(ctx, gain) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const bed = ctx.createGain();
    bed.gain.value = 0.045;
    const src = this.#source();
    src.connect(hp).connect(bed).connect(gain);

    const l = { gain, bed, bedBase: 0.045, nodes: [src] };
    let next = ctx.currentTime + 0.4;
    l.timer = setInterval(() => {
      const horizon = ctx.currentTime + 0.3;
      while (next < horizon) {
        // A chirp is a handful of pulses in quick succession, not one tone.
        const f = 3900 + Math.random() * 1500;
        const pulses = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < pulses; i++) this.#burst(next + i * 0.028, gain, f, 22, 0.05 + Math.random() * 0.05, 0.012);
        next += 0.5 + Math.random() * 2.2;
      }
    }, 140);
    return l;
  }

  // Room tone: the sound of a quiet space with a record player in it.
  _room(ctx, gain) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    const bed = ctx.createGain();
    bed.gain.value = 0.05;
    const src = this.#source();
    src.connect(lp).connect(bed).connect(gain);

    const l = { gain, bed, bedBase: 0.05, nodes: [src] };
    let next = ctx.currentTime + 0.3;
    l.timer = setInterval(() => {
      const horizon = ctx.currentTime + 0.3;
      while (next < horizon) {
        this.#burst(next, gain, 900 + Math.random() * 3500, 6 + Math.random() * 10, 0.03 + Math.random() * 0.08, 0.004 + Math.random() * 0.012);
        next += 0.08 + Math.random() * 0.7;
      }
    }, 140);
    return l;
  }

  // One short filtered noise hit: a raindrop, a resin pop, a cricket pulse, a vinyl tick.
  #burst(t, dest, freq, q, amp, dur) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.01);
  }

  #drip(t, dest) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const f0 = 900 + Math.random() * 1400;
    o.frequency.setValueAtTime(f0 * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(f0, t + 0.03);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08 + Math.random() * 0.08, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.1);
  }

  thunder(delay = 1) {
    if (!this.live.size && !(this.file && this.kind)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(220, t);
    lp.frequency.exponentialRampToValueAtTime(70, t + 3.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(this.file ? 0.7 : 1.2, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
    s.connect(lp).connect(g).connect(this.out);
    s.start(t);
    s.stop(t + 4.6);
  }
}
