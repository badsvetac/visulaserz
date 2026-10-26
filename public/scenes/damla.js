import { SCULPT } from '../js/gfx/scene-kit.js';

// DAMLA — a drop of water hitting a still black pool, shot the way the macro photographers do it:
// the camera down at the waterline, coloured lights behind. On every beat a drop lands: a crown of
// water leaps up round it and throws droplets off its points, a jet climbs out of the middle, and
// rings run out across the surface. Each splash plays out inside one beat and is gone, so the
// pool is always ready for the next.
//
// The pool is a height field (the rings and the slower swell the bass keeps up) marched with the
// crown, the jet and the droplets as solid shapes; all of it is water, so what you see in it is the
// lights behind, bent through it and mirrored off it.
//
// Music: the beat is the drop; the bass keeps the surface heaving; the mids brighten and shift
// the lights behind; the highs flash off the droplets.
const frag = `${SCULPT}
const float LIFE = 0.46;               // how long a splash lasts (seconds): inside one beat

vec2 gImpact;
float gAge, gStrength;

// the pool's surface: the rings of the last drop, a slow swell, the fine stir the bass keeps up
float pool(vec2 xz) {
  float rho = length(xz - gImpact);
  float front = gAge * 1.6;
  float rings = sin((rho - front) * 34.0) * exp(-pow((rho - front * 0.75) * 3.2, 2.0)) * exp(-gAge * 3.5) * 0.035 * gStrength;
  rings *= ss(0.0, 0.05, rho);
  float swell = (noise(xz * 1.3 + uTime * 0.12) - 0.5) * (0.012 + 0.03 * gBass) + sin(xz.x * 3.0 + uTime * 0.9) * 0.004;
  return rings + swell;
}
// the crown, the jet and the drops it throws: water shapes standing out of the pool
float splash(vec3 p, out float isDrop) {
  isDrop = 0.0;
  float t = gAge;
  if (t > LIFE) return 10.0;
  vec3 q = p - vec3(gImpact.x, 0.0, gImpact.y);
  float rho = length(q.xz), th = atan(q.z, q.x);
  float s = gStrength;
  // the crown: a thin wall of water leaping up and spreading, its rim breaking into points
  float rise = sin(min(t / 0.3, 1.0) * PI);                        // up, then back down
  float R = 0.05 + t * 0.55;
  float points = 16.0;
  float spike = pow(abs(cos(th * points * 0.5)), 6.0);
  float H = (0.07 + 0.06 * spike) * rise * s;
  float wall = max(abs(rho - R) - (0.006 + 0.004 * (1.0 - q.y / max(H, 0.001))), q.y - H);
  wall = max(wall, -q.y - 0.01);
  float d = wall * 0.7;
  // the droplets flung from the crown's points, flying out and falling
  float k = floor(th / TAU * points + 0.5);
  float a = k / points * TAU;
  float tf = max(t - 0.06, 0.0);
  vec3 dp = vec3(cos(a) * (R + tf * 0.35), 0.07 * s + tf * 0.55 - 4.9 * tf * tf * 0.45, sin(a) * (R + tf * 0.35));
  float drop = length(q - dp) - (0.008 + 0.004 * hash11(k + floor(uBeatCount)));
  if (t > 0.06 && t < LIFE) { if (drop < d) { d = drop; isDrop = 1.0; } }
  // the jet climbing out of the middle after the crown, with a drop pinching off its top
  float jt = clamp((t - 0.14) / 0.25, 0.0, 1.0);
  float J = sin(jt * PI) * 0.16 * s;
  float jet = length(vec2(rho, max(q.y - J * 0.8, 0.0) - max(-q.y, 0.0))) - 0.016 * (1.0 - 0.5 * jt) - 0.01 * ss(J * 0.8, 0.0, q.y) * jt;
  jet = max(jet, q.y - J * 0.82);
  float tipDrop = length(q - vec3(0.0, J * 0.95 + 0.01, 0.0)) - 0.02 * ss(0.3, 0.6, jt) * (1.0 - ss(0.85, 1.0, jt));
  if (jt > 0.0) d = min(d, min(jet, tipDrop));
  return d;
}
float world(vec3 p, out float id) {
  float drop;
  float s = splash(p, drop);
  float w = (p.y - pool(p.xz)) * 0.6;
  id = s < w ? (drop > 0.5 ? 2.0 : 1.0) : 0.0;
  return min(s, w);
}
vec3 normalAt(vec3 p) {
  float id;
  vec2 e = vec2(0.0007, -0.0007);
  return normalize(e.xyy * world(p + e.xyy, id) + e.yyx * world(p + e.yyx, id) + e.yxy * world(p + e.yxy, id) + e.xxx * world(p + e.xxx, id));
}
// the studio behind: a dark backdrop with a band of colour across it and lights out of focus
vec3 studio(vec3 r) {
  float y = r.y, x = atan(r.x, -r.z);
  vec3 c = vec3(0.004, 0.005, 0.012);
  vec3 a = pal(0.15 + gMid * 0.08), b = pal(0.55 + gMid * 0.08);
  c += mix(a, b, ss(-0.6, 0.6, x)) * exp(-pow((y - 0.12) * 4.0, 2.0)) * (0.35 + 0.35 * gMid);
  for (int i = 0; i < 9; i++) {
    float f = float(i);
    vec2 at = vec2(-0.85 + f * 0.21 + 0.05 * sin(f * 4.3), 0.06 + 0.13 * sin(f * 2.1));
    float r = 0.035 + 0.045 * hash11(f * 3.7);
    float d = length(vec2(x, y) - at) / r;
    float disc = exp(-pow(d, 6.0)) * (0.8 + 0.2 * ss(0.5, 1.0, d));         // soft, a little brighter at its rim
    float twinkle = 1.0 + gHigh * 0.9 * (0.5 + 0.5 * sin(uTime * (7.0 + f * 1.3) + f * 2.0));
    c += pal(f * 0.13 + 0.1) * disc * (0.4 + 0.3 * hash11(f)) * (0.8 + 0.6 * gMid) * twinkle;
  }
  return c;
}

void main() {
  musicSignals();
  vec2 uv = centered();
  gAge = uAudioActive > 0.5 ? uBeatAge : 10.0;
  gStrength = clamp(0.6 + uBeat * 0.6, 0.0, 1.2) * uPunch;
  float n = uBeatCount;
  gImpact = vec2((hash11(n * 1.7) - 0.5) * 0.08, (hash11(n * 3.1) - 0.5) * 0.06);

  // down at the waterline, a long lens
  vec3 ro = vec3(0.0, 0.045, 0.62);
  vec3 rd = viewRay(ro, vec3(0.0, 0.055, 0.0), uv, 2.4);

  float t = 0.0, id = 0.0;
  bool found = false;
  for (int i = 0; i < 110; i++) {
    vec3 p = ro + rd * t;
    float d = world(p, id);
    if (d < 0.0004) { found = true; break; }
    t += max(d * 0.8, 0.0008);
    if (t > 12.0) break;
  }
  vec3 col = studio(rd);
  if (found) {
    vec3 p = ro + rd * t, nn = normalAt(p);
    float cosi = max(dot(-rd, nn), 0.0);
    float fres = 0.02 + 0.98 * pow(1.0 - cosi, 5.0);
    vec3 refl = studio(reflect(rd, nn));
    vec3 refr;
    if (id < 0.5) refr = vec3(0.004, 0.006, 0.01);                     // the pool is deep and black
    else if (id < 1.5) {
      // the crown and the jet are thin sheets of water: light comes out nearly the way it went in,
      // shifted a little, so the lights behind show through them, wavering
      vec3 bent = refract(rd, nn, 1.0 / 1.33);
      refr = studio(normalize(rd + (bent - rd) * 0.35)) * vec3(0.85, 0.92, 1.0);
    } else {
      refr = studio(refract(rd, nn, 1.0 / 1.33)) * vec3(0.8, 0.9, 1.0);   // a drop is a lens: the lights upside down in it
    }
    col = mix(refr, refl, fres);
    // water lit from behind glows along its edges, and the highs flash off the droplets
    col += studio(rd) * pow(1.0 - cosi, 2.0) * (id > 0.5 ? 1.2 : 0.2);
    col += vec3(1.0) * pow(1.0 - cosi, 4.0) * 0.08 * (id > 0.5 ? 1.0 : 0.3);
    if (id > 1.5) col += vec3(1.0, 0.97, 0.9) * gHigh * pow(max(dot(reflect(rd, nn), normalize(vec3(0.3, 0.4, -1.0))), 0.0), 20.0) * 1.5;
    // the highs glitter on the ripples, where the surface turns just right for a moment
    if (id < 0.5) col += vec3(1.0, 0.96, 0.9) * gHigh * pow(max(dot(reflect(rd, nn), normalize(vec3(0.1, 0.25, -1.0))), 0.0), 400.0) * 3.0 * step(0.6, noise(p.xz * 60.0 + uTime));
    col *= ss(11.0, 2.0, t);
  }
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'damla', name: 'Damla', group: 'Lab',
  blurb: 'Macro water: on every beat a drop hits a black pool and a crown of water leaps up, flinging droplets, while coloured lights glint through it',
  tags: ['3d', 'water', 'macro', 'drop', 'splash', 'beat', 'colourful'],
  energy: 0.55, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
