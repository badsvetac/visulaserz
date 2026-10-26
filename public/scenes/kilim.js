import { sculpted } from '../js/gfx/scene-kit.js';

const frag = sculpted({
  globals: `
float clothY(vec2 p) {
  return 0.55 + 0.12 * sin(p.y * 1.65 + uCruise * 0.65) + 0.055 * sin(p.x * 3.0 - uTime * 0.6)
    + gBass * 0.20 * sin(p.y * 2.4 - uTravel * 1.4) + gHit * 0.1 * cos(p.x * 2.0) * exp(-p.y * p.y * 0.3);
}
`,
  map: `
vec3 q = p; q.y -= clothY(p.xz);
vec2 d = vec2(box3(q, vec3(1.48, 0.023, 2.2), 0.014) * 0.65, 1.0);
vec3 f = q; f.x = mod(f.x + 0.032, 0.064) - 0.032; f.z = abs(f.z);
float fringe = capsule(f, vec3(0, 0, 2.20), vec3(0.012, -0.06, 2.43), 0.008);
d = nearer(d, vec2(max(fringe, abs(p.x) - 1.47) * 0.65, 2.0));
return nearer(d, vec2(p.y + 0.18, 0.0));
`,
  material: `
if (id < 0.5) return vec4(0.028, 0.024, 0.031, 0.88);
vec2 k = floor(p.xz * 95.0) / 95.0;
float border = min(1.48 - abs(k.x), 2.2 - abs(k.y));
vec3 red = vec3(0.54, 0.073, 0.039), indigo = vec3(0.022, 0.095, 0.16);
vec3 saffron = vec3(0.76, 0.41, 0.09), wool = vec3(0.83, 0.68, 0.44);
vec3 c = red;
if (border < 0.22) {
  float zig = abs(fract((abs(k.x) > 1.25 ? k.y : k.x) * 6.0) - 0.5);
  c = mix(indigo, wool, step(0.04, border) * step(border, 0.16) * step(zig, 0.25));
} else {
  vec2 cell = mod(k + vec2(0.37, 0.46), vec2(0.74, 0.92)) - vec2(0.37, 0.46);
  float diamond = abs(cell.x) * 1.3 + abs(cell.y);
  float ring = mod(floor(diamond * 15.0), 4.0);
  c = ring < 1.0 ? wool : ring < 2.0 ? indigo : ring < 3.0 ? red : saffron;
  c = mix(c, red, ss(0.42, 0.47, diamond));
  c = mix(c, wool, ss(0.073, 0.047, diamond));
}
float weave = 0.80 + 0.13 * sin(p.x * 610.0) * sin(p.z * 590.0) + 0.13 * noise(p.xz * 230.0);
c *= weave;
c *= 1.0 + gMid * 0.20 * sin(p.z * 4.0 + uCruise);
float wavefront = exp(-pow((p.z - (uBeatAge * 4.5 - 2.2)) * 4.5, 2.0)) * exp(-uBeatAge * 0.8);
c += saffron * wavefront * uAudioActive * uPunch * 0.24;
return vec4(id > 1.5 ? wool * weave : c, 0.88);
`,
  camera: `ro = vec3(2.55 + sin(uCruise * 0.07) * 0.18, 3.6, 4.8); rd = viewRay(ro, vec3(0, 0.40, 0), uv, 2.0);`,
  sky: `return mix(vec3(0.065, 0.045, 0.05), vec3(0.013, 0.02, 0.04), ss(-0.2, 0.8, rd.y));`,
  post: `if (hit.y > 0.5) col += vec3(0.26, 0.12, 0.045) * pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * gHigh * 0.25;`,
});
export default {
  id: 'kilim', name: 'Kilim', group: 'Things',
  blurb: 'A floating woven carpet with knotted diamonds, wool fringe and rolling bass folds',
  tags: ['3d', 'textile', 'turkish', 'warm'], energy: 0.5, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
