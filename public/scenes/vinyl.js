import { SCULPT } from '../js/gfx/scene-kit.js';

// VINYL — a DJ turntable on a walnut desk at night, seen from a low three-quarter angle the way a
// product photo takes one: a silver deck with a turned-aluminium platter and its rows of strobe
// dots, a felt slipmat, and a black record whose grooves catch the desk lamp in a bright streak
// that stands still while the disc turns underneath it, the way real grooves do. The label is the
// album art (a house label when there is none) and turns with the record at the real playback
// speed. An S-shaped tonearm with its headshell and red cartridge rides the groove: the stylus
// walks from the lead-in to the run-out as the song plays. Behind it, out of focus: the record's
// sleeve leaning on the wall (the album art again), an amplifier with two backlit VU meters, a
// string of bulbs, a tulip glass of tea on its saucer, dust drifting in the lamp's beam, and an LED
// strip along the wall above the picture, whose light everything glossy shows as a line of the
// palette's colour.
//
// The record, mat and platter are flat discs met analytically, so their edges are smoothed over
// exactly one pixel; the arm, the plinth and the small posts are short distance-field marches inside
// their own boxes; the room is drawn in layers, each blurred by how far it is from the focus.
//
// Music: the BASS pumps the strobe lamp under the platter, so the dots blaze orange and throw their
// light on the plinth (the counterweight trembles with it); the MIDS light the grooves: the streak
// brightens, every ring with its own slice of the mids, and breaks into colours at its edges like a
// grating; the HIGHS switch on the stylus light: a cool pool round the needle, a spark at its tip,
// and the dust in the beam glinting; the level swings the VU needles (the balance splits them). On
// every BEAT the room light flares in the palette's colour (the wall, its line across the record
// and the plinth, a rim on the arm) and the 33 light flashes, all gone within the beat. With
// nothing playing the record still turns under the lamp and nothing pulses.
const frag = `${SCULPT}
const float DESK = -12.0;                    // the desk's surface; the plinth's top is y = 0 (all in cm)
const vec2  PLH = vec2(22.6, 17.6);          // the plinth's half size: x across, z front (+) to back
const vec2  CEN = vec2(-4.0, 0.0);           // the spindle
const float R_PLAT = 16.6, Y_PLAT = 1.75;    // the platter: radius, top
const float R_MAT = 15.25, Y_MAT = 1.98;     // the slipmat
const float R_REC = 15.0, Y_REC = 2.16;      // the record
const float R_LAB = 5.05, R_OUT = 14.55, R_IN = 6.1;
const vec2  PIV = vec2(16.2, -9.6);          // the tonearm's pivot
const float LE = 23.0;                       // pivot to stylus
const float ARM_Y = 4.25;                    // the arm tube's height
const vec2  HD = vec2(0.9336, 0.3584);       // the headshell's heading in the arm's frame (21° offset)
const vec2  HP = vec2(-0.3584, 0.9336);
const vec3  LAMP_C = vec3(1.0, 0.66, 0.38);
const vec3  STROBE_C = vec3(1.0, 0.30, 0.07);
// the S of the tube, pivot to headshell collar, in the arm's frame (x towards the stylus)
const vec2 TUBE[8] = vec2[8](vec2(1.200, 0.000), vec2(3.560, 0.147), vec2(6.056, -0.206), vec2(8.630, -0.839),
  vec2(11.222, -1.528), vec2(13.774, -2.052), vec2(16.227, -2.190), vec2(18.520, -1.720));
const float GAPS[5] = float[5](13.05, 11.35, 9.85, 8.4, 7.15);   // the quiet land between tracks
const float DOTN[4] = float[4](186.0, 183.0, 180.0, 177.0);      // strobe dots per row; 180 stands still at 33

float gPx, gAsp, gPf, gPs, gLens, gTf, gAper, gRoom, gStrobe, gBob, gSheen, gLedOn, gStripY;
vec2 gVu;
vec3 gRo, gFw, gRt, gUp, gLamp, gLampAx, gStrobeP, gTgtP, gS, gLed;
vec2 gU, gW, gBack, gSide, gFoc;
float gTR, gTM, gTP, gT0, gRR, gRM, gRP, gR0, gFR, gFM, gFP, gF0;

// ── small tools ───────────────────────────────────────────────────────────────────────────────
float sqr(float x) { return x * x; }                // pow(x, 2.0) is undefined for a negative x
float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float segD(vec3 p, vec3 a, vec3 b) { vec3 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float cylX(vec3 p, float r, float h, float e) { vec2 d = vec2(length(p.yz) - r + e, abs(p.x) - h + e); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - e; }
float cylY(vec3 p, float r, float h, float e) { vec2 d = vec2(length(p.xz) - r + e, abs(p.y) - h + e); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - e; }
vec2 boxRange(vec3 ro, vec3 rd, vec3 lo, vec3 hi) {
  vec3 inv = 1.0 / rd;
  vec3 a = (lo - ro) * inv, b = (hi - ro) * inv;
  vec3 mn = min(a, b), mx = max(a, b);
  return vec2(max(max(mn.x, mn.y), max(mn.z, 0.0)), min(mx.x, min(mx.y, mx.z)));
}
void over(inout vec4 acc, vec3 c, float a) { acc.rgb += (1.0 - acc.a) * a * c; acc.a += (1.0 - acc.a) * a; }
// the arm's own frame: x from the pivot towards the stylus, z across, y up
vec3 toArm(vec3 p) { vec2 q = p.xz - PIV; return vec3(dot(q, gU), p.y, dot(q, gW)); }
vec3 toArmDir(vec3 d) { return vec3(dot(d.xz, gU), d.y, dot(d.xz, gW)); }
vec3 fromArmDir(vec3 d) { return vec3(d.x * gU.x + d.z * gW.x, d.y, d.x * gU.y + d.z * gW.y); }
// how far out of focus something at depth z is, as a radius on the screen (1 = half its height)
float cocS(float z) { return gAper * abs(1.0 - gTf / z); }
vec3 toView(vec3 P) { vec3 d = P - gRo; float z = dot(d, gFw); return vec3(vec2(dot(d, gRt), dot(d, gUp)) * gLens / z, z); }

// ── light ─────────────────────────────────────────────────────────────────────────────────────
// the desk lamp: a warm bulb in a shade, aimed at the deck
vec3 lampLight(vec3 p, out vec3 L) {
  vec3 d = gLamp - p;
  float d2 = dot(d, d);
  L = d * inversesqrt(d2);
  float cone = ss(0.84, 0.97, dot(-L, gLampAx));
  return LAMP_C * (9000.0 / d2) * (0.08 + 0.92 * cone);
}
vec3 ambient(vec3 n) {
  vec3 a = mix(vec3(0.014, 0.012, 0.011), vec3(0.045, 0.05, 0.065), n.y * 0.5 + 0.5) * (1.0 + 2.2 * gRoom);
  return a + gLed * (0.03 + 0.4 * gRoom) * max(dot(n, normalize(vec3(gBack.x, 0.2, gBack.y))), 0.0);
}
// the room as a shiny thing sees it: the lamp, the wall the LED strip washes, the dark
vec3 env(vec3 d, float rough) {
  vec3 c = mix(vec3(0.008, 0.008, 0.011), vec3(0.03, 0.033, 0.045), ss(-0.3, 0.7, d.y));
  // the wall behind the desk, washed by the LED strip that runs along it above the picture, and
  // the strip itself: a line of the room's colour across everything glossy, flaring on the beat
  float b = dot(d.xz, gBack);
  float w = 0.018 + 0.12 * rough;
  float wall = ss(0.15, 0.7, b);
  c += gLed * wall * ss(gStripY - 0.5, gStripY, d.y) * ss(gStripY + 0.35, gStripY, d.y) * (0.04 + 0.25 * gRoom);
  c += gLed * wall * exp(-sqr((d.y - gStripY) / w)) * (0.018 / w) * (3.5 + 16.0 * gRoom);
  vec3 ld = normalize(gLamp - vec3(CEN.x, Y_REC, CEN.y));
  float la = max(dot(d, ld), 0.0);
  c += LAMP_C * (7.0 * pow(la, 1800.0) * ss(0.3, 0.08, rough) + 0.35 * pow(la, 30.0));
  return c;
}
vec3 shade(vec3 p, vec3 n, vec3 v, vec3 alb, float rough, float metal, float sh) {
  vec3 L;
  vec3 E = lampLight(p, L) * sh;
  vec3 h = normalize(L + v);
  float nl = max(dot(n, L), 0.0), nh = max(dot(n, h), 0.0), vh = max(dot(v, h), 0.0), nv = max(dot(n, v), 0.0);
  float a2 = pow(max(rough * rough, 0.003), 2.0);
  float D = a2 / (PI * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
  vec3 F0 = mix(vec3(0.04), alb, metal);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - vh, 5.0);
  vec3 col = E * nl * (alb * (1.0 - metal) + F * min(D * 0.25 / max(vh * vh, 0.05), 30.0));
  vec3 sd = gStrobeP - p;
  float s2 = max(dot(sd, sd), 0.6);
  col += STROBE_C * gStrobe * (5.0 / s2) * max(dot(n, sd * inversesqrt(s2)), 0.0) * mix(alb, vec3(0.5), metal * 0.5);
  col += ambient(n) * alb * (1.0 - metal * 0.6);
  vec3 Fv = F0 + (1.0 - F0) * pow(1.0 - nv, 5.0);
  col += env(reflect(-v, n), rough) * Fv * (1.0 - rough) * (1.0 - rough);
  return col;
}

// ── the tonearm ───────────────────────────────────────────────────────────────────────────────
float armMap(vec3 p, out float m) {
  float d = 1e5;
  for (int i = 0; i < 7; i++) d = min(d, segD(p, vec3(TUBE[i].x, ARM_Y, TUBE[i].y), vec3(TUBE[i + 1].x, ARM_Y, TUBE[i + 1].y)));
  d = min(d - 0.4, segD(p, vec3(0.0, ARM_Y, 0.0), vec3(-7.1, ARM_Y, 0.0)) - 0.34);
  m = 1.0;
  // the counterweight, which the bass makes bob
  vec3 cw = p - vec3(-4.75, ARM_Y + gBob, 0.0);
  float e = cylX(cw, 1.62, 1.95, 0.15);
  if (e < d) { d = e; m = cw.x > 1.25 ? 3.0 : 2.0; }
  // the pivot: base plate, height ring, gimbal
  e = min(cylY(p - vec3(0.0, 0.28, 0.0), 3.3, 0.28, 0.08), cylY(p - vec3(0.0, 1.25, 0.0), 2.3, 0.7, 0.1));
  if (e < d) { d = e; m = 3.0; }
  e = cylY(p - vec3(0.0, (2.0 + ARM_Y + 0.9) * 0.5, 0.0), 1.15, (ARM_Y + 0.9 - 2.0) * 0.5, 0.35);
  if (e < d) { d = e; m = 2.0; }
  // the headshell in its own frame: plate, finger lift, collar; then the cartridge and the stylus
  vec2 hq = p.xz - vec2(LE, 0.0);
  vec3 h = vec3(dot(hq, HD), p.y, dot(hq, HP));
  e = box3(h - vec3(-1.3, Y_REC + 1.95, 0.0), vec3(2.45, 0.07, 0.9), 0.06);
  e = min(e, segD(h, vec3(1.0, Y_REC + 1.98, -0.75), vec3(1.75, Y_REC + 2.6, -2.45)) - 0.13);
  e = min(e, cylX(h - vec3(-4.2, ARM_Y, 0.0), 0.62, 0.6, 0.08));
  if (e < d) { d = e; m = 4.0; }
  e = box3(h - vec3(-0.8, Y_REC + 1.12, 0.0), vec3(1.15, 0.66, 0.6), 0.12);
  if (e < d) { d = e; m = 5.0; }
  e = segD(h, vec3(0.2, Y_REC + 0.42, 0.0), vec3(0.0, Y_REC + 0.03, 0.0)) - 0.04;
  if (e < d) { d = e; m = 6.0; }
  return d;
}
const vec3 ARM_LO = vec3(-7.7, 0.0, -4.9), ARM_HI = vec3(25.0, 6.1, 3.9);
float armShadow(vec3 p) {
  vec3 L = normalize(gLamp - p);
  vec3 lo = toArm(p), ld = toArmDir(L);
  vec2 tr = boxRange(lo, ld, ARM_LO, ARM_HI);
  if (tr.x >= tr.y) return 1.0;
  float res = 1.0, t = max(tr.x, 0.03), m;
  for (int i = 0; i < 24; i++) {
    float d = armMap(lo + ld * t, m);
    res = min(res, 9.0 * d / t);
    if (res < 0.01) break;
    t += clamp(d, 0.06, 1.5);
    if (t > tr.y) break;
  }
  return clamp(res, 0.0, 1.0);
}
vec4 armLayer(vec3 rd, out float tHit) {
  tHit = 1e9;
  vec3 lo = toArm(gRo), ld = toArmDir(rd);
  vec2 tr = boxRange(lo, ld, ARM_LO, ARM_HI);
  if (tr.x >= tr.y) return vec4(0.0);
  float t = tr.x, best = 1e9, tb = t, m;
  bool hit = false;
  for (int i = 0; i < 64; i++) {
    float d = armMap(lo + ld * t, m);
    float k = d / (t * gPx);
    if (k < best) { best = k; tb = t; }
    if (k < 0.05) { hit = true; break; }
    t += d;
    if (t > tr.y) break;
  }
  float a = hit ? 1.0 : clamp(1.0 - best, 0.0, 1.0);
  if (a <= 0.0) return vec4(0.0);
  tHit = tb;
  vec3 p = lo + ld * tb;
  float mat, m2;
  armMap(p, mat);
  vec2 e = vec2(0.002, -0.002);
  vec3 n = normalize(e.xyy * armMap(p + e.xyy, m2) + e.yyx * armMap(p + e.yyx, m2) + e.yxy * armMap(p + e.yxy, m2) + e.xxx * armMap(p + e.xxx, m2));
  vec3 wn = fromArmDir(n), wp = gRo + rd * tb, v = -rd;
  vec3 alb = vec3(0.9, 0.9, 0.93);
  float rough = 0.12, metal = 1.0;
  if (mat == 2.0) { alb = vec3(0.03, 0.03, 0.034); rough = 0.32; metal = 0.0; }
  else if (mat == 3.0) {
    alb = vec3(0.62, 0.62, 0.64); rough = 0.3;
    float knurl = 0.5 + 0.5 * sin(atan(p.z, p.y - ARM_Y - gBob) * 60.0);   // the counterweight's ring
    if (p.x < -2.0) { rough = 0.4 + 0.2 * knurl; alb *= 0.8 + 0.2 * knurl; }
  }
  else if (mat == 4.0) { alb = vec3(0.8, 0.8, 0.82); rough = 0.2; }
  else if (mat == 5.0) {
    // the cartridge: a red body with a white line along it
    vec2 hq = p.xz - vec2(LE, 0.0);
    float hy = p.y - Y_REC;
    alb = mix(vec3(0.7, 0.08, 0.03), vec3(0.8, 0.78, 0.74), ss(0.07, 0.04, abs(hy - 1.45)));
    rough = 0.28; metal = 0.0;
  }
  else if (mat == 6.0) { alb = vec3(0.85, 0.66, 0.35); rough = 0.2; }
  vec3 col = shade(wp, wn, v, alb, rough, metal, 1.0);
  col *= mix(0.55, 1.0, ss(0.0, 2.0, p.y));     // closer to the plinth, less light reaches in
  return vec4(col * a, a);
}

// ── the record ────────────────────────────────────────────────────────────────────────────────
// the label: the album art when there is some, otherwise a printed Visulaserz label
vec3 labelArt(vec2 q, float fw) {
  vec2 u = q / R_LAB;
  float r = length(u), fu = fw / R_LAB;
  vec3 c;
  if (uHasArt > 0.5) {
    vec2 st = u * 0.5 + 0.5;
    st.x = 0.5 + (st.x - 0.5) / max(uArtAspect, 0.01);
    float o = fu * 0.3;
    c = (textureLod(uArt, st + vec2(o, 0.3 * o), 0.0).rgb + textureLod(uArt, st - vec2(o, 0.3 * o), 0.0).rgb
      + textureLod(uArt, st + vec2(-0.3 * o, o), 0.0).rgb + textureLod(uArt, st - vec2(-0.3 * o, o), 0.0).rgb) * 0.25;
  } else {
    vec3 red = vec3(0.6, 0.1, 0.035), cream = vec3(0.8, 0.72, 0.56);
    c = red * (0.92 + 0.08 * noise(q * 9.0));
    // a ring of bars printed round the top, like a waveform
    float ang = atan(u.y, u.x);
    float k = floor(ang / TAU * 72.0);
    float barH = 0.05 + 0.14 * hash11(k * 3.7 + 1.0) * hash11(k * 1.3 + 7.0);
    float inBar = ss(0.3, 0.2, abs(fract(ang / TAU * 72.0) - 0.5) * 2.0) * ss(fu, -fu, abs(r - 0.56) - barH) * ss(-0.12, 0.0, u.y);
    c = mix(c, cream, inBar * 0.9);
    // two printed rings near the edge
    c = mix(c, cream, ss(fu + 0.008, 0.008, abs(r - 0.9)) * 0.85);
    c = mix(c, cream, ss(fu + 0.005, 0.005, abs(r - 0.86)) * 0.6);
    // the band across the lower part, with the track's title in it
    float bandY = -0.42;
    float inBand = ss(fu, -fu, abs(u.y - bandY) - 0.15) * ss(fu, -fu, r - 0.83);
    c = mix(c, cream, inBand);
    vec2 tuv = vec2(u.x / 1.3 + 0.5, (u.y - bandY) / 0.325 + 0.5);
    float ink = 0.0;
    if (inBand > 0.0 && abs(tuv.x - 0.5) < 0.5 && abs(tuv.y - 0.5) < 0.5) {
      float o = fu * 0.25;
      ink = (textureLod(uText, tuv + vec2(o, 0.0), 0.0).a + textureLod(uText, tuv - vec2(o, 0.0), 0.0).a
           + textureLod(uText, tuv + vec2(0.0, o * 4.0), 0.0).a + textureLod(uText, tuv - vec2(0.0, o * 4.0), 0.0).a) * 0.25;
    }
    c = mix(c, vec3(0.03, 0.02, 0.02), ink * inBand);
  }
  // round the spindle the paper is pressed into the vinyl
  return mix(c, vec3(0.02), ss(0.1 + fu, 0.1, r));
}

// One lamp's light on the grooves. They run round the disc and each one is a little V whose walls
// lean towards and away from the centre, so a groove sends a light to the eye only where the
// half-way vector lies in the plane of the centre line: a bright streak that stands still while
// the disc turns underneath it. s says how far a wall has to lean; past about 45° none does.
float grooveLobe(vec3 H, vec3 Tv, vec3 Rv, float warp, float sig, out float s) {
  float hn = max(H.y, 0.05);
  float ht = dot(H, Tv) - warp * hn;
  s = dot(H, Rv) / hn;
  return exp(-ht * ht / (2.0 * sig * sig)) * ss(1.0, 0.6, abs(s));
}
vec3 recordTop(vec3 p, vec3 v, float fw) {
  vec2 q = p.xz - CEN;
  float r = length(q);
  vec2 R2 = q / max(r, 1e-3);
  vec3 Tv = vec3(-R2.y, 0.0, R2.x), Rv = vec3(R2.x, 0.0, R2.y);
  float sh = armShadow(p);
  vec3 L;
  vec3 E = lampLight(p, L) * sh;
  // the label turns with the record
  vec2 qm = rot(uSpin) * q;
  float lab = ss(fw, -fw, r - R_LAB);
  vec3 col = vec3(0.0);
  if (lab > 0.0) {
    vec3 lc = labelArt(vec2(qm.x, -qm.y), fw);
    vec3 lcol = shade(p, vec3(0.0, 1.0, 0.0), v, lc * 0.9, 0.6, 0.0, sh) * 1.25;
    col += lcol * lab;
  }
  if (lab < 1.0) {
    // where the music is cut: grooves, with quiet bands between the tracks and smooth land round them
    float grooves = ss(R_IN - fw, R_IN + fw, r) * ss(R_OUT + fw, R_OUT - fw, r);
    float gap = 0.0;
    for (int i = 0; i < 5; i++) gap = max(gap, ss(0.075 + fw, max(0.075 - fw, 0.0), abs(r - GAPS[i])) * 0.075 / max(0.075, fw));
    grooves *= 1.0 - gap;
    // how loud the cut is ring by ring, as a pressing shows it
    float fine = (noise(vec2(r * 7.3, 0.5)) - 0.5) * ss(0.12, 0.03, fw) + (noise(vec2(r * 2.6, 3.5)) - 0.5);
    float loud = clamp(0.6 + 0.6 * fine, 0.0, 1.2);
    // a record is never quite flat: a slight warp that goes round with it sways the streak
    float ang = atan(q.y, q.x) - uSpin;
    float warp = 0.012 * sin(ang + 0.7) * ss(R_LAB, R_REC, r);
    vec3 H = normalize(L + v);
    float s;
    float lobe = grooveLobe(H, Tv, Rv, warp, 0.03 + 0.02 * loud, s);
    vec3 rainbow = 0.5 + 0.5 * cos(TAU * (s * 0.8 + vec3(0.0, 0.33, 0.67)));
    // the grooves are a grating: away from the middle of the streak the light breaks into colours,
    // more of them the louder the mids
    vec3 tint = mix(vec3(1.0), rainbow, (0.2 + 0.55 * gMid) * ss(0.12, 0.7, abs(s)));
    // the mids light the grooves: louder overall, and each ring its own slice of the mids
    float bx = clamp(mix(0.16, 0.5, (R_OUT - r) / (R_OUT - R_IN)), 0.002, 0.998);    // (textureLod: this runs inside a branch)
    float music = gSheen + 1.1 * uAudioActive * clamp(textureLod(uAudio, vec2(bx, ROW(0.0)), 0.0).r * 1.5, 0.0, 1.0);
    vec3 vin = E * tint * lobe * (0.55 + 0.5 * loud) * 0.85 * music * grooves;
    // the stylus light, low and cool, draws its own small streak
    vec3 tl = gTgtP - p;
    float t2 = dot(tl, tl);
    vec3 L2 = tl * inversesqrt(t2);
    float s2;
    vin += vec3(0.6, 0.75, 1.0) * (40.0 / t2) * grooveLobe(normalize(L2 + v), Tv, Rv, warp, 0.05, s2) * grooves * (0.5 + 4.0 * gHigh);
    // and where it is aimed, round the stylus, a small pool of its light that the highs turn up
    vec2 ds = p.xz - gS.xz;
    vin += vec3(0.55, 0.72, 1.0) * (0.015 + 0.5 * gHigh) * exp(-dot(ds, ds) / 6.0) * (0.4 + 0.6 * grooves);
    // the black vinyl itself, a faint haze over the grooves, and the gloss on the smooth land
    vin += E * max(L.y, 0.0) * (0.012 + 0.02 * loud * grooves);
    vin += ambient(vec3(0.0, 1.0, 0.0)) * 0.02;
    float nv = max(v.y, 0.0);
    vec3 refl = env(reflect(-v, vec3(0.0, 1.0, 0.0)), 0.02 + 0.1 * grooves) * (0.04 + 0.96 * pow(1.0 - nv, 5.0));
    vin += refl * mix(1.0, 0.5, grooves);
    // the rim of the disc is rolled up into a bead that catches the lamp
    float bead = ss(R_REC - 0.35, R_REC - 0.1, r);
    vin += E * 0.25 * bead * pow(max(dot(normalize(L + v), normalize(vec3(R2.x * 0.8, 1.0, R2.y * 0.8))), 0.0), 60.0);
    col += vin * (1.0 - lab);
  }
  return col;
}

// ── the stack on the platter: record, slipmat, platter lip and its side with the strobe dots ──
float stackShadow(vec3 p) {
  vec3 L = normalize(gLamp - p);
  vec3 q1 = p + L * ((Y_PLAT - p.y) / L.y), q2 = p + L * ((Y_REC - p.y) / L.y);
  float pen = 0.08 + 0.05 * (Y_REC - p.y);
  return min(ss(R_PLAT - pen, R_PLAT + pen, length(q1.xz - CEN)), ss(R_MAT - pen, R_MAT + pen, length(q2.xz - CEN)));
}
vec3 platterSide(vec3 rd, float tc) {
  vec3 p = gRo + rd * tc, v = -rd;
  vec2 q = p.xz - CEN;
  vec3 n = normalize(vec3(q.x, 0.0, q.y));
  float th = atan(q.y, q.x);
  // turned aluminium, the lathe's lines running round it
  vec3 col = shade(p, n, v, vec3(0.62, 0.62, 0.65), 0.3, 1.0, 1.0);
  // the dots: four rows; under the strobe the 33 row stands still and the others crawl
  float fp = tc * gPx;
  float fpc = fp / max(abs(dot(n, v)), 0.12);
  float facing = exp(-sqr((mod(th - 2.443 + PI, TAU) - PI) / 0.42));
  float glow = gStrobe * facing;
  float dots = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float yi = 0.32 + 0.36 * fi;
    if (abs(p.y - yi) > 0.3) continue;
    float N = DOTN[i];
    float sp = TAU * R_PLAT / N;
    float u = th / TAU * N + uSpin / TAU * (N - 180.0);
    vec2 dv = vec2((fract(u) - 0.5) * sp, p.y - yi);
    float dm = ss(fpc * 0.7 + 0.02, -fpc * 0.7, length(dv) - 0.1);
    dm = mix(dm, 0.1, ss(2.5, 1.0, sp / fpc));
    dots = max(dots, dm);
  }
  col *= 1.0 - 0.35 * dots;
  col += STROBE_C * dots * (0.1 + 3.2 * glow);
  col += STROBE_C * glow * 0.35;                  // the lamp's light spread on the rim
  col += vec3(0.9, 0.85, 0.8) * 0.5 * ss(Y_PLAT - 0.12, Y_PLAT, p.y) * max(dot(normalize(gLamp - p), normalize(n + vec3(0.0, 1.0, 0.0))), 0.0);
  return col;
}
vec4 stackLayer(vec3 rd, out float tS) {
  vec4 acc = vec4(0.0);
  tS = 1e9;
  if (gR0 > R_PLAT + 1.0 && gRP > R_PLAT + 1.0) return acc;
  vec3 v = -rd;
  float a = ss(gFR, -gFR, gRR - R_REC);
  if (a > 0.0) { over(acc, recordTop(gRo + rd * gTR, v, gFR), a); tS = gTR; }
  if (acc.a > 0.999) return acc;
  // the record's edge
  a = ss(gFM, -gFM, gRM - R_REC);
  if (a > 0.0) {
    vec3 p = gRo + rd * gTM;
    vec2 q = normalize(p.xz - CEN);
    over(acc, shade(p, vec3(q.x, 0.0, q.y), v, vec3(0.012), 0.15, 0.0, 1.0), a);
    tS = min(tS, gTM);
  }
  if (acc.a > 0.999) return acc;
  // the slipmat: felt
  a = ss(gFM, -gFM, gRM - R_MAT);
  if (a > 0.0) {
    vec3 p = gRo + rd * gTM;
    float fuzz = noise(p.xz * 30.0) * ss(0.1, 0.03, gFM);
    over(acc, shade(p, vec3(0.0, 1.0, 0.0), v, vec3(0.03, 0.03, 0.032) * (0.8 + 0.4 * fuzz), 0.9, 0.0, stackShadow(p) * armShadow(p)) * 0.8, a);
    tS = min(tS, gTM);
  }
  if (acc.a > 0.999) return acc;
  a = ss(gFP, -gFP, gRP - R_MAT);
  if (a > 0.0) {
    vec3 p = gRo + rd * gTP;
    vec2 q = normalize(p.xz - CEN);
    over(acc, shade(p, vec3(q.x, 0.0, q.y), v, vec3(0.03), 0.9, 0.0, 1.0) * 0.7, a);
    tS = min(tS, gTP);
  }
  if (acc.a > 0.999) return acc;
  // the platter's lip: turned aluminium, its own streak where the record's is
  a = ss(gFP, -gFP, gRP - R_PLAT);
  if (a > 0.0) {
    vec3 p = gRo + rd * gTP;
    vec2 q = p.xz - CEN;
    float r = length(q);
    vec2 R2 = q / r;
    vec3 L;
    vec3 E = lampLight(p, L) * armShadow(p);
    float s;
    float lobe = grooveLobe(normalize(L + v), vec3(-R2.y, 0.0, R2.x), vec3(R2.x, 0.0, R2.y), 0.0, 0.06, s);
    float lines = 0.85 + 0.15 * noise(vec2(r * 40.0, 0.0)) * ss(0.05, 0.015, gFP);
    vec3 col = shade(p, vec3(0.0, 1.0, 0.0), v, vec3(0.6, 0.6, 0.63) * lines, 0.4, 1.0, armShadow(p)) * 0.8;
    col += E * lobe * 0.55 * lines;
    col *= mix(0.55, 1.0, ss(R_MAT, R_MAT + 0.5, r));
    over(acc, col, a);
    tS = min(tS, gTP);
  }
  if (acc.a > 0.999) return acc;
  // the platter's side, down to the plinth
  a = ss(gF0, -gF0, gR0 - R_PLAT);
  if (a > 0.0) {
    vec2 oc = gRo.xz - CEN;
    float A = dot(rd.xz, rd.xz), B = dot(oc, rd.xz), C = dot(oc, oc) - R_PLAT * R_PLAT;
    float tc = (-B - sqrt(max(B * B - A * C, 0.0))) / A;
    over(acc, platterSide(rd, tc), a);
    tS = min(tS, tc);
  }
  return acc;
}

// ── the plinth and what stands on it ─────────────────────────────────────────────────────────
float plinthSD(vec3 p) {
  vec3 q = p - vec3(0.0, -5.6, 0.0);
  vec2 d2 = abs(q.xz) - (PLH - 1.5);
  float dxz = length(max(d2, 0.0)) + min(max(d2.x, d2.y), 0.0) - 1.5;
  vec2 w = vec2(dxz + 0.4, abs(q.y) - 5.6 + 0.4);
  float d = min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.4;
  vec2 f = abs(p.xz) - (PLH - 4.2);
  return min(d, max(length(f) - 3.0, abs(p.y + 11.6) - 0.4));
}
vec3 plinthTop(vec3 p, vec3 v, float fw) {
  // satin aluminium, brushed left to right
  float brush = (noise(vec2(p.x * 0.4, p.z * 30.0)) - 0.5) * ss(0.1, 0.03, fw);
  vec3 alb = vec3(0.34, 0.345, 0.36) * (1.0 + 0.15 * brush);
  float sh = min(stackShadow(p), armShadow(p));
  float ao = mix(0.5, 1.0, ss(R_PLAT, R_PLAT + 2.0, length(p.xz - CEN)));
  ao *= mix(0.55, 1.0, ss(3.3, 5.2, length(p.xz - PIV)));
  vec3 col = shade(p, vec3(0.0, 1.0, 0.0), v, alb, 0.38 + 0.1 * brush, 0.7, sh);
  // the brushing smears the lamp into a soft band across the top
  vec3 L;
  vec3 E = lampLight(p, L) * sh;
  vec3 H = normalize(L + v);
  col += E * alb * 0.6 * exp(-H.x * H.x / 0.02) * pow(max(H.y, 0.0), 8.0);
  col *= ao;
  // the pitch fader's slot, with its scale printed beside it
  float slot = sdRR(p.xz - vec2(20.4, 7.5), vec2(0.32, 6.2), 0.3);
  col = mix(col, vec3(0.005), ss(fw, -fw, slot));
  float tick = abs(fract((p.z - 7.5) / 1.24 + 0.5) - 0.5) * 1.24;
  float ticks = ss(0.035 + fw, 0.035, tick) * ss(fw, -fw, abs(p.x - 19.2) - (abs(p.z - 7.5) < 0.6 ? 0.5 : 0.28)) * step(abs(p.z - 7.5), 6.3);
  col = mix(col, vec3(0.75, 0.74, 0.7) * (0.15 + 0.5 * E.r), ticks * 0.8);
  // the 45 adapter, in its well at the back corner
  float dw = length(p.xz - vec2(-19.0, -14.4));
  col = mix(col, vec3(0.01), ss(fw, -fw, dw - 2.0));
  float ad = abs(dw - 1.35) - 0.55;
  col = mix(col, shade(p, normalize(vec3(p.x + 19.0, 3.0, p.z + 14.4)), v, vec3(0.8), 0.15, 1.0, sh), ss(fw, -fw, ad));
  return col;
}
vec4 plinthLayer(vec3 rd) {
  vec2 tr = boxRange(gRo, rd, vec3(-PLH.x - 0.1, DESK, -PLH.y - 0.1), vec3(PLH.x + 0.1, 0.1, PLH.y + 0.1));
  if (tr.x >= tr.y) return vec4(0.0);
  float t = tr.x, best = 1e9, tb = t;
  bool hit = false;
  for (int i = 0; i < 48; i++) {
    float d = plinthSD(gRo + rd * t);
    float k = d / (t * gPx);
    if (k < best) { best = k; tb = t; }
    if (k < 0.05) { hit = true; break; }
    t += d;
    if (t > tr.y) break;
  }
  float a = hit ? 1.0 : clamp(1.0 - best, 0.0, 1.0);
  if (a <= 0.0) return vec4(0.0);
  vec3 p = gRo + rd * tb, v = -rd;
  vec2 e = vec2(0.003, -0.003);
  vec3 n = normalize(e.xyy * plinthSD(p + e.xyy) + e.yyx * plinthSD(p + e.yyx) + e.yxy * plinthSD(p + e.yxy) + e.xxx * plinthSD(p + e.xxx));
  vec3 col;
  if (n.y > 0.97) col = plinthTop(p, v, tb * gPx / max(-rd.y, 0.2));
  else if (p.y > -1.1) col = shade(p, n, v, vec3(0.4, 0.4, 0.42), 0.3, 0.8, 1.0);        // the top plate's edge
  else col = shade(p, n, v, vec3(0.032, 0.032, 0.036), 0.45, 0.0, 1.0) * mix(0.4, 1.0, ss(-11.5, -6.0, p.y));
  return vec4(col * a, a);
}

// small raised parts: the start/stop button, 33 and 45, the fader's cap (top face and sides)
vec2 slabCover(vec3 rd, vec2 c, vec2 b, float rc, float h, float fw, out vec3 pt) {
  pt = gRo + rd * ((h - gRo.y) / rd.y);
  vec3 pb = gRo + rd * gT0;
  return vec2(ss(fw, -fw, sdRR(pt.xz - c, b, rc)), ss(fw, -fw, sdRR(pb.xz - c, b, rc)));
}
// things that stand up: the spindle, the power knob, the stylus light, the arm rest
float postSD(int i, vec3 p, out float m) {
  if (i == 0) { m = 1.0; return cylY(p - vec3(CEN.x, Y_REC + 0.75, CEN.y), 0.36, 0.75, 0.16); }
  if (i == 1) { m = 7.0; return cylY(p - vec3(-20.9, 0.5, 8.6), 1.3, 0.5, 0.15); }
  if (i == 2) {
    m = 3.0;
    float d = cylY(p - vec3(20.9, 1.5, 15.2), 0.42, 1.5, 0.1);
    float hd = segD(p, vec3(20.9, 3.05, 15.2), vec3(20.12, 3.1, 15.0)) - 0.5;
    if (hd < d) { d = hd; m = 8.0; }
    return d;
  }
  m = 3.0;
  return min(cylY(p - vec3(20.0, 1.5, -2.4), 0.4, 1.5, 0.1), box3(p - vec3(20.0, 3.15, -2.4), vec3(0.45, 0.2, 0.85), 0.1));
}
vec4 postsLayer(vec3 rd, out float tHit) {
  vec4 acc = vec4(0.0);
  tHit = 1e9;
  for (int i = 0; i < 4; i++) {
    vec3 lo = i == 0 ? vec3(CEN.x - 0.5, Y_REC, CEN.y - 0.5) : i == 1 ? vec3(-22.4, 0.0, 7.1) : i == 2 ? vec3(19.5, 0.0, 13.6) : vec3(19.3, 0.0, -3.5);
    vec3 hi = i == 0 ? vec3(CEN.x + 0.5, Y_REC + 1.6, CEN.y + 0.5) : i == 1 ? vec3(-19.4, 1.1, 10.1) : i == 2 ? vec3(21.6, 3.9, 15.9) : vec3(20.7, 3.6, -1.3);
    vec2 tr = boxRange(gRo, rd, lo, hi);
    if (tr.x >= tr.y) continue;
    float t = tr.x, best = 1e9, tb = t, m;
    bool hit = false;
    for (int j = 0; j < 32; j++) {
      float d = postSD(i, gRo + rd * t, m);
      float k = d / (t * gPx);
      if (k < best) { best = k; tb = t; }
      if (k < 0.05) { hit = true; break; }
      t += d;
      if (t > tr.y) break;
    }
    float a = hit ? 1.0 : clamp(1.0 - best, 0.0, 1.0);
    if (a <= 0.0) continue;
    vec3 p = gRo + rd * tb;
    float mat, m2;
    postSD(i, p, mat);
    vec2 e = vec2(0.002, -0.002);
    vec3 n = normalize(e.xyy * postSD(i, p + e.xyy, m2) + e.yyx * postSD(i, p + e.yyx, m2) + e.yxy * postSD(i, p + e.yxy, m2) + e.xxx * postSD(i, p + e.xxx, m2));
    vec3 col;
    if (mat == 1.0) col = shade(p, n, -rd, vec3(0.9), 0.1, 1.0, 1.0);
    else if (mat == 7.0) {
      float ridge = 0.5 + 0.5 * sin(atan(p.z - 8.6, p.x + 20.9) * 48.0);
      col = shade(p, n, -rd, mix(vec3(0.05), vec3(0.55), ss(0.6, 0.9, n.y)) * (0.85 + 0.15 * ridge), 0.3, ss(0.6, 0.9, n.y), 1.0);
    }
    else if (mat == 8.0) {
      col = shade(p, n, -rd, vec3(0.04), 0.3, 0.0, 1.0);
      col += vec3(0.8, 0.9, 1.0) * (1.6 + 4.0 * gHigh) * ss(0.8, 0.95, dot(n, vec3(-0.966, -0.07, -0.24)));     // its lens, flickering with the highs
    }
    else col = shade(p, n, -rd, vec3(0.6, 0.6, 0.62), 0.3, 1.0, 1.0);
    over(acc, col, a);
    tHit = min(tHit, tb);
  }
  return acc;
}
vec4 partsLayer(vec3 rd, float fw, out float tHit) {
  vec4 acc = vec4(0.0);
  tHit = 1e9;
  vec3 v = -rd, pt;
  // start / stop
  vec2 c = slabCover(rd, vec2(-18.9, 14.3), vec2(2.55, 1.65), 0.3, 0.5, fw, pt);
  if (c.y > 0.0) {
    float edge = sdRR(pt.xz - vec2(-18.9, 14.3), vec2(2.2, 1.3), 0.2);
    vec3 top = shade(pt, vec3(0.0, 1.0, 0.0), v, vec3(0.55, 0.55, 0.57) * (1.0 - 0.5 * ss(fw + 0.03, 0.03, abs(edge))), 0.25, 0.9, stackShadow(pt));
    over(acc, top, c.x);
    over(acc, vec3(0.03), c.y);
    tHit = (0.5 - gRo.y) / rd.y;
  }
  // 33 and 45, the 33 lit; its light flashes on the beat
  for (int i = 0; i < 2; i++) {
    vec2 bc = vec2(-15.1 + 2.6 * float(i), 15.85);
    c = slabCover(rd, bc, vec2(1.0, 0.58), 0.2, 0.32, fw, pt);
    if (c.y > 0.0) {
      vec3 top = shade(pt, vec3(0.0, 1.0, 0.0), v, vec3(0.5, 0.5, 0.52), 0.3, 0.9, 1.0);
      if (i == 0) {
        float led = length(pt.xz - (bc + vec2(-0.55, -0.2)));
        float on = gLedOn * (0.8 + 3.0 * gRoom);
        top = mix(top, vec3(1.0, 0.22, 0.04) * on, ss(0.17 + fw, 0.17, led));
        top += vec3(1.0, 0.25, 0.05) * on * 0.08 * exp(-led * 3.0);
      }
      over(acc, top, c.x);
      over(acc, vec3(0.03), c.y);
      tHit = min(tHit, (0.32 - gRo.y) / rd.y);
    }
  }
  // the pitch fader's cap
  c = slabCover(rd, vec2(20.4, 7.5), vec2(1.25, 0.7), 0.25, 1.0, fw, pt);
  if (c.y > 0.0) {
    vec3 top = shade(pt, vec3(0.0, 1.0, 0.0), v, vec3(0.06), 0.3, 0.0, 1.0);
    top = mix(top, vec3(0.8) * (0.2 + 0.6 * LAMP_C), ss(0.05 + fw, 0.05, abs(pt.z - 7.5)) * 0.8);
    over(acc, top, c.x);
    over(acc, vec3(0.012), c.y);
    tHit = min(tHit, (1.0 - gRo.y) / rd.y);
  }
  // the strobe lamp: a little dome under the platter's edge, glowing with the bass
  vec3 sc = vec3(gStrobeP.x, 0.0, gStrobeP.z);
  vec3 oc = gRo - sc;
  float tb = -dot(oc, rd);
  float dl = length(oc + rd * tb) - 0.85;
  float a = ss(tb * gPx, -tb * gPx, dl);
  if (a > 0.0) {
    float bq = dot(oc, rd), cq = dot(oc, oc) - 0.72;
    float tt = -bq - sqrt(max(bq * bq - cq, 0.0));
    vec3 p = gRo + rd * tt;
    vec3 n = normalize(p - sc);
    vec3 col = shade(p, n, v, vec3(0.05), 0.2, 0.0, 1.0) + STROBE_C * gStrobe * (0.6 + 0.8 * ss(0.0, 0.8, dot(n, normalize(vec3(CEN.x, 1.0, CEN.y) - sc))));
    over(acc, col, a * step(-0.05, p.y));
    tHit = min(tHit, tt);
  }
  return acc;
}

/// ── the room ──────────────────────────────────────────────────────────────────────────────────
// The set dressing stands in the room's own frame, s across the picture and b away from the
// camera, measured from the deck, so a tall frame finds it behind the deck too.
vec2 roomSB(vec3 p) { vec2 q = p.xz - gFoc; return vec2(dot(q, gSide), dot(q, gBack)); }
vec3 roomP(float s, float b, float y) { vec2 q = gFoc + gSide * s + gBack * b; return vec3(q.x, y, q.y); }
float blurW(float t) { return cocS(t) * t / gLens + t * gPx; }
const float WALL_B = 70.0, AMP_B = 40.0, AMP_H = 13.0;
float plinthShadow(vec3 p) {
  vec3 L = normalize(gLamp - p);
  float s = 1.0;
  for (int i = 0; i < 3; i++) {
    float y = -float(i) * 5.0;
    vec3 q = p + L * ((y - p.y) / L.y);
    float pen = 0.3 + 0.07 * (y - p.y);
    s = min(s, ss(-pen, pen, sdRR(q.xz, PLH, 1.5)));
  }
  return s;
}
// the desk: walnut planks under a satin varnish
vec3 deskShade(vec3 p, vec3 v, float t) {
  float blur = blurW(t);
  float det = ss(1.2, 0.15, blur);
  float pl = floor(p.z / 14.0);
  float ux = p.x + hash11(pl * 3.1) * 400.0;
  float warp = noise(vec2(ux * 0.012, p.z * 0.25 + pl)) * 4.0;
  float grain = noise(vec2(ux * 0.035, p.z * 0.9 + warp)) * 0.65 + noise(vec2(ux * 0.11, p.z * 3.1 + warp)) * 0.35;
  vec3 alb = mix(vec3(0.10, 0.05, 0.027), vec3(0.21, 0.115, 0.06), ss(0.25, 0.8, mix(0.5, grain, det)));
  alb *= 0.82 + 0.25 * hash11(pl * 7.7);
  alb *= 1.0 - 0.55 * ss(0.22 + blur, 0.0, abs(fract(p.z / 14.0 + 0.5) - 0.5) * 14.0) * det;
  float sh = plinthShadow(p);
  float ao = mix(0.2, 1.0, ss(-0.5, 7.0, sdRR(p.xz, PLH, 1.5)));
  vec3 col = shade(p, vec3(0.0, 1.0, 0.0), v, alb, 0.42, 0.0, sh) * ao;
  // the amplifier's meters throw a warm glow on the desk in front of it
  vec2 sb = roomSB(p);
  vec2 vu = vec2(sb.x - (40.0 * gPs - 9.5), (AMP_B - sb.y) * 1.6);
  col += vec3(1.0, 0.5, 0.16) * alb * 2.4 * exp(-dot(vu, vu) / 140.0) * step(sb.y, AMP_B);
  // and the LED strip washes down the wall onto the back of the desk
  col += gLed * alb * (0.5 + 2.5 * gRoom) * ss(WALL_B - 30.0, WALL_B, sb.y);
  return col;
}
// a backlit VU meter: q in cm from the window's middle
vec3 vuMeter(vec2 q, float bw, float level) {
  vec3 paper = vec3(0.95, 0.44, 0.12) * (0.16 + 0.36 * exp(-dot(q - vec2(0.0, -1.6), q - vec2(0.0, -1.6)) / 14.0));
  vec2 pv = q - vec2(0.0, -4.6);
  float rr = length(pv), an = atan(pv.x, pv.y);
  float sharp = ss(0.9, 0.25, bw);
  float arc = ss(0.1 + bw * 0.5, 0.0, abs(rr - 5.7)) * step(abs(an), 0.78);
  arc = max(arc, ss(0.05 + bw * 0.3, 0.0, abs(fract(an / 0.13 + 0.5) - 0.5) * 0.13 * rr) * step(abs(rr - 6.1), 0.4) * step(abs(an), 0.8));
  paper = mix(paper, mix(vec3(0.06, 0.03, 0.02), vec3(0.55, 0.04, 0.02), step(0.38, an)) * 0.4, arc * sharp * 0.85);
  float na = -0.72 + 1.45 * level;
  vec2 nd = vec2(sin(na), cos(na));
  float nl = length(pv - nd * clamp(dot(pv, nd), 0.0, 7.0));
  return mix(paper, vec3(0.015), ss(0.07 + bw, 0.0, nl) * (0.35 + 0.6 * sharp));
}
// the amplifier on the desk behind: black front, two meters, two knobs, a power light
vec4 ampLayer(vec3 rd) {
  vec4 acc = vec4(0.0);
  vec2 o = roomSB(gRo), dir = vec2(dot(rd.xz, gSide), dot(rd.xz, gBack));
  float sc = 40.0 * gPs;
  if (dir.y > 1e-4) {
    float t = (AMP_B - o.y) / dir.y;
    vec3 p = gRo + rd * t;
    float s = o.x + dir.x * t - sc, y = p.y - DESK - AMP_H * 0.5;
    float bw = blurW(t);
    float a = ss(bw, -bw, sdRR(vec2(s, y), vec2(24.0, AMP_H * 0.5), 0.6));
    if (a > 0.0) {
      vec3 c = vec3(0.016, 0.016, 0.018) + gLed * 0.02;
      c += vec3(0.25, 0.22, 0.2) * 0.08 * ss(bw + 0.3, 0.0, abs(y - AMP_H * 0.5 + 0.4));     // the lit top edge
      for (int i = 0; i < 2; i++) {
        vec2 q = vec2(s + 15.0 - 10.5 * float(i), y - 1.3);
        float win = ss(bw, -bw, sdRR(q, vec2(4.4, 2.7), 0.5));
        if (win > 0.0) c = mix(c, vuMeter(q, bw, i == 0 ? gVu.x : gVu.y) * (1.0 + 0.5 * gRoom), win);
        c += vec3(1.0, 0.5, 0.15) * 0.05 * exp(-max(sdRR(q, vec2(4.4, 2.7), 0.5), 0.0) / 1.5);
      }
      for (int i = 0; i < 2; i++) {
        vec2 q = vec2(s - 6.5 - 8.5 * float(i), y - 0.4);
        float kn = ss(bw, -bw, length(q) - 2.3);
        vec3 kc = vec3(0.07) + vec3(0.5, 0.4, 0.3) * 0.25 * ss(1.5, 2.3, length(q + vec2(0.6, -0.5))) * ss(0.0, 1.0, q.y - q.x);
        c = mix(c, kc, kn);
      }
      vec2 lq = vec2(s - 20.5, y - 3.6);
      float lr = max(bw, 0.25);
      c += vec3(1.0, 0.12, 0.05) * 0.45 * ss(lr + 0.1, lr - 0.1, length(lq)) * min(1.0, 0.09 / (lr * lr));
      over(acc, c, a);
    }
  }
  // its top, seen over the front: dark metal, vent slots, the lamp's light on it
  float t2 = (DESK + AMP_H - gRo.y) / rd.y;
  vec3 p2 = gRo + rd * t2;
  vec2 sb = roomSB(p2);
  float bw2 = blurW(t2);
  float a2 = ss(bw2, -bw2, sdRR(vec2(sb.x - sc, sb.y - AMP_B - 15.0), vec2(24.0, 15.0), 0.6));
  if (a2 > 0.0) {
    float vent = ss(bw2 + 0.2, 0.0, abs(fract((sb.x - sc) / 1.6) - 0.5) * 1.6) * step(abs(sb.y - AMP_B - 9.0), 4.0) * step(abs(sb.x - sc), 18.0) * ss(1.5, 0.3, bw2);
    vec3 c = shade(p2, vec3(0.0, 1.0, 0.0), -rd, vec3(0.03), 0.4, 0.3, 1.0) * (1.0 - 0.7 * vent);
    c += gLed * (0.012 + 0.09 * gRoom) * ss(AMP_B, AMP_B + 30.0, sb.y) * (1.0 - 0.6 * vent);     // the strip above, on its lid
    over(acc, c, a2);
  }
  return acc;
}
// a record sleeve leaning on the wall: the album art when there is some, otherwise the label's design
vec4 sleeveLayer(vec3 rd) {
  const float LEAN = 0.48;
  vec3 up = vec3(gBack.x * sin(LEAN), cos(LEAN), gBack.y * sin(LEAN));
  vec3 n = vec3(-gBack.x * cos(LEAN), sin(LEAN), -gBack.y * cos(LEAN));
  vec3 P0 = roomP(-47.0 * gPs, WALL_B - 31.4 * sin(LEAN) - 0.5, DESK);
  float dn = dot(rd, n);
  if (dn > -1e-4) return vec4(0.0);
  float t = dot(P0 - gRo, n) / dn;
  vec3 p = gRo + rd * t;
  vec3 d = p - P0;
  vec2 q = vec2(dot(d.xz, gSide), dot(d, up));
  float bw = blurW(t);
  float a = ss(bw, -bw, sdRR(q - vec2(0.0, 15.7), vec2(15.7), 0.25));
  if (a <= 0.0) return vec4(0.0);
  vec2 st = q / 31.4 + vec2(0.5, 0.0);
  vec3 c;
  if (uHasArt > 0.5) {
    vec2 su = vec2(0.5 + (st.x - 0.5) / max(uArtAspect, 0.01), st.y);
    float o = bw / 31.4 * 0.6;
    c = (textureLod(uArt, su, 0.0).rgb * 2.0 + textureLod(uArt, su + vec2(o, 0.0), 0.0).rgb + textureLod(uArt, su - vec2(o, 0.0), 0.0).rgb
       + textureLod(uArt, su + vec2(0.0, o), 0.0).rgb + textureLod(uArt, su - vec2(0.0, o), 0.0).rgb) / 6.0;
  } else {
    // the house sleeve: a sun going down behind stripes, on night blue, a cream band for the title
    vec2 cq = st - vec2(0.5, 0.52);
    float bwu = bw / 31.4 + 0.002;
    c = vec3(0.07, 0.09, 0.2);
    vec3 sun = mix(vec3(1.0, 0.3, 0.1), vec3(1.0, 0.75, 0.3), ss(0.3, 0.8, st.y));
    float disc = ss(bwu, -bwu, length(cq) - 0.3);
    float gaps = ss(-bwu, bwu, abs(fract((st.y - 0.26) * 14.0) - 0.5) / 14.0 - mix(0.0, 0.028, ss(0.56, 0.24, st.y)));
    c = mix(c, sun, disc * gaps);
    c = mix(c, vec3(0.86, 0.8, 0.68), ss(bwu, -bwu, abs(st.y - 0.13) - 0.06) * ss(bwu, -bwu, abs(st.x - 0.5) - 0.42));
  }
  vec3 L;
  vec3 E = lampLight(p, L);
  c *= E * max(dot(n, L), 0.0) * 0.9 + 0.04 + gLed * 0.06 + gRoom * 0.05;
  return vec4(c * a, a);
}
// a tulip glass of tea on its saucer beside the deck, the lamp glowing through the tea
float tulip(float h) { return 0.5 + 0.17 * exp(-sqr((h - 0.27) / 0.2)) - 0.05 * exp(-sqr((h - 0.62) / 0.15)) + 0.18 * ss(0.7, 1.0, h); }
vec3 glassLayer(vec2 uv, vec3 col) {
  vec3 B = roomP(-36.0 * gPs, 16.0, DESK);
  vec3 b0 = toView(B + vec3(0.0, 0.45, 0.0)), b1 = toView(B + vec3(0.0, 9.9, 0.0));
  vec2 ax = b1.xy - b0.xy;
  float H = length(ax);
  ax /= H;
  vec2 d = uv - b0.xy;
  vec2 g = vec2(dot(d, vec2(ax.y, -ax.x)), dot(d, ax)) / H;      // across and up, in glass heights
  float px = 2.0 / uRes.y / H;
  float bs = cocS(b0.z) / H + px;
  if (abs(g.x) > 0.75 + bs || g.y < -0.3 - bs || g.y > 1.25 + bs) return col;
  float tilt = 0.5;                                                  // how open an ellipse looks from up here
  vec3 L;
  vec3 E = lampLight(B + vec3(0.0, 5.0, 0.0), L);
  // the saucer: white porcelain with a gold line, the glass's shadow and the tea's red light on it
  vec2 sq = vec2(g.x / 0.72, (g.y + 0.02) / (0.72 * tilt * 0.55));
  float sr = length(sq);
  float sa = ss(1.0 + bs * 2.0, 1.0 - bs * 2.0, sr);
  vec3 por = vec3(0.8, 0.77, 0.72) * (E.r * 0.32 + 0.06) * (0.75 + 0.25 * ss(-1.0, 0.6, sq.y));
  por = mix(por, vec3(0.75, 0.52, 0.2) * (E.r * 0.4 + 0.08), ss(0.06 + bs, 0.0, abs(sr - 0.86)));
  por *= 1.0 - 0.5 * exp(-dot(sq - vec2(0.25, 0.1), sq - vec2(0.25, 0.1)) * 3.0);
  por += vec3(0.7, 0.15, 0.03) * 0.25 * E.r * exp(-dot(sq + vec2(0.35, 0.0), sq + vec2(0.35, 0.0)) * 4.0);
  col = mix(col, por, sa);
  // the glass
  float h = clamp(g.y, 0.0, 1.0);
  float w = tulip(h) * 0.46;
  float xi = g.x / w;
  float foot = 0.07;
  float wb = w * sqrt(max(0.0, 1.0 - sqr(min(g.y, 0.0) / foot)));
  float inG = ss(bs, -bs, abs(g.x) - (g.y < 0.0 ? wb : w)) * ss(bs, -bs, -g.y - foot) * ss(bs, -bs, g.y - 1.0);
  float mouthR = tulip(1.0) * 0.46;
  float mouth = ss(1.0 + bs * 3.0, 1.0 - bs * 3.0, length(vec2(g.x / mouthR, (g.y - 1.0) / (mouthR * tilt))));
  float level = 0.8;
  float th = sqrt(max(0.0, 1.0 - xi * xi));
  vec3 gc;
  if (g.y < level) {
    // tea: deep red in the middle, glowing where the glass is thin and the lamp comes through
    float thin = exp(-2.4 * th);
    gc = vec3(0.09, 0.012, 0.004) + vec3(1.0, 0.27, 0.05) * E * (0.12 + 0.95 * thin) * (0.6 + 0.5 * ss(0.3, -0.8, xi));
  } else {
    gc = col * 0.9 + vec3(0.04, 0.035, 0.03);
  }
  gc += LAMP_C * E * 0.55 * exp(-sqr((xi + 0.5) / 0.09)) * ss(0.05, 0.25, g.y);    // the lamp, caught in the glass
  gc += vec3(0.5, 0.55, 0.6) * 0.18 * exp(-sqr((xi - 0.62) / 0.12));
  gc += vec3(0.25) * ss(0.82, 1.0, abs(xi));
  // the surface of the tea, the lamp in it
  vec2 sv = vec2(g.x / (tulip(level) * 0.46), (g.y - level) / (tulip(level) * 0.46 * tilt));
  float surf = ss(1.0 + bs * 4.0, 1.0 - bs * 4.0, length(sv));
  gc = mix(gc, vec3(0.16, 0.03, 0.01) * (E.r * 0.5 + 0.1) + LAMP_C * E * 0.6 * exp(-dot(sv + vec2(0.3, -0.2), sv + vec2(0.3, -0.2)) * 6.0), surf);
  col = mix(col, gc, max(inG, mouth * 0.5));
  // the rim
  col += vec3(0.6, 0.55, 0.5) * 0.35 * (E.r + 0.1) * ss(0.04 + bs, 0.0, abs(length(vec2(g.x / mouthR, (g.y - 1.0) / (mouthR * tilt))) - 1.0));
  return col;
}
// a string of warm bulbs along the wall, far out of focus: bokeh, brighter on the beat
vec3 fairyLights(vec2 uv) {
  vec3 c = vec3(0.0);
  float px = 2.0 / uRes.y;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float s = (fi - 4.0) * 17.0 * mix(1.0, 0.7, gPf) + 4.0;
    float sag = 2.5 * (1.0 - sqr(fract(fi * 0.5) * 2.0 - 1.0));
    vec3 P = roomP(s, WALL_B - 1.0, DESK + 10.5 - sag + 1.2 * sin(fi * 2.1));
    vec3 v = toView(P);
    float r = max(cocS(v.z), 3.0 * px);
    float dd = length(uv - v.xy);
    float disc = ss(r + px, r - px, dd) * (0.7 + 0.3 * ss(r * 0.5, r, dd));
    vec3 tint = mix(vec3(1.0, 0.62, 0.3), gLed * 1.4 + 0.1, step(0.66, fract(fi * 0.37)) * 0.6);
    c += tint * disc * (0.35 + 0.8 * gRoom) * (0.85 + 0.15 * sin(uTime * 0.7 + fi * 2.0));
  }
  return c;
}
vec3 background(vec3 rd, vec2 uv) {
  float tD = (DESK - gRo.y) / min(rd.y, -1e-4);
  float bro = dot(gRo.xz - gFoc, gBack), brd = dot(rd.xz, gBack);
  float tW = brd > 1e-4 ? (WALL_B - bro) / brd : 1e9;
  vec3 col;
  if (tD < tW) col = deskShade(gRo + rd * tD, -rd, tD);
  else {
    // the wall: dark plaster, an LED strip behind the desk washing it with the palette's colour
    vec3 p = gRo + rd * tW;
    float h = p.y - DESK;
    vec3 L;
    float up = ss(-10.0, 62.0, h);
    col = vec3(0.008, 0.008, 0.011) + gLed * (0.012 + 0.07 * up + 0.12 * up * up) * (1.0 + 3.5 * gRoom);
    col += lampLight(p, L) * 0.02 * exp(-max(dot(p.xz - gFoc, gSide) + 30.0, 0.0) / 40.0);
    col = mix(deskShade(gRo + rd * tD, -rd, tD), col, ss(0.0, blurW(tW) * 2.0, h));
    col += fairyLights(uv);
  }
  vec4 sl = sleeveLayer(rd);
  col = col * (1.0 - sl.a) + sl.rgb;
  vec4 am = ampLayer(rd);
  col = col * (1.0 - am.a) + am.rgb;
  col = glassLayer(uv, col);
  return col;
}
// the lamp's light in the air on its way down to the deck, and the dust floating in it
vec3 beam(vec3 rd, float tEnd) {
  vec3 acc = vec3(0.0);
  float t0 = gTf * 0.25, t1 = min(tEnd, gTf * 2.2);
  float dt = (t1 - t0) / 8.0;
  float j = fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)) * 52.9829189);
  for (int i = 0; i < 8; i++) {
    vec3 p = gRo + rd * (t0 + dt * (float(i) + j));
    vec3 L;
    vec3 E = lampLight(p, L);
    acc += E * ss(0.8, 0.95, dot(-L, gLampAx));
  }
  return acc * dt * 0.0008;
}
vec3 motes(vec2 uv, float tEnd) {
  // three sheets of dust at different depths, drifting; each cell of a sheet may hold one mote,
  // and the four cells nearest the pixel are asked, so a big out-of-focus mote is never cut off
  vec3 c = vec3(0.0);
  float px = 2.0 / uRes.y;
  const float CELL = 0.11;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float z = gTf * (0.68 + 0.13 * fk);
    if (z > tEnd) continue;
    vec2 drift = vec2(0.008 * uTime * (0.6 + 0.3 * fk), -0.004 * uTime);
    vec2 g = (uv + drift) / CELL + fk * 17.3;
    vec2 base = floor(g - 0.5);
    float r = max(cocS(z), 0.9 * px);
    for (int j = 0; j < 4; j++) {
      vec2 id = base + vec2(float(j & 1), float(j >> 1));
      float h = hash21(id + fk * 31.0);
      if (h > 0.12) continue;
      h /= 0.12;
      vec2 off = 0.5 + (vec2(hash21(id + 4.1), hash21(id + 8.3)) - 0.5) * 0.5
        + 0.08 * vec2(sin(uTime * (0.3 + h) + h * 40.0), cos(uTime * (0.25 + h) + h * 23.0));
      vec2 sp = (id + off - fk * 17.3) * CELL - drift;
      float dd = length(uv - sp);
      if (dd > r + px) continue;
      vec3 dir = normalize(gRt * sp.x + gUp * sp.y + gFw * gLens);
      vec3 P = gRo + dir * (z / dot(dir, gFw));
      vec3 L;
      vec3 E = lampLight(P, L) * ss(0.88, 0.96, dot(-L, gLampAx));
      float disc = ss(r + px * 0.7, max(r - px * 0.7, 0.0), dd);
      float glint = gHigh * pow(0.5 + 0.5 * sin(uTime * (2.0 + 6.0 * h) + h * 50.0), 3.0);
      c += E * disc * (0.12 + 2.4 * glint) * min(1.0, 2.5 * px * px / (r * r));
    }
  }
  return c;
}
// the stylus, where the highs make it spark
vec3 spark(vec2 uv) {
  vec3 sp = toView(gS + vec3(0.0, 0.04, 0.0));
  vec2 d = (uv - sp.xy) * uRes.y * 0.5 / max(uRes.y / 1080.0, 0.3);
  float fl = 0.6 + 0.4 * sin(uTime * 53.0) * sin(uTime * 31.0 + 1.0);
  float core = exp(-dot(d, d) / 5.0);
  float star = exp(-abs(d.x) / 1.6 - abs(d.y) / 26.0) + exp(-abs(d.y) / 1.6 - abs(d.x) / 26.0);
  return vec3(0.8, 0.9, 1.0) * gHigh * fl * (3.0 * core + 0.6 * star);
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gAsp = uRes.x / uRes.y;
  gPf = ss(1.25, 0.7, gAsp);
  gRoom = uAudioActive * uPunch * exp(-uBeatAge * 7.0) * ss(0.45, 0.3, uBeatAge);
  gStrobe = 0.5 + 1.8 * gBass;
  gBob = -0.3 * gBass + 0.08 * gBass * sin(uTime * 23.0);
  gSheen = 1.6 + 0.9 * gMid;
  gLedOn = 1.0;
  // the room's light: the palette's colour at full saturation, leaning a little to night blue
  vec3 lc = pal(0.3);
  float lmx = max(lc.r, max(lc.g, lc.b)), lmn = min(lc.r, min(lc.g, lc.b));
  vec3 lsat = (lc - lmn) / max(lmx - lmn, 1e-3);
  gLed = mix(vec3(0.3, 0.42, 1.0), mix(vec3(0.3, 0.42, 1.0), lsat, 0.75), ss(0.04, 0.2, lmx - lmn)) * 0.85;
  gPs = mix(1.0, 0.62, gPf);
  float lv = uAudioActive * clamp(uLevel * 1.4, 0.0, 1.0);
  gVu = clamp(vec2(lv * (1.0 - 0.35 * uBalance), lv * (1.0 + 0.35 * uBalance)), 0.0, 1.0);

  // the camera: a slow drift round the deck; it stands further off and more to the side in a tall frame
  float az0 = mix(-0.5, -1.25, gPf);
  float az = az0 + 0.035 * sin(uTime * 0.05);
  float el = mix(0.56, 0.86, gPf) + 0.012 * sin(uTime * 0.037 + 1.0);
  gStripY = sin(el) - mix(0.045, -0.02, gPf);
  float dist = mix(80.0, 128.0, gPf);
  gLens = mix(3.2, 2.7, gPf);
  vec3 tgt = mix(vec3(1.0, 0.5, 1.5), vec3(1.5, 7.0, 0.0), gPf);
  gRo = tgt + dist * vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el));
  gRo.y -= 0.35 * gRoom;
  gFw = normalize(tgt - gRo);
  gRt = normalize(cross(gFw, vec3(0.0, 1.0, 0.0)));
  gUp = cross(gRt, gFw);
  vec3 rd = normalize(gRt * uv.x + gUp * uv.y + gFw * gLens);
  gPx = 2.0 / (uRes.y * gLens);
  gTf = dist;
  gAper = 0.08;
  gBack = -vec2(sin(az0), cos(az0));
  gSide = vec2(cos(az0), -sin(az0));
  gFoc = tgt.xz;
  vec2 lxz = gFoc + gSide * -48.0 + gBack * 40.0;
  gLamp = vec3(lxz.x, 58.0, lxz.y);
  gLampAx = normalize(vec3(0.0, 0.0, 1.0) - gLamp);
  gStrobeP = vec3(CEN + 17.45 * vec2(-0.766, 0.643), 0.55);
  gTgtP = vec3(19.6, 3.05, 14.9);

  // the arm: the stylus sits as far in as the track has played
  float rn = mix(R_OUT - 0.1, R_IN + 0.25, clamp(uProgress, 0.0, 1.0));
  vec2 dc = PIV - CEN;
  float dd = length(dc);
  vec2 e = dc / dd;
  float aa = (rn * rn - LE * LE + dd * dd) / (2.0 * dd);
  vec2 S2 = CEN + aa * e + sqrt(max(rn * rn - aa * aa, 0.0)) * vec2(-e.y, e.x);
  gU = normalize(S2 - PIV);
  gW = vec2(-gU.y, gU.x);
  gS = vec3(S2.x, Y_REC, S2.y);

  // where the ray meets the planes of the record, the slipmat, the platter and the plinth top,
  // worked out for every pixel so their edges can be smoothed over exactly one pixel
  float ry = min(rd.y, -1e-4);
  gTR = (Y_REC - gRo.y) / ry; gTM = (Y_MAT - gRo.y) / ry; gTP = (Y_PLAT - gRo.y) / ry; gT0 = -gRo.y / ry;
  gRR = length(gRo.xz + rd.xz * gTR - CEN); gRM = length(gRo.xz + rd.xz * gTM - CEN);
  gRP = length(gRo.xz + rd.xz * gTP - CEN); gR0 = length(gRo.xz + rd.xz * gT0 - CEN);
  gFR = max(fwidth(gRR), 1e-4); gFM = max(fwidth(gRM), 1e-4); gFP = max(fwidth(gRP), 1e-4); gF0 = max(fwidth(gR0), 1e-4);
  vec2 p0 = gRo.xz + rd.xz * gT0;
  float fTop = max(length(fwidth(p0)) * 0.7, 1e-4);

  vec4 acc = vec4(0.0);
  float tA, tS, tP, tQ;
  vec4 arm = armLayer(rd, tA);
  over(acc, arm.rgb / max(arm.a, 1e-4), arm.a);
  if (acc.a < 0.999) {
    vec4 st = stackLayer(rd, tS);
    vec4 po = postsLayer(rd, tQ);
    vec4 pa = partsLayer(rd, fTop, tP);
    // these three can hide each other: nearest first
    if (tQ < tS) { vec4 tmp = st; st = po; po = tmp; float tt = tS; tS = tQ; tQ = tt; }
    if (tP < tS) { vec4 tmp = st; st = pa; pa = tmp; float tt = tS; tS = tP; tP = tt; }
    if (tP < tQ) { vec4 tmp = po; po = pa; pa = tmp; }
    acc.rgb += (1.0 - acc.a) * st.rgb; acc.a += (1.0 - acc.a) * st.a;
    acc.rgb += (1.0 - acc.a) * po.rgb; acc.a += (1.0 - acc.a) * po.a;
    acc.rgb += (1.0 - acc.a) * pa.rgb; acc.a += (1.0 - acc.a) * pa.a;
  }
  if (acc.a < 0.999) {
    vec4 pl = plinthLayer(rd);
    acc.rgb += (1.0 - acc.a) * pl.rgb; acc.a += (1.0 - acc.a) * pl.a;
  }
  if (acc.a < 0.999) acc.rgb += (1.0 - acc.a) * background(rd, uv);
  vec3 col = acc.rgb;
  float tEnd = min(min(tA, gT0), (DESK - gRo.y) / min(rd.y, -1e-4));
  col += beam(rd, tEnd) + motes(uv, tEnd) + spark(uv);
  col += (hash21(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'vinyl',
  name: 'Vinyl',
  group: 'Things',
  blurb: 'A turntable at night: grooves catching the lamp, a needle riding the song, a strobe pumping with the bass, the room light flaring on beats',
  tags: ['retro', 'artwork', 'calm', '3d', 'turntable'],
  energy: 0.3,
  particles: 0,
  trails: 0,
  zoom: 1,
  spin: 0,
  frag,
};
