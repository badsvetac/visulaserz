// ÇİNİ — an Iznik tile panel, the wall of a 16th-century mosque.
//
// One tile drawn and repeated across the wall: white slip ground, cobalt and turquoise under a
// clear glaze, and the bolus red the Iznik potters alone could fire without it bleeding — that red
// is a thick slip, so it stands slightly proud of the glaze and catches light harder than anything
// else on the panel. The tile is laid out on eight sectors, the way these panels always are.
// Eight blooms ring the centre, alternating tulip (lale) and carnation (karanfil); bloom k reads
// spec(0.05 + k*0.115), so the flowers around the tile are the spectrum wrapped into a circle and
// each one swells and leans on its own band. The rosette at the centre is four rings of petals,
// innermost on the bass and outermost on the treble, and each ring's radius and petal width grow
// with its band — so the flower opens and closes. The saz leaves along the sector walls run on the
// mids, the rumi scroll in the border brightens with the highs, the centre boss rides the bass.
// On the beat the glaze catches the light: a specular sweep crosses the whole panel, and the
// craquelure — the crack net left when glaze and body cooled at different rates — flares as it goes.
const frag = `
const float S = 0.95;                                    // tile pitch, in screen half-heights

vec3 pig(float i) {
  vec3 c = i < 0.5 ? vec3(0.055, 0.130, 0.520)           // cobalt
         : i < 1.5 ? vec3(0.040, 0.505, 0.500)           // turquoise
         : i < 2.5 ? vec3(0.765, 0.160, 0.095)           // bolus red
         :           vec3(0.950, 0.935, 0.890);          // the white slip ground
  return mix(c, pal(i * 0.16 + 0.04), i < 2.5 ? 0.16 : 0.06);   // the pigments take a little of the palette
}
float inked(float d) { return 1.0 - ss(0.0, 0.016, d); }         // a painted edge, soft like a brush
float lined(float d) { return 1.0 - ss(0.004, 0.015, abs(d)); }  // the dark contour drawn round every motif

float craze(vec2 w) {                                    // voronoi edges: the glaze crazed into cells
  vec2 n = floor(w), f = fract(w);
  float f1 = 9.0, f2 = 9.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = vec2(hash21(n + g), hash21(n + g + 41.7));
    vec2 rr = g + o - f;
    float d = dot(rr, rr);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return sqrt(f2) - sqrt(f1);
}

// tulip: the bulb is a trefoil — a point outward, two curling back at the sides, a pointed calyx
// under it — stretched along its own axis. k < 1 gives the smaller copy painted inside it.
float tul(vec2 m, float o, float k) {
  vec2 v = (m - vec2(0.140, 0.0)) * vec2(0.66, 1.0);
  float ang = atan(v.y, v.x);
  return length(v) - k * (0.084 + 0.022 * o) * (1.0 + 0.44 * cos(ang * 3.0));
}
// carnation: a fan of serrated petals opening from the calyx, wider the louder its band
float carn(vec2 m, float o, float k) {
  vec2 v = m - vec2(-0.010, 0.0);
  float ang = atan(v.y, v.x);
  float rim = k * ((0.150 + 0.055 * o) * cos(ang * 0.40) + 0.020 * cos(ang * 13.0));   // five teeth
  return max(length(v) - rim, abs(ang) - 1.25);
}
// saz leaf: lance-shaped, pinched to a point at both ends, bending away as it runs outward
float saz(float rr, float y, float o) {
  float t = clamp((rr - 0.26) / 0.52, 0.0, 1.0);
  float w = (0.050 + 0.022 * o) * sin(PI * t) + 0.007 * sin(t * 31.0);   // the serrated edge
  return max(abs(y - 0.16 * t * t) - w, max(0.25 - rr, rr - 0.79));
}

void main() {
  vec2 p = centered() * (1.0 + uBeat * 0.010 * uPunch);
  p += vec2(0.010 * sin(uTime * 0.06), 0.008 * cos(uTime * 0.045));      // a wall is never quite still

  vec2 tid = floor(p / S + 0.5);
  vec2 q = (p - tid * S) / (S * 0.5);                    // -1..1 inside one tile
  float r = length(q), a = atan(q.y, q.x);
  float sect = TAU / 8.0;
  float k = floor((a + PI) / sect);                      // which of the eight sectors
  float af = mod(a + PI, sect) - sect * 0.5;             // angle about the sector's own axis
  float ab = mod(a + PI + sect * 0.5, sect) - sect * 0.5;// angle about the wall between two sectors
  float odd = mod(k, 2.0);

  vec4 rb = vec4(spec(0.06), spec(0.24), spec(0.45), spec(0.66));        // the four petal rings
  float kb = spec(0.05 + k * 0.115);                                     // this sector's bloom
  float lb = spec(0.38);                                                 // the leaves take the mids

  vec3 col = pig(3.0) * (0.90 + 0.10 * noise(p * 26.0));
  col *= 0.95 + 0.09 * hash21(tid);                      // no two tiles left the kiln the same
  float rel = 0.0;                                       // where the red slip stands proud of the glaze

  // rumi border: two ribbons running round the tile, passing over and under one another
  float bd = max(abs(q.x), abs(q.y));
  float along = abs(q.x) > abs(q.y) ? q.y : q.x;
  float dep = 0.975 - bd;                                // 0 at the tile edge, 0.175 at the inner rim
  float cd = length(abs(q) - vec2(0.885)) - 0.070;       // corner medallion, where two runs meet
  float inB = step(0.0, dep) * step(dep, 0.175) * step(0.0, cd);
  float ph = along * PI * 4.0;
  float d1 = abs(dep - 0.0875 - 0.052 * sin(ph)) - 0.020;
  float d2 = abs(dep - 0.0875 + 0.052 * sin(ph)) - 0.020;
  float over = step(0.0, cos(ph));                       // which ribbon is on top changes every crossing
  float dp = length(vec2(dep - 0.0875, (fract(along * 4.0) - 0.5) * 0.25)) - 0.023;  // pearl in each loop
  vec3 rum = pig(0.0) * (0.70 + 0.90 * uHigh);
  col = mix(col, rum, inked(d2) * inB);
  col = mix(col, vec3(0.04, 0.05, 0.12), lined(d2) * inB);
  col = mix(col, rum, inked(d1) * inB * (0.30 + 0.70 * over));
  col = mix(col, vec3(0.04, 0.05, 0.12), lined(d1) * inB * over);
  col = mix(col, pig(1.0), inked(dp) * inB);
  col = mix(col, pig(2.0), inked(cd)); rel = max(rel, inked(cd));
  col = mix(col, vec3(0.04, 0.05, 0.12), lined(cd));
  col *= 1.0 - 0.30 * ss(0.978, 0.998, bd);              // the seam between two tiles

  // saz leaves on the sector walls and the stems, painted first: they lie under the flowers
  float lt = clamp((r - 0.26) / 0.52, 0.0, 1.0);
  float dl = saz(r, ab * r, lb);
  float dst = max(abs(af * r) - 0.010 * (1.0 - 0.6 * ss(0.28, 0.50, r)), max(0.28 - r, r - 0.50));  // the stem
  col = mix(col, pig(0.0) * 0.75, inked(dst));
  col = mix(col, pig(1.0) * (0.70 + 0.60 * lb), inked(dl));
  col = mix(col, vec3(0.04, 0.05, 0.12), max(lined(dl), lined(ab * r - 0.16 * lt * lt) * inked(dl)));

  // the eight blooms: even sectors a tulip, odd sectors a carnation, each one on its own band
  vec2 m = vec2(r - 0.46, af * r + 0.035 * (kb - 0.35));           // the bloom leans as its band rises
  float dm = odd < 0.5 ? tul(m, kb, 1.0) : carn(m, kb, 1.0);
  float dh = odd < 0.5 ? tul(m, kb, 0.46) : carn(m, kb, 0.44);     // the same flower again, smaller, inside
  col = mix(col, (odd < 0.5 ? pig(2.0) : pig(0.0)) * (0.68 + 0.70 * kb), inked(dm));
  rel = max(rel, inked(dm) * (1.0 - odd));
  col = mix(col, odd < 0.5 ? pig(1.0) : pig(2.0), inked(dh));
  rel = max(rel, inked(dh) * odd);
  col = mix(col, vec3(0.04, 0.05, 0.12), max(lined(dm), lined(dh)));

  // the rosette: four rings of eight petals, ring j opening and closing on its own band
  for (int j = 0; j < 4; j++) {
    float fj = float(j), b = rb[j];
    float rad = 0.085 + fj * 0.078 + b * 0.028;
    float ax = mod(fj, 2.0) < 0.5 ? af : ab;             // rings alternate into the gaps of the one below
    float w = 0.028 + 0.015 * b;
    float d = length(vec2((r - rad) / (w * 1.55), ax * r / w)) - 1.0;
    float ci = mod(fj + 1.0, 3.0);
    col = mix(col, pig(ci) * (0.72 + 0.60 * b), inked(d));
    rel = max(rel, inked(d) * step(1.5, ci));
    col = mix(col, vec3(0.04, 0.05, 0.12), lined(d));
  }
  float dc = r - 0.055 - 0.015 * uBass;                  // the boss at the centre rides the bass
  col = mix(col, pig(2.0) * (0.80 + 0.90 * uBass), inked(dc)); rel = max(rel, inked(dc));
  col = mix(col, pig(3.0), inked(r - 0.020));
  col = mix(col, vec3(0.04, 0.05, 0.12), lined(dc));

  // the glaze: a standing sheen, and on the beat a highlight sweeping right across the panel
  float dsw = dot(p, normalize(vec2(0.80, 0.60))) + 2.4 - uBeatAge * 8.0;
  float sweep = exp(-dsw * dsw * 7.0) * exp(-uBeatAge * 1.5) * uPunch;
  float cr = min(craze(p * 11.0 + fbm(p * 2.2) * 0.7), craze(p * 27.0 + 5.1) * 1.7);
  float crack = 1.0 - ss(0.0, 0.05, cr);
  col *= 1.0 - crack * 0.20;                             // every crack has taken up a thread of dirt
  col += vec3(0.95, 0.99, 1.00) * crack * sweep * 0.65;
  col *= 0.90 + 0.26 * ss(-1.7, 1.5, p.x + p.y * 0.6);
  col += vec3(1.00, 0.97, 0.92) * sweep * (0.09 + 0.36 * rel);           // the raised red flares hardest
  col *= 0.82 + 0.34 * uLevel;
  col *= 1.0 - 0.34 * ss(0.7, 1.9, length(centered()));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'cini',
  name: 'Çini',
  group: 'Things',
  blurb: 'An Iznik tile wall; eight blooms take eight bands, beats sweep light across the glaze',
  tags: ['turkish', 'geometric', 'calm'],
  energy: 0.35,
  particles: 0,
  trails: 0.25,
  zoom: 1,
  spin: 0,
  frag,
};
