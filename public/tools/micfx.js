import { NOTES, mtof, keyListener } from './lib/key.js';

// MIC FX: your own voice over the track, through a box of effects. PITCH moves it up or down
// without slowing it (a chipmunk, a giant), ROBOT rings it against a low tone, RADIO squeezes it
// through a cheap speaker, and VOCODER makes it sing: the voice is split into sixteen bands, and
// the loudness of each one is laid onto a synth chord in the song's key, so what you say comes
// out as a chord that talks. The voice goes in with the tools' own sound, so the Looper can
// record it. Nothing is recorded or sent anywhere: the microphone only opens when you press Mic,
// and it closes with the tool.
//
// Use headphones: through speakers, the microphone hears itself and howls.
//
// Keys, once it has been clicked: 1–5 pick the effect, M opens or closes the microphone.

const MODES = ['Clean', 'Pitch', 'Robot', 'Radio', 'Vocoder'];
const BANDS = 16;
const GATE_DB = -48;              // below this the gate shuts the room out between words

// The pitch shifter: a read head runs through a short delay line at the speed the pitch asks for
// (faster reads the voice higher, slower lower), and whenever it drifts too near the write head,
// or too far behind it, it jumps by a few dozen milliseconds with a short crossfade. A blind jump
// lands at a random point of the waveform's cycle and the two heads cancel in the fade, which is
// the warble cheap shifters have; this one first looks around where it is going to land for the
// spot whose last few milliseconds match what it has just been playing, and splices there.
const PITCH_SOURCE = `
class VzPitch extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }]; }
  constructor() {
    super();
    const ms = (x) => Math.round((sampleRate * x) / 1000);
    this.jump = ms(34); this.xf = ms(8); this.search = ms(6); this.corr = ms(6);
    this.dmin = this.xf * 3 + 8;                          // even 4x up cannot catch the write head during a fade
    this.dmax = this.dmin + this.jump + this.search;
    this.len = 1; while (this.len < 2 * (this.dmax + this.jump + 2 * this.search + 4 * this.corr)) this.len <<= 1;
    this.mask = this.len - 1;
    this.buf = new Float32Array(this.len);
    this.w = 0;
    this.d = this.dmin + this.jump / 2;                   // how far behind the write head it reads, in samples
    this.fade = null;
    this.alive = true;
    this.port.onmessage = () => { this.alive = false; };
  }
  read(d) {
    const p = this.w - d, i = Math.floor(p), f = p - i;
    const a = this.buf[i & this.mask], b = this.buf[(i + 1) & this.mask];
    return a + (b - a) * f;
  }
  // near delay \`to\`, the one whose recent past looks most like the recent past at \`from\`
  align(from, to, ratio, lo, hi) {
    let best = Math.min(hi, Math.max(lo, to)), score = -Infinity;
    for (let o = -this.search; o <= this.search; o += 3) {
      const c = to + o;
      if (c < lo || c > hi) continue;
      let s = 0;
      for (let t = 0; t < this.corr; t += 4) { const back = t * ratio; s += this.read(from + back) * this.read(c + back); }
      if (s > score) { score = s; best = c; }
    }
    return best;
  }
  process(inputs, outputs, params) {
    const inp = inputs[0] && inputs[0][0], out = outputs[0];
    const n = out[0].length, ratio = params.ratio[0], drift = 1 - ratio;
    const lo = this.dmin + this.xf * Math.max(0, -drift), hi = this.dmax;
    for (let k = 0; k < n; k++) {
      this.buf[this.w & this.mask] = inp ? inp[k] : 0;
      this.w++;
      this.d += drift;
      if (!this.fade && (this.d < this.dmin || this.d > this.dmax)) {
        const to = this.d < this.dmin ? this.d + this.jump : this.d - this.jump;
        this.fade = { d: this.align(this.d, to, ratio, lo, hi), k: 0 };
      }
      let y = this.read(this.d);
      const f = this.fade;
      if (f) {
        f.d += drift;
        const g = f.k / this.xf;
        y = y * (1 - g) + this.read(f.d) * g;
        if (++f.k >= this.xf) { this.d = f.d; this.fade = null; }
      }
      for (let c = 0; c < out.length; c++) out[c][k] = y;
    }
    return this.alive;
  }
}
registerProcessor('vz-pitch', VzPitch);
`;

