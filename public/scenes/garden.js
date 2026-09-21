// GARDEN — raked gravel and five stones.
//
// The rake lines are contours of distance: rings round each stone that melt into straight furrows
// farther out, which is how a real karesansui is raked. The furrows carry the live waveform as a
// tiny tremor, the low sun swings with the travel clock so the ridges' shadows move, moss on the
// stones brightens with the mids, and a beat drops a maple leaf that lies where it falls until the
// next one.
const frag = `
float stoneField(vec2 q, out float nearest, out vec2 toStone) {
  float d = 1e3;
  nearest = 0.0;
  toStone = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 c = vec2((hash11(fi * 3.7 + 1.0) - 0.5) * 2.6, (hash11(fi * 5.1 + 2.0) - 0.5) * 1.3);
    float r = 0.10 + 0.10 * hash11(fi * 7.3 + 3.0);
    vec2 v = (q - c) * vec2(1.0, 1.25);
    float di = length(v) - r * (1.0 + 0.18 * noise(normalize(v + 1e-4) * 2.0 + fi * 5.0));
    if (di < d) { d = di; nearest = fi; toStone = v; }
  }
  return d;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float nearest;
  vec2 toStone;
  float d = stoneField(p, nearest, toStone);

  // rings near a stone, straight furrows far from one
  float ringW = ss(0.42, 0.20, d);
  float furrow = p.y + 0.03 * sin(p.x * 1.3) + wave(fract(p.x * 0.18 + 0.5)) * 0.004 * (0.5 + uLevel);
  float phase = mix(furrow, d, ringW) * 46.0;
  float ridge = sin(phase);
  // a low sun: each ridge is lit on one side and shaded on the other
  float sunA = 0.6 + 0.5 * sin(uTravel * 0.02);
  vec2 grad = normalize(mix(vec2(0.0, 1.0), normalize(toStone + 1e-4), ringW));
  float lit = cos(phase) * dot(grad, vec2(cos(sunA), sin(sunA)));
  vec3 gravel = vec3(0.34, 0.33, 0.30) * (0.80 + 0.20 * noise(p * 260.0)) * (0.85 + 0.15 * noise(p * 40.0));
  vec3 col = gravel * (0.62 + 0.10 * ridge + 0.30 * lit) * (0.55 + 0.35 * uLevel);
  col += pal(0.1) * 0.03 * (0.5 + 0.5 * lit);

  // stones, with their shadows and moss
  float shadow = ss(0.10, -0.02, stoneField(p - 0.07 * vec2(cos(sunA), sin(sunA)) * -1.0, nearest, toStone));
  d = stoneField(p, nearest, toStone);
  col *= 1.0 - 0.45 * shadow * step(0.0, d);
  if (d < 0.0) {
    float depth = clamp(-d / 0.12, 0.0, 1.0);
    vec3 n = normalize(vec3(normalize(toStone + 1e-4) * (1.0 - depth), 0.35 + depth));
    float sh = 0.30 + 0.70 * max(dot(n, normalize(vec3(cos(sunA), sin(sunA), 0.7))), 0.0);
    vec3 rock = vec3(0.16, 0.16, 0.17) * (0.7 + 0.5 * fbm(p * 9.0 + nearest * 3.0));
    float moss = ss(0.45, 0.70, fbm(p * 6.0 + nearest * 11.0)) * ss(0.2, 0.9, depth);
    rock = mix(rock, mix(vec3(0.10, 0.22, 0.07), pal(0.35), 0.25) * (0.7 + 1.0 * uMid), moss);
    col = rock * sh;
  }

  // the leaf the last beat dropped
  vec2 lc = (vec2(hash11(uBeatCount * 1.7 + 3.0), hash11(uBeatCount * 2.9 + 8.0)) - 0.5) * vec2(aspect, 1.0) * 1.5;
  float settle = 1.0 - exp(-uBeatAge * 4.0);
  vec2 lv = rot(hash11(uBeatCount) * TAU + (1.0 - settle) * 3.0) * (p - lc - vec2(0.0, (1.0 - settle) * 0.25)) / (0.085 * (1.6 - 0.6 * settle));
  float la = atan(lv.y, lv.x);
  float lobes = 0.55 + 0.45 * abs(cos(la * 2.5)) * (0.7 + 0.3 * cos(la * 5.0));
  float leaf = 1.0 - ss(lobes - 0.06, lobes, length(lv));
  col *= 1.0 - 0.3 * (1.0 - ss(lobes, lobes + 0.25, length(lv - vec2(0.10, -0.12)))) * settle * (1.0 - leaf);
  col = mix(col, mix(vec3(0.80, 0.16, 0.06), pal(0.04), 0.3) * (0.7 + 0.3 * cos(la * 5.0)) * (0.6 + 0.4 * uLevel), leaf);
  col *= 1.0 - 0.4 * ss(0.8, 1.9, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'garden',
  name: 'Garden',
  group: 'Vibe',
  blurb: 'Raked zen gravel and five stones; every beat drops a maple leaf',
  tags: ['nature', 'calm', 'organic'],
  energy: 0.1,
  particles: 0,
  trails: 0.1,
  zoom: 1,
  spin: 0,
  frag,
};
