// PAPERCUT — a landscape cut from seven sheets of coloured paper.
//
// Flat colour, hard edges, and one trick for depth: every sheet drops a soft shadow on the sheet
// behind it. Each ridge rises and falls with its own band (the far sheets take the treble, the
// near ones the bass), the sheets slide past each other on the cruise clock, the paper sun swells
// on the beat, and a few paper clouds drift through. The grain is the tooth of the paper.
const frag = `
float ridge(float x, float k, float t) {
  float sc = 0.7 + k * 0.35;
  float n = fbm(vec2(x * sc + t * (0.02 + 0.03 * k) + k * 9.0, k * 3.0));
  float n2 = noise(vec2(x * sc * 3.0 + t * (0.05 + 0.04 * k), k * 7.0));
  return n * 0.75 + n2 * 0.12;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float t = uCruise;

  // the sky sheet, the sun, and its halo cut from a lighter paper
  vec3 col = mix(pal(0.08) * 0.85 + 0.10, pal(0.62) * 0.5 + vec3(0.04, 0.05, 0.10), ss(-0.3, 0.9, p.y));
  vec2 sv = p - vec2(aspect * 0.28, 0.34);
  float sunR = 0.17 * (1.0 + 0.10 * uBeat * uPunch + 0.06 * uBass);
  col = mix(col, col * 1.18 + 0.04, 1.0 - ss(sunR * 1.75, sunR * 1.77, length(sv)));
  col *= 1.0 - 0.22 * ss(sunR + 0.05, sunR, length(sv - vec2(0.012, -0.016))) * step(sunR, length(sv));   // the sun's shadow on the sky
  col = mix(col, mix(vec3(1.0, 0.93, 0.78), pal(0.12), 0.35), 1.0 - ss(sunR - 0.002, sunR, length(sv)));

  // paper clouds
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 cc = vec2(mod(t * 0.01 * (1.0 + fi * 0.4) + fi * 0.37, 1.0) * aspect * 2.8 - aspect * 1.4, 0.55 + 0.12 * fi - 0.3 * fi * fi * 0.1);
    vec2 cv = (p - cc) / vec2(0.26, 0.06);
    float cl = length(vec2(cv.x, cv.y + 0.55 * cv.x * cv.x * sign(cv.y))) - 1.0 - 0.18 * sin(cv.x * 7.0 + fi);
    float cs = length(vec2(cv.x - 0.06, cv.y + 0.35)) - 1.0 - 0.18 * sin((cv.x - 0.06) * 7.0 + fi);
    col *= 1.0 - 0.18 * (1.0 - ss(-0.05, 0.12, cs)) * step(0.0, cl);
    col = mix(col, vec3(0.97, 0.95, 0.92), 1.0 - ss(-0.01, 0.01, cl));
  }

  // seven ridges, far to near
  for (int k = 0; k < 7; k++) {
    float fk = float(k);
    float band = slow(0.80 - fk / 6.0 * 0.75);                            // far sheets: treble; near sheets: bass
    float base = 0.18 - fk * 0.17;
    float edge = base + (0.20 + 0.10 * fk * 0.3) * ridge(p.x, fk, t) * (0.65 + 0.9 * band);
    float d = p.y - edge;
    col *= 1.0 - 0.35 * ss(0.075, 0.0, d) * step(0.0, d);                 // this sheet's shadow on whatever is behind it
    vec3 sheet = mix(pal(0.55 + fk * 0.055), vec3(0.02, 0.025, 0.05), 0.10 + fk * 0.11);
    sheet *= 0.92 + 0.08 * ss(0.0, -0.25, d);
    col = mix(col, sheet, 1.0 - ss(-0.0015, 0.0015, d));
  }
  col *= 0.93 + 0.07 * noise(p * vec2(190.0, 210.0)) + 0.03 * noise(p * 17.0);   // paper tooth and a little cockle
  col *= 0.75 + 0.20 * uLevel;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'papercut',
  name: 'Papercut',
  group: 'Vibe',
  blurb: 'Seven sheets of cut paper; every ridge rises and falls with its own band',
  tags: ['nature', 'artwork', 'calm'],
  energy: 0.3,
  particles: 0,
  trails: 0.1,
  zoom: 1,
  spin: 0,
  frag,
};
