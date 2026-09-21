const frag = `
void main() {
  vec2 p = centered();
  p *= 1.0 - uBeat * 0.06 * uPunch;
  float r0 = length(p);
  float seg = TAU / 6.0;
  float a = mod(atan(p.y, p.x) + uTime * 0.04, seg);
  a = abs(a - seg * 0.5);
  p = r0 * vec2(cos(a), sin(a));
  p *= 1.25 + 0.25 * sin(uTime * 0.11);
  vec2 c = vec2(0.52 + 0.14 * sin(uTime * 0.17) + uBass * 0.10, 0.36 + 0.10 * cos(uTime * 0.13) + uMid * 0.08);
  float scale = 1.0;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    p = abs(p) - c;
    p = rot(0.62 + uTime * 0.021 + uHigh * 0.08) * p;
    p *= 1.32;
    scale *= 1.32;
    float d = min(abs(p.x), abs(p.y)) / scale;
    float fi = float(i) / 6.0;
    float s = slow(fi * 0.7 + 0.03);
    col += pal(fi * 0.5 + r0 * 0.35 + uTime * 0.02) * (0.0032 * (0.35 + 2.6 * s)) / (d + 0.0025);
  }
  col *= exp(-r0 * 0.55) * (0.55 + 0.6 * uLevel + uBeat * 0.3 * uPunch);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'kaleido',
  name: 'Kaleido',
  group: 'Show',
  blurb: 'Six-fold fractal of neon lines that bends with bass and pulses on beats',
  tags: ['abstract', 'geometric'],
  energy: 0.6,
  particles: 0,
  trails: 0.6,
  zoom: 1.01,
  spin: -0.003,
  frag,
};
