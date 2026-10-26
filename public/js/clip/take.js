import { el, isPhone } from '../util.js';
import { AudioAnalysis } from '../audio/analysis.js';
import { TakeTap } from './tap.js';
import { muxMP4 } from './mp4.js';

// TAKES: perform once, get a clean video. TAKE records what you hear (the mix after the rack and
// every tool, as 16-bit PCM) and what the picture did (scene cuts, palettes, looks, the tools'
// hits and bends, where the song was) against the same audio clock. RENDER then makes the video
// frame by frame at the clip's format and size, through stand-in analysers that hear the take
// itself, so it never drops a frame however heavy the scene, and encodes it with WebCodecs as
// H.264 and AAC in an MP4, the file every phone and every platform takes.
//
// While it renders, the live show stands still and the music is paused; afterwards everything is
// put back as it was.

// A take is kept in memory until it is rendered, and the render holds the video it makes: a phone
// (a few hundred MB for a tab, and gone with everything in it if it runs out) takes shorter ones.
const MAX_SECONDS = isPhone ? 3 * 60 : 6 * 60;
const FPS = [30, 60];
const CHUNK = 0.5;     // seconds of audio per message from the recorder
const BLOB_BYTES = 4 << 20;   // the encoded video is set aside in Blobs of about this size as it comes

// Frames [o, o + n) of the take at 48 kHz, for the encoder, as planar floats: read straight from
// the 16-bit take a slice at a time (a cubic between samples when the device ran at another rate),
// so no full-length float copy of the song is ever made.
function audio48(t, o, n) {
  const out = new Float32Array(n * 2);
  const { L, R } = t, len = L.length, k = 1 / 32768;
  if (t.sr === 48000) {
    for (let i = 0; i < n; i++) { const j = o + i; if (j >= len) break; out[i] = L[j] * k; out[n + i] = R[j] * k; }
    return out;
  }
  const ratio = t.sr / 48000;
  const at = (a, i) => (i < 0 ? 0 : i >= len ? 0 : a[i]);
  for (let i = 0; i < n; i++) {
    const x = (o + i) * ratio, i0 = Math.floor(x), f = x - i0;
    for (let c = 0; c < 2; c++) {
      const a = c ? R : L;
      const p0 = at(a, i0 - 1), p1 = at(a, i0), p2 = at(a, i0 + 1), p3 = at(a, i0 + 2);
      // Catmull-Rom through the four samples around the point
      const v = p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
      out[c * n + i] = Math.max(-1, Math.min(1, v * k));
    }
  }
  return out;
}

const TAKE_SOURCE = `
class VzTake extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false;
    this.buf = null; this.n = 0; this.size = 0;
    this.port.onmessage = (e) => {
      if (e.data.type === 'start') { this.size = Math.round(${CHUNK} * sampleRate) * 2; this.buf = new Int16Array(this.size); this.n = 0; this.on = true; this.started = false; }
      else if (e.data.type === 'stop') { this.flush(); this.on = false; this.port.postMessage({ type: 'stopped' }); }
    };
  }
  flush() {
    if (!this.buf || !this.n) return;
    const out = this.buf.slice(0, this.n);
    this.port.postMessage({ type: 'pcm', data: out }, [out.buffer]);
    this.n = 0;
  }
  process(inputs) {
    if (!this.on) return true;
    const inp = inputs[0], L = inp[0], R = inp[1] || inp[0];
    if (!this.started) { this.started = true; this.port.postMessage({ type: 'started', frame: currentFrame }); }
    const frames = L ? L.length : 128;
    for (let k = 0; k < frames; k++) {
      const l = L ? L[k] : 0, r = R ? R[k] : 0;
      this.buf[this.n++] = Math.max(-32768, Math.min(32767, Math.round(l * 32767)));
      this.buf[this.n++] = Math.max(-32768, Math.min(32767, Math.round(r * 32767)));
      if (this.n >= this.size) this.flush();
    }
    return true;
  }
}
registerProcessor('vz-take', VzTake);
`;

const even = (v) => Math.max(2, Math.round(v / 2) * 2);
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const LOOK_KEYS = ['bloom', 'aberration', 'grain', 'symmetry', 'particles', 'reduceFlashing', 'hueDrift', 'scanlines', 'glitch', 'softPalette', 'cycle'];

