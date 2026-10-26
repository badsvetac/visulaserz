import { SCULPT } from '../js/gfx/scene-kit.js';

// KUYRUKLU YILDIZ — a moonless night sky with a great comet in it: the head low on the right, a
// broad curved tail of dust raked with fine striations and a straight blue tail of gas fanning up
// and away across the whole sky, the Milky Way crossing the other way, the faint green airglow of
// the upper air along the bottom, and a meteor shower falling out of one point of the sky.
//
// Music: the bass swells the comet's head and brightens its dust tail; each striation across the
// dust tail lights with its own band, the bass near the head and the highs at the far end; the
// highs set the gas tail's filaments and the stars flickering; the mids brighten the Milky Way;
// on every beat meteors burst out of the radiant, gone within the beat.
const frag = `${SCULPT}
float gPx, gAsp;
void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  vec2 HEAD = vec2(min(0.95, gAsp * 0.6), -0.36);   // inside a tall frame too
  vec2 TAIL = vec2(-0.8, 0.6);                       // away from the sun, which is below the horizon
  vec2 RADIANT = vec2(-min(0.92, gAsp * 0.52), 0.74);
  float up = uv.y + 1.0;
  vec3 col = mix(vec3(0.05, 0.07, 0.16), vec3(0.004, 0.006, 0.024), ss(0.0, 1.4, up));
  // the airglow: a faint green band in the upper air over the horizon, below the frame
  col += vec3(0.05, 0.13, 0.07) * exp(-(up - 0.06) * (up - 0.06) / 0.012) * (0.8 + 0.2 * fbm(uv * vec2(3.0, 9.0) + uTime * 0.01));
  col += vec3(0.07, 0.09, 0.18) * exp(-up * 6.0) * 0.6;

  // the Milky Way, crossing the comet's tails the other way, with dark lanes of dust
  vec2 mw = rot(0.62) * (uv - vec2(-0.2, 0.05));
  float bandMW = exp(-mw.y * mw.y * 6.0);
  float lanes = ss(0.5, 0.75, fbm(mw * vec2(2.0, 7.0) + 3.1));
  float cloud = fbm(mw * vec2(4.0, 11.0) - 1.7) * fbm(mw * 9.0 + 5.0) * 2.0;
  col += vec3(0.19, 0.2, 0.3) * bandMW * cloud * (1.0 - 0.8 * lanes) * (0.45 + 0.35 * gMid);

  // stars in three sizes, thickest in the Milky Way, twinkling, flickering with the highs
  for (int layer = 0; layer < 3; layer++) {
    float scale = 58.0 + float(layer) * 80.0;
    vec2 g = uv * scale + float(layer) * 31.7;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + 11.0);
    if (h > 0.075 + bandMW * 0.18 * float(layer)) continue;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float r = length(f - off * 0.7) / scale;
    float bright = (0.14 + pow(hash21(cell + 1.3), 6.0) * 3.0) / (1.0 + float(layer) * 1.3);
    float tw = 0.8 + 0.2 * sin(uTime * (1.5 + h * 9.0) + h * 40.0) + gHigh * 0.55 * sin(uTime * 13.0 + h * 90.0);
    col += mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.86, 0.7), hash21(cell + 9.0)) * bright * tw * exp(-r * r / (gPx * gPx * 0.56));
  }

  vec2 rel = uv - HEAD;
  float along = dot(rel, TAIL);
  float across = dot(rel, vec2(-TAIL.y, TAIL.x));
  // the gas tail: straight and narrow, blue, combed into filaments that flicker with the highs
  if (along > 0.0) {
    float w = 0.013 + along * 0.04;
    float gas = exp(-across * across / (w * w)) * exp(-along * 0.62);
    float strands = 0.72 + 0.28 * sin(across / w * 6.0 + along * 11.0 - uTime * 1.1 + 2.0 * noise(vec2(along * 6.0, uTime * 0.2))) * (0.5 + 0.8 * gHigh);
    col += vec3(0.3, 0.55, 1.2) * gas * strands * 0.55;
  }
  // the dust tail: broad and curving away to one side, yellow-white, raked with thin
  // striations, each striation its own band of the spectrum
  {
    float a = max(along, 0.0);
    float bend = across + 0.24 * a * a;
    float w = 0.034 + a * 0.28;
    float dust = exp(-bend * bend / (w * w)) * exp(-a * 1.0) * ss(-0.015, 0.03, along);
    float sk = a * 7.0 + bend * 1.6;
    float k = floor(sk);
    float fk = fract(sk) - 0.5;
    float stri = 0.9 + 0.1 * sin(a * 40.0 + bend * 7.0) + 0.55 * band(0.05 + k * 0.1) * exp(-fk * fk * 110.0);
    col += vec3(1.05, 0.95, 0.76) * dust * stri * (0.6 + 0.6 * gBass) * 0.75;
  }
  // the head: a hard bright nucleus in a green-white coma that swells with the bass
  float r2 = dot(rel, rel);
  col += vec3(0.62, 1.0, 0.82) * exp(-r2 / (0.0018 * (1.0 + gBass * 1.6))) * 0.9;
  col += vec3(0.75, 0.9, 1.0) * exp(-r2 / 0.015) * 0.14;
  col += vec3(1.0, 1.0, 0.96) * exp(-r2 / (gPx * gPx * 6.0)) * 2.4;

  // the shower: on every beat three meteors burst out of the radiant, each gone within the beat
  if (uAudioActive > 0.5 && uBeatAge < 0.6) {
    for (int m = 0; m < 3; m++) {
      float n = uBeatCount * 3.0 + float(m);
      float life = (uBeatAge - 0.06 * float(m)) / 0.42;
      if (life < 0.0 || life > 1.0) continue;
      float ang = -0.3 - hash11(n * 1.7) * 2.5;                         // outwards and down, into the frame
      vec2 dir = vec2(cos(ang), sin(ang));
      vec2 start = RADIANT + dir * (0.06 + 0.22 * hash11(n * 2.3));
      vec2 head = start + dir * life * (0.45 + 0.4 * hash11(n * 3.1));
      vec2 q = uv - head;
      float back = -dot(q, dir), side = abs(dot(q, vec2(-dir.y, dir.x)));
      float trail = ss(-0.004, 0.008, back) * ss(0.28 * life + 0.02, 0.0, back) * ss(gPx * 1.4, 0.0, side);
      float glow = exp(-dot(q, q) / (gPx * gPx * 4.0));
      col += mix(vec3(0.8, 0.95, 1.0), vec3(1.0, 0.85, 0.6), hash11(n * 5.3)) * (trail * 0.9 + glow) * sin(min(life, 1.0) * PI) * uPunch;
    }
  }
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'kuyruklu', name: 'Kuyruklu Yıldız', group: 'Vibe',
  blurb: 'A great comet across a moonless sky: its dust tail lights striation by striation, the bass swells its head, and every beat bursts meteors from the radiant',
  tags: ['sky', 'night', 'comet', 'meteors', 'stars', 'space', 'calm'],
  energy: 0.35, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
