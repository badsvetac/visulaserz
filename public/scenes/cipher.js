// CIPHER — digital rain.
//
// Every column listens to one band (bass in the middle of the screen, treble at the edges): a
// louder band means a longer, brighter tail. The glyphs are not a font — each is a handful of
// strokes picked by a hash, redrawn a few times a second. Where the track's title would be
// printed, the cells stay lit, so the name of the song condenses out of the rain.
const frag = `
float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// A pseudo-character: four strokes on a 3 × 4 lattice of anchor points, chosen by the bits of h.
float glyph(vec2 uv, float h) {
  vec2 q = uv - 0.5;
  float d = 1e3;
  for (int i = 0; i < 4; i++) {
    float hi = hash11(h * 91.7 + float(i) * 13.1);
    float hj = hash11(h * 47.3 + float(i) * 7.7);
    float hk = hash11(h * 23.9 + float(i) * 3.3);
    float row = (floor(hj * 4.0) - 1.5) * 0.24;
    float cx = (floor(hk * 3.0) - 1.0) * 0.28;
    vec2 a, b;
    if (hi < 0.4)      { a = vec2(-0.28, row); b = vec2(hk < 0.5 ? 0.28 : 0.0, row); }
    else if (hi < 0.8) { a = vec2(cx, -0.36);  b = vec2(cx, hj < 0.5 ? 0.36 : 0.0); }
    else               { a = vec2(-0.28, row); b = vec2(0.28, -row); }
    d = min(d, seg(q, a, b));
  }
  return 1.0 - ss(0.035, 0.08, d);
}

vec3 rainLayer(vec2 p, float rows, float speedMul, float seedL, float aspect, float titleAmt) {
  float cellH = 2.0 / rows;
  float cellW = cellH * 0.62;
  vec2 g = vec2(p.x / cellW, (p.y + 1.0) / cellH);
  vec2 id = floor(g);
  vec2 uv = fract(g);
  float hc = hash11(id.x * 1.37 + seedL);
  float s = spec(0.02 + abs((id.x + 0.5) * cellW) / aspect * 0.75);
  float len = 8.0 + 22.0 * s + 6.0 * hc;
  float span = rows + len + 6.0;
  float speed = (0.35 + 0.9 * hc) * speedMul;
  float tail = 0.0, head = 0.0;
  for (int k = 0; k < 2; k++) {                                         // two drops share each column
    float hr = span - fract(hc * 7.0 + float(k) * 0.53 + uTravel * 0.06 * speed) * span;
    float behind = id.y - hr;
    tail = max(tail, behind >= 0.0 ? exp(-behind / len * 3.0) * step(behind, len) : 0.0);
    head = max(head, 1.0 - ss(0.0, 1.2, abs(behind)));
  }
  float tick = floor(uTime * (2.0 + 6.0 * hash21(id + seedL)) + hash21(id) * 10.0);
  float gl = glyph(uv, hash21(id + tick * 0.37 + seedL));

  // the title, sampled once per cell so it is spelled in whole glyphs
  float w = min(aspect * 0.92, 1.9);
  vec2 cc = vec2((id.x + 0.5) * cellW, (id.y + 0.5) * cellH - 1.0);
  vec2 tuv = cc / vec2(w, w * 0.25) * 0.5 + 0.5;
  float ink = textureLod(uText, clamp(tuv, 0.0, 1.0), 0.0).a * step(abs(tuv.x - 0.5), 0.5) * step(abs(tuv.y - 0.5), 0.5);
  ink *= titleAmt;

  vec3 c = pal(0.33 + 0.12 * hc) * (tail * (0.35 + 1.4 * s) + ink * (0.55 + 0.9 * uBass))
         + vec3(0.85, 1.0, 0.92) * (head * (0.8 + uBeat * uPunch) + ink * 0.25);
  return c * gl;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  p *= 1.0 - uBeat * 0.015 * uPunch;
  vec3 col = pal(0.35) * 0.02 * (0.5 + uLevel);
  col += rainLayer(p + vec2(0.013, 0.0), 58.0, 0.6, 17.0, aspect, 0.0) * 0.35;       // a farther, finer layer
  col += rainLayer(p, 34.0, 1.0, 0.0, aspect, 1.0);
  // a scan line sweeps down the screen after every beat
  float sweep = 1.0 - uBeatAge * 2.4;
  col *= 1.0 + 1.6 * exp(-abs(p.y - sweep) * 9.0) * exp(-uBeatAge * 2.0) * uPunch;
  col *= 1.0 - 0.45 * ss(0.7, 1.9, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'cipher',
  name: 'Cipher',
  group: 'Lab',
  blurb: 'Digital rain with one band per column; the song title condenses out of it',
  tags: ['retro', 'text', 'night'],
  energy: 0.6,
  particles: 0,
  trails: 0.55,
  zoom: 1,
  spin: 0,
  frag,
};
