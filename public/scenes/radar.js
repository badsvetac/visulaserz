// RADAR — a phosphor scope that paints the music.
//
// The sweep line is the spectrum laid along a radius (bass at the centre, treble at the rim), and
// the long trails are the phosphor, so one turn of the sweep leaves a polar spectrogram glowing
// behind it. The sweep turns on the travel clock (louder is faster), two dozen contacts flare as
// the beam crosses them, each on its own band, and every beat sends a sonar ring out from the
// middle.
const frag = `
void main() {
  vec2 p = centered();
  float r = length(p);
  float a = atan(p.y, p.x);
  const float RIM = 0.90;
  float sweepA = -uTravel * 0.9;                                          // clockwise, like the real thing
  float behind = mod(a - sweepA, TAU);                                    // angle the beam has travelled since it was here
  vec3 ph = pal(0.35);
  vec3 col = vec3(0.0);
  float inScope = 1.0 - ss(RIM - 0.004, RIM, r);

  // the beam: the spectrum along a radius, with a short analytic afterglow
  float beam = exp(-behind * 26.0) + exp(-(TAU - behind) * 200.0);
  float s = spec(0.02 + r / RIM * 0.85);
  col += mix(ph, vec3(1.0), 0.35) * beam * (0.25 + 2.4 * s) * inScope;
  col += ph * exp(-behind * 2.2) * 0.035 * inScope;

  // contacts
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float ca = hash11(fi * 1.7 + 1.0) * TAU + uTime * 0.01 * (hash11(fi * 9.1) - 0.5);
    float cr = (0.15 + 0.72 * hash11(fi * 3.3 + 2.0)) * RIM;
    float since = mod(ca - sweepA, TAU);
    float band = spec(0.03 + hash11(fi * 5.9 + 4.0) * 0.8);
    vec2 cv = p - cr * vec2(cos(ca), sin(ca));
    float sz = 0.00006 + 0.0004 * band;
    col += mix(ph, vec3(1.0), 0.5) * (sz / (dot(cv, cv) + sz * 0.6)) * exp(-since * 1.6) * (0.2 + 1.6 * band);
  }

  // sonar ring on the beat
  float dw = r - uBeatAge * 1.3;
  col += ph * exp(-dw * dw * 900.0) * exp(-uBeatAge * 2.0) * 1.2 * uPunch * inScope;

  // graticule: range rings, spokes every thirty degrees, bearing ticks on the bezel
  float rings = abs(fract(r / RIM * 4.0 + 0.5) - 0.5) / 4.0 * RIM;
  float spokes = abs(fract(a / TAU * 12.0 + 0.5) - 0.5) / 12.0 * TAU * r;
  col += ph * (1.0 - ss(0.0, 0.0028, min(rings, spokes))) * 0.16 * inScope * step(0.03, r);
  col += ph * (1.0 - ss(0.0, 0.004, abs(r - RIM))) * 0.6;
  float tick = ss(0.80, 0.94, abs(fract(a / TAU * 72.0) - 0.5) * 2.0);
  float major = ss(0.90, 0.97, abs(fract(a / TAU * 12.0) - 0.5) * 2.0);
  col += ph * tick * step(RIM + 0.012, r) * step(r, RIM + 0.035 + 0.025 * major) * 0.5;
  col += ph * 0.5 * (1.0 - ss(0.0, 0.012, r));

  col += ph * 0.015 * inScope * (0.6 + 0.4 * hash21(floor(p * uRes.y * 0.5) + floor(uTime * 30.0)));   // tube noise
  col *= 0.9 + 0.1 * sin(p.y * uRes.y * 1.2);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'radar',
  name: 'Radar',
  group: 'Lab',
  blurb: 'Phosphor scope sweep paints a polar spectrogram; beats ping sonar rings',
  tags: ['retro', 'analyser', 'science', 'geometric'],
  energy: 0.5,
  particles: 0,
  trails: 0.985,
  zoom: 1,
  spin: 0,
  frag,
};
