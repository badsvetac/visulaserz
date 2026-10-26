// FIREWORKS — New Year's Eve on the Bosphorus, seen from the water at Ortaköy: the little baroque
// mosque on its quay, floodlit gold with its ribbed dome and two slim minarets, the great suspension
// bridge rising behind it with its cable sweeping across the sky and its lights strung along the
// deck, the wooded hill and the town lights of the shore beyond, a ferry crossing, and the whole sky
// going off. Shells are fired from barges on the water: peonies, chrysanthemums with gold spark
// trails, hanging gold willows, tilted rings with a pistil, crossettes whose stars split in four.
// Each shell is 224 stars spread evenly over a sphere, so it opens as a full chrysanthemum, not a
// ring of dots; every star flies out, slows in the air, sags under gravity, may change colour half
// way, leaves a streak of its own motion (and, in a willow, a long hanging trail) and burns out with
// a flicker at its own moment. The smoke the shells leave behind drifts on the wind and is lit from
// inside by each burst in that burst's colour; the water mirrors the shore, broken by the swell, and
// throws every burst back as a long column of glitter; the skyline's edge, the dome, the minaret
// caps and the bridge tower catch each burst's light.
//
// Music:
//   the kick  — every beat a big double-petalled dahlia opens on the kick (gone within the beat),
//               and a wave of its colour runs out along the bridge lights from the tower;
//   bass      — how big that beat shell opens: its size is the kick's strength, read back from the
//               bass peak caps, so a shell never shrinks while it burns;
//   mids      — how many of the side mortars are firing: two always fire, four more join as the
//               mids build (read from the slow spectrum, so they come and go gently);
//   highs     — the crackle: stars strobe, glitter pops around the dying stars, and a golden
//               waterfall of sparks pours off the bridge deck towards the water.
// With nothing playing, two mortars keep a quiet show going and nothing else moves with the sound.
//
// The stars are this scene's own points (one point per star segment, placed once per frame by the
// vertex shader and drawn as a motion streak by its own little fragment shader); the picture
// shader draws the world: the sky, the smoke, the skyline, the bridge and the water.

