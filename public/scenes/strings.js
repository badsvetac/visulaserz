// STRINGS — the inside of an instrument.
//
// Twenty-four strings, one band each, bass at the left. A string that moves too fast to follow
// is seen as a blur, and the blur has a shape: a point swinging sinusoidally spends most of its
// time near the ends of its swing, so the smear is brightest at its edges (density 1/π√(A²−x²)).
// That envelope is drawn here, standing-wave nodes and all — each string rings in its first,
// second, third or fourth mode — with the instantaneous string as a thin line inside it.
const frag = `
void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  const float N = 24.0;
  float span = aspect * 0.92;
  const float TOP = 0.80, BOT = -0.80;

  // the soundboard
  vec3 col = vec3(0.030, 0.018, 0.010) * (0.7 + 0.5 * noise(vec2(p.x * 2.0, p.y * 70.0))) + pal(0.08) * 0.015;
  col *= 0.6 + 0.6 * exp(-length(p * vec2(0.6, 1.0)) * 1.2);
  float hole = length(p - vec2(0.0, -0.05));
  col = mix(col, vec3(0.004), 1.0 - ss(0.30, 0.31, hole));
  col += pal(0.1) * (1.0 - ss(0.0, 0.006, abs(hole - 0.335))) * 0.12 + pal(0.1) * (1.0 - ss(0.0, 0.004, abs(hole - 0.36))) * 0.08;

  float cell = (p.x / span * 0.5 + 0.5) * N;
  float yy = clamp((p.y - BOT) / (TOP - BOT), 0.0, 1.0);
  for (int k = -1; k <= 1; k++) {                                        // a wide swing can reach into the next string's lane
    float i = floor(cell) + float(k);
    if (i < 0.0 || i >= N) continue;
    float x0 = ((i + 0.5) / N * 2.0 - 1.0) * span;
    float band = spec(0.02 + i / (N - 1.0) * 0.85);
    float mode = 1.0 + mod(i, 4.0);
    float shape = sin(mode * PI * yy);                                    // the standing wave: nodes where this is zero
    float amp = (0.004 + 0.060 * band * band) * (1.0 - 0.5 * i / N);
    float env = abs(shape) * amp;
    float dx = p.x - x0;
    float inY = step(BOT, p.y) * step(p.y, TOP);
    vec3 tint = mix(vec3(0.95, 0.85, 0.6), pal(i / N * 0.8 + 0.05), 0.55);
    // the blur: arcsine-distributed, clipped so the edge singularity stays finite
    float inside = step(abs(dx), env);
    float dens = 1.0 / (PI * sqrt(max(env * env - dx * dx, env * 0.0025 + 1e-6)));
    col += tint * inside * dens * 0.0016 * (0.4 + 1.6 * band) * inY;
    // the string itself, this instant
    float now = shape * amp * sin(uTime * (30.0 + i * 3.0) + i);
    float w = 0.0012 + 0.0012 * (1.0 - i / N);
    col += mix(tint, vec3(1.0), 0.6) * (w / (abs(dx - now) + w)) * (0.30 + 0.9 * band) * inY;
    // a pluck of light runs down the string nearest the beat's choice
    float plucked = step(abs(i - floor(hash11(uBeatCount * 1.3) * N)), 0.5);
    col += tint * plucked * exp(-abs(dx - now) * 400.0) * exp(-abs(yy - uBeatAge * 1.8) * 9.0) * exp(-uBeatAge * 2.0) * 1.5 * uPunch * inY;
  }

  // nut and bridge
  float bars = min(abs(p.y - TOP), abs(p.y - BOT));
  col = mix(col, vec3(0.75, 0.70, 0.60) * (0.5 + 0.5 * ss(0.012, 0.0, bars)), (1.0 - ss(0.010, 0.014, bars)) * step(abs(p.x), span + 0.03));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'strings',
  name: 'Strings',
  group: 'Lab',
  blurb: 'Twenty-four strings blurred into standing waves, bass at the left',
  tags: ['analyser', 'science', 'abstract'],
  energy: 0.5,
  particles: 0,
  trails: 0.4,
  zoom: 1,
  spin: 0,
  frag,
};
