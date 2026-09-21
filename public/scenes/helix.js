// HELIX — a strand of DNA under the microscope.
//
// The double helix lies across the screen and its base pairs are the spectrum: bass at the left
// end, treble at the right, each rung glowing with its band in the two colours of its pair. The
// molecule turns on the travel clock, the strand in front is drawn over the one behind, and a
// pulse of light runs along it from every beat.
const frag = `
void main() {
  vec2 p = rot(-0.22) * centered();
  float aspect = uRes.x / uRes.y;
  p *= 1.0 - uBeat * 0.02 * uPunch;
  float A = 0.40 * (1.0 + 0.10 * uBass);
  const float K = 3.4;
  float turn = uTravel * 0.30;
  float th = p.x * K + turn;

  // out-of-focus cells drifting behind the molecule
  vec3 col = pal(0.62) * 0.035 + pal(0.55) * 0.06 * ss(0.45, 0.9, fbm(p * 1.4 + vec2(uTime * 0.02, 0.0))) * (0.5 + uLevel);

  float pulse = exp(-abs(p.x - (-aspect * 1.1 + uBeatAge * 3.4)) * 2.2) * exp(-uBeatAge * 1.3) * uPunch;

  // base pairs: one rung per band, brightest when it faces us
  const float RUNGS = 40.0;
  float span = aspect * 2.3;
  float ri = floor((p.x / span + 0.5) * RUNGS);
  float rx = ((ri + 0.5) / RUNGS - 0.5) * span;
  float rth = rx * K + turn;
  float ry = A * sin(rth);
  float rdepth = cos(rth);
  float band = spec(0.02 + clamp(ri / (RUNGS - 1.0), 0.0, 1.0) * 0.85);
  float onRung = (1.0 - ss(0.004, 0.011, abs(p.x - rx))) * step(abs(p.y), abs(ry));
  float side = step(0.0, p.y * sign(ry));
  float pair = hash11(ri * 3.7 + 1.0);
  vec3 c1 = pal(0.08 + 0.5 * step(0.5, pair)), c2 = pal(0.40 + 0.5 * step(0.5, pair));
  col += mix(c1, c2, side) * onRung * (0.10 + 1.9 * band + 1.2 * pulse) * (0.45 + 0.55 * abs(rdepth));
  col += vec3(1.0) * onRung * (1.0 - ss(0.0, 0.02, abs(p.y))) * 0.25 * band;       // the hydrogen bond in the middle

  // the two backbones, back one first
  for (int k = 0; k < 2; k++) {
    float front = float(k);
    for (int s = 0; s < 2; s++) {
      float sgn = s == 0 ? 1.0 : -1.0;
      float depth = sgn * cos(th);                                      // > 0: this strand is in front here
      if ((depth > 0.0) != (front > 0.5)) continue;
      float y = sgn * A * sin(th);
      float slope = A * K * cos(th);
      float d = abs(p.y - y) / sqrt(1.0 + slope * slope);
      float wd = 0.020 + 0.012 * depth;
      float body = 1.0 - ss(wd - 0.004, wd, d);
      vec3 sc = pal(0.58 + 0.08 * sgn) * (0.30 + 0.45 * (depth * 0.5 + 0.5) + 0.8 * pulse);
      sc += vec3(1.0) * (1.0 - ss(0.0, wd * 0.45, d)) * 0.25 * (depth * 0.5 + 0.5);   // a highlight down the tube
      col = mix(col, sc, body);
      col += pal(0.58) * (0.003 / (d + 0.01)) * (0.3 + uLevel) * (0.5 + 0.5 * depth);
      // sugar beads where each rung meets the backbone
      vec2 bv = p - vec2(rx, sgn * ry);
      float br = 0.030 + 0.012 * sgn * rdepth;
      float bead = 1.0 - ss(br - 0.004, br, length(bv));
      if ((sgn * rdepth > 0.0) == (front > 0.5)) {
        col = mix(col, mix(c1, c2, step(0.0, sgn * sign(ry) * 1.0)) * (0.35 + 1.4 * band + pulse) + vec3(1.0) * ss(br, 0.0, length(bv + br * 0.3)) * 0.2, bead);
      }
    }
  }
  col *= 1.0 - 0.4 * ss(0.8, 1.9, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'helix',
  name: 'Helix',
  group: 'Lab',
  blurb: 'Turning DNA strand whose base pairs are the spectrum; beats send light along it',
  tags: ['science', 'organic', 'analyser'],
  energy: 0.45,
  particles: 3,
  trails: 0.35,
  zoom: 1,
  spin: 0,
  frag,
};
