import { SCULPT } from '../js/gfx/scene-kit.js';

// HAMAM — lying back on the warm göbektaşı of an old Ottoman bath and looking up into the dome:
// rings of glass lenses (the fil gözü, "elephant eyes") set deep in the plaster, the sun coming
// through them as straight shafts in the steam, each landing on the drum's arches as a star.
//
// The light is real: every point of the steam asks whether the sun reaches it through one of the
// lenses (one ray to the dome and a look-up in the lens pattern), so the shafts, their crossing in
// the middle and the stars they print on the wall all come from the same few lines.
//
// Music: each lens is its own slice of the spectrum, the outer ring the bass and the inner rings
// the melody and the highs, so the dome reads like a round spectrum and the shafts brighten with
// their lenses; the bass stirs and thickens the steam, the highs glint in the droplets inside the
// beams, and every beat sends a ripple of light from the crown star out to the rim.
const frag = `${SCULPT}
const vec3 C = vec3(0.0, 6.0, 0.0);     // the dome's centre: it springs from the drum 6 m up
const float R = 6.0;
const vec3 SUN = vec3(1.0, 0.83, 0.6);
const float RING_TH[4] = float[4](0.36, 0.66, 0.96, 1.25);   // polar angle of each ring from the crown
const float RING_N[4] = float[4](8.0, 12.0, 16.0, 22.0);     // lenses in each ring
const float RING_R[4] = float[4](0.070, 0.064, 0.058, 0.050); // a lens's angular size
const float RING_X[4] = float[4](0.56, 0.32, 0.14, 0.03);    // where on the spectrum the ring starts
const float RING_W[4] = float[4](0.32, 0.22, 0.16, 0.10);    // and how much of it it covers

vec3 gL;
float gSteamT;

float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash31(i), b = hash31(i + vec3(1, 0, 0)), c = hash31(i + vec3(0, 1, 0)), d = hash31(i + vec3(1, 1, 0));
  float e = hash31(i + vec3(0, 0, 1)), g = hash31(i + vec3(1, 0, 1)), h = hash31(i + vec3(0, 1, 1)), k = hash31(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
float hexagram(vec2 p, float r) {
  const vec4 k = vec4(-0.5, 0.8660254038, 0.5773502692, 1.7320508076);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= 2.0 * min(dot(k.yx, p), 0.0) * k.yx;
  p -= vec2(clamp(p.x, r * k.z, r * k.w), r);
  return length(p) * sign(p.y);
}
float hexagon(vec2 p, float r) {
  const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}
float box2(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float star8(vec2 p, float r) { return min(box2(p, vec2(r)), box2(rot(PI * 0.25) * p, vec2(r))); }
float wrapAngle(float a) { return a - TAU * floor(a / TAU + 0.5); }
// each ring has its own opening: eight-pointed stars, six-pointed stars, round eyes, hexagons
float opening(vec2 p, float r, int k) {
  if (k == 0) return star8(p, r * 0.74);
  if (k == 1) return hexagram(p, r * 0.6);
  if (k == 2) return length(p) - r * 0.82;
  return hexagon(p, r * 0.8);
}

// The lens nearest a direction from the dome's centre: x = signed distance to its edge (radians),
// y = which ring (0 the crown star, 1..4 outwards), z = the lens's place in its ring, w = its
// spectrum position.
vec4 lens(vec3 d) {
  float th = acos(clamp(d.y, -1.0, 1.0)), ph = atan(d.z, d.x);
  vec4 best = vec4(star8(rot(0.12) * d.xz, 0.112), 0.0, 0.0, 0.82);
  // only the two rings either side of this polar angle can hold the nearest lens
  int k0 = th < 0.51 ? 0 : th < 0.81 ? 1 : th < 1.1 ? 2 : 3;
  int lo = max(k0 - 1, 0), hi = min(k0 + 1, 3);
  for (int k = lo; k <= hi; k++) {
    float n = RING_N[k], off = mod(float(k), 2.0) * 0.5;
    float c = floor(ph / TAU * n - off + 0.5);
    float phc = (c + off) * TAU / n;
    vec2 lp = vec2(wrapAngle(ph - phc) * sin(th), th - RING_TH[k]);
    float s = opening(rot(phc) * lp, RING_R[k], k);
    if (s < best.x) best = vec4(s, float(k + 1), mod(c, n), RING_X[k] + RING_W[k] * mod(c, n) / n);
  }
  return best;
}
// How bright a lens burns: a steady glow with nothing playing, its slice of the music on top,
// and the beat's ripple running out from the crown.
float burn(vec4 l, float th) {
  float b = 0.66 + 1.4 * band(l.w);
  b += 1.3 * gHit * exp(-pow((th - uBeatAge * 3.4) * 5.0, 2.0)) * exp(-uBeatAge * 2.5);
  return b;
}
// old glass: nearly white, a little amber or sea-green in places, the palette just showing
vec3 glass(vec4 l) {
  float h = hash11(l.y * 31.0 + l.z * 7.0);
  vec3 old = mix(vec3(1.0, 0.93, 0.78), vec3(0.86, 1.0, 0.9), step(0.62, h));
  return mix(old, pal(l.y * 0.21 + l.z * 0.013) * 1.15, 0.16);
}
// The sun at a point of the room: through a lens, or not at all.
vec3 sunAt(vec3 p, float edge) {
  vec3 o = p - C;
  float b = dot(o, gL), c = dot(o, o) - R * R;
  float s = -b + sqrt(max(b * b - c, 0.0));
  vec3 q = (o + gL * s) / R;
  if (q.y < 0.02) return vec3(0.0);
  vec4 l = lens(q);
  if (l.x > edge) return vec3(0.0);
  float th = acos(clamp(q.y, -1.0, 1.0));
  return SUN * glass(l) * burn(l, th) * ss(edge, -edge, l.x);
}
float steam(vec3 p) {
  vec3 q = p * vec3(0.30, 0.22, 0.30) + vec3(0.0, -gSteamT, 0.0);
  q.xz += vec2(sin(q.y * 1.7 + uTime * 0.11), cos(q.y * 1.3 - uTime * 0.09)) * (0.35 + gBass * 0.25);
  float n = noise3(q) * 0.6 + noise3(q * 2.3 + vec3(5.2, 1.3, 7.7)) * 0.4;
  float clouds = ss(0.42, 0.78, n);
  float body = ss(11.0, 1.0, p.y) * 0.7 + 0.3;          // the steam hangs heavier below
  return (0.006 + clouds * (0.15 + gBass * 0.18)) * body;
}

// lime plaster gone cream with age, damp marks spreading down from the lenses
vec3 plaster(vec3 p) {
  float stain = fbm(p.xz * 0.38 + p.y * 0.27);
  vec3 c = mix(vec3(0.66, 0.58, 0.47), vec3(0.50, 0.47, 0.39), ss(0.40, 0.74, stain));
  c *= 0.9 + 0.1 * noise(p.xz * 3.0 + p.y * 2.0);
  return c * (1.0 - 0.25 * ss(0.55, 0.85, fbm(p.xz * 1.6 - p.y * 0.8)));
}
// eight pointed Ottoman arches round the drum: 0 on the wall, 1 inside a niche
float niche(vec3 p) {
  float a = atan(p.z, p.x) / TAU * 8.0;
  float x = (fract(a) - 0.5) * 2.0;                    // -1..1 across one bay
  float spring = 3.3, w = 0.62;
  float side = ss(w + 0.02, w - 0.02, abs(x)) * ss(0.35, 0.45, p.y);
  float y = p.y - spring;
  // the pointed arch: two circles meeting at the top
  float arch = length(vec2(abs(x) + w * 0.6, max(y, 0.0) / 1.35)) - w * 1.6;
  return side * ss(0.03, -0.03, y < 0.0 ? -1.0 : arch);
}

void main() {
  musicSignals();
  gL = normalize(vec3(0.38, 0.88, -0.12));
  gSteamT = uTime * 0.045 + uTravel * 0.02 * uAudioActive;
  vec2 uv = centered();
  // from low down near the wall, looking up across the room to the far side of the dome
  vec3 ro = vec3(2.3, 1.2, 3.4) + vec3(sin(uTime * 0.05), 0.0, cos(uTime * 0.04)) * 0.12;
  vec3 rd = viewRay(ro, vec3(-1.9, 8.8, -3.0), uv, 1.02);

  // where the eye meets the room: the dome above the springing line, the drum wall below it
  vec3 o = ro - C;
  float b = dot(o, rd), c = dot(o, o) - R * R;
  float tS = -b + sqrt(max(b * b - c, 0.0));
  vec3 hit = ro + rd * tS;
  // the lens pattern where the ray meets the sphere, worked out for every pixel so that its
  // screen-space derivative (the edge's antialiasing) is taken in uniform control flow
  vec3 dS = (hit - C) / R;
  vec4 lS = lens(dS);
  float aaS = max(fwidth(lS.x), 1e-4);
  bool dome = hit.y >= C.y;
  float tHit = tS;
  if (!dome) {
    float a2 = dot(rd.xz, rd.xz), b2 = dot(ro.xz, rd.xz), c2 = dot(ro.xz, ro.xz) - R * R;
    tHit = (-b2 + sqrt(max(b2 * b2 - a2 * c2, 0.0))) / max(a2, 1e-4);
    hit = ro + rd * tHit;
  }

  vec3 col;
  float glowAll = 0.55 + 0.6 * gBass + 0.35 * gMid;
  if (dome) {
    vec4 l = lS;
    float th = acos(clamp(dS.y, -1.0, 1.0));
    float glow = burn(l, th);
    // the plaster: lit from below by the bright steam, brightest where the crossing beams are
    // (the far, sunny side of the crown), falling off to shadow at the springing
    float sunSide = 0.5 + 0.5 * dot(normalize(dS.xz + 1e-4), normalize(-gL.xz));
    float crown = ss(1.55, 0.25, th);
    float shade = 0.07 + 0.2 * crown * crown + 0.09 * sunSide * crown;
    vec3 wall = plaster(hit) * vec3(1.0, 0.86, 0.68) * shade * glowAll;
    // light spilling round each opening, the way a lit hole warms the plaster about it
    float halo = exp(-max(l.x, 0.0) * 18.0);
    wall += plaster(hit) * vec3(1.0, 0.8, 0.55) * halo * 0.3 * glow * glass(l);
    // the opening is a short tunnel through thick plaster: a dark lip, then the glass
    float inner = clamp(0.5 - (l.x + 0.011) / aaS, 0.0, 1.0);
    float outer = clamp(0.5 - l.x / aaS, 0.0, 1.0);
    vec3 lensCol = SUN * glass(l) * glow * (1.5 + 2.4 * ss(-0.012, -0.045, l.x));
    vec3 lip = plaster(hit) * 0.05 + vec3(1.0, 0.75, 0.5) * 0.12 * glow;
    col = mix(wall, lip, outer);
    col = mix(col, lensCol, inner);
    // the highs make the brightest glass twinkle: a little cross of light on its centre
    vec2 tw = vec2(wrapAngle(atan(dS.z, dS.x)) * sin(th), th);
    float twinkle = gHigh * ss(0.25, 0.9, hash11(l.y * 13.0 + l.z + floor(uTime * 7.0)));
    col += SUN * twinkle * inner * 1.4;
    // the dome springs from a moulded cornice: a lit lip over a band of shadow
    col *= 1.0 - ss(0.1, 0.0, dS.y) * 0.4;
  } else {
    vec3 wall = plaster(hit);
    float bay = niche(hit);
    float course = ss(0.04, 0.0, abs(fract(hit.y * 1.7) - 0.5) - 0.47) * 0.22 * (1.0 - bay);
    wall *= (1.0 - course) * (1.0 - 0.5 * bay);
    vec3 n = normalize(vec3(-hit.x, 0.0, -hit.z));
    // where a shaft lands: real sunlight on the plaster, far brighter than the room around it,
    // its edge a little soft (the sun is not a point)
    vec3 sun = sunAt(hit + n * (0.02 + bay * 0.25), 0.018);
    float up = ss(0.0, 6.0, hit.y);
    col = wall * (0.12 + 0.12 * up) * glowAll + wall * sun * vec3(1.15, 0.95, 0.7) * 1.25;
    // the cornice: a dark undercut, a bright rounded lip, a fillet above
    float y = hit.y;
    col *= 1.0 - 0.65 * ss(5.45, 5.6, y) * ss(5.8, 5.65, y);
    col += plaster(hit) * vec3(1.0, 0.85, 0.65) * (0.35 * ss(0.09, 0.0, abs(y - 5.75)) + 0.18 * ss(0.05, 0.0, abs(y - 5.95))) * glowAll;
  }

  // the steam along the eye's ray, sampled at a few depths (it changes slowly)
  float t1 = min(tHit, 15.0);
  float dens[6];
  float T = 1.0, steamSum = 0.0;
  for (int i = 0; i < 6; i++) {
    float t = t1 * (float(i) + 0.5) / 6.0;
    dens[i] = steam(ro + rd * t);
    steamSum += dens[i];
  }
  T = exp(-steamSum * t1 / 6.0 * 0.8);

  // The shafts, one per lens, integrated in closed form: each is a soft cylinder of light along
  // the sun's direction from its lens, and the light the eye collects crossing it is a Gaussian
  // integral over the ray. No marching, so no grain, and every beam keeps its own brightness.
  float cosA = dot(rd, gL);
  float phase = 0.7 + 3.0 * pow(max(cosA, 0.0), 6.0) + 0.4 * cosA * cosA;
  vec3 rdp = rd - cosA * gL;                       // the eye's ray across the sun's direction
  float a = max(dot(rdp, rdp), 1e-5);
  vec3 beams = vec3(0.0);
  for (int k = -1; k < 4; k++) {
    float n = k < 0 ? 1.0 : RING_N[k];
    float thk = k < 0 ? 0.0 : RING_TH[k], rk = k < 0 ? 0.105 : RING_R[k] * 0.62;
    float off = k < 0 ? 0.0 : mod(float(k), 2.0) * 0.5;
    for (int j = 0; j < 22; j++) {
      if (float(j) >= n) break;
      float ph = (float(j) + off) * TAU / n;
      vec3 d = vec3(sin(thk) * cos(ph), cos(thk), sin(thk) * sin(ph));
      float facing = dot(d, gL);
      if (facing < 0.05) continue;
      vec3 u = ro - (C + R * d);
      vec3 up = u - dot(u, gL) * gL;               // the eye from the beam's axis, across it
      float b = dot(up, rdp), c = dot(up, up);
      float tc = -b / a;                            // where the ray passes the axis closest
      if (tc < 0.0 || tc > t1) continue;
      if (dot(u + rd * tc, gL) > -0.2) continue;     // that point must be under the lens, inside
      float rho = R * rk * (0.45 + 0.55 * facing);
      float miss = max(c - b * b / a, 0.0);
      float through = rho * sqrt(PI / a) * exp(-miss / (rho * rho));
      float slot = clamp(tc / t1 * 6.0 - 0.5, 0.0, 4.999);
      int si = int(slot);
      float steamHere = mix(dens[si], dens[si + 1], fract(slot));
      vec4 l = vec4(0.0, float(k + 1), float(j), k < 0 ? 0.82 : RING_X[k] + RING_W[k] * float(j) / n);
      beams += glass(l) * burn(l, thk) * through * steamHere;
    }
  }
  vec3 acc = SUN * beams * phase * 1.9;
  // the warm glow the steam carries everywhere, a little more when the music fills the room
  acc += (1.0 - T) * vec3(0.30, 0.24, 0.18) * (0.22 + 0.08 * gMid) * glowAll;
  col = col * T + acc;
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'hamam', name: 'Hamam', group: 'Vibe',
  blurb: 'Looking up into an Ottoman bath dome: star-shaped glass lenses burn with the spectrum, and sunbeams cut through the steam to print stars on the arches',
  tags: ['3d', 'turkish', 'light', 'steam', 'dome', 'calm', 'warm'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
