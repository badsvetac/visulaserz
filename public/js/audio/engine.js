import { clamp, debounce } from '../util.js';
import { defaultFx, FX_PARAMS } from './params.js';
import { createFxChain, fxTailSeconds } from './fx-chain.js';
import { encodeWav } from './wav.js';
import { Ambience } from './ambience.js';

const EXPORT_MAX_SECONDS = 20 * 60;
const MIN_RATE = 0.0625; // browsers refuse slower playback than this

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
    this.volume = 0.85;
    this.track = null;
    this.loop = false;
    this.rateScale = 1; // multiplied into the speed: the tape-stop ramp lives here
    this.tape = null; // { dir: -1 stopping, +1 starting }
    this.stutter = null; // { start, len }
    this.ab = null; // { a, b }
    this.live = null; // MediaStream when listening to a mic / the computer
    this.liveSource = null;
    this.ambience = null; // scene sound (rain…), created with the context
    this.ambienceKind = null;

    const relay = (type) => this.el.addEventListener(type, () => this.dispatchEvent(new Event(type)));
    ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'durationchange', 'waiting', 'playing', 'seeked'].forEach(relay);
    this.el.addEventListener('play', () => { this.chain?.setAudible(true); this.ambience?.setAudible(true); });
    this.el.addEventListener('pause', () => { this.chain?.setAudible(false); this.ambience?.setAudible(false); });
    this.el.addEventListener('error', () => {
      if (!this.el.src) return;
      this.dispatchEvent(new CustomEvent('failure', { detail: 'This file could not be decoded. Try an MP3, WAV, OGG, FLAC or M4A file.' }));
    });
    // A new source resets playbackRate, so put our speed back as soon as metadata arrives.
    this.el.addEventListener('loadedmetadata', () => this.#applySpeed());

    this.rebuildReverb = debounce(() => this.chain?.apply(this.fx), 90);
  }

  // Browsers only allow audio to start from a user gesture, so the context is created lazily.
  ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
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

    this.source.connect(this.chain.input);
    this.source.connect(this.beatAnalyser);
    this.chain.output.connect(this.analyser);
    this.chain.output.connect(this.splitter);
    this.splitter.connect(this.analyserL, 0);
    this.splitter.connect(this.analyserR, 1);
    this.chain.output.connect(this.master).connect(ctx.destination);

    // Ambience joins after the effects and the analysers: it is heard, not visualised.
    this.ambience = new Ambience(ctx, this.master);
    this.ambience.setLevel(this.fx.ambience ?? 0.35);
    this.ambience.setAudible(!this.el.paused);
    if (this.ambienceKind) this.ambience.set(this.ambienceKind);

    this.dispatchEvent(new Event('context'));
    return ctx;
  }

  setAmbience(kind) {
    this.ambienceKind = kind;
    this.ambience?.set(kind);
  }

  // A recording (any queued or saved track) to loop as the scene sound instead of the synthesis.
  setAmbienceFile(track) {
    this.ensureContext();
    this.ambience.setFile(track.url, track.title);
    this.dispatchEvent(new Event('ambiencefile'));
  }

  clearAmbienceFile() {
    this.ambience?.clearFile();
    this.dispatchEvent(new Event('ambiencefile'));
  }

  get playing() { return !!this.live || (!this.el.paused && !this.el.ended); }
  get currentTime() { return this.el.currentTime || 0; }
  get duration() { return Number.isFinite(this.el.duration) ? this.el.duration : 0; }
  get effectiveRate() { return this.live ? 1 : this.el.paused ? 0 : this.el.playbackRate; }

  async load(track, { autoplay = true } = {}) {
    this.ensureContext();
    this.stopLive();
    this.clearAB();
    this.track = track;
    this.el.src = track.url;
    this.el.load();
    this.#applySpeed();
    this.dispatchEvent(new CustomEvent('trackchange', { detail: track }));
    if (autoplay) await this.play();
  }

  async play() {
    if (!this.el.src) return false;
    this.ensureContext();
    try {
      await this.el.play();
      return true;
    } catch (e) {
      if (e.name === 'NotAllowedError') this.dispatchEvent(new Event('blocked'));
      return false;
    }
  }

  pause() { this.el.pause(); }
  toggle() { return this.playing ? (this.pause(), false) : this.play(); }

  seek(seconds) {
    if (!this.duration) return;
    this.el.currentTime = clamp(seconds, 0, Math.max(0, this.duration - 0.05));
  }

  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    // Squared taper: the bottom half of the control is useful instead of all "too loud".
    if (this.master) this.master.gain.setTargetAtTime(this.volume * this.volume, this.ctx.currentTime, 0.02);
  }

  setLoop(on) {
    this.loop = on;
    this.el.loop = on;
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

  setAll(fx) {
    // Sound presets shape the music, not the room: keep the ambience level unless one is given.
    this.fx = { ...defaultFx(), ambience: this.fx.ambience, ...fx };
    this.#applySpeed();
    this.chain?.apply(this.fx);
    this.ambience?.setLevel(this.fx.ambience);
    this.dispatchEvent(new CustomEvent('fxchange', { detail: { id: '*' } }));
  }

  #applySpeed() {
    const el = this.el;
    // preservesPitch=false is the whole "slowed" sound: pitch drops with speed like a slowed record.
    el.preservesPitch = this.fx.pitchLock;
    el.mozPreservesPitch = this.fx.pitchLock;
    el.webkitPreservesPitch = this.fx.pitchLock;
    const rate = clamp(this.fx.speed * this.rateScale, MIN_RATE, 16);
    el.defaultPlaybackRate = rate;
    el.playbackRate = rate;
  }

  // ── performance controls ─────────────────────────────────────────────────
  // Called once per animation frame: runs the ramps and the loops.
  tick(dt) {
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
    this.stopLive();
    if (!stream.getAudioTracks().length) throw new Error('That source has no audio.');
    this.el.pause();
    this.liveSource = this.ctx.createMediaStreamSource(stream);
    this.liveSource.connect(this.analyser);
    this.liveSource.connect(this.beatAnalyser);
    this.liveSource.connect(this.splitter);
    if (this.recordDest) this.liveSource.connect(this.recordDest);
    this.live = stream;
    this.liveLabel = label;
    stream.getAudioTracks()[0].addEventListener('ended', () => this.stopLive());
    this.dispatchEvent(new Event('live'));
  }

  stopLive() {
    if (!this.live) return;
    this.liveSource.disconnect();
    this.live.getTracks().forEach((t) => t.stop());
    this.live = null;
    this.liveSource = null;
    this.dispatchEvent(new Event('live'));
  }

  // Audio for the video recorder, tapped after the effects.
  getRecordingStream() {
    this.ensureContext();
    if (!this.recordDest) {
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.chain.output.connect(this.recordDest);
      this.liveSource?.connect(this.recordDest);
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
