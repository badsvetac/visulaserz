import { SCULPT } from '../js/gfx/scene-kit.js';

// LALE — a night of the Tulip Era (Lale Devri), the way the palace gardens on the Bosphorus held
// their çırağan: the camera lies down among the stems of a tulip bed at dusk, the nearest flowers
// sharp and close, slender almond-shaped Istanbul tulips with needle-pointed tepals, red with gold
// flames and a few gold with red flames; behind them the bed runs off into a blur of lamplight and
// a low warm mist. Tortoises walk slowly between the plants with candles on their backs, as they
// did on those evenings; glass lamps of coloured glass hang in two plane trees whose crowns lean
// into the top of the frame, out of focus, as discs of light; a marble fountain throws a thin jet
// in the middle of the garden, cypresses stand dark against the sky, a köşk has its windows lit,
// and across the water the hills of the far shore carry a mosque against the last of the light,
// under a deep indigo sky with a thin crescent and the evening star.
//
// Everything is drawn analytically in 2.5-D: the bed is ten rows at fixed distances, each row a
// grid of plants with their own heights and colours, composited near to far so that once a pixel
// is covered nothing behind it is worked out (and once the soil is nearer than a row, the rest of
// the bed is skipped). A lens focused on the first rows blurs each layer by its own circle of
// confusion, so the far bed, the lamps and the trees fall into bokeh; the far rows are drawn as the
// soft almonds of colour a lens makes of them.
//
// Music: the bass opens the cups (each flower listens to its own slice of the low end, so the bed
// opens unevenly, like a real one); the mids sway the stems in an evening breeze that runs across
// the bed; the highs flicker the candle flames, make each glass lamp twinkle on its own slice of
// the top end and glitter in the fountain's jet. On every beat a wave of opening runs across the
// bed from one side to the other and the tortoises' candles flare, both over within the beat. With
// nothing playing the garden stays as it is: the breeze, the walk and the candles' own flicker go
// on, but nothing pulses.
const frag = `${SCULPT}
const float F = 1.8;                 // screen units (half-heights) per metre at a distance of 1 m
const float EYE = 0.58;              // the camera kneels at the edge of the bed, eyes just above the flowers
const float HOR = 0.2;               // where the horizon falls on screen
const float ZF = 0.5;                // the lens is focused on the nearest flowers
const float BLUR = 0.028;            // the circle of confusion of anything at infinity, screen units
const float CW = 0.13;               // the planting grid, metres between bulbs
const float ZK = 23.0;               // the köşk
const float ZQ = 25.0;               // the marble quay where the garden meets the water
const float ZT = 4.6;                // the two plane trees
const vec3 HAZE = vec3(0.07, 0.055, 0.15);     // the evening air: indigo
const vec3 MIST = vec3(0.4, 0.16, 0.07);       // the low mist over the garden, lit by its lamps
const vec3 SKYFILL = vec3(0.055, 0.07, 0.19);
const vec3 KEY = vec3(1.3, 0.62, 0.26);        // the garden's lamplight, from the front left
const vec3 CANDLE = vec3(1.0, 0.48, 0.16);
const vec3 LK = vec3(-0.5, -0.12, 0.857);

float gPx, gAsp, gCam, gWave, gWaveX, gFlare, gTr;
float gZ, gS, gBm, gLod, gBack, gLampBack, gFX, gKX, gMX, gBoost, gFogA;
bool gNeed;
vec2 gRowP, gUv;
vec3 gAcc, gWarm, gFogC;
float gLow[8], gHi[8];
vec4 gTort[4];                       // world x, depth, candle strength, heading (+1 or -1)
vec3 gFlame[4];                      // each candle flame on screen: x, y, scale

float sq(float x) { return x * x; }
float coc(float z) { return BLUR * abs(1.0 - ZF / z); }
// composite near to far: c is what this layer shows, a how much of the pixel it covers; the mist
// between the camera and the layer (gFogA of gFogC) is laid over it
void put(vec3 c, float a) { c = mix(c, gFogC, gFogA); gAcc += gTr * a * c; gTr *= 1.0 - a; }
void glow(vec3 e) { gAcc += gTr * e; }
// the mist lies low: thick over the far beds near the soil, thin a few metres up
void air(float z, float Y) {
  gFogA = (1.0 - exp(-z * 0.08)) * exp(-max(Y, 0.0) * 0.35) * 0.85;
  gFogC = mix(MIST, HAZE, ss(0.0, 3.0, Y));
}
// a line of half width hw seen through a blur of half width b (a box convolved with a box)
float strip(float x, float hw, float b) { x = abs(x); return clamp((min(x + b, hw) - max(x - b, -hw)) / (2.0 * b), 0.0, 1.0); }
float boxd(vec2 p, vec2 c, vec2 b) { vec2 d = abs(p - c) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float hexd(vec2 d) { d = abs(d); return max(d.x * 0.866 + d.y * 0.5, d.y); }

// ── the sky ────────────────────────────────────────────────────────────────────────────────────
vec3 skyAt(vec2 uv) {
  float h = uv.y - HOR;
  float west = exp(-sq((uv.x + gAsp * 0.6) * 0.8));              // where the sun went down
  vec3 c = mix(vec3(0.46, 0.15, 0.2), vec3(1.0, 0.42, 0.15), west);
  c = mix(c, mix(vec3(0.24, 0.09, 0.25), vec3(0.45, 0.16, 0.22), west), ss(0.0, 0.1, h));
  c = mix(c, vec3(0.085, 0.065, 0.24), ss(0.06, 0.42, h));
  c = mix(c, vec3(0.028, 0.034, 0.13), ss(0.35, 0.9, h));
  return mix(c, vec3(0.01, 0.014, 0.06), ss(0.8, 1.3, h));
}
void skyLayer(vec2 uv) {
  vec3 c = skyAt(uv);
  // the first stars, where the sky has gone dark
  for (int l = 0; l < 2; l++) {
    float sc = 34.0 + float(l) * 41.0;
    vec2 g = uv * sc + float(l) * 17.3, id = floor(g);
    float hh = hash21(id + 31.0);
    if (hh > 0.07) continue;
    vec2 o = vec2(hash21(id + 3.1), hash21(id + 8.4)) * 0.6 + 0.2;
    float r = length(fract(g) - o) / sc;
    float rb = max(gPx * 0.9, 0.0035);
    c += vec3(0.9, 0.9, 1.0) * (0.12 + 0.5 * pow(hash21(id + 5.5), 4.0)) * ss(rb, rb * 0.3, r) * ss(0.15, 0.55, uv.y - HOR) * (0.8 + 0.2 * sin(uTime * (1.0 + hh * 40.0) + hh * 90.0));
  }
  // a thin crescent and the evening star in its arms
  vec2 M = vec2(gAsp * 0.08 + 0.1, 0.72);
  float R = 0.036, b = max(gPx, BLUR * 0.45);
  float cres = max(length(uv - M) - R, -(length(uv - M - vec2(R * 0.42, R * 0.16)) - R * 0.9));
  c += vec3(1.25, 1.05, 0.75) * ss(b, -b, cres) + vec3(0.25, 0.2, 0.25) * exp(-length(uv - M) / 0.09) * 0.5;
  vec2 vs = M + vec2(R * 1.05, R * 0.25);
  float rv = length(uv - vs);
  c += vec3(1.0, 0.95, 0.85) * ss(0.007, 0.002, rv) * 0.9 + vec3(0.4, 0.4, 0.5) * exp(-rv / 0.012) * 0.25;
  c = mix(c, MIST, 0.55 * exp(-max(uv.y - HOR, 0.0) / 0.07));        // the garden's mist along the horizon
  gFogA = 0.0;
  put(c, 1.0);
}

// ── the far shore and the water ────────────────────────────────────────────────────────────────
float shoreTop(float x) {
  float hill = exp(-sq((x - gMX) * 1.8));
  return HOR + mix(0.012 + 0.026 * noise(vec2(x * 1.15 + 4.0, 0.5)) + 0.008 * noise(vec2(x * 4.3, 2.0)), 0.068, hill);
}
// a mosque on the shoulder of the far hills, in metres from the foot of its middle: the hall, the
// cascade of half domes up to the great dome, and two minarets with their balconies and caps
float mosque(vec2 m) {
  m.x = abs(m.x);
  float d = boxd(m, vec2(0.0, 9.0), vec2(27.0, 9.0));
  d = min(d, boxd(m, vec2(0.0, 22.0), vec2(12.5, 4.0)));
  d = min(d, max(length(m - vec2(0.0, 26.0)) - 14.0, 26.0 - m.y));
  d = min(d, max(length(m - vec2(14.0, 18.0)) - 9.0, 18.0 - m.y));
  d = min(d, max(length(m - vec2(23.0, 18.0)) - 4.5, 18.0 - m.y));
  d = min(d, boxd(m, vec2(0.0, 43.0), vec2(0.5, 3.5)));
  float mx = abs(m.x - 37.0);
  d = min(d, max(mx - 1.7, abs(m.y - 31.0) - 31.0));
  d = min(d, max(mx - 1.7 * (75.0 - m.y) / 13.0, abs(m.y - 68.5) - 6.5));
  d = min(d, max(mx - 2.8, min(abs(m.y - 44.0), abs(m.y - 54.0)) - 0.9));
  return d;
}
vec3 shoreLight(float id, out vec2 at) {
  float cw = 0.026;
  float xl = (id + 0.2 + 0.6 * hash11(id * 7.31 + 0.4)) * cw;
  at = vec2(xl, HOR + 0.003 + 0.016 * sq(hash11(id * 5.17 + 0.9)) + 0.03 * exp(-sq((xl - gMX) * 1.8)) * hash11(id * 1.93));
  float on = step(hash11(id * 3.17 + 0.5), 0.5);
  return on * mix(vec3(1.0, 0.58, 0.26), vec3(0.8, 0.82, 1.0), step(0.82, hash11(id * 2.33))) * (0.16 + 0.22 * hash11(id * 4.41));
}
void shore(vec2 uv) {
  float top = shoreTop(uv.x);
  float ms = 0.0025;                                              // screen units per metre over there
  vec2 m = (uv - vec2(gMX, HOR + 0.064)) / ms;
  bool near = abs(m.x) < 45.0 && m.y < 80.0 && m.y > -8.0;
  if (uv.y > top + 0.03 && !near) return;
  float ci = floor(uv.x / 0.026);
  for (int k = -1; k <= 1; k++) {
    vec2 at;
    vec3 lc = shoreLight(ci + float(k), at);
    float rb = 0.0065 + 0.003 * hash11((ci + float(k)) * 9.13);
    glow(lc * ss(rb, rb - 0.0025, length(uv - at)) * (1.0 + 0.25 * ss(rb * 0.6, rb, length(uv - at))));
  }
  float b = max(gPx, 0.006);
  float a = ss(b, -b, uv.y - top);
  if (near) {
    float bm = max(gPx, 0.0028) / ms;
    float dm = mosque(m);
    a = max(a, ss(bm, -bm, dm));
    // the lamps strung between its minarets, and its windows
    float string = abs(m.y - (60.0 - 7.0 * (1.0 - sq(m.x / 37.0)))) ;
    float beads = ss(0.9, 0.2, length(vec2(fract(m.x / 3.0 + 0.5) - 0.5, 0.0) * 3.0 + vec2(0.0, string)));
    glow(vec3(1.0, 0.72, 0.38) * beads * step(abs(m.x), 35.5) * 0.7);
    float win = step(abs(fract(m.x / 4.0) - 0.5), 0.18) * step(abs(m.y - 7.0), 2.2) * step(abs(m.x), 25.0);
    glow(vec3(1.0, 0.6, 0.28) * win * 0.35 * ss(bm, -bm, dm));
  }
  vec3 c = mix(vec3(0.15, 0.07, 0.15), vec3(0.075, 0.045, 0.12), ss(HOR, HOR + 0.12, uv.y));
  gFogA = 0.5 * exp(-max(uv.y - HOR, 0.0) / 0.03);
  gFogC = MIST;
  put(c, a);
}
void water(vec2 uv) {
  float yq = HOR - EYE * F / ZQ;
  if (uv.y > HOR + gPx) return;
  float dpt = clamp((HOR - uv.y) / (HOR - yq), 0.0, 1.0);          // 0 at the far shore, 1 at the quay
  float rip = noise(vec2(uv.x * 26.0, (HOR - uv.y) * 900.0 / (0.25 + dpt) + uTime * 0.5));
  vec3 c = skyAt(vec2(uv.x + (rip - 0.5) * 0.03, 2.0 * HOR - uv.y + 0.012)) * (0.3 + 0.3 * rip);
  // the lights of the far shore, drawn down the water in broken streaks
  float ci = floor(uv.x / 0.026);
  for (int k = -1; k <= 1; k++) {
    vec2 at;
    vec3 lc = shoreLight(ci + float(k), at);
    c += lc * exp(-sq((uv.x - at.x) / 0.007)) * (0.4 + 1.4 * sq(rip)) * (1.0 - 0.6 * dpt);
  }
  gFogA = 0.45;
  gFogC = MIST;
  put(c, ss(HOR + gPx, HOR - gPx, uv.y));
}

// ── the köşk by the water ───────────────────────────────────────────────────────────────────────
void kosk(vec2 uv) {
  float s = F / ZK, bs = max(gPx * 0.75, coc(ZK)) / s;
  vec2 P = vec2(uv.x / s + gCam - gKX, (uv.y - HOR) / s + EYE);
  if (abs(P.x) > 6.5 || P.y > 9.0 || P.y < -0.4) return;
  float d = boxd(P, vec2(0.0, 0.45), vec2(6.0, 0.45));                       // the stone platform
  d = min(d, boxd(P, vec2(0.0, 2.75), vec2(4.2, 1.85)));                     // the walls
  d = min(d, boxd(P, vec2(0.0, 4.78), vec2(5.7, 0.17)));                     // the deep eaves
  float ry = clamp((P.y - 4.95) / 1.05, 0.0, 1.0);
  d = min(d, max(abs(P.x) - mix(5.1, 1.75, ry), abs(P.y - 5.475) - 0.525));  // the hipped roof
  d = min(d, max(length((P - vec2(0.0, 5.95)) / vec2(1.6, 1.3)) - 1.0, 5.95 - P.y));   // the dome
  d = min(d, boxd(P, vec2(0.0, 7.6), vec2(0.07, 0.42)));                     // the finial
  d = min(d, max(length(P - vec2(0.0, 8.3)) - 0.3, -(length(P - vec2(0.11, 8.37)) - 0.26)));   // its crescent
  float a = ss(bs, -bs, d);
  if (a < 0.003) return;
  float wi = clamp(floor(P.x / 1.6 + 0.5), -2.0, 2.0) * 1.6;
  float dw = boxd(P, vec2(wi, 2.15), vec2(0.3, 0.6));
  dw = min(dw, max(max(length(P - vec2(wi - 0.16, 2.75)), length(P - vec2(wi + 0.16, 2.75))) - 0.46, 2.75 - P.y));   // pointed heads
  float du = length((P - vec2(wi, 3.85)) / vec2(0.17, 0.24)) - 1.0;           // the small upper windows
  float win = max(ss(bs, -bs, dw), ss(bs, -bs, du * 0.17) * 0.75);
  win *= step(P.y, 4.5) * step(0.9, P.y) * (0.94 + 0.06 * sin(uTime * 1.3 + wi * 2.1));
  vec3 c = vec3(0.03, 0.026, 0.055);
  c += vec3(0.09, 0.045, 0.016) * exp(-max(dw, 0.0) / 0.3) * step(P.y, 4.6) * step(0.9, P.y);   // light on the walls round the windows
  c += vec3(0.14, 0.07, 0.03) * ss(4.6, 4.95, P.y) * step(P.y, 4.95) * step(abs(P.x), 5.7);    // the eaves lit from below
  c += vec3(0.05, 0.03, 0.06) * ss(0.0, 1.0, P.y - 4.95) * ss(0.4, -0.3, -P.x);               // the sky's last light on the roof
  c = mix(c, vec3(1.25, 0.62, 0.22), win);
  air(ZK, P.y);
  put(c, a);
}

// ── cypresses ───────────────────────────────────────────────────────────────────────────────────
void cypress(vec2 uv, float sx, float z, float H, float Wc, float seed) {
  float s = F / z, bs = max(gPx * 0.75, coc(z)) / s;
  vec2 P = vec2(uv.x / s + gCam - sx * gAsp / s, (uv.y - HOR) / s + EYE);
  if (P.y < -0.2 || P.y > H + 0.4 || abs(P.x) > Wc * 1.4 + 0.3) return;
  float yn = clamp(P.y / H, 0.0, 1.0);
  float w = Wc * sqrt(ss(0.0, 0.24, yn)) * pow(1.0 - yn, 0.85) * 1.25;
  w *= 1.0 + 0.22 * (noise(vec2(P.y * 1.9 + seed, sign(P.x) * 5.0 + seed)) - 0.5) + 0.1 * (noise(vec2(P.y * 6.0, sign(P.x) * 9.0 + seed)) - 0.5);
  w = max(w, 0.15 * step(P.y, 0.9));
  float d = max(max(abs(P.x) - w, P.y - H), -P.y);
  float a = ss(bs, -bs, d);
  if (a < 0.003) return;
  float side = clamp(P.x / max(w, 0.05), -1.0, 1.0);
  vec3 c = vec3(0.012, 0.02, 0.028);
  c += vec3(0.11, 0.05, 0.02) * ss(0.45, 0.0, yn) * (0.6 - 0.4 * side);                 // the garden's light on its foot
  c += vec3(0.07, 0.03, 0.06) * ss(0.4, 1.0, -side) * ss(0.2, 0.8, yn);                 // the west's glow on one flank
  c *= 0.8 + 0.4 * noise(vec2(P.x * 4.0, P.y * 3.0) + seed);
  air(z, P.y);
  put(c, a);
}

// ── the garden's soil, between the plants ───────────────────────────────────────────────────────
void ground(vec2 uv) {
  float yq = HOR - EYE * F / ZQ;
  if (uv.y > yq + 0.002) return;
  float zg = EYE * F / max(HOR - uv.y, 1e-3);
  float X = uv.x * zg / F + gCam;
  float fp = gPx * zg * zg / (EYE * F);                       // how many metres of soil a pixel spans
  vec3 alb = vec3(0.13, 0.09, 0.075) * (0.7 + 0.6 * noise(vec2(X, zg) * 9.0) * ss(0.3, 0.05, fp));
  vec3 lit = KEY * 0.05 * exp(-zg * 0.4) + SKYFILL * 0.25;
  for (int i = 0; i < 4; i++) {
    vec4 T = gTort[i];
    float d2 = sq(X - T.x) + sq(zg - T.y);
    float under = ss(0.05, 0.14, length(vec2(X - T.x, (zg - T.y) * 2.2)));    // the shell shades the soil beneath it
    lit += CANDLE * T.z * 0.03 / (d2 + 0.012) * ss(0.8, 0.0, sqrt(d2)) * under;    // a pool of candlelight
    lit *= mix(0.5, 1.0, under);
  }
  vec3 c = alb * lit;
  air(zg, 0.0);
  put(c, ss(yq + 0.002, yq, uv.y));
}

// ── the glass lamps and the plane trees they hang from ─────────────────────────────────────────
float stringY(float x, float g) {
  float ye = g < 0.5 ? 0.98 : 0.88, ym = g < 0.5 ? 0.62 : 0.55;
  return ym + (ye - ym) * sq(x / (gAsp * 1.15));
}
// lamp i of string g: screen position (xy), bokeh radius (z), brightness (w); tint is its glass
vec4 lampOf(float g, float i, out vec3 tint) {
  float z = g < 0.5 ? 3.2 : 6.5, s = F / z;
  float hh = hash11(i * 3.17 + g * 11.0 + 0.3), h2 = hash11(i * 7.91 + g * 5.0 + 0.7);
  float x = (i * 0.55 + (hh - 0.5) * 0.18 - gCam) * s;
  float y = stringY(x, g) - (0.1 + 0.16 * h2) * s;
  tint = h2 < 0.66 ? vec3(1.0, 0.5, 0.17) : h2 < 0.8 ? vec3(1.0, 0.2, 0.15) : h2 < 0.9 ? vec3(0.4, 0.9, 0.45) : vec3(0.35, 0.72, 1.0);
  int j = int(mod(i + g * 3.0, 8.0));
  float br = 0.78 + 0.07 * sin(uTime * (2.0 + 3.0 * hh) + hh * 30.0) + 0.9 * gHi[j] * (0.6 + 0.4 * sin(uTime * 23.0 + hh * 40.0));
  return vec4(x, y, 0.045 * s + coc(z) * 1.1, br);
}
float lampsBehind(vec2 uv) {
  float s = F / 3.2, i0 = floor((uv.x / s + gCam) / 0.55 + 0.5), sum = 0.0;
  for (int k = -1; k <= 1; k++) {
    vec3 tint;
    vec4 L = lampOf(0.0, i0 + float(k), tint);
    sum += L.w * exp(-dot(uv - L.xy, uv - L.xy) / 0.012);
  }
  return sum;
}
void lamps(vec2 uv, float g) {
  float z = g < 0.5 ? 3.2 : 6.5, s = F / z, b = max(gPx, coc(z));
  float i0 = floor((uv.x / s + gCam) / 0.55 + 0.5);
  if (uv.y < stringY(uv.x, g) - 0.35 * s - 0.06) return;
  for (int k = -1; k <= 1; k++) {
    vec3 tint;
    vec4 L = lampOf(g, i0 + float(k), tint);
    vec2 d = uv - L.xy;
    float r = mix(length(d), hexd(d), 0.3);
    float disc = ss(L.z, L.z - 0.004, r) * (0.82 + 0.3 * ss(L.z * 0.55, L.z, r));
    glow(tint * L.w * (disc * (g < 0.5 ? 0.62 : 0.48) + exp(-length(d) / 0.05) * 0.06));
    // its cord up to the branch
    float cord = strip(uv.x - L.x, 0.0012 * s, b) * step(L.y, uv.y) * step(uv.y, stringY(L.x, g));
    glow(tint * L.w * cord * 0.08);
  }
}
// the plane trees: their crowns lean into the top corners of the frame, out of focus, with the
// sky showing through between the clusters of leaves and their undersides warm from the lamps;
// their trunks stand at the edges of the frame
float crownEdge(float x) { return 1.2 - 0.82 * ss(0.15, 1.0, abs(x) / gAsp); }
void canopy(vec2 uv) {
  float sd = uv.x < 0.0 ? -1.0 : 1.0;
  float dE = uv.y - crownEdge(uv.x);
  float xt = gAsp + 0.01 - 0.03 * (uv.y - HOR) + 0.015 * sin(uv.y * 3.0 + sd);   // the trunk's axis
  float wt = 0.075 + 0.025 * ss(0.0, -0.15, uv.y - HOR);
  float dT = abs(abs(uv.x) - xt) - wt;
  if (dE < -0.2 && dT > 0.05) return;
  float b = coc(ZT) * 1.3;
  vec2 p = uv + vec2(gCam * F / ZT, 0.0);
  // clusters of leaves, each the soft disc a lens makes of it, the sky showing between them
  float cs = 0.085, leaves = ss(0.12, 0.3, dE), tone = 0.5;
  vec2 gi = floor(p / cs);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 id = gi + vec2(float(i), float(j));
    float h1 = hash21(id + 9.1);
    vec2 c = (id + 0.5 + (vec2(hash21(id + 1.7), hash21(id + 5.3)) - 0.5) * 0.9) * cs;
    float r = cs * (0.4 + 0.55 * h1) * ss(-0.2, 0.1, c.y - crownEdge(c.x));
    float ai = ss(b, -b, length(p - c) - r);
    tone = mix(tone, h1, ai * (1.0 - leaves));
    leaves = max(leaves, ai);
  }
  float trunk = ss(b, -b, dT) * ss(HOR - EYE * F / ZT - 0.01, HOR - EYE * F / ZT + 0.01, uv.y);
  float a = max(leaves, trunk);
  if (a < 0.003) return;
  float under = ss(0.3, -0.05, dE) * (1.0 - trunk);
  vec3 c = vec3(0.012, 0.016, 0.022) * (0.5 + tone);
  c += (vec3(0.5, 0.26, 0.08) * gLampBack * 0.5 + vec3(0.06, 0.026, 0.01)) * under * (0.4 + 1.2 * tone);   // lit from under by the lamps
  float bark = noise(vec2(uv.x * 30.0, uv.y * 6.0) + sd * 4.0);
  vec3 cb = vec3(0.03, 0.026, 0.026) * (0.6 + 0.8 * ss(0.4, 0.6, bark));      // the plane's patchy bark
  cb += vec3(0.1, 0.045, 0.015) * ss(-wt, wt, xt - abs(uv.x)) * ss(0.9, 0.0, uv.y);   // the garden's light on its inner side
  c = mix(c, cb, trunk);
  air(ZT, max(uv.y - HOR, 0.0) / F * ZT + EYE);
  put(c, a);
}

// ── the marble fountain ─────────────────────────────────────────────────────────────────────────
void fountain(vec2 uv) {
  float s = F / 3.9, bs = max(gPx * 0.7, coc(3.9)) / s;
  vec2 P = vec2(uv.x / s + gCam - gFX, (uv.y - HOR) / s + EYE);
  if (abs(P.x) > 0.85 || P.y > 1.95 || P.y < -0.06) return;
  // the jet rising from the bowl, lit gold by the lamps above it, and the drops falling back from
  // its crown, each a small disc of light the lens makes of it
  float jt = 1.5 + 0.03 * sin(uTime * 2.1) + 0.02 * sin(uTime * 3.7);
  float jet = exp(-sq(P.x / (0.012 + bs * 0.6))) * ss(1.14, 1.24, P.y) * ss(jt + 0.06, jt - 0.1, P.y);
  float drops = 0.0;
  if (abs(P.x) < 0.45 && P.y > 1.1) {
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float h1 = hash11(fi * 3.7 + 1.0), h2 = hash11(fi * 9.1 + 2.0);
      float ph = fract(uTime * (0.45 + 0.25 * h1) + h2);
      float side = mod(fi, 2.0) < 0.5 ? -1.0 : 1.0;
      vec2 dp = vec2(side * (0.1 + 0.26 * h2) * ph, jt + 0.1 * ph - (jt - 1.09) * ph * ph);
      drops += ss(bs, bs * 0.7, length(P - dp)) * ss(0.0, 0.08, ph) * ss(1.0, 0.8, ph) * (0.7 + 0.3 * sin(uTime * 11.0 + fi * 5.0));
    }
  }
  glow(vec3(0.75, 0.5, 0.28) * jet * 0.35 + vec3(1.0, 0.72, 0.42) * drops * (0.22 + 0.5 * gHigh));
  if (P.y > 1.25) return;
  // the bowl, shaped like a tulip's cup, its baluster, and the low octagonal basin it rises from
  float wb = 0.07 + 0.31 * pow(ss(0.98, 1.17, P.y), 0.6);
  float dB = max(abs(P.x) - wb, max(0.98 - P.y, P.y - 1.19));
  float wp = 0.068 + 0.032 * ss(0.42, 0.26, P.y) + 0.02 * exp(-sq((P.y - 0.64) / 0.03)) + 0.018 * ss(0.9, 0.99, P.y);
  float dP = max(abs(P.x) - wp, max(0.22 - P.y, P.y - 1.0));
  float dL = max(boxd(P, vec2(0.0, 0.245), vec2(0.76, 0.03)) - 0.012, abs(P.x) + (P.y - 0.245) * 1.2 - 0.78);   // the rim, its corners cut
  float dK = boxd(P, vec2(0.0, 0.11), vec2(0.72, 0.11));
  float d = min(min(dB, dP), min(dL, dK));
  float a = ss(bs, -bs, d);
  if (a < 0.003) return;
  vec3 n = vec3(0.0, 0.0, 1.0);
  float shade = 1.0;
  if (dK < 0.0 && dL > 0.0) {
    // three faces of the octagon, each with an arched panel carved in it
    bool mid = abs(P.x) < 0.3;
    float fc = mid ? 0.0 : sign(P.x) * 0.52, hw = mid ? 0.1 : 0.065;
    n = mid ? vec3(0.0, 0.0, 1.0) : normalize(vec3(sign(P.x) * 0.75, 0.0, 0.66));
    float pd = min(boxd(P, vec2(fc, 0.08), vec2(hw, 0.045)), length(P - vec2(fc, 0.125)) - hw);
    shade = mix(1.0, 0.5, ss(0.012, -0.012, pd)) + 0.4 * strip(pd + 0.01, 0.008, bs) * step(P.y, 0.1);
    shade *= 1.0 - 0.3 * strip(abs(P.x) - 0.3, 0.01, bs);                  // the corners between the faces
  } else if (dL <= 0.0) {
    n = normalize(vec3(0.0, 0.75, 0.66));                                   // the rim, catching the lamps above
  } else {
    float w = dB < dP ? wb : wp;
    float t = clamp(P.x / w, -1.0, 1.0);
    n = normalize(vec3(t, dB < dP ? -0.35 : 0.0, sqrt(1.0 - t * t)));
  }
  vec4 T = gTort[3];
  float d2 = sq(P.x + gFX - T.x) + sq(P.y - 0.2) + sq(3.9 - T.y);
  vec3 alb = vec3(0.4, 0.37, 0.36);
  vec3 c = alb * (KEY * 0.24 * max(dot(n, LK) * 0.75 + 0.25, 0.0) + vec3(0.3, 0.16, 0.06) * max(n.y, 0.0) + SKYFILL * (0.8 + 0.6 * n.y) + CANDLE * T.z * 0.15 / (0.1 + d2)) * shade;
  c *= mix(0.55, 1.0, ss(0.0, 0.5, P.y));                                  // darker toward the soil
  c += vec3(0.9, 0.55, 0.25) * 0.35 * strip(P.y - 1.175, 0.008, bs) * step(abs(P.x), 0.37);   // the water brimming in the bowl
  air(3.9, P.y);
  put(c, a);
}

// ── the tortoises and their candles ─────────────────────────────────────────────────────────────
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
// a tortoise seen side on, walking across the bed with a candle on a brass dish stuck to its shell.
// q is in its own frame, facing +x, in units of 1.3 m: the shell is 26 cm long
void tortoise(vec2 uv, int i) {
  vec4 T = gTort[i];
  vec3 FL = gFlame[i];
  float z = T.y, s = F / z, bs = max(gPx * 0.7, coc(z)) / s / 1.3;
  vec2 P = vec2(uv.x / s + gCam, (uv.y - HOR) / s + EYE);
  vec2 q = vec2((P.x - T.x) * T.w, P.y) / 1.3;
  float fl = T.z;
  // the candle's light around the flame (nothing here hides behind it)
  float hd = length(uv - FL.xy);
  glow(CANDLE * fl * (exp(-hd / (0.022 + 0.012 * gFlare)) * 0.22 + exp(-hd / 0.12) * 0.05));
  if (abs(q.x) > 0.17 || q.y > 0.2 || q.y < -0.01) return;
  air(z, 0.1);
  // the flame: a teardrop, white at the heart, swaying with the highs
  float fh = 0.034 * (1.0 + 0.55 * gFlare);
  float fy = (q.y - 0.142) / fh;
  float wob = (0.1 + 0.5 * gHigh) * (noise(vec2(uTime * 9.0, float(i) * 7.0)) - 0.5) * 2.0;
  float fx = (q.x - wob * 0.006 * sq(clamp(fy, 0.0, 1.0))) / (0.0075 * (1.0 + 0.3 * gFlare));
  fx /= 1.12 - 0.92 * clamp(fy, 0.0, 1.0);
  float e = exp(-(fx * fx * 1.4 + sq((fy - 0.36) * 2.5)));
  e = max(e - 0.02, 0.0) * fl;
  glow(mix(vec3(1.3, 0.38, 0.08), vec3(1.7, 1.35, 0.85), ss(0.45, 0.95, e)) * e * 1.4 + vec3(0.1, 0.18, 0.6) * exp(-(fx * fx + sq((fy - 0.06) * 6.0))) * 0.3 * fl);
  // the candle, the wax glowing under the flame, its wick
  float dc = boxd(q, vec2(0.0, 0.117), vec2(0.0092, 0.0235)) - 0.0015;
  float a = ss(bs, -bs, dc);
  if (a > 0.003) {
    float tc = clamp(q.x / 0.011, -1.0, 1.0);
    vec3 c = vec3(0.92, 0.8, 0.62) * (KEY * 0.08 * (1.0 - 0.5 * tc * T.w) + CANDLE * fl * (0.22 + 1.4 * ss(0.1, 0.142, q.y)) * (1.0 - 0.35 * tc * tc) + SKYFILL);
    c = mix(c, vec3(0.02), strip(q.x, 0.001, bs) * ss(0.138, 0.142, q.y));
    put(c, a);
  }
  // the brass dish it stands in, the flame shining in its rim
  float dd = (length((q - vec2(0.0, 0.0925)) / vec2(0.024, 0.0042)) - 1.0) * 0.0042;
  a = ss(bs, -bs, dd);
  if (a > 0.003) {
    float tx = q.x / 0.024;
    vec3 c = vec3(0.6, 0.38, 0.13) * (CANDLE * fl * 0.9 + KEY * 0.15 + SKYFILL);
    c += vec3(1.0, 0.7, 0.35) * fl * exp(-sq(tx / 0.3)) * ss(0.0918, 0.0965, q.y) * 0.9;
    put(c, a);
  }
  // the shell: a low dome of horn plates, amber at their hearts and dark at their seams, in three
  // rows (the crest, the flanks and the rim), lit from above by its own candle
  vec2 e2 = (q - vec2(0.0, 0.026)) / vec2(q.x > 0.0 ? 0.095 : 0.103, 0.064);
  float ds = max((length(e2) - 1.0) * 0.064, 0.026 - 0.007 * e2.x * e2.x - q.y);
  a = ss(bs, -bs, ds);
  if (a > 0.003) {
    float ex = clamp(e2.x, -0.995, 0.995), ey = clamp(e2.y, 0.0, 0.995);
    float ez = sqrt(max(1.0 - ex * ex - ey * ey, 0.0));
    float th = atan(ey, ez);                                      // 0 at the rim, 90° on the crest
    float u, g, cw, bh;                                           // across and along the plate's row; its size (q units)
    if (th < 0.2) { u = ex * 5.5 + 5.5; g = th / 0.2; cw = 0.018; bh = 0.012; }
    else if (th < 0.98) { u = atan(ex, ez) / (PI * 0.5) * 2.0 + 2.0; g = (th - 0.2) / 0.78; cw = 0.05; bh = 0.042; }
    else { u = ex * 3.0 + 3.0; g = (th - 0.98) / 0.6; cw = 0.034; bh = 0.026; }
    float f = fract(u) - 0.5, row = th < 0.2 ? 0.0 : th < 0.98 ? 1.0 : 2.0;
    float hc = hash11(floor(u) * 7.7 + row * 31.1 + float(i) * 1.3);
    float edge = min((0.5 - abs(f)) * cw, min(g, 1.0 - g) * bh);
    float seam = 1.0 - ss(0.0005, 0.0005 + max(bs, 0.0012), edge);
    vec2 rc = vec2(f / 0.5, (g - 0.58) / 0.5);
    float core = exp(-dot(rc, rc) * 1.3);
    float rings = (0.5 + 0.5 * sin(edge * 1500.0)) * ss(0.004, 0.0015, bs);
    vec3 alb = mix(vec3(0.1, 0.055, 0.022), vec3(0.62, 0.38, 0.11), clamp(core * (0.45 + 0.55 * hc) * (0.85 + 0.3 * rings), 0.0, 1.0));
    alb *= 1.0 - 0.75 * seam;
    // each plate bulges a little, so each catches the flame on its own
    vec3 n = normalize(vec3(ex * T.w / 0.1, ey / 0.064, ez / 0.08) + vec3(f * 0.7 * T.w, (g - 0.55) * 0.6, 0.0) * (1.0 - seam));
    vec3 Lc = normalize(vec3(-q.x * T.w, 0.154 - q.y, -ez * 0.08));
    vec3 c = alb * (CANDLE * fl * 1.3 * max(dot(n, Lc) * 0.7 + 0.3, 0.0) + KEY * 0.55 * max(dot(n, LK) * 0.7 + 0.3, 0.0) + SKYFILL * (0.8 + 0.6 * n.y));
    c += CANDLE * fl * 0.45 * pow(max(dot(n, normalize(Lc + vec3(0.0, 0.0, 1.0))), 0.0), 24.0) * (1.0 - seam);   // the horn is glossy
    c *= mix(0.4, 1.0, ss(0.0, 0.22, th));                                    // the rim turns under, into shadow
    put(c, a);
  }
  // the head, nodding as it walks, the neck, the legs on this side and the stub of a tail
  float walk = uTime * 4.2 + float(i) * 1.7;
  vec2 hp = vec2(0.124, 0.044 + 0.003 * sin(walk * 2.0));
  vec2 hq = rot(0.22) * (q - hp);
  float dsk = (length(hq / vec2(0.021, 0.0128)) - 1.0) * 0.0128;
  dsk = min(dsk, seg(q, vec2(0.07, 0.03), hp - vec2(0.01, 0.002)) - 0.0098);
  dsk = min(dsk, seg(q, vec2(-0.094, 0.026), vec2(-0.112, 0.017)) - 0.0042);
  for (int l = 0; l < 2; l++) {
    float lx = l == 0 ? 0.058 : -0.062, ph = walk + float(l) * PI;
    dsk = min(dsk, seg(q, vec2(lx, 0.03), vec2(lx + 0.012 * sin(ph), 0.008 + 0.007 * max(cos(ph), 0.0))) - 0.0115);
  }
  a = ss(bs, -bs, dsk);
  if (a > 0.003) {
    float head = ss(0.002, -0.002, (length(hq / vec2(0.021, 0.0128)) - 1.0) * 0.0128);
    vec2 hn = hq / vec2(0.021, 0.0128);
    vec3 n = normalize(mix(vec3(0.0, 0.3, 1.0), vec3(hn.x * T.w, hn.y, sqrt(max(1.0 - dot(hn, hn), 0.0))), head));
    vec3 alb = vec3(0.34, 0.27, 0.16) * (1.0 + 0.4 * (noise(q * 320.0 + float(i) * 5.0) - 0.5) * ss(0.004, 0.0015, bs));
    vec3 c = alb * (CANDLE * fl * mix(0.25, 0.9, head) * max(n.y + 0.4, 0.0) + KEY * 0.3 * max(dot(n, LK) * 0.7 + 0.3, 0.0) + SKYFILL * 1.2);
    c *= mix(0.45, 1.0, max(head, ss(0.075, 0.1, q.x)));                    // under the shell it is dark
    vec2 eye = hp + vec2(0.008, 0.0035);
    c = mix(c, vec3(0.006), ss(0.0028 + bs * 0.5, 0.0016, length(q - eye)));
    c += CANDLE * fl * 0.6 * ss(0.0012 + bs * 0.3, 0.0, length(q - eye - vec2(-0.0008, 0.0009)));
    put(c, a);
  }
  // the far legs, behind, in the shell's shadow
  float df = 1.0;
  for (int l = 0; l < 2; l++) {
    float lx = l == 0 ? 0.066 : -0.054, ph = walk + float(l) * PI + PI * 0.5;
    df = min(df, seg(q, vec2(lx, 0.03), vec2(lx + 0.012 * sin(ph), 0.008 + 0.007 * max(cos(ph), 0.0))) - 0.0105);
  }
  a = ss(bs, -bs, df);
  if (a > 0.003) put(vec3(0.34, 0.27, 0.16) * (KEY * 0.1 + CANDLE * fl * 0.08 + SKYFILL * 0.6), a);
}

// ── the tulips ──────────────────────────────────────────────────────────────────────────────────
// the light a row gets at this pixel: the garden's warm key, the candles near it, and what glows
// behind it (the lamps, a candle passing at the back) to shine through the petals. Worked out
// only once something in the row actually covers the pixel
void lightRow() {
  if (!gNeed) return;
  gNeed = false;
  vec2 P = gRowP;
  gWarm = KEY * (0.35 + 0.65 * exp(-(gZ - 0.5) * 0.3)) * mix(0.18, 1.0, ss(0.03, 0.34, P.y));   // the soil level lies in shadow
  gBack = 0.22 + 0.5 * gLampBack;
  for (int i = 0; i < 4; i++) {
    vec4 T = gTort[i];
    vec3 dd = vec3(P.x - T.x, P.y - 0.2, gZ - T.y);
    float d2 = dot(dd, dd);
    gWarm += CANDLE * T.z * 0.03 / (0.012 + d2) * ss(0.42, 0.2, sqrt(d2));
    if (T.y > gZ) gBack += T.z * 1.4 * exp(-sq(length(gUv - gFlame[i].xy) / 0.08));
  }
}
// one tepal of a flower. q is in the flower's frame, in metres (y up its axis); phi is the
// tepal's azimuth round the axis (90° faces us). Slender, almond-shaped, needle-pointed, flaring
// at the tip as the cup opens
void tepal(vec2 q, float phi, bool outer, float open, float L, float W, vec4 h, bool gold, float idx) {
  float cp = cos(phi), sp = sin(phi);
  float al = outer ? open + 0.05 : open * 0.82;
  vec2 dir = vec2(sin(al) * cp, cos(al));
  float fl = length(dir);
  dir /= fl;
  vec2 rg = vec2(dir.y, -dir.x);
  float Lp = L * fl * (outer ? 1.0 : 0.95);
  float Wp = W * (0.42 + 0.58 * abs(sp)) * (outer ? 1.0 : 0.9);
  vec2 r = q - vec2((outer ? 0.0065 : 0.0045) * cp, 0.0);
  float u = dot(r, dir), sN = u / Lp;
  float vc = dot(r, rg) - (0.06 + 0.55 * open) * cp * Lp * sN * sN;
  if (u < -gBm || u > Lp + gBm || abs(vc) > Wp + gBm) return;
  float sc = clamp(sN, 0.0, 1.0);
  float w = Wp * 3.65 * pow(sc, 0.7) * pow(1.0 - sc, 1.3);
  float d = max(abs(vc) - w, max(-u, u - Lp));
  float a = ss(gBm, -gBm, d) * min(1.0, Wp / gBm);
  if (a < 0.003) return;
  lightRow();
  float t = clamp(vc / max(w, 1e-5), -1.0, 1.0);
  bool face = sp > -0.2;                    // the outer face; behind the axis we look at the inner one
  float ca = cos(al), sa = sin(al), ct = sqrt(max(1.0 - t * t, 0.0));
  vec3 nO = vec3(ca * cp, -sa, ca * sp);
  vec3 n = face ? normalize(nO * ct + vec3(rg, 0.0) * t * 0.9 + vec3(0.0, 0.0, 0.25))
                : normalize(-nO * ct - vec3(rg, 0.0) * t * 0.5 + vec3(0.0, 0.0, 0.25));
  // flamed streaks running up the tepal, more of them toward the tip
  float flame = 0.0;
  if (gLod > 0.01) {
    float fs = noise(vec2(t * 3.6 + idx * 1.9 + h.x * 17.0, sc * 1.3 + h.y * 11.0)) * 0.7 + noise(vec2(t * 9.0 + idx * 3.1, sc * 3.0 + h.z * 5.0)) * 0.3;
    flame = ss(0.6, 0.7, fs + 0.16 * sc) * ss(0.05, 0.3, sc);                               // flames up the tepal
    flame = max(flame, ss(0.8, 0.97, abs(t)) * ss(0.35, 0.65, noise(vec2(sc * 14.0, idx + h.w * 9.0))) * ss(0.2, 0.6, sc));   // feathered edges
    flame *= gLod;
  }
  vec3 alb = gold ? mix(vec3(1.0, 0.56, 0.04), vec3(0.8, 0.05, 0.025), flame * 0.9)
                  : mix(vec3(0.8, 0.03, 0.03), vec3(1.0, 0.5, 0.07), flame * 0.85);
  alb *= 0.92 + 0.08 * sin(t * 24.0 + sc * 5.0 + idx);
  float occ = mix(0.42, 1.0, ss(0.0, 0.55, sc)) * mix(1.0, 0.7, ss(0.82, 1.0, abs(t)) * (1.0 - sc));
  if (!face) {
    alb *= vec3(0.78, 0.55, 0.55);
    alb = mix(alb, gold ? vec3(0.1, 0.08, 0.02) : vec3(0.05, 0.012, 0.025), ss(0.32, 0.08, sc));   // the dark heart
    occ *= 0.62;
  }
  float ndl = max(dot(n, LK) * 0.75 + 0.25, 0.0);
  vec3 warm = gWarm * gBoost;
  vec3 c = alb * (warm * ndl + SKYFILL * (0.6 + 0.6 * n.y) * 1.3 + 0.012);
  c += alb * alb * CANDLE * gBack * (0.3 + 0.7 * t * t) * (0.4 + 0.6 * sc) * (face ? 1.0 : 0.5);   // light through the petal
  c += warm * pow(max(dot(n, normalize(LK + vec3(0.0, 0.0, 1.0))), 0.0), 14.0) * (face ? 0.16 : 0.04);
  put(c * occ, a);
}
void flower(vec2 q, vec4 h, float open, float L, float W, bool gold, int nt) {
  float phi0 = h.w * TAU;
  float m = floor((PI * 0.5 - phi0) / (PI / 3.0) + 0.5);
  float sg = PI * 0.5 - phi0 - m * PI / 3.0 > 0.0 ? 1.0 : -1.0;
  for (int j = 0; j < 6; j++) {           // the tepal facing us first, the one opposite it last
    if (gTr < 0.004 || j >= nt) return;
    float o = j == 0 ? 0.0 : j == 1 ? sg : j == 2 ? -sg : j == 3 ? 2.0 * sg : j == 4 ? -2.0 * sg : 3.0;
    float idx = m + o;
    tepal(q, phi0 + idx * PI / 3.0, mod(idx, 2.0) < 0.5, open, L, W, h, gold, idx);
  }
}
void leaf(vec2 P, vec2 b, float ang, float len, float wid, float bend, float hj) {
  vec2 dir = vec2(sin(ang), cos(ang)), rg = vec2(dir.y, -dir.x), r = P - b;
  float u = dot(r, dir), sN = u / len;
  float vc = dot(r, rg) - bend * len * sN * sN;
  if (u < -gBm || u > len + gBm || abs(vc) > wid * 1.12 + gBm) return;
  float sc = clamp(sN, 0.0, 1.0);
  float w = wid * 2.26 * pow(sc, 0.35) * pow(1.0 - sc, 1.15) * (1.0 + 0.1 * sin(sc * 19.0 + hj * 9.0));   // a wavy margin
  float d = max(abs(vc) - w, max(-u, u - len));
  float a = ss(gBm, -gBm, d) * min(1.0, wid / gBm) * ss(-gBm, gBm, P.y);
  if (a < 0.003) return;
  lightRow();
  float t = clamp(vc / max(w, 1e-5), -1.0, 1.0);
  // folded along the midrib: one half turns to the lamps, the other away from them; the blue-grey
  // bloom of a tulip leaf shows where it faces the sky
  vec3 n = normalize(vec3(rg * (sign(t) * 0.6 + t * 0.25), 0.75));
  vec3 alb = vec3(0.09, 0.26, 0.13) * (0.85 + 0.3 * hj);
  vec3 c = alb * (gWarm * max(dot(n, LK) * 0.75 + 0.25, 0.0) * 0.9 + 0.008) + SKYFILL * (0.25 + 0.3 * max(n.y, 0.0));
  c += alb * CANDLE * gBack * 0.25 * (1.0 - sc) * (1.0 - 0.5 * abs(t));        // the lamps behind, through the blade
  c *= mix(0.55, 1.0, ss(0.0, 0.12, abs(t))) * mix(0.6, 1.0, ss(0.0, 0.45, sc));   // the crease, and the shade low down
  put(c, a);
}
void stem(vec2 P, float x0, float sw, float Hh) {
  if (P.y > Hh + 0.005 || abs(P.x - x0) > abs(sw) + 0.02 + gBm) return;
  float yy = clamp(P.y, 0.0, Hh), sl = 2.0 * sw * yy / (Hh * Hh);
  float dx = (P.x - x0 - sw * sq(yy / Hh)) / sqrt(1.0 + sl * sl);
  float hw = 0.0034 - 0.001 * yy / Hh;
  float a = strip(dx, hw, gBm) * ss(-gBm, gBm, P.y);
  if (a < 0.003) return;
  lightRow();
  float t = clamp(dx / hw, -1.0, 1.0);
  vec3 n = normalize(vec3(t, 0.1, sqrt(max(1.0 - t * t, 0.0))));
  put(vec3(0.1, 0.2, 0.08) * (gWarm * max(dot(n, LK) * 0.7 + 0.3, 0.0) + SKYFILL * 1.5 + 0.01 + CANDLE * gBack * 0.2 * t * t), a);
}
// the plant from one bulb of the current row; far rows (blob) are drawn as the soft almond of
// colour that is all a lens makes of a tulip there
void plant(vec2 P, float cell, float k, float off, bool blob) {
  float hb = hash21(vec2(cell, k * 1.618 + 0.37));
  if (k > 2.5 && fract(hb * 211.7 + 0.11) < 0.12 + 0.02 * k) return;   // a bulb that did not come up
  vec4 h = fract(hb * vec4(1.0, 7.13, 31.71, 113.3) + vec4(0.0, 0.29, 0.53, 0.77));
  float x0 = cell * CW + off + (h.x - 0.5) * 0.35 * CW;
  if (gZ > 2.0 && gZ < 3.8 && abs(x0 - gFX) < 0.55) return;        // the gravel path before the fountain
  float Hh = 0.33 + 0.12 * h.y, L = 0.09 + 0.018 * h.z, W = 0.0165 + 0.003 * h.x;
  if (abs(P.x - x0) > 0.21 + gBm || P.y > Hh + L + 0.03 + gBm) return;
  // the evening breeze, carried by the mids, running across the bed
  float sway = 0.04 * sin(uTime * 0.5 + x0 * 1.3 + h.z * 6.0) + gMid * 0.22 * sin(uTime * 1.6 - x0 * 2.4 + gZ * 0.8 + h.w * 2.0);
  float sw = sway * Hh * 0.6;
  if (P.y > Hh - 0.05 - gBm && abs(P.x - x0 - sw) < 0.085 + gBm) {
    bool gold = fract(hb * 57.9 + 0.41) < 0.2;
    float bump = gWave * exp(-sq(((x0 - gCam) * gS - gWaveX) / 0.4));
    float open = 0.03 + 0.3 * clamp(0.4 * gBass + 0.7 * gLow[int(h.x * 7.99)], 0.0, 1.0) + 0.32 * bump;
    if (blob) {
      vec2 q = P - vec2(x0 + sw, Hh + L * 0.42);
      vec2 rr = vec2(W * (2.3 + 3.0 * open), L * 0.52);
      float a = ss(gBm, -gBm, (length(q / rr) - 1.0) * min(rr.x, rr.y));
      if (a > 0.003) {
        lightRow();
        float up = clamp(q.y / rr.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 alb = gold ? vec3(1.0, 0.56, 0.05) : mix(vec3(0.8, 0.035, 0.03), vec3(1.0, 0.42, 0.07), 0.35 * up);
        put(alb * (gWarm * (0.45 + 0.3 * up) * (1.0 + 0.6 * bump) + SKYFILL * 1.2) + alb * alb * CANDLE * gBack * 0.7, a);
      }
    } else {
      vec2 q = rot(-(atan(2.0 * sw / Hh) + (h.z - 0.5) * 0.2)) * (P - vec2(x0 + sw, Hh));
      if (abs(q.x) < 0.07 + gBm && q.y > -0.02 - gBm && q.y < L * 1.05 + gBm) {
        gBoost = 1.0 + 0.6 * bump;                       // an opening flower catches more of the light
        flower(q, h, open, L, W, gold, k < 3.5 ? 6 : 3);
        gBoost = 1.0;
        float a = ss(gBm, -gBm, (length((q - vec2(0.0, 0.001)) / vec2(0.0085, 0.008)) - 1.0) * 0.008);
        if (a > 0.003) { lightRow(); put(vec3(0.05, 0.1, 0.03) * (gWarm * 0.5 + 0.2), a); }
      }
    }
  }
  stem(P, x0, sw, Hh);
  // a broad leaf arching low from the foot, and on most plants a narrower one clasping the stem
  if (!blob && P.y < 0.2 && k < 4.5) {
    float hs = fract(hb * 93.7 + 0.13);
    for (int j = 0; j < 2; j++) {
      if (gTr < 0.004 || (j == 1 && hs < 0.3)) return;
      float hj = fract(hb * (17.3 + 11.1 * float(j)) + 0.61);
      float sg = (j == 0 ? 1.0 : -1.0) * (hs < 0.65 ? 1.0 : -1.0);
      float by = j == 0 ? 0.0 : 0.03 + 0.05 * hj;
      leaf(P, vec2(x0 + sw * sq(by / Hh), by),
           sg * (j == 0 ? 0.45 + 0.4 * hj : 0.1 + 0.22 * hj) + sway * (j == 0 ? 0.15 : 0.3),
           j == 0 ? 0.12 + 0.05 * hj : 0.15 + 0.06 * hj, j == 0 ? 0.019 + 0.006 * hj : 0.012 + 0.004 * hj,
           sg * (j == 0 ? 0.3 + 0.3 * hj : 0.12 + 0.2 * hj), hj);
    }
  }
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gCam = 0.06 * sin(uTime * 0.045);                 // the camera drifts a little: the rows part
  gAcc = vec3(0.0);
  gTr = 1.0;
  gFogA = 0.0;
  gFogC = MIST;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    gLow[i] = uAudioActive * clamp(textureLod(uAudio, vec2(0.02 + 0.015 * fi, ROW(0.0)), 0.0).r * 1.5, 0.0, 1.0);
    gHi[i] = uAudioActive * clamp(textureLod(uAudio, vec2(0.69 + 0.037 * fi, ROW(0.0)), 0.0).r * 1.6, 0.0, 1.0);
  }
  // the beat: a wave of opening across the bed, and the candles flare
  float age = uBeatAge;
  gWave = uAudioActive * ss(0.0, 0.05, age) * ss(0.45, 0.28, age);
  float dirn = hash11(uBeatCount * 3.71 + 0.5) < 0.5 ? 1.0 : -1.0;
  gWaveX = dirn * mix(-gAsp - 0.4, gAsp + 0.4, clamp(age / 0.42, 0.0, 1.0));
  gFlare = uAudioActive * uPunch * exp(-age * 6.0) * ss(0.45, 0.3, age);
  gFX = 0.46 * gAsp * 3.9 / F;
  gKX = (-0.45 * gAsp - 0.22 * ss(1.3, 0.6, gAsp)) * ZK / F;
  gMX = 0.2 * gAsp + 0.02;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float z = i == 0 ? 1.0 : i == 1 ? 1.4 : i == 2 ? 2.0 : 3.0;
    float R = gAsp * z / F + 0.25;                  // each walks across and comes round again
    float hd = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;
    float x = mod(hash11(fi * 3.31 + 0.2) * 2.0 * R + hd * (0.035 + 0.006 * fi) * uTime, 2.0 * R) - R + gCam;
    float fl = (0.88 + 0.07 * sin(uTime * 6.3 + fi * 2.0) + 0.05 * sin(uTime * 13.7 + fi))
             * (1.0 + gHigh * 0.9 * (noise(vec2(uTime * 11.0, fi * 7.0)) - 0.5)) + 1.3 * gFlare;
    gTort[i] = vec4(x, z, fl, hd);
    float s = F / z;
    gFlame[i] = vec3((x - gCam) * s, HOR + (0.2 - EYE) * s, s);
  }
  gLampBack = lampsBehind(uv);
  gUv = uv;
  gBoost = 1.0;
  gNeed = false;
  gWarm = KEY;
  gBack = 0.0;

  // the bed, near to far, with the tortoises, the trees, the lamps and the fountain at their depths
  for (int k = 0; k < 10; k++) {
    if (gTr < 0.004) break;
    float fk = float(k);
    gZ = 0.42 * pow(1.4, fk);
    gS = F / gZ;
    float cz = coc(gZ);
    gBm = max(gPx * 0.7, cz) / gS;
    vec2 P = vec2(uv.x / gS + gCam, (uv.y - HOR) / gS + EYE);
    if (P.y < -gBm) break;                          // the soil is nearer than this row: the rest is hidden
    if (P.y < 0.62) {
      gLod = ss(1.2, 3.0, 0.02 * gS / max(gPx, cz));
      gNeed = true;
      gRowP = P;
      air(gZ, P.y);
      float off = k == 0 ? 0.0 : hash11(fk * 7.31 + 0.2) * CW;
      float c0 = floor((P.x - off) / CW + 0.5);
      bool odd = mod(c0, 2.0) > 0.5;
      bool blob = k > 5;
      float side = fract((P.x - off) / CW + 0.5) > 0.5 ? 1.0 : -1.0;   // the neighbour on the nearer side
      for (int j = 0; j < 3; j++) {
        if (gTr < 0.004 || (blob && j == 2)) break;
        float cell = blob ? ((j == 0) == odd ? c0 : c0 + side)
                          : odd ? (j == 0 ? c0 : j == 1 ? c0 - 1.0 : c0 + 1.0) : (j == 0 ? c0 - 1.0 : j == 1 ? c0 + 1.0 : c0);
        plant(P, cell, fk, off, blob);
      }
    }
    if (k >= 2 && k <= 5) tortoise(uv, k - 2);
    else if (k == 6) fountain(uv);
    else if (k == 7) {
      for (int g = 0; g < 2; g++) {
        lamps(uv, float(g));
        if (g == 0) canopy(uv);
      }
    }
  }
  if (gTr > 0.004) {
    cypress(uv, -0.86, 14.0, 9.0, 0.8, 7.0);
    cypress(uv, 0.74, 16.0, 10.5, 0.9, 3.0);
    cypress(uv, -0.12, 19.0, 9.5, 0.8, 1.0);
    ground(uv);
    kosk(uv);
    water(uv);
    shore(uv);
    skyLayer(uv);
  }
  vec3 col = gAcc + (hash21(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0 * 1.5;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'lale', name: 'Lale', group: 'Vibe',
  blurb: 'A Tulip Era night in a palace garden on the Bosphorus: flamed tulips, tortoises carrying candles, glass lamps in the trees; bass opens the cups',
  tags: ['flowers', 'turkish', 'garden', 'night', 'candles', 'bokeh'],
  energy: 0.35, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
