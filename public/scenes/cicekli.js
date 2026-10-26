import { SCULPT } from '../js/gfx/scene-kit.js';

// ÇİÇEKLİ GÖKYÜZÜ — the sky of Bikini Bottom: a bright aqua sky that is really the sea, lit from
// the surface above, with light shafts slanting down through it, the shimmer of the waves on the
// top, motes drifting, and the famous flower clouds: pastel flowers with rounded petals, a paler
// flower inside each and a soft darker rim, drifting slowly across in three depths, the far ones
// small and pale in the blue, the near ones big and bright.
//
// Music: every flower breathes with its own band of the spectrum, opening and brightening on it;
// the bass brightens the light shafts and sways them; the highs make the shimmer under the
// surface sparkle; on every beat all the flowers turn a step, half one way and half the other,
// like a dance, and a few bubbles burst up from below.
const frag = `${SCULPT}
float gPx, gAsp;
const vec3 PETAL[6] = vec3[6](vec3(1.0, 0.56, 0.80), vec3(0.70, 0.54, 1.0), vec3(0.46, 0.90, 0.60),
                              vec3(1.0, 0.88, 0.38), vec3(0.62, 0.8, 1.0), vec3(1.0, 0.55, 0.47));
const vec3 HEART[6] = vec3[6](vec3(1.0, 0.86, 0.95), vec3(0.88, 0.82, 1.0), vec3(0.82, 1.0, 0.86),
                              vec3(1.0, 0.98, 0.80), vec3(0.97, 1.0, 1.0), vec3(1.0, 0.86, 0.78));

// the sea as sky: pale where the light comes in from above, deep blue below
vec3 water(float y) {
  vec3 c = mix(vec3(0.05, 0.31, 0.64), vec3(0.15, 0.6, 0.9), ss(-1.15, 0.05, y));
  return mix(c, vec3(0.45, 0.87, 0.99), ss(0.0, 1.15, y));
}
// a cartoon flower in its own units (radius about 1): round petals with deep notches between
float flowerD(vec2 p, float petals) {
  float k = abs(cos(atan(p.y, p.x) * petals * 0.5));
  return length(p) - (0.58 + 0.42 * sqrt(k));
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  vec3 col = water(uv.y);

  // light shafts slanting down from the surface, swaying, brighter with the bass
  float sx = (uv.x + uv.y * 0.32) * 2.6;
  float shaft = ss(0.52, 0.92, noise(vec2(sx + uTime * 0.05, 3.1)) * 0.7 + noise(vec2(sx * 2.3 - uTime * 0.07, 9.2)) * 0.3);
  shaft *= ss(-1.2, 0.9, uv.y) * (0.55 + 0.45 * sin(uTime * 0.6 + sx));
  col += vec3(0.75, 0.97, 1.0) * shaft * (0.09 + 0.26 * gBass);
  // the shimmer of the waves under the surface, sparkling with the highs
  vec2 cq = uv * vec2(3.2, 5.0) + vec2(uTime * 0.06, uTime * 0.11);
  float caustic = pow(1.0 - abs(noise(cq) * 2.0 - 1.0), 6.0) + pow(1.0 - abs(noise(cq * 1.7 + 4.0) * 2.0 - 1.0), 8.0);
  col += vec3(0.85, 1.0, 1.0) * caustic * ss(0.45, 1.0, uv.y) * (0.04 + 0.18 * gHigh);
  // motes drifting up through the water
  for (int k = 0; k < 2; k++) {
    vec2 g = vec2(uv.x * 18.0 + float(k) * 7.0, uv.y * 18.0 - uTime * (0.4 + 0.3 * float(k)));
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + float(k) * 13.0);
    if (h < 0.06) col += vec3(0.85, 1.0, 1.0) * exp(-dot(f, f) * 140.0) * 0.18 * (0.5 + h * 8.0);
  }

  // every beat turns each flower a step: the count of beats is the angle, so it needs no memory
  float steps = uBeatCount + (uAudioActive > 0.5 ? ss(0.0, 0.22, uBeatAge) : 0.0);
  // three depths of flowers, painted far to near
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    int count = L == 0 ? 15 : L == 1 ? 10 : 6;
    float baseSize = L == 0 ? 0.058 : L == 1 ? 0.115 : 0.215;
    float speed = L == 0 ? 0.011 : L == 1 ? 0.02 : 0.034;
    for (int i = 0; i < 15; i++) {
      if (i >= count) break;
      float fi = float(i) + fl * 31.0;
      float h1 = hash11(fi * 1.37 + 0.11), h2 = hash11(fi * 2.91 + 0.7), h3 = hash11(fi * 4.13 + 0.3), h4 = hash11(fi * 7.77 + 0.9);
      float b = band(0.04 + 0.8 * h4);                                   // this flower's band
      float size = baseSize * (0.72 + 0.62 * h3) * (1.0 + 0.16 * b);
      float span = 2.0 * gAsp + 0.9;
      vec2 c = vec2(mod(h1 * span + uTime * speed * (0.7 + 0.6 * h4), span) - span * 0.5,
                    -0.92 + 1.86 * fract(h2 + fl * 0.37) + 0.025 * sin(uTime * 0.33 + fi));
      if (length(uv - c) > size * 1.08) continue;
      float petals = 5.0 + floor(h3 * 3.0);
      float ang = h1 * TAU + uTime * (h3 - 0.5) * 0.12 + (h2 > 0.5 ? 1.0 : -1.0) * 0.32 * steps;
      vec2 p = rot(ang) * (uv - c) / size;
      float soft = L == 0 ? 1.8 : 1.0;                                   // the far ones a little out of focus
      float aa = gPx * soft / size;
      float d = flowerD(p, petals);
      float body = ss(aa, -aa, d);
      if (body <= 0.0) continue;
      int pick = int(floor(fract(h2 * 7.3 + h1) * 6.0));
      vec3 ca = PETAL[pick], cb = HEART[pick];
      float din = flowerD(rot(PI / petals) * p / 0.52, petals) * 0.52;   // the paler flower inside
      float inner = ss(aa, -aa, din);
      float r = length(p);
      vec3 fc = ca * (0.88 + 0.16 * ss(1.0, 0.1, r));                      // a soft swell towards the middle
      fc = mix(ca * vec3(0.6, 0.62, 0.72), fc, ss(0.02, 0.1, -d));         // the darker rim, as drawn
      fc = mix(fc, cb * (0.95 + 0.08 * ss(0.5, 0.0, r)), inner * 0.92);
      fc = mix(fc, ca * 1.04, ss(0.12 + aa, 0.12 - aa, r) * 0.85);          // the heart
      fc *= 0.88 * (1.0 + 0.3 * b);                                       // flat cartoon colour, no glare
      if (L == 0) fc = mix(fc, water(c.y), 0.36);                          // far off, the blue between
      if (L == 1) fc = mix(fc, water(c.y), 0.12);
      col = mix(col, fc, body * (L == 0 ? 0.85 : 0.96));
    }
  }

  // on every beat a few bubbles burst up from below, gone within the beat
  if (uAudioActive > 0.5 && uBeatAge < 0.5) {
    float life = uBeatAge / 0.46;
    for (int k = 0; k < 5; k++) {
      float n = uBeatCount * 5.0 + float(k);
      vec2 start = vec2((hash11(n * 1.13) * 2.0 - 1.0) * gAsp * 0.85, -1.08 + 0.25 * hash11(n * 2.21));
      float rad = 0.014 + 0.022 * hash11(n * 3.37);
      vec2 bp = start + vec2(0.025 * sin(life * 10.0 + n), life * (0.45 + 0.35 * hash11(n * 4.41)));
      vec2 q = uv - bp;
      float d = length(q) - rad;
      float skin = ss(gPx * 1.6, 0.0, abs(d)) * 0.75 + ss(gPx, -gPx, d) * 0.12;
      float shine = exp(-dot(q - vec2(-0.4, 0.4) * rad, q - vec2(-0.4, 0.4) * rad) / (rad * rad * 0.06));
      col = mix(col, vec3(0.93, 1.0, 1.0), clamp(skin + shine, 0.0, 1.0) * (1.0 - ss(0.65, 1.0, life)) * uPunch);
    }
  }
  // a soft vignette, as if seen through the water
  col *= 1.0 - 0.18 * dot(uv / vec2(gAsp, 1.0), uv / vec2(gAsp, 1.0)) * 0.5;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'cicekli', name: 'Çiçekli Gökyüzü', group: 'Vibe',
  blurb: 'The flower-cloud sky of Bikini Bottom: every flower breathes with its own band, each beat turns them all a step and sends up a burst of bubbles',
  tags: ['sky', 'spongebob', 'flowers', 'cartoon', 'water', 'colourful', 'calm'],
  energy: 0.35, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
