import { SCULPT } from '../js/gfx/scene-kit.js';

// KERVAN — a camel caravan crossing the desert at night: five camels and their riders walking the
// crest of a long dune, the lead rider's lantern swinging on its pole, ranges of moonlit dunes
// going back to the horizon under a crescent moon and the Milky Way.
//
// The desert is a real height field, marched from the eye, so every dune has its windward slope,
// its sharp crest and its slip face in shadow from the moon; the eye travels with the caravan
// along the crest, and the whole land repeats over one long loop so the journey never jumps.
// The camels are silhouettes with walking legs (camels pace: both legs of a side together) set
// on the crest where they walk, so they rise and dip with it, the moon catching their backs.
//
// Music: the bass is wind, lifting sand off the crests in long plumes; the mids feed the lantern's
// flame and the warm pool it throws on the sand; the highs make the stars and the Milky Way
// glitter; each beat sends a shooting star across the sky; louder music makes the caravan walk on
// faster. With nothing playing the caravan walks on in a still night.
const frag = `${SCULPT}
const float P = 3600.0;                 // the land repeats every 3.6 km along the way
const float RIDGE_Z = -26.0;            // the crest the caravan walks along
const vec3 MOON_DIR = vec3(-0.82, 0.36, -0.36);
const vec3 MOONLIGHT = vec3(0.62, 0.70, 0.95);
const float LENS = 2.5;                 // a long lens: the dunes stack up behind the caravan
const vec3 SKYFILL = vec3(0.05, 0.065, 0.13);
const vec3 HAZE = vec3(0.10, 0.125, 0.24);
const vec3 LANTERN = vec3(1.0, 0.6, 0.24);

float gTravel, gPx, gStride;
vec3 gMoon;
vec3 gLamp;            // the lantern, in the world
float gFlame;

// value noise that wraps every P along x, so the land is seamless round its loop
float pnoise(vec2 p, float period) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(vec2(mod(i.x, period), i.y)), b = hash21(vec2(mod(i.x + 1.0, period), i.y));
  float c = hash21(vec2(mod(i.x, period), i.y + 1.0)), d = hash21(vec2(mod(i.x + 1.0, period), i.y + 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// a dune's cross-section: a long gentle windward slope up to a sharp crest, a steep slip face down
float duneProfile(float u) {
  u = fract(u);
  return u < 0.72 ? pow(u / 0.72, 1.35) : pow((1.0 - u) / 0.28, 1.9);
}
float landHeight(vec2 q) {
  float x = q.x, z = q.y;
  float k = TAU / P;
  float beyond = max(0.0, -z - 45.0);                                   // metres past the caravan's dune
  // the ranges behind: crests running at a slant across the view and wandering, every rank a
  // little taller than the one before it, so each shows over the last as they go back to the
  // horizon (the slant's x term makes whole turns over P, so the land still loops)
  float wander = sin(x * k * 7.0 + 1.3) * 26.0 + sin(x * k * 23.0 + 0.4) * 8.0 + (pnoise(vec2(x / 72.0, z / 72.0), P / 72.0) - 0.5) * 24.0;
  float rank = (-z * 0.92 + x * (12.0 * 140.0 / P) + wander) / 140.0;
  float tall = (9.0 + beyond * 0.055) * (0.72 + 0.4 * pnoise(vec2(x / 240.0, floor(rank) * 3.1), P / 240.0));
  float big = duneProfile(rank) * tall;
  float small = duneProfile((-z * 0.8 + wander * 0.4 + x * (30.0 * 34.0 / P)) / 34.0) * (1.6 + beyond * 0.01);
  // the caravan's own dune: one long smooth crest along the way
  float ridge = 7.5 * exp(-pow((z - RIDGE_Z) / 9.5, 2.0)) * (0.88 + 0.12 * sin(x * k * 60.0));
  float behind = ss(-38.0, -70.0, z);                                   // the ranges rise up beyond it
  return max(ridge, mix(small * 0.5 + 0.6, big + small, behind)) + 0.3 * sin(x * (round(P * 0.11 / TAU) * k) + z * 0.07);
}
vec3 landNormal(vec2 q, float t) {
  float e = 0.02 + t * 0.002;
  float h = landHeight(q);
  return normalize(vec3(h - landHeight(q + vec2(e, 0.0)), e, h - landHeight(q + vec2(0.0, e))));
}

// ── the caravan ─────────────────────────────────────────────────────────────────────────────
float seg(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)) - r;
}
float seg2(vec2 p, vec2 a, vec2 b, float ra, float rb) {   // a tapered limb
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
float ell(vec2 p, vec2 c, vec2 r) { vec2 q = (p - c) / r; return (length(q) - 1.0) * min(r.x, r.y); }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
// one leg, hip to hoof: a thick upper leg, a knee, a long thin shank, a splayed foot
float leg(vec2 p, vec2 hip, float phase, float hind) {
  float c = cos(phase), s = sin(phase);
  vec2 foot = vec2(hip.x + 0.24 * s, 0.13 * max(c, 0.0));
  vec2 knee = vec2(hip.x + 0.12 * s + (hind > 0.5 ? -0.05 : 0.06) + 0.05 * max(c, 0.0), 0.5 + 0.06 * max(c, 0.0));
  float d = seg2(p, hip, knee, 0.085, 0.045);
  d = smin(d, seg2(p, knee, foot + vec2(0.0, 0.06), 0.04, 0.03), 0.02);
  d = min(d, ell(p, foot + vec2(0.04, 0.035), vec2(0.08, 0.035)));
  return d;
}
// a dromedary in its own units (hooves on y = 0, 2.1 m to the top of the hump, facing right)
// with a rider wrapped in a cloak, or with bundles of goods
float camel(vec2 p, float phase, float id) {
  vec2 q = p - vec2(0.0, 0.02 * sin(phase * 2.0));
  float nod = 0.03 * sin(phase);                                              // the head nods with the stride
  float d = ell(q, vec2(0.0, 1.2), vec2(0.58, 0.24));                         // the barrel of the body
  d = smin(d, ell(q, vec2(-0.1, 1.47), vec2(0.36, 0.3)), 0.12);              // the hump, high on the back
  d = smin(d, ell(q, vec2(-0.44, 1.18), vec2(0.2, 0.22)), 0.1);              // the haunch
  d = smin(d, ell(q, vec2(0.38, 1.17), vec2(0.2, 0.24)), 0.1);               // the deep chest
  d = smin(d, seg2(q, vec2(0.46, 1.24), vec2(0.8, 1.06), 0.19, 0.11), 0.08);  // the neck drops from the shoulder...
  d = smin(d, seg2(q, vec2(0.8, 1.06), vec2(0.96, 1.5 + nod), 0.11, 0.085), 0.08); // ...and rises to the head
  d = smin(d, ell(q, vec2(1.03, 1.56 + nod), vec2(0.15, 0.1)), 0.05);         // the head
  d = smin(d, ell(q, vec2(1.19, 1.5 + nod), vec2(0.1, 0.075)), 0.04);         // the heavy muzzle
  d = min(d, seg(q, vec2(0.97, 1.64 + nod), vec2(0.95, 1.71 + nod), 0.022));  // the ear
  d = min(d, seg2(q, vec2(-0.6, 1.26), vec2(-0.68, 0.9), 0.04, 0.02));        // tail
  // camels pace: the two legs of one side move together, so the far pair is half a stride behind
  d = smin(d, leg(q, vec2(0.36, 1.04), phase, 0.0), 0.04);
  d = smin(d, leg(q, vec2(-0.42, 1.04), phase, 1.0), 0.04);
  d = smin(d, leg(q, vec2(0.28, 1.04), phase + PI, 0.0), 0.04);
  d = smin(d, leg(q, vec2(-0.5, 1.04), phase + PI, 1.0), 0.04);
  if (hash11(id * 7.1 + 0.3) > 0.3) {
    // a rider wrapped in a cloak, sitting on a saddle behind the hump, the cloth falling over it
    float r = ell(q, vec2(-0.16, 1.92), vec2(0.15, 0.25));
    r = smin(r, ell(q, vec2(-0.16, 1.7), vec2(0.3, 0.1)), 0.08);
    r = smin(r, ell(q, vec2(-0.13, 2.22), vec2(0.08, 0.095)), 0.04);         // the head, wrapped
    r = min(r, seg2(q, vec2(-0.2, 2.26), vec2(-0.34, 2.02), 0.035, 0.015));  // the tail of the head cloth
    r = min(r, seg2(q, vec2(-0.08, 1.98), vec2(0.16, 1.82), 0.045, 0.03));   // an arm on the halter
    r = min(r, seg2(q, vec2(-0.14, 1.66), vec2(-0.08, 1.32), 0.06, 0.04));   // a leg hanging down the side
    d = min(d, r);
  } else {
    // goods: a bale lashed across the hump and two saddle bags hanging low on its sides
    d = min(d, ell(q, vec2(-0.1, 1.82), vec2(0.33, 0.17)));
    d = smin(d, ell(q, vec2(-0.12, 1.44), vec2(0.42, 0.2)), 0.05);
    d = min(d, seg(q, vec2(-0.34, 1.97), vec2(0.1, 1.97), 0.02));             // the rope over the bale
  }
  return d;
}

// ── the sky ─────────────────────────────────────────────────────────────────────────────────
vec3 skyColor(vec3 rd, vec2 uv) {
  float up = rd.y;
  vec3 col = mix(vec3(0.075, 0.095, 0.2), vec3(0.006, 0.01, 0.035), ss(0.0, 0.7, up));
  col += vec3(0.11, 0.13, 0.24) * exp(-max(up, 0.0) * 9.0) * 0.7;               // the glow along the horizon
  // the Milky Way: a tilted river of faint stars and glow with dark lanes of dust down it
  vec2 mw = rot(-0.55) * (uv - vec2(0.35, 0.42));
  float band = exp(-mw.y * mw.y * 7.0);
  float lanes = ss(0.5, 0.75, fbm(mw * vec2(2.0, 7.0) + 3.1));
  float cloud = fbm(mw * vec2(4.0, 11.0) - 1.7) * fbm(mw * 9.0 + 5.0) * 2.0;
  col += mix(vec3(0.20, 0.21, 0.32), pal(0.6 + mw.x * 0.05) * 0.4, 0.2) * band * cloud * (1.0 - 0.8 * lanes) * (0.5 + 0.25 * gHigh);
  // stars in three sizes, thickest in the band, each twinkling on its own
  for (int layer = 0; layer < 3; layer++) {
    float scale = 60.0 + float(layer) * 75.0;
    vec2 g = uv * scale + float(layer) * 17.3;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell);
    if (h > 0.07 + band * 0.22 * float(layer)) continue;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float r = length(f - off * 0.7) / scale;
    float bright = (0.12 + pow(hash21(cell + 1.3), 6.0) * 3.2) / (1.0 + float(layer) * 1.4);
    float tw = 0.8 + 0.2 * sin(uTime * (1.5 + h * 9.0) + h * 40.0) + gHigh * 0.5 * sin(uTime * 11.0 + h * 90.0);
    float px = gPx * 0.75;
    col += mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.7), hash21(cell + 9.0)) * bright * tw * exp(-r * r / (px * px));
  }
  // the crescent moon and its halo
  vec2 mp = uv - vec2(-1.02, 0.6);
  float moon = ss(0.061, 0.056, length(mp)) * ss(0.042, 0.05, length(mp - vec2(0.028, 0.017)));
  col += vec3(1.0, 0.97, 0.88) * moon * 1.5;
  col += vec3(0.42, 0.5, 0.8) * exp(-length(mp) * 5.5) * 0.18;
  // a shooting star on the beat, gone well within the beat
  if (uBeatAge < 0.5 && uAudioActive > 0.5) {
    float n = uBeatCount;
    vec2 start = vec2(-1.3 + 2.6 * hash11(n * 1.31), 0.38 + 0.5 * hash11(n * 2.77));
    vec2 dir = normalize(vec2(hash11(n * 3.3) < 0.5 ? -1.0 : 1.0, -0.38 - 0.3 * hash11(n * 5.1)));
    float life = uBeatAge / 0.45;
    vec2 head = start + dir * life * 0.8;
    vec2 rel = uv - head;
    float along = -dot(rel, dir), across = abs(dot(rel, vec2(-dir.y, dir.x)));
    float tail = ss(-0.005, 0.01, along) * ss(0.3 * life + 0.02, 0.0, along) * ss(gPx * 1.5, 0.0, across);
    col += vec3(0.9, 0.95, 1.0) * (tail * 0.9 + exp(-dot(rel, rel) / (gPx * gPx * 4.0))) * sin(min(life, 1.0) * PI) * uPunch;
  }
  return col;
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gTravel = mod(uCruise * 1.3, P);
  gStride = gTravel / 1.8 * TAU;              // one full pace every 1.8 m
  gMoon = normalize(MOON_DIR);
  gFlame = 0.75 + 0.25 * sin(uTime * 17.0) * sin(uTime * 7.3) + gMid * 0.9;

  // the eye walks with the caravan, a little below and to the side of its crest
  vec3 ro = vec3(gTravel, 5.6 + 0.2 * sin(uTime * 0.13), 4.0);
  vec3 rd = viewRay(ro, ro + vec3(0.0, 4.4, -26.0), uv, LENS);
  // the lead camel and its rider's lantern, which also lights the sand
  vec3 lead = vec3(gTravel - 8.5 + 4.0 * 4.3, 0.0, RIDGE_Z);
  lead.y = landHeight(lead.xz) - 0.08;
  gLamp = lead + vec3(0.62 + sin(uTime * 1.4 + gStride * 0.5) * 0.06, 2.42, 0.0);

  // ── the land ─────────────────────────────────────────────────────────────────────────────
  float t = 0.2, tHit = -1.0, tPrev = 0.2;
  for (int i = 0; i < 140; i++) {
    vec3 p = ro + rd * t;
    float d = p.y - landHeight(p.xz);
    if (d < 0.002 * t) { tHit = t; break; }
    tPrev = t;
    t += max(d * 0.5, 0.004 * t);
    if (t > 4000.0 || p.y > 140.0) break;
  }
  // close in on the exact crossing, so far crests are clean lines and not stair-steps
  if (tHit > 0.0) {
    float lo = tPrev, hi = tHit;
    for (int j = 0; j < 6; j++) {
      float mid = (lo + hi) * 0.5;
      vec3 p = ro + rd * mid;
      if (p.y - landHeight(p.xz) < 0.0) hi = mid; else lo = mid;
    }
    tHit = hi;
  }
  vec3 col = skyColor(rd, uv);
  if (tHit > 0.0) {
    vec3 p = ro + rd * tHit;
    vec3 n = landNormal(p.xz, tHit);
    // wind ripples close by: fine wavering ridges across the slope, faint, fading with distance
    float ripW = (1.0 - ss(10.0, 45.0, tHit)) * (0.4 + 0.6 * pnoise(vec2(p.x * 0.08, p.z * 0.08), P * 0.08));
    float rip = sin(p.x * 3.1 + p.z * 4.2 + pnoise(vec2(p.x * 0.25, p.z * 0.25), P * 0.25) * 7.0);
    n = normalize(n + vec3(0.6, 0.0, 0.8) * rip * 0.035 * ripW);
    float diff = max(dot(n, gMoon), 0.0);
    vec3 sand = vec3(0.9, 0.78, 0.62);
    vec3 c = sand * (MOONLIGHT * diff * 0.95 + SKYFILL * (0.6 + 0.4 * n.y));
    // the crests catch a bright line of moonlight just before they turn into shadow
    c += sand * MOONLIGHT * pow(diff, 8.0) * 0.12;
    // the lantern's warm pool on the sand round the lead camel
    vec3 toL = gLamp - p;
    c += sand * LANTERN * gFlame * max(dot(n, normalize(toL)), 0.0) * 2.2 / (1.0 + dot(toL, toL) * 0.9);
    // with the bass the wind gets up and a low veil of sand runs over the near dune
    float drift = pnoise(vec2((p.x - uTime * 5.0) * 0.18, p.z * 0.35), P * 0.18) * pnoise(vec2((p.x - uTime * 3.0) * 0.5, p.z * 0.9 + 3.0), P * 0.5);
    c += MOONLIGHT * sand * drift * gBass * 0.22 * (1.0 - ss(8.0, 50.0, tHit));
    float fog = 1.0 - exp(-tHit * 0.0011);
    col = mix(c, HAZE * (0.75 + 0.25 * ss(-0.05, 0.12, rd.y)), fog);
  }

  // ── sand blown off the crests ───────────────────────────────────────────────────────────
  // (placed on the caravan's crest and the next ranks: soft streaks leaning downwind, rising with the bass)
  {
    float plumeT = (RIDGE_Z - ro.z) / rd.z;
    vec3 pp = ro + rd * plumeT;
    float above = pp.y - landHeight(vec2(pp.x, RIDGE_Z));
    // long thin fibres torn off the crest and leaning downwind, flickering as they go
    vec2 sq = vec2((pp.x - uTime * 4.0) * 0.6 - above * 1.8, above * 6.0);
    float streak = pnoise(sq, P * 0.6) * 0.65 + pnoise(sq * vec2(2.3, 1.7) + 5.0, P * 1.38) * 0.35;
    float lift = 0.3 + gBass * 1.8;
    float wisp = ss(0.55, 0.9, streak) * exp(-above / lift) * ss(0.0, 0.12, above) * ss(0.25, 0.75, gBass + 0.2);
    if (tHit < 0.0 || tHit > plumeT) col += MOONLIGHT * wisp * (0.02 + 0.4 * gBass);
  }

  // ── the caravan on the crest ────────────────────────────────────────────────────────────
  // where each camel stands on the screen, how big a metre is there, and how the crest tilts it
  vec3 camF = normalize(vec3(0.0, 4.4, -26.0)), camR = normalize(cross(camF, vec3(0, 1, 0))), camU = cross(camR, camF);
  vec2 bases[5];
  float scales[5], tilts[5], depths[5];
  for (int k = 0; k < 5; k++) {
    vec3 at = vec3(gTravel - 8.5 + float(k) * 4.3, 0.0, RIDGE_Z);
    at.y = landHeight(at.xz) - 0.08;
    vec3 rel = at - ro;
    depths[k] = dot(rel, camF);
    bases[k] = vec2(dot(rel, camR), dot(rel, camU)) * LENS / depths[k];
    scales[k] = LENS / depths[k];
    float slope = (landHeight(at.xz + vec2(1.0, 0.0)) - landHeight(at.xz - vec2(1.0, 0.0))) * 0.5;
    tilts[k] = -atan(slope) * 0.8;
  }
  // the lead ropes: each camel's halter tied to the saddle of the one in front, sagging between
  for (int k = 0; k < 4; k++) {
    vec2 a = bases[k] + rot(-tilts[k]) * vec2(1.16, 1.45) * scales[k];
    vec2 b = bases[k + 1] + rot(-tilts[k + 1]) * vec2(-0.55, 1.38) * scales[k + 1];
    float s = clamp((uv.x - a.x) / (b.x - a.x), 0.0, 1.0);
    float y = mix(a.y, b.y, s) - 4.0 * s * (1.0 - s) * 0.25 * scales[k];
    float rope = ss(gPx * 1.1, gPx * 0.3, abs(uv.y - y)) * step(a.x, uv.x) * step(uv.x, b.x);
    if (tHit < 0.0 || tHit > depths[k] * 0.98) col = mix(col, vec3(0.015, 0.016, 0.03), rope * 0.85);
  }
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    float zc = depths[k], scale = scales[k];
    vec2 p = rot(tilts[k]) * ((uv - bases[k]) / scale);
    float phase = gStride + fk * 2.1;
    if (abs(p.x) > 1.7 || p.y < -0.3 || p.y > 3.0) continue;
    if (tHit > 0.0 && tHit < zc * 0.98) continue;                             // the near sand covers it
    float d = camel(p, phase, fk);
    if (k == 4) {
      vec2 lampAt = vec2(0.62 + sin(uTime * 1.4 + gStride * 0.5) * 0.06, 2.42);
      d = min(d, seg(p, vec2(0.05, 2.0), vec2(0.62, 2.62), 0.022));          // the pole
      d = min(d, seg(p, vec2(0.62, 2.62), lampAt + vec2(0.0, 0.07), 0.008));
      d = min(d, ell(p, lampAt, vec2(0.06, 0.08)));
    }
    float inside = ss(gPx * 0.7, -gPx * 0.7, d * scale);
    if (inside <= 0.0) continue;
    // the moon behind and above: a hair of light along the backs and heads, nothing elsewhere
    // (the outline's direction from two more looks at the silhouette, not from screen derivatives,
    // which are not to be trusted inside this loop)
    vec2 g = vec2(camel(p + vec2(0.012, 0.0), phase, fk) - d, camel(p + vec2(0.0, 0.012), phase, fk) - d);
    float towardMoon = clamp(dot(normalize(g + 1e-6), normalize(vec2(-0.6, 0.8))), 0.0, 1.0);
    float edge = ss(-gPx * 2.2, -gPx * 0.2, d * scale);
    vec3 body = vec3(0.01, 0.011, 0.02) + MOONLIGHT * edge * towardMoon * towardMoon * 0.4;
    col = mix(col, body, inside);
  }
  // the lantern: a flame in glass, its glow in the air
  {
    vec3 rel = gLamp - ro;
    vec3 f = normalize(vec3(0.0, 4.4, -26.0)), r = normalize(cross(f, vec3(0, 1, 0))), u = cross(r, f);
    float zc = dot(rel, f);
    vec2 lp = uv - vec2(dot(rel, r), dot(rel, u)) * LENS / zc;
    float r2 = dot(lp, lp);
    col += LANTERN * gFlame * (exp(-r2 / (gPx * gPx * 6.0)) * 1.6 + exp(-r2 * 1400.0) * 0.25 + exp(-r2 * 90.0) * 0.06);
  }
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'kervan', name: 'Kervan', group: 'Journey',
  blurb: 'A camel caravan walks a moonlit dune crest under the Milky Way; the bass blows sand off the crests and every beat sends a shooting star',
  tags: ['3d', 'desert', 'night', 'stars', 'caravan', 'journey', 'calm', 'moon'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
