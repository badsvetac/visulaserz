// HARMONOGRAPH — a pendulum drawing machine.
//
// Only the last instant of the curve is drawn each frame; the long trails are the paper, so the
// figure writes itself and fades behind the pen. The pen runs on the travel clock (louder music
// draws faster), its two axes swing in a simple ratio that changes every sixteen beats — 2:3,
// 3:4, 3:5 … the same ratios as musical intervals — and a slight detune makes each figure
// precess instead of retracing itself. The bass thickens the line.
const frag = `
vec2 pen(float tau, float a, float b, float amp) {
  return amp * vec2(0.72 * sin(a * tau) + 0.28 * sin((2.0 * a + 1.0) * tau * 1.003 + 0.7),
                    0.72 * sin(b * tau * 1.004 + 1.3) + 0.28 * sin((2.0 * b - 1.0) * tau + 2.1));
}

void main() {
  vec2 p = centered();
  float k = floor(uBeatCount / 16.0);
  float a = 2.0 + floor(hash11(k * 1.7 + 0.3) * 3.0);
  float b = a + 1.0 + floor(hash11(k * 2.9 + 1.1) * 2.0);
  float amp = 0.80 * (0.8 + 0.2 * uLevel);
  float tau = uTravel * 2.4;

  float d = 1e3, along = 0.0;
  const int STEPS = 30;
  vec2 q0 = pen(tau - 0.16, a, b, amp);
  for (int i = 1; i <= STEPS; i++) {
    float f = float(i) / float(STEPS);
    vec2 q1 = pen(tau - 0.16 * (1.0 - f), a, b, amp);
    vec2 pa = p - q0, ba = q1 - q0;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
    float di = length(pa - ba * h);
    if (di < d) { d = di; along = f; }
    q0 = q1;
  }
  float width = 0.0016 + 0.0035 * uBass;
  vec3 ink = pal(tau * 0.03 + 0.1);
  vec3 col = ink * (width / (d + width)) * (0.55 + 0.45 * along) * 1.5;
  vec2 head = pen(tau, a, b, amp);
  col += vec3(1.0) * (0.00006 / (dot(p - head, p - head) + 0.00005)) * (0.5 + uBeat * uPunch);

  // the table: a faint dial under the paper
  float r = length(p);
  col += pal(0.6) * 0.03 * (1.0 - ss(0.0, 0.003, abs(r - 0.86)));
  col += pal(0.6) * 0.015 * (1.0 - ss(0.0, 0.002, min(abs(p.x), abs(p.y)))) * step(r, 0.86);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'harmonograph',
  name: 'Harmonograph',
  group: 'Lab',
  blurb: 'Pendulum pen tracing fading interval curves; louder music draws faster',
  tags: ['geometric', 'science', 'calm'],
  energy: 0.3,
  particles: 0,
  trails: 0.985,
  zoom: 1.002,
  spin: 0.0015,
  frag,
};
