// RAIN — a rainy night through the window.
//
// Outside is either a photo the user dropped in (shown through the glass, with rain over it)
// or a soft procedural city: every light is a glow rather than a shape — dense far windows, a
// nearer block with big lit rooms and a neon sign in the palette colour, a street lamp right
// outside with its halo in the rain haze, and the wet street that stretches all of it into
// smeared reflections. Falling rain is lit by the lamp; drops on the glass bend the view through
// them like small lenses. Bass = heavier rain; a few windows and the neon blink on the beat;
// every sixteenth beat is lightning (the ambience module answers with thunder).
const frag = `
float glow(vec2 d, float size) { return size * size / (dot(d, d) + size * size); }
float fill(float sd) { return 1.0 - ss(0.0, 0.003, sd); }
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

const float STREET = -0.38;

float skyline(float x, float seed, float lo, float hi) {
  float b = floor(x * 2.6 + seed);
  return lo + (hi - lo) * hash11(b * 1.31 + seed) * (0.4 + 0.6 * hash11(b * 0.77 + seed + 2.0));
}

// Windows as soft glows, only below the skyline of this layer.
vec3 windows(vec2 uv, float sc, float seed, float bright, float top) {
  if (uv.y - STREET > top || uv.y < STREET) return vec3(0.0);
  vec2 g = vec2(uv.x * sc + seed, (uv.y - STREET) * sc * 1.5);
  vec2 c = floor(g);
  float h = hash21(c + seed);
  vec2 f = fract(g) - 0.5;
  float on = step(0.5, h);
  float w = 0.1 + 0.08 * hash21(c + 2.0);
  float gl = glow(f * vec2(1.0, 1.5), w);
  float tv = step(0.9, hash21(c + 4.0)) * (0.5 + 0.5 * sin(uTime * 6.0 + h * 40.0));
  float blink = step(0.95, hash21(c + 6.0)) * uBeat * uPunch * 1.5;
  vec3 wc = mix(vec3(1.0, 0.72, 0.4), vec3(0.45, 0.65, 1.0), tv);
  return wc * gl * on * bright * (0.8 + 0.2 * sin(uTime * (0.5 + h) + h * 30.0)) * (1.0 + blink) * (0.7 + 0.5 * uLevel);
}

vec3 city(vec2 uv, float aspect) {
  vec3 col = mix(vec3(0.03, 0.045, 0.09), vec3(0.004, 0.005, 0.014), ss(-0.35, 0.9, uv.y));
  col += vec3(0.25, 0.2, 0.22) * 0.35 * exp(-abs(uv.y - STREET + 0.05) * 3.5);          // rain haze glowing over the city
  col += pal(0.62) * 0.05 * exp(-abs(uv.y - STREET) * 2.0);
  // far blocks: a hazy silhouette with dense small lights
  float farTop = skyline(uv.x, 3.7, 0.25, 0.85);
  col = mix(col, vec3(0.03, 0.04, 0.075), ss(0.0, 0.03, farTop - (uv.y - STREET)) * step(STREET, uv.y));
  col += windows(uv, 46.0, 3.7, 0.35, farTop);
  // the block across the street: darker, bigger rooms
  float nearTop = skyline(uv.x + 0.4, 1.3, 0.12, 0.42);
  col = mix(col, vec3(0.012, 0.014, 0.024), ss(0.0, 0.015, nearTop - (uv.y - STREET)) * step(STREET, uv.y));
  col += windows(uv, 18.0, 1.3, 0.8, nearTop);
  // a neon sign on the near block
  vec2 nq = uv - vec2(-aspect * 0.42, STREET + 0.19);
  float neonOn = 0.75 + 0.25 * step(0.35, fract(uTime * 1.7 + 0.3)) + uBeat * uPunch * 0.6;
  float neon = 1.0 - ss(0.0, 0.05, sdBox(nq, vec2(0.14, 0.035)));
  col += pal(0.1) * (neon * 0.9 + glow(nq * vec2(0.4, 1.0), 0.12) * 0.35) * neonOn;
  return col;
}

vec3 photo(vec2 uv, float aspect) {
  // fill the frame with the picture, cropping the longer side
  vec2 t = uv / vec2(aspect, 1.0) * 0.5 + 0.5;
  float r = uBackdropAspect / aspect;
  if (r > 1.0) t.x = 0.5 + (t.x - 0.5) / r; else t.y = 0.5 + (t.y - 0.5) * r;
  return texture(uBackdrop, t).rgb;
}

float rainLayer(vec2 uv, float scale, float speed, float seed) {
  vec2 g = vec2(uv.x * scale, (uv.y + uTime * speed) * scale * 0.25);
  vec2 c = floor(g);
  vec2 f = fract(g);
  float h = hash21(c + seed);
  float x = 0.2 + 0.6 * hash21(c + seed + 1.0);
  float len = 0.4 + 0.4 * h;
  return (1.0 - ss(0.0, 0.06, abs(f.x - x))) * step(f.y, len) * step(0.35, h) * (0.5 + 0.5 * h);
}

vec3 outside(vec2 uv, float aspect) {
  vec3 col;
  vec2 lamp = vec2(aspect * 0.55, STREET + 0.42);
  vec3 lampCol = vec3(1.0, 0.8, 0.5);
  if (uHasBackdrop > 0.5) {
    col = photo(uv, aspect);
  } else if (uv.y >= STREET) {
    col = city(uv, aspect);
  } else {
    // wet asphalt: the city mirrored, stretched down and wobbling
    float wob = 0.012 * sin(uv.x * 35.0 + uTime * 2.0) + 0.008 * noise(vec2(uv.x * 12.0, uv.y * 25.0 - uTime * 3.0));
    vec2 ruv = vec2(uv.x + wob, STREET + (STREET - uv.y) * 0.55 + wob);
    vec3 refl = city(ruv, aspect);
    float dist = STREET - uv.y;
    col = vec3(0.018, 0.02, 0.03) * (0.6 + 0.8 * noise(uv * 22.0)) + refl * 0.55 * exp(-dist * 1.6);
    col += lampCol * 0.2 * exp(-abs(uv.x - lamp.x) * 3.0) * exp(-dist * 2.5);                   // the lamp on the wet ground
    col += vec3(0.06, 0.065, 0.08) * (1.0 - ss(0.0, 0.012, abs(dist - 0.015)));                   // the kerb
  }
  // the street lamp outside the window, and the haze it lights
  float below = lamp.y - uv.y;
  float cone = (1.0 - ss(0.4, 0.9, abs(uv.x - lamp.x) / max(below, 0.02))) * exp(-below * 2.0) * step(0.0, below);
  col += lampCol * (glow(uv - lamp, 0.02) * 1.6 + glow(uv - lamp, 0.16) * 0.25 + cone * 0.06);
  // falling rain, seen where light catches it
  float speed = 1.0 + uBass * 0.6;
  float rain = rainLayer(uv, 30.0, 0.9 * speed, 0.0) * 0.5 + rainLayer(uv, 50.0, 1.4 * speed, 3.0) * 0.7 + rainLayer(uv, 80.0, 2.0 * speed, 6.0);
  col += vec3(0.75, 0.8, 0.9) * rain * (0.03 + 0.7 * cone + 0.15 * length(col)) * (0.6 + 0.6 * uBass);
  return col;
}

// Drops on the glass: returns the refraction offset (xy) and coverage (z).
vec3 drops(vec2 uv, float t, float seed) {
  vec2 cs = vec2(0.12, 0.36);
  vec2 g = (uv + vec2(0.0, t * 0.15)) / cs;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash21(id + seed);
  if (h < 0.5) return vec3(0.0);
  float x = (hash21(id + seed + 1.3) - 0.5) * 0.55 + 0.05 * sin(t * 3.0 + h * 40.0);
  float y = (hash21(id + seed + 4.4) - 0.5) * 0.5 + 0.06 * sin(t * 1.5 + h * 10.0);
  vec2 d = vec2((f.x - x) * cs.x, (f.y - y) * cs.y);
  float r = 0.012 + 0.014 * hash21(id + seed + 2.2);
  float dist = length(d * vec2(1.0, 0.8));
  float mask = 1.0 - ss(r * 0.85, r, dist);
  vec2 off = (d / r) * mask;
  float above = f.y - y;
  float trailMask = 0.0;
  if (above > 0.0) {
    float k = fract(above * 6.0 + h * 3.0);
    vec2 bd = vec2((f.x - x) * cs.x, (k - 0.5) / 6.0 * cs.y);
    float br = r * (0.35 + 0.25 * (1.0 - above));
    trailMask = (1.0 - ss(br * 0.8, br, length(bd))) * step(above, 0.5) * (1.0 - ss(0.0, 0.5, above));
    off += bd / br * trailMask * 0.5;
  }
  return vec3(off, max(mask, trailMask));
}

void main() {
  vec2 uv = centered();
  float aspect = uRes.x / uRes.y;
  float t = uTime * (0.7 + uBass * 0.6);
  vec3 d1 = drops(uv, t, 0.0);
  vec3 d2 = drops(uv * 1.6 + vec2(3.1, 0.0), t * 1.2, 7.0);
  vec2 off = d1.xy * 0.05 + d2.xy * 0.025;
  float cover = max(d1.z, d2.z * 0.8);
  vec3 bg = outside(uv, aspect);
  vec3 through = outside(uv - off * 2.2, aspect) * 1.5 + 0.015;
  vec3 col = mix(bg, through, cover);

  // fine droplets on the glass catching the light
  vec2 gg = uv * 90.0;
  vec2 cc = floor(gg);
  float hh = hash21(cc + 11.0);
  vec2 ff = fract(gg) - 0.5 - (vec2(hash21(cc + 1.1), hash21(cc + 2.2)) - 0.5) * 0.6;
  col += vec3(1.0) * step(0.94, hh) * (1.0 - ss(0.0, 0.18, length(ff))) * 0.03 * (0.5 + uHigh * 1.5) * (0.3 + 0.7 * length(bg));

  // lightning
  float flash = exp(-uBeatAge * 4.0) * (1.0 - step(0.5, mod(uBeatCount, 16.0))) * uPunch;
  col += vec3(0.6, 0.65, 0.8) * flash * 0.5;

  // ── the room: a thin frame, the sill, a mug and a plant, the lamp in the glass ──
  vec3 lampGlow = vec3(1.0, 0.75, 0.45) * 0.07 * exp(-length(uv - vec2(-aspect * 0.85, -0.5)) * 2.0);
  col += lampGlow;
  col *= 1.0 - 0.3 * ss(0.55, 1.05, length(uv / vec2(aspect, 1.0)));
  vec3 wood = vec3(0.05, 0.036, 0.028) * (0.8 + 0.4 * noise(uv * 30.0)) + lampGlow * 2.5;
  float frame = ss(aspect * 0.93, aspect * 0.95, abs(uv.x)) + ss(0.88, 0.9, uv.y) + (1.0 - ss(-0.66, -0.64, uv.y));
  float mullion = 1.0 - ss(0.014, 0.02, abs(uv.x));
  col = mix(col, wood, clamp(frame + mullion, 0.0, 1.0));
  float sill = (1.0 - ss(-0.66, -0.645, uv.y)) * ss(-0.76, -0.74, uv.y);
  col = mix(col, vec3(0.085, 0.065, 0.05) * (0.8 + 0.4 * noise(uv * 25.0)) + lampGlow * 2.5, sill);
  col = mix(col, vec3(0.01, 0.009, 0.011) + lampGlow, 1.0 - ss(-0.76, -0.74, uv.y));

  vec2 mq = uv - vec2(aspect * 0.5, -0.565);
  float mug = fill(sdBox(mq, vec2(0.065, 0.08)) - 0.015);
  float handle = fill(abs(length(mq - vec2(0.09, 0.0)) - 0.035) - 0.012) * step(0.075, mq.x);
  vec3 mugCol = vec3(0.16, 0.14, 0.14) * (0.5 + 0.7 * ss(0.08, -0.08, mq.x)) + lampGlow * 3.0;
  col = mix(col, mugCol, clamp(mug + handle, 0.0, 1.0));
  float steam = ss(0.45, 0.8, fbm(vec2(mq.x * 18.0, mq.y * 7.0 - uTime * 0.5))) * step(0.09, mq.y) * (1.0 - ss(0.09, 0.45, mq.y)) * (1.0 - ss(0.0, 0.07, abs(mq.x) - 0.02));
  col += vec3(0.14) * steam;

  vec2 pq = uv - vec2(-aspect * 0.58, -0.6);
  float pot = fill(sdBox(pq - vec2(0.0, -0.01), vec2(0.06, 0.055)) - 0.01);
  float leaves = 0.0;
  for (int i = 0; i < 5; i++) {
    float a = -1.2 + float(i) * 0.6;
    vec2 lr = rot(-a) * (pq - vec2(0.0, 0.045) - vec2(sin(a), cos(a)) * 0.09);
    leaves = max(leaves, fill(length(lr / vec2(0.028, 0.075)) - 1.0));
  }
  col = mix(col, vec3(0.07, 0.05, 0.04) + lampGlow * 2.0, pot);
  col = mix(col, vec3(0.035, 0.07, 0.035) + lampGlow, leaves);
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'rain',
  name: 'Rain',
  group: 'Vibe',
  blurb: 'Rainy city night through a window; bass thickens the rain, lightning strikes',
  tags: ['city', 'weather', 'night', 'calm'],
  energy: 0.3,
  particles: 0,
  trails: 0.2,
  zoom: 1,
  spin: 0,
  ambience: 'rain',
  frag,
};