// ── what the picture and the points share: where things stand and where every shell is ──────────
const SHARED = `
const float WL = -0.5;            // the water line
const float DECK = -0.29;         // the bridge deck
const float TX = 0.34;            // the bridge's tower (two legs either side of it)
const float TTOP = 0.08;          // the tower's top
const float CLOW = -0.265;        // the main cable at mid-span, which lies far off to the left
const float CMID = -1.06;
const float CHALF = 1.4;
const float MX = -0.22;           // the mosque
const float NSTAR = 224.0;        // stars in a shell

float gAsp, gW, gRs, gTall, gMids, gHi, gKick, gFlash;

// the colours pyrotechnics make: strontium red, orange, gold, barium green, teal, copper blue,
// violet, magenta, silver, yellow. The greens and blues are kept pure (little of the other two
// channels), or their bright cores would tone-map to pale mint and ice instead of green and blue.
const vec3 COL[10] = vec3[10](
  vec3(1.0, 0.1, 0.07), vec3(1.0, 0.4, 0.07), vec3(1.0, 0.64, 0.22), vec3(0.16, 0.9, 0.14),
  vec3(0.06, 0.8, 0.68), vec3(0.14, 0.32, 1.0), vec3(0.58, 0.2, 1.0), vec3(1.0, 0.24, 0.66),
  vec3(0.85, 0.9, 1.0), vec3(1.0, 0.84, 0.38));

void setup() {
  gAsp = uRes.x / uRes.y;
  gW = min(gAsp, 1.8);
  gRs = mix(0.8, 1.18, ss(0.6, 1.5, gAsp));                // shells a little smaller in a tall frame
  gTall = 1.0 - ss(0.6, 1.3, gAsp);                         // and spread higher up it, where there is room
  float on = uAudioActive;
  gMids = on * clamp((slow(0.18) + slow(0.3) + slow(0.45)) * 0.6, 0.0, 1.0);
  gHi = on * clamp(uHigh * 1.6, 0.0, 1.0);
  // the kick's strength: the bass peak caps hold it and fall 0.35 a second, so adding that back
  // gives the same number for the whole life of the shell
  float pk = max(max(peak(0.015), peak(0.04)), peak(0.08));
  gKick = on * clamp(pk + 0.35 * uBeatAge, 0.0, 1.0);
  gFlash = on * (0.55 + 0.45 * uPunch);
}

struct Shell {
  vec2 c;       // where it breaks
  vec2 from;    // where it was fired from
  float R;      // how far its stars fly
  float a;      // seconds since it broke (negative while it is still rising)
  float rise;   // seconds it takes to rise
  float life;   // how long its stars burn
  float kind;   // 0 peony, 1 chrysanthemum, 2 willow, 3 ring, 4 crossette, 5 the beat's dahlia
  float seed;
  float k;      // air drag
  float G;      // how fast the stars sag
  float trail;  // seconds of trail behind a star
  float on;     // 0..1: is this mortar firing
  vec3 ca, cb;  // the star colour and the colour it changes to (or the pistil's)
};

// the beat's shell: it opens the instant the kick lands and is gone before the next one
Shell beatShell() {
  Shell s;
  float n = uBeatCount;
  s.seed = fract(n * 0.618034) * 97.0 + 1.0;
  s.a = uBeatAge;
  s.rise = 0.0;
  s.R = (0.15 + 0.27 * gKick) * gRs;
  s.c = vec2((hash11(n * 1.37 + 0.2) * 2.0 - 1.0) * max(gW * 0.72 - s.R * 0.6, 0.04), 0.2 + (0.36 + 0.16 * gTall) * hash11(n * 2.71 + 0.7));
  s.from = s.c;
  s.life = 0.4; s.k = 10.0; s.G = 0.16; s.trail = 0.06; s.kind = 5.0;
  int ci = int(hash11(n * 3.3 + 0.1) * 9.99);
  s.ca = COL[ci];
  s.cb = COL[(ci + 3 + int(hash11(n * 5.9 + 0.4) * 4.99)) % 10];
  s.on = gFlash * step(s.a, 0.55);
  return s;
}

// the six side mortars, each on its own clock; back = 1 gives the shell before the current one
const float PER[6] = float[6](3.4, 4.1, 3.0, 4.6, 3.7, 4.3);
const float OFS[6] = float[6](0.12, 0.61, 0.33, 0.87, 0.47, 0.05);
const float GATE[6] = float[6](-1.0, -1.0, 0.12, 0.3, 0.48, 0.66);
Shell mortar(int i, float back) {
  Shell s;
  float fi = float(i), P = PER[i];
  float ph = uTime / P + OFS[i];
  float id = floor(ph) - back;
  float t = (fract(ph) + back) * P;                         // seconds since it was fired
  float h1 = hash11(id * 1.31 + fi * 7.7), h2 = hash11(id * 2.17 + fi * 3.1);
  float h3 = hash11(id * 3.71 + fi * 5.3), h4 = hash11(id * 5.13 + fi * 1.9), h5 = hash11(id * 7.37 + fi * 2.3);
  s.seed = fract(id * 0.7548777 + fi * 0.5698403) * 91.0 + 3.0;
  s.rise = 0.7 + 0.3 * h1;
  s.a = t - s.rise;
  float maxLife = P - s.rise - 0.12;
  float kind = floor(h2 * 4.999);   // 0 peony, 1 chrysanthemum, 2 willow, 3 ring, 4 crossette
  if (kind == 2.0 && maxLife < 2.5) kind = 1.0;             // a willow needs time to hang
  s.kind = kind;
  int ci = int(h5 * 9.99);
  s.ca = COL[ci];
  s.cb = h4 > 0.4 ? COL[(ci + 2 + int(h3 * 5.99)) % 10] : s.ca;
  if (kind == 0.0) { s.R = 0.27; s.k = 4.2; s.G = 0.1; s.life = 1.7; s.trail = 0.1; }
  else if (kind == 1.0) { s.R = 0.29; s.k = 3.8; s.G = 0.11; s.life = 1.9; s.trail = 0.42; }
  else if (kind == 2.0) { s.R = 0.3; s.k = 2.8; s.G = 0.21; s.life = 3.0; s.trail = 1.7; s.ca = vec3(1.0, 0.56, 0.2); s.cb = s.ca; }
  else if (kind == 3.0) { s.R = 0.24; s.k = 4.6; s.G = 0.08; s.life = 1.6; s.trail = 0.08; s.cb = COL[(ci + 4) % 10]; }
  else { s.R = 0.21; s.k = 4.0; s.G = 0.1; s.life = 1.8; s.trail = 0.14; s.cb = s.ca; }
  s.life = min(s.life, maxLife);
  s.R *= gRs * (0.88 + 0.24 * h3);
  float span = max(gW * 0.86 - s.R * 0.55, 0.08);
  s.c = vec2((h4 * 2.0 - 1.0) * span, 0.14 - 0.04 * gTall + h3 * max(0.72 + 0.16 * gTall - s.R, 0.0));
  s.from = vec2(s.c.x - 0.05 + 0.1 * h1, WL + 0.008);
  // in a tall (phone) frame the last two mortars stay quiet: four shells at once already fill it
  s.on = (GATE[i] < 0.0 ? 1.0 : ss(GATE[i] - 0.07, GATE[i] + 0.07, gMids)) * (1.0 - 0.18 * gTall) * (i >= 4 ? 1.0 - gTall : 1.0);
  return s;
}

// how brightly a shell lights the air, the smoke and the town right now
// (x: the break's flash, y: the stars burning)
vec2 shellGlow(Shell s) {
  if (s.a < 0.0 || s.a > s.life * 1.1 + 0.05) return vec2(0.0);
  float flash = exp(-s.a * 9.0);
  float burn = ss(0.0, 0.05, s.a) * (1.0 - ss(s.life * 0.5, s.life * 1.1, s.a));
  float g = s.kind == 2.0 ? 0.65 : (s.kind == 5.0 ? 0.75 : 0.8);
  return vec2(flash * 1.5, burn * 0.6) * g * s.on;
}
// (white-hot at the break, like its stars, then their colour)
vec3 shellColour(Shell s) {
  vec3 c = mix(s.ca, s.cb, s.kind == 3.0 || s.kind == 5.0 ? 0.35 : ss(0.4, 0.6, s.a / max(s.life, 0.1)));
  return mix(vec3(1.0, 0.9, 0.78), c, ss(0.0, s.kind == 5.0 ? 0.18 : 0.12, s.a));
}

// ── the skyline as solid shapes (the stars and sparks are hidden behind it) ────────────────────
float boxSD(vec2 p, vec2 c, vec2 b) { vec2 d = abs(p - c) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
// the Asian shore across the water: low hills with the town on them
float hillTop(float x) {
  float h = WL + 0.026 + 0.032 * noise(vec2(x * 1.1 + 4.0, 0.5)) + 0.012 * noise(vec2(x * 3.7, 2.5));
  return h + 0.006 * hash11(floor(x * 60.0) * 1.7 + 0.3) * ss(0.3, 0.6, noise(vec2(x * 2.3, 7.0)));
}
// the near shore either side of the mosque's quay: old waterfront houses among the trees and a
// few cypresses on the left; the foot of the bridge and the hillside of Ortaköy on the right.
// house: the top of the house here, if there is one (lit windows only go in houses)
const float MS = 1.3;             // the mosque's size
const float MINX = 0.113;         // its minarets, either side of the prayer hall (mosque units)
// a minaret's shaft tapers a little from its pedestal to its balcony
float minHW(float y) { return mix(0.0068, 0.0053, clamp((y - 0.14) / 0.19, 0.0, 1.0)); }
float nearTop(float x, out float house) {
  float base = WL + 0.012;
  house = -9.0;
  if (abs(x - MX) < 0.215 * MS) return base;
  float hill = 0.23 * ss(TX + 0.04, TX + 1.15, x) + 0.012 * noise(vec2(x * 5.0, 1.0)) * ss(TX, TX + 0.4, x);
  float c = floor(x / 0.042), f = fract(x / 0.042);
  float h1 = hash11(c * 3.1 + 1.0), h2 = hash11(c * 7.7 + 4.0);
  float wall = (0.02 + 0.032 * h1) * (1.0 - 0.45 * ss(TX, TX + 1.0, x));
  float roof = 0.011 * (1.0 - abs(f * 2.0 - 1.0)) * step(0.6, h2);
  float inHouse = step(0.07, f) * step(f, 0.95) * step(mix(0.22, 0.8, ss(TX - 0.1, TX + 0.2, x)), h2);
  if (inHouse > 0.0) house = base + hill + wall;
  float top = base + hill + (wall + roof) * inHouse;
  // tree canopies between and behind the houses
  float canopy = 0.016 + 0.012 * noise(vec2(x * 55.0, 3.0)) + 0.006 * noise(vec2(x * 170.0, 5.0));
  canopy += 0.012 * noise(vec2(x * 18.0, 9.0)) * ss(TX, TX + 0.3, x);          // the wooded hill
  top = max(top, base + hill + canopy);
  // cypresses, dark spindles standing up out of the gardens
  float cy = floor(x / 0.09);
  float cx = (cy + 0.3 + 0.4 * hash11(cy * 9.1)) * 0.09;
  float tall = (0.07 + 0.06 * hash11(cy * 2.2)) * step(0.6, hash11(cy * 5.3 + 2.0)) * step(x, TX - 0.05);
  float dx = abs(x - cx) / 0.0105;
  return max(top, base + hill + tall * sqrt(max(1.0 - dx * dx, 0.0)) * (1.0 - 0.2 * dx));
}
float nearTop(float x) { float h; return nearTop(x, h); }
// Ortaköy mosque on its quay: the prayer hall with its great windows, corner turrets, the dome on
// its drum, and the two slender minarets with their balconies and pencil caps (mosque units)
float mosqueSD(vec2 p) {
  vec2 q = (p - vec2(MX, WL)) / MS;
  float d = boxSD(q, vec2(0.0, 0.006), vec2(0.21, 0.006));                    // the quay
  d = min(d, boxSD(q, vec2(0.0, 0.073), vec2(0.105, 0.061)));                // the prayer hall
  d = min(d, boxSD(vec2(abs(q.x), q.y), vec2(0.098, 0.146), vec2(0.01, 0.012)));   // corner turrets
  d = min(d, boxSD(q, vec2(0.0, 0.146), vec2(0.072, 0.012)));                // the drum
  vec2 dq = (q - vec2(0.0, 0.156)) / vec2(0.074, 0.068);
  d = min(d, max((length(dq) - 1.0) * 0.068, 0.156 - q.y));                  // the dome
  d = min(d, boxSD(q, vec2(0.0, 0.236), vec2(0.0016, 0.013)));               // its finial
  vec2 m = vec2(abs(q.x) - MINX, q.y);
  d = min(d, boxSD(m, vec2(0.0, 0.072), vec2(0.0088, 0.072)));               // the minarets' pedestals
  d = min(d, max(abs(m.x) - minHW(m.y), abs(m.y - 0.17) - 0.16));             // their shafts
  d = min(d, boxSD(m, vec2(0.0, 0.2725), vec2(0.0118, 0.0034)));             // their balconies
  float cone = max(abs(m.x) - 0.0066 * clamp((0.392 - m.y) / 0.062, 0.0, 1.0), max(0.33 - m.y, m.y - 0.392));
  return min(d, cone) * MS;
}
float towerSD(vec2 p) {
  float x = p.x - TX;
  float w = mix(0.0075, 0.005, clamp((p.y - WL) / (TTOP - WL), 0.0, 1.0));
  float d = max(abs(abs(x) - 0.016) - w, max(WL - p.y, p.y - TTOP));
  d = min(d, boxSD(vec2(x, p.y), vec2(0.0, TTOP - 0.008), vec2(0.02, 0.006)));
  d = min(d, boxSD(vec2(x, p.y), vec2(0.0, -0.13), vec2(0.018, 0.0045)));
  return min(d, boxSD(vec2(x, p.y), vec2(0.0, DECK - 0.022), vec2(0.018, 0.005)));
}
float deckSD(vec2 p) { return max(abs(p.y - (DECK - 0.0025)) - 0.0065, p.x - (TX + 0.95)); }
// > 0 in open sky, < 0 inside anything solid
float skySD(vec2 p) {
  if (p.y > TTOP + 0.02) return 1.0;
  float d = min(p.y - hillTop(p.x), p.y - nearTop(p.x));
  d = min(d, min(mosqueSD(p), min(towerSD(p), deckSD(p))));
  return min(d, p.y - WL);
}
`;

