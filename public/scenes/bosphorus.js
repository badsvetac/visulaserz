import { SCULPT } from '../js/gfx/scene-kit.js';

// BOSPHORUS — a summer night on the water off Ortaköy, low in a boat: the Ortaköy Mosque on its quay
// as the hero, floodlit gold from the lamps at its foot, its great lunette and arched windows burning
// and a mahya of lamps strung between its two minarets; behind it the European tower of the Bosphorus
// Bridge rising out of the wooded hill, and the bridge sweeping away across the strait to the Asian
// tower at Beylerbeyi, its inclined hangers zigzagging between the main cable and the deck; across
// the water the Asian shore in the haze: yalıs and lamps along the waterline, the white Kuleli school
// with its two towers, hillsides of windows and the far ridge of Çamlıca; a vapur crossing with its
// saloons lit, gulls wheeling in the mosque's light, low cloud warm with the city, a waning crescent,
// and the strait drawing every light down into long broken streaks.
//
// The bridge is real 3-D at true proportions (1074 m between towers 165 m tall, the deck at 64 m), so
// it recedes in perspective; the shores are upright planes at their distances and the water mirrors
// the whole picture from below, so a shore hides what lies behind it in the reflection too. In the
// water every small light is drawn out tall before it is broken up by the ripples, which is what
// turns a point into a streak.
//
// Music: the bridge's LED show is the analyser: every hanger is its own band of the spectrum, the bass
// at the towers through the mids to the highs at mid-span, in the colours of the palette; the bass
// also washes the towers with light and lights the main cables; the mids roughen the water so the
// streaks break up and stretch; the highs make the mahya's lamps twinkle (each lamp its own band), the
// water glitter and the stars shimmer. On every beat a pulse of light runs along the span from one
// tower to the other (alternating), the aircraft beacons on the towers and the ferry's lights flash,
// all gone within the beat. With nothing playing the bridge glows in a slow drift of colour and the
// night is calm.
const frag = `${SCULPT}
const float SPAN = 1074.0;        // between the towers
const float TOWER = 165.0;
const float ROAD = 64.0;          // the deck's top
const float GIRDER = 61.0;        // the box girder's underside
const float HALFW = 16.7;         // the cable planes, either side of the deck
const float SAG = 66.0;           // the main cable at mid-span
const float SADDLE = 160.0;       // ... and over the towers
const float HC = 8.95;            // half the hanger spacing: the zigzag turns every HC metres
const float ASIA = 1085.0;        // the Asian waterfront (x)
const float KULELI = 1350.0;      // where the school stands along it (z)
const vec2 MOON = vec2(0.31, 0.43);   // azimuth, elevation (radians)
const vec3 HAZE = vec3(0.07, 0.048, 0.07);   // the night air over the strait, warm with the city

float gPx, gAsp, gL, gYaw, gPf;
float gVS;                        // how tall a small light is drawn: 1, or drawn out in the water
vec3 gCam;
vec2 gFw, gRt;
float gPulse, gPulseS, gFlash;
float gFerryX, gFerryZ;
float gMosD, gMosX0, gHillD, gHillXE, gGullD, gGullX0;

// ── tools ───────────────────────────────────────────────────────────────────────────────────────
// a ray in slope space: a.x across, a.y up, both per metre ahead; its depth along the view is t
vec3 dirOf(vec2 a) { vec2 h = gRt * a.x + gFw; return vec3(h.x, a.y, h.y); }
vec2 proj(vec3 p, vec3 eye) { vec3 r = p - eye; return vec2(dot(r.xz, gRt), r.y) / dot(r.xz, gFw); }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float boxd(vec2 p, vec2 c, vec2 b) { vec2 d = abs(p - c) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
// a round-headed opening: upright sides from y0 to the spring y1, a half circle on top
float archd(vec2 p, float cx, float y0, float y1, float hw) {
  vec2 q = vec2(abs(p.x - cx), p.y);
  return q.y < y1 ? max(q.x - hw, y0 - q.y) : length(vec2(q.x, q.y - y1)) - hw;
}
float cover(float d, float pm) { return clamp(0.5 - d / pm, 0.0, 1.0); }
float sq(float x) { return x * x; }
vec3 hazed(vec3 c, float t) { return mix(c, HAZE, 1.0 - exp(-t / 2600.0)); }
// a small light d pixels away (x across, y up): a point and a little halo; tall in the water
float spot(vec2 d) { d.y /= gVS; return exp(-dot(d, d) * 0.7) + 0.05 * exp(-length(d) * 0.45); }

// ── the sky ─────────────────────────────────────────────────────────────────────────────────────
vec3 skyCol(vec2 a, bool refl) {
  float phi = atan(a.x), cphi = cos(phi);
  float az = phi + gYaw;
  float el = atan(a.y * cphi);                                    // elevation, radians
  // deep blue overhead, warming to the sodium glow of the city's streets near the horizon
  vec3 c = mix(vec3(0.16, 0.085, 0.066), vec3(0.075, 0.058, 0.11), ss(0.0, 0.07, el));
  c = mix(c, vec3(0.02, 0.028, 0.08), ss(0.04, 0.28, el));
  c = mix(c, vec3(0.005, 0.008, 0.03), ss(0.25, 0.85, el));
  // the moon and the light round it
  vec2 dm = vec2((az - MOON.x) * cos(MOON.y), el - MOON.y);
  float r = length(dm);
  c += vec3(0.09, 0.1, 0.15) * (exp(-r * 8.0) * 0.45 + exp(-r * 35.0) * 0.5);
  // low cloud drifting over, its underside warm with the city, silvered near the moon
  float band = ss(0.025, 0.09, el) * ss(0.6, 0.3, el);
  if (band > 0.0) {
    vec2 cq = vec2(az * 2.1 + uTime * 0.0022, el * 9.0);
    float n = refl ? noise(cq * 1.6 + 2.0) * 0.6 + 0.2 : fbm(cq + vec2(fbm(cq * 0.6 + 4.0) * 0.9, 0.0));
    float m = ss(0.47, 0.75, n) * band;
    vec3 cc = mix(vec3(0.19, 0.095, 0.07), vec3(0.045, 0.04, 0.075), ss(0.06, 0.32, el));
    cc *= 0.75 + 0.4 * ss(0.5, 0.8, n);                           // thicker cloud catches more of the city
    cc += vec3(0.2, 0.21, 0.27) * exp(-r * 5.0) * ss(0.55, 0.8, n);
    c = mix(c, cc, m * 0.85);
  }
  if (!refl) {
    // stars, few over a city, shimmering with the highs
    vec2 g = vec2(az, el) * 110.0;
    vec2 cell = floor(g);
    float h = hash21(cell + 17.0);
    if (h > 0.9 && el > 0.08) {
      vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.9)) - 0.5;
      vec2 f = (fract(g) - 0.5 - off * 0.7) / 110.0 / (gPx * 1.1);
      float tw = 0.75 + 0.25 * sin(uTime * (1.3 + h * 7.0) + h * 50.0) + gHigh * 0.9 * sin(uTime * 17.0 + h * 90.0);
      float mag = 0.06 + 0.8 * pow(hash21(cell + 1.7), 6.0);
      c += vec3(0.85, 0.9, 1.0) * mag * max(tw, 0.0) * exp(-dot(f, f) * 1.4) * ss(0.08, 0.3, el) * ss(0.04, 0.09, r);
    }
    // the waning crescent, its dark side faint in earthshine
    float R = 0.021;
    if (r < R * 1.6) {
      float px = gPx * 1.2;
      float disk = ss(R + px, R - px, r);
      float shadow = ss(R + px, R - px, length(dm - vec2(-0.62, 0.5) * R * 0.62));
      vec3 lit = vec3(1.25, 1.12, 0.9) * (0.85 + 0.15 * noise(dm * 900.0));
      c = mix(c, vec3(0.03, 0.035, 0.06), disk * 0.85);
      c += lit * disk * (1.0 - shadow);
    }
  }
  return c;
}

// ── the Asian shore: three upright planes seen at a slant, in the haze ─────────────────────────
// a light in each cell of a grid on a plane: q in metres, cell size, pixel size (metres) in each direction
float gridLights(vec2 q, vec2 cell, vec2 pm, float keep, float seed, out float tint) {
  vec2 g = q / cell, id = floor(g);
  float h = hash21(id + seed);
  tint = hash21(id + seed + 7.3);
  float far = ss(0.45, 0.9, max(pm.x / cell.x, pm.y / cell.y));   // smaller than a cell: an even glow
  float near = 0.0;
  if (h > keep && far < 1.0) {
    vec2 o = (vec2(hash21(id + seed + 1.3), hash21(id + seed + 4.1)) - 0.5) * 0.6;
    vec2 d = (fract(g) - 0.5 - o) * cell / max(pm, vec2(1e-3));
    near = exp(-dot(d, d) * 0.9) * (0.5 + 0.5 * hash21(id + seed + 9.7));
  }
  return mix(near, (1.0 - keep) * 0.5, far);
}
vec3 lightTint(float t) { return t < 0.55 ? vec3(1.0, 0.62, 0.3) : (t < 0.85 ? vec3(1.0, 0.84, 0.62) : vec3(0.7, 0.82, 1.0)); }

vec3 asia(vec2 a, vec3 eye, vec3 col, float px, bool refl) {
  if (a.y > 0.3 || a.y < -0.05) return col;
  vec3 d = dirOf(a);
  if (d.x <= 0.0) return col;
  float lean = length(d.xz) / d.x;                       // how much a metre along the shore shrinks
  // the far ridge of Çamlıca and Kandilli
  {
    float t = (ASIA + 1500.0 - eye.x) / d.x;
    float z = eye.z + t * d.z, y = eye.y + t * a.y, pm = px * t;
    float top = 140.0 + 95.0 * noise(vec2(z / 1500.0, 1.0)) + 28.0 * noise(vec2(z / 380.0, 2.0)) + 5.0 * noise(vec2(z / 40.0, 3.0));
    float k = cover(y - top, pm);
    if (k > 0.0) {
      float tint;
      float town = ss(0.4, 0.7, noise(vec2(z / 420.0, y / 150.0) + 3.0));
      float l = gridLights(vec2(z, y), vec2(24.0, 11.0), vec2(pm * lean, pm * gVS), mix(0.96, 0.72, town), 3.0, tint) * ss(top - 3.0, top - 25.0, y);
      vec3 c = vec3(0.018, 0.018, 0.036) + lightTint(tint) * l * 0.9;
      col = mix(col, hazed(c, t), k);
    }
  }
  // the nearer hills of Beylerbeyi and Çengelköy, wooded, villas and blocks among the trees
  {
    float t = (ASIA + 380.0 - eye.x) / d.x;
    float z = eye.z + t * d.z, y = eye.y + t * a.y, pm = px * t;
    float top = 55.0 + 75.0 * noise(vec2(z / 700.0, 5.0)) + 24.0 * noise(vec2(z / 190.0, 6.0)) + 4.0 * noise(vec2(z / 22.0, 7.0));
    float k = cover(y - top, pm);
    if (k > 0.0) {
      float town = ss(0.35, 0.62, noise(vec2(z / 260.0, y / 80.0) + 11.0)) * ss(top - 2.0, top - 14.0, y);
      float tint;
      float l = gridLights(vec2(z, y), vec2(13.0, 6.5), vec2(pm * lean, pm * gVS), mix(0.965, 0.66, town), 9.0, tint);
      vec3 c = vec3(0.007, 0.011, 0.015) + vec3(0.03, 0.02, 0.018) * ss(top - 30.0, top, y);
      c += lightTint(tint) * l * 1.1;
      col = mix(col, hazed(c, t), k);
    }
  }
  // the waterfront: yalıs with their windows lit, trees between, lamps along the shore road, the
  // mosque of Çengelköy and the Kuleli school
  {
    float t = (ASIA - eye.x) / d.x;
    float z = eye.z + t * d.z, y = eye.y + t * a.y, pm = px * t, pz = pm * lean;
    float above = clamp(y / pm + 0.5, 0.0, 1.0);              // below the waterline the ray met the water first
    if (y < 62.0 && above > 0.0) {
      float cw = 21.0, id = floor(z / cw), u = z - (id + 0.5) * cw;
      float h1 = hash11(id * 1.37 + 0.2), h2 = hash11(id * 2.91 + 0.7), h3 = hash11(id * 4.13 + 0.3);
      bool house = h3 > 0.3;
      float hw = 6.5 + 3.0 * h2, wall = 7.5 + 6.5 * h1;
      float roof = wall + min(2.8, (hw + 0.8 - abs(u)) * 0.45);
      float tree = 8.0 + 8.0 * h1 + 2.5 * sqrt(max(0.0, 1.0 - sq(u / (cw * 0.5))));
      float top = house ? roof : tree;
      float k = cover(house ? max(abs(u) - hw - 0.8, y - top) : y - top, pm) * above;
      // Kuleli: a long white block and two towers with pointed caps
      float ku = z - KULELI, kk = 0.0, kd = 1e3;
      if (abs(ku) < 80.0) {
        float tu = abs(abs(ku) - 58.0);
        kd = min(max(abs(ku) - 63.0, y - 23.0), max(tu - 4.6, y - 46.0));
        kd = min(kd, max(tu - 5.0 * clamp((61.0 - y) / 15.0, 0.0, 1.0), max(46.0 - y, y - 61.0)));
        kk = cover(kd, max(pm, pz)) * above;
      }
      // the mosque of Çengelköy by the water, floodlit: dome and minaret
      vec2 mq = vec2(z - 620.0, y);
      float md = min(length((mq - vec2(0.0, 11.0)) / vec2(8.0, 7.0)) - 1.0, boxd(mq, vec2(0.0, 6.0), vec2(9.0, 5.5)) / 6.0) * 6.0;
      float mn = max(abs(mq.x - 11.0) - 1.0, abs(y - 15.0) - 15.0);
      mn = min(mn, max(abs(mq.x - 11.0) - 1.2 * (36.0 - y) / 6.0, max(30.0 - y, y - 36.0)));
      float km = cover(min(md, mn), max(pm, pz)) * above;
      vec3 c = col;
      float clear = exp(-t / 2600.0);
      if (k > 0.0) {
        vec3 f;
        float far = ss(0.6, 1.4, pz);
        if (house) {
          // a painted wooden front, the street lamps' light on its lower storey
          vec3 alb = h2 < 0.3 ? vec3(0.8, 0.76, 0.68) : (h2 < 0.6 ? vec3(0.62, 0.36, 0.25) : vec3(0.5, 0.48, 0.44));
          f = alb * (0.05 + 0.3 * exp(-y / 5.0));
          if (y > wall) f = vec3(0.025, 0.02, 0.025) + vec3(0.03, 0.035, 0.06) * ss(roof - 1.5, roof, y);
          // windows in two or three rows, most of them lit
          if (y < wall - 0.8 && y > 2.0) {
            vec2 wg = vec2((u + hw) / 2.4, (y - 2.0) / 3.2), wi = floor(wg);
            vec2 wf = abs(fract(wg) - 0.5) * vec2(2.4, 3.2);
            float win = ss(0.55 + pz * 0.5, 0.55 - pz * 0.5, wf.x) * ss(0.9 + pm * 0.5, 0.9 - pm * 0.5, wf.y) * step(abs(u), hw - 0.8);
            float on = step(0.35, hash21(wi + id * 7.0));
            vec3 wc = mix(vec3(1.0, 0.58, 0.25), vec3(1.0, 0.8, 0.52), hash21(wi + id * 3.0));
            f = mix(f, wc * on, win * (1.0 - far));
            f += wc * 0.3 * far * step(abs(u), hw);
          }
        } else {
          f = vec3(0.008, 0.014, 0.014) + vec3(0.06, 0.035, 0.015) * exp(-y / 4.0);     // a tree, lamplit below
        }
        c = mix(c, hazed(f, t), k);
      }
      if (km > 0.0) c = mix(c, hazed(vec3(0.95, 0.75, 0.5) * (0.3 + 0.5 * exp(-y / 14.0)), t), km);
      if (kk > 0.0) {
        // floodlit white, a row of lit windows on each floor, the lamps on the towers' caps
        vec3 kc = vec3(0.92, 0.88, 0.8) * (0.32 + 0.55 * exp(-y / 18.0));
        float kw = ss(0.4, 0.2, abs(fract(y / 5.5) - 0.5)) * step(y, 21.0) * step(3.0, y) * ss(0.45, 0.25, abs(fract(ku / 4.0) - 0.5));
        kc = mix(kc, vec3(1.1, 0.75, 0.38), kw * (1.0 - ss(0.5, 1.2, pz)) * 0.7);
        c = mix(c, hazed(kc, t), kk);
      }
      // the stone embankment along the water, lit by the lamps above it
      c = mix(c, hazed(vec3(0.13, 0.095, 0.07), t), cover(y - 1.6, pm) * above);
      // lamps along the shore road
      float lk = floor(z / 26.0 + 0.5);
      float lf = ss(1.4, 0.5, pz / 26.0);                       // too close together to tell apart: a line
      vec2 ld = vec2((z - lk * 26.0) / pz, (y - 5.0) / pm);
      c += vec3(1.3, 0.72, 0.32) * mix(exp(-sq((y - 5.0) / (pm * gVS)) * 0.7) * min(pz / 26.0, 3.0) * 0.8, spot(ld), lf) * step(-300.0, z) * clear * above;
      col = c;
    }
  }
  return col;
}

// ── the European hill behind the tower: wooded, apartment windows, roads lit up its side ───────
vec3 europeHill(vec2 a, vec3 eye, vec3 col, float px, bool refl) {
  float D = gHillD, X = a.x * D, Y = eye.y + a.y * D, pm = px * D;
  if (X > gHillXE + 30.0 || Y < 0.0 || Y > 160.0) return col;
  float r = gHillXE + 18.0 - X;
  float top = 100.0 * ss(0.0, 300.0, r) + 28.0 * noise(vec2(X / 80.0, 3.0)) * ss(0.0, 90.0, r) + 4.0 * noise(vec2(X / 7.0, 1.0)) * ss(0.0, 30.0, r) - 2.0;
  float k = cover(Y - top, pm);
  if (k <= 0.0) return col;
  vec3 c = vec3(0.007, 0.011, 0.015) + vec3(0.06, 0.032, 0.02) * ss(30.0, 0.0, Y);
  c += vec3(0.02, 0.025, 0.045) * ss(top - 5.0, top, Y);                     // the sky along the crest
  // apartment blocks among the trees, their windows lit
  float town = ss(0.45, 0.62, noise(vec2(X / 55.0, Y / 30.0) + 4.0)) * ss(top - 3.0, top - 12.0, Y);
  float tint;
  float l = gridLights(vec2(X, Y), vec2(4.2, 3.0), vec2(pm, pm * gVS), mix(0.97, 0.55, town), 21.0, tint);
  c += lightTint(tint) * l * 0.8;
  // the road climbing the hill, its lamps in a string
  float ry = 12.0 + (gHillXE - X) * 0.32 + 6.0 * sin(X / 37.0);
  float lk = floor(X / 15.0 + 0.5);
  vec2 ld = vec2(X - lk * 15.0, Y - (12.0 + (gHillXE - lk * 15.0) * 0.32 + 6.0 * sin(lk * 15.0 / 37.0) + 1.0)) / pm;
  c += vec3(1.3, 0.7, 0.3) * spot(ld) * ss(top - 2.0, top - 8.0, Y) * step(ry, top);
  return mix(col, hazed(c, D), k);
}

// ── the bridge ──────────────────────────────────────────────────────────────────────────────────
float cableY(float s) {
  if (s < 0.0) return mix(SADDLE, 40.0, clamp(-s / 260.0, 0.0, 1.0));
  if (s > SPAN) return mix(SADDLE, 40.0, clamp((s - SPAN) / 270.0, 0.0, 1.0));
  float u = s / SPAN * 2.0 - 1.0;
  return SAG + (SADDLE - SAG) * u * u;
}
vec3 ledCol(float s) { return pal(0.12 + 0.55 * (1.0 - abs(s / SPAN * 2.0 - 1.0)) + uTime * 0.012); }
// how brightly hanger k (0..119 along the span) shines: a slow drift of colour, its own band, the beat's pulse
float hangerLevel(float k) {
  float s = (k + 0.5) * HC;
  float f = 1.0 - abs(s / SPAN * 2.0 - 1.0);
  float idle = 0.2 + 0.16 * (0.5 + 0.5 * sin(k * 0.19 - uTime * 0.7));
  float music = band(0.02 + 0.62 * f) * 2.2;
  return idle + music + gPulse * 2.6 * exp(-sq((s - gPulseS) / 75.0));
}
vec3 hangerPoint(float j, float zp) {
  float s = j * HC;
  return vec3(s, mod(j, 2.0) < 0.5 ? cableY(s) - 0.9 : ROAD + 0.4, zp);
}
// one cable plane: the main cable with its backstays and the zigzag of inclined hangers, all as light
vec3 cablePlane(vec2 a, vec3 eye, float zp, float px, float gain) {
  vec3 d = dirOf(a);
  float t = (zp - eye.z) / d.z;
  if (t <= 0.0) return vec3(0.0);
  float s = eye.x + t * d.x, y = eye.y + t * a.y;
  if (s < -270.0 || s > SPAN + 280.0) return vec3(0.0);
  float pm = px * t;
  float cy = cableY(s);
  vec3 c = vec3(0.0);
  // the main cable, its screen slope taken from two points on it
  {
    vec2 q0 = proj(vec3(s - 4.0, cableY(s - 4.0), zp), eye), q1 = proj(vec3(s + 4.0, cableY(s + 4.0), zp), eye);
    float k = (q1.y - q0.y) / (q1.x - q0.x);
    float dp = abs(y - cy) / pm / sqrt(1.0 + k * k);
    float w = max(0.35 / pm, 0.6);
    float lvl = 0.55 + 1.3 * gBass + gPulse * 2.2 * exp(-sq((s - gPulseS) / 90.0));
    c += ledCol(clamp(s, 0.0, SPAN)) * lvl * (ss(w + 1.0, w - 0.3, dp) * 1.3 + exp(-dp * 0.3) * 0.1);
  }
  // the hangers
  if (s > HC * 2.0 && s < SPAN - HC * 2.0 && y > ROAD - 3.0 && y < cy + 4.0) {
    float m = floor(s / HC);
    vec2 p0 = proj(hangerPoint(m - 1.0, zp), eye), p1 = proj(hangerPoint(m, zp), eye);
    vec2 p2 = proj(hangerPoint(m + 1.0, zp), eye), p3 = proj(hangerPoint(m + 2.0, zp), eye);
    float sp = abs(p2.x - p1.x) / px;                       // pixels between neighbouring hangers
    float lod = ss(2.0, 5.0, sp);
    float l0 = hangerLevel(m - 1.0), l1 = hangerLevel(m), l2 = hangerLevel(m + 1.0);
    float d0 = seg(a, p0, p1) / px, d1 = seg(a, p1, p2) / px, d2 = seg(a, p2, p3) / px;
    float valid0 = step(2.0, m - 1.0) * step(m - 1.0, 117.0), valid1 = step(2.0, m) * step(m, 117.0), valid2 = step(2.0, m + 1.0) * step(m + 1.0, 117.0);
    float line = (ss(1.25, 0.2, d0) + exp(-d0 * 0.5) * 0.12) * l0 * valid0
               + (ss(1.25, 0.2, d1) + exp(-d1 * 0.5) * 0.12) * l1 * valid1
               + (ss(1.25, 0.2, d2) + exp(-d2 * 0.5) * 0.12) * l2 * valid2;
    float inside = ss(ROAD - 0.5, ROAD + 0.5, y) * ss(cy + 0.5, cy - 0.5, y);
    float sheet = l1 * valid1 * clamp(1.4 / max(sp, 0.5), 0.0, 1.0) * inside;
    c += ledCol(s) * (mix(sheet, line, lod) + 0.035 * l1 * valid1 * inside);   // and a breath of it in the air between
  }
  return c * gain * exp(-t / 5000.0);
}
// an upright box seen from eye: x coverage, y depth, z height of the hit, w the face (0 an x face, 1 a z face)
vec4 vbox(vec2 a, vec3 eye, vec3 lo, vec3 hi, float px) {
  vec2 c0 = lo.xz - eye.xz, c1 = vec2(hi.x, lo.z) - eye.xz, c2 = vec2(lo.x, hi.z) - eye.xz, c3 = hi.xz - eye.xz;
  float x0 = dot(c0, gRt) / dot(c0, gFw), x1 = dot(c1, gRt) / dot(c1, gFw);
  float x2 = dot(c2, gRt) / dot(c2, gFw), x3 = dot(c3, gRt) / dot(c3, gFw);
  float ax = min(a.x - min(min(x0, x1), min(x2, x3)), max(max(x0, x1), max(x2, x3)) - a.x) / px;
  if (ax < -1.0) return vec4(0.0, 1e9, 0.0, 0.0);
  vec3 d = dirOf(a);
  float tx = eye.x < lo.x ? (lo.x - eye.x) / d.x : (eye.x > hi.x ? (hi.x - eye.x) / d.x : -1e9);
  float tz = eye.z < lo.z ? (lo.z - eye.z) / d.z : (eye.z > hi.z ? (hi.z - eye.z) / d.z : -1e9);
  float t = max(tx, tz);
  float y = eye.y + t * a.y;
  float ay = min(y - lo.y, hi.y - y) / (px * t);
  return vec4(clamp(ax + 0.5, 0.0, 1.0) * clamp(ay + 0.5, 0.0, 1.0), t, y, tx > tz ? 0.0 : 1.0);
}
// painted steel in the night, washed by the LED projectors at the foot of the tower: each beam
// widening as it climbs the face, a panel seam every 10.5 m, the sky's light on the top
vec3 steel(float Y, float across, float face, float tx, float wash, float pm) {
  vec3 led = ledCol(tx < 1.0 ? 0.0 : SPAN);
  float cone = exp(-across * across * mix(2.6, 0.5, ss(0.0, 110.0, Y)));
  float up = exp(-Y / 62.0) * 0.85 + 0.1;
  vec3 c = vec3(0.016, 0.019, 0.03) * (0.75 + 0.25 * face);
  c += led * up * cone * mix(0.5, 0.95, face) * wash * 0.8;
  c += vec3(0.03, 0.04, 0.07) * ss(TOWER - 40.0, TOWER, Y) * (0.6 + 0.4 * face);
  float seam = ss(pm * 1.2, 0.0, abs(fract(Y / 10.5 + 0.5) - 0.5) * 10.5 - 0.12);
  return c * (1.0 - 0.35 * seam);
}
vec3 tower(vec2 a, vec3 eye, vec3 col, float px, float tx, bool nearSide, float wash) {
  float zc = nearSide ? -HALFW : HALFW;
  vec4 h = vbox(a, eye, vec3(tx - 3.6, 0.0, zc - 2.8), vec3(tx + 3.6, TOWER, zc + 2.8), px);
  if (h.x <= 0.0) return col;
  vec3 p = eye + dirOf(a) * h.y;
  float across = h.w > 0.5 ? (p.x - tx) / 3.6 : (p.z - zc) / 2.8;
  vec3 c = steel(h.z, across, h.w, tx, wash, px * h.y);
  c *= 1.0 - 0.4 * ss(0.75, 1.0, abs(across));                             // the corners turn away
  return mix(col, hazed(c, h.y), h.x);
}
vec3 beams(vec2 a, vec3 eye, vec3 col, float px, float tx, float wash) {
  for (int i = 0; i < 3; i++) {
    float y0 = i == 0 ? 50.0 : (i == 1 ? 106.0 : 156.0), y1 = i == 0 ? 57.0 : (i == 1 ? 113.0 : 165.0);
    vec4 h = vbox(a, eye, vec3(tx - 2.6, y0, -HALFW + 2.8), vec3(tx + 2.6, y1, HALFW - 2.8), px);
    if (h.x > 0.0) {
      vec3 c = steel(h.z, 0.0, h.w, tx, wash, px * h.y) * 0.8 + ledCol(tx < 1.0 ? 0.0 : SPAN) * 0.3 * wash * ss(y0 + 1.5, y0, h.z);   // the lit underside edge
      col = mix(col, hazed(c, h.y), h.x);
    }
  }
  return col;
}
vec3 deck(vec2 a, vec3 eye, vec3 col, float px, float wash) {
  vec3 d = dirOf(a);
  // the fascia facing us
  float t = (-HALFW - eye.z) / d.z;
  float s = eye.x + t * d.x, y = eye.y + t * a.y;
  float pm = px * t;
  float end = cover(s - ASIA, 1.0) * cover(-260.0 - s, 1.0);
  float kf = clamp(min(y - GIRDER, ROAD + 1.3 - y) / pm + 0.5, 0.0, 1.0) * end;
  // the underside, seen from the water
  float kb = 0.0;
  if (a.y > 0.0) {
    float tb = (GIRDER - eye.y) / a.y;
    float zb = eye.z + tb * d.z, sb = eye.x + tb * d.x;
    float edge = (HALFW - zb) * (GIRDER - eye.y) * gFw.y / (tb * tb * px);
    kb = clamp(edge + 0.5, 0.0, 1.0) * step(-HALFW, zb) * step(-260.0, sb) * step(sb, ASIA);
  }
  float k = max(kf, kb);
  if (k <= 0.0) return col;
  vec3 led = ledCol(clamp(s, 0.0, SPAN));
  vec3 c = vec3(0.02, 0.022, 0.03) + led * 0.18 * wash * ss(GIRDER, ROAD, y);
  c += vec3(0.5, 0.36, 0.2) * 0.25 * ss(ROAD + 0.3, ROAD + 1.3, y);         // the lamps on the parapet
  c = mix(c, vec3(0.01, 0.01, 0.016) + led * 0.035 * wash, step(kf, kb - 0.001));
  return mix(col, hazed(c, t), k);
}
// lamps on the deck, every 36 m along both edges, and the traffic on the near carriageway
vec3 deckLights(vec2 a, vec3 eye, float px) {
  vec3 c = vec3(0.0);
  vec3 d = dirOf(a);
  for (int side = 0; side < 2; side++) {
    float zp = side == 0 ? -HALFW + 1.0 : HALFW - 1.0;
    float t = (zp - eye.z) / d.z;
    float s = eye.x + t * d.x;
    if (t <= 0.0 || s < -260.0 || s > ASIA) continue;
    float k = floor(s / 36.0 + 0.5);
    vec2 q = proj(vec3(k * 36.0, ROAD + 9.0, zp), eye), q2 = proj(vec3(k * 36.0 + 36.0, ROAD + 9.0, zp), eye);
    float sp = abs(q2.x - q.x) / px;
    vec2 dq = (a - q) / px;
    float lod = ss(2.5, 6.0, sp);
    float ly = abs(dq.y) / gVS;
    c += vec3(1.25, 0.82, 0.48) * (side == 0 ? 1.0 : 0.6) * mix(exp(-ly * ly * 0.8) * 1.6 / max(sp, 1.0), spot(dq) * 1.4, lod);
    if (side == 0) {
      // cars eastbound on the near carriageway: a headlight and a tail light each
      float v = 15.0, cs = s - uTime * v;
      float ck = floor(cs / 31.0);
      for (int j = 0; j < 2; j++) {
        float id = ck + float(j) - 0.5;
        if (hash11(id * 1.91 + 0.3) < 0.4) continue;
        float sc = (id + 0.5) * 31.0 + (hash11(id * 3.7) - 0.5) * 12.0 + uTime * v;
        vec2 hq = (a - proj(vec3(sc + 2.1, ROAD + 1.0, -HALFW + 4.0), eye)) / px, tq = (a - proj(vec3(sc - 2.1, ROAD + 1.0, -HALFW + 4.0), eye)) / px;
        hq.y /= gVS; tq.y /= gVS;
        c += vec3(1.3, 1.25, 1.1) * exp(-dot(hq, hq) * 0.9) + vec3(1.3, 0.12, 0.08) * exp(-dot(tq, tq) * 0.9);
      }
    }
  }
  return c;
}
// the red beacons on the tower tops, blinking, flashing with the beat
vec3 beacons(vec2 a, vec3 eye, float px) {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec3 p = vec3(i < 2 ? 0.0 : SPAN, TOWER + 1.2, (i == 0 || i == 2) ? -HALFW : HALFW);
    vec2 dq = (a - proj(p, eye)) / px;
    float blink = 0.35 + 0.65 * ss(0.5, 0.42, abs(fract(uTime * 0.5 + float(i) * 0.13) - 0.5));
    dq.y /= gVS;
    float dp = length(dq);
    c += vec3(1.6, 0.16, 0.08) * (blink + gFlash * 2.2) * (exp(-dp * dp * 0.4) + exp(-dp * 0.25) * 0.08 * (1.0 + gFlash * 3.0));
  }
  return c;
}
vec3 bridge(vec2 a, vec3 eye, vec3 col, float px, bool refl) {
  if (a.y < -0.02 || a.y > 0.62) return col;
  float wash = 0.55 + 0.9 * gBass;
  col += cablePlane(a, eye, HALFW, px, 0.55);
  col = tower(a, eye, col, px, 0.0, false, wash);
  col = tower(a, eye, col, px, SPAN, false, wash);
  col = beams(a, eye, col, px, 0.0, wash);
  col = beams(a, eye, col, px, SPAN, wash);
  col = deck(a, eye, col, px, wash);
  col = tower(a, eye, col, px, 0.0, true, wash);
  col = tower(a, eye, col, px, SPAN, true, wash);
  col += cablePlane(a, eye, -HALFW, px, 1.0);
  col += deckLights(a, eye, px);
  col += beacons(a, eye, px);
  return col;
}

// ── the vapur ───────────────────────────────────────────────────────────────────────────────────
vec3 ferry(vec2 a, vec3 eye, vec3 col, float px, bool refl) {
  vec3 d = dirOf(a);
  float t = (gFerryZ - eye.z) / d.z;
  if (t <= 0.0) return col;
  float u = eye.x + t * d.x - gFerryX, y = eye.y + t * a.y;
  if (abs(u) > 40.0 || y < 0.0 || y > 21.0) return col;
  float pm = px * t, pu = pm * length(d.xz) / max(abs(d.z), 0.15);
  float bowX = -31.0 - 3.2 * y / 4.4;
  float hull = max(max(bowX - u, u - 33.5 - 0.6 * y / 4.4), y - 4.4);
  float k = clamp(min(-max(bowX - u, u - 33.5) / pu, (4.4 - y) / pm) + 0.5, 0.0, 1.0);
  float sal1 = max(max(-26.5 - u, u - 29.0), max(4.4 - y, y - 7.3));
  float sal2 = max(max(-19.5 - u, u - 21.5), max(7.3 - y, y - 10.2));
  float wh = min(max(max(-19.5 - u, u + 13.5), max(10.2 - y, y - 12.6)), max(max(15.5 - u, u - 21.5), max(10.2 - y, y - 12.6)));
  float fun = max(max(-0.2 - u + (y - 10.2) * 0.12, u - 4.6 - (y - 10.2) * 0.12), max(10.2 - y, y - 15.8));
  float mast = max(abs(u + 11.0 - (y - 10.2) * 0.06) - 0.18, max(10.2 - y, y - 19.0));
  float all = min(min(min(sal1, sal2), min(wh, fun)), mast);
  float ka = max(k, clamp(0.5 - all / min(pm, pu), 0.0, 1.0));
  if (ka <= 0.0) return col;
  float fl = 1.0 + 0.9 * gFlash;
  vec3 c;
  if (y < 4.4 && hull < 0.0) {
    c = mix(vec3(0.02, 0.025, 0.04), vec3(0.3, 0.3, 0.31) * (0.6 + 0.4 * ss(1.0, 4.4, y)), ss(1.0, 1.3, y));
    c *= 1.0 - 0.4 * ss(0.12, 0.0, abs(y - 2.7));
    c += vec3(0.25, 0.14, 0.06) * ss(3.0, 4.4, y) * 0.5;
  } else if (fun < 0.0) {
    c = mix(vec3(0.5, 0.38, 0.15) * (0.4 + 0.6 * ss(15.0, 10.2, y)), vec3(0.025, 0.02, 0.02), ss(14.6, 14.8, y));
  } else if (mast < 0.0) {
    c = vec3(0.05);
  } else {
    c = vec3(0.27, 0.27, 0.29) * (0.7 + 0.3 * ss(4.4, 7.3, y));
    // saloon windows, warm, in a band along each deck
    float w1 = step(sal1, 0.0) * ss(0.7, 0.5, abs(y - 5.85) / 0.8) , w2 = step(sal2, 0.0) * ss(0.7, 0.5, abs(y - 8.75) / 0.75);
    float cols = ss(0.34, 0.24, abs(fract(u / 2.1) - 0.5));
    float on = step(0.12, hash11(floor(u / 2.1) * 3.1 + (y > 7.3 ? 7.0 : 0.0)));
    float far = ss(0.5, 1.0, pu);
    float win = max(w1, w2) * mix(cols * on, 0.62, far);
    c = mix(c, vec3(1.35, 0.88, 0.46) * fl, win);
    c = mix(c, vec3(0.1, 0.2, 0.18), step(wh, 0.0) * ss(0.5, 0.3, abs(y - 11.6)));
  }
  col = mix(col, c, ka);
  // its lights: masthead, the red port light, stern light, the lamps strung along the top deck
  vec2 m1 = vec2((u + 11.5) / pu, (y - 19.0) / pm), m2 = vec2((u + 17.0) / pu, (y - 11.4) / pm), m3 = vec2((u - 33.0) / pu, (y - 7.5) / pm);
  col += vec3(1.6, 1.5, 1.3) * spot(m1) * fl * 1.4 + vec3(1.6, 0.15, 0.08) * spot(m2) + vec3(1.4, 1.3, 1.1) * spot(m3);
  float lk = floor(u / 3.0 + 0.5);
  vec2 lq = vec2((u - lk * 3.0) / pu, (y - 10.6) / pm);
  col += vec3(1.4, 1.0, 0.55) * spot(lq) * step(abs(lk * 3.0), 20.0) * 0.5 * fl;
  col += vec3(1.0, 0.85, 0.6) * gFlash * 0.6 * exp(-length(vec2(u / 24.0, (y - 10.0) / 7.0)) * 2.0);   // the flash on the beat
  return col;
}

// ── Ortaköy: the mosque on its quay, the houses beside it ───────────────────────────────────────
// floodlit stone: the lamps at the foot of the walls throw their light up the face in pools, and
// the night sky lies cool on what they do not reach
vec3 stone(float X, float Y, float rel) {
  float h = max(Y - 1.8, 0.0);
  float up = exp(-h / 15.0);
  float pools = 1.0 + 0.32 * cos((X + 3.0) / 4.5 * PI) * exp(-h / 6.0);
  vec3 c = vec3(1.0, 0.74, 0.47) * (0.09 + 0.78 * up * pools) + vec3(0.05, 0.06, 0.1) * ss(8.0, 26.0, Y);
  return c * rel;
}
vec3 ortakoy(vec2 a, vec3 eye, vec3 col, float px, bool refl) {
  float D = gMosD, X = a.x * D - gMosX0, Y = eye.y + a.y * D, pm = px * D;
  if (Y < 0.0 || Y > 41.0 || X > 26.0) return col;
  vec2 m = vec2(X, Y);
  float ax = abs(X);
  // the floodlights' glow in the damp air round the mosque
  vec2 hq = (m - vec2(-3.0, 12.0)) / vec2(29.0, 27.0);
  col += vec3(0.5, 0.3, 0.13) * 0.09 * sq(max(0.0, 1.0 - dot(hq, hq)));
  // the houses of Ortaköy along the quay to the left
  if (X < -27.0) {
    float cw = 9.5, id = floor(X / cw), u = X - (id + 0.5) * cw;
    float h1 = hash11(id * 1.7 + 0.4), h2 = hash11(id * 3.3 + 0.9);
    float top = 9.0 + 5.0 * h1;
    float k = cover(Y - top - step(0.5, h2) * (cw * 0.5 - abs(u)) * 0.35, pm);
    if (k > 0.0) {
      vec3 c = mix(vec3(0.16, 0.11, 0.09), vec3(0.12, 0.12, 0.13), h2) * (0.35 + 0.65 * ss(top, 1.8, Y));
      vec2 wg = vec2((u + cw * 0.5) / 2.3, (Y - 5.2) / 3.0), wi = floor(wg);
      vec2 wf = abs(fract(wg) - 0.5) * vec2(2.3, 3.0);
      float win = ss(0.5 + pm * 0.5, 0.5 - pm * 0.5, wf.x) * ss(0.85 + pm * 0.5, 0.85 - pm * 0.5, wf.y) * step(0.0, wg.y) * step(Y, top - 1.0);
      c = mix(c, vec3(1.15, 0.7, 0.34) * step(0.3, hash21(wi + id * 5.0)) * 0.85, win);
      c = mix(c, vec3(0.75, 0.42, 0.18), ss(0.15, 0.0, abs(Y - 4.3) - 0.5) * 0.6);   // the cafés' awnings, lit below
      c += vec3(0.5, 0.3, 0.12) * ss(4.0, 1.8, Y);
      col = mix(col, c, k);
    }
  }
  // the hall: its walls, the great arch rising over the cornice, corner piers, the drum and dome
  float hall = boxd(m, vec2(0.0, 10.4), vec2(10.5, 8.6));
  float tymp = max(length(m - vec2(0.0, 13.5)) - 8.6, 13.5 - Y);
  float piers = boxd(vec2(ax, Y), vec2(10.3, 11.4), vec2(1.35, 9.6));
  float finial = length((vec2(ax, Y) - vec2(10.3, 21.4)) / vec2(1.0, 1.4)) - 1.0;
  float drum = boxd(m, vec2(0.0, 20.9), vec2(6.6, 1.9));
  vec2 dq = (m - vec2(0.0, 22.6)) / vec2(7.0, 6.6);
  float domeD = max((length(dq) - 1.0) * 6.6, 22.6 - Y);
  float alem = max(abs(X) - 0.12, abs(Y - 30.6) - 1.4);
  float body = min(min(min(hall, tymp), min(piers, finial)), min(min(drum, domeD), alem));
  float kb = cover(body, pm);
  if (kb > 0.0) {
    vec3 c;
    if (domeD < 0.3 && Y > 22.4) {
      // the dome: lead, the floodlights catching its lower half, the moonlit sky on its shoulder
      vec3 n = vec3(dq.x, dq.y, sqrt(max(1.0 - dot(dq, dq), 0.0)));
      c = vec3(0.05, 0.055, 0.08) + vec3(0.62, 0.44, 0.27) * exp(-(Y - 22.6) / 2.0) * (0.45 + 0.55 * n.z);
      c += vec3(0.1, 0.11, 0.17) * ss(0.2, 0.95, dot(n, normalize(vec3(0.45, 0.7, 0.55))));
      c *= 0.86 + 0.14 * ss(0.4, 0.5, abs(fract(atan(dq.x, n.z) * 4.0) - 0.5));
    } else if (alem < 0.5 && Y > 29.0) {
      c = vec3(0.95, 0.72, 0.36);
    } else if (drum < 0.2 && Y > 19.2) {
      c = stone(X, Y, 0.95) * (1.0 - 0.3 * ss(20.5, 22.6, Y));
      float dw = archd(vec2(fract(X / 2.2 + 0.5) * 2.2 - 1.1, Y), 0.0, 19.8, 21.4, 0.45);
      c = mix(c, vec3(1.2, 0.72, 0.34), cover(dw, pm) * ss(6.0, 5.0, ax));
    } else {
      // the walls: floodlit stone, the pilasters standing out into more of it, the cornices lit
      // on their undersides and throwing a shadow up the wall above
      float rel = 1.0;
      rel *= 1.0 + 0.14 * ss(0.5, 0.3, abs(ax - 7.9));                  // pilasters flanking the arch
      rel *= 1.0 + 0.4 * ss(0.45, 0.0, abs(Y - 17.9)) - 0.42 * ss(0.0, 0.5, Y - 18.4) * ss(1.6, 0.6, Y - 18.4);   // the cornice
      rel *= 1.0 + 0.25 * ss(0.3, 0.0, abs(Y - 12.6)) - 0.25 * ss(0.0, 0.3, Y - 12.9) * ss(1.0, 0.4, Y - 12.9);
      rel *= 1.0 + 0.08 * ss(9.0, 10.5, ax);
      c = stone(X, Y, rel);
      if (piers < 0.0) c = stone(X, Y, 1.1) * (1.0 - 0.3 * ss(0.4, 0.0, abs(ax - 9.0)));
      if (finial < 0.0 && Y > 20.8) c = vec3(0.24, 0.2, 0.16) + vec3(0.3, 0.2, 0.1) * ss(22.5, 21.0, Y);
      // the great arch: its moulding, then the lunette of glass with its radial bars
      float rr = length(m - vec2(0.0, 13.5));
      if (Y > 13.5) {
        c *= 1.0 + 0.2 * ss(0.5, 0.2, abs(rr - 8.1)) - 0.4 * ss(0.3, 0.0, abs(rr - 7.45));
        float lun = cover(rr - 7.0, pm);
        float ang = atan(X, Y - 13.5);
        float bars = max(ss(pm * 1.2 + 0.08, 0.08, abs(fract(ang / 0.3927 + 0.5) - 0.5) * 0.3927 * rr), ss(0.25, 0.1, abs(rr - 4.2)));
        vec3 glow = vec3(1.4, 0.82, 0.38) * (0.75 + 0.4 * ss(7.0, 0.0, rr));
        c = mix(c, mix(glow, vec3(0.2, 0.1, 0.05), bars * 0.85), lun);
      }
      // three tall windows under it, and the smaller ones in the side bays
      float w = min(min(archd(m, -4.6, 4.6, 10.6, 1.3), archd(m, 0.0, 4.6, 10.6, 1.3)), archd(m, 4.6, 4.6, 10.6, 1.3));
      float ws = min(archd(vec2(ax, Y), 9.4, 4.6, 7.6, 0.6), archd(vec2(ax, Y), 9.4, 13.8, 15.8, 0.6));
      float wk = cover(min(w, ws), pm);
      float mull = ss(pm + 0.08, 0.06, abs(fract(Y / 1.5) - 0.5) * 1.5) * step(Y, 10.4);
      vec3 glow = vec3(1.3, 0.74, 0.33) * (0.85 + 0.2 * noise(m * 0.6));
      c *= 1.0 - 0.3 * ss(0.9, 0.0, min(w, ws)) * step(0.0, min(w, ws));   // the reveal round each window
      c = mix(c, mix(glow, vec3(0.25, 0.12, 0.05), mull * 0.7), wk);
      c *= 1.0 - 0.35 * cover(abs(Y - 3.4) - 1.6, pm) * step(ax, 10.6) * step(5.6, ax);   // the door bays in shadow
    }
    col = mix(col, c, kb);
  }
  // the sultan's pavilion in front of the hall's left side
  float pav = boxd(m, vec2(-19.0, 6.6), vec2(8.6, 4.8));
  float kp = cover(pav, pm);
  if (kp > 0.0) {
    vec3 c = stone(X, Y, 0.92) * (1.0 + 0.3 * ss(0.4, 0.0, abs(Y - 10.6)) - 0.3 * ss(0.3, 0.0, abs(Y - 11.2)));
    vec2 wg = vec2((X + 27.6) / 2.45, (Y - 3.0) / 4.2), wi = floor(wg);
    vec2 wf = vec2(fract(wg.x) - 0.5, fract(wg.y)) * vec2(2.45, 4.2);
    float win = cover(archd(wf, 0.0, 0.6, 2.4, 0.55), pm) * step(wg.y, 2.0) * step(0.0, wg.y) * step(0.5, wg.x) * step(wg.x, 6.5);
    c = mix(c, vec3(1.25, 0.72, 0.32) * (0.7 + 0.3 * hash21(wi)), win);
    col = mix(col, c, kp);
  }
  // the two minarets at the front corners, their balconies, lead caps and finials
  {
    float mx = ax - 15.0;
    vec2 q = vec2(mx, Y);
    float ped = boxd(q, vec2(0.0, 5.4), vec2(1.7, 3.6));
    float shaft = max(abs(mx) - 1.05, abs(Y - 17.0) - 9.4);
    float cor = max(abs(mx) - mix(1.05, 1.9, ss(25.6, 26.8, Y)), abs(Y - 26.4) - 0.8);
    float bal = boxd(q, vec2(0.0, 27.5), vec2(1.95, 0.35));
    float rail = max(abs(mx) - 1.85, abs(Y - 28.25) - 0.4);
    float up = max(abs(mx) - 0.88, abs(Y - 30.0) - 2.2);
    float cap = max(abs(mx) - 1.08 * (37.6 - Y) / 5.4, max(32.2 - Y, Y - 37.6));
    float fin = max(abs(mx) - 0.09, abs(Y - 38.4) - 0.9);
    float mn = min(min(min(ped, shaft), min(cor, bal)), min(min(rail, up), min(cap, fin)));
    float km = cover(mn, pm);
    if (km > 0.0) {
      float side = clamp(mx / 1.1, -1.0, 1.0);
      vec3 c = stone(X, Y * 0.75, 1.0) * (0.55 + 0.45 * sqrt(max(1.0 - side * side, 0.0)));
      c += vec3(0.04, 0.05, 0.08) * ss(0.3, 1.0, side);                  // the moon's side
      if (cap < 0.05 && Y > 32.0) c = vec3(0.05, 0.055, 0.08) + vec3(0.35, 0.25, 0.15) * ss(34.0, 32.2, Y) + vec3(0.06, 0.07, 0.11) * ss(-0.5, 1.0, side);
      if (fin < 0.0) c = vec3(0.9, 0.7, 0.35);
      if (rail < 0.0) c = mix(c * 0.4, vec3(1.2, 0.8, 0.45), 0.6 * ss(0.3, 0.6, abs(fract(mx * 2.4) - 0.5) * 2.0));
      if (bal < 0.0) c = stone(X, 16.0, 1.25);
      c *= 1.0 - 0.15 * ss(0.3, 0.0, abs(fract(Y / 3.2) - 0.5) * 3.2) * step(Y, 26.0) * step(9.0, Y);
      col = mix(col, c, km);
    }
  }
  // the mahya: a string of lamps between the minarets' balconies, each lamp one of the high bands
  {
    float sx = X / 13.6;
    if (abs(sx) < 1.05 && Y > 20.0 && Y < 29.0) {
      float sy = 27.0 - 3.2 * (1.0 - sx * sx);
      float wire = ss(pm * 1.2, 0.0, abs(Y - sy) - 0.03) * step(abs(sx), 1.0);
      col = mix(col, vec3(0.06, 0.05, 0.04), wire * 0.6);
      float i = clamp(floor((sx + 1.0) * 8.0 + 0.5), 1.0, 15.0);
      float bx = (i / 8.0 - 1.0) * 13.6;
      vec2 bd = vec2(X - bx, Y - (27.0 - 3.2 * (1.0 - sq(bx / 13.6))) + 0.35) / max(pm, 0.07);
      float lvl = 0.55 + 2.3 * band(0.58 + 0.38 * i / 15.0) + 0.15 * sin(uTime * 1.3 + i * 0.9);
      vec3 bc = mix(vec3(1.4, 0.95, 0.5), vec3(1.2, 1.1, 0.9), mod(i, 2.0));
      col += bc * lvl * spot(bd * 0.95);
    }
  }
  // the quay: the stone edge, iron lamp posts with glass globes
  {
    float qk = cover(max(Y - 1.8, X - 22.0 - (1.8 - Y) * 0.5), pm);
    if (qk > 0.0) {
      vec3 c = vec3(0.3, 0.22, 0.15) * (0.45 + 0.55 * ss(0.0, 1.8, Y)) + vec3(0.32, 0.2, 0.1) * ss(0.25, 0.0, abs(Y - 1.7));
      c *= 0.85 + 0.15 * ss(0.05, 0.12, abs(fract(X / 1.6) - 0.5));
      col = mix(col, c, qk);
    }
    float lk = floor((X + 3.0) / 9.0 + 0.5);
    float lx = X + 3.0 - lk * 9.0;
    float post = cover(max(abs(lx) - 0.12, max(1.8 - Y, Y - 5.3)), pm) * step(lk * 9.0 - 3.0, 22.0);
    col = mix(col, vec3(0.03, 0.025, 0.02), post);
    vec2 gd = vec2(lx, Y - 5.7) / max(pm, 0.05);
    gd.y /= gVS;
    col += vec3(1.5, 1.05, 0.6) * (exp(-dot(gd, gd) * 0.25 * pm * pm / 0.09) * 1.4 + exp(-length(gd) * 0.25) * 0.07) * step(lk * 9.0 - 3.0, 22.0);
  }
  return col;
}

// ── gulls wheeling in the floodlight ────────────────────────────────────────────────────────────
float gull(vec2 p, vec2 c, float sz, float flap, float bank, float pm) {
  vec2 r = rot(bank) * (p - c) / sz;
  if (dot(r, r) > 2.5) return 0.0;
  vec2 ra = vec2(abs(r.x), r.y);
  vec2 elbow = vec2(0.38, 0.14 + 0.32 * flap), tip = vec2(1.0, -0.12 + 0.55 * flap);
  float d = min(seg(ra, vec2(0.0, 0.02), elbow) - mix(0.1, 0.075, ra.x / 0.38), seg(ra, elbow, tip) - mix(0.075, 0.02, clamp((ra.x - 0.38) / 0.62, 0.0, 1.0)));
  d = min(d, length(r * vec2(1.0, 2.4)) - 0.14);
  return clamp(0.5 - d * sz / pm, 0.0, 1.0);
}
vec3 gulls(vec2 a, vec3 eye, vec3 col, float px) {
  float D = gGullD, X = a.x * D - gGullX0, Y = eye.y + a.y * D, pm = px * D;
  if (Y < 8.0 || Y > 48.0 || abs(X) > 40.0) return col;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float w = (0.16 + 0.03 * fi) * (mod(fi, 2.0) * 2.0 - 1.0);
    float ang = uTime * w + fi * 2.1;
    vec2 c = vec2(cos(ang) * (9.0 + 4.0 * hash11(fi * 3.1)), 27.0 + 6.0 * hash11(fi * 1.7) + sin(ang * 2.0 + fi) * 3.0 + sin(ang) * 2.0);
    float flap = 0.2 + 0.6 * sin(uTime * 6.5 + fi * 2.3) * ss(0.3, 0.8, sin(uTime * 0.31 + fi * 1.9));
    float g = gull(vec2(X, Y), c, 0.85 + 0.2 * hash11(fi * 5.3), flap, 0.4 * cos(ang) * sign(w), pm);
    vec3 lit = mix(vec3(0.8, 0.62, 0.44), vec3(0.3, 0.3, 0.36), ss(24.0, 38.0, c.y));   // lit from below by the floodlights
    col = mix(col, lit, g);
  }
  return col;
}

vec3 layers(vec2 a, vec3 eye, vec3 col, float px, bool refl) {
  col = asia(a, eye, col, px, refl);
  col = europeHill(a, eye, col, px, refl);
  if (gFerryZ > 0.0) col = ferry(a, eye, col, px, refl);
  col = bridge(a, eye, col, px, refl);
  if (gFerryZ <= 0.0) col = ferry(a, eye, col, px, refl);
  col = ortakoy(a, eye, col, px, refl);
  return col;
}

// ── the strait ──────────────────────────────────────────────────────────────────────────────────
// one train of waves running towards us: its slope, or (too fine to draw here) its share of roughness
void wave(vec2 P, float ang, float len, float A, float fl, inout vec2 g, inout float un) {
  vec2 dir = vec2(sin(ang), cos(ang));
  float k = TAU / len;
  float keep = ss(2.5 * fl, 6.0 * fl, len);
  g += dir * A * sin(dot(dir, P) * k + uTime * sqrt(9.81 * k)) * keep;
  un += A * A * 0.5 * (1.0 - keep);
}
vec3 water(vec2 a) {
  float ay = min(a.y, -1e-4);
  float tw = gCam.y / -ay;
  vec3 d = dirOf(vec2(a.x, ay));
  vec2 P = gCam.xz + d.xz * tw;
  float fa = gPx * tw, fl = fa / -ay;                    // a pixel across and along the view, metres
  // the wake of the ferry: churned water behind her stern and the two arms of the Kelvin wedge
  vec2 wq = vec2(P.x - gFerryX - 33.0, P.y - gFerryZ - 7.0);
  float wake = 0.0;
  if (wq.x > -66.0 && wq.x < 500.0 && abs(wq.y) < 200.0) {
    float behind = max(wq.x, 0.0);
    float wsp = 5.0 + behind * 0.12;
    float churn = ss(wsp, wsp * 0.2, abs(wq.y)) * exp(-behind / 160.0) * step(0.0, wq.x);
    float arm = abs(abs(wq.y) - behind * 0.354);
    float arms = ss(2.0 + behind * 0.02, 0.0, arm) * exp(-behind / 220.0) * step(0.0, wq.x) * 0.6;
    float bow = ss(4.0, 0.0, abs(wq.y)) * ss(-70.0, -64.0, wq.x) * ss(-58.0, -64.0, wq.x);
    wake = (churn + arms) * (0.55 + 0.45 * noise(P * vec2(0.4, 0.9) + vec2(uTime * 0.6, 0.0))) + bow;
  }
  float amp = (0.75 + 1.3 * gMid) * (1.0 + wake * 1.5);
  vec2 g = vec2(0.0);
  float un = 0.0;
  wave(P, 0.79, 12.0, 0.016, fl, g, un);
  wave(P, 0.25, 7.3, 0.018, fl, g, un);
  wave(P, 0.6, 4.4, 0.02, fl, g, un);
  wave(P, 0.36, 2.6, 0.02, fl, g, un);
  wave(P, 0.56, 1.5, 0.02, fl, g, un);
  wave(P, 0.45, 0.85, 0.018, fl, g, un);
  g *= amp;
  // ripples too fine to draw still tilt the light up and down the view: rows a few pixels deep and
  // many wide, running towards us
  vec2 fq = gl_FragCoord.xy * (1080.0 / uRes.y);
  float r1 = noise(vec2(fq.x / 42.0, fq.y / 6.0 + uTime * 1.7));
  float r2 = noise(vec2(fq.x / 25.0 + 17.0, fq.y / 3.8 + uTime * 2.6));
  g += gFw * ((r1 - 0.5) + (r2 - 0.5) * 0.7) * sqrt(un) * amp * 2.6;
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 rd = normalize(d);
  vec3 rr = reflect(rd, n);
  rr.y = max(rr.y, 0.0015);
  float fw = max(dot(rr.xz, gFw), 0.05);
  vec2 ar = vec2(dot(rr.xz, gRt), rr.y) / fw;
  vec3 eyeM = vec3(gCam.x, -gCam.y, gCam.z);
  gVS = 7.0;
  vec3 refl = layers(ar, eyeM, skyCol(ar, true), gPx * 2.0, true);
  gVS = 1.0;
  float cosi = clamp(dot(-rd, n), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - cosi, 5.0);
  float R = clamp(0.1 + 1.1 * F, 0.0, 0.92);
  vec3 body = vec3(0.004, 0.011, 0.016) + vec3(0.02, 0.012, 0.008) * exp(-tw / 300.0);
  vec3 col = body * (1.0 - R) + refl * R;
  // the highs glitter on the crests where a light lies on the water
  float glint = ss(0.6, 0.9, r2) * ss(0.55, 0.9, noise(vec2(fq.x / 9.0, fq.y / 3.0 - uTime * 3.0)));
  col += refl * glint * gHigh * 2.2;
  // foam
  col += vec3(0.11, 0.115, 0.12) * clamp(wake, 0.0, 1.0) * (0.5 + 0.5 * noise(P * 1.7 + uTime * 0.3));
  return col;
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gAsp = uRes.x / uRes.y;
  gPf = ss(1.15, 0.72, gAsp);                                   // 1 for a phone held upright
  gL = mix(1.7, 2.0, gPf);
  float shift = mix(0.4, 0.45, gPf);                            // the horizon sits this far below the middle
  gYaw = radians(mix(30.0, 6.0, gPf));
  gFw = vec2(sin(gYaw), cos(gYaw));
  gRt = vec2(cos(gYaw), -sin(gYaw));
  gCam = vec3(-40.0, 4.0, -330.0);
  gPx = 2.0 / uRes.y / gL;
  gVS = 1.0;
  vec2 a = vec2(uv.x, uv.y + shift) / gL;

  // the beat: a pulse along the span, the beacons and the ferry's lights
  float on = uAudioActive * uPunch * step(uBeatAge, 0.45);
  float run = clamp(uBeatAge / 0.4, 0.0, 1.0);
  gPulse = on * (1.0 - ss(0.25, 0.45, uBeatAge));
  gPulseS = mix(run, 1.0 - run, mod(uBeatCount, 2.0)) * SPAN;
  gFlash = on * exp(-uBeatAge * 9.0);

  // where things stand for this frame's shape
  gMosD = mix(92.0, 104.0, gPf);
  gMosX0 = mix(-1.18, -0.15, gPf) / gL * gMosD;
  gHillD = 380.0;
  gHillXE = proj(vec3(0.0, 0.0, -HALFW), gCam).x * gHillD;
  gGullD = gMosD * 0.62;
  gGullX0 = (mix(-1.18, -0.15, gPf) + mix(0.42, 0.12, gPf)) / gL * gGullD;
  gFerryZ = mix(-170.0, 120.0, gPf);
  float fLen = mix(1050.0, 520.0, gPf), fFrom = mix(900.0, 300.0, gPf);
  gFerryX = fFrom - mod(uTime * 6.5 + mix(260.0, 120.0, gPf), fLen);

  vec3 col;
  if (a.y < 0.0) col = water(a);
  else col = skyCol(a, false);
  col = layers(a, gCam, col, gPx, false);
  col = gulls(a, gCam, col, gPx);
  col += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'bosphorus',
  name: 'Bosphorus',
  group: 'Vibe',
  blurb: 'A summer night off Ortaköy: the floodlit mosque, the bridge whose LED hangers play the spectrum, and every light drawn down into the strait',
  tags: ['turkish', 'city', 'night', 'water'],
  energy: 0.4,
  particles: 0,
  trails: 0,
  zoom: 1,
  spin: 0,
  frag,
};
