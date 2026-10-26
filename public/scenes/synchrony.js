// SYNCHRONY — fireflies over a summer meadow, learning the beat.
//
// In a few valleys of the Smoky Mountains one firefly species does something famous: thousands of
// them flash in unison. Each insect keeps its own clock but nudges it toward the flashes it sees,
// and once enough of them are doing it the whole field locks together — the textbook case of
// coupled oscillators (Kuramoto's model). Here the kick is the flash they lock onto and the
// music's slow energy is the coupling. In a quiet passage every firefly blinks on its own clock
// and the meadow twinkles at random; as the song builds they are pulled onto the beat one by one,
// each at its own threshold, until the field flashes as one and the mist lights up with it. When
// the song falls back they drift apart again.
//
// They fly the way the real ones do: drifting, and rising in a short stroke while the lantern is
// lit. The ones close to the lens are out of focus and drawn as discs. The picture shader draws
// the night around them — stars, a tree line, mist lying on the meadow, grass in front of the lens
// — and lights the mist and the grass tips whenever the whole field flashes together.
const common = `
const float FOCAL = 1.35;

vec3 camPos() { return vec3(sin(uTime * 0.031) * 0.35, 0.72, sin(uTime * 0.023) * 0.2); }
mat3 camBasis(vec3 ro) {
  vec3 fw = normalize(vec3(sin(uTime * 0.02) * 0.6, 1.05, 10.0) - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  return mat3(rt, cross(fw, rt), fw);
}
// How strongly the field is coupled to the beat right now: the music's slow energy.
float coupling() { return ss(0.16, 0.58, uEnergy); }
// The flash they lock onto; "reduce flashing" softens it but cannot switch the story off.
float beatFlash() { return exp(-uBeatAge * 7.5) * max(uPunch, 0.35); }
const vec3 LANTERN = vec3(0.70, 1.0, 0.24);
`;

const frag = `${common}
// Elevation of the tree line above the horizon, by direction: rolling crowns with pines standing out.
float treeTop(float az) {
  float crowns = 0.055 + 0.05 * fbm(vec2(az * 3.0, 1.3)) + 0.02 * noise(vec2(az * 22.0, 4.0));
  float pa = az * 26.0;
  float pine = (0.03 + 0.07 * hash11(floor(pa))) * max(1.0 - abs(fract(pa) - 0.5) * 2.4, 0.0) * step(0.55, hash11(floor(pa) + 9.0));
  return crowns + pine;
}

vec3 sky(vec3 rd) {
  float up = max(rd.y, 0.0);
  vec3 col = mix(vec3(0.028, 0.040, 0.075), vec3(0.004, 0.006, 0.020), ss(0.0, 0.6, up));
  vec2 g = vec2(atan(rd.x, rd.z), rd.y) * 150.0;
  vec2 c = floor(g);
  float h = hash21(c);
  vec2 f = fract(g) - 0.5 - (vec2(hash21(c + 1.7), hash21(c + 5.1)) - 0.5) * 0.7;
  col += vec3(0.85, 0.9, 1.0) * step(0.972, h) * (0.0012 / (dot(f, f) + 0.002)) * (0.5 + 0.5 * sin(uTime * (1.0 + h * 3.0) + h * 50.0)) * ss(0.05, 0.3, up) * (0.6 + 0.6 * uHigh);
  // the summer Milky Way, a faint torn band across the sky
  vec2 mw = vec2(atan(rd.x, rd.z) * 0.8 + rd.y * 1.3, rd.y - atan(rd.x, rd.z) * 0.35 - 0.35);
  float band = exp(-mw.y * mw.y * 18.0) * (0.4 + 0.6 * fbm(mw * vec2(6.0, 14.0)));
  col += vec3(0.08, 0.09, 0.13) * band * ss(0.05, 0.35, up);
  // a low moon behind thin cloud
  vec3 md = normalize(vec3(-0.55, 0.28, 1.0));
  float ang = acos(clamp(dot(rd, md), -1.0, 1.0));
  col += vec3(1.0, 0.96, 0.88) * (1.0 - ss(0.020, 0.023, ang)) * 1.2 + vec3(0.55, 0.62, 0.8) * exp(-ang * 7.0) * 0.08;
  return col;
}

// Grass in front of the lens: tapered blades from the bottom edge, leaning with the bass.
float blades(vec2 p, float density, float tall, float seed, out float tip) {
  float cover = 0.0;
  tip = 0.0;
  float cell = floor(p.x * density);
  for (int k = -2; k <= 2; k++) {
    float id = cell + float(k);
    float h1 = hash11(id * 1.37 + seed), h2 = hash11(id * 2.11 + seed * 1.7);
    float hgt = tall * (0.45 + 0.7 * h1);
    float y = (p.y + 1.0) / hgt;                                   // 0 at the root, 1 at the tip
    if (y < 0.0 || y > 1.0) continue;
    float lean = (h2 - 0.5) * 0.35 + (0.08 + 0.10 * uBass) * sin(uTime * (1.1 + h1) + id * 0.7);
    float x = (id + 0.5) / density + lean * hgt * y * y;
    float w = (0.45 / density) * (1.0 - y) * (0.6 + 0.6 * h2) + 0.0008;
    float inside = 1.0 - ss(w * 0.7, w, abs(p.x - x));
    cover = max(cover, inside);
    tip = max(tip, inside * ss(0.6, 1.0, y));
  }
  return cover;
}

void main() {
  vec2 p = centered();
  vec3 ro = camPos();
  mat3 B = camBasis(ro);
  vec3 rd = normalize(B * vec3(p, FOCAL));
  float G = coupling() * beatFlash();                                   // the whole field flashing together
  vec3 glow = LANTERN * G;
  vec3 fogCol = vec3(0.020, 0.030, 0.045) + glow * 0.10;
  vec3 col;
  float az = atan(rd.x, rd.z);
  if (rd.y > treeTop(az)) {
    col = sky(rd);
  } else if (rd.y > 0.0) {
    // the tree line at the meadow's far edge, rim-lit by the moon, touched by the field's flash
    col = vec3(0.006, 0.009, 0.010) + vec3(0.04, 0.05, 0.07) * ss(-0.012, 0.0, rd.y - treeTop(az)) + glow * 0.035;
    col = mix(col, fogCol, 0.35);
  } else {
    float t = ro.y / -rd.y;
    vec3 hp = ro + rd * t;
    float grass = 0.5 + 0.5 * noise(hp.xz * vec2(9.0, 3.0));
    col = vec3(0.008, 0.016, 0.010) * (0.6 + 0.8 * grass);
    // mist lying on the meadow, lit from inside when they all flash
    float mist = ss(0.30, 0.75, fbm(hp.xz * 0.22 + vec2(uTime * 0.02, 0.0))) * ss(45.0, 5.0, t);
    col = mix(col, fogCol * 2.6 + vec3(0.02, 0.03, 0.04) + glow * 0.35, mist * 0.75);
    col = mix(col, fogCol, 1.0 - exp(-t * 0.035));
  }
  col += (glow * 0.08 + vec3(0.010, 0.014, 0.020)) * exp(-abs(rd.y) * 7.0);                          // the flash hangs in the air low over the grass

  // grass right in front of the lens, two rows, its tips catching the flash
  float tip1, tip2;
  float far = blades(p, 34.0, 0.42, 3.0, tip1);
  col = mix(col, vec3(0.006, 0.012, 0.008) + glow * 0.08 * tip1, far);
  float near = blades(p * 0.8, 16.0, 0.34, 11.0, tip2);
  col = mix(col, vec3(0.002, 0.005, 0.003) + glow * 0.12 * tip2, near);
  outColor = vec4(col, 1.0);
}`;

