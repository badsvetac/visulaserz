import { SCULPT } from '../js/gfx/scene-kit.js';

// FENER — the back of a lamp shop in the Grand Bazaar after dark: Ottoman mosaic lamps hanging at
// every height and depth, each a globe of coloured glass chips set in brass, glowing like a jewel
// from the bulb inside, with the light they throw dappling the wall behind in their colours.
//
// Every lamp is solved exactly (a ray against its glass ellipsoid) and drawn through a lens: the
// ones at the focus are sharp to the last chip, the near and far ones go to soft discs of colour
// the way they would through a fast lens. They are painted from the back of the shop forwards, so
// a blurred near lamp lies softly over the sharp ones behind it. The wall's dapple is each lamp's
// own mosaic, seen from the wall.
//
// Music: the lamps lie across the spectrum from left to right, the bass on the left and the highs
// on the right, each glowing with its own slice; the highs also make single chips of glass flicker,
// the bass swings the chains a little, and a beat sends a wave of light from the front of the shop
// to the back.
const frag = `${SCULPT}
const int N = 24;
const float CAM_Z = 1.0;
const float FOCUS = 5.2;               // metres from the eye to the plane the lens is sharp at
const float APERTURE = 0.6;            // the lens opening, in metres
const float WALL = -11.5;
// the lamps hang in four layers going back: a few close by (soft, big), the main rank at the
// focus, and two ranks behind going to bokeh
const int LAYER_START[5] = int[5](0, 3, 11, 17, 24);
const float LAYER_Z[4] = float[4](-0.5, -3.9, -4.6, -8.5);
const float LAYER_R[4] = float[4](0.4, 0.5, 0.46, 0.36);

vec3 gRo, gRd;
float gPx;                              // a pixel's width at one metre

// a lamp: its centre, its half-sizes, which spectrum slice lights it
vec3 lampAt(int i, out vec3 size, out float bandX) {
  int layer = i < LAYER_START[1] ? 0 : i < LAYER_START[2] ? 1 : i < LAYER_START[3] ? 2 : 3;
  float f = float(i);
  float h1 = hash11(f * 3.17 + 0.5), h2 = hash11(f * 7.31 + 1.3), h3 = hash11(f * 1.97 + 2.9);
  float k = float(i - LAYER_START[layer]), count = float(LAYER_START[layer + 1] - LAYER_START[layer]);
  float z = LAYER_Z[layer] - h3 * 0.9;
  float halfW = (CAM_Z - z) / 1.6 * 1.7;                        // the half-width of the view at that depth
  float x = mix(-halfW, halfW, (k + 0.5 + (h1 - 0.5) * 0.7) / count);
  float y = mix(-0.25, 0.55, h2) * halfW * 0.95 + 0.25;
  if (layer == 0) {                                              // the near ones: low left, high right, low right
    x = k == 0.0 ? -1.5 : k == 1.0 ? 1.15 : 1.75;
    y = k == 0.0 ? -0.45 : k == 1.0 ? 1.45 : -0.75;
  }
  vec3 c = vec3(x, y, z);
  float kind = floor(hash11(f * 5.7 + 9.1) * 3.0);
  float r = LAYER_R[layer] * (0.8 + 0.45 * hash11(f * 2.3 + 4.4));
  size = kind < 0.5 ? vec3(r) : kind < 1.5 ? vec3(r * 0.84, r * 1.2, r * 0.84) : vec3(r * 1.12, r * 0.76, r * 1.12);
  bandX = 0.02 + 0.78 * clamp((x / halfW) * 0.5 + 0.5, 0.0, 1.0);
  // each hangs on its own chain and swings, a little more with the bass
  float phase = f * 1.7 + uTime * (0.5 + 0.1 * h1);
  c.x += sin(phase) * (0.02 + gBass * 0.05) * (1.0 + h2);
  c.z += cos(phase * 0.8) * (0.015 + gBass * 0.035);
  return c;
}
float lampLight(float bandX, float z) {
  float b = 0.6 + 1.25 * band(bandX);
  float wave = exp(-pow((-z - 3.0) - uBeatAge * 26.0, 2.0) * 0.1) * exp(-uBeatAge * 3.0);
  return b + gHit * wave * 1.1;
}
// glass colours: each lamp leans to one jewel tone, with chips of two others among it
vec3 jewel(float k) {
  k = fract(k);
  if (k < 0.17) return vec3(0.95, 0.10, 0.08);   // ruby
  if (k < 0.34) return vec3(0.08, 0.30, 1.0);    // cobalt
  if (k < 0.5) return vec3(0.08, 0.80, 0.30);    // emerald
  if (k < 0.67) return vec3(1.0, 0.52, 0.05);    // amber
  if (k < 0.84) return vec3(0.62, 0.15, 0.95);   // amethyst
  return vec3(0.04, 0.80, 0.86);                 // turquoise
}
vec3 chip(float seed, vec2 cell) {
  float h = hash21(cell + seed * 13.1);
  float base = hash11(seed * 4.7 + 0.3);
  float k = h < 0.6 ? base : h < 0.83 ? base + 0.34 : base + 0.67;
  vec3 c = jewel(k) * (0.65 + 0.7 * hash21(cell * 1.7 + seed));
  return mix(c, pal(k) * 1.1, 0.16);
}
vec3 lampTone(float seed) { return jewel(hash11(seed * 4.7 + 0.3)) * 0.7 + chip(seed, vec2(7.0, 3.0)) * 0.3; }
// The mosaic at a direction from a lamp's centre: x = 1 on glass, 0 on the brass between the
// pieces, yzw the piece's colour. It is laid in bands round the globe the way the lamp makers
// do it: a band of triangles making a zigzag, a band of diamonds, a band of round beads, each
// band in its own colour of the lamp's few, every piece a little different.
vec4 mosaic(vec3 n, float seed, float blur) {
  float lon = atan(n.z, n.x) / TAU + 0.5, lat = asin(clamp(n.y, -1.0, 1.0)) / PI + 0.5;
  float bands = 11.0;
  float bi = floor(lat * bands), bv = fract(lat * bands);
  float count = floor(28.0 + 20.0 * sin(lat * PI));              // fewer pieces towards the poles
  float u = lon * count + mod(bi, 2.0) * 0.5;
  float ui = floor(u), uf = fract(u);
  float style = mod(bi + floor(hash11(seed * 9.3) * 3.0), 3.0);
  float edge;
  vec2 cell = vec2(ui, bi);
  if (style < 0.5) {                                             // triangles: each cell cut on its diagonal
    float diag = uf - bv;
    cell.x += step(0.0, diag) * 0.5;
    edge = min(min(uf, 1.0 - uf), min(min(bv, 1.0 - bv), abs(diag) * 0.7071));
  } else if (style < 1.5) {                                      // diamonds
    vec2 q = vec2(uf - 0.5, bv - 0.5);
    edge = 0.5 - (abs(q.x) + abs(q.y));
    if (edge < 0.0) { cell += vec2(sign(q.x) * 0.5, sign(q.y) * 0.5); edge = -edge; }
  } else {                                                       // round beads
    vec2 q = vec2(uf - 0.5, (bv - 0.5) * 1.15);
    edge = 0.44 - length(q);
  }
  float tone = hash11(seed * 4.7 + 0.3) + mod(bi, 3.0) * 0.34 * step(0.35, hash11(seed * 2.1));
  vec3 c = jewel(tone + step(0.86, hash21(cell + seed)) * 0.5) * (0.65 + 0.7 * hash21(cell * 1.7 + seed));
  c = mix(c, pal(tone) * 1.1, 0.14);
  return vec4(ss(0.02, 0.07 + blur, edge), c);
}
// The same lamp out of focus: no pieces, no brass, just its bands of colour running into each other.
vec3 bandsOf(vec3 n, float seed) {
  float lat = asin(clamp(n.y, -1.0, 1.0)) / PI + 0.5;
  float x = lat * 11.0 - 0.5, bi = floor(x), f = ss(0.0, 1.0, fract(x));
  float base = hash11(seed * 4.7 + 0.3), many = step(0.35, hash11(seed * 2.1));
  vec3 a = jewel(base + mod(bi, 3.0) * 0.34 * many), b = jewel(base + mod(bi + 1.0, 3.0) * 0.34 * many);
  return mix(mix(a, b, f), pal(base) * 1.1, 0.14) * 0.8;
}

void main() {
  musicSignals();
  vec2 uv = centered();
  float drift = uTime * 0.05;
  gRo = vec3(sin(drift) * 0.6, 0.2 + sin(drift * 0.7) * 0.1, CAM_Z);
  gRd = viewRay(gRo, gRo + vec3(-sin(drift) * 0.15, 0.22, -4.0), uv, 1.6);
  gPx = 2.0 / (1.6 * uRes.y);

  // the back wall: old plaster, lit through every lamp's glass
  float tw = (WALL - gRo.z) / gRd.z;
  vec3 w = gRo + gRd * tw;
  vec3 dapple = vec3(0.0);
  for (int i = LAYER_START[2]; i < N; i++) {                     // only the back ranks are near enough
    vec3 size; float bx;
    vec3 c = lampAt(i, size, bx);
    // the bulb is not a point, so what reaches the wall is the lamp's bands, blurred
    vec3 toW = w - c;
    float dw = length(toW);
    dapple += bandsOf(toW / dw, float(i)) * lampLight(bx, c.z) * 2.6 / (1.0 + dw * dw * 0.3);
  }
  vec3 plaster = vec3(0.17, 0.13, 0.095) * (0.7 + 0.3 * fbm(w.xy * 0.35));
  vec3 col = plaster * (0.04 + dapple * 0.32);

  // the lamps, from the back of the shop forwards
  for (int i = N - 1; i >= 0; i--) {
    vec3 size; float bx;
    vec3 c = lampAt(i, size, bx);
    float L = lampLight(bx, c.z);
    float seed = float(i);
    float depth = length(c - gRo);
    // the lens's blur, as a fraction of the lamp's size: a thin lens blurs in proportion to how
    // far a thing stands from the plane of focus, whatever its distance
    float blur = APERTURE * abs(depth - FOCUS) / FOCUS;          // in metres at the lamp
    float soft = blur / size.x + gPx * depth / size.x * 1.5;

    // its chain, straight up out of the picture
    vec2 dxz = c.xz - gRo.xz, rxz = gRd.xz;
    float tc = dot(dxz, rxz) / dot(rxz, rxz);
    float yc = gRo.y + gRd.y * tc;
    float off = length(gRo.xz + rxz * tc - c.xz);
    float wire = 0.011 + blur * 0.5 + gPx * tc;
    float chain = ss(wire, wire * 0.4, off) * ss(c.y + size.y * 0.9, c.y + size.y * 1.05, yc);
    float link = 0.65 + 0.35 * abs(sin(yc * 55.0));
    vec3 brassLit = vec3(0.85, 0.62, 0.28) * (0.08 + 0.35 * L * exp(-(yc - c.y) * 0.9));
    col = mix(col, brassLit * link, chain * min(1.0, 0.012 / wire * 2.5));

    // the glass: the ray against the lamp's ellipsoid, in its own scaled space
    vec3 o = (gRo - c) / size, d = gRd / size;
    float a = dot(d, d), b = dot(o, d), cc = dot(o, o) - 1.0;
    float radial = sqrt(max(dot(o, o) - b * b / a, 0.0));       // how near the ray passes, in sizes
    vec3 tone = lampTone(seed);
    // the glow in the air round it, which also carries a blurred lamp's light
    col += tone * L * 0.05 * exp(-max(radial - 1.0, 0.0) * 2.2) / (1.0 + soft * 2.0);
    float cover = ss(1.0 + soft, 1.0 - soft, radial);
    if (cover <= 0.001) continue;
    float disc = max(b * b - a * cc, 0.0);
    float t = (-b - sqrt(disc)) / a;
    vec3 p = gRo + gRd * t;
    vec3 nl = normalize((p - c) / size);                          // where on the glass, for the pattern
    vec3 n = normalize(nl / size);
    float facing = max(dot(n, -gRd), 0.0);
    vec4 mo = mosaic(nl, seed, min(soft, 0.5));
    float cap = ss(0.70, 0.78, nl.y), foot = ss(-0.80, -0.87, nl.y);
    // the bulb shows through the thinnest glass: a hot heart in the middle of the globe
    float through = 0.35 + 0.65 * pow(facing, 1.4) + 1.3 * pow(facing, 12.0);
    vec2 chipCell = floor(vec2(atan(nl.z, nl.x) * 6.0, nl.y * 9.0));
    float flicker = gHigh * step(0.9, hash21(chipCell + floor(uTime * 8.0) * 1.37 + seed));
    vec3 glassCol = mo.yzw * L * through * (1.7 + flicker * 2.4);
    // far from the focus the pieces run together into the lamp's bands, and a blurred lamp spreads
    // the same light over a bigger disc, so its glow grows softer but not dimmer. The soft rim
    // outside the glass only ever shows the bands: the pieces would smear out into spikes there.
    float defocus = ss(0.08, 0.5, soft);
    float rim = ss(1.0 - soft * 0.4, 1.0 + soft * 0.2, radial);
    vec3 blurred = mix(bandsOf(nl, seed), tone * 0.8, rim) * L * (0.7 + 0.8 * facing) * 1.5;
    float detail = clamp(defocus + rim, 0.0, 1.0);
    glassCol = mix(glassCol, blurred, detail);
    mo.x = mix(mo.x, 1.0, detail);
    vec3 brass = vec3(0.85, 0.62, 0.28) * (0.1 + 0.5 * L * pow(facing, 2.0) * 0.35);
    brass += vec3(1.0, 0.82, 0.55) * pow(facing, 22.0) * 0.5;
    // a blurred lamp's brass melts into its glow the same way: no hard dark caps on a soft disc
    float metal = max(cap, foot) * (1.0 - detail * 0.85);
    vec3 surf = mix(brass * 0.4 + tone * L * 0.06, glassCol, mo.x * (1.0 - metal));
    surf = mix(surf, mix(brass, blurred * 0.5, detail), metal);
    vec3 spec = reflect(gRd, n);
    surf += vec3(1.0, 0.92, 0.8) * pow(max(dot(spec, normalize(vec3(-0.35, 0.8, 0.45))), 0.0), 48.0) * 0.6 / (1.0 + soft * 6.0);
    col = mix(col, surf, cover);
  }
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'fener', name: 'Fener', group: 'Things',
  blurb: 'Ottoman mosaic lamps in a Grand Bazaar shop, each a globe of glass chips glowing with its own band, dappling the wall in their colours',
  tags: ['3d', 'turkish', 'lamps', 'glass', 'bokeh', 'warm', 'colourful'],
  energy: 0.35, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
