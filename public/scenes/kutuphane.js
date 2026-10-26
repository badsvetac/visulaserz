import { SCULPT } from '../js/gfx/scene-kit.js';

// KÜTÜPHANE — an old library hall at night, seen straight down its nave: walls of books on both
// sides climbing past a gallery into the dark of the vault, all running to one tall pointed window
// at the far end with the moon in it. The moonlight falls through the window's tracery in long
// shafts full of dust and lays the window's shape out along the polished floor; small warm lamps
// hang from the rolling ladders against the shelves; a handful of books have come off the shelves
// and fly slowly up the hall, beating their covers like wings, their pages glowing; and in the
// foreground an open book on a lectern lets glowing letters and sparks drift up out of its pages.
//
// The hall is a box traced analytically (walls, floor, vault, end wall), so the perspective is
// exact and costs nothing; the shafts are a short march along the eye ray, each step looking back
// along the moonlight to see whether it came through the glass or hit the stone of the tracery.
//
// Music: each flying book's pages glow with its own band of the spectrum; the bass breathes the
// moon shafts and the light they lay on the floor; the highs make the dust in the shafts sparkle;
// the mids drive how hard the books beat their covers; and on some of the beats, about two in
// five, a soft wave of gold light runs along the shelves from the window towards you, gone within
// the beat.
const frag = `${SCULPT}
float gPx, gAsp, gF, gVP;
vec3 gL;                     // the direction the moonlight travels in
float gWaveZ, gWaveA;        // the beat's wave of light along the shelves: where it is, how strong

const float W = 2.3;         // half the width of the nave
const float FL = -1.25;      // the floor, below the eye
const float ZE = 9.0;        // the end wall with the window
const float CEIL = 7.6;      // the vault, far up in the dark
const float WW = 1.15, WB = -0.35, WS = 3.2;   // the window: half width, sill, where the arch springs
const vec2 MOON = vec2(0.29, 2.62);

// the lamps hanging from the ladders against the shelves (x on the wall, y, z) and how bright
const vec4 LAMP[5] = vec4[5](
  vec4(-2.06, 1.2, 3.3, 1.3), vec4(2.06, 1.95, 4.8, 1.2), vec4(-2.06, 3.5, 6.7, 1.0),
  vec4(2.06, 0.3, 2.3, 1.2), vec4(2.06, 3.95, 7.7, 0.9));
// the flying books, back to front: where (x, y, z) and which way they fly (yaw)
const vec4 BOOK[5] = vec4[5](
  vec4(0.75, 3.0, 7.6, 2.3), vec4(-0.9, 3.1, 6.6, 0.8), vec4(0.95, 1.6, 5.4, -0.9),
  vec4(-1.0, 1.15, 4.6, 3.7), vec4(0.35, 2.0, 3.4, -2.6));
const float BAND[5] = float[5](0.05, 0.16, 0.3, 0.48, 0.7);
const vec3 LEATHER[5] = vec3[5](vec3(0.34, 0.06, 0.05), vec3(0.07, 0.2, 0.12), vec3(0.08, 0.1, 0.3), vec3(0.36, 0.22, 0.07), vec3(0.22, 0.07, 0.2));
// the spines on the shelves: oxblood, bottle green, navy, ochre, brown, vellum
const vec3 PAL[6] = vec3[6](vec3(0.3, 0.055, 0.045), vec3(0.06, 0.16, 0.085), vec3(0.06, 0.08, 0.2),
  vec3(0.34, 0.21, 0.07), vec3(0.17, 0.085, 0.045), vec3(0.3, 0.26, 0.19));

vec2 proj(vec3 p) { return p.xy * gF / p.z + vec2(0.0, gVP); }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }

// the window's outline, a pointed arch on straight jambs: positive inside, in world units
float archD(vec2 q) {
  float c = 0.55 * WW, R = WW + c;
  float d = min(WW - abs(q.x), q.y - WB);
  if (q.y > WS) d = min(d, min(R - length(vec2(q.x + c, q.y - WS)), R - length(vec2(q.x - c, q.y - WS))));
  return d;
}
// distance to the stone of the tracery: mullions, transoms, a rose with three spokes, two small arches
float mull(vec2 q) {
  float side = abs(abs(q.x) - WW * 0.5), top = WS + 0.35;
  float d = q.y < top ? side : 1e3;
  // the small pointed arches over each pair of lights
  vec2 a = vec2(abs(q.x), q.y - top);
  if (a.y > 0.0) {
    float r = WW * 0.5;
    d = min(d, abs(length(a - vec2(0.0, 0.0)) - r) + step(a.x, 0.0) * 9.0);
    d = min(d, abs(length(a - vec2(WW, 0.0)) - r));
  }
  vec2 rc = q - vec2(0.0, WS + 1.05);
  float rl = length(rc);
  d = min(d, abs(rl - 0.4));
  float ang = atan(rc.y, rc.x);
  float fa = mod(ang + PI / 6.0, PI / 3.0) - PI / 6.0;
  if (rl < 0.4) d = min(d, rl * abs(sin(fa)));
  if (q.y < top) d = min(d, abs(q.x));
  if (q.y < WS) { float ty = mod(q.y - WB, 1.18); d = min(d, min(ty, 1.18 - ty)); }
  return d;
}
// how much moonlight comes through the window at q; blur softens it the further the light has gone
float winLight(vec2 q, float blur) {
  return ss(-blur, blur, archD(q)) * ss(0.035 - blur, 0.035 + blur, mull(q));
}
// the night outside the glass
vec3 skyOut(vec2 q, float px) {
  vec3 c = mix(vec3(0.04, 0.07, 0.19), vec3(0.08, 0.13, 0.32), ss(WB, 5.0, q.y));
  float dm = length(q - MOON);
  c += vec3(0.25, 0.34, 0.6) * exp(-dm * 1.5) + vec3(0.5, 0.56, 0.75) * exp(-dm * 7.0);
  float cl = fbm(vec2(q.x * 0.9 + uTime * 0.006, q.y * 2.2));
  float moon = ss(0.24 + px, 0.24 - px, dm);
  c = mix(c, vec3(1.9, 1.95, 2.05) * (0.85 + 0.15 * fbm(q * 9.0)), moon);
  c = mix(c, vec3(0.03, 0.045, 0.1) + vec3(0.3, 0.36, 0.5) * exp(-dm * 2.4), ss(0.52, 0.72, cl) * 0.8);
  return c;
}
// the light that reaches a point P with normal n: moonlit dusk, the lamps, the shafts from the window
vec3 lightAt(vec3 P, vec3 n) {
  float hf = exp(-max(P.y - 0.4, 0.0) * 0.42);                       // up into the dark
  vec3 c = vec3(0.045, 0.07, 0.135) * (0.3 + 0.7 * exp(-(ZE - P.z) * 0.3)) * hf;
  c += vec3(0.04, 0.065, 0.13) * exp(-(P.y - FL) * 0.8) * ss(9.5, 2.0, P.z) * 0.7;   // bounce off the moonlit floor
  for (int i = 0; i < 5; i++) {
    vec3 dl = LAMP[i].xyz - P;
    float dd = dot(dl, dl);
    float fl = 0.9 + 0.1 * noise(vec2(uTime * 3.0, float(i) * 7.0));
    c += vec3(1.0, 0.48, 0.16) * LAMP[i].w * fl / (1.0 + dd * 3.2) * (0.4 + 0.6 * max(dot(n, dl) * inversesqrt(dd), 0.0));
  }
  float s = (P.z - ZE) / gL.z;
  vec2 q = P.xy - gL.xy * s;
  c += vec3(0.42, 0.58, 0.95) * winLight(q, 0.02 + s * 0.012) * max(dot(n, -gL), 0.0) * (0.75 + 0.45 * gBass) * 1.2;
  return c;
}
// a wall of shelves at w (along the wall, up), fp the size of a pixel on it: albedo, with gold for
// the tooling on the spines and ao for the dark under each shelf
vec3 shelves(vec2 w, float fp, float seed, out float gold, out float ao) {
  gold = 0.0; ao = 1.0;
  vec3 wood = vec3(0.15, 0.075, 0.04);
  float y = w.y - (FL + 0.32);
  if (y < 0.0) return wood * (0.55 + 0.3 * ss(-0.32, -0.28, y) * ss(-0.02, -0.06, y));   // the plinth
  const float RH = 0.46, BT = 0.045;
  float row = floor(y / RH), fy = y - row * RH;
  float lip = ss(BT + fp, BT - fp, fy);
  float by = (fy - BT) / (RH - BT);
  float ro = hash11(row * 3.7 + seed) * 10.0;
  float bs = (w.x + ro) / 0.15;
  float cell = floor(bs), u = fract(bs);
  float n = 1.0 + floor(hash21(vec2(cell, row) + seed) * 2.99);
  float sub = floor(u * n);
  u = fract(u * n);
  vec2 id = vec2(cell * 3.0 + sub, row);
  float h1 = hash21(id + seed + 1.3), h2 = hash21(id + seed + 7.1), h3 = hash21(id + seed + 4.4);
  float bh = 0.62 + 0.32 * h2;
  float gap = step(0.94, h3);
  vec3 alb = PAL[int(h1 * 5.99)] * (0.7 + 0.6 * h3);
  float bw = 0.15 / n;
  float edge = min(u, 1.0 - u) * bw;
  float spine = (0.45 + 0.55 * sqrt(max(sin(PI * u), 0.0))) * ss(0.0, fp * 1.5 + 0.002, edge);
  float inBook = ss(bh + 0.01, bh - 0.01, by) * (1.0 - gap);
  float g = max(ss(0.03, 0.0, abs(by - bh * 0.13)), ss(0.03, 0.0, abs(by - bh * 0.86)));
  g = max(g, ss(0.06, 0.03, abs(by - bh * 0.62)) * step(0.75, h2) * 0.6 * ss(0.3, 0.2, abs(u - 0.5)));   // a label
  vec3 recess = vec3(0.012, 0.01, 0.012);
  vec3 c = mix(recess, alb * spine, inBook);
  gold = g * inBook * spine;
  ao = mix(0.5, 1.0, ss(1.0, 0.55, by));
  float lod = ss(0.012, 0.05, fp);                                       // far away, just the average
  c = mix(c, vec3(0.13, 0.08, 0.06) * 0.62, lod);
  gold *= 1.0 - lod;
  c = mix(c, wood * 1.6, lip);
  ao = mix(ao, 1.0, lip);
  return c;
}
// one side wall: shelves, the pilasters between the bays, the gallery, the ladders; side is -1 or 1
vec3 sideWall(vec3 P, float side, float fp, float fpy) {
  vec2 w = vec2(P.z, P.y);
  float gold, ao;
  vec3 alb = shelves(w, fp, side * 13.0 + 20.0, gold, ao);
  vec3 wood = vec3(0.15, 0.075, 0.04);
  // the pilasters between the bays
  float k = floor(P.z / 1.6 + 0.5), dz = P.z - k * 1.6;
  float pil = ss(0.08 + fp, 0.08 - fp, abs(dz));
  alb = mix(alb, wood * (0.8 + 0.6 * ss(-0.08, 0.08, dz * -side)), pil);
  ao = mix(ao, 1.0, pil); gold *= 1.0 - pil;
  // the gallery: its fascia, the balusters and the handrail
  float fas = ss(0.0, fpy, P.y - 2.2) * ss(0.0, fpy, 2.44 - P.y);
  float bal = ss(0.012 + fp, 0.012 - fp, abs(fract(P.z / 0.12) - 0.5) * 0.12) * step(2.44, P.y) * step(P.y, 2.86);
  float rail = ss(0.03 + fpy, 0.03 - fpy, abs(P.y - 2.88));
  float gal = max(max(fas, bal * (1.0 - ss(0.02, 0.12, fp))), rail);
  vec3 galC = wood * (fas > 0.5 ? 1.1 + 0.6 * ss(0.012, 0.0, abs(P.y - 2.38)) : 1.5);
  alb = mix(alb, galC, gal);
  ao = mix(ao, 1.0, gal); gold = mix(gold, rail * 0.3 + ss(0.01, 0.0, abs(P.y - 2.26)) * fas * 0.5, gal);
  // the rolling ladders the lamps hang from
  for (int i = 0; i < 5; i++) {
    vec4 l = LAMP[i];
    if (l.x * side < 0.0) continue;
    float base = l.y > 2.5 ? 2.88 : FL, top = l.y + 0.1;
    if (P.y < base || P.y > top + 0.05) continue;
    float lz = P.z - l.z;
    float rails = ss(0.02 + fp, 0.02 - fp, abs(abs(lz) - 0.19));
    float rungs = ss(0.016 + fpy, 0.016 - fpy, abs(fract((P.y - base) / 0.3) - 0.5) * 0.3) * step(abs(lz), 0.19);
    float lad = max(rails, rungs) * ss(top + 0.05, top, P.y);
    alb = mix(alb, vec3(0.2, 0.11, 0.05), lad);
    ao = mix(ao, 1.0, lad); gold *= 1.0 - lad;
  }
  vec3 n = vec3(-side, 0.0, 0.0);
  vec3 lt = lightAt(P, n);
  vec3 c = alb * lt * ao + gold * lt * vec3(0.95, 0.72, 0.32) * 0.9;
  float wv = gWaveA * exp(-pow((P.z - gWaveZ) / 0.75, 2.0)) * exp(-max(P.y - 1.0, 0.0) * 0.3);
  c += (alb * vec3(2.2, 1.3, 0.55) + gold * vec3(2.4, 1.6, 0.6)) * wv;
  return c;
}
vec3 endWall(vec3 P, float fpw) {
  vec2 q = P.xy;
  float ad = archD(q);
  if (ad > -fpw) {
    vec3 g = skyOut(q, fpw);
    // the leading of the glass, diamond quarries, catching a little light
    vec2 lq = vec2(q.x * 3.2 + q.y * 1.9, q.x * 3.2 - q.y * 1.9);
    vec2 lf = abs(fract(lq) - 0.5);
    float lead = ss(0.05, 0.0, min(lf.x, lf.y)) * 0.5;
    g *= 1.0 - lead * (1.0 - ss(0.01, 0.03, fpw));
    float m = mull(q);
    float bar = ss(0.035 + fpw, 0.035 - fpw, m);
    vec3 stone = vec3(0.012, 0.016, 0.03) + vec3(0.05, 0.07, 0.12) * ss(0.035, 0.0, m) * 0.5;
    g = mix(g, stone, bar);
    return mix(vec3(0.02, 0.026, 0.045), g, ss(-fpw, fpw, ad));
  }
  float gold, ao;
  vec3 alb;
  if (abs(q.x) > 1.62) alb = shelves(vec2(q.x, q.y), fpw, 71.0, gold, ao);
  else {
    // dark stone around the window, the deep reveal of its jamb lit by the glass
    float rv = ss(-0.24, -0.2, ad);
    vec2 bq = vec2(q.x / 0.55 + 0.5 * mod(floor(q.y / 0.3), 2.0), q.y / 0.3);
    vec2 bf = abs(fract(bq) - 0.5);
    float joint = ss(0.46, 0.5, max(bf.x, bf.y));
    alb = vec3(0.1, 0.1, 0.11) * (0.8 + 0.3 * hash21(floor(bq))) * (1.0 - 0.5 * joint);
    alb = mix(alb, vec3(0.13, 0.13, 0.15), rv);
    gold = 0.0; ao = 1.0;
    vec3 c = alb * lightAt(P, vec3(0.0, 0.0, -1.0));
    c += vec3(0.1, 0.14, 0.26) * rv * (0.6 + 0.4 * ss(-0.2, 0.0, ad)) * ss(5.5, 2.0, q.y);
    c += vec3(0.15, 0.2, 0.32) * ss(0.012 + fpw, 0.0, abs(ad + 0.24)) * 0.6;    // the moulding round the arch
    return c;
  }
  vec3 lt = lightAt(P, vec3(0.0, 0.0, -1.0));
  vec3 c = alb * lt * ao + gold * lt * vec3(0.95, 0.72, 0.32) * 0.9;
  c += (alb * vec3(2.2, 1.3, 0.55) + gold * vec3(2.4, 1.6, 0.6)) * gWaveA * 0.5 * exp(-pow((ZE - gWaveZ) / 0.75, 2.0)) * exp(-max(P.y - 0.5, 0.0) * 0.6);
  return c;
}
vec3 floorAt(vec3 P, vec3 d, float fp) {
  float px = P.x / 0.3, pid = floor(px), pu = fract(px);
  float pz = (P.z + hash11(pid * 1.7) * 3.0) / 2.4, zid = floor(pz), zu = fract(pz);
  float hv = hash21(vec2(pid, zid));
  vec3 alb = vec3(0.1, 0.055, 0.03) * (0.7 + 0.55 * hv) * (0.85 + 0.15 * noise(vec2(P.x * 30.0, P.z * 2.0)));
  float seam = max(ss(fp * 1.2 + 0.004, 0.0, min(pu, 1.0 - pu) * 0.3), ss(fp * 3.0 + 0.006, 0.0, min(zu, 1.0 - zu) * 2.4));
  alb *= 1.0 - 0.55 * seam * (1.0 - ss(0.02, 0.08, fp));
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 c = alb * lightAt(P, n);
  { // the moonlit pool, shining on the polish
    float s = (P.z - ZE) / gL.z;
    float pool = winLight(P.xy - gL.xy * s, 0.02 + s * 0.012);
    c += vec3(0.2, 0.3, 0.55) * 0.8 * pool * (0.25 + 0.75 * hv) * (1.0 - 0.7 * seam) * (0.7 + 0.45 * gBass) * 0.5;
  }
  // warm light from the open book on the lectern
  vec3 bl = vec3(0.4 * 2.7 / gF, FL + 1.12, 2.7) - P;
  c += alb * vec3(1.0, 0.55, 0.2) * 1.6 / (1.0 + dot(bl, bl) * 2.5);
  // the polished floor mirrors the window, blurred with the distance
  vec3 r = vec3(d.x, -d.y, d.z);
  float t2 = (ZE - P.z) / r.z;
  vec2 rq = P.xy + r.xy * t2;
  float blur = 0.05 + (ZE - P.z) * 0.035;
  vec3 refl = skyOut(rq, blur) * winLight(rq, blur);
  float fres = 0.12 + 0.3 * pow(1.0 - clamp(-d.y / length(d), 0.0, 1.0), 4.0);
  c += refl * fres * (0.75 + 0.25 * hv) * (1.0 - 0.6 * seam);
  for (int i = 0; i < 5; i++) {        // and the lamps, as soft streaks
    vec3 lm = vec3(LAMP[i].x * 0.97, 2.0 * FL - LAMP[i].y, LAMP[i].z);
    vec2 sp = proj(lm), dp = d.xy / d.z * gF + vec2(0.0, gVP) - sp;
    float sc = gF / lm.z;
    c += vec3(1.0, 0.5, 0.18) * LAMP[i].w * 0.18 * exp(-abs(dp.x) / (0.05 * sc) - abs(dp.y) / (0.35 * sc));
  }
  return c;
}
// a parallelogram O + E1 u + E2 v on screen: coverage, u, v
vec3 quad(vec2 p, vec2 O, vec2 E1, vec2 E2) {
  float det = E1.x * E2.y - E1.y * E2.x;
  if (abs(det) < 1e-8) return vec3(0.0);
  vec2 r = p - O;
  float u = (r.x * E2.y - r.y * E2.x) / det, v = (E1.x * r.y - E1.y * r.x) / det;
  float dd = min(min(u, 1.0 - u) * abs(det) / length(E2), min(v, 1.0 - v) * abs(det) / length(E1));
  return vec3(clamp(dd / gPx + 0.5, 0.0, 1.0), u, v);
}
// one half of a flying book: its cover and, if we see the inside, its pages
void bookHalf(inout vec3 col, vec2 p, vec3 c, vec3 a, vec3 w, float sgn, vec3 leather, float glow) {
  const float HL = 0.23, CW = 0.33;
  vec3 nIn = -sgn * normalize(cross(a, w));      // spine up, pages facing down, like a bird's wings
  bool inside = dot(nIn, -c) > 0.0;
  vec2 O = proj(c - a * HL * 1.05);
  vec2 E1 = proj(c + a * HL * 1.05) - O, E2 = proj(c - a * HL * 1.05 + w * CW) - O;
  vec3 q = quad(p, O, E1, E2);
  if (q.x <= 0.0) return;
  float rim = pow(1.0 - abs(dot(nIn, normalize(-c))), 2.0);
  vec3 cc;
  if (inside) {
    vec3 pq = quad(p, O + E1 * 0.08 + E2 * 0.02, E1 * 0.84, E2 * 0.88);
    float lines = 1.0 - 0.3 * ss(0.3, 0.5, abs(fract(pq.y * 11.0) - 0.5)) * step(0.15, pq.z) * step(pq.z, 0.85) * step(0.1, pq.y) * step(pq.y, 0.9);
    float gl = glow * (0.35 + 0.65 * ss(0.95, 0.1, pq.z) * ss(0.0, 0.12, pq.z));   // brightest just off the gutter
    vec3 paper = vec3(0.12, 0.12, 0.15) + vec3(1.3, 0.78, 0.36) * gl;
    paper *= lines;
    cc = mix(leather * 0.7 + vec3(0.6, 0.3, 0.1) * glow * 0.15, paper, pq.x);
  } else {
    float e = min(min(q.y, 1.0 - q.y), min(q.z, 1.0 - q.z));
    float tool = ss(0.025, 0.0, abs(e - 0.09)) + ss(0.08, 0.05, length((vec2(q.y, q.z) - 0.5) * vec2(1.0, 0.75)));
    float lit = 0.35 + 0.65 * max(dot(-nIn, -gL), 0.0);
    cc = leather * (0.25 + 0.5 * lit) + vec3(0.7, 0.5, 0.18) * tool * (0.25 + 0.35 * glow);
    cc += vec3(1.0, 0.8, 0.5) * glow * 0.6 * ss(0.05, 0.0, 1.0 - q.z);   // the page edges at the fore-edge
  }
  cc += vec3(0.35, 0.48, 0.8) * rim * 0.35;
  col = mix(col, cc, q.x);
}
void flyingBook(inout vec3 col, vec2 p, int i) {
  vec4 B = BOOK[i];
  float fi = float(i);
  vec3 c = B.xyz + vec3(0.14 * sin(uTime * 0.21 + fi * 1.3), 0.1 * sin(uTime * 0.33 + fi * 2.1), 0.15 * cos(uTime * 0.17 + fi));
  vec2 pc = proj(c);
  float sc = gF / c.z;
  vec2 dp = p - pc;
  float glow = 0.3 + 1.7 * band(BAND[i]);
  col += vec3(1.0, 0.55, 0.22) * glow * 0.3 * exp(-dot(dp, dp) / (sc * sc * 0.09));    // its halo
  if (dot(dp, dp) > sc * sc * 0.6) return;
  float yaw = B.w + 0.3 * sin(uTime * 0.12 + fi * 2.0);
  vec3 a = vec3(sin(yaw), 0.08 * sin(uTime * 0.4 + fi), cos(yaw));
  a = normalize(a);
  vec3 up = vec3(0.0, 1.0, 0.0), b = normalize(cross(up, a));
  float ph = uCruise * (1.9 + 0.25 * fi) + fi * 1.7;
  float amp = 0.35 + 0.55 * gMid;
  float th = -0.05 + amp * sin(ph + 0.45 * sin(ph));                      // a quick downstroke, a slow lift
  vec3 wR = cos(th) * b - sin(th) * up, wL = -cos(th) * b - sin(th) * up;
  c.y -= 0.03 * sin(ph);
  vec3 L = LEATHER[i];
  bool rFar = (c + wR * 0.1).z > (c + wL * 0.1).z;
  float pth = th * 0.55 + 0.25 * sin(ph * 1.3 + 1.0);                  // a loose page, lagging behind
  vec3 wP = cos(pth) * b - sin(pth) * up;
  if (rFar) { bookHalf(col, p, c, a, wR, 1.0, L, glow); bookHalf(col, p, c, a, wP, 1.0, vec3(0.9, 0.75, 0.5) * glow, glow); bookHalf(col, p, c, a, wL, -1.0, L, glow); }
  else { bookHalf(col, p, c, a, wL, -1.0, L, glow); bookHalf(col, p, c, a, wR, 1.0, L, glow); }
}
// the lectern in front, in its own frame (world units, x right, y up from the floor)
float lecternD(vec2 l) {
  float d = max(abs(l.x) - mix(0.3, 0.2, ss(0.0, 0.08, l.y)), abs(l.y - 0.04) - 0.04);             // the foot
  float col = 0.045 + 0.03 * ss(0.05, 0.0, abs(l.y - 0.14)) + 0.025 * ss(0.035, 0.0, abs(l.y - 0.5))
    + 0.045 * ss(0.04, 0.0, abs(l.y - 0.86));                                                      // the turned column
  d = min(d, max(abs(l.x) - col, abs(l.y - 0.48) - 0.42));
  d = min(d, max(abs(l.x) - mix(0.33, 0.38, ss(0.9, 1.1, l.y)), abs(l.y - 1.0) - 0.1));            // the slanted desk
  return d;
}
void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gF = mix(1.0, 1.35, ss(0.6, 1.5, gAsp));
  gVP = -0.25;
  gL = normalize(vec3(-0.07, -0.85, -1.0));
  gWaveA = 0.0; gWaveZ = -9.0;
  if (uAudioActive > 0.5 && uBeatAge < 0.45 && hash11(uBeatCount * 7.7 + 0.3) < 0.42) {
    gWaveA = uPunch * 0.55 * pow(1.0 - uBeatAge / 0.45, 1.5);
    gWaveZ = mix(ZE - 0.3, 0.8, uBeatAge / 0.42);
  }
  vec3 d = vec3(uv.x, uv.y - gVP, gF);
  float tW = abs(d.x) > 1e-5 ? W / abs(d.x) : 1e9;
  float tF = d.y < 0.0 ? FL / d.y : 1e9;
  float tC = d.y > 0.0 ? CEIL / d.y : 1e9;
  float tE = ZE / gF;
  float t = min(min(tW, tF), min(tC, tE));
  vec3 P = d * t;
  vec3 col;
  if (t == tE) col = endWall(P, gPx * ZE / gF);
  else if (t == tW) {
    float fp = P.z * P.z / (gF * W) * gPx, fpy = P.z / gF * gPx;
    col = sideWall(P, sign(d.x), fp, fpy);
  } else if (t == tF) col = floorAt(P, d, P.z * P.z / (gF * -FL) * gPx);
  else {
    float rib = ss(0.1, 0.0, abs(fract(P.z / 1.6 + 0.5) - 0.5) * 1.6);
    col = vec3(0.008, 0.011, 0.022) + vec3(0.03, 0.045, 0.085) * rib * exp(-(ZE - P.z) * 0.35);
  }
  // the lamps on the ladders
  for (int i = 0; i < 5; i++) {
    vec3 lp = LAMP[i].xyz;
    vec2 sp = proj(lp);
    float sc = gF / lp.z, r = length((uv - sp) * vec2(1.0, 0.85)) / sc;
    if (lp.z > P.z + 0.3) continue;
    float fl = 0.9 + 0.1 * noise(vec2(uTime * 3.0, float(i) * 7.0));
    col = mix(col, vec3(0.02, 0.012, 0.008), ss(0.006, 0.0, abs((uv.x - sp.x) / sc)) * step(0.0, (uv.y - sp.y) / sc) * step((uv.y - sp.y) / sc, 0.09));
    col += vec3(2.4, 1.35, 0.55) * ss(0.05, 0.035, r) * fl * LAMP[i].w;
    col += vec3(1.0, 0.45, 0.14) * LAMP[i].w * fl * (0.5 * exp(-r * 18.0) + 0.12 * exp(-r * 4.5));
  }
  // the moon shafts: a short march along the eye ray, each step looking back to the window
  float shaft = 0.0;
  {
    float z0 = 0.6, z1 = min(P.z, ZE - 0.7);
    const int N = 22;
    float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float dz = (z1 - z0) / float(N);
    for (int i = 0; i < N; i++) {
      float z = z0 + (float(i) + jit) * dz;
      vec3 q = d * (z / gF);
      float s = (q.z - ZE) / gL.z;
      vec2 wq = q.xy - gL.xy * s;
      float l = winLight(wq, 0.015 + s * 0.008);
      shaft += l * (0.2 + 1.8 * pow(noise(vec2(wq.x * 5.0 + wq.y * 0.8, uTime * 0.04)), 2.0) * (0.6 + 0.4 * noise(wq * 1.7 - uTime * 0.03))) * exp(-s * 0.06);
    }
    shaft *= dz * 0.15;
  }
  float breathe = 0.7 + 0.55 * gBass;
  col += vec3(0.34, 0.48, 0.85) * shaft * breathe;
  // the haze of the hall, brightest towards the window
  float fog = (1.0 - exp(-P.z * 0.04)) * (t == tE ? 0.45 : 1.0);
  vec2 wdir = uv - proj(vec3(0.0, 2.2, ZE));
  col = mix(col, vec3(0.018, 0.026, 0.05) + vec3(0.06, 0.09, 0.16) * exp(-length(wdir * vec2(1.6, 0.9)) * 2.4), fog);
  // dust in the moonlight, sparkling with the highs
  for (int layer = 0; layer < 2; layer++) {
    float scale = 34.0 + float(layer) * 40.0;
    vec2 g = uv * scale + vec2(uTime * 0.12, -uTime * (0.25 + 0.15 * float(layer))) + float(layer) * 19.7;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + 31.0 * float(layer));
    if (h > 0.05 + 0.04 * float(layer)) continue;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    off += 0.15 * vec2(sin(uTime * 0.7 + h * 40.0), cos(uTime * 0.5 + h * 30.0));
    float r = length(f - off * 0.6) / scale;
    float tw = 0.55 + 0.45 * sin(uTime * (0.8 + h * 4.0) + h * 60.0);
    tw += gHigh * 2.2 * pow(max(sin(uTime * 11.0 + h * 97.0), 0.0), 6.0);
    float sz = gPx * (0.7 + 0.5 * float(1 - layer));
    col += vec3(0.75, 0.85, 1.0) * exp(-r * r / (sz * sz)) * tw * min(shaft * 2.5, 1.0) * breathe;
  }
  // the flying books
  for (int i = 0; i < 5; i++) flyingBook(col, uv, i);
  // the lectern, backlit by the moon, its open book glowing
  {
    vec3 anchor = vec3(clamp(gAsp * 0.26, 0.27, 0.46) * 2.7 / gF, FL, 2.7);
    vec2 sp = proj(anchor);
    float sc = gF / anchor.z;
    vec2 l = (uv - sp) / sc;
    float lpx = gPx / sc;
    if (l.y < 2.6 && abs(l.x) < 1.2) {
      float D = lecternD(l);
      float m = ss(lpx, -lpx, D);
      float glowL = 1.0 + 0.25 * sin(uTime * 1.3) + 0.5 * gHigh;
      if (m > 0.0) {
        vec2 gr = vec2(lecternD(l + vec2(0.01, 0.0)) - D, lecternD(l + vec2(0.0, 0.01)) - D) / 0.01;
        float edge = ss(-0.03, 0.0, D);
        vec3 lc = vec3(0.07, 0.034, 0.016) * (0.35 + 0.65 * ss(0.4, -0.4, gr.x));     // dark walnut, turned
        float bw = exp(-length((l - vec2(0.0, 1.05)) * vec2(1.0, 1.6)) * 2.8);
        lc += vec3(0.9, 0.42, 0.13) * bw * (0.25 + 0.75 * ss(-0.5, 0.8, gr.y)) * glowL * 0.55;   // the book's light on it
        lc += vec3(1.1, 0.6, 0.25) * ss(0.95, 0.99, l.y) * ss(1.1, 1.06, l.y) * 0.35 * glowL;     // the desk's top face
        lc += vec3(0.22, 0.32, 0.6) * edge * max(dot(normalize(gr + 1e-5), normalize(vec2(-0.55, 0.8))), 0.0) * 0.8;   // moon rim
        col = mix(col, lc, m);
      }
      // the open book lying on the desk: two pages bowing up from the spine
      vec2 bq = l - vec2(0.0, 0.965);
      float ax = abs(bq.x);
      float top = 0.12 + 0.04 * sin(PI * clamp(ax / 0.3, 0.0, 1.0)) - 0.02 * ss(0.06, 0.0, ax);
      float pg = ss(lpx, -lpx, max(max(ax - 0.3, -bq.y + 0.01 * ax), bq.y - top));
      float gutter = ss(0.03, 0.0, ax);
      vec3 page = vec3(1.25, 0.88, 0.48) * (0.5 + 0.5 * ss(0.3, 0.02, ax)) * glowL * (1.0 - 0.45 * gutter);
      page *= 1.0 - 0.28 * ss(0.3, 0.5, abs(fract(bq.y * 80.0) - 0.5)) * step(0.05, ax) * step(ax, 0.26) * step(0.025, bq.y) * step(bq.y, top - 0.02);
      page = mix(page, vec3(0.28, 0.06, 0.04), ss(0.29, 0.305, ax));        // the cover's edge
      col = mix(col, page, pg);
      vec2 hq = (l - vec2(0.0, 1.12)) * vec2(0.8, 1.0);
      col += vec3(1.0, 0.5, 0.18) * glowL * (0.3 * exp(-dot(hq, hq) * 16.0) + 0.09 * exp(-dot(hq, hq) * 2.5));
      // letters and sparks rising out of it
      for (int i = 0; i < 12; i++) {
        float fi = float(i);
        float per = 4.5 + 2.5 * hash11(fi * 3.1);
        float tt = uTime / per + hash11(fi * 7.3);
        float a = fract(tt), cyc = floor(tt);
        float hx = hash11(fi * 1.9 + cyc * 4.7);
        vec2 gp = vec2((hx - 0.5) * 0.4 + 0.12 * sin(a * 5.0 + fi * 2.0) * a, 1.1 + a * (0.75 + 0.45 * hash11(fi + cyc)));
        float fade = ss(0.0, 0.12, a) * ss(1.0, 0.55, a);
        vec2 r = l - gp;
        if (dot(r, r) > 0.04) continue;
        vec3 gc = vec3(1.6, 1.05, 0.45) * fade * glowL;
        if (i < 7) {
          float gs = 0.026;
          vec2 g = rot(0.3 * sin(a * 4.0 + fi)) * r / gs;
          float dg = 1e3;
          // a rune: a stem and two branches off it
          float sx = (hash11(fi * 13.0 + cyc * 2.1) - 0.5) * 0.5;
          dg = seg(g, vec2(sx, -1.0), vec2(sx, 1.0));
          for (int k = 0; k < 2; k++) {
            float h1 = hash11(fi * 11.0 + cyc * 3.3 + float(k) * 1.7), h2 = hash11(fi * 5.0 + cyc * 9.1 + float(k) * 2.3);
            vec2 p1 = vec2(sx, floor(h1 * 3.0) - 1.0);
            vec2 p2 = vec2(h2 < 0.5 ? -0.6 : 0.6, p1.y + (h2 < 0.25 || h2 > 0.75 ? -0.7 : 0.7));
            dg = min(dg, seg(g, p1, p2));
          }
          float px2 = lpx / gs;
          col += gc * (ss(0.14 + px2, 0.14 - px2 * 0.5, dg) + 0.25 * exp(-dg * 2.5));
        } else {
          col += gc * (exp(-dot(r, r) / (lpx * lpx * 2.5)) * 1.2 + 0.08 * exp(-dot(r, r) * 900.0));
        }
      }
    }
  }
  // the dark edges of the frame
  vec2 vq = uv / vec2(max(gAsp, 0.5), 1.0);
  col *= 1.0 - 0.45 * ss(0.5, 1.4, length(vq * vec2(1.0, 0.9)));
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'kutuphane', name: 'Kütüphane', group: 'Vibe',
  blurb: 'An old library hall at night: moonlight shafts through a tall window, dust, warm ladder lamps, and books that fly up the nave flapping their covers like wings',
  tags: ['library', 'books', 'moonlight', 'night', 'magic', 'dreamy', 'calm'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
