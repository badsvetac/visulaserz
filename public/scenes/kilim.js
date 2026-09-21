// KILIM — a rug that is woven while the track plays.
//
// The seek bar is the loom: rows below the track's progress are woven, rows above it are still
// bare warp threads, and the shuttle goes across on every beat along the row being worked. The
// design is drawn knot by knot on a coarse grid, the way a kilim is: stepped diamonds ("eyes")
// in the field, running-water zigzags in the borders, a fringe at each end. Each column of
// medallions belongs to a band and its eyes light with it.
const frag = `
const float ROWS = 112.0;

vec3 dye(float i) {
  // madder red, indigo, saffron, ivory, walnut — each leaning a little toward the palette
  vec3 c = i < 0.5 ? vec3(0.62, 0.10, 0.08) : i < 1.5 ? vec3(0.08, 0.12, 0.34) : i < 2.5 ? vec3(0.85, 0.58, 0.12) : i < 3.5 ? vec3(0.88, 0.84, 0.72) : vec3(0.22, 0.13, 0.08);
  return mix(c, pal(i * 0.19 + 0.05), 0.30);
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float S = 2.0 / ROWS;
  vec2 v = floor(p / S);
  vec2 sub = fract(p / S);
  float halfW = floor(min(aspect * 0.80, 1.35) / S);
  float halfH = floor(0.86 / S);
  vec3 col = vec3(0.012, 0.010, 0.010) + pal(0.08) * 0.012;

  if (abs(v.x) <= halfW && abs(v.y) <= halfH + 5.0) {
    float woven = (uProgress * 2.0 - 1.0) * halfH;                       // the row being worked
    vec3 knot;
    if (abs(v.y) > halfH) {
      // the fringe: warp ends, knotted in pairs
      knot = vec3(0.80, 0.76, 0.64) * step(0.5, mod(v.x, 2.0)) * (0.6 + 0.4 * hash11(v.x));
      col = knot * step(v.y, woven + 6.0);
      if (v.y > 0.0 && v.y > woven) col = vec3(0.0);
    } else if (v.y > woven) {
      // not woven yet: only the warp
      col = vec3(0.55, 0.52, 0.44) * step(0.5, mod(v.x, 2.0)) * 0.35;
    } else {
      float bx = halfW - abs(v.x), by = halfH - abs(v.y);
      float border = min(bx, by);
      if (border < 2.0) knot = dye(4.0);
      else if (border < 9.0) {
        // running water: a zigzag that turns the corners
        float along = bx < by ? v.y : v.x;
        float zz = abs(mod(along, 8.0) - 4.0);                           // 0..4 triangle wave
        float depth = border - 2.0;
        knot = abs(depth - 1.0 - zz) < 1.0 ? dye(3.0) : (abs(depth - 5.0) < 0.5 ? dye(2.0) : dye(1.0));
      } else if (border < 11.0) knot = dye(2.0);
      else {
        // the field: stepped diamonds on a lattice
        vec2 cell = vec2(26.0, 22.0);
        vec2 id = floor((v + cell * 0.5) / cell);
        vec2 l = mod(v + cell * 0.5, cell) - cell * 0.5;
        float dm = floor(abs(l.x) * 0.5) + floor(abs(l.y) * 0.6);         // stepped, not smooth: knots come in blocks
        float ring = floor(dm / 2.0);
        float band = spec(0.04 + clamp(abs(id.x) / 3.0, 0.0, 1.0) * 0.7);
        if (dm < 1.0) knot = mix(dye(3.0), vec3(1.0, 0.95, 0.8), 0.3) * (0.7 + 1.6 * band);      // the eye
        else if (ring < 4.0) knot = dye(mod(ring + id.x + id.y, 3.0)) * (0.85 + 0.5 * band * step(ring, 1.5));
        else knot = dye(0.0);
        // little hooks between the medallions
        vec2 hl = abs(abs(l) - cell * 0.5);
        if (hl.x + hl.y < 3.0) knot = dye(2.0);
      }
      // wool: each knot a touch different, a weft line between rows, and wear
      knot *= 0.82 + 0.18 * hash21(v) ;
      knot *= 0.80 + 0.20 * ss(0.0, 0.25, sub.y) * ss(0.0, 0.15, sub.x);
      col = knot * (0.55 + 0.35 * uLevel);
      // the working row glows, and the shuttle crosses it on the beat
      float work = exp(-abs(v.y - woven) * 0.9);
      col += pal(0.1) * work * 0.25;
      float sxp = mix(-halfW, halfW, mod(uBeatCount, 2.0) < 0.5 ? clamp(uBeatAge * 2.4, 0.0, 1.0) : 1.0 - clamp(uBeatAge * 2.4, 0.0, 1.0));
      col += vec3(1.0, 0.9, 0.7) * step(abs(v.y - floor(woven)), 0.5) * exp(-abs(v.x - sxp) * 0.35) * 0.9 * uPunch;
    }
  }
  col *= 1.0 - 0.35 * ss(0.8, 1.9, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'kilim',
  name: 'Kilim',
  group: 'Things',
  blurb: 'A rug woven as the track plays; the shuttle crosses on every beat',
  tags: ['turkish', 'artwork', 'geometric'],
  energy: 0.4,
  particles: 0,
  trails: 0.2,
  zoom: 1,
  spin: 0,
  frag,
};
