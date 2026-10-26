// CLASSIC — the Winamp 2 desktop of 1999: a player window, its equaliser, and a visualisation window
// docked beside them, on a teal desktop.
//
// It is the picture people remember from before any fullscreen plugin: a tiny analyser in the corner
// of a black LCD, nineteen bars with a peak dot falling above each, green digits counting the time,
// the title crawling along a marquee, and under it all an equaliser whose sliders people dragged into
// smiles. The skin here is drawn new (graphite with green LCDs), not copied from any real one, but it
// keeps the layout and the manners of that era.
//
// Everything is drawn from the music. The time is the track's real elapsed time, the seek bar its real
// position, and the marquee scrolls the real title. The volume slider rides the loudness like a meter
// and the balance slider leans with the stereo balance. The ten equaliser sliders are the ten classic
// bands (60 Hz to 16 kHz) read off the spectrum, so they dance, and the curve above them is drawn
// through their knobs. The small analyser switches to an oscilloscope every 16 beats, as a click on
// it used to. The big window beside them cycles through the modes of that era's plain-analyser
// plugins every 16 beats: bars coloured by row, "fire" bars coloured from their tops, an oscilloscope
// over a grid, and a scrolling spectrogram. The skin is pixel art: every skin pixel is drawn as a
// square block of screen pixels, and the text is a 5x5 pixel font.

// A 5x5 pixel font. Only what the labels need, plus digits.
const FONT = {
  A: ['.###.', '#...#', '#####', '#...#', '#...#'],
  B: ['####.', '#...#', '####.', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '####.', '#....', '#####'],
  F: ['#####', '#....', '####.', '#....', '#....'],
  H: ['#...#', '#...#', '#####', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '#####'],
  K: ['#...#', '#..#.', '###..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '####.', '#....', '#....'],
  Q: ['.###.', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '####.', '#..#.', '#...#'],
  S: ['.####', '#....', '.###.', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '.#.#.', '..#..'],
  Z: ['#####', '...#.', '..#..', '.#...', '#####'],
  0: ['.###.', '#..##', '#.#.#', '##..#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '.###.'],
  2: ['####.', '....#', '.###.', '#....', '#####'],
  3: ['####.', '....#', '.###.', '....#', '####.'],
  4: ['#...#', '#...#', '#####', '....#', '....#'],
  5: ['#####', '#....', '####.', '....#', '####.'],
  6: ['.###.', '#....', '####.', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '..#..'],
  8: ['.###.', '#...#', '.###.', '#...#', '.###.'],
  9: ['.###.', '#...#', '.####', '....#', '.###.'],
  '+': ['.....', '..#..', '.###.', '..#..', '.....'],
  '-': ['.....', '.....', '.###.', '.....', '.....'],
  ' ': ['.....', '.....', '.....', '.....', '.....'],
};
// a glyph as 25 bits, row by row from the top, left to right
const glyph = (ch) => (FONT[ch] || FONT[' ']).reduce((bits, row, r) => [...row].reduce((b, c, x) => (c === '#' ? b | (1 << (r * 5 + x)) : b), bits), 0);
// A GLSL function that returns 1 where a fixed label has ink: p is the pixel from the label's top left.
const label = (name, text) => {
  const codes = [...text].map(glyph);
  return `float ${name}(ivec2 p) {
  const int G[${codes.length}] = int[${codes.length}](${codes.join(', ')});
  if (p.x < 0 || p.y < 0 || p.y > 4 || p.x >= ${codes.length * 6}) return 0.0;
  int i = p.x / 6, x = p.x - i * 6;
  if (x > 4) return 0.0;
  return float((G[i] >> (p.y * 5 + x)) & 1);
}
`;
};
const width = (text) => text.length * 6 - 1;

// A narrow 3x5 font for the equaliser's band labels, which sit only 18 pixels apart.
const NARROW = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'],
};
const narrowGlyph = (ch) => NARROW[ch].reduce((bits, row, r) => [...row].reduce((b, c, x) => (c === '#' ? b | (1 << (r * 3 + x)) : b), bits), 0);
const narrowLabel = (name, text) => {
  const codes = [...text].map(narrowGlyph);
  return `float ${name}(ivec2 p) {
  const int G[${codes.length}] = int[${codes.length}](${codes.join(', ')});
  if (p.x < 0 || p.y < 0 || p.y > 4 || p.x >= ${codes.length * 4}) return 0.0;
  int i = p.x / 4, x = p.x - i * 4;
  if (x > 2) return 0.0;
  return float((G[i] >> (p.y * 3 + x)) & 1);
}
`;
};

const LABELS = {
  tMain: 'VISULASERZ', tEq: 'EQUALIZER', tVis: 'VISUALIZATION',
  lKbps: 'KBPS', lKhz: 'KHZ', lMono: 'MONO', lStereo: 'STEREO', lEq: 'EQ', lPl: 'PL',
  lOn: 'ON', lAuto: 'AUTO', lPresets: 'PRESETS', lShuffle: 'SHUFFLE', lLoop: 'LOOP',
  lP12: '+12', lZero: '+0', lM12: '-12', lPre: 'PRE',
};
const BANDS = ['60', '170', '310', '600', '1K', '3K', '6K', '12K', '14K', '16K'];
// where each band sits on the spectrum texture, which runs log-spaced from 30 Hz to 16 kHz
const BAND_X = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 15800].map((hz) => (Math.log2(hz / 30) / Math.log2(16000 / 30)).toFixed(4));