// ── the picture: sky, smoke, skyline, bridge and water ───────────────────────────────────────────
const frag = `${SHARED}
Shell gS[7];
float gGl[7];
vec3 gCo[7];
vec3 gSm[7];           // the light each burst throws into its smoke: paler and greyer than its stars
float gGlit;           // the water's glitter where this pixel's reflection is looked up (0 above water)
vec4 gPuff[12];        // smoke left by the mortars: centre, size, age
float gPuffA[12];      // and how much of it there is
float gPx;

float line(float d, float w) { return ss(w + gPx * 0.8, max(w - gPx * 0.8, 0.0), d) * min(1.0, w * 2.0 / gPx + 0.25); }
// a small light; in the water (refl = 1) it is drawn long and thin, the way ripples smear it
// and broken by the glitter into a column of glints
float lamp(vec2 d, float r, float refl) {
  d.y *= mix(1.0, 0.11, refl);
  float q = length(d) / max(r, gPx * 0.7);
  return (exp(-q * q * 1.6) + 0.12 * exp(-q * 1.2)) * mix(1.0, 0.25 + 1.9 * gGlit, refl);
}
vec3 ledColour(float x) {
  vec3 c = 0.5 + 0.5 * cos(TAU * (vec3(0.58, 0.68, 0.82) + 0.16 * sin(x * 1.7 - uTime * 0.21) + 0.05 * x));
  return mix(c, vec3(0.3, 0.45, 1.0), 0.35) * 0.9;
}
// the beat's colour running out along the bridge from the tower
vec3 bridgeLights(float x) {
  vec3 c = ledColour(x);
  // it reaches the far end of the span in ~0.13 s and is spent everywhere well inside 0.45 s
  float delay = abs(x - TX) * 0.06;
  float a = uBeatAge - delay;
  float env = a > 0.0 ? ss(0.0, 0.02, a) * exp(-a * 8.5) * gS[0].on : 0.0;
  return mix(c, gS[0].ca * 2.4, clamp(env, 0.0, 1.0));
}

vec3 skyAt(vec2 q) {
  float h = q.y - WL;
  vec3 c = mix(vec3(0.05, 0.045, 0.08), vec3(0.016, 0.025, 0.07), ss(0.0, 0.35, h));
  c = mix(c, vec3(0.004, 0.008, 0.03), ss(0.3, 1.4, h));
  return c + vec3(0.09, 0.04, 0.03) * exp(-max(h, 0.0) * 9.0);           // the city's glow low in the haze
}
vec3 starsAt(vec2 q) {
  vec3 col = vec3(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float scale = 36.0 + float(layer) * 40.0;
    vec2 g = q * scale + float(layer) * 31.7;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + 17.0);
    if (h > 0.035) continue;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float r = length(f - off * 0.7) / scale;
    float mag = 0.05 + pow(hash21(cell + 1.3), 6.0) * 0.6;
    col += vec3(0.8, 0.86, 1.0) * mag * exp(-r * r / (gPx * gPx * 0.5));
  }
  return col * ss(-0.1, 0.4, q.y);
}
float smokeAt(vec2 q) {
  if (q.y < -0.42) return 0.0;
  vec2 wind = vec2(uTime * 0.02, 0.0);
  float n = fbm(q * vec2(1.6, 2.6) - wind * 1.5 + 3.0);
  float haze = ss(0.4, 0.78, n) * ss(-0.4, 0.0, q.y) * ss(1.0, 0.3, q.y) * 0.4;
  float puffs = 0.0;
  for (int i = 0; i < 12; i++) {
    vec4 pf = gPuff[i];
    if (pf.w <= 0.0 || gPuffA[i] <= 0.0) continue;
    vec2 d = q - (pf.xy + vec2(0.022, 0.007) * pf.w);
    float r = pf.z * (0.6 + 0.045 * pf.w);
    puffs += gPuffA[i] * exp(-dot(d, d) / (r * r)) * ss(0.0, 0.6, pf.w) * exp(-pf.w / 7.0);
  }
  // billows: rounded lumps with soft creases, the way a shell's smoke rolls
  vec2 bq = q * 5.0 - wind * 6.0 + vec2(n * 0.9, 0.0);
  float bl = 0.0, ba = 0.55;
  for (int o = 0; o < 3; o++) { bl += ba * (1.0 - abs(2.0 * noise(bq) - 1.0)); bq = rot(0.7) * bq * 2.05 + 5.3; ba *= 0.5; }
  // the billows only shape a puff (never punch holes in it: a lit puff with dark holes reads as a
  // nebula, not smoke)
  return clamp(haze * (0.6 + 0.6 * bl) + puffs * 0.6 * mix(0.5, 1.0, ss(0.15, 0.95, bl * 0.8 + n * 0.35)), 0.0, 0.85);
}

vec3 world(vec2 q, float refl) {
  vec3 col = skyAt(q);
  if (refl < 0.5) col += starsAt(q);
  // the bursts' light here: close round them (the smoke) and from afar (the town)
  // Smoke scatters the light it is lit by into a paler, greyer version of it: a green shell
  // lights its smoke grey-green, not neon (gSm is that paler colour, and only the burning stars
  // light it: the break's flash is the sky's, below)
  vec3 Ln = vec3(0.0), Lf = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    if (gGl[i] <= 0.0) continue;
    vec2 d = q - gS[i].c;
    float r2 = gS[i].R * gS[i].R, dd = dot(d, d);
    Ln += gSm[i] * exp(-dd / (r2 * 1.5));
    Lf += gCo[i] * gGl[i] * r2 / (dd + r2 * 0.7);
  }
  float D = smokeAt(q);
  col = col * (1.0 - 0.45 * D) + D * (vec3(0.032, 0.038, 0.055) + Lf * 0.035) + Ln * (0.03 + 0.3 * D);
  col += Lf * 0.011;                                                        // a big break lights the whole sky a little
  if (q.y > TTOP + 0.03) return col;

  // the Asian shore: hills, the town's lights, Çamlıca's tower on the far hill
  float ht = hillTop(q.x);
  float inHill = ss(gPx, -gPx, q.y - ht);
  if (inHill > 0.0) {
    vec3 c = vec3(0.012, 0.015, 0.03) + vec3(0.03, 0.018, 0.02) * ss(0.05, 0.0, q.y - WL);
    // the town on the hills: lights in clusters, sparse between them
    vec2 g = vec2(q.x * 130.0, (q.y - WL) * 190.0);
    vec2 gi = floor(g);
    float hl = hash21(gi + 5.0);
    float town = ss(0.35, 0.75, noise(vec2(q.x * 4.0, 1.7)));
    if (hl > mix(0.97, 0.86, town) && q.y < ht - 0.005) {
      vec2 at = (gi + 0.5 + (vec2(hash21(gi + 1.0), hash21(gi + 2.0)) - 0.5) * 0.6) / vec2(130.0, 190.0);
      vec3 tint = mix(vec3(1.0, 0.6, 0.28), vec3(0.8, 0.88, 1.0), step(0.6, hash21(gi + 3.0)));
      c += tint * lamp(vec2(q.x, q.y - WL) - at, gPx * 0.7, refl) * (0.12 + 0.3 * hash21(gi + 9.0));
    }
    c += Lf * (0.012 + 0.07 * ss(0.012, 0.0, ht - q.y));
    col = mix(col, c, inHill);
  }
  {
    float cx = -1.12, dx = q.x - cx, top = WL + 0.2;
    if (abs(dx) < 0.03 && q.y < top + 0.03) {
      float w = mix(0.006, 0.0025, clamp((q.y - WL) / 0.2, 0.0, 1.0));
      float a = max(line(abs(dx), w) * step(q.y, top), line(length(vec2(dx, (q.y - WL - 0.155) * 1.6)), 0.011));
      a = max(a, line(abs(dx), 0.0012) * step(q.y, top + 0.028));
      col = mix(col, vec3(0.015, 0.018, 0.035) + Lf * 0.03, a);
      col += vec3(1.0, 0.08, 0.05) * lamp(vec2(dx, q.y - top - 0.028), gPx, refl) * (0.6 + 0.4 * step(0.5, fract(uTime * 0.7)));
      col += vec3(0.7, 0.85, 1.0) * lamp(vec2(dx, q.y - WL - 0.155), gPx * 1.2, refl) * 0.6;
    }
  }

  // the bridge: the main cable sweeping off to the far tower, the side span, the zig-zag hangers
  if (q.y > WL && q.y < TTOP + 0.02) {
    float x = q.x;
    float cy, slope;
    if (x < TX) {
      float u = (x - CMID) / CHALF;
      cy = CLOW + (TTOP - CLOW) * u * u;
      slope = 2.0 * (TTOP - CLOW) * u / CHALF;
    } else {
      float u = clamp((x - TX) / 0.62, 0.0, 1.0);
      cy = TTOP + (DECK + 0.004 - TTOP) * u - 0.04 * u * (1.0 - u);
      slope = ((DECK + 0.004 - TTOP) - 0.04 * (1.0 - 2.0 * u)) / 0.62;
      if (x > TX + 0.62) cy = -9.0;
    }
    vec3 lc = bridgeLights(x);
    float dc = abs(q.y - cy) / sqrt(1.0 + slope * slope);
    float cab = line(dc, 0.0017);
    // hangers: inclined, in a zig-zag, between the deck and the main cable
    if (x < TX - 0.02 && q.y > DECK && q.y < cy) {
      float H = cy - DECK;
      float v = (q.y - DECK) / H;
      float u2 = x / 0.03;
      float tri = 1.0 - abs(mod(u2, 2.0) - 1.0);
      float dist = abs(tri - v) * H * 0.03 / sqrt(0.0009 + H * H);
      float hang = line(dist, 0.0005) * 0.55;
      col = mix(col, vec3(0.02, 0.025, 0.04) + Lf * 0.12 + lc * 0.05, hang);
    }
    col = mix(col, vec3(0.02, 0.022, 0.035) + Lf * 0.15, cab);
    // the lights strung along the cable
    if (dc < 0.02 && x < TX) {
      if (refl < 0.5) {
        float k = floor(x / 0.021 + 0.5) * 0.021;
        float ku = (k - CMID) / CHALF;
        col += lc * lamp(q - vec2(k, CLOW + (TTOP - CLOW) * ku * ku), gPx * 0.9, 0.0) * 0.9;
      } else {
        // in the water, like the deck's row: one band of their colour, broken by the glitter
        float by = dc / (gPx * 4.0);
        col += lc * exp(-by * by) * (0.03 + 0.55 * gGlit) * (0.3 + 0.7 * noise(vec2(x * 19.0, 7.0)));
      }
    }
    // the deck: its side lit in the bridge's colours, the road lamps on top
    float deck = ss(gPx, -gPx, deckSD(q));
    if (deck > 0.0 || abs(q.y - DECK) < 0.03) {
      vec3 dcol = vec3(0.012, 0.014, 0.024) + lc * 0.05 + Lf * 0.04;
      col = mix(col, dcol, deck);
      if (q.x < TX + 0.95) {
        if (refl < 0.5) {
          float k = floor(q.x / 0.013 + 0.5) * 0.013;
          col += lc * lamp(q - vec2(k, DECK - 0.0035), gPx * 0.8, 0.0) * 0.7;
        } else {
          // in the water this close row of lights would be a picket fence of identical ticks; the
          // swell runs them together into one band of their colour that shows only where a ripple
          // tips it towards us, so it breaks up into dashes of every length
          float by = (q.y - DECK + 0.0035) / (gPx * 8.0);
          col += lc * exp(-by * by) * (0.015 + 0.5 * gGlit) * (0.3 + 0.7 * noise(vec2(q.x * 23.0, 3.0)));
        }
        float kr = floor(q.x / 0.058 + 0.5), r = kr * 0.058;
        if (refl < 0.5) col += vec3(1.0, 0.72, 0.42) * lamp(q - vec2(r, DECK + 0.012), gPx * 0.9, 0.0) * 0.9;
        else {
          // in the water each road lamp is a long column that only shows where a ripple tips it
          // towards us: a broken run of glints, every one reaching its own way down and a few of them
          // lost in the swell, so the row never lines up into a picket fence
          float hr = hash11(kr * 7.13 + 0.5);
          vec2 d = q - vec2(r, DECK + 0.012);
          d.y *= 0.022 + 0.05 * hr;
          float qd = length(d) / (gPx * 0.9);
          float brk = ss(0.35, 0.65, noise(vec2(kr * 5.3, q.y * 95.0)));
          col += vec3(1.0, 0.72, 0.42) * exp(-qd * qd * 1.6) * gGlit * brk * step(0.25, hr) * (0.5 + 0.9 * hr);
        }
        col = mix(col, vec3(0.02), line(abs(q.x - r), 0.0006) * step(DECK + 0.004, q.y) * step(q.y, DECK + 0.012));
      }
    }
    // the tower, washed in the bridge's colours, its red lamps on top
    float tw = ss(gPx, -gPx, towerSD(q));
    if (tw > 0.0) {
      float side = clamp((abs(q.x - TX) - 0.016) / 0.007, -1.0, 1.0);
      vec3 tc = vec3(0.016, 0.018, 0.03) + bridgeLights(TX) * (0.06 + 0.22 * ss(DECK, TTOP, q.y)) * (0.55 + 0.45 * side) + Lf * 0.22;
      col = mix(col, tc, tw);
    }
    for (int l = 0; l < 2; l++) {
      vec2 at = vec2(TX + (float(l) * 2.0 - 1.0) * 0.016, TTOP + 0.004);
      col += vec3(1.0, 0.06, 0.04) * lamp(q - at, gPx * 1.1, refl) * (0.4 + 0.8 * step(0.5, fract(uTime * 0.5)));
    }
    // the golden waterfall pouring off the deck with the highs, glowing behind its sparks
    if (q.x < TX - 0.02 && q.y < DECK - 0.004 && gHi > 0.0) {
      float fall = (DECK - 0.009 - q.y) / (DECK - 0.009 - WL);
      float sheet = 0.55 + 0.45 * noise(vec2(q.x * 140.0, q.y * 14.0 + uTime * 9.0));
      float wf = ss(0.2, 0.8, gHi);
      col += vec3(1.0, 0.58, 0.22) * wf * 0.1 * sheet * exp(-max(fall, 0.0) * 2.2) * ss(-0.02, 0.05, fall);
      col += vec3(1.0, 0.8, 0.5) * wf * 0.8 * lamp(vec2(0.0, q.y - DECK + 0.0095), gPx * 0.8, refl) * (0.6 + 0.4 * noise(vec2(q.x * 300.0, uTime * 20.0)));
    }
  }

  // the near shore and the mosque, in front of everything
  float house;
  float nt = nearTop(q.x, house);
  float inNear = ss(gPx, -gPx, q.y - nt);
  if (inNear > 0.0) {
    vec3 c = vec3(0.011, 0.012, 0.02) + Lf * (0.012 + 0.2 * ss(0.01, 0.0, nt - q.y));   // the skyline's edge catches every burst
    // windows: two to a house front, a row every storey, a few of them lit
    float hx = q.x / 0.042, hf = fract(hx);
    float wy = (q.y - WL - 0.02) / 0.012;
    vec2 wi = vec2(floor(hx) * 2.0 + step(0.5, hf), floor(wy));
    vec2 wd = vec2((fract(hf * 2.0) - 0.5) * 0.021, (fract(wy) - 0.5) * 0.012);
    float lit = step(0.7, hash21(wi + 11.0)) * step(q.y, house - 0.006) * step(0.0, wy);
    float win = ss(0.0042 + gPx * 0.5, 0.0042 - gPx * 0.5, abs(wd.x)) * ss(0.0035 + gPx * 0.5, 0.0035 - gPx * 0.5, abs(wd.y));
    vec3 wc = mix(vec3(1.0, 0.6, 0.28), vec3(0.95, 0.8, 0.6), hash21(wi + 2.0)) * (0.2 + 0.3 * hash21(wi + 4.0));
    if (refl > 0.5) win = exp(-dot(wd * vec2(1.0, 0.25), wd * vec2(1.0, 0.25)) / (gPx * gPx * 4.0));
    c += wc * win * lit;
    // on the wooded hill: canopies lit faintly from above, and lamps among the trees
    if (q.x > TX) {
      float leaf = noise(q * 160.0) * noise(q * 47.0 + 3.0);
      c += Lf * 0.12 * leaf * ss(-0.25, 0.0, q.y - nt) + vec3(0.006, 0.008, 0.012) * noise(q * 60.0);   // treetops lit from above
      vec2 g = vec2(q.x * 110.0, (q.y - WL) * 120.0), gi = floor(g);
      float hl = hash21(gi + 23.0);
      float hamlet = ss(0.45, 0.8, noise(vec2(q.x * 7.0, q.y * 9.0) + 4.0));
      if (hl > mix(0.985, 0.88, hamlet) && q.y < nt - 0.008) {
        vec2 at = (gi + 0.5 + (vec2(hash21(gi + 1.0), hash21(gi + 2.0)) - 0.5) * 0.6) / vec2(110.0, 120.0);
        c += mix(vec3(1.0, 0.62, 0.3), vec3(0.85, 0.9, 1.0), step(0.96, hl)) * lamp(vec2(q.x, q.y - WL) - at, gPx * 0.8, refl) * (0.2 + 0.35 * hash21(gi + 9.0));
      }
    }
    col = mix(col, c, inNear);
  }
  float ms = mosqueSD(q);
  float inM = ss(gPx, -gPx, ms);
  if (inM > 0.0) {
    vec2 m = (q - vec2(MX, WL)) / MS;                  // mosque units
    float mpx = gPx / MS;
    // Floodlit from the quay, the way it stands at night: pale stone washed warm from below, so
    // the walls brighten towards their foot and fall into shadow under each moulding.
    vec3 stone = vec3(0.62, 0.45, 0.29);
    float flood = 0.3 + 0.7 * ss(0.2, 0.0, m.y);
    vec2 mm = vec2(abs(m.x) - MINX, m.y);               // across the nearer minaret (+ = its outer side)
    vec2 dq = (m - vec2(0.0, 0.156)) / vec2(0.074, 0.068);
    float hw = m.y > 0.33 ? 0.0066 * clamp((0.392 - m.y) / 0.062, 0.05, 1.0) : minHW(m.y);
    bool balc = abs(m.y - 0.2725) < 0.0034 + mpx && abs(mm.x) < 0.0118 + mpx;
    vec3 c;
    if (m.y > 0.142 && (abs(mm.x) < hw + mpx || balc)) {
      // a minaret: an octagonal stone shaft whose front face takes the floodlights and whose
      // two side faces turn away (the outer one darker), fading into the night as it rises; the
      // balcony's corbelled underside lit from below with its dark rail above, and the pencil cap
      // dark lead, its faces catching the bursts
      float u = mm.x / hw, e = mpx / hw;
      float face = mix(0.6, 1.0, ss(-0.42 - e, -0.42 + e, u));
      face = mix(face, 0.36, ss(0.42 - e, 0.42 + e, u));
      c = stone * face * 0.6 * (0.42 + 0.58 * ss(0.36, 0.1, m.y));
      c *= 1.0 - 0.7 * ss(0.007, 0.0, 0.269 - m.y) * step(m.y, 0.269);                // shadow under the balcony
      if (balc) {
        float under = ss(0.2715 + mpx, 0.2715 - mpx, m.y);
        float bf = 1.0 - 0.45 * ss(0.006, 0.0118, abs(mm.x));                          // it rounds away at its ends
        c = mix(vec3(0.045, 0.04, 0.045), stone * 0.62 * bf * (0.7 + 0.3 * ss(0.2692, 0.2712, m.y)), under);
        c = mix(c, stone * 0.3, ss(0.0007 + mpx, 0.0007 - mpx, abs(m.y - 0.2752)) * step(abs(mm.x), 0.0112));   // the rail's top
      }
      if (m.y > 0.33) {
        c = vec3(0.028, 0.031, 0.045) * face * 1.3 + Lf * (0.05 + 0.25 * face);
        c += stone * 0.12 * ss(0.342, 0.33, m.y);                                      // its rim catches the light
      }
    } else if (m.y <= 0.142 && abs(mm.x) < 0.0088 + mpx && abs(m.x) > 0.1 && m.y > 0.012) {
      // the minaret's pedestal, standing out from the corner of the hall, its top a moulding
      float u = mm.x / 0.0088, e = mpx / 0.0088;
      c = stone * flood * 0.5 * mix(1.0, 0.6, ss(0.4 - e, 0.4 + e, u));
      c *= 1.0 + 0.4 * ss(0.003 + mpx, 0.003 - mpx, abs(m.y - 0.139));
      c *= 1.0 - 0.4 * ss(0.006, 0.0, 0.135 - m.y) * step(m.y, 0.135);
    } else if (m.y > 0.156 && length(dq) < 1.06) {
      // the dome: lead, washed warm along its foot by the floodlights, darker as it curves away,
      // the bursts on its crown; ribs run up it
      vec3 n = normalize(vec3(dq, sqrt(max(1.0 - dot(dq, dq), 0.0)) + 0.05));
      float rib = ss(0.12, 0.0, abs(fract(asin(clamp(dq.x / max(sqrt(max(1.0 - dq.y * dq.y, 0.0)), 1e-3), -1.0, 1.0)) * 2.55 + 0.5) - 0.5)) * ss(0.95, 0.4, dq.y);
      c = vec3(0.07, 0.08, 0.105) * (0.45 + 0.75 * n.z) + stone * 0.42 * ss(0.75, 0.0, dq.y) * (0.4 + 0.6 * n.z);
      c *= 1.0 - 0.3 * rib;
      c += Lf * (0.08 + 0.75 * max(n.y, 0.0));
      if (abs(m.x) < 0.0045 && m.y > 0.215) c = vec3(0.3, 0.22, 0.1) + Lf * 0.3;          // the gilt finial
    } else if (m.y > 0.134) {
      // the drum under the dome with its ring of small arched windows, and the corner turrets
      c = stone * 0.36 * (0.75 + 0.25 * ss(0.072, 0.0, abs(m.x)));
      if (abs(m.x) < 0.066) {
        float k = floor(m.x / 0.0165 + 0.5), lx = m.x - k * 0.0165;
        vec2 a = vec2(lx, m.y - 0.139);
        float w = max(max(abs(a.x) - 0.0042, -a.y), min(a.y - 0.0105, length(a - vec2(0.0, 0.0105)) - 0.0042));
        w = max(w, a.y - 0.0105 - 0.0042);
        c = mix(c, vec3(1.0, 0.62, 0.3) * 0.42, ss(mpx, -mpx, w));
      }
      c *= 1.0 - 0.45 * ss(0.0025, 0.0, m.y - 0.134);                                  // the cornice's shadow
    } else {
      // the prayer hall: pilasters between the windows, cornices with shadow under them, the
      // plinth along the foot; the corners turn away from the light
      c = stone * flood * 0.62;
      float pil = max(ss(0.0045 + mpx, 0.0045 - mpx, abs(abs(m.x) - 0.024)), ss(0.0045 + mpx, 0.0045 - mpx, abs(abs(m.x) - 0.072)));
      c *= 1.0 + 0.3 * pil;
      for (int k = 0; k < 2; k++) {
        float cy = k == 0 ? 0.128 : 0.064;
        c *= 1.0 + 0.45 * ss(0.0035 + mpx, 0.0035 - mpx, abs(m.y - cy));             // the moulding catches the light
        c *= 1.0 - 0.5 * ss(0.006, 0.0, cy - 0.0035 - m.y) * step(m.y, cy - 0.0035);    // and shades the wall under it
      }
      c *= 1.0 - 0.18 * ss(0.022 + mpx, 0.022 - mpx, m.y);
      c *= 1.0 - 0.4 * ss(0.088, 0.105, abs(m.x));
      if (m.y < 0.012) c = stone * 0.2;                                               // the quay
      // the great arched windows in two tiers: a deep reveal, then the glass, lit warm inside
      if (abs(m.x) < 0.1 && m.y > 0.012) {
        float wx = m.x / 0.048;
        float col3 = floor(wx + 0.5);
        if (abs(col3) <= 1.0) {
          float lx = (wx - col3) * 0.048;
          for (int t = 0; t < 2; t++) {
            float y0 = t == 0 ? 0.026 : 0.083, hh = 0.03;
            vec2 a = vec2(lx, m.y - y0);
            float arch = max(abs(a.x) - 0.011, a.y - hh);
            arch = min(arch, max(length(a - vec2(0.0, hh)) - 0.011, hh - a.y));
            arch = max(arch, -a.y);
            c *= 1.0 - 0.55 * ss(0.0035, 0.0, arch);                                       // the reveal
            float lit = ss(mpx, -mpx, arch);
            float mull = max(ss(0.0007 + mpx, 0.0007 - mpx * 0.3, abs(a.x)), ss(0.0007 + mpx, 0.0007 - mpx * 0.3, abs(a.y - hh * 0.55)));
            vec3 glow = vec3(1.0, 0.6, 0.27) * (0.5 + 0.22 * hash11(col3 * 1.7 + float(t) * 3.0)) * (0.85 + 0.4 * ss(0.0, hh, a.y));
            c = mix(c, glow * (1.0 - 0.75 * mull), lit);
          }
        }
      }
    }
    col = mix(col, c, inM);
  }
  // the lamps round each minaret's balcony
  if (abs(q.y - WL - 0.276 * MS) < 0.03) {
    for (int s = 0; s < 2; s++) {
      vec2 b = vec2(MX + (float(s) * 2.0 - 1.0) * MINX * MS, WL + 0.278 * MS);
      for (int k = -2; k <= 2; k++) col += vec3(1.0, 0.85, 0.6) * lamp(q - b - vec2(float(k) * 0.0045 * MS, 0.0), gPx * 0.8, refl) * 0.55;
    }
  }
  // lamps along the quay
  // lamps along the quay, not quite evenly spaced, a few of them out
  if (abs(q.y - WL - 0.02) < 0.02) {
    float kc = floor(q.x / 0.05 + 0.5), h = hash11(kc * 7.31 + 2.0);
    float k = (kc + 0.28 * (hash11(kc * 3.7 + 1.0) - 0.5)) * 0.05;
    col += vec3(1.0, 0.7, 0.4) * lamp(q - vec2(k, WL + 0.02), gPx, refl) * 0.6 * step(0.18, h) * (0.55 + 0.45 * h);
  }
  return col;
}

// a Bosphorus ferry crossing slowly: black hull, white two-deck superstructure with rows of lit
// windows, the funnel, the wheelhouse forward, a masthead light and its green side light.
// f: in the ferry's own units (its hull runs from -0.5 to 0.5), fpx: a pixel in those units
vec4 ferry(vec2 f, float fpx, float refl) {
  float hullTop = 0.065 + 0.02 * f.x * f.x;
  float hull = max(max(abs(f.x) - 0.5 + 0.06 * ss(0.0, 0.065, f.y) * step(f.x, 0.0), -f.y), f.y - hullTop);
  hull = max(hull, (f.x - 0.5) - (hullTop - f.y) * 0.4);                       // the raked bow
  float deck1 = boxSD(f, vec2(-0.02, 0.095), vec2(0.37, 0.03));
  float deck2 = boxSD(f, vec2(-0.04, 0.147), vec2(0.25, 0.022));
  float wheel = boxSD(f, vec2(0.17, 0.182), vec2(0.06, 0.016));
  float funnel = boxSD(f, vec2(-0.07 + (f.y - 0.17) * 0.25, 0.215), vec2(0.026, 0.05));
  float mast = boxSD(f, vec2(0.27, 0.24), vec2(max(0.004, fpx * 0.6), 0.08));
  float upper = min(min(deck1, deck2), min(wheel, funnel));
  float d = min(min(hull, upper), mast);
  float a = ss(fpx, -fpx, d);
  if (a <= 0.0) return vec4(0.0);
  vec3 c = vec3(0.012, 0.012, 0.018);
  if (upper < hull && upper < mast) {
    c = vec3(0.07, 0.07, 0.08);                                                 // white paint at night
    if (funnel < min(deck1, deck2)) c = mix(vec3(0.01), vec3(0.08, 0.075, 0.07), ss(0.24, 0.235, f.y));
    // the rows of windows, most of them lit
    float row = deck1 < deck2 ? 0.098 : 0.15;
    float wx = f.x / 0.028, wi = floor(wx);
    float lit = step(0.25, hash11(wi * 3.7 + row * 50.0));
    float win = ss(0.32, 0.22, abs(fract(wx) - 0.5)) * ss(0.012, 0.007, abs(f.y - row)) * step(0.0, funnel);
    c = mix(c, vec3(1.0, 0.7, 0.38) * (0.55 + 0.3 * hash11(wi * 1.3)) * lit + vec3(0.02) * (1.0 - lit), win * step(min(deck1, deck2), 0.0));
  } else if (hull < mast) {
    c += vec3(0.05, 0.05, 0.055) * ss(0.045, 0.06, f.y);                       // the white line along the hull
  }
  vec4 res = vec4(c * a, a);
  // its lights
  float s = mix(1.0, 0.25, refl);
  vec2 l1 = (f - vec2(0.27, 0.322)) * vec2(1.0, s), l2 = (f - vec2(0.22, 0.19)) * vec2(1.0, s);
  res.rgb += vec3(1.0, 0.95, 0.85) * exp(-dot(l1, l1) / (fpx * fpx * 2.5)) * 1.8 + vec3(0.2, 1.0, 0.4) * exp(-dot(l2, l2) / (fpx * fpx * 2.0)) * 1.2;
  return res;
}

vec3 water(vec2 p) {
  float dp = WL - p.y;
  float zd = dp + 0.015;
  // the ripples in perspective: long across, thin up and down, finer towards the far shore
  vec2 wq = vec2(p.x / zd * 0.8, 2.4 / zd);
  float t = uTime;
  float r1 = noise(wq + vec2(t * 0.04, -t * 0.8));
  float r2 = noise(wq * vec2(2.3, 2.1) + vec2(3.1 - t * 0.06, -t * 1.3));
  float r3 = noise(wq * vec2(4.6, 4.2) + vec2(8.3, -t * 2.2));
  float rip = r1 * 0.55 + r2 * 0.3 + r3 * 0.15 - 0.5;
  float fz = 2.4 * gPx / (zd * zd);                       // ripples per pixel, up and down
  float aa = ss(0.9, 0.2, fz);
  // A ripple tilts the water up and down far more than sideways, so what it reflects is moved up
  // and down: a light becomes a column of glints under itself, and a row of lights a band of them,
  // instead of a line wriggling from side to side.
  float dx = (r2 - 0.5) * (0.002 + 0.012 * dp) * aa;
  float dy = rip * (0.003 + 0.6 * dp) * aa;
  // the glitter of the small ripples riding on the swell: a dense stack of thin dashes. Counted
  // down from the far shore they crowd together in perspective; where they would get finer than
  // a few pixels they stop crowding (the count goes on at the same pixel rate), so the water
  // near the far shore still glitters instead of melting into a smooth glow
  float zc = sqrt(52.8 * gPx);
  float V = 2.4 / max(zd, zc) + 2.4 / (zc * zc) * max(zc - zd, 0.0);
  vec2 wg = vec2(p.x / max(zd, 0.05) * 0.8, V);
  float g1 = noise(wg * vec2(2.6, 5.5) + vec2(1.3 + r1 * 0.8 * aa, -t * 3.0));
  float g2 = noise(wg * vec2(5.2, 10.5) + vec2(4.1, -t * 4.4));
  float glit = ss(0.56, 0.86, g1 * 0.6 + g2 * 0.4 + rip * 0.25 * aa);
  gGlit = glit;
  vec3 refl = world(vec2(p.x + dx, WL + max(dp + dy, 0.0)), 1.0);
  // the faces of the ripples that tip the light towards us: thin bright dashes across
  float gl = ss(0.5, 0.8, r1 * 0.45 + r3 * 0.35 + r2 * 0.2 + 0.08 * rip);
  gl = mix(0.35, gl, aa);
  float fres = mix(0.6, 0.3, ss(0.0, 0.45, dp)) * mix(1.0, 0.45 + 1.1 * gl, aa * ss(0.02, 0.12, dp));
  vec3 col = vec3(0.004, 0.007, 0.016) * (1.0 + 2.0 * dp) + refl * fres;
  // every burst's light on the water: a long column of that glitter, each dash pushed sideways by
  // its ripple so the column's edges fray, over a faint sheen; the brighter the burst, the
  // further down it reaches
  for (int i = 0; i < 7; i++) {
    if (gGl[i] <= 0.0) continue;
    float w = 0.02 + 0.32 * gS[i].R;
    float cx = gS[i].c.x + ((g1 - 0.5) * 1.3 + (r2 - 0.5) * 0.6 * aa) * w;
    float d = (p.x - cx) / w;
    float reach = exp(-dp * mix(2.6, 1.0, ss(0.3, 1.6, gGl[i])));
    float L = gGl[i] / (1.0 + 0.7 * gGl[i]) * 1.6;                       // the brightest flashes held back a little
    col += gCo[i] * L * (exp(-d * d) * (0.035 + 2.6 * glit) + 0.022 * exp(-d * d * 0.15)) * reach;
  }
  // the waterfall's gold on the water below the span
  if (p.x < TX && gHi > 0.0) {
    float wf = ss(0.2, 0.8, gHi) * ss(TX, TX - 0.04, p.x);
    col += vec3(1.0, 0.6, 0.25) * wf * (0.3 * gl + glit) * exp(-dp * 4.0) * 0.32;
  }
  // the ferry and its reflection
  float F = 0.36, fy = WL - 0.1;
  float fx = -gW - 0.3 + mod(uTime * 0.013 + 7.0, 2.0 * gW + 0.6);
  vec2 f = (p - vec2(fx, fy)) / F;
  if (abs(f.x) < 0.6 && f.y < 0.35 && f.y > -0.45) {
    float fpx = gPx / F;
    if (f.y >= 0.0) {
      vec4 fc = ferry(f, fpx, 0.0);
      col = col * (1.0 - fc.a) + fc.rgb;
    } else {
      vec4 fc = ferry(vec2(f.x + dx / F * 2.0, -f.y * 1.1), fpx, 1.0);
      col = col * (1.0 - 0.6 * fc.a) + fc.rgb * 0.45 * mix(0.4, 1.0, gl);
    }
  }
  return col;
}

void main() {
  setup();
  gPx = 2.0 / uRes.y;
  vec2 p = centered();
  gS[0] = beatShell();
  for (int i = 0; i < 6; i++) {
    gS[i + 1] = mortar(i, 0.0);
    Shell b = mortar(i, 1.0);
    // a shell's smoke lingers through the next shell and has thinned away before that one's turn is up
    float P = PER[i];
    gPuff[i] = vec4(gS[i + 1].c, gS[i + 1].R, gS[i + 1].a);
    gPuffA[i] = gS[i + 1].on;
    gPuff[i + 6] = vec4(b.c, b.R, b.a);
    gPuffA[i + 6] = b.on * ss(2.0 * P - b.rise, 2.0 * P - b.rise - 2.2, b.a);
  }
  for (int i = 0; i < 7; i++) {
    vec2 g = shellGlow(gS[i]);
    gGl[i] = g.x + g.y;
    gCo[i] = shellColour(gS[i]);
    // the smoke takes the stars' light more than the break's (an instant's flash lighting a whole
    // cloud reads as lightning, not fireworks)
    gSm[i] = mix(gCo[i], vec3(dot(gCo[i], vec3(0.3, 0.5, 0.2))), 0.45) * (g.x * 0.4 + g.y);
  }
  gGlit = 0.0;
  vec3 col = p.y >= WL ? world(p, 0.0) : water(p);
  col += (hash21(gl_FragCoord.xy + fract(uTime * 7.3) * 91.0) - 0.5) / 255.0;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

// ── the stars: one point per star segment, crackle, rising shells, the waterfall ─────────────────
const SHELL_POINTS = 1009;          // 224 stars x 4 segments, 96 crackles, 16 for the rising shell, the flash
const WATERFALL = 2000;

const vert = `${SHARED}
// a streak of light from a (tail) to b (head); fall: brightness at the tail over the head's;
// r: its glow radius in pixels at 1080p
// flatEnds = 1 for a trail chord: its ends are soft flat ramps instead of round caps, so where
// two chords meet their ramps add up to exactly one and the joint shows no bead
void emit(vec2 a, vec2 b, float r, vec3 rgb, float fall, float flatEnds) {
  vec2 mid = 0.5 * (a + b);
  float upx = uRes.y * 0.5;
  vec2 dpx = (b - a) * upx;
  float L = length(dpx);
  float rp = max(r * uPointScale, 1.3);
  float S = min(L + 2.0 * rp, uPointMax);
  float vis = ss(-0.6 * rp / upx, 0.6 * rp / upx, skySD(mid));
  vec3 c = rgb * vis;
  if (max(c.r, max(c.g, c.b)) < 0.004) return;
  gl_Position = vec4(mid.x / gAsp, mid.y, 0.0, 1.0);
  gl_PointSize = S;
  vColor = vec4(c, floor(clamp(fall, 0.0, 1.0) * 15.0 + 0.5) + 16.0 * flatEnds + clamp(L / S, 0.0, 0.97));
  vShape = L > 0.01 ? atan(dpx.y, dpx.x) : 0.0;
}
void emit(vec2 a, vec2 b, float r, vec3 rgb, float fall) { emit(a, b, r, rgb, fall, 0.0); }