export default {
  id: 'micfx',
  name: 'Mic FX',
  group: 'Instruments',
  blurb: 'Your voice over the track: shift it up or down, make it a robot or a radio, or a vocoder that turns what you say into chords in the song’s key. Headphones on',
  tags: ['microphone', 'vocoder', 'voice', 'pitch', 'robot', 'karaoke', 'mc'],
  size: { w: 470, h: 216 },

  create(host, mount) {
    const { el } = host;
    let mode = Math.min(MODES.length - 1, host.store.get('mode', 0) | 0);
    let shift = host.store.get('shift', -5);
    let robotHz = host.store.get('robotHz', 70);
    let drive = host.store.get('drive', 0.5);
    let breath = host.store.get('breath', 0.25);
    let root = host.store.get('root', 9) % 12;
    let minor = host.store.get('minor', true);
    let gateOn = host.store.get('gate', true);
    let level = host.store.get('level', 0.75);
    let rig = null;                 // the effects, built once the sound is up
    let mic = null;                 // { stream, source } while the microphone is open
    let opening = false;
    let destroyed = false;
    let gateOpen = false, micLevel = 0;

    // ── controls ──────────────────────────────────────────────────────────────
    const keys = MODES.map((m, i) => el('button', { class: 'tool-key', type: 'button', title: `${m} (key ${i + 1})`, onclick: () => setMode(i) }, m, el('kbd', {}, String(i + 1))));
    const micBtn = el('button', { class: 'key mic-key', type: 'button', title: 'Open the microphone (M). It closes again with the tool.', onclick: () => toggleMic() }, el('span', { class: 'led' }), el('span', {}, 'Mic'));
    const canvas = el('canvas');
    const meter = el('div', { class: 'tool-surface mic-meter', title: 'Your voice. Below the line the gate keeps the room out.' }, canvas);
    const shiftKnob = host.ui.knob({ label: 'Shift', min: -12, max: 12, value: shift, def: -5, origin: 0, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} st`, onChange: (v) => { shift = Math.round(v); host.store.set('shift', shift); retune(); } });
    const robotKnob = host.ui.knob({ label: 'Tone', min: 30, max: 240, value: robotHz, def: 70, curve: 1.6, fmt: (v) => `${Math.round(v)} Hz`, onChange: (v) => { robotHz = v; host.store.set('robotHz', v); retune(); } });
    const driveKnob = host.ui.knob({ label: 'Drive', value: drive, def: 0.5, onChange: (v) => { drive = v; host.store.set('drive', v); retune(); } });
    const breathKnob = host.ui.knob({ label: 'Breath', value: breath, def: 0.25, onChange: (v) => { breath = v; host.store.set('breath', v); retune(); } });
    const rootCycle = host.ui.cycle({ label: 'Root', options: NOTES, index: root, onChange: (i) => { root = i; host.store.set('root', i); retune(); } });
    const keyCycle = host.ui.cycle({ label: 'Key', options: ['Major', 'Minor'], index: minor ? 1 : 0, onChange: (i) => { minor = i === 1; host.store.set('minor', minor); retune(); } });
    const listenBtn = el('button', { class: 'key', type: 'button', title: 'Listen to the track for a few seconds and set the vocoder’s key', onclick: () => { if (ear.start()) listenLed(true); } }, el('span', { class: 'led' }), el('span', {}, 'Listen'));
    const gateSw = host.ui.toggle({ label: 'Gate', on: gateOn, title: 'Keep the room quiet between words', onChange: (v) => { gateOn = v; host.store.set('gate', v); } });
    const levelKnob = host.ui.knob({ label: 'Level', value: level, def: 0.75, onChange: (v) => { level = v; host.store.set('level', v); if (rig) rig.out.gain.setTargetAtTime(v * v * 1.4, rig.ctx.currentTime, 0.03); } });
    const hint = el('span', { class: 'tool-hint' });
    const per = el('div', { class: 'mic-mode' });
    mount.append(
      el('div', { class: 'tool-keys' }, keys),
      el('div', { class: 'tool-row mic-row' }, micBtn, meter),
      el('div', { class: 'tool-row' }, per, el('div', { class: 'tool-row-end' }, gateSw.el, levelKnob.el)),
    );
    const g = canvas.getContext('2d');

    function showControls() {
      keys.forEach((k, j) => k.classList.toggle('is-active', j === mode));
      const parts = [
        [hintFor('Your voice as it is, over the track and into the Looper')],
        [shiftKnob.el, hintFor('Down is a giant, up is a chipmunk')],
        [robotKnob.el, hintFor('Lower is a robot, higher a bell')],
        [driveKnob.el, hintFor('A voice through a cheap speaker')],
        [rootCycle.el, keyCycle.el, listenBtn, breathKnob.el],
      ][mode];
      per.replaceChildren(...parts);
    }
    function hintFor(text) { hint.textContent = text; return hint; }

    const ear = keyListener(host, {
      onDone({ root: r, minor: m, name }) {
        listenLed(false);
        root = r;
        minor = m;
        rootCycle.set(r, true);
        keyCycle.set(m ? 1 : 0, true);
        host.store.set('root', root);
        host.store.set('minor', minor);
        retune();
        host.toast(`It sounds like ${name}: the vocoder sings in it now.`);
      },
      onFail(message) { listenLed(false); host.toast(message); },
    });
    function listenLed(on) {
      listenBtn.classList.toggle('is-active', on);
      listenBtn.querySelector('span:last-child').textContent = on ? 'Listening…' : 'Listen';
    }

    // ── the rig: every effect built once, side by side; only the chosen one is turned up ─────
    async function build() {
      if (rig) return rig;
      const ctx = host.audio.ensure();
      if (!ctx || !host.audio.input) return null;
      try { await host.audio.worklet('vz-pitch', PITCH_SOURCE); } catch { /* no worklets: Pitch stays dry */ }
      if (rig || destroyed) return rig;
      const sr = ctx.sampleRate;
      const input = ctx.createGain();           // the microphone comes in here
      const gate = ctx.createGain();
      gate.gain.value = gateOn ? 0 : 1;
      input.connect(gate);
      const listen = ctx.createAnalyser();
      listen.fftSize = 1024;
      input.connect(listen);
      const out = ctx.createGain();
      out.gain.value = level * level * 1.4;
      out.connect(host.audio.input);
      const lanes = MODES.map(() => { const l = ctx.createGain(); l.gain.value = 0; l.connect(out); return l; });
      const biquad = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; return b; };

      // clean: a little low cut, so the breath and the desk's thumps stay out
      const clean = biquad('highpass', 90, 0.7);
      gate.connect(clean).connect(lanes[0]);

      // pitch
      let pitch = null;
      try { pitch = new AudioWorkletNode(ctx, 'vz-pitch', { outputChannelCount: [1] }); } catch { /* left dry */ }
      if (pitch) clean.connect(pitch).connect(lanes[1]);
      else clean.connect(lanes[1]);

      // robot: the voice times a sine (a ring modulator), plus a little of itself
      const ring = ctx.createGain();
      ring.gain.value = 0;
      const carrier = ctx.createOscillator();
      carrier.frequency.value = robotHz;
      carrier.connect(ring.gain);
      carrier.start();
      clean.connect(ring).connect(lanes[2]);
      const ringDry = ctx.createGain();
      ringDry.gain.value = 0.18;
      clean.connect(ringDry).connect(lanes[2]);

      // radio: a narrow band, a hard squash, a buzz of noise
      const radioIn = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.max(-0.6, Math.min(0.6, Math.tanh(x * 3))) / 0.6; }
      shaper.curve = curve;
      const radioLevel = ctx.createGain();
      radioLevel.gain.value = 0.28;               // the squash makes it loud: bring it back to the others
      clean.connect(biquad('highpass', 480, 0.9)).connect(biquad('lowpass', 3200, 0.9)).connect(radioIn).connect(shaper).connect(biquad('peaking', 1700, 1.2)).connect(radioLevel).connect(lanes[3]);

      // vocoder: the voice's loudness in each of sixteen bands sets the level of the same band
      // of a synth chord. A band's loudness is followed by rectifying it and smoothing it.
      const rect = new Float32Array(2048);
      for (let i = 0; i < rect.length; i++) rect[i] = Math.abs((i / (rect.length - 1)) * 2 - 1);
      const chord = ctx.createGain();
      const voices = [0, 1, 2, 3].map(() => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.start(); const gn = ctx.createGain(); gn.gain.value = 0.22; o.connect(gn).connect(chord); return o; });
      const hiss = ctx.createBufferSource();
      hiss.buffer = host.audio.noise();
      hiss.loop = true;
      hiss.start();
      const hissLevel = ctx.createGain();
      hissLevel.gain.value = 0;
      hiss.connect(biquad('lowpass', 12000)).connect(hissLevel).connect(chord);
      const vocoded = ctx.createGain();
      vocoded.gain.value = 14;                 // sixteen narrow bands of a chord are quiet: bring them up
      vocoded.connect(lanes[4]);
      const lo = 130, hi = Math.min(7600, sr * 0.4);
      for (let b = 0; b < BANDS; b++) {
        const f = lo * Math.pow(hi / lo, b / (BANDS - 1));
        const env = ctx.createWaveShaper();
        env.curve = rect;
        const follow = biquad('lowpass', 32, 0.5);
        gate.connect(biquad('bandpass', f, 4)).connect(biquad('bandpass', f, 4)).connect(env).connect(follow);
        const band = ctx.createGain();
        band.gain.value = 0;
        follow.connect(band.gain);
        chord.connect(biquad('bandpass', f, 4)).connect(biquad('bandpass', f, 4)).connect(band).connect(vocoded);
      }

      rig = { ctx, input, gate, listen, out, lanes, pitch, carrier, radioIn, voices, hissLevel, buf: new Float32Array(1024) };
      host.onDispose(() => { try { out.disconnect(); carrier.stop(); hiss.stop(); voices.forEach((o) => o.stop()); pitch?.port.postMessage('end'); } catch { /* gone */ } });
      retune(true);
      return rig;
    }

    function retune(now = false) {
      if (!rig) return;
      const t = rig.ctx.currentTime;
      const set = (param, value, tau = 0.03) => { if (now) param.value = value; else param.setTargetAtTime(value, t, tau); };
      rig.lanes.forEach((l, i) => set(l.gain, i === mode ? 1 : 0, 0.02));
      if (rig.pitch) set(rig.pitch.parameters.get('ratio'), 2 ** (shift / 12), 0.01);
      set(rig.carrier.frequency, robotHz);
      set(rig.radioIn.gain, 1 + drive * 7);
      set(rig.hissLevel.gain, breath * 0.6);
      // the vocoder's chord: the key's root, its third and fifth and the octave, low in the voice's range
      const base = 48 + root;
      [0, minor ? 3 : 4, 7, 12].forEach((iv, i) => set(rig.voices[i].frequency, mtof(base + iv), 0.02));
    }

    // ── the microphone ────────────────────────────────────────────────────────
    async function toggleMic() {
      if (mic) { closeMic(); return; }
      if (opening) return;
      opening = true;
      micBtn.classList.add('is-armed');
      try {
        const r = await build();
        if (!r) { host.toast('Start the sound first (play anything), then open the mic.'); return; }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        if (destroyed) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        const source = r.ctx.createMediaStreamSource(stream);
        source.connect(r.input);
        mic = { stream, source };
        micBtn.classList.add('is-active');
        host.setActive(true);
        host.lcd('mic', MODES[mode].toUpperCase());
        if (!host.store.get('warned', false)) {
          host.store.set('warned', true);
          host.toast('Mic open. Use headphones: through speakers the mic hears itself and howls.');
        }
      } catch (e) {
        const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        host.toast(denied ? 'The microphone was not allowed. Allow it from the address bar and press Mic again.'
          : 'No microphone could be opened. Plug one in, or pick it in the browser’s settings.', { kind: 'error' });
      } finally {
        opening = false;
        micBtn.classList.remove('is-armed');
      }
    }
    function closeMic() {
      if (!mic) return;
      try { mic.source.disconnect(); } catch { /* gone */ }
      mic.stream.getTracks().forEach((tr) => tr.stop());       // the browser's recording light goes out
      mic = null;
      micBtn.classList.remove('is-active');
      host.setActive(false);
      micLevel = 0;
    }

    function setMode(i) {
      if (i === mode) return;
      mode = i;
      host.store.set('mode', i);
      showControls();
      retune();
      host.lcd('mic fx', MODES[i].toUpperCase());
    }

    // ── the meter, and the gate that reads it ────────────────────────────────────────
    function draw() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const db = micLevel > 0 ? 20 * Math.log10(micLevel) : -100;
      const x = Math.max(0, Math.min(1, (db + 70) / 70)) * w;
      const grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, 'rgba(255,79,216,0.25)');
      grad.addColorStop(0.75, 'rgba(255,79,216,0.9)');
      grad.addColorStop(1, '#fff');
      g.fillStyle = grad;
      g.fillRect(0, h * 0.25, x, h * 0.5);
      const gx = ((GATE_DB + 70) / 70) * w;
      g.fillStyle = gateOn ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.15)';
      g.fillRect(gx, 3, 1, h - 6);
      g.font = '400 6.5px Michroma, sans-serif';
      g.textAlign = 'right';
      g.fillStyle = mic ? (gateOpen || !gateOn ? 'rgba(255,79,216,0.95)' : 'rgba(211,208,199,0.5)') : 'rgba(211,208,199,0.5)';
      g.fillText(mic ? (gateOn && !gateOpen ? 'GATE' : 'LIVE') : 'MIC OFF', w - 6, 11);
    }

    showControls();

    return {
      tick(dt) {
        ear.tick(dt);
        if (rig && mic) {
          rig.listen.getFloatTimeDomainData(rig.buf);
          let s = 0;
          for (const v of rig.buf) s += v * v;
          const rms = Math.sqrt(s / rig.buf.length);
          micLevel = Math.max(rms, micLevel * Math.exp(-dt / 0.12));
          const db = 20 * Math.log10(rms + 1e-9);
          // opens at once on a word; closes a moment after it, so the ends of words survive
          const open = !gateOn || db > GATE_DB || (gateOpen && db > GATE_DB - 8);
          if (open !== gateOpen) {
            gateOpen = open;
            rig.gate.gain.setTargetAtTime(open ? 1 : 0, rig.ctx.currentTime, open ? 0.004 : 0.09);
          }
          // a loud word lights the picture up a little; the vocoder's chord tints it
          if (gateOpen && db > -26) host.visual.bend({ warp: Math.min(0.08, (db + 26) * 0.004), hue: mode === 4 ? 0.04 : 0 });
        }
        draw();
      },
      keydown(e) {
        if (/^[1-5]$/.test(e.key)) { if (!e.repeat) setMode(Number(e.key) - 1); return true; }
        if (e.key.toLowerCase() === 'm') { if (!e.repeat) toggleMic(); return true; }
        return false;
      },
      resize() { draw(); },
      // Panic, a fold or Escape closes the microphone: a mic left live where nobody can see it (or
      // one starting to howl) is the last thing a show needs. Mic, or M, opens it again at once.
      release() { closeMic(); },
      destroy() { destroyed = true; ear.cancel(); closeMic(); },
    };
  },
};
