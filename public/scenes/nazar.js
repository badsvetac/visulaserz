import { sculpted } from '../js/gfx/scene-kit.js';

const frag = sculpted({
  globals: `
vec3 beadSpace(vec3 p, float i) {
  float side = i - 1.0, scale = i == 1.0 ? 1.0 : 0.47;
  p -= vec3(side * 1.65, i == 1.0 ? 0.85 : 1.12, i == 1.0 ? 0.0 : -0.45);
  p.xy *= rot(sin(uCruise * 0.65 + i * 1.7) * (0.025 + gBass * 0.11) + gHit * side * 0.11);
  p.xz *= rot(sin(uCruise * 0.22 + i) * (0.2 + gMid * 0.18) + uBalance * uAudioActive * 0.14);
  return p / (scale * (1.0 + gBass * 0.055));
}
`,
  map: `
vec2 d = vec2(p.y + 0.3, 0.0);
for (int i = 0; i < 3; i++) {
  float fi = float(i), scale = i == 1 ? 1.0 : 0.47;
  vec3 q = beadSpace(p, fi);
  d = nearer(d, vec2(ellipsoid(q, vec3(0.94, 1.0, 0.30)) * scale, 1.0 + fi));
  float gold = torus((q - vec3(0, 1.07, 0)).xzy, vec2(0.12, 0.028));
  gold = min(gold, torus(q.xzy, vec2(0.963, 0.013)));
  gold = min(gold, capsule(q, vec3(0, 1.17, 0), vec3(0, 5.0, 0), 0.008));
  d = nearer(d, vec2(gold * scale, 4.0));
}
return d;
`,
  material: `
if (id < 0.5) return vec4(vec3(0.018, 0.025, 0.045) + vec3(0.012, 0.034, 0.085) * exp(-dot(p.xz, p.xz) * 0.4), 0.3);
if (id > 3.5) return vec4(0.85, 0.58, 0.22, 0.22);
vec3 q = beadSpace(p, id - 1.0);
vec2 eye = q.xy - vec2(-0.028, 0.025);
float r = length(eye * vec2(1.02, 1.0));
r += 0.006 * sin(atan(eye.y, eye.x) * 13.0) + 0.006 * noise(eye * 30.0);
vec3 c = vec3(0.013, 0.063, 0.42);
c = mix(c, vec3(0.82, 0.87, 0.90), ss(0.712, 0.692, r));
c = mix(c, vec3(0.08, 0.46, 0.78), ss(0.5, 0.48, r));
c = mix(c, vec3(0.003, 0.008, 0.028), ss(0.232 + gBass * 0.055, 0.222 + gBass * 0.055, r));
c *= 0.79 + 0.3 * ss(-0.2, 0.2, q.z);
c += vec3(0.025, 0.18, 0.40) * exp(-pow((r - 0.47) * 38.0, 2.0)) * (gMid * 0.5 + gHit * 0.8);
return vec4(c, 0.105);
`,
  camera: `ro = vec3(sin(uCruise * 0.09) * 0.32, 1.35, 4.45); rd = viewRay(ro, vec3(0, 0.9, 0), uv, 2.1);`,
  sky: `
vec3 c = mix(vec3(0.012, 0.022, 0.053), vec3(0.075, 0.13, 0.21), ss(-0.4, 0.8, rd.y));
return c + vec3(0.7, 0.85, 1.0) * pow(max(dot(rd, normalize(vec3(-0.8, 0.9, 0.8))), 0.0), 24.0) * 0.5;
`,
  metal: 'step(3.5, hit.y) * 0.85',
  post: `
if (hit.y > 0.5 && hit.y < 3.5) {
  float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
  col += vec3(0.025, 0.17, 0.5) * fresnel * (0.4 + gHigh * 0.6);
  vec3 reflection = reflect(rd, n);
  col += vec3(0.55, 0.7, 0.9) * pow(max(dot(reflection, normalize(vec3(-0.8, 0.9, 0.8))), 0.0), 40.0) * (0.5 + gHigh * 0.5);
}
`,
});
export default {
  id: 'nazar', name: 'Nazar', group: 'Things',
  blurb: 'Sculpted cobalt glass, molten gold fittings and a bass-driven iris; treble catches the curved rim',
  tags: ['3d', 'glass', 'turkish', 'bass'], energy: 0.4, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
