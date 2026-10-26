// HARMONOGRAPH — a pendulum drawing machine seen from above, on a dark walnut table under a warm
// lamp. A square sheet of cream paper lies in the middle; two pen arms reach in from swivel posts
// below it, a brass one carrying a broad pen in indigo ink and a nickel one a fine pen in vermilion.
// Through two brass-rimmed ports in the table you look down at the two pendulums, polished brass
// balls hanging from knife-edge bridges, the lamp's light lying on the floor far below with their
// shadows in it: the left one swings the pens across, the right one up and down, and you can watch
// each ball follow its half of the figure. The pens draw the damped figure the two swings make
// together (the fine pen picks them up crosswise), so the sheet fills with nested loops that spiral
// inward as the swing dies away: a real harmonograph drawing, a different one on every sheet.
//
// The drawing is a record, not a trail. A small simulation texture keeps, for every moment of pen
// time on the current sheet, how wide the swing was, how far the figure had turned, how hard the
// main pen pressed and how freely the fine pen flowed; the ink is redrawn from that record every
// frame as 20 000 short antialiased segments (the points pass), so what the music did stays on the
// paper. Where the pen slows to turn, the ink pools darker; fresh ink is wet and catches the lamp.
// The arms are motion-blurred about their posts, so a fast pen sweeps instead of jumping.
//
// Music, band by band:
//   bass  (uBass)  the indigo pen's pressure: kicks lay down thick, dark, wet ink, the line swells
//                  and thins with the bass line and the sheet ends up a record of the rhythm.
//   mids  (uMid)   the drift between the two swings: a busy middle turns each loop a little further
//                  round, so the figure precesses into a rosette; a quiet one nests it neatly.
//   highs (uHigh)  the vermilion pen's flow: hi-hats open it wide and bright, silence leaves it a
//                  faint hairline.
//   beat           every beat pushes both pendulums: the balls swing visibly wider at once, the
//                  pens step outward and the figure grows again before it decays (the push lands
//                  within ~0.3 s; the simulated swing carries it on). Steady beats hold the figure
//                  at a width; a breakdown lets it spiral in, the drop pushes it back out.
//   loudness       runs the machine faster (the cruise rate).
// Every 32 beats (or when a sheet is full) the pens lift, the finished sheet is pulled away and a
// fresh one starts on a new interval — 2:3 fifth, 1:1 unison, 1:4 two octaves, 1:2 octave, 1:3 twelfth —
// pencilled in its corner by the green pencil lying beside the machine. With no music (or before
// the analysis has anything) the machine keeps drawing slowly with even, light pressure, and every
// audio value above is multiplied by uAudioActive, so silence is silence.

