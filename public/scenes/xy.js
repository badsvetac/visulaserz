// XY — a vintage round-screen vectorscope on the bench at night, drawing the music as glowing
// green figures, oscilloscope-music style. The beam is this scene's own points: 16 384 of them,
// spaced evenly in TIME along the last 512 samples of the waveform and added together, so the
// trace glows brighter where the beam lingers (the tips of the petals) and dimmer where it races,
// the way a P31 phosphor does. The picture shader draws the instrument around it: a blue-grey
// hammertone panel under a desk lamp, engraved lettering, the bezel with its screws, the curved
// glass with the lamp and the window in it, an edge-lit amber graticule, skirted knobs, a magic-eye
// tube, a red pilot jewel, a neon, BNC inputs with their leads hanging out of the frame.
//
// The figure: real XY material is rare and mono material on a goniometer is a dead line, so the
// scope makes its own second channel: the wave a quarter of its main period earlier (the period
// found from how fast the wave changes against how big it is), with whatever still matches the
// first channel taken out. A tone draws a circle, a bass note with harmonics a looping wreath. Both
// are smoothed below ~0.4 kHz first, so hats and hiss do not scratch the line. The beam then runs
// an epicycle on that circle's phase, which opens every turn into a flower of 3 to 7 petals.
//
// Music: the BASS sets the gain (the figure swells) and closes the magic eye's shadow; the MIDS
// cut the petals deeper and turn the figure; the HIGHS make the beam fizz with glints and ripple
// and flicker the PEAK neon; every BEAT flares the beam white-hot, lights the glass and flashes
// the BEAT jewel, all gone within ~0.4 s, and every 16th beat the flower changes its number of
// petals (a 0.4 s morph). Playing silence, the spot killer blanks the beam. With nothing playing
// at all the scope shows its own calibrator: a slow standby flower that steps through the orders.

// The panel's silk-screen is a stroke font, the way an engraving machine or a plotter letters:
// each glyph is a few straight strokes on a 4 x 6 grid (x0 y0 x1 y1, y up from the baseline),
// drawn with round ends. Packed three bits a number, twelve a stroke.
const GLYPHS = {
  A: '0026 2640 1333', B: '0006 0636 3645 4544 4433 0333 3342 4241 4130 3000',
  C: '4536 3616 1605 0501 0110 1030 3041', E: '4606 0600 0040 0333', F: '4606 0600 0333',
  G: '4536 3616 1605 0501 0110 1030 3041 4143 4323', H: '0006 4046 0343', I: '2026 1636 1030',
  K: '0006 4602 1340', L: '0600 0040', N: '0006 0640 4046',
  O: '1030 3041 4145 4536 3616 1605 0501 0110', P: '0006 0636 3645 4544 4433 3303',
  R: '0006 0636 3645 4544 4433 3303 2340', S: '4536 3616 1605 0504 0413 1333 3342 4241 4130 3010 1001',
  T: '0646 2620', U: '0601 0110 1030 3041 4146', V: '0620 2046', W: '0610 1024 2430 3046',
  X: '0046 0640', Y: '0623 4623 2320', Z: '0646 4600 0040', 1: '1526 2620 1030',
  2: '0516 1636 3645 4544 4400 0040', 5: '4606 0604 0434 3443 4341 4130 3010 1001', '-': '1333', ' ': '',
};
const WORDS = ['X GAIN', 'Y GAIN', 'X POS', 'Y POS', 'CH1 X', 'CH2 Y', 'LEVEL', 'BEAT', 'PEAK',
  'POWER', 'INTENS', 'FOCUS', 'VISULASERZ', 'XY-5', 'VECTORSCOPE', 'L', 'R', 'X', 'Y', 'HORIZ', 'VERT', 'TRACE'];
const strokes = [];
const glyph = {};
for (const [ch, s] of Object.entries(GLYPHS)) {
  const list = s.split(' ').filter(Boolean).map((q) => [...q].reduce((a, d) => a * 8 + Number(d), 0));
  glyph[ch] = strokes.length | (list.length << 10);
  strokes.push(...list);
}
const codes = [];
const at = {};
for (const w of WORDS) { at[w] = [codes.length, w.length]; for (const ch of w) codes.push(glyph[ch]); }
const word = (w) => `${at[w][0]}, ${at[w][1]}`;

const common = `
float gAsp, gPort, gU;
vec2 gC; float gR;            // the screen: centre and radius
// the instrument is laid out for the frame: the controls beside the tube on a wide screen, under
// it on a phone held upright
void place() {
  gAsp = uRes.x / uRes.y;
  gPort = step(gAsp, 1.0);
  gU = gPort > 0.5 ? min(1.0, gAsp / 0.5625) : min(1.0, gAsp / 1.7778);
  gC = gPort > 0.5 ? vec2(0.0, 0.38) : vec2(-0.46, 0.0) * gU;
  gR = (gPort > 0.5 ? 0.385 : 0.62) * gU;
}
vec2 at(vec2 land, vec2 port) { return gPort > 0.5 ? port * vec2(gU, 1.0) : land * gU; }
float sz(float land, float port) { return (gPort > 0.5 ? port : land) * gU; }
// the music, gated: with nothing playing none of it reaches the picture
float gOn, gBass, gMid, gHigh, gFlare;
void signals() {
  gOn = uAudioActive;
  gBass = gOn * clamp(uBass * 1.25, 0.0, 1.0);
  gMid = gOn * clamp(uMid * 1.4, 0.0, 1.0);
  gHigh = gOn * clamp(uHigh * 1.5, 0.0, 1.0);
  gFlare = gOn * uPunch * exp(-uBeatAge / 0.11) * step(0.5, uBeatCount);
}
float figureSize() { return gR * (mix(0.6, 0.5, gOn) + 0.34 * gBass); }      // the calibrator draws a little larger
`;

