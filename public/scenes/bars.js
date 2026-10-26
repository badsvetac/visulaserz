// BARS — the classic LED spectrum analyser, built as a real instrument: a long bank of smoked-glass
// columns standing on a black lacquer plinth in a dark studio, seen from low down with a long lens
// that slowly swings round it, so the bank turns a little and the near floor and the far wall go
// soft (the lens focuses on a plane, as a real one does). Each column holds a ladder of LED cells
// that light from the plinth up to its level: every cell has a hot, whiter core and a saturated
// rim, the leading cells burn hotter, the top one fades in as the level reaches it, and light
// scatters in the glass between them and rises a little above the stack. The dark cells stay just
// visible behind the smoked glass, the way a switched-off meter looks, and every tube wears a
// polished cap. The glass bows out a touch, so the studio's softboxes draw a streak down each tube.
// The plinth carries the frequencies in a dot-matrix print (50 Hz to 10 kHz, each where it falls
// on the bank) and a polished bevel along its top edge that mirrors the colour of every column
// standing on it. Light spills across the gaps onto the neighbours and pools on the floor; the
// lacquer floor mirrors it all, crisp at the foot and melting further out, strongest at grazing
// angles. Behind, a deep blue cyclorama glows where the wall curves into the floor, the columns
// wash the wall and the haze with their colours, three stage beams slant down through the haze,
// and dust drifts in the light, out-of-focus discs near the lens. In 16:9 there are 48 columns; a
// phone held upright gets 24 wider ones, so the bank never turns into a comb.
// Over every column a peak bead rides in the tube: the bar tosses it up when it jumps, it falls
// back with gravity and bounces once, small, when it lands. Where it is now is worked out from the
// last second of the spectrogram (the highest of the arcs it could be on), so it needs no memory.
//
// Colour follows frequency, not height: amber bass, coral, magenta and violet mids, blue, ice-cyan highs.
//
// Music: every column is its own slice of the spectrum (bass on the left, highs on the right) and
// so is its bead; the bass swells the pools of light on the floor and the blue glow at the foot of
// the wall; the mids brighten the colour wash on the back wall, the haze over the bank and the
// stage beams; the highs make the dust glitter and the glass edges and caps sparkle; on every beat
// a slanted band of white light sweeps along the bank from the bass end to the highs in a third of
// a second, lighting even the dark cells as it passes, and the floor glow pulses, all of it gone
// within 0.45 s. With nothing playing the bank stands dark and still in the blue of the
// cyclorama, its glass, caps and bevel catching the studio lights, the beads resting on the plinth
// as a row of dim standby lights in the colours of their bands.

// shared by the picture and the beads
const COMMON = `
const float F_LO = 0.02, F_SPAN = 0.94;    // the part of the spectrum the bank spreads across
float gN, gP, gW, gD, gK, gL, gZw, gF, gTf, gAp, gA, gTop, gB;
vec3 gRo, gCr, gCu, gCf, gPl;
vec2 gStrip;

float sq(float x) { return x * x; }
float specL(float x) { return textureLod(uAudio, vec2(clamp(x, 0.002, 0.998), ROW(0.0)), 0.0).r; }
float slowL(float x) { return textureLod(uAudio, vec2(clamp(x, 0.002, 0.998), ROW(3.0)), 0.0).r; }
// the spectrum slice column j shows, as texture coordinates
vec2 slice(float j) { return F_LO + F_SPAN * vec2(j, j + 1.0) / gN; }
// how full column j is, 0..1 of full scale; nothing at all without audio
float level(float j) {
  vec2 s = slice(j);
  float v = max(specL(mix(s.x, s.y, 0.25)), specL(mix(s.x, s.y, 0.75)));
  return uAudioActive * pow(clamp(v, 0.0, 1.0), 0.8);
}
// colour by frequency: amber bass, coral, magenta, violet, blue, ice-cyan highs
vec3 hue(float f) {
  vec3 c = mix(vec3(1.0, 0.40, 0.05), vec3(1.0, 0.16, 0.14), ss(0.06, 0.26, f));
  c = mix(c, vec3(0.95, 0.10, 0.62), ss(0.22, 0.42, f));
  c = mix(c, vec3(0.55, 0.18, 1.0), ss(0.40, 0.60, f));
  c = mix(c, vec3(0.16, 0.42, 1.0), ss(0.58, 0.80, f));
  return mix(c, vec3(0.20, 0.90, 1.0), ss(0.78, 1.0, f));
}
float colX(float j) { return (j + 0.5 - gN * 0.5) * gP; }
// how much the lacquer floor reflects, seen at cosine c: Schlick, eased (not clipped) towards its
// limit at grazing angles, so no line of equal angle shows across the floor
float lacquer(float c) {
  float f = 0.04 + 0.96 * pow(1.0 - clamp(c, 0.0, 1.0), 5.0);
  return f / (1.0 + f * 1.8);
}
// the light of the columns near bank position f (0..1 along it), seen through haze: their colour
// times how full they are, read at m fixed points along the bank and joined by a cubic B-spline,
// so it is smooth whatever the spectrum does between them; v is how full, for the height it reaches
vec3 glowAt(float f, float m, out float v) {
  float x = f * m - 0.5, i0 = floor(x), t = x - i0;
  vec4 w = vec4(sq(1.0 - t) * (1.0 - t), 3.0 * t * t * t - 6.0 * t * t + 4.0, -3.0 * t * t * t + 3.0 * t * t + 3.0 * t + 1.0, t * t * t) / 6.0;
  vec3 c = vec3(0.0);
  v = 0.0;
  for (int k = 0; k < 4; k++) {
    float fk = (i0 + float(k) - 0.5) / m;
    float lv = fk < 0.0 || fk > 1.0 ? 0.0 : uAudioActive * pow(clamp(slowL(F_LO + F_SPAN * fk), 0.0, 1.0), 0.8);
    c += hue(clamp(fk, 0.0, 1.0)) * lv * w[k];
    v += lv * w[k];
  }
  return c;
}

// the bank, sized to the frame, and the camera swinging slowly round it. Full scale is 1 unit tall
void setup() {
  gA = uRes.x / uRes.y;
  gN = gA < 0.8 ? 24.0 : gA < 1.3 ? 32.0 : gA < 2.1 ? 48.0 : 64.0;
  float wide = ss(0.6, 1.4, gA);
  float fill = 0.6;                         // the full scale's share of the frame height
  float base = mix(-0.54, -0.56, wide);     // where the foot of the plinth sits on screen
  gF = 2.6;
  float dist = gF / (2.0 * fill);
  gL = mix(0.86, 0.8, wide) * gA / fill;
  gP = gL / gN;
  gW = gP * 0.8;
  gD = gP * 0.9;
  gK = gA < 0.8 ? 40.0 : 36.0;
  gTop = 1.0 + 0.9 / gK;                    // the glass stands a little above full scale
  gB = 0.075;                               // the plinth: its height, half width and front
  gPl = vec3(gL * 0.5 + gP * 0.75, gB, -gP * 0.5);
  gZw = 1.1;
  float ty = -base * dist / gF;
  float th = 0.16 * sin(uTime * 0.043 + 0.6) * mix(0.6, 1.0, wide);
  gRo = vec3(dist * sin(th), 0.2 + 0.025 * sin(uTime * 0.029), -dist * cos(th));
  vec3 at = vec3(0.0, ty, 0.0);
  gCf = normalize(at - gRo);
  gCr = normalize(cross(vec3(0.0, 1.0, 0.0), gCf));
  gCu = cross(gCf, gCr);
  gTf = length(at - gRo);
  gAp = 0.05;
  gStrip = vec2(-0.32 * gL * (dist + 3.2) / dist, -3.2);
}
`;

