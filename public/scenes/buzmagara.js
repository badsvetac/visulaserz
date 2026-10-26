import { SCULPT } from '../js/gfx/scene-kit.js';

// BUZ MAĞARASI — inside a glacier ice cave. The walls are scalloped like hammered glass, every
// cup a little thinner than the ridges round it, and the daylight seeps through them from the
// glacier above: deep cobalt where the ice is thick, cyan, and bright turquoise where it is thin.
// The cave bends gently towards its mouth, where a white world of snow and sky burns in the
// opening; a small figure with a lantern stands on the frozen pool against it, warm against all
// that blue. Icicles hang from the roof, drops gather on their tips, crystals in the ice throw
// tiny rainbow glints, and the frozen pool mirrors the whole cave.
//
// The cave is an elliptic tube traced analytically (a few fixed-point steps let its radius wander
// and narrow towards the mouth); the floor is a mirror traced again; icicles, the figure and the
// drops are drawn in world space and projected, so their reflections are true mirrors.
//
// Music: each of the six thin, glowing patches of ice follows its own band, from bass to highs;
// the bass breathes the daylight in through the roof; the highs make the crystal glints and the
// drops on the icicle tips sparkle; on some beats (about two in five) a drop falls from an icicle
// and rings the pool, and on a few others a crack of light runs through the roof, each gone
// within the beat.
const frag = `${SCULPT}
const float CA = 5.5, CB = 4.0;      // the cave's half width and half height (metres)
const float FLOOR = -2.0;            // the frozen pool
const float ZM = 22.0;               // where the cave opens
const float FL = 1.4;                // the lens
float gPx, gAsp;
vec2 gVP;                            // where the cave's axis vanishes on the screen
vec3 gCam;
vec4 gDrop;                          // the beat's drop: x, z where it lands, its age, how strong
vec4 gCrack;                         // the beat's crack: where along the roof, its depth, progress, brightness
vec3 gLamp;                          // the lantern, in the world

// the thin patches of ice, each its own band: angle round the cave, depth, size across, size along
const vec4 PATCH[6] = vec4[6](
  vec4(-1.75, 4.5, 1.6, 1.5), vec4(-0.2, 9.0, 1.4, 1.6), vec4(0.55, 6.5, 1.5, 1.6),
  vec4(-0.85, 9.5, 1.3, 2.0), vec4(1.35, 9.0, 1.3, 2.0), vec4(0.1, 15.5, 1.2, 1.8));

float bendX(float z) { return 0.0035 * z * z; }                   // the cave curves gently right
float wallMul(float th, float z) {
  float narrow = mix(1.0, 0.74, ss(7.0, ZM, z));
  return narrow * (1.0 + 0.1 * (noise(vec2(th * 1.6 + 3.0, z * 0.22)) - 0.5) + 0.04 * sin(th * 2.3 + z * 0.37));
}
// where the ray o + t d meets the cave; kind is 1 when it leaves through the mouth
float caveTrace(vec3 o, vec3 d, out float kind, out vec3 p) {
  float tEnd = (ZM - o.z) / d.z;
  vec3 pe = o + d * tEnd;
  vec2 qe = (pe.xy - vec2(bendX(ZM), 0.0)) / vec2(CA, CB);
  float rim = length(qe) - wallMul(atan(qe.x, qe.y), ZM) + (noise(vec2(atan(qe.x, qe.y) * 7.0, 2.0)) - 0.5) * 0.06;
  if (rim < 0.0) { kind = 1.0; p = pe; return tEnd; }
  kind = 0.0;
  float t = 8.0;
  for (int i = 0; i < 5; i++) {
    p = o + d * t;
    float z = clamp(p.z, 0.0, ZM);
    vec2 c = vec2(bendX(z), 0.0);
    vec2 q0 = (p.xy - c) / vec2(CA, CB);
    vec2 R = vec2(CA, CB) * wallMul(atan(q0.x, q0.y), z);
    vec2 q = (o.xy - c) / R, e = d.xy / R;
    float a = dot(e, e), b = dot(q, e), cc = dot(q, q) - 1.0;
    float tn = (-b + sqrt(max(b * b - a * cc, 0.0))) / max(a, 1e-5);
    t = i == 0 ? tn : mix(t, tn, 0.8);
  }
  t = min(t, tEnd);
  p = o + d * t;
  return t;
}
// light through ice, as a gradient map from the thickest to the thinnest
vec3 iceRamp(float v) {
  vec3 c = mix(vec3(0.002, 0.008, 0.03), vec3(0.006, 0.05, 0.16), ss(0.0, 0.25, v));
  c = mix(c, vec3(0.012, 0.15, 0.4), ss(0.22, 0.5, v));
  c = mix(c, vec3(0.035, 0.4, 0.66), ss(0.46, 0.7, v));
  c = mix(c, vec3(0.2, 0.78, 0.86), ss(0.66, 0.88, v));
  return mix(c, vec3(0.5, 1.0, 0.98), ss(0.86, 1.0, v));
}
// the scallops: cups in the ice, f1 the distance to the cup's centre, f2-f1 to its ridge
vec2 scallop(vec2 w, out vec2 rel) {
  vec2 g = floor(w), f = fract(w);
  float f1 = 8.0, f2 = 8.0;
  rel = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j));
    vec2 h = vec2(hash21(g + o), hash21(g + o + 17.3));
    vec2 r = o + 0.15 + 0.7 * h - f;
    float dd = dot(r, r);
    if (dd < f1) { f2 = f1; f1 = dd; rel = -r; } else if (dd < f2) f2 = dd;
  }
  return vec2(sqrt(f1), sqrt(f2) - sqrt(f1));
}
// the snowy world outside the mouth, by direction
vec3 outside(vec3 d) {
  float el = d.y / length(d.xz), az = d.x / d.z;
  vec3 c = mix(vec3(1.0, 1.02, 1.04), vec3(0.4, 0.64, 1.0), ss(0.0, 0.13, el));
  float ridge = 0.025 + 0.05 * fbm(vec2(az * 5.0 + 1.0, 3.0)) + 0.03 * ss(0.15, 0.0, abs(az - 0.12));
  if (el < ridge) {
    float sh = fbm(vec2(az * 14.0, el * 30.0));
    c = mix(vec3(0.45, 0.62, 0.92), vec3(1.1, 1.08, 1.04), ss(0.42, 0.55, sh + (az - 0.1) * 2.5));
    c = mix(c, vec3(0.88, 0.94, 1.04), ss(ridge - 0.01, ridge - 0.05, el) * 0.7);
  }
  if (el < -0.005) {
    float drift = fbm(vec2(az * 3.0, 1.0 / max(-el, 0.01) * 0.2));
    c = mix(vec3(0.7, 0.84, 1.0), vec3(1.12, 1.12, 1.08), ss(0.3, 0.65, drift));
  }
  return c;
}
// the ice of the walls and roof at p, seen from distance t
vec3 iceWall(vec3 p, float t) {
  float z = p.z;
  vec2 q = (p.xy - vec2(bendX(z), 0.0)) / vec2(CA, CB);
  float th = atan(q.x, q.y);                                        // 0 at the crown of the roof
  vec2 w = vec2(th * 4.6, z);                                       // metres round, metres along
  float roof = ss(1.8, 0.1, abs(th));
  float nearMouth = ss(ZM - 10.0, ZM, z);
  float v = 0.2 + 0.28 * roof + 0.45 * nearMouth * nearMouth - 0.08 * ss(1.6, 2.5, abs(th));
  float big = fbm(w * 0.2 + 4.0);
  v += (big - 0.5) * 0.55;                                          // thick and thin ice
  // the thin patches, each glowing with its band, and the bass breathing light in through the roof
  float glow = 0.0, core = 0.0;
  vec2 warp = vec2(fbm(w * 0.5), fbm(w * 0.5 + 9.0)) - 0.5;          // no patch and no cup is regular
  for (int i = 0; i < 6; i++) {
    vec4 P = PATCH[i];
    vec2 dd = (w - vec2(P.x * 4.6, P.y)) / P.zw;
    dd += rot(float(i) * 1.7) * warp * 1.3;
    float g = exp(-dot(dd, dd));
    float b = band(0.04 + 0.17 * float(i));
    glow += g * (0.42 + 0.12 * b) + g * g * (0.28 + 0.14 * b);
    core += g * g * g * (0.3 + 0.7 * b);
  }
  v += glow + gBass * (0.08 + 0.14 * roof + 0.12 * glow);
  // the scallops: spoon-shaped cups, each lit from the mouth side, so a sharp crest of light runs
  // where the bright side of one cup meets the shaded side of the next
  vec2 rel;
  vec2 ww = vec2(w.x * 2.0, w.y * 2.2) + warp * 2.2;
  vec2 sc = scallop(ww, rel);
  float rpos = sc.x / max(sc.x + sc.y, 1e-3);                       // 0 in the cup, 1 on its ridge
  vec2 rn = rel / max(sc.x + sc.y, 0.05);
  float spoon = dot(rn, normalize(vec2(-sign(th) * 0.6, 1.0)));
  float detail = ss(24.0, 7.0, t) * (1.0 - 0.6 * nearMouth);
  v += (spoon * 0.2 + (0.25 - rpos * rpos) * 0.08) * detail * (0.5 + 0.7 * ss(0.05, 0.6, v));
  // the crack of light on the beat, running across the roof
  float crack = 0.0;
  if (gCrack.w > 0.0) {
    float s = w.x - gCrack.x;
    float zc = gCrack.y + (noise(vec2(s * 1.4, gCrack.x)) - 0.5) * 1.4 + (noise(vec2(s * 6.0, 3.0)) - 0.5) * 0.35;
    float dz = abs(z - zc);
    float along = ss(gCrack.z * 9.0 + 0.2, gCrack.z * 9.0 - 0.3, abs(s));
    crack = along * gCrack.w * (exp(-dz * 26.0) * 1.6 + exp(-dz * 3.0) * 0.25);
  }
  vec3 col = iceRamp(clamp(v * 0.92, 0.0, 1.0));
  col += vec3(0.2, 0.7, 0.66) * min(core, 1.2) * 0.4;
  col += vec3(0.5, 0.95, 1.0) * ss(0.05, 0.0, sc.y) * ss(-0.2, 0.6, spoon) * detail * clamp(v, 0.1, 1.0) * 0.3;   // crests catching light
  col += vec3(0.7, 1.2, 1.25) * crack;
  // the lantern's warm light on the ice near it
  vec3 lw = p - gLamp;
  col += vec3(0.5, 0.24, 0.08) * exp(-dot(lw, lw) / 10.0) * 0.5;
  // the clear blue air, brighter towards the mouth
  vec3 air = mix(vec3(0.004, 0.03, 0.09), vec3(0.3, 0.62, 0.7), nearMouth * nearMouth);
  return mix(col, air, (1.0 - exp(-t * 0.03)) * 0.55);
}
// distance from p to the segment ab
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
// one icicle: where it hangs from the roof, how long and how thick it is
void icicleAt(float fi, out vec3 root, out float L, out float W) {
  float z = 21.2 - fi * 0.8 + (hash11(fi * 5.1) - 0.5) * 0.6 + ss(14.5, 21.0, fi) * 0.8;
  float spread = mod(fi, 2.0) > 0.5 ? 0.75 : 1.9;
  float th = (hash11(fi * 3.7 + 1.0) - 0.5) * spread;
  if (fi > 14.5 && mod(fi, 2.0) > 0.5) th = (mod(fi, 4.0) < 2.0 ? -1.0 : 1.0) * (0.25 + 0.2 * hash11(fi * 3.7 + 1.0));   // the ones that drip
  float m = mix(1.0, 0.74, ss(7.0, ZM, z)) * (1.0 + 0.04 * sin(th * 2.3 + z * 0.37)) * 0.93;
  root = vec3(vec2(bendX(z), 0.0) + vec2(CA, CB) * m * vec2(sin(th), cos(th)), z);
  float h = hash11(fi * 9.3 + 2.0);
  L = mix(0.4, 2.3, h * h) * mix(0.6, 1.0, ss(1.2, 0.3, abs(th)));
  W = L * 0.1 + 0.06;
}
// project a world point to the screen; k is the screen size of one metre there
vec2 project(vec3 P, out float k) { k = FL / P.z; return gVP + k * (P.xy - gCam.xy); }
// the icicles over col; mirrored for the pool's reflection; depth is how far the surface behind is
vec3 icicles(vec2 uv, vec3 col, float depth, float mir) {
  for (int i = 0; i < 22; i++) {
    float fi = float(i), L, W, k;
    vec3 root;
    icicleAt(fi, root, L, W);
    if (root.z > depth + 0.6) continue;
    if (mir > 0.5) root.y = 2.0 * FLOOR - root.y;
    vec2 rs = project(root, k);
    vec2 lp = (uv - rs) / k;
    if (mir > 0.5) lp.y = -lp.y;
    if (lp.y > 0.1 || lp.y < -L - 0.12 || abs(lp.x) > W + 0.12) continue;
    float u = clamp(-lp.y / L, 0.0, 1.0);
    float hw = W * pow(1.0 - u, 0.85) * (1.0 + 0.07 * sin(u * L * 17.0 + fi)) + 0.004;
    float px = gPx / k;
    float sd = abs(lp.x) - hw;
    float a = ss(px, -px, sd) * step(lp.y, 0.06) * ss(-L - px, -L + px * 2.0, lp.y);
    float xx = lp.x / hw;
    float side = sign(rs.x - gVP.x - 0.05);
    vec3 ic = col * vec3(0.35, 0.8, 0.95) * 0.75 + vec3(0.01, 0.07, 0.15);
    ic += vec3(0.25, 0.75, 0.85) * exp(-xx * xx * 6.0) * 0.32 * (1.0 - u * 0.5);   // the glow down its core
    ic += vec3(0.7, 1.1, 1.15) * ss(0.45, 0.95, -xx * side) * 0.4;                 // its edge towards the mouth
    float tipGlow = exp(-pow((lp.y + L) / max(W, 0.05), 2.0) * 3.0);
    ic += vec3(0.4, 0.9, 1.0) * tipGlow * 0.3;
    col = mix(col, ic, a * (mir > 0.5 ? 0.8 : 1.0));
    // the drop gathering on its tip, sparkling with the highs
    vec2 dt = vec2(lp.x, lp.y + L + 0.035);
    float dr = length(dt) / px;
    float tw = 0.5 + 0.5 * sin(uTime * 2.3 + fi * 4.1);
    col += vec3(0.8, 1.1, 1.15) * exp(-dr * dr * 0.12) * (0.12 + 0.3 * tw + 1.5 * gHigh) * (mir > 0.5 ? 0.5 : 1.0);
  }
  return col;
}
// the figure with the lantern, p in metres from its feet
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float figureSD(vec2 p) {
  float d = seg(p, vec2(-0.08, 0.0), vec2(-0.06, 0.7)) - 0.062;
  d = min(d, seg(p, vec2(0.08, 0.0), vec2(0.06, 0.7)) - 0.062);
  vec2 q = p - vec2(0.0, 1.0);
  float wdt = mix(0.26, 0.17, ss(-0.45, 0.42, q.y));                // a long coat, wider at the hem
  float coat = max(abs(q.x) - wdt, abs(q.y) - 0.44) - 0.03;
  d = smin(d, coat, 0.04);
  d = smin(d, length((p - vec2(0.01, 1.53)) * vec2(1.0, 0.88)) - 0.13, 0.07);    // the hood
  d = smin(d, length(max(abs(p - vec2(-0.19, 1.2)) - vec2(0.07, 0.18), 0.0)) - 0.05, 0.03);   // the pack
  d = smin(d, seg(p, vec2(0.15, 1.34), vec2(0.33, 1.0)) - 0.042, 0.03);
  d = min(d, seg(p, vec2(0.33, 1.0), vec2(0.34, 0.9)) - 0.007);
  d = min(d, length(max(abs(p - vec2(0.34, 0.82)) - vec2(0.04, 0.06), 0.0)) - 0.014);
  return d;
}
vec3 figure(vec2 uv, vec3 col, float mir) {
  float k;
  vec3 F = vec3(gLamp.x - 0.34, FLOOR, gLamp.z);
  vec2 fs = project(F, k);
  vec2 lp = (uv - fs) / k;
  if (mir > 0.5) lp.y = -lp.y;
  if (lp.y < -0.1 || lp.y > 1.9 || abs(lp.x) > 0.6) return col;
  float sd = figureSD(lp), px = gPx / k;
  float a = ss(px, -px, sd);
  vec2 ld = lp - vec2(0.34, 0.82);
  vec3 c = vec3(0.006, 0.012, 0.03);
  c += vec3(0.35, 0.7, 0.8) * ss(-0.06, 0.0, sd) * 0.5;                          // the mouth's light round its edge
  c += vec3(0.9, 0.42, 0.13) * exp(-dot(ld, ld) / 0.12) * 0.55;                   // the lantern on its coat
  col = mix(col, c * (mir > 0.5 ? 0.55 : 1.0), a * (mir > 0.5 ? 0.85 : 1.0));
  // the lantern's flame and its halo
  float fl = 0.92 + 0.08 * sin(uTime * 9.0) * sin(uTime * 5.3);
  float r2 = dot(ld, ld);
  col += (vec3(2.4, 1.3, 0.5) * exp(-r2 / 0.0018) + vec3(0.9, 0.42, 0.14) * exp(-sqrt(r2) * 5.0) * 0.5) * fl * (mir > 0.5 ? 0.6 : 1.0);
  return col;
}
// the rings of a drop on the pool: slope (xy) and how bright the ring catches the light (z)
vec3 ripple(vec2 xz, vec2 c, float a, float amp) {
  vec2 dv = xz - c;
  float rho = length(dv), x = rho - a * 3.2;
  float env = amp * exp(-a * 3.0) * ss(0.0, 0.03, a);
  float g = exp(-x * x / 0.06) * ss(0.0, 0.1, rho);
  float dh = env * g * cos(x * 24.0) * 0.12;
  float lines = exp(-x * x / 0.0012) + 0.5 * exp(-pow(rho - a * 2.0, 2.0) / 0.0012);   // two crisp rings
  return vec3(dv / max(rho, 1e-4) * dh, env * lines * ss(0.0, 0.1, rho));
}
// a cluster of ice crystals on the shore of the pool, close to us in the corner: six-sided shards
// with a dark face, a front face and a face lit from the mouth, rainbow fringes on their edges
vec3 crystals(vec2 uv, vec3 col) {
  float sc = mix(0.85, 1.35, ss(0.6, 1.5, gAsp));
  vec2 o = vec2(-gAsp + 0.3 * sc, -1.02);
  vec2 lp = (uv - o) / sc;
  if (lp.x < -0.45 || lp.x > 0.55 || lp.y > 0.75) return col;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float a = (hash11(fi * 4.3 + 0.7) - 0.5) * 1.1 + (fi - 3.0) * 0.12;
    float h = 0.22 + 0.45 * hash11(fi * 2.9 + 1.3) * (1.0 - abs(fi - 3.0) * 0.14);
    float w = 0.035 + 0.035 * hash11(fi * 6.1 + 2.2);
    vec2 b = vec2((fi - 3.0) * 0.075 + (hash11(fi * 1.9) - 0.5) * 0.05, -0.05);
    vec2 p = rot(a) * (lp - b);
    float tipL = w * 2.2;
    float sd = max(max(abs(p.x) - w, p.y + abs(p.x) * tipL / w - h), -p.y);
    float px = gPx / sc;
    float cov = ss(px, -px, sd);
    if (cov <= 0.0) continue;
    float fx = p.x / w;
    float onTip = step(h - tipL * (1.0 - abs(fx)), p.y);
    float face = fx < -0.38 ? 0.0 : (fx < 0.38 ? 1.0 : 2.0);
    float lightF = face == 0.0 ? 0.25 : (face == 1.0 ? 0.55 : 0.95);
    lightF = mix(lightF, lightF * 1.25, onTip);
    vec3 c = col * vec3(0.3, 0.65, 0.85) + iceRamp(clamp(0.1 + lightF * 0.6 + 0.12 * gBass, 0.0, 1.0)) * 0.45;
    c += vec3(0.1, 0.35, 0.45) * ss(0.3, 0.0, abs(fx - 0.15)) * 0.3;                  // the light inside it
    float edge = min(abs(abs(fx) - 0.38), 1.0 - abs(fx)) * w / px;
    c += vec3(0.5, 0.95, 1.0) * exp(-edge * 0.7) * (0.12 + 0.25 * step(0.0, fx));
    // the rainbow: light split along the lit edge
    vec3 hue = 0.5 + 0.5 * cos(6.2832 * (p.y * 3.0 - fx * 0.4 + uTime * 0.05 + fi * 0.3 + vec3(0.0, 0.33, 0.67)));
    c += hue * exp(-(1.0 - fx) * w / px * 0.25) * (0.3 + 0.6 * gHigh) * ss(0.0, 0.3, p.y);
    col = mix(col, c, cov);
    // a glint at the tip, flashing with the highs
    vec2 tq = (p - vec2(0.0, h)) / px;
    float tw = pow(0.5 + 0.5 * sin(uTime * 1.3 + fi * 2.1), 6.0) * 0.6 + gHigh * pow(0.5 + 0.5 * sin(uCruise * 9.0 + fi * 2.7), 2.0) * 1.8;
    col += mix(vec3(1.0), hue, 0.5) * (exp(-dot(tq, tq) * 0.3) + 0.3 * exp(-abs(tq.x) * 0.6 - abs(tq.y) * 0.08) + 0.3 * exp(-abs(tq.y) * 0.6 - abs(tq.x) * 0.08)) * tw;
  }
  return col;
}
void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gVP = vec2(max(gAsp * 0.3 - 0.15, -0.05), -0.12);
  gCam = vec3(0.6, -0.9, 0.0);
  gLamp = vec3(bendX(15.0) - 0.75, FLOOR + 0.82, 15.0);
  vec3 d = normalize(vec3(uv - gVP, FL));

  // the beat: on some beats a drop falls from an icicle, on a few others a crack of light
  gDrop = vec4(0.0);
  gCrack = vec4(0.0);
  float beatTop = 0.0, dropFall = -1.0;
  vec3 dropRoot = vec3(0.0);
  float dropL = 0.0;
  if (uAudioActive > 0.5 && uBeatAge < 0.45) {
    float n = uBeatCount, hb = hash11(n * 7.7 + 0.3);
    if (hb < 0.42) {
      float W;
      icicleAt(17.0 + 2.0 * floor(hash11(n * 3.1) * 2.99), dropRoot, dropL, W);
      dropFall = uBeatAge;
      gDrop = vec4(dropRoot.x, dropRoot.z, uBeatAge - 0.12, uPunch * (0.7 + 0.3 * hash11(n * 1.9)));
    } else if (hb > 0.8) {
      float a = uBeatAge;
      gCrack = vec4((hash11(n * 2.3) - 0.5) * 3.0, 7.0 + hash11(n * 4.7) * 7.0, ss(0.0, 0.16, a), uPunch * ss(0.45, 0.2, a) * (1.0 + 0.6 * exp(-a * 12.0)));
    }
  }
  // a slow drip that keeps falling with or without the music
  float idleCyc = floor(uTime / 3.7), idleA = mod(uTime, 3.7);
  vec3 idleRoot;
  float idleL, idleW;
  icicleAt(9.0 + 2.0 * floor(hash11(idleCyc * 1.3) * 5.99), idleRoot, idleL, idleW);

  float kind;
  vec3 p;
  float t = caveTrace(gCam, d, kind, p);
  float tf = d.y < 0.0 ? (FLOOR - gCam.y) / d.y : 1e9;
  vec3 col;
  float depth;
  float onIce = 1.0;
  if (tf < t) {
    // the frozen pool: a mirror of the cave, with frost on it and rings where the drops land
    vec3 P = gCam + d * tf;
    depth = P.z;
    vec3 n = vec3(0.0, 1.0, 0.0);
    n.xz += (vec2(noise(P.xz * 3.0), noise(P.xz * 3.0 + 7.0)) - 0.5) * 0.025;
    float ringLight = 0.0;
    if (gDrop.w > 0.0 && gDrop.z > 0.0) {
      vec3 r = ripple(P.xz, gDrop.xy, gDrop.z, gDrop.w);
      n.xz -= r.xy; ringLight += r.z;
    }
    if (idleA > 0.25) {
      vec3 r = ripple(P.xz, idleRoot.xz, idleA - 0.25, 0.5);
      n.xz -= r.xy; ringLight += r.z;
    }
    n = normalize(n);
    vec3 rd = reflect(d, n);
    float k2;
    vec3 p2;
    float t2 = caveTrace(P, rd, k2, p2);
    vec3 refl = k2 > 0.5 ? outside(rd) * 0.85 : iceWall(p2, t2 + tf);
    refl = icicles(uv + n.xz * 0.06, refl, p2.z, 1.0);
    refl = figure(uv + n.xz * 0.06, refl, 1.0);
    float fres = 0.12 + 0.88 * pow(1.0 - max(-d.y, 0.0), 5.0);
    float frost = ss(0.5, 0.72, fbm(P.xz * vec2(0.45, 0.7) + 2.0)) * ss(ZM, ZM - 6.0, P.z);
    frost *= 0.75 + 0.25 * noise(P.xz * 9.0);
    vec3 body = vec3(0.004, 0.03, 0.06) + vec3(0.03, 0.12, 0.16) * ss(ZM - 10.0, ZM, P.z);
    vec3 frostCol = mix(vec3(0.04, 0.17, 0.32), vec3(0.2, 0.5, 0.62), ss(ZM - 12.0, ZM, P.z));
    // cracks in the ice and the frost shelf where the pool meets the walls
    float hy = FLOOR / (CB * wallMul(sign(P.x - bendX(P.z)) * 2.4, P.z));
    float edgeX = CA * wallMul(sign(P.x - bendX(P.z)) * 2.4, P.z) * sqrt(max(1.0 - hy * hy, 0.0));
    float shelf = ss(1.2, 0.0, edgeX - abs(P.x - bendX(P.z)) + (fbm(P.xz * 1.5) - 0.5) * 1.2);
    col = mix(body, refl, mix(0.9, 0.3, frost) * fres);
    col = mix(col, frostCol, frost * 0.45);
    col = mix(col, mix(vec3(0.02, 0.1, 0.24), vec3(0.3, 0.62, 0.72), ss(ZM - 12.0, ZM, P.z)) * (0.7 + 0.5 * shelf), shelf * shelf * 0.75);
    // the lantern's warm pool of light on the ice
    vec2 lw = P.xz - gLamp.xz;
    col += vec3(0.6, 0.27, 0.08) * exp(-dot(lw, lw) / 2.0) * 0.3;
    // and the lantern's reflection drawn out into a streak by the ice
    {
      float k;
      vec2 ls = project(vec3(gLamp.x, 2.0 * FLOOR - gLamp.y, gLamp.z), k);
      vec2 dl = (uv - ls) / k;
      col += vec3(1.0, 0.48, 0.15) * exp(-dl.x * dl.x / 0.012) * exp(-abs(dl.y + 0.3) * 1.6) * 0.35 * (1.0 - frost * 0.7);
    }
    col += vec3(0.5, 0.95, 1.0) * ringLight * 1.4;
  } else {
    depth = p.z;
    onIce = 1.6;
    if (kind > 0.5) { col = outside(d); onIce = 0.0; }
    else col = iceWall(p, t);
  }
  // a low mist lying on the pool, glowing where the mouth's light reaches it
  if (d.y < 0.0) {
    float tHit = min(t, tf), t1 = (FLOOR + 0.7 - gCam.y) / d.y;
    float len = max(tHit - t1, 0.0);
    if (len > 0.0) {
      vec3 mid = gCam + d * (t1 + len * 0.5);
      float dens = 0.5 + 0.8 * noise(mid.xz * vec2(0.35, 0.25) + vec2(uTime * 0.04, -uTime * 0.02));
      float mist = 1.0 - exp(-len * 0.12 * dens);
      vec3 mc = mix(vec3(0.03, 0.12, 0.22), vec3(0.42, 0.78, 0.82), ss(6.0, ZM, mid.z));
      col = mix(col, mc, mist * 0.75);
    }
  }
  col = icicles(uv, col, depth, 0.0);
  col = figure(uv, col, 0.0);

  // the beat's drop, falling from the icicle's tip, then the splash where it lands
  if (dropFall >= 0.0) {
    float k, k2;
    vec3 tip = dropRoot - vec3(0.0, dropL + 0.03, 0.0);
    float fall = clamp(dropFall / 0.12, 0.0, 1.0);
    vec3 a3 = vec3(tip.x, mix(tip.y, FLOOR, fall * fall), tip.z);
    vec3 b3 = vec3(tip.x, mix(tip.y, FLOOR, max(fall * fall - 0.12, 0.0)), tip.z);
    vec2 sa = project(a3, k), sb = project(b3, k2);
    float dl = seg(uv, sa, sb) / gPx;
    col += vec3(0.8, 1.15, 1.2) * (exp(-dl * dl * 0.25) * 1.4 + exp(-dl * 0.5) * 0.25) * (1.0 - step(1.0, fall)) * gDrop.w;
    vec2 si = project(vec3(tip.x, FLOOR, tip.z), k);
    vec2 sp = (uv - si) / gPx;
    float splash = exp(-dropFall * 14.0 + 1.6) * step(0.12, dropFall);
    col += vec3(0.8, 1.15, 1.2) * exp(-dot(sp * vec2(1.0, 2.0), sp * vec2(1.0, 2.0)) * 0.05) * splash * gDrop.w * 0.8;
  }
  // the slow drip
  if (idleA < 0.25) {
    float k;
    vec3 tip = idleRoot - vec3(0.0, idleL + 0.03, 0.0);
    float fall = idleA / 0.25;
    vec2 sa = project(vec3(tip.x, mix(tip.y, FLOOR, fall * fall), tip.z), k);
    float dl = length(uv - sa) / gPx;
    col += vec3(0.7, 1.0, 1.1) * exp(-dl * dl * 0.3) * 0.7;
  }

  // the crystals in the ice, throwing tiny rainbow glints
  if (onIce > 0.5) {
    float gs = 0.05;
    vec2 g = uv / gs, cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + 13.1);
    if (h < 0.16 * (onIce - 0.6)) {
      vec2 off = (vec2(hash21(cell + 5.3), hash21(cell + 9.1)) - 0.5) * 0.6;
      vec2 r = (f - off) * gs / gPx;
      float ph = hash21(cell + 2.2);
      float tw = pow(0.5 + 0.5 * sin(uTime * (0.6 + ph * 1.5) + ph * 40.0), 14.0);
      tw += gHigh * pow(0.5 + 0.5 * sin(uCruise * (7.0 + ph * 6.0) + ph * 60.0), 3.0) * 1.6;
      vec3 hue = 0.55 + 0.45 * cos(6.2832 * (ph * 3.0 + uTime * 0.04 + vec3(0.0, 0.33, 0.67)));
      float core = exp(-dot(r, r) * 0.6);
      float rays = exp(-abs(r.x) * 0.8 - abs(r.y) * 0.16) + exp(-abs(r.y) * 0.8 - abs(r.x) * 0.16);
      float lum = dot(col, vec3(0.2, 0.5, 0.3));
      col += hue * (core * 1.1 + rays * 0.3) * tw * (0.5 + 0.5 * hash21(cell + 4.4)) * ss(0.06, 0.35, lum);
    }
  }
  col = crystals(uv, col);
  // the light of the mouth spilling into the cave
  {
    float k;
    vec2 ms = project(vec3(bendX(ZM), 0.5, ZM), k);
    vec2 md = (uv - ms) * vec2(0.8, 1.0);
    col += vec3(0.25, 0.55, 0.6) * exp(-length(md) * 3.2) * 0.25;
  }
  col *= 1.0 - 0.35 * ss(0.7, 1.6, length(uv * vec2(0.7, 1.0)));
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'buzmagara', name: 'Buz Mağarası', group: 'Vibe',
  blurb: 'Inside a glacier ice cave: scalloped blue walls lit from within, a bright snowy mouth, a lantern on the frozen pool, and drops ringing the ice on the beat',
  tags: ['ice', 'cave', 'winter', 'blue', 'dreamy', 'calm', 'cinematic'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
