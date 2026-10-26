// DUB SIREN: the box every sound system has on its desk. Hold the button and a tone sweeps up and
// down under a tempo-locked echo; let go and the echo carries it on and away, the way a dub
// engineer rides it. SHAPE is how the pitch moves: a slow wail, a two-tone alarm, a falling laser
// ("pew") or a climbing rise; RATE is how many beats one sweep takes, so it always swings with the
// track; PITCH and DEPTH are where it sits and how far it travels. ECHO is the echo's time in
// beats, and REPEAT how hard it feeds back on itself through a band-pass, like a tape echo
// running hot.
//
// Keys, once it has been clicked: hold Space (or S) to sound it, 1–4 pick the shape.

const SHAPES = [
  { name: 'Wail', wave: 'triangle', sign: 1 },
  { name: 'Two-tone', wave: 'square', sign: 1 },
  { name: 'Laser', wave: 'sawtooth', sign: -1 },        // the sweep falls: pew, pew
  { name: 'Rise', wave: 'sawtooth', sign: 1 },
];
const RATES = [[0.25, '1/16'], [0.5, '1/8'], [1, '1/4'], [2, '1/2'], [4, '1 bar']];
const ECHO_TIMES = [[0.75, '1/8.'], [0.5, '1/8'], [1, '1/4']];
const TONES = ['square', 'sawtooth', 'sine'];

