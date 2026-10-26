import { clamp, debounce, isIOS } from '../util.js';
import { defaultFx, FX_PARAMS } from './params.js';
import { createFxChain, fxTailSeconds } from './fx-chain.js';
import { encodeWav } from './wav.js';
import { Ambience } from './ambience.js';

const EXPORT_MAX_SECONDS = 20 * 60;
const MIN_RATE = 0.0625; // browsers refuse slower playback than this

// Echo times as fractions of a beat. A dot means "half as long again", which is the
// off-kilter delay every dub record uses.
export const ECHO_DIVISIONS = [
  { name: 'Off', beats: 0 },
  { name: '1/16', beats: 0.25 },
  { name: '1/8', beats: 0.5 },
  { name: '1/8.', beats: 0.75 },
  { name: '1/4', beats: 1 },
  { name: '1/4.', beats: 1.5 },
  { name: '1/2', beats: 2 },
];
const TEMPO_HOLD = 1.8; // seconds a new tempo must survive before the echo follows it

// The first AudioWorklet module a page loads makes Chrome restart its audio output, to move the
// rendering onto the worklet's own thread: a short hole in the sound. An empty module loaded with
// the context takes that restart before the first note, instead of in the middle of a song when
// a tool that needs a worklet (a tape, the looper, the decks) is opened for the first time.
const WARM_WORKLET = "registerProcessor('vz-warm', class extends AudioWorkletProcessor { process() { return false; } });";
function warmWorklet(ctx) {
  if (!ctx.audioWorklet) return;
  const url = URL.createObjectURL(new Blob([WARM_WORKLET], { type: 'text/javascript' }));
  ctx.audioWorklet.addModule(url).catch(() => {}).finally(() => URL.revokeObjectURL(url));
}

// A tenth of a second of silence, for the stand-in's first play inside a tap (see handOff).
function silence() {
  const n = 4410, v = new DataView(new ArrayBuffer(44 + n * 2));
  const tag = (at, s) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  tag(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); tag(8, 'WAVE'); tag(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 44100, true);
  v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([v], { type: 'audio/wav' }));
}
const RELAYED = ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'durationchange', 'waiting', 'playing', 'seeked'];

