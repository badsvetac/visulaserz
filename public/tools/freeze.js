// FREEZE: hold it and the music stops in mid-air: the moment you pressed on keeps sounding, as a
// cloud of tiny overlapping grains taken from the last instant before the press, for as long as
// you hold. SIZE is how long each grain is (short is a buzz, long is a smear), SPREAD how far back
// they may reach (none is one frozen chord, more is a shimmer of the last second), PITCH moves the
// whole cloud by an octave or a fifth, and MIX keeps some of the track playing under it. LATCH
// makes a tap freeze and the next tap thaw. The picture's own clock stops with the sound. Only the
// track freezes: the pads and instruments of the other tools play on, live, over the frozen moment.
//
// Keys, once it has been clicked: Space (or F) freezes while held.

const PITCHES = [['−12', -12], ['−7', -7], ['0', 0], ['+7', 7], ['+12', 12]];
const VIEW_SECONDS = 2.4;        // how much of the recent past the display shows

// The grain engine. Unfrozen it only records the last three seconds into a ring and passes
// nothing (the dry path carries the music). Frozen, it stops recording, so the ring holds the
// moment, and plays Hann-windowed grains from just before the freeze point: a new one every
// quarter of a grain, each from a slightly different place, so their sum is a steady sound with
// no repeat you can hear. Thawed, the grains still sounding finish on their own: a natural tail.
const FREEZE_SOURCE = `
class VzFreeze extends AudioWorkletProcessor {
  constructor() {
    super();
    this.len = Math.round(sampleRate * 3);
    this.L = new Float32Array(this.len);
    this.R = new Float32Array(this.len);
    this.w = 0; this.filled = 0;
    this.frozen = false; this.fp = 0;
    this.size = 0.09; this.spread = 0.25; this.rate = 1;
    this.grains = []; this.untilNext = 0;
    this.peak = 0; this.sincePost = 0; this.postEvery = Math.round(sampleRate / 60);
    this.alive = true;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'end') { this.alive = false; return; }
      if ('size' in d) this.size = d.size;
      if ('spread' in d) this.spread = d.spread;
      if ('rate' in d) this.rate = d.rate;
      if ('frozen' in d && d.frozen !== this.frozen) {
        this.frozen = d.frozen;
        if (this.frozen) { this.fp = this.w; this.untilNext = 0; }
      }
    };
  }
  spawn() {
    const glen = Math.max(64, Math.round(this.size * sampleRate));
    const span = glen * this.rate;                         // how much of the ring one grain reads
    const room = this.filled - span - 256;
    this.untilNext = Math.max(32, Math.round((glen / 4) * (0.8 + Math.random() * 0.4)));
    if (room <= 0) return;
    const reach = Math.min(room, this.spread * sampleRate * 1.1);
    let pos = this.fp - span - 128 - Math.random() * reach;
    pos = ((pos % this.len) + this.len) % this.len;
    const pan = (Math.random() - 0.5) * this.spread;
    this.grains.push({ pos, rate: this.rate * (1 + (Math.random() - 0.5) * 0.004 * this.spread), len: glen, age: 0, gl: 1 - pan, gr: 1 + pan });
  }
  process(inputs, outputs) {
    const inp = inputs[0] || [], out = outputs[0];
    const iL = inp[0], iR = inp[1] || inp[0];
    const oL = out[0], oR = out[1] || out[0];
    const n = oL.length, len = this.len, L = this.L, R = this.R;
    for (let i = 0; i < n; i++) {
      const a = iL ? iL[i] : 0, b = iR ? iR[i] : 0;
      if (!this.frozen) {
        L[this.w] = a; R[this.w] = b;
        if (++this.w >= len) this.w = 0;
        if (this.filled < len) this.filled++;
        const m = Math.max(Math.abs(a), Math.abs(b));
        if (m > this.peak) this.peak = m;
      } else if (--this.untilNext <= 0) {
        this.spawn();
      }
      let sl = 0, sr = 0;
      for (let k = this.grains.length - 1; k >= 0; k--) {
        const g = this.grains[k];
        const ph = g.age / g.len;
        const win = 0.5 - 0.5 * Math.cos(6.283185307 * ph);
        const i0 = Math.floor(g.pos), fr = g.pos - i0, i1 = i0 + 1 >= len ? 0 : i0 + 1;
        sl += (L[i0] + (L[i1] - L[i0]) * fr) * win * g.gl;
        sr += (R[i0] + (R[i1] - R[i0]) * fr) * win * g.gr;
        g.pos += g.rate;
        if (g.pos >= len) g.pos -= len;
        if (++g.age >= g.len) this.grains.splice(k, 1);
      }
      oL[i] = sl * 0.62;
      if (oR !== oL) oR[i] = sr * 0.62;
    }
    this.sincePost += n;
    if (this.sincePost >= this.postEvery) {
      this.sincePost -= this.postEvery;               // keeps the average at exactly 60 a second
      const ago = new Float32Array(this.grains.length);
      for (let k = 0; k < this.grains.length; k++) ago[k] = (((this.fp - this.grains[k].pos) % len + len) % len) / sampleRate;
      this.port.postMessage({ peak: this.peak, frozen: this.frozen, ago });
      this.peak = 0;
    }
    return this.alive;
  }
}
registerProcessor('vz-freeze', VzFreeze);
`;

