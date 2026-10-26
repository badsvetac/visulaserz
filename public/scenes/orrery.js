// ORRERY — a brass clockwork orrery on a walnut desk in a dark study at night, under the warm cone of
// a green banker's lamp, with moonlight coming in through the tall window behind. A glowing amber
// glass sun sits in a four-claw setting on top of the central column; six planets made of stone
// and enamel ride on thin brass arms that leave the column at stepped heights: a hematite Mercury,
// a pearl Venus, a lapis Earth with its silver moon on a little arm of its own, a carnelian Mars, a
// banded-agate Jupiter with two moons on a turning bar, and a citrine Saturn in an engraved brass
// ring that keeps its tilt as it goes round. A wire ring threaded with glass beads is the asteroid
// belt, and a comet rides a long tilted wire ellipse over the whole machine, fast near the sun and
// slow far out, its tail always blown away from the sun. The base is a walnut drum with a brass top
// plate: an engraved zodiac ring round the rim, a polished band inside it, a guilloché boss in the
// middle, and four windows cut through the plate onto the going train underneath: brass wheels
// with crossed-out spokes and ruby jewels, meshing tooth to tooth, and at the front the escape wheel
// and its rocking anchor. Everything is analytic (spheres, rods, planes, one cylinder), traced in
// closed form, with soft shadows from the lamp, light from the sun globe, the window's moonlight
// laid across the desk with the shadows of its glazing bars, and the room reflected in the brass.
//
// Music: the bass is the sun: its core and the amber light it throws on the planets, the plate and
// the desk. Each planet follows its own slice of the spectrum, from Saturn on the low bass to
// Mercury in the highs: its sphere swells, its stone lights from inside and catches a brighter
// glint. The highs make the asteroid beads, the dust turning in the lamp's beam and the comet's
// tail glitter. Every beat is a tick of the escapement: the anchor rocks, the whole train jumps one
// tooth forward (with the little recoil a real escapement has), the arms shudder, and a chime of
// light runs round the polished band from the front of the plate to the back, all gone within the
// beat. With nothing playing the clock still ticks, once a second, and nothing moves with the analysis.
const frag = `
const float LENS = 2.0;
const vec3 SUNP = vec3(0.0, 0.70, 0.0);
const float SUNR = 0.15;
const float PLATE = 0.09;        // the top plate of the drum
const float GEARY = 0.066;       // the going train under the plate
const float FLOORY = 0.036;      // the pillar plate under the train
const float BASER = 0.95;        // the drum
const float BELTR = 0.79;
const float BELTY = 0.31;
const float WALLZ = -3.0;
const vec4 WINR = vec4(0.55, 0.32, 2.75, 2.85);           // the window on the wall: x0, y0, x1, y1
vec3 SHADE, LAMP, LAMPBASE;                                // the lamp's shade, its bulb just under the middle, its foot
const vec3 LAMPC = vec3(1.0, 0.70, 0.40);
const vec3 SUNC = vec3(1.0, 0.50, 0.15);
const vec3 MOONC = vec3(0.17, 0.23, 0.38);
const vec3 BRASS = vec3(0.95, 0.68, 0.32);
const float ORB[6] = float[6](0.30, 0.42, 0.55, 0.68, 0.90, 1.08);
const float ARMY[6] = float[6](0.50, 0.445, 0.39, 0.335, 0.28, 0.225);
const float PLY[6] = float[6](0.57, 0.55, 0.53, 0.50, 0.545, 0.52);
const float PLR[6] = float[6](0.040, 0.055, 0.060, 0.047, 0.098, 0.078);
const float BIN[6] = float[6](0.60, 0.42, 0.29, 0.19, 0.10, 0.045);
const vec3 TINT[6] = vec3[6](vec3(0.7, 0.78, 0.95), vec3(1.0, 0.86, 0.68), vec3(0.3, 0.48, 1.0), vec3(1.0, 0.32, 0.08), vec3(1.0, 0.66, 0.36), vec3(1.0, 0.66, 0.16));
// the going train: centre (x, z) on the plate and pitch radius; every wheel has the same tooth pitch
const vec3 GEAR[7] = vec3[7](
  vec3(0.0, 0.0, 0.235), vec3(0.174, 0.3036, 0.115), vec3(0.335, 0.413, 0.08),
  vec3(-0.3606, -0.135, 0.15), vec3(-0.566, -0.011, 0.09), vec3(0.1897, -0.3578, 0.17), vec3(0.419, -0.287, 0.07));
const float TEETH[7] = float[7](47.0, 23.0, 16.0, 30.0, 18.0, 34.0, 14.0);
const int PARENT[7] = int[7](0, 0, 1, 0, 3, 0, 5);
const vec2 ESC = vec2(-0.143, 0.395);      // the escape wheel
const vec2 PIVOT = vec2(-0.198, 0.545);    // the anchor's arbor

#define NSPH 12
#define NSEG 25
float gPxA, gHigh, gSunI, gChime, gAge, gTick, gAnchor, gFrontAng;
float gB[NSPH];
vec3 gSc[NSPH]; float gSr[NSPH];
vec3 gSa[NSEG], gSb[NSEG]; float gSw[NSEG];
float gRot[7];
vec3 gSpot, gU, gV, gW, gCom, gTailDir, gBead, gWin, gWx, gWy, gMoon, gShA, gShU;
float gTailLen, gBeadR, gBeadId, gTB;
// the two nearest small parts in front of the background: depth, coverage, which
float gT1, gA1, gT2, gA2;
int gI1, gI2;
// and their geometry, copied when they are offered: an array indexed by a number known only per
// pixel would push every array into slow memory and double the cost of the whole picture

float cover(float d, float r, float pw) {
  return clamp((min(d + 0.5 * pw, r) - max(d - 0.5 * pw, -r)) / pw, 0.0, 1.0);
}
// the nearest approach of a ray to the segment a-b: (t on the ray, distance, s along the segment)
vec3 raySeg(vec3 ro, vec3 rd, vec3 a, vec3 b) {
  vec3 ba = b - a, w = ro - a;
  float baba = dot(ba, ba), bard = dot(ba, rd), baw = dot(ba, w), rdw = dot(rd, w);
  float s = clamp((baw - bard * rdw) / max(baba - bard * bard, 1e-7), 0.0, 1.0);
  float t = bard * s - rdw;
  return vec3(t, length(w + rd * t - ba * s), s);
}
void offer(float t, float a, int id) {
  if (a <= 0.002 || t <= 0.0 || t >= gTB) return;
  if (t < gT1) { gT2 = gT1; gA2 = gA1; gI2 = gI1; gT1 = t; gA1 = a; gI1 = id; }
  else if (t < gT2) { gT2 = t; gA2 = a; gI2 = id; }
}
// an offered part's geometry, picked out by comparing: no array is indexed by a per-pixel number
void geomOf(int id, out vec4 ga, out vec4 gb) {
  ga = vec4(0.0); gb = vec4(0.0);
#define PICKS(i) if (id == i) { ga = vec4(gSc[i], gSr[i]); gb.w = gB[i]; }
#define PICKG(i) if (id == 20 + i) { ga = vec4(gSa[i], gSw[i]); gb.xyz = gSb[i]; }
  PICKS(0) PICKS(1) PICKS(2) PICKS(3) PICKS(4) PICKS(5) PICKS(6) PICKS(7) PICKS(8) PICKS(9) PICKS(10) PICKS(11)
  PICKG(0) PICKG(1) PICKG(2) PICKG(3) PICKG(4) PICKG(5) PICKG(6) PICKG(7) PICKG(8) PICKG(9) PICKG(10) PICKG(11) PICKG(12)
  PICKG(13) PICKG(14) PICKG(15) PICKG(16) PICKG(17) PICKG(18) PICKG(19) PICKG(20) PICKG(21) PICKG(22) PICKG(23) PICKG(24)
  if (id == 19) { ga = vec4(gBead, gBeadR); gb.w = gBeadId; }
  if (id == 53) ga = vec4(gSc[5], gSr[5]);
  if (id == 45) { ga = vec4(LAMPBASE + vec3(0.0, 0.04, 0.0), 0.03); gb.xyz = LAMPBASE + vec3(0.0, SHADE.y + 0.06, 0.0); }
  if (id == 46) { ga = vec4(LAMPBASE + vec3(0.0, SHADE.y + 0.06, 0.0), 0.022); gb.xyz = SHADE + gShU * 0.15; }
  if (id == 12) ga = vec4(LAMPBASE - vec3(0.0, 0.42, 0.0), 0.475);
}
float ggx(vec3 n, vec3 h, float rough) {
  float a = max(rough * rough, 0.002), a2 = a * a;
  float nh = max(dot(n, h), 0.0);
  float d = nh * nh * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}
float sdTrap(vec2 p, float r1, float r2, float he) {
  vec2 k1 = vec2(r2, he), k2 = vec2(r2 - r1, 2.0 * he);
  p.x = abs(p.x);
  vec2 ca = vec2(p.x - min(p.x, (p.y < 0.0) ? r1 : r2), abs(p.y) - he);
  vec2 cb = p - k1 + k2 * clamp(dot(k1 - p, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}
float seg2(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }

// ── the room, as the brass sees it ─────────────────────────────────────────────────────────────
vec3 env(vec3 p, vec3 r, float rough) {
  vec3 c = mix(vec3(0.012, 0.009, 0.007), vec3(0.045, 0.031, 0.021), ss(-0.25, 0.55, r.y));
  // the warm side of the room, where the lamp throws its light on the panelling
  vec3 tl = LAMP - p;
  float cl = dot(r, normalize(tl));
  c += vec3(0.13, 0.075, 0.035) * pow(max(cl, 0.0), 3.0);
  // the shade's glowing mouth
  c += LAMPC * exp((cl - 1.0) * mix(300.0, 22.0, rough)) * mix(2.5, 0.35, rough);
  // the tall window behind, moonlit, with its glazing bars
  float wd = dot(r, gWin);
  if (wd > 0.3) {
    vec2 q = vec2(dot(r, gWx), dot(r, gWy)) / wd;
    float soft = 0.02 + rough * 0.2;
    float pane = ss(0.21 + soft, 0.21 - soft, abs(q.x)) * ss(0.24 + soft, 0.24 - soft, abs(q.y + 0.02));
    pane *= mix(ss(0.004, 0.014, abs(q.x)) * ss(0.004, 0.014, abs(abs(q.y) - 0.08)), 1.0, ss(0.05, 0.3, rough));
    c += vec3(0.24, 0.33, 0.55) * pane * mix(0.9, 0.3, rough);
  }
  // the glowing sun globe
  vec3 ts = SUNP - p;
  float ds = max(length(ts), SUNR * 1.01);
  float sr = SUNR / ds;
  float th2 = 2.0 * (1.0 - dot(r, ts / ds));
  float sw = sr * sr * 0.9 + rough * rough * 0.25;
  c += SUNC * gSunI * (exp(-th2 / sw) * 1.5 + exp(-th2 / (sw * 12.0)) * 0.1);
  // below: the lamplit desk
  c = mix(c, vec3(0.05, 0.028, 0.015), ss(0.02, -0.2, r.y));
  return c;
}

// ── light and shadow ──────────────────────────────────────────────────────────────────────────
float lampPower(vec3 p, vec3 l, float dl) {
  return 4.2 * ss(0.80, 0.95, dot(-l, gSpot)) / (1.0 + 0.06 * dl * dl);
}
vec3 lampShadow(vec3 p, vec3 l, float dl, int self) {
  vec3 bc = vec3(0.0, 0.45, 0.0) - p;                  // nothing to do if the ray misses the machine
  float bt = max(dot(bc, l), 0.0);
  if (length(bc - l * bt) > 1.42) return vec3(1.0);
  vec3 sh = vec3(1.0);
  for (int i = 0; i < NSPH - 1; i++) {
    if (i == self) continue;
    vec3 oc = gSc[i] - p;
    float tc = dot(oc, l);
    if (tc <= 0.0) continue;
    float d = length(oc - l * tc), pen = 0.004 + tc * 0.04, r = gSr[i];
    float o = ss(r - pen, r + pen, d);
    sh *= i == 9 ? mix(vec3(0.6, 0.36, 0.13), vec3(1.0), o) : vec3(o);   // the glass sun lets amber through
  }
  for (int i = 0; i < 13; i++) {                       // the arms, the posts and the column
    if (i + 20 == self) continue;
    vec3 h = raySeg(p, l, gSa[i], gSb[i]);
    if (h.x <= 0.0) continue;
    float pen = 0.002 + h.x * 0.04;
    sh *= ss(gSw[i] - pen, gSw[i] + pen, h.y) * 0.8 + 0.2;
  }
  return sh;
}
// how much moonlight reaches p through the window: the pane's outline and its glazing bars
float moonlit(vec3 p) {
  float t = (WALLZ - p.z) / gMoon.z;
  vec2 q = (p + gMoon * t).xy;
  float s = 0.004 + t * 0.014;
  float w = ss(WINR.x - s, WINR.x + s, q.x) * ss(WINR.z + s, WINR.z - s, q.x) * ss(WINR.y - s, WINR.y + s, q.y) * ss(WINR.w + s, WINR.w - s, q.y);
  float bar = 0.028;
  w *= ss(bar - s, bar + s, abs(q.x - (WINR.x + WINR.z) * 0.5));
  float h3 = (WINR.w - WINR.y) / 3.0;
  w *= ss(bar - s, bar + s, abs(q.y - WINR.y - h3)) * ss(bar - s, bar + s, abs(q.y - WINR.y - 2.0 * h3));
  return w;
}
vec3 surf(vec3 p, vec3 n, vec3 v, vec3 alb, float metal, float rough, int self, float shadowed) {
  vec3 F0 = mix(vec3(0.04), alb, metal);
  float nv = max(dot(n, v), 1e-3);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - nv, 5.0);
  vec3 dif = alb * (1.0 - metal);
  vec3 col = vec3(0.0);
  vec3 l = LAMP - p;
  float dl = length(l);
  l /= dl;
  float nl = dot(n, l);
  if (nl > 0.0) {
    vec3 E = LAMPC * lampPower(p, l, dl) * nl;
    if (shadowed > 0.5) E *= lampShadow(p + n * 0.002, l, dl, self);
    col += E * (dif + F * min(ggx(n, normalize(l + v), rough) * 0.25 / nv, 30.0));
  }
  float nm = dot(n, gMoon);
  if (nm > 0.0) {
    vec3 E = MOONC * moonlit(p) * nm;
    col += E * (dif + F * min(ggx(n, normalize(gMoon + v), rough) * 0.25 / nv, 30.0));
  }
  vec3 s = SUNP - p;
  float ds = length(s);
  s /= ds;
  float ns = max(dot(n, s) + 0.15, 0.0) / 1.15;
  col += dif * SUNC * gSunI * 0.16 / (ds * ds + 0.03) * ns;
  col += dif * (vec3(0.02, 0.016, 0.014) + vec3(0.025, 0.035, 0.06) * max(dot(n, gWin), 0.0));
  col += env(p, reflect(-v, n), rough) * F;
  return col;
}

// ── the going train ───────────────────────────────────────────────────────────────────────────
// signed distance to a wheel: pitch radius R, N teeth, turned by turn; lean slants the teeth (the
// escape wheel) and spokes > 0 cuts the crossings out between the rim and the hub
float wheel(vec2 q, vec2 c, float R, float N, float turn, float lean, float spokes) {
  vec2 d = q - c;
  float r = length(d);
  if (r > R + 0.03) return r - R - 0.01;
  float th = atan(d.y, d.x) - turn;
  float ta = th * N / TAU;
  float al = (ta - floor(ta + 0.5)) * TAU / N;
  vec2 tp = vec2(r * sin(al), r * cos(al) - R);
  tp.x += lean * (tp.y + 0.009);
  float tooth = sdTrap(tp, 0.0088, lean > 0.0 ? 0.0012 : 0.0042, 0.0088) - 0.001;
  float dd = min(tooth, r - (R - 0.0088));
  if (spokes > 0.0) {
    float sa = mod(th + PI / spokes, TAU / spokes) - PI / spokes;
    float rim = R - 0.0088 - 0.02;
    float win = max(max(r - rim, 0.042 - r), 0.0075 - r * abs(sin(sa)));
    dd = max(dd, -win);
  }
  return dd;
}
// the anchor: an arbor, two arms reaching down to the escape wheel with ruby pallets, and the fork
float anchorD(vec2 q, out float ruby) {
  vec2 dir = normalize(ESC - PIVOT);
  vec2 side = vec2(-dir.y, dir.x);
  vec2 l = q - PIVOT;
  l = vec2(dot(l, side), dot(l, dir));
  l = rot(gAnchor) * l;
  float d = length(l) - 0.024;
  vec2 pa = vec2(0.075, 0.088), pb = vec2(-0.075, 0.088);
  d = min(d, seg2(l, vec2(0.0), pa) - 0.0085);
  d = min(d, seg2(l, vec2(0.0), pb) - 0.0085);
  d = min(d, seg2(l, vec2(0.0), vec2(0.0, -0.11)) - 0.006);
  d = min(d, max(abs(length(l - vec2(0.0, -0.125)) - 0.016) - 0.005, l.y + 0.12));
  vec2 ra = l - pa - vec2(0.0, 0.012), rb = l - pb - vec2(0.0, 0.012);
  ruby = min(max(abs(ra.x) - 0.007, abs(ra.y) - 0.012), max(abs(rb.x) - 0.007, abs(rb.y) - 0.012));
  return min(d, ruby);
}
// the train at q on its plane: distance, which part (0 wheels, 1 anchor, 2 ruby), and the wheel's centre
float train(vec2 q, out float part, out vec2 centre) {
  float d = 1e3;
  part = 0.0;
  centre = vec2(0.0);
  for (int i = 0; i < 7; i++) {
    vec3 g = GEAR[i];
    float w = wheel(q, g.xy, g.z, TEETH[i], gRot[i], 0.0, g.z > 0.1 ? (i == 0 ? 6.0 : 5.0) : 0.0);
    if (w < d) { d = w; centre = g.xy; }
  }
  float e = wheel(q, ESC, 0.095, 15.0, -TAU * gTick / 15.0, 0.85, 4.0);
  if (e < d) { d = e; centre = ESC; }
  float ruby;
  float a = anchorD(q, ruby);
  if (a < 0.0) { part = ruby < 0.0 ? 2.0 : 1.0; centre = PIVOT; return a; }
  return d;
}
// the windows cut through the top plate: negative inside
float aperture(vec2 q) {
  float r = length(q);
  float a = atan(q.y, q.x);
  float sa = mod(a, PI * 0.5) - PI * 0.25;
  return max(max(r - 0.70, 0.17 - r), 0.026 - r * abs(sin(sa)));
}

vec3 brassAt(vec3 p, vec3 n, vec3 v, float rough, float shadowed) {
  return surf(p, n, v, BRASS, 0.82, rough, -1, shadowed);
}

// looking down through a window in the plate: the train, its jewels and the pillar plate below
vec3 underPlate(vec3 ro, vec3 rd, float fw) {
  vec3 v = -rd;
  vec3 g = ro + rd * ((GEARY - ro.y) / rd.y);
  float ag = aperture(g.xz);
  if (ag > 0.0) {                                       // the cut wall of the plate, facing into the window
    vec2 gn = vec2(aperture(g.xz + vec2(0.002, 0.0)) - ag, aperture(g.xz + vec2(0.0, 0.002)) - ag);
    return brassAt(g, normalize(vec3(-gn.x, 0.0, -gn.y) + vec3(0.0, 1e-4, 0.0)), v, 0.55, 0.0) * 0.3;
  }
  float part;
  vec2 cen;
  float d = train(g.xz, part, cen);
  vec3 fl = ro + rd * ((FLOORY - ro.y) / rd.y);
  // the pillar plate: perlage, and the shadows of the wheels and of the plate above
  vec3 l = normalize(LAMP - fl);
  vec2 sp = fl.xz + l.xz * (GEARY - FLOORY) / l.y;
  float pd, sd;
  vec2 pc;
  sd = train(sp, pd, pc);
  float shade = ss(-0.006, 0.01, sd) * ss(0.012, -0.012, aperture(fl.xz + l.xz * (PLATE - FLOORY) / l.y));
  vec2 pg = fl.xz * 34.0;
  float perl = 0.0;
  for (int k = 0; k < 2; k++) {
    vec2 o = vec2(float(k) * 0.5);
    vec2 f = fract(pg + o) - 0.5;
    perl = max(perl, ss(0.5, 0.0, length(f)) * (0.6 + 0.4 * sin(atan(f.y, f.x) * 3.0 + hash21(floor(pg + o)) * 6.0)));
  }
  perl = mix(perl, 0.4, ss(0.006, 0.02, fw));
  vec3 base = surf(fl, vec3(0.0, 1.0, 0.0), v, vec3(0.62, 0.55, 0.45), 0.7, 0.45, -1, 0.0) * (0.2 + 0.8 * shade) * (0.75 + 0.35 * perl);
  base *= 0.5;
  float a = ss(fw, -fw, d);
  if (a <= 0.0) return base;
  vec3 col;
  if (part > 1.5) {
    col = surf(g, vec3(0.0, 1.0, 0.0), v, vec3(0.55, 0.02, 0.05), 0.0, 0.08, -1, 0.0) + vec3(0.3, 0.0, 0.02);
  } else {
    // flat brass with a sunray finish (the highlight is a streak through the arbor towards the lamp)
    vec2 q = g.xz - cen;
    vec2 lq = normalize(LAMP.xz - g.xz);
    float ray = pow(abs(dot(normalize(q + 1e-5), lq)), 40.0);
    col = brassAt(g, vec3(0.0, 1.0, 0.0), v, 0.38, 0.0);
    col *= 0.85 + 0.25 * ray;
    float chamfer = ss(-0.005, -0.001, d);
    col += LAMPC * chamfer * 0.3;
    // a ruby jewel in its gold chaton at every arbor but the centre wheel's
    float jr = length(q);
    if (jr < 0.02 && (length(cen) > 0.01 || part > 0.5)) {
      col = mix(col, brassAt(g, normalize(vec3(q.x, 0.04, q.y)), v, 0.15, 0.0) * 1.3, ss(0.019 + fw, 0.019 - fw, jr));
      vec3 ruby = vec3(0.45, 0.01, 0.03) + vec3(1.2, 0.3, 0.3) * ss(0.004, 0.0, length(q - vec2(-0.003, -0.003)));
      col = mix(col, ruby, ss(0.0105 + fw, 0.0105 - fw, jr));
    }
  }
  return mix(base, col, a);
}

// the top plate: zodiac ring, polished band (where the chime runs), windows, guilloché boss
vec3 plateTop(vec3 ro, vec3 rd, vec3 p, float fw) {
  vec3 v = -rd;
  float r = length(p.xz);
  float a = atan(p.z, p.x);
  vec3 n = vec3(0.0, 1.0, 0.0);
  // the bevelled rim
  float bev = ss(0.925, 0.95, r);
  n = normalize(n + vec3(p.x, 0.0, p.z) / max(r, 1e-3) * bev * 0.9);
  vec3 col = brassAt(p, n, v, 0.34, 1.0);
  float ink = 0.0;
  // the zodiac ring: circles, a tick every two degrees, a longer one every ten, twelve signs
  float ringIn = 0.805, ringOut = 0.915;
  ink = max(ink, ss(0.0021 + fw, 0.0021, abs(r - ringIn)));
  ink = max(ink, ss(0.0016 + fw, 0.0016, abs(r - 0.835)));
  ink = max(ink, ss(0.0016 + fw, 0.0016, abs(r - ringOut + 0.012)));
  ink = max(ink, ss(0.0021 + fw, 0.0021, abs(r - ringOut)));
  if (r > ringIn && r < ringOut) {
    float deg = a / TAU * 360.0;
    float t2 = abs(fract(deg / 2.0 + 0.5) - 0.5) * 2.0 * r * TAU / 180.0;
    float t10 = abs(fract(deg / 10.0 + 0.5) - 0.5) * 10.0 * r * TAU / 360.0;
    float t30 = abs(fract(deg / 30.0 + 0.5) - 0.5) * 30.0 * r * TAU / 360.0;
    ink = max(ink, ss(0.0012 + fw, 0.0012, t2) * step(r, 0.822));
    ink = max(ink, ss(0.0014 + fw, 0.0014, t10) * step(r, 0.835));
    ink = max(ink, ss(0.0018 + fw, 0.0018, t30) * step(0.835, r) * step(r, ringOut - 0.012));
    if (r > 0.835 && r < ringOut - 0.012) {
      // the sign in each sector: a few engraved strokes, its own for every sign
      float si = floor(deg / 30.0);
      float u = (fract(deg / 30.0) - 0.5) * (r * TAU / 12.0);
      vec2 gq = vec2(u, r - 0.8695);
      float gd = 1e3;
      for (int k = 0; k < 3; k++) {
        float fk = float(k);
        vec2 s0 = (vec2(hash21(vec2(si, fk)), hash21(vec2(fk, si + 3.0))) - 0.5) * vec2(0.05, 0.03);
        vec2 s1 = (vec2(hash21(vec2(si + 7.0, fk)), hash21(vec2(fk + 5.0, si))) - 0.5) * vec2(0.05, 0.03);
        gd = min(gd, seg2(gq, s0, s1));
      }
      gd = min(gd, abs(length(gq - (vec2(hash21(vec2(si, 9.0)), hash21(vec2(9.0, si))) - 0.5) * vec2(0.03, 0.012)) - 0.0065));
      ink = max(ink, ss(0.0016 + fw, 0.0016, gd));
    }
  }
  // the polished band, and the chime of light running round it on the beat
  float band = ss(0.738, 0.742, r) * ss(0.80, 0.796, r);
  if (band > 0.0 && gChime > 0.0) {
    float run = gAge * 7.0;
    float b1 = mod(gFrontAng + run - a + TAU, TAU), b2 = mod(a - gFrontAng + run + TAU, TAU);   // how far behind each spark
    float d1 = min(b1, TAU - b1), d2 = min(b2, TAU - b2);
    float sp = exp(-d1 * d1 * 260.0) + exp(-d2 * d2 * 260.0);
    float tail = exp(-b1 * 6.0) * step(b1, run) + exp(-b2 * 6.0) * step(b2, run);
    col += vec3(1.0, 0.78, 0.45) * band * gChime * (sp * 2.4 + tail * 0.35 + 0.15 * exp(-gAge * 14.0));
  }
  // the guilloché boss in the middle: a rose of fine engraved waves
  if (r < 0.17) {
    float gw = sin(r * 420.0 + sin(a * 12.0) * 2.2);
    float gl = mix(gw, 0.0, ss(0.0015, 0.004, fw));
    col *= 0.88 + 0.12 * gl;
    ink = max(ink, ss(0.0018 + fw, 0.0018, abs(r - 0.165)));
  }
  col = mix(col, vec3(0.018, 0.012, 0.008), ink * 0.85);
  // the windows onto the train
  float ap = aperture(p.xz);
  if (ap < fw) {
    vec3 under = underPlate(ro, rd, fw);
    col = mix(col, under, ss(fw, -fw, ap));
    col += LAMPC * 0.07 * ss(fw * 1.5, 0.0, abs(ap)) * ss(0.2, 1.0, dot(normalize(p.xz), normalize(LAMP.xz - p.xz)) + 0.4);
  }
  return col;
}

// the drum's side: a brass foot, the walnut, and a brass band under the plate with an engraved line
vec3 drumSide(vec3 p, vec3 v) {
  vec3 n = vec3(p.x, 0.0, p.z) / BASER;
  float a = atan(p.z, p.x);
  if (p.y > 0.062 || p.y < 0.012) {
    vec3 c = brassAt(p, n, v, 0.3, 1.0);
    c *= 1.0 - 0.7 * ss(0.002, 0.0, abs(p.y - 0.076));
    c *= 1.0 - 0.5 * ss(0.003, 0.0, abs(p.y - 0.062)) - 0.5 * ss(0.003, 0.0, abs(p.y - 0.012));
    return c;
  }
  float grain = noise(vec2(a * 6.0, p.y * 60.0));
  float lines = 0.5 + 0.5 * sin(a * 180.0 + grain * 9.0);
  vec3 alb = mix(vec3(0.07, 0.035, 0.018), vec3(0.17, 0.09, 0.045), grain * 0.7 + lines * 0.3);
  return surf(p, n, v, alb, 0.0, 0.22, -1, 1.0);
}

// the desk: walnut, varnished, the lamp's pool and the window's moonlight on it, and the shadows
vec3 desk(vec3 p, vec3 rd, float fw) {
  vec3 v = -rd;
  vec2 w = p.xz;
  vec2 gq = vec2(w.x * 0.7, w.y * 5.0);
  float g = noise(gq) * 0.55 + noise(gq * 2.3 + 7.1) * 0.3 + noise(gq * 5.1 + 3.3) * 0.15;
  float fine = 0.5 + 0.5 * sin((w.y + g * 0.35) * 70.0 + noise(w * vec2(1.0, 12.0)) * 3.0);
  fine = mix(fine, 0.5, ss(0.003, 0.02, fw));
  vec3 alb = mix(vec3(0.05, 0.026, 0.013), vec3(0.16, 0.085, 0.042), g * 0.75 + fine * 0.25);
  alb *= 0.85 + 0.3 * noise(w * vec2(0.6, 3.0));
  float rr = length(w);
  vec3 col = surf(p, vec3(0.0, 1.0, 0.0), v, alb, 0.0, 0.42, -1, 1.0);
  // the drum shades the desk from the sun globe close round its foot
  float hs = SUNP.y * (1.0 - BASER / max(rr, BASER));
  col -= alb * SUNC * gSunI * 0.16 / (dot(p - SUNP, p - SUNP) + 0.03) * ss(PLATE + 0.03, PLATE - 0.02, hs) * step(BASER, rr);
  // and from the moon
  vec2 mq = w + gMoon.xz * (0.045 / gMoon.y);
  col -= alb * MOONC * moonlit(p) * gMoon.y * ss(BASER + 0.02, BASER - 0.02, length(mq));
  col *= mix(0.35, 1.0, ss(BASER, BASER + 0.2, rr));                    // the drum's contact shadow
  col *= mix(0.4, 1.0, ss(WALLZ, WALLZ + 0.25, p.z));                    // and the wall's
  return max(col, 0.0);
}

// out through the window: a valley at night under the stars, a village's lights far down in it
vec3 night(vec3 rd) {
  float el = rd.y;
  float az = atan(rd.x, -rd.z);
  vec3 c = mix(vec3(0.045, 0.07, 0.15), vec3(0.01, 0.018, 0.05), ss(-0.12, 0.45, el));
  float px = gPxA;
  for (int layer = 0; layer < 2; layer++) {
    float sc = layer == 0 ? 90.0 : 190.0;
    vec2 g = vec2(az, el) * sc + float(layer) * 17.3;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + 31.0);
    if (h > 0.07) continue;
    vec2 off = vec2(hash21(cell + 2.3), hash21(cell + 5.9)) - 0.5;
    float d = length(f - off * 0.7) / sc;
    float mag = 0.25 + 1.4 * pow(hash21(cell + 8.1), 6.0);
    float tw = 0.8 + 0.2 * sin(uTime * (1.0 + 3.0 * h) + h * 50.0) + gHigh * 1.2 * (0.5 + 0.5 * sin(uTime * 13.0 + h * 90.0));
    c += vec3(0.9, 0.93, 1.0) * mag * tw * exp(-d * d / (px * px * 0.8));
  }
  float hill = -0.17 + 0.03 * noise(vec2(az * 5.0, 1.0)) + 0.012 * noise(vec2(az * 19.0, 2.0));
  c += vec3(0.08, 0.1, 0.16) * exp(-max(el - hill, 0.0) * 18.0);              // mist along the far ridge
  if (el < hill) {
    c = mix(vec3(0.012, 0.016, 0.03), vec3(0.004, 0.005, 0.01), ss(hill, hill - 0.08, el));
    vec2 g = vec2(az * 160.0, (el - hill) * 160.0);
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + 77.0);
    if (h < 0.05 + 0.1 * ss(hill - 0.05, hill - 0.01, el) && el > hill - 0.07) {
      float d = length(f - (vec2(hash21(cell + 1.7), hash21(cell + 4.2)) - 0.5) * 0.6) / 160.0;
      c += vec3(1.0, 0.62, 0.3) * (0.3 + 0.7 * hash21(cell + 9.0)) * exp(-d * d / (px * px * 0.7));
    }
  }
  return c;
}

// the wall behind the desk: dark panelling, warm near the lamp, and the window
vec3 wall(vec3 p, vec3 rd, float fw) {
  float x = p.x, y = p.y;
  vec2 wq = vec2(x, y);
  float inX = ss(WINR.x - fw, WINR.x + fw, x) * ss(WINR.z + fw, WINR.z - fw, x);
  float inY = ss(WINR.y - fw, WINR.y + fw, y) * ss(WINR.w + fw, WINR.w - fw, y);
  // the panelling: boards with dark grooves and a rail
  float bx = fract(x / 0.24);
  float groove = ss(fw + 0.004, 0.004, min(bx, 1.0 - bx) * 0.24) * step(y, 2.4);
  vec3 alb = mix(vec3(0.05, 0.026, 0.014), vec3(0.11, 0.06, 0.03), noise(vec2(x * 4.0, y * 0.6)) * 0.6 + noise(vec2(floor(x / 0.24) * 3.0, y * 9.0)) * 0.4);
  alb *= 1.0 - 0.7 * groove;
  float rail = ss(0.03 + fw, 0.03, abs(y - 0.95));
  alb = mix(alb, vec3(0.13, 0.07, 0.035), rail);
  vec3 tl = LAMP - p;
  float dl = length(tl);
  vec3 col = alb * LAMPC * (1.1 / (1.0 + dl * dl * 1.1) + 0.12 * exp(-y * 1.4));
  col += alb * 0.02;
  // the window: a deep frame, the glazing bars and the night outside, lit a little at the reveal
  float frame = 0.07;
  vec2 inner = vec2(min(x - WINR.x, WINR.z - x), min(y - WINR.y, WINR.w - y));
  float glass = inX * inY;
  if (glass > 0.0) {
    float h3 = (WINR.w - WINR.y) / 3.0;
    float bars = min(abs(x - (WINR.x + WINR.z) * 0.5), min(abs(y - WINR.y - h3), abs(y - WINR.y - 2.0 * h3)));
    float fr = min(inner.x, inner.y);
    float wood = max(ss(0.022 + fw, 0.022, bars), ss(frame + fw, frame, fr));
    vec3 outside = night(rd);
    outside += LAMPC * 0.04 * exp(-length(wq - vec2(WINR.x + 0.3, 1.0)) * 2.0);        // the lamp, faint in the glass
    vec3 wd = vec3(0.03, 0.02, 0.014) + vec3(0.12, 0.15, 0.22) * ss(0.0, 0.04, -(fr - frame)) * 0.0;
    wd = mix(vec3(0.035, 0.022, 0.014), vec3(0.09, 0.11, 0.16), 0.25);
    col = mix(col, mix(outside, wd, wood), glass);
  }
  return col;
}

// the lamp: a dome base, a brass stem and arm, and the green glass shade with its glowing mouth
// (t, coverage, 1 for the inside) of the shade, a half cylinder lying across the line to the orrery
vec3 shadeHit(vec3 ro, vec3 rd) {
  const float R = 0.2, L = 0.37;
  vec3 oc = ro - SHADE;
  vec3 rp = rd - gShA * dot(rd, gShA), op = oc - gShA * dot(oc, gShA);
  float a = dot(rp, rp), b = dot(op, rp), c = dot(op, op) - R * R;
  float h = b * b - a * c;
  float dAx = sqrt(max(c + R * R - b * b / a, 0.0));
  float pw = max(-b / a, 0.1) * gPxA;
  float cv = cover(dAx, R, pw);
  if (cv <= 0.0) return vec3(-1.0, 0.0, 0.0);
  float sq = sqrt(max(h, 0.0));
  for (int k = 0; k < 2; k++) {
    float t = (-b + (k == 0 ? -sq : sq)) / a;
    vec3 q = ro + rd * t - SHADE;
    float ax = abs(dot(q, gShA));
    if (t > 0.0 && ax < L + pw && dot(q, gShU) > -0.2 * R) return vec3(t, cv * clamp((L - ax) / (t * gPxA) + 0.5, 0.0, 1.0), float(k));
  }
  return vec3(-1.0, 0.0, 0.0);
}
vec3 lampShade(vec3 ro, vec3 rd, vec3 hit) {
  vec3 p = ro + rd * hit.x;
  vec3 q = p - SHADE;
  vec3 n = normalize(q - gShA * dot(q, gShA));
  float lip = ss(-0.12, -0.2, dot(q, gShU) / 0.2);                    // the rim of the mouth
  if (hit.z > 0.5) return vec3(1.5, 1.05, 0.62) * (0.7 + 0.3 * dot(-n, gShU)) + vec3(0.5, 0.33, 0.16) * lip;
  vec3 v = -rd;
  float nv = max(dot(n, v), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
  vec3 col = vec3(0.01, 0.07, 0.035) + vec3(0.02, 0.16, 0.07) * pow(max(dot(n, -gShU), 0.0) + 0.3, 2.0) * 0.5;
  col += env(p, reflect(rd, n), 0.05) * fres * 1.2;
  col += vec3(0.25, 0.5, 0.3) * pow(max(dot(reflect(rd, n), gWin), 0.0), 60.0) * 0.6;
  // a brass band along the mouth, lit from below
  float band = ss(-0.08, -0.12, dot(q, gShU) / 0.2);
  col = mix(col, BRASS * 0.35 + LAMPC * 0.4 * lip, band);
  return col;
}

// the glass sun: amber glass, a swirling glow inside and a white-hot core that swells with the bass
vec3 sunGlobe(vec3 ro, vec3 rd, vec3 p, vec3 n) {
  vec3 oc = ro - SUNP;
  float b = dot(oc, rd);
  float d2 = max(dot(oc, oc) - b * b, 0.0);
  float q = clamp(1.0 - d2 / (SUNR * SUNR), 0.0, 1.0);
  float chord = sqrt(q);
  vec3 c0 = ro - rd * b - SUNP;                          // where the ray passes the centre
  float sw = fbm(c0.xy * 14.0 + vec2(uTime * 0.07, c0.z * 9.0 - uTime * 0.05));
  float core = exp(-d2 / (SUNR * SUNR * (0.05 + 0.05 * (gSunI - 0.6))));
  vec3 glow = mix(vec3(0.55, 0.12, 0.02), vec3(1.0, 0.45, 0.10), chord) * chord * (0.55 + 0.6 * sw);
  glow += vec3(1.0, 0.75, 0.42) * core * 2.2;
  glow *= gSunI * 0.85;
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
  vec3 l = normalize(LAMP - p);
  vec3 spec = LAMPC * pow(max(dot(reflect(rd, n), l), 0.0), 600.0) * 5.0;
  return glow + (env(p, reflect(rd, n), 0.02) + spec) * fres + vec3(0.6, 0.25, 0.05) * pow(1.0 - chord, 3.0) * 0.4 * gSunI;
}

vec3 planet(int k, vec3 p, vec3 n, vec3 v, float b) {
  vec3 alb; float metal = 0.0, rough = 0.12;
  vec3 glow = vec3(0.0);
  if (k == 0) {                       // hematite
    alb = vec3(0.45, 0.45, 0.5); metal = 1.0; rough = 0.14;
  } else if (k == 1) {                // pearl
    alb = vec3(0.86, 0.78, 0.66);
    float fr = pow(1.0 - max(dot(n, v), 0.0), 2.0);
    alb = mix(alb, vec3(0.72, 0.8, 0.95), fr * 0.7);
    rough = 0.25;
  } else if (k == 2) {                // lapis lazuli with flecks of pyrite
    float vein = fbm(n.xz * 3.0 + n.y * 2.0 + 4.0);
    alb = mix(vec3(0.03, 0.06, 0.32), vec3(0.08, 0.16, 0.55), vein);
    alb = mix(alb, vec3(0.55, 0.58, 0.62), ss(0.62, 0.72, fbm(n.xy * 5.0 + 9.0)) * 0.5);
    vec3 fn = n * 26.0;
    float fl = step(0.93, hash21(floor(fn.xy) + floor(fn.z) * 7.1));
    alb = mix(alb, vec3(0.9, 0.7, 0.3), fl);
    metal = fl;
    rough = mix(0.1, 0.2, fl);
  } else if (k == 3) {                // carnelian
    alb = mix(vec3(0.55, 0.09, 0.03), vec3(0.85, 0.3, 0.08), fbm(n.xy * 4.0 + n.z));
    glow = vec3(0.8, 0.18, 0.03) * pow(max(dot(n, v), 0.0), 1.5) * 0.25;
  } else if (k == 4) {                // banded agate
    vec3 m = n;
    m.xz = rot(uTime * 0.25) * m.xz;
    float lat = m.y + 0.06 * sin(m.x * 6.0 + m.z * 3.0);
    float bnd = sin(lat * 22.0 + fbm(m.xz * 3.0) * 2.5);
    alb = mix(vec3(0.82, 0.66, 0.46), vec3(0.55, 0.25, 0.11), ss(-0.3, 0.6, bnd));
    alb = mix(alb, vec3(0.28, 0.12, 0.06), ss(0.75, 0.95, bnd) * 0.7);
    vec2 spot = vec2(atan(m.z, m.x) - 0.7, m.y + 0.35);
    alb = mix(alb, vec3(0.7, 0.2, 0.08), ss(0.12, 0.06, length(spot * vec2(0.6, 1.6))));
    rough = 0.2;
  } else if (k == 5) {                // citrine
    alb = vec3(0.95, 0.58, 0.12);
    glow = vec3(1.0, 0.55, 0.1) * pow(max(dot(n, v), 0.0), 2.0) * 0.18;
  } else if (k == 6) {                // the moon: silver
    alb = vec3(0.78, 0.78, 0.8); metal = 1.0; rough = 0.3;
  } else {                            // brass: Jupiter's moons, the collar
    alb = BRASS; metal = 0.85; rough = 0.22;
  }
  vec3 col = surf(p, n, v, alb, metal, rough, k, 1.0);
  // the band lights the stone from inside and puts a hard glint on it
  vec3 h = normalize(normalize(LAMP - p) + v);
  col += glow * (1.0 + 4.0 * b) + alb * b * 0.4 * (1.0 - metal * 0.5);
  col += LAMPC * pow(max(dot(n, h), 0.0), 900.0) * (1.0 + 9.0 * b);
  return col;
}

vec3 shadeItem(int id, vec3 ro, vec3 rd, float tHit, vec4 ga, vec4 gb) {
  vec3 v = -rd;
  if (id < 20) {
    vec3 c = ga.xyz;
    float r = ga.w;
    vec3 oc = ro - c;
    float b = dot(oc, rd);
    float h = r * r - (dot(oc, oc) - b * b);
    vec3 p = ro + rd * (h > 0.0 ? -b - sqrt(h) : -b);
    vec3 n = normalize(p - c);
    if (id == 9) return sunGlobe(ro, rd, p, n);
    if (id == 11) return vec3(1.6, 1.5, 1.3) + vec3(0.6, 0.8, 1.0) * gHigh;      // the comet's head
    if (id == 12) return brassAt(p, n, v, 0.3, 0.0) * (1.0 - 0.6 * ss(0.006, 0.0, abs(length(p.xz - LAMPBASE.xz) - 0.17)));
    if (id == 19) {                                                                 // a glass bead
      float gBeadId = gb.w;
      float hb = hash11(gBeadId * 3.7);
      vec3 alb = hb < 0.33 ? vec3(0.6, 0.06, 0.08) : hb < 0.66 ? vec3(0.35, 0.6, 0.12) : vec3(0.85, 0.55, 0.15);
      vec3 col = surf(p, n, v, alb, 0.0, 0.08, -1, 0.0);
      float tw = 0.5 + 0.5 * sin(uTime * (9.0 + 7.0 * hash11(gBeadId)) + gBeadId * 5.0);
      vec3 hl = normalize(normalize(LAMP - p) + v);
      col += vec3(1.3, 1.15, 0.95) * pow(max(dot(n, hl), 0.0), 120.0) * (0.5 + 7.0 * gHigh * tw);
      col += alb * gHigh * tw * 0.8;
      return col;
    }
    return planet(id, p, n, v, gb.w);
  }
  if (id < 50) {
    int i = id - 20;
    vec3 a = ga.xyz, bb = gb.xyz;
    float r = ga.w;
    vec3 hs = raySeg(ro, rd, a, bb);
    vec3 ax = normalize(bb - a);
    vec3 rp = rd - ax * dot(rd, ax);
    float sa = max(length(rp), 0.05);
    vec3 p = ro + rd * (hs.x - sqrt(max(r * r - hs.y * hs.y, 0.0)) / sa);
    vec3 q = a + (bb - a) * clamp(dot(p - a, bb - a) / dot(bb - a, bb - a), 0.0, 1.0);
    vec3 n = normalize(p - q + 1e-6);
    vec3 col = surf(p, n, v, i == 17 || i == 18 ? vec3(0.78, 0.78, 0.8) : BRASS, 0.85, 0.24, id, id >= 45 ? 0.0 : 1.0);
    if (i == 12) {                                        // the column: a collar where each arm leaves it
      float cl = 0.0;
      for (int k = 0; k < 6; k++) cl = max(cl, ss(0.012, 0.006, abs(p.y - ARMY[k])));
      col *= 1.0 + 0.5 * cl;
    }
    return col;
  }
  if (id == 50 || id == 52) {                             // the belt's wire, the comet's wire
    vec3 c = brassAt(ro + rd * tHit, vec3(0.0, 1.0, 0.0), v, 0.3, 0.0);
    return c * 0.8 + LAMPC * 0.06;
  }
  if (id == 60) return lampShade(ro, rd, shadeHit(ro, rd));
  // Saturn's ring: brass, engraved with grooves
  vec3 c = ga.xyz;
  vec3 nr = normalize(vec3(0.3, 1.0, -0.25));
  float tr = dot(c - ro, nr) / dot(rd, nr);
  vec3 p = ro + rd * tr;
  float rr = length(p - c) / ga.w;
  vec3 n = dot(nr, v) > 0.0 ? nr : -nr;
  vec3 col = surf(p, n, v, BRASS, 0.85, 0.25, 5, 1.0);
  col *= 0.8 + 0.2 * sin(rr * 90.0);
  col *= 1.0 - 0.75 * ss(0.03, 0.0, abs(rr - 1.93));
  return col;
}

void main() {
  vec2 uv = centered();
  float asp = uRes.x / uRes.y;
  gPxA = 2.0 / uRes.y / LENS;

  // the music, every part of it gated, so that a stopped player draws a still machine
  float bass = uAudioActive * clamp(uBass * 1.3, 0.0, 1.0);
  gHigh = uAudioActive * clamp(uHigh * 1.6, 0.0, 1.0);
  for (int k = 0; k < NSPH; k++) gB[k] = 0.0;
  for (int k = 0; k < 6; k++) gB[k] = uAudioActive * clamp(spec(BIN[k]) * 1.6, 0.0, 1.0);
  gSunI = 0.6 + 1.4 * bass;
  // the escapement: one tooth per beat (one per second with nothing playing), with its recoil
  float n = mix(floor(uTime), uBeatCount, uAudioActive);
  gAge = mix(fract(uTime), uBeatAge, uAudioActive);
  float drop = ss(0.0, 0.055, gAge);
  float mv = drop - 0.14 * ss(0.05, 0.08, gAge) * (1.0 - ss(0.08, 0.22, gAge));
  gTick = n - 1.0 + mv;
  float swing = mod(n, 2.0) * 2.0 - 1.0;
  gAnchor = 0.11 * mix(-swing, swing, drop);
  gChime = uAudioActive * uPunch * ss(0.45, 0.3, uBeatAge);
  float jolt = uAudioActive * uPunch * (gAge < 0.4 ? sin(gAge / 0.4 * PI) * exp(-gAge * 7.0) : 0.0);
  // the train: every wheel turns one tooth per tick; each meshes with its parent tooth into gap
  gRot[0] = TAU * mod(gTick, TEETH[0]) / TEETH[0];
  for (int i = 1; i < 7; i++) {
    int j = PARENT[i];
    vec2 dv = GEAR[i].xy - GEAR[j].xy;
    float ph = atan(dv.y, dv.x);
    gRot[i] = (-TEETH[j] * gRot[j] + TEETH[i] * (ph + PI) + TEETH[j] * ph - PI) / TEETH[i];
  }

  // the camera: lower and closer in a wide frame, higher and further back in a tall one
  float wide = ss(0.6, 1.6, asp);
  float elev = mix(0.88, 0.50, wide);
  float dist = mix(4.35, 2.55, wide);
  float az = 0.22 + 0.08 * sin(uTime * 0.023);
  vec3 tgt = vec3(mix(0.0, -0.18, wide), mix(0.32, 0.40, wide), mix(-0.05, -0.1, wide));
  SHADE = mix(vec3(-0.95, 1.12, -1.55), vec3(-1.45, 1.12, -1.25), wide);
  LAMP = SHADE - vec3(0.0, 0.06, 0.0);
  vec2 away = normalize(SHADE.xz) * 0.3;                // the stem stands behind the shade
  LAMPBASE = vec3(SHADE.x + away.x, 0.0, SHADE.z + away.y);
  vec3 ro = tgt + dist * vec3(sin(az) * cos(elev), sin(elev), cos(az) * cos(elev));
  vec3 fwd = normalize(tgt - ro), rt = normalize(cross(fwd, vec3(0.0, 1.0, 0.0))), up = cross(rt, fwd);
  vec3 rd = normalize(uv.x * rt + uv.y * up + LENS * fwd);
  gFrontAng = atan(ro.z, ro.x);
  gSpot = normalize(vec3(0.0, 0.2, 0.0) - LAMP);
  gWin = normalize(vec3((WINR.x + WINR.z) * 0.5, (WINR.y + WINR.w) * 0.5 - 0.4, WALLZ));
  gWx = normalize(cross(gWin, vec3(0.0, 1.0, 0.0)));
  gWy = cross(gWx, gWin);
  gMoon = normalize(vec3(0.22, 0.55, -1.0));
  vec2 toOrr = normalize(-SHADE.xz);
  gShA = normalize(vec3(-toOrr.y, 0.0, toOrr.x));
  gShU = normalize(vec3(0.0, 1.0, 0.0) * cos(0.16) - vec3(toOrr.x, 0.0, toOrr.y) * sin(0.16));

  // planes, and the size of a pixel on them (before anything branches)
  float tPl = (PLATE - ro.y) / rd.y;
  vec3 pp = ro + rd * tPl;
  float fwPl = clamp(length(fwidth(pp.xz)), 1e-5, 0.5);
  float tDk = -ro.y / rd.y;
  vec3 dp = ro + rd * tDk;
  float fwDk = clamp(length(fwidth(dp.xz)), 1e-5, 1.0);
  float tWl = (WALLZ - ro.z) / rd.z;
  vec3 wp = ro + rd * tWl;
  float fwWl = clamp(length(fwidth(wp.xy)), 1e-5, 0.5);

  // the machine's moving parts
  float clock = uTime * 0.055 + 21.0;
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float a = fk * 1.9 + clock / (ORB[k] * sqrt(ORB[k])) + 0.035 * jolt * (1.0 + fk * 0.2);
    vec3 dir = vec3(cos(a), 0.0, -sin(a));
    gSr[k] = PLR[k] * (1.0 + 0.38 * gB[k]);
    gSc[k] = dir * ORB[k] + vec3(0.0, PLY[k], 0.0);
    gSa[k] = dir * 0.03 + vec3(0.0, ARMY[k], 0.0);
    gSb[k] = dir * ORB[k] + vec3(0.0, ARMY[k], 0.0);
    gSw[k] = 0.0085;
    gSa[k + 6] = gSb[k];
    gSb[k + 6] = gSc[k];
    gSw[k + 6] = 0.0065;
  }
  gSa[12] = vec3(0.0, PLATE, 0.0); gSb[12] = vec3(0.0, 0.535, 0.0); gSw[12] = 0.024;
  for (int k = 0; k < 4; k++) {
    float a = float(k) * PI * 0.5 + PI * 0.25 + 0.3;
    vec3 dir = vec3(cos(a), 0.0, sin(a));
    gSa[13 + k] = dir * 0.02 + vec3(0.0, 0.53, 0.0);
    gSb[13 + k] = dir * 0.098 + vec3(0.0, 0.59, 0.0);
    gSw[13 + k] = 0.0055;
  }
  // the moon on its own little arm off the Earth's post
  {
    float a = uTime * 0.7;
    vec3 e = gSc[2];
    vec3 m = e + vec3(cos(a), 0.0, -sin(a)) * 0.12;
    float y = PLY[2] - 0.08;
    gSa[17] = vec3(e.x, y, e.z); gSb[17] = vec3(m.x, y, m.z); gSw[17] = 0.0035;
    gSa[18] = gSb[17]; gSb[18] = vec3(m.x, PLY[2] - 0.005, m.z); gSw[18] = 0.003;
    gSc[6] = gSb[18]; gSr[6] = 0.017;
  }
  // Jupiter's two moons on a turning bar under it
  {
    float a = uTime * 0.45;
    vec3 j = gSc[4];
    vec3 d = vec3(cos(a), 0.0, -sin(a));
    float y = PLY[4] - 0.14;
    gSa[19] = vec3(j.x, y, j.z) - d * 0.175; gSb[19] = vec3(j.x, y, j.z) + d * 0.175; gSw[19] = 0.0032;
    gSa[20] = gSa[19]; gSb[20] = gSa[19] + vec3(0.0, 0.10, 0.0); gSw[20] = 0.0028;
    gSa[21] = gSb[19]; gSb[21] = gSb[19] + vec3(0.0, 0.10, 0.0); gSw[21] = 0.0028;
    gSc[7] = gSb[20]; gSr[7] = 0.015;
    gSc[8] = gSb[21]; gSr[8] = 0.012;
  }
  float beltRot = uTime * 0.02;
  for (int k = 0; k < 3; k++) {
    float a = beltRot + float(k) * TAU / 3.0;
    vec3 dir = vec3(cos(a), 0.0, sin(a));
    gSa[22 + k] = dir * 0.03 + vec3(0.0, BELTY - 0.006, 0.0);
    gSb[22 + k] = dir * BELTR + vec3(0.0, BELTY - 0.006, 0.0);
    gSw[22 + k] = 0.0035;
  }
  gSc[9] = SUNP; gSr[9] = SUNR;
  gSc[10] = vec3(0.0, 0.535, 0.0); gSr[10] = 0.03;
  // the comet on its wire: Kepler's equation, solved by Newton from E = pi, which always converges
  const float CA = 0.80, CE = 0.76;
  float cb = CA * sqrt(1.0 - CE * CE);
  {
    float ps = 2.3, inc = 0.40;
    gU = vec3(cos(ps) * cos(inc), -sin(inc), sin(ps) * cos(inc));
    gV = normalize(vec3(-sin(ps), 0.0, cos(ps)));
    gW = cross(gU, gV);
    float M = mod(uTime * TAU / 46.0 + 2.6, TAU);
    float E = PI;
    for (int i = 0; i < 6; i++) E -= (E - CE * sin(E) - M) / (1.0 - CE * cos(E));
    gCom = SUNP + gU * CA * (cos(E) - CE) + gV * cb * sin(E);
    vec3 away = gCom - SUNP;
    float dsun = length(away);
    gTailDir = away / dsun;
    gTailLen = 0.06 + 0.42 * ss(1.1, 0.25, dsun);
    gSc[11] = gCom; gSr[11] = 0.017;
  }

  // ── the background: desk, drum, wall ──
  float tSide = 1e9;
  vec2 o2 = ro.xz, d2 = rd.xz;
  float qa = dot(d2, d2), qb = dot(o2, d2), qc = dot(o2, o2) - BASER * BASER;
  float disc = qb * qb - qa * qc;
  float tcx = -qb / qa;                                   // where the ray passes the drum's axis
  float axisD = length(o2 + d2 * tcx);
  if (disc > 0.0) {
    float t0 = (-qb - sqrt(disc)) / qa;
    float y0 = ro.y + rd.y * t0;
    if (t0 > 0.0 && y0 > 0.0 && y0 < PLATE) tSide = t0;
  }
  float rTop = length(pp.xz);
  float covTop = tPl > 0.0 ? clamp(0.5 - (rTop - BASER) / fwPl, 0.0, 1.0) : 0.0;
  float ySil = ro.y + rd.y * tcx;
  float covSide = clamp(0.5 - (axisD - BASER) / (tcx * gPxA), 0.0, 1.0) * step(0.0, ySil) * step(ySil, PLATE);
  if (tSide < 1e8) covSide = 1.0;
  bool onDesk = rd.y < 0.0 && dp.z > WALLZ;
  gTB = covTop > 0.5 ? tPl : (covSide > 0.5 ? min(tSide, tcx) : (onDesk ? tDk : tWl));

  // ── the small parts in front of it ──
  gT1 = 1e9; gT2 = 1e9; gA1 = 0.0; gA2 = 0.0; gI1 = -1; gI2 = -1;
  {
    vec3 oc = ro - vec3(0.0, 0.45, 0.0);
    float bb = dot(oc, rd);
    float dd = dot(oc, oc) - bb * bb;
    if (dd < 1.42 * 1.42) {
      for (int i = 0; i < NSPH; i++) {
        vec3 c = gSc[i] - ro;
        float tc = dot(c, rd);
        if (tc <= 0.0) continue;
        float d = length(c - rd * tc), r = gSr[i];
        float pw = tc * gPxA;
        if (d > r + pw) continue;
        float h = r * r - d * d;
        offer(h > 0.0 ? tc - sqrt(h) : tc, cover(d, r, pw), i);
      }
      // the rods: only the nearest one a pixel touches is offered
      float tR = 1e9, aR = 0.0;
      int iR = -1;
      for (int i = 0; i < NSEG; i++) {
        vec3 h = raySeg(ro, rd, gSa[i], gSb[i]);
        float a = cover(h.y, gSw[i], h.x * gPxA);
        if (a > 0.002 && h.x > 0.0 && h.x < tR) { tR = h.x; aR = a; iR = i; }
      }
      if (iR >= 0) offer(tR, aR, 20 + iR);
      // the asteroid belt: a thin wire ring and the glass beads threaded on it
      float tb = (BELTY - ro.y) / rd.y;
      if (tb > 0.0) {
        vec3 q = ro + rd * tb;
        vec2 cr = BELTR * normalize(q.xz + 1e-5);
        vec3 c3 = vec3(cr.x, BELTY, cr.y);
        float t = dot(c3 - ro, rd);
        vec3 pq = ro + rd * t;
        cr = BELTR * normalize(pq.xz + 1e-5);
        c3 = vec3(cr.x, BELTY, cr.y);
        t = dot(c3 - ro, rd);
        float d = length(ro + rd * t - c3);
        offer(t, cover(d, 0.0028, t * gPxA), 50);
        float nb = 44.0;
        float ab = atan(cr.y, cr.x) - beltRot;
        float bi = floor(ab * nb / TAU + 0.5);
        float ba = (bi + (hash11(bi * 1.3 + 2.0) - 0.5) * 0.3) * TAU / nb + beltRot;
        gBead = vec3(BELTR * cos(ba), BELTY, BELTR * sin(ba));
        gBeadR = 0.008 + 0.006 * hash11(bi * 5.1);
        gBeadId = bi;
        vec3 bc = gBead - ro;
        float tc = dot(bc, rd);
        float bd = length(bc - rd * tc);
        float hb = gBeadR * gBeadR - bd * bd;
        offer(hb > 0.0 ? tc - sqrt(hb) : tc, cover(bd, gBeadR, tc * gPxA), 19);
      }
      // Saturn's ring
      {
        vec3 c = gSc[5];
        vec3 nr = normalize(vec3(0.3, 1.0, -0.25));
        float dn = dot(rd, nr);
        if (abs(dn) > 0.01) {
          float tr = dot(c - ro, nr) / dn;
          float rr = length(ro + rd * tr - c);
          float R = gSr[5];
          float pw = tr * gPxA / max(abs(dn), 0.08);
          offer(tr, cover(abs(rr - 1.85 * R), 0.42 * R, pw) * 0.97, 53);
        }
      }
    }
  }
  // the comet's wire: an ellipse in its own plane, its distance taken in the plane and seen across the ray
  {
    float dn = dot(rd, gW);
    if (abs(dn) > 0.02) {
      float te = dot(SUNP - ro, gW) / dn;
      vec3 q = ro + rd * te - SUNP;
      vec2 e = vec2(dot(q, gU) + CA * CE, dot(q, gV));
      float f = (e.x * e.x) / (CA * CA) + (e.y * e.y) / (cb * cb) - 1.0;
      vec2 gr = vec2(2.0 * e.x / (CA * CA), 2.0 * e.y / (cb * cb));
      float gl = max(length(gr), 1e-4);
      vec3 n3 = (gr.x * gU + gr.y * gV) / gl;
      float dpl = abs(f) / gl;
      float dperp = dpl * sqrt(max(1.0 - dot(n3, rd) * dot(n3, rd), 0.0));
      if (te > 0.0 && dpl < 0.1) offer(te, cover(dperp, 0.0022, te * gPxA) * 0.9, 52);
    }
  }
  // the lamp
  {
    vec3 oc = ro - vec3(LAMPBASE.x, 0.7, LAMPBASE.z);
    float bb = dot(oc, rd);
    if (dot(oc, oc) - bb * bb < 0.95 * 0.95) {
      vec3 sh = shadeHit(ro, rd);
      if (sh.x > 0.0) offer(sh.x, sh.y, 60);
      vec3 h = raySeg(ro, rd, LAMPBASE + vec3(0.0, 0.04, 0.0), LAMPBASE + vec3(0.0, SHADE.y + 0.06, 0.0));
      offer(h.x, cover(h.y, 0.03, h.x * gPxA), 45);
      h = raySeg(ro, rd, LAMPBASE + vec3(0.0, SHADE.y + 0.06, 0.0), SHADE + gShU * 0.15);
      offer(h.x, cover(h.y, 0.022, h.x * gPxA), 46);
      vec3 c = LAMPBASE - vec3(0.0, 0.42, 0.0) - ro;
      float tc = dot(c, rd);
      float d = length(c - rd * tc);
      float hh = 0.475 * 0.475 - d * d;
      if (hh > 0.0) offer(tc - sqrt(hh), 1.0, 12);
    }
  }

  // ── shade the background ──
  vec3 col = vec3(0.0);
  if (covTop < 1.0 && covSide < 1.0) col = onDesk ? desk(dp, rd, fwDk) : wall(wp, rd, fwWl);
  if (covSide > 0.0 && covTop < 1.0) {
    float ts = tSide < 1e8 ? tSide : tcx;
    vec3 ps = ro + rd * ts;
    ps.xz = normalize(ps.xz) * BASER;
    col = mix(col, drumSide(ps, -rd), covSide);
  }
  if (covTop > 0.0) col = mix(col, plateTop(ro, rd, pp, fwPl), covTop);

  // ── the small parts over it, the further first ──
  vec4 ga, gb;
  if (gI2 >= 0) { geomOf(gI2, ga, gb); col = mix(col, shadeItem(gI2, ro, rd, gT2, ga, gb), gA2); }
  if (gI1 >= 0) { geomOf(gI1, ga, gb); col = mix(col, shadeItem(gI1, ro, rd, gT1, ga, gb), gA1); }

  // ── light in the air ──
  float tNear = gI1 >= 0 && gA1 > 0.5 ? gT1 : gTB;
  // the sun globe's halo
  {
    vec3 oc = SUNP - ro;
    float tc = dot(oc, rd);
    float d = length(oc - rd * tc);
    if (tc < tNear + 0.2) col += SUNC * gSunI * 0.05 * exp(-max(d - SUNR, 0.0) * 9.0);
  }
  // each planet's band, as a soft light in the air round its stone
  for (int k = 0; k < 6; k++) {
    vec3 oc = gSc[k] - ro;
    float tc = dot(oc, rd);
    float d = length(oc - rd * tc);
    col += TINT[k] * gB[k] * 0.16 * exp(-max(d - gSr[k], 0.0) * 28.0) * step(tc, tNear + gSr[k]);
  }
  // the comet's tail, blown away from the sun, and its head
  {
    vec3 h = raySeg(ro, rd, gCom, gCom + gTailDir * gTailLen);
    if (h.x < tNear) {
      float w = 0.004 + 0.03 * h.z * gTailLen / 0.45;
      float tail = exp(-h.y * h.y / (w * w)) * pow(1.0 - h.z, 1.6);
      float spark = 0.7 + 0.6 * gHigh * (0.5 + 0.5 * sin(h.z * 40.0 - uTime * 12.0));
      col += vec3(0.55, 0.75, 1.0) * tail * 0.55 * spark * ss(0.0, 0.08, gTailLen);
      vec3 hc = gCom - ro;
      float tc = dot(hc, rd);
      float d = length(hc - rd * tc);
      col += vec3(0.7, 0.85, 1.0) * exp(-d * d / 0.0008) * 0.5;
    }
  }
  // the lamp's beam: a faint shaft of haze, with dust turning in it that glitters with the highs
  {
    vec3 h = raySeg(ro, rd, LAMP, LAMP + gSpot * 3.2);
    float br = 0.05 + h.z * 3.2 * 0.3;
    float inBeam = exp(-h.y * h.y / (br * br)) * ss(0.0, 0.1, h.z) * (1.0 - h.z) * step(h.x, tNear + 0.3);
    col += LAMPC * inBeam * 0.035;
    vec2 g = uv * 64.0 + vec2(uTime * 0.5, -uTime * 0.7);
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float hs = hash21(cell);
    if (hs > 0.9 && inBeam > 0.02) {
      vec2 off = (vec2(hash21(cell + 3.1), hash21(cell + 7.3)) - 0.5) * 0.6;
      float dd = length(f - off);
      float tw = 0.5 + 0.5 * sin(uTime * (2.0 + 6.0 * hs) + hs * 40.0);
      col += LAMPC * inBeam * ss(0.18, 0.0, dd) * (0.15 + 1.6 * gHigh * tw) * (0.4 + 0.6 * tw);
    }
  }
  // dither, so the long dark gradients do not band
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

export default {
  id: 'orrery',
  name: 'Orrery',
  group: 'Journey',
  blurb: 'A brass clockwork orrery under a desk lamp: the glass sun glows with the bass, each planet swells with its band, each beat ticks the clock',
  tags: ['space', 'science', 'calm'],
  energy: 0.35,
  particles: 0,
  trails: 0,
  zoom: 1,
  spin: 0,
  frag,
};
