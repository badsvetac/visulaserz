// POOL — looking down into a swimming pool on a bright day.
//
// The caustics are computed, not painted: each pixel's ray is bent by the slope of the water
// above it, and the GPU's own screen-space derivatives tell how much the bundle of rays around it
// was squeezed on the way to the floor — squeezed light is bright light. Red, green and blue bend
// by slightly different amounts, so the bright lines get rainbow edges. Bass raises the waves,
// every beat drops a pebble somewhere, and a striped ring drifts across the surface.
const frag = `
float height(vec2 q, float t, vec2 bp, float amp) {
  float h = 0.50 * sin(dot(q, vec2(0.8, 0.6)) * 5.0 + t * 1.3)
          + 0.35 * sin(dot(q, vec2(-0.5, 0.86)) * 7.3 - t * 1.7 + 1.0)
          + 0.25 * sin(dot(q, vec2(0.95, -0.3)) * 11.0 + t * 2.3 + 2.0)
          + 0.18 * sin(dot(q, vec2(-0.2, -0.98)) * 17.0 - t * 2.9 + 4.0)
          + 0.10 * sin(dot(q, vec2(0.6, 0.8)) * 27.0 + t * 3.7 + 5.0)
          + 0.30 * (noise(q * 3.0 + vec2(t * 0.3, -t * 0.2)) - 0.5);
  float r = length(q - bp) - uBeatAge * 1.1;                          // the ring thrown by the last beat
  return h * amp + sin(r * 38.0) * exp(-r * r * 60.0) * exp(-uBeatAge * 1.6) * 0.9 * uPunch;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  float t = uTime;
  float px = 2.0 / uRes.y;
  float amp = 0.55 + 0.9 * uBass + 0.3 * uMid;
  vec2 bp = (vec2(hash11(uBeatCount * 1.7 + 3.0), hash11(uBeatCount * 2.9 + 8.0)) - 0.5) * vec2(aspect, 1.0) * 1.3;

  const float e = 0.004;
  vec2 grad = vec2(height(p + vec2(e, 0.0), t, bp, amp) - height(p - vec2(e, 0.0), t, bp, amp),
                   height(p + vec2(0.0, e), t, bp, amp) - height(p - vec2(0.0, e), t, bp, amp)) / (2.0 * e);

  vec3 caust;
  for (int c = 0; c < 3; c++) {
    vec2 w = p + 0.015 * (0.92 + 0.08 * float(c)) * grad;
    float area = abs(dFdx(w.x) * dFdy(w.y) - dFdx(w.y) * dFdy(w.x)) / (px * px);
    caust[c] = pow(clamp(1.0 / (0.12 + area), 0.0, 7.0), 2.0) * 0.07;
  }

  // the floor, seen through the water
  vec2 w = p + 0.015 * grad;
  vec2 tg = w * 5.5;
  vec2 tf = fract(tg);
  float grout = 1.0 - ss(0.0, 0.05, min(min(tf.x, 1.0 - tf.x), min(tf.y, 1.0 - tf.y)));
  vec3 tile = mix(vec3(0.30, 0.62, 0.70), vec3(0.42, 0.78, 0.82), hash21(floor(tg)));
  tile = mix(tile, vec3(0.05, 0.12, 0.35), 1.0 - ss(0.085, 0.10, abs(w.y)));              // the lane line
  tile = mix(tile, vec3(0.75, 0.9, 0.92), grout * 0.6);
  vec3 light = mix(vec3(1.0, 0.98, 0.9), pal(0.15 + uTime * 0.01), 0.45);
  vec3 col = tile * (0.25 + caust * light * (0.8 + uLevel));

  // the inflatable ring and its shadow on the floor
  vec2 rc = vec2(sin(t * 0.07) * 0.33 * aspect, cos(t * 0.05) * 0.35);
  float rr = 0.17 * (1.0 + 0.03 * uBass);
  float sd = length(w - rc - vec2(-0.05, -0.06));
  col *= 1.0 - 0.45 * ss(rr * 0.55 - 0.03, rr * 0.55 + 0.01, sd) * (1.0 - ss(rr - 0.01, rr + 0.03, sd));
  vec2 rv = p - rc;
  float rd = length(rv);
  float ringMask = ss(rr * 0.55 - 0.004, rr * 0.55, rd) * (1.0 - ss(rr, rr + 0.004, rd));
  float tube = 1.0 - abs((rd - rr * 0.775) / (rr * 0.225));
  vec3 ringCol = mix(vec3(0.95), pal(0.02), step(0.5, fract((atan(rv.y, rv.x) + t * 0.1) / TAU * 6.0))) * (0.5 + 0.5 * tube);
  ringCol += vec3(1.0) * ss(0.75, 1.0, tube) * 0.25;

  // sun glints on the surface
  vec3 n = normalize(vec3(-grad * 0.06, 1.0));
  float glint = pow(max(dot(n, normalize(vec3(0.35, 0.45, 0.82))), 0.0), 180.0);
  col += light * glint * 1.5 * (0.5 + uHigh * 2.0);
  col = mix(col, ringCol, ringMask);
  col *= 1.0 - 0.35 * ss(0.7, 1.9, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'pool',
  name: 'Pool',
  group: 'Things',
  blurb: 'Sunlit pool floor with rainbow caustics; every beat drops a pebble ripple',
  tags: ['water', 'calm', 'organic'],
  energy: 0.3,
  particles: 0,
  trails: 0,
  zoom: 1,
  spin: 0,
  frag,
};
