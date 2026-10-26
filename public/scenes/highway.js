import { SCULPT } from '../js/gfx/scene-kit.js';

// HIGHWAY — a rainy night on the motorway into the city, from the driver's seat, shot like a noir.
// Outside: a wet three-lane carriageway winding gently towards a skyline of lit towers, a TV tower
// and a floodlit mosque on its hill, all standing in the sodium haze the city throws up into a sky
// that goes from amber at the horizon to deep blue, low cloud lit orange from below. Sodium lamps
// march down the median, each one laying a long amber streak on the wet asphalt; the traffic
// ahead is real cars and a lorry (rear and side, wheels, glass, plates, LED tail-light bars) whose
// red lights streak the road too; oncoming headlights rush past beyond the barrier, cat's eyes
// and the lane dashes flick by in our own headlights, and now and then a sign gantry or a lit
// billboard goes over. Inside: a dark cabin, the instrument cluster glowing amber behind the wheel,
// the satnav on the centre screen, the rear-view mirror with headlights in it, and a nazar charm
// hanging from it. Rain beads on the windscreen, each one a little lens with the lights in it.
//
// The road is drawn in closed form: every lamp, car, barrier and gantry is projected through one
// lens and one winding road curve, so nothing is ray-marched and the frame stays cheap on phones.
//
// Music: the BASS is the engine: it shakes the view, swings the nazar on its string, stretches the
// oncoming headlights and the passing lamps into longer light trails and pushes the rev needle;
// louder music also drives faster (the cruise clock). The MIDS light the city: every tower's windows
// and the media screens follow their own slice of the mids, and so does the roadside billboard.
// The HIGHS make the raindrops on the glass and the rain in our headlights glint. On every BEAT a
// cold gantry light sweeps down through the cabin (over the mirror, the nazar, the wheel and the
// dash), one car ahead taps its brakes, and on every other beat the wipers sweep the glass clean;
// the rain starts beading again straight away. Silence: the car drives on, the rain gathers on
// the glass, and nothing pulses.
const frag = `${SCULPT}
const float H = 1.25;             // our eye height above the road, metres
const float SP = 42.0;            // between the lamp posts in the median
const float SPEED = 26.0;         // metres per unit of uCruise
const float CA = 0.085;           // the road winds: our heading swings by up to CA radians
const float CL = 170.0;           //   over 2π·CL metres
const float GANTRY = 640.0;       // a sign gantry every 640 m
const float BOARD = 520.0;        // a billboard every 520 m
const float WT = 0.44;            // one wipe, out and back, in seconds (it ends within the beat)
const float A_REST = 0.07, A_TOP = 1.92;   // the wiper arms' parked and turning angles
const vec3 SODIUM = vec3(1.0, 0.43, 0.11);
const vec3 BEAM = vec3(0.80, 0.88, 1.0);   // our own LED headlights
const vec3 TAIL = vec3(1.0, 0.035, 0.018);
const vec3 AMBER = vec3(1.0, 0.48, 0.07);
const vec3 HAZE = vec3(0.30, 0.14, 0.055);

float gPx, gAsp, gPf, gF, gH0, gT, gS0, gCos0, gSin0, gCityAz, gSpeed, gShutter, gSteer;
float gDash, gHead, gPilL, gPilR, gLastWipe, gWipeOn, gTw;
float gSweep, gSweepY, gPass, gPassY;
vec2 gShake, gPiv1, gPiv2, gCar0, gMir, gMirS;
float gLen1, gLen2;

// ── small tools ─────────────────────────────────────────────────────────────────────────────────
// the road's centre line, sideways from straight ahead, at z metres in front of us
float bend(float z) { return CA * CL * (gCos0 - cos((gS0 + z) / CL)) - CA * z * gSin0; }
// where a point of the world lands on the screen: u across the road, y up, z ahead
vec2 proj(float u, float y, float z) { return vec2((u + bend(z)) * gF / z, (y - H) * gF / z + gH0); }
float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
float boxd(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float rbox(vec2 p, vec2 b, float r) { return boxd(p, b - r) - r; }
// a trapezoid r1 wide at the bottom, r2 at the top, 2·he tall (half widths)
float trap(vec2 p, float r1, float r2, float he) {
  vec2 k1 = vec2(r2, he), k2 = vec2(r2 - r1, 2.0 * he);
  p.x = abs(p.x);
  vec2 ca = vec2(p.x - min(p.x, p.y < 0.0 ? r1 : r2), abs(p.y) - he);
  vec2 cb = p - k1 + k2 * clamp(dot(k1 - p, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}
// the share of [x - w/2, x + w/2] lying on a train of boxes, duty long in every period: a dash
// pattern box-filtered over a pixel's footprint, so it never shimmers however far away it is
float train(float x, float period, float duty, float w) {
  w = max(w, 1e-3);
  float a = x - 0.5 * w, b = x + 0.5 * w;
  float fa = floor(a / period) * duty + min(mod(a, period), duty);
  float fb = floor(b / period) * duty + min(mod(b, period), duty);
  return clamp((fb - fa) / w, 0.0, 1.0);
}
// a stripe w wide around c, box-filtered over a footprint fw
float stripe(float x, float c, float w, float fw) {
  fw = max(fw, 1e-4);
  float lo = max(x - 0.5 * fw, c - 0.5 * w), hi = min(x + 0.5 * fw, c + 0.5 * w);
  return clamp((hi - lo) / fw, 0.0, 1.0);
}
float fog(float z) { return 1.0 - exp(-z * 0.0032); }
float slice(float x) { return uAudioActive * clamp(spec(x) * 1.5, 0.0, 1.0); }

// ── the sky, the clouds the city lights from below, the city ───────────────────────────────────
vec3 skyBase(float e, float a) {
  float glow = exp(-a * a * 2.5);
  vec3 c = mix(vec3(0.15, 0.065, 0.028), vec3(0.40, 0.165, 0.05), glow);       // sodium haze
  c = mix(c, vec3(0.11, 0.06, 0.07), ss(0.0, 0.06, e));
  c = mix(c, vec3(0.03, 0.045, 0.115), ss(0.03, 0.2, e));
  c = mix(c, vec3(0.006, 0.013, 0.045), ss(0.18, 0.62, e));
  return c + vec3(0.36, 0.13, 0.035) * exp(-a * a / 0.03) * exp(-abs(e) * 11.0);   // the dome of light over downtown
}
vec3 cloudy(vec2 q, float e, float a, vec3 c) {
  if (e < 0.004) return c;
  float k = 1.0 / e;
  vec2 cp = vec2(q.x / gF * k, k) * 0.7 + vec2(uTime * 0.006, gT * 0.0008);
  float fp = 0.7 * gPx / gF * k * k;                              // a pixel, on the cloud deck
  float d = mix(noise(cp * 0.9), 0.5, ss(0.1, 0.5, fp * 0.9)) * 0.55;
  d += mix(noise(cp * 2.3 + 4.1), 0.5, ss(0.1, 0.5, fp * 2.3)) * 0.3;
  d += mix(noise(cp * 6.1 + 9.7), 0.5, ss(0.1, 0.5, fp * 6.1)) * 0.15;
  float cover = ss(0.40, 0.70, d) * ss(0.004, 0.05, e);
  float lit = exp(-e * 6.5) * (0.5 + 0.5 * exp(-a * a * 2.0));
  vec3 cc = mix(vec3(0.025, 0.028, 0.05), vec3(0.42, 0.17, 0.06), lit) * (0.7 + 0.45 * d);
  c = mix(c, cc, cover * 0.92);
  // a few stars in the gaps, high up where the haze thins
  vec2 g = q * 90.0;
  vec2 id = floor(g);
  float h = hash21(id + 17.0);
  if (h > 0.994) {
    vec2 f = fract(g) - 0.5 - (vec2(hash21(id + 3.0), hash21(id + 9.0)) - 0.5) * 0.6;
    float r = length(f) / 90.0 / gPx;
    c += vec3(0.75, 0.8, 1.0) * exp(-r * r * 1.4) * (h - 0.994) * 70.0 * (1.0 - cover) * ss(0.22, 0.45, e);
  }
  return c;
}
// window lights: g in window cells, pg one pixel in cells; the pattern melts into its average
// before the cells get too small to draw, so a far tower never sparkles as it slides by
float windows(vec2 g, vec2 pg, float seed, float lit) {
  vec2 id = floor(g), f = fract(g) - 0.5;
  float on = step(hash21(id + seed), lit);
  float sh = ss(0.3 + pg.x, 0.3 - pg.x, abs(f.x)) * ss(0.24 + pg.y, 0.24 - pg.y, abs(f.y));
  return mix(sh * on, 0.29 * lit, ss(0.3, 0.75, max(pg.x, pg.y)));
}
// one row of towers along the horizon: a in radians from the city's heart, e elevation; row 0 is
// the downtown cluster in front, row 1 the lower blocks spreading out behind and round it
vec3 towers(float a, float e, vec3 c, float row) {
  float da = gPx / gF;
  float w = row < 0.5 ? 0.03 : 0.017;
  float off = row * 0.43;
  float ci = floor(a / w + off);
  float h1 = hash11(ci * 1.37 + row * 7.0 + 0.3), h2 = hash11(ci * 2.71 + row * 3.0 + 0.9), h3 = hash11(ci * 0.71 + row * 5.0 + 0.4);
  float env = row < 0.5 ? 0.014 + 0.2 * exp(-a * a / 0.028) : 0.01 + 0.065 * exp(-a * a / 0.14);
  if (h1 < (row < 0.5 ? 0.22 : 0.08) || e > env * 1.35 + 0.01) return c;
  float top = env * (0.3 + 0.7 * h2);
  float cx = (ci + 0.5 - off) * w + (h3 - 0.5) * w * 0.06;
  float hw = w * (0.25 + 0.19 * h3);
  float x = a - cx;
  float roof = top;
  if (h1 > 0.7 && h2 < 0.6) roof = top + (x / hw) * hw * 0.5 * sign(h3 - 0.5);       // a slanted roof
  float d = max(abs(x) - hw, e - roof);
  float crown = 0.0;
  if (h2 > 0.6) {                                          // a stepped crown, a slimmer top storey
    float ct = top + env * 0.09;
    d = min(d, max(abs(x) - hw * 0.62, e - ct));
    crown = ss(da, -da, max(abs(x) - hw * 0.62, abs(e - ct + 0.002) - 0.0016));
  }
  float spire = 0.0, tip = roof;
  if (h3 > 0.7 && row < 0.5) {
    tip = top + env * 0.3;
    spire = ss(da * 1.2, 0.0, abs(x) - 0.0005) * step(e, tip) * step(top, e);
  }
  float cov = max(ss(da, -da, d), spire * 0.8);
  if (cov <= 0.0) return c;
  vec3 body = mix(vec3(0.018, 0.018, 0.03), vec3(0.06, 0.04, 0.045), ss(0.05, 0.0, e)) * (0.75 + 0.35 * h3);
  body += vec3(0.05, 0.03, 0.02) * ss(-hw * 0.3, hw, x) * 0.3;               // the side towards the road's glow
  // windows, each tower lit by its own slice of the mids
  float music = slice(0.15 + 0.4 * hash11(ci * 3.3 + row));
  vec2 cell = row < 0.5 ? vec2(0.0042, 0.0032) : vec2(0.0034, 0.0026);
  vec2 g = vec2((x + hw) / cell.x, e / cell.y);
  float win = windows(g, vec2(da) / cell, ci * 7.1 + row * 31.0, 0.16 + 0.3 * h2 + 0.4 * music);   // more windows come on with the mids
  vec3 wc = mix(vec3(1.0, 0.6, 0.28), vec3(0.62, 0.8, 1.0), step(0.6, hash11(ci * 5.9 + row)));
  body += wc * win * (0.34 + 1.1 * music) * ss(0.002, 0.008, e) * step(abs(x), hw - da * 0.6) * step(e, roof - cell.y * 0.6);
  // LED lines up the edges of some, a lit crown, a media screen
  if (row < 0.5 && h3 < 0.25) body += vec3(0.4, 0.8, 1.0) * (0.3 + 0.9 * music) * ss(da * 1.5, 0.0, abs(abs(x) - hw + da)) * step(e, roof);
  body += vec3(0.5, 0.85, 1.0) * crown * 0.9 * step(0.55, h1);
  if (row < 0.5 && h1 > 0.78 && top > 0.05) {
    vec2 sq = vec2(x, e - top * 0.62) / vec2(hw * 0.82, top * 0.13);
    float scr = ss(1.0 + da / (hw * 0.82), 1.0, max(abs(sq.x), abs(sq.y)));
    vec3 ad = mix(vec3(0.95, 0.12, 0.5), vec3(0.1, 0.65, 1.0), 0.5 + 0.5 * sin(sq.x * 2.0 - uTime * 0.6 + h2 * 9.0));
    ad = mix(ad, vec3(1.0, 0.85, 0.4), ss(0.3, 0.0, abs(sq.y - 0.2 * sin(uTime * 0.4 + sq.x))) * 0.6);
    body = mix(body, ad * (0.2 + 1.3 * slice(0.28 + 0.25 * h3)), scr);
  }
  // the red light on top, blinking
  if (spire > 0.0 || top > 0.06) {
    vec2 ld = vec2(x, e - tip) / da;
    body += vec3(1.0, 0.08, 0.04) * exp(-dot(ld, ld) * 0.6) * 2.4 * step(0.5, fract(uTime * 0.75 + h1 * 3.0));
  }
  body = mix(body, HAZE * 0.85, exp(-max(e, 0.0) * (row < 0.5 ? 28.0 : 22.0)) * 0.6);
  return mix(c, body, cov);
}
// the downtown towers' lights seen in the wet road, d below the horizon: each tower (laid out as in
// towers(), row 0) draws a soft column of its windows' colour down the asphalt, longer for a taller
// tower, brighter with its slice of the mids
vec3 cityReflect(float a, float d) {
  const float w = 0.03;
  vec3 r = vec3(0.0);
  float c0 = floor(a / w);
  for (int k = -1; k <= 1; k++) {
    float ci = c0 + float(k);
    float h1 = hash11(ci * 1.37 + 0.3), h2 = hash11(ci * 2.71 + 0.9), h3 = hash11(ci * 0.71 + 0.4);
    if (h1 < 0.22) continue;
    float cx = (ci + 0.5) * w + (h3 - 0.5) * w * 0.06;
    float hw = w * (0.25 + 0.19 * h3);
    float env = 0.014 + 0.2 * exp(-cx * cx / 0.028);
    float top = env * (0.3 + 0.7 * h2);
    float music = slice(0.15 + 0.4 * hash11(ci * 3.3));
    vec3 wc = mix(vec3(1.0, 0.6, 0.28), vec3(0.62, 0.8, 1.0), step(0.6, hash11(ci * 5.9)));
    float x = (a - cx) / hw;
    float lit = 0.16 + 0.3 * h2 + 0.4 * music;
    r += wc * lit * (0.34 + 1.1 * music) * exp(-x * x * 1.3) * ss(top * 1.6, top * 0.2, d) * ss(0.0, 0.004, d);
  }
  return r;
}
vec3 skyline(vec2 q, float e, float a, vec3 c) {
  float da = gPx / gF;
  if (e > 0.34 || e < -0.004) return c;
  // the hills all round, covered in houses: a haze of tiny lights
  float hill = 0.005 + 0.008 * noise(vec2(a * 9.0, 1.0)) + 0.018 * exp(-pow((a - 0.25) / 0.08, 2.0)) + 0.01 * exp(-pow((a + 0.3) / 0.1, 2.0));
  float inHill = ss(da, -da, e - hill);
  if (inHill > 0.0) {
    vec3 hc = mix(c, vec3(0.05, 0.03, 0.032), 0.65);
    vec2 g = vec2(a / 0.0034, e / 0.0026);
    vec2 id = floor(g);
    float h = hash21(id + 0.5);
    vec2 f = (fract(g) - 0.5 - (vec2(hash21(id + 2.0), hash21(id + 4.0)) - 0.5) * 0.5) * vec2(0.0034, 0.0026) / da;
    hc += mix(vec3(1.0, 0.55, 0.22), vec3(0.85, 0.85, 1.0), step(0.82, h)) * exp(-dot(f, f) * 1.2) * step(0.5, h) * 0.6;
    c = mix(c, hc, inHill);
  }
  c = towers(a, e, c, 1.0);
  // the mosque on its hill, floodlit: a great dome, half domes, two minarets
  {
    float x = a - 0.25, top = 0.022;
    float m = 1.0;
    m = min(m, max(length(vec2(x, (e - top) * 1.05)) - 0.015, top - e));
    m = min(m, max(length(vec2(abs(x) - 0.017, (e - top + 0.003) * 1.2)) - 0.009, top - 0.003 - e));
    m = min(m, boxd(vec2(x, e - top + 0.006), vec2(0.026, 0.008)));
    m = min(m, max(abs(x) - 0.0005, abs(e - top - 0.018) - 0.003));        // the finial
    float mx = abs(x) - 0.034;
    m = min(m, max(abs(mx) - 0.0016, e - top - 0.05));
    m = min(m, max(abs(mx) - 0.0016 * (top + 0.062 - e) / 0.012, abs(e - top - 0.056) - 0.006));
    float cov = ss(da, -da, m);
    if (cov > 0.0) {
      vec3 mc = vec3(0.6, 0.42, 0.24) * (0.45 + 0.55 * ss(top - 0.006, top + 0.016, e));
      mc += vec3(1.0, 0.72, 0.35) * ss(da * 1.5, 0.0, abs(e - top - 0.037)) * step(abs(mx), 0.003) * 1.6;   // balconies
      c = mix(c, mix(mc, HAZE, 0.25), cov);
    }
  }
  // the TV tower on the left hill: a slim shaft, a pod of lit windows, the mast, a red light
  {
    float x = a + 0.3;
    float shaft = abs(x) - mix(0.0034, 0.0014, ss(0.0, 0.17, e));
    float t = max(shaft, e - 0.19);
    t = min(t, length(vec2(x, (e - 0.15) * 0.6)) - 0.0075);
    t = min(t, max(abs(x) - 0.0006, e - 0.235));
    float cov = ss(da, -da, t) * step(0.0, e);
    if (cov > 0.0) {
      vec3 tc = vec3(0.13, 0.13, 0.18) * (0.5 + 0.7 * ss(0.19, 0.0, e));
      tc += vec3(0.6, 0.8, 1.0) * ss(da * 1.5, 0.0, abs(e - 0.15) - 0.0018) * 1.3;
      tc += vec3(0.6, 0.8, 1.0) * 0.4 * ss(da * 1.5, 0.0, abs(e - 0.162) - 0.001);
      c = mix(c, tc, cov);
    }
    vec2 ld = vec2(x, e - 0.236) / da;
    c += vec3(1.0, 0.1, 0.05) * exp(-dot(ld, ld) * 0.6) * 2.4 * step(0.45, fract(uTime * 0.6));
  }
  c = towers(a, e, c, 0.0);
  return c;
}

// ── our own carriageway ────────────────────────────────────────────────────────────────────────
// the road surface at z ahead: u across (0 = our lane), s along
vec3 roadSurface(vec2 q, float z, float u, float s) {
  float du = gPx * z / gF;                      // a pixel across, in metres
  float ds = gPx * z * z / (H * gF);            // a pixel along, in metres
  float au = abs(u);
  // asphalt: wet and dark, coarse grain fading out before it gets smaller than a pixel
  float grain = mix(noise(vec2(u * 2.5, s * 0.5)), 0.5, ss(0.4, 1.6, ds * 0.5));
  float fine = mix(noise(vec2(u * 9.0, s * 2.0)), 0.5, ss(0.3, 1.0, max(du * 9.0, ds * 2.0)));
  float puddle = ss(0.52, 0.72, noise(vec2(u * 0.33 + 7.0, s * 0.06)));
  vec3 alb = vec3(0.022, 0.022, 0.025) * (0.7 + 0.4 * grain + 0.25 * fine) * (1.0 - 0.4 * puddle);
  float onRoad = 1.0 - ss(8.3, 8.6, u);
  alb = mix(vec3(0.02, 0.022, 0.016), alb, onRoad);
  // our headlights: a pool ahead, wider and dimmer further on, cut off at the dipped beam
  float bc = 0.35 + 0.02 * z;
  float bw = 1.3 + 0.13 * z;
  float beam = exp(-pow((u - bc) / bw, 2.0)) * ss(2.5, 9.0, z) * exp(-z / 34.0) * ss(70.0, 40.0, z);
  // the sodium pools under the lamps (heads over the left lanes)
  float ls = s - SP * floor(s / SP + 0.5);
  float pool = exp(-((u + 4.3) * (u + 4.3) + ls * ls) / 90.0);
  vec3 light = BEAM * beam * 5.5 + SODIUM * (0.22 + 1.6 * pool) + vec3(0.02, 0.025, 0.04);
  vec3 col = alb * light;
  // the markings: lane dashes, the solid edge lines; retroreflective, so bright in our beam
  float m = 0.0;
  m += stripe(u, -1.8, 0.15, du) * train(s, 12.0, 4.0, ds);
  m += stripe(u, 1.8, 0.15, du) * train(s, 12.0, 4.0, ds);
  m += stripe(u, -5.25, 0.2, du) + stripe(u, 5.45, 0.2, du);
  vec3 paint = vec3(0.55, 0.55, 0.52);
  col = mix(col, paint * (light * 0.5 + BEAM * beam * 2.6) * (0.7 - 0.35 * puddle), clamp(m, 0.0, 1.0));
  // cat's eyes in the gaps of the dashes and along the left edge, white and amber
  {
    float sn = 12.0 * floor(s / 12.0) + 10.0;
    float zn = sn - gT;
    float un = au < 3.5 ? sign(u) * 1.8 : (u < 0.0 ? -5.05 : 5.25);
    if (zn > 2.0 && au < 6.0) {
      vec2 sp = proj(un, 0.03, zn);
      float rs = max(0.05 * gF / zn, gPx * 0.7);
      float dd = length((q - sp) * vec2(1.0, 1.8)) / rs;
      float retro = exp(-zn / 80.0) * (0.3 + 1.6 * exp(-pow((un - bc) / (1.3 + 0.13 * zn), 2.0)));
      vec3 sc = un < -3.0 ? AMBER : vec3(1.0, 0.95, 0.85);
      col += sc * exp(-dd * dd) * retro * 1.6 * min(1.0, rs / (gPx * 0.7));
    }
  }
  // the wet road mirrors the sky: near the horizon it holds the amber glow
  float e = (q.y - gH0) / gF;
  float fres = pow(1.0 - clamp(H / max(z, 1.0), 0.0, 1.0), 5.0) * 0.38 + 0.015;
  vec3 skyR = skyBase(-e * 0.9, q.x / gF - gCityAz);
  col += skyR * fres * (0.6 + 0.8 * puddle);
  // and every lamp: a long amber streak running down from the foot of each
  float sharp = mix(1.0, 0.45, puddle);
  for (int i = 0; i < 14; i++) {
    float zl = SP * (float(i) + 1.0) - mod(gT, SP);
    float kl = gF / zl;
    float hx = (-4.3 + bend(zl)) * kl;
    float wx = max(0.42 * kl * sharp, gPx * 1.1);
    float dx = (q.x - hx) / wx;
    float ft = gH0 - H * kl;                                       // the foot of the lamp, on the road
    if (abs(dx) > 3.5 || q.y > ft) continue;
    float v = ft - q.y;
    float mv = 10.9 * kl;                                          // how far below its foot a mirror shows the lamp
    float along = exp(-abs(v - mv) / (0.03 + 0.45 * sharp * mv));
    float streak = exp(-dx * dx) * ss(0.0, gPx * 2.0, v) * (along + 0.2 * exp(-v * 3.0));
    col += SODIUM * streak * 1.5 * (1.0 - fog(zl)) * (0.55 + 0.7 * puddle);
  }
  return col;
}

// ── the traffic ─────────────────────────────────────────────────────────────────────────────────
// the cars going our way: u lane, z distance, kind (0 saloon, 1 hatchback, 2 lorry), seed
void carAt(int i, out float u, out float z, out float kind, out float seed) {
  float fi = float(i);
  seed = fi + 1.0;
  kind = 0.0;
  if (i == 0) { u = 0.0; z = 16.5 + 3.0 * sin(uTime * 0.13); kind = 0.0; }
  else if (i == 1) { u = -3.6; z = 58.0 + 22.0 * sin(uTime * 0.061 + 1.0); kind = 1.0; }
  else if (i == 2) { u = 3.6; z = 40.0 + 9.0 * sin(uTime * 0.047 + 2.0); kind = 2.0; }
  else if (i == 3) { u = 0.0; z = 112.0 + 14.0 * sin(uTime * 0.05 + 4.0); kind = 1.0; }
  else if (i == 4) { u = -3.6; z = 158.0 + 18.0 * sin(uTime * 0.04 + 0.3); kind = 0.0; }
  else if (i == 5) { u = 3.6; z = 196.0 + 15.0 * sin(uTime * 0.035 + 5.0); kind = 0.0; }
  else if (i == 6) { u = 0.0; z = 262.0 + 20.0 * sin(uTime * 0.03 + 1.7); kind = 2.0; }
  else { u = -3.6; z = 330.0 + 25.0 * sin(uTime * 0.028 + 3.1); kind = 1.0; }
  u += 0.22 * sin(uTime * (0.17 + 0.05 * fi) + fi * 2.3);
}
vec3 paintOf(float seed) {
  float h = hash11(seed * 7.13 + 0.21);
  return h < 0.3 ? vec3(0.012, 0.012, 0.014) : h < 0.5 ? vec3(0.32, 0.33, 0.35) : h < 0.7 ? vec3(0.012, 0.02, 0.05)
    : h < 0.85 ? vec3(0.12, 0.012, 0.012) : vec3(0.55, 0.55, 0.56);
}
// the rear of a car, seen from behind (x across, y up, metres): the distance to its outline
float carRearD(vec2 q, float kind) {
  float body = rbox(q - vec2(0.0, 0.6), vec2(0.9 - 0.04 * ss(0.3, 0.95, q.y), 0.35), 0.13);
  float top = kind < 0.5 ? 1.43 : 1.47;
  float green = trap(q - vec2(0.0, (0.9 + top) * 0.5), 0.8, 0.56, (top - 0.9) * 0.5 - 0.06) - 0.06;
  float tyre = rbox(vec2(abs(q.x) - 0.74, q.y - 0.17), vec2(0.13, 0.17), 0.05);
  return min(min(body, green), tyre);
}
// the near side of a car (a along from its tail, y up): the distance to its outline
float carSideD(vec2 q, float kind, float len) {
  float body = rbox(q - vec2(len * 0.5, 0.58), vec2(len * 0.5, 0.34), 0.16);
  float top = kind < 0.5 ? 1.43 : 1.47;
  float rearA = kind < 0.5 ? 0.55 : 0.2;
  float yy = clamp((q.y - 0.92) / (top - 0.92), 0.0, 1.0);
  float back = mix(rearA, rearA + 0.55, yy), front = mix(len - 1.25, len - 2.35, yy);
  float green = max(max(back - q.x, q.x - front), max(0.88 - q.y, q.y - top));
  float wheel = min(length(q - vec2(0.85, 0.32)), length(q - vec2(len - 0.9, 0.32))) - 0.32;
  return min(min(body, green - 0.04), wheel);
}
// draws one of the cars going our way
void drawCar(vec2 q, int i, bool ground, float zg, inout vec3 col, inout float zb, inout vec3 glow) {
  float u, z, kind, seed;
  carAt(i, u, z, kind, seed);
  if (z > zb + 30.0) return;
  float k = gF / z;                                                // screen units per metre
  vec2 sc = proj(u, 0.0, z);
  float lorry = step(1.5, kind);
  float hw = mix(0.92, 1.27, lorry), len = mix(kind < 0.5 ? 4.7 : 4.3, 16.5, lorry), tall = mix(1.5, 4.05, lorry);
  float fade = 1.0 - fog(z);
  // the brake lights: on the beat one car taps its brakes (gone within the beat)
  float tap = uAudioActive * uPunch * step(abs(mod(uBeatCount, 4.0) - mod(float(i), 4.0)), 0.5) * ss(0.4, 0.15, uBeatAge);
  vec3 tl = TAIL * (1.7 + 2.2 * tap + 0.6 * gBass);
  // the red streaks of its tail lights on the wet road
  if (ground && zg > z - 0.5 && zb >= zg - 0.01 && q.y < sc.y) {
    float v = sc.y - q.y;
    for (int s = 0; s < 2; s++) {
      float lx = sc.x + (float(s) * 2.0 - 1.0) * (hw - mix(0.2, 0.15, lorry)) * k;
      float dx = (q.x - lx) / max(mix(0.28, 0.35, lorry) * k, gPx * 1.2);
      col += tl * exp(-dx * dx) * exp(-v / (0.05 + 3.0 * k)) * 0.16 * fade * ss(0.0, gPx * 2.0, v);
    }
  }
  if (abs(q.x - sc.x) > (hw + 0.3) * k + abs(sc.x) * 0.3 + gPx * 2.0 || q.y < sc.y - gPx * 2.0 || q.y > sc.y + (tall + 0.1) * k) {
    // outside its box: still give its lights their halo on the glass
  } else {
    float pm = gPx / k;                                            // a pixel, in metres at the car
    vec3 paint = mix(paintOf(seed), vec3(0.42, 0.42, 0.44), lorry);
    // how much light from the lamps overhead falls on it (more under a lamp, more on the left)
    float ls = (z + gT) - SP * floor((z + gT) / SP + 0.5);
    float lamp = 0.25 + 0.75 * exp(-ls * ls / 120.0) * ss(9.0, 0.0, u + 4.3 + 4.0);
    float headOn = exp(-z / 22.0) * exp(-u * u / 6.0) * 2.0;         // our headlights on it
    // the side we can see, if it is not straight ahead
    float xs = u + bend(z) + (sc.x > 0.0 ? -hw : hw);
    if (abs(xs) > hw * 0.5 && sign(q.x) == sign(xs)) {
      float zs = xs * gF / q.x;
      float a = zs - z;
      if (a > 0.0 && a < len && zs < zb) {
        float y = H + (q.y - gH0) * zs / gF;
        float pms = gPx * zs / gF;
        float d;
        vec3 sideC;
        if (lorry > 0.5) {
          float trailer = boxd(vec2(a - 6.8, y - 2.6), vec2(6.8, 1.45));
          float cab = rbox(vec2(a - 14.9, y - 2.2), vec2(1.2, 1.6), 0.25);
          float wh = min(min(length(vec2(a - 1.0, y - 0.5)), length(vec2(a - 2.35, y - 0.5))), min(length(vec2(a - 3.7, y - 0.5)), length(vec2(a - 14.6, y - 0.5)))) - 0.5;
          d = min(min(trailer, cab), wh);
          sideC = vec3(0.30, 0.31, 0.33) * (0.06 + 0.4 * lamp * ss(2.0, 4.0, y)) + SODIUM * 0.08 * lamp * ss(3.6, 4.05, y);
          sideC = mix(sideC, vec3(0.008), ss(pms, -pms, wh));
          // a row of amber markers along the trailer's foot
          float mk = abs(mod(a, 1.6) - 0.8);
          float mkr = length(vec2(mk / 1.0, y - 1.25)) / max(0.06, pms * 1.2);
          sideC += AMBER * 2.0 * exp(-mkr * mkr) * step(a, 13.4);
          glow += AMBER * 0.04 * exp(-mkr * 0.4) * step(a, 13.4) * fade;
        } else {
          d = carSideD(vec2(a, y), kind, len);
          float yy = y;
          float shoulder = ss(0.8, 0.95, yy) * ss(1.0, 0.95, yy);
          sideC = paint * (0.05 + 0.35 * lamp * ss(0.4, 1.0, yy) + 0.6 * headOn * ss(1.0, 0.3, yy)) + SODIUM * 0.18 * lamp * shoulder;
          // the windows, the wheels in their arches
          float inGlass = ss(0.9, 0.95, yy) * step(yy, 1.45);
          sideC = mix(sideC, vec3(0.008, 0.01, 0.014) + SODIUM * 0.05 * lamp * ss(1.0, 1.4, yy), inGlass);
          float wd = min(length(vec2(a - 0.85, yy - 0.32)), length(vec2(a - len + 0.9, yy - 0.32)));
          sideC = mix(sideC, vec3(0.004), ss(0.36, 0.33, wd));
          sideC += vec3(0.25, 0.25, 0.27) * (lamp * 0.3 + headOn * 0.4) * ss(0.2, 0.17, wd) * ss(0.1, 0.13, wd);
          // a red reflector at the tail, an amber one at the nose
          sideC += TAIL * 1.4 * ss(0.09, 0.0, length(vec2(a - 0.15, yy - 0.78)) - 0.02);
          sideC += AMBER * 1.2 * ss(0.09, 0.0, length(vec2(a - len + 0.3, yy - 0.7)) - 0.02);
        }
        float cov = ss(pms, -pms, d);
        col = mix(col, mix(HAZE * 0.6, sideC, fade), cov);
        if (cov > 0.5) zb = zs;
      }
    }
    // the rear face
    vec2 lq = (q - sc) / k;
    lq.x -= 0.0;
    float d;
    vec3 rc;
    if (lorry > 0.5) {
      float box = boxd(lq - vec2(0.0, 2.6), vec2(hw, 1.45));
      float under = boxd(lq - vec2(0.0, 0.62), vec2(hw - 0.05, 0.08));
      float wh = boxd(vec2(abs(lq.x) - 0.85, lq.y - 0.5), vec2(0.28, 0.5));
      d = min(min(box, under), wh);
      rc = vec3(0.30, 0.31, 0.33) * (0.05 + 0.25 * lamp * ss(2.5, 4.0, lq.y) + 0.8 * headOn * ss(2.5, 1.2, lq.y));
      float doors = ss(pm * 1.5, 0.0, abs(lq.x)) + ss(pm * 1.5, 0.0, abs(abs(lq.x) - 0.62)) * 0.6;
      rc *= 1.0 - 0.6 * doors;
      rc = mix(rc, vec3(0.006), ss(pm, -pm, wh) + ss(pm, -pm, under) * 0.7);
      // the red and white reflective band along the bottom, bright in our headlights
      float band = ss(pm, -pm, abs(lq.y - 1.3) - 0.05) * step(abs(lq.x), hw - 0.05);
      float chev = step(0.5, fract((lq.x + lq.y) * 2.0));
      rc = mix(rc, mix(vec3(0.6, 0.02, 0.02), vec3(0.7, 0.7, 0.65), chev) * (0.15 + 3.0 * headOn), band);
      // the lamps: tail-light clusters low at the corners, amber markers along the top
      float tld = boxd(vec2(abs(lq.x) - 0.95, lq.y - 1.0), vec2(0.2, 0.07));
      rc = mix(rc, tl, ss(pm, -pm, tld));
      float tmk = length(vec2(abs(lq.x) - 1.12, lq.y - 3.95)) - 0.05;
      rc = mix(rc, AMBER * 2.5, ss(pm, -pm, tmk));
      for (int s = 0; s < 2; s++) {
        vec2 lp = sc + vec2((float(s) * 2.0 - 1.0) * 0.95, 1.0) * k;
        float dd = length(q - lp) / max(0.3 * k, gPx);
        glow += TAIL * 0.06 * exp(-dd * 0.5) * fade;
      }
    } else {
      d = carRearD(lq, kind);
      float top = kind < 0.5 ? 1.43 : 1.47;
      // a lit roof line and shoulder, darker towards the edges and the bumper
      float shoulder = ss(0.82, 0.96, lq.y) * ss(1.02, 0.94, lq.y);
      float roof = ss(top - 0.12, top, lq.y);
      float edge = ss(0.6, 0.9, abs(lq.x));
      rc = paint * (0.04 + 0.3 * lamp * ss(0.3, 0.95, lq.y) + headOn * ss(1.0, 0.3, lq.y)) * (1.0 - 0.5 * edge);
      rc += SODIUM * lamp * (0.22 * shoulder + 0.3 * roof) * (0.3 + paint);
      // the rear window: dark glass holding the glow of the sky and a lamp sliding over it
      float wd = trap(lq - vec2(0.0, (0.98 + top) * 0.5), 0.72, 0.5, (top - 0.98) * 0.5 - 0.07) - 0.04;
      float inW = ss(pm, -pm, wd);
      vec3 gl = vec3(0.006, 0.008, 0.012) + SODIUM * 0.08 * ss(1.0, top, lq.y) * lamp;
      gl += SODIUM * 0.25 * lamp * exp(-pow((lq.x - 0.9 * sin(ls * 0.07)) / 0.12, 2.0)) * ss(1.0, 1.3, lq.y);
      rc = mix(rc, gl, inW);
      // the third brake light at the top of the window
      rc = mix(rc, TAIL * (0.15 + 3.0 * tap), ss(pm, -pm, boxd(lq - vec2(0.0, top - 0.1), vec2(0.18, 0.018))));
      // the tail lights: a full-width LED bar, or two clusters
      float bar = boxd(lq - vec2(0.0, 0.86), vec2(0.86, 0.035));
      float clusters = rbox(vec2(abs(lq.x) - 0.66, lq.y - 0.86), vec2(0.2, 0.065), 0.03);
      float tld = hash11(seed * 3.1) > 0.45 ? min(bar, clusters) : clusters;
      float inT = ss(pm, -pm, tld);
      vec3 lit = tl * (0.85 + 0.15 * sin(lq.x * 60.0)) * (1.0 + 0.6 * ss(0.4, 0.8, abs(lq.x)));
      rc = mix(rc, lit, inT);
      // the bumper, the plate (Turkish: a blue strip on the left), red reflectors at the corners
      rc = mix(rc, rc * 0.5, ss(0.45, 0.4, lq.y));
      float plate = boxd(lq - vec2(0.0, 0.52), vec2(0.26, 0.055));
      vec3 pc = vec3(0.6, 0.6, 0.56) * (0.25 + 1.2 * headOn);
      pc = mix(pc, vec3(0.02, 0.08, 0.5) * (0.4 + headOn), step(lq.x, -0.21));
      float chars = step(0.4, fract(lq.x * 16.0)) * step(abs(lq.y - 0.52), 0.032) * step(-0.17, lq.x) * step(lq.x, 0.22);
      pc *= 1.0 - 0.75 * chars * ss(0.01, 0.004, pm);
      rc = mix(rc, pc, ss(pm, -pm, plate));
      rc += TAIL * (0.4 + 3.0 * headOn) * ss(pm, -pm, rbox(vec2(abs(lq.x) - 0.78, lq.y - 0.36), vec2(0.06, 0.02), 0.01));
      for (int s = 0; s < 2; s++) {
        vec2 lp = sc + vec2((float(s) * 2.0 - 1.0) * 0.66, 0.86) * k;
        float dd = length(q - lp) / max(0.22 * k, gPx);
        glow += TAIL * 0.07 * (1.0 + tap) * exp(-dd * 0.5) * fade;
      }
    }
    float cov = ss(pm, -pm, d);
    if (z < zb) {
      col = mix(col, mix(HAZE * 0.6, rc, fade), cov);
      if (cov > 0.5) zb = z;
    }
  }
}
// the traffic coming the other way, beyond the barrier: their headlights rush at us and pass,
// drawing light trails as long as the bass makes them
void oncoming(vec2 q, inout vec3 col, float zb, inout vec3 glow) {
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float z = 9.0 + mod(fi * 97.0 + 31.0 - gT * 1.9, 470.0);
    float u = fi < 2.5 ? -9.7 : -13.3;
    float fade = 1.0 - fog(z);
    float zp = z + 1.9 * gSpeed * gShutter;                          // where it was when the shutter opened
    vec3 hc = mix(vec3(1.0, 0.95, 0.85), vec3(0.85, 0.92, 1.0), step(0.5, hash11(fi * 3.3)));
    for (int s = 0; s < 2; s++) {
      float lx = u + (float(s) * 2.0 - 1.0) * 0.78;
      vec2 a = proj(lx, 0.68, z), b = proj(lx, 0.68, zp);
      float r = max(0.11 * gF / z, gPx * 0.9);
      float d = seg(q, a, b);
      float len = length(b - a);
      float core = exp(-d * d / (r * r)) * sqrt(r / (r + len)) * ss(470.0, 380.0, z);
      if (z < zb) col += hc * core * 2.2 * fade;
      glow += hc * 0.035 * exp(-d / (r * 5.0 + 0.012)) * fade * ss(470.0, 300.0, z);
    }
  }
}
// the lamp posts in the median: poles, arms, heads, and their glare
void lamps(vec2 q, inout vec3 col, float zb, inout vec3 glow) {
  for (int i = 0; i < 14; i++) {
    float z = SP * (float(i) + 1.0) - mod(gT, SP);
    float k = gF / z;
    float fade = 1.0 - fog(z);
    vec2 base = proj(-6.4, 0.8, z), top = proj(-6.4, 11.6, z);
    float hw = 0.12 * k;
    if (z < zb && q.x > top.x - 2.6 * k && q.x < top.x + 2.6 * k && q.y > base.y) {
      float pole = ss(gPx, -gPx, abs(q.x - top.x) - max(hw, gPx * 0.4)) * step(q.y, top.y) * min(1.0, hw * 2.0 / gPx + 0.2);
      float arms = 0.0;
      for (int s = 0; s < 2; s++) {
        float sd = float(s) * 2.0 - 1.0;
        vec2 hd = proj(-6.4 + sd * 2.0, 11.0, z);
        // a bent arm: up from the pole top and out to the head
        float d = seg(q, top, mix(top, hd, 0.5) + vec2(0.0, 0.25 * k)) ;
        d = min(d, seg(q, mix(top, hd, 0.5) + vec2(0.0, 0.25 * k), hd));
        arms = max(arms, ss(gPx, -gPx, d - max(0.05 * k, gPx * 0.35)) * min(1.0, 0.1 * k / gPx + 0.2));
        // the luminaire: a flat housing, its lens burning sodium
        vec2 lq = (q - hd) / k;
        float hous = rbox(lq - vec2(sd * 0.25, 0.04), vec2(0.42, 0.09), 0.08);
        arms = max(arms, ss(gPx / k, -gPx / k, hous));
        float lens = rbox(lq - vec2(sd * 0.25, -0.05), vec2(0.34, 0.035), 0.03);
        col += SODIUM * 4.0 * ss(gPx / k, -gPx / k, lens) * fade;
      }
      float m = max(pole, arms);
      col = mix(col, mix(HAZE * 0.7, vec3(0.025, 0.024, 0.026) + SODIUM * 0.05 * ss(top.y - 2.0 * k, top.y, q.y), fade), m);
    }
    // the lamp heads: a hot core and a halo in the rain, smeared into a trail when they are close
    for (int s = 0; s < 2; s++) {
      float sd = float(s) * 2.0 - 1.0;
      float zp = z + gSpeed * gShutter;
      vec2 a = proj(-6.4 + sd * 2.0 + sd * 0.25, 10.92, z), b = proj(-6.4 + sd * 2.0 + sd * 0.25, 10.92, zp);
      float d = seg(q, a, b);
      float r = max(0.3 * k, gPx * 1.2);
      float len = length(b - a);
      float w = sqrt(r / (r + len));
      if (z < zb + 1.0) col += SODIUM * exp(-d * d / (r * r)) * 2.5 * fade * w;
      glow += SODIUM * (0.05 * exp(-d / (0.012 + 1.2 * k)) + 0.018 * exp(-d / (0.08 + 2.0 * k))) * fade * (s == 0 ? 1.0 : 0.6);
    }
  }
}
// the median barrier (concrete, its top catching the lamps) and the guardrail on the right
void barriers(vec2 q, float zg, float ug, inout vec3 col, inout float zb) {
  for (int k = 0; k < 2; k++) {
    float uw = k == 0 ? -6.05 : 8.6;
    float tall = k == 0 ? 0.82 : 0.78;
    if (k == 0 ? ug > uw : ug < uw) continue;
    // where the ray crosses the face: a secant step between the eye (u = 0) and the ground hit
    float z1 = zg * uw / ug;
    float u1 = q.x * z1 / gF - bend(z1);
    float z2 = z1 + (zg - z1) * (uw - u1) / (ug - u1 + 1e-5);
    float y = H * (1.0 - z2 / zg);
    if (z2 <= 0.5 || y > tall + 0.2) continue;
    float py = gPx * z2 / gF;                                     // a pixel, in metres there
    float cov = ss(py, -py, y - tall);
    float s = z2 + gT;
    float fade = 1.0 - fog(z2);
    float ls = s - SP * floor(s / SP + 0.5);
    float lamp = 0.3 + 0.7 * exp(-ls * ls / 140.0);
    float beam = exp(-z2 / 30.0) * 1.5;
    vec3 c;
    if (k == 0) {
      // concrete in the shade of its own top, the top edge lit amber, reflectors every 8 m
      c = vec3(0.07, 0.068, 0.065) * (0.08 + 0.25 * lamp + beam * 0.5) * (0.85 + 0.3 * noise(vec2(s * 1.5, y * 6.0)));
      c += SODIUM * 0.5 * lamp * ss(tall - 0.06, tall, y);
      float rf = abs(s - 8.0 * floor(s / 8.0 + 0.5));
      c += vec3(1.0, 0.85, 0.6) * (0.2 + 4.0 * beam) * ss(max(0.08, py * 1.2), 0.0, rf) * ss(0.06 + py, 0.0, abs(y - 0.62));
    } else {
      // posts every 4 m, the steel rail in front, catching the light along its fold
      float post = stripe(s, 4.0 * floor(s / 4.0 + 0.5), 0.15, gPx * z2 * z2 / (H * gF));
      float rail = step(0.45, y);
      c = vec3(0.05, 0.05, 0.055) * (0.1 + lamp * 0.3 + beam) * mix(post * 0.8, 1.0, rail);
      c += mix(SODIUM * 0.16 * lamp, BEAM * 0.22, ss(0.2, 1.0, beam)) * ss(0.04 + py, 0.0, abs(y - 0.66)) * rail;
      cov *= max(rail, post);
    }
    col = mix(col, mix(HAZE * 0.7, c, fade), cov);
    if (cov > 0.5) zb = min(zb, z2);
  }
}
// a sign gantry over our carriageway: a steel truss, green signs, their lamps
void gantry(vec2 q, inout vec3 col, inout float zb, inout vec3 glow) {
  float z = GANTRY - mod(gT + 240.0, GANTRY);
  if (z < 1.5 || z > zb) return;
  float k = gF / z, pm = gPx / k;
  vec2 o = proj(0.0, 0.0, z);
  vec2 g = (q - o) / k;                                             // metres on the gantry's plane
  if (g.y < 0.0 || g.y > 8.6 || g.x < -7.2 || g.x > 10.2) return;
  float fade = 1.0 - fog(z);
  float d = 1e3;
  d = min(d, boxd(vec2(abs(g.x - 1.5) - 8.2, g.y - 3.8), vec2(0.18, 3.8)));
  d = min(d, boxd(vec2(g.x - 1.5, abs(g.y - 6.9) - 0.75), vec2(8.4, 0.08)));
  float lat = abs(fract((g.x + 6.7) / 1.5) - 0.5) * 1.5;
  float diag = abs(lat - (g.y - 6.15) * 0.5);
  d = min(d, max(diag - 0.05, abs(g.y - 6.9) - 0.75));
  float steel = ss(pm, -pm, d);
  vec3 c = vec3(0.04, 0.042, 0.048) * 0.6;
  col = mix(col, mix(HAZE * 0.6, c, fade), steel);
  // the signs: green, white border, lines of white lettering, arrows down to their lanes
  for (int s = 0; s < 2; s++) {
    float cx = s == 0 ? -2.6 : 3.4, hwid = s == 0 ? 2.5 : 2.9;
    vec2 sq = g - vec2(cx, 6.85);
    float sd = rbox(sq, vec2(hwid, 1.3), 0.12);
    float inS = ss(pm, -pm, sd);
    if (inS <= 0.0) continue;
    float lit = 0.35 + 1.4 * exp(-z / 50.0);
    vec3 sc = vec3(0.0, 0.2, 0.09) * lit;
    float ink = ss(pm, -pm, abs(sd + 0.12) - 0.05);
    float row = floor((sq.y + 1.0) / 0.55);
    float lineY = abs(fract((sq.y + 1.0) / 0.55) - 0.5) * 0.55;
    float words = step(lineY, 0.12) * step(row, 2.5) * step(0.0, row) * step(0.3, fract(sq.x * 1.1 + row * 0.37 + float(s) * 0.5)) * step(abs(sq.x - 0.4), hwid - 0.9);
    float arrow = ss(pm, -pm, max(abs(sq.x + hwid - 0.55) - 0.07, abs(sq.y + 0.25) - 0.6));
    arrow = max(arrow, ss(pm, -pm, max(abs(sq.x + hwid - 0.55) - 0.45 - (sq.y + 0.85) * 0.75, -(sq.y + 0.85)) * step(sq.y, -0.25)));
    ink = max(ink, max(words * ss(0.03, 0.012, pm), arrow));
    sc = mix(sc, vec3(0.75, 0.78, 0.72) * lit, ink);
    col = mix(col, mix(HAZE * 0.6, sc, fade), inS);
    // the floodlights under the sign
    for (int j = 0; j < 2; j++) {
      vec2 lp = vec2(cx + (float(j) - 0.5) * hwid, 5.35);
      float dd = length(g - lp) / max(0.12, pm);
      col += vec3(1.0, 0.95, 0.85) * exp(-dd * dd) * 2.0 * fade;
    }
  }
  if (steel > 0.5) zb = z;
}
// a billboard on a tall pole beyond the guardrail: lit by the mids
void billboard(vec2 q, inout vec3 col, inout float zb) {
  float z = BOARD - mod(gT + 120.0, BOARD);
  if (z < 4.0 || z > zb) return;
  float k = gF / z, pm = gPx / k;
  vec2 o = proj(0.0, 0.0, z);
  vec2 g = (q - o) / k;
  if (g.x < 9.0 || g.x > 24.0 || g.y < 0.0 || g.y > 15.0) return;
  float fade = 1.0 - fog(z);
  float pole = ss(pm, -pm, boxd(g - vec2(16.0, 5.0), vec2(0.35, 5.0)));
  vec2 bq = g - vec2(16.0, 12.0);
  float panel = ss(pm, -pm, rbox(bq, vec2(6.2, 2.4), 0.1));
  vec3 c = vec3(0.02);
  col = mix(col, mix(HAZE * 0.6, c, fade), pole);
  if (panel > 0.0) {
    float mids = slice(0.3);
    vec2 uv = bq / vec2(6.0, 2.2);
    vec3 art;
    if (uHasArt > 0.5) {
      vec2 tuv = vec2(uv.x * 0.5 * 2.73 / max(uArtAspect, 0.3), uv.y * 0.5) + 0.5;
      art = textureLod(uArt, vec2(clamp(tuv.x, 0.0, 1.0), 1.0 - clamp(tuv.y, 0.0, 1.0)), 2.0).rgb * step(abs(tuv.x - 0.5), 0.5);
    } else {
      // a poster: a sun going down over the sea, a slogan in white bars
      art = mix(vec3(0.95, 0.35, 0.25), vec3(0.15, 0.1, 0.45), ss(-0.6, 0.9, uv.y));
      art = mix(art, vec3(1.0, 0.8, 0.35), ss(0.42, 0.38, length(uv * vec2(2.73, 1.0) - vec2(1.2, -0.1))));
      art = mix(art, vec3(0.05, 0.12, 0.3), ss(-0.18, -0.22, uv.y));
      art = mix(art, vec3(0.95), step(abs(uv.y - 0.45), 0.08) * step(uv.x, -0.1) * step(-0.85, uv.x) * step(0.25, fract(uv.x * 4.0)));
    }
    float spot = 0.5 + 0.5 * ss(-1.0, 1.0, uv.y);
    vec3 pc = art * (0.25 + 0.75 * mids) * spot * 0.9;
    pc = mix(vec3(0.03), pc, ss(1.0, 0.97, max(abs(uv.x), abs(uv.y))));
    col = mix(col, mix(HAZE * 0.6, pc, fade), panel);
    if (panel > 0.5) zb = z;
  }
}
// rain falling through our headlights and round the lamps, glinting with the highs
vec3 rainfall(vec2 q) {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float sc = i == 0 ? 0.05 : 0.09;
    vec2 g = vec2(q.x + 0.05 * q.y, q.y + uTime * (2.4 - fi * 0.7)) / vec2(sc * 0.35, sc * 2.2);
    vec2 id = floor(g);
    float h = hash21(id + fi * 13.0);
    if (h < 0.82) continue;
    vec2 f = fract(g) - vec2(0.2 + 0.6 * hash21(id + 3.0), 0.5);
    float streak = ss(0.12, 0.0, abs(f.x)) * ss(0.45, 0.2, abs(f.y));
    float light = exp(-pow(q.x * 1.8, 2.0)) * ss(gH0 + 0.02, gH0 - 0.2, q.y) * ss(gDash - 0.05, gDash + 0.25, q.y);
    float glint = 1.0 + 4.0 * gHigh * step(0.9, h);
    c += BEAM * streak * light * glint * (0.09 - fi * 0.03);
  }
  return c;
}
// everything outside the glass
vec3 outside(vec2 q, out vec3 glow) {
  glow = vec3(0.0);
  float e = (q.y - gH0) / gF;
  float a = q.x / gF - gCityAz;
  float zb = 1e9;
  vec3 col;
  bool ground = q.y < gH0 - 1e-5;
  float zg = 1e9, ug = 0.0;
  if (!ground) {
    col = skyBase(e, a);
    col = cloudy(q, e, a, col);
    col = skyline(q, e, a, col);
  } else {
    zg = H * gF / (gH0 - q.y);
    float x = q.x * zg / gF;
    ug = x - bend(zg);
    float s = zg + gT;
    if (zg > 1500.0) col = skyBase(0.0, a);
    else {
      col = roadSurface(q, zg, ug, s);
      if (ug > 8.6 || ug < -6.1) col = vec3(0.012, 0.012, 0.012) + SODIUM * 0.03 * exp(-abs(ug) * 0.05);
      col = mix(col, skyBase(0.0, a), fog(zg));
    }
    // the city in the wet road, its colours run down towards us and broken up by the ripples
    float rip = (noise(vec2(q.x * 90.0, zg * 0.08)) - 0.5) * 0.004 * ss(0.0, 0.05, -e);
    col += cityReflect(a + rip, -e) * 0.42 * step(ug, 8.6);
    col = skyline(q, e, a, col);      // the city, standing on the horizon
    zb = zg;
    barriers(q, zg, ug, col, zb);
  }
  billboard(q, col, zb);
  for (int i = 7; i >= 0; i--) drawCar(q, i, ground, zg, col, zb, glow);
  oncoming(q, col, zb, glow);
  lamps(q, col, zb, glow);
  gantry(q, col, zb, glow);
  col += rainfall(q);
  return col;
}

// ── the windscreen: rain beading on it, the wipers ─────────────────────────────────────────────
// what a raindrop sees, upside down and blurred: the glow of the sky, the dark road and its sheen,
// the line of lamps, the red of the car ahead and the pool of our headlights
vec3 envApprox(vec2 v) {
  float e = (v.y - gH0) / gF;
  float a = v.x / gF - gCityAz;
  vec3 c = e > 0.0 ? skyBase(e, a) : skyBase(-e * 1.4, a) * 0.3 + BEAM * 0.1 * exp(-pow(v.x * 1.6, 2.0)) * ss(gH0 - 0.05, gH0 - 0.4, v.y);
  vec2 d = (v - gCar0) * vec2(1.0, 2.5);
  c += TAIL * 0.8 * exp(-dot(d, d) * 60.0);
  return c;
}
float sweepAt(float y) { return gSweep * exp(-pow((y - gSweepY) / 0.24, 2.0)); }
float wipeAngle(float t) {
  float s = (t > 0.0 && t < WT) ? sin(PI * t / WT) : 0.0;
  return A_REST + (A_TOP - A_REST) * s * s;
}
// the last time a wiper blade went over the point c of the glass (or long ago)
float wipedAt(vec2 c) {
  if (gWipeOn < 0.5) return -1e9;
  float last = -1e9;
  for (int k = 0; k < 2; k++) {
    vec2 d = c - (k == 0 ? gPiv1 : gPiv2);
    float len = k == 0 ? gLen1 : gLen2;
    float r = length(d);
    if (r < len * 0.2 || r > len) continue;
    float fu = (atan(d.y, d.x) - A_REST) / (A_TOP - A_REST);
    if (fu < 0.0 || fu > 1.0) continue;
    float tout = WT / PI * asin(sqrt(fu)), tback = WT - tout;
    // swept on the way up, on the way back, or (before the blade gets here) at the wipe before
    float pass = gTw >= tback ? gLastWipe + tback : (gTw >= tout ? gLastWipe + tout : gLastWipe - 1.0 + tback);
    last = max(last, pass);
  }
  return last;
}
// beads of rain in three sizes: each is born, sits a few seconds and goes, unless a wiper takes it.
// A bead is a little lens: over the dark it is hardly there, a dark rim and a faint image of the
// sky; near a lamp or a tail light it gathers that light and burns with it (glow is the halo of
// every light at this point of the glass). The highs make some of them flash.
vec3 beads(vec2 p, vec3 col, vec3 glow) {
  float gl = min(dot(glow, vec3(0.5, 0.4, 0.1)), 1.0);
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float cell = L == 0 ? 0.085 : (L == 1 ? 0.05 : 0.028);
    vec2 off = fl * vec2(7.31, 3.17);
    vec2 g = p / cell + off;
    vec2 id = floor(g);
    float period = 2.2 + 3.0 * hash21(id + fl * 11.0 + 0.7);
    float ph = hash21(id + fl * 5.0 + 2.9) * period;
    float n = floor((uTime + ph) / period);
    float birth = n * period - ph;
    float age = uTime - birth;
    float h = hash21(id + n * 0.618 + fl * 3.0);
    if (h > (L == 0 ? 0.34 : (L == 1 ? 0.3 : 0.26))) continue;
    float r = cell * (L == 0 ? 0.12 + 0.3 * h : 0.14 + 0.3 * h);
    vec2 jit = vec2(hash21(id + n * 1.31 + 4.4), hash21(id + n * 2.17 + 8.8)) - 0.5;
    vec2 c = (id + 0.5 + jit * (1.0 - 2.4 * r / cell) - off) * cell;
    vec2 d = (p - c) / vec2(r, r * 0.86);
    float rn = length(d);
    float pr = gPx / r;
    if (rn > 1.0 + pr || birth < wipedAt(c)) continue;
    float life = ss(0.0, 0.06, age) * ss(period, period * 0.75, age);
    // the world upside down inside it, a dark rim, the light it gathers along its lower edge
    vec3 inner = envApprox(c - (p - c) * 9.0) + glow * 1.8;
    vec3 dc = mix(inner, inner * 0.1, ss(0.45, 1.0, rn));
    dc += inner * 1.4 * ss(0.78, 1.0, rn) * ss(0.1, -0.7, d.y);
    vec2 hl = d - vec2(-0.3, 0.38);
    float spec = exp(-dot(hl, hl) * 26.0);
    float tw = hash21(id + n + 7.7);
    float glint = 0.025 + 1.2 * gl + 2.6 * gHigh * step(0.5, tw) * (0.55 + 0.45 * sin(uTime * 23.0 + tw * 40.0));
    dc += mix(SODIUM, vec3(1.0, 0.95, 0.9), 0.45 + 0.3 * tw) * spec * glint;
    dc += vec3(0.85, 0.92, 1.0) * spec * sweepAt(c.y) * 2.0;
    col = mix(col, dc, ss(1.0 + pr, 1.0 - pr, rn) * life);
  }
  return col;
}
// the wipers: two arms swinging up from under the dash and back, blurred by their own speed
vec3 wipers(vec2 p, vec3 col) {
  if (gWipeOn < 0.5 || gTw > WT + 0.02) return col;
  float a1 = wipeAngle(gTw), a0 = wipeAngle(gTw - 1.0 / 60.0);
  float lo = min(a0, a1), hi = max(a0, a1);
  for (int k = 0; k < 2; k++) {
    vec2 d = p - (k == 0 ? gPiv1 : gPiv2);
    float len = k == 0 ? gLen1 : gLen2;
    float r = length(d);
    if (r > len + 0.01 || r < 0.02) continue;
    float th = atan(d.y, d.x);
    float blade = ss(len * 0.2, len * 0.22, r);
    float w = mix(0.006, 0.012, blade) / r;                       // half its width, as an angle here
    float pa = gPx / r;
    float inside = ss(lo - w - pa, lo - w + pa, th) * ss(hi + w + pa, hi + w - pa, th);
    float cov = inside * ss(len + gPx, len - gPx, r);
    vec3 c = vec3(0.006, 0.006, 0.007) + SODIUM * 0.04 * blade + vec3(0.6, 0.7, 0.8) * sweepAt(p.y) * 0.15;
    col = mix(col, vec3(1.0, 0.0, 0.0), cov);
  }
  return col;
}

// ── the cabin ──────────────────────────────────────────────────────────────────────────────────
float dashLine(float x) { float t = x / max(gAsp, 0.8); return gDash + 0.05 * t * t; }
float headLine(float x) { float t = x / max(gAsp, 0.8); return gHead - 0.07 * t * t; }
float pillarL(float y) { return gPilL + 0.2 * (y - gDash); }
float pillarR(float y) { return gPilR - 0.12 * (y - gDash); }
float glassD(vec2 p) { return min(min(p.y - dashLine(p.x), headLine(p.x) - p.y), min(p.x - pillarL(p.y), pillarR(p.y) - p.x)); }
// the light in the cabin: the glow from outside, the lamp we are passing under, the beat's sweep
vec3 cabinLight(vec2 p) {
  return vec3(0.022, 0.018, 0.022) + SODIUM * 0.45 * gPass * exp(-pow((p.y - gPassY) / 0.3, 2.0))
    + vec3(0.85, 0.92, 1.0) * 1.3 * sweepAt(p.y);
}
// the roof lining and the pillars round the glass
vec3 frame(vec2 p, float gd) {
  vec3 L = cabinLight(p);
  vec3 c = vec3(0.16, 0.15, 0.16) * L;
  c += vec3(0.07, 0.035, 0.02) * exp(min(gd, 0.0) / 0.012);     // the edge by the glass, lit from outside
  return c;
}
// the black band printed round the edge of a windscreen, its dots too fine to see: a soft fade
float frit(vec2 p, float gd) {
  return ss(0.034, 0.008, gd) * (0.55 + 0.45 * ss(0.03, 0.012, gd));
}
float digit(vec2 p, float n, float pw) {
  int b = n < 0.5 ? 63 : n < 1.5 ? 6 : n < 2.5 ? 91 : n < 3.5 ? 79 : n < 4.5 ? 102 : n < 5.5 ? 109 : n < 6.5 ? 125 : n < 7.5 ? 7 : n < 8.5 ? 127 : 111;
  float v = 0.0;
  float hx = ss(pw, -pw, abs(p.x) - 0.32);
  float vy1 = ss(pw, -pw, abs(p.y - 0.47) - 0.4), vy2 = ss(pw, -pw, abs(p.y + 0.47) - 0.4);
  float vl = ss(pw, -pw, abs(p.x + 0.42) - 0.07), vr = ss(pw, -pw, abs(p.x - 0.42) - 0.07);
  if ((b & 1) != 0) v = max(v, hx * ss(pw, -pw, abs(p.y - 0.93) - 0.07));
  if ((b & 2) != 0) v = max(v, vr * vy1);
  if ((b & 4) != 0) v = max(v, vr * vy2);
  if ((b & 8) != 0) v = max(v, hx * ss(pw, -pw, abs(p.y + 0.93) - 0.07));
  if ((b & 16) != 0) v = max(v, vl * vy2);
  if ((b & 32) != 0) v = max(v, vl * vy1);
  if ((b & 64) != 0) v = max(v, hx * ss(pw, -pw, abs(p.y) - 0.07));
  return v;
}
// one round instrument: ticks over 240°, a red zone, a lit needle
vec3 dial(vec2 p, vec2 c, float R, float val, float red, vec3 col) {
  vec2 d = p - c;
  float r = length(d) / R;
  if (r > 1.1) return col;
  float pr = gPx / R;
  float ang = atan(d.x, d.y);
  const float SPAN = 2.1;
  vec3 fc = vec3(0.004, 0.004, 0.006) + AMBER * 0.025 * ss(1.0, 0.2, r);
  fc += vec3(1.0, 0.5, 0.15) * ss(pr * 1.5, 0.0, abs(r - 0.97) - 0.01) * 0.55;          // the lit ring
  float f = (ang + SPAN) / (2.0 * SPAN);
  if (f > -0.01 && f < 1.01) {
    float tk = abs(fract(f * 10.0 + 0.5) - 0.5) / 10.0 * 2.0 * SPAN * r;               // to the nearest big tick, in radii
    float tm = abs(fract(f * 40.0 + 0.5) - 0.5) / 40.0 * 2.0 * SPAN * r;
    float major = ss(pr * 1.2, pr * 0.2, tk - 0.022) * step(0.74, r) * step(r, 0.92);
    float minor = ss(pr, 0.0, tm - 0.008) * step(0.84, r) * step(r, 0.92);
    vec3 tc = mix(vec3(1.0, 0.86, 0.68), vec3(1.0, 0.12, 0.04), step(red, f));
    fc += tc * (major * 1.1 + minor * 0.55);
    // a dot for every numeral
    float nd = length(vec2(tk, r - 0.62));
    fc += vec3(1.0, 0.86, 0.68) * ss(pr * 1.5, 0.0, nd - 0.035) * 0.7;
  }
  float na = -SPAN + 2.0 * SPAN * clamp(val, 0.0, 1.02);
  vec2 nd = vec2(sin(na), cos(na));
  float nl = seg(d / R, -nd * 0.16, nd * 0.88);
  fc = mix(fc, vec3(1.0, 0.26, 0.05) * 2.2, ss(pr * 1.2, 0.0, nl - 0.018));
  fc += vec3(1.0, 0.3, 0.06) * 0.1 * exp(-nl / 0.06);
  fc = mix(fc, vec3(0.03, 0.03, 0.035), ss(pr, 0.0, r - 0.1));
  col = mix(col, fc, ss(1.0 + pr, 1.0, r));
  return mix(col, vec3(0.05, 0.05, 0.055), ss(pr * 1.5, 0.0, abs(r - 1.02) - 0.015));   // the bezel
}
vec3 dashboard(vec2 p, vec3 col) {
  float dl = dashLine(p.x);
  vec3 L = cabinLight(p);
  // the top of the dash, running from the foot of the glass towards us
  float depth = dl - p.y;
  if (depth > -gPx * 2.0) {
    vec3 c = vec3(0.13, 0.12, 0.125) * (L * (0.2 + 0.9 * exp(-depth * 7.0)) + 0.003);
    float vent = ss(gPx, 0.0, abs(depth - 0.03) - 0.007) * step(abs(p.x), gAsp * 0.72);
    c = mix(c, vec3(0.002), vent * (0.5 + 0.5 * step(0.35, fract(p.x * 45.0))));
    // the strip of ambient light along the dash
    float seam = dl - 0.22 - 0.025 * p.x * p.x;
    float strip = ss(gPx * 1.5, 0.0, abs(p.y - seam) - 0.002) * ss(gAsp * 0.98, gAsp * 0.5, abs(p.x)) * ss(0.45, 0.6, abs(p.x));
    c += vec3(1.0, 0.36, 0.08) * (strip * 0.9 + exp(-abs(p.y - seam) / 0.02) * 0.04 * ss(0.4, 0.6, abs(p.x)));
    col = mix(col, c, ss(-gPx, gPx, depth));
  }
  // the instrument hood and, under it, the cluster
  vec2 cc = vec2(0.0, gDash - mix(0.2, 0.2, gPf));
  float hw = mix(0.52, 0.45, gPf);
  float hood = rbox(p - cc - vec2(0.0, 0.06), vec2(hw, 0.16), 0.13);
  if (hood < gPx * 2.0) {
    float ins = ss(gPx, -gPx, hood);
    vec3 c = vec3(0.12, 0.11, 0.11) * (L * 1.1 + 0.004);
    c += (L * 0.8 + vec3(0.02, 0.012, 0.008)) * ss(0.012, 0.0, -hood) * ss(cc.y, cc.y + 0.2, p.y);   // its lit brow
    // the cluster face in the shadow of the hood
    float face = rbox(p - cc + vec2(0.0, 0.02), vec2(hw - 0.05, 0.12), 0.1);
    float inF = ss(gPx, -gPx, face);
    vec3 fc = vec3(0.004, 0.004, 0.005) + AMBER * 0.02 * exp(-pow(face / 0.05, 2.0));
    float R = mix(0.118, 0.1, gPf), dx = mix(0.27, 0.225, gPf);
    float rpm = 0.1 + 0.08 * sin(uTime * 0.37) * 0.0 + 0.32 * clamp(uCruiseRate - 0.3, 0.0, 1.2) + 0.32 * gBass;
    fc = dial(p, cc + vec2(-dx, 0.0), R, rpm, 0.78, fc);
    fc = dial(p, cc + vec2(dx, 0.0), R, clamp(gSpeed * 3.6 / 220.0, 0.0, 1.0), 0.88, fc);
    // between the dials: the speed in white digits, a little amber line, the trip
    float kmh = floor(gSpeed * 3.6 + 0.5);
    vec2 dq = (p - cc - vec2(0.0, 0.02)) / (R * 0.18);
    float pw = gPx / (R * 0.18);
    float dg = 0.0;
    for (int i = 0; i < 3; i++) {
      float place = pow(10.0, 2.0 - float(i));
      float v = mod(floor(kmh / place), 10.0);
      if (i == 0 && kmh < 100.0) continue;
      dg = max(dg, digit(dq - vec2((float(i) - 1.0) * 1.25, 0.0), v, pw));
    }
    fc += vec3(0.95, 0.92, 0.85) * dg * 1.1;
    fc += AMBER * 0.6 * ss(gPx * 1.5, 0.0, abs(p.y - cc.y + R * 0.4) - 0.0015) * step(abs(p.x - cc.x), R * 0.3);
    c = mix(c, fc, inF);
    col = mix(col, c, ins);
  }
  // the centre screen: the satnav, the road bending ahead, the track going by
  if (gPf < 0.5) {
    vec2 sc = vec2(min(1.1, gAsp * 0.64), gDash - 0.17);
    vec2 sq = p - sc;
    float sd = rbox(sq, vec2(0.26, 0.15), 0.02);
    if (sd < 0.03) {
      vec3 c = vec3(0.012, 0.016, 0.03);
      vec2 m = sq / vec2(0.26, 0.15);
      // streets, the route ahead (it bends with the road), our arrow
      vec2 sg = rot(0.4) * m * 4.0;
      float streets = ss(0.06, 0.0, abs(fract(sg.x) - 0.5) - 0.44) + ss(0.06, 0.0, abs(fract(sg.y + 0.3) - 0.5) - 0.45);
      c += vec3(0.05, 0.07, 0.1) * clamp(streets, 0.0, 1.0) * 0.6;
      float yy = clamp(m.y + 0.75, 0.0, 1.8);
      float rx = -gSteer * 1.2 * yy * yy;
      float route = abs(m.x * 0.26 - rx * 0.26) - 0.006;
      c += vec3(0.15, 0.6, 1.0) * (ss(gPx * 1.5, 0.0, route) * 0.9 + exp(-max(route, 0.0) / 0.02) * 0.08) * step(-0.75, m.y) * step(m.y, 0.62);
      vec2 aq = (m - vec2(0.0, -0.72)) * vec2(0.26, 0.15);
      float arrow = trap(aq, 0.022, 0.0, 0.025);
      c = mix(c, vec3(0.9), ss(gPx, -gPx, arrow));
      // the track: its progress along the top
      float bar = ss(gPx, -gPx, abs(sq.y - 0.115) - 0.004) * step(abs(sq.x), 0.22);
      c = mix(c, mix(vec3(0.08), vec3(1.0, 0.45, 0.12), step(m.x * 0.5 + 0.5, uProgress * 0.85 + 0.075)), bar);
      c *= 0.9 + 0.1 * cabinLight(p) * 5.0;
      col = mix(col, vec3(0.008), ss(gPx, -gPx, sd - 0.012));
      col = mix(col, c, ss(gPx, -gPx, sd));
    }
    col += vec3(0.04, 0.08, 0.14) * 0.15 * exp(-max(sd, 0.0) / 0.05) * step(0.0, sd) * step(p.y, dl);
  }
  return col;
}
// the steering wheel: the top of its rim, leather, lit from the glass
vec3 wheel(vec2 p, vec3 col) {
  vec2 c = vec2(0.0, mix(-1.42, -1.4, gPf));
  vec2 R = mix(vec2(0.78, 0.6), vec2(0.62, 0.5), gPf);
  float T = mix(0.052, 0.046, gPf);
  vec2 d = rot(gSteer) * (p - c);
  float k0 = length(d / R), k1 = length(d / (R * R));
  float dist = k0 * (k0 - 1.0) / max(k1, 1e-4);
  float rim = ss(gPx, -gPx, abs(dist) - T);
  if (rim <= 0.0) return col;
  float t = clamp(dist / T, -1.0, 1.0);
  float nz = sqrt(1.0 - t * t);
  vec3 L = cabinLight(p);
  float up = ss(-0.3, 0.6, d.y / max(length(d), 1e-3));
  vec3 lc = vec3(0.08, 0.075, 0.075) * (L * 2.2 + 0.05) * (0.35 + 0.65 * nz);
  lc += (L * 0.6 + vec3(0.075, 0.05, 0.035)) * exp(-pow((t - 0.42) / 0.22, 2.0)) * up * 0.9;   // the sheen along its top
  lc += AMBER * 0.035 * exp(-pow((t + 0.55) / 0.3, 2.0)) * up;                                  // the cluster on its inner side
  float stitch = step(0.5, fract(atan(d.x, d.y) * 70.0)) * ss(0.12, 0.0, abs(t + 0.05));
  lc *= 1.0 - 0.3 * stitch;
  lc = mix(lc, vec3(0.5, 0.48, 0.45) * (L * 0.7 + 0.02), ss(0.02, 0.0, abs(d.x) - 0.012) * step(0.0, d.y));  // the marker at the top
  return mix(col, lc, rim);
}
// the rear-view mirror: in it, the rear window, the road behind and the car following us
vec3 mirror(vec2 p, vec3 col) {
  float stem = seg(p, gMir + vec2(0.0, gMirS.y * 0.6), vec2(gMir.x - 0.02, gHead + 0.08)) - 0.011;
  col = mix(col, vec3(0.012) + cabinLight(p) * 0.15, ss(gPx, -gPx, stem));
  vec2 d = p - gMir;
  float md = rbox(d, gMirS, 0.04);
  if (md > gPx * 2.0) return col;
  vec3 c = vec3(0.014, 0.014, 0.016) + cabinLight(p) * 0.25;
  float glass = ss(gPx, -gPx, md + 0.006);
  vec2 m = d / gMirS;
  vec3 g = mix(vec3(0.16, 0.07, 0.025), vec3(0.012, 0.018, 0.045), ss(-0.25, 0.55, m.y));   // the town's glow behind us
  g = mix(g, vec3(0.006, 0.006, 0.007) + vec3(0.05, 0.02, 0.006) * ss(-0.6, -0.2, m.y), ss(-0.18, -0.24, m.y));   // the road
  // the lamps behind us, going away towards the vanishing point
  for (int i = 0; i < 4; i++) {
    float zb = mod(gT, SP) + float(i) * SP + 6.0;
    vec2 lp = vec2(-0.5 - 3.0 / zb * 3.0, -0.2 + 9.0 / zb * 1.6);
    vec2 ld = (m - lp) * gMirS;
    g += SODIUM * exp(-dot(ld, ld) / (0.00002 + 0.0003 / zb)) * 1.4;
  }
  // the car following us: two headlights, a little dazzling
  vec2 hb = vec2(0.12 + 0.08 * sin(uTime * 0.21), -0.32);
  float dl = min(length((m - hb - vec2(0.13, 0.0)) * gMirS), length((m - hb + vec2(0.13, 0.0)) * gMirS));
  g += vec3(0.9, 0.93, 1.0) * (exp(-dl * dl / 0.00003) * 1.6 + exp(-dl / 0.015) * 0.12);
  // the frame of our own rear window and the headrests, dark against all that
  float rw = trap(m - vec2(0.0, 0.05), 0.92, 0.72, 0.62) - 0.05;
  float rests = min(rbox(m - vec2(-0.52, -0.6), vec2(0.22, 0.32), 0.15), rbox(m - vec2(0.55, -0.6), vec2(0.22, 0.32), 0.15));
  float dark = max(ss(-0.02, 0.02, rw), ss(0.02, -0.02, rests));
  g = mix(g, vec3(0.01, 0.009, 0.011) + cabinLight(p) * 0.05, dark);
  g += vec3(0.03, 0.03, 0.035) * ss(0.3, -0.6, m.x - m.y) + vec3(0.6, 0.7, 0.8) * sweepAt(p.y) * 0.2;
  c = mix(c, g, glass);
  return mix(col, c, ss(gPx, -gPx, md));
}
// the nazar: a cord from the mirror, beads, the blue glass eye, a tassel; the bass swings it
vec3 nazar(vec2 p, vec3 col, vec3 behind) {
  float Rn = mix(0.05, 0.044, gPf);
  float len = mix(0.25, 0.21, gPf);
  vec2 piv = gMir + vec2(0.035, -gMirS.y + 0.012);
  float th = (0.06 + 0.24 * gBass) * sin(uTime * 2.6) + 0.04 * sin(uTime * 1.13 + 0.7) - gSteer * 0.5 + gShake.x * 6.0;
  vec2 dir = vec2(sin(th), -cos(th));
  vec2 end = piv + dir * len;
  vec2 dc = end + dir * Rn * 0.92;
  if (length(p - mix(piv, dc, 0.5)) > len * 0.5 + Rn * 2.6) return col;
  vec3 L = cabinLight(p);
  vec3 bh = min(behind, vec3(0.5));
  vec3 lit = L * 1.1 + bh * 1.6 + vec3(0.035, 0.025, 0.025);
  // the cord, and three beads strung on it
  float cd = seg(p, piv, end);
  col = mix(col, vec3(0.1, 0.03, 0.02) * lit, ss(gPx * 1.2, 0.0, cd - gPx * 0.35));
  for (int i = 0; i < 3; i++) {
    vec2 bc = piv + dir * len * (0.5 + 0.17 * float(i));
    float br = Rn * (i == 1 ? 0.24 : 0.17);
    float bd = length(p - bc) - br;
    vec3 bcol = i == 1 ? vec3(0.03, 0.12, 0.6) : vec3(0.6, 0.42, 0.12);
    vec3 bl = bcol * lit * (0.7 + 0.6 * ss(br, -br, dot(p - bc, vec2(0.7, -0.7))));
    bl += vec3(1.0) * ss(br * 0.35, 0.0, length(p - bc - vec2(-0.35, 0.4) * br)) * (0.3 + 2.0 * sweepAt(p.y));
    col = mix(col, bl, ss(gPx, -gPx, bd));
  }
  // the tassel under the eye
  vec2 tq = rot(-th) * (p - (dc + dir * Rn));
  float tl = Rn * 0.9;
  float tw = Rn * (0.12 + 0.2 * clamp(-tq.y / tl, 0.0, 1.0));
  float tas = ss(gPx, -gPx, abs(tq.x) - tw) * step(-tl, tq.y) * step(tq.y, 0.0);
  float threads = 0.65 + 0.35 * sin(tq.x / Rn * 60.0);
  col = mix(col, vec3(0.03, 0.1, 0.45) * lit * threads, tas);
  // the eye: blue glass round a white ring, a pale blue ring and the black pupil; it turns
  // slowly on its cord, so now and then it shows its edge
  vec2 lq = rot(-th) * (p - dc);
  float spin = cos(uTime * 0.45);
  float sq = max(abs(spin), 0.16);
  lq.x /= sq;
  float r = length(lq) / Rn;
  float pr = gPx / (Rn * sq);
  if (r < 1.0 + pr * 2.0) {
    vec3 c = vec3(0.02, 0.1, 0.62);
    c = mix(c, vec3(0.85, 0.86, 0.85), ss(0.62 + pr, 0.62 - pr, r));
    c = mix(c, vec3(0.3, 0.62, 1.0), ss(0.46 + pr, 0.46 - pr, r));
    c = mix(c, vec3(0.006), ss(0.24 + pr, 0.24 - pr, r));
    c = mix(c, vec3(0.03, 0.08, 0.4), ss(0.4, 0.0, sq) * 0.8);        // seen edge on: just the blue glass
    float dome = sqrt(max(1.0 - r * r, 0.0));
    vec3 ec = c * lit * (0.55 + 0.6 * dome);
    ec += c * bh * 1.6 * (1.0 - dome);                           // the light coming through the glass round its edge
    vec2 hl = lq / Rn - vec2(-0.32, 0.42);
    ec += vec3(1.0, 0.95, 0.9) * exp(-dot(hl, hl) * 30.0) * (0.25 + 0.4 * gPass + 3.0 * sweepAt(p.y));
    ec = mix(ec, vec3(0.01, 0.03, 0.12) * lit, ss(0.88, 1.0, r) * 0.6);
    col = mix(col, ec, ss(1.0 + pr, 1.0 - pr, r));
  }
  return col;
}

void main() {
  musicSignals();
  vec2 p = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  gPf = ss(1.15, 0.72, gAsp);                                      // 1 for a phone held upright
  gF = 1.55;
  gH0 = mix(0.1, 0.12, gPf);
  float travel = uCruise * SPEED;
  gT = mod(travel, 174720.0);                                      // every spacing on the road divides this
  gS0 = mod(travel, TAU * CL);
  gCos0 = cos(gS0 / CL);
  gSin0 = sin(gS0 / CL);
  gCityAz = bend(1400.0) / 1400.0;
  gSpeed = SPEED * uCruiseRate;
  gShutter = 0.03 + 0.16 * gBass;                                  // the light trails grow with the bass
  gSteer = -CA / CL * gCos0 * 700.0;

  // the cabin's layout: a wide windscreen with the mirror off to the right, or a tall one on a phone
  gDash = mix(-0.40, -0.47, gPf);
  gHead = mix(0.86, 0.9, gPf);
  gPilL = mix(-gAsp * 0.87, -gAsp - 0.35, gPf);
  gPilR = mix(gAsp * 0.92, gAsp + 0.35, gPf);
  gMir = mix(vec2(0.88, 0.69), vec2(0.2, 0.73), gPf);
  gMirS = mix(vec2(0.27, 0.075), vec2(0.21, 0.062), gPf);
  gPiv1 = vec2(mix(-0.62, -0.4, gPf), gDash - 0.13);
  gPiv2 = vec2(mix(0.5, 0.22, gPf), gDash - 0.13);
  gLen1 = mix(1.12, 0.95, gPf);
  gLen2 = mix(1.05, 0.9, gPf);

  // the beat: the cabin sweep on every beat, the wipers on every other one
  float wipeBeat = step(mod(uBeatCount, 2.0), 0.5);
  gLastWipe = uTime - uBeatAge - (1.0 - wipeBeat) * 0.5;
  gTw = uTime - gLastWipe;
  gWipeOn = step(0.5, uAudioActive) * step(0.5, uBeatCount);
  gSweep = uAudioActive * uPunch * ss(0.0, 0.03, uBeatAge) * ss(0.44, 0.26, uBeatAge);
  gSweepY = mix(1.25, -1.35, clamp(uBeatAge / 0.38, 0.0, 1.0));
  float zl = SP - mod(gT, SP);
  gPass = ss(18.0, 10.0, zl) * ss(0.0, 2.5, zl);
  gPassY = gDash + 0.1 - (1.0 - clamp(zl / 14.0, 0.0, 1.0)) * 1.4;
  // the engine's hum (bass) and the road under the tyres
  gShake = vec2(sin(uTime * 71.0), sin(uTime * 53.0 + 1.3)) * 0.0024 * gBass
         + vec2(0.0, (noise(vec2(uTime * 2.1, 0.5)) - 0.5) * 0.004 + (noise(vec2(uTime * 7.0, 3.5)) - 0.5) * 0.0015);
  {
    float u, z, kind, seed;
    carAt(0, u, z, kind, seed);
    gCar0 = proj(u, 0.86, z);
  }

  float gd = glassD(p);
  float inGlass = ss(-gPx, gPx, gd);
  vec3 outC = vec3(0.0);
  if (gd > -gPx * 2.0) {
    vec3 glow;
    outC = outside(p + gShake, glow);
    outC = beads(p, outC, glow);
    outC = wipers(p, outC);
    outC += glow;
    outC += vec3(0.05, 0.025, 0.008) * exp(-(p.y - gDash) * 9.0) * exp(-pow(p.x / 0.6, 2.0)) * 0.5;   // the cluster mirrored in the glass
    outC *= 1.0 - frit(p, gd) * 0.97;
  }
  vec3 col = mix(frame(p, gd), outC, inGlass);
  col = dashboard(p, col);
  col = wheel(p, col);
  col = mirror(p, col);
  col = nazar(p, col, outC);
  col += (hash21(p * uRes.y + fract(uTime * 7.0) * 61.0) - 0.5) / 255.0;   // dither the dark gradients
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'highway',
  name: 'Highway',
  group: 'Journey',
  blurb: 'A rainy night drive into the city, noir style: wet asphalt full of streaks, real traffic, a nazar swinging from the mirror, wipers on the beat',
  tags: ['vehicle', 'night', 'city', '3d', 'rain', 'turkish'],
  energy: 0.5,
  particles: 0,
  trails: 0,
  zoom: 1,
  spin: 0,
  frag,
};
