// LO-FI MACHINE: puts the whole mix on an old tape, a dusty record or a pocket radio. WOW is the
// slow seasick drift of a stretched cassette, FLUTTER the fast shiver of a worn capstan, DRIVE the
// warm squash of a hot input, AGE closes the band from both ends the way years do, and NOISE lays
// the hiss and the crackle under it. STYLE sets all five at once (Cassette, Vinyl, Radio, Worn
// tape); move any knob after that and it is your own. The picture drifts with the tape: its clock
// slows and quickens with the wow, and its colours warm as the sound ages.
//
// Keys, once it has been clicked: Space switches it on and off, 1–4 pick a style.

const STYLES = [
  { name: 'Cassette', wow: 0.45, flutter: 0.35, drive: 0.35, age: 0.35, noise: 0.3, hiss: 1, crackle: 0.12 },
  { name: 'Vinyl', wow: 0.18, flutter: 0.05, drive: 0.15, age: 0.28, noise: 0.5, hiss: 0.25, crackle: 1 },
  { name: 'Radio', wow: 0, flutter: 0.1, drive: 0.55, age: 0.85, noise: 0.25, hiss: 0.7, crackle: 0.35 },
  { name: 'Worn tape', wow: 0.85, flutter: 0.6, drive: 0.5, age: 0.55, noise: 0.45, hiss: 0.9, crackle: 0.3 },
];
const KNOBS = ['wow', 'flutter', 'drive', 'age', 'noise'];
const WOW_HZ = [0.55, 0.31];      // two slow drifts that never line up, so the wow never sounds like an LFO
const FLUTTER_HZ = 7.3;

