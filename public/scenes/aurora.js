// AURORA — northern lights over a frozen lake.
//
// The curtains are lit by the spectrum itself: bass on the left, treble on the right, mirrored.
// Rays grow taller with the bass, a pulse races outward along the curtain on every beat, and the
// hue climbs the palette with height (green low, violet high, as real aurorae do). The lake
// mirrors everything with a wobble that follows the mids.
const frag = `
float mountains(float x) {
  return 0.10 + 0.09 * fbm(vec2(x * 1.1 + 3.0, 7.0)) + 0.05 * noise(vec2(x * 4.0, 2.0));
}

vec3 sky(vec2 p, float aspect) {
  vec3 col = mix(vec3(0.012, 0.02, 0.05), vec3(0.002, 0.003, 0.01), ss(0.0, 0.8, p.y));
  vec2 g = p * 70.0;
  vec2 c = floor(g);
  float h = hash21(c);
  vec2 f = fract(g) - 0.5 - (vec2(hash21(c + 1.1), hash21(c + 2.2)) - 0.5) * 0.8;
  col += vec3(0.85, 0.9, 1.0) * step(0.93, h) * (0.0015 / (dot(f, f) + 0.002)) * (0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0)) * (0.6 + uHigh);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float depth = 1.0 - fi * 0.25;
    float x = p.x * (0.7 + fi * 0.2) + fi * 2.0;
    float yc = 0.28 + fi * 0.14 + 0.07 * sin(x * 1.1 + uTime * 0.2 + fi) + 0.06 * fbm(vec2(x * 0.7 + uTime * 0.04, fi * 3.0));
    float above = p.y - yc;
    float ray = exp(-max(above, 0.0) * (3.5 - uBass * 1.2)) * ss(-0.015, 0.02, above);
    float fine = 0.55 + 0.45 * sin(x * 55.0 + fbm(vec2(x * 2.5, uTime * 0.12 + fi)) * 25.0);
    float mus = spec(fract(abs(p.x) / aspect * 0.85 + fi * 0.25 + uTime * 0.01));
    float dx = abs(p.x) - uBeatAge * 2.5;
    float ripple = exp(-uBeatAge * 2.0) * exp(-dx * dx * 3.0) * uPunch;
    float stretch = 0.35 + 0.85 * fbm(vec2(x * 0.45 - uTime * 0.05, fi * 5.0));       // bright and dark stretches drift along the curtain ("patch" is a reserved word in GLSL)
    float inten = ray * (0.35 + 0.65 * fine) * (0.15 + 1.5 * mus + ripple) * depth * stretch;
    col += pal(0.55 + clamp(above, 0.0, 0.5) * 0.9 + fi * 0.05) * inten * 0.45;
  }
  return col;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  p.x += sin(uTime * 0.07) * 0.15 + uBalance * 0.1;
  const float horizon = -0.25;
  float y = p.y - horizon;
  vec3 col;
  float mh = mountains(p.x);
  if (y >= 0.0) {
    col = sky(vec2(p.x, y), aspect);
    vec3 rock = vec3(0.006, 0.008, 0.014) + pal(0.6) * 0.04 * (1.0 - ss(0.0, 0.02, mh - y));   // snow on the ridge catches the glow
    col = mix(col, rock, step(y, mh));
  } else {
    float ry = -y;
    float wob = 0.008 * sin(p.x * 30.0 + uTime * 1.5) * (0.5 + uMid) + 0.006 * noise(vec2(p.x * 10.0, ry * 30.0 - uTime));
    vec2 rp = vec2(p.x + wob, ry + wob);
    vec3 refl = sky(rp, aspect);
    refl = mix(refl, vec3(0.006, 0.008, 0.014), step(rp.y, mountains(rp.x)));
    float ice = 0.5 + 0.5 * noise(vec2(p.x * 6.0, ry * 40.0));
    col = refl * (0.55 - 0.3 * ss(0.0, 0.6, ry)) * (0.85 + 0.3 * ice) + vec3(0.01, 0.015, 0.025) * ice;
    float crack = 1.0 - ss(0.0, 0.004, abs(fbm(vec2(p.x * 3.0, ry * 8.0)) - 0.5));
    col += vec3(0.05, 0.08, 0.12) * crack * 0.6;
  }
  col += pal(0.5) * 0.02 * exp(-abs(y) * 60.0);     // the shoreline
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'aurora',
  name: 'Aurora',
  group: 'Vibe',
  blurb: 'Northern lights over a frozen lake; curtains lit by the spectrum, beat ripples',
  tags: ['nature', 'night', 'calm', 'organic'],
  energy: 0.3,
  particles: 3,
  trails: 0.4,
  zoom: 1,
  spin: 0,
  frag,
};
