// PLASMA — the globe from the science shop.
//
// Nine filaments wander from the electrode to the glass, one band each: a loud band makes its
// filament thick and white-hot, a quiet one leaves a thread. The tenth is the "finger on the
// glass" — it follows the bass, swings with the stereo balance, and snaps to a new spot on the
// beat. Where a filament meets the glass it blooms, and the room behind takes its colour.
const frag = `
const float R = 0.64;

float arc(vec2 v, float a0, float seed, float wander, float t) {
  float r = length(v);
  float u = clamp(r / R, 0.0, 1.0);
  float th = atan(v.y, v.x);
  // the path bows and writhes most in mid-air, and is pinned at both ends
  float bend = sin(u * PI) * ((noise(vec2(u * 3.0 - t * 1.6, seed)) - 0.5) * wander + (noise(vec2(u * 11.0 - t * 4.0, seed + 9.0)) - 0.5) * wander * 0.35);
  float d = abs(mod(th - (a0 + bend) + PI, TAU) - PI) * r;
  return d;
}

void main() {
  vec2 p = centered();
  vec2 c = vec2(0.0, 0.10);
  vec2 v = p - c;
  float r = length(v);
  float t = uTime;
  vec3 hot = mix(vec3(0.75, 0.55, 1.0), pal(0.72), 0.5);
  vec3 col = vec3(0.0);
  float inGlobe = 1.0 - ss(R - 0.004, R, r);

  vec3 glowSum = vec3(0.0);
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float band = spec(0.03 + fi / 8.0 * 0.78);
    float a0 = fi / 9.0 * TAU + 1.2 * (noise(vec2(t * 0.12 + fi * 7.0, fi)) - 0.5) * 3.0;
    float d = arc(v, a0, fi * 13.0 + 1.0, 1.1, t);
    float w = 0.0012 + 0.006 * band;
    vec3 tint = mix(hot, pal(0.55 + fi * 0.05), 0.35);
    glowSum += (tint * (w / (d + w)) + vec3(1.0) * (w * 0.4 / (d + w * 0.4)) * band) * (0.25 + 1.5 * band);
    // the bloom where it lands on the glass
    vec2 land = c + R * vec2(cos(a0), sin(a0));
    glowSum += tint * (0.0006 / (dot(p - land, p - land) + 0.0012)) * (0.2 + 1.4 * band);
  }
  // the finger: a fat arc that goes where the bass sends it
  float fa = PI * 0.5 - uBalance * 1.2 + (hash11(uBeatCount * 1.7) - 0.5) * 2.4 + 0.2 * sin(t * 0.7);
  float fd = arc(v, fa, 77.0, 0.7, t);
  float fw = 0.002 + 0.012 * uBass;
  glowSum += (hot * (fw / (fd + fw)) + vec3(1.0) * (fw * 0.5 / (fd + fw * 0.5))) * (0.3 + 2.0 * uBass);
  vec2 fl = c + R * vec2(cos(fa), sin(fa));
  glowSum += hot * (0.002 / (dot(p - fl, p - fl) + 0.002)) * (0.2 + 2.0 * uBass + uBeat * uPunch);

  col += glowSum * inGlobe;
  col += hot * exp(-r * 5.0) * 0.25 * (0.6 + uLevel) * inGlobe;                      // the gas itself glows faintly
  // electrode
  col = mix(col, vec3(0.02) + hot * 0.9 * (0.5 + uLevel), 1.0 - ss(0.060, 0.064, r));
  col += vec3(1.0) * (0.004 / (r * r + 0.004)) * 0.20 * inGlobe;

  // glass: rim, a window reflection, a soft highlight
  col += hot * 0.10 * pow(ss(R * 0.55, R, r), 3.0) * inGlobe + vec3(0.5, 0.55, 0.7) * (1.0 - ss(0.0, 0.006, abs(r - R))) * 0.35;
  vec2 hv = v - vec2(-0.28, 0.30);
  col += vec3(0.9, 0.95, 1.0) * exp(-dot(hv * vec2(5.0, 9.0), hv * vec2(5.0, 9.0))) * 0.22 * inGlobe;

  // the stand, the table, and the room taking the colour of the discharge
  float baseY = c.y - R;
  float stand = step(abs(p.x), 0.20 + (baseY - p.y) * 0.35) * step(p.y, baseY + 0.05) * step(-0.95, p.y) * (1.0 - inGlobe);
  col = mix(col, vec3(0.018, 0.018, 0.022) + vec3(0.12) * exp(-abs(p.x + 0.08) * 22.0) + hot * 0.06 * ss(-0.95, baseY, p.y), stand);
  float room = (1.0 - inGlobe) * (1.0 - stand);
  col += hot * 0.06 * exp(-max(r - R, 0.0) * 1.6) * (0.5 + uLevel + 0.6 * uBeat * uPunch) * room;
  col += hot * 0.05 * exp(-abs(p.y + 0.95) * 12.0) * exp(-abs(p.x) * 1.5) * room;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'plasma',
  name: 'Plasma',
  group: 'Things',
  blurb: 'Plasma globe whose nine filaments thicken white-hot with their bands',
  tags: ['science', 'night', 'organic'],
  energy: 0.65,
  particles: 0,
  trails: 0.5,
  zoom: 1,
  spin: 0,
  frag,
};
