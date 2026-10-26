// DRONES — a light show over the harbour: nine hundred drones drawing in the night sky.
//
// A real drone show is a swarm of lit quadcopters flying planned paths from one picture to the
// next. Here the pictures come from the music. Every eight beats — a phrase — the fleet takes off
// for a new formation: the live analyser, a turning globe, a heart that beats with the kick, a
// ringed planet whose rings are bands, a trefoil knot, a spiral galaxy, a ribbon waving, and the
// a loudspeaker cone that the kicks push out ring by ring. The flight takes the phrase's first three
// beats and each drone leaves a moment after its neighbour, so the swarm unfolds instead of
// jumping; in between, every formation keeps moving with the song, and on each beat a few drones
// sparkle white.
//
// The drones are this scene's own points: each is placed once per frame by the vertex shader, not
// searched for by every pixel. Each has three twins under the waterline — its reflection, drawn
// as soft discs stepping down the water so it reads as a streak broken by the swell. The picture
// shader draws only the world around them: stars, the far shore, and water that reflects both.
const common = `
const float N = 900.0;
const float FOCAL = 1.25;
const vec3 CENTRE = vec3(0.0, 1.22, 0.0);
const float SCALE = 1.12;       // formations are drawn in units of this

vec3 camPos() {
  float a = sin(uTime * 0.045) * 0.30 + uBalance * 0.05;
  return vec3(sin(a) * 3.0, 0.20, -cos(a) * 3.0);
}
mat3 camBasis(vec3 ro) {
  vec3 fw = normalize(vec3(0.0, 0.95, 0.0) - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  return mat3(rt, cross(fw, rt), fw);
}
`;

const frag = `${common}
// The far shore: a band of towers standing on the plane z = 11, lit windows, red lamps on the tall ones.
vec3 skyline(vec3 ro, vec3 rd, out float solid) {
  solid = 0.0;
  if (rd.z <= 0.0) return vec3(0.0);
  float t = (11.0 - ro.z) / rd.z;
  vec3 h = ro + rd * t;
  float cell = floor(h.x * 1.7);
  float r1 = hash11(cell * 1.31 + 4.0), r2 = hash11(cell * 2.77 + 9.0);
  float tall = 0.25 + 0.60 * r1 * r1 + step(0.93, r2) * 0.75;
  float fx = fract(h.x * 1.7);
  if (h.y > tall || fx > 0.9 || h.y < 0.0) return vec3(0.0);
  solid = 1.0;
  vec2 w = vec2(fx * 7.0, h.y * 26.0);
  float lit = step(0.62, hash21(floor(w) + cell * 17.0)) * step(0.25, fract(w.x)) * step(0.3, fract(w.y));
  vec3 warm = mix(vec3(1.0, 0.72, 0.38), vec3(0.85, 0.9, 1.0), step(0.7, hash21(floor(w) + 3.0)));
  vec3 col = vec3(0.010, 0.012, 0.020) + warm * lit * (0.30 + 0.35 * spec(0.05 + r2 * 0.7));
  vec2 lamp = vec2((fx - 0.45) / 1.7, h.y - tall - 0.012);
  col += vec3(1.0, 0.1, 0.06) * step(0.72, r1) * (0.00004 / (dot(lamp, lamp) + 0.00002)) * step(0.5, fract(uTime * 0.5 + r2));
  return col;
}

vec3 sky(vec3 ro, vec3 rd) {
  float up = max(rd.y, 0.0);
  vec3 col = mix(vec3(0.030, 0.040, 0.085), vec3(0.002, 0.003, 0.012), ss(0.0, 0.55, up));
  col += pal(0.62) * 0.05 * exp(-up * 9.0);                                   // the city's glow low in the haze
  vec2 g = vec2(atan(rd.x, rd.z), rd.y) * 140.0;
  vec2 c = floor(g);
  float h = hash21(c);
  vec2 f = fract(g) - 0.5 - (vec2(hash21(c + 1.7), hash21(c + 5.1)) - 0.5) * 0.7;
  col += vec3(0.85, 0.9, 1.0) * step(0.975, h) * (0.0015 / (dot(f, f) + 0.002)) * (0.5 + 0.5 * sin(uTime * (1.0 + h * 3.0) + h * 50.0)) * ss(0.02, 0.2, up);
  // the show lights the haze around it
  vec3 toShow = normalize(CENTRE - ro);
  float k = max(dot(rd, toShow), 0.0);
  col += (pal(0.55) * 0.6 + vec3(0.2)) * pow(k, 60.0) * 0.10 * (0.4 + uLevel);
  float solid;
  vec3 town = skyline(ro, rd, solid);
  return mix(col, town, solid);
}

// The swell: ridges long across the view, so reflected lights stretch into streaks toward us.
float swell(vec2 w) {
  return noise(w * vec2(1.1, 5.5) + vec2(uTime * 0.25, uTime * 0.7)) * 0.6
       + noise(w * vec2(2.9, 13.0) - vec2(uTime * 0.4, uTime * 1.1)) * 0.3;
}

void main() {
  vec2 p = centered();
  vec3 ro = camPos();
  mat3 B = camBasis(ro);
  vec3 rd = normalize(B * vec3(p, FOCAL));
  vec3 col;
  if (rd.y >= 0.0) {
    col = sky(ro, rd);
  } else {
    float t = -ro.y / rd.y;
    vec3 hp = ro + rd * t;
    float e = 0.03;
    float h0 = swell(hp.xz);
    float amp = 0.10 + 0.10 * uBass;
    vec3 n = normalize(vec3((h0 - swell(hp.xz + vec2(e, 0.0))) * amp, e, (h0 - swell(hp.xz + vec2(0.0, e))) * amp));
    n = normalize(mix(n, vec3(0.0, 1.0, 0.0), ss(8.0, 40.0, t)));             // far water lies flat
    vec3 rf = reflect(rd, n);
    rf.y = abs(rf.y);
    float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
    col = vec3(0.003, 0.006, 0.014) + sky(hp, rf) * (0.35 + 0.65 * fres);
    col = mix(col, sky(ro, normalize(vec3(rd.x, 0.001, rd.z))) * 0.6, ss(20.0, 60.0, t));
  }
  outColor = vec4(col, 1.0);
}`;