// ── shared by the simulation, the ink and the picture ─────────────────────────────────────────
const COMMON = `
const float NREC = 2048.0;           // record entries a sheet holds
const float TCAP = 24.0;             // pen-seconds a sheet holds
const float DREC = TCAP / NREC;      // pen time per record entry
const float NA = 13000.0;            // segments of the main pen's line
const float NB = 7000.0;             // segments of the fine pen's line
const float T_SLIDE = 0.9;           // seconds to pull a finished sheet away
const float TSIL = 10.0;             // pen-seconds a sheet runs for when nothing is playing
const float A0 = 0.95;               // the swing a fresh sheet starts with
const float AMAX = 1.0;              // the most the swing can take
const float AMIN = 0.12;             // a swing this small has finished its sheet
const float PUSH = 0.05;             // what one beat adds to the swing
const float RAMP = 0.16;             // seconds a push takes to reach the swing
const float W = 15.0;                // the faster pendulum's swing, radians per pen-second (2.4 Hz)
const float DSIL = 0.085;            // how fast the swing dies in silence, per second
const float DMUS = 0.17;             // and with music, when the beats keep pushing it
const float BEATS = 32.0;            // beats a sheet lasts
const float OFF = 30.0;              // where the sheets fall in the beat count
const float P0 = 0.15;               // the main pen's pressure in silence
const float F0 = 0.22;               // the fine pen's flow in silence
const float TH0 = 0.012;             // drift between the swings in silence, turns per figure (1:n)
const float TH1 = 0.05;              // drift added per unit of mids

// the machine's state, kept in four texels after the record
struct St { float tauS, tauD, A, th, time, P, F, pend, slide, serial, lastBeat, beats; };
float hiLo(vec2 v) { return v.x + v.y / 256.0; }
vec2 toHiLo(float v) { v = clamp(v, 0.0, 0.999999); float h = floor(v * 256.0) / 256.0; return vec2(h, (v - h) * 256.0); }
ivec2 cellOf(int n) { int w = int(uStateRes.x + 0.5); return ivec2(n % w, n / w); }
vec4 bk(int k) { return stateAt(cellOf(2048 + k)); }
St readSt() {
  vec4 k0 = bk(0), k1 = bk(1), k2 = bk(2), k3 = bk(3);
  St s;
  s.tauS = hiLo(k0.xy) * 32.0; s.tauD = hiLo(k0.zw) * 32.0;
  s.A = hiLo(k1.xy) * 2.0; s.th = hiLo(k1.zw) * TAU;
  s.time = hiLo(k2.xy) * 1024.0; s.P = k2.z; s.F = k2.w;
  s.pend = k3.x; s.slide = k3.y; s.serial = floor(k3.z + 0.5);
  float bi = floor(k3.w + 0.5);
  s.lastBeat = mod(bi, 32.0); s.beats = floor(bi / 32.0);
  return s;
}
// one record entry: swing, precession angle, pressure, flow
vec4 unpackRec(vec4 e) { float pf = floor(e.w + 0.5); return vec4(e.x, hiLo(e.yz) * TAU, floor(pf / 32.0) / 31.0, mod(pf, 32.0) / 31.0); }
vec4 packRec(float A, float th, float P, float F) {
  return vec4(A, toHiLo(th / TAU), floor(clamp(P, 0.0, 1.0) * 31.0 + 0.5) * 32.0 + floor(clamp(F, 0.0, 1.0) * 31.0 + 0.5));
}
vec4 recAt(float tau) {
  float x = tau / DREC;
  float i = floor(x), f = x - i;
  vec4 a = unpackRec(stateAt(cellOf(int(i)))), b = unpackRec(stateAt(cellOf(int(min(i + 1.0, NREC - 1.0)))));
  float dth = b.y - a.y;
  dth -= TAU * floor(dth / TAU + 0.5);                // the angle may wrap between two entries
  return vec4(mix(a.x, b.x, f), a.y + dth * f, mix(a.zw, b.zw, f));
}
float penRate() { return mix(0.6, clamp(uCruiseRate, 0.45, 1.6), uAudioActive); }

// a sheet's figure. One pendulum swings the pen across, the other up and down, in the ratio of a
// musical interval, slightly detuned so the figure turns over as it goes; a third, rotary swing
// adds a small circle. The fine pen's arm picks the same swings up crosswise and at other phases.
struct Sheet { vec2 ab; float om, det, p1, p2, q1, q2, c, cr, dy, beta; int k; };
Sheet sheetOf(float serial) {
  Sheet s;
  float n = mod(serial, 256.0);
  // the intervals whose figures close on themselves often enough to weave a rich sheet in 32 beats
  s.k = int(mod(n, 5.0));
  s.ab = s.k == 0 ? vec2(2.0, 3.0) : s.k == 1 ? vec2(1.0, 1.0) : s.k == 2 ? vec2(1.0, 4.0)
       : s.k == 3 ? vec2(1.0, 2.0) : vec2(1.0, 3.0);
  float h1 = hash11(n * 1.37 + 0.11), h2 = hash11(n * 2.71 + 0.53), h3 = hash11(n * 3.93 + 0.27);
  float h4 = hash11(n * 5.17 + 0.71), h5 = hash11(n * 7.31 + 0.37);
  s.det = (0.0015 + 0.002 * h2) * (h3 > 0.5 ? 1.0 : -1.0);
  // the swings start a quarter turn apart (give or take), so no figure collapses into a line
  s.p1 = TAU * h3; s.p2 = s.p1 + 1.5708 + (h5 - 0.5) * 1.3;
  s.q1 = TAU * h4; s.q2 = s.q1 + 1.5708 + (h1 - 0.5) * 1.3;
  float ab = s.ab.x * s.ab.y;
  s.c = (0.1 + 0.14 * h4) * (ab > 5.0 ? 0.5 : 1.0);  // the rotary swing's share, less in the busier figure
  s.cr = h5 > 0.5 ? 1.0 : -1.0;                       // and which way it turns
  s.dy = 0.01 + 0.04 * h1;                            // the second pendulum dies a little faster
  s.beta = (h2 - 0.5) * 0.6;
  s.om = W / s.ab.y;                                  // the faster pendulum always swings at W
  return s;
}
// how fast the drift between the swings turns the figure over, radians per pen-second: a share of a
// turn per figure, more with the mids, less in the figures whose slow pendulum swings more than once
float drift(Sheet s, float mids) { return (TH0 + TH1 * mids) * W / (s.ab.x * s.ab.y); }
// the two pendulums' swings at pen time tau (unit swing): x across, y up and down, and the rotary
void swingsAt(Sheet s, float tau, out float x, out float y, out vec2 r) {
  float f1 = s.ab.x * s.om * tau, f2 = s.ab.y * (1.0 + s.det) * s.om * tau;
  x = sin(f1 + s.p1);
  y = sin(f2 + s.p2) * exp(-s.dy * tau);
  float f3 = s.ab.x * (1.0 - 1.7 * s.det) * s.om * tau;
  r = vec2(cos(f3), s.cr * sin(f3));
}
// th is the drift between the two swings that the mids push along: the figure turns over like a
// ribbon instead of retracing itself
vec2 figureA(Sheet s, float tau, float A, float th) {
  float x, y; vec2 r; swingsAt(s, tau, x, y, r);
  float f2 = s.ab.y * (1.0 + s.det) * s.om * tau;
  y = sin(f2 + s.p2 + th) * exp(-s.dy * tau);
  return 0.9 * A * ((1.0 - s.c) * vec2(x, y) + s.c * r);
}
vec2 figureB(Sheet s, float tau, float A, float th) {
  float f1 = s.ab.x * s.om * tau, f2 = s.ab.y * (1.0 + s.det) * s.om * tau;
  vec2 q = vec2(sin(f2 + s.q2 + th) * exp(-s.dy * tau), sin(f1 + s.q1));
  return 0.7 * A * (rot(s.beta) * q);
}

// the frame's layout: the sheet fits the short side, the ports and the arms' swivel posts take the
// long one; the arms rise from their posts below the sheet in a V
struct Layout { vec2 pc; float S, ang; vec2 port1, port2; float portR; vec2 postA, postB, slideDir; float slideLen; vec2 lamp; };
Layout layoutOf(float asp) {
  Layout L;
  L.pc = vec2(0.0);
  L.ang = -0.035;
  if (asp >= 1.0) {
    L.S = min(0.86, asp * 0.62);                       // nearly square screens give the ports some room
    float room = asp - L.S;
    L.portR = clamp(room * 0.34, 0.05, 0.31);
    float cx = L.S + room * 0.5;
    L.port1 = vec2(-cx, 0.33); L.port2 = vec2(cx, 0.33);
    L.postA = vec2(-L.S - min(room * 0.3, 0.2), -0.66); L.postB = vec2(L.S + min(room * 0.3, 0.2), -0.66);
    L.slideDir = normalize(vec2(0.25, -1.0)); L.slideLen = 2.45;
  } else {
    L.S = asp * 0.9;
    float room = 1.0 - L.S;
    L.portR = clamp(min(room * 0.36, asp * 0.36), 0.05, 0.31);
    float cy = L.S + room * 0.5;
    L.port1 = vec2(-asp * 0.43, cy); L.port2 = vec2(asp * 0.43, cy);
    L.postA = vec2(-asp * 0.6, -L.S - room * 0.32); L.postB = vec2(asp * 0.6, -L.S - room * 0.32);
    L.slideDir = normalize(vec2(1.0, -0.25)); L.slideLen = asp + L.S * 1.5 + 0.1;
  }
  L.lamp = L.pc + vec2(-0.45, 0.5) * L.S;
  return L;
}
// the top sheet's pose (centre, angle): at rest, or being pulled away
vec3 sheetPose(Layout L, float slide) {
  float e = slide > 0.0 ? ss(0.0, 1.0, slide) : 0.0;
  return vec3(L.pc + L.slideDir * L.slideLen * e, L.ang - 0.32 * e * e);
}
vec2 sheetToScreen(Layout L, vec2 q, float slide) { vec3 ps = sheetPose(L, slide); return ps.xy + rot(-ps.z) * q * L.S; }
vec2 screenToSheet(Layout L, vec2 p, float slide) { vec3 ps = sheetPose(L, slide); return rot(ps.z) * (p - ps.xy) / L.S; }
// the lamp's light on the table and the paper, warm and falling off towards the edges
vec3 lampLight(Layout L, vec2 p) {
  vec2 d = (p - L.lamp) / max(L.S, 0.3);
  return vec3(1.0, 0.92, 0.78) * (0.36 + 0.74 * exp(-dot(d, d) * 0.38));
}
// where the nibs are (sheet coordinates), back pen-seconds ago, and how far the pens are lifted;
// while a sheet is pulled away the machine eases from the old figure into the new one
void machineAt(St s, float back, out vec2 qa, out vec2 qb, out float lift) {
  Sheet sh = sheetOf(s.serial);
  qa = figureA(sh, s.tauS - back, s.A, s.th);
  qb = figureB(sh, s.tauS - back, s.A, s.th);
  lift = 0.0;
  if (s.slide > 0.0) {
    Sheet nx = sheetOf(s.serial + 1.0);
    float tn = (s.slide - 1.0) * T_SLIDE * penRate() - back;
    float k = ss(0.2, 0.95, s.slide);
    qa = mix(qa, figureA(nx, tn, A0, 0.0), k);
    qb = mix(qb, figureB(nx, tn, A0, 0.0), k);
    lift = ss(0.0, 0.12, s.slide) * ss(1.0, 0.86, s.slide);
  }
}
float shutter() { return 0.5 / 60.0 * penRate(); }   // the arms are blurred over half a frame
const vec2 SHADOW_DIR = vec2(0.55, -0.42);            // where shadows fall, per unit of height
`;

