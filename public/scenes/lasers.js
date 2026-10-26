// LASERS — draft
const frag = `
const float LENS = 1.55;         // the phone's lens
const float EYE = 2.3;           // held up high, a few rows back on the dance floor
const float CEIL = 7.0;          // the underside of the concrete slab
const float DROP = 0.6;          // the downstand beams under it, one every BAY metres
const float BAY = 4.2;
const float HW = 0.22;           // half a downstand's width
const float RZ = 14.0;           // the projectors stand on a bar over the DJ booth, this far away
const float RY = 3.0;            // at this height
const float BOOTHZ = 13.6;       // the booth's front, its top at BOOTHY
const float BOOTHY = 2.45;
const float TZ = 15.3;           // the goal-post truss over the stage
const float TY = 5.7;
const float BACKZ = 18.5;        // the black back wall
const float SIDEX = 13.0;        // the side walls
const float ROWZ[7] = float[7](1.9, 2.6, 3.5, 4.7, 6.2, 8.2, 10.8);   // rows of the crowd

float gPx, gAsp, gWide, gShift, gOn, gBass, gMid, gHigh, gFlash, gAge, gStep, gSec, gFig, gEase, gW, gLive, gBlink, gPow;
float gHzN, gHzF;                     // the haze's density at this pixel: near us, and out by the rig
vec3 gA, gB, gC, gTint, gFogC, gTop;
vec3 gRo, gRd, gVol, gHalo;
float gTF, gAF, gTB, gAB, gTP, gAP;   // what hides the air behind it: crowd in front of / behind the pillars, pillars
float gDl, gTc, gH;                   // the lit haze round the rig, along our ray
float gDl2, gTc2, gH2;                // and the haze over the stage, behind the crowd

float fbm3(vec2 p) {
  float s = 0.5 * noise(p);
  p = rot(0.6) * p * 2.07 + 4.1; s += 0.25 * noise(p);
  p = rot(0.6) * p * 2.07 + 4.1; s += 0.125 * noise(p);
  return s / 0.875;
}
float sdEll(vec2 p, vec2 r) { float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
// a direction: az turns it right from straight at the crowd, el lifts it
vec3 aim(float az, float el) { return vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el)); }
// the look a figure takes on beat k: a hashed choice of n
float pick(float k, float n) { return floor(hash11(k * 7.31 + 0.5) * n); }
float seen(float t) { return (t > gTF ? 1.0 - gAF : 1.0) * (t > gTP ? 1.0 - gAP : 1.0) * (t > gTB ? 1.0 - gAB : 1.0); }
float airGlow(float t) { return (atan((t * gDl - gTc) / gH) + atan(gTc / gH)) / gH; }
float washGlow(float t) { return (atan((t * gDl2 - gTc2) / gH2) + atan(gTc2 / gH2)) / gH2; }
// a soft blob of lit haze along our ray: its centre, its radii; the integral is closed form
void blob(vec3 C, vec3 R, out float dl, out float tc, out float h) {
  vec3 o = (gRo - C) / R, dq = gRd / R;
  dl = length(dq); dq /= dl;
  tc = -dot(o, dq);
  h = sqrt(max(dot(o, o) - tc * tc, 0.0) + 0.04);
}
float hazeAt(float t) { return mix(gHzN, gHzF, ss(3.0, 13.0, t)); }

void sectionColours(float s) {
  int k = int(mod(s, 6.0));
  vec3 G = vec3(0.06, 1.0, 0.1), L = vec3(0.5, 1.0, 0.02), E = vec3(0.0, 1.0, 0.55);
  vec3 R = vec3(1.0, 0.02, 0.04), B = vec3(0.08, 0.2, 1.0), C = vec3(0.0, 0.78, 1.0);
  vec3 V = vec3(0.5, 0.08, 1.0), M = vec3(1.0, 0.04, 0.7), Y = vec3(1.0, 0.36, 0.0), W = vec3(0.8, 0.9, 1.0);
  if (k == 0) { gA = G; gB = L; gC = E; }            // classic green
  else if (k == 1) { gA = R; gB = G; gC = B; }       // red, green and blue
  else if (k == 2) { gA = C; gB = B; gC = V; }       // ice
  else if (k == 3) { gA = M; gB = C; gC = V; }       // magenta and cyan
  else if (k == 4) { gA = R; gB = Y; gC = M; }       // red and amber
  else { gA = G; gB = W; gC = C; }                   // green and white
  // one brightness for every colour: green would outshine blue three times over
  vec3 Yw = vec3(0.3, 0.59, 0.11);
  gA *= pow(0.5 / dot(gA, Yw), 0.6); gB *= pow(0.5 / dot(gB, Yw), 0.6); gC *= pow(0.5 / dot(gC, Yw), 0.6);
}

// the ceiling seen along (o, d): a downstand's underside, the slab between two of them, or the
// side of the next one; kind 1 downstand, 2 slab
float ceilHit(vec3 o, vec3 d, out vec3 n, out float kind) {
  n = vec3(0.0, -1.0, 0.0); kind = 1.0;
  float t0 = (CEIL - DROP - o.y) / d.y, z0 = o.z + d.z * t0;
  float zc = floor(z0 / BAY + 0.5) * BAY;
  if (abs(z0 - zc) < HW) return t0;
  float th = (CEIL - o.y) / d.y;
  kind = 2.0;
  if (abs(d.z) > 1e-4) {
    float zf = d.z > 0.0 ? (z0 < zc ? zc - HW : zc + BAY - HW) : (z0 > zc ? zc + HW : zc - BAY + HW);
    float tz = (zf - o.z) / d.z;
    if (tz < th) { th = tz; n = vec3(0.0, 0.0, -sign(d.z)); kind = 1.0; }
  }
  return th;
}
// how far a beam from e along d runs before the room (or the heads) stop it
float beamLen(vec3 e, vec3 d) {
  float L = 40.0;
  if (d.y > 1e-3) L = (CEIL - DROP - e.y) / d.y;
  else if (d.y < -1e-3) L = (1.9 - e.y) / d.y;
  if (d.z < -1e-3) L = min(L, (-5.0 - e.z) / d.z);
  if (abs(d.x) > 1e-3) L = min(L, (sign(d.x) * SIDEX - e.x) / d.x);
  return L;
}

// one beam from e along d, L long: its light in the haze along our ray
void beam(vec3 e, vec3 d, float L, vec3 c, float pw, float seed) {
  vec3 w0 = gRo - e;
  float b = dot(gRd, d), dr = dot(gRd, w0), dd = dot(d, w0);
  float den = max(1.0 - b * b, 1e-4);
  float s = clamp((dd - b * dr) / den, 0.0, L);
  float t = max(b * s - dr, 0.0);
  vec3 g = w0 + gRd * t - d * s;
  float r2 = dot(g, g);
  if (r2 > 0.5) return;
  float pxw = gPx * max(t, 0.3);
  float w = max(0.004, pxw * 0.9);
  float graze = min(inversesqrt(den), 3.0);              // looking along a beam there is more haze in it
  float hz = hazeAt(t);
  float k = pw * graze * exp(-s * 0.035) * seen(t);
  float core = exp(-r2 / (w * w)) * sqrt(0.004 / w);
  // the highs: the beam breaks into dashes running out along it, the way a scanned beam does
  float dash = 1.0 - gHigh * 0.75 * ss(0.3, 0.1, pxw * graze * 1.6) * (0.5 + 0.5 * sin(s * 5.0 - uTime * 26.0 + seed * 2.3));
  float halo = exp(-r2 * 220.0) * 0.1 + 0.006 * max(1.0 / (1.0 + r2 * 40.0) - 0.048, 0.0);
  gVol += c * k * (core * 2.0 * dash * (0.4 + 0.8 * hz) + halo * (0.1 + 1.8 * hz * hz));
  gVol += vec3(k * core * core * 0.3 * dash);
  gHalo += c * k * exp(-r2 * 4.0);
}

// the haze between a fan's beams, lit by them: a faint plane spanned by f and sx, half_ wide
void fanSheet(vec3 e, vec3 f, vec3 sx, float half_, vec3 c, float pw) {
  vec3 n = cross(f, sx);
  float dn = dot(gRd, n);
  if (abs(dn) < 2e-3) return;
  float t = dot(e - gRo, n) / dn;
  if (t <= 0.0) return;
  vec3 v = gRo + gRd * t - e;
  float along = dot(v, f);
  if (along <= 0.0) return;
  float a = atan(dot(v, sx), along);
  float inside = ss(half_ + 0.015, half_ - 0.05, abs(a));
  float graze = min(1.0 / abs(dn), 7.0);
  float hz = hazeAt(t);
  gVol += c * pw * inside * graze * exp(-length(v) * 0.07) * (0.15 + hz * hz) * 0.012 * seen(t);
}
// the haze inside a cone of beams, lit by them: the walls of the tunnel
void coneSheet(vec3 e, vec3 f, float cone, vec3 c, float pw) {
  float c2 = cos(cone); c2 *= c2;
  vec3 w = gRo - e;
  float a = dot(gRd, f), b = dot(w, f), wr = dot(w, gRd);
  float A = a * a - c2, B = a * b - c2 * wr, C = b * b - c2 * dot(w, w);
  float disc = B * B - A * C;
  if (disc <= 0.0 || abs(A) < 1e-5) return;
  float sq = sqrt(disc);
  for (int k = 0; k < 2; k++) {
    float t = (-B + (k == 0 ? -sq : sq)) / A;
    vec3 v = w + gRd * t;
    float along = dot(v, f);
    if (t <= 0.0 || along <= 0.0 || along > 22.0) continue;
    vec3 n = normalize(along * f - c2 * v);
    float graze = min(1.0 / max(abs(dot(gRd, n)), 1e-3), 8.0);
    gVol += c * pw * graze * exp(-along * 0.06) * (0.15 + hazeAt(t) * hazeAt(t)) * 0.014 * seen(t);
  }
}

// a raised arm from the shoulder s, the upper arm and the forearm leaning a1, a2 out from upright
float arm(vec2 q, vec2 s, float sd, float a1, float a2, out vec2 hand) {
  vec2 el = s + 0.3 * vec2(sd * sin(a1), cos(a1));
  hand = el + 0.26 * vec2(sd * sin(a2), cos(a2));
  float d = sdSeg(q, s, el) - 0.048;
  d = min(d, sdSeg(q, el, hand) - 0.037);
  return min(d, sdEll(q - hand - vec2(0.0, 0.045), vec2(0.042, 0.06)));
}
// one person seen from behind, q in metres from between their feet; pose 0 arms down, 1 a fist up,
// 2 both arms up, 3 filming with the phone held high; sd picks the arm, lift pumps the fists
float person(vec2 q, float H, float pose, float sd, float hair, float lift, out float screen) {
  screen = 1.0;
  if (abs(q.x) > 0.66 || q.y > H + 0.66) return 1.0;
  float sh = H - 0.31;
  float d = sdBox(q - vec2(0.0, sh * 0.5 - 0.05), vec2(0.15, sh * 0.5)) - 0.03;
  if (q.y < sh - 0.25) return d;
  float shoulders = sdEll(q - vec2(0.0, sh - 0.035), vec2(0.205, 0.085));
  float neck = sdBox(q - vec2(0.0, H - 0.23), vec2(0.046, 0.08));
  d = smin(smin(d, shoulders, 0.06), neck, 0.075);
  d = min(d, sdEll(q - vec2(0.0, H - 0.12), vec2(0.092 * hair, 0.12)));
  if (pose > 0.5) {
    vec2 hand, s0 = vec2(sd * 0.15, sh + 0.02);
    if (pose > 2.5) {
      d = min(d, arm(q, s0, sd, 0.12, -0.08, hand));
      float pd = sdBox(q - hand - vec2(-sd * 0.01, 0.12), vec2(0.036, 0.066)) - 0.006;
      d = min(d, pd);
      screen = pd + 0.009;
    } else if (pose > 1.5) {
      float a1 = mix(0.55, 0.38, lift), a2 = mix(0.3, 0.15, lift);
      d = min(d, arm(q, s0, sd, a1, a2, hand));
      d = min(d, arm(q, vec2(-sd * 0.15, sh + 0.02), -sd, a1 + 0.05, a2 - 0.05, hand));
    } else {
      d = min(d, arm(q, s0, sd, mix(0.6, 0.18, lift), mix(-0.2, 0.04, lift), hand));
    }
  }
  return d;
}

void main() {
  vec2 uv = centered();
  gAsp = uRes.x / uRes.y;
  gWide = ss(0.75, 1.6, gAsp);
  gPx = 2.0 / (uRes.y * LENS);
  gOn = uAudioActive;
  gBass = gOn * clamp(uBass * 1.3, 0.0, 1.0);
  gMid = gOn * clamp(uMid * 1.4, 0.0, 1.0);
  gHigh = gOn * clamp(uHigh * 1.6, 0.0, 1.0);

  // the show's clock: the beats while music plays (and every 2.4 s through a long gap between
  // them), a calm 2.4 s step when nothing plays
  float stepN = floor(uTime / 2.4), age = mod(uTime, 2.4);
  if (gOn > 0.5) { stepN = uBeatCount + floor(uBeatAge / 2.4); age = mod(uBeatAge, 2.4); }
  gStep = stepN; gAge = age;
  gSec = floor(stepN / 8.0);                       // a section is eight beats: a new figure and new colours
  gFig = mod(gSec, 4.0);
  gEase = ss(0.0, gOn > 0.5 ? 0.06 : 0.8, age);    // with music a new look snaps in on the beat
  gFlash = gOn * uPunch * exp(-age * 17.0) * (mod(stepN, 4.0) < 0.5 ? 1.0 : 0.45);
  float tsec = mod(stepN, 8.0) * 2.4 + age;
  gBlink = gOn > 0.5 ? 1.0 : 0.3 + 0.7 * ss(0.0, 1.2, tsec) * ss(19.2, 18.0, tsec);
  gLive = gOn > 0.5 ? 0.3 + 0.8 * gMid : 0.8;
  gPow = gBlink * (1.0 + 0.6 * gFlash);
  sectionColours(gSec);
  gTint = gA * 0.6 + gB * 0.4;
  gTint *= 0.5 / dot(gTint, vec3(0.3, 0.59, 0.11));
  gW = mix(3.2, 5.6, gWide);

  // the camera: level, its lens shifted up the way an architect's is so the pillars stand
  // upright, with the rig a little under the middle of the frame
  gShift = LENS * (RY - EYE) / RZ + 0.28;
  gRo = vec3(0.05 * sin(uTime * 0.13), EYE + 0.02 * sin(uTime * 0.21), 0.0);
  gRd = normalize(vec3(uv.x, uv.y + gShift, LENS));

  // the haze: two layers of slowly rolling smoke
  float h0 = fbm3(uv * vec2(0.9, 1.3) + vec2(uTime * 0.03, -uTime * 0.01));
  float h1 = fbm3(uv * 2.2 + vec2(-uTime * 0.024, uTime * 0.015) + 5.0 + 1.6 * vec2(h0, -h0));
  gHzN = ss(0.3, 0.72, h0);
  gHzF = ss(0.3, 0.72, h1 * 0.65 + h0 * 0.35);
  float hz = mix(gHzN, gHzF, 0.5);
  blob(vec3(0.0, RY + 0.4, RZ - 0.8), vec3(0.9 * gW + 0.8, 1.6, 2.6), gDl, gTc, gH);
  blob(vec3(0.0, 2.0, BOOTHZ - 1.2), vec3(gW + 4.0, 0.75, 2.2), gDl2, gTc2, gH2);
  float washK = gBlink * (0.5 + 0.9 * gBass);
  vec3 airK = gTint * 0.022 * gPow * (0.25 + 1.4 * hz);
  vec3 washC = gTint * 0.03 * washK * (0.4 + 1.0 * hz);
  gFogC = gTint * 0.03 * gBlink * (0.45 + 0.9 * hz) + vec3(0.05, 0.053, 0.06) * gFlash * (0.4 + 0.9 * hz);

  // ── the room ───────────────────────────────────────────────────────────────────────────────────
  vec3 nR = vec3(0.0, 0.0, -1.0);
  float kind = 0.0;                      // 0 back wall, 1 downstand, 2 slab, 3 floor, 4 side wall, 5 booth
  float tR = (BACKZ - gRo.z) / gRd.z;
  if (abs(gRd.x) > 1e-4) { float ts = (sign(gRd.x) * SIDEX - gRo.x) / gRd.x; if (ts < tR) { tR = ts; nR = vec3(-sign(gRd.x), 0.0, 0.0); kind = 4.0; } }
  if (gRd.y < 0.0) { float tf = -gRo.y / gRd.y; if (tf < tR) { tR = tf; nR = vec3(0.0, 1.0, 0.0); kind = 3.0; } }
  else { vec3 nc; float kc; float tc = ceilHit(gRo, gRd, nc, kc); if (tc < tR) { tR = tc; nR = nc; kind = kc; } }
  {
    float tb = (BOOTHZ - gRo.z) / gRd.z; vec3 P = gRo + gRd * tb;
    if (tb < tR && P.y < BOOTHY && abs(P.x) < gW + 0.7) { tR = tb; nR = vec3(0.0, 0.0, -1.0); kind = 5.0; }
  }
  vec3 PR = gRo + gRd * tR;

  // ── the pillars standing in the crowd ──────────────────────────────────────────────────────────
  gTP = 1e4; gAP = 0.0;
  vec3 nP = vec3(0.0, 0.0, -1.0);
  float PX = mix(3.1, 5.8, gWide);
  {
    vec2 o2 = gRo.xz, r2 = gRd.xz;
    r2.x = abs(r2.x) < 1e-5 ? 1e-5 : r2.x;
    vec2 nrm = normalize(vec2(-r2.y, r2.x));
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      vec2 C = vec2((mod(fi, 2.0) * 2.0 - 1.0) * PX, fi < 2.0 ? 5.6 : 10.4);
      float h = 0.3;
      float tc = dot(C - o2, r2) / dot(r2, r2);
      float pix = gPx * tc;
      float miss = abs(dot(C - o2, nrm)) - h * (abs(nrm.x) + abs(nrm.y));
      if (miss > pix || tc < 0.0) continue;
      vec2 t1 = (C - (h + pix) - o2) / r2, t2 = (C + (h + pix) - o2) / r2;
      vec2 tn = min(t1, t2);
      float tin = max(tn.x, tn.y);
      if (tin < gTP && tin < tR) {
        gTP = tin;
        gAP = ss(pix, -pix, miss);
        nP = tn.x > tn.y ? vec3(-sign(r2.x), 0.0, 0.0) : vec3(0.0, 0.0, -1.0);
      }
    }
  }

  // ── the crowd: rows of people between us and the stage, nearest first ───────────────────────────
  vec4 accF = vec4(0.0), accB = vec4(0.0);
  float rimF = 0.0;
  gTF = 1e4; gTB = 1e4;
  for (int r = 0; r < 7; r++) {
    float z = ROWZ[r], fr = float(r);
    float t = (z - gRo.z) / gRd.z;
    vec3 P = gRo + gRd * t;
    if (P.y > 2.65) continue;                                      // over every hand in this row
    float pix = gPx * t * 1.1 + 0.028 * ss(3.6, 1.9, z);           // the nearest rows a little out of focus
    float X = P.x + fr * 0.37, sp = 0.55;
    float c0 = floor(X / sp), c1 = c0 + (fract(X / sp) > 0.5 ? 1.0 : -1.0);
    float dmin = 1e3, scr = 1.0, best = 0.0;
    vec4 bq = vec4(0.0), bp = vec4(0.0);           // the nearest person: q, H, pose; side, hair, lift
    for (int k = 0; k < 2; k++) {
      float cell = k == 0 ? c0 : c1;
      float h1 = hash21(vec2(cell, fr * 3.1 + 0.7)), h2 = hash21(vec2(cell * 1.7, fr + 9.2)), h3 = hash21(vec2(cell + 4.1, fr * 5.3 + 2.9));
      float cx = (cell + 0.5) * sp + (h1 - 0.5) * 0.24;
      float H = 1.56 + 0.34 * h2;
      float pose = h3 < 0.42 ? 0.0 : h3 < 0.72 ? 1.0 : h3 < 0.93 ? 2.0 : 3.0;
      float hop = gOn * sin(PI * clamp((gAge - h1 * 0.06) / 0.36, 0.0, 1.0));   // everyone bounces on the beat
      float sway = 0.03 * sin(uTime * (0.8 + 0.5 * h2) + h1 * 6.3);
      vec2 q = vec2(X - cx - sway, P.y - 0.05 * hop * (0.5 + h2));
      vec3 pr = vec3(h1 > 0.5 ? 1.0 : -1.0, 1.0 + 0.2 * fract(h2 * 7.3), hop);
      float sc;
      float d = person(q, H, pose, pr.x, pr.y, pr.z, sc);
      if (d < dmin) { dmin = d; scr = sc; best = cell; bq = vec4(q, H, pose); bp = vec4(pr, 0.0); }
    }
    float a = ss(pix, -pix, dmin);
    if (a < 0.002) continue;
    // the stage behind them lights the edges of their tops: the crowns of heads, shoulders, hands
    float rimW = gPx * t * 1.6 + 0.01;
    float rim = 0.0;
    if (dmin > -rimW * 1.5 && z > 2.4) {
      float sc;
      float du = person(bq.xy + vec2(0.0, rimW * 0.7), bq.z, bq.w, bp.x, bp.y, bp.z, sc);
      rim = ss(-rimW, -rimW * 0.15, dmin) * ss(0.1, 0.8, (du - dmin) / (rimW * 0.7)) * ss(2.4, 4.5, z);
    }
    float stageSide = 0.35 + 0.65 * ss(2.0, 11.0, z);
    vec3 c = vec3(0.003, 0.003, 0.0045);
    c += (gTint * 0.12 * gPow * stageSide + gTop + vec3(0.3) * gFlash) * rim;
    // a phone screen, showing the show
    float scrA = ss(pix * 0.6, -pix * 0.6, scr);
    c = mix(c, mix(vec3(0.75, 0.8, 0.9), gTint, 0.35) * (0.45 + 0.35 * hash11(best + fr)), scrA);
    c = mix(c, gFogC, 1.0 - exp(-t * 0.07));
    c += airK * airGlow(t) + washC * washGlow(t);
    if (t < gTP) { accF.rgb += (1.0 - accF.a) * c * a; rimF += (1.0 - accF.a) * a * rim; accF.a += (1.0 - accF.a) * a; gTF = min(gTF, t); }
    else { accB.rgb += (1.0 - accB.a) * c * a; accB.a += (1.0 - accB.a) * a; gTB = min(gTB, t); }
    if (accF.a > 0.995) break;
  }
  gAF = accF.a; gAB = accB.a;

  // ── the lasers ─────────────────────────────────────────────────────────────────────────────────
  gVol = vec3(0.0); gHalo = vec3(0.0); gTop = vec3(0.0);
  vec3 pc[7];
  float pp[7];
  int NP = (accF.a > 0.99 && gTF < 4.0) ? 0 : 7;                 // a body fills the pixel: no beam shows here
  for (int i = 0; i < NP; i++) {
    float fi = float(i), side = (fi - 3.0) / 3.0, odd = mod(fi, 2.0), sg = sign(side);
    vec3 e = vec3(side * gW, RY, RZ);
    // each projector follows its own slice of the spectrum: the middle one the kick, the outer ones the hats
    float bnd = gOn * clamp(spec(0.03 + 0.6 * pow(abs(side), 1.3)) * 1.4, 0.0, 1.0);
    float pw = gPow * (gOn > 0.5 ? 0.45 + 0.9 * bnd : 0.85);
    vec3 cA = odd > 0.5 ? gB : gA;
    int K = 0;
    vec3 f = vec3(0.0, 0.0, -1.0), sx = vec3(1.0, 0.0, 0.0), sy = vec3(0.0, 1.0, 0.0);
    float spread = 0.0, cone = 0.0, rotA = 0.0, az = 0.0;
    if (gFig < 0.5) {
      // FAN: a flat fan from every projector; on each beat it snaps to a new tilt
      K = 9;
      float l0 = pick(gStep - 1.0, 6.0), l1 = pick(gStep, 6.0);
      vec2 lk0 = l0 < 0.5 ? vec2(0.03, 0.0) : l0 < 1.5 ? vec2(0.24, 0.0) : l0 < 2.5 ? vec2(0.16, 0.45) : l0 < 3.5 ? vec2(0.16, -0.45) : l0 < 4.5 ? vec2(0.2, 0.6 * sg) : vec2(0.2, -0.6 * sg);
      vec2 lk1 = l1 < 0.5 ? vec2(0.03, 0.0) : l1 < 1.5 ? vec2(0.24, 0.0) : l1 < 2.5 ? vec2(0.16, 0.45) : l1 < 3.5 ? vec2(0.16, -0.45) : l1 < 4.5 ? vec2(0.2, 0.6 * sg) : vec2(0.2, -0.6 * sg);
      vec2 lk = mix(lk0, lk1, gEase);
      az = -side * 0.05 + 0.05 * sin(uTime * 0.4);
      f = aim(az, lk.x);
      vec3 hx = vec3(cos(az), 0.0, sin(az)), vy = vec3(-sin(lk.x) * sin(az), cos(lk.x), sin(lk.x) * cos(az));
      sx = hx * cos(lk.y) + vy * sin(lk.y);
      spread = (0.3 + 0.28 * gBass) * mix(0.85, 1.0, gWide);
    } else if (gFig < 1.5) {
      // TUNNEL: the middle projector throws a turning cone straight at us, two more at the sides
      if (i == 3 || i == 1 || i == 5) {
        K = i == 3 ? 16 : 10;
        vec3 at = i == 3 ? vec3(0.0, EYE + 0.35, 0.0) : vec3(sg * 4.5, EYE + 1.2, 0.0);
        f = normalize(at - e);
        sx = normalize(cross(f, vec3(0.0, 1.0, 0.0)));
        sy = cross(sx, f);
        float big = mix(pick(gStep - 1.0, 3.0), pick(gStep, 3.0), gEase);
        cone = (0.06 + 0.035 * gBass) * (1.0 + 0.3 * big) * (i == 3 ? 1.0 : 0.7);
        rotA = (i == 3 ? 1.0 : -1.0) * (uTime * 0.5 + (gStep - 1.0 + gEase) * TAU / 32.0);
        cA = i == 3 ? gA : gB;
      } else if (i == 0 || i == 6) { K = 3; cA = gC; }
    } else if (gFig < 2.5) {
      // SCANNING WAVE: upright fans sweeping side to side, one after another along the rig
      K = 7;
      float ph = mix(pick(gStep - 1.0, 2.0) * 2.0 - 1.0, pick(gStep, 2.0) * 2.0 - 1.0, gEase);
      az = -side * 0.05 + (0.2 + 0.18 * gBass) * mix(0.75, 1.0, gWide) * sin(uTime * 1.3 - fi * 0.6 * ph);
      spread = mix(mix(0.5, 0.8, pick(gStep - 1.0 + 0.5, 2.0)), mix(0.5, 0.8, pick(gStep + 0.5, 2.0)), gEase);
    } else {
      // LIQUID SKY: the middle projector throws the sheet; the outer ones a few slow beams high over it
      if (i == 0 || i == 6) { K = 3; cA = gB; }
      else if (i == 1 || i == 5) { K = 2; cA = gC; }
    }
    pc[i] = cA; pp[i] = 0.0;
    // the haze the figure's beams light between them
    if (gFig < 0.5) fanSheet(e, f, sx, spread * clamp(gLive, 0.1, 1.0), cA, pw);
    else if (gFig < 1.5) { if (K > 3) coneSheet(e, f, cone, cA, pw); }
    else if (gFig < 2.5) {
      float um = clamp((gLive - 0.15) / 0.85, 0.05, 1.0);
      vec3 p0 = aim(az, 0.03), p1 = aim(az + side * 0.2 * um, 0.03 + spread * pow(um, 1.15));
      float hw = acos(clamp(dot(p0, p1), -1.0, 1.0)) * 0.5;
      fanSheet(e, normalize(p0 + p1), normalize(p1 - p0), hw, cA, pw);
    }
    for (int j = 0; j < 16; j++) {
      if (j >= K) break;
      float fj = float(j), rank;
      vec3 d, c = cA;
      if (gFig < 0.5) {
        float u = fj / 4.0 - 1.0;
        rank = abs(u);
        d = f * cos(u * spread) + sx * sin(u * spread);
        c = mix(c, gC, ss(0.4, 0.8, gMid) * step(0.7, rank));
      } else if (gFig < 1.5) {
        if (K > 3) {
          rank = fract(fj * 0.618034 + 0.13);
          float ang = fj / float(K) * TAU + rotA;
          d = normalize(f + tan(cone) * (sx * cos(ang) + sy * sin(ang)));
        } else {
          rank = 0.3 + 0.25 * fj;
          d = aim(-side * (0.28 + 0.12 * fj) + 0.05 * sin(uTime * 0.5 + fi), 0.08 + 0.1 * fj);
        }
      } else if (gFig < 2.5) {
        float u = fj / 6.0;
        rank = 0.15 + 0.85 * u;
        d = aim(az + side * 0.2 * u, 0.03 + spread * pow(u, 1.15));
        c = mix(c, gC, ss(0.4, 0.8, gMid) * step(0.9, u));
      } else {
        if (K == 3) { rank = 0.2 + 0.3 * fj; d = aim(side * (0.1 + 0.14 * fj) + 0.06 * sin(uTime * 0.4 + fi), 0.3 + 0.1 * fj); }
        else { rank = 0.5 + 0.3 * fj; d = aim(-side * (0.18 + 0.1 * fj) + 0.08 * sin(uTime * 0.55 + fi * 2.0), 0.18 + 0.07 * fj); }
      }
      float live = ss(gLive + 0.1, gLive - 0.1, rank);
      if (live < 0.003) continue;
      pp[i] += live;
      beam(e, d, beamLen(e, d), c, pw * live, fi * 13.0 + fj);
    }
  }

  // ── the liquid sky: one sheet of light fanned out from the middle over the heads, rippling ──────
  vec3 skyL = vec3(0.0);
  if (gFig > 2.5) {
    float SH = mix(mix(3.3, 3.65, pick(gStep - 1.0, 2.0)), mix(3.3, 3.65, pick(gStep, 2.0)), gEase);
    float slope = (SH - RY) / RZ;
    float den = gRd.y + slope * gRd.z;
    float bnd = gOn * clamp(spec(0.03) * 1.4, 0.0, 1.0);
    float pw = gPow * (gOn > 0.5 ? 0.5 + 0.8 * bnd : 0.85);
    pp[3] = 2.5; pc[3] = gA;
    gTop = gA * 0.12 * pw;
    if (den > 1e-3) {
      float amp = 0.03 + 0.05 * gBass;
      float base = RY + slope * (RZ - gRo.z) - gRo.y;
      float tS = base / den;
      vec3 P = gRo + gRd * tS;
      vec2 g = vec2(0.0);
      float fade = 1.0, hS = 0.0, cf = 1.0;
      for (int it = 0; it < 2; it++) {
        // a pixel's footprint on the sheet: ripples finer than that are let go, so they never crawl
        float foot = gPx * tS / max(den, 0.03);
        fade = ss(0.07, 0.03, foot) * ss(0.015, 0.07, den);
        cf = ss(0.3, 0.1, foot);
        float m = amp * ss(0.0, 5.0, RZ - P.z) * fade;
        float p1 = 5.5 * P.z + 1.4 * P.x + 4.2 * uTime, p2 = 7.7 * P.z - 2.6 * P.x + 5.1 * uTime + 1.7, p3 = 3.6 * P.z + 4.4 * P.x + 2.9 * uTime;
        float wv = 0.55 * sin(p1) + 0.3 * sin(p2) + 0.25 * sin(p3);
        g = m * vec2(0.77 * cos(p1) - 0.78 * cos(p2) + 1.1 * cos(p3), 3.03 * cos(p1) + 2.31 * cos(p2) + 0.9 * cos(p3));
        hS = wv * cf;
        tS = (base + m * wv) / den;
        P = gRo + gRd * tS;
      }
      float back = RZ - P.z;
      if (tS > 0.0 && back > 0.0) {
        vec3 n = normalize(vec3(-g.x, 1.0, slope - g.y));
        float nv = max(abs(dot(n, gRd)), 0.1);
        float ang = atan(P.x, back);
        float half_ = gOn > 0.5 ? 0.48 + 0.34 * gMid : 0.7;
        float fan = ss(half_, half_ - 0.06, abs(ang));
        // the sheet is a fan of 96 beams: the nearest one, as thin as it really is or as a pixel,
        // and where a pixel spans several of them, their average
        float cellA = 2.0 * half_ / 96.0;
        float da = (fract((ang + half_) / cellA) - 0.5) * cellA;
        float wP = 0.007 / max(back, 0.3);
        float footA = gPx * tS / nv / max(back, 0.3);
        float w = max(wP, footA * 0.75);
        float avg = wP * 1.77 / cellA;
        float line = mix(exp(-da * da / (w * w)) * wP / w, avg, ss(0.25 * cellA, 0.8 * cellA, w));
        vec3 bd = normalize(P - vec3(0.0, RY, RZ));
        float graze = 1.0 / max(length(cross(gRd, bd)), 0.3);
        float crest = 0.75 + 0.75 * (ss(-0.4, 1.0, hS) - 0.25 * cf);
        float hzS = hazeAt(tS);
        float k = pw * fan * exp(-back * 0.035) * (0.3 + 1.1 * hzS) * seen(tS) * crest;
        float shimmer = 1.0 - gHigh * 0.5 * (0.5 + 0.5 * sin(back * 4.0 + ang * 30.0 - uTime * 19.0));
        skyL = mix(gA, gB, 0.15) * k * (line * graze * 2.2 * shimmer + 0.035 / nv);
        skyL += vec3(1.0) * k * line * line * graze * 0.4;
      }
    }
  }

  // ── colour the room ────────────────────────────────────────────────────────────────────────────
  vec3 LR = vec3(0.0, RY + 0.3, RZ - 0.6);
  vec3 amb = vec3(0.006, 0.0065, 0.009);
  float sumP = 0.0;
  for (int i = 0; i < 7; i++) sumP += min(pp[i], 4.0);
  float rigPow = gPow * (0.4 + 0.08 * sumP);
  vec3 col;
  {
    vec3 P = PR;
    float conc = 0.72 + 0.28 * fbm3((kind == 0.0 || kind == 4.0 || kind == 5.0 ? P.xy : P.xz) * 0.9);
    vec3 alb = vec3(0.24, 0.235, 0.23) * conc;
    if (kind == 0.0) alb *= 0.3;                        // the back wall is painted black
    if (kind == 3.0 || kind == 5.0) alb = vec3(0.025);
    vec3 L = LR - P;
    float d2 = dot(L, L);
    float facing = max(dot(nR, L) * inversesqrt(d2), 0.0);
    vec3 lightHere = amb + gTint * 14.0 * rigPow * (0.25 + 0.75 * facing) / (d2 + 20.0) + vec3(0.9, 0.95, 1.0) * gFlash * 40.0 * facing / (d2 + 12.0);
    if (kind == 1.0 || kind == 2.0) {
      // the lit haze below fills the ceiling softly, less into the corners where slab meets downstand
      float zc = floor(P.z / BAY + 0.5) * BAY;
      float corner = kind == 2.0 ? ss(HW, HW + 0.9, abs(P.z - zc)) : ss(CEIL, CEIL - DROP, P.y) * 0.6 + 0.4;
      lightHere += (gFogC * (3.0 + 2.0 * hz) + gTop * 2.5) * (0.45 + 0.55 * corner) * (nR.y < -0.5 ? 1.0 : 0.55);
    }
    lightHere += gHalo * 0.5;
    col = alb * lightHere;
    // the booth's edge light pulses with the kick
    if (kind == 5.0) col += gTint * (0.25 + 0.5 * gBass) * gBlink * ss(0.025, 0.0, abs(P.y - (BOOTHY - 0.06)));
    col = mix(col, gFogC, 1.0 - exp(-tR * 0.06));
    col += airK * airGlow(tR) + washC * washGlow(tR);
  }
  // the goal-post truss over the stage: two chords and their zigzag, a tower at each end
  {
    float tt = (TZ - gRo.z) / gRd.z;
    vec3 P = gRo + gRd * tt;
    float pix = gPx * tt;
    float TX = gW + 1.6;
    if (tt < tR && P.y > BOOTHY && P.y < TY + 0.1 && abs(P.x) < TX + 0.3) {
      float yT = TY - 0.03, yB = TY - 0.43;
      float d = 1e3;
      if (abs(P.x) < TX) {
        d = min(abs(P.y - yT), abs(P.y - yB)) - 0.025;
        float u = fract(P.x / 0.4);
        d = min(d, abs(P.y - mix(yB, yT, abs(u * 2.0 - 1.0))) * 0.75 - 0.012);
        d = max(d, max(P.y - yT - 0.03, yB - P.y - 0.03));
      }
      float ax = abs(abs(P.x) - TX);
      if (P.y < yT + 0.03) {
        float tw = abs(ax - 0.2) - 0.025;
        float zz = abs(fract(P.y / 0.4) * 2.0 - 1.0);
        tw = min(tw, max(abs(ax - 0.2 + 0.4 * zz - 0.2) * 0.75 - 0.012, ax - 0.22));
        d = min(d, tw);
      }
      float a = ss(pix, -pix, d);
      vec3 metal = gTint * 0.12 * rigPow * (0.4 + 0.6 * ss(BOOTHY, TY, P.y)) + vec3(0.35) * gFlash;
      col = mix(col, metal + airK * airGlow(tt), a);
    }
  }
  // the projectors on their bar over the booth
  {
    float tt = (RZ + 0.08 - gRo.z) / gRd.z;
    vec3 P = gRo + gRd * tt;
    float pix = gPx * tt;
    if (tt < tR && abs(P.y - RY) < 0.25 && abs(P.x) < gW + 0.6) {
      float x = clamp(floor(P.x / (gW / 3.0) + 0.5), -3.0, 3.0) * gW / 3.0;
      float bd = sdBox(P.xy - vec2(x, RY - 0.02), vec2(0.16, 0.1)) - 0.015;
      bd = min(bd, abs(P.y - (RY - 0.16)) - 0.025);
      float ab = ss(pix, -pix, bd);
      vec3 hc = vec3(0.01) + gTint * 0.1 * rigPow * ss(-0.1, 0.1, P.y - RY);
      col = mix(col, hc + airK * airGlow(tt), ab);
    }
  }
  // the crowd behind the pillars, the pillars, the crowd in front of them
  col = accB.rgb + (1.0 - accB.a) * col;
  if (gAP > 0.0) {
    vec3 P = gRo + gRd * gTP;
    float conc = 0.72 + 0.28 * fbm3(vec2(P.x + P.z, P.y) * 1.2);
    vec3 alb = vec3(0.24, 0.235, 0.23) * conc;
    vec3 L = LR - P;
    float d2 = dot(L, L);
    float facing = max(dot(nP, L) * inversesqrt(d2), 0.0);
    vec3 lightHere = amb + gFogC * (1.5 + 2.0 * ss(1.0, CEIL, P.y)) + gTint * 50.0 * rigPow * (0.04 + 0.96 * facing * facing) / (d2 + 20.0) + vec3(0.9, 0.95, 1.0) * gFlash * 40.0 * facing / (d2 + 12.0) + gHalo * 0.5;
    vec3 c = alb * lightHere;
    c = mix(c, gFogC, 1.0 - exp(-gTP * 0.06));
    c += airK * airGlow(gTP) + washC * washGlow(gTP);
    col = mix(col, c, gAP);
  }
  col = accF.rgb + (1.0 - accF.a) * col;
  col += gHalo * rimF * 0.35;

  // ── light in the air ───────────────────────────────────────────────────────────────────────────
  col += gVol + skyL;
  // the apertures, each glowing with what its projector throws
  float px = 2.0 / uRes.y;
  for (int i = 0; i < 7; i++) {
    vec3 v = vec3((float(i) - 3.0) / 3.0 * gW, RY, RZ) - gRo;
    vec2 sp = LENS * v.xy / v.z - vec2(0.0, gShift);
    vec2 dv = uv - sp;
    float on = min(pp[i], 4.0) * gPow;
    float pt = exp(-dot(dv, dv) / (px * px * 3.0));
    float glow = exp(-length(dv) * 45.0) * 0.25;
    float streak = exp(-abs(dv.y) / (px * 1.2)) * exp(-abs(dv.x) * 9.0) * 0.1;
    col += (pc[i] * (0.6 * pt + glow + streak) + vec3(0.7 * pt)) * on * seen(length(v));
  }
  // the highs: specks of dust glittering where the beams cross the haze
  if (gHigh > 0.001) {
    vec2 g = gl_FragCoord.xy / (3.5 * uRes.y / 1080.0) + vec2(uTime * 1.7, uTime * 1.1);
    vec2 id = floor(g);
    float h = hash21(id + 17.0);
    if (h > 0.8) {
      vec2 o = vec2(hash21(id + 3.0), hash21(id + 8.0)) * 0.6 + 0.2 - fract(g);
      float tw = pow(max(sin(uTime * (7.0 + 9.0 * h) + h * 70.0), 0.0), 5.0);
      vec3 lit = gVol + skyL;
      float lum = dot(lit, vec3(0.3, 0.5, 0.2));
      col += (lit / max(lum, 0.02) * 0.25 + 0.3) * exp(-dot(o, o) * 22.0) * tw * gHigh * 1.6 * ss(0.004, 0.06, lum);
    }
  }
  // the strobe: a breath of white through the haze
  col += vec3(0.85, 0.9, 1.0) * gFlash * 0.06 * (0.3 + 1.2 * hz) * (1.0 - 0.8 * max(accF.a, accB.a));
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'lasers',
  name: 'Lasers',
  group: 'Show',
  blurb: 'A warehouse rave from the dance floor: seven projectors throw fans, tunnels, scanning waves and a liquid sky through the haze over the crowd',
  tags: ['night', 'intense', 'club', 'lasers', 'crowd'],
  energy: 0.92,
  particles: 0,
  trails: 0,
  zoom: 1,
  spin: 0,
  frag,
};
