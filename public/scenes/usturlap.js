import { SCULPT } from '../js/gfx/scene-kit.js';

// USTURLAP — the night sky as the Silk Road's astronomers drew it: a great golden astrolabe hung in
// the dark, as at Ulugh Beg's Samarkand. The limb with its scale of degrees and the throne it hangs
// from; the plate cut for 40° north, with the circles of altitude closing in on the zenith, the
// lines of azimuth fanning out from it, the tropics and the equator; over it the rete, the turning
// star map, with its offset ring of the zodiac and flame-shaped pointers each ending on a star;
// the rule across it all; the pole star at the centre; the real stars all round.
//
// Music: the bass makes the whole instrument glow; each circle of altitude lights with its own
// band in the mids; each of the twelve signs round the zodiac ring lights with its own band, from
// the bass to the highs; the highs make the stars on the pointers twinkle; louder music turns the
// rete faster; on every beat the rule swings round to a new star and flashes.
const frag = `${SCULPT}
float gPx, gAsp, gU;                               // gU: one pixel, in the astrolabe's units
const float PHI = 0.6981;                          // the plate is cut for 40° north
const float KP = 0.591;                            // the plate's scale: the Tropic of Capricorn at 0.9
// an engraved line at distance d, w wide, with a soft glow round it
float stroke(float d, float w) { return ss(w + gU, max(w - gU, 0.0), abs(d)) + exp(-abs(d) / (w * 3.0 + gU * 2.0)) * 0.22; }
// a circle of altitude a on the plate (stereographic, from the south pole): its centre on the
// meridian and its radius
vec2 almucantar(float a) {
  float ys = tan((PI - a - PHI) * 0.5), yn = tan((a - PHI) * 0.5);
  return vec2(ys + yn, ys - yn) * 0.5 * KP;
}
// a tapered stroke from a to b, ra wide at a and rb at b
float taper(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  float AR = min(0.78, gAsp * 0.9);                // the instrument fills the sky, in a tall frame too
  vec2 AC = vec2(0.0, -0.02);
  float up = uv.y + 1.0;
  vec3 col = mix(vec3(0.05, 0.07, 0.17), vec3(0.006, 0.008, 0.03), ss(0.0, 1.5, up));
  col += vec3(0.09, 0.1, 0.21) * exp(-up * 5.0) * 0.7;                       // the glow along the horizon
  for (int layer = 0; layer < 3; layer++) {
    float scale = 62.0 + float(layer) * 80.0;
    vec2 g = uv * scale + float(layer) * 13.9;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + 33.0);
    if (h > 0.07) continue;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float r = length(f - off * 0.7) / scale;
    float bright = (0.12 + pow(hash21(cell + 1.3), 6.0) * 2.8) / (1.0 + float(layer) * 1.4);
    float tw = 0.8 + 0.2 * sin(uTime * (1.5 + h * 9.0) + h * 40.0) + gHigh * 0.5 * sin(uTime * 11.0 + h * 90.0);
    col += mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.7), hash21(cell + 9.0)) * bright * tw * exp(-r * r / (gPx * gPx * 0.56));
  }

  gU = gPx / AR;
  vec2 p = (uv - AC) / AR;
  float r = length(p);
  // a warm haze round the instrument, as if its gold lit the air
  col += vec3(0.5, 0.34, 0.14) * exp(-max(r - 1.0, 0.0) * 5.0) * 0.07 * (0.6 + 0.8 * gBass);
  if (r < 1.32) {
    float gold = 0.0;                              // how much engraved brass covers this pixel
    float lit = 0.0;                               // starlight on the pointers, the rule's flash
    // the mater: a dark plate behind the lines, with a faint sheen, so the instrument reads as a
    // thing hanging in the sky
    float plate = ss(1.0 + gU, 1.0 - gU, r);
    vec3 mater = col * 0.45 + vec3(0.016, 0.014, 0.03) + vec3(0.06, 0.045, 0.02) * ss(0.95, 0.2, length(p - vec2(-0.35, 0.4)));
    col = mix(col, mater, plate * 0.7);
    // the limb: two rims and the scale of degrees between them (the single degrees only where
    // a degree is wide enough to show)
    gold += stroke(r - 1.0, 0.007) + stroke(r - 0.9, 0.004);
    float th = atan(p.x, p.y);
    float deg = (th / TAU + 0.5) * 360.0;
    float rim = ss(0.9, 0.905, r) * ss(1.0, 0.995, r);
    float d1 = abs(fract(deg + 0.5) - 0.5) * TAU / 360.0 * r;
    float d5 = abs(fract(deg / 5.0 + 0.5) - 0.5) * 5.0 * TAU / 360.0 * r;
    float d10 = abs(fract(deg / 10.0 + 0.5) - 0.5) * 10.0 * TAU / 360.0 * r;
    float fine = ss(1.5, 3.0, 0.95 * TAU / 360.0 / gU);
    gold += ss(0.0014 + gU, 0.0, d1) * ss(0.952, 0.958, r) * rim * fine * 0.75;
    gold += ss(0.0019 + gU, 0.0, d5) * ss(0.93, 0.936, r) * rim;
    gold += ss(0.0024 + gU, 0.0, d10) * rim;
    // the throne at the top and the ring it hangs from
    vec2 tq = p - vec2(0.0, 1.0);
    float throne = min(length(tq - vec2(0.0, 0.07)) - 0.07, max(abs(tq.x) - 0.13 + tq.y * 1.1, abs(tq.y - 0.03) - 0.05));
    gold += ss(gU, -gU, throne) * 0.85 + stroke(length(p - vec2(0.0, 1.21)) - 0.05, 0.007);

    // the plate: the tropics and the equator, the circles of altitude every 10° (each lit by its
    // own band), the lines of azimuth every 15° from the zenith down to the horizon, the meridian
    float inPlate = ss(0.9 + gU, 0.9 - gU, r);
    gold += (stroke(r - 0.388, 0.003) + stroke(r - KP, 0.003)) * inPlate;
    vec2 hz = almucantar(0.0);
    float aboveHorizon = ss(hz.y + gU, hz.y - gU, length(p - vec2(0.0, hz.x)));
    for (int k = 0; k < 9; k++) {
      vec2 c = almucantar(float(k) * PI / 18.0);
      gold += stroke(length(p - vec2(0.0, c.x)) - c.y, 0.0028) * inPlate * (0.3 + 0.85 * band(0.12 + 0.045 * float(k)));
    }
    float zy = tan((PI * 0.5 - PHI) * 0.5) * KP, ny = -tan((PI * 0.5 + PHI) * 0.5) * KP;
    float yb = (zy + ny) * 0.5, hh = (zy - ny) * 0.5;
    for (int k = 1; k < 12; k++) {
      float cx = hh / tan(float(k) * PI / 12.0);
      gold += stroke(length(p - vec2(cx, yb)) - sqrt(cx * cx + hh * hh), 0.0022) * inPlate * aboveHorizon * 0.45;
    }
    gold += stroke(p.x, 0.0024) * inPlate * aboveHorizon * 0.45;

    // the rete, turning with the heavens (faster when the music is louder)
    vec2 q = rot(uCruise * 0.05) * p;
    // the zodiac ring: off-centre, touching Cancer on one side and Capricorn on the other; each
    // sign glows with its own band, from the bass round to the highs
    vec2 eq = q - vec2(0.0, 0.256);
    float er = length(eq);
    float inRing = ss(0.644 + gU, 0.644 - gU, er) * ss(0.592 - gU, 0.592 + gU, er);
    float ea = atan(eq.x, eq.y) / TAU + 0.5;
    float sgn = floor(ea * 12.0);
    col += vec3(1.0, 0.7, 0.3) * inRing * (0.06 + 0.6 * band(0.03 + sgn * 0.075));
    gold += stroke(er - 0.644, 0.0032) + stroke(er - 0.592, 0.0026);
    gold += ss(0.0028 + gU, 0.0, abs(fract(ea * 12.0 + 0.5) - 0.5) / 12.0 * TAU * er) * inRing;
    gold += ss(0.0016 + gU, 0.0, abs(fract(ea * 72.0 + 0.5) - 0.5) / 72.0 * TAU * er) * ss(0.626, 0.632, er) * inRing * 0.8;
    // the rete's bar, from Cancer out to Capricorn on either side
    gold += stroke(q.y, 0.006) * ss(0.37, 0.4, abs(q.x)) * ss(0.9, 0.87, abs(q.x));
    // the star pointers: brass flames on the rete, each ending on a star
    for (int i = 0; i < 16; i++) {
      float fi = float(i);
      float a = fi * TAU / 16.0 + (hash11(fi * 1.31 + 0.2) - 0.5) * 0.32;
      float rad = 0.3 + 0.55 * hash11(fi * 2.71 + 0.6);
      vec2 tip = rad * vec2(sin(a), cos(a));
      vec2 base = (rad - 0.08) * vec2(sin(a + 0.1), cos(a + 0.1));
      gold += ss(gU, -gU, taper(q, base, tip, 0.017, 0.0015)) * 0.9;
      float tw = 0.75 + 0.25 * sin(uTime * (2.0 + fi * 0.7) + fi * 3.0) + gHigh * 0.85 * sin(uTime * 14.0 + fi * 7.0);
      vec2 s = q - tip;
      lit += (exp(-dot(s, s) / (gU * gU * 6.0)) * 1.5 + exp(-length(s) * 55.0) * 0.12) * tw;
    }
    // the pole star at the centre
    lit += exp(-dot(p, p) / (gU * gU * 7.0)) * 2.0 + exp(-r * 40.0) * 0.12;

    // the rule: on every beat it swings round to a new star and flashes along its length
    float n = uBeatCount;
    float swing = uAudioActive > 0.5 ? ss(0.0, 0.25, uBeatAge) : 1.0;
    float ra = mix(hash11((n - 1.0) * 0.77) * TAU, hash11(n * 0.77) * TAU, swing);
    vec2 dir = vec2(sin(ra), cos(ra));
    float along = dot(p, dir), side = dot(p, vec2(-dir.y, dir.x));
    float rule = ss(0.011 + gU, 0.011 - gU, abs(side) + max(abs(along) - 0.92, 0.0) * 0.12) * ss(1.0, 0.97, abs(along));
    gold += rule * 0.95;
    if (uAudioActive > 0.5) lit += exp(-uBeatAge * 6.0) * uPunch * ss(0.035, 0.0, abs(side)) * ss(1.0, 0.2, abs(along)) * 0.6;

    vec3 brass = vec3(1.0, 0.76, 0.38) * (0.5 + 0.6 * gBass);
    col = mix(col, brass, clamp(gold, 0.0, 1.0) * 0.9);
    col += vec3(1.0, 0.9, 0.72) * lit;
  }
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'usturlap', name: 'Usturlap', group: 'Vibe',
  blurb: 'A golden astrolabe hung in the night, as at Samarkand: each sign of its zodiac ring lights with a band, and every beat swings the rule to a new star',
  tags: ['sky', 'night', 'stars', 'astrolabe', 'astronomy', 'gold', 'geometric', 'calm'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