// ── the simulation: the record and the machine's state ────────────────────────────────────────
const sim = `${COMMON}
vec4 packSt(St s, int k) {
  if (k == 0) return vec4(toHiLo(s.tauS / 32.0), toHiLo(s.tauD / 32.0));
  if (k == 1) return vec4(toHiLo(s.A / 2.0), toHiLo(mod(s.th, TAU) / TAU));
  if (k == 2) return vec4(toHiLo(s.time / 1024.0), s.P, s.F);
  return vec4(s.pend, s.slide, s.serial, s.beats * 32.0 + s.lastBeat);
}
float gBass, gMid, gHigh;
void signals() {
  gBass = uAudioActive * clamp(uBass * 1.3, 0.0, 1.0);
  gMid = uAudioActive * clamp(uMid * 1.4, 0.0, 1.0);
  gHigh = uAudioActive * clamp(uHigh * 1.6, 0.0, 1.0);
}
// the swing tau pen-seconds into a sheet that started at A0, decaying at D and pushed by P on a grid
// of beats every tb, the latest at tl; since = pen time since the latest push before tau
float swingAt(float tau, float D, float P, float tb, float tl, float ramp, out float since) {
  float a = A0 * exp(-D * tau);
  since = 1e3;
  float m = max(ceil((tl - tau) / tb), 0.0);
  float tm = tl - m * tb;
  if (tm < 0.0 || P <= 0.0) return a;
  since = tau - tm;
  float n = floor(tm / tb) + 1.0;
  float r = exp(-D * tb);
  float older = n > 1.0 ? r * (1.0 - pow(r, n - 1.0)) / (1.0 - r) : 0.0;
  return a + P * exp(-D * since) * (older + 1.0 - exp(-since / ramp));
}
// What the sheet on the table would look like if the machine had been running all along, as if the
// past sounded like the present: used when the scene comes on or the screen changes shape.
St reconstruct(out float D, out float P, out float tb, out float tl, out float rate) {
  float act = uAudioActive;
  rate = penRate();
  D = mix(DSIL, DMUS + 0.08 * gBass, act) / rate;         // per pen-second
  P = PUSH * act * 0.85 * max(uPunch, 0.5);           // a typical beat's push
  St s;
  float E, len, key;
  if (act > 0.5) {
    float k = mod(uBeatCount + OFF, BEATS);
    E = k * 0.5 + min(uBeatAge, 0.5);
    len = BEATS * 0.5;
    key = floor((uBeatCount + OFF) / BEATS);
    s.beats = k;
  } else {
    len = TSIL / 0.6 + T_SLIDE;
    E = mod(uTime, len);
    key = floor(uTime / len);
    s.beats = 0.0;
    P = 0.0;
  }
  float Eb = E;                                       // seconds since this sheet's beats began
  if (E < T_SLIDE) {                                  // the last sheet is still being pulled away
    s.slide = max(E / T_SLIDE, 1e-3);
    key -= 1.0;
    s.tauD = min((len - T_SLIDE) * rate, TCAP);
    s.tauS = s.tauD + E * rate;
    Eb = E + len;
  } else {
    s.slide = 0.0;
    s.tauD = min((E - T_SLIDE) * rate, TCAP - 0.01);
    s.tauS = s.tauD;
  }
  s.serial = mod(key, 256.0);
  tb = 0.5 * rate;
  tl = (Eb - min(uBeatAge, 0.5) - T_SLIDE) * rate;    // the latest beat, in the sheet's pen time
  float since;
  s.A = min(swingAt(s.tauS, D, P, tb, tl, RAMP * rate, since), AMAX);
  s.pend = P * exp(-min(uBeatAge, 2.0) / RAMP);
  s.th = mod(drift(sheetOf(s.serial), gMid) * s.tauS, TAU);
  s.time = mod(uTime, 1024.0);
  s.P = clamp(P0 + 0.85 * gBass, 0.0, 1.0);
  s.F = clamp(F0 + 0.8 * gHigh, 0.0, 1.0);
  s.lastBeat = mod(uBeatCount, 32.0);
  return s;
}
// one frame of the machine: the clock, the beats, the swing, the turn, the sheets
St advance(St o, out bool fresh) {
  St s = o;
  fresh = false;
  float now = mod(uTime, 1024.0);
  float dt = mod(now - o.time + 1024.0, 1024.0);
  if (dt < 1e-4 || dt > 512.0) { s.time = now; return s; }        // a second step in the same frame
  dt = min(dt, 0.25);
  s.time = now;
  float act = uAudioActive;
  float dtau = dt * penRate();
  float cnt = mod(uBeatCount, 32.0);
  float nb = act > 0.5 ? mod(cnt - o.lastBeat + 32.0, 32.0) : 0.0;
  if (nb > 8.0) nb = 0.0;                                         // a jump, not beats
  s.lastBeat = cnt;
  s.beats = min(o.beats + nb, BEATS);
  s.pend = o.pend + min(nb, 1.0) * PUSH * act * (0.4 + 0.6 * clamp(uBeat, 0.0, 1.0)) * max(uPunch, 0.5);
  float inflow = s.pend * (1.0 - exp(-dt / RAMP));
  s.pend -= inflow;
  float D = mix(DSIL, DMUS + 0.08 * gBass, act);
  s.A = min(o.A * exp(-D * dt) + inflow, AMAX);
  s.th = mod(o.th + drift(sheetOf(o.serial), gMid) * dtau, TAU);
  s.P = clamp(P0 + 0.85 * gBass, 0.0, 1.0);
  s.F = clamp(F0 + 0.8 * gHigh, 0.0, 1.0);
  s.tauS = o.tauS + dtau;
  if (o.slide > 0.0) {
    s.slide = o.slide + dt / T_SLIDE;
    if (s.slide >= 1.0) {                                         // a fresh sheet: the pens come down
      s.serial = mod(o.serial + 1.0, 256.0);
      s.tauS = 0.0; s.tauD = 0.0; s.A = A0; s.pend = 0.0; s.th = 0.0; s.slide = 0.0;
      fresh = true;
    }
  } else {
    s.tauD = min(s.tauS, TCAP);
    // done after 32 beats, when the record is full, when the swing has died away (music with no
    // beats to push it), or in silence after TSIL
    if (s.beats >= BEATS || s.tauS >= TCAP || s.A < AMIN || (act < 0.5 && s.tauS >= TSIL)) { s.slide = 1e-3; s.beats = 0.0; }
  }
  return s;
}
void main() {
  signals();
  ivec2 c = ivec2(gl_FragCoord.xy);
  int w = int(uStateRes.x + 0.5);
  int n = c.y * w + c.x;
  if (n >= 2052) { outColor = vec4(0.0); return; }
  if (uSimFrame < 0.5) {
    float D, P, tb, tl, rate;
    St s = reconstruct(D, P, tb, tl, rate);
    if (n >= 2048) { outColor = packSt(s, n - 2048); return; }
    float ti = min(float(n) * DREC, s.tauD);
    float since;
    float A = min(swingAt(ti, D, P, tb, tl, RAMP * rate, since), AMAX);
    // the pressure surges after each beat; the fine pen opens on the off-beat hats
    float kick = since < 100.0 ? exp(-since / (0.14 * rate)) : 0.0;
    float pr = P0 + 0.85 * clamp(gBass * (0.3 + 0.9 * kick), 0.0, 1.0);
    float hat = exp(-mod((since < 100.0 ? since : ti) + 0.125 * rate, 0.25 * rate) / (0.05 * rate));
    float fl = clamp(F0 + 0.8 * gHigh * (0.2 + 0.8 * hat), 0.0, 1.0);
    outColor = packRec(A, mod(drift(sheetOf(s.serial), gMid) * ti, TAU), pr, fl);
    return;
  }
  St o = readSt();
  bool fresh;
  St s = advance(o, fresh);
  if (n >= 2048) { outColor = packSt(s, n - 2048); return; }
  vec4 e = stateAt(c);
  float ti = float(n) * DREC;
  if (fresh) {
    if (n <= 1) e = packRec(s.A, s.th, s.P, s.F);
  } else if (s.tauD > o.tauD) {
    // the pen moved on: write the entries it passed (and the one ahead) from last frame's values to this one's
    if (ti >= floor(o.tauD / DREC) * DREC - 1e-5 && ti <= s.tauD + DREC) {
      float f = clamp((ti - o.tauD) / (s.tauD - o.tauD), 0.0, 1.0);
      float dth = s.th - o.th;
      dth -= TAU * floor(dth / TAU + 0.5);
      e = packRec(mix(o.A, s.A, f), mod(o.th + dth * f + TAU, TAU), mix(o.P, s.P, f), mix(o.F, s.F, f));
    }
  }
  outColor = e;
}
`;

const ARM = `
// ── shared by the picture and the ink: how much of a pen arm covers p ──
// The rod runs from the nib back through the swivel on its post and on out of the frame. It is swept
// about the post from where it was (nib0) to where it is (nib1), and the collar smeared between the
// two, so a fast pen blurs instead of jumping. Any unit; px is a pixel in it. moved: how far the rod
// travelled at p.
float segd(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-12), 0.0, 1.0)); }
float rodSweep(vec2 p, vec2 post, vec2 nib0, vec2 nib1, float hw, float px, out float moved) {
  vec2 d = p - post + vec2(1e-5 * px, 0.0);                  // never both zero for atan
  float r = max(length(d), 1e-6);
  vec2 a0 = normalize(nib0 - post), a1 = normalize(nib1 - post);
  float D = atan(a0.x * a1.y - a0.y * a1.x, dot(a0, a1));
  float aw = hw / max(r, hw);
  float hh = max(abs(D) * 0.5, 0.5 * px / r), m = D * 0.5;
  moved = r * abs(D);
  float cr = a0.x * d.y - a0.y * d.x, dt = dot(a0, d);
  float psi = atan(cr, dt);                                   // the nib side
  float cov = clamp((min(psi + aw, m + hh) - max(psi - aw, m - hh)) / (2.0 * hh), 0.0, 1.0);
  float Ln = mix(length(nib0 - post), length(nib1 - post), abs(D) > 1e-6 ? clamp(psi / D, 0.0, 1.0) : 1.0);
  cov *= clamp((Ln - r) / px + 0.5, 0.0, 1.0);
  float pst = atan(-cr, -dt);                                 // the tail, out of the frame
  return max(cov, clamp((min(pst + aw, m + hh) - max(pst - aw, m - hh)) / (2.0 * hh), 0.0, 1.0));
}
float collarSmear(vec2 p, vec2 nib0, vec2 nib1, float rc, float px) {
  return clamp((rc - segd(p, nib0, nib1)) / px + 0.5, 0.0, 1.0) * 2.0 * rc / (2.0 * rc + length(nib1 - nib0));
}
float armSweep(vec2 p, vec2 post, vec2 nib0, vec2 nib1, float hw, float rc, float px, out float moved) {
  return max(rodSweep(p, post, nib0, nib1, hw, px, moved), collarSmear(p, nib0, nib1, rc, px));
}
`;

