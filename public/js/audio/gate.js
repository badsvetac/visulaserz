import { clamp } from '../util.js';

// A trance gate: a 16-step volume pattern chopping the music in time with it.
//
// The whole thing is scheduled on the audio clock a fifth of a second ahead, never from
// the animation frame. A gate written per frame would jitter by however long the last
// frame took, and a rhythm that wobbles by 16 ms is a rhythm you can hear wobbling —
// especially in a background tab, where frames stop arriving altogether.
export const GATE_PATTERNS = [
  { name: 'Off', steps: null },
  { name: '1/8', steps: [1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0] },
  { name: '1/16', steps: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] },
  { name: 'Offbeat', steps: [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1] },
  { name: 'Trance', steps: [1, 1, 1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 0] },
  { name: 'Stutter', steps: [1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0] },
  { name: 'Swell', steps: [0.15, 0.3, 0.5, 0.7, 0.9, 1, 0.9, 0.7, 0.5, 0.35, 0.25, 0.4, 0.6, 0.8, 1, 0.6] },
];

const LOOKAHEAD = 0.2;  // seconds of pattern queued on the audio clock at any moment
const EDGE = 0.006;     // ramp on each step: long enough not to click, short enough to bite
const DEFAULT_BPM = 120;

export function createGate(engine) {
  let pattern = 0;
  let depth = 0.85;
  let nextStep = 0;   // absolute step index of the next one to schedule
  let anchor = 0;     // ctx time of step 0
  let stepDur = 0;
  // The level the last *scheduled* step will hold. param.value is no use here: it reports
  // the gate right now, while we are queueing events a fifth of a second into the future.
  let lastLevel = 1;

  const off = () => {
    const chain = engine.chain;
    if (!chain) return;
    chain.gateParam.cancelScheduledValues(engine.ctx.currentTime);
    chain.gateParam.setTargetAtTime(1, engine.ctx.currentTime, 0.02);
  };

  // Re-anchor: the pattern restarts from step 0 right now. Without a beat grid the gate
  // cannot know where the bar is, so "now" is the honest answer — and lining it up by
  // pressing the button on a downbeat is a perfectly normal DJ move anyway.
  function resync() {
    if (!engine.ctx) return;
    const bpm = engine.tempo || DEFAULT_BPM;
    stepDur = 60 / bpm / 4; // sixteenth notes
    anchor = engine.ctx.currentTime + 0.03;
    nextStep = 0;
    lastLevel = 1;
    // Drop anything already queued from the previous pattern, or the two would interleave.
    engine.chain?.gateParam.cancelScheduledValues(engine.ctx.currentTime);
  }

  return {
    get patternIndex() { return pattern; },
    get isOn() { return pattern > 0; },
    setPattern(index) {
      pattern = clamp(index | 0, 0, GATE_PATTERNS.length - 1);
      if (pattern === 0) off();
      else resync();
      return GATE_PATTERNS[pattern].name;
    },
    setDepth(v) { depth = clamp(v, 0, 1); },
    resync,

    tick() {
      if (!pattern || !engine.ctx || !engine.chain) return;
      const steps = GATE_PATTERNS[pattern].steps;
      const param = engine.chain.gateParam;
      const now = engine.ctx.currentTime;

      // Following the tempo mid-pattern would slide every queued step, so a new tempo
      // only takes effect at the next re-anchor.
      if (!stepDur) resync();
      // A long stall (a background tab, a dragged window) can leave the anchor far in the
      // past; skip forward instead of scheduling hundreds of steps that already happened.
      if (anchor + nextStep * stepDur < now - 1) {
        nextStep = Math.ceil((now - anchor) / stepDur);
        lastLevel = 1;
      }

      while (anchor + nextStep * stepDur < now + LOOKAHEAD) {
        const at = anchor + nextStep * stepDur;
        const level = 1 - (1 - steps[nextStep % steps.length]) * depth;
        if (at >= now) {
          // Hold the previous step flat right up to the edge, then ramp: without the
          // setValueAtTime the ramp would start from whenever the last event ended and
          // smear the pattern into a slow wobble.
          param.setValueAtTime(lastLevel, at);
          param.linearRampToValueAtTime(level, at + EDGE);
        }
        lastLevel = level;
        nextStep++;
      }
    },
  };
}
