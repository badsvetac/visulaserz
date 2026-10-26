import { sculpted } from '../js/gfx/scene-kit.js';

const frag = sculpted({
  globals: `
vec3 rockCenter(int i) {
  if (i == 0) return vec3(-0.35, 0.43, -0.1);
  if (i == 1) return vec3(0.64, 0.23, 0.25);
  if (i == 2) return vec3(-1.32, 0.18, 0.6);
  if (i == 3) return vec3(0.2, 0.16, -1.35);
  return vec3(1.18, 0.12, -0.82);
}
vec3 rockSize(int i) { return i == 0 ? vec3(0.49, 0.73, 0.36) : i == 1 ? vec3(0.45, 0.4, 0.31) : vec3(0.32, 0.27, 0.3); }
float rake(vec2 p) {
  float d = 100.0;
  for (int i = 0; i < 5; i++) d = min(d, length((p - rockCenter(i).xz) * vec2(1, 1.15)) - rockSize(i).x);
  float contour = mix(p.y + 0.07 * sin(p.x), d, ss(1.2, 0.3, d));
  float phase = contour * 49.0 + gBass * 1.5 * sin(length(p) * 3.5 - uTravel);
  return sin(phase + gHit * 0.5);
}
`,
  map: `
vec2 d = vec2((p.y - 0.011 * rake(p.xz)) * 0.75, 0.0);
for (int i = 0; i < 5; i++) {
  vec3 q = p - rockCenter(i); q.xz *= rot(float(i) * 1.7);
  float r = ellipsoid(q, rockSize(i));
  r += 0.012 * sin(q.x * 14.0) * sin(q.y * 11.0) * sin(q.z * 12.0);
  d = nearer(d, vec2(r * 0.85, float(i) + 1.0));
}
return d;
`,
  material: `
if (id < 0.5) {
  vec3 sand = mix(vec3(0.52, 0.42, 0.27), vec3(0.83, 0.75, 0.55), noise(p.xz * 230.0));
  sand *= 0.92 + 0.08 * rake(p.xz);
  float ring = exp(-pow((length(p.xz) - uBeatAge * 2.0) * 5.0, 2.0)) * exp(-uBeatAge);
  return vec4(sand * (1.0 + ring * uAudioActive * uPunch * 0.16), 0.98);
}
float grain = fbm(p.xz * 13.0 + p.y * 9.0);
vec3 stone = mix(vec3(0.095, 0.12, 0.125), vec3(0.32, 0.33, 0.29), grain);
float moss = ss(0.43, 0.60, noise(p.xz * 9.0 + p.y * 6.0)) * ss(0.05, 0.6, n.y);
stone = mix(stone, vec3(0.17, 0.26, 0.043) * (0.75 + gMid * 0.55), moss);
return vec4(stone, 0.78);
`,
  camera: `ro = vec3(3.3 + sin(uCruise * 0.08) * 0.24, 2.65, 4.0); rd = viewRay(ro, vec3(0, 0.13, 0), uv, 2.3);`,
  sky: `return duskSky(rd, vec3(0.43, 0.42, 0.30), vec3(0.075, 0.16, 0.13));`,
  post: `col += vec3(0.11, 0.14, 0.055) * gHigh * pow(max(n.y, 0.0), 12.0) * 0.12;`,
});
export default {
  id: 'garden', name: 'Garden', group: 'Vibe',
  blurb: 'Sculpted moss stones in raked sand; bass travels through the grooves and mids illuminate the moss',
  tags: ['3d', 'zen', 'nature', 'calm'], energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
