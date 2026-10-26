// LIMIT — the hyperbolic plane in a disc, after Escher's Circle Limit prints.
//
// On a hyperbolic plane you can fit seven heptagons round a corner, or five pentagons, or four
// squares with five at each vertex — tilings that cannot exist on flat paper. Squeezed into a disc
// (Poincaré's model) every tile is the same size in its own geometry, so to our eye they shrink
// endlessly toward the rim without ever reaching it. Escher drew fish and angels this way.
//
// Each pixel is walked back to the one triangle the whole pattern is built from: mirror it into a
// wedge, and if it lies beyond the tile's edge — an arc of a circle meeting the rim at right angles
// — reflect it through that circle, and repeat. How many reflections it took says how many rings of
// tiles out from the middle it is, and which way it turned at each step says which tile.
//
// The disc drifts: a hyperbolic translation (a Möbius transformation) moves the whole plane under
// us, tiles flowing in from one side of the rim and out at the other, at the music's travel speed.
// Each ring of tiles out from the middle listens to one band, bass inside and treble toward the rim;
// every beat sends a wave out through the rings; every sixteen beats the tiling itself changes.
const frag = `
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { return cmul(a, vec2(b.x, -b.y)) / dot(b, b); }

void main() {
  vec2 p = centered();
  const float DISC = 0.97;
  vec2 z = p / DISC;
  float r2 = dot(z, z);
  float rim = sqrt(r2);
  vec3 bg = vec3(0.006, 0.007, 0.012) + pal(0.6) * 0.03 * exp(-abs(rim - 1.0) * 6.0) * (0.5 + uLevel);
  if (r2 >= 1.0) {
    bg += pal(0.55) * 0.35 * exp(-(rim - 1.0) * 40.0) * (0.6 + 0.8 * uBeat * uPunch);   // the circle at infinity, glowing
    outColor = vec4(bg, 1.0);
    return;
  }

  // which tiling: {p, q} — p-gons, q at each corner; all with 1/p + 1/q < 1/2
  float which = mod(floor(uBeatCount / 16.0), 4.0);
  float P = which < 0.5 ? 7.0 : (which < 1.5 ? 5.0 : (which < 2.5 ? 4.0 : 6.0));
  float Q = which < 0.5 ? 3.0 : (which < 1.5 ? 4.0 : (which < 2.5 ? 5.0 : 4.0));
  // the tile's edge: a circle centred at (cd, 0), radius cr, meeting the rim at right angles
  float C = cos(PI / Q) / sin(PI / P);
  float xm = sqrt((C - 1.0) / (C + 1.0));                  // how far the edge's midpoint is from the tile's centre
  float cr = (1.0 - xm * xm) / (2.0 * xm);
  float cd = (1.0 + xm * xm) / (2.0 * xm);

  // the drift: a Möbius translation that keeps the disc, then a slow turn
  vec2 a = 0.5 * vec2(cos(uTravel * 0.019), sin(uTravel * 0.014));
  vec2 den = vec2(1.0, 0.0) - cmul(vec2(a.x, -a.y), z);
  vec2 w = cdiv(z - a, den);
  float ds = (1.0 - dot(a, a)) / dot(den, den);             // how much the map stretches here
  w = rot(uTime * 0.02) * w;

  // fold back to the fundamental triangle, remembering each step so it can be undone
  float sector = TAU / P;
  float gen = 0.0;
  float turns[40];
  bool flips[40];
  for (int i = 0; i < 40; i++) {
    float ang = atan(w.y, w.x);
    float k = floor((ang + sector * 0.5) / sector);
    float rel = ang - k * sector;
    float an = abs(rel);                                     // mirrored into [0, pi/p]
    w = length(w) * vec2(cos(an), sin(an));
    vec2 dc = w - vec2(cd, 0.0);
    float l2 = dot(dc, dc);
    if (l2 >= cr * cr) break;                                // inside the tile: done
    w = vec2(cd, 0.0) + dc * (cr * cr / l2);                 // reflect through the tile's edge
    ds *= cr * cr / l2;
    turns[i] = k * sector;
    flips[i] = rel < 0.0;
    gen += 1.0;
  }
  // which tile this is: run the steps backwards on the triangle's corner at the tile's centre. Every
  // pixel of a tile lands on the same centre, whichever mirror-image path it took to get there.
  vec2 centre = vec2(0.0);
  for (int i = 39; i >= 0; i--) {
    if (float(i) >= gen) continue;
    vec2 dc = centre - vec2(cd, 0.0);
    centre = vec2(cd, 0.0) + dc * (cr * cr / max(dot(dc, dc), 1e-9));
    if (flips[i]) centre.y = -centre.y;
    centre = rot(-turns[i]) * centre;
  }
  float id = hash21(floor(centre * 2048.0) + P * 13.0);

  // the tile: its ring from the middle picks its band, its path picks its colour
  float band = spec(0.03 + clamp(gen / 9.0, 0.0, 1.0) * 0.8);
  float wave = exp(-abs(gen - uBeatAge * 7.0) * 1.1) * exp(-uBeatAge * 1.4) * uPunch;
  float h = id;
  vec3 tile = pal(h * 0.35 + mod(gen, 2.0) * 0.5 + 0.05);
  float dEdge = abs(length(w - vec2(cd, 0.0)) - cr);       // distance to the tile's edge, in the tile's own measure
  float fp = 2.0 / (uRes.y * DISC) * ds;                    // one pixel, in the same measure
  float line = 1.0 - ss(max(0.010, fp * 0.8), max(0.018, fp * 1.8), dEdge);
  float relief = ss(0.0, 0.22, dEdge);                      // tiles bulge toward their middles
  vec3 col = tile * (0.12 + 0.55 * relief) * (0.45 + 1.4 * band + 1.6 * wave);
  // the star inside every tile: its mirror lines, and a bead at its centre
  float spoke = min(abs(w.y), abs(dot(w, vec2(-sin(PI / P), cos(PI / P)))));
  col += tile * (1.0 - ss(0.0, max(0.004, fp), spoke)) * 0.25 * relief;
  col += vec3(1.0, 0.95, 0.85) * exp(-dot(w, w) / 0.0016) * (0.4 + 1.2 * band);
  col = mix(col, vec3(0.92, 0.9, 0.84) * (0.35 + 0.5 * uLevel), line * 0.85);
  // near the rim the tiles are smaller than a pixel: let them dissolve into their average
  float blur = ss(0.08, 0.35, fp / xm);
  col = mix(col, pal(0.55) * 0.18 * (0.5 + band), blur);
  col += pal(0.55) * 0.12 * ss(0.85, 1.0, rim);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'limit',
  name: 'Limit',
  group: 'Lab',
  blurb: 'Escher’s hyperbolic disc: tiles flow to the rim forever; each ring is a band, each beat a wave',
  tags: ['geometric', 'science', 'abstract'],
  energy: 0.5,
  particles: 0,
  trails: 0.2,
  zoom: 1,
  spin: 0,
  frag,
};
