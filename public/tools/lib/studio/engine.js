import { playDrum, playSynth, releaseVoice, cutVoice, playBuffer, playClick, ROOT } from './sounds.js';
import { createEffect } from './effects.js';
import { BAR, INSERTS, patternOf, songEnd } from './model.js';

// The Studio's engine. Channels play into their mixer inserts; each insert runs its effect slots,
// its fader and its pan into the master, which ends in a limiter. The sequencer plays either the
// picked pattern round and round (PAT) or the playlist from left to right (SONG), every step
// scheduled a little ahead on the audio clock from a worker's timer, so a busy frame or a tab in
// the background cannot make the beat stumble. Synced, the steps fall on the song's own beat
// grid (the tools' beat clock); free, on the Studio's own tempo.

const AHEAD = 0.16;
const TICKER = 'let t=null;onmessage=(e)=>{clearInterval(t);t=e.data>0?setInterval(()=>postMessage(0),e.data):null;};';

export function createStudioEngine({ ctx, out, clock, project, onVisual, live: realtime = true }) {
  const ease = (param, v, tau = 0.02) => param.setTargetAtTime(v, ctx.currentTime, tau);
  const stepDur = () => (project.sync ? clock.period : 60 / project.bpm) / 4;
  const fxEnv = { stepDur };

  // ── the master and the inserts ────────────────────────────────────────────────────────────
  const limiter = ctx.createDynamicsCompressor();      // a brick wall at the very end
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  limiter.connect(out);
  const metro = ctx.createGain();
  metro.connect(out);

  const inserts = [];
  for (let i = 0; i <= INSERTS; i++) {
    const input = ctx.createGain(), fader = ctx.createGain(), pan = ctx.createStereoPanner(), gate = ctx.createGain();
    const meter = ctx.createAnalyser();
    meter.fftSize = 512;
    fader.connect(pan).connect(gate);
    gate.connect(meter);
    inserts.push({ i, input, fader, pan, gate, meter, buf: new Float32Array(512), fx: [], sig: null });
  }
  inserts[0].gate.connect(limiter);
  for (let i = 1; i <= INSERTS; i++) inserts[i].gate.connect(inserts[0].input);

  // An insert's chain: its input, the effects in its slots that are on, its fader. It is only
  // rebuilt when the slots change; a knob only sets the effect it belongs to.
  function chain(i) {
    const ins = inserts[i], data = project.mixer.inserts[i];
    const want = data.fx.map((f) => (f && f.on ? `${f.id}:${f.type}` : '')).join('|');
    if (want !== ins.sig) {
      for (const f of ins.fx) f.node.dispose();
      try { ins.input.disconnect(); } catch { /* fresh */ }
      ins.fx = data.fx.filter((f) => f && f.on).map((f) => ({ id: f.id, node: createEffect(ctx, f.type, f.params, fxEnv) }));
      let head = ins.input;
      for (const f of ins.fx) { head.connect(f.node.input); head = f.node.output; }
      head.connect(ins.fader);
      ins.sig = want;
    } else {
      for (const f of ins.fx) { const d = data.fx.find((x) => x?.id === f.id); if (d) f.node.set(d.params); }
    }
    ease(ins.fader.gain, data.vol * data.vol * 1.25);
    ease(ins.pan.pan, data.pan);
    ease(ins.gate.gain, data.mute ? 0 : 1);
  }
  function mixAll() { for (let i = 0; i <= INSERTS; i++) chain(i); }

  // ── the channels ───────────────────────────────────────────────────────────────────────────
  const strips = new Map();
  function strip(ch) {
    let s = strips.get(ch.id);
    if (!s) {
      const input = ctx.createGain(), vol = ctx.createGain(), pan = ctx.createStereoPanner(), gate = ctx.createGain();
      input.connect(vol).connect(pan).connect(gate);
      s = { input, vol, pan, gate, to: -1 };
      strips.set(ch.id, s);
    }
    const to = Math.max(0, Math.min(INSERTS, ch.insert | 0));
    if (s.to !== to) { try { s.gate.disconnect(); } catch { /* new */ } s.gate.connect(inserts[to].input); s.to = to; }
    ease(s.vol.gain, ch.vol * ch.vol * 1.25);
    ease(s.pan.pan, ch.pan);
    return s;
  }
  const soloing = () => project.channels.some((c) => c.solo);
  const audible = (ch) => !ch.mute && !(soloing() && !ch.solo);
  function syncChannels() {
    const ids = new Set(project.channels.map((c) => c.id));
    for (const [id, s] of strips) if (!ids.has(id)) { try { s.gate.disconnect(); } catch { /* gone */ } strips.delete(id); }
    for (const ch of project.channels) { const s = strip(ch); ease(s.gate.gain, audible(ch) ? 1 : 0); }
    mixAll();
  }

  // ── playing a channel ─────────────────────────────────────────────────────────────────────
  const mono = new Map();
  const held = new Map();
  const slices = new Map();
  let trackDuck = null;
  // a kick dips every Sidechain effect, and the song itself as deep as the master's Song duck says
  function kicked(t, vel) {
    for (const ins of inserts) for (const f of ins.fx) f.node.kick?.(t, vel);
    if (trackDuck && project.mixer.songDuck > 0.01) {
      const param = trackDuck;
      if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t); else param.cancelScheduledValues(t);
      param.linearRampToValueAtTime(1 - 0.85 * project.mixer.songDuck * vel, t + 0.006);
      param.linearRampToValueAtTime(1, t + Math.max(0.12, stepDur() * 3.2));
    }
  }
  function trigger(ch, key, t, vel, dur) {
    const s = strips.get(ch.id) || strip(ch);
    const p = ch.params;
    let voice = null;
    if (ch.plugin === 'drum') {
      playDrum(ctx, s.input, p.sound, t, { vel, pitch: key - ROOT + (p.tune || 0), decay: p.decay || 1, tone: p.tone ?? 0.5 });
      if (p.sound === 'kick') kicked(t, vel);
    } else if (ch.plugin === 'synth') {
      if (p.mono) {
        const prev = mono.get(ch.id);
        const from = prev && prev.ended > t + 0.001 ? prev.freq : 0;        // overlapping notes slide
        cutVoice(prev, t);
        voice = playSynth(ctx, s.input, p, key, t, { vel, dur, from });
        mono.set(ch.id, voice);
      } else {
        voice = playSynth(ctx, s.input, p, key, t, { vel, dur });
      }
    } else if (ch.plugin === 'sampler') {
      if (ch.sample?.buffer) playBuffer(ctx, s.input, ch.sample.buffer, t, { vel, key: key + (p.tune || 0), root: p.root ?? ROOT, dur: dur > 0 ? Math.max(dur, 0.05) : 0, attack: p.attack || 0.002, release: p.release || 0.02, reverse: p.reverse });
    } else if (ch.plugin === 'slicer') {
      const sl = slices.get(ch.id), i = key - ROOT;
      if (sl && i >= 0 && i < sl.cuts.length) {
        const c = sl.cuts[i];
        playBuffer(ctx, s.input, sl.buffer, t, { vel, key: ROOT + (p.tune || 0), offset: c.off, length: c.len, dur, release: 0.006, reverse: p.reverse });
      }
    }
    onVisual?.(t, ch, key, vel);
    return voice;
  }
  // everything one step of a pattern holds, from time t
  function stepEvents(pat, i, t) {
    const sd = stepDur();
    const swung = t + (i % 2 ? project.swing * sd * 0.5 : 0);
    for (const ch of project.channels) {
      if (!audible(ch)) continue;
      const q = pat.ch[ch.id];
      if (!q) continue;
      if (q.notes.length) {
        for (const n of q.notes) {
          if (n.s < i || n.s >= i + 1 || n.s >= pat.len) continue;
          trigger(ch, n.k, swung + (n.s - i) * sd, (n.v ?? 100) / 127, n.l * sd);
        }
      } else if (q.steps[i]) {
        // on a slicer, step n plays slice n, so a row of steps plays the bars back as they were
        const key = ch.plugin === 'slicer' ? ROOT + (i % (slices.get(ch.id)?.cuts.length || 16)) : ROOT;
        trigger(ch, key, swung, q.steps[i] / 127, ch.plugin === 'synth' ? sd : 0);
      }
    }
  }

  // ── the sequencer ─────────────────────────────────────────────────────────────────────────
  let playing = false;
  let pos = 0;                 // PAT: the step in the pattern; SONG: the step in the song
  let gridTime = 0;
  let queued = null;
  let startAt = 0;             // where SONG starts when play is pressed
  const marks = [];
  function scheduleStep(t) {
    if (project.mode === 'song') {
      for (const c of project.playlist.clips) {
        if (pos < c.start || pos >= c.start + c.len || project.playlist.tracks[c.track]?.mute) continue;
        const pat = patternOf(project, c.pattern);
        if (pat) stepEvents(pat, (pos - c.start) % pat.len, t);
      }
    } else {
      const pat = patternOf(project, project.pattern);
      if (pat) stepEvents(pat, pos % pat.len, t);
    }
    if (project.ui.metronome && pos % 4 === 0) playClick(ctx, metro, t, pos % BAR === 0);
    marks.push([t, project.mode, project.pattern, pos]);
    if (marks.length > 96) marks.splice(0, marks.length - 96);
    pos++;
    if (project.mode === 'song') {
      if (pos >= songEnd(project)) pos = 0;                 // the song comes round, as FL's does
    } else {
      const pat = patternOf(project, project.pattern);
      if (!pat || pos >= pat.len) {
        pos = 0;
        if (queued) { project.pattern = queued; queued = null; }
      }
    }
  }
  function pump() {
    if (!playing) return;
    const now = ctx.currentTime;
    while (gridTime < now + AHEAD) {
      if (gridTime < now - 0.05) gridTime = project.sync ? clock.next(0.25, now) : now + 0.01;   // fell behind: catch up
      scheduleStep(gridTime);
      gridTime = project.sync ? clock.next(0.25, gridTime + stepDur() * 0.5) : gridTime + stepDur();
    }
  }
  let ticker = null;
  if (realtime) {
    try {
      ticker = new Worker(URL.createObjectURL(new Blob([TICKER], { type: 'text/javascript' })));
      ticker.onmessage = pump;
    } catch { ticker = null; }                      // the frame loop still pumps
  }
  let lastSd = 0;
  function play() {
    if (playing) return;
    playing = true;
    pos = project.mode === 'song' ? startAt : 0;
    queued = null;
    marks.length = 0;
    const now = ctx.currentTime + 0.05;
    gridTime = project.sync && clock.trust > 0.1 ? clock.next(1, now) : now;
    pump();
    ticker?.postMessage(25);
  }
  function stop() {
    if (!playing) return;
    playing = false;
    ticker?.postMessage(0);
    const t = ctx.currentTime;
    for (const v of mono.values()) releaseVoice(v, t);
    mono.clear();
  }

  return {
    get playing() { return playing; },
    get queued() { return queued; },
    get stepDur() { return stepDur(); },
    get startAt() { return startAt; },
    inserts,
    play, stop,
    toggle() { if (playing) stop(); else play(); },
    // the frame loop's spare pump, and the delays' tempo when the song's speed moves
    pump() {
      pump();
      const sd = stepDur();
      if (Math.abs(sd - lastSd) > 1e-4) { lastSd = sd; for (const ins of inserts) for (const f of ins.fx) f.node.tempo(); }
    },
    // a pattern picked while PAT plays starts when the one playing comes round
    queue(id) { if (!playing || project.mode === 'song') project.pattern = id; else queued = id === project.pattern ? null : id; },
    // where SONG starts from; while it plays, it jumps there
    seek(step) {
      startAt = Math.max(0, Math.min(songEnd(project) - 1, Math.floor(step)));
      if (playing && project.mode === 'song') { pos = startAt; marks.length = 0; gridTime = Math.max(gridTime, ctx.currentTime + 0.02); }
    },
    // the playhead now: { mode, pattern, step (with its fraction) }, or null when stopped
    position() {
      if (!playing) return null;
      const now = ctx.currentTime;
      for (let k = marks.length - 1; k >= 0; k--) {
        const m = marks[k];
        if (m[0] <= now) return { mode: m[1], pattern: m[2], step: m[3] + Math.min(0.999, (now - m[0]) / stepDur()) };
      }
      return null;
    },
    syncChannels, mixAll, chain,
    setTrackDuck(param) { trackDuck = param; },
    noteOn(ch, key, vel = 0.85) {
      // a voice already held on this key (a doubled MIDI note-on, an audition over a held key) is
      // let go first: left behind, it would sound for ever, out of reach even of allOff
      const id = `${ch.id}:${key}`;
      const old = held.get(id);
      if (old) { held.delete(id); releaseVoice(old, ctx.currentTime); if (mono.get(ch.id) === old) mono.delete(ch.id); }
      const v = trigger(ch, key, ctx.currentTime + 0.004, vel, ch.plugin === 'synth' ? 0 : 0.5);
      if (v) held.set(id, v);
    },
    noteOff(ch, key) {
      const id = `${ch.id}:${key}`, v = held.get(id);
      if (!v) return;
      held.delete(id);
      releaseVoice(v, ctx.currentTime);
      if (mono.get(ch.id) === v) mono.delete(ch.id);
    },
    allOff() { const t = ctx.currentTime; for (const v of held.values()) releaseVoice(v, t); held.clear(); },
    setSlices(ch, buffer, count) {
      const len = buffer.duration / count;
      slices.set(ch.id, { buffer, cuts: Array.from({ length: count }, (_, i) => ({ off: i * len, len })) });
    },
    slices: (ch) => slices.get(ch.id) || null,
    // the loudest sample an insert has just played (0 is the master)
    level(i) {
      const ins = inserts[i];
      if (!ins) return 0;
      ins.meter.getFloatTimeDomainData(ins.buf);
      let m = 0;
      for (const x of ins.buf) m = Math.max(m, Math.abs(x));
      return m;
    },
    // For an offline render: the picked pattern `loops` times, or the whole song, from t0.
    // Returns how long it lasts.
    scheduleAll(t0, { song = false, loops = 1 } = {}) {
      const sd = stepDur();
      const total = song ? songEnd(project) : (patternOf(project, project.pattern)?.len || BAR) * loops;
      pos = 0;
      for (let n = 0; n < total; n++) scheduleStep(t0 + n * sd);
      return total * sd;
    },
    destroy() {
      stop();
      ticker?.terminate();
      try { limiter.disconnect(); metro.disconnect(); } catch { /* gone */ }
    },
  };
}
