// TESSERACT — a four-dimensional cube, turning.
//
// Sixteen corners, thirty-two edges. The cube is rotated in planes that only exist in 4-D (x-w,
// y-w, z-w) as well as ordinary ones, then projected twice: 4-D to 3-D, 3-D to the screen. That
// is why it seems to turn inside out — the "inner" cube is just the far side in w. The bass and
// mids drive the 4-D rotations, each family of parallel edges (one per axis) has its own colour
// and its own band, and the corners spark on the beat.
const frag = `
vec3 gVerts[16];        // projected corner: screen xy, and a depth cue in z
float gEdgeBand[4];

void rot4(inout vec4 v, int a, int b, float ang) {
  float c = cos(ang), s = sin(ang);
  float va = v[a], vb = v[b];
  v[a] = c * va - s * vb;
  v[b] = s * va + c * vb;
}

void build() {
  float t = uTravel * 0.10;
  for (int i = 0; i < 16; i++) {
    vec4 v = vec4(float(i & 1), float((i >> 1) & 1), float((i >> 2) & 1), float((i >> 3) & 1)) * 2.0 - 1.0;
    rot4(v, 0, 3, t * 1.0 + uBass * 0.35);
    rot4(v, 1, 3, t * 0.7);
    rot4(v, 2, 3, t * 0.45 + uMid * 0.25);
    rot4(v, 0, 1, uTime * 0.11);
    rot4(v, 1, 2, 0.45 + 0.15 * sin(uTime * 0.2));
    float k4 = 1.0 / (4.5 - v.w);                       // 4-D → 3-D: the eye sits well outside, or near corners explode
    vec3 q = v.xyz * k4 * 2.6;
    float k3 = 1.0 / (5.5 - q.z);                       // 3-D → screen
    gVerts[i] = vec3(q.xy * k3 * 3.0, k4 * k3 * 18.0);  // z: a depth cue around 1
  }
  for (int b = 0; b < 4; b++) gEdgeBand[b] = spec(0.04 + float(b) / 3.0 * 0.7);
}

void main() {
  vec2 p = centered() * (1.0 - 0.03 * uBeat * uPunch);
  build();
  vec3 col = pal(0.62) * 0.03 * exp(-length(p) * 1.3) * (0.5 + uLevel);
  vec2 gg = abs(fract(p * 3.0) - 0.5);
  col += pal(0.55) * 0.02 * (1.0 - ss(0.0, 0.012, 0.5 - max(gg.x, gg.y)));

  for (int i = 0; i < 16; i++) {
    for (int b = 0; b < 4; b++) {
      int j = i ^ (1 << b);
      if (j < i) continue;                                // each edge once
      vec3 A = gVerts[i], B = gVerts[j];
      vec2 pa = p - A.xy, ba = B.xy - A.xy;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
      float d = length(pa - ba * h);
      float depth = mix(A.z, B.z, h);                       // nearer in 4-D and 3-D → thicker and brighter
      float w = 0.0008 + 0.0022 * depth * depth;
      float band = gEdgeBand[b];
      vec3 tint = pal(0.05 + float(b) * 0.24);
      col += (tint * (w / (d + w)) + vec3(1.0) * (w * 0.3 / (d + w * 0.3)) * band) * (0.25 + 1.6 * band) * (0.30 + 0.8 * depth);
    }
    vec2 dv = p - gVerts[i].xy;
    col += vec3(1.0) * (0.00004 / (dot(dv, dv) + 0.00003)) * (0.3 + 2.5 * uBeat * uPunch) * (0.3 + 0.7 * gVerts[i].z);
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'tesseract',
  name: 'Tesseract',
  group: 'Lab',
  blurb: 'A four-dimensional cube turning inside out; corners spark on the beat',
  tags: ['geometric', '3d', 'science'],
  energy: 0.55,
  particles: 0,
  trails: 0.6,
  zoom: 1,
  spin: 0,
  frag,
};