// one star of a shell: which way it flies (on a sphere, seen from far off), how fast, whether it
// belongs to the pistil or inner petal, when it burns out, and for a crossette when and which way
// it splits
struct Star { vec3 d; float sp; float inner; float hj; float Ls; float ts; vec2 sub; };
Star starOf(Shell s, float j) {
  Star st;
  st.sp = 1.0; st.inner = 0.0; st.ts = 99.0; st.sub = vec2(0.0);
  st.hj = hash11(j * 1.618 + s.seed);
  float M = NSTAR, jj = j;
  if (s.kind == 3.0 && j < 120.0) {
    float an = (j + 0.3 * st.hj) / 120.0 * TAU;
    st.d = vec3(cos(an), sin(an), 0.0);
    st.sp = 1.0 + 0.02 * (st.hj - 0.5);
  } else {
    if (s.kind == 3.0) { M = NSTAR - 120.0; jj = j - 120.0; st.sp = 0.42; st.inner = 1.0; }
    if (s.kind == 5.0) { st.inner = mod(j, 2.0); st.sp = st.inner > 0.5 ? 0.58 : 1.0; jj = floor(j * 0.5); M = NSTAR * 0.5; }
    if (s.kind == 4.0) { jj = floor(j * 0.25); M = NSTAR * 0.25; }
    if (s.kind == 2.0) M = NSTAR * 0.5;                    // a willow: half the stars, each a long trail
    float z = 1.0 - 2.0 * (jj + 0.5) / M;
    float r = sqrt(max(1.0 - z * z, 0.0));
    float ph = jj * 2.39996323 + s.seed;
    st.d = vec3(r * cos(ph), r * sin(ph), z);
    st.sp *= 1.0 + 0.07 * (hash11(jj * 1.618 + s.seed) - 0.5);
  }
  // a ring is tipped at most about 50 degrees, so it never turns edge on into a bar of light
  float tip = s.kind == 3.0 ? 0.85 : 1.0;
  st.d.yz = rot(tip < 1.0 ? tip * sin(s.seed * 1.3) : s.seed * 1.3) * st.d.yz;
  st.d.xz = rot(tip < 1.0 ? tip * sin(s.seed * 2.1) : s.seed * 2.1) * st.d.xz;
  st.Ls = s.life * (0.8 + 0.3 * hash11(j * 3.17 + s.seed * 0.71));
  if (s.kind == 4.0) {
    // a crossette: every star splits in four, crosswise, part way out
    float base = floor(j * 0.25) * 4.0;
    st.ts = 0.42 + 0.14 * hash11(base * 0.37 + s.seed);
    st.Ls = s.life * (0.8 + 0.3 * hash11(base * 3.17 + s.seed * 0.71));
    float an = atan(st.d.y, st.d.x) + PI * 0.25 + mod(j, 4.0) * PI * 0.5;
    st.sub = vec2(cos(an), sin(an)) * 0.33 * s.R;
  }
  return st;
}
vec2 starAt(Shell s, Star st, float a) {
  float e = 1.0 - exp(-s.k * a);
  vec2 p = s.c + st.d.xy * (s.R * st.sp * e) + vec2(0.012 * a, -s.G * (a - e / s.k));
  if (a > st.ts) p += st.sub * (1.0 - exp(-6.0 * (a - st.ts)));
  return p;
}

