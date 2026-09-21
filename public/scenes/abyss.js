// ABYSS — jellyfish in deep water.
//
// Six jellies drift up through the dark, far ones small and dim. They swim on the beat — the
// bell contracts when the kick lands and relaxes after it — and each one glows with its own band
// of the spectrum. Light shafts from the surface follow the bass; marine snow is the dust layer.
const frag = `
vec3 jelly(vec2 p, vec2 pos, float sc, float seed, float t) {
  float band = spec(0.03 + fract(seed * 0.37) * 0.7);
  vec2 q = (p - pos) / sc;
  if (abs(q.x) > 1.7 || q.y > 1.1 || q.y < -3.4) return vec3(0.0);
  float swim = exp(-uBeatAge * 3.0) * uPunch;                      // contract on the beat, relax after it
  float rx = 1.0 - 0.16 * swim, ry = 0.72 + 0.12 * swim;
  vec3 tint = pal(0.45 + fract(seed * 0.618) * 0.5);
  float skirt = -0.04 + 0.05 * sin(q.x * 13.0 + t * 3.0 + seed);

  // the bell: a bright membrane, faint ribs, and the four-leaf organ showing through
  vec2 e = q / vec2(rx, ry);
  float r = length(e);
  float dome = step(skirt, q.y);
  float glow = (0.012 / (abs(r - 1.0) + 0.012)) * dome * 0.9;
  float ribs = 0.5 + 0.5 * cos(atan(e.x, e.y + 0.25) * 9.0);
  glow += (1.0 - ss(0.96, 1.0, r)) * dome * (0.10 + 0.22 * ribs * r * r);
  glow += (0.010 / (abs(q.y - skirt) + 0.010)) * step(abs(q.x), rx) * 0.5;
  vec2 gq = (q - vec2(0.0, 0.32)) * vec2(1.0, 1.3);
  float clover = 0.22 * (0.6 + 0.4 * abs(cos(atan(gq.y, gq.x) * 2.0)));
  glow += (0.006 / (abs(length(gq) - clover) + 0.006)) * 0.5 * (0.5 + band);

  // tentacles trail below, whipped by each stroke
  for (int k = 0; k < 7; k++) {
    float fk = float(k);
    float x0 = (fk / 6.0 - 0.5) * 1.5 * rx;
    float len = 1.6 + 1.2 * hash11(seed + fk * 3.1);
    float yy = (skirt - q.y) / len;                                  // 0 at the skirt → 1 at the tip
    float xx = x0 * (1.0 - 0.35 * yy) + (0.10 + 0.10 * swim) * sin(yy * 5.5 - t * 2.4 + fk * 1.7 + seed) * yy + 0.05 * sin(yy * 13.0 + t * 1.1 + fk);
    glow += (0.006 / (abs(q.x - xx) + 0.006)) * (1.0 - yy) * step(0.0, yy) * step(yy, 1.0) * 0.55;
  }
  return tint * glow * (0.55 + 2.0 * band);
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float t = uTime;
  vec3 col = mix(vec3(0.0, 0.012, 0.03), vec3(0.0, 0.05, 0.09), ss(-1.0, 1.0, p.y)) + pal(0.55) * 0.02;

  float shaft = noise(vec2(p.x * 2.2 + p.y * 0.7 + t * 0.06, 1.0)) * noise(vec2(p.x * 5.0 + p.y * 1.6 - t * 0.09, 4.0));
  col += vec3(0.25, 0.55, 0.6) * shaft * shaft * ss(-0.6, 1.0, p.y) * (0.5 + 1.4 * uBass) * 0.9;

  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float h = hash11(fi * 7.1 + 2.0);
    float depth = fi / 5.0;                                           // 0 far … 1 near
    float sc = mix(0.07, 0.26, depth * depth);
    float rise = fract(h + uTravel * 0.006 * (0.6 + h));
    vec2 pos = vec2((hash11(fi * 3.3 + 1.0) - 0.5) * aspect * 1.7 + 0.08 * sin(t * 0.2 + fi * 2.0), -1.7 + rise * 3.9);
    col += jelly(p, pos, sc, fi * 13.7 + 1.0, t) * mix(0.5, 1.0, depth);
  }

  for (int i = 0; i < 10; i++) {                                      // bubbles
    float fi = float(i);
    float h = hash11(fi * 5.7 + 3.0);
    float life = fract(h + uTravel * 0.02 * (0.5 + h));
    vec2 bp = vec2((hash11(fi * 2.9 + 0.3) - 0.5) * aspect * 1.8 + 0.03 * sin(t * 2.0 + fi * 3.0), -1.1 + life * 2.3);
    float d = abs(length(p - bp) - (0.008 + 0.014 * h));
    col += vec3(0.5, 0.8, 0.9) * (0.0012 / (d + 0.0015)) * 0.3;
  }
  col *= 1.0 - 0.5 * ss(0.6, 1.9, length(p * vec2(0.8, 1.0)));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'abyss',
  name: 'Abyss',
  group: 'Vibe',
  blurb: 'Deep-sea jellyfish that pulse on every kick, each glowing with its own band',
  tags: ['water', 'nature', 'organic', 'calm'],
  energy: 0.3,
  particles: 3,
  trails: 0.45,
  zoom: 1,
  spin: 0,
  frag,
};
