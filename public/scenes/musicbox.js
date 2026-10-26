import { SCULPT } from '../js/gfx/scene-kit.js';

// MÜZİK KUTUSU — looking down into an open music box: a brass cylinder studded with steel pins
// turning against a steel comb, the long bass teeth on the left weighted with lead underneath,
// the short treble teeth on the right; behind them the spring barrel with its great wheel and the
// fan of the governor that keeps the tune steady, all screwed down to a brass bed plate in a box
// lined with red velvet.
//
// Everything is solid geometry, marched; the cylinder's pins and the comb's teeth are repeated
// domains, so there are hundreds of them for the price of one. Metal is only as good as what it
// reflects, so the box has a lighting rig: a big soft panel overhead that the flat teeth mirror, a
// warm key from the left that the brass mirrors and that throws the shadows, and a cool strip.
//
// Music: the comb is the spectrum, one tooth per slice from the bass on the left to the highs on
// the right, each tooth shivering and catching the light as hard as its slice is loud; the bass
// winds the cylinder and the governor faster; the highs glint along the polished teeth; on the
// beat a row of pins plucks the teeth it passes with a spark.
const frag = `${SCULPT}
const float CYL_R = 0.55, CYL_H = 1.62;
const int TEETH = 28;
const float PITCH = 0.1157;           // the comb's tooth pitch (2 * CYL_H / TEETH)
const float SLOTS = 36.0;             // pin positions round the cylinder
const float COMB_Y = 0.5, TIP_Z = 0.28;   // the tips sit just above the cylinder, in the pins' reach

float gAngle, gFan;

float boxR(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float cylX(vec3 p, float r, float h) { vec2 d = vec2(length(p.yz) - r, abs(p.x) - h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
float cylY(vec3 p, float r, float h) { vec2 d = vec2(length(p.xz) - r, abs(p.y) - h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
float toothLen(float i) { return mix(1.38, 0.72, i / float(TEETH - 1)); }
// how hard a tooth rings: its slice of the music, and a ping when the beat's pins pass it
float pluckOf(float i) { return gHit * step(0.55, hash11(i * 3.7 + floor(uBeatCount))) * exp(-uBeatAge * 7.0); }
float ring(float i) { return clamp(band(0.02 + 0.78 * i / float(TEETH - 1)) + pluckOf(i), 0.0, 1.0); }
float bend(float i, float z) {
  float L = toothLen(i);
  float along = clamp((TIP_Z + L - z) / L, 0.0, 1.0);                   // 0 at the root, 1 at the tip
  float w = 40.0 + 70.0 * i / float(TEETH - 1);                          // shorter teeth ring faster
  return ring(i) * 0.018 * sin(uTime * w + i * 1.9) * along * along;
}
// a slotted screw head standing on a surface facing up
float screw(vec3 p) { return max(cylY(p, 0.05, 0.018), -boxR(p - vec3(0.0, 0.02, 0.0), vec3(0.052, 0.012, 0.008), 0.0)); }

// the scene: x = distance, y = what it is (1 brass, 2 steel pin, 3 tooth, 4 comb base, 5 lead,
// 6 bed plate, 7 wood, 8 velvet, 9 polished steel parts)
vec2 world(vec3 p) {
  // the cylinder and its pins, in the cylinder's turning frame
  vec2 d = vec2(cylX(p, CYL_R, CYL_H), 1.0);
  vec2 yz = rot(gAngle) * p.yz;
  float th = atan(yz.y, yz.x);
  float slot = floor(th / TAU * SLOTS + 0.5);
  float col = clamp(floor((p.x + CYL_H) / PITCH), 0.0, float(TEETH - 1));
  // the pins: the tune itself, so a little pattern in it (runs going up and down the comb)
  float melody = step(0.72, fract(sin(col * 0.37 + slot * 1.13) * 3.7 + hash21(vec2(col, mod(slot, SLOTS))) * 0.7));
  if (melody > 0.5 && abs(p.x) < CYL_H && length(p.yz) < CYL_R + 0.1) {
    float a = slot / SLOTS * TAU;
    vec2 dir = vec2(cos(a), sin(a));
    vec2 q2 = yz - dir * (CYL_R + 0.022);
    vec3 q = vec3(p.x - (-CYL_H + (col + 0.5) * PITCH), dot(q2, dir), dot(q2, vec2(-dir.y, dir.x)));
    d = nearer(d, vec2(max(length(q.xz) - 0.011, abs(q.y) - 0.026), 2.0));
  }
  // the cylinder's arbor and its end bearings
  d = nearer(d, vec2(cylX(p, 0.07, CYL_H + 0.3), 9.0));
  d = nearer(d, vec2(boxR(vec3(abs(p.x) - CYL_H - 0.24, p.y + 0.31, p.z), vec3(0.05, 0.42, 0.16), 0.02), 1.0));
  // the comb: one tooth per column, all their tips in a line by the pins, roots stepping back
  float i = clamp(floor((p.x + CYL_H) / PITCH), 0.0, float(TEETH - 1));
  float L = toothLen(i);
  vec3 tq = p - vec3(-CYL_H + (i + 0.5) * PITCH, COMB_Y + bend(i, p.z), TIP_Z + L * 0.5);
  d = nearer(d, vec2(boxR(tq, vec3(PITCH * 0.36, 0.016, L * 0.5), 0.008), 3.0));
  // lead weights soldered under the longest teeth, to tune them low
  if (i < 9.0) {
    vec3 wq = p - vec3(-CYL_H + (i + 0.5) * PITCH, COMB_Y - 0.05 + bend(i, TIP_Z + L * 0.6), TIP_Z + L * 0.62);
    d = nearer(d, vec2(boxR(wq, vec3(PITCH * 0.32, 0.035, 0.1 + 0.08 * (1.0 - i / 9.0)), 0.02), 5.0));
  }
  // the comb's base, a steel bar whose front follows the roots, screwed down at both ends
  float rootZ = TIP_Z + mix(1.38, 0.72, clamp((p.x + CYL_H) / (2.0 * CYL_H), 0.0, 1.0));
  float base = max(boxR(p - vec3(0.0, COMB_Y - 0.03, rootZ + 0.2), vec3(CYL_H + 0.1, 0.075, 0.2), 0.015), abs(p.x) - CYL_H - 0.1);
  d = nearer(d, vec2(base, 4.0));
  vec3 sp = vec3(abs(p.x) - CYL_H + 0.02, p.y - COMB_Y - 0.06, p.z - mix(1.66, 1.0, step(0.0, p.x)) - 0.2);
  d = nearer(d, vec2(screw(sp), 9.0));
  // the spring barrel behind on the left: a drum with a great toothed wheel on its end
  vec3 bp = p - vec3(-1.05, 0.0, -1.05);
  float drum = cylX(bp, 0.4, 0.3);
  float wa = atan(bp.y, bp.z), wr = length(bp.yz);
  float teeth = wr - 0.5 - 0.022 * ss(0.3, 0.0, abs(fract(wa / TAU * 64.0 + gAngle * 0.4) - 0.5) - 0.18);
  float wheel = max(teeth, abs(bp.x - 0.33) - 0.025);
  wheel = max(wheel, -max(wr - 0.36, abs(bp.x - 0.33) - 0.05) + 0.0 * (abs(sin(wa * 3.0)) - 2.0));
  d = nearer(d, vec2(min(drum, wheel), 1.0));
  // the governor on the right: a worm shaft standing up and its fan spinning on top
  vec3 gp = p - vec3(1.25, 0.0, -0.95);
  d = nearer(d, vec2(cylY(gp, 0.035, 0.62), 9.0));
  vec3 fp = gp - vec3(0.0, 0.66, 0.0);
  fp.xz = rot(gFan) * fp.xz;
  d = nearer(d, vec2(boxR(fp, vec3(0.3, 0.004, 0.055), 0.003), 1.0));
  d = nearer(d, vec2(boxR(fp - vec3(0.0, -0.04, 0.0), vec3(0.06, 0.04, 0.06), 0.02), 1.0));
  // the bed plate, screwed to the box, the box's wooden walls, the velvet floor of its lid space
  d = nearer(d, vec2(max(p.y + 0.72, max(abs(p.x) - 2.16, abs(p.z - 0.55) - 2.31)), 6.0));
  vec3 s2 = vec3(abs(p.x) - 1.9, p.y + 0.7, abs(p.z + 0.4) - 1.25);
  d = nearer(d, vec2(screw(s2), 9.0));
  // the box itself: low walls of polished wood standing a little above the comb, its back wall
  // lined with velvet, sitting on a dark table
  float outer = boxR(p - vec3(0.0, -0.06, 0.55), vec3(2.3, 0.8, 2.45), 0.06);
  float inner = boxR(p - vec3(0.0, 0.3, 0.55), vec3(2.15, 1.2, 2.3), 0.02);
  float walls = max(outer, -inner);
  d = nearer(d, vec2(walls, p.z < -1.7 && p.y < 0.72 && abs(p.x) < 2.14 ? 8.0 : 7.0));
  d = nearer(d, vec2(p.y + 0.9, 10.0));
  return d;
}
vec3 normalAt(vec3 p, float t) {
  vec2 e = vec2(0.0006 + t * 0.0002, -0.0006 - t * 0.0002);
  return normalize(e.xyy * world(p + e.xyy).x + e.yyx * world(p + e.yyx).x + e.yxy * world(p + e.yxy).x + e.xxx * world(p + e.xxx).x);
}

// the lighting rig, as the metal sees it reflected
vec3 rig(vec3 r) {
  vec3 c = mix(vec3(0.02, 0.014, 0.012), vec3(0.06, 0.04, 0.032), r.y * 0.5 + 0.5);
  // the big soft panel overhead and beyond the cylinder: what the comb's flat teeth mirror
  vec3 over = normalize(vec3(-0.1, 0.72, -0.69));
  vec2 oq = vec2(dot(r, vec3(1, 0, 0)), dot(r, normalize(cross(over, vec3(1, 0, 0)))));
  c += vec3(1.0, 0.94, 0.84) * ss(0.86, 0.93, dot(r, over)) * ss(0.55, 0.42, abs(oq.x)) * 1.0;
  // the warm key's softbox on the left
  c += vec3(1.0, 0.78, 0.5) * ss(0.88, 0.95, dot(r, normalize(vec3(-0.6, 0.75, 0.25)))) * 2.2;
  // a cool strip low on the right
  c += vec3(0.5, 0.66, 1.0) * ss(0.95, 0.985, dot(normalize(vec3(r.x, r.y * 0.3, r.z)), normalize(vec3(0.95, 0.05, -0.2)))) * 0.9;
  return c;
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gAngle = uTime * 0.12 + uTravel * 0.06 * uAudioActive;
  gFan = uTime * 2.4 + uTravel * 2.0 * uAudioActive;

  // above the open box on the comb's side, looking down across the teeth to the cylinder
  vec3 ro = vec3(-2.05 + sin(uTime * 0.04) * 0.15, 2.45, 3.25);
  vec3 rd = viewRay(ro, vec3(0.15, 0.02, -0.05), uv, 2.05);

  float t = 0.0;
  vec2 hit = vec2(1.0, 0.0);
  bool found = false;
  for (int k = 0; k < 100; k++) {
    hit = world(ro + rd * t);
    if (hit.x < 0.0006 * (1.0 + t)) { found = true; break; }
    t += hit.x * 0.78;
    if (t > 12.0) break;
  }
  vec3 col = vec3(0.02, 0.01, 0.01);
  if (found) {
    vec3 p = ro + rd * t, n = normalAt(p, t);
    float id = hit.y;
    vec3 albedo; float rough, metal;
    if (id < 1.5) {                                                         // brass, turned on a lathe
      float lines = 0.5 + 0.5 * sin(p.x * 260.0 + p.z * 3.0);
      albedo = vec3(0.92, 0.7, 0.36) * (0.93 + 0.07 * lines); rough = 0.26 + 0.05 * lines; metal = 1.0;
    } else if (id < 2.5) { albedo = vec3(0.82, 0.83, 0.86); rough = 0.2; metal = 1.0; }                // steel pins
    else if (id < 3.5) { albedo = vec3(0.84, 0.86, 0.9); rough = 0.1 + 0.03 * sin(p.z * 60.0); metal = 1.0; }  // the teeth
    else if (id < 4.5) { albedo = vec3(0.66, 0.68, 0.72) * (0.92 + 0.08 * sin(p.x * 140.0)); rough = 0.3; metal = 1.0; }   // the comb base, brushed                  // the comb base, ground
    else if (id < 5.5) { albedo = vec3(0.44, 0.45, 0.49); rough = 0.5; metal = 0.8; }                  // lead
    else if (id < 6.5) { albedo = vec3(0.86, 0.64, 0.32) * (0.82 + 0.18 * fbm(p.xz * 2.5)); rough = 0.42; metal = 1.0; }   // the bed plate
    else if (id < 7.5) { albedo = vec3(0.24, 0.1, 0.05) * (0.7 + 0.3 * noise(vec2(p.z * 2.0, p.y * 30.0))); rough = 0.45; metal = 0.0; }  // wood
    else if (id < 8.5) { albedo = vec3(0.17, 0.02, 0.025) * (0.8 + 0.2 * noise(p.xy * 50.0)); rough = 0.95; metal = 0.0; }  // velvet
    else if (id < 9.5) { albedo = vec3(0.86, 0.87, 0.9); rough = 0.16; metal = 1.0; }               // screws, arbor, shaft
    else { albedo = vec3(0.03, 0.018, 0.014) * (0.8 + 0.2 * noise(p.xz * 3.0)); rough = 0.5; metal = 0.0; }   // the dark table
    vec3 v = -rd;
    vec3 key = normalize(vec3(-0.6, 0.75, 0.25));
    float sh = 1.0, st = 0.01;
    for (int j = 0; j < 14; j++) {
      float h = world(p + n * 0.002 + key * st).x;
      sh = min(sh, 12.0 * h / st);
      st += clamp(h, 0.015, 0.22);
      if (sh < 0.01 || st > 2.5) break;
    }
    sh = clamp(sh, 0.0, 1.0);
    float ao = 1.0;
    for (int j = 1; j <= 2; j++) { float hh = float(j) * 0.045; ao -= max(0.0, hh - world(p + n * hh).x) * (1.5 / float(j)); }
    ao = clamp(ao, 0.25, 1.0);
    vec3 h = normalize(key + v);
    float nl = max(dot(n, key), 0.0), nv = max(dot(n, v), 0.001), nh = max(dot(n, h), 0.0);
    float a2 = pow(max(rough * rough, 0.01), 2.0);
    float D = a2 / (PI * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
    vec3 F0 = mix(vec3(0.04), albedo, metal);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - nv, 5.0);
    col = (albedo * (1.0 - metal) * nl + F * D * 0.25 / max(nv, 0.05) * nl) * vec3(1.0, 0.84, 0.64) * 2.0 * sh;
    vec3 r = reflect(rd, n);
    vec3 env = mix(rig(r), rig(normalize(n * 1.4 + r)) * 0.55, rough);
    col += env * F * mix(0.3, 1.0, metal) * ao;
    col += albedo * (1.0 - metal) * vec3(0.09, 0.05, 0.04) * ao;
    if (id > 2.5 && id < 3.5) {
      float ti = clamp(floor((p.x + CYL_H) / PITCH), 0.0, float(TEETH - 1));
      float L = toothLen(ti), along = clamp((TIP_Z + L - p.z) / L, 0.0, 1.0);
      // a ringing tooth shivers and the light runs up and down it, harder the louder its slice
      float shiver = 0.5 + 0.5 * sin(uTime * (90.0 + ti * 7.0) + ti + along * 6.0);
      col += vec3(1.0, 0.82, 0.55) * ring(ti) * (0.3 + 0.7 * shiver) * (0.3 + 0.7 * along) * 1.5;
      col += vec3(1.0, 0.95, 0.85) * gHigh * pow(max(dot(r, key), 0.0), 60.0) * 2.0 * sh;
      // the beat: a spark where a pin lets go of the tip
      col += vec3(1.0, 0.85, 0.55) * pluckOf(ti) * exp(-pow((p.z - TIP_Z) * 16.0, 2.0)) * 3.0;
    }
    col *= ao;
    col = mix(col, vec3(0.012, 0.006, 0.005), ss(3.6, 8.0, t));
  }
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'musicbox', name: 'Müzik Kutusu', group: 'Things',
  blurb: 'Inside a music box: a pinned brass cylinder turns against a steel comb whose every tooth rings with its own band, bass on the left, highs on the right',
  tags: ['3d', 'music box', 'brass', 'mechanical', 'macro', 'warm', 'spectrum'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
