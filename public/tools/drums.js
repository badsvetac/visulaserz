// DRUM PADS: eight pads to play over the track: a kick, a snare, a clap, two hats, a tom, a bell
// (or a rim, or a snap) and the air horn every DJ set has room for. QUANT puts each hit on the
// beat grid, and a hit that is only a hair late still counts as that beat; KIT swaps the whole
// set. Everything is synthesised on the spot, nothing is downloaded. What you play goes in after
// the rack and through the other tools, and every pad also hits the picture: the scene sees a
// beat when your kick lands (through the renderer's own channel, so the tempo is left alone).
//
// Keys, once the pads have been clicked:  A S D F  /  G H J K

const KITS = ['808', 'Club', 'Lo-fi'];
const QUANTS = [['Off', 0], ['1/8', 0.5], ['1/16', 0.25]];
const PADS = [
  { id: 'kick', key: 'a' }, { id: 'snare', key: 's' }, { id: 'clap', key: 'd' }, { id: 'hat', key: 'f' },
  { id: 'open', key: 'g' }, { id: 'tom', key: 'h' }, { id: 'bell', key: 'j' }, { id: 'horn', key: 'k' },
];
const LABEL = { kick: 'Kick', snare: 'Snare', clap: 'Clap', hat: 'Hat', open: 'Open hat', tom: 'Tom', horn: 'Horn' };
// how hard each pad hits the picture: [the beat every scene sees, a shock of fringe and bloom]
const VISUAL = { kick: [1, 0.22], snare: [0.75, 0], clap: [0.7, 0.05], hat: [0.2, 0], open: [0.3, 0], tom: [0.6, 0], bell: [0.4, 0], horn: [0.85, 0.5] };
const BELL = ['Bell', 'Rim', 'Snap'];

