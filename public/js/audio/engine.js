import { clamp, debounce } from '../util.js';
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
    this.liveMonitor = false; // hearing the live input back would feed straight into the mic
    this.ambience = null; // scene sound (rain…), created with the context
    this.ambienceKind = null;
    this.tempo = 0; // BPM the analysis is currently sure about, for anything tempo-synced
    this.echoSync = 0; // index into ECHO_DIVISIONS; 0 leaves the Time knob alone
    this.syncTempo = 0; // the tempo the echo is actually locked to (changes only after HOLD)
    this.syncHold = 0;

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
