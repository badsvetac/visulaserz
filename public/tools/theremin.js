// THEREMIN: a lead you play with one finger over the track. Left to right is pitch, two octaves of
// a scale, so every place you touch is a note that fits; bottom to top opens the tone, and near the
// top it starts to sing (vibrato). LISTEN works out the key of the music by ear (a 12-note chroma
// against the Krumhansl key profiles) and tunes the scale to it. Free is the real theremin: no
// notes at all, just pitch.
//
// Keys, once it has been clicked:  A S D F G H J K L ;  play the first ten notes of the scale.
import { NOTES, mtof, keyListener } from './lib/key.js';

const SCALES = [
  ['Minor pent', [0, 3, 5, 7, 10]],
  ['Major pent', [0, 2, 4, 7, 9]],
  ['Minor', [0, 2, 3, 5, 7, 8, 10]],
  ['Major', [0, 2, 4, 5, 7, 9, 11]],
  ['Hijaz', [0, 1, 4, 5, 7, 8, 10]],
  ['Blues', [0, 3, 5, 6, 7, 10]],
  ['Free', null],
];
const WAVES = ['Glass', 'Saw', 'Square'];
const KEYS = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'];

export default {
  id: 'theremin',
  name: 'Theremin',
  group: 'Instruments',
  blurb: 'A one-finger lead over the track, always in key: slide for the melody, lift your finger higher for tone and vibrato. Listen finds the key of the song by ear',
  tags: ['synth', 'lead', 'melody', 'scale', 'key', 'hijaz'],
  size: { w: 450, h: 268 },
  resizable: { minW: 330, minH: 220, maxW: 900, maxH: 480 },

  create(host, mount) {
    const { el } = host;
    let root = host.store.get('root', 9) % 12;                 // A
    let scale = Math.min(SCALES.length - 1, host.store.get('scale', 0) | 0);
    let wave = Math.min(WAVES.length - 1, host.store.get('wave', 0) | 0);
    let level = host.store.get('level', 0.7);
    let voice = null;
    let touch = null;              // { x, y } while a finger is down
    let keysDown = [];             // note indexes held from the keyboard, the last one sounds

    const rootCycle = host.ui.cycle({ label: 'Root', options: NOTES, index: root, onChange: (i) => { root = i; host.store.set('root', i); } });
    const scaleCycle = host.ui.cycle({ label: 'Scale', options: SCALES.map((s) => s[0]), index: scale, onChange: (i) => { scale = i; host.store.set('scale', i); } });
    const waveCycle = host.ui.cycle({ label: 'Tone', options: WAVES, index: wave, onChange: (i) => { wave = i; host.store.set('wave', i); if (voice) { killVoice(); } } });
    const levelKnob = host.ui.knob({ label: 'Level', value: level, def: 0.7, onChange: (v) => { level = v; host.store.set('level', v); if (voice) voice.out.gain.setTargetAtTime(v * v * 0.55, voice.ctx.currentTime, 0.03); } });
    const listenBtn = el('button', { class: 'key', type: 'button', title: 'Listen to the track for a few seconds and tune the scale to its key', onclick: () => listen() }, el('span', { class: 'led' }), el('span', {}, 'Listen'));
    const canvas = el('canvas');
    const surface = el('div', { class: 'tool-surface', title: 'Press and slide: left to right is the melody, higher is brighter' }, canvas);
    mount.append(el('div', { class: 'tool-row' }, rootCycle.el, scaleCycle.el, waveCycle.el, el('div', { class: 'tool-row-end' }, listenBtn, levelKnob.el)), surface);
    const g = canvas.getContext('2d');

    // ── notes ─────────────────────────────────────────────────────────────────
    const base = () => 48 + root;                               // the root in the third octave
    function slots() {
      const s = SCALES[scale][1];
      if (!s) return null;
      const out = [];
      for (let oct = 0; oct < 2; oct++) for (const d of s) out.push(base() + oct * 12 + d);
      out.push(base() + 24);
      return out;
    }
    function midiAt(x) {
      const s = slots();
      if (!s) return base() + x * 24;
      return s[Math.min(s.length - 1, Math.floor(x * s.length))];
    }

    // ── the voice: one, held, gliding from note to note ──────────────────────────
    function makeVoice() {
      const ctx = host.audio.ensure();
      if (!ctx || !host.audio.input) return null;
      const out = ctx.createGain();
      out.gain.value = level * level * 0.55;
      out.connect(host.audio.input);
      const amp = ctx.createGain();
      amp.gain.value = 0;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 1200;
      tone.Q.value = 3;
      tone.connect(amp).connect(out);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.6;
      const vibDepth = ctx.createGain();
      vibDepth.gain.value = 0;
      vib.connect(vibDepth);
      vib.start();
      const oscs = [];
      const add = (type, mult, detune, gain) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.detune.value = detune;
        vibDepth.connect(o.detune);
        const gn = ctx.createGain();
        gn.gain.value = gain;
        o.connect(gn).connect(tone);
        o.start();
        oscs.push({ o, mult });
        return o;
      };
      if (wave === 0) {
        // glass: a sine with a soft FM shimmer an octave up
        const carrier = add('sine', 1, 0, 0.9);
        const mod = ctx.createOscillator();
        mod.type = 'sine';
        const index = ctx.createGain();
        index.gain.value = 0;
        mod.connect(index).connect(carrier.frequency);
        mod.start();
        oscs.push({ o: mod, mult: 2, index });
      } else if (wave === 1) {
        add('sawtooth', 1, -7, 0.32);
        add('sawtooth', 1, 7, 0.32);
      } else {
        add('square', 1, 0, 0.32);
        add('sine', 0.5, 0, 0.45);
      }
      const v = { ctx, out, amp, tone, vib, vibDepth, oscs, on: false };
      host.onDispose(() => stopVoice(v));
      return v;
    }
    function stopVoice(v) {
      try { v.oscs.forEach(({ o }) => o.stop()); v.vib.stop(); v.out.disconnect(); } catch { /* already stopped */ }
    }
    function killVoice() {
      if (!voice) return;
      const v = voice;
      voice = null;
      v.amp.gain.setTargetAtTime(0, v.ctx.currentTime, 0.02);
      setTimeout(() => stopVoice(v), 200);
    }

    function sound(midi, y) {
      if (!voice) voice = makeVoice();
      if (!voice) return;
      const v = voice, t = v.ctx.currentTime;
      const f = mtof(midi);
      for (const { o, mult, index } of v.oscs) {
        if (v.on) o.frequency.setTargetAtTime(f * mult, t, 0.03);   // glide, the way a finger slides
        else { o.frequency.cancelScheduledValues(t); o.frequency.setValueAtTime(f * mult, t); }
        if (index) index.gain.setTargetAtTime(f * (0.35 + 1.2 * y), t, 0.05);
      }
      v.tone.frequency.setTargetAtTime(380 * Math.pow(2, y * 4.4), t, 0.04);
      v.vibDepth.gain.setTargetAtTime(y > 0.62 ? ((y - 0.62) / 0.38) * 38 : 0, t, 0.08);
      if (!v.on) {
        v.on = true;
        v.amp.gain.cancelScheduledValues(t);
        v.amp.gain.setTargetAtTime(1, t, 0.012);
        host.setActive(true);
      }
    }
    function silence() {
      if (!voice?.on) return;
      voice.on = false;
      voice.amp.gain.setTargetAtTime(0, voice.ctx.currentTime, 0.09);
      host.setActive(false);
    }

    // ── the finger ────────────────────────────────────────────────────────────
    const at = (e) => {
      const r = surface.getBoundingClientRect();
      return { x: Math.min(0.9999, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)) };
    };
    // a finger, a controller or a hand in the air all come down, slide and lift the same way
    const clampX = (p) => ({ x: Math.min(0.9999, Math.max(0, p.x)), y: p.y });
    function press(p) {
      surface.classList.add('is-held');
      touch = clampX(p);
      sound(midiAt(touch.x), touch.y);
    }
    function slide(p) {
      if (!touch) return;
      touch = clampX(p);
      sound(midiAt(touch.x), touch.y);
    }
    function lift() {
      if (!touch) return;
      touch = null;
      surface.classList.remove('is-held');
      if (keysDown.length) playKeys(); else silence();
    }
    surface.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      host.capture(surface, e);
      press(at(e));
    });
    surface.addEventListener('pointermove', (e) => slide(at(e)));
    surface.addEventListener('pointerup', lift);
    surface.addEventListener('pointercancel', lift);
    surface.addEventListener('lostpointercapture', lift);
    host.ui.surface(surface, { down: press, move: slide, up: lift });

    let keyX = 0.5;                  // where a note played from the keyboard would sit on the pad
    function playKeys() {
      const i = keysDown[keysDown.length - 1];
      if (i === undefined) return silence();
      keyX = (i + 0.5) / KEYS.length;
      const s = slots();
      sound(s ? s[Math.min(s.length - 1, i)] : base() + i * 2, 0.55);
    }

    // ── listening for the key ─────────────────────────────────────────────────
    const ear = keyListener(host, {
      onDone({ root: r, minor, name }) {
        listenLed(false);
        rootCycle.set(r, true);
        root = r;
        host.store.set('root', root);
        scale = minor ? 0 : 1;
        scaleCycle.set(scale, true);
        host.store.set('scale', scale);
        host.lcd('theremin', name.toUpperCase());
        host.toast(`It sounds like ${name}: the pad is tuned to its pentatonic scale.`);
      },
      onFail(message) { listenLed(false); host.toast(message); },
    });
    function listenLed(on) {
      listenBtn.classList.toggle('is-active', on);
      listenBtn.querySelector('span:last-child').textContent = on ? 'Listening…' : 'Listen';
    }
    function listen() { if (ear.start()) listenLed(true); }

    // ── the picture ───────────────────────────────────────────────────────────
    let beam = '255, 79, 216', beamAge = 1;
    function draw(dt, an) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = surface.clientWidth, h = surface.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      if ((beamAge += dt) > 0.5) { beamAge = 0; beam = getComputedStyle(document.documentElement).getPropertyValue('--beam-rgb').trim() || beam; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const s = slots();
      const playing = voice?.on ? (touch ? midiAt(touch.x) : null) : null;
      g.font = '500 9px "Martian Mono", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      if (s) {
        const n = s.length;
        for (let k = 0; k < n; k++) {
          const x0 = (w * k) / n, isRoot = (s[k] - root) % 12 === 0;
          if (s[k] === playing) { g.fillStyle = `rgba(${beam},0.16)`; g.fillRect(x0, 0, w / n, h); }
          if (k) { g.strokeStyle = isRoot ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)'; g.beginPath(); g.moveTo(Math.round(x0) + 0.5, 0); g.lineTo(Math.round(x0) + 0.5, h); g.stroke(); }
          g.fillStyle = s[k] === playing ? `rgba(${beam},1)` : isRoot ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)';
          g.fillText(NOTES[s[k] % 12], x0 + w / n / 2, h - 5);
        }
      } else {
        for (let k = 0; k <= 24; k++) {
          const x = (w * k) / 24;
          g.strokeStyle = k % 12 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)';
          g.beginPath(); g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, h - (k % 12 ? 0 : 14)); g.stroke();
          if (k % 12 === 0 && k < 24) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillText(NOTES[root], x + 8, h - 5); }
        }
      }
      // the brightness, as a faint horizon
      g.fillStyle = `rgba(${beam},${0.05 + 0.12 * an.level})`;
      g.fillRect(0, 0, w, h * 0.38);
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.font = '400 8px Michroma, sans-serif';
      g.fillText('VIBRATO', 7, 6);
      if (touch) {
        const px = touch.x * w, py = (1 - touch.y) * h;
        g.strokeStyle = `rgba(${beam},0.45)`;
        g.beginPath(); g.moveTo(0, Math.round(py) + 0.5); g.lineTo(w, Math.round(py) + 0.5); g.stroke();
        const dot = g.createRadialGradient(px, py, 0, px, py, 24);
        dot.addColorStop(0, 'rgba(255,255,255,0.95)');
        dot.addColorStop(0.2, `rgba(${beam},0.95)`);
        dot.addColorStop(1, `rgba(${beam},0)`);
        g.fillStyle = dot;
        g.beginPath(); g.arc(px, py, 24, 0, Math.PI * 2); g.fill();
      } else if (!voice?.on) {
        g.font = '400 9px Michroma, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = 'rgba(255,255,255,0.28)';
        g.fillText(`${NOTES[root]} ${SCALES[scale][0].toUpperCase()} · PRESS AND SLIDE`, w / 2, h / 2);
      }
    }

    return {
      tick(dt, an) {
        ear.tick(dt);
        // the melody colours the picture: the note you hold turns the hue, a high one pulls it in
        if (voice?.on) host.visual.bend({ hue: ((touch ? touch.x : keyX) - 0.5) * 0.4, warp: (touch ? touch.y : 0.55) * 0.025 });
        draw(dt, an);
      },
      keydown(e) {
        const i = KEYS.indexOf(e.key.toLowerCase());
        if (i < 0) return false;
        if (!e.repeat && !keysDown.includes(i)) { keysDown.push(i); playKeys(); }
        return true;
      },
      keyup(e) {
        const i = KEYS.indexOf(e.key.toLowerCase());
        if (i < 0 || !keysDown.includes(i)) return;
        keysDown = keysDown.filter((k) => k !== i);
        if (touch) return;
        playKeys();
      },
      release() { keysDown = []; touch = null; surface.classList.remove('is-held'); silence(); },
      resize() { draw(0, host.analysis); },
      destroy() { if (voice) stopVoice(voice); voice = null; },
    };
  },
};
