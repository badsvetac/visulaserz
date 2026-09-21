// MEADOW — a windy field in daylight, the one scene that is not night.
//
// Six rows of grass from the horizon to your feet. The wind is the bass: gusts roll across the
// field as travelling waves and every blade leans with them, the near rows most of all, while a
// beat sends one sharp gust through. Cloud shadows slide over the grass on the cruise clock, the
// seed heads catch the treble as flecks of light, and dandelion clocks drift past.
const frag = `
float wind(float x, float t, float depth) {
  return (sin(x * 1.3 - t * 1.6) * 0.6 + sin(x * 3.1 - t * 2.7 + 1.0) * 0.4) * (0.25 + 0.9 * uBass)
       + exp(-abs(x - (uBeatAge * 5.0 - 2.5)) * 1.5) * exp(-uBeatAge * 1.2) * 1.2 * uPunch * depth;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float t = uTime;
  const float HZ = 0.12;

  // sky, sun, clouds
  vec3 col = mix(vec3(0.62, 0.80, 0.95), vec3(0.20, 0.45, 0.85), ss(HZ, 1.0, p.y));
  col = mix(col, pal(0.6) * 0.6 + 0.3, 0.12);
  vec2 sv = p - vec2(-aspect * 0.45, 0.62);
  col += vec3(1.0, 0.92, 0.7) * (exp(-length(sv) * 3.0) * 0.55 + (1.0 - ss(0.07, 0.08, length(sv))) * 0.9);
  vec2 cp = vec2(p.x * 0.7 + uCruise * 0.01, p.y * 2.2);
  float cl = ss(0.48, 0.72, fbm(cp * 1.6)) * ss(HZ + 0.05, 0.5, p.y);
  col = mix(col, vec3(1.0, 0.99, 0.97) * (0.92 - 0.12 * fbm(cp * 3.0 + 4.0)), cl * 0.9);

  // far hills
  float hill = HZ + 0.05 + 0.07 * fbm(vec2(p.x * 1.2 + 3.0, 1.0));
  if (p.y < hill) col = mix(vec3(0.36, 0.55, 0.42), vec3(0.62, 0.80, 0.95), 0.45);

  // grass, far rows first
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float depth = (fk + 1.0) / 6.0;                                       // 0 far … 1 near
    float rowY = mix(HZ + 0.02, -0.72, depth * depth);
    float bladeH = mix(0.035, 0.42, depth * depth);
    float dens = mix(90.0, 9.0, depth);
    float xw = p.x / aspect * dens * aspect;
    // look at this blade and its two neighbours: a leaning blade reaches into the next lane
    for (int j = -1; j <= 1; j++) {
      float id = floor(xw) + float(j);
      float h1 = hash11(id * 1.7 + fk * 31.0), h2 = hash11(id * 3.3 + fk * 17.0);
      float bx = (id + 0.2 + 0.6 * h1) / dens;
      float hgt = bladeH * (0.6 + 0.6 * h2);
      float y = (p.y - rowY) / hgt;                                       // 0 at the root → 1 at the tip
      if (y < 0.0 || y > 1.0) continue;
      float lean = wind(bx * 2.0 + fk, t, depth) * 0.35 * hgt + (h1 - 0.5) * 0.25 * hgt;
      float cx = bx + lean * y * y;                                       // the blade bends more toward its tip
      float halfW = (0.30 / dens) * (1.0 - y) * (0.6 + 0.5 * h2) + 0.0006;
      float blade = 1.0 - ss(halfW * 0.7, halfW, abs(p.x - cx));
      vec3 green = mix(vec3(0.10, 0.30, 0.06), vec3(0.45, 0.62, 0.14), y * (0.6 + 0.4 * h1));
      green = mix(green, pal(0.35) * 0.6, 0.12);
      green = mix(green, vec3(0.62, 0.80, 0.95) * 0.7, (1.0 - depth) * 0.45);  // aerial perspective
      // cloud shadows drifting over the field
      float shade = 0.62 + 0.38 * ss(0.35, 0.6, fbm(vec2(bx * 1.3 + uCruise * 0.02, depth * 3.0)));
      // seed heads at the tips catch the light
      float seed = ss(0.86, 1.0, y) * step(0.55, h2) * (0.3 + 2.0 * uHigh);
      col = mix(col, green * shade + vec3(1.0, 0.95, 0.7) * seed * 0.5, blade);
    }
    // the ground this row stands in
    if (p.y < rowY + 0.004) col = mix(col, mix(vec3(0.08, 0.20, 0.05), vec3(0.62, 0.80, 0.95) * 0.6, (1.0 - depth) * 0.4), 0.85);
  }

  // dandelion clocks on the wind
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float life = fract(hash11(fi * 2.1 + 1.0) + uTravel * 0.006 * (0.6 + hash11(fi * 4.0)));
    vec2 dc = vec2(mix(-aspect - 0.1, aspect + 0.1, life), -0.2 + 0.7 * hash11(fi * 6.3) + 0.06 * sin(life * 20.0 + fi));
    vec2 dv = p - dc;
    float spokes = 0.6 + 0.4 * abs(cos(atan(dv.y, dv.x) * 6.0));
    col += vec3(1.0) * (1.0 - ss(0.0, 0.016 * spokes, length(dv))) * 0.55;
  }
  col *= 0.80 + 0.15 * uLevel;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'meadow',
  name: 'Meadow',
  group: 'Vibe',
  blurb: 'Windy field in daylight; the bass is the gust that bends the grass',
  tags: ['nature', 'weather', 'calm'],
  energy: 0.25,
  particles: 0,
  trails: 0.05,
  zoom: 1,
  spin: 0,
  frag,
};