const frag = `${COMMON}
float gBass, gMid, gHigh, gHit, gSweepX, gSweepA, gPx, gAx;

// the world size of what one pixel (or the lens's blur, whichever is larger) covers at distance t
// along this pixel's ray; the lens focuses on a plane, so the blur goes by the depth along its axis
float blurAt(float t) { return max(t * gPx / gF * 0.7, gAp * abs(t * gAx - gTf) / gTf); }

// the first column a ray meets: (t, column, face 0 front / 1 side / 2 top), side = which way a side looks
vec3 bank(vec3 ro, vec3 rd, out float side) {
  side = 0.0;
  if (rd.z <= 1e-4) return vec3(1e9, -1.0, 0.0);
  float t0 = max(-ro.z / rd.z, 0.0), t1 = (gD - ro.z) / rd.z;
  if (t1 <= 0.0) return vec3(1e9, -1.0, 0.0);
  float hn = gN * 0.5;
  float c0 = floor((ro.x + rd.x * t0) / gP + hn), c1 = floor((ro.x + rd.x * t1) / gP + hn);
  float dir = c1 >= c0 ? 1.0 : -1.0, n = min(abs(c1 - c0), 2.0);
  vec3 r = rd;
  r.x = abs(r.x) < 1e-6 ? 1e-6 : r.x;
  r.y = abs(r.y) < 1e-6 ? 1e-6 : r.y;
  vec3 inv = 1.0 / r;
  for (int k = 0; k < 3; k++) {
    if (float(k) > n) break;
    float j = c0 + dir * float(k);
    if (j < 0.0 || j >= gN) continue;
    float xc = colX(j);
    vec3 ta = (vec3(xc - gW * 0.5, gB, 0.0) - ro) * inv, tb = (vec3(xc + gW * 0.5, gB + gTop, gD) - ro) * inv;
    vec3 tn = min(ta, tb), tx = max(ta, tb);
    float tnear = max(max(tn.x, tn.y), tn.z), tfar = min(min(tx.x, tx.y), tx.z);
    if (tnear < tfar && tfar > 0.0) {
      side = -sign(r.x);
      return vec3(tnear, j, tnear == tn.z ? 0.0 : (tnear == tn.y ? 2.0 : 1.0));
    }
  }
  return vec3(1e9, -1.0, 0.0);
}

// the studio lights seen in a mirror at p along r: a tall warm softbox behind the camera on one
// side, a dimmer cool one on the other, and a faint ceiling. soft widens them by what one pixel
// spans out there (dimming them to match), so a streak never gets thinner than the screen can draw
vec3 env(vec3 p, vec3 r, float soft) {
  vec3 c = vec3(0.0);
  if (r.z < -0.05) {
    vec3 q = p + r * ((gStrip.y - p.z) / r.z);
    float tall = exp(-sq((q.y - 1.4) / 1.3));
    float w1 = sqrt(0.09 + soft * soft), w2 = sqrt(0.2 + soft * soft);
    c += vec3(1.0, 0.93, 0.85) * 9.0 * 0.3 / w1 * exp(-sq((q.x - gStrip.x) / w1)) * tall;
    c += vec3(0.65, 0.8, 1.0) * 2.4 * 0.45 / w2 * exp(-sq((q.x + gStrip.x * 0.8) / w2)) * tall;
  }
  return c + vec3(0.5, 0.6, 0.85) * 0.25 * ss(0.1, 0.5, r.y);
}

// the deep blue cyclorama light where the back wall meets the floor, strongest behind the bank;
// the bass breathes it
vec3 cycLight(float x) { return vec3(0.04, 0.06, 0.19) * (0.3 + 0.7 * exp(-sq(x / (gL * 0.85)))) * (0.8 + 0.75 * gBass); }

// stage beams slanting down through the haze from above the frame: they hang in a plane between
// the bank and the back wall, each swinging slowly, and the mids bring them up
vec3 beams(vec3 ro, vec3 rd) {
  vec3 pw = ro + rd * ((gZw * 0.6 - ro.z) / rd.z);
  vec3 c = vec3(0.0);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 src = vec2((fk - 1.0) * gL * 0.55, 2.4);
    float a = -(fk - 1.0) * 0.22 + 0.08 * sin(uTime * (0.07 + 0.02 * fk) + fk * 2.1);
    vec2 axis = vec2(sin(a), -cos(a));
    vec2 d = pw.xy - src;
    float along = dot(d, axis), across = dot(d, vec2(-axis.y, axis.x));
    float w = 0.03 + max(along, 0.0) * 0.08;
    float b = exp(-sq(across / w)) * ss(0.0, 0.6, along) * exp(-max(along, 0.0) * 0.45)
      * (0.75 + 0.25 * noise(vec2(across * 6.0, along * 1.5 - uTime * 0.05)));
    c += mix(vec3(0.55, 0.65, 1.0), vec3(0.85, 0.75, 1.0), fk * 0.5) * b;
  }
  return c * (0.05 + 0.1 * gMid);
}

// the back wall, far out of focus: the cyclorama glow at its foot and a wash of the columns' colours
vec3 wallAt(vec3 p) {
  float v;
  // a velvet drape hangs down the back wall, swaying a little: the faces of its folds turned
  // towards the bank catch its light, the hollows stay dark
  float ph = p.x * 19.0 + 1.4 * sin(p.x * 3.3 + 0.4) + 0.5 * sin(uTime * 0.13 + p.x * 1.7) + 0.15 * p.y;
  float fold = 0.5 + 0.5 * sin(ph);
  float shade = 0.22 + 0.95 * fold * fold;
  vec3 w = glowAt(p.x / gL + 0.5, 7.0, v) * exp(-max(p.y - gB - v * 0.9, 0.0) * 1.6) * (0.2 + 0.38 * gMid);
  // the three stage lamps above throw soft scallops of light down the drape, brighter with the mids
  float sc = 0.0;
  for (int k = 0; k < 3; k++) {
    float xk = (float(k) - 1.0) * gL * 0.55, dy = max(2.1 - p.y, 0.0);
    sc += exp(-sq((p.x - xk) / (0.25 + 0.3 * dy))) * exp(-dy * 1.3);
  }
  vec3 top = vec3(0.55, 0.6, 1.0) * sc * (0.035 + 0.11 * gMid);
  return (w + top) * shade + cycLight(p.x) * exp(-p.y * 2.4) * (0.25 + 0.95 * shade)
    + vec3(0.004, 0.005, 0.01) * (1.0 - 0.5 * ss(0.5, 2.0, p.y)) * (0.5 + shade);
}

// how much of the glass at height y is below the column's level lv (blurred by bl)
float litTo(float lv, float y, float bl) { return ss(lv + 0.01 + bl, lv - 0.01 - bl, y) * step(0.001, lv); }

// a column's front glass at height y over the plinth, u across it (-1..1): the LED cells and the
// light in the tube; a = how much of the room shows through the glass there. bl = the blur
vec4 ladder(float j, float u, float y, float bl) {
  float f = (j + 0.5) / gN;
  vec3 hc = hue(f);
  float lv = level(j);
  float sy = y * gK, si = floor(sy), sv = fract(sy) - 0.5;
  float blS = bl * gK, melt = ss(0.25, 0.7, blS);   // too blurred to tell the cells apart: their average
  vec2 q = vec2(abs(u) * gW * 0.5, abs(sv) / gK);
  vec2 hb = vec2(gW * 0.40, 0.33 / gK);
  float rr = min(hb.x, hb.y) * 0.5;
  vec2 dq = q - hb + rr;
  float d = length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0) - rr;
  float cell = mix(ss(bl, -bl, d), 0.8 * 0.66, melt) * step(si, gK - 0.5);
  float core = mix(ss(0.0, hb.y * 1.3, -d), 0.35, melt);                 // 0 at the cell's rim, 1 deep in
  float top = lv * gK;
  float lit = mix(clamp(top - si, 0.0, 1.0), ss(top + blS, top - blS, sy), melt) * step(0.0, y);
  float heat = ss(top - 4.0, top - 0.5, si + 0.5);                        // the leading cells burn hotter
  vec3 led = hc * (0.8 + 0.3 * heat);
  led = mix(led, vec3(max(led.r, max(led.g, led.b))), core * (0.12 + 0.28 * heat));   // a whiter core
  // the beat's sweep: a slanted band of white light running along the glass
  float sweep = gSweepA * exp(-sq((f + (y - 0.5) * 0.1 - gSweepX) / 0.035));
  vec3 e = led * lit * cell * (0.85 + 0.25 * core) * (1.0 + 0.9 * sweep);
  float litS = litTo(lv, y, bl);
  // light scattered in the glass between the lit cells, and a little past the top of the stack
  e += hc * (0.1 * litS * (1.0 - cell) + 0.2 * lv * exp(-max(y - lv, 0.0) * 24.0) * (1.0 - litS));
  // the dark cells, just there behind the smoked glass; the sweep runs a glimmer over them
  e += (vec3(0.010, 0.011, 0.015) + hc * (0.014 + 0.2 * sweep)) * cell * (1.0 - lit);
  e += vec3(0.85, 0.92, 1.0) * 0.16 * sweep;
  float edge = ss(0.8, 0.97, abs(u));
  e += hc * edge * 0.1 * litS;
  return vec4(e, 0.88 * (1.0 - litS));
}

// whatever a ray sees of the column it hit
vec3 column(vec3 p, vec3 rd, vec3 hb, float side, float bl) {
  float j = hb.y, y = p.y - gB;
  float f = (j + 0.5) / gN, lv = level(j);
  vec3 pw = p + rd * ((gZw - p.z) / rd.z);
  vec3 behind = wallAt(vec3(pw.x, max(pw.y, 0.0), pw.z));
  float px = max(bl, gPx * 0.7 * length(p - gRo) / gF);
  if (hb.z < 0.5) {
    float u = (p.x - colX(j)) / (gW * 0.5);
    vec4 c = ladder(j, u, y, bl);
    // the front glass bows out a little, so each column catches the softboxes in its own streaks
    // (across the glass the mirrored light moves about 3.5 m per unit of u)
    vec3 n = normalize(vec3(u * 0.55, 0.0, -1.0));
    float fres = 0.04 + 0.96 * pow(1.0 - clamp(-dot(rd, n), 0.0, 1.0), 5.0);
    vec3 col = c.rgb + env(p, reflect(rd, n), 3.5 * 1.6 * px / (gW * 0.5)) * fres * mix(1.0, 0.15, ss(0.004, 0.03, bl));
    // the polished edges of the glass catch a thin line of light, and the highs make them sparkle
    float rim = ss(1.0 - 3.0 * px / gW, 1.0 - 1.2 * px / gW, abs(u));
    float glint = gHigh * pow(0.5 + 0.5 * sin(y * 23.0 + j * 2.7 - uTime * 2.3), 8.0);
    col += mix(vec3(0.045, 0.05, 0.065), hue(f) * 0.22, litTo(lv, y, bl)) * rim * (1.0 + 4.0 * glint);
    col += behind * c.a;
    // the polished cap on the tube: brushed metal, brightest along its top edge, catching the
    // ceiling light, the colour of a full column and the sparkle of the highs
    float capH = 0.5 / gK;
    float cap = ss(gTop - capH - px, gTop - capH + px, y);
    float sheen = ss(gTop - capH, gTop, y);
    float capGlint = gHigh * pow(0.5 + 0.5 * sin(uTime * 3.1 + j * 1.9), 12.0);
    vec3 metal = vec3(0.07, 0.075, 0.09) + vec3(0.2, 0.21, 0.24) * sheen * sheen * (1.0 - 0.6 * u * u)
      + hue(f) * 0.4 * ss(0.9, 1.0, lv) + vec3(0.9, 0.95, 1.0) * capGlint * 0.6 * (1.0 - u * u);
    col = mix(col, metal, cap);
    // the outline of the glass, softened over a pixel against what shows past it
    float inside = ss(1.0, 1.0 - 2.0 * px / gW, abs(u)) * ss(gTop, gTop - 1.4 * px, y);
    return mix(behind, col, inside);
  }
  if (hb.z > 1.5) {
    // the top of the cap
    return vec3(0.1, 0.105, 0.12) + hue(f) * 0.2 * ss(0.9, 1.0, lv);
  }
  float jn = j + side;
  float ln = jn >= 0.0 && jn < gN ? level(jn) : 0.0;
  float dz = clamp(p.z / gD, 0.0, 1.0);
  float ls = litTo(lv, y, bl);
  float litN = ss(ln + 0.03, ln - 0.03, y) * step(0.001, ln);
  float band = mix(0.7 + 0.3 * cos(y * gK * TAU), 0.85, ss(0.15, 0.4, bl * gK));
  vec3 col = hue(f) * (ls * 0.22 * band * (1.0 - 0.5 * dz) + 0.08 * lv * exp(-max(y - lv, 0.0) * 22.0));
  col += hue((jn + 0.5) / gN) * litN * 0.14 * (1.0 - dz);
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(abs(rd.x), 0.0, 1.0), 5.0);
  col += behind * 0.75 * (1.0 - ls) + env(p, vec3(-rd.x, rd.y, rd.z), 0.0) * fres * 0.5;
  // the side of the cap, turned away from the lights: much darker than its front, so seen from
  // below the caps read as a clean row instead of a jagged one
  float sheen = ss(gTop - 0.5 / gK, gTop, y);
  vec3 metal = vec3(0.022, 0.024, 0.03) + vec3(0.03, 0.032, 0.038) * sheen + hue(f) * 0.12 * ss(0.9, 1.0, lv);
  col = mix(col, metal, ss(gTop - 0.5 / gK - px, gTop - 0.5 / gK + px, y));
  // the side is seen edge-on, so its outline (the back edge and the top) fades into what shows past
  // it over the last pixel: along the side a pixel covers px * 1.43 / |rd.x| of depth
  float edge = clamp((gD - p.z) * abs(rd.x) / (1.43 * px), 0.0, 1.0) * ss(gTop, gTop - 1.4 * px, y);
  return mix(behind, col, edge);
}

// the frequencies printed along the plinth in a 3x5 dot font: 50 100 200 500 1k 2k 5k 10k, each
// where it falls on the bank. A glyph is 15 bits, rows top to bottom: 0 1 2 5 k
const int GLYPH[5] = int[5](31599, 11415, 29671, 31183, 19373);
const ivec4 LABEL[8] = ivec4[8](ivec4(2, 3, 0, 0), ivec4(3, 1, 0, 0), ivec4(3, 2, 0, 0), ivec4(3, 3, 0, 0),
  ivec4(2, 1, 4, 0), ivec4(2, 2, 4, 0), ivec4(2, 3, 4, 0), ivec4(3, 1, 0, 4));
const float LABEL_AT[8] = float[8](0.0653, 0.1827, 0.3001, 0.4553, 0.5729, 0.6903, 0.8455, 0.963);
// whether dot (cx, cy) of label L is lit; cx counts across the whole label, glyphs 4 dots apart
float dotOn(ivec4 L, int cx, int cy, int w) {
  if (cx < 0 || cx >= w || cy < 0 || cy > 4) return 0.0;
  int gi = cx / 4, gx = cx - gi * 4;
  if (gx >= 3) return 0.0;
  int g = gi == 0 ? L.y : (gi == 1 ? L.z : L.w);
  return float((GLYPH[g] >> ((4 - cy) * 3 + (2 - gx))) & 1);
}
float legend(vec2 p, float px) {
  float d = gB * 0.075, mid = gB * 0.4;                // one dot, and the line the text sits on
  float pxd = max(px * 1.43 / d, 1e-3);                // a whole pixel (px is half of one), in dots
  float ink = 0.0;
  for (int i = 0; i < 8; i++) {
    ivec4 L = LABEL[i];
    int w = L.x * 4 - 1;
    vec2 q = vec2((p.x - (LABEL_AT[i] - 0.5) * gL) / d + float(w) * 0.5, (mid - p.y) / d + 2.5);   // in dots, from the top left
    // a phone held upright has room for six of them, a tall one only for the decades
    bool shown = gA >= 0.8 || (gA >= 0.52 ? i != 2 && i != 5 : i == 1 || i == 4 || i == 7);
    if (!shown || q.x < -1.0 || q.x >= float(w) + 1.0 || q.y < -1.0 || q.y >= 6.0) continue;
    // each dot is a small square, and what the pixel shows is how much of it the pixel covers
    // (a box filter over the four dots nearest it), so the print stays clean grey type down to a
    // couple of pixels a dot, with no hard dot edges to fringe or speckle
    ivec2 b = ivec2(floor(q - 0.5));
    for (int k = 0; k < 4; k++) {
      ivec2 c = b + ivec2(k & 1, k >> 1);
      vec2 o = abs(q - vec2(c) - 0.5);
      vec2 cv = clamp((0.41 - o) / pxd + 0.5, 0.0, min(1.0, 0.82 / pxd));
      ink += dotOn(L, c.x, c.y, w) * cv.x * cv.y;
    }
  }
  return min(ink, 1.0);
}

// the plinth's face: black lacquer catching the softboxes, the print, and a polished bevel along
// the top edge that mirrors the colour of every column standing on it. print = 0 in a reflection
vec3 plinthFace(vec3 p, vec3 rd, float px, float print) {
  vec3 n = vec3(0.0, 0.0, -1.0);
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(-dot(rd, n), 0.0, 1.0), 5.0);
  vec3 c = vec3(0.006, 0.0065, 0.008) + env(p, reflect(rd, n), 0.6) * fres * 0.35;
  if (print > 0.0) c += vec3(0.3, 0.31, 0.34) * legend(p.xy, px) * print;
  float bev = gB * 0.17;
  float onBev = ss(gB - bev - px, gB - bev + px, p.y);
  if (onBev > 0.0) {
    float j0 = floor(p.x / gP + gN * 0.5);
    vec3 lc = vec3(0.0);
    for (int k = -1; k <= 1; k++) {
      float j = j0 + float(k);
      if (j < 0.0 || j >= gN) continue;
      float dx = (p.x - colX(j)) / gP;
      lc += hue((j + 0.5) / gN) * ss(0.0, 0.03, level(j)) * exp(-dx * dx * 5.0);
    }
    float s = ss(gB - bev, gB, p.y);
    vec3 metal = vec3(0.05, 0.053, 0.062) + vec3(0.2, 0.21, 0.25) * s * s + lc * (0.25 + 0.45 * s);
    c = mix(c, metal, onBev);
  }
  return c;
}

// the haze just in front of the bank, lit by the stacks: each column's light spills a little way
// across the gaps onto its neighbours, and a little above the top of the stack
vec3 spill(vec3 pz) {
  float j0 = floor(pz.x / gP + gN * 0.5), y = pz.y - gB;
  vec3 s = vec3(0.0);
  for (int k = -1; k <= 1; k++) {
    float j = j0 + float(k);
    if (j < 0.0 || j >= gN) continue;
    float lv = level(j);
    float dx = max(abs(pz.x - colX(j)) - gW * 0.5, 0.0) / gP;
    float lit = ss(lv + 0.05, lv - 0.01, y) * step(0.001, lv) * step(0.0, y);
    s += hue((j + 0.5) / gN) * lit * exp(-dx * 6.0) * (0.6 + 0.4 * ss(0.0, 0.4, lv));
  }
  return s;
}

// the lacquer floor: the plinth and the bank in its mirror, and the pools of light they throw
vec3 floorAt(vec3 p, vec3 rd, float t) {
  vec3 r = vec3(rd.x, -rd.y, rd.z);
  float fres = lacquer(-rd.y);
  float smudge = noise(p.xz * vec2(2.3, 5.1) + 3.7) * 0.6 + noise(p.xz * vec2(9.0, 21.0)) * 0.4;
  vec3 qw = p + r * ((gZw - p.z) / r.z);
  vec3 refl = wallAt(qw) * exp(-qw.y * 0.8);
  if (p.z < gPl.z) {
    vec3 qp = p + r * ((gPl.z - p.z) / r.z);
    vec3 q = p + r * (-p.z / r.z);
    float bl = max(max(blurAt(t - p.z / r.z), blurAt(t)), (0.002 + 0.07 * max(q.y - gB, 0.0)) * (0.7 + 0.6 * smudge));
    // how much of the mirror image there is the plinth's face (upside down), blurred like the rest
    float blP = max(bl, blurAt(t));
    float inPl = ss(gPl.x + blP, gPl.x - blP, abs(qp.x)) * ss(gB + blP * 0.5, gB - blP * 0.5, qp.y);
    vec3 face = inPl > 0.0 ? plinthFace(vec3(qp.x, min(qp.y, gB - 1e-4), qp.z), r, blP, 0.0) : vec3(0.0);
    if (inPl < 1.0) {
      // the bank as the lacquer mirrors it: crisp at its foot, blurred more the higher up it
      // reflects, so the gaps between the columns melt together instead of standing out as stripes
      float y = q.y - gB;
      float cj = q.x / gP + gN * 0.5 - 0.5, j0 = floor(cj);
      vec3 e = vec3(0.0);
      float cover = 0.0, see = 0.0;
      for (int k = 0; k < 2; k++) {
        float j = j0 + float(k);
        if (j < 0.0 || j >= gN) continue;
        float dx = q.x - colX(j);
        float m = ss(gW * 0.5 + bl, gW * 0.5 - bl, abs(dx));
        vec4 lad = ladder(j, clamp(dx / (gW * 0.5), -1.0, 1.0), y, bl);
        e += lad.rgb * m;
        see += lad.a * m;                 // the glass is clear where no LED burns: the room shows through
        cover += m;
      }
      e /= max(cover, 1.0); see /= max(cover, 1.0); cover = min(cover, 1.0);
      // the blur stops short past the ends of the bank, so no glow runs on along the floor there
      float halfB = gN * gP * 0.5 - (gP - gW) * 0.5, blE = min(bl, gP * 0.5) + 1e-4;
      float w = ss(gTop + bl, gTop - bl, y) * ss(halfB + blE, halfB - blE, abs(q.x));
      refl = refl * (1.0 - w * cover) + w * (e * exp(-y * 3.5) + refl * see * 0.85);
      // the haze glow in the gaps, mirrored too
      refl += spill(q) * 0.08 * exp(-y * 3.5);
    }
    refl = mix(refl, face, inPl);
  }
  // the light of the columns falling on the floor: the bank is a line of light, so the pool fades
  // with the distance from it, round its ends too; the bass swells it and the beat makes it pulse
  float pv;
  vec3 pool = glowAt(clamp(p.x / gL + 0.5, 0.0, 1.0), 14.0, pv);
  float pd = length(vec2(max(abs(p.x) - gL * 0.5, 0.0), max(gPl.z - p.z, 0.0)));
  pool *= exp(-pd * 2.6 - max(p.z - gD, 0.0) * 12.0) * (0.1 + 0.5 * gBass + 0.55 * gHit);
  // the floor curves up into the wall (an infinity cove), so the cyclorama light runs on across it
  vec3 cove = cycLight(p.x) * exp(-(gZw - p.z) * 2.2) * 0.8;
  return refl * fres * (0.88 + 0.24 * smudge) + pool * (0.8 + 0.4 * smudge) + cove + vec3(0.0012, 0.0013, 0.0018);
}

void main() {
  setup();
  gPx = 2.0 / uRes.y;
  gBass = uAudioActive * clamp(uBass * 1.3, 0.0, 1.0);
  gMid = uAudioActive * clamp(uMid * 1.4, 0.0, 1.0);
  gHigh = uAudioActive * clamp(uHigh * 1.6, 0.0, 1.0);
  // the beat, gone within 0.45 s whatever the analysis does with uBeat
  float age = uBeatAge;
  float env0 = step(age, 0.45) * ss(0.45, 0.2, age) * step(0.5, uBeatCount);
  gHit = uAudioActive * uPunch * env0 * exp(-age * 6.0);
  // the beat's sweep along the bank, bass end to highs
  gSweepA = uAudioActive * uPunch * env0 * ss(0.0, 0.03, age) * ss(0.01, 0.08, uBeat);
  gSweepX = -0.12 + age / 0.36 * 1.24;

  vec2 uv = centered();
  vec3 ro = gRo, rd = normalize(gCr * uv.x + gCu * uv.y + gCf * gF);
  gAx = dot(rd, gCf);
  float side;
  vec3 hb = bank(ro, rd, side);
  float tF = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  float tW = (gZw - ro.z) / rd.z;

  // the plinth, worked out from where the ray crosses its front plane and its top: how much of this
  // pixel its outline covers (a ramp one pixel wide, or as wide as the lens blurs it there), so its
  // edges against the lit floor and the wall stay clean while the camera swings. The camera stays
  // above it and between its ends, so the front, the top and their outline are all that shows
  float tz = (gPl.z - ro.z) / rd.z;
  vec3 pf = ro + rd * tz;
  float pwz = 1.43 * blurAt(tz);
  float covF = clamp(0.5 + pf.y / pwz, 0.0, 1.0) * clamp(0.5 + (gPl.x - abs(pf.x)) / pwz, 0.0, 1.0);
  float wTop = clamp(0.5 + (pf.y - gB) / pwz, 0.0, 1.0);   // past the front's top edge: its top
  float covT = 0.0, tT = 1e9;
  vec3 pt = vec3(0.0);
  if (wTop > 0.0 && rd.y < -1e-4) {
    tT = (gB - ro.y) / rd.y;
    pt = ro + rd * tT;
    float pwt = 1.43 * blurAt(tT);
    // across x a pixel spans pwt; along z the top is seen at a grazing angle, so it spans pwt / |rd.y|
    covT = clamp(0.5 + (gPl.x - abs(pt.x)) / pwt, 0.0, 1.0) * clamp(0.5 + (gD - gPl.z - pt.z) * -rd.y / pwt, 0.0, 1.0)
      * step(tT, hb.x);                                    // unless a column stands in front of it
  }
  float cov = mix(covF, covT, wTop);

  vec3 col = vec3(0.0);
  float onGlass = 0.0;
  if (cov < 1.0) {
    // what shows past the plinth
    if (hb.x < min(tF, tW)) { col = column(ro + rd * hb.x, rd, hb, side, blurAt(hb.x)); onGlass = 1.0; }
    else if (tF < tW) {
      vec3 p = ro + rd * tF;
      // a ray just inside the outline meets the floor under the plinth: take the floor just past
      // the edge it is next to instead, which is what the pixel's other half sees
      if (p.z > gPl.z && abs(p.x) < gPl.x) {
        if (pf.y < pwz) p.z = gPl.z - 1e-4;
        else p.x = sign(p.x) * (gPl.x + 1e-4);
      }
      col = floorAt(p, rd, tF);
    }
    else col = wallAt(ro + rd * tW);
  }
  if (cov > 0.0) {
    vec3 pc = vec3(0.0);
    if (wTop < 1.0) pc = plinthFace(vec3(clamp(pf.x, -gPl.x, gPl.x), clamp(pf.y, 0.0, gB), gPl.z), rd, blurAt(tz), 1.0);
    // the top, a thin strip of satin black between the bevel and the columns, lit by their spill
    if (wTop > 0.0) pc = mix(pc, vec3(0.07, 0.074, 0.088) + spill(vec3(clamp(pt.x, -gPl.x, gPl.x), gB + 0.01, 0.0)) * 0.3, wTop);
    col = mix(col, pc, cov);
    onGlass = mix(onGlass, 1.0, cov);
  }

  // the haze over and around the bank, lit by the columns: their light spills across the gaps,
  // and hangs above each stack (a ray that meets the floor first crosses the bank's plane below
  // the floor, where there is none)
  vec3 pz = ro + rd * (-ro.z / rd.z);
  if (pz.y > gB) {
    col += spill(pz) * mix(0.14, 0.03, onGlass);
    float v;
    vec3 g = glowAt(pz.x / gL + 0.5, 10.0, v);
    col += g * exp(-max(pz.y - gB - v, 0.0) * 3.0) * ss(gB, gB + 0.25, pz.y) * (0.06 + 0.12 * gMid);
  }
  col += beams(ro, rd);

  col += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

// the peak beads: one per column and one for its reflection, placed once each instead of every
// pixel working out where they are; and the dust in the light
const vert = `${COMMON}
// how full column j was k rows (60 a second) ago, read from the spectrogram at the same two points
// of its slice that level() reads now, so the past and the present are measured alike
float histL(vec2 s, float k) {
  float y = (k + 0.5) / 128.0;
  float m = max(textureLod(uHist, vec2(mix(s.x, s.y, 0.25), y), 0.0).r, textureLod(uHist, vec2(mix(s.x, s.y, 0.75), y), 0.0).r);
  return uAudioActive * pow(clamp(m, 0.0, 1.0), 0.8);
}
// where column j's bead is: of all the arcs it could be on (tossed up by its bar at some moment in
// the last second, falling back under gravity, then one small bounce off the bar) the highest.
// The arcs are worked out in the spectrogram's own measure, against the bar as the spectrogram has
// it now, and only how far the bead rides above that is added to the bar as drawn: so a held note
// leaves the bead resting on its bar, and only a jump tosses it
float capLevel(float j, float bar) {
  vec2 s = slice(j);
  const float G = 1.4, E = 0.3;            // half the fall's acceleration, and how much a bounce keeps
  float now = histL(s, 0.0);
  float best = now, s1 = histL(s, 66.0), s2 = histL(s, 67.0);
  for (int k = 65; k >= 0; k--) {
    float sk = histL(s, float(k));
    float tau = (float(k) + uHistFrac) / 60.0;
    float v = clamp((sk - s2) * 1.5, 0.0, 0.7);
    float h = sk + v * tau - G * tau * tau;
    if (h < now && sk > now) {
      // it has landed on the bar since: one small bounce
      float vi = sqrt(v * v + 4.0 * G * (sk - now));
      float ti = (v + vi) / (2.0 * G), tb2 = tau - ti, vb = E * vi;
      h = now + max(vb * tb2 - G * tb2 * tb2, 0.0);
    }
    best = max(best, h);
    s2 = s1; s1 = sk;
  }
  return bar + max(best - now, 0.0);
}
// a mote of dust drifting in the air in front of the bank, lit by the columns below it
void dust(float i) {
  float r1 = hash11(i * 1.37 + 0.5), r2 = hash11(i * 2.91 + 1.7), r3 = hash11(i * 4.13 + 3.1), r4 = hash11(i * 5.77 + 7.3);
  float y = fract(r2 + uTime * (0.004 + 0.008 * r4)) * 1.5;
  vec3 wp = vec3((r1 - 0.5) * gL * 1.1 + 0.03 * sin(uTime * (0.1 + 0.2 * r3) + i), y, -0.05 - r3 * r3 * 1.1);
  vec3 v = wp - gRo;
  float z = dot(v, gCf);
  if (z < 0.2) return;
  vec2 uv = vec2(dot(v, gCr), dot(v, gCu)) * gF / z;
  gl_Position = vec4(uv.x / gA, uv.y, 0.0, 1.0);
  float ppw = gF / z * uRes.y * 0.5;
  float coc = gAp * 1.6 * abs(z - gTf) / gTf * ppw;
  float size = clamp(2.2 * uPointScale + coc * 2.0, 2.0, uPointMax);
  gl_PointSize = size;
  float lv;
  vec3 g = glowAt(wp.x / gL + 0.5, 12.0, lv);
  float high = uAudioActive * clamp(uHigh * 1.6, 0.0, 1.0);
  float glint = 0.35 + 2.6 * high * pow(0.5 + 0.5 * sin(uTime * (3.0 + 5.0 * r4) + i * 7.1), 6.0);
  float a = exp(-max(y - gB - lv, 0.0) * 2.5) * glint * 1.4 * (2.2 * uPointScale / size);
  vColor = vec4(mix(g, vec3(length(g)), 0.3) * a, clamp(2.0 / size + 0.12, 0.0, 1.0));
  vShape = -1.0;
}
void main() {
  setup();
  float id = float(gl_VertexID);
  if (id >= 128.0) { dust(id - 128.0); return; }
  float mirror = id >= 64.0 ? 1.0 : 0.0;
  float j = id - mirror * 64.0;
  if (j >= gN) return;
  float cap = capLevel(j, level(j));
  float y = gB + min(cap, 1.0) + 0.55 / gK;
  vec3 wp = vec3(colX(j), mirror > 0.5 ? -y : y, gD * 0.12);
  vec3 v = wp - gRo;
  float z = dot(v, gCf);
  vec2 uv = vec2(dot(v, gCr), dot(v, gCu)) * gF / z;
  gl_Position = vec4(uv.x / gA, uv.y, 0.0, 1.0);
  float ppw = gF / z * uRes.y * 0.5;                    // pixels per world unit there
  float blur = gAp * abs(z - gTf) / gTf + mirror * (0.004 + 0.16 * (y - gB));
  float size = gW * 0.84 * ppw / 0.6 + blur * ppw * 2.0;
  gl_PointSize = clamp(size, 2.0, uPointMax);
  size = gl_PointSize;
  vShape = 0.22 / gK * ppw / size * 2.0;               // the bead's half height, in sprite units
  vec3 hc = hue((j + 0.5) / gN);
  float fres = 1.0;
  if (mirror > 0.5) fres = lacquer(-normalize(v).y) * exp(-(y - gB) * 3.5) * 0.7;
  // resting at the foot with nothing playing, the beads are a row of dim standby lights
  float glow = mix(0.13, 1.6 * (0.22 + 0.78 * ss(0.0, 0.06, cap)), uAudioActive);
  vColor = vec4(mix(hc, vec3(1.0), mix(0.1, 0.55, uAudioActive)) * glow * fres, (1.4 + blur * ppw) / size * 2.0);
}
`;

const pointFrag = `
float ss(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  if (vShape < 0.0) {                     // a mote: a soft disc, wider and flatter out of focus
    float r = length(p);
    outColor = vec4(vColor.rgb * ss(1.0, 1.0 - vColor.a * 2.0, r) * (0.75 + 0.25 * ss(0.4, 0.95, r)), 1.0);
    return;
  }
  float soft = clamp(vColor.a, 0.01, 0.95), hh = max(vShape, 0.01);   // the bead fades out inside its square
  vec2 q = abs(p) - vec2(0.6 * (1.0 - soft * 0.5), hh) + hh;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - hh;
  float core = ss(soft, -soft, d) * min(1.0, hh / soft * 1.5 + 0.2);
  float halo = max(exp(-max(d, 0.0) * 10.0) - exp(-4.0), 0.0) / (1.0 - exp(-4.0));
  outColor = vec4(vColor.rgb * (core + halo * 0.18), 1.0);
}
`;

export default {
  id: 'bars',
  name: 'Bars',
  group: 'Show',
  blurb: 'A glass LED spectrum analyser on a lacquer plinth: amber bass to ice-cyan highs, peak beads falling with gravity, a light sweep each beat',
  tags: ['analyser', 'retro', 'geometric'],
  energy: 0.5,
  particles: 0,
  trails: 0,
  zoom: 1,
  spin: 0,
  frag,
  points: { count: 128 + 260, vert, frag: pointFrag, blend: 'add' },
};
