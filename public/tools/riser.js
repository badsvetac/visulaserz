// RISER: the build before a drop. Push the fader up and the music thins out from the bottom while
// noise sweeps upwards, a tone climbs and a snare roll speeds up from quarter notes to 32nds, in
// time with the track. Let go above the line (or hit DROP) and it all stops dead on an impact as
// the music comes back full; let go lower down and everything slides back as if nothing happened.
// The picture builds with it (pulled in, colours turning) and the drop lands on it as a shock.
//
// Keys, once it has been clicked: hold Space to build over the bars you chose, let go to drop;
// Enter drops at once.

const BARS = [1, 2, 4, 8];
const DROP_AT = 0.88;

export default {
  id: 'riser',
  name: 'Riser',
  group: 'FX',
  blurb: 'The build before the drop: push the fader and the track thins, noise sweeps up and a snare roll speeds up in time. Let go at the top and it drops on an impact',
  tags: ['riser', 'build', 'drop', 'sweep', 'snare roll', 'edm'],
  size: { w: 250, h: 338 },

  create(host, mount) {
    const { el } = host;
    let a = 0;                       // how far the build has gone, 0..1
    let held = null;                 // 'hand' | 'key' while something holds the fader up
    let bars = Math.min(BARS.length - 1, host.store.get('bars', 1) | 0);
    const on = { noise: host.store.get('noise', true), tone: host.store.get('tone', true), roll: host.store.get('roll', true), cut: host.store.get('cut', true) };
    let audio = null;
    let nextHit = 0;                 // audio time of the next scheduled snare in the roll

    // ── controls ──────────────────────────────────────────────────────────────
    const fill = el('div', { class: 'riser-fill' });
    const cap = el('div', { class: 'riser-cap' });
    const slot = el('div', { class: 'riser-slot', role: 'slider', 'aria-label': 'Build', title: 'Push up to build. Let go above the line to drop.' }, el('div', { class: 'riser-mark' }), fill, cap);
    const layer = (id, label, title) => host.ui.toggle({ label, on: on[id], title, onChange: (v) => { on[id] = v; host.store.set(id, v); } }).el;
    const dropPad = host.ui.pad({ label: 'Drop', key: 'Enter', keyLabel: '⏎', cls: 'pad-accent', hint: 'Drop now: the impact, and the music back in full', start: () => drop() });
    const barsCycle = host.ui.cycle({ label: 'Space builds', options: BARS.map((b) => `${b} bar${b > 1 ? 's' : ''}`), index: bars, title: 'How long holding Space takes to build all the way', onChange: (i) => { bars = i; host.store.set('bars', i); } });
    mount.append(el('div', { class: 'riser' }, slot, el('div', { class: 'riser-side' },
      layer('noise', 'Noise', 'White noise sweeping up'), layer('tone', 'Tone', 'A tone climbing three octaves'),
      layer('roll', 'Snare roll', 'A snare roll that speeds up in time'), layer('cut', 'Thin out', 'High-pass the music as it builds'),
      barsCycle.el, dropPad.node)));

    // ── sound ─────────────────────────────────────────────────────────────────
    function build(ctx) {
      const input = ctx.createGain();
      const thin = ctx.createBiquadFilter();
      thin.type = 'highpass';
      thin.frequency.value = 10;
      thin.Q.value = 1;
      input.connect(thin);
      host.audio.insert({ input, output: thin });

      const out = ctx.createGain();
      out.connect(host.audio.input);
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = host.audio.noise();
      noiseSrc.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 1.4;
      band.frequency.value = 300;
      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0;
      noiseSrc.connect(band).connect(noiseGain).connect(out);
      noiseSrc.start();
      const toneGain = ctx.createGain();
      toneGain.gain.value = 0;
      const toneLp = ctx.createBiquadFilter();
      toneLp.type = 'lowpass';
      toneLp.frequency.value = 900;
      const saws = [-9, 9].map((cents) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 110;
        o.detune.value = cents;
        o.connect(toneLp);
        o.start();
        return o;
      });
      toneLp.connect(toneGain).connect(out);
      host.onDispose(() => { try { noiseSrc.stop(); saws.forEach((o) => o.stop()); out.disconnect(); } catch { /* stopped */ } });
      return { ctx, thin, out, band, noiseGain, toneGain, toneLp, saws };
    }
    function ensure() {
      if (!audio) {
        const ctx = host.audio.ensure();
        if (!ctx || !host.audio.input) return null;
        audio = build(ctx);
      }
      return audio;
    }
    host.audio.whenReady((ctx) => { if (!audio) audio = build(ctx); });

    // the layers follow the fader (only when it or a switch moved): the curves make it a build
    let followed = '';
    function follow() {
      if (!audio) return;
      const key = `${a.toFixed(3)}|${on.noise}|${on.tone}|${on.cut}`;
      if (key === followed) return;
      followed = key;
      const t = audio.ctx.currentTime, x = a;
      audio.thin.frequency.setTargetAtTime(on.cut ? 10 * Math.pow(90, x * x) : 10, t, 0.05);
      audio.band.frequency.setTargetAtTime(300 * Math.pow(30, x), t, 0.05);
      audio.noiseGain.gain.setTargetAtTime(on.noise ? 0.32 * x * x : 0, t, 0.05);
      audio.toneGain.gain.setTargetAtTime(on.tone ? 0.075 * Math.pow(x, 1.5) : 0, t, 0.05);
      audio.toneLp.frequency.setTargetAtTime(700 + 9000 * x * x, t, 0.05);
      for (const o of audio.saws) o.frequency.setTargetAtTime(110 * Math.pow(2, 3 * x), t, 0.05);
    }

    function snare(t, level) {
      const ctx = audio.ctx;
      const src = ctx.createBufferSource();
      src.buffer = host.audio.noise();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1900;
      bp.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(level, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      src.connect(bp).connect(g).connect(audio.out);
      src.start(t, Math.random());
      src.stop(t + 0.13);
    }
    // the roll speeds up as the fader rises, always on the grid
    function scheduleRoll() {
      if (!audio || !on.roll || a < 0.06) { nextHit = 0; return; }
      const div = a < 0.3 ? 1 : a < 0.55 ? 0.5 : a < 0.75 ? 0.25 : a < 0.9 ? 0.125 : 0.0625;
      const now = audio.ctx.currentTime;
      if (!nextHit || nextHit < now) nextHit = host.clock.next(div, now + 0.01);
      while (nextHit < now + 0.12) {
        snare(nextHit, 0.12 + 0.5 * a);
        nextHit = host.clock.next(div, nextHit + 0.001);
      }
    }

    function drop() {
      const b = ensure();
      if (!b) return;
      const ctx = b.ctx, t = ctx.currentTime + 0.004;
      // the boom: a sub that falls away, and a wash of noise on top
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(70, t);
      sub.frequency.exponentialRampToValueAtTime(32, t + 0.9);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.95, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      sub.connect(sg).connect(b.out);
      sub.start(t);
      sub.stop(t + 1.5);
      const crash = ctx.createBufferSource();
      crash.buffer = host.audio.noise();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2800;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.35, t);
      cg.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
      crash.connect(hp).connect(cg).connect(b.out);
      crash.start(t, Math.random() * 0.2);
      crash.stop(t + 1.85);
      // and everything that was building stops dead
      a = 0;
      held = null;
      nextHit = 0;
      b.thin.frequency.cancelScheduledValues(t);
      b.thin.frequency.setTargetAtTime(10, t, 0.004);
      for (const p of [b.noiseGain.gain, b.toneGain.gain]) { p.cancelScheduledValues(t); p.setTargetAtTime(0, t, 0.006); }
      slot.classList.remove('is-held');
      mount.closest('.tool-panel')?.classList.remove('is-dropped');
      void mount.offsetWidth;
      mount.closest('.tool-panel')?.classList.add('is-dropped');
      host.lcd('riser', 'DROP');
      host.visual.hit(1);                                         // and the picture lands with it
      host.visual.shock(1);
      paint();
    }

    function letGo() {
      if (!held) return;
      held = null;
      slot.classList.remove('is-held');
      if (a >= DROP_AT) drop();
    }

    // ── the fader ─────────────────────────────────────────────────────────────
    const level = (e) => { const r = slot.getBoundingClientRect(); return Math.min(1, Math.max(0, 1 - (e.clientY - r.top - 6) / (r.height - 12))); };
    slot.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      host.capture(slot, e);
      if (!ensure()) return;
      held = 'hand';
      slot.classList.add('is-held');
      a = level(e);
    });
    slot.addEventListener('pointermove', (e) => { if (held === 'hand') a = level(e); });
    slot.addEventListener('pointerup', letGo);
    slot.addEventListener('pointercancel', letGo);
    slot.addEventListener('lostpointercapture', letGo);

    function paint() {
      fill.style.height = `calc(${(a * 100).toFixed(2)}% - ${(a * 12).toFixed(1)}px)`;
      cap.style.bottom = `calc(6px + ${(a * 100).toFixed(2)}% - ${(a * 12).toFixed(1)}px)`;
      slot.style.setProperty('--a', a.toFixed(3));
      dropPad.node.classList.toggle('is-ready', a >= DROP_AT);
      host.setActive(a > 0.02);
    }

    return {
      tick(dt) {
        if (held === 'key') a = Math.min(1, a + dt / (BARS[bars] * 4 * host.clock.period));
        else if (!held && a > 0) a = Math.max(0, a - dt / 0.7);          // not held: it slides back down
        follow();
        scheduleRoll();
        paint();
        // the picture builds too: pulled in towards the middle, its colours turning slowly
        if (a > 0.005) host.visual.bend({ warp: a * a * 0.14, hue: a * 0.06 });
      },
      keydown(e) {
        if (e.key === ' ') { if (!e.repeat && ensure()) { held = 'key'; slot.classList.add('is-held'); } return true; }
        if (e.key === 'Enter') { if (!e.repeat) dropPad.press(); return true; }
        return false;
      },
      keyup(e) {
        if (e.key === ' ' && held === 'key') letGo();
        if (e.key === 'Enter') dropPad.release();
      },
      release() { held = null; a = 0; slot.classList.remove('is-held'); dropPad.reset(); follow(); paint(); },
    };
  },
};