const labelCode = Object.entries(LABELS).map(([n, t]) => label(n, t)).join('')
  + BANDS.map((t, i) => narrowLabel(`band${i}`, t)).join('')
  + `float bandLabel(int i, ivec2 p) {
${BANDS.map((t, i) => `  if (i == ${i}) return band${i}(p - ivec2(${7 - Math.floor((t.length * 4 - 1) / 2)}, 0));`).join('\n')}
  return 0.0;
}
const float BAND_X[10] = float[10](${BAND_X.join(', ')});
`;

const DIGITS = `const int DIG[10] = int[10](${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => glyph(String(d))).join(', ')});
// a number in the small font, right-aligned in n digits
float smallNumber(ivec2 p, int value, int n) {
  if (p.x < 0 || p.y < 0 || p.y > 4 || p.x >= n * 6) return 0.0;
  int i = p.x / 6, x = p.x - i * 6;
  if (x > 4) return 0.0;
  int v = value;
  for (int k = 0; k < 6; k++) { if (k >= n - 1 - i) break; v /= 10; }
  return float((DIG[v % 10] >> (p.y * 5 + x)) & 1);
}
`;

const frag = `
${labelCode}
${DIGITS}
const vec3 DESK = vec3(0.0, 0.42, 0.44);
const vec3 EDGE = vec3(0.03, 0.03, 0.045);
const vec3 BODY = vec3(0.20, 0.21, 0.27);
const vec3 HI = vec3(0.45, 0.47, 0.56);
const vec3 LO = vec3(0.08, 0.08, 0.12);
const vec3 LCD = vec3(0.0, 0.03, 0.012);
const vec3 LCD_ON = vec3(0.12, 0.96, 0.28);
const vec3 LCD_GHOST = vec3(0.02, 0.14, 0.05);
const vec3 INK = vec3(0.80, 0.83, 0.90);

float gScale;      // screen pixels per skin pixel
ivec2 gOrigin;     // the player window's top left, in skin pixels

bool inRect(ivec2 p, ivec2 o, ivec2 size) { return p.x >= o.x && p.y >= o.y && p.x < o.x + size.x && p.y < o.y + size.y; }

// A panel with a one-pixel bevel: raised (light top-left, dark bottom-right) or sunk (the other way).
vec3 panel(ivec2 p, ivec2 size, vec3 face, bool sunk) {
  bool top = p.x == 0 || p.y == 0, bottom = p.x == size.x - 1 || p.y == size.y - 1;
  if (bottom) return sunk ? HI : LO;
  if (top) return sunk ? LO : HI;
  return face;
}

// The LED colours of an analyser: red at the top of the scale, through amber and yellow, to green.
vec3 meter(float t) {
  vec3 c = mix(vec3(0.95, 0.20, 0.06), vec3(0.90, 0.48, 0.02), ss(0.0, 0.25, t));
  c = mix(c, vec3(0.88, 0.76, 0.10), ss(0.2, 0.45, t));
  c = mix(c, vec3(0.55, 0.88, 0.16), ss(0.4, 0.65, t));
  return mix(c, vec3(0.10, 0.62, 0.05), ss(0.6, 1.0, t));
}

// The frame every window shares: dark edge, bevel, body, and a title bar with grooves either side of its name.
vec3 windowBase(ivec2 p, ivec2 size, bool lit, int title) {
  if (p.x == 0 || p.y == 0 || p.x == size.x - 1 || p.y == size.y - 1) return EDGE;
  vec3 col = panel(p - 1, size - 2, BODY * (1.08 - 0.12 * float(p.y) / float(size.y)), false);
  if (p.y >= 2 && p.y <= 12 && p.x >= 2 && p.x < size.x - 2) {
    col = BODY * 0.72;
    int tw = title == 0 ? ${width(LABELS.tMain)} : title == 1 ? ${width(LABELS.tEq)} : ${width(LABELS.tVis)};
    int tx = (size.x - tw) / 2;
    ivec2 tp = p - ivec2(tx, 5);
    float ink = title == 0 ? tMain(tp) : title == 1 ? tEq(tp) : tVis(tp);
    // grooves: lines either side of the name, the palette's colour when the window is active
    bool groove = (p.y == 4 || p.y == 6 || p.y == 8 || p.y == 10) && ((p.x > 5 && p.x < tx - 5) || (p.x > tx + tw + 4 && p.x < size.x - 38));
    vec3 accent = lit ? mix(pal(0.12), vec3(0.9, 0.75, 0.3), 0.35) : vec3(0.32, 0.33, 0.4);
    if (groove) col = accent * (p.y == 4 || p.y == 8 ? 1.0 : 0.62);
    col = mix(col, lit ? INK : INK * 0.6, ink);
    // three buttons at the right: minimise, shade, close
    for (int b = 0; b < 3; b++) {
      ivec2 bp = p - ivec2(size.x - 36 + b * 11, 3);
      if (inRect(bp, ivec2(0), ivec2(9, 9))) {
        col = panel(bp, ivec2(9, 9), BODY * 1.1, false);
        bool icon = b == 0 ? (bp.y == 6 && bp.x >= 2 && bp.x <= 6)
                  : b == 1 ? (bp.y == 2 && bp.x >= 2 && bp.x <= 6) || (bp.y == 6 && bp.x >= 2 && bp.x <= 6)
                  : (abs(bp.x - bp.y) < 1 || abs(bp.x + bp.y - 8) < 1) && bp.x >= 2 && bp.x <= 6;
        if (icon) col = INK * 0.9;
      }
    }
  }
  return col;
}

// Seven-segment LCD digit in a 9x13 cell; -1 draws a dash.
float segment(ivec2 p, int digit) {
  // which segments: a b c d e f g as bits 0..6
  const int SEG[10] = int[10](63, 6, 91, 79, 102, 109, 125, 7, 127, 111);
  int m = digit < 0 ? 64 : SEG[digit];
  bool a = p.y <= 1 && p.x >= 2 && p.x <= 6;
  bool b = p.x >= 7 && p.y >= 2 && p.y <= 5;
  bool c = p.x >= 7 && p.y >= 7 && p.y <= 10;
  bool d = p.y >= 11 && p.x >= 2 && p.x <= 6;
  bool e = p.x <= 1 && p.y >= 7 && p.y <= 10;
  bool f = p.x <= 1 && p.y >= 2 && p.y <= 5;
  bool g = p.y == 6 && p.x >= 2 && p.x <= 6;
  int here = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0) | (e ? 16 : 0) | (f ? 32 : 0) | (g ? 64 : 0);
  if (here == 0) return -1.0;               // not on any segment
  return (here & m) != 0 ? 1.0 : 0.0;       // lit, or a ghost
}

// The small analyser in the LCD: 19 bars of 3 pixels, or the oscilloscope.
vec3 miniVis(ivec2 p) {
  bool scope = mod(floor((uBeatCount + 8.0) / 16.0), 2.0) > 0.5;
  if (scope) {
    float y = 7.5 - wave((float(p.x) + 0.5) / 76.0) * 9.0;
    return abs(float(p.y) - y) < 0.75 ? mix(vec3(0.85, 0.9, 1.0), LCD_ON, 0.4) : LCD;
  }
  int bar = p.x / 4;
  if (p.x - bar * 4 == 3) return LCD;
  float x = 0.03 + 0.94 * (float(bar) + 0.5) / 19.0;
  float h = spec(x) * 17.5;
  float pk = peak(x) * 17.5;
  int fromBottom = 15 - p.y;
  if (float(fromBottom) < h) return meter(float(p.y) / 15.0);
  if (fromBottom == int(pk) && pk > 1.0) return vec3(0.6, 0.62, 0.66);
  return LCD;
}

// A horizontal slider groove with its thumb at pos (0..1); the groove's fill is given.
vec3 hslider(ivec2 p, ivec2 size, float pos, vec3 fill) {
  int tx = int(pos * float(size.x - 14));
  if (p.x >= tx && p.x < tx + 14 && p.y >= 1 && p.y < size.y - 1)
    return panel(p - ivec2(tx, 1), ivec2(14, size.y - 2), vec3(0.55, 0.57, 0.64), false) * (p.x == tx + 7 ? 0.6 : 1.0);
  if (p.y >= 4 && p.y < size.y - 4) return panel(p - ivec2(0, 4), ivec2(size.x, size.y - 8), fill, true);
  return BODY;
}

// A vertical equaliser slider: the groove, a fill from the zero line to the knob, the knob.
vec3 vslider(ivec2 p, float pos) {
  int ky = 58 - int(pos * 54.0);
  if (p.y >= ky - 3 && p.y <= ky + 3 && p.x >= 1 && p.x <= 12)
    return panel(p - ivec2(1, ky - 3), ivec2(12, 7), vec3(0.56, 0.58, 0.65), false) * (p.y == ky ? 0.55 : 1.0);
  if (p.x >= 5 && p.x <= 8 && p.y >= 3 && p.y <= 59) {
    int lo = min(ky, 31), hi = max(ky, 31);
    if (p.y >= lo && p.y <= hi && p.x >= 6 && p.x <= 7) return meter(1.0 - abs(pos - 0.5) * 2.0) * 0.95;
    return p.y == 31 ? vec3(0.4) : (p.x == 5 || p.x == 8 ? LO : vec3(0.02));
  }
  return BODY;
}

// What each equaliser band reads now, as a slider position (0 bottom, 1 top).
// (music has less energy up top, so the higher bands get a little lift to sit near the middle)
float bandPos(int i) { return clamp((slow(BAND_X[i]) - 0.2 + 0.16 * float(i) / 9.0) / 0.55, 0.0, 1.0); }

vec3 mainWindow(ivec2 p) {
  vec3 col = windowBase(p, ivec2(275, 116), true, 0);
  if (p.y < 14) return col;
  // the LCD: play mark, the time, the small analyser
  if (inRect(p, ivec2(9, 17), ivec2(95, 43))) {
    ivec2 l = p - ivec2(9, 17);
    col = panel(l, ivec2(95, 43), LCD, true);
    ivec2 pm = l - ivec2(8, 7);
    if (pm.x >= 0 && pm.x < 7 && pm.y >= 0 && pm.y < 9 && abs(pm.y - 4) * 3 <= (7 - pm.x) * 2) col = LCD_ON;
    float total = floor(uElapsed);
    int mins = int(min(floor(total / 60.0), 99.0)), secs = int(mod(total, 60.0));
    bool none = uDuration <= 0.0;
    for (int k = 0; k < 4; k++) {
      ivec2 dp = l - ivec2(k < 2 ? 30 + k * 11 : 56 + (k - 2) * 11, 6);
      if (inRect(dp, ivec2(0), ivec2(9, 13))) {
        int dg = none ? -1 : k == 0 ? mins / 10 : k == 1 ? mins % 10 : k == 2 ? secs / 10 : secs % 10;
        float s = segment(dp, dg);
        if (s >= 0.0) col = mix(LCD_GHOST, LCD_ON, s);
      }
    }
    if ((l.x == 52 || l.x == 53) && (l.y == 9 || l.y == 10 || l.y == 14 || l.y == 15)) col = LCD_ON;
    if (inRect(l, ivec2(10, 23), ivec2(76, 16))) col = miniVis(l - ivec2(10, 23));
    return col;
  }
  // the marquee: the real title, crawling
  if (inRect(p, ivec2(111, 19), ivec2(154, 14))) {
    ivec2 l = p - ivec2(111, 19);
    col = panel(l, ivec2(154, 14), LCD, true);
    if (l.x > 0 && l.x < 153 && l.y > 0 && l.y < 13) {
      // the text is sampled on dots twice as fine as the skin's pixels, like an LCD matrix
      vec2 fine = floor(vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / gScale * 2.0) * 0.5 + 0.25;
      vec2 lf = fine - vec2(gOrigin) - vec2(111.0, 19.0);
      float u = fract(lf.x / 145.0 + uTime * 0.12);
      float v = 1.0 - (74.0 + (lf.y - 0.5) / 12.0 * 68.0) / 256.0;
      col = mix(col, LCD_ON, ss(0.3, 0.6, texture(uText, vec2(u, v)).a));
    }
    return col;
  }
  // bitrate and sample rate, and which of mono and stereo is lit
  if (inRect(p, ivec2(111, 37), ivec2(19, 9))) { ivec2 l = p - ivec2(111, 37); return mix(panel(l, ivec2(19, 9), LCD, true), LCD_ON, smallNumber(l - ivec2(1, 2), 128, 3)); }
  if (inRect(p, ivec2(160, 37), ivec2(13, 9))) { ivec2 l = p - ivec2(160, 37); return mix(panel(l, ivec2(13, 9), LCD, true), LCD_ON, smallNumber(l - ivec2(1, 2), 44, 2)); }
  col = mix(col, INK * 0.85, lKbps(p - ivec2(133, 39)) + lKhz(p - ivec2(176, 39)));
  col = mix(col, INK * 0.35, lMono(p - ivec2(203, 39)));
  col = mix(col, LCD_ON, lStereo(p - ivec2(231, 39)));
  // volume rides the loudness like a meter, balance leans with the stereo balance
  if (inRect(p, ivec2(111, 51), ivec2(68, 13))) {
    ivec2 l = p - ivec2(111, 51);
    float lev = clamp(uLevel * 1.15, 0.0, 1.0);
    return hslider(l, ivec2(68, 13), lev, meter(1.0 - lev) * 0.8);
  }
  if (inRect(p, ivec2(182, 51), ivec2(38, 13))) {
    ivec2 l = p - ivec2(182, 51);
    return hslider(l, ivec2(38, 13), clamp(0.5 + 0.5 * uBalance, 0.0, 1.0), vec3(0.16, 0.17, 0.2));
  }
  for (int b = 0; b < 2; b++) {
    ivec2 l = p - ivec2(224 + b * 22, 52);
    if (inRect(l, ivec2(0), ivec2(20, 11))) {
      col = panel(l, ivec2(20, 11), BODY * 1.15, b == 0);
      float ink = b == 0 ? lEq(l - ivec2(4, 3)) : lPl(l - ivec2(4, 3));
      return mix(col, b == 0 ? LCD_ON : INK * 0.7, ink);
    }
  }
  // the seek bar
  if (inRect(p, ivec2(16, 69), ivec2(248, 10))) {
    ivec2 l = p - ivec2(16, 69);
    int tx = int(clamp(uProgress, 0.0, 1.0) * 219.0);
    if (l.x >= tx && l.x < tx + 29) return panel(l - ivec2(tx, 0), ivec2(29, 10), vec3(0.55, 0.57, 0.64), false) * ((l.x - tx) % 4 == 2 && l.y > 2 && l.y < 7 ? 0.7 : 1.0);
    return panel(l, ivec2(248, 10), mix(vec3(0.06), pal(0.12) * 0.35, float(l.x < tx)), true);
  }
  // transport: previous, play, pause, stop, next; eject; shuffle and loop; the app's mark
  for (int b = 0; b < 5; b++) {
    ivec2 l = p - ivec2(16 + b * 23, 84);
    if (inRect(l, ivec2(0), ivec2(23, 18))) {
      col = panel(l, ivec2(23, 18), BODY * 1.2, false);
      ivec2 c = l - ivec2(11, 9);
      bool icon = false;
      if (b == 1) icon = c.x >= -3 && c.x <= 4 && abs(c.y) * 2 <= 4 - c.x + 3;
      else if (b == 2) icon = abs(c.y) <= 4 && (c.x == -3 || c.x == -2 || c.x == 2 || c.x == 3);
      else if (b == 3) icon = abs(c.x) <= 4 && abs(c.y) <= 4;
      else {
        int sx = b == 0 ? -c.x : c.x;                      // next: two triangles pointing right, then a bar; previous mirrors it
        icon = (sx >= -5 && sx <= -1 && abs(c.y) <= -1 - sx) || (sx >= 0 && sx <= 4 && abs(c.y) <= 4 - sx) || (sx == 5 && abs(c.y) <= 4);
      }
      if (icon) col = b == 1 ? LCD_ON * (0.8 + 0.4 * exp(-uBeatAge * 6.0)) : INK * 0.85;
      return col;
    }
  }
  if (inRect(p, ivec2(134, 85), ivec2(22, 16))) {
    ivec2 l = p - ivec2(134, 85);
    col = panel(l, ivec2(22, 16), BODY * 1.2, false);
    ivec2 c = l - ivec2(11, 7);
    if ((c.y >= -4 && c.y <= 0 && abs(c.x) <= c.y + 4) || (c.y >= 2 && c.y <= 3 && abs(c.x) <= 5)) col = INK * 0.85;
    return col;
  }
  if (inRect(p, ivec2(161, 86), ivec2(46, 14))) { ivec2 l = p - ivec2(161, 86); return mix(panel(l, ivec2(46, 14), BODY * 1.15, false), INK * 0.8, lShuffle(l - ivec2(3, 5))); }
  if (inRect(p, ivec2(208, 86), ivec2(29, 14))) { ivec2 l = p - ivec2(208, 86); return mix(panel(l, ivec2(29, 14), BODY * 1.15, true), LCD_ON, lLoop(l - ivec2(3, 5))); }
  if (inRect(p, ivec2(245, 83), ivec2(20, 20))) {
    ivec2 l = p - ivec2(245, 83);
    float y = float(l.y) - 3.0;
    bool v = y >= 0.0 && y <= 13.0 && (abs(float(l.x) - 3.0 - y * 0.5) < 1.2 || abs(float(l.x) - 16.0 + y * 0.5) < 1.2);
    if (v) return mix(pal(0.1), vec3(1.0), 0.25) * (0.75 + 0.6 * exp(-uBeatAge * 5.0) * uPunch);
  }
  return col;
}

vec3 eqWindow(ivec2 p) {
  vec3 col = windowBase(p, ivec2(275, 116), false, 1);
  if (p.y < 14) return col;
  if (inRect(p, ivec2(14, 18), ivec2(25, 12))) { ivec2 l = p - ivec2(14, 18); return mix(panel(l, ivec2(25, 12), BODY * 1.15, true), LCD_ON, lOn(l - ivec2(7, 4))); }
  if (inRect(p, ivec2(40, 18), ivec2(32, 12))) { ivec2 l = p - ivec2(40, 18); return mix(panel(l, ivec2(32, 12), BODY * 1.15, false), INK * 0.7, lAuto(l - ivec2(5, 4))); }
  if (inRect(p, ivec2(217, 18), ivec2(46, 12))) { ivec2 l = p - ivec2(217, 18); return mix(panel(l, ivec2(46, 12), BODY * 1.15, false), INK * 0.8, lPresets(l - ivec2(3, 4))); }
  // the curve through the ten knobs
  if (inRect(p, ivec2(86, 17), ivec2(113, 19))) {
    ivec2 l = p - ivec2(86, 17);
    col = panel(l, ivec2(113, 19), vec3(0.01), true);
    if (l.y == 9 && l.x % 2 == 0) col = vec3(0.14);
    float fx = (float(l.x) - 4.0) / 105.0 * 9.0;
    if (fx >= 0.0 && fx <= 9.0) {
      int i = int(min(floor(fx), 8.0));
      float f = fx - float(i);
      float p0 = bandPos(max(i - 1, 0)), p1 = bandPos(i), p2 = bandPos(i + 1), p3 = bandPos(min(i + 2, 9));
      // Catmull-Rom through the knobs
      float v = 0.5 * ((2.0 * p1) + (-p0 + p2) * f + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * f * f + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * f * f * f);
      float y = 9.5 - (clamp(v, 0.0, 1.0) - 0.5) * 15.0;
      if (abs(float(l.y) + 0.5 - y) < 0.9) col = meter(1.0 - clamp(v, 0.0, 1.0));
    }
    float pre = 9.5 - (clamp(uLevel * 1.1, 0.0, 1.0) - 0.5) * 15.0;
    if (abs(float(l.y) + 0.5 - pre) < 0.5 && l.x > 1 && l.x < 111 && l.x % 3 == 0) col = vec3(0.35, 0.4, 0.45);
    return col;
  }
  // the preamp and the ten bands
  if (inRect(p, ivec2(21, 38), ivec2(14, 63))) return vslider(p - ivec2(21, 38), clamp(uLevel * 1.1, 0.0, 1.0));
  for (int i = 0; i < 10; i++) {
    ivec2 l = p - ivec2(78 + i * 18, 38);
    if (inRect(l, ivec2(0), ivec2(14, 63))) return vslider(l, bandPos(i));
    col = mix(col, INK * 0.7, bandLabel(i, p - ivec2(78 + i * 18, 104)));
  }
  col = mix(col, INK * 0.7, lP12(p - ivec2(44, 38)) + lZero(p - ivec2(47, 67)) + lM12(p - ivec2(44, 96)) + lPre(p - ivec2(20, 104)));
  return col;
}

// The big window: bars by row, fire bars, oscilloscope, spectrogram, 16 beats each.
vec3 visWindow(ivec2 p, ivec2 size) {
  vec3 col = windowBase(p, size, false, 2);
  if (p.y < 14) return col;
  ivec2 o = ivec2(7, 16), inner = size - ivec2(14, 23);
  if (!inRect(p, o, inner)) return col;
  ivec2 l = p - o;
  col = panel(l, inner, vec3(0.0), true);
  if (l.x < 2 || l.y < 2 || l.x >= inner.x - 2 || l.y >= inner.y - 2) return col;
  ivec2 c = l - 2, area = inner - 4;
  int mode = int(mod(floor(uBeatCount / 16.0), 4.0));
  if (mode == 2) {
    // oscilloscope over a grid of dots
    col = (c.x % 12 == 0 && c.y % 12 == 0) ? vec3(0.08, 0.14, 0.1) : vec3(0.0);
    if (c.y == area.y / 2 && c.x % 3 == 0) col = vec3(0.08, 0.16, 0.1);
    float y = float(area.y) * 0.5 - wave((float(c.x) + 0.5) / float(area.x)) * float(area.y) * 0.45;
    float y2 = float(area.y) * 0.5 - wave((float(c.x) + 1.5) / float(area.x)) * float(area.y) * 0.45;
    float lo = min(y, y2) - 0.6, hi = max(y, y2) + 0.6;
    if (float(c.y) + 0.5 >= lo && float(c.y) + 0.5 <= hi) col = mix(LCD_ON, vec3(0.9, 1.0, 0.9), 0.35);
    return col;
  }
  if (mode == 3) {
    // spectrogram: now at the top, the past falling away, two-pixel cells
    ivec2 cell = c / 2;
    float x = (float(cell.x) + 0.5) / float(area.x / 2);
    float age = (float(cell.y) + 0.5) / float(area.y / 2);
    float v = hist(0.02 + 0.96 * x, age * 0.95);
    // quiet stays dark green, loud climbs through yellow to red
    return meter(1.0 - ss(0.25, 0.85, v)) * ss(0.12, 0.6, v) * 1.1;
  }
  // bars: six pixels wide with two dark, rows of two pixels with one dark
  int nb = area.x / 8;
  int x0 = (area.x - nb * 8) / 2;
  int rows = area.y / 3;
  int y0 = area.y - rows * 3;
  int bi = (c.x - x0) / 8, bx = (c.x - x0) - bi * 8;
  int r = (c.y - y0) / 3, ry = (c.y - y0) - r * 3;
  if (c.x < x0 || bi >= nb || c.y < y0 || bx >= 6 || ry >= 2) return vec3(0.0);
  float x = 0.02 + 0.96 * (float(bi) + 0.5) / float(nb);
  float h = spec(x) * 1.08 * float(rows);
  float pk = peak(x) * 1.08 * float(rows);
  int fromBottom = rows - 1 - r;
  if (float(fromBottom) < h) {
    if (mode == 0) return meter(float(r) / float(rows - 1));                 // coloured by row
    return meter((h - float(fromBottom) - 1.0) / float(rows) * 1.6);        // fire: every bar is red at its top
  }
  if (fromBottom == int(pk) && pk > 1.0) return vec3(0.62, 0.64, 0.68);
  return vec3(0.0);
}

void main() {
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  // skin pixels as whole blocks of screen pixels where the screen allows it
  float fit = min(uRes.y / 250.0, uRes.x / 480.0);
  float s = fit >= 1.0 ? max(1.0, floor(fit * 0.9)) : fit;
  vec2 sk = fc / s;
  ivec2 ip = ivec2(floor(sk));
  float wsk = uRes.x / s, hsk = uRes.y / s;
  int wv = int(clamp(floor(wsk - 295.0), 150.0, 560.0));
  ivec2 o = ivec2(int(floor((wsk - float(275 + wv)) * 0.5)), int(floor((hsk - 232.0) * 0.5)));
  gScale = s;
  gOrigin = o;
  // the desktop: teal, a little darker toward the corners
  vec2 uv = fc / uRes;
  vec3 col = DESK * (1.0 - 0.35 * ss(0.3, 1.1, length(uv - 0.5)));
  ivec2 lp = ip - o;
  if (inRect(lp, ivec2(0), ivec2(275, 116))) col = mainWindow(lp);
  else if (inRect(lp, ivec2(0, 116), ivec2(275, 116))) col = eqWindow(lp - ivec2(0, 116));
  else if (inRect(lp, ivec2(275, 0), ivec2(wv, 232))) col = visWindow(lp - ivec2(275, 0), ivec2(wv, 232));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'classic',
  name: 'Classic',
  group: 'Things',
  blurb: 'The Winamp 2 desktop: pixel analyser with falling peaks, green LCD time, crawling title, a dancing EQ',
  tags: ['winamp', 'retro', 'analyser', 'nostalgia'],
  energy: 0.4,
  particles: 0,
  trails: 0.0,
  zoom: 1,
  spin: 0,
  frag,
};
