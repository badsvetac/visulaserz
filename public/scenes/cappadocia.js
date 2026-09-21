// CAPPADOCIA — balloons over the fairy chimneys at dawn.
//
// Nine balloons, nine bands. Each one's burner flares with its band and lights the envelope from
// inside, and the balloon climbs a little while its band stays loud (it listens to the slow
// spectrum, so it floats rather than twitches). The valley below is three ridges of tuff cones in
// morning haze, the sun comes up behind them, and the whole flight drifts on the cruise clock.
const frag = `
// A row of rock: a rolling ridge with capped cones standing on it.
float ridgeLine(float x, float seed, float amp) {
  float base = amp * (0.35 + 0.65 * fbm(vec2(x * 0.8 + seed, seed * 3.0)));
  float cx = x * 3.2 + seed * 7.0;
  float id = floor(cx);
  float h = hash11(id * 1.7 + seed);
  float u = abs(fract(cx) - 0.5) * 2.0;                                   // 0 at the cone's axis → 1 at the cell edge
  float cone = step(0.35, h) * amp * (0.35 + 0.9 * h) * max(1.0 - u * (2.2 + 1.5 * h), 0.0);
  float cap = step(0.35, h) * step(u, 0.16) * amp * 0.06;                 // the harder cap rock that made the chimney
  return base + cone + cap * step(0.0, cone - amp * 0.2);
}

vec4 balloon(vec2 p, vec2 c, float R, float id, float burn) {
  vec2 q = (p - c) / R;
  if (abs(q.x) > 1.2 || q.y > 1.2 || q.y < -2.2) return vec4(0.0);
  // envelope: a sphere on top, tapering to the mouth
  float prof = q.y > 0.0 ? sqrt(max(1.0 - q.y * q.y, 0.0)) : mix(1.0, 0.16, ss(0.0, 1.0, -q.y / 1.25)) * step(-1.25, q.y);
  float inside = step(abs(q.x), prof) * step(-1.25, q.y);
  vec4 o = vec4(0.0);
  if (inside > 0.5) {
    float ang = asin(clamp(q.x / max(prof, 1e-3), -1.0, 1.0));            // round the envelope: the gores bunch up at the edges
    float gore = floor((ang / PI + 0.5) * 10.0);
    vec3 a = pal(hash11(id * 3.1) + 0.05), b = mix(vec3(0.96, 0.93, 0.86), pal(hash11(id * 5.7) + 0.5), 0.5 * step(0.5, hash11(id * 7.3)));
    vec3 cloth = mod(gore + floor(q.y * 2.0 + 4.0) * step(0.6, hash11(id * 2.1)), 2.0) < 0.5 ? a : b;
    float shade = 0.55 + 0.45 * cos(ang - 0.5);                           // the sun is low on the left
    float glowIn = burn * exp(-(q.y + 1.2) * 1.3) * 1.3;                  // the burner lights it like a lantern
    o = vec4(cloth * (shade * 0.85 + glowIn), 1.0);
  }
  // basket, ropes and flame
  float basket = step(abs(q.x), 0.13) * step(abs(q.y + 1.62), 0.10);
  float ropes = (1.0 - ss(0.0, 0.02, abs(abs(q.x) - mix(0.16, 0.12, (-q.y - 1.25) / 0.3)))) * step(q.y, -1.25) * step(-1.55, q.y);
  o = mix(o, vec4(0.10, 0.06, 0.04, 1.0), max(basket, ropes * 0.8));
  vec2 fv = q - vec2(0.0, -1.32);
  o.rgb += vec3(1.0, 0.6, 0.2) * burn * exp(-dot(fv * vec2(7.0, 3.5), fv * vec2(7.0, 3.5))) * 2.2;
  o.a = max(o.a, burn * exp(-dot(fv * vec2(7.0, 3.5), fv * vec2(7.0, 3.5))));
  return o;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float t = uTime;

  // dawn
  vec3 warm = mix(vec3(1.0, 0.62, 0.38), pal(0.06), 0.30);
  vec3 col = mix(warm * 0.85, mix(vec3(0.30, 0.42, 0.66), pal(0.62) * 0.5, 0.25), ss(-0.35, 0.55, p.y));
  col = mix(col, vec3(0.10, 0.16, 0.36), ss(0.45, 1.1, p.y));
  vec2 sv = p - vec2(-aspect * 0.35, -0.22);
  col += warm * (exp(-length(sv) * 2.2) * 0.55 + exp(-length(sv) * 9.0) * 0.8) * (0.8 + 0.3 * uLevel);
  col += vec3(1.0, 0.95, 0.85) * (1.0 - ss(0.085, 0.09, length(sv))) * 1.2;
  float ci = ss(0.5, 0.85, fbm(vec2(p.x * 1.2 + t * 0.006, p.y * 5.0)));
  col += mix(warm, vec3(1.0), 0.3) * ci * 0.12 * ss(0.0, 0.6, p.y);

  // far balloons, the three ridges, then the near balloons in front of them
  for (int pass = 0; pass < 2; pass++) {
    if (pass == 1) {
      for (int k = 0; k < 3; k++) {
        float fk = float(k);
        float x = p.x + uCruise * 0.004 * (1.0 + fk * 1.5);
        float top = -0.28 - fk * 0.17 + ridgeLine(x * (1.0 - fk * 0.18), fk * 5.0 + 1.0, 0.26 + fk * 0.05);
        if (p.y < top) {
          vec3 rock = mix(vec3(0.62, 0.42, 0.36), vec3(0.20, 0.13, 0.13), fk / 2.0);
          rock *= 0.8 + 0.3 * noise(vec2(x * 40.0, p.y * 14.0));
          col = mix(rock, warm * 0.8, (0.62 - fk * 0.24) * (0.6 + 0.4 * ss(top - 0.35, top, p.y)));    // morning haze
        }
      }
    }
    for (int i = 0; i < 9; i++) {
      float fi = float(i);
      float depth = hash11(fi * 2.3 + 1.0);                               // 0 far … 1 near
      if ((depth > 0.5) != (pass == 1)) continue;
      float band = slow(0.03 + fi / 8.0 * 0.7);
      float R = mix(0.045, 0.15, depth);
      vec2 c = vec2(mod(hash11(fi * 4.1 + 2.0) + uCruise * 0.0012 * (0.4 + depth), 1.0) * aspect * 2.6 - aspect * 1.3,
                    mix(0.05, 0.30, hash11(fi * 6.7 + 3.0)) + 0.30 * band + 0.02 * sin(t * 0.4 + fi));
      float burn = ss(0.25, 0.7, spec(0.03 + fi / 8.0 * 0.7)) * (0.6 + 0.4 * noise(vec2(t * 9.0, fi)));
      vec4 b = balloon(p, c, R, fi + 1.0, burn);
      b.rgb = mix(b.rgb, warm * 0.9, (1.0 - depth) * 0.35);
      col = mix(col, b.rgb, b.a);
    }
  }
  col *= 0.80 + 0.12 * uLevel;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'cappadocia',
  name: 'Cappadocia',
  group: 'Vibe',
  blurb: 'Nine dawn balloons over fairy chimneys; each burner flares with its own band',
  tags: ['turkish', 'nature', 'calm'],
  energy: 0.2,
  particles: 0,
  trails: 0.15,
  zoom: 1,
  spin: 0,
  frag,
};
