// INDEXED — the Geiss plugin for Winamp, 1998: 256 colours and a picture that flows.
//
// Before MilkDrop, Ryan Geiss's first Winamp visualiser worked the way PC demos did. The screen was an
// 8-bit buffer of palette indices, not colours. Every frame each pixel was fetched from a slightly
// displaced spot through a precomputed "effect" map (zoom in with a twist, sink into a whirlpool,
// ripple down a tunnel), losing a little brightness in the fetch, and then the sound was drawn in at
// the hottest index: dots round a circle, a line across, a spiral, "chasers" drawing their own
// trails. Only at the very end did a 256-colour palette turn indices into colour, so the whole screen
// always shared one gradient (black through red and orange to white, or through blues to ice) and a
// palette change recoloured everything at once.
//
// The scene's memory holds that single channel, the index. Six effect maps take turns every 16 beats,
// sliding from one into the next, and each brings its own way of drawing the sound; three chasers
// wander over all of them, and every beat drops a flare for the map to smear. The picture pass is the
// palette: fire, ice, toxic, two cycling sine palettes, and one made from the app's own palette,
// crossfading every 16 beats half a round out of step with the maps. The index is cut to 128 steps,
// so a little of the old banding shows in the smooth gradients.
const shared = `
const float SLOT = 16.0;
int orderOf(float slot) { return int(mod(slot * 5.0, 6.0) + 0.5) % 6; }       // steps of 5 visit all six
// which two, and how far the slide from the first to the second has come (over four beats)
void pick(float beats, out int ia, out int ib, out float b) {
  float slot = floor(beats / SLOT);
  float into = mod(beats, SLOT) + min(uBeatAge / 0.5, 1.0);
  ia = orderOf(slot - 1.0);
  ib = orderOf(slot);
  b = slot < 0.5 ? 1.0 : ss(0.0, 1.0, into / 4.0);
}
`;

const sim = `${shared}
float sampleV(float i) { return texelFetch(uAudio, ivec2(int(clamp(i, 0.0, 1.0) * 511.0), 1), 0).r * 2.0 - 1.0; }

// The effect maps: where each pixel is fetched from in the last frame.
vec2 effectFrom(int m, vec2 q, float aspect) {
  float t = uTime;
  float d = length(q), a = atan(q.y, q.x);
  if (m == 0) { d *= 0.968; a += 0.012; }                                            // zoom in, with a twist
  else if (m == 1) { a += 0.035 * (1.3 - min(d, 1.3)); d = d * 1.016 + 0.001; }      // a whirlpool sinking inward
  else if (m == 2) { d *= 0.972 + 0.014 * sin(d * 20.0 - t * 3.0); }                 // a tunnel of ripples
  else if (m == 3) { d *= 0.962 + 0.02 * cos(4.0 * a + t * 0.5); a += 0.004; }       // four lobes
  else if (m == 4) return q - vec2(0.006 * sin(q.y * 7.0 + t * 1.3), 0.012);          // curtains rising and swaying
  else {                                                                               // two sinks circling each other
    vec2 c1 = 0.42 * vec2(cos(t * 0.4) * aspect * 0.8, sin(t * 0.4));
    vec2 s = q;
    for (int k = 0; k < 2; k++) {
      vec2 v = q - (k == 0 ? c1 : -c1);
      float f = 0.02 / (dot(v, v) + 0.05);
      s += v * f * 0.4 + vec2(-v.y, v.x) * f * 0.6;
    }
    return s;
  }
  return d * vec2(cos(a), sin(a));
}

float line(float d, float px) { return 1.0 - ss(0.5 * px, 1.5 * px, d); }

// how much each map keeps per step: the ones that spread the picture wide must forget it sooner
float keepOf(int m) { return m == 3 ? 0.962 : m == 2 ? 0.975 : m == 4 ? 0.975 : m == 0 ? 0.98 : 0.985; }

// How each map draws the sound, at the hottest index.
float soundInk(int m, vec2 q, float px, float aspect) {
  if (m == 0) {                                   // a circle of dots
    float t = atan(q.y, q.x) / TAU + 0.5;
    float tq = (floor(t * 72.0) + 0.5) / 72.0;
    float rr = 0.42 + 0.18 * sampleV(tq);
    float a = (tq - 0.5) * TAU;
    return 1.0 - ss(px, 2.2 * px, length(q - rr * vec2(cos(a), sin(a))));
  }
  if (m == 1) {                                   // a line straight across
    float x = q.x / (2.0 * aspect) + 0.5;
    return line(abs(q.y - 0.4 * sampleV(x)), px);
  }
  if (m == 2) {                                   // the two channels, standing either side
    float y = q.y * 0.5 + 0.5;
    float l = texelFetch(uAudio, ivec2(int(y * 511.0), 4), 0).r * 2.0 - 1.0;
    float r = texelFetch(uAudio, ivec2(int(y * 511.0), 5), 0).r * 2.0 - 1.0;
    return max(line(abs(q.x + 0.55 - 0.25 * l), px), line(abs(q.x - 0.55 - 0.25 * r), px));
  }
  if (m == 3) {                                   // a spiral, dashed, turning
    float r = length(q);
    if (r > 0.75) return 0.0;
    float a = atan(q.y, q.x) - uTime * 0.8;
    // the spiral is r = 0.1 + 0.15 * turns: find the turn nearest this radius at this angle
    float turn = floor((r - 0.1) / 0.15 - fract(a / TAU) + 0.5) + fract(a / TAU);
    float i = clamp(turn / 4.0, 0.0, 1.0);
    float want = 0.1 + 0.15 * turn + 0.05 * sampleV(i);
    float dash = step(fract(turn * 9.0), 0.3);
    return line(abs(r - want), px * 1.2) * step(0.0, turn) * dash;
  }
  if (m == 4) {                                   // a line along the bottom that feeds the curtains
    float x = q.x / (2.0 * aspect) + 0.5;
    return line(abs(q.y + 0.85 - 0.12 * sampleV(x)), px * 1.3);
  }
  // the sinks: a wide ring of dots for the two whirlpools to pull apart
  float t = atan(q.y, q.x) / TAU + 0.5;
  float tq = (floor(t * 90.0) + 0.5) / 90.0;
  float a = (tq - 0.5) * TAU;
  vec2 dot_ = (0.72 + 0.1 * sampleV(tq)) * vec2(cos(a) * aspect * 0.75, sin(a));
  return 1.0 - ss(px, 2.2 * px, length(q - dot_));
}

void main() {
  vec2 q = centered();
  float aspect = uStateRes.x / uStateRes.y;
  float px = 2.0 / uStateRes.y;
  int ia, ib; float b;
  pick(uBeatCount, ia, ib, b);
  // 1. fetch through the maps (the slide blends the two fetch positions), fading a little
  vec2 s = mix(effectFrom(ia, q, aspect), effectFrom(ib, q, aspect), b);
  vec2 uv = s / vec2(2.0 * aspect, 2.0) + 0.5;
  float v = uv == clamp(uv, 0.0, 1.0) ? texture(uState, uv).r : 0.0;
  v = max(v * mix(keepOf(ia), keepOf(ib), b) - 0.005, 0.0);
  // 2. the sound, at the hottest index; both maps draw while they slide
  float loud = 0.55 + 0.6 * uLevel;
  v = max(v, soundInk(ia, q, px, aspect) * (1.0 - b) * loud);
  v = max(v, soundInk(ib, q, px, aspect) * b * loud);
  // the chasers: three sparks on slow Lissajous paths, bigger when the map has nothing else to draw
  float big = ib == 5 ? 1.0 : 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 c = vec2(sin(uTime * (0.31 + fk * 0.07) + fk * 2.1) * aspect * 0.8, cos(uTime * (0.23 + fk * 0.05) + fk * 1.3) * 0.8);
    float size = px * (1.5 + 2.5 * big + 3.0 * uBass * big);
    v = max(v, 1.0 - ss(size, size + 1.5 * px, length(q - c)));
  }
  // a flare on every beat: a ring thrown down somewhere, for the map to carry off
  if (uBeatAge < 0.12 && uBeatCount > 0.5) {
    vec2 at = (vec2(hash11(uBeatCount * 1.37 + 0.5), hash11(uBeatCount * 2.91 + 0.2)) - 0.5) * vec2(aspect * 1.2, 1.2);
    float rr = 0.04 + uBeatAge * 1.2;
    v = max(v, line(abs(length(q - at) - rr), px * 1.5) * max(uPunch, 0.4));
  }
  outColor = vec4(min(v, 1.0), 0.0, 0.0, 1.0);
}`;

