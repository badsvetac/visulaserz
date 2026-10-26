// KEYS — a grand piano after hours in a jazz lounge, playing whatever is on and writing it in light.
//
// We sit where the pianist sits, a little above the keys: ivory and ebony running off both sides of
// the frame, the red felt and the brass of the name board behind them, the closed lid of the grand
// stretching away as a black mirror with a silk-shaded lamp standing on it, and past the piano the
// lounge, out of focus: a velvet curtain under a spotlight, candles on the tables, lamps on the wall.
//
// Every key owns its pitch on the spectrum (the analyser's bins are log-spaced, so a key's frequency
// is a place on it). A key plays when its pitch is a peak: louder than the keys a semitone either
// side, standing out from those three semitones off, and loud for its band. That picks a handful of
// keys at a time, the strongest partials, not a smear. The end octaves also listen an octave further
// out (each octave picked on its own, then the louder taken), so the sub-bass lands on the lowest
// keys, the treble's sparkle on the top ones, and a phone, which shows two octaves, still plays the
// whole track. A note's colour is its pitch class taken round the circle of fifths, so a song in one
// key plays in one arc of the palette.
//
// When a key plays it goes down and lights in its note's colour, and a column of that colour stands
// up out of the name board into the smoky air, the dust in it glinting. The notes of the last two
// seconds rise inside the columns as bars of light, white-hot where they leave the keys. (A roll that
// falls onto the keys would have to know the future; this one starts every bar when it is heard.)
//
// Music, element by element:
//   bass  — the low keys go down and ring on (they follow the slow spectrum) and their bars run
//           long; the spotlight on the curtain behind the piano swells with it.
//   mids  — the melody keys, their columns of light and most of the roll.
//   highs — the top keys (they hear the octave above), the dust glinting in the columns, the glitter
//           riding up inside the bars, and the candles out in the lounge twinkling.
//   beat  — a flash runs out along the brass inlay from the maker's plate, the edge the notes rise
//           from flares and lights the air above it, sparks fly up off every sounding key, the bars'
//           heads burn white and the lamp flickers; all of it gone within 0.45 s.
// With nothing playing the piano waits in the lamplight and no key moves.
const frag = `
const float KEYL = 6.4;            // a white key's length, in white-key widths (one is 2.35 cm)
const float BLKZ = 2.35;           // where the black keys begin, back from the front edge
const float BLKH = 0.52;           // how far the black keys stand above the white
const float BHW = 0.28;            // half a black key's width
const float GAP = 0.035;           // half the gap between two white keys
const float FRONTH = 0.62;         // the height of a white key's front face
const float SLIPZ = -1.3;          // the key slip in front of the keys: its front face
const float SLIPY = -0.52;         //   and its top
const float NBZ = 6.6;             // the name board behind the keys: its face
const float NBY = 2.3;             //   and its top, which is also the level of the lid
const float BARZ = 7.0;            // the plane the notes rise in, just behind the name board
const float DIP = 0.40;            // how far a pressed white key's front goes down
const float LAMPZ = 34.0;          // how far back on the lid the lamp stands
const float CURZ = 170.0;          // the curtain at the back of the lounge
const vec3 LK = vec3(-0.449, 0.849, -0.280);   // the key light: a warm spot up front, to the left
const vec3 LKC = vec3(0.98, 0.82, 0.62);
const vec3 LS = vec3(0.149, 0.747, 0.648);     // a soft light above and behind, for the gloss
const vec3 AMB = vec3(0.085, 0.065, 0.055);
const vec3 BRASS = vec3(0.78, 0.55, 0.24);
const vec3 LAMPC = vec3(1.0, 0.56, 0.24);      // the silk shade, lit from inside
const vec3 CANDLE = vec3(1.0, 0.46, 0.15);

float gA, gPix, gHbar, gCx, gMLo, gMHi, gFoldLo, gFoldHi, gBrass, gFlare, gLampK, gM0, gBassL, gMidL, gHighL;
float gBlank;                      // 1 while the history holds nothing at all yet
vec3 gLampP, gGlassP;
float W[9];                        // the levels of nine notes round the one we are looking at
float V[9];                        //   and of the nine an octave further out, in an end octave
float gPick[3];                    // how surely the middle three of them sound

float sq(float x) { return x * x; }

// ── the keyboard's layout: white key w = 0 is middle C, one unit wide ─────────────────────────────
float whiteNote(float w) { float o = floor(w / 7.0), d = w - o * 7.0; return 60.0 + o * 12.0 + (d < 3.0 ? d * 2.0 : d * 2.0 - 1.0); }
// the black key after white key w: x how far its centre sits off the boundary, y whether there is one
// (C# and D# lean apart, F# and A# too, the way a real keyboard is cut)
vec2 blackAfter(float w) {
  float d = w - floor(w / 7.0) * 7.0;
  float off = d == 0.0 ? -0.1 : d == 1.0 ? 0.1 : d == 3.0 ? -0.13 : d == 5.0 ? 0.13 : 0.0;
  return vec2(off, (d == 2.0 || d == 6.0) ? 0.0 : 1.0);
}
// the black key nearest x: its note (-1 if there is none there) and its centre
vec2 blackAt(float x) {
  float w = floor(x);
  float wb = x - w > 0.5 ? w : w - 1.0;
  vec2 b = blackAfter(wb);
  return vec2(b.y > 0.5 ? whiteNote(wb) + 1.0 : -1.0, wb + 1.0 + b.x);
}
bool isBlack(float m) { float pc = mod(m, 12.0); return pc == 1.0 || pc == 3.0 || pc == 6.0 || pc == 8.0 || pc == 10.0; }
// where note m's key (and its column) sits across the keyboard
float laneCentre(float m) {
  float o = floor((m - 60.0) / 12.0), pc = m - 60.0 - 12.0 * o;
  float w = 7.0 * o + (pc < 5.0 ? floor(pc / 2.0) : floor((pc + 1.0) / 2.0));
  return isBlack(m) ? w + 1.0 + blackAfter(w).x : w + 0.5;
}

// ── which notes are sounding ──────────────────────────────────────────────────────────────────────
// note m's place on the spectrum: 512 log-spaced bins from 30 Hz to 16 kHz
float xOf(float m) { return ((m - 69.0) / 12.0 + 3.8745) / 9.0589; }
float specAt(float x, float row) { return textureLod(uAudio, vec2(clamp(x, 0.002, 0.998), ROW(row)), 0.0).r; }
// a whole row of the history (nearest): blending two rows would ripple a faint note into stripes.
// The rows' edges still glide up the screen with the scroll (uHistFrac)
float histAt(float x, float age) {
  float row = max(floor(clamp(age, 0.0, 1.0) * 126.0 - uHistFrac + 0.5), 0.0);
  return textureLod(uHist, vec2(clamp(x, 0.004, 0.996), (row + 0.5) / 128.0), 0.0).r;
}
// one note's level now (age < 0) or that far up the roll; on the keys the low notes ring on, on
// the slow spectrum. Up the roll rows are averaged, two of them, four below middle C: the history is
// 8-bit, and two notes fading together would otherwise swap places every other row and draw a ladder
float noteE(float m, float age) {
  float x = xOf(m), e;
  if (age < 0.0) e = m < 52.0 ? max(specAt(x, 0.0), specAt(x, 3.0) * 0.94) : specAt(x, 0.0);
  else {
    e = histAt(x, age) + histAt(x, age + 0.017);
    e = m < 64.0 ? 0.25 * (e + histAt(x, age + 0.034) + histAt(x, age + 0.051)) : 0.5 * e;
  }
  return e * gA;
}
// the end octaves also listen an octave further out: the top one from the highest C with an octave
// of keys above it, the bottom one below the lowest C, so the sub-bass and the treble's air land on
// the keys a frame can show
float foldOf(float m) { return m >= gFoldHi ? 12.0 : m < gFoldLo ? -12.0 : 0.0; }
float levelOf(float m) { return mix(mix(gBassL, gMidL, ss(46.0, 54.0, m)), gHighL, ss(90.0, 98.0, m)); }
// a note's level that far up the roll, with the spectrum blended into the newest rows
float noteAt(float m, float age, float young) {
  float e = noteE(m, age);
  return young > 0.0 ? max(e, noteE(m, -1.0) * young) : e;
}
// the levels of the nine notes round m0 at this age (now when age < 0), and an octave out (f)
void levels(float m0, float f, float age, float young) {
  for (int i = 0; i < 9; i++) W[i] = noteAt(m0 + float(i) - 4.0, age, young);
  if (f != 0.0) for (int i = 0; i < 9; i++) V[i] = noteAt(m0 + f + float(i) - 4.0, age, young);
}
// how surely note m plays, from the levels round it (w[i] is m's own): loud for its band, above both
// neighbours, standing out from three semitones off, and not only the overtone of a louder note an
// octave below
float pickIn(float w[9], int i, float m, float lvl, float below) {
  float e = w[i], peak;
  if (m < 64.0) {
    // up to middle C a note is a hump two or three semitones wide (the analyser's bins are 23 Hz, and
    // its top is flat to within 8 bits there): the top is found smoothed across five, or it would hop
    float c = w[i] + 0.6 * (w[i - 1] + w[i + 1]) + 0.3 * (w[i - 2] + w[i + 2]);
    float l = w[i - 1] + 0.6 * (w[i - 2] + w[i]) + 0.3 * (w[i - 3] + w[i + 1]);
    float r = w[i + 1] + 0.6 * (w[i] + w[i + 2]) + 0.3 * (w[i - 1] + w[i + 3]);
    peak = ss(-0.01, 0.01, c - l) * ss(-0.002, 0.018, c - r);
  } else {
    // (two neighbours level with each other share it, half each, rather than taking turns row by row)
    float prom = m < 71.0 ? 0.015 : 0.03;
    peak = ss(-0.006, 0.006, e - w[i - 1]) * ss(-0.006, 0.006, e - w[i + 1]) * ss(prom, prom + 0.05, e - 0.5 * (w[i - 3] + w[i + 3]));
  }
  return peak * ss(0.7 * lvl, 0.7 * lvl + 0.1, e) * ss(-0.07, 0.01, e - 0.92 * below) * ss(0.1, 0.18, e);
}
// note m0 + i - 4: picked in its own octave and (in an end octave) the next one out, each on its
// own, the surer of the two
float pickAt(int i, float m0, float f, float age, float young) {
  float m = m0 + float(i) - 4.0;
  float p = pickIn(W, i, m, levelOf(m), noteAt(m - 12.0, age, young));
  if (f > 0.0) p = max(p, pickIn(V, i, m + 12.0, levelOf(m + 12.0), W[i]) * 0.93);
  else if (f < 0.0) p = max(p, pickIn(V, i, m - 12.0, levelOf(m - 12.0), noteAt(m - 24.0, age, young)) * 0.93);
  return p;
}
// Before the history holds anything (the first frame of a track, or a lab that hands the scene none)
// the notes sounding now stand in for the roll, as if struck on each of the last beats (taken as
// half a second apart): some short, some resting, the low ones held. Once there is a history, never
float strike(float m, float age) {
  float s = age * 2.1;                                           // seconds ago
  float k = max(ceil((s - uBeatAge) / 0.5), 0.0);                // beats back to the one that struck it
  float since = uBeatAge + k * 0.5 - s;                          // how long it had sounded by then
  float h = hash11(m * 1.618 + (uBeatCount - k) * 7.31);
  float len = k < 0.5 ? 9.0 : m < 52.0 ? (h < 0.55 ? 9.0 : 0.44) : h < 0.25 ? 0.0 : 0.16 + 0.3 * fract(h * 13.1);
  return ss(len + 0.012, len - 0.012, since);
}
float levelAt(int i, float f) { return f != 0.0 ? max(W[i], V[i]) : W[i]; }
// the palette taken round the circle of fifths
vec3 noteCol(float m) {
  vec3 c = pal(mod(mod(m, 12.0) * 7.0, 12.0) / 12.0);
  return mix(c / max(max(c.r, max(c.g, c.b)), 0.2), vec3(1.0), 0.08);
}
// the notes round x as they are now
void lanePicks(float x) {
  gM0 = whiteNote(floor(x));
  float f = foldOf(gM0);
  levels(gM0, f, -1.0, 0.0);
  for (int i = 0; i < 3; i++) gPick[i] = pickAt(i + 3, gM0, f, -1.0, 0.0);
}
float pressOf(float m) { float k = m - gM0; return abs(k) < 1.5 ? gPick[int(k + 1.5)] : 0.0; }
// the coloured light of the notes sounding round x
vec3 laneGlow(float x) {
  vec3 g = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float m = gM0 + float(i) - 1.0;
    float d = x - laneCentre(m);
    g += noteCol(m) * gPick[i] / (1.0 + 5.0 * d * d);
  }
  return g;
}
float segd(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0)); }

// ── the piano's case, seen from above ─────────────────────────────────────────────────────────────
// the straight bass side on the left, the bentside curving in from the treble end to a round tail
float caseRight(float z) { return mix(30.5, -6.0, ss(18.0, 89.0, z)); }
float caseSd(vec2 q) {
  float d = min(min(q.x + 24.5, caseRight(q.y) - q.x), q.y - (NBZ - 0.01));
  if (q.y > 89.0) d = min(d, 9.25 - length(q - vec2(-15.25, 89.0)));
  return d;
}

// ── the lamp on the lid, along a ray: a brass foot and stem, a pleated silk shade lit from inside ──
// soft blurs it (for its image in the lacquer)
vec4 lampAt(vec3 ro, vec3 rd, float soft) {
  vec3 o = ro - gLampP;
  vec3 lampC = LAMPC * gLampK;
  vec4 res = vec4(0.0);
  float dd = dot(rd.xz, rd.xz);
  float tl = -dot(o.xz, rd.xz) / max(dd, 1e-6);
  vec3 q = o + rd * tl;
  float r = length(q.xz), y = q.y;
  float px = tl * gPix + soft;
  bool near = tl > 0.0 && y > -px && y < 8.5 && r < 3.0;
  float fin = 0.0;
  vec3 finC = vec3(0.0);
  if (near) {
    // which way round the lamp this point of its outline faces, -1 .. 1 across
    float across = dot(q.xz, vec2(-rd.z, rd.x)) / max(sqrt(dd), 1e-6);
    // the brass: a domed foot, a slender stem with a collar, under the shade where the bulb lights it
    float rb = y < 0.62 ? 1.0 * (1.0 - 0.7 * ss(0.0, 0.62, y)) * (1.0 - 0.1 * ss(0.05, 0.0, y)) : 0.11 + 0.09 * exp(-sq((y - 2.3) / 0.12));
    float cb = ss(rb + px, rb - px, r) * ss(-px, px, y) * step(y, 4.5);
    float fb = sqrt(max(1.0 - r * r / max(rb * rb, 1e-4), 0.0));
    float lit = y < 0.62 ? ss(0.0, 0.55, y) : 0.35;
    vec3 bc = BRASS * (0.04 + 0.22 * fb + 0.9 * lit * lampC.r * (0.4 + 0.6 * ss(-0.3, 0.8, -across)))
            + vec3(1.0, 0.82, 0.55) * pow(fb, 16.0) * (0.15 + 0.5 * lit) * gLampK;
    // the shade: silk glowing through, brightest low down by the bulb, its pleats crowding to the edges
    float sv = (y - 4.4) / 3.2;
    float rs = mix(2.75, 1.75, sv);
    float cs = ss(rs + px, rs - px, r) * ss(-px, px, y - 4.4) * ss(px, -px, y - 7.6);
    float facing = sqrt(max(1.0 - r * r / (rs * rs), 0.0));
    float th = asin(clamp(across / rs, -1.0, 1.0));
    float pleat = 1.0 + 0.14 * cos(th * 26.0 + 0.5) * (0.4 + 0.6 * facing) * step(soft, 0.0);
    vec3 sc = lampC * (0.5 + 0.5 * facing) * pleat * (1.18 - 0.5 * sv);
    float trim = max(ss(0.16, 0.08, y - 4.4), ss(0.16, 0.08, 7.6 - y));
    sc = mix(sc, lampC * vec3(0.9, 0.62, 0.4) * (0.45 + 0.4 * facing), trim * step(soft, 0.0));
    res = vec4(mix(bc, sc, cs), max(cb, cs));
    // the finial on top
    float rf = 0.17 * sqrt(max(0.0, 1.0 - sq((y - 8.05) / 0.3)));
    fin = ss(rf + px, rf - px, r) * ss(7.6, 7.75, y);
    finC = BRASS * (0.12 + 0.5 * sqrt(max(1.0 - r * r / max(rf * rf, 1e-4), 0.0)));
  }
  // the shade's openings: looking down into the top one, or (in the lid) up into the bottom, the bulb in it
  if (abs(rd.y) > 1e-4) {
    bool down = rd.y < 0.0;
    float to = ((down ? 7.6 : 4.4) - o.y) / rd.y;
    if (to > 0.0) {
      vec2 qo = o.xz + rd.xz * to;
      float rr = down ? 1.75 : 2.75, pxo = to * gPix + soft;
      float inside = ss(rr + pxo, rr - pxo, length(qo));
      if (inside > 0.0) {
        vec3 ic = lampC * (down ? 1.05 : 1.3) * (0.8 + 0.2 * ss(rr, 0.0, length(qo))) + vec3(1.0, 0.8, 0.55) * gLampK * exp(-dot(qo, qo) / (down ? 0.3 : 0.9)) * 2.0;
        res = vec4(mix(res.rgb, ic, inside), max(res.a, inside));
      }
    }
  }
  return vec4(mix(res.rgb, finC, fin), max(res.a, fin));
}
// ── a tumbler of whiskey somebody left on the lid ────────────────────────────────────────────────
// Drawn on the plane through its axis that faces the ray, like the lamp; seen from above, each of
// its circles is an ellipse k times as tall as it is wide. The lamp behind lights the whiskey
// through, the colours of the notes round tx catch on its rim and on the whiskey, back is what lies
// behind it, and soft blurs it (its image in the lacquer)
const float TUMH = 3.6, TUMLEVEL = 1.55, TUMBASE = 0.5;
vec4 tumbler(vec3 ro, vec3 rd, vec3 back, float soft, float tx) {
  vec3 o = ro - gGlassP;
  float dd = dot(rd.xz, rd.xz);
  float tl = -dot(o.xz, rd.xz) / max(dd, 1e-6);
  if (tl <= 0.0) return vec4(0.0);
  vec3 q = o + rd * tl;
  float hd = sqrt(dd);
  float across = dot(q.xz, vec2(-rd.z, rd.x)) / hd, y = q.y;
  float k = abs(rd.y) / hd;
  float R = 1.5 + 0.1 * clamp(y / TUMH, 0.0, 1.0);
  if (abs(across) > R + 0.3 || y < -k * R - 0.3 || y > TUMH + k * R + 0.3) return vec4(0.0);
  float px = tl * gPix + soft;
  float u = across / R, cs = sqrt(max(1.0 - u * u, 0.0));
  float kr = k * R * cs;                                   // half the height of a circle's ellipse here
  float f = rd.y < 0.0 ? -kr : kr;                         // where its near edge sits: below the centre from above
  float a = ss(px, -px, abs(across) - R) * ss(-px, px, y + kr) * ss(px, -px, y - TUMH - kr);
  if (a <= 0.0) return vec4(0.0);
  vec3 tint = laneGlow(tx);
  vec3 amber = vec3(1.0, 0.46, 0.11) * gLampK;
  vec3 c;
  if (y < TUMBASE + f) {
    // the heavy base: clear glass with the whiskey's light gathered in it, bright where it meets the lid
    c = back * 0.6 + amber * (0.1 + 0.22 * cs * cs) + LAMPC * 0.35 * ss(0.14 + px, 0.0, abs(y - (TUMBASE + f)))
      + vec3(0.3, 0.28, 0.25) * ss(0.12 + px, 0.0, abs(y - f)) * 0.6;
  } else if (y < TUMLEVEL + f) {
    // the whiskey seen through the wall: lit through from the lamp behind, the light gathering low down
    c = back * vec3(0.45, 0.2, 0.05) + amber * (0.16 + 0.42 * exp(-sq((y - TUMBASE - 0.3) / 0.55)) * (0.5 + 0.5 * cs)) + tint * 0.12;
  } else {
    c = back * 0.92 + vec3(0.02, 0.02, 0.025) * cs;      // the empty glass above it
  }
  // the whiskey's surface: the lamp in it, the notes' colours on it, an ice cube riding in it
  float sv = (y - TUMLEVEL) / max(kr, 1e-3);
  float surf = ss(1.0 + px / max(kr, 1e-3), 1.0, abs(sv)) * step(0.0, -rd.y);
  if (surf > 0.0) {
    vec3 sc = amber * 0.3 + LAMPC * gLampK * 0.9 * exp(-sq((u + 0.3) / 0.22) - sq((sv - 0.45) / 0.35)) + tint * 0.45;
    // the ice: clear, so mostly the whiskey's colour through it, its edges and top catching the light
    vec2 ip = rot(0.35) * (vec2(across, y) - vec2(0.35, TUMLEVEL + 0.12));
    float id = length(max(abs(ip) - vec2(0.4, 0.28), 0.0)) - 0.12;
    float ice = ss(px, -px, id);
    vec3 icec = amber * 0.42 + vec3(0.5, 0.52, 0.55) * 0.18 + LAMPC * 0.7 * ss(0.05 + px, 0.0, abs(id + 0.04)) * ss(-0.3, 0.3, ip.y - 0.3 * ip.x)
              + vec3(0.9, 0.92, 1.0) * 0.12 * ss(0.2, 0.4, ip.y);
    sc = mix(sc, icec, ice);
    c = mix(c, sc, surf);
  }
  // the walls seen edge-on, the lamp's streak down the left of it, a cooler one on the right, the rim
  c += (vec3(0.4, 0.38, 0.36) * 0.25 + tint * 0.35) * ss(0.82, 1.0, abs(u));
  c += LAMPC * gLampK * 0.75 * exp(-sq((u + 0.62) / 0.07)) * ss(-0.3, 0.4, y) * ss(TUMH + 0.3, TUMH - 0.4, y);
  c += vec3(0.55, 0.6, 0.8) * 0.18 * exp(-sq((u - 0.72) / 0.05)) * ss(TUMBASE, TUMBASE + 0.6, y);
  float rimFront = abs(y - (TUMH + f)), rimBack = abs(y - (TUMH - f));
  c += (LAMPC * 0.45 + tint * 0.6 + 0.1) * (ss(0.06 + px, 0.0, rimFront) + 0.5 * ss(0.05 + px, 0.0, rimBack));
  return vec4(c, a);
}
// the haze in the air round the shade
vec3 lampHalo(vec3 ro, vec3 rd) {
  vec3 o = gLampP + vec3(0.0, 5.6, 0.0) - ro;
  float tc = max(dot(o, rd), 0.0);
  float d2 = max(dot(o, o) - tc * tc, 0.0);
  return vec3(1.0, 0.5, 0.18) * gLampK * (0.07 * exp(-d2 / 24.0) + 0.025 * exp(-d2 / 300.0));
}

// ── the lounge past the piano, out of focus ──────────────────────────────────────────────────────
// a row of lights on the plane z, as a lens draws lights it is not focused on: soft discs with a
// brighter rim. Each cell along x holds at most one; stretch draws them long, the way the lid's
// lacquer smears them
vec3 bokehRow(vec3 p, vec3 d, float z, float cell, float R, float ylo, float yhi, float keep, float seed, float stretch) {
  if (d.z <= 0.0) return vec3(0.0);
  vec2 q = p.xy + d.xy * ((z - p.z) / d.z);
  if (q.y < ylo - R * stretch * 1.3 || q.y > yhi + R * stretch * 1.3) return vec3(0.0);
  float k0 = floor(q.x / cell);
  vec3 col = vec3(0.0);
  for (int k = -1; k <= 1; k++) {
    float id = k0 + float(k);
    float h = hash11(id * 1.731 + seed);
    if (h > keep) continue;
    float h2 = hash11(id * 3.17 + seed * 1.3), h3 = hash11(id * 7.13 + seed * 2.1);
    float rr = R * (0.6 + 0.9 * h2 * h2);
    vec2 c = vec2((id + 0.5 + (h2 - 0.5) * 0.8) * cell, mix(ylo, yhi, h3));
    float r = length(vec2(q.x - c.x, (q.y - c.y) / stretch)) / rr;
    if (r >= 1.0) continue;
    float disc = stretch > 1.5 ? sq(1.0 - r * r) : ss(1.0, 0.86, r) * (0.6 + 0.4 * ss(0.4, 0.93, r));
    vec3 tint = mix(CANDLE, vec3(1.0, 0.68, 0.36), h3 * h3);
    if (fract(h * 13.7) > 0.86) tint = vec3(1.0, 0.2, 0.12);               // a red glass on that table
    float flick = 0.8 + 0.2 * noise(vec2(uTime * 2.7, id * 3.1 + seed));
    float tw = 1.0 + gHighL * 1.8 * sq(0.5 + 0.5 * sin(uTime * 9.0 + h * 70.0)) * step(0.35, h2);
    col += tint * disc * flick * tw * (0.25 + 0.55 * h / keep) * (1.25 - 0.45 * h2 * h2);   // the big ones are fainter
  }
  return col;
}
// the velvet at the back: a warm spotlight behind the piano that swells with the bass, and from the
// right a stage light through a blue gel, turning the red to plum where it rakes across the folds
vec3 curtain(vec3 q) {
  float ph = q.x * 0.1 + 0.9 * sin(q.x * 0.031 + 0.7) + 0.35 * sin(q.x * 0.083 + 2.1) + 0.04 * sin(uTime * 0.21 + q.y * 0.012);
  float fold = 0.5 + 0.5 * cos(ph * TAU);
  float side = -sin(ph * TAU);                                                // which way the fold faces
  vec3 velvet = mix(vec3(0.016, 0.003, 0.005), vec3(0.15, 0.02, 0.028), pow(fold, 1.4)) + vec3(0.24, 0.06, 0.05) * pow(fold, 8.0) * 0.22;
  vec2 s = (q.xy - vec2(gCx + 10.0, 2.0)) / vec2(40.0, 24.0);
  float spot = exp(-dot(s, s) * 1.4);
  vec2 g = (q.xy - vec2(gCx + 30.0 * uRes.x / uRes.y, 12.0)) / vec2(38.0, 30.0);
  float gel = exp(-dot(g, g)) * (0.35 + 0.65 * ss(-0.6, 0.9, side)) * (0.4 + 0.6 * fold);
  return velvet * (0.14 + spot * (0.8 + 1.1 * gBassL)) + vec3(0.05, 0.016, 0.01) * spot * gBassL
       + vec3(0.07, 0.04, 0.2) * gel;
}
vec3 room(vec3 p, vec3 d, float stretch) {
  vec3 c = curtain(p + d * ((CURZ - p.z) / max(d.z, 0.02)));
  c += bokehRow(p, d, 135.0, 21.0, 2.6, 30.0, 34.0, 0.8, 41.0, stretch) * 0.8;          // lamps hanging over the tables
  c += bokehRow(p, d, 146.0, 7.5, 1.6, -2.5, 3.5, 0.55, 11.0, stretch);               // the far tables
  c += bokehRow(p, d, 118.0, 11.0, 2.4, -1.0, 4.5, 0.45, 23.0, stretch);              // the near ones
  return c;
}

// ── the keys ──────────────────────────────────────────────────────────────────────────────────────
float blackAO(vec3 p) {
  vec2 b = blackAt(p.x);
  if (b.x < 0.0) return 1.0;
  float d = length(max(vec2(abs(p.x - b.y) - BHW, BLKZ - p.z), 0.0));
  return mix(0.6, 1.0, ss(0.0, 0.32, d));
}
float blackShadow(vec3 p) {
  float s = 1.0;
  for (int i = 1; i <= 2; i++) {
    vec2 q = p.xz + LK.xz / LK.y * (BLKH * 0.5 * float(i) - p.y);
    vec2 b = blackAt(q.x);
    if (b.x < 0.0) continue;
    s = min(s, ss(-0.02, 0.07, max(abs(q.x - b.y) - BHW, max(BLKZ - q.y, q.y - KEYL))));
  }
  return mix(0.42, 1.0, s);
}
// a white key's top: ivory in the spot, the note's colour when it is down
vec3 whiteTop(vec3 p, float w, float m, float press, vec3 rd, float t, vec3 glow) {
  float u = p.x - w;
  float px = t * gPix;
  float side = min(u, 1.0 - u) - GAP;
  vec3 alb = mix(vec3(0.84, 0.79, 0.68), vec3(0.76, 0.69, 0.56), ss(0.0, KEYL, p.z));
  alb *= 0.95 + 0.05 * noise(vec2(w * 17.0 + u * 2.5, p.z * 5.0));
  float bev = 1.0 - ss(0.0, 0.07, side);
  float lip = 1.0 - ss(0.0, 0.14, p.z);
  vec3 n = normalize(vec3(sign(u - 0.5) * bev * 0.75, 1.0, -lip * 0.85));
  float diff = max(dot(n, LK), 0.0);
  float sh = blackShadow(p);
  float ao = blackAO(p) * mix(0.55, 1.0, ss(KEYL, KEYL - 1.8, p.z));
  vec3 c = alb * (LKC * diff * sh + AMB + glow * 0.25 * ss(BLKZ - 1.0, KEYL, p.z)) * ao;
  c += LKC * pow(max(dot(n, normalize(LK - rd)), 0.0), 60.0) * 0.16 * sh;
  vec3 nc = noteCol(m);
  c = mix(c, nc * (0.3 + 0.45 * diff) * ao, press * 0.72) + nc * press * (0.2 + 0.25 * ss(KEYL - 2.0, KEYL, p.z));
  return mix(vec3(0.010, 0.008, 0.007) + nc * press * 0.08, c, ss(-0.6 * px, 0.6 * px, side));
}
vec3 whiteFront(vec3 p, float w, float m, float press, float dip, float t) {
  float u = p.x - w;
  float px = t * gPix;
  float yy = clamp((p.y + dip) / -FRONTH, 0.0, 1.0);
  vec3 c = vec3(0.80, 0.75, 0.64) * (LKC * 0.27 + AMB) * mix(1.0, 0.45, yy);
  c += LKC * 0.3 * (1.0 - ss(0.0, 0.14, yy));                // the rounded top edge catches the spot
  vec3 nc = noteCol(m);
  c = mix(c, nc * 0.28, press * 0.6) + nc * press * 0.14;
  return mix(vec3(0.008), c, ss(-0.6 * px, 0.6 * px, min(u, 1.0 - u) - GAP));
}
// face 0 the top, 1 the front, 2 the side turned towards us
vec3 blackKey(vec3 p, vec2 bk, float press, int face, vec3 rd, vec3 glow) {
  float a = (p.x - bk.y) / BHW;
  vec3 n = face == 0 ? normalize(vec3(a * 0.5, 1.0, -(1.0 - ss(BLKZ, BLKZ + 0.25, p.z)) * 0.9))
         : face == 1 ? vec3(0.0, 0.0, -1.0) : vec3(sign(a), 0.0, 0.0);
  float diff = max(dot(n, LK), 0.0);
  vec3 c = vec3(0.016, 0.014, 0.013) * (LKC * diff + AMB);
  c += LKC * pow(max(dot(n, normalize(LK - rd)), 0.0), 80.0) * 0.45;
  c += vec3(0.7, 0.62, 0.55) * pow(max(dot(n, normalize(LS - rd)), 0.0), 24.0) * 0.16;
  c += glow * (0.04 + 0.25 * pow(1.0 - max(dot(n, -rd), 0.0), 4.0)) * (face == 0 ? 1.0 : 0.3);
  if (face == 0) c += LKC * 0.07 * ss(0.8, 0.98, abs(a));     // the bevel along its edges
  vec3 nc = noteCol(bk.x);
  return mix(c, nc * (0.16 + 0.3 * diff), press * 0.8) + nc * press * 0.13;
}
// the key slip in front of the keys: black lacquer, a bright rounded edge
vec3 keySlip(vec3 p, bool top) {
  vec3 c = vec3(0.006, 0.005, 0.005);
  if (top) {
    c += LKC * 0.22 * ss(SLIPZ + 0.22, SLIPZ + 0.03, p.z);
    c += vec3(0.5, 0.45, 0.38) * 0.05 * ss(-0.55, -0.15, p.z);
  } else {
    c += LKC * 0.05 * ss(SLIPY - 1.2, SLIPY, p.y);
  }
  return c;
}

// ── the name board: red felt where the keys end, black lacquer, the brass ────────────────────────
vec3 nameBoard(vec3 p, vec3 rd, float t, vec3 glow) {
  float px = t * gPix;
  float y = p.y;
  if (y < 0.26) {
    float fz = noise(vec2(p.x * 11.0, y * 40.0));
    vec3 felt = vec3(0.30, 0.04, 0.05) * (0.6 + 0.3 * fz);
    return felt * (AMB * 2.5 + LKC * 0.12 * ss(-0.3, 0.26, y)) + glow * 0.04;
  }
  // the keyboard mirrored in the lacquer, faint and soft
  vec3 rr = vec3(rd.x, rd.y, -rd.z);
  float tk = -y / rr.y;
  vec3 pk = p + rr * tk;
  float blur = px + 0.06 * tk;
  float u = pk.x - floor(pk.x);
  vec2 bk = blackAt(pk.x);
  float isB = bk.x > 0.0 ? ss(blur, -blur, abs(pk.x - bk.y) - BHW) * ss(BLKZ - blur * 3.0, BLKZ + blur * 3.0, pk.z) : 0.0;
  float wm = whiteNote(floor(pk.x));
  vec3 kc = mix(vec3(0.55, 0.49, 0.40) * ss(GAP - blur, GAP + blur, min(u, 1.0 - u)), noteCol(wm) * 0.8, pressOf(wm) * 0.8);
  if (bk.x > 0.0) kc = mix(kc, vec3(0.01) + noteCol(bk.x) * 0.5 * pressOf(bk.x), isB);
  kc *= ss(-0.4, 0.4, pk.z) * ss(2.3, 0.4, y);
  vec3 c = vec3(0.006, 0.005, 0.005) + kc * 0.06;
  // the top edge rounds over: a line of light, the light of the notes rising behind it; on the beat it flares
  float edge = ss(NBY - 0.16, NBY - 0.02, y);
  c += (LKC * 0.16 + glow * 0.55 + (LKC * 0.8 + glow) * gFlare * 1.4) * edge;
  // the brass inlay and the maker's plate in the middle; on the beat a flash runs out along them
  float glint = exp(-sq(abs(p.x - gCx) - uBeatAge * 40.0) * 0.05) * gBrass;
  float inlay = ss(0.05 + px, 0.05 - px, abs(y - (NBY - 0.38)));
  vec2 q = abs(vec2(p.x - gCx, y - 1.25)) - vec2(1.6, 0.16);
  float ov = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.07;
  float plate = ss(px, -px, ov);
  float ring = ss(px * 1.5 + 0.006, 0.0, abs(ov + 0.05) - 0.008);
  float lines = 0.5 + 0.5 * cos((p.x - gCx) * 60.0);
  float sheen = ss(0.0, 0.035, (NBY - 0.38 + 0.05) - y) * ss(0.05, 0.02, abs(y - (NBY - 0.38 + 0.028)));
  vec3 brass = BRASS * (0.17 + 0.35 * sheen + gBrass * (0.9 * plate + 0.5) + 3.2 * glint) * (0.9 + 0.1 * lines * plate) * (1.0 - 0.5 * ring);
  return mix(c, brass, max(inlay, plate));
}

// what the ray meets among the keys and the key slip, or the foot of the name board behind them
vec3 whiteSurface(vec3 ro, vec3 rd, vec3 p0, float t0, float tNB, vec3 glow) {
  if (p0.z > KEYL) return nameBoard(ro + rd * tNB, rd, tNB, glow);
  if (p0.z >= 0.0) {
    float w = floor(p0.x), m = whiteNote(w), press = pressOf(m);
    if (press > 0.001) {
      float dip = DIP * press, k = 0.35 * dip / KEYL;
      float t = (-dip + k * ro.z - ro.y) / (rd.y - k * rd.z);
      return whiteTop(ro + rd * t, w, m, press, rd, t, glow);
    }
    return whiteTop(p0, w, m, 0.0, rd, t0, glow);
  }
  // in front of the keys: their front faces, a sunken key's top, then the key slip
  float tf = -ro.z / rd.z;
  vec3 pf = ro + rd * tf;
  float w = floor(pf.x), m = whiteNote(w), press = pressOf(m), dip = DIP * press;
  if (pf.y > -dip) {
    float k = 0.35 * dip / KEYL;
    float t = (-dip + k * ro.z - ro.y) / (rd.y - k * rd.z);
    return whiteTop(ro + rd * t, w, m, press, rd, t, glow);
  }
  if (pf.y > -dip - FRONTH) return whiteFront(pf, w, m, press, dip, tf);
  float ts = (SLIPY - ro.y) / rd.y;
  vec3 ps = ro + rd * ts;
  if (ps.z > -0.12) return vec3(0.004, 0.003, 0.003);
  if (ps.z > SLIPZ) return keySlip(ps, true);
  return keySlip(ro + rd * ((SLIPZ - ro.z) / rd.z), false);
}
vec3 keyboard(vec3 ro, vec3 rd, float tNB) {
  float t0 = -ro.y / rd.y;
  vec3 p0 = ro + rd * t0;
  lanePicks(p0.x);
  vec3 glow = laneGlow(p0.x);
  // on a black key's top (a pressed one sits lower)?
  float t1 = (BLKH - ro.y) / rd.y;
  vec2 bk1 = blackAt(ro.x + rd.x * t1);
  float pr1 = bk1.x > 0.0 ? pressOf(bk1.x) : 0.0;
  t1 = (BLKH - 0.3 * pr1 - ro.y) / rd.y;
  vec3 p1 = ro + rd * t1;
  float px1 = 0.7 * t1 * gPix, pz1 = px1 / max(-rd.y, 0.05);
  float topIn = bk1.x > 0.0 ? ss(-px1, px1, BHW - abs(p1.x - bk1.y)) * ss(-pz1, pz1, p1.z - BLKZ) * step(p1.z, KEYL) : 0.0;
  // or into one through its front or side?
  vec2 bk0 = blackAt(p0.x);
  float pr0 = bk0.x > 0.0 ? pressOf(bk0.x) : 0.0;
  float px0 = 0.7 * t0 * gPix, pz0 = px0 / max(-rd.y, 0.05);
  float footIn = bk0.x > 0.0 ? ss(-px0, px0, BHW - abs(p0.x - bk0.y)) * ss(-pz0, pz0, p0.z - BLKZ) * step(p0.z, KEYL) : 0.0;
  float cb = max(topIn, footIn);
  vec3 cB = vec3(0.0), cW = vec3(0.0);
  if (cb > 0.0) {
    if (topIn > 0.001) cB = blackKey(p1, bk1, pr1, 0, rd, glow);
    else {
      float tf = (BLKZ - ro.z) / rd.z;
      vec3 pf = ro + rd * tf;
      if ((abs(pf.x - bk0.y) < BHW && pf.y > 0.0) || abs(rd.x) < 1e-4) cB = blackKey(pf, bk0, pr0, 1, rd, glow);
      else {
        float ts = (bk0.y + BHW * sign(ro.x - bk0.y) - ro.x) / rd.x;
        cB = blackKey(ro + rd * ts, bk0, pr0, 2, rd, glow);
      }
    }
  }
  if (cb < 1.0) cW = whiteSurface(ro, rd, p0, t0, tNB, glow);
  return mix(cW, cB, cb);
}

// ── above the name board ──────────────────────────────────────────────────────────────────────────
// the lid: black lacquer, the lamp and the lounge in it, the lamplight pooled round the lamp's foot
vec3 lid(vec3 p, vec3 rd) {
  vec3 rr = vec3(rd.x, -rd.y, rd.z);
  float fres = 0.04 + 0.96 * pow(1.0 - abs(rd.y), 5.0);       // lacquer, n = 1.5
  // the lamp in it: sharp where it stands on the lacquer, softer and dimmer the higher it rises
  vec2 oa = p.xz - gLampP.xz;
  float hy = rr.y * max(-dot(oa, rr.xz) / max(dot(rr.xz, rr.xz), 1e-6), 0.0);
  vec4 lm = lampAt(p, rr, 0.05 + 0.13 * hy);
  lm.rgb *= 1.7 * exp(-hy * 0.24);
  vec3 refl = mix(room(p, rr, 3.2) * 1.3, lm.rgb, lm.a);
  vec4 gm = tumbler(p, rr, refl, 0.08, p.x);
  vec3 c = vec3(0.004, 0.0035, 0.0035) + mix(refl, gm.rgb, gm.a) * fres;
  // the lamplight the whiskey gathers, thrown on the lacquer in front of the glass
  vec2 dg = (p.xz - gGlassP.xz - normalize(gGlassP.xz - gLampP.xz) * 2.4) * vec2(1.0, 0.7);
  c += vec3(1.0, 0.45, 0.1) * gLampK * 0.1 * exp(-dot(dg, dg) / 1.6);
  vec2 dl = (p.xz - gLampP.xz) * vec2(1.0, 0.8);
  c += LAMPC * gLampK * (0.05 * exp(-dot(dl, dl) / 50.0) + 0.04 * exp(-dot(dl, dl) / 8.0));
  c += laneGlow(p.x) * 0.12 * exp(-max(p.z - BARZ, 0.0) * 0.4);
  c += LKC * 0.08 * (1.0 - ss(NBZ, NBZ + 0.25, p.z));
  // the rounded edge of the lid, catching the lamp
  float e = caseSd(p.xz);
  c += LAMPC * ss(0.45, 0.0, e) * (0.07 + 0.22 * exp(-length(dl) * 0.035));
  return c;
}
// past the lid: the case's side under its edge, or the lounge
vec3 beyond(vec3 ro, vec3 rd, float tL) {
  if (rd.y < 0.0) {
    float tb = (NBY - 11.0 - ro.y) / rd.y;
    if (caseSd((ro + rd * tb).xz) > 0.0) {
      // where the ray goes in through the side, found by halving
      float a = tL, b = tb;
      for (int i = 0; i < 6; i++) { float m = 0.5 * (a + b); if (caseSd((ro + rd * m).xz) > 0.0) b = m; else a = m; }
      vec3 p = ro + rd * b;
      float h = (NBY - p.y) / 11.0;
      vec3 c = vec3(0.006, 0.005, 0.005) + room(p, vec3(-rd.x, rd.y, rd.z), 1.6) * 0.14 * (1.0 - h);
      return c + LAMPC * 0.12 * ss(0.06, 0.0, h);
    }
  }
  return room(ro, rd, 1.0);
}
// a column of light standing over every key that sounds now, in the smoky air, and the dust in it
vec3 columns(vec3 pb, float tb) {
  float h = pb.y - NBY;
  if (h <= 0.0 || gA <= 0.0) return vec3(0.0);
  float age = h / gHbar;
  vec3 s = vec3(0.0), core = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    if (gPick[i] <= 0.001) continue;
    float m = gM0 + float(i) - 1.0;
    float wd = (isBlack(m) ? 0.24 : 0.36) * (1.0 + 0.35 * age);
    float d = (pb.x - laneCentre(m)) / wd;
    vec3 nc = noteCol(m) * gPick[i];
    s += nc * exp(-d * d);
    core += nc * exp(-d * d * 4.0) * exp(-h * 1.5);
  }
  float lum = dot(s, vec3(0.3, 0.5, 0.2));
  if (lum < 0.003) return vec3(0.0);
  vec2 sq0 = vec2(pb.x * 0.5, h * 0.12 - uTime * 0.22);
  float smoke = 0.15 + 0.85 * (0.62 * noise(sq0) + 0.38 * noise(sq0 * 2.6 + 4.1));
  vec3 col = (s * smoke * 0.34 + core * 0.25) * exp(-age * 2.2) * (1.0 + 0.9 * gFlare);   // the beat punches them
  // dust drifting up through the air, seen only where a column lights it; the highs make it glint
  if (lum > 0.01) {
    float cell = 0.42;
    vec2 g = vec2(pb.x, h - uTime * 0.32) / cell;
    vec2 id = floor(g), f = fract(g) - 0.5;
    float hh = hash21(id + 3.7);
    vec2 off = (vec2(hash21(id + 1.1), hash21(id + 8.3)) - 0.5) * 0.6 + vec2(0.12 * sin(uTime * 0.7 + hh * 20.0), 0.0);
    vec2 dpx = (f - off) * cell / (tb * gPix);
    float mote = exp(-dot(dpx, dpx) / 1.1) * step(0.5, hh);
    col += s * mote * (0.9 + 3.0 * gHighL * sq(0.5 + 0.5 * sin(uTime * 13.0 + hh * 90.0))) * exp(-age * 1.2);
  }
  return col;
}
// sparks thrown up off the sounding keys on the beat
vec3 sparks(vec3 pb, float tb) {
  float a = uBeatAge;
  if (gA <= 0.0 || a >= 0.45 || pb.y > NBY + 3.2) return vec3(0.0);       // they rise no higher than 2.8
  float px = tb * gPix;
  vec3 col = vec3(0.0);
  float fade = sq(1.0 - a / 0.45) * gA * (0.4 + 0.6 * uPunch);
  for (int i = 0; i < 3; i++) {
    float s = gPick[i];
    if (s <= 0.05) continue;
    float m = gM0 + float(i) - 1.0;
    float cx = laneCentre(m);
    vec3 nc = mix(noteCol(m), vec3(1.0), 0.5);
    for (int k = 0; k < 5; k++) {
      float fk = float(k);
      float h1 = hash11(m * 3.17 + uBeatCount * 7.31 + fk * 1.37), h2 = hash11(m * 5.71 + uBeatCount * 3.13 + fk * 2.11);
      vec2 v = vec2((h1 - 0.5) * 1.6, 4.0 + 6.0 * h2);
      vec2 p1 = vec2(cx + (h2 - 0.5) * 0.3, NBY) + v * a - vec2(0.0, 9.0) * a * a;
      vec2 p0 = p1 - (v - vec2(0.0, 18.0) * a) * 0.03;
      float d = segd(pb.xy, p0, p1);
      col += nc * s * (ss(0.045 + px, 0.0, d) * 1.4 + exp(-length(pb.xy - p1) / (0.08 + px)) * 0.6);
    }
  }
  return col * fade;
}
// one note's bar at this height: p how surely it sounds here, a how far across it (1 = its edge),
// e how loud it was
vec4 bar(float m, float p, float a, float pxa, float age, float e, vec3 pb) {
  float on = ss(0.15, 0.45, p) * ss(1.0 + pxa, 1.0 - pxa, a);
  if (on <= 0.0) return vec4(0.0);
  vec3 c = noteCol(m);
  // glass lit from inside: a paler core, the colour deepest between it and the edges, a bright rim
  vec3 body = c * (0.26 + 0.34 * e) + mix(c, vec3(1.0), 0.45) * (1.0 - a * a) * 0.22 + mix(c, vec3(1.0), 0.3) * ss(0.72, 0.96, a) * 0.5;
  body += mix(c, vec3(1.0), 0.65) * exp(-age * 26.0) * (1.0 + 1.4 * gFlare);    // white-hot by the keys while it sounds
  // the highs glitter in it, the glitter riding up with the bar
  vec2 g = vec2(pb.x * 4.0, (pb.y - uTime * gHbar * 0.476) * 4.0);
  vec2 gi = floor(g), gf = fract(g) - 0.5;
  float hg = hash21(gi + 7.0);
  body += vec3(1.0, 0.95, 0.9) * gHighL * step(0.86, hg) * exp(-dot(gf, gf) * 60.0) * (0.5 + 0.5 * sin(uTime * 23.0 * hg)) * 1.2;
  body *= (1.0 - 0.45 * age) * ss(1.0, 0.72, age);
  return vec4(body * on, on);
}
// the roll: the notes of the last two seconds rising out of the name board
// (lanePicks has been run for this lane: W, V and gPick hold the notes as they are now)
vec3 notes(vec3 pb, float tb) {
  float age = (pb.y - NBY) / gHbar;
  if (age <= 0.0 || age >= 1.0 || gA <= 0.0) return vec3(0.0);
  float w = floor(pb.x), m0 = gM0, f = foldOf(m0);
  vec2 bk = blackAt(pb.x);
  int ib = bk.x > m0 ? 5 : 3;
  float pW, pB = 0.0, eW, eB = 0.0;
  if (gBlank > 0.5) {
    pW = gPick[1] * strike(m0, age);
    eW = levelAt(4, f);
    if (bk.x > 0.0) { pB = gPick[ib - 3] * strike(bk.x, age); eB = levelAt(ib, f); }
  } else {
    float young = 1.0 - ss(0.0, 0.075, age);
    levels(m0, f, age, young);
    pW = pickAt(4, m0, f, age, young);
    eW = levelAt(4, f);
    if (bk.x > 0.0) { pB = pickAt(ib, m0, f, age, young); eB = levelAt(ib, f); }
  }
  float px = tb * gPix;
  vec4 c = bar(m0, pW, abs(pb.x - w - 0.5) / 0.4, px / 0.4, age, eW, pb);
  if (bk.x > 0.0) {
    vec4 b = bar(bk.x, pB, abs(pb.x - bk.y) / 0.25, px / 0.25, age, eB, pb);
    c.rgb = c.rgb * (1.0 - b.a) + b.rgb;
  }
  return c.rgb;
}

void main() {
  gA = uAudioActive;
  gBassL = gA * uBass; gMidL = gA * uMid; gHighL = gA * uHigh;
  float A = uRes.x / uRes.y;
  vec2 uv = centered();
  // the camera, where the pianist sits: a wide frame shows five octaves, a phone two
  float nvis = clamp(19.1 * A, 15.0, 40.0);
  gCx = 0.5 + (nvis - 15.0) * (3.5 / 21.0);
  const float F = 3.6;
  const float EL = 0.471;
  vec3 ro = vec3(gCx, 0.0, 3.2) + F * nvis / (2.0 * A) * vec3(0.0, sin(EL), -cos(EL));
  float pitch = -EL + atan(-mix(-0.68, -0.62, ss(0.6, 1.6, A)) / F);
  vec3 fwd = vec3(0.0, sin(pitch), cos(pitch)), up = vec3(0.0, cos(pitch), -sin(pitch));
  vec3 rd = normalize(vec3(uv.x, 0.0, 0.0) + up * uv.y + fwd * F);
  gPix = 2.0 / uRes.y / F;
  // how high the notes rise before they leave the frame: the roll is always the last two seconds
  vec3 rTop = normalize(up + fwd * F);
  gHbar = (ro.y + rTop.y * (BARZ - ro.z) / rTop.z - NBY) * 0.98;
  // the keys right across the front edge, and the top octaves that listen an octave further up
  float hw = A * dot(vec3(gCx, 0.0, 0.0) - ro, fwd) / F;
  gMLo = whiteNote(ceil(gCx - hw + 0.2));
  gMHi = whiteNote(floor(gCx + hw - 0.2) - 1.0);
  gFoldHi = floor((gMHi - 11.0) / 12.0) * 12.0;
  gFoldLo = ceil((gMLo + 1.0) / 12.0) * 12.0;
  // is there a history yet? (the same eight texels for every pixel)
  float hb = 0.0;
  for (int i = 0; i < 4; i++) hb = max(hb, max(histAt(0.12 + 0.2 * float(i), 0.15), histAt(0.12 + 0.2 * float(i), 0.6)));
  gBlank = hb < 0.002 ? 1.0 : 0.0;
  // the lamp on the lid, towards the back on the left
  gLampP = vec3(gCx - 0.6 * A * dot(vec3(gCx, NBY, LAMPZ) - ro, fwd) / F, NBY, LAMPZ);
  // and the glass, nearer, right of the middle
  gGlassP = vec3(gCx + 0.42 * A * dot(vec3(gCx, NBY, 17.0) - ro, fwd) / F, NBY, 17.0);
  // the beat: the brass flashes, the edge flares, the lamp flickers, all gone within 0.45 s
  float ba = uBeatAge;
  float on = gA * uPunch * (1.0 - ss(0.3, 0.45, ba));
  gBrass = on * exp(-ba * 6.0);
  gFlare = on * exp(-ba * 10.0);
  gLampK = 1.0 + on * (0.45 * exp(-ba * 16.0) - 0.28 * exp(-sq((ba - 0.12) / 0.04)) + 0.16 * exp(-sq((ba - 0.21) / 0.035)));

  vec3 col;
  float tNB = (NBZ - ro.z) / rd.z;
  float yNB = ro.y + rd.y * tNB;
  if (yNB < NBY) {
    if (yNB >= BLKH + 0.03) {
      vec3 p = ro + rd * tNB;
      lanePicks(p.x);
      col = nameBoard(p, rd, tNB, laneGlow(p.x));
    } else {
      col = keyboard(ro, rd, tNB);
    }
  } else {
    float tB = (BARZ - ro.z) / rd.z;
    vec3 pb = ro + rd * tB;
    lanePicks(pb.x);
    float tL = rd.y < 0.0 ? (NBY - ro.y) / rd.y : 1e9;
    vec3 pl = ro + rd * tL;
    vec3 back = rd.y < 0.0 && caseSd(pl.xz) > 0.0 ? lid(pl, rd) : beyond(ro, rd, tL);
    vec4 lm = lampAt(ro, rd, 0.0);
    back = mix(back, lm.rgb, lm.a) + lampHalo(ro, rd);
    vec4 gl = tumbler(ro, rd, back, 0.0, pb.x);
    back = mix(back, gl.rgb, gl.a);
    float h = pb.y - NBY;
    back += (LKC * 0.4 + laneGlow(pb.x) * 1.2) * gFlare * (exp(-h * 1.2) * 0.4 + exp(-h * 0.25) * 0.06);    // the air over the keys lit by the beat
    back += columns(pb, tB);
    back += sparks(pb, tB);
    col = back + notes(pb, tB);
  }
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'keys',
  name: 'Keys',
  group: 'Lab',
  blurb: 'A grand piano in a jazz lounge after hours: keys go down on the notes they hear, columns of light rise over them and the notes float up as bars',
  tags: ['analyser', 'piano', 'jazz', 'warm', 'night'],
  energy: 0.5,
  particles: 0,
  trails: 0,
  zoom: 1,
  spin: 0,
  frag,
};
