// DECKS — two DJ decks and the mixer between them.
//
// Each deck is an AudioWorkletNode running deck-processor.js, which plays the decoded track at any
// speed, scratches, loops and jumps on the beat. This side keeps the deck's musical state — tempo,
// cue, hot cues, loops, sync — and turns presses into messages for the audio thread. Times here are
// seconds of track time; the processor counts source frames.
//
// The mixer follows a club mixer's channel strip: trim, then a three-band isolator (kill any band to
// silence, push it +6 dB), then the same bipolar filter the Perform rack uses, a channel fader, and
// a crossfader with a smooth (constant-power) or a sharp curve. After the master level sits a beat
// FX unit (an echo and a flanger timed to the beat of the deck on air), and the whole mix goes into
// the engine's effect chain exactly where a track or live input would, so the rack, the analysis,
// the scenes and REC all take it from there.
import { clamp, store, isPhone } from '../util.js';
import { djFilterCurve } from './dj-filter.js';

export const DECODE_RATE = 48000;      // tracks are decoded at this rate whatever the device runs at
// A decoded deck holds the whole track in memory (about 23 MB a minute while it is decoded), so a
// phone or a small machine takes shorter tracks than a computer does.
const SMALL_DEVICE = isPhone || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4);
const MAX_MINUTES = SMALL_DEVICE ? 12 : 20;
const MAX_SECONDS = MAX_MINUTES * 60;
export const REV_SECONDS = 1.8;        // one turn of the jog wheel, as on a CDJ (33⅓ rpm)
export const HOT_COLORS = ['#ff3d8f', '#ff5a36', '#ffa236', '#ffe23a', '#68f04a', '#33e6c8', '#3d8bff', '#a85cff'];
export const TEMPO_RANGES = [8, 16, 50];
export const FX_BEATS = [0.25, 0.5, 0.75, 1, 2, 4];

const workletReady = new WeakMap();
function loadWorklet(ctx) {
  if (!workletReady.has(ctx)) {
    const job = ctx.audioWorklet.addModule(typeof __VZ_WORKLET_URL__ === 'string' ? __VZ_WORKLET_URL__ : new URL('./deck-processor.js', import.meta.url));
    // a failed fetch (a dropped connection) is forgotten, so the next press of DJ tries again
    workletReady.set(ctx, job.catch((e) => { workletReady.delete(ctx); throw e; }));
  }
  return workletReady.get(ctx);
}

// How long a track is, before anything big is fetched or decoded: what the crate already knows
// (YouTube and the server say), or else what the browser reads from the file's header.
function probeSeconds(track) {
  const known = Number(track.duration);
  if (known > 0) return Promise.resolve(known);
  return new Promise((resolve) => {
    const a = new Audio();
    const done = (s) => {
      clearTimeout(timer);
      a.onloadedmetadata = a.onerror = null;
      a.removeAttribute('src');
      a.load();
      resolve(Number.isFinite(s) ? s : 0);
    };
    const timer = setTimeout(() => done(0), 2500);        // no answer: the check after decoding still holds
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    a.src = track.url;
  });
}
const tooLong = () => new Error(`Decks take tracks up to ${MAX_MINUTES} minutes${SMALL_DEVICE ? ' on this device' : ''}.`);

// one analysis worker for both decks: it reads each track once, and later polishes tapped tempos
let worker = null;
let jobId = 0;
const jobs = new Map();
function ask(msg, transfer = []) {
  if (!worker) {
    worker = new Worker(typeof __VZ_WORKER_URL__ === 'string' ? __VZ_WORKER_URL__ : new URL('./track-analysis.js', import.meta.url));
    worker.onmessage = (e) => {
      const job = jobs.get(e.data.id);
      if (!job) return;
      jobs.delete(e.data.id);
      if (e.data.error) job.reject(new Error(e.data.error));
      else job.resolve(e.data);
    };
  }
  const id = ++jobId;
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject });
    worker.postMessage({ id, ...msg }, transfer);
  });
}
const analyse = (mono, rate) => ask({ mono, rate }, [mono.buffer]);     // the answer's id names the track for a refine

const trackKey = (t) => (t.source === 'youtube' ? `yt:${t.id}` : `file:${t.title}`);