// segment 0 is the star itself, streaked by its own motion; 1 to 3 are its trail, sparks shed
// along its path, the youngest brightest
void starPoint(Shell s, float j, float seg) {
  Star st = starOf(s, j);
  float a = s.a, Ls = st.Ls;
  float HB = s.kind == 5.0 ? 1.85 : (s.kind == 2.0 ? 1.1 : (s.kind == 3.0 ? 2.1 : 1.9));
  vec3 col = s.kind == 3.0 || s.kind == 5.0 ? (st.inner > 0.5 ? s.cb : s.ca) : mix(s.ca, s.cb, ss(0.42, 0.58, a / Ls + 0.08 * (st.hj - 0.5)));
  if (s.kind == 4.0 && a < st.ts) col = vec3(1.0, 0.78, 0.45);                // gold until it splits
  // a crossette's three new stars only exist from the split on
  float born = s.kind == 4.0 && mod(j, 4.0) > 0.5 ? st.ts : 0.0;
  // the highs: a third of the stars strobe
  float hs = hash11(j * 5.3 + s.seed * 1.9);
  float strobe = hs < 0.35 ? mix(1.0, step(0.5, fract(a * 12.0 + st.hj * 7.0)) * 1.5, gHi * 0.9) : 1.0;
  if (seg == 0.0) {
    if (a > Ls || a < born) return;
    float b = HB * ss(0.0, s.kind == 3.0 ? 0.22 : 0.06, a) * (1.0 - ss(Ls * 0.8, Ls, a));
    // while the shell is still a tight knot its stars overlap; dim them by how far it has opened,
    // or the first frames add up to a white blot (the break's own flash is the picture's glow)
    // A ring is worse: all its stars on one thin ellipse, so they only light up once it has opened.
    float opened = 1.0 - exp(-s.k * (a - born));
    b *= s.kind == 3.0 && st.inner < 0.5 ? ss(0.3, 0.62, opened) : mix(0.25, 1.0, ss(0.0, 0.45, opened));
    b *= a > Ls * 0.7 ? 0.55 + 0.45 * sin(a * 47.0 + st.hj * 40.0) : 1.0;     // a flicker as it burns out
    vec3 c = mix(vec3(1.0, 0.94, 0.82), col, ss(0.0, s.kind == 5.0 ? 0.16 : 0.08, a));   // white-hot as it breaks
    // the streak is what the star covered in the last 35 ms, but never more than the outer half of
    // its path: at the break the stars are all still bunched at the centre, and streaks reaching
    // back to it would fill the shell in as one solid white blot
    emit(starAt(s, st, max(a - min(0.035, 0.45 * (a - born)), born)), starAt(s, st, a), 4.6, c * b * strobe * s.on, 0.35);
    return;
  }
  // The trail is the sparks the star shed along its path over the last T seconds, each of them
  // sagging a little since. It is drawn as straight chords between points pinned to the path by
  // the star's age. A willow's are short (w1) where the path bends from flying out to falling and
  // longer (w2) once the star only falls, so its strands hang in smooth arches instead of
  // kinking; the other shells' shorter trails are cut into chords half the trail long (so three
  // always cover it, and no streak is one long, costly sprite). The chords never slide along
  // the curve. Slot 1 is the chord at the trail's head, slot 2 the one before it, and so on.
  float T = s.trail;
  bool willow = s.kind == 2.0;
  float w1 = willow ? 0.16 : 0.5 * T, w2 = willow ? 0.5 : 0.5 * T, n0 = willow ? 6.0 : 0.0;
  float A0 = n0 * w1;
  float hE = min(a - 0.035, Ls);                            // the star's age at the trail's head
  float lo = max(a - 0.035 - T, born);                      // and at its tail
  if (hE <= lo) return;
  float ih = hE < A0 ? floor(hE / w1) : n0 + floor((hE - A0) / w2);
  float ic = ih - (seg - 1.0);
  if (ic < 0.0) return;
  float eT = max(ic <= n0 ? ic * w1 : A0 + (ic - n0) * w2, lo);
  float eH = min(ic + 1.0 <= n0 ? (ic + 1.0) * w1 : A0 + (ic + 1.0 - n0) * w2, hE);
  if (eH <= eT) return;
  float tauH = a - eH, tauT = a - eT;
  // brightness along it: dimmer the older the sparks, gone at the end of the trail, and faint
  // for the sparks shed right at the break (or a willow is a wheel of spokes into its centre)
  float tf = T * 0.45, nf = willow ? 0.32 : 0.06;
  float fH = exp(-tauH / tf) * ss(T + 0.035, 0.5 * T, tauH) * ss(0.0, nf, eH - born);
  float fT = exp(-tauT / tf) * ss(T + 0.035, 0.5 * T, tauT) * ss(0.0, nf, eT - born);
  if (fH < 0.002) return;
  bool charcoal = s.kind == 1.0 || willow;
  vec3 tc = charcoal ? mix(vec3(1.0, 0.62, 0.26), vec3(1.0, 0.3, 0.07), ss(0.0, T, 0.5 * (tauH + tauT))) : col;
  float TG = willow ? 0.95 : (charcoal ? 0.55 : 0.5);
  // trails grow in as the stars spread: right at the break a hundred streaks back to the centre
  // would fill the shell in (a ring as a solid white ellipse)
  // (the flicker is the whole star's, so neighbouring chords still agree where they meet)
  float b = HB * TG * fH * (0.82 + 0.18 * sin(uTime * 31.0 + j * 2.7)) * ss(0.05, 0.2, a - born);
  vec2 hp = starAt(s, st, eH) - vec2(0.0, 0.05 * tauH * tauH);
  vec2 tp = starAt(s, st, eT) - vec2(0.0, 0.05 * tauT * tauT);
  emit(tp, hp, 3.2, tc * b * s.on, fT / max(fH, 1e-4), 1.0);
}

