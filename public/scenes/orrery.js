// ORRERY — a clockwork solar system.
//
// Eight planets on circular orbits, run by the travel clock at Kepler's rates (period ∝ r^1.5),
// so the inner ones race while the outer ones crawl. Each planet is a band: it swells and
// brightens with it, and the long trails draw its path. The sun is the bass, the asteroid belt
// twinkles with the treble, a comet swings through on a long ellipse with its tail blown away
// from the sun, and every beat sends a ripple out through the orbits. The disc is seen from a
// little above, so circles become ellipses.
const frag = `
const float TILT = 0.58;

vec2 toDisc(vec2 p) { return vec2(p.x, p.y / TILT); }

void main() {
  vec2 p = centered() * (1.0 + 0.02 * uBeat * uPunch);
  vec2 q = toDisc(p);
  float r = length(q);
  float a = atan(q.y, q.x);
  float T = uTravel * 0.25;
  vec3 col = vec3(0.0);

  // backdrop
  vec2 g = p * 60.0;
  vec2 gc = floor(g);
  float sh = hash21(gc);
  vec2 sf = fract(g) - 0.5 - (vec2(hash21(gc + 1.1), hash21(gc + 2.2)) - 0.5) * 0.8;
  col += vec3(0.8, 0.85, 1.0) * step(0.95, sh) * (0.0010 / (dot(sf, sf) + 0.002)) * (0.25 + uHigh);

  // the sun
  col += mix(vec3(1.0, 0.85, 0.55), pal(0.1), 0.35) * ((0.006 + 0.010 * uBass) / (dot(p, p) + 0.006) + (1.0 - ss(0.05, 0.055, length(p))) * 1.5);

  float ripple = uBeatAge * 1.1;
  for (int k = 0; k < 8; k++) {
    float fk = float(k);
    float rk = 0.17 + fk * 0.105 + (k > 3 ? 0.06 : 0.0);                 // a gap where the belt goes
    float band = spec(0.03 + fk / 7.0 * 0.78);
    // the orbit, brightened where the beat's ripple is passing
    float ring = 1.0 - ss(0.0, 0.0035, abs(r - rk) * TILT);
    col += pal(0.55) * ring * (0.07 + 0.5 * exp(-abs(rk - ripple) * 14.0) * exp(-uBeatAge * 1.6) * uPunch);
    // the planet
    float th = T * 6.0 / (rk * sqrt(rk) * 8.0) + fk * 2.4;
    vec2 pc = rk * vec2(cos(th), sin(th)) * vec2(1.0, TILT);
    float pr = (0.012 + 0.006 * hash11(fk * 3.1 + 1.0) + (k == 4 ? 0.012 : 0.0)) * (1.0 + 0.9 * band);
    vec2 pv = p - pc;
    float disc = 1.0 - ss(pr - 0.003, pr, length(pv));
    vec3 tint = pal(fk / 8.0 * 0.85 + 0.05);
    float lit = 0.35 + 0.65 * ss(-pr, pr, dot(pv, -normalize(pc + 1e-5)));  // the day side faces the sun
    col = mix(col, tint * lit * (0.6 + 1.2 * band), disc);
    col += tint * (0.00012 / (dot(pv, pv) + 0.0002)) * (0.2 + 1.2 * band);
    if (k == 5) {                                                           // the ringed one
      vec2 rv = pv * vec2(1.0, 2.6);
      float rr = length(rv);
      col += tint * ss(pr * 1.35, pr * 1.45, rr) * (1.0 - ss(pr * 2.1, pr * 2.2, rr)) * 0.5 * (1.0 - disc);
    }
    if (k == 2 || k == 4) {                                                 // moons
      float ma = T * 9.0 + fk;
      vec2 mv = pv - (pr + 0.022) * vec2(cos(ma), sin(ma) * TILT);
      col += vec3(0.85, 0.85, 0.9) * (0.000025 / (dot(mv, mv) + 0.00002));
    }
  }

  // asteroid belt
  float br = (r - 0.565) / 0.035;
  vec2 bg = vec2(a * 60.0 + T * 3.0, r * 160.0);
  float rock = step(0.72, hash21(floor(bg))) * exp(-br * br * 2.0);
  col += vec3(0.8, 0.75, 0.65) * rock * (0.10 + 1.2 * uHigh) * (0.5 + 0.5 * hash21(floor(bg) + 5.0));

  // the comet
  float ca = T * 0.8;
  float cr = 0.42 / (1.0 + 0.72 * cos(ca));                                 // an ellipse with the sun at one focus
  vec2 cp = cr * vec2(cos(ca + 0.6), sin(ca + 0.6)) * vec2(1.0, TILT);
  vec2 cv = p - cp;
  vec2 away = normalize(cp + 1e-5);
  float along = dot(cv, away);
  float across = length(cv - away * along);
  float nearSun = ss(1.1, 0.35, cr);                                        // a comet only grows its tail close to the sun
  float tailLen = 0.04 + 0.22 * nearSun;
  col += vec3(0.75, 0.9, 1.0) * exp(-across * across / (0.00006 + along * 0.0015)) * step(0.0, along) * exp(-along / tailLen) * 0.35 * nearSun;
  col += vec3(1.0) * (0.00006 / (dot(cv, cv) + 0.00004));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'orrery',
  name: 'Orrery',
  group: 'Journey',
  blurb: 'Clockwork solar system: each planet is a band, the sun is the bass',
  tags: ['space', 'science', 'calm'],
  energy: 0.35,
  particles: 0,
  trails: 0.965,
  zoom: 1,
  spin: 0,
  frag,
};
