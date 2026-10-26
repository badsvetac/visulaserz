// The tape: an AudioWorklet that keeps the last few seconds of the mix in a ring, with a read head
// that can leave the live signal to loop a slice of it (a beat roll), play it backwards, or follow
// a hand (a scratch). The recording carries on underneath whatever the head is doing, so letting
// go always lands on the music as it is now, not where the trick began: "slip", as DJs call it.
//
// Every change of what the head does is a 5 ms crossfade between the old head and the new one, a
// slice loops with an equal-power crossfade into the sound just before its start (so the seam is
// as smooth as the record), and a hand-held head plays louder the faster it moves, the way a
// cartridge does, so a record held still is silent instead of a stuck sample.
//
// Messages, all times on the audio clock (context seconds):
//   { type: 'live' }                      back to the music
//   { type: 'loop', at, len }             repeat [at, at + len)
//   { type: 'reverse', at }               play backwards from `at`
//   { type: 'grab' }                      a hand stops the record where it is
//   { type: 'hand', delta }               the hand moved the record by `delta` frames
//   { type: 'cut', on }                   the crossfader cut: silence while on
//   { type: 'dump', id, at, len }         send back a copy of [at, at + len) as { type: 'dump', id, L, R }
//   { type: 'end' }                       let the processor go
//
// Made with numberOfOutputs: 0 it only listens: the ring fills and 'dump' works, but nothing it
// does can reach the speakers (the Studio's slicer, which sits beside the song, not in its way).
export const TAPE_SOURCE = `
class VzTape extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.size = Math.ceil((options.processorOptions && options.processorOptions.seconds || 6) * sampleRate);
    this.buf = [new Float32Array(this.size), new Float32Array(this.size)];
    this.cur = { mode: 'live' };
    this.old = null;
    this.fade = 1;
    this.step = 1 / Math.max(1, Math.round(0.005 * sampleRate));
    this.cut = 1;
    this.cutTo = 1;
    this.alive = true;
    this.port.onmessage = (e) => this.command(e.data);
  }
  command(m) {
    let next = null;
    if (m.type === 'live') next = { mode: 'live' };
    else if (m.type === 'loop') {
      const L = Math.max(64, Math.round(m.len * sampleRate));
      next = { mode: 'loop', S: Math.round(m.at * sampleRate), L, X: Math.max(16, Math.min(Math.round(0.004 * sampleRate), L >> 2)) };
    } else if (m.type === 'reverse') next = { mode: 'reverse', F: Math.round(m.at * sampleRate) };
    else if (m.type === 'grab') {
      const f = currentFrame;
      next = { mode: 'scrub', pos: f, vel: this.cur.mode === 'scrub' ? this.cur.vel : 1, hand: f };
    } else if (m.type === 'hand') { if (this.cur.mode === 'scrub') this.cur.hand += m.delta; return; }
    else if (m.type === 'cut') { this.cutTo = m.on ? 0 : 1; return; }
    else if (m.type === 'dump') {
      const from = Math.round(m.at * sampleRate);
      const len = Math.max(1, Math.min(this.size - 256, Math.round(m.len * sampleRate)));
      const L = new Float32Array(len), R = new Float32Array(len);
      for (let k = 0; k < len; k++) { L[k] = this.at(0, from + k); R[k] = this.at(1, from + k); }
      this.port.postMessage({ type: 'dump', id: m.id, L, R }, [L.buffer, R.buffer]);
      return;
    }
    else if (m.type === 'end') { this.alive = false; return; }
    if (!next) return;
    this.old = this.cur;
    this.fade = 0;
    this.cur = next;
  }
  at(c, f) { const s = this.size; return this.buf[c][((f % s) + s) % s]; }
  voice(v, f, c, newest) {
    if (v.mode === 'live') return this.at(c, f);
    if (v.mode === 'loop') {
      const p = (((f - v.S) % v.L) + v.L) % v.L;
      const a = this.at(c, v.S + p);
      const into = p - (v.L - v.X);
      if (into <= 0) return a;
      const w = (into / v.X) * 1.5707963;
      return a * Math.cos(w) + this.at(c, v.S + p - v.L) * Math.sin(w);
    }
    if (v.mode === 'reverse') {
      const r = 2 * v.F - f;
      return r > newest - this.size + 2 ? this.at(c, r) : 0;
    }
    const i = Math.floor(v.pos), t = v.pos - i;
    const s = this.at(c, i) * (1 - t) + this.at(c, i + 1) * t;
    return s * Math.min(1, Math.abs(v.vel) * 2);
  }
  advance(v, f) {
    if (v.mode !== 'scrub') return;
    let want = (v.hand - v.pos) / (0.02 * sampleRate);
    if (want > 4) want = 4; else if (want < -4) want = -4;
    v.vel += (want - v.vel) * (240 / sampleRate);
    v.pos += v.vel;
    const hi = f - 2, lo = f - this.size + 4;
    if (v.hand > hi) v.hand = hi;
    if (v.hand < lo) v.hand = lo;
    if (v.pos > hi) { v.pos = hi; if (v.vel > 1) v.vel = 1; }
    if (v.pos < lo) { v.pos = lo; v.vel = 0; }
  }
  process(inputs, outputs) {
    const inp = inputs[0] || [], out = outputs[0];
    const inL = inp[0], inR = inp[1] || inp[0];
    const n = out && out[0] ? out[0].length : inL ? inL.length : 128, f0 = currentFrame, size = this.size;
    for (let k = 0; k < n; k++) {
      const j = (f0 + k) % size;
      this.buf[0][j] = inL ? inL[k] : 0;
      this.buf[1][j] = inR ? inR[k] : 0;
    }
    if (!out || !out.length) return this.alive;
    const L = out[0], R = out[1] || out[0];
    const newest = f0 + n - 1;
    for (let k = 0; k < n; k++) {
      const f = f0 + k;
      this.advance(this.cur, f);
      let l = this.voice(this.cur, f, 0, newest), r = this.voice(this.cur, f, 1, newest);
      if (this.fade < 1) {
        if (this.old) {
          this.advance(this.old, f);
          const a = this.fade, b = 1 - a;
          l = l * a + this.voice(this.old, f, 0, newest) * b;
          r = r * a + this.voice(this.old, f, 1, newest) * b;
        }
        this.fade += this.step;
        if (this.fade >= 1) { this.fade = 1; this.old = null; }
      }
      if (this.cut !== this.cutTo) {
        this.cut += (this.cutTo - this.cut) * (960 / sampleRate);
        if (Math.abs(this.cut - this.cutTo) < 1e-4) this.cut = this.cutTo;
      }
      L[k] = l * this.cut;
      if (R !== L) R[k] = r * this.cut;
    }
    return this.alive;
  }
}
registerProcessor('vz-tape', VzTape);
`;
