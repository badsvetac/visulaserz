import { SCULPT } from '../js/gfx/scene-kit.js';

// AURORA — an Arctic night on the shore of a frozen fjord. A small red wooden cabin with one warm
// window sits in the snow among snow-laden spruces, smoke rising from its chimney and a jetty
// running out onto the ice; across the fjord a sharp snow-capped peak stands against the sky, and
// above it the northern lights hang in great folded ribbons: a near arc that swings round in an S
// over the peak, a second one further off under its right wing, and a far band low over the
// mountains. They are green at the core with a soft hem that blushes magenta and violet where the
// rays fade out at the top, and the stars show through them. The near ice is snow-streaked and
// cracked; further out it breaks into floes and open black water that mirrors the peak and lights.
//
// The curtains are real sheets hanging over curves on the ground, a hundred kilometres up and two
// to nine hundred away, with the earth curving away under the far ones. They are described from
// where we stand (azimuth along them, and distance), so each arcs down towards the horizon at its
// ends the way an auroral arc does. Each pixel finds where its ray crosses each sheet and how
// obliquely: where a sheet turns edge-on it shows as a bright fold, and its fine vertical rays
// bunch together in perspective, as they do.
//
// Music: the bass brightens the curtains and lifts their rays higher, and with them the green light
// on the snow and the ice; the mids deepen the folds, set a ripple running along the ribbons and
// bring up the magenta in their hems; the highs make the finest rays shimmer and the stars twinkle.
// On every beat the great fold flares and a pulse races outward from it along the hem, and the snow
// on the shore glitters, both gone within half a second. With nothing playing the lights drift
// slowly on their own and nothing pulses.
const frag = `${SCULPT}
const vec3 GREEN = vec3(0.14, 1.0, 0.42);
const vec3 VIOLET = vec3(0.52, 0.05, 0.72);
const vec3 MAGENTA = vec3(1.0, 0.1, 0.62);
const vec3 WARM = vec3(1.75, 0.78, 0.26);
const float LENS = 2.0;
const float EARTH = 64.0;          // the earth's radius in these units (1 = 100 km)

float gPx, gAsp, gPf, gYh, gShore, gGlow, gRip, gPulse, gPulseR, gGlint, gMidS, gFoldS;
vec3 gSnowLit, gSky, gAur;         // the light on snow: the night sky, the aurora's green, and both
vec2 gPeak;                        // the summit: x, and its height above the horizon
vec3 gCab;                         // the cabin: the foot of its front wall, and its scale

// ── the curtains ───────────────────────────────────────────────────────────────────────────────
// A curtain hangs over a curve on the ground, described from where we stand: s is the azimuth its
// foot would have if it did not fold, curtainAt(s) = (the azimuth it is at, how far away it is).
// The main swing is a trochoid: as the foot swings sideways it also comes nearer and goes away, so
// where it folds over (kF1 * kW1 > 1) the fold stands nearer than the stretches either side. The
// base is an arc, nearest in the middle and going away towards the horizon at both sides, the way
// an auroral arc spans the northern sky. These are set before each curtain is traced.
float kD0, kDq, kS0, kDl, kF1, kW1, kP1, kDd, kQ, kF2, kW2, kP2, kR;
vec2 curtainAt(float s) {
  float th = kW1 * s + kP1, th2 = kW2 * s + kP2, d = s - kS0;
  return vec2(s + kF1 * sin(th) + kF2 * sin(th2) + kR * sin(13.0 * s - uTime * 2.2),
              kD0 + kDq * d * d + kDl * s - kDd * cos(th + kQ) + 0.3 * kDd * cos(th2));
}
vec2 curtainDer(float s) {
  float th = kW1 * s + kP1, th2 = kW2 * s + kP2, d = s - kS0;
  return vec2(1.0 + kF1 * kW1 * cos(th) + kF2 * kW2 * cos(th2) + kR * 13.0 * cos(13.0 * s - uTime * 2.2),
              2.0 * kDq * d + kDl + kDd * kW1 * sin(th + kQ) - 0.3 * kDd * kW2 * sin(th2));
}
float erfA(float x) { x = clamp(x, -3.0, 3.0); return tanh(x * (1.128379 + 0.1009 * x * x)); }

// The light a curtain sends along a ray where the ray meets it: s is where along the curtain, P
// its azimuth and distance there and D how they change along it. Seen edge-on (a fold) the ray
// runs a long way in the sheet and it is brighter, and its rays bunch together in perspective.
vec3 sheetLight(float s, vec2 P, vec2 D, float tanE, float cosE, float hem, float seed, float pulse, float sPulse, float fine) {
  float g = abs(D.x);
  float tang = g * P.y;                             // the sheet's run across the line of sight, and along it
  float L = length(vec2(tang, D.y));
  float path = L / sqrt(tang * tang + 0.06 * L * L + 1e-8) / cosE;
  float alt = P.y * tanE + P.y * P.y / (2.0 * EARTH);
  // along the curtain in the units of its rays: the arc's sides run away from us, so they hold
  // more curtain per degree than its middle
  float dc = s - kS0;
  float sg = kD0 * s + kDq * dc * abs(dc);
  float dsg = kD0 + 2.0 * kDq * abs(dc);
  float a = alt - hem - 0.09 * (noise(vec2(sg * 0.8, seed)) - 0.5) - 0.035 * (noise(vec2(sg * 4.0, seed + 0.5)) - 0.5);
  if (a <= -0.24 || a >= 2.2) return vec3(0.0);
  float sPix = dsg * (gPx / LENS) / max(g, 0.03);  // how much curtain one pixel spans
  float up = max(a, 0.0);
  // the rays: broad bundles, single rays reaching their own heights, thin bright rays that come
  // and go along their length, and the finest ones that shimmer with the highs. Where the curtain
  // is seen so obliquely that a pixel spans many rays, they blend to their mean
  float f1 = ss(0.45, 0.12, 2.5 * sPix), f2 = ss(0.45, 0.12, 7.0 * sPix);
  float f3 = ss(0.45, 0.12, 15.0 * sPix) * fine, f4 = ss(0.45, 0.12, 36.0 * sPix) * fine, f5 = ss(0.45, 0.12, 70.0 * sPix) * fine;
  float bundle = mix(0.5, noise(vec2(sg * 2.5, seed + 1.0)), f1);
  float hn = mix(0.5, noise(vec2(sg * 7.0, seed + 2.0)), f2);
  float r3 = 0.3, r4 = 0.3, r5 = 0.5;
  if (f3 > 0.0) { r3 = 1.0 - abs(2.0 * noise(vec2(sg * 15.0, seed + 3.0 + up * 0.7)) - 1.0); r3 = mix(0.3, r3 * r3 * r3, f3); }
  if (f4 > 0.0) { r4 = 1.0 - abs(2.0 * noise(vec2(sg * 36.0, seed + 4.0 + up * 1.4)) - 1.0); r4 = mix(0.3, r4 * r4 * r4, f4); }
  if (f5 > 0.0) r5 = noise(vec2(sg * 70.0, seed + 6.0 + uTime * 2.6));
  float ray = (0.3 + 0.7 * bundle) * (0.3 + 0.95 * r3 + 0.75 * r4 + (0.15 + 0.8 * gHigh) * (r5 - 0.5) * f5);
  // bright stretches drift along the curtain, with dark gaps between them
  float act = 0.05 + 0.95 * ss(0.3, 0.72, noise(vec2(sg * 0.5 - uTime * 0.07, seed + 9.0)));
  float b1 = (s - sPulse - gPulseR) / 0.06, b2 = (s - sPulse + gPulseR) / 0.06;
  float burst = pulse * (exp(-b1 * b1) + exp(-b2 * b2));
  float Lr = min((0.21 + 0.12 * gBass + 0.1 * burst) * (0.45 + 2.2 * hn * hn * hn + 0.5 * r3), 0.8);
  float hemS = ss(-0.24, 0.02, a) * (0.35 + 0.65 * ss(-0.07, 0.02, a)) * ss(2.2, 1.1, a);   // a soft hem; the rays thin out into space
  float body = hemS * exp(-up / Lr);
  float top = hemS * exp(-up / (Lr * 1.8 + 0.16)) * ss(0.12, 0.55, a);
  float fa = (a + 0.085) / 0.085;
  float fringe = exp(-fa * fa) * ss(0.4, 0.8, bundle) * (0.15 + 0.85 * gMidS);
  vec3 e = GREEN * body * ray * (1.0 - 0.7 * fringe) + VIOLET * top * ray * 0.45 + MAGENTA * fringe * 0.32 * (0.6 + 0.4 * ray);
  e = e * (1.0 + 1.2 * burst) + vec3(0.45, 1.0, 0.7) * burst * hemS * exp(-up / 0.07) * 2.2;   // the pulse runs along the hem
  return e * path * max(act, 0.8 * burst);
}

// A folding curtain along a ray at azimuth phiP climbing at tanE. The curve is walked on a fixed
// lattice of s (the same for every pixel, so nothing crawls), only over the stretch where it can
// be at that azimuth; between two samples the sheet's thickness (never thinner than a pixel) says
// how much of it the ray crossed, and where it did, one Newton step finds the place exactly.
vec3 traceCurtain(float phiP, float tanE, float cosE, float ds, float w, float hem, float seed, float pulse, float sPulse) {
  vec3 acc = vec3(0.0);
  float span = kF1 + kF2 + kR + ds;
  // how near and how far the curtain can be over that stretch: if the ray is below its hem at the
  // far end or above its rays at the near end, it misses it altogether
  float s1 = phiP - span, s2 = phiP + span, d1 = s1 - kS0, d2 = s2 - kS0;
  float qlo = d1 * d2 < 0.0 ? 0.0 : min(d1 * d1, d2 * d2), qhi = max(d1 * d1, d2 * d2);
  float dLo = max(kD0 + kDq * qlo + min(kDl * s1, kDl * s2) - 1.3 * kDd, 0.3);
  float dHi = kD0 + kDq * qhi + max(kDl * s1, kDl * s2) + 1.3 * kDd;
  if (dHi * tanE + dHi * dHi / (2.0 * EARTH) < hem - 0.3 || dLo * tanE + dLo * dLo / (2.0 * EARTH) > hem + 2.25) return acc;
  float i0 = floor(s1 / ds);
  float n = ceil(2.0 * span / ds) + 1.0;
  float pixA = gPx / LENS;                          // radians per pixel
  float sA = i0 * ds;
  float GA = curtainAt(sA).x - phiP;
  for (int i = 1; i <= 32; i++) {
    if (float(i) > n) break;
    float sB = (i0 + float(i)) * ds;
    vec2 PB = curtainAt(sB);
    float GB = PB.x - phiP;
    // the sheet is thin at its hem and spreads as it rises, so a fold's edge is crisp low down and
    // soft high up, where the light is faint
    float aB = PB.y * tanE + PB.y * PB.y / (2.0 * EARTH) - hem;
    float we = max(w * (1.0 + 5.0 * clamp(aB, 0.0, 2.0)) / PB.y, 1.4 * pixA);
    float cov = 0.0;
    if (GA * GB <= 0.0 || min(abs(GA), abs(GB)) < 2.2 * we) cov = 0.5 * abs(erfA(GB / we) - erfA(GA / we));
    if (cov > 0.004) {
      float dG = GA - GB;
      float s = mix(sA, sB, clamp(GA / (abs(dG) > 1e-6 ? dG : 1e-6), 0.0, 1.0));
      vec2 P = curtainAt(s), D = curtainDer(s);
      float sN = abs(D.x) > 1e-4 ? clamp(s - (P.x - phiP) / D.x, sA, sB) : s;    // one Newton step onto the curve
      P += D * (sN - s);
      acc += sheetLight(sN, P, D, tanE, cosE, hem, seed, pulse, sPulse, 1.0) * cov;
    }
    sA = sB; GA = GB;
  }
  return acc;
}

// the air under a curtain's hem glows with its light: a soft band along the hem, following the
// curtain's swings nearer and further but not its folds, so a fold's edge never cuts it off
float hemGlow(float phiP, float tanE, float hem) {
  float D = curtainAt(phiP).y;
  float tH = (hem - D * D / (2.0 * EARTH)) / D;
  float x = (tanE - tH) * D;                        // in units of altitude near the hem
  return x < 0.0 ? exp(x / 0.2) : exp(-x / 0.6);
}
vec3 aurora(vec3 rd) {
  float rh = length(rd.xz);
  float phiP = atan(rd.x, rd.z);
  float tanE = rd.y / rh;
  float cosE = rh / length(rd);
  vec3 c = vec3(0.0);
  float glow = 0.0;
  // the hero: an arc nearest in the middle, its great fold standing over the centre of the frame
  kD0 = 2.7; kDq = 9.0; kS0 = 0.08; kDl = -0.2;
  kF1 = 0.30 + 0.04 * gMidS; kW1 = 3.6; kP1 = PI - 3.6 * gFoldS; kDd = 0.4; kQ = 0.6 * PI;
  kF2 = 0.05; kW2 = 12.0; kP2 = uTime * 0.21; kR = gRip;
  c += traceCurtain(phiP, tanE, cosE, 0.045, 0.016, 1.0, 3.0, gPulse, gFoldS);
  glow += hemGlow(phiP, tanE, 1.0);
  // a second arc further off, under the hero's right wing
  kD0 = 4.4; kDq = 4.0; kS0 = 0.5; kDl = 0.0;
  kF1 = 0.2 + 0.03 * gMidS; kW1 = 4.5; kP1 = 1.0 - uTime * 0.03; kDd = 0.6; kQ = 0.5;
  kF2 = 0.04; kW2 = 14.0; kP2 = -uTime * 0.17; kR = gRip * 0.5;
  c += traceCurtain(phiP, tanE, cosE, 0.045, 0.026, 1.05, 11.0, gPulse * 0.5, gFoldS) * 0.7;
  glow += hemGlow(phiP, tanE, 1.05) * 0.7;
  // the far one, a soft band low over the mountains: too far off to fold where we see it, so the
  // ray meets it once and there is nothing to trace
  kD0 = 7.0; kDq = 1.0; kS0 = 0.3; kDl = 0.0;
  kF1 = 0.0; kW1 = 5.0; kP1 = 1.0 + uTime * 0.04; kDd = 0.8; kQ = 0.2;
  kF2 = 0.0; kW2 = 13.0; kP2 = uTime * 0.1; kR = 0.0;
  c += sheetLight(phiP, curtainAt(phiP), curtainDer(phiP), tanE, cosE, 1.0, 23.0, 0.0, 0.0, 0.35) * 0.9;
  glow += hemGlow(phiP, tanE, 1.0) * 0.6;
  c += GREEN * 0.09 * glow * (0.6 + 0.8 * noise(vec2(phiP * 3.0 - uTime * 0.02, 4.0)));
  c *= 0.55 * gGlow * mix(0.55, 1.0, ss(0.0, 0.25, tanE));
  return c / (1.0 + 0.5 * c.g);                    // a bright fold stays green instead of burning white
}

// ── the sky, the peak and the far shore ────────────────────────────────────────────────────────
vec3 skyAt(float h) {
  vec3 c = mix(vec3(0.032, 0.055, 0.095), vec3(0.012, 0.022, 0.058), ss(0.0, 0.5, h));
  c = mix(c, vec3(0.006, 0.011, 0.038), ss(0.4, 1.4, h));
  return c + GREEN * 0.07 * gGlow * exp(-h * 3.2);   // the aurora's light in the low sky
}
// the Milky Way, a faint band of light slanting up the sky with a dark lane of dust along it
float milkyBand(vec2 uv) {
  vec2 q = rot(0.5) * (uv - vec2(-0.5, 0.75));
  float w = 0.2 + 0.06 * sin(q.x * 1.7 + 1.0);
  return exp(-q.y * q.y / (w * w));
}
vec3 milkyWay(vec2 uv, float band) {
  if (band < 0.03) return vec3(0.0);
  vec2 q = rot(0.5) * (uv - vec2(-0.5, 0.75));
  float n = noise(q * vec2(2.5, 8.0)) * 0.6 + noise(q * vec2(6.0, 19.0) + 3.0) * 0.4;
  float lane = ss(0.42, 0.7, noise(q * vec2(3.0, 11.0) + 7.0)) * exp(-q.y * q.y / 0.008);
  return vec3(0.045, 0.05, 0.075) * band * (0.45 + 0.9 * n) * (1.0 - 0.75 * lane);
}
vec3 stars(vec2 uv, float band) {
  vec3 c = vec3(0.0);
  for (int l = 0; l < 2; l++) {
    float fl = float(l);
    float cell = l == 0 ? 0.012 : 0.032;
    vec2 g = uv / cell + fl * 17.3;
    vec2 id = floor(g);
    float h = hash21(id + fl * 31.0);
    float keep = (l == 0 ? 0.8 : 0.82) - 0.1 * band;   // more of the faint ones in the Milky Way
    if (h < keep) continue;
    float m = (h - keep) / (1.0 - keep);
    vec2 jit = vec2(hash21(id + 5.3), hash21(id + 9.1)) - 0.5;
    vec2 d = (fract(g) - 0.5 - jit * 0.4) * cell / gPx;
    float mag = l == 0 ? 0.04 + 0.1 * m * m : 0.12 + 0.9 * m * m * m;
    float tw = 0.8 + 0.2 * sin(uTime * (0.7 + 2.0 * hash21(id + 2.0)) + h * 50.0) + gHigh * 0.6 * sin(uTime * 11.0 + h * 80.0);
    c += mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.9, 0.78), hash21(id + 4.0)) * exp(-dot(d, d) / 1.1) * mag * tw;
  }
  return c;
}
// the far range along the horizon, and the peak standing out of it: heights above the horizon
float rangeH(float x) {
  float n = noise(vec2(x * 2.2, 1.0)) * 0.6 + noise(vec2(x * 5.5, 2.0)) * 0.3 + noise(vec2(x * 14.0, 3.0)) * 0.1;
  return 0.02 + 0.09 * n * n;
}
float peakH(float x) {
  float d = x - gPeak.x;
  float u = abs(d) / (d < 0.0 ? 0.3 : 0.5);           // a steep face on the left, a long ridge on the right
  float k = max(1.0 - u, 0.0);
  float h = gPeak.y * (0.68 * k * k + 0.32 * k);
  h -= gPeak.y * 0.05 * ss(0.02, 0.06, d) * ss(0.16, 0.08, d);             // a notch below the horn
  float d2 = d - 0.36, u2 = abs(d2) / 0.28, k2 = max(1.0 - u2, 0.0);
  h = max(h, gPeak.y * 0.48 * (0.6 * k2 * k2 + 0.4 * k2));                 // a shoulder
  float rough = ss(0.0, 0.25, k + k2);
  return h + (0.016 * (noise(vec2(x * 22.0, 5.0)) - 0.5) + 0.007 * noise(vec2(x * 64.0, 6.0))) * rough;
}
vec3 mountainCol(vec2 uv, float h, float top, float isPeak) {
  float x = uv.x;
  float d = x - gPeak.x;
  float below = top - h;
  // snow caps the top and breaks up downwards into streaks down the gullies; bare rock between
  // and below, and the foot of the mountain dark with rock and forest
  float wob = noise(vec2(x * 7.0, h * 7.0));
  float streak = noise(vec2(x * 24.0 + h * 9.0 * sign(d) + wob * 2.2, h * 2.6)) * 0.65 + noise(vec2(x * 70.0 + h * 20.0 * sign(d), h * 6.0)) * 0.35;
  float level = mix(1.0 - below / max(top, 0.02), h / max(gPeak.y, 0.1), isPeak);   // 1 at the top
  float snow = ss(0.36, 0.56, level * 0.85 + (streak - 0.5) * 1.1 + (wob - 0.5) * 0.3);
  snow *= 0.55 + 0.45 * ss(0.3, 0.6, level + (streak - 0.5) * 0.5);           // thinner, patchier lower down
  // the face turned to the left catches more of the sky than the one behind the ridge
  float th = atan(d, gPeak.y - h);
  float face = ss(-0.04, 0.05, th - 0.42 + 0.12 * (wob - 0.5)) * isPeak;      // the arete runs down to the right
  float lit = mix(1.0, 0.42, face) * mix(0.6, 1.0, isPeak) * (0.85 + 0.3 * streak);
  vec3 c = mix(vec3(0.013, 0.018, 0.032) * (0.6 + 0.8 * wob) * mix(1.0, 0.6, face), gSnowLit * 2.1 * lit, snow);
  c *= mix(0.3, 1.0, ss(0.0, 0.09, h));                                      // the foot in shadow and forest
  c += GREEN * 0.1 * gGlow * ss(0.007, 0.0, below) * (0.3 + 0.7 * snow);     // the crest rimmed by the lights behind
  return mix(c, skyAt(h) * 1.2, 0.06 + 0.3 * ss(0.1, 0.0, h) * (1.0 - 0.6 * isPeak));
}
// everything beyond the lake, at a point of the frame: also what the water mirrors
vec3 farScene(vec2 uv) {
  float h = uv.y - gYh;
  vec3 col = skyAt(h);
  float pk = peakH(uv.x), rg = rangeH(uv.x);
  float top = max(pk, rg);
  float dM = h - top;
  if (dM > -gPx * 1.5) {
    float band = milkyBand(uv);
    col += stars(uv, band) + milkyWay(uv, band);
    col += aurora(normalize(vec3(uv.x, h, LENS)));
  }
  float inM = ss(gPx, -gPx, dM);
  if (inM > 0.0) col = mix(col, mountainCol(uv, h, top, ss(-0.01, 0.01, pk - rg)), inM);
  // the far shore: a low line of forest where the ice ends
  float tx = uv.x * 70.0;
  float tree = 0.004 + 0.008 * noise(vec2(uv.x * 9.0, 7.0)) + 0.006 * (1.0 - abs(fract(tx) - 0.5) * 2.0) * hash11(floor(tx) + 3.0);
  col = mix(col, vec3(0.006, 0.009, 0.015) + gSnowLit * 0.05, ss(gPx, -gPx, abs(h) - tree * step(0.0, h) - 0.0025 * step(h, 0.0)));
  return col;
}

// ── the frozen lake ────────────────────────────────────────────────────────────────────────────
// The lake is a plane one eye height below us. The near part is ice under snow, combed into
// streaks by the wind and crossed by long cracks, with a few holes of open water; further out the
// ice breaks up into floes and gives way to still black water that mirrors the mountains and the
// lights. A band of dark new ice runs along the water's edge.
vec3 voro(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  vec2 id1 = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c = vec2(float(x), float(y));
    vec2 r = c + vec2(hash21(i + c), hash21(i + c + 17.3)) * 0.8 + 0.1 - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id1 = i + c; } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d2) - sqrt(d1), hash21(id1 + 3.7), 0.0);
}
float waterD(vec2 g) {
  // how far (along the ground, towards us) the point is from the open water: below 0 is water
  float edge = 9.5 + 1.8 * sin(g.x * 0.13 + 1.1) + 2.4 * (noise(vec2(g.x * 0.08, 3.0)) - 0.5);
  float rag = (noise(g * vec2(0.45, 1.0)) - 0.5) * 1.6 + (noise(g * vec2(1.6, 3.4) + 5.0) - 0.5) * 0.5;
  float d = edge - g.y + rag;
  return d;
}
vec3 lakeAt(vec2 uv) {
  float depth = max(gYh - uv.y, 1e-4);
  float z = LENS / depth;
  vec2 g = vec2(uv.x * z / LENS, z);                 // the ice under this pixel: across, and away
  float fz = gPx * z / depth, fx = gPx * z / LENS;   // how much ice one pixel spans, away and across
  float lod = ss(1.0, 0.25, fz);                     // 1 where the streaks and cracks are resolved
  float dW = waterD(g);
  float water = ss(fz * 0.6, -fz * 0.6, dW);
  // floes drifting in the water near the edge of the ice, more of them the nearer the edge
  float floe = 0.0, fh = 0.0;
  if (dW < 0.5 && dW > -7.0) {
    vec3 vo = voro(g * vec2(0.5, 1.0));
    float pc = max(fx * 0.5, fz) * 1.2;
    floe = step(vo.y, 0.8 * ss(-7.0, -0.3, dW)) * ss(0.1 - pc, 0.1 + pc, vo.x) * water;
    fh = vo.y;
  }
  water -= floe;
  float dark = ss(0.9, 0.1, dW + (noise(g * vec2(0.7, 1.5) + 9.0) - 0.5) * 1.2) * (1.0 - water - floe);   // new ice, still clear
  float rim = ss(0.1 + fz, 0.0, abs(dW - 0.05)) * lod * (1.0 - water - floe);                       // thin white ice at the edge
  // the snow on the ice, combed along the wind, thinner in places so the ice shows through
  vec2 gw = mat2(0.87, 0.5, -0.5, 0.87) * g;            // the wind came across the lake at a slant
  float streak = mix(0.5, noise(gw * vec2(0.25, 1.4)) * 0.6 + noise(gw * vec2(0.7, 3.6) + 3.0) * 0.4, lod);
  float cover = ss(0.18, 0.5, streak) * (1.0 - dark);
  // long cracks wandering across it, and finer ones between them
  vec2 cq = g * vec2(0.22, 0.5);
  cq += vec2(noise(cq * 0.7 + 4.0), noise(cq * 0.7 + 7.0)) * 1.3;
  float cw = max(0.014, 1.5 * max(0.22 * fx, 0.5 * fz));
  float crack = ss(cw, 0.0, abs(noise(cq) - 0.5)) * (0.014 / cw);
  float cw2 = max(0.012, 1.5 * max(0.6 * fx, 1.3 * fz));
  crack = max(crack, ss(cw2, 0.0, abs(noise(g * vec2(0.6, 1.3) + 11.0) - 0.5)) * (0.012 / cw2) * ss(0.45, 0.7, noise(g * 0.2 + 5.0)) * 0.7);
  crack *= 1.0 - water - floe;
  vec3 refl = vec3(0.0);
  if (water + dark > 0.003) {
    vec2 uvR = vec2(uv.x + 0.0015 * depth * sin(g.x * 1.7 + g.y * 0.9 + uTime * 0.6), 2.0 * gYh - uv.y);
    refl = farScene(uvR);
  }
  float fres = 0.62 + 0.3 * ss(0.3, 0.0, depth);
  vec3 sheen = skyAt(depth) * 0.7 + GREEN * 0.05 * gGlow * ss(0.45, 0.0, depth);     // the lit sky, dull in the ice
  vec3 snowC = gSky * (0.72 + 0.3 * streak) + gAur * (0.95 + 0.4 * streak) + sheen * 0.25;
  vec3 icol = mix(sheen + vec3(0.006, 0.012, 0.02), snowC, cover);
  icol = mix(icol, refl * 0.3 + vec3(0.002, 0.005, 0.009), dark);
  icol = mix(icol, icol * 0.3, crack * mix(1.0, 0.5, dark));
  icol += (gSky + gAur) * 0.55 * rim;
  vec3 floeC = (gSky * 0.85 + gAur * 1.1) * (0.8 + 0.3 * fh);
  return icol * (1.0 - water - floe) + refl * fres * water + floeC * floe;
}

// ── the shore ──────────────────────────────────────────────────────────────────────────────────
float shoreY(float x) {
  float l = ss(0.15, 1.0, -x / gAsp);
  return gShore + 0.13 * l * l + 0.022 * sin(x * 2.3 + 0.6) + 0.012 * (noise(vec2(x * 6.0, 4.0)) - 0.5);
}
vec3 snowGround(vec2 uv, float sy) {
  float dn = sy - uv.y;
  float span = sy + 1.0;
  // the snow is lit by the sky and, more where it lies flat towards the lake, by the lights
  float t = clamp(dn / span, 0.0, 1.0);
  vec3 c = gSky * (1.05 - 0.2 * t) + gAur * (1.35 - 0.6 * t);
  // two long drifts across the bank: the slope behind each crest is turned to the lights and
  // glows with them, the face towards us lies in blue shade that fades as it flattens out
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float yc = sy - span * (0.22 + 0.38 * fi) + span * 0.16 * (noise(vec2(uv.x * (1.1 - 0.35 * fi) + fi * 7.0, fi)) - 0.5);
    float on = ss(0.25, 0.6, noise(vec2(uv.x * (0.8 - 0.25 * fi) + fi * 3.1, 2.0 + fi)));
    float d = yc - uv.y;
    float w = span * (0.07 + 0.06 * fi);
    float face = ss(-gPx * 1.5, gPx * 1.5, d) * exp(-max(d, 0.0) / w);
    float back = ss(gPx * 1.5, -gPx * 1.5, d) * exp(min(d, 0.0) / (w * 0.6));
    c = mix(c, c * vec3(0.6, 0.7, 1.0), face * on * 0.6);
    c += gAur * 0.5 * back * on;
  }
  // the cabin and the spruces by it, lit from behind by the lights, throw long soft shadows towards us
  {
    float k = gCab.z / 0.15;
    float below = gCab.y - uv.y;
    if (below > 0.0) {
      float spreadW = 1.0 + below * 3.0;
      vec3 sx = (uv.x - gCab.x - vec3(0.06, 0.31, -0.13) * k) / (vec3(0.11, 0.05, 0.035) * k * spreadW);
      float sh = dot(exp(-sx * sx), vec3(1.0, 0.7, 0.5));
      c *= 1.0 - 0.38 * min(sh, 1.0) * exp(-below / (0.22 * k)) * ss(0.0, 0.03, below);
    }
  }
  c *= 0.97 + 0.06 * noise(uv * vec2(40.0, 90.0));                  // the grain of the snow
  c += (gSky + gAur) * 0.3 * ss(0.02, 0.0, dn);                      // the lip of the bank
  vec2 wp = (uv - vec2(gCab.x, gCab.y - 0.2 * gCab.z)) / gCab.z;
  c += WARM * 0.2 * exp(-dot(wp * vec2(0.85, 2.8), wp * vec2(0.85, 2.8)));   // the window's light on the snow
  // a path trodden from the cabin down through the snow towards us, its footprints in blue shade
  float pv = clamp((gCab.y - uv.y) / (gCab.y + 1.0), 0.0, 1.0);
  float pcx = gCab.x + gCab.z * 1.15 + (-0.55 * pv - 0.25 * pv * pv) * mix(1.0, 0.5, gPf) + 0.03 * sin(pv * 7.0);
  float pw = gCab.z * (0.12 + 0.9 * pv * pv);
  float trail = ss(pw, pw * 0.45, abs(uv.x - pcx)) * step(uv.y, gCab.y + 0.06 * gCab.z) * ss(0.0, 0.04, pv + 0.02);
  float steps = ss(0.25, 0.65, noise(vec2((uv.x - pcx) / pw * 2.0, pv * 26.0 / (0.3 + pv))));
  c = mix(c, c * vec3(0.55, 0.68, 0.95) * (0.85 + 0.25 * steps), trail * 0.75);
  // glints: a few always, and on the beat a scatter of them over the bank
  vec2 gg = uv * 150.0;
  vec2 id = floor(gg);
  float h = hash21(id + 31.0);
  vec2 off = vec2(hash21(id + 1.7), hash21(id + 5.3)) - 0.5;
  vec2 d = (fract(gg) - 0.5 - off * 0.6) / 150.0 / gPx;
  float spark = exp(-dot(d, d) / 0.45) + 0.35 * exp(-abs(d.x * d.y) * 3.0 - dot(d, d) * 0.08);
  float tw = step(0.993, h) * pow(max(sin(uTime * (0.6 + 1.5 * h) + h * 40.0), 0.0), 6.0);
  float bt = step(0.984, hash21(id + floor(uBeatCount) * 1.37)) * gGlint;
  c += vec3(0.85, 0.95, 1.0) * spark * (0.8 * tw + 3.0 * bt) * ss(0.0, 0.03, dn);
  return c;
}
// a snowy spruce standing at b, h tall, w its half width at the lowest branches: tiers of branches
// that spread at their foot and droop at the tips, each tier a little different. Snow lies in
// clumps on their upper faces, and the lights behind the tree catch the snow along its outline.
vec3 drawSpruce(vec2 uv, vec3 col, vec2 b, float h, float w, float seed) {
  vec2 q = uv - b;
  float f = q.y / h;
  if (f < -0.06 || f > 1.02 || abs(q.x) > w * 1.25) return col;
  float ax = abs(q.x) / w;
  float tiers = 7.0 + floor(seed * 5.0);
  float wob = 0.12 * (noise(vec2(q.x * 9.0 / w, seed * 9.0)) - 0.5);
  float tq = clamp(f, 0.0, 1.0) * tiers + seed * 3.7 + ax * 0.45 + wob;   // the tips droop
  float k = fract(tq), tier = floor(tq);
  float spread = pow(1.0 - k, 0.75) * ss(0.0, 0.12, k + 0.02);
  float hw = w * pow(max(1.0 - f, 0.0), 0.95) * (0.42 + 0.58 * spread) * (0.82 + 0.36 * hash11(tier * 7.3 + seed * 31.0));
  hw *= 0.86 + 0.28 * noise(vec2(q.y * 45.0 / h, seed * 40.0 + sign(q.x)));      // ragged branch ends
  hw = max(hw, f < 0.12 ? w * 0.06 : 0.0);                                         // the trunk at the foot
  float cov = ss(gPx, -gPx, abs(q.x) - hw) * ss(-gPx, gPx, f + 0.04);
  if (cov <= 0.0) return col;
  float clumps = noise(vec2(q.x * 12.0 / w, f * tiers * 2.2) + seed * 7.0);
  float snow = ss(0.1, 0.32, k) * ss(0.98, 0.6, k) * ss(0.36, 0.66, clumps + 0.22 * (1.0 - k)) * ss(1.05, 0.65, abs(q.x) / max(hw, 1e-4));
  snow *= 0.45 + 0.55 * f;                                                         // more of it higher up
  float rim = ss(gPx * 3.0, 0.0, hw - abs(q.x)) * (0.35 + 0.65 * snow);
  vec3 needles = vec3(0.005, 0.011, 0.012) + gSky * 0.06;
  vec3 c = mix(needles, gSky * (0.55 + 0.35 * k) + gAur * 0.55, snow);
  c += gAur * 1.2 * rim;
  return mix(col, c, cov);
}
// the cabin, in its own frame: the front gable wall is 1 wide and 0.62 to the eaves, standing on q = 0
float edgeD(vec2 p, vec2 a, vec2 b) { vec2 e = normalize(b - a); return e.y * (p.x - a.x) - e.x * (p.y - a.y); }
float quad(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) { return max(max(edgeD(p, a, b), edgeD(p, b, c)), max(edgeD(p, c, d), edgeD(p, d, a))); }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
vec3 drawCabin(vec2 uv, vec3 col) {
  float sc = gCab.z;
  vec2 q = (uv - gCab.xy) / sc;
  float px = gPx / sc;
  if (q.x < -0.8 || q.x > 1.9 || q.y < -0.12 || q.y > 1.4) return col;
  vec3 falu = vec3(0.36, 0.045, 0.03);
  vec3 wallLit = gSnowLit * 2.6 + vec3(0.05, 0.035, 0.03);
  vec2 win = vec2(0.0, 0.35);
  float spill = exp(-length((q - win) * vec2(1.0, 1.25)) * 3.2);
  // the long side wall, going away to the right
  float dS = quad(q, vec2(0.5, 0.0), vec2(1.55, 0.085), vec2(1.55, 0.67), vec2(0.5, 0.62));
  if (dS < px) {
    float planks = ss(0.1, 0.0, abs(fract((q.x - 0.5) * 9.0) - 0.5) - 0.42);
    vec3 c = falu * wallLit * 0.55 * (1.0 - 0.35 * planks);
    float dDoor = quad(q, vec2(1.08, 0.05), vec2(1.3, 0.068), vec2(1.3, 0.5), vec2(1.08, 0.485));
    c = mix(c, vec3(0.03, 0.012, 0.01) + WARM * 0.25 * ss(px * 2.0, 0.0, abs(q.x - 1.29)) * step(q.y, 0.48), ss(px, -px, dDoor));
    c = mix(c, vec3(0.32, 0.33, 0.36) * wallLit * 0.4, ss(px, -px, abs(q.x - 1.525) - 0.025));      // white corner board
    c *= 1.0 - 0.45 * ss(0.09, 0.0, 0.62 + (q.x - 0.5) * 0.048 - q.y);                             // under the eave
    col = mix(col, c, ss(px, -px, dS));
  }
  // the front gable wall, with the window
  float dF = max(max(-q.y, abs(q.x) - 0.5), (q.y - 1.0 + abs(q.x) * 0.76) * 0.796);
  if (dF < px) {
    float planks = ss(0.1, 0.0, abs(fract(q.x * 11.0) - 0.5) - 0.42);
    vec3 c = falu * (wallLit + WARM * 0.55 * spill) * (1.0 - 0.3 * planks);
    c *= 1.0 - 0.5 * ss(0.08, 0.0, 1.0 - abs(q.x) * 0.76 - q.y);                                   // under the eaves
    vec3 trim = vec3(0.34, 0.35, 0.38) * (wallLit * 0.45 + WARM * 0.35 * spill);
    c = mix(c, trim, ss(px, -px, abs(abs(q.x) - 0.475) - 0.025));                                  // white corner boards
    vec2 wq = q - win;
    float dW = max(abs(wq.x) - 0.17, abs(wq.y) - 0.15);
    c = mix(c, trim * 1.3, ss(px, -px, dW));
    float dG = max(abs(wq.x) - 0.13, abs(wq.y) - 0.115);
    vec3 glow = WARM * (0.75 + 0.35 * exp(-length(wq - vec2(0.03, -0.06)) * 9.0)) * (0.97 + 0.03 * sin(uTime * 2.3));
    glow = mix(glow, trim * 1.3, ss(px, -px, min(abs(wq.x), abs(wq.y)) - 0.012));                 // the cross bars
    c = mix(c, glow, ss(px, -px, dG));
    col = mix(col, c, ss(px, -px, dF));
  }
  // the roof under its snow: the near slope, and the far one seen on edge
  float dR = quad(q, vec2(0.62, 0.53), vec2(1.68, 0.61), vec2(1.1, 1.08), vec2(0.0, 1.035));
  float dL = seg(q, vec2(0.0, 1.02), vec2(-0.64, 0.51)) - 0.05;
  float dE = seg(q, vec2(0.0, 1.02), vec2(0.64, 0.52)) - 0.05;
  float roof = ss(px, -px, min(min(dR, dL), dE));
  if (roof > 0.0) {
    float n = noise(q * vec2(6.0, 14.0));
    vec3 c = gSnowLit * (1.35 + 0.2 * n);
    c *= 1.0 - 0.3 * ss(0.03, -0.04, min(dL, dE)) * step(min(dL, dE), dR);                       // the snow's thickness at the edges
    c += GREEN * 0.06 * gGlow * ss(0.05, 0.0, abs(dR + 0.0)) * step(0.9, q.y);                    // the ridge catching the lights
    col = mix(col, c, roof);
  }
  // the chimney, capped with snow, and the eave's shadow line
  float dC = max(abs(q.x - 0.9) - 0.06, abs(q.y - 1.03) - 0.19);
  col = mix(col, vec3(0.05, 0.03, 0.03) * (wallLit + 0.2), ss(px, -px, dC));
  col = mix(col, gSnowLit * 1.4, ss(px, -px, length((q - vec2(0.9, 1.225)) * vec2(1.0, 2.2)) - 0.085));
  return col;
}
// a boulder half buried in the snow at the water's edge, its top heaped with snow
vec3 boulder(vec2 uv, vec3 col, vec2 c, vec2 r, float seed) {
  vec2 q = (uv - c) / r;
  if (abs(q.x) > 1.3 || q.y < -0.6 || q.y > 1.3) return col;
  float lump = 0.1 * (noise(vec2(q.x * 3.0 + seed, q.y * 2.0 + seed)) - 0.5);
  float d = (length(vec2(q.x * (1.0 + 0.15 * q.y), q.y)) - 1.0 - lump) * r.x;
  float cov = ss(gPx, -gPx, d) * ss(-0.42, -0.25, q.y + 0.08 * sin(q.x * 3.0 + seed));
  if (cov <= 0.0) return col;
  vec3 n = normalize(vec3(q.x, q.y, sqrt(max(1.0 - dot(q, q), 0.05))));
  float cap = ss(0.0, 0.1, n.y - 0.35 + 0.2 * (noise(vec2(q.x * 5.0, seed + 3.0)) - 0.5));
  vec3 rock = vec3(0.014, 0.016, 0.022) * (0.6 + 0.8 * noise(q * 6.0 + seed)) * (0.6 + 0.6 * ss(-0.5, 0.8, n.y));
  rock += GREEN * 0.02 * gGlow * ss(0.6, 1.0, -n.z + n.y);
  vec3 c2 = mix(rock, gSnowLit * (1.0 + 0.35 * n.y), cap);
  return mix(col, c2, cov);
}
// a wooden jetty running out from the shore over the ice, its deck under snow, in true perspective:
// X across and Z away in the world, the deck DECK below the eye, the ice one unit below it
vec3 jetty(vec2 uv, vec3 col) {
  float depth = gYh - uv.y;
  const float DECK = 0.88, BEAM = 0.93, HW = 0.3;
  float X0 = mix(1.72, -0.55, gPf);
  float Z0 = LENS / (gYh - shoreY(X0 * 0.4)) - 0.5, Z1 = Z0 + 7.0;
  // only where it can be on the screen
  float xa = (X0 - HW) * LENS, xb = (X0 + HW) * LENS;
  if (depth <= 0.03 || uv.y > gYh - DECK * LENS / Z1 + gPx || uv.y < gYh - 1.02 * LENS / Z0 - gPx
      || uv.x < min(xa / Z0, xa / Z1) - gPx || uv.x > max(xb / Z0, xb / Z1) + gPx) return col;
  float xs = X0 - sign(X0) * HW;               // the side we see
  // the posts under it, every 1.9 units along both sides
  for (int k = 0; k < 4; k++) {
    float zk = Z0 + 0.25 + float(k) * 2.2;
    for (int sd = 0; sd < 2; sd++) {
      float xp = sd == 0 ? xs + 0.05 * sign(X0) : X0 + sign(X0) * (HW - 0.05);
      float sx = xp * LENS / zk, hw = 0.045 * LENS / zk;
      float y0 = gYh - DECK * LENS / zk, y1 = gYh - 1.02 * LENS / zk;
      float post = ss(hw + gPx, hw, abs(uv.x - sx)) * ss(gPx, -gPx, uv.y - y0) * ss(-gPx, gPx, uv.y - y1);
      col = mix(col, vec3(0.02, 0.016, 0.014) + gSnowLit * 0.06 * ss(-hw, hw, sx - uv.x), post * (sd == 0 ? 1.0 : 0.9));
    }
  }
  // the beam along its near side
  if (uv.x * xs > 0.0) {
    float zf = xs * LENS / uv.x;
    float yb = depth * zf / LENS;
    float side = ss(-gPx, gPx, (yb - DECK) * LENS / zf) * ss(gPx, -gPx, (yb - BEAM) * LENS / zf) * ss(Z0 - 0.02, Z0 + 0.02, zf) * ss(Z1 + 0.02, Z1 - 0.02, zf);
    col = mix(col, vec3(0.035, 0.026, 0.022) + gSnowLit * 0.12, side);
  }
  // the deck: planks across, snow lying on them, footprints out to the end
  float zd = DECK * LENS / depth;
  float xd = uv.x * zd / LENS;
  float pxW = zd / LENS * gPx * 1.2, pzW = zd * gPx / depth * 1.2;
  float on = ss(pxW, -pxW, abs(xd - X0) - HW) * ss(Z0 - pzW, Z0 + pzW, zd) * ss(Z1 + pzW, Z1 - pzW, zd);
  if (on > 0.0) {
    float gap = ss(0.12, 0.0, abs(fract(zd * 2.6) - 0.5) - 0.38) * ss(0.4, 0.15, pzW * 2.6);   // the gaps between planks
    float cover = ss(0.3, 0.6, noise(vec2(xd * 7.0, zd * 2.0)) + 0.25);
    vec3 wood = vec3(0.05, 0.035, 0.028) + gSnowLit * 0.1;
    vec3 c = mix(wood, gSnowLit * 1.25 * (0.9 + 0.1 * noise(vec2(xd * 20.0, zd * 9.0))), cover * (1.0 - 0.6 * gap));
    c *= 1.0 - 0.25 * ss(HW - 0.08, HW, abs(xd - X0));                                    // the edges
    col = mix(col, c, on);
  }
  return col;
}
vec3 smoke(vec2 uv, vec3 col) {
  vec2 top = gCab.xy + vec2(0.9, 1.24) * gCab.z;
  float v = (uv.y - top.y) / (0.55 * gCab.z / 0.15);
  if (v < 0.0 || v > 1.0) return col;
  float cx = top.x - 0.08 * v - 0.025 * sin(v * 7.0 - uTime * 0.8) * v;
  float w = 0.006 + 0.045 * v;
  float dx = (uv.x - cx) / w;
  float dens = exp(-dx * dx) * (1.0 - v) * ss(0.0, 0.05, v) * (0.55 + 0.45 * noise(vec2(uv.x * 30.0, uv.y * 14.0 - uTime * 0.6)));
  return mix(col, gSnowLit * 1.1 + WARM * 0.03, dens * 0.6);
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gAsp = uRes.x / uRes.y;
  gPx = 2.0 / uRes.y;
  gPf = ss(1.15, 0.72, gAsp);                               // 1 for a phone held upright
  gYh = mix(-0.30, -0.40, gPf);
  gShore = mix(-0.66, -0.74, gPf);
  gMidS = uAudioActive * clamp((slow(0.30) + slow(0.38) + slow(0.46) + slow(0.53)) * 0.42, 0.0, 1.0);
  gGlow = 1.0 + 0.45 * gBass;
  gRip = 0.022 * gMidS;                                       // a ripple running along the curtains
  float age = uBeatAge;
  gPulse = uAudioActive * uPunch * ss(0.0, 0.04, age) * ss(0.45, 0.2, age) * exp(-age * 2.5);
  gPulseR = age * 4.0;
  gFoldS = -0.08 + 0.1 * sin(uTime * 0.045);                    // where the hero's great fold stands
  gGlint = uAudioActive * uPunch * exp(-age * 9.0);
  gSky = vec3(0.058, 0.088, 0.19);
  gAur = GREEN * 0.07 * gGlow;
  gSnowLit = gSky + gAur;
  gPeak = vec2(mix(-0.55, -0.13, gPf), mix(0.42, 0.36, gPf));
  float cx = mix(min(0.95, gAsp * 0.55), 0.25, gPf);
  float cs = mix(0.15, 0.12, gPf);
  gCab = vec3(cx, shoreY(cx) - 0.05 * cs / 0.15, cs);

  float sy = shoreY(uv.x);
  vec3 col;
  if (uv.y >= gYh) col = farScene(uv);
  else if (uv.y > sy - gPx) col = lakeAt(uv);
  else col = vec3(0.0);
  if (uv.y < sy + gPx) col = mix(col, snowGround(uv, sy), ss(gPx, -gPx, uv.y - sy));
  col = boulder(uv, col, vec2(mix(-0.62, -0.3, gPf), shoreY(mix(-0.62, -0.3, gPf)) - 0.02), vec2(0.07, 0.065) * mix(1.0, 0.8, gPf), 1.0);
  col = boulder(uv, col, vec2(mix(-0.5, -0.2, gPf), shoreY(mix(-0.5, -0.2, gPf)) - 0.045), vec2(0.04, 0.038) * mix(1.0, 0.8, gPf), 4.0);
  col = jetty(uv, col);
  // the spruces behind the cabin, the cabin, its smoke, and the big spruces framing the shore
  vec2 cb = gCab.xy;
  float k = gCab.z / 0.15;
  col = drawSpruce(uv, col, cb + vec2(0.31, 0.06) * k, 0.46 * k, 0.085 * k, 0.3);
  col = drawSpruce(uv, col, cb + vec2(-0.13, 0.07) * k, 0.27 * k, 0.055 * k, 0.7);
  col = drawSpruce(uv, col, cb + vec2(0.42, 0.04) * k, 0.3 * k, 0.06 * k, 0.5);
  col = drawCabin(uv, col);
  col = smoke(uv, col);
  col = drawSpruce(uv, col, vec2(-gAsp + mix(0.22, 0.1, gPf), -0.98), mix(1.28, 1.08, gPf), mix(0.2, 0.17, gPf), 0.1);
  col = drawSpruce(uv, col, vec2(mix(-gAsp + 0.52, -gAsp - 0.4, gPf), -0.86), 0.72, 0.12, 0.9);
  col = drawSpruce(uv, col, vec2(mix(gAsp - 0.14, gAsp + 0.4, gPf), -0.96), 0.95, 0.16, 0.45);
  col += (hash21(gl_FragCoord.xy) - 0.5) * 0.003;            // dither the night gradients
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'aurora', name: 'Aurora', group: 'Vibe',
  blurb: 'Northern lights folding over a frozen fjord and a red cabin; bass lifts the curtains, mids fold them, beats race a pulse along the fold',
  tags: ['nature', 'night', 'winter', 'snow', 'calm', 'organic'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
