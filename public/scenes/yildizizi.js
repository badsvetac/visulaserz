import { SCULPT } from '../js/gfx/scene-kit.js';

// YILDIZ İZLERİ — a night sky photographed with the shutter open: every star draws an arc round
// the pole star as the earth turns, hundreds of thin rings of light in their own colours, blue-white,
// white, gold and orange, each brightest at its head, where the star is now, and fading behind it;
// the sky turning slowly all the while, a little warm glow from towns below the horizon.
//
// Music: the louder the song (over a couple of seconds), the longer the exposure, so the trails
// stretch and shrink with it; the rings light zone by zone, each zone with its own band, the bass
// on the outside and the highs close to the pole; the highs make the stars at the heads of the
// trails twinkle; on every beat a ring of light runs out from the pole across all the trails.
const frag = `${SCULPT}
float gPx, gAsp;
const float DR = 0.0085;                           // the spacing of the rings
void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  vec2 POLE = vec2(min(0.16, gAsp * 0.1), 0.6);
  float up = uv.y + 1.0;
  vec3 col = mix(vec3(0.06, 0.07, 0.15), vec3(0.008, 0.01, 0.03), ss(0.0, 1.5, up));
  col += vec3(0.32, 0.2, 0.12) * exp(-up * 5.5) * 0.55;                      // towns below the horizon
  col += vec3(0.08, 0.1, 0.2) * exp(-up * 2.0) * 0.25;

  vec2 d = uv - POLE;
  float rho = length(d);
  float phi = atan(d.y, d.x);
  float exposure = 0.45 + 1.1 * ss(0.05, 0.6, uEnergy * uAudioActive);     // radians of arc
  float turn = uTime * 0.035;                                              // the earth turning
  float zone = floor(rho * 4.2);
  float zoneLight = 0.55 + 0.95 * band(0.68 - min(zone, 6.0) * 0.105);     // highs near the pole, bass outside
  // the beat's ring of light, running out from the pole within the beat
  float pulse = 0.0;
  if (uAudioActive > 0.5 && uBeatAge < 0.5) {
    float front = uBeatAge / 0.45 * 2.2;
    pulse = exp(-(rho - front) * (rho - front) / 0.004) * (1.0 - uBeatAge / 0.5) * uPunch;
  }
  vec3 trails = vec3(0.0);
  float ring = floor(rho / DR);
  for (int k = -1; k <= 1; k++) {
    float i = ring + float(k);
    if (i < 1.0) continue;
    for (int s = 0; s < 2; s++) {
      float id = i * 2.0 + float(s);
      float h = hash11(id * 0.731 + 0.17);
      if (h > 0.62) continue;                                              // not every ring has a star
      float r0 = (i + 0.5 + (hash11(id * 1.93) - 0.5) * 0.5) * DR;
      float mag = pow(hash11(id * 3.17 + 0.5), 5.0);                       // a few bright, many faint
      float head = hash11(id * 5.71) * TAU + turn;
      float back = mod(head - phi, TAU);                                   // how far behind the head
      float len = exposure * (0.8 + 0.4 * hash11(id * 7.1));
      if (back > len) continue;
      float u = back / len;
      float across = (rho - r0) / (gPx * 0.62);
      float line = exp(-across * across) * (0.25 + 0.75 * exp(-u * 1.6)) * (1.0 - ss(0.85, 1.0, u));
      float t = hash11(id * 9.3);
      vec3 tint = t < 0.25 ? vec3(0.7, 0.8, 1.0) : t < 0.6 ? vec3(0.95, 0.96, 1.0) : t < 0.85 ? vec3(1.0, 0.88, 0.62) : vec3(1.0, 0.7, 0.45);
      float bright = (0.18 + mag * 1.6);
      // the star at the head, twinkling with the highs
      float tw = 0.8 + 0.2 * sin(uTime * (2.0 + h * 9.0) + id) + gHigh * 0.7 * sin(uTime * 13.0 + id * 3.0);
      float hd = rho * back;                                               // arc distance from the head
      float star = exp(-(hd * hd + (rho - r0) * (rho - r0)) / (gPx * gPx * 1.4)) * tw * (0.6 + mag * 2.0);
      trails += tint * (line * bright + star);
    }
  }
  col += trails * zoneLight * (1.0 + pulse * 2.5);
  col += vec3(0.6, 0.7, 1.0) * pulse * 0.05;
  // the pole star itself, almost still at the centre
  col += vec3(0.95, 0.97, 1.0) * (exp(-rho * rho / (gPx * gPx * 4.0)) * 2.2 + exp(-rho * 70.0) * 0.18);
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'yildizizi', name: 'Yıldız İzleri', group: 'Vibe',
  blurb: 'Star trails round the pole star: the louder the song, the longer the exposure, the rings light zone by zone, and every beat sends a ring of light across them',
  tags: ['sky', 'night', 'stars', 'long exposure', 'geometric', 'calm'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
