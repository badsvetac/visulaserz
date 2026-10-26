import { SCULPT } from '../js/gfx/scene-kit.js';

// FESTIVAL — the main stage at night from somewhere in the crowd: a truss of moving heads throwing
// beams through the haze, lasers fanning out from the deck, a giant LED wall playing the music's
// own spectrogram, confetti drifting down, and a sea of raised hands and phone screens in front.
//
// It is built like a stage photo: flat layers from the back to the front, the light added on top.
// The beams are cones of light seen side-on, so each is a soft wedge from its fixture with haze
// moving through it; the lasers are hairlines from one point; the crowd is rows of silhouettes.
//
// Music: the bass makes the crowd jump and the LED wall pump; the mids drive the moving heads,
// their colour and their sweep; the highs fan the lasers and make the confetti glitter; on the beat
// the stage strobes and the beams snap together.
const frag = `${SCULPT}
const vec2 WALL = vec2(0.0, 0.18);       // the LED wall's centre
const vec2 WALL_HALF = vec2(0.62, 0.34);
const float TRUSS_Y = 0.74;

float haze(vec2 p) {
  return 0.55 + 0.45 * fbm(p * vec2(1.4, 2.2) + vec2(uTime * 0.05, -uTime * 0.03));
}
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float seg(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
// one person in a crowd row, in units of their own height: head, neck, rounded shoulders, and for
// some of them arms up (a phone in one hand now and then)
float person(vec2 q, float h, float t, out float phone) {
  phone = 0.0;
  float head = length((q - vec2(0.0, 0.84 + 0.04 * h)) * vec2(1.0, 0.92)) - 0.085;
  float body = length(max(abs(q - vec2(0.0, 0.1)) - vec2(0.13 + 0.05 * h, 0.62), 0.0)) - 0.09;   // down out of the picture
  float d = smin(head, body, 0.06);
  if (h > 0.42) {
    float both = step(0.8, h);
    for (int s = 0; s < 2; s++) {
      float side = s == 0 ? 1.0 : -1.0;
      if (s == 1 && both < 0.5) break;
      float sway = 0.08 * sin(t * 3.0 + h * 9.0 + side);
      vec2 sh = vec2(0.16 * side, 0.66);
      vec2 el = vec2((0.26 + sway * 0.5) * side, 0.95);
      vec2 hand = vec2((0.22 + sway) * side, 1.22 + 0.06 * h);
      d = smin(d, seg(q, sh, el, 0.05, 0.04), 0.03);
      d = min(d, seg(q, el, hand, 0.04, 0.035));
      d = min(d, length(q - hand) - 0.045);
      if (s == 0 && h > 0.88) {
        vec2 pq = q - hand - vec2(0.0, 0.08);
        phone = step(abs(pq.x), 0.035) * step(abs(pq.y), 0.06);
      }
    }
  }
  return d;
}
// a crowd row: people side by side, overlapping a little, each bobbing on the bass
float crowd(vec2 p, float row, float scale, float jump, out float phone) {
  phone = 0.0;
  float x = p.x / (scale * 0.5) + row * 7.3;
  float cell = floor(x);
  float best = 10.0;
  for (int k = -1; k <= 1; k++) {
    float c = cell + float(k);
    float h = hash11(c + row * 31.0);
    float bob = jump * (0.3 + 0.7 * hash11(c * 2.3 + row)) * abs(sin(uTime * 4.2 + h * 6.0)) * 0.16;
    float tall = 0.92 + 0.16 * hash11(c * 5.1 + row);
    vec2 q = vec2((x - c - 0.5 - (hash11(c * 9.1) - 0.5) * 0.3) * 0.5, (p.y - (-1.02 + row * 0.1)) / scale - bob) / tall;
    float ph;
    float d = person(q, h, uTime, ph) * tall * scale;
    if (d < best) { best = d; phone = ph; }
  }
  return ss(0.003, -0.003, best);
}

void main() {
  musicSignals();
  vec2 uv = centered();
  float flash = gHit * exp(-uBeatAge * 9.0) * uPunch;

  // the night sky over the field, warmed by the stage
  vec3 col = mix(vec3(0.015, 0.012, 0.035), vec3(0.005, 0.004, 0.012), ss(-0.2, 1.0, uv.y));

  // the LED wall: the music's own spectrogram scrolling down it, framed in black
  vec2 w = (uv - WALL) / WALL_HALF;
  if (abs(w.x) < 1.0 && abs(w.y) < 1.0) {
    vec2 px = floor((w * 0.5 + 0.5) * vec2(96.0, 54.0));              // the wall's own pixels
    vec2 cellUv = fract((w * 0.5 + 0.5) * vec2(96.0, 54.0));
    float x = abs(px.x / 96.0 - 0.5) * 2.0;                            // mirrored: bass in the middle
    float age = px.y / 54.0;
    float v = hist(0.02 + x * 0.8, 1.0 - age);
    vec2 c = px / vec2(96.0, 54.0) - 0.5;
    float rings = 0.5 + 0.5 * sin(length(c * vec2(1.8, 1.0)) * 18.0 - uTime * 2.0 - gBass * 3.0 + atan(c.y, c.x) * 3.0);
    vec3 led = pal(x * 0.6 + age * 0.4 + uTime * 0.02) * (pow(v, 1.4) * (1.2 + gBass * 1.6) + rings * rings * (0.2 + 0.35 * uLevel * uAudioActive));
    led += pal(0.5 + x) * 0.03;
    led *= ss(0.5, 0.35, length(cellUv - 0.5));                        // the LEDs are dots
    col = led + flash * 0.3;
  }
  float frame = (step(abs(w.x), 1.03) * step(abs(w.y), 1.05)) * (1.0 - step(abs(w.x), 1.0) * step(abs(w.y), 1.0));
  col = mix(col, vec3(0.01), frame);

  // the stage deck and its front edge, lit from the floor
  float deck = ss(-0.36, -0.37, uv.y) * ss(-0.52, -0.5, uv.y);
  col = mix(col, vec3(0.02, 0.02, 0.03) + pal(0.1) * 0.03, deck);
  // the truss across the top and the towers at the sides, black lattice against the haze
  float truss = step(abs(uv.y - TRUSS_Y), 0.035) * step(abs(uv.x), 1.35);
  float lattice = step(0.5, fract((uv.x + uv.y) * 22.0)) * step(abs(uv.y - TRUSS_Y), 0.025);
  float towers = step(abs(abs(uv.x) - 1.3), 0.04) * step(uv.y, TRUSS_Y);
  col = mix(col, vec3(0.008), max(truss, towers) * (1.0 - lattice * 0.4));

  // the moving heads: cones of light from the truss sweeping through the haze
  vec3 light = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float f = float(i);
    vec2 src = vec2(-1.15 + f * 0.33, TRUSS_Y - 0.04);
    float sweep = sin(uTime * (0.35 + 0.08 * f) + f * 1.7 + uTravel * 0.12 * uAudioActive) * (0.55 + 0.25 * gMid);
    float snap = flash * 0.6;                                              // on the beat they snap together
    float ang = -PI * 0.5 + mix(sweep, (0.0 - src.x) * 0.25, snap);
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 rel = uv - src;
    float along = dot(rel, dir);
    float across = abs(dot(rel, vec2(-dir.y, dir.x)));
    float width = 0.012 + along * 0.11;
    float beam = exp(-pow(across / width, 2.0)) * step(0.0, along) * exp(-along * 0.55);
    float strength = 0.25 + 0.75 * band(0.25 + f * 0.04) + 0.4 * gMid;
    vec3 tint = pal(f * 0.125 + gMid * 0.1);
    light += tint * beam * strength * haze(uv + dir * 0.2) * 1.3;
    light += tint * exp(-dot(rel, rel) * 9000.0) * strength * 2.0;          // the lens of the fixture
  }
  // the lasers: hairlines fanning out from the deck, opening with the highs
  vec2 lsrc = vec2(0.0, -0.36);
  for (int i = 0; i < 12; i++) {
    float f = float(i);
    float spread = (f / 11.0 - 0.5) * (1.2 + 1.4 * gHigh);
    float ang = PI * 0.5 + spread + 0.25 * sin(uTime * 0.8 + f * 0.3);
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 rel = uv - lsrc;
    float along = dot(rel, dir);
    float across = abs(dot(rel, vec2(-dir.y, dir.x)));
    float line = ss(0.0035, 0.0, across) * step(0.0, along) * (0.6 + 0.4 * haze(uv * 3.0));
    light += mix(vec3(0.1, 1.0, 0.35), vec3(1.0, 0.15, 0.55), step(0.5, mod(f, 2.0))) * line * gHigh * 1.2 * uAudioActive;
  }
  col += light;
  // the haze itself, glowing with all of it
  col += (light * 0.12 + pal(0.6) * 0.012) * haze(uv * 0.7);
  col += (light * 0.18 + pal(0.55) * 0.02 * (1.0 + gBass)) * exp(-pow((uv.y + 0.42) * 5.0, 2.0));
  // the strobe on the beat, washing the stage white
  col += vec3(1.0, 0.97, 0.94) * flash * 0.2 * ss(-0.4, 0.8, uv.y);

  // confetti drifting down, glittering on the beat and with the highs
  for (int layer = 0; layer < 2; layer++) {
    float sc = 11.0 + float(layer) * 8.0;
    vec2 g = vec2(uv.x * sc, uv.y * sc + uTime * (1.2 + float(layer) * 0.6));
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + float(layer) * 9.0);
    if (h < 0.09 && uv.y < TRUSS_Y - 0.05) {
      float spin = uTime * (2.0 + h * 6.0) + h * 30.0;
      vec2 q = rot(spin) * (f - (vec2(hash21(cell + 1.0), hash21(cell + 2.0)) - 0.5) * 0.5);
      float paper = step(abs(q.x), 0.18) * step(abs(q.y), 0.07 * abs(cos(spin * 1.3)) + 0.02);
      float shine = 0.25 + 0.75 * abs(sin(spin * 1.3)) * (0.4 + gHigh + flash);
      col = mix(col, pal(h * 5.0) * shine * 1.4, paper * uAudioActive * 0.9);
    }
  }

  // the crowd in front: three rows, nearer ones bigger and darker, some phones held up
  for (int r = 2; r >= 0; r--) {
    float row = float(r);
    float phone;
    float scale = 0.17 + (2.0 - row) * 0.07;
    float cover = crowd(uv, row, scale, gBass, phone);
    vec3 rim = light * 0.08;
    col = mix(col, vec3(0.006, 0.006, 0.01) + rim * (0.3 + row * 0.2), cover);
    col += vec3(0.75, 0.85, 1.0) * phone * 0.9;
  }
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'festival', name: 'Festival', group: 'Show',
  blurb: 'A festival main stage from inside the crowd: moving-head beams sweep the haze, lasers fan out and the LED wall plays the music’s own spectrogram',
  tags: ['stage', 'concert', 'lights', 'lasers', 'crowd', 'party', 'energetic'],
  energy: 0.85, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
