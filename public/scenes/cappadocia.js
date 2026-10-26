import { SCULPT } from '../js/gfx/scene-kit.js';

// CAPPADOCIA — dawn over the Göreme valley, painted in layers like a travel poster, not ray-marched.
// The sun is just clear of the far tableland, and Erciyes stands snowy and pink in the distance. Three
// ranks of valley walls step nearer: tuff crowns banded pink, cream and ochre, rain gullies running
// down their faces, cones and capped fairy chimneys rising along their crests, and cave windows lit in
// a few villages. Down on the valley floor, still in the night's cool blue shadow, lie the fields,
// the poplars, the lit windows and minaret of Göreme, and the morning mist. In front, a dark rounded
// ridge climbs to the left with blunt cones on it. On the right stands the hero cluster: tall
// chimneys under dark basalt boulders and a big cone carved into a house, with doors, windows and a
// whitewashed dovecote band. The sky is full of hot-air balloons at every distance, from specks over
// the horizon to one close enough to show its basket, its burner and the people in it.
//
// The low sun on the left lights every rock from the side and a touch behind. The tuff turns gold
// through a coral edge on the side facing the sun and lavender in the blue of the sky on the other,
// so each chimney and cone wears a gold crescent. The far walls glow in full light, the nearer ones
// only on their crowns, and the near ridge and the chimney feet stay in shadow while their tips
// catch the sun. In 9:16 the hero cluster fills the lower half with the near balloon above it.
//
// Music: the bass lifts every balloon (the near ones more) and swells the near envelope. The mids make
// the valley mist rise, thicken and drift. The highs sparkle along the sunlit edges of the envelopes.
// Each lit window in the chimneys, the cave villages and the town glows with its own slice of the
// spectrum. On every beat the burners flare, the near balloon's always and about a third of the
// others', lighting their envelopes orange from inside, gone within 0.45 s. With nothing playing, the
// balloons drift and now and then fire their burners on their own, slowly, and nothing follows the
// analysis.
const frag = `${SCULPT}
float gPx, gAsp, gPf, gT, gBurn, gIdle, gHs, gHeroR, gTown, gTownW;
vec2 gSun, gHero, gHc;
vec3 gL, gLr;

const vec3 SUNC = vec3(1.32, 0.86, 0.52);      // the sunlight
const vec3 FRONT = vec3(0.25, 0.22, 0.37);     // the lavender light of the western sky behind us
const vec3 ZEN = vec3(0.09, 0.14, 0.3);        // the blue light from overhead
const vec3 TINT[4] = vec3[4](vec3(1.05, 0.9, 0.9), vec3(1.02, 0.99, 0.93), vec3(1.05, 0.93, 0.8), vec3(1.06, 1.05, 1.02));   // pink, cream, ochre, white tuff
const vec3 BCOL[8] = vec3[8](vec3(0.8, 0.07, 0.06), vec3(0.98, 0.7, 0.08), vec3(0.07, 0.2, 0.62), vec3(0.93, 0.9, 0.84),
                             vec3(0.96, 0.36, 0.05), vec3(0.08, 0.46, 0.26), vec3(0.46, 0.1, 0.52), vec3(0.05, 0.52, 0.68));
// the ranks of the valley's walls, far to near: x their mean crest, y how far it rises and falls, w seed
const vec4 RK[4] = vec4[4](vec4(-0.205, 0.016, 0.0, 3.0), vec4(-0.272, 0.04, 0.0, 17.0), vec4(-0.385, 0.05, 0.0, 29.0), vec4(-0.8, 0.06, 0.0, 41.0));
// x nearness (the size of everything on it), y haze, z where the valley's shadow ends (from the mean
// crest, in y's), w cone spacing
const vec4 RS[4] = vec4[4](vec4(0.3, 0.55, -3.0, 0.03), vec4(0.5, 0.34, -1.6, 0.05), vec4(0.72, 0.16, 0.45, 0.075), vec4(1.0, 0.0, 2.4, 0.26));
const float CSH[4] = float[4](0.35, 0.6, 0.65, 0.42);   // how many cone places on each rank are used
// the rock's colour on each rank: the far side of the valley rosier, the way it is named
const vec3 RT[4] = vec3[4](vec3(1.0), vec3(1.06, 0.88, 0.94), vec3(1.04, 0.92, 0.96), vec3(1.0));
// the balloons, far to near: x cell width, y cell height, z radius, w drift
const vec4 BP[4] = vec4[4](vec4(0.075, 0.085, 0.0085, 0.0025), vec4(0.13, 0.15, 0.016, 0.004), vec4(0.24, 0.27, 0.031, 0.006), vec4(0.5, 0.62, 0.068, 0.009));
// x lowest row, y highest row (screen y), z haze, w share of cells with a balloon
const vec4 BQ[4] = vec4[4](vec4(-0.24, 0.22, 0.55, 0.3), vec4(-0.32, 0.48, 0.38, 0.32), vec4(-0.45, 0.8, 0.2, 0.34), vec4(-0.5, 1.1, 0.06, 0.32));
// the hero cluster in its own frame, back to front: x across, y foot, z height, w half width at the foot
const vec4 HC[6] = vec4[6](vec4(-0.33, 0.1, 0.98, 0.15), vec4(0.4, 0.09, 0.8, 0.16), vec4(0.58, 0.07, 0.56, 0.13),
                           vec4(0.03, 0.0, 0.72, 0.3), vec4(-0.68, 0.0, 0.4, 0.15), vec4(0.82, 0.0, 0.34, 0.16));
const float HCAP[6] = float[6](1.0, 1.0, 1.0, 0.0, 1.0, 0.0);
const float HWIN[6] = float[6](0.07, 0.09, 0.0, 0.3, 0.06, 0.1);

float fbm3(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * noise(p); p = rot(0.5) * p * 2.07 + 7.3; a *= 0.5; } return s / 0.875; }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float boxd(vec2 p, vec2 c, vec2 b) { vec2 d = abs(p - c) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sunSide(float x) { return exp(-abs(x - gSun.x) * 0.85); }

// ── the sky ─────────────────────────────────────────────────────────────────────────────────
vec3 skyAt(vec2 uv) {
  float s = sunSide(uv.x);
  vec3 c = mix(vec3(0.6, 0.4, 0.52), vec3(0.98, 0.6, 0.36), s);                    // the horizon
  c = mix(c, mix(vec3(0.46, 0.46, 0.7), vec3(0.8, 0.62, 0.55), s * 0.7), ss(-0.2, 0.1, uv.y));
  c = mix(c, vec3(0.24, 0.37, 0.72), ss(0.0, 0.5, uv.y));
  c = mix(c, vec3(0.06, 0.13, 0.38), ss(0.42, 1.05, uv.y));
  vec2 d = uv - gSun;
  c += vec3(1.0, 0.58, 0.28) * exp(-length(d * vec2(0.5, 1.1)) * 3.4) * 0.42;
  return c;
}
// the haze over the land at x: the colour of the horizon there, a little dimmer
vec3 hazeAt(float x) { return mix(vec3(0.42, 0.38, 0.6), vec3(0.92, 0.6, 0.44), sunSide(x)); }

// ── the balloons ────────────────────────────────────────────────────────────────────────────
// One balloon in its own units: the round top has radius 1 about the origin, the envelope narrows
// to its mouth at y = -1.5, the skirt, ropes, burner and basket hang below to y = -2.1. pu is a
// pixel in these units; c1, c2 its colours, pat its pattern, spin turns its gores, burn its burner,
// lit how much sun reaches it, big whether it is near enough to show its ropes and passengers.
vec4 balloon(vec2 q, float pu, vec3 c1, vec3 c2, float pat, float spin, float burn, float lit, float big, float seed) {
  if (abs(q.x) > 1.08 || q.y > 1.06 || q.y < -2.12) return vec4(0.0);
  float ax = abs(q.x);
  float t = clamp((q.y + 1.5) / 1.5, 0.0, 1.0);
  float hw, dE, slope;
  if (q.y >= 0.0) { hw = sqrt(max(1.0 - q.y * q.y, 0.0)); dE = length(q) - 1.0; slope = 0.0; }
  else {
    hw = 0.27 + 0.73 * sin(t * 1.5708);
    slope = 0.73 * cos(t * 1.5708) * 1.5708 / 1.5;
    dE = (ax - hw) / sqrt(1.0 + slope * slope);
    dE = max(dE, -1.5 - q.y);
  }
  float aE = ss(pu, -pu, dE);
  vec3 col = vec3(0.0);
  float a = 0.0;
  if (aE > 0.0) {
    float nx = clamp(q.x / max(hw, 1e-3), -1.0, 1.0);
    float nz = sqrt(max(1.0 - nx * nx, 0.0));
    vec3 n = q.y >= 0.0 ? vec3(q.x, q.y, sqrt(max(1.0 - dot(q, q), 0.0))) : normalize(vec3(nx, -slope, nz));
    // the gores, turning slowly as the balloon turns
    float phi = asin(nx);
    float N = 12.0;
    float u = phi / PI * N + spin;
    float gi = floor(u), gf = fract(u);
    float dudx = N / PI / max(nz, 0.12) / max(hw, 0.25) * pu;
    vec3 alb;
    if (pat < 0.34) alb = mix(c1, c2, mod(gi, 2.0));
    else if (pat < 0.67) alb = BCOL[int(mod(gi + seed * 8.0, 8.0))];
    else {
      alb = mix(c1, c2, step(0.62, q.y));                                     // a crown of the second colour
      float zig = abs(fract(u * 0.5) - 0.5) * 2.0;                             // and a zigzag band like a kilim's
      float zb = (q.y + 0.42) / 0.36;
      alb = mix(alb, c2, ss(0.06, 0.0, abs(zb - zig * 0.7 - 0.15) - 0.12) * step(0.0, zb) * step(zb, 1.0));
    }
    float seam = ss(min(dudx, 0.4) + 0.025, 0.0, min(gf, 1.0 - gf)) * ss(0.5, 0.1, dudx);
    alb *= 1.0 - 0.4 * seam;
    float ndl = dot(n, gL);
    float diff = ss(-0.1, 0.75, ndl) * lit;
    col = alb * (FRONT * (0.55 + 0.45 * nz) + ZEN * max(n.y, 0.0) * 1.2 + SUNC * diff * 1.05);
    col += alb * alb * SUNC * 0.42 * lit * (0.4 + 0.6 * nz);                   // the sun through the fabric
    vec2 nd = n.xy / max(length(n.xy), 1e-4);
    float facing = max(dot(nd, normalize(gL.xy)), 0.0);
    float rim = pow(clamp(1.0 - n.z, 0.0, 1.0), 2.5) * facing;
    col += SUNC * rim * lit * 0.85;
    // the highs: glints running along the sunlit edge
    float ang = atan(q.y, q.x);
    float gl = pow(noise(vec2(ang * 14.0 + seed * 20.0, uTime * 6.0)), 4.0);
    col += vec3(1.5, 1.3, 1.0) * rim * lit * gHigh * gl * 4.0;
    // the burner, lighting the envelope from inside
    float inner = exp(-max(q.y + 1.5, 0.0) * 0.8);
    col += (alb * vec3(2.4, 1.0, 0.3) + vec3(0.4, 0.12, 0.02)) * burn * inner * (0.35 + 0.65 * nz) * (1.0 - 0.45 * diff) * 1.7;
    a = aE;
  }
  // the skirt
  if (q.y < -1.48 && q.y > -1.66) {
    float sk = ss(pu, -pu, max(ax - 0.27 + (q.y + 1.5) * 0.15, abs(q.y + 1.57) - 0.08));
    vec3 sc = c2 * 0.3 * (FRONT + SUNC * 0.3 * lit) + vec3(1.6, 0.6, 0.15) * burn * 0.6;
    col = mix(col, sc, sk); a = max(a, sk);
  }
  // ropes, burner and basket
  if (q.y < -1.6) {
    float ropes = 0.0;
    if (big > 0.5) {
      float w = pu * 0.6;
      float d = min(seg(vec2(ax, q.y), vec2(0.26, -1.64), vec2(0.13, -1.88)), seg(vec2(ax, q.y), vec2(0.1, -1.64), vec2(0.06, -1.88)));
      ropes = ss(w + pu, w, d) * 0.85;
      d = boxd(q, vec2(0.0, -1.79), vec2(0.07, 0.02));
      ropes = max(ropes, ss(pu, -pu, d));
    }
    float bd = boxd(q, vec2(0.0, -1.99), vec2(0.13, 0.095)) - 0.015;
    float bk = ss(pu, -pu, bd);
    vec3 wick = vec3(0.34, 0.2, 0.1) * (FRONT * 0.9 + SUNC * lit * ss(0.05, -0.12, q.x) * 0.9);
    if (big > 0.5) {
      wick *= 0.82 + 0.18 * ss(0.3, 0.6, abs(fract(q.y * 26.0) - 0.5) * 2.0);
      wick = mix(wick, vec3(0.5, 0.3, 0.15) * (FRONT + SUNC * lit * 0.5), ss(0.02, 0.0, abs(q.y + 1.905)));
      // the passengers: heads over the rim, dark against the morning
      for (int k = 0; k < 3; k++) {
        float fk = float(k);
        vec2 hp = vec2(-0.075 + fk * 0.075 + 0.01 * sin(seed * 9.0 + fk * 2.0), -1.86 + 0.012 * fk);
        float hd = length(q - hp) - 0.032;
        float head = ss(pu, -pu, hd);
        bk = max(bk, head);
        wick = mix(wick, vec3(0.06, 0.05, 0.07) + SUNC * 0.25 * lit * ss(0.0, -0.03, q.x - hp.x + 0.02), head);
      }
    }
    vec3 rc = vec3(0.05, 0.04, 0.05);
    col = mix(col, rc, ropes * (1.0 - bk)); a = max(a, ropes);
    col = mix(col, wick, bk); a = max(a, bk);
  }
  // the flame itself, seen under the mouth, and its glow in the air, never smaller than a few pixels
  vec3 glow = vec3(0.0);
  if (burn > 0.0) {
    vec2 f = (q - vec2(0.0, -1.74)) / vec2(0.07, 0.3);
    float fl = exp(-dot(f, f) * 2.0) * ss(-0.2, 0.3, f.y + 0.2);
    col += vec3(2.4, 1.2, 0.35) * fl * burn * 1.6 + vec3(1.0, 0.95, 1.4) * exp(-dot(f * vec2(2.0, 3.0), f * vec2(2.0, 3.0))) * burn;
    a = max(a, clamp(fl * burn, 0.0, 1.0));
    float hr = max(0.22, pu * 2.2);
    vec2 hq = (q - vec2(0.0, -1.62)) / hr;
    glow = vec3(1.6, 0.66, 0.18) * burn * exp(-dot(hq, hq)) * 0.9;
  }
  return vec4(col * a + glow, a);
}
// a field of balloons at one distance, drifting with the wind; each cell holds at most one, placed
// so that the whole balloon stays inside its cell
vec3 balloonField(vec2 uv, vec3 col, int i) {
  vec4 P = BP[i], Q = BQ[i];
  float fi = float(i);
  float lift = gBass * (0.012 + 0.015 * fi * fi);
  vec2 p = uv - vec2(gT * P.w + fi * 3.7, lift);
  vec2 cell = floor(p / P.xy);
  if (cell.y * P.y < Q.x || (cell.y + 1.0) * P.y > Q.y) return col;
  float h = hash21(cell + fi * 31.0);
  if (h > Q.w * mix(1.0, 0.45, ss(0.0, 0.7, cell.y * P.y) * step(0.5, fi) * step(fi, 2.5))) return col;   // the middle ones gather low over the valley
  float r = P.z * (0.8 + 0.35 * hash21(cell + 7.1 + fi));
  vec2 room = P.xy - vec2(2.2 * r, 3.3 * r);
  vec2 c = cell * P.xy + vec2(1.1 * r, 2.15 * r) + room * (0.12 + 0.76 * vec2(hash21(cell + 3.3), hash21(cell + 5.9)));
  c.y += 0.1 * room.y * sin(gT * (0.2 + 0.2 * h) + h * 40.0);                // a gentle bob, never out of its cell
  vec2 q = (p - c) / r;
  if (abs(q.x) > 1.1 || q.y > 1.1 || q.y < -2.15) return col;
  float id = hash21(cell + 9.4);
  vec3 c1 = BCOL[int(hash21(cell + 1.7) * 7.99)], c2 = BCOL[int(hash21(cell + 2.9) * 7.99)];
  float burn = gBurn * step(hash11(id * 61.0 + uBeatCount * 1.618), 0.34);
  float ph = fract(gT / (11.0 + 9.0 * id) + id);
  burn += gIdle * 0.5 * ss(0.0, 0.01, ph) * ss(0.09, 0.05, ph);
  float lit = ss(-0.42 + 0.06 * fi, -0.3 + 0.03 * fi, c.y + lift);
  vec4 b = balloon(q, gPx / r, c1, c2, hash21(cell + 4.4), gT * 0.03 * (id - 0.5) + id * 10.0, burn, lit, step(2.5, fi), id);
  vec3 bc = mix(b.rgb, hazeAt(uv.x) * 0.95 * b.a, Q.z * 0.85);              // (premultiplied)
  return col * (1.0 - b.a) + bc;
}

// ── the rock ────────────────────────────────────────────────────────────────────────────────
// the light on tuff as a painter's gradient map, from the valley's night shadow to the full low
// sun: deep blue, lavender, mauve, a coral edge where the light turns, peach and gold
vec3 rockRamp(float v) {
  vec3 c = mix(vec3(0.03, 0.035, 0.1), vec3(0.1, 0.1, 0.25), ss(0.0, 0.13, v));
  c = mix(c, vec3(0.25, 0.18, 0.37), ss(0.1, 0.27, v));
  c = mix(c, vec3(0.64, 0.3, 0.32), ss(0.25, 0.42, v));
  c = mix(c, vec3(0.93, 0.55, 0.36), ss(0.4, 0.62, v));
  c = mix(c, vec3(1.0, 0.74, 0.5), ss(0.6, 0.85, v));
  return mix(c, vec3(1.02, 0.86, 0.64), ss(0.85, 1.05, v));
}
// how much light reaches tuff with normal n: the sky everywhere, brighter from the sun's side of it,
// and the sun on the side turned to it; sunlit says whether the sun gets there at all
float rockV(vec3 n, float sunlit) {
  float ndl = dot(n, gLr);
  float sky = 0.05 + 0.08 * max(n.y, 0.0) + 0.13 * max(dot(n, vec3(-0.55, 0.45, 0.7)), 0.0);
  return sky + (0.36 * ss(-0.03, 0.12, ndl) + 0.44 * ss(0.12, 0.7, ndl)) * sunlit;
}
// the tuff's layers at height y: pink, cream, ochre and white, close in tone, now and then a grey
// band of harder rock; each edge never sharper than a pixel and a half
vec3 strata(vec2 uv, float sc, float e) {
  float k = 20.0 / sc;
  float s = uv.y * k + e + 0.8 * noise(vec2(uv.x * 2.0 / sc, e)) + 0.4 * noise(vec2(uv.y * 5.0 / sc, e + 3.0));
  float b = floor(s), f = fract(s);
  float hb0 = hash11(b * 1.71 + e), hb1 = hash11((b + 1.0) * 1.71 + e);
  vec3 c0 = hb0 > 0.93 ? vec3(0.88, 0.85, 0.88) : TINT[int(hb0 * 4.29)];
  vec3 c1 = hb1 > 0.93 ? vec3(0.88, 0.85, 0.88) : TINT[int(hb1 * 4.29)];
  return mix(c0, c1, ss(1.0 - max(0.15, gPx * k * 1.5), 1.0, f));
}
// where rank i's shoulder line is lifted: the ridge we stand on climbs towards the left of the frame,
// so the valley opens between it and the chimneys on the right
float rankLift(float x, int i) { return i == 3 ? 0.24 * ss(-0.2 * gAsp, -gAsp - 0.1, x) : 0.0; }
// the crest of rank i's ridge at x: rounded crowns with sharp creases between them, the way soft
// tuff weathers
float ridge(float x, int i) {
  vec4 R = RK[i];
  float sc = RS[i].x;
  float n = noise(vec2(x * 1.5 / sc, R.w)) * 0.55 + abs(2.0 * noise(vec2(x * 4.3 / sc, R.w + 5.0)) - 1.0) * 0.33 + noise(vec2(x * 13.0 / sc, R.w + 9.0)) * 0.12;
  return R.x + R.y * (2.6 * n - 1.25) + rankLift(x, i);
}
// the cone of rank i's sub-row j (0 behind the ridge, 1 in front of it) that may cover x: centre x,
// foot y, height and half width at the foot, or a zero height. Within a sub-row they never overlap,
// so one is all a pixel needs to look at
vec4 coneAt(float x, int i, int j, out float capped, out float seed) {
  vec4 R = RK[i], S = RS[i];
  float fj = float(j);
  float cw = S.w * (1.0 + 0.4 * fj), off = cw * 0.5 * fj;
  float cell = floor((x + off) / cw);
  seed = cell * 1.37 + R.w + fj * 50.0;
  capped = 0.0;
  float cluster = ss(0.3, 0.62, noise(vec2(cell * cw * 1.7 / S.x, R.w + 1.0 + fj * 7.0)));
  if (hash11(seed) > CSH[i] * cluster) return vec4(0.0);
  float h1 = hash11(seed * 3.1 + 0.4), h2 = hash11(seed * 5.7 + 0.2), h3 = hash11(seed * 9.1 + 0.7);
  float xc = (cell + 0.5 + (h1 - 0.5) * 0.36) * cw - off;
  float W = cw * (0.17 + 0.14 * h2);
  capped = i == 3 ? 0.0 : step(0.74, h3);
  float H = W * mix((i == 3 ? 1.5 : 2.0) + 2.0 * h3 + 1.5 * cluster, 3.4 + 1.6 * h1, capped);
  return vec4(xc, ridge(xc, i) - H * (j == 0 ? 0.32 : 0.78), H, W);
}
// a cone or capped chimney of a rank, cheaply: its colour and cover. sy: the valley's shadow line
vec4 rankCone(vec2 uv, vec4 cn, float capped, float seed, float sy, float sc, vec3 tint, float blunt) {
  float dx = uv.x - cn.x, t = (uv.y - cn.y) / cn.z;
  if (cn.z <= 0.0 || t < 0.0 || t > 1.3 || abs(dx) > cn.w * 1.05) return vec4(0.0);
  float tc = min(t, 1.0), u = 1.0 - tc;
  float hw = capped > 0.5 ? cn.w * (0.32 + 0.3 * u + 0.38 * u * u * u) : cn.w * mix(0.7 * u + 0.3 * sqrt(u), 0.45 * u + 0.55 * sqrt(u), blunt);
  hw *= 1.0 + 0.12 * sin(tc * 8.0 + seed * 7.0) * u;
  float a = t > 1.0 ? 0.0 : ss(gPx, -gPx, abs(dx) - hw);
  float nx = clamp(dx / max(hw, 1e-4), -1.0, 1.0);
  float sunlit = ss(sy - 0.015 * sc, sy + 0.015 * sc, uv.y - 0.12 * dx);
  float v = rockV(normalize(vec3(nx, 0.18 + 0.5 * cn.w / cn.z, sqrt(1.0 - nx * nx))), sunlit) * mix(0.72, 1.0, ss(0.0, 0.35, tc));
  vec3 c = rockRamp(v) * tint;
  c += vec3(0.75, 0.42, 0.2) * ss(-0.6, -1.0, nx) * sunlit;                          // the gold edge
  if (capped > 0.5) {
    vec2 cq = vec2(dx, uv.y - cn.y - cn.z - cn.w * 0.05) / (cn.w * vec2(0.6, 0.26));
    float cap = ss(gPx, -gPx, (length(vec2(cq.x, cq.y * (cq.y > 0.0 ? 0.85 : 2.2))) - 1.0) * cn.w * 0.26);
    vec3 cc = vec3(0.1, 0.08, 0.12) + vec3(0.75, 0.42, 0.2) * ss(0.0, -1.0, cq.x) * ss(-0.5, 0.6, cq.y) * sunlit * 0.8;
    c = mix(c, cc, cap);
    a = max(a, cap);
  }
  return vec4(c, a);
}
// rank i's ridge below its crest top: ribs between rain gullies, larger buttresses under the
// crowns, the face turning with the crest's slope near the top and the valley's shadow lower down
vec4 rankFace(vec2 uv, int i, float top, float sy, vec3 tint) {
  vec4 R = RK[i], S = RS[i];
  float sc = S.x, d = top - uv.y;
  float e = 0.012 * sc;
  float slope = (ridge(uv.x + e, i) - ridge(uv.x - e, i)) / (2.0 * e);
  float a = ss(-gPx, gPx, d / sqrt(1.0 + slope * slope));
  if (a <= 0.0) return vec4(0.0);
  float nearTop = exp(-d / (0.06 * sc));
  vec3 n = vec3(-clamp(slope, -3.0, 3.0) * 0.5 * (0.3 + 0.7 * nearTop), 0.2 + 0.6 * nearTop, 1.0);
  float wob = noise(vec2(uv.x * 1.6 / sc, R.w + 4.0));
  float deep = ss(0.002, 0.05 * sc, d);
  // buttresses, a few to each crown, turning the face towards the sun and away
  n.x += (noise(vec2(uv.x / (0.05 * sc) + 2.0 * wob, R.w + 6.0)) - 0.5) * 1.3 * deep;
  if (i == 3) {
    // the nearest ridge, weathered smooth: soft bulges and hollows rather than gullies
    n.x += (noise(vec2(uv.x / (0.07 * sc) + 2.0 * wob, d / (0.12 * sc) + R.w)) - 0.5) * 1.5 * deep;
    n.y += (noise(vec2(uv.x / (0.05 * sc), d / (0.09 * sc) + R.w + 3.0)) - 0.5) * 0.45 * deep;
  } else {
    // the ribs between the gullies, faded out where they would be finer than a few pixels
    float rw = 0.024 * sc;
    float ru = uv.x / rw + 3.0 * wob + 1.8 * noise(vec2(uv.x / rw * 0.17, d / rw * 0.1 + R.w));    // gullies wander as they run down
    float fu = fract(ru) * 2.0 - 1.0;
    float k = 2.0 * gPx / rw;
    n.x += fu * ss(0.0, k * 1.5, 1.0 - abs(fu)) * deep * ss(0.6, 0.25, k) * (0.3 + 0.7 * noise(vec2(uv.x * 4.0 / sc, R.w + 3.0))) * 0.8;
  }
  n = normalize(n);
  float sunlit = ss(sy - 0.012 * sc, sy + 0.012 * sc, uv.y);
  float back = i == 3 ? ss(-0.2 * gAsp, -0.7 * gAsp, uv.x) : 0.0;             // between us and the sun
  sunlit *= 1.0 - back;
  float v = rockV(n, sunlit) * mix(1.0, 0.75, ss(0.0, 0.3 * sc, sy - uv.y));
  v += 0.45 * ss(0.009 * sc, 0.0, d) * ss(0.4, -0.5, n.x);                       // the crest catching the first light
  vec3 c = rockRamp(v) * tint * (0.93 + 0.14 * noise(uv * vec2(16.0, 36.0) / sc));
  // the caves cut into the walls of the valley, a few of them lit, each on its own slice of the spectrum
  if (i == 1 || i == 2) {
    vec2 g = uv / (vec2(0.011, 0.015) * sc);
    vec2 gc = floor(g), gf = fract(g) - 0.5;
    float hh = hash21(gc + R.w) / ss(0.5, 0.75, noise(gc * 0.12 + R.w));        // in a few villages, not everywhere
    if (hh < 0.12 && d > 0.025 * sc) {
      float dot_ = exp(-dot(gf, gf) * 18.0);
      float on = step(hh, 0.05);
      float glow = 0.5 + 1.4 * band(0.1 + 0.55 * hash21(gc + 3.7));
      c = mix(c, c * 0.4, dot_ * (1.0 - on) * 0.8);
      c += vec3(1.3, 0.62, 0.24) * glow * dot_ * on;
    }
  }
  return vec4(c, a);
}
// one whole rank, over col: the cones behind its ridge, the ridge, and the cones standing in front
vec3 drawRank(vec2 uv, vec3 col, int i, float top) {
  vec4 R = RK[i], S = RS[i];
  float lift = rankLift(uv.x, i);
  if (uv.y > R.x + R.y * 1.4 + lift + S.w * 1.25) return col;           // above its crest and its tallest cone
  float sc = S.x;
  vec3 tint = strata(uv, sc, R.w) * RT[i];
  float sy = R.x + lift + R.y * S.z + 0.05 * sc * (noise(vec2(uv.x * 2.4 / sc, R.w + 9.0)) - 0.5);
  vec3 hz = hazeAt(uv.x);
  float capped, seed;
  vec4 cn = coneAt(uv.x, i, 0, capped, seed);
  vec4 c = rankCone(uv, cn, capped, seed, sy, sc, tint, i == 3 ? 1.0 : 0.0);
  col = mix(col, mix(c.rgb, hz, S.y), c.a);
  if (uv.y < top + gPx * 2.0) {
    c = rankFace(uv, i, top, sy, tint);
    col = mix(col, mix(c.rgb, hz, S.y * (1.0 - 0.2 * ss(0.12 * sc, 0.0, top - uv.y))), c.a);
  }
  cn = coneAt(uv.x, i, 1, capped, seed);
  c = rankCone(uv, cn, capped, seed, sy, sc, tint, i == 3 ? 1.0 : 0.0);
  c.a *= ss(cn.y, cn.y + 0.15 * cn.z, uv.y);                                       // its foot lost in the face
  col = mix(col, mix(c.rgb, hz, S.y), c.a);
  return col;
}
// One fairy chimney close in front, foot at (xc, yb), H to the top of its neck (or its blunt tip),
// half width w at the foot; capped: under a basalt hat or a bare cone. The sun reaches it above sunY;
// win is the share of places on it carved with a door or window.
vec4 chimney(vec2 uv, float xc, float yb, float H, float w, float capped, float seed, float sunY, float win, float sc) {
  float dx = uv.x - xc, t = (uv.y - yb) / H;
  if (t < -0.03 || t > 1.4 || abs(dx) > w * 1.5) return vec4(0.0);
  float h1 = hash11(seed * 3.7), h2 = hash11(seed * 5.3), h3 = hash11(seed * 7.9);
  float tilt = (h1 - 0.5) * 0.7 * w;
  float lean = tilt * t * t;
  float tc = clamp(t, 0.0, 1.0), u = 1.0 - tc;
  // a slender neck flaring into a skirt of fallen tuff, or a cone with a blunt tip
  float hw = capped > 0.5 ? w * (0.22 + 0.3 * u + 0.48 * u * u * u) * (1.0 - 0.16 * ss(0.8, 0.97, tc))
                          : w * (0.62 * u + 0.38 * sqrt(u)) * (1.0 + 0.25 * u * u * u * u) * (1.0 - 0.06 * sin(u * 3.1));
  hw *= 1.0 + 0.16 * (noise(vec2(tc * 3.5, seed)) - 0.5) + 0.06 * (noise(vec2(tc * 19.0, seed + 2.0)) - 0.5);
  float dB = t > 1.0 ? 1.0 : abs(dx - lean) - hw;
  float aB = ss(gPx, -gPx, dB);
  // the basalt hat: flat underneath, a low lumpy dome above, a little askew and wider than the neck
  float aC = 0.0, chh = 1.0;
  vec2 cq = vec2(0.0);
  if (capped > 0.5) {
    float cw = w * (0.46 + 0.16 * h2);
    chh = w * (0.24 + 0.12 * h3);
    cq = vec2(dx - tilt - 0.08 * w * (h3 - 0.5), uv.y - yb - H - chh * 0.2) / vec2(cw, chh);
    float ca = atan(cq.y, cq.x);
    float up = cq.y > 0.0 ? cq.y / 1.3 + abs(cq.x) * 0.25 + 0.12 * cq.x : cq.y / 0.5;
    float lump = 0.22 * (noise(vec2(ca * 2.2, seed)) - 0.5) + 0.09 * (noise(vec2(ca * 7.0, seed + 4.0)) - 0.5);   // a boulder, not a mushroom
    aC = ss(gPx / chh, -gPx / chh, length(vec2(cq.x, up)) - 1.0 - lump);
  }
  float a = max(aB, aC);
  if (a <= 0.0) return vec4(0.0);
  float sunlit = ss(sunY - 0.02 * sc, sunY + 0.02 * sc, uv.y + 0.03 * sc * (noise(vec2(uv.x * 7.0 / sc, seed)) - 0.5) - 0.15 * (uv.x - xc));
  vec3 col;
  if (aC > 0.0 && (aC >= aB || t > 0.97)) {
    float cx = clamp(cq.x, -1.0, 1.0);
    vec3 n = normalize(vec3(cx, max(cq.y, 0.0) * 1.3 + 0.3, sqrt(max(1.0 - cx * cx, 0.0))));
    float v = rockV(n, sunlit) * (0.65 + 0.7 * noise(vec2(cq.x * 5.0, cq.y * 3.5) + seed));
    col = rockRamp(v) * vec3(0.23, 0.19, 0.21);                                               // dark basalt
    col += vec3(1.0, 0.56, 0.26) * pow(ss(-0.35, -1.0, cx), 2.0) * sunlit * ss(-0.6, 0.3, cq.y);   // its gold edge
    col += vec3(0.26, 0.14, 0.08) * ss(0.1, 0.9, cq.y) * sunlit * ss(0.6, -0.5, cx);            // its sunlit crown
    col *= 1.0 - 0.6 * ss(0.0, -0.8, cq.y);                                                   // its underside
  } else {
    float nx = clamp((dx - lean) / max(hw, 1e-4), -1.0, 1.0);
    float nz = sqrt(1.0 - nx * nx);
    float th = asin(nx);
    // flutes washed down the soft tuff by the rain, faded out where they would be finer than a few pixels
    float K = 5.0 + 3.0 * h2;
    float ru = th * K + seed * 6.0 + 1.2 * noise(vec2(th * 2.0, tc * 3.0 + seed));
    float fl = sin(ru) * ss(2.0, 5.0, hw * nz / K / gPx) * (0.4 + 0.6 * noise(vec2(th * 3.0 + seed, tc * 2.5)));
    vec3 n = normalize(vec3(nx + fl * 0.5, 0.16 + 0.55 * w / H, nz));
    vec3 tint = strata(uv, sc * 1.4, seed * 0.13);
    tint = mix(tint, TINT[3] * 1.04, ss(0.78, 0.9, tc) * capped);                        // the pale neck under the hat
    float hole = 0.0;
    if (capped < 0.5 && win > 0.2) {
      // a dovecote band, whitewashed with an ochre border, its row of holes for the pigeons
      float db = (tc - 0.6) / 0.075;
      tint = mix(tint, vec3(1.16, 1.12, 1.06), ss(-0.06, 0.0, db) * ss(1.06, 1.0, db) * 0.85);
      tint = mix(tint, vec3(1.08, 0.52, 0.38), max(ss(0.1, 0.03, abs(db)), ss(0.1, 0.03, abs(db - 1.0))) * 0.8);
      float hx = (fract(th / 0.2 + 0.5) - 0.5) * 0.2 * hw * max(nz, 0.15);
      hole = ss(gPx, -gPx, max(abs(hx) - 0.028 * w, abs(db - 0.5) * 0.075 * H - 0.034 * w));
    }
    tint *= 0.9 + 0.2 * noise(vec2(th * 2.5 + seed, tc * H / w * 1.5));                      // weathering
    tint *= 1.0 - 0.18 * ss(0.55, 0.85, noise(vec2(th * 4.0 + seed, tc * 1.5))) * ss(0.45, 1.0, tc) * capped;   // dark rain streaks from the basalt
    float v = rockV(n, sunlit) * (1.0 + 0.2 * fl) * (0.88 + 0.24 * noise(uv * vec2(70.0, 110.0) / sc));   // flutes and pitting, in the shade too
    v *= 1.0 - 0.85 * hole;
    v *= 1.0 - 0.42 * capped * ss(0.86, 0.99, tc) * ss(-0.5, 0.3, nx + 0.4);              // the hat's shadow on the neck
    v *= 1.0 - 0.3 * ss(0.22, 0.0, tc);                                                   // the dark at its foot
    col = rockRamp(v) * tint;
    col += vec3(0.8, 0.44, 0.2) * pow(ss(-0.6, -1.0, nx), 1.5) * sunlit;                  // the gold edge towards the sun
    // carved doors and windows; the lit ones follow their own slice of the spectrum
    if (win > 0.0 && abs(th) < 1.05 && tc > 0.05 && tc < 0.8) {
      vec2 g = vec2(th / 0.55 + seed * 3.1, tc / 0.14 + seed);
      vec2 gc = floor(g), gf = fract(g) - 0.5;
      float hh = hash21(gc + seed * 7.0);
      if (hh < win) {
        float door = step(gc.y - seed, 0.5) * step(hh, win * 0.6);
        float wx = (gc.x + 0.5 + (hash21(gc + 1.3) - 0.5) * 0.3 - seed * 3.1) * 0.55;
        float fs = cos(wx);                                                  // seen at a slant towards the outline
        vec2 o = vec2((sin(th) - sin(wx)) * hw, (gf.y - 0.1) * 0.14 * H);
        float ww = (door > 0.5 ? 0.1 : 0.065) * w * fs, wh = (door > 0.5 ? 0.22 : 0.085) * w;
        float dw = min(max(abs(o.x) - ww, abs(o.y + wh * 0.3) - wh * 0.7), length((o - vec2(0.0, wh * 0.4)) * vec2(1.0 / max(fs, 0.2), 1.0)) * fs - ww);
        float wn = ss(gPx, -gPx, dw);
        float on = step(hash21(gc + seed * 3.0 + 4.0), 0.5);
        float glow = 0.55 + 1.3 * band(0.08 + 0.6 * hash21(gc + seed + 2.0));
        vec3 wc = mix(vec3(0.035, 0.025, 0.05), vec3(1.3, 0.6, 0.2) * glow, on);
        wc = mix(wc, col * 0.75, ss(ww * 0.35, ww * 0.95, o.x) * sunlit * (1.0 - on));     // the lit inner side of the cut
        col *= 1.0 - 0.35 * ss(ww * 0.7, 0.0, dw - ww * 0.1) * (1.0 - wn);                 // the cut's edge
        col = mix(col, wc, wn);
        col += vec3(0.6, 0.24, 0.07) * on * glow * 0.35 * exp(-max(dw, 0.0) / (ww * 1.2)) * (1.0 - wn);
      }
    }
  }
  return vec4(col, a);
}

// ── mist, the valley floor, the far land ───────────────────────────────────────────────────
// mist lying on the valley floor at floorY: thickest just over the floor, thinning upwards
vec3 mist(vec2 uv, vec3 col, float floorY, float thick, float amt, float seed) {
  float rise = 1.0 + 1.2 * gMid;
  float h = (uv.y - floorY) / (thick * rise);
  if (h > 4.0 || h < -3.0) return col;
  float flow = gT * 0.012 + gMid * 0.2;
  vec2 mq = vec2(uv.x * 2.4 - flow * 2.0 + seed, uv.y * 9.0 / rise);
  float n = noise(mq) * 0.55 + noise(mq * vec2(2.6, 2.2) + vec2(flow * 3.0, seed)) * 0.3 + noise(mq * 6.0) * 0.15;
  float prof = h > 0.0 ? exp(-h * 1.1) : ss(-3.0, 0.0, h);
  float patch_ = ss(0.3, 0.7, noise(vec2(uv.x * 0.9 - flow * 0.6 + seed, seed * 2.0)));
  float dens = prof * ss(0.4, 0.82, n + 0.1 * patch_ - 0.06 * abs(h)) * amt * (0.4 + 0.6 * patch_) * (0.8 + 0.5 * gMid);
  float s = sunSide(uv.x);
  vec3 mc = mix(vec3(0.3, 0.32, 0.55), vec3(0.98, 0.64, 0.52), s * 0.75 * ss(-1.0, 2.5, h));
  return mix(col, mc, clamp(dens, 0.0, 0.7));
}
float floorTop(float x) { return -0.55 + 0.014 * noise(vec2(x * 4.0, 2.0)); }
// the valley floor: fields, poplars and the town of Göreme, still in the night's shadow, its windows
// lit, each house on its own slice of the spectrum
vec4 valleyFloor(vec2 uv, float top) {
  if (uv.y > top + 0.11) return vec4(0.0);
  float aG = ss(-gPx, gPx, top - uv.y);
  // fields, foreshortened into long thin strips across the floor
  vec3 g = vec3(0.06, 0.07, 0.16);
  float fy = (top - uv.y) / 0.014;
  float fr = floor(fy);
  float fld = hash21(vec2(floor(uv.x / 0.07 + hash11(fr * 3.7) * 5.0), fr));
  g *= 0.9 + 0.16 * fld * ss(0.0, 0.3, abs(fract(fy) - 0.5) * 2.0);
  g = mix(g, vec3(0.13, 0.1, 0.14), step(0.75, fld) * 0.35);
  g *= 0.88 + 0.24 * noise(uv * vec2(40.0, 120.0));
  vec4 acc = vec4(g * aG, aG);
  // the town: rows of low stone houses stepping up the far side of the valley
  float tx = uv.x - gTown;
  float inTown = ss(0.55 * gTownW, 0.3 * gTownW, abs(tx));
  if (inTown > 0.0) {
    for (int row = 2; row >= 0; row--) {
      float fr = float(row);
      float cw = 0.024 - 0.004 * fr;
      float id = floor(tx / cw);
      float hh = hash21(vec2(id, fr + 3.0));
      if (hh > inTown * 0.62) continue;
      float x0 = (id + 0.12 + 0.1 * hash21(vec2(id, fr + 7.0))) * cw, x1 = (id + 0.88 - 0.1 * hash21(vec2(id, fr + 9.0))) * cw;
      float yb = top - 0.012 + fr * 0.011 + 0.004 * hash21(vec2(id, fr + 1.0));
      float hgt = 0.009 + 0.016 * hash21(vec2(id, fr + 5.0)) * hash21(vec2(id, fr + 6.0));
      float dome = step(0.85, hash21(vec2(id, fr + 11.0)));
      float rr = clamp((tx - (x0 + x1) * 0.5) / ((x1 - x0) * 0.4), -1.0, 1.0);
      float roof = yb + hgt + dome * sqrt(1.0 - rr * rr) * (x1 - x0) * 0.35;
      float hx = min(tx - x0, x1 - tx);
      float aH = ss(-gPx, gPx, hx) * ss(-gPx, gPx, roof - uv.y) * step(yb - 0.02, uv.y);
      if (aH <= 0.0) continue;
      vec3 stone = mix(vec3(0.26, 0.22, 0.34), vec3(0.34, 0.27, 0.34), hash21(vec2(id, fr + 13.0)));
      stone *= 1.0 - 0.3 * ss(0.0, 0.25, (tx - x0) / (x1 - x0));                // the sunward end is lighter
      stone += vec3(0.45, 0.24, 0.14) * ss(gPx * 2.0, 0.0, roof - uv.y) * 0.4;       // the dawn on the roof's edge
      // windows: one to three, most of them lit
      float nW = 1.0 + floor(hash21(vec2(id, fr + 17.0)) * 2.99);
      float wc = (tx - x0) / (x1 - x0) * nW;
      float wi = floor(wc), wf = fract(wc) - 0.5;
      float ww = max(0.0016, gPx * 0.8);
      float win = ss(ww + gPx * 0.5, ww - gPx * 0.5, abs(wf) * (x1 - x0) / nW) * ss(0.0035 + gPx * 0.5, 0.0035 - gPx * 0.5, abs(uv.y - yb - hgt * 0.55));
      float on = step(0.3, hash21(vec2(id * 3.0 + wi, fr + 19.0)));
      float glow = 0.6 + 1.3 * band(0.2 + 0.5 * hash21(vec2(id, fr + 23.0)));
      stone = mix(stone, mix(vec3(0.03, 0.025, 0.04), vec3(1.3, 0.62, 0.24) * glow, on), win);
      acc = vec4(stone * aH + acc.rgb * (1.0 - aH), aH + acc.a * (1.0 - aH));
    }
    // the mosque's minaret over the roofs, its balcony lit
    vec2 m = uv - vec2(gTown + 0.05, top + 0.012);
    if (abs(m.x) < 0.01 && m.y < 0.085 && m.y > -0.02) {
      float sh = ss(gPx, -gPx, abs(m.x) - 0.0042) * step(m.y, 0.062);
      float cap = ss(gPx, -gPx, abs(m.x) - 0.0045 * (0.085 - m.y) / 0.023) * step(0.062, m.y);
      float bal = ss(gPx, -gPx, abs(m.x) - 0.0068) * ss(gPx, -gPx, abs(m.y - 0.045) - 0.0018);
      float a = max(max(sh, cap), bal);
      vec3 c = mix(vec3(0.42, 0.36, 0.46), vec3(0.6, 0.38, 0.3), ss(0.0, -0.004, m.x)) * (0.7 + 0.3 * ss(0.0, 0.06, m.y));
      c = mix(c, vec3(1.2, 0.6, 0.25) * (0.7 + 0.8 * band(0.3)), bal * ss(0.0018 + gPx, 0.0, abs(m.y - 0.0475)));
      acc = vec4(c * a + acc.rgb * (1.0 - a), a + acc.a * (1.0 - a));
    }
  }
  // poplars in groves along the stream, their tops catching a little light
  float cw = 0.016;
  float cell = floor(uv.x / cw);
  for (int k = -1; k <= 1; k++) {
    float id = cell + float(k);
    float grove = ss(0.45, 0.6, noise(vec2(id * cw * 3.5, 6.0)));
    if (hash11(id * 2.3 + 0.7) > 0.8 * grove) continue;
    float x = (id + 0.5 + (hash11(id * 4.1) - 0.5) * 0.5) * cw;
    float H = 0.035 + 0.035 * hash11(id * 6.7);
    vec2 r = vec2(H * 0.14, H * 0.5);
    vec2 q = uv - vec2(x, top - 0.016 + r.y);
    float d = (length(q / r) - 1.0) * r.x;
    float pa = ss(gPx, -gPx, d);
    if (pa <= 0.0) continue;
    vec3 leaf = mix(vec3(0.06, 0.1, 0.13), vec3(0.34, 0.24, 0.09), step(0.72, hash11(id * 8.3)));
    vec3 pc = leaf * (0.75 + 0.5 * ss(-r.y, r.y, q.y)) + vec3(0.45, 0.22, 0.07) * ss(0.3, 1.0, q.y / r.y) * ss(0.0, -r.x, q.x) * 0.5;
    acc = vec4(pc * pa + acc.rgb * (1.0 - pa), pa + acc.a * (1.0 - pa));
  }
  if (acc.a <= 0.0) return vec4(0.0);
  return vec4(mix(acc.rgb / acc.a, hazeAt(uv.x), 0.16), acc.a);
}
// the far tableland, with Erciyes standing over it, snow on its shoulders pink with the dawn
float farTop(float x, float vx) {
  float h = -0.178 + 0.014 * noise(vec2(x * 2.5, 1.3)) + 0.006 * noise(vec2(x * 9.0, 2.1));
  float v = x - vx;
  float cone = 0.17 * pow(max(1.0 - abs(v) / 0.7, 0.0), 2.1) + 0.012 * noise(vec2(x * 14.0, 4.0)) * ss(0.35, 0.0, abs(v));
  return max(h, -0.2 + cone);
}
vec3 farLand(vec2 uv, vec3 col) {
  float vx = mix(gAsp * 0.12, 0.2, gPf);
  float top = farTop(uv.x, vx);
  float a = ss(-gPx, gPx, top - uv.y);
  if (a <= 0.0) return col;
  float v = uv.x - vx;
  float snow = ss(-0.105, -0.075, uv.y + 0.02 * noise(vec2(uv.x * 30.0, 3.0))) * ss(0.5, 0.15, abs(v));
  vec3 c = mix(vec3(0.44, 0.4, 0.6), vec3(0.66, 0.5, 0.6), sunSide(uv.x));
  float face = ss(0.0, -0.1, v);                                                  // the flank turned to the sun
  c = mix(c, mix(vec3(0.62, 0.6, 0.8), vec3(1.1, 0.72, 0.7), face), snow);      // alpenglow
  c += vec3(0.7, 0.42, 0.22) * ss(0.004, 0.0, top - uv.y) * (0.15 + 0.85 * sunSide(uv.x)) * (0.5 + 0.5 * noise(vec2(uv.x * 20.0, 5.0)));
  return mix(col, c, a);
}
// ── the hero cluster: tall chimneys close in front, on their own mound ───────────────────────
vec3 heroCluster(vec2 uv, vec3 col) {
  vec2 p = (uv - gHc) / gHs;
  if (abs(p.x) > 1.0 || p.y > 1.3) return col;
  float sc = gHs * 1.6;
  float sunY = gHc.y + 0.4 * gHs;
  // the mound they stand on: lumps of fallen tuff, its top in the first light on the left
  float mt = 0.15 * (1.0 - p.x * p.x / 0.9) + 0.06 * noise(vec2(p.x * 4.0, 1.0)) + 0.015 * noise(vec2(p.x * 19.0, 2.0)) - 0.01;
  float dM = (mt - p.y) * gHs;
  float aM = ss(-gPx, gPx, dM);
  if (aM > 0.0) {
    float lump = noise(vec2(p.x * 9.0, p.y * 5.0));
    vec3 n = normalize(vec3(p.x * 0.8 + (lump - 0.5) * 0.9, 0.55 + 0.4 * ss(0.06, 0.0, dM), 1.0));
    float sunlit = ss(sunY - 0.02, sunY + 0.02, uv.y + 0.08 * gHs * (p.x + 0.3));
    float v = rockV(n, sunlit) * (0.85 + 0.25 * noise(vec2(uv.x * 22.0, uv.y * 40.0)));
    v += 0.25 * ss(0.012, 0.0, dM) * ss(0.2, -0.7, p.x);
    col = mix(col, rockRamp(v) * strata(uv, sc, 7.0), aM);
  }
  for (int i = 0; i < 6; i++) {
    vec4 h = HC[i];
    float yb = gHc.y + h.y * gHs;
    vec4 c = chimney(uv, gHc.x + h.x * gHs, yb, h.z * gHs, h.w * gHs, HCAP[i], float(i) * 13.0 + 5.0,
                     sunY + 0.07 * float(i % 3) * gHs, HWIN[i], sc);
    c.a *= ss(yb, yb + 0.07 * gHs, uv.y);                                       // rooted in the mound
    col = mix(col, c.rgb, c.a);
  }
  return col;
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gPf = ss(1.15, 0.7, gAsp);                       // 1 for a phone held upright
  gT = uTime;
  gIdle = 1.0 - uAudioActive;
  float age = uBeatAge;
  gBurn = uAudioActive * mix(0.4, 1.0, uPunch) * ss(0.0, 0.03, age) * exp(-age * 4.5) * ss(0.45, 0.3, age);
  gSun = vec2(mix(-gAsp * 0.6, -0.27, gPf), -0.12);
  gL = normalize(vec3(-0.8, 0.25, 0.4));
  gLr = normalize(vec3(-0.9, 0.3, -0.05));        // the same sun, as the rock takes it: from the side, a touch behind
  gHc = vec2(mix(gAsp * 0.64, 0.16, gPf), -1.04);
  gHs = mix(1.0, 0.8, gPf);
  gTown = mix(-gAsp * 0.12, -0.12, gPf);
  gTownW = mix(1.1, 0.75, gPf);

  // what lies behind a rank that already covers this pixel is never drawn: from is the first layer
  // to draw (0 the sky, 1-3 the ranks of the far side, 4 the valley floor, 5 the near ridge)
  float pad = gPx * 2.0;
  float c0 = -9.0, c1 = -9.0, c2 = -9.0, c3 = -9.0, fT = -9.0;
  int from = 0;
  if (uv.y < -0.13) {                              // every crest lies below this
    c3 = ridge(uv.x, 3);
    fT = floorTop(uv.x);
    from = 5;
    if (uv.y > c3 - pad) {
      from = 4;
      if (uv.y > fT - pad) {
        from = 3;
        c2 = ridge(uv.x, 2);
        if (uv.y > c2 - pad) {
          from = 2;
          c1 = ridge(uv.x, 1);
          if (uv.y > c1 - pad) {
            from = 1;
            c0 = ridge(uv.x, 0);
            if (uv.y > c0 - pad) from = 0;
          }
        }
      }
    }
  }

  vec3 col = vec3(0.0);
  if (from == 0) {
    col = skyAt(uv);
    // thin dawn clouds, their undersides catching the sun
    if (uv.y > -0.12) {
      vec2 cq = vec2(uv.x * 0.6 + gT * 0.004, uv.y * 4.5);
      float n = fbm3(cq + vec2(2.0, 0.5));
      float m = ss(0.55, 0.78, n) * ss(-0.1, 0.1, uv.y) * ss(0.95, 0.5, uv.y);
      vec3 cc = mix(vec3(0.48, 0.42, 0.66), vec3(1.25, 0.66, 0.5), (0.3 + 0.7 * sunSide(uv.x)) * ss(0.45, 0.85, n) + 0.2);
      col = mix(col, cc, m * 0.55);
    }
    // rays fanning up from the sun
    vec2 toP = uv - gSun;
    float ang = atan(toP.x, toP.y);
    float rays = pow(noise(vec2(ang * 8.0, gT * 0.03)), 2.0) * 0.7 + pow(noise(vec2(ang * 21.0 + 5.0, gT * 0.05)), 3.0) * 0.5;
    col += vec3(1.1, 0.68, 0.36) * rays * exp(-length(toP) * 1.3) * ss(-0.02, 0.15, toP.y) * 0.22;
    // the sun
    float ds = length(toP);
    col += vec3(2.6, 2.0, 1.35) * ss(0.034 + gPx, 0.034 - gPx, ds) + vec3(1.5, 0.9, 0.45) * exp(-ds * 24.0) * 0.9 + vec3(0.9, 0.5, 0.2) * exp(-ds * 7.0) * 0.18;
    col = farLand(uv, col);
    col = balloonField(uv, col, 0);
  }
  if (from <= 1) {
    col = drawRank(uv, col, 0, c0);
    col = balloonField(uv, col, 1);
  }
  if (from <= 2) {
    col = drawRank(uv, col, 1, c1);
    col = mist(uv, col, -0.3, 0.012, 0.35, 7.0);
  }
  if (from <= 3) {
    col = drawRank(uv, col, 2, c2);
    col = balloonField(uv, col, 2);
  }
  if (from <= 4) {
    vec4 f = valleyFloor(uv, fT);
    col = mix(col, f.rgb, f.a);
    col = mist(uv, col, -0.55, 0.042, 0.85, 3.0);
  }
  // the low sun streaming across the valley through the gaps in the far ridge, seen in the haze
  if (uv.y < -0.1 && uv.y > -0.75) {
    vec2 toS = uv - gSun;
    float ang = atan(toS.y, toS.x);
    float shafts = ss(0.3, 0.85, noise(vec2(ang * 13.0, gT * 0.02))) * 0.75 + ss(0.45, 0.9, noise(vec2(ang * 31.0 + 4.0, gT * 0.03))) * 0.25;
    float reach = exp(-length(toS * vec2(0.5, 1.0)) * 1.3) * ss(-0.75, -0.5, uv.y) * ss(-0.1, -0.22, uv.y);
    col += vec3(0.95, 0.55, 0.28) * shafts * reach * 0.16;
  }
  col = drawRank(uv, col, 3, c3);
  col = balloonField(uv, col, 3);
  col = heroCluster(uv, col);
  col = mist(uv, col, -1.02, 0.05, 0.55, 11.0);                                   // and low over the ground in front

  // the near balloon
  {
    float bob = 0.012 * sin(gT * 0.35) + 0.006 * sin(gT * 0.83 + 1.0);
    gHero = vec2(mix(-gAsp * 0.22, -0.07, gPf) + 0.02 * sin(gT * 0.05), mix(0.36, 0.44, gPf) + bob + gBass * 0.07);
    gHeroR = mix(0.2, 0.165, gPf) * (1.0 + 0.045 * gBass);
    vec2 q = (uv - gHero) / gHeroR;
    if (abs(q.x) < 1.15 && q.y < 1.15 && q.y > -2.2) {
      float ph = fract(gT / 9.0 + 0.3);
      float burn = gBurn + gIdle * 0.7 * ss(0.0, 0.01, ph) * ss(0.12, 0.07, ph);
      vec4 b = balloon(q, gPx / gHeroR, vec3(0.82, 0.08, 0.06), vec3(0.98, 0.72, 0.1), 0.9, gT * 0.02, burn, 1.0, 1.0, 0.37);
      col = col * (1.0 - b.a) + b.rgb;
    }
  }
  // a little vignette and a dither against banding
  vec2 vq = uv / vec2(gAsp, 1.0);
  col *= 1.0 - 0.18 * ss(0.5, 1.5, dot(vq, vq));
  col += (hash21(gl_FragCoord.xy + fract(uTime * 7.1) * 97.0) - 0.5) * 0.006;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'cappadocia', name: 'Cappadocia', group: 'Vibe',
  blurb: 'Dawn over Göreme: fairy chimneys and rose tuff walls, mist in the blue valley, balloons everywhere; bass lifts them, beats fire burners',
  tags: ['turkish', 'balloons', 'landscape', 'dawn', 'warm', 'calm'], energy: 0.35, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
