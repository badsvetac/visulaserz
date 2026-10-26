// A persistent, advected dye field. Alpha records the last injected beat, so a
// kick is injected exactly once even when a display frame executes several sim ticks.
const sim = `
float activeBass() { return uAudioActive * clamp(uBass * 1.5, 0.0, 1.0); }
float potential(vec2 q) {
  float t = uTravel * 0.045;
  return noise(q * 1.5 + vec2(t, -t * 0.7))
    + 0.42 * noise(q * 3.2 - vec2(t * 1.3, t * 0.4) + 7.0)
    + (0.10 + 0.22 * uAudioActive * uHigh) * noise(q * 7.0 + vec2(-t, t * 1.6));
}
vec2 current(vec2 q) {
  vec2 e = vec2(0.015, 0);
  return vec2(potential(q + e.yx) - potential(q - e.yx), potential(q - e.xy) - potential(q + e.xy)) / 0.03;
}
vec2 dropAt(float n, float aspect) {
  return (vec2(hash11(n * 1.37 + 0.5), hash11(n * 2.91 + 0.2)) - 0.5) * vec2(aspect * 1.35, 1.3);
}
void main() {
  vec2 q = centered();
  float aspect = uStateRes.x / uStateRes.y;
  float stamp = mod(uBeatCount, 512.0) + 1.0;
  float bass = activeBass(), mid = uAudioActive * uMid;
  if (uSimFrame < 0.5) {
    vec3 ink = vec3(0);
    for (int i = 0; i < 4; i++) {
      vec2 d = q - dropAt(float(i) - 20.0, aspect);
      ink += pal(float(i) * 0.23 + 0.1) * exp(-dot(d, d) * 15.0) * 1.25;
    }
    outColor = vec4(ink, stamp); return;
  }
  vec2 delta = q - dropAt(uBeatCount, aspect);
  float beatForce = uAudioActive * exp(-uBeatAge * 2.8) * uPunch;
  vec2 vel = current(q) * (0.12 + 0.46 * bass);
  vel += normalize(delta + 0.0001) * exp(-dot(delta, delta) * 3.0) * beatForce * 1.5;
  vel += vec2(-q.y, q.x) * (0.04 + bass * 0.09);
  vel.y += 0.025 + mid * 0.12;
  vec2 from = vUv - vel / (60.0 * vec2(2.0 * aspect, 2.0));
  vec3 ink = texture(uState, clamp(from, vec2(0.001), vec2(0.999))).rgb * 0.991;
  float previousStamp = texture(uState, vec2(0.5)).a;
  float fresh = step(0.5, abs(previousStamp - stamp)) * uAudioActive * step(uBeatAge, 0.45);
  vec3 c = pal(hash11(uBeatCount * 3.1) + 0.05);
  c = clamp(mix(vec3(dot(c, vec3(0.333))), c, 1.6), 0.0, 1.0);
  ink += c * fresh * exp(-dot(delta, delta) / (0.028 + bass * 0.065)) * (1.6 + bass) * max(uPunch, 0.25);
  for (int i = 0; i < 2; i++) {
    float side = float(i) * 2.0 - 1.0;
    vec2 pen = vec2(side * aspect * 0.46 + sin(uTravel * 0.4 + side) * 0.3, -0.45 + sin(uCruise * 0.4 + side) * 0.28);
    vec2 dp = q - pen;
    float injection = 0.007 + mid * 0.17 + bass * 0.035;
    ink += pal(0.2 + float(i) * 0.48 + uCruise * 0.012) * exp(-dot(dp, dp) * (100.0 - mid * 45.0)) * injection;
  }
  outColor = vec4(min(ink, vec3(5.0)), stamp);
}`;
const frag = `
vec3 dye(vec2 uv) { return texture(uState, uv).rgb; }
void main() {
  vec2 px = 1.0 / uStateRes;
  vec3 ink = dye(vUv);
  float dens = dot(ink, vec3(0.333));
  float gx = dot(dye(vUv + vec2(px.x * 2.0, 0)) - dye(vUv - vec2(px.x * 2.0, 0)), vec3(0.333));
  float gy = dot(dye(vUv + vec2(0, px.y * 2.0)) - dye(vUv - vec2(0, px.y * 2.0)), vec3(0.333));
  vec3 n = normalize(vec3(-gx * 10.0, -gy * 10.0, 0.55));
  float light = 0.65 + 0.55 * max(dot(n, normalize(vec3(-0.5, 0.7, 1.0))), 0.0);
  vec3 col = vec3(0.004, 0.009, 0.023);
  col += ink * (1.65 / (1.0 + 0.75 * dens)) * light;
  float sheen = pow(max(dot(n, normalize(vec3(-0.35, 0.45, 1.0))), 0.0), 24.0);
  col += vec3(0.48, 0.72, 0.85) * sheen * ss(0.025, 0.18, dens) * (0.13 + uAudioActive * uHigh * 0.30);
  col += pal(0.58) * length(vec2(gx, gy)) * (0.8 + uAudioActive * uMid);
  col *= 1.0 - 0.20 * ss(0.75, 2.0, length(centered()));
  outColor = vec4(col, 1);
}`;
export default {
  id: 'ink', name: 'Ink', group: 'Lab',
  blurb: 'Bass drives the fluid, each kick injects a fresh plume, mids feed twin dye jets and treble curls their lit edges',
  tags: ['fluid', 'bass', 'organic', 'simulation'], energy: 0.65, particles: 0, trails: 0, zoom: 1, spin: 0,
  frag, sim: { height: 400, steps: 1, frag: sim },
};
