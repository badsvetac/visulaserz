import { SCULPT } from '../js/gfx/scene-kit.js';

// DENİZANASI — jellyfish in the black of the deep sea, lit only by their own light. A dozen of
// them hang in three depths: tiny far ones fading into the navy, a few crisp ones in the middle,
// one great glass bell in front of the rest, and two big ones drifting so close past the lens
// that they fall softly out of focus. Each is a translucent bell seen a little from above, its
// membrane glowing brightest where it turns away (the glass edge), its eight radial canals
// running from the crown to the ring canal on the margin, a row of lights along the scalloped
// rim, the four rings of its gonads glowing inside, four frilled oral arms below and long thin
// tentacles trailing and swaying under it. They pulse to swim: a quick squeeze of the bell that
// lifts them, then a slow open while they sink back. Marine snow drifts down past them all,
// lit where it passes near a jelly. Cyan, violet and magenta light against deep navy water.
//
// Music: each jellyfish follows its own band of the spectrum: its glow and the depth of its pulse
// both rise with it; the bass squeezes every bell; the highs light the tips of the tentacles and
// make the marine snow glitter; on some of the beats, about two in five, a ripple of light runs
// down every tentacle and oral arm, from the rim to the tips, within the beat.
const frag = `${SCULPT}
float gPx, gAsp, gT, gRip, gRipA;
vec3 gLight;

// the jellies, back to front: far, middle (the last of them the hero), near
// JA: x across the frame (-1..1), phase of the drift (or the height for the hero), radius, roll
// JB: band of the spectrum, drift speed upward, pulses per unit of time, colour
const vec4 JA[12] = vec4[12](
  vec4(-0.86, 0.6, 0.050, 0.22), vec4(-0.38, 1.4, 0.042, -0.14), vec4(0.06, 2.3, 0.058, 0.08),
  vec4(0.52, 0.9, 0.052, -0.26), vec4(0.92, 2.0, 0.066, 0.16), vec4(-0.62, 3.0, 0.062, -0.06),
  vec4(-0.58, 0.9, 0.150, 0.20), vec4(-0.12, 2.2, 0.105, -0.12), vec4(0.84, 1.4, 0.118, -0.18),
  vec4(0.20, 0.16, 0.300, -0.07),
  vec4(-1.02, 0.2, 0.540, 0.16), vec4(1.06, 1.12, 0.420, -0.18));
const vec4 JB[12] = vec4[12](
  vec4(0.62, 0.010, 0.52, 3.0), vec4(0.70, 0.012, 0.58, 0.0), vec4(0.48, 0.009, 0.50, 1.0),
  vec4(0.80, 0.011, 0.55, 2.0), vec4(0.55, 0.010, 0.47, 3.0), vec4(0.40, 0.012, 0.6, 1.0),
  vec4(0.30, 0.022, 0.40, 1.0), vec4(0.20, 0.020, 0.46, 2.0), vec4(0.38, 0.018, 0.42, 3.0),
  vec4(0.10, 0.0, 0.34, 0.0),
  vec4(0.05, 0.030, 0.30, 2.0), vec4(0.16, 0.026, 0.32, 3.0));
// the glows: cyan, violet, magenta, sea blue
const vec3 TINT[4] = vec3[4](vec3(0.2, 0.92, 1.25), vec3(0.62, 0.36, 1.35), vec3(1.2, 0.26, 0.92), vec3(0.28, 0.6, 1.38));

// the water: black at the bottom, deep navy higher up, faint light from the far surface
vec3 water(vec2 uv) {
  vec3 c = mix(vec3(0.002, 0.004, 0.014), vec3(0.008, 0.024, 0.065), ss(-1.1, 1.05, uv.y));
  vec2 d = uv - vec2(-0.3 * gAsp, 2.6);
  float ang = atan(d.x, -d.y);
  float rays = pow(noise(vec2(ang * 13.0, gT * 0.035)), 3.0) * 0.8 + pow(noise(vec2(ang * 29.0 + 7.0, gT * 0.05)), 4.0) * 0.7;
  c += vec3(0.016, 0.052, 0.09) * rays * ss(-0.8, 1.0, uv.y) * exp(-length(d) * 0.3);
  c += vec3(0.012, 0.004, 0.024) * ss(0.45, 0.8, fbm(uv * 1.3 + vec2(3.0, gT * 0.006)));   // a haze of plankton
  return c;
}
// one layer of marine snow falling slowly; it takes the light of the jellies it drifts past
vec3 snow(vec2 uv, float scale, float fall, float sz, float amt, float seed, float bokeh, float dens) {
  vec2 g = uv * scale + vec2(seed * 17.0, gT * fall * scale);
  vec2 cell = floor(g), f = fract(g) - 0.5;
  float h = hash21(cell + seed);
  if (h > dens) return vec3(0.0);
  h /= dens;
  vec2 off = (vec2(hash21(cell + 3.1), hash21(cell + 7.3)) - 0.5) * 0.5 + 0.1 * vec2(sin(gT * 0.3 + h * 40.0), cos(gT * 0.23 + h * 30.0));
  float d = length(f - off) / scale;
  float s = sz * (0.55 + 0.9 * hash21(cell + 1.7));
  float shape = exp(-d * d / (s * s));
  if (bokeh > 0.5) shape = ss(s, s * 0.6, d) * (0.55 + 0.45 * ss(s * 0.4, s * 0.95, d));    // an out-of-focus disc, its edge a little brighter
  float tw = 1.0 + gHigh * 2.6 * (0.5 + 0.5 * sin(uTime * 8.0 + h * 90.0));
  return vec3(0.5, 0.72, 0.95) * amt * shape * tw * (0.3 + gLight) * (0.4 + 1.2 * h);
}
// one jellyfish: pos the middle of its margin, r its radius, roll its lean, spin how it has turned
// on its axis, c how far its bell is squeezed, bl how far out of focus it is (in its own units),
// nT its tentacles, lod 0 for the far ones that show no inner detail, fog how far into the water
void jelly(vec2 uv, vec2 pos, float r, float roll, float spin, float c, float glow, vec3 tint, vec3 tint2, float bl, float nT, float lod, float seed, float fog, inout vec3 col) {
  vec2 q = rot(roll) * (uv - pos) / r;
  float TL = 4.0 + 1.4 * hash11(seed * 3.3 + 1.0);
  if (abs(q.x) > 2.1 || q.y > 1.5 || q.y < -TL - 0.3) return;
  float aa = max(gPx / r, bl);
  float W = 1.0 - 0.24 * c, H = 0.7 + 0.2 * c;
  const float ca = 0.95, sa = 0.312;                 // seen a little from above
  vec3 v = vec3(0.0, -sa, ca), up = vec3(0.0, ca, sa);
  vec3 em = vec3(0.0);
  float occ = 0.0;
  // the faint light the bell throws into the water around it
  vec2 hq = (q - vec2(0.0, 0.25)) / vec2(1.9, 1.2);
  float hal = max(0.0, 1.0 - dot(hq, hq));
  em += tint * hal * hal * 0.045;
  // the tentacles, hanging from the margin and swaying in a slow wave that runs down them
  float Wr = W * 0.97;
  for (int k = 0; k < 18; k++) {
    float fk = float(k);
    if (fk >= nT) break;
    float hk = hash11(seed * 7.1 + fk * 3.7);
    float L = (fk + 0.4 * hk) / nT * 6.2832 - spin;
    float zf = cos(L);
    float x0 = Wr * sin(L), y0 = -Wr * zf * sa;
    float len = TL * (0.68 + 0.32 * hash11(hk * 91.0 + seed));
    float s = (y0 - q.y) / len;
    if (s < 0.0 || s > 1.0) continue;
    float ph = hk * 6.2832;
    float w1 = s * 6.5 - gT * 1.5 + ph, w2 = s * 2.4 - gT * 0.45 + ph * 1.7;
    float x = x0 * (1.0 + 0.25 * s) + 0.15 * s * sin(w1) + 0.42 * s * s * sin(w2);
    if (abs(q.x - x) > 0.25) continue;
    float dxds = 0.25 * x0 + 0.15 * (sin(w1) + s * 6.5 * cos(w1)) + 0.42 * (2.0 * s * sin(w2) + s * s * 2.4 * cos(w2));
    float slope = dxds / len;
    float d = abs(q.x - x) / sqrt(1.0 + slope * slope);
    float th = 0.013 * (1.0 - 0.7 * s);
    float w = max(th, aa * 0.75);
    float line = exp(-d * d / (w * w)) * th / w;
    float bead = pow(0.5 + 0.5 * sin(s * len * 36.0 + ph), 6.0);         // the stinging cells, in beads
    float b = 0.32 * (0.6 + 0.4 * zf) * (1.0 - 0.55 * s) * (0.7 + 0.6 * bead) * glow * (1.0 - min(bl * 6.0, 0.45));
    float tip = ss(0.7, 0.98, s) * ss(1.0, 0.96, s) * (0.06 + 1.6 * gHigh);
    float rip = gRipA * exp(-pow((s - gRip) / 0.07, 2.0)) * 1.3;
    em += mix(tint, tint2, ss(0.25, 1.0, s)) * line * (b + (tip + rip) * glow);
  }
  // the four oral arms: frilled ribbons hanging from the middle of the bell
  if (lod > 0.5) {
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      float L = fk * 1.5708 - spin;
      float zf = cos(L);
      float x0 = 0.1 * W * sin(L);
      float alen = 1.45 + 0.35 * hash11(seed + fk * 1.3);
      float s = (-0.02 - q.y) / alen;
      if (s < 0.0 || s > 1.0) continue;
      float cx = x0 * (1.0 + 2.2 * s) + 0.1 * s * sin(s * 4.5 - gT * 1.1 + fk * 1.9 + seed);
      float hw = 0.12 * (0.3 + 0.7 * ss(0.0, 0.18, s)) * (1.0 - 0.65 * s) * (1.0 + 0.35 * sin(s * 6.0 + fk * 2.0 + gT * 0.6));
      float xr = q.x - cx;
      float eL = hw * (0.7 + 0.45 * sin(s * 47.0 + fk * 1.3 - gT * 1.3));   // each edge ruffled to its own rhythm
      float eR = hw * (0.7 + 0.45 * sin(s * 53.0 + fk * 2.9 - gT * 1.1 + 1.7));
      float dd = xr < 0.0 ? -xr - eL : xr - eR;
      float w = max(0.006, aa);
      float edge = exp(-dd * dd / (w * w)) * 0.006 / w;
      float inside = ss(aa, -aa, dd);
      float folds = pow(0.5 + 0.5 * sin(xr * 70.0 / max(hw, 0.02) * 0.1 + s * 40.0 - gT * 0.8 + fk), 8.0) * inside;   // the curtain's folds
      float spine = exp(-xr * xr / (w * w * 2.0)) * 0.006 / w;
      float fade = pow(1.0 - s, 0.6) * (0.6 + 0.4 * zf) * (1.0 - min(bl * 9.0, 0.75));
      float rip = gRipA * exp(-pow((s - gRip * 1.15) / 0.09, 2.0)) * (edge * 0.8 + inside * 0.12) * (1.0 - min(bl * 12.0, 0.9));
      em += mix(vec3(0.72, 0.3, 1.25), tint2, 0.45) * ((edge * 0.45 + spine * 0.15 + inside * 0.035 + folds * 0.1) * fade * glow + rip);
      occ = max(occ, inside * 0.12);
    }
  }
  // the bell: a glass dome, its front and back surfaces both seen
  vec3 o = vec3(q.x, 0.0, 0.0) + up * q.y - v * 4.0;
  vec3 sc = vec3(W, H, W);
  vec3 O = o / sc, D = v / sc;
  float a = dot(D, D), b = dot(O, D), cc = dot(O, O) - 1.0;
  float disc = b * b - a * cc;
  if (disc > 0.0) {
    float sq = sqrt(disc);
    float hc = sq / a;
    float sil = ss(0.0, 1.6 * aa, hc * hc / (2.0 * W));
    for (int i = 0; i < 2; i++) {
      float t = (-b + (i == 0 ? -sq : sq)) / a;
      vec3 p = o + v * t;
      vec3 n = normalize(p / (sc * sc));
      float Lr = atan(p.x, -p.z) + spin;
      float cut = 0.035 * abs(sin(Lr * 8.0));                       // the scalloped margin
      float m = ss(cut - aa * 0.5, cut + aa, p.y) * sil;
      if (m <= 0.0) continue;
      float f = abs(dot(n, v));
      float lat = clamp(p.y / H, 0.0, 1.0);
      float memb = min(0.035 / max(f, 0.08), 0.42);                   // the glass is brightest edge-on
      vec3 e = mix(vec3(0.2, 0.12, 0.5), mix(tint2, tint, 0.55 + 0.45 * ss(0.0, 0.6, lat)), 0.3 + 0.7 * (1.0 - f)) * memb;
      e += tint * 0.05 * ss(0.35, 1.0, lat) * (i == 0 ? 1.0 : 0.4);                       // the crown, lit from above
      if (lod > 0.5) e += tint * 0.05 * pow(0.5 + 0.5 * cos(lat * 70.0), 4.0) * ss(0.45, 0.05, lat) * (1.0 - min(bl * 12.0, 1.0));   // the ring muscles near the margin
      if (lod > 0.5) {
        float ck = Lr * 1.2732 + 0.5;
        float cang = fract(ck) - 0.5;
        float major = mod(floor(ck), 2.0) < 0.5 ? 1.0 : 0.55;
        float dc = abs(cang) * 0.7854 * W * sqrt(max(1.0 - lat * lat, 0.0));
        float cw = max(0.011, aa);
        e += mix(tint, vec3(0.85, 0.9, 1.0), 0.3) * exp(-dc * dc / (cw * cw)) * 0.011 / cw * ss(0.95, 0.5, lat) * 0.4 * major;
      }
      float my = max(p.y - cut, 0.0);
      e += tint * exp(-my / max(0.035, aa)) * 0.85;                  // the ring canal on the margin
      float md = (fract(Lr * 5.093 + 0.5) - 0.5) * 0.19635 * W;
      float dw = max(0.017, aa * 1.2);
      float dy = my - 0.028;
      float dk = floor(Lr * 5.093 + 0.5);
      float wave = 0.62 + 0.5 * pow(0.5 + 0.5 * sin(Lr * 2.0 - gT * 1.3 + seed), 2.0);     // a slow wave of light running round the rim
      e += mix(tint2, vec3(1.0), 0.35) * exp(-(md * md + dy * dy) / (dw * dw)) * pow(0.017 / dw, 2.0) * 1.7 * wave * (0.55 + 0.45 * hash11(dk * 3.7 + seed));   // the lights along the rim
      if (i == 0) {
        vec3 R = reflect(v, n);
        e += vec3(0.55, 0.85, 1.0) * pow(max(dot(R, normalize(vec3(-0.35, 0.9, -0.25))), 0.0), 24.0) * 0.3;   // a glint on the glass
        occ = max(occ, 0.3 * m);
      }
      em += e * m * (i == 0 ? 1.0 : 0.6) * glow;
    }
    // the four rings of the gonads, glowing inside the bell
    if (lod > 0.5) {
      float gy = 0.3 * H;
      vec3 g = o + v * ((gy - o.y) / v.y);
      if (length(g.xz) < W * 0.82) {
        float gs = 0.0, gw = max(0.03, aa * 1.4);
        for (int k = 0; k < 4; k++) {
          float A = (float(k) + 0.5) * 1.5708 - spin;
          float dr = abs(length(g.xz - vec2(sin(A), -cos(A)) * 0.34 * W) - 0.13 * W);
          gs += exp(-dr * dr / (gw * gw));
        }
        em += mix(vec3(1.15, 0.3, 0.9), tint2, 0.3) * gs * 0.2 * glow * sil;
      }
    }
  }
  // far away the water takes their colour and most of their light
  em = mix(em, vec3(dot(em, vec3(0.33))) * vec3(0.35, 0.65, 1.15), fog * 0.6) * (1.0 - fog * 0.55);
  col = col * (1.0 - occ * (1.0 - fog)) + em;
}
void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gT = uCruise;
  gRip = -1.0;
  gRipA = 0.0;
  if (uAudioActive > 0.5 && uBeatAge < 0.45 && hash11(uBeatCount * 7.7 + 0.3) < 0.42) {
    gRip = uBeatAge / 0.36;
    gRipA = uPunch * (1.0 - ss(0.3, 0.44, uBeatAge));
  }
  float xs = max(gAsp * 0.9, 0.52);
  float tall = ss(0.6, 1.5, gAsp);

  // where every jelly is and how far through its pulse, first, so the snow can take their light
  vec4 S[12], S2[12];
  gLight = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    vec4 A = JA[i], B = JB[i];
    float fi = float(i), seed = fi * 1.618 + 0.37;
    float r = A.z * (i == 9 ? mix(0.82, 1.0, tall) : 1.0);
    float T = gT * B.z + hash11(seed * 5.3) * 7.0;
    float f = fract(T);
    float bnd = band(B.x);
    float c = ss(0.0, 0.18, f) * (1.0 - ss(0.22, 0.92, f)) * (0.7 + 0.55 * bnd) + 0.45 * gBass;
    c = min(c, 1.0);
    float bob = (ss(0.04, 0.55, f) - f) * 0.22 * r;                   // the lift of the squeeze, the slow sink after
    float roll = A.w + 0.06 * sin(gT * 0.09 + seed * 3.0);
    vec2 axis = vec2(-sin(roll), cos(roll));
    float y;
    if (i == 9) y = A.y + 0.06 * sin(gT * 0.05) + bob;
    else {
      float lo = 1.0 + 1.1 * r + 0.05, P = 2.0 + 6.9 * r + 0.15;
      y = mod(A.y + B.y * gT + bob, P) - lo;
    }
    vec2 pos = vec2(A.x * xs, 0.0) + axis * (y / axis.y);
    float glow = 0.85 + 1.0 * bnd;
    S[i] = vec4(pos, r, roll);
    S2[i] = vec4(c, glow, seed * 2.0 + gT * 0.07 * (mod(fi, 2.0) * 2.0 - 1.0), B.w);
    vec2 d = uv - (pos + axis * 0.35 * r);
    gLight += TINT[int(B.w)] * glow * r * r * 0.5 / (dot(d, d) + r * r * 1.5) * (i < 6 ? 0.3 : 1.0);
  }

  vec3 col = water(uv);
  col += gLight * vec3(0.045, 0.06, 0.075);                              // their light scattered in the water
  col += snow(uv, 54.0, 0.008, 0.0015, 0.5, 1.0, 0.0, 0.14) + snow(uv, 38.0, 0.01, 0.0017, 0.45, 5.0, 0.0, 0.12);
  for (int i = 0; i < 6; i++) {
    vec4 s = S[i], s2 = S2[i];
    int ti = int(s2.w);
    jelly(uv, s.xy, s.z, s.w, s2.z, s2.x, s2.y, TINT[ti], TINT[(ti + 1) % 4], 0.0, 6.0, 0.0, float(i) * 1.618 + 0.37, 0.75, col);
  }
  col += snow(uv, 20.0, 0.016, 0.0026, 0.7, 9.0, 0.0, 0.16);
  for (int i = 6; i < 10; i++) {
    vec4 s = S[i], s2 = S2[i];
    int ti = int(s2.w);
    jelly(uv, s.xy, s.z, s.w, s2.z, s2.x, s2.y, TINT[ti], TINT[(ti + 2) % 4], 0.0, i == 9 ? 18.0 : 13.0, 1.0, float(i) * 1.618 + 0.37, i == 9 ? 0.0 : 0.25, col);
  }
  col += snow(uv, 7.0, 0.03, 0.016, 0.14, 13.0, 1.0, 0.16);
  for (int i = 10; i < 12; i++) {
    vec4 s = S[i], s2 = S2[i];
    int ti = int(s2.w);
    jelly(uv, s.xy, s.z, s.w, s2.z, s2.x, s2.y * 0.55, TINT[ti], TINT[(ti + 1) % 4], 0.07, 12.0, 1.0, float(i) * 1.618 + 0.37, 0.0, col);
  }
  vec2 vg = uv / vec2(max(gAsp, 0.6), 1.0);
  col *= 1.0 - 0.35 * ss(0.4, 1.5, dot(vg, vg));
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'denizanasi', name: 'Denizanası', group: 'Vibe',
  blurb: 'Glass jellyfish glowing in the black deep sea at three depths, pulsing to swim, tentacles trailing, marine snow drifting past',
  tags: ['ocean', 'jellyfish', 'deep sea', 'bioluminescent', 'dreamy', 'cool', 'calm'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
