const frag = `
void main() {
  vec2 uv = vUv;
  vec3 col = vec3(0.0);
  const float baseY = 0.34;
  const float H = 0.56;
  const float N = 48.0;
  const float margin = 0.07;
  float x = (uv.x - margin) / (1.0 - 2.0 * margin);
  float y = uv.y - baseY;
  float ay = abs(y);

  float gy = abs(fract(y * 12.0) - 0.5);
  col += pal(0.6) * 0.025 * (1.0 - ss(0.0, 0.03, gy)) * step(0.0, y);

  if (x > 0.0 && x < 1.0) {
    float cell = x * N;
    float cx = (floor(cell) + 0.5) / N;
    float f = fract(cell);
    float barMask = ss(0.10, 0.18, f) * (1.0 - ss(0.82, 0.90, f));
    float s = spec(cx * 0.92);
    float pk = peak(cx * 0.92);
    float seg = ss(0.08, 0.2, fract(ay / H * 30.0));           // LED ladder segments
    float on = step(ay, s * H) * step(0.0005, s);
    float refl = y >= 0.0 ? 1.0 : 0.30 * exp(-ay * 9.0);       // mirrored floor
    col += pal(0.04 + ay / H * 0.5 + cx * 0.12) * on * barMask * seg * (0.75 + 0.9 * ay / H) * refl;
    float cap = (1.0 - ss(0.0, 0.004, abs(ay - (pk * H + 0.012)))) * barMask * step(0.01, pk);
    col += vec3(1.0, 0.98, 0.95) * cap * refl * 1.1;
  }
  col += pal(0.18) * (0.0009 / (ay + 0.0012)) * (0.35 + uBass);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'bars',
  name: 'Bars',
  group: 'Show',
  blurb: 'Classic LED ladder spectrum with falling peak caps over a mirrored floor',
  tags: ['analyser', 'retro', 'geometric'],
  energy: 0.5,
  particles: 2,
  trails: 0.35,
  zoom: 1,
  spin: 0,
  frag,
};
