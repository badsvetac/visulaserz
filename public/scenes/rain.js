import { SCULPT } from '../js/gfx/scene-kit.js';

// RAIN — a rainy night in Beyoğlu, from the window seat of a flat a few floors up. The camera is
// focused on the glass, so the street beyond is soft: across the road a low old house with a tea
// house on its ground floor, warm windows and people at the tables, a pink neon ÇAY over the door
// in its cyan frame, a lantern on a bracket with the rain falling through its light; arched windows
// upstairs, a television flickering in one, taller houses either side; over the roofs the far shore,
// a mosque on its hill with its minaret balconies lit, the low cloud glowing with the city. Below,
// the wet cobbles mirror all of it, a yellow taxi hisses past, now and then the red tram.
// On the glass, sharp: a mist of fine beads, bigger beads, and drops that hold still and then run,
// each leaving a trail of beads and a wiped track; every drop is a little lens showing the street
// upside down. Inside: a tül curtain, the sill, a black cat looking out, and an ince belli glass of
// tea on its saucer, steaming in the light of a desk lamp. A photo the user drops in (Backdrop)
// takes the place of the street, behind the same glass.
//
// Music: the bass is the rain: how many streaks fall and how bright, the splashes on the stones,
// and the clock the drops on the glass run on (it jumps forward on the bass, so they run on the
// beat). The mids are the neon: each letter of ÇAY follows its own slice of them, the frame its
// own, and the desk lamp warms with them. The highs make the drops glint, each drop listening to
// its own slice. On every beat a car's headlights sweep across the window from below, lighting up
// the drops and the frame as they pass, gone within the beat; on every sixteenth beat lightning
// splits the sky over the far shore (the app answers it with thunder). With nothing playing the
// rain falls softly and the drops wait.
const frag = `${SCULPT}
const float BASE = -0.30;        // the foot of the houses across the street
const float KERB = -0.355;       // the far kerb: the road starts here
const float SIGNK = 0.1;         // the neon letters' height
const float RAIL = 0.035;        // the bottom rail of the window frame
const float FW = 0.055;          // the frame's width at the sides and the top
const vec3 WARM = vec3(1.0, 0.6, 0.3);
const vec3 SODIUM = vec3(1.0, 0.62, 0.28);
const vec3 PINK = vec3(1.0, 0.12, 0.32);

float gPx, gAsp, gWide, gCoC, gSlide, gFlash, gSweepX, gSweepA, gSweepD, gLampI, gNeonI;
float gGX, gTop, gSill, gBoltX, gBoltS;
float gL0, gL1, gL2;
vec3 gTube;
vec2 gLantern, gSign, gLamp;
vec3 gTaxi, gTram;     // x, direction, on the street now
vec3 gCat;             // where it sits, its size
vec3 gTea;             // the foot of the glass, its height
// the drop that wins a pixel of the glass: coverage, distance from its middle, its glint slice,
// how sharply it sees, its surface normal, where it looks
float gA, gR, gGl, gQc, gRad;
vec3 gN;
vec2 gQ;

// ── small tools ────────────────────────────────────────────────────────────────────────────────
float sq(float x) { return x * x; }
float sbox(vec2 p, vec2 c, vec2 b, float r) { vec2 q = abs(p - c) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float ell(vec2 p, vec2 r) { float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }
// a shape's edge, soft over the blur c (and never sharper than a pixel)
float soft(float d, float c) { return ss(c + gPx, -c - gPx, d); }
// the top half of an ellipse standing on c
float dome(vec2 p, vec2 c, vec2 r) { vec2 q = (p - c) / r; return max((length(q) - 1.0) * min(r.x, r.y), c.y - p.y); }
// a point of light out of focus: a disc as wide as the blur, a touch brighter at its rim; the
// same light spread over a wider disc is dimmer
vec3 bokeh(vec2 d, float c, vec3 light) {
  float r = max(c * 1.25, gPx * 1.3);
  float l = length(d);
  float disc = ss(r + gPx, r - gPx, l) * (0.85 + 0.3 * ss(0.4 * r, r, l));
  return light * disc * min(1.0, sq(0.0045 / r));
}

// the light falling on things outside: the lantern, the neon, the tea house window, headlights
vec3 glowAt(vec2 p) {
  vec2 dl = p - gLantern;
  vec3 L = SODIUM * 0.5 / (1.0 + dot(dl, dl) * 80.0);
  vec2 dn = (p - gSign) * vec2(0.6, 1.1);
  L += PINK * gNeonI * 0.4 / (1.0 + dot(dn, dn) * 40.0);
  L += WARM * 0.22 * exp(-max(sbox(p, vec2(0.0, -0.195), vec2(0.45, 0.095), 0.0), 0.0) * 9.0);
  if (gTaxi.z > 0.5) {
    vec2 h = p - vec2(gTaxi.x + gTaxi.y * 0.18, -0.435);
    float ahead = h.x * gTaxi.y;
    L += vec3(1.0, 0.9, 0.75) * (0.35 / (1.0 + dot(h, h) * 150.0) + 0.3 * ss(0.0, 0.06, ahead) * exp(-ahead * 2.5) * exp(-sq(h.y / (0.02 + ahead * 0.12))));
  }
  if (gTram.z > 0.5) {
    vec2 h = p - vec2(gTram.x + gTram.y * 0.43, -0.355);
    float ahead = h.x * gTram.y;
    L += vec3(1.0, 0.88, 0.7) * (0.3 / (1.0 + dot(h, h) * 150.0) + 0.25 * ss(0.0, 0.06, ahead) * exp(-ahead * 2.5) * exp(-sq(h.y / (0.02 + ahead * 0.12))));
  }
  return L;
}

// ── the neon: ÇAY in pink tubes inside a cyan frame ───────────────────────────────────────────
// in letter units, caps 1 high, the letters side by side from x = 0 to 3
float letterC(vec2 p) {
  vec2 d = p - vec2(0.48, 0.5);
  float a = abs(atan(d.y, d.x));
  float gap = 0.78;                                  // the opening on the right
  float r = 0.48;
  float arc = a > gap ? abs(length(d) - r) : min(length(d - vec2(cos(gap), sin(gap)) * r), length(d - vec2(cos(gap), -sin(gap)) * r));
  // the cedilla hooked under it
  float ced = min(seg(p, vec2(0.48, 0.02), vec2(0.5, -0.1)), min(seg(p, vec2(0.5, -0.1), vec2(0.62, -0.17)), seg(p, vec2(0.62, -0.17), vec2(0.44, -0.27))));
  return min(arc, ced);
}
float letterA(vec2 p) {
  p.x -= 1.17;
  return min(min(seg(p, vec2(0.0, 0.0), vec2(0.41, 1.0)), seg(p, vec2(0.41, 1.0), vec2(0.82, 0.0))), seg(p, vec2(0.16, 0.37), vec2(0.66, 0.37)));
}
float letterY(vec2 p) {
  p.x -= 2.2;
  return min(min(seg(p, vec2(0.0, 1.0), vec2(0.4, 0.5)), seg(p, vec2(0.8, 1.0), vec2(0.4, 0.5))), seg(p, vec2(0.4, 0.5), vec2(0.4, 0.0)));
}
// a glass tube of neon, d its distance in screen units, seen through the blur c
float tube(float d, float c) {
  float w = 0.0052;
  float s2 = w * w + c * c * 0.55;
  return exp(-d * d / s2) * w / sqrt(s2);
}
vec3 neon(vec2 p, float c) {
  vec2 lp = (p - gSign) / SIGNK + vec2(1.5, 0.37);
  if (abs(lp.x - 1.5) > 3.2 || abs(lp.y - 0.37) > 2.2) return vec3(0.0);
  float d0 = letterC(lp) * SIGNK, d1 = letterA(lp) * SIGNK, d2 = letterY(lp) * SIGNK;
  float db = abs(sbox(lp, vec2(1.5, 0.37), vec2(1.95, 0.88), 0.32)) * SIGNK;
  float t0 = tube(d0, c) * gL0, t1 = tube(d1, c) * gL1, t2 = tube(d2, c) * gL2, tb = tube(db, c);
  vec3 col = vec3(0.0);
  col += (PINK * 1.7 + vec3(1.0, 0.55, 0.7) * 1.3 * sq(tube(d0, c))) * t0;
  col += (PINK * 1.7 + vec3(1.0, 0.55, 0.7) * 1.3 * sq(tube(d1, c))) * t1;
  col += (PINK * 1.7 + vec3(1.0, 0.55, 0.7) * 1.3 * sq(tube(d2, c))) * t2;
  col += (gTube * 1.5 + vec3(0.7, 0.95, 1.0) * 0.8 * sq(tb)) * tb;
  // the haze of light round the tubes in the wet air
  float dm = min(d0, min(d1, d2));
  col += PINK * exp(-dm / 0.018) * 0.2 * gNeonI + gTube * exp(-db / 0.02) * 0.1;
  return col;
}

// ── the houses across the street ───────────────────────────────────────────────────────────────
// a window: arched or square, lit or dark, curtains to the sides, sometimes a television
vec3 window(vec2 p, float c, vec2 wc, vec2 wh, float arch, vec2 id, vec3 col, vec3 L) {
  float dr = sbox(p, wc - vec2(0.0, wh.x * 0.5 * arch), vec2(wh.x, wh.y - wh.x * 0.5 * arch), 0.003);
  float d = arch > 0.5 ? min(dr, length(p - vec2(wc.x, wc.y + wh.y - wh.x)) - wh.x) : dr;
  float a = soft(d, c);
  if (a <= 0.0) return col;
  float h = hash21(id + 0.37), k = hash21(id + 17.3);
  // now and then somebody switches a light on or off
  float on = step(0.3, fract(h * 7.0 + floor(uTime / (40.0 + 50.0 * k) + h * 3.0) * 0.618));
  vec2 lq = (p - wc) / wh;
  // every room its own: warm lamps, a cold kitchen strip light, sheer curtains, blinds, a television
  float kind = fract(h * 5.3 + k * 2.1);
  vec3 tint = kind < 0.75 ? mix(vec3(1.0, 0.5, 0.2), vec3(1.0, 0.76, 0.48), k) : vec3(0.72, 0.86, 1.0);
  vec3 room = tint * (0.12 + 0.26 * fract(h * 3.7));
  room *= 0.6 + 0.55 * ss(-1.0, 0.9, lq.y);                                                       // the ceiling light
  if (kind < 0.35) room *= mix(1.0, 0.3 + 0.2 * k, ss(0.25, 0.6, abs(lq.x + (k - 0.5) * 0.5)));   // curtains drawn aside
  else if (kind < 0.6) room *= 0.75 + 0.35 * sin(lq.x * 9.0 + k * 6.0);                           // sheer curtains, in folds
  else if (kind < 0.75) room *= 0.55 + 0.45 * ss(0.2, 0.5, abs(fract(lq.y * 3.5) - 0.5)) * ss(c * 30.0, 0.0, 0.05);   // blinds
  if (fract(k * 7.3) > 0.6) room += bokeh(p - wc - vec2((k - 0.5) * wh.x, wh.y * 0.55), c * 0.6, tint * 1.6);   // a lamp hanging inside
  if (h < 0.13) room = vec3(0.3, 0.45, 1.0) * (0.12 + 0.14 * noise(vec2(uTime * 5.0, h * 50.0))) * (0.7 + 0.3 * ss(1.0, -0.5, lq.y));   // a television
  vec3 g = mix(vec3(0.01, 0.012, 0.02) + L * 0.05, room, on);
  // the window's cross, soft at this distance
  float bars = max(soft(abs(p.x - wc.x) - 0.0035, c * 0.8), soft(abs(p.y - (wc.y + wh.y * 0.3)) - 0.0035, c * 0.8));
  g = mix(g, col * 0.7, bars * 0.75);
  return mix(col, g, a);
}
// the low house in the middle: the tea house, its sign, arched windows, a tiled roof, the lantern
vec3 houseB(vec2 p, float c, vec3 col, vec3 L) {
  // the tea house's window: warm light, lamps hanging, people at the tables
  vec2 q = p - vec2(0.0, -0.195);
  float sa = soft(sbox(q, vec2(0.0), vec2(0.45, 0.092), 0.004), c);
  if (sa > 0.0) {
    vec3 room = vec3(1.0, 0.55, 0.24) * (0.26 + 0.24 * ss(-0.09, 0.09, q.y));
    for (int i = 0; i < 3; i++) room += bokeh(q - vec2(-0.3 + 0.3 * float(i), 0.065), c, vec3(1.0, 0.82, 0.55) * 2.4);
    float ppl = min(ell(q - vec2(-0.17, -0.005), vec2(0.022, 0.026)), sbox(q, vec2(-0.17, -0.06), vec2(0.04, 0.035), 0.025));
    ppl = min(ppl, min(ell(q - vec2(0.12, -0.012), vec2(0.021, 0.025)), sbox(q, vec2(0.12, -0.065), vec2(0.038, 0.035), 0.025)));
    ppl = min(ppl, min(ell(q - vec2(0.36, 0.0), vec2(0.02, 0.024)), sbox(q, vec2(0.36, -0.055), vec2(0.035, 0.035), 0.022)));
    ppl = min(ppl, sbox(q, vec2(0.0, -0.075), vec2(0.5, 0.008), 0.0));            // the table tops
    room = mix(room, vec3(0.05, 0.025, 0.02), soft(ppl, c) * 0.85);
    float mull = soft(abs(abs(q.x) - 0.155) - 0.006, c);
    room = mix(room, vec3(0.02, 0.014, 0.014), mull * 0.85);
    col = mix(col, room, sa);
  }
  // the board the sign hangs on
  col = mix(col, vec3(0.03, 0.018, 0.026) + L * 0.1, soft(sbox(p, gSign + vec2(0.0, 0.003), vec2(0.225, 0.095), 0.008), c));
  // the first floor: three arched windows
  if (p.y > 0.11 && p.y < 0.345) {
    float i = clamp(floor(p.x / 0.3 + 0.5), -1.0, 1.0);
    col = window(p, c, vec2(i * 0.3, 0.235), vec2(0.05, 0.085), 1.0, vec2(i, 1.0), col, L);
  }
  // the cornice, and the wet tiles of the roof above it
  col = mix(col, vec3(0.5, 0.42, 0.36) * (L + 0.04), soft(abs(p.y - 0.352) - 0.006, c) * 0.8);
  float roof = soft(0.36 - p.y, c);
  vec3 tiles = vec3(0.22, 0.08, 0.06) * (L * 0.8 + 0.05) + vec3(0.12, 0.06, 0.08) * 0.35 * ss(0.36, 0.43, p.y);
  col = mix(col, tiles, roof);
  // the chimney
  col = mix(col, vec3(0.16, 0.08, 0.06) * (L + 0.05), soft(abs(p.x - 0.3) - 0.022, c) * soft(0.4 - p.y, c));
  // the lantern on its bracket: glowing glass, its cap and arm
  vec2 lq = p - gLantern;
  col = mix(col, vec3(0.01), soft(min(seg(lq, vec2(0.0, 0.032), vec2(0.07, 0.04)), sbox(lq, vec2(0.0, 0.028), vec2(0.02, 0.006), 0.003)) - 0.002, c));
  col += SODIUM * 1.5 * soft(sbox(lq, vec2(0.0, 0.0), vec2(0.014, 0.022), 0.006), c);
  col += SODIUM * (0.22 * exp(-length(lq) * 22.0) + 0.06 * exp(-length(lq) * 5.0));
  return col;
}
// the taller houses either side: rows of windows, shops at the foot
vec3 houseSide(vec2 p, float c, vec3 col, vec3 L, float side) {
  float pitch = side < 0.0 ? 0.23 : 0.21;
  float x0 = side * 0.62;
  float u = (p.x - x0) * side / pitch;
  float ci = floor(u);
  float wx = x0 + side * (ci + 0.5) * pitch;
  float up = side < 0.0 ? 0.485 : 0.44;
  float fl = p.y < (0.215 + up) * 0.5 ? 0.0 : 1.0;
  float wy = mix(0.215, up, fl);
  float top = side < 0.0 ? 0.66 : 0.55;
  if (ci >= 0.0 && p.y > 0.1 && p.y < top - 0.03) col = window(p, c, vec2(wx, wy), vec2(0.045, 0.08), 0.0, vec2(ci * side + 7.0, fl + 3.0), col, L);
  // a cornice under the roof
  col = mix(col, vec3(0.45, 0.4, 0.36) * (L + 0.04), soft(abs(p.y - top + 0.012) - 0.008, c) * 0.8);
  // the shop at the foot: a grocer's cold light on the left, a shutter pulled down on the right
  if (p.y < -0.06) {
    float sx = x0 + side * 0.4;
    float sd = sbox(p, vec2(sx, -0.2), vec2(0.2, 0.085), 0.004);
    vec3 shop;
    if (side < 0.0) {
      // a grocer's, still open: cold light, shelves, the grocer behind his counter
      shop = vec3(0.6, 0.8, 0.72) * (0.1 + 0.09 * ss(-0.28, -0.12, p.y));
      shop *= 1.0 - 0.45 * soft(abs(fract((p.y + 0.2) / 0.045) - 0.5) * 0.045 - 0.006, c);
      shop = mix(shop, vec3(0.02, 0.03, 0.03), soft(min(ell(p - vec2(sx + 0.06, -0.18), vec2(0.018, 0.022)), sbox(p, vec2(sx + 0.06, -0.24), vec2(0.035, 0.05), 0.02)), c) * 0.9);
      shop = mix(shop, vec3(0.03, 0.025, 0.03) + L * 0.1, soft(sbox(p, vec2(sx, -0.265), vec2(0.2, 0.025), 0.0), c));
    } else {
      shop = (vec3(0.1, 0.1, 0.11) * (L * 1.5 + 0.06)) * (0.8 + 0.2 * ss(-0.3, 0.3, sin(p.y * 260.0)));
    }
    col = mix(col, shop, soft(sd, c));
  }
  return col;
}
vec3 facade(vec2 p, float c) {
  vec3 L = glowAt(p) + vec3(0.04, 0.045, 0.08);
  float x = p.x;
  vec3 plaster = mix(vec3(0.5, 0.38, 0.26), vec3(0.55, 0.32, 0.32), ss(-0.62 - c, -0.62 + c, x));
  plaster = mix(plaster, vec3(0.3, 0.4, 0.37), ss(0.62 - c, 0.62 + c, x));
  float streak = noise(vec2(x * 90.0, p.y * 2.0 + 3.0)) * noise(vec2(x * 23.0, p.y * 1.3));   // rain running down
  vec3 col = plaster * L * (0.9 - 0.4 * streak);
  if (abs(x) < 0.62) col = houseB(p, c, col, L);
  else col = houseSide(p, c, col, L, sign(x));
  return col + neon(p, c);
}

// ── the street ─────────────────────────────────────────────────────────────────────────────────
// a taxi or the tram: its colour and cover; its lamps are added to lamps
vec4 vehicle(vec2 p, float c, vec3 v, float yb, float tram, inout vec3 lamps) {
  vec2 q = vec2((p.x - v.x) * v.y, p.y - yb);
  float hl = tram > 0.5 ? 0.44 : 0.18;
  if (q.x < -hl - 0.05 || q.x > hl + 0.05 || q.y < -0.04 || q.y > 0.28) return vec4(0.0);
  vec3 L = glowAt(p) + vec3(0.03, 0.035, 0.06);
  float d;
  vec3 col;
  if (tram > 0.5) {
    d = min(sbox(q, vec2(0.0, 0.1), vec2(0.43, 0.085), 0.025), sbox(q, vec2(0.0, 0.19), vec2(0.37, 0.012), 0.008));
    col = vec3(0.55, 0.05, 0.035) * (L * 1.3 + 0.03);
    col = mix(col, vec3(0.75, 0.66, 0.5) * (L + 0.03), soft(abs(q.y - 0.07) - 0.011, c));        // the cream band
    float wi = floor(q.x / 0.075 + 0.5), wq = q.x - wi * 0.075;
    float wd = max(abs(wq) - 0.027, abs(q.y - 0.135) - 0.034);
    vec3 inside = vec3(1.0, 0.72, 0.42) * 0.45 * (0.8 + 0.4 * hash11(wi + 3.0));
    float rider = hash11(wi * 1.7 + 0.3) > 0.45 ? soft(ell(vec2(wq + 0.006, q.y - 0.125), vec2(0.016, 0.032)), c) : 0.0;
    inside = mix(inside, vec3(0.07, 0.035, 0.025), rider * 0.85);
    col = mix(col, inside, soft(wd, c) * step(abs(q.x), 0.39));
    float bogie = min(sbox(q, vec2(-0.27, 0.012), vec2(0.07, 0.014), 0.008), sbox(q, vec2(0.27, 0.012), vec2(0.07, 0.014), 0.008));
    col = mix(col, vec3(0.01), soft(bogie, c));
    d = min(d, bogie);
    lamps += bokeh(q - vec2(0.43, 0.045), c, vec3(1.0, 0.9, 0.7) * 2.2);
    lamps += bokeh(q - vec2(-0.43, 0.05), c, vec3(1.0, 0.1, 0.05) * 1.3);
  } else {
    d = min(sbox(q, vec2(0.0, 0.04), vec2(0.18, 0.028), 0.022), sbox(q, vec2(-0.02, 0.077), vec2(0.1, 0.024), 0.022));
    col = vec3(0.9, 0.62, 0.06) * (L * 1.1 + 0.04);
    col = mix(col, vec3(0.025, 0.03, 0.045) + L * 0.2, soft(sbox(q, vec2(-0.02, 0.079), vec2(0.084, 0.016), 0.012), c));   // its windows
    col += L * 0.5 * soft(abs(q.y - 0.067) - 0.003, c) * step(abs(q.x), 0.17);                    // the wet shoulder shines
    col = mix(col, vec3(1.0, 0.85, 0.4) * 1.1, soft(sbox(q, vec2(-0.02, 0.107), vec2(0.024, 0.008), 0.003), c));   // TAKSİ on the roof
    float wh = min(length(q - vec2(-0.115, 0.012)), length(q - vec2(0.115, 0.012))) - 0.022;
    col = mix(col, vec3(0.01), soft(wh, c));
    d = min(d, wh);
    lamps += bokeh(q - vec2(0.178, 0.036), c, vec3(1.0, 0.92, 0.75) * 2.4);
    lamps += bokeh(q - vec2(-0.18, 0.042), c, vec3(1.0, 0.08, 0.04) * 1.3);
  }
  return vec4(col, soft(d, c));
}
// the lamps of a vehicle drawn long on the wet stones, and its headlight's pool on the road ahead
vec3 vehicleRefl(vec2 p, float c, vec3 v, float yb, float hl) {
  if (v.z < 0.5 || p.y > yb) return vec3(0.0);
  float below = yb - p.y, w = 0.007 + c * 0.6;
  float hx = v.x + v.y * hl, tx = v.x - v.y * hl;
  vec3 r = vec3(1.0, 0.9, 0.72) * exp(-abs(p.x - hx) / w) + vec3(1.0, 0.1, 0.05) * 0.6 * exp(-abs(p.x - tx) / w);
  float ahead = (p.x - hx) * v.y;
  r += vec3(1.0, 0.9, 0.72) * 0.5 * ss(0.0, 0.05, ahead) * exp(-ahead * 3.0) * exp(-below * 20.0);
  return r * exp(-below * 8.0) * 0.55;
}
vec3 street(vec2 p, float c) {
  float dd = BASE - p.y;                            // how far below the foot of the houses
  vec3 L = glowAt(p) + vec3(0.03, 0.035, 0.06);
  float road = soft(p.y - KERB, c);
  // puddles mirror the houses cleanly; between them the cobbles break the picture up
  float pud = ss(0.5, 0.66, noise(vec2(p.x * 3.5, dd * 12.0) + 7.0));
  float rip = noise(vec2(p.x * 40.0, dd * 140.0 - uTime * 2.0)) - 0.5;
  vec2 rp = vec2(p.x + rip * 0.012 * (1.0 - 0.7 * pud), BASE + dd * 1.5 + rip * 0.02 * (1.0 - pud));
  vec3 refl = facade(rp, c + 0.006 + dd * 0.05 * (1.0 - pud));
  // the cobbles, set in rows that close up toward the far side
  float s = dd + 0.12;
  float v = log(s) * 16.0;
  float u = p.x / s * 7.0 + floor(v) * 0.5;
  vec2 cf = vec2(fract(u), fract(v)) - 0.5;
  float stone = ss(0.05, -0.08, sbox(cf, vec2(0.0), vec2(0.38, 0.34), 0.2)) * ss(0.03, 0.006, c);
  vec3 col = vec3(0.06, 0.055, 0.06) * L * mix(2.2, 1.4, road) * (0.8 + 0.3 * stone);
  col += refl * mix(0.3, 0.75, pud) * (1.0 - 0.25 * stone * (1.0 - pud));
  col += L * 0.6 * soft(abs(p.y - KERB) - 0.003, c);                              // the kerb's wet edge
  // rain hitting the street: rings opening and gone
  vec2 sc = vec2(p.x / 0.07, dd / 0.035);
  vec2 sid = floor(sc);
  float sh = hash21(sid + 41.0);
  if (sh < 0.15 + 0.6 * gBass) {
    float ph = fract(uTime * 1.8 + sh * 17.0);
    vec2 sp = (sid + 0.5 + (vec2(hash21(sid + 3.0), hash21(sid + 9.0)) - 0.5) * 0.5) * vec2(0.07, 0.035);
    vec2 sd = vec2(p.x - sp.x, (dd - sp.y) * 2.8);
    float ring = exp(-sq((length(sd) - ph * 0.018) / (gPx + c * 0.3 + 0.0015))) * (1.0 - ph);
    col += (L * 0.8 + 0.03) * ring * 0.8;
  }
  col += vehicleRefl(p, c, gTaxi, -0.47, 0.18) + vehicleRefl(p, c, gTram, -0.405, 0.43);
  return col;
}

// ── the far shore, the sky, lightning ──────────────────────────────────────────────────────────
float hillY(float x) { return 0.515 + 0.03 * sin(x * 1.6 + 0.8) + 0.012 * sin(x * 4.3 + 2.0); }
// a mosque, s its size: the hall, the great dome on its drum, half domes, four minarets; lt gets
// the lights on the minarets' balconies
float mosque(vec2 p, float s, float c, inout float lt) {
  vec2 q = p / s;
  float cs = c / s;
  float d = sbox(q, vec2(0.0, 0.12), vec2(0.62, 0.14), 0.02);
  d = min(d, sbox(q, vec2(0.0, 0.3), vec2(0.34, 0.05), 0.01));
  d = min(d, dome(q, vec2(0.0, 0.34), vec2(0.36, 0.3)));
  d = min(d, dome(q, vec2(-0.38, 0.26), vec2(0.2, 0.15)));
  d = min(d, dome(q, vec2(0.38, 0.26), vec2(0.2, 0.15)));
  d = min(d, sbox(q, vec2(0.0, 0.69), vec2(0.008, 0.06), 0.0));
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float outer = mod(fi, 2.0) < 0.5 ? 1.0 : 0.0;
    float mx = (fi < 1.5 ? -1.0 : 1.0) * mix(0.74, 0.95, outer);
    float mh = mix(1.18, 0.98, outer);
    vec2 m = q - vec2(mx, 0.0);
    float md = sbox(m, vec2(0.0, mh * 0.5), vec2(0.03, mh * 0.5), 0.0);
    md = min(md, max(abs(m.x) - 0.032 * clamp(1.0 - (m.y - mh) / 0.22, 0.0, 1.0), max(mh - m.y, m.y - mh - 0.22)));
    d = min(d, md);
    lt += soft(sbox(m, vec2(0.0, mh * 0.78), vec2(0.07, 0.012), 0.008), cs) + 0.6 * soft(sbox(m, vec2(0.0, mh * 0.6), vec2(0.065, 0.01), 0.008), cs) * (1.0 - outer);
  }
  return d * s;
}
vec3 cityLights(vec2 p, float c, float top) {
  vec2 cs = vec2(0.05, 0.034);
  vec2 id = floor(p / cs);
  float h = hash21(id + 31.7);
  if (h > 0.36) return vec3(0.0);
  vec2 lc = (id + 0.5 + (vec2(hash21(id + 2.3), hash21(id + 5.9)) - 0.5) * 0.3) * cs;
  if (lc.y > top - 0.008) return vec3(0.0);
  vec3 tint = h < 0.07 ? vec3(0.55, 0.75, 1.0) : (h < 0.13 ? vec3(1.0, 0.85, 0.65) : vec3(1.0, 0.6, 0.28));
  float tw = 0.85 + 0.15 * sin(uTime * (0.5 + h * 7.0) + h * 40.0);
  return bokeh(p - lc, min(c * 0.85, 0.0095), tint * (0.8 + 1.4 * hash21(id + 8.1)) * tw);
}
// the bolt: a jagged line from the cloud down to the far hills, a branch off it
vec3 bolt(vec2 p, float c) {
  float y = p.y;
  if (y > gTop + 0.05) return vec3(0.0);
  float s = gBoltS;
  float x = gBoltX + (noise(vec2(y * 6.0, s)) - 0.5) * 0.2 + (noise(vec2(y * 28.0, s + 5.0)) - 0.5) * 0.045 + (0.9 - y) * (hash11(s) - 0.5) * 0.3;
  float d = abs(p.x - x);
  float bx = x + (y - 0.72) * 0.9 * (hash11(s + 3.0) < 0.5 ? -1.0 : 1.0) + (noise(vec2(y * 30.0, s + 9.0)) - 0.5) * 0.03;
  float db = abs(p.x - bx) + 0.004;
  float branch = ss(0.73, 0.7, y) * ss(0.56, 0.62, y);
  float w = gPx * 1.1 + c * 0.35;
  float core = exp(-d * d / (w * w)) + 0.6 * exp(-db * db / (w * w)) * branch;
  float halo = exp(-d / 0.035) + 0.5 * exp(-db / 0.03) * branch;
  return vec3(0.82, 0.86, 1.0) * (core * 2.6 + halo * 0.35);
}
vec3 farView(vec2 p, float c) {
  float y = p.y;
  // low cloud, lit from below by the city: rose over the roofs, violet, then night
  vec3 col = mix(vec3(0.34, 0.13, 0.15), vec3(0.09, 0.055, 0.14), ss(0.5, 0.72, y));
  col = mix(col, vec3(0.016, 0.02, 0.05), ss(0.66, 0.98, y));
  float cl = fbm(vec2(p.x * 1.2 - uTime * 0.012, y * 2.8 + 1.7));
  col *= 0.45 + 1.1 * cl;
  if (gFlash > 0.0) {
    float near = exp(-abs(p.x - gBoltX) * 1.3);
    col += vec3(0.4, 0.43, 0.6) * gFlash * (0.2 + 0.8 * cl * cl) * (0.35 + 0.65 * near);
    col += bolt(p, c) * ss(0.1, 0.5, gFlash);
  }
  // the far shore: the hill, a mosque floodlit on it, the hillside pricked with lights
  float hy = hillY(p.x);
  float lt = 0.0;
  float mx = -0.12;
  float md = mosque(p - vec2(mx, hillY(mx) - 0.012), 0.17, c, lt);
  float a = soft(min(p.y - hy, md), c);
  if (a > 0.0) {
    vec3 hill = vec3(0.035, 0.026, 0.05) + col * 0.12;
    float flood = soft(md, c);
    hill = mix(hill, mix(vec3(0.24, 0.13, 0.1), vec3(0.08, 0.06, 0.12), ss(hy, hy + 0.12, p.y)), flood * 0.8);
    hill += cityLights(p, c, hy) * (1.0 - flood);
    col = mix(col, hill, a);
  }
  col += vec3(1.0, 0.75, 0.42) * lt * 0.9;
  // a television aerial on the roof across, black against the glow
  float ant = min(seg(p, vec2(-0.22, 0.42), vec2(-0.22, 0.575)), min(seg(p, vec2(-0.275, 0.545), vec2(-0.165, 0.545)), seg(p, vec2(-0.26, 0.51), vec2(-0.18, 0.51))));
  col = mix(col, vec3(0.012, 0.01, 0.018), soft(ant - 0.0014, c) * 0.85);
  return col;
}
// the roofline across the street: a taller house each side of the low one, a chimney
float skyH(float x, float c) {
  float h = 0.52;
  h += 0.18 * ss(-1.55 - c, -1.55 + c, x);
  h -= 0.27 * ss(-0.62 - c, -0.62 + c, x);
  h += 0.15 * ss(0.62 - c, 0.62 + c, x);
  h += 0.16 * ss(1.5 - c, 1.5 + c, x);
  return max(h, 0.43 + 0.07 * ss(0.022 + c, 0.022 - c, abs(x - 0.3)));
}

// ── the view through the glass, before the drops: the street, or the user's photo ─────────────
vec3 rainAt(vec2 p, float c, vec3 L) {
  float amt = 0.0;
  float dens = 0.16 + 0.42 * gBass;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sc = 16.0 + 14.0 * fi;
    vec2 q = vec2(p.x + p.y * 0.07, p.y) * vec2(sc, sc * 0.16) + vec2(fi * 3.7, uTime * (1.5 + 0.45 * fi) * sc * 0.16);
    vec2 id = floor(q), f = fract(q);
    float h = hash21(id + fi * 17.3);
    if (h > dens) continue;
    float x0 = 0.15 + 0.7 * hash21(id + 5.3);
    float len = 0.4 + 0.45 * hash21(id + 2.9);
    float y0 = hash21(id + 8.8) * (1.0 - len);
    float w = (gPx * 0.5 + c * (0.26 - 0.07 * fi)) * sc;
    float line = ss(w + gPx * sc, 0.0, abs(f.x - x0)) * ss(y0, y0 + 0.15, f.y) * ss(y0 + len, y0 + len - 0.15, f.y);
    amt += line * (0.5 + 0.35 * fi) * gPx * sc / (w + gPx * sc) * 2.0;
  }
  return (vec3(0.012, 0.014, 0.02) + L * 1.6) * amt * (0.5 + 1.0 * gBass);
}
vec3 photo(vec2 p, float c) {
  vec2 t = p / vec2(gAsp, 1.0) * 0.5 + 0.5;
  vec2 k = vec2(0.5 / gAsp, 0.5);
  float r = uBackdropAspect / gAsp;
  if (r > 1.0) { t.x = 0.5 + (t.x - 0.5) / r; k.x /= r; } else { t.y = 0.5 + (t.y - 0.5) * r; k.y *= r; }
  vec3 s = textureLod(uBackdrop, t, 0.0).rgb * 2.0;
  for (int i = 0; i < 6; i++) { float a = float(i) * 1.0472 + 0.4; s += textureLod(uBackdrop, t + vec2(cos(a), sin(a)) * c * k, 0.0).rgb; }
  return s / 8.0 * 0.9 + vec3(0.4, 0.45, 0.6) * gFlash * 0.35;
}
vec3 outside(vec2 p, float c) {
  vec3 col;
  vec3 L;
  if (uHasBackdrop > 0.5) {
    col = photo(p, c);
    L = col * 0.6;
  } else {
    float top = skyH(p.x, c);
    float f = soft(p.y - top, c);
    col = vec3(0.0);
    if (f < 1.0) col = farView(p, c);
    if (f > 0.0) {
      float g = soft(BASE - p.y, c);
      vec3 b = vec3(0.0);
      if (g > 0.0) b = facade(p, c);
      if (g < 1.0) b = mix(street(p, c), b, g);
      col = mix(col, b, f);
    }
    if (p.y < -0.2) {
      vec3 lamps = vec3(0.0);
      if (gTram.z > 0.5) { vec4 v = vehicle(p, c, gTram, -0.405, 1.0, lamps); col = mix(col, v.rgb, v.a); }
      if (gTaxi.z > 0.5) { vec4 v = vehicle(p, c, gTaxi, -0.47, 0.0, lamps); col = mix(col, v.rgb, v.a); }
      col += lamps;
    }
    L = glowAt(p);
  }
  return col + rainAt(p, c, L);
}

// ── the drops on the glass ─────────────────────────────────────────────────────────────────────
// a drop at c, radius r: if it covers this pixel more than the drop found so far it wins, and the
// pixel looks through it, upside down, at what lies view away
void drop(vec2 p, vec2 c, float r, float view, float glint) {
  vec2 d = (p - c) / r;
  d.y *= d.y < 0.0 ? 0.9 : 1.1;                     // a bead hangs: fuller at the bottom
  float l = length(d);
  float aa = gPx / r;
  if (l > 1.0 + aa) return;
  float a = ss(1.0 + aa, 1.0 - aa, l);
  if (a <= gA) return;
  gA = a;
  gR = l;
  gGl = glint;
  gRad = r;
  gN = normalize(vec3(d * 0.85, sqrt(max(1.0 - l * l, 0.0)) + 0.12));
  gQ = c - d * view;
  gQc = max(gPx * view / r * 0.55, 0.0018);
}
// beads sitting on the glass, one to a cell; they gather and dry away over the minutes
void beads(vec2 p, float clear, float cell, float rmax, float seed) {
  vec2 id = floor(p / cell);
  float h = hash21(id + seed);
  if (h > 0.7) return;
  vec2 c = (id + 0.5 + (vec2(hash21(id + seed + 1.7), hash21(id + seed + 4.1)) - 0.5) * 0.4) * cell;
  float ph = fract(uTime / (30.0 + 40.0 * h) + h * 9.1);
  float r = rmax * (0.35 + 0.65 * hash21(id + seed + 2.9)) * ss(0.0, 0.12, ph) * ss(1.0, 0.75, ph) * (1.0 - clear);
  if (r < gPx * 0.6) return;
  drop(p, c, r, r * 9.0, h);
}
float pathX(float y, float lane, float set) { return (noise(vec2(y * 6.0, lane * 3.1 + set * 17.0)) - 0.5) * 0.05; }
// the drops that run: one to a lane, waiting, then running a little way, on a clock the bass
// pushes; each leaves beads and a thin wet track behind it, and wipes the fine beads away.
// Returns how clean the glass is here.
float runner(vec2 p, float set) {
  float W = 0.2;
  float lane = floor(p.x / W + set * 0.5);
  float h = hash11(lane * 7.31 + set * 19.7 + 0.13);
  if (h < 0.3) return 0.0;
  float cx = (lane + 0.5 - set * 0.5) * W + (h - 0.65) * 0.04;
  float r = 0.022 + 0.014 * hash11(lane * 3.7 + set * 5.1);
  float s = gSlide * (0.5 + 0.7 * hash11(lane * 1.9 + set * 2.3)) + h * 91.0;
  float stepLen = 0.03 + 0.05 * hash11(lane * 5.3 + set * 8.9);
  float trail = 0.5;
  float run = (floor(s) + ss(0.5, 0.95, fract(s))) * stepLen;
  float dy = gTop + 0.25 - mod(run, gTop - gSill + 0.5 + trail);
  float above = p.y - dy;
  if (above < -r * 1.3 || above > trail * 1.6) return 0.0;
  float tx = cx + pathX(p.y, lane, set);
  // the drop, narrower toward the top where the trail leaves it
  vec2 dc = vec2(cx + pathX(dy, lane, set), dy);
  float up = clamp((p.y - dy) / r, 0.0, 1.0);
  drop(vec2(dc.x + (p.x - dc.x) / (1.0 - 0.3 * up), dc.y + (p.y - dc.y) * (1.0 - 0.2 * up)), dc, r, r * 8.0, h);
  if (above > 0.0 && above < trail) {
    float age = above / trail;
    float j = floor(p.y / 0.03);
    float bh = hash11(j * 3.17 + lane * 11.3 + set * 5.0);
    float by = (j + 0.5) * 0.03 + (bh - 0.5) * 0.006;
    float bage = (by - dy) / trail;
    if (bh > 0.4 && bage > 0.06 && bage < 1.0) {
      float br = r * (0.42 - 0.3 * bage) * (0.5 + 0.6 * fract(bh * 13.0));
      drop(p, vec2(cx + pathX(by, lane, set) + (fract(bh * 7.0) - 0.5) * r * 0.5, by), br, br * 7.0, bh);
    }
    // the film of water down its track
    float tw = r * 0.17 * (1.0 - age);
    float fx = p.x - tx;
    float fa = ss(tw + gPx, max(tw - gPx, 0.0), abs(fx)) * 0.75 * min(1.0, tw / gPx);
    if (fa > gA) {
      gA = fa;
      gR = abs(fx) / max(tw, 1e-4) * 0.7;
      gN = normalize(vec3(fx / max(tw, 1e-4) * 0.6, 0.0, 1.0));
      gQ = vec2(tx - fx * 3.0, p.y);
      gQc = gCoC * 0.6;
      gGl = h;
    }
  }
  return ss(r * 1.4, r * 0.8, abs(p.x - tx)) * ss(-r, 0.0, above) * ss(trail * 1.6, trail * 0.4, above);
}
// the glass and everything on it
vec3 glassView(vec2 p) {
  gA = 0.0; gR = 0.0; gGl = 0.0; gRad = 0.0; gN = vec3(0.0, 0.0, 1.0); gQ = p; gQc = gCoC;
  float clear = max(runner(p, 0.0), runner(p, 1.0));
  beads(p, clear * 0.6, 0.11, 0.032, 3.0);
  beads(p, clear, 0.03, 0.0075, 11.0);
  float fog = ss(gSill + 0.2, gSill, p.y);              // breath on the glass above the sill
  float c = mix(gCoC * (1.0 + 0.8 * fog), gQc, gA);
  vec3 col = outside(mix(p, gQ, gA), c);
  // a drop gathers light into its middle and is dark at its rim, where it bends the light away
  col *= mix(1.0, 1.3 - 1.2 * ss(0.5, 1.0, gR), gA);
  // the lamp shines on each drop; each glints with its own slice of the highs
  float gb = band(0.6 + 0.36 * gGl);
  vec3 spec = WARM * gLampI * 0.8 * pow(max(dot(gN, normalize(vec3(0.45, 0.06, 0.9))), 0.0), 140.0);
  spec += vec3(0.8, 0.9, 1.0) * (0.15 + 2.8 * gb) * pow(max(dot(gN, normalize(vec3(-0.35, 0.45, 1.0))), 0.0), 220.0) * mix(0.3, 1.0, ss(0.004, 0.014, gRad));
  // a car's lights sweeping past from below light the drops they cross; lightning lights them all
  float sweep = gSweepA * exp(-sq((p.x - gSweepX) / 0.38));
  spec += vec3(0.9, 0.95, 1.0) * pow(max(dot(gN, normalize(vec3(-gSweepD * 0.3, -0.5, 1.0))), 0.0), 30.0) * sweep * 3.0;
  spec += vec3(0.7, 0.75, 1.0) * pow(max(dot(gN, vec3(0.0, 0.45, 0.89)), 0.0), 30.0) * gFlash * 2.0;
  col += spec * gA;
  col += vec3(0.9, 0.95, 1.0) * 0.05 * sweep;              // and the wet glass scatters a little of it
  // the room in the night glass: the lamp's reflection, breath near the sill
  col += WARM * gLampI * 0.05 * exp(-length((p - vec2(gLamp.x - 0.55, 0.05)) * vec2(0.8, 1.2)) * 2.5);
  col = mix(col, vec3(0.08, 0.065, 0.065) + gLampI * 0.05 * WARM, fog * 0.3);
  return col;
}

// ── the room ───────────────────────────────────────────────────────────────────────────────────
vec3 lampAt(vec2 p) { vec2 l = p - gLamp; return WARM * gLampI * 0.9 / (0.5 + dot(l, l) * 1.6); }
// the light coming in through the window, near the bottom of the glass
vec3 winLight(float x) {
  vec3 w = vec3(0.06, 0.065, 0.11);
  w += PINK * gNeonI * 0.2 * exp(-abs(x - gSign.x) * 2.2);
  w += WARM * 0.12 * exp(-abs(x) * 1.8);
  w += vec3(0.5, 0.55, 0.75) * gFlash * 0.7;
  w += vec3(0.85, 0.9, 1.0) * gSweepA * 0.45 * exp(-sq((x - gSweepX) / 0.5));
  return w;
}
vec3 frameCol(vec2 p, float dg) {
  vec3 lit = lampAt(p) * 0.45 + winLight(p.x) * 0.9 * ss(0.03, 0.0, dg) + vec3(0.035, 0.03, 0.035);
  vec3 col = vec3(0.72, 0.67, 0.6) * lit;
  col *= 0.7 + 0.3 * ss(0.0, 0.012, dg) * ss(FW, FW - 0.012, dg);        // the moulding
  col += winLight(p.x) * 0.25 * ss(0.006, 0.0, dg);                      // the edge against the glass
  return col;
}
vec3 wallCol(vec2 p) {
  return vec3(0.45, 0.36, 0.3) * (lampAt(p) * 0.3 + vec3(0.02, 0.018, 0.025)) * (0.92 + 0.08 * noise(p * 40.0));
}
vec3 sillCol(vec2 p) {
  float z = gSill - RAIL - p.y;                              // 0 at the back, against the window
  float lz = log(z + 0.02);
  float gr = noise(vec2(p.x * 2.5, lz * 30.0)) * 0.6 + noise(vec2(p.x * 9.0, lz * 90.0)) * 0.4;
  vec3 wood = vec3(0.2, 0.11, 0.06) * (0.65 + 0.55 * gr);
  vec3 col = wood * (lampAt(p) * 0.75 + winLight(p.x) * 1.4 * exp(-z * 5.0) + 0.02);
  // the varnish mirrors the street, the more so at a grazing angle near the window
  float fres = mix(0.38, 0.06, ss(0.0, 0.35, z));
  col += outside(vec2(p.x + (gr - 0.5) * 0.01, gSill + z * 1.15), 0.016 + z * 0.05) * fres;
  // shadows: the cat's and the glass's, toward us from the window and to the left from the lamp
  vec2 cq = (p - gCat.xy) / gCat.z;
  col *= 1.0 - 0.55 * exp(-sq(cq.x / 0.32) - sq((cq.y + 0.02) / 0.07)) - 0.35 * exp(-sq((cq.x + 0.45) / 0.45) - sq((cq.y + 0.01) / 0.06));
  vec2 tq = (p - gTea.xy) / gTea.z;
  col *= 1.0 - 0.4 * exp(-sq((tq.x + 0.5) / 0.55) - sq(tq.y / 0.07));
  // the tea throws a red-amber light through itself onto the sill beside the saucer
  col += vec3(1.0, 0.32, 0.08) * lampAt(gTea.xy) * 0.12 * exp(-sq((tq.x + 0.75) / 0.22) - sq((tq.y + 0.01) / 0.05));
  return col;
}
// the tül curtain at the left of the window, sheer, lit through by the street
vec3 curtain(vec2 p, vec3 col) {
  float edge = -gGX + mix(0.1, 0.32, gWide) + 0.025 * sin(p.y * 4.0 + 1.0) + 0.012 * sin(p.y * 11.0 + uTime * 0.3);
  if (p.x > edge + gPx * 2.0) return col;
  float a = ss(edge + gPx, edge - gPx, p.x);
  float fold = 0.5 + 0.5 * sin((p.x - edge) * 70.0 + sin(p.y * 2.3) * 1.2 + 0.4 * sin(uTime * 0.25));
  float sheer = 0.25 + 0.38 * fold * fold + 0.3 * ss(0.025, 0.0, edge - p.x);
  vec2 lc = fract(rot(0.5) * p * 34.0) - 0.5;
  sheer -= 0.12 * ss(0.22, 0.12, length(lc));               // the lace's pattern of little holes
  vec3 glow = (col * 0.6 + winLight(p.x) * 0.9 + lampAt(p) * 0.2) * (0.55 + 0.9 * fold);
  return mix(col, vec3(0.92, 0.9, 0.88) * glow, a * clamp(sheer, 0.0, 1.0) * 0.9);
}

// ── the cat, seen from behind, looking out ─────────────────────────────────────────────────────
float tri(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
  vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 q0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 q1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 q2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(q0, q0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(q1, q1), s * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(q2, q2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
float catD(vec2 u) {
  float breath = 1.0 + 0.012 * sin(uTime * 1.7);
  float d = ell(u - vec2(0.0, 0.2), vec2(0.27, 0.22 * breath));                        // haunches
  d = smin(d, ell(rot(0.12) * (u - vec2(0.035, 0.44)), vec2(0.18, 0.27)), 0.09);         // back
  d = smin(d, ell(u - vec2(0.08, 0.66), vec2(0.125, 0.11)), 0.06);                        // shoulders
  d = smin(d, ell(u - vec2(0.115, 0.815), vec2(0.135, 0.118)), 0.05);                     // head
  float twitch = 0.03 * ss(0.85, 1.0, sin(uTime * 0.7 + 1.0)) * sin(uTime * 25.0);
  float ears = min(tri(u, vec2(0.0, 0.86), vec2(0.03, 1.02), vec2(0.105, 0.91)), tri(u, vec2(0.15, 0.915), vec2(0.225 + twitch, 1.0), vec2(0.245, 0.85))) - 0.012;
  d = smin(d, ears, 0.02);
  // the tail curls round the front of its feet, its tip lifting now and then
  float sway = 0.04 * sin(uTime * 0.8) + 0.04 * ss(0.6, 1.0, sin(uTime * 0.31)) * sin(uTime * 2.3);
  vec2 t0 = vec2(-0.2, 0.08), t1 = vec2(-0.31, 0.0), t2 = vec2(-0.23, -0.075), t3 = vec2(0.0, -0.088), t4 = vec2(0.19, -0.06 + sway);
  float tail = min(min(seg(u, t0, t1), seg(u, t1, t2)), min(seg(u, t2, t3), seg(u, t3, t4)));
  return smin(d, tail - mix(0.04, 0.03, ss(-0.05, 0.2, u.x) * ss(0.0, -0.05, u.y)), 0.03);
}
vec4 catLayer(vec2 p) {
  vec2 u = (p - gCat.xy) / gCat.z;
  if (u.x < -0.42 || u.x > 0.5 || u.y < -0.16 || u.y > 1.08) return vec4(0.0);
  float pxu = gPx / gCat.z;
  float d = catD(u) + (noise(u * 60.0) - 0.5) * 0.007;         // fur: a ragged edge
  // whiskers, catching the light past the cheek
  float wk = min(seg(u, vec2(0.21, 0.79), vec2(0.42, 0.815)), min(seg(u, vec2(0.21, 0.78), vec2(0.41, 0.77)), seg(u, vec2(0.2, 0.77), vec2(0.38, 0.735))));
  float wa = ss(pxu * 1.2, 0.0, wk - 0.002) * 0.55;
  float a = ss(pxu, -pxu, d);
  if (a <= 0.0 && wa <= 0.0) return vec4(0.0);
  vec3 win = winLight(p.x) + PINK * gNeonI * 0.22 * exp(-length((p - gSign) * vec2(0.8, 1.4)) * 2.5);
  float e = 0.006;
  vec2 g = vec2(catD(u + vec2(e, 0.0)) - catD(u - vec2(e, 0.0)), catD(u + vec2(0.0, e)) - catD(u - vec2(0.0, e)));
  g /= max(length(g), 1e-4);
  float t = sqrt(clamp(-d / 0.1, 0.0, 1.0));
  vec3 n = normalize(vec3(g * (1.0 - t), t + 0.05));
  // black fur with a faint tabby barring, the lamp on its right side, the window behind it
  vec3 fur = vec3(0.07, 0.064, 0.062) * (0.8 + 0.4 * noise(vec2(u.x * 30.0, u.y * 90.0)));
  fur *= 1.0 - 0.3 * ss(0.3, 0.8, sin(u.y * 36.0 + noise(u * 6.0) * 3.0)) * ss(0.1, 0.5, u.y);
  vec3 col = fur * (lampAt(p) * 1.4 * max(dot(n, normalize(vec3(0.85, 0.2, 0.5))), 0.0) + vec3(0.02, 0.022, 0.03));
  float rim = pow(1.0 - n.z, 2.0);
  if (t < 0.95) {
    vec3 behind = outside(vec2(p.x, max(p.y, gSill + 0.01)) + g * 0.03, 0.03) * ss(gSill - 0.2, gSill + 0.03, p.y) + win * 0.4;
    col += behind * rim * 2.6 * (0.6 + 0.7 * noise(u * 40.0));
  }
  col += vec3(0.6, 0.18, 0.12) * length(win) * ss(0.88, 0.97, u.y) * (1.0 - t) * 1.6;   // the light through its ears
  col = mix(col, win * 1.6, wa * (1.0 - a));
  return vec4(col, max(a, wa));
}

// ── the ince belli glass of tea on its saucer ──────────────────────────────────────────────────
float tulip(float h) { return 0.215 + 0.045 * exp(-sq((h - 0.2) / 0.16)) - 0.05 * exp(-sq((h - 0.58) / 0.13)) + 0.07 * ss(0.68, 1.0, h); }
vec3 teaLayer(vec2 p, vec3 col) {
  float H = gTea.z;
  vec2 b = (p - gTea.xy) / H;
  if (abs(b.x) > 0.62 || b.y < -0.16 || b.y > 2.4) return col;
  float px = gPx / H;
  vec3 lamp = lampAt(gTea.xy + vec2(0.0, H * 0.4));
  vec3 win = winLight(p.x);
  // the saucer: white porcelain, a red band, the glass's shadow and the tea's light on it
  float sd = ell(b - vec2(0.0, -0.02), vec2(0.55, 0.12));
  if (sd < px) {
    float sr = length((b - vec2(0.0, -0.02)) / vec2(0.55, 0.12));
    vec3 por = vec3(0.8, 0.77, 0.72) * (lamp * 0.8 + win * 0.5 + 0.03);
    por = mix(por, vec3(0.6, 0.06, 0.05) * (lamp * 0.8 + 0.05), ss(0.07, 0.03, abs(sr - 0.84)));
    por *= 0.8 + 0.2 * ss(-0.12, 0.1, b.y);
    por *= 1.0 - 0.5 * exp(-sq((b.x + 0.16) / 0.22) - sq(b.y / 0.05));
    por += vec3(1.0, 0.3, 0.08) * lamp * 0.3 * exp(-sq((b.x + 0.32) / 0.1) - sq(b.y / 0.04));
    col = mix(col, por, ss(px, -px, sd));
  }
  // the glass
  float h = b.y;
  if (h > -0.06 && h < 1.1) {
    float r = tulip(clamp(h, 0.0, 1.0));
    float xi = b.x / r;
    float dRim = ell(b - vec2(0.0, 1.0), vec2(tulip(1.0), 0.065));
    float d = min(max(abs(b.x) - r, max(h - 1.0, -h)), min(dRim, ell(b, vec2(tulip(0.0), 0.04))));
    float ga = ss(px, -px, d);
    if (ga > 0.0) {
      float level = 0.82;
      float th = sqrt(max(1.0 - xi * xi, 0.0));
      vec3 back = col;
      vec3 g;
      float surf = ell(b - vec2(0.0, level), vec2(tulip(level), 0.065 * tulip(level) / tulip(1.0)));
      if (h < level || surf < 0.0) {
        // tea: deep red where it is thick, the lamp's light glowing through on the far side
        g = back * vec3(0.6, 0.18, 0.05) + vec3(0.08, 0.01, 0.004);
        g += vec3(1.0, 0.3, 0.05) * lamp * 0.55 * ss(0.5, -0.9, xi) * (0.4 + 0.6 * th) * ss(0.0, 0.3, h);
        g += vec3(0.8, 0.2, 0.05) * win * 0.6;
        if (surf < 0.0) {
          vec2 sv = (b - vec2(0.0, level)) / vec2(tulip(level), 0.06);
          g = vec3(0.1, 0.02, 0.006) + WARM * lamp * 0.35 * exp(-length(sv - vec2(0.4, 0.3)) * 4.0) + win * 0.2 * ss(0.5, 1.0, length(sv));
        }
      } else {
        g = back * 0.85 + win * 0.04;
      }
      // the glass itself: the lamp's streak, the window's, bright edges, a gold rim
      g += WARM * lamp * 0.75 * exp(-sq((xi - 0.66) / 0.07)) * ss(0.05, 0.25, h);
      g += win * 1.6 * exp(-sq((xi + 0.74) / 0.06));
      g += (win + lamp * 0.25) * 0.5 * ss(0.84, 1.0, abs(xi));
      g += vec3(1.0, 0.75, 0.3) * lamp * 0.9 * ss(px * 2.0, 0.0, abs(dRim)) * step(0.97, h);
      // the car's light sweeping past catches the glass
      g += vec3(0.9, 0.95, 1.0) * gSweepA * 0.5 * exp(-sq((xi + gSweepD * (gSweepX - gTea.x) * 2.0) / 0.25)) * exp(-sq((p.x - gSweepX) / 0.6));
      col = mix(col, g, ga);
    }
  }
  // steam curling up off the tea
  float sy = b.y - 1.05;
  if (sy > 0.0 && sy < 1.3) {
    float st = 0.0;
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float sx = b.x - (fk - 0.5) * 0.14 - 0.12 * sin(sy * 4.5 - uTime * 1.2 + fk * 2.4) * sy - 0.04 * sin(sy * 11.0 - uTime * 2.1 + fk);
      float w = 0.025 + 0.06 * sy;
      st += exp(-sx * sx / (w * w)) * ss(0.0, 0.12, sy) * ss(1.3, 0.35, sy) * (0.5 + 0.5 * noise(vec2(sx * 6.0, sy * 3.0 - uTime * 0.8)));
    }
    col += (lampAt(p) * 0.4 + win * 0.4 + 0.03) * st * 0.45;
  }
  return col;
}

void main() {
  musicSignals();
  vec2 p = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gWide = ss(0.8, 1.6, gAsp);
  gGX = gAsp - mix(0.06, 0.16, gWide);
  gTop = 0.84;
  gSill = mix(-0.55, -0.58, gWide);
  gCoC = 0.011;
  gSlide = uTravel * 0.8;
  gLampI = 1.0 + 0.35 * gMid;
  gNeonI = 0.8 + 0.6 * gMid;
  // each letter of the neon follows its own slice of the mids; the A has a tired tube
  gL0 = 0.7 + 1.1 * band(0.28);
  gL1 = (0.7 + 1.1 * band(0.36)) * mix(1.0, 0.15, step(0.82, noise(vec2(uTime * 0.7, 1.0))) * step(0.45, noise(vec2(uTime * 13.0, 4.0))));
  gL2 = 0.7 + 1.1 * band(0.44);
  gTube = mix(vec3(0.12, 0.72, 1.0), pal(0.55) * 1.2, 0.3) * (0.75 + 0.7 * band(0.52));
  gSign = vec2(0.0, 0.015);
  gLantern = vec2(-0.43, 0.2);
  gCat = vec3(-min(gAsp * 0.5, 0.95), gSill - 0.17, mix(0.48, 0.55, gWide));
  gTea = vec3(max(gAsp - 0.62, 0.27), gSill - 0.25, mix(0.27, 0.3, gWide));
  gLamp = vec2(max(gTea.x + 0.6, gAsp + 0.15), -0.2);

  // a taxi every nine seconds, one way then the other; the tram every forty
  float tp = uTime / 9.0, tf = fract(tp) * 9.0;
  float tdir = mod(floor(tp), 2.0) < 0.5 ? 1.0 : -1.0;
  gTaxi = vec3(tdir * mix(-1.0, 1.0, tf / 4.0) * (gAsp + 0.4), tdir, step(tf, 4.0));
  float mp = (uTime + 13.0) / 40.0, mf = fract(mp) * 40.0;
  float mdir = mod(floor(mp), 2.0) < 0.5 ? -1.0 : 1.0;
  gTram = vec3(mdir * mix(-1.0, 1.0, mf / 11.0) * (gAsp + 0.6), mdir, step(mf, 11.0));

  // the beat: a car's headlights sweep the window, one way then the other; every sixteenth beat,
  // lightning, a flash and a second stroke. Only the last beat is known: all of it is over in 0.45 s
  float age = uBeatAge;
  float strike = uAudioActive * step(mod(uBeatCount + 0.5, 16.0), 1.0) * step(age, 0.45);
  gFlash = strike * (exp(-age * 12.0) + 0.7 * step(0.12, age) * exp(-(age - 0.12) * 9.0)) * ss(0.45, 0.32, age) * uPunch;
  gBoltX = (hash11(uBeatCount * 3.7 + 1.0) - 0.5) * 0.8;
  gBoltS = hash11(uBeatCount * 1.3) * 50.0;
  gSweepD = mod(uBeatCount, 2.0) < 0.5 ? 1.0 : -1.0;
  gSweepX = gSweepD * mix(-1.0, 1.0, ss(0.0, 0.42, age)) * (gAsp + 0.3);
  gSweepA = uAudioActive * (1.0 - strike) * step(age, 0.42) * sin(PI * clamp(age / 0.42, 0.0, 1.0)) * mix(0.5, 1.0, uPunch);

  vec3 col;
  float sTop = gSill - RAIL;
  float dg = max(abs(p.x) - gGX, max(p.y - gTop, gSill - p.y));     // > 0 off the glass
  if (p.y < sTop - gPx) {
    col = sillCol(p);
  } else {
    if (dg < gPx) col = glassView(p);
    if (dg > -gPx) {
      vec3 fr = dg < FW ? frameCol(p, dg) : wallCol(p);
      if (abs(dg - FW) < gPx) fr = mix(frameCol(p, dg), wallCol(p), ss(FW - gPx, FW + gPx, dg));
      col = dg < gPx ? mix(col, fr, ss(-gPx, gPx, dg)) : fr;
    }
    if (p.y < sTop + gPx) col = mix(sillCol(p), col, ss(sTop - gPx, sTop + gPx, p.y));
    col = curtain(p, col);
  }
  vec4 cat = catLayer(p);
  col = mix(col, cat.rgb, cat.a);
  col = teaLayer(p, col);
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * 0.004;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'rain',
  name: 'Rain',
  group: 'Vibe',
  blurb: 'A rainy night in Istanbul through a wet window: neon ÇAY across the street, drops running down the glass, a cat on the sill and a glass of tea; bass thickens the rain',
  tags: ['city', 'weather', 'night', 'calm'],
  energy: 0.3,
  particles: 0,
  trails: 0,
  zoom: 1,
  spin: 0,
  ambience: 'rain',
  frag,
};
