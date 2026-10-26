import { SCULPT } from '../js/gfx/scene-kit.js';

const frag = `${SCULPT}
void main() {
  musicSignals();
  vec2 uv = centered();
  vec3 ro = vec3(0, 1.2, 7.5), rd = viewRay(ro, vec3(0, 1.0, 0), uv, 2.25);
  vec3 col = duskSky(rd, vec3(0.67, 0.32, 0.15), vec3(0.095, 0.17, 0.28));
  float hill = -0.52 + 0.075 * sin(uv.x * 1.6) + 0.028 * sin(uv.x * 5.5);
  col = mix(col, vec3(0.055, 0.08, 0.10), ss(hill + 0.02, hill - 0.01, uv.y));
  float nearHill = -0.73 + 0.035 * sin(uv.x * 3.0 + 2.0);
  col = mix(col, vec3(0.023, 0.044, 0.042), ss(nearHill + 0.01, nearHill - 0.01, uv.y));
  col += vec3(0.07, 0.035, 0.013) * gMid * exp(-pow((uv.y + 0.35) * 4.0, 2.0));
  outColor = vec4(col, 1);
}`;
const vert = `${SCULPT}
void main() {
  musicSignals();
  float id = float(gl_VertexID), seed = hash11(id * 1.31 + 3.0);
  float u = (hash11(id * 7.71 + 1.0) - 0.5) * 6.1;
  float a = hash11(id * 3.19 + 6.0) * TAU;
  float radius = sqrt(hash11(id * 9.37 + 2.0));
  float phase = u * 1.1 + uTravel * 0.22;
  float thickness = 0.42 * (1.0 - gBass * 0.38);
  vec3 p = vec3(u, sin(phase) * (0.48 + gBass * 0.24) + sin(phase * 2.2) * 0.21, cos(phase * 0.8) * 1.35);
  p.y += cos(a) * radius * thickness;
  p.z += sin(a) * radius * (0.65 + 0.30 * gMid);
  p.y += sin(u * 2.0 - uBeatAge * 5.0) * exp(-uBeatAge * 1.5) * uAudioActive * uPunch * 0.25;
  p.xz *= rot(sin(uCruise * 0.13) * 0.22);
  p.y += 1.1 + sin(uTime * 3.0 + seed * 20.0) * 0.025;
  vec3 ro = vec3(0, 1.2, 7.5), at = vec3(0, 1.0, 0);
  vec3 f = normalize(at - ro), r = normalize(cross(f, vec3(0, 1, 0))), up = cross(r, f);
  vec3 v = p - ro;
  float z = dot(v, f);
  vec2 uv = vec2(dot(v, r), dot(v, up)) * 2.25 / z;
  gl_Position = vec4(uv / vec2(uRes.x / uRes.y, 1), 0, 1);
  gl_PointSize = clamp((8.0 + seed * 7.0) * 5.0 / z * uPointScale, 1.5, uPointMax);
  float flap = 0.5 + 0.48 * sin(uTime * (8.0 + gHigh * 8.0) + seed * 60.0);
  float tilt = 0.5 + 0.20 * cos(phase) + 0.08 * sin(a);
  vShape = floor(tilt * 127.0) + flap * 0.99;
  float fog = clamp((z - 5.0) / 9.0, 0.0, 0.5);
  vec3 c = mix(vec3(0.015, 0.021, 0.027), vec3(0.39, 0.25, 0.20), fog);
  c += vec3(0.08, 0.034, 0.009) * seed * gHigh;
  vColor = vec4(c, 0.91);
}`;
const pointFrag = `
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 v = p - a, w = b - a;
  return length(v - w * clamp(dot(v, w) / dot(w, w), 0.0, 1.0));
}
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float angle = (floor(vShape) / 127.0 - 0.5) * 2.5;
  p = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p;
  float flap = fract(vShape);
  float wing = mix(-0.60, 0.65, flap);
  vec2 q = vec2(abs(p.x), p.y);
  float d = min(segment(q, vec2(0, 0), vec2(0.42, -0.13)), segment(q, vec2(0.42, -0.13), vec2(0.93, wing)));
  d = min(d - 0.065, length(p * vec2(2.5, 1.0)) - 0.20);
  float alpha = (1.0 - smoothstep(-0.035, 0.085, d)) * vColor.a;
  outColor = vec4(vColor.rgb * alpha, alpha);
}`;
export default {
  id: 'murmuration', name: 'Murmuration', group: 'Vibe',
  blurb: 'Six thousand individual birds fold through a sunset sky; bass compresses the flock and treble changes the wingbeats',
  tags: ['3d', 'birds', 'flock', 'nature'], energy: 0.6, particles: 0, trails: 0, zoom: 1, spin: 0,
  frag, points: { count: 6000, vert, frag: pointFrag, blend: 'alpha' },
};
