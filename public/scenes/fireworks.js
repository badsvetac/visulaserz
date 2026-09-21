// FIREWORKS — a display over the harbour.
//
// The big shell is the beat: it bursts the instant the kick lands, in a new place and colour
// each time, and its size follows how hard the bass hit. Three smaller mortars fire on their own
// clocks so the sky is never empty between beats. Every star of a burst flies out, slows in the
// air, sags under gravity and leaves a short tail; the water below mirrors the glow, and the
// crowd's skyline is a quiet spectrum along the far shore.
const frag = `
const float WATER = -0.46;

// One burst. age: seconds since it went off; quick: how fast it opens and dies (1 = a slow willow).
vec3 burst(vec2 p, vec2 c, float age, float seed, float size, vec3 tint, float quick) {
  if (age < 0.0 || age * quick > 2.6) return vec3(0.0);
  vec2 v = p - c;
  vec2 vs = v + vec2(0.0, 0.16 * age * age);                          // the whole ball of stars sags together
  if (dot(vs, vs) > size * size * 1.5) return vec3(0.0);
  vec3 col = vec3(0.0);
  const int STARS = 44;
  for (int i = 0; i < STARS; i++) {
    float fi = float(i);
    float a = (fi + hash11(seed + fi * 1.7)) / float(STARS) * TAU;
    float sp = 0.55 + 0.45 * hash11(seed * 1.3 + fi * 3.1);
    vec2 dir = vec2(cos(a), sin(a));
    float tw = 0.6 + 0.4 * sin(age * 30.0 + fi * 2.4);
    for (int k = 0; k < 4; k++) {                                       // the star and three echoes behind it make the tail
      float ag = max(age - float(k) * 0.035 / quick, 0.0);
      // drag: fast at first, then hanging in the air and sagging under gravity
      vec2 d = p - (c + dir * sp * size * (1.0 - exp(-ag * 3.2 * quick)) + vec2(0.0, -0.16 * ag * ag));
      col += tint * (0.000030 / (dot(d, d) + 0.000014)) * (1.0 - float(k) * 0.24) * tw;
    }
  }
  col += vec3(1.0, 0.95, 0.85) * exp(-age * 9.0) * (0.004 / (dot(v, v) + 0.004));     // the flash of the break itself
  return col * exp(-age * 1.35 * quick);
}

vec3 show(vec2 p, float aspect) {
  vec3 col = vec3(0.0);
  // the beat shell: it has to open and die inside one beat, because the next kick brings the next shell
  float bs = uBeatCount;
  vec2 bc = vec2((hash11(bs * 1.37 + 2.0) - 0.5) * aspect * 1.3, 0.22 + 0.5 * hash11(bs * 2.71 + 5.0));
  col += burst(p, bc, uBeatAge, bs * 7.3, 0.30 + 0.20 * uBass, pal(hash11(bs * 3.3) + 0.05), 3.2) * (0.8 + 0.7 * uPunch);
  // four mortars on their own clocks throw the slow willows
  for (int m = 0; m < 4; m++) {
    float fm = float(m);
    float period = 1.7 + fm * 0.53;
    float ph = uTime / period + fm * 0.37;
    float id = floor(ph);
    float age = fract(ph) * period;
    vec2 c = vec2((hash11(id * 1.91 + fm * 7.0) - 0.5) * aspect * 1.6, 0.05 + 0.6 * hash11(id * 2.3 + fm * 3.0));
    // the rising shell before it breaks
    float rise = clamp(age / 0.55, 0.0, 1.0);
    vec2 rp = vec2(c.x + 0.02 * sin(age * 20.0), mix(WATER, c.y, 1.0 - (1.0 - rise) * (1.0 - rise)));
    vec2 rd = p - rp;
    col += vec3(1.0, 0.8, 0.5) * (0.00004 / (dot(rd, rd) + 0.00003)) * step(age, 0.55);
    col += burst(p, c, age - 0.55, id * 5.7 + fm * 11.0, 0.26 + 0.16 * hash11(id + fm), pal(hash11(id * 4.1 + fm) + 0.4), 1.0) * (0.5 + 0.6 * uLevel);
  }
  return col;
}

void main() {
  vec2 p = centered();
  float aspect = uRes.x / uRes.y;
  vec3 col;
  if (p.y >= WATER) {
    float sy = p.y - WATER;
    col = mix(vec3(0.025, 0.02, 0.05), vec3(0.003, 0.004, 0.015), ss(0.0, 1.1, sy));
    vec2 g = p * 60.0;
    vec2 gc = floor(g);
    float sh = hash21(gc);
    vec2 sf = fract(g) - 0.5 - (vec2(hash21(gc + 1.1), hash21(gc + 2.2)) - 0.5) * 0.8;
    col += vec3(0.85, 0.9, 1.0) * step(0.95, sh) * (0.001 / (dot(sf, sf) + 0.002)) * (0.3 + uHigh);
    // smoke left hanging by earlier shells, lit by the new ones
    float smoke = fbm(p * 1.8 + vec2(uTime * 0.02, 0.0));
    col += (pal(0.6) * 0.04 + vec3(0.02)) * ss(0.4, 0.8, smoke) * (0.4 + 1.6 * exp(-uBeatAge * 2.0) * uPunch);
    col += show(p, aspect);
    // the far shore: low buildings whose lit windows follow the spectrum
    float bx = p.x * 9.0;
    float bid = floor(bx);
    float bh = 0.03 + 0.07 * hash11(bid * 1.7 + 3.0);
    if (sy < bh && fract(bx) < 0.86) {
      vec2 wf = fract(vec2(fract(bx) * 5.0, sy * 90.0));
      float lit = step(hash21(floor(vec2(fract(bx) * 5.0, sy * 90.0)) + bid), 0.25 + 0.6 * spec(hash11(bid) * 0.8));
      col = vec3(0.006, 0.007, 0.012) + vec3(1.0, 0.8, 0.5) * lit * step(0.25, wf.x) * step(0.3, wf.y) * 0.35;
    }
  } else {
    float dp = WATER - p.y;
    vec2 rp = vec2(p.x + 0.012 * sin(dp * 120.0 + uTime * 2.0) * (1.0 + dp * 4.0), WATER + dp * 1.1);
    col = vec3(0.002, 0.004, 0.010) + show(rp, aspect) * (0.85 - 0.45 * ss(0.0, 0.6, dp));
    col *= 0.8 + 0.4 * noise(vec2(p.x * 6.0, dp * 110.0 + uTime * 0.7));
  }
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'fireworks',
  name: 'Fireworks',
  group: 'Show',
  blurb: 'Harbour fireworks: a shell bursts on every kick and the water mirrors the glow',
  tags: ['fire', 'night', 'water', 'city'],
  energy: 0.75,
  particles: 0,
  trails: 0.5,
  zoom: 1,
  spin: 0,
  frag,
};
