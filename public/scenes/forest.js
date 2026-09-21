// FOREST — a two-lane road through pines at night, from the driver's seat.
//
// No street lamps here: our headlights are the only light, so the road, the ground fog and the
// nearest trees glow in the beam while everything else is a silhouette against a star field
// with a palette-tinted Milky Way and a moon. Trees are projected pine silhouettes drawn far to
// near; fireflies drift between them. Traffic is rare: an oncoming sedan every few minutes and
// one that overtakes us and disappears ahead — both real ray-marched 3D bodies. Runs on uCruise.
const frag = `
float roadX(float z) { return 9.0 * sin(z * 0.012) + 4.0 * sin(z * 0.031 + 0.7); }
float glow(vec2 d, float size) { return size * size / (dot(d, d) + size * size); }
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
float sdCylX(vec3 p, float r, float hw) {
  vec2 d = vec2(length(p.yz) - r, abs(p.x) - hw);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float fill(float sd) { return 1.0 - ss(0.0, 0.003, sd); }

float gaugeR(vec2 q, float value, float R) {
  float r = length(q) / R;
  float a2 = atan(q.x, q.y);
  float dial = (1.0 - ss(0.0, 0.05, abs(r - 1.0))) * 0.5 * step(abs(a2), 2.5);
  float tk = fract((a2 + 2.356) / 4.712 * 12.0);
  float ticks = (step(0.94, tk) + step(tk, 0.06)) * step(0.8, r) * step(r, 1.0) * step(abs(a2), 2.4) * 0.6;
  float na = -2.356 + clamp(value, 0.0, 1.0) * 4.712;
  vec2 ba = vec2(sin(na), cos(na)) * R * 0.9;
  float h = clamp(dot(q, ba) / dot(ba, ba), 0.0, 1.0);
  float needle = 1.0 - ss(0.0, 0.06, length(q - ba * h) / R);
  return dial + ticks + needle;
}

vec3 toScreen(vec3 rel, float yaw) {
  rel.xz = rot(-yaw) * rel.xz;                 // world → view: undo the camera's heading
  return vec3(rel.xy / max(rel.z, 0.001) * 1.7 + vec2(0.0, 0.05), rel.z);
}

// A pine silhouette in screen space: three stacked triangles over a trunk; q is relative to the base.
float pine(vec2 q, float h, float w) {
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float y0 = h * (0.12 + 0.24 * fi);
    float th = h * (0.55 - 0.1 * fi);
    float tw = w * (1.0 - 0.22 * fi);
    float ly = q.y - y0;
    s = max(s, fill(abs(q.x) - tw * (1.0 - ly / th)) * step(0.0, ly) * step(ly, th));
  }
  return max(s, fill(abs(q.x) - w * 0.08) * step(0.0, q.y) * step(q.y, h * 0.16));
}

vec3 meteor(vec2 p, float n, float age, float aspect) {
  if (age > 1.1) return vec3(0.0);
  float h1 = hash11(n * 3.7 + 0.3), h2 = hash11(n * 5.1 + 0.9), h3 = hash11(n * 7.9 + 0.1);
  vec2 start = vec2((h1 * 2.0 - 1.0) * aspect * 0.9, 0.35 + h2 * 0.6);
  vec2 dir = normalize(vec2(h3 > 0.5 ? 1.0 : -1.0, -0.3 - h2 * 0.5));
  vec2 head = start + dir * age * (1.6 + h1 * 1.4);
  vec2 tail = head - dir * (0.18 + 0.3 * min(age, 0.5));
  float d = sdSeg(p, tail, head);
  float along = clamp(dot(p - tail, dir) / length(head - tail), 0.0, 1.0);
  float fade = (1.0 - ss(0.5, 1.1, age)) * step(0.1, p.y);
  return vec3(0.9, 0.95, 1.0) * ((0.0022 / (d + 0.0018)) * (0.15 + 0.85 * along) + 0.004 / (length(p - head) + 0.004)) * fade;
}

// ── the sedan ──
float wheelsSDF(vec3 q) { return sdCylX(vec3(abs(q.x) - 0.82, q.y - 0.33, abs(q.z) - 1.4), 0.33, 0.16); }
float bodySDF(vec3 q) {
  float body = sdRoundBox(q - vec3(0.0, 0.62, 0.0), vec3(0.85, 0.3, 2.15), 0.14);
  float cabin = sdRoundBox(q - vec3(0.0, 1.05, -0.2), vec3(0.72, 0.3, 1.0), 0.3);
  return smin(body, cabin, 0.3);
}
float carSDF(vec3 q) { return min(bodySDF(q), wheelsSDF(q)); }

void vehicleAt(int slot, float camZ, out vec3 pos, out float ang, out float dir, out float seed, out float fade) {
  if (slot == 0) {
    // one oncoming car every few minutes
    float zrel = (1.0 - fract(0.3 + uCruise * 0.05)) * 900.0 - 10.0;
    float cz = camZ + zrel;
    pos = vec3(roadX(cz) - 1.8, -1.2, cz);
    dir = -1.0; seed = 5.0; fade = 1.0 - ss(260.0, 330.0, zrel);
  } else {
    // one that comes up from behind, passes on the left, pulls back in and disappears ahead
    float zrel = fract(uCruise * 0.012) * 600.0 - 30.0;
    float cz = camZ + zrel;
    pos = vec3(roadX(cz) + mix(-1.6, 1.8, ss(8.0, 40.0, zrel)), -1.2, cz);
    dir = 1.0; seed = 9.0; fade = 1.0 - ss(260.0, 330.0, zrel);
  }
  ang = atan((roadX(pos.z + 2.0) - roadX(pos.z - 2.0)) / 4.0) + (dir < 0.0 ? PI : 0.0);
}

vec3 localToWorld(vec3 q, vec3 pos, float ang) {
  vec3 w = q;
  w.xz = rot(ang) * q.xz;
  return w + pos;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  p.y += 0.002 * uBass * sin(uTime * 41.0) - 0.006 * uBeat * uPunch;
  float camZ = uCruise * 20.0;
  const float CAM_RX = 1.8;
  float yaw = atan((roadX(camZ + 12.0) - roadX(camZ)) / 12.0);
  vec3 cam = vec3(roadX(camZ) + CAM_RX, 0.0, camZ);
  vec3 rd = normalize(vec3(p.x, p.y - 0.05, 1.7));
  rd.xz = rot(yaw) * rd.xz;                     // view → world: look along the road's tangent
  vec3 camFwd = vec3(sin(yaw), 0.0, cos(yaw));
  vec3 moonDir = normalize(vec3(0.35, 0.42, 0.84));
  vec3 headCol = vec3(1.0, 0.93, 0.8);
  vec3 fogCol = vec3(0.006, 0.008, 0.016);

  // ── sky: Milky Way, two layers of stars, the moon, meteors on beats, a far tree line ──
  float az = atan(rd.x, rd.z);
  vec3 col = mix(vec3(0.02, 0.03, 0.07), vec3(0.003, 0.004, 0.012), ss(0.0, 0.6, rd.y));
  float mwd = dot(rd, normalize(vec3(0.6, 0.55, -0.4)));
  float band = exp(-mwd * mwd * 9.0);
  float neb = fbm(vec2(az * 2.5, rd.y * 3.0));
  col += pal(0.62) * band * (0.08 + 0.18 * ss(0.4, 0.75, neb)) * (0.6 + uMid * 0.6) * step(0.0, rd.y);
  for (int L = 0; L < 2; L++) {
    float sc = L == 0 ? 90.0 : 200.0;
    vec2 g = vec2(az * sc, rd.y * sc * 2.2);
    vec2 c = floor(g);
    float h = hash21(c + float(L) * 7.7);
    vec2 f = fract(g) - 0.5 - (vec2(hash21(c + 1.3), hash21(c + 2.9)) - 0.5) * 0.8;
    float thr = L == 0 ? 0.9 : 0.94 - band * 0.06;
    float tw = 0.6 + 0.4 * sin(uTime * (1.5 + h * 3.0) + h * 60.0);
    col += vec3(0.85, 0.9, 1.0) * step(thr, h) * (L == 0 ? 0.0016 : 0.0006) / (dot(f, f) + (L == 0 ? 0.0025 : 0.0012)) * tw * (0.6 + uHigh * 0.9) * step(0.005, rd.y);
  }
  float md = max(dot(rd, moonDir), 0.0);
  col += vec3(0.9, 0.93, 1.0) * (pow(md, 3000.0) * 3.0 + pow(md, 25.0) * 0.12 + pow(md, 4.0) * 0.03);
  col += meteor(p, uBeatCount, uBeatAge, aspect);
  float treeline = 0.025 + 0.05 * (noise(vec2(az * 30.0, 1.0)) * 0.7 + noise(vec2(az * 95.0, 3.0)) * 0.3);
  col = mix(col, vec3(0.004, 0.006, 0.006), step(rd.y, treeline) * step(-0.001, rd.y));

  // ── road ──
  bool ground = rd.y < -0.0005;
  float t = 0.0;
  vec3 w = vec3(0.0);
  if (ground) {
    t = -1.2 / rd.y;
    w = cam + rd * t;
    float rx = w.x - roadX(w.z);
    float ax = abs(rx);
    float grain = noise(vec2(rx * 4.0, w.z * 0.7)) * 0.5 + noise(vec2(rx * 15.0, w.z * 3.0)) * 0.25;
    vec3 asphalt = vec3(0.05, 0.05, 0.052) * (0.7 + 0.6 * grain);
    vec3 gravel = vec3(0.07, 0.065, 0.05) * (0.6 + 0.8 * grain);
    vec3 grass = vec3(0.03, 0.05, 0.025) * (0.5 + noise(vec2(rx * 2.0, w.z * 2.0)));
    vec3 g = mix(mix(grass, gravel, 1.0 - ss(4.6, 5.2, ax)), asphalt, 1.0 - ss(3.5, 3.8, ax));
    float lw = 0.06 + t * 0.0025;
    g += vec3(0.85, 0.8, 0.6) * (1.0 - ss(lw, lw + 0.05, ax)) * step(0.5, fract(w.z / 6.0)) * 0.5;
    g += vec3(0.85) * (1.0 - ss(lw, lw + 0.05, abs(ax - 3.3))) * 0.25;
    float hx = (rx - CAM_RX) / 3.0;
    float head = exp(-hx * hx) * exp(-(w.z - camZ) / 38.0);              // our headlights: the only light out here
    g *= 1.0 + head * 4.0 * headCol;
    g += vec3(0.02, 0.025, 0.04) * 0.5;                                   // moonlight
    float post = step(0.96, fract(w.z / 12.0)) * (1.0 - ss(0.0, 0.25, abs(ax - 4.0)));
    g += vec3(1.0, 0.85, 0.5) * post * head * 3.0;                        // roadside reflectors
    float fogW = ss(0.5, 0.85, fbm(vec2(w.x * 0.12, w.z * 0.07 - uTime * 0.25)));
    g += vec3(0.8, 0.85, 0.9) * fogW * head * 0.5 * (0.5 + uMid);         // ground fog caught in the beam
    col = mix(g, fogCol, 1.0 - exp(-t * 0.012));
  }

  // ── trees, far to near ──
  const float SP = 7.0;
  float kT = floor(camZ / SP);
  for (int i = 24; i >= -1; i--) {
    for (int sd = 0; sd < 2; sd++) {
      float side = sd == 0 ? -1.0 : 1.0;
      float idx = kT + float(i);
      float h1 = hash11(idx * 1.7 + side * 3.3), h2 = hash11(idx * 2.9 + side * 5.1), h3 = hash11(idx * 4.3 + side * 7.9);
      float tz = idx * SP + h1 * SP * 0.8;
      float H = 6.0 + h3 * 8.0;
      float W = H * 0.32;
      vec3 basePos = vec3(roadX(tz) + side * (6.0 + h2 * 16.0), -1.2, tz);
      vec3 sb = toScreen(basePos - cam, yaw);
      if (sb.z < 0.8 || sb.z > 200.0) continue;
      float k = 1.7 / sb.z;
      vec2 q = p - sb.xy;
      if (abs(q.x) > W * k || q.y < 0.0 || q.y > H * k) continue;
      float shape = pine(q, H * k, W * k);
      if (shape <= 0.0) continue;
      vec3 toTree = normalize(basePos + vec3(0.0, H * 0.4, 0.0) - cam);
      float beam = pow(max(dot(toTree, camFwd), 0.0), 10.0) * exp(-sb.z / 26.0);
      float vert = q.y / (H * k);
      // needle texture in tree-local coordinates, so it stays put on the tree as we pass
      float speck = 0.45 + 0.55 * noise(vec2(q.x / (W * k) * 7.0, vert * 14.0) + idx * 3.0 + side);
      vec3 lit = vec3(0.16, 0.3, 0.1) * beam * 2.6 * (1.0 - vert) * (1.0 - vert) * speck + vec3(0.012, 0.02, 0.03) * (0.5 + 0.5 * vert);
      float trunk = step(q.y, H * k * 0.16) * step(abs(q.x), W * k * 0.09);
      lit = mix(lit, vec3(0.3, 0.2, 0.12) * beam * 4.0 + vec3(0.01), trunk);
      col = mix(col, mix(lit, fogCol, 1.0 - exp(-sb.z * 0.012)), shape);
    }
  }

  // ── fireflies between the trees ──
  for (int i = 0; i < 20; i++) {
    float fi = float(i);
    float cell = floor(camZ / 90.0) + (i < 10 ? 0.0 : 1.0);
    float h1 = hash11(fi * 3.1 + cell * 0.7), h2 = hash11(fi * 5.7 + cell * 1.3), h3 = hash11(fi * 7.3 + cell * 2.9);
    float fz = cell * 90.0 + h1 * 90.0;
    vec3 fw = vec3(roadX(fz) + (h2 > 0.5 ? 1.0 : -1.0) * (5.0 + h3 * 9.0) + 0.5 * sin(uTime * 0.7 + fi), -0.6 + h2 * 1.8 + 0.3 * sin(uTime * 0.9 + fi * 2.0), fz);
    vec3 s = toScreen(fw - cam, yaw);
    if (s.z < 1.0 || s.z > 120.0) continue;
    float blink = pow(0.5 + 0.5 * sin(uTime * 1.7 + fi * 3.0), 6.0);
    col += vec3(0.7, 1.0, 0.3) * glow(p - s.xy, clamp(0.06 / s.z, 0.002, 0.01)) * blink * (0.5 + uHigh) * (1.0 - ss(80.0, 120.0, s.z));
  }

  // ── the two cars, ray-marched ──
  float vT = 1e9;
  int vSlot = -1;
  vec3 vLocal = vec3(0.0), vPos = vec3(0.0);
  float vAng = 0.0, vSeed = 0.0, vFade = 1.0;
  for (int i = 0; i < 2; i++) {
    vec3 pos;
    float ang, dir, seed, fade;
    vehicleAt(i, camZ, pos, ang, dir, seed, fade);
    vec3 oc = cam - (pos + vec3(0.0, 0.7, 0.0));
    float b = dot(oc, rd);
    float disc = b * b - (dot(oc, oc) - 6.76);
    if (disc < 0.0) continue;
    float sq = sqrt(disc);
    float t0 = max(-b - sq, 0.05), t1 = -b + sq;
    if (t1 < 0.05) continue;
    vec3 lo = cam - pos;
    lo.xz = rot(-ang) * lo.xz;
    vec3 ld = rd;
    ld.xz = rot(-ang) * ld.xz;
    float tt = t0;
    for (int s = 0; s < 36; s++) {
      vec3 q = lo + ld * tt;
      float d = carSDF(q);
      if (d < max(0.01, 0.003 * tt)) {
        if (tt < vT) { vT = tt; vSlot = i; vLocal = q; vPos = pos; vAng = ang; vSeed = seed; vFade = fade; }
        break;
      }
      tt += d * 0.9;
      if (tt > t1) break;
    }
  }
  if (vSlot >= 0) {
    vec3 q = vLocal;
    vec2 e = vec2(0.012, 0.0);
    vec3 n = normalize(vec3(carSDF(q + e.xyy) - carSDF(q - e.xyy), carSDF(q + e.yxy) - carSDF(q - e.yxy), carSDF(q + e.yyx) - carSDF(q - e.yyx)));
    vec3 nw = n;
    nw.xz = rot(vAng) * nw.xz;
    vec3 wp = cam + rd * vT;
    bool isWheel = wheelsSDF(q) < bodySDF(q);
    float h = hash11(vSeed);
    vec3 paint = h < 0.3 ? vec3(0.85) : (h < 0.6 ? vec3(0.05, 0.07, 0.16) : vec3(0.4, 0.03, 0.04));
    bool glass = q.y > 0.9 && !isWheel;
    if (glass) paint = vec3(0.02, 0.025, 0.035);
    if (isWheel) paint = mix(vec3(0.02), vec3(0.3), 1.0 - ss(0.16, 0.21, length(vec2(q.y - 0.33, abs(q.z) - 1.4))));
    vec3 toCam = normalize(cam - wp);
    float beam = pow(max(dot(-toCam, camFwd), 0.0), 8.0);
    float headL = max(dot(nw, toCam), 0.0) * beam * 3.2 * exp(-vT / 30.0);
    float spec = pow(max(dot(nw, toCam), 0.0), glass ? 120.0 : 50.0) * (glass ? 1.2 : 0.5) * beam * exp(-vT / 40.0);
    vec3 shade = paint * (headCol * headL + vec3(0.03, 0.035, 0.05) * (0.5 + 0.5 * nw.y)) + vec3(spec);
    vec3 emis = vec3(0.0);
    float brake = 0.5 + 0.9 * uBeat * uPunch;
    float rear = step(q.z, -2.0), front = step(2.0, q.z);
    float lamp = 1.0 - ss(0.12, 0.2, length(vec2(abs(q.x) - 0.58, q.y - 0.68)));
    emis += vec3(1.0, 0.1, 0.06) * lamp * rear * brake * 3.0 + vec3(1.0, 0.97, 0.88) * lamp * front * 6.0;
    emis += vec3(0.8) * (1.0 - ss(0.1, 0.16, length(vec2(q.x, q.y - 0.5)))) * rear * 0.6;
    emis += vec3(1.0, 0.1, 0.06) * (1.0 - ss(0.25, 0.32, abs(q.x))) * (1.0 - ss(0.03, 0.06, abs(q.y - 1.3))) * step(q.z, -1.3) * brake * 2.0;
    col = mix(col, mix(shade + emis, fogCol, 1.0 - exp(-vT * 0.012)), vFade);
  }
  for (int i = 0; i < 2; i++) {
    vec3 pos;
    float ang, dir, seed, fade;
    vehicleAt(i, camZ, pos, ang, dir, seed, fade);
    vec3 lc = dir > 0.0 ? vec3(1.0, 0.12, 0.08) * (0.55 + 0.9 * uBeat * uPunch) : vec3(1.0, 0.97, 0.88) * 1.6;
    for (int e = 0; e < 2; e++) {
      vec3 lw = localToWorld(vec3((float(e) * 2.0 - 1.0) * 0.58, 0.68, -dir * 2.15), pos, ang);
      vec3 s = toScreen(lw - cam, yaw);
      if (s.z < 0.5 || s.z > vT + 0.5) continue;
      col += lc * glow(p - s.xy, clamp(0.7 / s.z, 0.003, 0.06)) * fade;
      // oncoming headlights throw light onto the trees and the road ahead of them
      if (dir < 0.0 && ground) col += vec3(1.0, 0.95, 0.85) * exp(-length(w.xz - lw.xz) * 0.15) * 0.25 * fade * ss(0.0, 1.0, dot(normalize(w - lw), vec3(-sin(ang), 0.0, -cos(ang))) * -1.0);
    }
  }

  // ── the car we sit in ──
  vec3 interior = vec3(0.012, 0.011, 0.014);
  float xe = aspect * (0.97 - 0.10 * (p.y + 0.6));
  col = mix(col, interior, ss(xe, xe + 0.02, abs(p.x)));
  col = mix(col, interior, ss(0.84, 0.88, p.y));
  vec2 mq = abs(p - vec2(0.0, 0.74)) - vec2(0.15, 0.045);
  float mEdge = max(mq.x, mq.y);
  col = mix(col, vec3(0.03), 1.0 - ss(0.0, 0.012, abs(mEdge)));
  col = mix(col, vec3(0.01, 0.01, 0.015), 1.0 - ss(-0.006, 0.0, mEdge));

  float dashY = -0.46 + 0.05 * cos(p.x * 1.6);
  float dash = ss(-0.006, 0.006, dashY - p.y);
  vec3 dashLight = vec3(1.0, 0.62, 0.25) * 0.75 + pal(0.5) * 0.2;
  vec3 dashCol = vec3(0.016, 0.015, 0.018) + dashLight * 0.04 * (1.0 - ss(0.0, 0.02, abs(p.y - dashY)));
  float speedV = clamp((uCruiseRate - 0.4) / 1.2, 0.0, 1.0) + uBeat * 0.05 * uPunch;
  dashCol += dashLight * gaugeR(p - vec2(-0.95, dashY - 0.26), speedV, 0.17) * 0.9;
  dashCol += dashLight * gaugeR(p - vec2(-0.55, dashY - 0.27), uLevel, 0.12) * 0.8;
  vec2 sp = vec2((p.x - 0.02) / 0.6, (p.y - (dashY - 0.33)) / 0.2);
  float inS = step(0.0, sp.x) * step(sp.x, 1.0) * step(0.0, sp.y) * step(sp.y, 1.0);
  float cell = floor(sp.x * 20.0);
  float fx = fract(sp.x * 20.0);
  float on = step(sp.y, spec((cell + 0.5) / 20.0 * 0.9)) * step(0.2, fx) * step(fx, 0.8) * step(0.15, fract(sp.y * 10.0)) * inS;
  dashCol += dashLight * on * 0.9 + dashLight * 0.02 * inS;
  vec2 wq = rot(yaw * 2.5) * (p - vec2(-0.95, -1.30));
  float rim = 1.0 - ss(0.0, 0.012, abs(length(wq) - 0.62) - 0.03);
  float spoke = (1.0 - ss(0.0, 0.01, abs(wq.x) - 0.03)) * step(0.0, wq.y) * step(wq.y, 0.62);
  dashCol = mix(dashCol, vec3(0.03, 0.028, 0.03) + dashLight * 0.02, max(rim, spoke));
  col = mix(col, dashCol, dash);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'forest',
  name: 'Forest',
  group: 'Journey',
  blurb: 'Headlights on a pine road under the Milky Way, fireflies and ground fog',
  tags: ['vehicle', 'nature', 'night', 'calm'],
  energy: 0.25,
  particles: 0,
  trails: 0.25,
  zoom: 1,
  spin: 0,
  frag,
};
