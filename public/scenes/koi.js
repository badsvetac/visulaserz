import { sculpted } from '../js/gfx/scene-kit.js';

const frag = sculpted({
  globals: `
vec3 fishSpace(vec3 p, float i) {
  float angle = uTravel * (0.13 + i * 0.012) + i * TAU / 5.0;
  p -= vec3(cos(angle) * (1.35 + i * 0.07 + gBass * 0.17), 0.33 + sin(angle * 1.7 + i) * (0.15 + gBass * 0.15), sin(angle) * (1.18 + gBass * 0.13));
  p.xz *= rot(-angle - PI * 0.5);
  p.z += sin(p.x * 5.0 + uTravel * 4.0 + i) * (0.035 + gMid * 0.095 + gBass * 0.05) * ss(0.3, -0.7, p.x);
  return p / (0.76 + i * 0.065);
}
vec3 lilySpace(vec3 p, float i) {
  return p - vec3(i == 0.0 ? -1.9 : 1.65, 0.88 + gBass * 0.025 * sin(uCruise + i), i == 0.0 ? -0.6 : 1.35);
}
`,
  map: `
vec2 d = vec2(p.y + 0.42, 0);
for (int i = 0; i < 5; i++) {
  vec3 q = fishSpace(p, float(i)), body = q;
  body.z /= mix(0.38, 1.0, ss(-0.64, 0.18, q.x));
  float fish = ellipsoid(body, vec3(0.61, 0.165, 0.205));
  vec3 tail = q - vec3(-0.70, 0, 0);
  tail.z *= 1.0 + abs(tail.x) * 2.0;
  fish = min(fish, ellipsoid(tail, vec3(0.23, 0.023, 0.25)));
  vec3 fin = q - vec3(0.03, -0.055, 0); fin.z = abs(q.z) - 0.23;
  fin.xz *= rot(-0.46);
  fish = min(fish, ellipsoid(fin, vec3(0.19, 0.017, 0.12)));
  fish = min(fish, ellipsoid(q - vec3(-0.08, 0.16, 0), vec3(0.22, 0.092, 0.018)));
  d = nearer(d, vec2(fish * 0.60, float(i) + 1.0));
  vec3 eye = q - vec3(0.39, 0.074, 0); eye.z = abs(q.z) - 0.108;
  d = nearer(d, vec2((length(eye) - 0.033) * 0.65, 6.0));
}
for (int i = 0; i < 2; i++) {
  vec3 q = lilySpace(p, float(i));
  float leaf = cylinder(q, 0.48, 0.016);
  leaf = max(leaf, -max(abs(q.z) - q.x * 0.23, -q.x));
  d = nearer(d, vec2(leaf, 7.0));
}
return d;
`,
  material: `
if (id < 0.5) {
  vec2 cell = floor(p.xz * 5.0), q = fract(p.xz * 5.0) - 0.5;
  float pebble = ss(0.51, 0.30, length(q));
  vec3 c = mix(vec3(0.085, 0.12, 0.08), vec3(0.20, 0.24, 0.16), hash21(cell)) * (0.55 + pebble * 0.5);
  return vec4(c, 0.76);
}
if (id > 6.5) {
  vec3 q = lilySpace(p, p.x < 0.0 ? 0.0 : 1.0);
  float vein = pow(abs(cos(atan(q.z, q.x) * 16.0)), 26.0);
  return vec4(vec3(0.06, 0.25, 0.038) * (0.8 + vein * 0.32 + gMid * 0.18), 0.5);
}
if (id > 5.5) return vec4(0.012, 0.015, 0.009, 0.16);
vec3 q = fishSpace(p, id - 1.0);
float marking = noise(q.xz * 7.5 + vec2(id * 9.0, q.y * 5.0));
vec3 cream = vec3(0.84, 0.78, 0.64), vermilion = vec3(0.76, 0.095, 0.025);
if (id > 3.5) { cream = vec3(0.85, 0.57, 0.14); vermilion = vec3(0.76, 0.31, 0.025); }
vec3 c = mix(cream, vermilion, ss(0.44, 0.49, marking));
c = mix(c, vec3(0.028, 0.037, 0.031), ss(0.72, 0.77, noise(q.xz * 10.0 + id * 7.0)));
vec2 scale = vec2(q.x * 42.0, atan(q.y, q.z) * 11.0); scale.x += mod(floor(scale.y), 2.0) * 0.5;
float scales = ss(0.46, 0.36, length(fract(scale) - 0.5));
c *= 0.84 + 0.16 * scales;
return vec4(c, 0.3);
`,
  camera: `ro = vec3(0.55 + sin(uCruise * 0.06) * 0.2, 4.3, 4.1); rd = viewRay(ro, vec3(0, 0.2, 0), uv, 2.2);`,
  sky: `return duskSky(rd, vec3(0.12, 0.27, 0.22), vec3(0.03, 0.09, 0.085));`,
  post: `
float caustic = sin(p.x * 10.0 + sin(p.z * 7.0 + uTravel)) + sin(p.z * 11.0 + sin(p.x * 8.0 - uTravel * 0.8));
col *= 0.85 + pow(max(0.0, 1.0 - abs(caustic) * 2.0), 2.0) * (0.22 + gHigh * 0.2);
if (hit.y < 6.5) col = mix(col, vec3(0.025, 0.21, 0.16), 0.12 + max(0.0, 0.9 - p.y) * 0.10);
float waterT = (0.92 - ro.y) / rd.y;
vec2 water = (ro + rd * waterT).xz;
float ripple = sin(length(water) * 16.0 - uBeatAge * 13.0) * exp(-pow(length(water) - uBeatAge * 2.0, 2.0) * 3.0) * exp(-uBeatAge);
col += vec3(0.10, 0.22, 0.18) * ripple * uAudioActive * uPunch * 0.16;
`,
  steps: 88,
});
export default {
  id: 'koi', name: 'Koi', group: 'Vibe',
  blurb: 'Five sculpted koi with patterned scales, moving fins and lily pads beneath dancing water caustics',
  tags: ['3d', 'fish', 'water', 'zen'], energy: 0.4, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