// ── the ink: one short segment of either pen per point ────────────────────────────────────────
const vert = `${COMMON}
flat out vec4 vSeg;    // the segment's middle and half its length and direction, in pixels
flat out vec4 vInk;    // half width, bleed width, opacity, wetness
flat out vec4 vArmA;   // arm A: its post and its nib now, in pixels
flat out vec4 vArmB;
flat out vec4 vNib0;   // both nibs a shutter ago, in pixels
flat out vec4 vArmW;   // the arms' rod half widths and pen collar radii, in pixels
flat out vec4 vShad;   // shadow offset of the arms (pixels), the pixel size of a unit, which pen
flat out float vSize;
vec2 toPx(vec2 p, float asp) { return (p / vec2(asp, 1.0) * 0.5 + 0.5) * uRes; }
void main() {
  int id = gl_VertexID;
  bool isB = float(id) >= NA;
  float j = isB ? float(id) - NA : float(id);
  float dl = TCAP / (isB ? NB : NA);
  St s = readSt();
  float t0 = j * dl;
  if (t0 >= s.tauD) return;
  float t1 = min(t0 + dl, s.tauD);
  Sheet sh = sheetOf(s.serial);
  vec4 r0 = recAt(t0), r1 = recAt(t1);
  vec2 q0 = isB ? figureB(sh, t0, r0.x, r0.y) : figureA(sh, t0, r0.x, r0.y);
  vec2 q1 = isB ? figureB(sh, t1, r1.x, r1.y) : figureA(sh, t1, r1.x, r1.y);
  float asp = uRes.x / uRes.y;
  Layout L = layoutOf(asp);
  vec2 p0 = sheetToScreen(L, q0, s.slide), p1 = sheetToScreen(L, q1, s.slide);
  vec2 P0 = toPx(p0, asp), P1 = toPx(p1, asp);
  vec2 C = 0.5 * (P0 + P1), h = 0.5 * (P1 - P0);
  float sc = uPointScale;
  float pr = 0.5 * (r0.z + r1.z), fl = 0.5 * (r0.w + r1.w);
  float wet = exp(-(s.tauD - t1) / 0.45);
  // where the pen slows down to turn, the ink pools: the line darkens and spreads a little
  float spd = length(q1 - q0) / max(t1 - t0, 1e-5) / max(0.5 * (r0.x + r1.x) * W, 0.05);
  float pool = 1.0 - ss(0.12, 0.85, spd);
  float hw, bleed, op;
  vec3 T;
  if (isB) {
    hw = (0.55 + 0.6 * fl) * (1.0 + 0.25 * pool) * sc;
    bleed = 0.0;
    op = (0.38 + 0.62 * fl) * (0.85 + 0.15 * pool);
    T = mix(vec3(0.96, 0.34, 0.16), vec3(0.86, 0.13, 0.05), wet);
  } else {
    hw = (0.75 + 1.6 * pr * pr) * (1.0 + 0.3 * pool) * sc;
    bleed = (0.6 + 1.6 * pr) * sc;
    op = min(0.62 + 0.36 * pr + 0.12 * pool, 1.0);
    T = mix(vec3(0.11, 0.14, 0.4), vec3(0.03, 0.05, 0.26), wet);
  }
  hw = max(hw, 0.35);
  float size = ceil(2.0 * (max(abs(h.x), abs(h.y)) + hw + bleed * 2.0 + 1.5));
  if (size > uPointMax) return;
  vec2 mid = 0.5 * (p0 + p1);
  vec3 paper = vec3(0.95, 0.89, 0.76) * lampLight(L, mid);
  vColor = vec4(paper * T, 1.0);
  vSeg = vec4(C, h);
  vInk = vec4(hw, bleed, op, wet);
  // the arms, so the ink goes under them and their shadows
  vec2 qa, qb, pa, pb; float lift;
  machineAt(s, 0.0, qa, qb, lift);
  machineAt(s, shutter(), pa, pb, lift);
  vArmA = vec4(toPx(L.postA, asp), toPx(sheetToScreen(L, qa, 0.0), asp));
  vArmB = vec4(toPx(L.postB, asp), toPx(sheetToScreen(L, qb, 0.0), asp));
  vNib0 = vec4(toPx(sheetToScreen(L, pa, 0.0), asp), toPx(sheetToScreen(L, pb, 0.0), asp));
  float unit = uRes.y * 0.5;                          // pixels per unit of the centred frame
  vArmW = vec4(0.0135, 0.034, 0.009, 0.026) * unit;
  vShad = vec4(SHADOW_DIR * vec2(1.0, 1.0) * (0.05 + 0.04 * lift) * unit, unit, isB ? 1.0 : 0.0);
  vSize = size;
  vec2 cl = C / uRes * 2.0 - 1.0;
  gl_Position = vec4(cl, 0.0, 1.0);
  gl_PointSize = size;
}
`;

const pointFrag = `
flat in vec4 vSeg;
flat in vec4 vInk;
flat in vec4 vArmA;
flat in vec4 vArmB;
flat in vec4 vNib0;
flat in vec4 vArmW;
flat in vec4 vShad;
flat in float vSize;
float ss2(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
float hh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), u.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), u.x), u.y);
}
${ARM}
// how much of an arm's shadow (rod and pen collar, where they are now) covers the pixel p
float armCover(vec2 p, vec4 arm, float hw, float rc) {
  vec2 far = arm.xy + normalize(arm.xy - arm.zw) * 8000.0;
  float d = min(segd(p, far, arm.zw) - hw, length(p - arm.zw) - rc);
  return clamp(0.5 - d, 0.0, 1.0);
}
void main() {
  vec2 o = (gl_PointCoord - 0.5) * vSize * vec2(1.0, -1.0);
  vec2 h = vSeg.zw;
  float hl = length(h);
  vec2 dir = hl > 1e-4 ? h / hl : vec2(1.0, 0.0);
  float u = dot(o, dir), v = dot(o, vec2(-dir.y, dir.x));
  if (u < -hl || u >= hl) discard;                    // every pixel of the line belongs to one segment
  vec2 pix = vSeg.xy + o;
  float hw = vInk.x;
  float body = clamp(hw + 0.5 - abs(v), 0.0, 1.0);
  float fib = vn(pix * 0.45) * 0.6 + vn(pix * 1.3 + 7.0) * 0.4;
  float halo = vInk.y > 0.0 ? exp(-max(abs(v) - hw, 0.0) / vInk.y) * ss2(fib) : 0.0;
  float a = max(body, halo * 0.2) * vInk.z;
  if (a < 0.002) discard;
  // the arms ride above the paper, their shadows fall on the ink
  float mv;
  float over = max(armSweep(pix, vArmA.xy, vNib0.xy, vArmA.zw, vArmW.x, vArmW.y, 1.0, mv),
                   armSweep(pix, vArmB.xy, vNib0.zw, vArmB.zw, vArmW.z, vArmW.w, 1.0, mv));
  float sh = max(armCover(pix - vShad.xy, vArmA, vArmW.x * 1.2, vArmW.y), armCover(pix - vShad.xy, vArmB, vArmW.z * 1.2, vArmW.w));
  a *= 1.0 - over;
  vec3 c = vColor.rgb * (1.0 - 0.4 * sh);
  // wet ink shines along the side that faces the lamp
  float n = clamp(v / max(hw, 0.5), -1.0, 1.0);
  float side = dot(vec2(-dir.y, dir.x), normalize(vec2(-0.6, 0.5)));
  float spec = exp(-pow((n - 0.55 * side) / 0.28, 2.0)) * body * vInk.w * vInk.z * (1.0 - over) * (1.0 - sh);
  outColor = vec4(c * a + vec3(1.0, 0.92, 0.8) * spec * 0.45, a);
}
`;

