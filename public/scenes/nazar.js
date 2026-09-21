// NAZAR — evil-eye beads hanging in a window.
//
// Eleven glass beads on cords of different lengths, one band each: a bead swings with its band and
// the light inside the glass grows with it. They are lit from behind, so each throws a soft ring
// of its own blue, and the bokeh of the street outside drifts on the travel clock. A beat sets the
// whole row swaying together for a moment.
const frag = `
vec4 bead(vec2 p, vec2 c, float r, float glow) {
  vec2 v = p - c;
  float d = length(v);
  if (d > r * 1.05) return vec4(0.0);
  float u = d / r;
  // cobalt, white, pale blue, and the dark pupil, poured one inside the other and never quite centred
  vec2 off = v - vec2(0.06, -0.05) * r;
  float uo = length(off) / r;
  vec3 col = vec3(0.02, 0.10, 0.55);
  col = mix(col, vec3(0.93, 0.95, 0.98), 1.0 - ss(0.60, 0.63, uo));
  col = mix(col, vec3(0.30, 0.66, 0.92), 1.0 - ss(0.40, 0.43, uo));
  col = mix(col, vec3(0.02, 0.02, 0.05), 1.0 - ss(0.19, 0.22, uo));
  // glass: light through the body, a rim, and the window reflected in it
  col *= 0.45 + 0.75 * glow + 0.35 * (1.0 - u * u);
  col += vec3(0.35, 0.55, 1.0) * pow(u, 6.0) * 0.35;
  vec2 hv = (v / r - vec2(-0.38, 0.40)) * vec2(3.2, 5.0);
  col += vec3(1.0) * exp(-dot(hv, hv)) * 0.55;
  return vec4(col, 1.0 - ss(0.97, 1.03, u));
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float t = uTime;

  // the street outside, out of focus
  vec3 col = mix(vec3(0.030, 0.035, 0.070), vec3(0.008, 0.010, 0.025), ss(-0.8, 0.9, p.y)) + pal(0.6) * 0.02;
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    vec2 bc = vec2(mod(hash11(fi * 3.1 + 1.0) + uTravel * 0.002 * (0.5 + hash11(fi * 1.3)), 1.0) * aspect * 2.4 - aspect * 1.2, (hash11(fi * 5.7 + 2.0) - 0.5) * 1.6);
    float br = 0.07 + 0.10 * hash11(fi * 7.9);
    float d = length(p - bc);
    float disc = (1.0 - ss(br * 0.92, br, d)) * (0.75 + 0.25 * ss(br * 0.6, br, d));
    col += mix(vec3(1.0, 0.75, 0.45), pal(hash11(fi * 9.1)), 0.55) * disc * 0.09 * (0.4 + 1.6 * spec(hash11(fi * 2.2) * 0.8));
  }

  float sway = exp(-uBeatAge * 1.4) * sin(uBeatAge * 7.0) * 0.10 * uPunch;
  for (int i = 0; i < 11; i++) {
    float fi = float(i);
    float band = spec(0.03 + fi / 10.0 * 0.78);
    float x0 = (fi / 10.0 - 0.5) * aspect * 1.75;
    float len = 0.45 + 0.75 * hash11(fi * 4.3 + 1.0);
    float ang = 0.10 * sin(t * (1.1 + 0.3 * hash11(fi)) + fi * 2.0) * (0.3 + 1.6 * band) + sway;
    vec2 top = vec2(x0, 1.05);
    vec2 c = top + len * vec2(sin(ang), -cos(ang));
    float r = 0.095 + 0.055 * hash11(fi * 6.1 + 3.0);
    // the cord
    vec2 pa = p - top, ba = c - top;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    col = mix(col, vec3(0.05, 0.10, 0.30), 1.0 - ss(0.0015, 0.0035, length(pa - ba * h)));
    // the ring of coloured light it throws
    vec2 gv = p - c;
    col += vec3(0.10, 0.30, 1.0) * (0.004 / (dot(gv, gv) + 0.02)) * (0.10 + 1.0 * band);
    vec4 b = bead(p, c, r, band);
    col = mix(col, b.rgb, b.a);
    // a small gold bead above it
    vec2 kv = p - (c + normalize(top - c) * (r + 0.018));
    col = mix(col, vec3(0.95, 0.75, 0.30) * (0.6 + 0.6 * ss(0.014, 0.0, length(kv - vec2(-0.004, 0.004)))), 1.0 - ss(0.011, 0.014, length(kv)));
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'nazar',
  name: 'Nazar',
  group: 'Things',
  blurb: 'Evil-eye beads in a window, one band each, swaying together on a beat',
  tags: ['turkish', 'night', 'calm'],
  energy: 0.3,
  particles: 0,
  trails: 0.25,
  zoom: 1,
  spin: 0,
  frag,
};