export default {
  id: 'lofi',
  name: 'Lo-fi Machine',
  group: 'FX',
  blurb: 'Put the whole mix on a stretched cassette, a dusty record or a pocket radio: wow, flutter, warm drive, a narrowing band and the hiss and crackle under it',
  tags: ['lofi', 'tape', 'vinyl', 'wow', 'flutter', 'saturation', 'crackle'],
  size: { w: 410, h: 162 },

  create(host, mount) {
    const { el } = host;
    let on = false;                 // starts off: the tool is in the music only once you say so
    let style = Math.min(STYLES.length - 1, host.store.get('style', 0) | 0);
    const v = { ...STYLES[style], ...host.store.get('values', {}) };
    let fx = null, destroyed = false;

    const onSw = host.ui.toggle({ label: 'On', on, title: 'Put the mix on the machine (Space)', onChange: (x) => setOn(x) });
    const keys = STYLES.map((s, i) => el('button', { class: 'tool-key', type: 'button', title: `${s.name} (key ${i + 1})`, onclick: () => setStyle(i) }, s.name, el('kbd', {}, String(i + 1))));
    const knobs = {};
    const FMT = { wow: 'Wow', flutter: 'Flutter', drive: 'Drive', age: 'Age', noise: 'Noise' };
    for (const k of KNOBS) {
      knobs[k] = host.ui.knob({ label: FMT[k], value: v[k], def: STYLES[style][k], onChange: (x) => {
        v[k] = x;
        host.store.set('values', pick());
        keys.forEach((b) => b.classList.remove('is-active'));      // a knob moved: it is no longer the preset
        apply();
      } });
    }
    mount.append(
      el('div', { class: 'tool-row' }, el('div', { class: 'tool-keys lofi-styles' }, keys), el('div', { class: 'tool-row-end' }, onSw.el)),
      el('div', { class: 'tool-row lofi-knobs' }, KNOBS.map((k) => knobs[k].el)),
    );
    keys[style].classList.add('is-active');
    const pick = () => Object.fromEntries([...KNOBS, 'hiss', 'crackle'].map((k) => [k, v[k]]));

    // ── sound ─────────────────────────────────────────────────────────────────
    host.audio.whenReady((ctx) => {
      if (fx || destroyed) return;
      const sr = ctx.sampleRate;
      const input = ctx.createGain();
      const output = ctx.createGain();
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      wet.gain.value = 0;
      input.connect(dry).connect(output);

      // drive: a soft tanh curve, pushed harder by the gain in front of it
      const pre = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(2048);
      for (let i = 0; i < curve.length; i++) { const x = (i / (curve.length - 1)) * 2 - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
      shaper.curve = curve;
      shaper.oversample = '2x';
      const post = ctx.createGain();
      // age: the band closes from both ends, with the little mid hump a cheap speaker has
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.Q.value = 0.6;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.6;
      const honk = ctx.createBiquadFilter();
      honk.type = 'peaking';
      honk.frequency.value = 1400;
      honk.Q.value = 0.8;
      // wow and flutter: a short delay whose time drifts, which is what a speed change is
      const delay = ctx.createDelay(0.1);
      delay.delayTime.value = 0.012;
      const t0 = ctx.currentTime + 0.05;
      // (each oscillator is handed to the host, which stops it when the panel closes)
      const lfo = (hz, type = 'sine') => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz; const g = ctx.createGain(); g.gain.value = 0; o.connect(g).connect(delay.delayTime); o.start(t0); host.audio.own(o, g); return g; };
      const wowA = lfo(WOW_HZ[0]), wowB = lfo(WOW_HZ[1]), flutter = lfo(FLUTTER_HZ);
      input.connect(pre).connect(shaper).connect(post).connect(hp).connect(lp).connect(honk).connect(delay).connect(wet).connect(output);

      // the hiss: noise kept below 9 kHz (at a 96 kHz device most of white noise is above hearing)
      const hiss = ctx.createBufferSource();
      hiss.buffer = host.audio.noise();
      hiss.loop = true;
      const hissHp = ctx.createBiquadFilter();
      hissHp.type = 'highpass';
      hissHp.frequency.value = 2200;
      const hissLp = ctx.createBiquadFilter();
      hissLp.type = 'lowpass';
      hissLp.frequency.value = 9000;
      const hissLevel = ctx.createGain();
      hissLevel.gain.value = 0;
      hiss.connect(hissHp).connect(hissLp).connect(hissLevel).connect(output);
      hiss.start();
      // the crackle: four seconds of sparse clicks of every size, made once, then looped
      const crackleBuf = ctx.createBuffer(2, Math.round(sr * 4), sr);
      for (let c = 0; c < 2; c++) {
        const d = crackleBuf.getChannelData(c);
        for (let k = 0; k < 70; k++) {
          const at = Math.floor(Math.random() * (d.length - sr * 0.004));
          const big = Math.random() < 0.08;
          const amp = (big ? 0.6 : 0.25) * Math.pow(Math.random(), 2.2) * (Math.random() < 0.5 ? -1 : 1);
          const len = Math.round(sr * (big ? 0.0025 : 0.0006));
          for (let i = 0; i < len; i++) d[at + i] += amp * Math.exp(-i / (len * 0.25)) * (i % 2 ? -0.6 : 1);
        }
      }
      const crackle = ctx.createBufferSource();
      crackle.buffer = crackleBuf;
      crackle.loop = true;
      const crackleLp = ctx.createBiquadFilter();
      crackleLp.type = 'lowpass';
      crackleLp.frequency.value = 7000;
      const crackleLevel = ctx.createGain();
      crackleLevel.gain.value = 0;
      crackle.connect(crackleLp).connect(crackleLevel).connect(output);
      crackle.start();
      // the hiss, the crackle and every node here stop and let go once the slot has faded the tool out
      host.audio.own(input, output, dry, wet, pre, shaper, post, hp, lp, honk, delay, hiss, hissHp, hissLp, hissLevel, crackle, crackleLp, crackleLevel);

      fx = { ctx, dry, wet, pre, post, hp, lp, honk, wowA, wowB, flutter, hissLevel, crackleLevel, t0 };
      apply(true);
      host.audio.insert({ input, output });
    });

    function apply(now = false) {
      if (!fx) return;
      const t = fx.ctx.currentTime;
      const set = (param, value, tau = 0.04) => { if (now) param.value = value; else param.setTargetAtTime(value, t, tau); };
      set(fx.dry.gain, on ? 0 : 1, 0.03);
      set(fx.wet.gain, on ? 1 : 0, 0.03);
      set(fx.pre.gain, 1 + v.drive * 6);
      set(fx.post.gain, 1 / (1 + v.drive * 1.4));
      set(fx.hp.frequency, 20 * Math.pow(420 / 20, v.age));
      set(fx.lp.frequency, Math.min(fx.ctx.sampleRate * 0.45, 20000) * Math.pow(2600 / 20000, v.age));
      set(fx.honk.gain, v.age * 4);
      set(fx.wowA.gain, on ? v.wow * 0.0026 : 0, 0.2);
      set(fx.wowB.gain, on ? v.wow * 0.0011 : 0, 0.2);
      set(fx.flutter.gain, on ? v.flutter * 0.00018 : 0, 0.2);
      const n = on ? v.noise * v.noise : 0;
      set(fx.hissLevel.gain, n * 0.05 * v.hiss, 0.08);
      set(fx.crackleLevel.gain, n * 0.7 * v.crackle, 0.08);
    }
    function setOn(x) {
      if (!fx) host.audio.ensure();
      on = !!x;
      onSw.set(on, true);
      host.setActive(on);
      host.lcd('lo-fi', on ? keys.find((k) => k.classList.contains('is-active'))?.firstChild.textContent.toUpperCase() || 'ON' : 'OFF');
      apply();
    }
    function setStyle(i) {
      style = i;
      host.store.set('style', i);
      Object.assign(v, STYLES[i]);
      host.store.set('values', pick());
      for (const k of KNOBS) { knobs[k].def = v[k]; knobs[k].setValue(v[k], { silent: true }); }   // a double-click goes back to the style
      keys.forEach((b, j) => b.classList.toggle('is-active', j === i));
      host.lcd('lo-fi', STYLES[i].name.toUpperCase());
      apply();
    }

    return {
      tick() {
        if (!on || !fx) return;
        // the wow as the tape plays it, worked out from when its oscillators started
        const t = fx.ctx.currentTime - fx.t0;
        const wow = (0.7 * Math.sin(2 * Math.PI * WOW_HZ[0] * t) + 0.3 * Math.sin(2 * Math.PI * WOW_HZ[1] * t));
        host.visual.bend({ slow: (0.5 + 0.5 * wow) * 0.35 * v.wow, twist: wow * 0.015 * v.wow, hue: -0.035 * v.age });
      },
      keydown(e) {
        if (/^[1-4]$/.test(e.key)) { if (!e.repeat) setStyle(Number(e.key) - 1); return true; }
        if (e.key === ' ') { if (!e.repeat) setOn(!on); return true; }
        return false;
      },
      destroy() { destroyed = true; },
    };
  },
};
