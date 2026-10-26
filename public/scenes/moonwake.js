// MOONWAKE — a low, drifting camera above a moonlit, bioluminescent ocean.
// The water is intersected as a height field. Analytic slopes and filtered capillary
// waves keep reflections attached to the surface, including at grazing angles.
const frag = `
float bass, middle, treble, onset;
const vec3 SILVER = vec3(0.78, 0.86, 1.0);
const vec3 PLANKTON = vec3(0.012, 0.52, 0.68);

vec3 moonDirection() {
  float portrait = ss(1.2, 0.7, uRes.x / uRes.y);
  return normalize(vec3(mix(0.16, 0.075, portrait), 0.285, 1.0));
}

// Height, two exact partial derivatives, and the broad crest envelope.
// The second harmonic sharpens the tops without making the troughs into spikes.
vec4 ocean(vec2 p, float footprint) {
  float amplitude = 0.29 * (1.0 + bass * 0.42);
  float frequency = 0.63;
  vec2 direction = normalize(vec2(0.42, 1.0));
  vec4 field = vec4(0.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float phase = dot(p, direction) * frequency - uTime * sqrt(frequency * 7.4) + fi * 2.37;
    float s = sin(phase), c = cos(phase);
    float second = -cos(phase * 2.0), derivative = 2.0 * sin(phase * 2.0);
    float attenuation = exp(-pow(footprint * frequency * 0.62, 2.0));
    float a = amplitude * attenuation;
    field.x += a * (s + 0.24 * second);
    field.yz += direction * frequency * a * (c + 0.24 * derivative);
    field.w += a * pow(max(s, 0.0), 6.0);
    direction = rot(1.17 + fi * 0.12) * direction;
    frequency *= 1.79;
    amplitude *= 0.48;
  }
  return field;
}

vec2 ripples(vec2 p, float footprint) {
  vec2 slope = vec2(0.0), dir = normalize(vec2(-0.7, 0.8));
  float k = 16.0, strength = 0.018 + middle * 0.020;
  // Pixel-footprint filtering suppresses moire and distant temporal shimmer.
  for (int i = 0; i < 5; i++) {
    float phase = dot(p, dir) * k - uTime * sqrt(k * 2.2) + float(i) * 4.2;
    float drift = sin(dot(p, vec2(-dir.y, dir.x)) * k * 0.14 + uTime * 0.3);
    slope += dir * cos(phase + drift * 0.8) * strength * exp(-pow(k * footprint * 0.6, 2.0));
    dir = rot(1.63) * dir; k *= 1.61; strength *= 0.70;
  }
  return slope;
}

float clouds(vec3 ray) {
  vec2 p = ray.xz / max(ray.y + 0.16, 0.03);
  p = p * vec2(0.55, 0.80) + vec2(uTime * 0.007, -2.6);
  float warp = fbm(p * 0.7 + vec2(7.2, 0.0));
  float shape = fbm(p + vec2(warp * 1.4, warp * 0.4));
  return ss(0.46, 0.74, shape) * ss(0.01, 0.075, ray.y) * ss(0.85, 0.25, ray.y);
}

vec3 atmosphere(vec3 ray) {
  float elevation = max(ray.y, 0.0);
  vec3 col = mix(vec3(0.031, 0.052, 0.087), vec3(0.003, 0.008, 0.025), ss(0.0, 0.55, elevation));
  float angle = acos(clamp(dot(ray, moonDirection()), -1.0, 1.0));
  col += vec3(0.10, 0.17, 0.27) * exp(-angle * 4.0) * 0.23;
  col += SILVER * (0.0006 / (angle * angle + 0.0006)) * 0.09;
  return col;
}

vec3 sky(vec3 ray) {
  vec3 col = atmosphere(ray), moon = moonDirection();
  vec3 right = normalize(cross(vec3(0, 1, 0), moon)), up = cross(moon, right);
  vec2 disc = vec2(dot(ray, right), dot(ray, up)) / 0.035;
  float radius = length(disc);
  float cloud = clouds(ray);
  if (radius < 1.06) {
    float edge = max(fwidth(radius), 0.012);
    vec3 normal = vec3(disc, sqrt(max(0.0, 1.0 - radius * radius)));
    float mares = fbm(disc * 3.3 + vec2(12.1, 5.2));
    float dust = noise(disc * 51.0);
    float relief = 0.79 + mares * 0.26 + dust * 0.035;
    relief -= ss(0.40, 0.61, mares) * 0.23;
    float phase = 0.72 + 0.28 * max(dot(normal, normalize(vec3(-0.25, 0.1, 1))), 0.0);
    col = mix(col, vec3(0.78, 0.86, 0.91) * relief * phase * 1.45,
      (1.0 - ss(1.0 - edge, 1.0 + edge, radius)) * (1.0 - cloud * 0.68));
  }
  vec2 dome = ray.xy / max(ray.z, 0.18);
  for (int layer = 0; layer < 2; layer++) {
    float grid = 125.0 + float(layer) * 130.0;
    vec2 cell = floor(dome * grid), q = fract(dome * grid) - 0.5;
    float seed = hash21(cell + float(layer) * 34.1);
    q -= (vec2(hash21(cell + 1.7), hash21(cell + 8.1)) - 0.5) * 0.72;
    float aa = max(fwidth(dome.x), fwidth(dome.y)) * grid;
    float star = 1.0 - ss(0.035, 0.035 + aa, length(q));
    star *= step(layer == 0 ? 0.989 : 0.997, seed) * ss(0.03, 0.26, ray.y);
    float twinkle = 0.55 + 0.15 * sin(uTime * 0.8 + seed * 200.0) + treble * 0.24;
    col += mix(vec3(0.43, 0.61, 0.89), vec3(0.80, 0.76, 0.68), seed) * star * twinkle * (1.0 - cloud);
  }
  // Long, broken cloud banks catch the moon on their edges.
  float forward = pow(max(dot(ray, moon), 0.0), 12.0);
  col = mix(col, atmosphere(ray) * 0.55 + vec3(0.065, 0.086, 0.13) * (0.45 + forward), cloud * 0.68);
  return col;
}

float intersection(vec3 ro, vec3 rd) {
  float lo = max(0.0, (ro.y - 1.03) / -rd.y), hi = (ro.y + 1.03) / -rd.y;
  // Resolving tiny displacement hundreds of metres away adds aliasing, not detail.
  if (lo > 200.0) return ro.y / -rd.y;
  float flo = ro.y + rd.y * lo - ocean((ro + rd * lo).xz, lo / uRes.y).x;
  float fhi = ro.y + rd.y * hi - ocean((ro + rd * hi).xz, hi / uRes.y).x;
  float t = lo;
  for (int i = 0; i < 10; i++) {
    t = mix(lo, hi, clamp(flo / max(flo - fhi, 0.0001), 0.12, 0.88));
    vec3 p = ro + rd * t;
    float h = p.y - ocean(p.xz, t / uRes.y).x;
    if (h > 0.0) { lo = t; flo = h; } else { hi = t; fhi = h; }
  }
  return mix(lo, hi, clamp(flo / max(flo - fhi, 0.0001), 0.0, 1.0));
}

vec3 seaColor(vec3 ro, vec3 ray) {
  float distance = intersection(ro, ray);
  vec3 p = ro + ray * distance;
  float footprint = max(distance / uRes.y, 0.001);
  vec4 surface = ocean(p.xz, footprint);
  vec2 slope = surface.yz + ripples(p.xz, footprint);
  slope *= 1.0 - ss(55.0, 330.0, distance) * 0.82;
  vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
  vec3 reflected = reflect(ray, n);
  reflected.y = max(reflected.y, 0.002);
  reflected = normalize(reflected);
  float nv = max(dot(n, -ray), 0.0);
  float fresnel = 0.025 + 0.975 * pow(1.0 - nv, 5.0);
  vec3 moon = moonDirection();
  float moonFacing = max(dot(reflected, moon), 0.0);
  vec3 waterBody = vec3(0.004, 0.027, 0.042) * (0.80 + 0.80 * max(dot(n, moon), 0.0));
  float transmitted = pow(max(dot(ray, -moon) + 0.27, 0.0), 3.0);
  waterBody += vec3(0.008, 0.08, 0.09) * transmitted * surface.w * 0.8;
  vec3 col = mix(waterBody, atmosphere(reflected) * 1.3, fresnel);
  float cloudShade = 0.86 + 0.14 * noise(p.xz * 0.05 + uTime * 0.008);
  // An area-light highlight: broken silver ribbons follow the individual facets.
  float reflection = pow(moonFacing, 1050.0) * 6.5 + pow(moonFacing, 125.0) * 0.13;
  col += SILVER * reflection * (0.22 + fresnel * 0.78) * cloudShade * (0.80 + treble * 0.40);
  col += vec3(0.028, 0.088, 0.13) * pow(1.0 - nv, 2.0) * max(0.0, surface.x + 0.25);

  // Organic foam filaments sit in the crests, with small plankton colonies inside.
  // Each frequency range has a separate job; none is driven by idle demo audio.
  vec2 drift = p.xz + vec2(sin(p.z * 0.47), cos(p.x * 0.33)) * 0.38;
  float veins = abs(fbm(drift * 1.5 + vec2(uTime * 0.055, -uTime * 0.036)) - 0.52);
  float edge = max(0.004, footprint * 0.085);
  float lace = 1.0 - ss(0.012, 0.042 + edge, veins);
  float colonies = ss(0.36, 0.69, noise(drift * 6.0));
  float crest = ss(0.10, 0.35, surface.w);
  float near = exp(-distance * 0.043) * ss(1.0, 3.0, distance);
  float shimmer = 0.58 + 0.42 * noise(p.xz * 31.0 + uTime * 0.16);
  float bio = crest * lace * (0.34 + 0.66 * colonies) * shimmer * near;
  col += PLANKTON * bio * (0.14 + middle * 0.85 + onset * 1.6 + bass * 0.30);
  float foam = crest * lace * ss(0.6, 0.86, noise(drift * 12.0)) * near;
  col += vec3(0.16, 0.24, 0.29) * foam * 0.10;

  // Sea mist softens the horizon without flattening the near water.
  float mist = 1.0 - exp(-distance * 0.0055);
  col = mix(col, atmosphere(normalize(vec3(ray.x, 0.006, ray.z))), mist);
  return col;
}

void main() {
  bass = uAudioActive * pow(clamp(uBass * 1.3, 0.0, 1.0), 0.85);
  middle = uAudioActive * clamp(uMid * 1.4, 0.0, 1.0);
  treble = uAudioActive * clamp(uHigh * 1.6, 0.0, 1.0);
  onset = uAudioActive * uBeat * uPunch;
  vec2 p = centered();
  p *= rot(sin(uTime * 0.13) * 0.004);
  p.y += sin(uTime * 0.19) * 0.005;
  vec3 ro = vec3(sin(uCruise * 0.045) * 0.24, 1.9 + sin(uTime * 0.45) * 0.028, uCruise * 0.60);
  vec3 ray = normalize(vec3(p.x, p.y - 0.16, 1.65));
  vec3 col = ray.y < -0.001 ? seaColor(ro, ray) : sky(ray);
  // A distant pair of headlands gives scale while leaving the moon path open.
  float x = ray.x / ray.z;
  float island = max(0.0, 0.026 - abs(x + 0.75) * 0.072);
  island += max(0.0, 0.009 - abs(x - 0.85) * 0.028);
  island *= 0.65 + 0.35 * noise(vec2(x * 79.0, 1.5));
  float land = ss(island + 0.0009, island - 0.0009, ray.y) * ss(-0.001, 0.001, ray.y);
  col = mix(col, vec3(0.009, 0.016, 0.026), land);
  // Gentle photographic edge falloff; no screen-wide beat flashes.
  float vignette = 1.0 - 0.12 * pow(length((vUv - 0.5) * vec2(1.0, 0.75)), 2.0);
  outColor = vec4(max(col * vignette, vec3(0.0)), 1.0);
}
`;

export default {
  id: 'moonwake', name: 'Moonwake', group: 'Vibe',
  blurb: 'A silver moon over deep rolling water; bass lifts the swell, melody lights the plankton and treble catches the reflections',
  tags: ['ocean', 'moon', 'water', 'night', 'calm', '3d'],
  energy: 0.3, particles: 0, trails: 0, zoom: 1, spin: 0, frag,
};
