const frag = `
void main() {
  vec2 p = rot(uTime * 0.02) * centered() * 1.15;
  float t = uTime * 0.04 + uTravel * 0.05;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 w = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + 0.4 * t), fbm(p + 3.0 * q + vec2(8.3, 2.8) - 0.3 * t));
  float f = fbm(p + (1.8 + 2.2 * uBass) * w);
  float dens = ss(0.22, 0.8, f);
  vec3 col = pal(f * 0.9 + length(q) * 0.4 + uTime * 0.01) * dens * (0.4 + 1.0 * uLevel);
  col += pal(0.62) * pow(w.x, 3.0) * (0.3 + 1.2 * uMid);
  col += pal(0.12) * pow(q.y, 4.0) * 0.6;
  col += pal(0.9) * pow(f, 6.0) * 0.8 * (0.5 + uBass);        // hot cores where the cloud is densest
  col *= 0.5 + 0.5 * dens;                                     // keep thin gas dark so the trails have room

  vec2 cellP = p * 38.0;
  vec2 g = floor(cellP);
  float st = hash21(g);
  vec2 sp = fract(cellP) - 0.5 - (vec2(hash21(g + 3.1), hash21(g + 7.7)) - 0.5) * 0.6;
  float twinkle = 0.5 + 0.5 * sin(uTime * (2.0 + st * 6.0) + st * 40.0);
  col += vec3(1.0) * step(0.965, st) * (0.003 / (dot(sp, sp) + 0.004)) * twinkle * (0.15 + uHigh * 1.2) * (1.0 - dens * 0.7);

  col *= 1.0 + uBeat * 0.35 * uPunch;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'nebula',
  name: 'Nebula',
  group: 'Vibe',
  blurb: 'Slow folding gas clouds that churn with the bass under treble-lit stars',
  tags: ['space', 'abstract', 'organic', 'calm'],
  energy: 0.3,
  particles: 3,
  trails: 0.6,
  zoom: 1.008,
  spin: 0.001,
  frag,
};
