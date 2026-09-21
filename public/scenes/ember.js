// EMBER — a campfire at the edge of the woods.
//
// The fire is a five-band analyser in disguise: each tongue of flame is fed by its own slice of
// the spectrum (bass in the middle, treble at the sides), so a kick makes the heart of the fire
// leap while hi-hats lick at the edges. Everything the fire lights — ground, stones, tent, tree
// trunks — flickers with it, sparks fly faster when the music is louder, and the logs glow with
// the bass.
const frag = `
const float GROUND = -0.58;

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// q.x: -1..1 across the base, q.y: 0 at the base → 1 at the tip
float tongue(vec2 q, float seed, float t) {
  float y = clamp(q.y, 0.0, 1.0);
  float x = q.x + (fbm(vec2(y * 2.6 - t * 1.9, seed)) - 0.5) * 0.9 * y;
  float core = 1.0 - abs(x) / max(1.0 - 0.92 * y, 0.02);
  float n = fbm(vec2(x * 2.2 + seed, y * 3.4 - t * 3.2));
  float f = core * (1.0 - y * 0.55) + (n - 0.5) * 1.1 * (0.35 + y);
  return ss(0.12, 0.85, f) * step(0.0, q.y) * (1.0 - ss(0.9, 1.0, q.y));
}

void main() {
  vec2 p = centered();
  float t = uTime;
  vec2 base = vec2(0.0, GROUND + 0.03);
  float flick = 0.75 + 0.25 * noise(vec2(t * 7.0, 3.0)) + 0.5 * uBass + 0.4 * uBeat * uPunch;
  vec3 cool = mix(vec3(0.9, 0.12, 0.02), pal(0.02), 0.4);
  vec3 warm = mix(vec3(1.0, 0.55, 0.08), pal(0.12), 0.35);
  vec3 hot = vec3(1.0, 0.92, 0.7);

  // night sky and stars
  vec3 col = mix(vec3(0.02, 0.025, 0.05), vec3(0.003, 0.004, 0.012), ss(-0.2, 0.9, p.y));
  vec2 g = p * 60.0;
  vec2 gc = floor(g);
  float sh = hash21(gc);
  vec2 sf = fract(g) - 0.5 - (vec2(hash21(gc + 1.1), hash21(gc + 2.2)) - 0.5) * 0.8;
  col += vec3(0.85, 0.9, 1.0) * step(0.92, sh) * (0.0014 / (dot(sf, sf) + 0.002)) * (0.6 + 0.4 * sin(t * (1.0 + sh * 3.0) + sh * 40.0)) * (0.4 + uHigh);

  // the tree line, its trunks catching a little firelight
  float tx = p.x * 1.4;
  float pa = tx * 9.0, pb = tx * 15.0 + 3.7;                       // two rows of pines: a triangle per cell, each its own height
  float pines = max((0.12 + 0.24 * hash11(floor(pa))) * (1.0 - abs(fract(pa) - 0.5) * 2.0),
                    (0.08 + 0.16 * hash11(floor(pb) + 40.0)) * (1.0 - abs(fract(pb) - 0.5) * 2.0));
  float treeTop = GROUND + 0.10 + 0.12 * fbm(vec2(tx * 1.3, 2.0)) + pines;
  if (p.y < treeTop) {
    float trunk = ss(0.6, 0.9, noise(vec2(p.x * 34.0, 1.0)));
    col = vec3(0.004, 0.006, 0.008) + warm * 0.05 * trunk * flick * exp(-abs(p.x) * 1.3) * exp(-(p.y - GROUND) * 4.5);
  }

  // smoke rising into the dark
  float sw = p.x / (0.10 + max(p.y - GROUND, 0.0) * 0.28);
  float sm = fbm(vec2(p.x * 2.4 + sin(p.y * 2.0 + t * 0.2) * 0.3, p.y * 1.6 - t * 0.35));
  col += vec3(0.05, 0.045, 0.04) * ss(0.45, 0.8, sm) * exp(-sw * sw) * ss(GROUND + 0.4, GROUND + 0.9, p.y) * (0.5 + 0.5 * flick);

  // the tent
  vec2 tc = vec2(0.98, GROUND);
  float tentD = (p.y - tc.y) + abs(p.x - tc.x) * 1.15 - 0.34;
  if (tentD < 0.0 && p.y > GROUND) {
    float facing = step(p.x, tc.x);
    float door = 1.0 - ss(0.0, 0.006, abs(p.x - tc.x + (p.y - GROUND) * 0.18) - 0.004);
    col = vec3(0.012, 0.014, 0.02) + warm * (0.05 + 0.17 * facing) * flick * (0.6 + 0.4 * noise(p * 9.0)) * (1.0 - 0.7 * door);
  }

  // ground lit by the fire
  if (p.y < GROUND) {
    float gd = GROUND - p.y;
    float d2 = p.x * p.x * 0.9 + gd * gd * 5.8;
    float pebble = 0.55 + 0.45 * noise(vec2(p.x * 14.0 / (0.4 + gd), gd * 40.0));
    col = vec3(0.006, 0.007, 0.009) + warm * flick * pebble * 0.55 / (1.0 + d2 * 7.0);
  }

  // ring of stones: the back half now, the front half after the flames
  vec3 front = vec3(0.0);
  float frontMask = 0.0;
  for (int i = 0; i < 10; i++) {
    float a = (float(i) + 0.5) / 10.0 * TAU;
    float hs = hash11(float(i) * 3.3 + 0.5);
    vec2 c = base + vec2(cos(a) * 0.27, sin(a) * 0.06 - 0.025);
    float r = 0.034 + 0.016 * hs;
    vec2 v = (p - c) * vec2(1.0, 1.45);
    float m = 1.0 - ss(r - 0.004, r, length(v));
    float lit = 0.12 + 0.88 * max(dot(normalize(v + 1e-4), normalize(base + vec2(0.0, 0.10) - c)), 0.0);
    vec3 sc = vec3(0.02, 0.02, 0.022) + warm * lit * 0.45 * flick * (0.7 + 0.3 * noise(v * 60.0 + hs * 9.0));
    if (sin(a) > 0.0) col = mix(col, sc, m);
    else { front = mix(front, sc, m); frontMask = max(frontMask, m); }
  }

  // the fire: five tongues, each fed by its own band
  float heat = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float off = (fi - 2.0) * 0.085;
    float band = spec(0.03 + abs(fi - 2.0) * 0.16);
    float H = (0.30 + 0.62 * band + 0.18 * uBass) * (1.0 - 0.12 * abs(fi - 2.0)) * (1.0 + 0.25 * uBeat * uPunch);
    float Wd = 0.10 + 0.03 * band;
    float hi = tongue(vec2((p.x - base.x - off) / Wd, (p.y - base.y) / H), fi * 7.3 + 1.0, t);
    heat = 1.0 - (1.0 - heat) * (1.0 - hi);
  }
  vec3 fc = mix(cool, warm, ss(0.15, 0.5, heat));
  fc = mix(fc, hot, ss(0.55, 0.95, heat));
  col = mix(col, fc * (0.9 + 0.6 * flick), ss(0.02, 0.25, heat));
  col += fc * heat * 0.3;
  vec2 hv = (p - base - vec2(0.0, 0.15)) * vec2(1.0, 0.8);
  col += warm * 0.10 * flick / (dot(hv, hv) * 6.0 + 0.25);

  // logs, with embers breathing in their cracks
  float lg = min(min(sdSeg(p, base + vec2(-0.21, -0.02), base + vec2(0.12, 0.085)), sdSeg(p, base + vec2(0.21, -0.02), base + vec2(-0.12, 0.085))),
                 sdSeg(p, base + vec2(-0.17, -0.04), base + vec2(0.17, -0.045))) - 0.024;
  float crack = ss(0.55, 0.8, noise(p * vec2(60.0, 26.0)));
  vec3 logCol = vec3(0.018, 0.010, 0.006) + mix(cool, warm, crack) * crack * (0.5 + 1.4 * uBass) * (0.7 + 0.3 * sin(t * 3.0 + p.x * 40.0));
  col = mix(col, logCol, 1.0 - ss(0.0, 0.005, lg));
  col = mix(col, front, frontMask);

  // sparks
  for (int i = 0; i < 26; i++) {
    float fi = float(i);
    float r1 = hash11(fi * 3.7 + 1.0), r2 = hash11(fi * 5.1 + 2.0);
    float life = fract(r1 + uTravel * 0.10 * (0.6 + r2));
    vec2 sp = base + vec2((r2 - 0.5) * 0.22 + sin(life * 6.0 + fi) * 0.08 * life + (r1 - 0.5) * life * 0.5, 0.1 + life * (1.0 + 0.6 * r1));
    vec2 dv = p - sp;
    col += warm * (0.000018 / (dot(dv, dv) + 0.00001)) * (1.0 - life) * ss(0.0, 0.08, life) * (0.5 + uHigh * 2.0);
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'ember',
  name: 'Ember',
  group: 'Vibe',
  blurb: 'Campfire by the woods; five flame tongues leap with the spectrum bands',
  tags: ['fire', 'nature', 'night', 'organic'],
  energy: 0.45,
  particles: 0,
  trails: 0.3,
  zoom: 1,
  spin: 0,
  frag,
};
