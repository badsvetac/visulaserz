import { NOTES, mtof, keyListener } from './lib/key.js';

// CHORDS: the seven chords of the song's key on seven pads, so any track can be played along with
// without knowing a note of theory. LISTEN finds the key by ear; the pads are its chords (I ii iii
// IV V vi vii° in a major key, i ii° III iv v VI VII in a minor one), each with its bass note
// under it. Every chord is voiced as close as it can be to the one before, so going from pad to
// pad sounds like a hand moving on a keyboard rather than a jump. STYLE says how a held chord
// speaks: a pad, a pluck, a strum, or an arpeggio running on the beat grid.
//
// Keys, once it has been clicked: 1–7 play the chords.

const STYLES = [['Pad', 0], ['Pluck', 0], ['Strum', 0], ['Arp 1/8', 0.5], ['Arp 1/16', 0.25]];
const STEPS = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const QUALITY = { major: ['', 'm', 'm', '', '', 'm', '°'], minor: ['m', '°', '', 'm', 'm', '', ''] };
const ROMAN = { major: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'], minor: ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'] };

// Freezes a parameter where it is at time t, even halfway through a ramp. cancelScheduledValues
// alone would drop the ramp and jump back to its starting value: a click, or a pluck that swells.
function hold(param, t) {
  if (param.cancelAndHoldAtTime) { param.cancelAndHoldAtTime(t); return; }
  const v = param.value;
  param.cancelScheduledValues(t);
  param.setValueAtTime(v, t);
}

