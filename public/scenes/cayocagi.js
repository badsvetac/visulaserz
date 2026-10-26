import { SCULPT } from '../js/gfx/scene-kit.js';

// ÇAY OCAĞI — a rainy night in an old Istanbul tea house, the way a lofi loop paints it: on the
// wooden table by the window stands a tulip-waisted tea glass (ince belli bardak) of deep red-amber
// tea on a white saucer with a red ring and a gold rim, a sugar cube and a little spoon beside it.
// The lamp hangs behind it, so the tea glows from inside as the light comes through, and throws a
// red-amber caustic onto the saucer in front; steam curls up from the glass. Behind it, the window
// is beaded with rain: drops sit on the pane, each one a tiny lens holding the street upside down,
// and now and then one slides down leaving a wet trail through the mist. Through the glass the
// street is all out of focus: neon signs and street lamps as soft hexagonal bokeh, the facades
// opposite with a few lit windows, the wet road mirroring everything, rain falling through the
// light, someone walking home under a red umbrella, and every so often the old red tram of
// İstiklal sliding past with its windows lit.
//
// Music, quietly: the steam swirls with the mids; every bokeh light follows its own band of the
// spectrum, from the low street lamp to the high neon; the bass warms the glow through the tea and
// its caustic; the highs make the raindrops catch the light; on some beats (about one in four) a
// drop races down the pane, and on others (about one in five) the clink of a spoon flashes as a
// glint on the rim of the glass, each gone within the beat.
const frag = `${SCULPT}
float gPx, gAsp, gT, gXR;
vec2 gG;                       // the foot of the tea glass
float gR, gH;                  // its rim half-width and its height
float gRun, gClink;            // the beat: the age of a racing drop (-1 when none), the glint
float gRunGlow;                // this pixel is on the racing drop or its fresh trail
float gLvl[14];                // how bright each bokeh light is right now

// the street lights out of focus: x (times the frame's half-width), y, radius, the band it follows
const vec4 BOK[14] = vec4[14](
  vec4(-0.86, 0.46, 0.070, 0.10), vec4(-0.80, 0.30, 0.058, 0.16), vec4(-0.84, 0.14, 0.062, 0.22),
  vec4(-0.46, 0.64, 0.090, 0.30), vec4(-0.28, 0.03, 0.105, 0.03), vec4(-0.06, 0.44, 0.060, 0.42),
  vec4(0.12, 0.76, 0.080, 0.52), vec4(0.30, 0.27, 0.070, 0.60), vec4(0.54, 0.57, 0.100, 0.68),
  vec4(0.66, 0.06, 0.050, 0.76), vec4(0.84, 0.38, 0.080, 0.84), vec4(0.97, 0.72, 0.060, 0.92),
  vec4(-0.62, -0.04, 0.045, 0.36), vec4(0.40, -0.07, 0.042, 0.48));
const vec3 BCOL[14] = vec3[14](
  vec3(1.0, 0.16, 0.42), vec3(1.0, 0.16, 0.42), vec3(1.0, 0.2, 0.5),
  vec3(0.12, 0.7, 1.0), vec3(1.0, 0.5, 0.14), vec3(0.15, 0.95, 0.6),
  vec3(0.55, 0.3, 1.0), vec3(1.0, 0.12, 0.08), vec3(0.15, 0.75, 1.0),
  vec3(1.0, 0.85, 0.6), vec3(1.0, 0.2, 0.55), vec3(1.0, 0.6, 0.15),
  vec3(1.0, 0.1, 0.06), vec3(1.0, 0.62, 0.2));

// the light in the tea, as a gradient map: almost black at the walls, crimson, red, amber, gold
vec3 teaRamp(float v) {
  vec3 c = mix(vec3(0.025, 0.004, 0.003), vec3(0.2, 0.02, 0.012), ss(0.0, 0.3, v));
  c = mix(c, vec3(0.55, 0.08, 0.02), ss(0.25, 0.55, v));
  c = mix(c, vec3(1.05, 0.34, 0.05), ss(0.5, 0.82, v));
  return mix(c, vec3(1.5, 0.85, 0.35), ss(0.82, 1.0, v));
}
// old walnut, from the dark to where the lamp lies on it
vec3 woodRamp(float v) {
  vec3 c = mix(vec3(0.012, 0.007, 0.006), vec3(0.07, 0.032, 0.016), ss(0.0, 0.3, v));
  c = mix(c, vec3(0.22, 0.1, 0.04), ss(0.25, 0.6, v));
  return mix(c, vec3(0.6, 0.32, 0.13), ss(0.6, 1.0, v));
}
// porcelain: cool in the shadow, cream in the lamp
vec3 chinaRamp(float v) {
  vec3 c = mix(vec3(0.04, 0.045, 0.07), vec3(0.18, 0.17, 0.2), ss(0.0, 0.3, v));
  c = mix(c, vec3(0.5, 0.42, 0.34), ss(0.25, 0.6, v));
  return mix(c, vec3(0.92, 0.78, 0.6), ss(0.6, 1.0, v));
}
// the half-width of the glass at height y (0 at the foot, 1 at the rim), in rim half-widths:
// a round belly, a narrow waist, then the tulip flaring out to the lip
float prof(float y) {
  if (y < 0.42) { float s = (0.42 - y) / 0.42; return 0.62 + 0.13 * (1.0 - cos(PI * s / 0.7)); }
  float s = (y - 0.42) / 0.58;
  return 0.62 + 0.27 * pow(s, 1.35) + 0.11 * pow(s, 6.0);
}
float rbox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float hexd(vec2 d) { d = abs(d); return max(d.x * 0.866 + d.y * 0.5, d.y); }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }

// the street through the window, all out of focus; blur < 1 is sharper (inside a raindrop's lens)
vec3 street(vec2 p, float blur) {
  float roadY = -0.15;
  vec3 c = mix(vec3(0.04, 0.032, 0.075), vec3(0.008, 0.012, 0.035), ss(0.05, 1.0, p.y));   // the city's glow in the low cloud
  // the facades across the street, and a few windows still lit
  float bid = floor(p.x / 0.62 + 0.3);
  float roof = 0.6 + 0.32 * hash11(bid * 4.1 + 2.0);
  float fac = ss(roof + 0.04 * blur, roof - 0.04 * blur, p.y);
  float bx = fract(p.x / 0.62 + 0.3);
  fac *= 1.0 - 0.35 * ss(0.06, 0.0, min(bx, 1.0 - bx));
  vec3 facade = vec3(0.02, 0.018, 0.03) + vec3(0.075, 0.042, 0.022) * ss(0.4, -0.15, p.y);
  c = mix(c, facade, fac);
  float colx = floor(p.x / 0.2);
  vec2 wg = vec2(p.x / 0.2, (p.y - 0.08 - 0.07 * hash11(colx * 2.3)) / 0.2);
  vec2 wid = floor(wg);
  float wh = hash21(wid + 13.0);
  if (wh < 0.2 && p.y > 0.06 && wid.y * 0.2 + 0.25 < roof) {
    vec2 wf = (fract(wg) - 0.5) * 0.2 - (vec2(hash21(wid + 2.0), hash21(wid + 5.0)) - 0.5) * 0.06;
    vec2 ws = vec2(0.022, 0.034) * (0.8 + 0.5 * hash21(wid + 9.0));
    float m = ss(0.035 * blur + 0.004, -0.02, rbox(wf, ws, 0.01));
    vec3 wc = wh < 0.14 ? vec3(0.55, 0.32, 0.12) : vec3(0.2, 0.32, 0.55) * (0.8 + 0.2 * sin(uTime * 3.0 + wh * 50.0));
    c += wc * m * (0.18 + 0.2 * hash21(wid + 7.0));
  }
  // the neon and the street lamps, each a soft hexagon of light, mirrored in the wet road
  bool road = p.y < roadY;
  for (int i = 0; i < 14; i++) {
    vec4 b = BOK[i];
    vec2 cc = vec2(b.x * gXR, b.y);
    vec2 d = p - cc;
    float r = b.z;
    float dist = mix(length(d), hexd(d), 0.35);
    float soft = r * 0.07 * blur + gPx;
    float m = ss(r + soft, r - soft, dist);
    float ring = 0.74 + 0.36 * ss(r * 0.5, r, dist);       // a real lens leaves the rim of the bokeh brighter
    c += BCOL[i] * gLvl[i] * m * ring;
    c += BCOL[i] * gLvl[i] * 0.08 * exp(-dist / (r * 1.6));   // the haze of rain around every light
    if (road) {
      vec2 rd = (p - vec2(cc.x, roadY - (cc.y - roadY) * 0.25)) / vec2(r * 0.85, r * 3.2);
      c += BCOL[i] * gLvl[i] * 0.32 * exp(-dot(rd, rd) * 1.6) * (0.75 + 0.25 * sin(p.y * 160.0 + p.x * 9.0));
    }
  }
  // the old red tram of İstiklal sliding past, its windows lit
  float tp = fract((uTime + 3.6) / 36.0);
  if (tp < 0.45) {
    float tx = mix(gAsp + 1.0, -gAsp - 2.6, tp / 0.45);
    vec2 tq = p - vec2(tx, roadY);
    if (tq.x > -0.15 && tq.x < 1.75 && tq.y < 0.4) {
      float body = ss(0.025 * blur + gPx, -0.025 * blur, rbox(tq - vec2(0.8, 0.13), vec2(0.8, 0.12), 0.05));
      vec3 bc = mix(vec3(0.3, 0.03, 0.03), vec3(0.16, 0.12, 0.09), ss(0.075, 0.055, tq.y));
      c = mix(c, bc, body * 0.94);
      float wi = floor((tq.x - 0.1) / 0.2);
      if (wi >= 0.0 && wi < 7.0) {
        vec2 wf = vec2(fract((tq.x - 0.1) / 0.2) * 0.2 - 0.1, tq.y - 0.16);
        c += vec3(0.95, 0.6, 0.26) * 0.5 * ss(0.035 * blur + 0.003, -0.02, rbox(wf, vec2(0.06, 0.045), 0.02));
      }
      c += vec3(1.0, 0.72, 0.25) * 0.7 * ss(0.012 * blur + 0.002, -0.006, rbox(tq - vec2(0.12, 0.275), vec2(0.07, 0.018), 0.006));
      c += vec3(1.0, 0.95, 0.82) * 0.95 * ss(0.03 + 0.01 * blur, 0.03 - 0.01 * blur, length(tq - vec2(0.04, 0.045)));
      c += vec3(1.0, 0.9, 0.75) * 0.12 * exp(-length(tq - vec2(0.04, 0.045)) * 9.0);
    }
    if (road && tq.x > -0.2 && tq.x < 1.7) {
      float lit = (0.55 + 0.45 * cos((tq.x - 0.2) / 0.2 * 2.0 * PI)) * ss(0.0, 0.15, tq.x) * ss(1.6, 1.4, tq.x);
      c += vec3(0.95, 0.6, 0.28) * lit * 0.2 * exp(tq.y * 7.0);
      c += vec3(1.0, 0.95, 0.82) * 0.35 * exp(-abs(tq.x - 0.04) * 22.0) * exp(tq.y * 5.0);
    }
  }
  // someone walking home under a red umbrella
  {
    float wx = mod(uTime * 0.055 + 4.97, 5.0) - 2.5;
    vec2 wq = p - vec2(wx, -0.215);
    if (abs(wq.x) < 0.2 && wq.y < 0.42 && wq.y > -0.06) {
      float sb = 0.012 * blur + gPx;
      float step2 = sin(uTime * 0.055 * 70.0);
      float bodyD = rbox(wq - vec2(0.0, 0.15), vec2(0.045, 0.11), 0.03);
      float legs = min(rbox(wq - vec2(0.012 * step2, 0.02), vec2(0.009, 0.05), 0.006), rbox(wq - vec2(-0.012 * step2, 0.02), vec2(0.009, 0.05), 0.006));
      vec2 uq = (wq - vec2(0.0, 0.3)) / vec2(0.13, 0.075);
      float umb = max(length(uq) - 1.0, -uq.y * 0.6) * 0.075;
      float fig = ss(sb, -sb, min(min(bodyD, legs), umb));
      vec3 fc = vec3(0.012, 0.012, 0.02);
      float onUmb = ss(sb, -sb, umb);
      fc = mix(fc, vec3(0.07, 0.008, 0.014) + vec3(0.55, 0.12, 0.2) * ss(0.75, 1.0, length(uq)) * ss(0.0, 0.8, uq.y) * min(blur, 1.0), onUmb);
      c = mix(c, fc, fig * 0.93);
    }
    if (road) {
      vec2 rq = (p - vec2(wx, -0.24)) / vec2(0.05, 0.08);
      c *= 1.0 - 0.5 * exp(-dot(rq, rq));
    }
  }
  if (road) {
    c = mix(c, vec3(0.012, 0.013, 0.025) + c * 0.75, 0.5);
    c += vec3(0.05, 0.035, 0.02) * ss(roadY, roadY - 0.04, p.y) * ss(roadY - 0.12, roadY - 0.04, p.y);   // the kerb catching the lamps
  }
  // rain falling through the light out there
  {
    vec2 rq = vec2(p.x * 1.0 + p.y * 0.12, p.y);
    float cid = floor(rq.x / 0.011);
    float h = hash11(cid * 1.7);
    float y = fract(rq.y * 0.9 + uTime * (1.6 + h) + h * 9.0);
    float streak = ss(0.0, 0.02, y) * ss(0.09, 0.03, y) * ss(0.0045, 0.0015, abs(fract(rq.x / 0.011) - 0.5) * 0.011) * step(h, 0.4);
    float lum = dot(c, vec3(0.3, 0.5, 0.2));
    c += vec3(0.7, 0.75, 0.85) * streak * (0.03 + 0.5 * lum) * min(blur, 1.0);
  }
  return c;
}

// one layer of drops sitting on the pane, one per cell at most: local coords in the drop and its radius
vec3 dropLayer(vec2 p, float cell, float prob, float rMin, float rMax, float seed) {
  vec2 g = p / cell, id = floor(g), f = fract(g) - 0.5;
  float h = hash21(id + seed);
  if (h > prob) return vec3(0.0);
  float r = mix(rMin, rMax, pow(hash21(id + seed + 3.7), 2.0));
  float life = fract(uTime * 0.025 * (0.5 + hash21(id + seed + 1.3)) + h * 13.0);   // rain lands, the drop grows, dries
  r *= ss(0.0, 0.06, life) * ss(1.0, 0.9, life);
  if (r < 0.02) return vec3(0.0);
  vec2 off = (vec2(hash21(id + seed + 5.1), hash21(id + seed + 8.3)) - 0.5) * (0.9 - 2.6 * r);
  vec2 d = f - off;
  d.y *= d.y > 0.0 ? 0.82 : 1.0;          // the drops sag: a little longer above, round below
  vec2 q = d / r;
  if (dot(q, q) >= 1.0) return vec3(0.0);
  return vec3(q, r * cell);
}
float wob(float y, float h) { return 0.011 * sin(y * 13.0 + h * 40.0) + 0.006 * sin(y * 31.0 + h * 17.0) + 0.0025 * sin(y * 71.0 + h * 5.0); }
// the drops that slide down the pane, and the wet trail behind them that has wiped the mist away
vec3 runners(vec2 p, out float trail, out float clear) {
  trail = 0.0;
  clear = 0.0;
  vec3 res = vec3(0.0);
  const float CW = 0.13;
  float id = floor(p.x / CW);
  float h = hash11(id * 3.7 + 1.1);
  if (h < 0.5) {
    float per = 10.0 + 10.0 * hash11(id * 1.3 + 4.0);
    float ph = fract(uTime / per + h * 7.0);
    float k = ph + 0.035 * sin(ph * PI * 12.0);            // it stalls and slips as it runs
    float y0 = 1.05, y1 = -0.45, yh = mix(y0, y1, k);
    float cx = (id + 0.25 + 0.5 * hash11(id * 5.1)) * CW;
    float rr = 0.009 + 0.006 * hash11(id * 9.1);
    vec2 d = p - vec2(cx + wob(yh, h), yh);
    d.y *= d.y > 0.0 ? 0.62 : 1.0;
    if (dot(d, d) < rr * rr) res = vec3(d / rr, rr);
    if (p.y > yh && p.y < y0) {
      float dx = abs(p.x - cx - wob(p.y, h));
      float age = (p.y - yh) / (y0 - y1) * per;             // seconds since the drop passed here
      float fade = exp(-age * 0.25);
      trail = ss(0.003, 0.001, dx) * fade;
      clear = ss(0.014, 0.005, dx) * exp(-age * 0.06);
      float cy = floor(p.y / 0.028);
      float hh = hash11(cy * 7.1 + id * 3.0);
      if (hh < 0.4 && res.z == 0.0) {
        float r2 = (0.0022 + 0.0022 * hash11(cy + id * 1.9)) * (0.4 + 0.6 * fade);
        vec2 dd = vec2(p.x - cx - wob((cy + 0.5) * 0.028, h), p.y - (cy + 0.5) * 0.028);
        if (dot(dd, dd) < r2 * r2) res = vec3(dd / r2, r2);
      }
    }
  }
  // on some beats a drop races down the pane, gone within the beat
  if (gRun >= 0.0) {
    float n = uBeatCount;
    float cx = (hash11(n * 3.3) - 0.5) * 1.7 * gAsp;
    float yh = mix(0.95, -0.4, ss(0.0, 0.36, gRun));
    float rr = 0.016;
    float f = ss(0.45, 0.3, gRun) * uPunch;
    vec2 d = p - vec2(cx + wob(yh, n), yh);
    d.y *= d.y > 0.0 ? 0.45 : 1.0;
    if (dot(d, d) < rr * rr) { res = vec3(d / rr, rr); gRunGlow = 0.3 * f; }
    gRunGlow = max(gRunGlow, exp(-dot(d, d) / (rr * rr * 4.0)) * 0.5 * f);
    if (p.y > yh && p.y < 0.95) {
      float dx = abs(p.x - cx - wob(p.y, n));
      float tf = f * exp(-(p.y - yh) * 2.5);
      trail = max(trail, ss(0.005, 0.0015, dx) * f);
      gRunGlow = max(gRunGlow, ss(0.005, 0.001, dx) * tf);
      clear = max(clear, ss(0.018, 0.006, dx) * f);
    }
  }
  return res;
}
// the dark wood of the window frame
vec3 frameWood(vec2 p, vec2 along, float edge, float warm) {
  float g = fbm(vec2(dot(p, along) * 3.0, dot(p, vec2(-along.y, along.x)) * 60.0));
  vec3 c = woodRamp(0.12 + 0.1 * g + 0.25 * warm);
  return c + vec3(0.2, 0.28, 0.42) * edge * 0.35;
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gT = uCruise;
  gXR = max(gAsp, 0.62) * 0.95;
  float sc = mix(0.8, 1.0, ss(0.6, 1.5, gAsp));
  gR = 0.215 * sc;
  gH = 0.84 * sc;
  gG = vec2(gAsp * 0.22, -0.78);
  for (int i = 0; i < 14; i++) {
    float fl = i == 1 ? mix(0.35, 1.0, step(0.06, fract(sin(floor(uTime * 9.0) * 12.9898) * 43758.5))) : 1.0;   // one tube is failing
    gLvl[i] = (0.3 + 0.12 * hash11(float(i) * 3.3 + 0.7)) * fl + 0.62 * band(BOK[i].w);
  }
  gRun = -1.0;
  gRunGlow = 0.0;
  gClink = 0.0;
  if (uAudioActive > 0.5 && uBeatAge < 0.45) {
    float bh = hash11(uBeatCount * 7.7 + 0.3);
    if (bh < 0.25) gRun = uBeatAge;
    else if (bh < 0.45) gClink = exp(-uBeatAge * 10.0) * ss(0.45, 0.3, uBeatAge) * uPunch;
  }
  float sillTop = -0.36, railBot = -0.43, tableY = -0.5;
  float mx = -max(gAsp * 0.44, 0.34), ty = 0.74;
  vec2 lampR = vec2(mx - 0.13, 0.52);                        // where the lamp's reflection sits in the pane
  vec3 col;

  if (uv.y > sillTop) {
    // the window: drops on the pane, mist, and the street through it
    float trail, clear;
    vec3 dr = runners(uv, trail, clear);
    float big = 0.0;
    if (dr.z == 0.0) {
      dr = dropLayer(uv, 0.085, 0.42, 0.12, 0.34, 1.0);
      if (dr.z > 0.0 && clear > 0.4) dr = vec3(0.0);
      big = dr.z;
    }
    if (dr.z == 0.0 && clear < 0.5) dr = dropLayer(uv + 0.37, 0.024, 0.6, 0.1, 0.3, 7.0);
    float fog = (0.18 + 0.4 * ss(0.15, -0.3, uv.y)) * (0.6 + 0.4 * fbm(uv * 3.0 + 2.0)) * (1.0 - clear);
    vec2 q = dr.xy;
    float inDrop = step(1e-5, dr.z);
    float qq = dot(q, q);
    vec2 sp = uv - q * dr.z - q * 0.1 * ss(0.0, 0.012, dr.z) * inDrop;   // a drop holds a wide view, upside down
    sp.x += trail * 0.004;
    col = street(sp, mix(1.0 + fog * 1.5, 0.35, inDrop));
    // the mist on the inside of the pane, lit warm by the room
    col = mix(col, col * 0.7 + vec3(0.06, 0.045, 0.04) + 0.12 * vec3(0.2, 0.12, 0.05) * exp(-length(uv - lampR)), fog * (1.0 - inDrop) * 0.75);
    if (inDrop > 0.0) {
      float l = sqrt(qq);
      col *= mix(1.0, 0.4, ss(0.55, 1.0, l));                              // the dark rim of a lens
      col += col * 1.6 * ss(0.4, 0.85, l) * ss(0.1, -0.7, q.y) + vec3(0.05, 0.04, 0.035);           // the light it gathers at the bottom
      float tw = 0.5 + 0.5 * sin(uTime * 7.0 + dot(floor(uv / 0.03), vec2(3.1, 7.7)));
      float glint = exp(-dot(q - vec2(-0.32, 0.42), q - vec2(-0.32, 0.42)) * 22.0);
      col += vec3(1.0, 0.82, 0.6) * glint * (0.18 + 1.5 * gHigh * tw) * ss(0.003, 0.012, dr.z);
      col += vec3(0.7, 0.85, 1.0) * gHigh * 0.25 * ss(0.75, 1.0, l) * ss(0.0, 0.6, q.y);
    }
    col += vec3(0.6, 0.7, 0.85) * trail * 0.12 + vec3(0.85, 0.9, 1.0) * gRunGlow * 0.55;
    // the room reflected faintly in the pane: the lamp, and the warm air
    float lr = length(uv - lampR);
    col += vec3(0.3, 0.16, 0.06) * exp(-lr * 5.0) + vec3(0.025, 0.015, 0.008);
    col += vec3(1.0, 0.62, 0.3) * 0.5 * ss(0.062, 0.05, mix(lr, hexd(uv - lampR), 0.35)) * (0.8 + 0.25 * ss(0.03, 0.06, lr));
    // the frame: a mullion, a transom
    float dm = abs(uv.x - mx) - 0.03, dt = abs(uv.y - ty) - 0.028;
    float fd = min(dm, dt);
    if (fd < gPx) {
      vec2 along = dm < dt ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
      float e = ss(-0.008, 0.0, fd);
      vec3 w = frameWood(uv, along, e, 0.6 * exp(-length(uv - vec2(mx, 0.2)) * 1.5));
      col = mix(col, w, ss(gPx, -gPx, fd));
    }
    // the bottom rail of the window, where the water gathers
    col = mix(col, col * 0.5, ss(sillTop + 0.03, sillTop, uv.y));
  } else if (uv.y > railBot) {
    // the bottom rail of the frame
    col = frameWood(uv, vec2(1.0, 0.0), ss(railBot + 0.01, railBot, uv.y), 0.4 * exp(-abs(uv.x - gG.x + 0.3) * 1.5));
    col += vec3(0.25, 0.3, 0.42) * 0.25 * ss(sillTop - 0.012, sillTop, uv.y);   // its top edge catching the street
    col = mix(col, col * 0.4, ss(railBot + 0.025, railBot, uv.y));
  } else if (uv.y > tableY) {
    // the sill, painted long ago
    col = vec3(0.05, 0.035, 0.03) * (0.8 + 0.3 * fbm(uv * vec2(4.0, 30.0)));
    col += vec3(0.18, 0.1, 0.045) * exp(-abs(uv.x - gG.x + 0.25) * 1.8) * 0.6;
    col *= mix(0.5, 1.0, ss(tableY, railBot, uv.y));
  } else {
    // the table: old planks, varnished, the lamp lying on them and the window shining in them
    float d = tableY - uv.y;
    float wz = 1.0 / (0.22 + d);
    float wx = uv.x * wz * 0.35;
    float seamV = fract(wz * 0.55);
    float grain = noise(vec2(wx * 1.6, wz * 26.0 + noise(vec2(wx * 0.8, wz * 3.0)) * 4.0));
    grain = 0.6 * grain + 0.4 * noise(vec2(wx * 5.0, wz * 70.0));
    float pool = exp(-length((uv - vec2(gG.x - 0.15, tableY - 0.1)) * vec2(0.55, 1.6)) * 1.6);
    float v = 0.1 + 0.14 * grain + 0.62 * pool + 0.1 * ss(0.15, 0.0, d);
    col = woodRamp(v);
    col *= mix(1.0, 0.35, ss(0.035, 0.0, seamV) + ss(0.965, 1.0, seamV));
    // the window and its lights in the varnish
    vec3 refl = vec3(0.03, 0.045, 0.08);
    for (int i = 0; i < 14; i++) {
      float dx = uv.x - BOK[i].x * gXR;
      refl += BCOL[i] * gLvl[i] * 0.08 * exp(-dx * dx / (BOK[i].z * BOK[i].z * 3.0));
    }
    col += refl * exp(-d * 5.0) * (0.6 + 0.4 * grain);
    col += vec3(0.07, 0.09, 0.14) * exp(-d * 18.0);
    col += vec3(0.5, 0.28, 0.1) * exp(-pow((uv.x - lampR.x - 0.1) / 0.3, 2.0) - pow((d - 0.05) / 0.05, 2.0)) * (0.7 + 0.3 * grain);
  }

  // the light coming through the tea, focused onto what lies in front of the glass
  vec2 cc = (uv - (gG + vec2(gR * 0.75, -gR * 0.4))) / vec2(gR * 0.95, gR * 0.26);
  float caus = exp(-dot(cc, cc) * 1.6) * 0.8 + exp(-pow(cc.y - 0.45 * cc.x * cc.x + 0.15, 2.0) * 50.0) * exp(-cc.x * cc.x * 1.6) * 1.1;
  vec3 causC = vec3(1.3, 0.42, 0.08) * caus * (0.5 + 0.8 * gBass);
  float Rs = gR * 2.25, es = 0.24;
  vec2 S = gG + vec2(0.0, 0.004);
  if (uv.y < tableY) {
    // the saucer's soft shadow, and the caustic where it spills onto the table
    vec2 sd = (uv - S - vec2(0.03, -0.022)) / vec2(Rs * 1.06, Rs * es * 1.5);
    col *= mix(1.0, 0.4, ss(1.15, 0.7, length(sd)));
    col += causC * 0.35 * woodRamp(0.6) * 2.0;
  }
  // the saucer: white porcelain, a red ring, a gold rim
  {
    vec2 sq = (uv - S) / vec2(Rs, Rs * es);
    float rho = length(sq);
    vec2 sq2 = (uv - S + vec2(0.0, 0.016)) / vec2(Rs * 0.97, Rs * es * 0.97);
    float rho2 = length(sq2);
    float aa = gPx / (Rs * es);
    if (rho < 1.0 + aa * 2.0 || (rho2 < 1.0 + aa * 2.0 && uv.y < S.y)) {
      float back = ss(-1.0, 1.0, sq.y), left = ss(1.0, -1.0, sq.x);
      float lip = ss(0.78, 0.92, rho) * ss(1.0, 0.94, rho);                 // the raised lip, its inside towards us
      float well = ss(0.5, 0.56, rho) * ss(0.66, 0.56, rho);                 // the step where the well begins
      float v = 0.36 + 0.22 * back + 0.12 * left + 0.25 * lip * back - 0.1 * ss(0.3, 0.7, rho) * ss(0.95, 0.7, rho) - 0.12 * well * clamp(sq.y * 3.0, -1.0, 1.0);
      vec3 top = chinaRamp(v);
      // the glass's coloured shadow, its contact, and the tea's glow around the foot
      vec2 gd = (uv - (gG + vec2(gR * 0.4, -gR * 0.2))) / vec2(gR * 1.0, gR * 0.3);
      top *= mix(1.0, 0.45, exp(-dot(gd, gd) * 1.5) * 0.7);
      top *= mix(vec3(1.0), vec3(0.85, 0.45, 0.4), exp(-dot(gd, gd) * 1.5));
      vec2 fd = (uv - gG) / vec2(gR * 0.82, gR * 0.82 * 0.2);
      top *= mix(0.25, 1.0, ss(0.9, 1.5, length(fd)));
      top += vec3(0.6, 0.12, 0.03) * exp(-max(length(fd) - 1.0, 0.0) * 1.5) * 0.25 * (0.6 + 0.6 * gBass);
      top += causC * 0.9;
      top = mix(top, vec3(0.42, 0.04, 0.035) * (0.4 + 0.9 * back), ss(0.835, 0.85, rho) * ss(0.885, 0.87, rho));
      float gold = ss(0.955, 0.97, rho);
      top = mix(top, vec3(0.75, 0.45, 0.14) * (0.35 + 0.8 * back) + vec3(1.0, 0.75, 0.4) * pow(max(sq.y, 0.0), 4.0) * 0.6, gold);
      // the side of the saucer below its front edge
      vec3 side = chinaRamp(0.18 + 0.12 * left) + vec3(0.1, 0.13, 0.2) * 0.25;
      side = mix(side, vec3(0.5, 0.3, 0.1), ss(0.012, 0.0, abs(rho - 1.0) * Rs * es) * 0.8);
      vec3 sc2 = rho < 1.0 ? top : side;
      float a = max(ss(1.0 + aa, 1.0 - aa, rho), ss(1.0 + aa, 1.0 - aa, rho2) * step(uv.y, S.y));
      col = mix(col, sc2, a);
    }
  }
  // a sugar cube on the saucer, behind and to the right
  {
    vec2 c = S + vec2(Rs * 0.66, Rs * es * 0.3);
    float s = gR * 0.24;
    vec2 p = uv - c;
    p.x -= p.y * 0.25;
    float dCube = rbox(p, vec2(s, s * 1.05), s * 0.18);
    if (dCube < gPx * 2.0) {
      float topF = ss(s * 0.25, s * 0.4, p.y);
      float grain = hash21(floor(uv * uRes.y * 0.5));
      vec3 cu = mix(vec3(0.42, 0.36, 0.33), vec3(0.85, 0.74, 0.6), topF);
      cu += vec3(0.25, 0.1, 0.05) * ss(s, -s, p.x) * (1.0 - topF);                // the lamp shining through the sugar
      cu *= 0.85 + 0.3 * grain;
      cu += vec3(1.0, 0.9, 0.7) * step(0.985, grain) * (0.15 + 1.2 * gHigh);
      col = mix(col, cu, ss(gPx, -gPx, dCube));
    }
  }
  // the little spoon lying on the saucer
  {
    vec2 B = S + vec2(-Rs * 0.46, -Rs * es * 0.38);
    vec2 dir = normalize(vec2(-1.0, -0.24)), nrm = vec2(-dir.y, dir.x);
    vec2 p = uv - B;
    vec2 lp = vec2(dot(p, dir), dot(p, nrm));
    float bowl = length(lp / vec2(gR * 0.32, gR * 0.15)) - 1.0;
    float t = clamp((lp.x - gR * 0.2) / (gR * 1.2), 0.0, 1.0);
    float hd = seg(lp, vec2(gR * 0.2, 0.0), vec2(gR * 1.4, gR * 0.03)) - gR * mix(0.03, 0.075, t * t);
    float dSp = min(bowl * gR * 0.13, hd);
    if (dSp < gPx * 2.0) {
      vec3 st = vec3(0.07, 0.075, 0.09);
      float inBowl = ss(0.0, -0.3, bowl);
      st += vec3(0.25, 0.32, 0.45) * 0.5 * ss(0.2, -0.8, lp.y / (gR * 0.15)) * inBowl;            // the window in the bowl
      st += vec3(1.1, 0.75, 0.42) * exp(-pow(lp.y / (gR * 0.15) - 0.45, 2.0) * 10.0) * inBowl * 0.6;
      float hc = (lp.y - gR * 0.012 - gR * 0.02 * t) / (gR * mix(0.03, 0.075, t * t));
      st += vec3(1.0, 0.72, 0.45) * exp(-hc * hc * 6.0) * (1.0 - inBowl) * 0.55 * (1.0 + 2.0 * gClink);
      col = mix(col * 0.6, st, ss(gPx, -gPx, dSp));
    }
  }
  // the tea glass
  {
    vec2 gq = vec2((uv.x - gG.x) / gR, (uv.y - gG.y) / gH);
    if (abs(gq.x) < 1.08 && gq.y > -0.15 && gq.y < 1.15) {
      float ex = 0.2 * gR / gH;
      float r = prof(clamp(gq.y, 0.0, 1.0));
      float xn = clamp(gq.x / r, -1.0, 1.0);
      float nz = sqrt(1.0 - xn * xn);
      float lv = gq.y + ex * r * nz;                                     // which level of the glass this bit of its front is
      float r0 = prof(0.0);
      float botArc = -ex * r0 * sqrt(max(1.0 - gq.x * gq.x / (r0 * r0), 0.0));
      float topArc = 1.0 + ex * sqrt(max(1.0 - gq.x * gq.x, 0.0));
      float D = min((r - abs(gq.x)) * gR, min((gq.y - botArc) * gH, (topArc - gq.y) * gH));
      if (D > -gPx * 2.0) {
        float L = 0.82, rL = prof(L);
        float teaBack = L + ex * rL * sqrt(max(1.0 - gq.x * gq.x / (rL * rL), 0.0));
        float aL = gPx / gH * 1.2;
        float edgeW = ss(0.8, 0.97, abs(xn));
        // the thick foot, full of the tea's light
        float fy = clamp(lv / 0.07, 0.0, 1.0);
        vec3 g = col * 0.45 + teaRamp(0.45 + 0.3 * nz * fy + 0.12 * gBass) * (0.25 + 0.35 * fy);
        g += vec3(1.0, 0.8, 0.6) * exp(-pow((xn + 0.35) / 0.12, 2.0)) * 0.25;
        g *= mix(1.0, 0.5, edgeW);
        if (lv > 0.07 - aL) {
          vec3 gTea = vec3(0.0);
          if (lv < L + aL) {
            // the tea, lit from behind: brightest where the belly and the cone focus the lamp
            float core = exp(-pow(xn - 0.28, 2.0) / 0.13) * exp(-pow(lv - 0.24, 2.0) / 0.025);
            core += 0.7 * exp(-pow(xn - 0.34, 2.0) / 0.05) * ss(0.4, 0.66, lv) * ss(0.84, 0.66, lv);
            float waist = exp(-pow(lv - 0.42, 2.0) / 0.01);
            float v = 0.16 + 0.26 * nz + core * (0.4 + 0.16 * gBass) + 0.12 * gBass * nz - 0.08 * waist;
            v += (fbm(vec2(xn * 3.0, lv * 5.0 - gT * 0.05)) - 0.5) * 0.08;   // the tea moving slowly in the glass
            gTea = teaRamp(clamp(v, 0.0, 0.9));
            // the street seen through the tea, upside down and red
            vec3 bgT = street(vec2(gG.x - xn * 0.38, 0.08 + (lv - 0.4) * 0.45), 2.2);
            gTea += bgT * vec3(0.9, 0.22, 0.05) * 0.55 * nz;
            gTea *= mix(1.0, 0.35, edgeW);
            // the glass wall itself, a clear margin round the tea
            float wall = ss(0.9, 0.955, abs(xn));
            gTea = mix(gTea, col * 0.55 + teaRamp(0.4) * 0.45, wall * 0.85);
          }
          // the empty glass above the tea, misted by the steam, and the opening seen through it
          vec3 gUp = col * vec3(0.85, 0.82, 0.8) + vec3(0.09, 0.07, 0.06) * (0.5 + 0.5 * fbm(uv * 30.0));
          gUp *= mix(1.0, 0.6, edgeW);
          if (lv > L - aL) {
            // the surface of the tea, a dark mirror ringed with light where it meets the glass
            vec2 sv = vec2(gq.x / rL, (gq.y - L) / (ex * rL));
            float sl = length(sv);
            vec3 gS = teaRamp(0.18 + 0.1 * sv.y);
            gS += teaRamp(0.85) * ss(0.78, 0.98, sl) * (0.25 + 0.55 * ss(-0.5, 1.0, sv.y)) * (0.7 + 0.4 * gBass);
            gS += vec3(0.5, 0.36, 0.25) * exp(-dot(sv - vec2(-0.35, 0.35), sv - vec2(-0.35, 0.35)) * 6.0) * 0.18;
            gUp = mix(gUp, gS, ss(teaBack + aL, teaBack - aL, gq.y));
          }
          g = mix(g, mix(gTea, gUp, ss(L - aL, L + aL, lv)), ss(0.07 - aL, 0.07 + aL, lv));
        }
        g += vec3(1.0, 0.85, 0.7) * ss(gPx * 2.5, 0.0, abs(lv - 0.07) * gH) * 0.5;
        // the walls' edges, rimmed warm by the lamp on the left and cool by the street on the right
        float line = ss(0.93, 0.985, abs(xn)) * ss(1.0, 0.985, abs(xn) + 0.004);
        g += (xn < 0.0 ? vec3(1.3, 0.75, 0.38) : vec3(0.35, 0.55, 0.85)) * line * 0.75;
        // the room reflected in the front: a soft warm band and a sharp one
        float fadeTop = ss(0.0, 0.1, lv);
        g += vec3(0.45, 0.38, 0.32) * exp(-pow((xn + 0.6) / 0.07, 2.0)) * 0.22 * fadeTop;
        g += vec3(0.95, 0.9, 0.85) * exp(-pow((xn - 0.6) / 0.025, 2.0)) * 0.4 * fadeTop * ss(0.3, 0.6, abs(lv - 0.42) * 2.0 + 0.3);
        // the rim, front and back
        float rimF = abs(lv - 1.0) * gH;
        float rimB = abs(gq.y - topArc) * gH;
        g += vec3(0.95, 0.88, 0.8) * (ss(gPx * 2.0, 0.0, rimF) * 0.7 + ss(gPx * 2.0, 0.0, rimB) * 0.4) * (0.6 + 0.4 * abs(xn));
        g += vec3(1.0, 0.85, 0.7) * ss(gPx * 2.0, 0.0, abs(gq.y - botArc) * gH) * 0.35;
        col = mix(col, g, ss(-gPx, gPx, D));
      }
    }
  }
  // steam curling up from the tea, lit from behind by the lamp
  {
    float top = gG.y + gH;
    float sy = uv.y - top;
    if (sy > -0.05 && sy < 0.8 && abs(uv.x - gG.x) < 0.5) {
      float h = clamp(sy / 0.75, 0.0, 1.0);
      vec2 p = vec2(uv.x - gG.x, sy);
      float sw = 1.0 + 1.8 * gMid;                                       // the mids stir it
      p.x += sin(sy * 5.0 - gT * 0.7) * 0.05 * h * sw + sin(sy * 11.0 - gT * 1.3 + 2.0) * 0.015 * h * sw;
      p += (vec2(fbm(p * vec2(3.5, 2.2) + vec2(0.0, -gT * 0.3)), fbm(p * vec2(3.5, 2.2) + vec2(5.2, -gT * 0.26))) - 0.5) * (0.03 + 0.16 * h) * sw;
      float w = gR * (0.45 + 1.1 * h);
      float env = exp(-p.x * p.x / (w * w));
      float n = fbm(vec2(p.x * 7.0 / (0.6 + h), p.y * 2.4 - gT * 0.5));
      float ridge = ss(0.55, 1.0, 1.0 - abs(2.0 * n - 1.0));             // thin curling sheets
      float dens = env * (ridge * 1.5 + 0.35 * ss(0.4, 0.7, n));
      dens *= ss(-0.04, 0.08, sy) * ss(0.8, 0.2, sy);
      vec3 sc3 = vec3(0.75, 0.6, 0.48) * (0.36 + 0.2 * gMid) * (0.6 + 0.6 * ss(0.5, 0.0, sy)) + col * 0.6;
      col += sc3 * dens * 0.8;
    }
  }
  // the clink of a spoon: a glint on the rim
  if (gClink > 0.0) {
    vec2 gp = gG + vec2(-gR * 0.55, gH - 0.2 * gR * 0.83);
    vec2 d = uv - gp;
    float star = exp(-abs(d.x) * 160.0) * exp(-abs(d.y) * 14.0) + exp(-abs(d.y) * 160.0) * exp(-abs(d.x) * 14.0);
    star += exp(-length(d) * 45.0) * 0.8;
    col += vec3(1.5, 1.35, 1.1) * star * gClink;
  }
  // the room: dark at the edges, a little grain
  vec2 vq = uv / vec2(max(gAsp, 0.6), 1.0);
  col *= mix(1.0, 0.5, ss(0.35, 1.5, dot(vq, vq)));
  col += (hash21(uv * uRes.y + fract(uTime) * 91.0) - 0.5) * 0.014;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'cayocagi', name: 'Çay Ocağı', group: 'Vibe',
  blurb: 'A rainy night in an old Istanbul tea house: a glowing glass of tea by the window, rain on the pane, neon and a passing tram out of focus beyond',
  tags: ['lofi', 'rain', 'cozy', 'istanbul', 'night', 'warm', 'calm'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
