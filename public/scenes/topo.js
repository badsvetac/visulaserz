// TOPO — a survey map of ground that will not keep still.
//
// The terrain is noise plus a hill in the middle that the bass raises, and the picture is only its
// contour lines, kept one pixel wide everywhere by dividing by the screen-space gradient. Height is
// frequency: the valleys glow with the bass and the summits with the treble. A survey beam sweeps
// across on the travel clock, every fifth contour is an index line, and a beat sends a ring of
// disturbance out through the ground itself, so the lines shiver as it passes.
const frag = `
float ground(vec2 q) {
  float h = fbm(q * 1.15 + vec2(uTime * 0.015, 0.0)) * 0.85 + 0.25 * fbm(q * 3.1 + 5.0);
  h += (0.10 + 0.32 * uBass) * exp(-dot(q, q) * 1.6);
  float r = length(q) - uBeatAge * 1.2;
  h += 0.04 * sin(r * 30.0) * exp(-r * r * 30.0) * exp(-uBeatAge * 2.0) * uPunch;
  return h;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float h = ground(p);
  float f = h * 16.0;
  float fw = max(fwidth(f), 1e-4);
  float nearPx = abs(fract(f - 0.5) - 0.5) / fw;                           // distance to the nearest contour, in pixels
  float idx = abs(fract(f / 5.0 - 0.5) - 0.5) * 5.0 / fw;                // … and to the nearest index contour
  float line = 1.0 - ss(0.5, 1.5, nearPx);
  float index = 1.0 - ss(1.0, 2.4, idx);

  float band = spec(clamp(h * 0.95 - 0.08, 0.02, 0.95));
  vec3 tint = pal(h * 0.7 + 0.35);
  vec3 col = tint * 0.030 * (0.5 + floor(f) / 16.0);                     // hypsometric tint, very faint
  col += tint * line * (0.10 + 1.5 * band) + mix(tint, vec3(1.0), 0.4) * index * (0.25 + 1.2 * band);

  // the survey beam
  float sx = (fract(uTravel * 0.03) * 2.4 - 1.2) * aspect;
  float beam = exp(-abs(p.x - sx) * 26.0);
  col += (pal(0.1) * 0.10 + tint * (line + index) * 1.3) * beam;
  col += pal(0.1) * (1.0 - ss(0.0, 0.002, abs(p.x - sx))) * 0.35;

  // graticule, and trig points marked with a cross
  vec2 gq = abs(fract(p * 2.0) - 0.5);
  col += vec3(0.5, 0.6, 0.8) * 0.035 * (1.0 - ss(0.0, 0.006, 0.5 - max(gq.x, gq.y)));
  vec2 cellId = floor(p * 2.0);
  vec2 tp = (cellId + 0.2 + 0.6 * vec2(hash21(cellId), hash21(cellId + 7.0))) / 2.0;
  vec2 tv = abs(p - tp);
  float mark = (1.0 - ss(0.0, 0.0025, min(tv.x, tv.y))) * step(max(tv.x, tv.y), 0.022) * step(0.55, hash21(cellId + 3.0));
  col += vec3(1.0, 0.9, 0.7) * mark * (0.35 + uHigh);
  col *= 1.0 - 0.4 * ss(0.8, 1.9, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'topo',
  name: 'Topo',
  group: 'Lab',
  blurb: 'Contour map of ground that will not keep still; beats ripple through it',
  tags: ['science', 'geometric', 'abstract'],
  energy: 0.45,
  particles: 0,
  trails: 0.35,
  zoom: 1,
  spin: 0,
  frag,
};