export function buildTake({ engine, analysis, renderer, registry, lyrics, clip, toast, lcdShow, key, cycle, group }) {
  let fpsIndex = 0;
  let node = null;
  let take = null;              // the take being recorded
  let last = null;              // the last finished take
  let rendering = null;         // { cancel } while a video is being made

  const takeBtn = key('Take', { title: 'Record a take: the sound and everything the picture does. Press again to stop.', onClick: () => (take ? stop() : start()), extra: 'take-key' });
  const renderBtn = key('Render MP4', { title: 'Make the video of the last take, frame by frame, at the clip format and size', onClick: () => render() });
  const fpsBtn = cycle('Rate', FPS.map((f) => `${f} fps`), () => fpsIndex, (i) => { fpsIndex = i; });
  const status = el('span', { class: 'take-status' }, 'No take yet');
  const bar = el('div', { class: 'take-bar' }, el('i'));
  renderBtn.disabled = true;
  clip.row.append(group('Take · render', takeBtn, renderBtn, fpsBtn, el('div', { class: 'take-meta' }, status, bar)));

  const veil = el('div', { class: 'render-veil', hidden: true },
    el('div', { class: 'render-card' },
      el('p', { class: 'legend' }, 'Rendering your clip'),
      el('div', { class: 'render-msg' }, ''),
      el('div', { class: 'take-bar render-bar' }, el('i')),
      el('button', { class: 'btn', type: 'button', onclick: () => rendering?.cancel() }, 'Cancel')));
  document.body.append(veil);
  const setVeil = (msg, frac) => {
    veil.querySelector('.render-msg').textContent = msg;
    veil.querySelector('.render-bar i').style.width = `${(frac * 100).toFixed(1)}%`;
  };

  // ── recording ─────────────────────────────────────────────────────────────
  async function ensureNode() {
    const ctx = engine.ensureContext();
    if (node) return node;
    const url = URL.createObjectURL(new Blob([TAKE_SOURCE], { type: 'text/javascript' }));
    try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    node = new AudioWorkletNode(ctx, 'vz-take', { numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' });
    engine.chain.output.connect(node);
    return node;
  }

  const state = () => ({
    scene: renderer.sceneId,
    palette: renderer.palette.id,
    hue: renderer.hue,
    time: renderer.time,
    look: pick(renderer.look, LOOK_KEYS),
    trail: { ...renderer.trail },
    sensitivity: analysis.sensitivity,
    motion: analysis.motion,
  });

  async function start() {
    if (rendering) return;
    if (!engine.playing) return toast('Start the music first: a take records what you hear.');
    let n;
    try { n = await ensureNode(); } catch (e) { return toast(`Takes need AudioWorklet: ${e.message}`, { kind: 'error' }); }
    const ctx = engine.ctx;
    take = { sr: ctx.sampleRate, chunks: [], samples: 0, startTime: null, events: [], frames: [], at: state(), lastLook: '', lastTrail: '', lastFlags: '', lastKnobs: '' };
    last = null;                       // a new take replaces the last one: its memory goes now, not after this one
    const log = (type, data) => { if (take?.startTime !== null && take) take.events.push({ t: ctx.currentTime - take.startTime, type, ...data }); };
    // what the picture is told to do is written down as it is told
    const wrap = (name, fn) => { renderer[name] = function (...args) { fn(...args); return Object.getPrototypeOf(renderer)[name].apply(renderer, args); }; };
    wrap('setScene', (id) => log('scene', { id }));
    wrap('setPalette', (id, opts) => log('palette', { id, glide: opts?.glide || 0 }));
    wrap('hit', (strength = 1, force) => { if (!force) log('hit', { strength }); });
    wrap('shock', (amount = 1, force) => { if (!force) log('shock', { amount }); });
    n.port.onmessage = (e) => {
      const m = e.data;
      if (!take) return;
      if (m.type === 'started') take.startTime = m.frame / take.sr;
      else if (m.type === 'pcm') { take.chunks.push(m.data); take.samples += m.data.length / 2; if (take.samples / take.sr > MAX_SECONDS) stop({ full: true }); }
    };
    n.port.postMessage({ type: 'start' });
    takeBtn.classList.add('is-recording');
    takeBtn.querySelector('span:last-child').textContent = 'Stop take';
    renderBtn.disabled = true;
    lcdShow('take', 'REC');
    clip.recordingStarted();
  }

  function stop({ full = false } = {}) {
    if (!take) return;
    const t = take;
    take = null;
    for (const name of ['setScene', 'setPalette', 'hit', 'shock']) delete renderer[name];
    takeBtn.classList.remove('is-recording');
    takeBtn.querySelector('span:last-child').textContent = 'Take';
    clip.recordingStopped();
    node.port.onmessage = (e) => {
      if (e.data.type === 'pcm') { t.chunks.push(e.data.data); t.samples += e.data.data.length / 2; }
      if (e.data.type !== 'stopped') return;
      // one interleaved run of chunks becomes two channels for the render; each chunk is let go
      // as soon as it is copied, so the take is not held twice over
      const L = new Int16Array(t.samples), R = new Int16Array(t.samples);
      let o = 0;
      for (let k = 0; k < t.chunks.length; k++) {
        const c = t.chunks[k];
        t.chunks[k] = null;
        for (let i = 0; i < c.length; i += 2) { L[o] = c[i]; R[o] = c[i + 1]; o++; }
      }
      t.L = L;
      t.R = R;
      t.chunks = null;
      last = t;
      const secs = t.samples / t.sr;
      status.textContent = `Take · ${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
      renderBtn.disabled = false;
      lcdShow('take', 'READY');
      toast(full ? `The take stopped at ${MAX_SECONDS / 60} minutes, the longest one${isPhone ? ' a phone' : ''} can render. Render MP4 makes the video.`
        : 'Take recorded. Render MP4 makes the video, frame by frame.', { timeout: full ? 8000 : 5000 });
    };
    node.port.postMessage({ type: 'stop' });
  }

  // every frame of a take: what changed in the picture, and where the song was
  function sample() {
    if (!take || take.startTime === null) return;
    const t = engine.ctx.currentTime - take.startTime;
    const look = JSON.stringify(pick(renderer.look, LOOK_KEYS));
    if (look !== take.lastLook) { take.lastLook = look; take.events.push({ t, type: 'look', look: JSON.parse(look) }); }
    const trail = JSON.stringify(renderer.trail);
    if (trail !== take.lastTrail) { take.lastTrail = trail; take.events.push({ t, type: 'trail', trail: JSON.parse(trail) }); }
    const flags = `${renderer.strobe}|${renderer.blackout}|${renderer.freeze}`;
    if (flags !== take.lastFlags) { take.lastFlags = flags; take.events.push({ t, type: 'flags', strobe: renderer.strobe, blackout: renderer.blackout, freeze: renderer.freeze }); }
    const knobs = `${analysis.sensitivity}|${analysis.motion}`;
    if (knobs !== take.lastKnobs) { take.lastKnobs = knobs; take.events.push({ t, type: 'knobs', sensitivity: analysis.sensitivity, motion: analysis.motion }); }
    const want = renderer.visual.want;
    take.frames.push({ t, extra: { ...renderer.extra }, song: engine.currentTime, bend: { ...want } });
    const secs = t;
    status.textContent = `● Take ${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
  }

  // ── rendering ─────────────────────────────────────────────────────────────
  async function codecs(w, h, fps) {
    if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') return null;
    const bitrate = Math.round(w * h * fps * 0.12);           // about 7.5 Mbps at 1080p30
    const level = w * h > 2088960 ? '33' : w * h > 921600 ? '2a' : '1f';
    for (const profile of ['6400', '4d00', '4200']) {
      const video = { codec: `avc1.${profile}${level}`, width: w, height: h, bitrate, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality' };
      try {
        if (!(await VideoEncoder.isConfigSupported(video)).supported) continue;
        const audio = { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 };
        if (!(await AudioEncoder.isConfigSupported(audio)).supported) return { video, audio: null };
        return { video, audio };
      } catch { /* try the next profile */ }
    }
    return null;
  }

  async function render() {
    const t = last;
    if (!t || rendering || take) return;
    const size = clip.size || { w: even(renderer.canvas.width), h: even(renderer.canvas.height) };
    const fps = FPS[fpsIndex];
    const conf = await codecs(size.w, size.h, fps);
    if (!conf) return toast('This browser cannot encode MP4 video. Use REC instead: it records the screen as it plays.', { kind: 'error', timeout: 8000 });
    if (!conf.audio) toast('This browser cannot encode AAC audio, so the video will be silent. Chrome or Edge can.', { kind: 'error', timeout: 8000 });

    let cancelled = false;
    rendering = { cancel: () => { cancelled = true; } };
    veil.hidden = false;
    setVeil('Getting ready…', 0);
    const wasPlaying = engine.playing && !engine.decks;
    engine.pause();
    // the live show is put aside, to be given back exactly as it was
    const keep = {
      ...state(), fixed: renderer.fixedSize, palFrom: renderer.palFrom, palProgress: renderer.palProgress, palGlide: renderer.palGlide,
      extra: { ...renderer.extra }, strobe: renderer.strobe, blackout: renderer.blackout, freeze: renderer.freeze, fade: renderer.fade,
      lyricEngine: lyrics.engine, stageFrac: lyrics.stageFrac,
    };
    renderer.busy = true;
    const restore = () => {
      renderer.setFixedSize(keep.fixed);
      Object.assign(renderer.look, keep.look);
      renderer.palette = renderer.palette;                       // (setPalette below puts the glide back too)
      renderer.setPalette(keep.palette);
      renderer.palFrom = keep.palFrom; renderer.palProgress = keep.palProgress; renderer.palGlide = keep.palGlide;
      if (renderer.sceneId !== keep.scene) renderer.setScene(keep.scene);
      renderer.trail = keep.trail;
      renderer.hue = keep.hue;
      renderer.time = keep.time;
      renderer.fade = keep.fade;
      Object.assign(renderer.extra, keep.extra);
      renderer.strobe = keep.strobe; renderer.blackout = keep.blackout; renderer.freeze = keep.freeze;
      renderer.visual.strength = 0; renderer.visual.shock = 0; renderer.visual.age = 9;
      for (const k in renderer.visual.bend) { renderer.visual.bend[k] = 0; renderer.visual.want[k] = 0; }
      renderer.clearTrails = true;
      lyrics.engine = keep.lyricEngine;
      lyrics.stageFrac = keep.stageFrac;
      lyrics.shownIndex = -2;
      renderer.busy = false;
      veil.hidden = true;
      rendering = null;
    };

    try {
      // every scene the take used is compiled before the first frame, so none of them pops in late
      const scenes = [...new Set([t.at.scene, ...t.events.filter((e) => e.type === 'scene').map((e) => e.id)])];
      for (const id of scenes) { const s = registry.get(id); if (s) await renderer.ready(s); }

      // (the audio is made at 48 kHz for the encoder later, a slice at a time, straight from the take)
      const total = t.L.length;

      // the picture starts where the take started
      renderer.setFixedSize(size);
      Object.assign(renderer.look, t.at.look);
      renderer.setPalette(t.at.palette);
      renderer.setScene(t.at.scene);
      renderer.trail = { ...t.at.trail };
      renderer.hue = t.at.hue;
      renderer.time = t.at.time;
      renderer.fade = 1;
      renderer.clearTrails = true;
      renderer.strobe = renderer.blackout = renderer.freeze = false;
      const tap = new TakeTap({ L: t.L, R: t.R, sampleRate: t.sr });
      const offlineEngine = { ...tap, analyser: tap.analyser, beatAnalyser: tap.beatAnalyser, analyserL: tap.analyserL, analyserR: tap.analyserR, ctx: tap.ctx, playing: true, addEventListener() {} };
      const an = new AudioAnalysis(offlineEngine);
      an.sensitivity = t.at.sensitivity;
      an.motion = t.at.motion;
      const songClock = { currentTime: 0, decks: null };
      lyrics.engine = songClock;
      lyrics.stageFrac = 1;
      lyrics.shownIndex = -2;

      // the encoders, and what they hand back. The video's bytes are put into Blobs a few MB at a
      // time (the browser may keep those out of the page's memory, on disk), and the file is made
      // of those Blobs: the whole video is never one more copy in memory.
      const vSamples = [], vMedia = [];
      let pending = [], pendingBytes = 0;
      const setAside = () => { if (pending.length) { vMedia.push(new Blob(pending)); pending = []; pendingBytes = 0; } };
      let avcC = null, encodeError = null;
      const venc = new VideoEncoder({
        output: (chunk, meta) => {
          if (meta?.decoderConfig?.description && !avcC) avcC = new Uint8Array(meta.decoderConfig.description);
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          vSamples.push({ size: data.length, key: chunk.type === 'key' });
          pending.push(data);
          if ((pendingBytes += data.length) >= BLOB_BYTES) setAside();
        },
        error: (e) => { encodeError = e; },
      });
      venc.configure(conf.video);

      const frames = Math.floor((total / t.sr) * fps);
      const dt = 1 / fps;
      let ev = 0, fr = 0;
      for (let i = 0; i < frames; i++) {
        if (cancelled) throw new Error('cancelled');
        if (encodeError) throw encodeError;
        const at = i * dt;
        // what the take did up to this frame
        while (ev < t.events.length && t.events[ev].t <= at) {
          const e = t.events[ev++];
          if (e.type === 'scene') renderer.setScene(e.id);
          else if (e.type === 'palette') renderer.setPalette(e.id, { glide: e.glide });
          else if (e.type === 'look') Object.assign(renderer.look, e.look);
          else if (e.type === 'trail') renderer.trail = { ...e.trail };
          else if (e.type === 'flags') { renderer.strobe = e.strobe; renderer.blackout = e.blackout; renderer.freeze = e.freeze; }
          else if (e.type === 'knobs') { an.sensitivity = e.sensitivity; an.motion = e.motion; }
          else if (e.type === 'hit') renderer.hit(e.strength, true);
          else if (e.type === 'shock') renderer.shock(e.amount, true);
        }
        while (fr + 1 < t.frames.length && t.frames[fr + 1].t <= at) fr++;
        const f = t.frames[fr];
        if (f) {
          Object.assign(renderer.extra, f.extra);
          renderer.bend(f.bend, true);
          songClock.currentTime = f.song + (at - f.t);
        }
        tap.seek(at);
        an.update(dt);
        lyrics.tick(dt, an);
        if (clip.paintAt(size.w, size.h, at, true)) renderer.setBrand(clip.canvas); else renderer.setBrand(null);
        renderer.render(an, dt);
        const frame = new VideoFrame(renderer.canvas, { timestamp: Math.round(i * 1e6 * dt), duration: Math.round(1e6 * dt) });
        venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
        frame.close();
        if (venc.encodeQueueSize > 6 || i % 8 === 0) {
          while (venc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
          setVeil(`Frame ${i + 1} of ${frames} · ${size.w}×${size.h} · ${fps} fps`, (i + 1) / frames * (conf.audio ? 0.93 : 0.99));
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      await venc.flush();
      venc.close();
      setAside();
      if (encodeError) throw encodeError;
      if (!avcC) throw new Error('The video encoder gave no configuration.');

      let audio = null;
      if (conf.audio) {
        setVeil('Encoding the sound…', 0.95);
        const aSamples = [];
        let asc = null;
        const aenc = new AudioEncoder({
          output: (chunk, meta) => {
            if (meta?.decoderConfig?.description && !asc) asc = new Uint8Array(meta.decoderConfig.description);
            const data = new Uint8Array(chunk.byteLength);
            chunk.copyTo(data);
            aSamples.push({ data, duration: Math.max(1, Math.round(((chunk.duration || 21333) * 48000) / 1e6)) });
          },
          error: (e) => { encodeError = e; },
        });
        aenc.configure(conf.audio);
        const length = Math.min(Math.floor((total * 48000) / t.sr), Math.round((frames / fps) * 48000));
        const step = 4800;
        for (let o = 0; o < length; o += step) {
          if (cancelled) throw new Error('cancelled');
          const n = Math.min(step, length - o);
          const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((o * 1e6) / 48000), data: audio48(t, o, n) });
          aenc.encode(ad);
          ad.close();
          // the encoder works on its own thread: a long take is fed to it a little at a time
          if (aenc.encodeQueueSize > 32) await new Promise((r) => setTimeout(r, 2));
        }
        await aenc.flush();
        aenc.close();
        if (encodeError) throw encodeError;
        // AAC-LC, 48 kHz, stereo, if the encoder did not say
        audio = { sampleRate: 48000, channels: 2, samples: aSamples, asc: asc || Uint8Array.of(0x11, 0x90), bitrate: 192000 };
      }

      setVeil('Writing the file…', 0.99);
      const blob = muxMP4({ video: { width: size.w, height: size.h, fps, samples: vSamples, media: vMedia, avcC }, audio });
      if (typeof __VZ_PRODUCTION__ === 'undefined') window.__lastRender = blob;   // for checking a render from the console
      const title = (engine.track?.title || 'visulaserz').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'visulaserz';
      const a = el('a', { href: URL.createObjectURL(blob), download: `${title} - ${size.w}x${size.h}.mp4` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      restore();
      toast(`Video saved: ${size.w}×${size.h}, ${fps} fps, ${(blob.size / 1048576).toFixed(1)} MB.`, { timeout: 7000 });
      lcdShow('render', 'DONE');
    } catch (e) {
      restore();
      if (e.message === 'cancelled') toast('Render cancelled.');
      else { console.error(e); toast(`The video could not be made: ${e.message}`, { kind: 'error', timeout: 9000 }); }
    }
    if (wasPlaying) engine.play();
  }

  return {
    get recording() { return !!take; },
    get rendering() { return !!rendering; },
    // called at the end of every UI frame, after the tools have bent the picture for the next one
    tick() { if (take) sample(); },
    stop,
  };
}