// ── the picture: the table, the paper, the ports and their bobs, the arms ──────────────────────
const frag = `${COMMON}
float gPx, gAsp;
Layout gL;
St gS;

float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
${ARM}

// dark walnut, one wide slab: the grain combed long across the frame and gently warped, the
// figure of the wood in broad soft bands, lighter streaks, and the open pores along the grain
vec3 walnut(vec2 p) {
  float warp = fbm(p * vec2(0.3, 1.1) + 3.1);
  float y = p.y * 7.0 + warp * 3.2 + 0.5 * sin(p.x * 0.8 + warp * 2.5);
  float band = 0.5 + 0.5 * sin(y * 3.0 + noise(vec2(p.x * 0.8, y)) * 2.5);
  float streak = noise(vec2(p.x * 1.6, y * 4.0));
  float pores = noise(vec2(p.x * 26.0, y * 30.0));
  float tone = fbm(vec2(p.x * 0.4, y * 0.35) + 4.0);
  vec3 c = mix(vec3(0.06, 0.03, 0.017), vec3(0.15, 0.08, 0.043), ss(0.25, 0.75, tone));
  c = mix(c, vec3(0.23, 0.13, 0.068), band * band * 0.35 * ss(0.35, 0.8, tone));
  c *= 0.82 + 0.3 * streak * streak;
  return c * (0.86 + 0.14 * pores);
}
// light on brass: a cylinder (a across it, -1..1, perp the screen direction across it)
vec3 brass(vec3 alb, vec3 n) {
  // polished: mostly what it reflects. Looking straight down, a surface facing up mirrors the dark
  // room above; one tilted towards the lamp catches it, broad and warm, with a hot core
  vec3 L3 = normalize(vec3(-0.5, 0.55, 0.68));
  vec3 R = vec3(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0);
  float c = max(dot(R, L3), 0.0);
  float dif = max(dot(n, L3), 0.0);
  vec3 env = vec3(0.16, 0.12, 0.08) * (0.4 + 0.6 * R.z) + vec3(1.0, 0.82, 0.55) * (0.5 * pow(c, 5.0) + 2.2 * pow(c, 48.0));
  return alb * (0.06 + 0.42 * dif) + alb * env * 1.25;
}
vec3 cylN(float a, vec2 perp) { a = clamp(a, -1.0, 1.0); return normalize(vec3(perp * a, sqrt(max(1.0 - a * a, 0.02)))); }

// ── the pencil note: a small hand, the ratio and the interval's name ──
const int NOTE[80] = int[80](
  2,10,3,0,15,17,15,24,16,-1,-1,-1,-1,-1,-1,-1,
  1,10,1,0,25,20,17,23,21,20,-1,-1,-1,-1,-1,-1,
  1,10,4,0,24,29,21,0,21,12,24,11,26,14,23,-1,
  1,10,2,0,21,12,24,11,26,14,-1,-1,-1,-1,-1,-1,
  1,10,3,0,24,29,14,28,15,24,16,-1,-1,-1,-1,-1);
float adv(int c) {
  if (c == 1 || c == 10 || c == 17) return 0.3;
  if (c == 0) return 0.32;
  if (c == 15 || c == 24) return 0.38;
  if (c == 28) return 0.24;
  if (c == 29) return 0.62;
  if (c == 23) return 0.44;
  return 0.5;
}
// distance to an elliptical arc from angle a0 to a1 (counter-clockwise)
float arc(vec2 p, vec2 c, vec2 r, float a0, float a1) {
  vec2 q = (p - c) / r;
  float an = a0 + mod(atan(q.y, q.x) - a0, TAU);
  if (an > a1) an = (an - a1 < a0 + TAU - an) ? a1 : a0;
  return length(p - c - r * vec2(cos(an), sin(an)));
}
float glyph(int g, vec2 p) {
  float d = 1e3;
  vec2 b = vec2(0.21, 0.25), br = vec2(0.19, 0.25);
  if (g == 1) { d = min(segd(p, vec2(0.15, 0.0), vec2(0.15, 0.8)), segd(p, vec2(0.0, 0.62), vec2(0.15, 0.8))); }
  else if (g == 2) { d = min(arc(p, vec2(0.2, 0.58), vec2(0.19, 0.21), -0.75, 2.9), min(segd(p, vec2(0.33, 0.44), vec2(0.0, 0.0)), segd(p, vec2(0.0, 0.0), vec2(0.42, 0.0)))); }
  else if (g == 3) { d = min(arc(p, vec2(0.18, 0.6), vec2(0.17, 0.19), -1.5708, 2.6), arc(p, vec2(0.18, 0.21), vec2(0.2, 0.21), -2.6, 1.5708)); }
  else if (g == 4) { d = min(segd(p, vec2(0.3, 0.0), vec2(0.3, 0.8)), min(segd(p, vec2(0.3, 0.8), vec2(0.0, 0.25)), segd(p, vec2(0.0, 0.25), vec2(0.42, 0.25)))); }
  else if (g == 10) { d = min(length(p - vec2(0.08, 0.1)), length(p - vec2(0.08, 0.42))) - 0.015; }
  else if (g == 11) { d = min(arc(p, b, br, 0.0, TAU), segd(p, vec2(0.4, 0.5), vec2(0.42, 0.0))); }
  else if (g == 12) { d = arc(p, b, br, 0.6, TAU - 0.6); }
  else if (g == 14) { d = min(segd(p, vec2(0.04, 0.26), vec2(0.4, 0.28)), arc(p, b, br, 0.15, TAU - 0.7)); }
  else if (g == 15) { d = min(min(segd(p, vec2(0.17, 0.0), vec2(0.17, 0.62)), arc(p, vec2(0.3, 0.62), vec2(0.13, 0.2), 0.4, PI)), segd(p, vec2(0.03, 0.45), vec2(0.33, 0.45))); }
  else if (g == 16) { d = min(min(segd(p, vec2(0.05, 0.0), vec2(0.05, 0.85)), arc(p, vec2(0.23, 0.27), vec2(0.18, 0.2), 0.0, PI)), segd(p, vec2(0.41, 0.27), vec2(0.41, 0.0))); }
  else if (g == 17) { d = min(segd(p, vec2(0.08, 0.0), vec2(0.08, 0.48)), length(p - vec2(0.09, 0.68)) - 0.01); }
  else if (g == 20) { d = min(min(segd(p, vec2(0.04, 0.0), vec2(0.04, 0.5)), arc(p, vec2(0.21, 0.29), vec2(0.17, 0.19), 0.0, PI)), segd(p, vec2(0.38, 0.29), vec2(0.38, 0.0))); }
  else if (g == 21) { d = arc(p, b, br, 0.0, TAU); }
  else if (g == 23) { d = min(arc(p, vec2(0.18, 0.37), vec2(0.14, 0.12), 0.35, 4.712), arc(p, vec2(0.18, 0.13), vec2(0.14, 0.12), -2.8, 1.5708)); }
  else if (g == 24) { d = min(min(segd(p, vec2(0.15, 0.75), vec2(0.15, 0.08)), arc(p, vec2(0.27, 0.08), vec2(0.12, 0.08), PI, 5.6)), segd(p, vec2(0.02, 0.48), vec2(0.32, 0.5))); }
  else if (g == 25) { d = min(min(segd(p, vec2(0.04, 0.5), vec2(0.04, 0.2)), arc(p, vec2(0.2, 0.2), vec2(0.16, 0.2), PI, TAU)), segd(p, vec2(0.36, 0.5), vec2(0.37, 0.0))); }
  else if (g == 26) { d = min(segd(p, vec2(0.0, 0.5), vec2(0.19, 0.0)), segd(p, vec2(0.19, 0.0), vec2(0.38, 0.5))); }
  else if (g == 28) { d = segd(p, vec2(0.07, 0.0), vec2(0.07, 0.85)); }
  else if (g == 29) { d = min(min(segd(p, vec2(0.0, 0.5), vec2(0.12, 0.0)), segd(p, vec2(0.12, 0.0), vec2(0.25, 0.36))), min(segd(p, vec2(0.25, 0.36), vec2(0.38, 0.0)), segd(p, vec2(0.38, 0.0), vec2(0.5, 0.5)))); }
  return d;
}
// the note's pencil cover at q (sheet coordinates), in the top right corner; reveal 0..1 writes
// it in from the left
float note(vec2 q, int k, float reveal, float pxq) {
  const float G = 0.088;                              // sheet half-widths per glyph unit
  float total = 0.0;
  for (int i = 0; i < 16; i++) { int c = NOTE[k * 16 + i]; if (c < 0) break; total += adv(c); }
  vec2 o = vec2(0.92 - total * G, 0.82);
  vec2 p = (q - o) / G;
  if (p.x < -0.3 || p.x > total + 0.3 || p.y < -0.45 || p.y > 1.05) return 0.0;
  p.x -= 0.18 * p.y;                                  // the hand leans
  float d = 1e3, x = 0.0;
  for (int i = 0; i < 16; i++) {
    int c = NOTE[k * 16 + i];
    if (c < 0) break;
    if (x > reveal * total + 0.2) break;
    float wob = (hash11(float(i) * 3.7 + float(k)) - 0.5) * 0.06;
    if (c > 0 && abs(p.x - x - 0.25) < 0.7) d = min(d, glyph(c, p - vec2(x, wob)));
    x += adv(c);
  }
  float wpx = pxq / G;                                // a pixel in glyph units
  float cov = ss(0.04 + wpx, 0.04 - wpx * 0.5, d);
  return cov * ss(reveal * total + 0.25, reveal * total - 0.1, p.x);
}

// a port in the table with a pendulum hanging through it. c its centre, R its radius, dir the way
// this pendulum swings, sw and pw its swing now and a frame ago (-1..1)
vec3 port(vec2 p, vec3 col, vec2 c, float R, vec2 dir, float sw, float pw) {
  vec2 h = (p - c) / R;
  float r = length(h);
  if (r > 1.3) return col;
  float pxr = gPx / R;
  vec2 dp = vec2(-dir.y, dir.x);
  // looking down at a slant: what is deeper sits nearer the middle of the frame, and smaller
  vec2 toward = -c / max(length(c), 1e-3);
  vec2 ob = toward * 0.08, of = toward * 0.2;
  float kb = 0.84, kf = 0.62;
  if (r < 1.0 + pxr) {
    // the floor far below: dark boards, the lamp's light through the hole lying on them
    vec2 fq = (h - of) / kf;
    float pool = ss(1.2, 0.5, length(fq - SHADOW_DIR * 0.75));
    float boards = 0.75 + 0.25 * ss(0.05, 0.0, abs(fract(fq.x * 1.4 + 0.3) - 0.5) - 0.46) + 0.12 * noise(fq * vec2(8.0, 1.0));
    vec3 under = vec3(0.08, 0.045, 0.026) * boards * (0.14 + 1.6 * pool);
    // the swing, in the hole's units, now and a frame ago
    vec2 bw = dir * sw * 0.44, pwv = dir * pw * 0.44;
    vec2 bp = ob + bw * kb, pp = ob + pwv * kb;
    // on the floor: the shadows of the bob (smeared by its swing) and of the bridge
    vec2 sf = (bw * kb + ob - of) / kf + SHADOW_DIR * 0.95, sf0 = (pwv * kb + ob - of) / kf + SHADOW_DIR * 0.95;
    float shade = 1.0 - ss(0.2, 0.62, segd(fq, sf0, sf));
    vec2 fb = (h - SHADOW_DIR * 0.5) ;
    shade = max(shade, ss(0.1, -0.05, sdBox(vec2(dot(fb, dp), dot(fb, dir)), vec2(1.1, 0.07))));
    under *= 1.0 - 0.85 * pool * shade;
    // the rod, from the pivot down to the bob
    under = mix(under, vec3(0.2, 0.14, 0.07), ss(0.035 + pxr, 0.035 - pxr, segd(h, vec2(0.0), bp)));
    // the bob: a heavy polished brass ball, smeared over the frame by its swing
    float bobR = 0.44 * kb;
    float sm = length(bp - pp);
    float bcov = ss(bobR + pxr * 1.5, bobR - pxr * 1.5, segd(h, pp, bp));
    if (bcov > 0.0) {
      vec2 bl = (h - bp) / bobR;
      float rr = min(dot(bl, bl), 1.0);
      vec3 n = vec3(bl * (1.0 - 0.02 * rr), sqrt(max(1.0 - rr, 0.0004)));
      n = normalize(n);
      vec3 bc = brass(vec3(0.8, 0.57, 0.24), n);
      bc *= 0.55 + 0.45 * ss(1.0, 0.35, rr);                           // deep in the shaft, its edge falls dark
      bc = mix(bc, vec3(0.06, 0.04, 0.025), ss(0.03, 0.015, rr));        // the rod's nut on top
      under = mix(under, bc, bcov * 2.0 * bobR / (2.0 * bobR + sm));
    }
    // the hole's own wall on the far side, lit from the lamp on the near one
    float wall = ss(0.0, 0.07, length(h - toward * 0.07) - 0.93);
    under = mix(under, vec3(0.05, 0.026, 0.014) * (0.6 + 0.8 * max(dot(normalize(h + 1e-4), -SHADOW_DIR / length(SHADOW_DIR)), 0.0)), wall);
    // the bridge across the hole, along the knife edge's axis, with the pivot block in the middle
    vec2 hb = vec2(dot(h, dp), dot(h, dir));
    float bar = sdBox(hb, vec2(1.1, 0.06));
    float blk = sdBox(hb, vec2(0.16, 0.12)) - 0.03;
    float d = min(bar, blk);
    float bcv = ss(pxr, -pxr, d);
    if (bcv > 0.0) {
      float w = blk < bar ? 0.15 : 0.06;
      vec3 bn = cylN(hb.y / w, dir);
      vec3 bb = brass(vec3(0.66, 0.47, 0.19), bn) * (blk < bar ? 1.0 : 0.88);
      bb *= 1.0 - 0.4 * ss(0.012, 0.0, abs(blk));                          // the block's edge
      under = mix(under, bb, bcv);
    }
    col = mix(col, under, ss(1.0 + pxr, 1.0 - pxr, r));
  }
  // a turned brass rim, its bead lit from the upper left, a dark line where it meets the wood
  float rim = ss(1.16 + pxr, 1.16 - pxr, r) * ss(0.99 - pxr, 0.99 + pxr, r);
  col *= 1.0 - 0.55 * ss(1.28, 1.15, length(h - SHADOW_DIR * 0.08)) * (1.0 - rim) * step(1.0, r);
  if (rim > 0.0) {
    float a = (r - 1.075) / 0.085;
    vec3 n = normalize(vec3(h / max(r, 1e-3) * a * 0.9, sqrt(max(1.0 - a * a * 0.81, 0.05))));
    col = mix(col, brass(vec3(0.72, 0.5, 0.2), n), rim);
  }
  return col;
}

// a drafting pencil lying on the table: a green lacquered hexagonal body, a gilt band near its end,
// a cone of bare cedar and the graphite point. c its middle, a the way it points, L its half length
vec3 pencil(vec2 p, vec3 col, vec2 c, vec2 a, float L) {
  vec2 n = vec2(-a.y, a.x), d = p - c;
  if (dot(d, d) > (L + 0.08) * (L + 0.08)) return col;
  const float R = 0.017, CL = 0.075;
  // its shadow on the wood
  vec2 ds = d - SHADOW_DIR * 0.028;
  float us = dot(ds, a), vs = abs(dot(ds, n));
  float wsh = R * clamp((L - us) / CL, 0.0, 1.0);
  col *= 1.0 - 0.5 * ss(0.012, -0.006, max(vs - wsh, abs(us) - L));
  float u = dot(d, a), v = dot(d, n);
  float w = R * clamp((L - u) / CL, 0.0, 1.0);
  float cov = ss(gPx, -gPx, max(abs(v) - w, abs(u) - L));
  if (cov <= 0.0) return col;
  float f = v / max(w, 1e-4);                                        // -1 .. 1 across it
  vec3 L3 = normalize(vec3(-0.5, 0.55, 0.68));
  vec3 c3;
  if (u < L - CL) {
    // three faces of the hexagon show from above
    float side = f > 0.5 ? 1.0 : (f < -0.5 ? -1.0 : 0.0);
    vec3 nn = normalize(vec3(n * side * 0.87, side == 0.0 ? 1.0 : 0.5));
    float dif = max(dot(nn, L3), 0.0);
    float sp = pow(max(dot(nn, normalize(L3 + vec3(0.0, 0.0, 1.0))), 0.0), 60.0);
    c3 = vec3(0.035, 0.17, 0.09) * (0.35 + dif) + vec3(1.0, 0.9, 0.75) * sp * 0.5;
    c3 *= 1.0 - 0.35 * ss(0.06, 0.0, abs(abs(f) - 0.5));                  // the edges between faces
    float band = ss(0.002, 0.0, abs(u + L - 0.04) - 0.008);
    c3 = mix(c3, brass(vec3(0.8, 0.6, 0.25), nn) * 0.9, band);
    c3 *= 0.75 + 0.25 * ss(-L, -L + 0.006, u);                            // the end, cut square
  } else {
    // the sharpened cone: scalloped cedar, then graphite
    float k = (u - (L - CL)) / CL;
    vec3 nn = normalize(vec3(n * f * 0.8 + a * 0.35, 1.0));
    float dif = max(dot(nn, L3), 0.0);
    vec3 wood = vec3(0.62, 0.42, 0.24) * (0.45 + 0.75 * dif) * (0.9 + 0.1 * sin(f * 9.0));
    vec3 lead = vec3(0.09, 0.09, 0.1) * (0.5 + dif) + vec3(0.6) * pow(max(dot(nn, normalize(L3 + vec3(0.0, 0.0, 1.0))), 0.0), 30.0) * 0.3;
    c3 = mix(wood, lead, ss(0.68, 0.72, k));
    c3 *= 1.0 - 0.25 * ss(0.02, 0.0, k);                                  // where the lacquer stops
  }
  return mix(col, c3, cov);
}

// one pen arm: a brass rod from the nib back through the swivel on its post and on out of the
// frame, a counterweight on the tail, the collar holding the pen. hw rod half width, rc collar radius;
// nib0 is where the nib was a shutter ago: the rod and the collar blur over the way they moved
vec4 arm(vec2 p, vec2 post, vec2 nib0, vec2 nib, float hw, float rc, vec3 rodAlb, vec3 cap) {
  vec2 ax = normalize(nib - post), pr = vec2(-ax.y, ax.x);
  vec2 d = p - nib;
  float along = -dot(d, ax), across = dot(d, pr);
  float toPost = length(post - nib);
  vec4 res = vec4(0.0);
  float moved;
  float rod = rodSweep(p, post, nib0, nib, hw, gPx, moved);
  if (rod > 0.0) {
    vec3 sharp = brass(rodAlb, cylN(across / hw, pr));
    vec3 blur = brass(rodAlb, vec3(0.0, 0.0, 1.0)) * 0.9;
    res = vec4(mix(blur, sharp, ss(3.0 * gPx, 0.5 * gPx, moved)), rod);
  }
  // the counterweight, a short brass cylinder clamped round the tail, just behind the post
  float cwA = toPost + 0.17, cwL = 0.045, cwR = hw * 2.6;
  float cw = ss(gPx, -gPx, sdBox(vec2(along - cwA, across), vec2(cwL, cwR)) - 0.004);
  if (cw > 0.0) {
    vec3 c = brass(vec3(0.66, 0.46, 0.18), cylN(across / cwR, pr));
    c *= 0.86 + 0.14 * ss(0.005, 0.0, abs(abs(along - cwA) - cwL + 0.008));
    res = vec4(mix(res.rgb, c, cw), max(res.a, cw));
  }
  // the swivel post: a turned column with a block the rod slides through
  vec2 dp = p - post;
  float pr2 = length(dp);
  float col0 = ss(0.05 + gPx, 0.05 - gPx, pr2);
  if (col0 > 0.0) {
    float a = clamp(pr2 / 0.05, 0.0, 1.0);
    vec3 c = brass(vec3(0.6, 0.42, 0.17), normalize(vec3(dp / max(pr2, 1e-4) * a * 0.7, 1.0))) * (0.8 + 0.2 * cos(a * 18.0));
    res = vec4(mix(res.rgb, c, col0), max(res.a, col0));
  }
  float blk = ss(gPx, -gPx, sdBox(vec2(along - toPost, across), vec2(0.04, hw * 1.9)) - 0.004);
  if (blk > 0.0) res = vec4(mix(res.rgb, brass(vec3(0.68, 0.48, 0.19), cylN(across / (hw * 1.9), pr)) * 0.95, blk), max(res.a, blk));
  // the clamp that holds the pen collar on the rod (lost in the blur when the pen moves fast)
  float sm = length(nib - nib0);
  float cl = ss(gPx, -gPx, sdBox(vec2(along - rc * 1.25, across), vec2(rc * 0.5, hw * 1.6)) - 0.003) * ss(4.0 * gPx, gPx, sm);
  if (cl > 0.0) res = vec4(mix(res.rgb, brass(vec3(0.6, 0.42, 0.17), cylN(across / (hw * 1.6), pr)) * 0.9, cl), max(res.a, cl));
  // the collar and the pen standing in it, seen from above, smeared along its way
  float col = collarSmear(p, nib0, nib, rc, gPx);
  if (col > 0.0) {
    vec2 ba = nib - nib0;
    vec2 dc = p - (nib0 + ba * clamp(dot(p - nib0, ba) / max(dot(ba, ba), 1e-12), 0.0, 1.0));
    float r = length(dc);
    float a = clamp((r - rc * 0.8) / (rc * 0.2), -1.0, 1.0);
    vec3 c = brass(vec3(0.74, 0.53, 0.22), normalize(vec3(dc / max(r, 1e-4) * a * 0.9, sqrt(max(1.0 - a * a * 0.81, 0.05)))));
    float capR = rc * 0.6;
    float inCap = ss(capR + gPx, capR - gPx, r);
    vec3 cn = normalize(vec3(dc / capR * 0.7, 1.0));
    vec3 capC = cap * (0.3 + 0.8 * max(dot(cn, normalize(vec3(-0.5, 0.55, 0.68))), 0.0)) + vec3(1.0, 0.95, 0.85) * pow(max(dot(cn, normalize(vec3(-0.25, 0.28, 1.0))), 0.0), 60.0) * 0.9;
    c = mix(c, capC, inCap);
    res = vec4(mix(res.rgb, c, col), max(res.a, col));
  }
  return res;
}
// the shadow an arm throws on what is below it (cover 0..1); off how far the rod's shadow falls;
// blur how far the nib moved in the shutter: a moving arm's shadow spreads and grows fainter
float armShadow(vec2 p, vec2 post, vec2 nib, float hw, float rc, vec2 off, float blur) {
  vec2 q = p - off;
  float soft = 0.005 + length(off) * 0.12;
  vec2 ax = normalize(nib - post);
  float along = -dot(q - nib, ax), across = dot(q - nib, vec2(-ax.y, ax.x));
  float toPost = length(post - nib);
  float sp = blur * 0.8 * clamp(along / max(toPost, 1e-3), 0.0, 1.0);   // the spread, nothing at the post
  float d = along > 0.0 ? abs(across) - hw - sp : length(q - nib) - hw - blur * 0.8;
  float k = (hw + soft) / (hw + soft + (along > 0.0 ? sp : blur * 0.8));
  d = min(d, length(q - nib) - rc - blur * 0.8);
  d = min(d, segd(p, nib, nib + off) - rc * 0.32 - blur * 0.8);    // the pen, standing on the paper
  float sh = ss(soft, -soft, d) * k;
  float dd = min(sdBox(vec2(along - toPost - 0.17, across), vec2(0.045, hw * 2.6)),
                 segd(p, post, post + off * 1.2) - 0.045);           // the counterweight and the post
  return max(sh, ss(soft, -soft, dd));
}

void main() {
  vec2 uv = centered();
  gAsp = uRes.x / uRes.y;
  gPx = 2.0 / uRes.y;
  gL = layoutOf(gAsp);
  gS = readSt();
  float dither = (hash21(gl_FragCoord.xy + fract(uTime) * 17.0) - 0.5) / 255.0;

  // the machine now: where the nibs are, and how the two pendulums swing (now and a frame ago)
  vec2 qa, qb, pa, pb; float lift;
  machineAt(gS, shutter(), pa, pb, lift);
  machineAt(gS, 0.0, qa, qb, lift);
  vec2 nibA = sheetToScreen(gL, qa, 0.0), nibB = sheetToScreen(gL, qb, 0.0);
  vec2 nibA0 = sheetToScreen(gL, pa, 0.0), nibB0 = sheetToScreen(gL, pb, 0.0);
  Sheet sh = sheetOf(gS.serial);
  float frameTau = penRate() / 60.0;
  float x1, y1, x0, y0; vec2 rr;
  swingsAt(sh, gS.tauS, x1, y1, rr);
  swingsAt(sh, gS.tauS - frameTau, x0, y0, rr);
  y1 = sin(sh.ab.y * (1.0 + sh.det) * sh.om * gS.tauS + sh.p2 + gS.th) * exp(-sh.dy * gS.tauS);
  y0 = sin(sh.ab.y * (1.0 + sh.det) * sh.om * (gS.tauS - frameTau) + sh.p2 + gS.th) * exp(-sh.dy * gS.tauS);
  x1 *= gS.A; y1 *= gS.A; x0 *= gS.A; y0 *= gS.A;
  if (gS.slide > 0.0) {
    Sheet nx = sheetOf(gS.serial + 1.0);
    float tn = (gS.slide - 1.0) * T_SLIDE * penRate();
    float nx1, ny1, nx0, ny0;
    swingsAt(nx, tn, nx1, ny1, rr);
    swingsAt(nx, tn - frameTau, nx0, ny0, rr);
    float k = ss(0.2, 0.95, gS.slide);
    x1 = mix(x1, nx1 * A0, k); y1 = mix(y1, ny1 * A0, k); x0 = mix(x0, nx0 * A0, k); y0 = mix(y0, ny0 * A0, k);
  }

  // the table under the lamp, with a soft reflection of the lamp in its varnish
  vec3 lt = lampLight(gL, uv);
  vec3 wood = walnut(uv * 1.15);
  vec3 col = wood * lt * 1.4;
  // the lamp's reflection in the varnish: broad and soft, broken up a little by the open grain
  vec2 hl = (uv - (gL.lamp + vec2(-0.25, 0.35) * gL.S)) / vec2(1.0, 0.65);
  col += vec3(0.2, 0.13, 0.075) * exp(-dot(hl, hl)) * (0.55 + 0.45 * noise(uv * vec2(2.0, 16.0))) * (0.6 + 2.0 * wood.r);

  // the ports, the pendulums under the table: the first swings the pen across, the second up and down
  vec2 dx = rot(-gL.ang) * vec2(1.0, 0.0), dy = rot(-gL.ang) * vec2(0.0, 1.0);
  col = port(uv, col, gL.port1, gL.portR, dx, x1, x0);
  col = port(uv, col, gL.port2, gL.portR, dy, y1, y0);
  // the pencil that wrote the note, put down beside the machine
  if (gAsp >= 1.0) col = pencil(uv, col, vec2(gL.port2.x, gL.port2.y - gL.portR * 1.2 - 0.12), normalize(vec2(-0.96, 0.28)), min(0.19, (gAsp - gL.S) * 0.45));
  else col = pencil(uv, col, vec2(0.02, -gL.S - (1.0 - gL.S) * 0.66), normalize(vec2(0.98, 0.16)), min(0.2, gAsp * 0.36));

  // the pad of paper: a few sheets under the top one, their edges just showing, and its shadow
  vec2 qr = screenToSheet(gL, uv, 0.0);
  float pxq = gPx / gL.S;
  col *= mix(0.5, 1.0, ss(-0.01, 0.06, sdBox(qr - vec2(0.02, -0.03), vec2(1.0))));
  for (int k = 3; k >= 1; k--) {
    vec2 off = vec2(0.0035, -0.0045) * float(k);
    float e = ss(pxq, -pxq, sdBox(qr - off, vec2(1.0)));
    col = mix(col, vec3(0.86, 0.8, 0.68) * lt * (0.82 - 0.06 * float(k)), e);
  }
  vec3 paper = vec3(0.95, 0.89, 0.76);
  float fib = noise(qr * 150.0) * 0.5 + noise(qr * 47.0 + 3.0) * 0.5;
  float inRest = ss(pxq, -pxq, sdBox(qr, vec2(1.0)));
  vec3 restC = paper * lt * (0.965 + 0.05 * fib) * (1.0 - 0.06 * ss(0.9, 1.0, max(abs(qr.x), abs(qr.y))));
  col = mix(col, restC, inRest);
  // the top sheet: the one being drawn on, or the finished one being pulled away
  if (gS.slide > 0.0) {
    vec2 qt = screenToSheet(gL, uv, gS.slide);
    float e = ss(0.0, 1.0, gS.slide);
    vec2 sq = screenToSheet(gL, uv - SHADOW_DIR * (0.01 + 0.05 * e), gS.slide);
    col *= mix(0.55, 1.0, ss(-0.02 - 0.04 * e, 0.04 + 0.06 * e, sdBox(sq, vec2(1.0))));
    float inTop = ss(pxq, -pxq, sdBox(qt, vec2(1.0)));
    float fibT = noise(qt * 150.0) * 0.5 + noise(qt * 47.0 + 3.0) * 0.5;
    col = mix(col, paper * lt * (0.965 + 0.05 * fibT) * (1.0 - 0.06 * ss(0.9, 1.0, max(abs(qt.x), abs(qt.y)))), inTop);
    float pn = note(qt, sh.k, 1.0, pxq);                           // the old sheet carries its note away
    col = mix(col, col * vec3(0.4, 0.4, 0.44), pn * (0.6 + 0.35 * fibT) * inTop);
  } else {
    float pn = note(qr, sh.k, clamp(gS.tauD / 1.1, 0.0, 1.0), pxq);   // written in as the sheet starts
    col = mix(col, col * vec3(0.4, 0.4, 0.44), pn * (0.6 + 0.35 * fib) * inRest);
  }

  // the arms: their shadows first, then the arms themselves
  vec2 off = SHADOW_DIR * (0.05 + 0.04 * lift);
  float shA = armShadow(uv, gL.postA, 0.5 * (nibA + nibA0), 0.0135, 0.034, off, 0.5 * length(nibA - nibA0));
  float shB = armShadow(uv, gL.postB, 0.5 * (nibB + nibB0), 0.009, 0.026, off, 0.5 * length(nibB - nibB0));
  col *= 1.0 - 0.42 * max(shA, shB);
  vec4 aB = arm(uv, gL.postB, nibB0, nibB, 0.009, 0.026, vec3(0.6, 0.6, 0.58), vec3(0.75, 0.12, 0.05));
  col = mix(col, aB.rgb, aB.a);
  vec4 aA = arm(uv, gL.postA, nibA0, nibA, 0.0135, 0.034, vec3(0.72, 0.52, 0.22), vec3(0.06, 0.08, 0.3));
  col = mix(col, aA.rgb, aA.a);

  outColor = vec4(max(col + dither, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'harmonograph',
  name: 'Harmonograph',
  group: 'Lab',
  blurb: 'A pendulum drawing machine on a walnut table: bass presses the ink, mids turn the figure, highs open a red pen, beats push the bobs',
  tags: ['geometric', 'science', 'drawing', 'calm'],
  energy: 0.35,
  particles: 0,
  trails: 0,
  zoom: 1,
  spin: 0,
  frag,
  points: { count: 20000, vert, frag: pointFrag, blend: 'alpha' },
  sim: { height: 128, steps: 1, frag: sim },
};
