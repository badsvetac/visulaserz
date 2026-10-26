// DECK — the playback engine of one DJ deck, on the audio thread.
//
// A deck has to do things an <audio> element cannot: run backwards under a hand on the platter,
// jump to a hot cue on the exact sample a beat lands, loop a quarter of a beat cleanly, keep a
// "shadow" playhead running while a roll stutters so the track picks up where it would have been,
// and change tempo without changing key. So the decoded track lives here as two Int16 arrays and
// this processor reads it at whatever speed the deck is moving.
//
// Speed comes from four places. The tempo fader sets the rate; the jog wheel's rim bends it while
// you push it (nudging two tracks into phase); the platter's "motor" ramps it up on PLAY and down
// on PAUSE, like a turntable starting and braking; and when a hand is on the platter, the playhead
// stops obeying all of that and chases the platter's position instead — that is a scratch.
//
// There are two ways to read the track. The direct way reads between samples with a four-point
// Catmull-Rom curve, so slowed and scratched audio stays smooth, and pitch follows speed like
// vinyl. With key lock on and the tempo moved, playback goes through WSOLA instead: the track is cut
// into overlapping 40 ms frames, each frame read at the original pitch from where the tempo says
// the music should be by now — nudged to the spot within ±12 ms that lines up best with the frame
// before — and the frames are laid end to end again under a crossfade. (It is the method Chrome
// uses for an <audio> element's preservesPitch.) Every jump — a cue, a loop wrapping round, a beat
// jump — and every switch between the two ways is crossfaded over a few milliseconds, so none clicks.
const FADE = 256;               // samples over which a jump is crossfaded
const REPORT_HZ = 60;           // position reports per second
const MAX_SCRATCH = 8;          // how fast a hand can throw the record, in multiples of normal speed

class DeckProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.L = null;
    this.R = null;
    this.len = 0;
    this.step = 1;              // source frames per output sample at normal speed
    this.pos = 0;               // the playhead, in source frames
    this.playing = false;
    this.tempo = 1;             // the tempo fader, as a rate
    this.bend = 0;              // the jog rim's push, added to the rate
    this.motor = 0;             // 0 stopped … 1 at speed
    this.startTau = 0.004;      // seconds for the motor to come up to speed
    this.brakeTau = 0.05;       // … and to stop
    this.scratching = false;
    this.target = 0;            // where the hand has put the record, in source frames
    this.vel = 0;               // the playhead's speed while scratching
    this.loop = null;           // [start, end) in source frames
    this.slipping = false;      // a roll or slip scratch: the shadow runs on underneath
    this.shadow = 0;
    this.jumpAt = -1;           // a quantised jump waiting for its beat
    this.jumpTo = 0;
    this.fade = 0;              // samples of a jump's crossfade left, where the old audio was, its speed
    this.fadePos = 0;
    this.fadeSpeed = 0;
    this.keylock = false;
    this.stretching = false;
    this.xLeft = 0;             // a switch between the two ways of reading: the old one fading out
    this.xLen = 1;
    this.xFrom = 0;             // 0: the old way was direct, 1: it was WSOLA
    this.xPos = 0;
    this.xSpeed = 0;
    this.sl = 0;                // the sample just produced
    this.sr = 0;
    this.amp = 0;               // output level: a record barely moving makes no sound, it does not hold a note
    this.ended = false;
    this.sinceReport = 0;
    this.moving = false;        // whether the last position report was of a moving record
    this.initStretch();
    this.port.onmessage = (e) => this.message(e.data);
  }

  // ── WSOLA state ───────────────────────────────────────────────────────────
  initStretch() {
    const N = 2 * Math.round(0.02 * sampleRate);   // ~40 ms frames
    this.N = N;
    this.H = N / 2;                                // 50 % overlap
    this.SEEK = Math.round(0.012 * sampleRate);    // search ±12 ms for the best fit
    this.win = new Float32Array(N);
    for (let i = 0; i < N; i++) this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); // periodic Hann: overlapping halves sum to 1
    this.tailL = new Float32Array(this.H);
    this.tailR = new Float32Array(this.H);
    this.outL = new Float32Array(this.H);
    this.outR = new Float32Array(this.H);
    this.TPL = Math.floor(this.H / 4);             // template points: every 4th sample of half a frame
    this.tpl = new Float32Array(this.TPL);
    this.resetStretch(0);
  }

  resetStretch(at) {
    this.ana = at;              // where the next frame nominally starts
    this.prev = -1;             // where the frame being heard started (-1: nothing to continue from)
    this.outIdx = this.H;       // no output waiting
    this.tailL.fill(0);
    this.tailR.fill(0);
  }

  message(m) {
    switch (m.type) {
      case 'load':
        this.L = m.L; this.R = m.R; this.len = m.length;
        this.step = m.rate / sampleRate;
        this.pos = 0; this.shadow = 0; this.playing = false; this.motor = 0;
        this.loop = null; this.jumpAt = -1; this.scratching = false; this.slipping = false;
        this.fade = 0; this.xLeft = 0; this.ended = false; this.vel = 0; this.stretching = false;
        this.resetStretch(0);
        break;
      case 'unload':
        this.L = this.R = null; this.len = 0; this.playing = false;
        break;
      case 'play':
        this.playing = !!m.on;
        if (this.playing) this.ended = false;
        if (!this.playing && m.instant) this.motor = 0;      // CUE stops dead, PAUSE brakes
        break;
      case 'seek':
        this.jumpAt = -1;
        this.jump(m.frame);
        this.shadow = this.heardPos();
        break;
      case 'jumpAt':                      // jump when the playhead reaches a beat
        this.jumpAt = m.at; this.jumpTo = m.to;
        break;
      case 'tempo': this.tempo = m.value; break;
      case 'bend': this.bend = m.value; break;
      case 'motor': this.startTau = m.start; this.brakeTau = m.brake; break;
      case 'keylock': this.keylock = !!m.on; break;
      case 'scratch':
        if (m.on && !this.scratching) { this.target = this.heardPos(); this.vel = this.speedNow(); }
        this.scratching = !!m.on;
        if (m.slip) this.slip(!!m.on);
        break;
      case 'scratchTo': this.target = m.frame; break;
      case 'loop':
        this.loop = m.on ? [m.start, m.end] : null;
        if (m.on) { const p = this.heardPos(); if (p < m.start || p >= m.end) this.jump(m.start); }
        break;
      case 'slip': this.slip(!!m.on); break;
    }
  }

  // A roll or a slip scratch starts: the shadow carries on at normal speed. When it ends, the
  // playhead goes back to the shadow, so the track carries on as if it had never been touched.
  slip(on) {
    if (on && !this.slipping) { this.slipping = true; this.shadow = this.heardPos(); }
    else if (!on && this.slipping) { this.slipping = false; this.jump(this.shadow); }
  }

  speedNow() { return (this.tempo + this.bend) * this.motor; }

  // where the audio being heard comes from
  heardPos() { return this.stretching ? (this.prev >= 0 ? this.prev + this.outIdx * this.step : this.ana) : this.pos; }

  jump(to) {
    if (!this.L) return;
    const target = Math.max(0, Math.min(to, this.len - 1));
    this.ended = false;
    if (this.stretching) {
      // the overlap-add itself is the crossfade: the new frame fades in over the old one's tail
      this.ana = target;
      this.prev = -1;
      this.pos = target;
      return;
    }
    this.fadePos = this.pos;
    this.fadeSpeed = this.scratching ? this.vel : this.speedNow();
    this.fade = FADE;
    this.pos = target;
  }

  // Catmull-Rom between samples, reading Int16 data
  read(ch, p) {
    const i = Math.floor(p);
    const f = p - i;
    const n = this.len;
    const a = i > 0 && i <= n ? ch[i - 1] : 0;
    const b = i >= 0 && i < n ? ch[i] : 0;
    const c = i + 1 >= 0 && i + 1 < n ? ch[i + 1] : 0;
    const d = i + 2 >= 0 && i + 2 < n ? ch[i + 2] : 0;
    return (b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)))) * (1 / 32768);
  }

  mono(p) {
    const i = Math.floor(p);
    if (i < 0 || i + 1 >= this.len) return 0;
    const f = p - i;
    return (this.L[i] + this.R[i]) * (1 - f) + (this.L[i + 1] + this.R[i + 1]) * f;
  }

  // ── WSOLA: one more frame at the original pitch ─────────────────────────────
  nextFrame(speed) {
    const { N, H, step, win, tpl, TPL, SEEK } = this;
    if (this.loop && this.ana >= this.loop[1]) { this.ana -= this.loop[1] - this.loop[0]; this.prev = -1; }
    let start = this.ana;
    if (this.prev >= 0) {
      // the template: how the last frame would carry on if nothing had been cut
      const natural = this.prev + H * step;
      let te = 0;
      for (let k = 0; k < TPL; k++) { const v = this.mono(natural + k * 4 * step); tpl[k] = v; te += v * v; }
      if (te > 1) {
        let best = 0, bestScore = -Infinity;
        const score = (d) => {
          let s = 0, e = 1e-9;
          const base = this.ana + d * step;
          for (let k = 0; k < TPL; k++) { const v = this.mono(base + k * 4 * step); s += tpl[k] * v; e += v * v; }
          return s / Math.sqrt(e);
        };
        for (let d = -SEEK; d <= SEEK; d += 4) { const s = score(d); if (s > bestScore) { bestScore = s; best = d; } }
        const coarse = best;
        for (let d = coarse - 3; d <= coarse + 3; d++) { if (d === coarse) continue; const s = score(d); if (s > bestScore) { bestScore = s; best = d; } }
        start = this.ana + best * step;
      }
    }
    // read the frame, window it, lay its first half over the last frame's tail
    for (let k = 0; k < H; k++) {
      const p = start + k * step, w = win[k];
      this.outL[k] = this.tailL[k] + this.read(this.L, p) * w;
      this.outR[k] = this.tailR[k] + this.read(this.R, p) * w;
    }
    for (let k = H; k < N; k++) {
      const p = start + k * step, w = win[k];
      this.tailL[k - H] = this.read(this.L, p) * w;
      this.tailR[k - H] = this.read(this.R, p) * w;
    }
    this.prev = start;
    this.ana += H * step * speed;
    this.outIdx = 0;
  }

  // one sample of WSOLA output into sl/sr
  stretchStep(speed) {
    if (this.outIdx >= this.H) this.nextFrame(speed);
    this.sl = this.outL[this.outIdx];
    this.sr = this.outR[this.outIdx];
    this.outIdx++;
  }

  // one sample read directly into sl/sr, moving the playhead (and handling loops and cued jumps)
  directStep(speed) {
    const p = this.pos;
    let l = 0, r = 0;
    if (p < this.len - 1 || speed < 0) { l = this.read(this.L, p); r = this.read(this.R, p); }
    if (this.fade > 0) {
      const w = this.fade / FADE;
      l = l * (1 - w) + this.read(this.L, this.fadePos) * w;
      r = r * (1 - w) + this.read(this.R, this.fadePos) * w;
      this.fadePos += this.step * this.fadeSpeed;
      this.fade--;
    }
    const next = p + speed * this.step;
    if (this.jumpAt >= 0 && speed > 0 && p < this.jumpAt && next >= this.jumpAt) {
      const to = this.jumpTo + (next - this.jumpAt);
      this.jumpAt = -1;
      this.pos = next;
      this.jump(to);
    } else if (this.loop && speed > 0 && next >= this.loop[1]) {
      this.pos = next;
      this.jump(next - (this.loop[1] - this.loop[0]));
    } else {
      this.pos = next;
    }
    this.sl = l;
    this.sr = r;
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const oL = out[0], oR = out[1] || out[0];
    const n = oL.length;
    if (!this.L) {
      oL.fill(0);
      if (oR !== oL) oR.fill(0);
      this.report(n, 0);
      return true;
    }

    // block-rate control: the motor, and the hand on the platter
    const tau = this.playing ? this.startTau : this.brakeTau;
    this.motor += ((this.playing ? 1 : 0) - this.motor) * (1 - Math.exp(-n / (sampleRate * Math.max(tau, 1e-4))));
    if (!this.playing && this.motor < 1e-4) this.motor = 0;
    if (this.scratching) {
      const want = (this.target - this.pos) / (n * 3 * this.step);     // catch the platter in about three blocks
      this.vel += (Math.max(-MAX_SCRATCH, Math.min(MAX_SCRATCH, want)) - this.vel) * 0.5;
    }
    const speed = this.scratching ? this.vel : this.speedNow();

    // key lock: WSOLA while running at speed with the tempo moved; direct reading otherwise
    const stretch = this.keylock && !this.scratching && this.motor > 0.999 && Math.abs(speed - 1) > 1e-4 && speed > 0.25;
    if (stretch !== this.stretching) {
      if (stretch) {
        this.xFrom = 0; this.xPos = this.pos; this.xSpeed = speed; this.xLeft = this.xLen = this.H;
        this.resetStretch(this.pos);
        this.fade = 0;
      } else {
        this.pos = this.heardPos();
        this.xFrom = 1; this.xSpeed = speed; this.xLeft = this.xLen = FADE;
      }
      this.stretching = stretch;
    }

    const step = this.step;
    const ampFrom = this.amp, ampTo = Math.min(1, Math.abs(speed) * 25);
    this.amp = ampTo;
    for (let i = 0; i < n; i++) {
      if (this.stretching) {
        this.stretchStep(speed);
        this.pos = this.ana;
        if (this.jumpAt >= 0 && this.heardPos() >= this.jumpAt) {
          const to = this.jumpTo + (this.heardPos() - this.jumpAt);
          this.jumpAt = -1;
          this.jump(to);
        }
      } else {
        this.directStep(speed);
      }
      let l = this.sl, r = this.sr;
      if (this.xLeft > 0) {
        // the way of reading just left behind, fading out under the new one
        const w = this.xLeft / this.xLen;
        let ol, or;
        if (this.xFrom === 0) {
          ol = this.read(this.L, this.xPos); or = this.read(this.R, this.xPos);
          this.xPos += step * this.xSpeed;
        } else {
          this.stretchStep(this.xSpeed);
          ol = this.sl; or = this.sr;
        }
        l = l * (1 - w) + ol * w;
        r = r * (1 - w) + or * w;
        this.xLeft--;
      }
      const a = ampFrom + (ampTo - ampFrom) * (i / n);
      oL[i] = l * a;
      oR[i] = r * a;
      if (this.slipping && this.playing) this.shadow += step * this.tempo;
    }

    // the ends of the record
    if (this.pos < 0) { this.pos = 0; this.vel = 0; }
    if (!this.slipping) this.shadow = this.heardPos();
    if (this.pos >= this.len - 1 && !this.scratching) {
      this.pos = this.len - 1;
      if (this.stretching) this.ana = this.pos;
      if (this.playing && !this.ended) { this.playing = false; this.ended = true; this.port.postMessage({ type: 'ended' }); }
    }
    this.report(n, speed);
    return true;
  }

  // Only while the record moves, and once more as it comes to rest: a deck standing still (or
  // empty) has nothing new to say, and must not wake the page up sixty times a second.
  report(n, speed) {
    const moving = !!this.L && (speed !== 0 || this.scratching);
    if (!moving && !this.moving) return;
    this.sinceReport += n;
    if (moving && this.sinceReport < sampleRate / REPORT_HZ) return;
    this.sinceReport = 0;
    this.moving = moving;
    this.port.postMessage({ type: 'pos', pos: this.heardPos(), speed, playing: this.playing, t: currentTime });
  }
}

registerProcessor('deck', DeckProcessor);
