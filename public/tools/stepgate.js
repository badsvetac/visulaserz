// STEP GATE: paint your own rhythm into the music. Sixteen steps (full, half or off) chop the whole
// mix in time with the track. The steps are scheduled on the audio clock a fifth of a second
// ahead, never per frame, so the rhythm cannot wobble, and every bar the grid is re-read from the
// beat clock, so a change of tempo is followed by the next downbeat. SWING drags every other step;
// DEPTH says how hard an off step cuts.
//
// Click a step to switch it, Shift-click for a half step, drag to paint. Space runs and stops it.

const RATES = [['1/16', 0.25], ['1/8', 0.5], ['1/32', 0.125]];
const PATTERNS = [
  ['Pulse', [2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0]],
  ['Trance', [2, 2, 2, 0, 2, 2, 0, 0, 2, 2, 2, 0, 2, 0, 2, 0]],
  ['Offbeat', [0, 0, 2, 2, 0, 0, 2, 2, 0, 0, 2, 2, 0, 0, 2, 2]],
  ['Gallop', [2, 0, 2, 2, 2, 0, 2, 2, 2, 0, 2, 2, 2, 0, 2, 2]],
  ['Stutter', [2, 0, 2, 2, 0, 2, 0, 0, 2, 0, 2, 2, 0, 2, 2, 0]],
  ['Breathe', [2, 1, 1, 0, 2, 1, 1, 0, 2, 1, 1, 0, 2, 2, 1, 1]],
  ['Random', null],
];
const LOOKAHEAD = 0.2;
const EDGE = 0.005;

