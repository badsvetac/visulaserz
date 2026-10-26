// Finding the key of the music by ear, for the tools that play along (Theremin, Chords, Mic FX).
// For a few seconds every frame of the music's own spectrum (before any effect or tool) is folded
// into twelve pitch classes; the result is compared with the Krumhansl–Kessler profiles of every
// major and minor key, and the best match wins. Partials below ~350 Hz are left out, where the
// FFT's bins are wider than a semitone and would smear one note across three.

export const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function correlate(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return num / Math.sqrt(da * db || 1);
}

// Returns a listener: call start(), then tick(dt) every frame; onDone({ root, minor, name }) or
// onFail(message) is called once it has heard enough (or not).
export function keyListener(host, { seconds = 6, onDone, onFail }) {
  let job = null;
  return {
    get busy() { return !!job; },
    start() {
      if (job) return false;
      if (!host.analysis.active) { onFail?.('Play the track first, then press Listen.'); return false; }
      job = { chroma: new Float64Array(12), frames: 0, t: 0 };
      return true;
    },
    tick(dt) {
      if (!job) return;
      job.t += dt;
      const sp = host.audio.spectrum();
      if (sp && host.analysis.active) {
        const { data, binHz } = sp;
        const lo = Math.ceil(350 / binHz), hi = Math.min(data.length - 1, Math.floor(4200 / binHz));
        for (let i = lo; i <= hi; i++) {
          const amp = Math.pow(10, data[i] / 20);              // amplitude, not power: the loudest partial must not decide alone
          const m = 69 + 12 * Math.log2((i * binHz) / 440);
          job.chroma[((Math.round(m) % 12) + 12) % 12] += amp;
        }
        job.frames++;
      }
      if (job.t < seconds) return;
      const c = [...job.chroma];
      const heard = job.frames > 60;
      job = null;
      if (!heard) { onFail?.('Not enough music was heard. Play the track and try again.'); return; }
      let best = { score: -2, root: 0, minor: false };
      for (let r = 0; r < 12; r++) {
        const turned = c.map((_, i) => c[(i + r) % 12]);
        const maj = correlate(turned, MAJOR), min = correlate(turned, MINOR);
        if (maj > best.score) best = { score: maj, root: r, minor: false };
        if (min > best.score) best = { score: min, root: r, minor: true };
      }
      onDone?.({ root: best.root, minor: best.minor, name: `${NOTES[best.root]} ${best.minor ? 'minor' : 'major'}` });
    },
    cancel() { job = null; },
  };
}
