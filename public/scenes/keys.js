// KEYS — a player piano that writes down what it hears.
//
// Four octaves of keyboard along the bottom. Each key owns a slice of the spectrum, glows and dips
// when that slice is loud, and leaves a note on the roll above it: the roll is the spectrogram
// history, quantised to the keys, scrolling upward, so the last few seconds of the track hang over
// the keyboard as a piano roll. Notes are coloured by pitch class, so octaves match, and each beat
// sends a bar of light up the paper.
const frag = `
const float KB = -0.62;        // top edge of the keyboard
const float WHITES = 29.0;     // C to C, four octaves

// semitone (0 = the lowest C) under a horizontal position u in 0..1, and whether it is a black key
float semitoneAt(float u, float y, out float black, out float across) {
  float w = u * WHITES;
  float wi = floor(w);
  float fw = fract(w);
  float oct = floor(wi / 7.0), deg = mod(wi, 7.0);
  float semi = oct * 12.0 + (deg < 3.0 ? deg * 2.0 : deg * 2.0 - 1.0);            // C D E | F G A B
  black = 0.0;
  across = fw;
  // a black key sits over the boundary to the right of C, D, F, G, A and to the left of D, E, G, A, B
  bool rightHas = deg != 2.0 && deg != 6.0;
  bool leftHas = deg != 0.0 && deg != 3.0;
  if (y > 0.40) {
    if (fw > 0.68 && rightHas && wi < WHITES - 1.0) { black = 1.0; semi += 1.0; across = (fw - 0.68) / 0.64; }
    else if (fw < 0.32 && leftHas) { black = 1.0; semi -= 1.0; across = (fw + 0.32) / 0.64; }
  }
  return semi;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float u = p.x / (aspect * 0.96) * 0.5 + 0.5;
  vec3 col = pal(0.62) * 0.025;
  float inX = step(0.0, u) * step(u, 1.0);

  if (p.y < KB) {
    // the keyboard
    float ky = (p.y + 1.0) / (KB + 1.0);                                           // 0 at the front edge → 1 at the fallboard
    float black, across;
    float semi = semitoneAt(u, ky, black, across);
    float kx = 0.05 + semi / 48.0 * 0.78;
    float s = spec(kx);
    float press = ss(0.015, 0.06, s - 0.5 * (spec(kx - 0.024) + spec(kx + 0.024))) * ss(0.25, 0.45, s);
    vec3 tint = pal(mod(semi, 12.0) / 12.0);
    float gap = ss(0.0, 0.06, across) * (1.0 - ss(0.94, 1.0, across));
    vec3 key = black > 0.5 ? vec3(0.025) + vec3(0.10) * ss(0.2, 0.0, abs(across - 0.3)) : vec3(0.80, 0.78, 0.72) * (0.55 + 0.45 * ky);
    key *= 1.0 - 0.35 * press;                                                      // a pressed key tips away from the light
    key += tint * press * (black > 0.5 ? 0.9 : 0.55);
    col = key * gap * inX;
    col *= 0.35 + 0.65 * ss(0.0, 0.05, 1.0 - ky + (black > 0.5 ? 0.0 : 0.05));
  } else {
    // the roll
    float rollY = (p.y - KB) / (1.0 - KB);                                         // 0 at the keys → 1 at the top
    float black, across;
    float semi = semitoneAt(u, 1.0, black, across);
    float x = 0.05 + semi / 48.0 * 0.78;
    float age = rollY * 0.85;
    float h = hist(x, age);
    // a note is a peak: louder than the keys either side of it, not just loud
    const float DX = 0.78 / 48.0;
    float prominence = h - 0.5 * (hist(x - DX * 1.5, age) + hist(x + DX * 1.5, age));
    float note = ss(0.015, 0.05, prominence) * ss(0.25, 0.45, h) * ss(0.0, 0.12, across) * (1.0 - ss(0.88, 1.0, across));
    vec3 tint = pal(mod(semi, 12.0) / 12.0);
    col += tint * note * (0.35 + 1.2 * h) * (1.0 - 0.75 * rollY) * inX;
    // paper: a line per octave, a fainter one per key
    float semiLine = 1.0 - ss(0.0, 0.03, min(across, 1.0 - across));
    col += vec3(0.5, 0.55, 0.7) * 0.025 * semiLine * inX;
    float bar = exp(-abs(rollY - uBeatAge * 0.55) * 60.0) * exp(-uBeatAge * 1.8) * uPunch;
    col += pal(0.1) * bar * 0.5 * inX;
    col += tint * 0.6 * exp(-(p.y - KB) * 30.0) * note * inX;                     // the hammer's glow where the note is born
  }
  col += pal(0.35) * (1.0 - ss(0.0, 0.006, abs(p.y - KB))) * 0.35 * inX;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'keys',
  name: 'Keys',
  group: 'Lab',
  blurb: 'Player piano with keys lit by the spectrum and a piano roll scrolling up',
  tags: ['analyser', 'retro', 'geometric'],
  energy: 0.5,
  particles: 0,
  trails: 0.2,
  zoom: 1,
  spin: 0,
  frag,
};