export default {
  id: 'freeze',
  name: 'Sound Freeze',
  group: 'FX',
  blurb: 'Hold it and the music stops in mid-air: the moment keeps sounding as a cloud of grains, an octave up or down if you like, while the picture stands still with it',
  tags: ['freeze', 'granular', 'stutter', 'drone', 'pad', 'transition'],
  size: { w: 420, h: 250 },
  resizable: { minW: 340, minH: 220, maxW: 900, maxH: 460 },

  create(host, mount) {
    const { el } = host;
    let size = host.store.get('size', 0.09);
    let spread = host.store.get('spread', 0.25);
    let pitch = Math.min(PITCHES.length - 1, host.store.get('pitch', 2) | 0);
    let mix = host.store.get('mix', 0);
    let latch = host.store.get('latch', false);
    let node = null, dry = null, wet = null, ctx = null;
    let destroyed = false;
    let frozen = false;
    let since = 0;                  // seconds frozen, for the picture
    const peaks = new Float32Array(Math.round(VIEW_SECONDS * 60));
    let head = 0;                   // where the next peak goes in the ring above
    let grains = new Float32Array(0);

    const send = (msg) => node?.port.postMessage(msg);
    const sizeKnob = host.ui.knob({ label: 'Size', min: 0.03, max: 0.3, value: size, def: 0.09, curve: 2, fmt: (v) => `${Math.round(v * 1000)} ms`, onChange: (v) => { size = v; host.store.set('size', v); send({ size: v }); } });
    const spreadKnob = host.ui.knob({ label: 'Spread', value: spread, def: 0.25, onChange: (v) => { spread = v; host.store.set('spread', v); send({ spread: v }); } });
    const mixKnob = host.ui.knob({ label: 'Mix', value: mix, def: 0, fmt: (v) => (v < 0.01 ? 'Frozen' : `${Math.round(v * 100)}% track`), onChange: (v) => { mix = v; host.store.set('mix', v); if (frozen) levels(); } });
    const pitchCycle = host.ui.cycle({ label: 'Pitch', options: PITCHES.map((p) => p[0]), index: pitch, title: 'Move the frozen sound by an octave or a fifth', onChange: (i) => { pitch = i; host.store.set('pitch', i); send({ rate: 2 ** (PITCHES[i][1] / 12) }); } });
    const latchSw = host.ui.toggle({ label: 'Latch', on: latch, title: 'A tap freezes, the next tap thaws', onChange: (v) => {
      latch = v;
      host.store.set('latch', v);
      mount.querySelector('.tool-hint').textContent = latchHint();
      if (!v && frozen && !pad.isDown) thaw();
    } });
    const pad = host.ui.pad({ label: 'Freeze', key: ' ', keyLabel: 'SPACE', cls: 'pad-accent freeze-pad', hint: 'Hold: the music stops in mid-air', start: () => (latch && frozen ? thaw() : freeze()), stop: () => { if (!latch) thaw(); } });
    const canvas = el('canvas');
    const view = el('div', { class: 'tool-surface freeze-view', title: 'The last moments of the music; frozen, the grains it is made of' }, canvas);
    mount.append(
      view,
      el('div', { class: 'tool-row freeze-row' }, pad.node, sizeKnob.el, spreadKnob.el, mixKnob.el),
      el('div', { class: 'tool-row' }, pitchCycle.el, latchSw.el, el('span', { class: 'tool-hint' }, latchHint())),
    );
    const g = canvas.getContext('2d');
    function latchHint() { return latch ? 'Tap to freeze, tap again to thaw' : 'Hold to freeze, let go to thaw'; }
    let beam = '#ff4fd8', beamAt = -1;

    host.audio.whenReady(async (c) => {
      try {
        await host.audio.worklet('vz-freeze', FREEZE_SOURCE);
      } catch {
        host.toast('This browser cannot run the freeze.', { kind: 'error' });
        return;
      }
      if (node || destroyed) return;
      ctx = c;
      const input = ctx.createGain();
      const output = ctx.createGain();
      node = new AudioWorkletNode(ctx, 'vz-freeze', { outputChannelCount: [2] });
      dry = ctx.createGain();
      wet = ctx.createGain();
      wet.gain.value = 0;
      input.connect(dry).connect(output);
      input.connect(node).connect(wet).connect(output);
      node.port.onmessage = (e) => {
        const d = e.data;
        if (!d.frozen) { peaks[head] = d.peak; head = (head + 1) % peaks.length; }
        grains = d.ago;
      };
      send({ size, spread, rate: 2 ** (PITCHES[pitch][1] / 12) });
      host.audio.insert({ input, output }, { music: true });   // the track only: what the tools play goes past
      host.audio.own(input, output, node, dry, wet);            // let go of when the panel closes
    });

    function levels() {
      const t = ctx.currentTime;
      dry.gain.setTargetAtTime(frozen ? mix * mix : 1, t, frozen ? 0.012 : 0.03);
      wet.gain.setTargetAtTime(frozen ? 1 : 0, t, frozen ? 0.004 : 0.25);   // thawed, the grains ring out
    }
    function freeze() {
      if (!node) { host.audio.ensure(); return; }
      if (frozen) return;
      frozen = true;
      since = 0;
      send({ frozen: true });
      levels();
      view.classList.add('is-held');
      pad.node.classList.add('is-frozen');
      host.setActive(true);
      host.visual.shock(0.35);
      host.lcd('freeze', PITCHES[pitch][1] ? `${PITCHES[pitch][0]} ST` : 'HOLD');
    }
    function thaw() {
      if (!frozen) return;
      frozen = false;
      send({ frozen: false });
      levels();
      view.classList.remove('is-held');
      pad.node.classList.remove('is-frozen');
      host.setActive(false);
      pad.reset();
    }

    // ── the display ───────────────────────────────────────────────────────────
    function draw() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const now = performance.now();
      if (now - beamAt > 500) { beamAt = now; beam = getComputedStyle(view).getPropertyValue('--beam').trim() || beam; }
      const mid = h / 2;
      const n = peaks.length, bw = w / n;
      g.fillStyle = frozen ? 'rgba(255,255,255,0.32)' : beam;
      g.globalAlpha = frozen ? 1 : 0.7;
      for (let i = 0; i < n; i++) {
        const v = peaks[(head + i) % n];
        const a = Math.min(1, Math.sqrt(v)) * (h * 0.42);
        g.fillRect(i * bw, mid - a, Math.max(1, bw - 0.6), a * 2);
      }
      g.globalAlpha = 1;
      if (frozen || grains.length) {
        // each grain is a glowing bar where in the past it is reading from
        g.globalCompositeOperation = 'lighter';
        for (const ago of grains) {
          const x = w * (1 - ago / VIEW_SECONDS);
          if (x < 0) continue;
          const glow = g.createLinearGradient(x - 9, 0, x + 9, 0);
          glow.addColorStop(0, 'rgba(0,0,0,0)');
          glow.addColorStop(0.5, beam);
          glow.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = glow;
          g.globalAlpha = 0.55;
          g.fillRect(x - 9, 4, 18, h - 8);
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#fff';
        g.fillRect(w - 2, 0, 2, h);                   // the instant it froze
      }
      g.font = '400 7px Michroma, sans-serif';
      g.fillStyle = frozen ? beam : 'rgba(211,208,199,0.5)';
      g.textAlign = 'right';
      g.fillText(frozen ? 'FROZEN' : 'LIVE', w - 8, 13);
    }

    return {
      tick(dt) {
        draw();
        if (!frozen) return;
        since += dt;
        // The picture's clock slows to a stop within a quarter of a second and breathes with the
        // grains; it starts again the moment the sound thaws.
        const k = Math.min(1, since / 0.25);
        host.visual.bend({ slow: k, warp: 0.04 + 0.02 * Math.sin(since * Math.PI * 2 / Math.max(0.12, size * 4)) });
      },
      keydown(e) {
        if (e.key !== ' ' && e.key.toLowerCase() !== 'f') return false;
        if (!e.repeat) pad.press();
        return true;
      },
      keyup(e) { if (e.key === ' ' || e.key.toLowerCase() === 'f') pad.release(); },
      release() { pad.reset(); thaw(); },
      resize() { draw(); },
      destroy() { destroyed = true; frozen = false; send({ type: 'end' }); node = null; },
    };
  },
};
