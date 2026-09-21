// GALAXY — a grand-design spiral, seen from a little above its plane.
//
// Radius is frequency: the bulge is the bass, the arms run out through the mids, and the thin
// outer disc is the treble, so a bass line makes the core throb while hi-hats sparkle on the rim.
// The arms are a logarithmic spiral and the disc turns faster near the middle, as real ones do.
// Pink star-forming knots along the arms flare with the highs, and each beat sends a density
// wave out through the disc.
const frag = `
void main() {
  vec2 p = centered() * (1.0 - uBeat * 0.02 * uPunch);
  p = rot(0.35) * p;
  vec2 q = vec2(p.x, p.y / 0.52);                                       // the disc is tilted away from us
  float r = length(q);
  float a = atan(q.y, q.x) + uTime * 0.035 / (r + 0.25);                 // differential rotation

  float armPhase = a - log(r + 0.04) * 3.1;
  float arm = pow(0.5 + 0.5 * cos(2.0 * armPhase), 3.0);
  float spur = pow(0.5 + 0.5 * cos(2.0 * armPhase + 2.1 + sin(r * 9.0)), 6.0) * 0.4;
  float disc = exp(-r * 2.6);
  float band = spec(clamp(r * 0.85, 0.0, 0.95));

  // dust lanes ride the inside edge of each arm
  vec2 dq = vec2(armPhase * 1.4, r * 8.0);
  float dust = ss(0.45, 0.8, fbm(dq + 3.0)) * pow(0.5 + 0.5 * cos(2.0 * armPhase + 0.9), 2.0);

  vec3 col = pal(0.60) * disc * (0.10 + (arm + spur) * (0.55 + 1.6 * band));
  col += pal(0.62) * disc * fbm(q * 9.0 + 7.0) * arm * 0.6;
  col *= 1.0 - 0.75 * dust * ss(0.06, 0.3, r);
  // the bulge: old, warm stars
  col += mix(vec3(1.0, 0.85, 0.6), pal(0.10), 0.4) * (exp(-r * r * 38.0) * (0.9 + 1.6 * uBass) + exp(-r * 9.0) * 0.35);

  // stars: denser along the arms, each twinkling with the band of its own radius
  vec2 g = q * 46.0;
  vec2 gc = floor(g);
  float sh = hash21(gc);
  vec2 sf = fract(g) - 0.5 - (vec2(hash21(gc + 1.1), hash21(gc + 2.2)) - 0.5) * 0.8;
  float dens = disc * (0.25 + arm) * 2.2;
  col += mix(vec3(1.0), pal(0.55 + sh), 0.4) * step(1.0 - clamp(dens, 0.0, 0.85), sh) * (0.0016 / (dot(sf, sf) + 0.002)) * (0.25 + 1.8 * band);

  // star-forming knots
  vec2 kg = vec2(armPhase * 2.2, r * 14.0);
  vec2 kc = floor(kg);
  float kh = hash21(kc + 40.0);
  vec2 kf = fract(kg) - 0.5;
  col += pal(0.90) * step(0.80, kh) * exp(-dot(kf, kf) * 22.0) * arm * disc * 3.0 * (0.4 + 2.2 * uHigh);

  // the wave each beat sends through the disc
  float dw = r - uBeatAge * 1.1;
  col += pal(0.6) * exp(-dw * dw * 70.0) * exp(-uBeatAge * 1.8) * disc * 2.2 * uPunch;

  // the deep field behind it
  vec2 g2 = p * 70.0;
  vec2 c2 = floor(g2);
  float h2 = hash21(c2 + 9.0);
  vec2 f2 = fract(g2) - 0.5;
  col += vec3(0.8, 0.85, 1.0) * step(0.965, h2) * (0.0010 / (dot(f2, f2) + 0.002)) * (0.3 + uHigh) * (1.0 - clamp(disc * 3.0, 0.0, 1.0));
  vec2 bg = (p - vec2(-1.05, 0.62)) * vec2(1.0, 2.4);
  col += pal(0.1) * exp(-dot(bg, bg) * 260.0) * 0.35;                    // someone else's galaxy, far away
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'galaxy',
  name: 'Galaxy',
  group: 'Journey',
  blurb: 'Spiral galaxy where bass throbs in the core and hi-hats sparkle on the rim',
  tags: ['space', 'science', 'organic'],
  energy: 0.45,
  particles: 3,
  trails: 0.4,
  zoom: 1,
  spin: 0,
  frag,
};
