// TRUCHET — Sébastien Truchet's tiling (1704), redrawn as glowing enamel floor tiles.
//
// Each square tile holds two quarter arcs of radius 1/2 centred on OPPOSITE corners, so every arc
// leaves the tile exactly at an edge midpoint. Whichever way a neighbour is turned, the ends still
// meet: the arcs weld into long meandering loops across the whole floor. There are only two
// orientations, and turning one tile re-routes every loop that passed through it.
//
// COLUMN = BAND: the grid's x index is the spectrum, leftmost column 30 Hz … rightmost 16 kHz.
// A column's level sets the weight of its ink and how hard its arcs glow, its peak-hold cap sets
// how white-hot the core burns, and its long-release level keeps a dim ember there in the quiet.
// Highs light the four joints where arcs hand over to the next tile; bass glints in the seams.
//
// BEAT: a diagonal front leaves the bottom-left corner and crosses the floor in 0.4 s, flaring as
// it goes; tiles turn as it passes them and the loops visibly re-route behind it. A tile's
// orientation is a pure function of (tile, generation), so the floor is rebuilt from uBeatCount
// every frame — no tile has to remember anything.
const frag = `
float arcs(vec2 f, float o) {
  vec2 g = vec2(mix(f.x, -f.x, o), f.y);                 // the two orientations are mirror images
  return min(abs(length(g + vec2(0.5, 0.5)) - 0.5), abs(length(g - vec2(0.5, 0.5)) - 0.5));
}

float orient(vec2 cell, float gen) {
  float rate = 0.30 + 0.55 * hash21(cell + 4.2);         // restless tiles turn on most beats, others rarely
  float turns = floor(gen * rate + hash21(cell + 8.8) * 2.0);
  return mod(floor(hash21(cell) * 2.0) + turns, 2.0);
}

void main() {
  vec2 p = centered() * (1.0 - uBeat * 0.008 * uPunch);
  float asp = max(uRes.x / uRes.y, 0.4);
  const float S = 4.0;                                   // 8 tiles top to bottom
  vec2 drift = vec2(0.0, uCruise * 0.18);                // the floor slides, but only along a column
  vec2 q = p * S + drift;
  vec2 cell = floor(q), f = fract(q) - 0.5;
  float px = 2.0 * S / uRes.y;                           // one screen pixel, in tile units

  float cx = clamp((cell.x + 0.5) / (asp * S) * 0.5 + 0.5, 0.0, 1.0);
  float band = spec(cx), cap = peak(cx), bed = slow(cx);
  vec3 ink = pal(0.05 + cx * 0.60 + uTime * 0.015);

  vec2 pc = (cell + 0.5 - drift) / S;                    // tile centre, screen space: the front is per tile,
  float dn = (pc.x / asp + pc.y) * 0.25 + 0.5;           // never halfway through one
  float front = uBeatAge / 0.40;
  float sw = ss(dn - 0.04, dn + 0.04, front);

  float w = 0.05 + 0.075 * band + 0.02 * cap;            // the column's level is the weight of its ink
  float dOld = arcs(f, orient(cell, uBeatCount - 1.0));
  float dNew = arcs(f, orient(cell, uBeatCount));
  float stroke = mix(1.0 - ss(w - px, w + px, dOld), 1.0 - ss(w - px, w + px, dNew), sw);
  float halo = mix(w / (dOld + w * 0.45), w / (dNew + w * 0.45), sw);

  // the enamel underneath: each tile fired slightly differently, a groove at every seam
  float seam = max(abs(f.x), abs(f.y));
  vec3 col = vec3(0.016, 0.017, 0.022) * (0.7 + 0.5 * hash21(cell + 31.7));
  col *= 0.72 + 0.28 * (1.0 - ss(0.46, 0.5, seam));
  col += ink * 0.05 * bed + vec3(0.01) * noise(p * 260.0);
  col += pal(0.62) * ss(0.455, 0.5, seam) * (0.008 + 0.055 * uBass);

  vec3 hot = mix(ink, vec3(1.0), 0.20 + 0.45 * cap);
  col += hot * stroke * (0.45 + 1.4 * band);
  col += ink * halo * halo * 0.05 * (0.2 + 1.0 * band);

  // the four joints: where this tile's arcs hand the loop over to its neighbours
  float jd = min(min(length(f - vec2(0.5, 0.0)), length(f + vec2(0.5, 0.0))),
                 min(length(f - vec2(0.0, 0.5)), length(f + vec2(0.0, 0.5))));
  col += hot * (1.0 - ss(w * 0.55, w * 0.95, jd)) * (0.10 + 1.2 * uHigh * band);

  float t = (front - dn) * 5.0;
  float flare = exp(-t * t) * uPunch;                    // dies on its own once the front is past
  col += mix(ink, vec3(1.0), 0.6) * flare * (stroke * 1.3 + 0.04);
  col *= 1.0 - 0.35 * ss(0.7, 1.6, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'truchet',
  name: 'Truchet',
  group: 'Lab',
  blurb: 'Interlocking arc tiles; every column is one band, beats flip a diagonal wave and re-route the loops',
  tags: ['geometric', 'abstract', 'analyser'],
  energy: 0.55,
  particles: 0,
  trails: 0.25,
  zoom: 1,
  spin: 0,
  frag,
};
