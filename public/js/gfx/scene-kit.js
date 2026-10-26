// Geometry and lighting shared by the sculpted market scenes. Audio is explicitly
// gated: a stopped player may animate gently, but cannot invent bass or beat accents.
export const SCULPT = `
float gBass, gMid, gHigh, gHit;
void musicSignals() {
  gBass = uAudioActive * pow(clamp(uBass * 1.35, 0.0, 1.0), 0.85);
  gMid = uAudioActive * clamp(uMid * 1.5, 0.0, 1.0);
  gHigh = uAudioActive * clamp(uHigh * 1.65, 0.0, 1.0);
  gHit = uAudioActive * uBeat * uPunch;
}
float band(float x) { return uAudioActive * clamp(spec(x) * 1.5, 0.0, 1.0); }
float ellipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r), k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 0.00001);
}
float capsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 v = p - a, w = b - a;
  return length(v - w * clamp(dot(v, w) / dot(w, w), 0.0, 1.0)) - r;
}
float box3(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}
float torus(vec3 p, vec2 r) { return length(vec2(length(p.xz) - r.x, p.y)) - r.y; }
float cylinder(vec3 p, float r, float h) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
vec2 nearer(vec2 a, vec2 b) { return a.x < b.x ? a : b; }
vec3 viewRay(vec3 ro, vec3 at, vec2 uv, float lens) {
  vec3 f = normalize(at - ro), r = normalize(cross(f, vec3(0, 1, 0)));
  return normalize(r * uv.x + cross(r, f) * uv.y + f * lens);
}
vec3 lit(vec3 albedo, vec3 n, vec3 v, vec3 l, float rough, float metal) {
  vec3 h = normalize(l + v);
  float nl = max(dot(n, l), 0.0), nv = max(dot(n, v), 0.001);
  float nh = max(dot(n, h), 0.0), vh = max(dot(v, h), 0.0);
  float a = max(rough * rough, 0.02), a2 = a * a;
  float d = a2 / (PI * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
  float k = pow(rough + 1.0, 2.0) / 8.0;
  float g = nl / (nl * (1.0 - k) + k) * nv / (nv * (1.0 - k) + k);
  vec3 f = mix(vec3(0.045), albedo, metal);
  f += (1.0 - f) * pow(1.0 - vh, 5.0);
  vec3 ambient = mix(vec3(0.12, 0.14, 0.18), vec3(0.38, 0.40, 0.44), n.y * 0.5 + 0.5);
  return albedo * (ambient + nl * vec3(1.0, 0.91, 0.79) * (1.0 - metal * 0.7))
    + min(vec3(3.0), f * d * g / max(4.0 * nv, 0.02));
}
vec3 duskSky(vec3 rd, vec3 low, vec3 high) {
  vec3 c = mix(low, high, ss(-0.1, 0.8, rd.y));
  float s = max(dot(rd, normalize(vec3(-0.7, 0.35, -1.5))), 0.0);
  return c + vec3(1.0, 0.61, 0.28) * (0.28 * pow(s, 18.0) + 1.4 * pow(s, 900.0));
}
`;

// Signed-distance geometry: real perspective, surface normals, soft contact
// shadows, ambient occlusion and a microfacet highlight, within a bounded budget.
export function sculpted({ globals = '', map, material, camera, sky, steps = 72, far = 28, metal = '0.0', post = '' }) {
  return `${SCULPT}
${globals}
vec2 model(vec3 p) { ${map} }
vec3 skyColor(vec3 rd) { ${sky} }
vec4 surface(vec3 p, vec3 n, float id) { ${material} }
vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.001, -0.001);
  return normalize(e.xyy * model(p + e.xyy).x + e.yyx * model(p + e.yyx).x
    + e.yxy * model(p + e.yxy).x + e.xxx * model(p + e.xxx).x);
}
void main() {
  musicSignals();
  vec2 uv = centered();
  vec3 ro, rd;
  ${camera}
  float t = 0.0;
  vec2 hit = vec2(1.0, -1.0);
  bool found = false;
  for (int i = 0; i < ${steps}; i++) {
    hit = model(ro + rd * t);
    if (hit.x < 0.0012 * (1.0 + t * 0.12)) { found = true; break; }
    t += max(hit.x * 0.78, 0.001);
    if (t > ${Number(far).toFixed(1)}) break;
  }
  vec3 col = skyColor(rd);
  if (found) {
    vec3 p = ro + rd * t, n = normalAt(p), light = normalize(vec3(-0.65, 0.85, 0.55));
    vec4 mat = surface(p, n, hit.y);
    float shadow = 1.0, st = 0.035;
    for (int j = 0; j < 7; j++) {
      float d = model(p + n * 0.012 + light * st).x;
      shadow = min(shadow, 9.0 * d / st);
      st += clamp(d, 0.055, 0.42);
    }
    float ao = 1.0;
    for (int j = 1; j <= 2; j++) {
      float h = float(j) * 0.12;
      ao -= max(0.0, h - model(p + n * h).x) * (0.6 / float(j));
    }
    col = lit(mat.rgb, n, -rd, light, mat.a, ${metal}) * mix(0.4, 1.0, clamp(shadow, 0.0, 1.0)) * clamp(ao, 0.45, 1.0);
    col += skyColor(reflect(rd, n)) * pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * (0.1 + 0.45 * (1.0 - mat.a));
    col = mix(col, skyColor(rd), 1.0 - exp(-t * t * 0.0012));
    ${post}
  }
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;
}
