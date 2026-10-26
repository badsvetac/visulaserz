// TWIST — a puzzle cube that turns one face on every beat, scrambling and then solving itself.
//
// Twenty beats make a round. For the first ten the cube is scrambled, one random face turn per
// beat; for the next ten it undoes them in reverse, so on the twentieth beat it clicks back to
// solved — and the next round starts a new scramble. Each turn snaps round in a fraction of a
// second, on the beat, so the cube is a metronome you can watch.
//
// Nothing is stored: every pixel works the cube's state out afresh. It casts a ray at the 27
// cubies, testing the layer that is turning in its own rotated frame, and when it hits a sticker
// it runs the moves made so far backwards on that sticker's position to find which face of the
// solved cube it came from — which is its colour.
const frag = `
const float H = 0.47;                 // half the size of a cubie; the rest is the gap between them

// Move i of round r: which axis, which outer layer, which way. Moves 10–19 undo 9–0.
void moveAt(float r, float i, out int axis, out float layer, out float dir) {
  float j = i < 10.0 ? i : 19.0 - i;
  float undo = i < 10.0 ? 1.0 : -1.0;
  axis = int(hash11(r * 17.3 + j * 3.7 + 0.5) * 3.0);
  layer = hash11(r * 29.1 + j * 5.3 + 1.5) < 0.5 ? -1.0 : 1.0;
  dir = (hash11(r * 41.7 + j * 7.1 + 2.5) < 0.5 ? -1.0 : 1.0) * undo;
}
float along(vec3 v, int axis) { return axis == 0 ? v.x : (axis == 1 ? v.y : v.z); }
// a quarter turn about an axis, dir = +1 or -1
vec3 quarter(vec3 v, int axis, float dir) {
  if (axis == 0) return vec3(v.x, -dir * v.z, dir * v.y);
  if (axis == 1) return vec3(dir * v.z, v.y, -dir * v.x);
  return vec3(-dir * v.y, dir * v.x, v.z);
}
mat3 turnMatrix(int axis, float a) {
  float c = cos(a), s = sin(a);
  if (axis == 0) return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
  if (axis == 1) return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
  return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
}

// the solved cube's six colours, leaning a little toward the palette
vec3 faceColour(vec3 n) {
  vec3 c = n.x > 0.5 ? vec3(0.85, 0.10, 0.12) : n.x < -0.5 ? vec3(1.0, 0.45, 0.05)
         : n.y > 0.5 ? vec3(0.95, 0.95, 0.92) : n.y < -0.5 ? vec3(1.0, 0.85, 0.05)
         : n.z > 0.5 ? vec3(0.05, 0.62, 0.25) : vec3(0.05, 0.28, 0.85);
  return mix(c, c * (0.5 + pal(0.1 + dot(abs(n), vec3(0.1, 0.4, 0.7)))), 0.25);
}

// ray against one cubie centred at c: distance, and the face normal it hit
float box(vec3 ro, vec3 rd, vec3 c, out vec3 n) {
  vec3 inv = 1.0 / rd;
  vec3 t1 = (c - H - ro) * inv, t2 = (c + H - ro) * inv;
  vec3 tn = min(t1, t2), tf = max(t1, t2);
  float t0 = max(max(tn.x, tn.y), tn.z), t3 = min(min(tf.x, tf.y), tf.z);
  if (t3 < max(t0, 0.0)) return 1e9;
  n = t0 == tn.x ? vec3(-sign(rd.x), 0.0, 0.0) : (t0 == tn.y ? vec3(0.0, -sign(rd.y), 0.0) : vec3(0.0, 0.0, -sign(rd.z)));
  return t0;
}

void main() {
  vec2 p = centered();
  float orbit = uTime * 0.12 + uBalance * 0.2;
  float pump = 1.0 + 0.025 * exp(-uBeatAge * 8.0) * uPunch;
  vec3 ro = vec3(sin(orbit) * 6.2, 3.6 + 0.4 * sin(uTime * 0.09), -cos(orbit) * 6.2) / pump;
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 rd = normalize(fw * 2.3 + rt * p.x + up * p.y);

  // background: a soft studio sweep, the cube's shadow on it
  vec3 col = mix(pal(0.6) * 0.05 + vec3(0.02), vec3(0.004, 0.005, 0.01), ss(-0.6, 1.0, p.y));
  col += pal(0.55) * 0.08 * exp(-length(p - vec2(0.0, 0.15)) * 1.8) * (0.5 + uLevel);
  vec2 sh = (p - vec2(0.0, -0.78)) * vec2(1.0, 4.2);
  col *= 1.0 - 0.6 * exp(-dot(sh, sh) * 1.4);

  // where the round is: which move is turning now, how far, and how many are done
  float beats = max(uBeatCount - 1.0, 0.0);
  float round_ = floor(beats / 20.0);
  float m = mod(beats, 20.0);                                   // moves completed before this one
  bool moving = uBeatCount > 0.5;
  int axis; float layer; float dir;
  moveAt(round_, m, axis, layer, dir);
  float e = ss(0.0, 1.0, clamp(uBeatAge / 0.26, 0.0, 1.0));
  mat3 R = turnMatrix(axis, dir * e * PI * 0.5 * (moving ? 1.0 : 0.0));
  mat3 Ri = transpose(R);

  float best = 1e9;
  vec3 bestN = vec3(0.0), bestC = vec3(0.0), bestP = vec3(0.0);
  bool bestTurning = false;
  // only rays that pass near the cube test its 27 pieces (a turning layer reaches out to about 2.6)
  float bb = dot(ro, rd);
  if (bb * bb - dot(ro, ro) + 2.6 * 2.6 > 0.0) {
    for (int i = 0; i < 27; i++) {
      vec3 c = vec3(float(i % 3), float((i / 3) % 3), float(i / 9)) - 1.0;
      bool turning = moving && abs(along(c, axis) - layer) < 0.5;
      vec3 o = turning ? Ri * ro : ro;
      vec3 d = turning ? Ri * rd : rd;
      vec3 n;
      float t = box(o, d, c, n);
      if (t < best) { best = t; bestN = n; bestC = c; bestP = o + d * t; bestTurning = turning; }
    }
  }

  if (best < 1e8) {
    vec3 q = bestP - bestC;                                      // where on the cubie, in its own frame
    vec2 uv = abs(bestN.x) > 0.5 ? q.yz : (abs(bestN.y) > 0.5 ? q.xz : q.xy);
    bool face = dot(bestC, bestN) > 0.5;                         // an outside face, where stickers are
    // the sticker's colour: undo the finished moves on it to see where it started
    vec3 g = bestC, nn = bestN;
    for (int i = 19; i >= 0; i--) {
      if (float(i) >= m) continue;
      int ax; float ly; float dr;
      moveAt(round_, float(i), ax, ly, dr);
      if (abs(along(g, ax) - ly) < 0.5) { g = quarter(g, ax, -dr); nn = quarter(nn, ax, -dr); }
    }
    float sq = length(max(abs(uv) - 0.30, 0.0)) - 0.10;          // a rounded square sticker
    float sticker = face ? 1.0 - ss(-0.012, 0.0, sq) : 0.0;
    vec3 base = mix(vec3(0.018, 0.018, 0.02), faceColour(nn), sticker);
    // lighting: world normal, a key light, a fill, a rim; stickers are a touch glossier than the plastic
    vec3 wn = bestTurning ? R * bestN : bestN;
    vec3 L = normalize(vec3(-0.5, 0.8, -0.4));
    float diff = max(dot(wn, L), 0.0);
    float fill = max(dot(wn, normalize(vec3(0.7, 0.2, 0.6))), 0.0);
    vec3 hv = normalize(L - rd);
    float spec_ = pow(max(dot(wn, hv), 0.0), mix(24.0, 60.0, sticker)) * mix(0.35, 0.8, sticker);
    col = base * (0.18 + 0.85 * diff + 0.25 * fill) + vec3(1.0) * spec_;
    // bevels and the dark gaps between cubies
    float edge = H - max(abs(uv.x), abs(uv.y));
    col *= 0.35 + 0.65 * ss(0.0, 0.04, edge);
    col += vec3(0.25) * (1.0 - ss(0.0, 0.015, abs(edge - 0.012))) * diff * 0.3;
    col += pal(0.55) * pow(1.0 - max(dot(wn, -rd), 0.0), 3.0) * 0.18;
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'twist',
  name: 'Twist',
  group: 'Things',
  blurb: 'A puzzle cube turns a face on every beat: ten moves scramble it, ten more solve it again',
  tags: ['geometric', '3d', 'retro'],
  energy: 0.5,
  particles: 3,
  trails: 0.0,
  zoom: 1,
  spin: 0,
  frag,
};
