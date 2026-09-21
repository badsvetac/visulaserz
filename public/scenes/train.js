// TRAIN — the window seat on a night train.
//
// The land outside slides past in layers (hills, a town, the telegraph line, trees by the track),
// all on the cruise clock, so the train runs faster when the music is louder. Every beat is a lamp
// by the track sweeping past the glass and across the compartment wall; the wires between the
// poles carry the waveform, the town's lights are the spectrum, and the carriage rocks with the bass.
const frag = `
float box(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

vec3 outside(vec2 p, float aspect, float scroll) {
  // sky, stars, a low moon
  vec3 col = mix(vec3(0.030, 0.035, 0.075), vec3(0.004, 0.005, 0.018), ss(-0.3, 0.8, p.y)) + pal(0.6) * 0.02;
  vec2 g = (p + vec2(scroll * 0.004, 0.0)) * 55.0;
  vec2 gc = floor(g);
  float sh = hash21(gc);
  vec2 sf = fract(g) - 0.5 - (vec2(hash21(gc + 1.1), hash21(gc + 2.2)) - 0.5) * 0.8;
  col += vec3(0.85, 0.9, 1.0) * step(0.94, sh) * (0.0012 / (dot(sf, sf) + 0.002)) * (0.35 + uHigh);
  vec2 mv = p - vec2(aspect * 0.35, 0.50);
  col += vec3(1.0, 0.96, 0.88) * (1.0 - ss(0.070, 0.075, length(mv))) + vec3(0.6, 0.65, 0.9) * 0.10 * exp(-length(mv) * 4.0);

  // far hills, then nearer ones with a town strung along their foot
  float h1 = -0.08 + 0.24 * fbm(vec2((p.x + scroll * 0.05) * 0.9, 3.0));
  if (p.y < h1) col = vec3(0.016, 0.020, 0.040);
  float x2 = p.x + scroll * 0.16;
  float h2 = -0.26 + 0.20 * fbm(vec2(x2 * 1.3, 9.0));
  if (p.y < h2) col = vec3(0.008, 0.010, 0.020);
  float cell = floor(x2 * 16.0);
  float hl = hash11(cell * 1.7 + 2.0);
  vec2 lv = vec2((fract(x2 * 16.0) - 0.5) / 16.0, p.y - (-0.30 + 0.05 * hash11(cell * 3.1)));
  col += mix(vec3(1.0, 0.8, 0.5), pal(hl), 0.35) * step(0.5, hl) * (0.000025 / (dot(lv, lv) + 0.000015)) * (0.2 + 1.5 * spec(hl * 0.8));

  // the fields by the line
  if (p.y < -0.46) col = vec3(0.005, 0.007, 0.010) * (0.7 + 0.6 * noise(vec2((p.x + scroll * 0.6) * 5.0, p.y * 30.0)));

  // telegraph poles, and wires that carry the waveform
  const float SPAN = 1.7;
  float xp = p.x + scroll;
  float px = mod(xp, SPAN) - SPAN * 0.5;                                // 0 at mid-span, ±SPAN/2 at a pole
  float pole = abs(abs(px) - SPAN * 0.5);
  float poleM = (1.0 - ss(0.010, 0.022, pole)) * step(p.y, 0.47);
  poleM = max(poleM, (1.0 - ss(0.0, 0.006, abs(p.y - 0.43) - 0.006)) * step(pole, 0.08));
  float sag = 1.0 - 4.0 * px * px / (SPAN * SPAN);                       // 1 at mid-span, 0 at the poles
  float wires = 1e3;
  for (int k = 0; k < 3; k++) {
    float yw = 0.43 - float(k) * 0.045 - (0.10 + 0.02 * float(k)) * sag + wave(fract(xp * 0.3 + float(k) * 0.31)) * 0.012 * sag;
    wires = min(wires, abs(p.y - yw));
  }
  col = mix(col, vec3(0.003, 0.004, 0.006), max(poleM, (1.0 - ss(0.0012, 0.0035, wires)) * 0.9));

  // trees right by the track whip past
  float xt = p.x + scroll * 1.8;
  float tid = floor(xt / 2.6);
  vec2 tv = vec2(mod(xt, 2.6) - 1.3, p.y + 0.10);
  float tree = length(tv * vec2(1.0, 0.75)) - 0.42 - 0.12 * noise(tv * 7.0 + tid * 5.0);
  col = mix(col, vec3(0.002, 0.004, 0.004), (1.0 - ss(0.0, 0.05, tree)) * step(0.45, hash11(tid * 2.3 + 1.0)));

  // the lamp that passes on every beat
  float lx = mix(aspect + 0.4, -aspect - 0.4, clamp(uBeatAge / 0.42, 0.0, 1.0));
  float dl = p.x - lx;
  col += vec3(1.0, 0.82, 0.55) * exp(-dl * dl * 5.0) * (1.0 - clamp(uBeatAge / 0.42, 0.0, 1.0)) * 0.55 * uPunch * (0.6 + 0.4 * ss(-0.6, 0.6, p.y));
  return col;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float scroll = uCruise * 0.9;
  vec2 rock = vec2(0.0, 0.006 * sin(uTime * 7.0) * (0.3 + uBass) + 0.010 * uBeat * uPunch * sin(uBeatAge * 40.0));

  vec2 wc = vec2(-aspect * 0.06, 0.08);
  vec2 wb = vec2(aspect * 0.80, 0.70);
  float win = box(p - wc, wb, 0.10);
  float pass = clamp(uBeatAge / 0.42, 0.0, 1.0);                          // 0 → 1 while the lamp crosses the window
  float sweep = exp(-(pass * 2.0 - 1.0) * (pass * 2.0 - 1.0) * 3.0) * (1.0 - pass) * uPunch;

  vec3 col;
  if (win < 0.0) {
    col = outside(p + rock, aspect, scroll);
    // the glass: a ghost of the compartment lamp and of the seat opposite
    vec2 rl = p - vec2(aspect * 0.42, 0.52);
    col += vec3(1.0, 0.85, 0.6) * (0.0016 / (dot(rl, rl) + 0.010)) * 0.22;
    col += vec3(0.10, 0.08, 0.07) * (1.0 - ss(0.0, 0.04, box(p - vec2(aspect * 0.50, -0.55), vec2(0.30, 0.34), 0.12))) * 0.35;
    col *= 0.85 + 0.15 * ss(0.0, 0.10, -win);                                // the pane darkens toward its gasket
  } else {
    // the compartment wall: warm lamp from the top right, the passing lamp washing over it
    vec3 wall = vec3(0.050, 0.040, 0.034) * (0.75 + 0.25 * noise(p * vec2(3.0, 90.0)));
    wall *= 0.45 + 0.9 * exp(-length(p - vec2(aspect * 0.9, 1.0)) * 0.8);
    wall += vec3(1.0, 0.8, 0.5) * 0.10 * sweep;
    // curtain gathered at the right
    float cx = p.x - aspect * 0.86;
    float folds = 0.5 + 0.5 * sin(p.x * 70.0 + sin(p.y * 3.0) * 1.5);
    vec3 curtain = (pal(0.62) * 0.10 + vec3(0.03)) * (0.35 + 0.65 * folds) * (0.6 + 0.8 * sweep);
    wall = mix(wall, curtain, step(0.0, cx) * step(-0.72, p.y));
    // the little table under the window
    float tbl = step(p.y, -0.74);
    wall = mix(wall, vec3(0.075, 0.055, 0.04) * (0.7 + 0.3 * noise(p * vec2(40.0, 4.0))) + vec3(0.25, 0.2, 0.15) * (1.0 - ss(0.0, 0.006, abs(p.y + 0.74))), tbl);
    col = wall;
    col = mix(col, vec3(0.006), 1.0 - ss(0.0, 0.035, win));                   // the rubber gasket round the glass
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'train',
  name: 'Train',
  group: 'Journey',
  blurb: 'Night train window: beat lamps sweep past, the wires carry the waveform',
  tags: ['vehicle', 'night', 'calm'],
  energy: 0.35,
  particles: 0,
  trails: 0.25,
  zoom: 1,
  spin: 0,
  frag,
};
