// PULSAR — stacked ridgelines, after the famous plot of pulsar CP 1919.
//
// Every line is one moment of the spectrogram history: the front line is now, the back line is a
// few seconds ago, so a drum hit is born at the front and rolls away into the distance. Bass sits
// in the middle of each line, treble toward the edges. Lines are drawn front to back and each one
// hides whatever lies behind its body, which is what gives the stack its paper-cut depth.
const frag = `
float ridge(float xn, float fi, float age) {
  float f = abs(xn);
  float env = exp(-pow(f * 1.75, 4.0));                                   // the pulse lives in the middle; the edges stay flat
  float s = hist(0.015 + f * 0.62, age);
  float fine = 0.55 + 0.9 * noise(vec2(xn * 26.0 + fi * 9.7, fi * 3.1 + uTime * 0.35));
  float hiss = (noise(vec2(xn * 90.0, fi * 5.3 + uTime * 0.8)) - 0.5) * 0.012 * (0.3 + uHigh);   // receiver noise on the flat parts
  return s * s * 0.42 * env * fine + hiss;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  p.x -= uBalance * 0.05;
  p *= 1.0 - uBeat * 0.02 * uPunch;
  float px = 2.0 / uRes.y;
  float W = min(aspect * 0.80, 1.30);

  vec3 col = pal(0.6) * 0.035 * exp(-length(p * vec2(0.7, 1.0)) * 1.3) * (0.4 + uLevel);
  float covered = 0.0;
  const int N = 44;
  for (int i = 0; i < N; i++) {
    float fi = float(i) / float(N - 1);                 // 0 = front (now) … 1 = back (oldest)
    float depth = 1.0 / (1.0 + fi * 0.9);               // gentle perspective: far lines are narrower and closer together
    float base = -0.80 + 1.42 * (1.0 - depth) / (1.0 - 1.0 / 1.9);
    float xn = p.x / (W * depth);
    float inX = 1.0 - ss(0.94, 1.0, abs(xn));
    float h = ridge(xn, float(i), fi * 0.62) * depth;
    float yi = base + h;
    float slope = dFdx(h) / px;
    float d = p.y - yi;
    float th = px * (1.1 + 1.3 * depth);
    float stroke = (1.0 - ss(th * 0.35, th * 1.5, abs(d) / sqrt(1.0 + slope * slope))) * inX;
    vec3 lc = mix(vec3(0.93), pal(0.55 + fi * 0.5 + uTime * 0.01), 0.55) * (1.2 - 0.8 * fi);
    lc *= 1.0 + uBeat * uPunch * 1.4 * exp(-fi * 5.0);  // the newest lines flash with the hit that made them
    col += lc * stroke * (1.0 - covered);
    covered = max(covered, ss(px, -px, d) * step(abs(xn), 1.0));
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'pulsar',
  name: 'Pulsar',
  group: 'Show',
  blurb: 'Stacked ridgelines; each drum hit rises in front and rolls into the distance',
  tags: ['analyser', 'science', 'retro', 'geometric'],
  energy: 0.4,
  particles: 0,
  trails: 0.15,
  zoom: 1,
  spin: 0,
  frag,
};
