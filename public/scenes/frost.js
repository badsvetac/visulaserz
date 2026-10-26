import { sculpted } from '../js/gfx/scene-kit.js';

const frag = sculpted({
  globals: `
vec3 iceSpace(vec3 p, float i) {
  if (i == 1.0) p -= vec3(-1.7, 0.5, -1.25);
  if (i == 2.0) p -= vec3(1.8, -0.35, -1.55);
  p.xy *= rot(uCruise * (i == 0.0 ? 0.08 : -0.06) + i);
  p.yz *= rot(0.3 + sin(uCruise * 0.13 + i) * 0.17);
  p.xz *= rot(sin(uCruise * 0.1 + i) * 0.27);
  return p / (i == 0.0 ? 1.0 : 0.42);
}
float iceBranch(vec3 p, vec2 a, vec2 b, float width) {
  vec2 axis = normalize(b - a), v = p.xy - (a + b) * 0.5;
  vec3 q = vec3(dot(v, axis), dot(v, vec2(-axis.y, axis.x)), p.z);
  float sides = max(abs(q.y) * 0.86 + abs(q.z) * 0.5 - width, abs(q.z) - width * 0.65);
  return max(sides, abs(q.x) - length(b - a) * 0.5);
}
float crystal(vec3 p) {
  p.xy /= 1.0 + gBass * 0.11;
  float r = length(p.xy), angle = mod(atan(p.y, p.x) + PI / 6.0, PI / 3.0) - PI / 6.0;
  vec3 q = vec3(cos(angle) * r, sin(angle) * r, p.z);
  float d = iceBranch(q, vec2(0), vec2(1.22, 0), 0.041);
  for (int j = 0; j < 3; j++) {
    float x = 0.36 + float(j) * 0.28;
    float len = 0.30 - float(j) * 0.06 + gMid * 0.055;
    vec3 b = q; b.y = abs(b.y);
    d = min(d, iceBranch(b, vec2(x, 0), vec2(x + len, len * 0.95), 0.028 - float(j) * 0.004));
    d = min(d, iceBranch(b, vec2(x + len * 0.58, len * 0.55), vec2(x + len * 0.63, len * 0.92), 0.014));
  }
  float core = max(max(q.x + abs(p.z) * 0.75 - 0.19, abs(p.z) - 0.105), -q.x - 0.19);
  return min(d, core) * 0.85;
}
`,
  map: `
vec2 d = vec2(100, 0);
for (int i = 0; i < 3; i++) {
  float s = i == 0 ? 1.0 : 0.42;
  d = nearer(d, vec2(crystal(iceSpace(p, float(i))) * s, float(i)));
}
return d;
`,
  material: `return vec4(mix(vec3(0.16, 0.40, 0.65), vec3(0.58, 0.83, 0.97), max(n.z, 0.0)), 0.085);`,
  camera: `ro = vec3(0, 0.12, 4.4); rd = viewRay(ro, vec3(0, 0, 0), uv, 2.05);`,
  sky: `
vec3 c = mix(vec3(0.009, 0.027, 0.074), vec3(0.045, 0.11, 0.20), ss(-0.7, 0.7, rd.y));
vec2 p = rd.xy * 15.0 + vec2(uTime * 0.035, uTime * 0.08);
vec2 cell = floor(p), f = fract(p) - 0.5;
float star = exp(-dot(f, f) * 160.0) * step(0.79, hash21(cell));
return c + vec3(0.25, 0.47, 0.6) * star * (0.12 + gHigh * 0.4);
`,
  post: `
float rim = pow(1.0 - abs(dot(n, rd)), 2.0);
vec3 ref = reflect(rd, n);
float facet = pow(max(dot(ref, normalize(vec3(-0.5, 0.8, 1.0))), 0.0), 36.0);
col += vec3(0.12, 0.34, 0.55) * (0.2 + rim * 0.8);
col += vec3(0.45, 0.73, 0.95) * facet * (0.4 + gHigh * 1.4);
vec3 local = iceSpace(p, hit.y);
float pulse = exp(-pow((length(local.xy) - uBeatAge * 2.3) * 9.0, 2.0));
col += vec3(0.16, 0.40, 0.65) * pulse * exp(-uBeatAge) * uAudioActive * uPunch * 0.6;
`,
  steps: 84, far: 16,
});
export default {
  id: 'frost', name: 'Frost', group: 'Vibe',
  blurb: 'Faceted six-arm ice crystals with branching geometry; bass expands the lattice and treble catches each frozen edge',
  tags: ['3d', 'ice', 'crystal', 'winter'], energy: 0.45, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