export default {
  id: 'chords',
  name: 'Chords',
  group: 'Instruments',
  blurb: 'The seven chords of the song’s key on seven pads, with the bass under them: Listen finds the key by ear. Play them as pads, plucks, strums or an arpeggio in time',
  tags: ['chords', 'harmony', 'arpeggio', 'key', 'synth', 'play along'],
  size: { w: 470, h: 214 },

  create(host, mount) {
    const { el } = host;
    let root = host.store.get('root', 9) % 12;                 // A
    let mode = host.store.get('mode', 'minor') === 'major' ? 'major' : 'minor';
    let style = Math.min(STYLES.length - 1, host.store.get('style', 0) | 0);
    let bass = host.store.get('bass', true);
    let level = host.store.get('level', 0.7);
    let bus = null;
    let held = [];                 // chord pads held down, in order: the last one sounds
    let voice = null;              // the chord sounding: { degree, notes, bassVoice, arp }
    let centre = 62;               // where the last chord sat on the keyboard, for the next to stay near
    const flashes = [];            // arpeggio notes still to come, so the picture hits when they sound

    const rootCycle = host.ui.cycle({ label: 'Root', options: NOTES, index: root, onChange: (i) => { root = i; host.store.set('root', i); relabel(); } });
    const modeCycle = host.ui.cycle({ label: 'Key', options: ['Major', 'Minor'], index: mode === 'major' ? 0 : 1, onChange: (i) => { mode = i ? 'minor' : 'major'; host.store.set('mode', mode); relabel(); } });
    const styleCycle = host.ui.cycle({ label: 'Style', options: STYLES.map((s) => s[0]), index: style, onChange: (i) => { style = i; host.store.set('style', i); } });
    const bassSw = host.ui.toggle({ label: 'Bass', on: bass, title: 'Play each chord’s root two octaves down, as a bass line', onChange: (v) => { bass = v; host.store.set('bass', v); } });
    const levelKnob = host.ui.knob({ label: 'Level', value: level, def: 0.7, onChange: (v) => { level = v; host.store.set('level', v); if (bus) bus.out.gain.setTargetAtTime(v * v * 0.5, bus.ctx.currentTime, 0.03); } });
    const listenBtn = el('button', { class: 'key', type: 'button', title: 'Listen to the track for a few seconds and set the key', onclick: () => { if (ear.start()) listenLed(true); } }, el('span', { class: 'led' }), el('span', {}, 'Listen'));
    const pads = [0, 1, 2, 3, 4, 5, 6].map((d) => host.ui.pad({ label: '', key: String(d + 1), keyLabel: String(d + 1), start: () => press(d), stop: () => lift(d) }));
    const romans = pads.map((p) => {
      const r = el('span', { class: 'pad-roman' });
      p.node.insertBefore(r, p.node.querySelector('.pad-label'));
      return r;
    });
    mount.append(
      el('div', { class: 'tool-row' }, rootCycle.el, modeCycle.el, listenBtn, el('div', { class: 'tool-row-end' }, styleCycle.el, bassSw.el, levelKnob.el)),
      el('div', { class: 'chord-pads' }, pads.map((p) => p.node)),
    );

    const ear = keyListener(host, {
      onDone({ root: r, minor, name }) {
        listenLed(false);
        root = r;
        mode = minor ? 'minor' : 'major';
        rootCycle.set(r, true);
        modeCycle.set(minor ? 1 : 0, true);
        host.store.set('root', root);
        host.store.set('mode', mode);
        relabel();
        host.lcd('Chords', name.toUpperCase());
        host.toast(`It sounds like ${name}: the pads now play its chords.`);
      },
      onFail(message) { listenLed(false); host.toast(message); },
    });
    function listenLed(on) {
      listenBtn.classList.toggle('is-active', on);
      listenBtn.querySelector('span:last-child').textContent = on ? 'Listening…' : 'Listen';
    }

    // ── harmony ───────────────────────────────────────────────────────────────
    const chordName = (d) => `${NOTES[(root + STEPS[mode][d]) % 12]}${QUALITY[mode][d]}`;
    function relabel() {
      pads.forEach((p, d) => {
        p.node.querySelector('.pad-label').textContent = chordName(d);
        p.node.title = `${ROMAN[mode][d]}: ${chordName(d)} (key ${d + 1})`;
        romans[d].textContent = ROMAN[mode][d];
      });
    }
    // The triad on a degree of the scale (its root, third and fifth), each note put in whichever
    // octave lies nearest the last chord. The centre is kept within an octave and a bit around
    // middle C, so a long walk round the circle of fifths cannot drift off the keyboard.
    function voicing(d) {
      const scale = STEPS[mode];
      const notes = [0, 2, 4].map((k) => {
        const pc = (root + scale[(d + k) % 7]) % 12;
        let m = 48 + pc;
        while (m < centre - 6) m += 12;
        while (m >= centre + 6) m -= 12;
        return m;
      }).sort((a, b) => a - b);
      centre = Math.min(68, Math.max(56, (notes[0] + notes[1] + notes[2]) / 3));
      return { notes, bass: 36 + ((root + scale[d]) % 12) };
    }

    // ── sound ─────────────────────────────────────────────────────────────────
    function ensure() {
      if (bus) return bus;
      const ctx = host.audio.ensure();
      if (!ctx || !host.audio.input) return null;
      const out = ctx.createGain();
      out.gain.value = level * level * 0.5;
      out.connect(host.audio.input);
      bus = { ctx, out };
      host.onDispose(() => { try { out.disconnect(); } catch { /* gone */ } });
      return bus;
    }
    const stopAll = (n, when) => {
      if (when >= n.stopAt) return;
      n.stopAt = when;
      for (const o of n.oscs) { try { o.stop(when); } catch { /* already stopped */ } }
    };
    // One note of a chord: two saws a hair apart through a lowpass. A pad swells and holds; the
    // others strike bright and close, and a pluck or an arpeggio note dies away on its own.
    function note(midi, t, shape, peak = 0.22) {
      const ctx = bus.ctx;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 3;
      const env = ctx.createGain();
      env.gain.value = 0;
      env.gain.setValueAtTime(0, t);
      const oscs = [-7, 7].map((cents) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(midi);
        o.detune.value = cents;
        o.connect(filter);
        o.start(t);
        return o;
      });
      filter.connect(env).connect(bus.out);
      const n = { oscs, env, shape, stopAt: Infinity };
      if (shape === 'pad') {
        filter.frequency.setValueAtTime(800, t);
        filter.frequency.linearRampToValueAtTime(2400, t + 0.45);
        env.gain.linearRampToValueAtTime(peak, t + 0.09);
      } else {
        const life = shape === 'arp' ? 0.24 : 0.5;
        filter.frequency.setValueAtTime(5200, t);
        filter.frequency.exponentialRampToValueAtTime(shape === 'arp' ? 900 : 650, t + life * 0.7);
        env.gain.linearRampToValueAtTime(peak * 1.25, t + 0.004);
        if (shape === 'strum') {
          env.gain.exponentialRampToValueAtTime(peak * 0.4, t + 0.5);     // a strummed chord rings on while held
        } else {
          env.gain.exponentialRampToValueAtTime(0.0005, t + life);
          stopAll(n, t + life + 0.02);
        }
      }
      return n;
    }
    // The bass: a sine with a little square on it for edge, low enough to sit under the track's own
    function bassNote(midi, t, shape) {
      const ctx = bus.ctx;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 380;
      const env = ctx.createGain();
      env.gain.value = 0;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.4, t + 0.012);
      if (shape !== 'pad') env.gain.exponentialRampToValueAtTime(0.14, t + 0.6);
      const sine = ctx.createOscillator();
      sine.frequency.value = mtof(midi);
      const sq = ctx.createOscillator();
      sq.type = 'square';
      sq.frequency.value = mtof(midi);
      const edge = ctx.createGain();
      edge.gain.value = 0.1;
      sine.connect(lp);
      sq.connect(edge).connect(lp);
      lp.connect(env).connect(bus.out);
      sine.start(t);
      sq.start(t);
      return { oscs: [sine, sq], env, shape, stopAt: Infinity };
    }
    function release(n, t, tail) {
      if (!n || n.stopAt <= t) return;
      hold(n.env.gain, t);
      n.env.gain.setTargetAtTime(0, t, tail / 5);
      stopAll(n, t + tail + 0.05);
    }

    function play(d) {
      const b = ensure();
      if (!b) return;
      const t = b.ctx.currentTime + 0.005;
      stopVoice(t);
      const { notes, bass: bassMidi } = voicing(d);
      const [name, div] = STYLES[style];
      const shape = div ? 'arp' : name.toLowerCase();
      const v = { degree: d, notes: [], bassVoice: null, arp: null };
      if (div) v.arp = { notes, div, step: 0, next: Math.max(t, host.clock.quantise(div, t)) };
      else notes.forEach((m, i) => v.notes.push(note(m, t + (shape === 'strum' ? i * 0.03 : 0), shape)));
      if (bass) v.bassVoice = bassNote(bassMidi, t, shape);
      voice = v;
      host.setActive(true);
      host.visual.hit(0.45);
      host.lcd(`Chords ${ROMAN[mode][d]}`, chordName(d));
    }
    function stopVoice(t) {
      flashes.length = 0;
      if (!voice) return;
      voice.notes.forEach((n) => release(n, t, n.shape === 'pad' ? 0.7 : 0.25));
      release(voice.bassVoice, t, 0.3);
      voice = null;
      host.setActive(false);
    }
    function press(d) { held = held.filter((x) => x !== d); held.push(d); play(d); }
    function lift(d) {
      if (!held.includes(d)) return;
      const wasLast = held[held.length - 1] === d;
      held = held.filter((x) => x !== d);
      if (!wasLast) return;
      if (held.length) play(held[held.length - 1]);      // back to the chord still held
      else if (bus) stopVoice(bus.ctx.currentTime);
    }

    relabel();

    return {
      tick(dt) {
        ear.tick(dt);
        if (!bus) return;
        const now = bus.ctx.currentTime;
        // The arpeggio walks up the chord and up an octave, one grid step at a time, scheduled a
        // little ahead of the clock so a slow frame cannot make it stumble.
        if (voice?.arp) {
          const a = voice.arp;
          while (a.next < now + 0.1) {
            const m = a.notes[a.step % 3] + (Math.floor(a.step / 3) % 2 ? 12 : 0);
            const at = Math.max(a.next, now + 0.002);
            voice.notes.push(note(m, at, 'arp', 0.2));
            flashes.push(at);
            a.step++;
            a.next = host.clock.next(a.div, a.next + 0.01);
          }
          voice.notes = voice.notes.filter((n) => n.stopAt > now);
        }
        while (flashes.length && flashes[0] <= now) { flashes.shift(); host.visual.hit(0.18); }
        if (voice) host.visual.bend({ hue: (voice.degree / 6 - 0.5) * 0.16 });   // each chord tints the picture its own way
      },
      keydown(e) {
        const p = pads.find((x) => x.key === e.key);
        if (!p) return false;
        if (!e.repeat) p.press();
        return true;
      },
      keyup(e) { pads.find((x) => x.key === e.key)?.release(); },
      release() {
        held = [];
        pads.forEach((p) => p.reset());
        if (bus) stopVoice(bus.ctx.currentTime);
      },
      destroy() { ear.cancel(); if (bus) stopVoice(bus.ctx.currentTime); },
    };
  },
};
