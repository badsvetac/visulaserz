// LALE — an Ottoman tulip bed at dusk, the Lale Devri garden under a gold-leaf sky.
//
// Two rows seen from low down, so the near tulips tower and the far ones sit on the horizon.
// The bed IS the spectrum: read left to right it runs 30 Hz to 16 kHz, one tulip per band —
// 21 small ones behind, 8 tall ones in front, each sampled with spec() at its own fixed x.
// A band's level swings its cup open (the petals are hinged at the base and splay apart),
// slow() sets how tall that stem stands so the row keeps the shape of the mix instead of
// twitching, and peak() leaves a glow round the cup of a band that has just peaked.
// Every beat releases a gust: a front that crosses the bed left to right in about half a
// second, bending each stem in turn as it passes. The sky is real gold leaf — laid in squares
// that never quite match tone, crackled along the fbm, and burnished by the treble.
const frag = `
float sq(float x) { return x * x; }

// one petal: a pointed lens hinged at its base, q.y running 0 at the hinge to ph at the tip
float petal(vec2 q, float ph, float pw) {
  float s = q.y / ph;
  if (s <= 0.0 || s >= 1.0) return 0.0;          // the ends are exactly hinge-width, and 0/0 there is a NaN
  float hw = pw * sqrt(max(sin(PI * s), 0.0)) * (1.0 - 0.42 * s);
  return 1.0 - ss(hw * 0.70, hw, abs(q.x));
}

// distance washes the far row back into the dusk
vec3 airy(vec3 c, float h) { return mix(c, vec3(0.96, 0.70, 0.34), h); }

void main() {
  vec2 p = centered() * (1.0 + uBeat * 0.008 * uPunch);
  float aspect = uRes.x / uRes.y;

  // gold leaf: beaten squares, each laid at a slightly different tone, with the usual crackle
  vec3 col = mix(vec3(1.00, 0.74, 0.30), vec3(0.24, 0.10, 0.06), ss(-0.30, 1.10, p.y));
  col = mix(col, pal(0.06 + 0.10 * p.y), 0.22);
  vec2 gq = p * 3.2 + vec2(0.4, 0.2);
  vec2 fr = fract(gq);
  col *= 0.90 + 0.20 * hash21(floor(gq));
  col *= 1.0 - 0.16 * (1.0 - ss(0.0, 0.03, min(min(fr.x, 1.0 - fr.x), min(fr.y, 1.0 - fr.y))));
  col *= 1.0 - 0.30 * (1.0 - ss(0.0, 0.022, abs(fbm(p * 6.0) - 0.5)));
  col += vec3(1.0, 0.88, 0.55) * ss(0.55, 0.95, noise(p * 46.0 + uTime * 0.3)) * uHigh * 0.35;

  // the low sun, burnished into the leaf; stereo balance decides which side it sits on
  vec2 sv = p - vec2(aspect * (0.34 + 0.10 * uBalance), -0.06);
  col += vec3(1.0, 0.80, 0.42) * exp(-length(sv) * 2.4) * (0.24 + 0.40 * uLevel);
  col = mix(col, vec3(1.0, 0.95, 0.78), 1.0 - ss(0.115, 0.125, length(sv)));

  // the far hedge closing the garden
  float hz = -0.10 + 0.012 * fbm(vec2(p.x * 2.0, 1.0));
  col = mix(col, airy(vec3(0.06, 0.10, 0.05), 0.30), ss(hz + 0.02, hz - 0.02, p.y));

  for (int r = 0; r < 2; r++) {
    float depth = float(r);                           // 0 = far row, 1 = near row
    float haze = (1.0 - depth) * 0.42;
    float baseY = mix(hz - 0.03, -1.35, depth);
    float hgt = mix(0.24, 1.72, depth);
    float cs = mix(0.058, 0.175, depth);
    float count = mix(21.0, 8.0, depth);
    for (int i = 0; i < 21; i++) {
      float fi = float(i);
      if (fi >= count) break;
      float u = (fi + 0.5) / count;                   // this tulip's place in the spectrum
      float seed = hash11(fi * 1.7 + depth * 13.0);
      float x0 = mix(-aspect * 1.05, aspect * 1.05, u) + (seed - 0.5) * 0.10;
      float b = spec(u), sl = slow(u), pk = peak(u);
      // the gust: one front per beat, crossing the whole bed in about half a second
      float front = -aspect * 1.4 + uBeatAge * aspect * 5.4;
      float gust = exp(-sq(x0 - front) * 3.0) * exp(-uBeatAge * 3.0) * uPunch * 0.42;
      float lean = sin(uTime * (0.5 + 0.3 * seed) + seed * TAU) * 0.05 + gust;
      float H = hgt * (0.86 + 0.22 * sl);
      float bend = lean * H * (0.5 + 0.7 * depth);
      if (abs(p.x - x0) > cs * 3.4 + abs(bend) + 0.03) continue;
      if (p.y > baseY + H + cs * 2.4) continue;

      vec3 green = airy(mix(vec3(0.08, 0.19, 0.06), pal(0.42) * 0.35, 0.25), haze);
      for (int k = 0; k < 2; k++) {                   // two blade leaves, leaning with the stem
        float dir = float(k) * 2.0 - 1.0;
        float lh = H * (0.34 + 0.24 * hash11(fi + float(k) * 7.0 + depth));
        float ly = (p.y - baseY) / lh;
        if (ly < 0.0 || ly > 1.0) continue;
        float lcx = x0 + dir * cs * 2.3 * sin(ly * 2.0) + bend * ly * ly * 0.7;
        float lw = cs * 0.30 * sqrt(max(sin(PI * ly), 0.0)) * (1.0 - 0.45 * ly);
        col = mix(col, green * (0.65 + 0.55 * ly), 1.0 - ss(lw * 0.5, lw, abs(p.x - lcx)));
      }

      float t = (p.y - baseY) / H;                    // the stem bends most toward its tip
      if (t > 0.0 && t < 1.0) {
        float sw = cs * (0.10 + 0.05 * (1.0 - t));
        col = mix(col, green * (0.85 + 0.35 * t), 1.0 - ss(sw * 0.55, sw, abs(p.x - x0 - bend * t * t)));
      }

      // the cup: five petals hinged at one point, the band swinging them open
      vec2 tip = vec2(x0 + bend, baseY + H);
      vec2 q = (p - tip + vec2(0.0, cs * 0.28)) / cs;
      float wide = 0.16 + 0.70 * b;
      vec3 skin = mix(vec3(0.86, 0.10, 0.06), pal(0.04 + 0.20 * seed), 0.32);
      skin = mix(skin, vec3(0.97, 0.74, 0.12), 0.55 * step(0.80, seed));   // the odd yellow one
      vec3 lit = airy(skin * (0.42 + 0.78 * clamp(q.y / 1.6, 0.0, 1.0)), haze);
      float a1 = 0.34 + 0.55 * wide, a2 = 0.10 + 0.30 * wide;
      col = mix(col, lit * 0.42, petal(rot(-a1) * q, 1.42, 0.40));
      col = mix(col, lit * 0.50, petal(rot(a1) * q, 1.42, 0.40));
      col = mix(col, lit * 0.78, petal(rot(-a2) * q, 1.58, 0.44));
      col = mix(col, lit * 0.88, petal(rot(a2) * q, 1.58, 0.44));
      col = mix(col, lit * (1.05 + 0.50 * uBeat * uPunch), petal(q, 1.66, 0.42));
      col += airy(skin, haze) * pk * pk * 0.16 * exp(-length(p - tip - vec2(0.0, cs)) / (cs * 1.6));
    }
  }

  // petals earlier gusts tore loose
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float life = fract(hash11(fi * 2.3 + 1.0) + uTravel * 0.075 * (0.6 + hash11(fi * 5.1)));
    vec2 pc = vec2(mix(-aspect - 0.15, aspect + 0.15, life),
                   -0.28 + 0.80 * hash11(fi * 3.7) + 0.10 * sin(life * 13.0 + fi));
    vec2 pv = rot(life * 9.0 + fi) * (p - pc) / 0.045;
    vec3 pcol = mix(vec3(0.88, 0.14, 0.08), pal(0.05), 0.30) * (0.55 + 0.60 * abs(cos(life * 9.0 + fi)));
    col = mix(col, pcol, petal(pv + vec2(0.0, 0.85), 1.7, 0.52));
  }

  col *= mix(1.0, 0.13, ss(-0.18, -0.95, p.y));       // the bed falls away into deep shadow
  col *= 0.86 + 0.24 * uLevel;
  col *= 1.0 - 0.35 * ss(0.7, 1.9, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'lale',
  name: 'Lale',
  group: 'Vibe',
  blurb: 'Tulip bed under a gold-leaf dusk; one tulip per band, each beat gusts across the row',
  tags: ['turkish', 'nature', 'organic'],
  energy: 0.35,
  particles: 3,
  trails: 0.05,
  zoom: 1,
  spin: 0,
  frag,
};
