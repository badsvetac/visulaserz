import { SCULPT } from '../js/gfx/scene-kit.js';

const frag = `${SCULPT}
void main() {
  musicSignals();
  vec2 uv = centered();
  vec3 ro = vec3(0, 1.45, 4.4), rd = viewRay(ro, vec3(0, 0.8, -5), uv, 1.9);
  vec3 col = duskSky(rd, vec3(0.66, 0.66, 0.39), vec3(0.11, 0.28, 0.35));
  float cloud = fbm(rd.xz * 3.0 / max(rd.y + 0.6, 0.15) + uCruise * 0.008);
  col += vec3(0.15, 0.12, 0.055) * ss(0.53, 0.8, cloud) * ss(0.01, 0.4, rd.y);
  if (rd.y < -0.005) {
    float t = -ro.y / rd.y;
    vec3 p = ro + rd * t;
    vec3 earth = mix(vec3(0.04, 0.11, 0.024), vec3(0.22, 0.28, 0.059), noise(p.xz * 2.0));
    col = mix(earth, col, 1.0 - exp(-t * 0.036));
  }
  outColor = vec4(col, 1);
}`;
const vert = `${SCULPT}
void main() {
  musicSignals();
  float id = float(gl_VertexID);
  float seed = hash11(id * 1.31 + 2.0);
  // Back-to-front depth order makes translucent blades and flowers overlap correctly.
  float z = mix(-25.0, 2.8, id / uPointCount);
  float x = (hash11(id * 4.71 + 1.0) - 0.5) * 27.0;
  float height = 0.4 + seed * 0.75;
  float gust = sin(x * 0.65 + z * 0.7 - uTravel * 1.5);
  float wind = gust * (0.12 + gBass * 0.32) + sin(z - uBeatAge * 4.0) * exp(-uBeatAge * 1.4) * uAudioActive * uPunch * 0.18;
  float flower = step(0.91, hash11(id * 6.71));
  float pollen = step(0.973, hash11(id * 8.61));
  vec3 p = vec3(x + wind * 0.5, height * 0.5, z);
  if (pollen > 0.5) { p.y += 0.7 + seed * 1.6 + sin(uTime * 0.7 + id) * 0.2; p.x += sin(uCruise + id) * 0.3; }
  vec3 ro = vec3(0, 1.45, 4.4), at = vec3(0, 0.8, -5);
  vec3 f = normalize(at - ro), r = normalize(cross(f, vec3(0, 1, 0))), up = cross(r, f);
  vec3 v = p - ro; float depth = dot(v, f);
  vec2 uv = vec2(dot(v, r), dot(v, up)) * 1.9 / max(depth, 0.1);
  gl_Position = vec4(uv / vec2(uRes.x / uRes.y, 1), 0, 1);
  gl_PointSize = clamp(height * 1.9 / max(depth, 0.1) * uRes.y, 2.0, uPointMax);
  float fog = 1.0 - exp(-depth * 0.028);
  vec3 c = mix(vec3(0.09, 0.22, 0.026), vec3(0.38, 0.43, 0.08), seed);
  c *= 0.83 + gMid * 0.28;
  c = mix(c, vec3(0.46, 0.48, 0.25), fog);
  vColor = vec4(c, 0.94);
  vShape = flower * 10.0 + seed * 2.0 + 3.0 + wind;
  if (pollen > 0.5) {
    vShape = 25.0;
    gl_PointSize = clamp((4.0 + gHigh * 8.0) * 4.0 / max(depth, 1.0) * uPointScale, 1.0, 10.0);
    vColor = vec4(0.9, 0.76, 0.37, 0.10 + gHigh * 0.7);
  }
}`;
const pointFrag = `
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  if (vShape > 20.0) {
    float a = exp(-dot(p, p) * 3.0) * vColor.a;
    outColor = vec4(vColor.rgb * a, a); return;
  }
  float flower = step(10.0, vShape), seed = fract(vShape * 3.71);
  float bend = mod(vShape, 10.0) - 4.0;
  float y = -p.y;
  float curve = bend * 0.22 * pow(clamp(y * 0.5 + 0.5, 0.0, 1.0), 2.0);
  float width = mix(0.039, 0.005, clamp(y * 0.5 + 0.5, 0.0, 1.0));
  float stem = 1.0 - smoothstep(width, width + 0.026, abs(p.x - curve));
  stem *= 1.0 - smoothstep(0.84, 0.96, abs(y));
  vec3 col = vColor.rgb;
  float alpha = stem;
  if (flower > 0.5) {
    vec2 q = p - vec2(bend * 0.22 * 0.81, -0.72);
    float a = atan(q.y, q.x), r = length(q);
    float petal = 0.11 + 0.05 * pow(abs(cos(a * 5.0)), 1.7);
    float bloom = 1.0 - smoothstep(petal, petal + 0.024, r);
    vec3 petalColor = seed > 0.5 ? vec3(0.93, 0.81, 0.49) : vec3(0.62, 0.46, 0.71);
    petalColor = mix(petalColor, vec3(0.66, 0.37, 0.035), 1.0 - smoothstep(0.025, 0.057, r));
    col = mix(col, petalColor, bloom);
    alpha = max(alpha, bloom);
  } else {
    float ear = abs(p.x - curve - sin(y * 85.0) * 0.033);
    alpha = max(alpha, (1.0 - smoothstep(0.013, 0.041, ear)) * smoothstep(0.25, 0.4, y) * (1.0 - smoothstep(0.68, 0.87, y)));
  }
  alpha *= vColor.a;
  outColor = vec4(col * alpha, alpha);
}`;
export default {
  id: 'meadow', name: 'Meadow', group: 'Vibe',
  blurb: 'A perspective field of twelve thousand grass blades and wildflowers; bass sends wind across the hills',
  tags: ['3d', 'grass', 'flowers', 'nature'], energy: 0.35, particles: 0, trails: 0, zoom: 1, spin: 0,
  frag, points: { count: 12000, vert, frag: pointFrag, blend: 'alpha' },
};
