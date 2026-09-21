// Every sound control on the rack is described here once. The knobs, the presets,
// the live engine and the offline WAV export all read from this single table.
const pct = (v) => `${Math.round(v * 100)}%`;
const dB = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;

export const FX_PARAMS = {
  speed:        { label: 'Speed',   group: 'Varispeed', min: 0.5,  max: 1.5,  def: 1,    origin: 1, fmt: (v) => `${v.toFixed(2)}×` },
  reverbMix:    { label: 'Mix',     group: 'Reverb',    min: 0,    max: 1,    def: 0,    fmt: pct },
  reverbSize:   { label: 'Size',    group: 'Reverb',    min: 0.4,  max: 9,    def: 3.2,  curve: 1.8, fmt: (v) => `${v.toFixed(1)} s` },
  reverbTone:   { label: 'Tone',    group: 'Reverb',    min: 0,    max: 1,    def: 0.55, fmt: (v) => (v < 0.34 ? 'dark' : v > 0.66 ? 'bright' : 'warm') },
  echoMix:      { label: 'Mix',     group: 'Echo',      min: 0,    max: 1,    def: 0,    fmt: pct },
  echoTime:     { label: 'Time',    group: 'Echo',      min: 0.05, max: 1.2,  def: 0.38, curve: 1.6, fmt: (v) => `${Math.round(v * 1000)} ms` },
  echoFeedback: { label: 'Repeat',  group: 'Echo',      min: 0,    max: 0.85, def: 0.4,  fmt: (v) => pct(v / 0.85) },
  bass:         { label: 'Bass',    group: 'Tone',      min: -12,  max: 18,   def: 0,    origin: 0, fmt: dB },
  treble:       { label: 'Treble',  group: 'Tone',      min: -18,  max: 12,   def: 0,    origin: 0, fmt: dB },
  muffle:       { label: 'Muffle',  group: 'Tone',      min: 0,    max: 1,    def: 0,    fmt: pct },
  orbit:        { label: 'Orbit',   group: '8D',        min: 0,    max: 1,    def: 0,    fmt: pct },
  orbitRate:    { label: 'Rate',    group: '8D',        min: 0.03, max: 1.2,  def: 0.12, curve: 2, fmt: (v) => `${v.toFixed(2)} Hz` },
  drive:        { label: 'Drive',   group: 'Dirt',      min: 0,    max: 1,    def: 0,    fmt: pct },
  crackle:      { label: 'Crackle', group: 'Dirt',      min: 0,    max: 1,    def: 0,    fmt: pct },
  ambience:     { label: 'Level',   group: 'Ambience',  min: 0,    max: 1,    def: 0.35, fmt: pct },
};

export const FX_GROUPS = ['Varispeed', 'Reverb', 'Echo', 'Tone', '8D', 'Dirt', 'Ambience'];

export function defaultFx() {
  const out = { pitchLock: false };
  for (const [id, p] of Object.entries(FX_PARAMS)) out[id] = p.def;
  return out;
}

// A preset only lists what it changes; everything else returns to default.
export const FX_PRESETS = [
  { id: 'original',   name: 'Original',        values: {} },
  { id: 'slowed',     name: 'Slowed + Reverb', values: { speed: 0.82, reverbMix: 0.42, reverbSize: 4.6, reverbTone: 0.45, bass: 3, treble: -2 } },
  { id: 'vapor',      name: 'Vaporwave',       values: { speed: 0.72, reverbMix: 0.5, reverbSize: 6.5, reverbTone: 0.5, echoMix: 0.22, echoTime: 0.45, echoFeedback: 0.45, bass: 2 } },
  { id: 'nightcore',  name: 'Nightcore',       values: { speed: 1.25, treble: 2, reverbMix: 0.08, reverbSize: 1.2 } },
  { id: 'underwater', name: 'Underwater',      values: { speed: 0.95, muffle: 0.78, reverbMix: 0.35, reverbSize: 3, reverbTone: 0.2 } },
  { id: 'hall8d',     name: '8D Hall',         values: { orbit: 0.9, orbitRate: 0.11, reverbMix: 0.3, reverbSize: 3.8, reverbTone: 0.6 } },
  { id: 'lofi',       name: 'Lo-fi Tape',      values: { speed: 0.94, muffle: 0.45, drive: 0.35, crackle: 0.5, bass: 4, treble: -6, reverbMix: 0.12, reverbSize: 1.5 } },
  { id: 'bassboost',  name: 'Bass Boost',      values: { bass: 12, drive: 0.15 } },
];

export const presetValues = (preset) => ({ ...defaultFx(), ...preset.values });
