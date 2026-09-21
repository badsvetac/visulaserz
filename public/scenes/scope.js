const frag = `
void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  const float amp = 0.30;
  vec3 col = vec3(0.0);

  float x = vUv.x;
  float w0 = wave(x) * amp;
  float w1 = wave(x + 0.004) * amp;
  float slope = (w1 - w0) / (0.004 * 2.0 * aspect);
  float d = abs(p.y - w0) / sqrt(1.0 + slope * slope);   // true distance to a sloped line, so steep parts stay thin
  col += pal(uTime * 0.05 + x * 0.25) * (0.007 / (d + 0.0022)) * (0.6 + uLevel);

  float r = length(p);
  float am = abs(atan(p.x, -p.y)) / PI;
  float R = 0.42 + uBass * 0.08;
  float dr = abs(r - (R + wave(am) * amp * 0.6));
  col += pal(uTime * 0.05 + 0.5 + am * 0.3) * (0.0066 / (dr + 0.002)) * (0.6 + uBeat * 1.2 * uPunch);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'scope',
  name: 'Scope',
  group: 'Show',
  blurb: 'Oscilloscope trace crossed by a circular waveform ring that flares on beats',
  tags: ['analyser', 'retro', 'abstract'],
  energy: 0.45,
  particles: 0,
  trails: 0.9,
  zoom: 1.03,
  spin: 0.006,
  frag,
};
