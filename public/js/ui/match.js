import { clamp } from '../util.js';

// ─────────────────────────────────────────────────────────────────────────────
// TODO(you): decide which scenes the market recommends for the music that is playing.
//
// The market's "Match" sort calls this once per card and shows the highest scores first.
// Return any number: bigger means "suits this track better". What you get:
//
//   scene.energy   0..1, how busy/flashy the scene is (0.1 koi pond … 0.9 laser rig)
//   scene.tags     e.g. ['space', '3d', 'calm']: see public/scenes/catalog.json for the full set
//   scene.group    'Show' | 'Journey' | 'Vibe' | 'Things' | 'Lab' | 'Custom'
//   scene.installed  true when it is already on your strip
//
//   music.energy     loudness right now, 0..1 (smoothed over ~2 s)
//   music.energyAvg  loudness over the last ~20 s: the steadier of the two
//   music.bpm        estimated tempo, or 0 when unknown
//   music.bass / music.high   0..1 band levels
//
// Trade-offs: matching on energy alone is predictable but keeps showing the same few scenes;
// boosting tags ('calm' under 90 BPM, 'intense' over 130) feels smarter but needs tuning by ear;
// pushing installed scenes down turns the list into a discovery feed, pushing them up turns it
// into "what should I switch to now". The version below is only the first idea.
// ─────────────────────────────────────────────────────────────────────────────
export function matchScore(scene, music) {
  const tempo = music.bpm ? clamp((music.bpm - 70) / 90, 0, 1) : 0.5;
  const wanted = 0.5 * tempo + 0.5 * clamp(music.energyAvg * 1.8, 0, 1);
  return 1 - Math.abs(scene.energy - wanted);
}