// ── one deck ─────────────────────────────────────────────────────────────────
export class Deck extends EventTarget {
  constructor(mixer, id) {
    super();
    this.mixer = mixer;
    this.id = id;
    this.ctx = mixer.ctx;
    this.node = new AudioWorkletNode(this.ctx, 'deck', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    this.node.port.onmessage = (e) => this.#onMessage(e.data);
    this.track = null;
    this.info = null;                  // what the analysis found: bins, bpm, first beat, loudness…
    this.duration = 0;
    this.loading = null;               // the track being loaded, while it is
    this.pos = 0;                      // last reported position (s), its speed, and when (ctx time)
    this.speed = 0;
    this.posAt = 0;
    this.playing = false;
    this.tempo = 0;                    // percent
    this.range = 8;
    this.keylock = store.get('dj:keylock', true);
    this.slipMode = false;
    this.cue = 0;
    this.hot = new Array(8).fill(null);
    this.loop = null;                  // { start, end, beats } while a loop is on
    this.lastLoop = null;              // for RELOOP
    this.loopIn = null;
    this.roll = null;
    this.synced = false;
    this.previewing = false;           // CUE held on the cue point: playing until it is let go
    this.keepPlaying = false;
    this.scratchBase = 0;
    this.seekAt = 0;
    this.token = 0;
    this.send({ type: 'keylock', on: this.keylock });
  }

  send(msg, transfer) { this.node.port.postMessage(msg, transfer || []); }
  #emit(type) { this.dispatchEvent(new Event(type)); }

  #onMessage(m) {
    if (m.type === 'pos') {
      if (m.t < this.seekAt) return;              // sent before our last seek reached the audio thread
      this.pos = m.pos / DECODE_RATE;
      this.speed = m.speed;
      this.posAt = m.t;
    } else if (m.type === 'ended') {
      this.playing = false;
      this.previewing = false;
      this.taps = null;
      this.#emit('state');
      this.#emit('ended');
    }
  }

  get loaded() { return !!this.info; }
  get bpm() { return this.info?.bpm || 0; }
  get liveBpm() { return this.bpm * (1 + this.tempo / 100); }
  get period() { return this.bpm ? 60 / this.bpm : 0.5; }
  get first() { return this.info?.first || 0; }
  get quantize() { return this.mixer.quantize && this.bpm > 0; }

  // where the playhead is now, between reports
  get position() {
    if (!this.loaded) return 0;
    const dt = Math.max(0, this.ctx.currentTime - this.posAt);
    return clamp(this.pos + this.speed * dt, 0, this.duration);
  }

  // which beat of the bar (0–3) and how far through it, counting bars from the first beat
  beatAt(t = this.position) {
    const b = (t - this.first) / this.period;
    return { beat: Math.floor(b), frac: b - Math.floor(b) };
  }

  snap(t) {
    if (!this.quantize) return t;
    return this.first + Math.round((t - this.first) / this.period) * this.period;
  }

  // ── loading ──────────────────────────────────────────────────────────────
  async load(track) {
    if (this.playing) throw new Error(`Deck ${this.id} is playing. Pause it first.`);
    const my = ++this.token;
    this.loading = track;
    this.#emit('loading');
    try {
      // too long is said before anything is downloaded or decoded, not after the memory is gone
      if (await probeSeconds(track) > MAX_SECONDS + 1) throw tooLong();
      if (my !== this.token) return;
      const res = await fetch(track.url);
      if (!res.ok) throw new Error(res.status === 404 ? 'This track is no longer available. Load it again from the crate.' : `The track could not be fetched (HTTP ${res.status}).`);
      const data = await res.arrayBuffer();
      if (my !== this.token) return;
      let audio = await new OfflineAudioContext(2, 1, DECODE_RATE).decodeAudioData(data);
      if (my !== this.token) return;
      if (audio.duration > MAX_SECONDS + 1) throw tooLong();   // a header that said less than the file holds
      const len = audio.length;
      let cl = audio.getChannelData(0);
      let cr = audio.numberOfChannels > 1 ? audio.getChannelData(1) : cl;
      const L = new Int16Array(len), R = new Int16Array(len);
      for (let i = 0; i < len; i++) {
        L[i] = Math.max(-1, Math.min(1, cl[i])) * 32767;
        R[i] = Math.max(-1, Math.min(1, cr[i])) * 32767;
      }
      // a quarter-rate mono copy for the analysis: plenty for beats and a three-band picture
      const mono = new Float32Array(Math.floor(len / 4));
      for (let j = 0, i = 0; j < mono.length; j++, i += 4) {
        mono[j] = (cl[i] + cl[i + 1] + cl[i + 2] + cl[i + 3] + cr[i] + cr[i + 1] + cr[i + 2] + cr[i + 3]) * 0.125;
      }
      audio = cl = cr = null;            // the decoded floats (the biggest copy) can go before the analysis waits
      const info = await analyse(mono, DECODE_RATE / 4);
      if (my !== this.token) return;
      this.send({ type: 'load', L, R, length: len, rate: DECODE_RATE }, [L.buffer, R.buffer]);
      this.track = track;
      this.info = info;
      this.duration = len / DECODE_RATE;
      this.loop = this.lastLoop = this.loopIn = this.roll = null;
      this.synced = false;
      this.previewing = false;
      const saved = store.get(`cues:${trackKey(track)}`, null);
      info.found = { bpm: info.bpm, first: info.first };   // what the analysis heard, for RESET
      if (saved?.grid?.bpm > 0) { info.bpm = saved.grid.bpm; info.first = saved.grid.first; }
      this.hot = saved?.hot?.length === 8 ? saved.hot : new Array(8).fill(null);
      this.cue = saved?.cue ?? this.#firstCue();
      this.send({ type: 'tempo', value: 1 + this.tempo / 100 });
      this.seek(this.cue);
      this.mixer.autoGain(this);
    } catch (e) {
      // the deck lets go of "Loading…" (unless a newer load has taken over), and says why plainly
      if (my === this.token) { this.loading = null; this.#emit('state'); }
      if (e?.name === 'EncodingError') throw new Error('This file could not be decoded. Try another file or format.');
      if (e instanceof TypeError && /fetch/i.test(e.message)) throw new Error('The track could not be downloaded. Check the connection and try again.');
      throw e;
    } finally {
      if (my === this.token) this.loading = null;
    }
    this.#emit('load');
    this.#emit('state');
  }

  // the first cue: the first beat at or just before the music starts
  #firstCue() {
    const s = this.info.start;
    if (!this.bpm) return s;
    const b = Math.floor((s - this.first) / this.period + 0.02);
    return Math.max(0, this.first + b * this.period);
  }

