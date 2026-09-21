// KOI — looking down into the pond.
//
// Five koi circle on the cruise clock, so they swim faster through the loud passages; each body
// is a spine that bends like a travelling wave, widest behind the head and whipping most at the
// tail. Every beat drops a ring on the surface, the water shivers with the mids, the treble
// glints on it, and lily pads drift over everything.
const frag = `
// Signed coverage of one fish. q: pond coordinates. Returns rgb + alpha.
vec4 koi(vec2 q, float id, float t, float len) {
  float ph = t * (0.20 + 0.07 * hash11(id * 3.1)) + id * 2.4;
  float k = 1.0 + floor(hash11(id * 5.7) * 2.0);
  vec2 c = vec2(0.95 * sin(ph + id), 0.55 * sin(k * ph * 0.5 + id * 1.7));
  vec2 c2 = vec2(0.95 * sin(ph + 0.02 + id), 0.55 * sin(k * (ph + 0.02) * 0.5 + id * 1.7));
  vec2 dir = normalize(c2 - c + 1e-5);
  vec2 l = vec2(dot(q - c, dir), dot(q - c, vec2(-dir.y, dir.x))) / len;      // x along the fish, head at +1
  if (abs(l.x) > 1.7 || abs(l.y) > 0.9) return vec4(0.0);
  float tail = clamp((1.0 - l.x) * 0.5, 0.0, 1.3);                            // 0 at the nose → 1 at the tail root
  float spine = 0.16 * sin(l.x * 3.2 + t * 5.5 + id) * tail * tail;
  float v = l.y - spine;
  float body = l.x > -1.0 ? 0.24 * sqrt(max(1.0 - l.x * l.x, 0.0)) * (0.55 + 0.45 * (l.x * 0.5 + 0.5)) : 0.0;
  float fin = l.x <= -0.85 ? 0.30 * ss(-0.85, -1.55, l.x) * (0.6 + 0.4 * sin(v * 30.0)) : 0.0;
  float pect = (1.0 - ss(0.0, 1.0, length((vec2(l.x - 0.35, abs(v) - 0.20)) / vec2(0.22, 0.10)))) ;
  float a = max(1.0 - ss(body - 0.02, body, abs(v)), (1.0 - ss(fin - 0.03, fin, abs(v))) * 0.55 * step(l.x, -0.85));
  a = max(a, pect * 0.5);
  float patch1 = ss(0.45, 0.55, noise(l * vec2(2.2, 4.0) + id * 9.0));
  float patch2 = ss(0.62, 0.70, noise(l * vec2(3.0, 5.0) + id * 17.0));
  vec3 skin = mix(vec3(0.95, 0.93, 0.88), mix(vec3(1.0, 0.42, 0.10), pal(0.06), 0.3), patch1);
  skin = mix(skin, vec3(0.06, 0.05, 0.06), patch2 * step(0.5, hash11(id * 1.3)));
  skin *= 0.65 + 0.35 * (1.0 - abs(v) / max(body, 0.02));                    // rounder along the back
  return vec4(skin, a);
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float t = uCruise * 1.2;
  // the surface bends what is under it
  vec2 q = p + (0.006 + 0.010 * uMid) * vec2(noise(p * 6.0 + uTime * 0.6), noise(p * 6.0 + 9.0 - uTime * 0.5));

  vec3 floorC = mix(vec3(0.02, 0.07, 0.07), vec3(0.04, 0.12, 0.10), fbm(q * 2.5)) + pal(0.55) * 0.02;
  floorC += vec3(0.10, 0.16, 0.13) * ss(0.55, 0.9, fbm(q * 5.0 + vec2(uTime * 0.05, 0.0))) * 0.5;     // dappled light
  vec3 col = floorC;

  for (int i = 0; i < 5; i++) {                                                  // shadows first, then the fish over them
    float fi = float(i);
    vec4 s = koi(q - vec2(0.05, -0.06), fi + 1.0, t, 0.26 + 0.05 * hash11(fi * 2.2));
    col *= 1.0 - 0.45 * s.a;
  }
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec4 f = koi(q, fi + 1.0, t, 0.26 + 0.05 * hash11(fi * 2.2));
    col = mix(col, f.rgb * (0.75 + 0.5 * spec(0.05 + fi * 0.15)), f.a);
  }
  col = mix(col, col * vec3(0.55, 0.80, 0.78), 0.45);                            // everything below is seen through green water

  // lily pads ride on top
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 lc = vec2((hash11(fi * 3.7 + 1.0) - 0.5) * aspect * 1.9 + 0.05 * sin(uTime * 0.1 + fi), (hash11(fi * 5.9 + 2.0) - 0.5) * 1.8 + 0.04 * cos(uTime * 0.13 + fi * 2.0));
    float lr = 0.10 + 0.07 * hash11(fi * 7.1);
    vec2 lv = p - lc;
    float la = atan(lv.y, lv.x) + fi * 2.0 + 0.1 * sin(uTime * 0.2 + fi);
    float notch = ss(0.0, 0.22, abs(mod(la + PI, TAU) - PI));
    float pad = (1.0 - ss(lr - 0.006, lr, length(lv))) * notch;
    vec3 padC = mix(vec3(0.05, 0.22, 0.10), vec3(0.10, 0.34, 0.14), 0.5 + 0.5 * cos(la * 9.0)) * (0.7 + 0.3 * length(lv) / lr);
    col = mix(col, padC, pad);
    if (hash11(fi * 9.3) > 0.55) {                                               // some are in flower
      float petals = lr * 0.34 * (0.75 + 0.25 * cos(la * 8.0));
      col = mix(col, mix(vec3(1.0, 0.75, 0.85), pal(0.9), 0.3), 1.0 - ss(petals - 0.006, petals, length(lv)));
      col = mix(col, vec3(1.0, 0.85, 0.3), 1.0 - ss(lr * 0.07, lr * 0.09, length(lv)));
    }
  }

  // the ring from the last beat, and treble glints
  vec2 bp = (vec2(hash11(uBeatCount * 1.7 + 3.0), hash11(uBeatCount * 2.9 + 8.0)) - 0.5) * vec2(aspect, 1.0) * 1.4;
  float rr = length(p - bp) - uBeatAge * 0.75;
  col += vec3(0.7, 0.9, 0.9) * sin(rr * 70.0) * exp(-rr * rr * 120.0) * exp(-uBeatAge * 1.6) * 0.30 * uPunch;
  float glint = ss(0.70, 0.95, noise(p * 7.0 + vec2(uTime * 0.3, 0.0))) * ss(0.70, 0.95, noise(p * 90.0 - uTime * 1.5));
  col += vec3(0.9, 1.0, 1.0) * glint * (0.03 + 0.55 * uHigh);
  col *= 1.0 - 0.4 * ss(0.8, 1.9, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'koi',
  name: 'Koi',
  group: 'Vibe',
  blurb: 'Koi circling under lily pads; every beat drops a ripple ring on the pond',
  tags: ['water', 'nature', 'organic', 'calm'],
  energy: 0.1,
  particles: 0,
  trails: 0.15,
  zoom: 1,
  spin: 0,
  frag,
};