const frag = `${shared}
// The palettes: index in, colour out. Fire, ice and toxic are the classic ramps; two sine palettes run
// through several hues and cycle; the last is built from the app's palette.
vec3 palette(int k, float v) {
  if (k == 0) return clamp(vec3(v * 3.0, v * 3.0 - 1.0, v * 3.0 - 2.0), 0.0, 1.0);
  if (k == 1) return clamp(vec3(v * 3.0 - 2.0, v * 3.0 - 1.0, v * 3.0), 0.0, 1.0);
  if (k == 2) return clamp(vec3(v * 2.6 - 1.2, v * 2.4 - 0.2, v * 3.0 - 2.2), 0.0, 1.0);
  if (k == 3) return ss(0.0, 0.35, v) * (0.5 + 0.5 * cos(TAU * (v * 1.5 - uTime * 0.05 + vec3(0.0, 0.33, 0.67))));
  if (k == 4) return ss(0.0, 0.3, v) * (0.55 + 0.45 * cos(TAU * (v * 3.0 + uTime * 0.08 + vec3(0.0, 0.1, 0.2))));
  return pal(v * 0.85 + 0.05) * ss(0.0, 0.45, v) + vec3(1.0) * ss(0.75, 1.0, v) * 0.8;
}

void main() {
  float v = texture(uState, vUv).r;
  v = floor(v * 128.0 + 0.5) / 128.0;              // the old number of steps
  int ia, ib; float b;
  pick(uBeatCount + SLOT * 0.5, ia, ib, b);         // palettes change half a round after the maps
  vec3 col = mix(palette(ia, v), palette(ib, v), b);
  outColor = vec4(col * 1.1, 1.0);
}`;

export default {
  id: 'indexed',
  name: 'Indexed',
  group: 'Show',
  blurb: 'The Geiss plugin’s 256-colour flow from Winamp ’98: effect maps smear the sound, the palette colours it all',
  tags: ['winamp', 'retro', 'psychedelic', 'abstract', 'chill'],
  energy: 0.55,
  particles: 0,
  trails: 0.0,
  zoom: 1,
  spin: 0,
  frag,
  sim: { height: 360, steps: 1, frag: sim },
};
