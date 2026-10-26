// The analysers a rendered video listens through. A take is rendered frame by frame, faster or
// slower than it was played, so the live AnalyserNodes cannot hear it; these stand in for them,
// reading the take's own audio at the frame being made. They compute what an AnalyserNode
// computes (a Blackman window, a magnitude over N, decibels, no smoothing), so AudioAnalysis sees
// the same numbers and every scene moves the way it did when the take was played.

function makeFFT(n) {
  const bits = Math.round(Math.log2(n));
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let x = i, y = 0;
    for (let b = 0; b < bits; b++) { y = (y << 1) | (x & 1); x >>= 1; }
    rev[i] = y;
  }
  // in place, radix 2, e^(−2πik/n)
  return (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tr = re[l] * cos[k] + im[l] * sin[k];
          const ti = im[l] * cos[k] - re[l] * sin[k];
          re[l] = re[j] - tr; im[l] = im[j] - ti;
          re[j] += tr; im[j] += ti;
        }
      }
    }
  };
}

// L and R are Int16Arrays of the take at sampleRate.
export class TakeTap {
  constructor({ L, R, sampleRate }) {
    this.L = L;
    this.R = R;
    this.sr = sampleRate;
    const N = sampleRate >= 88200 ? 4096 : 2048;              // as the engine sizes its analysers
    this.N = N;
    this.fft = makeFFT(N);
    this.win = new Float32Array(N);
    for (let i = 0; i < N; i++) this.win[i] = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / N) + 0.08 * Math.cos((4 * Math.PI * i) / N);
    this.re = new Float32Array(N);
    this.im = new Float32Array(N);
    this.db = new Float32Array(N / 2);
    this.pos = 0;
    this.done = -1;
    const tap = this;
    const mono = (i) => (i < 0 || i >= L.length ? 0 : (L[i] + R[i]) / 65536);
    this.analyser = {
      fftSize: N, frequencyBinCount: N / 2, minDecibels: -80, maxDecibels: -8,
      getByteFrequencyData(a) {
        tap.#spectrum();
        const lo = this.minDecibels, span = this.maxDecibels - this.minDecibels;
        for (let k = 0; k < a.length; k++) a[k] = Math.max(0, Math.min(255, Math.floor((255 * (tap.db[k] - lo)) / span)));
      },
      getByteTimeDomainData(a) {
        const from = tap.pos - a.length;
        for (let i = 0; i < a.length; i++) a[i] = Math.max(0, Math.min(255, Math.floor(128 * (1 + mono(from + i)))));
      },
    };
    this.beatAnalyser = {
      fftSize: N, frequencyBinCount: N / 2,
      getFloatFrequencyData(a) { tap.#spectrum(); a.set(tap.db.subarray(0, a.length)); },
    };
    const channel = (src) => ({
      fftSize: 1024,
      getFloatTimeDomainData(a) {
        const from = tap.pos - a.length;
        for (let i = 0; i < a.length; i++) { const j = from + i; a[i] = j < 0 || j >= src.length ? 0 : src[j] / 32768; }
      },
    });
    this.analyserL = channel(L);
    this.analyserR = channel(R);
    this.ctx = { sampleRate };
  }

  get duration() { return this.L.length / this.sr; }
  seek(t) { this.pos = Math.round(t * this.sr); }

  #spectrum() {
    if (this.done === this.pos) return;
    this.done = this.pos;
    const { N, re, im, win, L, R } = this;
    const from = this.pos - N;
    for (let i = 0; i < N; i++) {
      const j = from + i;
      re[i] = j < 0 || j >= L.length ? 0 : ((L[j] + R[j]) / 65536) * win[i];
      im[i] = 0;
    }
    this.fft(re, im);
    for (let k = 0; k < N / 2; k++) {
      const m = Math.hypot(re[k], im[k]) / N;
      this.db[k] = m > 1e-12 ? 20 * Math.log10(m) : -240;
    }
  }
}
