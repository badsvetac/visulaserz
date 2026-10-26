import { SCULPT } from '../js/gfx/scene-kit.js';

// KAR KÜRESİ — a snow globe on a winter evening: inside the glass a little snowed-in Istanbul, the
// Galata Tower with its pointed cap and lit windows rising over a huddle of houses and snowy pines,
// the snow turning round and round in the water; outside, the warm room goes soft behind it.
//
// The glass is solved exactly: the eye's ray meets the sphere, part of it is reflected (the room's
// lights slide over the curve) and the rest bends into the water, where the little town is marched
// as solid geometry and the snow is counted flake by flake along the bent ray.
//
// Music: the bass shakes the globe, so the snow whirls faster and higher; the mids light the
// windows of the houses and the tower's lantern; the highs make the flakes sparkle; each beat lifts
// a ring of snow off the ground.
const frag = `${SCULPT}
const vec3 C = vec3(0.0, 1.05, 0.0);
const float R = 1.0;
const float GROUND = 0.36;            // the snow inside rises to here (globe space, from C)

float gSwirl, gLift;

float boxR(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float cylY(vec3 p, float r, float h) { vec2 d = vec2(length(p.xz) - r, abs(p.y) - h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
float cone(vec3 p, float r, float h) {                 // a cone standing on y = 0, point at y = h
  vec2 q = vec2(length(p.xz), p.y);
  vec2 k = vec2(h, r) / length(vec2(h, r));
  float side = dot(q - vec2(0.0, h), vec2(k.x, k.y));
  return max(max(side, -q.y), q.y - h);
}
// the houses round the tower: positions, sizes, roof turned which way
vec4 house(int i, out float ang) {
  float f = float(i);
  float a = f * 2.39996 + 0.7;
  float r = 0.3 + 0.24 * hash11(f * 3.1);
  ang = hash11(f * 5.3) * PI;
  return vec4(cos(a) * r, 0.0, sin(a) * r * 0.85 + 0.05, 0.055 + 0.03 * hash11(f * 7.7));
}
float groundAt(vec2 xz) { return -GROUND + 0.1 * (1.0 - dot(xz, xz) / 0.7) + 0.02 * noise(xz * 7.0); }

// the town in the globe, in globe space (origin at the globe's centre): x = distance, y = material
// (1 snow, 2 stone, 3 roof snow, 4 wall, 5 window, 6 tree, 7 cap)
vec2 town(vec3 p) {
  vec2 d = vec2(p.y - groundAt(p.xz), 1.0);
  p = vec3(p.x, p.y + GROUND, p.z) / 1.35 - vec3(0.0, GROUND, 0.0);   // the town is modelled small and shown 1.35 times bigger
  // the Galata Tower: a round stone tower, its gallery near the top, and the tall pointed cap
  vec3 tp = p - vec3(0.02, -0.02, -0.06);
  float g = groundAt(tp.xz);
  float shaft = cylY(tp - vec3(0.0, g + 0.17, 0.0), 0.06, 0.17);
  shaft = min(shaft, cylY(tp - vec3(0.0, g + 0.035, 0.0), 0.07, 0.035));      // the wider foot
  float gallery = cylY(tp - vec3(0.0, g + 0.335, 0.0), 0.074, 0.008);
  float drum = cylY(tp - vec3(0.0, g + 0.36, 0.0), 0.058, 0.025);
  d = nearer(d, vec2(min(min(shaft, gallery), drum), 2.0));
  d = nearer(d, vec2(cone(tp - vec3(0.0, g + 0.383, 0.0), 0.064, 0.16) * 0.8, 7.0));
  // the windows: a ring of arched openings in the drum under the cap, and a few slits below
  float wa = atan(tp.z, tp.x) * 10.0 / TAU, wy = tp.y - g;
  float ring = max(abs(fract(wa) - 0.5) - 0.2, abs(wy - 0.36) - 0.016);
  float slits = max(abs(fract(wa * 0.5 + 0.25) - 0.5) - 0.09, abs(fract(wy * 14.0) - 0.5) - 0.18);
  if (min(drum, shaft) < 0.004 && (ring < 0.0 || (slits < 0.0 && wy > 0.1 && wy < 0.3 && hash11(floor(wy * 14.0)) > 0.4))) d.y = 5.0;
  // the houses: little boxes with pitched roofs, snow on top
  for (int i = 0; i < 8; i++) {
    float ang;
    vec4 h = house(i, ang);
    vec3 hp = p - vec3(h.x, groundAt(h.xz), h.z);
    hp.xz = rot(ang) * hp.xz;
    float s = h.w;
    float body = boxR(hp - vec3(0.0, s * 0.55, 0.0), vec3(s * 0.75, s * 0.55, s * 0.55), 0.004);
    vec3 rp = hp - vec3(0.0, s * 1.1, 0.0);
    float roof = max(abs(rp.x) - s * 0.82, abs(rp.z) * 0.9 + rp.y * 1.15 - s * 0.62);
    roof = max(roof, -rp.y);
    d = nearer(d, vec2(body, 4.0));
    d = nearer(d, vec2(roof, 3.0));
    // a lit window on the front of each
    vec3 wq = hp - vec3(0.0, s * 0.5, s * 0.55);
    if (body < 0.004 && abs(wq.x) < s * 0.22 && abs(wq.y) < s * 0.2 && wq.z > -0.01) d.y = 5.0;
  }
  // a few pines, snow on their boughs
  for (int i = 0; i < 4; i++) {
    float f = float(i);
    vec2 at = vec2(cos(f * 1.7 + 0.4), sin(f * 1.7 + 0.4)) * (0.5 + 0.08 * f);
    vec3 q = p - vec3(at.x, groundAt(at), at.y * 0.8);
    float tree = cone(q, 0.075, 0.24);
    d = nearer(d, vec2(tree, 6.0));
  }
  return d;
}
vec3 townNormal(vec3 p) {
  vec2 e = vec2(0.0008, -0.0008);
  return normalize(e.xyy * town(p + e.xyy).x + e.yyx * town(p + e.yyx).x + e.yxy * town(p + e.yxy).x + e.xxx * town(p + e.xxx).x);
}

// the room behind and around: warm, dark, a few lights far off and out of focus
vec3 room(vec3 r) {
  vec3 c = mix(vec3(0.006, 0.004, 0.003), vec3(0.07, 0.045, 0.032), ss(0.02, 0.6, r.y));
  // a window on the left with the blue of a snowy evening in it
  c += vec3(0.25, 0.35, 0.6) * ss(0.82, 0.9, dot(r, normalize(vec3(-0.8, 0.35, 0.5)))) * 0.6;
  // a lamp on the right, warm
  c += vec3(1.0, 0.7, 0.4) * ss(0.94, 0.985, dot(r, normalize(vec3(0.7, 0.45, 0.55)))) * 1.6;
  return c;
}
// out of focus behind the globe: soft discs of the room's lights, a garland of them
vec3 bokeh(vec2 uv) {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 18; i++) {
    float f = float(i);
    vec2 at = vec2(-1.7 + f * 0.2 + 0.08 * sin(f * 3.1), 0.62 + 0.22 * sin(f * 0.55 + 0.4) + 0.06 * hash11(f));
    float r = 0.05 + 0.05 * hash11(f * 2.7);
    float d = length(uv - at);
    float disc = ss(r, r * 0.86, d) * (0.75 + 0.25 * ss(r * 0.6, r * 0.95, d));     // a bright rim, as real bokeh has
    vec3 tint = mix(vec3(1.0, 0.62, 0.3), vec3(1.0, 0.85, 0.55), hash11(f * 5.1));
    c += tint * disc * (0.14 + 0.08 * hash11(f * 9.3)) * (1.0 + gMid * 0.6 * sin(uTime * 2.0 + f));
  }
  return c;
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gSwirl = uTime * 0.25 + uTravel * 0.4 * uAudioActive;
  gLift = gBass;

  vec3 ro = vec3(sin(uTime * 0.05) * 0.22, 1.5, 3.05);
  vec3 rd = viewRay(ro, vec3(0.0, 0.95, 0.0), uv, 1.95);

  // the background: the table and the room, soft
  vec3 col = room(rd) + bokeh(uv);
  float tTable = -ro.y / rd.y;
  if (rd.y < 0.0) {
    vec3 tp = ro + rd * tTable;
    vec3 wood = vec3(0.12, 0.06, 0.03) * (0.75 + 0.25 * noise(vec2(tp.x * 2.0, tp.z * 18.0)));
    float glow = exp(-dot(tp.xz, tp.xz) * 1.2);                        // the town's light falls round the base
    vec3 lamp = normalize(vec3(0.7, 0.45, 0.55));
    col = wood * (0.12 + 0.6 * glow * (0.6 + 0.6 * gMid) + 0.5 * vec3(1.0, 0.75, 0.5) * exp(-length(tp.xz - vec2(1.2, 0.8)) * 0.6)) + room(reflect(rd, vec3(0, 1, 0))) * 0.12;
    col *= ss(9.0, 3.0, tTable);
  }
  // the base: dark polished wood with a brass band
  {
    float t = 0.0; bool hitBase = false;
    for (int i = 0; i < 40; i++) {
      vec3 p = ro + rd * t;
      vec3 q = p - vec3(0.0, 0.18, 0.0);
      float rr = mix(0.86, 0.74, ss(-0.18, 0.18, q.y));
      float dB = max(length(q.xz) - rr, abs(q.y) - 0.18);
      if (dB < 0.001) { hitBase = true; break; }
      t += dB;
      if (t > 8.0) break;
    }
    if (hitBase && (rd.y > 0.0 || t < tTable)) {
      vec3 p = ro + rd * t;
      vec3 n = normalize(vec3(p.x, 0.25, p.z));
      float band = ss(0.29, 0.3, p.y) * ss(0.35, 0.34, p.y);
      vec3 wood = vec3(0.1, 0.045, 0.022) * (0.8 + 0.2 * noise(vec2(atan(p.z, p.x) * 20.0, p.y * 3.0)));
      vec3 brass = vec3(0.9, 0.66, 0.3);
      vec3 base = mix(wood, brass * 0.35, band);
      vec3 env = room(reflect(rd, n));
      vec3 lamp = normalize(vec3(0.7, 0.45, 0.55));
      col = base * (0.25 + 1.4 * vec3(1.0, 0.78, 0.55) * max(dot(n, lamp), 0.0)) + env * mix(0.2, 0.9, band) + brass * band * pow(max(dot(reflect(rd, n), lamp), 0.0), 30.0) * 1.5;
    }
  }

  // the globe
  vec3 o = ro - C;
  float b = dot(o, rd), c = dot(o, o) - R * R;
  float disc = b * b - c;
  if (disc > 0.0) {
    float t0 = -b - sqrt(disc);
    vec3 P = ro + rd * t0;
    vec3 N = (P - C) / R;
    float cosi = -dot(rd, N);
    float fres = 0.03 + 0.97 * pow(1.0 - cosi, 5.0);
    vec3 refl = room(reflect(rd, N)) + bokeh(uv + N.xy * 0.4) * 0.3;
    // into the water
    vec3 rr = refract(rd, N, 1.0 / 1.33);
    vec3 q0 = P - C;
    // where the bent ray leaves the globe again
    float bb = dot(q0, rr), cc2 = dot(q0, q0) - R * R * 0.995;
    float tOut = -bb + sqrt(max(bb * bb - cc2, 0.0));
    float t = 0.002;
    vec2 h = vec2(1.0, 0.0);
    bool found = false;
    for (int i = 0; i < 70; i++) {
      h = town(q0 + rr * t);
      if (h.x < 0.0005) { found = true; break; }
      t += h.x * 0.8;
      if (t > tOut) break;
    }
    vec3 inside;
    float tEnd = found ? t : tOut;
    if (found) {
      vec3 p = q0 + rr * t, n = townNormal(p);
      float id = h.y;
      vec3 moon = normalize(vec3(-0.5, 0.8, 0.4));
      float dif = max(dot(n, moon), 0.0);
      vec3 cool = vec3(0.32, 0.42, 0.62), warm = vec3(1.0, 0.68, 0.32);
      // the windows' light on the snow nearby
      float lights = 0.0;
      for (int i = 0; i < 8; i++) {
        float ang; vec4 hh = house(i, ang);
        vec3 w = (vec3(hh.x, groundAt(hh.xz) + hh.w * 0.5, hh.z) + vec3(0.0, GROUND, 0.0)) * 1.35 - vec3(0.0, GROUND, 0.0);
        lights += 0.004 / (0.004 + dot(p - w, p - w)) * band(0.12 + 0.07 * float(i));
      }
      vec3 lantern = (vec3(0.02, groundAt(vec2(0.02, -0.06)) + 0.36, -0.06) + vec3(0.0, GROUND, 0.0)) * 1.35 - vec3(0.0, GROUND, 0.0);
      lights += 0.006 / (0.006 + dot(p - lantern, p - lantern)) * (0.6 + 0.8 * gMid);
      vec3 albedo = id < 1.5 ? vec3(0.92, 0.94, 1.0) : id < 2.5 ? vec3(0.62, 0.56, 0.48) * (0.85 + 0.15 * step(0.5, fract(p.y * 90.0))) : id < 3.5 ? vec3(0.95, 0.96, 1.0)
        : id < 4.5 ? vec3(0.62, 0.42, 0.3) : id < 5.5 ? vec3(1.0) : id < 6.5 ? vec3(0.12, 0.24, 0.16) : vec3(0.16, 0.2, 0.27);
      if (id > 5.5 && id < 6.5) albedo = mix(albedo, vec3(0.9, 0.93, 1.0), ss(0.2, 0.7, n.y + noise(p.xz * 60.0) * 0.4));   // snow on the pines
      inside = albedo * (cool * (0.3 + 0.6 * dif) + warm * lights * (0.6 + 0.8 * gMid));
      if (id > 4.5 && id < 5.5) inside = warm * (1.6 + 1.4 * gMid);                                      // a lit window
    } else {
      vec3 outDir = refract(rr, -normalize(q0 + rr * tOut), 1.33);
      if (dot(outDir, outDir) < 0.01) outDir = reflect(rr, -normalize(q0 + rr * tOut));
      inside = room(outDir) + bokeh(uv * 0.8) * 0.8;
    }
    // the snow: flakes counted along the bent ray, the whole snowfall turning with the water and
    // sinking slowly, each flake drifting a little round its own place
    vec2 cs = vec2(cos(gSwirl), sin(gSwirl));
    mat2 R2 = mat2(cs.x, -cs.y, cs.y, cs.x);
    vec3 rrS = vec3(R2 * rr.xz, rr.y).xzy;
    vec3 flakes = vec3(0.0);
    for (int i = 0; i < 20; i++) {
      float s = (float(i) + 0.5) / 20.0 * tEnd;
      vec3 q = q0 + rr * s;
      vec3 sq = vec3(R2 * q.xz, q.y).xzy;
      sq.y += uTime * 0.03;
      vec3 g = sq * 12.0;
      vec3 cell = floor(g);
      vec3 jit = vec3(hash21(cell.xy + cell.z * 7.1), hash21(cell.yz + 3.3), hash21(cell.zx + 9.7));
      if (jit.x > 0.13 + 0.3 * gLift) continue;                                   // a shake brings more of them up
      vec3 fl = (cell + 0.5 + 0.35 * sin(vec3(uTime * 0.7, uTime * 0.5, uTime * 0.6) * (0.5 + jit) + jit * 20.0)) / 12.0;
      // the beat lifts a ring of snow off the ground
      fl.y += gHit * 0.1 * exp(-uBeatAge * 4.0) * ss(0.25, 0.7, length(fl.xz)) * ss(0.1, -0.35, fl.y);
      if (length(vec3(R2 * fl.xz, fl.y)) > 0.97) continue;
      vec3 rel = fl - sq;
      float dd = length(rel - dot(rel, rrS) * rrS);
      float size = 0.0045 + 0.004 * jit.y;
      float sparkle = 1.0 + gHigh * 3.0 * step(0.75, hash21(cell.xy + floor(uTime * 7.0)));
      flakes += vec3(0.95, 0.97, 1.0) * exp(-dd * dd / (size * size)) * sparkle;
    }
    inside += flakes;
    col = mix(inside * vec3(0.95, 0.98, 1.0), refl, fres);
    // the glass's own highlights: the lamp and the window slide over the curve
    vec3 rf = reflect(rd, N);
    col += vec3(1.0, 0.85, 0.65) * pow(max(dot(rf, normalize(vec3(0.7, 0.45, 0.55))), 0.0), 300.0) * 3.0;
    col += vec3(0.6, 0.75, 1.0) * pow(max(dot(rf, normalize(vec3(-0.8, 0.35, 0.5))), 0.0), 80.0) * 0.6;
    col += vec3(1.0) * pow(1.0 - cosi, 6.0) * 0.12;
  }
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'snowglobe', name: 'Kar Küresi', group: 'Things',
  blurb: 'A snow globe with a little snowed-in Istanbul inside, the Galata Tower over lit houses; the bass shakes the snow and every beat lifts a ring of it',
  tags: ['3d', 'snow', 'winter', 'turkish', 'istanbul', 'glass', 'cozy', 'calm'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
