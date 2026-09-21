// MOSAIC — a rose window, lit from outside.
//
// The glass is a Voronoi diagram folded into twelve mirrored sectors, which turns random cells
// into the symmetry of a cathedral rose. Every pane listens to its own band and lets more light
// through the louder it gets; a beat sends a wave of light from the centre to the rim. The lead
// came is wherever the two nearest cell points are almost equally far, plus three rings and the
// spokes. Coloured shafts fall into the dusty nave (the dust layer is the motes).
const frag = `
vec3 voronoi(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  float f1 = 8.0, f2 = 8.0, id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(hash21(n + g), hash21(n + g + 17.3));
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; id = hash21(n + g + 5.5); }
      else if (d < f2) f2 = d;
    }
  }
  return vec3(sqrt(f1), sqrt(f2), id);
}

void main() {
  vec2 p = centered() * 1.02;
  float r = length(p);
  float a = atan(p.y, p.x) + uTime * 0.01;
  float sect = TAU / 12.0;
  float af = abs(mod(a + sect * 0.5, sect) - sect * 0.5);              // folded and mirrored: 0 on a spoke, sect/2 between two
  vec2 q = r * vec2(cos(af), sin(af));
  vec3 v = voronoi(q * 6.5 + 3.0);

  float rings = min(min(abs(r - 0.20), abs(r - 0.50)), abs(r - 0.84));
  float lead = ss(0.0, 0.07, v.y - v.x) * ss(0.006, 0.014, rings) * ss(0.004, 0.010, af * r) * ss(0.004, 0.010, (sect * 0.5 - af) * r);
  float tier = step(0.20, r) + step(0.50, r);
  float band = spec(0.03 + fract(v.z * 7.7) * 0.8);
  float dw = r - uBeatAge * 1.4;
  float wave_ = exp(-dw * dw * 30.0) * exp(-uBeatAge * 2.0) * uPunch;
  vec3 glass = pal(v.z * 0.9 + tier * 0.13);
  float seedy = 0.72 + 0.28 * noise(p * 42.0 + v.z * 10.0);             // old glass is streaky and full of bubbles
  vec3 col = glass * (0.16 + 1.6 * band + 1.3 * wave_) * seedy * lead;
  col += pal(0.12) * (1.0 - ss(0.0, 0.2, r)) * (0.3 + 1.2 * uBass) * lead;   // the boss at the centre takes the bass

  // stone: the wall, its courses, and the moulded frame round the window
  float inWin = 1.0 - ss(0.900, 0.905, r);
  vec2 bl = vec2(p.x + step(1.0, mod(floor(p.y * 5.0), 2.0)) * 0.2, p.y);
  float mortar = ss(0.0, 0.015, min(abs(fract(bl.x * 2.5) - 0.5), abs(fract(bl.y * 5.0) - 0.5)) * 0.4);
  vec3 wall = vec3(0.020, 0.018, 0.016) * (0.55 + 0.45 * noise(p * vec2(9.0, 21.0))) * (0.6 + 0.4 * mortar);
  wall += pal(0.1) * 0.05 * exp(-max(r - 0.9, 0.0) * 3.5) * (0.5 + uLevel);
  col = mix(wall, col, inWin);
  col *= 0.25 + 0.75 * ss(0.0, 0.035, abs(r - 0.92));
  col += vec3(0.05, 0.045, 0.04) * (1.0 - ss(0.0, 0.012, abs(r - 0.955)));

  // shafts of coloured light falling into the nave
  vec2 d = normalize(vec2(-0.45, -0.9));
  float u = dot(p, vec2(-d.y, d.x)), w = dot(p, d);
  float rays = noise(vec2(u * 7.0, 0.5 + uTime * 0.02));
  col += pal(0.12 + u * 0.3) * rays * rays * ss(-0.2, 0.9, w) * (1.0 - ss(0.7, 1.0, abs(u))) * 0.12 * (0.5 + 1.5 * uLevel);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'mosaic',
  name: 'Mosaic',
  group: 'Lab',
  blurb: 'Stained-glass rose window; each pane glows with its band, beats send light out',
  tags: ['geometric', 'artwork', 'calm'],
  energy: 0.35,
  particles: 3,
  trails: 0.35,
  zoom: 1,
  spin: 0,
  frag,
};
