// NIGHTFLIGHT — the window seat, three kilometres over a city at night.
//
// Out of the oval window: a metropolis laid out below in light. It is built the way cities grow:
// districts, each with its own street grid turned to its own angle and its own block size; sodium
// orange in the old quarters and white LEDs in the new ones; a lamp every thirty-five metres, which
// only shows as separate points close in and blurs into lit lines further off; a downtown where the
// office windows glitter blue-white and the towers blink red; a river snaking through, dark; two
// highways with white headlights coming and red tail-lights going. Cloud drifts beneath the wing,
// lit orange from below by the city and faintly from above by the moon, and the light pollution
// rises into a brown haze along the horizon.
//
// Each district's lights breathe with its own band, so the city shimmers with the mix; the traffic
// runs at the music's cruising speed; the wing-tip strobe double-flashes on the beat; and at the
// start of every eight beats a firework blooms somewhere downtown, a ring of sparks seen from above.
const frag = `
const float ALT = 3.0;              // km above the ground
const float CLOUDS = 1.45;          // km above the ground
const float FOCAL = 1.25;

// How built-up the ground is: towns of every size with dark country between them.
float cityDensity(vec2 w) {
  float d = fbm(w * 0.09 + 3.0) - 0.44 + 0.40 * (fbm(w * 0.33 + 11.0) - 0.5);
  return ss(0.0, 0.30, d);
}
float riverCentre(float x) { return sin(x * 0.21 + 1.3) * 2.6 + sin(x * 0.53) * 0.9 + fbm(vec2(x * 0.3, 7.0)) * 1.6 + 5.0; }
float highway(vec2 w, float k) {
  float c = 3.0 * sin(w.x * 0.07 + k * 3.0) + 1.6 * sin(w.x * 0.19 + k) + k * 7.0 - 3.0;
  float dc = 3.0 * 0.07 * cos(w.x * 0.07 + k * 3.0) + 1.6 * 0.19 * cos(w.x * 0.19 + k);
  return (w.y - c) / sqrt(1.0 + dc * dc);                        // signed distance across the carriageway, km
}

// Districts are irregular cells round jittered centres (a Voronoi diagram), not squares.
vec2 district(vec2 w) {
  vec2 c = floor(w / 2.3);
  float best = 1e9;
  vec2 bestId = c;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = c + vec2(float(i), float(j));
      vec2 site = (id + 0.5 + (vec2(hash21(id), hash21(id + 5.3)) - 0.5) * 0.9) * 2.3;
      float d = length(w - site);
      if (d < best) { best = d; bestId = id; }
    }
  }
  return bestId;
}

// The city at ground point w, for a pixel whose footprint on the ground is px km wide.
vec3 city(vec2 w, float px) {
  float dens = cityDensity(w);
  vec2 dc = district(w);
  float h = hash21(dc);
  vec2 g = rot((h - 0.5) * 1.3) * w;                             // each district has its own grid angle…
  float block = mix(0.085, 0.16, hash21(dc + 3.0));               // …and block size
  vec2 f = abs(fract(g / block) - 0.5) * block;                   // distance to the nearest street, per axis
  float line = min(f.x, f.y);
  // streets are not all alike: each has its own brightness, and a few are dark or missing
  vec2 idx = floor(g / block + 0.5);
  float which = f.x < f.y ? idx.x : idx.y;
  float kind = hash11(which * 7.31 + (f.x < f.y ? 1.0 : 2.0) + dot(dc, vec2(3.1, 5.7)));
  float streetGain = kind < 0.14 ? 0.0 : (kind > 0.9 ? 2.2 : 0.45 + 0.7 * kind);
  float wd = max(0.0025, px * 0.6);
  float street = 1.0 - ss(wd * 0.5, wd * 1.6, line);
  float along = f.x < f.y ? g.y : g.x;
  float lamps = pow(0.5 + 0.5 * cos(along / 0.035 * TAU), 5.0);
  float dots = mix(lamps, 0.45, ss(0.004, 0.015, px));            // far off, the dots merge into lines
  vec3 sodium = vec3(1.0, 0.52, 0.16), led = vec3(0.80, 0.88, 1.0);
  vec3 lampCol = mix(sodium, led, step(0.62, h));
  float band = spec(0.03 + h * 0.78);
  float lit = ss(0.05, 0.3, dens);                                // country roads are mostly dark
  vec3 col = lampCol * street * dots * streetGain * lit * (0.9 + 1.1 * band) * 1.3;
  // arterials cut across the grids on long diagonals, brighter and whiter
  float art = abs(fract((w.x * 0.7 + w.y * 0.7) / 1.6) - 0.5) * 1.6;
  float art2 = abs(fract((w.x * 0.9 - w.y * 0.44) / 2.1) - 0.5) * 2.1;
  float arterial = (1.0 - ss(wd * 0.6, wd * 2.2, art)) + (1.0 - ss(wd * 0.6, wd * 2.2, art2));
  col += vec3(1.0, 0.72, 0.42) * arterial * lit * 1.1;
  // downtown: office windows glitter between the streets
  vec2 lot = floor(g / 0.018);
  float windows = step(0.80, hash21(lot + dc * 7.0)) * ss(0.78, 0.97, dens) * (1.0 - street);
  col += mix(vec3(1.0, 0.85, 0.6), vec3(0.7, 0.85, 1.0), step(0.5, hash21(lot + 1.0))) * windows * 0.45;
  col += lampCol * lit * 0.035;                                    // light spilling off the pavement
  // towers blink red downtown
  float tower = step(0.985, hash21(lot + 17.0)) * ss(0.7, 0.95, dens);
  col += vec3(1.0, 0.08, 0.04) * tower * step(0.5, fract(uTime * 0.7 + hash21(lot) )) * 3.0;
  // the river: dark water, the banks' lights trembling on it
  float rv = abs(w.y - riverCentre(w.x));
  float water = 1.0 - ss(0.12, 0.16, rv);
  col = mix(col, vec3(0.004, 0.006, 0.012) + lampCol * 0.08 * dens * noise(vec2(w.x * 40.0, w.y * 4.0 + uTime)), water);
  // highways: two carriageways each, white lights coming, red going, at the music's cruising speed
  for (int k = 0; k < 2; k++) {
    float d = highway(w, float(k));
    float s = w.x * 12.0;
    for (int lane = 0; lane < 2; lane++) {
      float off = lane == 0 ? -0.012 : 0.012;
      float onLane = 1.0 - ss(0.0, max(0.004, px * 0.8), abs(d - off));
      float dir = lane == 0 ? 1.0 : -1.0;
      float cars = ss(0.75, 0.97, noise(vec2(s * 2.0 - dir * uCruise * 3.5, float(k) * 5.0 + float(lane))));
      vec3 c = lane == 0 ? vec3(1.0, 0.95, 0.85) : vec3(1.0, 0.12, 0.06);
      col += c * onLane * (0.35 + 2.5 * cars) * 0.6;
    }
  }
  return col;
}

vec3 sky(vec3 rd) {
  float up = max(rd.y, 0.0);
  vec3 col = mix(vec3(0.10, 0.055, 0.035), vec3(0.008, 0.012, 0.035), ss(0.0, 0.25, up));   // light pollution on the horizon
  col = mix(col, vec3(0.003, 0.004, 0.012), ss(0.2, 0.7, up));
  vec2 g = vec2(atan(rd.x, rd.z), rd.y) * 160.0;
  vec2 c = floor(g);
  float h = hash21(c);
  vec2 f = fract(g) - 0.5;
  col += vec3(0.8, 0.85, 1.0) * step(0.975, h) * (0.001 / (dot(f, f) + 0.002)) * ss(0.08, 0.3, up);
  return col;
}

// The window, in screen space: < 0 inside the glass.
float windowSdf(vec2 p) {
  vec2 d = abs(p - vec2(0.05, 0.02)) - vec2(0.78, 0.86) + 0.58;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.58;
}

void main() {
  vec2 p = centered();
  float win = windowSdf(p);
  vec3 col;
  if (win < 0.0) {
    // the view: looking out of the left side, down and a little forward, the aircraft rolling gently
    float bank = 0.05 * sin(uTime * 0.11) + 0.03 * sin(uTime * 0.27);
    vec2 q = rot(bank) * p;
    vec3 fw = normalize(vec3(1.0, -0.62, 0.30));
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
    vec3 rd = normalize(fw * FOCAL + rt * q.x + cross(fw, rt) * q.y);
    vec3 ro = vec3(0.0, ALT, uTime * 0.21);                       // about 750 km/h

    if (rd.y > -0.015) {
      col = sky(rd);
    } else {
      float t = ALT / -rd.y;
      vec3 hp = ro + rd * t;
      float px = t * 1.4 / (FOCAL * uRes.y);                       // how much ground one pixel covers
      col = city(hp.xz, px);
      // the firework at the top of each phrase, a ring of sparks downtown seen from above
      float ph = floor(uBeatCount / 8.0);
      float since = mod(uBeatCount, 8.0) + uBeatAge / 0.5;          // in beats, give or take
      vec2 fwc = ro.xz + vec2(3.5 + 3.0 * hash11(ph * 1.7), -1.5 + 4.0 * hash11(ph * 2.9));
      vec2 fv = hp.xz - fwc;
      float fr = length(fv);
      float ringR = 0.5 * (1.0 - exp(-since * 1.4));
      float sparks = pow(0.5 + 0.5 * cos(atan(fv.y, fv.x) * 24.0), 8.0);
      col += pal(hash11(ph * 5.3)) * exp(-abs(fr - ringR) * 40.0) * sparks * exp(-since * 0.8) * 6.0 * step(0.5, uBeatCount);
      col = mix(col, sky(normalize(vec3(rd.x, 0.0, rd.z))) * 0.9, 1.0 - exp(-t * 0.028));
      // cloud drifting between us and the city: lit orange from below, faintly silver from above
      float tc = (ALT - CLOUDS) / -rd.y;
      vec2 cw = ro.xz + rd.xz * tc + vec2(uTime * 0.02, 0.0);
      float cd = ss(0.56, 0.86, fbm(cw * 0.45 + 20.0) * 0.8 + 0.3 * fbm(cw * 1.7));
      float below = cityDensity(cw);
      vec3 under = vec3(1.0, 0.55, 0.25) * (0.06 + 0.42 * below) * (0.8 + 0.4 * uLevel) + vec3(0.018, 0.020, 0.028);
      under *= 0.75 + 0.5 * fbm(cw * 3.1 + 5.0);                   // lumpy: thicker parts catch more
      col = mix(col, under, cd * 0.72);
    }

    // the wing: fixed to the aircraft, so it does not roll with the view
    float lead = -0.46 - (p.x + 0.9) * 0.04;                      // leading edge, nearly level
    float trail = -0.95 + (p.x + 0.9) * 0.34;                     // trailing edge, rising to meet it at the tip
    const float tipX = 0.30;
    float wing = step(p.y, lead) * step(trail, p.y) * step(p.x, tipX);
    float winglet = step(abs(p.x - (tipX - 0.02)), 0.02) * step(lead, p.y) * step(p.y, lead + 0.13);
    float wm = max(wing, winglet);
    vec2 tip = vec2(tipX - 0.02, -0.46 - (tipX - 0.02 + 0.9) * 0.04 + 0.13);
    float strobe = (exp(-uBeatAge * 22.0) + exp(-max(uBeatAge - 0.13, 0.0) * 22.0) * step(0.13, uBeatAge)) * uPunch;
    vec3 wingCol = vec3(0.020, 0.022, 0.028) + vec3(0.06, 0.05, 0.05) * ss(-0.9, 0.4, p.x) * 0.3;
    wingCol += vec3(0.14, 0.09, 0.06) * (1.0 - ss(0.0, 0.025, lead - p.y)) * 0.5;              // the leading edge catches the city's glow
    wingCol *= 1.0 - 0.5 * (1.0 - ss(0.0, 0.004, abs(p.y - mix(trail, lead, 0.35))));          // a flap line
    wingCol += vec3(0.9, 0.95, 1.0) * strobe * 0.35 * exp(-length(p - tip) * 3.0);
    col = mix(col, wingCol, wm);
    vec2 tv = p - tip;
    col += vec3(1.0, 0.08, 0.05) * (0.00018 / (dot(tv, tv) + 0.00012));                 // the red navigation light
    col += vec3(1.0) * strobe * (0.0006 / (dot(tv, tv) + 0.0003));                       // the strobe

    // the inner pane: a little breather hole, frost creeping in at the rim, the glass itself
    col += vec3(0.06, 0.07, 0.09) * ss(-0.10, 0.0, win) * (0.4 + 0.6 * noise(p * 60.0));
    vec2 hole = p - vec2(0.05, -0.78);
    col = mix(col, vec3(0.02), 1.0 - ss(0.006, 0.010, length(hole)));
  } else {
    // the cabin: a plastic bezel round the window, the wall beyond it, the shade tucked up at the top
    float bezel = 1.0 - ss(0.0, 0.11, win);
    vec3 wall = vec3(0.045, 0.043, 0.042) * (0.7 + 0.3 * ss(-1.0, 1.0, p.y)) * (0.8 + 0.2 * noise(p * 6.0));
    vec3 lip = vec3(0.07, 0.066, 0.064) * (0.6 + 0.4 * ss(0.11, 0.0, win)) + vec3(0.10, 0.06, 0.03) * 0.25 * bezel * (0.5 + uLevel);
    col = mix(wall, lip, bezel);
    col = mix(col, vec3(0.02), (1.0 - ss(0.0, 0.01, abs(win - 0.11))) * 0.8);
    float shade = step(0.86 + 0.02, p.y) * step(abs(p.x - 0.05), 0.5);
    col = mix(col, vec3(0.03), shade * 0.6);
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'nightflight',
  name: 'Nightflight',
  group: 'Journey',
  blurb: 'The window seat over a city at night; districts shimmer by band, the wing strobe flashes on the beat',
  tags: ['night', 'city', 'vehicle', 'calm'],
  energy: 0.35,
  particles: 0,
  trails: 0.15,
  zoom: 1,
  spin: 0,
  frag,
};
