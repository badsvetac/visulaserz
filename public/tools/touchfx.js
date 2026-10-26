// TOUCH FX: a Kaoss-style pad over the whole mix. Put a finger down and one of five effects bends
// the music under it, X and Y being the two things that effect has to give; lift the finger and it
// lets go again, unless HOLD is on. The effect sits in a tool slot after the rack, so it bends the
// echoes and the reverb tails along with the track, and whatever another tool is playing too; and
// the picture bends with the finger (across turns its colours, up pulls it in).
//
//   SWEEP   X: low-pass ← open → high-pass       Y: resonance
//   JET     X: the comb's delay (a flanger by hand)  Y: feedback
//   CRUSH   X: sample rate                        Y: bits
//   ECHO    X: echo time in beats (tempo-locked)  Y: feedback; let go and the repeats ring on
//   WOBBLE  X: wobble rate in beats (locked to the grid)  Y: depth

const PROGRAMS = [
  { name: 'Sweep', x: 'Cutoff', y: 'Resonance' },
  { name: 'Jet', x: 'Time', y: 'Feedback' },
  { name: 'Crush', x: 'Rate', y: 'Bits' },
  { name: 'Echo', x: 'Time', y: 'Feedback' },
  { name: 'Wobble', x: 'Rate', y: 'Depth' },
];
const ECHO_DIVS = [[0.25, '1/16'], [0.5, '1/8'], [0.75, '1/8.'], [1, '1/4'], [1.5, '1/4.'], [2, '1/2']];
const WOBBLE_DIVS = [[2, '1/2'], [1, '1/4'], [2 / 3, '1/4T'], [0.5, '1/8'], [1 / 3, '1/8T'], [0.25, '1/16']];
const zoneOf = (x, n) => Math.min(n - 1, Math.max(0, Math.floor(x * n)));
const hz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)} kHz` : `${Math.round(f)} Hz`);

// Sample-and-hold plus bit reduction. `hold` may be fractional: an accumulator decides when to grab
// the next sample, so the rate glides instead of stepping through whole divisions.
const CRUSH_SOURCE = `
class VzCrush extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'hold', defaultValue: 1, minValue: 1, maxValue: 64, automationRate: 'k-rate' },
      { name: 'bits', defaultValue: 16, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
    ];
  }
  constructor() { super(); this.n = 0; this.h = [0, 0]; this.alive = true; this.port.onmessage = () => { this.alive = false; }; }
  process(inputs, outputs, p) {
    const inp = inputs[0], out = outputs[0];
    const hold = Math.max(1, p.hold[0]);
    const q = Math.pow(2, Math.max(1, p.bits[0]) - 1);
    let end = this.n;
    for (let c = 0; c < out.length; c++) {
      const i = inp[c] || inp[0], o = out[c];
      if (!i) { o.fill(0); continue; }
      let n = this.n, h = this.h[c];
      for (let k = 0; k < o.length; k++) {
        if (n <= 0) { h = Math.round(i[k] * q) / q; n += hold; }
        n -= 1;
        o[k] = h;
      }
      this.h[c] = h;
      end = n;
    }
    this.n = end;
    return this.alive;
  }
}
registerProcessor('vz-crush', VzCrush);
`;

export default {
  id: 'touchfx',
  name: 'Touch FX',
  group: 'Pads',
  blurb: 'A Kaoss-style touch pad on the whole mix: filter sweeps, a hand-played flanger, bit crush, tempo echo and wobble, two settings under one finger',
  tags: ['touch', 'pad', 'kaoss', 'filter', 'echo', 'wobble'],
  size: { w: 320, h: 380 },
  resizable: { minW: 260, minH: 300, maxW: 700, maxH: 740 },

  create(host, mount) {
    const { el } = host;
    let program = Math.min(PROGRAMS.length - 1, Math.max(0, host.store.get('program', 0) | 0));
    let hold = false;
    let down = false;            // a finger is on the pad
    let engaged = false;         // the effect is in the sound
    let pos = { x: 0.5, y: 0.5 };
    let audio = null;
    const trail = [];            // recent points, for the drawing
    let rings = [];              // one ring per beat, spreading from the finger
    let clock = 0;

    // ── controls ──────────────────────────────────────────────────────────────
    const keys = PROGRAMS.map((p, i) => el('button', { class: 'tool-key', type: 'button', title: `${p.name}: X ${p.x.toLowerCase()}, Y ${p.y.toLowerCase()} (key ${i + 1})`, onclick: () => setProgram(i) },
      p.name, el('kbd', {}, String(i + 1))));
    const canvas = el('canvas');
    const surface = el('div', { class: 'tool-surface', title: 'Press and drag. Lift to let go (or switch Hold on).' }, canvas);
    const readout = el('span', { class: 'tool-readout' }, '');
    const holdSw = host.ui.toggle({ label: 'Hold', title: 'Leave the effect where your finger lifted (Space)', onChange: (v) => { hold = v; if (!v && !down) letGo(); } });
    mount.append(el('div', { class: 'tool-keys' }, keys), surface, el('div', { class: 'tool-row' }, readout, el('div', { class: 'tool-row-end' }, holdSw.el)));
    const g = canvas.getContext('2d');

    // ── sound ─────────────────────────────────────────────────────────────────
    // Every program is built once and stays connected; only the active one is turned up. Nothing
    // is ever rewired while the music plays, so switching programs mid-song is a fade, not a click.
    function build(ctx) {
      const ny = Math.min(20000, ctx.sampleRate * 0.45);
      const input = ctx.createGain();
      const output = ctx.createGain();
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      wet.gain.value = 0;
      input.connect(dry).connect(output);
      wet.connect(output);
      // every node built here is handed to the host (own), which lets go of them when the panel closes
      host.audio.own(input, output, dry, wet);
      const biquad = (type, f, q = -3) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return host.audio.own(b); };

      const sweep = (() => {
        const lp = biquad('lowpass', ny);
        const hp = biquad('highpass', 10);
        lp.connect(hp);
        let text = 'Open';
        return {
          input: lp, output: hp, mode: 'replace',
          set(x, y, t) {
            let lpHz = ny, hpHz = 10;
            if (x < 0.46) lpHz = Math.min(ny, 20000 * Math.pow(110 / 20000, (0.46 - x) / 0.46));
            else if (x > 0.54) hpHz = 20 * Math.pow(7000 / 20, (x - 0.54) / 0.46);
            const q = -3 + 18 * y;                     // dB: lowpass and highpass Q are in decibels
            lp.frequency.setTargetAtTime(lpHz, t, 0.012);
            hp.frequency.setTargetAtTime(hpHz, t, 0.012);
            lp.Q.setTargetAtTime(x < 0.46 ? q : -3, t, 0.02);
            hp.Q.setTargetAtTime(x > 0.54 ? q : -3, t, 0.02);
            text = `${x < 0.46 ? `LP ${hz(lpHz)}` : x > 0.54 ? `HP ${hz(hpHz)}` : 'Open'} · Q ${Math.round(q)} dB`;
          },
          release(t) { lp.frequency.setTargetAtTime(ny, t + 0.12, 0.05); hp.frequency.setTargetAtTime(10, t + 0.12, 0.05); },
          get text() { return text; },
        };
      })();

      const jet = (() => {
        const i = ctx.createGain(), o = ctx.createGain();
        const delay = ctx.createDelay(0.05);
        delay.delayTime.value = 0.003;
        const fb = ctx.createGain();
        fb.gain.value = 0;
        const d = ctx.createGain(), w = ctx.createGain();
        d.gain.value = 0.62;
        w.gain.value = 0.62;
        i.connect(d).connect(o);
        i.connect(delay);
        delay.connect(w).connect(o);
        delay.connect(fb).connect(delay);
        host.audio.own(i, o, delay, fb, d, w);
        let text = '';
        return {
          input: i, output: o, mode: 'replace',
          set(x, y, t) {
            const ms = 0.35 * Math.pow(12 / 0.35, x);
            delay.delayTime.setTargetAtTime(ms / 1000, t, 0.02);
            fb.gain.setTargetAtTime(0.9 * y, t, 0.03);
            w.gain.setTargetAtTime(0.62 * (1 - 0.35 * y), t, 0.03);     // feedback piles up level: give some back
            text = `${ms.toFixed(1)} ms · FB ${Math.round(y * 90)}%`;
          },
          get text() { return text; },
        };
      })();

      const crush = (() => {
        const i = ctx.createGain(), o = ctx.createGain();
        let node = null;
        let want = { hold: 1, bits: 16 };
        i.connect(o);                                    // straight through until the processor has loaded
        host.audio.own(i, o);
        host.audio.worklet('vz-crush', CRUSH_SOURCE).then(() => {
          if (!audio) return;
          node = host.audio.own(new AudioWorkletNode(ctx, 'vz-crush', { outputChannelCount: [2] }));
          node.parameters.get('hold').value = want.hold;
          node.parameters.get('bits').value = want.bits;
          i.disconnect(o);
          i.connect(node).connect(o);
        }).catch((e) => console.warn('[touchfx] crush:', e));
        let text = '';
        return {
          input: i, output: o, mode: 'replace',
          set(x, y, t) {
            want = { hold: 1 + 39 * Math.pow(x, 1.7), bits: 16 - 13 * y };
            if (node) {
              node.parameters.get('hold').setTargetAtTime(want.hold, t, 0.01);
              node.parameters.get('bits').setTargetAtTime(want.bits, t, 0.01);
            }
            text = `${(ctx.sampleRate / want.hold / 1000).toFixed(1)} kHz · ${Math.round(want.bits)} bit`;
          },
          get text() { return text; },
          dispose() { node?.port.postMessage('end'); },
        };
      })();

      const echo = (() => {
        const i = ctx.createGain(), o = ctx.createGain();
        const send = ctx.createGain();
        send.gain.value = 0;
        const delay = ctx.createDelay(2.5);
        delay.delayTime.value = 0.375;
        const fb = ctx.createGain();
        fb.gain.value = 0.5;
        const damp = biquad('lowpass', 2900);
        const thin = biquad('highpass', 170);
        const w = ctx.createGain();
        w.gain.value = 0.85;
        i.connect(send).connect(delay);
        delay.connect(damp).connect(thin).connect(fb).connect(delay);
        delay.connect(w).connect(o);
        host.audio.own(i, o, send, delay, fb, w);
        let text = '';
        let beats = 0.75;
        return {
          input: i, output: o, mode: 'send', zones: ECHO_DIVS.map((z) => z[1]),
          set(x, y, t) {
            const [b, name] = ECHO_DIVS[zoneOf(x, ECHO_DIVS.length)];
            beats = b;
            delay.delayTime.setTargetAtTime(Math.min(2.4, b * host.clock.period), t, 0.05);
            fb.gain.setTargetAtTime(0.25 + 0.67 * y, t, 0.05);
            text = `${name} · FB ${Math.round((0.25 + 0.67 * y) * 100)}%`;
          },
          engage(t) { send.gain.setTargetAtTime(1, t, 0.01); },
          release(t) { send.gain.setTargetAtTime(0, t, 0.02); },
          follow(t) { delay.delayTime.setTargetAtTime(Math.min(2.4, beats * host.clock.period), t, 0.2); },
          get text() { return text; },
        };
      })();

      const wobble = (() => {
        const f = biquad('lowpass', 800, 7);
        const depth = host.audio.own(ctx.createGain());
        depth.gain.value = 0;
        depth.connect(f.detune);                       // detune is in cents: the sweep is exponential, as ears hear it
        const cosine = ctx.createPeriodicWave(new Float32Array([0, 1]), new Float32Array([0, 0]));
        let osc = null, zone = -1, div = 1;
        let text = '';
        function lfo(t) {
          // the wobble starts on the next grid point, wide open, so it lands on the beat
          const next = ctx.createOscillator();
          next.setPeriodicWave(cosine);
          next.frequency.value = 1 / (div * host.clock.period);
          next.connect(depth);
          const at = Math.max(t + 0.005, host.clock.next(div, t));
          next.start(at);
          osc?.stop(at);
          osc = next;
        }
        return {
          input: f, output: f, mode: 'replace', zones: WOBBLE_DIVS.map((z) => z[1]),
          set(x, y, t) {
            const z = zoneOf(x, WOBBLE_DIVS.length);
            if (z !== zone || !osc) { zone = z; div = WOBBLE_DIVS[z][0]; lfo(t); }
            depth.gain.setTargetAtTime(400 + 3000 * y, t, 0.03);
            text = `${WOBBLE_DIVS[z][1]} · ${((400 + 3000 * y) / 1200).toFixed(1)} oct`;
          },
          release(t) { osc?.stop(t + 0.15); osc = null; zone = -1; },
          follow() { if (osc) osc.frequency.value = 1 / (div * host.clock.period); },
          get text() { return text; },
          dispose() { osc?.stop(); },
        };
      })();

      const progs = [sweep, jet, crush, echo, wobble];
      const levels = progs.map((p, k) => {
        const level = host.audio.own(ctx.createGain());
        level.gain.value = k === program ? 1 : 0;
        input.connect(p.input);
        p.output.connect(level).connect(wet);
        return level;
      });
      host.audio.insert({ input, output });             // transparent as it goes in: the dry path is open
      return { ctx, input, output, dry, wet, progs, levels };
    }

    function ensureAudio() {
      if (!audio) {
        const ctx = host.audio.ensure();
        if (!ctx) return null;
        audio = build(ctx);
      }
      return audio;
    }
    host.audio.whenReady((ctx) => { if (!audio) audio = build(ctx); });

    function engage() {
      const a = ensureAudio();
      if (!a) return;
      const t = a.ctx.currentTime;
      const p = a.progs[program];
      if (!engaged) {
        engaged = true;
        a.wet.gain.setTargetAtTime(1, t, 0.01);
        if (p.mode === 'replace') a.dry.gain.setTargetAtTime(0, t, 0.01);
        p.engage?.(t);
        host.setActive(true);
      }
      p.set(pos.x, pos.y, t);
      readout.textContent = p.text;
    }

    // The spring-back: the effect fades out over a few dozen milliseconds, so lifting the finger
    // in the middle of a sweep sounds like a release, not like a switch.
    function letGo({ cut = false } = {}) {
      if (!audio) return;
      const t = audio.ctx.currentTime;
      const p = audio.progs[program];
      if (engaged) {
        engaged = false;
        p.release?.(t);
        host.setActive(false);
      }
      if (p.mode === 'replace' || cut) {
        audio.wet.gain.setTargetAtTime(0, t, cut ? 0.02 : 0.06);
        audio.dry.gain.setTargetAtTime(1, t, cut ? 0.02 : 0.06);
      }
      // ECHO keeps its wet open after the finger lifts: the repeats ring on until they have died away
    }

    function setProgram(i) {
      if (i === program || i < 0 || i >= PROGRAMS.length) return;
      const held = down;
      letGo({ cut: true });
      if (audio) {
        const t = audio.ctx.currentTime;
        audio.levels[program].gain.setTargetAtTime(0, t, 0.02);
        audio.levels[i].gain.setTargetAtTime(1, t, 0.02);
      }
      program = i;
      host.store.set('program', i);
      paintKeys();
      host.lcd('touch fx', PROGRAMS[i].name);
      if (held) engage();
      else readout.textContent = `X ${PROGRAMS[i].x} · Y ${PROGRAMS[i].y}`;
    }
    function paintKeys() { keys.forEach((k, i) => k.classList.toggle('is-active', i === program)); }

    // ── the finger ────────────────────────────────────────────────────────────
    const at = (e) => {
      const r = surface.getBoundingClientRect();
      return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)) };
    };
    // a finger, a controller or a hand in the air all come down, move and lift the same way
    function touch(p) {
      down = true;
      surface.classList.add('is-held');
      pos = p;
      trail.length = 0;
      engage();
    }
    function slide(p) {
      if (!down) return;
      pos = p;
      engage();
    }
    function lift() {
      if (!down) return;
      down = false;
      surface.classList.remove('is-held');
      if (!hold) letGo();
    }
    surface.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      host.capture(surface, e);
      touch(at(e));
    });
    surface.addEventListener('pointermove', (e) => slide(at(e)));
    surface.addEventListener('pointerup', lift);
    surface.addEventListener('pointercancel', lift);
    surface.addEventListener('lostpointercapture', lift);
    host.ui.surface(surface, { down: touch, move: slide, up: lift });

    // ── the picture ───────────────────────────────────────────────────────────
    let beam = '255, 79, 216';
    let beamAge = 1;
    function draw(dt, an) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = surface.clientWidth, h = surface.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      if ((beamAge += dt) > 0.5) { beamAge = 0; beam = getComputedStyle(document.documentElement).getPropertyValue('--beam-rgb').trim() || beam; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      // the room the finger plays in: a quarter grid, and the zones of the tempo programs
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 1; k < 4; k++) { g.moveTo(Math.round((w * k) / 4) + 0.5, 0); g.lineTo(Math.round((w * k) / 4) + 0.5, h); g.moveTo(0, Math.round((h * k) / 4) + 0.5); g.lineTo(w, Math.round((h * k) / 4) + 0.5); }
      g.stroke();
      const zones = program === 3 ? ECHO_DIVS : program === 4 ? WOBBLE_DIVS : null;
      g.font = '500 9px "Martian Mono", monospace';
      g.textBaseline = 'top';
      if (zones) {
        const n = zones.length;
        const live = engaged || down ? zoneOf(pos.x, n) : -1;
        for (let k = 0; k < n; k++) {
          const x0 = (w * k) / n;
          if (k === live) { g.fillStyle = `rgba(${beam},0.10)`; g.fillRect(x0, 0, w / n, h); }
          if (k) { g.strokeStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.moveTo(Math.round(x0) + 0.5, 0); g.lineTo(Math.round(x0) + 0.5, h); g.stroke(); }
          g.fillStyle = k === live ? `rgba(${beam},0.95)` : 'rgba(255,255,255,0.32)';
          g.fillText(zones[k][1], x0 + 5, 6);
        }
      } else if (program === 0) {
        g.fillStyle = 'rgba(255,255,255,0.035)';
        g.fillRect(w * 0.46, 0, w * 0.08, h);
        g.fillStyle = 'rgba(255,255,255,0.3)';
        g.fillText('LP', 6, 6);
        g.textAlign = 'right';
        g.fillText('HP', w - 6, 6);
        g.textAlign = 'left';
      }
      // the axis names
      g.font = '400 8px Michroma, sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.38)';
      g.textAlign = 'right';
      g.textBaseline = 'bottom';
      g.fillText(PROGRAMS[program].x.toUpperCase(), w - 6, h - 5);
      g.save();
      g.translate(9, h - 6);
      g.rotate(-Math.PI / 2);
      g.textAlign = 'left';
      g.fillText(PROGRAMS[program].y.toUpperCase(), 0, 0);
      g.restore();
      g.textAlign = 'left';

      const px = pos.x * w, py = (1 - pos.y) * h;
      const active = engaged || down;
      clock += dt;
      if (active) trail.push({ x: px, y: py, t: clock });
      while (trail.length && clock - trail[0].t > 0.6) trail.shift();
      if (an.isBeat) rings.push({ x: active ? px : w / 2, y: active ? py : h / 2, t: 0, s: an.beatStrength || 0.7 });
      rings = rings.filter((r) => (r.t += dt) < 0.7);

      // the level glows under the pad: it breathes with the music even when nothing is touched
      const glow = g.createRadialGradient(active ? px : w / 2, active ? py : h, 0, active ? px : w / 2, active ? py : h, Math.max(w, h) * 0.9);
      glow.addColorStop(0, `rgba(${beam},${0.08 + 0.22 * an.level})`);
      glow.addColorStop(1, `rgba(${beam},0)`);
      g.fillStyle = glow;
      g.fillRect(0, 0, w, h);

      for (const r of rings) {
        const k = r.t / 0.7;
        g.strokeStyle = `rgba(${beam},${(1 - k) * 0.55 * r.s})`;
        g.lineWidth = 2 * (1 - k) + 0.5;
        g.beginPath();
        g.arc(r.x, r.y, 8 + k * Math.max(w, h) * 0.45, 0, Math.PI * 2);
        g.stroke();
      }
      if (trail.length > 1) {
        g.lineCap = 'round';
        g.lineJoin = 'round';
        for (let k = 1; k < trail.length; k++) {
          const a = 1 - (clock - trail[k].t) / 0.6;
          g.strokeStyle = `rgba(${beam},${a * 0.8})`;
          g.lineWidth = 1 + a * 5;
          g.beginPath();
          g.moveTo(trail[k - 1].x, trail[k - 1].y);
          g.lineTo(trail[k].x, trail[k].y);
          g.stroke();
        }
      }
      if (active) {
        g.strokeStyle = `rgba(${beam},0.4)`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(Math.round(px) + 0.5, 0); g.lineTo(Math.round(px) + 0.5, h);
        g.moveTo(0, Math.round(py) + 0.5); g.lineTo(w, Math.round(py) + 0.5);
        g.stroke();
        const dot = g.createRadialGradient(px, py, 0, px, py, 26);
        dot.addColorStop(0, 'rgba(255,255,255,0.95)');
        dot.addColorStop(0.18, `rgba(${beam},0.95)`);
        dot.addColorStop(1, `rgba(${beam},0)`);
        g.fillStyle = dot;
        g.beginPath();
        g.arc(px, py, 26, 0, Math.PI * 2);
        g.fill();
      } else {
        g.font = '400 9px Michroma, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = 'rgba(255,255,255,0.28)';
        g.fillText('PRESS AND DRAG', w / 2, h / 2);
        g.textAlign = 'left';
      }
    }

    paintKeys();
    readout.textContent = `X ${PROGRAMS[program].x} · Y ${PROGRAMS[program].y}`;

    let followed = host.clock.period;
    return {
      tick(dt, an) {
        // the tempo programs follow the music's tempo, but only when it really moved
        if (audio && Math.abs(host.clock.period - followed) > followed * 0.002) {
          followed = host.clock.period;
          const t = audio.ctx.currentTime;
          audio.progs[3].follow(t);
          audio.progs[4].follow(t);
        }
        // the finger bends the picture too: across turns its colours, up pulls it in
        if (engaged) host.visual.bend({ hue: (pos.x - 0.5) * 0.3, warp: pos.y * 0.04 });
        draw(dt, an);
      },
      keydown(e) {
        if (/^[1-5]$/.test(e.key)) { setProgram(Number(e.key) - 1); return true; }
        if (e.key === ' ') { if (!e.repeat) holdSw.set(!holdSw.on); return true; }
        return false;
      },
      // the panic key, a fold, Escape: nothing stays held, and the echo tail is cut too
      release() {
        holdSw.set(false, true);
        hold = false;
        down = false;
        surface.classList.remove('is-held');
        letGo({ cut: true });
      },
      resize() { draw(0, host.analysis); },
      destroy() { audio?.progs.forEach((p) => p.dispose?.()); audio = null; },
    };
  },
};
