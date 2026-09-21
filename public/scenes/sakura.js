// SAKURA — cherry blossom night by the shrine.
//
// A string of paper lanterns hangs across the gate and each lantern is one band of the spectrum,
// bass on the left. Petals tumble on a wind that follows the bass and gusts on every beat; the
// moon breathes with the level, and the pond below keeps a wobbling copy of every light.
const frag = `
const float POND = -0.52;

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
float box(vec2 p, vec2 c, vec2 b) { vec2 d = abs(p - c) - b; return max(d.x, d.y); }

vec2 lanternPos(float fi, float aspect) {
  float u = fi / 6.0;
  float x = mix(-aspect * 0.78, aspect * 0.78, u);
  float sagY = 0.62 - 0.30 * 4.0 * u * (1.0 - u) * 0.55;
  return vec2(x + 0.012 * sin(uTime * 1.1 + fi * 1.9), sagY - 0.085 + 0.004 * cos(uTime * 1.1 + fi * 1.9));
}

// Every light in the scene, so the pond can show them again.
vec3 lights(vec2 p, float aspect) {
  vec3 col = vec3(0.0);
  vec2 mv = p - vec2(-aspect * 0.42, 0.50);
  float md = length(mv);
  col += vec3(1.0, 0.95, 0.88) * (1.0 - ss(0.150, 0.156, md)) * (0.85 + 0.15 * noise(mv * 22.0)) * (0.9 + 0.25 * uLevel);
  col += (vec3(0.9, 0.8, 0.9) * 0.10 + pal(0.85) * 0.10) * exp(-md * 2.6) * (0.7 + 0.6 * uLevel);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 lp = lanternPos(fi, aspect);
    float band = spec(0.03 + fi / 6.0 * 0.7);
    vec2 v = (p - lp) * vec2(1.0, 0.72);
    float body = 1.0 - ss(0.050, 0.056, length(v));
    float ribs = 0.8 + 0.2 * cos((p.y - lp.y) * 190.0);
    vec3 paper = mix(vec3(1.0, 0.42, 0.18), pal(0.02 + fi * 0.03), 0.35);
    col += paper * body * ribs * (0.30 + 1.8 * band) * (1.0 - 0.5 * ss(0.0, 0.05, length(v)));
    col += paper * (0.0009 / (dot(v, v) + 0.004)) * (0.25 + 1.6 * band);
  }
  return col;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float t = uTime;
  vec3 col;

  if (p.y >= POND) {
    col = mix(pal(0.9) * 0.10 + vec3(0.03, 0.015, 0.05), vec3(0.006, 0.006, 0.025), ss(POND, 0.9, p.y));
    vec2 g = p * 60.0;
    vec2 gc = floor(g);
    float sh = hash21(gc);
    vec2 sf = fract(g) - 0.5 - (vec2(hash21(gc + 1.1), hash21(gc + 2.2)) - 0.5) * 0.8;
    col += vec3(0.85, 0.9, 1.0) * step(0.94, sh) * (0.0012 / (dot(sf, sf) + 0.002)) * (0.35 + uHigh) * ss(0.0, 0.5, p.y);
    col += lights(p, aspect);

    // the mountain, with snow on its shoulders
    float mx = p.x - aspect * 0.30;
    float mh = POND + 0.62 - abs(mx) * 0.78 - 0.05 * abs(mx) * abs(mx) + 0.025 * fbm(vec2(p.x * 6.0, 1.0));
    mh = min(mh, POND + 0.575 + 0.01 * noise(vec2(p.x * 30.0, 2.0)));                    // the crater flattens the top
    if (p.y < mh) {
      float snow = ss(POND + 0.40 + 0.06 * noise(vec2(p.x * 22.0, 4.0)), POND + 0.47, p.y);
      col = mix(vec3(0.012, 0.012, 0.03), vec3(0.30, 0.32, 0.42), snow * (0.6 + 0.4 * noise(p * vec2(40.0, 12.0))));
    }
    // far shore
    float shore = POND + 0.05 + 0.04 * fbm(vec2(p.x * 3.0, 7.0));
    if (p.y < shore) col = vec3(0.006, 0.007, 0.014);
  } else {
    float dp = POND - p.y;
    float wob = 0.010 * sin(dp * 110.0 + t * 1.8) * (1.0 + dp * 4.0) * (0.6 + uMid);
    // the pond is small and we look across it at a low angle, so the sky is squeezed into it
    col = vec3(0.004, 0.005, 0.014) + lights(vec2(p.x + wob, POND + dp * 2.5), aspect) * (0.75 - 0.35 * ss(0.0, 0.5, dp));
    col *= 0.8 + 0.4 * noise(vec2(p.x * 5.0, dp * 100.0 + t * 0.5));
  }

  // the gate: two posts, a tie beam and the curved lintel, lacquer catching the lantern light
  vec2 gp = vec2(p.x - aspect * 0.05, p.y);
  float posts = min(box(gp, vec2(-0.30, POND + 0.30), vec2(0.022, 0.32)), box(gp, vec2(0.30, POND + 0.30), vec2(0.022, 0.32)));
  float tie = box(gp, vec2(0.0, POND + 0.50), vec2(0.40, 0.016));
  float lintelY = POND + 0.63 + 0.10 * gp.x * gp.x;
  float lintel = max(abs(gp.y - lintelY) - 0.026, abs(gp.x) - 0.47);
  float gate = min(min(posts, tie), lintel);
  float lampLight = 0.25 + 1.2 * spec(0.2) + 0.5 * uBeat * uPunch;
  vec3 lacquer = vec3(0.30, 0.035, 0.02) * lampLight * (0.5 + 0.5 * ss(POND, POND + 0.7, p.y)) + vec3(0.01, 0.004, 0.006);
  col = mix(col, lacquer, (1.0 - ss(0.0, 0.004, gate)) * step(POND, p.y));

  // the lantern string itself
  float cord = 1e3;
  for (int i = 0; i < 6; i++) cord = min(cord, sdSeg(p, lanternPos(float(i), aspect) + vec2(0.0, 0.085), lanternPos(float(i) + 1.0, aspect) + vec2(0.0, 0.085)));
  col = mix(col, vec3(0.004), (1.0 - ss(0.0012, 0.003, cord)) * 0.9);

  // a blossoming branch reaches in from the top right
  vec2 b0 = vec2(aspect + 0.05, 0.98), b1 = vec2(aspect * 0.62, 0.74), b2 = vec2(aspect * 0.30, 0.80), b3 = vec2(aspect * 0.52, 0.52);
  float branch = min(min(sdSeg(p, b0, b1) - 0.012, sdSeg(p, b1, b2) - 0.007), sdSeg(p, b1, b3) - 0.006);
  col = mix(col, vec3(0.012, 0.007, 0.008), 1.0 - ss(0.0, 0.004, branch));
  vec3 pink = mix(vec3(1.0, 0.72, 0.80), pal(0.9), 0.25);
  for (int i = 0; i < 26; i++) {
    float fi = float(i);
    float h1 = hash11(fi * 2.7 + 1.0), h2 = hash11(fi * 4.3 + 2.0);
    vec2 on = h1 < 0.4 ? mix(b0, b1, h2) : (h1 < 0.72 ? mix(b1, b2, h2) : mix(b1, b3, h2));
    vec2 bc = on + (vec2(hash11(fi * 6.1), hash11(fi * 7.9)) - 0.5) * 0.10;
    float r = 0.022 + 0.020 * hash11(fi * 9.3);
    vec2 bv = p - bc;
    float lobes = 1.0 + 0.22 * cos(atan(bv.y, bv.x) * 5.0 + fi);
    float bl = 1.0 - ss(r * lobes - 0.004, r * lobes, length(bv));
    col = mix(col, pink * (0.35 + 0.5 * lampLight * 0.5 + 0.2 * h2), bl * 0.95);
  }

  // petals on the wind
  float wind = 0.35 + 0.9 * uBass;
  for (int i = 0; i < 46; i++) {
    float fi = float(i);
    float h1 = hash11(fi * 1.7 + 3.0), h2 = hash11(fi * 3.9 + 5.0), h3 = hash11(fi * 5.3 + 7.0);
    float depth = 0.4 + 0.6 * h3;
    float fall = fract(h1 + uTravel * 0.012 * (0.6 + 0.8 * h2) * depth);
    vec2 pp = vec2(mix(aspect + 0.2, -aspect - 0.2, fract(h2 + fall * 0.55 * wind + uTravel * 0.004)) + 0.06 * sin(t * 1.3 + fi * 2.0),
                   1.15 - fall * 2.4 + 0.04 * sin(t * 2.1 + fi));
    vec2 v = rot(t * (0.8 + h1) + fi) * (p - pp);
    float flip = 0.25 + 0.75 * abs(cos(t * (1.2 + h2 * 1.5) + fi * 3.0));              // tumbling: the petal turns edge-on
    float sz = 0.016 * depth;
    float d = length(v / vec2(sz, sz * 0.55 * flip));
    col = mix(col, pink * (0.45 + 0.55 * depth) * (0.7 + 0.5 * lampLight * 0.4), (1.0 - ss(0.8, 1.0, d)) * (0.55 + 0.45 * depth));
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'sakura',
  name: 'Sakura',
  group: 'Vibe',
  blurb: 'Shrine lanterns glow per spectrum band while petals gust on every beat',
  tags: ['nature', 'night', 'calm', 'organic'],
  energy: 0.3,
  particles: 0,
  trails: 0.2,
  zoom: 1,
  spin: 0,
  frag,
};
