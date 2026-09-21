// JULIA — a Julia set that the music steers.
//
// The constant c walks round the edge of the Mandelbrot set's main cardioid, which is where Julia
// sets are most alive; the mids push it a little outside (the set shatters into dust) or let it
// fall back inside (it heals). The bands of escape time are lit by the spectrum — slow-escaping
// filaments take the treble, the fast outer rings take the bass — and an orbit trap the size of
// the bass glows inside the set. Beats punch the zoom.
const frag = `
void main() {
  vec2 p = rot(uTime * 0.03) * centered() * (1.32 - 0.10 * uBass - 0.06 * uBeat * uPunch);
  float th = uTime * 0.07 + uTravel * 0.012;
  vec2 cc = 0.5 * vec2(cos(th), sin(th)) - 0.25 * vec2(cos(2.0 * th), sin(2.0 * th));
  cc *= 1.0 + 0.03 * sin(uTime * 0.31) + 0.06 * (uMid - 0.3);

  vec2 z = p;
  float n = 0.0, r2 = 0.0, trap = 1e3;
  bool out_ = false;
  for (int i = 0; i < 80; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + cc;
    r2 = dot(z, z);
    trap = min(trap, abs(sqrt(r2) - (0.25 + 0.55 * uBass)));
    if (r2 > 256.0) { out_ = true; break; }
    n += 1.0;
  }

  vec3 col;
  if (out_) {
    float sm = n + 1.0 - log2(max(0.5 * log2(r2), 1e-4));               // smooth escape time: no banding
    float band = spec(clamp(sm / 46.0, 0.0, 1.0) * 0.85);
    float edge = exp(-abs(fract(sm * 0.5) - 0.5) * 9.0);
    col = pal(sm * 0.035 + uTime * 0.02) * (0.05 + 1.1 * band) * (0.04 + 0.96 * ss(1.5, 16.0, sm));
    col += pal(sm * 0.035 + 0.5) * edge * 0.07 * (0.4 + uHigh * 2.0) * ss(1.5, 8.0, sm);
  } else {
    col = pal(0.62) * 0.04 + pal(0.1 + uTime * 0.02) * exp(-trap * 9.0) * (0.35 + 1.1 * uBass);
  }
  col *= 1.0 + uBeat * 0.35 * uPunch;
  col *= 1.0 - 0.4 * ss(0.8, 1.9, length(centered()));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'julia',
  name: 'Julia',
  group: 'Lab',
  blurb: 'Julia fractal steered by the mids, shattering to dust and healing again',
  tags: ['abstract', 'science', 'organic'],
  energy: 0.6,
  particles: 0,
  trails: 0.3,
  zoom: 1,
  spin: 0,
  frag,
};
