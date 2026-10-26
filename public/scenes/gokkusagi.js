import { SCULPT } from '../js/gfx/scene-kit.js';

// GÖKKUŞAĞI — the moment after a storm in a tea valley above Rize, on the Black Sea. The storm is
// moving off up the valley, slate dark, its rain still hanging in curtains over the Kaçkars; over
// our heads its lumpy underside catches the low sun behind us in gold. Two ranges of mountains
// recede into the rain, the far crest jagged with snow in its gullies and cloud on its tops. Across
// the valley the tea gardens and their woods of alder, chestnut and hazel lie mostly in the storm's
// cool shadow, the low sun breaking through in drifting patches and one broad beam raking slowly
// back and forth; Rize houses, white with zinc roofs, stand among the tea; on the spur to the left a
// village with its mosque and minaret. At the bottom of the valley the river, wide and grey with the
// rain, runs between gravel banks under its alders, mist rising off it in wisps and mirroring the
// bow; below us our own wet tea rows, and a flagstone path winding down through them towards the
// minaret, its puddles holding the sky.
//
// And one natural rainbow, thin and translucent, red outside, its foot coming down beside the
// minaret where the rain is thickest and the bow brightest; the sky lighter inside it, Alexander's
// dark band outside, a faint secondary with its colours reversed, pale fringes inside the violet; it
// fades as it climbs in under the near cloud. Faint shafts of light and shadow radiate through the
// rain from the bow's centre. In a tall frame one leg of the bow rises from the hills and the path
// leads up to it. Everything is drawn in angles from where we stand (azimuth, elevation), so the bow
// sits where it would in the sky: 42 degrees round the point opposite the sun, which is 10 degrees
// up behind us; the river and the puddles mirror it the way water does.
//
// Music: each of the bow's seven colours follows its own band of the spectrum, red the bass up to
// violet the highs, brightening gently; the bass (uBass) sweeps the rain curtains, heavier and swung
// out by the wind; the mids (uMid) warm the sunlight on the fields, woods and houses; the highs
// (uHigh) glint on the wet tea leaves. On every beat a wave of light runs up both legs of the bow
// from the feet to the top, the drops glittering as it passes, gone within the beat, and the gulls
// crossing the bow beat their wings down into the sun. With nothing playing the clouds drift, the
// beam rakes the valley and the mist rises; nothing pulses.
const frag = `${SCULPT}
float gPx, gAsp, gT, gFlash, gWave, gBeatN, gSwing, gBeam;
vec3 gA, gSunC, gL;
float gLv[7];
const vec3 VEIL = vec3(0.37, 0.335, 0.33);    // rain lit by the low sun behind us: a warm grey
const vec3 AMB = vec3(0.105, 0.135, 0.195);   // the light of the storm sky in the shade: dim and cool

// ── tools ────────────────────────────────────────────────────────────────────────────────────────
vec3 viewDir(vec2 uv, float yaw, float pitch) {
  vec3 d = normalize(vec3(uv, 2.0));
  float cp = cos(pitch), sp = sin(pitch);
  d = vec3(d.x, d.y * cp + d.z * sp, d.z * cp - d.y * sp);
  float cy = cos(yaw), sy = sin(yaw);
  return vec3(d.x * cy + d.z * sy, d.y, d.z * cy - d.x * sy);
}
float fbm3(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * noise(p); p = rot(0.5) * p * 2.03 + vec2(13.7, 7.1); a *= 0.5; } return s / 0.875; }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float boxd(vec2 p, vec2 c, vec2 b) { vec2 d = abs(p - c) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float cover(float d) { return ss(gPx * 0.75, -gPx * 0.75, d); }      // inside a shape whose distance (degrees) is d
// the light falling on a surface: the low sun (nl how squarely it faces it, sun how much of it gets
// through the clouds there) and the cool light of the storm sky
vec3 sunlit(float nl, float sun) { return gSunC * 1.75 * sun * nl + AMB; }

// ── the bow ──────────────────────────────────────────────────────────────────────────────────────
// the seven colours from the outside in, and how strong each is in a real bow (yellow-green most)
const vec3 HUE[7] = vec3[7](vec3(1.0, 0.10, 0.06), vec3(1.0, 0.42, 0.06), vec3(0.86, 0.84, 0.12),
  vec3(0.14, 0.80, 0.26), vec3(0.06, 0.46, 0.95), vec3(0.20, 0.17, 0.95), vec3(0.52, 0.10, 0.86));
const float HUEW[7] = float[7](0.8, 0.78, 0.92, 0.82, 0.66, 0.5, 0.46);
// the light of the bows th degrees from the point opposite the sun: the primary, red outside at
// 42.2°, the secondary (sec says how much of it) reversed beyond 50.5°, pale fringes inside
vec3 bowAt(float th, float sec) {
  vec3 c = vec3(0.0);
  if (th < 36.0 || th > 55.0) return c;
  for (int k = 0; k < 7; k++) {
    float fk = float(k);
    float dp = (th - (42.2 - fk * 0.27)) / 0.33;
    float ds = (th - (50.6 + fk * 0.44)) / 0.5;
    c += HUE[k] * HUEW[k] * gLv[k] * (exp(-dp * dp) + sec * exp(-ds * ds));
  }
  float sx = 40.35 - th;
  if (sx > 0.0) {
    float w = 0.5 + 0.5 * cos(sx * 8.5);
    c += mix(vec3(0.32, 0.52, 0.34), vec3(0.52, 0.30, 0.46), 0.5 + 0.5 * cos(sx * 4.25)) * w * exp(-sx * 1.3) * ss(0.0, 0.3, sx) * 0.32;
  }
  return c;
}

// ── the sky ──────────────────────────────────────────────────────────────────────────────────────
// small billows: round bumps with sharp creases between them
float billow(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * abs(2.0 * noise(p) - 1.0); p = rot(0.6) * p * 2.1 + 3.3; a *= 0.5; }
  return s;
}
// the storm along a ray above the horizon: overhead its near underside, lumpy, the lumps turned to
// the low sun behind us catching its light; then the dark core where the bow shines; then the rain
vec3 stormAt(vec3 rd, float e, out float wet) {
  float y = max(rd.y, 0.03);
  vec2 P = rd.xz / y;                                   // where the ray meets the storm's base, in heights of it
  vec2 q = P * 0.55 + vec2(gT * 0.012, -gT * 0.006);
  float detail = ss(9.0, 2.5, P.y);
  float h0 = fbm3(q);
  float h1 = noise(q * 3.3 + 2.0);
  // the far underside: soft folds and rolls running across, crowding towards the horizon
  float rolls = 0.5 + 0.5 * sin(P.y * 2.6 + P.x * 0.3 + (h0 - 0.5) * 5.0);
  float lum = mix(0.36, h0 + (h1 - 0.5) * 0.3 + (rolls - 0.5) * 0.3, detail * 0.85 + 0.15);
  vec3 c = mix(vec3(0.052, 0.062, 0.105), vec3(0.165, 0.185, 0.265), clamp(lum, 0.0, 1.0));
  wet = 1.0;
  // the near underside
  float nearU = ss(15.0, 30.0, e);
  if (nearU > 0.0) {
    vec2 uq = P * vec2(1.25, 2.0) + vec2(gT * 0.015, -gT * 0.01);
    float k = 0.05;
    float u0 = billow(uq), ux = billow(uq + vec2(k, 0.0)), uz = billow(uq + vec2(0.0, k));
    float s0 = fbm3(uq * 0.5 + 7.0), sx = fbm3(uq * 0.5 + vec2(7.0 + k, 7.0)), sz = fbm3(uq * 0.5 + vec2(7.0, 7.0 + k));
    vec2 gr = vec2(ux - u0, uz - u0) * 0.2 + vec2(sx - s0, sz - s0) * 0.5;
    vec3 n = normalize(vec3(-gr.x / k, -1.0, -gr.y / k));
    float l = dot(n, gL);
    float reach = ss(0.25, 0.6, h0 + 0.3 * nearU);                    // where the light gets in under it
    vec3 under = mix(vec3(0.085, 0.088, 0.13), vec3(0.21, 0.2, 0.25), ss(0.0, 0.6, u0));
    vec3 lit = mix(vec3(0.55, 0.36, 0.3), vec3(1.0, 0.66, 0.42), ss(0.3, 0.7, l));
    under = mix(under, lit * 0.8, ss(-0.05, 0.4, l) * reach * nearU);
    c = mix(c, under, ss(0.0, 0.5, nearU));
    wet = 1.0 - 0.45 * nearU;
  }
  // low down, the curtains of rain, lit by the sun behind us: a warm veil over the far land
  c = mix(c, VEIL, ss(13.0, 0.5, e) * 0.75);
  return c;
}
// what water mirrors: the far underside of the storm, the veil of rain and the bow (no near cloud:
// the mirrored rays all climb low across the valley)
vec3 mirrorSky(vec3 rr) {
  float e = degrees(asin(clamp(rr.y, -1.0, 1.0)));
  vec2 P = rr.xz / max(rr.y, 0.03);
  vec2 q = P * 0.55 + vec2(gT * 0.012, -gT * 0.006);
  float h = noise(q) * 0.65 + noise(q * 2.2 + 3.0) * 0.35;
  vec3 c = mix(vec3(0.06, 0.07, 0.11), vec3(0.17, 0.185, 0.25), h);
  c = mix(c, VEIL, ss(13.0, 0.5, e) * 0.75);
  float th = degrees(acos(clamp(dot(rr, gA), -1.0, 1.0)));
  return c + bowAt(th, 0.25) * 0.3;
}
// rain hanging from the storm, slanting in the wind; the bass swings it
float curtains(float a, float e) {
  float base = 9.0 + 3.0 * noise(vec2(a * 0.05 - gT * 0.004, 2.0));
  float x = a + (base - e) * (0.2 + gSwing);
  float sh = ss(0.32, 0.72, noise(vec2(x * 0.085 - gT * 0.006, 3.0)) * 0.65 + noise(vec2(x * 0.25 + 5.0, 0.7)) * 0.35);
  float fib = noise(vec2(x * 1.4, e * 0.08 - gT * 0.32)) * 0.55 + noise(vec2(x * 3.7, e * 0.2 - gT * 0.7)) * 0.45;
  return sh * ss(base + 3.0, base - 2.0, e) * (0.45 + 0.55 * fib);
}
// how much sun is on the land here. The storm's own shadow lies beyond the rain, but broken cloud
// behind us throws drifting patches of shade over the valley; one broad beam rakes slowly back and
// forth across it brighter than the rest. cov says how much of the land the sun reaches
float sunOn(float a, float e, float seed, float lo, float cov) {
  float n = noise(vec2(a * 0.05 - gT * 0.012, e * 0.1 + seed)) * 0.7 + noise(vec2(a * 0.13 - gT * 0.02, e * 0.26 + seed)) * 0.3;
  float beam = ss(9.0, 3.0, abs(a + (e + 8.0) * 1.3 - gBeam + (n - 0.5) * 8.0));
  return mix(lo, 1.0, ss(0.62 - cov * 0.3, 0.74 - cov * 0.3, n) * 0.82 + beam * 0.18) * (1.0 + 0.2 * beam);
}

// ── the mountains ────────────────────────────────────────────────────────────────────────────────
float ridged(float x, float y) { float n = 1.0 - abs(2.0 * noise(vec2(x, y)) - 1.0); return n * n; }
// the Kaçkar crest far off: jagged, sharp peaks on broad shoulders
float mtnFar(float a) {
  float x = a * 0.055 + 1.7;
  float r1 = ridged(x, 0.5), r2 = ridged(x * 2.7 + 3.0, 1.5), r3 = ridged(x * 7.9 + 1.0, 2.5);
  return 0.6 + 4.4 * r1 + 1.7 * r2 * (0.3 + r1) + 0.45 * r3 * (0.3 + r1);
}
// a nearer, lower range in front of it, forested
float mtnNear(float a) {
  float x = a * 0.09 + 4.0;
  float r1 = ridged(x, 3.5), r2 = ridged(x * 2.4 + 1.0, 4.5);
  return -1.6 + 2.6 * r1 + 1.0 * r2 * r1 + 0.12 * noise(vec2(a * 1.3, 5.0));
}
// a mountainside, d degrees below its crest: gullies running down from the crest, the faces turned
// to the sun lighter; snow lies in the high gullies of the far range
vec3 mountain(float a, float d, float k, float seed, float sun, float snow) {
  float x = a * k;
  float u = x + 0.9 * noise(vec2(x * 0.3, d * 0.22 + seed));
  float g0 = noise(vec2(u, d * 0.2 + seed)), g1 = noise(vec2(u + 0.05, d * 0.2 + seed));
  float facing = clamp(0.62 + (g1 - g0) * 9.0, 0.05, 1.2);
  vec3 rock = mix(vec3(0.085, 0.09, 0.105), vec3(0.045, 0.07, 0.055), ss(0.6, 4.5, d + (g0 - 0.5) * 3.0));
  vec3 c = rock * (gSunC * 1.75 * sun * facing + AMB * (0.75 + 0.5 * facing));
  float sn = snow * ss(0.46, 0.3, g0) * ss(3.0, 0.6, d + noise(vec2(x * 4.0, d * 2.0 + seed)) * 1.4);
  return mix(c, vec3(0.6, 0.62, 0.68) * (gSunC * 0.9 * sun * facing + AMB * 1.5 + 0.06), sn);
}

// ── the valley ───────────────────────────────────────────────────────────────────────────────────
// crest lines in elevation, by azimuth: C the far side of the valley, B the village spur, A the brow
// of our own slope. The river runs along the bottom, its far bank where the hills come down to it
float topC(float a) { return -3.0 + 6.5 * ss(-45.0, 25.0, a) + 0.8 * (noise(vec2(a * 0.12, 8.0)) - 0.5) + 0.2 * noise(vec2(a * 0.7, 3.0)); }
float topB(float a) { return -14.0 + 17.0 * sqrt(ss(-24.0, -62.0, a)) + 0.5 * (noise(vec2(a * 0.15, 4.0)) - 0.5) + 0.12 * noise(vec2(a * 1.4, 6.0)); }
float riverE(float a) { return -9.25 - 1.3 * ss(-75.0, -20.0, a) + 0.3 * sin(a * 0.13 + 0.8); }
float riverW(float a) { return 0.5 + 0.3 * ss(-75.0, -20.0, a) + 0.06 * sin(a * 0.31); }
float topA(float a) { return riverE(a) - riverW(a) - 0.25 + 6.6 * ss(-30.0, 30.0, a) + 0.5 * (noise(vec2(a * 0.16, 2.0)) - 0.5); }

// the crowns of a wood seen across the valley, q in crowns (y up): each crown is lit on its upper
// right by the low sun behind us, its foot in the shadow of the crowns in front of it (below it).
// x: light, y: how far inside a crown (1 at its middle, 0 at its rim), z: which tree it is
vec3 crownsAt(vec2 q, float seed) {
  vec2 b = floor(q - 0.5);
  vec3 o = vec3(0.08, 0.0, 0.5);
  float front = 1e9;
  for (int j = 0; j < 2; j++)
    for (int i = 0; i < 2; i++) {
      vec2 id = b + vec2(float(i), float(j));
      vec2 c = id + 0.5 + (vec2(hash21(id + seed), hash21(id + seed + 3.7)) - 0.5) * 0.7;
      float r = 0.6 + 0.28 * hash21(id + seed + 9.1);
      vec2 d = (q - c) / r;
      float ins = 1.0 - dot(d, d);
      if (ins <= 0.0 || c.y > front) continue;
      front = c.y;
      float l = ss(-0.75, 0.55, d.y * 0.85 + d.x * 0.45 + (hash21(id + seed + 5.5) - 0.5) * 0.3);
      o = vec3(l * (0.55 + 0.45 * ss(0.0, 0.5, ins)), ins, hash21(id + seed + 7.7));
    }
  return o;
}
// a hillside of tea gardens across the valley: p = (azimuth, depth below its crest) in degrees, s
// how near it is (bigger is nearer). The ground folds into spurs and gullies running down; the
// sides turned to the sun are lit, the others fall away into shade; the tea follows the contours in
// rows that sag over the spurs; woods fill the gullies and stand in copses, their crowns lit on top,
// throwing long shadows up the slope away from the sun. wood: how much of it is trees
vec3 slope(vec2 p, float seed, float s, float sun, out float wood, out float facing) {
  vec2 q = p / s;
  float u = q.x * 0.28 + 0.9 * noise(vec2(q.x * 0.07 + seed, q.y * 0.12));
  float g0 = noise(vec2(u, q.y * 0.06 + seed)), g1 = noise(vec2(u + 0.04, q.y * 0.06 + seed));
  facing = clamp(0.7 + (g1 - g0) * 11.0, 0.12, 1.2);
  // the tea in its rows along the contours, the plots a patchwork of darker and fresher greens
  float rpd = 3.6 / s;                                                 // rows per degree
  float w = (p.y + 0.9 * s * (g0 - 0.5) * min(q.y, 3.0)) * rpd;
  float vis = ss(2.2, 5.0, 1.0 / (rpd * gPx));
  float pr = fract(w);
  float row = mix(0.6, ss(0.0, 0.2, pr) * ss(1.0, 0.7, pr), vis);     // the hedge tops, a dark line between
  float plot = noise(q * vec2(0.55, 1.0) + seed + 2.0);
  vec3 tea = mix(vec3(0.045, 0.13, 0.05), vec3(0.1, 0.21, 0.06), ss(0.25, 0.75, plot));
  tea *= mix(0.5, 1.1, row) * (0.88 + 0.24 * noise(q * vec2(2.5, 5.0) + seed));
  vec3 c = tea * sunlit(facing, sun);
  // woods down the gullies and in copses, their edges ragged
  float M = max(ss(0.4, 0.22, g0) * ss(0.15, 1.4, q.y), ss(0.63, 0.8, noise(q * vec2(0.34, 0.6) + seed + 5.0)));
  M += (noise(q * 1.9 + seed) - 0.5) * 0.4;
  // their long shadows, thrown up the slope and a little to the left
  vec2 qs = q + vec2(0.18, 0.55);
  float Ms = max(ss(0.4, 0.22, noise(vec2(u + 0.05, qs.y * 0.06 + seed))) * ss(0.15, 1.4, qs.y), ss(0.63, 0.8, noise(qs * vec2(0.34, 0.6) + seed + 5.0)));
  c *= 1.0 - 0.6 * ss(0.38, 0.6, Ms) * sun;
  wood = 0.0;
  if (M > 0.25) {
    float R = 0.19 * s;                                                 // a crown's radius, degrees
    vec3 cr = crownsAt(vec2(p.x, -p.y) / R, seed);
    wood = ss(0.46, 0.56, M + 0.2 * (cr.y - 0.45));
    float detail = ss(1.2, 3.0, R / gPx);
    float l = mix(0.45, cr.x, detail);
    vec3 tone = cr.z < 0.5 ? vec3(0.028, 0.06, 0.032) : (cr.z < 0.82 ? vec3(0.05, 0.09, 0.034) : vec3(0.08, 0.105, 0.04));
    vec3 wc = tone * (gSunC * 1.75 * sun * facing * (0.12 + 1.1 * l) + AMB * (0.55 + 0.6 * l));
    c = mix(c, wc, wood);
  }
  return c;
}
// one Rize house, seen three-quarters on: p = (across, up from its foot) in degrees, w its half
// width, h its walls (two or three storeys), end = which end wall shows (+1 the right one, turned to
// the sun; -1 the left, in shade), r picks its roof: mostly zinc, some red, a few green. rgb, cover
vec4 house(vec2 p, float w, float h, float end, float r, float sun) {
  float o = w * 0.14, rh = h * 0.38 + w * 0.2;
  if (abs(p.x) > w + o + gPx * 2.0 || p.y < -gPx * 2.0 || p.y > h + rh + gPx * 2.0) return vec4(0.0);
  float wall = boxd(p, vec2(0.0, h * 0.5), vec2(w, h * 0.5));
  float t = clamp((p.y - h + o * 0.4) / rh, 0.0, 1.0);
  float roof = max(abs(p.x) - mix(w + o, w * 0.42, t), max(h - o * 0.4 - p.y, p.y - h - rh));
  float xe = p.x * end;                                                // towards the end that shows
  // walls: the long front lit, the end wall in sun or shade, a dark eave line, two rows of windows
  float endWall = ss(w * 0.38 - gPx * 0.5, w * 0.38 + gPx * 0.5, xe);
  vec3 wc = vec3(0.86, 0.83, 0.76) * mix(sunlit(0.85, sun), end > 0.0 ? sunlit(0.62, sun) : sunlit(0.0, sun) * 0.9, endWall);
  float storeys = h > w * 1.05 ? 3.0 : 2.0;
  float fy = fract(p.y / h * storeys), fx = fract((p.x + w) / (w * 0.42));
  float win = ss(0.3, 0.38, fy) * ss(0.75, 0.67, fy) * ss(0.25, 0.35, fx) * ss(0.75, 0.65, fx);
  float winVis = ss(1.0, 2.5, h / storeys * 0.4 / gPx);
  wc *= 1.0 - mix(0.16, 0.62 * win, winVis) * ss(w * 0.82, w * 0.7, abs(p.x)) * ss(0.12, 0.2, p.y / h);
  wc *= mix(1.0, 0.45, ss(h - o * 2.2, h - o * 0.4, p.y));            // the shadow under the eaves
  // the hipped roof: its front slope half lit, the end hip lit or dark with the end wall
  vec3 rc = r < 0.55 ? vec3(0.4, 0.42, 0.45) : (r < 0.85 ? vec3(0.42, 0.11, 0.06) : vec3(0.12, 0.24, 0.18));
  float hip = ss(-gPx, gPx, xe - mix(w + o, w * 0.42, t) + (w * 0.58 + o) * 0.5 * (1.0 - t) - 0.02);
  float rl = mix(0.55, end > 0.0 ? 0.4 : 0.05, hip);
  vec3 roofC = rc * sunlit(rl, sun) + (r < 0.55 ? VEIL * 0.12 * (1.0 - hip) : vec3(0.0));   // wet zinc holds the bright rain
  float ra = cover(roof), wa = cover(wall);
  return vec4(mix(wc, roofC, ra), max(ra, wa));
}
// houses scattered over a hillside among the tea; p = (azimuth, depth below its crest)
vec4 scatter(vec2 p, float s, float seed, float sun, float dens) {
  vec2 cs = vec2(2.4, 1.25) * s, gi = floor(p / cs);
  float h = hash21(gi + seed);
  if (h > dens || gi.y < 0.5) return vec4(0.0);
  vec2 c = (gi + vec2(0.25 + 0.5 * hash21(gi + seed + 2.0), 0.6 + 0.3 * hash21(gi + seed + 6.0))) * cs;
  float w = (0.2 + 0.1 * hash21(gi + seed + 8.0)) * s;
  float hh = w * (0.75 + 0.5 * hash21(gi + seed + 3.0));
  return house(vec2(p.x - c.x, c.y - p.y), w, hh, hash21(gi + seed + 4.0) < 0.5 ? -1.0 : 1.0, hash21(gi + seed + 9.0), sun);
}
// the village on the spur, its houses (azimuth, depth below the crest, half width, which) and the
// mosque with its minaret
const vec4 HOUSE[10] = vec4[10](
  vec4(-58.6, 1.5, 0.52, 0.2), vec4(-55.0, 3.2, 0.62, 0.7), vec4(-52.1, 1.3, 0.45, 0.05), vec4(-49.4, 3.9, 0.58, 0.9),
  vec4(-47.0, 2.0, 0.42, 0.42), vec4(-51.0, 5.9, 0.55, 0.33), vec4(-45.7, 5.0, 0.6, 0.6), vec4(-40.6, 2.7, 0.44, 0.15),
  vec4(-38.3, 4.2, 0.55, 0.8), vec4(-35.7, 2.2, 0.4, 0.38));
vec4 village(float a, float e, float sun) {
  vec4 o = vec4(0.0);
  for (int i = 0; i < 10; i++) {
    vec4 h = HOUSE[i];
    vec2 p = vec2(a - h.x, e - (topB(h.x) - h.y));
    if (abs(p.x) > 1.0 || p.y < -0.1 || p.y > 1.4) continue;
    float hh = h.z * (0.7 + 0.55 * fract(h.w * 7.3));
    vec4 hc = house(p, h.z, hh, fract(h.w * 3.7) < 0.5 ? -1.0 : 1.0, fract(h.w * 5.1 + 0.3), sun);
    o = vec4(mix(o.rgb, hc.rgb, hc.a), max(o.a, hc.a));
  }
  // the mosque: a white hall under a hipped lead roof, the minaret beside it, a slender shaft with
  // its balcony and a pointed lead cap, lit on the right
  vec2 p = vec2(a + 43.6, e - (topB(-43.6) - 1.4));
  if (abs(p.x) < 1.6 && p.y > -0.2 && p.y < 5.2) {
    vec4 hall = house(p, 0.82, 0.62, 1.0, 0.1, sun);
    vec2 mp = p - vec2(1.05, 0.0);
    float shaft = boxd(mp, vec2(0.0, 1.75), vec2(0.105, 1.75));
    float balcony = boxd(mp, vec2(0.0, 2.9), vec2(0.17, 0.05));
    float cone = max(abs(mp.x) - 0.11 * (1.0 - clamp((mp.y - 3.5) / 1.1, 0.0, 1.0)), abs(mp.y - 4.05) - 0.56);
    float finial = boxd(mp, vec2(0.0, 4.72), vec2(0.012, 0.12));
    float rnd = ss(-0.11, 0.06, mp.x);                              // the shaft is round: lit on its right
    vec3 wc = vec3(0.86, 0.83, 0.76) * sunlit(mix(0.1, 0.95, rnd), sun);
    vec3 lc = vec3(0.4, 0.42, 0.46) * sunlit(mix(0.1, 0.8, rnd), sun) + VEIL * 0.1;
    float wa = cover(min(shaft, balcony)), la = cover(min(cone, finial)) * (1.0 - wa);
    o = vec4(mix(o.rgb, hall.rgb, hall.a), max(o.a, hall.a));
    o = vec4(mix(o.rgb, wc, wa), max(o.a, wa));
    o = vec4(mix(o.rgb, lc, la), max(o.a, la));
  }
  return o;
}
// the alders along the far bank: tall narrow crowns standing on the bank, x = azimuth, y = degrees
// above the bank; lit on the upper right, dark underneath. rgb, cover
vec4 alders(float a, float y, float sun) {
  float cw = 0.42, x = a / cw, b = floor(x);
  vec4 o = vec4(0.0);
  float gaps = ss(0.3, 0.45, noise(vec2(a * 0.09, 6.0)));
  for (int i = -1; i <= 1; i++) {
    float id = b + float(i);
    float hs = hash11(id * 1.37 + 0.5);
    if (hs > gaps * 0.92) continue;
    float cx = (id + 0.5 + (hash11(id * 2.1) - 0.5) * 0.7) * cw;
    float H = 0.8 + 1.3 * hash11(id * 3.3 + 1.0);
    float W = H * (0.24 + 0.1 * hash11(id * 4.7));
    vec2 d = vec2((a - cx) / W, (y - H * 0.52) / (H * 0.5));
    float leafy = (noise(vec2(a, y) / (W * 0.45) + id) - 0.5) * 0.45;
    float r = length(vec2(d.x, max(d.y, 0.0) * 1.15 + min(d.y, 0.0))) + abs(d.x) * max(d.y, 0.0) * 0.5 + leafy;
    float ca = ss(1.0, 1.0 - gPx / W * 1.5, r);
    if (ca <= 0.0) continue;
    float l = ss(-0.6, 0.7, d.x * 0.5 + d.y * 0.65 + leafy);
    vec3 tone = mix(vec3(0.03, 0.06, 0.034), vec3(0.05, 0.085, 0.035), hash11(id * 5.9));
    vec3 cc = tone * (gSunC * 1.75 * sun * (0.08 + 1.05 * l) + AMB * (0.45 + 0.6 * l));
    cc *= mix(0.55, 1.0, ss(-0.95, -0.35, d.y));                      // dark underneath
    o = vec4(mix(o.rgb, cc, ca), max(o.a, ca));
  }
  return o;
}
// mist rising off the river in wisps, h degrees above the water
float mistAt(float a, float h) {
  vec2 m = vec2(a * 0.3 - gT * 0.045, h * 0.7 - gT * 0.05);
  float n = fbm3(m + vec2(0.0, 0.5 * noise(vec2(a * 0.12 - gT * 0.02, h * 0.4))));
  return ss(0.42, 0.95, n + 0.3 * exp(-max(h, 0.0) * 1.3) - 0.07 * max(h, 0.0));
}

// ── our slope ────────────────────────────────────────────────────────────────────────────────────
// the tea right below us: hedges along the contours, rain standing in the furrows between them, and
// the flagstone path winding down through them
vec3 nearTea(vec3 rd, float a, float e, float top, float sun) {
  float v = max(top - e, 0.0);
  float w = log(1.0 + v * 0.85) * 6.2 + 0.6 * noise(vec2(a * 0.06, 3.0));
  float ri = floor(w), p = fract(w);
  float rowDeg = (1.0 + 0.85 * v) / (6.2 * 0.85);
  float fine = ss(3.5, 8.0, rowDeg / gPx);                         // pixels per row
  // the bushes along the row, each a rounded hump
  float bx = a / (rowDeg * 1.6) + hash11(ri * 1.7) * 9.0;
  float bi = floor(bx), bf = fract(bx) - 0.5;
  float hump = sqrt(max(1.0 - 4.0 * bf * bf, 0.0)) * (0.7 + 0.3 * hash21(vec2(ri, bi)));
  float gap = 0.3 - 0.16 * hump;                                   // the top of the hedge, bumpy
  vec2 lq = vec2(a, e) / (rowDeg * 0.12);
  float leaf = noise(lq) * 0.6 + noise(lq * 2.3) * 0.4;
  float topLit = mix(0.45, ss(gap, gap + 0.06, p) * ss(0.62, 0.42, p), fine);
  float front = mix(0.35, ss(0.4, 0.62, p) * ss(1.0, 0.84, p), fine);
  vec3 c = vec3(0.01, 0.02, 0.014);
  vec3 topC = mix(vec3(0.045, 0.13, 0.045), vec3(0.13, 0.27, 0.065), ss(0.25, 0.75, leaf)) * mix(0.75, 1.0, ss(gap + 0.3, gap + 0.05, p));
  c = mix(c, topC, topLit);
  c = mix(c, vec3(0.03, 0.085, 0.035) * (0.7 + 0.6 * leaf), front * (1.0 - topLit));
  c *= sunlit(1.0, sun * 0.92);
  c += VEIL * 0.09 * topLit * ss(0.5, 0.85, leaf) * fine;          // the glossy wet leaves hold the bright rain
  // after the rain the furrows hold water: mirrors of the sky
  float furrow = (ss(gap + 0.02, gap - 0.04, p) + ss(0.9, 1.0, p)) * fine;
  float pool = ss(0.5, 0.62, noise(vec2(bx * 0.3, ri * 3.7)));
  if (furrow * pool > 0.01) c = mix(c, mirrorSky(normalize(vec3(rd.x, -rd.y, rd.z))) * 0.7, furrow * pool * 0.85);
  // the path: comes up from the bottom of the frame, winds, and drops out of sight over the brow
  // towards the minaret; irregular wet flagstones, the puddles in its hollows holding the sky
  float pc = -39.4 + 3.4 * sin(v * 0.42 - 0.5) + 0.8 * ss(4.0, 10.0, v);
  float hw = 0.1 + 0.48 * v;
  float pd = abs(a - pc) - hw * (0.9 + 0.2 * noise(vec2(w * 1.7, sign(a - pc) * 3.0)) - 0.1 * hump);
  float fade = ss(0.1, 1.5, v);
  if (pd < hw * 0.3 + 0.3 && fade > 0.0) {
    float K = 8.0, sc = 1.0 + 0.85 * v;
    float slabDeg = sc / (K * 0.85);                                   // a stone's height, degrees
    vec2 sq = vec2((a - pc) / (slabDeg * 2.1), log(sc) * K / 0.85 * 0.85);
    vec2 sb = floor(sq);
    float d1 = 9.0, d2 = 9.0, sid = 0.0;
    for (int j = -1; j <= 1; j++)
      for (int i = -1; i <= 1; i++) {
        vec2 cc = sb + vec2(float(i), float(j));
        vec2 o = cc + 0.5 + (vec2(hash21(cc + 1.3), hash21(cc + 7.1)) - 0.5) * 0.8;
        float d = length((sq - o) * vec2(1.0, 1.15));
        if (d < d1) { d2 = d1; d1 = d; sid = hash21(cc + 4.4); } else if (d < d2) d2 = d;
      }
    float jd = (d2 - d1) * 0.5 * slabDeg;                              // degrees to the nearest joint
    float joint = ss(slabDeg * 0.07 + gPx, slabDeg * 0.07 - gPx * 0.5, jd + (noise(sq * 3.0) - 0.5) * slabDeg * 0.05);
    float across = (a - pc) / hw;
    vec3 stone = mix(vec3(0.16, 0.155, 0.145), vec3(0.2, 0.18, 0.15), sid) * (0.65 + 0.6 * fract(sid * 7.3));
    stone *= 0.8 + 0.4 * noise(sq * 4.0 + sid * 9.0);
    stone *= mix(1.0, 0.75, ss(0.4, 0.0, (d2 - d1) * 0.5));           // the stone rounded off at its edges
    stone = stone * sunlit(0.4, sun) + VEIL * 0.06 * (0.5 + 0.8 * sid);   // wet: a dull sheen of the sky
    stone = mix(stone, vec3(0.012, 0.022, 0.012), joint * 0.85);      // moss and mud in the joints
    // puddles lying across the stones in the hollows: smooth water, mirrors of the sky and the bow
    float pud = ss(0.6, 0.66, noise(sq * vec2(0.42, 0.5) + 4.0) + 0.04 * (sid - 0.5)) * ss(0.9, 0.55, abs(across));
    if (pud > 0.0) {
      float rip = noise(sq * 2.5 + vec2(gT * 0.5, 0.0));
      vec3 rr = normalize(vec3(rd.x + 0.003 * (rip - 0.5), -rd.y, rd.z));
      stone = mix(stone, mirrorSky(rr) * 0.88 + vec3(0.005, 0.008, 0.006), pud);
    }
    float verge = ss(0.72, 0.98, abs(across));                        // grass along its edges
    stone = mix(stone, vec3(0.035, 0.08, 0.03) * sunlit(0.9, sun) * (0.6 + 0.7 * leaf), verge * (1.0 - pud));
    c *= mix(1.0, 0.6, ss(hw * 0.3 + 0.3, 0.0, pd) * fade);            // the hedge ends beside it in shade
    c = mix(c, stone, cover(pd) * fade);
  }
  // glints on the wet leaves: a few always, many more with the highs
  vec2 gq = vec2(bx * 3.0, w * 3.0);
  vec2 gi = floor(gq), gf = fract(gq) - 0.5;
  float hg = hash21(gi + 17.0);
  if (hg < (0.02 + 0.24 * gHigh) * fine && topLit > 0.3) {
    vec2 o = (vec2(hash21(gi + 2.0), hash21(gi + 5.0)) - 0.5) * 0.5;
    vec2 dv = (gf - o) * vec2(rowDeg * 1.6, rowDeg) / 3.0 / gPx;     // pixels from the glint
    float star = exp(-dot(dv, dv) * 0.8) + 0.45 * exp(-abs(dv.x) * 0.8 - dv.y * dv.y * 3.0) + 0.45 * exp(-abs(dv.y) * 0.8 - dv.x * dv.x * 3.0);
    float tw = pow(0.5 + 0.5 * sin(uTime * (1.3 + 3.0 * hg) + hg * 50.0), 6.0);
    tw = mix(tw, max(tw, 0.5 + 0.5 * sin(uTime * 9.0 + hg * 80.0)), gHigh);
    c += vec3(1.0, 0.95, 0.82) * star * tw * (0.35 + 2.4 * gHigh) * (0.3 + 0.7 * sun);
  }
  return c;
}
// a gull, r in units of its half span, flap from -1 (down) to 1 (up)
float gull(vec2 r, float flap, float px) {
  vec2 ra = vec2(abs(r.x), r.y);
  vec2 elbow = vec2(0.42, 0.16 + 0.32 * flap);
  vec2 tip = vec2(1.0, elbow.y - 0.22 - 0.2 * flap);
  float d = min(seg(ra, vec2(0.0, -0.02), elbow), seg(ra, elbow, tip)) - mix(0.1, 0.035, ss(0.35, 1.0, ra.x));
  float body = length((r - vec2(0.0, -0.03)) * vec2(1.0, 2.6)) - 0.13;
  return ss(px, -px, min(d, body));
}

// the sky down to the hills: the storm, the mountains under it, its rain, and the bow in the rain
vec3 skyAt(vec3 rd, float a, float e) {
  float wet;
  vec3 sk = stormAt(rd, e, wet), col = sk;
  float th = degrees(acos(clamp(dot(rd, gA), -1.0, 1.0)));
  float m1 = mtnFar(a);
  if (e < m1 + gPx) {
    vec3 mc = mountain(a, m1 - e, 0.36, 1.0, sunOn(a, e * 2.0, 12.0, 0.05, 0.0), 1.0);
    mc = mix(mc, sk * 1.08, 0.5);                                    // far off, through the rain
    float cap = ss(0.55, 0.8, fbm3(vec2(a * 0.12 - gT * 0.006, e * 0.45)) + ss(m1 - 2.5, m1 + 0.5, e) * 0.22);
    mc = mix(mc, sk, cap * 0.8);                                     // cloud on the tops
    col = mix(col, mc, ss(m1 + gPx, m1 - gPx, e));
  }
  float m2 = mtnNear(a);
  if (e < m2 + gPx) {
    vec3 mc = mountain(a, m2 - e, 0.6, 7.0, sunOn(a, e * 2.0, 15.0, 0.1, 0.15), 0.0);
    mc = mix(mc, sk, 0.3);
    mc = mix(mc, sk * 1.05, 0.5 * ss(0.65, 0.9, fbm3(vec2(a * 0.2 - gT * 0.01, e * 0.8 + 3.0))) * ss(m2 - 3.0, m2, e));
    col = mix(col, mc, ss(m2 + gPx, m2 - gPx, e));
  }
  float cur = curtains(a, e) * (0.6 + 0.9 * gBass);
  col = mix(col, VEIL * 1.08, clamp(cur, 0.0, 1.0) * 0.55);
  // shafts of sunlight and shadow from gaps in the clouds behind us, meeting at the bow's centre:
  // bright in the rain, and the bow itself only where the sun gets to its drops
  float phi = degrees(atan(rd.x, dot(rd, vec3(0.0, cos(radians(10.0)), sin(radians(10.0))))));
  float shaft = noise(vec2(phi * 0.16 + gT * 0.01, 1.0)) * 0.6 + noise(vec2(phi * 0.42 - gT * 0.015, 5.0)) * 0.4;
  shaft = ss(0.3, 0.7, shaft);
  col += VEIL * 0.12 * (shaft - 0.4) * ss(16.0, 2.0, e) * ss(34.0, 44.0, th) * wet;
  float drops = clamp(0.55 * wet + cur * 1.3, 0.0, 1.0) * ss(38.0, 17.0, e) * (1.0 + 0.6 * ss(6.0, 0.0, e)) * (0.55 + 0.45 * shaft);
  col *= 1.0 + 0.14 * ss(42.0, 30.0, th) * drops;                 // brighter inside the bow
  col *= 1.0 - 0.14 * ss(41.9, 42.7, th) * ss(51.0, 50.2, th) * drops;   // Alexander's dark band
  // on the beat a wave of light runs up both legs of the bow, from the feet to the top within 0.4 s,
  // the drops glittering as it passes
  float wave = 0.0;
  if (gWave > 0.003) {
    float front = 84.0 * (1.0 - ss(0.0, 0.38, uBeatAge));           // |phi| of the front: 84 at the feet, 0 at the top
    float dph = (abs(phi) - front) / 9.0;
    wave = exp(-dph * dph) * gWave;
  }
  col += bowAt(th, 0.13) * drops * 0.34 * (1.0 + 1.3 * wave);
  if (wave > 0.01 && th > 39.6 && th < 42.8) {
    vec2 g = vec2(phi, th) / 0.3;
    vec2 gi = floor(g), gf = fract(g) - 0.5;
    float h = hash21(gi + fract(gBeatN * 0.137) * 91.0);
    if (h < 0.14) {
      vec2 o = (vec2(hash21(gi + 3.1 + gBeatN), hash21(gi + 5.7 + gBeatN)) - 0.5) * 0.6;
      vec2 dv = (gf - o) * 0.3 / gPx;
      float star = exp(-dot(dv, dv) * 0.6) + 0.3 * exp(-abs(dv.x) * 0.9 - dv.y * dv.y * 2.5) + 0.3 * exp(-abs(dv.y) * 0.9 - dv.x * dv.x * 2.5);
      col += mix(vec3(1.0, 0.97, 0.9), normalize(bowAt(th, 0.0) + 0.02) * 1.4, 0.35) * star * wave * (0.5 + hash21(gi + 9.9)) * drops;
    }
  }
  return col;
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gAsp = uRes.x / uRes.y;
  gPx = 57.2958 / uRes.y;
  gT = uTime;
  gBeam = -22.0 + 34.0 * sin(uTime * 0.035 + 0.6);
  gSwing = 0.5 * gBass;
  gSunC = mix(vec3(1.2, 0.9, 0.56), vec3(1.34, 0.8, 0.42), gMid) * (1.0 + 0.25 * gMid);
  for (int k = 0; k < 7; k++) gLv[k] = 0.62 + 0.55 * band(0.03 + float(k) * 0.11);
  gFlash = uAudioActive * uPunch * exp(-uBeatAge * 7.0) * ss(0.45, 0.3, uBeatAge);
  gBeatN = uBeatCount;
  gWave = uAudioActive * uPunch * ss(0.45, 0.3, uBeatAge) * (0.65 + 0.35 * exp(-uBeatAge * 4.0));
  float es = radians(10.0);
  gA = vec3(0.0, -sin(es), cos(es));
  gL = normalize(vec3(0.3, 0.17, -1.0));
  float yaw = radians(mix(-38.0, -20.0, ss(0.56, 1.78, gAsp)));
  vec3 rd = viewDir(uv, yaw, radians(7.0));
  float a = degrees(atan(rd.x, rd.z)), e = degrees(asin(clamp(rd.y, -1.0, 1.0)));

  float tA = topA(a), tB = topB(a), tC = topC(a);
  float er = riverE(a), wr = riverW(a), fb = er + wr;
  float covA = ss(tA + gPx, tA - gPx, e);
  vec3 col = vec3(0.0);
  if (covA < 1.0) {
    if (e > max(tB, tC) - gPx) col = skyAt(rd, a, e);
    // across the valley: the far side, mostly in the storm's shadow, the beam crossing it
    if (e < tC + gPx && e > tB - gPx && e > fb - gPx) {
      float sun = sunOn(a, e, 4.0, 0.14, 0.75), wood, facing;
      vec2 p = vec2(a, tC - e);
      vec3 c = slope(p, 11.0, 0.8, sun, wood, facing);
      vec4 hs = scatter(p, 0.8, 11.0, sun * facing, 0.3);
      c = mix(c, hs.rgb, hs.a * (1.0 - wood));
      // clouds clinging to the slope after the rain, and the wet air between
      float cl = ss(0.6, 0.85, fbm3(vec2(a * 0.09 - gT * 0.008, e * 0.32 + 1.0))) * ss(fb + 1.0, fb + 3.0, e) * ss(tC + 0.5, tC - 2.0, e);
      c = mix(c, mix(vec3(0.3, 0.32, 0.36), vec3(0.66, 0.6, 0.52), sun), cl * 0.7);
      c = mix(c, mix(VEIL * 0.85, vec3(0.6, 0.52, 0.42), sun * 0.6), 0.2 + 0.06 * sun);
      col = mix(col, c, ss(tC + gPx, tC - gPx, e));
    }
    // the village spur, nearer, more of it in the sun
    if (e < tB + gPx && e > fb - gPx) {
      float sun = sunOn(a, e, 1.0, 0.18, 0.9), wood, facing;
      vec2 p = vec2(a, tB - e);
      vec3 c = slope(p, 3.0, 1.3, sun, wood, facing);
      c = mix(c, mix(VEIL * 0.85, vec3(0.6, 0.52, 0.42), sun * 0.6), 0.1);
      col = mix(col, c, ss(tB + gPx, tB - gPx, e));
    }
    if (a < -30.0 && a > -62.0 && e < tB + 5.0) {
      vec4 vl = village(a, e, sunOn(a, e, 1.0, 0.18, 0.9));
      col = mix(col, mix(vl.rgb, VEIL * 0.85, 0.08), vl.a);
    }
    // the bottom of the valley: the river between its gravel banks, mirroring the sky and the bow,
    // its alders along the far bank, the mist rising off it
    if (e < fb + 3.5) {
      float sun = sunOn(a, e, 7.0, 0.25, 0.8);
      if (e < fb + gPx) {
        float across = (e - er) / wr;                                  // -1 near bank … 1 far bank
        float rip = noise(vec2(a * 0.35 - gT * 0.12, across * 5.0)) * 0.6 + noise(vec2(a * 0.9 - gT * 0.3, across * 9.0)) * 0.4;
        vec3 rr = normalize(vec3(rd.x, -rd.y + 0.012 * (rip - 0.5), rd.z));
        vec3 w = mirrorSky(rr) * 0.95 + vec3(0.01, 0.022, 0.02);
        w = mix(w, vec3(0.02, 0.035, 0.03), ss(0.35, 0.9, across + 0.15 * (noise(vec2(a * 1.5, 2.0)) - 0.5)) * 0.85);    // the far bank and its alders mirrored dark
        w += VEIL * 0.4 * ss(0.62, 0.86, rip) * ss(0.9, 0.2, across);         // ripples catching the bright rain
        float bar = ss(0.72, 0.9, abs(across) + 0.35 * (noise(vec2(a * 0.6, across)) - 0.5));
        vec3 gravel = vec3(0.2, 0.19, 0.17) * (0.7 + 0.6 * noise(vec2(a, e) / 0.06)) * sunlit(0.45, sun) + VEIL * 0.06;
        w = mix(w, gravel, bar);
        col = mix(col, w, ss(fb + gPx, fb - gPx, e));
      }
      vec4 t = alders(a, e - fb + 0.1, sun);
      col = mix(col, t.rgb, t.a);
      float m = mistAt(a, e - er);
      col = mix(col, mix(vec3(0.3, 0.32, 0.36), vec3(0.74, 0.67, 0.58), sun), m * 0.55);
    }
  }
  if (covA > 0.0) col = mix(col, nearTea(rd, a, e, tA, sunOn(a, e, 9.0, 0.3, 0.8)), covA);

  // a flock of gulls crossing the bow; on the beat their wings beat down and catch the sun
  {
    float f = fract(uTime / 36.0 + 0.3);
    vec2 lead = vec2(mix(gAsp + 0.35, -gAsp - 0.7, f), 0.34 + 0.05 * sin(uTime * 0.17));
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      vec2 b = lead + vec2(0.085 * fi + 0.02 * sin(fi * 2.1), (mod(fi, 2.0) * 2.0 - 1.0) * 0.03 * fi + 0.012 * sin(uTime * 0.7 + fi));
      float span = 0.036 * (0.85 + 0.3 * hash11(fi + 3.0));
      vec2 r = (uv - b) / span;
      if (dot(r, r) > 3.0) continue;
      float flap = sin(uTime * (3.2 + 0.3 * fi) + fi * 1.7);
      flap = mix(flap, -1.0, gFlash);
      float m = gull(r, flap, 2.0 / uRes.y / span);
      vec3 gc = mix(vec3(0.5, 0.5, 0.56), vec3(1.0, 0.93, 0.8), ss(-0.3, 0.3, r.y + 0.1)) * (1.0 + 0.6 * gFlash);
      col = mix(col, gc, m);
    }
  }
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 17.0) - 0.5) / 255.0;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'gokkusagi', name: 'Gökkuşağı', group: 'Vibe',
  blurb: 'After the storm in a Rize tea valley: a rainbow comes down by the minaret, its colours the spectrum; bass sweeps rain, beats climb the bow',
  tags: ['rainbow', 'rain', 'sky', 'turkish', 'analyser', 'calm'],
  energy: 0.35, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
