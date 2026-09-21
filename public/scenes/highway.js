// HIGHWAY — a long night drive, seen from the driver's seat.
//
// Motion runs on uCruise (eased) rather than uTravel, so the car glides with the energy of the
// track instead of lurching on every kick. The road is a plane curving through roadX(z); the
// camera follows it and yaws with the tangent. Lamp poles, guard rails, cat's eyes and gantry
// signs are projected geometry. Traffic is real 3D: every vehicle is a signed-distance model
// (sedan, truck with trailer, bus, motorbike) ray-marched inside its bounding sphere, lit by our
// own headlights, the street lamps overhead and the sky, with emissive tail/head/marker lights
// on its surfaces. Sedans tap their brake lights to the beat. The dashboard reads the music.
const frag = `
float roadX(float z) { return 7.0 * sin(z * 0.009) + 3.0 * sin(z * 0.021 + 1.3); }
float glow(vec2 d, float size) { return size * size / (dot(d, d) + size * size); }
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
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

// Projects a point relative to the car into screen space; .z keeps the depth.
vec3 toScreen(vec3 rel, float yaw) {
  rel.xz = rot(-yaw) * rel.xz;                 // world → view: undo the camera's heading
  return vec3(rel.xy / max(rel.z, 0.001) * 1.7 + vec2(0.0, 0.05), rel.z);
}

// A stretched reflection in the wet asphalt, under a light at screen position sr.
float wet(vec2 p, vec2 sr, float w) {
  float dx = p.x - sr.x;
  return exp(-dx * dx / w) * exp(-abs(p.y - sr.y) * 10.0);
}

// ── vehicles ──────────────────────────────────────────────────────────────
// Local space: origin under the vehicle on the road, +z is its direction of travel, y up.
float wheelsSDF(vec3 q, float type) {
  if (type < 1.0) return sdCylX(vec3(abs(q.x) - 0.82, q.y - 0.33, abs(q.z) - 1.4), 0.33, 0.16);
  if (type < 2.0) return sdCylX(vec3(abs(q.x) - 1.05, q.y - 0.5, abs(abs(q.z) - 1.9) - 1.3), 0.5, 0.25);
  if (type < 3.0) return sdCylX(vec3(abs(q.x) - 1.05, q.y - 0.5, abs(q.z) - 3.4), 0.5, 0.25);
  return sdCylX(vec3(q.x, q.y - 0.33, abs(q.z) - 0.75), 0.33, 0.07);
}
float bodySDF(vec3 q, float type) {
  if (type < 1.0) {
    float body = sdRoundBox(q - vec3(0.0, 0.62, 0.0), vec3(0.85, 0.3, 2.15), 0.14);
    float cabin = sdRoundBox(q - vec3(0.0, 1.05, -0.2), vec3(0.72, 0.3, 1.0), 0.3);
    return smin(body, cabin, 0.3);
  }
  if (type < 2.0) {
    float cab = sdRoundBox(q - vec3(0.0, 1.5, 2.5), vec3(1.2, 1.3, 1.0), 0.25);
    float trailer = sdRoundBox(q - vec3(0.0, 2.1, -1.4), vec3(1.25, 1.7, 3.5), 0.15);
    return min(cab, trailer);
  }
  if (type < 3.0) return sdRoundBox(q - vec3(0.0, 1.8, 0.0), vec3(1.25, 1.5, 5.4), 0.35);
  float bike = sdRoundBox(q - vec3(0.0, 0.7, 0.0), vec3(0.2, 0.22, 0.85), 0.15);
  float rider = sdRoundBox(q - vec3(0.0, 1.25, -0.1), vec3(0.22, 0.4, 0.3), 0.2);
  return min(bike, rider);
}
float carSDF(vec3 q, float type) { return min(bodySDF(q, type), wheelsSDF(q, type)); }

// The 13 vehicles around us: 8 oncoming, 3 overtaking us, 2 that we follow.
void vehicleAt(int slot, float camZ, out vec3 pos, out float ang, out float type, out float dir, out float seed, out float fade) {
  if (slot < 8) {
    float fi = float(slot);
    float h = hash11(fi * 7.3 + 1.0), h2 = hash11(fi * 2.9 + 4.0);
    type = h2 < 0.55 ? 0.0 : (h2 < 0.78 ? 1.0 : (h2 < 0.9 ? 2.0 : 3.0));
    float speed = type == 1.0 ? 0.09 : 0.12 + hash11(fi + 0.5) * 0.04;
    float zrel = (1.0 - fract(h + uCruise * speed)) * 330.0 - 8.0;
    float cz = camZ + zrel;
    float lane = (type == 1.0 || h > 0.5) ? -5.4 : -1.8;
    pos = vec3(roadX(cz) + lane, -1.2, cz);
    dir = -1.0; seed = fi + 11.0; fade = 1.0 - ss(250.0, 322.0, zrel);
  } else if (slot < 11) {
    float fi = float(slot - 8);
    float h = hash11(fi * 3.9 + 2.0);
    type = hash11(fi * 5.1 + 3.0) > 0.8 ? 2.0 : 0.0;
    float zrel = fract(h + uCruise * 0.045 * (1.0 + hash11(fi + 9.0) * 0.5)) * 300.0 - 14.0;   // starts behind us
    float cz = camZ + zrel;
    pos = vec3(roadX(cz) + 1.8, -1.2, cz);
    dir = 1.0; seed = fi + 23.0; fade = 1.0 - ss(220.0, 286.0, zrel);
  } else if (slot == 11) {
    float cz = camZ + 46.0 + 5.0 * sin(uCruise * 0.35);
    pos = vec3(roadX(cz) + 5.4, -1.2, cz); type = 0.0; dir = 1.0; seed = 31.0; fade = 1.0;
  } else {
    float cz = camZ + 105.0 + 8.0 * sin(uCruise * 0.21 + 2.0);
    pos = vec3(roadX(cz) + 5.4, -1.2, cz); type = 1.0; dir = 1.0; seed = 37.0; fade = 1.0;
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
  p.y += 0.0015 * uBass * sin(uTime * 47.0) - 0.006 * uBeat * uPunch;   // engine hum, a nudge on beats
  float camZ = uCruise * 24.0;
  const float CAM_RX = 5.4;                                             // the right-hand lane
  float yaw = atan((roadX(camZ + 14.0) - roadX(camZ)) / 14.0);
  vec3 cam = vec3(roadX(camZ) + CAM_RX, 0.0, camZ);
  vec3 rd = normalize(vec3(p.x, p.y - 0.05, 1.7));
  rd.xz = rot(yaw) * rd.xz;                     // view → world: look along the road's tangent
  vec3 camFwd = vec3(sin(yaw), 0.0, cos(yaw));
  vec3 lampCol = mix(vec3(1.0, 0.72, 0.35), pal(0.1), 0.3);
  float lampPass = pow(0.5 + 0.5 * cos(fract(camZ / 30.0) * TAU), 6.0);   // 1 when a lamp is right overhead

  // ── sky: city glow, stars, a skyline with lit windows ──
  vec3 horizonCol = pal(0.6) * 0.16 + vec3(0.02, 0.02, 0.05);
  vec3 col = mix(horizonCol, vec3(0.004, 0.005, 0.012), ss(0.0, 0.35, rd.y));
  col += pal(0.62) * 0.07 * exp(-abs(rd.y) * 14.0) * (0.5 + uLevel);
  float az = atan(rd.x, rd.z);
  vec2 sgrid = vec2(az * 70.0, rd.y * 160.0);
  vec2 scell = floor(sgrid);
  float sh = hash21(scell);
  vec2 sf = fract(sgrid) - 0.5;
  col += vec3(0.8, 0.85, 1.0) * step(0.975, sh) * (0.02 / (dot(sf, sf) + 0.02)) * 0.5 * ss(0.03, 0.1, rd.y) * (0.5 + 0.5 * sin(uTime * 2.0 + sh * 50.0)) * (0.5 + uHigh * 0.8);
  float bx = floor(az * 45.0);
  float bh = 0.012 + 0.03 * hash11(bx * 1.7) * hash11(bx * 0.3 + 2.0);
  float building = step(rd.y, bh) * step(0.0, rd.y);
  vec2 win = vec2(fract(az * 45.0) * 6.0, rd.y / bh * 8.0);
  float lit = step(0.8, hash21(floor(win) + bx)) * step(0.35, fract(win.x)) * step(0.35, fract(win.y));
  col = mix(col, vec3(0.008, 0.008, 0.014) + lampCol * 0.5 * lit * (0.6 + 0.4 * uMid), building);

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
    vec3 asphalt = vec3(0.045, 0.045, 0.05) * (0.7 + 0.6 * grain);
    vec3 shoulder = vec3(0.028, 0.03, 0.022) * (0.7 + 0.6 * grain);
    vec3 g = mix(shoulder, asphalt, 1.0 - ss(7.2, 7.7, ax));
    float lw = 0.07 + t * 0.0025;
    float dash = step(0.55, fract(w.z / 8.0));
    float laneLine = (1.0 - ss(lw, lw + 0.06, abs(ax - 3.6))) * dash;
    float edgeLine = 1.0 - ss(lw * 1.4, lw * 1.4 + 0.06, abs(ax - 7.0));
    float centre = 1.0 - ss(lw, lw + 0.06, abs(ax - 0.2));
    g += vec3(0.85, 0.85, 0.8) * (laneLine + edgeLine) * 0.55 + vec3(0.9, 0.7, 0.2) * centre * 0.45;
    float hx = (rx - CAM_RX) / 3.4;
    float head = exp(-hx * hx) * exp(-(w.z - camZ) / 40.0);              // our own headlights
    g *= 1.0 + head * 3.5 * vec3(1.0, 0.95, 0.85);
    float rail = 1.0 - ss(0.0, 0.18, abs(ax - 8.3));
    float post = step(0.85, fract(w.z / 4.0));
    g = mix(g, vec3(0.16, 0.16, 0.17) * (0.3 + 3.0 * head), rail * (0.6 + 0.4 * post));
    float eye = step(0.95, fract(w.z / 8.0)) * (1.0 - ss(lw * 1.5, lw * 1.5 + 0.08, abs(ax - 7.0)));
    g += vec3(1.0, 0.9, 0.6) * eye * head * 2.5;
    g += vec3(0.02) * step(0.985, hash21(floor(vec2(rx * 30.0, w.z * 6.0)))) * (0.5 + uHigh * 2.0) * step(ax, 7.4);
    col = mix(g, horizonCol, 1.0 - exp(-t * 0.009));
  }

  // ── vehicles: march each one inside its bounding sphere, keep the nearest hit ──
  float vT = 1e9;
  int vSlot = -1;
  vec3 vLocal = vec3(0.0), vPos = vec3(0.0);
  float vAng = 0.0, vType = 0.0, vDir = 1.0, vSeed = 0.0, vFade = 1.0;
  for (int i = 0; i < 13; i++) {
    vec3 pos;
    float ang, type, dir, seed, fade;
    vehicleAt(i, camZ, pos, ang, type, dir, seed, fade);
    float by = type < 1.0 ? 0.7 : (type < 3.0 ? 1.9 : 0.8);
    float br = type < 1.0 ? 2.6 : (type < 2.0 ? 6.3 : (type < 3.0 ? 6.4 : 1.5));
    vec3 oc = cam - (pos + vec3(0.0, by, 0.0));
    float b = dot(oc, rd);
    float disc = b * b - (dot(oc, oc) - br * br);
    if (disc < 0.0) continue;
    float sq = sqrt(disc);
    float t0 = max(-b - sq, 0.05), t1 = -b + sq;
    if (t1 < 0.05 || t0 > vT) continue;
    vec3 lo = cam - pos;
    lo.xz = rot(-ang) * lo.xz;
    vec3 ld = rd;
    ld.xz = rot(-ang) * ld.xz;
    float tt = t0;
    for (int s = 0; s < 36; s++) {
      vec3 q = lo + ld * tt;
      float d = carSDF(q, type);
      if (d < max(0.01, 0.003 * tt)) {
        if (tt < vT) { vT = tt; vSlot = i; vLocal = q; vPos = pos; vAng = ang; vType = type; vDir = dir; vSeed = seed; vFade = fade; }
        break;
      }
      tt += d * 0.9;
      if (tt > t1) break;
    }
  }
  if (vSlot >= 0) {
    vec3 q = vLocal;
    vec2 e = vec2(0.012, 0.0);
    vec3 n = normalize(vec3(carSDF(q + e.xyy, vType) - carSDF(q - e.xyy, vType),
                            carSDF(q + e.yxy, vType) - carSDF(q - e.yxy, vType),
                            carSDF(q + e.yyx, vType) - carSDF(q - e.yyx, vType)));
    vec3 nw = n;
    nw.xz = rot(vAng) * nw.xz;
    vec3 wp = cam + rd * vT;
    bool isWheel = wheelsSDF(q, vType) < bodySDF(q, vType);
    float h = hash11(vSeed);
    vec3 paint = vType < 1.0
      ? (h < 0.25 ? vec3(0.85) : (h < 0.45 ? vec3(0.05, 0.07, 0.16) : (h < 0.65 ? vec3(0.4, 0.03, 0.04) : (h < 0.82 ? vec3(0.04) : pal(h) * 0.6))))
      : (vType < 2.0 ? vec3(0.55, 0.5, 0.45) : (vType < 3.0 ? vec3(0.72, 0.7, 0.62) : vec3(0.05)));
    bool glass = vType < 1.0 && q.y > 0.9 && !isWheel;
    if (glass) paint = vec3(0.02, 0.025, 0.035);
    if (isWheel) {
      float axleY = (vType < 1.0 || vType >= 3.0) ? 0.33 : 0.5;
      float axleZ = vType < 1.0 ? 1.4 : (vType < 2.0 ? (abs(abs(q.z) - 1.9) < 0.9 ? 0.6 : 3.2) : (vType < 3.0 ? 3.4 : 0.75));
      float rr = length(vec2(q.y - axleY, abs(q.z) - axleZ));
      paint = mix(vec3(0.02), vec3(0.3), 1.0 - ss(0.16, 0.21, rr));          // hub caps
    }
    vec3 toCam = normalize(cam - wp);
    float beam = pow(max(dot(-toCam, camFwd), 0.0), 8.0);                     // inside our headlight cone
    float headL = max(dot(nw, toCam), 0.0) * beam * 3.2 * exp(-vT / 30.0);
    float underLamp = pow(0.5 + 0.5 * cos(fract(wp.z / 30.0) * TAU), 4.0);
    // lamps light the roof directly and everything else a little (scatter off the wet road)
    vec3 lampAmb = lampCol * (0.45 * max(nw.y, 0.0) + 0.14) * (0.35 + 0.65 * underLamp);
    vec3 skyAmb = vec3(0.03, 0.035, 0.05) * (0.5 + 0.5 * nw.y);
    float spec = pow(max(dot(nw, toCam), 0.0), glass ? 120.0 : 50.0) * (glass ? 1.2 : 0.5) * beam * exp(-vT / 40.0);
    vec3 shade = paint * (vec3(1.0, 0.95, 0.85) * headL + lampAmb + skyAmb) + vec3(spec) + lampCol * pow(max(nw.y, 0.0), 8.0) * 0.25 * underLamp;

    // emissive lights on the surfaces
    vec3 emis = vec3(0.0);
    vec3 red = vec3(1.0, 0.1, 0.06), white = vec3(1.0, 0.97, 0.88), amber = vec3(1.0, 0.55, 0.15);
    float brake = 0.5 + 0.9 * uBeat * uPunch;
    if (vType < 1.0) {
      float rear = step(q.z, -2.0), front = step(2.0, q.z);
      float lamp = 1.0 - ss(0.12, 0.2, length(vec2(abs(q.x) - 0.58, q.y - 0.68)));
      emis += red * lamp * rear * brake * 3.0 + white * lamp * front * 6.0;
      emis += vec3(0.8) * (1.0 - ss(0.1, 0.16, length(vec2(q.x, q.y - 0.5)))) * rear * 0.6;
      emis += red * (1.0 - ss(0.25, 0.32, abs(q.x))) * (1.0 - ss(0.03, 0.06, abs(q.y - 1.3))) * step(q.z, -1.3) * brake * 2.0;
    } else if (vType < 2.0) {
      float rear = step(q.z, -4.8), front = step(3.5, q.z);
      emis += red * (1.0 - ss(0.14, 0.24, length(vec2(abs(q.x) - 0.9, q.y - 0.8)))) * rear * brake * 3.0;
      emis += white * (1.0 - ss(0.14, 0.24, length(vec2(abs(q.x) - 0.8, q.y - 1.0)))) * front * 6.0;
      float mk = abs(fract(q.x / 0.5 + 0.5) - 0.5) * 0.5;
      emis += amber * (1.0 - ss(0.05, 0.09, length(vec2(mk, q.y - 3.75)))) * step(abs(q.x), 1.1) * 2.5;
      emis += amber * (1.0 - ss(0.05, 0.09, length(vec2(mk, q.y - 2.75)))) * front * 2.5;
      float mkz = abs(fract(q.z + 0.5) - 0.5);                                   // side markers along the trailer
      emis += amber * (1.0 - ss(0.05, 0.09, length(vec2(mkz, q.y - 3.75)))) * step(1.3, abs(q.x)) * step(q.z, 2.0) * 2.0;
    } else if (vType < 3.0) {
      float rear = step(q.z, -5.6), front = step(5.6, q.z);
      float f = fract(q.z / 1.3);
      float window = step(1.9, q.y) * step(q.y, 2.7) * step(0.1, f) * step(f, 0.9) * step(1.1, abs(q.x));
      emis += vec3(0.95, 0.8, 0.5) * window * 0.9 * (0.6 + 0.4 * uMid);
      emis += red * (1.0 - ss(0.14, 0.24, length(vec2(abs(q.x) - 0.9, q.y - 0.9)))) * rear * brake * 3.0;
      emis += white * (1.0 - ss(0.14, 0.24, length(vec2(abs(q.x) - 0.85, q.y - 0.9)))) * front * 6.0;
      emis += vec3(1.0, 0.9, 0.6) * step(2.75, q.y) * step(q.y, 3.05) * step(abs(q.x), 0.9) * front * 1.5;   // destination sign
    } else {
      emis += red * (1.0 - ss(0.06, 0.1, length(vec2(q.x, q.y - 0.72)))) * step(q.z, -0.85) * brake * 3.0;
      emis += white * (1.0 - ss(0.08, 0.14, length(vec2(q.x, q.y - 0.8)))) * step(0.9, q.z) * 6.0;
    }
    vec3 carCol = mix(shade + emis, horizonCol, 1.0 - exp(-vT * 0.009));
    col = mix(col, carCol, vFade);
  }
  // light glows and their wet reflections: bloom halos around the emissive lamps
  for (int i = 0; i < 13; i++) {
    vec3 pos;
    float ang, type, dir, seed, fade;
    vehicleAt(i, camZ, pos, ang, type, dir, seed, fade);
    vec3 lamp = type < 1.0 ? vec3(0.58, 0.68, 2.15) : (type < 2.0 ? (dir > 0.0 ? vec3(0.9, 0.8, 5.0) : vec3(0.8, 1.0, 3.7)) : (type < 3.0 ? vec3(0.88, 0.9, 5.7) : vec3(0.0, 0.75, 0.9)));
    vec3 lc = dir > 0.0 ? vec3(1.0, 0.12, 0.08) * (0.55 + 0.9 * uBeat * uPunch) : vec3(1.0, 0.97, 0.88) * 1.6;
    for (int e = 0; e < 2; e++) {
      if (type >= 3.0 && e > 0) break;
      vec3 lq = vec3((float(e) * 2.0 - 1.0) * lamp.x, lamp.y, -dir * lamp.z);   // the face turned toward us
      vec3 lw = localToWorld(lq, pos, ang);
      vec3 s = toScreen(lw - cam, yaw);
      if (s.z < 0.5 || s.z > vT + 0.5) continue;
      col += lc * glow(p - s.xy, clamp(0.7 / s.z, 0.003, 0.06)) * fade;
      if (ground) {
        vec3 sr = toScreen(vec3(lw.x, -2.4 - lw.y, lw.z) - cam, yaw);
        col += lc * wet(p, sr.xy, 0.0015) * 0.22 * fade;
      }
    }
  }

  // ── gantry signs every 240 units ──
  float kG = floor(camZ / 240.0);
  for (int i = 0; i < 2; i++) {
    float gz = (kG + float(i) + 1.0) * 240.0;
    float gx = roadX(gz);
    vec3 a = toScreen(vec3(gx - 8.6, 6.0, gz) - cam, yaw);
    vec3 b = toScreen(vec3(gx + 8.6, 6.0, gz) - cam, yaw);
    if (a.z < 1.0 || a.z > vT) continue;
    float k = 1.7 / a.z;
    float fade = 1.0 - ss(200.0, 300.0, a.z);
    float near = exp(-a.z / 40.0);
    vec3 pa = toScreen(vec3(gx - 8.6, -1.2, gz) - cam, yaw);
    vec3 pb = toScreen(vec3(gx + 8.6, -1.2, gz) - cam, yaw);
    float steelM = fill(sdSeg(p, a.xy, b.xy) - 0.25 * k) + fill(sdSeg(p, a.xy, pa.xy) - 0.18 * k) + fill(sdSeg(p, b.xy, pb.xy) - 0.18 * k);
    col = mix(col, vec3(0.05, 0.05, 0.055) * (0.5 + 3.0 * near), clamp(steelM, 0.0, 1.0) * fade);
    vec3 sc = toScreen(vec3(gx + 3.6, 7.6, gz) - cam, yaw);
    float board = fill(sdBox(p - sc.xy, vec2(2.6, 1.1) * k));
    col = mix(col, vec3(0.02, 0.09, 0.04) * (0.6 + 4.0 * near) + pal(0.45) * 0.02, board * fade);
    float txt = fill(sdBox(p - (sc.xy + vec2(-0.3, 0.35) * k), vec2(1.6, 0.16) * k)) + fill(sdBox(p - (sc.xy + vec2(0.2, -0.3) * k), vec2(1.2, 0.16) * k));
    col = mix(col, vec3(0.75, 0.8, 0.75) * (0.3 + 3.0 * near), clamp(txt, 0.0, 1.0) * board * fade);
    col += vec3(1.0, 0.95, 0.8) * (glow(p - (sc.xy + vec2(-1.5, -1.25) * k), 0.004 + 0.02 * k) + glow(p - (sc.xy + vec2(1.5, -1.25) * k), 0.004 + 0.02 * k)) * 0.6 * fade;
  }

  // ── street lamps on both sides: poles, arms, heads, pools, reflections ──
  float kL = floor(camZ / 30.0);
  for (int i = 0; i < 14; i++) {
    float lz = (kL + float(i) + 1.0) * 30.0;
    for (int s2 = 0; s2 < 2; s2++) {
      float side = s2 == 0 ? 1.0 : -1.0;
      float px = roadX(lz) + side * 9.0;
      vec3 top = toScreen(vec3(px, 5.5, lz) - cam, yaw);
      if (top.z < 1.0) continue;
      float k = 1.7 / top.z;
      float fade = 1.0 - ss(300.0, 420.0, top.z);
      vec3 base = toScreen(vec3(px, -1.2, lz) - cam, yaw);
      vec3 arm = toScreen(vec3(px - side * 2.5, 5.5, lz) - cam, yaw);
      if (top.z < vT) {
        float pole = fill(sdSeg(p, top.xy, base.xy) - 0.1 * k) + fill(sdSeg(p, top.xy, arm.xy) - 0.08 * k);
        col = mix(col, vec3(0.035, 0.035, 0.04) * (0.5 + 2.0 * exp(-top.z / 30.0)), clamp(pole, 0.0, 1.0) * fade);
      }
      col += lampCol * glow(p - arm.xy, clamp(0.45 / top.z, 0.003, 0.06)) * 1.8 * fade;
      if (ground) {
        float dxp = w.x - (px - side * 2.5), dzp = w.z - lz;
        col += lampCol * exp(-(dxp * dxp + dzp * dzp) / 55.0) * 0.55 * fade * exp(-t * 0.006);
        vec3 sr = toScreen(vec3(px - side * 2.5, -7.9, lz) - cam, yaw);
        col += lampCol * wet(p, sr.xy, 0.0011) * 0.25 * fade;
      }
    }
  }

  // ── the car ──
  vec3 interior = vec3(0.012, 0.011, 0.014) + lampCol * 0.05 * lampPass;
  float xe = aspect * (0.97 - 0.10 * (p.y + 0.6));
  col = mix(col, interior, ss(xe, xe + 0.02, abs(p.x)));               // A-pillars
  col = mix(col, interior, ss(0.84, 0.88, p.y));                        // roof line
  vec2 mq = abs(p - vec2(0.0, 0.74)) - vec2(0.15, 0.045);               // rear-view mirror
  float mEdge = max(mq.x, mq.y);
  vec3 mirrorCol = vec3(0.01, 0.01, 0.015) + lampCol * 0.1 * lampPass;
  vec2 mm = vec2(-0.03 + 0.06 * sin(uCruise * 0.4), 0.735);
  float behind = 0.5 + 0.5 * sin(uCruise * 0.7 + 1.0);
  mirrorCol += vec3(1.0, 0.97, 0.88) * (glow(p - mm - vec2(0.012, 0.0), 0.004) + glow(p - mm + vec2(0.012, 0.0), 0.004)) * 0.6 * behind;
  col = mix(col, vec3(0.03), 1.0 - ss(0.0, 0.012, abs(mEdge)));
  col = mix(col, mirrorCol, 1.0 - ss(-0.006, 0.0, mEdge));

  float dashY = -0.46 + 0.05 * cos(p.x * 1.6);
  float dash = ss(-0.006, 0.006, dashY - p.y);
  vec3 dashCol = vec3(0.016, 0.015, 0.018) + lampCol * 0.06 * lampPass * ss(dashY - 0.15, dashY, p.y);
  dashCol += pal(0.5) * 0.03 * (1.0 - ss(0.0, 0.02, abs(p.y - dashY)));
  vec3 dashLight = pal(0.5) * 0.7 + 0.25;
  float speedV = clamp((uCruiseRate - 0.4) / 1.2, 0.0, 1.0) + uBeat * 0.05 * uPunch;
  dashCol += dashLight * gaugeR(p - vec2(-0.95, dashY - 0.26), speedV, 0.17) * 0.9;
  dashCol += dashLight * gaugeR(p - vec2(-0.55, dashY - 0.27), uLevel, 0.12) * 0.8;
  vec2 sp = vec2((p.x - 0.02) / 0.6, (p.y - (dashY - 0.33)) / 0.2);   // centre display: spectrum
  float inS = step(0.0, sp.x) * step(sp.x, 1.0) * step(0.0, sp.y) * step(sp.y, 1.0);
  float cell = floor(sp.x * 20.0);
  float fx = fract(sp.x * 20.0);
  float on = step(sp.y, spec((cell + 0.5) / 20.0 * 0.9)) * step(0.2, fx) * step(fx, 0.8) * step(0.15, fract(sp.y * 10.0)) * inS;
  dashCol += pal(0.05 + sp.y * 0.5) * on * 0.9 + pal(0.3) * 0.02 * inS;
  vec2 wq = rot(yaw * 2.5) * (p - vec2(-0.95, -1.30));                 // the wheel turns with the road
  float rim = 1.0 - ss(0.0, 0.012, abs(length(wq) - 0.62) - 0.03);
  float spoke = (1.0 - ss(0.0, 0.01, abs(wq.x) - 0.03)) * step(0.0, wq.y) * step(wq.y, 0.62);
  vec3 wheelCol = vec3(0.03, 0.028, 0.03) + lampCol * 0.08 * lampPass + pal(0.5) * 0.02;
  dashCol = mix(dashCol, wheelCol, max(rim, spoke));
  col = mix(col, dashCol, dash);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'highway',
  name: 'Highway',
  group: 'Journey',
  blurb: 'Night motorway from the driver\'s seat; traffic taps its brakes on the beat',
  tags: ['vehicle', 'night', 'city', '3d'],
  energy: 0.5,
  particles: 0,
  trails: 0.25,
  zoom: 1,
  spin: 0,
  frag,
};
