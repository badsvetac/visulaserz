import { SCULPT } from '../js/gfx/scene-kit.js';

// PAPERCUT — a backlit paper-cut shadow box of Pokut yaylası, high above Çamlıhemşin in the Kaçkar
// mountains over the Black Sea, at dusk. Eight sheets of hand-cut paper stand one behind the other
// in a deep frame with a lamp behind it. At the back the sky is four sheets with ever larger holes
// cut round the lamp, so its light comes through in rings: cream, apricot, dusty rose, plum and, at
// the top, indigo pricked with pin-holes for stars. Then the jagged snowy Kaçkar peaks, a sea of
// cloud filling the valleys, a far ridge of spruce forest climbing out of it on either side, a bank
// of cloud drifting through the valley, the yayla's knoll with its wooden houses, their lit windows
// and a footpath winding down, a near meadow with tall spruces, a serender (a granary on stilts),
// a rail fence, haystacks on their poles, a cow grazing and the footpath carrying on down towards
// us, and in front a dark indigo bank, low in the middle, of spruce, ferns, rhododendron and grass.
// A paper moon, three paper stars and two gulls hang on threads from the lid.
//
// Every sheet is crisp and a card thick: a thin lit edge where its cut faces the room lamp (up and
// to the left), a dark one where it faces away, and the gap behind it dark in a soft band that is
// wider and deeper the deeper the gap. The cloud banks and the sky are thin paper and glow where the
// lamp is behind them, and the light shows the paper's cloudy formation.
//
// Music: the far sheets (the peaks, the cloud sea and the far ridge) sway with the highs and the
// near ones (the valley cloud, the meadow and the front) with the bass, each by its own amount, so it
// reads as parallax, not wobble; each house follows its own slice of the mids, its windows and the
// warm light they throw on the meadow round it; the pin-hole stars twinkle with the top of the
// spectrum; on each beat the lamp behind the box flares and the moon, the stars and the gulls bob on
// their threads one after the other, all of it settled within the beat. With nothing playing the
// clouds still drift, the smoke still rises and the hangings swing gently on their own.
const frag = `${SCULPT}
const vec2 LIGHT = vec2(-0.4138, 0.9104);        // the room lamp in front of the box: up and to the left
const float RINGS[4] = float[4](0.29, 0.46, 0.64, 0.9);   // the holes cut in the four sky sheets
const vec3 GLOW = vec3(1.40, 1.02, 0.64);        // the back sheet, the lamp right behind it
const vec3 WIN = vec3(1.0, 0.58, 0.26);          // a lit window
const vec3 THREAD = vec3(0.92, 0.84, 0.74);
const vec3 SPILL = vec3(1.0, 0.55, 0.26);        // the lamp's light on an edge turned towards it
// the Kaçkar peaks: x in a tall frame, x in a wide one, summit height, steepness
const vec4 PEAKS[7] = vec4[7](vec4(0.02, 0.32, 0.37, 1.15), vec4(-0.24, -0.4, 0.3, 1.05), vec4(0.3, 0.86, 0.29, 1.2),
  vec4(-0.46, -0.86, 0.24, 0.95), vec4(0.62, 1.3, 0.24, 1.0), vec4(-0.7, -1.32, 0.21, 1.0), vec4(-0.12, -0.08, 0.2, 1.3));
// the village houses: x from the middle of the village, half width, wall height, roof height
const vec4 HOUSES[5] = vec4[5](vec4(-0.30, 0.030, 0.036, 0.034), vec4(-0.16, 0.038, 0.044, 0.040), vec4(-0.01, 0.044, 0.050, 0.046),
  vec4(0.135, 0.034, 0.040, 0.036), vec4(0.255, 0.028, 0.034, 0.031));

float gPx, gL, gT, gFlare, gRecv, gGate, gHz, gHw, gSx;
vec2 gCam, gLamp, gVil, gFence;
vec2 gHouse[5];       // the foot of each house on the ridge
float gMidH[5];       // each house's slice of the mids
vec2 gOff[8];
vec4 gHang[6];        // the hangings: x, y, size, swing (0 the moon, 1-3 stars, 4-5 gulls)
float gLift[2];       // the gulls' wings
vec3 gTop;            // the topmost paper here: its offset, and whether light comes through it

// ── small tools ─────────────────────────────────────────────────────────────────────────────────
float sdBox(vec2 p, vec2 b) { vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
// a triangle with its apex at the origin and its base q.y below (p.y measured downwards), q.x its half width
float tri(vec2 p, vec2 q) {
  p.x = abs(p.x);
  vec2 a = p - q * clamp(dot(p, q) / dot(q, q), 0.0, 1.0);
  vec2 b = p - q * vec2(clamp(p.x / q.x, 0.0, 1.0), 1.0);
  vec2 d = min(vec2(dot(a, a), -(p.x * q.y - p.y * q.x)), vec2(dot(b, b), -(p.y - q.y)));
  return -sqrt(d.x) * sign(d.y);
}
// a stroke from a (half width wa) to b (half width wb)
float taper(vec2 p, vec2 a, vec2 b, float wa, float wb) {
  vec2 pa = p - a, ba = b - a;
  float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * t) - mix(wa, wb, t);
}
float star5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-0.809016994375, -0.587785252292);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
// the small unsteadiness of a hand-held blade, so no cut is a perfect curve
float knife(vec2 q, float s) { return 0.0011 * sin(q.x * 57.0 + q.y * 31.0 + s) + 0.0007 * sin(q.x * 131.0 - q.y * 97.0 + s * 1.7); }
float vnoise(float x) { float i = floor(x), f = fract(x); return mix(hash11(i), hash11(i + 1.0), f * f * (3.0 - 2.0 * f)); }
// straight cuts between random points: the way a blade follows a crag
float jag(float x, float seed) { float i = floor(x); return mix(hash11(i * 1.37 + seed), hash11(i * 1.37 + 1.37 + seed), fract(x)); }
float lampI(vec2 p) { vec2 r = (p - gLamp) * vec2(0.5, 1.0); return 1.0 / (1.0 + 2.8 * dot(r, r)); }
float roomLight(vec2 p) { return mix(0.62, 0.86, ss(-1.0, 0.8, p.y)); }
float bandL(float x) { return uAudioActive * clamp(textureLod(uAudio, vec2(clamp(x, 0.002, 0.998), ROW(0.0)), 0.0).r * 1.5, 0.0, 1.0); }

// Lays one sheet (or one piece) of paper over the picture. d is its distance here (< 0 on the
// paper), ds the same at the point the room lamp shines from, g the screen slope of d. halo is how
// far the dark of the gap behind it reaches (the deeper the gap, the wider), drop how far its shadow
// falls, glow how much the lamp behind the box catches its edges, backlit whether light comes
// through it (the sky and the cloud banks), off its offset (so its paper grain moves with it).
// dg is the distance the dark of the gap is measured from: small parts cut from a sheet (grass)
// count for less there, so their shade never reaches past the cells they are looked up in.
vec3 layG(vec3 col, vec2 p, float d, float dg, float ds, vec2 g, vec3 paper, float halo, float drop, float glow, float backlit, vec2 off) {
  float aa = clamp(abs(g.x) + abs(g.y), 1e-6, gPx * 3.0);           // (a cell seam far from any cut must not read as an edge)
  vec2 n = g / max(length(g), 1e-9);
  float gap = 1.0 - ss(0.0, halo, dg);
  float occ = 0.44 * gap * gap + 0.3 * ss(drop * 0.5, -drop * 0.5, ds);
  col *= 1.0 - min(occ, 0.66) * mix(1.0, 0.45, gRecv);
  float cover = clamp(0.5 - d / aa, 0.0, 1.0);
  float th = max(0.0021, gPx * 1.15);
  float rim = ss(-th - aa, -th, d);
  float f = dot(n, LIGHT);
  float lr = ss(-th * 3.0 - aa, -th, d) * max(dot(n, normalize(gLamp - p + 1e-5)), 0.0) * lampI(p) * glow;
  paper = paper * (1.0 + rim * (0.55 * max(f, 0.0) - 0.42 * max(-f, 0.0))) + SPILL * lr * (1.0 + 0.6 * gFlare);
  // and the lamp's light spilling over the top of the sheet onto its face, warm and soft
  paper += SPILL * lampI(p) * glow * 0.22 * exp(clamp(d, -1.0, 0.0) / 0.05) * max(n.y, 0.0) * (1.0 + 0.6 * gFlare);
  gRecv = mix(gRecv, backlit, cover);
  if (cover > 0.5) gTop = vec3(off, backlit);
  return mix(col, paper, cover);
}
vec3 lay(vec3 col, vec2 p, float d, float ds, vec2 g, vec3 paper, float halo, float drop, float glow, float backlit, vec2 off) {
  return layG(col, p, d, d, ds, g, paper, halo, drop, glow, backlit, off);
}
// a thread hanging from the lid, a hair wide, from y up
vec3 thread(vec3 col, vec2 q, float x, float y) {
  float c = (1.0 - ss(0.0, gPx * 0.9, abs(q.x - x))) * step(y, q.y);
  return mix(col, THREAD * roomLight(q) * 1.1, c * 0.6);
}

// ── the sky: the lamp behind the back sheet, four sheets with ever larger holes in front of it ───
vec2 lampPolar(vec2 p) { vec2 r = (p - gLamp) * vec2(0.5, 1.0); return vec2(length(r), atan(r.x, r.y)); }
// the edge of the hole in sky sheet k: cut as a ring of cloud heads hanging into the light
float ringR(int k, float a) {
  float fk = float(k), n = 16.0 + 6.0 * fk;
  float c = a * n / TAU;
  float cell = floor(c), f = fract(c) * 2.0 - 1.0;
  float u = max(1.0 - f * f, 0.0);
  float head = (0.45 + 0.55 * hash11(cell * 1.91 + fk * 7.3)) * u * sqrt(u);
  return RINGS[k] * (1.0 + 0.1 * sin(a + 0.7 + fk * 0.4)) - (0.026 + 0.008 * fk) * head + 0.006 * sin(a * 5.0 + fk * 1.7);
}
vec3 ringPaper(int k, float r) {
  float e = max(r - RINGS[k], 0.0);
  if (k == 0) return vec3(1.12, 0.62, 0.35) * (0.8 + 0.36 * exp(-e * 6.0));
  if (k == 1) return vec3(0.78, 0.43, 0.45) * (0.8 + 0.3 * exp(-e * 5.0));
  if (k == 2) return vec3(0.36, 0.20, 0.40) * (0.8 + 0.3 * exp(-e * 4.0));
  return vec3(0.12, 0.10, 0.28) * (0.72 + 0.4 * exp(-e * 2.5));
}

// ── profiles ────────────────────────────────────────────────────────────────────────────────────
// a row of spruce tips, cw apart, each its own height, some missing: a forest seen from afar
float spires(float x, float cw, float seed) {
  float c = floor(x / cw), u = 1.0 - abs(fract(x / cw) * 2.0 - 1.0);
  float h = hash11(c * 3.1 + seed);
  return step(0.22, h) * (0.3 + 0.7 * h) * u * sqrt(u);
}
// a row of round heads of cloud, cw apart, each its own height
float scallop(float x, float cw, float seed) {
  float c = floor(x / cw), f = fract(x / cw) * 2.0 - 1.0;
  float u = max(1.0 - f * f, 0.0);
  return (0.5 + 0.5 * hash11(c * 1.37 + seed)) * u * sqrt(u);
}
float fogTop(float x, float base, float amp, float cw, float seed) {
  return base + amp * max(scallop(x, cw, seed), 0.75 * scallop(x + cw * 0.37, cw * 0.62, seed + 5.0));
}
// the bank drifting through the valley comes and goes along its length
float valleyFog(float x) {
  float there = ss(0.28, 0.55, vnoise(x * 1.3 + 6.0));
  return fogTop(x, -0.36 + 0.025 * sin(x * 2.3 + 2.0) - 0.2 * (1.0 - there), 0.04 + 0.035 * there, 0.13, 4.0);
}
float kackarBase(float x) {
  float h = -0.08 + 0.02 * sin(x * 3.1 + 0.5);
  for (int i = 0; i < 7; i++) {
    vec4 k = PEAKS[i];
    float dx = x - mix(k.x, k.y, gL);
    h = max(h, k.z - abs(dx) * k.w * (dx > 0.0 ? 0.82 : 1.0));
  }
  return h;
}
// granite crags cut in straight strokes along every ridge
float kackar(float x) { return kackarBase(x) + 0.03 * jag(x * 13.0, 3.0) + 0.012 * jag(x * 37.0, 7.0) - 0.024; }
float snowLine(float x) { return 0.2 - 0.075 * jag(x * 21.0, 5.0) - 0.03 * jag(x * 57.0, 11.0); }
// the far ridge climbs out of the cloud on either side of the valley, dark with forest in stands
float farRidge(float x) {
  float xn = x / gHw;
  float dv = (x - gVil.x) / mix(0.3, 0.55, gL);
  float h = -0.3 + 0.27 * exp(-dv * dv) + 0.27 * ss(-0.4, -0.95, xn) + 0.2 * ss(0.5, 1.0, xn) + 0.015 * sin(x * 4.3 + 1.9);
  float stand = ss(0.3, 0.5, vnoise(x * 1.9 + 4.0));
  return h + stand * (0.065 * spires(x, 0.03, 2.0) + 0.025 * spires(x + 0.011, 0.017, 8.0));
}
// the yayla's knoll, meadow round the houses and forest below and beyond them
float knoll(float x) {
  float dv = x - gVil.x, xn = x / gHw;
  return -0.47 + 0.28 * exp(-dv * dv / mix(0.075, 0.22, gL)) + 0.2 * ss(-0.25, -0.8, xn) + 0.07 * ss(0.85, 1.0, xn) + 0.02 * sin(x * 2.1 + 0.4);
}
float villageRidge(float x) {
  float dv = x - gVil.x;
  float h = knoll(x);
  float forest = ss(0.36, 0.5, abs(dv) / mix(0.74, 1.42, gL)) * ss(0.25, 0.45, vnoise(x * 2.6 + 9.0));   // (none round the houses)
  return h + forest * (0.055 * spires(x, 0.032, 3.0) + 0.02 * spires(x + 0.009, 0.018, 6.0));
}
// the meadow rises to the left, where the serender stands
float nearGround(float x) { return -0.63 + 0.1 * ss(0.15, -0.95, x / gHw) + 0.03 * sin(x * 1.2 + 2.0) + 0.012 * sin(x * 3.1 + 0.3); }
// the front bank is lowest in the middle, so the box opens onto the valley
float frontGround(float x) { return -0.93 + 0.15 * ss(0.12, 0.9, abs(x / gHw)) + 0.02 * sin(x * 1.6 + 2.3) + 0.01 * sin(x * 4.1 + 0.7); }

// ── things cut from the sheets ──────────────────────────────────────────────────────────────────
// a spruce, u from the foot of its trunk: five tiers of branches, each narrower than the one below
float spruce(vec2 u, float H, float W) {
  float d = sdBox(u - vec2(0.0, H * 0.05), vec2(max(W * 0.07, 0.0022), H * 0.06));
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float yb = H * (0.08 + 0.16 * fi), ya = H * (0.40 + 0.15 * fi);
    d = min(d, tri(vec2(u.x, ya - u.y), vec2(W * (1.0 - 0.18 * fi), ya - yb)));
  }
  return d;
}
// a yayla house, u from the middle of its foot: stone below, timber above, a steep roof with deep
// eaves; roof says how far the roof is
float house(vec2 u, vec4 h, out float roof) {
  float walls = sdBox(u - vec2(0.0, h.z * 0.5 - 0.02), vec2(h.y, h.z * 0.5 + 0.02));
  roof = tri(vec2(u.x, h.z + h.w - u.y), vec2(h.y * 1.34, h.w + 0.004));
  roof = min(roof, sdBox(u - vec2(h.y * 0.5, h.z + h.w * 0.62), vec2(0.0045, h.w * 0.3)));   // the chimney
  return min(walls, roof);
}
float village(vec2 q, out float roof, out int which) {
  float d = 1e3;
  roof = 1e3;
  which = 0;
  for (int i = 0; i < 5; i++) {
    vec2 u = (q - gHouse[i]) / gHz;
    if (abs(u.x) < 0.09 && u.y > -0.05 && u.y < 0.14) {
      float r;
      float dh = house(u, HOUSES[i], r) * gHz;
      if (dh < d) { d = dh; roof = r * gHz; which = i; }
    }
  }
  return d;        // (1e3 away from every house: nothing there comes within its halo)
}
// a footpath winding down from top, wider as it comes nearer: it swings a0 + a1 * t either side
// (t how far below top), k how quickly, leans by lean, and is w0 + w1 * t wide
float path(vec2 q, vec2 top, float a0, float a1, float k, float ph, float lean, float w0, float w1) {
  float t = max(top.y - q.y, 0.0);
  float a = a0 + a1 * t;
  float xp = top.x + a * sin(k * t + ph) - a0 * sin(ph) + lean * t;
  float slope = a1 * sin(k * t + ph) + a * k * cos(k * t + ph) + lean;
  return max((abs(q.x - xp) - w0 - w1 * t) / sqrt(1.0 + slope * slope), q.y - top.y);
}
// the serender: a wooden granary on four stilts, a flat stone on each to keep the mice out
float serender(vec2 u, out float wood) {
  wood = sdBox(u - vec2(0.0, 0.062), vec2(0.034, 0.022));
  wood = min(wood, tri(vec2(u.x, 0.118 - u.y), vec2(0.048, 0.036)));
  float d = wood;
  for (int i = 0; i < 2; i++) {
    float x = i == 0 ? -0.024 : 0.024;
    d = min(d, sdBox(u - vec2(x, 0.018), vec2(0.0028, 0.024)));
    d = min(d, sdBox(u - vec2(x, 0.038), vec2(0.009, 0.0025)));
  }
  return d;
}
float nearSpruces(vec2 q, float cell) {
  float h = hash11(cell * 7.13 + 1.0);
  float cx = (cell + 0.5) * 0.085 + (hash11(cell * 3.7 + 2.0) - 0.5) * 0.03;
  if (h < 0.42 || (cx > gSx - 0.075 && cx < gFence.y + 0.04)) return 1.0;   // (the serender and its fence stand clear)
  float H = 0.13 + 0.12 * hash11(cell * 5.1 + 3.0);
  vec2 u = q - vec2(cx, nearGround(cx) - 0.01);
  if (u.y > H + 0.06) return u.y - H;                              // well above it: a bound is enough
  if (u.y < -0.004) return 1.0;                                    // below its foot the meadow has it
  return spruce(u, H, H * 0.24);
}
// a rail fence along the meadow's skyline, posts and two rails, cut from the same sheet
float fence(vec2 q) {
  float x0 = gFence.x, x1 = gFence.y;
  float gy = nearGround(q.x);
  float c = clamp(floor((q.x - x0) / 0.042 + 0.5), 0.0, floor((x1 - x0) / 0.042));
  float post = sdBox(vec2(q.x - x0 - c * 0.042, q.y - gy - 0.018), vec2(0.0027, 0.03));
  float rails = min(abs(q.y - gy - 0.037), abs(q.y - gy - 0.016)) - 0.0022;
  rails = max(rails, max(x0 - q.x, q.x - x0 - floor((x1 - x0) / 0.042) * 0.042));
  return min(post, rails);
}
// a haystack built round its pole the Black Sea way, u from its foot, s its height
float hay(vec2 u, float s) {
  u /= s;
  float body = (length((u - vec2(0.0, 0.16)) / vec2(0.38, 0.5)) - 1.0) * 0.38;
  body = smin(body, tri(vec2(u.x, 1.02 - u.y), vec2(0.3, 0.56)), 0.12);
  body = max(body, -u.y);
  float pole = sdBox(u - vec2(0.0, 0.85), vec2(0.02, 0.38));
  return min(body, pole) * s;
}
// a cow grazing, u from between its feet, facing right, s its length
float cow(vec2 u, float s) {
  u /= s;
  float d = sdBox(u - vec2(-0.04, 0.56), vec2(0.36, 0.13)) - 0.1;                    // the barrel
  d = min(d, taper(u, vec2(0.3, 0.6), vec2(0.56, 0.3), 0.13, 0.08));                // the neck, reaching down
  d = min(d, taper(u, vec2(0.56, 0.32), vec2(0.66, 0.14), 0.085, 0.06));            // the head, muzzle in the grass
  d = min(d, taper(u, vec2(0.52, 0.36), vec2(0.47, 0.47), 0.022, 0.006));          // a horn
  d = min(d, taper(u, vec2(0.58, 0.38), vec2(0.7, 0.42), 0.03, 0.01));             // an ear
  for (int i = 0; i < 4; i++) {
    float x = i == 0 ? -0.32 : (i == 1 ? -0.22 : (i == 2 ? 0.2 : 0.3));
    d = min(d, taper(u, vec2(x, 0.5), vec2(x + 0.01, 0.0), 0.05, 0.032));            // the legs
  }
  d = min(d, taper(u, vec2(-0.48, 0.66), vec2(-0.53, 0.26), 0.018, 0.012));         // the tail
  d = min(d, length(u - vec2(-0.53, 0.24)) - 0.035);
  return d * s;
}
// a fern frond cut from the front sheet: its rib runs along a circle of radius R about c, from the
// angle a0, turning one way (dir) for len; its leaflets come in pairs with a thin slit between them,
// broad where they meet the rib and drawn to a point, longest low down and shrinking to the tip
float frond(vec2 q, vec2 c, float R, float a0, float dir, float len, float lmax) {
  vec2 r = q - c;
  float da = (atan(r.y, r.x) - a0) * dir;
  da = mod(da + PI, TAU) - PI;
  float s = da * R, n = abs(length(r) - R);
  float t = clamp(s / len, 0.0, 1.0);
  float d = max(n - 0.0055 * (1.0 - 0.6 * t), max(-s, s - len));
  const float N = 19.0;
  float sp = len / N;
  float k0 = floor(s / sp - 0.5);
  for (int j = -1; j <= 1; j++) {
    float k = clamp(k0 + float(j), 0.0, N - 1.0);
    float sk = (k + 0.5) * sp, tk = sk / len;
    float L = lmax * pow(1.0 - tk, 0.9) * ss(-0.15, 0.25, tk) + sp * 0.4;
    vec2 u = vec2(s - sk, n), b = vec2(0.36 * L, L);
    float h = clamp(dot(u, b) / dot(b, b), 0.0, 1.0);
    float w = sp * 0.4 * pow(1.0 - h, 0.7) * (0.85 + 0.2 * sin(h * PI));
    d = min(d, length(u - b * h) - w);
  }
  return d;
}
float rhodo(vec2 q, float cell, out float bloom) {
  bloom = 1e3;
  float h = hash11(cell * 4.7 + 11.0);
  if (h < 0.4) return 1.0;
  float cx = (cell + 0.5) * 0.26 + (hash11(cell * 2.9 + 1.0) - 0.5) * 0.08;
  if (abs(cx) > gHw * mix(0.5, 0.42, gL) && abs(cx) < gHw * 0.8) return 1.0;   // (the ferns have that stretch)
  float gy = frontGround(cx);
  float s = 0.9 + 0.5 * hash11(cell * 6.1 + 2.0);
  vec2 u = q - vec2(cx, gy);
  if (u.y > 0.14 * s + 0.08 || abs(u.x) > 0.24) return 1.0;
  float d = length(u - vec2(0.0, 0.02)) - 0.062 * s;
  d = min(d, length(u - vec2(-0.06 * s, 0.0)) - 0.045 * s);
  d = min(d, length(u - vec2(0.058 * s, -0.004)) - 0.048 * s);
  // its flowers: trusses of pink paper glued on, each a round of five petals
  vec2 g = u / 0.042;
  vec2 id = floor(g);
  vec2 f = (fract(g) - 0.5 - (vec2(hash21(id + cell), hash21(id + cell + 7.0)) - 0.5) * 0.3) * 0.042;
  float keep = step(0.3, hash21(id * 1.3 + cell + 3.0));
  float r = 0.0125 * (0.8 + 0.2 * cos(atan(f.y, f.x) * 5.0 + id.x * 2.0));
  bloom = mix(1e3, length(f) - r, keep);
  bloom = max(bloom, d + 0.007);
  return d;
}
float grass(vec2 q, float cell) {
  float h = hash11(cell * 5.3 + 2.0);
  if (h < 0.45) return 1.0;
  float cx = (cell + 0.5) * 0.04 + (hash11(cell * 2.1 + 1.0) - 0.5) * 0.014;
  float gy = frontGround(cx) - 0.004;
  float H = 0.04 + 0.05 * hash11(cell * 6.7 + 4.0);
  if (q.y > gy + H + 0.01) return q.y - gy - H;                 // (a bound that keeps the shadow above it whole)
  float d = 1e3;
  for (int j = 0; j < 3; j++) {
    float fj = float(j) - 1.0;
    d = min(d, taper(q, vec2(cx + fj * 0.005, gy), vec2(cx + fj * 0.02 + 0.006 * sin(cell), gy + H * (1.0 - 0.3 * abs(fj))), 0.0036, 0.0003));
  }
  return d;
}

// ── the hangings ────────────────────────────────────────────────────────────────────────────────
vec3 hangAt(int i) {
  if (i == 0) return vec3(mix(-0.12, -1.02, gL), mix(0.66, 0.60, gL), mix(0.085, 0.10, gL));
  if (i == 1) return vec3(mix(0.15, -0.52, gL), mix(0.80, 0.78, gL), mix(0.04, 0.045, gL));
  if (i == 2) return vec3(mix(0.22, 0.62, gL), mix(0.52, 0.70, gL), mix(0.03, 0.04, gL));
  if (i == 3) return vec3(mix(-0.21, 1.25, gL), mix(0.88, 0.56, gL), mix(0.028, 0.035, gL));
  if (i == 4) return vec3(mix(0.0, -0.2, gL), mix(0.45, 0.55, gL), mix(0.06, 0.08, gL));
  return vec3(mix(0.11, 0.1, gL), mix(0.54, 0.64, gL), mix(0.05, 0.066, gL));
}
// the frame of hanging i, which swings about the point its thread hangs from; in units of its size
vec2 hangLocal(int i, vec2 p) {
  vec4 h = gHang[i];
  vec2 anchor = vec2(h.x, 1.15);
  return (rot(h.w) * (p - anchor) + anchor - h.xy) / h.z;
}
float moonShape(vec2 u) { return max(length(u) - 1.0, -(length(u - vec2(0.4, 0.14)) - 0.84)); }
float gull(vec2 u, float lift) {
  vec2 a = vec2(abs(u.x), u.y);
  vec2 elbow = vec2(0.42, 0.14 + 0.32 * lift), tip = vec2(1.0, 0.0 + 0.85 * lift);
  float d = min(taper(a, vec2(0.0), elbow, 0.12, 0.075), taper(a, elbow, tip, 0.075, 0.012));
  return min(d, (length(u * vec2(1.0, 2.2)) - 0.21) * 0.5);
}
float hanging(int i, vec2 p) {
  vec2 u = hangLocal(i, p);
  if (dot(u, u) > 2.6) return (length(u) - 1.2) * gHang[i].z;     // (far from it a bound is enough)
  float d = i == 0 ? moonShape(u) : (i < 4 ? star5(u, 1.0, 0.45) : gull(u, gLift[i - 4]));
  return d * gHang[i].z;
}

void main() {
  musicSignals();
  vec2 p = centered();
  float asp = uRes.x / uRes.y;
  gPx = 2.0 / uRes.y;
  gL = ss(0.56, 1.78, asp);
  gHw = asp;
  gT = uTime;
  gGate = uAudioActive * uPunch;
  gFlare = gHit;
  float age = uBeatAge;
  float L = roomLight(p);

  // the box seen from a viewer who drifts a little: near sheets shift more than far ones
  gCam = vec2(0.03 * sin(gT * 0.13), 0.01 * sin(gT * 0.09 + 1.3));
  gLamp = vec2(mix(0.05, 0.3, gL), 0.02);
  gVil = vec2(mix(0.03, 0.3, gL), 0.0);
  gHz = mix(1.0, 1.42, gL);
  gSx = mix(-0.15, -0.78, gL);
  gFence = vec2(gSx + 0.06, gSx + mix(0.2, 0.42, gL));
  for (int i = 0; i < 5; i++) {
    float x = gVil.x + HOUSES[i].x * mix(0.74, 1.42, gL);
    gHouse[i] = vec2(x, knoll(x) - 0.004);                          // (no forest grows round the houses)
    gMidH[i] = bandL(0.15 + 0.075 * float(i));
  }
  gOff[0] = vec2(0.0);
  gOff[1] = gCam * 0.10 + vec2(0.012 * gHigh * sin(gT * 1.7), 0.003 * gHigh);
  gOff[2] = gCam * 0.18 + vec2(0.018 * gHigh * sin(gT * 1.7 + 1.1), 0.004 * gHigh);
  gOff[3] = gCam * 0.30 + vec2(0.015 * gHigh * sin(gT * 1.7 + 2.3), 0.003 * gHigh);
  gOff[4] = gCam * 0.42 + vec2(0.014 * gBass * sin(gT * 1.15 + 0.3), 0.006 * gBass);
  gOff[5] = gCam * 0.55;
  gOff[6] = gCam * 0.75 + vec2(0.018 * gBass * sin(gT * 1.15 + 1.2), 0.009 * gBass);
  gOff[7] = gCam * 1.00 + vec2(0.024 * gBass * sin(gT * 1.15 + 2.1), 0.014 * gBass);
  // the hangings swing slowly on their own; on the beat each bobs on its thread, one after the
  // other, and has settled before the next beat can come
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec3 h = hangAt(i);
    float ab = max(age - 0.025 * fi, 0.0);
    float bob = gGate * sin(ab * 18.0) * exp(-ab * 6.5) * ss(0.32, 0.18, ab);
    h.xy += gCam * (i < 4 ? 0.05 : 0.24);
    h.y -= 0.45 * h.z * bob - 0.006 * sin(gT * 0.5 + fi * 1.3);
    gHang[i] = vec4(h, 0.04 * sin(gT * (0.5 + 0.07 * fi) + fi * 1.9));
  }
  for (int i = 0; i < 2; i++) {
    float ab = max(age - 0.05 - 0.03 * float(i), 0.0);
    gLift[i] = 0.18 + 0.05 * sin(gT * 0.7 + float(i) * 2.0) + gGate * 0.55 * sin(ab * 20.0) * exp(-ab * 7.0) * ss(0.34, 0.2, ab);
  }

  // where the meadow or the front bank covers the box completely, nothing behind them shows, so
  // nothing behind them is worked out there (the slopes are still taken everywhere, from whatever
  // stands in: a seam only ever falls where a nearer sheet covers it)
  vec2 q6 = p - gOff[6], q7 = p - gOff[7];
  bool front = q7.y > frontGround(q7.x) - 0.02;
  bool open = front && q6.y > nearGround(q6.x) - 0.02;

  // ── the sky ──
  gRecv = 1.0;
  gTop = vec3(0.0, 0.0, 1.0);
  float flare = 1.0 + 0.7 * gFlare;
  vec2 rp = lampPolar(p), rs = lampPolar(p + LIGHT * 0.02);
  vec3 col = GLOW * (0.55 + 0.75 * exp(-rp.x * 4.0)) * flare;
  for (int k = 0; k < 4; k++) {
    float d = -1.0, ds = -1.0;
    if (open) { d = ringR(k, rp.y) - rp.x; ds = ringR(k, rs.y) - rs.x; }
    col = lay(col, p, d, ds, vec2(dFdx(d), dFdy(d)), ringPaper(k, rp.x) * mix(1.0, flare, 0.7 - 0.15 * float(k)), 0.035, 0.02, 0.0, 1.0, vec2(0.0));
  }
  // pin-holes for stars in the two outer sheets, the lamp shining through
  {
    float sk = ss(RINGS[2] + 0.03, RINGS[2] + 0.14, rp.x);
    vec2 g = p / 0.052;
    vec2 id = floor(g);
    float h = hash21(id + 31.0);
    if (sk > 0.0 && h < 0.34) {
      vec2 c = (id + 0.5 + (vec2(hash21(id + 3.1), hash21(id + 7.7)) - 0.5) * 0.7) * 0.052;
      float r = length(p - c) / gPx;
      float big = hash21(id + 1.7);
      float rad = 0.7 + 1.1 * big * big;
      float tw = 0.85 + 0.15 * sin(gT * (0.7 + 2.0 * h) + h * 50.0) + 1.6 * bandL(0.6 + 0.37 * hash21(id + 5.5));
      col += vec3(1.25, 1.0, 0.72) * (ss(rad + 0.8, rad - 0.5, r) * 1.2 + exp(-r * r / (rad * rad * 6.0)) * 0.25) * tw * sk * (0.6 + 0.6 * big);
    }
  }
  // the moon and three stars, hanging in front of the sky
  for (int i = 0; i < 4; i++) {
    vec4 hg = gHang[i];
    vec2 u = hangLocal(i, p);
    vec2 aq = rot(hg.w) * (p - vec2(hg.x, 1.15)) + vec2(hg.x, 1.15);
    col = thread(col, aq, hg.x + (i == 0 ? -0.2 : 0.0) * hg.z, hg.y + (i == 0 ? 0.95 : 0.9) * hg.z);
    float d = hanging(i, p), ds = hanging(i, p + LIGHT * 0.018);
    vec3 paper = vec3(1.0, 0.91, 0.70) * L * 1.12;
    if (i > 0) {
      // each arm of a star is folded down its middle, one half to the lamp
      float a = atan(u.x, u.y) / (TAU / 5.0);
      float side = fract(a + 0.5) - 0.5;
      float w = gPx / (max(length(u), 0.08) * hg.z) / 1.2566;
      paper = vec3(1.0, 0.84, 0.56) * L * mix(0.84, 1.14, ss(-w, w, -side));
    }
    col = lay(col, p, d, ds, vec2(dFdx(d), dFdy(d)), paper, 0.012, 0.018, 0.0, 0.0, gHang[i].xy);
  }

  // ── the Kaçkar peaks, snow on their heads ──
  {
    vec2 q = p - gOff[1];
    float d = 1.0, ds = 1.0, dn = 1.0, dns = 1.0, shade = 0.0;
    if (open && q.y > -0.16 && q.y < 0.5) {
      float kh = kackar(q.x);
      d = q.y - kh + knife(q, 1.0);
      ds = (q.y + LIGHT.y * 0.015) - kackar(q.x + LIGHT.x * 0.015);
      float xs = q.x - max(kh - q.y, 0.0) * 0.45;                  // faces turned from the lamp: the line runs down from each summit at a slant
      shade = ss(-0.004, 0.004, kackarBase(xs - 0.006) - kackarBase(xs + 0.006));
      dn = max(d + 0.0028, snowLine(q.x) - q.y);
      dns = max(ds + 0.0028, snowLine(q.x + LIGHT.x * 0.006) - q.y - LIGHT.y * 0.006);
    }
    vec3 paper = mix(vec3(0.74, 0.62, 0.82), vec3(0.50, 0.40, 0.64), shade) * L;
    col = lay(col, p, d, ds, vec2(dFdx(d), dFdy(d)), paper, 0.03, 0.015, 0.5, 0.0, gOff[1]);
    vec3 snow = mix(vec3(1.0, 0.95, 0.92), vec3(0.80, 0.76, 0.90), shade) * L;
    col = lay(col, p, dn, dns, vec2(dFdx(dn), dFdy(dn)), snow, 0.006, 0.006, 0.6, 0.0, gOff[1]);
  }
  // ── the sea of cloud in the valleys behind ──
  {
    vec2 q = p - gOff[2];
    float d = -1.0, ds = -1.0;
    if (open) {
      float x = q.x + gT * 0.005;
      float base = -0.045 + 0.022 * sin(q.x * 1.7 + 0.5);
      d = q.y - fogTop(x, base, 0.07, 0.17, 1.0) + knife(q, 2.0);
      ds = q.y + LIGHT.y * 0.02 - fogTop(x + LIGHT.x * 0.02, base, 0.07, 0.17, 1.0);
    }
    vec3 paper = vec3(0.92, 0.70, 0.72) * L * 0.9 + vec3(0.9, 0.48, 0.22) * lampI(p) * 0.72 * flare;   // rosy, glowing where the lamp is behind
    col = lay(col, p, d, ds, vec2(dFdx(d), dFdy(d)), paper, 0.03, 0.02, 0.3, 0.6, gOff[2]);
  }
  // two gulls, hanging over the clouds
  for (int i = 4; i < 6; i++) {
    vec4 hg = gHang[i];
    vec2 aq = rot(hg.w) * (p - vec2(hg.x, 1.15)) + vec2(hg.x, 1.15);
    col = thread(col, aq, hg.x, hg.y + 0.1 * hg.z);
    vec2 u = hangLocal(i, p);
    float d = hanging(i, p), ds = hanging(i, p + LIGHT * 0.02);
    vec3 paper = vec3(0.98, 0.93, 0.88) * L * mix(0.88, 1.06, step(u.x, 0.0));
    col = lay(col, p, d, ds, vec2(dFdx(d), dFdy(d)), paper, 0.01, 0.02, 0.2, 0.0, hg.xy);
  }
  // ── the far ridge, its forest in stands ──
  {
    vec2 q = p - gOff[3];
    float d = -1.0, ds = -1.0;
    if (open) {
      d = q.y - farRidge(q.x) + knife(q, 3.0);
      ds = q.y + LIGHT.y * 0.02 - farRidge(q.x + LIGHT.x * 0.02);
    }
    vec3 paper = vec3(0.78, 0.50, 0.60) * L * (1.0 - 0.1 * ss(-0.1, -0.4, q.y));
    col = lay(col, p, d, ds, vec2(dFdx(d), dFdy(d)), paper, 0.035, 0.02, 0.45, 0.0, gOff[3]);
  }
  // ── the bank of cloud drifting through the valley ──
  {
    vec2 q = p - gOff[4];
    float d = 1.0, ds = 1.0;
    if (open) {
      float x = q.x - gT * 0.007;
      d = q.y - valleyFog(x) + knife(q, 4.0);
      ds = q.y + LIGHT.y * 0.022 - valleyFog(x + LIGHT.x * 0.022);
    }
    vec3 paper = vec3(1.0, 0.76, 0.66) * L * 0.9 + vec3(0.9, 0.46, 0.2) * lampI(p) * 0.4 * flare;
    col = lay(col, p, d, ds, vec2(dFdx(d), dFdy(d)), paper, 0.035, 0.022, 0.3, 0.6, gOff[4]);
  }
  // ── the yayla: its knoll, the path, and the houses with their windows ──
  {
    vec2 q = p - gOff[5];
    float d = -1.0, ds = -1.0, dh = 1.0, dhs = 1.0, dp = 1.0, dps = 1.0, roof = 1e3, rh = 0.0;
    int which = 0, w2;
    float rs2;
    if (open) {
      rh = villageRidge(q.x);
      dh = village(q, roof, which);
      // the houses stand up out of the knoll's own outline, then each is a piece of paper glued on it
      d = min(q.y - rh + knife(q, 5.0), dh);
      ds = min(q.y + LIGHT.y * 0.024 - villageRidge(q.x + LIGHT.x * 0.024), village(q + LIGHT * 0.024, rs2, w2));
      dhs = village(q + LIGHT * 0.004, rs2, w2);
      dh = max(dh, rh - 0.005 - q.y);
      dhs = max(dhs, rh - 0.005 - q.y - LIGHT.y * 0.004);
      vec2 top = gHouse[2] + vec2(0.02 * gHz, 0.002);
      dp = max(path(q, top, 0.01, 0.24, 10.0, 0.0, -0.05, 0.005, 0.075), q.y - rh + 0.004);
      dps = max(path(q + LIGHT * 0.004, top, 0.01, 0.24, 10.0, 0.0, -0.05, 0.005, 0.075), q.y - rh + 0.004);
    }
    // the meadow round the houses, warm where their windows throw their light, each with its mids
    vec3 meadow = vec3(0.90, 0.47, 0.34) * L;
    float warm = 0.0;
    for (int i = 0; i < 5; i++) {
      vec2 r = (q - gHouse[i] - vec2(0.0, 0.025 * gHz)) * vec2(0.8, 1.3);
      warm += exp(-dot(r, r) / 0.006) * (0.1 + 0.75 * gMidH[i]);
    }
    meadow += WIN * warm * 0.7;
    col = lay(col, p, d, ds, vec2(dFdx(d), dFdy(d)), meadow, 0.04, 0.024, 0.4, 0.0, gOff[5]);
    col = lay(col, p, dp, dps, vec2(dFdx(dp), dFdy(dp)), vec3(1.0, 0.64, 0.47) * L + WIN * warm * 0.5, 0.004, 0.004, 0.25, 0.0, gOff[5]);
    vec3 paper = vec3(0.80, 0.50, 0.36) * L;                                          // chestnut boards
    if (dh < 0.02) {
      vec4 h = HOUSES[which];
      float z = gHz;
      vec2 u = (q - gHouse[which]) / z;
      paper *= 1.0 - 0.12 * step(0.5, fract(u.x / 0.0075));                              // the boards
      paper = mix(paper, vec3(0.92, 0.84, 0.76) * L, ss(h.z * 0.3, h.z * 0.28, u.y));    // the whitewashed stone floor below
      // the door, dark under its arch
      vec2 dq = u - vec2(h.y * 0.42, 0.0);
      float door = max(sdBox(dq, vec2(0.0055, 0.011)), -dq.y - 0.02);
      paper = mix(paper, vec3(0.22, 0.12, 0.12) * L, ss(gPx * 0.6, -gPx * 0.6, door * z));
      // the windows: two up, one down, all with the house's slice of the mids
      float mid = gMidH[which];
      for (int j = 0; j < 3; j++) {
        float fj = float(j);
        vec2 c = j == 2 ? vec2(-h.y * 0.42, h.z * 0.13) : vec2((fj - 0.5) * h.y * 0.95, h.z * 0.64);
        vec2 f = u - c;
        float dw = sdBox(f, vec2(0.0062, 0.0074)) * z;
        float seed = hash11(float(which) * 7.3 + fj * 1.9);
        float lv = 1.2 + 0.4 * seed + 2.6 * mid;
        vec3 light = WIN * lv * (1.0 - 0.35 * step(abs(f.x), 0.0009) - 0.35 * step(abs(f.y), 0.0009));
        paper += WIN * 0.16 * lv * exp(-max(dw, 0.0) / 0.006) * ss(0.02, 0.008, dw);
        paper = mix(paper, light, ss(gPx * 0.6, -gPx * 0.6, dw));
      }
      paper = mix(paper, vec3(0.34, 0.20, 0.36) * L, ss(gPx * 0.6, -gPx * 0.6, roof - 0.0005));   // the tin roofs
    }
    col = lay(col, p, dh, dhs, vec2(dFdx(dh), dFdy(dh)), paper, 0.004, 0.004, 0.5, 0.0, gOff[5]);
    // smoke from two chimneys, puff after puff of pale paper drifting off and shrinking away
    float puff = 1e3, puffS = 1e3;
    if (open) {
      for (int i = 1; i < 4; i += 2) {
        vec4 h = HOUSES[i];
        vec2 top = gHouse[i] + gHz * vec2(h.y * 0.5, h.z + h.w * 0.95);
        if (abs(q.x - top.x - 0.02) < 0.07 && q.y > top.y - 0.03 && q.y < top.y + 0.14) {   // (no break or continue: slopes follow)
          for (int k = 0; k < 3; k++) {
            float fk = float(k);
            float ph = fract(gT * 0.11 + fk / 3.0 + float(i) * 0.17);
            vec2 c = top + vec2(0.035 * ph + 0.006 * sin(gT * 0.9 + fk * 2.0 + ph * 6.0), 0.1 * ph);
            float r = (0.004 + 0.015 * ph) * ss(1.0, 0.72, ph) * ss(0.0, 0.08, ph);
            puff = min(puff, length(q - c) - r);
            puffS = min(puffS, length(q + LIGHT * 0.006 - c) - r);
          }
        }
      }
    }
    col = lay(col, p, puff, puffS, vec2(dFdx(puff), dFdy(puff)), vec3(0.84, 0.76, 0.82) * L, 0.006, 0.006, 0.3, 0.0, gOff[5]);
  }
  // ── the meadow: tall spruces, the serender, a rail fence, haystacks ──
  {
    vec2 q = p - gOff[6];
    vec2 qs = q + LIGHT * 0.026;
    float sc = mix(1.15, 1.45, gL);
    vec2 su = (q - vec2(gSx, nearGround(gSx) - 0.008)) / sc;
    float d = -1.0, ds = -1.0, wood = 1.0, ws = 1.0;
    if (front) {
      float cell = floor(q.x / 0.085), nb = cell + (fract(q.x / 0.085) < 0.5 ? -1.0 : 1.0);
      float cs = floor(qs.x / 0.085), ns = cs + (fract(qs.x / 0.085) < 0.5 ? -1.0 : 1.0);
      // (a spruce two cells off is never on this pixel, but its shade can be)
      d = min(q.y - nearGround(q.x), min(nearSpruces(q, cell), min(nearSpruces(q, cell - 1.0), nearSpruces(q, cell + 1.0))));
      ds = min(qs.y - nearGround(qs.x), min(nearSpruces(qs, cs), nearSpruces(qs, ns)));
      if (q.x > gFence.x - 0.02 && q.x < gFence.y + 0.02) d = min(d, fence(q));
      if (qs.x > gFence.x - 0.02 && qs.x < gFence.y + 0.02) ds = min(ds, fence(qs));
      d += knife(q, 6.0);
      float w;
      d = min(d, serender(su, wood) * sc);
      wood *= sc;
      ds = min(ds, serender(su + LIGHT * 0.026 / sc, w) * sc);
      serender(su + LIGHT * 0.006 / sc, ws);
      ws *= sc;
    }
    vec3 paper = vec3(0.37, 0.21, 0.37) * L * (1.0 - 0.12 * ss(-0.6, -0.8, q.y));
    col = lay(col, p, d, ds, vec2(dFdx(d), dFdy(d)), paper, 0.05, 0.026, 0.35, 0.0, gOff[6]);
    // the granary is a piece of lighter wood glued on
    col = lay(col, p, wood + 0.0015, ws + 0.0015, vec2(dFdx(wood), dFdy(wood)), vec3(0.86, 0.56, 0.40) * L * (1.0 - 0.12 * step(0.5, fract(su.x / 0.007))), 0.008, 0.006, 0.3, 0.0, gOff[6]);
    // the footpath carries on down the meadow towards us, a strip of paler paper glued on
    {
      vec2 top = vec2(gHouse[2].x + 0.02 * gHz - 0.1, 0.0);
      top.y = nearGround(top.x) - 0.004;
      float dp = 1.0, dps = 1.0;
      if (front) {
        dp = path(q, top, 0.01, 0.3, 6.0, 0.5, 0.1, 0.008, 0.15);
        dps = path(q + LIGHT * 0.005, top, 0.01, 0.3, 6.0, 0.5, 0.1, 0.008, 0.15);
      }
      col = lay(col, p, dp, dps, vec2(dFdx(dp), dFdy(dp)), vec3(0.64, 0.42, 0.5) * L, 0.005, 0.005, 0.2, 0.0, gOff[6]);
    }
    // haystacks of straw-coloured paper, each round its pole, and a cow grazing between them
    float dh = 1.0, dhs = 1.0, straw = 0.0, side = 0.0;
    float dc = 1.0, dcs = 1.0;
    vec2 cu = vec2(0.0);
    if (front) {
      for (int i = 0; i < 3; i++) {
        vec3 hy = i == 0 ? vec3(mix(0.16, 0.55, gL), 0.1, mix(0.1, 0.13, gL))
                : (i == 1 ? vec3(mix(0.36, 0.86, gL), 0.17, mix(0.11, 0.15, gL)) : vec3(mix(-0.36, 1.2, gL), 0.08, mix(0.09, 0.12, gL)));
        vec2 u = q - vec2(hy.x, nearGround(hy.x) - hy.y);
        float s = hy.z;
        if (abs(u.x) < s * 0.5 && u.y > -0.02 && u.y < s * 1.3) {
          float h1 = hay(u, s);
          if (h1 < dh) { dh = h1; straw = u.y / s; side = u.x / s; }
          dhs = min(dhs, hay(u + LIGHT * 0.006, s));
        }
      }
      float cx = mix(-0.19, -0.25, gL), cs = mix(0.1, 0.12, gL);
      cu = q - vec2(cx, nearGround(cx) - mix(0.19, 0.16, gL));
      if (abs(cu.x) < cs * 0.8 && cu.y > -0.02 && cu.y < cs * 0.85) {
        dc = cow(cu, cs);
        dcs = cow(cu + LIGHT * 0.006, cs);
      }
      cu /= cs;
    }
    vec3 hayc = vec3(1.0, 0.68, 0.42) * L * 0.86 * (1.0 - 0.1 * step(0.5, fract(straw * 8.0))) * (1.0 - 0.14 * ss(-0.1, 0.3, side));
    col = lay(col, p, dh, dhs, vec2(dFdx(dh), dFdy(dh)), hayc, 0.008, 0.008, 0.3, 0.0, gOff[6]);
    float blot = ss(0.02, -0.02, min(length((cu - vec2(-0.26, 0.62)) * vec2(1.0, 1.25)) - 0.19 - 0.035 * sin(cu.y * 26.0 + cu.x * 9.0),
                                     length((cu - vec2(0.62, 0.22)) * vec2(1.0, 0.8)) - 0.075));   // a brown rump and a brown face
    vec3 cowc = mix(vec3(0.98, 0.88, 0.78), vec3(0.62, 0.34, 0.27), blot) * L;
    col = lay(col, p, dc, dcs, vec2(dFdx(dc), dFdy(dc)), cowc, 0.006, 0.006, 0.3, 0.0, gOff[6]);
  }
  // ── the front: indigo spruce, ferns, rhododendron and grass ──
  {
    vec2 q = p - gOff[7];
    vec2 qs = q + LIGHT * 0.034;
    float d = q.y - frontGround(q.x), ds = qs.y - frontGround(qs.x);
    float hw = asp;
    // two big spruces framing the box
    vec2 t1 = vec2(-hw + mix(0.07, 0.17, gL), frontGround(-hw + 0.17) - 0.02);
    vec2 t2 = vec2(hw - mix(0.03, 0.21, gL), frontGround(hw - 0.2) - 0.02);
    float H1 = mix(0.62, 1.02, gL), H2 = mix(0.86, 0.84, gL);
    if (abs(q.x - t1.x) < H1 * 0.21 + 0.12 && q.y < t1.y + H1 + 0.1) { d = min(d, spruce(q - t1, H1, H1 * 0.21)); ds = min(ds, spruce(qs - t1, H1, H1 * 0.21)); }
    if (abs(q.x - t2.x) < H2 * 0.2 + 0.12 && q.y < t2.y + H2 + 0.1) { d = min(d, spruce(q - t2, H2, H2 * 0.2)); ds = min(ds, spruce(qs - t2, H2, H2 * 0.2)); }
    // ferns, two clumps of fronds arching out of the bank
    for (int i = 0; i < 2; i++) {
      float side = i == 0 ? -1.0 : 1.0;
      float fx = side * hw * mix(0.66, 0.6, gL) + mix(0.0, 0.04, gL);
      vec2 foot = vec2(fx, frontGround(fx) - 0.01);
      float fs = mix(0.75, 1.15, gL);
      if (abs(q.x - foot.x) < 0.42 * fs && q.y < foot.y + 0.58 * fs && q.y > foot.y - 0.05) {
        for (int j = 0; j < 2; j++) {
          float fj = float(j);
          float dir = j == 1 ? -side : side;                       // one frond arches out, one back over the bank
          float R = (0.34 + 0.12 * fj) * fs, len = (0.3 + 0.2 * fj) * fs;       // the one arching in is the larger
          vec2 c = foot + vec2(dir * R, 0.0) + vec2(fj * 0.02 * side, 0.0);
          float a0 = dir > 0.0 ? PI : 0.0;
          d = min(d, frond(q, c, R, a0, -dir, len, (0.075 + 0.035 * fj) * fs));
          ds = min(ds, frond(qs, c, R, a0, -dir, len, (0.075 + 0.035 * fj) * fs));
        }
      }
    }
    // rhododendron bushes and tufts of grass
    float rc = floor(q.x / 0.26), rn = rc + (fract(q.x / 0.26) < 0.5 ? -1.0 : 1.0);
    float b1, b2, bs1, bs2;
    float db = min(rhodo(q, rc, b1), rhodo(q, rn, b2));
    float bloom = min(b1, b2);
    float rcs = floor(qs.x / 0.26), rns = rcs + (fract(qs.x / 0.26) < 0.5 ? -1.0 : 1.0);
    float dbs = min(rhodo(qs, rcs, bs1), rhodo(qs, rns, bs2));
    float gc = floor(q.x / 0.04), gn = gc + (fract(q.x / 0.04) < 0.5 ? -1.0 : 1.0);
    float gcs = floor(qs.x / 0.04), gns = gcs + (fract(qs.x / 0.04) < 0.5 ? -1.0 : 1.0);
    float dgr = min(grass(q, gc), grass(q, gn));
    float dg = min(d, db) + knife(q, 7.0);
    d = min(dg, dgr);
    dg = min(dg, dgr * 4.0);
    ds = min(ds, min(dbs, min(grass(qs, gcs), grass(qs, gns))));
    col = layG(col, p, d, dg, ds, vec2(dFdx(d), dFdy(d)), vec3(0.13, 0.12, 0.29) * L, 0.065, 0.034, 0.25, 0.0, gOff[7]);
    col = lay(col, p, bloom, 1.0, vec2(dFdx(bloom), dFdy(bloom)), vec3(1.0, 0.52, 0.64) * L, 0.004, 0.003, 0.0, 0.0, gOff[7]);
  }

  // ── the paper itself: its cloudy formation shows where light comes through, its tooth everywhere ──
  vec2 tq = p - gTop.xy;
  float form = noise(tq * 11.0) * 0.55 + noise(tq * 29.0 + 7.1) * 0.3 + noise(tq * 73.0 + 2.3) * 0.15;
  float tooth = noise(tq * vec2(160.0, 180.0));
  float fib = 1.0 - abs(noise(rot(0.6) * tq * vec2(26.0, 120.0)) * 2.0 - 1.0);
  fib *= fib; fib *= fib;
  float bl = gTop.z;
  col *= mix(0.97 + 0.05 * form, 0.86 + 0.28 * form, bl) * (1.0 + (tooth - 0.5) * 0.045 + fib * mix(0.02, 0.07, bl));
  // the box: its lid shades the top of every sheet, its walls the sides
  col *= 1.0 - 0.42 * ss(0.78, 1.0, p.y);
  col *= 1.0 - 0.25 * ss(asp - 0.07, asp, abs(p.x));
  col += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'papercut',
  name: 'Papercut',
  group: 'Vibe',
  blurb: 'A backlit paper-cut shadow box of a Black Sea yayla at dusk: spruce ridges over a sea of cloud, lit windows, a paper moon on a thread',
  tags: ['nature', 'artwork', 'calm', 'paper', 'turkish', 'mountains'],
  energy: 0.3,
  particles: 0,
  trails: 0,
  zoom: 1,
  spin: 0,
  frag,
};