void cracklePoint(Shell s, float i) {
  float j = floor(hash11(i * 1.7 + s.seed) * (s.kind == 2.0 ? NSTAR * 0.5 : NSTAR));
  Star st = starOf(s, j);
  float tp = st.Ls * (s.kind == 5.0 ? 0.4 + 0.4 * hash11(i * 2.9 + s.seed) : 0.5 + 0.55 * hash11(i * 2.9 + s.seed));
  float age = s.a - tp;
  if (age < 0.0 || age > 0.1) return;
  if (hash11(i * 4.3 + s.seed * 0.3) > 0.25 + 0.75 * gHi) return;
  vec2 at = starAt(s, st, tp) + (vec2(hash11(i * 5.1 + s.seed), hash11(i * 6.7 + s.seed)) - 0.5) * 0.05 * s.R / 0.3;
  emit(at, at, 3.4, vec3(1.0, 0.92, 0.75) * 2.6 * exp(-age * 40.0) * s.on, 1.0);
}

vec2 risePath(Shell s, float u) {
  u = clamp(u, 0.0, 1.0);
  return vec2(mix(s.from.x, s.c.x, u) + 0.005 * sin(u * 17.0 + s.seed), mix(s.from.y, s.c.y, 1.0 - (1.0 - u) * (1.0 - u)));
}
// where the spark the rising shell shed tau seconds ago is now: on its path, drifted a little and
// sagging (shed at te, the shell's own time since firing)
vec2 riseSpark(Shell s, float te, float tau) {
  return risePath(s, te / s.rise) + vec2(0.012 * tau * sin(tau * 9.0 + s.seed), -0.12 * tau * tau);
}
void risePoint(Shell s, float i) {
  float t = s.a + s.rise;
  if (t < 0.0 || t > s.rise + 0.45) return;
  float fl = 0.75 + 0.25 * sin(uTime * 53.0 + s.seed * 3.1);
  if (i == 0.0) {
    if (t > s.rise) return;
    emit(risePath(s, (t - 0.12) / s.rise), risePath(s, t / s.rise), 4.4, vec3(1.0, 0.8, 0.5) * 2.0 * fl * s.on, 0.15);
    return;
  }
  // its tail: one continuous thread of fading sparks, chord i covering the sparks shed between
  // (i-1)x45 and ix45 ms ago (after the break it hangs a moment and fades)
  float te0 = min(t - (i - 1.0) * 0.045, s.rise), te1 = max(t - i * 0.045, 0.0);
  if (te0 <= te1) return;
  float ta = t - te0, tb = t - te1;
  float fA = exp(-ta * 3.5) * ss(0.68, 0.4, ta), fB = exp(-tb * 3.5) * ss(0.68, 0.4, tb);
  if (fA < 0.003) return;
  emit(riseSpark(s, te1, tb), riseSpark(s, te0, ta), 2.4, vec3(1.0, 0.55, 0.18) * 1.4 * fA * fl * s.on, fB / fA, 1.0);
}

