const frag = `
float map(vec3 q) {
  float r = length(q);
  vec3 n = q / max(r, 1e-4);
  float lat = acos(clamp(n.y, -1.0, 1.0)) / PI;
  float lon = atan(n.z, n.x);
  float spikes = spec(lat * 0.8) * (0.55 + 0.45 * sin(lon * 7.0 + uTime * 0.8 + lat * 10.0));
  float wob = 0.06 * sin(n.x * 5.0 + uTime * 1.1) * sin(n.y * 6.0 - uTime * 0.9) * sin(n.z * 5.5 + uTime * 0.7);
  return r - (0.78 + uBass * 0.14 + spikes * 0.34 + wob * (0.6 + 2.0 * uMid));
}
void main() {
  vec2 p = centered();
  p.x -= uBalance * 0.1;
  vec3 ro = vec3(0.0, 0.0, -3.7);
  vec3 rd = normalize(vec3(p, 1.9));
  mat2 rx = rot(0.35 + 0.15 * sin(uTime * 0.21));
  mat2 ry = rot(uTime * 0.15 + uTravel * 0.05);
  ro.yz = rx * ro.yz; rd.yz = rx * rd.yz;
  ro.xz = ry * ro.xz; rd.xz = ry * rd.xz;

  float t = 0.0, glow = 0.0;
  bool hit = false;
  for (int i = 0; i < 64; i++) {
    float d = map(ro + rd * t);
    glow += exp(-max(d, 0.0) * 9.0) * 0.006;
    if (d < 0.002) { hit = true; break; }
    t += d * 0.5;                       // the displaced surface is not a true distance field: step short
    if (t > 6.0) break;
  }
  vec3 col = pal(0.6) * 0.06 * max(0.0, 1.0 - length(p) * 0.5) + pal(0.25 + uTime * 0.02) * glow * (0.5 + 1.2 * uLevel);
  if (hit) {
    vec3 q = ro + rd * t;
    vec2 e = vec2(0.003, 0.0);
    vec3 nrm = normalize(vec3(map(q + e.xyy) - map(q - e.xyy), map(q + e.yxy) - map(q - e.yxy), map(q + e.yyx) - map(q - e.yyx)));
    float fres = pow(1.0 - max(dot(nrm, -rd), 0.0), 2.5);
    float heat = ss(0.85, 1.25, length(q));
    vec3 base = pal(0.55 + heat * 0.35) * (0.08 + heat * 1.3);
    vec3 rim = pal(0.1 + uTime * 0.02) * fres * (1.2 + uBeat * 1.5 * uPunch);
    float spe = pow(max(dot(reflect(rd, nrm), normalize(vec3(0.4, 0.8, -0.5))), 0.0), 24.0);
    col = base + rim + vec3(spe) * 0.6;
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'orb',
  name: 'Orb',
  group: 'Show',
  blurb: 'Ray-marched sphere sprouting spectrum spikes, swelling with the bass',
  tags: ['3d', 'abstract', 'organic'],
  energy: 0.6,
  particles: 3,
  trails: 0.45,
  zoom: 1,
  spin: 0,
  frag,
};
