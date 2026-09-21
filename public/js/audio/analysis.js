import { clamp, smoothTo } from '../util.js';

export const SPECTRUM_BINS = 512; // log-spaced bins handed to the shaders
export const HIST_W = 128;
export const HIST_H = 128;
const F_MIN = 30;
const F_MAX = 16000;
const DETECT_RATE = 1 / 60; // beat detection runs at a fixed rate so it behaves the same at 60 and 144 fps
const FLUX_HISTORY = 90; // ~1.5 s

// Turns raw FFT frames into the handful of musical signals the visuals are built on.
export class AudioAnalysis {
  constructor(engine) {
    this.engine = engine;
    this.sensitivity = 1;
    this.motion = 1;

    const n = SPECTRUM_BINS;
    this.spectrum = new Float32Array(n); // fast attack, medium release
    this.slow = new Float32Array(n); // long release: for calm elements
    this.peaks = new Float32Array(n); // falling peak-hold caps
    this.wave = new Float32Array(n);
    this.waveL = new Float32Array(n);
    this.waveR = new Float32Array(n);
    this.texture = new Uint8Array(n * 6); // rows: spectrum, waveform, peaks, slow, left wave, right wave
    this.rmsL = 0;
    this.rmsR = 0;
    this.xyPeak = 0.3;
    this.xyGain = 2.5;
    this.history = new Uint8Array(HIST_W * HIST_H); // scrolling spectrogram, row 0 = newest
    this.historyFrac = 0;

    this.bass = 0; this.mid = 0; this.high = 0; this.level = 0; this.energy = 0;
    this.beat = 0; this.beatAge = 10; this.beatCount = 0; this.isBeat = false; this.beatStrength = 0;
    this.bpm = 0; this.balance = 0; this.travel = 0; this.time = 0;
    this.cruise = 0; // like travel, but eased over ~1 s: for vehicles that should glide, not lurch
    this.cruiseRate = 0.6;

    this.agcPeak = 0.6;
    this.flux = new Float32Array(FLUX_HISTORY);
    this.fluxIndex = 0;
    this.flux1 = 0;
    this.flux2 = 0;
    this.detectAcc = 0;
    this.histAcc = 0;
    this.lastBeatAt = -10;
    this.beatTimes = [];
    this.ranges = null;

    engine.addEventListener('context', () => this.#attach());
    if (engine.ctx) this.#attach();
  }

  #attach() {
    const { analyser, beatAnalyser, analyserL, ctx } = this.engine;
    this.freq = new Uint8Array(analyser.frequencyBinCount);
    this.timeData = new Uint8Array(analyser.fftSize);
    // Float (dB) data for beats: byte data clips on loud bass, and a clipped bin shows no onset.
    this.beatFreq = new Float32Array(beatAnalyser.frequencyBinCount);
    this.beatPrev = new Float32Array(beatAnalyser.frequencyBinCount).fill(-100);
    this.chL = new Float32Array(analyserL.fftSize);
    this.chR = new Float32Array(analyserL.fftSize);

    // Precompute which FFT bins feed each log-spaced output bin, plus a tilt that offsets
    // the natural ~4.5 dB/octave roll-off of music so hi-hats are as visible as kick drums.
    const binHz = ctx.sampleRate / analyser.fftSize;
    const n = SPECTRUM_BINS;
    const octaves = Math.log2(F_MAX / F_MIN);
    this.ranges = new Float32Array(n * 2);
    this.tilt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.ranges[i * 2] = (F_MIN * Math.pow(F_MAX / F_MIN, i / n)) / binHz;
      this.ranges[i * 2 + 1] = (F_MIN * Math.pow(F_MAX / F_MIN, (i + 1) / n)) / binHz;
      this.tilt[i] = ((i / n) * octaves * 2.6) / 72; // dB of lift, in units of the analyser's 72 dB window
    }
    const beatBinHz = ctx.sampleRate / beatAnalyser.fftSize;
    this.kickBins = Math.max(3, Math.round(170 / beatBinHz));
    this.wideBins = Math.min(this.beatFreq.length - 1, Math.round(5000 / beatBinHz));
  }

  update(dt) {
    this.time += dt;
    const playing = this.engine.playing && this.ranges;
    this.isBeat = false;
    if (playing) this.#analyse(dt);
    else this.#idle(dt);

    this.beat = Math.max(0, this.beat * Math.exp(-dt / 0.16));
    this.beatAge += dt;
    this.energy = smoothTo(this.energy, this.level, dt, 2.0);
    // "Travel" is time that runs faster when the music is louder: anything animated by it
    // (tunnel speed, starfield, terrain scroll) surges with the track without storing state.
    this.travel += dt * this.motion * (0.22 + 1.5 * this.bass + 2.2 * this.beat);
    this.cruiseRate = smoothTo(this.cruiseRate, 0.45 + 1.1 * this.level, dt, 1.2);
    this.cruise += dt * this.motion * this.cruiseRate;

    this.#writeHistory(dt);
    this.#pack();
  }

  #analyse(dt) {
    const { analyser, beatAnalyser, analyserL, analyserR } = this.engine;
    analyser.getByteFrequencyData(this.freq);
    analyser.getByteTimeDomainData(this.timeData);
    const n = SPECTRUM_BINS;
    const freq = this.freq;
    const last = freq.length - 1;

    // Automatic gain: quiet masters should still fill the screen, loud ones should not pin it.
    let framePeak = 0;
    for (let b = 2; b < 400; b++) if (freq[b] > framePeak) framePeak = freq[b];
    framePeak /= 255;
    this.agcPeak = smoothTo(this.agcPeak, Math.max(framePeak, 0.2), dt, framePeak > this.agcPeak ? 0.25 : 6);
    const gain = clamp(0.9 / this.agcPeak, 0.75, 2.4) * this.sensitivity;

    const attack = 1 - Math.exp(-dt / 0.012);
    const release = 1 - Math.exp(-dt / 0.16);
    const slowRelease = 1 - Math.exp(-dt / 0.7);
    const peakFall = dt * 0.35;
    let bass = 0, mid = 0, high = 0;
    const bassEnd = 132, midEnd = 342; // ≈150 Hz and ≈2 kHz on the log axis

    for (let i = 0; i < n; i++) {
      const lo = this.ranges[i * 2];
      const hi = this.ranges[i * 2 + 1];
      let v;
      if (hi - lo < 1) {
        const pos = Math.min((lo + hi) * 0.5, last - 1);
        const i0 = Math.floor(pos);
        v = freq[i0] + (freq[i0 + 1] - freq[i0]) * (pos - i0);
      } else {
        let mx = 0, sum = 0, count = 0;
        for (let b = Math.floor(lo), e = Math.min(last, Math.floor(hi)); b <= e; b++) {
          if (freq[b] > mx) mx = freq[b];
          sum += freq[b];
          count++;
        }
        v = 0.6 * mx + 0.4 * (sum / count);
      }
      v /= 255;
      v += this.tilt[i] * clamp(v / 0.15, 0, 1); // lift highs, but never lift silence
      v = clamp(v * gain, 0, 1);
      v = Math.pow(v, 1.9); // expand: dB data is visually flat otherwise

      const s = this.spectrum[i];
      this.spectrum[i] = s + (v - s) * (v > s ? attack : release);
      const sl = this.slow[i];
      this.slow[i] = sl + (v - sl) * (v > sl ? attack * 0.5 : slowRelease);
      this.peaks[i] = Math.max(this.peaks[i] - peakFall, this.spectrum[i]);

      if (i < bassEnd) bass += this.spectrum[i];
      else if (i < midEnd) mid += this.spectrum[i];
      else high += this.spectrum[i];
    }
    this.bass = clamp((bass / bassEnd) * 1.3, 0, 1);
    this.mid = clamp((mid / (midEnd - bassEnd)) * 1.3, 0, 1);
    this.high = clamp((high / (n - midEnd)) * 1.6, 0, 1);
    this.level = clamp(this.bass * 0.45 + this.mid * 0.35 + this.high * 0.2, 0, 1);

    // Oscilloscope: start at a rising zero crossing so the trace stands still instead of crawling.
    const td = this.timeData;
    let start = 0;
    for (let i = 1; i < 1000; i++) {
      if (td[i - 1] < 128 && td[i] >= 128) { start = i; break; }
    }
    for (let i = 0; i < n; i++) this.wave[i] = (td[start + i * 2] - 128) / 128;

    // Stereo balance
    analyserL.getFloatTimeDomainData(this.chL);
    analyserR.getFloatTimeDomainData(this.chR);
    let l = 0, r = 0;
    const len = this.chL.length;
    for (let i = 0; i < len; i++) { l += this.chL[i] * this.chL[i]; r += this.chR[i] * this.chR[i]; }
    l = Math.sqrt(l / len); r = Math.sqrt(r / len);
    this.balance = smoothTo(this.balance, l + r > 1e-4 ? (r - l) / (l + r) : 0, dt, 0.12);
    // VU ballistics: a real meter needs ~300 ms to swing, which is what makes it look right.
    this.rmsL = smoothTo(this.rmsL, l, dt, 0.15);
    this.rmsR = smoothTo(this.rmsR, r, dt, 0.15);
    let pk = 0;
    for (let i = 0; i < n; i++) {
      const L = this.chL[i * 2], R = this.chR[i * 2];
      this.waveL[i] = L;
      this.waveR[i] = R;
      pk = Math.max(pk, Math.abs(L), Math.abs(R));
    }
    // Vectorscope auto-gain: quiet passages still fill the graticule, loud ones do not clip it.
    this.xyPeak = pk > this.xyPeak ? pk : smoothTo(this.xyPeak, pk, dt, 3);
    this.xyGain = clamp(0.75 / Math.max(this.xyPeak, 0.02), 1, 14);

    // Beats: spectral flux of the kick range against a moving mean + deviation threshold.
    this.detectAcc += dt;
    if (this.detectAcc >= DETECT_RATE) {
      this.detectAcc = Math.min(this.detectAcc - DETECT_RATE, DETECT_RATE);
      beatAnalyser.getFloatFrequencyData(this.beatFreq);
      // Kick-range flux carries most of the weight; broadband flux (up to ~5 kHz) lets
      // tracks without a kick drum, like plucked or acoustic music, still register onsets.
      let kick = 0, wide = 0;
      for (let b = 1; b <= this.wideBins; b++) {
        const cur = Math.max(-100, this.beatFreq[b]);
        const d = cur - this.beatPrev[b];
        if (d > 0) {
          wide += d;
          if (b <= this.kickBins) kick += d;
        }
        this.beatPrev[b] = cur;
      }
      const flux = (0.6 * kick) / (this.kickBins * 20) + (0.4 * wide) / (this.wideBins * 12); // 1.0 ≈ every bin jumped 20 dB

      let mean = 0;
      for (let i = 0; i < FLUX_HISTORY; i++) mean += this.flux[i];
      mean /= FLUX_HISTORY;
      let variance = 0;
      for (let i = 0; i < FLUX_HISTORY; i++) variance += (this.flux[i] - mean) ** 2;
      const dev = Math.sqrt(variance / FLUX_HISTORY);
      const threshold = mean + 1.3 * dev + 0.03;

      // Peak picking with one sample of lag: fire on the previous sample only if it was a
      // local maximum, so a single kick cannot trigger on every sample of its rising edge.
      const p1 = this.flux1, p2 = this.flux2;
      if (p1 > threshold && p1 > flux && p1 >= p2 && this.time - this.lastBeatAt > 0.25) {
        this.beatStrength = clamp((p1 - threshold) / (dev * 3 + 0.03), 0.35, 1);
        this.#registerBeat();
      }
      this.flux2 = p1;
      this.flux1 = flux;
      this.flux[this.fluxIndex] = flux;
      this.fluxIndex = (this.fluxIndex + 1) % FLUX_HISTORY;
    }
  }

  #registerBeat() {
    this.isBeat = true;
    this.beat = Math.max(this.beat, this.beatStrength);
    this.beatAge = 0;
    this.beatCount++;
    this.beatTimes.push(this.time);
    if (this.beatTimes.length > 17) this.beatTimes.shift();
    this.lastBeatAt = this.time;

    if (this.beatTimes.length >= 6) {
      const gaps = [];
      for (let i = 1; i < this.beatTimes.length; i++) gaps.push(this.beatTimes[i] - this.beatTimes[i - 1]);
      gaps.sort((a, b) => a - b);
      let bpm = 60 / gaps[gaps.length >> 1];
      while (bpm < 70) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      this.bpm = this.bpm ? this.bpm * 0.7 + bpm * 0.3 : bpm;
    }
  }

  // Nothing playing: breathe gently so the scenes stay alive behind the UI.
  #idle(dt) {
    const t = this.time;
    const n = SPECTRUM_BINS;
    const ease = 1 - Math.exp(-dt / 0.4);
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const v = 0.16 + 0.14 * Math.sin(x * 9 + t * 0.9) * Math.sin(t * 0.45 + x * 3.1) + 0.06 * Math.sin(x * 31 - t * 1.7);
      const target = clamp(v * (1 - x * 0.5), 0, 1);
      this.spectrum[i] += (target - this.spectrum[i]) * ease;
      this.slow[i] += (target - this.slow[i]) * ease;
      this.peaks[i] = Math.max(this.peaks[i] - dt * 0.35, this.spectrum[i]);
      this.wave[i] = 0.22 * Math.sin(x * 12.566 + t * 1.6) * Math.sin(x * 3.1416);
      this.waveL[i] = 0.18 * Math.sin(x * 25.13 + t * 1.3);
      this.waveR[i] = 0.18 * Math.sin(x * 25.13 + t * 1.3 + 1.2);
    }
    this.rmsL = smoothTo(this.rmsL, 0, dt, 0.3);
    this.rmsR = smoothTo(this.rmsR, 0, dt, 0.3);
    this.bass = smoothTo(this.bass, 0.2 + 0.12 * Math.sin(t * 1.1), dt, 0.4);
    this.mid = smoothTo(this.mid, 0.16 + 0.08 * Math.sin(t * 0.7 + 1), dt, 0.4);
    this.high = smoothTo(this.high, 0.12 + 0.06 * Math.sin(t * 1.9 + 2), dt, 0.4);
    this.level = smoothTo(this.level, 0.18, dt, 0.4);
    this.balance = smoothTo(this.balance, 0, dt, 0.3);
    this.bpm = 0;
    this.beatTimes.length = 0;
  }

  #writeHistory(dt) {
    this.histAcc += dt;
    let rows = 0;
    while (this.histAcc >= DETECT_RATE && rows < 4) {
      this.histAcc -= DETECT_RATE;
      rows++;
      this.history.copyWithin(HIST_W, 0, HIST_W * (HIST_H - 1));
      const step = SPECTRUM_BINS / HIST_W;
      for (let x = 0; x < HIST_W; x++) {
        let mx = 0;
        for (let k = 0; k < step; k++) mx = Math.max(mx, this.spectrum[x * step + k]);
        this.history[x] = mx * 255;
      }
    }
    if (this.histAcc > DETECT_RATE * 4) this.histAcc = 0;
    this.historyFrac = clamp(this.histAcc / DETECT_RATE, 0, 1);
  }

  #pack() {
    const n = SPECTRUM_BINS;
    const t = this.texture;
    for (let i = 0; i < n; i++) {
      t[i] = this.spectrum[i] * 255;
      t[n + i] = (this.wave[i] * 0.5 + 0.5) * 255;
      t[2 * n + i] = this.peaks[i] * 255;
      t[3 * n + i] = this.slow[i] * 255;
      t[4 * n + i] = (clamp(this.waveL[i], -1, 1) * 0.5 + 0.5) * 255;
      t[5 * n + i] = (clamp(this.waveR[i], -1, 1) * 0.5 + 0.5) * 255;
    }
  }

  // A manual beat, for the DROP pad.
  triggerBeat() {
    this.beatStrength = 1;
    this.#registerBeat();
  }
}
