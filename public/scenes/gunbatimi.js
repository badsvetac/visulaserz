import { SCULPT } from '../js/gfx/scene-kit.js';

// GÜN BATIMI — a whole sky at sunset: a great red sun sinking into a low bank of cloud whose top
// edge burns where it is backlit, the sky going from gold at the horizon through coral and rose to
// violet overhead, long thin clouds in the middle lit from below, a high mackerel sky of small
// cloudlets catching the last pink light, rays fanning up from the sun, and the evening star.
//
// Music: every ray from the sun pulses with its own band of the spectrum and the bass makes them
// all stronger; the mids light the middle clouds from below; the highs set the air over the cloud
// bank trembling, so the sun's lower edge wavers, and make the evening star twinkle; each row of
// the high cloudlets glows with a band of its own; on every beat the top of the sun throws a green
// flash, the rare last light of a real sunset.
const frag = `${SCULPT}
float gPx, gAsp;
const vec2 SUN = vec2(0.14, -0.47);
const float SUN_R = 0.14;

// billows along the top of the cloud bank: overlapping domed heads of cloud about w apart, each
// meeting its neighbours in a soft notch (a dome that flattens to its edge, never a wall)
float billows(float x, float w, float seed) {
  float cx = floor(x / w), top = 0.0;
  for (int k = -2; k <= 2; k++) {
    float c = cx + float(k);
    float rr = w * (0.8 + 0.6 * hash11(c * 1.7 + seed));
    float centre = (c + 0.5 + (hash11(c * 3.1 + seed) - 0.5) * 0.6) * w;
    float dx = (x - centre) / rr;
    float dome = max(1.0 - dx * dx, 0.0);
    top = max(top, dome * sqrt(dome) * rr * 0.42 * (0.7 + 0.6 * hash11(c * 5.3 + seed)));
  }
  return top;
}
// the top of the low cloud bank: cauliflower heads at two sizes on a slow swell
float bankTop(float x) {
  float xs = x + uTime * 0.004;
  return -0.66 + 0.035 * fbm(vec2(xs * 1.2, 3.0)) + billows(xs, 0.24, 1.0) + billows(xs + 0.05, 0.075, 7.0) * 0.6;
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  float up = uv.y + 0.6;                         // height above the horizon
  vec2 sp = uv - SUN;
  float dist = length(sp);

  // the dusk from the horizon up: gold, coral, rose, violet
  float h = ss(0.0, 1.6, up);
  vec3 col = mix(vec3(1.08, 0.64, 0.28), vec3(1.0, 0.4, 0.26), ss(0.0, 0.2, h));
  col = mix(col, vec3(0.66, 0.25, 0.42), ss(0.16, 0.52, h));
  col = mix(col, vec3(0.16, 0.08, 0.28), ss(0.48, 1.0, h));
  col += vec3(1.0, 0.55, 0.22) * (exp(-dist * 2.4) * 0.55 + exp(-dist * 8.5) * 0.65 * (1.0 + 0.7 * gBass));   // the glow round the sun, breathing with the bass

  // the first stars, high up where the sky has gone violet, and the evening star
  for (int layer = 0; layer < 2; layer++) {
    float scale = 70.0 + float(layer) * 90.0;
    vec2 g = uv * scale + float(layer) * 23.1;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float hs = hash21(cell + 4.0);
    if (hs > 0.05) continue;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float r = length(f - off * 0.7) / scale;
    float tw = 0.75 + 0.25 * sin(uTime * (1.3 + hs * 30.0) + hs * 70.0) + gHigh * 0.5 * sin(uTime * 12.0 + hs * 90.0);
    col += vec3(1.0, 0.92, 0.85) * (0.15 + pow(hash21(cell + 1.3), 5.0)) * tw * exp(-r * r / (gPx * gPx * 0.5)) * ss(1.05, 1.5, up);
  }
  vec2 vp = uv - vec2(-min(1.2, gAsp * 0.74), 0.74);
  col += vec3(1.0, 0.97, 0.88) * exp(-dot(vp, vp) / (gPx * gPx * 2.2)) * (1.6 + gHigh * 1.4 * sin(uTime * 15.0));
  col += vec3(0.9, 0.8, 0.9) * exp(-length(vp) * 40.0) * 0.12;

  // the mackerel sky: high cloudlets in rippling rows, in patches with clear sky between, lit
  // pink from below; each row glows with its own band
  {
    vec2 m = vec2(uv.x * 1.3 + uTime * 0.006, uv.y);
    float wav = m.y * 24.0 + 2.4 * fbm(m * vec2(1.8, 2.6) + 1.0);
    float row = floor(wav);
    float across = fract(wav) - 0.5;
    float along = noise(vec2(m.x * 15.0 + row * 3.7, row * 1.31)) * 0.7 + noise(vec2(m.x * 31.0 - row * 1.9, row * 2.7)) * 0.3;
    float puff = ss(0.5, 0.0, abs(across) + (0.6 - along) * 1.25) * ss(0.42, 0.66, fbm(m * vec2(1.4, 2.2) + 7.0));
    puff *= ss(0.18, 0.5, uv.y) * ss(1.06, 0.78, uv.y);
    vec3 pink = mix(vec3(0.92, 0.48, 0.62), vec3(1.0, 0.7, 0.5), ss(0.85, 0.3, uv.y));
    col = mix(col, pink * (0.72 + 0.6 * band(0.25 + 0.05 * mod(row, 9.0))) * (0.85 + 0.3 * along), puff * 0.58);
  }

  // rays fanning up from the sun, each sector its own band
  float ang = atan(sp.y, sp.x);
  float ray = ss(0.42, 0.86, 0.62 * noise(vec2(ang * 11.0, 1.3)) + 0.38 * noise(vec2(ang * 29.0, 7.1)));
  float sector = floor(ang * 14.0 / PI);
  float pulse = 0.3 + 0.5 * gBass + 0.8 * band(0.06 + 0.5 * hash11(sector * 1.9 + 2.0));
  float rays = ray * pulse * ss(-0.05, 0.12, sp.y) * exp(-dist * 1.8) * ss(SUN_R * 1.05, SUN_R * 2.4, dist);

  // long thin clouds in the middle, lit from below by the sun: brightest near it, rose further off
  vec2 cq = vec2(uv.x * 0.85 + uTime * 0.012, uv.y * 7.0);
  float cl = fbm(cq + vec2(fbm(cq * vec2(0.5, 1.3) + 3.0) * 1.4, 0.0));
  float streaks = ss(0.56, 0.78, cl) * ss(-0.45, -0.25, uv.y) * ss(0.45, 0.1, uv.y);
  vec3 cloudLit = mix(vec3(0.82, 0.32, 0.42), vec3(1.35, 0.78, 0.36), exp(-dist * 1.6));
  col = mix(col, cloudLit * (0.55 + 0.75 * gMid), streaks * 0.85);
  col += vec3(1.0, 0.6, 0.3) * rays * (1.0 - streaks * 0.7) * 0.2;

  // the sun: the air over the cloud bank trembles with the highs, so its lower edge wavers, and
  // the thick air near the horizon flattens it a little and cuts slices into its bottom
  float shimmer = gHigh * 0.007 * ss(0.0, -0.12, sp.y) * sin(uv.y * 170.0 + uTime * 9.0);
  vec2 sq = vec2(sp.x + shimmer, sp.y * 1.1);
  float r = length(sq);
  float disc = ss(SUN_R + gPx, SUN_R - gPx, r);
  float limb = ss(SUN_R, 0.0, r);
  vec3 sunCol = mix(vec3(1.15, 0.26, 0.05), vec3(1.55, 0.72, 0.28), limb);
  float slices = 1.0 - 0.4 * ss(-0.04, -0.12, sp.y) * step(0.55, fract(sp.y * 52.0 + 0.3));
  col = mix(col, sunCol * slices * 1.1, disc);
  // the green flash on the beat: a green cap on the top edge and a hair of green above it
  if (uAudioActive > 0.5 && uBeatAge < 0.45) {
    float flash = exp(-uBeatAge * 7.0) * uPunch;
    float top = sq.y / SUN_R;
    float cap = ss(0.55, 0.9, top) * ss(SUN_R + gPx * 3.0, SUN_R - gPx, r) * ss(0.6, 0.1, abs(sq.x) / SUN_R);
    float hair = exp(-(r - SUN_R) * (r - SUN_R) / 0.0003) * ss(0.3, 0.95, top);
    col = mix(col, vec3(0.18, 1.3, 0.45), cap * flash);
    col += vec3(0.2, 0.9, 0.4) * hair * flash * 0.8;
  }

  // the low cloud bank the sun sinks into: dark violet below, its top edge on fire where the
  // sun is behind it, fading to rose further along
  float top = bankTop(uv.x);
  float inBank = ss(top + gPx * 1.5, top - gPx * 1.5, uv.y);
  float depth = max(top - uv.y, 0.0);            // (above the bank, exp() of a negative depth would overflow)
  // the shading inside follows the bank's slow swell, not each head, or the heads read as curtains
  float body = max(-0.55 + 0.035 * fbm(vec2((uv.x + uTime * 0.004) * 1.2, 3.0)) - uv.y, 0.0);
  float nearSun = exp(-abs(uv.x - SUN.x) * 2.4);
  float lining = exp(-depth * 70.0) * (0.3 + 1.5 * nearSun);                   // the burning edge
  float puffs = fbm(vec2(uv.x * 6.0 + uTime * 0.01, uv.y * 6.0));
  vec3 bank = mix(vec3(0.5, 0.2, 0.28), vec3(0.15, 0.06, 0.13), ss(0.0, 0.32, body));
  bank *= 0.75 + 0.5 * puffs;                                                  // billows inside the bank
  bank += vec3(1.3, 0.58, 0.22) * lining;
  bank += vec3(0.85, 0.36, 0.2) * exp(-body * 9.0) * nearSun * 0.25;           // light soaking in near the sun
  col = mix(col, bank, inBank);
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'gunbatimi', name: 'Gün Batımı', group: 'Vibe',
  blurb: 'A whole sky at sunset: a red sun sinks into a burning cloud bank, its rays pulse band by band, and every beat throws a green flash',
  tags: ['sky', 'sunset', 'sun', 'clouds', 'warm', 'calm'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
