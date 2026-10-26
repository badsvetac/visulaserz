import { SCULPT } from '../js/gfx/scene-kit.js';

const frag = `${SCULPT}
float waterHeight(vec2 p) {
  float h = sin(p.x * 3.3 + uTravel * 1.6) * sin(p.y * 2.7 - uCruise) * (0.015 + gBass * 0.055);
  h += sin(p.x * 9.0 + p.y * 6.0 - uTime * 2.0) * (0.003 + gHigh * 0.01);
  float r = length(p - vec2(0.3, 0.1));
  h += sin(r * 14.0 - uBeatAge * 12.0) * exp(-pow(r - uBeatAge * 1.8, 2.0) * 3.0) * exp(-uBeatAge * 1.8) * uAudioActive * uPunch * 0.035;
  return h;
}
vec3 ringSpace(vec3 p) {
  p -= vec3(0.3 + sin(uCruise * 0.2) * 0.3, 0.06 + gBass * 0.10, 0.1);
  p.yz *= rot(0.13 + sin(uCruise * 0.7) * 0.09 + gHit * 0.13);
  p.xz *= rot(uCruise * 0.08); return p;
}
vec2 objects(vec3 p) {
  vec2 d = vec2(torus(ringSpace(p), vec2(0.57, 0.17)), 1);
  for (int i = 0; i < 2; i++) {
    float x = -1.4 + float(i) * 0.48;
    d = nearer(d, vec2(capsule(p, vec3(x, -0.85, -2.3), vec3(x, 0.5, -2.3), 0.028), 2));
    d = nearer(d, vec2(torus((p - vec3(x, 0.5, -2.47)).zyx, vec2(0.17, 0.027)), 2));
  }
  for (int i = 0; i < 3; i++) {
    float y = -0.18 - float(i) * 0.26;
    d = nearer(d, vec2(capsule(p, vec3(-1.4, y, -2.3), vec3(-0.92, y, -2.3), 0.025), 2));
  }
  return d;
}
vec3 sky(vec3 rd) { return duskSky(rd, vec3(0.39, 0.61, 0.65), vec3(0.09, 0.29, 0.51)); }
void main() {
  musicSignals();
  vec2 uv = centered();
  vec3 ro = vec3(3.4 + sin(uCruise * 0.07) * 0.18, 3.65, 5.2);
  vec3 rd = viewRay(ro, vec3(0, -0.3, 0), uv, 2.1);
  vec3 col = sky(rd);
  float waterT = rd.y < -0.005 ? -ro.y / rd.y : 80.0;
  vec3 water = ro + rd * waterT;
  bool inside = max(abs(water.x) / 2.25, abs(water.z) / 3.15) < 1.0;
  if (rd.y < -0.005) {
    if (inside) {
      float e = 0.015;
      vec3 n = normalize(vec3(waterHeight(water.xz - vec2(e, 0)) - waterHeight(water.xz + vec2(e, 0)), e * 2.0,
        waterHeight(water.xz - vec2(0, e)) - waterHeight(water.xz + vec2(0, e))));
      vec3 ray = refract(rd, n, 0.75);
      float depth = (-1.3 - water.y) / ray.y;
      float sideX = ((ray.x > 0.0 ? 2.25 : -2.25) - water.x) / ray.x;
      float sideZ = ((ray.z > 0.0 ? 3.15 : -3.15) - water.z) / ray.z;
      float travel = min(depth, min(sideX, sideZ));
      vec3 bottom = water + ray * travel;
      vec2 tileUV = depth <= min(sideX, sideZ) ? bottom.xz : sideX < sideZ ? bottom.zy : bottom.xy;
      vec2 tile = fract(tileUV * 9.0), cell = floor(tileUV * 9.0);
      float grout = step(min(min(tile.x, tile.y), min(1.0 - tile.x, 1.0 - tile.y)), 0.055);
      vec3 mosaic = mix(vec3(0.12, 0.44, 0.53), vec3(0.32, 0.67, 0.68), hash21(cell));
      mosaic = mix(mosaic, vec3(0.49, 0.67, 0.64), grout * 0.8);
      float caustic = sin(bottom.x * 8.0 + sin(bottom.z * 6.0 + uTravel)) + sin(bottom.z * 9.0 + sin(bottom.x * 5.0 - uTravel * 0.7));
      float rays = pow(max(0.0, 1.0 - abs(caustic) * 1.8), 0.7);
      mosaic *= 0.70 + rays * (0.38 + gMid * 0.34);
      float shade = exp(-pow((length(bottom.xz - vec2(0.05, -0.05)) - 0.57) * 6.0, 2.0));
      mosaic *= 1.0 - shade * 0.24;
      col = mix(mosaic, vec3(0.016, 0.23, 0.29), clamp(travel * 0.17, 0.0, 0.6));
      float fresnel = 0.025 + 0.72 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
      col = mix(col, sky(reflect(rd, n)), fresnel);
      col += vec3(0.7, 0.84, 0.8) * pow(max(dot(reflect(rd, n), normalize(vec3(-0.6, 0.8, 0.3))), 0.0), 100.0) * (0.15 + gHigh * 0.65);
    } else {
      float edge = min(abs(abs(water.x) - 2.25), abs(abs(water.z) - 3.15));
      vec2 tile = fract(water.xz * 1.5);
      float grout = step(min(min(tile.x, tile.y), min(1.0 - tile.x, 1.0 - tile.y)), 0.015);
      col = vec3(0.56, 0.51, 0.38) * (0.88 + noise(water.xz * 50.0) * 0.12 - grout * 0.25);
      col += vec3(0.16, 0.15, 0.11) * ss(0.18, 0.04, edge);
      col = mix(col, sky(rd), 1.0 - exp(-waterT * waterT * 0.001));
    }
  }
  float t = 0.0; vec2 hit = vec2(1); bool found = false;
  for (int i = 0; i < 64; i++) {
    hit = objects(ro + rd * t);
    if (hit.x < 0.002) { found = true; break; }
    t += max(hit.x * 0.82, 0.002);
    if (t > min(waterT + (inside ? 1.0 : 0.0), 18.0)) break;
  }
  if (found) {
    vec3 p = ro + rd * t;
    vec2 e = vec2(0.002, 0);
    vec3 n = normalize(vec3(objects(p + e.xyy).x - objects(p - e.xyy).x, objects(p + e.yxy).x - objects(p - e.yxy).x, objects(p + e.yyx).x - objects(p - e.yyx).x));
    vec3 q = ringSpace(p);
    float stripe = step(0.5, fract(atan(q.z, q.x) / TAU * 12.0));
    vec3 color = mix(vec3(0.83, 0.14, 0.09), vec3(0.89, 0.81, 0.59), stripe);
    if (hit.y > 1.5) color = vec3(0.63, 0.7, 0.72);
    col = lit(color, n, -rd, normalize(vec3(-0.65, 0.85, 0.55)), hit.y > 1.5 ? 0.16 : 0.25, hit.y > 1.5 ? 0.85 : 0.0);
    col += sky(reflect(rd, n)) * pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * 0.35;
    if (p.y < 0.0) col = mix(col, vec3(0.018, 0.28, 0.32), 0.3);
  }
  outColor = vec4(col, 1);
}`;
export default {
  id: 'pool', name: 'Pool', group: 'Things',
  blurb: 'A tiled three-dimensional pool with refracted caustics, a striped float and bass-driven waves',
  tags: ['3d', 'water', 'summer', 'reflections'], energy: 0.5, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
