import { SCULPT } from '../js/gfx/scene-kit.js';

// HALKALI GEZEGEN — the sky of another world: a vast ringed planet rising out of the haze along the
// horizon, lit from the side so it shows a fat gibbous face of cloud belts drifting round it and
// one great storm, its rings a thin bright ellipse cutting across the sky, the rings' shadow on
// its clouds and its own shadow across the rings, two small moons, and a teal dusk deepening to
// violet overhead.
//
// Music: the bass lights the thin air at the planet's edge and brightens the rings; the mids stir
// the great storm and make it glow; the highs glint in the ring dust and make the stars twinkle;
// every beat sends a wave of light running out through the rings.
const frag = `${SCULPT}
float gPx, gAsp;
const float PR = 0.74;                             // the planet's radius on the screen
const vec3 PSUN = vec3(0.80, 0.36, 0.48);          // the sun, seen from the planet: right, up, towards us
const vec3 RING_N = vec3(-0.2, 0.95, 0.2);         // the rings' axis: we see them nearly edge-on
const float RING_IN = 1.32, RING_OUT = 2.25;       // in planet radii
// how much ring there is at a distance r from the planet's centre: ringlets (only where a pixel
// can still show them), soft edges, a dark division, a faint inner ring
float ringDensity(float r, float aa) {
  float x = (r - RING_IN) / (RING_OUT - RING_IN);
  if (x < 0.0 || x > 1.0) return 0.0;
  float d = 0.58 + 0.24 * sin(x * 47.0) * sin(x * 13.0 + 1.0) + 0.18 * sin(x * 131.0);
  d = mix(0.62, d, aa);
  d *= ss(0.0, 0.03, x) * ss(1.0, 0.94, x);
  d *= 1.0 - 0.9 * exp(-(x - 0.66) * (x - 0.66) / 0.0007);
  d *= mix(0.45, 1.0, ss(0.08, 0.32, x));
  return clamp(d, 0.0, 1.0);
}
void main() {
  musicSignals();
  vec2 uv = centered();
  gPx = 2.0 / uRes.y;
  gAsp = uRes.x / uRes.y;
  vec2 PC = vec2(-min(0.5, gAsp * 0.3), -0.3);     // the planet's centre, inside a tall frame too
  vec3 S = normalize(PSUN), N = normalize(RING_N);
  vec2 q = (uv - PC) / PR;
  float qq = dot(q, q);
  float dist = length(uv - PC);
  // where the view crosses the rings' plane (the planet is far off, so the view is parallel), and
  // how fast that changes across a pixel (here, before any loop or branch)
  float zr = -(N.x * q.x + N.y * q.y) / N.z;
  vec3 pr = vec3(q, zr);
  float rr = length(pr);
  float aa = ss(0.03, 0.006, fwidth(rr));

  float up = uv.y + 1.0;
  vec3 col = mix(vec3(0.13, 0.32, 0.35), vec3(0.05, 0.03, 0.13), ss(0.1, 1.6, up));
  col += vec3(0.28, 0.46, 0.42) * exp(-up * 3.2) * 0.55;                    // the haze along the horizon
  // stars through the dusk, more of them higher up
  for (int layer = 0; layer < 2; layer++) {
    float scale = 64.0 + float(layer) * 90.0;
    vec2 g = uv * scale + float(layer) * 41.3;
    vec2 cell = floor(g), f = fract(g) - 0.5;
    float h = hash21(cell + 21.0);
    if (h > 0.055) continue;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float r = length(f - off * 0.7) / scale;
    float tw = 0.75 + 0.25 * sin(uTime * (1.4 + h * 25.0) + h * 50.0) + gHigh * 0.55 * sin(uTime * 12.0 + h * 90.0);
    col += vec3(0.85, 0.9, 1.0) * (0.12 + pow(hash21(cell + 1.3), 5.0) * 1.5) * tw * exp(-r * r / (gPx * gPx * 0.5)) * ss(0.5, 1.3, up);
  }
  // two small moons, lit from the same side
  for (int m = 0; m < 2; m++) {
    vec2 mc = m == 0 ? vec2(min(0.92, gAsp * 0.58), 0.52) + vec2(cos(uTime * 0.03), sin(uTime * 0.03)) * 0.025 : vec2(min(0.3, gAsp * 0.3), 0.8);
    float mr = m == 0 ? 0.05 : 0.025;
    vec2 mq = (uv - mc) / mr;
    float mqq = dot(mq, mq);
    if (mqq < 1.2) {
      vec3 mn = vec3(mq, sqrt(max(1.0 - mqq, 0.0)));
      float ml = ss(-0.05, 0.35, dot(mn, S));
      vec3 face = vec3(0.8, 0.76, 0.72) * ml * (0.75 + 0.35 * fbm(mq * 2.5 + float(m) * 7.0)) + vec3(0.02, 0.03, 0.04);
      col = mix(col, face, ss(mr + gPx, mr - gPx, length(uv - mc)));
    }
  }
  // the planet's thin air glowing just outside its edge, more with the bass
  col += vec3(0.32, 0.6, 0.68) * exp(-max(dist - PR, 0.0) * 22.0) * ss(PR - gPx, PR + gPx, dist) * (0.18 + 0.5 * gBass) * (0.4 + 0.6 * ss(-0.6, 0.6, dot(normalize(vec3(q, 0.0) + 1e-5), S)));

  float ring = ringDensity(rr, aa);
  // the planet's shadow across the rings
  float pb = dot(pr, S), pd = pb * pb - (dot(pr, pr) - 1.0);
  float shade = (pd > 0.0 && pb < 0.0) ? 0.12 : 1.0;
  vec3 ringCol = vec3(0.92, 0.84, 0.70) * (0.55 + 0.5 * gBass) * shade;
  // the highs glint in the ring dust
  vec2 gc = floor(vec2(atan(pr.z, pr.x) * 180.0, rr * 260.0));
  float gh = hash21(gc);
  ringCol += vec3(1.0, 0.97, 0.9) * step(0.985, gh) * gHigh * (0.5 + 0.5 * sin(uTime * 19.0 + gh * 60.0)) * 1.4 * shade;
  // and every beat sends a wave of light out through them
  if (uAudioActive > 0.5 && uBeatAge < 0.5) {
    float life = uBeatAge / 0.45;
    float front = mix(RING_IN, RING_OUT, life);
    ringCol += vec3(1.0, 0.94, 0.8) * exp(-(rr - front) * (rr - front) / 0.0016) * (1.0 - life) * uPunch * 1.3;
  }
  float ringA = ring * 0.88;
  if (zr < 0.0) col = mix(col, ringCol, ringA);                            // the far half, behind the planet

  // the planet: cloud belts drifting round it, a great storm, the rings' shadow on its clouds
  if (dist < PR + gPx) {
    vec3 n = vec3(q, sqrt(max(1.0 - qq, 0.0)));
    float lat = dot(n, N);
    vec3 e1 = normalize(cross(N, vec3(0.0, 0.0, 1.0))), e2 = cross(N, e1);
    float lon = atan(dot(n, e2), dot(n, e1));
    float polar = ss(0.97, 0.72, abs(lat));                              // the longitudes meet at the poles
    float turb = (fbm(vec2(lon * 2.2 + uTime * 0.015, lat * 18.0)) - 0.5) * polar;
    float y = lat * 8.5 + turb * 0.9;
    float b1 = 0.5 + 0.5 * sin(y * PI), b2 = 0.5 + 0.5 * sin(y * 2.3 + 1.0);
    vec3 cloud = mix(mix(vec3(0.55, 0.38, 0.30), vec3(0.72, 0.52, 0.34), b2), vec3(0.93, 0.82, 0.62), b1 * 0.75);
    cloud *= 0.82 + 0.32 * mix(0.5, fbm(vec2(lon * 6.0 - uTime * 0.01, lat * 42.0)), polar);
    // the storm, stirred and lit by the mids
    vec2 sv = vec2((lon + 1.2) * 3.2, (lat - 0.24) * 9.5);
    float storm = exp(-dot(sv, sv));
    float sw = atan(sv.y, sv.x) + length(sv) * (1.4 + 1.8 * gMid) + 1.6 * fbm(sv * 1.3 + uTime * 0.05) - uTime * 0.3;
    cloud = mix(cloud, vec3(0.86, 0.42, 0.24) * (0.85 + 0.18 * sin(sw * 2.0)) * (0.75 + 0.7 * gMid), storm * 0.82);
    float day = ss(-0.08, 0.35, dot(n, S));
    float tt = -dot(n, N) / dot(S, N);
    float rs = tt > 0.0 ? ringDensity(length(n + S * tt), 1.0) : 0.0;
    vec3 surf = cloud * day * (1.0 - 0.75 * rs) + vec3(0.012, 0.02, 0.028);
    float limb = pow(1.0 - n.z, 3.0);
    surf += vec3(0.45, 0.75, 0.85) * limb * (0.22 + 0.8 * gBass) * ss(-0.3, 0.4, dot(n, S));
    surf *= 0.6 + 0.4 * ss(0.0, 0.35, n.z);
    surf = mix(surf, col, ss(-0.55, -1.05, uv.y) * 0.6);                    // sinking into the haze low down
    col = mix(col, surf, ss(PR + gPx, PR - gPx, dist));
  }
  if (zr >= 0.0) col = mix(col, ringCol, ringA * (1.0 - ss(-0.6, -1.05, uv.y) * 0.5));   // the near half, in front of it
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'gezegen', name: 'Halkalı Gezegen', group: 'Vibe',
  blurb: 'The sky of another world: a vast ringed planet rises from the haze, the mids stir its storm, and every beat sends a wave of light out through its rings',
  tags: ['sky', 'planet', 'rings', 'space', 'moons', 'calm'],
  energy: 0.35, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
