// The shape of the bipolar DJ filter knob.
//
// Kept apart from the audio graph on purpose: it is a pure function, so you can try
// values in the console (visulaserz.djFilterCurve(-0.5, 0.4, 96000)) and tune the four
// constants below by ear without touching a single audio node.
//
// Two filters are always in the signal path; the knob decides which one is doing the work
// and parks the other one wide open. Frequencies move exponentially because that is how
// ears hear pitch: a sweep that is linear in Hz spends most of its travel doing nothing.
import { clamp } from '../util.js';

// ── the four numbers worth tuning by ear ─────────────────────────────────────
const DEAD = 0.04;      // how much of the knob's centre is "off". Wider = easier to find by hand.
const LOW_FLOOR = 130;  // full left. 130 Hz leaves a sub rumble; go to 60 to make it nearly vanish.
const HIGH_CEIL = 7000; // full right. 7 kHz leaves hats; 4 kHz keeps more of the track.
const MAX_Q_DB = 13;    // resonance cap. Higher = more of that screaming whistle, but the limiter pumps.

const FLAT_Q = -3;      // Butterworth. For lowpass/highpass biquads Q is in dB, so this is NOT 0.707.
const HP_OPEN = 20;     // parked highpass: below hearing
const LP_OPEN = 20000;  // parked lowpass: above hearing

/**
 * @param {number} f          knob position: -1 (full lowpass) … 0 (bypass) … +1 (full highpass)
 * @param {number} reso       resonance amount, 0…1
 * @param {number} sampleRate ctx.sampleRate — 96000 live, 48000 in the offline WAV export
 * @returns {{lpHz:number, lpQ:number, hpHz:number, hpQ:number}}
 */
export function djFilterCurve(f, reso, sampleRate) {
  // A biquad whose cutoff approaches Nyquist goes unstable, so nothing may pass this.
  // It is what makes the knob sound identical live (96 kHz) and in the 48 kHz export.
  const ceiling = 0.45 * sampleRate;
  const open = Math.min(LP_OPEN, ceiling);
  const a = Math.abs(f);
  if (a <= DEAD) return { lpHz: open, lpQ: FLAT_Q, hpHz: HP_OPEN, hpQ: FLAT_Q };

  // Rescale the remaining travel so the sweep still starts from fully open after the dead zone.
  const t = (a - DEAD) / (1 - DEAD);
  const s = t * t * (3 - 2 * t); // smoothstep: resonance fades in instead of appearing at once
  const q = FLAT_Q + s * clamp(reso, 0, 1) * (MAX_Q_DB - FLAT_Q);

  return f < 0
    ? { lpHz: Math.min(open * Math.pow(LOW_FLOOR / open, t), ceiling), lpQ: q, hpHz: HP_OPEN, hpQ: FLAT_Q }
    : { lpHz: open, lpQ: FLAT_Q, hpHz: Math.min(HP_OPEN * Math.pow(HIGH_CEIL / HP_OPEN, t), ceiling), hpQ: q };
}