export default {
  id: 'stepgate',
  name: 'Step Gate',
  group: 'Rhythm',
  blurb: 'Paint a 16-step rhythm and it chops the whole mix in time with the track: on, half or off per step, with swing and depth. Patterns to start from',
  tags: ['gate', 'chop', 'trance', 'sequencer', 'rhythm', 'swing'],
  size: { w: 470, h: 210 },

  create(host, mount) {
    const { el } = host;
    let steps = host.store.get('steps', null);
    if (!Array.isArray(steps) || steps.length !== 16) steps = [...PATTERNS[1][1]];
    let rate = Math.min(RATES.length - 1, host.store.get('rate', 0) | 0);
    let depth = host.store.get('depth', 0.9);
    let swing = host.store.get('swing', 0);
    let running = false;
    let gate = null, ctx = null;
    let anchor = 0, next = 0, last = 1;     // the bar's start, the next step to queue, the level queued last
    let queued = [];                        // [time, step] for the playhead
    let nowStep = -1;

    // ── controls ──────────────────────────────────────────────────────────────
    const run = host.ui.pad({ label: 'Run', key: ' ', keyLabel: 'Space', toggle: true, cls: 'pad-accent', hint: 'Start or stop the gate (Space)', start: () => start(), stop: () => stop() });
    const rateCycle = host.ui.cycle({ label: 'Step', options: RATES.map((r) => r[0]), index: rate, onChange: (i) => { rate = i; host.store.set('rate', i); if (running) resync(); } });
    const patternCycle = host.ui.cycle({ label: 'Pattern', options: PATTERNS.map((p) => p[0]), index: 1, onChange: (i) => setPattern(i) });
    const depthKnob = host.ui.knob({ label: 'Depth', value: depth, def: 0.9, onChange: (v) => { depth = v; host.store.set('depth', v); } });
    const swingKnob = host.ui.knob({ label: 'Swing', value: swing, max: 0.6, def: 0, fmt: (v) => `${Math.round((v / 0.6) * 100)}%`, onChange: (v) => { swing = v; host.store.set('swing', v); } });
    const cells = steps.map((_, i) => el('div', { class: 'step', dataset: { i: String(i) }, title: `Step ${i + 1}` }));
    const grid = el('div', { class: 'steps', role: 'group', 'aria-label': 'Steps' }, cells);
    const runWrap = el('div', { class: 'tool-group', style: 'width:84px' }, run.node);
    mount.append(el('div', { class: 'tool-row' }, runWrap, rateCycle.el, patternCycle.el, el('div', { class: 'tool-row-end' }, depthKnob.el, swingKnob.el)), grid);
    function paintSteps() { cells.forEach((c, i) => { c.classList.toggle('is-on', steps[i] === 2); c.classList.toggle('is-half', steps[i] === 1); }); }

    function setPattern(i) {
      const p = PATTERNS[i][1];
      steps = p ? [...p] : steps.map((_, k) => (k % 4 === 0 ? 2 : Math.random() < 0.55 ? (Math.random() < 0.25 ? 1 : 2) : 0));
      host.store.set('steps', steps);
      paintSteps();
    }

    // painting: the first step you touch decides what the drag paints
    let paintValue = null;
    const cellAt = (e) => { const t = document.elementFromPoint(e.clientX, e.clientY); return t?.classList.contains('step') ? Number(t.dataset.i) : -1; };
    grid.addEventListener('pointerdown', (e) => {
      const i = cellAt(e);
      if (i < 0 || e.button !== 0) return;
      e.preventDefault();
      host.capture(grid, e);
      paintValue = e.shiftKey ? (steps[i] === 1 ? 0 : 1) : steps[i] ? 0 : 2;
      steps[i] = paintValue;
      paintSteps();
    });
    grid.addEventListener('pointermove', (e) => {
      if (paintValue === null) return;
      const i = cellAt(e);
      if (i >= 0 && steps[i] !== paintValue) { steps[i] = paintValue; paintSteps(); }
    });
    const endPaint = () => { if (paintValue === null) return; paintValue = null; host.store.set('steps', steps); };
    grid.addEventListener('pointerup', endPaint);
    grid.addEventListener('pointercancel', endPaint);
    grid.addEventListener('lostpointercapture', endPaint);

    // ── sound ─────────────────────────────────────────────────────────────────
    function ensure() {
      if (gate) return gate;
      ctx = host.audio.ensure();
      if (!ctx || !host.audio.input) return null;
      gate = ctx.createGain();
      host.audio.insert({ input: gate, output: gate });
      return gate;
    }
    host.audio.whenReady((c) => { if (!gate) { ctx = c; ensure(); } });

    const stepLen = () => RATES[rate][1] * host.clock.period;
    // a bar starts on the next beat the clock knows about
    function resync(from = ctx.currentTime + 0.03) {
      anchor = host.clock.next(1, from);
      next = 0;
      gate.gain.cancelScheduledValues(ctx.currentTime);
      gate.gain.setValueAtTime(last, ctx.currentTime);
      queued = [];
    }
    function start() {
      if (!ensure()) { run.reset(); return; }
      running = true;
      last = 1;
      resync();
      host.setActive(true);
      host.lcd('step gate', 'RUN');
    }
    function stop() {
      running = false;
      if (gate) {
        const t = ctx.currentTime;
        gate.gain.cancelScheduledValues(t);
        gate.gain.setTargetAtTime(1, t, 0.01);
      }
      last = 1;
      queued = [];
      nowStep = -1;
      cells.forEach((c) => c.classList.remove('is-now'));
      host.setActive(false);
    }
    function schedule() {
      const now = ctx.currentTime;
      const len = stepLen();
      if (anchor + next * len < now - 1) resync(now);         // a long stall (a background tab): pick up from now
      for (;;) {
        const n = steps.length;
        const k = next % n;
        const at = anchor + next * len + (k % 2 ? swing * len * 0.5 : 0);
        if (at >= now + LOOKAHEAD) break;
        const level = 1 - (1 - steps[k] / 2) * depth;
        if (at >= now) {
          gate.gain.setValueAtTime(last, at);                    // hold the last step flat right up to the edge
          gate.gain.linearRampToValueAtTime(level, at + EDGE);
          queued.push([at, k]);
        }
        last = level;
        next++;
        if (next >= n) {                                         // every bar, take the grid again from the clock
          const end = anchor + n * len;
          anchor = host.clock.next(1, end - len * 0.5);
          next = 0;
        }
      }
    }

    paintSteps();

    return {
      tick() {
        if (!running || !gate) return;
        schedule();
        const now = ctx.currentTime;
        while (queued.length > 1 && queued[1][0] <= now) queued.shift();
        const k = queued.length && queued[0][0] <= now ? queued[0][1] : -1;
        if (k !== nowStep) {
          nowStep = k;
          cells.forEach((c, i) => c.classList.toggle('is-now', i === k));
          if (k >= 0 && steps[k]) host.visual.hit(steps[k] === 2 ? 0.3 : 0.14);   // the picture is chopped too
        }
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
