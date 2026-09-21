// ARCADE — the invaders have rhythm.
//
// Everything is drawn on a 96-line pixel grid. Eleven columns of invaders, one band each: a
// column burns brighter the louder its band is. The formation steps sideways on every beat and
// swaps its legs, the cannon fires on the beat from wherever it was at that instant, the ground
// line is a spectrum, and the bunkers crumble as the track runs out. The aliens themselves are
// not drawn by hand: each row's sprite is a mirrored hash.
const frag = `
const int SHIP[5] = int[5](0x010, 0x038, 0x0FE, 0x1FF, 0x1FF);
const int UFO[4] = int[4](0x1F8, 0x7FE, 0xDB6, 0x30C);

float invaderBit(vec2 l, float row, float frame) {
  float mx = l.x < 4.0 ? l.x : 7.0 - l.x;                          // mirror the left half
  if (mx == 2.0 && (l.y == 2.0 || l.y == 3.0)) return 0.0;          // eyes
  if (mx == 3.0 && l.y >= 1.0 && l.y <= 5.0) return 1.0;            // spine
  float seed = row * 13.0 + (l.y >= 6.0 ? frame * 7.0 : 0.0);       // only the legs change between the two frames
  float density = l.y < 1.0 || l.y >= 6.0 ? 0.62 : 0.42;
  return step(density, hash21(vec2(mx, l.y) + seed));
}

float shipX(float t) { return sin(t * 0.9) * 46.0 + sin(t * 0.37 + 1.0) * 20.0; }

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  const float S = 2.0 / 96.0;
  vec2 v = floor(p / S);
  vec2 sub = fract(p / S);
  float halfCols = floor(aspect / S);
  vec3 col = vec3(0.0);

  // stars
  float starY = mod(v.y + floor(uTime * 6.0 * (0.3 + hash11(v.x))), 96.0);
  col += vec3(0.6, 0.7, 1.0) * step(0.985, hash21(vec2(v.x, starY))) * 0.35 * (0.5 + uHigh);

  // the formation
  float cw = floor(min(12.0, (halfCols * 2.0 - 16.0) / 11.0));
  float stepN = mod(uBeatCount, 8.0);
  float march = (stepN < 4.0 ? stepN : 8.0 - stepN) * 2.0 - 4.0;
  float frame = mod(uBeatCount, 2.0);
  vec2 f = vec2(v.x + floor(cw * 5.5) - march, 40.0 - v.y);
  vec2 cell = floor(f / vec2(cw, 10.0));
  if (cell.x >= 0.0 && cell.x < 11.0 && cell.y >= 0.0 && cell.y < 5.0) {
    vec2 l = mod(f, vec2(cw, 10.0)) - vec2(floor((cw - 8.0) * 0.5), 1.0);
    if (l.x >= 0.0 && l.x < 8.0 && l.y >= 0.0 && l.y < 8.0) {
      float band = spec(0.03 + cell.x / 10.0 * 0.75);
      float bit = invaderBit(l, cell.y, frame);
      col += pal(0.08 + cell.y * 0.16) * bit * (0.22 + 1.6 * band + 0.5 * uBeat * uPunch);
    }
  }

  // the cannon, and the shot it fired on the last beat
  float sx = floor(shipX(uTime));
  vec2 sl = vec2(v.x - sx + 4.0, -37.0 - v.y);
  if (sl.x >= 0.0 && sl.x < 9.0 && sl.y >= 0.0 && sl.y < 5.0) {
    col += pal(0.35) * float((SHIP[int(sl.y)] >> (8 - int(sl.x))) & 1) * 1.1;
  }
  float bx = floor(shipX(uTime - uBeatAge));
  float by = -36.0 + uBeatAge * 150.0;
  col += vec3(1.0) * step(abs(v.x - bx), 0.5) * step(by, v.y) * step(v.y, by + 3.0) * step(uBeatAge, 0.62) * 1.4;
  col += pal(0.35) * step(abs(v.x - bx), 1.5) * step(abs(v.y + 36.0), 1.5) * exp(-uBeatAge * 14.0) * uPunch;   // muzzle flash

  // their bombs zigzag down
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float ph = uTime * 0.45 + fk * 0.37;
    float id = floor(ph);
    float yb = -8.0 - fract(ph) * 34.0;
    float xb = floor((hash11(id * 3.7 + fk * 9.1) - 0.5) * cw * 10.0) + mod(floor(yb * 0.5), 2.0);
    col += pal(0.0) * step(abs(v.x - xb), 0.5) * step(abs(v.y - floor(yb)), 1.5) * 1.2;
  }

  // bunkers, eaten away as the track runs out
  float gap = floor(halfCols * 0.42);
  float bxq = mod(v.x + gap * 2.0 + gap * 0.5, gap) - gap * 0.5;
  vec2 bl = vec2(abs(bxq), v.y + 31.0);
  float bunker = step(bl.x, 7.0) * step(0.0, bl.y) * step(bl.y, 7.0) * step(bl.x + bl.y, 12.0) * (1.0 - step(bl.x, 2.0) * step(bl.y, 2.0));
  bunker *= step(abs(v.x), gap * 2.0) * step(uProgress * 0.8, hash21(v + 3.0));
  col += pal(0.35) * bunker * 0.7;

  // the ground line is a spectrum
  float gs = spec(0.02 + abs(v.x) / halfCols * 0.8);
  col += pal(0.35 + gs * 0.3) * step(abs(v.y + 44.0), 0.5) * (0.25 + 1.8 * gs);
  col += pal(0.35) * step(-44.0 - floor(gs * 5.0), v.y) * step(v.y, -45.0) * 0.5;

  // the mystery ship crosses now and then
  float up = fract(uTime * 0.035);
  vec2 ul = vec2(v.x - floor(mix(-halfCols - 14.0, halfCols + 2.0, up * 3.0)), 45.0 - v.y);
  if (up < 0.34 && ul.x >= 0.0 && ul.x < 12.0 && ul.y >= 0.0 && ul.y < 4.0) {
    col += pal(0.0) * float((UFO[int(ul.y)] >> (11 - int(ul.x))) & 1) * (0.8 + 0.6 * sin(uTime * 20.0));
  }

  // the tube: pixel gaps, scanlines, a little curvature in the brightness
  col *= ss(0.0, 0.12, sub.x) * ss(0.0, 0.12, sub.y) * (0.82 + 0.18 * sin(p.y * 96.0 * PI));
  col += pal(0.6) * 0.012;
  col *= 1.0 - 0.4 * ss(0.8, 1.9, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'arcade',
  name: 'Arcade',
  group: 'Things',
  blurb: 'Pixel invaders march on the beat, columns lit per band, cannon fires in time',
  tags: ['retro', 'space', 'geometric'],
  energy: 0.65,
  particles: 0,
  trails: 0.45,
  zoom: 1,
  spin: 0,
  frag,
};
