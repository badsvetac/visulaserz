// CHLADNI — sand on a vibrating plate, the oldest music visualiser there is (1787).
//
// A free square plate driven at a resonance stands still along its nodal lines,
//   cos(nπx)·cos(mπy) ± cos(mπx)·cos(nπy) = 0,
// and sand bounces off everywhere else until it settles there. Every fourth beat the plate jumps
// to another mode (n, m) and the sand flows into the new figure; louder music packs the lines
// tighter, quiet music lets them relax, and each beat kicks the grains into the air for a moment.
const frag = `
float figure(vec2 q, float n, float m, float b) {
  return cos(n * PI * q.x) * cos(m * PI * q.y) + b * cos(m * PI * q.x) * cos(n * PI * q.y);
}
float modeFigure(vec2 q, float k) {
  float n = 1.0 + floor(hash11(k * 1.31 + 0.7) * 6.0);
  float m = 1.0 + floor(hash11(k * 2.17 + 4.2) * 6.0);
  if (abs(n - m) < 0.5) m += 2.0;                          // n = m with a minus sign would be an empty plate
  float b = (hash11(k * 3.7 + 1.1) < 0.5 ? -1.0 : 1.0) * (0.78 + 0.22 * sin(uTime * 0.2 + k));
  return figure(q, n, m, b);
}

void main() {
  vec2 p = centered() * (1.0 + uBeat * 0.012 * uPunch);
  const float S = 0.86;
  vec2 q = p / S;
  float box = max(abs(q.x), abs(q.y));

  float k = floor(uBeatCount / 4.0);
  float blend = mod(uBeatCount, 4.0) < 0.5 ? ss(0.0, 0.9, uBeatAge) : 1.0;
  float f = mix(modeFigure(q, k - 1.0), modeFigure(q, k), blend);

  float w = mix(0.24, 0.075, clamp(uLevel * 1.5, 0.0, 1.0)) + (1.0 - blend) * 0.3;
  float dens = exp(-f * f / (w * w));

  // grains: a fixed lattice of candidates, each present where the sand is dense enough
  float cells = uRes.y / 5.0;
  vec2 gc = floor(p * cells);
  float agit = clamp(uBeat * uPunch * 0.8 + (1.0 - blend), 0.0, 1.0);
  float reseed = floor(uTime * 14.0) * step(hash21(gc + 9.1), agit * 0.75);     // kicked grains land somewhere new
  float h = hash21(gc + reseed * 1.618);
  float grain = step(h, dens * 0.92 + 0.02) * (0.55 + 0.45 * hash21(gc + 3.3));

  vec3 plate = vec3(0.022, 0.024, 0.030) + 0.012 * noise(vec2(p.x * 3.0, p.y * 190.0));        // brushed steel
  plate += pal(0.55) * 0.05 * ss(-1.0, 1.0, dot(q, normalize(vec2(-0.6, 0.8))));
  plate += pal(0.62) * abs(f) * (0.012 + 0.07 * uBass) * (0.6 + 0.4 * sin(uTime * 50.0 + f * 8.0));   // the antinodes shiver
  vec3 sand = mix(vec3(0.96, 0.91, 0.80), pal(0.10 + 0.25 * dens), 0.35);
  vec3 col = plate + sand * grain * (0.7 + 0.6 * uLevel) + sand * dens * 0.05;

  // the driver under the middle of the plate
  float rc = length(p);
  col += pal(0.1) * (0.004 / (abs(rc - 0.03) + 0.004)) * (0.15 + uBass * 0.9);

  float inside = 1.0 - ss(1.0, 1.0 + 3.0 / (uRes.y * S), box);
  vec3 table = pal(0.6) * 0.03 * exp(-rc * 0.9) * (0.5 + uLevel) * ss(1.0, 1.25, box);      // soft shadow around the plate
  col = mix(table, col, inside);
  col += (pal(0.5) * 0.35 + 0.1) * (1.0 - ss(0.0, 0.008, abs(box - 1.0)));                  // the bevelled edge
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'chladni',
  name: 'Chladni',
  group: 'Lab',
  blurb: 'Sand on a vibrating plate; beats kick the grains into new nodal figures',
  tags: ['science', 'geometric', 'abstract'],
  energy: 0.45,
  particles: 0,
  trails: 0.5,
  zoom: 1,
  spin: 0,
  frag,
};
