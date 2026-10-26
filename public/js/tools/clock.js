import { clamp } from '../util.js';

// A beat clock for the tools: where the beats fall on the audio clock, so a drum hit, a roll or a
// gate step lands on the grid instead of wherever the finger happened to come down.
//
// With a DJ deck on air it reads that deck's own beat grid, which is exact. Otherwise it follows
// the beat detector as a phase-locked loop: each detected beat that lands near where the grid
// expects one nudges the phase by a third of the miss, so one stray hit on an off-beat cannot
// drag the grid, and between hits (or with nothing playing) the grid simply runs on.
const LATENCY = 0.035;   // the detector fires about one analysis frame plus half an FFT window late
const NUDGE = 0.35;

export function createClock(engine) {
  let period = 0.5;      // seconds per beat (120 BPM until told otherwise)
  let anchor = 0;        // the audio-clock time of some beat
  let trust = 0;         // 0..1: how well the last few detections agreed with the grid
  let source = 'free';   // 'deck', 'beats' or 'free'

  const now = () => engine.ctx?.currentTime ?? 0;

  return {
    get bpm() { return 60 / period; },
    get period() { return period; },
    get trust() { return trust; },
    get source() { return source; },
    now,

    update(dt, an) {
      const ctx = engine.ctx;
      if (!ctx) return;
      const t = ctx.currentTime;
      const deck = engine.decks?.onAir;
      if (deck?.bpm > 0 && deck.playing) {
        period = 60 / deck.liveBpm;
        anchor = t - deck.beatAt().frac * period;
        trust = 1;
        source = 'deck';
        return;
      }
      const bpm = engine.tempo || an.bpm;
      if (bpm > 0) {
        // keep the anchor close to now, so a small change of tempo moves the next beats a little
        // instead of swinging an origin from minutes ago
        if (anchor && t - anchor > period) anchor += Math.floor((t - anchor) / period) * period;
        period = clamp(60 / bpm, 60 / 200, 60 / 60);
      }
      if (an.isBeat && an.active) {
        const hit = t - LATENCY;
        if (!anchor || trust < 0.05) {
          anchor = hit;
          trust = 0.25;
        } else {
          const k = Math.round((hit - anchor) / period);
          const miss = hit - (anchor + k * period);
          if (Math.abs(miss) < 0.22 * period) {
            anchor += miss * NUDGE;
            trust = Math.min(1, trust + 0.12);
          } else {
            trust = Math.max(0, trust - 0.2);
          }
        }
        source = 'beats';
      } else if (!an.active) {
        trust = Math.max(0, trust - dt * 0.05);
        if (source === 'deck') source = 'free';
      }
    },

    // Beats since the anchor at audio time t (fractional).
    beats(t = now()) { return (t - anchor) / period; },
    // The first grid point at or after t, the grid being every `div` beats.
    next(div = 1, t = now()) {
      const step = div * period;
      return anchor + Math.ceil((t - anchor) / step - 1e-6) * step;
    },
    // The last grid point at or before t.
    last(div = 1, t = now()) {
      const step = div * period;
      return anchor + Math.floor((t - anchor) / step + 1e-6) * step;
    },
    // Where a hit played at t should land: on the grid it just missed if it is barely late (a
    // late hand still means that beat), otherwise on the next grid point.
    quantise(div, t = now()) {
      if (!div) return t;
      const step = div * period;
      const last = this.last(div, t);
      return t - last < Math.min(0.03, step * 0.25) ? t : last + step;
    },
  };
}
