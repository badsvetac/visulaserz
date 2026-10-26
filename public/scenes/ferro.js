// FERRO — a pool of ferrofluid over a magnet that the bass drives.
//
// Ferrofluid is oil full of magnetic nanoparticles: black, glossy, and liquid until a magnet comes
// close, when its surface stands up in spikes. The spikes are not random. Below a critical field the
// surface stays flat; past it, the flat surface becomes unstable (the Rosensweig instability) and
// peaks pack themselves on a hexagonal lattice, tallest where the field is strongest.
//
// Here the bass is the magnet. In a quiet passage the pool is a flat black mirror; as the bass comes
// in, a crown of spikes rises over the magnet and spreads as the field grows, and every kick shoots
// the crown up and lets it sink back. The magnet wanders slowly under the table, so the crown walks
// across the pool; each beat also sends a ring of spikes running outward, and the mids make every
// spike twitch at its own rate. The fluid is a height field marched from the camera and shaded as a
// black mirror: all its light is the studio reflected — a softbox overhead catching the tips, a
// gradient box beyond the pool that the flat fluid and the table mirror, coloured strips at the sides
// for the bass and the treble. Down among tall spikes the low reflections are blocked by the
// neighbours, and the black acrylic table mirrors the whole pool.
const frag = `
const float R = 1.15;                        // the pool's radius
const float S = 0.15;                        // spacing of the spikes, set by the fluid's surface tension
const float DEPTH = 0.075;                   // how deep the pool is
const float YMAX = 1.0;                      // nothing stands taller than this
vec3 gFar, gSide;                            // the camera's forward and right, flattened onto the table

vec2 magnetAt() { return vec2(sin(uTime * 0.21), cos(uTime * 0.16)) * 0.38; }

// offset from the nearest centre of a hexagonal lattice with unit spacing
vec2 hexOffset(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec2 a = mod(p, s) - s * 0.5;
  vec2 b = mod(p - s * 0.5, s) - s * 0.5;
  return dot(a, a) < dot(b, b) ? a : b;
}

// How hard the magnet pulls at a spike's foot: its field, driven by the bass and kicked on each beat,
// plus the ring every beat sends running outward from the magnet.
float pull(vec2 c) {
  vec2 m = c - magnetAt();
  float m2 = dot(m, m);
  float drive = 0.12 + 1.15 * uBass + 0.45 * exp(-uBeatAge * 6.0) * uPunch;
  float ring = exp(-abs(sqrt(m2) - uBeatAge * 1.4) * 8.0) * exp(-uBeatAge * 1.8) * uPunch;
  return exp(-m2 * 2.2) * drive + 0.3 * ring * exp(-m2 * 0.5);
}

// The fluid's height at a point, and how tall the spike of its cell stands.
float surface(vec2 xz, out float spikeH) {
  spikeH = 0.0;
  float r = length(xz);
  if (r > R) return -0.01;
  float edge = max(r - (R - 0.12), 0.0) / 0.12;                // a flat pool with a rounded edge
  float pool = DEPTH * sqrt(max(0.0, 1.0 - edge * edge));
  vec2 g = hexOffset(xz / S);
  vec2 c = xz - g * S;                                          // this spike's foot
  vec2 id = floor((xz / S - g) * vec2(2.0, 1.1547) + 0.5);      // the lattice point, as whole numbers
  // Nothing happens below the critical field. Past it the peaks jump up at once to a finite height
  // (the instability is subcritical), then grow with the field.
  float over = max(pull(c) - 0.16, 0.0);
  float twitch = 1.0 + 0.25 * uMid * sin(uTime * 9.0 + hash21(id) * 6.3);
  float h = (0.42 * over + 0.06 * ss(0.0, 0.03, over)) * twitch;
  spikeH = min(h, YMAX - DEPTH - 0.02) * (1.0 - ss(0.7, 0.92, length(c) / R));
  // a cone flaring at its foot, its tip rounded off the way a liquid peak is
  return pool + spikeH * pow(max(0.0, 1.0 - sqrt(dot(g, g) + 0.0012) / 0.52), 1.7);
}
float surface(vec2 xz) { float h; return surface(xz, h); }

// The studio. Everything the fluid shows is one of these lights reflected.
vec3 studio(vec3 r) {
  // a ray heading down meets the pool or the table, both black mirrors: follow it up out of them
  float mirror = 1.0;
  if (r.y < 0.0) { mirror = 0.04 + 0.96 * pow(1.0 + r.y, 5.0); r.y = -r.y; }
  vec3 col = vec3(0.003, 0.003, 0.005);
  vec3 h = normalize(vec3(r.x, 0.0, r.z) + vec3(1e-5, 0.0, 0.0));
  float ahead = dot(h, gFar), across = dot(h, gSide);
  // the softbox overhead: a hard-edged core and its spill across the ceiling
  if (r.y > 0.02) {
    vec2 u = r.xz / r.y;
    float core = (1.0 - ss(0.35, 0.6, abs(u.x))) * (1.0 - ss(0.2, 0.4, abs(u.y)));
    col += vec3(1.0, 0.98, 0.94) * core * 2.4 + vec3(0.5, 0.52, 0.56) * 0.6 * exp(-dot(u, u) * 0.5);
  }
  // a gradient box standing beyond the pool, brightest at its foot: the flat fluid and the table mirror it
  float far = ss(0.72, 0.9, ahead) * ss(0.08, 0.16, r.y) * (1.0 - ss(0.4, 0.9, r.y));
  col += vec3(0.8, 0.84, 0.9) * far * (1.4 - 1.2 * r.y) * (1.0 + 0.6 * uLevel);
  // a dim one behind the camera, for the near flanks
  float back = ss(0.35, 0.7, -ahead) * ss(-0.05, 0.12, r.y) * (1.0 - ss(0.45, 0.7, r.y));
  col += vec3(0.85, 0.87, 0.9) * back * 0.6;
  // coloured strips at the sides: bass on the right, treble on the left
  float band = ss(-0.15, 0.05, r.y) * (1.0 - ss(0.55, 0.8, r.y));
  col += pal(0.04) * ss(0.5, 0.8, across) * band * (1.8 + 3.5 * uBass + 2.5 * exp(-uBeatAge * 5.0) * uPunch);
  col += pal(0.58) * ss(0.5, 0.8, -across) * band * (1.8 + 3.5 * uHigh);
  return col * mirror;
}

// March a ray through the pool (a cylinder of radius R, up to YMAX); the distance to the fluid, or -1.
float marchFluid(vec3 ro, vec3 rd) {
  vec2 o = ro.xz, d = rd.xz;
  float a = dot(d, d), b = dot(o, d), c = dot(o, o) - R * R;
  float disc = b * b - a * c;
  if (a < 1e-8 || disc <= 0.0) return -1.0;
  float root = sqrt(disc);
  float t0 = (-b - root) / a, t1 = (-b + root) / a;
  if (rd.y < 0.0) {
    t0 = max(t0, (ro.y - YMAX) / -rd.y);
    t1 = min(t1, (ro.y + 0.01) / -rd.y);                        // and never below the table
  } else if (ro.y > YMAX) return -1.0;
  else t1 = min(t1, (YMAX - ro.y) / max(rd.y, 1e-5));
  t0 = max(t0, 0.0);
  if (t1 <= t0) return -1.0;
  // short steps: a spike's flank is steep, and a long stride would jump clean through a thin tip
  float t = t0, tPrev = t0;
  bool hit = false;
  for (int i = 0; i < 180; i++) {
    vec3 q = ro + rd * t;
    float h = q.y - surface(q.xz);
    if (h < 0.0003 * t) { hit = true; break; }                  // close enough, for a pixel this far away
    tPrev = t;
    t += clamp(h * 0.4, 0.0015, 0.02);
    if (t > t1) break;
  }
  if (!hit) return -1.0;
  for (int i = 0; i < 6; i++) {                                 // pin the surface down between the last two steps
    float tm = 0.5 * (tPrev + t);
    vec3 q = ro + rd * tm;
    if (q.y - surface(q.xz) < 0.0) t = tm; else tPrev = tm;
  }
  return t;
}

vec3 shadeFluid(vec3 hp, vec3 rd) {
  float e = 0.002, spikeH;
  surface(hp.xz, spikeH);
  vec3 n = normalize(vec3(surface(hp.xz - vec2(e, 0.0)) - surface(hp.xz + vec2(e, 0.0)), 2.0 * e,
                          surface(hp.xz - vec2(0.0, e)) - surface(hp.xz + vec2(0.0, e))));
  vec3 r = reflect(rd, n);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
  // down among tall spikes, a low reflection runs into the neighbours instead of reaching the studio
  float depth = max(DEPTH + spikeH - hp.y, 0.0);
  float climb = r.y / max(length(r.xz), 1e-3);
  float open = ss(0.3, 1.2, abs(climb) * S * 1.2 / max(depth, 1e-3));
  return studio(r) * fres * mix(0.12, 1.0, open) + vec3(0.004, 0.004, 0.006);
}

void main() {
  vec2 p = centered() * (1.0 - 0.015 * uBeat * uPunch);
  float orbit = uTime * 0.07 + uBalance * 0.15;
  vec3 ro = vec3(sin(orbit) * 2.5, 0.95, -cos(orbit) * 2.5);
  vec3 fw = normalize(vec3(0.0, 0.14, 0.0) - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  float lens = 1.9 * mix(1.0, 1.25, ss(1.1, 1.8, uRes.x / uRes.y));   // a longer lens on a wide screen, so the pool fills it
  vec3 rd = normalize(fw * lens + rt * p.x + cross(fw, rt) * p.y);
  gFar = normalize(vec3(fw.x, 0.0, fw.z));
  gSide = rt;

  vec3 col;
  float t = marchFluid(ro, rd);
  if (t > 0.0) {
    col = shadeFluid(ro + rd * t, rd);
  } else if (rd.y < 0.0) {
    // the table: black acrylic, a faint mirror of the studio and of the pool itself
    float tt = (ro.y + 0.01) / -rd.y;
    vec3 hp = ro + rd * tt;
    vec3 r = vec3(rd.x, -rd.y, rd.z);
    float fres = 0.04 + 0.96 * pow(1.0 + rd.y, 5.0);
    float t2 = marchFluid(hp, r);
    vec3 seen = t2 > 0.0 ? shadeFluid(hp + r * t2, r) : studio(r);
    float foot = 1.0 - 0.6 * exp(-max(length(hp.xz) - R, 0.0) * 9.0);   // the pool shades the table at its edge
    col = seen * fres * foot * 1.3 + vec3(0.004, 0.004, 0.005);
    col *= exp(-max(tt - 3.2, 0.0) * 0.5);                               // and the table runs off into the dark
  } else {
    col = vec3(0.004, 0.004, 0.006) + pal(0.6) * 0.015 * ss(0.2, 1.0, p.y);
  }
  col *= 1.0 - 0.35 * ss(0.8, 2.0, length(p));
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'ferro',
  name: 'Ferro',
  group: 'Things',
  blurb: 'Black ferrofluid over a magnet that is the bass: spikes stand up on the kick and sink between',
  tags: ['science', '3d', 'intense', 'abstract'],
  energy: 0.7,
  particles: 0,
  trails: 0.0,
  zoom: 1,
  spin: 0,
  frag,
};
