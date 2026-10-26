import { SCULPT } from '../js/gfx/scene-kit.js';

// EASTERN EXPRESS — the window seat of a night train crossing the snow, the way the Doğu Ekspresi
// runs from Ankara to Kars: moonlit fields and pines outside, the telegraph wires rising and
// falling between the poles, a village with a minaret coming and going; inside, the lamp, the
// curtain, frost in the corners of the glass and a tulip glass of tea on the table.
//
// Outside is real 3-D on one loop of PERIOD metres, textures included, so it never jumps. Things
// stand on rows at fixed distances and each row slides past at the speed its distance gives it:
// the poles flick by, the snow fence goes past, the village takes a while, the hills drift and the
// far ranges barely move (they keep their own, much longer, loop). Snow falls between the window
// and the land, the near flakes streaking past.
//
// Music: the bass rocks the carriage and rings the tea; the mids light the village windows, each
// window its own slice of them; the highs make the snow and the falling flakes glitter; the wires
// carry the waveform. With nothing playing the train runs on, quietly, and nothing pulses.
const frag = `${SCULPT}
const float PERIOD = 600.0;            // the land repeats every 600 m: one village, twelve poles
const float FAR = 24000.0;             // the far ranges loop on a road forty times as long
const float SPEED = 8.0;               // metres per unit of uCruise
const float EYE = 3.0;                 // eye height above the fields: the line runs on a low bank
const float SPAN = 50.0;               // between telegraph poles
const float VILLAGE_X = 48.0;                 // (where the market card catches it)
const vec3 LAMP = vec3(1.0, 0.64, 0.34);
const vec3 HOME = vec3(1.0, 0.55, 0.22);
const vec3 MOONLIT = vec3(0.62, 0.72, 0.96);
const vec3 SKYLIT = vec3(0.11, 0.16, 0.32);
const vec3 HAZE = vec3(0.065, 0.095, 0.19);
const vec2 MOON = vec2(0.34, 0.235);
const float ROWZ[16] = float[16](-12.0, -14.0, -19.0, -24.0, -30.0, -40.0, -55.0, -75.0, -100.0, -125.0, -150.0, -175.0, -210.0, -260.0, -330.0, -420.0);
const int ROWK[16] = int[16](1, 0, 1, 2, 1, 1, 1, 1, 1, 3, 3, 3, 4, 4, 4, 4);   // 0 poles, 1 pines, 2 fence, 3 village, 4 forest edge

float gTravel, gFar, gPix, gBlur, gCalm, gAudible;
vec3 gMoon, gRo, gFwd, gRight, gUp;
float gLens;
vec4 gWin;       // the window glass: centre, half size
float gCorner, gTableY;
vec2 gLampAt;
vec3 gTea;       // the glass of tea: base x, base y, height

// ── small tools ────────────────────────────────────────────────────────────────────────────────
float hashP(vec2 c, float period) { return hash21(vec2(mod(c.x, period), c.y)); }
float noiseP(vec2 p, float period) {
  vec2 i = floor(p), u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  return mix(mix(hashP(i, period), hashP(i + vec2(1.0, 0.0), period), u.x),
             mix(hashP(i + vec2(0.0, 1.0), period), hashP(i + vec2(1.0, 1.0), period), u.x), u.y);
}
// a texture over the land at fx cycles per metre along the line (fx * PERIOD must be whole)
float landNoise(float X, float z, float fx, float fz) { return noiseP(vec2(X * fx, z * fz), PERIOD * fx); }
float seg2(vec2 p, vec2 a, vec2 b) {
  vec2 v = p - a, w = b - a;
  return length(v - w * clamp(dot(v, w) / dot(w, w), 0.0, 1.0));
}
float rbox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float ridged(float n) { return 1.0 - abs(n * 2.0 - 1.0); }
float fogAmount(float t) { return 1.0 - exp(-t * 0.0024); }
vec3 fogged(vec3 c, float t) { return mix(c, HAZE, fogAmount(t)); }
vec3 outsideLight(vec3 n) { return MOONLIT * 0.62 * max(dot(n, gMoon), 0.0) + SKYLIT * (0.55 + 0.45 * n.y); }
float slice(float x) { return gAudible * clamp(spec(x) * 1.5, 0.0, 1.0); }

// ── sky ────────────────────────────────────────────────────────────────────────────────────────
vec3 skyBase(float el) {
  float h = max(el, 0.0);
  vec3 c = mix(vec3(0.050, 0.080, 0.165), vec3(0.016, 0.028, 0.072), ss(0.0, 0.3, h));
  return mix(c, vec3(0.006, 0.010, 0.028), ss(0.25, 1.0, h));
}
// stars as points of a fixed pixel size; a moonlit sky hides the faintest
vec3 starField(vec2 s) {
  vec3 col = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float cell = layer == 0 ? 0.0075 : (layer == 1 ? 0.015 : 0.034);
    vec2 g = s / cell + vec2(fl * 37.1, fl * 11.7);
    vec2 id = floor(g);
    float h = hash21(id * 1.31 + fl * 17.0);
    float keep = layer == 0 ? 0.6 : (layer == 1 ? 0.7 : 0.82);
    if (h < keep) continue;
    float m = (h - keep) / (1.0 - keep);
    vec2 jitter = vec2(hash21(id + 5.3), hash21(id + 9.1)) * 0.56 - 0.28;
    vec2 d = (fract(g) - 0.5 - jitter) * cell / gPix;
    float mag = layer == 0 ? 0.07 + 0.14 * m * m : (layer == 1 ? 0.18 + 0.35 * m * m * m : 0.4 + 1.2 * pow(m, 4.0));
    mag *= ss(2.5, 6.0 + fl * 2.0, cell / gPix);
    float sigma = 0.62 + (layer == 2 ? 0.55 : 0.2) * m;
    float glint = layer > 0 && hash21(id + 13.0) > 0.5 ? pow(slice(0.70 + 0.27 * hash21(id + 21.0)), 2.0) * gCalm : 0.0;
    float twinkle = layer == 0 ? 1.0 : 0.85 + 0.15 * sin(uTime * (0.5 + 1.9 * hash21(id + 2.0)) + h * 60.0);
    col += mix(vec3(0.65, 0.76, 1.0), vec3(1.0, 0.92, 0.8), hash21(id + 4.0)) * exp(-dot(d, d) / (2.0 * sigma * sigma)) * mag * twinkle * (1.0 + 2.2 * glint);
  }
  return col * ss(0.0, 0.12, s.y);
}
vec3 moonDisc(vec2 s, float ang) {
  vec2 d = s - MOON;
  d.x *= cos(MOON.y);
  float r = length(d), R = 0.0125;
  float disc = ss(R + gPix, R - gPix, r);
  float maria = noise(d * 900.0 + 3.0) * 0.6 + noise(d * 2400.0 + 1.0) * 0.4;
  float limb = sqrt(max(0.0, 1.0 - r * r / (R * R)));
  vec3 col = vec3(1.0, 0.98, 0.92) * disc * (0.8 + 0.2 * limb) * (0.84 + 0.16 * ss(0.3, 0.7, maria)) * 1.6;
  return col + vec3(0.5, 0.58, 0.78) * (exp(-ang / 0.02) * 0.09 + exp(-ang / 0.12) * 0.05 + exp(-ang / 0.45) * 0.035);
}
// far ranges: periodic every 4 radians, sliding by gFar / 6000; near hills every 15, by gFar / 1600
float farRange(float a) {
  float n1 = ridged(noiseP(vec2(a * 2.5, 1.0), 10.0)), n2 = ridged(noiseP(vec2(a * 6.0, 2.0), 24.0));
  float n3 = ridged(noiseP(vec2(a * 16.0, 3.0), 64.0)), n4 = noiseP(vec2(a * 45.0, 4.0), 180.0);
  return 0.006 + 0.03 * n1 * n1 + 0.012 * n2 * (0.4 + n1) + 0.006 * n3 * (0.5 + n2) + 0.0025 * n4;
}
float nearHills(float a) {
  return 0.003 + 0.011 * noiseP(vec2(a * 1.0 + 7.0, 5.0), 15.0) + 0.005 * noiseP(vec2(a * 3.2, 6.0), 48.0) + 0.0015 * noiseP(vec2(a * 12.0, 7.0), 180.0);
}
vec3 skyColor(vec3 rd) {
  vec2 s = vec2(atan(rd.x, -rd.z), asin(clamp(rd.y, -1.0, 1.0)));
  float ang = acos(clamp(dot(rd, gMoon), -1.0, 1.0));
  vec3 col = skyBase(s.y) + starField(s) * ss(0.02, 0.2, ang) + moonDisc(s, ang);
  // thin cloud drifting across, its edges silvered near the moon
  if (s.y > 0.05 && s.y < 0.7) {
    float cd = fbm(vec2(s.x * 2.2 + uTime * 0.0035, s.y * 7.5 + 2.0));
    float cloud = ss(0.52, 0.8, cd) * ss(0.05, 0.16, s.y) * ss(0.7, 0.35, s.y);
    vec3 cc = mix(vec3(0.035, 0.05, 0.10), vec3(0.34, 0.39, 0.52), clamp(exp(-ang / 0.3) * 0.9 + 0.12, 0.0, 1.0));
    col = mix(col, cc, cloud * 0.75);
  }
  if (s.y > 0.075) return col;                                    // nothing below reaches this high
  // far snowy ranges: the faces turned to the moon are lit, rock streaks run down the gullies. A
  // face is judged by how the ridge falls a little to its right, the more so the lower it lies, so
  // the line between a lit face and a dark one runs down the mountain at a slant, not plumb
  float af = s.x + gFar / 6000.0;
  float top = farRange(af);
  float inRange = ss(top + gPix * 0.75, top - gPix * 0.75, s.y);
  if (inRange > 0.0) {
    float aa = af + max(top - s.y, 0.0) * 1.4;
    float slope = (farRange(aa + 0.012) - farRange(aa - 0.012)) / 0.024;    // over a stretch: a crest is no knife edge
    float gully = noiseP(vec2(af * 300.0, s.y * 90.0), 1200.0);
    float lit = ss(-0.7, 0.9, -slope * 4.0 + (gully - 0.5) * 1.3);
    vec3 c = mix(vec3(0.105, 0.14, 0.26), vec3(0.32, 0.39, 0.57), lit);     // snow in shadow still outshines the sky
    c *= 0.88 + 0.12 * ss(top - 0.004, top, s.y);
    col = mix(col, mix(c, HAZE * 1.15, 0.35 + 0.5 * ss(top, 0.0, s.y)), inRange);
  }
  // nearer hills, dark with forest, snow on the open slopes
  float an = s.x + gFar / 1600.0;
  float hill = nearHills(an);
  float inHill = ss(hill + gPix * 0.75, hill - gPix * 0.75, s.y);
  if (inHill > 0.0) {
    float trees = ss(0.42, 0.72, noiseP(vec2(an * 260.0, s.y * 110.0), 3900.0) * 0.6 + noiseP(vec2(an * 900.0, s.y * 380.0), 13500.0) * 0.4);
    vec3 c = mix(vec3(0.16, 0.20, 0.33), vec3(0.035, 0.05, 0.08), trees * 0.8);
    col = mix(col, mix(c, HAZE, 0.4 + 0.3 * ss(hill, 0.0, s.y)), inHill);
  }
  // farms and villages far across the plain: warm lights strung along the foot of the hills, in
  // clusters, each listening to its own slice of the mids (1360 cells round the hills' loop). A
  // light's halo spills into the next cells, so every pixel asks its own cell and both neighbours,
  // and the halo fades out within one cell of its light
  if (s.y < 0.02) {
    float lc = 15.0 / 1360.0;
    float gl = an / lc;
    for (int k = -1; k <= 1; k++) {
      float cid = floor(gl) + float(k);
      float hamlet = ss(0.4, 0.72, noiseP(vec2((cid + 0.5) * lc * 1.6, 9.0), 24.0));
      if (hashP(vec2(cid, 3.0), 1360.0) <= mix(0.985, 0.5, hamlet)) continue;
      vec2 ld = vec2((gl - cid - 0.5 - (hashP(vec2(cid, 5.0), 1360.0) - 0.5) * 0.6) * lc, s.y - (0.0006 + 0.0026 * hashP(vec2(cid, 7.0), 1360.0)));
      float dp = length(ld) / gPix;
      float glow = exp(-dp * dp / 1.3) + (0.12 * exp(-dp / 3.5) + 0.25 * exp(-dp / 4.5)) * ss(lc, lc * 0.4, length(ld));
      float music = slice(0.3 + 0.35 * hashP(vec2(cid, 11.0), 1360.0)) * gCalm;
      col += HOME * glow * (0.4 + 0.6 * hashP(vec2(cid, 13.0), 1360.0)) * (0.55 + 1.1 * music) * 1.3;
    }
  }
  return col;
}

// ── the snow fields ───────────────────────────────────────────────────────────────────────────
float drift(float X, float z) { return landNoise(X, z, 0.1, 0.11) * 0.55 + landNoise(X, z, 0.5, 0.4) * 0.3 + landNoise(X, z, 2.0, 1.7) * 0.06; }
vec3 villageGlow(float X, float z) {
  // the street lamps and the windows of the village warm the snow around them; every pool of light
  // dies out before the edge of the patch this looks at, so the patch itself never shows
  float dv = mod(X - VILLAGE_X + PERIOD * 0.5, PERIOD) - PERIOD * 0.5;
  if (abs(dv) > 110.0 || z > -100.0 || z < -200.0) return vec3(0.0);
  vec3 e = vec3(0.0);
  for (int k = -4; k <= 4; k++) {
    vec2 l = vec2(dv - float(k) * 18.0, z + 125.0);
    float d2 = dot(l, l), reach = max(0.0, 1.0 - d2 / 576.0);     // nothing beyond 24 m
    e += HOME * 2.6 * reach * reach / (1.0 + d2 * 0.12);
  }
  float rows = exp(-pow((z + 150.0) / 30.0, 2.0)) * ss(80.0, 40.0, abs(dv)) * ss(-100.0, -112.0, z) * ss(-200.0, -188.0, z);
  return e + HOME * rows * 0.06;
}
vec3 groundColor(vec3 p, vec3 rd, float t) {
  float X = p.x + gTravel, z = p.z;
  float fp = gPix * t / max(-rd.y, 0.02);
  float e = 0.35;
  float h0 = drift(X, z), hx = drift(X + e, z), hz = drift(X, z + e);
  vec3 n = normalize(vec3((h0 - hx) * 1.6 / e, 1.0, (h0 - hz) * 1.6 / e));
  float tone = 0.9 + 0.1 * landNoise(X, z, 1.0, 1.0);
  vec3 alb = vec3(0.80, 0.84, 0.92) * tone;
  // a farm track through the snow, ruts and all
  float track = ss(1.6, 0.9, abs(z + 62.0 + 9.0 * sin(X * 0.0104719755 * 2.0)));
  alb *= 1.0 - 0.18 * track * (0.6 + 0.4 * landNoise(X, z, 2.0, 6.0));
  vec3 col = alb * outsideLight(n) + alb * villageGlow(X, z);
  // glints: a facet catches the moon only from one angle, so they flash as the train moves. Each
  // is a point of about a pixel somewhere in its cell (cells are long in depth, where the snow is
  // foreshortened), measured in pixels across and along the view
  vec2 gc = floor(vec2(X * 6.0, z));
  float gh = hashP(gc, PERIOD * 6.0);
  if (gh > 0.85) {
    float facet = fract(gh * 91.7) * 6.2832;
    float view = atan(p.x, -p.z) * 60.0 + p.z * 0.4;
    vec2 at = (gc + 0.3 + 0.4 * vec2(fract(gh * 37.0), fract(gh * 53.0))) / vec2(6.0, 1.0);
    vec2 dpx = vec2((X - at.x) / (gPix * t), (z - at.y) / fp);
    float flash = pow(max(cos(view - facet), 0.0), 24.0) * ss(0.25, 0.05, fp) * exp(-dot(dpx, dpx) / 1.6) * 2.0;
    col += vec3(0.75, 0.82, 1.0) * flash * (0.35 + 2.2 * slice(0.72 + 0.25 * fract(gh * 13.0)) * gCalm);
  }
  return fogged(col, t);
}

// ── the rows: poles and wires, pines, the snow fence, the village, the far forest edge ─────────
vec4 poleRow(vec3 p, float t) {
  float X = p.x + gTravel;
  float fp = gPix * t, soft = fp + gBlur;
  float du = X - SPAN * floor(X / SPAN + 0.5);                // to the nearest pole
  vec4 acc = vec4(0.0);
  // three wires, sagging between the poles; with music playing they carry the waveform
  float s = fract(X / SPAN);
  float sag = 4.0 * s * (1.0 - s);
  float spanId = floor(X / SPAN);
  float wires = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float y = 6.42 - fk * 0.24 - 0.45 * sag + 0.09 * gAudible * gCalm * wave(fract(s * 0.5 + fk * 0.31 + spanId * 0.13)) * sag;
    float w = 0.012;
    wires = max(wires, ss(w + fp, w * 0.2, abs(p.y - y)) * min(1.0, (w * 2.0) / max(fp, w)));
  }
  if (wires > 0.0) acc = vec4(vec3(0.012, 0.014, 0.02) * wires, wires);
  // the pole: weathered wood, a cross-arm, glass insulators, snow along the arm
  float pole = ss(0.13 + soft, 0.13 - soft, abs(du)) * step(0.0, p.y) * step(p.y, 7.0);
  float arm = ss(0.07 + fp, 0.05 - fp, abs(p.y - 6.5)) * ss(0.8 + soft, 0.75 - soft, abs(du));
  float ins = 0.0;
  for (int k = -2; k <= 2; k++) {
    if (k == 0) continue;
    ins = max(ins, ss(0.07 + soft, 0.03, length(vec2(du - float(k) * 0.32, p.y - 6.62))));
  }
  float a = max(pole, max(arm, ins));
  if (a > 0.0) {
    float side = clamp(du / 0.13, -1.0, 1.0);
    vec3 wood = vec3(0.13, 0.105, 0.09) * (0.75 + 0.25 * noise(vec2(du * 30.0, p.y * 3.0)));
    vec3 c = wood * outsideLight(normalize(vec3(side, 0.15, 0.8)));
    c = mix(c, vec3(0.7, 0.76, 0.9) * outsideLight(vec3(0.0, 1.0, 0.0)) * 1.2, arm * ss(6.5, 6.56, p.y));
    c = mix(c, vec3(0.30, 0.45, 0.46) * (outsideLight(vec3(0.3, 0.4, 0.8)) + 0.15) + MOONLIT * 0.3 * ss(0.03, 0.0, length(vec2(du, p.y - 6.66)) - 0.02), ins);
    c = fogged(c, t);
    acc.rgb = acc.rgb * (1.0 - a) + c * a;
    acc.a = max(acc.a, a);
  }
  return acc;
}

// a snowy pine: tiers of branches that spread near their foot and droop at the tips, each tier a
// little different; half width at height y
float pineHalf(float y, float H, float tiers, float seed) {
  float f = clamp(y / H, 0.0, 1.0);
  float q = f * tiers + seed * 0.37;
  float k = fract(q), tier = floor(q);
  float spread = pow(1.0 - k, 0.75) * ss(0.0, 0.12, k + 0.02);
  float w = H * 0.33 * pow(1.0 - f, 0.9) * (0.45 + 0.55 * spread) * (0.82 + 0.36 * hash11(tier * 7.3 + seed * 31.0));
  return w * (0.84 + 0.32 * noise(vec2(y * 9.0 / max(H * 0.1, 0.4), seed * 40.0)));      // ragged branch ends
}
vec4 pine(float u, float y, float H, float seed, float fp, float soft, float t) {
  if (y < 0.0 || y > H) return vec4(0.0);
  float tiers = 7.0 + floor(seed * 5.0);
  float hw = max(pineHalf(y, H, tiers, seed), y < H * 0.12 ? H * 0.03 : 0.0);
  float a = ss(-soft, soft, hw - abs(u));
  if (a < 0.003) return vec4(0.0);
  float wob = 0.14 * (noise(vec2(u * 2.0 / max(H * 0.1, 0.3), seed * 9.0)) - 0.5);          // tiers are not level
  float k = fract(clamp(y / H, 0.0, 1.0) * tiers + seed * 0.37 + wob);
  // snow sits in clumps on the upper face of each tier; the undersides, the gaps and the tips of
  // the branches stay dark
  float clumps = noise(vec2(u * 2.6, y * 3.0) / max(H * 0.1, 0.3) + seed * 7.0);
  float snow = ss(0.08, 0.3, k) * ss(0.98, 0.62, k);
  snow *= ss(0.3, 0.62, clumps + 0.25 * (1.0 - k));
  snow *= ss(1.0, 0.7, abs(u) / max(hw, 0.01));
  float sideLit = clamp(0.55 + 0.45 * u / max(hw, 0.01), 0.0, 1.0);          // the moon is to the right
  vec3 green = vec3(0.025, 0.05, 0.04) * (SKYLIT * 2.0 + MOONLIT * 0.4 * sideLit);
  vec3 white = vec3(0.78, 0.83, 0.94) * (SKYLIT * 1.2 + MOONLIT * 0.6 * (0.35 + 0.65 * sideLit));
  vec3 c = mix(green, white, snow);
  // the lowest branches sink into a drift instead of ending on a ruled line
  float drift = 0.16 + 0.26 * noise(vec2(u * 1.4, seed * 23.0));
  c = mix(c, vec3(0.80, 0.84, 0.92) * 0.95 * outsideLight(vec3(0.0, 1.0, 0.0)), ss(drift + soft + 0.05, drift - soft, y));
  return vec4(fogged(c, t) * a, a);
}
vec4 pineRow(int i, vec3 p, float t) {
  float fi = float(i);
  float X = p.x + gTravel + fi * 17.3;
  float w = i < 4 ? 15.0 : 12.0;                                  // 40 or 50 plots round the loop
  float cells = PERIOD / w;
  float c = floor(X / w);
  float stand = noiseP(vec2((c + 0.5) * w / 60.0, fi * 3.7), 10.0);   // stands of trees and clearings
  float keep = i < 3 ? 0.93 : mix(0.82, 0.3, ss(0.35, 0.7, stand));
  float h0 = hashP(vec2(c, fi), cells);
  if (h0 < keep) return vec4(0.0);
  float dv = mod(X - fi * 17.3 - VILLAGE_X + PERIOD * 0.5, PERIOD) - PERIOD * 0.5;
  if ((i > 6 && abs(dv) < 90.0) || (i > 3 && abs(dv) < 60.0)) return vec4(0.0);   // the village has its own rows, and a view
  float H = mix(4.5, 10.5, hashP(vec2(c, fi + 9.0), cells)) * (i < 3 ? 0.7 : 1.0);
  float u = X - (c + 0.5) * w - (hashP(vec2(c, fi + 5.0), cells) - 0.5) * max(w - H * 0.75, 0.0);
  float fp = gPix * t;
  return pine(u, p.y, H, hashP(vec2(c, fi + 13.0), cells), fp, fp + gBlur, t);
}
// far rows: a forest edge, one dark serrated line of pines with snow in its gaps
vec4 forestRow(int i, vec3 p, float t) {
  float fi = float(i);
  float X = p.x + gTravel + fi * 23.0;
  float stand = landNoise(X, fi * 2.3, 0.02, 1.0);
  float cover = ss(0.3, 0.55, stand);
  if (cover < 0.01 || p.y > 16.0) return vec4(0.0);
  float q = X / 2.4;
  float c = floor(q);
  float tip = hashP(vec2(c, fi), PERIOD / 2.4) * 0.6 + 0.4;
  float H = (6.0 + 7.0 * stand) * tip;
  float u = (fract(q) - 0.5) * 2.4;
  float hw = H * 0.32 * (1.0 - clamp(p.y / H, 0.0, 1.0)) + 0.5;
  float fp = gPix * t;
  float a = ss(-fp, fp, hw - abs(u)) * cover * step(0.0, p.y) * step(p.y, H);
  if (a < 0.003) return vec4(0.0);
  float snow = ss(0.4, 0.7, noise(vec2(u * 2.0, p.y * 3.0) + c));
  vec3 col = mix(vec3(0.03, 0.05, 0.05) * (SKYLIT * 2.4 + MOONLIT * 0.3), vec3(0.6, 0.66, 0.82) * (SKYLIT + MOONLIT * 0.4), snow * 0.5);
  return vec4(fogged(col, t) * a, a);
}
// the fence only runs in stretches, decided post by post, so a stretch starts and ends at a post
float fenceAt(float c) { return step(0.45, landNoise((c + 0.5) * 2.5, 4.0, 0.02, 1.0)); }
vec4 fenceRow(vec3 p, float t) {
  float X = p.x + gTravel;
  float c = floor(X / 2.5);
  float u = X - (c + 0.5) * 2.5;
  float side = u > 0.0 ? 1.0 : -1.0;                              // the span runs to this neighbour
  float here = fenceAt(c), there = fenceAt(c + side);
  if (here < 0.5) return vec4(0.0);
  float fp = gPix * t, soft = fp + gBlur;
  float buried = 0.22 + 0.2 * landNoise(X, 9.0, 0.5, 1.0);
  if (p.y < buried || p.y > 1.4) return vec4(0.0);
  float lean = (hashP(vec2(c, 3.0), 240.0) - 0.5) * 0.12;
  float post = ss(0.06 + soft, 0.06 - soft, abs(u - lean * p.y)) * step(p.y, 1.28) * step(0.12, hashP(vec2(c, 7.0), 240.0));
  float span = c + min(side, 0.0);                                // a missing rail is a whole span
  float rails = max(ss(0.035 + fp, 0.035 - fp, abs(p.y - 0.62)), ss(0.035 + fp, 0.035 - fp, abs(p.y - 1.05))) * step(0.2, hashP(vec2(span, 11.0), 240.0)) * there;
  float a = max(post, rails);
  if (a < 0.003) return vec4(0.0);
  vec3 wood = vec3(0.10, 0.08, 0.065) * (outsideLight(vec3(0.4, 0.2, 0.8)) + 0.04);
  float capped = max(ss(1.2, 1.26, p.y) * post, ss(0.0, 0.03, p.y - 0.62) * ss(0.07, 0.03, p.y - 0.62) + ss(0.0, 0.03, p.y - 1.05) * ss(0.07, 0.03, p.y - 1.05));
  vec3 col = mix(wood, vec3(0.75, 0.8, 0.92) * outsideLight(vec3(0.0, 1.0, 0.0)), clamp(capped, 0.0, 1.0));
  return vec4(fogged(col, t) * a, a);
}

// a village house: plastered walls, a pitched roof under snow, warm windows, a chimney that smokes
vec4 house(float u, float y, float seed, float fp, float t, float row) {
  float w = 3.0 + 1.6 * fract(seed * 7.1);
  float wallH = 2.7 + 0.8 * fract(seed * 3.3);
  float roofH = 1.4 + 0.6 * fract(seed * 5.7);
  float ov = 0.35;
  float roofHalf = (w + ov) * (1.0 - (y - wallH) / roofH);
  float inRoof = step(wallH - 0.18, y) * step(y, wallH + roofH) * ss(fp, -fp, (abs(u) - roofHalf) * roofH / length(vec2(roofH, w + ov)));   // (true distance to the slope)
  float inWall = step(0.0, y) * step(y, wallH) * ss(fp, -fp, abs(u) - w);
  float chimX = w * 0.45 * (fract(seed * 11.0) > 0.5 ? 1.0 : -1.0);
  float chimTop = wallH + roofH * (1.0 - abs(chimX) / (w + ov)) + 0.8;
  float inChim = ss(fp, -fp, abs(u - chimX) - 0.25) * step(wallH, y) * step(y, chimTop);
  float a = max(max(inRoof, inWall), inChim);
  vec3 col = vec3(0.0);
  if (a > 0.003) {
    if (inWall >= max(inRoof, inChim)) {
      vec3 plaster = mix(vec3(0.30, 0.30, 0.34), vec3(0.42, 0.36, 0.30), fract(seed * 19.0));
      col = plaster * (SKYLIT * 1.1 + MOONLIT * 0.18);
      // windows facing the line: one to three, most of them lit
      float nW = 1.0 + floor(fract(seed * 13.0) * 3.0);
      float cell = (u + w) / (2.0 * w) * nW;
      float k = floor(cell), lx = fract(cell) - 0.5;
      float inWin = ss(fp * 0.5, 0.0, abs(lx) * 2.0 * w / nW - 0.42) * ss(fp, 0.0, abs(y - 1.45) - 0.42);
      float lit = step(0.28, fract(seed * 17.0 + k * 0.37));
      float glow = 0.75 + 0.9 * slice(0.3 + 0.35 * fract(seed * 23.0 + k * 0.41)) * gCalm;
      vec3 pane = mix(vec3(0.02, 0.025, 0.04), HOME * 1.6 * glow, lit);
      pane *= 1.0 - 0.75 * max(ss(0.06, 0.03, abs(lx) * 2.0 * w / nW), ss(0.05, 0.02, abs(y - 1.45)));
      col = mix(col, pane, inWin);
      col *= 1.0 - 0.35 * ss(0.7, 0.0, y);                        // a drift against the foot of the wall
      col = mix(col, vec3(0.7, 0.75, 0.88) * outsideLight(vec3(0.0, 1.0, 0.0)), ss(0.35 + 0.2 * noise(vec2(u * 2.0, seed * 9.0)), 0.1, y));
    } else {
      // snow on the roof, a darker eave line under it
      col = vec3(0.80, 0.85, 0.95) * outsideLight(normalize(vec3(sign(u) * 0.6, 0.8, 0.3)));
      col *= 0.82 + 0.18 * ss(-0.3, 0.3, u);
      col = mix(col, vec3(0.06, 0.05, 0.05) * SKYLIT * 3.0, ss(0.12, 0.0, y - wallH + 0.06) * inRoof);
      if (inChim > inRoof) col = vec3(0.22, 0.2, 0.2) * (SKYLIT + MOONLIT * 0.3);
    }
  }
  vec4 res = vec4(col * a, a);
  // chimney smoke drifting off with the wind, breaking into puffs as it climbs
  float sy = y - chimTop;
  if (sy > 0.0 && sy < 9.0) {
    float sx = u - chimX + sy * 0.7 + 0.35 * sin(sy * 0.7 - uTime * 0.5 + seed * 20.0);
    float width = 0.22 + sy * 0.18;
    float puff = exp(-sx * sx / (width * width)) * ss(8.0, 1.5, sy) * ss(0.0, 0.6, sy);
    float billow = noise(vec2(sx * 1.3, sy * 1.1 - uTime * 0.45)) * 0.65 + noise(vec2(sx * 2.9, sy * 2.4 - uTime * 0.8)) * 0.35;
    puff *= 0.3 * ss(0.32, 0.72, billow);
    puff *= step(0.35, fract(seed * 29.0));
    vec3 smoke = vec3(0.45, 0.5, 0.62) * (SKYLIT * 1.5 + MOONLIT * 0.35);
    res.rgb = res.rgb + (1.0 - res.a) * smoke * puff;
    res.a = res.a + (1.0 - res.a) * puff;
  }
  res.rgb = mix(res.rgb, HAZE * res.a, fogAmount(t));
  return res;
}
// the mosque: a square prayer hall, its dome under snow, the minaret with a light on its balcony
vec4 mosque(float u, float y, float fp, float t) {
  float hall = step(0.0, y) * step(y, 6.2) * ss(fp, -fp, abs(u) - 6.5);
  float dome = step(6.0, y) * ss(fp, -fp, length(vec2(u, (y - 6.2) * 1.05)) - 4.4);
  float drum = step(6.2, y) * step(y, 6.9) * ss(fp, -fp, abs(u) - 4.6);
  float alem = ss(fp + 0.05, 0.0, abs(u)) * step(10.7, y) * step(y, 11.9);
  float um = u - 8.4;
  float shaft = step(0.0, y) * step(y, 21.6) * ss(fp, -fp, abs(um) - 0.85);
  float balcony = step(16.9, y) * step(y, 17.6) * ss(fp, -fp, abs(um) - 1.35);
  float cap = step(21.5, y) * step(y, 25.6) * ss(fp, -fp, abs(um) - 0.95 * (25.6 - y) / 4.1);
  float tipAlem = ss(fp + 0.04, 0.0, abs(um)) * step(25.5, y) * step(y, 26.5);
  float a = max(max(max(hall, dome), max(drum, alem)), max(max(shaft, balcony), max(cap, tipAlem)));
  if (a < 0.003) return vec4(0.0);
  vec3 plaster = vec3(0.40, 0.40, 0.44) * (SKYLIT * 1.1 + MOONLIT * 0.2);
  vec3 snow = vec3(0.82, 0.86, 0.96) * outsideLight(vec3(0.3, 0.9, 0.3));
  vec3 col = plaster;
  if (dome > 0.5 || cap > 0.5) col = mix(vec3(0.16, 0.17, 0.2) * (SKYLIT + MOONLIT * 0.35), snow, ss(0.0, 0.5, dome > 0.5 ? (y - 7.0) / 3.0 : (25.0 - y) / 3.0) * 0.8);
  if (alem > 0.5 || tipAlem > 0.5) col = vec3(0.7, 0.6, 0.3) * (SKYLIT + MOONLIT * 0.6);
  // arched windows of the hall and the balcony's ring of lights
  float wx = mod(u + 1.6, 3.2) - 1.6;
  float arch = max(abs(wx) - 0.55, y > 4.0 ? length(vec2(wx, y - 4.0)) - 0.55 : abs(y - 3.0) - 1.0);
  float lit = 0.8 + 0.8 * slice(0.36 + 0.06 * floor((u + 1.6) / 3.2)) * gCalm;
  col = mix(col, HOME * 1.5 * lit, ss(fp, -fp, arch) * hall * step(abs(u), 6.0) * step(1.9, y));
  col = mix(col, HOME * 2.2 * (0.8 + 0.8 * slice(0.5) * gCalm), balcony * ss(0.25, 0.05, abs(y - 17.25)));
  col = mix(col, snow, ss(6.05, 6.2, y) * hall * step(y, 6.25));
  return vec4(fogged(col, t) * a, a);
}
vec4 villageRow(int i, vec3 p, float t) {
  float X = p.x + gTravel;
  float dv = mod(X - VILLAGE_X + PERIOD * 0.5, PERIOD) - PERIOD * 0.5;   // metres from the centre
  if (abs(dv) > 85.0) return vec4(0.0);
  float fi = float(i), fp = gPix * t;
  if (i == 10 && abs(dv - 4.0) < 12.0) return mosque(dv - 4.0, p.y, fp, t);
  // street lamps along the lane in front of the first row
  vec4 res = vec4(0.0);
  if (i == 9) {
    float lx = dv - 18.0 * floor(dv / 18.0 + 0.5);
    // never smaller than a pixel and a half, and the same light whatever size that makes it, so a
    // small picture (the market card) gets points, not lanterns
    float size = max(fp * 1.4, 0.17);
    float lamp = exp(-length(vec2(lx, p.y - 4.6)) / size) * (0.0289 / (size * size)) * step(abs(dv), 75.0);
    float post = ss(0.07 + fp, 0.0, abs(lx)) * step(p.y, 4.6) * step(abs(dv), 75.0);
    res = vec4(HOME * (2.0 + 1.0 * slice(0.42) * gCalm) * lamp + vec3(0.04) * post, max(post * 0.8, 0.0));
    res.rgb = mix(res.rgb, HAZE * res.a, fogAmount(t));           // haze only where something stands
  }
  float off = fi * 5.3;
  float c = floor((dv + off) / 12.0);
  float u = dv + off - (c + 0.5) * 12.0;
  float seed = hash21(vec2(c, fi * 7.0 + 1.0));
  if (seed < 0.22 || abs(dv) > 72.0 - 10.0 * fract(seed * 5.0)) return res;
  vec4 h = house(u - (fract(seed * 3.0) - 0.5) * 2.0, p.y, seed, fp, t, fi);
  return vec4(res.rgb + (1.0 - res.a) * h.rgb, res.a + (1.0 - res.a) * h.a);
}

vec4 rowLayer(int i, vec3 p, float t) {
  int kind = ROWK[i];
  float tallest = kind == 0 ? 7.3 : (kind == 1 ? 11.0 : (kind == 2 ? 1.5 : (kind == 3 ? 27.0 : 16.0)));
  if (p.y > tallest || p.y < -0.2) return vec4(0.0);
  if (kind == 0) return poleRow(p, t);
  if (kind == 1) return pineRow(i, p, t);
  if (kind == 2) return fenceRow(p, t);
  if (kind == 3) return villageRow(i, p, t);
  return forestRow(i, p, t);
}
vec3 world(vec3 ro, vec3 rd) {
  float tG = rd.y < -1e-4 ? -ro.y / rd.y : 1e9;
  vec3 col = tG < 1e8 ? groundColor(ro + rd * tG, rd, tG) : skyColor(rd);
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 16; i++) {
    float t = (ROWZ[i] - ro.z) / rd.z;
    if (t > tG) break;
    if (t <= 0.0) continue;
    vec4 layer = rowLayer(i, ro + rd * t, t);
    acc.rgb += (1.0 - acc.a) * layer.rgb;              // (a glow may bring light and no cover)
    acc.a += (1.0 - acc.a) * layer.a;
    if (acc.a > 0.985) break;
  }
  return col * (1.0 - acc.a) + acc.rgb;
}

// Snow falling between the window and the land, in four planes. A flake rides past at the train's
// speed and falls; the near ones streak, lit warm by the carriage's own windows, the far ones are
// specks in the moonlight. Some of them catch the highs.
vec3 snowfall(vec2 uv) {
  vec3 col = vec3(0.0);
  float speed = SPEED * uCruiseRate;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float d = 1.4 * pow(2.0, fi);
    vec2 P = uv * d / gLens;
    float fall = 1.0 + 0.25 * fi;
    float cs = i == 0 ? 0.6 : (i == 1 ? 0.5 : 0.4);
    vec2 q = vec2(P.x + gTravel + 0.3 * sin(P.y * 0.8 + uTime * 0.6 + fi), P.y + fall * uTime) / cs;
    vec2 id = floor(q);
    float h = hashP(vec2(id.x, id.y + fi * 131.0), PERIOD / cs);
    if (h < (i == 0 ? 0.93 : (i == 1 ? 0.82 : 0.7))) continue;
    // the flake sits where the whole streak it draws while the shutter is open stays in its cell,
    // even at the train's top speed; the nearest flakes are out of focus, soft blobs, not pills
    float r = (0.012 + 0.01 * hash21(id + 1.3)) / cs;
    float soft = r * (i == 0 ? 0.9 : (i == 1 ? 0.5 : 0.0));
    float reach = (SPEED * 1.6 * 0.012 + 0.022 * 1.9) / cs;
    vec2 c = vec2(mix(-0.5 + reach, 0.5 - 0.022 * 1.9 / cs, hash21(id + 3.7)), (hash21(id + 8.1) - 0.5) * 0.6);
    vec2 f = fract(q) - 0.5 - c;                                   // cell units from the flake
    vec2 v = vec2(-speed, -fall) * 0.012 / cs;
    float dd = seg2(f, vec2(0.0), v);
    float px = gPix * d / gLens / cs;                              // a pixel, in cell units
    float spot = ss(r + soft + px, max(r - soft - px, 0.0), dd) * min(1.0, (r * 2.0 + px) / (r * 2.0 + length(v) + px));
    vec3 tint = mix(LAMP * 0.42, MOONLIT * 0.32, ss(1.5, 7.0, d));
    float glint = hash21(id + 5.5) > 0.7 ? 1.0 + 2.0 * slice(0.75 + 0.2 * hash21(id + 2.2)) * gCalm : 1.0;
    col += tint * spot * glint * (i == 0 ? 0.22 : (i == 1 ? 0.45 : 0.75));
  }
  return col;
}

// ── the compartment ───────────────────────────────────────────────────────────────────────────
vec3 lampLight(vec2 uv) { vec2 l = uv - gLampAt; return LAMP * (1.5 / (1.0 + dot(l, l) * 1.5)); }
float curtainEdge(float y) { return gWin.x - gWin.z + mix(0.24, 0.13, ss(1.2, 0.72, uRes.x / uRes.y)) + 0.025 * sin(y * 7.0 + 0.6) + 0.012 * sin(y * 19.0); }
vec3 curtainColor(vec2 uv) {
  float folds = 0.5 + 0.5 * sin(uv.x * 62.0 + sin(uv.y * 2.4) * 1.6);
  float sheen = pow(folds, 6.0);
  vec3 velvet = vec3(0.36, 0.045, 0.05) * (0.45 + 0.55 * folds) + vec3(0.5, 0.18, 0.15) * sheen * 0.4;
  float edge = ss(0.06, 0.0, curtainEdge(uv.y) - uv.x);           // the lit edge facing the window
  return velvet * (lampLight(uv) * 0.9 + vec3(0.09, 0.08, 0.1)) + MOONLIT * 0.07 * edge;
}
vec3 interiorWall(vec2 uv, float dWin) {
  vec3 col;
  if (uv.y < gTableY) {
    // the fold-down table: laminate, glossy where it mirrors the bright window, a chrome edge
    float depth = (gTableY - uv.y);
    vec3 wood = vec3(0.30, 0.19, 0.11) * (0.82 + 0.18 * noise(vec2(uv.x * 9.0, depth * 60.0)));
    col = wood * (lampLight(uv) * 0.8 + 0.08);
    col += vec3(0.22, 0.27, 0.36) * exp(-depth * 9.0) * ss(gWin.z + 0.1, gWin.z - 0.3, abs(uv.x - gWin.x)) * 0.6;
    col += LAMP * 0.06 * exp(-length((uv - vec2(gLampAt.x, gTableY - 0.2)) * vec2(1.0, 3.0)) * 3.0);
    col = mix(col, vec3(0.5, 0.48, 0.45) * (lampLight(uv) * 0.6 + 0.1), ss(0.012, 0.0, abs(depth - 0.008)));
    return col;
  }
  if (dWin < 0.06) {
    // the frame: anodised aluminium with a rubber gasket against the glass
    float bevel = ss(0.0, 0.06, dWin);
    col = vec3(0.45, 0.43, 0.40) * (lampLight(uv) * 0.6 + 0.1) * (0.7 + 0.3 * bevel);
    col += MOONLIT * 0.12 * exp(-dWin * 80.0);
    col = mix(vec3(0.012), col, ss(0.008, 0.016, dWin));
    col *= 1.0 - 0.3 * ss(0.05, 0.06, dWin);
    return col;
  }
  // the wall: a warm wood laminate, lit by the reading lamp, a little of the cold window light
  float grain = noise(vec2(uv.x * 2.0, uv.y * 70.0)) * 0.6 + noise(vec2(uv.x * 9.0, uv.y * 210.0)) * 0.4;
  col = vec3(0.34, 0.21, 0.12) * (0.82 + 0.25 * grain) * (lampLight(uv) * 0.85 + 0.11);
  col += MOONLIT * 0.05 * exp(-dWin * 9.0);
  // the reading lamp: a brass shade, the bulb glowing under it
  vec2 lq = (uv - gLampAt) / vec2(0.075, 0.042);
  float shade = ss(1.05, 0.95, length(lq)) * step(lq.y, 0.2);
  col = mix(col, vec3(0.55, 0.40, 0.18) * (0.45 + 0.8 * ss(-1.0, 0.6, lq.x)), shade);
  col += LAMP * 2.4 * exp(-length((uv - gLampAt - vec2(0.0, -0.035)) * vec2(1.0, 2.2)) * 38.0);
  return col;
}
vec3 glassExtras(vec2 uv, vec3 col) {
  // the night glass mirrors the room a little: the lamp, the warmth of the compartment
  vec2 g = (uv - gWin.xy) / gWin.zw;
  col += LAMP * 0.12 * exp(-length((uv - (gLampAt + vec2(-0.05, -0.18))) * vec2(1.0, 1.4)) * 6.0);
  col += vec3(0.05, 0.03, 0.02) * ss(-0.2, 1.0, g.x) * 0.5;
  // condensation along the bottom, frost growing in from the lower corners
  col = mix(col, vec3(0.20, 0.21, 0.26) + LAMP * 0.05, 0.16 * ss(-0.55, -1.0, g.y));
  float corner = max(ss(0.7, 0.0, length((g - vec2(-1.0, -1.0)) * vec2(1.2, 1.0))), ss(0.55, 0.0, length((g - vec2(1.0, -1.0)) * vec2(1.3, 1.0))));
  float crystals = ridged(noise(uv * 26.0)) * 0.6 + ridged(noise(uv * 71.0 + 3.0)) * 0.4;
  float frost = ss(0.62, 0.7, crystals * (0.55 + 0.6 * corner)) * corner;
  col = mix(col, vec3(0.62, 0.68, 0.8) * (MOONLIT * 0.45 + lampLight(uv) * 0.25) + 0.04, frost * 0.85);
  // snow heaped on the outside sill
  float sill = gWin.y - gWin.w + 0.03 + 0.012 * noise(vec2(uv.x * 14.0, 1.0));
  col = mix(col, vec3(0.62, 0.68, 0.82) * (MOONLIT * 0.4 + 0.12) + LAMP * 0.05, ss(0.004, -0.004, uv.y - sill));
  // the bar of the top light
  float bar = gWin.y + gWin.w * 0.42;
  col = mix(col, vec3(0.45, 0.43, 0.40) * (lampLight(uv) * 0.6 + 0.12), ss(0.016, 0.012, abs(uv.y - bar)));
  return col;
}
vec3 backdrop(vec2 uv) {
  float dWin = rbox(uv - gWin.xy, gWin.zw, gCorner);
  float cur = ss(0.004, -0.004, uv.x - curtainEdge(uv.y)) * step(gTableY, uv.y);
  if (cur > 0.999) return curtainColor(uv);
  vec3 col;
  if (dWin < 0.0 && uv.y > gTableY) {
    vec3 rd = normalize(gRight * uv.x + gUp * uv.y + gFwd * gLens);
    col = world(gRo, rd) + snowfall(uv);
    col = glassExtras(uv, col);
  } else {
    col = interiorWall(uv, max(dWin, 0.0));
  }
  return mix(col, curtainColor(uv), cur);
}

// The tulip glass: its profile (half width against height), a saucer, a spoon, sugar, steam.
float tulip(float h) { return 0.50 + 0.17 * exp(-pow((h - 0.27) / 0.2, 2.0)) - 0.05 * exp(-pow((h - 0.62) / 0.15, 2.0)) + 0.18 * ss(0.7, 1.0, h); }
vec3 teaGlass(vec2 uv, vec3 col) {
  float H = gTea.z;
  vec2 b = uv - gTea.xy;                         // from the middle of the glass's foot
  float h = b.y / H;
  float px = 2.0 / uRes.y;
  // the saucer: white porcelain with a gold line, seen from a little above
  vec2 sq = b / vec2(H * 0.6, H * 0.085);
  float saucer = ss(1.0 + px * 12.0, 1.0, length(sq + vec2(0.0, 0.25)));
  if (saucer > 0.0 && h < 0.08) {
    vec3 por = vec3(0.86, 0.84, 0.80) * (lampLight(uv) * 0.75 + 0.12) * (0.75 + 0.25 * ss(-1.0, 0.6, sq.y));
    por = mix(por, vec3(0.75, 0.55, 0.2) * lampLight(uv), ss(0.05, 0.0, abs(length(sq + vec2(0.0, 0.25)) - 0.86)) * 0.8);
    por *= 1.0 - 0.45 * exp(-length(sq * vec2(1.7, 1.0)) * 2.2) * ss(0.4, -0.2, sq.y);          // the glass's shadow
    por += vec3(0.5, 0.12, 0.03) * 0.12 * exp(-length((sq - vec2(-0.5, 0.0)) * vec2(1.0, 2.0)) * 2.5);   // light through the tea
    col = mix(col, por, saucer);
  }
  float r = tulip(clamp(h, 0.0, 1.0)) * 0.46 * H;
  float xi = b.x / r;
  float footE = 0.16 * tulip(0.0) * 0.46;                       // the base ellipse's half height, in heights
  if (h < 0.0) { r *= sqrt(max(0.0, 1.0 - (h / footE) * (h / footE))); xi = b.x / max(r, 1e-5); }
  float inGlass = ss(1.0 + px / max(r, 1e-4), 1.0 - px / max(r, 1e-4), abs(xi)) * step(-footE, h) * step(h, 1.0);
  float lip = 0.16 * tulip(1.0) * 0.46 * H;                      // the rim's ellipse, seen from above
  float mouth = ss(1.0 + px * 3.0, 1.0, length(vec2(b.x / (tulip(1.0) * 0.46 * H), (b.y - H) / lip)));
  float level = 0.80 + 0.012 * sin(uTime * 1.7) * gBass * gAudible;
  // the spoon, leaning in the glass
  float spoon = ss(0.009 * H + px, 0.006 * H, seg2(b, vec2(-0.1 * H, 0.5 * H), vec2(0.2 * H, 1.2 * H)));
  if (inGlass > 0.0 || mouth > 0.0) {
    float th = sqrt(max(0.0, 1.0 - xi * xi));
    // what is behind, bent by the glass
    vec3 behind = backdrop(uv + vec2(-xi * 0.045 * H, 0.0));
    float back = dot(behind, vec3(0.3, 0.5, 0.2));
    vec3 g;
    if (h < level) {
      // tea: deep red, glowing where the light from the window comes through its edges
      float tr = exp(-2.6 * th);
      vec3 through = lampLight(uv) * ss(-0.6, 1.0, xi) * 0.9 + vec3(back * 2.2);
      g = vec3(0.12, 0.016, 0.006) * (lampLight(uv) * 0.7 + 0.12) + vec3(1.0, 0.32, 0.06) * through * tr * 1.25;
      g += vec3(0.6, 0.16, 0.04) * 0.08 * ss(level - 0.08, level, h);
    } else {
      g = behind * vec3(0.9, 0.93, 0.92) * (0.85 + 0.15 * th);
    }
    // the glass itself: a lamp streak, a cold streak from the window, bright edges, a thick foot
    g += LAMP * 0.55 * exp(-pow((xi - 0.55) / 0.08, 2.0)) * ss(0.05, 0.3, h);
    g += MOONLIT * 0.25 * exp(-pow((xi + 0.62) / 0.1, 2.0));
    g += vec3(0.25, 0.27, 0.3) * ss(0.82, 1.0, abs(xi)) * 0.6;
    g = mix(g, vec3(0.5, 0.45, 0.4) * (lampLight(uv) * 0.5 + 0.1), ss(0.07, 0.04, h) * 0.5);
    // the surface of the tea: the lamp in it, and rings when the bass hits the carriage
    vec2 sv = vec2(b.x / (tulip(level) * 0.46 * H * 0.97), (b.y - level * H) / (lip * 0.9));
    float surf = ss(1.0 + px * 6.0, 1.0, length(sv));
    if (surf > 0.0) {
      float rho = length(sv);
      float rings = sin(rho * 26.0 - uTime * 9.0) * exp(-rho * 1.2) * (gBass * 0.8 + gHit * 0.6) * gAudible;
      vec3 sc = vec3(0.32, 0.07, 0.02) * (lampLight(uv) * 0.8 + 0.1) + LAMP * 0.7 * exp(-length(sv - vec2(0.35, 0.2)) * 4.0) * (0.7 + 0.5 * rings);
      sc += MOONLIT * 0.18 * ss(0.6, 1.0, rho) * (0.6 + 0.4 * rings);
      g = mix(g, sc, surf);
    }
    col = mix(col, g, max(inGlass, mouth * step(level, h) * 0.6));
    col += vec3(0.5, 0.5, 0.52) * 0.35 * ss(0.05, 0.0, abs(length(vec2(b.x / (tulip(1.0) * 0.46 * H), (b.y - H) / lip)) - 1.0)) * ss(-0.2, 0.3, (b.y - H) / lip + 1.0);
  }
  // the spoon: steel above the tea, a dim shape seen through it below
  if (spoon > 0.0) {
    float above = ss(level * H - 0.01 * H, level * H + 0.01 * H, b.y);
    vec3 steel = vec3(0.7, 0.72, 0.75) * (lampLight(uv) * 0.7 + 0.1) + LAMP * 0.5 * ss(0.0, 0.004 * H, 0.006 * H - seg2(b, vec2(-0.1 * H, 0.5 * H), vec2(0.2 * H, 1.2 * H)));
    col = mix(col, mix(col * vec3(1.2, 0.8, 0.7), steel, above), spoon * (0.4 + 0.6 * above));
  }
  // steam curling up off the tea
  float sy = (b.y - H) / H;
  if (sy > 0.0 && sy < 1.4) {
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float sx = b.x / H - (fk - 0.5) * 0.12 - 0.07 * sin(sy * 7.0 - uTime * 1.5 + fk * 2.0) * sy - 0.03 * sin(sy * 17.0 - uTime * 2.3);
      float wisp = exp(-abs(sx) / (0.012 + 0.03 * sy)) * ss(1.4, 0.3, sy) * ss(0.0, 0.15, sy);
      col += (LAMP * 0.25 + vec3(0.08)) * wisp * 0.12;
    }
  }
  return col;
}

void main() {
  musicSignals();
  vec2 uv = centered();
  float aspect = uRes.x / uRes.y;
  float pf = ss(1.15, 0.72, aspect);                     // 1 for a phone held upright
  gCalm = mix(0.4, 1.0, clamp((uPunch - 0.25) / 0.75, 0.0, 1.0));
  gAudible = uAudioActive;
  gTravel = mod(uCruise * SPEED, PERIOD);
  gFar = mod(uCruise * SPEED, FAR);
  gBlur = SPEED * uCruiseRate * 0.022;
  gLens = mix(1.9, 1.6, pf);
  gPix = 2.0 / uRes.y / gLens;
  gMoon = normalize(vec3(sin(MOON.x) * cos(MOON.y), sin(MOON.y), -cos(MOON.x) * cos(MOON.y)));

  // the layout: a wide window with a table under it, or a tall one on a phone
  gWin = mix(vec4(-0.08, 0.12, min(1.22, aspect * 0.7), 0.58), vec4(0.0, 0.14, aspect * 0.84, 0.44), pf);
  gCorner = mix(0.1, 0.08, pf);
  gTableY = gWin.y - gWin.w - mix(0.085, 0.07, pf);
  gLampAt = vec2(gWin.x + gWin.z * mix(0.84, 0.7, pf), gWin.y + gWin.w + mix(0.16, 0.12, pf));
  gTea = mix(vec3(0.78, -0.9, 0.42), vec3(0.17, -0.82, 0.38), pf);

  // the carriage rides the rails: a slow sway, the jolt of each rail joint, and the bass under it
  float joints = fract(gTravel / 25.0);
  float jolt = exp(-joints * 40.0) * 0.006;
  float sway = (landNoise(gTravel, 0.0, 0.1, 1.0) - 0.5) * 0.02 + (landNoise(gTravel, 5.0, 0.5, 1.0) - 0.5) * 0.008;
  float bob = jolt + sway * 0.25 + (0.006 * gBass + 0.004 * gHit) * gAudible * gCalm;
  float horizon = mix(0.05, 0.06, pf);
  float pitch = -atan(horizon / gLens) + bob * 0.05;
  gRo = vec3(0.0, EYE + bob, 0.0);
  gFwd = normalize(vec3(0.0, sin(pitch), -cos(pitch)));
  gRight = normalize(cross(gFwd, vec3(sway * 0.12, 1.0, 0.0)));
  gUp = cross(gRight, gFwd);

  vec3 col = backdrop(uv);
  // the glass of tea stands in front of everything
  vec2 tb = uv - gTea.xy;
  if (abs(tb.x) < gTea.z * 0.7 && tb.y > -gTea.z * 0.12 && tb.y < gTea.z * 2.5) col = teaGlass(uv, col);
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'express', name: 'Eastern Express', group: 'Journey',
  blurb: 'A night train across the snow, Doğu Ekspresi style: wires rising and falling past the window, a village with a minaret going by, and a glass of tea that rings with the bass',
  tags: ['3d', 'train', 'snow', 'night', 'winter', 'turkish', 'tea', 'calm'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
