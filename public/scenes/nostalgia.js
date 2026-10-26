import { SCULPT } from '../js/gfx/scene-kit.js';

// NOSTALGIA DRIVE — a night drive on a desert highway, seen out of the passenger window: a deep
// blue sky full of stars, a crescent moon and the blue flower shapes of Bikini Bottom's sky, and a
// lobster-trap diner with warm windows going by at the roadside. The side mirror and the top of the
// door frame the view.
//
// Everything outside is placed in real 3-D, and the world repeats every PERIOD metres, textures
// included, so the drive never jumps. The camera travels along x and each thing crosses the window
// at the speed its distance gives it: the street lamps sweep past in a second or two, the shrubs by
// the road blur, the diner seventy-five metres out takes a quarter of a minute, and the sky stays.
//
// Music: the bass swells the lamps, the sign and a slight bounce of the car; the mids light the
// diner's windows and the sky flowers, each flower listening to its own part of the mid range; the
// highs make single stars glint. With nothing playing the drive goes on, calm, and nothing pulses.

// Stroke letters for the sign, in a 1 × 1.4 box: each letter is a few line segments.
const GLYPHS = {
  T: [[0, 1.4, 1, 1.4], [0.5, 1.4, 0.5, 0]],
  H: [[0, 0, 0, 1.4], [1, 0, 1, 1.4], [0, 0.72, 1, 0.72]],
  E: [[0, 0, 0, 1.4], [0, 1.4, 0.92, 1.4], [0, 0.72, 0.76, 0.72], [0, 0, 0.92, 0]],
  K: [[0, 0, 0, 1.4], [0.06, 0.6, 0.95, 1.4], [0.34, 0.85, 1, 0]],
  R: [[0, 0, 0, 1.4], [0, 1.4, 0.6, 1.4], [0.6, 1.4, 0.9, 1.2], [0.9, 1.2, 0.9, 0.92], [0.9, 0.92, 0.6, 0.72], [0.6, 0.72, 0, 0.72], [0.48, 0.72, 1, 0]],
  U: [[0, 1.4, 0, 0.42], [0, 0.42, 0.18, 0.08], [0.18, 0.08, 0.5, 0], [0.5, 0, 0.82, 0.08], [0.82, 0.08, 1, 0.42], [1, 0.42, 1, 1.4]],
  S: [[0.96, 1.18, 0.74, 1.38], [0.74, 1.38, 0.26, 1.38], [0.26, 1.38, 0.03, 1.14], [0.03, 1.14, 0.12, 0.84], [0.12, 0.84, 0.88, 0.56], [0.88, 0.56, 0.97, 0.26], [0.97, 0.26, 0.74, 0.02], [0.74, 0.02, 0.26, 0.02], [0.26, 0.02, 0.03, 0.22]],
  Y: [[0, 1.4, 0.5, 0.72], [1, 1.4, 0.5, 0.72], [0.5, 0.72, 0.5, 0]],
  A: [[0, 0, 0.5, 1.4], [1, 0, 0.5, 1.4], [0.2, 0.5, 0.8, 0.5]],
  B: [[0, 0, 0, 1.4], [0, 1.4, 0.6, 1.4], [0.6, 1.4, 0.86, 1.22], [0.86, 1.22, 0.86, 0.9], [0.86, 0.9, 0.6, 0.72], [0, 0.72, 0.66, 0.72], [0.66, 0.72, 0.96, 0.52], [0.96, 0.52, 0.96, 0.2], [0.96, 0.2, 0.66, 0], [0.66, 0, 0, 0]],
};
const ORDER = Object.keys(GLYPHS);
const segs = [], ranges = [];
for (const k of ORDER) { ranges.push([segs.length, GLYPHS[k].length]); segs.push(...GLYPHS[k]); }
const f = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);
const SEG = segs.map((s) => `vec4(${s.map(f).join(', ')})`).join(', ');
const RANGE = ranges.map(([a, n]) => `ivec2(${a}, ${n})`).join(', ');
const TEXT = ['THE', 'KRUSTY', 'KRAB'].join('').split('').map((c) => ORDER.indexOf(c)).join(', ');

