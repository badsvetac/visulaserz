import { SCULPT } from '../js/gfx/scene-kit.js';

// DENİZ FENERİ — a lighthouse on a black rocky headland on a stormy night, as an animated film
// paints it: the tower stands on the cliff top with the keeper's house beside it, one window warm;
// the lantern turns, and its two beams sweep out through the rain and the sea mist as real cones of
// light, long and thin when they point across the frame, flaring at you when they come round;
// heavy dark-teal swells roll in and burst white against the foot of the cliff and the rocks off
// it; low torn cloud races past, and through a break in it the moon lights the cloud edges silver
// and lays a path of glitter on the waves; rain slants across everything, lit where the beam is.
//
// The beams are analytic: for each pixel the closest approach of the view ray to each beam's axis
// gives the light a cone of mist would scatter along that ray, so they cost a few dot products; the
// same sum, traced up from the water along the reflected ray, lays the beams' warm glance on the waves.
//
// Music: the bass breathes in the beams and the lantern's glow; the mids raise the swell (taller
// waves, more foam on the crests); the highs make the rain glint and the spray sparkle; on some
// beats, about one in three, a wave bursts high up the rocks, gone within the beat, and on others,
// about one in three, a distant flicker of lightning lights the undersides of the clouds.
const frag = `${SCULPT}
float gPx, gAsp, gT, gEdge, gMoonVis;
vec3 gBP, gD0, gD1;          // the lantern in the world, and the two beams' directions
vec2 gLamp, gMoon;
vec3 gFlash;                  // the lightning: xy where in the clouds, z how bright right now
vec2 gBurst;                  // a wave bursting high on the beat: x its height, y how far it has thinned
const float HZ = -0.2;        // the horizon on screen
const float FL = 1.6;         // the lens
const float CAMH = 1.5;       // the eye above the sea
const float ZH = 12.0;        // how far off the headland is

// the night sky, stormy: almost black overhead, a teal mist at the horizon, the moon's halo
vec3 skyAt(vec2 uv) {
  float y = uv.y - HZ;
  vec3 c = mix(vec3(0.05, 0.075, 0.085), vec3(0.02, 0.032, 0.048), ss(0.0, 0.45, y));
  c = mix(c, vec3(0.006, 0.01, 0.02), ss(0.35, 1.2, y));
  float dm = length((uv - gMoon) * vec2(0.8, 1.0));
  c += vec3(0.1, 0.13, 0.17) * exp(-dm * 2.0) + vec3(0.22, 0.26, 0.31) * exp(-dm * 7.0);
  vec2 fd = uv - gFlash.xy;
  c += vec3(0.5, 0.55, 0.8) * gFlash.z * (exp(-dot(fd, fd) / 0.15) * 0.5 + 0.06);
  return c;
}
// one layer of cloud: its density, the wind pulling it out sideways (sx) and along at spd
float cloudField(vec2 uv, float spd, float sx, float sy, float seed) {
  vec2 q = vec2(uv.x * sx - gT * spd, uv.y * sy) * 2.2 + seed;
  q += (vec2(noise(q * 0.7 + 3.0), noise(q * 0.7 + 9.0)) - 0.5) * 1.3;
  return fbm(q);
}
// a cloud layer painted over the sky; returns the colour and how much cloud
vec4 cloudLayer(vec2 uv, float spd, float sx, float sy, float seed, float th, vec3 dark, vec3 lit) {
  float den = cloudField(uv, spd, sx, sy, seed);
  float a = ss(th, th + 0.16, den);
  if (a <= 0.0) return vec4(0.0);
  vec2 toM = normalize(gMoon - uv);
  float den2 = cloudField(uv + toM * 0.035, spd, sx, sy, seed);
  float facing = clamp((den - den2) * 7.0 + 0.35, 0.0, 1.0);        // the side turned to the moon
  float under = clamp((den2 - den) * 7.0, 0.0, 1.0);                // the underside, away from it
  float dm = length((uv - gMoon) * vec2(0.8, 1.0));
  float near = exp(-dm * 2.4) * gMoonVis;
  float thin = 1.0 - ss(th, th + 0.3, den);
  vec3 c = mix(dark, lit, facing * (0.35 + 0.65 * near));
  c += vec3(0.5, 0.56, 0.64) * thin * near * (0.4 + 0.6 * facing) * 1.3;   // the silver edges
  c += vec3(0.07, 0.085, 0.1) * near * (1.0 - thin);
  vec2 fd = uv - gFlash.xy;
  c += vec3(0.7, 0.76, 1.1) * gFlash.z * (exp(-dot(fd, fd) / 0.1) * 1.3 + 0.18) * (0.2 + 1.4 * under) * (0.5 + 0.8 * thin);
  return vec4(c, a);
}
// one wave of the sea: height h and its gradient g, peaked at the crest
void wave(vec2 p, vec2 d, float k, float a, float w, float fade, inout float h, inout vec2 g) {
  float ph = dot(d, p) * k - gT * w;
  float s = 0.5 + 0.5 * sin(ph);
  h += a * fade * s * s;
  g += a * fade * s * cos(ph) * k * d;
}
// the top of the headland at x: a cliff top that climbs inland and falls to the sea at gEdge
float rockTop(float x) {
  float s = x - gLamp.x;
  float y = -0.088 + 0.008 * sin(s * 11.0 + 1.0);
  y += 0.03 * ss(-0.08, -0.3, s) - 0.16 * ss(-0.4, -1.4, s) + 0.02 * sin(s * 6.0) * ss(-0.3, -0.8, s);   // a shoulder behind the house, then the land falls away inland
  float drop = pow(ss(0.07, gEdge - gLamp.x, s), 0.6);
  y = mix(y, -0.44, drop);
  y += (noise(vec2(x * 15.0, 1.3)) - 0.5) * 0.028 * (0.4 + drop) + (noise(vec2(x * 46.0, 7.1)) - 0.5) * 0.01;
  y -= 0.012 * ss(0.3, 0.9, fract(s * 9.0)) * drop;                  // ledges down the cliff
  return y;
}
// where the headland meets the water: it curves towards us on the left
float rockBase(float x) {
  return -0.435 + 0.006 * sin(x * 31.0) - 0.2 * ss(gEdge - 0.35, gEdge - 1.4, x);
}
// how much a sea stack off the headland covers p: c its foot, w half-width, h height
float stack(vec2 p, vec2 c, float w, float h) {
  vec2 q = p - c;
  float u = q.x / w;
  if (abs(u) > 1.0 || q.y < -0.004) return 0.0;
  float top = h * pow(1.0 - abs(u - 0.15 * (1.0 - abs(u))), 0.7) + (noise(vec2(p.x * 90.0, c.x * 10.0)) - 0.5) * 0.012 - 0.02 * step(0.45, abs(u + 0.2)) * (1.0 - abs(u));
  return ss(gPx, -gPx, q.y - top);
}
// a burst of spray thrown up the rocks from S: a fan of jets leaning inland with the wind, h its
// height now, w its half-width, fade how far it has thinned into falling drops
float spray(vec2 uv, vec2 S, float h, float w, float fade, float seed) {
  vec2 q = uv - S;
  if (h < 0.004 || q.y < -0.01 || q.y > h * 1.3 || abs(q.x + q.y * 0.3) > w * 1.6 + 0.02) return 0.0;
  vec2 qn = vec2(q.x / w, q.y / h);
  float r = length(qn), a = atan(qn.x, qn.y) + 0.3;
  float jets = noise(vec2(a * 7.0 + seed, r * 2.0 - fade * 2.5));
  float reach = 0.7 + 0.4 * jets;
  float d = ss(reach, reach * 0.35, r) * ss(1.35, 0.45, abs(a)) * ss(-0.02, 0.06, qn.y);
  if (d <= 0.0) return 0.0;
  float fl = fbm(qn * vec2(3.5, 4.5) + vec2(seed, -fade * 1.5 - gT * 0.3));
  float drops = noise(vec2(a * 40.0 + seed, r * 14.0 - fade * 6.0));
  d *= ss(0.18 + 0.5 * fade, 0.5 + 0.38 * fade, fl + 0.25 * drops - 0.1 * r);
  return d * (1.0 - fade) * (1.0 - 0.35 * r);
}
// the light one beam scatters along the view ray rd: the closest approach of the ray to the beam's
// axis, how wide the cone is there, how slant the ray crosses it; depth stops it behind solid things
float beam(vec3 rd, vec3 P, vec3 D, float depth) {
  vec3 w0 = -P;
  float b = dot(rd, D), d = dot(rd, w0), e = dot(D, w0);
  float den = max(1.0 - b * b, 1e-4);
  float sc = (b * e - d) / den;                                     // along the view ray
  float tc = (e - b * d) / den;                                     // along the beam
  if (tc < -1.0 || sc < 0.0) return 0.0;
  float tcc = max(tc, 0.0);
  float dist = length(w0 + sc * rd - tcc * D);
  float rad = 0.1 + tcc * 0.06;
  float x2 = dist * dist / (rad * rad);
  float I = (exp(-x2 * x2 * 0.8) + 0.25 * exp(-x2 * 0.35)) / (rad * max(sqrt(den), 0.07));   // a lit core with a soft skirt
  I *= exp(-tcc * 0.02) * ss(-0.6, 0.6, tc);
  vec3 X = P + tcc * D;
  vec3 Y = sc * rd;
  float mist = 0.55 + 0.7 * mix(noise(vec2(tcc * 0.4 - gT * 1.1, X.y * 0.8)), 0.5, ss(6.0, 16.0, tcc)) * (0.55 + 0.45 * noise(Y.xy / max(Y.z, 1.0) * vec2(5.0, 9.0) + vec2(gT * 0.25, 0.0)));
  return I * mist * ss(-0.5, 0.0, depth - sc);
}
void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gT = uCruise;
  gLamp = vec2(-clamp(gAsp * 0.35, 0.2, 0.68), 0.395);
  gEdge = gLamp.x + 0.42;
  gMoon = vec2(clamp(gAsp * 0.45, 0.24, 0.85), 0.47);
  gMoonVis = 0.82 + 0.18 * sin(gT * 0.21);
  gFlash = vec3(0.0);
  gBurst = vec2(0.0, 1.0);
  if (uAudioActive > 0.5 && uBeatAge < 0.45) {
    float n = uBeatCount, a = uBeatAge, bh = hash11(n * 7.7 + 0.3);
    if (bh < 0.33) {
      float env = exp(-a * 15.0) + 0.8 * step(0.09, a) * exp(-(a - 0.09) * 18.0) + 0.5 * step(0.2, a) * exp(-(a - 0.2) * 22.0);
      float fx = mix(-gAsp * 0.85, gMoon.x - 0.35, hash11(n * 1.7));      // somewhere in the deck, not in the moon's break
      gFlash = vec3(fx, 0.45 + 0.4 * hash11(n * 2.9), env * uPunch * (0.7 + 0.3 * hash11(n * 4.1)));
    } else if (bh < 0.66) {
      gBurst = vec2((0.2 + 0.14 * uPunch) * (1.0 - pow(1.0 - ss(0.0, 0.2, a), 2.0)), ss(0.12, 0.42, a));
    }
  }
  vec3 rd = normalize(vec3(uv.x, uv.y - HZ, FL));
  gBP = vec3(gLamp.x * ZH / FL, (gLamp.y - HZ) * ZH / FL, ZH);
  float th = uTime * 0.5 + 5.15;
  gD0 = normalize(vec3(cos(th), -0.025, sin(th)));
  gD1 = vec3(-gD0.x, gD0.y, -gD0.z);
  float beamGain = 0.36 * (0.65 + 0.6 * gBass);
  vec3 col = skyAt(uv);
  float depth = 1e4;

  // the moon, and a few stars in the break around it
  {
    vec2 m = uv - gMoon;
    float d = length(m);
    float maria = 0.85 + 0.15 * noise(m * 60.0 + 3.0);
    col = mix(col, vec3(1.15, 1.13, 1.04) * maria * gMoonVis, ss(0.042 + gPx, 0.042 - gPx, d));
    vec2 g = uv * 55.0;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + 31.0);
    if (h < 0.06) {
      float r = length(f - (vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5) * 0.6) / 55.0;
      col += vec3(0.8, 0.85, 1.0) * (0.15 + 0.5 * hash21(cell + 1.3)) * exp(-r * r / (gPx * gPx * 0.5)) * exp(-d * 2.5) * ss(-0.1, 0.3, uv.y - HZ);
    }
  }
  // the clouds: a far deck, and low torn scud racing under it; a break opens round the moon
  float cloudA = 0.0;
  if (uv.y > HZ - 0.02) {
    vec2 hd = (uv - gMoon - vec2(-0.05, 0.02)) * vec2(0.55, 1.0);
    float hole = exp(-dot(hd, hd) / 0.09);
    vec4 hi = cloudLayer(uv, 0.03, 0.55, 1.0, 0.0, 0.36 + 0.4 * hole - 0.1 * ss(0.3, 1.0, uv.y), vec3(0.028, 0.036, 0.05), vec3(0.085, 0.1, 0.12));
    col = mix(col, hi.rgb, hi.a * ss(HZ - 0.02, HZ + 0.25, uv.y));
    cloudA = hi.a;
    float band = ss(HZ - 0.02, HZ + 0.12, uv.y) * ss(0.62, 0.15, uv.y);
    if (band > 0.0) {
      vec4 lo = cloudLayer(uv, 0.14, 0.38, 1.9, 17.0, 0.44 + 0.22 * hole, vec3(0.016, 0.022, 0.03), vec3(0.06, 0.07, 0.08));
      col = mix(col, lo.rgb, lo.a * band);
      cloudA = max(cloudA, lo.a * band);
    }
    // the moon's glow through thin cloud
    col += vec3(0.08, 0.1, 0.12) * exp(-length(uv - gMoon) * 6.0) * cloudA * gMoonVis;
  }

  // the sea, from the horizon to our feet
  float seaFoam = 0.0;
  if (uv.y < HZ) {
    float t = CAMH / max(-rd.y, 1e-3);
    vec2 p = rd.xz * t;
    depth = t;
    float amp = 0.75 + 0.6 * gMid;
    float h = 0.0;
    vec2 g = vec2(0.0);
    float pxw = t / (FL * max(-rd.y, 1e-3)) * gPx;                 // a pixel's size on the water
    wave(p, normalize(vec2(-0.35, -1.0)), 0.55, 0.36 * amp, 1.1, ss(2.0, 6.0, 11.4 / 0.55 / pxw / 20.0), h, g);
    wave(p, normalize(vec2(0.25, -1.0)), 0.95, 0.17 * amp, 1.45, ss(1.0, 3.0, 6.28 / 0.95 / pxw / 8.0), h, g);
    wave(p + vec2(0.0, 0.3 * g.y), normalize(vec2(-0.75, -0.66)), 2.3, 0.055 * amp, 2.5, ss(1.0, 3.0, 6.28 / 2.3 / pxw / 8.0), h, g);
    wave(p, normalize(vec2(0.65, -0.76)), 3.7, 0.03 * amp, 3.2, ss(1.0, 3.0, 6.28 / 3.7 / pxw / 8.0), h, g);
    // fine ripples, only where a pixel can still hold them: they break the moon into glitter
    float rf = ss(0.5, 0.12, pxw * 2.5);
    vec2 rp = p * vec2(2.6, 3.4) + vec2(gT * 0.4, -gT * 0.9);
    float r0 = noise(rp);
    g += vec2(noise(rp + vec2(0.07, 0.0)) - r0, noise(rp + vec2(0.0, 0.07)) - r0) * 1.6 * rf * amp;
    vec2 rp2 = rot(0.7) * rp * 2.3 + 5.0;
    float r1 = noise(rp2);
    g += vec2(noise(rp2 + vec2(0.07, 0.0)) - r1, noise(rp2 + vec2(0.0, 0.07)) - r1) * 1.0 * ss(0.5, 0.12, pxw * 6.0) * amp;
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
    vec3 r = reflect(rd, n);
    r.y = abs(r.y);
    vec2 ruv = vec2(r.x / max(r.z, 0.05) * FL, r.y / max(r.z, 0.05) * FL + HZ);
    vec3 refl = skyAt(ruv) * 0.7;
    vec3 moonDir = normalize(vec3(gMoon.x, gMoon.y - HZ, FL));
    float md = max(dot(r, moonDir), 0.0);
    float path = exp(-abs(uv.x - gMoon.x) * 4.0 / (0.4 + (HZ - uv.y)));            // the moon's road on the water
    vec3 glit = vec3(0.9, 0.95, 1.0) * (pow(md, 900.0) * 5.0 + pow(md, 90.0) * 0.18 + path * 0.035) * gMoonVis;
    float crest = h / (0.6 * amp);
    float face = ss(-0.02, 0.35, -n.z);                                             // the face of a wave turned to us
    vec3 body = vec3(0.003, 0.014, 0.018) + vec3(0.014, 0.1, 0.094) * ss(0.25, 1.0, crest) * (0.4 + 0.6 * face) * (0.65 + 0.35 * path);
    vec3 c = mix(body, refl, fres) + glit;
    vec3 sp = rd * t;                                                  // traced from the water up, along the reflection
    float br = (beam(r, gBP - sp, gD0, 1e4) + beam(r, gBP - sp, gD1, 1e4)) * beamGain;
    c += vec3(1.05, 0.85, 0.55) * br / (1.0 + br) * (0.15 + 0.85 * fres) * 0.35;   // the beams in the water
    // foam on the crests, and its lace left behind on the backs of the waves
    float streak = noise(p * vec2(2.2, 0.8) + vec2(0.0, gT * 0.3));
    float fine = noise(p * vec2(1.6, 7.0) + vec2(gT * 0.2, -gT * 0.5));             // foam is never a solid sheet
    float lip = abs(crest - 0.78 - 0.18 * (streak - 0.5));
    float foam = ss(0.07, 0.0, lip) * ss(0.25, 0.7, streak) * ss(0.3, 0.6, fine);   // a broken line along each crest
    foam += ss(0.25, 0.0, lip) * ss(0.4, 0.8, streak) * 0.25 * ss(0.5, 0.0, crest - 0.9);   // the white water spilling down its face
    float lace = fbm(p * vec2(0.9, 1.4) + vec2(gT * 0.05, -gT * 0.18));
    foam += ss(0.02, 0.0, abs(lace - 0.55)) * ss(0.15, 0.55, crest) * ss(0.35, 0.6, fine) * 0.25;   // threads of old foam
    foam *= ss(60.0, 15.0, t);
    seaFoam = foam;
    c += vec3(0.24, 0.3, 0.33) * foam * (0.8 + 0.2 * gMoonVis);
    // mist lying on the far water
    c = mix(c, vec3(0.045, 0.068, 0.078), 1.0 - exp(-t * 0.018));
    c += vec3(0.6, 0.62, 0.8) * gFlash.z * 0.05;
    col = c;
  }

  // a bank of sea mist lying along the horizon, paler under the moon
  col = mix(col, vec3(0.06, 0.085, 0.098) + vec3(0.05, 0.06, 0.07) * exp(-abs(uv.x - gMoon.x) * 2.0) * gMoonVis, exp(-abs(uv.y - HZ + 0.005) / 0.035) * 0.55);

  // the white water churning at the foot of the headland and round the stacks
  {
    float base = rockBase(uv.x);
    float dy = max(base - uv.y, -0.001);
    float near = ss(gEdge - 0.6, gEdge - 0.15, uv.x) * ss(gEdge + 0.24, gEdge + 0.12, uv.x);
    float surge = 0.6 + 0.4 * sin(uTime * 1.53) + 0.6 * (1.0 - gBurst.y) * step(0.01, gBurst.x);   // the surf heaving
    float n = noise(vec2(uv.x * 38.0 + gT * 0.3, dy * 110.0 - gT * 2.2)) * 0.6 + noise(vec2(uv.x * 95.0 - gT * 0.5, dy * 45.0 + gT)) * 0.4;
    float w = ss(0.5, 0.56, n * 0.75 + 0.55 * exp(-dy / (0.01 + 0.008 * surge))) * exp(-dy / (0.03 + 0.02 * surge));
    w = max(w, exp(-dy / 0.003) * 0.9);                                // the line where the water meets the rock
    w *= step(0.0, base - uv.y) * near * step(uv.y, HZ);
    col = mix(col, vec3(0.36, 0.42, 0.45), w * 0.9);
  }

  // the headland: black rock, its top edge catching the moon, the cliff face rough and wet
  float rx = uv.x;
  float top = rockTop(rx);
  float base = rockBase(rx);
  float inRock = ss(gPx, -gPx, uv.y - top) * ss(-gPx, gPx, uv.y - base) * step(rx, gEdge + 0.03);
  float st1 = stack(uv, vec2(gEdge + 0.06, -0.44), 0.032, 0.065);
  float st2 = stack(uv, vec2(gEdge + 0.15, -0.44), 0.024, 0.032);
  inRock = max(inRock, max(st1, st2));
  if (inRock > 0.0) {
    float sl = (rockTop(rx + 0.008) - top) / 0.008;
    vec2 n2 = normalize(vec2(-sl, 1.0));
    float dTop = top - uv.y;
    float onHead = step(rx, gEdge + 0.03) * ss(gPx, -gPx, uv.y - top);
    float facing = ss(0.0, 0.8, dot(n2, normalize(vec2(0.7, 0.7))));
    float rim = ss(0.008, 0.0, dTop) * facing * onHead;
    float faceLit = facing * exp(-max(dTop, 0.0) / (0.012 + 0.05 * clamp(-sl, 0.0, 2.0))) * onHead;   // the face below the edge, turned to the moon
    float f1 = noise(uv * vec2(9.0, 5.0) + 3.0), f2 = noise((uv + vec2(0.012, 0.0)) * vec2(9.0, 5.0) + 3.0);
    float lit = ss(-0.02, 0.03, f1 - f2) * ss(-0.2, 0.15, rx - gLamp.x);   // facets turned to the sea and the moon
    float hgt = ss(base, top, uv.y);                                   // how far up the cliff
    float strata = noise(vec2(uv.x * 34.0 + noise(uv * 6.0) * 2.0, uv.y * 5.0));   // columns of rock
    vec3 rc = mix(vec3(0.005, 0.007, 0.01), vec3(0.02, 0.026, 0.035), hgt * (0.45 + 0.55 * strata));
    rc = mix(rc, vec3(0.035, 0.045, 0.06) * (0.7 + 0.5 * strata), lit * ss(0.45, 0.7, strata) * 0.8);
    rc = mix(rc, vec3(0.06, 0.075, 0.095) * (0.6 + 0.6 * ss(-0.02, 0.03, f1 - f2)), ss(0.25, 0.6, faceLit) * gMoonVis);
    rc += vec3(0.25, 0.3, 0.36) * rim * gMoonVis;
    for (int i = 0; i < 2; i++) {                                      // ledges down the face, each with its lit lip
      float fi = float(i);
      float ridge = top - 0.045 - 0.06 * fi - (noise(vec2(rx * 7.0 + fi * 5.0, fi)) - 0.5) * 0.06 - 0.03 * sin(rx * 3.0 + fi);
      float below = ridge - uv.y;
      float lip = ss(0.014, 0.0, below) * step(0.0, below) * ss(0.35, 0.65, noise(vec2(rx * 18.0 + fi * 7.0, 2.0)));
      rc = mix(rc, vec3(0.045, 0.055, 0.07) * (0.6 + 0.6 * strata), lip * onHead * 0.8 * gMoonVis);
      rc *= 1.0 - 0.4 * ss(0.0, 0.035, -below) * ss(0.07, 0.03, -below) * onHead;   // the overhang's shadow above it
    }
    float wet = ss(0.07, 0.0, uv.y - base) * (0.5 + 0.5 * noise(uv * vec2(40.0, 12.0) - vec2(0.0, gT)));
    rc += vec3(0.03, 0.06, 0.065) * wet;
    float sRim = max(st1 * ss(0.018, 0.03, uv.x - gEdge - 0.06), st2 * ss(0.013, 0.023, uv.x - gEdge - 0.15));
    rc = mix(rc, vec3(0.006, 0.008, 0.012), (1.0 - onHead) * 0.7);
    rc += vec3(0.07, 0.085, 0.1) * sRim * (1.0 - onHead);
    col = mix(col, rc, inRock);
    depth = mix(depth, ZH - 0.5, step(0.5, inRock));
  }

  // the keeper's house beside the tower, one window lit warm
  {
    float hx0 = gLamp.x - 0.175, hx1 = gLamp.x - 0.055;
    float gy = rockTop(gLamp.x - 0.115) - 0.01;
    float wallTop = gy + 0.075, peak = gy + 0.118, cx = (hx0 + hx1) * 0.5;
    vec2 q = uv;
    float wall = ss(gPx, -gPx, abs(q.x - cx) - (hx1 - hx0) * 0.5) * step(gy - 0.02, q.y) * ss(gPx, -gPx, q.y - wallTop);
    float roofY = peak - abs(q.x - cx) * 0.72;
    float roof = ss(gPx, -gPx, q.y - roofY) * step(wallTop - 0.012, q.y) * ss(gPx, -gPx, abs(q.x - cx) - (hx1 - hx0) * 0.5 - 0.01);
    float chim = ss(gPx, -gPx, abs(q.x - hx0 - 0.03) - 0.008) * step(wallTop, q.y) * ss(gPx, -gPx, q.y - peak - 0.008);
    float house = max(max(wall, roof), chim);
    if (house > 0.0) {
      vec3 hc = vec3(0.016, 0.017, 0.024);
      hc += vec3(0.05, 0.055, 0.065) * ss(hx1 - 0.012, hx1, q.x) * wall;                 // the moon on its sea end
      hc = mix(hc, vec3(0.01, 0.011, 0.017), roof);
      hc += vec3(0.2, 0.24, 0.28) * ss(0.006, 0.0, roofY - q.y) * roof * step(cx, q.x) * gMoonVis;
      col = mix(col, hc, house);
      depth = mix(depth, ZH - 0.6, step(0.5, house));
    }
    // the windows: the big one warm, the small one dimmer behind a curtain
    for (int i = 0; i < 2; i++) {
      vec2 wc = i == 0 ? vec2(hx0 + 0.04, gy + 0.036) : vec2(hx1 - 0.03, gy + 0.04);
      vec2 ws = i == 0 ? vec2(0.012, 0.016) : vec2(0.008, 0.012);
      vec2 d = abs(uv - wc) - ws;
      float win = ss(gPx, -gPx, max(d.x, d.y));
      float mull = max(ss(0.0016 + gPx, 0.0016, abs(uv.x - wc.x)), ss(0.0016 + gPx, 0.0016, abs(uv.y - wc.y)));
      vec3 warm = (i == 0 ? vec3(1.7, 0.85, 0.32) : vec3(0.8, 0.38, 0.14)) * (0.9 + 0.1 * sin(uTime * 3.1 + float(i) * 2.0) * sin(uTime * 4.7));
      warm *= 1.0 - 0.3 * ss(-ws.y, ws.y, uv.y - wc.y);
      col = mix(col, mix(warm, vec3(0.02, 0.012, 0.01), mull * 0.85), win);
      float dd = length((uv - wc) * vec2(1.0, 1.3));
      col += (i == 0 ? vec3(0.55, 0.24, 0.07) : vec3(0.22, 0.09, 0.03)) * (exp(-dd * 38.0) * 0.6 + exp(-dd * 12.0) * 0.12) * (1.0 - win);
    }
  }

  // the lighthouse: a tapering white tower with red bands, the gallery, the lantern room, its dome
  {
    float dx = uv.x - gLamp.x;
    float yb = rockTop(gLamp.x) - 0.02, yg = 0.345;
    float k = clamp((uv.y - yb) / (yg - yb), 0.0, 1.0);
    float tw = mix(0.047, 0.03, k);
    float tower = ss(tw + gPx, tw - gPx, abs(dx)) * step(yb, uv.y) * ss(gPx, -gPx, uv.y - yg);
    if (tower > 0.0) {
      float nx = dx / tw;
      float lit = ss(-0.25, 0.55, nx);
      float red = step(0.5, fract(k * 2.5 + 0.1)) * step(k, 0.85) * step(0.2, k);
      vec3 sh = mix(vec3(0.03, 0.035, 0.05), vec3(0.03, 0.01, 0.014), red);
      vec3 li = mix(vec3(0.2, 0.23, 0.27), vec3(0.17, 0.035, 0.035), red);
      vec3 tc = mix(sh, li, lit * gMoonVis);
      tc += vec3(0.25, 0.28, 0.32) * exp(-(nx - 0.62) * (nx - 0.62) * 50.0) * 0.25 * (1.0 - red * 0.6);   // the wet sheen
      tc += vec3(0.35, 0.2, 0.08) * ss(0.7, 1.0, k) * (0.4 + 0.3 * gBass) * (1.0 - 0.5 * abs(nx));   // the lantern's light falling on it
      tc *= 1.0 - 0.5 * pow(abs(nx), 6.0);
      // a small lit window halfway up, and the door
      vec2 w1 = abs(vec2(dx - tw * 0.15, uv.y - mix(yb, yg, 0.5))) - vec2(0.004, 0.008);
      tc = mix(tc, vec3(1.3, 0.65, 0.22), ss(gPx, -gPx, max(w1.x, w1.y)));
      vec2 dr = abs(vec2(dx + tw * 0.1, uv.y - yb - 0.015)) - vec2(0.008, 0.015);
      tc = mix(tc, vec3(0.008, 0.008, 0.012), ss(gPx, -gPx, max(dr.x, dr.y)));
      col = mix(col, tc, tower);
      depth = mix(depth, ZH - 0.3, step(0.5, tower));
    }
    // the gallery, its railing, the lantern room, the dome and its vane
    float gal = ss(gPx, -gPx, abs(dx) - 0.044) * ss(gPx, -gPx, abs(uv.y - 0.351) - 0.006);
    float rail = ss(gPx, -gPx, abs(dx) - 0.04) * ss(gPx * 1.2, 0.0, abs(uv.y - 0.374) - 0.0012);
    rail = max(rail, ss(gPx, -gPx, abs(dx) - 0.04) * step(0.357, uv.y) * step(uv.y, 0.374) * ss(0.0013 + gPx, 0.0013, abs(fract(dx / 0.013) - 0.5) * 0.013));
    float roomH = abs(uv.y - 0.388) - 0.031;
    float room = ss(gPx, -gPx, max(abs(dx) - 0.024, roomH));
    float dTop = 0.419, domeY = dTop + 0.03 * sqrt(max(1.0 - pow(dx / 0.028, 2.0), 0.0));
    float dome = ss(gPx, -gPx, uv.y - domeY) * step(dTop - 0.002, uv.y) * step(abs(dx), 0.028);
    float vane = ss(0.0012 + gPx, 0.0012, abs(dx)) * step(dTop, uv.y) * step(uv.y, dTop + 0.048) + ss(0.005 + gPx, 0.005, length(uv - vec2(gLamp.x, dTop + 0.032)));
    if (room > 0.0) {
      float glow = 0.7 + 0.5 * gBass;
      float mull = ss(0.0016 + gPx, 0.0016, abs(fract(dx / 0.016 + 0.5) - 0.5) * 0.016);
      vec3 rc = vec3(1.45, 0.95, 0.42) * glow * (0.75 + 0.25 * ss(0.024, 0.0, abs(dx)));
      rc += vec3(2.0, 1.7, 1.2) * exp(-length((uv - gLamp) * vec2(1.0, 1.4)) * 140.0) * glow * 2.0;    // the lamp itself
      rc = mix(rc, vec3(0.03, 0.02, 0.015), mull * 0.9);
      col = mix(col, rc, room);
    }
    float metal = max(max(gal, rail), max(dome, vane));
    vec3 mc = vec3(0.012, 0.012, 0.016) + vec3(0.12, 0.1, 0.07) * ss(0.0, 0.03, dx) * dome + vec3(0.25, 0.16, 0.07) * gal * ss(0.0, 0.006, 0.357 - uv.y) * (0.7 + 0.5 * gBass);
    col = mix(col, mc, metal);
    if (metal + room > 0.5) depth = ZH - 0.3;
  }

  // the beams, turning: through the mist and rain, stopped by the rock and the tower
  float bm = 0.0, face = 0.0;
  {
    vec3 toCam = normalize(-gBP);
    float mistBoost = 0.8 + 0.8 * cloudA + 0.7 * ss(0.3, 0.0, abs(uv.y - HZ)) + 0.6 * seaFoam;
    bm = beam(rd, gBP, gD0, depth) + beam(rd, gBP, gD1, depth);
    face = max(pow(max(dot(gD0, toCam), 0.0), 40.0), pow(max(dot(gD1, toCam), 0.0), 40.0));
    bm *= beamGain;
    float bv = bm * mistBoost;
    bv = bv / (1.0 + bv * 0.6);
    col += vec3(1.05, 0.88, 0.6) * bv;
  }
  // the lantern's glow, and its flare when a beam swings round to face us
  {
    vec2 d = uv - gLamp;
    float dl = length(d * vec2(1.0, 1.25));
    float glow = 0.75 + 0.55 * gBass;
    col += vec3(1.3, 0.85, 0.4) * (exp(-dl * 40.0) * 0.7 + exp(-dl * 10.0) * 0.14 + exp(-dl * 3.0) * 0.03) * glow;
    col += vec3(1.5, 1.25, 0.85) * face * (exp(-dl * 7.0) * 0.6 + exp(-abs(d.y) * 260.0) * exp(-abs(d.x) * 2.2) * 0.8 + exp(-abs(d.x) * 260.0) * exp(-abs(d.y) * 6.0) * 0.3) * glow;
  }

  // spray: the waves bursting on the cliff foot and on the stack, and the big one on the beat
  {
    float s = 0.0;
    float ph = fract(uTime / 4.1 + 0.15);
    s = max(s, spray(uv, vec2(gEdge - 0.03, -0.445), 0.13 * (1.0 - pow(1.0 - ss(0.0, 0.35, ph), 2.0)), 0.1, ss(0.25, 1.0, ph), 3.0));
    float ph2 = fract(uTime / 5.3 + 0.6);
    s = max(s, spray(uv, vec2(gEdge + 0.065, -0.44), 0.085 * (1.0 - pow(1.0 - ss(0.0, 0.3, ph2), 2.0)), 0.06, ss(0.25, 1.0, ph2), 11.0));
    s = max(s, spray(uv, vec2(gEdge - 0.01, -0.445), gBurst.x, gBurst.x * 0.75 + 0.03, gBurst.y, 23.0 + hash11(uBeatCount) * 50.0));
    if (s > 0.0) {
      vec3 sc = mix(vec3(0.14, 0.19, 0.22), vec3(0.58, 0.66, 0.7), ss(0.0, 0.8, s)) * (0.75 + 0.25 * gMoonVis);
      float sp = step(0.985, hash21(floor(uv * uRes.y * 0.5) + floor(uTime * 12.0)));
      sc += vec3(1.2, 1.25, 1.3) * sp * gHigh * 1.5;
      col = mix(col, sc, ss(0.0, 0.7, s) * 0.85);
    }
  }

  // rain slanting across all of it, faint in the dark, bright where the beam and the lamp light it
  {
    float light = 0.05 + bm * 1.5 + 0.4 * exp(-length(uv - gLamp) * 5.0) + 0.12 * exp(-length(uv - gMoon) * 2.0) + gFlash.z * 0.3;
    vec2 rq = rot(-0.27) * uv;
    float rain = 0.0, glint = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float sc = 26.0 + fi * 21.0;
      vec2 g = vec2(rq.x * sc, (rq.y + uTime * (2.4 + fi * 0.8)) * sc * 0.09);
      vec2 id = floor(g), f = fract(g);
      float h = hash21(id + fi * 13.0);
      if (h > 0.3) continue;
      float xo = 0.2 + 0.6 * hash21(id + 3.1);
      float wpx = gPx * sc * 0.6;
      float len = 0.4 + 0.4 * hash21(id + 5.3);
      float yo = hash21(id + 8.9) * (1.0 - len);
      float streak = ss(wpx + 0.02, 0.0, abs(f.x - xo)) * ss(yo, yo + 0.06, f.y) * ss(yo + len, yo + len - 0.15, f.y);
      rain += streak * (0.4 + 0.25 * fi) * (0.5 + 1.6 * h);
      glint += streak * ss(yo + 0.12, yo + 0.04, f.y) * step(h, 0.08);
    }
    col += vec3(0.55, 0.62, 0.7) * rain * light * (0.45 + 0.35 * gHigh) + vec3(0.9, 0.95, 1.0) * glint * gHigh * (0.3 + light) * 1.6;
  }

  // the corners fall into the night
  col *= 1.0 - 0.4 * ss(0.5, 1.7, length(uv * vec2(0.75, 1.0)));
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'denizfeneri', name: 'Deniz Feneri', group: 'Vibe',
  blurb: 'A lighthouse on a black headland on a stormy night: its beams sweep through rain and mist, dark-teal waves burst white on the rocks, and the moon shows through torn cloud',
  tags: ['sea', 'night', 'storm', 'lighthouse', 'moody', 'rain', 'cinematic'],
  energy: 0.35, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