// the break: the bursting charge's white flash at the shell's heart, gone in a tenth of a second,
// the light the first instant's smoke and water glow by before the stars have spread
void flashPoint(Shell s) {
  if (s.a < 0.0 || s.a > 0.14) return;
  float f = exp(-s.a * 28.0) * ss(0.0, 0.012, s.a + 0.004);
  emit(s.c, s.c, 30.0 * s.R / 0.3, vec3(1.0, 0.88, 0.7) * 1.5 * f * s.on, 1.0);
}

// the waterfall: fountains all along the main span pour sparks off the deck, the curtain thick
// at the top and thinning as the sparks burn out on the way down
void waterfallPoint(float i) {
  if (gHi < 0.02) return;
  float x0 = -gAsp - 0.03, x1 = TX - 0.03;
  if (i >= (x1 - x0) * 950.0) return;
  float h1 = hash11(i * 1.37 + 0.5), h2 = hash11(i * 2.71 + 0.3), h3 = hash11(i * 4.1 + 0.9), h4 = hash11(i * 6.3 + 0.1);
  float x = x0 + (i + h1) / 950.0;
  float T = 0.75 + 0.3 * h2;                                // to fall all the way
  float t = fract(uTime / T + h3) * T;
  float dies = T * (0.6 + 0.45 * h4);                       // most burn out before the water
  if (t > dies) return;
  float y0 = DECK - 0.009;
  float g = 2.0 * (y0 - WL) / (T * T);
  vec2 at = vec2(x + 0.008 * t, y0 - 0.5 * g * t * t);
  float tp = max(t - 0.11, 0.0);
  vec2 bt = vec2(x + 0.008 * tp, y0 - 0.5 * g * tp * tp);
  float b = ss(0.2, 0.8, gHi) * (0.6 + 0.4 * sin(uTime * 41.0 + i * 1.9)) * (1.0 - ss(dies * 0.6, dies, t)) * (1.15 - 0.5 * t / T);
  emit(bt, at, 2.4, vec3(1.0, 0.68, 0.32) * 1.35 * b, 0.1);
}

