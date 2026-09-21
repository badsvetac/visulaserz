// SKYLINE — a city at night whose towers are the equaliser.
//
// Every building owns a band of the spectrum and its lit floors climb with it, so the skyline
// rises and falls with the mix while the streets stay still. Three rows of towers slide past at
// different speeds (the cruise clock, so louder music drives faster), roof beacons blink on the
// beat, two searchlights comb the haze, and the river doubles it all with a wobble from the mids.
const frag = `
const float WATER = -0.42;

// One row of towers. depth: 0 far … 1 near. Coverage in a; light that spills outside the towers goes to glow.
vec4 city(vec2 p, float depth, float scroll, out vec3 glow) {
  float dens = mix(5.5, 2.4, depth);
  float x = p.x * dens + scroll * mix(0.15, 0.6, depth) + depth * 31.0;
  float id = floor(x);
  float fx = fract(x);
  float h1 = hash11(id * 1.31 + depth * 7.0), h2 = hash11(id * 2.77 + 3.0 + depth * 5.0), h3 = hash11(id * 4.13 + 9.0);
  float bw = 0.62 + 0.33 * h2;
  float u = fx / bw;
  float height = mix(0.95, 0.5, depth) * (0.35 + 0.65 * h1 * (0.5 + 0.5 * h3));
  float top = height + 0.06 * step(0.6, h3) * step(0.25, u) * step(u, 0.75);        // some towers step in near the top
  float y = p.y - WATER;
  float inside = step(u, 1.0) * step(y, top) * step(0.0, y);

  float cols = 3.0 + floor(h2 * 5.0);
  vec2 w = vec2(u * cols, y * mix(60.0, 26.0, depth));
  vec2 wf = fract(w);
  float pane = ss(0.12, 0.22, wf.x) * (1.0 - ss(0.78, 0.88, wf.x)) * ss(0.18, 0.3, wf.y) * (1.0 - ss(0.7, 0.82, wf.y));
  float wr = hash21(floor(w) + id * 3.7);
  float band = spec(0.03 + h3 * 0.8);
  float lit = step(y / max(height, 0.01), band * 1.25) * step(wr, 0.78) + step(0.93, wr) * 0.6;
  vec3 wcol = mix(vec3(1.0, 0.82, 0.5), pal(h1 * 0.9 + 0.1), 0.55);
  vec3 body = mix(vec3(0.035, 0.04, 0.07), vec3(0.010, 0.012, 0.022), depth);         // far towers sit in haze
  vec3 c = body + wcol * pane * lit * mix(0.35, 1.0, depth) * (0.6 + 0.8 * band);
  // a neon strip down the side of some towers
  float neon = step(0.72, h2) * (1.0 - ss(0.0, 0.05, abs(u - 0.08))) * step(y, top * 0.9) * step(top * 0.25, y);
  c += pal(h3 + 0.5) * neon * (0.6 + 1.2 * uHigh) * (0.7 + 0.3 * sin(uTime * 9.0 + id));

  vec2 bv = vec2((fx - bw * 0.5) / dens, y - top - 0.012);
  glow = vec3(1.0, 0.15, 0.1) * (0.00010 / (dot(bv, bv) + 0.00007)) * (0.15 + exp(-uBeatAge * 4.0) * uPunch) * step(0.5, h1) * mix(0.4, 1.0, depth);
  return vec4(c, inside);
}

float beam(vec2 p, vec2 o, float ang) {
  vec2 dir = vec2(sin(ang), cos(ang));
  vec2 v = p - o;
  float along = dot(v, dir);
  float perp = abs(v.x * dir.y - v.y * dir.x);
  float wd = 0.004 + along * 0.03;
  return exp(-perp * perp / (wd * wd)) * step(0.0, along) * exp(-along * 0.9) * 0.5;
}

vec3 town(vec2 p, float aspect, float scroll) {
  float sy = p.y - WATER;
  vec3 col = mix(pal(0.3) * 0.22 + vec3(0.02, 0.01, 0.04), vec3(0.004, 0.005, 0.02), ss(0.0, 1.2, sy));
  vec2 g = p * 60.0;
  vec2 gc = floor(g);
  float sh = hash21(gc);
  vec2 sf = fract(g) - 0.5 - (vec2(hash21(gc + 1.1), hash21(gc + 2.2)) - 0.5) * 0.8;
  col += vec3(0.85, 0.9, 1.0) * step(0.95, sh) * (0.0012 / (dot(sf, sf) + 0.002)) * ss(0.5, 1.1, sy) * (0.4 + uHigh);
  vec2 mv = p - vec2(aspect * 0.55, 0.62);
  float md = length(mv);
  col += vec3(1.0, 0.96, 0.88) * (1.0 - ss(0.085, 0.09, md)) * (0.8 + 0.2 * noise(mv * 40.0)) + pal(0.3) * 0.10 * exp(-md * 3.5);
  // searchlights comb the haze behind the front row
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 o = vec2((fi - 0.5) * aspect * 0.9, WATER + 0.42);
    float ang = sin(uCruise * 0.4 + fi * 2.1) * 0.7 + (0.5 - fi) * 0.3;
    col += pal(0.55 + fi * 0.2) * beam(p, o, ang) * (0.25 + 0.9 * uLevel);
  }
  vec3 glowAll = vec3(0.0), gl;
  for (int i = 0; i < 3; i++) {
    float depth = float(i) * 0.5;
    vec4 b = city(p, depth, scroll, gl);
    col = mix(col, b.rgb, b.a);
    glowAll = glowAll * (1.0 - b.a) + gl;
  }
  return col + glowAll;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  p.x += uBalance * 0.05;
  float scroll = uCruise * 0.35;
  vec3 col;
  if (p.y >= WATER) {
    col = town(p, aspect, scroll);
  } else {
    float dp = WATER - p.y;
    float wob = (0.004 + 0.012 * uMid) * sin(dp * 140.0 + uTime * 2.2) + 0.010 * (noise(vec2(p.x * 9.0, dp * 50.0 - uTime * 0.8)) - 0.5);
    col = town(vec2(p.x + wob * (1.0 + dp * 3.0), WATER + dp * 1.15), aspect, scroll) * (0.55 - 0.35 * ss(0.0, 0.6, dp));
    col += pal(0.6) * 0.012 + vec3(0.0, 0.004, 0.010);
    col *= 0.85 + 0.3 * noise(vec2(p.x * 5.0, dp * 120.0 + uTime * 0.6));
  }
  col += pal(0.3) * 0.05 * exp(-abs(p.y - WATER) * 40.0);         // the quay
  col *= 1.0 + uBeat * 0.12 * uPunch;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'skyline',
  name: 'Skyline',
  group: 'Vibe',
  blurb: 'Night city whose lit tower floors climb with the spectrum above a river',
  tags: ['city', 'night', 'analyser', 'water'],
  energy: 0.5,
  particles: 0,
  trails: 0.2,
  zoom: 1,
  spin: 0,
  frag,
};