const vert = `${common}
// A heart in polar form, the notch at the origin and the tip four units below it.
float heartR(float a) {
  float s = sin(a);
  return 2.0 - 2.0 * s + s * sqrt(abs(cos(a))) / (s + 1.4);
}

// Where drone i stands in formation k, relative to the centre of the show, and what colour it shows.
vec3 formation(float k, float i, out vec3 col) {
  float t = uTime;
  float f = mod(k, 8.0);
  vec3 p;
  if (f < 0.5) {
    // the analyser: 45 columns of 20 drones, each column squeezed to its band's height, a white one on top
    float c = floor(i / 20.0), r = mod(i, 20.0);
    float x = c / 44.0;
    float h = 0.15 + 1.55 * spec(0.02 + x * 0.78);
    p = vec3((x * 2.0 - 1.0) * 2.2, -0.85 + r / 19.0 * h, 0.22 * sin(x * 6.0 + t * 0.5));
    col = r > 18.5 ? vec3(1.0, 0.97, 0.9) : pal(0.08 + r / 19.0 * 0.45 + x * 0.15);
  } else if (f < 1.5) {
    // a globe of drones on a golden-angle spiral; latitudes lit by bands, a meridian of light going round
    float y = 1.0 - (i + 0.5) / N * 2.0;
    float rr = sqrt(max(1.0 - y * y, 0.0));
    float th = i * 2.3999632 + t * 0.30;
    float R = 0.80 * (1.0 + 0.10 * uBass + 0.07 * exp(-uBeatAge * 5.0) * uPunch);
    p = vec3(cos(th) * rr, y, sin(th) * rr) * R;
    float merid = mod(th - t * 1.1, TAU) - PI;
    col = pal(0.50 + y * 0.22) * (0.30 + 1.1 * spec(0.03 + abs(y) * 0.75)) + vec3(1.0) * exp(-merid * merid * 5.0) * 0.8;
  } else if (f < 2.5) {
    // a heart that beats lub-dub with the kick: a bright outline round a rosy fill, and each beat
    // sends a pulse of light out from its middle. The fill is placed by rejection: a drone tries
    // spots until one falls inside the curve, so the heart is evenly full with no seams.
    float lub = exp(-uBeatAge * 8.0) + 0.6 * exp(-max(uBeatAge - 0.2, 0.0) * 9.0) * step(0.2, uBeatAge);
    float s = 0.34 * (1.0 + 0.09 * lub * uPunch + 0.05 * uBass);
    vec2 q = vec2(0.0, -1.7);
    bool rim = i < 300.0;
    if (rim) {
      float a = i / 300.0 * TAU;
      q = vec2(cos(a), sin(a)) * heartR(a);
    } else {
      for (int k = 0; k < 16; k++) {
        vec2 c = vec2(hash11(i * 1.13 + float(k) * 7.1) * 4.2 - 2.1, hash11(i * 2.71 + float(k) * 3.3) * 4.7 - 4.05);
        if (length(c) < heartR(atan(c.y, c.x)) * 0.93) { q = c; break; }
      }
    }
    float pulse = exp(-abs(length(q + vec2(0.0, 1.7)) - uBeatAge * 7.0) * 1.5) * exp(-uBeatAge * 1.8) * uPunch;
    p = vec3(q.x, q.y + 1.7, 0.0) * s;
    p.xz = rot(sin(t * 0.35) * 0.45) * p.xz;
    vec3 rose = mix(vec3(1.0, 0.16, 0.32), pal(0.95), 0.3);
    col = rim ? mix(rose, vec3(1.0, 0.9, 0.92), 0.45) * 1.3 : rose * (0.45 + 1.2 * pulse);
  } else if (f < 3.5) {
    // a ringed planet: the globe takes 380 drones, five rings the rest, each ring on its own band
    if (i < 380.0) {
      float y = 1.0 - (i + 0.5) / 380.0 * 2.0;
      float rr = sqrt(max(1.0 - y * y, 0.0));
      float th = i * 2.3999632 + t * 0.2;
      p = vec3(cos(th) * rr, y, sin(th) * rr) * 0.50;
      col = pal(0.08 + 0.12 * sin(y * 9.0)) * 0.9;
    } else {
      float j = i - 380.0;
      float ring = floor(j / 104.0);
      float a = mod(j, 104.0) / 104.0 * TAU + t * (0.45 - ring * 0.05);
      float rad = 0.72 + ring * 0.13;
      p = vec3(cos(a) * rad, 0.0, sin(a) * rad);
      col = pal(0.55 + ring * 0.07) * (0.25 + 1.3 * spec(0.05 + ring / 5.0 * 0.7));
    }
    p.yz = rot(0.42) * p.yz;
    p.xy = rot(0.18) * p.xy;
  } else if (f < 4.5) {
    // a trefoil knot: a tube six drones round, following the curve, turning
    float s = floor(i / 6.0) / 150.0 * TAU, m = mod(i, 6.0) / 6.0 * TAU;
    vec3 c = vec3(sin(s) + 2.0 * sin(2.0 * s), cos(s) - 2.0 * cos(2.0 * s), -sin(3.0 * s)) * 0.28;
    vec3 tg = normalize(vec3(cos(s) + 4.0 * cos(2.0 * s), -sin(s) + 4.0 * sin(2.0 * s), -3.0 * cos(3.0 * s)));
    vec3 nrm = normalize(cross(tg, vec3(0.0, 0.0, 1.0)) + 1e-4);
    p = c + (nrm * cos(m) + cross(tg, nrm) * sin(m)) * (0.06 + 0.04 * uBass);
    p.xz = rot(t * 0.4) * p.xz;
    p.yz = rot(0.35) * p.yz;
    col = pal(s / TAU + t * 0.03) * (0.6 + 0.8 * spec(0.03 + s / TAU * 0.7));
  } else if (f < 5.5) {
    // a spiral galaxy, tilted toward us and turning; the arms swell with the mids
    float u = i / N;
    float r = 0.06 + 1.25 * pow(u, 0.7);
    float a = mod(i, 2.0) * PI + log(r + 0.05) * 2.4 - t * 0.25 + (hash11(i * 3.7) - 0.5) * (0.35 + 0.3 * uMid);
    p = vec3(cos(a) * r, (hash11(i * 5.3) - 0.5) * 0.10 * (1.2 - r), sin(a) * r);
    p.yz = rot(-0.95) * p.yz;
    col = mix(vec3(1.0, 0.85, 0.6), pal(0.6 + r * 0.25), ss(0.05, 0.45, r)) * (0.5 + 1.0 * spec(0.05 + r * 0.5));
  } else if (f < 6.5) {
    // a ribbon: three strands waving like a flag, each stretch swelling with its band
    float strand = floor(i / 300.0), j = mod(i, 300.0) / 299.0;
    float x = (j * 2.0 - 1.0) * 2.3;
    float band = spec(0.03 + j * 0.75);
    float y = 0.40 * sin(x * 1.8 - t * 1.6 + strand * 0.35) * (0.35 + band) + (strand - 1.0) * 0.09;
    p = vec3(x, y, 0.35 * sin(x * 1.1 + t * 0.9) + (strand - 1.0) * 0.06);
    col = pal(j * 0.6 + strand * 0.1 + t * 0.02) * (0.5 + band);
  } else {
    // a loudspeaker in the sky: thirty rings, and each ring outward shows a moment further back,
    // so every kick pushes the cone toward us at the middle and the push rolls out to the rim
    float ring = floor(i / 30.0), j = mod(i, 30.0);
    float age = ring / 29.0 * 0.5;
    float h = hist(0.035, age) * 0.85 + hist(0.25, age) * 0.25;
    float rad = 0.10 + ring / 29.0 * 1.05;
    float a = (j + mod(ring, 2.0) * 0.5) / 30.0 * TAU + t * 0.12;      // alternate rings sit between each other
    p = vec3(cos(a) * rad, sin(a) * rad, -h * 0.55);
    p.xz = rot(sin(t * 0.3) * 0.35) * p.xz;
    col = pal(0.08 + ring / 29.0 * 0.55) * (0.22 + 1.5 * h);
  }
  return p;
}

void main() {
  float id = float(gl_VertexID);
  float copy = floor(id / N);          // 0: the drone · 1–3: its reflection, stepping down the water
  float i = mod(id, N);

  // the phrase: which formation, and how far the flight to it has come
  float phrase = floor(uBeatCount / 8.0);
  float fly = uBeatCount < 0.5 ? 1.0 : clamp((mod(uBeatCount, 8.0) + clamp(uBeatAge / 0.5, 0.0, 1.0)) / 3.0, 0.0, 1.0);
  float delay = hash11(i * 0.618 + 3.1) * 0.35;
  float e = ss(delay, delay + 0.6, fly);
  vec3 ca, cb;
  vec3 a = formation(phrase - 1.0, i, ca);
  vec3 b = formation(phrase, i, cb);
  vec3 p = CENTRE + mix(a, b, e) * SCALE;
  p.y += sin(PI * e) * (0.25 + 0.4 * hash11(i * 1.3));        // they climb out of one picture and settle into the next
  p += vec3(sin(uTime * (1.3 + hash11(i)) + i), sin(uTime * (1.1 + hash11(i * 7.0)) + i * 1.7), 0.0) * 0.004;   // hovering
  vec3 col = mix(ca, cb, e);

  float sparkle = exp(-uBeatAge * 6.0) * uPunch * step(0.82, hash11(i * 3.3 + uBeatCount * 7.1));
  col = mix(col, vec3(1.0), sparkle * 0.8);
  float bright = (0.80 + 0.30 * uLevel) * (1.0 + 1.5 * sparkle);

  if (copy > 0.5) {
    p.y = -p.y - (copy - 1.0) * (0.035 + 0.03 * uMid);
    p.x += 0.012 * sin(p.y * 16.0 + uTime * 1.9 + i + copy);
  }
  vec3 ro = camPos();
  vec3 q = transpose(camBasis(ro)) * (p - ro);
  if (q.z < 0.2) return;
  vec2 s = q.xy / q.z * FOCAL;
  gl_Position = vec4(s.x * uRes.y / uRes.x, s.y, 0.0, 1.0);
  float size = (7.0 + 3.0 * sparkle) * uPointScale * 3.0 / q.z;
  if (copy > 0.5) {
    gl_PointSize = clamp(size * 1.15, 1.0, uPointMax);
    vColor = vec4(col, bright * (0.12 - (copy - 1.0) * 0.035));
    vShape = 0.6;
  } else {
    gl_PointSize = clamp(size, 1.0, uPointMax);
    vColor = vec4(col, bright);
  }
}`;

export default {
  id: 'drones',
  name: 'Drones',
  group: 'Show',
  blurb: 'A drone light show over the harbour; every eight beats the swarm flies to a new picture',
  tags: ['night', 'city', 'water', 'analyser', '3d'],
  energy: 0.6,
  particles: 0,
  trails: 0.5,
  zoom: 1,
  spin: 0,
  frag,
  points: { count: 3600, vert },
};
