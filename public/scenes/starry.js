import { SCULPT } from '../js/gfx/scene-kit.js';

// YILDIZLI GECE — a starry night painted in thick strokes, after Van Gogh: the sky one great wind
// winding round a double spiral, every star and the moon wrapped in rings of its own light,
// rolling hills, a sleeping village under its steeple, and the cypress burning up dark in front.
//
// Every stroke is laid along the way the paint moves. The open sky is a waving wind of long rows;
// the two spirals and the halo round every light are painted in their own polar rows, each ring
// cut into a whole number of strokes so it closes on itself without a seam. Strokes are dabs of
// paint scattered along those rows, each its own length, width and colour, laid over its
// neighbours in no particular order, with the underpainting showing in the gaps; where two kinds
// of row meet, the edge is decided stroke by stroke, so it frays. Sliding the strokes along their
// rows makes the paint flow.
//
// Music: the bass speeds the wind and the spirals and sways the cypress; the mids light the
// village windows and the moon; the highs make the stars glitter; each beat sends a ring of light
// out through every halo.
const frag = `${SCULPT}
const int STARS = 9;
const vec2 STAR[9] = vec2[9](vec2(-1.02, 0.58), vec2(-0.6, 0.8), vec2(-0.2, 0.62), vec2(0.5, 0.74), vec2(0.88, 0.5),
  vec2(1.1, 0.2), vec2(-0.86, 0.2), vec2(0.62, 0.1), vec2(-0.32, 0.08));
const float STAR_R[9] = float[9](0.16, 0.12, 0.14, 0.17, 0.15, 0.12, 0.13, 0.12, 0.11);
const vec2 MOON = vec2(1.38, 0.7);
const vec2 SWIRL = vec2(0.1, 0.34), SWIRL2 = vec2(-0.46, 0.4);

float gFlow, gSpin;

// One dab of paint at a point of a stroke grid, (along, across) in stroke units: the dab whose
// ellipse covers the point and lies on top. Returns the dab's id in xy, its depth of paint in z
// (0 in a gap), and how far along it the point is in w.
vec4 dab(float along, float across, float seed, float wrap) {
  vec4 best = vec4(0.0, 0.0, 0.0, 0.0);
  float top = -1.0;
  vec2 cell = floor(vec2(along, across));
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      vec2 c = cell + vec2(float(dx), float(dy));
      vec2 key = vec2(wrap > 0.0 ? mod(c.x, wrap) : c.x, c.y) + seed;
      float h1 = hash21(key), h2 = hash21(key + 5.1), h3 = hash21(key + 9.7), h4 = hash21(key + 13.3);
      vec2 centre = c + 0.5 + vec2(h1 - 0.5, (h2 - 0.5) * 0.5);
      vec2 d = vec2(along, across) - centre;
      float halfL = 0.8 + 0.55 * h3, halfW = 0.46 + 0.22 * h4;
      d.y += d.x * d.x * (h1 - 0.5) * 0.12;                           // a slight curve in the brush's path
      float e = length(vec2(d.x / halfL, d.y / halfW));
      float taper = 1.0 - 0.35 * ss(0.3, 1.0, abs(d.x / halfL));      // thinner at its ends
      e /= taper;
      if (e < 1.0) {
        float order = hash21(key + 21.0);
        if (order > top) {
          top = order;
          float bristle = 0.5 + 0.5 * sin(d.y / halfW * 9.0 + h2 * 20.0);
          best = vec4(key, (1.0 - e * e) * (0.75 + 0.25 * bristle), d.x / halfL);
        }
      }
    }
  }
  return best;
}

// The blues of the night sky: each dab a little different, a pale or a white one now and then.
vec3 nightBlue(vec2 p, vec2 key) {
  float region = fbm(p * 1.8 + 3.0);
  float h = hash21(key + 1.7), h2 = hash21(key + 4.4);
  vec3 deep = vec3(0.05, 0.11, 0.34), mid = vec3(0.11, 0.28, 0.64), pale = vec3(0.38, 0.56, 0.84);
  vec3 c = mix(deep, mid, ss(0.25, 0.7, region + (h - 0.5) * 0.5));
  if (h2 > 0.86) c = mix(pale, vec3(0.72, 0.82, 0.84), h);
  return c * (0.92 + 0.16 * h2);
}

float hillsTop(float x) { return -0.3 + 0.07 * sin(x * 1.6 + 0.6) + 0.035 * sin(x * 3.7 - 0.8) + 0.02 * sin(x * 7.3); }

void main() {
  musicSignals();
  vec2 uv = centered();
  gFlow = uTime * 0.2 + uTravel * 0.14 * uAudioActive;
  gSpin = uTime * 0.05 + uTravel * 0.04 * uAudioActive;

  vec3 col;
  float lift = 0.0;
  float top = hillsTop(uv.x);
  if (uv.y > top) {
    // the underpainting, showing wherever the strokes leave a gap
    col = mix(vec3(0.06, 0.13, 0.36), vec3(0.1, 0.22, 0.5), fbm(uv * 2.0)) * 0.85;
    // the open sky: dabs along a wind that waves from left to right
    {
      float across = (uv.y + 0.11 * sin(uv.x * 2.1 + 0.3) + 0.05 * sin(uv.x * 4.6 + uv.y * 3.2) + 0.035 * sin(uv.y * 7.0 + uv.x * 1.3)) * 30.0;
      float along = uv.x * 9.0 - gFlow * 1.6;
      vec4 s = dab(along, across, 1.0, 0.0);
      if (s.z > 0.0) { col = nightBlue(uv, s.xy); lift = s.z; }
    }
    // the two spirals: rows winding in to the centre, painted paler and greener
    for (int k = 0; k < 2; k++) {
      vec2 c = k == 0 ? SWIRL : SWIRL2;
      float arms = k == 0 ? 2.0 : 1.0, tight = k == 0 ? 6.0 : 7.0, dir = k == 0 ? 1.0 : -0.8;
      vec2 d = uv - c;
      float r = length(d), th = atan(d.y, d.x) / TAU;
      float w = ss(0.44, 0.1, r);
      if (w <= 0.0) continue;
      float across = log(r + 0.02) * tight + th * arms;
      float rr = exp((floor(across) + 0.5 - th * arms) / tight);
      float perTurn = max(3.0, floor(TAU * rr * 10.0));
      float along = th * perTurn - gSpin * dir * perTurn * 0.6;
      along = mod(along, perTurn);
      vec4 s = dab(along, across, 5.0 + float(k) * 3.0, perTurn);
      float h = hash21(s.xy + 2.0);
      if (s.z > 0.0 && w > h * 0.85 + 0.08) {
        float hh = hash21(s.xy + 6.0);
        vec3 swirl = mix(vec3(0.22, 0.44, 0.76), vec3(0.6, 0.76, 0.84), hh);
        if (hh > 0.88) swirl = vec3(0.84, 0.88, 0.76);
        col = swirl * (1.0 + gBass * 0.12);
        lift = s.z;
      }
    }
    // a halo round every light: rings of yellow and cream going out into the sky's own blues
    for (int i = 0; i < STARS + 1; i++) {
      vec2 c = i < STARS ? STAR[i] : MOON;
      float radius = i < STARS ? STAR_R[i] : 0.3;
      vec2 d = uv - c;
      float r = length(d) / radius;
      if (r > 1.05) continue;
      float th = atan(d.y, d.x) / TAU;
      float across = r * 4.2;
      float row = floor(across);
      float perTurn = max(5.0, floor(TAU * (row + 0.5) * 1.9));
      float spin = gSpin * (0.3 + 0.4 * hash11(row + float(i))) * (hash11(row * 2.0 + float(i)) < 0.5 ? -1.0 : 1.0);
      float along = mod(th * perTurn + spin * perTurn, perTurn);
      vec4 s = dab(along, across, 30.0 + float(i) * 7.0, perTurn);
      float w = ss(1.0, 0.7, r);
      float h = hash21(s.xy + 3.0);
      if (s.z > 0.0 && w > h * 0.5 + 0.3) {
        float k = r;
        float hh = hash21(s.xy + 8.0);
        vec3 yellow = mix(vec3(0.97, 0.8, 0.22), vec3(1.0, 0.93, 0.58), hh);
        vec3 c2 = mix(yellow, mix(vec3(0.45, 0.62, 0.8), yellow, hh * 0.6), ss(0.35, 0.95, k));
        if (mod(row, 2.0) > 0.5 && k > 0.45) c2 = mix(c2, vec3(0.66, 0.76, 0.74), 0.45);
        float tw = 1.0 + gHigh * 0.45 * sin(uTime * 10.0 + float(i) * 2.1) * (1.0 - k);
        if (i == STARS) tw *= 1.0 + gMid * 0.15;
        col = c2 * tw;
        lift = s.z;
      }
      // the beat: a ring of light leaving the heart
      col += vec3(1.0, 0.9, 0.5) * exp(-pow(r - uBeatAge * 2.6, 2.0) * 60.0) * exp(-uBeatAge * 4.0) * gHit * w * 0.7;
    }
    // the moon: a crescent of thick orange-yellow paint, ringed in a darker line
    vec2 m = uv - MOON;
    float outer = ss(0.108, 0.1, length(m)) * ss(0.066, 0.074, length(m - vec2(-0.04, 0.026)));
    float crescent = ss(0.1, 0.092, length(m)) * ss(0.072, 0.082, length(m - vec2(-0.04, 0.026)));
    col = mix(col, vec3(0.62, 0.4, 0.12), outer * 0.8);
    col = mix(col, vec3(1.0, 0.78, 0.22) * (1.2 + gMid * 0.25), crescent);
    // the star hearts: dabs of white with a yellow rim
    for (int i = 0; i < STARS; i++) {
      float r = length(uv - STAR[i]) / STAR_R[i];
      float pulse = 1.0 + gHigh * 0.6 * sin(uTime * 11.0 + float(i));
      col = mix(col, vec3(1.0, 0.92, 0.52) * pulse, ss(0.3, 0.24, r));
      col = mix(col, vec3(1.0, 0.99, 0.9) * pulse * 1.2, ss(0.17, 0.12, r));
    }
  } else {
    // the hills: rolling rows of blue-green paint
    col = vec3(0.06, 0.14, 0.22);
    float across = (uv.y - top) * 26.0 + 0.6 * sin(uv.x * 3.0) + noise(uv * 4.0) * 0.5;
    float along = uv.x * 8.0 + 0.6 * sin(uv.y * 8.0);
    vec4 s = dab(along, across, 3.0, 0.0);
    if (s.z > 0.0) {
      float h = hash21(s.xy + 1.0);
      vec3 c = mix(vec3(0.07, 0.17, 0.27), vec3(0.15, 0.32, 0.38), ss(0.2, 0.9, h + fbm(uv * 3.0) - 0.5));
      col = mix(c, vec3(0.04, 0.1, 0.12), ss(-0.45, -0.85, uv.y));
      lift = s.z;
    }
    // the village: houses with lit windows, outlined in dark paint
    float vx = uv.x, vy = uv.y;
    if (vx > -0.85 && vx < 1.55 && vy < top - 0.02 && vy > -0.82) {
      float cell = floor((vx + 0.85) / 0.1);
      float cx = -0.85 + (cell + 0.5) * 0.1 + (hash11(cell) - 0.5) * 0.03;
      float base = -0.64 + 0.2 * hash11(cell * 3.1) - 0.1 * ss(0.4, 1.4, abs(vx - 0.3));
      float hgt = 0.045 + 0.05 * hash11(cell * 5.7);
      float wid = 0.032 + 0.018 * hash11(cell * 2.3);
      // drawn by hand: every edge wobbles a little, the walls are dabs of paint
      vec2 q = vec2(vx - cx, vy - base) + (vec2(noise(uv * 90.0), noise(uv * 90.0 + 7.0)) - 0.5) * 0.006;
      float roof = hgt + (wid - abs(q.x)) * (0.5 + 0.6 * hash11(cell * 8.2));
      float house = step(abs(q.x), wid) * step(0.0, q.y) * step(q.y, roof);
      float inner = step(abs(q.x), wid - 0.008) * step(0.008, q.y) * step(q.y, roof - 0.009);
      float win = step(abs(q.x - (hash11(cell * 9.1) - 0.5) * wid), 0.011) * step(abs(q.y - hgt * 0.45), 0.012) * step(0.35, hash11(cell * 4.4));
      vec4 ws = dab(uv.x * 70.0, uv.y * 90.0, 41.0, 0.0);
      vec3 wall = mix(vec3(0.12, 0.2, 0.32), vec3(0.22, 0.32, 0.38), hash21(ws.xy + 1.0) * 0.7 + hash11(cell * 7.7) * 0.3);
      if (roof - q.y < 0.022 && q.y > hgt * 0.8) wall = mix(vec3(0.16, 0.26, 0.32), vec3(0.3, 0.36, 0.34), hash21(ws.xy));   // the roofs a shade lighter
      col = mix(col, wall, house);
      col = mix(col, vec3(0.02, 0.04, 0.09), (house - inner) * 0.9);
      float glow = 0.8 + 0.6 * band(0.18 + 0.4 * hash11(cell * 6.1)) + 0.25 * gMid;
      col = mix(col, vec3(1.0, 0.82, 0.3) * glow, win);
      if (house > 0.0) lift = mix(lift, ws.z * 0.6, house);
    }
    // the church: a long nave and a tall spire just left of the middle
    vec2 c2 = uv - vec2(0.12, -0.6);
    float nave = step(abs(c2.x), 0.075) * step(0.0, c2.y) * step(c2.y, 0.07);
    float spire = step(abs(c2.x + 0.04), 0.02 * (1.0 - (c2.y - 0.07) / 0.28)) * step(0.07, c2.y) * step(c2.y, 0.35);
    col = mix(col, vec3(0.06, 0.1, 0.2), max(nave, spire));
  }

  // the cypress: dark flames of paint climbing out of the ground, swaying with the bass
  float sway = sin(uv.y * 3.0 - uTime * 0.7) * (0.012 + 0.03 * gBass) * ss(-0.9, 0.9, uv.y);
  float cx = -1.28 + sway;
  float flick = sin(uv.y * 13.0 + 1.3) * sin(uv.y * 5.0 + uTime * 0.4) * 0.3 + sin(uv.y * 27.0) * 0.12;
  float halfW = (0.18 - 0.13 * ss(-0.9, 0.85, uv.y)) * (0.85 + flick);
  float tipY = 0.88 + 0.03 * sin(uTime * 0.5);
  float tree = ss(halfW + 0.01, halfW - 0.01, abs(uv.x - cx)) * ss(tipY, tipY - 0.06, uv.y);
  if (tree > 0.0) {
    float across = (uv.x - cx) * 34.0 + sin(uv.y * 7.0 + uTime * 0.6) * 1.5;
    float along = uv.y * 6.0 - (uv.x - cx) * 3.0 - gFlow * 0.4;
    vec4 s = dab(along, across, 9.0, 0.0);
    float h = hash21(s.xy + 1.0);
    vec3 c = h < 0.55 ? vec3(0.025, 0.05, 0.04) : h < 0.88 ? vec3(0.06, 0.12, 0.075) : vec3(0.2, 0.19, 0.1);
    if (s.z <= 0.0) c = vec3(0.02, 0.035, 0.03);
    col = mix(col, c, tree);
    lift = mix(lift, s.z, tree);
  }

  // the paint stands up off the canvas: its ridges catch the light, its gaps sit back
  col *= 0.8 + 0.3 * lift;
  col *= 0.95 + 0.05 * (sin(gl_FragCoord.x * 2.2) * sin(gl_FragCoord.y * 2.2) * 0.5 + 0.5);
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'starry', name: 'Yıldızlı Gece', group: 'Vibe',
  blurb: 'A starry night in thick flowing brush strokes, after Van Gogh: the sky winds round a double spiral and every star throws rings of light on the beat',
  tags: ['painting', 'van gogh', 'stars', 'night', 'swirl', 'art', 'calm'],
  energy: 0.35, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
