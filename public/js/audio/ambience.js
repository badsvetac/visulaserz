import { clamp } from '../util.js';

// Scene sound mixed under the music. Two sources:
//  - a recording the user picked (any queued/saved track, looped): the real thing
//  - a procedural fallback (rain = filtered-noise bed, scheduled droplet bursts, sill drips)
// thunder() is available in both modes; the Rain scene calls it after each lightning flash.
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
    this.kind = null;
    this.audible = false;
    this.intensity = 0.5;
    this.file = null;
    this.nodes = null;
    this.bed = null;
    this.timer = 0;
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

  // 0..1 from the music's level: the synthesised rain swells a little in the loud parts.
  setIntensity(x) {
    this.intensity = clamp(x, 0, 1);
    if (this.bed) this.bed.gain.setTargetAtTime(0.35 + 0.45 * this.intensity, this.ctx.currentTime, 0.6);
  }

  set(kind) {
    if (kind === this.kind) return;
    this.kind = kind;
    this.#apply();
    this.#gain();
  }

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
    this.#apply();
    this.#gain();
    this.dispatchEvent(new Event('source'));
  }

  clearFile() {
    if (!this.file) return;
    this.file.el.pause();
    this.file.src.disconnect();
    this.file.el.removeAttribute('src');
    this.file = null;
    this.#apply();
    this.#gain();
    this.dispatchEvent(new Event('source'));
  }

  #apply() {
    this.#stopSynth();
    if (this.file) this.file.el.pause();
    if (!this.kind) return;
    if (this.file) {
      if (this.audible) this.file.el.play().catch(() => {});
    } else if (this.kind === 'rain') {
      this.#rain();
    }
  }

  #gain() {
    const k = this.file ? 0.9 : 1.2; // recordings are mastered loud; the synth is not
    const target = this.kind && this.audible ? this.level * this.level * k : 0;
    this.out.gain.setTargetAtTime(target, this.ctx.currentTime, 0.8);
  }

  #rain() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 0.35;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    const bed = ctx.createGain();
    bed.gain.value = 0.5;
    src.connect(bp).connect(lp).connect(bed).connect(this.out);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.12;
    lfo.connect(lfoAmt).connect(bed.gain);
    const src2 = ctx.createBufferSource();
    src2.buffer = this.noise;
    src2.loop = true;
    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 350;
    const roar = ctx.createGain();
    roar.gain.value = 0.25;
    src2.connect(lp2).connect(roar).connect(this.out);
    src.start();
    src2.start(0, 0.7);
    lfo.start();
    this.bed = bed;
    this.nodes = [src, src2, lfo];
    this.nextPatter = ctx.currentTime + 0.05;
    this.nextDrip = ctx.currentTime + 0.5;
    this.timer = setInterval(() => this.#schedule(), 90);
  }

  // Look-ahead scheduling: everything for the next 250 ms is queued on the audio clock,
  // so timer jitter never reaches the ear.
  #schedule() {
    const horizon = this.ctx.currentTime + 0.25;
    while (this.nextPatter < horizon) {
      this.#burst(this.nextPatter);
      this.nextPatter += 0.02 + (Math.random() * 0.06) / (0.4 + this.intensity);
    }
    while (this.nextDrip < horizon) {
      this.#drip(this.nextDrip);
      this.nextDrip += 0.35 + Math.random() * 1.4;
    }
  }

  #burst(t) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1500 + Math.random() * 6000;
    f.Q.value = 2 + Math.random() * 6;
    const g = ctx.createGain();
    const amp = (0.1 + Math.random() * 0.35) * (0.5 + this.intensity);
    const dur = 0.006 + Math.random() * 0.025;
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.01);
  }

  #drip(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const f0 = 900 + Math.random() * 1400;
    o.frequency.setValueAtTime(f0 * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(f0, t + 0.03);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08 + Math.random() * 0.08, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.1);
  }

  thunder(delay = 1) {
    if (!this.kind) return;
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

  #stopSynth() {
    clearInterval(this.timer);
    this.timer = 0;
    for (const n of this.nodes || []) {
      try { n.stop(); } catch { /* already stopped */ }
    }
    this.nodes = null;
    this.bed = null;
  }
}