export default {
  id: 'siren',
  name: 'Dub Siren',
  group: 'Instruments',
  blurb: 'The sound-system siren: hold it for a wail, an alarm, a laser or a rise that swings with the track, and let the tempo-locked echo carry it away',
  tags: ['siren', 'dub', 'reggae', 'laser', 'echo', 'sound system'],
  size: { w: 400, h: 208 },

  create(host, mount) {
    const { el } = host;
    let shape = Math.min(SHAPES.length - 1, host.store.get('shape', 0) | 0);
    let rate = Math.min(RATES.length - 1, host.store.get('rate', 2) | 0);
    let echoTime = Math.min(ECHO_TIMES.length - 1, host.store.get('echoTime', 0) | 0);
    let tone = Math.min(TONES.length - 1, host.store.get('tone', 0) | 0);
    let pitch = host.store.get('pitch', 640);
    let depth = host.store.get('depth', 0.6);
    let echo = host.store.get('echo', 0.55);
    let level = host.store.get('level', 0.6);
    let bus = null;
    let voice = null;              // { osc, lfo, amp, t0, hz } while it sounds
    let lastCycle = -1;

    const keys = SHAPES.map((s, i) => el('button', { class: 'tool-key', type: 'button', title: `${s.name} (key ${i + 1})`, onclick: () => setShape(i) }, s.name, el('kbd', {}, String(i + 1))));
    const rateCycle = host.ui.cycle({ label: 'Rate', options: RATES.map((r) => r[1]), index: rate, title: 'How long one sweep takes, in beats of the track', onChange: (i) => { rate = i; host.store.set('rate', i); retime(); } });
    const echoCycle = host.ui.cycle({ label: 'Echo', options: ECHO_TIMES.map((r) => r[1]), index: echoTime, title: 'The echo’s time, locked to the beat', onChange: (i) => { echoTime = i; host.store.set('echoTime', i); retime(); } });
    const toneCycle = host.ui.cycle({ label: 'Tone', options: ['Square', 'Saw', 'Sine'], index: tone, onChange: (i) => { tone = i; host.store.set('tone', i); if (voice) voice.osc.type = TONES[i]; } });
    const pitchKnob = host.ui.knob({ label: 'Pitch', min: 120, max: 2400, value: pitch, def: 640, curve: 2.2, fmt: (v) => `${Math.round(v)} Hz`, onChange: (v) => { pitch = v; host.store.set('pitch', v); if (voice) voice.osc.frequency.setTargetAtTime(v, bus.ctx.currentTime, 0.03); } });
    const depthKnob = host.ui.knob({ label: 'Depth', value: depth, def: 0.6, fmt: (v) => `${(v * 2).toFixed(1)} oct`, onChange: (v) => { depth = v; host.store.set('depth', v); if (voice) voice.lfoGain.gain.setTargetAtTime(sweepCents(), bus.ctx.currentTime, 0.03); } });
    const echoKnob = host.ui.knob({ label: 'Repeat', value: echo, def: 0.55, onChange: (v) => { echo = v; host.store.set('echo', v); if (bus) bus.feedback.gain.setTargetAtTime(v * 0.88, bus.ctx.currentTime, 0.03); } });
    const levelKnob = host.ui.knob({ label: 'Level', value: level, def: 0.6, onChange: (v) => { level = v; host.store.set('level', v); if (bus) bus.out.gain.setTargetAtTime(v * v * 0.5, bus.ctx.currentTime, 0.03); } });
    const pad = host.ui.pad({ label: 'Siren', key: ' ', keyLabel: 'SPACE', cls: 'pad-accent siren-pad', hint: 'Hold to sound the siren', start: () => sound(), stop: () => hush() });
    mount.append(
      el('div', { class: 'tool-keys' }, keys),
      el('div', { class: 'tool-row siren-row' }, pad.node, pitchKnob.el, depthKnob.el, echoKnob.el, levelKnob.el),
      el('div', { class: 'tool-row' }, rateCycle.el, echoCycle.el, toneCycle.el),
    );
    keys[shape].classList.add('is-active');

    const sweepCents = () => depth * 2400 * (SHAPES[shape].wave === 'square' ? 0.25 : 1) * SHAPES[shape].sign;   // a two-tone alarm jumps a third, not two octaves
    const sweepHz = () => 1 / (RATES[rate][0] * host.clock.period);

    // ── sound ─────────────────────────────────────────────────────────────────
    function ensure() {
      if (bus) return bus;
      const ctx = host.audio.ensure();
      if (!ctx || !host.audio.input) return null;
      const out = ctx.createGain();
      out.gain.value = level * level * 0.5;
      out.connect(host.audio.input);
      const dry = ctx.createGain();
      dry.connect(out);
      // the echo: a delay that feeds itself through a band-pass, so each repeat is darker and thinner
      const send = ctx.createGain();
      send.gain.value = 0.8;
      const delay = ctx.createDelay(4);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 260;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      const feedback = ctx.createGain();
      feedback.gain.value = echo * 0.88;
      const ret = ctx.createGain();
      ret.gain.value = 0.85;
      dry.connect(send).connect(delay).connect(hp).connect(lp).connect(feedback).connect(delay);
      lp.connect(ret).connect(out);
      bus = { ctx, out, dry, delay, feedback };
      retime();
      host.onDispose(() => { try { out.disconnect(); } catch { /* gone */ } });
      return bus;
    }
    function retime() {
      if (!bus) return;
      const t = bus.ctx.currentTime;
      bus.delay.delayTime.setTargetAtTime(Math.min(3.9, ECHO_TIMES[echoTime][0] * host.clock.period), t, 0.05);
      if (voice) voice.lfo.frequency.setTargetAtTime(sweepHz(), t, 0.05);
    }
    function sound() {
      const b = ensure();
      if (!b) return;
      if (voice) return;
      const ctx = b.ctx;
      // start on the beat grid's next sixteenth, so the sweep lines up with the music
      const t = Math.max(ctx.currentTime + 0.003, host.clock.quantise(0.25, ctx.currentTime));
      const s = SHAPES[shape];
      const osc = ctx.createOscillator();
      osc.type = TONES[tone];
      osc.frequency.value = pitch;
      const lfo = ctx.createOscillator();
      lfo.type = s.wave;
      lfo.frequency.value = sweepHz();
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = sweepCents();
      lfo.connect(lfoGain).connect(osc.detune);
      const amp = ctx.createGain();
      amp.gain.value = 0;
      amp.gain.setValueAtTime(0, t);
      amp.gain.linearRampToValueAtTime(0.5, t + 0.006);
      osc.connect(amp).connect(b.dry);
      osc.start(t);
      lfo.start(t);
      voice = { osc, lfo, lfoGain, amp, t0: t };
      lastCycle = -1;
      // the next time the echo is used it takes the tempo of now
      retime();
      host.setActive(true);
      host.visual.shock(0.25);
      host.lcd('siren', s.name.toUpperCase());
    }
    function hush() {
      if (!voice || !bus) return;
      const t = bus.ctx.currentTime;
      const g = voice.amp.gain;
      if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t);
      else { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); }
      g.setTargetAtTime(0, t, 0.012);
      voice.osc.stop(t + 0.1);
      voice.lfo.stop(t + 0.1);
      voice = null;
      host.setActive(false);
    }
    function setShape(i) {
      if (i === shape) return;
      shape = i;
      host.store.set('shape', i);
      keys.forEach((k, j) => k.classList.toggle('is-active', j === i));
      if (voice) {
        voice.lfo.type = SHAPES[i].wave;
        voice.lfoGain.gain.setTargetAtTime(sweepCents(), bus.ctx.currentTime, 0.02);
      }
      host.lcd('siren', SHAPES[i].name.toUpperCase());
    }

    return {
      tick() {
        if (!voice || !bus) return;
        // where the sweep is now, worked out from when it started: the picture follows the pitch
        // (the browser's sawtooth starts halfway up its ramp and its triangle a quarter of the way)
        const s = SHAPES[shape];
        const ph = Math.max(0, (bus.ctx.currentTime - voice.t0) * voice.lfo.frequency.value) + (s.wave === 'sawtooth' ? 0.5 : s.wave === 'triangle' ? 0.25 : 0);
        const cycle = Math.floor(ph), f = ph - cycle;
        const wave = s.wave === 'triangle' ? 1 - 4 * Math.abs(f - 0.5) : s.wave === 'square' ? (f < 0.5 ? 1 : -1) : (2 * f - 1) * s.sign;
        if (cycle !== lastCycle) { lastCycle = cycle; host.visual.hit(s.wave === 'sawtooth' ? 0.45 : 0.25); }   // each sweep comes round on the picture
        host.visual.bend({ hue: wave * 0.06 * depth, warp: 0.03 + 0.03 * Math.max(0, wave) });
      },
      keydown(e) {
        if (/^[1-4]$/.test(e.key)) { if (!e.repeat) setShape(Number(e.key) - 1); return true; }
        if (e.key !== ' ' && e.key.toLowerCase() !== 's') return false;
        if (!e.repeat) pad.press();
        return true;
      },
      keyup(e) { if (e.key === ' ' || e.key.toLowerCase() === 's') pad.release(); },
      // the panic key: the siren stops and so does its echo
      release() {
        pad.reset();
        hush();
        if (bus) {
          // silent until whatever is still in the delay line has come out of it
          const t = bus.ctx.currentTime, clear = t + bus.delay.delayTime.value + 0.15;
          bus.feedback.gain.setTargetAtTime(0, t, 0.01);
          bus.feedback.gain.setTargetAtTime(echo * 0.88, clear, 0.05);
          bus.out.gain.setTargetAtTime(0, t, 0.01);
          bus.out.gain.setTargetAtTime(level * level * 0.5, clear, 0.05);
        }
      },
      destroy() { hush(); },
    };
  },
};
