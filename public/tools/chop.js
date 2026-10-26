import { TAPE_SOURCE } from './lib/tape.js';

// CHOP: cut the track into pads. GRAB takes the last two bars of whatever is playing and lays them
// across eight pads, a beat on each, and you play them back in any order, like an MPC: quantised
// to the beat grid, one at a time (a new chop cuts the last one off), whole or, with GATE, only
// while the pad is held. MUTE TRACK takes the music out from under you so only your chops are left.
// Grab again whenever the track has moved on; your chops go on the tools' bus, so a looper can
// record them.
//
// Keys, once it has been clicked: A S D F G H J K play the chops · Q grabs · M mutes the track

const KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k'];
const QUANTS = [['Off', 0], ['1/8', 0.5], ['1/16', 0.25]];

export default {
  id: 'chop',
  name: 'Chop',
  group: 'Instruments',
  blurb: 'Grab the last two bars of the track and play them back from eight pads like an MPC, in any order, in time. Mute the track and only your chops are left',
  tags: ['sampler', 'chop', 'mpc', 'slices', 'finger drumming', 'remix'],
  size: { w: 380, h: 330 },

  create(host, mount) {
    const { el } = host;
    let quant = Math.min(QUANTS.length - 1, host.store.get('quant', 2) | 0);
    let gate = host.store.get('gate', false);
    let level = host.store.get('level', 0.9);
    let tape = null, ctx = null, out = null, destroyed = false;
    let buffer = null, slice = 0, peaks = null;
    let voice = null;              // { src, env, i } the chop sounding now
    let lit = -1, litUntil = 0;    // the slice to light on the waveform
    let asked = 0;

    const grab = host.ui.pad({ label: 'Grab', key: 'q', keyLabel: 'Q', cls: 'pad-accent', hint: 'Take the last two bars of the track onto the pads', start: () => grabBars() });
    const quantCycle = host.ui.cycle({ label: 'Quant', options: QUANTS.map((q) => q[0]), index: quant, onChange: (i) => { quant = i; host.store.set('quant', i); } });
    const gateSw = host.ui.toggle({ label: 'Gate', on: gate, title: 'A chop plays only while its pad is held', onChange: (v) => { gate = v; host.store.set('gate', v); } });
    const muteSw = host.ui.toggle({ label: 'Mute track', title: 'Take the music out from under your chops (M)', onChange: (v) => host.audio.muteMusic(v ? 0 : 1) });
    const levelKnob = host.ui.knob({ label: 'Level', value: level, def: 0.9, onChange: (v) => { level = v; host.store.set('level', v); if (out) out.gain.setTargetAtTime(v, ctx.currentTime, 0.02); } });
    const canvas = el('canvas');
    const wave = el('div', { class: 'tool-surface chop-wave', title: 'The two bars on the pads, a beat each' }, canvas);
    const pads = KEYS.map((key, i) => host.ui.pad({ label: String(i + 1), key, keyLabel: key.toUpperCase(), start: () => play(i), stop: () => stopVoice(i) }));
    mount.append(
      el('div', { class: 'tool-row' }, el('div', { class: 'tool-group', style: 'width:78px' }, grab.node), quantCycle.el, gateSw.el, muteSw.el, el('div', { class: 'tool-row-end' }, levelKnob.el)),
      wave,
      el('div', { class: 'drum-grid chop-grid' }, pads.map((p) => p.node)),
    );
    const g = canvas.getContext('2d');

    host.audio.whenReady(async (c) => {
      try { await host.audio.worklet('vz-tape', TAPE_SOURCE); } catch { return; }
      if (tape || destroyed) return;
      ctx = c;
      tape = new AudioWorkletNode(ctx, 'vz-tape', { outputChannelCount: [2], processorOptions: { seconds: 12 } });
      tape.port.onmessage = (e) => { if (e.data.type === 'dump' && e.data.id === asked) take(e.data); };
      host.audio.insert({ input: tape, output: tape });       // in live mode it only listens
      out = ctx.createGain();
      out.gain.value = level;
      out.connect(host.audio.input);
      host.audio.own(tape, out);                                // let go of when the panel closes
    });

    // ── grabbing ──────────────────────────────────────────────────────────────
    function grabBars() {
      if (!tape) { host.audio.ensure(); return; }
      if (!host.analysis.active) { host.toast('Play the track first: Grab takes the last two bars of what is playing.'); return; }
      const len = 8 * host.clock.period;
      const end = host.clock.last(4, ctx.currentTime - 0.005);     // the last bar line that has gone by
      tape.port.postMessage({ type: 'dump', id: ++asked, at: end - len, len });
    }
    function take({ L, R }) {
      const b = ctx.createBuffer(2, L.length, ctx.sampleRate);
      b.copyToChannel(L, 0);
      b.copyToChannel(R, 1);
      buffer = b;
      slice = b.duration / 8;
      // the waveform, as the peak of each column
      const cols = 360;
      peaks = new Float32Array(cols);
      const per = Math.floor(L.length / cols);
      for (let c = 0; c < cols; c++) {
        let m = 0;
        for (let i = c * per; i < (c + 1) * per; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
        peaks[c] = m;
      }
      const top = Math.max(1e-4, ...peaks);
      for (let c = 0; c < cols; c++) peaks[c] /= top;
      host.lcd('chop', 'GRABBED');
      host.visual.hit(0.6);
    }

    // ── playing ───────────────────────────────────────────────────────────────
    function play(i) {
      if (!buffer) { host.toast('Grab first: the pads are empty until you take two bars of the track.'); return; }
      const now = ctx.currentTime;
      const t = Math.max(now + 0.002, host.clock.quantise(QUANTS[quant][1], now));
      if (voice) fade(voice, t);                                  // one chop at a time, the way chops are played
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(1, t + 0.003);
      env.gain.setValueAtTime(1, t + slice - 0.006);
      env.gain.linearRampToValueAtTime(0, t + slice);
      src.connect(env).connect(out);
      src.start(t, i * slice, slice + 0.01);
      voice = { src, env, i };
      setTimeout(() => { lit = i; litUntil = performance.now() + slice * 1000; host.setActive(true); host.visual.hit(0.45); }, Math.max(0, (t - now) * 1000 - 5));
    }
    function fade(v, t) {
      try {
        v.env.gain.cancelScheduledValues(t);
        v.env.gain.setTargetAtTime(0, t, 0.004);
        v.src.stop(t + 0.04);
      } catch { /* already over */ }
    }
    function stopVoice(i) {
      if (!gate || !voice || voice.i !== i) return;
      fade(voice, ctx.currentTime);
      voice = null;
    }

    // ── the picture ───────────────────────────────────────────────────────────
    let beam = '255, 79, 216', beamAge = 1;
    function draw(dt) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wave.clientWidth, h = wave.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      if ((beamAge += dt) > 0.5) { beamAge = 0; beam = getComputedStyle(document.documentElement).getPropertyValue('--beam-rgb').trim() || beam; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const on = performance.now() < litUntil ? lit : -1;
      if (on < 0 && lit >= 0) { lit = -1; host.setActive(false); }
      for (let s = 0; s < 8; s++) {
        const x0 = (w * s) / 8;
        if (s === on) { g.fillStyle = `rgba(${beam},0.18)`; g.fillRect(x0, 0, w / 8, h); }
        if (s) { g.strokeStyle = s % 4 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.22)'; g.beginPath(); g.moveTo(Math.round(x0) + 0.5, 0); g.lineTo(Math.round(x0) + 0.5, h); g.stroke(); }
        g.font = '500 9px "Martian Mono", monospace';
        g.fillStyle = s === on ? `rgba(${beam},1)` : 'rgba(255,255,255,0.35)';
        g.fillText(String(s + 1), x0 + 4, 11);
      }
      if (peaks) {
        g.fillStyle = `rgba(${beam},0.8)`;
        const mid = h / 2;
        for (let c = 0; c < peaks.length; c++) {
          const x = (c / peaks.length) * w;
          const a = peaks[c] * (h / 2 - 4);
          g.fillRect(x, mid - a, Math.max(1, w / peaks.length - 0.3), a * 2);
        }
      } else {
        g.font = '400 8px Michroma, sans-serif';
        g.textAlign = 'center';
        g.fillStyle = 'rgba(255,255,255,0.3)';
        g.fillText('PLAY THE TRACK, THEN GRAB (Q)', w / 2, h / 2 + 3);
        g.textAlign = 'left';
      }
    }

    return {
      tick(dt) { draw(dt); },
      keydown(e) {
        const k = e.key.toLowerCase();
        if (k === 'm') { if (!e.repeat) muteSw.set(!muteSw.on); return true; }
        const p = [...pads, grab].find((x) => x.key === k);
        if (!p) return false;
        if (!e.repeat) p.press();
        return true;
      },
      keyup(e) { [...pads, grab].find((x) => x.key === e.key.toLowerCase())?.release(); },
      release() { [...pads, grab].forEach((p) => p.reset()); if (voice && ctx) fade(voice, ctx.currentTime); voice = null; if (muteSw.on) muteSw.set(false); },
      resize() { draw(0); },
      destroy() { destroyed = true; tape?.port.postMessage({ type: 'end' }); tape = null; try { out?.disconnect(); } catch { /* gone */ } },
    };
  },
};