const frag = `${common}
const int STROKE[${strokes.length}] = int[${strokes.length}](${strokes.join(', ')});
const int TXT[${codes.length}] = int[${codes.length}](${codes.join(', ')});
float gPx;
vec3 gLamp;                                  // the desk lamp, up and to the left, out of frame
vec3 gPool;                                  // the pool its shade throws: centre, radius
const vec3 LAMP = vec3(1.0, 0.78, 0.52);
const vec3 AMB = vec3(0.014, 0.019, 0.027);
const vec3 FILL = vec3(0.15, 0.23, 0.40);    // the night at the window, to the right
const vec3 P31 = vec3(0.22, 1.0, 0.45);
const vec3 AMBER = vec3(1.0, 0.60, 0.28);
const vec3 INK = vec3(0.88, 0.87, 0.82);

vec2 gEye, gJewel, gNeon, gTog, gBnc[2], gPlate;
float gEyeR, gJewelR, gNeonR, gTogR, gBncR;
vec2 gKnob[6]; float gKnobR[6]; float gKnobA[6];
vec3 gGlowJ, gGlowN, gGlowE;                 // what the jewel, the neon and the magic eye give off

float pool(vec2 p) { return mix(0.16, 1.0, ss(1.0, 0.78, length(p - gPool.xy) / gPool.z)); }
// how the lamp (in its pool) and the window light a surface at p with normal n
vec3 lit(vec2 p, vec3 n, vec3 albedo, float shine, float gloss) {
  vec3 l = gLamp - vec3(p, 0.0);
  float d2 = dot(l, l);
  l *= inversesqrt(d2);
  float fall = 3.4 / (1.0 + d2 * 0.5) * pool(p);
  float nl = max(dot(n, l), 0.0);
  float norm = shine * (gloss + 8.0) / 25.0;
  float sp = pow(max(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0), gloss) * norm;
  vec3 f = normalize(vec3(1.0, 0.3, 0.6));
  float fl = max(dot(n, f), 0.0);
  float fs = pow(max(dot(n, normalize(f + vec3(0.0, 0.0, 1.0))), 0.0), gloss) * norm;
  return albedo * (AMB + LAMP * nl * fall + FILL * fl) + LAMP * sp * fall + FILL * fs * 0.8;
}

// coverage of a line of half-width w at distance d, antialiased over a pixel
float cover(float d, float w) { return clamp((w - d) / gPx + 0.5, 0.0, 1.0); }
float disc(float r, float rad) { return clamp((rad - r) / gPx + 0.5, 0.0, 1.0); }
float segD(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
float boxD(vec2 q, vec2 b, float r) {
  vec2 e = abs(q) - b + r;
  return length(max(e, 0.0)) + min(max(e.x, e.y), 0.0) - r;
}

// lettering: the strokes of each glyph on its 4 x 6 grid with round ends; h is the cap height
float label(vec2 p, vec2 centre, float h, int start, int len) {
  float u = h / 6.0;                                         // one step of the grid
  float w = float(len) * 6.5 - 2.5;
  vec2 q = (p - centre) / u + vec2(w * 0.5, 3.0);            // grid steps from the left end of the baseline
  if (q.x < -1.5 || q.y < -1.5 || q.x > w + 1.5 || q.y > 7.5) return 0.0;
  int ch = int(clamp(floor((q.x + 1.25) / 6.5), 0.0, float(len - 1)));
  vec2 l = q - vec2(float(ch) * 6.5, 0.0);
  int g = TXT[start + ch];
  int s0 = g & 1023, n = g >> 10;
  float d = 99.0;
  for (int i = 0; i < 12; i++) {
    if (i >= n) break;
    int k = STROKE[s0 + i];
    d = min(d, segD(l, vec2(float((k >> 9) & 7), float((k >> 6) & 7)), vec2(float((k >> 3) & 7), float(k & 7))));
  }
  float hw = max(0.5 * u, gPx * 0.62);
  return clamp((hw - d * u) / gPx + 0.5, 0.0, 1.0);
}

void layoutParts() {
  gEye = at(vec2(1.10, 0.65), vec2(0.0, -0.30));      gEyeR = sz(0.105, 0.095);
  gJewel = at(vec2(0.76, 0.66), vec2(-0.38, -0.29));  gJewelR = sz(0.042, 0.04);
  gNeon = at(vec2(1.44, 0.66), vec2(0.38, -0.29));    gNeonR = sz(0.036, 0.034);
  gTog = at(vec2(-1.52, 0.50), vec2(0.0, -0.88));     gTogR = sz(0.055, 0.048);
  gBnc[0] = at(vec2(0.80, -0.68), vec2(-0.27, -0.88)); gBnc[1] = at(vec2(1.40, -0.68), vec2(0.27, -0.88));
  gBncR = sz(0.07, 0.058);
  gPlate = at(vec2(-1.52, 0.80), vec2(0.0, 0.937));
  gKnob[0] = at(vec2(0.80, 0.15), vec2(-0.27, -0.61)); gKnobR[0] = sz(0.12, 0.115); gKnobA[0] = 0.7;
  gKnob[1] = at(vec2(1.40, 0.15), vec2(0.27, -0.61));  gKnobR[1] = sz(0.12, 0.115); gKnobA[1] = -0.5;
  gKnob[2] = at(vec2(0.80, -0.30), vec2(9.0));         gKnobR[2] = sz(0.09, 0.0); gKnobA[2] = 0.15;
  gKnob[3] = at(vec2(1.40, -0.30), vec2(9.0));         gKnobR[3] = sz(0.09, 0.0); gKnobA[3] = -0.25;
  gKnob[4] = at(vec2(-1.52, -0.06), vec2(9.0));         gKnobR[4] = sz(0.08, 0.0); gKnobA[4] = 1.1;
  gKnob[5] = at(vec2(-1.52, -0.56), vec2(9.0));        gKnobR[5] = sz(0.08, 0.0); gKnobA[5] = -0.9;
}

// ── the panel: blue-grey hammertone enamel ─────────────────────────────────────────────────────
// The enamel dries into shallow round dimples of different sizes, each a little bowl, with soft
// ridges where they meet: a smooth minimum over the nearest nine. Returns the slope of the surface
// (in dimple units) and how far down the bowl the pixel sits.
vec3 hammer(vec2 p) {
  vec2 q = p * 21.0;
  vec2 ip = floor(q), fp = fract(q);
  float sw = 0.0;
  vec2 sg = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = ip + vec2(float(i), float(j));
    vec2 r = vec2(float(i), float(j)) + 0.5 + 0.32 * (vec2(hash21(c), hash21(c + 19.7)) * 2.0 - 1.0) - fp;
    float s = 0.78 + 0.26 * hash21(c + 7.1);
    float d2 = dot(r, r) / (s * s);
    float w = exp(-5.0 * d2);
    sw += w;
    sg -= w * 2.0 * r / (s * s);
  }
  return vec3(sg / max(sw, 1e-20), clamp(-log(max(sw, 1e-20)) / 5.0, 0.0, 2.0));
}
vec3 panel(vec2 p) {
  vec3 hm = hammer(p);
  vec3 n = normalize(vec3(-hm.xy * 0.075, 1.0));
  float paint = 0.94 + 0.12 * noise(p * 3.0 + 1.7);
  vec3 alb = vec3(0.12, 0.195, 0.235) * paint;
  return lit(p, n, alb, 0.3, 22.0);
}

// a printed box round a group of controls, open at the top for its title
float groupBox(vec2 p, vec2 c, vec2 b, float gap) {
  vec2 q = p - c;
  float d = abs(boxD(q, b, 0.035 * gU));
  return cover(d, gPx * 0.45 + 0.0015 * gU) * (1.0 - step(abs(q.x), gap) * step(0.0, q.y));
}

// everything printed on the panel: dials around the knobs, boxes and words
float printing(vec2 p) {
  float ink = 0.0;
  for (int i = 0; i < 6; i++) {
    float rk = gKnobR[i];
    if (rk <= 0.0) continue;
    vec2 q = p - gKnob[i];
    float r = length(q);
    if (r > rk * 1.62 || r < rk * 1.15) continue;
    float a = atan(q.x, q.y);                          // 0 up, clockwise
    if (abs(a) > 2.64) continue;                        // the dial covers 300 degrees
    float stepA = 2.618 / 10.0;
    float k = floor(a / stepA + 0.5);
    float big = abs(mod(k, 5.0)) < 0.5 ? 1.0 : 0.0;
    float len = mix(0.09, 0.18, big) * rk;
    float d = abs(a - k * stepA) * r;
    ink = max(ink, cover(d, gPx * 0.5 + rk * 0.008) * step(rk * 1.24, r) * step(r, rk * 1.24 + len) * step(abs(k), 10.0));
    ink = max(ink, cover(abs(r - rk * 1.22), gPx * 0.35) * 0.7 * step(abs(a), 2.618));
  }
  float h = sz(0.028, 0.027);
  if (gPort < 0.5) {
    ink = max(ink, groupBox(p, at(vec2(0.80, -0.20), vec2(0.0)), vec2(0.27, 0.63) * gU, 0.12 * gU));
    ink = max(ink, groupBox(p, at(vec2(1.40, -0.20), vec2(0.0)), vec2(0.27, 0.63) * gU, 0.10 * gU));
    ink = max(ink, groupBox(p, at(vec2(-1.52, -0.30), vec2(0.0)), vec2(0.2, 0.55) * gU, 0.10 * gU));
    ink = max(ink, label(p, at(vec2(0.80, 0.43), vec2(0.0)), h, ${word('HORIZ')}));
    ink = max(ink, label(p, at(vec2(1.40, 0.43), vec2(0.0)), h, ${word('VERT')}));
    ink = max(ink, label(p, at(vec2(-1.52, 0.25), vec2(0.0)), h, ${word('TRACE')}));
    ink = max(ink, label(p, at(vec2(0.80, 0.362), vec2(0.0)), h, ${word('X GAIN')}));
    ink = max(ink, label(p, at(vec2(1.40, 0.362), vec2(0.0)), h, ${word('Y GAIN')}));
    ink = max(ink, label(p, at(vec2(0.80, -0.137), vec2(0.0)), h, ${word('X POS')}));
    ink = max(ink, label(p, at(vec2(1.40, -0.137), vec2(0.0)), h, ${word('Y POS')}));
    ink = max(ink, label(p, at(vec2(0.80, -0.56), vec2(0.0)), h, ${word('CH1 X')}));
    ink = max(ink, label(p, at(vec2(1.40, -0.56), vec2(0.0)), h, ${word('CH2 Y')}));
    ink = max(ink, label(p, at(vec2(1.10, 0.478), vec2(0.0)), h, ${word('LEVEL')}));
    ink = max(ink, label(p, at(vec2(0.76, 0.572), vec2(0.0)), h, ${word('BEAT')}));
    ink = max(ink, label(p, at(vec2(1.44, 0.572), vec2(0.0)), h, ${word('PEAK')}));
    ink = max(ink, label(p, at(vec2(-1.52, 0.385), vec2(0.0)), h, ${word('POWER')}));
    ink = max(ink, label(p, at(vec2(-1.52, 0.115), vec2(0.0)), h, ${word('INTENS')}));
    ink = max(ink, label(p, at(vec2(-1.52, -0.385), vec2(0.0)), h, ${word('FOCUS')}));
    ink = max(ink, label(p, at(vec2(-1.52, 0.92), vec2(0.0)), h, ${word('VISULASERZ')}));
  } else {
    ink = max(ink, label(p, at(vec2(0.0), vec2(-0.27, -0.418)), h, ${word('X GAIN')}));
    ink = max(ink, label(p, at(vec2(0.0), vec2(0.27, -0.418)), h, ${word('Y GAIN')}));
    ink = max(ink, label(p, at(vec2(0.0), vec2(0.0, -0.452)), h, ${word('LEVEL')}));
    ink = max(ink, label(p, at(vec2(0.0), vec2(-0.38, -0.214)), h, ${word('BEAT')}));
    ink = max(ink, label(p, at(vec2(0.0), vec2(0.38, -0.214)), h, ${word('PEAK')}));
    ink = max(ink, label(p, at(vec2(0.0), vec2(-0.41, -0.88)), h, ${word('X')}));
    ink = max(ink, label(p, at(vec2(0.0), vec2(0.41, -0.88)), h, ${word('Y')}));
  }
  return ink;
}

// soft shadows the raised parts throw down and to the right, away from the lamp
float shade(vec2 p) {
  vec2 o = vec2(0.022, -0.03) * gU;
  float s = ss(gR * 1.27 + 0.05, gR * 1.27 - 0.03, length(p - gC - o * 1.4)) * 0.75;
  for (int i = 0; i < 6; i++) {
    if (gKnobR[i] <= 0.0) continue;
    s = max(s, ss(gKnobR[i] * 1.2 + 0.035, gKnobR[i] * 0.9, length(p - gKnob[i] - o * 1.1)) * 0.7);
  }
  s = max(s, ss(gEyeR * 1.25 + 0.03, gEyeR * 0.9, length(p - gEye - o)) * 0.7);
  for (int i = 0; i < 2; i++) s = max(s, ss(gBncR * 1.3 + 0.03, gBncR * 0.8, length(p - gBnc[i] - o)) * 0.65);
  s = max(s, ss(gTogR * 1.2 + 0.03, gTogR * 0.6, length(p - gTog - o)) * 0.6);
  vec2 pb = vec2(sz(0.17, 0.2), sz(0.065, 0.032));
  s = max(s, ss(0.02, -0.01, boxD(p - gPlate - o * 0.5, pb, 0.012)) * 0.6);
  // the leads hang in front of the panel
  for (int i = 0; i < 2; i++) {
    vec2 c = gBnc[i];
    float y = p.y + o.y * 1.6;
    float k = clamp((c.y - y) / 0.6, 0.0, 1.0);
    float cx = c.x + (i == 0 ? -1.0 : 1.0) * 0.12 * gU * k * k;
    s = max(s, ss(0.065 * gU, 0.012 * gU, abs(p.x - o.x * 1.6 - cx)) * step(y, c.y) * 0.6);
  }
  return s;
}

// ── a skirted knob: machined aluminium skirt, fluted black cap, spun aluminium insert ───────────
vec3 knob(vec2 p, vec2 c, float rk, float ang, vec3 col) {
  vec2 q = (p - c) / rk;
  float r = length(q);
  if (r > 1.14 + gPx / rk) return col;
  float px = gPx / rk;
  vec2 d = q / max(r, 1e-4);
  vec2 ld = normalize(gLamp.xy - c);
  float lampI = 3.4 / (1.0 + dot(gLamp - vec3(c, 0.0), gLamp - vec3(c, 0.0)) * 0.5) * pool(c);
  vec2 iv = vec2(sin(ang), cos(ang));
  // the skirt: circular graining makes a bright bow-tie toward the lamp
  vec3 n = normalize(vec3(d * ss(0.92, 1.12, r) * 1.2, 1.0));
  float grain = hash11(floor(r * rk / (gPx * 1.3)) + 3.0);
  float bow = pow(1.0 - abs(d.x * ld.y - d.y * ld.x), 12.0);
  vec3 alu = vec3(0.55, 0.57, 0.6) * (0.85 + 0.25 * grain);
  vec3 sk = lit(p, n, alu * 0.42, 0.3, 30.0) + LAMP * alu * bow * 0.22 * lampI * (0.6 + 0.4 * grain)
          + FILL * alu * pow(1.0 - abs(d.y), 10.0) * 0.5;
  float idx = cover(abs(q.x * iv.y - q.y * iv.x) * rk, gPx * 0.6 + rk * 0.012) * step(0.84, dot(q, iv)) * step(dot(q, iv), 1.06);
  sk = mix(sk, vec3(0.02), idx * 0.85);
  sk *= 1.0 - 0.55 * ss(0.86, 0.72, length(q - vec2(0.07, -0.09)));      // the cap's shadow
  col = mix(col, sk, disc(r * rk, 1.12 * rk));
  // the cap: fluted sides, a softly domed top
  float a = atan(q.y, q.x);
  float rc = 0.80 - 0.035 * (0.5 + 0.5 * cos(a * 22.0));
  if (r < rc + px) {
    vec3 cn;
    if (r > 0.6) cn = normalize(vec3(d * 1.1 + vec2(-d.y, d.x) * sin(a * 22.0) * 0.18, 0.55));
    else cn = normalize(vec3(q * 0.5, 1.0));
    vec3 cap = lit(p, cn, vec3(0.020, 0.019, 0.018), 0.9, 70.0) + lit(p, cn, vec3(0.0), 0.2, 8.0);
    cap *= 0.8 + 0.2 * ss(0.62, 0.58, r);
    cap = mix(cap, INK * 0.45 * (0.3 + lampI * 0.5), cover(segD(q, iv * 0.5, iv * 0.74) * rk, gPx * 0.5 + rk * 0.02));
    // the spun aluminium insert, with the index across it
    float g2 = hash11(floor(r * rk / (gPx * 1.1)) + 9.0);
    vec3 ins = lit(p, normalize(vec3(q * 0.2, 1.0)), vec3(0.5, 0.52, 0.55) * (0.32 + 0.12 * g2), 0.25, 20.0)
             + LAMP * vec3(0.55) * pow(1.0 - abs(d.x * ld.y - d.y * ld.x), 10.0) * 0.28 * lampI * (0.7 + 0.3 * g2)
             + FILL * 0.25 * pow(1.0 - abs(d.y), 8.0);
    ins = mix(ins, vec3(0.015), cover(segD(q, vec2(0.0), iv * 0.42) * rk, gPx * 0.5 + rk * 0.016));
    cap = mix(cap, ins, clamp((0.45 - r) / px + 0.5, 0.0, 1.0));
    col = mix(col, cap, clamp((rc - r) / px + 0.5, 0.0, 1.0));
  }
  return col;
}

// ── the magic eye: a tuning-indicator tube seen end-on; its shadow closes with the bass ──────────
vec3 magicEye(vec2 p, vec3 col) {
  vec2 q = (p - gEye) / gEyeR;
  float r = length(q);
  if (r > 1.24 + gPx / gEyeR) return col;
  vec2 d = q / max(r, 1e-4);
  // chrome escutcheon
  float t = clamp((r - 0.96) / 0.26, 0.0, 1.0);
  vec3 ring = lit(p, normalize(vec3(d * cos(t * PI) * 0.9, 0.7)), vec3(0.30), 1.6, 60.0);
  col = mix(col, ring, disc(r * gEyeR, 1.22 * gEyeR));
  // behind the glass, the fluorescent target: a fan of green with a shadow that closes on the bass
  float open = mix(0.95, 0.08, gBass);                                 // half-angle of the shadow
  float th = abs(atan(q.x, q.y));                                     // 0 at the top
  float on = ss(open - 0.03, open + 0.03, th);
  float edge = exp(-max(th - open, 0.0) * 7.0);
  float band = ss(0.30, 0.34, r) * ss(0.88, 0.80, r);
  float streak = 0.82 + 0.18 * noise(vec2(atan(q.y, q.x) * 26.0, 0.5));
  vec3 tgt = gGlowE * band * on * mix(1.0, 0.4, ss(0.34, 0.86, r)) * (0.7 + 0.8 * edge) * streak;
  vec3 glass = vec3(0.004, 0.009, 0.007) + tgt;
  glass += gGlowE * 0.06 * ss(0.95, 0.25, r);                          // the glass glows a little
  glass = mix(glass, vec3(0.006), disc(r * gEyeR, 0.30 * gEyeR));      // the black cap over the cathode
  glass += LAMP * 0.22 * ss(0.28, 0.0, length((q - vec2(-0.40, 0.46)) * vec2(1.0, 1.9))) * pool(gEye);
  col = mix(col, glass, disc(r * gEyeR, 0.96 * gEyeR));
  return col;
}

// a lamp in a knurled chrome bezel: a faceted red jewel (the beat) or a neon dome (the highs)
vec3 lamp(vec2 p, vec2 c, float rl, vec3 glow, float facets, vec3 col) {
  vec2 q = (p - c) / rl;
  float r = length(q);
  if (r > 1.45 + gPx / rl) return col;
  vec2 d = q / max(r, 1e-4);
  float a = atan(q.y, q.x);
  float t = clamp((r - 1.0) / 0.42, 0.0, 1.0);
  vec3 bz = lit(p, normalize(vec3(d * cos(t * PI) * 0.8, 0.75)), vec3(0.28), 1.4, 50.0) * (0.8 + 0.2 * step(0.5, fract(a * 6.0)));
  col = mix(col, bz, disc(r * rl, 1.42 * rl));
  float fa = floor(a / TAU * 8.0 + 0.5), fr = step(0.55, r);
  float facet = hash11(fa * 3.7 + fr * 11.0) * facets;
  vec3 lens = glow * (1.15 - 0.5 * r) * (1.0 - 0.45 * facet) + normalize(glow + 0.001) * 0.025;
  lens += lit(p, normalize(vec3(q * 0.6, 1.0)), vec3(0.0), 1.2, 90.0) * (0.5 + 0.8 * facet);
  float seam = facets * (cover(abs(r - 0.55) * rl, 0.012 * rl) + cover(abs(sin((a - fa / 8.0 * TAU) * 0.5)) * r * rl, 0.01 * rl) * fr) * 0.5;
  col = mix(col, lens * (1.0 - seam), disc(r * rl, rl));
  return col;
}

// a toggle switch: hex nut, bushing and a chrome bat lever standing up toward us
vec3 toggle(vec2 p, vec3 col) {
  vec2 q = (p - gTog) / gTogR;
  if (dot(q, q) > 4.0) return col;
  vec2 h = abs(q);
  float hx = max(h.x * 0.866 + h.y * 0.5, h.y);
  vec3 nut = lit(p, normalize(vec3(sign(q) * step(0.72, hx) * 0.5, 1.0)), vec3(0.32), 1.0, 40.0);
  col = mix(col, nut, clamp((0.95 - hx) * gTogR / gPx + 0.5, 0.0, 1.0));
  vec3 bush = lit(p, normalize(vec3(q * 0.9, 1.0)), vec3(0.25), 1.2, 50.0);
  col = mix(col, bush, disc(length(q) * gTogR, 0.6 * gTogR));
  float dl = segD(q, vec2(0.0), vec2(0.0, 1.25));
  float w = mix(0.26, 0.17, clamp(q.y / 1.25, 0.0, 1.0));
  float x = clamp(q.x / w, -1.0, 1.0);
  vec3 lev = lit(p, normalize(vec3(x, 0.15, sqrt(max(1.0 - x * x, 0.0)))), vec3(0.35), 1.4, 60.0);
  col = mix(col, lev, clamp((w - dl) * gTogR / gPx + 0.5, 0.0, 1.0));
  vec3 ball = lit(p, normalize(vec3((q - vec2(0.0, 1.25)) / 0.3, 1.0)), vec3(0.35), 1.6, 80.0);
  col = mix(col, ball, disc(length(q - vec2(0.0, 1.25)) * gTogR, 0.3 * gTogR));
  return col;
}

// a BNC input with its plug in: knurled ring, bayonet, rubber boot
vec3 bnc(vec2 p, vec2 c, vec3 boot, vec3 col) {
  vec2 q = (p - c) / gBncR;
  float r = length(q);
  if (r > 1.3 + gPx / gBncR) return col;
  vec2 d = q / max(r, 1e-4);
  float a = atan(q.y, q.x);
  float t = clamp((r - 0.62) / 0.66, 0.0, 1.0);
  vec3 ring = lit(p, normalize(vec3(d * (t - 0.3) * 0.9, 1.0)), vec3(0.34), 1.3, 45.0) * mix(1.0, 0.75 + 0.25 * cos(a * 36.0), step(0.85, r));
  col = mix(col, ring, disc(r * gBncR, 1.28 * gBncR));
  col = mix(col, lit(p, normalize(vec3(q * 1.1, 1.0)), boot, 0.35, 16.0), disc(r * gBncR, 0.62 * gBncR));
  return col;
}

// the leads: rubber cable hanging from each plug down out of the frame
vec3 lead(vec2 p, vec2 c, float side, vec3 tint, vec3 col) {
  if (p.y > c.y) return col;
  float k = clamp((c.y - p.y) / 0.6, 0.0, 1.0);
  float cx = c.x + side * 0.12 * gU * k * k;
  float slope = side * 0.12 * gU * 2.0 * k / 0.6;
  float w = 0.03 * gU;
  float dx = (p.x - cx) / sqrt(1.0 + slope * slope);
  float x = clamp(dx / w, -1.0, 1.0);
  vec3 cab = lit(p, normalize(vec3(x, -0.1, sqrt(max(1.0 - x * x, 0.0)))), tint, 0.5, 26.0);
  return mix(col, cab, cover(abs(dx), w));
}

// the maker's plate: brushed aluminium with the model in black
vec3 plate(vec2 p, vec3 col) {
  vec2 b = vec2(sz(0.17, 0.2), sz(0.065, 0.032));
  vec2 q = p - gPlate;
  float dd = boxD(q, b, 0.012 * gU);
  if (dd > gPx * 2.0) return col;
  float edge = ss(-0.012 * gU, 0.0, dd);
  vec3 n = normalize(vec3(sign(q) * edge * vec2(b.y / b.x, 1.0) * 0.6, 1.0));
  float grain = noise(vec2(q.x * 7.0, q.y * 900.0));
  vec3 pl = lit(p, n, vec3(0.55, 0.56, 0.58) * (0.85 + 0.2 * grain), 0.9, 14.0);
  float ink = gPort > 0.5 ? label(p, gPlate, 0.026, ${word('VISULASERZ')})
    : max(label(p, gPlate + vec2(0.0, 0.016) * gU, 0.05 * gU, ${word('XY-5')}),
          label(p, gPlate - vec2(0.0, 0.037) * gU, 0.017 * gU, ${word('VECTORSCOPE')}));
  pl = mix(pl, vec3(0.012), ink);
  // two rivets
  vec2 rv = vec2(b.x - 0.025 * gU, 0.0);
  float rr = min(length(q - rv), length(q + rv));
  pl = mix(pl, lit(p, normalize(vec3((q - sign(q.x) * rv) / (0.012 * gU), 1.0)), vec3(0.3), 1.2, 40.0), disc(rr, 0.011 * gU));
  return mix(col, pl, clamp(-dd / gPx + 0.5, 0.0, 1.0));
}

// ── the tube ────────────────────────────────────────────────────────────────────────────────────
float graticule(vec2 s, float px) {
  float r = length(s);
  float g = 0.0;
  float w = px * 0.7;
  float inside = step(r, 0.925);
  g = max(g, clamp((w - abs(s.x)) / px + 0.5, 0.0, 1.0) * inside);
  g = max(g, clamp((w - abs(s.y)) / px + 0.5, 0.0, 1.0) * inside);
  float st = 0.0925;
  for (int k = 0; k < 2; k++) {
    float along = k == 0 ? s.x : s.y, across = k == 0 ? s.y : s.x;
    float m = floor(along / st + 0.5);
    float len = abs(mod(m, 5.0)) < 0.5 ? 0.035 : 0.018;
    g = max(g, clamp((w - abs(along - m * st)) / px + 0.5, 0.0, 1.0) * step(abs(across), len) * inside);
  }
  // the two diagonals (left and right channel), dashed
  float d1 = abs(s.x - s.y) * 0.7071, d2 = abs(s.x + s.y) * 0.7071;
  g = max(g, clamp((w - min(d1, d2)) / px + 0.5, 0.0, 1.0) * step(0.45, fract(r / 0.035)) * inside * 0.7);
  // rings: the full scale, and a dashed half scale
  g = max(g, clamp((w * 1.3 - abs(r - 0.925)) / px + 0.5, 0.0, 1.0));
  float ang = atan(s.y, s.x);
  g = max(g, clamp((w - abs(r - 0.4625)) / px + 0.5, 0.0, 1.0) * step(0.5, fract(ang / TAU * 48.0)) * 0.7);
  // degree ticks inside the outer ring: every 5, longer every 30
  float deg = ang / TAU * 72.0;
  float dk = floor(deg + 0.5);
  float tl = abs(mod(dk, 6.0)) < 0.5 ? 0.05 : 0.022;
  g = max(g, clamp((w - abs(deg - dk) * TAU / 72.0 * r) / px + 0.5, 0.0, 1.0) * step(0.925 - tl, r) * step(r, 0.925));
  return g;
}

vec3 tube(vec2 p, vec3 col) {
  vec2 q = p - gC;
  float r = length(q);
  float R = gR;
  if (r > R * 1.28 + gPx) return col;
  vec2 d = q / max(r, 1e-5);
  vec2 ld = normalize(gLamp.xy - gC);
  // how much light the beam is making (none to speak of while the spot killer has it blanked)
  float glow = mix(0.62, mix(0.2, 1.0, ss(0.0, 0.06, uLevel)), gOn) * (0.6 + 0.6 * gBass + 1.4 * gFlare);

  // the bezel: a rounded ring of dark metal, a chrome lip, four screws
  float t = clamp((r - R * 1.03) / (R * 0.21), 0.0, 1.0);
  float slope = cos(t * PI) * 1.1;
  vec3 bz = lit(p, normalize(vec3(-d * slope * 0.8, 1.0)), vec3(0.05, 0.052, 0.058), 0.6, 28.0);
  bz += P31 * 0.06 * glow * max(slope, 0.0) * ss(0.6, 0.0, t);             // the screen's green on the inner slope
  float lip = clamp((r - R * 1.235) / (R * 0.04), 0.0, 1.0);
  vec3 chrome = lit(p, normalize(vec3(d * (lip - 0.5) * 2.2, 1.0)), vec3(0.35), 2.2, 90.0);
  bz = mix(bz, chrome, ss(R * 1.23, R * 1.24, r));
  vec2 sc = gC + R * 0.8026 * vec2(q.x < 0.0 ? -1.0 : 1.0, q.y < 0.0 ? -1.0 : 1.0);
  vec2 sq = (p - sc) / (R * 0.04);
  float sr = length(sq);
  float sa = hash21(floor(sc * 10.0)) * PI;
  vec3 screw = lit(p, normalize(vec3(sq * 0.55, 1.0)), vec3(0.30), 1.4, 50.0);
  vec2 sv = vec2(cos(sa), sin(sa));
  screw *= 1.0 - 0.8 * cover(abs(sq.x * sv.y - sq.y * sv.x) * R * 0.04, R * 0.006) * step(sr, 0.8);
  bz = mix(bz, bz * 0.4, ss(R * 0.06, R * 0.04, length(p - sc - vec2(0.006, -0.008))));
  bz = mix(bz, screw, disc(sr * R * 0.04, R * 0.04));
  col = mix(col, bz, disc(r, R * 1.27));
  col = mix(col, vec3(0.006, 0.006, 0.007) + P31 * 0.02 * glow, disc(r, R * 1.03));   // the rubber gasket

  // the screen
  vec2 s = q / R;
  float s2 = dot(s, s);
  vec3 scr = vec3(0.012, 0.020, 0.017) * (1.0 - 0.6 * s2);
  float fig = figureSize() / R;
  scr += P31 * 0.022 * glow * exp(-s2 / (fig * fig) * 1.3);                // halation: the beam lights its glass
  // the graticule, lit amber from lamps in the rim at either side
  float g = graticule(s, gPx / R);
  scr = mix(scr, AMBER * 0.30 * (0.55 + 0.6 * s.x * s.x), g * 0.9);
  float letters = label(p, gC + R * vec2(-0.62, 0.70), R * 0.06, ${word('L')}) + label(p, gC + R * vec2(0.62, 0.70), R * 0.06, ${word('R')});
  scr = mix(scr, AMBER * 0.22, clamp(letters, 0.0, 1.0) * 0.8);
  // the glass: the lamp and the window in it, a sheen along the rim nearest the lamp, dark at the rim
  scr += LAMP * 0.10 * pool(gC) * ss(0.42, 0.0, length((s - vec2(-0.48, 0.50)) * mat2(0.75, 0.66, -0.66, 0.75) * vec2(1.0, 2.6)));
  vec2 wq = (s - vec2(0.55, 0.25)) * mat2(0.94, -0.34, 0.34, 0.94);
  scr += FILL * 0.16 * ss(0.03, -0.03, boxD(wq, vec2(0.13, 0.26), 0.05)) * (1.0 - 0.8 * cover(min(abs(wq.x), abs(wq.y)) * R, gPx * 1.5)) * ss(0.95, 0.6, sqrt(s2));
  scr += LAMP * 0.03 * ss(0.75, 1.0, sqrt(s2)) * max(dot(d, ld), 0.0);
  scr *= 1.0 - 0.45 * ss(0.86, 1.0, sqrt(s2));
  col = mix(col, scr, disc(r, R));
  return col;
}

void main() {
  place();
  signals();
  layoutParts();
  vec2 p = centered();
  gPx = 2.0 / uRes.y;
  gLamp = gPort > 0.5 ? vec3(-0.8, 1.55, 1.1) : vec3(-1.65 * gU, 1.35, 1.2);
  gPool = gPort > 0.5 ? vec3(-0.1, 0.25, 1.25) : vec3(-0.25 * gU, 0.40, 1.85 * gU);
  gGlowJ = vec3(1.0, 0.10, 0.05) * (0.5 + 2.4 * gFlare);
  gGlowN = vec3(1.0, 0.40, 0.10) * (0.16 + 1.8 * gHigh * (0.7 + 0.3 * hash11(floor(uTime * 40.0))));
  gGlowE = vec3(0.30, 1.0, 0.42) * (0.55 + 0.3 * gOn + 0.45 * gBass);

  vec3 col = panel(p);
  col = mix(col, lit(p, vec3(0.0, 0.0, 1.0), INK * 0.62, 0.05, 8.0), printing(p));
  col *= 1.0 - shade(p);
  // the lamps and the tube spill a little of their light onto the paint around them
  col += gGlowJ * 0.05 * exp(-dot(p - gJewel, p - gJewel) / (gJewelR * gJewelR * 6.0));
  col += gGlowN * 0.05 * exp(-dot(p - gNeon, p - gNeon) / (gNeonR * gNeonR * 6.0));
  col += gGlowE * 0.025 * exp(-dot(p - gEye, p - gEye) / (gEyeR * gEyeR * 3.0));

  col = tube(p, col);
  for (int i = 0; i < 6; i++) if (gKnobR[i] > 0.0) col = knob(p, gKnob[i], gKnobR[i], gKnobA[i], col);
  col = magicEye(p, col);
  col = lamp(p, gJewel, gJewelR, gGlowJ, 1.0, col);
  col = lamp(p, gNeon, gNeonR, gGlowN, 0.0, col);
  col = toggle(p, col);
  col = plate(p, col);
  col = bnc(p, gBnc[0], vec3(0.05, 0.05, 0.055), col);
  col = bnc(p, gBnc[1], vec3(0.22, 0.025, 0.02), col);
  col = lead(p, gBnc[0], -1.0, vec3(0.035, 0.035, 0.04), col);
  col = lead(p, gBnc[1], 1.0, vec3(0.24, 0.028, 0.02), col);

  col += (hash21(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  outColor = vec4(max(col, 0.0), 1.0);
}`;

