import { SCULPT } from '../js/gfx/scene-kit.js';

// VOYAGE — the pilot's seat of a small ship crossing deep space, one world at a time. Through a
// curved canopy (a wide forward pane between two slim pillars on a wide screen; one tall pane over
// a deeper console on a phone held upright) a hero world grows slowly ahead: a ringed gas giant
// with storm bands, the planet's shadow lying across its rings and the rings' shadow across it; an
// ice moon scored with rust-coloured cracks; or an ocean world seen almost against its sun, the
// light burning through its atmosphere in a ring of fire and its cities glowing on the night side.
// Behind it a nebula in layers: a navy glow, teal filaments, dark dust lanes in silhouette, warm
// only on the side that faces the sun. Dust motes streak past from the point we are flying at.
//
// Every world is a real sphere (and ring plane) in a 3-D camera: closed-form hits, a soft
// terminator, an atmosphere that scatters past it and turns warm where the light grazes the limb.
// The console is flat shading on 2-D shapes: a glare shield catching the light from outside, a
// row of lamps, three screens, all mirrored faintly in the glass.
//
// Music: the bass stretches the streaking motes and shakes the ship (engine rumble); the mids
// light the nebula and the world's aurora and draw the spectrum on the left screen; the highs make
// the stars twinkle and drive the row of lamps on the glare shield. Every beat is a short warp
// pulse: the motes stretch with a chromatic fringe, the view kicks forward, the world steps closer
// and a segment of the jump drive lights on the centre screen. When all sixteen are lit the drive
// fires: on the next beat the ship drops out of a hyperspace tunnel at a new world (all within the
// beat). With nothing playing the ship cruises on its own clock, quietly, and hops to a new world
// every forty units of cruise.
const frag = `${SCULPT}
const float STRETCH = 16.0;          // beats from one world to the next
const float LEG = 40.0;              // with nothing playing: cruise from one world to the next
const vec3 AMBER = vec3(1.0, 0.50, 0.15);
const vec3 TEAL = vec3(0.22, 0.75, 0.80);
const vec3 CYAN = vec3(0.45, 0.78, 1.0);
const vec3 SUN = vec3(1.0, 0.84, 0.66);

float gPx, gPxA, gAsp, gPf, gLens, gCalm;
float gW, gP, gJump, gPulse, gSpool, gCharge, gKind, gR, gSunVis;
vec2 gVp, gLs, gNeb, gPc;
float gPr;
vec3 gC, gA, gB1, gB2, gL;
vec3 gCool, gWarm;
vec3 gG0, gG1, gG2, gG3, gRing;  // this giant's band colours (dark, light, pale, storm) and its rings' cream
float gH, gK, gFexp, gFk;

// ── small tools ────────────────────────────────────────────────────────────────────────────────
float hash31(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), u.x);
  float b = mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), u.x);
  float c = mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), u.x);
  float d = mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}
float rbox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sq(float x) { return x * x; }
// fbm with fewer octaves, for the broad things
float fbmN(vec2 p, int n) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { if (i >= n) break; s += a * noise(p); p = rot(0.5) * p * 2.03 + vec2(13.7, 7.1); a *= 0.5; }
  return s / (1.0 - a * 2.0 + 1e-4) * 0.97;
}

// ── the sky: a nebula in layers and three sizes of star ───────────────────────────────────────
// v: the direction in view, s: the same on this stretch's own patch of sky
vec3 nebula(vec2 s, vec2 v, vec3 rd, out float veil) {
  // far: the galaxy's band across the sky, soft and grainy
  float ba = hash11(gW * 4.1 + 0.3) * PI;
  float bd = dot(v, vec2(cos(ba), sin(ba))) + (hash11(gW * 6.7) - 0.5) * 0.3;
  float grain = fbmN(s * 3.2 + 40.0, 2);
  vec3 c = vec3(0.022, 0.032, 0.066) * exp(-bd * bd / 0.06) * (0.5 + 0.8 * grain);
  // the cloud: a navy glow, brighter blue where it is dense, teal filaments where the gas is pressed.
  // It is nearer than the stars, so it opens out a little as the ship closes in on the world, and
  // the dust in front of it more
  vec2 off = s - v;
  vec2 sc = v / (1.0 + 0.06 * gP) + off, sd = v / (1.0 + 0.16 * gP) + off;
  vec2 w = vec2(fbmN(sc * 1.1 + 3.0, 3), fbmN(sc * 1.1 + vec2(8.3, 1.7), 3));
  float blob = ss(1.2, 0.15, length((v - gNeb) * vec2(0.75, 1.2)));
  float region = max(ss(0.30, 0.70, fbmN(sc * 0.5 + w * 0.7 + 11.0, 3)), blob * 0.9);
  float d = fbmN(sc * 1.6 + w * 2.2, 5);
  float fine = noise(sc * 19.0 + w * 6.0);                               // the gas is fibrous, not a fog
  // a wide soft glow, and inside it the brighter bodies of gas with defined edges
  float glow = ss(0.40 - 0.1 * blob, 0.72, d) * region;
  float body = ss(0.54, 0.62, d + (fine - 0.5) * 0.06) * region;
  float core = ss(0.62, 0.80, d) * region;
  float f1 = 1.0 - abs(noise(sc * 4.5 + w * 4.0) * 2.0 - 1.0);
  float f2 = 1.0 - abs(noise(sc * 10.0 + w * 6.0 + 4.0) * 2.0 - 1.0);
  float fil = pow(f1, 6.0) + 0.35 * pow(f2, 8.0);
  float warm = pow(max(dot(rd, gL), 0.0), 10.0);                         // warm only near the sun
  float lift = 0.7 + 1.0 * gMid;
  c += vec3(0.010, 0.020, 0.052) * region;
  c += (vec3(0.025, 0.06, 0.15) * glow + vec3(0.025, 0.08, 0.17) * body * (0.55 + 0.9 * fine)
      + vec3(0.04, 0.17, 0.21) * fil * glow + vec3(0.13, 0.22, 0.32) * core * core * (0.4 + 0.9 * fine)
      + vec3(0.40, 0.17, 0.07) * glow * body * warm) * lift;
  // near: dark lanes of dust in silhouette, their edges lit by the glowing gas behind
  vec2 dq = rot(0.7 + gW * 2.4) * sd * vec2(0.65, 1.7);                   // lanes, drawn out along one way
  float dn = fbmN(dq * 1.9 + w * 1.3 + 21.0, 5) + (fine - 0.5) * 0.05;
  float dust = ss(0.55, 0.60, dn);
  float rim = ss(0.51, 0.55, dn) * ss(0.59, 0.55, dn);
  c += vec3(0.16, 0.20, 0.24) * rim * glow * lift * 0.7;
  veil = dust * (0.4 + 0.6 * ss(0.05, 0.4, region + glow));
  return c * (1.0 - 0.93 * veil);
}
vec3 starField(vec2 s) {
  vec3 col = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float cell = layer == 0 ? 0.0065 : (layer == 1 ? 0.015 : 0.036);
    vec2 g = s / cell + vec2(fl * 37.1, fl * 11.7);
    vec2 id = floor(g);
    float h = hash21(id * 1.31 + fl * 17.0);
    float keep = layer == 0 ? 0.55 : (layer == 1 ? 0.72 : 0.86);
    if (h < keep) continue;
    float m = (h - keep) / (1.0 - keep);
    vec2 jit = vec2(hash21(id + 5.3), hash21(id + 9.1)) * 0.56 - 0.28;
    vec2 d = (fract(g) - 0.5 - jit) * cell / gPxA;                       // pixels from the star
    float mag = layer == 0 ? 0.05 + 0.12 * m * m : (layer == 1 ? 0.14 + 0.36 * m * m * m : 0.35 + 1.5 * pow(m, 4.0));
    mag *= ss(2.5, 6.0 + fl * 2.0, cell / gPxA);
    float sigma = 0.62 + (layer == 2 ? 0.55 : 0.2) * m;
    float tw = layer == 0 ? 1.0 : 0.88 + 0.12 * sin(uTime * (0.6 + 1.7 * hash21(id + 2.0)) + h * 60.0);
    tw += gHigh * 1.7 * pow(0.5 + 0.5 * sin(uTime * (11.0 + 9.0 * hash21(id + 6.0)) + h * 90.0), 3.0) * step(0.5, fl);
    vec3 tint = mix(vec3(0.62, 0.74, 1.0), vec3(1.0, 0.86, 0.70), hash21(id + 4.0));
    col += tint * exp(-dot(d, d) / (2.0 * sigma * sigma)) * mag * tw;
  }
  return col;
}

// ── the hero world ────────────────────────────────────────────────────────────────────────────
// the air round a world: x the height above its limb in radii, lim the light's angle there, fsc the
// light scattered forward from a sun behind it
vec3 atmo(float x, float lim, float fsc) {
  float dens = exp(-x / gH);
  float lit = ss(-0.40, 0.45, lim);
  float graze = exp(-lim * lim / 0.03);
  return (mix(gCool, gWarm, graze * 0.85) * lit + gWarm * fsc) * dens * gK;
}
// rings: faint inner ring, the bright broad one, a dark division, a fainter outer ring; the fine
// ringlets fade out where they are smaller than a pixel (fp: a pixel, in planet radii)
float ringDensity(float r, float fp) {
  if (r < 1.26 || r > 2.36) return 0.0;
  float d = ss(1.26, 1.40, r) * ss(2.36, 2.22, r);
  d *= 0.45 + 0.55 * ss(1.52, 1.72, r);
  d *= 1.0 - 0.9 * ss(0.035 + fp, 0.012, abs(r - 1.97));
  d *= 1.0 - 0.6 * ss(0.010 + fp, 0.003, abs(r - 2.16));
  d *= 0.82 + 0.18 * ss(2.05, 1.99, r);
  d *= 1.0 + 0.24 * sin(r * 37.0 + 1.0) * ss(2.6, 0.8, 37.0 * fp) + 0.16 * sin(r * 89.0) * ss(2.6, 0.8, 89.0 * fp)
           + 0.10 * sin(r * 213.0 + 2.0) * ss(2.6, 0.8, 213.0 * fp);
  return clamp(d, 0.0, 1.0);
}
// a gas giant's colour, n on the turning sphere (y = the spin axis)
vec3 giant(vec3 n) {
  vec3 w = vec3(n.x * 2.0, n.y * 10.0, n.z * 2.0) + gW * 1.7;
  float warp = (noise3(w) - 0.5) * 0.09 + (noise3(w * 2.2 + 7.0) - 0.5) * 0.045 + (noise3(w * 4.7 + 3.0) - 0.5) * 0.02;
  float lat = n.y + warp;
  float t1 = 0.5 + 0.5 * sin(lat * 19.0 + 1.1 + gW);
  float t2 = 0.5 + 0.5 * sin(lat * 43.0 + 2.3);
  float t3 = 0.5 + 0.5 * sin(lat * 7.0 - 0.6 + gW * 2.0);
  vec3 c = mix(gG0, gG1, t1);
  c = mix(c, gG2, t3 * t3 * 0.75);
  c *= 0.86 + 0.14 * t2;
  c = mix(c, vec3(0.46, 0.50, 0.55), ss(0.62, 0.92, abs(n.y)) * 0.7);   // grey polar hoods
  // a storm, a pale oval with a dark collar, turning with the planet
  vec3 dd = (n - normalize(vec3(0.55, -0.30, 0.78))) * vec3(1.0, 2.4, 1.0);
  float e = dot(dd, dd);
  c = mix(c, gG3, exp(-e / 0.006) * 0.8);
  c *= 1.0 - 0.3 * exp(-sq(sqrt(e) - 0.11) / 0.0006);
  return c;
}
// an ice moon: pale blue-white ice, long rust-coloured cracks, broken chaos terrain
vec3 ice(vec3 n) {
  vec3 p = n * 2.6 + gW * 3.3;
  float m = noise3(p) * 0.55 + noise3(p * 2.3) * 0.3 + noise3(p * 5.3) * 0.15;
  vec3 c = mix(vec3(0.62, 0.70, 0.80), vec3(0.93, 0.95, 0.98), ss(0.3, 0.7, m));
  float r1 = 1.0 - abs(noise3(n * 3.2 + 11.0 + gW) * 2.0 - 1.0);
  float r2 = 1.0 - abs(noise3(n * 7.5 + 3.0) * 2.0 - 1.0);
  float cracks = pow(r1, 16.0) * 0.85 + pow(r2, 24.0) * 0.55;
  c = mix(c, vec3(0.50, 0.31, 0.21), clamp(cracks, 0.0, 1.0) * 0.85);
  float chaos = ss(0.60, 0.74, noise3(n * 1.6 + 40.0 + gW));
  c = mix(c, vec3(0.55, 0.42, 0.34) * (0.8 + 0.4 * noise3(n * 18.0)), chaos * 0.7);
  return c;
}
// an ocean world: deep sea, a little land, swirling cloud; f.w says how much of it is city light
vec4 ocean(vec3 n) {
  vec3 p = n * 2.2 + gW * 2.1;
  vec3 wq = p + vec3(noise3(p * 1.7), noise3(p * 1.7 + 5.0), noise3(p * 1.7 + 9.0)) * 0.9;
  float cl = noise3(wq * 2.0) * 0.6 + noise3(wq * 4.6) * 0.3 + noise3(wq * 9.5) * 0.1;
  float land = ss(0.50, 0.54, noise3(p * 1.3 + 20.0) * 0.8 + noise3(p * 4.0) * 0.2);
  vec3 c = mix(vec3(0.02, 0.06, 0.15), vec3(0.16, 0.14, 0.09), land);
  float clouds = ss(0.46, 0.72, cl);
  c = mix(c, vec3(0.86, 0.88, 0.92), clouds);
  // cities: specks of light on the land, in clusters
  vec3 g = n * 55.0;
  vec3 id = floor(g);
  float h = hash31(id);
  vec3 off = vec3(hash31(id + 3.1), hash31(id + 7.7), hash31(id + 1.3)) * 0.6 + 0.2;
  float town = ss(0.42, 0.68, noise3(n * 8.0 + 3.0));
  float city = (step(0.5, h) * exp(-dot(fract(g) - off, fract(g) - off) * 18.0) * (0.5 + 0.5 * hash31(id + 9.0)) + 0.045) * land * town * (1.0 - clouds * 0.85);
  return vec4(c, city);
}
// an aurora round the pole at latitude-sine y0: curtains of light, sharp at their foot; the mids light it
// (an oval round the pole, not a cap: a sharp foot on the side of the equator, the light thinning
// out poleward, combed into rays and swaying slowly)
vec3 aurora(vec3 ln, float y0) {
  vec2 xz = ln.xz;
  float sway = (noise(xz * 5.0 + vec2(uTime * 0.05, 3.0)) - 0.5) * 0.03;
  float x = abs(ln.y) - y0 + sway;                                        // > 0 towards the pole
  float band = ss(-0.006, 0.004, x) * exp(-max(x, 0.0) / 0.022);
  vec2 dir = xz / max(length(xz), 1e-4);                                  // the rays stand along the oval
  float rays = noise(dir * 7.0 + vec2(uTime * 0.06, 0.0)) * 0.6 + noise(dir * 17.0 - vec2(0.0, uTime * 0.15)) * 0.4;
  vec3 c = mix(vec3(0.12, 0.95, 0.55), vec3(0.55, 0.25, 0.75), ss(0.006, 0.05, x));
  return c * band * ss(0.25, 0.8, rays) * (0.05 + 0.95 * gMid) * 0.6;
}
// the ice moon's parent: an ice giant below and far behind, its top edge in the sun, too far away to
// grow as we close in on the moon
vec3 parentWorld(vec3 rd, vec3 bg) {
  vec3 pc = normalize(vec3(gPc, gLens)) * 1000.0;
  float pr = 1000.0 * gPr / sqrt(gLens * gLens + dot(gPc, gPc) + gPr * gPr);
  float tca = dot(pc, rd);
  vec3 cp = rd * tca - pc;
  float b = length(cp);
  float cov = clamp((pr - b) / (gPxA * tca) + 0.5, 0.0, 1.0);
  vec3 nl = cp / max(b, 1e-5);
  vec3 col = bg + vec3(0.30, 0.55, 1.0) * exp(-max(b - pr, 0.0) / pr / 0.018) * ss(-0.3, 0.5, dot(nl, gL)) * 0.4;
  if (cov > 0.0) {
    vec3 n = normalize(rd * (tca - sqrt(max(pr * pr - b * b, 0.0))) - pc);
    float lat = dot(n, normalize(vec3(0.25, 1.0, 0.2)));
    float warp = (noise3(n * vec3(3.0, 16.0, 3.0) + 5.0) - 0.5) * 0.05 + (noise3(n * vec3(8.0, 40.0, 8.0)) - 0.5) * 0.015;
    float bands = 0.5 + 0.5 * sin((lat + warp) * 34.0);
    vec3 alb = mix(vec3(0.20, 0.40, 0.55), vec3(0.52, 0.72, 0.80), bands * (0.6 + 0.4 * sin(lat * 7.0)));
    float ndl = dot(n, gL);
    float mu = max(dot(n, -rd), 0.0);
    vec3 c = alb * ss(-0.1, 0.5, ndl) * (0.45 + 0.55 * sqrt(mu)) * 0.62;
    c += vec3(0.30, 0.55, 1.0) * pow(1.0 - mu, 3.0) * ss(-0.3, 0.5, ndl) * 0.4;
    col = mix(col, c, cov);
  }
  return col;
}
// the world over the sky behind it: rings, disc, air, all antialiased against each other
vec3 heroWorld(vec3 rd, vec3 bg) {
  float tca = dot(gC, rd);
  vec3 cp = rd * tca - gC;
  float b = length(cp);
  float pw = gPxA * tca;                                 // a pixel, at the planet
  float cov = clamp((gR - b) / pw + 0.5, 0.0, 1.0);
  vec3 nl = cp / max(b, 1e-5);
  float fsc = pow(max(dot(rd, gL), 0.0), gFexp) * gFk;
  vec3 col = bg + atmo(max(b - gR, 0.0) / gR, dot(nl, gL), fsc);
  float tt = tca - sqrt(max(gR * gR - b * b, 0.0));

  // the rings (the gas giant only): their own light, the planet's shadow across them
  vec4 ring = vec4(0.0);
  float tr = 1e9;
  if (gKind < 0.5) {
    float den = dot(rd, gA);
    den = abs(den) < 1e-5 ? 1e-5 : den;
    tr = dot(gC, gA) / den;
    if (tr > 0.0) {
      vec3 Q = rd * tr;
      vec3 rq = Q - gC;
      float rr = length(rq) / gR;
      vec3 ru = rq / max(length(rq), 1e-5);
      float fp = gPxA * tr * length(ru - gA * dot(rd, ru) / den) / gR;
      float dens = ringDensity(rr, fp);
      if (dens > 0.0) {
        vec3 v = gC - Q;
        float s0 = dot(v, gL);
        float shade = s0 > 0.0 ? mix(0.07, 1.0, ss(gR * 0.985, gR * 1.02, length(v - gL * s0))) : 1.0;
        float frontLit = step(0.0, dot(gL, gA) * dot(-rd, gA));
        // the faint inner ring grey, the broad one cream, the outer one greyer past the division
        vec3 rc = mix(vec3(0.40, 0.40, 0.42), gRing, ss(1.5, 1.8, rr)) * mix(1.0, 0.8, ss(1.99, 2.05, rr));
        rc *= 0.86 + 0.14 * sin(rr * 11.0 + 0.7) + 0.06 * sin(rr * 53.0);
        float lum = mix(dens * (1.0 - dens) * 1.8 * (0.35 + 0.65 * pow(max(dot(rd, gL), 0.0), 2.0)), 0.6 * (0.55 + 0.45 * dens), frontLit);
        ring = vec4(rc * lum * shade, dens * 0.92);
      }
    }
  }
  bool ringFront = tr < tt;
  if (!ringFront) col = mix(col, ring.rgb, ring.a);

  if (cov > 0.0) {
    vec3 P = rd * tt;
    vec3 n = normalize(P - gC);
    float ndl = dot(n, gL);
    float mu = max(dot(n, -rd), 0.0);
    // the planet's turning frame
    float spin = uTime * (gKind < 0.5 ? 0.012 : 0.007);
    vec3 ln = vec3(dot(n, gB1), dot(n, gA), dot(n, gB2));
    ln.xz = rot(spin) * ln.xz;
    vec3 surf;
    if (gKind < 0.5) {
      vec3 alb = giant(ln);
      float day = ss(-0.12, 0.5, ndl);
      // the rings' shadow on the cloud tops
      float s = dot(gC - P, gA) / dot(gL, gA);
      float rs = 1.0;
      if (s > 0.0) rs = 1.0 - 0.8 * ringDensity(length(P + gL * s - gC) / gR, 0.02);
      // where the light grazes the cloud tops it has come through more air, so it warms towards the terminator
      vec3 tint = mix(vec3(1.25, 0.62, 0.32), vec3(1.0), ss(0.0, 0.45, ndl));
      surf = alb * tint * day * (0.5 + 0.5 * sqrt(mu)) * 1.08 * rs;
      surf += alb * vec3(0.05, 0.045, 0.04) * (1.0 - day);                 // ringshine on the night side
      surf += aurora(ln, 0.88) * (1.0 - day);
    } else if (gKind < 1.5) {
      vec3 alb = ice(ln);
      float day = ss(-0.03, 0.3, ndl) * 0.35 + max(ndl, 0.0) * 0.65;
      surf = alb * day * 0.92;
      // its night side lit faintly from below by the parent planet, cold blue
      vec2 cs = gC.xy / gC.z * gLens;
      vec3 toParent = normalize(vec3(normalize(gPc - cs), -0.45));          // (it is behind: a cheat, turned towards us)
      surf += alb * vec3(0.05, 0.10, 0.15) * max(dot(n, toParent), 0.0) * (1.0 - ss(-0.1, 0.25, ndl));
    } else {
      vec4 o = ocean(ln);
      float day = ss(-0.08, 0.4, ndl);
      surf = o.rgb * day * (0.6 + 0.4 * sqrt(mu));
      float night = 1.0 - ss(-0.15, 0.1, ndl);
      surf += o.rgb * vec3(0.018, 0.024, 0.04) * night;                     // starlight: the sea black-blue, clouds just there
      surf += vec3(1.0, 0.62, 0.28) * o.w * night * 0.9;
      surf += aurora(ln, 0.86) * night;
      surf += vec3(0.20, 0.55, 0.32) * 0.10 * exp(-mu / 0.06) * night;      // airglow along the night limb
    }
    surf += atmo(0.0, ndl, fsc) * pow(1.0 - mu, 3.0);                      // the air thickest at the rim
    col = mix(col, surf, cov);
  }
  if (ringFront) col = mix(col, ring.rgb, ring.a);
  // the ice moon's geysers, rising off its south pole, lit from behind; the mids feed them
  if (gKind > 0.5 && gKind < 1.5) {
    vec3 u = -gA;
    vec3 sp = gC + u * gR;
    float tp = dot(sp, rd);
    vec3 rel = rd * tp - sp;
    float hgt = dot(rel, u) / gR;
    if (hgt > 0.0) {
      vec3 lat3 = (rel - u * hgt * gR) / gR;
      float wdt = 0.06 + 0.5 * hgt;
      float plume = exp(-dot(lat3, lat3) / (wdt * wdt)) * exp(-hgt / 0.6) * ss(0.0, 0.04, hgt);
      plume *= 0.35 + 0.9 * ss(0.3, 0.8, noise(vec2(dot(lat3, gB1) / wdt * 3.0 + 7.0, hgt * 2.5 - uTime * 0.25)));
      plume *= 1.0 - cov * step(tt, tp);
      col += vec3(0.62, 0.80, 1.0) * plume * (0.45 + 0.9 * pow(max(dot(rd, gL), 0.0), 3.0)) * (0.3 + 1.4 * gMid) * 0.7;
    }
  }
  return col;
}

// ── things nearer than the world: dust motes, and the hyperspace tunnel ────────────────────────
// motes in log-polar space, where flying forward is a plain shift outwards; three depths, the
// nearest fastest and brightest. shutter: how long the streaks are, in units of travel; chroma
// splits red outwards and blue inwards (a beat's warp pulse)
float streak(float du, float dv, float Lp, float sig) {
  float along = clamp(dv, -Lp, 0.0);
  float d2 = du * du + (dv - along) * (dv - along);
  return exp(-d2 / (2.0 * sig * sig)) * (1.0 + along / max(Lp, 1e-3) * 0.85);
}
vec3 motes(vec2 q, float shutter, float chroma) {
  float r = length(q);
  float a = atan(q.y, q.x);
  float lr = log(max(r, 1e-3));
  vec3 acc = vec3(0.0);
  float pxc = r / gPx;
  float dc = chroma * pxc;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float N = i == 0 ? 48.0 : (i == 1 ? 80.0 : 128.0);    // sectors round the view
    float K = i == 0 ? 1.4 : (i == 1 ? 2.2 : 3.4);        // cells per unit of log radius
    float spd = i == 0 ? 1.5 : (i == 1 ? 0.75 : 0.38);
    float keep = i == 0 ? 0.88 : (i == 1 ? 0.92 : 0.9);
    float Lc = min(spd * shutter * K, 0.9);
    vec2 g = vec2(a / TAU * N + fi * 0.37, lr * K - mod(uCruise * spd * K, 1000.0));
    vec2 cell = floor(g), f = g - cell;
    float sig = i == 0 ? 1.1 : (i == 1 ? 0.85 : 0.7);
    for (int j = 0; j < 2; j++) {
      vec2 id = cell + vec2(0.0, float(j));
      float h = hash21(id + fi * 57.0);
      if (h < keep) continue;
      float uc = 0.25 + 0.5 * hash21(id + 3.7);
      float vh = 0.05 + 0.9 * hash21(id + 8.1) + float(j);
      float du = (f.x - uc) * TAU / N * pxc;
      float dv = (f.y - vh) / K * pxc;
      float Lp = Lc / K * pxc;
      float mag = (i == 0 ? 0.75 : (i == 1 ? 0.38 : 0.2)) * (0.35 + 0.65 * hash21(id + 1.9)) * (2.0 / (2.0 + Lp * 0.05));
      acc += vec3(streak(du, dv - dc, Lp, sig), streak(du, dv, Lp, sig), streak(du, dv + dc, Lp, sig)) * mag;
    }
  }
  return acc * ss(0.06, 0.55, r) * (0.6 + 0.5 * ss(0.3, 1.4, r));
}
vec3 hyperspace(vec2 q, float chroma) {
  float r = max(length(q), 1e-3), a = atan(q.y, q.x), lr = log(r);
  vec3 rays = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float N = i == 0 ? 96.0 : 160.0;
    float u = a / TAU * N + fi * 0.5;
    float cx = floor(u);
    float h = hash11(cx * 1.37 + fi * 31.7);
    float du = (fract(u) - 0.5 - (h - 0.5) * 0.4) * TAU / N * r / gPx;
    float v = lr * 1.3 - uTime * (2.4 + fi * 1.3) + h * 17.0;
    float w = 0.9 + 1.8 * ss(0.1, 1.2, r);
    float line = exp(-du * du / (2.0 * w * w)) * (0.45 + 0.55 * h);
    float y = cx * 3.1 + fi * 11.0;
    rays += line * vec3(ss(0.45, 0.9, noise(vec2(y, v + chroma * 1.3))), ss(0.45, 0.9, noise(vec2(y, v))), ss(0.45, 0.9, noise(vec2(y, v - chroma * 1.3))));
  }
  vec3 c = rays * vec3(0.55, 0.75, 1.15) * ss(0.02, 0.3, r);
  c += vec3(0.20, 0.38, 0.95) * 0.35 * exp(-r * 1.3);
  c += vec3(1.0, 0.95, 0.9) * exp(-r / 0.07) * 1.4;
  return c;
}

// ── the cockpit ───────────────────────────────────────────────────────────────────────────────
float dashY(float x) { float xn = x / max(gAsp, 0.5); return mix(-0.61 - 0.09 * xn * xn, -0.44 - 0.05 * xn * xn, gPf); }
// the canopy glass: distance from its edge, negative on the glass, positive on its frame
float canopyD(vec2 uv) {
  float top = mix(1.07, 0.965, gPf);
  vec2 hb = vec2(gAsp + mix(0.05, -0.035, gPf), (top + 1.3) * 0.5);
  float d = rbox(uv - vec2(0.0, top - hb.y), hb, mix(0.62, 0.30, gPf));
  // the pillars either side of the forward pane (a wide frame only)
  float yd = dashY(uv.x);
  float t = clamp((uv.y - yd) / (1.08 - yd), 0.0, 1.0);
  float k = gAsp / 1.7778;
  float xp = (0.98 + 0.48 * t + 0.04 * sin(t * PI)) * k + gPf * 3.0;
  float hw = 0.024 + 0.026 * t;
  return max(d, -(abs(abs(uv.x) - xp) - hw) * 0.95);
}
vec3 frameColor(vec2 uv, float d, vec3 lightCol) {
  vec2 e = vec2(0.004, 0.0);
  vec2 g = vec2(canopyD(uv + e.xy) - canopyD(uv - e.xy), canopyD(uv + e.yx) - canopyD(uv - e.yx));
  g /= max(length(g), 1e-5);                       // away from the glass, into the frame
  float face = max(dot(-g, gLs), 0.0);
  float bevel = ss(0.0, 0.003, d) * ss(0.024, 0.008, d);
  vec3 c = vec3(0.018, 0.020, 0.026) * (0.85 + 0.3 * noise(uv * vec2(80.0, 6.0)));
  c += vec3(0.035, 0.045, 0.06) * ss(0.10, 0.0, d);                        // light from the glass falling on it
  c += lightCol * bevel * (0.10 + 0.6 * face * face);                     // the bevel catches the sun
  c += lightCol * 0.05 * exp(-sq((d - 0.045) / 0.012)) * (0.3 + 0.7 * face);   // a soft gloss along it
  c *= 1.0 - 0.45 * ss(gPx * 1.5, 0.0, abs(d - 0.075));                   // a panel seam
  c += vec3(0.20, 0.35, 0.8) * 0.06 * gJump;
  return c;
}
// the console's three screens: centre (the jump drive), left (spectrum), right (target)
void screens(out vec2 c0, out vec2 h0, out vec2 c1, out vec2 h1) {
  c0 = mix(vec2(0.0, -0.84), vec2(0.0, -0.615), gPf);
  h0 = mix(vec2(0.30, 0.095), vec2(0.42, 0.085), gPf);
  c1 = mix(vec2(0.86, -0.875), vec2(0.235, -0.83), gPf);
  h1 = mix(vec2(0.25, 0.08), vec2(0.185, 0.085), gPf);
}
vec3 driveScreen(vec2 lc, vec2 hb) {
  float pxx = gPx / hb.x, pxy = gPx / hb.y;
  vec3 c = vec3(0.0);
  // sixteen segments, one per beat; the newest brightest; all flash as the drive fires
  float sx = lc.x + 0.16 * (lc.y - 0.3);
  float gx = (sx + 0.88) / 1.76 * 16.0;
  float i = floor(gx), fx = fract(gx);
  float pw = pxx * 16.0 / 1.76;
  float seg = ss(0.14 - pw, 0.14 + pw, fx) * ss(0.86 + pw, 0.86 - pw, fx) * step(0.0, gx) * step(gx, 16.0)
            * ss(0.02 - pxy, 0.02 + pxy, lc.y) * ss(0.62 + pxy, 0.62 - pxy, lc.y);
  float lit = step(i + 0.5, gCharge);
  float newest = step(abs(i - gCharge + 1.0), 0.1);
  vec3 sc = mix(AMBER * 0.06, AMBER * (0.7 + newest * (0.4 + 1.6 * gPulse)), lit);
  sc = mix(sc, CYAN * 1.5, gJump);
  c += sc * seg;
  // the waveform under it
  float wv = lc.y + 0.45 - 0.32 * wave(lc.x * 0.5 + 0.5) * uAudioActive;
  c += TEAL * 0.85 * ss(pxy * 2.2, pxy * 0.5, abs(wv)) * ss(0.98, 0.9, abs(lc.x));
  // labels: little bars of text in the corner
  vec2 tq = vec2((lc.x + 0.92) / 0.05, (lc.y - 0.78) / 0.09);
  float word = step(0.0, tq.x) * step(tq.x, 9.0) * step(abs(tq.y), 0.5) * step(0.3, fract(tq.x)) * step(0.35, hash11(floor(tq.x) + 3.0));
  c += AMBER * 0.25 * word;
  return c;
}
vec3 spectrumScreen(vec2 lc, vec2 hb) {
  float N = 22.0;
  float gx = (lc.x * 1.08 + 1.0) * 0.5 * N;
  float i = floor(gx), fx = fract(gx);
  float v = band(0.012 + (i + 0.5) / N * 0.55);
  float top = -0.78 + 1.45 * v;
  float pxx = gPx / hb.x * N * 0.54, pxy = gPx / hb.y;
  float bx = ss(0.2 - pxx, 0.2 + pxx, fx) * ss(0.8 + pxx, 0.8 - pxx, fx) * step(0.0, gx) * step(gx, N);
  vec3 c = mix(AMBER * 0.85, vec3(1.0, 0.82, 0.5), ss(0.0, 0.7, lc.y)) * bx * ss(top + pxy, top - pxy, lc.y) * step(-0.78, lc.y);
  c += TEAL * 0.07 * ss(pxy * 1.4, 0.0, abs(fract(lc.y * 2.0 + 0.5) - 0.5) * 0.5) * step(abs(lc.x), 0.93);
  c += AMBER * 0.15 * bx * ss(pxy * 2.0, 0.0, abs(lc.y + 0.82));
  return c;
}
vec3 targetScreen(vec2 lc, vec2 hb) {
  float asp = hb.x / hb.y;
  vec2 p = vec2(lc.x * asp, lc.y);
  float px = gPx / hb.y;
  vec2 d = p - vec2(-asp + 1.0, 0.0);
  float r = length(d);
  float R = 0.56;
  vec3 c = TEAL * 0.45 * ss(px * 1.6, 0.0, abs(r - 0.82)) * step(0.12, abs(atan(d.y, d.x) / TAU * 8.0 - floor(atan(d.y, d.x) / TAU * 8.0 + 0.5)) + 0.0);
  // the world, lit as it is outside, and its ring
  vec3 nn = vec3(d / R, -sqrt(max(0.0, 1.0 - dot(d, d) / (R * R))));
  float lit = ss(-0.05, 0.3, dot(nn, gL));
  c += AMBER * (0.06 + 0.8 * lit) * ss(R + px, R - px, r);
  c += TEAL * 0.5 * ss(px * 1.6, 0.0, abs(r - R));
  if (gKind < 0.5) {
    vec2 e = rot(0.35) * d;
    float re = length(e / vec2(1.0, 0.28)) - 1.6 * R;
    c += AMBER * 0.6 * ss(px * 4.0, 0.0, abs(re) * 0.3) * (1.0 - ss(R + px, R - px, r) * step(0.0, e.y));
  }
  // three readings: how near the world is, how charged the drive, a lamp per world visited
  vec2 b = vec2((p.x - (-asp + 2.05)) / (2.0 * asp - 2.25), p.y);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float val = k == 0 ? gP : (k == 1 ? gCharge / 16.0 : fract(gW * 0.618 + 0.3));
    float row = ss(px * 1.5, 0.0, abs(b.y - (0.45 - fk * 0.45)) - 0.07);
    c += mix(AMBER * 0.08, AMBER * 0.7, step(b.x, val)) * row * step(0.0, b.x) * step(b.x, 1.0);
  }
  return c;
}
// banks of toggle switches at the console's sides (a wide frame), or a row of keys (a tall one)
vec3 switches(vec2 uv, vec3 c, vec3 lightCol) {
  vec2 cs = mix(vec2(0.08, 0.105), vec2(0.0703, 0.06), gPf);
  vec2 lo = mix(vec2(1.14, -0.965), vec2(0.0, -0.99), gPf), hi = mix(vec2(gAsp - 0.1, -0.73), vec2(gAsp - 0.035, -0.925), gPf);
  float ax = abs(uv.x);
  // the seams of the panels
  float seamX = mix(1.08, 10.0, gPf);
  c *= 1.0 - 0.5 * ss(gPx * 1.5, 0.0, abs(ax - seamX)) * step(uv.y, -0.66);
  if (ax < lo.x || ax > hi.x || uv.y < lo.y || uv.y > hi.y) return c;
  vec2 g = vec2(ax - lo.x, uv.y - lo.y) / cs;
  vec2 id = floor(g), f = (fract(g) - 0.5) * cs;
  float h = hash21(id + step(0.0, uv.x) * 31.0 + 17.0);
  vec3 plate = vec3(0.028, 0.03, 0.036);
  if (gPf < 0.5) {
    float d = rbox(f, vec2(0.022, 0.03), 0.006);
    c = mix(c, plate + lightCol * 0.03 * ss(-0.02, 0.03, f.y), ss(gPx, -gPx, d));
    float up = h > 0.45 ? 1.0 : -1.0;
    float lev = length(vec2(f.x, f.y - up * clamp(up * f.y, 0.0, 0.026))) - 0.0065;
    c = mix(c, vec3(0.09, 0.09, 0.1) + lightCol * 0.12 * ss(0.0065, -0.006, f.x), ss(gPx, -gPx, lev));
    float led = length(f - vec2(0.0, -0.041)) - 0.004;
    vec3 lc = h > 0.8 ? vec3(0.3, 1.0, 0.5) : AMBER;
    c += lc * step(0.55, h) * (ss(gPx, -gPx, led) * 0.8 + exp(-max(led, 0.0) / 0.006) * 0.08);
  } else {
    float d = rbox(f, cs * 0.5 - vec2(0.008, 0.009), 0.007);
    vec3 key = plate + lightCol * 0.035 * ss(-0.02, 0.02, f.y);
    c = mix(c, key, ss(gPx, -gPx, d));
    c += mix(AMBER, TEAL, step(0.5, hash11(id.x + 3.0))) * 0.5 * step(0.6, h) * ss(gPx, -gPx, abs(f.y + 0.011) - 0.0025) * step(abs(f.x), 0.014);
  }
  return c;
}
vec3 console(vec2 uv, float yd, vec3 lightCol) {
  float lipH = mix(0.042, 0.032, gPf);
  float below = yd - uv.y;
  vec3 c;
  if (below < lipH) {
    // the glare shield's top, at a grazing angle, catching the light from outside
    float t = below / lipH;
    c = vec3(0.028, 0.032, 0.042) * (1.0 - 0.45 * t) + lightCol * 0.05 * (1.0 - t);
    c += lightCol * 0.3 * ss(gPx * 2.5, 0.0, below);
    c *= 0.6 + 0.4 * ss(lipH, lipH - gPx * 3.0, below);
  } else {
    float b2 = below - lipH;
    c = vec3(0.010, 0.011, 0.015) * (1.0 + 0.8 * ss(0.3, 0.0, b2)) * (0.85 + 0.15 * noise(uv * vec2(3.0, 40.0)));
    c *= 0.45 + 0.55 * ss(0.0, 0.035, b2);                                 // the shadow under the lip
    c += lightCol * 0.012 * ss(0.3, 0.0, b2);
    c = switches(uv, c, lightCol);
    // the lamps along the shield: each one a slice of the highs
    float W = mix(0.62, 0.43, gPf);
    float yl = yd - lipH - mix(0.028, 0.026, gPf);
    float li = clamp(floor((uv.x + W) / (2.0 * W) * 16.0), 0.0, 15.0);
    vec2 lp = vec2(-W + (li + 0.5) * 2.0 * W / 16.0, yl);
    float dl = length(uv - lp);
    float v = 0.07 + 1.5 * band(0.52 + 0.44 * li / 15.0);
    vec3 lc = mix(AMBER, vec3(1.0, 0.8, 0.55), ss(0.6, 1.4, v));
    c += lc * v * (ss(0.0065 + gPx, 0.0065 - gPx, dl) * 1.1 + exp(-dl / 0.012) * 0.22);
    c += vec3(0.0, 0.0, 0.0);
    // the screens
    vec2 c0, h0, c1, h1;
    screens(c0, h0, c1, h1);
    for (int k = 0; k < 3; k++) {
      vec2 cc = k == 0 ? c0 : (k == 1 ? vec2(-c1.x, c1.y) : c1);
      vec2 hb = k == 0 ? h0 : h1;
      float d = rbox(uv - cc, hb, 0.016);
      vec3 tint = k == 0 ? mix(AMBER, CYAN, gJump) : (k == 1 ? AMBER : TEAL);
      c += tint * 0.035 * exp(-max(d, 0.0) / 0.03);                       // their light on the panel
      if (d < 0.014) {
        float bz = ss(gPx, -gPx, d - 0.012);
        vec3 bezel = vec3(0.035, 0.037, 0.045) + lightCol * 0.04 * ss(-0.002, 0.012, uv.y - cc.y - hb.y + 0.01);
        c = mix(c, bezel, bz);
        float inside = ss(gPx, -gPx, d);
        if (inside > 0.0) {
          vec2 lc2 = (uv - cc) / hb;
          vec3 s = vec3(0.006, 0.009, 0.012) * (1.0 + 0.4 * (1.0 - lc2.y));
          s += k == 0 ? driveScreen(lc2, hb) : (k == 1 ? spectrumScreen(lc2, hb) : targetScreen(lc2, hb));
          s += vec3(0.02, 0.025, 0.03) * ss(0.4, 1.0, lc2.y - lc2.x * 0.2) * 0.4;   // a sheen on the screen glass
          c = mix(c, s, inside);
        }
      }
    }
  }
  c += vec3(0.20, 0.35, 0.85) * 0.12 * gJump * (1.0 - ss(0.0, 0.4, below));      // the tunnel's light floods in
  return c;
}
// the canopy glass over the view: thicker and cooler towards its frame, the console mirrored in it
vec3 glassOver(vec2 uv, vec3 col, float dC, float yd, vec3 lightCol) {
  col *= 1.0 - 0.25 * ss(-0.18, 0.0, dC);
  col += vec3(0.008, 0.012, 0.02) * ss(-0.3, 0.0, dC);
  float hgt = uv.y - yd;
  vec2 m = vec2(uv.x, yd - hgt * 1.3);
  vec2 c0, h0, c1, h1;
  screens(c0, h0, c1, h1);
  vec3 refl = mix(AMBER, CYAN, gJump) * exp(-max(rbox(m - c0, h0, 0.02), 0.0) / 0.05)
            + AMBER * exp(-max(rbox(m - vec2(-c1.x, c1.y), h1, 0.02), 0.0) / 0.05)
            + TEAL * exp(-max(rbox(m - c1, h1, 0.02), 0.0) / 0.05);
  col += refl * 0.03 * exp(-hgt / 0.25);
  col += AMBER * (0.008 + 0.1 * gHigh) * exp(-hgt / 0.03) * ss(mix(0.75, 0.5, gPf), 0.2, abs(uv.x));
  // a soft sheen across the curved glass, and dust on it lit where the sun comes in
  float sh = dot(uv, normalize(vec2(0.85, 0.5))) - mix(0.9, 0.55, gPf);
  col += vec3(0.020, 0.024, 0.032) * exp(-sh * sh / 0.03) * (0.6 + 0.4 * ss(0.0, -0.4, dC));
  float specks = ss(0.78, 0.95, noise(uv * 140.0)) * ss(0.6, 0.95, noise(uv * 9.0 + 4.0));
  col += lightCol * specks * 0.05 * max(dot(normalize(uv + 1e-4), gLs), 0.0);
  return col;
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gAsp = uRes.x / uRes.y;
  gPf = ss(1.15, 0.72, gAsp);                     // 1 for a phone held upright
  gPx = 2.0 / uRes.y;
  gLens = 2.0;
  gPxA = gPx / gLens;
  gCalm = mix(0.4, 1.0, clamp((uPunch - 0.25) / 0.75, 0.0, 1.0));

  // the journey: with music a world every sixteen beats, each beat a step nearer; without, the cruise
  if (uAudioActive > 0.5) {
    float k = mod(uBeatCount, STRETCH), age = uBeatAge;
    gW = floor(uBeatCount / STRETCH);
    gP = (k + 1.0 - exp(-age * 9.0)) / STRETCH;
    gJump = k < 0.5 ? ss(0.45, 0.0, age) : 0.0;                           // dropping out of hyperspace
    gPulse = k < 0.5 ? 0.0 : exp(-age * 8.0);
    gSpool = k > 14.5 ? ss(0.05, 0.5, age) * exp(-max(age - 1.0, 0.0) * 3.0) : 0.0;   // the drive winding up
    gCharge = k + 1.0;
  } else {
    float cz = uCruise / LEG;
    gW = floor(cz);
    gP = fract(cz);
    gJump = ss(1.6, 0.0, min(gP, 1.0 - gP) * LEG);
    gPulse = 0.0;
    gSpool = 0.0;
    gCharge = floor(gP * STRETCH) + 1.0;
  }

  // this world: what it is, where it hangs, how it is lit
  gKind = mod(gW, 3.0);
  // the giants take turns: Saturn's gold, Jupiter's rust and cream, a cold blue-green one
  float gv = mod(floor(gW / 3.0), 3.0);
  if (gv < 0.5) { gG0 = vec3(0.46, 0.31, 0.16); gG1 = vec3(0.80, 0.64, 0.42); gG2 = vec3(0.90, 0.83, 0.68); gG3 = vec3(0.92, 0.72, 0.48); gRing = vec3(0.88, 0.77, 0.60); }
  else if (gv < 1.5) { gG0 = vec3(0.44, 0.20, 0.10); gG1 = vec3(0.78, 0.54, 0.36); gG2 = vec3(0.93, 0.87, 0.78); gG3 = vec3(0.88, 0.42, 0.26); gRing = vec3(0.70, 0.64, 0.58); }
  else { gG0 = vec3(0.13, 0.30, 0.40); gG1 = vec3(0.40, 0.62, 0.68); gG2 = vec3(0.72, 0.84, 0.86); gG3 = vec3(0.92, 0.96, 0.98); gRing = vec3(0.66, 0.72, 0.78); }
  float h1 = hash11(gW * 7.31 + 0.13), h2 = hash11(gW * 3.17 + 0.71), h3 = hash11(gW * 5.53 + 0.29);
  float side = h1 < 0.5 ? -1.0 : 1.0;
  float sc = 1.0 / (1.0 - 0.38 * gP);
  vec2 c0 = vec2(side * mix(0.46, 0.11, gPf), mix(0.02, 0.05, gPf) + (h2 - 0.5) * 0.08);
  float r0 = mix(0.35, 0.30, gPf) * (gKind > 0.5 && gKind < 1.5 ? 0.88 : 1.0);
  vec2 cs = c0 * sc;
  float rs = r0 * sc;
  vec3 fwd = normalize(vec3(cs, gLens));
  gC = fwd * 100.0;
  gR = 100.0 * rs / sqrt(gLens * gLens + dot(cs, cs) + rs * rs);
  vec3 up0 = normalize(vec3(0.0, 1.0, 0.0) - fwd * fwd.y);
  vec3 rt0 = cross(up0, fwd);
  float roll = side * mix(0.30, 0.55, gPf) * (0.6 + 0.4 * h3) * (gKind < 0.5 ? 1.0 : 0.5);
  vec3 ax = cos(roll) * up0 + sin(roll) * rt0;
  gA = normalize(cos(0.30) * ax - sin(0.30) * fwd);                       // tipped towards us
  gB2 = normalize(-fwd - gA * dot(-fwd, gA));
  gB1 = cross(gA, gB2);
  vec3 f0 = normalize(vec3(c0, gLens));                                   // the sun stays put as we close in
  vec3 u00 = normalize(vec3(0.0, 1.0, 0.0) - f0 * f0.y), r00 = cross(u00, f0);
  // the light comes from the side of the frame's centre and above; for the giant from high enough that
  // the face of the rings we see is the lit one
  vec2 td = gKind > 1.5 ? normalize(vec2(-side * 0.35, 1.0)) : (gKind < 0.5 ? normalize(vec2(-side * 0.55, 0.85)) : normalize(vec2(-side * 0.8, 0.6)));
  float phase = gKind < 0.5 ? 1.95 : (gKind < 1.5 ? 1.8 : 2.93);
  gL = normalize(cos(phase) * (-f0) + sin(phase) * (td.x * r00 + td.y * u00));
  gLs = normalize(gL.xy + vec2(1e-4, 0.0));
  if (gKind < 0.5) { gCool = vec3(0.50, 0.62, 0.85); gWarm = vec3(1.0, 0.52, 0.22); gH = 0.022; gK = 0.55; gFexp = 6.0; gFk = 0.3; }
  else if (gKind < 1.5) { gCool = vec3(0.35, 0.58, 1.0); gWarm = vec3(0.9, 0.6, 0.4); gH = 0.014; gK = 0.5; gFexp = 8.0; gFk = 0.4; }
  else { gCool = vec3(0.30, 0.55, 1.05); gWarm = vec3(1.05, 0.48, 0.18); gH = 0.03; gK = 0.75; gFexp = 60.0; gFk = 2.2; }
  gPc = vec2(-side * mix(0.8, 0.12, gPf) * min(gAsp / 1.7778, 1.0), mix(-1.36, -1.2, gPf));
  gPr = mix(1.18, 0.9, gPf);
  gNeb = vec2(-side * mix(0.7, 0.2, gPf), 0.25 + (h3 - 0.5) * 0.4);
  gSunVis = ss(gR * 0.985, gR * 1.03, length(gL * dot(gC, gL) - gC));

  // the ship: the engine's rumble, a slow bank, the kick of each warp pulse
  gVp = vec2(0.0, mix(0.16, 0.27, gPf));
  float shake = (gBass * 0.008 + gSpool * 0.006) * gCalm + gJump * 0.012;
  vec2 sh = (vec2(noise(vec2(uTime * 37.0, 1.3)), noise(vec2(uTime * 41.0, 7.9))) - 0.5) * shake;
  float bank = sin(uTime * 0.05) * 0.03 + uBalance * uAudioActive * 0.05;
  float kick = 1.0 - (0.03 * gPulse + 0.07 * gSpool) * gCalm;
  vec2 q = rot(bank) * (uv - gVp - sh) * kick;
  vec3 rd = normalize(vec3(q, gLens));

  // the cockpit in front: where it covers the view, the view is not drawn at all
  float yd = dashY(uv.x);
  float dC = canopyD(uv);
  float fa = ss(-gPx, gPx, dC);
  float da = ss(yd + gPx, yd - gPx, uv.y);
  vec3 lightCol = SUN * (gKind > 1.5 ? 0.35 + 0.4 * gSunVis : 0.7) + vec3(0.05, 0.08, 0.14) + vec3(0.3, 0.5, 1.0) * gJump;
  vec3 col = vec3(0.0);
  if (max(fa, da) < 1.0) {
    // the sky of this stretch of the journey
    vec2 sky = q / gLens + vec2(hash11(gW * 1.7 + 0.4), hash11(gW * 2.9 + 0.8)) * 40.0;
    float veil;
    col = vec3(0.004, 0.006, 0.016) + nebula(sky, q / gLens, rd, veil);
    col += starField(sky) * (1.0 - 0.9 * veil);
    float sAng = length(cross(rd, gL)) + step(dot(rd, gL), 0.0);
    if (gKind > 1.5) col += SUN * 3.0 * ss(0.006 + gPxA, 0.006 - gPxA, sAng);   // the sun, behind the world
    // the world: during the jump it rushes in from far away
    vec3 rdw = normalize(vec3(q * (1.0 + 0.8 * gJump * gJump), gLens));
    if (gKind > 0.5 && gKind < 1.5) col = parentWorld(rdw, col);
    col = heroWorld(rdw, col);
    // the sun's glare (off the frame for the giant and the moon), and its flare when it is in view
    col += SUN * 0.03 * pow(max(dot(rd, gL), 0.0), 3.0);
    if (gKind > 1.5) {
      float ang = atan(q.y - gL.y / gL.z * gLens, q.x - gL.x / gL.z * gLens);
      float burst = pow(abs(cos(ang * 3.0 + 0.4)), 50.0) + 0.6 * pow(abs(cos(ang * 5.0 + 1.1)), 80.0);
      col += SUN * gSunVis * (exp(-sAng / 0.010) * 0.9 + exp(-sAng / 0.05) * 0.18 + burst * exp(-sAng / 0.09) * 0.35);
      vec2 sunS = gL.xy / gL.z * gLens;
      for (int k = 0; k < 3; k++) {
        float fk = float(k);
        vec2 gp = sunS * (-0.3 - 0.45 * fk);
        float rr = 0.035 + 0.035 * fk;
        vec3 tint = k == 0 ? vec3(1.0, 0.7, 0.4) : (k == 1 ? vec3(0.5, 0.7, 1.0) : vec3(0.6, 1.0, 0.8));
        col += tint * ss(rr, rr * 0.7, length(q - gp)) * 0.035 * gSunVis;
      }
    }
    // dust motes streaking past; on a beat they stretch and split into colour
    float shutter = (0.10 + 0.5 * gJump) * uCruiseRate + (0.24 * gBass + 0.5 * gPulse + 0.8 * gSpool) * gCalm;
    float chroma = (0.03 * gPulse + 0.04 * gSpool) * gCalm;
    col += vec3(0.78, 0.85, 1.0) * motes(q, shutter, chroma);
    // the drive winding up: the way ahead turns blue; then hyperspace
    col += vec3(0.25, 0.45, 1.0) * gSpool * 0.3 * exp(-length(q) / 0.22) * gCalm;
    if (gJump > 0.001) {
      col *= 1.0 - 0.9 * gJump;
      col += hyperspace(q, 0.06 * gJump) * gJump * mix(0.6, 1.0, gCalm);
    }
    col = glassOver(uv, col, dC, yd, lightCol);
  }
  // the cockpit
  if (fa > 0.0) col = mix(col, frameColor(uv, dC, lightCol), fa);
  if (da > 0.0) col = mix(col, console(uv, yd, lightCol), da);
  col += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;                          // dither the deep gradients
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'voyage', name: 'Voyage', group: 'Journey',
  blurb: 'From the cockpit: a ringed giant, an ice moon or an ocean world grows ahead; each beat a warp pulse, every 16th a hyperspace jump to a new world',
  tags: ['space', 'vehicle', '3d', 'planets', 'cinematic'],
  energy: 0.6, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
