// Vectorscope graticule; the trace itself is drawn by particle mode 4.
const frag = `
void main() {
  vec2 p = centered();
  float r = length(p);
  vec3 col = pal(0.6) * 0.06 * exp(-r * 1.6) * (0.5 + uLevel);
  col += (pal(0.5) * 0.5 + 0.15) * (1.0 - ss(0.0, 0.004, abs(r - 0.8)));
  float d1 = abs(p.x - p.y) * 0.7071, d2 = abs(p.x + p.y) * 0.7071;
  col += (pal(0.5) * 0.25 + 0.06) * (1.0 - ss(0.0, 0.0025, min(d1, d2))) * step(r, 0.8);
  col += pal(0.1) * 0.02 / (r + 0.02) * (0.3 + uBass);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'xy',
  name: 'XY',
  group: 'Show',
  blurb: 'Vectorscope: left against right channel traced on a round green-screen graticule',
  tags: ['analyser', 'retro', 'geometric'],
  energy: 0.4,
  particles: 4,
  trails: 0.88,
  zoom: 1,
  spin: 0,
  frag,
};
