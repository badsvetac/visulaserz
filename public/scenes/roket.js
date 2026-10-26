import { SCULPT } from '../js/gfx/scene-kit.js';

// FIRLATMA — a rocket launch at dawn, watched from across a lagoon. On the far shore the launch
// tower and its lightning masts stand against a sky going from peach and pink at the horizon,
// where the sun is about to come up, through lilac to the indigo of the night still overhead,
// with the last stars in it. The rocket climbs on a blinding flame out of a huge billowing cloud
// of exhaust and steam that rolls out along the shore from the pad, lit orange from below by the
// fire and lilac-blue in its shadows, its tops catching the rose of the dawn. The rocket's trail
// arcs over towards the downrange side, the high winds kinking and curling it, and once it climbs
// out of the earth's shadow it catches the sunlight that hasn't reached the ground yet and burns
// gold, the exhaust round the rocket blooming into a glowing translucent jellyfish (the twilight
// phenomenon). The still lagoon mirrors it all, broken only by slow ripples; palms on the far
// shore and reeds in the foreground stand in silhouette.
//
// One launch is a 40 s cycle: ignition, liftoff, the climb, the rocket gone to a point; the
// cloud thins into a low haze bank while the trail fades, and from that haze the next launch
// lights up, so the loop never cuts.
//
// The plume is built from billows seen from the front, each a dome with smaller domes on its
// crown, painted back to front; each one inflates in turn as the exhaust reaches it. Light is
// painted through a gradient map, from deep indigo through lilac and rose to orange and gold.
//
// Music: the bass drives the flame's length and brightness and the inner glow of the plume; the
// mids churn the billows; the highs throw sparks off the flame and make glints dance on the
// water; on some beats (about half) a shock-diamond pulse runs up the flame, and while the rocket
// is still low the ground glow under the pad flashes, all within the beat.
const frag = `${SCULPT}
float gPx, gAsp, gT, gS, gSl, gU, gRs, gFire, gPadFire, gRkA, gErode, gHaze, gDia, gDiaAge, gFlash, gSunY, gHx, gHy1, gHzn, gSpread, gLf, gJelly;
vec2 gPad, gGlow, gNoz, gDir;

// the plume's billows relative to the pad (x along the shore, y up, radius), back to front;
// the three with x near 0 are the column that rises behind the rocket
const vec3 PL[16] = vec3[16](
  vec3(0.015, 0.30, 0.05), vec3(-0.005, 0.21, 0.065), vec3(0.30, 0.31, 0.10), vec3(0.17, 0.25, 0.11),
  vec3(0.45, 0.23, 0.12), vec3(0.0, 0.12, 0.08), vec3(0.64, 0.14, 0.11), vec3(-0.22, 0.10, 0.10),
  vec3(0.31, 0.13, 0.15), vec3(0.09, 0.08, 0.12), vec3(0.80, 0.05, 0.11), vec3(0.53, 0.04, 0.13),
  vec3(-0.40, 0.03, 0.08), vec3(0.23, 0.0, 0.13), vec3(-0.10, 0.0, 0.10), vec3(0.97, 0.0, 0.08));

// the rocket's track: straight up off the pad, then pitching over downrange
vec2 path(float u) { u = clamp(u, 0.0, 1.0); return gPad + vec2(gHx * u * u, gHy1 * (1.0 - (1.0 - u) * (1.0 - u))); }
// seconds after liftoff when the rocket was at u along its track
float timeAt(float u) { return 28.0 * pow(max(u, 0.0), 1.0 / 1.35); }

// the dawn sky: peach at the horizon on the sun's side, the earth's blue shadow with the pink
// belt above it on the other, lilac, then the indigo still overhead
vec3 skyAt(vec2 p) {
  float h = p.y - gHzn;
  float gs = exp(-abs(p.x - gGlow.x) * 0.75);
  vec3 c = mix(vec3(0.2, 0.2, 0.42), vec3(1.05, 0.52, 0.3), gs);
  c = mix(c, mix(vec3(0.78, 0.36, 0.52), vec3(0.98, 0.46, 0.42), gs), ss(0.03, 0.24, h));
  c = mix(c, vec3(0.4, 0.24, 0.5), ss(0.2, 0.6, h));
  c = mix(c, vec3(0.12, 0.1, 0.31), ss(0.5, 1.05, h));
  c = mix(c, vec3(0.025, 0.03, 0.12), ss(0.95, 1.55, h));
  c += vec3(0.9, 0.42, 0.2) * exp(-length((p - gGlow) * vec2(0.55, 2.4)) * 2.2) * 0.3;
  return c;
}
// the light on the exhaust cloud, as a gradient map: indigo shadow, lilac-blue, rose, orange, gold
vec3 ramp(float v) {
  vec3 c = mix(vec3(0.05, 0.05, 0.14), vec3(0.16, 0.16, 0.36), ss(0.0, 0.22, v));
  c = mix(c, vec3(0.38, 0.28, 0.5), ss(0.18, 0.4, v));
  c = mix(c, vec3(0.76, 0.34, 0.38), ss(0.36, 0.56, v));
  c = mix(c, vec3(0.95, 0.34, 0.1), ss(0.52, 0.75, v));
  return mix(c, vec3(1.3, 0.72, 0.32), ss(0.78, 1.0, v));
}
// one billow, a dome seen from the front; the higher surface wins (see yazaksami)
void lobe(vec2 p, vec3 l, float zo, inout float D, inout float H, inout vec3 N) {
  vec2 d = (p - l.xy) * vec2(0.92, 1.06);
  float dd = dot(d, d);
  float e = l.z - sqrt(dd);
  D = max(D, e);
  if (e <= 0.0) return;
  float z = sqrt(l.z * l.z - dd), hz = z + zo;
  N = mix(N, vec3(d, z) / l.z, clamp(0.5 + 0.5 * (hz - H) / 0.03, 0.0, 1.0));
  H = max(H, hz);
}
float billow(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * abs(2.0 * noise(p) - 1.0); p = rot(0.6) * p * 2.1 + 3.3; a *= 0.5; }
  return s;
}
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }

// the light the fire throws on a point p with normal n: from the flame and from the pad
float fireLight(vec2 p, vec3 n, out float near) {
  vec2 fc = gNoz - gDir * gLf * 0.3;
  vec3 L1 = vec3(fc - p, 0.1);
  float d1 = length(L1);
  float a1 = gFire * (0.75 + 0.5 * gBass + 0.6 * gDia) / (1.0 + d1 * d1 * 9.0) * 0.8;
  vec3 L2 = vec3(gPad + vec2(0.03, -0.01) - p, 0.06);
  float d2 = length(L2);
  float a2 = gPadFire * (0.8 + 0.4 * gBass + 0.7 * gFlash) / (1.0 + d2 * d2 * 14.0);
  near = a1 * 0.6 + a2;
  return ss(-0.45, 0.6, dot(n, L1 / d1)) * a1 + ss(-0.45, 0.6, dot(n, L2 / d2)) * a2;
}

// the exhaust cloud rolling out along the shore
vec4 plume(vec2 p) {
  vec2 q = p - gPad;
  q.x /= gSpread;
  if (q.x < -0.6 || q.x > 1.22 || q.y > 0.47 || q.y < -0.03) return vec4(0.0);
  float churn = gMid * 0.35 * sin(uTime * 1.7);
  vec2 wq = q + (vec2(fbm(q * 3.2 + vec2(1.3, -gT * 0.07 + churn)), fbm(q * 3.2 + vec2(7.1, gT * 0.05 - churn))) - 0.5) * (0.05 + 0.05 * gMid);
  float D = -1.0, cav = 0.0;
  vec3 N = vec3(0.0, 0.0, 1.0);
  float nozH = gNoz.y - gPad.y;
  for (int i = 0; i < 16; i++) {
    vec3 l = PL[i];
    float fi = float(i);
    bool column = abs(l.x) < 0.05;
    float dist = length(l.xy);
    float t0 = column ? 4.6 + timeAt(1.0 - sqrt(max(1.0 - l.y / gHy1, 0.0))) : 2.2 + dist * 5.0;
    float g = ss(t0, t0 + 5.0 + dist * 5.0, gS);
    g = 1.0 - (1.0 - g) * (1.0 - g);
    if (g <= 0.002) continue;
    l.x *= mix(0.3, 1.0, g);
    l.y = mix(-l.z * 0.8, l.y, g) + gErode * 0.04 * l.y / 0.3;
    if (column) l.y = min(l.y, max(nozH - 0.02, 0.0));
    l.z *= mix(0.5, 1.0, g) * (1.0 + 0.04 * sin(gT * 0.6 + fi * 1.7)) * (1.0 + 0.12 * gErode);
    if (abs(wq.x - l.x) > l.z * 1.5 || abs(wq.y - l.y) > l.z * 1.5) { D = max(D, -0.2); continue; }
    float gD = -1.0, gH = -1e3;
    vec3 gN = vec3(0.0, 0.0, 1.0);
    lobe(wq, l, 0.0, gD, gH, gN);
    for (int j = 0; j < 3; j++) {
      float fj = float(j);
      float th = (fj - 1.0) * 0.9 + (hash21(vec2(fi, fj) + 4.7) - 0.5) * 0.6 + 0.15 * sin(gT * 0.35 + fi + fj * 2.0) + churn * 0.6 * (fj - 1.0);
      vec2 c = l.xy + l.z * 0.64 * vec2(sin(th), cos(th));
      lobe(wq, vec3(c, l.z * (0.38 + 0.14 * hash21(vec2(fj, fi) + 9.1))), 0.72 * l.z, gD, gH, gN);
    }
    float t = ss(0.0, 0.025, gD);
    N = mix(N, gN, t);
    cav = mix(max(cav, ss(-0.05, 0.0, gD)), 0.0, t);
    D = max(D, gD);
  }
  if (D < -0.05) return vec4(0.0);
  // the finest billows, in the noise
  vec2 bq = q * 16.0 + vec2(gT * 0.06, -gT * 0.05 + churn * 2.0);
  float b0 = billow(bq);
  float bx = billow(bq + vec2(0.06, 0.0)) - b0, by = billow(bq + vec2(0.0, 0.06)) - b0;
  D += (b0 - 0.4) * 0.03;
  D -= gErode * (0.01 + 0.05 * fbm(q * 5.0 + vec2(3.0, -uTime * 0.05)));   // dissolving into haze
  // the big form: one long flattened mound
  vec2 bf = (q - vec2(0.3, -0.06)) / vec2(0.8, 0.44);
  vec3 big = normalize(vec3(bf, sqrt(max(1.0 - dot(bf, bf), 0.05))));
  vec3 n = normalize(mix(normalize(N), big, 0.45) + vec3(bx, by, 0.0) * 0.22);
  float near;
  float w = fireLight(p, n, near);
  // the underbelly, lit from the fire still burning at the foot of the pad
  w += gPadFire * ss(0.24, -0.01, q.y) * exp(-abs(q.x - 0.12) * 1.8) * ss(0.7, -0.4, n.y) * (1.6 + 0.9 * gBass + 0.8 * gFlash);
  vec3 Ld = normalize(vec3(-0.55, 0.75, 0.35));
  float dawn = ss(0.1, 0.45, dot(n, Ld)) * ss(-0.02, 0.25, q.y);
  float ao = mix(1.0, 0.82, cav);
  float edge = 1.0 - ss(0.0, 0.04, D);
  float v = (0.04 + 0.1 * ss(-0.5, 0.8, n.y) + 0.2 * dawn) * ao + 0.74 * (1.0 - exp(-(w * 0.9 + edge * near * 0.6))) * mix(1.0, 0.75, cav);
  vec2 nxy = n.xy / max(length(n.xy), 1e-4);
  float rimDawn = (1.0 - ss(0.0, 0.025, D)) * pow(max(dot(nxy, normalize(vec2(-0.6, 0.8))), 0.0), 2.0) * ss(0.0, 0.12, q.y);
  v += rimDawn * 0.22;
  v += (fbm(q * 6.0 + 11.0) - 0.5) * 0.06;
  vec3 c = ramp(clamp(v, 0.0, 1.0));
  c += vec3(0.05, 0.07, 0.18) * edge * (1.0 - w);                       // sky light wrapping the edge
  // the inner glow, where the cloud is thick around the fire
  float glow = gPadFire * exp(-dot(q - vec2(0.06, 0.02), q - vec2(0.06, 0.02)) / 0.012) + gFire * exp(-dot(p - gNoz, p - gNoz) / 0.006) * 0.6;
  c += vec3(0.85, 0.26, 0.05) * glow * ss(0.0, 0.06, D) * (0.15 + 0.6 * gBass + 0.5 * gFlash) * (0.5 + 0.7 * b0);
  c = mix(c, skyAt(p), 0.06 + 0.45 * gErode);
  float a = ss(-gPx - 0.004 - 0.05 * gErode, gPx + 0.04 * gErode, D) * pow(1.0 - gErode, 1.5);
  return vec4(c, a);
}

// the low haze bank the last cloud leaves behind, out of which the next launch lights up
vec4 hazeBank(vec2 p) {
  if (gHaze <= 0.001) return vec4(0.0);
  vec2 q = p - gPad;
  q.x /= gSpread;
  if (q.y > 0.24 || q.x < -1.0 || q.x > 1.5) return vec4(0.0);
  float hump = exp(-pow((q.x - 0.3) / 0.55, 2.0));
  float top = (0.02 + 0.07 * fbm(vec2(q.x * 2.2 - uTime * 0.01, 1.7)) + 0.1 * hump) * ss(-1.0, -0.4, q.x) * ss(1.5, 0.9, q.x) - 0.02;
  top += (billow(vec2(q.x * 9.0 - uTime * 0.02, q.y * 12.0)) - 0.4) * 0.02;
  float D = top - q.y;
  vec3 n = normalize(vec3(0.0, 0.6, 0.8));
  float near;
  float w = fireLight(p, n, near);
  float v = 0.14 + 0.18 * ss(-0.02, 0.06, q.y) * ss(0.0, 0.05, D + 0.02) + 0.6 * (1.0 - exp(-w * 1.5));
  vec3 c = mix(ramp(clamp(v, 0.0, 1.0)), skyAt(p), 0.3);
  c += vec3(0.8, 0.26, 0.06) * gPadFire * exp(-dot(q, q) / 0.015) * (0.2 + 0.6 * gBass + 0.8 * gFlash);
  return vec4(c, ss(-0.015, 0.05, D) * gHaze * 0.85);
}

// a palm on the far shore, in silhouette
float palm(vec2 p, vec2 base, float h, float lean, float seed) {
  vec2 top = base + vec2(lean, h);
  if (abs(p.x - top.x) > 0.07 || p.y < base.y - 0.01 || p.y > top.y + 0.03) return 0.0;
  float ink = 0.0;
  // the trunk, curving a little
  vec2 r = p - base;
  float tt = clamp(r.y / h, 0.0, 1.0);
  float tx = lean * tt * tt;
  float tw = mix(0.0026, 0.0014, tt);
  ink = max(ink, ss(tw + gPx, tw, abs(r.x - tx)) * step(0.0, r.y) * step(r.y, h));
  for (int k = 0; k < 9; k++) {
    float fk = float(k);
    float ang = -1.5 + fk * 0.375 + (hash11(seed + fk) - 0.5) * 0.3 + 0.04 * sin(uTime * 0.7 + fk + seed);
    vec2 d = vec2(sin(ang), cos(ang));
    float len = 0.022 + 0.008 * hash11(seed * 3.1 + fk);
    vec2 m = top + d * len * 0.5 + vec2(0.0, 0.004);
    vec2 e = top + d * len + vec2(0.0, -len * (0.15 + 0.45 * abs(d.x)));
    float fd = min(seg(p, top, m), seg(p, m, e));
    float fw = 0.0016 * (1.0 - 0.7 * clamp(length(p - top) / len, 0.0, 1.0));
    ink = max(ink, ss(fw + gPx, fw, fd));
  }
  return ink;
}

// the launch tower, its lightning masts and wires, the shore, the palms: all in one ink
float shoreInk(vec2 p) {
  float ink = 0.0;
  // the far shore, low scrub along it
  float land = gHzn + 0.006 + 0.004 * noise(vec2(p.x * 40.0, 2.0)) + 0.003 * noise(vec2(p.x * 120.0, 5.0));
  ink = max(ink, ss(land + gPx, land, p.y));
  vec2 r = p - gPad;
  if (abs(r.x) < 0.14 && r.y < 0.2 && r.y > -0.02) {
    // the lattice tower beside the rocket
    vec2 t = r - vec2(-0.02, 0.0);
    float th = 0.128, tw = 0.007;
    if (abs(t.x) < tw + gPx * 2.0 && t.y < th) {
      float frame = ss(gPx * 1.2, gPx * 0.4, abs(abs(t.x) - tw + gPx * 0.6));
      float br = abs(fract((t.y + t.x * sign(fract(t.y / 0.026) - 0.5)) / 0.013) - 0.5) * 0.013;
      float lat = max(frame, ss(gPx * 0.9, gPx * 0.3, br) * 0.85);
      ink = max(ink, max(lat, 0.35) * step(abs(t.x), tw) * step(t.y, th));
    }
    ink = max(ink, ss(gPx * 1.6, gPx * 0.6, abs(t.y - th)) * step(abs(t.x), tw + 0.002) * step(t.y, th + 0.002));
    // the crew access arm reaching to the rocket (swung back after liftoff)
    float arm = mix(0.017, 0.007, ss(2.0, 5.0, gS) * (1.0 - ss(37.0, 39.0, gS)));
    ink = max(ink, ss(gPx * 1.4, gPx * 0.5, abs(t.y - 0.092)) * step(tw, t.x) * step(t.x, tw + arm));
    // the mount
    ink = max(ink, step(abs(r.x - 0.005), 0.03) * ss(0.012 + gPx, 0.012, r.y));
    // three lightning masts and the wires slung between them
    for (int i = 0; i < 3; i++) {
      float mx = i == 0 ? -0.075 : i == 1 ? 0.085 : -0.04;
      float mh = i == 2 ? 0.175 : 0.165;
      float mw = gPx * 0.55 + 0.0012 * (1.0 - r.y / mh);
      ink = max(ink, ss(mw + gPx * 0.6, mw, abs(r.x - mx)) * step(r.y, mh));
    }
    for (int i = 0; i < 2; i++) {
      float x0 = i == 0 ? -0.075 : -0.04, x1 = i == 0 ? -0.04 : 0.085;
      float y0 = i == 0 ? 0.165 : 0.175, y1 = i == 0 ? 0.175 : 0.165;
      float s = clamp((r.x - x0) / (x1 - x0), 0.0, 1.0);
      float wy = mix(y0, y1, s) - 0.035 * s * (1.0 - s) * 4.0 * (x1 - x0) / 0.125;
      ink = max(ink, ss(gPx * 1.0, gPx * 0.3, abs(r.y - wy)) * step(x0, r.x) * step(r.x, x1) * 0.8);
    }
  }
  return ink;
}
float palms(vec2 p) {
  float ink = 0.0;
  if (p.y > gHzn + 0.13) return 0.0;
  ink = max(ink, palm(p, vec2(gPad.x - 0.36 * gSpread, gHzn + 0.004), 0.062, -0.006, 1.0));
  ink = max(ink, palm(p, vec2(gPad.x - 0.32 * gSpread, gHzn + 0.004), 0.048, 0.008, 7.0));
  ink = max(ink, palm(p, vec2(gPad.x + 0.62 * gSpread, gHzn + 0.004), 0.07, 0.01, 3.0));
  ink = max(ink, palm(p, vec2(gPad.x + 0.67 * gSpread, gHzn + 0.004), 0.052, -0.006, 5.0));
  ink = max(ink, palm(p, vec2(gPad.x + 1.12 * gSpread, gHzn + 0.004), 0.06, 0.008, 9.0));
  ink = max(ink, palm(p, vec2(gPad.x - 0.95, gHzn + 0.004), 0.058, -0.008, 11.0));
  return ink;
}

// the trail: smoke in the earth's shadow low down, sunlit gold up high, curled by the winds
void trail(vec2 p, inout vec3 col) {
  if (gU < 0.002 || gS < 4.0) return;
  float fade = 1.0 - ss(31.0, 40.0, gS);
  vec2 lo = gPad - vec2(0.12, 0.03), hi = path(gU) + vec2(0.0, 0.05);
  if (p.x < lo.x - 0.1 || p.x > hi.x + 0.16 || p.y < lo.y || p.y > max(hi.y, gPad.y + gHy1) + 0.1) return;
  float best = 1e3, bu = 0.0, bs = 0.0, bage = 0.0;
  vec2 prev = gPad;
  float pu = 0.0, page = gSl;
  for (int k = 1; k <= 22; k++) {
    float u = gU * float(k) / 22.0;
    float age = max(gSl - timeAt(u), 0.0);
    vec2 P = path(u) + vec2(age * (0.0032 * sin(u * 7.0 + 1.0) + 0.0022 * sin(u * 17.0 + 3.0)) * (0.3 + u), age * 0.0012 * sin(u * 5.0 + 2.0));
    vec2 pa = p - prev, ba = P - prev;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    vec2 dv = pa - ba * h;
    float d = length(dv);
    if (d < best) { best = d; bu = mix(pu, u, h); bage = mix(page, age, h); bs = ba.x * pa.y - ba.y * pa.x; }
    prev = P; pu = u; page = age;
  }
  float w = 0.0035 + bage * 0.0021 * (0.4 + bu) + 0.035 * exp(-bu * 14.0) * ss(0.0, 8.0, bage);
  w *= (0.8 + 0.4 * noise(vec2(bu * 40.0, 1.0)));
  float dens = exp(-best * best / (w * w)) * (0.6 + 0.4 * noise(vec2(bu * 90.0 - bage * 0.3, best / w * 2.0)));
  dens *= ss(0.0, 0.004, bage + 0.002) * fade;
  if (dens < 0.003) return;
  float lit = ss(gSunY - 0.05, gSunY + 0.06, p.y);
  float sideSun = 0.6 + 0.4 * sign(bs) * -sign(gHx);                   // the side turned to the sun
  vec3 shadowC = mix(vec3(0.22, 0.18, 0.34), vec3(0.14, 0.12, 0.25), ss(0.0, 0.5, p.y - gHzn));
  vec3 sunC = mix(vec3(1.0, 0.3, 0.22), vec3(1.25, 0.78, 0.45), ss(gSunY - 0.02, gSunY + 0.14, p.y));
  sunC = mix(sunC, vec3(1.15, 1.05, 0.98), ss(gSunY + 0.15, gSunY + 0.5, p.y)) * (0.6 + 0.35 * sideSun);
  vec3 c = mix(shadowC, sunC, lit);
  float near;
  float fl = fireLight(p, vec3(0.0, 0.0, 1.0), near);
  c += vec3(1.1, 0.48, 0.18) * min(fl * 1.4, 1.0);
  col = mix(col, c, min(dens, 1.0) * mix(0.75, 0.9, lit));
}

// the exhaust high up, blooming out round the rocket into a glowing jellyfish once it is sunlit
void jelly(vec2 p, inout vec3 col) {
  if (gJelly <= 0.002) return;
  vec2 rel = p - gNoz;
  float f = -dot(rel, gDir), b = dot(rel, vec2(-gDir.y, gDir.x));
  if (f < -0.02 || f > 0.4 || abs(b) > 0.3) return;
  float hw = 0.004 + 0.5 * f + 2.2 * f * f;
  float inside = ss(hw, hw * 0.55, abs(b)) * ss(-0.005, 0.01, f);
  float rimv = ss(hw * 0.55, hw * 0.95, abs(b)) * ss(hw * 1.05, hw * 0.92, abs(b));
  float streak = noise(vec2(b / (f + 0.015) * 7.0, f * 4.0 - uTime * 0.4));
  float fall = exp(-f / 0.1);
  vec3 c = vec3(0.45, 0.62, 1.05) * (inside * (0.12 + 0.35 * streak) + rimv * 0.6) * fall;
  c += vec3(1.3, 0.95, 0.6) * exp(-f / 0.03) * inside * 0.6;
  col += c * gJelly * 0.8;
}

// the rocket and its flame
void rocket(vec2 p, inout vec3 col) {
  vec2 rel = p - gNoz;
  vec2 pe = vec2(-gDir.y, gDir.x);
  float a = dot(rel, gDir), b = dot(rel, pe);
  if (abs(b) > 0.06 || a > 0.12 || a < -0.5) return;
  float L = 0.1 * gRs, W = 0.0062 * gRs;
  // the body and its nose
  if (gRkA > 0.001 && a > -0.003 && a < L + gPx) {
    float wb = W * (a < L * 0.8 ? 1.0 : sqrt(max(0.0, (L - a) / (L * 0.2))));
    wb = a < 0.0 ? W * 0.8 : wb;
    float body = ss(wb + gPx * 0.7, wb - gPx * 0.3, abs(b)) * step(a, L);
    float side = b / max(W, 1e-4) * sign(gGlow.x - gNoz.x) * sign(gDir.y);
    vec3 bc = mix(vec3(0.07, 0.065, 0.12), vec3(0.5, 0.36, 0.48), ss(0.2, 0.95, side));
    bc = mix(bc, vec3(0.05, 0.05, 0.08), step(abs(a - L * 0.62), L * 0.035));     // the interstage band
    bc += vec3(1.2, 0.55, 0.22) * exp(-a / (L * 0.25)) * gFire;
    bc += vec3(0.9, 0.6, 0.45) * ss(gSunY, gSunY + 0.1, gNoz.y) * ss(-0.2, 0.9, side) * 0.6;
    col = mix(col, bc, body * gRkA * ss(0.0, 1.2, gS));
  }
  // the flame: a white core with shock diamonds in it, gold round it, orange at the edge
  if (gFire > 0.001 && a < 0.002) {
    float f = -a;
    float t = f / max(gLf, 1e-4);
    if (t < 1.0) {
      float wf = W * (0.75 + 2.2 * t) * (1.0 - t * t) * (1.0 + 0.8 * gU);
      float bb = abs(b) / max(wf, 1e-5);
      float flick = 0.85 + 0.15 * noise(vec2(f * 120.0 - uTime * 30.0, 3.0));
      float core = exp(-bb * bb * 3.0) * pow(1.0 - t, 1.2);
      float outer = exp(-bb * bb * 0.8) * (1.0 - t);
      float dia = pow(0.5 + 0.5 * cos(f / max(W * 2.6, 1e-4) * 6.2832), 6.0) * exp(-t * 3.0) * exp(-bb * bb * 5.0);
      float front = gDiaAge / 0.3;
      float pulse = gDia * ss(0.22, 0.0, abs(t - front));
      vec3 fc = vec3(1.4, 0.45, 0.12) * outer * 1.2 + vec3(2.0, 1.3, 0.55) * core * 1.4 + vec3(2.6, 2.4, 2.1) * pow(core, 3.0) * 1.5;
      fc += vec3(2.4, 2.1, 1.7) * dia * (0.6 + 3.0 * pulse) + vec3(1.6, 0.9, 0.4) * pulse * outer;
      col += fc * gFire * flick * (0.8 + 0.4 * gBass);
    }
  }
}

// sparks thrown off the flame
void sparks(vec2 p, inout vec3 col) {
  if (gFire < 0.01) return;
  vec2 tail = gNoz - gDir * gLf * 0.8;
  if (length(p - tail) > 0.35) return;
  float amt = 0.15 + 2.0 * gHigh;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float rate = 0.9 + hash11(fi * 3.3) * 0.8;
    float ph = fract(uTime * rate + hash11(fi * 7.1));
    float ang = (hash11(fi * 1.9 + floor(uTime * rate + hash11(fi * 7.1))) - 0.5) * 2.4;
    vec2 v = (-gDir * 0.5 + vec2(-gDir.y, gDir.x) * sin(ang) * 0.6) * (0.12 + 0.12 * hash11(fi * 5.5));
    vec2 sp = tail + v * ph + vec2(0.0, -0.09) * ph * ph;
    sp.y = max(sp.y, gHzn + 0.01);
    vec2 dv = p - sp;
    float d = length(dv - v * clamp(dot(dv, v) / dot(v, v), -0.04, 0.0));
    col += vec3(1.8, 0.9, 0.35) * exp(-d * d / (gPx * gPx * 0.8)) * (1.0 - ph) * amt * gFire;
  }
}

// everything above the waterline; refl says we are looking at it in the lagoon
vec3 world(vec2 p, float refl) {
  vec3 col = skyAt(p);
  // the last stars, fading towards the dawn
  if (p.y > gHzn + 0.2) {
    for (int layer = 0; layer < 2; layer++) {
      float scale = 38.0 + float(layer) * 44.0;
      vec2 g = p * scale + float(layer) * 31.7;
      vec2 cell = floor(g), f = fract(g) - 0.5;
      float h = hash21(cell + 53.0);
      if (h > 0.045) continue;
      vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
      float r = length(f - off * 0.7) / scale;
      float tw = 0.8 + 0.2 * sin(uTime * (1.3 + h * 30.0) + h * 70.0);
      float mag = 0.1 + pow(hash21(cell + 1.3), 5.0) * 1.4;
      float fadeS = ss(gHzn + 0.35, gHzn + 1.2, p.y) * (1.0 - 0.85 * exp(-abs(p.x - gGlow.x) * 0.9));
      col += vec3(0.9, 0.92, 1.0) * mag * tw * exp(-r * r / (gPx * gPx * 0.6)) * fadeS * (1.0 - 0.4 * refl);
    }
  }
  trail(p, col);
  jelly(p, col);
  // the tower and masts, behind the cloud
  float ink = shoreInk(p);
  // red lamps on the mast tops
  vec2 r = p - gPad;
  col = mix(col, vec3(0.015, 0.014, 0.035), ink);
  for (int i = 0; i < 3; i++) {
    float mx = i == 0 ? -0.075 : i == 1 ? 0.085 : -0.04;
    float mh = i == 2 ? 0.175 : 0.165;
    float blink = step(0.5, fract(uTime * 0.5 + float(i) * 0.33));
    col += vec3(1.6, 0.15, 0.08) * exp(-dot(r - vec2(mx, mh + 0.002), r - vec2(mx, mh + 0.002)) / (gPx * gPx * 1.2)) * blink;
  }
  rocket(p, col);
  vec4 hz = hazeBank(p);
  col = mix(col, hz.rgb, hz.a);
  vec4 pl = plume(p);
  col = mix(col, pl.rgb, pl.a);
  col = mix(col, vec3(0.012, 0.01, 0.03), palms(p));
  // the fire's light scattered in the air: round the flame, and under the pad
  vec2 fc = gNoz - gDir * gLf * 0.3;
  float df = length(p - fc);
  float fl = gFire * (0.75 + 0.55 * gBass + 0.6 * gDia);
  col += vec3(1.2, 0.5, 0.18) * (exp(-df / (0.012 * gRs + 0.004)) * 0.7 + exp(-df / 0.06) * 0.16 + exp(-df / 0.25) * 0.05) * fl;
  vec2 dp = (p - gPad - vec2(0.03, 0.0)) * vec2(0.55, 1.6);
  col += vec3(1.0, 0.36, 0.1) * (exp(-length(dp) / 0.025) * 0.35 + exp(-length(dp) / 0.18) * 0.07) * gPadFire * (0.7 + 0.3 * gBass + 0.8 * gFlash);
  // the streak a lens draws through the flame
  col += vec3(1.0, 0.55, 0.3) * exp(-abs(p.y - fc.y) * 220.0) * exp(-abs(p.x - fc.x) * 3.5) * 0.18 * fl * (1.0 - 0.6 * refl);
  sparks(p, col);
  return col;
}

// reeds in the foreground water, in one ink
float reeds(vec2 uv) {
  float ink = 0.0;
  for (int side = 0; side < 2; side++) {
    float sx = side == 0 ? -1.0 : 1.0;
    float ex = sx * gAsp;
    if (abs(uv.x - ex) > 0.36 || uv.y > -0.3) continue;
    for (int i = 0; i < 9; i++) {
      float fi = float(i) + float(side) * 9.0;
      float bx = ex - sx * (0.02 + 0.3 * pow(hash11(fi * 2.7), 1.4));
      float h = 0.2 + 0.42 * hash11(fi * 5.3) * (1.0 - 0.6 * abs(bx - ex) / 0.32);
      float bend = (hash11(fi * 9.1) - 0.3) * 0.25 * -sx + 0.012 * sin(uTime * 0.6 + fi);
      float y = uv.y + 1.02;
      if (y < 0.0 || y > h) continue;
      float tt = y / h;
      float cx = bx + bend * tt * tt * h;
      float w = mix(0.006, 0.0008, tt);
      ink = max(ink, ss(w + gPx, w, abs(uv.x - cx)));
      if (hash11(fi * 13.7) < 0.35) {          // a cattail head
        vec2 hc = vec2(bx + bend * 0.8 * h * 0.81, h * 0.82 - 1.02);
        vec2 hd = (uv - hc) * vec2(1.0, 0.25);
        ink = max(ink, ss(0.0065 + gPx, 0.0065, length(hd)));
      }
    }
  }
  return ink;
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gT = uCruise * 0.5;
  gS = mod(uTime + 16.5, 40.0);                    // seconds into this launch
  gSl = gS - 4.0;                                   // seconds since liftoff
  gHzn = -0.36;
  gSpread = mix(0.7, 1.0, ss(0.7, 1.5, gAsp));
  gPad = vec2(-min(gAsp * 0.17, 0.3), gHzn + 0.008);
  gGlow = vec2(-max(gAsp * 0.75, 0.5), gHzn);
  gHx = min(gAsp * 0.48, 0.85);
  gHy1 = 1.12;
  gSunY = 0.4;
  gU = gSl > 0.0 ? min(pow(gSl / 28.0, 1.35), 1.0) : 0.0;
  gNoz = path(gU) + vec2(0.0, 0.016 * (1.0 - ss(0.0, 3.0, gSl)));
  gDir = normalize(vec2(2.0 * gHx * gU, 2.0 * gHy1 * (1.0 - gU)) + vec2(0.0, 1e-4));
  gRs = mix(1.0, 0.3, sqrt(gU));
  gRkA = 1.0 - ss(31.0, 36.0, gS);
  gFire = ss(1.2, 3.8, gS) * gRkA;
  gPadFire = ss(1.0, 3.0, gS) * mix(1.0, 0.45, ss(6.5, 14.0, gS)) * (1.0 - ss(24.0, 36.0, gS));
  gErode = ss(31.0, 40.0, gS);
  gHaze = max(ss(30.0, 39.0, gS), 1.0 - ss(2.0, 15.0, gS));
  gLf = (0.085 + 0.08 * gBass) * gRs * (1.0 + 2.2 * gU) * gFire;
  gJelly = ss(gSunY + 0.12, gSunY + 0.45, gNoz.y) * gFire;
  gDia = 0.0; gDiaAge = 1.0; gFlash = 0.0;
  if (uAudioActive > 0.5 && uBeatAge < 0.45 && hash11(uBeatCount * 7.7 + 0.3) < 0.5) {
    float a = uBeatAge;
    gDia = uPunch * pow(1.0 - a / 0.45, 2.0);
    gDiaAge = a;
    gFlash = uPunch * exp(-a * 9.0) * ss(0.45, 0.3, a);
  }

  vec3 col;
  if (uv.y >= gHzn) {
    col = world(uv, 0.0);
  } else {
    // the lagoon: the world mirrored, broken by slow ripples that get finer towards the far shore
    float d = gHzn - uv.y;
    float pz = 1.0 / (d + 0.03);
    float r1 = noise(vec2(uv.x * pz * 0.18 + 3.0, pz * 1.6 + uTime * 0.35)) - 0.5;
    float r2 = noise(vec2(uv.x * pz * 0.5 + 9.0, pz * 4.0 - uTime * 0.5)) - 0.5;
    float rip = r1 + 0.5 * r2;
    vec2 rp = vec2(uv.x + rip * 0.014 * (0.3 + d * 2.5), gHzn + d * (1.0 + 0.2 * rip) + rip * 0.006);
    col = world(rp, 1.0);
    col *= mix(0.48, 0.36, ss(0.0, 0.6, d)) * (0.85 + 0.5 * rip);
    col += vec3(0.008, 0.012, 0.03);
    // the flame's light laid down the water in a broken path, with glints dancing in it
    vec2 fc = gNoz - gDir * gLf * 0.3;
    float fx = abs(uv.x - fc.x + rip * 0.02 * d);
    float path = exp(-fx / (0.006 + d * 0.05)) * exp(-d * 1.6) * (0.5 + 0.8 * ss(-0.1, 0.25, rip));
    col += vec3(1.0, 0.45, 0.16) * path * (gFire * 0.35 + gPadFire * 0.3);
    vec2 gg = vec2(uv.x * pz * 2.4, pz * 5.0 + uTime * 0.2);
    vec2 cell = floor(gg), fr = fract(gg) - 0.5;
    float h = hash21(cell + 17.0);
    float tw = pow(max(sin(uTime * (3.0 + h * 9.0) + h * 40.0), 0.0), 4.0);
    float dash = exp(-fr.x * fr.x * 40.0 - fr.y * fr.y * 160.0) * step(h, 0.12 + 0.2 * gHigh) * ss(0.45, 0.15, d);
    float lightHere = path * (gFire + gPadFire) * 1.6 + exp(-abs(uv.x - gGlow.x) * 1.2) * 0.45 + 0.12;
    col += vec3(1.5, 0.95, 0.6) * dash * tw * lightHere * (0.12 + 2.2 * gHigh) * ss(0.0, 0.03, d);
    // a faint lighter line where the far shore meets the water
    col += vec3(0.25, 0.12, 0.14) * exp(-d * 260.0) * 0.4;
  }
  col = mix(col, vec3(0.008, 0.008, 0.02), reeds(uv));
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'roket', name: 'Fırlatma', group: 'Vibe',
  blurb: 'A rocket launch at dawn across a still lagoon: a blinding flame, a huge glowing exhaust cloud, and a trail that catches the sunlight high above',
  tags: ['rocket', 'launch', 'dawn', 'sky', 'water', 'cinematic', 'warm'],
  energy: 0.35, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
