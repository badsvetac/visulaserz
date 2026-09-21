// MURMURATION — thirty thousand starlings over a winter field, twenty minutes after sunset.
//
// Nobody leads a murmuration. Each bird only tracks its seven nearest neighbours, and that one
// local rule is enough for a turn to cross the whole flock in half a second — which is why the
// cloud folds and blackens rather than scattering. So it is drawn as a density field, not as
// sprites: two folds of domain-warped noise, thresholded, solid in the core and fraying into
// single specks at the fringe, because the fringe is where a real flock shows you its birds.
//
// Rows of the shape are rows of the spectrum: the bottom of the cloud rides the bass, the top the
// treble, each row sliding sideways by its own band (spec) and thickening with its slow average
// (slow), so a chord ripples up through the flock. Every beat picks a new heading — the birds are
// rounded onto it in a third of a second and hold it — and sends a wave of bunching along it.
// Two bare trees and a hedge line sit under the dusk gradient to give the cloud its scale.
const frag = `
const float HZ = -0.52;

float seg(vec2 p, vec2 a, vec2 b, float w0, float w1) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(w0, w1, h);
}

// A bare winter tree: trunk, a fan of boughs leaving it at different heights, one twig on each.
float tree(vec2 p, float cx, float hgt, float seed) {
  vec2 root = vec2(cx, HZ - 0.04);
  vec2 fork = root + vec2(hgt * 0.10 * (hash11(seed) - 0.5), hgt * 0.55);
  float d = seg(p, root, fork, hgt * 0.038, hgt * 0.016);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float h1 = hash11(seed + fi * 3.7), h2 = hash11(seed + fi * 8.1 + 5.0);
    vec2 a = mix(fork, root, 0.34 * h1);
    float ang = mix(0.40, 2.70, (fi + h2) / 6.0);
    vec2 b = a + vec2(cos(ang), sin(ang)) * hgt * (0.30 + 0.24 * h1);
    d = min(d, seg(p, a, b, hgt * 0.016, hgt * 0.003));
    vec2 c = b + vec2(cos(ang - 0.5 + h2), sin(ang + 0.4 * h1)) * hgt * 0.17;
    d = min(d, seg(p, b, c, hgt * 0.005, hgt * 0.001));
  }
  return 1.0 - ss(0.0, 0.004, d);
}

// The flock body. The warp amplitude is fed by the row's band, so a loud row folds harder.
float flockAt(vec2 q, float thr, float fold, float gs) {
  vec2 w = vec2(noise(q * 1.6 + vec2(uCruise * 0.06, 1.7)), noise(q * 1.6 + vec2(4.9, -uCruise * 0.05)));
  q += (w - 0.5) * fold;
  float body = ss(thr, thr + 0.16, fbm(q * 1.7 + vec2(uCruise * 0.04, 0.0)));
  float grain = ss(0.26, 0.82, noise(q * gs + vec2(uTravel * 0.7, 0.0)));
  return body * mix(grain, 1.0, body * body);      // solid where it is deep, speckled at the edge
}

void main() {
  vec2 p = centered() * (1.0 - uBeat * 0.006 * uPunch);
  float aspect = uRes.x / uRes.y;

  // One heading for the whole flock. Only the last beat is knowable, so the heading is rebuilt
  // from the beat count: the previous one eased into the current one, then held.
  float hNow = hash11(uBeatCount * 1.7 + 3.0) - 0.5;
  float hOld = hash11((uBeatCount - 1.0) * 1.7 + 3.0) - 0.5;
  float lean = mix(hOld, hNow, ss(0.0, 0.32, uBeatAge)) * 2.0;
  vec2 fc = vec2(0.30 * sin(uTime * 0.08) + lean * 0.26, 0.24 + 0.06 * sin(uTime * 0.11) - lean * 0.05);
  vec2 u = rot(-lean * 0.38) * (p - fc);

  float bandY = clamp(u.y * 0.80 + 0.46, 0.0, 1.0);  // bottom of the cloud = bass, top = treble
  float band = spec(0.02 + bandY * 0.86);
  float slowB = slow(0.02 + bandY * 0.86);

  // dusk: amber on the deck, mauve above it, indigo overhead
  float up = ss(HZ, 1.0, p.y);
  vec3 col = mix(vec3(1.00, 0.50, 0.24), vec3(0.52, 0.26, 0.40), ss(0.0, 0.26, up));
  col = mix(col, vec3(0.05, 0.07, 0.19), ss(0.22, 0.80, up));
  col = mix(col, pal(0.60) * 0.55, 0.18);
  vec2 sv = (p - vec2(-aspect * 0.42, HZ + 0.02)) * vec2(0.75, 2.4);
  col += vec3(1.0, 0.56, 0.26) * exp(-length(sv) * 1.7) * (0.55 + 0.45 * uLevel);
  vec2 sg = p * 34.0;
  float sh = hash21(floor(sg));
  float st = ss(0.90, 1.0, sh) * (1.0 - ss(0.0, 0.30, length(fract(sg) - 0.5)));
  col += vec3(0.82, 0.88, 1.0) * st * ss(0.25, 0.85, p.y) * (0.45 + 0.55 * sin(uTime * 2.3 + sh * 30.0));

  // the bunching wave crossing the flock along its new heading; gone in about a third of a second
  float sw = exp(-abs(u.x - (-2.0 + uBeatAge * 11.0)) * 2.0) * exp(-uBeatAge * 2.2) * uPunch;

  vec2 v = u;
  v.x += (band - 0.28) * 0.55 + sw * 0.10;          // every row slides by its own band: the ripple
  float env = 1.0 - ss(0.35, 1.20, length(v * vec2(0.58, 1.60)));
  float thr = mix(0.86, 0.40, env) - slowB * 0.07 - sw * 0.14;

  // three depths of flock, the far one hazed by the air between
  for (int i = 0; i < 3; i++) {
    float depth = float(i) * 0.5;
    vec2 q = v * mix(2.9, 1.6, depth) + vec2(float(i) * 9.1 - uCruise * (0.02 + 0.05 * depth), float(i) * 4.3);
    float a = flockAt(q, thr + (1.0 - depth) * 0.05, 1.1 + band, mix(7.5, 11.0, depth));
    vec3 bird = mix(vec3(0.03, 0.035, 0.06), col, 0.34 - 0.26 * depth);
    bird += pal(0.08) * sw * a * 0.5;               // the crowded wave catches what light is left
    col = mix(col, bird, a * (0.55 + 0.45 * depth));
  }

  // late birds still coming in, the only ones you can count
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float age = fract(hash11(fi * 5.1 + 2.0) + uTravel * 0.012);
    vec2 bp = mix(vec2(aspect * 1.15, 0.62 - 0.28 * hash11(fi * 3.3)), fc + vec2(0.40, 0.10), age);
    vec2 bv = (p - bp) / (0.020 + 0.012 * hash11(fi * 7.7));
    float flap = 0.30 + 0.55 * sin(uTime * 8.0 + fi * 2.1 + uBeat * 2.5);
    float wing = abs(bv.y - abs(bv.x) * flap);
    col = mix(col, vec3(0.02, 0.02, 0.05), (1.0 - ss(0.10, 0.26, wing)) * step(abs(bv.x), 1.0) * (1.0 - age));
  }

  // hedge, field, two trees
  float ground = HZ + 0.016 * fbm(vec2(p.x * 3.0 + 7.0, 0.0)) - 0.008;
  if (p.y < ground) col = mix(vec3(0.025, 0.030, 0.050), col, 0.14 * ss(ground - 0.30, ground, p.y));
  col = mix(col, vec3(0.015, 0.018, 0.030), max(tree(p, -aspect * 0.62, 0.62, 4.0), tree(p, aspect * 0.55, 0.44, 19.0)));
  col *= 0.94 + 0.10 * uLevel;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'murmuration',
  name: 'Murmuration',
  group: 'Vibe',
  blurb: 'Starlings at dusk; each row of the flock breathes on its own band, beats snap the heading',
  tags: ['nature', 'organic', 'light'],
  energy: 0.5,
  particles: 0,
  trails: 0.25,
  zoom: 1,
  spin: 0,
  frag,
};