export default {
  id: 'drums',
  name: 'Drum Pads',
  group: 'Instruments',
  blurb: 'Eight drum pads to play over any track, kick to air horn, quantised to its beat so your hits land in time. Three kits, all synthesised',
  tags: ['drums', 'pads', 'kick', 'horn', 'finger drumming', 'quantise'],
  size: { w: 372, h: 266 },

  create(host, mount) {
    const { el } = host;
    let kit = Math.min(KITS.length - 1, host.store.get('kit', 0) | 0);
    let quant = Math.min(QUANTS.length - 1, host.store.get('quant', 2) | 0);
    let level = host.store.get('level', 0.8);
    let bus = null;            // { out, lofi } once the sound is up
    let openHat = null;        // the ringing open hat, so a closed hat can choke it
    let lastBeat = -1;

    // ── controls ──────────────────────────────────────────────────────────────
    const kitCycle = host.ui.cycle({ label: 'Kit', options: KITS, index: kit, onChange: (i) => { kit = i; host.store.set('kit', i); relabel(); } });
    const quantCycle = host.ui.cycle({ label: 'Quant', options: QUANTS.map((q) => q[0]), index: quant, title: 'Put each hit on the beat grid', onChange: (i) => { quant = i; host.store.set('quant', i); } });
    const levelKnob = host.ui.knob({ label: 'Level', value: level, def: 0.8, onChange: (v) => { level = v; host.store.set('level', v); if (bus) bus.out.gain.setTargetAtTime(v * v, bus.ctx.currentTime, 0.02); } });
    const lights = el('div', { class: 'beat-lights', title: 'The beat, as the tools hear it' }, el('span'), el('span'), el('span'), el('span'));
    const pads = PADS.map((p) => host.ui.pad({ label: LABEL[p.id] || BELL[kit], key: p.key, keyLabel: p.key.toUpperCase(), start: () => hit(p.id) }));
    const grid = el('div', { class: 'drum-grid' }, pads.map((p) => p.node));
    mount.append(el('div', { class: 'tool-row' }, kitCycle.el, quantCycle.el, levelKnob.el, el('div', { class: 'tool-row-end' }, lights)), grid);
    function relabel() { pads[6].node.querySelector('.pad-label').textContent = BELL[kit]; }

    // ── sound ─────────────────────────────────────────────────────────────────
    function ensure() {
      if (bus) return bus;
      const ctx = host.audio.ensure();
      if (!ctx || !host.audio.input) return null;
      const out = ctx.createGain();
      out.gain.value = level * level;
      out.connect(host.audio.input);
      // the lo-fi kit runs through a little bit-crushing shaper and a dull top
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.round(x * 12) / 12; }
      shaper.curve = curve;
      const dull = ctx.createBiquadFilter();
      dull.type = 'lowpass';
      dull.frequency.value = 3400;
      shaper.connect(dull).connect(out);
      bus = { ctx, out, lofi: shaper };
      host.onDispose(() => { try { out.disconnect(); } catch { /* gone */ } });
      return bus;
    }

    const env = (ctx, t, peak, decay, attack = 0.001) => {
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(peak, t + attack);
      gn.gain.exponentialRampToValueAtTime(0.0008, t + attack + decay);
      return gn;
    };
    const filt = (ctx, type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q !== undefined) b.Q.value = q; return b; };
    const noise = (ctx, t, dur) => {
      const s = ctx.createBufferSource();
      s.buffer = host.audio.noise();
      s.loopStart = 0;
      s.start(t, Math.random() * 1.5);
      s.stop(t + dur);
      return s;
    };
    const osc = (ctx, type, f, t, dur) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t + dur); return o; };

    function voice(id, t, dest) {
      const ctx = bus.ctx;
      const k = KITS[kit];
      if (id === 'kick') {
        const p = { '808': [120, 42, 0.09, 0.85, 0.25], Club: [165, 50, 0.05, 0.34, 0.6], 'Lo-fi': [105, 46, 0.07, 0.42, 0.18] }[k];
        const o = osc(ctx, 'sine', p[0], t, p[3] + 0.05);
        o.frequency.exponentialRampToValueAtTime(p[1], t + p[2]);
        o.connect(env(ctx, t, 1, p[3], 0.002)).connect(dest);
        noise(ctx, t, 0.012).connect(filt(ctx, 'highpass', 1600)).connect(env(ctx, t, p[4], 0.006)).connect(dest);
      } else if (id === 'snare') {
        const tone = k === 'Club' ? 205 : 185;
        const o = osc(ctx, 'triangle', tone, t, 0.2);
        o.frequency.exponentialRampToValueAtTime(tone * 0.84, t + 0.08);
        o.connect(env(ctx, t, 0.5, 0.12)).connect(dest);
        noise(ctx, t, 0.3).connect(filt(ctx, 'bandpass', k === 'Club' ? 2300 : 1800, 0.8)).connect(filt(ctx, 'highpass', 800)).connect(env(ctx, t, 0.85, k === '808' ? 0.22 : 0.17)).connect(dest);
      } else if (id === 'clap') {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        for (let n = 0; n < 3; n++) {                     // three hands, a few milliseconds apart
          const at = t + n * 0.011;
          g.gain.setValueAtTime(0.9, at);
          g.gain.exponentialRampToValueAtTime(0.08, at + 0.009);
        }
        g.gain.setValueAtTime(0.6, t + 0.033);
        g.gain.exponentialRampToValueAtTime(0.0008, t + 0.033 + (k === '808' ? 0.22 : 0.16));
        noise(ctx, t, 0.3).connect(filt(ctx, 'bandpass', 1250, 1.6)).connect(filt(ctx, 'highpass', 600)).connect(g).connect(dest);
      } else if (id === 'hat' || id === 'open') {
        if (openHat) { openHat.gain.cancelScheduledValues(t); openHat.gain.setTargetAtTime(0, t, 0.008); openHat = null; }   // a closed hat chokes an open one
        const decay = id === 'hat' ? { '808': 0.06, Club: 0.035, 'Lo-fi': 0.05 }[k] : 0.38;
        const e = env(ctx, t, id === 'hat' ? 0.3 : 0.24, decay);
        const sheen = filt(ctx, 'peaking', 10500, 1);
        sheen.gain.value = 6;                             // a peaking filter does nothing at its default 0 dB
        // white noise at a 96 kHz device is mostly above hearing: keep only the part a hat is made of
        noise(ctx, t, decay + 0.05).connect(filt(ctx, 'highpass', 7200)).connect(filt(ctx, 'lowpass', 15000)).connect(sheen).connect(e).connect(dest);
        if (id === 'open') openHat = e;
      } else if (id === 'tom') {
        const p = { '808': [110, 72, 0.45], Club: [165, 112, 0.26], 'Lo-fi': [130, 92, 0.32] }[k];
        const o = osc(ctx, 'sine', p[0], t, p[2] + 0.05);
        o.frequency.exponentialRampToValueAtTime(p[1], t + p[2] * 0.6);
        o.connect(env(ctx, t, 0.85, p[2], 0.002)).connect(dest);
      } else if (id === 'bell') {
        if (kit === 0) {                                  // the 808 cowbell: two squares a fifth-ish apart
          const bp = filt(ctx, 'bandpass', 2400, 1.2);
          const e = env(ctx, t, 0.5, 0.32);
          osc(ctx, 'square', 540, t, 0.4).connect(bp);
          osc(ctx, 'square', 800, t, 0.4).connect(bp);
          bp.connect(e).connect(dest);
        } else if (kit === 1) {                           // a rim: a click with a ring
          osc(ctx, 'triangle', 1700, t, 0.05).connect(env(ctx, t, 0.5, 0.03)).connect(dest);
          noise(ctx, t, 0.02).connect(filt(ctx, 'bandpass', 3200, 2)).connect(env(ctx, t, 0.5, 0.012)).connect(dest);
        } else {                                          // a finger snap
          noise(ctx, t, 0.1).connect(filt(ctx, 'bandpass', 2600, 3)).connect(env(ctx, t, 1, 0.07)).connect(dest);
        }
      } else if (id === 'horn') {
        // the air horn: three brassy saws pushed through a narrow mouth, a scoop up at the
        // start and a sag at the end, like a real can running out of breath
        const shaper = ctx.createWaveShaper();
        const curve = new Float32Array(512);
        for (let i = 0; i < 512; i++) { const x = (i / 511) * 2 - 1; curve[i] = Math.tanh(x * 3); }
        shaper.curve = curve;
        const bp = filt(ctx, 'bandpass', 1450, 0.9);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.55, t + 0.012);
        g.gain.setValueAtTime(0.55, t + 0.42);
        g.gain.exponentialRampToValueAtTime(0.0008, t + 0.56);
        for (const f of [440, 445, 662]) {
          const o = osc(ctx, 'sawtooth', f, t, 0.6);
          o.detune.setValueAtTime(-90, t);
          o.detune.linearRampToValueAtTime(0, t + 0.05);
          o.detune.setValueAtTime(0, t + 0.4);
          o.detune.linearRampToValueAtTime(-180, t + 0.56);
          o.connect(shaper);
        }
        shaper.connect(bp).connect(g).connect(dest);
      }
    }

    function hit(id) {
      const b = ensure();
      if (!b) return;
      const now = b.ctx.currentTime;
      const t = Math.max(now + 0.002, host.clock.quantise(QUANTS[quant][1], now));
      voice(id, t, KITS[kit] === 'Lo-fi' ? b.lofi : b.out);
      const node = pads[PADS.findIndex((p) => p.id === id)].node;
      setTimeout(() => {
        node.classList.add('is-hit');
        host.setActive(true);
        const [flash, shock] = VISUAL[id];
        host.visual.hit(flash);                            // the picture hits when the sound does, quantised or not
        if (shock) host.visual.shock(shock);
        setTimeout(() => { node.classList.remove('is-hit'); host.setActive(false); }, 90);
      }, Math.max(0, (t - now) * 1000 - 5));
    }

    return {
      tick() {
        const beat = Math.floor(host.clock.beats()) & 3;
        if (beat !== lastBeat) {
          lastBeat = beat;
          [...lights.children].forEach((s, i) => s.classList.toggle('is-on', i === beat));
        }
      },
      keydown(e) {
        const p = pads.find((x) => x.key === e.key.toLowerCase());
        if (!p) return false;
        if (!e.repeat) p.press();
        return true;
      },
      keyup(e) { pads.find((x) => x.key === e.key.toLowerCase())?.release(); },
      release() { pads.forEach((p) => p.reset()); },
    };
  },
};
