// PUMP: the sidechain pump of every dance record. On each beat the whole mix ducks out of the way of
// a kick that is not there and swells back, so any track breathes in time. DEPTH says how far it
// ducks, SHAPE how much of the beat it takes to come back, RATE pumps on quarters, halves or eighths.
//
// Like everything rhythmic on the desk it is written on the audio clock a fifth of a second ahead,
// one duck curve after the next, never per frame; and every bar it takes the grid again from the
// beat clock, so a change of tempo is followed within a bar. Space runs and stops it.

const RATES = [['1/4', 1], ['1/2', 2], ['1/8', 0.5]];
const LOOKAHEAD = 0.2;
const POINTS = 96;

// one beat of the pump: a 1.5 % dive (fast, but not a click), then a curved swell back up
function duckCurve(depth, shape) {
  const curve = new Float32Array(POINTS);
  const attack = 0.015;
  for (let i = 0; i < POINTS; i++) {
    const u = i / (POINTS - 1);
    let env;
    if (u < attack) env = u / attack;
    else if (u < shape) env = Math.pow(1 - (u - attack) / (shape - attack), 1.6);
    else env = 0;
    curve[i] = 1 - depth * env;
  }
  return curve;
}

export default {
  id: 'pump',
  name: 'Pump',
  group: 'FX',
  blurb: 'The sidechain pump of dance music: on every beat the whole mix ducks and swells back, so any track breathes in time. Depth, shape, quarters to eighths',
  tags: ['sidechain', 'pump', 'ducking', 'edm', 'house', 'groove'],
  size: { w: 300, h: 250 },

  create(host, mount) {
    const { el } = host;
    let rate = Math.min(RATES.length - 1, host.store.get('rate', 0) | 0);
    let depth = host.store.get('depth', 0.75);
    let shape = host.store.get('shape', 0.6);
    let running = false;
    let gain = null, ctx = null;
    let next = 0, count = 0;            // the next pump to write, and how many since the grid was taken
    let queued = [];                    // pump times, for the picture and the drawing
    let lastPump = -1;

    const run = host.ui.pad({ label: 'Pump', key: ' ', keyLabel: 'Space', toggle: true, cls: 'pad-accent', hint: 'Start or stop the pump (Space)', start: () => start(), stop: () => stop() });
    const rateCycle = host.ui.cycle({ label: 'Rate', options: RATES.map((r) => r[0]), index: rate, onChange: (i) => { rate = i; host.store.set('rate', i); if (running) regrid(); } });
    const depthKnob = host.ui.knob({ label: 'Depth', value: depth, def: 0.75, onChange: (v) => { depth = v; host.store.set('depth', v); } });
    const shapeKnob = host.ui.knob({ label: 'Shape', min: 0.2, max: 0.95, value: shape, def: 0.6, fmt: (v) => `${Math.round(v * 100)}%`, onChange: (v) => { shape = v; host.store.set('shape', v); } });
    const canvas = el('canvas');
    const scope = el('div', { class: 'tool-surface pump-scope', title: 'The pump: how far the mix ducks on each beat and how it swells back' }, canvas);
    mount.append(el('div', { class: 'tool-row' }, el('div', { class: 'tool-group', style: 'width:92px' }, run.node), rateCycle.el, el('div', { class: 'tool-row-end' }, depthKnob.el, shapeKnob.el)), scope);
    const g = canvas.getContext('2d');

    function ensure() {
      if (gain) return gain;
      ctx = host.audio.ensure();
      if (!ctx || !host.audio.input) return null;
      gain = ctx.createGain();
      host.audio.insert({ input: gain, output: gain });
      return gain;
    }
    host.audio.whenReady((c) => { if (!gain) { ctx = c; ensure(); } });

    const stepLen = () => RATES[rate][1] * host.clock.period;
    let lastEnd = 0;                    // where the last written curve ends: a new one may not overlap it
    // A curve that has already begun is cut where it stands (a plain cancel would leave it running,
    // and anything written inside a running curve is refused).
    const hold = (t) => { if (gain.gain.cancelAndHoldAtTime) gain.gain.cancelAndHoldAtTime(t); else gain.gain.cancelScheduledValues(t); };
    function regrid(from = ctx.currentTime + 0.03) {
      hold(ctx.currentTime);
      lastEnd = ctx.currentTime;
      next = host.clock.next(RATES[rate][1], from);
      count = 0;
      queued = [];
    }
    function start() {
      if (!ensure()) { run.reset(); return; }
      running = true;
      regrid();
      host.setActive(true);
      host.lcd('pump', `${RATES[rate][0]} · ${Math.round(depth * 100)}%`);
    }
    function stop() {
      running = false;
      if (gain) {
        const t = ctx.currentTime;
        hold(t);
        gain.gain.setTargetAtTime(1, t + 0.001, 0.02);
      }
      queued = [];
      host.setActive(false);
    }
    function schedule() {
      const now = ctx.currentTime;
      const len = stepLen();
      if (next < now - 1) regrid(now);                          // after a stall, pick up from now
      while (next < now + LOOKAHEAD) {
        if (next >= now && next >= lastEnd) {
          const dur = Math.max(0.01, len - 0.0005);
          try {
            gain.gain.setValueCurveAtTime(duckCurve(depth, shape), next, dur);
            lastEnd = next + dur;
            queued.push(next);
          } catch { /* it would have overlapped the last curve: this beat is skipped, the next one lands */ }
        }
        next += len;
        // every bar, take the grid again from the clock, so the pump follows the tempo
        if (++count * RATES[rate][1] >= 4) { next = host.clock.next(RATES[rate][1], next - len * 0.5); count = 0; }
      }
    }

    let beam = '255, 79, 216', beamAge = 1;
    function draw(dt) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = scope.clientWidth, h = scope.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      if ((beamAge += dt) > 0.5) { beamAge = 0; beam = getComputedStyle(document.documentElement).getPropertyValue('--beam-rgb').trim() || beam; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      // two beats of the curve, and where the music is on it now
      const curve = duckCurve(depth, shape);
      const pad = 8, top = 10, bottom = h - 10;
      const y = (v) => bottom - (bottom - top) * v;
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.beginPath(); g.moveTo(pad, y(1) + 0.5); g.lineTo(w - pad, y(1) + 0.5); g.moveTo(w / 2 + 0.5, top); g.lineTo(w / 2 + 0.5, bottom); g.stroke();
      g.strokeStyle = `rgba(${beam},0.9)`;
      g.lineWidth = 2;
      g.beginPath();
      for (let k = 0; k < 2; k++) {
        for (let i = 0; i < POINTS; i++) {
          const x = pad + ((k + i / (POINTS - 1)) / 2) * (w - pad * 2);
          if (k === 0 && i === 0) g.moveTo(x, y(curve[i])); else g.lineTo(x, y(curve[i]));
        }
      }
      g.stroke();
      g.lineWidth = 1;
      if (running && ctx) {
        const now = ctx.currentTime, len = stepLen();
        const last = queued.filter((t) => t <= now).pop();
        if (last !== undefined) {
          const u = Math.min(1, (now - last) / len);
          const x = pad + (u / 2) * (w - pad * 2);
          const v = curve[Math.min(POINTS - 1, Math.round(u * (POINTS - 1)))];
          const dot = g.createRadialGradient(x, y(v), 0, x, y(v), 12);
          dot.addColorStop(0, '#fff');
          dot.addColorStop(0.3, `rgba(${beam},0.9)`);
          dot.addColorStop(1, `rgba(${beam},0)`);
          g.fillStyle = dot;
          g.beginPath(); g.arc(x, y(v), 12, 0, Math.PI * 2); g.fill();
        }
      } else {
        g.font = '400 8px Michroma, sans-serif';
        g.textAlign = 'center';
        g.fillStyle = 'rgba(255,255,255,0.3)';
        g.fillText('SPACE TO PUMP', w / 2, top + (bottom - top) * 0.62);
      }
    }

    return {
      tick(dt) {
        if (running && gain) {
          schedule();
          const now = ctx.currentTime;
          while (queued.length > 1 && queued[1] <= now) queued.shift();
          const t = queued.length && queued[0] <= now ? queued[0] : -1;
          if (t >= 0 && t !== lastPump) { lastPump = t; host.visual.hit(0.2 + 0.3 * depth); }   // the picture pumps too
        }
        draw(dt);
      },
      keydown(e) {
        if (e.key === ' ') { if (!e.repeat) run.press(); return true; }
        return false;
      },
      release() { if (running) run.press(); },
      destroy() { stop(); },
    };
  },
};