// Playback + effects. An <audio> element does the decoding and the varispeed
// (playbackRate with preservesPitch off = tape-style slow down), Web Audio does the rest.
export class AudioEngine extends EventTarget {
  constructor() {
    super();
    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.crossOrigin = 'anonymous';
    this.ctx = null;
    this.fx = defaultFx();
    // iOS cannot turn an <audio> element down from a page, so the stand-in (see handOff) always
    // plays at full level. The page's own level is pinned to match, and the phone's buttons rule.
    this.volume = isIOS ? 1 : 0.85;
    this.track = null;
    this.loop = false;
    this.rateScale = 1; // multiplied into the speed: the tape-stop ramp lives here
    this.tape = null; // { dir: -1 stopping, +1 starting }
    this.stutter = null; // { start, len }
    this.ab = null; // { a, b }
    this.live = null; // MediaStream when listening to a mic / the computer
    this.decks = null; // the DJ console's mixer, while it has the floor
    this.liveSource = null;
    this.liveMonitor = false; // hearing the live input back would feed straight into the mic
    this.ambience = null; // scene sound (rain…), created with the context
    this.ambienceKind = null;
    this.roomMix = {}; // the user's own Room layers, kept here because the context is lazy
    this.tempo = 0; // BPM the analysis is currently sure about, for anything tempo-synced
    this.echoSync = 0; // index into ECHO_DIVISIONS; 0 leaves the Time knob alone
    this.syncTempo = 0; // the tempo the echo is actually locked to (changes only after HOLD)
    this.syncHold = 0;

    // While the stand-in has the song (see handOff), the main element's own pause is not news.
    const relay = (type) => this.el.addEventListener(type, () => { if (!this.standIn) this.dispatchEvent(new Event(type)); });
    RELAYED.forEach(relay);
    this.bg = null;          // the stand-in element (iOS), made inside the first play tap
    this.bgPrimed = false;   // a tap has really played it, so it may play later without one
    this.standIn = false;    // true while it is the one playing
    this.loading = false;    // between asking for a track and its first play: the screen stays on
    this.retries = 0;        // network errors in a row on the current track
    // Safari 17+: play like a music app, through the silent switch and with the screen locked.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
    this.el.addEventListener('play', () => { this.chain?.setAudible(true); this.ambience?.setAudible(true); });
    this.el.addEventListener('pause', () => { this.chain?.setAudible(false); this.ambience?.setAudible(false); });
    this.el.addEventListener('playing', () => { this.elUnlocked = true; this.retries = 0; });
    this.el.addEventListener('error', () => { if (this.el.src && !this.standIn) this.#mediaError(this.el); });
    // A new source resets playbackRate, so put our speed back as soon as metadata arrives.
    this.el.addEventListener('loadedmetadata', () => this.#applySpeed());

    this.rebuildReverb = debounce(() => this.chain?.apply(this.fx), 90);
  }

  // Browsers only allow audio to start from a user gesture, so the context is created lazily.
  // Every play path calls this first, inside the tap, so it is also where iOS gets its taps.
  ensureContext() {
    this.#primeStandIn();
    if (isIOS && !this.elUnlocked && this.el.paused) {
      // WebKit lifts an element's tap requirement at the play() call itself: a song that only
      // arrives after a download can then start without "press play".
      const p = this.el.play();
      this.el.pause();
      p?.catch?.(() => {});
    }
    if (this.ctx) {
      // iOS also reports 'interrupted' (a call, Siri, the lock screen)
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    warmWorklet(ctx);
    this.source = ctx.createMediaElementSource(this.el);
    this.chain = createFxChain(ctx);
    this.chain.apply(this.fx);
    this.chain.setAudible(!this.el.paused);

    // Keep ~23 Hz per FFT bin whatever the device's sample rate (96 kHz devices are common).
    const fftSize = ctx.sampleRate >= 88200 ? 4096 : 2048;
    // The picture should react to what you hear, so the main analyser sits after the effects…
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = fftSize;
    this.analyser.smoothingTimeConstant = 0;
    this.analyser.minDecibels = -80;
    this.analyser.maxDecibels = -8;
    // …but reverb smears drum hits, so beats are detected on the untouched signal.
    this.beatAnalyser = ctx.createAnalyser();
    this.beatAnalyser.fftSize = fftSize;
    this.beatAnalyser.smoothingTimeConstant = 0;
    // Left/right taps feed the VU meters, the vectorscope and the stereo balance.
    this.splitter = ctx.createChannelSplitter(2);
    this.analyserL = ctx.createAnalyser();
    this.analyserR = ctx.createAnalyser();
    this.analyserL.fftSize = this.analyserR.fftSize = 1024;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume * this.volume;
    // Live input runs through the effects like anything else, so the filter, the kills and
    // the pads shape the picture in mic mode too — but it must not come back out of the
    // speakers, or a microphone would hear itself. The monitor gain is the safety valve.
    this.monitor = ctx.createGain();

    this.source.connect(this.chain.input);
    this.source.connect(this.beatAnalyser);
    this.chain.output.connect(this.analyser);
    this.chain.output.connect(this.splitter);
    this.splitter.connect(this.analyserL, 0);
    this.splitter.connect(this.analyserR, 1);
    this.chain.output.connect(this.monitor).connect(this.master).connect(ctx.destination);
    this.#applyMonitor();

    // Ambience joins after the effects and the analysers: it is heard, not visualised.
    this.ambience = new Ambience(ctx, this.master);
    this.ambience.setLevel(this.fx.ambience ?? 0.35);
    this.ambience.setAudible(!this.el.paused);
    if (this.ambienceKind) this.ambience.set(this.ambienceKind);
    for (const [id, level] of Object.entries(this.roomMix)) this.ambience.setLayer(id, level);

    this.dispatchEvent(new Event('context'));
    return ctx;
  }

  setAmbience(kind) {
    this.ambienceKind = kind;
    this.ambience?.set(kind);
  }

  // A Room layer the user dialled in. Remembered on the engine so it survives the context
  // being created late, and so it can be saved with the rest of the settings.
  setAmbienceLayer(id, level) {
    this.roomMix[id] = level;
    this.ambience?.setLayer(id, level);
  }

  // A recording (any queued or saved track) to loop as the scene sound instead of the synthesis.
  async setAmbienceFile(track) {
    this.ensureContext();
    const token = this.ambienceLoadToken = (this.ambienceLoadToken || 0) + 1;
    this.ambience.clearFile();
    track = await this.prepareTrack?.(track, 'ambience') || track;
    if (this.ambienceLoadToken !== token) return;
    this.ambience.setFile(track.url, track.title);
    this.dispatchEvent(new Event('ambiencefile'));
  }

  clearAmbienceFile() {
    this.ambienceLoadToken = (this.ambienceLoadToken || 0) + 1;
    this.ambience?.clearFile();
    this.releaseTrack?.('ambience');
    this.dispatchEvent(new Event('ambiencefile'));
  }

  // the element whose song is being heard: the stand-in while it has the floor
  get #out() { return this.standIn ? this.bg : this.el; }
  get playing() { return !!this.live || !!this.decks?.playing || (!this.#out.paused && !this.#out.ended); }
  get currentTime() { return this.#out.currentTime || 0; }
  get duration() { return Number.isFinite(this.#out.duration) ? this.#out.duration : 0; }
  get effectiveRate() { return this.live ? 1 : this.#out.paused ? 0 : this.#out.playbackRate; }

  // `at` starts the song part-way through (set before metadata, it is the element's start position).
  // A track the crate has already fetched (track.ready) starts in the same task as the call, with no
  // wait at all: that is what lets the next song begin by itself with the phone locked.
  async load(track, { autoplay = true, at = 0 } = {}) {
    this.ensureContext();
    const token = this.loadToken = (this.loadToken || 0) + 1;
    this.el.pause();
    if (this.standIn) this.bg.pause();
    if (!track.ready && this.prepareTrack) {
      this.#setLoading(true);
      try { track = await this.prepareTrack(track, 'player') || track; }
      finally { if (this.loadToken === token) this.#setLoading(false); }
      if (this.loadToken !== token) return;
    }
    this.detachDecks();
    this.stopLive();
    this.clearAB();
    this.track = track;
    this.retries = 0;
    if (this.standIn) this.bg.src = track.url;       // the queue moved on with the screen off: takeBack loads el
    else {
      this.el.src = track.url;
      this.el.load();
      // on iOS the stand-in learns the new song's length now, so a lock later only has to seek
      if (this.bg && isIOS) { this.bg.preload = 'metadata'; this.bg.src = track.url; }
    }
    if (at > 0) this.#out.currentTime = at;
    this.#applySpeed();
    this.dispatchEvent(new CustomEvent('trackchange', { detail: track }));
    if (autoplay) await this.play();
  }

  #setLoading(on) {
    if (this.loading === on) return;
    this.loading = on;
    this.dispatchEvent(new Event('loading'));
  }

  async play() {
    if (!this.el.src) return false;
    this.ensureContext();
    try {
      await this.#out.play();
      return true;
    } catch (e) {
      if (e.name === 'NotAllowedError') this.dispatchEvent(new Event('blocked'));
      return false;
    }
  }

  pause() { this.#out.pause(); }
  toggle() { return this.playing ? (this.pause(), false) : this.play(); }

  seek(seconds) {
    if (!this.duration) return;
    // half a second short of the end: a VBR MP3 dragged to its very end can read past it and stall
    this.#out.currentTime = clamp(seconds, 0, Math.max(0, this.duration - 0.5));
  }

  // A network error is retried twice from where it stopped. After that, or for a file that cannot be
  // decoded, the user is told which of the two it was, and 'stuck' lets the crate fetch the track
  // again or move on (crate.js).
  #mediaError(media) {
    const code = media.error?.code;
    const at = media.currentTime || 0;
    if (code === 2 && this.retries < 2) {
      const delay = ++this.retries * 1500;
      setTimeout(() => {
        if (media.src !== (this.standIn ? this.bg : this.el).src) return;        // moved on meanwhile
        media.load();
        media.currentTime = at;
        media.play().catch(() => {});
      }, delay);
      return;
    }
    this.dispatchEvent(new CustomEvent('failure', { detail: code === 2
      ? 'The connection dropped and the song could not be fetched again.'
      : 'This file could not be decoded. Try an MP3, WAV, OGG, FLAC or M4A file.' }));
    this.dispatchEvent(new CustomEvent('stuck', { detail: { track: this.track, at, network: code === 2 } }));
  }

  setVolume(v) {
    if (isIOS) v = 1;                                          // see the constructor
    this.volume = clamp(v, 0, 1);
    // Squared taper: the bottom half of the control is useful instead of all "too loud".
    if (this.master) this.master.gain.setTargetAtTime(this.volume * this.volume, this.ctx.currentTime, 0.02);
    if (this.bg) this.bg.volume = this.volume * this.volume;
  }

  setLoop(on) {
    this.loop = on;
    this.el.loop = on;
    if (this.bg) this.bg.loop = on;
  }

  // ── the screen-off stand-in ───────────────────────────────────────────────
  // iOS stops Web Audio when the phone locks or Safari goes to the background, and every sound here
  // runs through Web Audio, so the song would stop with the screen. A second <audio> element that is
  // never routed into the graph is allowed to go on playing: it takes the song over at the same
  // moment and speed when the page goes out of sight, and gives it back when the page returns. The
  // effects and the picture rest meanwhile; the song, the queue and the lock-screen controls do not.
  // iOS lets an element play without a tap only once a tap has played it, hence the primer: it runs
  // inside the play taps (ensureContext), never on a stray touch, which would stop the user's
  // Spotify for a page they did not ask to play, and it retries until a tap has really counted.
  #primeStandIn() {
    if (!isIOS || this.bgPrimed || this.standIn) return;
    let bg = this.bg;
    if (!bg) {
      bg = this.bg = new Audio();
      bg.preload = 'metadata';
      bg.crossOrigin = 'anonymous';
      bg.loop = this.loop;
      for (const type of RELAYED) bg.addEventListener(type, () => { if (this.standIn) this.dispatchEvent(new Event(type)); });
      bg.addEventListener('error', () => { if (this.standIn && bg.src) this.#mediaError(bg); });
      bg.src = this.el.src || silence();
    }
    const p = bg.play();
    bg.pause();                                               // same task: nothing is heard
    p?.then?.(() => { this.bgPrimed = true; }, (e) => { if (e?.name !== 'NotAllowedError') this.bgPrimed = true; });
  }

  // The page is going out of sight on iOS. A paused song moves too, so that Play on the lock screen
  // reaches an element that can be heard.
  handOff() {
    const { bg, el } = this;
    if (this.standIn || !bg || this.live || this.decks || !this.track) return false;
    const wasPlaying = !el.paused && !el.ended;
    if (bg.src !== el.src) bg.src = el.src;
    this.standIn = true;
    this.#applySpeed();
    const at = el.currentTime, t0 = performance.now();
    bg.currentTime = at;                                      // honoured before metadata as the start position…
    if (bg.readyState < 1) bg.addEventListener('loadedmetadata', () => {   // …and checked once it is known
      if (this.standIn && at > 1 && bg.currentTime < 0.5) bg.currentTime = at + ((performance.now() - t0) / 1000) * bg.playbackRate;
    }, { once: true });
    if (!wasPlaying) { el.pause(); return true; }
    const started = bg.play();
    if (this.ctx?.state !== 'running') el.pause();            // el is silent already
    else {
      // Web Audio may still be heard for a moment: keep el until the stand-in really sounds
      let done = false;
      const stop = () => { if (!done) { done = true; if (this.standIn) el.pause(); } };
      bg.addEventListener('playing', stop, { once: true });
      setTimeout(stop, 1500);
    }
    started.catch(() => {
      // refused: put the song back where it was, so returning to the page finds it as it was left
      if (!this.standIn) return;
      this.standIn = false;
      el.currentTime = bg.currentTime;
      el.play().catch(() => this.dispatchEvent(new Event('pause')));
      this.dispatchEvent(new Event('handoffrefused'));
    });
    return true;
  }

  // The page is back. The song returns to the effects only once Web Audio really runs again; until
  // then the stand-in keeps playing, and a tap (or the context waking) tries again (lockscreen.js).
  // el comes in silently under the stand-in, and the two swap when el is actually playing.
  async takeBack() {
    if (!this.standIn || this.takingBack) return;
    this.takingBack = true;
    try {
      const ctx = this.ctx;
      if (ctx && ctx.state !== 'running') {
        const wait = (p) => Promise.race([Promise.resolve(p).then(() => true, () => false), new Promise((r) => setTimeout(() => r(false), 800))]);
        await wait(ctx.resume());
        if (ctx.state === 'interrupted') { await wait(ctx.suspend()); await wait(ctx.resume()); }   // WebKit can stick in 'interrupted'
        if (ctx.state !== 'running' || document.hidden) return;
      }
      if (!this.standIn) return;
      const { bg, el } = this;
      if (el.src !== bg.src) el.src = bg.src;
      if (bg.paused || bg.ended) {
        el.currentTime = bg.currentTime;
        this.standIn = false;
        this.dispatchEvent(new Event('pause'));
        this.dispatchEvent(new Event('timeupdate'));
        return;
      }
      const gain = this.master?.gain;
      gain?.cancelScheduledValues(ctx.currentTime);
      gain?.setValueAtTime(0, ctx.currentTime);
      el.currentTime = bg.currentTime;
      const swap = () => {
        if (!this.standIn) return;
        if (el.paused) {                                      // el did not start: stay on the stand-in
          gain?.setValueAtTime(this.volume * this.volume, ctx.currentTime);
          return;
        }
        if (Math.abs(bg.currentTime - el.currentTime) > 0.3) el.currentTime = bg.currentTime;
        bg.pause();
        this.standIn = false;
        gain?.setValueAtTime(0, ctx.currentTime);
        gain?.linearRampToValueAtTime(this.volume * this.volume, ctx.currentTime + 0.03);
        this.dispatchEvent(new Event('play'));
        this.dispatchEvent(new Event('timeupdate'));
      };
      el.addEventListener('playing', swap, { once: true });
      setTimeout(swap, 2000);
      el.play().catch(() => {});
    } finally {
      this.takingBack = false;
    }
  }

  setParam(id, value) {
    const def = FX_PARAMS[id];
    if (!def) return;
    this.fx[id] = clamp(value, def.min, def.max);
    if (id === 'speed') this.#applySpeed();
    else if (id === 'ambience') this.ambience?.setLevel(this.fx.ambience);
    else if (id === 'reverbSize' || id === 'reverbTone') this.rebuildReverb(); // impulse synthesis is the one costly step
    else this.chain?.apply(this.fx);
    this.dispatchEvent(new CustomEvent('fxchange', { detail: { id } }));
  }

  setPitchLock(on) {
    this.fx.pitchLock = !!on;
    this.#applySpeed();
    this.dispatchEvent(new CustomEvent('fxchange', { detail: { id: 'pitchLock' } }));
  }

  // Several knobs at once, with a single trip through the graph. The morph fader, the
  // macros and the XY pad move a dozen parameters per frame; calling setParam for each
  // would rebuild the drive curve and re-apply the whole chain a dozen times over.
  setMany(values, { silent = false } = {}) {
    let speed = false;
    let reverb = false;
    for (const [id, value] of Object.entries(values)) {
      const def = FX_PARAMS[id];
      if (!def) continue;
      this.fx[id] = clamp(value, def.min, def.max);
      if (id === 'speed') speed = true;
      else if (id === 'reverbSize' || id === 'reverbTone') reverb = true;
      else if (id === 'ambience') this.ambience?.setLevel(this.fx.ambience);
    }
    if (speed) this.#applySpeed();
    this.chain?.apply(this.fx);
    if (reverb) this.rebuildReverb();
    if (!silent) this.dispatchEvent(new CustomEvent('fxchange', { detail: { id: '*', values } }));
  }

  setAll(fx) {
    // Sound presets shape the music, not the room: keep the ambience level unless one is given.
    this.fx = { ...defaultFx(), ambience: this.fx.ambience, ...fx };
    this.#applySpeed();
    this.chain?.apply(this.fx);
    this.ambience?.setLevel(this.fx.ambience);
    this.dispatchEvent(new CustomEvent('fxchange', { detail: { id: '*' } }));
  }

  // ── performance overrides (held pads) ────────────────────────────────────
  // These deliberately do not touch this.fx: a knob turn must not cancel a held pad,
  // and none of it may leak into the persisted settings or the offline export.
  setKill(band, on) { this.chain?.setKill(band, on); }
  setThrow(on) { this.chain?.setThrow(on); }
  setEchoOut(on) { this.chain?.setEchoOut(on, this.tempo ? 60 / this.tempo : 0.5); }
  clearPerformance() { this.chain?.clearPerformance(); }

  setTempo(bpm) { this.tempo = bpm > 0 ? bpm : 0; }

  setEchoSync(index) {
    this.echoSync = clamp(index | 0, 0, ECHO_DIVISIONS.length - 1);
    this.syncTempo = 0;
    this.syncHold = 0;
    if (!this.echoSync) this.chain?.setEchoTime(null);
    this.dispatchEvent(new CustomEvent('fxchange', { detail: { id: 'echoSync' } }));
  }

  // The live BPM estimate wobbles by a percent or two, and the delay time glides, so
  // following it directly turns the echo into a warbling tape. Only accept a tempo that
  // has held steady for a while, then quantise it to the nearest half BPM.
  #syncEcho(dt) {
    if (!this.echoSync || !this.chain) return;
    const target = this.tempo ? Math.round(this.tempo * 2) / 2 : 0;
    if (!target) return;
    if (this.syncTempo && Math.abs(target - this.syncTempo) < 0.75) this.syncHold = 0;
    else {
      this.syncHold += dt;
      if (this.syncHold >= (this.syncTempo ? TEMPO_HOLD : 0)) {
        this.syncTempo = target;
        this.syncHold = 0;
      }
    }
    if (!this.syncTempo) return;
    // The playback rate moves the music's tempo, and the beat detector already hears the
    // shifted signal, so the slowed knob keeps its echo locked without any extra work.
    const seconds = (60 / this.syncTempo) * ECHO_DIVISIONS[this.echoSync].beats;
    this.chain.setEchoTime(Math.min(seconds, 1.95));
  }

  setLiveMonitor(on) {
    this.liveMonitor = !!on;
    this.#applyMonitor();
    this.dispatchEvent(new Event('live'));
  }

  #applyMonitor() {
    if (!this.monitor) return;
    const target = this.live && !this.liveMonitor ? 0 : 1;
    this.monitor.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  #applySpeed() {
    const rate = clamp(this.fx.speed * this.rateScale, MIN_RATE, 16);
    for (const el of this.bg ? [this.el, this.bg] : [this.el]) {
      // preservesPitch=false is the whole "slowed" sound: pitch drops with speed like a slowed record.
      el.preservesPitch = this.fx.pitchLock;
      el.mozPreservesPitch = this.fx.pitchLock;
      el.webkitPreservesPitch = this.fx.pitchLock;
      el.defaultPlaybackRate = rate;
      el.playbackRate = rate;
    }
  }

  // ── performance controls ─────────────────────────────────────────────────
  // Called once per animation frame (and a few times a second while the page is out of sight):
  // runs the ramps and the loops.
  tick(dt) {
    if (this.standIn) {
      // effects and ramps rest with Web Audio, but a loop is a loop on whichever element plays
      const bg = this.bg;
      if (this.stutter && !bg.paused && bg.currentTime - this.stutter.start >= this.stutter.len) bg.currentTime = this.stutter.start;
      if (this.ab && !bg.paused && bg.currentTime >= this.ab.b) bg.currentTime = this.ab.a;
      return;
    }
    this.#syncEcho(dt);
    if (this.tape) {
      const step = dt / (this.tape.dir < 0 ? 0.9 : 0.5);
      this.rateScale = clamp(this.rateScale + this.tape.dir * step, 0.04, 1);
      this.#applySpeed();
      if (this.tape.dir < 0 && this.rateScale <= 0.04 && !this.el.paused) this.el.pause();
      if (this.tape.dir > 0 && this.rateScale >= 1) this.tape = null;
    }
    if (this.stutter && !this.el.paused && this.el.currentTime - this.stutter.start >= this.stutter.len) {
      this.el.currentTime = this.stutter.start;
    }
    if (this.ab && !this.el.paused && this.el.currentTime >= this.ab.b) this.el.currentTime = this.ab.a;
  }

  // Hold: the motor winds down and the pitch sinks with it. Release: it spins back up.
  tapeStop(on) {
    if (on) {
      if (!this.el.src || this.tape?.dir === -1) return;
      this.tapeResume = this.playing;
      this.tape = { dir: -1 };
    } else if (this.tape) {
      this.tape = { dir: 1 };
      if (this.tapeResume) this.play();
    }
  }

  // Hold: repeats a slice starting where you pressed, like a beat-repeat effect.
  setStutter(on, len = 0.18) {
    this.stutter = on && this.el.src ? { start: this.el.currentTime, len: clamp(len, 0.05, 1) } : null;
  }

  setAB(a, b) {
    if (!this.duration) return;
    this.ab = { a: clamp(Math.min(a, b), 0, this.duration), b: clamp(Math.max(a, b), 0, this.duration) };
    this.dispatchEvent(new Event('abchange'));
  }

  clearAB() {
    if (!this.ab) return;
    this.ab = null;
    this.dispatchEvent(new Event('abchange'));
  }

  // ── live input (microphone or the computer's own audio) ──────────────────
  startLive(stream, label) {
    this.ensureContext();
    this.detachDecks();
    this.stopLive();
    if (!stream.getAudioTracks().length) throw new Error('That source has no audio.');
    this.el.pause();
    this.liveSource = this.ctx.createMediaStreamSource(stream);
    // Into the chain like a track, so the rack works on it; the beat detector still taps
    // the raw signal, and the monitor gain keeps it out of the speakers.
    this.liveSource.connect(this.chain.input);
    this.liveSource.connect(this.beatAnalyser);
    this.live = stream;
    this.liveLabel = label;
    this.#applyMonitor();
    stream.getAudioTracks()[0].addEventListener('ended', () => this.stopLive());
    this.dispatchEvent(new Event('live'));
  }

  stopLive() {
    if (!this.live) return;
    this.liveSource.disconnect();
    this.live.getTracks().forEach((t) => t.stop());
    this.live = null;
    this.liveSource = null;
    this.#applyMonitor();
    this.dispatchEvent(new Event('live'));
  }

  // ── DJ decks ──────────────────────────────────────────────────────────────
  // The console's mix goes in where a track would, so the rack, the analysis, the scenes and REC
  // all take it from there. The single player stops while the decks have the floor.
  attachDecks(mixer) {
    this.ensureContext();
    if (this.decks === mixer) return;
    this.stopLive();
    this.el.pause();
    mixer.output.connect(this.chain.input);
    mixer.output.connect(this.beatAnalyser);
    this.decks = mixer;
    this.chain.setAudible(true);
    this.dispatchEvent(new Event('decks'));
  }

  detachDecks() {
    if (!this.decks) return;
    this.decks.pauseAll();
    this.decks.output.disconnect();
    this.decks = null;
    this.chain.setAudible(!this.el.paused);
    this.dispatchEvent(new Event('decks'));
  }

  // Audio for the video recorder, tapped after the effects.
  getRecordingStream() {
    this.ensureContext();
    if (!this.recordDest) {
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.chain.output.connect(this.recordDest); // live input arrives here too, effects and all
      this.ambience?.out.connect(this.recordDest);
    }
    return this.recordDest.stream;
  }

  // Renders the current track through the current rack settings, faster than real time.
  async exportWav() {
    if (!this.track) throw new Error('Load a track first.');
    if (this.duration > EXPORT_MAX_SECONDS) throw new Error('Export works for tracks up to 20 minutes.');
    this.ensureContext();
    const data = await (await fetch(this.track.url)).arrayBuffer();
    // Decode at 48 kHz regardless of the output device: a 96 kHz WAV is twice the size for nothing.
    const decoded = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(data);
    const fx = { ...this.fx };
    const seconds = decoded.duration / fx.speed + fxTailSeconds(fx);
    const offline = new OfflineAudioContext(2, Math.ceil(seconds * decoded.sampleRate), decoded.sampleRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.playbackRate.value = fx.speed; // a buffer source always shifts pitch with speed (varispeed)
    const chain = createFxChain(offline);
    chain.apply(fx);
    src.connect(chain.input);
    chain.output.connect(offline.destination);
    src.start();
    return encodeWav(await offline.startRendering());
  }
}
