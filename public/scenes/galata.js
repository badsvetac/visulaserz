import { SCULPT } from '../js/gfx/scene-kit.js';

// GALATA — Istanbul at the blue hour, seen from a rooftop up the hill in Beyoğlu: the Galata Tower
// standing up out of the roofs as the hero, its stone warm in the floodlights, its balcony ring of
// arched windows burning and its conical lead cap dark against a sky that runs from the deep blue
// of the coming night down to a last band of amber where the sun has gone; roofs and little domes
// stepping down the hill in rows to the Golden Horn; across the water the old city in violet
// silhouette, Süleymaniye on its hill under a thin crescent moon, Yeni Cami by the shore, the
// minarets' balconies lit and the hillside pricked with tiny lights; the Galata Bridge running out
// across the water with its lamps, a ferry crossing, gulls wheeling round the tower, windows in the
// houses switching on one by one, and our own roof, its chimney and TV aerial, in the corner.
//
// Music: each arched window in the tower's ring follows its own band, and every house's windows
// follow a band of their own; the bass breathes the warm glow on the water; the highs make the
// far city lights, the bridge lamps and the stars twinkle; on some beats (about one in three) the
// lamp on the tower's spire flashes softly, and on others a flock of gulls lifts off the roofs,
// both gone within the beat.
const frag = `${SCULPT}
float gPx, gAsp, gWL, gTx, gTb, gTs, gLamp, gLiftA, gLiftX, gMs;
vec2 gSun, gMoon;

float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float boxd(vec2 p, vec2 c, vec2 b) { vec2 d = abs(p - c) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
// a dome: the top half of an ellipse standing on c
float dome(vec2 p, vec2 c, vec2 r) { vec2 q = (p - c) / r; return max((length(q) - 1.0) * min(r.x, r.y), c.y - p.y); }

// the sky with no clouds: amber where the sun went down, a rose and violet belt, then blue to night
vec3 skyAt(vec2 uv) {
  float h = uv.y - gWL;
  float sunSide = exp(-abs(uv.x - gSun.x) * 0.85);
  vec3 c = mix(vec3(0.46, 0.17, 0.17), vec3(0.86, 0.38, 0.12), sunSide);
  c = mix(c, mix(vec3(0.3, 0.16, 0.3), vec3(0.56, 0.28, 0.26), sunSide), ss(0.0, 0.13, h));
  c = mix(c, vec3(0.1, 0.13, 0.36), ss(0.08, 0.42, h));
  c = mix(c, vec3(0.032, 0.06, 0.2), ss(0.34, 0.88, h));
  c = mix(c, vec3(0.008, 0.014, 0.065), ss(0.78, 1.3, h));
  vec2 ds = (uv - gSun) * vec2(0.5, 1.5);
  c += vec3(0.7, 0.3, 0.09) * exp(-length(ds) * 3.4) * 0.6;
  return c;
}
// the gentle hills of the old city, and their skyline of houses
float farHill(float x) { return gWL + 0.022 + 0.034 * (0.5 + 0.5 * sin(x * 1.9 + 0.4)) + 0.014 * sin(x * 4.7 + 2.0); }
float farTop(float x) {
  float hill = farHill(x);
  float c = floor(x / 0.016);
  return hill + hash11(c * 1.37 + 0.2) * 0.011;
}
// a minaret at x, h tall, its balconies lit
float minaret(vec2 p, float x, float h, float s, inout float lt) {
  vec2 q = p - vec2(x, 0.0);
  float w = max(0.02 * s, gPx * 0.6);
  if (abs(q.x) > w * 3.0 || q.y > h + 0.2 * s) return 1.0;
  float d = boxd(q, vec2(0.0, h * 0.5), vec2(w, h * 0.5));
  for (int k = 0; k < 2; k++) {
    float by = h * (0.64 + 0.19 * float(k));
    d = min(d, boxd(q, vec2(0.0, by), vec2(w * 1.9, 0.005 * s)));
    lt += ss(gPx * 1.4, 0.0, abs(q.y - by - 0.008 * s)) * ss(w * 1.9 + gPx, w * 1.9 - gPx, abs(q.x));
  }
  float cy = q.y - h, ch = 0.17 * s;
  d = min(d, max(abs(q.x) - w * 1.15 * (1.0 - clamp(cy / ch, 0.0, 1.0)), -cy));
  return d;
}
// a mosque seen across the water: kind 0 Süleymaniye (four minarets), 1 Yeni Cami, 2 a flatter old dome
float mosque(vec2 p, float s, float kind, inout float lt) {
  float d = boxd(p, vec2(0.0, 0.1 * s), vec2(0.5 * s, 0.1 * s));
  float dr = kind == 2.0 ? 0.24 : 0.2;
  d = min(d, dome(p, vec2(-0.3 * s, 0.19 * s), vec2(0.17 * s, 0.12 * s)));
  d = min(d, dome(p, vec2(0.3 * s, 0.19 * s), vec2(0.17 * s, 0.12 * s)));
  d = min(d, dome(p, vec2(-0.5 * s, 0.1 * s), vec2(0.09 * s, 0.07 * s)));
  d = min(d, dome(p, vec2(0.5 * s, 0.1 * s), vec2(0.09 * s, 0.07 * s)));
  d = min(d, boxd(p, vec2(0.0, 0.26 * s), vec2(0.26 * s, 0.05 * s)));
  d = min(d, dome(p, vec2(0.0, 0.3 * s), vec2(0.27 * s, dr * s)));
  d = min(d, boxd(p, vec2(0.0, (0.3 + dr) * s + 0.03 * s), vec2(0.005 * s, 0.035 * s)));
  if (kind == 2.0) {
    d = min(d, boxd(p, vec2(0.0, 0.2 * s), vec2(0.36 * s, 0.12 * s)));        // the buttresses
    d = min(d, minaret(p, -0.75 * s, 0.75 * s, s * 0.8, lt));
    d = min(d, minaret(p, 0.75 * s, 0.75 * s, s * 0.8, lt));
    d = min(d, minaret(p, -0.98 * s, 0.68 * s, s * 0.8, lt));
    d = min(d, minaret(p, 0.98 * s, 0.68 * s, s * 0.8, lt));
  } else {
    float tall = kind == 0.0 ? 0.82 : 0.74;
    d = min(d, minaret(p, -0.64 * s, tall * s, s, lt));
    d = min(d, minaret(p, 0.64 * s, tall * s, s, lt));
    if (kind == 0.0) {
      d = min(d, minaret(p, -0.92 * s, 0.66 * s, s, lt));
      d = min(d, minaret(p, 0.92 * s, 0.66 * s, s, lt));
    }
  }
  return d;
}
vec4 mosqueAt(int i) {      // x, base y, size, kind
  if (i == 0) { float x = -max(gAsp * 0.5, 0.27); return vec4(x, farHill(x) - 0.004, gMs, 0.0); }
  if (i == 1) { float x = -gAsp * 0.07; return vec4(x, gWL + 0.006, gMs * 0.72, 1.0); }
  if (i == 2) { float x = -gAsp * 0.9; return vec4(x, farHill(x) - 0.004, gMs * 0.85, 2.0); }
  float x = gAsp * 0.88; return vec4(x, farHill(x) - 0.004, gMs * 0.6, 1.0);
}
// the old city across the water at p: colour and cover; lt gets its lights
vec4 farCity(vec2 p, out float lt) {
  lt = 0.0;
  float top = farTop(p.x);
  float dc = p.y - top, dm = 1.0;
  for (int i = 0; i < 4; i++) {
    vec4 m = mosqueAt(i);
    vec2 q = p - m.xy;
    if (abs(q.x) > m.z * 1.15 || q.y > m.z * 1.25 || q.y < -0.02) continue;
    dm = min(dm, mosque(q, m.z, m.w, lt));
  }
  float d = min(dc, dm);
  float a = ss(gPx * 0.8, -gPx * 0.8, d);
  if (a <= 0.0) return vec4(0.0);
  float hgt = p.y - gWL;
  vec3 c = vec3(0.075, 0.06, 0.13);
  c = mix(c, vec3(0.2, 0.12, 0.2), ss(0.06, 0.0, hgt) * 0.6);                  // the mist lying on the water
  // the mosques are floodlit, warm from below, their domes catching the last of the sky
  float inM = ss(gPx, -gPx, dm);
  vec3 mc = mix(vec3(0.3, 0.16, 0.12), vec3(0.06, 0.05, 0.12), ss(0.0, gMs * 0.3, p.y - top + 0.01));
  c = mix(c, mc, inM * 0.85);
  // the hillside pricked with lights
  vec2 g = (p - vec2(0.0, gWL)) / vec2(0.0105, 0.0072);
  vec2 cell = floor(g), f = fract(g) - 0.5;
  float h = hash21(cell + 13.0);
  if (h < 0.2 && p.y < top - 0.003 && cell.y >= 0.0) {
    vec2 off = (vec2(hash21(cell + 2.3), hash21(cell + 5.9)) - 0.5) * 0.5;
    vec2 dd = (f - off) * vec2(0.0105, 0.0072);
    float tw = 0.8 + 0.2 * sin(uTime * (0.7 + h * 9.0) + h * 40.0) + gHigh * 0.9 * sin(uTime * 15.0 + h * 120.0);
    lt += exp(-dot(dd, dd) / (gPx * gPx * 0.45)) * (0.35 + 0.65 * hash21(cell + 8.1)) * max(tw, 0.0) * (1.0 - inM);
  }
  return vec4(c, a);
}
// the light on the tower's stone, as a gradient map from the shadow to the floodlit
vec3 stone(float v) {
  vec3 c = mix(vec3(0.018, 0.022, 0.065), vec3(0.075, 0.075, 0.18), ss(0.0, 0.28, v));
  c = mix(c, vec3(0.3, 0.15, 0.16), ss(0.24, 0.52, v));
  c = mix(c, vec3(0.68, 0.36, 0.17), ss(0.5, 0.8, v));
  return mix(c, vec3(0.95, 0.58, 0.3), ss(0.8, 1.0, v));
}
// the Galata Tower: colour and cover
vec4 tower(vec2 uv) {
  vec2 q = (uv - vec2(gTx, gTb)) / gTs;
  float px = gPx / gTs;
  if (abs(q.x) > 0.17 || q.y > 1.4 || q.y < 0.0) return vec4(0.0);
  float y = q.y, ax = abs(q.x);
  float hw;
  if (y < 0.765) hw = 0.135 - 0.013 * y / 0.765;
  else if (y < 0.8) hw = mix(0.122, 0.151, pow((y - 0.765) / 0.035, 1.7));
  else if (y < 0.826) hw = 0.152;
  else if (y < 0.95) hw = 0.121;
  else if (y < 0.978) hw = mix(0.121, 0.133, ss(0.95, 0.962, y));
  else if (y < 1.3) hw = 0.129 * pow(1.0 - (y - 0.978) / 0.322, 1.18);
  else hw = 0.0045;
  float a = ss(px, -px, ax - hw);
  // the finial's ball
  float ball = ss(px, -px, length(q - vec2(0.0, 1.325)) - 0.009);
  a = max(a, ball);
  // the balcony railing round the upper storey
  float rail = 0.0;
  if (y > 0.826 && y < 0.862 && ax < 0.151) {
    float th = asin(clamp(q.x / 0.151, -1.0, 1.0));
    float post = ss(px * 0.9, px * 0.3, abs(fract(th / 0.21 + 0.5) - 0.5) * 0.21 * 0.151 * cos(th));
    rail = max(ss(px * 0.9, 0.0, abs(y - 0.858) - 0.0035), post);
    rail = max(rail, ss(px * 0.9, 0.0, abs(y - 0.842) - 0.0012));
    a = max(a, rail);
  }
  if (a <= 0.0) return vec4(0.0);
  float sx = clamp(q.x / max(hw, 1e-4), -1.0, 1.0);
  float nz = sqrt(max(1.0 - sx * sx, 0.0));
  float th = asin(sx);
  float rim = pow(ss(0.55, 1.0, sx), 2.0);               // the side towards the sunset
  float skyRim = ss(-0.6, -1.0, sx);                     // the far side, lit by the blue sky
  vec3 c;
  if (y < 0.765) {
    // the body: floodlit stone in courses, its small windows climbing round it with the stair
    float flood = pow(nz, 2.2) * mix(1.0, 0.5, y / 0.765);
    float v = 0.05 + 0.66 * flood + 0.34 * rim;
    float course = abs(fract(y / 0.0165) - 0.5);
    float row = floor(y / 0.0165);
    float joint = abs(fract(th / 0.16 + 0.5 * mod(row, 2.0)) - 0.5);
    float fade = ss(0.15, 0.5, nz);
    v *= 1.0 - (0.16 * ss(0.4, 0.5, course) + 0.1 * ss(0.44, 0.5, joint) * ss(0.0, 0.5, nz)) * fade;
    v += (noise(vec2(th * 30.0, y * 70.0)) - 0.5) * 0.05 * fade;
    c = stone(v) + vec3(0.03, 0.05, 0.12) * skyRim;
    // the small windows
    float wr = floor((y - 0.06) / 0.115);
    if (wr >= 0.0 && wr < 6.0) {
      float wy = y - 0.06 - wr * 0.115;
      float cellA = 6.2831 / 7.0;
      float u = th / cellA + wr * 0.37;
      float wi = floor(u + 0.5), fu = (u - wi) * cellA;
      float wd = abs(fu) * hw * nz;
      float wm = step(0.45, hash21(vec2(wi, wr) + 11.0)) * ss(0.005 + px, 0.005, wd) * ss(0.0, px * 1.5, wy - 0.02) * ss(0.056 + px, 0.056, wy + max(0.0, wd - 0.002) * 2.0);
      float wh = hash21(vec2(wi, wr) + 3.7);
      float ph = fract(wh * 5.3 + uTime / (45.0 + wh * 40.0));
      float on = step(0.4, wh) * ss(0.0, 0.006, ph) * ss(0.5, 0.49, ph);
      vec3 wc = mix(vec3(0.015, 0.012, 0.03), vec3(1.15, 0.62, 0.26) * (0.8 + 0.6 * band(0.62 + 0.04 * wr)), on);
      c = mix(c, wc, wm * ss(0.1, 0.3, nz));
    }
  } else if (y < 0.826) {
    // the corbels under the balcony and the balcony's floor
    float flood = pow(nz, 1.4) * 0.6;
    float v = 0.12 + 0.4 * flood + 0.3 * rim;
    if (y < 0.8) {
      float u = fract(th / 0.2) - 0.5;
      float arch = ss(0.3, 0.26, abs(u)) * ss(0.788 + 0.01 * sqrt(max(0.0, 1.0 - u * u / 0.09)) + px, 0.788 + 0.01 * sqrt(max(0.0, 1.0 - u * u / 0.09)), y);
      v = mix(v, 0.03, arch * ss(0.1, 0.4, nz));
      v *= 0.75 + 0.25 * ss(0.765, 0.8, y);
    } else {
      v += 0.12 * ss(0.81, 0.8, y);
      v *= mix(0.8, 1.0, ss(0.826, 0.8, y));
    }
    c = stone(v);
  } else if (y < 0.95) {
    // the upper storey: the ring of tall arched windows, each with its own band
    float cellA = 6.2831 / 13.0;
    float u = th / cellA + 0.5;
    float wi = floor(u + 0.5), fu = u - wi;
    float wd = abs(fu) * cellA * hw * nz;
    float hwW = 0.3 * cellA * hw * nz;
    float archTop = 0.918 + 0.022 * sqrt(max(0.0, 1.0 - (wd / max(hwW, 1e-4)) * (wd / max(hwW, 1e-4))));
    float wm = ss(hwW + px * 0.7, hwW - px * 0.7, wd) * ss(0.838, 0.838 + px, y) * ss(archTop + px, archTop - px, y);
    float b = band(0.05 + 0.065 * clamp(wi + 3.0, 0.0, 7.0));
    vec3 lamp = vec3(1.55, 0.82, 0.36) * (0.62 + 0.75 * b);
    lamp *= mix(0.75, 1.1, ss(0.84, 0.92, y));                // the glow is brightest under the ceiling
    float mull = ss(px * 0.8, 0.0, wd - 0.0012) * ss(0.86, 0.87, y);
    vec3 wc = mix(lamp, vec3(0.06, 0.03, 0.03), mull * 0.85);
    float v = 0.13 + 0.3 * pow(nz, 1.2) + 0.3 * rim;
    c = stone(v) + vec3(0.25, 0.1, 0.04) * (0.4 + 0.5 * b) * ss(hwW * 2.2, hwW, wd) * nz;   // the spill of the windows on the wall
    c = mix(c, wc, wm * ss(0.08, 0.25, nz));
    c *= 1.0 - 0.6 * ss(0.94, 0.95, y);
  } else if (y < 0.978) {
    float v = 0.1 + 0.25 * nz + 0.3 * rim;
    c = stone(v) * mix(0.6, 1.0, ss(0.95, 0.965, y));
  } else {
    // the conical cap of lead, its seams running to the spire, sky on its shoulders
    float t = clamp((y - 0.978) / 0.322, 0.0, 1.0);
    float seam = abs(fract(th / 0.26) - 0.5);
    c = vec3(0.03, 0.035, 0.085) + vec3(0.06, 0.08, 0.17) * (0.35 + 0.65 * nz) * (0.6 + 0.4 * t);
    c += vec3(0.04, 0.06, 0.14) * skyRim;
    c *= 1.0 - 0.35 * ss(0.42, 0.5, seam) * ss(0.2, 0.6, nz);
    c += vec3(0.62, 0.26, 0.08) * rim * (0.6 + 0.4 * t);
    c += vec3(0.24, 0.1, 0.035) * (1.0 - t) * ss(0.06, 0.0, y - 0.978) * nz;   // the ring's light on its rim
    c += vec3(1.1, 0.6, 0.28) * gLamp * exp(-(1.37 - y) * 7.0) * (0.3 + 0.7 * nz);
    if (y > 1.3) c = vec3(0.04, 0.04, 0.08) + vec3(0.5, 0.22, 0.07) * rim + vec3(1.2, 0.7, 0.3) * gLamp * 0.6;
  }
  if (rail > 0.0 && y > 0.826 && y < 0.862) c = mix(c, vec3(0.03, 0.025, 0.05), rail);
  return vec4(c, a);
}
const vec3 PAL[5] = vec3[5](vec3(0.9, 0.62, 0.38), vec3(0.85, 0.46, 0.42), vec3(0.55, 0.64, 0.74), vec3(0.88, 0.82, 0.7), vec3(0.58, 0.64, 0.46));
// one row of houses stepping down the hill: colour and cover. L the row, yb its eave line, cw a house's width
vec4 roofs(vec2 uv, float L, float yb, float cw, float hv, float haze) {
  float x = uv.x + L * 3.17 + 10.0;
  float id = floor(x / cw);
  // the houses are not all one width: each boundary is shifted a little
  float b0 = (id + 0.4 * (hash11(id * 0.917 + L * 2.3) - 0.5)) * cw;
  float b1 = (id + 1.0 + 0.4 * (hash11((id + 1.0) * 0.917 + L * 2.3) - 0.5)) * cw;
  if (x < b0) { id -= 1.0; b1 = b0; b0 = (id + 0.4 * (hash11(id * 0.917 + L * 2.3) - 0.5)) * cw; }
  else if (x >= b1) { id += 1.0; b0 = b1; b1 = (id + 1.0 + 0.4 * (hash11((id + 1.0) * 0.917 + L * 2.3) - 0.5)) * cw; }
  float wdt = b1 - b0;
  float fx = (x - b0) / wdt;
  float h1 = hash11(id * 1.31 + L * 7.7), h2 = hash11(id * 2.77 + L * 3.1 + 0.4);
  float h3 = hash11(id * 5.13 + L * 1.9 + 0.8), h4 = hash11(id * 3.71 + L * 5.3 + 0.1);
  float xc = (b0 + b1) * 0.5 - L * 3.17 - 10.0;
  float top = yb + 0.035 * xc + 0.018 * sin(xc * 1.7 + L * 2.1) + (h1 - 0.5) * hv;
  float u = fx * 2.0 - 1.0;
  float roofY = top, kind;
  if (h2 > 0.93) {             // a tree between the houses
    float r = wdt * 0.55;
    float tx = (u + 0.1 * sin(uv.y * 90.0 + id)) * wdt * 0.5;
    roofY = top - wdt * 0.15 + sqrt(max(0.0, r * r - tx * tx)) * 0.9 + (noise(vec2(uv.x * 160.0, uv.y * 40.0 + id)) - 0.5) * wdt * 0.12;
    kind = 5.0;
  }
  else if (h2 < 0.6) { roofY = top + min(wdt * 0.34, cw * 0.4) * clamp((1.0 - abs(u)) / 0.62, 0.0, 1.0); kind = 1.0; }
  else if (h2 < 0.78) {
    roofY = top + cw * 0.05; kind = 2.0;
    if (h4 > 0.55 && abs(u - (h4 - 0.75) * 2.0) < 0.3) roofY = top + cw * 0.32;
  }
  else if (h2 < 0.88) { roofY = top + cw * 0.05 + sqrt(max(0.0, 0.25 - u * u)) * cw * 0.42 * step(abs(u), 0.5); kind = 3.0; }
  else { roofY = top + cw * 0.42 * (1.0 - abs(u)); kind = 4.0; }
  float chim = 0.0;
  if (kind == 1.0 && h4 > 0.45) {
    float cx = (h4 - 0.72) * 1.6;
    if (abs(u - cx) < 0.075) { chim = 1.0; roofY = max(roofY, top + cw * 0.34); }
  }
  float d = uv.y - roofY;
  float a = ss(gPx, -gPx, d);
  if (a <= 0.0) return vec4(0.0);
  vec3 alb = PAL[int(h3 * 4.99)];
  float dy = top - uv.y;
  vec3 c;
  vec3 win = vec3(0.0);
  if (kind == 5.0) {
    c = vec3(0.018, 0.035, 0.045) + vec3(0.04, 0.06, 0.12) * ss(-gPx * 4.0, 0.0, d) + vec3(0.14, 0.06, 0.02) * ss(-gPx * 4.0, 0.0, d) * ss(0.0, 0.8, u);
  } else if (dy < 0.0 && chim < 0.5 && kind != 2.0) {
    // the roof: red tiles, or lead on the little domes, the sky's light along the ridge
    if (kind == 3.0) c = vec3(0.07, 0.08, 0.14) + vec3(0.08, 0.1, 0.2) * ss(0.5, 0.0, abs(u));
    else {
      c = vec3(0.15, 0.055, 0.045) * (0.85 + 0.3 * ss(-0.2, 0.6, u));     // the slope towards the sunset is warmer
      c *= 0.88 + 0.12 * ss(0.3, 0.5, abs(fract(uv.y / (cw * 0.055)) - 0.5) * 1.0);
    }
    c += vec3(0.07, 0.09, 0.2) * ss(-gPx * 3.0, 0.0, d);
    c += vec3(0.25, 0.09, 0.03) * ss(-gPx * 3.0, 0.0, d) * ss(0.0, 0.8, u);
  } else {
    // the front of the house in the dusk, darker down towards the street
    c = alb * vec3(0.1, 0.1, 0.16) + alb * vec3(0.05, 0.022, 0.01);
    c *= mix(1.0, 0.45, ss(0.0, cw * 1.8, dy));
    if (kind == 1.0 || kind == 4.0) c *= 1.0 - 0.6 * ss(cw * 0.07, 0.0, dy);     // under the eaves
    c += alb * vec3(0.09, 0.04, 0.012) * ss(cw * 0.8, cw * 2.2, dy);            // the street lamps below
    c *= 1.0 - 0.3 * ss(0.84, 1.0, abs(u));
    if (chim > 0.5) c = vec3(0.08, 0.05, 0.06) + vec3(0.06, 0.07, 0.14) * ss(-gPx * 3.0, 0.0, d);
    // the windows: each one switching on and off in its own time, each house on its own band
    float rowH = cw * 0.44, n = 2.0 + floor(h3 * 2.99);
    float wy = (dy - cw * 0.14) / rowH;
    float row = floor(wy);
    if (wy > 0.0 && chim < 0.5) {
      float wx = fx * n, ci = floor(wx);
      float dxw = abs(fract(wx) - 0.5) * wdt / n, dyw = abs(fract(wy) - 0.45) * rowH;
      float hwW = 0.19 * wdt / n, hhW = 0.24 * rowH;
      float wm = ss(hwW + gPx * 0.5, hwW - gPx * 0.5, dxw) * ss(hhW + gPx * 0.5, hhW - gPx * 0.5, dyw);
      if (wm > 0.0) {
        vec2 wk = vec2(id * 4.0 + ci, row) + L * 17.0;
        float wh = hash21(wk), wh2 = hash21(wk + 9.3);
        float ph = fract(wh * 7.7 + uTime / (32.0 + wh2 * 60.0));
        float on = step(0.3, wh2) * ss(0.0, 0.01, ph) * ss(0.62, 0.61, ph);
        vec3 lc = mix(vec3(1.0, 0.45, 0.15), vec3(1.0, 0.7, 0.36), hash21(wk + 4.4)) * (0.5 + 0.45 * hash21(wk + 1.7));
        if (wh2 > 0.94) lc = vec3(0.32, 0.48, 0.95) * 0.5;                           // a television
        lc *= 0.7 + 0.85 * band(0.08 + 0.82 * h4);
        lc *= mix(1.0, 0.6, ss(0.0, 0.5, fract(wy) - 0.45));                         // the lamp hangs high
        vec3 glass = vec3(0.02, 0.025, 0.06);
        win = mix(glass, lc, on) * wm;
        c = mix(c, vec3(0.0), wm);
      }
    }
  }
  c = mix(c, vec3(0.11, 0.1, 0.22), haze);
  c += win * (1.0 - haze * 0.4);
  return vec4(c, a);
}
// a gull, wings in a shallow M, flap from -1 to 1
float gull(vec2 uv, vec2 c, float sz, float flap, float bank) {
  vec2 r = rot(bank) * (uv - c) / sz;
  if (dot(r, r) > 2.5) return 0.0;
  vec2 ra = vec2(abs(r.x), r.y);
  vec2 elbow = vec2(0.38, 0.14 + 0.32 * flap), tip = vec2(1.0, -0.12 + 0.55 * flap);
  float d = min(seg(ra, vec2(0.0, 0.02), elbow) - mix(0.1, 0.075, ra.x / 0.38), seg(ra, elbow, tip) - mix(0.075, 0.02, clamp((ra.x - 0.38) / 0.62, 0.0, 1.0)));
  d = min(d, length(r * vec2(1.0, 2.4)) - 0.14);
  return ss(gPx / sz, 0.0, d);
}
vec3 gullCol(vec3 col, float m) { return mix(col, vec3(0.52, 0.52, 0.6), m); }
// the gulls wheeling round the tower: front says which half of their loop to draw
vec3 wheel(vec2 uv, vec3 col, bool front) {
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float ang = uTime * (0.22 + 0.035 * fi) * (mod(fi, 2.0) * 2.0 - 1.0) + fi * 1.7;
    bool isFront = sin(ang) < 0.0;
    if (isFront != front) continue;
    vec2 cen = vec2(gTx + 0.04 * sin(uTime * 0.05 + fi), gTb + gTs * (0.95 + 0.12 * hash11(fi * 3.3)));
    vec2 rad = vec2(0.28 + 0.24 * hash11(fi * 7.1), 0.06 + 0.06 * hash11(fi * 1.9));
    vec2 p = cen + vec2(cos(ang) * rad.x, sin(ang) * rad.y + 0.06 * sin(ang * 2.0 + fi));
    float sz = (0.022 + 0.008 * hash11(fi * 5.7)) * (front ? 1.0 : 0.75);
    float flap = 0.15 + 0.55 * sin(uTime * 7.0 + fi * 2.1) * ss(0.55, 0.9, sin(uTime * 0.37 + fi * 2.3));
    float bank = 0.35 * cos(ang) * (mod(fi, 2.0) * 2.0 - 1.0);
    col = gullCol(col, gull(uv, p, sz, flap, bank) * (front ? 1.0 : 0.85));
  }
  return col;
}
void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gWL = -0.2;
  gTx = max(gAsp * 0.33, 0.19);
  gTb = -0.68;
  gTs = 1.02;
  gMs = mix(0.17, 0.24, ss(0.6, 1.5, gAsp));
  gSun = vec2(max(gAsp * 0.62, 0.3), gWL - 0.04);
  gMoon = vec2(gTx - max(gAsp * 0.6, 0.5), 0.6);
  // the beat: the spire lamp flashes softly, or a flock lifts off the roofs
  gLamp = 0.0; gLiftA = -1.0; gLiftX = 0.0;
  if (uAudioActive > 0.5 && uBeatAge < 0.45) {
    float hb = hash11(uBeatCount * 7.7 + 0.3), a = uBeatAge;
    if (hb < 0.33) gLamp = uPunch * ss(0.0, 0.025, a) * exp(-a * 5.5) * ss(0.45, 0.3, a);
    else if (hb < 0.62) { gLiftA = a; gLiftX = mix(-gAsp * 0.85, gAsp * 0.85, hash11(uBeatCount * 3.1 + 0.7)); }
  }
  vec3 col = skyAt(uv);

  // a few stars, only high up where the night has come
  {
    float scale = 52.0;
    vec2 g = uv * scale;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + 71.0);
    if (h < 0.06) {
      vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
      float r = length(f - off * 0.7) / scale;
      float tw = 0.75 + 0.25 * sin(uTime * (1.1 + h * 30.0) + h * 70.0) + gHigh * 0.8 * sin(uTime * 13.0 + h * 90.0);
      float mag = 0.1 + pow(hash21(cell + 1.3), 5.0) * 1.3;
      col += vec3(0.9, 0.92, 1.0) * mag * max(tw, 0.0) * exp(-r * r / (gPx * gPx * 0.6)) * ss(0.25, 0.8, uv.y);
    }
  }
  // long thin clouds over the horizon, their undersides catching the sun that has gone
  {
    float h = uv.y - gWL;
    if (h > 0.02 && h < 0.5) {
      vec2 cq = vec2(uv.x * 0.55 + uTime * 0.003, h * 9.0);
      float n = fbm(cq + vec2(3.0, 1.0));
      float m = ss(0.56, 0.74, n) * ss(0.04, 0.12, h) * ss(0.48, 0.22, h);
      float sunSide = exp(-abs(uv.x - gSun.x) * 0.75);
      vec3 cc = mix(vec3(0.13, 0.08, 0.19), vec3(0.95, 0.4, 0.26), (0.25 + 0.75 * sunSide) * ss(0.38, 0.06, h) * ss(0.45, 0.75, n));
      col = mix(col, cc, m * 0.75);
    }
  }
  // the thin crescent, its dark side faintly there by earthshine, lit towards the sunset
  {
    vec2 mp = uv - gMoon;
    float R = 0.04;
    float dl = length(mp);
    col += vec3(0.32, 0.34, 0.42) * exp(-dl * 11.0) * 0.28;
    if (dl < R + gPx * 2.0) {
      float disk = ss(R + gPx, R - gPx, dl);
      vec2 off = normalize(vec2(-0.72, 0.7)) * R * 0.3;
      float inner = ss(R * 0.98 + gPx, R * 0.98 - gPx, length(mp - off));
      col = mix(col, vec3(0.05, 0.065, 0.12), disk * 0.7);
      col += vec3(1.3, 1.15, 0.85) * disk * (1.0 - inner);
    }
  }
  // the gulls on the far side of their loop
  col = wheel(uv, col, false);
  // farther hills, and the old city across the water
  if (uv.y < gWL + 0.3 && uv.y > gWL) {
    float rt = gWL + 0.05 + 0.03 * sin(uv.x * 1.3 + 1.0) + 0.012 * noise(vec2(uv.x * 9.0, 2.0));
    col = mix(col, mix(col, vec3(0.2, 0.12, 0.24), 0.5), ss(gPx, -gPx, uv.y - rt));
    float lt;
    vec4 fc = farCity(uv, lt);
    col = mix(col, fc.rgb, fc.a);
    col += vec3(1.25, 0.72, 0.36) * lt;
  }
  // the Golden Horn: the sky and the old city in it, the lights drawn down into streaks, the warm glow on it breathing with the bass
  if (uv.y <= gWL && uv.y > -0.5) {
    float w = gWL - uv.y;
    float z = 1.0 / (w + 0.025);
    float rip = noise(vec2(uv.x * 2.2 * z, z * 3.0 - uTime * 0.6));
    float rip2 = noise(vec2(uv.x * 5.0 * z + 7.0, z * 7.0 - uTime * 0.9));
    float dx = (rip - 0.5) * 0.012 + (rip2 - 0.5) * 0.006;
    vec2 m = vec2(uv.x + dx, gWL + w * 0.92);
    vec3 r = skyAt(m) * 0.62;
    float lt;
    vec4 fc = farCity(m, lt);
    r = mix(r, fc.rgb * 0.7, fc.a);
    col = r * mix(0.85, 0.65, ss(0.0, 0.2, w));
    // the city's lights as broken streaks
    float sc = uv.x / 0.0105;
    float scell = floor(sc), sf = fract(sc) - 0.5;
    float hs = hash11(scell * 1.7 + 4.0);
    float streak = step(0.45, hs) * exp(-sf * sf * 14.0) * exp(-w * 10.0) * ss(0.35, 0.75, noise(vec2(uv.x * 60.0, z * 6.0 - uTime * 1.3)));
    float tw = 0.75 + 0.25 * sin(uTime * 2.0 + hs * 50.0) + gHigh * 0.8 * sin(uTime * 14.0 + hs * 80.0);
    col += vec3(1.0, 0.55, 0.24) * streak * (0.15 + 0.4 * hash11(scell * 3.3)) * max(tw, 0.0);
    // the warm glow
    float sunSide = exp(-abs(uv.x - gSun.x) * 0.6);
    float wave = ss(0.25, 0.85, rip * 0.6 + rip2 * 0.6);
    col += vec3(0.55, 0.22, 0.06) * exp(-w * 9.0) * (0.22 + 0.6 * gBass) * (0.25 + 0.75 * wave) * (0.35 + 0.65 * sunSide);
    col += vec3(0.5, 0.2, 0.05) * exp(-w * 3.5) * gBass * 0.22 * wave;
    // the waterline
    col = mix(col, vec3(0.06, 0.05, 0.1), ss(0.004, 0.0, w) * 0.6);
    // a ferry crossing, its cabin windows lit
    {
      float run = gAsp * 2.0 + 0.5;
      float fx = mod(uTime * 0.011 + 0.4, run) - gAsp - 0.25;
      vec2 fp = uv - vec2(fx, gWL - 0.034);
      if (abs(fp.x) < 0.07 && abs(fp.y) < 0.04) {
        float hull = ss(gPx, -gPx, boxd(fp, vec2(0.0, 0.004), vec2(0.045 - max(0.0, -fp.y) * 0.8, 0.005)));
        float cab = ss(gPx, -gPx, boxd(fp, vec2(0.003, 0.0125), vec2(0.032, 0.0045)));
        float stack = ss(gPx, -gPx, boxd(fp, vec2(0.006, 0.022), vec2(0.004, 0.006)));
        vec3 fcol = mix(vec3(0.3, 0.3, 0.38), vec3(0.08, 0.06, 0.1), ss(0.0, -0.004, fp.y));
        col = mix(col, fcol, hull);
        col = mix(col, vec3(0.24, 0.24, 0.32), cab);
        float wins = ss(0.3, 0.15, abs(fract(fp.x / 0.0055) - 0.5)) * ss(gPx * 1.2, 0.0, abs(fp.y - 0.0125) - 0.0012) * cab;
        col += vec3(1.1, 0.68, 0.32) * wins * 0.9;
        col = mix(col, vec3(0.05, 0.04, 0.07), stack);
        float refl = exp(-pow((fp.x - 0.003) / 0.032, 8.0)) * exp(-max(-fp.y, 0.0) * 120.0) * step(fp.y, -0.002) * ss(0.4, 0.7, rip2);
        col += vec3(0.7, 0.4, 0.18) * refl * 0.35;
      }
    }
    // the Galata Bridge, running out from behind the near roofs to Eminönü, its lamps along it
    {
      vec2 A = vec2(-gAsp - 0.05, -0.44), B = vec2(mosqueAt(1).x + 0.05, gWL - 0.004);
      vec2 ba = B - A, pa = uv - A;
      float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      vec2 nrm = normalize(vec2(-ba.y, ba.x));
      float off = dot(pa, nrm);
      float th = mix(0.03, 0.0035, pow(t, 0.7));
      float deck = ss(gPx, -gPx, abs(off - th * 0.5) - th * 0.5);
      col = mix(col, vec3(0.035, 0.03, 0.065), deck);
      // the lower level of the bridge, its restaurants lit under the road
      float shops = ss(gPx, -gPx, abs(off - th * 0.3) - th * 0.16) * ss(0.25, 0.1, abs(fract(t * mix(160.0, 60.0, t)) - 0.5) * 0.5 + 0.1);
      col += vec3(1.0, 0.55, 0.22) * shops * 0.55 * (1.0 - ss(0.85, 1.0, t));
      float n = 18.0;
      float k = floor(t * n + 0.5) / n;
      vec2 lp = A + ba * k + nrm * (th + mix(0.014, 0.004, k));
      float lr = gPx * mix(2.2, 0.8, k);
      float tw = 0.85 + 0.15 * sin(uTime * 1.3 + k * 40.0) + gHigh * 0.7 * sin(uTime * 17.0 + k * 90.0);
      vec2 ld = uv - lp;
      col += vec3(1.25, 0.78, 0.4) * exp(-dot(ld, ld) / (lr * lr)) * max(tw, 0.0);
      // their light on the water under the deck
      float under = -off;
      col += vec3(0.5, 0.28, 0.12) * ss(0.0, 0.004, under) * exp(-under * mix(30.0, 90.0, t)) * exp(-pow((fract(t * n + 0.5) - 0.5) * 6.0, 2.0)) * (0.6 + 0.4 * rip2) * step(t, 0.999);
    }
  }
  // the roofs down by the water, then a row nearer
  {
    vec4 r = uv.y < -0.28 ? roofs(uv, 0.0, -0.385, 0.04, 0.018, 0.45) : vec4(0.0);
    col = mix(col, r.rgb, r.a);
    r = uv.y < -0.38 ? roofs(uv, 1.0, -0.445, 0.052, 0.025, 0.32) : vec4(0.0);
    col = mix(col, r.rgb, r.a);
    r = uv.y < -0.44 ? roofs(uv, 2.0, -0.52, 0.07, 0.035, 0.2) : vec4(0.0);
    col = mix(col, r.rgb, r.a);
  }
  // the tower, the warm air round its ring of windows first
  {
    vec2 hq = (uv - vec2(gTx, gTb + gTs * 0.89)) / vec2(0.3, 0.16);
    col += vec3(0.42, 0.2, 0.07) * exp(-dot(hq, hq) * 1.6) * 0.16;
    vec4 t = tower(uv);
    col = mix(col, t.rgb, t.a);
    // the lamp on the spire: a small steady light, and the soft flash on the beat
    vec2 ld = uv - vec2(gTx, gTb + gTs * 1.375);
    float dl = dot(ld, ld);
    col += vec3(1.3, 0.7, 0.35) * exp(-dl / (gPx * gPx * 1.8)) * 0.6;
    col += vec3(1.3, 0.78, 0.42) * gLamp * (exp(-dl / 0.0012) * 0.9 + exp(-sqrt(dl) * 9.0) * 0.22);
  }
  // the gulls on the near side of their loop
  col = wheel(uv, col, true);
  // the flock lifting off the roofs on the beat, rising from behind the next row
  if (gLiftA >= 0.0) {
    float a = gLiftA;
    float fade = ss(0.45, 0.3, a);
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      vec2 st = vec2(gLiftX + (hash11(fi * 3.7 + uBeatCount) - 0.5) * 0.3, -0.66 + hash11(fi * 1.3 + uBeatCount) * 0.04);
      vec2 v = vec2((hash11(fi * 9.1 + uBeatCount) - 0.5) * 0.5, 0.7 + 0.5 * hash11(fi * 5.3 + uBeatCount));
      vec2 p = st + v * a - vec2(0.0, 0.25) * a * a;
      float flap = sin(a * 38.0 + fi * 1.9);
      col = gullCol(col, gull(uv, p, 0.024 + 0.008 * hash11(fi * 2.9), flap, (hash11(fi * 4.4 + uBeatCount) - 0.5) * 0.8) * fade);
    }
  }
  // the row of houses just below us
  {
    vec4 r = uv.y < -0.5 ? roofs(uv, 3.0, -0.62, 0.1, 0.045, 0.1) : vec4(0.0);
    col = mix(col, r.rgb, r.a);
    r = uv.y < -0.62 ? roofs(uv, 4.0, -0.77, 0.14, 0.06, 0.0) : vec4(0.0);
    col = mix(col, r.rgb, r.a);
  }
  // our own roof in the corner, the chimney and aerial on the right, a gull perched on it
  {
    float ink = 0.0;
    vec3 fg = vec3(0.0);
    // the tiled roof sloping away bottom left
    vec2 A = vec2(-gAsp - 0.05, -0.66), B = vec2(-gAsp + 0.5, -1.05);
    vec2 nrm = normalize(vec2(B.y - A.y, A.x - B.x));
    float side = dot(uv - A, nrm);
    float roofM = ss(-gPx, gPx, side);
    if (roofM > 0.0) {
      float along = dot(uv - A, normalize(B - A));
      float tiles = abs(fract(along / 0.034) - 0.5);
      vec3 rc = vec3(0.075, 0.03, 0.03) * (0.8 + 0.4 * ss(0.5, 0.2, tiles)) * (0.85 + 0.15 * ss(0.0, 0.2, side));
      rc += vec3(0.07, 0.08, 0.17) * ss(0.012, 0.0, side);
      rc += vec3(0.2, 0.08, 0.03) * ss(0.006, 0.0, side) * ss(0.3, 0.0, tiles);
      col = mix(col, rc, roofM);
    }
    // the chimney and its aerial
    float cx = -gAsp + 0.17;
    float chim = ss(gPx, -gPx, boxd(uv, vec2(cx, -0.78), vec2(0.032, 0.15)));
    chim = max(chim, ss(gPx, -gPx, boxd(uv, vec2(cx, -0.632), vec2(0.041, 0.011))));
    chim = max(chim, ss(gPx, -gPx, boxd(uv, vec2(cx - 0.014, -0.607), vec2(0.0075, 0.016))));
    chim = max(chim, ss(gPx, -gPx, boxd(uv, vec2(cx + 0.015, -0.61), vec2(0.0075, 0.013))));
    float mx = cx + 0.024;
    float ae = ss(gPx * 1.3, gPx * 0.3, abs(uv.x - mx)) * step(uv.y, -0.3) * step(-0.64, uv.y);
    for (int k = 0; k < 4; k++) {
      float fk = float(k), ay = -0.33 - fk * 0.045, aw = 0.07 - fk * 0.012;
      ae = max(ae, ss(gPx * 1.3, gPx * 0.3, abs(uv.y - ay - (uv.x - mx) * 0.08)) * step(abs(uv.x - mx), aw));
    }
    ae = max(ae, ss(gPx * 1.2, gPx * 0.2, abs(uv.y - (-0.335) + 0.25 * (uv.x - mx)) ) * step(uv.x, mx) * step(mx - 0.09, uv.x));
    vec3 cc = vec3(0.05, 0.035, 0.05) + vec3(0.06, 0.07, 0.15) * ss(cx - 0.02, cx - 0.035, uv.x) + vec3(0.18, 0.07, 0.03) * ss(cx + 0.02, cx + 0.035, uv.x);
    col = mix(col, cc, chim);
    col = mix(col, vec3(0.015, 0.015, 0.035), ae);
    // the gull perched on the aerial's top bar, looking out
    vec2 gp = uv - vec2(mx + 0.035, -0.31);
    float bird = ss(gPx, -gPx, length(gp * vec2(1.0, 1.6)) - 0.012);
    bird = max(bird, ss(gPx, -gPx, length(gp - vec2(0.011, 0.01)) - 0.0062));
    bird = max(bird, ss(gPx, -gPx, boxd(gp, vec2(-0.016, -0.002), vec2(0.007, 0.003))));
    vec3 bc = mix(vec3(0.42, 0.42, 0.5), vec3(0.18, 0.18, 0.26), ss(0.0, -0.008, gp.y));
    bc += vec3(0.3, 0.12, 0.04) * ss(0.0, 0.012, gp.x);
    col = mix(col, bc, bird);
    col = mix(col, vec3(0.9, 0.5, 0.15), ss(gPx, -gPx, length(gp - vec2(0.019, 0.009)) - 0.0022) * bird);
  }
  // a little vignette
  vec2 vq = uv / vec2(gAsp, 1.0);
  col *= 1.0 - 0.22 * ss(0.4, 1.4, dot(vq, vq));
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'galata', name: 'Galata', group: 'Vibe',
  blurb: "Istanbul at the blue hour from a rooftop: the Galata Tower with its ring of lit windows, the old city's minarets across the Golden Horn, gulls wheeling and windows coming on one by one",
  tags: ['city', 'istanbul', 'night', 'dusk', 'dreamy', 'warm', 'calm'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
