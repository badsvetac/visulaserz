import { SCULPT } from '../js/gfx/scene-kit.js';

// TRAIN — the window seat of a regional train through Thrace on a summer evening, the hour before
// sunset: the daytime, golden opposite of Eastern Express. The low sun hangs in the window over
// olive hills; sunflower fields run right up to the line, rows of poplars stride past along the
// field roads, wheat ripples under the wind, and a village with red roofs and a minaret drifts by
// in the golden haze. Inside, the compartment is lit by what comes through the glass: the sun
// falls on the window's reveal and across the little table, where a glass of tea glows ruby and a
// simit throws a long shadow; shafts of light hang in the air with dust in them, the saffron
// curtains glow where the sun comes through them, and the shadows of the passing poplars sweep
// through all of it.
//
// The land outside is real 3-D on one loop of PERIOD metres: things stand on rows at fixed
// distances and slide past at the speed their distance gives them. The compartment is traced: the
// eye's ray finds the wall, the reveal, the glass, the table, the benches, the curtains, the tea
// and the simit; every point then asks whether the sun reaches it through the opening, and whether
// a poplar (or the beat's signal post) stands in the way out there, so the shadows inside are the
// trees outside. The shafts in the air are found exactly (the stretch of the eye's ray that sees
// the sun through the opening) and only the shadows out there are sampled along them.
//
// Music: the bass sways the carriage (the land tilts in the window, the light slides across the
// table, the tea ripples); the mids open the gaps in the poplars' leaves, so the sun dapples and
// flickers through them more strongly, and they thicken the light in the air; the highs make the
// dust in the sunbeams glitter and the rim of the glass sparkle. On every beat a signal post
// whips past the window: its lamp flashes, its shadow sweeps across the compartment and the glint
// off it runs along the wall, all within the beat. With nothing playing the train runs on quietly,
// the poplars still pass, and nothing pulses.
const frag = `${SCULPT}
const float PERIOD = 480.0;            // the land repeats every 480 m
const float FARLOOP = 24000.0;         // the hills keep a much longer loop
const float SPEED = 7.0;               // metres per unit of uCruise
const float VILLAGE_X = 66.0;
const float GLASS_Z = -0.09;           // the glass sits this far into the wall
const float FRAME = 0.03;              // the aluminium frame round the glass
const float CORNER = 0.08;             // the radius of the opening's corners
const float LIFT = 1.75;               // the compartment floor above the fields
const float XW = 1.0;                  // the partitions either side, half the compartment's length
const float CEIL = 2.35;
const float SEAT = 0.46;               // the benches: seat height, depth from the partition,
const float BENCH = 0.52;              //   the back cushion's thickness and top
const float BACK = 0.17;
const float BACKTOP = 1.24;
const float ZC = 0.075;                // the curtains hang this far in front of the wall
const float POST_Z = -3.2;             // the beat's signal post, by the line
const float POPLAR_Z = -22.0;          // the poplar row whose shadows come inside
const float PROP = 1.45;               // the tea and the simit, a touch larger than life
const vec3 SUN = vec3(1.0, 0.68, 0.38);
const float ROWZ[12] = float[12](-3.2, -7.6, -9.1, -10.9, -13.2, -16.2, -22.0, -36.0, -62.0, -126.0, -141.0, -150.0);
const int ROWK[12] = int[12](0, 1, 1, 1, 1, 1, 2, 5, 2, 3, 4, 3);   // 0 post, 1 crops, 2 poplars, 3 houses, 4 mosque, 5 hay bales

float gPx, gAsp, gPf, gTravel, gFar, gLens;
vec3 gSunC, gSunW, gHz, gRd;        // gRd: the ray outside, for things that glow against the sun
float gPitch, gRoll;
vec4 gWin;                 // the window opening: centre x, centre y, half width, half height (metres)
float gVent, gTableW, gTableY, gTableD, gRodY, gTieY, gBotY;
vec3 gTea, gSim;
float gPostX, gPostOn, gFlash, gFlashX, gRoomVis, gGlass, gSwing;
vec3 gLampCol;             // the colour the beat's signal shows

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
float rbox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
// the carriage's sway, between its frame and the land's
vec3 toWorld(vec3 d) { d.yz = rot(gPitch) * d.yz; d.xy = rot(gRoll) * d.xy; return d; }
vec3 toCar(vec3 d) { d.xy = rot(-gRoll) * d.xy; d.yz = rot(-gPitch) * d.yz; return d; }
float ign(vec2 f) { return fract(52.9829189 * fract(dot(f, vec2(0.06711056, 0.00583715)))); }
vec4 fogged(vec3 c, float a, float t) { return vec4(mix(c, gHz, 1.0 - exp(-t * 0.0046)) * a, a); }

// ── the sky, the sun, the hills ────────────────────────────────────────────────────────────────
// how near the sun a direction is, in azimuth only: the haze and everything standing against it
// burn gold on that side of the sky
float sunward(vec3 rd) { return max(dot(normalize(rd.xz), normalize(gSunW.xz)), 0.0); }
vec3 skyCol(vec3 rd) {
  float e = rd.y, sd = max(dot(rd, gSunW), 0.0), sa = sunward(rd);
  // gold low down toward the sun, rose and lilac along the horizon away from it, clear blue above
  vec3 hor = mix(vec3(0.74, 0.47, 0.48), vec3(1.12, 0.7, 0.36), pow(sa, 5.0));
  vec3 c = mix(hor, mix(vec3(0.62, 0.56, 0.64), vec3(1.0, 0.72, 0.46), pow(sa, 7.0)), ss(0.0, 0.09, e));
  c = mix(c, vec3(0.32, 0.47, 0.78), ss(0.06, 0.3, e) * (1.0 - 0.5 * pow(sd, 6.0)));
  c = mix(c, vec3(0.17, 0.34, 0.72), ss(0.24, 0.55, e));
  c += vec3(1.0, 0.6, 0.28) * (0.2 * pow(sd, 30.0) + 0.9 * pow(sd, 300.0));
  // a field of altocumulus: lilac and peach, the ones near the sun dark with burning edges
  if (e > 0.02) {
    vec2 q = rd.xz / e * 0.85 + vec2(uTime * 0.005, 0.0);
    float base = fbm(q * vec2(0.8, 2.0));
    float n = base * 0.8 + noise(q * vec2(2.4, 6.5) + base * 3.0) * 0.3;
    float cov = ss(0.56, 0.75, n) * ss(0.02, 0.09, e) * ss(0.55, 0.22, e);
    float thin = ss(0.72, 0.57, n);
    vec3 cc = mix(vec3(0.66, 0.5, 0.58), vec3(1.0, 0.72, 0.6), ss(0.02, 0.3, e));
    cc = mix(cc, vec3(0.7, 0.46, 0.4), pow(sd, 12.0) * (1.0 - thin));
    cc += vec3(1.5, 0.85, 0.38) * pow(sd, 14.0) * thin;
    c = mix(c, cc, cov * 0.88);
  }
  float ds = length(rd - gSunW), px = gPx / gLens;
  c += vec3(3.4, 2.7, 1.8) * ss(0.011 + px, 0.011 - px, ds);
  c += vec3(1.4, 0.8, 0.36) * (exp(-ds * 40.0) * 0.55 + exp(-ds * 12.0) * 0.1);
  return c;
}
// far ranges in lilac haze, a nearer range, then olive hills with their groves and a lit ridge,
// all sliding by on the long loop
vec3 hills(vec3 rd, vec3 c) {
  float a = atan(rd.x, -rd.z), e = rd.y, px = gPx / gLens;
  if (e > 0.08) return c;
  float sa = pow(sunward(rd), 10.0);
  float af = a + gFar / 6000.0;
  float top = 0.028 + 0.034 * noiseP(vec2(af * 2.5, 1.0), 10.0) + 0.011 * noiseP(vec2(af * 9.0, 2.0), 36.0) + 0.003 * noiseP(vec2(af * 30.0, 3.0), 120.0);
  vec3 rc = mix(vec3(0.7, 0.54, 0.62), vec3(1.1, 0.74, 0.5), sa);
  c = mix(c, rc, ss(top + px, top - px, e) * 0.9);
  float am = a + gFar / 3200.0;
  float tm = 0.016 + 0.022 * noiseP(vec2(am * 4.0 + 3.0, 8.0), 16.0) + 0.005 * noiseP(vec2(am * 15.0, 9.0), 60.0);
  vec3 mc = mix(vec3(0.56, 0.44, 0.5), vec3(0.95, 0.62, 0.42), sa);
  c = mix(c, mc, ss(tm + px, tm - px, e));
  float an = a + gFar / 1600.0;
  float th = 0.007 + 0.013 * noiseP(vec2(an, 5.0), 15.0) + 0.005 * noiseP(vec2(an * 3.2, 6.0), 48.0);
  th += 0.0016 * ss(0.45, 0.8, noiseP(vec2(an * 260.0, 7.0), 3900.0));
  float groves = noiseP(vec2(an * 420.0, e * 380.0), 6300.0) * 0.6 + noiseP(vec2(an * 140.0, e * 120.0), 2100.0) * 0.4;
  vec3 hc = mix(vec3(0.42, 0.36, 0.24), vec3(0.2, 0.2, 0.11), ss(0.42, 0.66, groves));
  hc = mix(hc, mix(vec3(0.62, 0.48, 0.42), vec3(1.0, 0.68, 0.4), sa), 0.3 + 0.2 * ss(th, 0.0, e));
  hc += vec3(1.2, 0.75, 0.32) * ss(th - 0.003, th, e) * (0.15 + 0.7 * sa);     // the ridge against the light
  return mix(c, hc, ss(th + px, th - px, e));
}

// ── the fields ─────────────────────────────────────────────────────────────────────────────────
// the crop in a band along the line, changing every 40 m: 0 wheat, 1 sunflowers, 2 stubble, 3 green
float crop(float X, float band) {
  float h = hashP(vec2(floor(X / 40.0), band), 12.0);
  if (band < 0.5) return h < 0.55 ? 1.0 : (h < 0.95 ? 0.0 : 2.0);
  return h < 0.36 ? 0.0 : (h < 0.56 ? 1.0 : (h < 0.9 ? 2.0 : 3.0));
}
// a round hay bale on its side, its end toward the line, in some plots of a harvested field:
// the distance from its outline (negative inside), q from its middle
float baleAt(float X, float y, out vec2 q) {
  float cw = 8.0;                                                  // 60 plots round the loop
  float c = floor(X / cw);
  q = vec2(X - (c + 0.5) * cw - (hashP(vec2(c, 51.0), 60.0) - 0.5) * 4.0, y - 0.72);
  if (hashP(vec2(c, 53.0), 60.0) > 0.6 || crop((c + 0.5) * cw + 13.0, 1.0) != 2.0) return 1e3;
  return length(q * vec2(1.0, 1.04)) - 0.72;
}
// the long shadows of the poplar rows, thrown across the fields toward the line
float poplar(int i, float X, float y, float soft, out vec3 info);
float rowShade(vec3 p) {
  vec3 info;
  float sh = 0.0;
  if (p.z > ROWZ[6]) {
    float s = (ROWZ[6] - p.z) / gSunW.z;
    vec3 Q = p + gSunW * s;
    sh = poplar(6, Q.x + gTravel, Q.y, 0.2 + s * 0.006, info);
  }
  if (p.z > ROWZ[8] && sh < 0.99) {
    float s = (ROWZ[8] - p.z) / gSunW.z;
    vec3 Q = p + gSunW * s;
    sh = max(sh, poplar(8, Q.x + gTravel, Q.y, 0.2 + s * 0.006, info));
  }
  // and the round hay bales lying on the stubble
  if (p.z > ROWZ[7] && p.z < ROWZ[7] + 12.0 && sh < 0.99) {
    float s = (ROWZ[7] - p.z) / gSunW.z;
    vec3 Q = p + gSunW * s;
    vec2 q;
    sh = max(sh, ss(0.12 + s * 0.006, -0.12, baleAt(Q.x + gTravel, Q.y, q)));
  }
  return sh;
}
vec3 groundCol(vec3 p, vec3 rd, float t) {
  float X = p.x + gTravel, z = p.z;
  float fp = gPx / gLens * t;
  float band = z > -19.0 ? 0.0 : (z > -60.0 ? 1.0 : (z > -122.0 ? 2.0 : 3.0));
  float k = crop(X + band * 13.0, band);
  float n1 = landNoise(X, z, 0.5, 0.35), n2 = landNoise(X, z, 2.5, 1.6);
  float sa = pow(sunward(rd), 6.0);
  vec3 c;
  if (k < 0.5) {
    // wheat, gusts of wind running through it, its ears burning gold against the sun
    float gust = landNoise(X - uTime * 4.0, z, 0.1, 0.12) * 0.6 + landNoise(X - uTime * 6.0, z, 0.5, 0.4) * 0.4;
    c = vec3(0.8, 0.5, 0.18) * (0.72 + 0.36 * gust) + vec3(0.5, 0.3, 0.08) * ss(0.6, 0.9, gust);
    c *= 0.9 + 0.1 * mix(n2, 0.5, ss(0.05, 0.3, fp));
    c += vec3(0.7, 0.42, 0.12) * sa * (0.4 + 0.6 * gust);
  } else if (k < 1.5) {
    // a sunflower field seen from afar: yellow heads over dark leaves
    float heads = mix(landNoise(X, z, 5.0, 3.0), 0.5, ss(0.08, 0.4, fp));
    c = mix(vec3(0.1, 0.14, 0.04), vec3(0.9, 0.58, 0.06), 0.55 + 0.4 * (heads - 0.5) + 0.15 * (n1 - 0.5));
    c += vec3(0.4, 0.3, 0.05) * sa;
  } else if (k < 2.5) {
    // stubble after the harvest, pale, with the lines of the combine in it
    c = vec3(0.78, 0.6, 0.38) * (0.85 + 0.15 * n1) * (0.93 + 0.07 * sin(z * 3.0) * ss(0.4, 0.1, fp));
    c += vec3(0.5, 0.32, 0.12) * sa;
  } else {
    c = mix(vec3(0.24, 0.3, 0.1), vec3(0.38, 0.4, 0.16), n1);
  }
  // grass strips between the fields hide where one crop gives way to the next
  float ex = abs(fract((X + band * 13.0) / 40.0 + 0.5) - 0.5) * 40.0;
  float ez = min(abs(z + 19.0), min(abs(z + 60.0), abs(z + 122.0)));
  float edge = max(ss(0.9 + fp, 0.9 - fp, ex), ss(0.7 + fp * 6.0, 0.7, ez));
  c = mix(c, vec3(0.28, 0.3, 0.1) * (0.8 + 0.3 * n2), edge);
  c *= mix(vec3(1.0), vec3(0.42, 0.4, 0.48), rowShade(p));
  return mix(c, mix(gHz, vec3(1.1, 0.74, 0.46), sa), 1.0 - exp(-t * 0.0052));
}

// ── the rows: the signal post, sunflowers, poplars, the village ────────────────────────────────
// the beat's signal post: a mast and a black signal head with two lamps, the top one lit
float postCover(float u, float y, float fp) {
  float ux = max(abs(u) - 0.06, 0.0);                              // a touch of smear at its speed
  float mast = ss(fp, -fp, ux - 0.08) * step(y, 4.3);
  float head = ss(fp, -fp, rbox(vec2(ux, y - 4.62), vec2(0.17, 0.4), 0.14));
  return max(mast, head);
}
vec4 postRow(vec3 p, float t) {
  float u = p.x - gPostX, y = p.y;
  if (abs(u) > 1.0 || y > 5.4) return vec4(0.0);
  float fp = gPx / gLens * t;
  float a = postCover(u, y, fp) * gPostOn;
  vec3 c = vec3(0.025, 0.025, 0.03) + vec3(1.2, 0.7, 0.3) * 0.45 * ss(0.0, -0.12, u) * step(y, 4.3);   // its edge toward the sun
  float l1 = length(vec2(max(abs(u) - 0.04, 0.0), y - 4.8)), l2 = length(vec2(max(abs(u) - 0.04, 0.0), y - 4.44));
  c += vec3(0.12, 0.02, 0.01) * ss(0.075, 0.06, l2);              // the unlit red lens below
  vec3 glow = gLampCol * (ss(0.075, 0.055, l1) * 2.6 + exp(-l1 * 6.0) * 0.3) * gPostOn * uPunch;
  return vec4(c * a + glow, a);
}
// a row of wheat by the line: a ragged line of ears leaning with the gusts, lit through by the sun
vec4 wheatRow(int i, vec3 p, float t, float Xo) {
  float fi = float(i), y = p.y, fp = gPx / gLens * t;
  if (y > 1.2) return vec4(0.0);
  float gust = landNoise(Xo - uTime * 4.0, p.z, 0.1, 0.12);
  float Xl = Xo + (gust - 0.5) * 0.3 * y;
  float fine = ss(0.035, 0.012, fp);                              // fine texture only where a pixel can hold it
  float top = 0.84 + 0.1 * landNoise(Xl, fi * 3.0, 2.5, 1.0) + 0.06 * (noiseP(vec2(Xl * 14.0, fi * 5.0), PERIOD * 14.0) - 0.5) * fine;
  float a = ss(fp, -fp, y - top);
  if (a < 0.003) return vec4(0.0);
  float stalk = mix(0.5, noiseP(vec2(Xl * 22.0, y * 1.2 + fi * 3.0), PERIOD * 22.0), fine);
  float sa = pow(sunward(gRd), 5.0);
  // one even gold through the depth of the crop, so the rows behind merge into a field; only the
  // ears along the very top of each row catch the light
  vec3 c = vec3(0.56, 0.35, 0.12) * (0.75 + 0.45 * stalk) * (0.85 + 0.25 * gust) + vec3(0.42, 0.25, 0.07) * sa * (0.6 + 0.4 * gust);
  float ear = ss(0.07, 0.0, top - y) * ss(-0.01, 0.015, top - y);
  c += vec3(0.8, 0.52, 0.18) * ear * (0.25 + 0.6 * sa) * (0.7 + 0.5 * stalk);
  c *= mix(vec3(1.0), vec3(0.45, 0.42, 0.5), rowShade(p));
  return fogged(c, a, t);
}
vec4 sunflowerRow(int i, vec3 p, float t) {
  float fi = float(i), y = p.y;
  if (y > 2.3) return vec4(0.0);
  float fp = gPx / gLens * t;
  float w = 0.6, off = fi * 0.29;
  float Xo = p.x + gTravel + off;
  float c = floor(Xo / w);
  float X = (c + 0.5) * w - off;                                   // this plant's place on the line
  float kind = crop(X, 0.0);
  if (kind == 0.0) return i < 4 ? wheatRow(i, p, t, Xo) : vec4(0.0);
  if (kind != 1.0) return vec4(0.0);
  float cells = PERIOD / w;
  float h1 = hashP(vec2(c, fi), cells), h2 = hashP(vec2(c, fi + 3.0), cells), h3 = hashP(vec2(c, fi + 7.0), cells), h4 = hashP(vec2(c, fi + 9.0), cells);
  float u = Xo - (c + 0.5) * w;
  vec2 hc = vec2((h1 - 0.5) * 0.22, 1.42 + 0.42 * h2);
  float R = 0.13 + 0.05 * h3;
  // the leaves, a ragged mass, their tops catching the light through them
  float top = 0.98 + 0.3 * landNoise(Xo, fi * 3.0, 1.25, 1.0) + 0.12 * landNoise(Xo, fi * 3.0 + 1.0, 5.0, 1.0);
  float fol = ss(fp, -fp, y - top);
  float su = u - hc.x + (hc.y - y) * 0.06 * (h4 - 0.5);
  float stem = ss(0.017 + fp, 0.013, abs(su)) * step(y, hc.y);
  vec2 q = rot((h4 - 0.5) * 0.7) * vec2(u - hc.x, y - hc.y);
  q.y /= 0.86;                                                     // nodding a little toward the field
  float r = length(q), th = atan(q.y, q.x);
  float pet = abs(cos(th * 10.5 + h1 * 9.0));                      // 21 petals
  float rTip = R * (0.66 + 0.34 * sqrt(pet));
  float head = ss(fp, -fp, r - rTip);
  float disc = ss(fp, -fp, r - R * 0.5);
  float a = max(max(fol, stem), head);
  if (a < 0.003) return vec4(0.0);
  float ln = landNoise(Xo, y * 1.3 + fi * 7.1, 7.5, 5.0);
  vec3 col = vec3(0.07, 0.12, 0.03) * (0.6 + 0.8 * ln) + vec3(0.5, 0.6, 0.14) * 0.4 * ss(0.14, 0.0, top - y);
  col = mix(col, vec3(0.13, 0.19, 0.05), stem);
  vec3 petal = vec3(0.66, 0.42, 0.05) * (0.75 + 0.25 * pet) + vec3(1.3, 0.8, 0.16) * 0.6 * ss(0.55, 1.0, r / rTip);
  vec3 seeds = vec3(0.12, 0.065, 0.025) * (0.7 + 0.6 * noise(q * 160.0 + h1 * 50.0)) + vec3(0.3, 0.17, 0.04) * ss(0.3, 0.5, r / R);
  col = mix(col, mix(petal, seeds, disc), head);
  col *= mix(vec3(1.0), vec3(0.45, 0.42, 0.5), rowShade(p));
  return fogged(col, a, t);
}
// a Lombardy poplar row, planted in stretches along a field road: the cover at (X, y); in info the
// side of the crown (-1 left .. 1 right), the leaves, and how far in from the outline (0 at it)
float poplar(int i, float X, float y, float soft, out vec3 info) {
  info = vec3(0.0, 0.0, 1.0);
  float fi = float(i);
  float Xo = X + fi * 31.0, cw = 6.0;                              // 80 plots round the loop
  float c = floor(Xo / cw), cm = mod(c, 80.0);
  float stand = fract((c + 0.5) * cw / 160.0 + fi * 0.37);         // three stretches of trees round the loop
  if (stand > 0.36 || hashP(vec2(c, fi + 1.0), 80.0) < 0.08) return 0.0;
  float h1 = hashP(vec2(c, fi + 2.0), 80.0), h2 = hashP(vec2(c, fi + 4.0), 80.0), h3 = hashP(vec2(c, fi + 6.0), 80.0);
  float H = 17.0 + 7.0 * h1, hb = 1.2 + 1.0 * h2;
  if (y > H + 0.5) return 0.0;
  float u = Xo - (c + 0.5) * cw - (h3 - 0.5) * 1.6;
  float k = clamp((y - hb) / (H - hb), 0.0, 1.0);
  float leaf = noise(vec2(u * 1.7, y * 1.1) + cm * 7.31);
  float lobe = noise(vec2(u * 0.5, y * 0.32) + cm * 3.1);
  float clump = noise(vec2(u * 3.4, y * 2.4) + cm * 5.9);
  float w = (1.0 + 0.4 * h1) * 1.85 * pow(k, 0.3) * pow(1.0 - k, 0.6) * (0.74 + 0.3 * lobe + 0.14 * leaf + 0.1 * clump);
  float d = abs(u) - w;
  float crown = ss(soft, -soft, d) * step(hb - 0.5, y);
  float trunk = ss(soft, -soft, abs(u) - 0.13) * step(y, hb + 1.5);
  // small round gaps in the leaves where the sun breaks through, stirred by the wind; the mids open
  // more of them, and wider
  vec2 gq = vec2(u / 0.42, y / 0.62), gc = floor(gq);
  float gh = hash21(gc + cm * 13.1);
  float open = 0.0;
  if (gh > 0.86 - 0.24 * gMid) {
    vec2 off = (vec2(hash21(gc + cm + 1.7), hash21(gc + cm + 4.3)) - 0.5) * 0.45 + 0.07 * sin(uTime * (1.3 + 2.0 * gh) + gh * 40.0 + vec2(0.0, 1.7));
    float dist = length((fract(gq) - 0.5 - off) * vec2(0.42, 0.62));
    float rad = (0.022 + 0.03 * fract(gh * 17.0)) * (0.85 + 0.6 * gMid), sf = max(soft * 0.6, 0.01);
    float band = -d / max(w, 0.1);
    open = ss(rad + sf, rad - sf, dist) * min(1.0, rad * 2.0 / max(soft, rad * 2.0)) * ss(0.04, 0.16, band) * ss(0.8, 0.45, band);
  }
  info = vec3(clamp(u / max(w, 0.2), -1.0, 1.0), leaf * 0.5 + clump * 0.5, clamp(-d / 0.7, 0.0, 1.0));
  return max(crown * (1.0 - open), trunk);
}
vec4 poplarRow(int i, vec3 p, float t) {
  if (p.y > 24.5) return vec4(0.0);
  float fp = gPx / gLens * t;
  vec3 info;
  float a = poplar(i, p.x + gTravel, p.y, fp, info);
  if (a < 0.003) return vec4(0.0);
  // against the light: the face toward us in shadow, the leaves at the outline lit through
  float near = exp(-length(gRd - gSunW) * 4.0);
  float rim = pow(1.0 - info.z, 2.0) * (0.55 + 0.45 * ss(0.2, -0.9, info.x));
  vec3 c = vec3(0.03, 0.045, 0.02) * (0.4 + 1.2 * info.y) + vec3(0.05, 0.05, 0.045) * ss(-0.2, 0.9, info.x);
  c += vec3(0.85, 0.72, 0.22) * rim * (0.18 + 1.2 * near) * (0.6 + 0.8 * info.y);
  return fogged(c, a, t);
}
// a village house, the sun behind it: plaster in shade, a roof of red tiles, a lit edge on the
// side toward the sun
vec4 house(float u, float y, float seed, float fp) {
  float w = 2.6 + 1.8 * fract(seed * 7.1);
  float wallH = 3.0 + 2.6 * step(0.6, fract(seed * 3.3)) + 0.5 * fract(seed * 5.3);
  float roofH = 1.6 + 0.5 * fract(seed * 5.7), ov = 0.4;
  float roofHalf = (w + ov) * (1.0 - (y - wallH) / roofH);
  float inRoof = step(wallH - 0.2, y) * step(y, wallH + roofH) * ss(fp, -fp, (abs(u) - roofHalf) * roofH / length(vec2(roofH, w + ov)));
  float inWall = step(0.0, y) * step(y, wallH) * ss(fp, -fp, abs(u) - w);
  float chimX = w * 0.5 * (fract(seed * 11.0) > 0.5 ? 1.0 : -1.0);
  float chimTop = wallH + roofH * (1.0 - abs(chimX) / (w + ov)) + 0.7;
  float inChim = ss(fp, -fp, abs(u - chimX) - 0.22) * step(wallH, y) * step(y, chimTop) * step(0.4, fract(seed * 23.0));
  float a = max(max(inRoof, inWall), inChim);
  if (a < 0.003) return vec4(0.0);
  vec3 plaster = mix(vec3(0.86, 0.8, 0.7), vec3(0.88, 0.72, 0.56), fract(seed * 19.0));
  vec3 col = plaster * vec3(0.52, 0.5, 0.52);
  float nW = 1.0 + floor(fract(seed * 13.0) * 3.0);
  float cell = (u + w) / (2.0 * w) * nW;
  float lx = fract(cell) - 0.5;
  float winY = wallH > 4.5 ? mod(y, wallH * 0.5) : y;
  float inWin = ss(fp, 0.0, abs(lx) * 2.0 * w / nW - 0.38) * ss(fp, 0.0, abs(winY - 1.45) - 0.48);
  col = mix(col, vec3(0.13, 0.11, 0.12), inWin * 0.85);
  col += vec3(1.1, 0.75, 0.4) * 0.6 * ss(-w + 0.25 + fp, -w, u) * inWall;           // the edge toward the sun
  if (inRoof > inWall) {
    col = vec3(0.62, 0.24, 0.12) * (0.55 + 0.25 * noise(vec2(u * 3.0, y * 9.0) + seed * 40.0));
    col += vec3(1.1, 0.6, 0.3) * 0.45 * ss(0.25, 0.0, roofHalf - abs(u)) * step(u, 0.0);
  }
  if (inChim > max(inRoof, inWall) - 0.01 && inChim > 0.5) col = plaster * 0.45;
  return vec4(col * a, a);
}
// the mosque: a hall under a lead dome, and the pencil minaret, lit from the left
vec4 mosque(float u, float y, float fp) {
  float hall = step(0.0, y) * step(y, 6.6) * ss(fp, -fp, abs(u) - 6.8);
  float dome = step(6.2, y) * ss(fp, -fp, length(vec2(u, (y - 6.6) * 1.08)) - 4.6);
  float alem = ss(fp + 0.05, 0.0, abs(u)) * step(11.4, y) * step(y, 12.6);
  float um = u + 9.0;
  float shaft = step(0.0, y) * step(y, 22.5) * ss(fp, -fp, abs(um) - 0.95);
  float serefe = step(17.4, y) * step(y, 18.2) * ss(fp, -fp, abs(um) - 1.45);
  float cap = step(22.4, y) * step(y, 27.4) * ss(fp, -fp, abs(um) - 1.0 * (27.4 - y) / 5.0);
  float tip = ss(fp + 0.04, 0.0, abs(um)) * step(27.3, y) * step(y, 28.4);
  float a = max(max(max(hall, dome), max(alem, tip)), max(max(shaft, serefe), cap));
  if (a < 0.003) return vec4(0.0);
  vec3 col = vec3(0.86, 0.82, 0.74) * vec3(0.5, 0.48, 0.5);
  float lit = 0.0;
  if (dome > 0.5) { col = vec3(0.42, 0.44, 0.48); lit = ss(0.2, -0.9, u / 4.6); }
  else if (shaft > 0.5 || serefe > 0.5) { lit = ss(0.3, -0.9, um / 1.0); }
  else if (cap > 0.5) { col = vec3(0.4, 0.42, 0.46); lit = ss(0.2, -0.9, um / max(1.0 * (27.4 - y) / 5.0, 0.05)); }
  else if (hall > 0.5) {
    float wx = mod(u + 1.7, 3.4) - 1.7;
    float arch = max(abs(wx) - 0.55, y > 3.9 ? length(vec2(wx, y - 3.9)) - 0.55 : abs(y - 2.9) - 1.0);
    col = mix(col, vec3(0.16, 0.13, 0.13), ss(fp, -fp, arch) * step(abs(u), 6.2) * 0.85);
  }
  if (alem > 0.5 || tip > 0.5) { col = vec3(0.8, 0.62, 0.25); lit = 1.0; }
  col += vec3(1.1, 0.72, 0.38) * 0.55 * lit;
  return vec4(col * a, a);
}
vec4 villageRow(int i, vec3 p, float t) {
  if (p.y > 29.0) return vec4(0.0);
  float X = p.x + gTravel;
  float dv = mod(X - VILLAGE_X + PERIOD * 0.5, PERIOD) - PERIOD * 0.5;   // metres from the village's middle
  float fp = gPx / gLens * t;
  if (i == 10) {
    if (abs(dv - 10.0) > 18.0) return vec4(0.0);
    vec4 m = mosque(dv - 10.0, p.y, fp);
    m.rgb = mix(m.rgb, gHz * m.a, 1.0 - exp(-t * 0.0046));
    return m;
  }
  if (abs(dv) > 105.0) return vec4(0.0);
  float fi = float(i), off = fi * 4.7;
  float c = floor((dv + off) / 10.0);
  float u = dv + off - (c + 0.5) * 10.0;
  float seed = hash21(vec2(c, fi * 7.0 + 1.0));
  if (seed < 0.2 || abs(dv) > 95.0 - 25.0 * fract(seed * 5.0)) return vec4(0.0);
  vec4 h = house(u - (fract(seed * 3.0) - 0.5) * 2.4, p.y, seed, fp);
  // a round tree in some yards
  if (fract(seed * 31.0) > 0.6) {
    vec2 tq = vec2(u + 4.2 * (fract(seed * 41.0) - 0.5), p.y - 3.4);
    float tr = length(tq * vec2(1.0, 1.15)) - 2.2 - 0.5 * noise(tq * 2.0 + seed * 30.0);
    float ta = ss(fp, -fp, tr) * (1.0 - h.a);
    vec3 tc = vec3(0.12, 0.15, 0.06) + vec3(0.9, 0.7, 0.3) * 0.35 * ss(0.0, -2.2, tq.x);
    h = vec4(h.rgb + tc * ta, h.a + ta);
  }
  h.rgb = mix(h.rgb, gHz * h.a, 1.0 - exp(-t * 0.0046));
  return h;
}

// the bales against the light: the end toward us in shade with its spiral, the rim burning
vec4 baleRow(vec3 p, float t) {
  if (p.y > 1.6) return vec4(0.0);
  float fp = gPx / gLens * t;
  vec2 q;
  float d = baleAt(p.x + gTravel, p.y, q);
  float a = ss(fp, -fp, d);
  if (a < 0.003) return vec4(0.0);
  float r = length(q);
  vec3 c = vec3(0.3, 0.19, 0.08) * (0.85 + 0.15 * sin(r * 48.0 + atan(q.y, q.x) * 0.5)) * (0.8 + 0.3 * ss(-0.7, 0.7, q.y));
  float rim = ss(-0.1, 0.0, d) * (0.4 + 0.6 * ss(-0.2, 0.9, dot(q / max(r, 1e-3), normalize(vec2(-0.35, 1.0)))));
  c += vec3(1.1, 0.72, 0.3) * rim * (0.5 + 0.8 * pow(sunward(gRd), 6.0));
  return fogged(c, a, t);
}
vec4 rowLayer(int i, vec3 p, float t) {
  int kind = ROWK[i];
  if (p.y < -0.2) return vec4(0.0);
  if (kind == 0) return gPostOn > 0.0 ? postRow(p, t) : vec4(0.0);
  if (kind == 1) return sunflowerRow(i, p, t);
  if (kind == 2) return poplarRow(i, p, t);
  if (kind == 5) return baleRow(p, t);
  return villageRow(i, p, t);
}
vec3 world(vec3 ro, vec3 rd) {
  gRd = rd;
  float tG = rd.y < -1e-4 ? -ro.y / rd.y : 1e9;
  vec3 col = tG < 1e8 ? groundCol(ro + rd * tG, rd, tG) : hills(rd, skyCol(rd));
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 12; i++) {
    float t = (ROWZ[i] - ro.z) / rd.z;
    if (t > tG) break;
    if (t <= 0.0) continue;
    vec4 layer = rowLayer(i, ro + rd * t, t);
    acc.rgb += (1.0 - acc.a) * layer.rgb;
    acc.a += (1.0 - acc.a) * layer.a;
    if (acc.a > 0.985) break;
  }
  return col * (1.0 - acc.a) + acc.rgb;
}

// ── the light that comes in ────────────────────────────────────────────────────────────────────
// how much of the sun reaches P through the opening: the hole in the wall, then the glass inside
// its frame, past the bar of the top light
float aperture(vec3 P) {
  float a = 1.0;
  if (P.z > 0.0) a = ss(0.006, -0.006, rbox(P.xy - gSunC.xy * P.z / gSunC.z - gWin.xy, gWin.zw, CORNER));
  vec2 G = P.xy + gSunC.xy * (GLASS_Z - P.z) / gSunC.z;
  a *= ss(0.006, -0.006, rbox(G - gWin.xy, gWin.zw - FRAME, CORNER - FRAME));
  return a * ss(0.012, 0.02, abs(G.y - gVent));
}
// and then whether the beat's signal post or a poplar stands between it and the sun out there
float outside(vec3 P, float soft) {
  float T = 1.0;
  if (gPostOn > 0.0) {
    vec3 Q = P + gSunW * ((POST_Z - P.z) / gSunW.z);
    T *= 1.0 - 0.9 * gPostOn * postCover(Q.x - gPostX, Q.y + LIFT, 0.04);
  }
  vec3 Q = P + gSunW * ((POPLAR_Z - P.z) / gSunW.z);
  vec3 info;
  return T * (1.0 - poplar(6, Q.x + gTravel, Q.y + LIFT, soft, info));
}
vec3 sunAt(vec3 P, vec3 n, float soft) {
  float ndl = dot(n, gSunC);
  if (ndl <= 0.0) return vec3(0.0);
  float a = aperture(P);
  if (a <= 0.0) return vec3(0.0);
  return SUN * 2.5 * sqrt(ndl) * a * outside(P, soft);
}
// the light in the compartment that is not the sun: the window's glow, the sunlit floor and seats
// behind us throwing warmth back (it dims when a poplar takes the sun), a cooler light off the
// ceiling, and the beat's glint running along
vec3 fillAt(vec3 P, vec3 n) {
  vec3 w = vec3(gWin.x, gWin.y, -0.06) - P;
  float d2 = dot(w, w);
  float f = clamp((dot(n, w) * inversesqrt(d2) + 0.2) / 1.2, 0.0, 1.0);
  vec3 c = vec3(0.92, 0.8, 0.7) * f * (gWin.z * gWin.w * 2.2) / (0.25 + d2 * 2.0);
  c += vec3(0.34, 0.22, 0.13) * (0.45 + 0.55 * gRoomVis) * (0.55 + 0.3 * n.z - 0.15 * n.y);
  c += vec3(0.12, 0.13, 0.17) * (0.7 + 0.3 * n.y);
  // the beat: the glint off the passing signal runs along the room, its lamp tints the light
  float dx = P.x - gFlashX;
  return c + (vec3(1.0, 0.85, 0.6) * 0.8 * exp(-dx * dx / 0.06) + gLampCol * 0.16 * (0.3 + f)) * gFlash;
}

// the tulip glass: half width against height (0 foot, 1 rim), in metres before PROP
float teaR(float h) {
  return 0.0215 + 0.0075 * exp(-(h - 0.22) * (h - 0.22) / 0.03) - 0.0035 * exp(-(h - 0.62) * (h - 0.62) / 0.02) + 0.0085 * ss(0.68, 1.0, h);
}
// the shadows the glass, its saucer and the simit throw on the table; the tea throws a ruby caustic
vec3 objShadow(vec3 P) {
  vec2 dir = normalize(gSunC.xz);
  float rise = gSunC.y / length(gSunC.xz);
  vec3 m = vec3(1.0);
  vec2 rel = gTea.xz - P.xz;
  float along = dot(rel, dir), perp = abs(rel.x * dir.y - rel.y * dir.x);
  if (along > 0.0) {
    float h = (along * rise + P.y - gTea.y) / PROP;
    float pen = 0.001 + along * 0.01;
    float r = teaR(clamp(h / 0.095, 0.0, 1.0)) * PROP;
    float inG = ss(r + pen, r - pen, perp) * ss(0.097, 0.093, h) * step(0.0, h);
    vec3 tint = h < 0.095 * 0.8 ? vec3(0.1, 0.025, 0.01) + vec3(1.6, 0.36, 0.07) * ss(r * 0.8, 0.0, perp) : vec3(0.62, 0.64, 0.6);
    m *= mix(vec3(1.0), tint, inG);
    float hs = along * rise + P.y - gTableY;
    m *= 1.0 - 0.8 * ss(0.054 * PROP + pen, 0.054 * PROP - pen, perp) * step(hs, 0.006 * PROP) * step(0.0, hs);
  }
  for (int k = 0; k < 3; k++) {
    float hk = (0.006 + 0.011 * float(k)) * PROP;
    float s = (hk - (P.y - gTableY)) / rise;
    if (s < 0.0) continue;
    vec2 X2 = P.xz + dir * s;
    float rr = sqrt(max(0.0, 0.0165 * 0.0165 - (hk / PROP - 0.0175) * (hk / PROP - 0.0175))) * PROP;
    float pen = 0.001 + s * 0.01;
    m *= 1.0 - 0.85 * ss(rr + pen, rr - pen, abs(length(X2 - gSim.xz) - 0.056 * PROP));
  }
  return m;
}

// shafts of sunlight hanging in the air. The stretch of the eye's ray whose way to the sun passes
// the opening is found exactly (two rectangles, seen along the sun); only the shadows out there
// are sampled along it
vec3 shafts(vec3 ro, vec3 rd, float tEnd) {
  float t0 = 0.0, t1 = tEnd;
  for (int k = 0; k < 2; k++) {
    float Z = k == 0 ? 0.0 : GLASS_Z;
    vec2 A = ro.xy + gSunC.xy * (Z - ro.z) / gSunC.z;
    vec2 B = rd.xy - gSunC.xy * rd.z / gSunC.z;
    B = vec2(abs(B.x) < 1e-5 ? 1e-5 : B.x, abs(B.y) < 1e-5 ? 1e-5 : B.y);
    vec2 hs = gWin.zw - (k == 0 ? 0.0 : FRAME);
    vec2 lo = (gWin.xy - hs - A) / B, hi = (gWin.xy + hs - A) / B;
    vec2 tn = min(lo, hi), tx = max(lo, hi);
    t0 = max(t0, max(tn.x, tn.y));
    t1 = min(t1, min(tx.x, tx.y));
  }
  if (t1 <= t0) return vec3(0.0);
  float j = ign(gl_FragCoord.xy), acc = 0.0;
  for (int i = 0; i < 6; i++) {
    vec3 P = ro + rd * mix(t0, t1, (float(i) + j) / 6.0);
    vec2 G = P.xy + gSunC.xy * (GLASS_Z - P.z) / gSunC.z;
    acc += outside(P, 0.3) * ss(0.012, 0.02, abs(G.y - gVent));
  }
  float c = dot(rd, gSunC), g = 0.6;
  float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5) * 0.045;
  return SUN * acc / 6.0 * (t1 - t0) * (0.35 + 1.1 * gMid) * phase;
}
// dust drifting in four planes of the room's air: it shows only where the sun catches it, and
// glitters with the highs; the nearest specks are out of focus
vec3 dust(vec3 ro, vec3 rd, float tEnd) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float Z = 0.08 + (ro.z - 0.28) * fi / 3.0;
    float t = (Z - ro.z) / rd.z;
    if (t <= 0.0 || t > tEnd) continue;
    vec3 P = ro + rd * t;
    float cs = 0.05 + 0.03 * fi;
    vec2 g = (P.xy + vec2(uTime * 0.011 * (1.0 + fi * 0.4), uTime * 0.004 + 0.03 * sin(uTime * 0.21 + fi))) / cs + fi * 17.3;
    vec2 id = floor(g);
    float h = hash21(id + fi * 31.0);
    if (h < 0.72 - 0.22 * gHigh) continue;
    vec2 o = 0.25 + 0.5 * vec2(hash21(id + 3.1), hash21(id + 5.7)) + 0.06 * sin(uTime * (0.4 + h) + h * 40.0 + vec2(0.0, 1.7));
    vec2 d = (fract(g) - o) * cs;
    float pxm = gPx * (ro.z - Z) / gLens;
    float rad = max(0.0006 + abs(Z - 0.35) * 0.0035, pxm * 0.8);
    float m = exp(-dot(d, d) / (rad * rad)) * min(1.0, 0.0026 * 0.0026 / (rad * rad));
    if (m < 0.004) continue;
    vec3 M = vec3(P.xy - d, Z);
    float lit = aperture(M);
    if (lit > 0.0) lit *= outside(M, 0.3);
    float tw = 0.5 + 0.5 * sin(uTime * (3.0 + 6.0 * h) + h * 60.0);
    col += vec3(1.0, 0.78, 0.48) * m * (0.004 + 0.5 * gHigh * tw * tw + lit * (0.45 + 3.5 * gHigh * tw * tw));
  }
  return col;
}

// ── the compartment ────────────────────────────────────────────────────────────────────────────
// a ray against a box: the distance in and out, and the normal of the face it comes in by
vec2 boxT(vec3 ro, vec3 rd, vec3 lo, vec3 hi, out vec3 n) {
  vec3 s = vec3(rd.x < 0.0 ? -1.0 : 1.0, rd.y < 0.0 ? -1.0 : 1.0, rd.z < 0.0 ? -1.0 : 1.0);
  vec3 inv = s / max(abs(rd), vec3(1e-6));
  vec3 t1 = (lo - ro) * inv, t2 = (hi - ro) * inv;
  vec3 tn = min(t1, t2), tf = max(t1, t2);
  float a = max(max(tn.x, tn.y), tn.z), b = min(min(tf.x, tf.y), tf.z);
  n = a == tn.x ? vec3(-s.x, 0.0, 0.0) : (a == tn.y ? vec3(0.0, -s.y, 0.0) : vec3(0.0, 0.0, -s.z));
  return vec2(a, b);
}
// the curtains, gathered either side of the window by a tie, their hems swinging with the
// carriage: a curtain's inner and outer edge at height y, as distances from the middle
vec2 curtainEdges(float y, float side) {
  float swing = side * gSwing * ss(gTieY, gBotY, y);
  return vec2(gWin.z + 0.035 - 0.16 * pow(ss(gTieY, gRodY, y), 1.3) - 0.05 * ss(gTieY, gBotY, y) + swing,
              min(gWin.z + 0.21, XW - BACK - 0.015) + swing);
}
// the distance (m) from a curtain's outline at p in its plane, negative inside; u runs across it
float curtain(vec2 p, out float u) {
  float side = p.x < 0.0 ? -1.0 : 1.0, ax = abs(p.x);
  vec2 e = curtainEdges(p.y, side);
  u = (ax - e.x) / (e.y - e.x);
  return max(max(e.x - ax, ax - e.y), max(p.y - gRodY, gBotY - p.y));
}
// the wall round the window
vec3 wallShade(vec3 P, float d0) {
  vec3 n = vec3(0.0, 0.0, 1.0);
  float y = P.y;
  float g = noise(vec2(P.x * 3.0, y * 90.0)) * 0.6 + noise(vec2(P.x * 11.0, y * 260.0)) * 0.4;
  vec3 alb = vec3(0.6, 0.7, 0.62) * (0.96 + 0.04 * noise(P.xy * 40.0));          // old railway celadon paint
  float panel = gTableY - 0.1;
  alb = mix(alb, vec3(0.44, 0.25, 0.12) * (0.78 + 0.32 * g), ss(panel + 0.002, panel - 0.002, y));
  // the heater grille along the floor
  float gr = step(abs(P.x), gTableW + 0.22) * ss(0.335, 0.33, y) * ss(0.09, 0.095, y);
  float slot = ss(0.25, 0.55, abs(fract(y / 0.024) - 0.5) * 2.0);
  alb = mix(alb, vec3(0.5, 0.48, 0.45) * mix(0.45, 1.0, slot), gr);
  // a raised moulding round the opening
  float ring = ss(0.0, 0.003, d0) * ss(0.036, 0.032, d0);
  alb = mix(alb, vec3(0.86, 0.8, 0.68), ring * 0.85);
  vec3 L = fillAt(P, n);
  // the table shades the wall under it; its sunlit top throws a glow up the wall over it
  float under = step(y, gTableY) * ss(gTableW + 0.12, gTableW - 0.05, abs(P.x));
  L *= 1.0 - 0.5 * under * ss(gTableY - 0.55, gTableY - 0.03, y);
  L += SUN * 0.22 * gRoomVis * exp(-max(y - gTableY, 0.0) * 7.0) * step(gTableY, y) * ss(gTableW + 0.25, gTableW - 0.15, abs(P.x - 0.08));
  L *= 1.0 - 0.35 * ss(0.006, 0.0, d0) * ss(-0.001, 0.0, d0);       // the shadowed lip of the moulding
  float uc;
  float dc = curtain(vec2(P.x, y), uc);
  L *= 1.0 - 0.3 * ss(0.12, -0.02, dc);                             // the curtains keep light off the wall behind them
  vec3 c = alb * L;
  // a brass strip along the top of the panel
  float strip = ss(0.008, 0.005, abs(y - panel));
  c = mix(c, vec3(0.75, 0.55, 0.25) * L * 1.1 + vec3(0.25, 0.18, 0.08) * ss(0.0, 0.004, y - panel), strip);
  return c;
}
// the reveal of the opening: the wall's thickness, sunlit where the sun comes in
vec3 revealShade(vec3 P, vec3 n) {
  vec3 alb = vec3(0.84, 0.78, 0.67);
  float deep = ss(0.0, GLASS_Z, P.z);
  vec3 L = sunAt(P, n, 0.15) + fillAt(P, n) * (1.0 - 0.35 * deep) + vec3(0.25, 0.2, 0.16) * 0.6;
  return alb * L;
}
// the window: the frame round the glass, the glass, the bar of the top light
vec3 glassShade(vec3 ro, vec3 rd, vec3 Pg) {
  vec3 col = world(vec3(ro.x, ro.y + LIFT, ro.z), toWorld(rd));
  vec2 g = (Pg.xy - gWin.xy) / gWin.zw;
  // the dust on the glass catches the sun; a faint reflection of the warm compartment
  float dirt = noise(Pg.xy * 9.0) * 0.6 + noise(Pg.xy * 31.0 + 3.0) * 0.4;
  float near = exp(-length(toWorld(rd) - gSunW) * 12.0);
  col = col * 0.93 + vec3(1.0, 0.68, 0.36) * near * (0.06 + 0.16 * ss(0.4, 0.8, dirt));
  col += vec3(0.07, 0.045, 0.03) * ss(-0.3, -1.0, g.y) * (0.6 + 0.4 * dirt);
  return col;
}
vec3 frameShade(vec3 P, float dgl) {
  vec3 alb = vec3(0.62, 0.62, 0.62);
  vec3 L = fillAt(P, vec3(0.0, 0.0, 1.0)) * 0.9 + vec3(0.18, 0.16, 0.15);
  vec3 c = alb * L * (0.85 + 0.15 * ss(0.0, FRAME, dgl));
  return mix(c * 0.25, c, ss(0.003, 0.008, dgl));                 // the rubber gasket against the glass
}
vec3 holeShade(vec3 ro, vec3 rd, float t0) {
  vec3 P0 = ro + rd * t0;
  float tg = (GLASS_Z - ro.z) / rd.z;
  vec3 Pg = ro + rd * tg;
  if (rbox(Pg.xy - gWin.xy, gWin.zw, CORNER) > 0.0) {
    // the ray meets a side of the opening before the glass: find where
    float a = 0.0, b = 1.0;
    for (int i = 0; i < 8; i++) {
      float mm = 0.5 * (a + b);
      if (rbox(mix(P0.xy, Pg.xy, mm) - gWin.xy, gWin.zw, CORNER) > 0.0) b = mm; else a = mm;
    }
    vec3 P = mix(P0, Pg, 0.5 * (a + b));
    vec2 e = vec2(0.002, 0.0), q = P.xy - gWin.xy;
    vec2 gr = vec2(rbox(q + e.xy, gWin.zw, CORNER) - rbox(q - e.xy, gWin.zw, CORNER), rbox(q + e.yx, gWin.zw, CORNER) - rbox(q - e.yx, gWin.zw, CORNER));
    return revealShade(P, vec3(-normalize(gr), 0.0));
  }
  float dgl = rbox(Pg.xy - gWin.xy, gWin.zw - FRAME, CORNER - FRAME);
  float fw = tg * gPx / gLens;
  float aG = ss(fw, -fw, dgl);
  float bar = ss(0.016 + fw, 0.016 - fw, abs(Pg.y - gVent));      // the bar of the top light
  aG *= 1.0 - bar;
  vec3 c = vec3(0.0);
  if (aG < 1.0) c = frameShade(Pg, max(dgl, min(0.016 - abs(Pg.y - gVent), 0.02)));
  if (aG > 0.0) c = mix(c, glassShade(ro, rd, Pg), aG);
  gGlass = aG;
  return c;
}
// the far shell: the window wall (1), the partitions (8), the floor (9), the ceiling (11)
float shell(vec3 ro, vec3 rd, out vec3 n, out float m) {
  float tz = -ro.z / min(rd.z, -1e-5);
  float tx = ((rd.x > 0.0 ? XW : -XW) - ro.x) / (rd.x > 0.0 ? max(rd.x, 1e-5) : min(rd.x, -1e-5));
  float ty = rd.y < 0.0 ? -ro.y / min(rd.y, -1e-5) : (CEIL - ro.y) / max(rd.y, 1e-5);
  float t = tz;
  n = vec3(0.0, 0.0, 1.0); m = 1.0;
  if (tx < t) { t = tx; n = vec3(rd.x > 0.0 ? -1.0 : 1.0, 0.0, 0.0); m = 8.0; }
  if (ty < t) { t = ty; n = vec3(0.0, rd.y < 0.0 ? 1.0 : -1.0, 0.0); m = rd.y < 0.0 ? 9.0 : 11.0; }
  return t;
}
vec3 velvet(vec3 P, vec3 n, vec3 rd, vec3 alb) {
  float sheen = pow(1.0 - abs(dot(n, rd)), 2.0);
  vec3 L = sunAt(P, n, 0.2) + fillAt(P, n);
  return alb * L * (0.75 + 0.6 * sheen);
}
vec3 surfaceShade(vec3 P, vec3 n, float m, vec3 rd) {
  if (m == 5.0) {
    // the fold-down table: honey-coloured laminate, an aluminium edge
    if (n.y > 0.5) {
      float g = noise(vec2(P.x * 4.0, P.z * 70.0)) * 0.6 + noise(vec2(P.x * 13.0, P.z * 190.0)) * 0.4;
      vec3 alb = vec3(0.5, 0.29, 0.13) * (0.82 + 0.3 * g);
      vec3 L = sunAt(P, n, 0.12) * objShadow(P) + fillAt(P, n);
      vec3 c = alb * L;
      // the glossy top mirrors the bright window a little
      c += vec3(0.5, 0.42, 0.34) * 0.12 * exp(-P.z * 7.0) * ss(gWin.z + 0.1, gWin.z - 0.3, abs(P.x));
      return c;
    }
    vec3 L = fillAt(P, n) + sunAt(P, n, 0.12);
    return vec3(0.6, 0.6, 0.62) * L * (0.7 + 0.3 * ss(gTableY - 0.028, gTableY - 0.01, P.y));
  }
  if (m == 6.0 || m == 7.0) {
    // the benches, in teal velvet with a white cloth over each headrest
    vec3 alb = vec3(0.07, 0.25, 0.27);
    float sx = P.x < 0.0 ? -1.0 : 1.0;
    if (abs(n.x) > 0.5) {
      // the faces toward the aisle: tufted channels running up the back, a rounded top edge
      float ch = fract(P.z / 0.16);
      n = normalize(n + vec3(0.0, 0.0, 0.5 * sin(ch * TAU)) * step(m, 6.5) * 0.0 + vec3(0.0, 0.0, 0.45 * sin(ch * TAU)) * step(6.5, m));
      float top = m == 7.0 ? ss(BACKTOP - 0.07, BACKTOP, P.y) : ss(SEAT - 0.05, SEAT, P.y);
      n = normalize(n + vec3(0.0, 1.2 * top, 0.0));
      alb *= 1.0 - 0.3 * ss(0.08, 0.0, abs(ch - 0.5) - 0.42) * step(6.5, m);
      if (m == 6.0 && P.y < SEAT - 0.14) alb = vec3(0.07, 0.06, 0.055);
    } else if (n.y > 0.5) {
      float edge = ss(0.06, 0.0, abs(abs(P.x) - (m == 7.0 ? XW - BACK : XW - BENCH)));
      n = normalize(n + vec3(-sx * 1.2 * edge, 0.0, 0.0));
    }
    vec3 c = velvet(P, n, rd, alb);
    return c * (0.75 + 0.25 * ss(0.0, 1.2, P.y));
  }
  if (m == 8.0) return vec3(0.6, 0.7, 0.62) * (sunAt(P, n, 0.2) + fillAt(P, n));
  if (m == 9.0) return vec3(0.16, 0.1, 0.07) * (sunAt(P, n, 0.2) + fillAt(P, n));
  return vec3(0.82, 0.8, 0.72) * fillAt(P, n);
}
vec3 curtainShade(vec3 P, float u, float dc, vec3 rd) {
  float side = P.x < 0.0 ? -1.0 : 1.0;
  float ph = u * 3.6 * TAU + side * 0.8 + 0.7 * sin(u * 9.0 + P.y * 2.3 + side);
  float f = sin(ph);
  vec2 e = curtainEdges(P.y, side);
  float slope = clamp(0.022 * (3.6 * TAU + 6.3 * cos(u * 9.0 + P.y * 2.3 + side)) / max(e.y - e.x, 0.05) * cos(ph), -2.5, 2.5);
  vec3 n = normalize(vec3(-slope * side, 0.0, 1.0));
  vec3 alb = mix(vec3(0.5, 0.2, 0.04), vec3(0.9, 0.52, 0.12), 0.55 + 0.45 * f);
  vec3 c = alb * fillAt(P, n) * (0.7 + 0.3 * f);
  // the sun through the cloth from behind, and the bright window behind it
  float vis = aperture(P);
  if (vis > 0.0) vis *= outside(P, 0.25);
  float T = 0.55 + 0.25 * f;
  float behind = ss(0.01, -0.02, rbox(P.xy - gWin.xy, gWin.zw, CORNER));
  c += vec3(1.0, 0.5, 0.1) * T * (SUN * 1.6 * vis + vec3(0.55, 0.42, 0.3) * behind);
  // the tie and the hem
  float tie = ss(0.022, 0.016, abs(P.y - gTieY));
  c = mix(c, vec3(0.42, 0.12, 0.05) * fillAt(P, vec3(0.0, 0.0, 1.0)) + vec3(0.3, 0.1, 0.02) * vis, tie);
  c *= 1.0 - 0.3 * ss(gBotY + 0.04, gBotY + 0.03, P.y);
  return c * (1.0 - 0.25 * ss(-0.02, 0.0, dc));
}

// ── the things on the table ────────────────────────────────────────────────────────────────────
float teaSDF(vec3 q) {                 // q from the glass's foot, before PROP
  float d = (length(q.xz) - teaR(clamp(q.y / 0.095, 0.0, 1.0))) * 0.8;
  return max(d, max(-q.y, q.y - 0.095));
}
float simitSDF(vec3 q) {               // q from the simit's middle; the dough is a twisted rope
  vec2 tq = vec2(length(q.xz) - 0.056, q.y);
  return length(tq) - 0.0165 - 0.0016 * sin(atan(q.z, q.x) * 13.0 + atan(tq.y, tq.x) * 2.0);
}
vec2 props(vec3 p) {
  vec3 qs = p - vec3(gTea.x, gTableY, gTea.z);
  vec2 d2 = vec2(length(qs.xz) - 0.053 * PROP, abs(qs.y - 0.003 * PROP) - 0.0025 * PROP);
  float sau = min(max(d2.x, d2.y), 0.0) + length(max(d2, 0.0)) - 0.0008 * PROP;
  vec2 r = vec2(sau, 2.0);
  float tea = teaSDF((p - gTea) / PROP) * PROP;
  if (tea < r.x) r = vec2(tea, 1.0);
  float sim = simitSDF((p - gSim) / PROP) * PROP;
  if (sim < r.x) r = vec2(sim, 3.0);
  // the teaspoon leaning in the glass
  vec3 qt = (p - gTea) / PROP, sa = vec3(0.004, 0.03, 0.003), sb = vec3(0.036, 0.13, -0.012);
  vec3 pa = qt - sa, ba = sb - sa;
  float sp = (length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - 0.0021) * PROP;
  if (sp < r.x) r = vec2(sp, 4.0);
  return r;
}
vec3 propNormal(vec3 p) {
  vec2 e = vec2(0.0005, -0.0005);
  return normalize(e.xyy * props(p + e.xyy).x + e.yyx * props(p + e.yyx).x + e.yxy * props(p + e.yxy).x + e.xxx * props(p + e.xxx).x);
}
vec3 shadeTea(vec3 rd, vec3 q, vec3 behind, vec3 P) {
  vec2 e = vec2(0.0004, 0.0);
  vec3 n = normalize(vec3(teaSDF(q + e.xyy) - teaSDF(q - e.xyy), teaSDF(q + e.yxy) - teaSDF(q - e.yxy), teaSDF(q + e.yyx) - teaSDF(q - e.yyx)));
  float vis = aperture(gTea + vec3(0.0, 0.07, 0.0)) * outside(gTea + vec3(0.0, 0.07, 0.0), 0.15);
  float h = q.y / 0.095;
  float level = 0.8;
  vec3 c;
  if (n.y > 0.8) {
    // looking into the glass: the tea's surface, the sun in it, rings when the bass knocks the carriage
    float rho = length(q.xz) / teaR(1.0);
    float rings = sin(rho * 30.0 - uTime * 11.0) * exp(-rho * 1.5) * gBass;
    c = vec3(0.16, 0.03, 0.01) * (0.6 + 0.3 * rings) + vec3(1.2, 0.5, 0.2) * vis * 0.4 * ss(0.4, 1.0, rho) * (0.7 + 0.5 * rings);
    return mix(c, vec3(0.9, 0.8, 0.7) * (0.5 + vis), ss(0.86, 0.98, rho));
  }
  vec3 side = normalize(vec3(-rd.z, 0.0, rd.x));
  float r = teaR(clamp(h, 0.0, 1.0));
  float xi = clamp(dot(q.xz, side.xz) / r, -1.0, 1.0);
  float chord = 2.0 * r * sqrt(1.0 - xi * xi) * PROP;
  if (h < level) {
    // tea: deep red, glowing ruby where the low sun shines through it
    vec3 tr = exp(-vec3(22.0, 70.0, 140.0) * chord);
    c = behind * tr + vec3(0.09, 0.02, 0.008);
    c += vec3(1.25, 0.12, 0.02) * vis * (0.25 + 0.75 * ss(-0.7, 1.0, xi)) * (1.0 - exp(-55.0 * chord)) * 0.75;
    c += vec3(1.3, 0.45, 0.12) * 0.2 * ss(level - 0.06, level, h) * vis;
  } else {
    c = behind * vec3(0.9, 0.92, 0.9) + 0.03;
  }
  float fres = pow(1.0 - abs(dot(n, -rd)), 4.0);
  c += vec3(0.95, 0.75, 0.55) * 0.55 * fres;
  c += vec3(1.0, 0.86, 0.7) * 0.55 * exp(-(xi + 0.62) * (xi + 0.62) / 0.008) * ss(0.05, 0.25, h);   // the window in it
  c += SUN * 4.0 * pow(max(dot(reflect(rd, n), gSunC), 0.0), 90.0) * vis;
  float rim = ss(0.95, 1.0, h);
  return c + vec3(0.9, 0.85, 0.75) * rim * (0.35 + 0.6 * vis + 1.5 * gHigh * pow(0.5 + 0.5 * sin(uTime * 7.0 + xi * 6.0), 6.0));
}
vec3 shadeSimit(vec3 rd, vec3 p, vec3 n) {
  vec3 q = (p - gSim) / PROP;
  float ang = atan(q.z, q.x);
  vec2 tq = vec2(length(q.xz) - 0.056, q.y);
  float tub = atan(tq.y, tq.x);
  float rope = 0.5 + 0.5 * sin(ang * 13.0 + tub * 2.0);
  vec3 alb = mix(vec3(0.34, 0.12, 0.035), vec3(0.72, 0.36, 0.11), rope) * (0.9 + 0.2 * ss(-0.5, 1.0, n.y));
  // sesame seeds
  vec2 sg = vec2(ang * 18.0, tub * 2.6);
  vec2 sid = floor(sg);
  vec2 sf = fract(sg) - 0.5 - (vec2(hash21(sid + 2.3), hash21(sid + 7.1)) - 0.5) * 0.4;
  float seed = step(0.2, hash21(sid)) * ss(0.24, 0.15, length(sf * vec2(1.7, 1.0)));
  alb = mix(alb, vec3(0.95, 0.85, 0.6), seed * ss(-0.3, 0.3, n.y));
  float vis = aperture(p + n * 0.002);
  if (vis > 0.0) vis *= outside(p, 0.15);
  vec3 c = alb * (fillAt(p, n) * (0.55 + 0.45 * ss(-0.6, 0.6, n.y)) + SUN * 3.0 * sqrt(max(dot(n, gSunC), 0.0)) * vis);
  return c + SUN * 0.35 * pow(max(dot(reflect(rd, n), gSunC), 0.0), 24.0) * vis;
}
vec3 shadeSaucer(vec3 rd, vec3 p, vec3 n) {
  vec3 alb = vec3(0.9, 0.88, 0.84);
  float rr = length(p.xz - gTea.xz) / PROP;
  alb = mix(alb, vec3(0.75, 0.5, 0.15), ss(0.0015, 0.0005, abs(rr - 0.046)) * step(0.5, n.y));
  vec3 L = sunAt(p, n, 0.12) * objShadow(p) + fillAt(p, n);
  return alb * L + SUN * 0.6 * pow(max(dot(reflect(rd, n), gSunC), 0.0), 60.0);
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gAsp = uRes.x / uRes.y;
  gPf = ss(1.15, 0.72, gAsp);                               // 1 for a phone held upright
  gPx = 2.0 / uRes.y;
  float run = uCruise * SPEED;
  gTravel = mod(run, PERIOD);
  gFar = mod(run, FARLOOP);
  gHz = vec3(0.9, 0.68, 0.5);

  // the carriage rides the rails: a slow lean through the curves, the knock of each rail joint,
  // and the bass swaying it
  float knock = exp(-fract(run / 18.0) * 30.0);
  gPitch = 0.0025 * knock + 0.010 * gBass + 0.006 * gHit;
  gRoll = 0.005 * sin(uTime * 0.29) + 0.0035 * sin(uTime * 0.71 + 2.0) + 0.009 * gBass * sin(uTime * 1.3);
  gSwing = (gRoll * 2.5 + 0.012 * sin(uTime * 0.9)) * 1.0;           // the curtains' hems swing with the carriage
  gSunW = normalize(vec3(-0.29, 0.192, -0.94));
  gSunC = toCar(gSunW);

  // the layout: a wide window over the table, or a tall one on a phone
  gWin = mix(vec4(0.0, 1.25, 0.70, 0.43), vec4(0.0, 1.32, 0.45, 0.53), gPf);
  gVent = gWin.y + gWin.w * 0.42;
  gTableY = 0.78; gTableD = mix(0.42, 0.48, gPf); gTableW = mix(0.36, 0.32, gPf);
  gRodY = gWin.y + gWin.w + 0.1;
  gTieY = gWin.y - gWin.w * 0.25;
  gBotY = gTableY - 0.14;
  gTea = vec3(mix(0.1, 0.1, gPf), gTableY + 0.006 * PROP, mix(0.27, 0.31, gPf));
  gSim = vec3(mix(-0.17, -0.12, gPf), gTableY + 0.0165 * PROP + 0.001, mix(0.23, 0.27, gPf));

  // the beat: a signal post whips past, its lamp flashing, the glint off it running along the wall
  float age = uBeatAge, s = clamp(age / 0.34, 0.0, 1.0);
  gPostOn = uAudioActive * step(age, 0.34);
  gPostX = mix(4.5, -5.0, s);
  gFlash = uAudioActive * uPunch * (1.0 - s) * exp(-age * 7.0) * step(age, 0.34);
  gFlashX = mix(1.3, -1.3, s);
  gLampCol = hash11(uBeatCount * 3.1) > 0.7 ? vec3(1.8, 0.75, 0.1) : vec3(0.2, 1.7, 0.55);
  gRoomVis = outside(vec3(0.2, 0.5, 1.4), 0.4);

  vec3 ro = mix(vec3(0.0, 1.16, 0.98), vec3(0.0, 1.17, 0.98), gPf);
  vec3 at = mix(vec3(0.0, 1.075, 0.0), vec3(0.0, 0.99, 0.0), gPf);
  gLens = mix(1.55, 1.05, gPf);
  vec3 rd = viewRay(ro, at, uv, gLens);
  float pa = gPx / gLens;

  // the shell, then the benches and the table in front of it
  vec3 n; float m;
  float t = shell(ro, rd, n, m);
  {
    float sx = rd.x < 0.0 ? -1.0 : 1.0;
    vec3 r2 = vec3(ro.x * sx, ro.y, ro.z), d2 = vec3(rd.x * sx, rd.y, rd.z), nn;
    vec2 h = boxT(r2, d2, vec3(XW - BENCH, 0.0, 0.0), vec3(XW, SEAT, 3.0), nn);
    if (h.x < h.y && h.x > 0.0 && h.x < t) { t = h.x; n = nn * vec3(sx, 1.0, 1.0); m = 6.0; }
    h = boxT(r2, d2, vec3(XW - BACK, SEAT - 0.02, 0.0), vec3(XW, BACKTOP, 3.0), nn);
    if (h.x < h.y && h.x > 0.0 && h.x < t) { t = h.x; n = nn * vec3(sx, 1.0, 1.0); m = 7.0; }
    h = boxT(ro, rd, vec3(-gTableW, gTableY - 0.028, 0.0), vec3(gTableW, gTableY, gTableD), nn);
    if (h.x < h.y && h.x > 0.0 && h.x < t) { t = h.x; n = nn; m = 5.0; }
  }
  vec3 P = ro + rd * t;
  vec3 col;
  gGlass = 0.0;
  if (m == 1.0) {
    float fw = t * pa;
    float d0 = rbox(P.xy - gWin.xy, gWin.zw, CORNER);
    float aw = ss(-fw * 0.7, fw * 0.7, d0);
    col = vec3(0.0);
    if (aw > 0.0) col = wallShade(P, d0) * aw;
    if (aw < 1.0) col += holeShade(ro, rd, t) * (1.0 - aw);
  } else {
    col = surfaceShade(P, n, m, rd);
  }

  // the curtains and their brass rod
  float tc = (ZC - ro.z) / rd.z;
  if (tc > 0.0 && tc < t) {
    vec3 Pc = ro + rd * tc;
    float u;
    float dc = curtain(Pc.xy, u);
    float ac = ss(tc * pa, -tc * pa, dc);
    if (ac > 0.0) { col = mix(col, curtainShade(Pc, u, dc, rd), ac); if (ac > 0.5) t = tc; }
  }
  {
    vec2 o = ro.yz - vec2(gRodY + 0.012, ZC);
    float l = length(rd.yz);
    vec2 dir = rd.yz / l;
    float along = -dot(o, dir);
    vec2 cl = o + dir * along;
    float tr = along / l;
    float dd = length(cl) - 0.011;
    vec3 Pr = ro + rd * tr;
    float ar = tr > 0.0 && tr < t ? ss(tr * pa, -tr * pa, dd) * step(abs(Pr.x), min(gWin.z + 0.27, XW - 0.05)) : 0.0;
    if (ar > 0.0) {
      vec3 nr = normalize(vec3(0.0, cl));
      vec3 brass = vec3(0.78, 0.56, 0.26) * (fillAt(Pr, nr) * 0.8 + 0.1) + vec3(1.0, 0.8, 0.5) * 0.5 * pow(max(dot(reflect(rd, nr), normalize(vec3(0.0, -0.25, -1.0))), 0.0), 6.0);
      col = mix(col, brass, ar);
    }
  }

  // the tea glass, its saucer and the simit
  {
    vec3 lo = vec3(min(gSim.x - 0.11, gTea.x - 0.085), gTableY - 0.001, min(gSim.z, gTea.z) - 0.11);
    vec3 hi = vec3(max(gSim.x + 0.11, gTea.x + 0.085), gTableY + 0.15, max(gSim.z, gTea.z) + 0.11);
    vec3 nn;
    vec2 h = boxT(ro, rd, lo, hi, nn);
    if (h.x < h.y && h.y > 0.0 && h.x < t) {
      float tt = max(h.x, 0.0), tEnd = min(h.y, t);
      float best = 1e3, tBest = tt, idB = 0.0;
      for (int i = 0; i < 48; i++) {
        vec2 d = props(ro + rd * tt);
        float r = d.x / (tt * pa);
        if (r < best) { best = r; tBest = tt; idB = d.y; }
        if (d.x < 0.0002 || tt > tEnd) break;
        tt += max(d.x, 0.0005);
      }
      float cov = ss(1.0, 0.0, best);
      if (cov > 0.0) {
        vec3 pp = ro + rd * tBest;
        vec3 pc;
        if (idB == 1.0) pc = shadeTea(rd, (pp - gTea) / PROP, col, pp);
        else if (idB == 2.0) pc = shadeSaucer(rd, pp, propNormal(pp));
        else if (idB == 4.0) {
          vec3 sn = propNormal(pp);
          float sv = aperture(pp) * outside(pp, 0.15);
          pc = vec3(0.62, 0.62, 0.64) * (fillAt(pp, sn) * 0.5 + 0.06) + vec3(0.9, 0.8, 0.65) * 0.35 * pow(max(dot(reflect(rd, sn), normalize(vec3(0.0, 0.1, -1.0))), 0.0), 4.0)
             + SUN * 3.0 * pow(max(dot(reflect(rd, sn), gSunC), 0.0), 40.0) * sv;
        }
        else pc = shadeSimit(rd, pp, propNormal(pp));
        col = mix(col, pc, cov);
        if (cov > 0.5) t = tBest;
      }
    }
  }

  // steam curling off the tea, glowing where the sun comes through it
  {
    float ts = (gTea.z - ro.z) / rd.z;
    vec3 Ps = ro + rd * ts;
    float sy = (Ps.y - gTea.y - 0.095 * PROP) / (0.1 * PROP);
    if (ts > 0.0 && ts < t && sy > 0.0 && sy < 1.6 && abs(Ps.x - gTea.x) < 0.1) {
      float sx = (Ps.x - gTea.x) / (0.03 * PROP), st = 0.0;
      for (int k = 0; k < 2; k++) {
        float fk = float(k);
        float x = sx - (fk - 0.5) * 0.7 - 0.6 * sin(sy * 3.2 - uTime * 1.3 + fk * 2.1) * sy - 0.2 * sin(sy * 7.0 - uTime * 2.1 + fk);
        st += exp(-x * x / (0.05 + 0.35 * sy)) * ss(1.6, 0.3, sy) * ss(0.0, 0.3, sy) * (0.5 + 0.5 * noise(vec2(sx * 1.5, sy * 3.0 - uTime * 0.9) + fk * 7.0));
      }
      float lit = aperture(Ps);
      if (lit > 0.0) lit *= outside(Ps, 0.2);
      col += SUN * (0.05 + 0.5 * lit) * st * 0.22;
    }
  }

  // the light hanging in the air, and the dust in it
  col += shafts(ro, rd, t) * (1.0 - 0.75 * gGlass) + dust(ro, rd, t);
  col += (ign(gl_FragCoord.xy + 7.0) - 0.5) / 255.0;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'train', name: 'Train', group: 'Journey',
  blurb: 'A regional train through Thrace at golden hour: poplar shadows sweep the compartment, the çay glows ruby, and a signal post flashes past on the beat',
  tags: ['vehicle', 'train', 'sunset', 'summer', 'turkish', 'calm'],
  energy: 0.35, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
