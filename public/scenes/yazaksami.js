import { SCULPT } from '../js/gfx/scene-kit.js';

// YAZ AKŞAMI — a summer evening as an animated film paints it: one great tower of cumulus, the kind
// that builds over the town on hot afternoons, lit from the side by the sun going down so its
// billows burn orange and pink on one side and fall into violet on the other; the sun itself
// sinking behind a far bank of cloud on the horizon with its edges on fire and its light fanning
// up the sky; the sky going from gold at the horizon through clear blue to the deep blue of the
// coming night, the first stars in it, pink cirrus, an airliner drawing a glowing contrail across,
// a sea of low cloud along the bottom, crows flying home, and the wires of a telegraph pole
// crossing the corner of the frame.
//
// The tower is built from billows seen from the front, each a sphere with smaller ones on its
// crown, painted back to front so every billow shows as a dome over the one behind. The light
// falls first on the tower's big form, then on the billows, and is painted in two tones from a
// gradient map: violet in the shadow, coral to orange to gold on the lit side, magenta between.
//
// Music, quietly: the bass breathes in the sun's glow, its rays and the burning edges; the mids
// warm the light on the clouds; the highs make the stars and the contrail glitter; louder music
// makes the tower boil a little faster; on some of the beats, about two in five, a flash of summer
// lightning lights the tower from inside, gone within the beat.
const frag = `${SCULPT}
float gPx, gAsp, gT;
vec2 gSun;
vec3 gFlash;                 // the summer lightning: xy where in the tower, z how bright right now

// the great tower's billows in its own frame (x across, y up from the foot of its column, radius),
// back to front: from the top of the crown down to the foot, each lower one in front of those above
// it, so every billow shows as a dome over the one behind, the way a cumulus builds
const vec3 HERO[16] = vec3[16](
  vec3(0.02, 1.62, 0.20), vec3(0.18, 1.44, 0.27), vec3(-0.20, 1.42, 0.26),
  vec3(-0.02, 1.16, 0.34), vec3(0.36, 1.14, 0.28), vec3(-0.38, 1.10, 0.26),
  vec3(0.58, 0.98, 0.16), vec3(-0.50, 0.95, 0.16),
  vec3(0.42, 0.86, 0.24), vec3(0.14, 0.84, 0.34), vec3(-0.22, 0.80, 0.30),
  vec3(0.30, 0.50, 0.32), vec3(-0.08, 0.48, 0.38),
  vec3(0.50, 0.18, 0.30), vec3(-0.28, 0.10, 0.40), vec3(0.18, 0.05, 0.42));
// the tower's big form, four broad spheres its billows sit on: the light falls on these first
const vec3 FORM[4] = vec3[4](vec3(0.1, 0.25, 0.72), vec3(0.1, 0.8, 0.68), vec3(0.04, 1.2, 0.64), vec3(0.0, 1.5, 0.46));

// the sky without clouds: gold at the horizon, clear blue, then the deep blue of the coming night
vec3 skyAt(vec2 uv) {
  float y = uv.y;
  float sunSide = exp(-abs(uv.x - gSun.x) * 0.75);
  vec3 c = mix(vec3(0.9, 0.48, 0.6), vec3(1.25, 0.7, 0.4), sunSide);         // the horizon
  c = mix(c, vec3(0.55, 0.62, 0.95), ss(-0.85, -0.3, y));
  c = mix(c, vec3(0.13, 0.33, 0.85), ss(-0.45, 0.15, y));
  c = mix(c, vec3(0.045, 0.12, 0.45), ss(0.05, 0.62, y));
  c = mix(c, vec3(0.02, 0.035, 0.16), ss(0.5, 1.05, y));
  vec2 ds = (uv - gSun) * vec2(0.5, 1.0);
  c = mix(c, vec3(1.35, 0.8, 0.42), exp(-length(ds) * 2.6) * 0.75);         // the sun's side of the sky
  c += vec3(1.3, 0.78, 0.4) * exp(-length(uv - gSun) * 6.5) * (0.5 + 0.5 * gBass);
  return c;
}
// the light on a cloud, as a gradient map from the deepest shadow to where it burns
vec3 ramp(float v) {
  vec3 c = mix(vec3(0.04, 0.04, 0.13), vec3(0.13, 0.1, 0.32), ss(0.0, 0.25, v));
  c = mix(c, vec3(0.42, 0.18, 0.4), ss(0.2, 0.45, v));
  c = mix(c, vec3(0.95, 0.27, 0.27), ss(0.4, 0.62, v));
  c = mix(c, vec3(1.25, 0.5, 0.22), ss(0.58, 0.84, v));
  return mix(c, vec3(1.45, 0.78, 0.34), ss(0.84, 1.0, v));
}
// one billow, a sphere seen from the front, a little wider than tall; within one billow and the
// small ones on its crown the higher surface wins: D is the distance inside the outline, H the
// surface height, N its normal
void lobe(vec2 p, vec3 l, float zo, inout float D, inout float H, inout vec3 N) {
  vec2 d = (p - l.xy) * vec2(0.9, 1.08);
  float dd = dot(d, d);
  float e = l.z - sqrt(dd);
  D = max(D, e);
  if (e <= 0.0) return;
  float z = sqrt(l.z * l.z - dd), hz = z + zo;
  N = mix(N, vec3(d, z) / l.z, clamp(0.5 + 0.5 * (hz - H) / 0.035, 0.0, 1.0));
  H = max(H, hz);
}
// small billows in the noise: round bumps with sharp creases between them
float billow(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * abs(2.0 * noise(p) - 1.0); p = rot(0.6) * p * 2.1 + 3.3; a *= 0.5; }
  return s;
}
// the normal of the tower's big form at q, and how much of it is there (a)
vec4 form(vec2 q) {
  vec4 S = vec4(0.0);
  float cover = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 d = q - FORM[i].xy;
    float r = FORM[i].z, qq = r * r - dot(d, d);
    if (qq <= 0.0) continue;
    float z = sqrt(qq), w = exp(z * 4.0);
    S += vec4(vec3(d, z) / r * w, w);
    cover = max(cover, ss(0.0, 0.06, qq));
  }
  return S.w > 0.0 ? vec4(normalize(S.xyz / S.w), cover) : vec4(0.0, 0.0, 1.0, 0.0);
}
// the great tower, q in its own frame: each billow, with the small ones on its crown, is painted
// over the billows behind it; cav is the shadow in the crease just above a billow in front
void tower(vec2 q, inout float D, inout vec3 N, inout float cav) {
  for (int i = 0; i < 16; i++) {
    vec3 l = HERO[i];
    float fi = float(i);
    l.z *= 1.0 + 0.03 * sin(gT * 0.5 + fi * 1.7);                  // the billows breathe slowly
    float gD = -1.0, gH = -1e3;
    vec3 gN = vec3(0.0, 0.0, 1.0);
    lobe(q, l, 0.0, gD, gH, gN);
    for (int j = 0; j < 3; j++) {
      float fj = float(j);
      float th = (fj - 1.0) * 0.85 + (hash21(vec2(fi, fj) + 4.7) - 0.5) * 0.5 + 0.12 * sin(gT * 0.3 + fi + fj * 2.0);
      vec2 c = l.xy + l.z * 0.66 * vec2(sin(th), cos(th));
      lobe(q, vec3(c, l.z * (0.38 + 0.12 * hash21(vec2(fj, fi) + 9.1))), 0.75 * l.z, gD, gH, gN);
    }
    float t = ss(0.0, 0.03, gD);
    N = mix(N, gN, t);
    cav = mix(max(cav, ss(-0.07, 0.0, gD)), 0.0, t);
    D = max(D, gD);
  }
}
// a cloud's colour from its outline, surface and seams; sunlit says how much of the sun reaches it
vec4 shade(vec2 p, vec2 dp, float cx, float D, vec3 N, vec4 big, float cav, float sunlit, float haze, float soft) {
  // the finest billows, in the noise, bump the outline and the surface
  vec2 bq = dp * 9.0 + vec2(0.0, -gT * 0.08);
  float b0 = billow(bq);
  float bx = billow(bq + vec2(0.05, 0.0)) - b0, by = billow(bq + vec2(0.0, 0.05)) - b0;
  D += (b0 - 0.4) * mix(0.025, 0.045, ss(0.9, 1.5, dp.y));
  N = normalize(N);
  vec3 n = normalize(mix(N, mix(big.xyz, N, 0.5), big.a));
  n = normalize(n + vec3(bx, by, 0.0) * 0.35);
  float phi = clamp((cx - gSun.x) / max(gAsp, 0.8) * 1.9, -1.9, 1.9);   // how far round from the sun the cloud is
  vec3 L = normalize(vec3(-sin(phi), 0.18, 0.3 - cos(phi)));
  float ndl = dot(n, L);
  float ao = mix(1.0, 0.78, cav) * (0.85 + 0.15 * ss(-0.7, 0.5, n.y));
  float diff = ss(0.0, 0.24, ndl) * sunlit;
  float high = ss(0.3, 1.6, dp.y);                                  // the lower billows take a pinker light
  float edge = 1.0 - ss(0.0, 0.05, D);                               // thin cloud at the outline
  vec2 nxy = n.xy / max(length(n.xy), 1e-4), lxy = L.xy / max(length(L.xy), 1e-4);
  float facing = pow(max(dot(nxy, lxy), 0.0), 2.0);                 // the outline turned towards the sun
  float rim = edge * facing;
  float vLit = (mix(0.6, 0.95, ss(0.2, 0.95, ndl)) - 0.2 * (1.0 - high) + rim * 0.15 + 0.06 * gMid + (fbm(dp * 5.0 + 7.0) - 0.5) * 0.14) * mix(1.0, 0.8, cav);
  float vShade = 0.07 + 0.14 * ss(-0.6, 0.7, n.y) * ao;
  float bounce = max(ss(0.0, 0.35, dot(big.xyz, L)) * big.a, ss(0.15, -0.4, dp.x));
  vShade = mix(vShade, 0.44, bounce * sunlit * 0.75);
  vec3 c = ramp(clamp(mix(vShade, vLit, diff), 0.0, 1.0));
  c += mix(vec3(0.08, 0.04, 0.06), vec3(0.02, 0.05, 0.16), ss(-0.6, 0.6, n.y)) * (1.0 - diff);
  c += vec3(0.08, 0.14, 0.38) * edge * (1.0 - diff) * 0.7;               // the sky's light wrapping the shadowed edge
  c += vec3(1.9, 1.1, 0.55) * ss(0.03, 0.0, D) * facing * sunlit * (0.45 + 0.4 * gBass);   // the burning edge
  vec2 fd = dp - gFlash.xy;
  c += vec3(0.95, 0.98, 1.6) * gFlash.z * exp(-dot(fd, fd) / 0.045) * (0.5 + 0.9 * (1.0 - n.z)) * (0.6 + 0.8 * fbm(dp * 6.0 + gFlash.xy * 9.0)) * (1.0 - 0.6 * diff);
  c = mix(c, skyAt(p), haze);
  return vec4(c, ss(-gPx - soft - 0.012 * (1.0 - diff), gPx, D));    // softer, wispier edges on the shadow side
}
// the top of the low deck at x: big flattened domes with smaller ones on them; nn is its normal there
float deckTop(float x, out vec2 nn) {
  float top = -2.0;
  nn = vec2(0.0, 1.0);
  for (int row = 0; row < 2; row++) {
    float fr = float(row), cw = row == 0 ? 0.3 : 0.12, cell = floor(x / cw);
    for (int k = -1; k <= 1; k++) {
      float id = cell + float(k);
      float h1 = hash11(id * 3.1 + fr * 17.0 + 0.5), h2 = hash11(id * 7.3 + fr * 5.0 + 0.2), h3 = hash11(id * 1.7 + fr * 9.0 + 0.9);
      float xi = (id + 0.5 + (h1 - 0.5) * 0.6) * cw, ri = cw * (0.55 + 0.45 * h2);
      float yi = (row == 0 ? -1.0 : -0.965 + 0.05 * sin(x * 2.3)) + h3 * 0.05, dx = x - xi;
      if (abs(dx) >= ri) continue;
      float t = yi + sqrt(ri * ri - dx * dx) * 0.55;
      if (t > top) { top = t; nn = normalize(vec2(dx, (t - yi) / 0.3)); }
    }
  }
  return top;
}
// distance from p to the segment ab
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
// a telegraph wire hanging from a at the pole, dropping away towards the next pole out of the frame
float wire(vec2 uv, vec2 a, float drop, float w) {
  float dx = a.x - uv.x;
  if (dx < 0.0) return 0.0;
  float k = exp(-dx / w);
  float d = abs(uv.y - (a.y - drop * (1.0 - k))) / sqrt(1.0 + drop * drop / (w * w) * k * k);
  return ss(gPx * 1.25, gPx * 0.35, d);
}
void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gSun = vec2(-max(gAsp * 0.42, 0.4), -0.74);
  gT = uCruise * 0.5;
  gFlash = vec3(0.0);
  if (uAudioActive > 0.5 && uBeatAge < 0.45 && hash11(uBeatCount * 7.7 + 0.3) < 0.4) {
    float n = uBeatCount, a = uBeatAge;
    float env = exp(-a * 16.0) + 0.7 * step(0.11, a) * exp(-(a - 0.11) * 13.0);     // a flash and its echo
    gFlash = vec3(0.05 + hash11(n * 1.7) * 0.4, 0.3 + hash11(n * 2.9) * 0.75, env * uPunch * (0.6 + 0.4 * hash11(n * 4.1)));
  }
  vec3 col = skyAt(uv);

  // the first stars, high up where the sky has gone deep blue
  for (int layer = 0; layer < 2; layer++) {
    float scale = 40.0 + float(layer) * 46.0;
    vec2 g = uv * scale + float(layer) * 29.3;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + 71.0);
    if (h > 0.05) continue;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float r = length(f - off * 0.7) / scale;
    float tw = 0.75 + 0.25 * sin(uTime * (1.1 + h * 30.0) + h * 70.0) + gHigh * 0.7 * sin(uTime * 13.0 + h * 90.0);
    float mag = 0.12 + pow(hash21(cell + 1.3), 5.0) * 1.6;
    col += vec3(0.95, 0.95, 1.0) * mag * tw * exp(-r * r / (gPx * gPx * 0.6)) * ss(0.3, 0.85, uv.y);
  }
  // cirrus high up, combed out by the wind, catching the last pink light
  {
    vec2 cq = rot(-0.16) * uv;
    float bend = fbm(cq * vec2(1.2, 2.5) + 2.0) * 1.6;
    float ci = fbm(vec2(cq.x * 0.55 + uTime * 0.002, cq.y * 11.0 + bend));
    float wisp = ss(0.56, 0.76, ci) * ss(0.12, 0.4, uv.y) * ss(0.95, 0.6, uv.y) * ss(0.25, 0.6, fbm(cq * 1.3 + 9.0));
    col = mix(col, vec3(1.3, 0.55, 0.58) * (0.7 + 0.35 * exp(-length(uv - gSun) * 0.7)), wisp * 0.55);
  }
  // an airliner crawling across, its contrail still in the sunlight up there and glowing
  {
    vec2 dir = normalize(vec2(-1.0, 0.13));
    float run = gAsp * 2.0 + 1.4, speed = 0.016;
    float cyc = floor((uTime * speed + run * 0.3) / run);
    for (int k = 0; k < 2; k++) {
      float s = uTime * speed + run * 0.3 - (cyc - float(k)) * run;    // how far this one has flown
      vec2 plane = vec2(gAsp + 0.2, 0.5) + dir * s;
      vec2 rel = uv - plane;
      float behind = -dot(rel, dir);
      float side = dot(rel, vec2(-dir.y, dir.x)) + (noise(vec2(behind * 5.0, float(k))) - 0.5) * behind * 0.01;
      if (behind > 0.0 && behind < s) {
        float w = gPx * 0.8 + behind * 0.004;
        float trail = exp(-side * side / (w * w)) * exp(-behind * 0.9) * ss(0.0, 0.025, behind);
        col += vec3(1.3, 0.8, 0.62) * trail * (0.8 + 0.4 * gHigh * sin(behind * 70.0 - uTime * 5.0));
      }
      if (k == 0) {
        float d2 = dot(rel, rel) / (gPx * gPx);
        col += vec3(1.5, 1.4, 1.2) * exp(-d2 * 0.5) + vec3(1.8, 0.2, 0.15) * exp(-d2 * 0.35) * step(0.88, fract(uTime * 0.8));
      }
    }
  }
  // shafts of light fanning up from the sun through the gaps in the far clouds
  {
    vec2 toP = uv - gSun;
    float ang = atan(toP.x, toP.y);
    float rays = pow(noise(vec2(ang * 9.0, uTime * 0.03)), 2.0) * 0.7 + pow(noise(vec2(ang * 23.0 + 5.0, uTime * 0.05)), 3.0) * 0.6;
    col += vec3(1.2, 0.7, 0.36) * rays * exp(-length(toP) * 1.1) * ss(-0.05, 0.2, toP.y) * 0.25 * (0.6 + 0.5 * gBass);
  }
  // the sun, half down behind the far bank
  {
    float d = length(uv - gSun);
    col += vec3(2.6, 2.0, 1.3) * ss(0.055 + gPx, 0.055 - gPx, d) + vec3(1.6, 1.0, 0.55) * exp(-d * 22.0) * (0.8 + 0.5 * gBass);
  }
  // the far bank along the horizon, in front of the sun, its top edge burning
  {
    float top = -0.755 + (fbm(vec2(uv.x * 1.6 + gT * 0.004, 3.0)) - 0.5) * 0.13;
    float D = top - uv.y;
    vec2 bp = vec2(uv.x * 2.0, uv.y * 7.0);
    D += (billow(bp * 2.0) - 0.4) * 0.02;
    if (D > -0.05) {
      float nearSun = exp(-abs(uv.x - gSun.x) * 1.3);
      vec3 body = mix(ramp(0.4 + 0.12 * fbm(bp)), ramp(0.12), nearSun);
      body = mix(body, ramp(0.05), ss(0.0, 0.3, D));
      body += vec3(1.9, 1.25, 0.7) * ss(0.03, 0.0, D) * (0.2 + 1.5 * nearSun) * (0.75 + 0.5 * gBass);
      body = mix(body, skyAt(uv), 0.22);
      col = mix(col, body, ss(-gPx, gPx * 1.5, D));
    }
  }
  // the great tower, side-lit, with the lower part already in the shadow of the far bank
  {
    float tsc = mix(0.72, 1.0, ss(0.6, 1.5, gAsp));                 // a little smaller in a tall frame
    vec2 base = vec2(max(gAsp * 0.5, 0.25), -1.12);
    vec2 q = (uv - base) / tsc;
    if (q.x > -0.85 && q.x < 0.85 && q.y < 1.9) {
      float D = -1.0, cav = 0.0;
      vec3 N = vec3(0.0, 0.0, 1.0);
      vec2 wq = q + (vec2(fbm(q * 2.2 + vec2(3.1, -gT * 0.04)), fbm(q * 2.2 + vec2(8.7, -gT * 0.03))) - 0.5) * 0.075;   // no billow is a true circle
      tower(wq, D, N, cav);
      if (D > -0.06) {
        float sunlit = ss(0.2, 0.65, q.y + (fbm(q * 3.0) - 0.5) * 0.25);
        vec4 big = form(q);
        vec4 c = shade(uv, q, base.x, D, N, big, cav, sunlit, 0.06 + 0.14 * ss(0.4, 0.0, q.y), 0.004 + 0.03 * ss(0.5, 0.0, q.y));
        col = mix(col, c.rgb, c.a);
      }
    }
  }
  // low clouds along the bottom of the frame, nearer than the tower and already in shadow
  {
    vec2 nn;
    float D = deckTop(uv.x + gT * 0.004, nn) - uv.y;
    D += (billow(uv * vec2(12.0, 18.0) + vec2(gT * 0.01, 0.0)) - 0.4) * 0.015;
    if (D > -0.02) {
      float nearSun = exp(-abs(uv.x - gSun.x) * 1.1);
      vec3 c = ramp(0.07 + 0.1 * max(nn.y, 0.0));
      c += vec3(1.5, 0.72, 0.42) * ss(0.03, 0.0, D) * max(nn.y, 0.0) * (0.04 + 1.2 * nearSun) * (0.8 + 0.4 * gBass);
      c = mix(c, skyAt(uv), 0.12);
      col = mix(col, c, ss(-gPx, gPx * 1.5, D));
    }
  }
  // the telegraph pole at the edge of the frame, its wires, and crows flying home, all in one ink
  {
    float px = gAsp - 0.16;
    float ink = 0.0;
    float poleW = 0.009 + (0.3 - uv.y) * 0.002;
    ink = max(ink, ss(poleW + gPx, poleW, abs(uv.x - px)) * step(uv.y, 0.32));
    ink = max(ink, ss(0.006 + gPx, 0.006, abs(uv.y - 0.22)) * ss(0.125 + gPx, 0.125, abs(uv.x - px)));
    ink = max(ink, ss(0.006 + gPx, 0.006, abs(uv.y - 0.07)) * ss(0.105 + gPx, 0.105, abs(uv.x - px)));
    for (int i = 0; i < 3; i++) {
      float ox = (float(i) - 1.0) * 0.105;
      ink = max(ink, ss(0.012 + gPx, 0.012, length((uv - vec2(px + ox, 0.24)) * vec2(1.5, 1.0))));
      ink = max(ink, ss(0.011 + gPx, 0.011, length((uv - vec2(px + ox * 0.85, 0.09)) * vec2(1.5, 1.0))));
      ink = max(ink, wire(uv, vec2(px + ox, 0.245), 0.9 + float(i) * 0.08, 1.4 + float(i) * 0.25));
      ink = max(ink, wire(uv, vec2(px + ox * 0.85, 0.095), 0.85 + float(i) * 0.07, 1.2 + float(i) * 0.2));
    }
    ink = max(ink, wire(uv, vec2(px, -0.25), 0.55, 0.9));
    float tb = fract((uTime + 25.0) / 80.0);
    vec2 lead = vec2(mix(gAsp + 0.15, -gAsp - 0.35, tb), 0.1 + 0.04 * sin(uTime * 0.11));
    float bs = 0.011, bpx = gPx / bs;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      vec2 b = lead + vec2(0.04 * fi + 0.012 * sin(fi * 2.3), 0.016 * fi * (mod(fi, 2.0) * 2.0 - 1.0) + 0.01 * sin(uTime * 0.6 + fi * 1.3));
      vec2 r = (uv - b) / bs;
      if (dot(r, r) > 6.0) continue;
      float flap = sin(uTime * (5.5 + 0.4 * fi) + fi * 1.9);
      vec2 ra = vec2(abs(r.x), r.y), elbow = vec2(0.45, 0.22 + 0.2 * flap);
      float d = min(seg(ra, vec2(0.0), elbow), seg(ra, elbow, vec2(1.0, 0.1 + 0.55 * flap)));
      ink = max(ink, ss(0.13 + bpx, 0.13, d));
    }
    col = mix(col, vec3(0.012, 0.014, 0.045), ink);
  }
  // a faint flare from the sun, its ghosts mirrored through the middle of the frame
  for (int k = 0; k < 3; k++) {
    vec2 g = gSun * (-0.35 - 0.5 * float(k));
    float rr = 0.04 + 0.03 * float(k);
    float ghost = ss(rr, rr * 0.5, length(uv - g));
    vec3 tint = k == 0 ? vec3(1.0, 0.75, 0.4) : k == 1 ? vec3(0.8, 0.5, 1.0) : vec3(0.4, 0.8, 1.0);
    col += tint * ghost * 0.05 * (0.5 + 0.9 * gBass);
  }
  // and the streak a lens draws through the sun
  col += vec3(1.0, 0.6, 0.35) * exp(-abs(uv.y - gSun.y) * 90.0) * exp(-abs(uv.x - gSun.x) * 1.4) * 0.25 * (0.6 + 0.6 * gBass);
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'yazaksami', name: 'Yaz Akşamı', group: 'Vibe',
  blurb: 'A summer evening like an animated film: a great tower of cloud burning orange in the setting sun, a glowing contrail, the first stars, and summer lightning on the beat',
  tags: ['sky', 'clouds', 'sunset', 'anime', 'dreamy', 'warm', 'calm'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