const frag = `${SCULPT}
const float PERIOD = 220.0;          // the world repeats every 220 m: one diner, four lamps
const float SPEED = 5.0;             // metres per unit of uCruise
const float EYE = 1.22;              // eye height in the car
const float YAW = 0.25;              // the view turns a little toward the front of the car
const vec3 SODIUM = vec3(1.0, 0.47, 0.15);
const vec3 WARM = vec3(1.0, 0.60, 0.28);
const vec3 MOON_LIGHT = vec3(0.30, 0.40, 0.62);
const vec3 SKY_LIGHT = vec3(0.075, 0.100, 0.190);
const float KK_X = -18.0, KK_Z = -75.0, KK_TURN = 0.42;   // the diner: world x, distance out, turn
const float DX = 6.9, DZ = 2.8, DECK = 0.45, SPRING = 4.1, VAULT = 2.98;
const float LINE_Z = -6.6, ROAD_Z = -7.25, LAMP_Z = -14.0, HEAD_Z = -12.4;   // edge line, road edge, lamp poles and heads
const vec4 SEG[${segs.length}] = vec4[${segs.length}](${SEG});
const ivec2 GLYPH[${ranges.length}] = ivec2[${ranges.length}](${RANGE});
const int TEXT[13] = int[13](${TEXT});

float gTravel, gPix, gBlur, gCalm, gLamp, gWin, gSign;
vec3 gMoon, gKK, gSignPos;
mat2 gTurn;
vec3 gRo, gFwd, gRight, gUp;
float gLens;

// ── small tools ────────────────────────────────────────────────────────────────────────────────
float hashP(vec2 c, float period) { return hash21(vec2(mod(c.x, period), c.y)); }
// value noise that repeats every period cells along x, so the road wraps without a seam
float noiseP(vec2 p, float period) {
  vec2 i = floor(p), u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  return mix(mix(hashP(i, period), hashP(i + vec2(1.0, 0.0), period), u.x),
             mix(hashP(i + vec2(0.0, 1.0), period), hashP(i + vec2(1.0, 1.0), period), u.x), u.y);
}
// a texture along the road at fx cycles per metre (fx * PERIOD must be whole)
float roadNoise(float X, float z, float fx, float fz) { return noiseP(vec2(X * fx, z * fz), PERIOD * fx); }
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float seg2(vec2 p, vec2 a, vec2 b) {
  vec2 v = p - a, w = b - a;
  return length(v - w * clamp(dot(v, w) / dot(w, w), 0.0, 1.0));
}
// where something at world x, repeating every period metres, is now (relative to the camera)
float aroundX(float worldX, float period) { return mod(worldX + gTravel + period * 0.5, period) - period * 0.5; }
vec2 toScreen(vec3 p) {
  vec3 r = p - gRo;
  float z = max(dot(r, gFwd), 0.001);
  return vec2(dot(r, gRight), dot(r, gUp)) * gLens / z;
}
vec3 toDiner(vec3 p) { vec3 q = p - gKK; q.xz = gTurn * q.xz; return q; }
vec3 dinerDir(vec3 d) { d.xz = gTurn * d.xz; return d; }
vec3 fromDinerDir(vec3 d) { d.xz = d.xz * gTurn; return d; }

// ── sky ────────────────────────────────────────────────────────────────────────────────────────
vec3 skyBase(float el) {
  float h = max(el, 0.0);
  vec3 c = mix(vec3(0.030, 0.088, 0.24), vec3(0.010, 0.032, 0.118), ss(0.0, 0.24, h));
  c = mix(c, vec3(0.004, 0.009, 0.034), ss(0.2, 0.95, h));
  return c + vec3(0.014, 0.040, 0.080) * exp(-h * 24.0);
}
vec3 fogColor() { return vec3(0.018, 0.048, 0.125); }

// Three layers of stars: many faint ones, fewer medium, a few bright. Each is drawn as a point of
// a fixed size in pixels, so it stays a point at any resolution instead of turning into noise.
vec3 starField(vec2 s) {
  vec3 col = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float cell = layer == 0 ? 0.0064 : (layer == 1 ? 0.013 : 0.032);
    vec2 g = s / cell + vec2(fl * 37.1, fl * 11.7);
    vec2 id = floor(g);
    float h = hash21(id * 1.31 + fl * 17.0);
    float keep = layer == 0 ? 0.5 : (layer == 1 ? 0.66 : 0.8);
    if (h < keep) continue;
    float m = (h - keep) / (1.0 - keep);
    vec2 jitter = vec2(hash21(id + 5.3), hash21(id + 9.1)) * 0.56 - 0.28;
    vec2 d = (fract(g) - 0.5 - jitter) * cell / gPix;          // pixels from the star
    float mag = layer == 0 ? 0.09 + 0.18 * m * m : (layer == 1 ? 0.2 + 0.42 * m * m * m : 0.42 + 1.4 * pow(m, 4.0));
    if (layer == 0) mag *= ss(2.5, 6.0, cell / gPix);              // too dense for this resolution: fade
    if (layer == 1) mag *= ss(3.0, 8.0, cell / gPix);              // (only tiny pictures, like the market card)
    float sigma = 0.62 + (layer == 2 ? 0.6 : 0.2) * m;
    float shape = exp(-dot(d, d) / (2.0 * sigma * sigma));
    float twinkle = layer == 0 ? 1.0 : 0.84 + 0.16 * sin(uTime * (0.5 + 1.9 * hash21(id + 2.0)) + h * 60.0);
    float glint = 0.0;
    if (layer > 0 && hash21(id + 13.0) > 0.5) {
      // the highs: this star listens to its own slice of the top of the spectrum
      glint = uAudioActive * pow(clamp(spec(0.70 + 0.27 * hash21(id + 21.0)) * 1.7, 0.0, 1.0), 2.0) * gCalm;
    }
    vec3 tint = mix(vec3(0.62, 0.75, 1.0), vec3(1.0, 0.9, 0.78), hash21(id + 4.0));
    col += tint * shape * mag * twinkle * (1.0 + 2.4 * glint);
    if (layer > 0 && m > 0.55) {
      float spike = exp(-abs(d.x) * 0.8 - d.y * d.y * 1.5) + exp(-abs(d.y) * 0.8 - d.x * d.x * 1.5);
      col += tint * spike * mag * (0.03 + 0.16 * glint);
    }
  }
  return col * ss(0.0, 0.16, s.y);
}

vec3 moonDisc(vec2 s) {
  vec2 d = s - vec2(-0.16, 0.29);
  d.x *= 0.96;
  float r = length(d), R = 0.0118;
  float disc = ss(R + gPix, R - gPix, r);
  float shadow = ss(R + gPix * 1.5, R - gPix * 1.5, length(d - vec2(-0.0063, 0.0051)));
  vec3 col = vec3(1.0, 0.93, 0.76) * disc * (1.0 - shadow) * 1.45;
  col += vec3(0.03, 0.045, 0.07) * disc * shadow;
  return col + vec3(0.32, 0.40, 0.48) * exp(-r / 0.011) * 0.10 + vec3(0.10, 0.16, 0.30) * exp(-r / 0.06) * 0.05;
}

// A Bikini Bottom sky flower: five teardrop petals joined into one outline, and a ring in the middle.
float unevenCapsule(vec2 p, float r1, float r2, float h) {
  p.x = abs(p.x);
  float b = (r1 - r2) / h, a = sqrt(1.0 - b * b), k = dot(p, vec2(-b, a));
  if (k < 0.0) return length(p) - r1;
  if (k > a * h) return length(p - vec2(0.0, h)) - r2;
  return dot(p, vec2(a, b)) - r1;
}
float flowerShape(vec2 p) {
  float sector = TAU / 5.0;
  float k = floor(atan(p.y, p.x) / sector + 0.5);
  float d = 1e5;
  for (int i = -1; i <= 1; i++) {
    float ang = (k + float(i)) * sector;
    d = smin(d, unevenCapsule(rot(ang - PI * 0.5) * p, 0.13, 0.27, 0.6), 0.07);
  }
  return d;
}
vec3 skyFlower(vec2 s, vec4 F, vec2 G) {   // F: azimuth, elevation, radius, turn · G: strength, slice of the mids
  vec2 d = s - F.xy;
  d.x *= cos(F.y);
  float music = uAudioActive * clamp(spec(G.y) * 1.5, 0.0, 1.0) * gCalm;
  float R = F.z * (1.0 + 0.02 * music + 0.006 * sin(uTime * 0.07 + G.y * 40.0));
  if (dot(d, d) > R * R * 3.2) return vec3(0.0);
  vec2 p = rot(F.w + 0.015 * sin(uTime * 0.031 + G.y * 9.0)) * d / R;
  float shape = flowerShape(p);
  float line = min(abs(shape), abs(length(p) - 0.115) + 0.006);
  float px = gPix / R;
  // A glowing tube seen through the air: a pale core, a saturated body, a wide glow that sinks
  // into the sky, and here and there a stretch that fades as if a thin haze passed in front.
  float along = atan(p.y, p.x);
  // not a smooth neon tube: a string of soft beads of light, with a few brighter grains
  float beads = noise(vec2(along * 17.0 + G.y * 13.0, length(p) * 8.0));
  float core = exp(-pow(line / max(0.012, px * 0.75), 2.0)) * (0.55 + 0.75 * beads);
  float tube = exp(-pow(line / max(0.044, px * 1.4), 2.0)) * (0.8 + 0.35 * beads);
  float glow = exp(-line / 0.1) * 0.55 + exp(-line / 0.34) * 0.45;
  float vary = 0.62 + 0.5 * noise(vec2(along * 2.2 + G.y * 31.0, length(p) * 2.5));
  vary *= 0.4 + 0.6 * ss(-0.7, 0.6, sin(along * 1.0 + G.y * 50.0 + uTime * 0.02));
  float sparkle = pow(noise(vec2(along * 30.0, G.y * 7.0 + length(p) * 4.0)), 12.0) * core * 2.2;
  vec3 body = mix(vec3(0.05, 0.27, 0.95), vec3(0.12, 0.22, 0.98), fract(G.y * 7.3));
  vec3 col = vec3(0.56, 0.82, 1.0) * core * 0.36 + body * tube * 0.55
           + vec3(0.02, 0.10, 0.42) * glow * 0.3 + vec3(0.65, 0.88, 1.0) * sparkle;
  col += vec3(0.008, 0.03, 0.09) * ss(0.03, -0.14, shape) * 0.7;                 // a faint veil inside
  return col * vary * G.x * (0.74 + 0.66 * music) * ss(0.02, 0.2, s.y);
}
vec3 flowers(vec2 s) {
  vec3 c = vec3(0.0);
  c += skyFlower(s, vec4(-0.53, 0.300, 0.068, 0.30), vec2(1.00, 0.34));
  c += skyFlower(s, vec4(-0.03, 0.265, 0.062, 1.15), vec2(1.00, 0.52));
  c += skyFlower(s, vec4(-0.30, 0.445, 0.040, 2.00), vec2(0.90, 0.44));
  c += skyFlower(s, vec4(-0.29, 0.200, 0.026, 0.70), vec2(0.78, 0.60));
  c += skyFlower(s, vec4(-0.43, 0.150, 0.030, 2.60), vec2(0.80, 0.30));
  c += skyFlower(s, vec4(0.045, 0.480, 0.036, 1.70), vec2(0.75, 0.48));
  c += skyFlower(s, vec4(-0.135, 0.540, 0.022, 0.40), vec2(0.60, 0.38));
  c += skyFlower(s, vec4(-0.78, 0.235, 0.054, 1.30), vec2(0.88, 0.40));
  c += skyFlower(s, vec4(0.235, 0.205, 0.058, 2.20), vec2(0.92, 0.56));
  c += skyFlower(s, vec4(0.32, 0.095, 0.028, 0.90), vec2(0.66, 0.62));
  c += skyFlower(s, vec4(-0.66, 0.090, 0.030, 2.90), vec2(0.64, 0.28));
  c += skyFlower(s, vec4(-0.075, 0.120, 0.024, 1.90), vec2(0.58, 0.50));
  c += skyFlower(s, vec4(0.125, 0.345, 0.030, 0.20), vec2(0.70, 0.46));
  return c;
}
// low desert ranges far away, a little darker than the haze in front of them
float ridge(float az) {
  return 0.0035 + 0.0085 * noise(vec2(az * 4.0, 2.0)) + 0.004 * noise(vec2(az * 13.0, 5.0)) - 0.003 * ss(-0.4, 0.2, az) * ss(0.9, 0.4, az);
}
// an occasional shooting star, only on a beat and only when music is really playing
vec3 meteor(vec2 s) {
  float n = floor(uBeatCount / 4.0);
  if (uAudioActive < 0.5 || hash11(n * 3.7) < 0.72) return vec3(0.0);
  float age = uBeatAge + mod(uBeatCount, 4.0) * 0.5;
  if (age > 1.2) return vec3(0.0);
  vec2 a = vec2(-0.6 + 0.7 * hash11(n), 0.25 + 0.15 * hash11(n + 1.0));
  vec2 head = a + vec2(0.16, -0.07) * age;
  float tr = seg2(s, head, head - vec2(0.05, -0.022));
  return vec3(0.55, 0.75, 1.0) * exp(-tr / max(gPix * 0.8, 0.0004)) * ss(1.2, 0.2, age) * ss(0.0, 0.1, age) * 0.5 * gCalm;
}
vec3 skyColor(vec3 rd) {
  vec2 s = vec2(atan(rd.x, -rd.z), asin(clamp(rd.y, -1.0, 1.0)));
  vec3 col = skyBase(s.y) + starField(s) + moonDisc(s) + flowers(s) + meteor(s);
  float rh = ridge(s.x);
  float hill = ss(rh + gPix, rh - gPix, s.y);
  return mix(col, fogColor() * 0.72 + vec3(0.0, 0.004, 0.012) * noise(vec2(s.x * 60.0, 1.0)), hill);
}

// ── light that falls on things outside ───────────────────────────────────────────────────────
vec3 lampsLight(vec3 p, vec3 n) {
  vec3 e = vec3(0.0);
  float base = 30.0 + 55.0 * floor((p.x - gTravel - 30.0) / 55.0 + 0.5);
  for (int k = -1; k <= 1; k++) {
    vec3 head = vec3(base + 55.0 * float(k) + gTravel, 6.95, HEAD_Z);
    vec3 l = head - p;
    float d2 = dot(l, l);
    vec3 L = l * inversesqrt(d2);
    e += SODIUM * gLamp * 95.0 * max(dot(n, L), 0.0) * ss(0.05, 0.55, L.y) / (d2 + 2.0);
  }
  return e;
}
vec3 spill(vec3 q, vec3 n, vec3 c, vec3 facing, float strength) {
  vec3 l = c - q;
  float d2 = dot(l, l);
  vec3 L = l * inversesqrt(d2);
  return WARM * strength * max(dot(n, L), 0.0) * sqrt(max(dot(-L, facing), 0.0)) / (d2 + 0.8);
}
// the diner's windows pour light out of the front and the ends
vec3 dinerLight(vec3 p, vec3 n) {
  vec3 q = toDiner(p);
  if (dot(q, q) > 1100.0) return vec3(0.0);
  vec3 nq = dinerDir(n);
  float w = 11.0 * gWin;
  vec3 e = spill(q, nq, vec3(-3.55, 2.25, DZ), vec3(0, 0, 1), w) + spill(q, nq, vec3(3.55, 2.25, DZ), vec3(0, 0, 1), w);
  e += spill(q, nq, vec3(0.0, 1.9, DZ), vec3(0, 0, 1), w * 0.85);
  e += spill(q, nq, vec3(DX, 3.0, 0.0), vec3(1, 0, 0), w) + spill(q, nq, vec3(-DX, 3.0, 0.0), vec3(-1, 0, 0), w);
  // two lanterns by the door and a lamp over it, for the porch, the doors and the beam
  vec3 lq = vec3(abs(q.x) - 1.12, q.y - 2.95, q.z - DZ - 0.42);
  e += WARM * gWin * 2.2 * max(dot(nq, normalize(-lq * vec3(sign(q.x), 1.0, 1.0))), 0.0) / (dot(lq, lq) + 0.3);
  vec3 pl = vec3(0.0, 3.32, DZ + 0.6) - q;
  e += WARM * gWin * 3.4 * max(dot(nq, normalize(pl)), 0.0) / (dot(pl, pl) + 0.6);
  return e;
}
vec3 signLight(vec3 p, vec3 n) {
  vec3 l = gSignPos + vec3(0.0, 13.4, 0.6) - p;
  float d2 = dot(l, l);
  if (d2 > 700.0) return vec3(0.0);
  return vec3(1.0, 0.7, 0.4) * gSign * 11.0 * max(dot(n, l * inversesqrt(d2)), 0.0) / (d2 + 6.0);
}
vec3 outsideLight(vec3 p, vec3 n) {
  return SKY_LIGHT * (0.55 + 0.45 * n.y) + MOON_LIGHT * 0.55 * max(dot(n, gMoon), 0.0) + lampsLight(p, n) + dinerLight(p, n) + signLight(p, n);
}
float fogAmount(float t) { return 1.0 - exp(-t * 0.0032); }
vec3 fogged(vec3 col, float t) { return mix(col, fogColor(), fogAmount(t)); }
// a premultiplied layer over what is behind it, the layer fogged at its own distance
vec3 over(vec3 col, vec4 layer, float t) {
  float f = fogAmount(t);
  return col * (1.0 - layer.a) + layer.rgb * (1.0 - f) + fogColor() * f * layer.a;
}

// ── the ground: the road with its edge line, the gravel shoulder, the desert ──────────────────
vec3 groundColor(vec3 p, vec3 rd, float t) {
  float X = p.x - gTravel, z = p.z;
  float fp = gPix * t / max(-rd.y, 0.02);                    // a pixel's footprint along the ground
  float lodFine = ss(0.35, 0.05, fp), lodMid = ss(1.6, 0.2, fp);
  float road = ss(ROAD_Z - 0.07, ROAD_Z + 0.07, z);
  float shoulder = ss(-9.0, -8.4, z) * (1.0 - road);
  // the drive up to the diner, and the packed dirt in front of it
  float dx = aroundX(KK_X + 7.0 + (z + 8.0) * 0.1, PERIOD) - p.x;
  float drive = ss(3.0, 2.2, abs(dx)) * ss(-8.0, -9.4, z) * ss(-76.0, -70.0, z);
  vec2 front = (toDiner(p).xz - vec2(0.0, DZ + 5.0)) / vec2(11.0, 5.5);
  drive = max(drive, ss(1.0, 0.55, length(front)));
  float coarse = roadNoise(X, z, 0.25, 0.6);
  float fine = mix(0.5, roadNoise(X, z, 2.0, 11.0), lodFine);        // streaks along the road
  float grit = mix(0.5, roadNoise(X, z, 4.0, 22.0), lodFine * ss(0.12, 0.03, fp));
  vec3 asphalt = vec3(0.058, 0.060, 0.068) * (0.72 + 0.32 * fine + 0.18 * grit) * (0.9 + 0.2 * coarse);
  for (int k = 0; k < 2; k++) {                                       // darker where the tyres run
    float c = k == 0 ? -1.9 : -5.0;
    asphalt *= 1.0 - 0.16 * ss(0.55, 0.15, abs(z - c));
  }
  vec3 gravel = vec3(0.098, 0.093, 0.088) * (0.6 + 0.45 * fine + 0.35 * grit);
  float patches = roadNoise(X, z, 0.1, 0.12) * 0.6 + roadNoise(X, z, 0.5, 0.9) * 0.4;
  vec3 sand = mix(vec3(0.080, 0.074, 0.068), vec3(0.128, 0.112, 0.096), patches) * (0.8 + 0.3 * mix(0.5, fine, lodMid));
  float stones = ss(0.8, 0.95, roadNoise(X, z, 1.0, 1.6) * mix(0.5, grit, lodMid) * 2.0) * lodMid;
  sand *= 1.0 - 0.45 * stones;
  vec3 dirt = vec3(0.15, 0.128, 0.105) * (0.85 + 0.25 * fine);
  dirt *= 1.0 - 0.22 * ss(0.32, 0.12, abs(abs(dx) - 0.85)) * ss(-70.0, -66.0, z);
  vec3 alb = mix(mix(sand, dirt, drive), gravel, shoulder);
  alb = mix(alb, asphalt, road);
  // the painted edge line, a little worn
  float aa = max(fp * 0.6, 0.004);
  float paint = ss(0.075 + aa, 0.075 - aa, abs(z - LINE_Z)) * (0.75 + 0.25 * ss(0.25, 0.6, roadNoise(X, z, 1.0, 3.0)));
  alb = mix(alb, vec3(0.62, 0.45, 0.13), paint);
  vec3 col = alb * outsideLight(p, vec3(0.0, 1.0, 0.0));
  // the asphalt is slightly glossy: the lamps shine on it, the painted line most
  float base = 30.0 + 55.0 * floor((X - 30.0) / 55.0 + 0.5);
  for (int k = -1; k <= 1; k++) {
    vec3 head = vec3(base + 55.0 * float(k) + gTravel, 6.95, HEAD_Z);
    vec3 L = normalize(head - p), H = normalize(L - rd);
    float sp = pow(max(H.y, 0.0), 60.0) * (0.7 + 1.2 * paint) * road;
    col += SODIUM * gLamp * sp * 3.5 / (1.0 + dot(head - p, head - p) * 0.01);
  }
  return fogged(col, t);
}

// ── shrubs, on rows parallel to the road; a ray crosses each row once ─────────────────────────
vec4 shrubs(vec3 ro, vec3 rd, float tMax) {
  vec4 acc = vec4(0.0);
  for (int k = 0; k < 22; k++) {
    float fk = float(k);
    float zr = -9.3 - fk * 2.1 - fk * fk * 0.05;
    float t = (zr - ro.z) / rd.z;
    if (t > tMax) break;
    if (t < 0.0) continue;
    vec3 p = ro + rd * t;
    if (p.y > 0.9 || p.y < -0.05) continue;
    float w = 2.75;                                           // 80 cells round the world
    float X = p.x - gTravel + fk * 7.3;
    float c = floor(X / w);
    float h0 = hashP(vec2(c, fk), 80.0);
    if (h0 < mix(0.62, 0.42, ss(0.0, 12.0, fk))) continue;
    float h1 = hashP(vec2(c, fk + 31.0), 80.0), h2 = hashP(vec2(c, fk + 57.0), 80.0);
    float r = 0.2 + 0.42 * h1, hh = r * (0.5 + 0.5 * h2);
    float u = X - (c + 0.5) * w - (h2 - 0.5) * (w - 2.0 * r - 0.3);
    float fp = gPix * t;
    float soft = fp + gBlur;
    float uu = u / r;
    // a creosote bush: a few overlapping lobes rather than one dome, broken up by twigs, and
    // see-through toward the top where the branches thin out
    float top = 0.0;
    for (int j = 0; j < 3; j++) {
      float fj = float(j);
      float o = (hashP(vec2(c, fk + 71.0 + fj), 80.0) - 0.5) * r * 1.1;
      float rl = r * (0.42 + 0.36 * hashP(vec2(c, fk + 91.0 + fj), 80.0));
      float x = (u - o) / rl;
      top = max(top, hh * (0.55 + 0.45 * hashP(vec2(c, fk + 51.0 + fj), 80.0)) * sqrt(max(0.0, 1.0 - x * x)));
    }
    float twigs = noise(vec2(u * 14.0, fk * 3.1 + c * 1.7)) - 0.5 + 0.6 * (noise(vec2(u * 33.0, c + fk)) - 0.5);
    top += hh * 0.45 * twigs * ss(0.1, 0.02, soft);
    float a = ss(-soft, soft, top - p.y) * ss(r * 1.15 + soft, r * 0.85, abs(u));
    float lace = noise(vec2(u * 26.0, p.y * 30.0 + fk));
    a *= 1.0 - 0.6 * ss(0.35, 0.85, p.y / max(top, 0.01)) * ss(0.4, 0.75, lace) * ss(0.06, 0.02, soft);
    if (a < 0.004) continue;
    vec3 n = normalize(vec3(uu * 0.65, 0.5 + 0.5 * ss(0.0, hh, p.y), 0.65));
    vec3 alb = vec3(0.050, 0.054, 0.038) * (0.7 + 0.55 * h1);
    vec3 col = alb * outsideLight(p, n) * (0.5 + 0.5 * ss(0.0, max(hh, 0.01), p.y));
    col = fogged(col, t);
    acc.rgb += (1.0 - acc.a) * a * col;
    acc.a += (1.0 - acc.a) * a;
    if (acc.a > 0.985) break;
  }
  return acc;
}

// ── saguaros: flat silhouettes on a few rows, shaded as if round ─────────────────────────────
float saguaro(vec2 p, float H, float seed) {
  float r = 0.2 + 0.034 * H;
  float d = seg2(p, vec2(0.0, 0.0), vec2(0.0, H - r)) - r;
  float first = fract(seed * 7.0) > 0.5 ? 1.0 : -1.0;
  float arms = 1.0 + floor(fract(seed * 3.3) * 2.0);
  for (int i = 0; i < 2; i++) {
    if (float(i) >= arms) break;
    float side = i == 0 ? first : -first;
    float y0 = H * (0.36 + 0.2 * fract(seed * 13.0 + float(i) * 0.37));
    float reach = 0.55 + 0.35 * fract(seed * 5.0 + float(i) * 0.61);
    float up = H * (0.22 + 0.2 * fract(seed * 17.0 + float(i) * 0.53));
    float ra = r * 0.72;
    vec2 a0 = vec2(0.0, y0), a1 = vec2(side * reach, y0 + 0.12), a2 = vec2(side * reach, min(y0 + 0.12 + up, H * 0.92));
    d = smin(d, min(seg2(p, a0, a1), seg2(p, a1, a2)) - ra, 0.12);
  }
  return d;
}
vec4 cacti(vec3 ro, vec3 rd, float tMax, out float tHit) {
  tHit = 1e9;
  vec4 acc = vec4(0.0);
  for (int k = 0; k < 9; k++) {
    // rows of chance cacti, and two placed by the diner as in the picture it comes from
    float zr = k == 0 ? -17.0 : k == 1 ? -29.0 : k == 2 ? -44.0 : k == 3 ? -57.0 : k == 4 ? -66.0 : k == 5 ? -80.0 : k == 6 ? -105.0 : k == 7 ? -140.0 : -180.0;
    float t = (zr - ro.z) / rd.z;
    if (t > tMax) break;
    if (t < 0.0) continue;
    vec3 p = ro + rd * t;
    if (p.y > 7.5 || p.y < -0.1) continue;
    float placed = (k == 4 || k == 5) ? 1.0 : 0.0;
    float cells = k < 2 ? 8.0 : k < 4 ? 10.0 : k < 6 ? 1.0 : k < 8 ? 12.0 : 11.0;
    float w = PERIOD / cells;
    // (the nearer one stands right of the diner and the farther one left of it, so that with
    // parallax they drift away from it instead of crossing in front of its windows)
    float X = p.x - gTravel + (placed > 0.5 ? (k == 4 ? -KK_X - 13.0 : -KK_X + 16.0) + w * 0.5 : float(k) * 11.0);
    float c = floor(X / w);
    float seed = hashP(vec2(c, float(k) + 3.0), cells);
    float keep = k == 0 ? 0.82 : k == 1 ? 0.76 : k < 4 ? 0.62 : k < 6 ? -1.0 : k == 6 ? 0.45 : k == 7 ? 0.4 : 0.35;
    if (seed < keep) continue;
    // keep the chance cacti of the middle rows out of the stretch right in front of the diner
    if (placed < 0.5 && k > 0 && k < 4 && abs(mod((c + 0.5) * w - float(k) * 11.0 - KK_X + 110.0, PERIOD) - 110.0) < 20.0) continue;
    float H = placed > 0.5 ? (k == 4 ? 5.2 : 4.4) : 2.8 + 3.0 * hashP(vec2(c, float(k) + 9.0), cells);
    float u = X - (c + 0.5) * w - (placed > 0.5 ? 0.0 : (hashP(vec2(c, float(k) + 17.0), cells) - 0.5) * (w - 4.0));
    if (placed > 0.5) seed = k == 4 ? 0.71 : 0.23;
    float fp = gPix * t, soft = fp + gBlur;
    vec2 q = vec2(u, p.y);
    float d = saguaro(q, H, seed);
    float a = ss(soft, -soft, d);
    if (a < 0.004) continue;
    vec2 e = vec2(max(fp, 0.02), 0.0);
    vec2 g = vec2(saguaro(q + e.xy, H, seed) - d, saguaro(q + e.yx, H, seed) - d);
    float r = 0.2 + 0.034 * H;
    float across = clamp(1.0 + d / r, 0.0, 1.0) * sign(g.x);
    vec3 n = normalize(vec3(across, g.y / max(length(g), 1e-5) * 0.5, sqrt(max(0.0, 1.0 - across * across))));
    float ribs = 0.82 + 0.18 * sin(asin(clamp(across, -1.0, 1.0)) * 14.0) * ss(0.08, 0.02, fp);
    vec3 col = vec3(0.036, 0.052, 0.038) * ribs * outsideLight(p, n);
    col += MOON_LIGHT * 0.05 * pow(1.0 - n.z, 3.0);                          // a cool rim
    col = fogged(col, t);
    if (acc.a < 0.01) tHit = t;
    acc.rgb += (1.0 - acc.a) * a * col;
    acc.a += (1.0 - acc.a) * a;
    if (acc.a > 0.985) break;
  }
  return acc;
}

// ── street lamps: a pole, an arm over the road and a sodium head ──────────────────────────────
float rayLine(vec3 ro, vec3 rd, vec3 a, vec3 b, out float t) {
  // distance between the ray and a segment, and how far along the ray that is
  vec3 ba = b - a, oa = ro - a;
  float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa);
  float den = baba - bard * bard;
  float s = den > 1e-6 ? clamp((baba * -rdoa + bard * baoa) / den, 0.0, 1e4) : 0.0;
  float v = clamp((baoa + bard * s) / baba, 0.0, 1.0);
  t = s;
  return length(ro + rd * s - a - ba * v);
}
vec4 lamp(vec3 ro, vec3 rd, float tMax, out float tHit) {
  tHit = 1e9;
  float lx = aroundX(30.0, 55.0);
  float t1, t2, t3;
  float dPole = rayLine(ro, rd, vec3(lx, 0.0, LAMP_Z), vec3(lx, 7.0, LAMP_Z), t1);
  float dArm = rayLine(ro, rd, vec3(lx, 6.95, LAMP_Z), vec3(lx, 7.12, HEAD_Z - 0.2), t2);
  vec3 hc = vec3(lx, 7.04, HEAD_Z);
  float dHead = rayLine(ro, rd, hc - vec3(0.0, 0.0, 0.32), hc + vec3(0.0, 0.0, 0.32), t3);
  float soft1 = gPix * t1 + gBlur, soft2 = gPix * t2 + gBlur, soft3 = gPix * t3 + gBlur;
  float aPole = ss(0.11 + soft1, 0.11 - soft1, dPole) * step(t1, tMax);
  float aArm = ss(0.065 + soft2, 0.065 - soft2, dArm) * step(t2, tMax);
  float aHead = ss(0.17 + soft3, 0.17 - soft3, dHead) * step(t3, tMax);
  vec3 col = vec3(0.0);
  float a = 0.0;
  if (aPole > 0.0) {
    // dark galvanised steel: its own lamp shines away from it, so it only catches the sky, a little
    // glow near the head and a thin sheen down its round side
    vec3 p = ro + rd * t1;
    float side = clamp((dPole / 0.11) * sign(rd.x), -1.0, 1.0);
    col = vec3(0.05, 0.054, 0.06) * (SKY_LIGHT * 1.6 + SODIUM * gLamp * 0.5 * ss(4.5, 7.0, p.y) + dinerLight(p, vec3(0.0, 0.0, 1.0)));
    col += (SKY_LIGHT * 0.25 + SODIUM * gLamp * 0.05 * ss(2.0, 7.0, p.y)) * exp(-pow((side + 0.35) / 0.25, 2.0));
    a = aPole; tHit = t1;
  }
  if (aArm > 0.0) {
    col = mix(col, vec3(0.05) * (SKY_LIGHT + SODIUM * gLamp * 0.3), aArm);
    a = max(a, aArm); tHit = min(tHit, t2);
  }
  if (aHead > 0.0) {
    vec3 p = ro + rd * t3;
    float glass = ss(-0.02, -0.09, p.y - hc.y) * ss(0.36, 0.2, abs(p.z - hc.z));
    vec3 c = vec3(0.04, 0.042, 0.048) * (SKY_LIGHT * 3.0 + SODIUM * gLamp * 0.6) + SODIUM * gLamp * glass * 5.5;
    col = mix(col, c, aHead);
    a = max(a, aHead); tHit = min(tHit, t3);
  }
  return vec4(fogged(col, tHit), a);
}

// ── the diner ─────────────────────────────────────────────────────────────────────────────────
// In its own frame: x along the front, y up, z out of the front toward the road.
vec2 dinerMap(vec3 q) {
  float px = abs(q.x);
  float wallY = (DECK + SPRING) * 0.5, wallH = (SPRING - DECK) * 0.5;
  // deck: planks on a low frame, wider in front for the porch
  vec2 res = vec2(box3(q - vec3(0.0, DECK * 0.5, 0.6), vec3(7.5, DECK * 0.5, 3.8), 0.02), 9.0);
  // walls: a hollow box with the front cut for two windows and the doors
  float shell = max(box3(q - vec3(0.0, wallY, 0.0), vec3(DX, wallH, DZ), 0.0), -box3(q - vec3(0.0, wallY, 0.0), vec3(DX - 0.16, wallH + 0.2, DZ - 0.16), 0.0));
  float cut = min(box3(vec3(px - 3.55, q.y - 2.25, q.z - DZ), vec3(1.45, 0.92, 0.3), 0.0), box3(q - vec3(0.0, DECK + 1.38, DZ), vec3(0.95, 1.38, 0.3), 0.0));
  res = nearer(res, vec2(max(shell, -cut), 1.0));
  // end walls fill the barrel's profile; the arched lattice windows are cut out of them
  float rr = length(vec2(q.z, q.y - SPRING));
  float profile = q.y < SPRING ? max(abs(q.z) - DZ, DECK - q.y) : rr - (VAULT - 0.1);
  float arch = q.y < SPRING ? max(abs(q.z) - 1.75, 1.25 - q.y) : rr - 1.75;
  res = nearer(res, vec2(max(max(abs(px - (DX - 0.06)) - 0.07, profile), -arch), 1.0));
  // the barrel roof, its iron straps and the heavy timber rings at both ends
  res = nearer(res, vec2(max(abs(rr - VAULT) - 0.09, max(SPRING - 0.08 - q.y, px - 7.02)), 2.0));
  float sx = min(abs(px - 2.3), abs(px - 4.7));
  res = nearer(res, vec2(max(abs(rr - VAULT - 0.09) - 0.035, max(sx - 0.11, SPRING - 0.12 - q.y)), 3.0));
  float ringArc = q.y > SPRING ? abs(rr - 2.92) - 0.24 : abs(abs(q.z) - 2.92) - 0.22;
  res = nearer(res, vec2(max(abs(px - 7.08) - 0.17, max(ringArc, DECK - 0.05 - q.y)), 4.0));
  // front timbers: door and corner posts, the header beam, the window sills
  float posts = box3(vec3(min(abs(px - 1.12), abs(px - 5.25)), q.y - wallY, q.z - DZ - 0.04), vec3(0.14, wallH, 0.1), 0.01);
  float header = box3(q - vec3(0.0, 3.5, DZ + 0.06), vec3(DX + 0.05, 0.15, 0.12), 0.01);
  float sill = box3(vec3(px - 3.55, q.y - 1.28, q.z - DZ - 0.05), vec3(1.6, 0.05, 0.12), 0.005);
  res = nearer(res, vec2(min(posts, min(header, sill)), 4.0));
  // window and door frames, set into the openings; the two door leaves meet in the middle
  vec3 wq = vec3(px - 3.55, q.y - 2.25, q.z - (DZ - 0.1));
  float wf = max(box3(wq, vec3(1.45, 0.92, 0.07), 0.0), -box3(wq, vec3(1.33, 0.8, 0.2), 0.0));
  vec3 dq = vec3(q.x, q.y - (DECK + 1.38), q.z - (DZ - 0.1));
  float df = max(box3(dq, vec3(0.95, 1.38, 0.07), 0.0), -box3(dq - vec3(0.0, 0.06, 0.0), vec3(0.85, 1.24, 0.2), 0.0));
  df = min(df, box3(dq, vec3(0.045, 1.34, 0.06), 0.0));
  res = nearer(res, vec2(min(wf, df), 5.0));
  // glass a little behind the frames; the end windows' glass under the lattice
  float glass = min(box3(vec3(px - 3.55, q.y - 2.25, q.z - (DZ - 0.13)), vec3(1.35, 0.82, 0.01), 0.0),
                    box3(vec3(q.x, q.y - (DECK + 1.46), q.z - (DZ - 0.13)), vec3(0.87, 1.22, 0.01), 0.0));
  res = nearer(res, vec2(glass, 6.0));
  res = nearer(res, vec2(max(abs(px - (DX - 0.1)) - 0.01, arch + 0.03), 7.0));
  // a stovepipe on the roof, a life ring and two lanterns by the door
  float pipe = max(length(q.xz - vec2(1.5, -0.4)) - 0.16, abs(q.y - 7.3) - 0.75);
  pipe = min(pipe, max(length(q.xz - vec2(1.5, -0.4)) - 0.26, abs(q.y - 8.07) - 0.05));
  res = nearer(res, vec2(pipe, 8.0));
  vec3 lr = q - vec3(1.66, 2.0, DZ + 0.09);
  res = nearer(res, vec2(length(vec2(length(lr.xy) - 0.3, lr.z)) - 0.075, 10.0));
  float lamps = box3(vec3(px - 1.12, q.y - 2.95, q.z - DZ - 0.3), vec3(0.09, 0.14, 0.09), 0.02);
  lamps = min(lamps, box3(q - vec3(0.0, 3.3, DZ + 0.32), vec3(0.22, 0.06, 0.12), 0.02));
  res = nearer(res, vec2(lamps, 11.0));
  return res;
}

// Plank texture: boards so many metres wide, grain along them; seams fade when under a pixel.
vec3 planks(vec3 base, float across, float along, float width, float fp, float seed) {
  float b = floor(across / width), fb = fract(across / width);
  float edge = min(fb, 1.0 - fb) * width;
  float seamW = 0.022, wv = max(seamW, fp);
  float seam = (1.0 - ss(0.0, wv, edge)) * seamW / wv;
  float grain = noise(vec2(along * 1.6 + b * 13.1, fb * 6.0)) * 0.55 + noise(vec2(along * 6.0 + b * 3.7, fb * 2.0)) * 0.45;
  float tone = 0.74 + 0.36 * hash11(b * 7.31 + seed);
  return base * tone * (0.8 + 0.34 * mix(0.5, grain, ss(0.2, 0.04, fp))) * (1.0 - 0.6 * seam);
}

// The room behind the glass: wood walls and a vaulted ceiling lit by hanging lamps, tables and
// barrel chairs, portholes, the ship's wheel, the menu board and the order window. A ray from the
// glass is followed to where it leaves the room, so the inside shifts with the angle like a room.
vec3 interior(vec3 o, vec3 d) {
  d = vec3(abs(d.x) < 1e-4 ? 1e-4 : d.x, abs(d.y) < 1e-4 ? 1e-4 : d.y, abs(d.z) < 1e-4 ? 1e-4 : d.z);
  vec3 lo = vec3(-6.75, DECK, -2.65), hi = vec3(6.75, 9.0, 2.65);
  vec3 tt = (mix(lo, hi, step(0.0, d)) - o) / d;
  float t = min(tt.x, min(tt.y, tt.z));
  // the top of the room is the inside of the barrel
  float oy = o.y - SPRING;
  float A = d.y * d.y + d.z * d.z, B = 2.0 * (oy * d.y + o.z * d.z), C = oy * oy + o.z * o.z - 2.85 * 2.85;
  float disc = B * B - 4.0 * A * C;
  float tv = disc > 0.0 ? (-B + sqrt(disc)) / (2.0 * A) : 1e5;
  vec3 p = o + d * t;
  bool vault = false;
  if (tv < t && (o + d * tv).y > SPRING) { vault = true; t = tv; p = o + d * t; }
  else if (p.y > SPRING) vault = true;
  vec3 col;
  float lampGlow = 0.0;
  for (int k = -2; k <= 2; k++) {
    vec3 lp = vec3(float(k) * 2.8 + 0.4, 2.85, 0.1);
    lampGlow += 1.0 / (1.0 + dot(p - lp, p - lp) * 0.4);
  }
  if (p.y < DECK + 0.01) {
    col = planks(vec3(0.40, 0.24, 0.12), p.x, p.z, 0.3, 0.02, 3.0);
  } else if (vault) {
    float ang = atan(p.z, p.y - SPRING) * 2.85;
    col = planks(vec3(0.42, 0.25, 0.12), ang, p.x, 0.3, 0.02, 5.0) * (0.7 + 0.3 * ss(0.0, 2.2, abs(ang)));
    col *= 1.0 - 0.4 * ss(0.12, 0.05, abs(mod(p.x + 1.2, 2.4) - 1.2));                // arch ribs
  } else if (abs(p.z + 2.65) < 0.01) {
    // the back wall: boards laid across, a darker dado below
    col = planks(vec3(0.62, 0.38, 0.18), p.y, p.x, 0.32, 0.03, 7.0) * mix(0.62, 1.0, ss(1.55, 1.65, p.y));
    vec2 w = p.xy;
    float hole = length(vec2(mod(w.x + 1.2, 2.4) - 1.2, w.y - 2.7));
    if (abs(w.x) > 3.0 && abs(w.x) < 6.3) col = mix(col, mix(vec3(0.05, 0.08, 0.15), vec3(0.28, 0.17, 0.07), ss(0.24, 0.27, hole)), ss(0.33, 0.30, hole));
    float menu = max(abs(w.x - 0.6) - 1.4, abs(w.y - 3.05) - 0.4);
    col = mix(col, vec3(0.08, 0.05, 0.03) + vec3(0.5, 0.45, 0.32) * ss(0.35, 0.5, abs(fract(w.y * 6.0) - 0.5)) * ss(-0.05, -0.2, menu) * 0.35, ss(0.02, -0.02, menu));
    float hatch = max(abs(w.x - 3.1) - 0.65, abs(w.y - 2.2) - 0.42);
    col = mix(col, vec3(1.25, 1.05, 0.75), ss(0.02, -0.02, hatch));
    float wheel = length(w - vec2(-2.3, 2.6));
    float spokes = abs(sin(atan(w.y - 2.6, w.x + 2.3) * 4.0)) * wheel;
    col *= 1.0 - 0.75 * (ss(0.06, 0.02, abs(wheel - 0.42)) + ss(0.035, 0.0, spokes) * ss(0.48, 0.4, wheel));
    float counter = max(abs(w.x - 0.9) - 2.2, w.y - 1.55);
    col = mix(col, vec3(0.30, 0.16, 0.07) * (0.7 + 0.3 * ss(1.25, 1.55, w.y)), ss(0.02, -0.02, counter));
  } else {
    col = planks(vec3(0.56, 0.34, 0.16), p.y, abs(p.x) > 6.74 ? p.z : p.x, 0.32, 0.03, 9.0) * mix(0.62, 1.0, ss(1.55, 1.65, p.y));
  }
  col *= 0.5 + 1.0 * lampGlow;
  // between the glass and the walls: tables and barrel chairs, their tops just above the sills
  float tm = (0.6 - o.z) / d.z;
  if (tm > 0.0 && tm < t) {
    vec3 m = o + d * tm;
    float x = mod(m.x + 1.4 - 0.4, 2.8) - 1.4;
    float table = min(max(abs(x) - 0.62, abs(m.y - 1.44) - 0.05), max(abs(x) - 0.07, abs(m.y - 0.95) - 0.47));
    float chair = length(vec2((abs(x) - 1.0) * 1.2, max(abs(m.y - 1.12) - 0.36, 0.0))) - 0.27;
    float shape = min(table, chair);
    float fill = ss(0.015, -0.015, shape) * step(abs(m.x), 6.6);
    vec3 dark = vec3(0.12, 0.06, 0.028) * (0.5 + lampGlow * 0.7) + vec3(0.5, 0.3, 0.12) * ss(-0.06, 0.0, shape) * 0.25;
    col = mix(col, dark, fill);
  }
  // the lamps hang low over the tables, inside the windows' view
  float tl = (0.1 - o.z) / d.z;
  if (tl > 0.0 && tl < t) {
    vec3 m = o + d * tl;
    float x = mod(m.x + 1.4 - 0.4, 2.8) - 1.4;
    vec2 b = vec2(x, (m.y - 2.92) * 1.4);
    float shade = length(b) - 0.2;
    col = mix(col, vec3(0.16, 0.08, 0.03), ss(0.012, -0.012, shade) * step(m.y, 2.98));
    col += vec3(2.4, 1.6, 0.8) * ss(0.16, 0.06, length(vec2(x, m.y - 2.86))) + vec3(0.7, 0.42, 0.18) * exp(-length(vec2(x, m.y - 2.8)) * 4.0) * 0.45;
    col = mix(col, vec3(0.05, 0.03, 0.02), ss(0.012, 0.0, abs(x)) * step(3.05, m.y) * 0.8);
  }
  return col * vec3(1.0, 0.86, 0.66) * gWin;
}

vec3 glassColor(vec3 q, vec3 nq, vec3 dq, vec3 rdWorld, float fp, bool endWindow) {
  vec3 inside = interior(q - nq * 0.02, dq);
  float lead;
  if (endWindow) {
    // the lattice: a diamond grid of wooden bars across the arched window
    vec2 g = vec2(q.z + q.y, q.z - q.y) / 0.56;
    vec2 fg = abs(fract(g) - 0.5);
    float wv = max(0.05, fp) / 0.56;
    lead = max(ss(0.5 - wv, 0.5 - wv * 0.4, fg.x), ss(0.5 - wv, 0.5 - wv * 0.4, fg.y)) * min(1.0, 0.05 / max(fp, 0.05) + 0.3);
  } else {
    // mullions: a cross in each window, a bar across each door leaf
    float lx = abs(q.x) > 2.0 ? abs(abs(q.x) - 3.55) : abs(abs(q.x) - 0.44) + 9.0;
    float ly = abs(q.x) > 2.0 ? abs(q.y - 2.5) : abs(q.y - 1.45);
    float wv = max(0.035, fp * 0.7);
    lead = max(ss(wv, wv * 0.3, lx), ss(wv, wv * 0.3, ly)) * min(1.0, 0.035 / max(fp, 0.035) + 0.3);
  }
  vec3 nW = fromDinerDir(nq);
  float fres = 0.04 + 0.5 * pow(1.0 - max(dot(-dq, nq), 0.0), 5.0);
  vec3 refl = skyBase(max(reflect(rdWorld, nW).y, 0.0)) * 0.7;
  float smudge = 0.9 + 0.1 * noise(q.xy * 3.0 + q.z);
  vec3 col = mix(inside * vec3(1.0, 0.95, 0.88) * smudge, refl, fres);
  vec3 wood = vec3(0.10, 0.055, 0.025) * (0.5 + gWin * 0.9);                       // backlit bars
  return mix(col, wood, lead);
}

vec3 dinerSurface(vec3 q, vec3 nq, vec3 dq, float id, float fp, vec3 pW, vec3 rdW) {
  vec3 nW = fromDinerDir(nq);
  if (id > 5.5 && id < 7.5) return glassColor(q, nq, dq, rdW, fp, id > 6.5);
  if (id > 10.5) return vec3(2.4, 1.5, 0.7) * gWin;                                   // lanterns
  vec3 alb;
  if (id < 1.5) {
    alb = planks(vec3(0.42, 0.27, 0.15), abs(nq.z) > 0.5 ? q.x : q.z, q.y, 0.23, fp, 1.0);
  } else if (id < 2.5) {
    alb = planks(vec3(0.30, 0.19, 0.11), atan(q.z, q.y - SPRING) * VAULT, q.x, 0.3, fp, 2.0);
  } else if (id < 3.5 || (id > 7.5 && id < 8.5)) {
    alb = vec3(0.07, 0.066, 0.062);
  } else if (id < 4.5) {
    alb = planks(vec3(0.36, 0.22, 0.12), q.y + q.z * 0.3, q.x + q.z, 0.5, fp, 4.0);
  } else if (id < 5.5) {
    alb = vec3(0.30, 0.18, 0.10);
  } else if (id < 9.5) {
    alb = planks(vec3(0.32, 0.2, 0.11), q.z, q.x, 0.2, fp, 9.0);
  } else {
    float a = atan(q.y - 2.0, q.x - 1.66);
    alb = mix(vec3(0.85, 0.30, 0.08), vec3(0.85, 0.82, 0.76), step(0.0, sin(a * 4.0)));
  }
  vec3 col = alb * outsideLight(pW, nW);
  // the lit porch and the ground in front bounce warm light back up onto the front
  col += alb * WARM * gWin * 0.5 * max(nq.z, 0.0) * ss(5.2, 0.8, q.y) * ss(8.0, 5.0, abs(q.x));
  col += alb * WARM * gWin * 0.25 * max(-nq.y, 0.0) * ss(4.4, 3.2, q.y);                // under the eaves
  // a cool sheen on the roof's crest from the sky; the iron straps and the pipe catch the moon
  vec3 rW = reflect(rdW, nW);
  col += skyBase(max(rW.y, 0.0)) * pow(1.0 - max(dot(-dq, nq), 0.0), 4.0) * (id > 1.5 && id < 2.5 ? 0.5 : 0.25);
  if ((id > 2.5 && id < 3.5) || (id > 7.5 && id < 8.5)) col += MOON_LIGHT * 0.25 * pow(max(dot(rW, gMoon), 0.0), 18.0);
  return col;
}

// the bunting: pennants on a rope across the front, in front of the header beam
vec4 bunting(vec3 o, vec3 d, float tMax) {
  float t = (DZ + 0.3 - o.z) / d.z;
  if (t < 0.0 || t > tMax) return vec4(0.0);
  vec3 p = o + d * t;
  if (abs(p.x) > 6.9 || p.y < 3.2 || p.y > 4.06) return vec4(0.0);
  float fp = gPix * t;
  float span = 3.45, xs = fract((p.x + 6.9) / span);
  float rope = 4.0 - 0.3 * 4.0 * xs * (1.0 - xs);
  float j = floor((p.x + 6.9) / 0.46), fx = fract((p.x + 6.9) / 0.46);
  float xsc = fract(((j + 0.5) * 0.46) / span);
  float top = 4.0 - 0.3 * 4.0 * xsc * (1.0 - xsc);
  float s = (top - p.y) / 0.38;
  float flag = ss(0.03, -0.03, abs(fx - 0.5) - 0.42 * (1.0 - s)) * step(0.0, s) * step(s, 1.0);
  float a = max(flag, ss(0.02 + fp, 0.0, abs(p.y - rope)) * 0.8);
  if (a < 0.01) return vec4(0.0);
  float m = mod(j, 3.0);
  vec3 alb = m < 0.5 ? vec3(0.62, 0.07, 0.05) : m < 1.5 ? vec3(0.78, 0.74, 0.66) : vec3(0.07, 0.16, 0.55);
  alb = mix(vec3(0.03), alb, flag);
  vec3 pW = fromDinerDir(p) + gKK;
  vec3 col = alb * (outsideLight(pW, fromDinerDir(vec3(0.0, -0.3, 1.0))) + WARM * gWin * 0.3);
  return vec4(col * a, a);
}

// The sign: a scalloped shell on a tall pole, lit from inside; a pennant flies below it.
float signBoard2(vec2 p) {
  float a = atan(p.y, p.x);
  float r = 2.42 + 0.13 * cos(a * 9.0 + 0.6) * ss(-0.95, 0.2, sin(a));
  vec2 q = p;
  q.x *= 1.0 + 0.34 * ss(0.3, -2.2, p.y);
  return (length(q) - r) * 0.82;
}
float signMap(vec3 p) {   // p relative to the foot of the pole
  float board = max(signBoard2(p.xy - vec2(0.0, 13.4)), abs(p.z) - 0.2);
  float pole = max(length(p.xz) - 0.17, p.y - 11.6);
  return min(board, pole);
}
float lettering(vec2 b) {   // board coordinates, metres from the centre
  float ink = 1e3;
  for (int line = 0; line < 3; line++) {
    float hL = line == 0 ? 0.46 : 0.80;
    float pitch = line == 0 ? 0.46 : 0.68;
    int count = line == 0 ? 3 : (line == 1 ? 6 : 4);
    int first = line == 0 ? 0 : (line == 1 ? 3 : 9);
    float y0 = line == 0 ? 1.12 : (line == 1 ? 0.12 : -0.98);
    float x0 = -float(count) * pitch * 0.5;
    float arch = line == 1 ? 0.16 * (1.0 - pow(b.x / 2.1, 2.0)) : 0.0;
    float i = floor((b.x - x0) / pitch);
    if (i < 0.0 || i >= float(count)) continue;
    float sc = hL / 1.4;
    vec2 lp = vec2(b.x - x0 - i * pitch - (pitch - sc) * 0.5, b.y - y0 - arch) / sc;
    if (lp.y < -0.4 || lp.y > 1.8) continue;
    ivec2 g = GLYPH[TEXT[first + int(i)]];
    for (int s = 0; s < 10; s++) {
      if (s >= g.y) break;
      vec4 sg = SEG[g.x + s];
      ink = min(ink, seg2(lp, sg.xy, sg.zw) * sc);
    }
  }
  return ink;
}
vec3 signSurface(vec3 p, vec3 n, float fp) {
  vec2 b = p.xy - vec2(0.0, 13.4);
  float edge = signBoard2(b);
  if (p.y < 11.5 && length(p.xz) < 0.3) {
    return vec3(0.07) * (outsideLight(p + gSignPos, n) + vec3(1.0, 0.7, 0.4) * gSign * 0.5 * ss(8.5, 11.5, p.y));
  }
  if (n.z < 0.5) {
    // the board's rim glows orange where it catches its own light
    return vec3(1.0, 0.36, 0.08) * gSign * (0.5 + 0.5 * ss(-0.5, 0.5, n.y)) * (n.z < -0.5 ? 0.15 : 1.0);
  }
  float glow = 1.0 - 0.22 * ss(0.0, 2.2, length(b));
  vec3 col = vec3(1.0, 0.86, 0.58) * 1.45 * glow;
  col = mix(col, vec3(1.0, 0.38, 0.07) * 1.2, ss(-0.22, -0.15, edge));            // the outline band
  float ink = lettering(b);
  float sw = 0.062, aa = max(fp, 0.01);
  col = mix(col, vec3(1.0, 0.92, 0.72) * 1.5, ss(sw + 0.06 + aa, sw + 0.06, ink) * 0.3);
  col = mix(col, vec3(0.36, 0.05, 0.02), ss(sw + aa, sw - aa * 0.5, ink));
  return col * gSign;
}
// the pennant hangs from the pole just under the board and waves in the wind
vec4 pennant(vec3 o, vec3 d, float tMax) {
  float t = (0.06 - o.z) / d.z;
  if (t < 0.0 || t > tMax) return vec4(0.0);
  vec3 p = o + d * t;
  float x = -p.x;
  if (x < 0.1 || x > 2.9) return vec4(0.0);
  float wave = 0.18 * sin(x * 2.1 - uTime * 2.2) * (x / 2.8);
  float y = p.y - wave;
  float topY = 11.05 - 0.10 * x, botY = 10.15 + 0.27 * x;
  float fp = gPix * t;
  float a = ss(fp, -fp, y - topY) * ss(-fp, fp, y - botY) * ss(2.9, 2.75, x);
  if (a < 0.01) return vec4(0.0);
  float fold = 0.72 + 0.28 * cos(x * 2.1 - uTime * 2.2);
  vec3 col = vec3(0.55, 0.66, 0.78) * fold * (outsideLight(p + gSignPos, vec3(0.0, 0.2, 1.0)) + vec3(1.0, 0.7, 0.4) * gSign * 0.9 * ss(9.6, 11.0, y));
  return vec4(col * a, a);
}

// ── what the side mirror sees: our own flank, the road running away behind, the lamps passed ──
vec3 mirrorView(vec3 o, vec3 d) {
  vec3 col;
  if (d.y < 0.0) {
    float t = -o.y / d.y;
    vec3 p = o + d * t;
    float road = ss(ROAD_Z - 0.07, ROAD_Z + 0.07, p.z);
    float line = ss(0.12, 0.05, abs(p.z - LINE_Z));
    vec3 alb = mix(vec3(0.095, 0.085, 0.074), vec3(0.058, 0.06, 0.068), road);
    alb = mix(alb, vec3(0.6, 0.44, 0.13), line);
    col = fogged(alb * (SKY_LIGHT * 0.8 + lampsLight(p, vec3(0.0, 1.0, 0.0))), t);
  } else {
    col = skyBase(asin(clamp(d.y, -1.0, 1.0)));
    float base = 30.0 + 55.0 * floor((o.x - gTravel - 30.0) / 55.0 + 0.5);
    for (int k = 0; k <= 2; k++) {
      vec3 head = vec3(base + 55.0 * float(k) + gTravel, 6.95, HEAD_Z);
      float c = dot(normalize(head - o), d);
      col += SODIUM * gLamp * (0.16 * exp(-(1.0 - c) * 2200.0) + 0.05 * exp(-(1.0 - c) * 300.0));
    }
  }
  if (d.z > 0.0) {
    float t = (-0.80 - o.z) / d.z;
    vec3 p = o + d * t;
    // the flank curves away toward the back of the car, so it thins out instead of ending
    float body = ss(4.4, 2.6, p.x) * ss(0.24, 0.36, p.y) * ss(1.5, 1.34, p.y);
    if (body > 0.0) {
      vec3 env = skyBase(max(reflect(d, vec3(0.0, 0.0, -1.0)).y, 0.0));
      float crease = exp(-pow((p.y - 0.98) / 0.035, 2.0));
      vec3 paint = vec3(0.008, 0.022, 0.07) + env * 0.55 + env * crease * 0.9 + WARM * 0.06 * exp(-pow((p.x - 1.0) / 2.0, 2.0)) * ss(1.0, 0.6, p.y);
      paint = mix(paint, env * 0.35 + vec3(0.003, 0.004, 0.008), ss(1.0, 1.12, p.y));      // the rear side window
      col = mix(col, paint, body);
    }
  }
  return col;
}

// the side mirror's outline, in units of its half height: a rounded case with a slightly arched
// top, rounder at its outer end than at the end that meets the door
float mirrorCase(vec2 m) {
  if (m.y > 0.0) m.y /= 1.0 + 0.12 * (1.0 - 0.35 * m.x * m.x);
  float r = mix(0.3, 0.62, ss(-0.4, 1.3, m.x));
  vec2 q = abs(m) - vec2(1.55, 0.74) + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// ── putting it together ───────────────────────────────────────────────────────────────────────
vec3 world(vec3 ro, vec3 rd) {
  float tGround = rd.y < -1e-4 ? (-ro.y / rd.y) : 1e9;
  vec3 col = tGround < 1e8 ? groundColor(ro + rd * tGround, rd, tGround) : skyColor(rd);
  float tOpaque = tGround;

  // the diner, marched only where its box is
  vec3 o = toDiner(ro), d = dinerDir(rd);
  vec3 i0 = (vec3(-7.6, 0.0, -3.4) - o) / d, i1 = (vec3(7.6, 8.2, 4.5) - o) / d;
  vec3 tmin = min(i0, i1), tmax = max(i0, i1);
  float tE = max(max(tmin.x, tmin.y), tmin.z), tX = min(min(tmax.x, tmax.y), tmax.z);
  if (tX > max(tE, 0.0) && tE < tOpaque) {
    float t = max(tE, 0.0);
    vec2 h = vec2(1.0, 0.0);
    bool hit = false;
    for (int i = 0; i < 80; i++) {
      h = dinerMap(o + d * t);
      if (h.x < gPix * t * 0.45) { hit = true; break; }
      t += h.x * 0.9;
      if (t > tX) break;
    }
    if (hit) {
      vec3 q = o + d * t;
      float e = max(gPix * t * 0.6, 0.004);
      vec2 k = vec2(1.0, -1.0);
      vec3 nq = normalize(k.xyy * dinerMap(q + k.xyy * e).x + k.yyx * dinerMap(q + k.yyx * e).x + k.yxy * dinerMap(q + k.yxy * e).x + k.xxx * dinerMap(q + k.xxx * e).x);
      col = fogged(dinerSurface(q, nq, d, h.y, gPix * t, ro + rd * t, rd), t);
      tOpaque = t;
    }
    vec4 flags = bunting(o, d, tOpaque);
    if (flags.a > 0.0) col = over(col, flags, tOpaque);
  }

  // the sign, marched only in its box
  vec3 so = ro - gSignPos;
  i0 = (vec3(-3.3, 0.0, -0.4) - so) / rd; i1 = (vec3(3.3, 16.3, 0.4) - so) / rd;
  tmin = min(i0, i1); tmax = max(i0, i1);
  tE = max(max(tmin.x, tmin.y), tmin.z); tX = min(min(tmax.x, tmax.y), tmax.z);
  if (tX > max(tE, 0.0) && tE < tOpaque) {
    float t = max(tE, 0.0);
    bool hit = false;
    for (int i = 0; i < 48; i++) {
      float h = signMap(so + rd * t);
      if (h < gPix * t * 0.45) { hit = true; break; }
      t += h * 0.9;
      if (t > tX) break;
    }
    if (hit) {
      vec3 p = so + rd * t;
      float e = max(gPix * t * 0.6, 0.004);
      vec2 k = vec2(1.0, -1.0);
      vec3 n = normalize(k.xyy * signMap(p + k.xyy * e) + k.yyx * signMap(p + k.yyx * e) + k.yxy * signMap(p + k.yxy * e) + k.xxx * signMap(p + k.xxx * e));
      col = fogged(signSurface(p, n, gPix * t), t);
      tOpaque = t;
    }
    vec4 fl = pennant(so, rd, tOpaque);
    if (fl.a > 0.0) col = over(col, fl, tOpaque);
  }

  // things near the road, front to back over what is behind them
  float tC, tL;
  vec4 cac = cacti(ro, rd, tOpaque, tC);
  col = col * (1.0 - cac.a) + cac.rgb;
  vec4 lmp = lamp(ro, rd, min(tOpaque, tC), tL);
  col = mix(col, lmp.rgb, lmp.a);
  vec4 sh = shrubs(ro, rd, min(min(tOpaque, tC), tL));
  return col * (1.0 - sh.a) + sh.rgb;
}

void main() {
  musicSignals();
  vec2 uv = centered();
  float aspect = uRes.x / uRes.y;
  float pf = ss(1.15, 0.72, aspect);                         // 1 for a phone held upright
  gCalm = mix(0.4, 1.0, clamp((uPunch - 0.25) / 0.75, 0.0, 1.0));
  gTravel = mod(uCruise * SPEED, PERIOD);
  gBlur = SPEED * uCruiseRate * 0.022;                       // the distance covered while the shutter is open
  gLens = mix(2.75, 1.62, pf);
  gPix = 2.0 / uRes.y / gLens;
  // calm swells for the lamps and the sign, the mids for the windows
  float bassSlow = (slow(0.04) + slow(0.1) + slow(0.18)) / 3.0;
  float midSlow = (slow(0.32) + slow(0.42) + slow(0.52) + slow(0.62)) * 0.25;
  float audible = uAudioActive * gCalm;
  gLamp = 1.0 + audible * (0.30 * gBass + 0.14 * clamp(bassSlow * 1.4, 0.0, 1.0));
  gSign = 1.0 + audible * (0.26 * gBass + 0.08 * gHit);
  gWin = 0.92 + audible * (0.34 * clamp(midSlow * 1.6, 0.0, 1.0) + 0.10 * gMid);
  gMoon = normalize(vec3(-0.15, 0.29, -0.95));
  gKK = vec3(aroundX(KK_X, PERIOD), 0.0, KK_Z);
  gTurn = rot(KK_TURN);
  gSignPos = gKK + fromDinerDir(vec3(-10.5, 0.0, 2.6));

  // the car rides the road: small bumps that come faster the faster we go, and the bass under them
  float bump = (roadNoise(-gTravel, 0.0, 0.5, 1.0) - 0.5) * 0.010 + (roadNoise(-gTravel, 3.0, 2.0, 1.0) - 0.5) * 0.004;
  bump += 0.004 * gBass * audible;
  float horizon = mix(-0.10, -0.06, pf);
  float pitch = atan(-horizon / gLens) + bump * 0.08;
  gRo = vec3(0.0, EYE + bump, 0.0);
  gFwd = normalize(vec3(-sin(YAW) * cos(pitch), sin(pitch), -cos(YAW) * cos(pitch)));
  gRight = normalize(cross(gFwd, vec3(sin(bump * 0.6), 1.0, 0.0)));
  gUp = cross(gRight, gFwd);
  vec3 rd = normalize(gRight * uv.x + gUp * uv.y + gFwd * gLens);

  // the door and the mirror, in screen space
  float px = 2.0 / uRes.y;
  float xn = uv.x / aspect;
  float doorY = mix(-0.745, -0.70, pf) - mix(0.035, 0.05, pf) * xn - 0.018 * xn * xn;
  float edge = uv.y - doorY;
  float mh = mix(0.175, 0.13, pf);                              // the mirror's half height
  vec2 mq = (uv - vec2(-aspect + mix(0.25, 0.12, pf), mix(-0.36, -0.37, pf))) * rot(-0.05) / mh;
  float hShape = mirrorCase(mq) * mh;
  // the glass sits inside a rim that is thin along the top and thicker toward the bottom and the end
  float rimW = 0.075 + 0.07 * ss(0.4, -0.9, mq.y) + 0.05 * ss(0.6, 1.5, mq.x);
  float gShape = (mirrorCase(mq) + rimW) * mh;
  float housingA = ss(px, -px, hShape);
  float glassA = ss(px, -px, gShape);
  float doorA = ss(-px, px, -edge);

  vec3 col = vec3(0.0);
  if (doorA < 0.999 && glassA < 0.999) col = world(gRo, rd);

  // halation round the bright lights, kept soft so their details survive
  vec3 hd = vec3(aroundX(30.0, 55.0), 7.0, HEAD_Z);
  vec2 hs = toScreen(hd);
  float hv = step(0.0, dot(hd - gRo, gFwd));
  col += SODIUM * gLamp * hv * (exp(-length(uv - hs) * 9.0) * 0.10 + exp(-length(uv - hs) * 40.0) * 0.18);
  vec2 sgs = toScreen(gSignPos + vec3(0.0, 13.4, 0.0));
  col += vec3(1.0, 0.6, 0.3) * (gSign * gSign) * exp(-length((uv - sgs) * vec2(1.0, 1.2)) * 14.0) * 0.06;
  vec2 ds = toScreen(gKK + vec3(0.0, 2.2, 0.0));
  col += WARM * gWin * exp(-length((uv - ds) * vec2(0.8, 2.2)) * 9.0) * 0.04;

  // the mirror: a convex glass looking back along the car, a little soft, a little dim
  float lampNear = exp(-pow(aroundX(30.0, 55.0) / 7.0, 2.0)) * gLamp;
  if (glassA > 0.001) {
    // convex: the edges of the glass see wider; two samples a little apart soften it like a real one
    vec2 g = clamp(mq / vec2(1.45, 0.72), -1.2, 1.2);
    vec3 mo = vec3(-0.85, EYE - 0.08, -1.0);
    vec3 view = vec3(0.0);
    for (int i = 0; i < 2; i++) {
      vec2 gi = g + (i == 0 ? vec2(-0.022, 0.012) : vec2(0.022, -0.012));
      vec3 md = normalize(vec3(1.0, -0.055 + 0.2 * gi.y - 0.04 * gi.x * gi.x, 0.04 - 0.44 * gi.x));
      view += mirrorView(mo, md) * 0.5;
    }
    view = view * vec3(0.82, 0.87, 0.94) * (0.7 + 0.3 * (1.0 - min(dot(g, g), 1.0) * 0.7));
    view += vec3(0.06, 0.075, 0.1) * ss(-0.03, 0.0, gShape / mh) * 0.5;                  // the glass's bevel
    col = mix(col, view, glassA);
  }
  // the housing, painted like the car: dark blue and glossy, the sky running along its curved top
  float rim = housingA * (1.0 - glassA);
  if (rim > 0.001) {
    float inward = clamp(-hShape / (rimW * mh), 0.0, 1.0);          // 0 at the outer edge, 1 at the glass
    vec3 n = normalize(vec3(0.0, mix(1.0, 0.25, inward) * sign(mq.y + 0.15), mix(0.25, 1.0, inward)));
    float sky = max(n.y, 0.0);
    vec3 housing = vec3(0.004, 0.008, 0.02) + skyBase(0.04) * 0.55 * sky * sky;
    housing += vec3(0.16, 0.19, 0.25) * exp(-pow((inward - 0.25) / 0.12, 2.0)) * ss(-0.2, 0.6, mq.y) * 0.45;
    housing += SODIUM * lampNear * 0.06 * sky;
    col = mix(col, housing, rim);
  }
  // the top of the door: the rubber seal, the painted lip of the door that mirrors the sky and the
  // lights going by, a dark seam, then the inside of the door with a soft sheen along its top
  if (doorA > 0.001) {
    float e = -edge;
    float dinerNear = exp(-pow((ds.x - uv.x) * 2.5, 2.0)) * step(-1.5, ds.x) * step(ds.x, 1.5);
    vec3 env = skyBase(0.03) * 0.55 + SODIUM * lampNear * 0.6 * exp(-pow((uv.x - hs.x) * 2.0, 2.0)) + WARM * gWin * dinerNear * 0.16;
    vec3 door;
    if (e < 0.011) door = vec3(0.005, 0.005, 0.006) + vec3(0.09, 0.11, 0.15) * exp(-pow((e - 0.003) / 0.0018, 2.0));
    else if (e < 0.034) door = vec3(0.006, 0.010, 0.024) + env * (0.2 + 0.8 * exp(-pow((e - 0.021) / 0.007, 2.0)));
    else if (e < 0.04) door = vec3(0.003);
    else {
      float sheen = exp(-pow((e - 0.075) / 0.03, 2.0));
      door = vec3(0.010, 0.010, 0.012) * (0.6 + 0.6 * ss(0.3, 0.05, e)) + (skyBase(0.1) * 0.08 + SODIUM * lampNear * 0.05 + WARM * gWin * dinerNear * 0.02) * sheen;
      door *= 0.9 + 0.1 * noise(uv * vec2(260.0, 900.0));
    }
    col = mix(col, door, doorA);
  }
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'nostalgia', name: 'Nostalgia Drive', group: 'Journey',
  blurb: 'A night drive out of the passenger window: stars, a crescent moon, blue flower shapes in the sky, and a lobster-trap diner glowing warm by the desert road',
  tags: ['3d', 'night', 'drive', 'dream', 'nostalgia', 'stars', 'spongebob'],
  energy: 0.35, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