  #saveCues() {
    if (this.track) store.set(`cues:${trackKey(this.track)}`, { cue: this.cue, hot: this.hot, grid: this.gridEdited ? { bpm: this.bpm, first: this.first } : null });
  }

  // whether the grid is someone's correction rather than what the analysis heard
  get gridEdited() {
    const f = this.info?.found;
    return !!f && (Math.abs(f.bpm - this.info.bpm) > 1e-6 || Math.abs(f.first - this.info.first) > 1e-4);
  }

  // ── the beat grid, by hand ───────────────────────────────────────────────
  // The analysis cannot always tell a beat from its off-beat in syncopated music, or 87 from 174
  // BPM, and in a heavily slowed, reverb-soaked track it may hear no steady beat at all. These fix
  // the grid by hand, and the fix is remembered for the track.
  #setGrid(bpm, first) {
    if (!this.info || !(bpm > 0)) return;
    const period = 60 / bpm;
    this.info.bpm = Math.round(bpm * 1000) / 1000;
    this.info.first = ((first % period) + period) % period;
    // A synced deck follows at whichever of the same, double or half time is nearest. Calling 87
    // BPM 174 changes nothing you hear, so that choice is made again, and the speed stays.
    for (const d of [this, this.mixer.other(this)]) if (d.synced && d.bpm) d.syncFactor = d.#syncFactor(d.mixer.other(d).liveBpm);
    this.#saveCues();
    this.#emit('tempo');
    this.#emit('grid');
  }
  gridDouble() { if (this.bpm && this.bpm * 2 <= 250) this.#setGrid(this.bpm * 2, this.first); }
  gridHalve() { if (this.bpm && this.bpm / 2 >= 40) this.#setGrid(this.bpm / 2, this.first); }
  gridShift(beats) { if (this.bpm) this.#setGrid(this.bpm, this.first + beats * this.period); }
  gridReset() { const f = this.info?.found; if (f) this.#setGrid(f.bpm, f.first); }
  // TAP: tap along with the beat while the deck plays. From the fourth tap the grid follows the
  // taps, and the track's own onsets then place it exactly. A pause of two seconds starts afresh.
  tap() {
    if (!this.loaded) return 'empty';
    if (!this.playing) return 'paused';
    const now = performance.now(), p = this.position;
    const last = this.taps?.list.at(-1);
    if (!this.taps || now - this.taps.at > 2000 || p < last || p - last > 3) { this.taps = { list: [] }; this.tapExact = false; }
    this.taps.at = now;
    this.taps.list.push(p);
    if (this.taps.list.length >= 4) this.gridFromTaps(this.taps.list.slice(-32));
    return this.taps.list.length;
  }

  // a grid through a run of beat times (seconds of track time, so the tempo fader does not matter)
  async gridFromTaps(times) {
    if (!this.info || times.length < 2) return;
    const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
    const typical = gaps[Math.floor(gaps.length / 2)];
    if (!(typical > 0.24 && typical < 1.5)) return;
    // number the beats, so that one missed tap does not halve the tempo, and fit a line through them
    const idx = [0];
    for (let k = 1; k < times.length; k++) idx.push(idx[k - 1] + Math.max(1, Math.round((times[k] - times[k - 1]) / typical)));
    const m = times.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let k = 0; k < m; k++) { sx += idx[k]; sy += times[k]; sxx += idx[k] ** 2; sxy += idx[k] * times[k]; }
    const beat = (m * sxy - sx * sy) / (m * sxx - sx * sx);
    if (!(beat > 0.24 && beat < 1.5)) return;
    const at = (sy - beat * sx) / m + beat * idx[m - 1];     // the last tap, on the fitted line
    // The taps alone are good to a BPM or so: show them at once, unless an exact grid near them is up.
    if (!this.tapExact || Math.abs(60 / beat / this.bpm - 1) > 0.015) this.#setGrid(60 / beat, at);
    const info = this.info, my = (this.tapJob = (this.tapJob || 0) + 1);
    try {
      const r = await ask({ refine: info.id, bpm: 60 / beat, near: at });
      if (my !== this.tapJob || this.info !== info) return;
      this.tapExact = true;
      this.#setGrid(r.bpm, r.first);
    } catch { /* the rough grid stays */ }
  }

  // ── transport ────────────────────────────────────────────────────────────
  #start() { this.playing = true; this.send({ type: 'play', on: true }); this.#emit('state'); }
  #stop(instant = false) { this.playing = false; this.send({ type: 'play', on: false, instant }); this.#emit('state'); }

  play() {
    if (!this.loaded) return;
    if (this.previewing) this.keepPlaying = true;
    this.#start();
  }
  pause() { this.previewing = false; this.#stop(); }
  togglePlay() { if (this.playing && !this.previewing) this.pause(); else this.play(); }

  // CUE, the way a CDJ does it. Playing: back to the cue point, stopped. Stopped somewhere else:
  // the cue moves here. Stopped on the cue point: it plays for as long as CUE is held.
  cueDown() {
    if (!this.loaded) return;
    if (this.playing && !this.previewing) { this.#stop(true); this.seek(this.cue); return; }
    const p = this.position;
    if (Math.abs(p - this.cue) > 0.03) {
      this.cue = this.snap(p);
      this.seek(this.cue);
      this.#saveCues();
      this.#emit('cues');
      return;
    }
    this.previewing = true;
    this.keepPlaying = false;
    this.#start();
  }
  cueUp() {
    if (!this.previewing) return;
    this.previewing = false;
    if (this.keepPlaying) return;
    this.#stop(true);
    this.seek(this.cue);
  }

  seek(t) {
    if (!this.loaded) return;
    const to = clamp(t, 0, Math.max(0, this.duration - 0.01));
    this.send({ type: 'seek', frame: to * DECODE_RATE });
    this.pos = to;
    this.posAt = this.seekAt = this.ctx.currentTime;
  }

  // a jump that keeps the rhythm: when quantised and playing, it waits for the next beat
  jumpTo(t) {
    if (!this.loaded) return;
    if (this.playing && this.quantize) {
      const p = this.position;
      const at = this.first + Math.ceil((p - this.first) / this.period + 1e-4) * this.period;
      this.send({ type: 'jumpAt', at: at * DECODE_RATE, to: t * DECODE_RATE });
    } else {
      this.seek(t);
    }
  }

  // ── hot cues ─────────────────────────────────────────────────────────────
  hotCue(i) {
    if (!this.loaded) return;
    if (this.hot[i] === null) {
      this.hot[i] = this.snap(this.position);
      this.#saveCues();
      this.#emit('cues');
      return;
    }
    // stopped, a hot cue starts the track from there, as on a CDJ; playing, it jumps on the next beat
    if (!this.playing) { this.seek(this.hot[i]); this.#start(); return; }
    this.jumpTo(this.hot[i]);
  }
  clearHotCue(i) {
    this.hot[i] = null;
    this.#saveCues();
    this.#emit('cues');
  }

  // ── loops ────────────────────────────────────────────────────────────────
  // where a loop of this many beats starts if pressed now: the start of the beat (or of the beat
  // division, for loops shorter than a beat) the playhead is in, so it engages without a jump
  #loopStart(beats) {
    const p = this.position;
    if (!this.quantize) return p;
    const unit = this.period * Math.min(1, beats);
    return this.first + Math.floor((p - this.first) / unit + 1e-6) * unit;
  }

  #setLoop(loop) {
    this.loop = loop;
    if (loop) {
      this.lastLoop = loop;
      this.send({ type: 'loop', on: true, start: loop.start * DECODE_RATE, end: loop.end * DECODE_RATE });
    } else {
      this.send({ type: 'loop', on: false });
    }
    this.#emit('loop');
  }

  beatLoop(beats) {
    if (!this.loaded) return;
    if (this.loop && Math.abs(this.loop.beats - beats) < 1e-6) return this.#setLoop(null);
    const start = this.loop ? this.loop.start : this.#loopStart(beats);
    this.#setLoop({ start, end: start + beats * this.period, beats });
  }
  loopHalve() { if (this.loop && this.loop.beats > 1 / 32) { const b = this.loop.beats / 2; this.#setLoop({ start: this.loop.start, end: this.loop.start + b * this.period, beats: b }); } }
  loopDouble() { if (this.loop && this.loop.beats < 64) { const b = this.loop.beats * 2; this.#setLoop({ start: this.loop.start, end: this.loop.start + b * this.period, beats: b }); } }
  setLoopIn() { if (this.loaded) { this.loopIn = this.snap(this.position); this.#emit('loop'); } }
  setLoopOut() {
    if (!this.loaded || this.loopIn === null) return;
    const end = this.snap(this.position);
    if (end - this.loopIn < 0.02) return;
    this.#setLoop({ start: this.loopIn, end, beats: (end - this.loopIn) / this.period });
    this.loopIn = null;
  }
  // EXIT while looping; RELOOP (back into the last loop) when not
  reloop() {
    if (this.loop) return this.#setLoop(null);
    if (!this.lastLoop) return;
    this.#setLoop(this.lastLoop);
    this.jumpTo(this.lastLoop.start);
  }

  // A roll: a short loop while held, with the track running on underneath (slip), so letting go
  // drops you back exactly where the music would have been.
  rollOn(beats) {
    if (!this.loaded || !this.playing) return;
    const start = this.#loopStart(beats);
    this.roll = { start, end: start + beats * this.period, beats };
    this.send({ type: 'slip', on: true });
    this.send({ type: 'loop', on: true, start: this.roll.start * DECODE_RATE, end: this.roll.end * DECODE_RATE });
    this.#emit('loop');
  }
  rollOff() {
    if (!this.roll) return;
    this.roll = null;
    if (this.loop) this.send({ type: 'loop', on: true, start: this.loop.start * DECODE_RATE, end: this.loop.end * DECODE_RATE });
    else this.send({ type: 'loop', on: false });
    this.send({ type: 'slip', on: false });
    this.#emit('loop');
  }

  beatJump(beats) {
    if (!this.loaded) return;
    const p = this.position + beats * this.period;
    if (this.loop) this.#setLoop({ start: this.loop.start + beats * this.period, end: this.loop.end + beats * this.period, beats: this.loop.beats });
    this.seek(p);
  }

  // ── tempo & sync ─────────────────────────────────────────────────────────
  setTempo(pct, { user = true } = {}) {
    this.tempo = clamp(pct, -this.range, this.range);
    if (user) this.synced = false;
    this.send({ type: 'tempo', value: 1 + this.tempo / 100 });
    this.#emit('tempo');
  }
  setRange(r) {
    this.range = r;
    if (Math.abs(this.tempo) > r) this.setTempo(this.tempo, { user: false });
    this.#emit('tempo');
  }
  setKeylock(on) {
    this.keylock = !!on;
    store.set('dj:keylock', this.keylock);
    this.send({ type: 'keylock', on: this.keylock });
    this.#emit('tempo');
  }
  bend(x) { this.send({ type: 'bend', value: x }); }

  // SYNC: take the other deck's tempo (at double or half time if that is closer), and if both are
  // playing, line the beats up. It then keeps following the other deck until you move the fader.
  sync() {
    const other = this.mixer.other(this);
    if (!this.bpm || !other.bpm) return false;
    const target = other.liveBpm;
    const factor = this.#syncFactor(target);
    const pct = (target * factor / this.bpm - 1) * 100;
    if (Math.abs(pct) > this.range) {
      const r = TEMPO_RANGES.find((x) => x >= Math.abs(pct));
      if (!r) return false;
      this.setRange(r);
    }
    this.setTempo(pct, { user: false });
    this.synced = true;
    this.syncFactor = factor;
    if (this.playing && other.playing) this.alignPhase(other, factor);
    this.#emit('tempo');
    return true;
  }

  #syncFactor(target) {
    let factor = 1;
    for (const f of [2, 0.5]) if (Math.abs(target * f / this.bpm - 1) < Math.abs(target * factor / this.bpm - 1)) factor = f;
    return factor;
  }

  alignPhase(other, factor = 1) {
    const mine = this.beatAt().frac;
    const b = ((other.position - other.first) / other.period) * factor;
    const theirs = b - Math.floor(b);
    let d = theirs - mine;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    if (Math.abs(d) > 0.004) this.seek(this.position + d * this.period);
  }

  // keep following the master's tempo
  follow() {
    if (!this.synced) return;
    const other = this.mixer.other(this);
    if (!other.bpm || !this.bpm) return;
    const pct = (other.liveBpm * (this.syncFactor || 1) / this.bpm - 1) * 100;
    if (Math.abs(pct - this.tempo) > 0.004) this.setTempo(pct, { user: false });
  }

  // ── the jog wheel ────────────────────────────────────────────────────────
  scratchStart() {
    if (!this.loaded) return;
    this.scratchBase = this.position;
    this.send({ type: 'scratch', on: true, slip: this.slipMode && this.playing });
  }
  scratchMove(seconds) {
    if (!this.loaded) return;
    this.send({ type: 'scratchTo', frame: clamp(this.scratchBase + seconds, 0, this.duration) * DECODE_RATE });
  }
  scratchEnd() {
    if (!this.loaded) return;
    this.send({ type: 'scratch', on: false, slip: this.slipMode });
  }
  setSlip(on) { this.slipMode = !!on; this.#emit('state'); }

  unload() {
    if (this.playing) return;
    this.token++;
    this.send({ type: 'unload' });
    this.track = this.info = null;
    this.duration = 0;
    this.#emit('load');
    this.#emit('state');
  }
}

// ── the mixer ────────────────────────────────────────────────────────────────
export class DeckMixer extends EventTarget {
  static async create(ctx) {
    await loadWorklet(ctx);
    return new DeckMixer(ctx);
  }

  constructor(ctx) {
    super();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.output = ctx.createGain();            // into the engine's chain
    this.masterMeter = ctx.createAnalyser();
    this.masterMeter.fftSize = 1024;
    this.quantize = store.get('dj:quantize', true);
    this.xfader = 0.5;
    this.xcurve = 'smooth';
    this.onAir = null;
    this.decks = [new Deck(this, 'A'), new Deck(this, 'B')];
    this.strips = this.decks.map((d) => this.#strip(d));
    this.asleep = false;                       // see sleep()
    this.#beatFx();
    this.setCrossfader(0.5);
  }

  other(deck) { return deck === this.decks[0] ? this.decks[1] : this.decks[0]; }
  get playing() { return this.decks.some((d) => d.playing); }

  // Out of DJ mode the decks are unplugged from their strips. The level meters are analysers, which
  // the browser keeps running whatever they hear, and they would keep both deck processors (and
  // every filter between) working on silence for the rest of the visit.
  sleep() {
    if (this.asleep) return;
    this.asleep = true;
    for (const d of this.decks) { try { d.node.disconnect(); } catch { /* not connected */ } }
  }
  wake() {
    if (!this.asleep) return;
    this.asleep = false;
    this.strips.forEach((s) => s.deck.node.connect(s.trim));
  }

  // ── a channel strip ──────────────────────────────────────────────────────
  #strip(deck) {
    const ctx = this.ctx;
    const biquad = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    // Linkwitz–Riley crossovers: two Butterworth sections in a row (Q in dB for these types)
    const lr4 = (type, f) => { const a = biquad(type, f, -3.01), b = biquad(type, f, -3.01); a.connect(b); return [a, b]; };
    const trim = ctx.createGain();
    const [lo1, lo2] = lr4('lowpass', 250);
    const [re1, re2] = lr4('highpass', 250);
    const [mi1, mi2] = lr4('lowpass', 2500);
    const [hi1, hi2] = lr4('highpass', 2500);
    // the low band skips the 2.5 kHz split, so it gets that split's phase another way: an allpass
    const ap = biquad('allpass', 2500, Math.SQRT1_2);
    const low = ctx.createGain(), mid = ctx.createGain(), high = ctx.createGain(), sum = ctx.createGain();
    deck.node.connect(trim);
    trim.connect(lo1); lo2.connect(ap).connect(low).connect(sum);
    trim.connect(re1); re2.connect(mi1); mi2.connect(mid).connect(sum);
    re2.connect(hi1); hi2.connect(high).connect(sum);
    const lp = biquad('lowpass', 20000, -3), hp = biquad('highpass', 20, -3);
    const meter = ctx.createAnalyser();
    meter.fftSize = 1024;
    const fader = ctx.createGain(), xf = ctx.createGain();
    sum.connect(lp).connect(hp);
    hp.connect(meter);
    hp.connect(fader).connect(xf).connect(this.master);
    const strip = { deck, trim, low, mid, high, lp, hp, meter, fader, xf, faderValue: 1, trimDb: 0, eq: { low: 0, mid: 0, high: 0 }, filter: 0, buf: new Float32Array(1024), peak: 0 };
    this.#setGain(fader.gain, 1);
    return strip;
  }

  strip(deck) { return this.strips[this.decks.indexOf(deck)]; }
  #setGain(param, v, tau = 0.012) { param.setTargetAtTime(v, this.ctx.currentTime, tau); }

  setTrim(deck, db) { const s = this.strip(deck); s.trimDb = clamp(db, -18, 12); this.#setGain(s.trim.gain, Math.pow(10, s.trimDb / 20)); }
  // A loud master and a quiet one should sit level when their faders are: aim every track at the
  // same average loudness, within reason.
  autoGain(deck) {
    const db = deck.info ? clamp(-14 - deck.info.rmsDb, -12, 8) : 0;
    this.setTrim(deck, db);
    this.dispatchEvent(new CustomEvent('trim', { detail: deck }));
  }

  // band: 'low' | 'mid' | 'high'; v: -1 (killed) … 0 (flat) … +1 (+6 dB)
  setEq(deck, band, v) {
    const s = this.strip(deck);
    s.eq[band] = clamp(v, -1, 1);
    const g = v < 0 ? Math.pow(1 + v, 2.2) : 1 + v;
    this.#setGain(s[band].gain, g);
  }

  setFilter(deck, f) {
    const s = this.strip(deck);
    s.filter = clamp(f, -1, 1);
    const c = djFilterCurve(s.filter, 0.45, this.ctx.sampleRate);
    const t = this.ctx.currentTime;
    s.lp.frequency.setTargetAtTime(c.lpHz, t, 0.02); s.lp.Q.setTargetAtTime(c.lpQ, t, 0.02);
    s.hp.frequency.setTargetAtTime(c.hpHz, t, 0.02); s.hp.Q.setTargetAtTime(c.hpQ, t, 0.02);
  }

  // channel faders have a squared taper: the top half of the throw is where the mix happens
  setFader(deck, v) { const s = this.strip(deck); s.faderValue = clamp(v, 0, 1); this.#setGain(s.fader.gain, s.faderValue * s.faderValue); }

  setCrossfader(x) {
    this.xfader = clamp(x, 0, 1);
    const [a, b] = this.#xfGains(this.xfader);
    this.#setGain(this.strips[0].xf.gain, a, 0.006);
    this.#setGain(this.strips[1].xf.gain, b, 0.006);
  }
  setCrossfaderCurve(curve) { this.xcurve = curve; this.setCrossfader(this.xfader); }
  #xfGains(x) {
    if (this.xcurve === 'sharp') return [clamp((1 - x) / 0.06, 0, 1), clamp(x / 0.06, 0, 1)];
    return [Math.cos(x * Math.PI / 2), Math.sin(x * Math.PI / 2)];      // constant power
  }

  setMaster(v) { this.#setGain(this.master.gain, clamp(v, 0, 1.5)); }
  setQuantize(on) { this.quantize = !!on; store.set('dj:quantize', this.quantize); this.dispatchEvent(new Event('quantize')); }

  // ── beat FX: an echo and a flanger, timed to the deck on air ──────────────────
  #beatFx() {
    const ctx = this.ctx;
    const dry = ctx.createGain();
    this.master.connect(dry).connect(this.output);
    this.master.connect(this.masterMeter);
    // echo: a delay feeding back through a highpass, so the repeats thin out instead of muddying
    this.echoSend = ctx.createGain(); this.echoSend.gain.value = 0;
    this.echoDelay = ctx.createDelay(4);
    this.echoFb = ctx.createGain(); this.echoFb.gain.value = 0.5;
    const echoHp = ctx.createBiquadFilter(); echoHp.type = 'highpass'; echoHp.frequency.value = 260;
    this.echoWet = ctx.createGain(); this.echoWet.gain.value = 0.8;
    this.master.connect(this.echoSend).connect(this.echoDelay).connect(echoHp).connect(this.echoFb).connect(this.echoDelay);
    echoHp.connect(this.echoWet).connect(this.output);
    // flanger: a few milliseconds of delay swept by a slow wave, mixed back with the dry signal
    this.flangeWet = ctx.createGain(); this.flangeWet.gain.value = 0;
    this.flangeDelay = ctx.createDelay(0.03);
    this.flangeDelay.delayTime.value = 0.004;
    this.flangeLfo = ctx.createOscillator();
    this.flangeLfo.frequency.value = 0.25;
    this.flangeDepth = ctx.createGain(); this.flangeDepth.gain.value = 0.0032;
    this.flangeLfo.connect(this.flangeDepth).connect(this.flangeDelay.delayTime);
    this.flangeFb = ctx.createGain(); this.flangeFb.gain.value = 0.55;
    this.master.connect(this.flangeDelay);
    this.flangeDelay.connect(this.flangeFb).connect(this.flangeDelay);
    this.flangeDelay.connect(this.flangeWet).connect(this.output);
    this.flangeLfo.start();
    this.fx = { echo: false, flanger: false, beats: 3, level: 0.7 };   // beats is an index into FX_BEATS
  }

  setFx(patch) {
    Object.assign(this.fx, patch);
    const t = this.ctx.currentTime;
    this.echoSend.gain.setTargetAtTime(this.fx.echo ? 1 : 0, t, 0.01);
    this.echoWet.gain.setTargetAtTime(0.4 + 0.6 * this.fx.level, t, 0.05);
    this.echoFb.gain.setTargetAtTime(0.25 + 0.5 * this.fx.level, t, 0.05);
    this.flangeWet.gain.setTargetAtTime(this.fx.flanger ? 0.55 + 0.45 * this.fx.level : 0, t, 0.03);
    this.#retimeFx();
    this.dispatchEvent(new Event('fx'));
  }

  get fxBpm() { return this.onAir?.liveBpm || this.decks.find((d) => d.bpm)?.liveBpm || 120; }

  #retimeFx() {
    const beat = 60 / this.fxBpm;
    const div = FX_BEATS[this.fx.beats];
    const t = this.ctx.currentTime;
    this.echoDelay.delayTime.setTargetAtTime(Math.min(beat * div, 3.9), t, 0.05);
    this.flangeLfo.frequency.setTargetAtTime(1 / (beat * div * 8), t, 0.05);   // one sweep every eight divisions
  }

  // ── each frame ───────────────────────────────────────────────────────────
  tick() {
    for (const d of this.decks) d.follow();
    // on air: the playing deck you can hear most of
    const weight = (i) => {
      const d = this.decks[i], s = this.strips[i];
      return d.playing && d.loaded ? s.faderValue * s.faderValue * this.#xfGains(this.xfader)[i] : 0;
    };
    const w = [weight(0), weight(1)];
    const cur = this.onAir ? this.decks.indexOf(this.onAir) : -1;
    let next = cur;
    if (cur < 0 || w[cur] === 0) next = w[0] >= w[1] ? (w[0] > 0 ? 0 : (w[1] > 0 ? 1 : -1)) : 1;
    else if (w[1 - cur] > w[cur] * 1.25) next = 1 - cur;
    if (next !== cur && next >= 0) {
      this.onAir = this.decks[next];
      this.#retimeFx();
      this.dispatchEvent(new CustomEvent('onair', { detail: this.onAir }));
    }
    if (this.fx.echo || this.fx.flanger) this.#retimeFx();
  }

  // peak level of a channel (or the master), 0…1, with a falling hold
  level(i) {
    const node = i < 0 ? this.masterMeter : this.strips[i].meter;
    const buf = i < 0 ? (this.masterBuf ||= new Float32Array(1024)) : this.strips[i].buf;
    node.getFloatTimeDomainData(buf);
    let p = 0;
    for (let k = 0; k < buf.length; k++) p = Math.max(p, Math.abs(buf[k]));
    return p;
  }

  onAirInfo() {
    const d = this.onAir;
    if (!d || !d.loaded) return null;
    return { deck: d, track: d.track, position: d.position, duration: d.duration, rate: d.playing ? 1 + d.tempo / 100 : 0, bpm: d.liveBpm };
  }

  toggleOnAir() {
    const d = this.onAir || this.decks.find((x) => x.loaded);
    if (d) d.togglePlay();
  }

  pauseAll() { for (const d of this.decks) if (d.playing) d.pause(); }
}
