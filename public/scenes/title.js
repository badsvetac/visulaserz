// The track's own title as the picture: rippled by the waveform, sliced by the spectrum,
// split into colour fringes by the bass.
const frag = `
void main() {
  vec2 p = centered();
  p *= 1.0 - uBeat * 0.04 * uPunch;
  float aspect = uRes.x / uRes.y;
  float w = min(aspect * 0.92, 1.9);
  vec2 q = p / vec2(w, w * 0.25);
  vec2 uv = q * 0.5 + 0.5;
  uv.y += wave(uv.x) * 0.05 * uLevel;
  float row = floor(uv.y * 16.0);
  float inside = step(0.0, uv.y) * step(uv.y, 1.0);
  uv.x += (spec(fract(row * 0.31 + 0.1)) - 0.25) * 0.05 * uMid * inside;
  float split = 0.002 + uBass * 0.012;
  float ar = texture(uText, uv + vec2(split, 0.0)).a;
  float ag = texture(uText, uv).a;
  float ab = texture(uText, uv - vec2(split, 0.0)).a;
  vec3 tint = pal(uv.x * 0.6 + uTime * 0.04);
  vec3 col = vec3(ar, ag, ab) * (0.55 + tint * 1.2) * (0.9 + uBeat * 0.7 * uPunch);
  float bx = spec(abs(p.x / aspect) * 0.9);
  col += pal(0.55) * 0.06 * step(abs(p.y), bx * 0.95) * (0.3 + uLevel);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'title',
  name: 'Title',
  group: 'Show',
  blurb: 'The track title itself, rippled by the waveform and colour-split by the bass',
  tags: ['text', 'abstract'],
  energy: 0.5,
  particles: 0,
  trails: 0.72,
  zoom: 1.015,
  spin: 0,
  frag,
};
