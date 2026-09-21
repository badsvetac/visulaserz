const frag = `
void main() {
  vec2 p = centered();
  p *= 1.0 - uBeat * 0.05 * uPunch;
  p.x -= uBalance * 0.07;
  float r = length(p);
  float a = atan(p.x, -p.y);
  float am = abs(a) / PI;
  float R0 = 0.33 + uBass * 0.06;

  const float N = 64.0;
  float cell = am * N;
  float cx = (floor(cell) + 0.5) / N;
  float fx = pow(cx, 1.25) * 0.9;
  float h = spec(fx);
  float barLen = 0.012 + h * 0.5;
  float f = fract(cell);
  float gap = ss(0.0, 0.18, f) * (1.0 - ss(0.82, 1.0, f));
  float bar = ss(R0, R0 + 0.006, r) * (1.0 - ss(R0 + barLen, R0 + barLen + 0.008, r)) * gap;
  vec3 barCol = pal(cx * 0.55 + uTime * 0.02);
  float along = clamp((r - R0) / max(barLen, 0.001), 0.0, 1.0);
  vec3 col = barCol * bar * (0.5 + 1.7 * h) * (0.55 + 0.9 * along);

  float pk = peak(fx);
  float capR = R0 + 0.026 + pk * 0.5;
  col += vec3(1.0) * gap * (1.0 - ss(0.0, 0.005, abs(r - capR))) * 0.85 * step(0.03, pk);

  // the orb's rim is the live waveform
  float orbR = R0 - 0.05;
  float w = wave(am) * 0.05 * (0.4 + uLevel);
  vec3 orbCol = pal(0.5 + uTime * 0.015);
  col += orbCol * (0.0028 / (abs(r - (orbR + w)) + 0.0018)) * (0.7 + uBeat * 1.3 * uPunch);
  float core = 1.0 - ss(0.0, orbR, r);
  col += orbCol * core * core * (0.07 + uBass * 0.5);
  float iris = pow(abs(sin(a * 24.0 + uTime * 0.5)), 24.0) * (1.0 - ss(orbR * 0.3, orbR, r)) * ss(0.02, 0.12, r);
  col += orbCol * iris * 0.18 * (0.3 + uMid);

  // shockwave leaving the ring on every beat
  float sr = R0 + uBeatAge * 1.5;
  col += pal(0.85) * exp(-uBeatAge * 4.0) * (0.0035 / (abs(r - sr) + 0.004)) * uPunch;

  float rays = pow(max(0.0, sin(a * 9.0 + uTime * 0.15 + sin(r * 3.0 - uTravel * 0.7))), 6.0);
  col += pal(0.15) * rays * exp(-r * 1.6) * (0.05 + uBass * 0.32) * step(R0, r);

  col *= 1.0 - 0.35 * ss(0.9, 2.0, r);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'nova',
  name: 'Nova',
  group: 'Show',
  blurb: 'Radial spectrum bars around a waveform orb; a shockwave fires each beat',
  tags: ['analyser', 'abstract', 'geometric'],
  energy: 0.65,
  particles: 1,
  trails: 0.55,
  zoom: 1.012,
  spin: 0,
  frag,
};
