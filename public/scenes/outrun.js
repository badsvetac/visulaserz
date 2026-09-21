const frag = `
float terrain(vec2 xz) {
  float ax = abs(xz.x);
  float side = ss(1.4, 5.0, ax);
  float fx = clamp((ax - 1.4) / 16.0, 0.0, 1.0);
  float s = hist(fx * 0.85, xz.y / 46.0);          // distance = age: beats ripple out to the horizon
  float n = noise(vec2(xz.x * 0.33, (xz.y + uTravel * 3.0) * 0.33));
  return side * (s * 3.4 * (0.55 + 0.75 * n) + 0.35 * n);
}
void main() {
  vec2 p = centered();
  const float horizon = 0.08;
  vec3 ro = vec3(uBalance * 0.4, 1.15 + uBass * 0.08, 0.0);
  vec3 rd = normalize(vec3(p.x, p.y - horizon, 1.5));
  vec3 haze = pal(0.30) * 0.5;

  float sy = p.y - horizon;
  vec3 col = mix(haze, vec3(0.012, 0.0, 0.045), ss(0.0, 0.9, sy));
  vec2 sg = floor(p * 60.0);
  float sh = hash21(sg);
  col += step(0.985, sh) * (0.4 + 0.6 * sin(uTime * 3.0 + sh * 50.0)) * ss(0.1, 0.6, sy) * (0.5 + uHigh);

  vec2 sc = vec2(0.0, horizon + 0.30);
  float sd = length(p - sc);
  float sunR = 0.36 + uBass * 0.03;
  float yy = (p.y - sc.y) / sunR;
  float slit = step(0.12 + 0.55 * clamp(-yy, 0.0, 1.0), fract(yy * 7.0 - uTime * 0.12));
  float sun = (1.0 - ss(sunR - 0.004, sunR + 0.004, sd)) * mix(slit, 1.0, step(0.0, yy));
  col = mix(col, mix(pal(0.02), pal(0.22), clamp(yy * 0.5 + 0.5, 0.0, 1.0)) * (1.2 + uBass * 0.8), sun);
  col += pal(0.1) * 0.25 * exp(-sd * 2.2) * (0.6 + uLevel);

  if (rd.y < 0.5) {
    // Geometric steps give even coverage in perspective; a bisection then pins the exact surface.
    float t0 = 0.3, t1 = 0.3;
    float tMax = 46.0;
    if (rd.y < 0.0) tMax = min(tMax, ro.y / -rd.y + 0.5);
    bool hit = false;
    for (int i = 0; i < 64; i++) {
      t1 = t0 * 1.082 + 0.02;
      vec3 q = ro + rd * t1;
      if (q.y < terrain(q.xz)) { hit = true; break; }
      if (t1 > tMax) break;
      t0 = t1;
    }
    if (hit) {
      for (int i = 0; i < 6; i++) {
        float tm = 0.5 * (t0 + t1);
        vec3 q = ro + rd * tm;
        if (q.y < terrain(q.xz)) t1 = tm; else t0 = tm;
      }
      vec3 pos = ro + rd * t1;
      float hh = terrain(pos.xz);
      vec2 gf = abs(fract(vec2(pos.x, pos.z + uTravel * 3.0) * 0.5) - 0.5);
      float grid = 1.0 - ss(0.0, 0.018 + t1 * 0.0022, min(gf.x, gf.y));
      vec3 lineCol = mix(pal(0.55), pal(0.8), clamp(hh * 0.5, 0.0, 1.0));
      vec3 ground = vec3(0.015, 0.0, 0.04) + pal(0.62) * 0.05 * hh;
      vec3 tc = ground + lineCol * grid * (0.55 + hh * 0.9 + uBeat * 0.6 * uPunch);
      col = mix(tc, haze, 1.0 - exp(-t1 * 0.055));
    }
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'outrun',
  name: 'Outrun',
  group: 'Journey',
  blurb: 'Neon grid road to a synth sun; hills rise from the spectrum\'s history',
  tags: ['retro', 'vehicle', 'geometric', '3d'],
  energy: 0.7,
  particles: 0,
  trails: 0,
  zoom: 1,
  spin: 0,
  frag,
};
