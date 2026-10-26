// EBRU — Turkish paper marbling, seen from straight above a tray of gum water. Every 32 beats a
// whole piece is made and taken off on paper, the way an ebru master works: a pale battal ground,
// combed across and back, is already floating on the fresh bath; the brush is flicked over it and
// stones of earth pigment fall two at a time (lapis, madder, ochre, verdigris, soot, umber, rose),
// some landing inside the one before so they ring, each pushing the paint around it outward until
// the older stones are squeezed into thin veined bands; a comb (tarak) is drawn down through the
// bath and back up between its own lines, dragging everything into gel-git chevrons; three tulips
// (lale) are made, each a stone with a paler stone and a heart dropped inside it, pulled into shape
// with a needle (biz) — up through the middle for the tip, up and out at the sides for the petals —
// its stem drawn down out of a drop of green and its two leaves out of two more; then a sheet of
// paper is laid on the bath, the pattern showing through as it soaks, and lifted off again.
//
// The drop is the real mathematics of marbling: a drop of radius r landing at c moves every bit
// of paint already there from p to c + (p − c)·√(1 + r²/|p − c|²), which keeps its area, and a
// stylus drawn along a line drags the paint near it along the line. To colour a pixel the scene
// walks those moves backwards, newest first, carrying the stretch of the paint (the Jacobian) with
// it, so every vein stays a crisp hairline however hard it has been squeezed or combed. The whole
// piece is rebuilt from the beat counter each frame: nothing is stored, nothing ever pops.
//
// One piece is 32 beats, one step a beat, each step done within its beat: 0 the paper comes off ·
// 1–7 a flick of the brush each, two stones · 8–11 the comb goes down a notch a beat · 12–14 more
// flicks · 15–18 the comb comes back up · 19–30 three tulips, four beats each (the stones, the
// needle up the middle, the side petals as the green falls, the stem and leaves drawn out) · 31
// the paper goes on. On top of the beat: the BASS makes every stone and tulip splash out wider as
// it lands and sends a ring through the bath, and lets all the stones breathe; the MIDS sway the
// gum water, so the whole sheet drifts like liquid; the HIGHS flick a spray of serpme on every
// beat, drops of every size that land, push the pattern aside, spread and sink before the next,
// more and bigger the brighter the highs. With nothing playing the master works on slowly by the
// clock, and the gum water only drifts.
const frag = `
const float IDLE = 1.15;          // with nothing playing, one step of the piece every 1.15 s
const float BIG = 1e3;            // the age of a step that is long finished
float gPx, gAsp, gSz, gBass, gMid, gHigh;
int gSet;
// the walk back through time: where this pixel's paint was, how stretched it is (d where / d screen),
// the colour gathered so far, and how much of what lies behind still shows through
vec2 wq;
mat2 wJ;
vec3 wC;
float wT;

// the pigments as they should look on screen
const vec3 PIG[12] = vec3[12](
  vec3(0.93, 0.90, 0.81),   // 0 ivory, lead white (üstübeç)
  vec3(0.13, 0.22, 0.49),   // 1 lapis, indigo (lacivert)
  vec3(0.67, 0.13, 0.12),   // 2 madder (lal)
  vec3(0.83, 0.60, 0.23),   // 3 ochre (aşı boyası)
  vec3(0.24, 0.47, 0.41),   // 4 verdigris (küf yeşili)
  vec3(0.11, 0.10, 0.11),   // 5 soot (is)
  vec3(0.87, 0.55, 0.54),   // 6 rose (gül)
  vec3(0.50, 0.61, 0.76),   // 7 pale indigo (çivit)
  vec3(0.41, 0.26, 0.16),   // 8 umber
  vec3(0.89, 0.76, 0.48),   // 9 pale ochre
  vec3(0.64, 0.75, 0.86),   // 10 pale blue
  vec3(0.90, 0.71, 0.67));  // 11 pale rose
// each piece is made from one set: three ground tones, four stone pigments, the tulip's outer stone,
// the stone inside it and its heart
const int SET[40] = int[40](
  0, 9, 10,   1, 3, 4, 5,   2, 0, 3,
  0, 10, 11,  4, 1, 3, 8,   6, 0, 1,
  9, 0, 11,   8, 1, 3, 7,   2, 3, 1,
  10, 0, 9,   1, 5, 4, 3,   2, 9, 1);
vec3 pig(int slot) { return PIG[SET[gSet * 10 + slot]]; }
int pigId(int slot) { return SET[gSet * 10 + slot]; }

float ease(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
// a drop spreads in 0.28 s; on a heavy kick it splashes wider first and settles back
float grow(float age) { float x = clamp(age / 0.28, 0.0, 1.0); return 1.0 - (1.0 - x) * (1.0 - x) * (1.0 - x); }
float splash(float age) { float x = clamp(age / 0.34, 0.0, 1.0); return x * (1.0 - x) * (1.0 - x) * 6.75; }

// how a stone of paint looks: a flat colour with the pigment a little clumped, thinning toward its
// edge and gathering there in the thin darker vein (damar). d: from its centre in the paint's own
// units, ds: from its edge on screen, g: how much the paint is squeezed across the edge
vec3 stone(vec3 base, vec2 d, float r, float ds, float g, float seed) {
  float jn = length(wJ[0]) + length(wJ[1]);
  float fine = jn * gPx * 70.0;
  float clump = noise(d * 70.0 + seed * 31.0) - 0.5;
  vec3 c = base * (1.0 + clump * 0.08 * (1.0 - ss(0.3, 1.0, fine)));
  float ws = clamp((0.006 + 0.03 * r) / g, gPx * 0.9, gPx * 3.2);
  float vein = 1.0 - ss(ws * 0.35, ws * 1.3, ds);
  float thin = (1.0 - ss(ws * 1.2, ws * 6.0, ds)) * (1.0 - vein);
  c = mix(c, c * 0.7 + 0.3 * vec3(0.95, 0.93, 0.86), thin * 0.4 * ss(0.1, 0.6, dot(base, vec3(0.3, 0.5, 0.2))));
  vec3 dark = pow(base, vec3(1.6)) * 0.62;
  return mix(c, dark, vein * 0.85);
}

// one drop of paint, walked backwards: inside it the pixel is its paint, outside it the paint
// came from closer in, before the drop pushed it out
void drop(vec2 c, float r, vec3 col, float seed) {
  if (wT < 0.004 || r < 1e-4) return;
  vec2 d = wq - c;
  float d2 = dot(d, d), rr = r * r;
  if (d2 < rr) {
    float dl = sqrt(d2);
    vec2 n = d / max(dl, 1e-6);
    float g = max(length(n * wJ), 1e-5);              // how fast the distance to the edge changes on screen
    float ds = (r - dl) / g;
    float cov = ss(0.0, gPx * 1.1, ds);
    wC += wT * cov * stone(col, d, r, ds, g, seed);
    wT *= 1.0 - cov;
    wq = c;                                           // just outside the edge lies what was at the centre
  } else {
    // far away its push is let fade out smoothly, and past 7 radii it is not worked out at all
    float far = 49.0 * rr;
    if (d2 > far) return;
    rr *= 1.0 - ss(0.3 * far, far, d2);
    float s = max(sqrt(max(1.0 - rr / d2, 0.0)), 2e-3);
    wJ = (mat2(s) + outerProduct(d, d) * (rr / (s * d2 * d2))) * wJ;
    wq = c + d * s;
  }
}

// how much of the stylus' pull a point at a along its line has had (x), and how fast that changes
// along the line (y): none before the start, eased in over rmp behind it; all of it once the
// stylus has passed; eased out over W ahead of where the stylus now is. Paint in the first easing
// is drawn out into a long thread, paint in the second is pushed together ahead of the stylus
vec2 pulled(float a, float st, float rmp, float fr, float W) {
  float x1 = clamp((a - st + rmp) / rmp, 0.0, 1.0), x2 = clamp((a - fr + W) / W, 0.0, 1.0);
  float s1 = x1 * x1 * (3.0 - 2.0 * x1), s2 = x2 * x2 * (3.0 - 2.0 * x2);
  return vec2(s1 * (1.0 - s2), 6.0 * x1 * (1.0 - x1) / rmp * (1.0 - s2) - s1 * 6.0 * x2 * (1.0 - x2) / W);
}
// a stylus drawn from o along u (or, with sp > 0, every pin of a comb sp apart): the paint near
// its line is dragged along by up to amt, falling away over lam to the side, walked backwards.
// A needle's pull also fades out completely by reach to the side, so far from it nothing is done.
void stroke(vec2 o, vec2 u, float st, float rmp, float fr, float amt, float lam, float sp, float reach) {
  if (wT < 0.004 || amt < 1e-5) return;
  vec2 n = vec2(-u.y, u.x);
  vec2 rel = wq - o;
  float a = dot(rel, u), dl = dot(rel, n);
  float dd = sp > 0.0 ? (fract(dl / sp + 0.5) - 0.5) * sp : dl;
  float ab = abs(dd);
  if (reach > 0.0 && ab > reach) return;
  float ad = ab + lam;
  float T = 1.0, Tp = 0.0;
  if (reach > 0.0) {
    float r0 = 0.4 * reach, x = clamp((ab - r0) / (reach - r0), 0.0, 1.0);
    T = 1.0 - x * x * (3.0 - 2.0 * x);
    Tp = -6.0 * x * (1.0 - x) / (reach - r0);
  }
  float A = amt * lam / ad * T;
  if (a < st - rmp || a - A > fr) return;                     // before the stylus, or past where it stopped
  float gp = sign(dd) * amt * lam * (Tp / ad - T / (ad * ad));
  float W = 1.75 * amt + 0.02;                                // wide enough that the paint never folds over
  float aq = a - A, h = 1.0, hp = 0.0;
  if ((st > -100.0 || fr < 100.0) && (a - A < st || a > fr - W)) {
    // still being drawn, or a needle's ends: where along the line this paint came from. The move
    // only ever goes forward, so it is found by halving, then polished with two Newton steps
    float lo = a - A, hi = a;
    for (int i = 0; i < 4; i++) { float m = 0.5 * (lo + hi); if (m + A * pulled(m, st, rmp, fr, W).x < a) lo = m; else hi = m; }
    aq = 0.5 * (lo + hi);
    for (int i = 0; i < 2; i++) { vec2 hv = pulled(aq, st, rmp, fr, W); aq = clamp(aq - (aq + A * hv.x - a) / max(1.0 + A * hv.y, 0.05), lo, hi); }
    vec2 hv = pulled(aq, st, rmp, fr, W);
    h = hv.x; hp = hv.y;
  }
  float den = max(1.0 + A * hp, 0.05);
  vec2 grad = u / den - n * (gp * h / den);
  wJ = (outerProduct(u, grad) + outerProduct(n, n)) * wJ;
  wq = o + u * aq + n * dl;
}

// the battal ground the fresh bath starts with: small stones of three pale colours packed edge to
// edge, big and small (a power diagram), their corners rounded so the bath shows where three meet
vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
vec4 groundCell(vec2 ip, vec2 gg) {
  vec3 h = hash32(ip + gg);
  return vec4(gg + h.xy * 0.8 + 0.1, (h.z - 0.5) * 0.55, 0.0);
}
vec3 ground(vec2 q, float seed) {
  float sc = 6.2;
  vec2 w = q * sc + 0.75 * sin(q.yx * vec2(2.3, 1.9) + seed + 0.6 * sin(q * vec2(1.3, 1.7) + seed * 1.7)) + seed * 3.0;
  vec2 ip = floor(w), fp = fract(w);
  // the nearest three cells by power distance; the edge the pixel is nearest is taken to be the one
  // it shares with the second, and the third rounds the corner where all three meet
  float f1 = 8.0, f2 = 8.0, f3 = 8.0;
  vec2 r1 = vec2(0.0), r2 = vec2(1.0), r3 = vec2(2.0), g1 = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 gg = vec2(float(i), float(j));
    vec4 c = groundCell(ip, gg);
    vec2 r = c.xy - fp;
    float d = dot(r, r) - c.z;
    if (d < f1) { f3 = f2; r3 = r2; f2 = f1; r2 = r1; f1 = d; r1 = r; g1 = gg; }
    else if (d < f2) { f3 = f2; r3 = r2; f2 = d; r2 = r; }
    else if (d < f3) { f3 = d; r3 = r; }
  }
  vec2 mg = g1;
  vec2 v2 = r2 - r1, v3 = r3 - r1;
  float L2 = max(length(v2), 1e-4), L3 = max(length(v3), 1e-4);
  float e1 = (f2 - f1) / (2.0 * L2), e2 = (f3 - f1) / (2.0 * L3);
  vec2 en = v2 / L2;
  float rho = 0.1;
  float D = min(e1, rho - length(max(vec2(rho) - vec2(e1, e2), vec2(0.0))));
  vec2 cell = ip + mg;
  vec3 hc = hash32(cell + 3.7);
  vec3 base = hc.x < 0.4 ? pig(0) : hc.x < 0.72 ? pig(1) : pig(2);
  base *= 0.96 + 0.08 * hc.y;
  float g = max(length(en * wJ) * sc, 1e-5);
  float ds = D / g;
  float jn = length(wJ[0]) + length(wJ[1]);
  float clump = noise(q * 60.0 + seed) - 0.5;
  vec3 c = base * (1.0 + clump * 0.08 * (1.0 - ss(0.3, 1.0, jn * gPx * 60.0)));
  float ws = clamp(0.03 / g, gPx * 0.8, gPx * 2.4);
  float vein = 1.0 - ss(ws * 0.3, ws * 1.3, ds);
  c = mix(c, pow(base, vec3(1.8)) * 0.72, vein * 0.5);
  // squeezed so hard that its stones are a few pixels across: let them melt into one pale band
  float crowd = ss(0.25, 0.6, jn * gPx * sc);
  return mix(c, (pig(0) + pig(1) + pig(2)) / 3.0 * 0.97, crowd);
}

// where the j-th tulip of a piece grows: side by side in a wide frame, one above another in a tall
// one, each leaning a little its own way (M turns the needle's moves)
void lalePlace(int j, float S, out vec2 L, out float R, out mat2 M) {
  float fj = float(j);
  float h1 = hash11(S * 3.1 + fj * 7.7), h2 = hash11(S * 5.3 + fj * 2.9), h3 = hash11(S * 6.7 + fj * 4.3);
  float slot = j == 0 ? 0.0 : j == 1 ? -1.0 : 1.0;
  float wide = ss(0.85, 1.25, gAsp);
  vec2 a = vec2(slot * 0.6 * gAsp + (h1 - 0.5) * 0.12, 0.02 + (h2 - 0.5) * 0.16 - 0.06 * abs(slot));
  vec2 b = vec2((h1 - 0.5) * 0.04 + (abs(slot) - 0.5) * -0.12, -slot * 0.63 + 0.06);
  L = mix(b, a, wide);
  R = mix(0.13, 0.25, wide) * (j == 0 ? 1.06 : 0.95);
  M = rot((h3 - 0.5) * 0.4 + slot * 0.1 * wide);
}

// the b-th flick of the brush in piece S: a stone, and a second that either lands inside it (a
// ringed stone) or somewhere else on the bath. xy where, z how big; p which pigment slot
void flick(float S, float b, out vec3 s1, out int p1, out vec3 s2, out int p2) {
  vec2 g0 = vec2(hash11(S * 3.17 + 0.5), hash11(S * 5.71 + 0.9));
  vec2 box = vec2(gAsp * 0.9, 0.88);
  // spread evenly over the bath (a low-discrepancy sequence), starting somewhere new each piece
  vec2 g1 = fract(g0 + b * vec2(0.7548777, 0.5698403));
  vec2 g2 = fract(g0.yx + (b + 17.0) * vec2(0.7548777, 0.5698403));
  float hr1 = hash11(S * 2.93 + b * 1.13), hr2 = hash11(S * 4.71 + b * 5.31);
  p1 = 3 + int(hash11(S * 7.07 + b * 2.37) * 3.999);
  p2 = 3 + int(hash11(S * 8.31 + b * 3.91) * 3.999);
  if (p2 == p1) p2 = 3 + (p1 - 2) % 4;
  s1 = vec3((g1 - 0.5) * 2.0 * box, gSz * mix(0.14, 0.34, hr1));
  if (pigId(p1) == 5) s1.z *= 0.55;                              // soot only ever in small stones
  if (hash11(S * 9.13 + b * 4.47) < 0.45) {
    float an = hash11(S + b * 9.1) * TAU;
    s2 = vec3(s1.xy + vec2(cos(an), sin(an)) * 0.3 * s1.z, s1.z * 0.55);
  } else {
    s2 = vec3((g2 - 0.5) * 2.0 * box, gSz * mix(0.11, 0.25, hr2));
    if (pigId(p2) == 5) s2.z *= 0.55;
  }
}
void flickDrops(float S, float b, float age, float breathe) {
  vec3 s1, s2; int p1, p2;
  flick(S, b, s1, p1, s2, p2);
  float a2 = max(age - 0.07, 0.0);                               // the second drop falls a moment later
  drop(s2.xy, s2.z * (grow(a2) + 0.5 * gBass * splash(a2)) * breathe, pig(p2), S + b + 0.5);
  drop(s1.xy, s1.z * (grow(age) + 0.5 * gBass * splash(age)) * breathe, pig(p1), S + b);
}

// the j-th tulip of piece S, walked backwards, newest move first. In its own frame (units of R,
// y up), one move a beat: the stone, with a paler stone and a dark heart dropped inside it; the
// needle up through the middle, drawing all three into nested points; the two side petals pulled
// out, as the green for the stem (a little chain of drops under it) and the leaves falls; and last
// the stem pulled down through its chain and the leaves drawn out and up
void lale(int j, float S, float k, float age, float breathe) {
  float K = 19.0 + 4.0 * float(j);
  if (k < K || wT < 0.004) return;
  vec2 L; float R; mat2 M;
  lalePlace(j, S, L, R, M);
  vec2 rel = wq - L;
  bool near = dot(rel, rel) < 30.0 * R * R;                     // the needle never reaches past this
  if (k >= K + 3.0 && near) {
    float e = ease((k == K + 3.0 ? age : BIG) / 0.34);
    vec2 ll = M * normalize(vec2(0.62, 1.0)), lr = M * normalize(vec2(-0.62, 1.0));
    stroke(L + M * vec2(0.2 * R, -2.45 * R), ll, 0.0, 0.1, 2.3 * R * e, 1.3 * R, 0.07 * R, 0.0, 1.2 * R);
    stroke(L + M * vec2(-0.2 * R, -2.45 * R), lr, 0.0, 0.1, 2.3 * R * e, 1.3 * R, 0.07 * R, 0.0, 1.2 * R);
    // the stem: the needle goes in at the top of its drop and draws it out into a long thread
    stroke(L + M * vec2(0.0, -1.3 * R), M * vec2(0.0, -1.0), 0.0, 0.24 * R, 3.0 * R * e, 1.6 * R, 0.06 * R, 0.0, 0.8 * R);
  }
  if (k >= K + 2.0) {
    float a2 = k == K + 2.0 ? age : BIG;
    float gg = grow(max(a2 - 0.1, 0.0)) * breathe;
    drop(L + M * vec2(0.0, -1.18 * R), 0.12 * R * gg, PIG[4], S + K + 0.3);
    drop(L + M * vec2(0.45 * R, -2.05 * R), 0.3 * R * gg, PIG[4], S + K + 0.4);
    drop(L + M * vec2(-0.45 * R, -2.05 * R), 0.3 * R * gg, PIG[4], S + K + 0.45);
    if (near) {                                                   // the two side petals pulled up
      float e = ease(a2 / 0.34);
      vec2 dl = M * normalize(vec2(0.55, 1.0)), dr = M * normalize(vec2(-0.55, 1.0));
      stroke(L + M * vec2(0.5 * R, 0.15 * R), dl, 0.0, 0.3 * R, 2.0 * R * e, 0.75 * R, 0.1 * R, 0.0, 1.4 * R);
      stroke(L + M * vec2(-0.5 * R, 0.15 * R), dr, 0.0, 0.3 * R, 2.0 * R * e, 0.75 * R, 0.1 * R, 0.0, 1.4 * R);
    }
  }
  if (k >= K + 1.0 && near) {                                     // the needle up through the middle: the tip
    float e = ease((k == K + 1.0 ? age : BIG) / 0.34);
    stroke(L + M * vec2(0.0, -0.25 * R), M * vec2(0.0, 1.0), 0.0, 0.45 * R, 3.4 * R * e, 1.0 * R, 0.22 * R, 0.0, 3.0 * R);
  }
  float a0 = k == K ? age : BIG;
  float a1 = max(a0 - 0.07, 0.0), a2 = max(a0 - 0.14, 0.0);     // the stones inside fall a moment later
  vec3 inner = j == 1 ? PIG[0] : pig(8), heart = j == 2 ? pig(8) : pig(9);   // the three are not quite the same
  drop(L + M * vec2(0.0, -0.42 * R), 0.22 * R * (grow(a2) + 0.4 * gBass * splash(a2)) * breathe, heart, S + K + 0.5);
  drop(L + M * vec2(0.0, -0.22 * R), 0.55 * R * (grow(a1) + 0.4 * gBass * splash(a1)) * breathe, j == 2 ? PIG[0] : inner, S + K + 0.7);
  drop(L, R * (grow(a0) + 0.5 * gBass * splash(a0)) * breathe, pig(7), S + K);
}

// the bath of piece S, k steps in, the newest step age seconds old (BIG: long done)
void bath(float S, float k, float age) {
  gSet = int(hash11(S * 7.13 + 0.37) * 3.999);
  float breathe = 1.0 + 0.05 * gBass;
  for (int j = 2; j >= 0; j--) lale(j, S, k, age, breathe);
  float sp = 0.15 * gSz, lam = 0.016, amt = 0.24;
  float W = 1.75 * amt + 0.02;
  if (k >= 15.0) {                                            // the comb back up, between its own lines
    float P = k >= 19.0 ? 1.0 : (k - 15.0 + ease(age / 0.34)) / 4.0;
    float fr = k >= 19.0 ? BIG : mix(-1.12, 1.05 + W + amt, P);
    stroke(vec2(0.5 * sp, 0.0), vec2(0.0, 1.0), -BIG, 0.1, fr, amt, lam, sp, 0.0);
  }
  for (int i = 14; i >= 12; i--) {
    float b = float(i);
    if (k >= b) flickDrops(S, b, k == b ? age : BIG, breathe);
  }
  if (k >= 8.0) {                                             // the comb down through the bath
    float P = k >= 12.0 ? 1.0 : (k - 8.0 + ease(age / 0.34)) / 4.0;
    float fr = k >= 12.0 ? BIG : mix(-1.12, 1.05 + W + amt, P);
    stroke(vec2(0.0), vec2(0.0, -1.0), -BIG, 0.1, fr, amt, lam, sp, 0.0);
  }
  for (int i = 7; i >= 1; i--) {
    float b = float(i);
    if (k >= b) flickDrops(S, b, k == b ? age : BIG, breathe);
  }
  if (wT > 0.004) {
    // the ground was combed across and back before the first stone fell: a gel-git of pale stones
    float s2 = 0.17 * gSz;
    stroke(vec2(0.0, 0.5 * s2), vec2(-1.0, 0.0), -BIG, 0.1, BIG, 0.17, 0.024, s2, 0.0);
    stroke(vec2(0.0), vec2(1.0, 0.0), -BIG, 0.1, BIG, 0.17, 0.024, s2, 0.0);
    wC += wT * ground(wq, hash11(S * 9.7) * 40.0);
    wT = 0.0;
  }
}

// serpme: on every beat the highs flick a spray of fine drops over the bath. Each lands, pushes
// the pattern around it aside, spreads and sinks before the next beat. One drop per cell at most,
// its push gone before the cell's edge, so no cell needs its neighbours
void serpme(float n, float age) {
  float life = ss(0.0, 0.03, age) * (1.0 - ss(0.2, 0.38, age));
  float dens = 0.75 * gHigh;
  if (dens < 0.01 || life < 0.005) return;
  float cell = 0.085;
  vec2 off = vec2(hash11(n * 1.31), hash11(n * 2.71)) * 40.0;
  vec2 g = wq / cell + off, ci = floor(g);
  float h = hash21(ci + fract(n * 0.137) * 91.0);
  if (h > dens) return;
  vec2 c = (ci + 0.5 + (vec2(hash21(ci + 5.1), hash21(ci + 8.3)) - 0.5) * 0.3 - off) * cell;
  // a few big drops among many small, each spreading out as it lands
  float hs = hash21(ci + 2.2);
  float r = (0.0035 + 0.013 * hs * hs * hs) * (0.6 + 0.5 * ss(0.0, 0.2, age)) * ss(dens, dens * 0.6, h);
  vec2 d = wq - c;
  float d2 = dot(d, d), dl = sqrt(d2);
  if (dl < r) {
    float g2 = max(length(d / max(dl, 1e-6) * wJ), 1e-5);
    float ds = (r - dl) / g2;
    float cov = ss(0.0, gPx * 1.1, ds) * life;                    // as it sinks it fades into the bath
    vec3 col = pig(3 + int(hash21(ci + 6.6) * 3.999));
    col = mix(col, pow(col, vec3(1.5)) * 0.7, 1.0 - ss(0.0, gPx * 1.6, ds));
    wC += wT * cov * col;
    wT *= 1.0 - cov;
  }
  // the pattern around it pushed aside, the push gone well before the cell's edge
  float rr = r * r * life * (1.0 - ss(1.3 * r, 1.65 * r, dl));
  if (rr > 0.0 && d2 > rr) {
    float s = sqrt(max(1.0 - rr / d2, 1e-4));
    wJ = (mat2(s) + outerProduct(d, d) * (rr / (s * d2 * d2))) * wJ;
    wq = c + d * s;
  }
}

// display colour to the value the post chain turns back into it (its tone curve, inverted)
vec3 toScene(vec3 d) { return -log(1.0 - pow(clamp(d, 0.0, 0.96), vec3(1.0 / 0.92))) / 1.35; }

void main() {
  vec2 p = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gSz = mix(0.72, 1.0, ss(0.6, 1.5, gAsp));
  gBass = uAudioActive * clamp(uBass * 1.3, 0.0, 1.0);
  gMid = uAudioActive * clamp(uMid * 1.4, 0.0, 1.0);
  gHigh = uAudioActive * clamp(uHigh * 1.5, 0.0, 1.0);

  float N, age;
  if (uAudioActive > 0.5) { N = uBeatCount; age = uBeatAge; }
  else { float T = uTime / IDLE + 7.0; N = floor(T); age = fract(T) * IDLE; }
  float S = floor(N / 32.0), k = N - S * 32.0;

  // the paper: laid on from the left on the last step, lifted off from the left on the first
  vec2 pd = normalize(vec2(1.0, -0.4));
  float span = gAsp * abs(pd.x) + abs(pd.y) + 0.12;
  float sweep = dot(p, pd), front = mix(-span, span, ease(age / 0.38));
  float paper = k == 31.0 ? 1.0 - ss(-gPx, gPx, sweep - front) : k == 0.0 ? ss(-gPx, gPx, sweep - front) : 0.0;

  // the gum water is never quite still; the mids sway it
  vec2 q = p + 0.004 * vec2(sin(p.y * 1.3 + uTime * 0.21), sin(p.x * 1.1 - uTime * 0.17));
  q += gMid * 0.035 * vec2(sin(p.y * 2.1 + uTime * 0.6 + 1.3 * sin(p.x * 0.9 + uTime * 0.2)), sin(p.x * 1.7 - uTime * 0.5 + 0.8));
  // a drop landing sends a ring across the bath, bigger with the bass, gone within the beat
  float crest = 0.0;
  gSet = int(hash11(S * 7.13 + 0.37) * 3.999);
  {
    vec2 c = vec2(9.0);
    float r0 = 0.0;                                         // it starts from the edge of the drop
    if ((k >= 1.0 && k <= 7.0) || (k >= 12.0 && k <= 14.0)) { vec3 s1, s2; int p1, p2; flick(S, k, s1, p1, s2, p2); c = s1.xy; r0 = s1.z; }
    for (int j = 0; j < 3; j++) {
      float K = 19.0 + 4.0 * float(j);
      if (k == K) { mat2 M; lalePlace(j, S, c, r0, M); }
    }
    vec2 rel = p - c;
    float r = length(rel), front = r0 * grow(age) + 0.02 + age * 1.0;
    float env = (0.3 + 0.7 * gBass) * (1.0 - ss(0.12, 0.46, age)) * step(r, 3.0) * uAudioActive;
    float x = (r - front) / 0.04, g = exp(-min(x * x, 60.0)) * env;
    q -= rel / max(r, 1e-4) * g * sin(x * 2.4) * 0.01;
    // the ripple's slope, lit from the window: bright on the side that faces it, dark on the other
    crest = g * (2.4 * cos(x * 2.4) - 2.0 * x * sin(x * 2.4)) * dot(rel / max(r, 1e-4), vec2(-0.6, 0.8));
  }
  wq = q; wJ = mat2(1.0); wC = vec3(0.0); wT = 1.0;
  serpme(N, age);
  if (k == 0.0 && paper > 0.5) bath(S - 1.0, 32.0, BIG);   // under the paper still lifting: the finished piece
  else bath(S, k, age);
  vec3 col = wC;
  col *= 1.0 + 0.07 * crest;                                // the ripple catches the light
  col += vec3(0.9, 0.88, 0.8) * 0.05 * max(crest - 1.2, 0.0);

  // the comb, while it is in the bath: a walnut spine with brass pins, its shadow on the water
  {
    float sp = 0.15 * gSz, amt = 0.24, W = 1.75 * amt + 0.02;
    float yc = 9.0, off = 0.0;
    if (k >= 8.0 && k < 12.0) { yc = -mix(-1.12, 1.05 + W + amt, (k - 8.0 + ease(age / 0.34)) / 4.0); }
    if (k >= 15.0 && k < 19.0) { yc = mix(-1.12, 1.05 + W + amt, (k - 15.0 + ease(age / 0.34)) / 4.0); off = 0.5 * sp; }
    if (abs(p.y - yc) < 0.2) {
      float sh = ss(0.07, 0.0, abs(p.y - yc + 0.035) - 0.02);
      col *= 1.0 - 0.35 * sh;
      float body = ss(gPx, -gPx, abs(p.y - yc) - 0.024);
      float grain = noise(vec2(p.x * 4.0, p.y * 140.0)) * 0.6 + noise(vec2(p.x * 30.0, p.y * 400.0)) * 0.4;
      vec3 wood = vec3(0.30, 0.17, 0.09) * (0.75 + 0.45 * grain) * (1.0 + 0.5 * ss(0.024, -0.024, p.y - yc));
      col = mix(col, wood, body);
      float px = (fract((p.x - off) / sp + 0.5) - 0.5) * sp;
      float pin = ss(gPx, -gPx, length(vec2(px, p.y - yc)) - 0.0075);
      col = mix(col, vec3(0.78, 0.62, 0.32) * (0.8 + 0.5 * ss(0.006, -0.006, px + p.y - yc)), pin);
    }
  }
  // the needle, while it pulls a tulip into shape: up through the middle, then down the stem
  for (int j = 0; j < 3; j++) {
    float K = 19.0 + 4.0 * float(j);
    if (k != K + 1.0 && k != K + 3.0) continue;
    vec2 L; float R; mat2 M;
    lalePlace(j, S, L, R, M);
    float e = ease(age / 0.34);
    vec2 tip = L + M * (k == K + 1.0 ? vec2(0.0, -0.25 * R + 3.4 * R * e) : vec2(0.0, -1.3 * R - 3.0 * R * e));
    float show = ss(0.0, 0.05, age) * (1.0 - ss(0.36, 0.46, age));
    vec2 dir = normalize(vec2(0.55, 0.35));
    vec2 rel = p - tip;
    float t = clamp(dot(rel, dir), 0.0, 0.32);
    float dn = length(rel - dir * t);
    vec2 rs = rel - vec2(0.012, -0.02);
    float ts = clamp(dot(rs, dir), 0.0, 0.32);
    col *= 1.0 - 0.3 * show * ss(0.012, 0.0, length(rs - dir * ts)) * ss(0.0, 0.05, ts);
    float steel = ss(gPx * 1.2 + 0.004, 0.004 - gPx * 0.2, dn) * show * ss(-0.004, 0.004, dot(rel, dir) + 0.004);
    float shine = ss(0.0025, 0.0, abs(dot(rel, vec2(-dir.y, dir.x)) - 0.0012));
    col = mix(col, vec3(0.2, 0.21, 0.24) + vec3(0.65) * shine, steel);
  }

  // the sheet of paper, wet through so the pattern shows under it, and its edge
  if (k == 31.0 || k == 0.0) {
    float fib = noise(p * vec2(9.0, 140.0)) * 0.5 + noise(p * 70.0) * 0.5;
    vec3 sheet = vec3(0.95, 0.92, 0.85) * (0.96 + 0.06 * fib);
    float edge = abs(sweep - front);
    col *= 1.0 - 0.28 * ss(0.06, 0.0, edge) * (1.0 - paper);
    col = mix(col, mix(sheet, col, 0.28), paper);
    col += 0.06 * ss(gPx * 3.0, 0.0, edge) * paper;
  }

  // the fine tooth of the size on the bath, soft light from a window to the upper left, and a
  // dither against banding
  float tooth = noise(p * vec2(220.0, 190.0)) - 0.5;
  col *= 1.0 + tooth * 0.03 + 0.03 * sin(0.8 * p.y - 0.55 * p.x + 0.4);
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  vec3 sc = toScene(col * 0.84);
  vec2 v = (vUv - 0.5) * vec2(gAsp, 1.0);
  sc *= 1.0 + 0.32 * ss(0.45, 1.25, length(v));            // most of the vignette the post chain will add, undone
  outColor = vec4(max(sc, vec3(0.0)), 1.0);
}`;

export default {
  id: 'ebru',
  name: 'Ebru',
  group: 'Lab',
  blurb: 'Turkish paper marbling; every beat drops a paint stone on the combed bath',
  tags: ['turkish', 'artwork', 'organic', 'calm'],
  energy: 0.3,
  particles: 0,
  trails: 0,
  zoom: 1,
  spin: 0,
  frag,
};
