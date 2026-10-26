import { SCULPT } from '../js/gfx/scene-kit.js';

// KAMP ATEŞİ — a night camp by a mountain lake, painted like a still from an animated film: a
// crackling campfire in the foreground, stylised tongues of flame rising out of a teepee of logs
// inside a ring of stones; a small canvas tent beside it, its face glowing warm in the firelight
// with a lantern lit inside; a log to sit on, a canoe pulled up on the shore, grass catching the
// light; dark pines framing the shore; and behind them all a still lake under
// jagged snow-capped mountains, mirroring a dense starry sky and the Milky Way. The fire's light
// wobbles across the water in a long broken column. Warm firelight against the cold blue night.
//
// The mountains are cut from piecewise-straight ridges, every peak split by a line falling from its
// summit into a starlit face and a shadowed face, the way an illustrator paints a range. The lake
// shows the same world again, mirrored about the far shore and rippled a little.
//
// Music: each flame tongue follows its own band of the spectrum and grows with it; the bass
// breathes the fire's glow on the ground, the stones and the tent; the mids make the flames sway
// and lick faster; the highs make the stars twinkle and send more sparks up; on some beats, about
// two in five, a burst of sparks spirals up out of the fire, and on about one in five a shooting
// star crosses the sky (and the lake), each gone within the beat.
const frag = `${SCULPT}
float gPx, gAsp, gT, gH, gFs, gFireL;
vec2 gFireP;
vec4 gMeteor;            // the shooting star: xy head, z progress 0..1, w brightness
vec2 gMeteorDir;

// distance to triangle p0 p1 p2, negative inside
float sdTri(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
  vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                   vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                   vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
// distance to the quad v0 v1 v2 v3, negative inside
float sdQuad(vec2 p, vec2 v0, vec2 v1, vec2 v2, vec2 v3) {
  vec2 V[4] = vec2[4](v0, v1, v2, v3);
  float d = dot(p - v0, p - v0), s = 1.0;
  for (int i = 0, j = 3; i < 4; j = i, i++) {
    vec2 e = V[j] - V[i], w = p - V[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= V[i].y, p.y < V[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s *= -1.0;
  }
  return s * sqrt(d);
}
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }

// the light the fire throws on things at p; ground squashes the distance the way the ground recedes
float fireLight(vec2 p, float ground) {
  vec2 d = p - (gFireP + vec2(0.0, 0.07 * gFs));
  d.y *= mix(1.0, 2.6, ground);
  return gFireL / (1.0 + dot(d, d) * 9.0);
}

// a ridge of straight facets: peaks and saddles alternate, a little jittered. Every summit is split
// by a line falling from it into a starlit left face and a shadowed right face, and every saddle
// sends a valley line down that decides which summit a point below it belongs to. yr is the
// point's height in the ridge's own units; lit says whether it is on a starlit face; pkH is the
// height of the summit of this facet
float vX(float i, float cw, float seed) { return (i + (hash11(i * 3.7 + seed) - 0.5) * 0.5) * cw; }
float vH(float i, float seed, vec2 pkr, vec2 sdr) {
  float h = hash11(i * 1.3 + seed * 2.0);
  return mod(i, 2.0) < 0.5 ? mix(pkr.x, pkr.y, h) : mix(sdr.x, sdr.y, h);
}
float ridge(float x, float yr, float cw, float seed, vec2 pkr, vec2 sdr, out float lit, out float pkH) {
  float i = floor(x / cw);
  if (x < vX(i, cw, seed)) i -= 1.0;
  else if (x > vX(i + 1.0, cw, seed)) i += 1.0;
  float xa = vX(i, cw, seed), xb = vX(i + 1.0, cw, seed);
  float ha = vH(i, seed, pkr, sdr), hb = vH(i + 1.0, seed, pkr, sdr);
  if (mod(i, 2.0) < 0.5) {
    // the summit on the left, the saddle on the right
    pkH = ha;
    float xv = xb + (hb - yr) * (hash11((i + 1.0) * 5.9 + seed) - 0.5) * 0.9;
    lit = x > xv ? 1.0 : step(x, xa + (ha - yr) * hash11(i * 5.1 + seed) * 0.65);
  } else {
    // the saddle on the left, the summit on the right
    pkH = hb;
    float xv = xa + (ha - yr) * (hash11(i * 5.9 + seed) - 0.5) * 0.9;
    lit = x >= xv ? 1.0 : step(x, vX(i - 1.0, cw, seed) + (vH(i - 1.0, seed, pkr, sdr) - yr) * hash11((i - 1.0) * 5.1 + seed) * 0.65);
  }
  return mix(ha, hb, clamp((x - xa) / (xb - xa), 0.0, 1.0));
}

// stars, three layers; dense where the Milky Way runs; blur widens them in the lake
vec3 stars(vec2 p, float dens, float blur) {
  vec3 c = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float scale = 26.0 + fl * 34.0;
    vec2 g = p * scale + fl * 17.3;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + 31.0 * fl);
    float keep = (layer == 2 ? 0.05 + 0.55 * dens : 0.11 + 0.25 * dens);
    if (h > keep) continue;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float r = length(f - off * 0.75) / scale;
    float tw = 0.72 + 0.28 * sin(uTime * (0.8 + h * 25.0) + h * 70.0);
    tw += gHigh * 0.9 * sin(uTime * 14.0 + h * 130.0) + gHigh * 0.35;
    float mag = (layer == 2 ? 0.18 : 0.25) + pow(hash21(cell + 1.3), 6.0) * (layer == 0 ? 2.6 : 1.1);
    vec3 tint = mix(vec3(0.75, 0.85, 1.15), vec3(1.15, 0.95, 0.75), hash21(cell + 9.9));
    float w = gPx * gPx * (0.45 + 0.9 * blur) * (layer == 0 ? 1.4 : 1.0);
    c += tint * mag * max(tw, 0.0) * exp(-r * r / w);
  }
  return c;
}

// the sky, the mountains and the far shore: everything the lake mirrors. refl = 1 in the lake
vec3 world(vec2 p, float refl) {
  float y = p.y - gH;
  // night sky: cold teal glow low down to deep blue-black overhead
  vec3 c = mix(vec3(0.05, 0.10, 0.20), vec3(0.018, 0.04, 0.11), ss(0.0, 0.35, y));
  c = mix(c, vec3(0.006, 0.012, 0.045), ss(0.3, 1.0, y));
  // the Milky Way, rising from behind the mountains on the left and arching up to the right
  vec2 mq = rot(-0.62) * (p - vec2(0.05, 0.42));
  float wv = mq.y + 0.07 * sin(mq.x * 1.6 + 0.6);
  float glow = exp(-wv * wv / 0.07), core = exp(-wv * wv / 0.012);
  float dens = glow;
  if (glow > 0.02) {
    float cloud = fbm(mq * vec2(1.6, 4.5) + 3.0);
    float dust = fbm(mq * vec2(1.3, 4.2) + vec2(11.0, 0.0));
    float lane = ss(0.45, 0.7, dust) * exp(-(wv + 0.015) * (wv + 0.015) / 0.006);
    vec3 mw = vec3(0.065, 0.085, 0.19) * glow + vec3(0.36, 0.29, 0.34) * core * ss(0.3, 0.75, cloud) + vec3(0.2, 0.22, 0.38) * glow * ss(0.5, 0.85, cloud) * 0.5;
    mw *= 1.0 - 0.9 * lane;
    c += mw * ss(-0.02, 0.25, y);
    dens = glow * ss(0.35, 0.65, cloud) * (1.0 - lane);
  }
  c += stars(p, dens, refl) * ss(0.0, 0.12, y) * (1.0 - 0.45 * refl);
  // the shooting star
  if (gMeteor.w > 0.0) {
    vec2 rel = p - gMeteor.xy;
    float along = -dot(rel, gMeteorDir), side = dot(rel, vec2(-gMeteorDir.y, gMeteorDir.x));
    float len = 0.35 * gMeteor.z + 0.02;
    if (along > -0.01 && along < len) {
      float wdt = gPx * (0.7 + refl);
      c += vec3(0.9, 0.95, 1.3) * gMeteor.w * exp(-side * side / (wdt * wdt)) * pow(1.0 - clamp(along / len, 0.0, 1.0), 2.0) * ss(-0.01, 0.0, along);
    }
    c += vec3(1.2, 1.2, 1.5) * gMeteor.w * exp(-dot(rel, rel) / (gPx * gPx * 2.0));
  }
  if (y > 0.5) return c;
  // the far range, hazy and snow-capped, with small crags along its ridge
  float litF, pkF, litJ, pkJ;
  float base = ridge(p.x + 7.3, y, 0.3, 1.0, vec2(0.2, 0.4), vec2(0.06, 0.14), litF, pkF);
  float jag = ridge(p.x + 2.1, y - base, 0.055, 4.0, vec2(0.012, 0.03), vec2(-0.01, 0.0), litJ, pkJ);
  float hf = gH + base + jag;
  if (p.y < hf) {
    float py = gH + pkF;
    float lit = litF * mix(1.0, litJ, ss(0.06, 0.02, hf - p.y));
    float gully = noise(vec2(p.x * 16.0, p.y * 4.0));
    float streak = noise(vec2(p.x * 70.0, p.y * 5.0));
    float snow = ss(0.0, 0.004, p.y - (py - 0.065 - 0.05 * noise(vec2(p.x * 18.0, 2.0)) - 0.04 * gully - 0.05 * streak * streak)) * ss(gH + 0.1, gH + 0.16, p.y);
    vec3 rock = mix(vec3(0.03, 0.045, 0.11), vec3(0.07, 0.10, 0.2), lit);
    vec3 ice = mix(vec3(0.12, 0.17, 0.33), vec3(0.34, 0.42, 0.66), lit);
    vec3 m = mix(rock, ice, snow);
    m += vec3(0.1, 0.14, 0.26) * ss(0.006, 0.0, hf - p.y) * (0.4 + 0.6 * lit);   // starlight on the ridge
    m = mix(m, vec3(0.05, 0.09, 0.19), ss(0.12, 0.0, y) * 0.75);              // the mist on the water
    c = mix(c, m, ss(-gPx, gPx, hf - p.y));
  }
  // the near range, darker, closer
  float litN, pkN;
  float hn = gH + ridge(p.x - 3.0, y, 0.42, 9.0, vec2(0.09, 0.22), vec2(-0.02, 0.03), litN, pkN) + 0.4 * jag;
  if (p.y < hn) {
    float py = gH + pkN;
    float lit = litN;
    float snow = ss(0.0, 0.008, p.y - (py - 0.035 - 0.03 * noise(vec2(p.x * 21.0, 7.0)))) * ss(gH + 0.11, gH + 0.15, p.y);
    vec3 m = mix(vec3(0.014, 0.02, 0.05), vec3(0.045, 0.06, 0.13), lit);
    m = mix(m, mix(vec3(0.08, 0.11, 0.22), vec3(0.22, 0.28, 0.46), lit), snow);
    m += vec3(0.06, 0.09, 0.18) * ss(0.005, 0.0, hn - p.y) * lit;
    m = mix(m, vec3(0.045, 0.08, 0.17), ss(0.08, 0.0, y) * 0.6);
    c = mix(c, m, ss(-gPx, gPx, hn - p.y));
  }
  // the dark line of pines along the far shore
  {
    float cw = 0.016, i = floor(p.x / cw), f = fract(p.x / cw);
    float ht = 0.008 + 0.028 * pow(hash11(i * 7.1), 1.5) * ss(0.25, 0.6, noise(vec2(p.x * 3.0, 1.0)));
    float tri = gH + 0.006 + ht * (1.0 - abs(f - 0.5) * 2.0);
    float ht2 = 0.008 + 0.022 * hash11(i * 3.3 + 1.0);
    float f2 = fract(p.x / cw + 0.5);
    tri = max(tri, gH + 0.005 + ht2 * (1.0 - abs(f2 - 0.5) * 2.0) * 0.8);
    c = mix(c, vec3(0.008, 0.013, 0.03), ss(-gPx, gPx * 0.5, tri - p.y));
  }
  return c;
}

// a stylised pine: tiers of drooping branches; returns coverage and writes the edge distance
float pine(vec2 q, float h, float w, float seed, out float D) {
  D = -1.0;
  float y = q.y / h;
  if (y < -0.02 || y > 1.04 || abs(q.x) > w * 1.3) return 0.0;
  float ax = abs(q.x);
  float trunk = 0.012 * h - ax;
  float yy = y + ax / h * 0.55;                      // branches droop at the tips
  float tiers = 7.0 + floor(hash11(seed) * 3.0);
  float t = fract((yy - 0.1) / 0.9 * tiers + hash11(seed * 3.1) * 0.3);
  float taper = pow(max(1.0 - y, 0.0), 0.95);
  float wd = w * taper * (0.42 + 0.58 * pow(1.0 - t, 1.4)) * ss(0.06, 0.14, y);
  wd *= 1.0 + 0.22 * (noise(q * vec2(70.0, 45.0) / h + seed) - 0.5);
  D = max(wd - ax, y < 0.2 ? trunk : -1.0);
  return ss(-gPx, gPx, D);
}

// a pine painted onto col: ink body, cold starlight rim on the left, firelight rim on the fire's side
void paintPine(inout vec3 col, vec2 uv, vec2 base, float h, float w, float seed, float shade) {
  vec2 q = uv - base;
  float D;
  float a = pine(q, h, w, seed, D);
  if (a <= 0.0) return;
  vec3 c = vec3(0.006, 0.009, 0.02) * shade;
  float edge = 1.0 - ss(0.0, 0.01, D);
  float fl = fireLight(uv, 0.0);
  float toward = sign(gFireP.x - base.x);
  c += vec3(0.035, 0.06, 0.13) * edge * step(q.x, 0.0) * ss(0.2, 0.8, q.y / h);
  c += vec3(1.0, 0.38, 0.1) * edge * step(0.0, q.x * toward) * fl * 0.9;
  c += vec3(0.35, 0.12, 0.03) * fl * 0.25 * (1.0 - q.y / h);
  col = mix(col, c, a);
}

// the tent: front face towards the fire, a side panel going back, an open door with a lantern
void paintTent(inout vec3 col, vec2 uv, vec2 base, float s) {
  vec2 q = (uv - base) / s;
  if (q.x < -0.62 || q.x > 0.42 || q.y < -0.06 || q.y > 0.34) return;
  vec2 A = vec2(0.0, 0.26), A2 = vec2(-0.33, 0.285), BL = vec2(-0.18, 0.0), BR = vec2(0.18, 0.0), BL2 = vec2(-0.47, 0.035);
  float px = gPx / s;
  // the contact shadow on the ground
  float sh = exp(-pow(max(length((q - vec2(-0.12, 0.0)) * vec2(1.6, 9.0)) - 0.35, 0.0), 1.0) * 4.0);
  col *= 1.0 - 0.55 * sh * ss(0.03, -0.02, q.y);
  float fl = fireLight(uv, 0.0);
  float dSide = sdQuad(q, A, A2, BL2, BL);
  float dFront = sdTri(q, A, BL, BR);
  // the side panel, grazed by the light and lit a little from the lantern inside
  if (dSide < px) {
    float along = clamp((q.x - BL2.x) / (A.x - BL2.x), 0.0, 1.0);
    float v = fl * (0.35 + 0.65 * along) * 0.75;
    vec3 c = mix(vec3(0.018, 0.024, 0.05), vec3(0.32, 0.13, 0.05), ss(0.0, 0.45, v));
    c = mix(c, vec3(0.72, 0.34, 0.12), ss(0.4, 0.9, v));
    c += vec3(0.22, 0.09, 0.025) * (0.6 + 0.4 * gFireL) * exp(-length(q - vec2(-0.2, 0.08)) * 5.0) * 0.6;   // lantern through canvas
    float sag = sin((q.x - BL2.x) * 26.0) * 0.5 + 0.5;
    c *= 0.88 + 0.12 * sag;
    c += vec3(0.05, 0.08, 0.15) * ss(0.012, 0.0, abs(sdTri(q, A, A2, A2 + vec2(0.0, -0.01)))) * 0.6;     // starlight on the ridge
    col = mix(col, c, ss(px, -px, dSide));
  }
  // the front face, full in the firelight, painted from cold canvas to warm cream
  if (dFront < px) {
    float v = fl * (0.95 + 0.25 * (q.x / 0.18)) * 1.2 * (1.0 - 0.25 * ss(0.05, 0.26, q.y));
    vec3 c = mix(vec3(0.03, 0.035, 0.07), vec3(0.42, 0.17, 0.06), ss(0.0, 0.3, v));
    c = mix(c, vec3(0.92, 0.48, 0.2), ss(0.25, 0.65, v));
    c = mix(c, vec3(1.15, 0.72, 0.4), ss(0.65, 1.1, v));
    float seam = ss(0.006, 0.0, abs(q.x - (A.x + (q.y - A.y) * 0.0)));        // the door seam
    // the open door: the flaps tied back show the lantern-lit inside
    float door = sdTri(q, vec2(0.0, 0.19), vec2(-0.075, 0.0), vec2(0.08, 0.0));
    vec3 inside = mix(vec3(0.05, 0.02, 0.01), vec3(0.75, 0.38, 0.1), exp(-length((q - vec2(0.0, 0.05)) * vec2(1.4, 1.0)) * 9.0)) * (0.75 + 0.25 * gFireL);
    inside += vec3(1.6, 0.9, 0.35) * exp(-dot(q - vec2(-0.01, 0.07), q - vec2(-0.01, 0.07)) / 0.00012);   // the lantern itself
    c *= 1.0 - 0.3 * seam * step(0.19, q.y);
    c = mix(c, inside, ss(px, -px, door));
    float flap = abs(door) - 0.008;
    c = mix(c, c * 0.55, ss(px, -px, flap) * step(0.0, door));
    c += vec3(0.9, 0.42, 0.14) * ss(0.012, 0.0, abs(dFront)) * fl * 0.5;   // the rim of the canvas
    col = mix(col, c, ss(px, -px, dFront));
  }
  // guy ropes and pegs
  float rope = min(seg(q, A, vec2(0.38, -0.03)), seg(q, A2, vec2(-0.6, 0.02)));
  col = mix(col, vec3(0.5, 0.25, 0.1) * fl + vec3(0.02, 0.03, 0.06), ss(px * 1.2, px * 0.3, rope) * 0.8);
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gT = uCruise;
  gH = -0.08;
  float wide = ss(0.6, 1.7, gAsp);
  gFs = mix(1.1, 1.38, wide);
  gFireP = vec2(mix(0.1, 0.26, wide), -0.69);
  gFireL = 0.85 + 0.08 * sin(uTime * 7.3) * sin(uTime * 3.1 + 1.0) + 0.05 * sin(uTime * 13.7) + 0.45 * gBass;

  // beat events: a spiral of sparks on about two beats in five, a shooting star on one in five
  float burst = 0.0;
  gMeteor = vec4(0.0);
  gMeteorDir = vec2(1.0, 0.0);
  if (uAudioActive > 0.5 && uBeatAge < 0.45) {
    float r = hash11(uBeatCount * 7.7 + 0.3);
    if (r < 0.4) burst = uPunch;
    else if (r < 0.6) {
      float n = uBeatCount, pr = uBeatAge / 0.42;
      gMeteorDir = normalize(vec2(hash11(n * 2.3) < 0.5 ? -1.0 : 1.0, -0.45 - 0.3 * hash11(n * 4.1)));
      vec2 start = vec2((hash11(n * 1.9) - 0.5) * gAsp * 1.2, 0.55 + 0.35 * hash11(n * 3.3));
      gMeteor = vec4(start + gMeteorDir * pr * 0.75, pr, uPunch * ss(1.0, 0.75, pr) * ss(0.0, 0.08, pr) * 1.2);
    }
  }

  // the sky above the water, or the lake mirroring it
  float shoreY = -0.43 + 0.035 * sin(uv.x * 1.7 + 0.8) + 0.018 * sin(uv.x * 4.3 + 2.0);
  vec3 col;
  if (uv.y > gH) col = world(uv, 0.0);
  else {
    float depth = gH - uv.y;                                         // 0 at the far shore, more towards us
    float rip = noise(vec2(uv.x * 2.5, uv.y * 140.0 / (1.0 + depth * 25.0) - uTime * 0.3));
    vec2 rp = vec2(uv.x + (rip - 0.5) * depth * 0.05, 2.0 * gH - uv.y + (rip - 0.5) * depth * 0.035);
    vec3 r = world(rp, 1.0);
    float fres = mix(0.82, 0.5, ss(0.0, 0.3, depth));
    col = vec3(0.006, 0.012, 0.03) + r * fres;
    float mist = fbm(vec2(uv.x * 1.4 + uTime * 0.01, depth * 9.0)) * ss(0.12, 0.0, depth);
    col = mix(col, vec3(0.07, 0.11, 0.2), mist * 0.5);
    col += vec3(0.04, 0.07, 0.14) * ss(0.55, 0.9, rip) * ss(0.02, 0.15, depth) * 0.35;    // slow swells catching the sky
    // the fire's reflection: a broken column wobbling towards the far shore
    float near = ss(0.0, gH - shoreY, depth);
    float dx = uv.x - gFireP.x;
    float wdt = mix(0.02, 0.07, near);
    float kr = 5.0 / (depth + 0.05) - uTime * 0.25;   // rows of ripples, finer far away
    float row = floor(kr), fr = fract(kr);
    float h1 = hash11(row * 1.37 + 0.5), h2 = hash11(row * 2.71 + 0.2);
    float off = (h1 - 0.5) * wdt * 1.4 + sin(uTime * (1.0 + h2 * 2.0) + row) * wdt * 0.35 * (1.0 + 1.2 * gMid);
    float len = wdt * (0.35 + 0.9 * h2);
    float glint = exp(-pow((dx - off) / len, 2.0)) * ss(0.0, 0.3, fr) * ss(1.0, 0.65, fr) * step(0.22, hash11(row * 5.3 + floor(uTime * 0.7 + h1)));
    glint *= 0.55 + 0.45 * sin(uTime * (2.0 + h1 * 3.0) + h2 * 20.0);
    col += vec3(1.5, 0.6, 0.15) * glint * exp(-dx * dx / (wdt * wdt * 2.5)) * (0.5 + 0.6 * near) * gFireL;
    col += vec3(0.3, 0.1, 0.03) * exp(-dx * dx / (wdt * wdt * 6.0)) * (0.3 + 0.7 * near) * gFireL * 0.3;
  }

  // the shore and the ground of the camp
  if (uv.y < shoreY + gPx * 2.0) {
    float d = shoreY - uv.y;
    float gn = noise(uv * vec2(14.0, 30.0)) * 0.6 + noise(uv * vec2(40.0, 90.0)) * 0.4;
    vec3 g = mix(vec3(0.018, 0.026, 0.045), vec3(0.006, 0.009, 0.018), ss(0.0, 0.45, d)) * (0.7 + 0.6 * gn);
    vec2 fd = (uv - gFireP) * vec2(1.0, 2.6);
    float pool = exp(-dot(fd, fd) * 9.0) * gFireL;
    float blades = noise(vec2(uv.x * 150.0, uv.y * 70.0 + 3.0 * noise(uv * 30.0)));      // grass catching the firelight
    g += vec3(0.85, 0.3, 0.07) * pool * (0.42 + 0.4 * gn + 0.3 * blades);
    g += vec3(0.22, 0.07, 0.018) * exp(-length(fd) * 3.0) * gFireL * 0.3;
    g += vec3(0.09, 0.12, 0.2) * ss(0.012, 0.0, d) * (0.6 + 0.4 * gn);                  // the wet lip of the shore
    // grass tufts along the water, lit on the fire side
    float tuft = noise(vec2(uv.x * 90.0, 0.0)) * ss(0.4, 0.8, noise(vec2(uv.x * 6.0, 3.0)));
    float tg = ss(0.0, 0.002, (tuft * 0.028) - (uv.y - shoreY + 0.004));
    g = mix(g, vec3(0.008, 0.012, 0.022) + vec3(0.5, 0.2, 0.05) * fireLight(uv, 0.0) * 0.4, tg * step(0.0, uv.y - shoreY + 0.01));
    col = mix(col, g, ss(-gPx, gPx, d + tuft * 0.028 * ss(0.4, 0.8, noise(vec2(uv.x * 6.0, 3.0)))));
  }

  // pines on the shore behind the camp, then the tent
  float lx = -max(gAsp * 0.62, 0.42), rx = max(gAsp * 0.6, 0.36);
  paintPine(col, uv, vec2(lx + 0.25, shoreY + 0.02), 0.62, 0.11, 3.0, 1.4);
  paintPine(col, uv, vec2(lx - 0.02, shoreY - 0.02), 0.95, 0.15, 7.0, 1.2);
  paintPine(col, uv, vec2(rx - 0.3, shoreY + 0.01), 0.5, 0.09, 11.0, 1.5);
  paintPine(col, uv, vec2(rx + 0.05, shoreY - 0.03), 0.8, 0.13, 13.0, 1.3);
  paintTent(col, uv, vec2(gFireP.x - mix(0.36, 0.78, wide), -0.555), mix(0.68, 1.0, wide));

  // a canoe pulled up on the shore, its bow towards the water
  {
    vec2 cc = vec2(gFireP.x + 0.62, shoreY - 0.045);
    vec2 q = rot(-0.06) * (uv - cc);
    float L = 0.19, u = q.x / L;
    if (abs(u) < 1.05 && abs(q.y) < 0.06) {
      float top = 0.015 + 0.024 * pow(abs(u), 5.0);
      float bot = -0.03 * (1.0 - u * u);
      float dc = min(top - q.y, q.y - bot) ;
      dc = min(dc, (1.0 - abs(u)) * L);
      if (dc > -gPx * 2.0) {
        float fl = fireLight(uv, 0.0);
        float t = clamp((q.y - bot) / max(top - bot, 1e-3), 0.0, 1.0);
        vec3 c = mix(vec3(0.03, 0.012, 0.01), vec3(0.11, 0.035, 0.02), t);
        c = mix(c, vec3(0.95, 0.32, 0.1) * fl * 1.8, ss(0.4, 0.95, t) * ss(0.4, -0.6, u));
        c += vec3(0.9, 0.5, 0.25) * fl * ss(0.006, 0.0, abs(q.y - top + 0.003)) * 0.9;      // the gunwale
        c += vec3(0.04, 0.06, 0.12) * ss(0.2, 0.9, u) * t * 0.6;
        col = mix(col, c, ss(-gPx, gPx, dc));
      }
    }
  }
  // the warm haze around the fire
  vec2 fc = gFireP + vec2(0.0, 0.1 * gFs);
  col += vec3(0.9, 0.3, 0.06) * exp(-length((uv - fc) * vec2(1.0, 1.1)) * 6.5) * 0.32 * gFireL;

  // smoke drifting up, warm where the fire lights it, cold above
  {
    vec2 sp = (uv - gFireP) / gFs;
    float drift = 0.08 * sp.y * sp.y + 0.03 * sin(sp.y * 3.0 - gT * 0.4);
    float sw = 0.04 + sp.y * 0.12;
    if (sp.y > 0.2 && sp.y < 1.4 && abs(sp.x - drift) < sw * 3.0) {
      float s = fbm(vec2((sp.x - drift) * 6.0, sp.y * 3.0 - gT * 0.5));
      float dens = ss(0.4, 0.75, s) * exp(-pow((sp.x - drift) / sw, 2.0)) * ss(0.2, 0.42, sp.y) * ss(1.4, 0.7, sp.y);
      vec3 sc = mix(vec3(0.45, 0.18, 0.06) * gFireL, vec3(0.05, 0.07, 0.12), ss(0.3, 0.75, sp.y));
      col = mix(col, sc, dens * 0.3);
    }
  }

  // the campfire: stones, logs and flames, in the fire's own frame
  vec2 p = (uv - gFireP) / gFs;
  float fpx = gPx / gFs;
  if (abs(p.x) < 0.24 && p.y > -0.09 && p.y < 0.5) {
    // pass 0: the stones behind the fire; pass 1: logs, flames, the front log, the stones in front
    for (int pass = 0; pass < 2; pass++) {
      if (pass == 1) {
        // logs leaning in a teepee and one lying across the front, charred, embers in their cracks
        for (int k = 0; k < 5; k++) {
          float fk = float(k);
          if (k == 4) {
            // the flames, drawn between the teepee and the log in front: one tongue per band,
            // layered deep red, orange, yellow and a white-hot core
            float F = -1.0, Fy = 0.0;
            float eros = noise(vec2(p.x * 24.0, p.y * 12.0 - gT * 7.0));
            for (int i = 0; i < 7; i++) {
              float fi = float(i), c3 = 1.0 - abs(fi - 3.0) / 3.0;
              float xo = (fi - 3.0) * 0.028 + (hash11(fi * 4.3) - 0.5) * 0.018;
              float hgt = (0.1 + 0.16 * c3 + 0.08 * hash11(fi * 2.9)) * (0.75 + 0.6 * band(0.03 + fi * 0.115)) * (0.9 + 0.1 * sin(uTime * (5.0 + fi) + fi * 2.0));
              float yn = (p.y - 0.03) / hgt;
              if (yn < -0.3 || yn > 1.0) continue;
              float ph = gT * (4.5 + fi * 0.4) * (1.0 + 0.6 * gMid) + fi * 1.7;
              float sway = sin(yn * 3.2 - ph) * 0.017 * yn * (1.0 + 1.6 * gMid) + sin(yn * 7.0 - ph * 1.7) * 0.005 * yn + (fi - 3.0) * 0.006 * yn * yn;
              float w = (0.03 + 0.014 * c3) * pow(max(1.0 - yn, 0.0), 1.2) * ss(-0.3, 0.12, yn);
              float f = 1.0 - abs(p.x - xo - sway) / max(w, 1e-4);
              f -= ss(0.3, 1.0, yn) * eros * 0.8;
              if (f > F) { F = f; Fy = yn; }
            }
            float body = 1.0 - length((p - vec2(0.0, 0.025)) / vec2(0.075, 0.05));
            if (body > F) { F = body; Fy = 0.0; }
            if (F > -0.1) {
              float heat = F * (1.05 - 0.5 * clamp(Fy, 0.0, 1.0));
              vec3 c = vec3(1.1, 0.2, 0.035);
              c = mix(c, vec3(1.8, 0.55, 0.08), ss(0.27, 0.34, heat));
              c = mix(c, vec3(2.1, 1.25, 0.35), ss(0.55, 0.62, heat));
              c = mix(c, vec3(2.4, 1.95, 1.05), ss(0.8, 0.88, heat));
              col += vec3(0.9, 0.22, 0.03) * ss(-0.5, 0.0, F) * 0.35 * gFireL;      // the thin flame around the tongues
              col = mix(col, c * (0.85 + 0.25 * gFireL), ss(0.0, 0.07, F));
            }
            continue;
          }
          vec2 a = k == 0 ? vec2(-0.135, -0.022) : k == 1 ? vec2(0.13, -0.02) : k == 2 ? vec2(-0.07, 0.012) : vec2(-0.13, -0.045);
          vec2 b = k == 0 ? vec2(0.02, 0.12) : k == 1 ? vec2(-0.025, 0.125) : k == 2 ? vec2(0.035, 0.13) : vec2(0.125, -0.03);
          if (k == 3) { a = vec2(-0.1, -0.05); b = vec2(0.095, -0.03); }
          float rr = k == 3 ? 0.021 : 0.016 - fk * 0.0015;
          vec2 pa = p - a, ba = b - a;
          float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
          float side = dot(pa, vec2(-ba.y, ba.x)) / length(ba);
          float dl = length(pa - ba * hh) - rr;
          if (dl < fpx) {
            float crack = ss(0.07, 0.0, abs(noise(vec2(hh * 9.0 + fk * 9.0, side / rr * 1.1)) - 0.5)) * ss(rr * 0.15, -rr * 0.35, dl);
            float mid = 1.0 - abs(hh - (k == 3 ? 0.5 : 0.75)) * 1.6;
            vec3 c = mix(vec3(0.02, 0.012, 0.01), vec3(0.06, 0.035, 0.025), ss(-rr, rr, side * (k == 3 ? 1.0 : sign(ba.x))));
            c += vec3(1.7, 0.45, 0.06) * crack * ss(0.0, 0.6, mid) * (0.6 + 0.4 * gFireL);
            float rim = ss(-rr * 0.55, 0.0, dl) * (k == 3 ? step(0.0, side) : 1.0);
            c += vec3(1.1, 0.42, 0.1) * rim * ss(-0.2, 0.6, mid) * gFireL * 0.7;   // the firelit edge
            if (k == 3) c += vec3(1.3, 0.35, 0.05) * ss(0.0, rr, side) * ss(0.0, 0.5, mid) * 0.35 * gFireL;   // its top, glowing
            col = mix(col, c, ss(fpx, -fpx, dl));
          }
        }
      }
      for (int k = 0; k < 11; k++) {
        float fk = float(k);
        float a = fk / 11.0 * TAU + 0.25;
        float back = sin(a);
        if ((pass == 0) != (back > 0.0)) continue;
        float dz = 1.0 - 0.22 * back;
        vec2 sc = vec2(cos(a) * 0.16, back * 0.04 - 0.032);
        vec2 sr = vec2(0.03, 0.021) * dz * (0.85 + 0.3 * hash11(fk * 3.3));
        vec2 d = (p - sc) / sr;
        float dd = dot(d, d);
        if (dd > 1.3) continue;
        float z = sqrt(max(1.0 - dd, 0.0));
        vec3 n = vec3(d, z);
        vec3 L = back > 0.0 ? normalize(vec3(-sc.x * 4.0, 0.3, 0.6)) : normalize(vec3(-sc.x * 4.0, 0.9, -0.15));
        float ndl = dot(n, L);
        float fl = gFireL * (0.95 - 0.3 * abs(cos(a)));
        vec3 c = mix(vec3(0.01, 0.013, 0.026), vec3(0.03, 0.04, 0.07), ss(-0.2, 0.6, n.x * -sign(sc.x)) * step(back, 0.0));
        c = mix(c, vec3(0.6, 0.22, 0.05) * fl, ss(0.0, 0.3, ndl));
        c = mix(c, vec3(1.15, 0.58, 0.24) * fl, ss(0.55, 0.85, ndl));
        c *= 0.85 + 0.3 * noise(p * 140.0 + fk);
        col = mix(col, c, ss(1.0 + fpx * 2.0 / sr.y, 1.0 - fpx * 2.0 / sr.y, sqrt(dd)));
      }
    }
  }

  // sparks: a steady stream (more and brighter with the highs) and the spiral burst on the beat
  {
    vec2 sp = (uv - gFireP) / gFs;
    if (abs(sp.x) < 0.5 && sp.y > 0.0 && sp.y < 1.1) {
      for (int i = 0; i < 16; i++) {
        float fi = float(i);
        float per = 1.6 + hash11(fi * 1.7) * 1.4;
        float ph = fract(uTime / per + hash11(fi * 5.3));
        float amp = i < 7 ? 1.0 : gHigh;
        if (amp <= 0.0) continue;
        float rise = ph * (0.55 + 0.4 * hash11(fi * 2.1));
        vec2 pos = vec2((hash11(fi * 8.1) - 0.5) * 0.08 + sin(ph * 6.0 + fi) * 0.03 * ph + ph * ph * 0.06, 0.1 + rise);
        vec2 vel = vec2(cos(ph * 6.0 + fi) * 0.05, 0.12);
        float d = seg(sp, pos, pos - vel * 0.12) / (fpx * 1.1);
        col += vec3(2.0, 0.85, 0.25) * amp * (1.0 - ph) * exp(-d * d) * (0.5 + 0.9 * gHigh);
      }
      if (burst > 0.0) {
        float a = uBeatAge;
        float fade = ss(0.45, 0.25, a) * burst;
        for (int i = 0; i < 18; i++) {
          float fi = float(i);
          float ang = fi / 18.0 * TAU * 2.0 + a * (6.0 + hash11(fi) * 3.0) + uBeatCount;   // two turns of a spiral
          float rad = 0.015 + a * (0.16 + 0.08 * hash11(fi * 3.7)) * (0.6 + 0.4 * fi / 18.0);
          float up = 0.14 + a * (0.75 + 0.45 * hash11(fi * 1.3)) + fi * 0.006;
          vec2 pos = vec2(cos(ang) * rad, up + sin(ang) * rad * 0.3);
          vec2 prev = vec2(cos(ang - 0.12) * rad * 0.98, up - 0.012 + sin(ang - 0.12) * rad * 0.29);
          float d = seg(sp, pos, prev) / (fpx * 1.1);
          col += vec3(2.4, 1.0, 0.3) * fade * (exp(-d * d) + 0.12 * exp(-d * 0.35)) * (0.7 + 0.3 * hash11(fi * 9.1));
        }
      }
    }
  }

  // a log to sit on, lying in the grass on the near side of the fire
  {
    vec2 la = vec2(gFireP.x + mix(0.24, 0.36, wide), -0.84), lb = vec2(gFireP.x + mix(0.6, 0.85, wide), -0.8);
    float rr = 0.034;
    vec2 pa = uv - la, ba = lb - la;
    float hh = dot(pa, ba) / dot(ba, ba);
    float side = dot(pa, vec2(-ba.y, ba.x)) / length(ba);
    float dl = max(length(pa - ba * clamp(hh, 0.0, 1.0)) - rr, -hh * length(ba));
    if (dl < gPx * 2.0) {
      float fl = fireLight(uv, 0.0);
      float v = clamp(side / rr, -1.0, 1.0);
      vec3 c = mix(vec3(0.01, 0.009, 0.012), vec3(0.06, 0.03, 0.02), ss(-0.6, 0.4, v));
      c = mix(c, vec3(0.9, 0.38, 0.12) * fl * 1.6, ss(0.25, 0.75, v) * ss(-0.1, 0.3, 1.0 - hh));
      c *= 0.8 + 0.35 * noise(vec2(hh * 40.0, side * 90.0));
      // the cut end turned towards the fire, its rings lit warm
      vec2 e = (uv - la);
      float er = length(e * vec2(2.4, 1.0)) / rr;
      if (er < 1.0 && hh < 0.08) {
        c = mix(vec3(0.5, 0.25, 0.1), vec3(0.95, 0.55, 0.25), 0.5 + 0.5 * sin(er * 16.0)) * fl * 1.3;
        c *= mix(1.0, 0.5, ss(0.85, 1.0, er));
      }
      col = mix(col, c, ss(gPx, -gPx, min(dl, length((uv - la) * vec2(2.4, 1.0)) - rr)));
    }
  }
  // grass along the bottom of the frame, the blades nearest the fire catching its light
  {
    float yb = -0.9 + 0.04 * sin(uv.x * 2.1 + 0.4);
    if (uv.y < yb + 0.14) {
      float ink = 0.0, rim = 0.0;
      for (int L = 0; L < 3; L++) {
        float fL = float(L), cw = 0.007 + fL * 0.004;
        float xx = uv.x + fL * 0.37 + (uv.y - yb) * 0.45 * sin(uv.x * 3.0 + fL * 2.0);
        float cell = floor(xx / cw), f = fract(xx / cw);
        float clump = ss(0.2, 0.75, noise(vec2(uv.x * 3.5, fL * 5.0)));
        float hb = (0.018 + 0.1 * pow(hash11(cell * 1.7 + fL * 9.0), 2.0)) * (0.35 + 0.65 * clump) * (1.0 - 0.3 * fL);
        float bw = 0.5 + 0.3 * hash11(cell * 3.1 + fL);
        float top = yb - fL * 0.03 + hb * pow(max(1.0 - abs(f - 0.5) * 2.0 / bw, 0.0), 0.8);
        float d = top - uv.y;
        ink = max(ink, ss(-gPx, gPx, d));
        rim = max(rim, ss(-gPx, gPx, d) * ss(0.012, 0.0, d) * (1.0 - fL * 0.3));
      }
      ink = max(ink, ss(yb + gPx, yb - gPx, uv.y));
      vec3 gc = vec3(0.004, 0.006, 0.012) + vec3(0.7, 0.28, 0.08) * rim * fireLight(uv, 0.0) * 1.5;
      col = mix(col, gc, ink);
    }
  }
  // the big framing pines nearest us, almost black against the night
  paintPine(col, uv, vec2(-gAsp - mix(0.06, -0.06, wide), -1.08), mix(1.3, 1.55, wide), mix(0.2, 0.27, wide), 17.0, 0.6);
  paintPine(col, uv, vec2(gAsp + mix(0.08, 0.05, wide), -1.1), mix(1.15, 1.35, wide), mix(0.19, 0.25, wide), 19.0, 0.6);

  // a gentle vignette
  vec2 vq = uv / vec2(gAsp, 1.0);
  col *= 1.0 - 0.32 * ss(0.4, 1.4, dot(vq, vq));
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'kamp', name: 'Kamp Ateşi', group: 'Vibe',
  blurb: 'A campfire by a mountain lake at night: flames that follow the music, a glowing tent, pines, and a still lake mirroring the stars and the Milky Way',
  tags: ['night', 'fire', 'stars', 'lake', 'mountains', 'cozy', 'warm', 'calm'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
