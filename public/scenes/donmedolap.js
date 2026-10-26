import { SCULPT } from '../js/gfx/scene-kit.js';

// DÖNME DOLAP — a seaside fair on a summer night just after the sun has gone: a big ferris wheel
// at the end of the pier, turning slowly, every spoke and both rims outlined in warm bulbs, its
// painted gondolas hanging from the rim and swinging a little as it turns; a carousel glowing
// under its striped tent further along the pier, horses rising and falling inside; strings of
// coloured lamps sagging between poles; a wooden pier on its pilings; and the calm sea in front
// carrying all of it down towards us in long, broken, wobbling columns of light. The sky goes
// from the orange the sun left on the horizon through rose and mauve to a deep violet with a
// crescent moon and the first stars; a headland with a little town and a lighthouse sits far off.
//
// Music: each of the wheel's sixteen spokes is its own band of the spectrum, from the bass on one
// spoke round to the highs, and its bulbs chase outward as that band plays; the rim between two
// spokes chases round with the band of the spoke before it; the bass breathes the glow around the
// wheel and the reflections in the water; the mids light the strings of lamps; the highs sparkle
// the bulbs; and on some beats, about two in five, a burst of light runs from the hub out along
// every spoke to the rim, gone within the beat.
const frag = `${SCULPT}
float gPx, gAsp, gT, gR, gS, gRot, gYH, gYD, gYW, gSunX;
vec2 gC;
vec2 gBurst;                 // the beat burst: x how far out along the spokes (0 hub, 1 rim), y how bright
float gSB[16];               // the band of each spoke

float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float bulb(float d, float sig) { return exp(-d * d / (sig * sig)); }
float boxD(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

// the dusk: the orange the sun left on the horizon, rose, mauve, then deep violet overhead
vec3 skyAt(vec2 uv) {
  float h = uv.y - gYH;
  float sunSide = exp(-abs(uv.x - gSunX) * 0.9);
  vec3 c = mix(vec3(0.78, 0.3, 0.3), vec3(1.0, 0.43, 0.12), sunSide);
  c = mix(c, vec3(0.78, 0.3, 0.36), ss(0.02, 0.2, h) * (1.0 - 0.5 * sunSide));
  c = mix(c, vec3(0.5, 0.2, 0.42), ss(0.12, 0.5, h));
  c = mix(c, vec3(0.24, 0.1, 0.36), ss(0.4, 0.85, h));
  c = mix(c, vec3(0.07, 0.04, 0.17), ss(0.8, 1.35, h));
  vec2 ds = (uv - vec2(gSunX, gYH - 0.05)) * vec2(0.45, 1.0);
  c += vec3(0.55, 0.26, 0.08) * exp(-length(ds) * 3.2);
  return c;
}

// all the light of the wheel's bulbs at p; sig is how soft a bulb is (wider in the water)
vec3 wheelLights(vec2 p, float sig) {
  vec2 d = p - gC;
  float r = length(d);
  if (r > gR + 0.02 + 3.0 * sig) return vec3(0.0);
  float a = atan(d.y, d.x) - gRot;
  float sg = TAU / 16.0;
  float s = a / sg, si = floor(s + 0.5), fa = (s - si) * sg;
  float b = gSB[int(mod(si, 16.0))];
  float R2 = gR * 0.84;
  vec3 col = vec3(0.0);
  // the bulbs along the spoke
  float r0 = gR * 0.12, dr = (R2 - r0) / 16.0;
  float k = clamp(floor((r - r0) / dr + 0.5), 0.0, 15.0);
  float rb = r0 + k * dr;
  float dd = length(vec2(r - rb, r * sin(fa)));
  float idle = 0.5 + 0.3 * ss(0.5, 1.0, sin(k * 0.45 - uTime * 1.4 + si * 0.7));
  float chase = ss(0.3, 1.0, sin(k * 0.95 - uTime * 7.0 + si * 0.4));
  float tw = step(0.85, hash21(vec2(si * 13.0 + k, floor(uTime * 12.0)))) * gHigh;
  float bx = (rb / gR - gBurst.x) / 0.1;
  float burst = gBurst.y * exp(-bx * bx);
  float I = idle * (1.0 - 0.3 * b) + b * (0.35 + 1.9 * chase) + 1.5 * tw + 3.0 * burst;
  col += mix(vec3(1.0, 0.66, 0.36), vec3(1.0, 0.9, 0.75), ss(1.5, 3.5, I)) * I * (bulb(dd, sig) + 0.1 * exp(-dd / (sig * 2.5)));
  col += vec3(1.0, 0.5, 0.22) * 0.07 * (0.6 + 0.5 * b) * exp(-abs(r * sin(fa)) / (sig * 2.5)) * step(r0, r) * step(r, R2);
  // the outer rim, 128 bulbs, each stretch between two spokes chasing with the spoke before it
  float ms = TAU / 128.0;
  float m = floor(a / ms + 0.5);
  float dm = length(vec2(r - gR, gR * sin(a - m * ms)));
  float mm = mod(m, 128.0);
  float rbnd = gSB[int(mod(floor(mm / 8.0), 16.0))];
  float q = fract(mm * 0.25 - uTime * 0.55);
  float idle2 = 0.35 + 0.45 * ss(0.0, 0.12, q) * ss(0.62, 0.5, q);
  float chase2 = ss(0.35, 1.0, sin(mm * 0.79 - uTime * 9.0));
  float tw2 = step(0.86, hash21(vec2(mm + 300.0, floor(uTime * 12.0 + 0.5)))) * gHigh;
  float I2 = idle2 * (1.0 - 0.3 * rbnd) + rbnd * (0.3 + 1.9 * chase2) + 1.5 * tw2 + 1.6 * gBurst.y * exp(-(1.0 - gBurst.x) * 12.0);
  vec3 rc = mod(mm, 2.0) < 0.5 ? vec3(1.0, 0.52, 0.22) : vec3(1.0, 0.44, 0.5);
  col += mix(rc, vec3(1.0, 0.88, 0.72), ss(1.5, 3.5, I2)) * I2 * (bulb(dm, sig) + 0.1 * exp(-dm / (sig * 2.5)));
  col += vec3(1.0, 0.45, 0.25) * 0.1 * exp(-abs(r - gR) / (sig * 3.0));
  // the inner rim, 96 bulbs
  float ns = TAU / 96.0;
  float n = floor(a / ns + 0.5);
  float dn = length(vec2(r - R2, R2 * sin(a - n * ns)));
  float nn = mod(n, 96.0);
  float ibnd = gSB[int(mod(floor(nn / 6.0), 16.0))];
  float I3 = 0.45 + 0.15 * sin(nn * 0.5 + uTime) + ibnd * 0.9 * ss(0.4, 1.0, sin(-nn * 0.9 - uTime * 6.0)) + 1.2 * tw * step(0.5, hash11(nn)) + 2.0 * gBurst.y * exp(-(0.84 - gBurst.x) * (0.84 - gBurst.x) * 120.0);
  col += vec3(1.0, 0.72, 0.42) * I3 * bulb(dn, sig * 0.9);
  // the hub: a ring of twelve bulbs and the lamp in the middle
  float hs = TAU / 12.0;
  float h = floor(a / hs + 0.5);
  float dh = length(vec2(r - gR * 0.075, gR * 0.075 * sin(a - h * hs)));
  float hub = 0.9 + 0.2 * sin(uTime * 2.0 + h) + 3.0 * gBurst.y * exp(-gBurst.x * 8.0);
  col += vec3(1.0, 0.75, 0.45) * hub * bulb(dh, sig);
  col += vec3(1.0, 0.8, 0.5) * (1.3 + 2.5 * gBurst.y * exp(-gBurst.x * 6.0)) * bulb(r, sig * 2.2);
  return col * 1.5;
}
// the wheel's steelwork at p: x how much steel covers p, y how near the lit middle of the rim it is
vec2 wheelSteel(vec2 p) {
  vec2 d = p - gC;
  float r = length(d);
  if (r > gR + 0.01) return vec2(0.0);
  float a = atan(d.y, d.x) - gRot;
  float sg = TAU / 16.0;
  float s = a / sg, si = floor(s + 0.5), fa = (s - si) * sg;
  float R2 = gR * 0.84;
  float w = 0.0022 * gS;
  vec2 pl = r * vec2(cos(fa), sin(fa));
  float dsp = r > gR * 0.05 ? abs(pl.y) - w : 1.0;
  float drim = min(abs(r - gR) - w * 1.6, abs(r - R2) - w * 1.3);
  vec2 A = vec2(R2, 0.0), B1 = gR * vec2(cos(sg * 0.5), sin(sg * 0.5)), B2 = vec2(B1.x, -B1.y);
  float dbr = min(seg(pl, A, B1), seg(pl, A, B2)) - w * 0.7;
  // the secondary ring of tie bars half way out
  float dtie = r > gR * 0.45 && r < gR * 0.5 ? 1.0 : abs(r - gR * 0.47) - w * 0.6;
  float dhub = r - gR * 0.1;
  float dm = min(min(dsp, drim), min(dbr, min(dtie, dhub)));
  return vec2(ss(gPx, -gPx * 0.5, dm), ss(gR * 0.7, gR, r));
}

// one gondola at the end of spoke si, hanging from its pivot: colour and coverage
vec4 gondola(vec2 p, float si) {
  float ang = si * TAU / 16.0 + gRot;
  vec2 piv = gC + gR * vec2(cos(ang), sin(ang));
  vec2 q = p - piv;
  if (dot(q, q) > 0.0081 * gS * gS) return vec4(0.0);
  float sw = 0.09 * sin(uTime * 0.85 + si * 1.7) + 0.035 * sin(uTime * 2.1 + si * 4.1);
  q = rot(sw) * q / gS;
  q.y = -q.y;                                            // down from the pivot
  float px = gPx / gS;
  float id = mod(si, 16.0);
  float hc = hash11(id * 3.7 + 1.1);
  vec3 body = hc < 0.25 ? vec3(0.72, 0.14, 0.16) : hc < 0.5 ? vec3(0.1, 0.44, 0.48) : hc < 0.75 ? vec3(0.86, 0.56, 0.16) : vec3(0.84, 0.74, 0.6);
  float dRod = seg(q, vec2(0.0, -0.003), vec2(0.0, 0.016)) - 0.0018;
  vec2 rq = (q - vec2(0.0, 0.026)) / vec2(0.031, 0.013);
  float dRoof = max((length(rq) - 1.0) * 0.013, q.y - 0.026);
  float dFr = boxD(q - vec2(0.0, 0.0285), vec2(0.031, 0.0035), 0.0015);              // the roof's fringe
  float dCab = boxD(q - vec2(0.0, 0.05), vec2(0.024, 0.02), 0.007);
  float dWin = boxD(q - vec2(0.0, 0.043), vec2(0.0185, 0.0085), 0.002);
  float dAll = min(min(dRod, dRoof), min(dFr, dCab));
  float cov = ss(px, -px * 0.5, dAll);
  if (cov <= 0.0) return vec4(0.0);
  float top = ss(0.07, 0.02, q.y);                       // the rim's bulbs light it from above
  float side = ss(0.0, 0.024, abs(q.x));
  vec3 lit = mix(vec3(0.05, 0.03, 0.08), body, 0.3 + 0.65 * top) * (1.0 - 0.35 * side);
  vec3 c = vec3(0.06, 0.04, 0.07);                         // the rod
  // the roof, striped in the gondola's colour and cream
  float stripe = step(0.5, fract(q.x * 70.0 + 0.25));
  vec3 roof = mix(body, vec3(0.9, 0.82, 0.68), stripe * 0.75) * (0.55 + 0.5 * ss(0.014, 0.026, q.y));
  roof += vec3(1.0, 0.6, 0.3) * 0.25 * ss(0.006, 0.0, abs(length(rq) - 0.92) * 0.013);
  c = mix(c, roof, ss(px, -px * 0.5, dRoof));
  vec3 fr = mix(body * 0.6, vec3(0.95, 0.85, 0.7), step(0.5, fract(q.x * 45.0)));
  c = mix(c, fr * 0.8, ss(px, -px * 0.5, dFr));
  c = mix(c, lit, ss(px, -px * 0.5, dCab));
  // the windows, lit warm from inside, sometimes two riders in them
  float wl = ss(px, -px * 0.5, dWin);
  vec3 win = mix(vec3(1.0, 0.62, 0.3), vec3(0.75, 0.32, 0.2), ss(0.035, 0.05, q.y)) * 0.85;
  float riders = step(0.45, hash11(id * 9.1 + 2.0));
  float dr = min(length(q - vec2(-0.0065, 0.0445)) - 0.0042, length(q - vec2(0.0065, 0.046)) - 0.0038);
  dr = min(dr, boxD(q - vec2(0.0, 0.051), vec2(0.014, 0.004), 0.003));
  win = mix(win, vec3(0.08, 0.04, 0.06), ss(px, -px * 0.5, dr) * riders);
  win = mix(win, vec3(0.1, 0.06, 0.09), ss(px * 1.5, 0.0, abs(q.x)) * (1.0 - riders * 0.5));
  c = mix(c, win, wl);
  c += vec3(1.0, 0.65, 0.35) * 0.25 * ss(0.002, 0.0, abs(dCab)) * top;    // the rim of light on its edge
  return vec4(c, cov);
}

// a person standing on the pier at x, sc tall (1 = a grown-up), as a distance
float person(vec2 p, float x, float sc, float lean) {
  vec2 q = (p - vec2(x, gYD)) / sc;
  q.x -= lean * q.y;
  float d = length(q - vec2(0.0, 0.041)) - 0.0058;
  d = min(d, boxD(q - vec2(0.0, 0.026), vec2(0.0062, 0.0105), 0.004));
  d = min(d, seg(q, vec2(-0.0028, 0.016), vec2(-0.003, 0.0)) - 0.0026);
  d = min(d, seg(q, vec2(0.0028, 0.016), vec2(0.0035, 0.0)) - 0.0026);
  return d * sc;
}
// the carousel's centre on the pier and its size
vec2 carPos() { return vec2(mix(-0.385, -0.92, ss(0.6, 1.6, gAsp)), gYD); }
float carScale() { return mix(0.66, 1.0, ss(0.6, 1.6, gAsp)); }

// the light the carousel throws about (for the water too)
vec3 carouselGlow(vec2 p, float sig) {
  float cs = carScale();
  vec2 c = (p - carPos()) / cs;
  if (abs(c.x) > 0.4 || c.y > 0.45 || c.y < -0.1) return vec3(0.0);
  vec3 g = vec3(0.0);
  // the bulbs under the eave and round the base
  float bxe = (floor(c.x / 0.026 + 0.5)) * 0.026;
  if (abs(bxe) < 0.215) {
    float hb = 0.7 + 0.3 * sin(bxe * 120.0 - uTime * 3.0);
    g += vec3(1.0, 0.7, 0.4) * hb * bulb(length(c - vec2(bxe, 0.168)), sig / cs);
  }
  float bxb = (floor(c.x / 0.03 + 0.5)) * 0.03;
  if (abs(bxb) < 0.2) g += vec3(1.0, 0.6, 0.35) * 0.7 * bulb(length(c - vec2(bxb, 0.016)), sig / cs);
  g += vec3(1.0, 0.8, 0.5) * 1.2 * bulb(length(c - vec2(0.0, 0.302)), sig * 1.4 / cs);
  // the glow of the inside
  vec2 e = (c - vec2(0.0, 0.1)) / vec2(0.2, 0.08);
  g += vec3(0.9, 0.45, 0.18) * 0.38 * exp(-dot(e, e) * 0.9);
  return g * 1.4;
}

// a horse on a carousel pole, h in its own frame (facing +x)
float horse(vec2 h) {
  vec2 e = h / vec2(0.022, 0.0095);
  float d = (length(e) - 1.0) * 0.009;
  d = min(d, seg(h, vec2(0.014, 0.003), vec2(0.023, 0.017)) - 0.0055);
  d = min(d, seg(h, vec2(0.023, 0.019), vec2(0.034, 0.012)) - 0.0042);
  d = min(d, seg(h, vec2(0.015, -0.004), vec2(0.028, -0.008)) - 0.0024);
  d = min(d, seg(h, vec2(0.028, -0.008), vec2(0.032, -0.018)) - 0.0021);
  d = min(d, seg(h, vec2(-0.016, -0.004), vec2(-0.028, -0.017)) - 0.0024);
  d = min(d, seg(h, vec2(-0.02, 0.003), vec2(-0.034, -0.004)) - 0.0028);
  d = min(d, seg(h, vec2(0.019, 0.021), vec2(0.015, 0.026)) - 0.002);    // an ear
  return d;
}
void carousel(vec2 p, inout vec3 col) {
  float cs = carScale();
  vec2 c = (p - carPos()) / cs;
  if (abs(c.x) > 0.25 || c.y > 0.34 || c.y < -0.01) return;
  float px = gPx / cs;
  // the inside: a lit drum with mirrors round its centre column
  if (abs(c.x) < 0.19 && c.y > 0.022 && c.y < 0.172) {
    float v = ss(0.03, 0.17, c.y);
    vec3 in1 = mix(vec3(0.3, 0.09, 0.08), vec3(0.95, 0.5, 0.2), v) * (0.35 + 0.65 * ss(0.19, 0.02, abs(c.x)));
    float col1 = ss(0.03 + px, 0.03, abs(c.x));
    in1 = mix(in1, mix(vec3(0.95, 0.66, 0.34), vec3(1.2, 0.85, 0.5), step(0.5, fract(c.y * 40.0))), col1 * 0.8);
    float mir = step(0.5, fract(c.x * 18.0 + 0.5)) * ss(0.14, 0.16, c.y) * ss(0.17, 0.165, c.y);
    in1 += vec3(0.3, 0.2, 0.12) * mir;
    // the horses, round they go, rising and falling on their poles
    for (int k = 0; k < 6; k++) {
      float ph = uTime * 0.45 + float(k) * TAU / 6.0;
      float z = cos(ph);
      float hx = 0.155 * sin(ph);
      float hy = 0.075 + 0.018 * sin(ph * 2.0 + float(k) * 1.3);
      float sc = mix(0.82, 1.0, z * 0.5 + 0.5);
      vec2 hq = (c - vec2(hx, hy)) / sc;
      hq.x *= z > 0.0 ? 1.0 : -1.0;
      float dpo = abs(c.x - hx) - 0.0016;
      float dh = horse(hq) * sc;
      vec3 hc = z > 0.0 ? vec3(0.07, 0.035, 0.05) : mix(in1, vec3(0.3, 0.12, 0.1), 0.6);
      in1 = mix(in1, vec3(1.0, 0.8, 0.45) * (z > 0.0 ? 0.9 : 0.55), ss(px, 0.0, dpo) * ss(0.172, 0.165, c.y));
      in1 = mix(in1, hc, ss(px, -px * 0.5, dh));
    }
    col = in1;
  }
  // the base the horses ride on
  float dBase = boxD(c - vec2(0.0, 0.011), vec2(0.205, 0.011), 0.002);
  col = mix(col, vec3(0.12, 0.05, 0.07) + vec3(0.35, 0.16, 0.08) * ss(0.0, 0.022, c.y), ss(px, -px * 0.5, dBase));
  // the tent: a scalloped valance, then the striped roof up to its point
  float sc0 = fract(c.x / 0.026 + 0.5) - 0.5;
  float scal = 0.164 - 0.007 * (1.0 - 4.0 * sc0 * sc0);
  float dVal = max(abs(c.x) - 0.215, max(c.y - 0.19, scal - c.y));
  float lw = 0.215 - (c.y - 0.19) * 2.2;
  float roofTop = 0.19 + 0.11 * pow(max(1.0 - abs(c.x) / 0.215, 0.0), 1.5);
  float dRoof = max(abs(c.x) - 0.215, max(c.y - roofTop, 0.19 - c.y));
  float u = c.x / max(0.215 * pow(max(1.0 - (c.y - 0.19) / 0.11, 0.001), 0.67), 0.002);
  float stripe = step(0.5, fract(u * 3.5 + 0.5));
  vec3 red = vec3(0.68, 0.11, 0.14), cream = vec3(0.88, 0.78, 0.62);
  float lift = 0.5 + 0.55 * ss(0.26, 0.19, c.y);           // lit from its eave bulbs below
  vec3 roof = mix(red, cream, stripe) * lift * (0.75 + 0.25 * cos(u * 1.4));
  roof += vec3(0.5, 0.25, 0.5) * 0.18 * ss(0.012, 0.0, roofTop - c.y);      // the sky on its top edge
  col = mix(col, roof, ss(px, -px * 0.5, dRoof));
  vec3 val = mix(cream * 0.85, red, step(0.5, fract(c.x / 0.052 + 0.25))) * 0.95;
  col = mix(col, val, ss(px, -px * 0.5, dVal));
  // the finial and its pennant
  col = mix(col, vec3(0.1, 0.05, 0.08), ss(px, 0.0, seg(c, vec2(0.0, 0.29), vec2(0.0, 0.335)) - 0.0018));
  vec2 fq = c - vec2(0.0, 0.322);
  float fl = fq.y - 0.004 * sin(fq.x * 160.0 - uTime * 6.0) * ss(0.0, 0.03, fq.x);
  float dFlag = max(max(-fq.x, fq.x - 0.03), abs(fl) - 0.007 * (1.0 - fq.x / 0.032));
  col = mix(col, vec3(0.75, 0.16, 0.18), ss(px, -px * 0.5, dFlag));
}

// strings of coloured lamps between poles along the pier; front: x the light, mask in w
vec4 stringLights(vec2 p, float sig, bool withWire) {
  float sp = mix(0.48, 0.62, ss(0.6, 1.6, gAsp));
  float x0 = -gAsp - 0.3;
  float topY = gYD + 0.2;
  float sag = 0.055;
  float f = (p.x - x0) / sp;
  float i = floor(f), u = f - i;
  float cy = topY - sag * 4.0 * u * (1.0 - u);
  if (abs(p.y - cy) > 0.05 && p.y > topY + 0.02) return vec4(0.0);
  vec3 L = vec3(0.0);
  float wire = 0.0;
  if (withWire) {
    float slope = sag * 4.0 * (1.0 - 2.0 * u) / sp;
    float dw = abs(p.y - cy) / sqrt(1.0 + slope * slope);
    wire = ss(gPx * 1.1, gPx * 0.3, dw) * 0.85;
    float dp = abs(p.x - (x0 + floor(f + 0.5) * sp)) - 0.0035;
    wire = max(wire, ss(gPx, -gPx * 0.5, dp) * step(p.y, topY + 0.008) * step(gYD - 0.01, p.y));
    vec2 cq = p - vec2(x0 + floor(f + 0.5) * sp, topY + 0.005);
    wire = max(wire, ss(gPx, -gPx * 0.5, boxD(cq, vec2(0.012, 0.0022), 0.001)));       // the cross-arm the strings hang from
  }
  for (int k = -1; k <= 1; k++) {
    float j = floor(u * 11.0 + 0.5) + float(k);
    float uj = j / 11.0;
    float bxx = x0 + (i + uj) * sp, byy = topY - sag * 4.0 * uj * (1.0 - uj) - 0.008;
    float idb = i * 11.0 + j;
    float hb = hash11(idb * 3.3 + 0.7);
    vec3 bc = hb < 0.2 ? vec3(1.0, 0.25, 0.22) : hb < 0.4 ? vec3(1.0, 0.7, 0.25) : hb < 0.6 ? vec3(0.35, 0.95, 0.45) : hb < 0.8 ? vec3(0.35, 0.6, 1.0) : vec3(1.0, 0.45, 0.75);
    float I = 0.45 + 0.15 * sin(uTime * 0.7 + idb) + 1.6 * gMid * band(0.18 + 0.3 * hash11(idb * 7.1)) + 0.3 * gMid;
    L += bc * I * bulb(length(p - vec2(bxx, byy)), sig);
  }
  // the globe lamp on top of the nearest pole
  vec2 gq = p - vec2(x0 + floor(f + 0.5) * sp, topY + 0.016);
  float dg = length(gq * vec2(1.0, 0.85));
  L += vec3(1.0, 0.78, 0.5) * (0.9 * ss(0.0095 + gPx, 0.0095 - gPx, dg) + 0.35 * exp(-dg / 0.02) + 0.6 * bulb(dg, 0.006));
  return vec4(L * 1.5, wire);
}

// the pier's pilings and bracing, under the deck: 1 where they are
float pilings(vec2 p, float pierL) {
  if (p.x < pierL - 0.01) return 0.0;
  float top = gYD - 0.05, bot = gYW + 0.005;
  if (p.y > top || p.y < bot - 0.1) return 0.0;
  float sp = 0.11;
  float fx = (p.x - pierL) / sp;
  float cx = fract(fx + 0.5) - 0.5;
  float heavy = mod(floor(fx + 0.5), 4.0) < 0.5 ? 1.5 : 1.0;
  float d = abs(cx * sp) - 0.0052 * heavy * (1.0 + 0.3 * ss(top, bot, p.y));
  float t = (p.y - bot) / (top - bot);
  float cr = fract(fx);
  float dx1 = abs(cr - t) * sp - 0.0025, dx2 = abs(cr - (1.0 - t)) * sp - 0.0025;
  if (mod(floor(fx), 3.0) < 0.5) d = min(d, min(dx1, dx2) * (p.y > bot ? 1.0 : 10.0));
  d = min(d, abs(p.y - (top - 0.008)) - 0.003);
  return ss(gPx, -gPx * 0.5, d) * step(bot - 0.1, p.y);
}

// every light of the fair at p, for the water to carry
vec3 fairLights(vec2 p, float sig) {
  vec3 L = wheelLights(p, sig) + carouselGlow(p, sig) + stringLights(p, sig, false).rgb;
  vec2 d = p - gC;
  float r = length(d);
  L += vec3(1.0, 0.5, 0.22) * 0.5 * exp(-abs(r - gR * 0.92) * 9.0) * ss(gR + 0.2, gR * 0.6, r);
  return L;
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gT = uCruise * 0.5;
  float wide = ss(0.6, 1.6, gAsp);
  gYH = -0.33;
  gYD = -0.42;
  gYW = -0.54;
  gR = mix(0.46, 0.58, wide);
  gS = gR / 0.58;
  gC = vec2(mix(0.02, 0.42, wide), mix(0.13, 0.24, wide));
  gRot = -gT * 0.06;
  gSunX = -gAsp * 0.6;
  for (int i = 0; i < 16; i++) gSB[i] = band(0.02 + 0.9 * float(i) / 15.0);
  gBurst = vec2(0.0);
  if (uAudioActive > 0.5 && uBeatAge < 0.45 && hash11(uBeatCount * 7.7 + 0.3) < 0.4) {
    float a = uBeatAge;
    gBurst = vec2(ss(0.0, 0.34, a) * 1.05, uPunch * (1.0 - ss(0.25, 0.44, a)) * (0.7 + 0.3 * hash11(uBeatCount * 3.1)));
  }
  float pierL = -max(gAsp * 0.82, 0.46);

  // the sky
  vec3 col = skyAt(uv);
  float h = uv.y - gYH;
  // the first stars
  for (int layer = 0; layer < 2; layer++) {
    float scale = 38.0 + float(layer) * 41.0;
    vec2 g = uv * scale + float(layer) * 17.3;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float hs = hash21(cell + 31.0);
    if (hs > 0.06) continue;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float r = length(f - off * 0.7) / scale;
    float tw = 0.75 + 0.25 * sin(uTime * (1.0 + hs * 25.0) + hs * 60.0);
    float mag = 0.15 + pow(hash21(cell + 1.3), 4.0) * 1.2;
    col += vec3(1.0, 0.92, 0.95) * mag * tw * exp(-r * r / (gPx * gPx * 0.6)) * ss(0.55, 1.05, h);
  }
  // long low clouds, their undersides still catching the sun
  {
    float bend = (fbm(uv * vec2(0.9, 2.0) + 4.0) - 0.5) * 0.6;
    float cl = fbm(vec2(uv.x * 0.6 + uTime * 0.003, (h + bend * 0.15) * 9.0));
    float lay = ss(0.06, 0.16, h) * ss(0.6, 0.3, h);
    float m = ss(0.46, 0.66, cl) * lay * ss(0.25, 0.55, fbm(uv * 1.4 + 9.0));
    float under = ss(0.6, 0.48, cl);
    float sunSide = exp(-abs(uv.x - gSunX) * 0.8);
    vec3 cc = mix(vec3(0.36, 0.14, 0.36), mix(vec3(0.95, 0.35, 0.32), vec3(1.15, 0.55, 0.22), sunSide), under * (0.45 + 0.55 * ss(0.5, 0.1, h)));
    col = mix(col, cc, m * 0.9);
    // a few higher wisps in the mauve
    float w2 = fbm(vec2(uv.x * 0.8 - 3.0 + uTime * 0.002, h * 16.0 + bend));
    col = mix(col, vec3(0.62, 0.26, 0.48), ss(0.6, 0.78, w2) * ss(0.4, 0.55, h) * ss(0.95, 0.7, h) * 0.5);
  }
  // the crescent moon
  {
    vec2 mp = vec2(-max(gAsp * 0.42, 0.28), mix(0.8, 0.7, wide));
    float rm = 0.042;
    float dm = length(uv - mp);
    float lit = ss(rm + gPx, rm - gPx, dm) * ss(rm * 0.86 - gPx, rm * 0.86 + gPx, length(uv - mp - vec2(0.018, 0.012)));
    col += vec3(0.25, 0.15, 0.3) * exp(-dm * 9.0) * 0.6;
    col = mix(col, vec3(1.25, 1.08, 0.9), lit);
  }
  // the headland far off, with a little town and a lighthouse on its point
  {
    float hx = -gAsp * 0.2;
    float top = gYH + 0.055 * ss(hx, hx - 0.5, uv.x) + (fbm(vec2(uv.x * 6.0, 1.0)) - 0.5) * 0.02 * ss(hx, hx - 0.2, uv.x) + 0.01 * ss(hx + 0.05, hx - 0.05, uv.x);
    float dH = top - uv.y;
    if (dH > -0.03 && uv.y > gYH - 0.02) {
      vec3 hc = mix(vec3(0.16, 0.07, 0.18), skyAt(uv), 0.35);
      vec2 g = vec2(uv.x * 140.0, (uv.y - gYH) * 300.0);
      vec2 cell = floor(g);
      float town = step(hash21(cell + 5.0), 0.12) * ss(0.4, 0.0, length(fract(g) - 0.5)) * ss(0.0, 0.012, dH);
      hc += vec3(1.2, 0.7, 0.35) * town * (0.6 + 0.4 * sin(uTime * 2.0 + hash21(cell) * 40.0)) * ss(hx + 0.02, hx - 0.15, uv.x);
      col = mix(col, hc, ss(-gPx, gPx, dH) * step(gYH, uv.y));
      // the lighthouse
      vec2 lh = vec2(hx - 0.07, gYH + 0.012);
      float dT = boxD(uv - lh - vec2(0.0, 0.016), vec2(0.0035 - (uv.y - lh.y) * 0.04, 0.016), 0.0);
      col = mix(col, vec3(0.75, 0.62, 0.62) * 0.55, ss(gPx, -gPx * 0.5, dT));
      vec2 lamp = lh + vec2(0.0, 0.036);
      float beam = 0.5 + 0.5 * cos(uTime * 1.2);
      float pulse = pow(beam, 8.0);
      col += vec3(1.3, 1.0, 0.7) * (0.3 + 1.5 * pulse) * bulb(length(uv - lamp), 0.004);
      vec2 bq = uv - lamp;
      float side = sin(uTime * 1.2) > 0.0 ? 1.0 : -1.0;
      col += vec3(0.9, 0.7, 0.45) * pulse * 0.25 * exp(-abs(bq.y) * 120.0 / (1.0 + abs(bq.x) * 10.0)) * exp(-abs(bq.x) * 4.0) * step(0.0, bq.x * side);
    }
  }
  // the sea: the sky laid on it in long ripples, darker towards us, and the fair carried down it
  if (uv.y < gYH) {
    float dep = gYH - uv.y;                               // how far down the water from the horizon
    float rip = noise(vec2(uv.x * 4.0 / (0.15 + dep * 3.0) + uTime * 0.05, dep * 160.0 / (0.3 + dep * 2.5) - uTime * 0.4));
    vec2 mq = vec2(uv.x + (rip - 0.5) * 0.04 * dep, gYH + dep * 1.4 + 0.02);
    vec3 sea = skyAt(mq) * mix(0.52, 0.28, ss(0.0, 0.4, dep));
    sea = mix(sea, vec3(0.03, 0.03, 0.09), ss(0.05, 0.6, dep) * 0.6);
    sea *= 0.75 + 0.5 * ss(0.35, 0.75, rip);
    // the path of the light the sun left, glittering under where it went down
    float path = exp(-abs(uv.x - gSunX - (rip - 0.5) * 0.08) * (5.0 + dep * 6.0)) * ss(0.4, 0.75, rip);
    sea += vec3(0.7, 0.32, 0.12) * path * 0.55 * ss(0.4, 0.0, dep);
    col = sea * ss(0.0, gPx * 2.0, dep) + col * (1.0 - ss(0.0, gPx * 2.0, dep));
    // under the pier: the long broken columns of the fair's lights
    if (uv.y < gYW) {
      float d = gYW - uv.y;
      float rowF = d * 170.0 / (0.35 + d * 1.5);            // ripple rows, finer towards the pier
      float n1 = noise(vec2(uv.x * 5.0 + uTime * 0.1, rowF - uTime * 0.7));
      float n2 = noise(vec2(uv.x * 2.0 - 7.0, rowF * 0.5 + uTime * 0.4));
      float wob = (n2 - 0.5) * 0.02 * (0.4 + d * 2.0);
      float jit = (n1 - 0.5) * 0.45 * (0.3 + d * 1.2);          // each ripple tilts and shows a different height
      float dash = ss(0.25, 0.65, noise(vec2(uv.x * 3.5 + wob * 20.0, rowF * 1.3 + uTime * 0.2)));
      vec3 R = vec3(0.0);
      for (int k = 0; k < 3; k++) {
        float sy = gYW + 0.1 + d * 1.5 + jit + float(k - 1) * 0.04;
        R += fairLights(vec2(uv.x + wob, sy), 0.014);
      }
      R *= 0.36 * (0.6 + 0.6 * gBass) * mix(1.0, 0.6, ss(0.0, 0.45, d));
      col += R * (0.2 + 1.1 * dash);
      // the pier's pilings mirrored in the water
      float pm = pilings(vec2(uv.x + wob * 0.6, gYW + d * 1.1 + 0.005), pierL);
      col *= 1.0 - 0.6 * pm * ss(0.12, 0.0, d);
    }
  }
  // the glow about the wheel, breathing with the bass
  {
    float r = length(uv - gC);
    float halo = exp(-abs(r - gR * 0.9) * 5.5) * ss(gR + 0.5, gR * 0.4, r);
    col += vec3(0.42, 0.17, 0.08) * halo * (0.45 + 0.6 * gBass);
    col += vec3(0.5, 0.25, 0.1) * 0.12 * exp(-r * 6.0 / gS) * (0.6 + 0.6 * gBass);
  }
  // the wheel: its steelwork against the sky, then its bulbs
  {
    vec2 st = wheelSteel(uv);
    vec3 steel = mix(vec3(0.07, 0.035, 0.08), vec3(0.4, 0.18, 0.1), 0.25 + 0.35 * st.y);
    col = mix(col, steel, st.x * 0.92);
    col += wheelLights(uv, 0.0042 * mix(1.0, 1.15, gS));
  }
  // the gondolas, three candidates near the pixel's angle
  {
    vec2 d = uv - gC;
    float r = length(d);
    if (abs(r - gR) < 0.1 * gS) {
      float a = atan(d.y, d.x) - gRot;
      float si0 = floor(a / (TAU / 16.0) + 0.5);
      for (int j = -1; j <= 1; j++) {
        vec4 g = gondola(uv, si0 + float(j));
        col = mix(col, g.rgb, g.a);
      }
    }
  }
  // the legs of the wheel, from the axle down to the pier, with bulbs along them
  {
    float H = gC.y - gYD;
    float spread = 0.44 * gR;
    float leg = 1.0;
    vec3 lightL = vec3(0.0);
    for (int s = 0; s < 2; s++) {
      float sx = s == 0 ? -1.0 : 1.0;
      vec2 B = vec2(gC.x + sx * spread, gYD);
      float t = clamp((gC.y - uv.y) / H, 0.0, 1.0);
      float w = (0.003 + 0.008 * t) * gS;
      float dl = seg(uv, gC, B) - w;
      leg = min(leg, dl);
      vec2 ld = B - gC;
      float L = length(ld);
      float along = clamp(dot(uv - gC, ld) / (L * L), 0.0, 1.0);
      float bk = floor(along * 9.0 + 0.5) / 9.0;
      if (bk > 0.15 && bk < 0.98) lightL += vec3(1.0, 0.62, 0.32) * (0.6 + 0.2 * sin(bk * 20.0 - uTime * 2.0)) * bulb(length(uv - gC - ld * bk), 0.0038);
    }
    float yb = gYD + H * 0.32;
    float hw = spread * (1.0 - 0.32);
    leg = min(leg, max(abs(uv.y - yb) - 0.003 * gS, abs(uv.x - gC.x) - hw));
    float lm = ss(gPx, -gPx * 0.5, leg);
    col = mix(col, vec3(0.06, 0.03, 0.07) + vec3(0.28, 0.12, 0.06) * ss(gYD, gC.y, uv.y), lm);
    col += lightL * 1.4;
  }
  // the ticket booth beside the wheel, its window lit, a striped awning over it
  {
    vec2 bp = (uv - vec2(gC.x + 0.36 * gR + 0.07 * gS, gYD)) / gS;
    float px = gPx / gS;
    float dB = boxD(bp - vec2(0.0, 0.03), vec2(0.04, 0.03), 0.002);
    float dW = boxD(bp - vec2(0.0, 0.03), vec2(0.026, 0.013), 0.002);
    float dA = max(abs(bp.x) - 0.05, abs(bp.y - 0.066 + bp.x * 0.0) - 0.008);
    float dRf = boxD(bp - vec2(0.0, 0.082), vec2(0.044, 0.008), 0.003);
    vec3 bc = mix(vec3(0.1, 0.05, 0.08), vec3(0.4, 0.14, 0.14), 0.4);
    col = mix(col, bc, ss(px, -px * 0.5, dB));
    col = mix(col, mix(vec3(1.1, 0.68, 0.32), vec3(0.6, 0.25, 0.15), ss(0.02, 0.045, bp.y)), ss(px, -px * 0.5, dW));
    col = mix(col, vec3(0.08, 0.04, 0.07), ss(px, -px * 0.5, length(bp - vec2(0.004, 0.027)) - 0.007) * ss(px, -px * 0.5, dW));
    col = mix(col, mix(vec3(0.7, 0.12, 0.15), vec3(0.9, 0.8, 0.66), step(0.5, fract(bp.x * 50.0))) * 0.8, ss(px, -px * 0.5, dA));
    col = mix(col, vec3(0.13, 0.05, 0.1), ss(px, -px * 0.5, dRf));
    col += vec3(1.0, 0.7, 0.4) * 1.2 * bulb(length(bp - vec2(0.0, 0.095)), 0.006);
  }
  // the carousel, along the pier, and the light it throws
  carousel(uv, col);
  col += carouselGlow(uv, 0.0055);
  // the strings of lamps, in front
  {
    vec4 sl = stringLights(uv, 0.0068, true);
    col = mix(col, vec3(0.05, 0.03, 0.05), sl.a);
    col += sl.rgb;
  }
  // people out on the pier: a couple by the carousel, a child with a balloon and her father by the wheel
  {
    float d = 1.0;
    float xc = gC.x + gR * 0.36 + mix(0.16, 0.2, wide);
    d = min(d, person(uv, xc, 1.25, 0.04));
    d = min(d, person(uv, xc + 0.034, 0.78, -0.05));
    if (wide > 0.5) {
      d = min(d, person(uv, -0.24, 1.25, 0.06));
      d = min(d, person(uv, -0.21, 1.15, -0.03));
      d = min(d, seg(uv, vec2(-0.234, gYD + 0.037), vec2(-0.215, gYD + 0.034)) - 0.0024);
    }
    float m = ss(gPx, -gPx * 0.5, d);
    col = mix(col, vec3(0.03, 0.015, 0.04), m);
    col += vec3(0.9, 0.45, 0.2) * 0.35 * ss(0.002, 0.0, abs(d)) * ss(gYD, gYD + 0.05, uv.y);
    // the balloon, bobbing on its string
    vec2 hand = vec2(xc + 0.04, gYD + 0.023);
    vec2 bl = hand + vec2(0.012 + 0.004 * sin(uTime * 0.8), 0.07 + 0.003 * sin(uTime * 1.3));
    float ds = seg(uv, hand, bl - vec2(0.0, 0.009)) - 0.0006;
    col = mix(col, vec3(0.06, 0.03, 0.05), ss(gPx, 0.0, ds) * 0.8);
    vec2 bq = (uv - bl) * vec2(1.0, 0.88);
    float db = length(bq) - 0.0105;
    vec3 balloon = mix(vec3(0.55, 0.05, 0.1), vec3(1.15, 0.25, 0.22), ss(0.01, -0.008, bq.x - bq.y * 0.3));
    balloon += vec3(1.0, 0.8, 0.7) * 0.8 * bulb(length(bq - vec2(-0.004, 0.004)), 0.0022);
    col = mix(col, balloon, ss(gPx, -gPx * 0.5, db));
  }
  // a candy-floss stall between the carousel and the wheel, its counter lit
  if (wide > 0.5) {
    vec2 sq = uv - vec2(-0.44, gYD);
    float dS = boxD(sq - vec2(0.0, 0.025), vec2(0.045, 0.025), 0.002);
    float dAw = max(abs(sq.x) - 0.055, abs(sq.y - 0.062 + 0.002 * cos(sq.x * 380.0)) - 0.009);
    float dRoof = boxD(sq - vec2(0.0, 0.082), vec2(0.05, 0.009), 0.004);
    col = mix(col, vec3(0.09, 0.04, 0.07), ss(gPx, -gPx * 0.5, dS));
    float win = ss(gPx, -gPx * 0.5, boxD(sq - vec2(0.0, 0.034), vec2(0.036, 0.014), 0.002));
    col = mix(col, mix(vec3(1.1, 0.62, 0.36), vec3(1.0, 0.45, 0.6), ss(-0.03, 0.03, sq.x)), win);
    col = mix(col, vec3(1.0, 0.7, 0.85) * 0.9, ss(gPx, -gPx * 0.5, length(sq - vec2(-0.016, 0.03)) - 0.009) * win);
    col = mix(col, vec3(0.75, 0.85, 1.0) * 0.8, ss(gPx, -gPx * 0.5, length(sq - vec2(0.012, 0.03)) - 0.008) * win);
    col = mix(col, mix(vec3(0.85, 0.3, 0.5), vec3(0.95, 0.85, 0.75), step(0.5, fract(sq.x * 45.0))) * 0.85, ss(gPx, -gPx * 0.5, dAw));
    col = mix(col, vec3(0.12, 0.05, 0.1), ss(gPx, -gPx * 0.5, dRoof));
    col += vec3(1.0, 0.55, 0.4) * 0.12 * exp(-length((sq - vec2(0.0, 0.03)) * vec2(1.0, 1.6)) * 14.0);
  }
  // the pier: its deck catching the light, the railing, the beam along its edge, the pilings
  if (uv.x > pierL - 0.01 && uv.y < gYD + 0.04 && uv.y > gYW - 0.01) {
    float inP = ss(pierL - 0.002, pierL + 0.002, uv.x);
    float t0 = gYD, t1 = gYD - 0.022, t2 = gYD - 0.05;
    // the deck, seen nearly edge on, pools of warm light under the wheel and the carousel
    float deck = step(t1, uv.y) * step(uv.y, t0);
    float pool = exp(-abs(uv.x - gC.x) * 3.0) * (0.75 + 0.35 * gBass) + 0.8 * exp(-abs(uv.x - carPos().x) * 5.0);
    vec3 dc = mix(vec3(0.1, 0.05, 0.08), vec3(0.75, 0.38, 0.18), 0.1 + 0.6 * pool) * (0.75 + 0.25 * step(0.5, fract(uv.x * 30.0)));
    dc *= mix(1.0, 0.6, ss(t0, t1, uv.y));
    col = mix(col, dc, deck * inP);
    // the railing along the front edge
    float rp = fract(uv.x * 55.0) - 0.5;
    float bal = ss(0.12 + gPx * 55.0, 0.12, abs(rp)) * step(t1, uv.y) * step(uv.y, t1 + 0.034);
    float rail = ss(0.0026 + gPx, 0.0026, abs(uv.y - (t1 + 0.034))) + ss(0.0016 + gPx, 0.0016, abs(uv.y - (t1 + 0.016)));
    float postR = ss(0.004 + gPx, 0.004, abs(fract((uv.x - pierL) / 0.22 + 0.5) - 0.5) * 0.22) * step(t1, uv.y) * step(uv.y, t1 + 0.04);
    float rm = max(max(bal * 0.9, rail), postR) * inP;
    vec3 rc = vec3(0.06, 0.03, 0.06) + vec3(0.45, 0.2, 0.09) * pool * 0.4 * ss(t1, t1 + 0.04, uv.y);
    col = mix(col, rc, rm);
    // the beam along the edge
    float beam = step(t2, uv.y) * step(uv.y, t1);
    vec3 bmc = mix(vec3(0.05, 0.025, 0.05), vec3(0.22, 0.1, 0.07), ss(t2, t1, uv.y)) * (0.6 + 0.4 * pool);
    col = mix(col, bmc, beam * inP);
    col += vec3(1.0, 0.55, 0.25) * 0.25 * pool * ss(gPx * 2.0, 0.0, abs(uv.y - t1)) * inP;
    // the shade under the deck, then the pilings and their bracing, down into the water
    col *= 1.0 - 0.45 * inP * step(uv.y, t2) * ss(gYW - 0.01, t2, uv.y);
    float pm = pilings(uv, pierL);
    col = mix(col, vec3(0.03, 0.015, 0.04) + vec3(0.12, 0.05, 0.04) * pool * ss(gYW, t2, uv.y), pm);
  }
  // a rowing boat out on the water near us, someone in it, a lantern on its stern
  {
    float bs = mix(0.95, 1.25, wide);
    vec2 B = vec2(-max(gAsp * 0.56, 0.3), mix(-0.84, -0.8, wide));
    float ang = 0.035 * sin(uTime * 0.7), bob = 0.004 * sin(uTime * 0.9 + 1.0);
    vec2 q = rot(ang) * (uv - B - vec2(0.0, bob)) / bs;
    float px = gPx / bs;
    vec2 lan = vec2(-0.072, 0.064);
    vec2 lanW = B + vec2(0.0, bob) + rot(-ang) * lan * bs;
    float wl = -0.012;                                  // the waterline on the hull
    if (abs(q.x) < 0.2 && q.y < 0.12 && q.y > -0.25) {
      float xn = q.x / 0.1;
      float gun = 0.006 + 0.012 * xn * xn + 0.006 * step(0.0, q.x) * xn * xn;
      float keel = -0.03 * (1.0 - xn * xn);
      float dHull = max(max(q.y - gun, wl - q.y), max(keel - q.y, abs(xn) - 1.0) * 0.02);
      // someone sitting in it, looking at the fair
      float dP = length(q - vec2(-0.008, 0.043)) - 0.0085;
      dP = min(dP, boxD(q - vec2(-0.01, 0.019), vec2(0.0115, 0.017), 0.008));
      dP = min(dP, seg(q, vec2(0.0, 0.028), vec2(0.03, 0.012)) - 0.0035);        // an arm on an oar
      dP = min(dP, seg(q, vec2(0.012, 0.016), vec2(0.075, -0.02)) - 0.0018);      // the oar
      float dPole = seg(q, vec2(-0.072, 0.0), lan) - 0.0013;
      float dLan = boxD(q - lan, vec2(0.0045, 0.0065), 0.002);
      float sil = ss(px, -px * 0.5, min(min(dHull, dP), dPole));
      vec3 ink = vec3(0.022, 0.013, 0.03);
      float rimL = ss(0.004, 0.0, abs(q.y - gun)) * step(wl, q.y) * step(abs(xn), 1.0) * exp(-length(q - lan) * 14.0);
      col = mix(col, ink, sil);
      col += vec3(1.0, 0.55, 0.25) * 0.5 * rimL;
      col += vec3(1.0, 0.55, 0.25) * 0.35 * ss(0.006, 0.0, abs(dP)) * step(q.x, -0.008) * ss(0.06, 0.0, length(q - lan) - 0.02);
      col = mix(col, vec3(1.3, 0.85, 0.45), ss(px, -px * 0.5, dLan));
      // its dark reflection, broken by the ripples
      float rip = noise(vec2(q.x * 30.0, q.y * 160.0 - uTime * 1.2));
      vec2 mq = vec2(q.x + (rip - 0.5) * 0.012, 2.0 * wl - q.y);
      float dR = max(max(mq.y - (0.006 + 0.012 * xn * xn), wl - mq.y), abs(mq.x / 0.1) - 1.0);
      col = mix(col, ink * 2.0, ss(px * 2.0, -px, dR) * step(q.y, wl) * 0.75 * ss(-0.07, -0.03, q.y));
      // the water lit round the hull, and the rings it makes
      float ring = ss(0.003, 0.0, abs(length((q - vec2(0.0, wl)) * vec2(1.0, 5.0)) - 0.11 - 0.012 * sin(uTime * 0.9))) * step(q.y, wl);
      col += vec3(0.6, 0.35, 0.3) * 0.12 * ring * (0.5 + 0.5 * noise(vec2(q.x * 40.0, uTime)));
    }
    // the lantern's glow and its long wobbling streak in the water
    float dl = length(uv - lanW);
    col += vec3(1.0, 0.6, 0.28) * (0.55 * bulb(dl, 0.007) + 0.12 * exp(-dl / 0.03));
    float below = lanW.y - 0.075 * bs - uv.y;
    if (below > 0.0) {
      float rowF = below * 140.0;
      float wx = (noise(vec2(rowF, uTime * 0.8)) - 0.5) * 0.02 * (0.5 + below * 4.0);
      float str = exp(-abs(uv.x - lanW.x - wx) / (0.004 + below * 0.03)) * exp(-below * 7.0) * ss(0.3, 0.7, noise(vec2(uv.x * 30.0, rowF - uTime * 2.0)));
      col += vec3(1.0, 0.55, 0.25) * str * 0.7 * (0.7 + 0.5 * gBass);
    }
  }
  // a soft vignette, darkest in the lower corners
  vec2 vq = uv / vec2(gAsp, 1.0);
  col *= 1.0 - 0.28 * ss(0.5, 1.4, length(vq * vec2(0.9, 1.0) - vec2(0.0, 0.15)));
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'donmedolap', name: 'Dönme Dolap', group: 'Vibe',
  blurb: 'A seaside fair at dusk: a great ferris wheel strung with bulbs turning over the pier, a glowing carousel, strings of lamps and the calm sea carrying it all in long wobbling reflections',
  tags: ['fair', 'ferris wheel', 'sea', 'dusk', 'nostalgic', 'lights', 'warm', 'calm'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
