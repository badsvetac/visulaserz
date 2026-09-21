// LATTICE — an endless corridor through a crystal of cubes.
//
// Space is tiled with cells and every cell holds one cube whose size and glow follow a band it
// picked at random, so the whole lattice breathes like a three-dimensional equaliser. The ray
// never steps past a cell wall without looking (neighbouring cubes differ in size, so the usual
// repeated distance field would lie), and after each beat a wall of light runs down the corridor.
const frag = `
const float CELL = 2.2;

float cellHash(vec3 c) { return hash21(c.xy + c.z * 17.17); }
float cellBand(vec3 c) { return spec(0.03 + fract(cellHash(c) * 7.31) * 0.8); }

void main() {
  vec2 p = rot(uTime * 0.05) * centered();
  p *= 1.0 - uBeat * 0.04 * uPunch;
  vec3 ro = vec3(0.0, 0.0, uCruise * 1.6);                 // x = y = 0 is a cell wall: the camera flies between the cubes
  vec3 rd = normalize(vec3(p, 1.5));
  rd.xz = rot(0.25 * sin(uTime * 0.13) + uBalance * 0.2) * rd.xz;
  rd.yz = rot(0.18 * sin(uTime * 0.11)) * rd.yz;
  rd += 1e-5;
  vec3 fogCol = pal(0.62) * 0.05;

  float t = 0.0, glow = 0.0;
  bool hit = false;
  vec3 c = vec3(0.0), l = vec3(0.0);
  float size = 0.0;
  for (int i = 0; i < 80; i++) {
    vec3 q = ro + rd * t;
    c = floor(q / CELL);
    l = q - (c + 0.5) * CELL;
    size = 0.13 + 0.36 * cellBand(c) + 0.06 * uBeat * uPunch;
    vec3 dd = abs(l) - size;
    float d = length(max(dd, 0.0)) + min(max(dd.x, max(dd.y, dd.z)), 0.0) - 0.04;
    glow += exp(-max(d, 0.0) * 6.0) * 0.010;
    if (d < 0.003) { hit = true; break; }
    vec3 tb = (sign(rd) * CELL * 0.5 - l) / rd;            // how far to this cell's wall
    t += min(d * 0.9, min(tb.x, min(tb.y, tb.z)) + 0.01);
    if (t > 28.0) break;
  }

  vec3 col = fogCol;
  if (hit) {
    float h = cellHash(c);
    float s = cellBand(c);
    vec3 a = abs(l) / (size + 0.04);
    float e = max(min(a.x, a.y), max(min(a.y, a.z), min(a.x, a.z)));      // → 1 along the twelve edges
    float edge = ss(0.80, 0.97, e);
    vec3 n = a.x > a.y && a.x > a.z ? vec3(sign(l.x), 0.0, 0.0) : (a.y > a.z ? vec3(0.0, sign(l.y), 0.0) : vec3(0.0, 0.0, sign(l.z)));
    float diff = max(dot(n, normalize(vec3(0.3, 0.6, -0.7))), 0.0);
    float runner = exp(-abs((c.z + 0.5) * CELL - ro.z - uBeatAge * 22.0) * 0.5) * exp(-uBeatAge * 1.8) * uPunch;
    vec3 base = pal(h * 0.6 + c.z * 0.013 + uTime * 0.01);
    col = base * (0.02 + 0.14 * diff * (0.3 + s)) + base * edge * (0.5 + 2.2 * s + 1.5 * runner) + base * s * s * 0.22;
    col = mix(col, fogCol, 1.0 - exp(-t * 0.085));
  }
  col += pal(0.6 + uTime * 0.01) * glow * (0.4 + uBass);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'lattice',
  name: 'Lattice',
  group: 'Show',
  blurb: 'Corridor of glowing cubes breathing like a 3D equaliser; a light wall on beats',
  tags: ['3d', 'geometric', 'abstract'],
  energy: 0.65,
  particles: 0,
  trails: 0.35,
  zoom: 1,
  spin: 0,
  frag,
};
