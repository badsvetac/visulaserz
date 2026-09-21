// CIRCUIT — a board where the signal is the song.
//
// The traces are Truchet tiles: every square holds two quarter-circle arcs joining the middles of
// its sides, turned one way or the other by a coin toss, and the arcs of neighbouring tiles always
// meet — so random tiles make long wandering tracks with no dead ends. Pulses of light run along
// them on the travel clock, each tile's copper glows with the band it was dealt, vias sit where
// tracks cross tile edges, and a beat sends a bright front out from the middle of the board.
const frag = `
void main() {
  vec2 p = centered();
  float t = uTravel * 0.35;
  vec2 g = p * 4.5 + vec2(uTime * 0.02, 0.0);
  vec2 id = floor(g);
  vec2 f = fract(g);
  float flip = step(0.5, hash21(id));
  if (flip > 0.5) f.x = 1.0 - f.x;

  // two arcs: centred on opposite corners, radius one half
  float d1 = abs(length(f) - 0.5);
  float d2 = abs(length(f - 1.0) - 0.5);
  float d = min(d1, d2);
  // how far along the arc we are (0..1), oriented so that pulses flow through from tile to tile
  float a = d1 < d2 ? atan(f.y, f.x) / (PI * 0.5) : atan(1.0 - f.y, 1.0 - f.x) / (PI * 0.5);
  float dir = mod(id.x + id.y, 2.0) < 0.5 ? 1.0 : -1.0;
  if (flip > 0.5) dir = -dir;
  float band = spec(0.03 + hash21(id + 7.0) * 0.8);

  vec3 board = vec3(0.004, 0.030, 0.022) + pal(0.45) * 0.015;
  board *= 0.8 + 0.3 * noise(p * 60.0);
  vec3 copper = mix(vec3(0.85, 0.55, 0.25), pal(0.12), 0.35);
  float trace = 1.0 - ss(0.045, 0.060, d);
  float edge = 1.0 - ss(0.0, 0.012, abs(d - 0.0525));
  vec3 col = mix(board, copper * (0.10 + 0.55 * band), trace);
  col += copper * edge * 0.12;

  // pulses
  float ph = fract(a * dir * 0.5 + t * 0.5);
  float pulse = exp(-abs(ph - 0.5) * 9.0) * trace;
  col += mix(pal(0.55), vec3(1.0), 0.3) * pulse * (0.25 + 1.8 * band);

  // vias at the side midpoints, where the tracks hand over
  vec2 m = abs(fract(g + 0.5) - 0.5);
  float via = min(length(vec2(m.x, fract(g.y) - 0.5)), length(vec2(fract(g.x) - 0.5, m.y)));
  col = mix(col, copper * (0.5 + band), 1.0 - ss(0.075, 0.085, via));
  col = mix(col, vec3(0.002), 1.0 - ss(0.030, 0.038, via));

  // a chip here and there, its LED on its band
  vec2 cg = floor(g / 3.0);
  if (hash21(cg + 3.0) > 0.6) {
    vec2 cv = abs(g - (cg * 3.0 + 1.5)) - vec2(0.62, 0.42);
    float chip = max(cv.x, cv.y);
    float pins = step(chip, 0.10) * step(0.0, chip) * step(0.5, fract(g.x * 5.0)) * step(abs(g.y - (cg.y * 3.0 + 1.5)), 0.55);
    col = mix(col, vec3(0.75, 0.75, 0.78) * 0.5, pins);
    col = mix(col, vec3(0.012, 0.012, 0.014) + vec3(0.04) * noise(g * 30.0), 1.0 - ss(-0.01, 0.0, chip));
    vec2 lv = g - (cg * 3.0 + 1.5) - vec2(0.42, 0.24);
    float cb = spec(0.03 + hash21(cg) * 0.8);
    col += pal(hash21(cg + 9.0)) * (0.002 / (dot(lv, lv) + 0.002)) * (0.1 + 2.0 * cb) * step(chip, 0.0);
  }

  // the front that leaves the middle on every beat
  float rr = length(p) - uBeatAge * 1.6;
  col += pal(0.55) * exp(-rr * rr * 40.0) * exp(-uBeatAge * 2.0) * trace * 1.6 * uPunch;
  col *= 1.0 - 0.45 * ss(0.8, 1.9, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'circuit',
  name: 'Circuit',
  group: 'Lab',
  blurb: 'Truchet-tile circuit board; light pulses run the traces with the song',
  tags: ['geometric', 'retro', 'abstract'],
  energy: 0.6,
  particles: 0,
  trails: 0.4,
  zoom: 1,
  spin: 0,
  frag,
};
