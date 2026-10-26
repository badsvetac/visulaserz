import { SCULPT } from '../js/gfx/scene-kit.js';

// BALINA — looking straight up from deep in the open ocean. Overhead the surface is a bright,
// trembling window of sky (Snell's window), its rim fringed with colour and its underside
// shimmering with the web of caustics; outside it the water mirrors the dark below. The sun burns
// in the window and its light falls through the waves as shafts that fan down past us. Across the
// light glides a humpback whale, a mother with her calf a little above and behind her: seen from
// beneath, its pale mottled belly, the long grooves of its throat running back from the chin, the
// great white pectoral fins with their knobbed leading edges, and the flukes with their white
// pattern, all rimmed with light where the sun comes round its edge. It throws a shadow down the
// light shafts. Lower down a school of small fish turns in a slow tornado, marine snow drifts in
// the blue, and the blue falls away into the dark of the deep below.
//
// The view is a real camera tilted up at a rippled plane: every pixel's ray is refracted out
// through the wave normals, so the window's edge, the sun's glitter and the caustics move with the
// waves. The whale is a 2D signed-distance silhouette (body profile, fins, flukes) shaded as a
// cylinder from beneath and lit from behind.
//
// Music, calmly: the bass swells the light shafts and the sun's glow; the mids raise the ripples
// on the surface and widen the whales' slow fin strokes; the highs make the plankton sparkle; on
// some beats (about two in five) the whole school flashes silver and turns together, back in line
// before the beat is out.
const frag = `${SCULPT}
float gPx, gAsp, gT, gFlashE, gTurn;
vec2 gSunUV;
vec3 gF, gU, gSunW, gSunA;

// the camera's ray through uv: tilted up towards the surface
vec3 camRay(vec2 uv) { return normalize(vec3(uv.x, 0.0, 0.0) + gU * uv.y + gF * 1.55); }

// the slope of the surface at s (x,z on the plane one unit above us); the waves rise with the mids,
// and the ones too fine to see at this distance fade out
vec2 surfSlope(vec2 s, float fp) {
  vec2 g = vec2(0.0);
  float amp = 1.0 + 1.3 * gMid;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float an = fi * 2.17 + 0.4;
    float k = 16.0 * pow(1.62, fi);
    vec2 dir = vec2(cos(an), sin(an));
    float ph = dot(dir, s) * k - gT * 0.55 * sqrt(k) + fi * 1.3;
    g += dir * (0.085 / (1.0 + 0.45 * fi)) * cos(ph) * ss(1.0, 0.3, k * fp);
  }
  vec2 ns = s * 9.0 + vec2(gT * 0.05, -gT * 0.04);
  float n0 = noise(ns);
  g += vec2(noise(ns + vec2(0.07, 0.0)) - n0, noise(ns + vec2(0.0, 0.07)) - n0) * 1.1 * ss(0.6, 0.2, 9.0 * fp);
  return g * amp * mix(1.0, 0.45, ss(0.003, 0.012, fp));
}
// the bright web the waves focus on the underside of the surface
float caustic(vec2 p, float t) {
  vec2 i = p;
  float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
  }
  c = 1.17 - pow(c / 4.0, 1.4);
  return pow(abs(c), 8.0);
}
// the light the water itself scatters towards us along a ray: brighter looking up and towards the sun
vec3 inscatter(vec3 rd) {
  vec3 c = mix(vec3(0.0, 0.008, 0.026), vec3(0.015, 0.12, 0.22), ss(0.3, 1.0, rd.y));
  float sd = max(dot(rd, gSunW), 0.0);
  return c + vec3(0.03, 0.17, 0.24) * pow(sd, 6.0) + vec3(0.05, 0.16, 0.18) * pow(sd, 40.0) * (0.8 + 0.6 * gBass);
}
// the sky through the window, for a ray that has left the water
vec3 skyOut(vec3 o, vec3 os) {
  vec3 c = mix(vec3(0.9, 0.97, 1.0), vec3(0.42, 0.7, 0.98), ss(0.05, 0.85, o.y));
  float sd = 1.0 - dot(os, gSunA);
  c += vec3(1.0, 0.94, 0.78) * (exp(-sd * 5000.0) * 12.0 + exp(-sd * 450.0) * 1.1 * (0.8 + 0.5 * gBass) + exp(-sd * 40.0) * 0.35 + exp(-sd * 8.0) * 0.2);
  return c;
}

// the body's half width at x, from the tail stock (-0.92) to the chin (1.03), seen from beneath
float bodyW(float x) {
  float w = 0.04 + 0.16 * pow(ss(-1.05, 0.28, x), 0.95);
  return w * sqrt(clamp((1.03 - x) / 0.5, 0.0, 1.0));
}
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
// a whale in its own frame (x along the body, nose at +1); an: tail bend, fin stroke, fluke tilt.
// returns distance, how much of it is fin (y) or fluke (z) there, and the across-coordinate (w)
vec4 whale(vec2 q, vec3 an) {
  float x = q.x, y = q.y - an.x * pow(ss(0.3, -1.05, x), 2.0);
  // the body
  float w = bodyW(x);
  float dw = (bodyW(x + 0.01) - bodyW(x - 0.01)) * 50.0;
  float d = (abs(y) - w) / sqrt(1.0 + min(dw * dw, 9.0));
  if (x > 1.03) d = length(vec2(x - 1.03, y));
  d = max(d, -0.97 - x);
  float v = y / max(w, 0.02);
  // the flukes: swept back, pointed tips, a notch in the middle and a ragged trailing edge
  float S = 0.37, s = abs(y) / S;
  float le = -0.92 - 0.08 * s * s;
  float chord = 0.12 * (0.8 + 0.2 * cos(an.z)) * pow(max(1.0 - pow(s, 3.0), 0.0), 0.55);
  float te = le - chord + 0.035 * exp(-s * s * 140.0) + 0.03 * s * (1.0 - s) + 0.004 * sin(s * 47.0) * s;
  float df = max(max(x - le, te - x) * 0.75, abs(y) - S);
  float fluke = ss(0.01, -0.01, df - d);
  d = smin(d, df, 0.025);
  // the pectoral fins, a third as long as the body, stroking slowly
  float fin = 0.0;
  for (int k = 0; k < 2; k++) {
    float sg = k == 0 ? 1.0 : -1.0;
    vec2 R = vec2(0.4, sg * 0.15);
    float th = sg * (2.25 + an.y);
    vec2 dir = vec2(cos(th), sin(th)), pb = sg * vec2(dir.y, -dir.x);   // pb points to the tail side
    float L = 0.64;
    vec2 rel = vec2(q.x, q.y) - R;
    float u = dot(rel, dir), s2 = clamp(u / L, 0.0, 1.0);
    float lat = dot(rel, pb) - 0.13 * L * s2 * s2;
    float wf = L * 0.1 * pow(1.0 - s2, 0.6) * (0.5 + 0.5 * ss(0.0, 0.3, s2));
    float wf0 = wf;
    float kb = sin(s2 * 34.0);
    wf += L * 0.009 * kb * kb * ss(0.0, -0.01, lat) * (1.0 - s2);      // the knobs on the leading edge
    float dfn = max(abs(lat) - wf, max(-u, u - L) * 0.7);
    fin = max(fin, ss(0.012, -0.012, dfn - d));
    d = smin(d, dfn, 0.03);
    if (fin > 0.5 && dfn < 0.0) v = lat / max(wf0, 0.01);
  }
  return vec4(d, fin, fluke * (1.0 - fin), v);
}
// a whale painted over col: c centre, hd heading, sc scale, haze how far away it is
vec3 paintWhale(vec3 col, vec2 uv, vec3 rd, vec2 c, vec2 hd, float sc, vec3 an, float haze, float seed) {
  vec2 p = (uv - c) / sc;
  vec2 q = vec2(dot(p, hd), dot(p, vec2(-hd.y, hd.x)));
  if (q.x < -1.35 || q.x > 1.15 || abs(q.y) > 0.82) return col;
  vec4 W = whale(q, an);
  float d = W.x;
  if (d > 0.03) return col;
  vec2 e = vec2(0.004, 0.0);
  vec2 gr = vec2(whale(q + e.xy, an).x - d, whale(q + e.yx, an).x - d);
  vec2 nOut = gr / max(length(gr), 1e-5);
  vec2 ts = normalize(gSunUV - uv);
  ts = vec2(dot(ts, hd), dot(ts, vec2(-hd.y, hd.x)));
  float facing = dot(nOut, ts);
  float v = clamp(W.w, -1.0, 1.0), nz = sqrt(max(1.0 - v * v, 0.0));
  float pxw = gPx / sc;
  // the dark back of the body, and the pale belly, mottled, catching the light from below
  float mott = ss(0.42, 0.66, fbm(q * vec2(3.2, 5.5) + seed * 11.0)) * ss(-0.5, 0.25, q.x) * ss(0.95, 0.3, abs(v));
  vec3 dark = vec3(0.006, 0.02, 0.04), pale = vec3(0.07, 0.15, 0.2);
  vec3 wc = mix(dark, pale, mott * 0.8 + 0.05 * nz) * (0.4 + 0.6 * nz);
  // the grooves of the throat, running back from the chin, closer together where it narrows
  {
    float gv = v * 8.0, fg = abs(fract(gv + 0.5) - 0.5);
    float lw = pxw * 8.0 / max(bodyW(q.x), 0.03);
    float fade = ss(0.18, 0.42, q.x) * ss(1.02, 0.86, q.x) * ss(1.0, 0.75, abs(v)) * (1.0 - W.y);
    float groove = ss(lw * 1.2 + 0.05, lw * 0.3, fg);
    wc *= 1.0 - 0.55 * groove * fade;
    wc += pale * 0.35 * ss(0.12, 0.45, fg) * fade * nz;
  }
  // the fins are white beneath, the flukes white with dark marks
  vec3 finC = mix(vec3(0.045, 0.11, 0.16), vec3(0.11, 0.22, 0.28), ss(0.35, 0.65, fbm(q * 7.0 + seed)));
  finC *= 0.6 + 0.4 * sqrt(max(1.0 - v * v, 0.0));
  wc = mix(wc, finC, W.y);
  vec3 flukeC = mix(dark, pale * 1.3, ss(0.47, 0.55, fbm(q * vec2(4.0, 6.0) + 3.0 + seed)) * ss(0.32, 0.12, abs(q.y)) * 0.9 + 0.1);
  wc = mix(wc, flukeC, W.z);
  // barnacles on the chin and the fins' leading edges
  {
    vec2 bq = q * 46.0, bc = floor(bq);
    float h = hash21(bc + seed * 31.0);
    float where = ss(0.78, 0.95, q.x) + W.y * 0.6;
    float r = length(fract(bq) - 0.5 - (vec2(hash21(bc + 1.7), hash21(bc + 5.3)) - 0.5) * 0.5);
    wc = mix(wc, vec3(0.16, 0.25, 0.27), ss(0.22, 0.12, r) * step(h, 0.25 * where));
  }
  // light from behind wrapping round the outline, strongest on the side facing the sun
  float bright = 0.15 + 1.2 * ss(-0.25, 0.35, 1.0 - 1.777 * (1.0 - rd.y * rd.y));   // how bright the window is behind, smoothly
  float outer = ss(0.2, 0.75, abs(v));                                  // only the outer part of the rounded body
  float rimW = 0.006 + 0.012 * max(facing, 0.0);
  float rim = exp(-max(-d, 0.0) / rimW) * (0.12 + 2.0 * pow(max(facing, 0.0), 1.6)) * (0.25 + bright) * outer;
  wc += vec3(0.4, 0.95, 1.05) * rim * (1.0 - haze * 0.5);
  wc += vec3(0.05, 0.18, 0.22) * exp(-max(-d, 0.0) / 0.05) * max(facing, 0.0) * bright * 0.4 * (1.0 - W.y) * outer;   // the light soaking through the thin edges
  wc = mix(wc, inscatter(rd) * 0.9, haze);
  return mix(col, wc, ss(pxw, -pxw, d));
}
// distance from p to the segment ab
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }

void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gT = uCruise * 0.5;
  float tall = ss(1.2, 0.65, gAsp);
  float P = 0.72;
  gF = vec3(0.0, sin(P), cos(P));
  gU = vec3(0.0, cos(P), -sin(P));
  gSunUV = vec2(-mix(max(gAsp * 0.3, 0.2), 0.14, tall), 0.7);
  gSunW = camRay(gSunUV);
  gSunA = refract(gSunW, vec3(0.0, -1.0, 0.0), 1.333);
  gFlashE = 0.0; gTurn = 0.0;
  if (uAudioActive > 0.5 && uBeatAge < 0.45 && hash11(uBeatCount * 7.7 + 1.3) < 0.4) {
    float a = uBeatAge;
    gFlashE = ss(0.0, 0.05, a) * ss(0.42, 0.14, a) * uPunch;
    gTurn = gFlashE * 1.1 * (hash11(uBeatCount * 3.1) < 0.5 ? -1.0 : 1.0);
  }

  // the surface overhead: a window of sky with the waves trembling its edge, mirror-dark outside it
  vec3 rd = camRay(uv);
  float t = 1.0 / rd.y;
  vec2 s = rd.xz * t;
  float fp = gPx / 1.55 / (rd.y * rd.y);
  vec2 sl = surfSlope(s, fp);
  vec3 nu = normalize(vec3(-sl.x, 1.0, -sl.y));
  vec3 nw = normalize(vec3(-sl.x * 0.3, 1.0, -sl.y * 0.3));        // the window's edge follows only the broad swell
  float ci = dot(rd, nw);
  vec3 eta = vec3(1.326, 1.333, 1.341);
  vec3 k3 = 1.0 - eta * eta * (1.0 - ci * ci);
  float soft = 0.012 + fp * 6.0;
  vec3 win = vec3(ss(-soft, soft, k3.r), ss(-soft, soft, k3.g), ss(-soft, soft, k3.b));
  vec3 o = k3.g > 0.0 ? refract(rd, -nu, 1.333) : vec3(0.0, 1.0, 0.0);
  vec3 ns = normalize(vec3(-sl.x * 0.45, 1.0, -sl.y * 0.45));       // the sun's image wobbles but holds together
  float cs2 = dot(rd, ns);
  vec3 os = 1.0 - 1.777 * (1.0 - cs2 * cs2) > 0.0 ? refract(rd, -ns, 1.333) : vec3(0.0, 1.0, 0.0);
  vec3 sky = skyOut(o, os) * ss(0.0, 0.22, max(k3.g, 0.0));       // less gets through near the edge
  sky += vec3(0.25, 0.4, 0.45) * ss(0.12, 0.0, abs(k3.g - 0.03));     // a bright ring round the edge
  vec3 refl = vec3(0.008, 0.05, 0.09) + vec3(0.0, 0.05, 0.07) * noise(s * 5.0 + sl * 3.0);
  vec3 surf = sky * win + refl * (1.0 - win);
  float cs = caustic(s * 7.0 - 250.0, gT * 0.9) * ss(0.7, 0.2, 7.0 * fp * 3.0);
  surf += vec3(0.55, 0.9, 1.0) * cs * mix(0.12, 1.0, win.g) * 1.5;
  vec3 tr = exp(-t * vec3(1.25, 0.45, 0.3));
  vec3 col = surf * tr + inscatter(rd) * (1.0 - exp(-t * 0.6)) * (0.8 + 0.45 * fbm(uv * 1.3 + vec2(gT * 0.01, 0.0)));   // the water is not quite even

  // the shafts of light falling through the waves, fanning out from the sun
  vec2 wc = vec2(mix(0.08, 0.04, tall), mix(0.16, 0.12, tall));
  float wsc = mix(0.92, 0.5, tall);
  float wa = mix(0.28, 1.05, tall) + 0.05 * sin(gT * 0.05);
  vec2 hd = vec2(cos(wa), sin(wa));
  wc += hd * 0.1 * sin(gT * 0.031) + vec2(0.0, 0.015 * sin(gT * 0.11));
  float rays;
  {
    vec2 dS = uv - gSunUV;
    float r = length(dS);
    float ang = atan(dS.x, -dS.y);
    rays = pow(noise(vec2(ang * 6.0, gT * 0.04)), 3.0) * 1.1 + pow(noise(vec2(ang * 17.0 + 5.0, gT * 0.07 + 2.0)), 4.0) * 0.9;
    rays *= exp(-r * 0.75) * ss(0.0, 0.35, r);
    // the whale's shadow, thrown down the shafts away from the sun
    vec2 A = wc - hd * 0.85 * wsc, B = wc + hd * 0.9 * wsc;
    float md = 9.0;
    for (int i = 1; i <= 5; i++) md = min(md, seg(mix(uv, gSunUV, float(i) * 0.16), A, B));
    rays *= 1.0 - 0.75 * ss(0.17 * wsc, 0.06 * wsc, md) * ss(0.0, 0.2, r);
  }
  vec3 rayC = vec3(0.12, 0.36, 0.42) * (0.7 + 0.9 * gBass);
  col += rayC * rays * 0.75;

  // the whales: the calf above and behind its mother, then the mother
  float fph = uCruise * 0.32;
  vec3 anC = vec3(0.03 * sin(fph * 1.3 + 1.0), (0.05 + 0.14 * gMid) * sin(fph * 1.3 + 2.0), fph * 1.3);
  vec2 hdC = vec2(cos(wa + 0.08), sin(wa + 0.08));
  vec2 co = mix(vec2(0.72, -0.62), vec2(0.62, 0.6), tall);
  vec2 cc = wc + (hd * co.x + vec2(-hd.y, hd.x) * co.y) * wsc;
  col = paintWhale(col, uv, rd, cc, hdC, wsc * 0.36, anC, 0.4, 3.0);
  vec3 anM = vec3(0.035 * sin(fph), (0.05 + 0.16 * gMid) * sin(fph + 1.2), fph);
  col = paintWhale(col, uv, rd, wc, hd, wsc, anM, 0.16, 0.0);
  col += rayC * rays * 0.22;                                          // the water between us and them

  // the school of small fish, turning in a slow tornado; on some beats they flash and turn as one
  {
    float fs = mix(1.0, 0.75, tall);
    vec2 fc = vec2(-mix(max(gAsp * 0.56, 0.2), 0.16, tall), mix(-0.56, -0.62, tall));
    vec2 bp = (uv - fc) / fs;
    if (abs(bp.x) < 0.36 && abs(bp.y) < 0.3) {
      for (int i = 0; i < 8; i++) {
        float fi = float(i);
        float rr = 0.27 * sqrt(1.0 - pow((fi - 3.5) / 4.2, 2.0));
        float sq = 0.42 + 0.05 * sin(fi * 2.1 + gT * 0.1);
        vec2 ci2 = vec2(0.02 * sin(gT * 0.21 + fi), (fi - 3.5) * 0.034 + 0.018 * sin(gT * 0.17 + fi * 1.3));
        vec2 pe = bp - ci2;
        pe.y /= sq;
        float er = length(pe);
        if (abs(er - rr) > 0.11) continue;
        float th = atan(pe.y, pe.x);
        float n = floor(TAU * rr / 0.026);
        float dth = TAU / n, om = 0.34 - 0.022 * fi;
        float cell = floor((th - om * gT) / dth);
        for (int j = -1; j <= 1; j++) {
          float id = cell + float(j);
          float h1 = hash21(vec2(id, fi) + 0.3), h2 = hash21(vec2(id, fi) + 7.1), h3 = hash21(vec2(id, fi) + 3.9);
          if (h3 < 0.12) continue;
          float tf = (id + 0.5 + (h1 - 0.5) * 0.7) * dth + om * gT;
          float rj = rr + (h2 - 0.5) * 0.07;
          vec2 fpos = vec2(cos(tf) * rj, sin(tf) * rj * sq + (h3 - 0.5) * 0.07) + ci2;
          vec2 head = normalize(vec2(-sin(tf), cos(tf) * sq)) * rot(gTurn);
          float near = -sin(tf);
          float sz = 1.0 + 0.3 * near;
          vec2 rel = bp - fpos;
          vec2 fl = vec2(dot(rel, head), dot(rel, vec2(-head.y, head.x))) / sz;
          float Lf = 0.019, Wf = 0.0045 * (1.0 + 1.3 * gFlashE);
          float df = (length(fl / vec2(Lf, Wf)) - 1.0) * Wf;
          float tx = -fl.x - Lf * 0.85;
          df = min(df, max(max(abs(fl.y) - tx * 0.8 - 0.0008, -tx), tx - 0.009));
          float a = ss(gPx / fs, -gPx / fs, df * sz);
          if (a <= 0.0) continue;
          float glint = pow(0.5 + 0.5 * sin(uTime * 0.8 + h1 * 40.0 + tf * 2.0), 10.0) * 0.7;
          vec3 fcol = mix(vec3(0.02, 0.06, 0.09), vec3(0.45, 0.72, 0.82), glint + 0.12 * h2);
          fcol *= 0.75 + 0.5 * ss(-Wf, Wf, fl.y);
          fcol += vec3(0.9, 1.3, 1.4) * gFlashE * (0.6 + 0.4 * h2);
          fcol = mix(fcol, inscatter(rd), 0.25 * (1.0 - near) * 0.5 + 0.1);
          col = mix(col, fcol, a);
        }
      }
    }
  }

  // marine snow drifting in the blue, and the plankton that sparkle in the highs
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float scale = 7.0 + fl * 9.0;
    vec2 g = uv * scale + vec2(gT * 0.02 * (1.0 + fl), gT * 0.05 * (1.0 + fl * 0.6)) * scale * 0.2 + fl * 17.3;
    g.x += sin(g.y * 0.35 + uTime * 0.2 + fl) * 0.3;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + fl * 7.0);
    if (h > 0.3) continue;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 9.7)) - 0.5;
    float r = length(f - off * 0.6) / scale;
    float size = layer == 0 ? 0.016 + 0.01 * h : (layer == 1 ? 0.0028 : 0.0015);
    float light = 0.35 + rays * 1.5 + ss(-0.6, 1.0, uv.y) * 0.8;
    float m = layer == 0 ? ss(size, size * 0.6, r) * (0.7 + 0.3 * ss(size * 0.6, size * 0.95, r)) * 0.045 * step(h, 0.12) : exp(-r * r / (size * size)) * 0.22;
    col += vec3(0.5, 0.75, 0.8) * m * light;
    float sp = pow(0.5 + 0.5 * sin(uTime * (6.0 + h * 20.0) + h * 80.0), 6.0);
    col += vec3(0.8, 1.2, 1.2) * gHigh * sp * exp(-r * r / (gPx * gPx * 0.8)) * step(0.5, fl) * step(h, 0.15) * light;
  }

  // the deep below, and a little vignette
  col *= mix(1.0, 0.55, ss(0.4, 1.6, length(uv * vec2(0.7, 1.0))));
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'balina', name: 'Balina', group: 'Vibe',
  blurb: 'Looking up from the deep: a humpback and her calf glide across the sunlit surface, light shafts falling through the waves, and a school of fish that flashes on the beat',
  tags: ['ocean', 'underwater', 'whale', 'calm', 'blue', 'majestic', 'dreamy'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
