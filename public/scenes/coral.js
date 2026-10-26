// CORAL — a reef that grows from the music, by reaction and diffusion.
//
// Two chemicals share a dish. U is food, spread everywhere and topped up at rate F; V eats U to
// make more of itself (U + 2V → 3V) and dies off at rate k; both diffuse, V half as fast. That is
// the Gray–Scott model, and from nothing but those two rates it grows spots that divide like
// cells, stripes, mazes, coral. Alan Turing proposed this kind of chemistry in 1952 as the reason
// leopards have spots.
//
// Here the music holds the two knobs. The song's slow energy sets the feed rate: in quiet passages
// the reef starves and pinches off into drifting spots, and as the track builds the spots stretch
// and branch back into coral. The spectrum nudges the feed rate column by column, so each part of
// the screen grows a little differently, and every beat drops a seed of V somewhere new that
// blossoms into fresh growth. This is the first kind of scene that remembers: the dish carries
// over from frame to frame (a "sim" pass, see glsl.js), so what grew a minute ago is still there,
// being reshaped.
//
// The picture reads the concentration of V as a height and lights it: a key light, a specular
// sheen, darkened hollows where the reef is thick around them, the growth fronts glowing with the
// treble, and a shimmer of caustics from the water above.
const sim = `
void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  vec2 c = stateAt(t).rg;
  if (uSimFrame < 0.5) {
    // the first dish: food everywhere and a scattering of seeds
    vec2 g = gl_FragCoord.xy;
    float seed = step(0.72, noise(g * 0.045 + 3.0)) * step(0.55, hash21(floor(g / 7.0)));
    outColor = vec4(1.0 - 0.5 * seed, 0.25 * seed, 0.0, 1.0);
    return;
  }
  vec2 lap = -c
    + 0.20 * (stateAt(t + ivec2(1, 0)).rg + stateAt(t - ivec2(1, 0)).rg + stateAt(t + ivec2(0, 1)).rg + stateAt(t - ivec2(0, 1)).rg)
    + 0.05 * (stateAt(t + ivec2(1, 1)).rg + stateAt(t + ivec2(-1, 1)).rg + stateAt(t + ivec2(1, -1)).rg + stateAt(t + ivec2(-1, -1)).rg);
  float x = gl_FragCoord.x / uStateRes.x;
  // the two knobs. Feed comes from the song's energy, from the band over this column, and from a
  // slow tide drifting across the dish, so the line between starving and thriving keeps moving and
  // the reef never settles: mazes pinch into spots on one side while spots branch on the other.
  vec2 q = gl_FragCoord.xy / uStateRes.y * 2.2;
  float tide = noise(q + vec2(uTime * 0.018, -uTime * 0.011)) - 0.5;
  float F = mix(0.026, 0.058, clamp(ss(0.12, 0.62, uEnergy) + 0.65 * tide, 0.0, 1.0)) + 0.006 * (spec(0.03 + x * 0.7) - 0.35);
  float k = 0.0615 + 0.0015 * (uMid - 0.4);
  float u = c.r, v = c.g;
  float uvv = u * v * v;
  u += lap.r - uvv + F * (1.0 - u);
  v += 0.5 * lap.g + uvv - (F + k) * v;
  // a beat drops a seed somewhere new; a heavier beat drops a bigger one
  vec2 sp = vec2(0.08 + 0.84 * hash11(uBeatCount * 1.37 + 0.5), 0.1 + 0.8 * hash11(uBeatCount * 2.91 + 0.2)) * uStateRes;
  float drop = step(uBeatAge, 0.05) * (1.0 - ss(2.0, 5.0 + 5.0 * uBass, length(gl_FragCoord.xy - sp)));
  v = mix(v, 0.5, drop * 0.6);
  u = mix(u, 0.5, drop * 0.6);
  outColor = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), 0.0, 1.0);
}`;

const frag = `
float V(vec2 uv) { return texture(uState, uv).g; }

void main() {
  vec2 uv = vUv;
  vec2 px = 1.0 / uStateRes;
  float v = V(uv);
  // V is a height: its slope gives the reef a surface to light
  float gx = V(uv + vec2(px.x, 0.0)) - V(uv - vec2(px.x, 0.0));
  float gy = V(uv + vec2(0.0, px.y)) - V(uv - vec2(0.0, px.y));
  vec3 n = normalize(vec3(-gx * 7.0, -gy * 7.0, 1.0));
  // hollows: where the reef around is thicker than here, less light gets in
  float around = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) / 8.0 * TAU;
    around += V(uv + vec2(cos(a), sin(a)) * px * 5.0);
  }
  float cavity = clamp((around / 8.0 - v) * 5.0, 0.0, 1.0);
  // the reef stands off the sea floor: it throws a soft shadow away from the light
  float shade = ss(0.08, 0.30, V(uv + vec2(0.55, -0.45) * px * 7.0)) * 0.5 + ss(0.08, 0.30, V(uv + vec2(0.55, -0.45) * px * 3.5)) * 0.5;

  vec2 p = centered();
  vec3 L = normalize(vec3(-0.45, 0.55, 0.75));
  float diff = max(dot(n, L), 0.0);
  float sheen = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
  float body = ss(0.06, 0.30, v);

  // the water: deep blue, lighter toward the surface at the top, caustics wavering over everything
  vec3 sea = mix(vec3(0.004, 0.018, 0.035), vec3(0.02, 0.07, 0.10), ss(-1.0, 1.2, p.y)) + pal(0.6) * 0.025;
  sea *= 0.75 + 0.5 * noise(p * 38.0) * noise(p * 9.0 + 3.0);                       // sand and grit on the floor
  sea *= 1.0 - 0.55 * shade * (1.0 - ss(0.06, 0.2, v));
  vec2 cq = p * 3.2 + vec2(uTime * 0.12, uTime * 0.07);
  float caustic = pow(1.0 - abs(noise(cq) - noise(cq * 1.7 + 4.0 + uTime * 0.1)), 6.0);
  vec3 reef = pal(0.04 + v * 1.4 + p.y * 0.05) * (0.18 + 0.95 * diff) * (1.0 - 0.7 * cavity);
  reef += vec3(1.0, 0.95, 0.9) * sheen * 0.55 * body;
  vec3 col = mix(sea, reef, body);
  col += vec3(0.25, 0.4, 0.45) * caustic * (0.10 + 0.25 * uLevel) * (0.4 + 0.6 * body);
  // growth fronts, where food is being eaten fastest, glow with the treble
  float front = ss(0.08, 0.16, v) * (1.0 - ss(0.16, 0.28, v));
  col += pal(0.5) * front * (0.10 + 0.9 * uHigh);
  // the newest seed flares where it landed
  vec2 sp = vec2(0.08 + 0.84 * hash11(uBeatCount * 1.37 + 0.5), 0.1 + 0.8 * hash11(uBeatCount * 2.91 + 0.2));
  vec2 dv = (uv - sp) * vec2(uStateRes.x / uStateRes.y, 1.0);
  col += pal(0.1) * exp(-dot(dv, dv) * 900.0) * exp(-uBeatAge * 3.0) * 1.2 * uPunch;
  col *= 1.0 - 0.35 * ss(0.8, 1.9, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'coral',
  name: 'Coral',
  group: 'Lab',
  blurb: 'A living reef grown by reaction–diffusion: loud passages branch into coral, quiet ones pinch into spots',
  tags: ['organic', 'science', 'water', 'nature'],
  energy: 0.4,
  particles: 3,
  trails: 0.0,
  zoom: 1,
  spin: 0,
  frag,
  sim: { height: 320, steps: 10, frag: sim },
};