// ── the beam ─────────────────────────────────────────────────────────────────────────────────────
const vert = `${common}
const float NPT = 16384.0;
float rawAt(float h) {
  return textureLod(uAudio, vec2((clamp(h, 0.0, 511.0) + 0.5) / 512.0, ROW(1.0)), 0.0).r * 2.0 - 1.0;
}
// the calibrator: what the scope draws with nothing playing
float idleSig(float x) {
  return 0.5 * sin(x * (TAU * 4.5 / 512.0) + uTime * 0.7) + 0.08 * sin(x * (TAU * 13.5 / 512.0) - uTime * 0.45);
}
// the waveform between samples, smoothed by a Gaussian a dozen samples wide (it lets through what
// lies under ~0.4 kHz at 48 kHz): the beam follows the bass and the body of the sound, and the
// hiss, the hats and the 8-bit steps of the analyser are left to their own job (the fizz)
float sig(float x) {
  float a = 0.979 * (rawAt(x - 2.5) + rawAt(x + 2.5)) + 0.823 * (rawAt(x - 7.5) + rawAt(x + 7.5))
          + 0.581 * (rawAt(x - 12.5) + rawAt(x + 12.5)) + 0.345 * (rawAt(x - 17.5) + rawAt(x + 17.5))
          + 0.172 * (rawAt(x - 22.5) + rawAt(x + 22.5));
  return gOn * a / 5.8 + (1.0 - gOn) * idleSig(x);
}
float gGu, gGv, gDc, gD, gK, gKill, gEll, gTilt, gTheta, gSize;
// the second channel a mono recording does not have: the same wave a quarter of its main period
// earlier, less whatever of the first channel it still holds, so a pure tone draws a circle. Near
// the start of the window there is no "earlier", so there it looks the same distance ahead.
float yAt(float x, float u) {
  float vb = sig(x - gD) - gDc - gK * u;
  float vf = gK * u - (sig(x + gD) - gDc);
  return mix(vf, vb, ss(gD, gD + 64.0, x));
}
// the figure: the sample and its quarter-period twin give the sound's phase psi and size A, and
// the beam runs two wheels on that phase, one forward and one back n-1 times as fast (an
// epicycle), so every cycle of the main tone draws a whole flower of n petals; gEll is how deep
// the petals are cut
vec2 trace(float x, float n) {
  float u0 = sig(x) - gDc;
  float u = u0 * gGu;
  float v = yAt(x, u0) * gGv;
  float A = length(vec2(u, v));
  float psi = atan(v, u + 1e-6);
  float b = (n - 1.0) * psi;
  vec2 z = rot(gTheta) * ((1.0 - gEll) * vec2(cos(psi), sin(psi)) + gEll * vec2(cos(b), -sin(b))) * A * gSize;
  z.y *= gTilt;
  // a soft limit near the rim: the figure is never cut by the edge of the screen
  float r = length(z), kn = gR * 0.62, lim = gR * 0.94;
  float rr = r < kn ? r : kn + (lim - kn) * tanh((r - kn) / (lim - kn));
  return z * (rr / max(r, 1e-6));
}
float order(float n) { return 3.0 + mod(n * 2.0 + floor(n / 5.0), 5.0); }      // 3 to 7 petals
void main() {
  place();
  signals();
  float id = float(gl_VertexID);
  // the sound over the window: its level and offset, and its main frequency from how fast it
  // changes against how big it is (Rice's formula), which sets the quarter-period delay gD
  float s1 = 0.0, s2 = 0.0, sd = 0.0;
  for (int j = 0; j < 16; j++) {
    float x = 16.0 + float(j) * 32.0;
    float a = sig(x), d = sig(x + 6.0) - sig(x - 6.0);
    s1 += a;
    s2 += a * a;
    sd += d * d;
  }
  gDc = s1 / 16.0;
  float var0 = max(s2 / 16.0 - gDc * gDc, 0.0);
  float omega = sqrt(sd / max(s2 - s1 * gDc, 1e-7)) / 12.0;                // radians per sample
  gD = clamp(1.5708 / max(omega, 1e-3), 6.0, 200.0);
  // how much of the wave is still there a quarter period on, measured both ways at once (so the
  // twin looking back and the twin looking ahead agree where the beam hands over), and the twin's size
  float saa = 0.0, sab = 0.0, sac = 0.0, sbb = 0.0;
  for (int j = 0; j < 16; j++) {
    float x = gD + (float(j) + 0.5) * (511.0 - 2.0 * gD) / 16.0;
    float a = sig(x) - gDc, b = sig(x - gD) - gDc, c = sig(x + gD) - gDc;
    saa += a * a;
    sab += a * b;
    sac += a * c;
    sbb += b * b;
  }
  gK = clamp((sab + sac) / max(2.0 * saa, 1e-7), -1.0, 1.0);
  float ru = sqrt(var0), rv = sqrt(max(sbb - 2.0 * gK * sab + gK * gK * saa, 0.0) / 16.0);
  gGu = 0.7071 / max(ru, 0.02);
  gGv = 0.7071 / max(rv, max(0.02, 0.3 * ru));
  gKill = mix(1.0, ss(0.003, 0.012, ru), gOn);
  gEll = mix(0.45, 0.36 + 0.13 * gMid, gOn) + 0.03 * sin(uTime * 0.13);
  gTilt = 0.86 + 0.14 * cos(uTime * 0.21);
  gTheta = uTime * 0.09 + gMid * 0.8;
  gSize = figureSize();

  // the order of the rose: with music it changes every 16 beats, morphing within 0.4 s of the
  // beat; the calibrator steps through them slowly. Odd points draw the old rose while it fades.
  float slot = gOn > 0.5 ? floor(uBeatCount / 16.0) : floor(uTime / 9.0);
  float since = gOn > 0.5 ? (mod(uBeatCount, 16.0) < 0.5 ? uBeatAge : 9.0) : mod(uTime, 9.0);
  float f = ss(0.0, gOn > 0.5 ? 0.4 : 1.5, since);
  float odd = mod(id, 2.0);
  float k = odd > 0.5 && f < 1.0 ? order(slot - 1.0) : order(slot);
  float w = f < 1.0 ? (odd > 0.5 ? 2.0 * (1.0 - f) : 2.0 * f) : 1.0;

  float x = id / NPT * 511.0, dx = 511.0 / NPT * (f < 1.0 ? 2.0 : 1.0);
  vec2 p0 = trace(x, k), p1 = trace(x + dx, k);
  float sp = length(p1 - p0) * 540.0 / (f < 1.0 ? 2.0 : 1.0);   // to the next point, in pixels of a 1080-line screen
  float fade = ss(6.0, 28.0, x) * ss(505.0, 483.0, x);      // the smoothing runs off the ends of the window there
  // equal time per point, so a point's share of the line is how far it travels to the next; and as
  // on a real phosphor the line glows brighter where the beam slows (gently: power 0.45, at most
  // 2.4x). The spot killer blanks a beam that has stopped, so silence leaves no burning dot.
  float a = sp * min(pow(0.1 / max(sp, 1e-4), 0.45), 2.4) * fade * w * gKill;
  // the highs make the beam fizz: glints running along it, a fine ripple and a little noise
  float glint = pow(hash11(floor(id / 24.0) * 7.13 + floor(uTime * 30.0) * 3.7), 12.0);
  float bright = mix(0.72, 1.0, gOn) * (1.0 + 1.8 * gFlare) * (1.0 + 2.5 * gHigh * glint);
  vec2 tg = (p1 - p0) / max(length(p1 - p0), 1e-6);
  vec2 nr = vec2(-tg.y, tg.x);
  vec2 p = p0 + nr * gHigh * gR * 0.0035 * sin(x * 3.1 + uTime * 47.0)
    + (vec2(hash11(id * 0.37 + fract(uTime * 7.0) * 311.0), hash11(id * 0.71 + fract(uTime * 5.0) * 173.0)) - 0.5) * gHigh * gR * 0.004;
  vec2 s = gC + p;
  gl_Position = vec4(s.x / gAsp, s.y, 0.0, 1.0);
  gl_PointSize = clamp(11.0 * uPointScale * sqrt(gR / 0.62), 1.0, uPointMax);   // a finer beam on a smaller tube
  vColor = vec4(vec3(0.22, 1.0, 0.45), a * bright * 2.0);
  vShape = gFlare;
}`;

const pointFrag = `
void main() {
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 16.0);
  float halo = exp(-r2 * 3.2) - exp(-3.2);
  vec3 hot = mix(vec3(0.42, 1.0, 0.56), vec3(0.92, 1.0, 0.9), clamp(vShape, 0.0, 1.0));
  outColor = vec4((hot * core + vColor.rgb * halo * 0.14) * vColor.a, 1.0);
}`;

export default {
  id: 'xy',
  name: 'XY',
  group: 'Show',
  blurb: 'A vintage round-screen vectorscope on the bench at night, drawing the music as glowing green phosphor flowers',
  tags: ['analyser', 'retro', 'geometric'],
  energy: 0.4,
  particles: 0,
  trails: 0.8,
  zoom: 1,
  spin: 0,
  frag,
  points: { count: 16384, vert, frag: pointFrag },
};