void main() {
  setup();
  int id = gl_VertexID;
  if (id >= 7 * ${SHELL_POINTS}) { waterfallPoint(float(id - 7 * ${SHELL_POINTS})); return; }
  int slot = id / ${SHELL_POINTS};
  int k = id - slot * ${SHELL_POINTS};
  Shell s;
  if (slot == 0) s = beatShell();
  else {
    s = mortar(slot - 1, 0.0);
    // a willow's trails can hang on after its stars die; whatever is left of a shell fades over
    // the last 0.6 s before its mortar fires again, instead of vanishing when it does
    float left = PER[slot - 1] - s.rise - s.a;
    s.on *= ss(0.0, 0.6, left);
  }
  if (s.on < 0.004 || s.a > s.life * 1.15 + s.trail + 0.1) return;
  if (k < 896) {
    if (s.a < 0.0) return;
    if (s.kind == 2.0) starPoint(s, float(k / 8), float(k - (k / 8) * 8));   // 112 stars, a head and 7 chords each
    else starPoint(s, float(k / 4), float(k - (k / 4) * 4));                  // 224 stars, a head and 3 chords each
  } else if (k < 992) {
    if (s.a < 0.0) return;
    cracklePoint(s, float(k - 896));
  } else if (k < 1008) {
    if (slot > 0) risePoint(s, float(k - 992));
  } else flashPoint(s);
}`;

// each point is a streak: a bright core along a segment, brightest at its head. A star's streak
// has round ends; a trail chord has soft flat ends (a ramp over most of its radius either side
// of the end point) that blend into the chord before and after it
const pointFrag = `
void main() {
  float q = floor(vColor.a);
  float e = vColor.a - q;
  float flatEnds = step(15.5, q);
  float fall = (q - 16.0 * flatEnds) / 15.0;
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  c.y = -c.y;
  vec2 u = vec2(cos(vShape), sin(vShape));
  float along = dot(c, u);
  float t = clamp(along / max(e, 1e-3) * 0.5 + 0.5, 0.0, 1.0);
  float r = max(1.0 - e, 1e-3);
  float d, w = 1.0;
  if (flatEnds > 0.5) {
    d = abs(dot(c, vec2(-u.y, u.x))) / r;
    w = clamp(0.5 - (abs(along) - e) / (1.4 * r), 0.0, 1.0);
  } else {
    d = length(c - u * e * (2.0 * t - 1.0)) / r;
  }
  if (d >= 1.0 || w <= 0.0) discard;
  float prof = exp(-d * d * 9.0) + 0.2 * exp(-d * 4.0) * (1.0 - d);
  outColor = vec4(vColor.rgb * prof * w * mix(fall, 1.0, t), 1.0);
}`;

export default {
  id: 'fireworks',
  name: 'Fireworks',
  group: 'Show',
  blurb: 'New Year over the Bosphorus: a dahlia bursts on every kick, mortars fire with the mids, the bridge pours gold sparks with the highs',
  tags: ['fire', 'night', 'water', 'city', 'istanbul'],
  energy: 0.75,
  particles: 0,
  trails: 0,
  zoom: 1,
  spin: 0,
  frag,
  points: { count: 7 * SHELL_POINTS + WATERFALL, vert, frag: pointFrag, blend: 'add' },
};
