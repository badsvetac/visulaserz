import { sculpted } from '../js/gfx/scene-kit.js';

const frag = sculpted({
  globals: `
vec3 dancerSpace(vec3 p, float i) {
  float scale = i == 1.0 ? 1.0 : 0.78;
  p -= vec3((i - 1.0) * 1.8, 0, i == 1.0 ? 0.4 : -0.9);
  p /= scale;
  p.xz *= rot(uTravel * (0.55 + i * 0.045) + i * 2.1);
  return p;
}
`,
  map: `
vec2 d = vec2(p.y, 0.0);
for (int i = 0; i < 3; i++) {
  vec3 q = dancerSpace(p, float(i));
  float scale = i == 1 ? 1.0 : 0.78;
  float angle = atan(q.z, q.x), height = clamp((q.y - 0.16) / 1.05, 0.0, 1.0);
  float radius = 0.18 + (0.73 + gBass * 0.21) * pow(1.0 - height, 1.55);
  radius += (0.016 + 0.035 * (1.0 - height)) * cos(angle * 18.0 + q.y * 2.0);
  float skirt = max(length(q.xz) - radius, abs(q.y - 0.685) - 0.525) * 0.66;
  skirt = min(skirt, ellipsoid(q - vec3(0, 1.32, 0), vec3(0.215, 0.29, 0.135)));
  vec3 shoulder = vec3(0.14, 1.5, 0), elbow = vec3(0.42, 1.63, 0.02), wrist = vec3(0.66, 1.79, 0.01);
  skirt = min(skirt, capsule(q, shoulder, elbow, 0.080));
  skirt = min(skirt, capsule(q, elbow, wrist, 0.068));
  skirt = min(skirt, capsule(q, vec3(-0.14, 1.49, 0), vec3(-0.47, 1.49, 0.04), 0.080));
  skirt = min(skirt, capsule(q, vec3(-0.47, 1.49, 0.04), vec3(-0.73, 1.34, 0.09), 0.064));
  d = nearer(d, vec2(skirt * scale, 1.0 + float(i)));
  float skin = ellipsoid(q - vec3(0, 1.71, 0.025), vec3(0.123, 0.15, 0.11));
  skin = min(skin, ellipsoid(q - (wrist + vec3(0.035, 0.06, 0)), vec3(0.042, 0.095, 0.035)));
  skin = min(skin, ellipsoid(q - vec3(-0.77, 1.30, 0.095), vec3(0.05, 0.078, 0.031)));
  d = nearer(d, vec2(skin * scale, 4.0));
  d = nearer(d, vec2(cylinder(q - vec3(0, 2.035, 0), 0.123, 0.23) * scale, 5.0));
  d = nearer(d, vec2(torus(q - vec3(0, 1.13, 0), vec2(0.208, 0.024)) * scale, 6.0));
}
vec3 arch = p - vec3(0, 0, -3.2);
float pillars = max(abs(abs(arch.x) - 3.1) - 0.14, abs(arch.y - 1.1) - 1.1);
float vault = max(abs(length(vec2(arch.x, arch.y - 2.2)) - 3.1) - 0.14, 2.2 - arch.y);
d = nearer(d, vec2(max(min(pillars, vault), abs(arch.z) - 0.2), 7.0));
return d;
`,
  material: `
if (id < 0.5) {
  float r = length(p.xz), spoke = pow(abs(sin(atan(p.z, p.x) * 12.0)), 24.0);
  float inlay = exp(-pow((r - 2.6) * 85.0, 2.0)) + exp(-pow((r - 2.8) * 85.0, 2.0));
  return vec4(vec3(0.045, 0.034, 0.026) + vec3(0.24, 0.14, 0.045) * (inlay + spoke * exp(-pow((r - 2.7) * 12.0, 2.0))) * (0.4 + gMid), 0.32);
}
if (id < 3.5) {
  vec3 q = dancerSpace(p, id - 1.0);
  float fold = 0.94 + 0.06 * cos(atan(q.z, q.x) * 18.0 + q.y * 2.0);
  return vec4(vec3(0.85, 0.81, 0.71) * fold, 0.72);
}
if (id < 4.5) return vec4(0.50, 0.30, 0.19, 0.63);
if (id < 5.5) return vec4(vec3(0.31, 0.20, 0.105) * (0.85 + 0.15 * noise(p.xy * 100.0)), 0.92);
if (id < 6.5) return vec4(0.12, 0.063, 0.032, 0.70);
return vec4(0.28, 0.21, 0.12, 0.8);
`,
  camera: `ro = vec3(sin(uCruise * 0.05) * 0.35, 2.0, 6.65); rd = viewRay(ro, vec3(0, 1.08, 0), uv, 2.45);`,
  sky: `return mix(vec3(0.08, 0.048, 0.025), vec3(0.009, 0.015, 0.023), ss(-0.1, 0.9, rd.y));`,
  post: `
if (hit.y > 0.5 && hit.y < 3.5) col += vec3(0.17, 0.14, 0.07) * pow(1.0 - max(dot(n, -rd), 0.0), 2.0) * (0.5 + gHigh);
if (hit.y < 0.5) col += vec3(0.22, 0.10, 0.025) * exp(-pow((length(p.xz) - uBeatAge * 3.0) * 6.0, 2.0)) * exp(-uBeatAge * 1.2) * uAudioActive * uPunch;
`,
  steps: 84,
});
export default {
  id: 'sema', name: 'Sema', group: 'Vibe',
  blurb: 'Three whirling figures in an arched hall, with pleated robes that open to the bass and warm stage reflections',
  tags: ['3d', 'turkish', 'dance', 'calm'], energy: 0.45, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