const vert = `${common}
void main() {
  float i = float(gl_VertexID);
  float h1 = hash11(i * 1.17 + 0.3), h2 = hash11(i * 2.31 + 1.7), h3 = hash11(i * 3.77 + 2.9), h4 = hash11(i * 5.13 + 4.1);
  float h5 = hash11(i * 7.29 + 5.5), h6 = hash11(i * 11.3 + 6.6), h7 = hash11(i * 13.7 + 7.7);
  float t = uTime;
  // most of them low over the grass, a few higher up, the meadow running away from us
  vec3 p = vec3((h1 * 2.0 - 1.0) * (2.0 + h2 * 9.0), 0.10 + 1.7 * h3 * h3, 2.3 + h2 * 17.0);
  p += vec3(sin(t * 0.11 * (1.0 + h4) + i) * 0.7, sin(t * 0.19 * (1.0 + h5) + i * 1.7) * 0.22, cos(t * 0.09 * (1.0 + h6) + i * 2.3) * 0.6);

  // its own clock, and the beat's: which one it follows depends on how coupled the field is
  float period = 0.9 + 1.2 * h5;
  float ph = fract(t / period + h6);
  float own = exp(-ph * 16.0) + 0.45 * exp(-abs(ph - 0.11) * 45.0) * step(0.65, h4);   // some flash twice
  float k = ss(h7 * 0.7, h7 * 0.7 + 0.3, coupling());
  float lit = mix(own, beatFlash(), k);
  float since = mix(ph * period, uBeatAge, k);                        // time since its lantern came on
  p.y += 0.11 * sin(PI * clamp(since / 0.7, 0.0, 1.0));             // the stroke: it climbs while lit

  vec3 ro = camPos();
  vec3 q = transpose(camBasis(ro)) * (p - ro);
  if (q.z < 0.3) return;
  vec2 s = q.xy / q.z * FOCAL;
  gl_Position = vec4(s.x * uRes.y / uRes.x, s.y, 0.0, 1.0);
  float blur = ss(4.2, 1.5, q.z);                                     // near the lens: out of focus
  gl_PointSize = clamp((7.0 + 90.0 * blur / q.z) * uPointScale * (0.85 + 0.5 * lit), 1.0, uPointMax);
  vShape = blur;
  float spread = mix(1.0, 0.10, blur);                                // a big disc spreads the same light thin
  vec3 c = mix(LANTERN, pal(0.3), 0.12);
  vColor = vec4(c, (0.025 + 2.1 * lit) * spread * exp(-q.z * 0.018));
}`;

export default {
  id: 'synchrony',
  name: 'Synchrony',
  group: 'Vibe',
  blurb: 'Fireflies that fall into step: the louder the song, the more of them flash on the beat',
  tags: ['nature', 'night', 'calm', 'science', 'light'],
  energy: 0.35,
  particles: 0,
  trails: 0.3,
  zoom: 1,
  spin: 0,
  frag,
  points: { count: 800, vert },
};
