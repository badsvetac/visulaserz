import { TAPE_SOURCE } from './lib/tape.js';

// SCRATCH: a record on a platter over whatever is playing. Grab it and the music stops under your
// hand; move it back and forth and you scratch the last few seconds of the mix. Let go and the
// track is right where it would have been (slip), so a scratch never costs you the beat.
// One turn of the record is 1.8 s of music, as on a real 33⅓ deck.
//
//   CUT (hold, or Space)  the crossfader cut: silence while held, for chirps and transforms
//   BRAKE (hold)          the motor switched off: the record winds down to a stop
//   BACKSPIN (hold)       the record thrown backwards, the classic rewind before a drop

const TURN = 1.8;                        // seconds of music per revolution
const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export default {
  id: 'scratch',
  name: 'Scratch',
  group: 'Rhythm',
  blurb: 'A record over the mix: grab it to scratch the last few seconds, let go and the track is where it would have been. With a cut, a brake and a backspin',
  tags: ['scratch', 'vinyl', 'turntable', 'dj', 'backspin', 'brake'],
  size: { w: 290, h: 360 },
  resizable: { minW: 240, minH: 300, maxW: 560, maxH: 640 },

  create(host, mount) {
    const { el } = host;
    let tape = null, ctx = null, destroyed = false;
    let angle = 0;                     // where the record is drawn (radians)
    let hand = null;                   // { last } while the pointer holds the record
    let motor = null;                  // { speed } while BRAKE or BACKSPIN drives the record
    let spinning = 0;                  // the platter's speed for the picture when nobody holds it

    const canvas = el('canvas');
    const surface = el('div', { class: 'tool-surface', title: 'Grab the record and move it. Let go and the music is back.' }, canvas);
    const cut = host.ui.pad({ label: 'Cut', key: ' ', keyLabel: 'Space', hint: 'Hold: silence (the crossfader cut)', start: () => send({ type: 'cut', on: true }), stop: () => send({ type: 'cut', on: false }) });
    const brake = host.ui.pad({ label: 'Brake', key: 'b', keyLabel: 'B', hint: 'Hold: the record winds down to a stop', start: () => startMotor(1, 0.5), stop: stopMotor });
    const back = host.ui.pad({ label: 'Backspin', key: 'n', keyLabel: 'N', hint: 'Hold: the record is thrown backwards', start: () => startMotor(-5, 0.7), stop: stopMotor });
    mount.append(surface, el('div', { class: 'scratch-foot' }, cut.node, brake.node, back.node));
    const g = canvas.getContext('2d');

    host.audio.whenReady(async (c) => {
      try { await host.audio.worklet('vz-tape', TAPE_SOURCE); } catch { return; }
      if (tape || destroyed) return;
      ctx = c;
      tape = new AudioWorkletNode(ctx, 'vz-tape', { outputChannelCount: [2], processorOptions: { seconds: 8 } });
      host.audio.insert({ input: tape, output: tape });
    });
    const send = (m) => tape?.port.postMessage(m);
    const frames = (turns) => turns * TURN * (ctx?.sampleRate ?? 48000);

    // ── the hand ──────────────────────────────────────────────────────────────
    const centre = () => { const r = surface.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const angleAt = (e) => { const c = centre(); return Math.atan2(e.clientY - c.y, e.clientX - c.x); };
    surface.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      host.capture(surface, e);
      if (!tape) host.audio.ensure();            // the first grab wakes the sound; the tape is ready a moment later
      motor = null;
      hand = { last: angleAt(e) };
      surface.classList.add('is-held');
      send({ type: 'grab' });
      host.setActive(true);
    });
    surface.addEventListener('pointermove', (e) => {
      if (!hand) return;
      const a = angleAt(e);
      const d = wrap(a - hand.last);             // clockwise on screen is forward, as on a deck
      hand.last = a;
      angle += d;
      moved += d;
      send({ type: 'hand', delta: frames(d / TAU) });
    });
    const letGo = () => {
      if (!hand) return;
      hand = null;
      surface.classList.remove('is-held');
      if (!motor) { send({ type: 'live' }); host.setActive(false); }
    };
    surface.addEventListener('pointerup', letGo);
    surface.addEventListener('pointercancel', letGo);
    surface.addEventListener('lostpointercapture', letGo);

    // ── the motor tricks ─────────────────────────────────────────────────────
    function startMotor(speed, decay) {
      if (hand) return;
      if (!tape) host.audio.ensure();
      motor = { speed, decay };
      send({ type: 'grab' });
      host.setActive(true);
      host.lcd('scratch', speed > 0 ? 'BRAKE' : 'BACKSPIN');
    }
    function stopMotor() {
      if (!motor) return;
      motor = null;
      if (!hand) { send({ type: 'live' }); host.setActive(false); }
    }

    // ── the picture ───────────────────────────────────────────────────────────
    let beam = '255, 79, 216', beamAge = 1;
    function draw(dt) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = surface.clientWidth, h = surface.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      if ((beamAge += dt) > 0.5) { beamAge = 0; beam = getComputedStyle(document.documentElement).getPropertyValue('--beam-rgb').trim() || beam; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 6;

      // the platter and its strobe dots, lit when the deck runs at speed
      g.fillStyle = '#1b1b22';
      g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; g.stroke();
      const lit = !hand && !motor && spinning > 0.9;
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * TAU + angle * 0.25;
        g.fillStyle = lit ? `rgba(${beam},${k % 2 ? 0.35 : 0.9})` : 'rgba(255,255,255,0.12)';
        g.beginPath(); g.arc(cx + Math.cos(a) * (R - 3.5), cy + Math.sin(a) * (R - 3.5), 1.2, 0, TAU); g.fill();
      }

      // the record: grooves, then the light, which stays where it is while the record turns
      const rr = R - 10;
      g.fillStyle = '#060608';
      g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.fill();
      for (let r = rr - 3; r > rr * 0.38; r -= 2.2) {
        g.strokeStyle = `rgba(255,255,255,${0.025 + 0.02 * Math.sin(r * 1.7)})`;
        g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
      }
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const base of [-0.9, Math.PI - 0.9]) {
        const sheen = g.createRadialGradient(cx, cy, rr * 0.35, cx, cy, rr);
        sheen.addColorStop(0, 'rgba(255,255,255,0)');
        sheen.addColorStop(0.7, 'rgba(255,255,255,0.07)');
        sheen.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = sheen;
        g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, rr, base, base + 0.55); g.closePath(); g.fill();
      }
      g.restore();

      // the label turns with the record, so you can see what your hand is doing
      const lr = rr * 0.34;
      g.save();
      g.translate(cx, cy);
      g.rotate(angle);
      const label = g.createRadialGradient(0, 0, 0, 0, 0, lr);
      label.addColorStop(0, `rgba(${beam},0.95)`);
      label.addColorStop(1, `rgba(${beam},0.45)`);
      g.fillStyle = label;
      g.beginPath(); g.arc(0, 0, lr, 0, TAU); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.font = `400 ${Math.max(7, lr * 0.2)}px Michroma, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('VISULASERZ', 0, -lr * 0.42);
      g.fillStyle = '#fff';
      g.fillRect(-1, lr * 0.15, 2, lr * 0.8);                // the marker
      g.restore();
      g.fillStyle = '#c8c8d0';
      g.beginPath(); g.arc(cx, cy, 3, 0, TAU); g.fill();

      if (!hand && !motor) {
        g.font = '400 8px Michroma, sans-serif';
        g.textAlign = 'center';
        g.fillStyle = 'rgba(255,255,255,0.32)';
        g.fillText('GRAB THE RECORD', cx, cy + rr * 0.62);
      }
    }

    let moved = 0;                     // how far a hand or a motor turned the record since the last frame
    let swirl = 0;                     // that, smoothed into radians a second
    return {
      tick(dt) {
        if (motor) {
          motor.speed *= Math.exp(-dt / motor.decay);
          const turns = (motor.speed * dt) / TURN;
          angle += turns * TAU;
          moved += turns * TAU;
          send({ type: 'hand', delta: frames(turns) });
        } else if (!hand) {
          // nobody holds it: the platter runs while the music does
          spinning += ((host.audio.ready && host.analysis.active ? 1 : 0) - spinning) * Math.min(1, dt * 3);
          angle += (spinning * dt * TAU) / TURN;
        }
        angle %= TAU * 1000;
        // the picture is on the record too: it turns with the hand, back and forth, and its trails swirl
        swirl += (moved / Math.max(dt, 1e-3) - swirl) * Math.min(1, dt * 18);
        moved = 0;
        if (hand || motor) host.visual.bend({ twist: Math.max(-0.12, Math.min(0.12, swirl * 0.012)), spin: swirl * 0.35 });
        else swirl = 0;
        draw(dt);
      },
      keydown(e) {
        const p = [cut, brake, back].find((x) => x.key === e.key.toLowerCase());
        if (!p) return false;
        if (!e.repeat) p.press();
        return true;
      },
      keyup(e) { [cut, brake, back].find((x) => x.key === e.key.toLowerCase())?.release(); },
      release() {
        [cut, brake, back].forEach((p) => p.reset());
        hand = null;
        motor = null;
        surface.classList.remove('is-held');
        send({ type: 'cut', on: false });
        send({ type: 'live' });
        host.setActive(false);
      },
      resize() { draw(0); },
      destroy() { destroyed = true; tape?.port.postMessage({ type: 'end' }); tape = null; },
    };
  },
};
