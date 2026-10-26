// NIXIE — a desk of cold-cathode tubes counting the beats.
//
// Six Nixie tubes show how many beats have gone by: every kick clicks the counter on, the last
// digit changing each beat, the next every ten. In a Nixie tube the ten digits are bent wires
// stacked one behind another, and the one that is lit glows neon orange through a honeycomb anode
// mesh while the unlit ones stay faintly visible around it as dark metal — so all ten are drawn,
// each digit a set of hand-drawn arcs and strokes. When a digit changes the old one fades for a few
// milliseconds, the way a cathode's glow dies.
//
// Beneath them sixteen IN-13 bargraph tubes are the analyser: a column of glow climbs each one with
// its band, its tip bright where the discharge ends. On the left a dekatron — a counting tube — walks
// its glowing spot one pin further round its ring on every beat; on the right a "magic eye" tuning
// indicator closes its dark shadow as the music gets louder.
const frag = `
const vec3 NEON = vec3(1.0, 0.42, 0.10);

float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
float ring(vec2 p, vec2 c, vec2 r) { return abs(length((p - c) / r) - 1.0) * min(r.x, r.y); }
// an arc of radius r round c, counter-clockwise from angle a0 to a1 (radians)
float arc(vec2 p, vec2 c, float r, float a0, float a1) {
  vec2 q = p - c;
  float span = mod(a1 - a0 + TAU, TAU);
  float rel = mod(atan(q.y, q.x) - a0 + TAU, TAU);
  if (rel <= span) return abs(length(q) - r);
  return min(length(p - c - r * vec2(cos(a0), sin(a0))), length(p - c - r * vec2(cos(a1), sin(a1))));
}
float rad(float d) { return d * PI / 180.0; }
float sq(float x) { return x * x; }                        // pow(x, 2.0) is undefined for negative x

// The ten Nixie numerals, as distance to their wire, in a box 1 wide and 1.6 tall.
float digit(vec2 p, int d) {
  if (d == 9) { p = -p; d = 6; }
  if (d == 0) return ring(p, vec2(0.0), vec2(0.40, 0.70));
  if (d == 1) return min(seg(p, vec2(0.06, -0.70), vec2(0.06, 0.70)), seg(p, vec2(0.06, 0.70), vec2(-0.20, 0.46)));
  if (d == 2) {
    vec2 e = vec2(0.36 * cos(rad(-35.0)), 0.33 + 0.36 * sin(rad(-35.0)));
    return min(min(arc(p, vec2(0.0, 0.33), 0.36, rad(-35.0), rad(160.0)), seg(p, e, vec2(-0.38, -0.70))), seg(p, vec2(-0.38, -0.70), vec2(0.40, -0.70)));
  }
  if (d == 3) return min(arc(p, vec2(0.0, 0.36), 0.33, rad(-90.0), rad(150.0)), arc(p, vec2(0.0, -0.34), 0.36, rad(-150.0), rad(90.0)));
  if (d == 4) return min(min(seg(p, vec2(0.20, 0.70), vec2(0.20, -0.70)), seg(p, vec2(0.20, 0.70), vec2(-0.40, -0.24))), seg(p, vec2(-0.40, -0.24), vec2(0.42, -0.24)));
  if (d == 5) {
    vec2 j = vec2(0.40 * cos(rad(120.0)), -0.26 + 0.40 * sin(rad(120.0)));
    return min(min(seg(p, vec2(0.38, 0.70), vec2(-0.30, 0.70)), seg(p, vec2(-0.30, 0.70), j)), arc(p, vec2(0.0, -0.26), 0.40, rad(-150.0), rad(120.0)));
  }
  if (d == 6) return min(ring(p, vec2(0.0, -0.30), vec2(0.38, 0.38)), arc(p, vec2(0.75, -0.30), 1.13, rad(118.0), rad(180.0)));
  if (d == 7) return min(seg(p, vec2(-0.38, 0.70), vec2(0.40, 0.70)), seg(p, vec2(0.40, 0.70), vec2(-0.12, -0.70)));
  return min(ring(p, vec2(0.0, 0.37), vec2(0.30, 0.33)), ring(p, vec2(0.0, -0.32), vec2(0.37, 0.38)));   // 8
}

// Glass: a cylinder seen from the front, with its highlights. q is in the tube's box, half-size hs.
vec3 glass(vec2 q, vec2 hs, out float inside) {
  vec2 d = abs(q) - hs + vec2(0.0, hs.x);
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - hs.x;    // round-topped
  inside = 1.0 - ss(-0.004, 0.004, sd);
  float x = q.x / hs.x;
  vec3 hl = vec3(0.8, 0.85, 0.9) * (exp(-sq((x + 0.72) * 9.0)) * 0.20 + exp(-sq((x - 0.8) * 14.0)) * 0.08);
  hl += vec3(0.8) * exp(-sq((q.y - hs.y + hs.x * 0.55) * 18.0)) * exp(-x * x * 4.0) * 0.10;
  return hl * inside + vec3(0.30, 0.32, 0.35) * (1.0 - ss(0.0, 0.006, abs(sd))) * 0.35;
}

// One Nixie tube: shows 'on', and 'was' fading out.
vec3 nixie(vec2 q, int on, int was, float fade) {
  vec2 hs = vec2(0.165, 0.36);
  float inside;
  vec3 col = glass(q, hs, inside);
  if (inside < 0.01) return col;
  vec2 dp = (q - vec2(0.0, -0.02)) / 0.36 * vec2(1.0, 1.0) * 1.05;   // into the digits' box
  float dOn = digit(dp, on);
  float dWas = digit(dp, was);
  float w = 0.035;
  float glowOn = exp(-dOn * dOn / (w * w)) + 0.35 / (1.0 + dOn * dOn * 900.0);
  float glowWas = (exp(-dWas * dWas / (w * w)) + 0.35 / (1.0 + dWas * dWas * 900.0)) * fade;
  vec3 neon = NEON * (1.0 + 0.15 * uLevel);
  col += neon * (glowOn * 1.7 + glowWas * 1.2);
  col += NEON * 0.10 * exp(-length(dp) * 1.2) * inside;                   // the tube full of orange haze
  // the other nine: dark metal wires, lit a little by the glow around them
  float wires = 1e3;
  for (int k = 0; k < 10; k++) if (k != on) wires = min(wires, digit(dp + vec2(0.0, 0.0), k));
  float wire = 1.0 - ss(w * 0.35, w * 0.9, wires);
  col = mix(col, vec3(0.05, 0.035, 0.03) + NEON * 0.12 * exp(-dOn * 6.0), wire * 0.8 * (1.0 - ss(0.0, w, dOn)));
  // the honeycomb anode in front of everything
  vec2 hx = q * 55.0;
  vec2 hq = vec2(hx.x + hx.y * 0.57735, hx.y * 1.1547);
  vec2 hf = fract(hq) - 0.5;
  float hex = max(abs(hf.x), max(abs(hf.y), abs(hf.x + hf.y)));
  col *= 1.0 - 0.28 * ss(0.42, 0.5, hex) * inside;
  // the socket
  col = mix(col, vec3(0.02, 0.02, 0.022), step(q.y, -hs.y + 0.04));
  return col;
}

// An IN-13 bargraph tube: a thin glass rod with a glowing column of height h (0..1).
vec3 bargraph(vec2 q, float h) {
  vec2 hs = vec2(0.028, 0.30);
  float inside;
  vec3 col = glass(q, hs, inside);
  if (inside < 0.01) return col;
  float y = (q.y + hs.y - 0.03) / (hs.y * 2.0 - 0.08);                  // 0 at the bottom of the discharge
  float cathode = 1.0 - ss(0.002, 0.005, abs(q.x));
  col += vec3(0.10, 0.09, 0.08) * cathode * 0.6;
  float lit = step(y, h) * step(0.0, y);
  float core = exp(-q.x * q.x / 0.00006);
  col += NEON * lit * (0.6 * core + 0.03) * 1.7;
  col += vec3(1.0, 0.7, 0.4) * exp(-abs(y - h) * 90.0) * core * 2.2 * step(0.01, h);   // the tip where the glow ends
  col = mix(col, vec3(0.02), step(q.y, -hs.y + 0.02));
  return col;
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = centered() / min(1.0, aspect / 1.45);             // the desk is 2.9 wide: narrow screens see all of it, smaller
  // the room and the desk
  vec3 col = vec3(0.012, 0.010, 0.010) + NEON * 0.035 * exp(-length((p - vec2(0.0, 0.1)) * vec2(0.5, 1.2)) * 2.0) * (0.7 + 0.5 * uLevel);
  if (p.y < -0.92) {
    float grain = 0.6 + 0.4 * noise(vec2(p.x * 3.0, p.y * 90.0) + noise(p * 5.0) * 3.0);
    col = vec3(0.07, 0.035, 0.018) * grain * (0.5 + 0.5 * exp(-abs(p.x) * 0.6)) + NEON * 0.05;
  }
  // the chassis the tubes stand on
  float chassis = step(abs(p.y + 0.25), 0.03);
  col = mix(col, vec3(0.05, 0.05, 0.055) + NEON * 0.08 * (1.0 - ss(0.0, 0.03, abs(p.y + 0.22))), chassis);

  // the counter: beats so far, six digits, in pairs with neon colons between them
  float n = uBeatCount;
  float fade = exp(-uBeatAge * 28.0);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float x = (2.5 - fi) * 0.40 + (i < 2 ? 0.16 : (i < 4 ? 0.0 : -0.16));   // pairs, with room for colons
    vec2 q = p - vec2(x, 0.16);
    if (abs(q.x) > 0.2 || abs(q.y) > 0.4) continue;
    float pw = pow(10.0, fi);
    int on = int(mod(floor(n / pw), 10.0));
    int was = int(mod(floor(max(n - 1.0, 0.0) / pw), 10.0));
    col = nixie(q, on, was, was == on ? 0.0 : fade) + col * 0.15;
  }
  for (int c = 0; c < 2; c++) {
    float x = c == 0 ? -0.48 : 0.48;
    for (int d = 0; d < 2; d++) {
      vec2 lv = p - vec2(x, 0.08 + float(d) * 0.16);
      float lamp = 0.4 + 0.6 * step(mod(n, 2.0), 0.5);
      col += NEON * (0.0006 / (dot(lv, lv) + 0.0004)) * lamp;
    }
  }

  // the analyser: sixteen bargraph tubes
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    vec2 q = p - vec2((fi - 7.5) * 0.105, -0.60);
    if (abs(q.x) > 0.05 || abs(q.y) > 0.32) continue;
    float h = peak(0.02 + fi / 15.0 * 0.8) * 0.3 + spec(0.02 + fi / 15.0 * 0.8) * 0.8;
    col = bargraph(q, clamp(h, 0.0, 1.0)) + col * 0.2;
  }

  // the dekatron: a glowing spot walks one pin round the ring per beat
  vec2 dq = p - vec2(-1.18, -0.60);
  float dr = length(dq);
  if (dr < 0.24) {
    float ang = atan(dq.y, dq.x);
    float pin = floor((ang + PI) / TAU * 30.0 + 0.5);
    vec2 pinPos = 0.15 * vec2(cos(pin / 30.0 * TAU - PI), sin(pin / 30.0 * TAU - PI));
    float at = mod(n + ss(0.0, 0.08, uBeatAge), 30.0);
    float sa = at / 30.0 * TAU - PI;
    vec2 spot = 0.15 * vec2(cos(sa), sin(sa));
    col = vec3(0.02, 0.018, 0.02) + vec3(0.18) * (1.0 - ss(0.005, 0.012, length(dq - pinPos)));
    col += NEON * (0.0010 / (dot(dq - spot, dq - spot) + 0.0007)) * (0.8 + 0.4 * uLevel);
    col += vec3(0.8) * exp(-sq((dr - 0.2) * 60.0)) * 0.10;         // the glass dome's rim
    col += NEON * 0.05 * (1.0 - ss(0.0, 0.2, dr));
  }

  // the magic eye: a green fan whose dark shadow closes as the music gets louder
  vec2 eq = p - vec2(1.18, -0.60);
  float er = length(eq);
  if (er < 0.24) {
    float ang = abs(atan(eq.x, eq.y));                                   // 0 straight up
    float open = mix(0.9, 0.06, clamp(uLevel * 1.2, 0.0, 1.0));
    vec3 green = vec3(0.25, 1.0, 0.45);
    float fan = ss(open, open + 0.05, ang) * ss(0.05, 0.08, er) * (1.0 - ss(0.16, 0.18, er));
    col = vec3(0.01, 0.015, 0.012) + green * fan * (0.55 + 0.45 * er / 0.18);
    col = mix(col, vec3(0.03), 1.0 - ss(0.045, 0.055, er));              // the cap over the cathode
    col += vec3(0.8) * exp(-sq((er - 0.205) * 60.0)) * 0.10;
  }
  col *= 1.0 - 0.35 * ss(0.8, 2.0, length(p * vec2(0.7, 1.0)));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'nixie',
  name: 'Nixie',
  group: 'Things',
  blurb: 'Neon Nixie tubes count the beats, bargraph tubes are the analyser, a magic eye reads the level',
  tags: ['retro', 'analyser', 'text', 'light'],
  energy: 0.45,
  particles: 3,
  trails: 0.0,
  zoom: 1,
  spin: 0,
  frag,
};
