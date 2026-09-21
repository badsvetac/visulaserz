// ECLIPSE — totality.
//
// The corona is a circular analyser: round the black disc, each direction's streamer reaches as
// far as its band is loud (bass straight up, treble straight down, mirrored left and right), and
// the whole crown swells with the bass. Pink prominences on the limb flicker with the treble.
// Every beat the sun breaks through somewhere on the edge for an instant — the diamond ring —
// and a small crowd on the ridge watches under a sky with sunset all the way round.
const frag = `
const float R = 0.27;

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  vec2 c = vec2(0.0, 0.24);
  vec2 v = p - c;
  float r = length(v);
  float a = atan(v.y, v.x);
  vec2 e = v / max(r, 1e-4);

  // the sky of totality: night overhead, sunset on every horizon
  const float HY = -0.56;
  vec3 col = mix(mix(vec3(0.55, 0.25, 0.10), pal(0.05), 0.4) * 0.45, vec3(0.010, 0.014, 0.040), ss(HY, 0.55, p.y));
  vec2 g = p * 58.0;
  vec2 gc = floor(g);
  float sh = hash21(gc);
  vec2 sf = fract(g) - 0.5 - (vec2(hash21(gc + 1.1), hash21(gc + 2.2)) - 0.5) * 0.8;
  col += vec3(0.85, 0.9, 1.0) * step(0.95, sh) * (0.0012 / (dot(sf, sf) + 0.002)) * (0.3 + uHigh) * ss(-0.2, 0.5, p.y);
  vec2 pv = p - c - vec2(-0.62, -0.10);
  col += vec3(1.0, 0.95, 0.85) * (0.00005 / (dot(pv, pv) + 0.00004));                 // Venus comes out

  // corona
  float s = spec(0.02 + abs(fract(a / TAU + 0.25) * 2.0 - 1.0) * 0.8);
  float reach = (0.10 + 0.50 * s + 0.26 * fbm(e * 2.2 + 3.0 + uTime * 0.02)) * (1.0 + 0.5 * uBass);
  float x = max(r - R, 0.0) / reach;
  float fine = 0.55 + 0.45 * fbm(e * 7.0 + vec2(r * 2.0 - uTime * 0.05, 0.0));
  float brush = abs(sin(a * 38.0 + 3.0 * noise(e * 3.0)));
  brush = brush * brush * brush * brush * ss(0.55, 0.95, abs(e.y));                  // fine plumes over the poles
  float cor = (exp(-x * 3.0) * fine + brush * exp(-x * 5.0) * 0.5) * step(R, r);
  vec3 pearl = mix(vec3(0.95, 0.97, 1.0), pal(0.6), 0.28);
  col += pearl * cor * (0.75 + 0.9 * uBass + 0.6 * uBeat * uPunch);
  col += pearl * (0.004 / (abs(r - R * 1.012) + 0.004)) * 0.9 * step(R, r);          // the inner corona hugs the limb
  float prom = step(0.72, noise(vec2(a * 6.0, 1.0))) * exp(-max(r - R, 0.0) * 70.0) * step(R, r);
  col += mix(vec3(1.0, 0.25, 0.45), pal(0.92), 0.35) * prom * (0.6 + 2.5 * uHigh);

  // the moon, with a breath of earthshine
  col = mix(col, vec3(0.010, 0.011, 0.014) * (0.6 + 0.8 * noise(v * 26.0)), 1.0 - ss(R - 0.003, R, r));

  // the diamond ring
  float da = hash11(uBeatCount * 1.9 + 4.0) * TAU;
  vec2 dv = p - (c + R * vec2(cos(da), sin(da)));
  float flash = exp(-uBeatAge * 5.0) * uPunch;
  col += vec3(1.0, 0.98, 0.92) * flash * (0.0016 / (dot(dv, dv) + 0.0004) + exp(-abs(dv.y) * 90.0) * exp(-abs(dv.x) * 5.0) * 0.6 + exp(-abs(dv.x) * 90.0) * exp(-abs(dv.y) * 7.0) * 0.4);

  // the ridge, its pines, and the people who came to see
  float ridge = HY + 0.10 + 0.10 * fbm(vec2(p.x * 1.6, 3.0));
  float pa = p.x * 13.0;
  float pines = (0.03 + 0.06 * hash11(floor(pa))) * (1.0 - abs(fract(pa) - 0.5) * 2.0) * step(0.45, hash11(floor(pa) + 9.0));
  float ground = step(p.y, ridge + pines);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float px = (fi - 2.0) * 0.11 + 0.03 * hash11(fi * 5.0) - aspect * 0.18;
    float py = HY + 0.10 + 0.10 * fbm(vec2(px * 1.6, 3.0));
    float tall = 0.050 + 0.012 * hash11(fi * 3.0 + 1.0);
    float body = step(abs(p.x - px), 0.009) * step(py, p.y) * step(p.y, py + tall);
    float head = step(length(p - vec2(px, py + tall + 0.011)), 0.010);
    ground = max(ground, max(body, head));
  }
  col = mix(col, vec3(0.006, 0.006, 0.008), ground);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'eclipse',
  name: 'Eclipse',
  group: 'Vibe',
  blurb: 'Total eclipse whose corona is a ring spectrum; diamond ring flashes on beats',
  tags: ['space', 'analyser', 'science'],
  energy: 0.5,
  particles: 0,
  trails: 0.4,
  zoom: 1,
  spin: 0,
  frag,
};
