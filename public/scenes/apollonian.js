// APOLLONIAN — a gasket of circles packed into the gaps between circles.
//
// Descartes' construction: three mutually tangent circles inside a containing one, then a new
// circle dropped into every curvilinear gap, forever. Rendered the cheap way — by the group that
// generates it. A point that falls inside one of the three circles is inverted back out; a point
// thrown outside the bezel is mirrored in by the containing circle. Every point drains into the
// one gap between the three circles in a finite number of steps, and that STEP COUNT is its
// nesting depth, while the product of the inversion derivatives says how far the map shrank space
// there — which is the distance to the nearest circle of the packing, so every generation draws
// itself at the right size for free.
//
// Depth is the frequency axis: generation 0 (the bezel and the three big circles) is lit by the
// bass at spec(0), each deeper generation samples one step further up the spectrum, and the
// sub-pixel specks at depth 13+ are pure treble. Peak-hold caps of the same band put a white
// glint on the rim. The limit set itself — the pixels that never settle, the dust along every
// chain of tangencies — is carried by uHigh. Mids bloom the glow around each rim.
// Beat: the three circles are shoved off their exact tangent radius, so the whole packing loses
// its fit and re-nests, and one whole generation (chosen by uBeatCount) flares at once.
const frag = `
vec2  gC[3];
float gR2, gDepth, gScale, gDF;

void fold(vec2 z) {
  float sc = 1.0, dep = 0.0;
  for (int i = 0; i < 26; i++) {
    float r2 = dot(z, z);
    if (r2 > 1.0) {                                  // outside the bezel: the container mirrors it in
      float k = min(1.0 / max(r2, 1e-7), 1e5);
      z *= k; sc *= k; dep += 1.0;
      continue;
    }
    bool moved = false;
    for (int j = 0; j < 3; j++) {
      vec2 v = z - gC[j];
      float v2 = dot(v, v);
      if (v2 < gR2) {                                // fell into a circle: invert back out of it
        float k = min(gR2 / max(v2, 1e-9), 1e5);
        z = gC[j] + v * k; sc *= k; dep += 1.0;
        moved = true;
      }
    }
    if (!moved) break;                               // settled in the gap: this is the fundamental domain
  }
  float r = sqrt(gR2);
  float d = 1.0 - length(z);
  for (int j = 0; j < 3; j++) d = min(d, length(z - gC[j]) - r);
  gDF = max(d, 0.0);
  gScale = min(sc, 1e9);
  gDepth = dep;
}

void main() {
  vec2 q = centered();
  float S = 1.15 - 0.06 * uBass - 0.025 * uBeat * uPunch;
  vec2 p = rot(uTime * 0.03 + uCruise * 0.006) * (q * S);
  p.x += uBalance * 0.04;

  // 2*sqrt(3)-3 is the only radius at which the three circles are exactly tangent; the beat
  // shoves them off it, the fit breaks for a moment and every generation re-seats itself.
  float rr = clamp(0.46410 + 0.010 * sin(uTime * 0.21) + 0.022 * uBeat * uPunch + 0.018 * (uLevel - 0.35), 0.40, 0.52);
  gR2 = rr * rr;
  float dd = 1.0 - rr;                               // keeps them internally tangent to the bezel
  gC[0] = vec2(0.0, dd);
  gC[1] = vec2(-0.86602540 * dd, -0.5 * dd);
  gC[2] = vec2( 0.86602540 * dd, -0.5 * dd);

  fold(p);

  float px = (2.0 / uRes.y) * S;                     // world units per pixel: keeps rims one pixel wide at any depth
  float de = gDF / max(gScale, 1e-6);                // distance to the nearest circle of the packing
  float t  = clamp(gDF / 0.075, 0.0, 1.0);           // position inside our own circle, size-independent
  float g  = gDepth;

  float x    = clamp(g / 13.0, 0.0, 1.0) * 0.94;     // one band per generation
  float band = spec(x);
  float cap  = peak(x);

  float edge = exp(-de / (px * 1.4));
  float halo = exp(-de / (px * (8.0 + 14.0 * uMid)));
  float dust = ss(24.0, 26.0, g);                    // never settled — the limit set itself

  vec3 hue = pal(0.06 * g + uTime * 0.012 + uProgress * 0.2);
  vec3 col = hue * edge * (0.30 + 2.4 * band);
  col += hue * halo * (0.04 + 0.5 * band);
  col += hue * (1.0 - t) * (1.0 - t) * 0.05 * (0.3 + band);
  col += vec3(1.0, 0.95, 0.84) * edge * cap * cap * 0.45;
  col += pal(0.8) * dust * (0.22 + 1.6 * uHigh);

  float litGen = mod(uBeatCount, 9.0);               // each beat flares one whole generation
  col += (hue * 0.7 + 0.3) * exp(-abs(g - litGen) * 1.3) * uBeat * uPunch * (0.5 * edge + 0.22);

  col *= mix(1.0, 0.13, ss(0.99, 1.07, length(p)));  // past the bezel only a faint echo survives
  col *= 1.0 - 0.45 * ss(0.9, 2.1, length(q));
  col += pal(0.55) * 0.012 * (0.5 + uLevel);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'apollonian',
  name: 'Apollonian',
  group: 'Lab',
  blurb: 'Circles packed into the gaps between circles, one frequency band per nesting depth',
  tags: ['geometric', 'abstract', 'science'],
  energy: 0.55,
  particles: 0,
  trails: 0.4,
  zoom: 1.003,
  spin: 0,
  frag,
};
