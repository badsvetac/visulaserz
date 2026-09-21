// SINGULARITY — a black hole and its accretion disc.
//
// Light really bends here: every pixel's photon is integrated along a Schwarzschild null geodesic
// (acceleration = -1.5 h² r̂ / r⁴, with h the photon's angular momentum), so the far side of the
// disc is lifted over the top of the shadow and the starfield smears into an Einstein ring by
// itself. Each radius of the disc listens to its own band (bass at the hot inner edge), the side
// swinging toward the camera is Doppler-brightened, and every beat sends a ring of light outward.
const frag = `
const float RIN = 3.0;      // innermost stable orbit, in Schwarzschild radii
const float ROUT = 9.5;

vec3 starLayer(vec3 d, float scale, float density) {
  vec3 a = abs(d);
  vec2 uv; float face;
  if (a.x > a.y && a.x > a.z) { uv = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y > a.z)         { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else                        { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
  vec2 g = uv * scale;
  vec2 c = floor(g) + face * 37.0;
  float h = hash21(c);
  vec2 f = fract(g) - 0.5 - (vec2(hash21(c + 1.7), hash21(c + 5.1)) - 0.5) * 0.7;
  float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 4.0) + h * 60.0);
  return mix(vec3(1.0), pal(h * 3.0), 0.45) * step(1.0 - density, h) * (0.003 / (dot(f, f) + 0.003)) * tw;
}

vec3 stars(vec3 d) {
  vec3 col = starLayer(d, 14.0, 0.30) * 0.9 + starLayer(d, 31.0, 0.22) * 0.45;
  col *= 0.5 + uHigh * 1.3;
  float neb = fbm(d.xy * 1.7 + d.z * 1.1 + 3.0) * fbm(d.zy * 1.3 - d.x + 8.0);
  col += pal(0.62 + neb * 0.8) * neb * neb * 0.55;
  return col;
}

vec4 disc(vec3 hp, vec3 vel) {
  float r = length(hp.xz);
  float u = (r - RIN) / (ROUT - RIN);
  if (u < 0.0 || u > 1.0) return vec4(0.0);
  // Keplerian shear would wind any texture into mush, so two copies restart half a cycle apart and crossfade
  float om = 5.0 / (r * sqrt(r));
  float T = uTravel * 0.05;
  float t1 = fract(T), t2 = fract(T + 0.5);
  float n = fbm(rot(om * (t1 - 0.5) * 6.0) * hp.xz * 0.9 + 11.0) * (1.0 - abs(2.0 * t1 - 1.0))
          + fbm(rot(om * (t2 - 0.5) * 6.0) * hp.xz * 0.9 + 47.0) * (1.0 - abs(2.0 * t2 - 1.0));
  float lanes = 0.55 + 0.45 * sin(r * 7.0 + 3.0 * noise(vec2(r * 2.0, 1.0)));
  float band = spec(0.02 + u * 0.8);
  float falloff = pow(1.0 - u, 1.6) * ss(0.0, 0.06, u);
  vec3 tang = normalize(vec3(-hp.z, 0.0, hp.x));
  float beam = pow(1.0 + 0.55 * dot(tang, -normalize(vel)), 3.0);
  vec3 c = mix(vec3(1.0, 0.95, 0.85), pal(0.04 + u * 0.32), ss(0.0, 0.45, u));
  c *= (0.22 + 2.4 * band + 0.7 * uBass) * (0.35 + 0.9 * n) * lanes * falloff * beam;
  c += pal(0.15) * exp(-abs(r - (RIN + uBeatAge * 9.0)) * 1.4) * exp(-uBeatAge * 2.2) * uPunch * 1.4 * ss(0.0, 0.1, u) * (1.0 - u);
  return vec4(c, clamp(falloff * (0.5 + 0.5 * n) * 1.7, 0.0, 0.92));
}

void main() {
  vec2 p = rot(-0.16) * centered();
  p *= 1.0 - uBeat * 0.03 * uPunch;
  float orbit = uTime * 0.03 + uBalance * 0.15;
  vec3 ro = vec3(sin(orbit) * 17.0, 1.7 + 0.9 * sin(uTime * 0.07), -cos(orbit) * 17.0);
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, rt);
  vec3 vel = normalize(fw * 1.9 + rt * p.x + up * p.y);
  vec3 pos = ro;
  vec3 am = cross(pos, vel);
  float h2 = dot(am, am);

  vec3 col = vec3(0.0);
  float trans = 1.0, glow = 0.0;
  bool captured = false;
  for (int i = 0; i < 120; i++) {
    float r2 = dot(pos, pos);
    float r = sqrt(r2);
    if (r < 1.0) { captured = true; break; }
    if (r > 30.0 && dot(pos, vel) > 0.0) break;
    float dt = clamp(0.13 * r, 0.04, 1.5);
    vec3 prev = pos;
    vel += -1.5 * h2 * pos / (r2 * r2 * r) * dt;
    pos += vel * dt;
    glow += dt / (r2 * r2);
    if (prev.y * pos.y < 0.0) {
      vec4 d = disc(mix(prev, pos, prev.y / (prev.y - pos.y)), vel);
      col += trans * d.rgb * d.a;
      trans *= 1.0 - d.a;
      if (trans < 0.02) break;
    }
  }
  if (!captured) col += trans * stars(normalize(vel));
  col += pal(0.1) * glow * 0.9 * (0.3 + uBass);           // light scattered close to the hole
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'singularity',
  name: 'Singularity',
  group: 'Journey',
  blurb: 'Black hole bending starlight; disc radii glow per band, beats ring outward',
  tags: ['space', 'science', '3d'],
  energy: 0.6,
  particles: 0,
  trails: 0.35,
  zoom: 1,
  spin: 0,
  frag,
};
