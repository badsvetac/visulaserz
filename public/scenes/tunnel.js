const frag = `
void main() {
  vec2 p = centered();
  p *= 1.0 - uBeat * 0.07 * uPunch;
  p += 0.10 * vec2(sin(uTime * 0.31), cos(uTime * 0.23));
  p.x -= uBalance * 0.06;
  float r = max(length(p), 1e-3);
  float a = atan(p.y, p.x);
  float z = 0.4 / r;
  float tz = z + uTravel * 1.2;
  float tw = a + 0.5 * sin(tz * 0.18 + uTime * 0.07) + uTime * 0.04;

  const float SEG = 20.0;
  float u = tw / TAU * SEG;
  float v = tz * 1.2;
  vec2 id = vec2(mod(floor(u), SEG), floor(v));
  vec2 f = fract(vec2(u, v));
  float ai = abs(id.x / SEG * 2.0 - 1.0);
  float s = spec(ai * 0.85);
  float rnd = hash21(id);
  float lit = ss(rnd * 0.8, rnd * 0.8 + 0.12, s);
  float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float panel = ss(0.05, 0.14, edge);
  float line = 1.0 - ss(0.0, 0.045, edge);
  float fog = exp(-z * 0.2);
  vec3 c = pal(ai * 0.45 + id.y * 0.011 + uTime * 0.015);
  vec3 col = c * (lit * panel * 0.75 + line * (0.45 + uBass * 1.3)) * fog;

  // a ring of light rides down the tunnel after each beat
  float ring = exp(-abs(z - (0.6 + uBeatAge * 9.0)) * 1.2) * exp(-uBeatAge * 2.5);
  col += pal(0.7) * ring * 0.6 * uPunch * fog;
  col += pal(0.3 + uTime * 0.03) * (0.035 / (r + 0.05)) * (0.35 + uBass * 1.5);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'tunnel',
  name: 'Tunnel',
  group: 'Show',
  blurb: 'Panelled tunnel lit by the spectrum; a light ring races down on each beat',
  tags: ['3d', 'geometric', 'intense'],
  energy: 0.8,
  particles: 0,
  trails: 0.45,
  zoom: 1,
  spin: 0,
  frag,
};
