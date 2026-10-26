// INFINITY — a mirrored room full of hanging lights, after Yayoi Kusama's Infinity Mirror Rooms.
//
// Mirrors on every wall and the ceiling, a black glass floor, and three dozen small lamps hung on
// wires at different heights. A ray of light bouncing around a mirrored box is the same thing as a
// straight ray passing through an endless lattice of mirrored copies of the box, so that is how
// this is drawn: the view ray walks from copy to copy (a 3-D DDA), meets the lamps of each copy
// where the mirroring puts them, and loses a little light at every mirror it passes — which is why
// the far copies fade into the dark instead of stopping. The seams between the mirror panels are
// drawn where the ray crosses them, and give the space its scale.
//
// Every lamp listens to its own band. The palette the room is lit in changes every sixteen beats,
// and one scheme in four is all warm white. Each beat sends a sphere of light out from where you
// stand: lamps brighten as it reaches them, their reflections a moment later, and the wave keeps
// travelling out through the copies long after it has left the room.
const frag = `
const vec3 S = vec3(5.0, 3.2, 5.0);        // the room, in metres
const int LEDS = 30;
const float FOCAL = 1.1;

vec3 ledPos(int i) {
  float fi = float(i);
  return vec3(0.35 + 4.3 * hash11(fi * 1.37 + 0.2), 0.75 + 2.0 * hash11(fi * 2.71 + 1.3), 0.35 + 4.3 * hash11(fi * 3.93 + 2.9));
}

void main() {
  vec2 p = centered();
  vec3 ro = vec3(2.5 + 0.55 * sin(uTime * 0.06), 1.45 + 0.08 * sin(uTime * 0.09), 2.5 + 0.55 * cos(uTime * 0.045));
  float yaw = uTime * 0.035 + uBalance * 0.12;
  float pitch = 0.10 * sin(uTime * 0.07) + 0.04;
  vec3 fw = vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch));
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 rd = normalize(fw * FOCAL + rt * p.x + cross(fw, rt) * p.y);
  rd += vec3(1e-5, 1e-5, 1e-5) * step(abs(rd), vec3(1e-5));   // no exactly axis-parallel rays

  // each lamp's colour and loudness, worked out once per pixel rather than once per copy
  float scheme = floor(uBeatCount / 16.0);
  bool white = mod(scheme, 4.0) > 2.5;
  vec3 lampCol[LEDS];
  for (int i = 0; i < LEDS; i++) {
    float fi = float(i);
    vec3 c = white ? vec3(1.0, 0.9, 0.78) : pal(fract(fi * 0.137 + scheme * 0.31));
    lampCol[i] = c * (0.25 + 1.6 * spec(0.03 + fract(fi * 0.618) * 0.78));
  }

  // walk the lattice of mirrored rooms
  vec3 cell = floor(ro / S);
  vec3 dir = sign(rd);
  vec3 tMax = ((cell + max(dir, 0.0)) * S - ro) / rd;
  vec3 tDelta = S / abs(rd);
  float t0 = 0.0;
  float trans = 1.0;
  vec3 col = vec3(0.0);
  float wave = uBeatAge * 11.0;
  for (int k = 0; k < 12; k++) {
    float t1 = min(tMax.x, min(tMax.y, tMax.z));
    vec3 odd = mod(cell, 2.0);
    vec3 base = cell * S;
    for (int i = 0; i < LEDS; i++) {
      vec3 L = ledPos(i);
      vec3 Lc = base + mix(L, S - L, odd);                     // where this copy's mirror puts the lamp
      vec3 w = Lc - ro;
      float along = dot(w, rd);
      float tc = clamp(along, t0, t1);
      vec3 dv = ro + rd * tc - Lc;
      float r = max(0.016, tc * 0.0011);                       // never smaller than about a pixel
      float lamp = (r * r) / (dot(dv, dv) + r * r * 0.15) * (0.016 * 0.016) / (r * r);
      float dist = length(w);
      float pulse = exp(-abs(dist - wave) * 0.9) * exp(-uBeatAge * 0.6) * uPunch;
      col += trans * lampCol[i] * lamp * (1.0 + 2.2 * pulse);
      // the wire it hangs from: a silver thread up to the ceiling, only worth drawing close by
      if (k < 3) {
        float top = mix(S.y, 0.0, odd.y) + base.y;
        float ya = min(Lc.y, top), yb = max(Lc.y, top);
        vec2 dh = Lc.xz - ro.xz;
        float hl = dot(rd.xz, rd.xz);
        float th = clamp(dot(dh, rd.xz) / max(hl, 1e-5), t0, t1);
        float yw = ro.y + rd.y * th;
        float off = length(ro.xz + rd.xz * th - Lc.xz);
        float wire = (1.0 - ss(0.0, 0.002 + th * 0.0009, off)) * step(ya, yw) * step(yw, yb);
        col += trans * vec3(0.05, 0.05, 0.06) * wire;
      }
    }
    // into the next copy through a mirror: it keeps most of the light, and has seams between panels
    vec3 hp = ro + rd * t1;
    vec3 f;
    if (tMax.x < tMax.y && tMax.x < tMax.z) { f = vec3(hp.y, hp.z, 0.0); cell.x += dir.x; tMax.x += tDelta.x; trans *= 0.86; }
    else if (tMax.y < tMax.z) { f = vec3(hp.x, hp.z, 1.0); cell.y += dir.y; tMax.y += tDelta.y; trans *= 0.74; }
    else { f = vec3(hp.x, hp.y, 0.0); cell.z += dir.z; tMax.z += tDelta.z; trans *= 0.86; }
    vec2 g = abs(fract(f.xy / 1.25 + 0.5) - 0.5) * 1.25;
    float seam = 1.0 - ss(0.0, 0.004 + t1 * 0.0012, min(g.x, g.y));
    trans *= 1.0 - 0.75 * seam * ss(22.0, 8.0, t1);                      // far seams would only make moire at the vanishing point
    t0 = t1;
    if (trans < 0.02) break;
  }
  col += vec3(0.004, 0.005, 0.008);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'infinity',
  name: 'Infinity',
  group: 'Vibe',
  blurb: 'A mirror room of hanging lamps, after Kusama; every beat sends a wave out through the reflections',
  tags: ['light', 'calm', '3d', 'abstract'],
  energy: 0.4,
  particles: 0,
  trails: 0.25,
  zoom: 1,
  spin: 0,
  frag,
};
