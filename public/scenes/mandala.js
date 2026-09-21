// MANDALA — seven rings of petals that open with the music.
//
// Each ring belongs to a band, bass at the heart and treble at the rim, and its petals grow as
// long as the band is loud, so the flower is a radial analyser that happens to be symmetrical.
// Alternate rings turn opposite ways on the travel clock, the seed in the middle is the bass, the
// beads round the edge are the treble, and the whole figure breathes out on a beat.
const frag = `
void main() {
  vec2 p = centered() * (1.0 + 0.04 * uBeat * uPunch);
  float r = length(p);
  float a = atan(p.y, p.x);
  vec3 col = pal(0.62) * 0.03 * exp(-r * 1.2);

  // fine rays behind everything
  float rays = abs(sin(a * 36.0));
  col += pal(0.55) * 0.02 * rays * rays * rays * ss(0.1, 0.5, r) * (1.0 - ss(0.9, 1.1, r)) * (0.5 + uLevel);

  for (int k = 6; k >= 0; k--) {                                        // outer rings first, so inner petals overlap them
    float fk = float(k);
    float band = slow(0.03 + fk / 6.0 * 0.75) * 0.6 + spec(0.03 + fk / 6.0 * 0.75) * 0.4;
    float rk = 0.10 + fk * 0.115;
    float m = 6.0 + fk * 2.0;
    float turn = (mod(fk, 2.0) < 0.5 ? 1.0 : -1.0) * uTravel * 0.03 * (1.0 + 0.2 * fk) + fk * 0.4;
    float cell = TAU / m;
    float pa = (fract((a + turn) / cell) - 0.5) * cell;                 // angle from this petal's axis
    float len = 0.055 + 0.17 * band;
    float y = (r - rk) / len;                                           // 0 at the petal's root → 1 at its tip
    float x = pa * r;
    float c = cos(clamp(y, 0.0, 1.0) * PI * 0.5);
    float halfW = (0.30 * cell * rk + 0.010) * sqrt(max(c, 0.0)) * ss(0.0, 0.12, y);
    float inside = step(0.0, y) * step(y, 1.0) * (1.0 - ss(halfW - 0.004, halfW, abs(x)));
    vec3 tint = pal(fk / 7.0 * 0.8 + 0.05 + uTime * 0.01);
    vec3 petal = tint * (0.16 + 0.85 * band) * (0.45 + 0.55 * y) + tint * (1.0 - ss(0.0, 0.006, abs(x))) * 0.25;   // a vein down the middle
    col = mix(col, petal, inside);
    float rim = (1.0 - ss(0.0, 0.005, abs(abs(x) - halfW))) * step(0.0, y) * step(y, 1.0);
    col += mix(tint, vec3(1.0), 0.5) * rim * (0.25 + 1.1 * band);
    col += tint * (1.0 - ss(0.0, 0.003, abs(r - rk))) * 0.22;           // the ring the petals stand on
  }

  // the seed, and the beads on the rim
  float seed = 0.075 + 0.03 * uBass;
  col = mix(col, pal(0.1) * (0.5 + 1.4 * uBass) * (0.6 + 0.4 * cos(a * 12.0 + uTime) * ss(0.02, seed, r)), 1.0 - ss(seed - 0.004, seed, r));
  float bcell = TAU / 48.0;
  float ba = (fract(a / bcell) - 0.5) * bcell;
  vec2 bv = vec2(ba * 0.95, r - 0.95);
  float bs = spec(0.5 + abs(fract(a / TAU * 2.0) * 2.0 - 1.0) * 0.45);
  col += pal(0.9) * (0.00012 / (dot(bv, bv) + 0.00008)) * (0.12 + 1.6 * bs + uHigh);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'mandala',
  name: 'Mandala',
  group: 'Lab',
  blurb: 'Seven rings of petals that open with their bands and breathe on the beat',
  tags: ['geometric', 'analyser', 'calm'],
  energy: 0.4,
  particles: 3,
  trails: 0.45,
  zoom: 1,
  spin: 0,
  frag,
};
